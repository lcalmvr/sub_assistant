#!/usr/bin/env python3
"""
Populate Supabase with N synthetic submissions + embeddings.
Run once via a manual cron job on Render.

ENV:
  OPENAI_API_KEY
  DATABASE_URL   (Supabase pooler URL)
"""
import os, random, json, psycopg2, faker
from datetime import datetime, timedelta
from pgvector.psycopg2 import register_vector
from openai import OpenAI

N_FAKE = 50                    # <— change if you want more/less
fake   = faker.Faker()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

INDUSTRIES = [
    "Healthcare SaaS", "E-commerce", "Fintech", "Managed Service Provider",
    "Logistics Software", "Digital Marketing Platform", "InsurTech"
]

def random_summary(name, industry):
    bullets = [
        f"* {name} provides {industry.lower()} solutions.",
        f"* Serves ~{random.randint(200,2000)} customers worldwide.",
        f"* Annual revenue ≈ ${random.randint(20,300)}M.",
        "* Platform is cloud-native; hybrid workforce.",
        "* Key exposure: sensitive PII and uptime."
    ]
    return "\n".join(bullets)

def embed(text):
    return client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
        encoding_format="float"
    ).data[0].embedding

def main():
    conn = psycopg2.connect(os.getenv("DATABASE_URL")); register_vector(conn)
    cur  = conn.cursor()

    for i in range(N_FAKE):
        name   = fake.company()
        ind    = random.choice(INDUSTRIES)
        summ   = random_summary(name, ind)
        vec    = embed(summ)

        cur.execute("""
          INSERT INTO submissions (
            broker_email, date_received, summary,
            flags, quote_ready, created_at, updated_at, embedding
          ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            fake.email(),
            datetime.utcnow() - timedelta(days=random.randint(0, 365)),
            summ,
            json.dumps({}),
            False,
            datetime.utcnow(),
            datetime.utcnow(),
            vec
        ))
        if (i+1) % 10 == 0:
            print(f"Inserted {i+1}/{N_FAKE}")

    conn.commit(); cur.close(); conn.close()
    print(f"✨ Done – {N_FAKE} synthetic submissions added.")

if __name__ == "__main__":
    main()

