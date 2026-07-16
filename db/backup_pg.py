"""
Row-level backup / restore for the payit Postgres DB (no pg_dump needed).
========================================================================
build_db.py DROPs every table before recreating it. Against a cloud DB that is
unrecoverable without a copy, so take one first:

  backup :  PYTHONPATH=. .venv/bin/python db/backup_pg.py backup
  restore:  PYTHONPATH=. .venv/bin/python db/backup_pg.py restore db/backups/<file>.json

Target DB comes from DATABASE_URL (.env), i.e. the SAME database the server uses.
Restore recreates the schema from build_db.py's SCHEMA, then reinserts every row
and resyncs the SERIAL sequences.

The dump holds PIN *hashes* (Argon2id), never plaintext — but it is still account
data, so db/backups/ is gitignored. Don't commit it.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DSN = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/payit")
BACKUP_DIR = Path(__file__).resolve().parent / "backups"

# Parent-first, so FK references resolve on restore.
TABLES = ["banks", "users", "accounts", "devices", "transactions", "fraud_scores",
          "alerts", "blacklist", "ip_reputation", "sessions", "otp_verifications",
          "fraud_reports", "security_lockouts", "webauthn_credentials"]


def _safe(dsn: str) -> str:
    return re.sub(r"//[^@]*@", "//***:***@", dsn)


def backup():
    BACKUP_DIR.mkdir(exist_ok=True)
    con = psycopg2.connect(DSN)
    cur = con.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    out = {"_dsn": _safe(DSN), "_taken_at": datetime.now().isoformat(), "tables": {}}

    for t in TABLES:
        try:
            cur.execute(f"SELECT * FROM {t}")
        except psycopg2.Error:
            con.rollback()
            print(f"  {t:24} -- absent, skipped")
            continue
        rows = [dict(r) for r in cur.fetchall()]
        # datetime/Decimal aren't JSON-native; str() round-trips fine through psycopg2
        for r in rows:
            for k, v in r.items():
                if not isinstance(v, (str, int, float, bool, type(None))):
                    r[k] = str(v)
        out["tables"][t] = rows
        print(f"  {t:24} {len(rows):>6} rows")

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = BACKUP_DIR / f"neon_{stamp}.json"
    path.write_text(json.dumps(out, indent=1))
    total = sum(len(v) for v in out["tables"].values())
    print(f"\nBacked up {total} rows from {_safe(DSN)}\n  -> {path}")
    con.close()
    return path


def restore(path: str):
    data = json.loads(Path(path).read_text())
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from db.build_db import SCHEMA          # build_db owns the canonical schema

    con = psycopg2.connect(DSN)
    cur = con.cursor()
    print(f"Restoring into {_safe(DSN)} (taken from {data.get('_dsn')} at {data.get('_taken_at')})")
    cur.execute(SCHEMA)
    con.commit()

    total = 0
    for t in TABLES:
        rows = data["tables"].get(t) or []
        if not rows:
            print(f"  {t:24} {0:>6} rows")
            continue
        cols = list(rows[0].keys())
        collist = ", ".join(f'"{c}"' for c in cols)
        psycopg2.extras.execute_values(
            cur, f"INSERT INTO {t} ({collist}) VALUES %s",
            [tuple(r[c] for c in cols) for r in rows], page_size=500)
        con.commit()
        if "id" in cols:
            cur.execute(f"SELECT setval(pg_get_serial_sequence('{t}', 'id'), "
                        f"COALESCE((SELECT MAX(id) FROM {t}), 1))")
            con.commit()
        print(f"  {t:24} {len(rows):>6} rows")
        total += len(rows)
    print(f"\nRestored {total} rows.")
    con.close()


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "backup"
    if mode == "backup":
        backup()
    elif mode == "restore":
        if len(sys.argv) < 3:
            raise SystemExit("usage: backup_pg.py restore <path-to-json>")
        restore(sys.argv[2])
    else:
        raise SystemExit("usage: backup_pg.py [backup | restore <file>]")
