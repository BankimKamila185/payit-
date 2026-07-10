"""
Live end-to-end flow test — hits the REAL backend /pay (the same path the app
uses) with representative scenarios (single + multi-transaction patterns) and
checks each flows correctly. Run backend first on :3000.
"""
import urllib.request, urllib.error, json, sqlite3, time
from pathlib import Path

BASE = "http://127.0.0.1:3000"
DB = Path(__file__).resolve().parent / "db" / "payit.db"


def call(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def pay(s, r, amt, pin="1234", dev="x", ch="MANUAL", ty="PAY"):
    return call("/pay", {"sender_vpa": s, "receiver_vpa": r, "amount": amt,
                         "pin": pin, "device_id": dev, "channel": ch, "type": ty})


# real accounts + their home devices
c = sqlite3.connect(DB).cursor()
users = [r[0] for r in c.execute("SELECT vpa FROM accounts WHERE is_merchant=0 AND blacklisted=0 AND balance>80000 LIMIT 12")]
home = {r[0]: r[1] for r in c.execute("SELECT vpa, home_device FROM accounts")}
mule = c.execute("SELECT vpa FROM accounts WHERE blacklisted=1 LIMIT 1").fetchone()[0]
merch = c.execute("SELECT vpa FROM accounts WHERE is_merchant=1 LIMIT 1").fetchone()[0]
u = users
results = []


def check(name, status, data, want_flag):
    if want_flag is None:                       # expect a REJECTION (not a normal result)
        rejected = status != 200
        results.append((name, "REJECTED" if rejected else "went-through",
                        "PASS" if rejected else "FAIL"))
        return
    label = data.get("label", "ERR") if status == 200 else f"HTTP{status}"
    flagged = label in ("REVIEW", "BLOCK")
    results.append((name, label, "PASS" if flagged == want_flag else "FAIL"))


print("=== LIVE FLOW TEST (real backend /pay) ===\n")

# 1. SAFE — normal person to merchant, own device, small
s, d = pay(u[0], merch, 400, dev=home[u[0]]); check("SAFE: small -> merchant (own device)", s, d, False)
# 2. SAFE — normal p2p, own device
s, d = pay(u[1], u[2], 1500, dev=home[u[1]]); check("SAFE: normal p2p (own device)", s, d, False)
# 3. WRONG PIN
s, d = pay(u[0], merch, 500, pin="9999", dev=home[u[0]]); check("WRONG PIN -> rejected", s, d, None)
# 4. FRAUD — account takeover: huge amount + NEW device
s, d = pay(u[3], u[4], 90000, dev="attacker_phone_1"); check("FRAUD: ATO (huge + new device)", s, d, True)
# 5. FRAUD — blacklisted mule
s, d = pay(u[5], mule, 15000, dev=home[u[5]]); check("FRAUD: blacklisted mule", s, d, True)
# 6. FRAUD — velocity: same sender fires 6 rapid transfers
vs = u[6]
for k in range(6):
    s, d = pay(vs, u[(k % 4) + 7], 3000, dev=home[vs])
check("FRAUD: velocity burst (6th rapid txn)", s, d, True)
# 7. FRAUD — mule chain: A->B big, then B->C similar amount rapidly
a, b, cc = u[8], u[9], u[10]
pay(a, b, 45000, dev=home[a])                 # B receives big
s, d = pay(b, cc, 44000, dev=home[b])         # B forwards similar -> in_mule_chain
check("FRAUD: mule chain (forward similar amount)", s, d, True)
# 8. FRAUD — QR scam: QR channel + new payee
s, d = pay(u[0], u[11], 20000, dev=home[u[0]], ch="QR"); check("FRAUD: QR scam (new payee)", s, d, True)
# 9. FRAUD — fan-in: many senders -> one receiver rapidly
hub = mule                                    # reuse mule as collection hub
for k in range(6):
    s, d = pay(u[k], hub, 8000, dev=home[u[k]])
check("FRAUD: fan-in collection (6 senders)", s, d, True)

# ---- report ----
print(f"{'scenario':<44}{'result':>10}{'':>3}verdict")
print("-" * 66)
p = 0
for name, label, verdict in results:
    mark = "PASS" if verdict == "PASS" else "FAIL"
    print(f"{name:<44}{label:>10}   {mark}")
    p += verdict == "PASS"
print("-" * 66)
print(f"PASSED: {p}/{len(results)}")
