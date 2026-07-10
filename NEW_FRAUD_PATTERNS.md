# 🆕 New/Emerging UPI Fraud Patterns (2024–2026 research)
*Verified findings (RBI/NPCI/I4C/CloudSEK/McAfee). What we ADD to be ready for every type.*

---

## 1. Jumped Deposit Scam ⭐ (APP — new)
- **Mechanism:** Fraudster sends a tiny unsolicited credit (₹10/20/50) → victim reflexively opens app → fraudster fires a large **collect-request** → distracted victim enters PIN thinking it's a balance-check/return → large sum debited.
- **NPCI clarification (Jan 2025):** NOT a no-PIN auto-debit — always needs PIN (myth busted).
- **Signals:** incoming micro-credit (<₹100) immediately followed by outbound **collect** approval to new/unknown VPA; receiver seeds many small credits then collects large.
- **We add:** `recent_micro_credit` feature + `f_jumped_deposit` planter.

## 2. Digital Lutera — SIM-binding defeat (rooted/Xposed) ⭐ (UNAUTH — technical)
- **Mechanism:** Weaponized LSPosed/Xposed Android module hooks `sendTextMessage` (steals SMS reg key + blocks real SMS) and spoofs `getLine1Number()` → bank binds account on **attacker's rooted device** without physical SIM. Sold as cashout-as-a-service (CloudSEK Mar 2026).
- **Signals:** rooted-device / LSPosed / Xposed / emulator fingerprint; **SIM-reported number ≠ carrier records**; SIM re-binding from new device.
- **We add:** `device_rooted` + `sim_carrier_mismatch` features + `f_rooted_takeover` planter.

## 3. Money-Laundering-as-a-Service (mule network)
- **Mechanism:** Syndicates build illegal payment gateways on **rented/shell-company mule accounts** (Telegram-recruited) → fan-in from unrelated payers → fan-out overseas/consolidation. (I4C alert; Gujarat FIR 0113/2024, AP FIR 310/2024)
- **Signals:** many recently-opened accounts, fan-in from unrelated payers → fan-out to few consolidation/overseas accounts.
- **Coverage:** ✅ mostly covered (our fan-in/fan-out/chain/fresh-account graph). Strengthen with consolidation detection.

## 4. Govt-scheme malware (PM Surya Ghar) (UNAUTH)
- **Mechanism:** Fake gov-scheme APK (McAfee 2025) → sideloaded → accessibility abuse → PIN captured **outside NPCI library** → new-device UPI registration after install → OTP read.
- **Signals:** sideloaded APK / accessibility-service active, new-device registration soon after install, OTP-read permission.
- **Coverage:** ✅ partly (our `device_screen_share` + malware_drain). Strengthen with rooted/accessibility.

## 5. Collect-request abuse (being retired)
- **Mechanism:** P2P collect disguised as "receive" → victim PINs → money sent.
- **Update:** NPCI **retiring P2P collect (1 Oct 2025)** to kill this vector.
- **Coverage:** ✅ our `is_collect` + collect_scam.

## 6. AI voice-cloning impersonation (APP)
- **Mechanism:** Few seconds of social-media audio → clone family/official voice → urgency → UPI transfer (2025).
- **Signals (indirect):** urgency + unusual/first-time beneficiary + payment during active call + behavioral anomaly vs normal payee graph.
- **Coverage:** ✅ partly (our app_scam: first-time + amount). Hard (APP).

## 7. SIM-swap (UNAUTH)
- **Mechanism:** Duplicate SIM via telecom social-engineering → intercept OTP → drain.
- **Signals:** recent SIM re-provision before high-value txn, new device, IP/geo anomaly, **rapid payee-add-then-drain**.
- **We add:** strengthen with `sim_carrier_mismatch` + `f_beneficiary_drain` (add-then-drain).

---

## 🎯 What we implement (new features + planters):
**New features:** `recent_micro_credit`, `device_rooted`, `sim_carrier_mismatch`
**New planters:** `f_jumped_deposit`, `f_rooted_takeover`, `f_beneficiary_drain`
**New rules:** rooted device, SIM mismatch, micro-credit→collect, add-then-drain

> **Honest:** APP frauds (jumped-deposit, AI-voice) stay hard (victim PINs willingly) — best caught receiver-side (new VPA + micro-credit-then-collect). Technical ones (rooted/SIM) catchable via device signals.
