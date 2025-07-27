#!/usr/bin/env python3
import os, random, json, psycopg2, faker
from datetime import datetime, timedelta
from pgvector.psycopg2 import register_vector
from openai import OpenAI

N_FAKE = 50
fake   = faker.Faker()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
conn   = psycopg2.connect(os.getenv("DATABASE_URL")); register_vector(conn)
cur    = conn.cursor()

INDUSTRIES = [
    "Healthcare SaaS", "E-commerce", "Fintech", "Managed Service Provider",
    "Logistics Software", "Digital Marketing Platform", "InsurTech"
]
CONTROL_BULLETS = [
    "MFA enforced for all employees",
    "Nightly off-site backups with 30-day retention",
    "EDR deployed on endpoints (CrowdStrike)",
    "Quarterly phishing simulations (≥ 95 % pass)",
    "Immutable backups w/ 1-hour RPO",
    "SOC 2 Type II certified"
]

def rnd_ops(name, ind):
    return "\n".join([
        f"* {name} provides {ind.lower()} solutions.",
        f"* Serves ~{random.randint(200,2000)} customers worldwide.",
        f"* Annual revenue ≈ ${random.randint(20,300)} M.",
        "* Cloud-native platform; hybrid workforce.",
        "* Key exposure: sensitive PII and uptime."
    ])

def rnd_controls():
    return "\n".join(random.sample(CONTROL_BULLETS, 3))

def embed(txt):
    return client.embeddings.create(
        model="text-embedding-3-small",
        input=txt,
        encoding_format="float"
    ).data[0].embedding

for i in range(N_FAKE):
    name  = fake.company()
    ind   = random.choice(INDUSTRIES)
    ops   = rnd_ops(name, ind)
    ctrl  = rnd_controls()
    ops_v = embed(ops)
    ctrl_v= embed(ctrl)

    cur.execute("""
      INSERT INTO submissions (
        broker_email, date_received,
        operations_summary, security_controls_summary,
        flags, quote_ready, created_at, updated_at,
        ops_embedding, controls_embedding
      )
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, (
        fake.email(),
        datetime.utcnow() - timedelta(days=random.randint(0,365)),
        ops, ctrl,
        json.dumps({}), False,
        datetime.utcnow(), datetime.utcnow(),
        ops_v, ctrl_v
    ))
    if (i+1) % 10 == 0: print(f"Inserted {i+1}/{N_FAKE}")

conn.commit(); cur.close(); conn.close()
print("✨ Fake seeding complete.")
