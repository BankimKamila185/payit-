# 📏 Fraud Rules + Trade-offs (Research-Grounded)
*Every rule has a CORRECT-side and a WRONG-side. Sources: RBI BE(A)WARE, RBI MuleHunter.AI, Stripe Radar, IBM AMLworld/Graph Feature Preprocessor, cost-sensitive XGBoost (EAI 2026).*

> Core principle (RBI, load-bearing): **entering UPI PIN or scanning a QR ALWAYS SENDS money, never receives.** So any "you'll receive money" flow that asks for PIN/QR = a scam debit.

---

## PART A — Rules per fraud type (with thresholds + trade-offs)

Legend — **FP** = false positive (legit wrongly flagged) · **FN** = false negative (fraud missed) · **Mitigation** = how to reduce the wrong side.

### 1. Collect-request / "request money" scam
- **Rule:** `type == COLLECT` + first-time payee + PIN prompt framed as "receive"
- ✅ Catches: OLX/marketplace "I'll pay you" collect scams
- ⚠️ **FP:** legit merchant (P2M) collect requests (bills, subscriptions) → **Mitigation:** only flag **P2P** collect from unknown payee (P2M collect is legit)
- ⚠️ **FN:** scammer registers fake merchant MCC → P2M collect slips
- *(RBI: P2P collect discontinued Oct 2025 — strong backstop)*

### 2. QR-code scam
- **Rule:** `channel == QR_SCAN` + `type == DEBIT` + first-time payee
- ✅ "scan to receive" scams
- ⚠️ **FP:** genuine QR payments to shops (very common) → **Mitigation:** warn (REVIEW), don't hard-block; combine with new-payee + amount
- ⚠️ **FN:** user ignores warning and pays anyway

### 3. Account takeover (credential theft / phishing)
- **Rule:** `new_device` + `amount_z > 3` + odd hour (any 2 of 3)
- ✅ Drain from hijacked account
- ⚠️ **FP:** genuine new-phone upgrade + big legit purchase → **Mitigation:** step-up auth (OTP), not block; whitelist known merchant receiver
- ⚠️ **FN:** cloned-device emulator mimicking home device at normal hour for typical amount

### 4. SIM swap
- **Rule:** `device_binding_age < 24h` + first high-value txn
- ✅ New-SIM re-registration drain
- ⚠️ **FP:** genuine SIM change / new phone → **Mitigation:** cooling-period cap (₹5,000 first 24h, PSP rule) instead of block
- ⚠️ **FN:** scammer waits 24h then micro-withdrawals under the cap

### 5. AnyDesk / screen-share
- **Rule:** device flag `screen_share/accessibility active` + big amount + new payee
- ✅ Remote-control drains
- ⚠️ **FP:** genuine remote-support session → **Mitigation:** need device telemetry (app-side); blur PIN when overlay active
- ⚠️ **FN:** custom remote tools bypassing accessibility APIs

### 6. Money mule — linear chain / peeling (RBI-defined)
- **Rule:** money in → forwarded out `<60s`, amount preserved `>90%`, ≥2 hops
- ✅ Layering chains A→B→C→fraudster
- ⚠️ **FP:** legit pass-through (father→son→hostel) → **Mitigation:** whitelist known payees + established-account age; require fresh accounts too
- ⚠️ **FN:** mule holds funds hours before forwarding

### 7. Fan-in (mule collection hub)
- **Rule:** receiver gets money from `≥5` unique senders in `<60s`
- ✅ Central mule collecting from many victims
- ⚠️ **FP:** bill-pooling (friends → one person for a trip), popular new merchant → **Mitigation:** exempt verified P2M; check if funds forwarded (mule) vs held (legit)
- ⚠️ **FN:** one dedicated mule per victim (no fan-in)

