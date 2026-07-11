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
from collections import defaultdict
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


# --- in-memory security state (demo; a real app uses Redis / a DB) ---
_pin_fails = defaultdict(int)          # vpa -> consecutive wrong-PIN count
_pin_lock_until = {}                   # vpa -> epoch when the lock lifts
_pending_device_otp = {}               # (vpa, device_id) -> otp for a new-device challenge
_pending_pay_otp = {}                  # txid -> {code, attempts, expires} for a REVIEW step-up
PIN_MAX_FAILS = 3
LOCK_SECONDS = 60
NEW_DEVICE_LIMIT = 2000          # ₹ cap per txn on a freshly-bound (provisional) device


def _pin_ok(acc, pin: str) -> bool:
    return bool(pin) and bool(acc["upi_pin_hash"]) and \
        hashlib.sha256(pin.encode()).hexdigest() == acc["upi_pin_hash"]


def _mask_phone(con, user_id: int) -> str:
    row = con.execute("SELECT phone FROM users WHERE id=?", (user_id,)).fetchone()
    p = (row["phone"] if row else "") or ""
    return f"{p[:2]}•••••{p[-2:]}" if len(p) >= 4 else "registered number"


def _issue_session(con, acc):
    """Bind a session + return the standard login payload."""
    token = f"tok_{random.randint(10**9, 10**10)}"
    con.execute("INSERT INTO sessions (user_id, device_id, token, expires_at, created_at) VALUES (?,?,?,?,?)",
                (acc["user_id"], None, token, (datetime.now()+timedelta(hours=6)).isoformat(), now_iso()))
    con.commit()
    user = con.execute("SELECT name FROM users WHERE id=?", (acc["user_id"],)).fetchone()
    return {"token": token, "vpa": acc["vpa"], "name": user["name"], "balance": acc["balance"]}


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
    pin: str = ""               # UPI PIN — 1st credential at login (something you know)
    device_id: str = ""

class DeviceOtpReq(BaseModel):
    vpa: str
    device_id: str
    otp: str

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

class PrecheckReq(BaseModel):
    sender_vpa: str
    receiver_vpa: str


