# 🎯 Real UPI Fraud Cases → Real Detection Solutions
*Har case: asli scenario → transaction kaisa dikhta → kaun se signal pakadte → score → kitna mushkil (honest).*

---

## 🔑 Sabse pehle — THE BIG INSIGHT (yeh poora solution hai)

Har fraud ke **2 side** hote:

| Side | Kab | Kaise pakdein |
|---|---|---|
| **SENDER compromised** | Account hack, SIM swap, AnyDesk | **Sender signals** — naya device, odd behaviour |
| **SENDER genuine, but tricked** | Phishing, collect-scam, QR, investment | Sender NORMAL dikhta! → **RECEIVER side se pakdo** (mule account) |

> **Critical:** Sabse common fraud = victim **khud** paisa bhejta (tricked). Wahan sender bilkul normal lagta — apna phone, apna PIN. **Toh hum RECEIVER (jise paisa gaya) ko dekhte** — woh account mule hai kya? Yahi asli solution hai, aur yahi industry/RBI ka focus (MuleHunter.AI receiver-side hi dekhta).

Toh hamare signals 2 buckets mein:
- **Sender signals:** device new?, amount spike?, odd time?, velocity?
- **Receiver signals:** account naya?, bahut logon se paisa aa raha (fan-in)?, turant aage forward (fan-out)?, pehle kabhi is payee ko bheja?, cash-out pattern?

---

## CASE 1 — Phishing / Fake KYC → Account Takeover
**Scenario:** Sita link pe credentials daali → scammer naye phone pe login → paisa nikaala.
**Transaction dikhta:** sender=Sita, **device=naya**, amount bada, receiver=fresh account.
**Signals:** 🔴 New device (+25) + amount spike (+35) + new receiver (+15)
**Score:** ~75 → **BLOCK**
**Difficulty:** 🟢 EASY — naya device strong tell hai.

---

## CASE 2 — Collect Request Scam ("paisa aa raha hai" jhooth)
**Scenario:** OLX pe "buyer" collect-request bhejta, Sita ko lagta receive ho raha, PIN daal deti → paisa *jaata*.
**Transaction dikhta:** ek **COLLECT (pull) request**, unknown payee se, Sita ne pehle kabhi inhe pay nahi kiya.
**Signals:** 🔴 Collect-from-unknown-VPA (+30) + first-time payee (+20) + amount (+20)
**Score:** ~70 → **REVIEW/BLOCK** + warning: *"Yeh paisa BHEJ rahe ho, le nahi rahe!"*
**Difficulty:** 🟡 MEDIUM — collect-request type + unknown payee se pakad sakte. (NPCI ne 2025 mein P2P collect band/limit bhi kiya isi liye.)
**Real solution:** collect-request transactions ko alag, higher scrutiny do — yeh fraud mein over-represented hain.

---

## CASE 3 — QR Code Scam
**Scenario:** "Refund ke liye QR scan karo" → scan = paisa *debit*.
**Transaction dikhta:** QR-initiated payment to unknown merchant/person, "refund" context mein debit.
**Signals:** 🔴 First-time payee (+20) + amount unusual (+20) + (QR to P2P account, not real merchant) (+15)
**Score:** ~55 → **REVIEW** + warning *"QR scan = paisa DENA hai"*
**Difficulty:** 🟡 MEDIUM.

---

## CASE 4 — AnyDesk / Screen-share Remote Control
**Scenario:** Victim ko app download karwaya, scammer screen dekh ke victim ke **apne phone se** paisa nikaalta.
**Transaction dikhta:** sender=victim, **device=victim ka apna** (!), par amount bada, odd time, unknown payee.
**Signals:** amount (+35) + odd time (+15) + new receiver (+15) + **device-integrity: screen-share/accessibility app active (+30)**
**Score:** ~65 → **BLOCK**
**Difficulty:** 🔴 HARD — device apna hai, toh sirf transaction se mushkil. **Asli solution:** device telemetry — kya remote-access app (AnyDesk/accessibility service) chalu hai? Yeh ek strong signal hai jo real apps (jaise RBI advisory) use karte. Demo mein hum "device flags" simulate kar sakte.
> **Honesty:** pure transaction scoring se yeh weakest hai — device intelligence chahiye. Pitch mein bolna.

---

## CASE 5 — SIM Swap / Account Takeover
**Scenario:** Number clone → naye device pe UPI re-register → account khaali.
**Transaction dikhta:** **naya device binding abhi-abhi hua**, fir turant high-value txn.
**Signals:** 🔴 New device (+25) + **device binding < 24h purana (+25)** + amount spike (+35) + velocity (+20)
**Score:** ~90+ → **BLOCK**
**Difficulty:** 🟢 EASY-MEDIUM — "naya device binding + turant bada transfer" classic pattern.
**Real solution:** device re-binding ke baad ka **cooling period** — fresh binding + big amount = high risk.

