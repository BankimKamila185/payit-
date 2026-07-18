"""
UPI Fraud Shield — Professional-Grade Synthetic Data Generator
==============================================================
Agent-based (MABS-style, like PaySim/IBM AMLSim) UPI transaction generator with
account-level graph edges, planted AML typologies, hard negatives, realistic
imbalance, and perfect ground-truth labels. Leakage-free.

Grounded in research (RULES_AND_TRADEOFFS.md):
  - Realistic imbalance (~1-2% fraud; pro datasets 0.1-0.5%, we lean demo-usable)
  - 8-style AML motifs: mule CHAIN, CYCLE, FAN-IN, FAN-OUT/SCATTER, plus
    account-takeover, SIM-swap, velocity, collect-scam, digital-arrest/investment
  - HARD NEGATIVES: legit patterns that RESEMBLE fraud (bill-pooling=legit fan-in,
    payroll=legit fan-out, father->son->hostel=legit pass-through, big legit buy,
    genuine new device, night-owl) -> teaches the model fan-in != fraud
  - Graph feature columns (fan-in, fan-out) for the model (IBM: +F1)

Output: ml/data/upi_transactions.csv , ml/data/accounts.csv
"""

import numpy as np
import pandas as pd
from pathlib import Path

SEED = 42
rng = np.random.default_rng(SEED)

OUT_DIR = Path(__file__).resolve().parent / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

BANKS = ["HDFC", "SBI", "AXIS", "ICICI", "PAYTM", "YBL"]
KYC_LEVELS = ["BASIC", "VIDEO", "CORPORATE"]

# --- scale (professional volume + realistic imbalance) ---
N_USERS = 5000
N_MERCHANTS = 600
N_NORMAL_TX = 250000
FRAUD_TARGET = 0.015          # ~1.5% fraud (pro-leaning; pure AML ~0.13%)
LABEL_NOISE = 0.01            # 1% imperfect labels (real-world)


# --------------------------------------------------------------- accounts
def make_accounts():
    accounts = {}
    for i in range(N_USERS):
        vpa = f"user{i:04d}@{rng.choice(BANKS).lower()}"
        avg_amount = float(rng.choice([500, 1000, 2000, 5000, 12000],
                                      p=[.30, .30, .25, .10, .05]))
        start_h = int(rng.integers(6, 11)); end_h = int(rng.integers(20, 24))
        # ~15% are FRESH accounts (age < 25 days) — real mules are usually new,
        # but plenty of genuine new users exist too (so it's a signal, not proof)
        age = int(rng.integers(1, 25)) if rng.random() < 0.15 else int(rng.integers(60, 2000))
        accounts[vpa] = {
            "vpa": vpa, "name": f"User {i}", "bank": rng.choice(BANKS),
            "is_merchant": 0, "mcc": 0,
            "account_age_days": age,
            "kyc_level": rng.choice(KYC_LEVELS, p=[.5, .4, .1]),
            "avg_amount": avg_amount,
            "usual_hours": set(range(start_h, end_h)),
            "home_device": f"dev_{i:04d}",
            "balance": float(rng.integers(5000, 200000)),
            "is_corporate": 0,
            # ~3% previously reported/blacklisted (known mules / scam accounts)
            "blacklisted": int(rng.random() < 0.03),
        }
    # brand-spoof accounts: VPA looks official but it's a personal (P2P) account
    SPOOF_BRANDS = ["sbi.support", "hdfc.refund", "amazon.help", "bigbazaar",
                    "flipkart.care", "irctc.refund", "kyc.update", "electricity.bill"]
    for k, b in enumerate(SPOOF_BRANDS):
        vpa = f"{b}{k}@{rng.choice(BANKS).lower()}"
        accounts[vpa] = {
            "vpa": vpa, "name": f"Personal {k}", "bank": rng.choice(BANKS),
            "is_merchant": 0, "mcc": 0,
            "account_age_days": int(rng.integers(1, 40)),
            "kyc_level": "BASIC", "avg_amount": 1000.0,
            "usual_hours": set(range(6, 22)),
            "home_device": f"spf_{k}", "balance": 100000.0,
            "is_corporate": 0, "is_spoof": 1,
            "blacklisted": int(rng.random() < 0.4),
        }

    for j in range(N_MERCHANTS):
        vpa = f"shop{j:03d}@{rng.choice(BANKS).lower()}"
        accounts[vpa] = {
            "vpa": vpa, "name": f"Merchant {j}", "bank": rng.choice(BANKS),
            "is_merchant": 1,
            "mcc": int(rng.choice([8062, 5411, 5944, 5814, 5912, 4121])),
            "account_age_days": int(rng.integers(180, 3000)),
            "kyc_level": "CORPORATE",
            "avg_amount": float(rng.choice([200, 500, 1500, 50000])),
            "usual_hours": set(range(0, 24)),
            "home_device": f"mdev_{j:03d}",
            "balance": float(rng.integers(50000, 5000000)),
            "is_corporate": int(rng.random() < 0.3), "blacklisted": 0,
        }
    return accounts


