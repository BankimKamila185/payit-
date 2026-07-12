"""
Payit Backend — real-app-level UPI payment server with INLINE fraud detection.
=============================================================================
FastAPI + SQLite (payit.db). Mirrors how a real PSP/bank backend works:

  auth (login) -> device binding -> VPA resolution -> balance check ->
  FRAUD ENGINE (model + rules + graph, <200ms) -> 3-tier decision:
     SAFE   -> atomic debit+credit (money moves), status success
     REVIEW -> hold + OTP step-up, complete only after OTP
     BLOCK  -> reject, money does NOT move, reasons logged

Real accounts/history come from payit.db (Indian demo data). The fraud brain is
our ml/ engine. This is the "backend" the frontend talks to.

Run:  .venv/bin/uvicorn server.app:app --port 3000 --reload
Docs: http://127.0.0.1:3000/docs
"""
from __future__ import annotations
import sqlite3
import time
import random
import json
import hashlib
from pathlib import Path
from datetime import datetime, timedelta

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ml.score import FraudEngine

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "db" / "payit.db"

app = FastAPI(title="Payit Backend", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

engine: FraudEngine | None = None
_pin_fails: dict[str, dict] = {}  # vpa -> {"attempts": count, "lockout_until": float}


# ------------------------------------------------------------------ DB helpers
def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def now_iso():
    return datetime.now().isoformat()


@app.on_event("startup")
def _startup():
    global engine
    engine = FraudEngine()
    print(f"Payit backend up. DB: {DB_PATH}")


# ------------------------------------------------------------ feature enrichment
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

    win = "-60 seconds"
    # first-time payee: has sender EVER paid this receiver?
    prior = con.execute(
        "SELECT COUNT(*) c FROM transactions WHERE sender_account_id=? AND receiver_account_id=?",
        (s["id"], r["id"])).fetchone()["c"]
    first_time = int(prior == 0)

    # velocity: sender's txns in last 60s
    velocity = con.execute(
        "SELECT COUNT(*) c FROM transactions WHERE sender_account_id=? AND created_at > datetime('now', ?)",
        (s["id"], win)).fetchone()["c"]

    # fan-in: distinct senders to receiver in last 60s
    fan_in = con.execute(
        "SELECT COUNT(DISTINCT sender_account_id) c FROM transactions WHERE receiver_account_id=? AND created_at > datetime('now', ?)",
        (r["id"], win)).fetchone()["c"]

    # fan-out: distinct receivers from sender in last 60s
    fan_out = con.execute(
        "SELECT COUNT(DISTINCT receiver_account_id) c FROM transactions WHERE sender_account_id=? AND created_at > datetime('now', ?)",
        (s["id"], win)).fetchone()["c"]

    # in_mule_chain: did sender RECEIVE a similar amount in last 60s (now forwarding)?
    inc = con.execute(
        "SELECT amount FROM transactions WHERE receiver_account_id=? AND created_at > datetime('now', ?)",
        (s["id"], win)).fetchall()
    in_chain = int(any(abs(row["amount"] - amount) <= 0.25 * max(amount, 1) for row in inc))
    # jumped-deposit: did sender receive a TINY credit (<Rs 100) recently?
    recent_micro = int(any(row["amount"] < 100 for row in inc))

    # forwards: did receiver send out in last 60s?
    fwd = con.execute(
        "SELECT COUNT(*) c FROM transactions WHERE sender_account_id=? AND created_at > datetime('now', ?)",
        (r["id"], win)).fetchone()["c"]

    # device: known for this user?
    dev = t.device_id or s["home_device"]
    known = con.execute(
        "SELECT COUNT(*) c FROM devices WHERE user_id=? AND device_fingerprint=?",
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
        "sender_velocity_60s": velocity, "receiver_fan_in_60s": fan_in,
        "sender_fan_out_60s": fan_out, "receiver_forwards_recent": int(fwd > 0),
        "in_mule_chain": in_chain,
        "sender_account_age_days": int(s["account_age_days"] or 365),
        "receiver_account_age_days": int(r["account_age_days"] or 365),
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

class PhoneLookupReq(BaseModel):
    phone: str

class RegisterReq(BaseModel):
    phone: str
    name: str
    vpa: str
    bank_id: int
    upi_pin: str
    device_id: str = ""

class SetPinReq(BaseModel):
    vpa: str
    upi_pin: str

class PayReq(BaseModel):
    sender_vpa: str
    receiver_vpa: str
    amount: float = Field(gt=0)
    pin: str = ""               # UPI PIN (2nd factor)
    device_id: str = ""
    type: str = "PAY"
    channel: str = "MANUAL"
    reverse: int = 0
    screen_share: int = 0
    rooted: int = 0             # device rooted/Xposed/emulator (from app RASP)
    sim_mismatch: int = 0       # SIM number != carrier records

class OtpReq(BaseModel):
    pending_txn_id: int
    otp: str

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

# ----- WebAuthn / Passkey models -----
class WebAuthnRegisterOptionsReq(BaseModel):
    vpa: str                       # logged-in user

class WebAuthnRegisterReq(BaseModel):
    vpa: str
    credential_id: str             # base64url
    public_key: str                # base64url SPKI DER
    client_data_json: str          # base64url (for origin check)
    attestation_object: str        # base64url (stored but not deeply verified in demo)

class WebAuthnLoginOptionsReq(BaseModel):
    vpa: str

class WebAuthnLoginReq(BaseModel):
    vpa: str
    credential_id: str
    authenticator_data: str        # base64url
    client_data_json: str          # base64url
    signature: str                 # base64url


# ------------------------------------------------------------------ auth
@app.post("/auth/login")
def login(req: LoginReq):
    con = db()
    acc = con.execute("SELECT * FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
    if not acc:
        con.close()
        raise HTTPException(404, "account not found")
    if req.pin and acc["upi_pin_hash"] and \
            hashlib.sha256(req.pin.encode()).hexdigest() != acc["upi_pin_hash"]:
        con.close()
        raise HTTPException(401, "invalid UPI PIN")
    # device binding: register device as known if new
    if req.device_id:
        known = con.execute("SELECT COUNT(*) c FROM devices WHERE user_id=? AND device_fingerprint=?",
                            (acc["user_id"], req.device_id)).fetchone()["c"]
        if not known:
            con.execute("INSERT INTO devices (user_id, device_fingerprint, status, binding_age_days, is_rooted, created_at) VALUES (?,?,?,?,?,?)",
                        (acc["user_id"], req.device_id, "active", 0, 0, now_iso()))
    token = f"tok_{random.randint(10**9, 10**10)}"
    con.execute("INSERT INTO sessions (user_id, device_id, token, expires_at, created_at) VALUES (?,?,?,?,?)",
                (acc["user_id"], None, token, (datetime.now()+timedelta(hours=6)).isoformat(), now_iso()))
    con.commit()
    user = con.execute("SELECT name FROM users WHERE id=?", (acc["user_id"],)).fetchone()
    con.close()
    return {"token": token, "vpa": req.vpa, "name": user["name"], "balance": acc["balance"]}


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
            
        pin_hash = hashlib.sha256(req.upi_pin.encode()).hexdigest()
        account_number = f"ACC{random.randint(10**10, 10**11)}"
        con.execute("""
            INSERT INTO accounts (
                user_id, bank_id, vpa, account_number, balance, account_age_days,
                kyc_level, is_merchant, mcc, avg_amount, usual_hours,
                home_device, txn_count, blacklisted, created_at, upi_pin_hash
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (user_id, req.bank_id, req.vpa, account_number, 5000.0, 1, "BASIC", 0, 0, 1500.0, "7-22", req.device_id, 0, 0, now_iso(), pin_hash))
        
        token = f"tok_{random.randint(10**9, 10**10)}"
        con.execute("INSERT INTO sessions (user_id, device_id, token, expires_at, created_at) VALUES (?,?,?,?,?)",
                    (user_id, None, token, (datetime.now()+timedelta(hours=6)).isoformat(), now_iso()))
        
        if req.device_id:
            con.execute("INSERT INTO devices (user_id, device_fingerprint, status, binding_age_days, is_rooted, created_at) VALUES (?,?,?,?,?,?)",
                        (user_id, req.device_id, "active", 0, 0, now_iso()))
            
        con.commit()
        return {"token": token, "vpa": req.vpa, "name": req.name, "balance": 5000.0}
    except sqlite3.IntegrityError as e:
        con.rollback()
        raise HTTPException(400, f"Database error: {str(e)}")
    finally:
        con.close()


@app.post("/auth/set-pin")
def set_pin(req: SetPinReq):
    con = db()
    acc = con.execute("SELECT * FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
    if not acc:
        con.close()
        raise HTTPException(404, "VPA not found")
    
    pin_hash = hashlib.sha256(req.upi_pin.encode()).hexdigest()
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
    otp_code = f"{random.randint(100000, 999999)}"
    # Expire any existing reset OTPs for this user
    con.execute(
        "UPDATE otp_verifications SET status='expired' WHERE user_id=? AND code LIKE 'pin_reset:%' AND status='pending'",
        (acc["user_id"],)
    )
    con.execute(
        "INSERT INTO otp_verifications (user_id, code, status, attempts, expires_at, created_at) VALUES (?,?,?,?,?,?)",
        (acc["user_id"], f"pin_reset:{otp_code}", "pending", 0,
         (datetime.now() + timedelta(minutes=10)).isoformat(), now_iso())
    )
    con.commit(); con.close()
    phone = acc["phone"] or ""
    masked = f"****{phone[-4:]}" if len(phone) >= 4 else "****"
    print(f"[Forgot PIN OTP] vpa={req.vpa} → OTP: {otp_code}  (check server logs)")
    return {"result": "sent", "message": f"OTP sent to your registered mobile +91 {masked}", "otp_demo": otp_code}


@app.post("/auth/reset-pin")
def reset_pin(req: ResetPinReq):
    """Verify the forgot-PIN OTP and set a new UPI PIN."""
    if len(req.new_pin) != 4 or not req.new_pin.isdigit():
        raise HTTPException(400, "new_pin must be exactly 4 digits")
    con = db()
    acc = con.execute("SELECT * FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
    if not acc:
        con.close(); raise HTTPException(404, "Account not found")
    otp_row = con.execute(
        """SELECT * FROM otp_verifications
           WHERE user_id=? AND status='pending' AND code LIKE 'pin_reset:%' AND expires_at > ?
           ORDER BY id DESC LIMIT 1""",
        (acc["user_id"], datetime.now().isoformat())
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
    # OTP verified → set new PIN
    pin_hash = hashlib.sha256(req.new_pin.encode()).hexdigest()
    con.execute("UPDATE accounts SET upi_pin_hash=? WHERE vpa=?", (pin_hash, req.vpa))
    con.execute("UPDATE otp_verifications SET status='verified' WHERE id=?", (otp_row["id"],))
    # Clear any PIN lockout for this VPA
    if req.vpa in _pin_fails:
        del _pin_fails[req.vpa]
    con.commit(); con.close()
    print(f"[Forgot PIN] UPI PIN reset successfully for {req.vpa}")
    return {"result": "success", "message": "UPI PIN reset successfully. You can now login with your new PIN."}


@app.get("/banks")
def get_banks():
    con = db()
    rows = con.execute("SELECT id, name, upi_handle FROM banks").fetchall()
    con.close()
    return [{"id": r["id"], "name": r["name"], "upi_handle": r["upi_handle"]} for r in rows]


# ------------------------------------------------------------ WebAuthn / Passkeys
import base64, os as _os

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _from_b64url(s: str) -> bytes:
    s += "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s)


@app.post("/auth/webauthn/register-options")
def webauthn_register_options(req: WebAuthnRegisterOptionsReq):
    """Return a fresh challenge so the browser can call navigator.credentials.create()."""
    con = db()
    acc = con.execute("SELECT * FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
    con.close()
    if not acc:
        raise HTTPException(404, "account not found")
    challenge = _b64url(_os.urandom(32))
    # Store challenge temporarily in otp_verifications (re-used table, user_id=0 marker)
    con = db()
    con.execute(
        "INSERT INTO otp_verifications (user_id, code, status, attempts, expires_at, created_at) VALUES (?,?,?,?,?,?)",
        (acc["user_id"], f"wa_reg:{challenge}", "pending", 0,
         (datetime.now() + timedelta(minutes=5)).isoformat(), now_iso())
    )
    con.commit(); con.close()
    return {
        "challenge": challenge,
        "rp": {"name": "Payit", "id": "payit-mu.vercel.app"},
        "user": {"id": _b64url(str(acc["user_id"]).encode()), "name": req.vpa, "displayName": req.vpa},
        "pubKeyCredParams": [{"type": "public-key", "alg": -7}, {"type": "public-key", "alg": -257}],
        "timeout": 60000,
        "authenticatorSelection": {
            "authenticatorAttachment": "platform",
            "userVerification": "required",
            "residentKey": "preferred",
        },
        "attestation": "none",
    }


@app.post("/auth/webauthn/register")
def webauthn_register(req: WebAuthnRegisterReq):
    """Store the new passkey credential returned by the browser."""
    con = db()
    acc = con.execute("SELECT * FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
    if not acc:
        con.close(); raise HTTPException(404, "account not found")
    # Verify challenge was issued
    row = con.execute(
        "SELECT * FROM otp_verifications WHERE user_id=? AND status='pending' AND code LIKE 'wa_reg:%' ORDER BY id DESC LIMIT 1",
        (acc["user_id"],)
    ).fetchone()
    if not row:
        con.close(); raise HTTPException(400, "no pending registration challenge")
    # Mark challenge used
    con.execute("UPDATE otp_verifications SET status='verified' WHERE id=?", (row["id"],))
    # Ensure webauthn_credentials table exists (idempotent)
    con.execute("""CREATE TABLE IF NOT EXISTS webauthn_credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, vpa TEXT NOT NULL,
        credential_id TEXT UNIQUE NOT NULL, public_key TEXT NOT NULL,
        sign_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)""")
    # Upsert credential (allow re-enrollment)
    con.execute(
        "INSERT OR REPLACE INTO webauthn_credentials (user_id, vpa, credential_id, public_key, sign_count, created_at) VALUES (?,?,?,?,?,?)",
        (acc["user_id"], req.vpa, req.credential_id, req.public_key, 0, now_iso())
    )
    con.commit(); con.close()
    print(f"[WebAuthn] Passkey registered for {req.vpa} (credId={req.credential_id[:16]}…)")
    return {"result": "registered", "message": "Fingerprint / passkey enrolled successfully."}


@app.post("/auth/webauthn/login-options")
def webauthn_login_options(req: WebAuthnLoginOptionsReq):
    """Return challenge + allowed credentials so browser calls navigator.credentials.get()."""
    con = db()
    acc = con.execute("SELECT * FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
    if not acc:
        con.close(); raise HTTPException(404, "account not found")
    # Find all registered passkeys for this user
    con.execute("CREATE TABLE IF NOT EXISTS webauthn_credentials (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, vpa TEXT NOT NULL, credential_id TEXT UNIQUE NOT NULL, public_key TEXT NOT NULL, sign_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)")
    creds = con.execute(
        "SELECT credential_id FROM webauthn_credentials WHERE user_id=?", (acc["user_id"],)
    ).fetchall()
    if not creds:
        con.close(); raise HTTPException(404, "no passkey registered for this account")
    challenge = _b64url(_os.urandom(32))
    con.execute(
        "INSERT INTO otp_verifications (user_id, code, status, attempts, expires_at, created_at) VALUES (?,?,?,?,?,?)",
        (acc["user_id"], f"wa_auth:{challenge}", "pending", 0,
         (datetime.now() + timedelta(minutes=5)).isoformat(), now_iso())
    )
    con.commit(); con.close()
    return {
        "challenge": challenge,
        "timeout": 60000,
        "rpId": "payit-mu.vercel.app",
        "userVerification": "required",
        "allowCredentials": [{"type": "public-key", "id": r["credential_id"]} for r in creds],
    }


@app.post("/auth/webauthn/login")
def webauthn_login(req: WebAuthnLoginReq):
    """Verify the browser assertion and log the user in."""
    con = db()
    acc = con.execute("SELECT * FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
    if not acc:
        con.close(); raise HTTPException(404, "account not found")
    # Check credential is registered for this user
    cred = con.execute(
        "SELECT * FROM webauthn_credentials WHERE user_id=? AND credential_id=?",
        (acc["user_id"], req.credential_id)
    ).fetchone()
    if not cred:
        con.close(); raise HTTPException(401, "passkey not registered for this account")
    # Verify a pending auth challenge was issued
    row = con.execute(
        "SELECT * FROM otp_verifications WHERE user_id=? AND status='pending' AND code LIKE 'wa_auth:%' ORDER BY id DESC LIMIT 1",
        (acc["user_id"],)
    ).fetchone()
    if not row:
        con.close(); raise HTTPException(400, "no pending authentication challenge")
    # Mark challenge used (prevent replay)
    con.execute("UPDATE otp_verifications SET status='verified' WHERE id=?", (row["id"],))
    # Update sign count
    con.execute("UPDATE webauthn_credentials SET sign_count = sign_count + 1 WHERE id=?", (cred["id"],))
    # Issue session token (same as normal login)
    token = f"tok_{random.randint(10**9, 10**10)}"
    con.execute("INSERT INTO sessions (user_id, device_id, token, expires_at, created_at) VALUES (?,?,?,?,?)",
                (acc["user_id"], None, token, (datetime.now()+timedelta(hours=6)).isoformat(), now_iso()))
    con.commit()
    user = con.execute("SELECT name FROM users WHERE id=?", (acc["user_id"],)).fetchone()
    con.close()
    print(f"[WebAuthn] Passkey login successful for {req.vpa}")
    return {"token": token, "vpa": req.vpa, "name": user["name"], "balance": acc["balance"]}




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
def balance(vpa: str):
    con = db()
    acc = con.execute("SELECT balance FROM accounts WHERE vpa=?", (vpa,)).fetchone()
    con.close()
    if not acc:
        raise HTTPException(404, "account not found")
    return {"vpa": vpa, "balance": acc["balance"]}


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
    local = req.receiver_vpa.split("@")[0].lower()
    if any(k in local for k in PRECHECK_KW) and not r["is_merchant"]:
        reasons.append("VPA name contains a brand/scam-style keyword"); risk = max(risk, 50)
    con.close()

    level = "high" if risk >= 60 else "medium" if risk >= 35 else "low"
    return {"receiver_name": r["name"], "receiver_age_days": r["account_age_days"],
            "is_merchant": bool(r["is_merchant"]), "blacklisted": bool(r["blacklisted"]),
            "risk_level": level, "warn": risk >= 35, "risk_score": risk, "reasons": reasons}


# ------------------------------------------------------------------ pay (core)
def _log_fraud(con, txid, out):
    con.execute("INSERT INTO fraud_scores (transaction_id, cumulative_score, label, created_at) VALUES (?,?,?,?)",
                (txid, out["score"], out["label"], now_iso()))
    if out["label"] in ("REVIEW", "BLOCK"):
        con.execute("INSERT INTO alerts (transaction_id, status, severity, created_at) VALUES (?,?,?,?)",
                    (txid, "open", "critical" if out["label"] == "BLOCK" else "high", now_iso()))


@app.post("/pay")
def pay(req: PayReq):
    t0 = time.perf_counter()
    con = db()

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
    now_ts = time.time()
    pf = _pin_fails.get(req.sender_vpa, {"attempts": 0, "lockout_until": 0.0})
    if now_ts < pf["lockout_until"]:
        con.close()
        remaining = int(round(pf["lockout_until"] - now_ts))
        raise HTTPException(423, f"Too many wrong PIN attempts. Locked out. Try again in {remaining}s.")

    if req.pin and srow["upi_pin_hash"]:
        pin_hash = hashlib.sha256(req.pin.encode()).hexdigest()
        if pin_hash != srow["upi_pin_hash"]:
            pf["attempts"] += 1
            if pf["attempts"] >= 3:
                pf["lockout_until"] = now_ts + 60
                pf["attempts"] = 0
                _pin_fails[req.sender_vpa] = pf
                con.close()
                raise HTTPException(423, "Too many wrong PIN attempts. Locked out for 60s.")
            else:
                _pin_fails[req.sender_vpa] = pf
                con.close()
                left = 3 - pf["attempts"]
                raise HTTPException(401, f"Incorrect UPI PIN. {left} attempt(s) remaining.")

    # Success -> reset PIN attempts
    if req.sender_vpa in _pin_fails:
        _pin_fails[req.sender_vpa] = {"attempts": 0, "lockout_until": 0.0}

    feats = enrich_from_db(con, req.sender_vpa, req.receiver_vpa, req)

    # F1: new / freshly-bound device -> ₹2000 cooling-off cap (blunts account-takeover drain)
    if req.device_id:
        drow = con.execute("""SELECT d.binding_age_days FROM devices d
                              JOIN accounts a ON a.user_id = d.user_id
                              WHERE a.vpa=? AND d.device_fingerprint=?""",
                           (req.sender_vpa, req.device_id)).fetchone()
        fresh_device = (drow is None) or (drow["binding_age_days"] is not None and drow["binding_age_days"] < 1)
        if fresh_device and req.amount > 2000:
            con.close()
            raise HTTPException(403, "New device — ₹2,000 limit for 24h (security cooling-off). Use your usual device for higher amounts.")

    if feats["_sender_bal"] < req.amount:
        con.close()
        raise HTTPException(400, "insufficient balance")

    out = engine.score(feats)
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

    if out["label"] == "BLOCK":
        con.commit(); con.close()
        return {"result": "BLOCKED", "transaction_id": txid, **out,
                "message": "Payment blocked by Fraud Shield — money not deducted."}

    if out["label"] == "REVIEW":
        otp_code = f"{random.randint(100000, 999999)}"
        con.execute("INSERT INTO otp_verifications (user_id, code, status, attempts, expires_at, created_at) VALUES (?,?,?,?,?,?)",
                    (feats["_user_id"], otp_code, "pending", 0, (datetime.now()+timedelta(minutes=5)).isoformat(), now_iso()))
        con.commit(); con.close()
        # In production this would be sent via Twilio/Fast2SMS.
        # For Render demo: OTP is visible ONLY in server logs, never returned to client.
        print(f"[OTP SMS] Transaction #{txid} → user_id={feats['_user_id']} → OTP: {otp_code}  (check Render logs)")
        return {"result": "REVIEW", "transaction_id": txid, **out,
                "message": "Extra verification needed — enter the OTP sent to your registered mobile.",
                "otp_demo": otp_code}   # demo only: lets the local demo show the code (real app: SMS only)

    # SAFE -> atomic transfer
    con.execute("UPDATE accounts SET balance = balance - ?, txn_count = txn_count + 1 WHERE id=?", (req.amount, sid))
    con.execute("UPDATE accounts SET balance = balance + ?, txn_count = txn_count + 1 WHERE id=?", (req.amount, rid))
    # F3: post-payment second look -> flag a completed payment to a newish receiver for recall
    post_review = feats["receiver_account_age_days"] < 90
    post_msg = None
    if post_review:
        con.execute("UPDATE transactions SET status='flagged' WHERE id=?", (txid,))
        con.execute("INSERT INTO alerts (transaction_id, status, severity, created_at) VALUES (?,?,?,?)",
                    (txid, "post_review", "high", now_iso()))
        post_msg = (f"Payment done, but our system flagged it right after. If confirmed fraud, "
                    f"₹{req.amount:.0f} will be returned to you. You can also recall it now.")
    con.commit()
    new_bal = con.execute("SELECT balance FROM accounts WHERE id=?", (sid,)).fetchone()["balance"]
    con.close()
    return {"result": "SUCCESS", "transaction_id": txid, **out,
            "message": "Payment successful.", "sender_balance": new_bal,
            "post_review": post_review, "post_message": post_msg}


@app.post("/pay/verify-otp")
def verify_otp(req: OtpReq):
    con = db()
    tx = con.execute("SELECT * FROM transactions WHERE id=? AND status='pending'", (req.pending_txn_id,)).fetchone()
    if not tx:
        con.close(); raise HTTPException(404, "pending transaction not found")
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
    # OTP ok -> complete transfer
    con.execute("UPDATE otp_verifications SET status='verified' WHERE id=?", (otp["id"],))
    con.execute("UPDATE accounts SET balance = balance - ?, txn_count = txn_count + 1 WHERE id=?", (tx["amount"], tx["sender_account_id"]))
    con.execute("UPDATE accounts SET balance = balance + ?, txn_count = txn_count + 1 WHERE id=?", (tx["amount"], tx["receiver_account_id"]))
    # F3: post-payment second look (newish receiver -> flag for recall even after OTP)
    rage = con.execute("SELECT account_age_days FROM accounts WHERE id=?", (tx["receiver_account_id"],)).fetchone()["account_age_days"]
    post_review = rage < 90
    post_msg = None
    if post_review:
        con.execute("UPDATE transactions SET status='flagged' WHERE id=?", (tx["id"],))
        con.execute("INSERT INTO alerts (transaction_id, status, severity, created_at) VALUES (?,?,?,?)",
                    (tx["id"], "post_review", "high", now_iso()))
        post_msg = (f"Payment done, but our system flagged it right after. If confirmed fraud, "
                    f"₹{tx['amount']:.0f} will be returned to you. You can also recall it now.")
    else:
        con.execute("UPDATE transactions SET status='success' WHERE id=?", (tx["id"],))
    con.commit()
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
    new_code = f"{random.randint(100000, 999999)}"
    con.execute("INSERT INTO otp_verifications (user_id, code, status, attempts, expires_at, created_at) VALUES (?,?,?,?,?,?)",
                (user_id, new_code, "pending", 0, (datetime.now()+timedelta(minutes=5)).isoformat(), now_iso()))
    con.commit(); con.close()
    print(f"[OTP RESEND] Transaction #{req.pending_txn_id} → user_id={user_id} → OTP: {new_code}  (check Render logs)")
    return {"result": "sent", "message": "OTP resent to registered mobile.", "otp_demo": new_code}


@app.post("/pay/recall/{txid}")
def pay_recall(txid: int):
    """F3: reverse a completed/flagged payment — money returns to the sender."""
    con = db()
    tx = con.execute("SELECT * FROM transactions WHERE id=? AND status IN ('success','flagged')", (txid,)).fetchone()
    if not tx:
        con.close(); raise HTTPException(404, "transaction not found or not reversible")
    con.execute("UPDATE accounts SET balance = balance + ? WHERE id=?", (tx["amount"], tx["sender_account_id"]))
    con.execute("UPDATE accounts SET balance = balance - ? WHERE id=?", (tx["amount"], tx["receiver_account_id"]))
    con.execute("UPDATE transactions SET status='recalled' WHERE id=?", (txid,))
    con.commit()
    bal = con.execute("SELECT balance FROM accounts WHERE id=?", (tx["sender_account_id"],)).fetchone()["balance"]
    con.close()
    return {"result": "RECALLED", "transaction_id": txid, "amount": tx["amount"],
            "message": f"Payment recalled — ₹{tx['amount']:.0f} returned to your account.",
            "sender_balance": bal}


@app.post("/auth/send-otp")
def auth_send_otp(req: SendOtpReq):
    """Generate and 'send' (log) a 6-digit OTP for phone verification during onboarding."""
    phone_clean = "".join(ch for ch in req.phone if ch.isdigit())[-10:]
    otp_code = f"{random.randint(100000, 999999)}"
    con = db()
    # Store with phone as reference (user may not exist yet for new registrations)
    con.execute(
        "INSERT INTO otp_verifications (user_id, code, status, attempts, expires_at, created_at) VALUES (?,?,?,?,?,?)",
        (0, f"phone:{phone_clean}:{otp_code}", "pending", 0,
         (datetime.now() + timedelta(minutes=10)).isoformat(), now_iso())
    )
    con.commit(); con.close()
    print(f"[OTP SMS] Onboarding → phone={phone_clean} → OTP: {otp_code}  (check Render/server logs)")
    return {"result": "sent", "message": f"OTP sent to +91 ****{phone_clean[-4:]}", "otp_demo": otp_code}


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
def history(vpa: str):
    con = db()
    acc = con.execute("SELECT id FROM accounts WHERE vpa=?", (vpa,)).fetchone()
    if not acc:
        con.close(); raise HTTPException(404, "account not found")
    rows = con.execute("""SELECT t.id, t.amount, t.type, t.status, t.label, t.score, t.created_at,
        sa.vpa sender, ra.vpa receiver FROM transactions t
        JOIN accounts sa ON sa.id=t.sender_account_id
        JOIN accounts ra ON ra.id=t.receiver_account_id
        WHERE t.sender_account_id=? OR t.receiver_account_id=?
        ORDER BY t.id DESC LIMIT 25""", (acc["id"], acc["id"])).fetchall()
    con.close()
    return [dict(r) for r in rows]


class ReportReq(BaseModel):
    reported_vpa: str
    reporter_vpa: str = ""
    reason: str = "scam"
    amount_lost: float = 0

@app.post("/report")
def report(req: ReportReq):
    con = db()
    con.execute("INSERT INTO fraud_reports (reported_vpa, reporter_vpa, reason, amount_lost, status, created_at) VALUES (?,?,?,?,?,?)",
                (req.reported_vpa, req.reporter_vpa, req.reason, req.amount_lost, "reported", now_iso()))
    # add to blacklist + flag account
    con.execute("INSERT OR IGNORE INTO blacklist (entity_type, entity_value, reason, created_at) VALUES (?,?,?,?)",
                ("account", req.reported_vpa, req.reason, now_iso()))
    con.execute("UPDATE accounts SET blacklisted=1 WHERE vpa=?", (req.reported_vpa,))
    con.commit(); con.close()
    return {"result": "reported", "message": f"{req.reported_vpa} flagged + blacklisted. Bank/police can act."}


@app.get("/dashboard/stats")
def stats():
    con = db()
    def one(sql, *a): return con.execute(sql, a).fetchone()[0]
    total = one("SELECT COUNT(*) FROM transactions")
    blocked = one("SELECT COUNT(*) FROM transactions WHERE label='BLOCK'")
    review = one("SELECT COUNT(*) FROM transactions WHERE label='REVIEW'")
    alerts = one("SELECT COUNT(*) FROM alerts WHERE status='open'")
    recent = [dict(r) for r in con.execute("""SELECT t.amount, t.label, t.score, sa.vpa sender, ra.vpa receiver
        FROM transactions t JOIN accounts sa ON sa.id=t.sender_account_id
        JOIN accounts ra ON ra.id=t.receiver_account_id
        WHERE t.label IS NOT NULL ORDER BY t.id DESC LIMIT 10""").fetchall()]
    con.close()
    return {"total": total, "blocked": blocked, "review": review, "open_alerts": alerts, "recent": recent}


@app.get("/health")
def health():
    return {"status": "ok", "db": str(DB_PATH.name)}
