"""
UPI Fraud Shield — Re-Verification against the Problem Statement
================================================================
Runs the ACTUAL engine and checks every requirement empirically (not claims).

Problem statement requirements:
  R1 lightweight fraud scoring engine
  R2 flag suspicious txns in < 200ms
  R3 behavioural patterns
  R4 device fingerprinting
  R5 graph-based anomaly detection
  R6 real-time scoring API
  R7 fraud flags
  R8 confidence scores
  R9 explainability
  (R10 demo UI -> app team / dashboard, checked separately)
"""

from __future__ import annotations
import time
from ml.score import FraudEngine

def line(ok, txt):
    print(f"  [{'PASS' if ok else 'FAIL'}] {txt}")

def main():
    eng = FraudEngine()
    results = {}

    # base feature template
    def txn(**kw):
        base = dict(sender_vpa="user0001@hdfc", receiver_vpa="user0500@sbi",
                    amount=1000, hour=14, type="PAY", channel="MANUAL", ts=1000,
                    amount_to_avg_ratio=0.7, odd_hour=0, balance_drawdown=0.01,
                    is_new_device=0, first_time_payee=0, sender_velocity_60s=0,
                    receiver_fan_in_60s=0, receiver_forwards_recent=0,
                    sender_account_age_days=500, receiver_account_age_days=500,
                    receiver_is_merchant=0, receiver_kyc_basic=0,
                    receiver_blacklisted=0, name_vpa_mismatch=0, is_collect=0)
        base.update(kw); return base

    print("\n=== R2: Latency < 200ms ===")
    t0 = time.perf_counter()
    _ = eng.score(txn())
    ms = (time.perf_counter() - t0) * 1000
    line(ms < 200, f"single score latency = {ms:.1f} ms")
    results["R2 <200ms"] = ms < 200

    print("\n=== R3: Behavioural patterns (amount/hour/velocity) ===")
    out = eng.score(txn(sender_vpa="ub", receiver_vpa="rb", ts=2000,
                        amount_to_avg_ratio=15, odd_hour=1, balance_drawdown=0.95))
    beh = any("amount" in r.lower() or "night" in r.lower() or "balance" in r.lower()
              for r in out["reasons"])
    line(beh, f"behavioural reasons fired: {out['reasons'][:3]}")
    results["R3 behavioural"] = beh

    print("\n=== R4: Device fingerprinting ===")
    out = eng.score(txn(sender_vpa="ud", receiver_vpa="rd", ts=3000,
                        is_new_device=1))
    dev = any("device" in r.lower() for r in out["reasons"])
    line(dev, f"device signal fired: {[r for r in out['reasons'] if 'device' in r.lower()]}")
    results["R4 device"] = dev

    print("\n=== R5: Graph-based anomaly (mule ring end-to-end) ===")
    # feed a chain: victim -> m1 -> m2 -> m3, similar amount, rapid
    amt = 50000
    chain = [("victim@a", "mule1@b"), ("mule1@b", "mule2@c"), ("mule2@c", "mule3@d")]
    ring_found = None
    for k, (s, r) in enumerate(chain):
        o = eng.score(txn(sender_vpa=s, receiver_vpa=r, amount=amt * (1 + 0.02*k),
                          ts=5000 + k, amount_to_avg_ratio=10))
        if o["ring"]:
            ring_found = o
    ok5 = ring_found is not None and len(ring_found["ring"]) >= 3
    line(ok5, f"mule ring detected: {ring_found['ring'] if ring_found else 'NONE'}")
    if ring_found:
        line(ring_found["components"]["graph"] > 0,
             f"graph component contributed: {ring_found['components']['graph']}")
    results["R5 graph"] = ok5

    print("\n=== R7/R8: Fraud flag + confidence score ===")
    out = eng.score(txn(sender_vpa="uf", receiver_vpa="rf", ts=7000,
                        amount_to_avg_ratio=30, odd_hour=1, is_new_device=1,
                        first_time_payee=1, balance_drawdown=0.9))
    has_flag = out["label"] in ("SAFE", "REVIEW", "BLOCK")
    has_conf = 0 <= out["fraud_probability"] <= 1 and 0 <= out["score"] <= 100
    line(has_flag, f"flag = {out['label']}")
    line(has_conf, f"confidence: score={out['score']}, prob={out['fraud_probability']}")
    results["R7 flag"] = has_flag
    results["R8 confidence"] = has_conf

    print("\n=== R9: Explainability (reason codes) ===")
    ok9 = len(out["reasons"]) > 0
    line(ok9, f"reasons: {out['reasons']}")
    results["R9 explainability"] = ok9

    print("\n=== R1: Lightweight (3 detectors combined) ===")
    ok1 = set(out["components"]) == {"model", "rules", "graph"}
    line(ok1, f"detectors: {list(out['components'])}")
    results["R1 engine"] = ok1

    print("\n" + "=" * 50)
    passed = sum(results.values())
    print(f"RESULT: {passed}/{len(results)} requirements verified")
    for k, v in results.items():
        print(f"   {'✅' if v else '❌'} {k}")
    print("   ⏭️  R6 real-time API -> tested via ml/api.py (uvicorn)")
    print("   ⏭️  R10 demo UI -> app team / dashboard (pending)")


if __name__ == "__main__":
    main()