def row(s, r, amount, hour, ts, ttype, channel, device, label,
        reverse=0, screen_share=0, rooted=0, sim_mismatch=0):
    return {"ts": ts, "sender_vpa": s["vpa"], "receiver_vpa": r["vpa"],
            "amount": round(float(max(1, amount)), 2), "hour": int(hour),
            "type": ttype, "channel": channel, "device_id": device,
            "reverse": reverse, "screen_share": screen_share,
            "rooted": rooted, "sim_mismatch": sim_mismatch,
            "_sender": s["vpa"], "_receiver": r["vpa"], "is_fraud": label}


def pick(accounts, pool, exclude=None):
    v = rng.choice(pool)
    while exclude and v == exclude:
        v = rng.choice(pool)
    return accounts[v]


YOUNG = []          # fresh accounts (age < 25) — mules usually recruited here
SPOOF = []          # brand-spoof personal accounts (sbi.support@ybl etc.)
BLACK = []          # previously-reported / blacklisted accounts


def pick_mule(accounts, exclude=None):
    """Pick a fraud mule/receiver — biased toward FRESH accounts (realistic)."""
    pool = YOUNG if (YOUNG and rng.random() < 0.8) else list(accounts.keys())
    v = rng.choice(pool)
    while (exclude and v == exclude) or accounts[v]["is_merchant"] or accounts[v].get("is_spoof"):
        v = rng.choice(pool if pool else list(accounts.keys()))
    return accounts[v]


def pick_spoof(accounts):
    """Pick a brand-spoof receiver (VPA looks official, account is personal)."""
    return accounts[rng.choice(SPOOF)] if SPOOF else pick_mule(accounts)


# ------------------------------------------------------------- NORMAL + hard negs
def normal_txn(accounts, users, merchants, ts):
    s = accounts[rng.choice(users)]
    ttype = "PAY"
    if rng.random() < 0.6:
        r = accounts[rng.choice(merchants)]
        channel = rng.choice(["QR", "INTENT", "MANUAL"])
        roll_t = rng.random()
        if roll_t < 0.15:
            ttype = "COLLECT"                       # legit P2M collect
        elif roll_t < 0.22:
            ttype = "MANDATE"                       # legit subscription/autopay
    else:
        r = pick(accounts, users, s["vpa"]); channel = rng.choice(["CONTACT", "MANUAL"])
    amount = max(1, rng.normal(s["avg_amount"], s["avg_amount"] * 0.4))
    hour = int(rng.choice(sorted(s["usual_hours"])))
    device = s["home_device"]
    # hard negatives: legit-but-risky-looking (label stays 0)
    roll = rng.random()
    if roll < 0.06:   amount *= rng.uniform(3, 12)          # genuine big buy
    elif roll < 0.10: device = f"new_{rng.integers(0,9999):04d}"  # new phone
    elif roll < 0.13: hour = int(rng.integers(0, 5))        # night owl
    return [row(s, r, amount, hour, ts, ttype, channel, device, 0)]


def legit_bill_pooling(accounts, users, merchants, ts):
    """HARD NEG: many friends -> one person (looks like fan-in mule, but legit;
    receiver does NOT forward)."""
    host = accounts[rng.choice(users)]
    rows = []
    n = int(rng.integers(5, 12))
    for k in range(n):
        s = pick(accounts, users, host["vpa"])
        amt = rng.uniform(2000, 6000)
        rows.append(row(s, host, amt, int(rng.choice(sorted(s["usual_hours"]))),
                        ts + k, "PAY", "CONTACT", s["home_device"], 0))
    return rows


