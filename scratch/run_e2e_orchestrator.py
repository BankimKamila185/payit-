import subprocess
import time
import urllib.request
import urllib.error
import json
import sqlite3
import hashlib
from pathlib import Path

URL = "http://localhost:3000"
ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "db" / "payit.db"

def call_api(path, body=None, method="POST"):
    data_bytes = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(
        f"{URL}{path}",
        data=data_bytes,
        headers={"Content-Type": "application/json"} if body is not None else {},
        method=method
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode('utf-8'))
        except Exception:
            return e.code, e.reason

def clear_db_txns(with_history=False):
    con = sqlite3.connect(DB_PATH)
    con.execute("DELETE FROM transactions")
    con.execute("DELETE FROM alerts")
    if with_history:
        con.execute("""
            INSERT INTO transactions 
            (txn_ref, sender_account_id, receiver_account_id, amount, type, channel, status, label, score, reasons, ip_address, created_at)
            VALUES 
            ('999999999999', 221, 2, 100.0, 'PAY', 'CONTACT', 'success', 'SAFE', 0, '[]', '0.0.0.0', '2026-07-12T00:00:00')
        """)
    con.commit()
    con.close()

def start_server():
    p = subprocess.Popen(
        [str(ROOT / ".venv" / "bin" / "python"), "-m", "uvicorn", "server.app:app", "--port", "3000"],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    for _ in range(20):
        time.sleep(0.3)
        try:
            req = urllib.request.Request(f"{URL}/health")
            with urllib.request.urlopen(req, timeout=0.5) as r:
                if r.status == 200:
                    break
        except Exception:
            pass
    return p

def run_orchestrated_tests():
    print("==================================================")
    print("🧪 RUNNING ORCHESTRATED E2E CHECKLIST SUITE")
    print("==================================================")
    
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    sender_row = con.execute("SELECT id, user_id FROM accounts WHERE vpa='bankimkamila23@payit'").fetchone()
    sender_uid = sender_row["user_id"]
    pin_hash_1234 = hashlib.sha256("1234".encode()).hexdigest()
    
    # Set avg_amount to 400.0 so paying 2000.0 is exactly 5x (triggers amount_spike_mid +20)
    con.execute("UPDATE accounts SET upi_pin_hash=?, balance=23650.0, avg_amount=400.0 WHERE vpa='bankimkamila23@payit'", (pin_hash_1234,))
    con.execute("UPDATE accounts SET upi_pin_hash=?, balance=168163.29, account_age_days=4 WHERE vpa='kavya57@okhdfc'", (pin_hash_1234,))
    con.execute("UPDATE accounts SET blacklisted=1 WHERE vpa='quickcash777@okpnb'")
    con.execute("UPDATE accounts SET blacklisted=0 WHERE vpa='ravi2@okpnb'")
    con.execute("DELETE FROM blacklist WHERE entity_value='ravi2@okpnb'")
    con.execute("DELETE FROM devices WHERE user_id=? OR device_fingerprint='dev_trusted_user'", (sender_uid,))
    con.execute("INSERT INTO devices (user_id, device_fingerprint, status, binding_age_days, is_rooted) VALUES (?, 'dev_trusted_user', 'active', 10, 0)", (sender_uid,))
    con.execute("UPDATE accounts SET home_device='dev_trusted_user' WHERE vpa='bankimkamila23@payit'")
    con.commit()
    con.close()

    results = {}

    # BLOCK 1: Auth & Core Payments
    print("\n[BLOCK 1] Running Auth & Core Payments...")
    srv = start_server()
    try:
        st, data = call_api("/auth/login", {"vpa": "bankimkamila23@payit", "pin": "1234", "device_id": "dev_trusted_user"})
        results["1A. Correct VPA + PIN Login"] = (st == 200 and data.get("balance") == 23650.0, f"Status: {st}, User: {data.get('name')}")
        
        st, data = call_api("/auth/login", {"vpa": "bankimkamila23@payit", "pin": "9999"})
        results["1B. Incorrect PIN Login"] = (st == 401, f"Status: {st}, Data: {data}")

        clear_db_txns(with_history=True)
        st, data = call_api("/pay", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "ravi2@okpnb", "amount": 500.0, "pin": "1234", "device_id": "dev_trusted_user"})
        results["2A. SAFE Payment (small amount)"] = (st in (200, 201) and data.get("result") == "SUCCESS", f"Result: {data.get('result')}, Balance: {data.get('sender_balance')}")

        clear_db_txns(with_history=True)
        st, data = call_api("/pay", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "quickcash777@okpnb", "amount": 500.0, "pin": "1234", "device_id": "dev_trusted_user"})
        results["2B. BLOCK Payment (blacklisted mule)"] = (st in (200, 201) and data.get("result") == "BLOCKED", f"Result: {data.get('result')}, Msg: {data.get('message')}")
    finally:
        srv.terminate()
        srv.wait()

    # BLOCK 2: REVIEW / OTP & Device Limits
    print("\n[BLOCK 2] Running REVIEW & F1 Device Limit tests...")
    srv = start_server()
    try:
        # For 2C (REVIEW), we use: first-time payee + new receiver (4 days old) + ₹2,000 + screen_share=0 + new device.
        # This will trigger rule score:
        # - first_time_payee (+15)
        # - new_receiver (+15)
        # - amount_spike_mid (+20) (2000.0 / 400.0 = 5.0x usual)
        # - new_device (+25)
        # Total rule score = 75. Since 75 >= 55, it escalates to 50 (REVIEW) automatically.
        # Model score will stay low (since screen_share=0), preventing BLOCK escalation.
        clear_db_txns(with_history=False)
        st, data = call_api("/pay", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "kavya57@okhdfc", "amount": 2000.0, "pin": "1234", "device_id": "fresh_new_device", "screen_share": 0})
        results["2C. REVIEW Payment (OTP Triggered)"] = (st in (200, 201) and data.get("result") == "REVIEW" and "otp_demo" in data, f"Result: {data.get('result')}, Details: {data}")

        clear_db_txns(with_history=True)
        st, data = call_api("/pay", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "ravi2@okpnb", "amount": 1500.0, "pin": "1234", "device_id": "fresh_new_device"})
        results["3A. New Device Under Limit"] = (st in (200, 201) and data.get("result") in ("SUCCESS", "REVIEW"), f"Status: {st}, Result: {data.get('result')}")

        clear_db_txns(with_history=True)
        st, data = call_api("/pay", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "ravi2@okpnb", "amount": 5000.0, "pin": "1234", "device_id": "fresh_new_device"})
        results["3B. New Device Over Limit (Rejected)"] = (st == 403 and "₹2,000 limit" in str(data.get("detail", "")), f"Status: {st}, Msg: {data.get('detail')}")

        clear_db_txns(with_history=True)
        st, data = call_api("/pay", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "ravi2@okpnb", "amount": 5000.0, "pin": "1234", "device_id": "dev_trusted_user"})
        results["3C. Trusted Device Over Limit (Allowed)"] = (st in (200, 201) and data.get("result") in ("SUCCESS", "REVIEW"), f"Status: {st}, Result: {data.get('result')}")
    finally:
        srv.terminate()
        srv.wait()

    # BLOCK 3: F2 Precheck & F3 Recall
    print("\n[BLOCK 3] Running F2 Precheck & F3 Recall tests...")
    srv = start_server()
    try:
        st, data = call_api("/precheck", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "quickcash777@okpnb"})
        results["4A. Precheck Blacklisted warning"] = (data.get("warn") is True and "blacklist" in "".join(data.get("reasons", [])).lower(), f"Reasons: {data.get('reasons')}")

        st, data = call_api("/precheck", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "kavya57@okhdfc"})
        results["4B. Precheck New Account warning"] = (data.get("warn") is True and "new account" in "".join(data.get("reasons", [])).lower(), f"Reasons: {data.get('reasons')}")

        con = sqlite3.connect(DB_PATH)
        con.execute("INSERT OR IGNORE INTO transactions (txn_ref, sender_account_id, receiver_account_id, amount, type, channel, status, ip_address, created_at) VALUES ('999999999999', 221, 2, 100.0, 'PAY', 'CONTACT', 'success', '0.0.0.0', '2026-07-12T00:00:00')")
        con.commit()
        con.close()
        st, data = call_api("/precheck", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "ravi2@okpnb"})
        results["4C. Precheck Normal Contact"] = (data.get("warn") is False, f"Warn: {data.get('warn')}, Reasons: {data.get('reasons')}")

        clear_db_txns(with_history=True)
        st, pay_data = call_api("/pay", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "kavya57@okhdfc", "amount": 500.0, "pin": "1234", "device_id": "dev_trusted_user"})
        if pay_data.get("post_review") is True:
            txid = pay_data.get("transaction_id")
            st, recall_data = call_api(f"/pay/recall/{txid}", {}, method="POST")
            results["5. Post-Payment Flagged & Recalled"] = (recall_data.get("result") == "RECALLED", f"Message: {recall_data.get('message')}")
        else:
            results["5. Post-Payment Flagged & Recalled"] = (False, f"Not post_review flagged: {pay_data}")

        clear_db_txns(with_history=True)
        st, p_data = call_api("/pay", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "ravi2@okpnb", "amount": 100.0, "pin": "1234", "device_id": "dev_trusted_user"})
        st, r_data = call_api("/report", {"reported_vpa": "ravi2@okpnb", "reporter_vpa": "bankimkamila23@payit", "reason": "fraud"})
        st, p2_data = call_api("/pay", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "ravi2@okpnb", "amount": 100.0, "pin": "1234", "device_id": "dev_trusted_user"})
        results["6. Report payee -> Auto-Blocked on next payment"] = (p2_data.get("result") == "BLOCKED" and "blacklist" in "".join(p2_data.get("reasons", [])).lower(), f"Result: {p2_data.get('result')}, Reasons: {p2_data.get('reasons')}")
    finally:
        con = sqlite3.connect(DB_PATH)
        con.execute("UPDATE accounts SET blacklisted=0 WHERE vpa='ravi2@okpnb'")
        con.execute("DELETE FROM blacklist WHERE entity_value='ravi2@okpnb'")
        con.commit()
        con.close()
        srv.terminate()
        srv.wait()

    # BLOCK 4: Edge Cases, History, Lockout
    print("\n[BLOCK 4] Running Edge Cases & Lockout tests...")
    srv = start_server()
    try:
        clear_db_txns(with_history=True)
        st, data = call_api("/pay", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "bankimkamila23@payit", "amount": 100.0, "pin": "1234"})
        results["7A. Pay own VPA (Rejected)"] = (st == 400 and "cannot pay" in str(data.get("detail", "")), f"Status: {st}, Msg: {data}")

        clear_db_txns(with_history=True)
        st, data = call_api("/pay", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "kavya57@okhdfc", "amount": 150000.0, "pin": "1234"})
        results["7B. Amount > UPI Cap (Rejected)"] = (st == 400 and "insufficient" in str(data.get("detail", "")).lower(), f"Status: {st}, Msg: {data}")

        clear_db_txns(with_history=True)
        st, data = call_api("/pay", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "kavya57@okhdfc", "amount": 100.0, "pin": ""})
        results["7C. Empty PIN (Rejected)"] = (st == 401 and "invalid UPI PIN" in str(data.get("detail", "")), f"Status: {st}, Msg: {data}")

        clear_db_txns(with_history=True)
        st, data = call_api(f"/transactions/bankimkamila23@payit", method="GET")
        results["8. Real Data Transactions list check"] = (st == 200 and isinstance(data, list) and len(data) > 0, f"Status: {st}, Transaction Count: {len(data)}")

        clear_db_txns(with_history=True)
        call_api("/pay", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "ravi2@okpnb", "amount": 10.0, "pin": "wrong", "device_id": "dev_trusted_user"})
        call_api("/pay", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "ravi2@okpnb", "amount": 10.0, "pin": "wrong", "device_id": "dev_trusted_user"})
        st, d = call_api("/pay", {"sender_vpa": "bankimkamila23@payit", "receiver_vpa": "ravi2@okpnb", "amount": 10.0, "pin": "wrong", "device_id": "dev_trusted_user"})
        results["1C. 3 Incorrect PINs Account Lockout"] = (st == 423 and "lock" in str(d.get("detail", "")).lower(), f"Status: {st}, Msg: {d}")
    finally:
        con = sqlite3.connect(DB_PATH)
        con.execute("UPDATE accounts SET avg_amount=2000.0 WHERE vpa='bankimkamila23@payit'")
        con.commit()
        con.close()
        srv.terminate()
        srv.wait()

    print("\n" + "="*80)
    print(f"{'E2E TEST CHECKLIST SCENARIO':<50}{'STATUS':<15}DETAILS")
    print("="*80)
    passed_cnt = 0
    for name, (ok, detail) in sorted(results.items()):
        status_str = "🟢 PASS" if ok else "🔴 FAIL"
        if ok: passed_cnt += 1
        print(f"{name:<50}{status_str:<15}{detail}")
    print("="*80)
    print(f"PASSED SCENARIOS: {passed_cnt}/{len(results)}")
    print("="*80)

if __name__ == "__main__":
    run_orchestrated_tests()
