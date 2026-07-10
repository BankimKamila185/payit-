# 🧠 ML / Fraud Engine — Build Plan
*Mera scope: scoring engine + model + graph + explainability + API + DB. (App = team ka scope.)*
*Base: adopt R6 RiskEngine (MIT) — real SHAP + reason codes + threshold ready. Add: UPI + graph + real-time + Postgres.*

---

## 1. Scope split
| Part | Kaun |
|---|---|
| Fraud scoring engine, model, graph, SHAP, API, DB | **ME (ML)** |
| Mock UPI app, send-money UI, dashboard frontend | **TEAM (app)** |
| **Integration point** | API contract (neeche defined) — team app → mera `/score` |

---

## 2. Tech stack
- **Language:** Python 3
- **API:** FastAPI (async, <200ms, auto Swagger docs)
- **DB:** **PostgreSQL** (accounts, transactions, history, blacklist) — psycopg2/SQLAlchemy
- **ML model:** XGBoost (SHAP-friendly) — trained on UPI synthetic data
- **Graph:** NetworkX (mule/ring: fan-in/out, cycle)
- **Explainability:** SHAP (TreeExplainer) → reason codes
- **Serving:** model loaded once at startup (low latency)

---

## 3. PostgreSQL schema (the "real DB")
```sql
accounts(
  id, vpa, name, bank, account_age_days, device_id,
  is_merchant, mcc, kyc_level, balance,
  usual_hours, avg_amount, blacklisted
)
transactions(
  id, sender_vpa, receiver_vpa, amount, ts, hour,
  type(PAY/COLLECT/QR/MANDATE), channel, device_id,
  status, score, label, reasons        -- ledger + decision log
)
fraud_reports(vpa, reported_at, reason)  -- for blacklist/reports signal
```
> Yeh DB se receiver/sender ki **real history** compute hoti — fan-in/out, first-time-payee, account-age, reports. (Hawa se nahi.)

---

## 4. Module / file structure (adopt R6 + add)
```
ml/
  db.py                 # Postgres connection + queries        [NEW]
  generate_upi_data.py  # UPI synthetic data + planted frauds  [adapt R6]
  features.py           # 47 signals (SIGNALS_MASTER)          [adapt R6]
  graph.py              # NetworkX mule/ring detection         [NEW ⭐ differentiator]
  rules.py              # rule-based scoring (sender/recv/txn)  [NEW]
  train_model.py        # XGBoost training                     [adapt R6]
  explain.py            # SHAP                                 [KEEP R6 ✅]
  reason_codes.py       # SHAP → friendly "why"                [KEEP R6 ✅]
  threshold_policy.py   # Safe/Review/Block bands              [KEEP R6 ✅]
  score.py              # combine rules+ml+graph → final score
  api.py                # FastAPI /score, /report, /stats      [NEW]
  models/               # saved xgb model + threshold.json
  reports/metrics.json  # PR-AUC, recall, FP (proof)
```

---

## 5. Scoring flow (the core)
```
Transaction aaya (from app or generator)
   ↓
[features.py]  → DB se 47 signals compute (sender hist, receiver hist, device...)
   ↓
3 scorers parallel:
   [rules.py]   → rule points (amount/time/device/velocity/receiver)
   [ml model]   → XGBoost fraud probability
   [graph.py]   → mule/ring score (fan-in/out, cycle)
   ↓
[score.py]   → combine → 0-100
   ↓
[threshold]  → 🟢 Safe (<35) | 🟡 Review (35-60) | 🔴 Block (60+)
   ↓
[reason_codes] → SHAP + rule reasons → "kyun" list
   ↓
Return JSON  (target <200ms, latency measured)
```

---

## 6. API contract (TEAM ke liye — app yeh use karega)
**`POST /score`** — request:
```json
{
  "sender_vpa": "sita@okhdfc",
  "receiver_vpa": "rahul@okaxis",
  "amount": 50000,
  "device_id": "dev_xyz",
  "type": "PAY",
  "channel": "MANUAL_VPA"
}
```
**Response:**
```json
{
  "score": 82,
  "label": "BLOCK",
  "fraud_probability": 0.91,
  "reasons": ["New device", "Amount 22x usual", "Receiver 3 days old", "Mule ring detected"],
  "ring": ["rahul@okaxis","amit@ybl","vijay@paytm"],
  "latency_ms": 47
}
```
Other endpoints:
- `POST /report` — victim report → blacklist update + chain trace
- `GET /stats` — dashboard ke liye live counters
- `POST /simulate/attack` — demo attack injector

> **Team app:** "Send Money" pe yeh `/score` call kare → BLOCK aaye toh payment roko + reasons dikhao.

---

## 7. Data (training + demo)
`generate_upi_data.py` — UPI synthetic transactions:
- Normal users (realistic amounts, usual hours, home device)
- Planted frauds: ATO (new device), mule rings (A→B→C), velocity bursts, collect-scams
- Output → Postgres + CSV for training
- ⚠️ No leakage (post-txn balance drop nahi). Honest, jaise R6.

---

## 8. Proof (metrics)
Train XGBoost on synthetic + (optionally PaySim) → report:
- **PR-AUC, Recall, False-Positive rate** (NOT accuracy)
- Honest note (jaise R6: "synthetic demo, workflow check")

---

## 9. Build phases (step by step)
- **Phase 1:** Postgres setup + schema + UPI data generator → DB
- **Phase 2:** features.py (47 signals from DB) + rules.py
- **Phase 3:** graph.py (mule/ring) ⭐
- **Phase 4:** train XGBoost + SHAP + reason_codes + threshold (adopt R6)
- **Phase 5:** score.py (combine) + api.py (FastAPI <200ms)
- **Phase 6:** /report (trace) + /stats + /simulate/attack
- **Phase 7:** metrics + honest eval + polish

---

## 10. What we reuse vs build
- ♻️ **Reuse (R6, MIT):** explain.py, reason_codes.py, threshold_policy.py, pipeline structure (~40% done)
- 🔄 **Adapt:** data generator, features → UPI
- ⭐ **Build new (differentiator):** graph.py, real-time FastAPI, Postgres, /report trace, attack simulator

> **Edge over all repos/winner:** real graph + real SHAP + real Postgres history + real <200ms + honest metrics.
