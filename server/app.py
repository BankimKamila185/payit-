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
def balance(vpa: str):
    con = db()
    acc = con.execute("SELECT balance FROM accounts WHERE vpa=?", (vpa,)).fetchone()
    con.close()
    if not acc:
        raise HTTPException(404, "account not found")
    return {"vpa": vpa, "balance": acc["balance"]}


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
    srow = con.execute("SELECT upi_pin_hash FROM accounts WHERE vpa=?", (req.sender_vpa,)).fetchone()
    if not srow:
        con.close(); raise HTTPException(404, "sender not found")
    if req.pin and srow["upi_pin_hash"] and \
            hashlib.sha256(req.pin.encode()).hexdigest() != srow["upi_pin_hash"]:
        con.close(); raise HTTPException(401, "Incorrect UPI PIN")

    feats = enrich_from_db(con, req.sender_vpa, req.receiver_vpa, req)

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
                "message": "Extra verification needed — enter the OTP sent to your registered mobile."}

    # SAFE -> atomic transfer
    con.execute("UPDATE accounts SET balance = balance - ?, txn_count = txn_count + 1 WHERE id=?", (req.amount, sid))
    con.execute("UPDATE accounts SET balance = balance + ?, txn_count = txn_count + 1 WHERE id=?", (req.amount, rid))
    con.commit()
    new_bal = con.execute("SELECT balance FROM accounts WHERE id=?", (sid,)).fetchone()["balance"]
    con.close()
    return {"result": "SUCCESS", "transaction_id": txid, **out,
            "message": "Payment successful.", "sender_balance": new_bal}


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
    if not otp or otp["code"] != req.otp:
        if otp:
            con.execute("UPDATE otp_verifications SET attempts = attempts + 1 WHERE id=?", (otp["id"],))
        con.commit(); con.close()
        raise HTTPException(400, "invalid OTP")
    # OTP ok -> complete transfer
    con.execute("UPDATE otp_verifications SET status='verified' WHERE id=?", (otp["id"],))
    con.execute("UPDATE accounts SET balance = balance - ?, txn_count = txn_count + 1 WHERE id=?", (tx["amount"], tx["sender_account_id"]))
    con.execute("UPDATE accounts SET balance = balance + ?, txn_count = txn_count + 1 WHERE id=?", (tx["amount"], tx["receiver_account_id"]))
    con.execute("UPDATE transactions SET status='success' WHERE id=?", (tx["id"],))
    con.commit()
    bal = con.execute("SELECT balance FROM accounts WHERE id=?", (tx["sender_account_id"],)).fetchone()["balance"]
    con.close()
    return {"result": "SUCCESS", "transaction_id": tx["id"], "message": "Verified — payment completed.", "sender_balance": bal}


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
    return {"result": "sent", "message": "OTP resent to registered mobile."}


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
    return {"result": "sent", "message": f"OTP sent to +91 ****{phone_clean[-4:]}"}


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
