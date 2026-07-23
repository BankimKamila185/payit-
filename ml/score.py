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

# Blend weights: model + rules + graph.
# The model carries the LEAST weight, deliberately. It was trained on synthetic,
# circular data and measured erratic (it scored 95 on a legitimate rent payment).
# An unvalidated model must be ADVISORY — the deterministic, explainable layers
# (rules, graph) drive the decision; the model only nudges. A 216-case eval with
# the model at 0.5 + a solo model>=75 block hard-blocked 38% of legitimate
# payments (every rent, most salary/family transfers).
BLEND = {"model": 0.25, "rules": 0.45, "graph": 0.30}

SAFE_MAX = 35
REVIEW_MAX = 60


def decide(final_score: int) -> str:
    if final_score >= REVIEW_MAX:
        return "BLOCK"
    if final_score >= SAFE_MAX:
        return "REVIEW"
    return "SAFE"


def combine(model_score: float, rule_pts: float, graph_score: float,
            graph_motif: str | None, hard_action: str | None = None,
            receiver_trusted: bool = False, mule_target: bool = False,
            strong_evidence: bool = False) -> int:
    """Blend the 3 detectors into a decision, with policy overrides.

    The hard problem this solves: a mule chain, a collection cash-out, and a
    legitimate salary->rent or friends-chip-in-for-a-gift look almost identical
    as raw patterns. What separates them is WHERE the money lands:
      - mule_target      = a fresh, non-merchant account that then forwards on
                           (the cash-out signature) -> a pattern here is a ring.
      - receiver_trusted = an established / merchant, non-blacklisted payee
                           (rent, fees, a shop) -> a big/unusual amount here is
                           normal life, not fraud, and must not be blocked.

    hard_action ('block'/'review') is a deterministic POLICY override from the
    rule layer (screen-share, rooted, SIM-swap...), applied on top of the blend."""
    final = (BLEND["model"] * model_score + BLEND["rules"] * rule_pts +
             BLEND["graph"] * graph_score)

    # Mule-ring escalation — ONLY when the money is heading to a fresh
    # non-merchant account (mule_target). A chain / gather-scatter into an
    # established or merchant payee is legitimate flow (salary->rent,
    # chanda->shop, reseller->wholesaler) and must not be escalated.
    #
    # Two tiers, because the shape alone is NOT proof. "Dad tops up my new
    # account, I forward it to a friend who also just joined" is structurally
    # identical to a layering hop — same path, same timing, same amount. Blocking
    # on the pattern alone therefore blocks real families. So:
    #   - pattern + INDEPENDENT evidence (a real rule stack: velocity, fan-in,
    #     device compromise, low KYC...) -> BLOCK
    #   - pattern ALONE                  -> REVIEW, i.e. step up with an OTP. A
    #     genuine payer clears it; a ring still gets friction, an alert trail, and
    #     is picked up again by the post-payment monitor.
    if (graph_motif in ("CHAIN", "CYCLE", "GATHER_SCATTER") and graph_score >= 60
            and mule_target):
        # BLOCK needs a NAMED fraud signal, not a points total. A threshold on
        # rule_pts looked strict but was met by ordinary life: a new phone (25) plus
        # a 2am transfer (15) pushed an honest "dad tops me up, I pay a friend" chain
        # straight to BLOCK — and, once chains started filing the upstream leg, that
        # also filed dad's genuine payment for reversal. New device and odd hour are
        # context, not evidence. See strong_evidence in score() for what counts.
        if strong_evidence:
            final = max(final, REVIEW_MAX)   # corroborated mule ring -> BLOCK
        elif rule_pts >= 15:
            final = max(final, SAFE_MAX)     # pattern alone -> REVIEW (step-up)

    # COLLECTION MULE — many distinct people suddenly paying one fresh, non-merchant
    # account. The graph raises FAN_IN for it, but that motif only scores ~23-40, so
    # the blend buried it: seven victims paying the same 2-day-old account inside 35
    # seconds still came out SAFE, and the only thing that ever caught it was the
    # post-payment monitor — i.e. after every one of them had already paid. A shop
    # legitimately has fan-in, which is why this needs mule_target (fresh + not a
    # merchant); with that, it is the single clearest mule shape there is.
    if graph_motif == "FAN_IN" and mule_target:
        final = max(final, REVIEW_MAX if strong_evidence else SAFE_MAX)

    # Deterministic rule floors (rules are trustworthy; the model is not).
    # The top floor only BLOCKS with named evidence: five soft signals stack to 85
    # on their own (first-time 15 + new receiver 15 + new sender 15 + new device 25
    # + odd hour 15) and that is a description of a student on a new phone at 2am,
    # not of a fraud. Without evidence the same stack still escalates — to REVIEW.
    if rule_pts >= 80:
        final = max(final, 70 if strong_evidence else 50)
    elif rule_pts >= 55:
        final = max(final, 50)           # hard rule stack -> REVIEW
    # The model gets NO solo block floor — it is advisory only (see BLEND note).

    # POLICY OVERRIDE — a hard rule must not be dilutable by a low blend.
    if hard_action == "block":
        final = max(final, REVIEW_MAX)   # -> BLOCK
    elif hard_action == "review":
        final = max(final, SAFE_MAX)     # -> REVIEW

    # RECEIVER TRUST — money to an established / merchant, non-blacklisted payee
    # is a legitimate destination. Amount / velocity / drawdown soft signals must
    # not block it (that is what blocked 38% of legit rent/salary payments). This
    # caps ONLY the soft blend; it never overrides a hard_action (device
    # compromise is sender-side) or a mule-ring escalation (mutually exclusive
    # with trust anyway — a trusted receiver is not a mule_target).
    if receiver_trusted and hard_action is None:
        final = min(final, SAFE_MAX - 1)  # stays SAFE on soft signals alone

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

        # Where is the money landing? This is the discriminator between a mule
        # ring and legitimate money flow that looks identical as a raw pattern.
        r_age = txn.get("receiver_account_age_days", 400)
        r_merchant = bool(txn.get("receiver_is_merchant"))
        r_blacklisted = bool(txn.get("receiver_blacklisted"))
        r_txns = int(txn.get("receiver_txn_count", 0) or 0)
        mule_target = (r_age < 10 and not r_merchant)          # fresh cash-out account
        # Trust needs AGE **and** a real usage history. An old account with almost
        # no activity is not a safe destination — a dormant account that suddenly
        # starts receiving is itself a classic mule signature, so it must not get
        # the trust cap just for having existed a long time.
        receiver_trusted = (not r_blacklisted) and (
            r_merchant or (r_age > 180 and r_txns >= 5))

        # What may turn a mule-SHAPE into a BLOCK. Each of these is something an
        # ordinary payer does not have; none of them is "you bought a new phone" or
        # "you paid at 2am", which is what a plain points threshold kept accepting.
        strong_evidence = bool(
            r_blacklisted                                   # known bad destination
            or txn.get("device_screen_share")               # remote-access scam in progress
            or txn.get("device_rooted")                     # compromised device
            or txn.get("sim_carrier_mismatch")              # SIM swap
            or txn.get("recent_micro_credit")               # jumped-deposit setup
            or int(txn.get("receiver_fan_in_60s", 0) or 0) >= 5    # many victims, one account
            or int(txn.get("sender_fan_out_60s", 0) or 0) >= 8     # smurfing out
            or int(txn.get("sender_velocity_60s", 0) or 0) >= 4    # burst
        )

        # ---- combine (blend + mule-ring + hard-rule + receiver-trust) ----
        final = combine(model_score, rl["score"], gr["score"], gr["motif"],
                        rl.get("hard_action"), receiver_trusted, mule_target,
                        strong_evidence)
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
