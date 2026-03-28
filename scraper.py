"""
RSS-based alien/UFO news scraper.
Pulls from multiple public RSS feeds; no API keys required.
"""
import logging
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import feedparser

logger = logging.getLogger(__name__)

# Public RSS feeds about aliens, UFOs, and unexplained phenomena
RSS_FEEDS = [
    {
        "name": "Google News – UFO",
        "url": "https://news.google.com/rss/search?q=UFO+alien&hl=en-US&gl=US&ceid=US:en",
    },
    {
        "name": "Google News – Extraterrestrial",
        "url": "https://news.google.com/rss/search?q=extraterrestrial+sighting&hl=en-US&gl=US&ceid=US:en",
    },
    {
        "name": "Google News – Alien Disclosure",
        "url": "https://news.google.com/rss/search?q=alien+disclosure+UAP&hl=en-US&gl=US&ceid=US:en",
    },
    {
        "name": "OpenMinds TV",
        "url": "https://www.openminds.tv/feed",
    },
    {
        "name": "The Black Vault",
        "url": "https://www.theblackvault.com/documentdb/feed/",
    },
    {
        "name": "Mysterious Universe",
        "url": "https://mysteriousuniverse.org/feed/",
    },
    {
        "name": "NASA News",
        "url": "https://www.nasa.gov/rss/dyn/breaking_news.rss",
    },
    {
        "name": "Space.com",
        "url": "https://www.space.com/feeds/all",
    },
]

ALIEN_KEYWORDS = [
    "alien", "ufo", "uap", "extraterrestrial", "unidentified", "flying saucer",
    "martian", "area 51", "roswell", "abduction", "crop circle", "disclosure",
    "sighting", "interstellar", "anomaly", "phenomenon", "unexplained",
    "non-human", "non human", "intelligence", "cosmos", "astrobiology",
]


def _parse_date(entry) -> str:
    """Return ISO-8601 date string from feed entry."""
    for attr in ("published_parsed", "updated_parsed"):
        val = getattr(entry, attr, None)
        if val:
            try:
                dt = datetime(*val[:6], tzinfo=timezone.utc)
                return dt.isoformat()
            except Exception:
                pass
    # Try raw string fields
    for attr in ("published", "updated"):
        val = getattr(entry, attr, None)
        if val:
            try:
                return parsedate_to_datetime(val).isoformat()
            except Exception:
                pass
    return datetime.now(timezone.utc).isoformat()


def _extract_image(entry) -> str | None:
    """Try to find an image URL from the entry."""
    # media:thumbnail
    media = getattr(entry, "media_thumbnail", None)
    if media and isinstance(media, list) and media:
        return media[0].get("url")

    # media:content
    media = getattr(entry, "media_content", None)
    if media and isinstance(media, list):
        for m in media:
            if m.get("medium") == "image" or m.get("type", "").startswith("image"):
                return m.get("url")

    # enclosures
    enclosures = getattr(entry, "enclosures", [])
    for enc in enclosures:
        if enc.get("type", "").startswith("image"):
            return enc.get("href") or enc.get("url")

    return None


def _is_relevant(title: str, summary: str) -> bool:
    """Return True if the article is alien/UFO related."""
    text = (title + " " + summary).lower()
    return any(kw in text for kw in ALIEN_KEYWORDS)


def _clean_html(text: str) -> str:
    """Strip basic HTML tags from a string."""
    import re
    return re.sub(r"<[^>]+>", "", text or "").strip()


def fetch_all_feeds() -> list[dict]:
    """Fetch all RSS feeds and return a deduplicated list of articles."""
    articles = []
    seen_links = set()

    for feed_info in RSS_FEEDS:
        try:
            logger.info("Fetching feed: %s", feed_info["name"])
            feed = feedparser.parse(feed_info["url"])

            for entry in feed.entries:
                link = getattr(entry, "link", None)
                if not link or link in seen_links:
                    continue

                title = _clean_html(getattr(entry, "title", "No title"))
                summary = _clean_html(
                    getattr(entry, "summary", "")
                    or getattr(entry, "description", "")
                )[:500]

                # For generic feeds (NASA, Space.com), only keep relevant entries
                if feed_info["name"] in ("NASA News", "Space.com"):
                    if not _is_relevant(title, summary):
                        continue

                seen_links.add(link)
                articles.append({
                    "title": title,
                    "link": link,
                    "summary": summary,
                    "source": feed_info["name"],
                    "image_url": _extract_image(entry),
                    "published_at": _parse_date(entry),
                })

        except Exception as exc:
            logger.warning("Error fetching %s: %s", feed_info["name"], exc)

    logger.info("Total articles fetched: %d", len(articles))
    return articles
