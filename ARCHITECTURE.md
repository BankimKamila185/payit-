# 🏗️ System Architecture — Faithful UPI Replica
### Goal: real UPI ka poora flow technically copy karna (as much as possible), bina real network/paise ke.

```
[1. Mock App]  →  [2. PSP Server]  →  [3. NPCI Switch]  →  [4. Bank(s)]
  (team)            (backend)          (our module)         (our DB)
                          ↑
                  🛡️ Fraud Engine (inline)
```

Har stage pe: **(a) real mein kya hota**, **(b) security kya hai**, **(c) hum kya banayenge**.

---

## STAGE 1 — User App (GPay/PhonePe) → *team banayegi*

**Real mein:** GPay/PhonePe = TPAP apps. User VPA + amount daalta, UPI PIN enter karta.

**Security (real):**
- **UPI PIN device pe hi encrypt hota** (NPCI Common Library) — app raw PIN kabhi dekhta/store nahi karta
- **Device binding** — registration pe SMS se device + mobile verify hota (yeh device us user se "bandha" jaata)
- App ↔ server **TLS/HTTPS** (encrypted)

**Hum kya banayenge (mock app):**
- Send-money UI (To: VPA, Amount, [Pay])
- UPI PIN screen → PIN ko **hash/encrypt karke** bhejenge (plaintext kabhi nahi) ✅
- Har device ka ek **device ID** generate + store (device binding mimic) ✅
- Backend se baat **HTTPS** pe ✅

---

## STAGE 2 — PSP Server (app ka backend) → *hamara FastAPI*

**Real mein:** App ka backend request receive karta, authenticate karta, NPCI ke liye proper UPI request banata.

**Security (real):** session/token auth, request signing, replay protection, TLS.

**Hum kya banayenge:**
- `POST /pay` API
- **Auth token** check (sirf valid session request bheje) ✅
- **Input validation** (amount > 0, valid VPA format, fields present) ✅
- Request ko ek **transaction reference (RRN-style)** ke saath aage switch ko bhejna ✅ *(dedup client idempotency-key se hota hai, RRN se nahi)*
- TLS ✅

---

## STAGE 3 — NPCI Switch → *hamara "switch" module*

**Real mein:** NPCI = beech ka traffic controller.
- **VPA → asli bank account resolve** karta (mapper) — `rahul@okaxis` → kaunsa bank, account
- Sender bank ko **debit**, receiver bank ko **credit** request route karta
- **Unique RRN** (Retrieval Reference Number) generate, transaction lifecycle manage (initiated→pending→success/failed)
- Encrypted PIN block sender ke bank ko verify ke liye forward karta
- **Idempotency** — same request do baar aaye toh paisa do baar na kate

**Hum kya banayenge (mock switch):**
- **VPA mapper** — VPA → account+bank resolve ✅
- **RRN / txn ID** generate ✅
- Debit/credit ko sahi "bank" tak route ✅
- **Lifecycle states** (initiated → pending → success/failed) ✅
- **Idempotency** — client-supplied key + UNIQUE index in `idempotency_keys`; a retried /pay replays the stored response instead of paying twice ✅
- 🛡️ **Fraud engine yahan (ya PSP pe) hook hota** — transfer commit hone se *pehle* ✅

---

## STAGE 4 — Bank(s) → *hamari DB (do "bank" simulate kar sakte)*

**Real mein:**
- **Remitter (sender) bank:** UPI PIN verify (HSM mein decrypt), balance check, **debit**
- **Beneficiary (receiver) bank:** **credit**
- Response wapas chain se upar bhejta

**Security (real):** PIN HSM mein verify, atomic debit/credit, balance check.

**Hum kya banayenge:**
- **2 "banks"** (do account-group / do table) — taaki sender-bank aur receiver-bank ka realism aaye ✅
- **PIN verify** — stored hash se compare ✅
- **Balance check** (paisa hai? warna fail) ✅
- **Atomic transfer** — debit + credit dono saath (ek fail toh dono rollback) ✅
- **Double-entry ledger** (`ledger_entries`) — append-only, every movement sums to zero, balance reconciled via `/ledger/verify` ✅

---

## 🔐 Security checklist — real UPI ke 2-factor ko mimic karenge
| Real UPI security | Hamara mimic |
|---|---|
| Something you HAVE — device binding | Device ID register + check ✅ |
| Something you KNOW — UPI PIN | Hashed PIN verify ✅ |
| PIN never in plaintext | Hash/encrypt on app side ✅ |
| Idempotency | client key + UNIQUE index (`idempotency_keys`), stored-response replay ✅ |
| Atomic money movement | DB transaction (debit+credit together) ✅ |
| Encrypted channel | TLS/HTTPS ✅ |

---

## ❌ Jo NAHI banayenge (real protocol-level — mahine lagega, bekaar)
- NPCI ka actual ISO-8583 / wire protocol
- Real HSM cryptography hardware
- Real bank core banking systems
- Real NPCI network connection

> **Inhe pitch mein bol denge:** "Production mein yeh layer NPCI/bank HSM se handle hoti — hamne uska functional equivalent banaya."

---

## ✅ Net result
Ek aisा system jo **real UPI ke flow ko imaandaari se model karta** — app, PSP, aur do banks **simulated** (ek hi DB mein; humein asli NPCI switch / bank access nahi milta, aur ye hum saaf bolte hain), par jo cheezein REAL hain wo sach mein real hain: 2-factor auth (Argon2 + WebAuthn), atomic transfer with CAS + idempotency, aur ek append-only **double-entry ledger** jo reconcile hota hai. Fraud engine us flow ke beech baithta hai, jaise production mein PSP ke andar baithta.

> **Tagline:** "We didn't fake a payment — we rebuilt UPI in miniature, then put a fraud brain inside it."