---

## CASE 6 — Money Mule (receiver side) ⭐
**Scenario:** Chori ka paisa ek account mein, fir aage. Mule = woh account jisme paisa aa-jaa raha.
**Transaction dikhta:** receiver account pe **fan-in** (bahut senders se credit) + **fan-out** (turant aage), ya chain.
**Signals:** 🔴 Receiver fan-in (many→1) (+30) + rapid forward/fan-out (+30) + fresh account (+15) + amount conserved (+15)
**Score:** ~80 → **BLOCK / flag account**
**Difficulty:** 🟡 MEDIUM — receiver behaviour se strong. **Yeh woh case jahan "graph" actually shine karta — par akela chain nahi, fan-in/fan-out + speed + fresh.**
**Real solution:** receiver-account risk scoring (mule intelligence) — ek hero feature, par **chain hone = fraud NAHI**; pattern (rapid + conserved + fresh + no purpose) chahiye.

---

## CASE 7 — Investment / Job / Loan Scam
**Scenario:** "₹500 registration", "invest karo 3x", victim **willingly** bheje, baar-baar badhte amount.
**Transaction dikhta:** sender genuine (apna device), receiver fresh, repeated increasing transfers to same new payee.
**Signals:** first-time payee (+20) + receiver is mule/fresh (+25) + escalating amount pattern (+15)
**Score:** ~60 → **REVIEW** (warn) → repeat pe BLOCK
**Difficulty:** 🔴 HARD — sender genuine, willingly bhej raha. **Asli solution = RECEIVER side** (woh account scam ke liye use ho raha, dusre victims se bhi paisa le raha → fan-in). Pehla victim mushkil, par jaise multiple victims aate, receiver pakda jaata.
> **Honesty:** yeh "Authorized Push Payment" fraud hai — industry-wide hardest. Receiver-intelligence best defence.

---

## CASE 8 — Mandate / AutoPay Abuse
**Scenario:** "Lottery claim" bolke AutoPay mandate approve karwa lete → recurring debit.
**Transaction dikhta:** mandate creation, high amount, unknown payee, "claim/reward" context.
**Signals:** new mandate to unknown payee (+25) + high mandate amount (+20)
**Score:** ~45 → **REVIEW** at mandate-setup time
**Difficulty:** 🟡 MEDIUM — mandate creation pe check karo, execution pe nahi.

---

## CASE 9 — Bot / Velocity Attack
**Scenario:** Hacked account → 1 min mein 50 chote transfers (taaki ek bada na dikhe).
**Signals:** 🔴 Velocity (+30) + multiple new receivers (+20) + new device (+25)
**Score:** ~75 → **BLOCK**
**Difficulty:** 🟢 EASY — burst pattern saaf.

---

## 📊 Summary — kaun kitna catchable (HONEST)

| Case | Main signal | Difficulty |
|---|---|---|
| 1. Phishing→ATO | new device | 🟢 Easy |
| 2. Collect scam | collect-type + unknown payee | 🟡 Medium |
| 3. QR scam | first-time payee | 🟡 Medium |
| 4. AnyDesk | **device telemetry** | 🔴 Hard |
| 5. SIM swap | new device binding | 🟢 Easy |
| 6. Money mule | receiver fan-in/out | 🟡 Medium |
| 7. Investment scam | **receiver intelligence** | 🔴 Hard |
| 8. Mandate abuse | mandate setup | 🟡 Medium |
| 9. Bot attack | velocity | 🟢 Easy |

## 🎤 Pitch honesty (yeh judges ko impress karega)
> "Hum dono side dekhte — sender compromised cases (new device, SIM swap) sender-signals se, aur sabse mushkil 'victim khud bhejta' (APP) frauds receiver-side mule-intelligence se. Kuch cases (AnyDesk, first-time investment scam) pure transaction se hard hain — unke liye device telemetry / multi-victim receiver patterns chahiye. Hum jaante kya easy, kya hard — yahi real engineering hai."

---

## 🛠️ Toh engine ko yeh signals chahiye (final list)
**Sender:** new-device, device-binding-age, amount-vs-profile, odd-time, velocity, first-time-payee, device-integrity(remote-access flag)
**Receiver:** account-age, fan-in (many senders), fan-out (rapid forward), amount-conservation, cash-out, prior-flags
**Type:** is-collect-request, is-mandate, is-QR
→ Inka weighted score = 0-100 → Safe / Review / Block + reason codes.