### 8. Fan-out / scatter-gather (smurfing/structuring)
- **Rule:** one account → `≥k` receivers rapidly (fan-out); scatter-gather = split→mules→re-aggregate
- ✅ Structuring under thresholds
- ⚠️ **FP:** payroll/reimbursement (finance sends to 25 staff) → **Mitigation:** exempt registered corporate/business accounts
- ⚠️ **FN:** spread over 24h (velocity flag doesn't fire)

### 9. Cycle (A→B→C→A)
- **Rule:** funds return to origin (simple/temporal cycle)
- ✅ Round-trip laundering
- ⚠️ **FP:** legit reciprocal payments (mutual repay) → **Mitigation:** temporal cycle (time-ordered) + amount-preserved only; high FP so signal-not-proof
- ⚠️ **FN:** longer cycles beyond window

### 10. Velocity / bot attack (MuleHunter core signal)
- **Rule:** `≥4-6` txns in `<60s`, or sudden activity spike vs baseline
- ✅ Automated drains / testing
- ⚠️ **FP:** flea-market hopping (many small legit) → **Mitigation:** exempt tiny amounts + known merchants
- ⚠️ **FN:** slow-and-low (1/hour)

### 11. Dormant reactivation
- **Rule:** account idle `>365d` → sudden large + forward
- ✅ Rented/bought laundering accounts
- ⚠️ **FP:** genuine dormant user returns → **Mitigation:** REVIEW not block
- ⚠️ **FN:** kept "warm" with tiny ₹10 txns

### 12. Investment / pig-butchering / digital-arrest (Authorized Push Payment)
- **Rule:** escalating amounts to new payee; big amount to fresh account under urgency
- ✅ Willing-victim scams
- ⚠️ **FP:** genuine large transfers (property, medical) → **Mitigation:** RECEIVER-side (multi-victim fan-in), step-up + warning
- ⚠️ **FN:** first victim of a fresh clean account = HARD (no history) — industry-wide unsolved

### 13. Merchant VPA spoofing / fake e-commerce
- **Rule:** VPA brand keyword ("bigbazaar/support") but receiver is P2P personal + name mismatch
- ✅ Lookalike / fake-shop scams
- ⚠️ **FP:** legit small seller with brandy VPA → **Mitigation:** warn only; verify registered name
- ⚠️ **FN:** scammer registers real business with matching name

---

## PART B — The master mitigation pattern (how pros keep FP low)
Grounded in Stripe Radar + our 3-tier design:
1. **Never block on ONE signal** — AND multiple (Stripe: `card_country != US` alone = "too broad"; add `AND risk_level = elevated`).
2. **3-tier decision** — SAFE / REVIEW (step-up auth) / BLOCK. Borderline → step-up, not block. (Stripe: request 3DS only if `risk != normal AND amount > $25` to protect conversion.)
3. **Exempt verified entities** — merchants (MCC), corporate accounts, known payees, tiny amounts.
4. **Goal:** "significantly more fraud blocked than legitimate payments" — keep FP as low as possible.

---

## PART C — Professional training-data recipe (to expand our data)
What makes data "professional" not "toy":
| Property | Professional value | Source |
|---|---|---|
| **Class imbalance** | ~**0.1-0.5% fraud** (not 9%) | IBM AMLworld 0.13%, ETH 0.278%, PaySim 0.13% |
| **Generation** | agent-based (MABS), calibrated distributions | PaySim, IBM AMLSim |
| **Labels** | perfect ground-truth (planted) | AMLSim is_sar |
| **Account IDs** | yes — for graph edges | AMLSim accounts.csv |
| **Temporal order** | yes — time-ordered edges | temporal cycle motif |
| **Fraud typologies** | **8 AML motifs**: fan-in, fan-out, scatter-gather, gather-scatter, simple cycle, temporal cycle, bipartite, stack | IBM Graph Feature Preprocessor |
| **Hard negatives** | **6 normal patterns** that resemble fraud | AMLSim |
| **Graph features** | fan-in/out counts, cycle flags as columns | +46% F1 vs basic-only (IBM) |
| **Imbalance handling** | cost-sensitive (`scale_pos_weight`), NOT SMOTE | preserves distribution; EAI 2026: FP 21→13 |
| **Threshold** | calibrated (not 0.5) | cost-sensitive XGBoost |

> **Action for us:** lower fraud rate toward ~1-2% (demo-balance), add the 8 motifs + more hard negatives, add graph-motif feature columns, keep cost-sensitive weighting + calibrate threshold.

---
*Honest caveat: social-engineering sub-types (romance, deepfake, SIM swap, malware) are real + widely documented but not independently source-verified in this pass — their exact thresholds are practitioner heuristics, not regulator-published numbers.*
