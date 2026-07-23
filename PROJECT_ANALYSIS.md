# 🔍 Project Analysis — What It Is, How It Works, What's Actually Done

> **Last verified:** against the live code + a fresh eval run. Earlier versions of this
> file described a much earlier state ("frontend disconnected", "mock fraud", "no login").
> All of that is **done** — the notes below reflect what the code actually does today.

## 1. PROJECT KYA HAI (exactly)

**Real-time UPI Fraud Detection System** — ek payment app jo fraud ko **paisa jaane se PEHLE**
pakadta hai, aur jo nikal gaya uske liye **post-payment + bank-reversal** layer rakhta hai.

```
┌──────────────┐      ┌────────────────────────────┐      ┌──────────────┐
│  FRONTEND    │─────▶│  BACKEND  server/app.py    │─────▶│  Postgres    │
│  React :5173 │ HTTP │  FastAPI :8001             │      │  (Neon)      │
│  auth-lab    │      │  PSP + switch + bank roles │      │              │
│  :5180       │      │  🛡️ Fraud engine INLINE    │      │              │
└──────────────┘      └────────────────────────────┘      └──────────────┘
                         model + rules + graph + SHAP
```

**Ek line:** User "Pay" kare → backend fraud engine score kare (<200ms) → SAFE toh atomic
transfer + ledger entry, REVIEW toh OTP step-up, BLOCK toh reject (paisa hilta hi nahi) —
sab "kyun" ke saath.

---

## 2. DATA — KYA CHAHIYE, KAHAN SE

### Do tarah ka data:
**A. Reference/master data (accounts, profiles) — baseline ke liye**
| Data | Kyun | DB table |
|---|---|---|
| Users + accounts + balances | kaun bhej raha, kitna balance | `users`, `accounts` |
| Bank list | routing | `banks` |
| Device fingerprints | naya device pakadna | `devices` |
| Blacklist | reported accounts | `blacklist` |

**B. Transactional data (live + history) — detection ke liye**
| Data | Kyun |
|---|---|
| Har transaction (sender, receiver, amount, time, device) | live scoring |
| Transaction HISTORY | velocity, first-time-payee, fan-in, mule-chain (behavioral features) |
| Fraud scores + alerts + ledger entries | decision log + money trail |

### Engine ko chahiye (7 fields per transaction):
`sender_vpa, receiver_vpa, amount, type, channel, device_id, hour`
→ Baaki features **history + profile se compute** hote (velocity, ratio, fan-in, age...).

### 🔴 Honest: real UPI data public nahi (RBI rules) → **synthetic** (2.5 lakh transactions).
Iska matlab: neeche ke saare numbers **workflow proof hain, real-world benchmark NAHI**.

---

## 3. REAL APPS KAISE KAAM KARTE (vs hamara)

### Real UPI:
```
[GPay app] → [PSP bank] → [NPCI switch] → [Remitter + Beneficiary banks]
   device        auth        AI/ML fraud       PIN verify (HSM)
   binding                   (MuleHunter)      balance, debit
```
- Fraud check **kai jagah:** PSP + NPCI switch + issuer bank
- PIN encrypted (NPCI Common Library), 2-factor, HSM verify

### Hamara demo:
```
[React app] → [FastAPI backend = PSP + switch + dono banks] → [fraud engine inline]
```
- Ek backend sab role nibhata (PSP + simulated switch + dono banks)
- Fraud check **pay ke waqt inline** — jaise real mein PSP/switch pe hota
- Real NPCI network / PIN-HSM **nahi** (simulated) — par flow aur decision-logic same

---

## 4. CURRENT STATE — kya SACH mein ban chuka

| Component | Status | Detail |
|---|---|---|
| **Backend (Python)** | ✅ **LIVE** | `server/app.py` FastAPI :8001 — auth, pay, fraud, ledger, bank, monitor |
| **Fraud engine** | ✅ | model (0.25) + rules (0.45) + graph (0.30), SHAP reasons, hard-rule overrides |
| **Frontend (React)** | ✅ **connected** | `frontend/` :5173 → `VITE_API_URL=:8001`. Real API calls, **koi mock fraud nahi** |
| **auth-lab** | ✅ | `auth-lab/` :5180 — onboarding, passkey, pay, Fraud Ops Console |
| **Auth** | ✅ | Argon2id + pepper, login PIN + UPI PIN, **WebAuthn passkey**, device binding, session tokens, lockout |
| **Payments** | ✅ | CAS (compare-and-swap), **idempotency keys**, atomic debit/credit, UPI daily limits |
| **Ledger** | ✅ | append-only **double-entry**, `/ledger/verify` reconciles (3 invariants) |
| **Post-payment** | ✅ | `/fraud/monitor` — collection + pass-through mule detection |
| **Bank server** | ✅ | `/bank/reversal-request` (ISO camt codes), `/bank/review-account` (ML block confirm/clear) |
| **Data** | ✅ | 2.5 lakh synthetic transactions + accounts |

