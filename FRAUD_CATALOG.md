# 📚 UPI Fraud Catalog — 30 Cases by Detection Difficulty
*Har case: mechanism + main signal + APP/Unauthorized. Difficulty = transaction-scoring se kitna catchable.*

> **APP** = Authorized Push Payment (victim KHUD bhejta — sender normal dikhta — HARD)
> **UNAUTH** = account compromised (sender abnormal — device/velocity tell — EASIER)
> **Rule:** Unauth → SENDER signals. APP → RECEIVER signals (mule intelligence).

---

## 🟢 EASY (clear technical signal — sender compromised ya obvious pattern)

| # | Fraud | Mechanism | Main signal | Type |
|---|---|---|---|---|
| 1 | **Account takeover (phishing creds)** | Naye phone se login + drain | New device + amount spike | UNAUTH |
| 2 | **SIM swap** | Number clone → re-register UPI | New device binding <24h + big txn | UNAUTH |
| 3 | **Bot/velocity burst** | 50 transfers 1 min mein | Velocity spike | UNAUTH |
| 4 | **Impossible travel** | 2 door locations, minutes apart | Geo-velocity anomaly | UNAUTH |
| 5 | **Dormant account wakes up** | Purana account achaanak bada transfer | Dormancy + amount spike | UNAUTH |
| 6 | **Credential stuffing** | Kai galat PIN fir success | Failed-attempts then success | UNAUTH |
| 7 | **Max-limit drain** | New device → turant max allowed amount | New device + max amount | UNAUTH |
| 8 | **Multi-device anomaly** | Ek account 3 devices se simultaneously | Concurrent device usage | UNAUTH |
| 9 | **Account-testing probes** | ₹1 test fir bada (card/account check) | Tiny-then-large pattern | UNAUTH |

---

## 🟡 MEDIUM (behavioral + receiver context + transaction type chahiye)

| # | Fraud | Mechanism | Main signal | Type |
|---|---|---|---|---|
| 10 | **Collect-request scam** | "paisa aa raha" jhooth, victim PIN daale | Collect-type + unknown payee | APP |
| 11 | **QR scam** | "scan to receive" → actually debit | First-time payee + QR-to-P2P | APP |
| 12 | **Money mule (receiver)** | Paisa aata-jaata, fresh account | Fan-in + fan-out + fresh | APP |
| 13 | **Layering / mule ring** | A→B→C→D chain, amount conserved | Rapid hops + conserved amount | APP |
| 14 | **Smurfing** | Ek bada → kai chote (limit dodge) | 1-to-many split | APP/UNAUTH |
| 15 | **Mandate/AutoPay abuse** | "lottery" bolke mandate approve | New mandate to unknown, high amt | APP |
| 16 | **Refund/cashback scam** | "claim ke liye ₹X bhejo" | First-time payee + "refund" context | APP |
| 17 | **Fake customer-care** | "verify" small txn → fir drain | Unknown payee + escalation | APP |
| 18 | **Merchant VPA spoofing** | Lookalike VPA (`bigbazar@axl` fake) | Payee name-VPA mismatch | APP |
| 19 | **Overpayment scam** | "galti se zyada bheja, wapas karo" | Reverse transfer to new payee | APP |
| 20 | **Job/task scam (reg fee)** | "₹500 registration" | First-time payee + receiver mule | APP |
| 21 | **Velocity to many new payees** | Hacked account → kai naye receivers | Multi new-receiver burst | UNAUTH |
| 22 | **Jump deposit / auto-collect** | Auto collect-request after small deposit | Collect after unsolicited credit | APP |
| 22b | **Fake e-commerce / online shopping** | Fake website/ad (e.g. "electric cycle ₹8k"), victim pays, no delivery | Paying "shop" but receiver = **personal account (P2P) + name mismatch + fresh** | APP |

---

## 🔴 HARD (victim genuine & willing — needs telemetry / cross-victim / longitudinal)

