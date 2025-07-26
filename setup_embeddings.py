import psycopg2
from pgvector.psycopg2 import register_vector
import os

# Connect to the DB
conn = psycopg2.connect(os.getenv("DATABASE_URL"))
register_vector(conn)

cur = conn.cursor()

# Create extension and column
cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
cur.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS embedding vector(1536);")

conn.commit()
cur.close()
conn.close()

print("Embedding column added successfully.")

