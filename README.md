# 🛡️ UPI Fraud Shield

Real-time UPI fraud detection — a working payment app (auth → pay → ledger) with a fraud
engine sitting **inline**, so a fraudulent transfer is stopped **before the money moves**,
and a mule that slips through is caught **after** by a post-payment monitor + bank review.

> ⚠️ **Trained and evaluated on SYNTHETIC data.** Real UPI transaction data isn't public
> (RBI rules), so all metrics below are **proof that the workflow works — not a real-world
> benchmark**. Nothing here connects to the real NPCI network.

---

## What's actually real vs simulated

| ✅ Real (genuinely implemented) | 🟡 Simulated (and we say so) |
|---|---|
| 2-factor auth — Argon2id + pepper, WebAuthn passkey, device binding | NPCI switch / real UPI network |
| Atomic transfer — CAS, idempotency keys, rollback | PIN capture via NPCI Common Library + HSM |
| Append-only **double-entry ledger** that reconciles | SMS delivery (OTP is printed to the server log) |
| 3-tier fraud decision (SAFE / REVIEW / BLOCK) with SHAP reasons | Both "banks" live in one database |
| Post-payment mule monitor, bank reversal adjudication (ISO camt codes) | Device fingerprint = canvas hash, not FingerprintJS |
| Real UPI limits (₹1L/txn, ₹1L + 20 txns per 24h) | |

---

## Architecture

```
┌──────────────┐      ┌────────────────────────────┐      ┌──────────────┐
│  FRONTEND    │─────▶│  BACKEND  server/app.py    │─────▶│  Postgres    │
│  React :5173 │ HTTP │  FastAPI :8001             │      │  (Neon)      │
│  auth-lab    │      │  PSP + switch + bank roles │      │              │
│  :5180       │      │  🛡️ Fraud engine INLINE    │      │              │
└──────────────┘      └────────────────────────────┘      └──────────────┘
                         model + rules + graph + SHAP
```

**Five fraud layers**

| # | Layer | Endpoint | When |
|---|---|---|---|
| 1 | Pre-payment payee check | `/precheck` | before you pay |
| 2 | Inline scoring (3-tier) | `/pay` | **before money moves** |
| 3 | Post-payment monitor | `/fraud/monitor` | after commit — mule rings |
| 4 | Reversal request | `/pay/recall` → `/bank/reversal-request` | recovery |
| 5 | Account review | `/bank/review-account` | confirms/clears an ML block |

The bank side has its **own operator console** (`bank-console/`, :5190) — the engine files a
request there and the bank rules on it, because the app has no authority over another
bank's account.

---

## Results (fresh eval, synthetic data)

| Metric | Value |
|---|---|
| **Fraud recall (full engine)** | **97%** |
| **Legit false-positive rate** | **2.6%** |
| Model alone — recall / precision | 94.4% / 98.1% |

**Caught 100%:** mule chains, fan-in collection, cycles, smurfing, malware drain, AnyDesk
scam, SIM swap, QR scam, dormant-account abuse, account testing, jumped deposit, and more.

**Weakest:** social-engineering scams (utility-bill 57%, charity 61%, refund 70%) — in these
the victim *willingly* pays, so the transaction itself looks normal. That's an inherent limit
of transaction-level detection, not a bug.

### Detection reads behaviour, not names
An earlier version flagged a payee if its VPA contained a scam keyword (`lottery`, `cash`,
`kyc`). That was a demo crutch — a real scammer uses an innocuous VPA. It's been **removed**.
Detection now uses only: account age, fan-in, pass-through/forwarding, velocity, micro-credit,
device & screen-share signals, blacklist and reports.

---

## Running it

**Requirements:** Python 3.12 + `.venv`, Node 18+, a Postgres URL.

```bash
# 1. env  (project root, .env — never commit this)
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
PAYIT_PIN_PEPPER="payit-dev-pepper-2026-change-for-prod"   # must match the DB's PIN hashes

# 2. backend  :8001
set -a && source .env && set +a
.venv/bin/python -m uvicorn server.app:app --host 127.0.0.1 --port 8001

# 3. frontend  :5173      (frontend/.env → VITE_API_URL=http://localhost:8001)
cd frontend && npm install && npm run dev

# 4. auth-lab  :5180
cd auth-lab && python3 -m http.server 5180

# 5. bank console  :5190
cd bank-console && python3 -m http.server 5190
```

**ML pipeline**
```bash
.venv/bin/python ml/generate_upi_data.py   # synthetic dataset
.venv/bin/python ml/train.py               # train + honest metrics
.venv/bin/python -m ml.eval_combined       # full engine recall / FP
.venv/bin/python -m ml.eval_by_type        # per fraud-family breakdown
```

---

## Layout

| Path | What |
|---|---|
| `server/app.py` | **the live backend** — FastAPI, all endpoints |
| `ml/score.py` | fraud engine — blends model + rules + graph |
| `ml/rules.py` · `ml/graph.py` · `ml/explain.py` | deterministic rules · mule-graph motifs · SHAP reasons |
| `ml/train.py` · `ml/eval_*.py` | training + evaluation |
| `frontend/` | React app (team's) |
| `auth-lab/` | second frontend — onboarding, passkey, Fraud Ops Console |
| `bank-console/` | the **bank's** operator UI (:5190) — adjudicates what the engine escalated |
| `db/` | schema build + migrations |
| `backend/` | ⚠️ older Node/TS backend — **not wired in**, the Python one is live |

---

## Known gaps

- `backend/` (Node/TS), `fraud-risk-engine/`, `ml/api.py` — not in the live path; pending a keep-or-delete decision
- Synthetic data only → metrics are workflow proof, not a benchmark
- Single uvicorn worker, no app-side connection pooling → demo-scale concurrency
- No self-learning from confirmed fraud cases yet
