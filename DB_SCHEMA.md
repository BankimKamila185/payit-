# 🗄️ Database Schema (Detailed) — UPI Fraud Shield
*1 PostgreSQL DB. Mandate table removed. Har column ka matlab + kaunsa fraud signal deta.*

Tables: **banks, accounts, devices, vpa_mapper, transactions, fraud_reports, sessions(app)**

---

## 1. `banks` — bank list (realism: sender bank → receiver bank)
| Column | Type | Matlab |
|---|---|---|
| id | serial PK | bank id |
| name | text | "HDFC Bank", "SBI", "Axis" |
| ifsc_prefix | text | "HDFC0", "SBIN0" |

---

## 2. `accounts` — user/merchant ki poori kundli (sabse important)
| Column | Type | Matlab | Fraud signal |
|---|---|---|---|
| id | serial PK | account id | — |
| vpa | text UNIQUE | "sita@okhdfc" | identity |
| name | text | "Sita Sharma" | A6 naam-match |
| phone | text | mobile | F8 shared-mobile cluster |
| email | text | email | — |
| bank_id | int FK→banks | kaunsa bank | routing |
| account_number | text | account no | — |
| account_age_days | int | account kitna purana | **A2** naya receiver |
| kyc_level | enum | BASIC/VIDEO/CORPORATE | **A5** low KYC risk |
| pan_hash | text | PAN ka hash | self-transfer match |
| is_merchant | bool | dukaan ya user | **A4** P2P vs P2M |
| mcc | int | merchant category (8062=hospital) | **G1** category |
| balance | numeric | current balance | **B4** drawdown |
| home_device_id | text | usual device | **D1** new device |
| usual_hours | int[] | active ghante [9..22] | **B3** odd-hour |
| avg_amount | numeric | normal spend | **B1** amount spike |
| created_at | timestamptz | kab bana | dormancy |
| blacklisted | bool | flagged? | **A9** blacklist |

> Yeh table = "receiver/sender ki kundli" jo engine padhता hai. App signup pe basic banata, baaki fields hum (data-gen) bharte.

---

## 3. `devices` — device fingerprint
| Column | Type | Matlab | Fraud signal |
|---|---|---|---|
| id | serial PK | — | — |
| device_id | text UNIQUE | device hash | **D3** signature |
| account_id | int FK→accounts | kiska device | **D1** new device |
| os | text | Android/iOS | — |
| binding_age_days | int | kab bind hua | **D2** fresh binding |
| is_rooted | bool | rooted/jailbroken | **D4** root |
| is_emulator | bool | emulator? | **D4** emulator |
| ip_risk_score | float | VPN/proxy threat | **D6** IP rep |

> ⚠️ Real mein yeh app/PSP-side capture hota; demo mein hum simulate karke DB mein daalenge.

---

## 4. `vpa_mapper` — VPA → account resolve (NPCI mapper jaisa)
| Column | Type | Matlab |
|---|---|---|
| id | serial PK | — |
| vpa | text | "rahul@okaxis" |
| account_id | int FK→accounts | kaunsa account |
| bank_id | int FK→banks | kaunsa bank |
| active | bool | VPA chalu? |

> Yeh "switch" ko VPA se asli account dhoondhne deta — real UPI flow jaisa.

---

## 5. `transactions` — ledger + fraud decision log (dil)
| Column | Type | Matlab | Use |
|---|---|---|---|
| id | serial PK | — | — |
| txn_ref | text UNIQUE | RRN/txn id | idempotency |
| sender_vpa | text | bhejne wala | B-signals |
| receiver_vpa | text | jise gaya | A-signals |
| amount | numeric | kitna | **C1** |
| ts | timestamptz | exact time | — |
| hour | int | ghanta (0-23) | **C2** odd-hour |
| type | enum | PAY/COLLECT/QR | **C3** collect-scam |
| channel | enum | QR/INTENT/MANUAL/CONTACT | **C4** |
| device_id | text | kaunse device se | D-signals |
| status | enum | SUCCESS/FAILED/PENDING/BLOCKED | result |
| score | int | 0-100 fraud score | engine output |
| label | enum | SAFE/REVIEW/BLOCK | decision |
| fraud_probability | float | ML probability | proof |
| reasons | jsonb | ["new device", "22x amount"] | **why panel** |
| ring | jsonb | mule chain agar mila | **graph** |
| latency_ms | float | kitne ms mein scored | **<200ms proof** |
| created_at | timestamptz | — | — |

> Yeh **shared** — app likhta (txn), engine score/label/reasons wapas likhta. Graph ke liye recent rows yahीं se aate (fan-in/out, chain).

---

## 6. `fraud_reports` — victim reports / blacklist source
| Column | Type | Matlab | Signal |
|---|---|---|---|
| id | serial PK | — | — |
| reported_vpa | text | jise report kiya | **A8** reports count |
| reporter_vpa | text | kisne report kiya | — |
| reason | text | "scam/mule" | — |
| amount_lost | numeric | kitna gaya | — |
| reported_at | timestamptz | kab | recency |

> `/report` endpoint isme likhta → engine A8/A9 (reports+blacklist) signal padhता. Tera "Trace & Report" feature isi se.

---

## 7. `sessions` — app login (TEAM ka, engine ko nahi chahiye)
| Column | Type | Matlab |
|---|---|---|
| id | serial PK | — |
| account_id | int FK→accounts | kaun logged in |
| token | text | auth token |
| created_at / expires_at | timestamptz | session validity |

---

## 🔗 Relationships (kaise jude)
```
banks  ──1:N──>  accounts  ──1:N──>  devices
accounts ──1:N──> vpa_mapper
accounts (sender/receiver) ──> transactions
accounts ──> fraud_reports
accounts ──1:N──> sessions
```

## 📊 Kaun likhta / padhta
| Table | App | Engine |
|---|---|---|
| banks | padhta | padhta |
| accounts | likhta (signup) | padhta (signals) |
| devices | likhta (app capture) | padhta |
| vpa_mapper | — | padhta (resolve) |
| transactions | likhta (send) | padhta + score/label likhta |
| fraud_reports | likhta (report btn) | padhta (blacklist) |
| sessions | likhta+padhta | — |

## Net
> **1 Postgres DB, 7 tables. Mandate hata. Core fraud signals saare in tables se aate. App + engine shared, sab realistic UPI structure (banks + vpa_mapper + devices).**
