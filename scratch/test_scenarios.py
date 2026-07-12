import os
import subprocess
import time
import urllib.request
import urllib.error
import json
import sqlite3
from pathlib import Path

# Paths
ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "db" / "payit.db"
URL = "http://localhost:3000"

def call_api(path, body):
    data_bytes = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(
        f"{URL}{path}",
        data=data_bytes,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            err_data = json.loads(e.read().decode('utf-8'))
        except Exception:
            err_data = e.reason
        return e.code, err_data

def run_tests():
    print("=== STARTING LOCAL SCENARIO TESTS ===")
    
    # Connect to DB to find sample users
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    
    # Find a normal user with sufficient balance
    sender = con.execute("SELECT * FROM accounts WHERE is_merchant=0 AND blacklisted=0 AND balance > 5000 LIMIT 1").fetchone()
    receiver = con.execute("SELECT * FROM accounts WHERE is_merchant=0 AND blacklisted=0 AND vpa != ? LIMIT 1", (sender["vpa"],)).fetchone()
    mule = con.execute("SELECT * FROM accounts WHERE blacklisted=1 LIMIT 1").fetchone()
    
    # 1. Ensure receiver_new is < 90 days for Scenario 3
    # Let's dynamically update a receiver's age to < 90 days so it triggers Scenario 3 post-payment recheck
    new_vpa = "newuser@oksbi"
    con.execute("INSERT OR IGNORE INTO accounts (user_id, bank_id, vpa, account_number, balance, account_age_days, kyc_level, is_merchant, MCC, avg_amount, usual_hours, home_device, txn_count, blacklisted, created_at, upi_pin_hash) VALUES (1, 1, ?, 'ACC999999', 1000.0, 10, 'BASIC', 0, 0, 500, '7-22', 'device_new', 0, 0, '2026-07-01T00:00:00', '16f5c2d3c9a62efd48b71d6cc44747c358ffbe382cf847d06e2098d6368d374a')",(new_vpa,))
    con.execute("UPDATE accounts SET account_age_days=10 WHERE vpa=?", (new_vpa,))
    
    # Create a registered VPA containing a scam-style keyword for precheck warning testing
    scam_vpa = "support.sbi@payit"
    con.execute("INSERT OR IGNORE INTO accounts (user_id, bank_id, vpa, account_number, balance, account_age_days, kyc_level, is_merchant, MCC, avg_amount, usual_hours, home_device, txn_count, blacklisted, created_at, upi_pin_hash) VALUES (1, 1, ?, 'ACC888888', 500.0, 120, 'BASIC', 0, 0, 500, '7-22', 'device_pre', 0, 0, '2026-07-01T00:00:00', '16f5c2d3c9a62efd48b71d6cc44747c358ffbe382cf847d06e2098d6368d374a')",(scam_vpa,))
    
    # Ensure pin is known for the sender
    # Hash for '1234' is 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4
    pin_hash_1234 = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"
    con.execute("UPDATE accounts SET upi_pin_hash=? WHERE vpa=?", (pin_hash_1234, sender["vpa"]))
    con.commit()
    con.close()
    
    sender_vpa = sender["vpa"]
    receiver_vpa = receiver["vpa"]
    print(f"Sender: {sender_vpa} (Home device: {sender['home_device']})")
    print(f"Normal Receiver: {receiver_vpa}")
    print(f"Mule/Blacklisted VPA: {mule['vpa']}")
    print(f"New User VPA (<90 days): {new_vpa}")
    print(f"Scam Keyword VPA: {scam_vpa}")
    
    # --- TEST 1: New device ₹2,000 cap (F1) ---
    print("\n--- Test 1: New device limit check ---")
    # A: Try ₹2,500 (> ₹2,000 limit) from a NEW device
    status, data = call_api("/pay", {
        "sender_vpa": sender_vpa,
        "receiver_vpa": receiver_vpa,
        "amount": 2500.0,
        "pin": "1234",
        "device_id": "malicious_new_device"
    })
    print(f"Payment > ₹2000 from new device response status: {status}")
    print(f"Response: {data}")
    if status == 403 and "limit" in str(data.get("detail", "")):
        print("✅ SUCCESS: ₹2,000 cap enforced on new device.")
    else:
        print("❌ FAILURE: New device limit cap not enforced correctly.")

    # B: Try ₹1,500 (< ₹2,000 limit) from a NEW device (should succeed or ask OTP/pin)
    status, data = call_api("/pay", {
        "sender_vpa": sender_vpa,
        "receiver_vpa": receiver_vpa,
        "amount": 1500.0,
        "pin": "1234",
        "device_id": "malicious_new_device"
    })
    print(f"Payment < ₹2000 from new device response status: {status}")
    if status in (200, 201) or (status == 200 and data.get("result") in ("SUCCESS", "REVIEW")):
        print("✅ SUCCESS: Payment under ₹2,000 allowed from new device.")
    else:
        print(f"❌ FAILURE: Small payment from new device blocked unexpectedly: {data}")

    # --- TEST 2: Pre-payment warning check (F2) ---
    print("\n--- Test 2: Precheck warning check ---")
    # A: Check normal receiver (should have low warning/risk or no warning)
    status, data = call_api("/precheck", {
        "sender_vpa": sender_vpa,
        "receiver_vpa": receiver_vpa
    })
    print(f"Precheck Normal Payee response: {data}")
    
    # B: Check brand name / suspicious name (now registered in DB)
    status, data_brand = call_api("/precheck", {
        "sender_vpa": sender_vpa,
        "receiver_vpa": scam_vpa
    })
    print(f"Precheck Suspicious Brand VPA response: {data_brand}")
    if data_brand.get("warn") is True and any("keyword" in r for r in data_brand.get("reasons", [])):
        print("✅ SUCCESS: VPA brand name suspicious warning detected.")
    else:
        print("❌ FAILURE: VPA brand name suspicious warning missed.")
        
    # C: Check blacklisted mule
    status, data_mule = call_api("/precheck", {
        "sender_vpa": sender_vpa,
        "receiver_vpa": mule["vpa"]
    })
    print(f"Precheck Blacklisted Mule response: {data_mule}")
    if data_mule.get("warn") is True and data_mule.get("blacklisted") is True:
        print("✅ SUCCESS: Blacklisted mule warning detected.")
    else:
        print("❌ FAILURE: Blacklisted mule warning missed.")

    # --- TEST 3: Post-payment recheck & recall (F3) ---
    print("\n--- Test 3: Post-payment recheck & recall ---")
    # A: Pay new user (account age 10 days < 90 days), should be flagged for F3
    status, pay_data = call_api("/pay", {
        "sender_vpa": sender_vpa,
        "receiver_vpa": new_vpa,
        "amount": 500.0,
        "pin": "1234",
        "device_id": sender["home_device"]  # own device
    })
    print(f"Pay response: {pay_data}")
    if pay_data.get("post_review") is True:
        print("✅ SUCCESS: Payment flagged post-payment.")
        
        # B: Recall the flagged payment
        txid = pay_data.get("transaction_id")
        status, recall_data = call_api(f"/pay/recall/{txid}", {})
        print(f"Recall response: {recall_data}")
        if recall_data.get("result") == "RECALLED":
            print("✅ SUCCESS: Payment recalled & funds reversed successfully.")
        else:
            print("❌ FAILURE: Payment recall failed.")
    else:
        print("❌ FAILURE: Payment was not flagged post-payment.")

if __name__ == "__main__":
    run_tests()
