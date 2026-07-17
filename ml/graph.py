"""
UPI Fraud Shield — Graph / Mule-Ring Detection
==============================================
Detects money-mule NETWORK patterns that a per-transaction (tabular) model
misses. Grounded in the canonical AML laundering motifs (IBM AMLworld /
NeurIPS 2023) that our research surfaced:

  - CHAIN / peeling : money forwarded A->B->C->D rapidly, amount ~conserved
  - CYCLE           : A->B->C->A (funds return to origin) -> strong launder sign
  - FAN-IN (hub)    : many senders -> one account (mule collection)
  - FAN-OUT         : one account -> many receivers (distribution)

IMPORTANT (honest framing, per research): a graph pattern is a SIGNAL, not
proof. A chain alone is NOT fraud (salary->rent looks like a chain). We only
score high when the pattern is RAPID + amount-CONSERVED + fresh — the mule
fingerprint, not normal money flow.

Pure NetworkX-style logic on an in-memory recent-edge window (real-time capable).
No GNN (research: GNN not guaranteed better + risky). Lightweight + explainable.
"""

from __future__ import annotations
from collections import defaultdict, deque

RING_WINDOW = 60          # seconds: hops must be recent to count as one ring
RING_WINDOW_LONG = 900    # seconds: 15 minutes lookback for slower/evasive rings
AMOUNT_TOL = 0.25         # +-25% counts as "the same money" flowing through
FANIN_WINDOW = 60         # seconds for fan-in counting


