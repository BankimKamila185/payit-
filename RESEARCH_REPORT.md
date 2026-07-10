# UPI Fraud Detection — Deep Research Report
*Goal: build a competition-winning real-time UPI fraud scoring engine for demo day (vs. senior teams).*
*Method: 105 research agents, 23 sources fetched, 92 claims extracted, 25 adversarially verified (24 confirmed, 1 refuted).*

---

## TL;DR — The Winning Strategy

Mirror what real fintechs (Feedzai, Featurespace/ARIC) actually do: **correlate behavioral + device + transaction + graph signals in real time → sub-200ms decision → with explainability.**

**Three differentiators that beat senior teams:**
1. **Graph-based mule-ring detection** — reveals hidden links between accounts/devices/transactions that flat models miss.
2. **Composite explainability** — GNNExplainer subgraph + Shapley reason codes → judge-facing "why flagged".
3. **Align with India's live regulation** — RBI **MuleHunter.AI** (launched Dec 2024) + **Digital Payments Intelligence Platform (DPIP)** prototype. Shows you know the real landscape.

**Plus:** a real **test-mode end-to-end payment demo** (no bank onboarding needed) via Razorpay/PhonePe/Cashfree sandboxes.

**Macro pitch number:** Indian bank fraud value nearly **tripled to ~₹36,014 crore in FY25** (RBI Annual Report 2024-25). *(Caveat: general bank fraud, not UPI-only; partly a one-time reclassification — cite carefully.)*

---

## 1. How real fraud-detection systems work  `[confidence: HIGH, 3-0]`

Production platforms (Feedzai, Featurespace ARIC) detect by **correlating multidimensional signals in real time at ultra-low latency**:
- Behavioral biometrics
- Device intelligence / fingerprinting
- Transaction patterns
- Network / graph data

ARIC uses Adaptive Behavioral Analytics + Automated Deep Behavioral Networks (RNNs) to profile each customer and adapt to new scams live.

> **Takeaway for us:** our engine architecture (multi-signal + low latency) should *emulate this*. That's the credible standard.
> Sources: feedzai.com/fraud, featurespace.com/aric-risk-hub

---

## 2. Graph Neural Networks (GNN) — the differentiator  `[confidence: HIGH, 3-0]`

GNNs **surface hidden connections between accounts, devices, and transactions** that traditional transaction-centric models overlook → highly effective against **collusive mule rings**. LAS-GNN (ACM ICAIF, Nov 2025) detects laundering via suspicious temporal subgraph motifs following the flow of funds.

> ⚠️ **CRITICAL framing:** The claim that GNNs *"significantly outperform"* traditional methods was **REFUTED (0-3)**. So pitch GNNs as **revealing hidden relational/mule structure**, NOT as a guaranteed accuracy win. Don't overclaim — judges (esp. senior teams) will catch it.

---

## 3. Concrete feature win — behavioral velocity  `[confidence: HIGH, 2-1]`

Adding **dAmount** (Δ amount) and **dTime** (Δ time) between consecutive transactions of the same sender/receiver boosted detection: **0.946 accuracy / 0.937 AP / 0.964 AUC** (vs. 0.895 / 0.877 / 0.882 baseline).

> **Takeaway:** simple, feasible feature engineering that visibly improves results. Easy to build + show.
> *(Caveat: single synthetic J.P.Morgan dataset, not real UPI.)*

---

## 4. Explainability strategy  `[confidence: HIGH, 3-0]`

Best-practice = **composite explainer**: GNNExplainer subgraph + node-feature Shapley values + edge-missingness Shapley values → natural source of **reason codes** for the demo UI ("flagged because: new device + 22x amount + mule chain").

---

## 5. Privacy / consortium angle (advanced, optional)  `[confidence: HIGH, 3-0]`

**GNN + Federated Learning** = institutions train a shared model **without sharing raw data**. Conceptually mirrors RBI's DPIP consortium idea.
> Good *forward-looking pitch slide* even if not fully built. Ambitious-but-feasible as a "future work" angle.

---

## 6. ✅ REAL test-mode demo — no bank needed  `[confidence: HIGH, 3-0]`

A genuine end-to-end (test-mode) UPI payment flow with our fraud engine **inline** is buildable **free, no business onboarding**:

| Provider | Test UPI VPAs | Notes |
|---|---|---|
| **Razorpay** | `success@razorpay` / `failure@razorpay` | "No real money deducted, test API keys." Easiest. |
| **PhonePe** | `success@ybl` / `failed@ybl` / `pending@ybl` | UAT sandbox `api-preprod.phonepe.com/apis/pgsandbox` + simulator app. UPI QR + Intent. |
| **Cashfree** | `testsuccess@gocash` / `testfailure@gocash` / `testinvalid@gocash` | Mirrors prod: cards, UPI, wallets, refunds, webhooks. |

> **Our engine sits in the merchant flow and scores each transaction before/around the simulated payment call.** This = the "L3 real" demo I mentioned earlier. ⚠️ Verify current VPAs/endpoints right before demo (vendor docs change).

---

## 7. Free public datasets  `[confidence: HIGH, 3-0]`

| Dataset | What | Use for |
|---|---|---|
| **PaySim** (Kaggle `ealaxi/paysim1`) | Synthetic mobile-money txns, fraud-labeled | Behavioral/transaction model — closest to UPI |
| **Bank Account Fraud (BAF)** (Kaggle, NeurIPS 2022) | Privacy-preserving realistic tabular suite (CTGAN + diff. privacy) | Tabular fraud classifier |
| **Elliptic** (GitHub elliptic-co) | Real 203,769-node / 234,355-edge Bitcoin tx graph, labeled | **Graph/mule methodology** — for the GNN part |

> ⚠️ None is real UPI data — relevance is by methodology/analogy. Be honest about this in the pitch.

---

## 8. Regulatory tailwind (pitch ammo)  `[confidence: HIGH, 3-0]`

- **RBI MuleHunter.AI** — AI/ML mule-account detection, launched **Dec 2024**, scaling to 23 banks by Dec 2025.
- **DPIP (Digital Payments Intelligence Platform)** — RBI/RBIH prototype with 5-10 banks vs. digital payment fraud.
- Bank fraud value ~**₹36,014 cr in FY25** (≈3x FY24).

> Saying "our project aligns with RBI's MuleHunter.AI and DPIP direction" = instant credibility.

---

## ⚠️ Honest caveats (read before pitching)
- Vendor claims (Feedzai/Featurespace) are partly marketing; "sub-200ms" comes from 3rd-party sources, not vendors.
- GNN "outperformance" was **refuted** — frame as *structure-revealing*, not accuracy guarantee.
- GNN/FL feature claims lean on an undergrad dissertation + a possibly-predatory journal → treat as **feasible directions**, not proven production.
- No dataset is real UPI; RBI ₹36k cr figure is general bank fraud + partly a reclassification.

## Open questions to resolve
1. Any genuinely **UPI-specific** dataset (vs. mobile-money/Bitcoin proxies)?
2. Which sandbox best demos **collect-request / QR scam** mechanics (not just success/failure)?
3. Exact **sub-200ms tech stack** (feature store, streaming, model serving)?
4. How to simulate **device-fingerprint / behavioral-biometric** signals without real users?

---
*Full source list with quality ratings retained in the workflow transcript.*
