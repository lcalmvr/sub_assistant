"""
Market News (v1)

DB-backed, manually curated article links + summaries to serve as:
- a team-shared underwriting resource
- a future knowledge base for AI features
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any, Optional

from sqlalchemy import text

from core.db import get_conn


def ensure_tables() -> tuple[bool, Optional[str]]:
    statements = [
        "CREATE EXTENSION IF NOT EXISTS pg_trgm",
        """
        CREATE TABLE IF NOT EXISTS market_news (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title TEXT NOT NULL,
          url TEXT,
          source TEXT,
          category TEXT NOT NULL DEFAULT 'cyber_insurance',
          published_at DATE,
          tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          summary TEXT,
          internal_notes TEXT,
          created_by TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_market_news_created_at ON market_news(created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_market_news_published_at ON market_news(published_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_market_news_category ON market_news(category)",
        "CREATE INDEX IF NOT EXISTS idx_market_news_title_trgm ON market_news USING GIN (title gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS idx_market_news_source_trgm ON market_news USING GIN (source gin_trgm_ops)",
        """
        CREATE OR REPLACE FUNCTION update_market_news_timestamp()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = now();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """,
        "DROP TRIGGER IF EXISTS market_news_updated_at ON market_news",
        """
        CREATE TRIGGER market_news_updated_at
          BEFORE UPDATE ON market_news
          FOR EACH ROW
          EXECUTE FUNCTION update_market_news_timestamp()
        """,
    ]
    try:
        with get_conn() as conn:
            for stmt in statements:
                conn.execute(text(stmt))
        return True, None
    except Exception as e:
        return False, str(e)


def create_article(
    *,
    title: str,
    url: str | None = None,
    source: str | None = None,
    category: str = "cyber_insurance",
    published_at: date | None = None,
    tags: list[str] | None = None,
    summary: str | None = None,
    internal_notes: str | None = None,
    created_by: str | None = None,
) -> str:
    if not title or not title.strip():
        raise ValueError("title is required")
    if category not in {"cyber_insurance", "cybersecurity"}:
        raise ValueError("invalid category")

    tags = [t.strip() for t in (tags or []) if t and t.strip()]
    with get_conn() as conn:
        row = conn.execute(
            text(
                """
                INSERT INTO market_news (
                  title, url, source, category, published_at, tags, summary, internal_notes, created_by
                )
                VALUES (
                  :title, :url, :source, :category, :published_at, CAST(:tags AS jsonb), :summary, :internal_notes, :created_by
                )
                RETURNING id
                """
            ),
            {
                "title": title.strip(),
                "url": (url or "").strip() or None,
                "source": (source or "").strip() or None,
                "category": category,
                "published_at": published_at,
                "tags": json.dumps(tags),
                "summary": (summary or "").strip() or None,
                "internal_notes": (internal_notes or "").strip() or None,
                "created_by": created_by,
            },
        ).fetchone()
    return str(row[0])


def delete_article(*, article_id: str) -> None:
    with get_conn() as conn:
        conn.execute(text("DELETE FROM market_news WHERE id = CAST(:id AS uuid)"), {"id": article_id})


def list_articles(
    *,
    search: str | None = None,
    category: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    where = ["TRUE"]
    params: dict[str, Any] = {"limit": limit}

    if search and search.strip():
        where.append("(title ILIKE :q OR COALESCE(source,'') ILIKE :q OR COALESCE(summary,'') ILIKE :q)")
        params["q"] = f"%{search.strip()}%"
    if category and category != "all":
        where.append("category = :category")
        params["category"] = category

    sql = f"""
        SELECT id, title, url, source, category, published_at, tags, summary, internal_notes, created_by, created_at, updated_at
        FROM market_news
        WHERE {" AND ".join(where)}
        ORDER BY COALESCE(published_at, created_at::date) DESC, created_at DESC
        LIMIT :limit
    """
    with get_conn() as conn:
        rows = conn.execute(text(sql), params).fetchall()

    out: list[dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "id": str(r[0]),
                "title": r[1],
                "url": r[2],
                "source": r[3],
                "category": r[4],
                "published_at": r[5],
                "tags": r[6] if isinstance(r[6], list) else (r[6] or []),
                "summary": r[7],
                "internal_notes": r[8],
                "created_by": r[9],
                "created_at": r[10],
                "updated_at": r[11],
            }
        )
    return out