def legit_payroll(accounts, users, merchants, ts):
    """HARD NEG: corporate account -> many staff (looks like fan-out, but legit)."""
    corp = accounts[rng.choice(merchants)]
    rows = []
    n = int(rng.integers(8, 20))
    for k in range(n):
        r = accounts[rng.choice(users)]
        rows.append(row(corp, r, rng.uniform(15000, 40000), 17, ts + k,
                        "PAY", "MANUAL", corp["home_device"], 0))
    return rows


def legit_passthrough(accounts, users, merchants, ts):
    """HARD NEG: father->son->hostel (legit chain, established accounts)."""
    a = accounts[rng.choice(users)]; b = pick(accounts, users, a["vpa"])
    c = accounts[rng.choice(merchants)]
    amt = rng.uniform(15000, 25000)
    return [row(a, b, amt, 11, ts, "PAY", "CONTACT", a["home_device"], 0),
            row(b, c, amt, 11, ts + 90, "PAY", "MANUAL", b["home_device"], 0)]


# ----------------------------------------------------------- FRAUD planters
def f_account_takeover(accounts, users, ts):
    s = accounts[rng.choice(users)]; r = pick_mule(accounts, s["vpa"])
    amt = s["avg_amount"] * rng.uniform(3, 25)
    hour = int(rng.integers(1, 5)) if rng.random() < 0.7 else int(rng.choice(sorted(s["usual_hours"])))
    dev = f"atk_{rng.integers(0,9999):04d}" if rng.random() < 0.75 else s["home_device"]
    return [row(s, r, amt, hour, ts, "PAY", "MANUAL", dev, 1)]


def f_sim_swap(accounts, users, ts):
    s = accounts[rng.choice(users)]; r = pick_mule(accounts, s["vpa"])
    amt = s["avg_amount"] * rng.uniform(5, 20)
    return [row(s, r, amt, int(rng.integers(0, 6)), ts, "PAY", "MANUAL",
                f"sim_{rng.integers(0,9999):04d}", 1)]


def f_mule_chain(accounts, users, ts):
    victim = accounts[rng.choice(users)]
    mules = [pick_mule(accounts) for _ in range(3)]
    chain = [victim] + mules
    amount = victim["avg_amount"] * rng.uniform(10, 20)
    rows = []
    for k in range(3):
        amt = amount * rng.uniform(0.95, 1.0)
        dev = chain[k]["home_device"] if k == 0 else f"mule_{rng.integers(0,999):03d}"
        rows.append(row(chain[k], chain[k+1], amt, int(rng.integers(1, 6)),
                        ts + k*2, "PAY", "MANUAL", dev, 1))
    return rows


def f_cycle(accounts, users, ts):
    """A->B->C->A temporal cycle (funds return to origin)."""
    a = accounts[rng.choice(users)]; b = pick_mule(accounts); c = pick_mule(accounts)
    amt = a["avg_amount"] * rng.uniform(8, 15)
    hops = [(a, b), (b, c), (c, a)]
    return [row(x, y, amt * rng.uniform(0.95, 1.0), int(rng.integers(1, 6)),
                ts + k*2, "PAY", "MANUAL", f"cyc_{rng.integers(0,999):03d}", 1)
            for k, (x, y) in enumerate(hops)]


def f_fan_in_collection(accounts, users, ts):
    """Many victims -> one mule (fan-in hub), which then forwards (cash-out)."""
    mule = pick_mule(accounts)
    rows = []
    n = int(rng.integers(6, 12))
    total = 0
    for k in range(n):
        s = pick(accounts, users, mule["vpa"])
        amt = rng.uniform(5000, 20000); total += amt
        rows.append(row(s, mule, amt, int(rng.integers(0, 6)), ts + k,
                        "PAY", "MANUAL", s["home_device"], 1))
    out = pick_mule(accounts, mule["vpa"])          # cash-out mule
    rows.append(row(mule, out, total * 0.9, int(rng.integers(0, 6)), ts + n,
                    "PAY", "MANUAL", f"mule_{rng.integers(0,999):03d}", 1))
    return rows


