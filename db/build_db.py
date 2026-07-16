"""
Payit database — schema + curated roster, seeded straight into PostgreSQL.
=========================================================================
PostgreSQL is the ONLY database. This script owns the canonical schema and the
demo roster, and writes both directly to DATABASE_URL — the same DB server/app.py
reads.

  seed:  PYTHONPATH=. .venv/bin/python db/build_db.py            # localhost
         PYTHONPATH=. .venv/bin/python db/build_db.py --yes      # non-local (Neon)

THIS DROPS EVERY TABLE FIRST. There is no undo — back up before pointing it at a
cloud DB:
         PYTHONPATH=. .venv/bin/python db/backup_pg.py backup

HISTORY: seeding used to go build_db.py -> db/payit.db (SQLite) -> migrate_to_pg.py
-> Postgres. The SQLite hop bought nothing and actively misled: migrate_to_pg.py
did not read .env, so the documented pipeline rebuilt a local Postgres while the
app read Neon — the migration "succeeded" and changed nothing the app could see.
SQLite is gone; this script talks to Postgres and nothing else.

WHERE THE CONTENT LIVES
-----------------------
  db/roster.py   — WHO exists and why (the cast, with a note on every row)
  db/history.py  — 60 days of transactions, and only edges a real relationship
                   can explain
  this file      — schema + the machinery that writes both to Postgres

Read those two for the reasoning. In short: ~63 accounts across Om's real circle
(family / flat / office / college), a dozen strangers with no edge to Om at all,
big and local merchants, a LAYERED mule network (collectors -> hops -> aggregator
-> cash-out, plus dormant / merchant-disguised / unwitting types), the brand-name
scams, and two fresh-but-honest accounts so the false-positive cost stays visible.

PINs
----
Argon2id + pepper via server.app.hash_pin, i.e. the exact scheme the server
verifies with. (The old SQLite seed wrote unsalted sha256 and leaned on
db/rehash_pins.py to upgrade them afterwards; seeding the real hash directly
removes that step and never puts a weak hash in the DB at all.)
PAYIT_PIN_PEPPER must match the server's — it is read from the same .env.

  demo login PIN (4-digit) : 1234
  demo UPI PIN   (6-digit) : 123456
"""
from __future__ import annotations

import os
import random
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server.app import hash_pin          # noqa: E402  — the server's exact PIN scheme
from db.roster import ROSTER, is_merchant  # noqa: E402
from db.history import generate as generate_history, profile_stats  # noqa: E402

random.seed(42)

DSN = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/payit")

DEMO_LOGIN_PIN = "1234"
DEMO_UPI_PIN = "123456"

# bank name -> UPI handle. Index+1 is the bank_id; VPA handles must resolve here.
BANKS = [
    ("State Bank of India", "SBIN", "oksbi"),
    ("HDFC Bank", "HDFC", "okhdfc"),
    ("ICICI Bank", "ICIC", "okicici"),
    ("Axis Bank", "UTIB", "okaxis"),
    ("Kotak Mahindra Bank", "KKBK", "okkotak"),
    ("Punjab National Bank", "PUNB", "okpnb"),
    ("Paytm Payments Bank", "PYTM", "paytm"),
    ("PhonePe (Yes Bank)", "YESB", "ybl"),
]
BANK_ID = {handle: i for i, (_, _, handle) in enumerate(BANKS, 1)}

