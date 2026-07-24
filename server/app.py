


"""
Payit Backend — real-app-level UPI payment server with INLINE fraud detection.
=============================================================================
FastAPI + PostgreSQL (DATABASE_URL). Mirrors how a real PSP/bank backend works:

  auth (login) -> device binding -> VPA resolution -> balance check ->
  FRAUD ENGINE (model + rules + graph, <200ms) -> 3-tier decision:
     SAFE   -> atomic debit+credit (money moves), status success
     REVIEW -> hold + OTP step-up, complete only after OTP
     BLOCK  -> reject, money does NOT move, reasons logged

Real accounts come from PostgreSQL (seeded by db/build_db.py). The fraud brain is
our ml/ engine. This is the "backend" the frontend talks to.

Run:  .venv/bin/python -m uvicorn server.app:app --host 127.0.0.1 --port 8000 --reload
Docs: http://127.0.0.1:8000/docs
"""
from __future__ import annotations
import time
import random
import secrets
import base64
import urllib.parse
import urllib.request
import json
import hashlib
import traceback
import hmac
import os
import re
from pathlib import Path
from datetime import datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError, VerificationError

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from dotenv import load_dotenv
load_dotenv()          # read .env (DATABASE_URL, PAYIT_PIN_PEPPER) — never commit it

from ml.score import FraudEngine

ROOT = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------- PIN security
# NOTE ON HONESTY: in real UPI the UPI-PIN never reaches the app at all — NPCI
# mandates the Common Library, which captures + PKI-encrypts the PIN on-device,
# and the PIN is on NPCI's must-not-store list (a TPAP never holds the MPIN).
# So this is a *simulated app PIN*, not a UPI PIN. We store it the way a
# password should be stored, and we do NOT claim this is "how UPI does it".
#
# A 4-6 digit PIN is only a 10k-1M keyspace, so the KDF alone can never make it
# safe — the real control is the attempt lockout (see _pin_fails). Argon2id buys
# time; the pepper makes a stolen DB dump alone useless.
_ph = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)  # OWASP min: 19 MiB, t=2, p=1

# Pepper = server-side secret mixed in BEFORE the KDF, kept OUTSIDE the database.
PIN_PEPPER = os.environ.get("PAYIT_PIN_PEPPER", "dev-only-pepper-set-PAYIT_PIN_PEPPER-in-prod")

# No SMS gateway is wired, and every OTP path must say so rather than claim a
# delivery that never happened. Sending an OTP to an Indian number requires TRAI
# DLT registration of the sender + template, which requires a registered business
# — genuinely out of reach here, so we state the constraint instead of faking it.
SMS_DISCLAIMER = ("Sending SMS in India needs TRAI DLT registration (requires a "
                  "registered business), so this demo shows the code instead.")

# Real UPI velocity limits (NPCI defaults for a normal P2P account). Some
# categories (capital markets, insurance, education, medical) are allowed higher
# per-txn ceilings, but the default account limits are ₹1 lakh/day and 20
# transactions/day — enforced here as a hard control, the way a real PSP does.
UPI_PER_TXN_CAP = 100_000        # ₹1,00,000 max in a single transfer (default)
UPI_DAILY_AMOUNT_CAP = 100_000   # ₹1,00,000 total outgoing per 24h
UPI_DAILY_COUNT_CAP = 20         # 20 outgoing transfers per 24h


def send_sms_otp(phone_number: str, otp_code: str, context: str = "verification") -> dict:
    """
    Sends SMS OTP via Twilio or Fast2SMS if API credentials exist in environment variables.
    Falls back gracefully to server log / demo mode if no SMS gateway credentials are configured.
    """
    clean_phone = "".join(ch for ch in str(phone_number) if ch.isdigit()) if phone_number else ""
    if not clean_phone:
        return {"delivered": False, "provider": "none", "otp_demo": otp_code}

    if len(clean_phone) == 10:
        full_phone = "+91" + clean_phone
    elif not str(phone_number).startswith("+"):
        full_phone = "+" + clean_phone
    else:
        full_phone = str(phone_number)

    twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    twilio_token = os.environ.get("TWILIO_AUTH_TOKEN")
    twilio_from = os.environ.get("TWILIO_PHONE_NUMBER")
    fast2sms_key = os.environ.get("FAST2SMS_API_KEY")

    message_body = f"Your PayIt OTP for {context} is {otp_code}. Valid for 5 minutes. Do not share this code."

    # 1. Twilio SMS Integration
    if twilio_sid and twilio_token and twilio_from:
        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Messages.json"
            post_data = urllib.parse.urlencode({
                "To": full_phone,
                "From": twilio_from,
                "Body": message_body
            }).encode('utf-8')

            req = urllib.request.Request(url, data=post_data, method="POST")
            auth_header = base64.b64encode(f"{twilio_sid}:{twilio_token}".encode()).decode()
            req.add_header("Authorization", f"Basic {auth_header}")

            with urllib.request.urlopen(req, timeout=8) as resp:
                if resp.status in (200, 201):
                    print(f"[SMS SENT - TWILIO] Delivered OTP to {full_phone}")
                    return {"delivered": True, "provider": "twilio", "otp_demo": otp_code}
        except Exception as err:
            print(f"[SMS TWILIO ERROR] Could not send SMS to {full_phone}: {err}")

    # 2. Fast2SMS Integration (popular Indian SMS API)
    if fast2sms_key:
        try:
            url = "https://www.fast2sms.com/dev/bulkV2"
            payload = json.dumps({
                "route": "otp",
                "variables_values": otp_code,
                "numbers": clean_phone[-10:]
            }).encode('utf-8')
            req = urllib.request.Request(url, data=payload, method="POST")
            req.add_header("authorization", fast2sms_key)
            req.add_header("Content-Type", "application/json")

            with urllib.request.urlopen(req, timeout=8) as resp:
                if resp.status == 200:
                    print(f"[SMS SENT - FAST2SMS] Delivered OTP to {clean_phone[-10:]}")
                    return {"delivered": True, "provider": "fast2sms", "otp_demo": otp_code}
        except Exception as err:
            print(f"[SMS FAST2SMS ERROR] Could not send SMS to {clean_phone[-10:]}: {err}")

    # 3. Fallback: Demo / Dev Mode (Log code to server terminal)
    print(f"[OTP CHALLENGE ({context})] phone={full_phone} → OTP: {otp_code} (No SMS API credentials in .env - Demo mode)")
    return {"delivered": False, "provider": "demo", "otp_demo": otp_code}


def _peppered(pin: str) -> str:
    """HMAC the PIN with the server pepper so the DB never sees the raw PIN."""
    return hmac.new(PIN_PEPPER.encode(), pin.encode(), hashlib.sha256).hexdigest()


def hash_pin(pin: str) -> str:
    """Argon2id hash of the peppered PIN. Use for every new/changed PIN."""
    return _ph.hash(_peppered(pin))


def verify_pin(pin: str, stored: str) -> bool:
    """Constant-time verify. Accepts legacy unsalted-sha256 hashes so existing
    demo accounts keep working; those get upgraded on next successful use."""
    if not pin or not stored:
        return False
    if not stored.startswith("$argon2"):          # legacy sha256 (pre-Argon2)
        return hmac.compare_digest(hashlib.sha256(pin.encode()).hexdigest(), stored)
    try:
        return _ph.verify(stored, _peppered(pin))
    except (VerifyMismatchError, InvalidHashError, VerificationError):
        return False


def pin_needs_rehash(stored: str) -> bool:
    """True for legacy sha256 hashes, or Argon2 hashes below current params."""
    if not stored:
        return False
    if not stored.startswith("$argon2"):
        return True
    try:
        return _ph.check_needs_rehash(stored)
    except Exception:
        return False


app = FastAPI(title="Payit Backend", version="1.0")

import os
# 5173/5174 = customer app (vite), 5180 = auth-lab, 5190 = the BANK's own console
# (a separate operator-facing UI, because the bank is a separate authority).
ALLOWED_ORIGINS = ["*"]
app.add_middleware(CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"])

engine: FraudEngine | None = None

# ---- fraud engine as a SEPARATE service (real UPI: fraud scoring is not in the
# payment server, it is the PSP's / NPCI's own service, reached over the network) ----
import urllib.request as _urlreq
import urllib.error as _urlerr
FRAUD_URL = os.getenv("FRAUD_URL", "http://127.0.0.1:8002")


def _fraud_call(path: str, feats: dict):
    body = json.dumps({"feats": feats}).encode()
    r = _urlreq.Request(FRAUD_URL + path, method="POST", data=body,
                        headers={"Content-Type": "application/json"})
    with _urlreq.urlopen(r, timeout=5) as x:
        return json.loads(x.read())


def fraud_score(feats: dict) -> dict:
    """Score a transaction via the fraud service. Falls back to the in-process
    engine only if the service is unreachable, so a demo never hard-stops — but the
    real path is the network call, and we log when the fallback is used."""
    try:
        return _fraud_call("/score", feats)
    except Exception as e:                              # any failure -> local fallback
        print(f"[FRAUD SERVICE DOWN] {type(e).__name__}: {e} — using in-process fallback")
        return engine.score(feats, observe=False)


def fraud_observe(feats: dict) -> None:
    """Tell the fraud service to record the committed edge in its mule graph."""
    try:
        _fraud_call("/observe", feats)
    except Exception:
        if engine is not None:
            engine.observe(feats)                       # local fallback, NOT recursion


# ------------------------------------------------------------------ DB helpers
import psycopg2
import psycopg2.extras

class PostgresCursorWrapper:
    def __init__(self, pg_cursor):
        self.cur = pg_cursor

    def execute(self, sql, params=None):
        is_insert = False
        if sql:
            sql = sql.replace('?', '%s')
            upper = sql.strip().upper()
            is_insert = upper.startswith("INSERT")
            if is_insert and "RETURNING" not in upper and "ON CONFLICT" not in upper and "SELECT" not in upper:
                sql = sql.rstrip().rstrip(';') + " RETURNING id"
        self.cur.execute(sql, params)
        if is_insert:
            try:
                row = self.cur.fetchone()
                if row:
                    self._lastrowid = list(row.values())[0]
            except Exception:
                pass
        return self

    def fetchone(self):
        row = self.cur.fetchone()
        if row is None:
            return None
        return dict(row)

    def fetchall(self):
        rows = self.cur.fetchall()
        return [dict(r) for r in rows]

    @property
    def rowcount(self):
        """Rows touched by the last statement — used by /pay's conditional debit."""
        return self.cur.rowcount

    @property
    def lastrowid(self):
        return getattr(self, '_lastrowid', None)

class PostgresConnectionWrapper:
    def __init__(self, pg_conn):
        self.conn = pg_conn

    def cursor(self):
        return PostgresCursorWrapper(self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor))

    def execute(self, sql, params=None):
        is_insert = False
        if sql:
            sql = sql.replace('?', '%s')
            upper = sql.strip().upper()
            is_insert = upper.startswith("INSERT")
            if is_insert and "RETURNING" not in upper and "ON CONFLICT" not in upper and "SELECT" not in upper:
                sql = sql.rstrip().rstrip(';') + " RETURNING id"
        
        cur = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql, params)
        wrapper = PostgresCursorWrapper(cur)
        if is_insert:
            try:
                row = cur.fetchone()
                if row:
                    wrapper._lastrowid = list(row.values())[0]
            except Exception:
                pass
        return wrapper

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        # Idempotent, so a `finally: con.close()` guard can sit over code paths
        # that already close on their way out. psycopg2 tolerates a double close,
        # but the flag keeps the intent explicit and survives a driver swap.
        if getattr(self, "_closed", False):
            return
        self._closed = True
        self.conn.close()

    # sqlite3 semantics for `with con:` — commit on success, roll back on error,
    # and DON'T close. /pay's atomic debit+credit relies on this (it's the ACID
    # guarantee), and psycopg2's own wrapper doesn't behave identically.
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            self.conn.commit()
        else:
            self.conn.rollback()
        return False          # never swallow the exception

# DB connection string comes from the environment so the same code runs against
# local Docker Postgres and a hosted/cloud Postgres. Never hardcode credentials.
#   local : postgresql://postgres:postgres@localhost:5432/payit
#   cloud : set DATABASE_URL (Neon/Supabase/Render) — usually needs ?sslmode=require
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/payit")


def db():
    pg_conn = psycopg2.connect(DATABASE_URL)
    return PostgresConnectionWrapper(pg_conn)


def _db_label() -> str:
    """host/dbname of the DB we're actually on, credentials stripped — safe to log
    and to return from /health. (/health used to report the filename of a SQLite DB
    that no longer exists, so it said 'payit.db' while the app was talking to Neon.)"""
    return re.sub(r"//[^@]*@", "//", DATABASE_URL).split("?")[0]


def now_iso():
    return datetime.now().isoformat()


def _issue_token_for_user(con, user_id: int, vpa: str) -> dict:
    """Mint a session token for an already-authenticated user. Shared by the
    PIN login and the WebAuthn (passkey) login so both use the same CSPRNG
    token + session row, and the token logic lives in exactly one place."""
    token = f"tok_{secrets.token_urlsafe(32)}"
    con.execute(
        "INSERT INTO sessions (user_id, device_id, token, expires_at, created_at) VALUES (?,?,?,?,?)",
        (user_id, None, token, (datetime.now() + timedelta(hours=6)).isoformat(), now_iso()))
    con.commit()
    row = con.execute(
        """SELECT u.name, a.balance FROM users u JOIN accounts a ON a.user_id=u.id
           WHERE u.id=? AND a.vpa=?""", (user_id, vpa)).fetchone()
    return {"token": token, "vpa": vpa,
            "name": row["name"] if row else None,
            "balance": row["balance"] if row else None}


security_bearer = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security_bearer)):
    token = credentials.credentials
    con = db()
    session = con.execute(
        "SELECT * FROM sessions WHERE token=? AND expires_at > ?",
        (token, now_iso())
    ).fetchone()
    if not session:
        con.close()
        raise HTTPException(status_code=401, detail="Invalid or expired session token")
    acc = con.execute("SELECT * FROM accounts WHERE user_id=?", (session["user_id"],)).fetchone()
    con.close()
    if not acc:
        raise HTTPException(status_code=404, detail="User account not found")
    return dict(acc)


def check_lockout(con, vpa):
    row = con.execute("SELECT * FROM security_lockouts WHERE vpa=?", (vpa,)).fetchone()
    if not row:
        return 0
    if row["locked_until"]:
        locked_until_dt = datetime.fromisoformat(row["locked_until"])
        if datetime.now() < locked_until_dt:
            remaining = int(round((locked_until_dt - datetime.now()).total_seconds()))
            if remaining > 0:
                con.close()
                raise HTTPException(423, f"Too many wrong PIN attempts. Locked out. Try again in {remaining}s.")
    return row["attempts"]

def record_failed_pin(con, vpa, current_attempts=None):
    """Count this failure and lock the account if it was the third.

    The counter is incremented INSIDE the statement, and the DB — not Python —
    decides whether that increment crosses the threshold. The old version read
    `attempts` earlier in the handler, spent ~50ms verifying the PIN with Argon2,
    then wrote back an absolute `current_attempts + 1`. Ten parallel wrong PINs
    all read 0 and all wrote 1: measured counter = 1, locked_until = None, nobody
    locked out. A 4-digit PIN is a 10,000-key space, so unmetered parallel
    guessing walks it — and this lockout is the ONLY control that stops that
    (Argon2 buys time per guess, it doesn't bound the number of guesses).

    ON CONFLICT DO UPDATE takes a row lock, so concurrent callers serialise here
    and each one sees the previous increment.

    `current_attempts` is accepted but ignored — kept so the existing call sites
    don't need to change, and precisely because trusting a stale read was the bug.
    """
    now_s = datetime.now().isoformat()
    lock_s = (datetime.now() + timedelta(seconds=60)).isoformat()
    # locked_until is ISO TEXT, so a plain string compare is chronological.
    con.execute("""INSERT INTO security_lockouts (vpa, attempts, locked_until) VALUES (?, 1, NULL)
                   ON CONFLICT (vpa) DO UPDATE SET
                     attempts = CASE
                         -- a lock that has already expired starts a fresh window
                         WHEN security_lockouts.locked_until IS NOT NULL
                              AND security_lockouts.locked_until <= ? THEN 1
                         ELSE security_lockouts.attempts + 1
                     END,
                     locked_until = CASE
                         WHEN security_lockouts.locked_until IS NOT NULL
                              AND security_lockouts.locked_until <= ? THEN NULL
                         WHEN security_lockouts.attempts + 1 >= 3 THEN ?
                         -- NEVER clear a live lock. Setting NULL here let a racing
                         -- request that had already passed check_lockout wipe a
                         -- lock another request had just set (measured: 3 requests
                         -- got 423, then the lock was erased and counter fell to 1).
                         ELSE security_lockouts.locked_until
                     END""",
                (vpa, now_s, now_s, lock_s))
    # Read back our own write (same transaction, row still locked) to find out
    # what the DB decided.
    row = con.execute("SELECT attempts, locked_until FROM security_lockouts WHERE vpa=?",
                      (vpa,)).fetchone()
    con.commit()
    con.close()
    if row["locked_until"]:
        raise HTTPException(423, "Too many wrong PIN attempts. Locked out for 60s.")
    left = max(0, 3 - row["attempts"])
    raise HTTPException(401, f"Incorrect PIN. {left} attempt(s) remaining.")