def f_smurfing(accounts, users, ts):
    """One account -> many small transfers to fresh mules (fan-out/structuring)."""
    s = accounts[rng.choice(users)]
    rows = []
    n = int(rng.integers(8, 16))
    for k in range(n):
        r = pick_mule(accounts, s["vpa"])
        rows.append(row(s, r, rng.uniform(2000, 9000), int(rng.integers(0, 6)),
                        ts + k, "PAY", "MANUAL", f"bot_{rng.integers(0,99):02d}", 1))
    return rows


def f_collect_scam(accounts, users, ts):
    victim = accounts[rng.choice(users)]; scammer = pick_mule(accounts, victim["vpa"])
    return [row(victim, scammer, rng.uniform(5000, 40000),
                int(rng.choice(sorted(victim["usual_hours"]))), ts, "COLLECT",
                "MANUAL", victim["home_device"], 1)]


def f_app_scam(accounts, users, ts):
    """Authorized Push Payment: digital-arrest / investment — victim's OWN device,
    normal-ish hour, big amount to a FRESH mule receiver (hard but receiver-side
    catchable)."""
    victim = accounts[rng.choice(users)]; scammer = pick_mule(accounts, victim["vpa"])
    amt = victim["avg_amount"] * rng.uniform(6, 20)
    return [row(victim, scammer, amt, int(rng.choice(sorted(victim["usual_hours"]))),
                ts, "PAY", rng.choice(["MANUAL", "QR"]), victim["home_device"], 1)]


def f_dormant(accounts, users, ts):
    """Dormant account reactivates with big transfer + forward."""
    s = accounts[rng.choice(users)]; r = pick_mule(accounts, s["vpa"])
    amt = s["avg_amount"] * rng.uniform(15, 30)
    return [row(s, r, amt, int(rng.integers(1, 6)), ts, "PAY", "MANUAL",
                f"dor_{rng.integers(0,999):03d}", 1)]


# ---- social-engineering family (victim's own device; varies by receiver/channel) ----
def _se(accounts, users, ts, receiver, channel="MANUAL", amt=(3000, 40000),
        ttype="PAY", rev=0, ss=0):
    v = accounts[rng.choice(users)]
    hour = int(rng.choice(sorted(v["usual_hours"])))
    return [row(v, receiver, rng.uniform(*amt), hour, ts, ttype, channel,
                v["home_device"], 1, reverse=rev, screen_share=ss)]

def f_qr_scam(a, u, ts):            return _se(a, u, ts, pick_mule(a), channel="QR", amt=(2000, 25000))
def f_customer_care_spoof(a, u, ts): return _se(a, u, ts, pick_spoof(a), amt=(3000, 30000))
def f_fake_ecommerce(a, u, ts):     return _se(a, u, ts, pick_spoof(a), channel="INTENT", amt=(2000, 15000))
def f_lottery_advance_fee(a, u, ts): return _se(a, u, ts, pick_mule(a), amt=(5000, 40000))
def f_charity_scam(a, u, ts):       return _se(a, u, ts, pick_mule(a), amt=(1000, 10000))
def f_utility_bill_scam(a, u, ts):  return _se(a, u, ts, pick_spoof(a), amt=(500, 3000))
def f_rental_token_scam(a, u, ts):  return _se(a, u, ts, pick_mule(a), amt=(5000, 20000))
def f_refund_cashback_scam(a, u, ts): return _se(a, u, ts, pick_spoof(a), amt=(1000, 8000))
def f_mandate_abuse(a, u, ts):      return _se(a, u, ts, pick_mule(a), ttype="MANDATE", amt=(3000, 20000))
def f_overpayment_scam(a, u, ts):   return _se(a, u, ts, pick_mule(a), rev=1, amt=(5000, 45000))
def f_anydesk_scam(a, u, ts):       return _se(a, u, ts, pick_mule(a), amt=(10000, 80000), ss=1)

def f_loan_app_extortion(a, u, ts):
    """Victim coerced into repeated payments to a KNOWN/blacklisted account."""
    r = a[rng.choice(BLACK)] if BLACK else pick_mule(a)
    rows = []
    for k in range(int(rng.integers(2, 5))):
        rows.append(_se(a, u, ts + k, r, amt=(1000, 6000))[0])
    return rows

