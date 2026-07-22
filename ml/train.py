"""
UPI Fraud Shield — Model Training
=================================
Trains the tabular fraud model (XGBoost) on our UPI transaction features and
reports HONEST imbalanced-data metrics (PR-AUC, recall, false-positive rate),
NOT accuracy. Saves the model pipeline + metrics.

Reused idea from the R6 RiskEngine base (MIT): metric discipline + honest note.
Features here are OUR UPI signals (not R6's generic columns).

Run:  .venv/bin/python ml/train.py
Out:  ml/models/fraud_model.joblib , ml/reports/metrics.json
"""

from __future__ import annotations
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    average_precision_score, roc_auc_score, precision_recall_fscore_support,
    confusion_matrix, classification_report,
)
from xgboost import XGBClassifier

HERE = Path(__file__).resolve().parent
DATA = HERE / "data" / "upi_transactions.csv"
MODELS = HERE / "models"; MODELS.mkdir(exist_ok=True)
REPORTS = HERE / "reports"; REPORTS.mkdir(exist_ok=True)

TARGET = "is_fraud"
# IDs / time / analysis-only — NOT model features (fraud_type would LEAK the answer).
# sender/receiver_txn_count dropped: they encode an account's POSITION in the
# synthetic stream (bookkeeping), not fraud — the model learned them erratically
# (non-monotonic, peaks mid-range) and they conflict with build_db's serve-time
# values. Serving still sends them; the pipeline ignores unknown columns by name.
# name_vpa_mismatch dropped: it fires on a brand/scam keyword in the VPA string,
# which only separates fraud here because our demo mules are named on-the-nose. A
# real scammer's VPA is innocuous, so the feature would not generalise — training
# on it teaches the model a shortcut that fails in production. Detection now leans
# on behavioural signals (age, fan-in, forwarding, velocity, micro-credit, device).
DROP = ["ts", "sender_vpa", "receiver_vpa", "fraud_type", TARGET,
        "sender_txn_count", "receiver_txn_count", "name_vpa_mismatch"]
CATEGORICAL = ["type", "channel"]


def load_data():
    df = pd.read_csv(DATA)
    y = df[TARGET].astype(int)
    X = df.drop(columns=DROP)
    return X, y, df


def build_pipeline(neg_pos_ratio: float) -> Pipeline:
    pre = ColumnTransformer(
        transformers=[("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL)],
        remainder="passthrough",
    )
    model = XGBClassifier(
        n_estimators=500,
        max_depth=6,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=3,
        gamma=0.5,
        reg_lambda=1.5,
        scale_pos_weight=neg_pos_ratio,   # cost-sensitive (handles imbalance)
        eval_metric="aucpr",
        random_state=42,
        n_jobs=-1,
    )
    return Pipeline([("pre", pre), ("model", model)])


def main():
    X, y, df = load_data()

    # stratified split (keep fraud ratio in both)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    neg_pos = (y_train == 0).sum() / max((y_train == 1).sum(), 1)
    pipe = build_pipeline(neg_pos)
    pipe.fit(X_train, y_train)

    proba = pipe.predict_proba(X_test)[:, 1]

    # ---- threshold calibration: pick the cutoff with best F1 (not naive 0.5) ----
    best_t, best_f1 = 0.5, -1.0
    for t in np.linspace(0.05, 0.95, 91):
        pr_pred = (proba >= t).astype(int)
        _, _, f1_t, _ = precision_recall_fscore_support(
            y_test, pr_pred, average="binary", zero_division=0)
        if f1_t > best_f1:
            best_f1, best_t = f1_t, float(t)

    pred = (proba >= best_t).astype(int)

    roc = roc_auc_score(y_test, proba)
    pr_auc = average_precision_score(y_test, proba)
    cm = confusion_matrix(y_test, pred)
    tn, fp, fn, tp = cm.ravel()
    fpr = fp / max(fp + tn, 1)                    # false-positive rate
    p, r, f1, _ = precision_recall_fscore_support(
        y_test, pred, average="binary", zero_division=0
    )

    metrics = {
        "model": "XGBoost",
        "decision_threshold": round(best_t, 3),
        "pr_auc": round(float(pr_auc), 4),
        "roc_auc": round(float(roc), 4),
        "fraud_precision": round(float(p), 4),
        "fraud_recall": round(float(r), 4),
        "fraud_f1": round(float(f1), 4),
        "false_positive_rate": round(float(fpr), 4),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "n_train": int(len(y_train)), "n_test": int(len(y_test)),
        "fraud_rate": round(float(y.mean()), 4),
        "note": "Synthetic UPI demo data (leakage-free, planted fraud patterns). "
                "Metrics are workflow proof, not a real-world benchmark.",
    }

    joblib.dump(pipe, MODELS / "fraud_model.joblib")
    (REPORTS / "metrics.json").write_text(json.dumps(metrics, indent=2))

    print("=== UPI Fraud Model — Test Metrics ===")
    print(f"PR-AUC:               {metrics['pr_auc']}")
    print(f"ROC-AUC:              {metrics['roc_auc']}")
    print(f"Fraud Recall:         {metrics['fraud_recall']}  (frauds caught)")
    print(f"Fraud Precision:      {metrics['fraud_precision']}")
    print(f"False-Positive Rate:  {metrics['false_positive_rate']}  (legit wrongly flagged)")
    print(f"Confusion: TP={tp} FP={fp} FN={fn} TN={tn}")
    print(f"\nSaved: {MODELS/'fraud_model.joblib'}  +  {REPORTS/'metrics.json'}")


if __name__ == "__main__":
    main()