def reset_lockout(con, vpa):
    con.execute("DELETE FROM security_lockouts WHERE vpa=?", (vpa,))
    con.commit()


@app.on_event("startup")
def _startup():
    global engine
    engine = FraudEngine()
    # Deliberately NO auto-seed here. This used to call db.build_db.build() whenever
    # the SQLite file was missing, which was harmless when build() wrote a local
    # payit.db — but build() now DROPs and reseeds PostgreSQL, so on a Postgres-only
    # setup that hook would wipe the real database on every boot. Seeding is an
    # explicit, guarded command: PYTHONPATH=. .venv/bin/python db/build_db.py
    print(f"Payit backend up. DB: {_db_label()}")


# ------------------------------------------------------------ feature enrichment
def _account_age_days(acc) -> int:
    """Age DERIVED from created_at, not read from a stored column.

    account_age_days was a static number nothing ever updated: an account seeded
    (or registered) as "3 days old" stayed 3 days old forever, so the fraud engine
    saw a frozen, eventually-wrong age. created_at is the real fact; age is a
    projection of it — the same 'derive, don't store' principle as an account
    balance. Falls back to the stored column only if created_at is missing/bad.
    """
    ca = acc["created_at"] if "created_at" in acc.keys() else None
    if ca:
        try:
            days = (datetime.now() - datetime.fromisoformat(str(ca))).days
            if days >= 0:
                return days
        except (ValueError, TypeError):
            pass
    return int(acc["account_age_days"] or 365)


def enrich_from_db(con, sender, receiver, t) -> dict:
    """Build the model feature dict from real DB profiles + history."""
    s = con.execute("SELECT * FROM accounts WHERE vpa=?", (sender,)).fetchone()
    r = con.execute("SELECT * FROM accounts WHERE vpa=?", (receiver,)).fetchone()
    if not s or not r:
        raise HTTPException(404, "sender or receiver account not found")

    amount = t.amount
    avg = float(s["avg_amount"] or 1500)
    # usual hours "7-22"
    try:
        a, b = str(s["usual_hours"]).split("-"); usual = set(range(int(a), int(b)))
    except Exception:
        usual = set(range(6, 22))

    # Rolling-window cutoffs computed in Python as ISO strings. created_at is ISO
    # TEXT, so a plain string compare is chronological AND database-agnostic —
    # SQLite's datetime('now', ...) does not exist in PostgreSQL.
    _now_dt = datetime.now()
    win = (_now_dt - timedelta(seconds=60)).isoformat()
    win_10m = (_now_dt - timedelta(minutes=10)).isoformat()
    win_24h = (_now_dt - timedelta(hours=24)).isoformat()

    # first-time payee: has sender EVER paid this receiver?
    prior_rows = con.execute(
        """SELECT amount, created_at FROM transactions
           WHERE sender_account_id=? AND receiver_account_id=? AND status IN ('success','flagged')
           ORDER BY id DESC LIMIT 12""", (s["id"], r["id"])).fetchall()
    prior = len(prior_rows)
    first_time = int(prior == 0)

    # RELATIONSHIP: a real person pays the SAME people over and over — landlord,
    # maid, the chaiwala, their kid. A mule forwards to a DIFFERENT fresh account
    # each time. So "how established is this exact pair" is the cleanest line between
    # layering and life, and it is what lets a genuine chain (dad -> son -> son's
    # friend) off the hook without letting a real ring through.
    established_payee = prior >= 3

    # RECURRING: salary on the 1st, rent on the 5th, an EMI on a fixed date. Same
    # payee, similar amount (+-15%), on a monthly-ish cadence. This is the pattern
    # the engine used to have no memory of and would flag as a first-time-looking
    # anomaly. Detected here so it can be trusted instead.
    recurring = False
    if prior >= 2:
        similar = [row for row in prior_rows
                   if abs(float(row["amount"]) - amount) <= 0.15 * max(amount, 1)]
        if len(similar) >= 2:
            gaps = []
            times = sorted(datetime.fromisoformat(row["created_at"]) for row in similar)
            for a, b in zip(times, times[1:]):
                gaps.append((b - a).days)
            monthly = [g for g in gaps if 20 <= g <= 40]        # ~monthly rhythm
            recurring = len(monthly) >= 1 or (len(similar) >= 3 and prior >= 5)

    # velocity: sender's txns in last 60s / 10m / 24h
    velocity = con.execute(
        "SELECT COUNT(*) c FROM transactions WHERE sender_account_id=? AND created_at > ?",
        (s["id"], win)).fetchone()["c"]
    velocity_10m = con.execute(
        "SELECT COUNT(*) c FROM transactions WHERE sender_account_id=? AND created_at > ?",
        (s["id"], win_10m)).fetchone()["c"]
    velocity_24h = con.execute(
        "SELECT COUNT(*) c FROM transactions WHERE sender_account_id=? AND created_at > ?",
        (s["id"], win_24h)).fetchone()["c"]

    # fan-in: distinct senders to receiver in last 60s / 10m / 24h
    fan_in = con.execute(
        "SELECT COUNT(DISTINCT sender_account_id) c FROM transactions WHERE receiver_account_id=? AND created_at > ?",
        (r["id"], win)).fetchone()["c"]
    fan_in_10m = con.execute(
        "SELECT COUNT(DISTINCT sender_account_id) c FROM transactions WHERE receiver_account_id=? AND created_at > ?",
        (r["id"], win_10m)).fetchone()["c"]
    fan_in_24h = con.execute(
        "SELECT COUNT(DISTINCT sender_account_id) c FROM transactions WHERE receiver_account_id=? AND created_at > ?",
        (r["id"], win_24h)).fetchone()["c"]

    # fan-out: distinct receivers from sender in last 60s / 10m / 24h
    fan_out = con.execute(
        "SELECT COUNT(DISTINCT receiver_account_id) c FROM transactions WHERE sender_account_id=? AND created_at > ?",
        (s["id"], win)).fetchone()["c"]
    fan_out_10m = con.execute(
        "SELECT COUNT(DISTINCT receiver_account_id) c FROM transactions WHERE sender_account_id=? AND created_at > ?",
        (s["id"], win_10m)).fetchone()["c"]
    fan_out_24h = con.execute(
        "SELECT COUNT(DISTINCT receiver_account_id) c FROM transactions WHERE sender_account_id=? AND created_at > ?",
        (s["id"], win_24h)).fetchone()["c"]

    # in_mule_chain: did sender RECEIVE a similar amount in last 60s (now forwarding)?
    inc = con.execute(
        "SELECT amount FROM transactions WHERE receiver_account_id=? AND created_at > ?",
        (s["id"], win)).fetchall()
    in_chain = int(any(abs(row["amount"] - amount) <= 0.25 * max(amount, 1) for row in inc))
    # jumped-deposit: did sender receive a TINY credit (<Rs 100) recently?
    recent_micro = int(any(row["amount"] < 100 for row in inc))

    # forwards: did receiver send out in last 60s?
    fwd = con.execute(
        "SELECT COUNT(*) c FROM transactions WHERE sender_account_id=? AND created_at > ?",
        (r["id"], win)).fetchone()["c"]

    # device: known for this user? Only an ACTIVE (step-up-verified) device counts
    # as known. A device that merely logged in is bound as 'pending' and still reads
    # as new here — that is what makes the ₹2,000 new-device cap below actually fire.
    # Before this, login bound every device 'active', so is_new_device was 0 by the
    # time /pay ran and the cap was dead code.
    dev = t.device_id or s["home_device"]
    known = con.execute(
        "SELECT COUNT(*) c FROM devices WHERE user_id=? AND device_fingerprint=? AND status='active'",
        (s["user_id"], dev)).fetchone()["c"]
    is_new_device = int(known == 0)

    local = receiver.split("@")[0].lower()
    BRAND = ("support", "refund", "help", "care", "update", "bill", "kyc",
             "amazon", "flipkart", "bigbazaar", "irctc", "sbi.", "hdfc.", "shop")

    return {
        "sender_vpa": sender, "receiver_vpa": receiver, "amount": amount,
        "hour": datetime.now().hour, "type": t.type, "channel": t.channel,
        "ts": int(time.time()),
        "amount_to_avg_ratio": round(amount / max(avg, 1), 3),
        "odd_hour": int(datetime.now().hour not in usual and datetime.now().hour in range(0, 6)),
        "balance_drawdown": round(amount / max(float(s["balance"] or 1e6), 1), 3),
        "is_new_device": is_new_device, "first_time_payee": first_time,
        "prior_payments_to_payee": prior, "established_payee": int(established_payee),
        "recurring_payee": int(recurring),
        "sender_velocity_60s": velocity, "receiver_fan_in_60s": fan_in,
        "sender_fan_out_60s": fan_out, "receiver_forwards_recent": int(fwd > 0),
        "sender_velocity_10m": velocity_10m, "sender_velocity_24h": velocity_24h,
        "receiver_fan_in_10m": fan_in_10m, "receiver_fan_in_24h": fan_in_24h,
        "sender_fan_out_10m": fan_out_10m, "sender_fan_out_24h": fan_out_24h,
        "in_mule_chain": in_chain,
        "sender_account_age_days": _account_age_days(s),
        "receiver_account_age_days": _account_age_days(r),
        "sender_txn_count": int(s["txn_count"] or 0),
        "receiver_txn_count": int(r["txn_count"] or 0),
        "sender_is_corporate": int(s["is_merchant"] or 0),  # corp proxy
        "receiver_is_merchant": int(r["is_merchant"] or 0),
        "receiver_kyc_basic": int(str(r["kyc_level"]) == "BASIC"),
        "receiver_blacklisted": int(r["blacklisted"] or 0),
        "name_vpa_mismatch": int(any(k in local for k in BRAND) and int(r["is_merchant"] or 0) == 0),
        "is_collect": int(t.type == "COLLECT"), "is_mandate": int(t.type == "MANDATE"),
        "is_qr": int(t.channel == "QR"), "reverse_transfer": int(t.reverse),
        "device_screen_share": int(t.screen_share),
        "device_rooted": int(t.rooted), "sim_carrier_mismatch": int(t.sim_mismatch),
        "recent_micro_credit": recent_micro,
        "_sender_id": s["id"], "_receiver_id": r["id"],
        "_sender_bal": float(s["balance"]), "_receiver_bal": float(r["balance"]),
        "_user_id": s["user_id"], "_device": dev,
    }


# ------------------------------------------------------------------ models
class LoginReq(BaseModel):
    vpa: str
    device_id: str = ""
    pin: str = ""

class FirebaseLoginReq(BaseModel):
    id_token: str
    device_id: str = ""

class PhoneLookupReq(BaseModel):
    phone: str

class RegisterReq(BaseModel):
    phone: str
    name: str
    vpa: str
    bank_id: int
    upi_pin: str
    login_pin: str
    device_id: str = ""

class SetPinReq(BaseModel):
    vpa: str
    upi_pin: str

class PayReq(BaseModel):
    sender_vpa: str
    receiver_vpa: str
    amount: float = Field(gt=0)
    pin: str = ""               # UPI PIN (2nd factor)
    # Client-generated UUID, IDENTICAL across every retry of one payment attempt
    # (a new attempt gets a new one). Optional only so the existing frontend keeps
    # working; a request without it gets NO duplicate protection, which is
    # exactly the state NPCI's spec forbids. See _claim_idempotency.
    idempotency_key: str = ""
    device_id: str = ""
    type: str = "PAY"
    channel: str = "MANUAL"
    reverse: int = 0
    screen_share: int = 0
    rooted: int = 0             # device rooted/Xposed/emulator (from app RASP)
    sim_mismatch: int = 0       # SIM number != carrier records

class VerifyUpiPinReq(BaseModel):
    vpa: str
    upi_pin: str

class OtpReq(BaseModel):
    pending_txn_id: int
    otp: str
    device_id: str = ""        # the device completing the step-up -> promoted to 'active'

class SendOtpReq(BaseModel):
    phone: str

class VerifyOnboardingOtpReq(BaseModel):
    phone: str
    code: str

class ResendOtpReq(BaseModel):
    pending_txn_id: int

class ForgotPinReq(BaseModel):
    vpa: str

class ResetPinReq(BaseModel):
    vpa: str
    otp: str
    new_pin: str