def f_malware_drain(a, u, ts):
    """Malware/APK: victim's device but background rapid transfers (screen_share)."""
    s = a[rng.choice(u)]
    return [row(s, pick_mule(a, s["vpa"]), rng.uniform(2000, 9000),
                int(rng.integers(0, 5)), ts + k, "PAY", "MANUAL",
                s["home_device"], 1, screen_share=1) for k in range(int(rng.integers(3, 6)))]

def f_max_limit_drain(a, u, ts):
    """New device -> immediate near-max transfer."""
    s = a[rng.choice(u)]
    return [row(s, pick_mule(a, s["vpa"]), s["avg_amount"] * rng.uniform(15, 40),
                int(rng.integers(0, 6)), ts, "PAY", "MANUAL",
                f"max_{rng.integers(0,999):03d}", 1)]

def f_account_testing(a, u, ts):
    """Tiny probe (Rs 1-10) then large drain to same mule."""
    s = a[rng.choice(u)]; mule = pick_mule(a, s["vpa"])
    dev = f"tst_{rng.integers(0,999):03d}"
    return [row(s, mule, rng.uniform(1, 10), int(rng.integers(0, 6)), ts, "PAY", "MANUAL", dev, 1),
            row(s, mule, s["avg_amount"] * rng.uniform(10, 25), int(rng.integers(0, 6)), ts + 3, "PAY", "MANUAL", dev, 1)]


def f_jumped_deposit(accounts, users, ts):
    """NEW (2025): scammer seeds a tiny credit (Rs 10-50), then victim approves a
    large COLLECT thinking it's a return/balance-check. APP fraud."""
    victim = accounts[rng.choice(users)]; scammer = pick_mule(accounts, victim["vpa"])
    rows = [row(scammer, victim, rng.uniform(10, 50),                    # micro-credit seed
                int(rng.choice(sorted(victim["usual_hours"]))), ts, "PAY", "MANUAL",
                scammer["home_device"], 0)]                              # the seed itself is legit-looking
    rows.append(row(victim, scammer, rng.uniform(8000, 45000),          # large collect approved
                    int(rng.choice(sorted(victim["usual_hours"]))), ts + 3, "COLLECT",
                    "MANUAL", victim["home_device"], 1))
    return rows


def f_rooted_takeover(accounts, users, ts):
    """NEW (Digital Lutera 2026): rooted/Xposed device + SIM-number spoof defeats
    SIM-binding -> remote takeover + drain. UNAUTH technical."""
    s = accounts[rng.choice(users)]; r = pick_mule(accounts, s["vpa"])
    amt = s["avg_amount"] * rng.uniform(8, 25)
    return [row(s, r, amt, int(rng.integers(0, 6)), ts, "PAY", "MANUAL",
                f"root_{rng.integers(0,999):03d}", 1, rooted=1, sim_mismatch=1)]


def f_beneficiary_drain(accounts, users, ts):
    """SIM-swap / ATO variant: add a fresh payee then immediately drain (rapid
    payee-add-then-drain). UNAUTH."""
    s = accounts[rng.choice(users)]; r = pick_mule(accounts, s["vpa"])
    amt = s["avg_amount"] * rng.uniform(10, 30)
    return [row(s, r, amt, int(rng.integers(0, 6)), ts, "PAY", "MANUAL",
                f"swap_{rng.integers(0,999):03d}", 1, sim_mismatch=1)]


FRAUD_PLANTERS = [
    # account compromise
    f_account_takeover, f_sim_swap, f_max_limit_drain, f_account_testing,
    f_malware_drain, f_anydesk_scam, f_rooted_takeover, f_beneficiary_drain,
    # money laundering / graph
    f_mule_chain, f_cycle, f_fan_in_collection, f_smurfing, f_dormant,
    # social engineering (authorized push payment)
    f_collect_scam, f_qr_scam, f_customer_care_spoof, f_fake_ecommerce,
    f_lottery_advance_fee, f_charity_scam, f_utility_bill_scam,
    f_rental_token_scam, f_refund_cashback_scam, f_mandate_abuse,
    f_overpayment_scam, f_app_scam, f_loan_app_extortion, f_jumped_deposit,
]
LEGIT_PATTERNS = [legit_bill_pooling, legit_payroll, legit_passthrough]