# ------------------------------------------------------------------ auth
@app.post("/auth/login")
def login(req: LoginReq):
    con = db()
    acc = con.execute("SELECT * FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
    if not acc:
        con.close(); raise HTTPException(404, "account not found")

    # brute-force lockout: too many wrong PINs -> temporary lock
    if _pin_lock_until.get(req.vpa, 0) > time.time():
        wait = int(_pin_lock_until[req.vpa] - time.time())
        con.close(); raise HTTPException(423, f"Account locked — too many wrong PINs. Try again in {wait}s")

    # 1st credential: UPI PIN (something you know)
    if not _pin_ok(acc, req.pin):
        _pin_fails[req.vpa] += 1
        left = PIN_MAX_FAILS - _pin_fails[req.vpa]
        if left <= 0:
            _pin_lock_until[req.vpa] = time.time() + LOCK_SECONDS
            _pin_fails[req.vpa] = 0
            con.close(); raise HTTPException(423, "Too many wrong PINs — account locked for 60s")
        con.close(); raise HTTPException(401, f"Incorrect UPI PIN — {left} attempt(s) left")
    _pin_fails[req.vpa] = 0

    # 2nd factor: device fingerprint
    uid = acc["user_id"]
    known = 1
    total_devices = con.execute("SELECT COUNT(*) c FROM devices WHERE user_id=?", (uid,)).fetchone()["c"]
    if req.device_id:
        known = con.execute("SELECT COUNT(*) c FROM devices WHERE user_id=? AND device_fingerprint=?",
                            (uid, req.device_id)).fetchone()["c"]

    # NEW device on an account that ALREADY has a bound device = takeover risk -> OTP step-up
    if req.device_id and not known and total_devices > 0:
        otp = f"{random.randint(100000, 999999)}"
        _pending_device_otp[(req.vpa, req.device_id)] = otp
        masked = _mask_phone(con, uid)
        con.close()
        return {"requires_device_otp": True,
                "message": f"New device detected — OTP sent to {masked}.",
                "masked_phone": masked,
                "otp_demo": otp}          # demo only: real app sends via SMS to users.phone

    # known device, OR the very first device on this account -> bind (if new) + log in
    if req.device_id and not known:
        con.execute("INSERT INTO devices (user_id, device_fingerprint, status, binding_age_days, is_rooted, created_at) VALUES (?,?,?,?,?,?)",
                    (uid, req.device_id, "active", 0, 0, now_iso()))
    out = _issue_session(con, acc)
    con.close()
    return out


@app.post("/auth/verify-device")
def verify_device(req: DeviceOtpReq):
    """Complete a new-device login: check the OTP, then bind the device + issue token."""
    con = db()
    acc = con.execute("SELECT * FROM accounts WHERE vpa=?", (req.vpa,)).fetchone()
    if not acc:
        con.close(); raise HTTPException(404, "account not found")
    expected = _pending_device_otp.get((req.vpa, req.device_id))
    if not expected or req.otp != expected:
        con.close(); raise HTTPException(400, "Invalid OTP")
    _pending_device_otp.pop((req.vpa, req.device_id), None)
    # NEW device is bound as PROVISIONAL -> reduced ₹2000/txn cooling-off limit for 24h
    # (real NPCI rule: freshly-registered device is capped to blunt account-takeover drain)
    con.execute("INSERT INTO devices (user_id, device_fingerprint, status, binding_age_days, is_rooted, created_at) VALUES (?,?,?,?,?,?)",
                (acc["user_id"], req.device_id, "provisional", 0, 0, now_iso()))
    out = _issue_session(con, acc)
    out["device_status"] = "provisional"
    out["new_device_limit"] = NEW_DEVICE_LIMIT
    con.close()
    return out


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


BRAND_SCAM_KW = ("refund", "support", "kyc", "prize", "cash", "lottery", "help",
                 "care", "update", "verify", "reward", "offer")


@app.post("/precheck")
def precheck(req: PrecheckReq):
    """Pre-payment BENEFICIARY risk check — runs the moment a payee is selected
    (before amount/PIN), so the user gets an EARLY warning if the receiver looks
    risky. Amount-independent; focuses on WHO you're about to pay."""
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
    if any(k in local for k in BRAND_SCAM_KW) and not r["is_merchant"]:
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


UPI_TXN_CAP = 100000     # NPCI per-transaction P2P cap (₹1 lakh)


@app.post("/pay")
def pay(req: PayReq):
    t0 = time.perf_counter()
    con = db()

    # ---- basic transaction guards ----
    if req.sender_vpa == req.receiver_vpa:
        con.close(); raise HTTPException(400, "Cannot pay your own account")
    if req.amount > UPI_TXN_CAP:
        con.close(); raise HTTPException(400, f"Amount exceeds ₹{UPI_TXN_CAP:,} UPI limit")

    # ---- 2nd factor: verify UPI PIN (device is the 1st factor). PIN is MANDATORY ----
    srow = con.execute("SELECT id, user_id, upi_pin_hash FROM accounts WHERE vpa=?", (req.sender_vpa,)).fetchone()
    if not srow:
        con.close(); raise HTTPException(404, "sender not found")
    if _pin_lock_until.get(req.sender_vpa, 0) > time.time():
        con.close(); raise HTTPException(423, "Account locked — too many wrong PINs")
    if not _pin_ok(srow, req.pin):
        _pin_fails[req.sender_vpa] += 1
        if PIN_MAX_FAILS - _pin_fails[req.sender_vpa] <= 0:
            _pin_lock_until[req.sender_vpa] = time.time() + LOCK_SECONDS
            _pin_fails[req.sender_vpa] = 0
            con.close(); raise HTTPException(423, "Too many wrong PINs — locked for 60s")
        con.close(); raise HTTPException(401, "Incorrect UPI PIN")
    _pin_fails[req.sender_vpa] = 0

    # ---- new-device cooling-off: a PROVISIONAL device is capped to ₹2000/txn ----
    if req.device_id:
        dev = con.execute("SELECT status FROM devices WHERE user_id=? AND device_fingerprint=?",
                          (srow["user_id"], req.device_id)).fetchone()
        if dev and dev["status"] == "provisional" and req.amount > NEW_DEVICE_LIMIT:
            con.close()
            raise HTTPException(403, f"New device — ₹{NEW_DEVICE_LIMIT:,} limit for 24h (security cooling-off). Login from your usual device for higher amounts.")

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
        otp = f"{random.randint(100000, 999999)}"
        # OTP bound to THIS exact transaction (no ambiguity if user has several pending)
        _pending_pay_otp[txid] = {"code": otp, "attempts": 0, "expires": time.time() + 300}
        con.execute("INSERT INTO otp_verifications (user_id, code, status, attempts, expires_at, created_at) VALUES (?,?,?,?,?,?)",
                    (feats["_user_id"], otp, "pending", 0, (datetime.now()+timedelta(minutes=5)).isoformat(), now_iso()))
        con.commit(); con.close()
        return {"result": "REVIEW", "transaction_id": txid, **out,
                "message": "Extra verification needed — enter OTP to proceed.",
                "otp_demo": otp}   # demo only: real app sends via SMS

    # SAFE -> atomic transfer
    con.execute("UPDATE accounts SET balance = balance - ?, txn_count = txn_count + 1 WHERE id=?", (req.amount, sid))
    con.execute("UPDATE accounts SET balance = balance + ?, txn_count = txn_count + 1 WHERE id=?", (req.amount, rid))

    # POST-PAYMENT second look: even after a SAFE debit, re-check in hindsight.
    # If the receiver is a newish account or the score was borderline, we flag it
    # for auto-reversal and tell the user "money will be returned".
    post_review = (feats["receiver_account_age_days"] < 90) or (25 <= out["score"] < 35)
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


@app.post("/pay/recall/{txid}")
def recall(txid: int):
    """Reverse a completed payment (auto-reversal / user recall) — money returns to sender."""
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


@app.post("/pay/verify-otp")
def verify_otp(req: OtpReq):
    con = db()
    tx = con.execute("SELECT * FROM transactions WHERE id=? AND status='pending'", (req.pending_txn_id,)).fetchone()
    if not tx:
        con.close(); raise HTTPException(404, "pending transaction not found")
    # OTP is bound to THIS exact transaction id (no ambiguity across pending payments)
    rec = _pending_pay_otp.get(req.pending_txn_id)
    if not rec:
        con.close(); raise HTTPException(400, "no pending OTP for this payment")
    if time.time() > rec["expires"]:
        _pending_pay_otp.pop(req.pending_txn_id, None)
        con.close(); raise HTTPException(400, "OTP expired — retry the payment")
    if rec["attempts"] >= 3:
        _pending_pay_otp.pop(req.pending_txn_id, None)
        con.execute("UPDATE transactions SET status='rejected' WHERE id=?", (tx["id"],))
        con.commit(); con.close(); raise HTTPException(423, "Too many wrong OTPs — payment cancelled")
    if rec["code"] != req.otp:
        rec["attempts"] += 1
        con.close()
        raise HTTPException(400, f"Invalid OTP — {max(3 - rec['attempts'], 0)} attempt(s) left")
    # OTP ok -> complete transfer
    _pending_pay_otp.pop(req.pending_txn_id, None)
    con.execute("UPDATE accounts SET balance = balance - ?, txn_count = txn_count + 1 WHERE id=?", (tx["amount"], tx["sender_account_id"]))
    con.execute("UPDATE accounts SET balance = balance + ?, txn_count = txn_count + 1 WHERE id=?", (tx["amount"], tx["receiver_account_id"]))
    # post-payment second look (newish receiver -> flag for reversal even after OTP)
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