SCHEMA = """
DROP TABLE IF EXISTS idempotency_keys, webauthn_credentials, security_lockouts,
    fraud_reports, otp_verifications, sessions, ip_reputation, blacklist, alerts,
    fraud_scores, transactions, devices, accounts, users, banks CASCADE;

CREATE TABLE banks (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL,
    ifsc_prefix TEXT UNIQUE, upi_handle TEXT
);
CREATE TABLE users (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE,
    email TEXT, created_at TEXT
);
CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    bank_id INTEGER REFERENCES banks(id),
    vpa TEXT UNIQUE, account_number TEXT, balance DOUBLE PRECISION,
    account_age_days INTEGER, kyc_level TEXT,
    is_merchant INTEGER, mcc INTEGER,
    avg_amount DOUBLE PRECISION, usual_hours TEXT,
    home_device TEXT, txn_count INTEGER, blacklisted INTEGER,
    created_at TEXT, upi_pin_hash TEXT, login_pin_hash TEXT
);
CREATE TABLE devices (
    id SERIAL PRIMARY KEY, user_id INTEGER,
    device_fingerprint TEXT, status TEXT DEFAULT 'active',
    binding_age_days INTEGER, is_rooted INTEGER DEFAULT 0,
    os_info TEXT, ip_address TEXT, created_at TEXT
);
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY, txn_ref TEXT,
    sender_account_id INTEGER, receiver_account_id INTEGER,
    amount DOUBLE PRECISION, type TEXT, channel TEXT, status TEXT,
    ip_address TEXT, device_id INTEGER, hour INTEGER,
    score INTEGER, label TEXT, reasons TEXT, created_at TEXT
);
CREATE TABLE fraud_scores (
    id SERIAL PRIMARY KEY, transaction_id INTEGER,
    cumulative_score INTEGER, label TEXT, created_at TEXT
);
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY, transaction_id INTEGER,
    status TEXT DEFAULT 'open', severity TEXT, created_at TEXT
);
CREATE TABLE blacklist (
    id SERIAL PRIMARY KEY, entity_type TEXT, entity_value TEXT,
    reason TEXT, created_at TEXT
);
CREATE TABLE ip_reputation (
    id SERIAL PRIMARY KEY, ip_address TEXT UNIQUE,
    reputation_score INTEGER, is_blacklisted INTEGER
);
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY, user_id INTEGER, device_id INTEGER,
    token TEXT, expires_at TEXT, created_at TEXT
);
CREATE TABLE otp_verifications (
    id SERIAL PRIMARY KEY, user_id INTEGER, code TEXT,
    status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0,
    expires_at TEXT, created_at TEXT
);
CREATE TABLE fraud_reports (
    id SERIAL PRIMARY KEY, reported_vpa TEXT, reporter_vpa TEXT,
    reason TEXT, amount_lost DOUBLE PRECISION,
    status TEXT DEFAULT 'reported', created_at TEXT
);
CREATE TABLE security_lockouts (
    id SERIAL PRIMARY KEY, vpa TEXT UNIQUE NOT NULL,
    attempts INTEGER DEFAULT 0, locked_until TEXT
);
-- Passkey credentials (server/webauthn_routes.py). This lived only in whatever DB
-- it was hand-created in, so a fresh deploy 500'd on every /auth/webauthn/* call.
CREATE TABLE webauthn_credentials (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    sign_count BIGINT NOT NULL DEFAULT 0,
    transports TEXT, fp_baseline TEXT,
    created_at TEXT, last_used_at TEXT
);

-- Idempotency (NPCI API spec §5.1: "PSP should ensure idempodent behaviour for
-- all APIs" — their typo, which is why nobody finds it by grepping).
--
-- Without this a retried /pay charges twice, and a retry is not an edge case:
-- the client cannot tell "the server never got it" from "the server did it and
-- the reply was lost", so it MUST retry, so we MUST dedupe. The key is supplied
-- by the CLIENT and stays the same across retries of one payment attempt — a
-- server-generated id (our RRN is random.randint per request) can never dedupe,
-- because a double-tap simply produces two of them. This mirrors NPCI, where
-- txnId is "created by the originator" using a UUID scheme.
--
-- The UNIQUE index is the point: SELECT-then-INSERT in application code is
-- itself a TOCTOU (both requests see "no key" and both insert). Only the
-- database can make check-and-claim one indivisible act.
CREATE TABLE idempotency_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL,
    -- Same key + different parameters is a client bug, not a retry. Storing a
    -- fingerprint of the request lets us say so instead of silently replaying
    -- the wrong answer.
    request_fingerprint TEXT NOT NULL,
    response_code INTEGER,          -- NULL = claimed but still in flight
    response_body TEXT,             -- JSON of the original response, replayed verbatim
    created_at TEXT NOT NULL
);
-- Scoped to the user so two people may independently pick the same UUID.
CREATE UNIQUE INDEX idempotency_keys_user_key ON idempotency_keys (user_id, idempotency_key);

CREATE INDEX idx_transactions_sender_created_at   ON transactions(sender_account_id, created_at);
CREATE INDEX idx_transactions_receiver_created_at ON transactions(receiver_account_id, created_at);
CREATE INDEX idx_transactions_created_at          ON transactions(created_at);
CREATE INDEX idx_otp_verifications_user_pending   ON otp_verifications(user_id, status) WHERE status = 'pending';
CREATE INDEX idx_blacklist_lookup                 ON blacklist(entity_type, entity_value);
CREATE INDEX idx_accounts_vpa                     ON accounts(vpa);
CREATE INDEX idx_devices_user_fp                  ON devices(user_id, device_fingerprint);
"""



def _safe_dsn(dsn: str) -> str:
    """DSN with the credentials masked, safe to print."""
    return re.sub(r"//[^@]*@", "//***:***@", dsn)


