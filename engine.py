"""
UPI Fraud Scoring Engine
========================

The "brain" of the system. Given a single transaction (and recent history),
it returns a fraud score (0-100), a label, and HUMAN-READABLE reasons.

Three detection layers (exactly what the problem statement asks for):
  1. Behavioral patterns  -> amount vs user's normal, odd hour, velocity
  2. Device fingerprinting -> transaction from a new/unknown device
  3. Graph anomaly         -> "money mule" rings (paisa A->B->C->D rapidly)

Pure standard library. No external dependencies. This is the REAL engine —
in production it would sit at a bank/PSP switch; here it is fed by a
synthetic transaction generator instead of NPCI.
"""

import time
from collections import defaultdict, deque

# ---- tunables (weights for each risk signal) -------------------------------
W_AMOUNT_SPIKE   = 35   # amount much higher than user's normal
W_ODD_HOUR       = 15   # transaction at an unusual night hour
W_NEW_DEVICE     = 25   # never-seen-before device
W_NEW_RECEIVER   = 15   # receiver account is brand new
W_VELOCITY       = 20   # too many transactions in a short burst
W_MULE_RING      = 60   # part of a money-mule forwarding chain

FRAUD_THRESHOLD  = 60   # score >= this  -> FRAUD (block)
REVIEW_THRESHOLD = 35   # score in between -> REVIEW (step-up auth)

RING_WINDOW_SEC  = 30    # how recently hops must occur to count as one ring
RING_AMOUNT_TOL  = 0.25  # amounts within +-25% count as "the same money"


class FraudEngine:
    def __init__(self, users):
        # users: dict[user_id] -> profile dict (avg_amount, usual_hours,
        #        home_device, account_age_days)
        self.users = users

        # graph of recent transfers for mule-ring detection
        # edges_in[v]  = deque of (src, amount, ts) ending at v
        self.edges_in = defaultdict(lambda: deque(maxlen=50))

        # velocity tracking: recent send timestamps per user
        self.recent_sends = defaultdict(lambda: deque(maxlen=20))

        # devices we've actually seen a user transact from
        self.seen_devices = defaultdict(set)

    # ----------------------------------------------------------------- scoring
    def score(self, txn):
        """Score one transaction. Returns the txn enriched with risk fields."""
        t0 = time.perf_counter()

        sender = self.users.get(txn["sender"], {})
        score = 0
        reasons = []

        # --- LAYER 1: behavioral --------------------------------------------
        avg = max(sender.get("avg_amount", 1500), 1)
        ratio = txn["amount"] / avg
        if ratio >= 10:
            score += W_AMOUNT_SPIKE
            reasons.append(f"Amount is {ratio:.0f}x the user's usual (~Rs{avg:,.0f})")
        elif ratio >= 5:
            score += int(W_AMOUNT_SPIKE * 0.6)
            reasons.append(f"Amount is {ratio:.0f}x higher than normal")

        usual_hours = sender.get("usual_hours", set(range(7, 23)))
        if txn["hour"] not in usual_hours and txn["hour"] in range(0, 6):
            score += W_ODD_HOUR
            reasons.append(f"Unusual time: {txn['hour']:02d}:xx (user rarely active at night)")

        # velocity: count this user's sends in the last 20 seconds
        now = txn["ts"]
        sends = self.recent_sends[txn["sender"]]
        recent = [s for s in sends if now - s <= 20]
        if len(recent) >= 4:
            score += W_VELOCITY
            reasons.append(f"Velocity spike: {len(recent)+1} transfers in <20s")
        sends.append(now)

        # --- LAYER 2: device fingerprinting ---------------------------------
        seen = self.seen_devices[txn["sender"]]
        home = sender.get("home_device")
        if txn["device"] != home and txn["device"] not in seen:
            score += W_NEW_DEVICE
            reasons.append("New/unrecognised device for this user")
        seen.add(txn["device"])

        # --- receiver account age -------------------------------------------
        receiver = self.users.get(txn["receiver"], {})
        if receiver.get("account_age_days", 999) < 7:
            score += W_NEW_RECEIVER
            reasons.append(f"Receiver account is only {receiver.get('account_age_days',0)} days old")

        # --- LAYER 3: graph / mule-ring detection ---------------------------
        ring = self._detect_ring(txn)
        if ring:
            score += W_MULE_RING
            hops = " -> ".join(ring)
            reasons.append(f"MULE RING: money forwarded through {hops}")

        # record this edge for future ring detection
        self.edges_in[txn["receiver"]].append((txn["sender"], txn["amount"], now))

        # --- finalise --------------------------------------------------------
        score = min(score, 100)
        if score >= FRAUD_THRESHOLD:
            label = "FRAUD"
        elif score >= REVIEW_THRESHOLD:
            label = "REVIEW"
        else:
            label = "SAFE"
            if not reasons:
                reasons.append("Matches user's normal behaviour")

        latency_ms = (time.perf_counter() - t0) * 1000

        txn = dict(txn)
        txn.update({
            "score": score,
            "label": label,
            "reasons": reasons,
            "ring": ring or [],
            "latency_ms": round(latency_ms, 2),
        })
        return txn

    # ------------------------------------------------------- ring detection
    def _detect_ring(self, txn):
        """
        Look backwards from the sender: did similar money arrive into the
        sender very recently from someone else? If so, the sender is
        forwarding it -> classic mule chain. Returns the node path, else [].
        """
        amount = txn["amount"]
        now = txn["ts"]
        path = [txn["sender"], txn["receiver"]]

        cur = txn["sender"]
        hops = 0
        visited = {txn["receiver"], txn["sender"]}
        while hops < 4:
            best = None
            for (src, amt, ts) in reversed(self.edges_in[cur]):
                if now - ts > RING_WINDOW_SEC:
                    continue
                if src in visited:
                    continue
                if abs(amt - amount) <= RING_AMOUNT_TOL * amount:
                    best = src
                    break
            if best is None:
                break
            path.insert(0, best)
            visited.add(best)
            cur = best
            hops += 1

        # a real ring = money passed through at least 3 accounts (2+ hops)
        return path if len(path) >= 3 else []
