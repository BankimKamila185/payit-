"""
Payit Demo Database (SQLite) — detailed tables + realistic INDIAN dummy data.
==========================================================================
Zero-setup (SQLite, stdlib). Creates all tables (aligned with the team's
Postgres schema + the extra profile fields our ML engine needs) and seeds
realistic Indian data: names, VPAs, banks, merchants, mules, blacklist, IPs,
and a history of transactions.

Run:  python3 db/build_db.py
Out:  db/payit.db
"""

import sqlite3
import random
import hashlib
from pathlib import Path
from datetime import datetime, timedelta

random.seed(42)
HERE = Path(__file__).resolve().parent
DB = HERE / "payit.db"

# demo PINs for ALL accounts: login PIN = "1234" (4-digit), UPI PIN = "123456" (6-digit)
DEMO_LOGIN_PIN = "1234"
DEMO_UPI_PIN = "123456"
LOGIN_PIN_HASH = hashlib.sha256(DEMO_LOGIN_PIN.encode()).hexdigest()
UPI_PIN_HASH = hashlib.sha256(DEMO_UPI_PIN.encode()).hexdigest()

# ---------------------------------------------------------------- Indian data
MALE = ["Rahul", "Amit", "Vikram", "Arjun", "Rohan", "Karan", "Suresh", "Rajesh",
        "Sanjay", "Deepak", "Manish", "Ankit", "Vishal", "Nikhil", "Aditya",
        "Gaurav", "Pankaj", "Ravi", "Kunal", "Siddharth", "Harsh", "Yash"]
FEMALE = ["Priya", "Sneha", "Anjali", "Pooja", "Neha", "Divya", "Meena", "Kavya",
          "Riya", "Shreya", "Anita", "Sunita", "Nisha", "Payal", "Swati", "Aarti",
          "Rekha", "Simran", "Isha", "Tanvi", "Komal", "Ritu"]
LAST = ["Sharma", "Verma", "Patel", "Singh", "Kumar", "Gupta", "Reddy", "Nair",
        "Iyer", "Mehta", "Joshi", "Desai", "Rao", "Shah", "Chauhan", "Yadav",
        "Mishra", "Agarwal", "Bose", "Pillai", "Kapoor", "Malhotra"]

# bank name -> UPI handle
BANKS = [
    ("State Bank of India", "SBIN", "oksbi"),
    ("HDFC Bank", "HDFC", "okhdfc"),
    ("ICICI Bank", "ICIC", "okicici"),
    ("Axis Bank", "UTIB", "okaxis"),
    ("Kotak Mahindra Bank", "KKBK", "okkotak"),
    ("Punjab National Bank", "PUNB", "okpnb"),
    ("Paytm Payments Bank", "PYTM", "paytm"),
    ("PhonePe (Yes Bank)", "YESB", "ybl"),
]

MERCHANTS = [
    ("Reliance Fresh", 5411), ("DMart", 5411), ("Big Bazaar", 5411),
    ("Apollo Pharmacy", 8062), ("MedPlus", 8062), ("Fortis Hospital", 8062),
    ("Zomato", 5814), ("Swiggy", 5814), ("Dominos", 5814),
    ("Amazon India", 5399), ("Flipkart", 5399), ("Croma", 5732),
    ("BookMyShow", 7832), ("IRCTC", 4112), ("Uber India", 4121),
    ("Airtel", 4814), ("Jio Recharge", 4814), ("Tanishq Jewellers", 5944),
    ("Kalyan Jewellers", 5944), ("Indian Oil Petrol", 5541),
]

FRAUD_REASONS = ["phishing scam", "money mule", "OTP fraud", "fake KYC",
                 "investment scam", "loan app extortion"]


def vpa(name, handle, i):
    return f"{name.lower()}{i}@{handle}"


