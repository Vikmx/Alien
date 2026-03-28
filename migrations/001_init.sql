-- AlienSignal D1 schema

CREATE TABLE IF NOT EXISTS articles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  link         TEXT    UNIQUE NOT NULL,
  summary      TEXT,
  source       TEXT,
  image_url    TEXT,
  published_at TEXT,
  fetched_at   TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scrape_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at         TEXT    DEFAULT (datetime('now')),
  articles_found INTEGER DEFAULT 0,
  status         TEXT    DEFAULT 'ok'
);

CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
