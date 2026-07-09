"""
UPI Fraud Shield — Real-time Scoring API
========================================
FastAPI service the team's app calls on "Send Money". The app sends a SIMPLE
raw transaction; the API enriches it into features (from account profiles +
in-memory history), runs the combined engine (XGBoost + rules + graph), and
returns a structured decision with reason codes + measured latency (<200ms).

Run:  .venv/bin/uvicorn ml.api:app --reload
Docs: http://127.0.0.1:8000/docs

Contract (POST /score):
  in : {sender_vpa, receiver_vpa, amount, hour, type, channel, device_id}
  out: {score, label, fraud_probability, reasons[], ring[], latency_ms, components}
"""

from __future__ import annotations
import time
from collections import defaultdict
from pathlib import Path

import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .score import FraudEngine

HERE = Path(__file__).resolve().parent
ACCOUNTS_CSV = HERE / "data" / "accounts.csv"

app = FastAPI(title="UPI Fraud Shield API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])

engine: FraudEngine | None = None
accounts: dict = {}
# lightweight in-memory history (real system: from DB / feature store)
_sends = defaultdict(list)                            # sender -> send timestamps
_payees = defaultdict(set)                            # sender -> receivers seen
_devices = defaultdict(set)                           # sender -> devices seen
_recv = defaultdict(list)                             # account -> [(sender, amount, ts)] incoming
_sent = defaultdict(list)                             # account -> [(receiver, ts)] outgoing (fan-out)
_fwd = defaultdict(list)                              # account -> [ts] when it sent (forwards)
_txnc = defaultdict(int)                              # account -> lifetime txn count
_stats = {"total": 0, "flagged": 0, "blocked": 0}


class Txn(BaseModel):
    sender_vpa: str
    receiver_vpa: str
    amount: float = Field(gt=0)
    hour: int = Field(ge=0, le=23, default=12)
    type: str = "PAY"           # PAY / COLLECT / QR / MANDATE
    channel: str = "MANUAL"     # MANUAL / QR / INTENT / CONTACT
    device_id: str = ""
    reverse: int = 0            # 1 if overpayment/reverse-transfer
    screen_share: int = 0       # 1 if remote-access/AnyDesk active (from app)
    rooted: int = 0             # 1 if device rooted/Xposed/emulator
    sim_mismatch: int = 0       # 1 if SIM number != carrier
    ts: int | None = None       # optional; for graph timing


@app.on_event("startup")
def _startup():
    global engine, accounts
    engine = FraudEngine()
    if ACCOUNTS_CSV.exists():
        adf = pd.read_csv(ACCOUNTS_CSV)
        accounts = {a["vpa"]: a for a in adf.to_dict("records")}
    print(f"Engine loaded. {len(accounts)} account profiles.")


def _usual_hours(acc):
    """parse 'start-end' string back into a set of hours."""
    try:
        s, e = str(acc.get("usual_hours", "6-22")).split("-")
        return set(range(int(s), int(e)))
    except Exception:
        return set(range(6, 22))


BRAND_KW = ("support", "refund", "help", "care", "update", "bill", "kyc",
            "amazon", "flipkart", "bigbazaar", "irctc", "sbi.", "hdfc.", "shop")


def enrich(t: Txn, ts: int) -> dict:
    """Build the FULL model feature dict from raw txn + profiles + history.
    Mirrors generate_upi_data.compute_features so features match the model."""
    s = accounts.get(t.sender_vpa, {})
    r = accounts.get(t.receiver_vpa, {})
    sv, rv = t.sender_vpa, t.receiver_vpa
    avg = float(s.get("avg_amount", 1500) or 1500)
    home_dev = s.get("home_device", "")
    dev = t.device_id or home_dev
    now = ts

    # lifetime activity (before increment) — established-ness
    sender_txns = _txnc[sv]; receiver_txns = _txnc[rv]
    _txnc[sv] += 1; _txnc[rv] += 1

    # velocity
    sl = _sends[sv]; sl[:] = [x for x in sl if now - x <= 60]
    velocity = len(sl); sl.append(now)

    # new device
    seen_dev = _devices[sv] or {home_dev}
    is_new_device = int(dev not in seen_dev); _devices[sv].add(dev)

    # first-time payee
    payees = _payees[sv]; first_time = int(rv not in payees); payees.add(rv)

    # in_mule_chain: did sender receive a similar amount recently (now forwarding)?
    sin = [(x, a, tt) for (x, a, tt) in _recv.get(sv, []) if now - tt <= 60]
    in_chain = int(any(abs(a - t.amount) <= 0.25 * max(t.amount, 1) for (x, a, tt) in sin))
    recent_micro = int(any(a < 100 for (x, a, tt) in sin))   # jumped-deposit seed

    # fan-in (receiver) + record this incoming edge
    ri = _recv[rv]; ri[:] = [(x, a, tt) for (x, a, tt) in ri if now - tt <= 60]
    fan_in = len({x for (x, a, tt) in ri}); ri.append((sv, t.amount, now))

    # fan-out (sender)
    so = _sent[sv]; so[:] = [(x, tt) for (x, tt) in so if now - tt <= 60]
    fan_out = len({x for (x, tt) in so}); so.append((rv, now))

    # receiver forwarded recently?
    forwards = int(any(now - tt <= 60 for tt in _fwd.get(rv, [])))
    _fwd[sv].append(now)

    usual = _usual_hours(s)
    local = rv.split("@")[0].lower()
    return {
        "sender_vpa": sv, "receiver_vpa": rv,
        "amount": t.amount, "hour": t.hour, "type": t.type, "channel": t.channel,
        "ts": now,
        "amount_to_avg_ratio": round(t.amount / max(avg, 1), 3),
        "odd_hour": int(t.hour not in usual and t.hour in range(0, 6)),
        "balance_drawdown": round(t.amount / max(float(s.get("balance", 1e6) or 1e6), 1), 3),
        "is_new_device": is_new_device,
        "first_time_payee": first_time,
        "sender_velocity_60s": velocity,
        "receiver_fan_in_60s": fan_in,
        "sender_fan_out_60s": fan_out,
        "receiver_forwards_recent": forwards,
        "in_mule_chain": in_chain,
        "sender_account_age_days": int(s.get("account_age_days", 365) or 365),
        "receiver_account_age_days": int(r.get("account_age_days", 365) or 365),
        "sender_txn_count": sender_txns,
        "receiver_txn_count": receiver_txns,
        "sender_is_corporate": int(s.get("is_corporate", 0) or 0),
        "receiver_is_merchant": int(r.get("is_merchant", 0) or 0),
        "receiver_kyc_basic": int(str(r.get("kyc_level", "")) == "BASIC"),
        "receiver_blacklisted": int(r.get("blacklisted", 0) or 0),
        "name_vpa_mismatch": int(any(k in local for k in BRAND_KW)
                                 and int(r.get("is_merchant", 0) or 0) == 0),
        "is_collect": int(t.type == "COLLECT"),
        "is_mandate": int(t.type == "MANDATE"),
        "is_qr": int(t.channel == "QR"),
        "reverse_transfer": int(t.reverse),
        "device_screen_share": int(t.screen_share),
        "device_rooted": int(t.rooted),
        "sim_carrier_mismatch": int(t.sim_mismatch),
        "recent_micro_credit": recent_micro,
    }


@app.get("/health")
def health():
    return {"status": "ok", "accounts": len(accounts)}


@app.get("/stats")
def stats():
    return _stats


@app.post("/score")
def score(t: Txn):
    t0 = time.perf_counter()
    ts = t.ts if t.ts is not None else int(time.time())
    feats = enrich(t, ts)
    out = engine.score(feats)
    out["latency_ms"] = round((time.perf_counter() - t0) * 1000, 2)

    _stats["total"] += 1
    if out["label"] in ("REVIEW", "BLOCK"):
        _stats["flagged"] += 1
    if out["label"] == "BLOCK":
        _stats["blocked"] += 1
    return out