def build():
    if DB.exists():
        DB.unlink()
    con = sqlite3.connect(DB)
    c = con.cursor()

    # ------------------------------------------------------------ SCHEMA
    c.executescript("""
    CREATE TABLE banks (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL,
        ifsc_prefix TEXT UNIQUE, upi_handle TEXT
    );
    CREATE TABLE users (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE,
        email TEXT, created_at TEXT
    );
    CREATE TABLE accounts (
        id INTEGER PRIMARY KEY, user_id INTEGER, bank_id INTEGER,
        vpa TEXT UNIQUE, account_number TEXT, balance REAL,
        account_age_days INTEGER, kyc_level TEXT,        -- BASIC/VIDEO/CORPORATE
        is_merchant INTEGER, mcc INTEGER,
        avg_amount REAL, usual_hours TEXT,               -- "7-22"
        home_device TEXT, txn_count INTEGER, blacklisted INTEGER,
        created_at TEXT, upi_pin_hash TEXT, login_pin_hash TEXT, -- hashed PINs
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(bank_id) REFERENCES banks(id)
    );
    CREATE TABLE devices (
        id INTEGER PRIMARY KEY, user_id INTEGER,
        device_fingerprint TEXT, status TEXT DEFAULT 'active',
        binding_age_days INTEGER, is_rooted INTEGER DEFAULT 0,
        os_info TEXT, ip_address TEXT, created_at TEXT
    );
    CREATE TABLE transactions (
        id INTEGER PRIMARY KEY, txn_ref TEXT, sender_account_id INTEGER, receiver_account_id INTEGER,
        amount REAL, type TEXT, channel TEXT, status TEXT,
        ip_address TEXT, device_id INTEGER, hour INTEGER,
        score INTEGER, label TEXT, reasons TEXT, created_at TEXT
    );
    CREATE TABLE fraud_scores (
        id INTEGER PRIMARY KEY, transaction_id INTEGER,
        cumulative_score INTEGER, label TEXT, created_at TEXT
    );
    CREATE TABLE alerts (
        id INTEGER PRIMARY KEY, transaction_id INTEGER,
        status TEXT DEFAULT 'open', severity TEXT, created_at TEXT
    );
    CREATE TABLE blacklist (
        id INTEGER PRIMARY KEY, entity_type TEXT, entity_value TEXT,
        reason TEXT, created_at TEXT
    );
    CREATE TABLE ip_reputation (
        id INTEGER PRIMARY KEY, ip_address TEXT UNIQUE,
        reputation_score INTEGER, is_blacklisted INTEGER
    );
    CREATE TABLE sessions (
        id INTEGER PRIMARY KEY, user_id INTEGER, device_id INTEGER,
        token TEXT, expires_at TEXT, created_at TEXT
    );
    CREATE TABLE otp_verifications (
        id INTEGER PRIMARY KEY, user_id INTEGER, code TEXT,
        status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0,
        expires_at TEXT, created_at TEXT
    );
    CREATE TABLE fraud_reports (
        id INTEGER PRIMARY KEY, reported_vpa TEXT, reporter_vpa TEXT,
        reason TEXT, amount_lost REAL, status TEXT DEFAULT 'reported', created_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_sender_created_at ON transactions(sender_account_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_receiver_created_at ON transactions(receiver_account_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_otp_verifications_user_pending ON otp_verifications(user_id, status) WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS idx_blacklist_lookup ON blacklist(entity_type, entity_value);
    """)

    now = datetime(2026, 7, 1, 12, 0, 0)
    ts = lambda days=0: (now - timedelta(days=days)).isoformat()

    # ------------------------------------------------------------ BANKS
    for i, (name, ifsc, handle) in enumerate(BANKS, 1):
        c.execute("INSERT INTO banks VALUES (?,?,?,?)", (i, name, ifsc, handle))

    accounts = []          # (acc_id, vpa, is_merchant, blacklisted)
    acc_id = 0
    user_id = 0

    # ------------------------------------------------------------ USERS + ACCOUNTS
    N_USERS = 200
    for _ in range(N_USERS):
        user_id += 1
        first = random.choice(MALE + FEMALE)
        name = f"{first} {random.choice(LAST)}"
        phone = "9" + "".join(random.choice("0123456789") for _ in range(9))
        email = f"{first.lower()}{random.randint(1,999)}@gmail.com"
        c.execute("INSERT INTO users VALUES (?,?,?,?,?)",
                  (user_id, name, phone, email, ts(random.randint(30, 1500))))

        bank_i = random.randint(1, len(BANKS))
        handle = BANKS[bank_i - 1][2]
        acc_id += 1
        # ~10% fresh accounts (potential mules), ~3% blacklisted
        age = random.randint(1, 20) if random.random() < 0.10 else random.randint(60, 1800)
        black = 1 if random.random() < 0.03 else 0
        avg = random.choice([500, 1000, 2000, 5000, 12000])
        sh = random.randint(6, 10); eh = random.randint(20, 23)
        accounts.append((acc_id, vpa(first, handle, user_id), 0, black))
        c.execute("""INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
            acc_id, user_id, bank_i, vpa(first, handle, user_id),
            f"XXXX{random.randint(1000,9999)}", round(random.uniform(2000, 250000), 2),
            age, random.choice(["BASIC", "VIDEO", "CORPORATE"]),
            0, 0, avg, f"{sh}-{eh}", f"dev_{user_id:04d}",
            random.randint(0, 200), black, ts(age), UPI_PIN_HASH, LOGIN_PIN_HASH))

    # ------------------------------------------------------------ MERCHANTS
    for mname, mcc in MERCHANTS:
        user_id += 1
        c.execute("INSERT INTO users VALUES (?,?,?,?,?)",
                  (user_id, mname, "8" + "".join(random.choice("0123456789") for _ in range(9)),
                   None, ts(random.randint(200, 2000))))
        bank_i = random.randint(1, len(BANKS)); handle = BANKS[bank_i - 1][2]
        acc_id += 1
        slug = mname.lower().replace(" ", "")[:12]
        accounts.append((acc_id, f"{slug}@{handle}", 1, 0))
        c.execute("""INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
            acc_id, user_id, bank_i, f"{slug}@{handle}",
            f"XXXX{random.randint(1000,9999)}", round(random.uniform(50000, 5000000), 2),
            random.randint(200, 2500), "CORPORATE", 1, mcc,
            random.choice([200, 500, 1500]), "0-23", f"mdev_{user_id:04d}",
            random.randint(500, 5000), 0, ts(500), UPI_PIN_HASH, LOGIN_PIN_HASH))

    # ------------------------------------------------------------ FIXED DEMO ACCOUNTS
    # Known VPAs the frontend uses (so the demo is repeatable + relatable).
    DEMO = [  # vpa, name, is_merchant, age, blacklisted, balance, avg, mcc
        ("bankimkamila23@payit", "Bankim Kamila", 0, 400, 0, 25000, 2000, 0),
        ("priya.sharma@okhdfc", "Priya Sharma", 0, 600, 0, 60000, 1800, 0),
        ("reliancefresh.store@okaxis", "Reliance Fresh Store", 1, 900, 0, 800000, 500, 5411),
        ("quickcash777@okpnb", "Ramesh Kumar", 0, 4, 1, 300, 1000, 0),   # MULE (fresh + blacklist)
    ]
    for vpa_, name_, ism, age_, black_, bal_, avg_, mcc_ in DEMO:
        user_id += 1
        c.execute("INSERT INTO users VALUES (?,?,?,?,?)",
                  (user_id, name_, "7" + "".join(random.choice("0123456789") for _ in range(9)), None, ts(age_)))
        bank_i = random.randint(1, len(BANKS)); acc_id += 1
        accounts.append((acc_id, vpa_, ism, black_))
        c.execute("INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            acc_id, user_id, bank_i, vpa_, f"XXXX{random.randint(1000,9999)}", bal_,
            age_, "CORPORATE" if ism else "VIDEO", ism, mcc_, avg_,
            "6-23" if ism else "7-22", f"demodev_{acc_id}",
            2000 if ism else 100, black_, ts(age_), UPI_PIN_HASH, LOGIN_PIN_HASH))
        if black_:
            c.execute("INSERT INTO blacklist (entity_type, entity_value, reason, created_at) VALUES (?,?,?,?)",
                      ("account", vpa_, "money mule", ts(2)))

    # ------------------------------------------------------------ DEVICES
    device_of_account = {}          # account_id -> device row id (for txn linkage)
    dev_row = 0
    c.execute("SELECT id, user_id, home_device, created_at FROM accounts")
    for aid, uid, hdev, cat in c.fetchall():
        dev_row += 1
        c.execute("INSERT INTO devices (id, user_id, device_fingerprint, status, binding_age_days, is_rooted, os_info, ip_address, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                  (dev_row, uid, hdev, "active", random.randint(30, 800), 0,
                   random.choice(["Android 13", "iOS 17", "Chrome/Win", "Chrome/Mac"]),
                   f"49.36.{random.randint(0,255)}.{random.randint(1,254)}", cat))
        device_of_account[aid] = dev_row

    # ------------------------------------------------------------ BLACKLIST
    for aid, v, ism, black in accounts:
        if black:
            c.execute("INSERT INTO blacklist (entity_type, entity_value, reason, created_at) VALUES (?,?,?,?)",
                      ("account", v, random.choice(FRAUD_REASONS), ts(random.randint(1, 60))))

    # ------------------------------------------------------------ IP REPUTATION
    for _ in range(30):
        bad = random.random() < 0.3
        c.execute("INSERT OR IGNORE INTO ip_reputation (ip_address, reputation_score, is_blacklisted) VALUES (?,?,?)",
                  (f"{random.randint(1,223)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}",
                   random.randint(5, 30) if bad else random.randint(70, 100), 1 if bad else 0))

    # ------------------------------------------------------------ TRANSACTIONS (history)
    users_only = [a for a in accounts if not a[2]]
    merch_only = [a for a in accounts if a[2]]
    tx_id = 0
    hour_now = 12
    for d in range(30, 0, -1):                      # last 30 days
        for _ in range(random.randint(60, 120)):    # per-day txns
            tx_id += 1
            s = random.choice(users_only)
            if random.random() < 0.6:
                r = random.choice(merch_only); ch = random.choice(["QR", "INTENT", "MANUAL"])
            else:
                r = random.choice(users_only); ch = random.choice(["CONTACT", "MANUAL"])
                while r[0] == s[0]:
                    r = random.choice(users_only)
            amt = round(random.uniform(50, 8000), 2)
            hr = random.randint(7, 22)
            c.execute("""INSERT INTO transactions
                (id, sender_account_id, receiver_account_id, amount, type, channel,
                 status, ip_address, device_id, hour, score, label, reasons, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (tx_id, s[0], r[0], amt, "PAY", ch, "success",
                 f"49.36.{random.randint(0,255)}.{random.randint(1,254)}",
                 device_of_account[s[0]], hr,
                 random.randint(2, 25), "SAFE", None, ts(d)))

    con.commit()

    # ------------------------------------------------------------ SUMMARY
    def cnt(t): return c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    print(f"✅ Built {DB}\n")
    print("=== Tables + row counts ===")
    for t in ["banks", "users", "accounts", "devices", "transactions",
              "blacklist", "ip_reputation", "fraud_scores", "alerts",
              "sessions", "fraud_reports"]:
        print(f"  {t:<16} {cnt(t):>6}")
    print("\n=== Sample accounts (Indian) ===")
    for row in c.execute("SELECT vpa, balance, is_merchant, blacklisted, account_age_days FROM accounts LIMIT 6"):
        tag = "MERCHANT" if row[2] else ("🔴BLACKLIST" if row[3] else "user")
        print(f"  {row[0]:<28} ₹{row[1]:>12,.0f}  {tag}  (age {row[4]}d)")
    con.close()


if __name__ == "__main__":
    build()
