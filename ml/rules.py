"""
UPI Fraud Shield — Rule Layer
=============================
Fast, transparent rule-based signals with weights grounded in our research
(SIGNALS_MASTER.md / FRAUD_CASES). Catches known patterns instantly and gives
plain-English reasons WITHOUT needing the model — a reliable safety net that
also stays explainable.

Each rule adds points to a 0-100 rule score + a human reason.
This complements (not replaces) the XGBoost model + graph module.
"""

from __future__ import annotations

# weights (from SIGNALS_MASTER research) — tuned, not arbitrary
W = {
    "amount_spike_high": 35,     # amount >= 10x user's normal
    "amount_spike_mid": 20,      # amount >= 5x
    "odd_hour": 15,              # night-time, unusual for user
    "new_device": 25,           # unrecognised device
    "first_time_payee": 15,     # never paid this receiver before
    "velocity": 20,             # burst of transfers
    "fan_in": 20,               # receiver getting money from many senders
    "forwards_recent": 20,      # receiver forwards money quickly (mule)
    "new_receiver": 15,         # receiver account < 7 days old
    "blacklisted": 40,          # receiver on blacklist
    "name_mismatch": 20,        # VPA brand/name mismatch
    "high_drawdown": 15,        # sending > 90% of balance
    "screen_share": 30,         # remote-access / screen-share active (AnyDesk)
    "reverse": 25,              # overpayment / reverse-transfer scam
    "mandate_unknown": 25,      # AutoPay mandate to an unknown payee
    "qr_new": 15,               # QR debit to first-time payee
    "rooted": 30,               # rooted / Xposed / emulator device (Digital Lutera)
    "sim_mismatch": 30,         # SIM-reported number != carrier (SIM-swap / spoof)
    "jumped_deposit": 30,       # tiny credit then collect-request (jumped-deposit scam)
    "velocity_10m": 12,         # medium confidence slower velocity check
    "velocity_24h": 6,          # lower confidence daily volume check
    "fan_in_10m": 12,           # medium confidence slower fan-in
    "fan_in_24h": 6,            # lower confidence daily fan-in
    "fan_out_10m": 12,          # medium confidence slower fan-out
    "fan_out_24h": 6,           # lower confidence daily fan-out
}


