# 🎯 Master Signal List — Har Aspect Jisse Hum Check Karenge
*Engine ke saare inputs. Har signal: kya check karta + fraud sign + kispe lagta (User/Merchant/Both).*

Legend: 👤 = normal user (P2P) | 🏪 = merchant (P2M) | 🔵 = dono

---

## A. RECEIVER (jise paisa ja raha) — uski poori kundli

| # | Signal | Kya check karta | Fraud sign | Lagta |
|---|---|---|---|---|
| A1 | First-time payee | Pehle kabhi is account ko bheja? | Pehli baar + bada amount | 🔵 |
| A2 | Receiver account age | Account kitna purana | < 7 din = risk | 🔵 |
| A3 | Receiver VPA age | VPA kab bana | Naya VPA = risk | 🔵 |
| A4 | Account type | P2P (personal) ya P2M (merchant) | Shop ko personal account | 🔵 |
| A5 | KYC level | Basic / Video / Corporate verified | Low KYC + bada amount | 🔵 |
| A6 | Name match (VPA vs registered) | VPA "BigBazaar", naam "Ramesh"? | Mismatch | 🔵 |
| A7 | VPA keyword risk | VPA mein "refund/support/cashback"? | Brand/keyword spoof | 🔵 |
| A8 | Fraud reports count | Kitne logon ne report kiya (24h/30d) | > 0 = risk | 🔵 |
| A9 | Blacklist status | I4C/internal blacklist mein? | Haan = block | 🔵 |
| A10 | Receiver balance behaviour | Paisa rakhta ya turant nikaalta | Turant cash-out | 🔵 |

---

## B. SENDER (jo bhej raha) — uska behaviour

| # | Signal | Kya check karta | Fraud sign | Lagta |
|---|---|---|---|---|
| B1 | Amount vs normal (z-score) | Banda aksar kitna bhejta | 5-10x zyada | 👤 |
| B2 | Median/avg history | Uska usual amount | Achaanak spike | 👤 |
| B3 | Active hours | Yeh normally kab active | Raat 2-5 baje | 👤 |
| B4 | Balance drawdown | Poora account khaali? | > 90% balance | 👤 |
| B5 | Failed PIN attempts | Kai galat PIN fir success | Multiple fails | 👤 |
| B6 | Sender account age | Sender kitna purana | Naya sender | 🔵 |
| B7 | Dormancy | Purana account achaanak active | 12 mahine baad bada txn | 🔵 |

---

## C. TRANSACTION khud

| # | Signal | Kya check karta | Fraud sign | Lagta |
|---|---|---|---|---|
| C1 | Amount | Kitna paisa | Bada/round number | 🔵 |
| C2 | Time of day | Kab hua | Odd hour | 🔵 |
| C3 | Transaction type | PAY/COLLECT/MANDATE/QR | Collect/mandate from unknown | 🔵 |
| C4 | Channel | QR / intent / typed VPA / contact | QR-debit, typed unknown | 🔵 |
| C5 | Reverse transfer | B ne A ko bheja, A ne kabhi nahi | Overpayment scam | 🔵 |
| C6 | Amount escalation | Baar-baar badhte amount | Investment scam | 👤 |

---

## D. DEVICE & TECHNICAL (app/PSP-side se aata)

| # | Signal | Kya check karta | Fraud sign | Lagta |
|---|---|---|---|---|
| D1 | Device new/known | Apna phone ya naya | Naya device | 🔵 |
| D2 | Device binding age | Binding kitna naya | < 24h + bada txn | 🔵 |
| D3 | Device signature | Hardware fingerprint match | Mismatch | 🔵 |
| D4 | Root/emulator flag | Phone rooted/emulator? | Haan = risk | 🔵 |
| D5 | Screen-share/accessibility | AnyDesk/remote active? | Active = risk (AnyDesk scam) | 🔵 |
| D6 | IP reputation | VPN/proxy/Tor? | High threat IP | 🔵 |
| D7 | Geo / impossible travel | Delhi → Chennai 10 min? | Geo jump | 🔵 |
| D8 | SIM/carrier mismatch | SIM carrier vs IP | Mismatch | 🔵 |

> ⚠️ D4-D8 app/PSP capture karta, switch ko pass karta (real flow).

---

## E. VELOCITY (speed)

| # | Signal | Kya check karta | Fraud sign | Lagta |
|---|---|---|---|---|
| E1 | Txn count 1m/10m/1h | Kitne transactions short window | Burst (bot) | 🔵 |
| E2 | New-receiver burst | Kai naye receivers jaldi | Hacked account drain | 👤 |
| E3 | Success ratio | Kitne fail vs success | Many fails = probing | 🔵 |

---

## F. NETWORK / GRAPH (gang/ring)

| # | Signal | Kya check karta | Fraud sign | Lagta |
|---|---|---|---|---|
| F1 | Fan-in | Many senders → 1 account | Mule collection | 🔵 |
| F2 | Fan-out | 1 account → many receivers | Distribution/mule | 🔵 |
| F3 | Holding time | Paisa kitni der ruka | < 60s (pass-through) | 🔵 |
| F4 | Amount preservation | Same amount aage gaya? | > 90% conserved = layering | 🔵 |
| F5 | Chain/path depth | A→B→C→D hops | 3+ rapid hops | 🔵 |
| F6 | Cycle | A→B→C→A (paisa wapas) | Laundering | 🔵 |
| F7 | Shared device cluster | Kai accounts ek device pe | Mule farm | 🔵 |
| F8 | Shared mobile cluster | Kai accounts ek number pe | Mule farm | 🔵 |
| F9 | Scatter-gather | Split → mules → re-aggregate | Smurfing | 🔵 |

---

## G. MERCHANT-SPECIFIC (🏪 ke liye extra)

| # | Signal | Kya check karta | Fraud sign |
|---|---|---|---|
| G1 | MCC (category code) | Kaunsa business type | Mismatch with claimed |
| G2 | Merchant verified? | Registered/verified merchant | Unverified "shop" |
| G3 | Merchant txn volume normal | Normal velocity for shop | Sudden abnormal |
| G4 | Merchant age | Kitna purana merchant | Naya + high volume |

> 🏪 Merchant ke liye: velocity bypass (dukaan ko 400 payment normal), par MCC/verify check zaroori.

---

## 🔀 User vs Merchant — farak kaise

| Scenario | Kya alag check |
|---|---|
| 👤 **Normal user (P2P)** | Sender behaviour (B1-B5), first-time payee (A1), device (D1-D8) — full scrutiny |
| 🏪 **Merchant (P2M)** | Velocity bypass (G3), MCC verify (G1), par verified status (G2) zaroori. Hospital/shop ko bada amount safe agar verified |

> Yahi false-positive se bachata: verified merchant ko bada/odd-time payment = SAFE (Section II false-alarms).

---

## ⚙️ Sab milke → SCORE

```
Har signal → points (weight)
Sender (B) + Receiver (A) + Transaction (C) + Device (D) + Velocity (E) + Graph (F) + Merchant (G)
        ↓
Total 0-100 → 🟢 Safe (<35) | 🟡 Review (35-60) | 🔴 Block (60+)
        ↓
+ Reason codes (SHAP) — "kyun flag kiya"
```

## Honest note
- A1-A10, B1-B7, C1-C6, E, F, G → **real** (hamari DB se compute)
- D4-D8 (device telemetry) → app-side, demo mein simulate karenge
- A9 blacklist → I4C real mein, demo mein hamari list