### Detection ab REALISTIC hai
Pehle VPA-naam mein scam-keyword (`lottery`, `cash`, `kyc`) dekh ke flag hota tha — wo **crutch
tha** (asli scammer innocent VPA rakhta). Ab wo **hata diya**. Detection sirf **behavior** pe:
fresh age, fan-in, pass-through/forwarding, velocity, micro-credit, device/screen-share,
blacklist, reports — koi bhi VPA string nahi padhta.

---

## 5. NUMBERS (fresh eval, current model)

| Metric | Value |
|---|---|
| **Full engine — fraud recall** | **97%** (7768/8009) |
| **Full engine — legit false-positive** | **2.6%** |
| Model alone (held-out) — recall | 94.4% |
| Model alone — precision | 98.1% |

**100% pakde (16 families):** mule_chain, fan_in_collection, cycle, smurfing, malware_drain,
anydesk_scam, sim_swap, qr_scam, dormant, account_testing, jumped_deposit, rooted_takeover,
beneficiary_drain, max_limit_drain, overpayment_scam, loan_app_extortion

**Kamzor (social-engineering):** utility_bill 57%, charity 61%, refund_cashback 70%,
rental_token 82%, fake_ecommerce 85%, lottery_advance_fee 86%, customer_care_spoof 89%

> **Kyun kamzor:** in scams mein **victim khud khushi se** pay karta hai — transaction bilkul
> normal dikhta, dhokha baat-cheet mein hota hai. Ye inherent limit hai, bug nahi.

> ⚠️ **Ye sab SYNTHETIC data pe hai** — workflow proof, real-world benchmark nahi.

---

## 6. FRAUD LAYERS (kaunsa kab chalta)

```
1. PRE-PAY    /precheck        → payee risk warning (blacklist, fresh, never-paid, fan-in)
2. AT PAY     /pay  (inline)   → SAFE / REVIEW(OTP) / BLOCK   ← paisa hilne se PEHLE
3. POST-PAY   /fraud/monitor   → committed txns re-scan → mule ALERTS (paisa nahi hilata)
4. RECOVERY   /pay/recall      → bank ko reversal REQUEST → bank adjudicate kare
5. ACCOUNT    /bank/review-account → ML ka provisional block bank confirm/clear kare
```

---

## 7. INTEGRATION MAP (actual)

```
Frontend (React / auth-lab)
   │ POST /pay {sender, receiver, amount, pin, device_id, idempotency_key, rasp flags}
   ▼
FastAPI backend — server/app.py
   │ auth → policy (limits, device) → idempotency claim
   │ engine.score(feats)  ← model + rules + graph, inline
   ▼
   BLOCK  → reject (debit chalta hi nahi) [+ provisional account block → bank review]
   REVIEW → pending + OTP step-up
   SAFE   → atomic debit/credit + double-entry ledger post
   ▼
Frontend: 3-tier result + SHAP reasons
```

---

## 8. REAL GAPS (honest, aaj ke)

| Gap | Impact |
|---|---|
| **`backend/` (Node/TS) dead weight** — live path Python hai, TS backend ko koi call nahi karta | Decide: hatao ya migrate karo |
| **`fraud-risk-engine/` + `ml/api.py` wired nahi** — purane artifacts, live `/score` path mein nahi | Cleanup |
| **Synthetic data only** | Numbers workflow-proof hain, benchmark nahi |
| **Social-engineering scams 57-89%** | Inherent (victim willingly pays) |
| **FingerprintJS asli library nahi** — lightweight canvas hash | Known simplification |
| **Self-learning from confirmed cases** | Nahi bana (future) |
| **Simulated:** NPCI switch, PIN/HSM crypto, real SMS (OTP server log mein), dono bank ek hi DB mein | Saaf bolna chahiye |
| **Concurrency:** single uvicorn worker + no app-side pooling | Demo-scale (~5-10 concurrent), production nahi |

---

## 9. SUMMARY (ek nazar)
- **Project:** real-time UPI fraud detection — app + backend + ML brain, paisa jaane se pehle pakadta
- **Live stack:** React frontends → FastAPI (`server/app.py`) → Postgres (Neon), fraud engine inline
- **Kya REAL hai:** 2-factor auth (Argon2id + passkey), atomic transfer (CAS + idempotency),
  double-entry ledger jo reconcile hota, 3-tier detection, post-payment monitor, bank adjudication
- **Kya SIMULATED hai:** NPCI switch, HSM/PIN crypto, SMS delivery, dono banks ek DB mein
- **Numbers:** 97% recall / 2.6% FP — **synthetic data pe**, workflow proof
- **Tagline:** "We didn't fake a payment — we rebuilt UPI in miniature, then put a fraud brain inside it."
