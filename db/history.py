"""
The ledger: 60 days of transactions that a real relationship can explain.
========================================================================
Random edges between random accounts would be worse than no history — it would
make every account look like a hub and quietly poison the very features the engine
reads. So every edge here comes from a rule someone could state out loud:

  salary      employer -> each office account, 1st of the month, same-ish amount
  rent        Om + roommate -> landlord, 2nd, the SAME amount every month
  daily spend everyone -> merchants (small, frequent — this is most of real UPI)
  circle P2P  within family / flat / office / college only
  strangers   merchants + their own circle. NEVER an edge to Om.
  mule flow   victims -> L1 -> L2 -> aggregator -> cash-out, plus herder commission

WHAT THE HISTORY IS ACTUALLY FOR
--------------------------------
Be honest about which signals this can and cannot light up, because the windows in
server/app.py are 60s / 10m / 24h:

  first_time_payee    REAL WIN. Om has paid his circle many times, so paying Aai
                      stops saying "First-time payee" while paying a scammer still
                      does. That contrast is the whole demo.
  txn_count / avg     derived from this ledger, not invented.
  graph shape         the analyst feed and any offline graph work get real motifs.
  velocity / fan-in   only the 24h window can see anything, and only right after
  fan-out / 10m       seeding — it decays within a day.
  60s windows         NOT seeded. A "burst 60 seconds ago" is 60 seconds old exactly
                      once, so faking one would be a lie that expires. Those fire
                      from live demo activity, which is the honest way to show them.

BALANCES ARE NOT REPLAYED
-------------------------
Balances in roster.py are snapshots; this ledger is not summed into them. A real
core banking system would keep them consistent — this is a demo fixture and the
engine never reads balance history, only the current figure. Stated here rather
than left for someone to discover.
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta

from db.roster import ROSTER, by_cluster, is_merchant, one

HISTORY_DAYS = 60

# Realistic rupee ranges per merchant category. Real UPI is mostly tiny payments;
# without this the amount distribution is uniform noise and amount_to_avg_ratio
# stops meaning anything.
MERCHANT_AMOUNTS = {
    "annapurna.chai@paytm": (10, 40),
    "sai.autorickshaw@ybl": (40, 180),
    "shreekrishna.kirana@ybl": (80, 700),
    "wellness.medical@okhdfc": (90, 600),
    "glamour.salon@okaxis": (150, 900),
    "jiorecharge@ybl": (199, 999),
    "zomato@okkotak": (180, 700),
    "swiggy@okhdfc": (180, 700),
    "apollopharmacy@okpnb": (120, 900),
    "dmart@okaxis": (600, 3200),
    "irctc@oksbi": (400, 2500),
    "croma@okicici": (4000, 45000),          # rare, big-ticket
    "nikhil.newshop@okhdfc": (150, 800),
}
# How often each merchant is picked, relative to the others. Chai daily, Croma once.
MERCHANT_WEIGHT = {
    "annapurna.chai@paytm": 26, "sai.autorickshaw@ybl": 18,
    "shreekrishna.kirana@ybl": 16, "wellness.medical@okhdfc": 7,
    "glamour.salon@okaxis": 3, "jiorecharge@ybl": 5,
    "zomato@okkotak": 9, "swiggy@okhdfc": 8, "apollopharmacy@okpnb": 5,
    "dmart@okaxis": 6, "irctc@oksbi": 2, "croma@okicici": 1,
    "nikhil.newshop@okhdfc": 2,
}


def _rupees(lo, hi):
    return round(random.uniform(lo, hi), 2)


def _biz_hour():
    """Indian UPI activity clusters 8am-11pm, thinner at night."""
    return random.choices(range(0, 24),
                          weights=[1, 1, 1, 1, 1, 2, 4, 7, 10, 11, 10, 11, 12, 10,
                                   9, 9, 10, 11, 12, 12, 10, 7, 4, 2])[0]


def _at(now, days_ago, hour=None):
    d = now - timedelta(days=days_ago)
    h = _biz_hour() if hour is None else hour
    return d.replace(hour=h, minute=random.randint(0, 59), second=random.randint(0, 59))


class Ledger:
    """Collects edges, then hands them over as transaction rows."""

    def __init__(self):
        self.rows: list[dict] = []

    def add(self, sender, receiver, amount, when, *, channel=None, ttype="PAY",
            status="success", label="SAFE", score=None):
        if sender == receiver:
            return
        if channel is None:
            channel = random.choice(["QR", "INTENT", "MANUAL"]) if is_merchant(one(receiver)) \
                else random.choice(["CONTACT", "MANUAL"])
        self.rows.append(dict(
            sender=sender, receiver=receiver, amount=round(float(amount), 2),
            type=ttype, channel=channel, status=status,
            hour=when.hour, score=score if score is not None else random.randint(2, 22),
            label=label, created_at=when.isoformat()))


def _spend_at_merchants(led, payer_vpa, now, days_ago, n):
    """One person's ordinary day: a few small merchant payments."""
    pool = [v for v in MERCHANT_WEIGHT if v in MERCHANT_AMOUNTS]
    weights = [MERCHANT_WEIGHT[v] for v in pool]
    for _ in range(n):
        m = random.choices(pool, weights=weights)[0]
        lo, hi = MERCHANT_AMOUNTS[m]
        led.add(payer_vpa, m, _rupees(lo, hi), _at(now, days_ago))