# ------------------------------------------------------------------ auth
@app.post("/auth/login")
def login(req: LoginReq):
    con = db()
    acc = con.execute("SELECT * FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
    if not acc:
        con.close()
        raise HTTPException(404, "account not found")
    
    # Check persistent lockout status
    attempts = check_lockout(con, req.vpa)

    if not req.pin:
        con.close()
        raise HTTPException(401, "Login PIN is required")

    login_hash = acc["login_pin_hash"] if ("login_pin_hash" in acc.keys() and acc["login_pin_hash"]) else None
    upi_hash = acc["upi_pin_hash"] if ("upi_pin_hash" in acc.keys() and acc["upi_pin_hash"]) else None

    valid_login = (login_hash and verify_pin(req.pin, login_hash))
    valid_upi = (upi_hash and verify_pin(req.pin, upi_hash))

    if not (valid_login or valid_upi):
        record_failed_pin(con, req.vpa, attempts)

    # Success -> reset lockout
    reset_lockout(con, req.vpa)
    # transparently upgrade a legacy/weak hash now that we have the plaintext
    target_col = "login_pin_hash" if valid_login else "upi_pin_hash"
    target_hash = login_hash if valid_login else upi_hash
    if target_hash and pin_needs_rehash(target_hash):
        con.execute(f"UPDATE accounts SET {target_col}=? WHERE vpa=?", (hash_pin(req.pin), req.vpa))
        con.commit()
    # device binding: bind a NEW device as 'pending', not 'active'. Logging in with a
    # correct PIN proves the credential, not the device — so a fresh device is trusted
    # only up to the ₹2,000 new-device cap until it is stepped up (an OTP-verified
    # payment promotes it to 'active' in /pay/verify-otp). This is the cooling-off that
    # blunts account-takeover drain; binding 'active' here is what used to defeat it.
    if req.device_id:
        known = con.execute("SELECT COUNT(*) c FROM devices WHERE user_id=? AND device_fingerprint=?",
                            (acc["user_id"], req.device_id)).fetchone()["c"]
        if not known:
            con.execute("INSERT INTO devices (user_id, device_fingerprint, status, binding_age_days, is_rooted, created_at) VALUES (?,?,?,?,?,?)",
                        (acc["user_id"], req.device_id, "pending", 0, 0, now_iso()))
    token = f"tok_{secrets.token_urlsafe(32)}"      # CSPRNG: session token is an auth credential
    con.execute("INSERT INTO sessions (user_id, device_id, token, expires_at, created_at) VALUES (?,?,?,?,?)",
                (acc["user_id"], None, token, (datetime.now()+timedelta(hours=6)).isoformat(), now_iso()))
    con.commit()
    user = con.execute("SELECT name FROM users WHERE id=?", (acc["user_id"],)).fetchone()
    con.close()
    return {"token": token, "vpa": req.vpa, "name": user["name"], "balance": acc["balance"]}


@app.post("/auth/firebase")
def firebase_login(req: FirebaseLoginReq):
    try:
        import firebase_admin
        from firebase_admin import auth as firebase_auth
    except ImportError:
        # Fallback for local testing/demo if firebase-admin is not installed
        if req.id_token.startswith("demo_"):
            phone_clean = "".join(ch for ch in req.id_token if ch.isdigit())[-10:]
        else:
            raise HTTPException(500, "firebase-admin library not installed on server")
    else:
        try:
            try:
                firebase_admin.get_app()
            except ValueError:
                service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
                if service_account_json:
                    try:
                        import json
                        cred_dict = json.loads(service_account_json)
                        cred = firebase_admin.credentials.Certificate(cred_dict)
                        firebase_admin.initialize_app(cred)
                    except Exception as env_err:
                        raise HTTPException(500, f"Failed to initialize Firebase from env: {str(env_err)}")
                elif os.path.exists("serviceAccountKey.json"):
                    try:
                        cred = firebase_admin.credentials.Certificate("serviceAccountKey.json")
                        firebase_admin.initialize_app(cred)
                    except Exception as file_err:
                        raise HTTPException(500, f"Failed to initialize Firebase from file: {str(file_err)}")
                else:
                    firebase_admin.initialize_app()
            
            decoded_token = firebase_auth.verify_id_token(req.id_token)
            phone_number = decoded_token.get("phone_number")
            if not phone_number:
                raise HTTPException(400, "Phone number missing in Firebase token")
            phone_clean = "".join(ch for ch in phone_number if ch.isdigit())[-10:]
        except Exception as e:
            raise HTTPException(401, f"Firebase token verification failed: {str(e)}")

    con = db()
    user = con.execute("SELECT * FROM users WHERE phone LIKE ?", (f"%{phone_clean}",)).fetchone()
    if not user:
        con.close()
        return {"registered": False, "phone": phone_clean}

    acc = con.execute("SELECT * FROM accounts WHERE user_id=? LIMIT 1", (user["id"],)).fetchone()
    if not acc:
        con.close()
        return {"registered": False, "phone": phone_clean}

    if req.device_id:
        known = con.execute("SELECT COUNT(*) c FROM devices WHERE user_id=? AND device_fingerprint=?",
                            (acc["user_id"], req.device_id)).fetchone()["c"]
        if not known:
            con.execute("INSERT INTO devices (user_id, device_fingerprint, status, binding_age_days, is_rooted, created_at) VALUES (?,?,?,?,?,?)",
                        (acc["user_id"], req.device_id, "pending", 0, 0, now_iso()))

    token = f"tok_{secrets.token_urlsafe(32)}"
    con.execute("INSERT INTO sessions (user_id, device_id, token, expires_at, created_at) VALUES (?,?,?,?,?)",
                (acc["user_id"], None, token, (datetime.now()+timedelta(hours=6)).isoformat(), now_iso()))
    con.commit()
    con.close()
    return {"token": token, "vpa": acc["vpa"], "name": user["name"], "balance": acc["balance"]}


@app.post("/auth/phone-lookup")
def phone_lookup(req: PhoneLookupReq):
    con = db()
    # Normalize phone: remove non-digits
    phone_clean = "".join(ch for ch in req.phone if ch.isdigit())
    if len(phone_clean) > 10:
        phone_clean = phone_clean[-10:]
    
    user = con.execute("SELECT * FROM users WHERE phone LIKE ?", (f"%{phone_clean}",)).fetchone()
    if not user:
        con.close()
        return {"registered": False}
    
    acc = con.execute("SELECT * FROM accounts WHERE user_id=? LIMIT 1", (user["id"],)).fetchone()
    con.close()
    if not acc:
        return {"registered": False}
        
    return {
        "registered": True,
        "vpa": acc["vpa"],
        "name": user["name"],
        "phone": user["phone"],
        "has_pin": acc["upi_pin_hash"] is not None and acc["upi_pin_hash"] != ""
    }


@app.post("/auth/register")
def register(req: RegisterReq):
    con = db()
    try:
        # Normalize phone
        phone_clean = "".join(ch for ch in req.phone if ch.isdigit())
        if len(phone_clean) > 10:
            phone_clean = phone_clean[-10:]
        
        user = con.execute("SELECT * FROM users WHERE phone LIKE ?", (f"%{phone_clean}",)).fetchone()
        if user:
            user_id = user["id"]
        else:
            cur = con.cursor()
            cur.execute("INSERT INTO users (name, phone, email, created_at) VALUES (?,?,?,?)",
                        (req.name, req.phone, f"{req.name.lower().replace(' ', '')}@gmail.com", now_iso()))
            user_id = cur.lastrowid
        
        exist_acc = con.execute("SELECT * FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
        if exist_acc:
            raise HTTPException(400, "UPI ID / VPA already registered")
            
        if len(req.login_pin) != 4 or not req.login_pin.isdigit():
            raise HTTPException(400, "App Login PIN must be a 4-digit number")
        if len(req.upi_pin) != 6 or not req.upi_pin.isdigit():
            raise HTTPException(400, "UPI Transaction PIN must be a 6-digit number")
            
        upi_pin_hash = hash_pin(req.upi_pin)          # Argon2id + pepper
        login_pin_hash = hash_pin(req.login_pin)
        account_number = f"ACC{random.randint(10**10, 10**11)}"
        con.execute("""
            INSERT INTO accounts (
                user_id, bank_id, vpa, account_number, balance, account_age_days,
                kyc_level, is_merchant, mcc, avg_amount, usual_hours,
                home_device, txn_count, blacklisted, created_at, upi_pin_hash, login_pin_hash
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (user_id, req.bank_id, req.vpa, account_number, 5000.0, 1, "BASIC", 0, 0, 1500.0, "7-22", req.device_id, 0, 0, now_iso(), upi_pin_hash, login_pin_hash))
        
        token = f"tok_{secrets.token_urlsafe(32)}"      # CSPRNG: session token is an auth credential
        con.execute("INSERT INTO sessions (user_id, device_id, token, expires_at, created_at) VALUES (?,?,?,?,?)",
                    (user_id, None, token, (datetime.now()+timedelta(hours=6)).isoformat(), now_iso()))
        
        if req.device_id:
            con.execute("INSERT INTO devices (user_id, device_fingerprint, status, binding_age_days, is_rooted, created_at) VALUES (?,?,?,?,?,?)",
                        (user_id, req.device_id, "active", 0, 0, now_iso()))
            
        con.commit()
        return {"token": token, "vpa": req.vpa, "name": req.name, "balance": 5000.0}
    except psycopg2.IntegrityError as e:
        con.rollback()
        raise HTTPException(400, f"Database error: {str(e)}")
    finally:
        con.close()


@app.post("/auth/verify-upi-pin")
def verify_upi_pin(req: VerifyUpiPinReq):
    con = db()
    acc = con.execute("SELECT upi_pin_hash FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
    if not acc:
        con.close()
        raise HTTPException(404, "account not found")
    if not acc["upi_pin_hash"]:
        con.close()
        raise HTTPException(400, "UPI PIN not set")
    # Share the lockout ledger with /pay and /auth/login. Without it this route was
    # an unmetered PIN oracle: 6 digits is a 1M keyspace, and Argon2 only makes a
    # guesser slow, not stopped — the attempt cap is the control that actually works.
    # (Both helpers close `con` and raise on the failure paths.)
    attempts = check_lockout(con, req.vpa)
    if not verify_pin(req.upi_pin, acc["upi_pin_hash"]):
        record_failed_pin(con, req.vpa, attempts)
    reset_lockout(con, req.vpa)
    con.close()
    return {"status": "success", "message": "UPI PIN is correct"}


@app.post("/auth/set-pin")
def set_pin(req: SetPinReq, current_user: dict = Depends(get_current_user)):
    # Setting the UPI PIN IS the account-takeover primitive — whoever can set it can
    # move the money. So it is bound to the caller's own session; the VPA in the body
    # is never trusted on its own (this route used to take one with no auth at all).
    # Note this authorises a change with the LOGIN pin only (that is what minted the
    # session). A step-up — old UPI PIN, or the /auth/forgot-pin OTP — would be the
    # stronger design; see the note in the handover.
    if current_user["vpa"] != req.vpa:
        raise HTTPException(403, "Unauthorized to set the PIN for this VPA")
    con = db()
    acc = con.execute("SELECT * FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
    if not acc:
        con.close()
        raise HTTPException(404, "VPA not found")

    if len(req.upi_pin) not in (4, 6) or not req.upi_pin.isdigit():
        con.close()
        raise HTTPException(400, "UPI PIN must be a 4 or 6-digit number")
    
    pin_hash = hash_pin(req.upi_pin)                  # Argon2id + pepper
    con.execute("UPDATE accounts SET upi_pin_hash=? WHERE vpa=?", (pin_hash, req.vpa))
    con.commit()
    con.close()
    return {"status": "success", "message": "UPI PIN set successfully"}


@app.post("/auth/forgot-pin")
def forgot_pin(req: ForgotPinReq):
    """Generate an OTP so the user can reset their UPI PIN (Forgot PIN flow)."""
    con = db()
    acc = con.execute(
        "SELECT a.*, u.phone FROM accounts a JOIN users u ON u.id=a.user_id WHERE a.vpa=?",
        (req.vpa,)
    ).fetchone()
    if not acc:
        con.close()
        raise HTTPException(404, "Account not found")
    otp_code = f"{secrets.randbelow(900000) + 100000}"
    # Expire any existing reset OTPs for this user
    # The LIKE pattern MUST travel as a parameter, not inline in the SQL. The wrapper
    # rewrites ? -> %s, after which psycopg2 reads a literal % in the query as the
    # start of a placeholder and dies with "tuple index out of range".
    con.execute(
        "UPDATE otp_verifications SET status='expired' WHERE user_id=? AND code LIKE ? AND status='pending'",
        (acc["user_id"], "pin_reset:%")
    )
    con.execute(
        "INSERT INTO otp_verifications (user_id, code, status, attempts, expires_at, created_at) VALUES (?,?,?,?,?,?)",
        (acc["user_id"], f"pin_reset:{otp_code}", "pending", 0,
         (datetime.now() + timedelta(minutes=10)).isoformat(), now_iso())
    )
    con.commit(); con.close()
    phone = acc["phone"] or ""
    masked = f"****{phone[-4:]}" if len(phone) >= 4 else "****"
    sms_res = send_sms_otp(phone, otp_code, context="PIN Reset")
    if sms_res.get("delivered"):
        return {
            "result": "sent",
            "message": f"OTP sent via SMS ({sms_res.get('provider')}) to +91 {masked}.",
            "delivery": "sms",
            "provider": sms_res.get("provider")
        }
    return {
        "result": "sent",
        "message": f"Demo mode — no SMS sent to +91 {masked}. {SMS_DISCLAIMER}",
        "delivery": "server_log",
        "otp_demo": otp_code
    }


@app.post("/auth/reset-pin")
def reset_pin(req: ResetPinReq):
    """Verify the forgot-PIN OTP and set a new UPI PIN."""
    # 6 digits, matching /auth/register and /auth/set-pin — the UPI PIN is 6 digits
    # everywhere (the 4-digit one is the separate app LOGIN pin). This check used to
    # demand 4 here and 6 again after the OTP step, which no input could satisfy, so
    # the route could never succeed. Validated up front so a wrong length doesn't
    # burn one of the caller's three OTP attempts.
    if len(req.new_pin) not in (4, 6) or not req.new_pin.isdigit():
        raise HTTPException(400, "UPI PIN must be a 4 or 6-digit number")
    con = db()
    acc = con.execute("SELECT * FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
    if not acc:
        con.close(); raise HTTPException(404, "Account not found")
    otp_row = con.execute(
        """SELECT * FROM otp_verifications
           WHERE user_id=? AND status='pending' AND code LIKE ? AND expires_at > ?
           ORDER BY id DESC LIMIT 1""",
        (acc["user_id"], "pin_reset:%", datetime.now().isoformat())
    ).fetchone()
    if not otp_row:
        con.close(); raise HTTPException(400, "OTP expired or not found. Please request a new one.")
    stored_code = otp_row["code"].split(":")[-1]
    if stored_code != req.otp.strip():
        new_attempts = otp_row["attempts"] + 1
        con.execute("UPDATE otp_verifications SET attempts=? WHERE id=?", (new_attempts, otp_row["id"]))
        if new_attempts >= 3:
            con.execute("UPDATE otp_verifications SET status='expired' WHERE id=?", (otp_row["id"],))
            con.commit(); con.close()
            raise HTTPException(423, "Too many wrong OTP attempts. Please request a new OTP.")
        con.commit(); con.close()
        left = 3 - new_attempts
        raise HTTPException(400, f"Incorrect OTP. {left} attempt(s) remaining.")
    # OTP verified → set new PIN (length already validated up front)
    pin_hash = hash_pin(req.new_pin)                  # Argon2id + pepper
    con.execute("UPDATE accounts SET upi_pin_hash=? WHERE vpa=?", (pin_hash, req.vpa))
    con.execute("UPDATE otp_verifications SET status='verified' WHERE id=?", (otp_row["id"],))
    # Clear any PIN lockout for this VPA
    reset_lockout(con, req.vpa)
    con.commit(); con.close()
    print(f"[Forgot PIN] UPI PIN reset successfully for {req.vpa}")
    return {"result": "success", "message": "UPI PIN reset successfully. You can now login with your new PIN."}


@app.get("/banks")
def get_banks():
    con = db()
    rows = con.execute("SELECT id, name, upi_handle FROM banks").fetchall()
    con.close()
    return [{"id": r["id"], "name": r["name"], "upi_handle": r["upi_handle"]} for r in rows]







@app.get("/accounts/{vpa}")
def resolve_vpa(vpa: str):
    """VPA resolution — name + merchant status (beneficiary check before pay)."""
    con = db()
    acc = con.execute("SELECT a.*, u.name FROM accounts a JOIN users u ON u.id=a.user_id WHERE a.vpa=?", (vpa,)).fetchone()
    con.close()
    if not acc:
        raise HTTPException(404, "VPA not found")
    return {"vpa": vpa, "name": acc["name"], "is_merchant": bool(acc["is_merchant"]),
            "account_age_days": acc["account_age_days"], "blacklisted": bool(acc["blacklisted"])}


@app.get("/balance/{vpa}")
def balance(vpa: str, current_user: dict = Depends(get_current_user)):
    if current_user["vpa"] != vpa:
        raise HTTPException(403, "Unauthorized to view balance for this VPA")
    return {"vpa": vpa, "balance": current_user["balance"]}


class PrecheckReq(BaseModel):
    sender_vpa: str
    receiver_vpa: str


PRECHECK_KW = ("refund", "support", "kyc", "prize", "cash", "lottery", "help",
               "care", "update", "verify", "reward", "offer")


@app.post("/precheck")
def precheck(req: PrecheckReq):
    """F2: pre-payment BENEFICIARY risk — runs the moment a payee is selected
    (before amount/PIN), so the user gets an EARLY warning if the receiver looks risky."""
    con = db()
    r = con.execute("SELECT a.*, u.name FROM accounts a JOIN users u ON u.id=a.user_id WHERE a.vpa=?",
                    (req.receiver_vpa,)).fetchone()
    if not r:
        con.close(); raise HTTPException(404, "receiver not found")
    s = con.execute("SELECT id FROM accounts WHERE vpa=?", (req.sender_vpa,)).fetchone()
    reasons, risk = [], 0

    if r["blacklisted"]:
        reasons.append("⚠️ This account is on the fraud blacklist — do NOT pay"); risk = 100
    if r["account_age_days"] < 7:
        reasons.append(f"Very new account — only {r['account_age_days']} days old"); risk = max(risk, 60)
    if s and not r["is_merchant"]:
        paid = con.execute("SELECT COUNT(*) c FROM transactions WHERE sender_account_id=? AND receiver_account_id=?",
                           (s["id"], r["id"])).fetchone()["c"]
        if paid == 0:
            reasons.append("You've never paid this person before"); risk = max(risk, 35)
    cutoff = (datetime.now() - timedelta(minutes=60)).isoformat()
    fanin = con.execute("SELECT COUNT(DISTINCT sender_account_id) c FROM transactions WHERE receiver_account_id=? AND created_at > ?",
                        (r["id"], cutoff)).fetchone()["c"]
    if fanin >= 5 and not r["is_merchant"]:
        reasons.append(f"Receiver got money from {fanin} different people recently (mule pattern)"); risk = max(risk, 55)
    # (removed) VPA brand/scam-keyword warning — a real scam VPA is innocuous, so
    # keying on the name string is a demo crutch, not a real signal. Precheck now
    # warns only on behaviour the bank can actually see: blacklist, fresh age,
    # never-paid-before, and recent fan-in (mule pattern).
    con.close()

    level = "high" if risk >= 60 else "medium" if risk >= 35 else "low"
    return {"receiver_name": r["name"], "receiver_age_days": r["account_age_days"],
            "is_merchant": bool(r["is_merchant"]), "blacklisted": bool(r["blacklisted"]),
            "risk_level": level, "warn": risk >= 35, "risk_score": risk, "reasons": reasons}


# ------------------------------------------------------------------ pay (core)
def get_db():
    """Per-request connection that is ALWAYS returned, even when the handler
    raises. /pay used to do a bare `con = db()`; every HTTPException raised past
    it (unknown receiver_vpa, a scoring error) leaked the connection, so anyone
    could exhaust the pool by POSTing /pay with a bogus VPA in a loop.

    close() is idempotent, so the handler's own con.close() calls stay valid."""
    con = db()
    try:
        yield con
    finally:
        con.close()


def _req_fingerprint(user_id: int, req) -> str:
    """Hash of the parameters that define this payment.

    Reusing one key for a *different* payment is a client bug, not a retry.
    Without this we would happily replay the response for "₹500 to Arpit" at
    someone who then asked for "₹50,000 to Ramesh".
    """
    raw = f"{user_id}|{req.sender_vpa}|{req.receiver_vpa}|{req.amount}|{req.type}|{req.channel}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _claim_idempotency(con, user_id: int, key: str, fingerprint: str):
    """Try to claim this key. Returns None if WE own it and should do the work,
    or the original response dict to replay if this is a retry.

    The UNIQUE index — not an `if` in Python — decides the winner. A
    SELECT-then-INSERT here would be the same TOCTOU that the recall bug was:
    both requests would see "no such key" and both would insert.

    Known limit: the claim commits before the payment runs, so if the process
    dies in between, the key stays claimed with no response and retries get 409
    forever. That is the safe direction to fail (never a double charge), and the
    real fix is Brandur's `locked_at` lease, which we have not built.
    """
    if not key:
        return None                       # no key -> no protection (see PayReq)
    try:
        con.execute("""INSERT INTO idempotency_keys
                         (user_id, idempotency_key, request_fingerprint, created_at)
                       VALUES (?,?,?,?)""", (user_id, key, fingerprint, now_iso()))
        con.commit()
        return None                       # claimed: we do the work
    except psycopg2.IntegrityError:
        con.rollback()                    # somebody else has it

    row = con.execute("SELECT * FROM idempotency_keys WHERE user_id=? AND idempotency_key=?",
                      (user_id, key)).fetchone()
    if not row:
        return None                       # vanished (expiry job); treat as fresh

    if row["request_fingerprint"] != fingerprint:
        raise HTTPException(400,
            "This idempotency key was already used for a different payment. "
            "Use a new key for a new payment.")

    if row["response_code"] is None:
        # Claimed but no response yet: check if lease expired (> 30s old) due to server crash/timeout
        created_str = row.get("created_at")
        try:
            created_dt = datetime.fromisoformat(created_str) if created_str else None
        except Exception:
            created_dt = None
        if created_dt and (datetime.now() - created_dt).total_seconds() > 30:
            # Lease expired -> delete stale claim and re-claim for this retry
            con.execute("DELETE FROM idempotency_keys WHERE user_id=? AND idempotency_key=?", (user_id, key))
            con.commit()
            con.execute("""INSERT INTO idempotency_keys
                             (user_id, idempotency_key, request_fingerprint, created_at)
                           VALUES (?,?,?,?)""", (user_id, key, fingerprint, now_iso()))
            con.commit()
            return None
        raise HTTPException(409, "This payment is already being processed. Please wait.")

    print(f"[IDEMPOTENT REPLAY] user={user_id} key={key} -> replaying original response")
    return json.loads(row["response_body"])


def _store_idempotent(con, user_id: int, key: str, code: int, body: dict) -> None:
    """Record the outcome so a retry replays it instead of paying again."""
    if not key:
        return
    con.execute("""UPDATE idempotency_keys SET response_code=?, response_body=?
                   WHERE user_id=? AND idempotency_key=?""",
                (code, json.dumps(body, default=str), user_id, key))
    con.commit()


def _ledger_post(con, transfer_id, legs, kind="transfer", reverses=None):
    """Append immutable double-entry rows for one money movement.

    legs = [(account_id, signed_amount), ...] that MUST sum to zero. Called from
    INSIDE the caller's DB transaction (the same `with con:` that moves the
    balances), so the ledger and the money commit together or not at all — no
    dual-write gap. Reads balance_after AFTER the caller has updated balances.

    account_id 0 = @world (external source/sink). A reversal passes the original
    transfer_id in `reverses` and writes NEW opposite legs — the original entries
    are never touched.
    """
    total = round(sum(a for _, a in legs), 2)
    if total != 0:                        # the invariant, enforced at write time
        raise ValueError(f"ledger imbalance for {transfer_id}: {total}")
    for acc_id, amt in legs:
        bal_after = None
        if acc_id != 0:
            row = con.execute("SELECT balance FROM accounts WHERE id=?", (acc_id,)).fetchone()
            bal_after = round(float(row["balance"]), 2) if row else None
        con.execute("""INSERT INTO ledger_entries
                       (transfer_id, account_id, amount, balance_after,
                        reverses_transfer_id, kind, created_at)
                       VALUES (?,?,?,?,?,?,?)""",
                    (transfer_id, acc_id, round(amt, 2), bal_after, reverses, kind, now_iso()))


def _log_fraud(con, txid, out):
    con.execute("INSERT INTO fraud_scores (transaction_id, cumulative_score, label, created_at) VALUES (?,?,?,?)",
                (txid, out["score"], out["label"], now_iso()))
    if out["label"] in ("REVIEW", "BLOCK"):
        con.execute("INSERT INTO alerts (transaction_id, status, severity, created_at) VALUES (?,?,?,?)",
                    (txid, "open", "critical" if out["label"] == "BLOCK" else "high", now_iso()))


def _ml_provisional_block(con, feats, receiver_vpa, txid, out):
    """ML/rules gave a high-confidence BLOCK on a fresh receiver -> provisionally
    blacklist that ACCOUNT and file a report to the bank.

    This is deliberately PROVISIONAL. Auto-blocking an account on an ML score alone
    would wrongly freeze genuine accounts (a screen-share BLOCK is about the SENDER's
    compromised device, not proof the receiver is a mule). So the block is a HOLD
    pending the bank: /bank/review-account adjudicates on the bank's OWN evidence and
    UNBLOCKS the account if it doesn't hold. The app proposes; the bank (the
    authority) disposes. Never touches merchants or already-blacklisted accounts.
    """
    if feats["receiver_is_merchant"] or feats["receiver_blacklisted"]:
        return None

    # Act against the RECEIVER only when the RECEIVER is what looks wrong.
    # A screen-share / rooted / SIM-swap BLOCK is about the PAYER's device, and the
    # payee may be his mother. This used to block any non-merchant payee on any
    # BLOCK, so a 4-year-old video-KYC account with a fan-in of 4 got provisionally
    # blacklisted because the person paying her was on a compromised phone. The bank
    # cleared her — but she should never have been touched. Punish the party the
    # evidence is actually about.
    r_age = int(feats.get("receiver_account_age_days", 400) or 400)
    r_txns = int(feats.get("receiver_txn_count", 0) or 0)
    fan_in = int(feats.get("receiver_fan_in_60s", 0) or 0)
    established = (r_age > 180 and r_txns >= 5)
    receiver_is_suspect = (r_age < 10) or (fan_in >= 5)
    if established or not receiver_is_suspect:
        return None

    con.execute("UPDATE accounts SET blacklisted=1 WHERE id=?", (feats["_receiver_id"],))
    con.execute("""INSERT INTO blacklist (entity_type, entity_value, reason, created_at)
                   VALUES ('account', ?, ?, ?)""",
                (receiver_vpa, f"ML auto-block (provisional, score {out['score']}) — pending bank review", now_iso()))
    con.execute("""INSERT INTO fraud_reports (reported_vpa, reporter_vpa, reason, amount_lost, status, created_at)
                   VALUES (?,?,?,?,?,?)""",
                (receiver_vpa, "SYSTEM/ML", "ML auto-flag: " + "; ".join(out["reasons"][:3]), 0, "ml_provisional", now_iso()))
    con.execute("INSERT INTO alerts (transaction_id, status, severity, created_at) VALUES (?,?,?,?)",
                (txid, "ml_auto_block", "high", now_iso()))
    return {"account_blocked": receiver_vpa, "status": "provisional_pending_bank_review", "score": out["score"]}


def _chain_evidence(con, ring, out, txid):
    """Build the case file the bank actually needs to rule on a chain.

    A one-line "ML flagged it" is not evidence — the bank has to be able to check the
    claim itself, and a reviewer has to be able to see WHY without trusting us. So
    this assembles the whole thing: every hop with its amount and the gap to the next
    one (layering is defined by money keeping its value while moving fast), and each
    account in the path with the attributes the bank can verify independently — age,
    KYC level, merchant flag, lifetime volume, 24h fan-in.
    """
    hops, seen = [], None
    for payer, payee in zip(ring, ring[1:]):
        row = con.execute(
            """SELECT t.id, t.amount, t.created_at FROM transactions t
               JOIN accounts sa ON sa.id=t.sender_account_id
               JOIN accounts ra ON ra.id=t.receiver_account_id
               WHERE sa.vpa=? AND ra.vpa=? AND t.status IN ('success','flagged','pending')
               ORDER BY t.id DESC LIMIT 1""", (payer, payee)).fetchone()
        hop = {"from": payer, "to": payee,
               "amount": float(row["amount"]) if row else None,
               "at": row["created_at"] if row else None,
               "transaction_id": row["id"] if row else None}
        if row and seen:
            try:
                hop["seconds_after_previous"] = int(
                    (datetime.fromisoformat(row["created_at"]) - datetime.fromisoformat(seen)).total_seconds())
            except Exception:
                pass
        if row:
            seen = row["created_at"]
        hops.append(hop)

    day = (datetime.now() - timedelta(hours=24)).isoformat()
    accounts = []
    for vpa in ring:
        a = con.execute("""SELECT a.id, a.account_age_days, a.kyc_level, a.is_merchant,
                                  a.txn_count, a.blacklisted, u.name
                           FROM accounts a JOIN users u ON u.id=a.user_id
                           WHERE a.vpa=?""", (vpa,)).fetchone()
        if not a:
            continue
        fan_in = con.execute(
            """SELECT COUNT(DISTINCT sender_account_id) c FROM transactions
               WHERE receiver_account_id=? AND status IN ('success','flagged') AND created_at > ?""",
            (a["id"], day)).fetchone()["c"]
        # What has this account actually been DOING? A destination that keeps what it
        # receives behaves nothing like one that passes ~all of it straight on, and
        # the bank cannot judge the account without seeing that.
        got = float(con.execute(
            """SELECT COALESCE(SUM(amount),0) s FROM transactions
               WHERE receiver_account_id=? AND status IN ('success','flagged') AND created_at > ?""",
            (a["id"], day)).fetchone()["s"])
        sent = float(con.execute(
            """SELECT COALESCE(SUM(amount),0) s FROM transactions
               WHERE sender_account_id=? AND status IN ('success','flagged') AND created_at > ?""",
            (a["id"], day)).fetchone()["s"])
        recent = con.execute(
            """SELECT t.amount, t.created_at, sa.vpa AS s, ra.vpa AS r FROM transactions t
               JOIN accounts sa ON sa.id=t.sender_account_id
               JOIN accounts ra ON ra.id=t.receiver_account_id
               WHERE (t.sender_account_id=? OR t.receiver_account_id=?)
                 AND t.status IN ('success','flagged')
               ORDER BY t.id DESC LIMIT 5""", (a["id"], a["id"])).fetchall()
        accounts.append({"vpa": vpa, "name": a["name"], "age_days": a["account_age_days"],
                         "kyc": a["kyc_level"], "is_merchant": bool(a["is_merchant"]),
                         "lifetime_txns": a["txn_count"], "fan_in_24h": fan_in,
                         "already_blacklisted": bool(a["blacklisted"]),
                         "received_24h": round(got, 2), "sent_24h": round(sent, 2),
                         "forwarded_pct": round(sent / got * 100, 1) if got else 0.0,
                         "recent_activity": [
                             {"amount": float(x["amount"]), "from": x["s"], "to": x["r"],
                              "at": x["created_at"]} for x in recent]})

    return {
        "pattern": "mule_chain",
        "path": ring,
        "hops": hops,
        "accounts": accounts,
        "engine": {"score": out.get("score"), "label": out.get("label"),
                   "components": out.get("components"), "reasons": out.get("reasons", [])[:5]},
        "detected_on_transaction": txid,
        "detected_at": now_iso(),
    }


def _file_chain_case_to_bank(con, ring, out, txid):
    """File the chain with the bank automatically, the moment it is detected.

    Until now a case only reached the bank if the payment was BLOCKED, or if the
    victim happened to notice and press Recall themselves. So a chain that scored
    REVIEW — which is most of them, because the shape alone is not proof — was
    detected, logged, and then went nowhere. The person whose money it was had to
    discover it on their own.

    The engine now reports every detected chain, with the full evidence bundle, and
    the bank decides. Nobody has to click. This still only FILES: no account is
    frozen here and no money moves — those remain the bank's calls.
    """
    if not ring or len(ring) < 2:
        return None
    victim_vpa = ring[0]
    evidence = _chain_evidence(con, ring, out, txid)
    total = sum(h["amount"] or 0 for h in evidence["hops"])
    by_vpa = {a["vpa"]: a for a in evidence["accounts"]}

    # A case per account the money passed THROUGH or landed IN — not just the first
    # hop. Only the middle account was ever reported, so the end of the chain — the
    # account actually holding the money — was described in the evidence and then
    # never charged with anything. ring[0] is the victim and merchants are legitimate
    # destinations, so both are skipped.
    filed = []
    for vpa in ring[1:]:
        info = by_vpa.get(vpa, {})
        if info.get("is_merchant"):
            continue
        dup = con.execute(
            """SELECT 1 FROM fraud_reports WHERE reported_vpa=? AND reporter_vpa='SYSTEM/ML'
               AND status='ml_provisional' AND reason LIKE ?""",
            (vpa, f'%"detected_on_transaction": {txid}%')).fetchone()
        if dup:
            continue
        role = "final destination — money landed here" if vpa == ring[-1] else "pass-through leg"
        con.execute("""INSERT INTO fraud_reports (reported_vpa, reporter_vpa, reason, amount_lost,
                                                  status, created_at) VALUES (?,?,?,?,?,?)""",
                    (vpa, "SYSTEM/ML", json.dumps({**evidence, "role_in_chain": role}),
                     total, "ml_provisional", now_iso()))

        # Hold the account while the case is open. Filing alone changed nothing on
        # our side, so the next victim could still pay straight into an account we
        # had just told the bank was laundering money. Same guard as everywhere else:
        # only a genuinely suspect account (fresh, or a fan-in already pulling from
        # many people), never a merchant, never an established+active account — and
        # the bank CLEARS it if the evidence doesn't hold, which is what makes a hold
        # on suspicion acceptable rather than a punishment.
        held = False
        suspect = (info.get("age_days", 400) < 10) or (info.get("fan_in_24h", 0) >= 5)
        established = info.get("age_days", 0) > 180 and info.get("lifetime_txns", 0) >= 5
        if suspect and not established and not info.get("already_blacklisted"):
            con.execute("UPDATE accounts SET blacklisted=1 WHERE vpa=?", (vpa,))
            con.execute("""INSERT INTO blacklist (entity_type, entity_value, reason, created_at)
                           VALUES ('account', ?, ?, ?)""",
                        (vpa, f"Provisional hold — {role}; chain reported to bank, awaiting review",
                         now_iso()))
            held = True
        filed.append({"account": vpa, "role": role, "provisionally_held": held})

    if not filed:
        return None
    con.execute("INSERT INTO alerts (transaction_id, status, severity, created_at) VALUES (?,?,?,?)",
                (txid, "chain_reported", "high", now_iso()))
    return {"reported_accounts": filed, "victim": victim_vpa, "path": ring,
            "status": "filed_with_bank_pending_review"}


def _file_chain_victim_cases(con, ring, blocked_txid):
    """A chain is proved at its LAST hop — but the money feeding it came from a
    VICTIM further up, and that payment is now sitting inside a mule account.

    Blocking the forward alone left the victim stranded: we stopped the mule from
    moving the money on, said "fraud caught", and then filed nothing for the person
    whose money it actually was. They'd have to notice and hit recall themselves.

    So every upstream leg of the proved chain is filed with the bank as a reversal
    case. This only FILES — no money moves here. The bank still resolves it at its
    own desk (/bank/resolve-reversal) and still needs a law-enforcement reference.
    """
    if not ring or len(ring) < 2:
        return []
    filed = []
    day = (datetime.now() - timedelta(hours=24)).isoformat()
    for payer_vpa, payee_vpa in zip(ring, ring[1:]):
        row = con.execute(
            """SELECT t.id, t.amount FROM transactions t
               JOIN accounts sa ON sa.id = t.sender_account_id
               JOIN accounts ra ON ra.id = t.receiver_account_id
               WHERE sa.vpa=? AND ra.vpa=? AND t.status IN ('success','flagged')
                 AND t.created_at > ? AND t.id <> ?
               ORDER BY t.id DESC LIMIT 1""",
            (payer_vpa, payee_vpa, day, blocked_txid)).fetchone()
        if not row:
            continue
        dup = con.execute("SELECT 1 FROM alerts WHERE transaction_id=? AND status='reversal_pending'",
                          (row["id"],)).fetchone()
        if dup:
            continue
        con.execute("INSERT INTO alerts (transaction_id, status, severity, created_at) VALUES (?,?,?,?)",
                    (row["id"], "reversal_pending", "critical", now_iso()))
        filed.append({"transaction_id": row["id"], "amount": float(row["amount"]),
                      "payer": payer_vpa, "payee": payee_vpa})
    return filed


@app.post("/pay")
def pay(req: PayReq, current_user: dict = Depends(get_current_user),
        con=Depends(get_db)):
    if current_user["vpa"] != req.sender_vpa:
        raise HTTPException(403, "Unauthorized to initiate payment from this VPA")
    t0 = time.perf_counter()

    # ---- 2nd factor: verify UPI PIN (device is the 1st factor) ----
    if not req.pin or req.pin.strip() == "":
        con.close()
        raise HTTPException(401, "invalid UPI PIN")

    if req.sender_vpa == req.receiver_vpa:
        con.close()
        raise HTTPException(400, "cannot pay your own account")

    srow = con.execute("SELECT upi_pin_hash FROM accounts WHERE vpa=?", (req.sender_vpa,)).fetchone()
    if not srow:
        con.close(); raise HTTPException(404, "sender not found")

    # Check wrong PIN lockout
    attempts = check_lockout(con, req.sender_vpa)

    if req.pin and srow["upi_pin_hash"]:
        if not verify_pin(req.pin, srow["upi_pin_hash"]):
            record_failed_pin(con, req.sender_vpa, attempts)

    # Success -> reset PIN attempts
    reset_lockout(con, req.sender_vpa)

    feats = enrich_from_db(con, req.sender_vpa, req.receiver_vpa, req)

    # ---- policy pre-conditions (deterministic rejects, BEFORE the idempotency
    # claim and before any money moves). A rejected payment must not claim a key
    # (else a legitimate retry gets a misleading 409). ----

    # Per-transaction ceiling (NPCI default category).
    if req.amount > UPI_PER_TXN_CAP:
        con.close()
        raise HTTPException(403, f"Amount exceeds the ₹{UPI_PER_TXN_CAP:,.0f} per-transaction UPI limit.")

    # F1: an unverified device is capped to ₹2000/txn — a cooling-off that blunts
    # account-takeover drain. To lift it, complete one OTP-verified payment.
    if feats.get("is_new_device") and req.amount > 2000:
        con.close()
        raise HTTPException(403, "New device — ₹2,000 limit until you verify this device with an OTP. Use your usual device for higher amounts.")

    if feats["_sender_bal"] < req.amount and req.channel != "CREDIT_CARD":
        con.close()
        raise HTTPException(400, "insufficient balance")

    # Daily velocity caps (₹1L + 20 txn per rolling 24h) — a real UPI control the
    # fraud engine's blend can't provide, because it's a hard regulatory ceiling,
    # not a risk score. Counts committed outgoing (success/flagged) in the window.
    _day = (datetime.now() - timedelta(hours=24)).isoformat()
    day_row = con.execute(
        """SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM transactions
           WHERE sender_account_id=? AND status IN ('success','flagged') AND created_at > ?""",
        (feats["_sender_id"], _day)).fetchone()
    if day_row["c"] >= UPI_DAILY_COUNT_CAP:
        con.close()
        raise HTTPException(403, f"Daily UPI limit reached — {UPI_DAILY_COUNT_CAP} transactions in 24h. Try again tomorrow.")
    if float(day_row["s"]) + req.amount > UPI_DAILY_AMOUNT_CAP:
        spent = float(day_row["s"]); left = max(0, UPI_DAILY_AMOUNT_CAP - spent)
        con.close()
        raise HTTPException(403, f"Daily UPI limit exceeded — ₹{spent:,.0f} sent in 24h, ₹{left:,.0f} left of ₹{UPI_DAILY_AMOUNT_CAP:,.0f}.")

    # Idempotency claim — AFTER the PIN check and all policy pre-conditions, so a
    # wrong PIN or a rejected payment never burns the key, and BEFORE money moves.
    # A retry of a real payment replays the stored response (one debit total).
    idem_fp = _req_fingerprint(current_user["id"], req)
    replay = _claim_idempotency(con, current_user["id"], req.idempotency_key, idem_fp)
    if replay is not None:
        return replay

    # observe=False: the graph must only ever record money that actually moved.
    # We do not know the verdict yet, so the edge is recorded after the transfer
    # commits (see engine.observe below) — never for a BLOCK, and for a REVIEW
    # only once the OTP passes.
    out = fraud_score(feats)
    # blacklisted receiver = definitive auto-block (like real PSP/bank policy)
    if feats["receiver_blacklisted"] and out["label"] != "BLOCK":
        out["label"] = "BLOCK"; out["score"] = 100
        out["reasons"] = ["Receiver is on the fraud blacklist (auto-blocked)"] + out["reasons"][:3]
    out["latency_ms"] = round((time.perf_counter() - t0) * 1000, 2)
    sid, rid = feats["_sender_id"], feats["_receiver_id"]

    # create transaction row (with RRN / UPI reference number)
    status = {"SAFE": "success", "REVIEW": "pending", "BLOCK": "rejected"}[out["label"]]
    rrn = str(random.randint(10**11, 10**12 - 1))     # 12-digit RRN
    cur = con.execute("""INSERT INTO transactions
        (txn_ref, sender_account_id, receiver_account_id, amount, type, channel, status,
         ip_address, device_id, hour, score, label, reasons, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (rrn, sid, rid, req.amount, req.type, req.channel, status, "0.0.0.0", None,
         feats["hour"], out["score"], out["label"], json.dumps(out["reasons"]), now_iso()))
    txid = cur.lastrowid
    out["txn_ref"] = rrn
    _log_fraud(con, txid, out)

    # A detected chain goes to the bank IMMEDIATELY, whatever the verdict was.
    # Previously only a BLOCK escalated, so a chain scored REVIEW — which is most of
    # them, since the shape alone is not proof — was detected and then went nowhere
    # unless the victim noticed and pressed Recall. The engine reports; the bank
    # rules. Nobody has to click. Filing only: no freeze, no money movement here.
    chain_case = None
    if out.get("ring"):
        chain_case = _file_chain_case_to_bank(con, out["ring"], out, txid)
        _file_chain_victim_cases(con, out["ring"], txid)

    if out["label"] == "BLOCK":
        resp = {"result": "BLOCKED", "transaction_id": txid, **out,
                "message": "Payment blocked by Fraud Shield — money not deducted."}
        # ML high-confidence catch on a fresh receiver -> provisionally block that
        # ACCOUNT and file it to the bank (bank reviews + unblocks if it doesn't hold).
        auto = _ml_provisional_block(con, feats, req.receiver_vpa, txid, out)
        if auto:
            resp["account_action"] = auto
            resp["message"] += (f" Receiver {auto['account_blocked']} provisionally blacklisted "
                                f"+ reported to bank for review (auto-unblocked if the bank clears it).")
        if chain_case:
            resp["chain_case"] = chain_case
            resp["message"] += (" Chain reported to the bank with full evidence — "
                                "the victim did not have to ask.")
        _store_idempotent(con, current_user["id"], req.idempotency_key, 200, resp)
        con.commit(); con.close()
        return resp

    if out["label"] == "REVIEW":
        otp_code = f"{secrets.randbelow(900000) + 100000}"
        con.execute("INSERT INTO otp_verifications (user_id, code, status, attempts, expires_at, created_at) VALUES (?,?,?,?,?,?)",
                    (feats["_user_id"], otp_code, "pending", 0, (datetime.now()+timedelta(minutes=5)).isoformat(), now_iso()))
        
        u_row = con.execute("SELECT phone FROM users WHERE id=?", (feats["_user_id"],)).fetchone()
        u_phone = u_row["phone"] if u_row else ""
        sms_res = send_sms_otp(u_phone, otp_code, context="Payment Verification")

        if sms_res.get("delivered"):
            msg_text = f"Extra verification needed — enter the 6-digit OTP sent to your registered mobile via SMS ({sms_res.get('provider')})."
            del_type = "sms"
        else:
            msg_text = f"Extra verification needed — enter the OTP. Demo mode: no SMS sent, the code is in the server logs. {SMS_DISCLAIMER}"
            del_type = "server_log"

        resp = {"result": "REVIEW", "transaction_id": txid, **out,
                "message": msg_text,
                "delivery": del_type,
                "otp_demo": otp_code}
        if chain_case:
            resp["chain_case"] = chain_case
            resp["message"] += " A mule chain was detected and reported to the bank with full evidence."
        # Replaying REVIEW matters as much as replaying SUCCESS: without it a
        # retry would raise a SECOND pending transaction and a second OTP.
        # Must run before the close — the connection is unusable afterwards.
        _store_idempotent(con, current_user["id"], req.idempotency_key, 200, resp)
        con.commit(); con.close()
        return resp

    # SAFE -> atomic transfer
    try:
        with con:
            if req.channel == "CREDIT_CARD":
                con.execute("UPDATE accounts SET txn_count = txn_count + 1 WHERE id=?", (sid,))
            else:
                cursor = con.execute("UPDATE accounts SET balance = balance - ?, txn_count = txn_count + 1 WHERE id=? AND balance >= ?", (req.amount, sid, req.amount))
                if cursor.rowcount == 0:
                    raise ValueError("Insufficient balance")
            con.execute("UPDATE accounts SET balance = balance + ?, txn_count = txn_count + 1 WHERE id=?", (req.amount, rid))
            # Double-entry: record the movement immutably, IN this same transaction
            # so the ledger and the balances commit together (no dual-write gap).
            _ledger_post(con, rrn, [(sid, -req.amount), (rid, req.amount)])
            # F3: post-payment second look -> flag a completed payment to a newish receiver for recall
            post_review = feats["receiver_account_age_days"] < 90 and not req.receiver_vpa.endswith("@payit")
            post_msg = None
            if post_review:
                con.execute("UPDATE transactions SET status='flagged' WHERE id=?", (txid,))
                con.execute("INSERT INTO alerts (transaction_id, status, severity, created_at) VALUES (?,?,?,?)",
                            (txid, "post_review", "high", now_iso()))
                post_msg = (f"Payment done, but our system flagged it right after. If confirmed fraud, "
                            f"₹{req.amount:.0f} will be returned to you. You can also recall it now.")
    except Exception as e:
        # Log the REAL cause server-side; return a generic message to the client.
        # (Swallowing this silently made a schema bug look like "insufficient balance".)
        traceback.print_exc()
        print(f"[PAY FAILED] txid={txid} sender={req.sender_vpa} -> {type(e).__name__}: {e}")
        con.execute("UPDATE transactions SET status='failed' WHERE id=?", (txid,))
        con.commit()
        con.close()
        raise HTTPException(400, "insufficient balance or transaction failed")

    # Money moved: now the edge is real, so the graph may learn from it.
    fraud_observe(feats)

    new_bal = con.execute("SELECT balance FROM accounts WHERE id=?", (sid,)).fetchone()["balance"]
    resp = {"result": "SUCCESS", "transaction_id": txid, **out,
            "message": "Payment successful.", "sender_balance": new_bal,
            "post_review": post_review, "post_message": post_msg}
    # Store BEFORE closing: a retry that arrives after this point must replay
    # this exact response rather than debit the sender a second time.
    _store_idempotent(con, current_user["id"], req.idempotency_key, 200, resp)
    con.close()
    return resp


@app.post("/pay/verify-otp")
def verify_otp(req: OtpReq, current_user: dict = Depends(get_current_user)):
    con = db()
    tx = con.execute("SELECT * FROM transactions WHERE id=? AND status='pending'", (req.pending_txn_id,)).fetchone()
    if not tx:
        con.close(); raise HTTPException(404, "pending transaction not found")
    if tx["sender_account_id"] != current_user["id"]:
        con.close(); raise HTTPException(403, "Unauthorized to verify OTP for this transaction")
    # Scope OTP lookup to the sender's user_id to prevent cross-user OTP use
    sender_acc = con.execute("SELECT user_id FROM accounts WHERE id=?", (tx["sender_account_id"],)).fetchone()
    if not sender_acc:
        con.close(); raise HTTPException(400, "invalid transaction")
    user_id = sender_acc["user_id"]
    otp = con.execute(
        "SELECT * FROM otp_verifications WHERE user_id=? AND status='pending' AND expires_at > ? ORDER BY id DESC LIMIT 1",
        (user_id, datetime.now().isoformat())
    ).fetchone()

    if not otp:
        con.close(); raise HTTPException(400, "OTP expired or not found. Please request a new one.")

    if otp["attempts"] >= 3:
        con.execute("UPDATE otp_verifications SET status='expired' WHERE id=?", (otp["id"],))
        con.execute("UPDATE transactions SET status='rejected' WHERE id=?", (tx["id"],))
        con.commit(); con.close()
        raise HTTPException(423, "Too many wrong OTP attempts. Transaction cancelled.")

    if otp["code"] != req.otp:
        new_attempts = otp["attempts"] + 1
        con.execute("UPDATE otp_verifications SET attempts = ? WHERE id=?", (new_attempts, otp["id"]))
        if new_attempts >= 3:
            con.execute("UPDATE otp_verifications SET status='expired' WHERE id=?", (otp["id"],))
            con.execute("UPDATE transactions SET status='rejected' WHERE id=?", (tx["id"],))
            con.commit(); con.close()
            raise HTTPException(423, "Too many wrong OTP attempts. Transaction cancelled.")
        else:
            con.commit(); con.close()
            left = 3 - new_attempts
            raise HTTPException(400, f"Incorrect OTP. {left} attempt(s) remaining.")
    # OTP ok -> complete transfer via transaction
    try:
        with con:
            # CAS, and it must be the FIRST statement that runs here. The check
            # at the top of this handler was a SELECT, which takes no lock, so
            # two concurrent verifies of the same pending txn both passed it and
            # both transferred. Measured: ₹60,000 moved for one ₹30,000 payment.
            # The `balance >= ?` guard below does NOT catch this — it prevents
            # overdraft, not duplication; with enough balance both debits are
            # individually valid.
            claimed = con.execute(
                "UPDATE transactions SET status='processing' WHERE id=? AND status='pending'",
                (tx["id"],))
            if claimed.rowcount == 0:
                raise HTTPException(409, "This payment is already being processed or is no longer pending.")

            con.execute("UPDATE otp_verifications SET status='verified' WHERE id=?", (otp["id"],))
            # Step-up succeeded -> promote THIS device to 'active' so the ₹2,000
            # new-device cap lifts for future payments. Only the fingerprint that
            # just passed an OTP is trusted; a bare login never reaches here.
            if req.device_id:
                con.execute(
                    "UPDATE devices SET status='active' WHERE user_id=? AND device_fingerprint=? AND status<>'active'",
                    (user_id, req.device_id))
            cursor = con.execute("UPDATE accounts SET balance = balance - ?, txn_count = txn_count + 1 WHERE id=? AND balance >= ?", (tx["amount"], tx["sender_account_id"], tx["amount"]))
            if cursor.rowcount == 0:
                raise ValueError("Insufficient balance")
            con.execute("UPDATE accounts SET balance = balance + ?, txn_count = txn_count + 1 WHERE id=?", (tx["amount"], tx["receiver_account_id"]))
            _ledger_post(con, tx["txn_ref"] or f"tx:{tx['id']}",
                         [(tx["sender_account_id"], -tx["amount"]), (tx["receiver_account_id"], tx["amount"])])
            # F3: post-payment second look (newish receiver -> flag for recall even after OTP)
            r_row = con.execute("SELECT account_age_days, vpa FROM accounts WHERE id=?", (tx["receiver_account_id"],)).fetchone()
            rage = r_row["account_age_days"]
            r_vpa = r_row["vpa"]
            post_review = rage < 90 and not r_vpa.endswith("@payit")
            post_msg = None
            if post_review:
                con.execute("UPDATE transactions SET status='flagged' WHERE id=?", (tx["id"],))
                con.execute("INSERT INTO alerts (transaction_id, status, severity, created_at) VALUES (?,?,?,?)",
                            (tx["id"], "post_review", "high", now_iso()))
                post_msg = (f"Payment done, but our system flagged it right after. If confirmed fraud, "
                            f"₹{tx['amount']:.0f} will be returned to you. You can also recall it now.")
            else:
                con.execute("UPDATE transactions SET status='success' WHERE id=?", (tx["id"],))
    except HTTPException:
        # A deliberate verdict (e.g. the 409 from losing the CAS race). The other
        # request owns this transaction and is completing it — marking it 'failed'
        # here would corrupt a payment that is going through fine.
        raise
    except Exception as e:
        traceback.print_exc()
        print(f"[VERIFY-OTP FAILED] txid={tx['id']} -> {type(e).__name__}: {e}")
        con.execute("UPDATE transactions SET status='failed' WHERE id=?", (tx["id"],))
        con.commit()
        con.close()
        raise HTTPException(400, "insufficient balance or transaction failed")

    # OTP passed and the transfer committed, so this edge is real money movement
    # and the graph may learn from it. A REVIEW that never cleared its OTP never
    # reaches this line — which is the point.
    s_vpa = con.execute("SELECT vpa FROM accounts WHERE id=?", (tx["sender_account_id"],)).fetchone()["vpa"]
    d_vpa = con.execute("SELECT vpa FROM accounts WHERE id=?", (tx["receiver_account_id"],)).fetchone()["vpa"]
    fraud_observe({"sender_vpa": s_vpa, "receiver_vpa": d_vpa,
                    "amount": tx["amount"], "ts": int(time.time())})

    bal = con.execute("SELECT balance FROM accounts WHERE id=?", (tx["sender_account_id"],)).fetchone()["balance"]
    con.close()
    return {"result": "SUCCESS", "transaction_id": tx["id"], "message": "Verified — payment completed.",
            "sender_balance": bal, "post_review": post_review, "post_message": post_msg}


@app.post("/pay/resend-otp")
def resend_otp(req: ResendOtpReq):
    """Resend OTP for a pending transaction (invalidates old code)."""
    con = db()
    tx = con.execute("SELECT * FROM transactions WHERE id=? AND status='pending'", (req.pending_txn_id,)).fetchone()
    if not tx:
        con.close(); raise HTTPException(404, "pending transaction not found")
    sender_acc = con.execute("SELECT user_id FROM accounts WHERE id=?", (tx["sender_account_id"],)).fetchone()
    user_id = sender_acc["user_id"]
    # Expire all existing OTPs for this user
    con.execute("UPDATE otp_verifications SET status='expired' WHERE user_id=? AND status='pending'", (user_id,))
    new_code = f"{secrets.randbelow(900000) + 100000}"
    con.execute("INSERT INTO otp_verifications (user_id, code, status, attempts, expires_at, created_at) VALUES (?,?,?,?,?,?)",
                (user_id, new_code, "pending", 0, (datetime.now()+timedelta(minutes=5)).isoformat(), now_iso()))
    u_row = con.execute("SELECT phone FROM users WHERE id=?", (user_id,)).fetchone()
    u_phone = u_row["phone"] if u_row else ""
    sms_res = send_sms_otp(u_phone, new_code, context="Resend OTP")

    if sms_res.get("delivered"):
        return {
            "result": "reissued",
            "message": f"New OTP sent via SMS ({sms_res.get('provider')}) to your registered phone.",
            "delivery": "sms",
            "provider": sms_res.get("provider")
        }

    return {"result": "reissued",
            "message": f"New OTP generated. Demo mode: no SMS sent, the code is in the server logs. {SMS_DISCLAIMER}",
            "delivery": "server_log",
            "otp_demo": new_code}


def _execute_reversal(con, tx):
    """Move money back for an APPROVED reversal — the BANK's booking action.

    This is the settlement leg (ISO 20022 pacs.004, return-reason FOCR = "following
    cancellation request"). It is only ever called after the bank has ADJUDICATED
    and approved (see /bank/reversal-request); it is NOT a caller-initiated clawback.

    Returns (ok: bool, info: dict). ok=False with reason 'funds_gone' means the
    money has left the account — no one can conjure it back; it's a 1930/court
    matter. CAS on status + guarded debit make it concurrency-safe and prevent a
    negative balance (both measured bugs in the old sender-side recall).
    """
    txid = tx["id"]
    sid, rid, amt = tx["sender_account_id"], tx["receiver_account_id"], tx["amount"]
    with con:
        con.execute("SELECT id FROM accounts WHERE id IN (?,?) ORDER BY id FOR UPDATE", (sid, rid))
        cur = con.execute(
            "UPDATE transactions SET status='reversed' WHERE id=? AND status IN ('success','flagged')",
            (txid,))
        if cur.rowcount == 0:
            return False, {"reason": "already_reversed"}
        cur = con.execute(
            "UPDATE accounts SET balance = balance - ? WHERE id=? AND balance >= ?",
            (amt, rid, amt))
        if cur.rowcount == 0:
            left = con.execute("SELECT balance FROM accounts WHERE id=?", (rid,)).fetchone()["balance"]
            # roll the status flip back — nothing was reversed
            con.execute("UPDATE transactions SET status=? WHERE id=?", (tx["status"], txid))
            return False, {"reason": "funds_gone", "remaining": float(left)}
        con.execute("UPDATE accounts SET balance = balance + ? WHERE id=?", (amt, sid))
        _ledger_post(con, f"rev:{tx['txn_ref'] or txid}", [(rid, -amt), (sid, amt)],
                     kind="reversal", reverses=tx["txn_ref"] or f"tx:{txid}")
    return True, {"reason": "reversed"}


@app.get("/bank/pending")
def bank_pending(con=Depends(get_db)):
    """The BANK's inbox — what the fraud engine has escalated, and what the bank decided.

    Makes the hand-off visible: the app/ML never moves another bank's money or freezes an
    account on its own authority; it files a REQUEST and the bank adjudicates. This endpoint
    is that queue, so a reviewer can see (a) accounts the ML provisionally blocked and is
    waiting on, (b) reversals held for a law-enforcement reference, and (c) what the bank
    already ruled.
    """
    pending_accounts = con.execute(
        """SELECT fr.reported_vpa AS vpa, fr.reason, fr.created_at,
                  a.account_age_days AS age_days, a.is_merchant, a.blacklisted
           FROM fraud_reports fr JOIN accounts a ON a.vpa = fr.reported_vpa
           WHERE fr.reporter_vpa='SYSTEM/ML' AND fr.status='ml_provisional'
           ORDER BY fr.id DESC LIMIT 20""").fetchall()

    pending_reversals = con.execute(
        """SELECT al.transaction_id, t.amount, sa.vpa AS payer, ra.vpa AS payee, al.created_at
           FROM alerts al JOIN transactions t ON t.id = al.transaction_id
                JOIN accounts sa ON sa.id = t.sender_account_id
                JOIN accounts ra ON ra.id = t.receiver_account_id
           WHERE al.status='reversal_pending'
           ORDER BY al.id DESC LIMIT 20""").fetchall()

    decided = con.execute(
        """SELECT reported_vpa AS vpa, status, reason, created_at
           FROM fraud_reports
           WHERE reporter_vpa='SYSTEM/ML' AND status IN ('confirmed','cleared')
           ORDER BY id DESC LIMIT 20""").fetchall()

    # The engine files structured evidence (chain path, per-hop timing, each
    # account's verifiable attributes). Parse it out so the desk can show the case
    # instead of a one-line assertion the reviewer would have to take on trust.
    def _expand(rows):
        out_rows = []
        for r in rows:
            d = dict(r)
            raw = d.get("reason") or ""
            if raw.startswith("{"):
                try:
                    d["evidence_bundle"] = json.loads(raw)
                    d["reason"] = "Mule chain detected: " + " → ".join(d["evidence_bundle"].get("path", []))
                except Exception:
                    pass
            out_rows.append(d)
        return out_rows

    return {
        "pending_account_reviews": _expand(pending_accounts),
        "pending_reversals": [dict(r) for r in pending_reversals],
        "bank_decisions": _expand(decided),
        "note": ("The fraud engine REQUESTS; the bank decides. A provisional ML block is "
                 "cleared (account unblocked) if the bank's own evidence doesn't hold."),
    }


class ReversalResolveReq(BaseModel):
    txn_id: int
    cfcfrms_ref: str = ""     # the reference the operator actually received (1930 / CFCFRMS)
    approve: bool = True


@app.post("/bank/resolve-reversal")
def bank_resolve_reversal(req: ReversalResolveReq, con=Depends(get_db)):
    """Bank-side resolution of a HELD reversal — the only path that moves money back.

    It lives on the bank's desk, not in the payer's app, and it will not approve
    without a law-enforcement reference that the OPERATOR supplies. The payer can
    report; only the bank can reverse. (ISO 20022: camt.029 resolution -> pacs.004
    return on approval; RJCR/NARR on rejection.)
    """
    tx = con.execute("SELECT * FROM transactions WHERE id=?", (req.txn_id,)).fetchone()
    if not tx:
        raise HTTPException(404, "transaction not found")

    if not req.approve:
        con.execute("""UPDATE alerts SET status='reversal_rejected'
                       WHERE transaction_id=? AND status='reversal_pending'""", (req.txn_id,))
        con.commit()
        return {"decision": "RJCR", "reason_code": "NARR", "outcome": "rejected",
                "transaction_id": req.txn_id,
                "message": "Bank declined the reversal — the case did not hold on review."}

    if not req.cfcfrms_ref.strip():
        raise HTTPException(400, "A law-enforcement reference (1930 / CFCFRMS) is required "
                                 "before this bank can reverse a settled payment.")

    # Re-run the same adjudication, now WITH the reference the operator holds.
    result = bank_reversal_request(
        ReversalReq(txn_id=req.txn_id, cfcfrms_ref=req.cfcfrms_ref.strip(), reason="FRAD"), con)
    if result.get("outcome") == "reversed":
        con.execute("""UPDATE alerts SET status='reversal_done'
                       WHERE transaction_id=? AND status='reversal_pending'""", (req.txn_id,))
        con.commit()
    return result


class AccountReviewReq(BaseModel):
    vpa: str


@app.post("/bank/review-account")
def bank_review_account(req: AccountReviewReq, con=Depends(get_db)):
    """Bank reviews an ML-provisionally-blocked account and CONFIRMS or CLEARS it on
    its OWN evidence (recent fan-in, account age, independent human reports).

    This is the safety net that makes ML auto-blocking acceptable: the ML block is a
    HOLD, and the bank — the authority over the account — decides. A genuine account
    the ML wrongly caught (e.g. because the payer's device was screen-shared) is
    UNBLOCKED here. The ML's own SYSTEM/ML report is NOT counted as evidence (that
    would be circular — the block justifying itself).
    """
    acc = con.execute("SELECT * FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
    if not acc:
        raise HTTPException(404, "account not found")

    day = (datetime.now() - timedelta(hours=24)).isoformat()
    fan_in = con.execute(
        """SELECT COUNT(DISTINCT sender_account_id) c FROM transactions
           WHERE receiver_account_id=? AND status IN ('success','flagged') AND created_at > ?""",
        (acc["id"], day)).fetchone()["c"]
    age = _account_age_days(acc)
    human_reports = con.execute(
        "SELECT COUNT(*) c FROM fraud_reports WHERE reported_vpa=? AND reporter_vpa <> 'SYSTEM/ML'",
        (req.vpa,)).fetchone()["c"]
    is_merchant = bool(acc["is_merchant"])
    # bank's independent bar — mirrors /bank/reversal-request. A merchant, or an
    # established account with no fan-in and no human report, does NOT hold.
    strong = (not is_merchant) and (fan_in >= 5 or age < 10 or human_reports >= 1)
    evidence = {"fan_in_24h": fan_in, "account_age_days": age,
                "human_reports": human_reports, "is_merchant": is_merchant}

    if strong:
        con.execute("UPDATE fraud_reports SET status='confirmed' WHERE reported_vpa=? AND status='ml_provisional'",
                    (req.vpa,))
        con.execute("UPDATE blacklist SET reason=? WHERE entity_value=? AND entity_type='account'",
                    (f"Bank CONFIRMED (fan-in {fan_in}, age {age}d, {human_reports} human report(s))", req.vpa))

        # Confirming an account is fraud did nothing for the people whose money is
        # sitting in it. The two rulings were disconnected: the desk could declare an
        # account a mule and the victims' claims stayed wherever they were, for
        # somebody to find later. Every settled payment INTO a confirmed account is
        # now queued as a claim right here, so the operator sees who is owed what at
        # the moment they confirm. Still only queued — returning the money remains
        # /bank/resolve-reversal, and still needs a law-enforcement reference.
        victims = con.execute(
            """SELECT t.id, t.amount, sa.vpa AS payer FROM transactions t
               JOIN accounts sa ON sa.id = t.sender_account_id
               WHERE t.receiver_account_id=? AND t.status IN ('success','flagged')
               ORDER BY t.id DESC LIMIT 25""", (acc["id"],)).fetchall()
        claims = []
        for v in victims:
            dup = con.execute("""SELECT 1 FROM alerts WHERE transaction_id=?
                                 AND status IN ('reversal_pending','reversal_done')""", (v["id"],)).fetchone()
            if dup:
                continue
            con.execute("""INSERT INTO alerts (transaction_id, status, severity, created_at)
                           VALUES (?,?,?,?)""", (v["id"], "reversal_pending", "critical", now_iso()))
            claims.append({"transaction_id": v["id"], "amount": float(v["amount"]), "payer": v["payer"]})
        con.commit()
        owed = sum(c["amount"] for c in claims)
        return {"decision": "CONFIRMED", "outcome": "account_stays_blocked", "vpa": req.vpa,
                "evidence": evidence, "victim_claims_queued": claims,
                "message": (f"Bank review: evidence holds — {req.vpa} confirmed, account stays blocked."
                            + (f" {len(claims)} victim claim(s) totalling ₹{owed:,.0f} queued for reversal."
                               if claims else ""))}

    # weak -> UNBLOCK (reverse the ML's provisional block)
    con.execute("UPDATE accounts SET blacklisted=0 WHERE vpa=?", (req.vpa,))
    con.execute("DELETE FROM blacklist WHERE entity_value=? AND entity_type='account'", (req.vpa,))
    con.execute("UPDATE fraud_reports SET status='cleared' WHERE reported_vpa=? AND status='ml_provisional'",
                (req.vpa,))
    con.commit()
    return {"decision": "CLEARED", "outcome": "account_unblocked", "vpa": req.vpa,
            "evidence": evidence,
            "message": f"Bank review: evidence does not hold — {req.vpa} UNBLOCKED (ML false positive reversed)."}


class ReversalReq(BaseModel):
    txn_id: int
    cfcfrms_ref: str = ""      # law-enforcement / 1930 reference; without it the bank can hold but not reverse
    reason: str = "FRAD"       # ISO 20022 cancellation reason (FRAD = fraudulent origin)


@app.post("/bank/reversal-request")
def bank_reversal_request(req: ReversalReq, con=Depends(get_db)):
    """The BENEFICIARY BANK's fraud desk — adjudicates a reversal request.

    This is the honest 'report-and-request' model (ISO 20022 camt.056 request ->
    camt.029 resolution -> pacs.004 return; UPI's UDIR; SWIFT gpi Stop&Recall). The
    fraud engine / a victim REQUESTS a reversal with a reason; the BANK decides on
    ITS OWN criteria and only it moves money. The app never debits an account —
    which is why the old sender-side 'recall' was wrong (an app reaching into
    someone's account has no authority; even a fraudster gets due process).

    The decision is deliberately NOT "the requester said fraud, so yes." The bank
    checks things the requester cannot assert, using its OWN records:
      1. EVIDENCE BAR  — blacklisted receiver, OR high recent fan-in, OR a fresh
                         account forwarding money (the bank's independent read).
                         Weak -> REJECTED. It won't act on the report alone.
      2. LEGAL AUTHORITY — a real bank freezes/reverses on a law-enforcement notice
                         (India: CFCFRMS/1930 under BNSS §§168/94), not a customer's
                         word. No cfcfrms_ref -> it can only HOLD (lien), not reverse
                         (ISO reject-reason RQDA: 'requested debit authority').
      3. FUNDS PRESENT — a lien only reaches money still there. Gone -> REJECTED
                         (ISO AM04: insufficient funds) -> a 1930/court recovery.

    NOTE (honest): this 'bank' is simulated in the same backend — the separation of
    authority is architectural, not a real second institution. But the decision
    logic and the ISO reason codes are real, and the bank uses its own account data.
    """
    tx = con.execute("SELECT * FROM transactions WHERE id=?", (req.txn_id,)).fetchone()
    if not tx:
        raise HTTPException(404, "transaction not found")
    if tx["status"] == "reversed":
        return {"decision": "RJCR", "reason_code": "ARDT", "outcome": "already_reversed",
                "message": "This payment was already reversed."}

    rid, amt = tx["receiver_account_id"], tx["amount"]
    mule = con.execute("SELECT vpa, balance, blacklisted, account_age_days, is_merchant FROM accounts WHERE id=?",
                       (rid,)).fetchone()

    # ---- 1. bank's OWN evidence read (not the requester's word) ----
    day = (datetime.now() - timedelta(hours=24)).isoformat()
    fan_in = con.execute(
        """SELECT COUNT(DISTINCT sender_account_id) c FROM transactions
           WHERE receiver_account_id=? AND status IN ('success','flagged') AND created_at > ?""",
        (rid, day)).fetchone()["c"]
    age = _account_age_days(mule)
    is_merchant = bool(mule["is_merchant"])
    # Merchants legitimately have high fan-in and can be new, so their fan-in/age
    # is NOT evidence of muling — only a blacklist hit counts against a merchant.
    strong = bool(mule["blacklisted"]) or (not is_merchant and (fan_in >= 5 or age < 10))
    evidence = {"blacklisted": bool(mule["blacklisted"]), "fan_in_24h": fan_in,
                "receiver_age_days": age, "is_merchant": is_merchant}

    if not strong:
        return {"decision": "RJCR", "reason_code": "NARR", "outcome": "rejected",
                "evidence": evidence,
                "message": "Bank review: evidence does not meet the bar to act on a mule "
                           "suspicion. We do not reverse on a report alone."}

    # ---- 2. legal authority (LEA / CFCFRMS reference) ----
    if not req.cfcfrms_ref:
        # can mark a lien-style hold, but cannot reverse without a law-enforcement ref
        con.execute("INSERT INTO alerts (transaction_id, status, severity, created_at) VALUES (?,?,?,?)",
                    (tx["id"], "reversal_pending", "high", now_iso()))
        con.commit()
        return {"decision": "PDCR", "reason_code": "RQDA", "outcome": "lien_pending",
                "evidence": evidence,
                "message": "Bank review: evidence accepted, but a reversal needs a law-enforcement "
                           "reference (file at 1930 / cybercrime.gov.in). Funds flagged / held pending that."}

    # ---- 3. funds present? then reverse (pacs.004 FOCR) ----
    ok, info = _execute_reversal(con, tx)
    if not ok and info["reason"] == "funds_gone":
        con.execute("INSERT INTO alerts (transaction_id, status, severity, created_at) VALUES (?,?,?,?)",
                    (tx["id"], "reversal_failed_funds_gone", "critical", now_iso()))
        con.commit()
        return {"decision": "RJCR", "reason_code": "AM04", "outcome": "funds_gone",
                "evidence": evidence, "remaining": info.get("remaining"),
                "message": f"Bank review: reversal approved but ₹{amt:.0f} already moved on "
                           f"(only ₹{info.get('remaining',0):.0f} left). Escalated to law enforcement (1930)."}
    if not ok:
        return {"decision": "RJCR", "reason_code": "ARDT", "outcome": info["reason"],
                "message": "Already reversed."}

    return {"decision": "ACCR", "reason_code": "FOCR", "outcome": "reversed",
            "transaction_id": tx["id"], "amount": amt, "evidence": evidence,
            "message": f"Bank approved reversal — ₹{amt:.0f} returned to the payer."}


@app.post("/pay/recall/{txid}")
def pay_recall(txid: int, current_user: dict = Depends(get_current_user),
               con=Depends(get_db)):
    """Report a completed payment as fraud and REQUEST a reversal from the bank.

    This no longer claws money back itself (the old version debited the receiver's
    account directly — which an app has no authority to do, even to a fraudster).
    It now files a report to the beneficiary bank's fraud desk, which adjudicates
    (see /bank/reversal-request). A demo CFCFRMS/1930 reference is attached so the
    bank can act; in the real world that reference comes from the victim filing at
    1930 / cybercrime.gov.in.
    """
    tx = con.execute("SELECT * FROM transactions WHERE id=?", (txid,)).fetchone()
    if not tx:
        raise HTTPException(404, "transaction not found")
    if tx["sender_account_id"] != current_user["id"]:
        raise HTTPException(403, "Unauthorized to report this transaction")

    # NO law-enforcement reference is invented here. An earlier version auto-attached
    # a fake "NCRP-DEMO-<id>" ref, which handed the app the bank's authority straight
    # back through a side door: the bank's legal-authority gate always passed, so the
    # payer's tap still pulled money out of someone else's account. That is exactly
    # what routing through the bank was supposed to prevent.
    #
    # So the request goes in BARE. The bank weighs its own evidence and, at most,
    # places a lien. Money moves only when an operator resolves the case at the
    # bank's own desk (/bank/resolve-reversal, surfaced in bank-console).
    result = bank_reversal_request(ReversalReq(txn_id=txid, cfcfrms_ref="", reason="FRAD"), con)

    bal = con.execute("SELECT balance FROM accounts WHERE id=?",
                      (tx["sender_account_id"],)).fetchone()["balance"]
    return {"result": "REPORTED", "transaction_id": txid, "amount": tx["amount"],
            "outcome": result["outcome"],            # lien_pending / rejected / funds_gone
            "message": result["message"],
            "sender_balance": bal,                   # unchanged — nothing moved on your say-so
            "bank_decision": result}


@app.post("/auth/send-otp")
def auth_send_otp(req: SendOtpReq):
    """Generate and 'send' (log) a 6-digit OTP for phone verification during onboarding."""
    phone_clean = "".join(ch for ch in req.phone if ch.isdigit())[-10:]
    otp_code = f"{secrets.randbelow(900000) + 100000}"
    con = db()
    # Store with phone as reference (user may not exist yet for new registrations)
    con.execute(
        "INSERT INTO otp_verifications (user_id, code, status, attempts, expires_at, created_at) VALUES (?,?,?,?,?,?)",
        (0, f"phone:{phone_clean}:{otp_code}", "pending", 0,
         (datetime.now() + timedelta(minutes=10)).isoformat(), now_iso())
    )
    con.commit(); con.close()
    sms_res = send_sms_otp(phone_clean, otp_code, context="Onboarding Verification")
    if sms_res.get("delivered"):
        return {
            "result": "sent",
            "message": f"OTP sent via SMS ({sms_res.get('provider')}) to +91 ****{phone_clean[-4:]}.",
            "delivery": "sms",
            "provider": sms_res.get("provider")
        }
    return {"result": "shown",
            "message": f"Demo mode — no SMS sent to +91 ****{phone_clean[-4:]}. {SMS_DISCLAIMER}",
            "delivery": "on_screen",
            "otp_demo": otp_code}


@app.post("/auth/verify-otp")
def auth_verify_otp(req: VerifyOnboardingOtpReq):
    """Verify the onboarding OTP for a given phone number."""
    phone_clean = "".join(ch for ch in req.phone if ch.isdigit())[-10:]
    code_clean = req.code.strip()
    con = db()
    # Find most recent valid OTP for this phone
    match = con.execute(
        """SELECT * FROM otp_verifications
           WHERE user_id=0 AND status='pending'
           AND code LIKE ? AND expires_at > ?
           ORDER BY id DESC LIMIT 1""",
        (f"phone:{phone_clean}:%", datetime.now().isoformat())
    ).fetchone()
    if not match:
        con.close()
        raise HTTPException(400, "OTP expired or not found. Please request a new one.")
    # Extract the actual code from the stored value "phone:NNNNNNNNNN:XXXXXX"
    stored_code = match["code"].split(":")[-1]
    if stored_code != code_clean:
        con.execute("UPDATE otp_verifications SET attempts = attempts + 1 WHERE id=?", (match["id"],))
        con.commit(); con.close()
        raise HTTPException(400, "Incorrect OTP. Please try again.")
    # Mark as verified
    con.execute("UPDATE otp_verifications SET status='verified' WHERE id=?", (match["id"],))
    con.commit(); con.close()
    return {"result": "verified", "message": "Phone verified successfully."}


# ------------------------------------------------------------------ history / report / stats
@app.get("/transactions/{vpa}")
def history(vpa: str, current_user: dict = Depends(get_current_user)):
    if current_user["vpa"] != vpa:
        raise HTTPException(403, "Unauthorized to view transaction history for this VPA")
    con = db()
    acc = con.execute("SELECT id FROM accounts WHERE vpa=?", (vpa,)).fetchone()
    if not acc:
        con.close(); raise HTTPException(404, "account not found")
    rows = con.execute("""SELECT t.id, t.amount, t.type, t.status, t.label, t.score, t.reasons, t.created_at,
        sa.vpa sender, ra.vpa receiver FROM transactions t
        JOIN accounts sa ON sa.id=t.sender_account_id
        JOIN accounts ra ON ra.id=t.receiver_account_id
        WHERE t.sender_account_id=? OR t.receiver_account_id=?
        ORDER BY t.id DESC LIMIT 25""", (acc["id"], acc["id"])).fetchall()
    con.close()
    res = []
    for r in rows:
        d = dict(r)
        if d.get("reasons"):
            try:
                d["reasons"] = json.loads(d["reasons"])
            except Exception:
                d["reasons"] = []
        else:
            d["reasons"] = []
        res.append(d)
    return res


class ReportReq(BaseModel):
    reported_vpa: str
    reporter_vpa: str = ""
    reason: str = "scam"
    amount_lost: float = 0


@app.get("/fraud/monitor")
def fraud_monitor(window_min: int = 60, con=Depends(get_db)):
    """Post-payment transaction monitoring (the 'second line').

    Inline scoring at /pay can only see ONE payment. A mule ring is only visible
    AFTER the money moves: each victim's deposit into a collection mule looks fine
    on its own, and a pass-through only shows once the account forwards. Real PSPs
    run this as a continuous/batch layer that re-scans COMMITTED transactions and
    raises ALERTS (it never moves money — the money is already gone; recovery is a
    freeze/report action). This endpoint is that layer.

    Detects, over the last `window_min` minutes of committed transfers:
      1. COLLECTION mule  — a fresh, non-merchant account that received from many
                            distinct senders (fan-in)
      2. PASS-THROUGH mule — an account that received and then forwarded most of it
                            out soon after (gather->scatter)
    Merchants and established accounts are excluded (a shop legitimately has fan-in).
    Raises an alert per suspected mule and returns a report a bank could act on.
    """
    cutoff = (datetime.now() - timedelta(minutes=window_min)).isoformat()

    # 1. collection mules: >=5 distinct senders into a fresh non-merchant account
    collection = con.execute(
        """SELECT r.id, r.vpa, COUNT(DISTINCT t.sender_account_id) fan_in,
                  COUNT(*) n, ROUND(SUM(t.amount)::numeric,2) total, r.account_age_days age
           FROM transactions t JOIN accounts r ON r.id=t.receiver_account_id
           WHERE t.status IN ('success','flagged') AND t.created_at > ?
             AND r.is_merchant=0 AND r.blacklisted=0
           GROUP BY r.id, r.vpa, r.account_age_days
           HAVING COUNT(DISTINCT t.sender_account_id) >= 5""",
        (cutoff,)).fetchall()

    # 2. pass-through mules: account both received AND sent in the window, and
    #    forwarded out >=70% of what it took in (money didn't stop — it flowed on)
    passthru = con.execute(
        """WITH ins AS (
              SELECT receiver_account_id id, SUM(amount) got FROM transactions
              WHERE status IN ('success','flagged') AND created_at > ? GROUP BY receiver_account_id),
            outs AS (
              SELECT sender_account_id id, SUM(amount) sent FROM transactions
              WHERE status IN ('success','flagged') AND created_at > ? GROUP BY sender_account_id)
           SELECT a.id, a.vpa, ROUND(ins.got::numeric,2) got, ROUND(outs.sent::numeric,2) sent,
                  a.account_age_days age
           FROM ins JOIN outs ON outs.id=ins.id JOIN accounts a ON a.id=ins.id
           WHERE a.is_merchant=0 AND a.blacklisted=0 AND ins.got > 0
             AND outs.sent >= 0.70 * ins.got""",
        (cutoff, cutoff)).fetchall()

    suspects, alerted = [], 0
    seen = set()
    for r in collection:
        seen.add(r["id"])
        suspects.append({"vpa": r["vpa"], "pattern": "collection", "fan_in": r["fan_in"],
                         "victims": r["n"], "total": float(r["total"]), "age_days": r["age"]})
        # alert every inbound transaction (the victims) for this mule
        cur = con.execute(
            """INSERT INTO alerts (transaction_id, status, severity, created_at)
               SELECT id, 'mule_suspect', 'high', ? FROM transactions
               WHERE receiver_account_id=? AND status IN ('success','flagged') AND created_at > ?
                 AND id NOT IN (SELECT transaction_id FROM alerts WHERE status='mule_suspect' AND transaction_id IS NOT NULL)""",
            (now_iso(), r["id"], cutoff))
        alerted += cur.rowcount or 0
    for r in passthru:
        if r["id"] in seen:
            continue
        suspects.append({"vpa": r["vpa"], "pattern": "pass_through",
                         "received": float(r["got"]), "forwarded": float(r["sent"]), "age_days": r["age"]})
    con.commit()

    return {
        "window_minutes": window_min,
        "suspected_mules": len(suspects),
        "alerts_raised": alerted,
        "suspects": suspects,
        "note": ("Post-payment monitoring: money already moved, so this RAISES ALERTS "
                 "for review / freeze-request — it does not (and cannot) unilaterally "
                 "reverse another bank's account. That is a bank/1930 action."),
    }


@app.post("/report")
def report(req: ReportReq):
    con = db()
    con.execute("INSERT INTO fraud_reports (reported_vpa, reporter_vpa, reason, amount_lost, status, created_at) VALUES (?,?,?,?,?,?)",
                (req.reported_vpa, req.reporter_vpa, req.reason, req.amount_lost, "reported", now_iso()))
    # add to blacklist + flag account
    # de-duplicated insert. SQLite's "INSERT OR IGNORE" doesn't exist in PostgreSQL,
    # and blacklist has no UNIQUE constraint to hang ON CONFLICT on, so guard explicitly.
    con.execute("""INSERT INTO blacklist (entity_type, entity_value, reason, created_at)
                   SELECT ?,?,?,? WHERE NOT EXISTS (
                       SELECT 1 FROM blacklist WHERE entity_type=? AND entity_value=?)""",
                ("account", req.reported_vpa, req.reason, now_iso(),
                 "account", req.reported_vpa))
    con.execute("UPDATE accounts SET blacklisted=1 WHERE vpa=?", (req.reported_vpa,))
    con.commit(); con.close()
    return {"result": "reported", "message": f"{req.reported_vpa} flagged + blacklisted. Bank/police can act."}


@app.get("/ledger/verify")
def ledger_verify(con=Depends(get_db)):
    """Reconciliation: prove the ledger is internally consistent. Real PSPs run
    this against the switch's files; we run it against our own two invariants:
      1. every transfer's legs sum to zero (no money created/destroyed)
      2. every account's balance == SUM of its ledger entries (cache matches truth)
      3. SUM of ALL entries == 0 (the whole system conserves money)
    """
    # 1. transfers that don't net to zero
    bad_transfers = con.execute(
        """SELECT transfer_id, ROUND(SUM(amount),2) net FROM ledger_entries
           GROUP BY transfer_id HAVING ROUND(SUM(amount),2) <> 0""").fetchall()
    # 2. accounts whose cached balance != SUM(entries)
    drift = con.execute(
        """SELECT a.vpa, ROUND(a.balance::numeric,2) balance, COALESCE(SUM(l.amount),0) ledger
           FROM accounts a LEFT JOIN ledger_entries l ON l.account_id=a.id
           GROUP BY a.vpa, a.balance
           HAVING ROUND(a.balance::numeric,2) <> COALESCE(SUM(l.amount),0)""").fetchall()
    # 3. whole-system sum
    total = con.execute("SELECT COALESCE(SUM(amount),0) s FROM ledger_entries").fetchone()["s"]
    n = con.execute("SELECT COUNT(*) c FROM ledger_entries").fetchone()["c"]
    ok = not bad_transfers and not drift and round(float(total), 2) == 0
    return {
        "consistent": ok,
        "entries": n,
        "system_sum": round(float(total), 2),          # must be 0
        "unbalanced_transfers": [dict(r) for r in bad_transfers],
        "balance_drift": [dict(r) for r in drift],
        "message": "Ledger reconciles — money conserved, cache matches entries." if ok
                   else "RECONCILIATION FAILED — investigate.",
    }


@app.get("/dashboard/stats")
def stats():
    try:
        con = db()
        def one(sql, *a):
            r = con.execute(sql, a if a else ()).fetchone()
            if not r: return 0
            d = dict(r) if hasattr(r, 'keys') else {}
            return list(d.values())[0] if d else (r[0] if r else 0)
        total = one("SELECT COUNT(*) FROM transactions")
        blocked = one("SELECT COUNT(*) FROM transactions WHERE label='BLOCK'")
        review = one("SELECT COUNT(*) FROM transactions WHERE label='REVIEW'")
        alerts = one("SELECT COUNT(*) FROM alerts WHERE status='open'")
        recent_rows = con.execute("""SELECT t.amount, t.label, t.score, sa.vpa sender, ra.vpa receiver
            FROM transactions t JOIN accounts sa ON sa.id=t.sender_account_id
            JOIN accounts ra ON ra.id=t.receiver_account_id
            WHERE t.label IS NOT NULL ORDER BY t.id DESC LIMIT 10""").fetchall()
        recent = [dict(r) for r in recent_rows] if recent_rows else []
        con.close()
        return {"total": total, "blocked": blocked, "review": review, "open_alerts": alerts, "recent": recent}
    except Exception as e:
        return {"total": 0, "blocked": 0, "review": 0, "open_alerts": 0, "recent": [], "error": str(e)}


# ============================================================================
#  SCORE ANALYSER  —  standalone fraud "control room" dashboard backend
# ============================================================================
#  This is NOT part of the Payit app. It is an observability surface for
#  analysts: it takes a would-be transaction and REPLAYS it through the whole
#  pipeline (app-level auth -> backend checks -> fraud engine) WITHOUT moving
#  any money, returning a stage-by-stage trace with the running score.
#
#  Design notes wired to the request:
#    * app level  -> device login, UPI PIN / password, VPA match  (auth from DB)
#    * backend    -> sender/receiver resolve + balance check
#    * engine     -> model + rules + graph, cumulative score count
#    * "an account that doesn't exist GOES FORWARD" -> a missing VPA is not a
#      hard stop; it is treated as an unknown, brand-new, high-risk beneficiary
#      and the pipeline continues so the analyst still sees the full verdict.
# ============================================================================

class AnalyzeReq(BaseModel):
    sender_vpa: str
    receiver_vpa: str
    amount: float = Field(gt=0)
    pin: str = ""
    device_id: str = ""
    type: str = "PAY"
    channel: str = "MANUAL"
    reverse: int = 0
    screen_share: int = 0
    rooted: int = 0
    sim_mismatch: int = 0


def _synth_account(vpa: str) -> dict:
    """A synthetic 'unknown' profile for a VPA not present in the DB.
    Deliberately risky defaults (age 0, no history) so a non-existent account
    still flows through scoring and surfaces as a fresh/unknown beneficiary."""
    return {
        "id": -1, "user_id": -1, "vpa": vpa, "balance": 0.0,
        "account_age_days": 0, "kyc_level": "BASIC", "is_merchant": 0,
        "avg_amount": 1500.0, "usual_hours": "7-22", "home_device": None,
        "txn_count": 0, "blacklisted": 0,
    }


def _enrich_tolerant(con, sender, receiver, t):
    """Same feature vector as enrich_from_db, but NEVER raises on a missing
    account — a non-existent VPA is replaced with a synthetic unknown profile
    and the pipeline goes forward. Returns (feats, s_row, r_row, s_found, r_found)."""
    s = con.execute("SELECT * FROM accounts WHERE vpa=?", (sender,)).fetchone()
    r = con.execute("SELECT * FROM accounts WHERE vpa=?", (receiver,)).fetchone()
    s_found, r_found = s is not None, r is not None
    s = dict(s) if s else _synth_account(sender)
    r = dict(r) if r else _synth_account(receiver)

    amount = t.amount
    avg = float(s["avg_amount"] or 1500)
    try:
        a, b = str(s["usual_hours"]).split("-"); usual = set(range(int(a), int(b)))
    except Exception:
        usual = set(range(6, 22))

    win = (datetime.now() - timedelta(seconds=60)).isoformat()   # ISO cutoff (DB-agnostic)
    prior = con.execute(
        "SELECT COUNT(*) c FROM transactions WHERE sender_account_id=? AND receiver_account_id=?",
        (s["id"], r["id"])).fetchone()["c"]
    first_time = int(prior == 0)
    velocity = con.execute(
        "SELECT COUNT(*) c FROM transactions WHERE sender_account_id=? AND created_at > ?",
        (s["id"], win)).fetchone()["c"]
    fan_in = con.execute(
        "SELECT COUNT(DISTINCT sender_account_id) c FROM transactions WHERE receiver_account_id=? AND created_at > ?",
        (r["id"], win)).fetchone()["c"]
    fan_out = con.execute(
        "SELECT COUNT(DISTINCT receiver_account_id) c FROM transactions WHERE sender_account_id=? AND created_at > ?",
        (s["id"], win)).fetchone()["c"]
    inc = con.execute(
        "SELECT amount FROM transactions WHERE receiver_account_id=? AND created_at > ?",
        (s["id"], win)).fetchall()
    in_chain = int(any(abs(row["amount"] - amount) <= 0.25 * max(amount, 1) for row in inc))
    recent_micro = int(any(row["amount"] < 100 for row in inc))
    fwd = con.execute(
        "SELECT COUNT(*) c FROM transactions WHERE sender_account_id=? AND created_at > ?",
        (r["id"], win)).fetchone()["c"]

    dev = t.device_id or s["home_device"]
    known = 0
    if s["user_id"] != -1:
        known = con.execute(
            "SELECT COUNT(*) c FROM devices WHERE user_id=? AND device_fingerprint=?",
            (s["user_id"], dev)).fetchone()["c"]
    is_new_device = int(known == 0)

    local = receiver.split("@")[0].lower()
    BRAND = ("support", "refund", "help", "care", "update", "bill", "kyc",
             "amazon", "flipkart", "bigbazaar", "irctc", "sbi.", "hdfc.", "shop")

    feats = {
        "sender_vpa": sender, "receiver_vpa": receiver, "amount": amount,
        "hour": datetime.now().hour, "type": t.type, "channel": t.channel,
        "ts": int(time.time()),
        "amount_to_avg_ratio": round(amount / max(avg, 1), 3),
        "odd_hour": int(datetime.now().hour not in usual and datetime.now().hour in range(0, 6)),
        "balance_drawdown": round(amount / max(float(s["balance"] or 1e6), 1), 3),
        "is_new_device": is_new_device, "first_time_payee": first_time,
        "sender_velocity_60s": velocity, "receiver_fan_in_60s": fan_in,
        "sender_fan_out_60s": fan_out, "receiver_forwards_recent": int(fwd > 0),
        "in_mule_chain": in_chain,
        "sender_account_age_days": int(s["account_age_days"] or 365),
        "receiver_account_age_days": int(r["account_age_days"] or 0),
        "sender_txn_count": int(s["txn_count"] or 0),
        "receiver_txn_count": int(r["txn_count"] or 0),
        "sender_is_corporate": int(s["is_merchant"] or 0),
        "receiver_is_merchant": int(r["is_merchant"] or 0),
        "receiver_kyc_basic": int(str(r["kyc_level"]) == "BASIC"),
        "receiver_blacklisted": int(r["blacklisted"] or 0),
        "name_vpa_mismatch": int(any(k in local for k in BRAND) and int(r["is_merchant"] or 0) == 0),
        "is_collect": int(t.type == "COLLECT"), "is_mandate": int(t.type == "MANDATE"),
        "is_qr": int(t.channel == "QR"), "reverse_transfer": int(t.reverse),
        "device_screen_share": int(t.screen_share),
        "device_rooted": int(t.rooted), "sim_carrier_mismatch": int(t.sim_mismatch),
        "recent_micro_credit": recent_micro,
        "_sender_bal": float(s["balance"] or 0), "_device": dev,
    }
    return feats, s, r, s_found, r_found


@app.post("/analyzer/trace")
def analyzer_trace(req: AnalyzeReq):
    """Replay a transaction through the full pipeline (read-only, no money moves)
    and return a stage-by-stage trace with the running fraud score."""
    t0 = time.perf_counter()
    con = db()
    feats, s, r, s_found, r_found = _enrich_tolerant(con, req.sender_vpa, req.receiver_vpa, req)

    stages = []

    def stage(layer, title, status, detail, points=None, meta=None):
        stages.append({"layer": layer, "title": title, "status": status,
                       "detail": detail, "points": points, "meta": meta or {}})

    # ---------------- APP LEVEL: device login ----------------
    dev = req.device_id or (s["home_device"] if s_found else None)
    if not s_found:
        stage("APP", "Device login", "warn",
              "Sender account not on file — device binding cannot be verified. Proceeding.",
              25, {"device_id": dev})
    elif feats["is_new_device"]:
        stage("APP", "Device login", "warn",
              f"New / unrecognised device ({dev}). Not bound to this user in the devices table.",
              25, {"device_id": dev})
    else:
        stage("APP", "Device login", "pass",
              f"Known device ({dev}) — bound to user in devices table.", 0, {"device_id": dev})

    # ---------------- APP LEVEL: UPI PIN / password (auth from DB) ----------------
    if not s_found:
        stage("APP", "UPI PIN / password", "warn",
              "No stored credential hash — sender VPA absent from accounts table. Proceeding.", None)
    else:
        stored = s.get("upi_pin_hash")
        if not req.pin:
            stage("APP", "UPI PIN / password", "warn",
                  "No PIN supplied (analysis mode) — credential not checked.", None)
        elif stored and verify_pin(req.pin, stored):
            stage("APP", "UPI PIN / password", "pass",
                  "PIN verified against the Argon2id+pepper hash in accounts.upi_pin_hash. "
                  "(Real UPI: the PIN never reaches the app — NPCI's Common Library "
                  "captures and PKI-encrypts it on-device. This is a simulated app PIN.)", 0)
        else:
            stage("APP", "UPI PIN / password", "fail",
                  "PIN does NOT match the stored hash — authentication failure.", 40)

    # ---------------- APP LEVEL: VPA match (sender + receiver) ----------------
    if s_found:
        stage("APP", "Sender VPA match", "pass",
              f"{req.sender_vpa} resolves to a real account in the DB.", 0)
    else:
        stage("APP", "Sender VPA match", "fail",
              f"{req.sender_vpa} does not exist in accounts — treated as unknown. Going forward.", 30)

    if r_found:
        badge = "  ⚠ BLACKLISTED" if feats["receiver_blacklisted"] else ""
        stage("BACKEND", "Receiver VPA resolve", "pass" if not feats["receiver_blacklisted"] else "fail",
              f"{req.receiver_vpa} → real account (age {feats['receiver_account_age_days']}d).{badge}",
              40 if feats["receiver_blacklisted"] else 0)
    else:
        stage("BACKEND", "Receiver VPA resolve", "warn",
              f"{req.receiver_vpa} not in mapper — treated as brand-new unknown payee (age 0). Going forward.",
              20)

    # ---------------- BACKEND LEVEL: balance check ----------------
    bal = feats["_sender_bal"]
    if not s_found:
        stage("BACKEND", "Balance check", "warn",
              "Sender balance unknown (no account). Cannot guarantee funds. Proceeding.", None,
              {"balance": bal, "amount": req.amount})
    elif bal >= req.amount:
        stage("BACKEND", "Balance check", "pass",
              f"Sufficient funds — balance ₹{bal:,.0f} ≥ ₹{req.amount:,.0f}.", 0,
              {"balance": bal, "amount": req.amount})
    else:
        stage("BACKEND", "Balance check", "fail",
              f"Insufficient balance — ₹{bal:,.0f} < ₹{req.amount:,.0f}.", None,
              {"balance": bal, "amount": req.amount})

    # ---------------- ENGINE: model + rules + graph ----------------
    # observe=False keeps this endpoint's "read-only" promise honest. It was only
    # read-only w.r.t. the database: scoring used to write the hypothetical edge
    # into the live graph, so replaying a what-if here poisoned the detector that
    # real payments are scored against.
    out = fraud_score(feats)
    comp = out["components"]
    if feats["receiver_blacklisted"] and out["label"] != "BLOCK":
        out["label"] = "BLOCK"; out["score"] = 100
        out["reasons"] = ["Receiver is on the fraud blacklist (auto-blocked)"] + out["reasons"][:3]

    stage("ENGINE", "ML model (XGBoost)", "warn" if comp["model"] >= 40 else "pass",
          f"Learned-pattern fraud probability: {out['fraud_probability']*100:.1f}%.",
          round(comp["model"], 1), {"component": "model"})
    stage("ENGINE", "Rule engine", "warn" if comp["rules"] >= 35 else "pass",
          f"Deterministic risk signals fired → {comp['rules']} pts.",
          comp["rules"], {"component": "rules", "reasons": out["reasons"]})
    ring = out.get("ring") or []
    stage("ENGINE", "Graph / mule-ring", "fail" if ring else ("warn" if comp["graph"] >= 40 else "pass"),
          ("Mule chain detected: " + " → ".join(ring)) if ring else "No mule-ring pattern in the transfer graph.",
          comp["graph"], {"component": "graph", "ring": ring})

    # ---------------- DECISION ----------------
    label = out["label"]
    stage("DECISION", "Blend + escalation → verdict",
          "pass" if label == "SAFE" else ("warn" if label == "REVIEW" else "fail"),
          f"Weighted blend (model 50% / rules 30% / graph 20%) with strong-signal escalation → {label}.",
          out["score"])

    latency = round((time.perf_counter() - t0) * 1000, 2)
    con.close()
    return {
        "input": req.model_dump(),
        "sender_found": s_found, "receiver_found": r_found,
        "stages": stages,
        "cumulative_score": out["score"],
        "label": label,
        "fraud_probability": out["fraud_probability"],
        "components": comp,
        "reasons": out["reasons"],
        "ring": ring,
        "latency_ms": latency,
    }


@app.get("/analyzer/feed")
def analyzer_feed(limit: int = 20):
    """Recent transactions already scored by the app, for the live analyser feed."""
    try:
        con = db()
        rows = con.execute("""
            SELECT t.id, t.txn_ref, t.amount, t.type, t.status, t.label, t.score,
                   t.reasons, t.created_at, sa.vpa sender, ra.vpa receiver
            FROM transactions t
            JOIN accounts sa ON sa.id = t.sender_account_id
            JOIN accounts ra ON ra.id = t.receiver_account_id
            WHERE t.label IS NOT NULL
            ORDER BY t.id DESC LIMIT %s""", (limit,)).fetchall()
        con.close()
        out = []
        for r in rows:
            d = dict(r)
            try:
                d["reasons"] = json.loads(d["reasons"]) if d.get("reasons") else []
            except Exception:
                d["reasons"] = []
            out.append(d)
        return out
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"analyzer/feed error: {e}")


@app.get("/analyzer/counts")
def analyzer_counts():
    """Aggregate score counts for the dashboard header tiles."""
    try:
        con = db()
        def one(sql, *a): return con.execute(sql, *([a] if a else [])).fetchone()[0]
        res = {
            "total": one("SELECT COUNT(*) FROM transactions"),
            "safe": one("SELECT COUNT(*) FROM transactions WHERE label='SAFE'"),
            "review": one("SELECT COUNT(*) FROM transactions WHERE label='REVIEW'"),
            "block": one("SELECT COUNT(*) FROM transactions WHERE label='BLOCK'"),
            "blocked_amount": one("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE label='BLOCK'"),
            "avg_score": round(float(one("SELECT COALESCE(AVG(score),0) FROM transactions WHERE score IS NOT NULL")), 1),
        }
        con.close()
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"analyzer/counts error: {e}")


@app.get("/health")
@app.head("/health")
def health():
    return {"status": "ok", "db": _db_label()}

# ---------------------------------------------------------------- Credit & Cards
class PayCreditBillReq(BaseModel):
    vpa: str
    amount: float
    pin: str = ""

@app.get("/credit/info/{vpa}")
def get_credit_info(vpa: str, current_user: dict = Depends(get_current_user)):
    con = db()
    acc = con.execute("SELECT id, balance FROM accounts WHERE vpa=?", (vpa,)).fetchone()
    if not acc:
        con.close()
        raise HTTPException(404, "Account not found")
    
    # Calculate credit card spends from transactions
    spent_row = con.execute(
        """SELECT COALESCE(SUM(amount), 0) s FROM transactions 
           WHERE sender_account_id=? AND channel='CREDIT_CARD' AND status IN ('success','flagged')""",
        (acc["id"],)).fetchone()
    repaid_row = con.execute(
        """SELECT COALESCE(SUM(amount), 0) s FROM transactions 
           WHERE sender_account_id=? AND channel='CREDIT_BILL_PAY' AND status='success'""",
        (acc["id"],)).fetchone()
    
    cc_spends = max(0.0, float(spent_row["s"]) - float(repaid_row["s"]))
    limit = 100000.0
    con.close()
    
    return {
        "vpa": vpa,
        "credit_limit": limit,
        "cc_spends": cc_spends,
        "available_limit": max(0.0, limit - cc_spends),
        "due_date": "15th of next month",
        "min_due": round(cc_spends * 0.05, 2)
    }

@app.post("/credit/pay-bill")
def pay_credit_bill(req: PayCreditBillReq, current_user: dict = Depends(get_current_user)):
    con = db()
    acc = con.execute("SELECT * FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
    if not acc:
        con.close()
        raise HTTPException(404, "Account not found")
    
    if req.amount <= 0:
        con.close()
        raise HTTPException(400, "Invalid bill amount")
        
    if acc["balance"] < req.amount:
        con.close()
        raise HTTPException(400, "Insufficient savings balance to pay credit card bill")
    
    upi_hash = acc["upi_pin_hash"]
    if req.pin and upi_hash and not verify_pin(req.pin, upi_hash):
        con.close()
        raise HTTPException(401, "Incorrect PIN")
        
    with con:
        con.execute("UPDATE accounts SET balance = balance - ?, txn_count = txn_count + 1 WHERE id=?", (req.amount, acc["id"]))
        con.execute("""INSERT INTO transactions 
                       (sender_account_id, receiver_account_id, amount, status, channel, created_at)
                       VALUES (?,?,?,?,?,?)""",
                    (acc["id"], acc["id"], req.amount, "success", "CREDIT_BILL_PAY", now_iso()))
    
    new_bal = con.execute("SELECT balance FROM accounts WHERE id=?", (acc["id"],)).fetchone()["balance"]
    con.close()
    return {"status": "success", "message": "Credit card bill paid successfully", "balance": new_bal}



# --- mount the standalone control-room dashboard (separate from the app UI) ---
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse

_DASH_DIR = ROOT / "dashboard"

@app.get("/", response_class=HTMLResponse)
def read_index():
    index_path = _DASH_DIR / "index.html"
    if index_path.exists():
        return HTMLResponse(content=index_path.read_text(), status_code=200)
    return HTMLResponse(content="Dashboard HTML not found", status_code=404)

if _DASH_DIR.exists():
    app.mount("/monitor", StaticFiles(directory=str(_DASH_DIR), html=True), name="monitor")


# ---------------------------------------------------------------- WebAuthn
# Real passkey device-binding (py_webauthn). Kept in its own module so the
# ceremony's verification steps stay readable and auditable.
from server.webauthn_routes import router as webauthn_router  # noqa: E402
app.include_router(webauthn_router)