# ----------------------------------------------------------------- build
def build_events(accounts):
    global YOUNG, SPOOF, BLACK
    users = [v for v, a in accounts.items()
             if not a["is_merchant"] and not a.get("is_spoof")]
    merchants = [v for v, a in accounts.items() if a["is_merchant"]]
    SPOOF = [v for v, a in accounts.items() if a.get("is_spoof")]
    YOUNG = [v for v in users if accounts[v]["account_age_days"] < 25]
    BLACK = [v for v, a in accounts.items() if a.get("blacklisted") and not a["is_merchant"]]
    events, ts = [], 0

    def tag(rows, label):
        for rr in rows:
            rr["fraud_type"] = label
        return rows

    for _ in range(N_NORMAL_TX):
        ts += int(rng.integers(1, 20))
        events.extend(tag(normal_txn(accounts, users, merchants, ts), "legit"))
        if rng.random() < 0.002:                    # sprinkle hard-negative patterns
            ts += 5
            lp = rng.choice(LEGIT_PATTERNS)
            events.extend(tag(lp(accounts, users, merchants, ts), "legit"))
        # Interleave fraud INTO the timeline, not appended after it. The old code
        # generated ALL normal traffic first, THEN all fraud on the same rising ts
        # counter — so fraud occupied a disjoint, later time range. A time-based
        # split then put 100% of fraud in the test half and PR-AUC collapsed to
        # ~0.05 (the model only "worked" because a random split reshuffled the
        # fraud block into both halves). Sprinkling fraud here makes fraud share
        # the full time range, so an honest time-ordered split is meaningful.
        if rng.random() < FRAUD_TARGET:
            ts += int(rng.integers(1, 10))
            planter = rng.choice(FRAUD_PLANTERS)
            events.extend(tag(planter(accounts, users, ts), planter.__name__.replace("f_", "")))

    events.sort(key=lambda e: e["ts"])
    return events


