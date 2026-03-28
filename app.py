"""
Alien News Aggregator – Flask application.
Scrapes alien/UFO RSS feeds every 3 days and serves them via a web UI.
"""
import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from flask import Flask, jsonify, render_template, request

import database as db
import scraper

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Scheduled job
# ---------------------------------------------------------------------------

def run_scrape():
    logger.info("Starting scheduled alien news scrape…")
    try:
        articles = scraper.fetch_all_feeds()
        db.save_articles(articles)
        db.log_scrape(len(articles), status="ok")
        logger.info("Scrape complete – %d articles saved.", len(articles))
    except Exception as exc:
        logger.error("Scrape failed: %s", exc)
        db.log_scrape(0, status=f"error: {exc}")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/articles")
def api_articles():
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(24, max(6, int(request.args.get("per_page", 12))))
    data = db.get_articles(page=page, per_page=per_page)
    return jsonify(data)


@app.route("/api/status")
def api_status():
    last = db.get_last_scrape()
    total = db.get_articles(page=1, per_page=1)["total"]
    return jsonify({"last_scrape": last, "total_articles": total})


@app.route("/api/scrape", methods=["POST"])
def api_manual_scrape():
    """Trigger a manual scrape (useful for testing)."""
    run_scrape()
    return jsonify({"status": "ok", "message": "Scrape triggered"})


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

def create_app():
    db.init_db()

    # Run an initial scrape if the DB is empty
    if db.get_articles(page=1, per_page=1)["total"] == 0:
        logger.info("Database is empty – running initial scrape…")
        run_scrape()

    scheduler = BackgroundScheduler(daemon=True)
    # Every 3 days
    scheduler.add_job(run_scrape, trigger="interval", days=3, id="scrape_job")
    scheduler.start()
    logger.info("Scheduler started – next scrape in 3 days.")

    return app


if __name__ == "__main__":
    application = create_app()
    port = int(os.environ.get("PORT", 5000))
    application.run(host="0.0.0.0", port=port, debug=False)
