"""
UPI Fraud Shield — Explainability (SHAP -> reason codes)
========================================================
REAL SHAP (TreeExplainer) on our XGBoost model -> human-readable "why flagged"
reason codes for the demo UI. Not fake (no random values).

Idea reused from R6 RiskEngine (MIT): SHAP + friendly reason codes.
Implemented here on OUR XGBoost + UPI features.

Usage (standalone test):  .venv/bin/python ml/explain.py
Import:  from ml.explain import Explainer
"""

from __future__ import annotations
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap

HERE = Path(__file__).resolve().parent
MODEL_PATH = HERE / "models" / "fraud_model.joblib"

# raw feature -> human friendly phrase (for reason codes)
FRIENDLY = {
    "amount": "transaction amount",
    "amount_to_avg_ratio": "amount vs user's normal",
    "odd_hour": "unusual night-time hour",
    "balance_drawdown": "share of balance being sent",
    "is_new_device": "new / unrecognised device",
    "first_time_payee": "first-time payee",
    "sender_velocity_60s": "rapid transactions (velocity)",
    "receiver_fan_in_60s": "receiver getting money from many senders (fan-in)",
    "receiver_forwards_recent": "receiver forwarding money quickly (mule pattern)",
    "sender_account_age_days": "sender account age",
    "receiver_account_age_days": "receiver account age (new account)",
    "receiver_is_merchant": "receiver merchant status",
    "receiver_kyc_basic": "receiver low KYC level",
    "receiver_blacklisted": "receiver on blacklist",
    "name_vpa_mismatch": "VPA name / brand mismatch",
    "is_collect": "collect-request (pull) transaction",
    "hour": "transaction hour",
    "type": "transaction type",
    "channel": "payment channel",
}


def _clean_name(raw: str) -> str:
    """Turn sklearn transformed names (cat__type_COLLECT / remainder__amount)
    into a base feature key we can look up in FRIENDLY."""
    name = raw.split("__", 1)[-1]          # drop cat__ / remainder__
    # one-hot like "type_COLLECT" -> base "type", value "COLLECT"
    for base in ("type", "channel"):
        if name.startswith(base + "_"):
            val = name[len(base) + 1:]
            return f"{FRIENDLY.get(base, base)} = {val}"
    return FRIENDLY.get(name, name)


class Explainer:
    def __init__(self, model_path: Path = MODEL_PATH):
        self.pipe = joblib.load(model_path)
        self.pre = self.pipe.named_steps["pre"]
        self.model = self.pipe.named_steps["model"]
        self.feat_names = list(self.pre.get_feature_names_out())
        self.tree = shap.TreeExplainer(self.model)

    def explain(self, row: pd.DataFrame, top_k: int = 4):
        """Return (fraud_probability, [reason strings]) for one transaction row."""
        proba = float(self.pipe.predict_proba(row)[:, 1][0])

        X_trans = self.pre.transform(row)
        if hasattr(X_trans, "toarray"):
            X_trans = X_trans.toarray()
        shap_vals = self.tree.shap_values(X_trans)
        # xgboost binary -> array (n,features); take the single row
        vals = np.asarray(shap_vals)[0]

        # top features PUSHING towards fraud (positive shap)
        order = np.argsort(vals)[::-1]
        reasons = []
        for idx in order[:top_k]:
            if vals[idx] <= 0:
                break
            reasons.append(_clean_name(self.feat_names[idx]))
        if not reasons:
            reasons = ["matches normal behaviour"]
        return round(proba, 4), reasons


def _demo():
    import pandas as pd
    df = pd.read_csv(HERE / "data" / "upi_transactions.csv")
    ex = Explainer()
    drop = ["ts", "sender_vpa", "receiver_vpa", "is_fraud"]

    # show a few high-risk (actual fraud) rows
    frauds = df[df["is_fraud"] == 1].head(3)
    print("=== SHAP reason codes on sample fraud transactions ===\n")
    for _, r in frauds.iterrows():
        row = pd.DataFrame([r.drop(labels=drop)])
        proba, reasons = ex.explain(row)
        print(f"amount={r['amount']:.0f}  type={r['type']}  "
              f"new_device={r['is_new_device']}  odd_hour={r['odd_hour']}")
        print(f"  -> fraud probability: {proba:.2%}")
        print(f"  -> why: {', '.join(reasons)}\n")


if __name__ == "__main__":
    _demo()
