import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "articles.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            link TEXT UNIQUE NOT NULL,
            summary TEXT,
            source TEXT,
            image_url TEXT,
            published_at TEXT,
            fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS scrape_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ran_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            articles_found INTEGER DEFAULT 0,
            status TEXT DEFAULT 'ok'
        )
    """)
    conn.commit()
    conn.close()


def save_articles(articles: list[dict]) -> int:
    conn = get_conn()
    inserted = 0
    for a in articles:
        try:
            conn.execute(
                """INSERT OR IGNORE INTO articles
                   (title, link, summary, source, image_url, published_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (a["title"], a["link"], a["summary"],
                 a["source"], a.get("image_url"), a["published_at"]),
            )
            if conn.total_changes > inserted:
                inserted = conn.total_changes
        except Exception:
            pass
    conn.commit()
    inserted_count = conn.total_changes
    conn.close()
    return inserted_count


def log_scrape(articles_found: int, status: str = "ok"):
    conn = get_conn()
    conn.execute(
        "INSERT INTO scrape_log (articles_found, status) VALUES (?, ?)",
        (articles_found, status),
    )
    conn.commit()
    conn.close()


def get_articles(page: int = 1, per_page: int = 12) -> dict:
    conn = get_conn()
    offset = (page - 1) * per_page
    rows = conn.execute(
        """SELECT * FROM articles ORDER BY published_at DESC, fetched_at DESC
           LIMIT ? OFFSET ?""",
        (per_page, offset),
    ).fetchall()
    total = conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    conn.close()
    return {
        "articles": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    }


def get_last_scrape():
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM scrape_log ORDER BY ran_at DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return dict(row) if row else None
