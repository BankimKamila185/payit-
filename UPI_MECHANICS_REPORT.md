# 🔧 UPI Mechanics + NPCI Powers — Research Report #2
*Accurate, citation-backed. 110 agents, 27 sources, 24 claims verified. For correct mental models so claims hold up to senior judges.*

> ⚠️ **Scope note:** Yeh research focus area 1 (UPI kaise kaam karta) aur area 3 (NPCI powers/freeze) deeply cover karta hai. Fraud taxonomy (area 2) yahan verify nahi hui — woh chat mein alag se di hai (13 types).

---

## PART 1 — UPI sach mein kaise kaam karta hai

### Layers (yeh hamari ARCHITECTURE.md ko confirm karta hai ✅)
```
[User App / TPAP]  →  [PSP / Sponsor Bank]  →  [NPCI Switch]  →  [Remitter + Beneficiary Banks]
 GPay/PhonePe/Paytm    app ka backend          central switch     sender bank + receiver bank
```
- **NPCI** = switch ka owner/operator + **settlement agency** (Type D RTGS member, banks ke RBI accounts ke beech settle karta).
- **NPCI customer KYC/identity NAHI rakhta** — woh PSP/issuer banks ke paas hai.

### Security — split 2-factor (yeh important hai, accurate rakhna)
| Factor | Kya | Kaun verify karta |
|---|---|---|
| **1st — Device fingerprint** | Registration pe **encrypted SMS** se mobile+device hard-bind hota (no user intervention) | **PSP** validate karta |
| **2nd — UPI PIN** | Sirf **NPCI Common Library** pe enter hota, **device pe hi PKI-encrypt** hota | **Issuer bank** ke **HSM** mein verify hota |

- **UPI PIN kabhi plaintext mein travel nahi karta. PSP ya NPCI use padh NAHI sakte.** Sirf issuer bank decrypt karta (HSM mein).
- **Oct 2025 (NPCI OC-226):** optional additions — UIDAI **Face Auth** (PIN set/reset), aur **on-device biometric** (fingerprint/face) PIN ki jagah (₹5,000 cap, opt-in, rooted device pe disabled).

### VPA resolution (kaun account dhundhता hai)
- **PSP** apne **local mapper** se VPA (`name@psp`) → account+IFSC resolve karta.
- **NPCI central mapper** = Aadhaar/routing identifiers → bank IINs (jab destination bank pata na ho).
- **Final account identification = beneficiary bank pe, NPCI pe nahi.**

### Transaction types UPI allow karta (hamare liye relevant)
P2P pay, P2M, **Collect request (paisa maangna)**, QR / Intent modes, **AutoPay/Mandate**, UPI Lite (on-device wallet, PIN-free per-txn), UPI Circle, Credit Line on UPI, UPI Number, etc.
- **Collect & mandate** = fraud ke liye important (collect-request scam, mandate abuse).
- **Runtime:** stateless, idempotent, HTTPS messaging; har txn ka unique txnId; **idempotency** = same request 2 baar aaye toh paisa 2 baar na kate.

---

## PART 2 — 🔑 NPCI ki POWER (tera sawaal: account owner pata + freeze kar sakta?)

### ❌ NPCI account owner ki identity NAHI jaanta
- NPCI sirf **VPA / account-IFSC routing** dekhta. **Naam, address, PAN — yeh BANK ke paas hai**, NPCI ke paas nahi.
- VPA/account → asli insaan resolve = **bank karta** (aur law enforcement ko deta).

### ❌ NPCI account FREEZE nahi kar sakta
**Yeh sabse important finding hai:**
- **Sirf BANKS** account hold/lien lagati hain + digital banking suspend karti hain.
- Banks yeh **sirf law enforcement (police/LEA) ke legal order pe** karti hain — BNSS S.106, S.168 r/w S.94 ke under, FIR/e-FIR ke saath.
- **NPCI, I4C, NCRP — koi khud freeze NAHI karta.** Woh coordinate/notify karte hain.

### Asli "trace & freeze" chain (India mein)
```
1. Victim report kare → 1930 helpline / NCRP portal
2. CFCFRMS system (~85 banks/intermediaries connected) ko alert
3. Bank nodal officer → amount HOLD kare (LEA ke order pe)
4. Bank → KYC details (naam, PAN, address, linked accounts) 1 week mein de
5. Police/court → seizure order (FIR ke saath)
```
- **RBI MuleHunter.AI** = mule accounts **flag/score** karta banks ke liye — khud freeze nahi karta, bank action leta. (15+ banks Aug 2025, 23 by Dec 2025.)
- ⚖️ **Legal nuance:** Bombay/Allahabad HC (2025) — BNSS S.106 sirf **lien** allow karta, full debit-freeze ke liye S.107/Magistrate order chahiye.

---

## 🎯 Iska hamare PROJECT pe matlab (bahut important)

1. **Hamari engine switch pe baithegi = woh sirf transactions/VPAs dekh sakti, asli identity nahi** — bilkul real NPCI jaisa. ✅ (Yani hamara design accurate hai.)
2. **Hamara system freeze nahi karta — woh "flag + recommend" karta.** Exactly jaise MuleHunter.AI. Bank/police actual freeze karte. → **Hamari "Trace & Report" feature ko isi tarah pitch karna:** *"hum mule accounts flag karke bank/police ko ready report dete, woh freeze karte"* — yeh 100% real-aligned hai.
3. **Demo mein "freeze account" button = recommendation hai, action nahi.** Honest framing: "production mein yeh bank ko jaata."
4. **Pitch power:** "Hamara approach RBI MuleHunter.AI + I4C/CFCFRMS pipeline se aligned hai" — judges ke saamne yeh bolna = instant credibility.

---

## ⚠️ Caveats (accuracy ke liye)
- Architecture claims kuch 2016 NPCI guidelines + legacy v1.0 API spec pe based — **mechanisms current hain**, par exact API field formats purane.
- PIN encryption real mein **two-hop** hai (library → NPCI → issuer), docs ne simplify kiya — load-bearing fact (PIN issuer pe verify, PSP nahi padh sakta) solid hai.
- OC-226 biometric details recent + partly secondary sources.
- Freeze-vs-lien law abhi court mein evolving — carefully cite.
