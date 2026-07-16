"""Additive migration: create the idempotency_keys table.

Safe to run against a live database and safe to run twice. It only ever CREATEs
— nothing is dropped, altered, or backfilled, so existing data cannot be touched.
(db/build_db.py starts with DROP TABLE and would wipe the DB; this exists so the
table can be added without that.)

Run:  DATABASE_URL=... .venv/bin/python db/add_idempotency.py
"""
from __future__ import annotations
import os
import sys

import psycopg2

DDL = """
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    response_code INTEGER,
    response_body TEXT,
    created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_user_key
    ON idempotency_keys (user_id, idempotency_key);
"""


def main():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL not set")
    host = dsn.split("@")[-1].split("/")[0]
    con = psycopg2.connect(dsn)
    cur = con.cursor()
    cur.execute(DDL)
    con.commit()

    cur.execute("SELECT COUNT(*) FROM idempotency_keys")
    n = cur.fetchone()[0]
    cur.execute("""SELECT indexname FROM pg_indexes
                   WHERE tablename='idempotency_keys' ORDER BY indexname""")
    idx = [r[0] for r in cur.fetchall()]
    print(f"  host    : {host}")
    print(f"  table   : idempotency_keys ({n} rows)")
    print(f"  indexes : {', '.join(idx)}")
    print("  ✅ created (nothing else touched)")
    cur.close()
    con.close()


if __name__ == "__main__":
    main()
