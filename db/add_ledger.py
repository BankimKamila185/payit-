"""Additive migration: create ledger_entries and seed GENESIS entries.

Safe to run on a live DB and safe to run twice (idempotent):
  - CREATE TABLE IF NOT EXISTS (nothing dropped, no existing data touched)
  - genesis entries are written only if the table is empty

Genesis: every existing account already has a balance but no ledger history, so
the invariant "balance == SUM(entries)" would fail. We fix that by posting one
opening pair per account against the "@world" account (id 0): world -B, account +B.
After this, SUM(entries for an account) == its balance, and it stays true because
every future transfer also nets to zero.

Run:  DATABASE_URL=... .venv/bin/python db/add_ledger.py
"""
from __future__ import annotations
import os
from datetime import datetime

import psycopg2
import psycopg2.extras

DDL = """
CREATE TABLE IF NOT EXISTS ledger_entries (
    id SERIAL PRIMARY KEY,
    transfer_id TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    amount NUMERIC(16,2) NOT NULL,
    balance_after NUMERIC(16,2),
    reverses_transfer_id TEXT,
    kind TEXT NOT NULL DEFAULT 'transfer',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_account  ON ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transfer ON ledger_entries(transfer_id);
"""


def main():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL not set")
    host = dsn.split("@")[-1].split("/")[0]
    con = psycopg2.connect(dsn)
    cur = con.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(DDL)
    con.commit()

    cur.execute("SELECT COUNT(*) c FROM ledger_entries")
    if cur.fetchone()["c"] > 0:
        print(f"  host: {host}\n  ledger_entries already seeded — skipping genesis")
        con.close()
        return

    now = datetime.now().isoformat()
    cur.execute("SELECT id, vpa, balance FROM accounts ORDER BY id")
    accts = cur.fetchall()
    rows = []
    for a in accts:
        bal = round(float(a["balance"] or 0), 2)
        tid = f"genesis:{a['id']}"
        # world -B, account +B  -> sums to zero
        rows.append((tid, 0, -bal, None, None, "genesis", now))
        rows.append((tid, a["id"], bal, bal, None, "genesis", now))
    psycopg2.extras.execute_values(
        cur,
        """INSERT INTO ledger_entries
           (transfer_id, account_id, amount, balance_after, reverses_transfer_id, kind, created_at)
           VALUES %s""",
        rows, page_size=500)
    con.commit()

    # verify invariant immediately
    cur.execute("""SELECT a.id, a.balance, COALESCE(SUM(l.amount),0) s
                   FROM accounts a LEFT JOIN ledger_entries l ON l.account_id=a.id
                   GROUP BY a.id, a.balance
                   HAVING ROUND(a.balance::numeric,2) <> COALESCE(SUM(l.amount),0)""")
    bad = cur.fetchall()
    cur.execute("SELECT COUNT(*) c FROM ledger_entries")
    n = cur.fetchone()["c"]
    cur.execute("SELECT COALESCE(SUM(amount),0) s FROM ledger_entries")
    world_sum = cur.fetchone()["s"]
    print(f"  host          : {host}")
    print(f"  accounts      : {len(accts)}")
    print(f"  ledger entries: {n}  (2 per account)")
    print(f"  SUM(all entries) = {world_sum}  (must be 0)")
    print(f"  balance != SUM(entries): {len(bad)} accounts  {'✅ invariant holds' if not bad and world_sum == 0 else '🔴 MISMATCH'}")
    con.close()


if __name__ == "__main__":
    main()