| # | Fraud | Mechanism | Why hard | Real solution |
|---|---|---|---|---|
| 23 | **AnyDesk/screen-share** | Scammer victim ke apne phone se nikaale | Device apna, behaviour normal-ish | **Device telemetry** — remote-access/accessibility app active? |
| 24 | **Investment/trading scam** | Willing, escalating transfers (pig-butchering) | Sender genuine, woh khushi se bhejta | **Receiver-side** — multi-victim fan-in pe pakdo |
| 25 | **Romance / pig-butchering** | Long con, trust banake paisa | Months ka relationship, willing | Receiver mule pattern + escalation |
| 26 | **Loan-app extortion** | Victim chote repeated payments dabav mein | Willing, small amounts | Receiver flagged across victims |
| 27 | **Deepfake voice/video** | "Beta main hospital mein, paisa bhejo" | Emotional, victim willing | First-time payee + amount + urgency context |
| 28 | **Digital arrest scam** | Fake police, "case hai, paisa bhejo" | Victim terrified, willing, big amount | Big amount to new payee + multi-victim receiver |
| 29 | **Lottery/inheritance advance-fee** | "tax bharo prize ke liye" | Willing | Receiver mule + first-time payee |
| 30 | **Malware/APK background debit** | App SMS/OTP chura ke auto-transfer | Looks like victim's device | Device-integrity + velocity + odd-time |

---

## 🎯 Patterns nikle (yeh engine design karta hai)

**EASY = SENDER abnormal:**
→ new device, device-binding-age, velocity, geo-jump, dormancy, concurrent-device, max-amount

**MEDIUM = RECEIVER + type + behaviour:**
→ payee-account-age, fan-in, fan-out, amount-conservation, first-time-payee, is-collect, is-mandate, VPA-name-mismatch

**HARD = victim willing → external/cross-victim:**
→ device-integrity (remote-access flag), multi-victim receiver clustering, escalation-over-time, urgency-context

## 💡 The honest truth (pitch gold)
> "Unauthorized frauds (hacked account) hum easily pakad lete sender signals se. Authorized Push Payment frauds (victim khud bhejta — investment/digital-arrest/romance) industry-wide HARDEST hain — kyunki transaction genuine dikhta. Inka best defence = RECEIVER-side mule intelligence (woh account dusre victims se bhi paisa le raha) + device telemetry. Hum jaante kya easy, kya hard — aur dono attack karte."

## 🏪 Receiver / Merchant Verification (paying a "shop"? verify it)
Jab user kisi business/seller ko pay kare, yeh check karo:
- **Verified merchant (P2M) vs personal account (P2P)** — shop ko paisa personal account mein = 🚩
- **Payee registered naam vs claimed business naam** — mismatch = 🚩 (UPI receiver ka asli naam dikhata hai)
- **Receiver account age** — fresh = higher risk
- **Prior fraud reports / blocklist** — pehle reported VPA
- ⚠️ **NAHI kar sakte (honest):** company registration (MCA/GST) ya website asli hai — yeh external API/registry chahiye (bonus enrichment), aur naya-scam vs naya-genuine-seller payment ke waqt same dikh sakte.
> **Warning hum de sakte:** *"Yeh personal account hai, verified business nahi — saavdhan."*

## 🛠️ Master signal list (engine inputs)
**Sender:** new-device, binding-age, amount-vs-profile, odd-time, velocity, geo-jump, dormancy, concurrent-device, first-time-payee, device-integrity
**Receiver:** account-age, fan-in, fan-out, amount-conservation, cash-out, multi-victim-cluster, prior-flags, VPA-name-mismatch
**Type/context:** is-collect, is-mandate, is-QR, urgency-context, escalation-pattern
→ Weighted score → **Safe / Review / Block** + reason codes.

*(Research background mein chal raha — real documented cases + numbers aate hi yeh catalog update hoga.)*
