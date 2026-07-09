"""
Efficient combined-engine evaluation (model + rules + graph) on the FULL
time-ordered stream. Batch-computes model probability (fast), streams rules +
graph incrementally. No per-row SHAP (not needed for metrics).
"""
from __future__ import annotations
from pathlib import Path
import joblib, numpy as np, pandas as pd

from ml.rules import score as rule_score
from ml.graph import GraphAnalyzer
from ml.score import combine, decide

HERE = Path(__file__).resolve().parent
df = pd.read_csv(HERE / "data" / "upi_transactions.csv").sort_values("ts").reset_index(drop=True)
pipe = joblib.load(HERE / "models" / "fraud_model.joblib")

DROP = ["ts", "sender_vpa", "receiver_vpa", "fraud_type", "is_fraud"]
X = df.drop(columns=DROP)
model_proba = pipe.predict_proba(X)[:, 1] * 100      # batch, fast

g = GraphAnalyzer()
tp = fp = tn = fn = 0
for i, r in df.iterrows():
    d = r.to_dict()
    rl = rule_score(d)["score"]
    gres = g.score(d["sender_vpa"], d["receiver_vpa"], d["amount"], d["ts"])
    g.add(d["sender_vpa"], d["receiver_vpa"], d["amount"], d["ts"])
    final = combine(model_proba[i], rl, gres["score"], gres["motif"])
    flagged = decide(final) in ("REVIEW", "BLOCK")
    actual = bool(r["is_fraud"])
    if flagged and actual: tp += 1
    elif flagged and not actual: fp += 1
    elif not flagged and actual: fn += 1
    else: tn += 1

recall = tp / max(tp+fn, 1); precision = tp / max(tp+fp, 1); fpr = fp / max(fp+tn, 1)
print("=== COMBINED ENGINE (model + rules + graph) on full stream ===")
print(f"Recall:    {recall:.3f}")
print(f"Precision: {precision:.3f}")
print(f"FP rate:   {fpr:.3f}")
print(f"TP={tp} FP={fp} FN={fn} TN={tn}")
