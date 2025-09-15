# enable_pgvector.py

import psycopg2
import os

conn = psycopg2.connect(os.getenv("DATABASE_URL"))
cur = conn.cursor()

# Enable the pgvector extension
cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")

conn.commit()
cur.close()
conn.close()

print("pgvector extension enabled.")

