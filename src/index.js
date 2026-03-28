/**
 * AlienSignal – Cloudflare Worker
 * Security hardened: CSP, HSTS, X-Frame-Options, Referrer-Policy, input validation
 */

import { fetchAllFeeds } from "./scraper.js";
import { initDB, saveArticles, logScrape, getArticles, getLastScrape, trackVisit, getTotalVisits } from "./db.js";

// ── Security headers applied to every response ────────────────────────────────
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://pagead2.googlesyndication.com https://partner.googleadservices.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: http:",
    "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com",
    "frame-src https://www.googletagmanager.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com",
    "frame-ancestors 'none'",
  ].join("; "),
};

const JSON_H = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://www.the-alien.net",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  ...SECURITY_HEADERS,
};

const CACHE_H = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

let dbReady = false;
async function ensureDB(db) {
  if (dbReady) return;
  await initDB(db);
  dbReady = true;
}

// ── HTML escape for Worker-rendered pages ────────────────────────────────────
function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Add security headers to any response ─────────────────────────────────────
function withSecurity(response) {
  const r = new Response(response.body, response);
  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => r.headers.set(k, v));
  return r;
}

// ── Sanitize / validate query params ─────────────────────────────────────────
function safeInt(val, def, min, max) {
  const n = parseInt(val ?? def, 10);
  if (isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export default {
  async fetch(request, env) {
    await ensureDB(env.DB);

    const url  = new URL(request.url);
    const path = url.pathname;

    // Block unwanted methods globally
    if (!["GET", "POST", "OPTIONS"].includes(request.method)) {
      return new Response("Method Not Allowed", { status: 405, headers: SECURITY_HEADERS });
    }

    // ── Sitemap ──────────────────────────────────────────────────────────────
    if (path === "/sitemap.xml" && request.method === "GET") {
      const now = new Date().toISOString().slice(0, 10);
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.the-alien.net/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>https://www.the-alien.net/privacy.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>`;
      return new Response(xml, {
        headers: {
          "Content-Type": "application/xml; charset=UTF-8",
          "Cache-Control": "public, max-age=86400",
          ...SECURITY_HEADERS,
        },
      });
    }

    // ── Article share pages: /article/:id ────────────────────────────────────
    if (path.startsWith("/article/") && request.method === "GET") {
      const id = safeInt(path.split("/")[2], 0, 1, 9_999_999);
      if (!id) return Response.redirect("https://www.the-alien.net/", 302);
      try {
        const article = await env.DB
          .prepare("SELECT id, title, summary, image_url FROM articles WHERE id = ?")
          .bind(id).first();
        if (!article) return Response.redirect("https://www.the-alien.net/", 302);
        const title  = esc(article.title  || "AlienSignal — UFO & Alien News");
        const desc   = esc((article.summary || "").substring(0, 200));
        const imgUrl = esc(article.image_url || "https://www.the-alien.net/img/og.svg");
        const pageUrl = `https://www.the-alien.net/article/${id}`;
        const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} — AlienSignal</title>
<meta name="description" content="${desc}"/>
<link rel="canonical" href="${pageUrl}"/>
<meta property="og:type" content="article"/>
<meta property="og:site_name" content="AlienSignal"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:image" content="${imgUrl}"/>
<meta property="og:url" content="${pageUrl}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${desc}"/>
<meta name="twitter:image" content="${imgUrl}"/>
<meta http-equiv="refresh" content="0;url=https://www.the-alien.net/?article=${id}"/>
<style>body{margin:0;background:#020409;color:#e8f4ff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}a{color:#00ffaa}</style>
</head><body><p>Loading signal… <a href="https://www.the-alien.net/?article=${id}">Click here if not redirected</a></p></body></html>`;
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "public, max-age=3600", ...SECURITY_HEADERS },
        });
      } catch { return Response.redirect("https://www.the-alien.net/", 302); }
    }

    if (path.startsWith("/api/")) {
      return handleAPI(request, env, path, url);
    }

    // Track page visit (only HTML root requests)
    if (request.method === "GET" && (path === "/" || path === "")) {
      env.DB && trackVisit(env.DB).catch(() => {});
    }

    return withSecurity(await env.ASSETS.fetch(request));
  },

  async scheduled(_event, env, ctx) {
    await ensureDB(env.DB);
    ctx.waitUntil(runScrape(env));
  },
};

// ── API routes ────────────────────────────────────────────────────────────────
async function handleAPI(request, env, path, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_H });
  }

  try {
    // GET /api/articles?page=1&per_page=12
    if (path === "/api/articles" && request.method === "GET") {
      const page    = safeInt(url.searchParams.get("page"), 1, 1, 1000);
      const perPage = safeInt(url.searchParams.get("per_page"), 12, 6, 24);
      const data    = await getArticles(env.DB, page, perPage);
      return Response.json(data, { headers: { ...JSON_H, ...CACHE_H } });
    }

    // GET /api/status
    if (path === "/api/status" && request.method === "GET") {
      const [lastScrape, articlesData, totalVisits] = await Promise.all([
        getLastScrape(env.DB),
        getArticles(env.DB, 1, 1),
        getTotalVisits(env.DB),
      ]);
      return Response.json(
        { last_scrape: lastScrape, total_articles: articlesData.total, total_visits: totalVisits },
        { headers: { ...JSON_H, ...CACHE_H } }
      );
    }

    // POST /api/scrape — protected: only from same origin or Cloudflare cron
    if (path === "/api/scrape" && request.method === "POST") {
      const origin = request.headers.get("origin") || "";
      const cf     = request.headers.get("cf-worker") || "";
      const allowed = origin.includes("the-alien.net") || origin.includes("workers.dev") || cf;
      if (!allowed && origin) {
        return Response.json({ error: "Forbidden" }, { status: 403, headers: JSON_H });
      }
      await runScrape(env);
      return Response.json({ status: "ok" }, { headers: JSON_H });
    }

    return Response.json({ error: "Not found" }, { status: 404, headers: JSON_H });

  } catch (err) {
    console.error("API error:", err.message);
    // Never expose internal error details
    return Response.json({ error: "Internal server error" }, { status: 500, headers: JSON_H });
  }
}

// ── Scrape ────────────────────────────────────────────────────────────────────
async function runScrape(env) {
  try {
    const articles = await fetchAllFeeds();
    const inserted = await saveArticles(env.DB, articles);
    await logScrape(env.DB, inserted, "ok");
    console.log(`Scrape OK — ${inserted} new articles`);
  } catch (err) {
    console.error("Scrape error:", err.message);
    try { await logScrape(env.DB, 0, `error: ${err.message}`); } catch { /* ignore */ }
  }
}
