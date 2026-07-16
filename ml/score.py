"""
UPI Fraud Shield — Score Combiner (the engine's brain)
======================================================
Combines the three detectors into ONE decision + explanation:

  1. XGBoost model  (learned patterns)      -> fraud_probability
  2. Rule layer     (known signals)         -> rule_score + reasons
  3. Graph module   (mule networks)         -> ring_score + path

Final score = weighted blend -> 3-tier decision:
  SAFE (<35)  |  REVIEW (35-59)  |  BLOCK (60+)

The 3-tier design handles false positives (per research): borderline cases go
to REVIEW (step-up auth) instead of a hard block — genuine users pass, fraud
can't. Every decision comes with reason codes ("why").
"""

from __future__ import annotations
from pathlib import Path
import pandas as pd

from .explain import Explainer
from .rules import score as rule_score
from .graph import GraphAnalyzer

# blend weights: model + rules + graph
BLEND = {"model": 0.5, "rules": 0.3, "graph": 0.2}

SAFE_MAX = 35
REVIEW_MAX = 60


def decide(final_score: int) -> str:
    if final_score >= REVIEW_MAX:
        return "BLOCK"
    if final_score >= SAFE_MAX:
        return "REVIEW"
    return "SAFE"


def combine(model_score: float, rule_pts: float, graph_score: float,
            graph_motif: str | None) -> int:
    """Blend the 3 detectors, then let a STRONGLY-firing single detector escalate
    (real engines: any confident signal can trigger review, so the blend doesn't
    bury a definite mule ring or a hard rule hit)."""
    final = (BLEND["model"] * model_score + BLEND["rules"] * rule_pts +
             BLEND["graph"] * graph_score)
    # strong-signal escalation. Graph motif escalates ONLY with corroboration
    # (a lone chain can be legit father->son->hostel; a chain + risk signal is a
    # mule ring). This protects precision.
    if (graph_motif in ("CHAIN", "CYCLE") and graph_score >= 60
            and (rule_pts >= 25 or model_score >= 40)):
        final = max(final, 55)          # corroborated mule ring -> BLOCK edge
    if rule_pts >= 80:
        final = max(final, 70)          # very strong rule stack -> BLOCK
    elif rule_pts >= 55:
        final = max(final, 50)          # hard rule stack -> REVIEW
    # NOTE: a `rule_pts >= 35 -> REVIEW` floor used to live here. It was meant to
    # stop a lone blacklist hit (40 pts) landing SAFE — but blacklist is already
    # force-BLOCKed separately in /pay (receiver_blacklisted check), so the floor
    # was redundant there and instead flagged legitimate life as REVIEW: rent at
    # 12x-usual (amount_spike 30) or a night payment from a new phone
    # (odd_hour 15 + new_device 25) reach 35-54 with no fraud signal at all.
    # Distinguishing a hard 35 (screen-share/rooted) from a soft 35 (big-but-
    # normal payment) needs the rule BREAKDOWN, not just the total — that lives
    # in the detection-tuning pass, not in a blind numeric floor.
    if model_score >= 75:
        final = max(final, 60)          # model very confident -> BLOCK
    return int(round(min(final, 100)))


class FraudEngine:
    """Real-time scoring engine: model + rules + graph -> decision + why."""

    def __init__(self):
        self.explainer = Explainer()          # loads XGBoost + SHAP
        self.graph = GraphAnalyzer()

    def observe(self, txn: dict) -> None:
        """Record that money ACTUALLY moved along this edge.

        Call this only once the transfer is committed. The graph is evidence of
        real money flow: an edge here means "this account really did receive from
        that one", which is what makes a CHAIN mean anything.
        """
        self.graph.add(txn["sender_vpa"], txn["receiver_vpa"],
                       txn["amount"], txn["ts"])

    def score(self, txn: dict, observe: bool = True) -> dict:
        """
        txn = feature dict (dataset columns) + sender_vpa/receiver_vpa/amount/ts.
        Returns the full decision object.

        observe=True also records the edge in the graph, which is what offline
        replay (eval_combined, verify) wants: it is streaming a ledger of
        transactions that already happened.

        LIVE CALLERS MUST PASS observe=False. At /pay the verdict is not known
        yet — recording the edge here would enter BLOCKED transfers (money that
        never moved) into the graph and manufacture phantom mule chains for the
        next hop. /pay calls observe() itself after the transfer commits.
        """
        # ---- 1. model + SHAP reasons ----
        drop = {"ts", "sender_vpa", "receiver_vpa", "fraud_type", "is_fraud"}
        feat_row = pd.DataFrame([{k: v for k, v in txn.items() if k not in drop}])
        proba, shap_reasons = self.explainer.explain(feat_row)
        model_score = proba * 100

        # ---- 2. rules ----
        rl = rule_score(txn)

        # ---- 3. graph (mule ring) ----
        gr = self.graph.score(txn["sender_vpa"], txn["receiver_vpa"],
                              txn["amount"], txn["ts"])
        if observe:
            self.observe(txn)

        # ---- combine (blend + strong-signal escalation) ----
        final = combine(model_score, rl["score"], gr["score"], gr["motif"])
        label = decide(final)

        # ---- combine reasons (dedup, keep order: graph > rules > shap) ----
        reasons = []
        if gr["motif"] in ("CHAIN", "CYCLE") and gr["score"] >= 60:
            reasons.append(f"Mule {gr['motif'].lower()}: {' -> '.join(gr['path'])}")
        for r in rl["reasons"] + shap_reasons:
            if r not in reasons:
                reasons.append(r)

        return {
            "score": final,
            "label": label,
            "fraud_probability": round(proba, 4),
            "components": {
                "model": round(model_score, 1),
                "rules": rl["score"],
                "graph": gr["score"],
            },
            "reasons": reasons[:5],
            "ring": gr["path"] if gr["motif"] in ("CHAIN", "CYCLE") else [],
        }


def _demo():
    """Evaluate combined engine on the dataset: does it beat model-alone?"""
    HERE = Path(__file__).resolve().parent
    df = pd.read_csv(HERE / "data" / "upi_transactions.csv").sort_values("ts")
    eng = FraudEngine()

    tp = fp = tn = fn = 0
    examples = []
    for _, r in df.iterrows():
        out = eng.score(r.to_dict())
        flagged = out["label"] in ("REVIEW", "BLOCK")
        actual = bool(r["is_fraud"])
        if flagged and actual: tp += 1
        elif flagged and not actual: fp += 1
        elif not flagged and actual: fn += 1
        else: tn += 1
        if actual and flagged and len(examples) < 3:
            examples.append((r, out))

    recall = tp / max(tp + fn, 1)
    precision = tp / max(tp + fp, 1)
    fpr = fp / max(fp + tn, 1)
    print("=== Combined Engine (model + rules + graph) — flag if REVIEW/BLOCK ===")
    print(f"Recall:    {recall:.3f}  (frauds caught)")
    print(f"Precision: {precision:.3f}")
    print(f"FP rate:   {fpr:.3f}")
    print(f"TP={tp} FP={fp} FN={fn} TN={tn}\n")
    for r, out in examples:
        print(f"[{out['label']}] score={out['score']} prob={out['fraud_probability']:.0%} "
              f"comp={out['components']}")
        print(f"  why: {out['reasons']}\n")


if __name__ == "__main__":
    _demo()