class GraphAnalyzer:
    """Maintains a time-windowed transaction graph and scores mule patterns."""

    def __init__(self):
        # incoming edges per node: receiver -> deque of (sender, amount, ts)
        self.edges_in = defaultdict(lambda: deque(maxlen=100))
        # outgoing edges per node: sender -> deque of (receiver, amount, ts)
        self.edges_out = defaultdict(lambda: deque(maxlen=100))
        # long-window edges for evasive slower chains (up to 15m)
        self.edges_in_long = defaultdict(lambda: deque(maxlen=500))
        self.edges_out_long = defaultdict(lambda: deque(maxlen=500))

    def add(self, sender, receiver, amount, ts):
        """Record a transaction into the graph (call AFTER scoring it)."""
        self.edges_in[receiver].append((sender, amount, ts))
        self.edges_out[sender].append((receiver, amount, ts))
        self.edges_in_long[receiver].append((sender, amount, ts))
        self.edges_out_long[sender].append((receiver, amount, ts))

    # ---------------------------------------------------------------- scoring
    def score(self, sender, receiver, amount, ts):
        """
        Score how 'mule-like' this transaction is. Returns:
          dict(score 0-100, motif, path[list of vpas], detail)
        """
        result = {"score": 0, "motif": None, "path": [], "detail": ""}

        # ---- CHAIN: did similar money arrive into `sender` recently? ----
        chain = self._trace_chain(sender, receiver, amount, ts)
        if len(chain) >= 3:                          # >=2 hops = money passed through
            hops = len(chain) - 1
            result["score"] = min(60 + (hops - 2) * 15, 90)
            result["motif"] = "CHAIN" if hops >= 2 else "FORWARD"
            result["path"] = chain
            result["detail"] = (f"Money forwarded through {hops} hops in "
                                 f"<{RING_WINDOW}s, amount ~conserved")

        # ---- CHAIN_SLOW: did similar money arrive in the longer window (900s)? ----
        long_chain = self._trace_chain_long(sender, receiver, amount, ts)
        if len(long_chain) >= 3 and not result["score"]:
            hops = len(long_chain) - 1
            # 60% of original chain weight, capped at 55
            result["score"] = min(int((60 + (hops - 2) * 15) * 0.6), 55)
            result["motif"] = "CHAIN_SLOW"
            result["path"] = long_chain
            result["detail"] = (f"Money forwarded through {hops} hops in "
                                 f"<{RING_WINDOW_LONG}s, amount ~conserved")

        # ---- CYCLE: does this edge close a loop back to origin? ----
        closed_cycle = (receiver in chain[:-1] if chain else False) or (receiver in long_chain[:-1] if long_chain else False)
        if closed_cycle:
            result["score"] = max(result["score"], 85)
            result["motif"] = "CYCLE"
            result["detail"] = "Funds cycling back to an earlier account (A->B->C->A)"

        # ---- FAN-IN: many unique senders into receiver recently ----
        fan_in = self._fan_in(receiver, ts)
        if fan_in >= 5:
            add = min(20 + (fan_in - 5) * 3, 40)
            if add > result["score"]:
                result["score"] = add
                result["motif"] = result["motif"] or "FAN_IN"
                result["path"] = result["path"] or [sender, receiver]
                result["detail"] = (f"Receiver got money from {fan_in} different "
                                    f"senders in <{FANIN_WINDOW}s (mule collection)")

        # ---- FAN-OUT: one sender paying many unique receivers recently ----
        fan_out = self._fan_out(sender, ts)
        if fan_out >= 5:
            add = min(20 + (fan_out - 5) * 3, 40)
            if add > result["score"]:
                result["score"] = add
                result["motif"] = result["motif"] or "FAN_OUT"
                result["path"] = result["path"] or [sender, receiver]
                result["detail"] = (f"Sender paid {fan_out} different receivers "
                                    f"in <{FANIN_WINDOW}s (smurfing/distribution)")

        # ---- GATHER-SCATTER: the classic collection-mule cash-out ----
        # Fan-in ALONE is weak — a shop also receives from many. The mule
        # signature is GATHER then SCATTER: this sender just collected from many
        # distinct senders and is now forwarding it out. We detect it at the
        # forward (scatter) step by asking how many paid INTO the sender recently.
        # It is corroboration-gated in combine() (like CHAIN/CYCLE) so a legit
        # "5 friends chip in, one person buys the group gift" — high fan-in but a
        # known payee, no other risk — does not get escalated.
        gathered = self._fan_in(sender, ts)
        if gathered >= 5:                    # >=5 distinct senders collected, matches fan-in threshold
            add = min(60 + (gathered - 5) * 5, 75)   # 5->60 so it can reach the corroboration gate
            if add > result["score"]:
                result["score"] = add
                result["motif"] = "GATHER_SCATTER"
                result["path"] = result["path"] or [sender, receiver]
                result["detail"] = (f"Sender collected from {gathered} senders in "
                                    f"<{FANIN_WINDOW}s then forwarded (collection-mule cash-out)")

        return result

    # ---------------------------------------------------------- internals
    def _trace_chain(self, sender, receiver, amount, ts, max_hops=4):
        """Walk backwards from `sender`: who sent similar money into it recently?
        Returns node path [origin, ..., sender, receiver] if a chain exists."""
        path = [sender, receiver]
        cur = sender
        visited = {sender, receiver}
        for _ in range(max_hops):
            best = None
            for (src, amt, t) in reversed(self.edges_in[cur]):
                if ts - t > RING_WINDOW:
                    continue
                if src in visited:
                    # Closing a loop. A 2-node reciprocal (A->B->A) is benign
                    # RECIPROCITY — friends / family / roommates settling up — not
                    # laundering, so it must not be flagged as a CYCLE. Only close
                    # the loop when it spans >=3 distinct accounts AND this hop
                    # conserves the amount (real layering preserves the sum through
                    # the ring; two unrelated payments between two people don't).
                    if len(set(path)) >= 3 and abs(amt - amount) <= AMOUNT_TOL * amount:
                        path.insert(0, src)
                        return path
                    continue                 # reciprocal / non-conserved — keep scanning
                if abs(amt - amount) <= AMOUNT_TOL * amount:
                    best = (src, t)
                    break
            if best is None:
                break
            path.insert(0, best[0])
            visited.add(best[0])
            cur = best[0]
        return path

    def _trace_chain_long(self, sender, receiver, amount, ts, max_hops=4):
        """Walk backwards from `sender` using the long lookback window (900s).
        Returns node path [origin, ..., sender, receiver] if a chain exists."""
        path = [sender, receiver]
        cur = sender
        visited = {sender, receiver}
        for _ in range(max_hops):
            best = None
            for (src, amt, t) in reversed(self.edges_in_long[cur]):
                if ts - t > RING_WINDOW_LONG:
                    continue
                if src in visited:
                    # See _trace_chain: reciprocal 2-cycles are benign; only a
                    # >=3-account, amount-conserved loop is a laundering ring.
                    if len(set(path)) >= 3 and abs(amt - amount) <= AMOUNT_TOL * amount:
                        path.insert(0, src)
                        return path
                    continue
                if abs(amt - amount) <= AMOUNT_TOL * amount:
                    best = (src, t)
                    break
            if best is None:
                break
            path.insert(0, best[0])
            visited.add(best[0])
            cur = best[0]
        return path

    def _fan_in(self, receiver, ts):
        senders = {src for (src, amt, t) in self.edges_in[receiver]
                   if ts - t <= FANIN_WINDOW}
        return len(senders)

    def _fan_out(self, sender, ts):
        receivers = {dest for (dest, amt, t) in self.edges_out[sender]
                     if ts - t <= FANIN_WINDOW}
        return len(receivers)


def _demo():
    """Show it catching a planted mule ring vs ignoring a legit flow."""
    import pandas as pd
    from pathlib import Path
    HERE = Path(__file__).resolve().parent
    df = pd.read_csv(HERE / "data" / "upi_transactions.csv").sort_values("ts")

    g = GraphAnalyzer()
    rings = []
    for _, r in df.iterrows():
        res = g.score(r["sender_vpa"], r["receiver_vpa"], r["amount"], r["ts"])
        if res["score"] >= 60 and res["motif"] in ("CHAIN", "CYCLE"):
            rings.append((r["sender_vpa"], r["receiver_vpa"], res))
        g.add(r["sender_vpa"], r["receiver_vpa"], r["amount"], r["ts"])

    print(f"=== Graph module: detected {len(rings)} mule-chain/cycle events ===\n")
    for s, rv, res in rings[:5]:
        print(f"{res['motif']}  score={res['score']}")
        print(f"  path: {' -> '.join(res['path'])}")
        print(f"  {res['detail']}\n")


if __name__ == "__main__":
    _demo()
