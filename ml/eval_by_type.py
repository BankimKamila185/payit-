"""
Per-fraud-type detection breakdown — does the engine ACTUALLY catch each
fraud typology, or just win on the overall number? Shows recall per type
(flagged = REVIEW or BLOCK) so we can see exactly what is caught vs missed.
"""
from __future__ import annotations
from pathlib import Path
import joblib, pandas as pd
from collections import defaultdict

from ml.rules import score as rule_score
from ml.graph import GraphAnalyzer
from ml.score import combine, decide

HERE = Path(__file__).resolve().parent
df = pd.read_csv(HERE / "data" / "upi_transactions.csv").sort_values("ts").reset_index(drop=True)
pipe = joblib.load(HERE / "models" / "fraud_model.joblib")

DROP = ["ts", "sender_vpa", "receiver_vpa", "fraud_type", "is_fraud"]
model_proba = pipe.predict_proba(df.drop(columns=DROP))[:, 1] * 100

g = GraphAnalyzer()
caught = defaultdict(int); total = defaultdict(int)
legit_flagged = legit_total = 0

for i, r in df.iterrows():
    d = r.to_dict()
    rl = rule_score(d)["score"]
    gres = g.score(d["sender_vpa"], d["receiver_vpa"], d["amount"], d["ts"])
    g.add(d["sender_vpa"], d["receiver_vpa"], d["amount"], d["ts"])
    flagged = decide(combine(model_proba[i], rl, gres["score"], gres["motif"])) in ("REVIEW", "BLOCK")
    ft = d["fraud_type"]
    if r["is_fraud"] == 1:
        total[ft] += 1
        if flagged: caught[ft] += 1
    else:
        legit_total += 1
        if flagged: legit_flagged += 1

print("=== Per-fraud-type detection (recall = % flagged) ===\n")
print(f"{'fraud type':<26}{'caught/total':>14}{'recall':>9}")
print("-" * 50)
rows = sorted(total.keys(), key=lambda k: caught[k]/max(total[k],1))
for ft in rows:
    rec = caught[ft] / max(total[ft], 1)
    bar = "█" * int(rec * 20)
    print(f"{ft:<26}{f'{caught[ft]}/{total[ft]}':>14}{rec:>8.0%}  {bar}")
print("-" * 50)
tot_f = sum(total.values()); tot_c = sum(caught.values())
print(f"{'OVERALL fraud recall':<26}{f'{tot_c}/{tot_f}':>14}{tot_c/max(tot_f,1):>8.0%}")
print(f"{'legit false-positive rate':<26}{f'{legit_flagged}/{legit_total}':>14}{legit_flagged/max(legit_total,1):>8.1%}")