def _guard():
    """Refuse to DROP a non-local database without an explicit --yes."""
    print(f"target: {_safe_dsn(DSN)}")
    if "@localhost" in DSN or "@127.0.0.1" in DSN or "--yes" in sys.argv:
        return
    raise SystemExit(
        "\nREFUSING: this target is not localhost, and this script DROPs every table.\n"
        "  Back it up first:  PYTHONPATH=. .venv/bin/python db/backup_pg.py backup\n"
        "  Then re-run with:  PYTHONPATH=. .venv/bin/python db/build_db.py --yes")


def build():
    _guard()
    con = psycopg2.connect(DSN)
    cur = con.cursor()

    print("creating schema ...")
    cur.execute(SCHEMA)
    con.commit()

    now = datetime.now()
    ts = lambda days=0: (now - timedelta(days=days)).isoformat()

    upi_hash = hash_pin(DEMO_UPI_PIN)        # Argon2id is deliberately slow: hash the
    login_hash = hash_pin(DEMO_LOGIN_PIN)    # two demo PINs ONCE, not once per row

    for i, (_, _, handle) in enumerate(BANKS, 1):
        cur.execute("INSERT INTO banks (id, name, ifsc_prefix, upi_handle) VALUES (%s,%s,%s,%s)",
                    (i, BANKS[i - 1][0], BANKS[i - 1][1], handle))

    # Build the ledger first: txn_count and avg_amount are derived FROM it, so the
    # profile the model reads and the history it can query agree with each other.
    print("generating history ...")
    rows = generate_history(now)
    stats = profile_stats(rows)

    acc_id: dict[str, int] = {}
    dev_id: dict[str, int] = {}          # device fingerprint -> devices.id (shared farms reuse one)
    next_dev = 0

    for i, a in enumerate(ROSTER, 1):
        vpa_ = a["vpa"]
        acc_id[vpa_] = i
        handle = vpa_.split("@")[1]
        bank_id = BANK_ID[handle]        # KeyError here = VPA with an unknown bank handle
        merch = is_merchant(a)
        slug = a["name"].lower().replace(" ", "").replace(".", "")
        email = None if merch else f"{slug}@gmail.com"

        # A shared `device` marks a mule farm (SIGNALS_MASTER F7): several accounts,
        # one fingerprint. Everyone else gets their own.
        fp = a["device"] or f"dev_{a['cluster']}_{i:02d}"

        # txn_count is derived from the ledger — it is a count, so it can only agree
        # with the history. avg_amount is NOT derived, deliberately:
        #   * a realistic ledger is dominated by ₹10-40 chai and ₹40-180 autos, which
        #     drags the mean to ~₹1.2k, so an ordinary ₹8k transfer to your own mother
        #     scores as a "6.7x spike" and lands in REVIEW. (A median is worse: ~₹100.)
        #   * the model was TRAINED with avg_amount drawn from declared profile values
        #     (500/1000/2000/5000/12000), so a chai-skewed derived mean feeds it ratios
        #     from a distribution it never saw.
        # avg_amount means "this user's typical transaction size", which is a profile
        # fact, not the arithmetic mean of a bimodal ledger. See the note in the
        # handover about amount_to_avg_ratio being weak against a simple average.
        st = stats.get(vpa_, {})
        txn_count = st.get("txn_count", 0)
        avg_amount = a["avg"]

        cur.execute("INSERT INTO users (id, name, phone, email, created_at) VALUES (%s,%s,%s,%s,%s)",
                    (i, a["name"], a["phone"], email, ts(a["age"])))
        cur.execute("""INSERT INTO accounts
            (id, user_id, bank_id, vpa, account_number, balance, account_age_days, kyc_level,
             is_merchant, mcc, avg_amount, usual_hours, home_device, txn_count, blacklisted,
             created_at, upi_pin_hash, login_pin_hash)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", (
            i, i, bank_id, vpa_, f"XXXX{random.randint(1000, 9999)}", a["balance"],
            a["age"], a["kyc"], merch, a["mcc"], float(avg_amount),
            "0-23" if merch else "7-22", fp, txn_count,
            a["blacklisted"], ts(a["age"]), upi_hash, login_hash))

        if fp not in dev_id:
            next_dev += 1
            dev_id[fp] = next_dev
            cur.execute("""INSERT INTO devices
                (id, user_id, device_fingerprint, status, binding_age_days, is_rooted, os_info, ip_address, created_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (next_dev, i, fp, "active", min(a["age"], 800), 0,
                         random.choice(["Android 14", "iOS 17", "Chrome/Win", "Chrome/Mac"]),
                         f"49.36.{random.randint(0, 255)}.{random.randint(1, 254)}", ts(a["age"])))
        else:
            # Same fingerprint, different user — that IS the mule-farm signal, so the
            # row has to exist per user for the devices lookup in enrich_from_db to work.
            next_dev += 1
            cur.execute("""INSERT INTO devices
                (id, user_id, device_fingerprint, status, binding_age_days, is_rooted, os_info, ip_address, created_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (next_dev, i, fp, "active", min(a["age"], 800), 0,
                         "Android 14", f"49.36.{random.randint(0, 255)}.{random.randint(1, 254)}",
                         ts(a["age"])))

        if a["blacklisted"]:
            reason = "money mule" if "mule" in a["cluster"] else "reported for fraud"
            cur.execute("INSERT INTO blacklist (entity_type, entity_value, reason, created_at) VALUES (%s,%s,%s,%s)",
                        ("account", vpa_, reason, ts(max(a["age"] - 1, 1))))

    for _ in range(30):
        bad = random.random() < 0.3
        cur.execute("""INSERT INTO ip_reputation (ip_address, reputation_score, is_blacklisted)
                       VALUES (%s,%s,%s) ON CONFLICT (ip_address) DO NOTHING""",
                    (f"{random.randint(1, 223)}.{random.randint(0, 255)}."
                     f"{random.randint(0, 255)}.{random.randint(1, 254)}",
                     random.randint(5, 30) if bad else random.randint(70, 100), 1 if bad else 0))
    con.commit()

    # ------------------------------------------------------------ TRANSACTIONS
    print(f"writing {len(rows)} transactions ...")
    psycopg2.extras.execute_values(
        cur,
        """INSERT INTO transactions
           (txn_ref, sender_account_id, receiver_account_id, amount, type, channel,
            status, ip_address, device_id, hour, score, label, reasons, created_at)
           VALUES %s""",
        [(str(random.randint(10 ** 11, 10 ** 12 - 1)),
          acc_id[r["sender"]], acc_id[r["receiver"]], r["amount"], r["type"], r["channel"],
          r["status"], f"49.36.{random.randint(0, 255)}.{random.randint(1, 254)}", None,
          r["hour"], r["score"], r["label"], None, r["created_at"]) for r in rows],
        page_size=500)
    con.commit()

    # Keep the SERIAL sequences past the ids we inserted by hand, or the first
    # /auth/register will collide on a duplicate primary key.
    for t in ("banks", "users", "accounts", "devices", "blacklist", "ip_reputation", "transactions"):
        cur.execute(f"SELECT setval(pg_get_serial_sequence('{t}', 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM {t}), 1))")
    con.commit()

    # ------------------------------------------------------------ SUMMARY
    def cnt(t):
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        return cur.fetchone()[0]

    print(f"\nseeded {_safe_dsn(DSN)}\n")
    print("=== Tables + row counts ===")
    for t in ["banks", "users", "accounts", "devices", "transactions", "blacklist",
              "ip_reputation", "fraud_scores", "alerts", "sessions", "otp_verifications",
              "fraud_reports", "security_lockouts", "webauthn_credentials"]:
        print(f"  {t:<22} {cnt(t):>5}")

    print("\n=== Roster by cluster ===")
    seen = []
    for a in ROSTER:
        if a["cluster"] not in seen:
            seen.append(a["cluster"])
    for cl in seen:
        members = [a for a in ROSTER if a["cluster"] == cl]
        print(f"\n  [{cl}]  ({len(members)})")
        for a in members:
            flag = " BLACKLISTED" if a["blacklisted"] else ""
            shared = f" device={a['device']}" if a["device"] else ""
            st = stats.get(a["vpa"], {})
            print(f"    {a['vpa']:<30} {a['name']:<22} age={a['age']:>4}d "
                  f"txns={st.get('txn_count', 0):>4}{flag}{shared}")
            if a["note"]:
                print(f"    {'':<30} └─ {a['note']}")

    # Does Om actually know his circle? That is the whole point of seeding history:
    # first_time_payee must be 0 for contacts and 1 for every scammer.
    cur.execute("""SELECT ra.vpa, COUNT(*) c FROM transactions t
                   JOIN accounts sa ON sa.id=t.sender_account_id
                   JOIN accounts ra ON ra.id=t.receiver_account_id
                   WHERE sa.vpa='omsawant@okicici' GROUP BY 1 ORDER BY 2 DESC LIMIT 8""")
    print("\n=== Om's most-paid payees (these will NOT say 'first-time payee') ===")
    for vpa_, c in cur.fetchall():
        print(f"    {vpa_:<30} {c:>3} payments")

    print(f"\nPINs for every seeded account — login: {DEMO_LOGIN_PIN}   UPI: {DEMO_UPI_PIN}")
    cur.close()
    con.close()


if __name__ == "__main__":
    build()
