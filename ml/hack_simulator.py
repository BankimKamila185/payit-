"""
UPI Fraud Shield — Hacking & Complex Attack Simulator
=====================================================
Simulates advanced hacking patterns and complex fraud vectors to verify how the
AI Fraud Shield detects and defends against them.

Hits the live backend: https://payit-ru7o.onrender.com
"""
import urllib.request
import urllib.error
import json
import sqlite3
from pathlib import Path

BASE = "https://payit-ru7o.onrender.com"
DB = Path(__file__).resolve().parent.parent / "db" / "payit.db"

def call(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

def pay(body):
    return call("/pay", body)

# ------------------------------------------------------------- 1. Setup Accounts
c = sqlite3.connect(DB).cursor()
# Find safe user
user_vpa = c.execute("SELECT vpa FROM accounts WHERE is_merchant=0 AND blacklisted=0 AND balance > 50000 LIMIT 1").fetchone()[0]
# Find another normal user
peer_vpa = c.execute("SELECT vpa FROM accounts WHERE is_merchant=0 AND blacklisted=0 AND vpa != ? LIMIT 1", (user_vpa,)).fetchone()[0]
# Find blacklisted mule
mule_vpa = c.execute("SELECT vpa FROM accounts WHERE blacklisted=1 LIMIT 1").fetchone()[0]

print("=" * 70)
print("     🚨 UPI FRAUD SHIELD — ATTACK & HACK SIMULATOR 🚨")
print("=" * 70)
print(f"Targeting backend: {BASE}")
print(f"Loaded Sender: {user_vpa}")
print(f"Loaded Receiver: {peer_vpa}")
print(f"Loaded Mule: {mule_vpa}\n")

# ------------------------------------------------------------- ATTACK 1: Digital Lutera
print("🔥 [ATTACK 1] Digital Lutera (Rooted Device SIM-Binding Bypass)")
print("   - Attack Vector: Hackers clone the user's account details using a rooted phone")
print("     with a carrier-spoofed SIM to bypass physical device bindings.")
payload1 = {
    "sender_vpa": user_vpa,
    "receiver_vpa": peer_vpa,
    "amount": 25000.0,
    "pin": "1234",
    "device_id": "rooted_lutera_clone",
    "rooted": 1,
    "sim_mismatch": 1
}
status1, res1 = pay(payload1)
print(f"   - HTTP Status: {status1}")
print(f"   - AI Shield Verdict: {res1.get('label', 'ERR')} (Score: {res1.get('score', 0)})")
print(f"   - Reasons Blocked: {res1.get('reasons', [])}")
print(f"   - Outcome: {'🚫 ATTACK BLOCKED SUCCESSFULLY' if res1.get('label') == 'BLOCK' else '⚠️ BYPASSED'}\n")

# ------------------------------------------------------------- ATTACK 2: AnyDesk Social Engineering
print("🔥 [ATTACK 2] Screen Share Capture (AnyDesk/TeamViewer Phishing)")
print("   - Attack Vector: Victim is trick-called by a fake banking agent and asked to")
print("     open AnyDesk. The attacker triggers a transaction and watches the PIN entry.")
payload2 = {
    "sender_vpa": user_vpa,
    "receiver_vpa": peer_vpa,
    "amount": 42000.0,
    "pin": "1234",
    "device_id": "victim_device",
    "screen_share": 1
}
status2, res2 = pay(payload2)
print(f"   - HTTP Status: {status2}")
print(f"   - AI Shield Verdict: {res2.get('label', 'ERR')} (Score: {res2.get('score', 0)})")
print(f"   - Reasons Blocked: {res2.get('reasons', [])}")
print(f"   - Outcome: {'🚫 ATTACK BLOCKED SUCCESSFULLY' if res2.get('label') == 'BLOCK' else '⚠️ BYPASSED'}\n")

# ------------------------------------------------------------- ATTACK 3: Jumped Deposit (APP Scam)
print("🔥 [ATTACK 3] Jumped Deposit (Unsolicited Credit followed by Collect Request)")
print("   - Attack Vector: Attacker sends ₹10 to user. Instantly follows up with a large")
print("     outbound collect request. Distracted user PINs the collect request thinking it's a refund.")
# Simulating jumped deposit by setting type='COLLECT' and having a recent micro deposit in DB
# To simulate the micro-deposit, we'll quickly insert a small txn in our local simulation, 
# but the backend will check its own DB. Let's make a real small deposit to our user on backend:
print("   - Step 3a: Attacker sends ₹15 micro-deposit to victim...")
pay({
    "sender_vpa": peer_vpa,
    "receiver_vpa": user_vpa,
    "amount": 15.0,
    "pin": "1234",
    "device_id": "attacker_phone"
})

print("   - Step 3b: Attacker sends ₹48,000 COLLECT request to victim...")
payload3 = {
    "sender_vpa": user_vpa,
    "receiver_vpa": peer_vpa,
    "amount": 48000.0,
    "pin": "1234",
    "device_id": "victim_device",
    "type": "COLLECT"
}
status3, res3 = pay(payload3)
print(f"   - HTTP Status: {status3}")
print(f"   - AI Shield Verdict: {res3.get('label', 'ERR')} (Score: {res3.get('score', 0)})")
print(f"   - Reasons Blocked: {res3.get('reasons', [])}")
print(f"   - Outcome: {'🚫 ATTACK BLOCKED/CHALLENGED SUCCESSFULLY' if res3.get('label') in ('BLOCK', 'REVIEW') else '⚠️ BYPASSED'}\n")

# ------------------------------------------------------------- ATTACK 4: Mule Chain Smurfing
print("🔥 [ATTACK 4] Mule Chain Laundering (A -> B -> C Forwarding)")
print("   - Attack Vector: Attacker attempts to route stolen funds through consecutive")
print("     mule accounts rapidly to cover the money trail.")
# Hop 1: peer_vpa sends 75k to user_vpa
print(f"   - Hop 1: {peer_vpa} sends ₹75,000 to {user_vpa}...")
pay({
    "sender_vpa": peer_vpa,
    "receiver_vpa": user_vpa,
    "amount": 75000.0,
    "pin": "1234"
})
# Hop 2: user_vpa immediately tries to forward ₹74,500 to another user
print(f"   - Hop 2: {user_vpa} tries to forward ₹74,500 immediately to another account...")
payload4 = {
    "sender_vpa": user_vpa,
    "receiver_vpa": peer_vpa,
    "amount": 74500.0,
    "pin": "1234"
}
status4, res4 = pay(payload4)
print(f"   - HTTP Status: {status4}")
print(f"   - AI Shield Verdict: {res4.get('label', 'ERR')} (Score: {res4.get('score', 0)})")
print(f"   - Reasons Blocked: {res4.get('reasons', [])}")
print(f"   - Outcome: {'🚫 LAUNDERING LAID BARE & BLOCKED' if res4.get('label') == 'BLOCK' else '⚠️ BYPASSED'}\n")

print("=" * 70)
print("✅ ALL COMPLEX ATTACK SIMULATIONS COMPLETED")
print("=" * 70)
