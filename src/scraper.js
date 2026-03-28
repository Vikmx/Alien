/**
 * RSS scraper for alien/UFO news.
 * Pure regex-based XML parsing — no DOMParser (not available in Workers).
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
  {
    name: "Google News – Area 51",
    url: "https://news.google.com/rss/search?q=area+51+roswell+alien&hl=en-US&gl=US&ceid=US:en",
  },
  {
    name: "Google News – UAP Congress",
    url: "https://news.google.com/rss/search?q=UAP+congress+non-human+intelligence&hl=en-US&gl=US&ceid=US:en",
  },
  {
    name: "Google News – Alien Life",
    url: "https://news.google.com/rss/search?q=alien+life+discovered+space&hl=en-US&gl=US&ceid=US:en",
  },
  {
    name: "Live Science",
    url: "https://www.livescience.com/feeds/all",
    filterByKeywords: true,
  },
  {
    name: "Sky News – Space",
    url: "https://feeds.skynews.com/feeds/rss/science.xml",
    filterByKeywords: true,
  },
];

const ALIEN_KEYWORDS = [
  "alien", "ufo", "uap", "extraterrestrial", "unidentified", "flying saucer",
  "martian", "area 51", "roswell", "abduction", "crop circle", "disclosure",
  "sighting", "interstellar", "anomaly", "non-human", "astrobiology",
  "unexplained", "close encounter",
];

function isRelevant(title = "", summary = "") {
  const text = (title + " " + summary).toLowerCase();
  return ALIEN_KEYWORDS.some((kw) => text.includes(kw));
}

function stripHtml(str = "") {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1") // unwrap CDATA
    .replace(/<[^>]*>/g, "")                        // strip real tags
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")   // decode encoded brackets
    .replace(/<[^>]*>/g, "")                        // strip now-decoded tags
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract text content between <tag>…</tag>, handling CDATA. */
function getTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? stripHtml(m[1]) : "";
}

/** Try several patterns to find an image URL inside an <item> block. */
function extractImage(itemXml) {
  // media:thumbnail url="..."
  let m = itemXml.match(/<media:thumbnail[^>]+url="([^"]+)"/i);
  if (m) return m[1];

  // media:content url="..." type="image/..."
  m = itemXml.match(/<media:content[^>]+url="([^"]+)"[^>]*type="image[^"]*"/i);
  if (m) return m[1];

  // enclosure url="..." type="image/..."
  m = itemXml.match(/<enclosure[^>]+type="image[^"]*"[^>]+url="([^"]+)"/i);
  if (m) return m[1];
  m = itemXml.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image[^"]*"/i);
  if (m) return m[1];

  // first <img src="..."> inside description/content
  m = itemXml.match(/<img[^>]+src="([^"]+)"/i);
  if (m) return m[1];

  return null;
}

function parseRSS(xml, feedName) {
  // Split on <item> boundaries
  const itemBlocks = xml.split(/<item[\s>]/i).slice(1);
  const articles = [];

  for (const block of itemBlocks) {
    // Grab the closing </item> portion only
    const itemXml = block.split("</item>")[0];

    const title = getTag(itemXml, "title");
    if (!title) continue;

    // <link> in RSS can be plain text or a self-closing tag; try both
    let link = getTag(itemXml, "link");
    if (!link) {
      const m = itemXml.match(/<link[^>]+href="([^"]+)"/i);
      if (m) link = m[1];
    }
    if (!link) continue;

    // Fair use: brief teaser only — full article lives at the source
    const rawSummary = getTag(itemXml, "description") || getTag(itemXml, "summary");
    const summary = rawSummary.length > 160
      ? rawSummary.slice(0, 157).replace(/\s+\S*$/, "") + "…"
      : rawSummary;
    const pubDate = getTag(itemXml, "pubDate") || getTag(itemXml, "published") || getTag(itemXml, "dc:date");

    let publishedAt = new Date().toISOString();
    if (pubDate) {
      try { publishedAt = new Date(pubDate).toISOString(); } catch { /* keep default */ }
    }

    articles.push({
      title,
      link,
      summary,
      source: feedName,
      image_url: extractImage(itemXml),
      published_at: publishedAt,
    });
  }

  return articles;
}

export async function fetchAllFeeds() {
  const articles = [];
  const seenLinks = new Set();

  await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { "User-Agent": "AlienSignal/1.0 RSS Reader" },
          cf: { cacheTtl: 3600 },
        });
        if (!res.ok) return;

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
    })
  );

  return articles;
}
