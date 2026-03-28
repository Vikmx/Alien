/**
 * D1 database operations (Cloudflare SQLite at the edge).
 */

export async function initDB(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS articles (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT    NOT NULL,
        link         TEXT    UNIQUE NOT NULL,
        summary      TEXT,
        source       TEXT,
        image_url    TEXT,
        published_at TEXT,
        fetched_at   TEXT    DEFAULT (datetime('now'))
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS scrape_log (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        ran_at         TEXT    DEFAULT (datetime('now')),
        articles_found INTEGER DEFAULT 0,
        status         TEXT    DEFAULT 'ok'
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC)
    `),
  ]);
}

export async function saveArticles(db, articles) {
  let inserted = 0;
  for (const a of articles) {
    try {
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO articles (title, link, summary, source, image_url, published_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(a.title, a.link, a.summary, a.source, a.image_url ?? null, a.published_at)
        .run();
      if (result.meta?.changes > 0) inserted++;
    } catch { /* duplicate or error — skip */ }
  }
  return inserted;
}

export async function logScrape(db, articlesFound, status = "ok") {
  await db
    .prepare(`INSERT INTO scrape_log (articles_found, status) VALUES (?, ?)`)
    .bind(articlesFound, status)
    .run();
}

export async function getArticles(db, page = 1, perPage = 12) {
  const offset = (page - 1) * perPage;
  const [rows, countRow] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM articles ORDER BY published_at DESC, fetched_at DESC LIMIT ? OFFSET ?`
      )
      .bind(perPage, offset)
      .all(),
    db.prepare(`SELECT COUNT(*) AS total FROM articles`).first(),
  ]);

  const total = countRow?.total ?? 0;
  return {
    articles: rows.results ?? [],
    total,
    page,
    per_page: perPage,
    pages: Math.ceil(total / perPage),
  };
}

export async function getLastScrape(db) {
  return db
    .prepare(`SELECT * FROM scrape_log ORDER BY ran_at DESC LIMIT 1`)
    .first();
}
