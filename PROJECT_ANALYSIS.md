are we# 🔍 Project Analysis — What It Is, Data Needed, How It Works, What to Improve

## 1. PROJECT KYA HAI (exactly)

**Real-time UPI Fraud Detection System** — teen parts jo milke ek payment app banate jo fraud ko **paisa jaane se PEHLE** pakadta:

```
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│  FRONTEND    │───▶│   BACKEND    │───▶│  ML ENGINE       │
│  (React app) │    │ (Node + DB)  │    │  (Python /score) │
│  team ne     │    │  team ne     │    │  humne banaya    │
│  banaya      │    │  banaya      │    │                  │
└──────────────┘    └──────────────┘    └──────────────────┘
  send money UI      transaction flow     24 fraud types
  balance, screens   + balance transfer   XGBoost+graph+SHAP
```

**Ek line:** User "Send Money" kare → backend transaction banaye → fraud engine check kare → SAFE toh paisa move, FRAUD toh block — sab <200ms mein, "kyun" ke saath.

---

## 2. DATA — KYA CHAHIYE, KAHAN SE

### Do tarah ka data:
**A. Reference/master data (accounts, profiles) — baseline ke liye**
| Data | Kyun | Kahan (DB table) |
|---|---|---|
| Users + accounts + balances | kaun bhej raha, kitna balance | `users`, `accounts` |
| Bank list | routing | `banks` |
| Device fingerprints | naya device pakadna | `devices`, `device_fingerprints` |
| Blacklist | reported accounts | `blacklist` |
| IP reputation | VPN/proxy | `ip_reputation` |

**B. Transactional data (live + history) — detection ke liye**
| Data | Kyun |
|---|---|
| Har transaction (sender, receiver, amount, time, device, ip) | live scoring |
| Transaction HISTORY | velocity, first-time-payee, fan-in, mule-chain (behavioral features) |
| Fraud scores + alerts | decision log |

### Engine ko chahiye (7 fields per transaction):
`sender_vpa/id, receiver_vpa/id, amount, type, channel, device_id, hour`
→ Baaki 27 features **history + profile se compute** hote (velocity, ratio, fan-in...).

### Honest: real UPI data public nahi (RBI rules) → synthetic (humne 2.5 lakh banaya).

---

## 3. REAL APPS KAISE KAAM KARTE (vs hamara)

### Real UPI:
```
[GPay app] → [PSP bank] → [NPCI switch] → [Remitter+Beneficiary banks]
   device        auth         AI/ML fraud       PIN verify (HSM)
   binding                    (MuleHunter)      balance, debit
```
- Fraud check **kai jagah:** PSP + NPCI switch + issuer bank
- PIN encrypted (NPCI library), 2-factor, HSM verify
- NPCI = switch (routing), history bank ke paas

### Hamara demo:
```
[React app] → [Node backend = PSP+switch+bank] → [Python ML = fraud brain]
```
- Ek backend sab role nibhata (PSP + mock switch + bank)
- Fraud check = hamara ML engine (Step "Pay confirm")
- Real NPCI/PIN-HSM nahi (mock) — par flow same

### Key match:
> Real mein fraud scoring "Pay" pe + switch pe hota → **wahi hamara engine karta.** Baaki (PIN crypto, HSM, NPCI network) = infrastructure, hamara scope nahi.

---

## 4. CURRENT STATE (kya ready, kya nahi)

| Component | Status | Detail |
|---|---|---|
| **ML Engine (Python)** | ✅ 95% | 24 types, XGBoost+graph+SHAP, /score API. *api.py new-feature sync baaki* |
| **ML Data** | ✅ | 2.5 lakh transactions + accounts |
| **Backend (Node)** | ✅ 80% | `/api/transactions` (real flow + balance transfer + fraud check), alerts, history. *fraudService = sirf 3 simple rules* |
| **Backend DB** | ✅ | 15 tables schema + seed (banks, fraud_patterns) |
| **Frontend (React)** | 🟡 60% | send-money UI, screens, SliceShield. *Fraud = MOCK (hardcoded), backend se JUDA NAHI, LOGIN nahi* |

### 🚨 3 bade gaps:
1. **Frontend ↔ Backend disconnected** (koi API call nahi frontend mein)
2. **Frontend fraud MOCK hai** (hardcoded riskScore, real nahi)
3. **Login screen nahi hai**
4. **Backend fraud = sirf 3 rules** (hamara 24-type ML integrate nahi)

---

## 5. KYA IMPROVE / KARNA HAI (priority)

### 🔴 CRITICAL (bina inke demo nahi):
1. **Backend `fraudService.evaluate()` → hamara `/score` call** (3 rules → 24-type ML)
2. **Frontend → Backend connect** (`/api/transactions` call on Pay)
3. **Frontend mock fraud hटao** → real backend verdict use karo
4. **Login screen add** (users table ready, bas auth endpoint + screen)
5. **api.py fix** (naye features sync — warna engine break)

### 🟡 IMPORTANT (demo strong banane):
6. **FingerprintJS** (real device_id — abhi manual toggle)
7. **Feature enrichment** — backend history se features compute karke engine ko de (ya engine DB query kare)
8. **3-tier UI** — block/review(OTP)/success + real reasons dikhao
9. **Dashboard** — live fraud feed + mule graph (SliceShield extend)

### 🟢 NICE-TO-HAVE:
10. Attack simulator button (demo)
11. Trace & report (FraudReportForm → chain trace)
12. Deploy (engine + backend hosted)

---

## 6. FEATURE ENRICHMENT — sabse technical gap
Hamara engine `velocity, fan_in, in_mule_chain, first_time_payee` **history se** compute karta. Backend ke paas history (transactions table) hai. Do options:
- **A:** Backend features compute karke engine ko bheje (backend kaam)
- **B:** Hamara Python engine backend DB (Postgres) se query kare (engine ko DB access)
- **C (demo):** Engine in-memory history rakhe /score calls se (simplest — api.py already karta)

→ **Demo ke liye C**, production ke liye A/B.

---

## 7. INTEGRATION MAP (kaun kisse judega)
```
Frontend (React)
   │ POST /api/transactions {sender, receiver, amount, device_id, ip}
   ▼
Backend (Node) — app.ts
   │ FraudService.evaluate()  ← YAHAN badlo
   │   └─ POST /score {7 fields}
   ▼
ML Engine (Python) — /score
   │ model + rules + graph + SHAP
   ▼
   returns {score, label, reasons, ring, latency}
   │
Backend: label==BLOCK? reject : transfer balance
   ▼
Frontend: block modal + reasons / success
```

---

## 8. SUMMARY (ek nazar)
- **Project:** real-time UPI fraud detection — app + backend + ML brain, catches fraud before money moves
- **Data:** accounts/profiles (baseline) + transaction history (behavioral) + our 2.5 lakh synthetic
- **Real apps:** fraud at PSP+NPCI+bank; hamara backend + ML nibhata
- **Ready:** ML engine, data, backend transaction flow, DB schema
- **Gaps:** frontend↔backend disconnect, mock fraud, no login, our ML not integrated, api.py sync
- **Core work:** CONNECT the 3 parts + add login + swap 3-rules for our ML (integration > new features)
