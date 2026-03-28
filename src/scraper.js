/**
 * RSS scraper for alien/UFO news.
 * Uses the native fetch + DOMParser available in Cloudflare Workers.
 */

const RSS_FEEDS = [
  {
    name: "Google News – UFO",
    url: "https://news.google.com/rss/search?q=UFO+alien&hl=en-US&gl=US&ceid=US:en",
  },
  {
    name: "Google News – Extraterrestrial",
    url: "https://news.google.com/rss/search?q=extraterrestrial+sighting&hl=en-US&gl=US&ceid=US:en",
  },
  {
    name: "Google News – UAP Disclosure",
    url: "https://news.google.com/rss/search?q=UAP+alien+disclosure&hl=en-US&gl=US&ceid=US:en",
  },
  {
    name: "OpenMinds TV",
    url: "https://www.openminds.tv/feed",
  },
  {
    name: "The Black Vault",
    url: "https://www.theblackvault.com/documentdb/feed/",
  },
  {
    name: "Mysterious Universe",
    url: "https://mysteriousuniverse.org/feed/",
  },
  {
    name: "NASA News",
    url: "https://www.nasa.gov/rss/dyn/breaking_news.rss",
    filterByKeywords: true,
  },
  {
    name: "Space.com",
    url: "https://www.space.com/feeds/all",
    filterByKeywords: true,
  },
];

const ALIEN_KEYWORDS = [
  "alien", "ufo", "uap", "extraterrestrial", "unidentified", "flying saucer",
  "martian", "area 51", "roswell", "abduction", "crop circle", "disclosure",
  "sighting", "interstellar", "anomaly", "non-human", "astrobiology",
  "unexplained", "intelligence", "close encounter",
];

function isRelevant(title = "", summary = "") {
  const text = (title + " " + summary).toLowerCase();
  return ALIEN_KEYWORDS.some((kw) => text.includes(kw));
}

function stripHtml(str = "") {
  return str.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function getText(el, tag) {
  const node = el.querySelector(tag);
  return node ? stripHtml(node.textContent || "") : "";
}

function extractImage(itemXml) {
  // Try media:thumbnail
  const thumbMatch = itemXml.match(/<media:thumbnail[^>]+url="([^"]+)"/);
  if (thumbMatch) return thumbMatch[1];

  // Try media:content image
  const mediaMatch = itemXml.match(/<media:content[^>]+url="([^"]+)"[^>]+type="image/);
  if (mediaMatch) return mediaMatch[1];

  // Try enclosure
  const encMatch = itemXml.match(/<enclosure[^>]+url="([^"]+)"[^>]+type="image/);
  if (encMatch) return encMatch[1];

  // Try og:image in description
  const imgMatch = itemXml.match(/<img[^>]+src="([^"]+)"/);
  if (imgMatch) return imgMatch[1];

  return null;
}

function parseRSS(xmlText, feedName) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const items = Array.from(doc.querySelectorAll("item"));

  return items.map((item) => {
    // Get raw XML of item for image extraction
    const itemXml = item.outerHTML || "";

    const title = getText(item, "title");
    const link = getText(item, "link") || item.querySelector("link")?.getAttribute("href") || "";
    const summary = stripHtml(getText(item, "description") || getText(item, "summary")).slice(0, 500);
    const pubDate = getText(item, "pubDate") || getText(item, "published") || getText(item, "dc\\:date");

    let publishedAt = new Date().toISOString();
    if (pubDate) {
      try { publishedAt = new Date(pubDate).toISOString(); } catch { /* keep default */ }
    }

    return {
      title,
      link,
      summary,
      source: feedName,
      image_url: extractImage(itemXml),
      published_at: publishedAt,
    };
  }).filter((a) => a.title && a.link);
}

export async function fetchAllFeeds() {
  const articles = [];
  const seenLinks = new Set();

  for (const feed of RSS_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "AlienSignal/1.0 RSS Reader" },
        cf: { cacheTtl: 3600 },
      });
      if (!res.ok) continue;

      const xml = await res.text();
      const items = parseRSS(xml, feed.name);

      for (const item of items) {
        if (seenLinks.has(item.link)) continue;
        if (feed.filterByKeywords && !isRelevant(item.title, item.summary)) continue;
        seenLinks.add(item.link);
        articles.push(item);
      }
    } catch (err) {
      console.error(`Feed error [${feed.name}]:`, err.message);
    }
  }

  return articles;
}
