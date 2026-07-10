# 🔍 Competitive Analysis — 5 Existing Fraud Repos
*Cloned + analyzed all 5. What they do, what they miss, what to reuse, how to win.*

## Quick verdict table

| Repo | Data | Model | Metrics | API/UI | Real graph? | Real explainability? | Verdict |
|---|---|---|---|---|---|---|---|
| **r1 elangovana** | PaySim (synthetic) | XGBoost | none run (empty notebook) | ❌ notebook only | ❌ | ❌ | Feature/metric reference only |
| **r2 Ansem** | PaySim | XGBoost/LightGBM/**CatBoost** | CatBoost F1 0.88 (leaky) | ❌ static Streamlit | ❌ | ❌ | Best **model** reference |
| **r3 Luis** ⭐ | PaySim | XGBoost | F1 0.88, recall ~99%, ROC 0.995 | ✅ FastAPI+Streamlit+Docker | ❌ | ❌ | Best **architecture** template |
| **r4 Skismail** | `np.random` (!) | GNN+ensemble (mostly fake) | "95%" = `Math.random()` | ✅ but mock | ⚠️ code only, on noise | ❌ FAKE SHAP | Closest to us, but theater — beat it |
| **r5 SafePayAI** 🎯 | synthetic, rule-labeled | GAN+RandomForest | 97%, AUC **1.00** (memorized) | ✅ React+Flask+Firebase | ❌ | ❌ bare 0/1 | **The winner** — beatable |

---

## 🎯 BIGGEST FINDING — what NONE of them have (our differentiators)
1. **Real graph anomaly fused into scoring** — Skismail has GNN *code* but trained on random noise; rest have nothing.
2. **Real explainability** — elangovana/Ansem/Luis: none. Skismail: **fake SHAP** (`np.random.normal`). SafePayAI: bare 0/1, no probability.
3. **Real device fingerprint / behavioral signals** — all are random scalar columns. Zero real capture.
4. **Honest <200ms latency benchmark** — none measured; SafePayAI hardcodes `100.0`, Skismail `Math.random()`.
5. **Real live payment block** — SafePayAI's "block" is a `setTimeout(3000)` over pre-seeded mock data.

> **Translation:** even the NPCI WINNER lacks graph, explainability, real device signals, and a real-time block. **These 5 things = our winning lane.**

---

## ⚠️ MISTAKES they all make (we MUST avoid)
1. **DATA LEAKAGE** → inflated metrics. PaySim post-transaction balance fields leak the answer; Ansem even refits encoder on test. *Their 97% is not real.* → We drop post-decision fields, fit only on train.
2. **Accuracy on imbalanced data** (fraud ~0.13%) is meaningless. → We report **PR-AUC, recall, F1, false-positive rate**.
3. **Fake numbers** — Skismail `Math.random()` KPIs + fake SHAP. → We show **real** metrics + real SHAP, honest UI (error if backend down, never fabricate).
4. **Rule-labeled synthetic data the model memorizes** (SafePayAI AUC=1.00). → Realistic data + honest held-out eval.
5. **Kitchen-sink buzzwords** (Skismail: blockchain/federated/RL/9 modules, none work). → Ship a **small set that fully works**.

---

## ♻️ What to REUSE (don't reinvent)
- **Model:** **XGBoost** (or CatBoost) on PaySim — XGBoost = best SHAP/ecosystem support, CatBoost = fastest+strong. (from Ansem/Luis)
- **Architecture template (r3 Luis):** `model.pkl` + FastAPI (load-once, Pydantic schema, `/score`) + Streamlit UI + Docker. Copy this skeleton.
- **Graph structure reference (r4 Skismail):** their PyG hetero-graph (user/merchant/device nodes) shows *how to model* — but we'll use lightweight NetworkX motifs (fan-in/out, cycle), not a noise-trained GNN.
- **Decision policy (r4):** ALLOW / CHALLENGE / BLOCK at thresholds — clean, keep it.
- **Metric discipline (r1):** PR-AUC + leakage hygiene (drop post-transaction fields).

---

## 🏆 HOW WE BEAT THE WINNER (SafePayAI)
Match their polish (auth, dashboard, animated block) **+ add the 3 things they structurally can't demo:**
1. 🕸️ **Graph showing a detected fraud/mule ring** live
2. 💬 **"Why" panel** — real SHAP reason codes + fraud probability + confidence
3. ⚡ **Real device/behavioral signal flipping a live decision in <200ms** (shown latency on screen)

Plus: **honest metrics on realistic data** — turn their "AUC 1.00 on rule-labeled synthetic" from a strength into a **credibility liability** when judges compare.

> **One-line pitch:** "They showed 97% on data their model memorized, with a decorative GAN and a 0/1 output. We show honest metrics, a live mule-ring graph, SHAP reason codes, real device signals, and a genuine sub-200ms in-flight block."

---

## ✅ Final build decisions (locked)
- **Tabular model:** XGBoost on PaySim (SHAP-friendly) → our "behavioral" tier + proof metrics
- **Engine:** rule + graph (NetworkX motifs) — the live, explainable, <200ms decision
- **Explainability:** REAL SHAP (TreeExplainer) → reason codes
- **API/UI:** FastAPI (structured JSON + latency) + dashboard (feed, flags, graph, why-panel, attack button) — Luis skeleton
- **GNN:** ❌ future-work slide (don't train; too risky, Skismail proved it gets faked)
- **Honesty:** real data split, PR-AUC/recall, no leakage, no fake numbers