def generate(now: datetime | None = None) -> list[dict]:
    random.seed(1337)
    now = now or datetime.now()
    led = Ledger()

    om = "omsawant@okicici"
    family = [a["vpa"] for a in by_cluster("family")]
    flat = [a["vpa"] for a in by_cluster("flat")]
    office = [a["vpa"] for a in by_cluster("office")]
    college = [a["vpa"] for a in by_cluster("college")]
    strangers = [a["vpa"] for a in by_cluster("stranger")]
    employer = "infinitesoft.payroll@okhdfc"
    landlord = "landlord.gokhale@oksbi"
    watchman = "society.watchman@ybl"

    # people who live an ordinary financial life in this DB
    ordinary = [om] + family + office + college + strangers + \
               [v for v in flat if v not in (landlord, watchman)]

    # ---------------------------------------------------------------- 60 days
    for days_ago in range(HISTORY_DAYS, 0, -1):
        day = now - timedelta(days=days_ago)

        # --- salary: employer -> every office account (+ Om). Same day, same-ish amount.
        # This is the corporate fan-out that sender_is_corporate exists to exempt.
        if day.day == 1:
            for emp in office + [om]:
                base = {om: 61000}.get(emp, random.Random(hash(emp) % 9999).randint(38000, 78000))
                led.add(employer, emp, base + random.randint(-400, 400),
                        _at(now, days_ago, hour=11), channel="MANUAL")

        # --- rent: Om and Rohit -> landlord, SAME amount monthly (a real recurring edge)
        if day.day == 2:
            led.add(om, landlord, 16000, _at(now, days_ago, hour=10), channel="MANUAL")
            led.add("rohit.patil@okaxis", landlord, 16000, _at(now, days_ago, hour=10), channel="MANUAL")

        # --- society maintenance -> watchman, monthly-ish
        if day.day == 5:
            for payer in flat:
                if payer not in (landlord, watchman):
                    led.add(payer, watchman, _rupees(300, 600), _at(now, days_ago, hour=19))

        # --- everyday merchant spend
        for p in ordinary:
            if random.random() < 0.82:
                _spend_at_merchants(led, p, now, days_ago, random.randint(1, 4))

        # --- P2P inside a circle only. Om pays his circle often: this is what makes
        # first_time_payee=0 for contacts and keeps it 1 for every scammer.
        if random.random() < 0.75:
            led.add(om, random.choice(family), _rupees(500, 6000), _at(now, days_ago))
        if random.random() < 0.45:
            led.add(om, random.choice([v for v in office if v != om]), _rupees(100, 900), _at(now, days_ago))
        if random.random() < 0.40:
            led.add(om, random.choice(college), _rupees(100, 1200), _at(now, days_ago))
        if random.random() < 0.35:
            led.add(om, "rohit.patil@okaxis", _rupees(200, 2500), _at(now, days_ago))
        if random.random() < 0.30:
            led.add(random.choice(family), om, _rupees(500, 4000), _at(now, days_ago))

        # other clusters have their own internal life
        for group in (office, college, [v for v in flat if v != landlord]):
            if len(group) > 1 and random.random() < 0.55:
                s, r = random.sample(group, 2)
                led.add(s, r, _rupees(100, 1500), _at(now, days_ago))

        # A family transacts with EACH OTHER, not only through Om. Without this the
        # family is a star centred on him, which no real household looks like.
        aai, baba, sister = "sunita.sawant@oksbi", "prakash.sawant@okhdfc", "sanika.sawant@ybl"
        if random.random() < 0.45:
            s, r = random.sample([aai, baba], 2)
            led.add(s, r, _rupees(500, 9000), _at(now, days_ago))
        if random.random() < 0.30:                      # hostel money for the sister
            led.add(random.choice([aai, baba]), sister, _rupees(2000, 12000), _at(now, days_ago))
        if random.random() < 0.12:
            led.add(sister, random.choice([aai, baba]), _rupees(200, 1500), _at(now, days_ago))

        # CROSS-CLUSTER BRIDGES. Real social graphs are not disjoint blobs: the
        # roommate knows a college friend, a colleague knows a neighbour. Without a
        # few bridges every cluster is an island and community detection is trivial.
        if random.random() < 0.18:
            led.add("rohit.patil@okaxis", random.choice(college), _rupees(150, 2000), _at(now, days_ago))
        if random.random() < 0.14:
            led.add(random.choice(college), "rohit.patil@okaxis", _rupees(150, 2000), _at(now, days_ago))
        if random.random() < 0.12:
            led.add(random.choice(office), random.choice(college), _rupees(200, 2500), _at(now, days_ago))
        if random.random() < 0.10:
            led.add("meera.deshpande@okicici", random.choice([aai, "rohit.patil@okaxis"]),
                    _rupees(100, 1200), _at(now, days_ago))

        # strangers transact among themselves — never with Om. They have their own
        # little circles, which is the point: most of the graph is not about you.
        if random.random() < 0.6:
            s, r = random.sample(strangers, 2)
            led.add(s, r, _rupees(100, 3000), _at(now, days_ago))
        if random.random() < 0.35:
            s, r = random.sample(strangers, 2)
            led.add(s, r, _rupees(100, 3000), _at(now, days_ago))

    # ---------------------------------------------------------------- mule network
    # Bursty, layered, and recent — mules move money in short windows while legit
    # users spread out (ALL_SCENARIOS: TEMPORAL BURSTINESS).
    l1 = [a["vpa"] for a in by_cluster("mule_l1")]
    l2 = [a["vpa"] for a in by_cluster("mule_l2")]
    aggregator = "consolidate.acc1@okpnb"
    cashout = "finalcash.out@paytm"
    herder = "controller.ops@ybl"
    dormant = [a["vpa"] for a in by_cluster("mule_dormant")]
    merch_mules = [a["vpa"] for a in by_cluster("mule_merchant")]
    unwitting = [a["vpa"] for a in by_cluster("mule_unwitting")]

    # victims are strangers — they have no idea they are in this graph.
    victims = strangers[:8]

    # RING A: victims -> L1 -> L2 -> aggregator -> cash-out, over the last 14 days.
    # FAN-IN at L1, STACK across the tiers, GATHER at the aggregator.
    for days_ago in range(14, 0, -1):
        if random.random() < 0.7:
            batch = []
            for v in random.sample(victims, random.randint(3, 6)):
                amt = _rupees(4000, 45000)
                t = _at(now, days_ago)
                collector = random.choice(l1)
                led.add(v, collector, amt, t, channel="MANUAL", label="SAFE", score=random.randint(20, 34))
                batch.append((collector, amt, t))

            # L1 -> L2 within minutes, ~92% (the mule keeps a cut) = amount conserved
            hops = []
            for collector, amt, t in batch:
                hop = random.choice(l2)
                t2 = t + timedelta(minutes=random.randint(2, 25))
                led.add(collector, hop, round(amt * random.uniform(0.90, 0.95), 2), t2,
                        channel="MANUAL", label="SAFE", score=random.randint(25, 40))
                hops.append((hop, amt, t2))

            # L2 -> aggregator (GATHER)
            for hop, amt, t2 in hops:
                t3 = t2 + timedelta(minutes=random.randint(3, 40))
                led.add(hop, aggregator, round(amt * random.uniform(0.85, 0.92), 2), t3,
                        channel="MANUAL", label="SAFE", score=random.randint(25, 45))

            # aggregator -> cash-out, held <60s before the ATM draw (CASE 26)
            total = round(sum(a for _, a, _ in batch) * 0.85, 2)
            t4 = _at(now, days_ago, hour=23)
            led.add(aggregator, cashout, total, t4, channel="MANUAL",
                    label="REVIEW", score=random.randint(45, 60))

            # commission back to the herder (FAN-IN on the herder, FAN-OUT from mules)
            for m in random.sample(l1 + l2, random.randint(2, 4)):
                led.add(m, herder, _rupees(300, 1800), t4 + timedelta(minutes=random.randint(1, 30)))

    # RING B: dormant accounts — quiet for their whole life, then switched on 6 days ago.
    # Their age (~1000d) makes the fresh-account rule useless against them.
    for d in dormant:
        for days_ago in range(400, 6, -60):          # a trickle: this is the "dormant" look
            if random.random() < 0.3:
                led.add(d, random.choice(["shreekrishna.kirana@ybl", "annapurna.chai@paytm"]),
                        _rupees(40, 300), _at(now, days_ago))
    for days_ago in range(6, 0, -1):                 # switched on
        for d in dormant:
            if random.random() < 0.8:
                v = random.choice(victims)
                amt = _rupees(9000, 60000)
                t = _at(now, days_ago)
                led.add(v, d, amt, t, channel="MANUAL", label="SAFE", score=random.randint(15, 28))
                led.add(d, aggregator, round(amt * 0.93, 2), t + timedelta(minutes=random.randint(4, 30)),
                        channel="MANUAL", label="SAFE", score=random.randint(20, 35))

    # RING C: merchant-disguised mules. Same fan-in shape as RING A — but is_merchant=1
    # means ml/rules.py exempts them from the fan-in rule, so they score clean.
    for days_ago in range(20, 0, -1):
        for mm in merch_mules:
            for v in random.sample(strangers, random.randint(2, 5)):
                led.add(v, mm, _rupees(2000, 30000), _at(now, days_ago),
                        channel=random.choice(["QR", "INTENT"]), label="SAFE",
                        score=random.randint(1, 8))
            if random.random() < 0.6:
                led.add(mm, aggregator, _rupees(20000, 90000), _at(now, days_ago, hour=22),
                        channel="MANUAL")

    # RING D: unwitting mules — a real person's real account, being used. Their history
    # looks like anyone else's, which is exactly why nothing static catches them.
    for days_ago in range(25, 0, -1):
        for u in unwitting:
            if random.random() < 0.35:
                amt = _rupees(15000, 80000)
                t = _at(now, days_ago)
                led.add(random.choice(victims), u, amt, t, channel="MANUAL")
                led.add(u, random.choice(l2 + [aggregator]), round(amt * 0.97, 2),
                        t + timedelta(hours=random.randint(1, 6)), channel="MANUAL")

    # A SIMPLE CYCLE, once: money returns to origin (motif 5). Strong indicator, high
    # false-positive rate — seeded once so the motif exists without dominating.
    t = _at(now, 9, hour=21)
    amt = 26000
    led.add("cash.quick777@paytm", "transfer.hub2@ybl", amt, t)
    led.add("transfer.hub2@ybl", "route.pay44@paytm", amt * 0.96, t + timedelta(minutes=6))
    led.add("route.pay44@paytm", "cash.quick777@paytm", amt * 0.92, t + timedelta(minutes=13))

    # ---------------------------------------------------------------- today
    # Some activity inside the 24h window so sender_velocity_24h / receiver_fan_in_24h
    # are non-zero right after seeding. These decay within a day — by design, see the
    # module docstring.
    for p in random.sample(ordinary, 12):
        _spend_at_merchants(led, p, now, 0, random.randint(1, 3))
    for v in random.sample(victims, 5):
        led.add(v, random.choice(l1), _rupees(5000, 30000), _at(now, 0))

    led.rows.sort(key=lambda r: r["created_at"])
    return led.rows


def profile_stats(rows: list[dict]) -> dict[str, dict]:
    """txn_count + avg_amount derived from the ledger we actually generated, rather
    than invented numbers that contradict it."""
    stats: dict[str, dict] = {}
    for r in rows:
        s = stats.setdefault(r["sender"], {"sent": 0, "total": 0.0, "recv": 0})
        s["sent"] += 1
        s["total"] += r["amount"]
        stats.setdefault(r["receiver"], {"sent": 0, "total": 0.0, "recv": 0})["recv"] += 1
    out = {}
    for vpa, s in stats.items():
        out[vpa] = {
            "txn_count": s["sent"] + s["recv"],
            "avg_amount": round(s["total"] / s["sent"], 2) if s["sent"] else None,
        }
    return out