def compute_features(events, accounts):
    from collections import defaultdict, deque
    sends = defaultdict(list); payees = defaultdict(set); devices = defaultdict(set)
    recv_in = defaultdict(list); send_out = defaultdict(list); forwarded = defaultdict(list)
    txn_count = defaultdict(int)          # lifetime activity per account (established-ness)
    WIN = 60
    rows = []
    for e in events:
        s = accounts[e["_sender"]]; r = accounts[e["_receiver"]]; now = e["ts"]
        # how ESTABLISHED each party is (legit users are active; fresh mules are not)
        sender_txns = txn_count[e["_sender"]]
        receiver_txns = txn_count[e["_receiver"]]
        txn_count[e["_sender"]] += 1; txn_count[e["_receiver"]] += 1
        amt_ratio = e["amount"] / max(s["avg_amount"], 1)
        odd = int(e["hour"] not in s["usual_hours"] and e["hour"] in range(0, 6))
        drawdown = e["amount"] / max(s["balance"], 1)

        dseen = devices.setdefault(s["vpa"], {s["home_device"]})
        new_dev = int(e["device_id"] not in dseen); dseen.add(e["device_id"])

        pset = payees.setdefault(s["vpa"], set())
        first_time = int(e["_receiver"] not in pset); pset.add(e["_receiver"])

        sl = sends[s["vpa"]]; sl[:] = [t for t in sl if now - t <= WIN]
        velocity = len(sl); sl.append(now)

        # chain/peeling membership: did the SENDER receive a similar amount very
        # recently (i.e. it is now FORWARDING money = mule)? Key relational signal.
        sin = [(x, a, t) for (x, a, t) in recv_in.get(s["vpa"], []) if now - t <= WIN]
        in_chain = int(any(abs(a - e["amount"]) <= 0.25 * max(e["amount"], 1)
                           for (x, a, t) in sin))
        # jumped-deposit: sender received a TINY credit (<Rs 100) very recently
        recent_micro = int(any(a < 100 for (x, a, t) in sin))

        ri = recv_in[r["vpa"]]; ri[:] = [(x, a, t) for (x, a, t) in ri if now - t <= WIN]
        fan_in = len({x for (x, a, t) in ri}); ri.append((s["vpa"], e["amount"], now))

        so = send_out[s["vpa"]]; so[:] = [(x, t) for (x, t) in so if now - t <= WIN]
        fan_out = len({x for (x, t) in so}); so.append((r["vpa"], now))

        fw = forwarded.get(r["vpa"], [])
        forwards = int(any(now - t <= WIN for t in fw))
        forwarded.setdefault(s["vpa"], []).append(now)

        # brand/keyword spoof in the LOCAL part of the VPA (before @) on a
        # non-merchant account = impersonation
        local = e["receiver_vpa"].split("@")[0].lower()
        BRAND_KW = ("support", "refund", "help", "care", "update", "bill", "kyc",
                    "amazon", "flipkart", "bigbazaar", "irctc", "sbi.", "hdfc.")
        mismatch = int(any(k in local for k in BRAND_KW) and r["is_merchant"] == 0)

        rows.append({
            "ts": now, "sender_vpa": e["sender_vpa"], "receiver_vpa": e["receiver_vpa"],
            "amount": e["amount"], "hour": e["hour"], "type": e["type"], "channel": e["channel"],
            "amount_to_avg_ratio": round(amt_ratio, 3), "odd_hour": odd,
            "balance_drawdown": round(drawdown, 3), "is_new_device": new_dev,
            "first_time_payee": first_time, "sender_velocity_60s": velocity,
            "receiver_fan_in_60s": fan_in, "sender_fan_out_60s": fan_out,
            "receiver_forwards_recent": forwards, "in_mule_chain": in_chain,
            "sender_account_age_days": s["account_age_days"],
            "receiver_account_age_days": r["account_age_days"],
            "sender_txn_count": sender_txns,
            "receiver_txn_count": receiver_txns,       # established-ness signal
            "sender_is_corporate": s["is_corporate"],
            "receiver_is_merchant": r["is_merchant"],
            "receiver_kyc_basic": int(r["kyc_level"] == "BASIC"),
            "receiver_blacklisted": r["blacklisted"],
            "name_vpa_mismatch": mismatch,
            "is_collect": int(e["type"] == "COLLECT"),
            "is_mandate": int(e["type"] == "MANDATE"),
            "is_qr": int(e["channel"] == "QR"),
            "reverse_transfer": e.get("reverse", 0),
            "device_screen_share": e.get("screen_share", 0),
            "device_rooted": e.get("rooted", 0),
            "sim_carrier_mismatch": e.get("sim_mismatch", 0),
            "recent_micro_credit": recent_micro,
            "fraud_type": e.get("fraud_type", "legit"),   # for analysis only, NOT a feature
            "is_fraud": e["is_fraud"],
        })
    return pd.DataFrame(rows)


def main():
    accounts = make_accounts()
    events = build_events(accounts)
    df = compute_features(events, accounts)

    # Tiny, realistic label noise — applied ONLY to positives. The old code
    # flipped LABEL_NOISE of ALL rows; since legit outnumbers fraud ~65:1, that
    # turned ~40% of positives into random-label noise and capped recall by
    # arithmetic (measured recall 0.588 == the noise ceiling, not the model).
    # Flipping a small share of the frauds instead keeps a touch of realism
    # without manufacturing a huge pool of fake positives.
    pos = df.index[df["is_fraud"] == 1]
    flip = pos[rng.random(len(pos)) < LABEL_NOISE]
    df.loc[flip, "is_fraud"] = 0

    df.to_csv(OUT_DIR / "upi_transactions.csv", index=False)
    acc_df = pd.DataFrame(accounts.values())
    acc_df["usual_hours"] = acc_df["usual_hours"].apply(lambda s: f"{min(s)}-{max(s)}")
    acc_df.to_csv(OUT_DIR / "accounts.csv", index=False)

    n = len(df); f = int(df["is_fraud"].sum())
    print(f"Generated {n:,} transactions  ({f:,} fraud = {f/n*100:.2f}%)")
    print(f"Accounts: {len(accounts)}  ({(acc_df['is_merchant']==1).sum()} merchants)")
    print(f"Features: {len([c for c in df.columns if c not in ('ts','sender_vpa','receiver_vpa','is_fraud')])}")
    print("Fraud-rate by type:")
    print(df.groupby("type")["is_fraud"].mean().round(3).to_string())


if __name__ == "__main__":
    main()