def score(f: dict) -> dict:
    """
    f = transaction feature dict (same keys as our dataset columns).
    Returns dict(score 0-100, reasons[list]).
    """
    pts = 0
    reasons = []

    ratio = f.get("amount_to_avg_ratio", 0)
    if ratio >= 10:
        pts += W["amount_spike_high"]
        reasons.append(f"Amount is {ratio:.0f}x the user's usual")
    elif ratio >= 5:
        pts += W["amount_spike_mid"]
        reasons.append(f"Amount is {ratio:.0f}x higher than normal")

    if f.get("odd_hour"):
        pts += W["odd_hour"]
        reasons.append("Unusual night-time transaction")

    if f.get("is_new_device"):
        pts += W["new_device"]
        reasons.append("New / unrecognised device")

    # first-time payee matters mainly for P2P; paying a NEW shop is normal
    if f.get("first_time_payee") and not f.get("receiver_is_merchant"):
        pts += W["first_time_payee"]
        reasons.append("First-time payee")

    # velocity — EXEMPT corporate accounts (payroll/reimbursement is legit fan-out)
    if f.get("sender_velocity_60s", 0) >= 4 and not f.get("sender_is_corporate"):
        pts += W["velocity"]
        reasons.append(f"Velocity spike: {int(f['sender_velocity_60s'])+1} transfers in <60s")

    if f.get("sender_velocity_10m", 0) >= 8 and not f.get("sender_is_corporate"):
        pts += W["velocity_10m"]
        reasons.append(f"High 10m velocity: {int(f['sender_velocity_10m'])} transfers in 10m")

    if f.get("sender_velocity_24h", 0) >= 20 and not f.get("sender_is_corporate"):
        pts += W["velocity_24h"]
        reasons.append(f"High 24h velocity: {int(f['sender_velocity_24h'])} transfers in 24h")

    # fan-out (smurfing) — also exempt corporate
    if f.get("sender_fan_out_60s", 0) >= 8 and not f.get("sender_is_corporate"):
        pts += W["velocity"]
        reasons.append(f"Fan-out to {int(f['sender_fan_out_60s'])} receivers (smurfing)")

    if f.get("sender_fan_out_10m", 0) >= 12 and not f.get("sender_is_corporate"):
        pts += W["fan_out_10m"]
        reasons.append(f"Fan-out to {int(f['sender_fan_out_10m'])} receivers in 10m")

    if f.get("sender_fan_out_24h", 0) >= 30 and not f.get("sender_is_corporate"):
        pts += W["fan_out_24h"]
        reasons.append(f"Fan-out to {int(f['sender_fan_out_24h'])} receivers in 24h")

    # fan-in — EXEMPT verified merchants (shop getting many payments is normal)
    if f.get("receiver_fan_in_60s", 0) >= 5 and not f.get("receiver_is_merchant"):
        pts += W["fan_in"]
        reasons.append(f"Receiver getting money from {int(f['receiver_fan_in_60s'])} senders (fan-in)")

    if f.get("receiver_fan_in_10m", 0) >= 10 and not f.get("receiver_is_merchant"):
        pts += W["fan_in_10m"]
        reasons.append(f"Receiver fan-in: {int(f['receiver_fan_in_10m'])} senders in 10m")

    if f.get("receiver_fan_in_24h", 0) >= 25 and not f.get("receiver_is_merchant"):
        pts += W["fan_in_24h"]
        reasons.append(f"Receiver fan-in: {int(f['receiver_fan_in_24h'])} senders in 24h")

    if f.get("receiver_forwards_recent") and not f.get("receiver_is_merchant"):
        pts += W["forwards_recent"]
        reasons.append("Receiver forwarding money quickly (mule pattern)")

    if f.get("receiver_account_age_days", 999) < 7:
        pts += W["new_receiver"]
        reasons.append(f"Receiver account only {int(f.get('receiver_account_age_days',0))} days old")

    if f.get("receiver_blacklisted"):
        pts += W["blacklisted"]
        reasons.append("Receiver is on the fraud blacklist")

    if f.get("name_vpa_mismatch"):
        pts += W["name_mismatch"]
        reasons.append("Receiver VPA name / brand mismatch")

    if f.get("balance_drawdown", 0) >= 0.9:
        pts += W["high_drawdown"]
        reasons.append("Sending almost the entire balance")

    if f.get("device_screen_share"):
        pts += W["screen_share"]
        reasons.append("Remote-access / screen-share active (AnyDesk-type)")

    if f.get("reverse_transfer"):
        pts += W["reverse"]
        reasons.append("Reverse transfer — no genuine credit received (overpayment scam)")

    if f.get("is_mandate") and f.get("first_time_payee"):
        pts += W["mandate_unknown"]
        reasons.append("AutoPay mandate set up to an unknown payee")

    if f.get("is_qr") and f.get("first_time_payee"):
        pts += W["qr_new"]
        reasons.append("QR debit to a first-time payee (scan = SEND, not receive)")

    if f.get("device_rooted"):
        pts += W["rooted"]
        reasons.append("Rooted / Xposed / emulator device (SIM-binding bypass risk)")

    if f.get("sim_carrier_mismatch"):
        pts += W["sim_mismatch"]
        reasons.append("SIM number doesn't match carrier records (SIM-swap / spoof)")

    # jumped-deposit: tiny credit received, then a collect-request being approved
    if f.get("recent_micro_credit") and f.get("is_collect"):
        pts += W["jumped_deposit"]
        reasons.append("Micro-credit followed by a collect-request (jumped-deposit scam)")

    # Hard signals: real fraud stacks (Stripe Radar, Sift) keep a layer of
    # DETERMINISTIC policy rules that override the ML blend instead of being
    # averaged into it. A blend can bury a known-bad signal (a screen-share scam
    # scored 30 got diluted to ~9 and landed SAFE). These fire regardless of the
    # model, and are surfaced as `hard_action` for combine() to floor on.
    #
    #  block  -> screen-share during a payment. Step-up OTP does NOT help here:
    #           the VICTIM is being coached and will enter the OTP themselves, so
    #           the only real defence is to refuse the payment while sharing is on
    #           (this is what GPay / banking apps actually do).
    #  review -> device-integrity / scam-shaped signals (rooted, SIM-swap,
    #           reverse-transfer, jumped-deposit). Each has a rare legitimate
    #           cause (a power user's rooted phone, a genuine SIM port), so we
    #           step up rather than hard-block; two of them together -> block.
    review_hard = sum(bool(f.get(k)) for k in
                      ("device_rooted", "sim_carrier_mismatch", "reverse_transfer")) \
                  + int(bool(f.get("recent_micro_credit") and f.get("is_collect")))
    if f.get("device_screen_share") or review_hard >= 2:
        hard_action = "block"
    elif review_hard >= 1:
        hard_action = "review"
    else:
        hard_action = None

    return {"score": min(pts, 100), "reasons": reasons, "hard_action": hard_action}


def _demo():
    import pandas as pd
    from pathlib import Path
    HERE = Path(__file__).resolve().parent
    df = pd.read_csv(HERE / "data" / "upi_transactions.csv")

    # rule score distribution on real vs fraud
    df["rule_score"] = df.apply(lambda r: score(r.to_dict())["score"], axis=1)
    print("=== Rule score (avg) ===")
    print(df.groupby("is_fraud")["rule_score"].mean().round(1).to_string())
    print("\n=== Sample flagged fraud (rule reasons) ===")
    hits = df[(df.is_fraud == 1) & (df.rule_score >= 40)].head(3)
    for _, r in hits.iterrows():
        print(f"score={r['rule_score']}: {score(r.to_dict())['reasons']}")


if __name__ == "__main__":
    _demo()
