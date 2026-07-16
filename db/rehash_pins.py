"""
Upgrade legacy PIN hashes -> Argon2id + pepper (PostgreSQL).
============================================================
The seeded demo accounts were stored as unsalted sha256(PIN), which for a
4-6 digit PIN is a ~10k-1M entry rainbow table (i.e. instantly reversible).
This re-hashes every legacy hash with the same Argon2id+pepper scheme the
server now uses, so no weak hash is left sitting in the database.

The server still *verifies* legacy hashes (and upgrades them on next login),
so this script is belt-and-braces — run it to clean the DB in one shot.

Run:  PYTHONPATH=. .venv/bin/python db/rehash_pins.py
Env:  PAYIT_PIN_PEPPER must match the server's (same default if unset).
"""
from __future__ import annotations
import hashlib
import os
import sys

import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server.app import hash_pin, pin_needs_rehash  # reuse the exact server scheme

PG_DSN = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/payit")

# Known demo PINs the seed data was built with. A hash is only rewritten if it
# matches one of these — we can't invent a plaintext we don't know.
KNOWN_PINS = ["1234", "123456"]


def _sha256(p: str) -> str:
    return hashlib.sha256(p.encode()).hexdigest()


def main():
    legacy_map = {_sha256(p): p for p in KNOWN_PINS}
    con = psycopg2.connect(PG_DSN)
    cur = con.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, vpa, upi_pin_hash, login_pin_hash FROM accounts")
    rows = cur.fetchall()

    upgraded = skipped = unknown = 0
    for r in rows:
        updates, params = [], []
        for col in ("upi_pin_hash", "login_pin_hash"):
            stored = r[col]
            if not stored or not pin_needs_rehash(stored):
                continue                       # already Argon2id (or empty)
            plain = legacy_map.get(stored)
            if not plain:
                unknown += 1                   # legacy hash of an unknown PIN
                continue
            updates.append(f"{col}=%s")
            params.append(hash_pin(plain))
        if updates:
            params.append(r["id"])
            cur.execute(f"UPDATE accounts SET {', '.join(updates)} WHERE id=%s", params)
            upgraded += 1
        else:
            skipped += 1
    con.commit()

    cur.execute("SELECT COUNT(*) c FROM accounts WHERE upi_pin_hash LIKE '$argon2%%'")
    argon_count = cur.fetchone()["c"]
    cur.execute("SELECT COUNT(*) c FROM accounts WHERE upi_pin_hash IS NOT NULL AND upi_pin_hash <> '' AND upi_pin_hash NOT LIKE '$argon2%%'")
    weak_left = cur.fetchone()["c"]

    print(f"accounts scanned : {len(rows)}")
    print(f"upgraded         : {upgraded}")
    print(f"already Argon2id : {skipped}")
    print(f"unknown-PIN legacy hashes left: {unknown}  (can't rehash without the plaintext)")
    print(f"\nupi_pin_hash now Argon2id : {argon_count}")
    print(f"upi_pin_hash still weak    : {weak_left}")

    cur.close()
    con.close()


if __name__ == "__main__":
    main()
