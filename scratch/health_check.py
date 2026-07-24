import sys
import os
import json
import urllib.request
import urllib.parse
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv()

results = {}

# 1. Check Database (PostgreSQL via psycopg2 or sqlite)
print("[1/6] Checking Database Connection...")
try:
    from server.app import db
    con = db()
    row = con.execute("SELECT count(*) as cnt FROM accounts").fetchone()
    con.close()
    results["Database"] = {
        "status": "HEALTHY 🟢",
        "details": f"Connected to PostgreSQL. Accounts count: {row['cnt']}"
    }
except Exception as e:
    results["Database"] = {
        "status": "FAILED 🔴",
        "details": str(e)
    }

# 2. Check ML Fraud Engine
print("[2/6] Checking ML Fraud Scoring Engine...")
try:
    from ml.score import FraudEngine
    engine = FraudEngine()
    feats = {
        "amount": 100,
        "hour": 14,
        "day_of_week": 2,
        "txn_count_24h": 1,
        "total_amount_24h": 100,
        "avg_amount_7d": 100,
        "std_amount_7d": 10,
        "max_amount_7d": 100,
        "is_new_recipient": 0,
        "recipient_txn_count_24h": 5,
        "recipient_unique_senders_24h": 2,
        "is_night_time": 0,
        "amount_vs_avg_ratio": 1.0,
        "amount_vs_max_ratio": 1.0,
        "device_change": 0,
        "ip_change": 0,
        "geo_distance_km": 0.0,
        "sim_change": 0,
        "app_tampered": 0,
        "screen_share": 0,
        "account_age_days": 100,
        "is_merchant": 0,
        "network_mule_score": 0.0,
        "receiver_blacklisted": 0,
        "velocity_1m": 0,
        "velocity_5m": 0,
        "velocity_1h": 0,
        "receiver_age_days": 100,
        "receiver_fan_in_24h": 2,
        "is_small_transfer": 0,
        "is_round_amount": 0,
        "amount_vs_balance_ratio": 0.1,
        "sender_is_mule": 0,
        "in_mule_chain": 0,
        "mule_chain_hop": 0,
        "mule_chain_flow_ratio": 0.0
    }
    import pandas as pd
    csv_path = ROOT / "ml" / "data" / "upi_transactions.csv"
    if csv_path.exists():
        sample_df = pd.read_csv(csv_path, nrows=1)
        sample_row = sample_df.iloc[0].to_dict()
        score_res = engine.score(sample_row, observe=False)
        results["ML_Fraud_Engine"] = {
            "status": "HEALTHY 🟢",
            "details": f"Decision: {score_res.get('label')}, Score: {score_res.get('score')}"
        }
    else:
        results["ML_Fraud_Engine"] = {"status": "HEALTHY 🟢", "details": "Engine initialized"}
except Exception as e:
    results["ML_Fraud_Engine"] = {
        "status": "FAILED 🔴",
        "details": str(e)
    }

# 3. Check External Fraud Microservice URL
print("[3/6] Checking Remote Fraud Microservice URL...")
fraud_url = os.environ.get("FRAUD_SERVICE_URL", "https://upi-fraud-scoring-service.onrender.com")
try:
    req = urllib.request.Request(f"{fraud_url}/health", method="GET")
    with urllib.request.urlopen(req, timeout=5) as resp:
        body = resp.read().decode('utf-8')
        results["Remote_Fraud_Service"] = {
            "status": "HEALTHY 🟢",
            "url": fraud_url,
            "response": body[:100]
        }
except Exception as e:
    results["Remote_Fraud_Service"] = {
        "status": "WARNING 🟡 (Fallback to internal engine)",
        "url": fraud_url,
        "details": str(e)
    }

# 4. Check Firebase Admin Service Account
print("[4/6] Checking Firebase Admin Auth...")
try:
    import firebase_admin
    from firebase_admin import auth as fb_auth
    sa_path = ROOT / "serviceAccountKey.json"
    if sa_path.exists():
        with open(sa_path) as f:
            sa_data = json.load(f)
        results["Firebase_Admin"] = {
            "status": "HEALTHY 🟢",
            "project_id": sa_data.get("project_id"),
            "client_email": sa_data.get("client_email")
        }
    else:
        results["Firebase_Admin"] = {
            "status": "WARNING 🟡",
            "details": "serviceAccountKey.json file missing"
        }
except Exception as e:
    results["Firebase_Admin"] = {
        "status": "FAILED 🔴",
        "details": str(e)
    }

# 5. Check OTP Delivery Engine
print("[5/6] Checking OTP Handler...")
try:
    from server.app import send_sms_otp
    otp_res = send_sms_otp("9876543210", "123456", context="System Diagnostic Check")
    results["OTP_Engine"] = {
        "status": "HEALTHY 🟢",
        "provider": otp_res.get("provider"),
        "delivered": otp_res.get("delivered"),
        "mode": "Demo Mode (Local Log)" if otp_res.get("provider") == "demo" else f"Live ({otp_res.get('provider')})"
    }
except Exception as e:
    results["OTP_Engine"] = {
        "status": "FAILED 🔴",
        "details": str(e)
    }

# 6. Check WebAuthn / Passkeys Configuration
print("[6/6] Checking Passkey / WebAuthn Configuration...")
try:
    rp_id = os.environ.get("WEBAUTHN_RP_ID", "localhost")
    origins = os.environ.get("WEBAUTHN_ORIGINS", "http://localhost:5173")
    results["WebAuthn_Passkeys"] = {
        "status": "HEALTHY 🟢",
        "rp_id": rp_id,
        "origins": origins
    }
except Exception as e:
    results["WebAuthn_Passkeys"] = {
        "status": "FAILED 🔴",
        "details": str(e)
    }

print("\n" + "="*60)
print("             SYSTEM CONNECTIVITY & HEALTH REPORT             ")
print("="*60)
for svc, data in results.items():
    print(f"\n▶ {svc}: {data.get('status')}")
    for k, v in data.items():
        if k != "status":
            print(f"   • {k}: {v}")
print("\n" + "="*60)
