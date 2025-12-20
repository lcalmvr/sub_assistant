from __future__ import annotations

import os
from dotenv import load_dotenv
load_dotenv()  # this will read .env into os.environ

from contextlib import contextmanager
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine


DATABASE_URL = os.environ["DATABASE_URL"]

engine: Engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,   # checks connections before use
    pool_size=5,          # max open connections
    max_overflow=5,       # extra if burst needed
    pool_recycle=1800,    # recycle every 30 mins
)

@contextmanager
def get_conn():
    """Get a database connection with proper transaction support.

    Uses engine.begin() which auto-commits on successful exit
    and rolls back on exception. Explicit conn.commit() calls
    in code are no longer needed but won't cause errors.
    """
    with engine.begin() as conn:
        yield conn

def fetch_df(sql: str, params: dict | None = None, limit: int | None = None):
    import pandas as pd
    if limit is not None and ":limit" not in sql:
        sql = f"{sql.rstrip(';')} LIMIT :limit"
        params = {**(params or {}), "limit": limit}
    with get_conn() as conn:
        return pd.read_sql(text(sql), conn, params=params or {})
