-- Market News Knowledge Base (v1)
-- Manually curated links + summaries for cyber insurance / cybersecurity news.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS market_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT,
  source TEXT,
  category TEXT NOT NULL DEFAULT 'cyber_insurance', -- cyber_insurance|cybersecurity
  published_at DATE,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  internal_notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_news_created_at ON market_news(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_news_published_at ON market_news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_news_category ON market_news(category);

-- Lightweight search helpers
CREATE INDEX IF NOT EXISTS idx_market_news_title_trgm ON market_news USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_market_news_source_trgm ON market_news USING GIN (source gin_trgm_ops);

CREATE OR REPLACE FUNCTION update_market_news_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS market_news_updated_at ON market_news;
CREATE TRIGGER market_news_updated_at
  BEFORE UPDATE ON market_news
  FOR EACH ROW
  EXECUTE FUNCTION update_market_news_timestamp();

