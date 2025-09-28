#!/usr/bin/env python3

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

TABLES = [
    ("organizations", "brkr_organizations"),
    ("offices", "brkr_offices"),
    ("people", "brkr_people"),
    ("employments", "brkr_employments"),
    ("teams", "brkr_teams"),
    ("team_offices", "brkr_team_offices"),
    ("team_memberships", "brkr_team_memberships"),
    ("dba_names", "brkr_dba_names"),
    ("org_addresses", "brkr_org_addresses"),
]


def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    print("🔎 Checking for unprefixed brokers_alt tables…")
    cur.execute(
        """
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public'
        """
    )
    have = {r[0] for r in cur.fetchall()}

    for old, new in TABLES:
        if old in have and new not in have:
            print(f"🔁 Renaming {old} → {new}")
            cur.execute(f"ALTER TABLE {old} RENAME TO {new}")
            conn.commit()
        else:
            print(f"Skip {old} (exists: {old in have}), {new} (exists: {new in have})")

    cur.close()
    conn.close()
    print("✅ Rename complete.")


if __name__ == "__main__":
    main()

