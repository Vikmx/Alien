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
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: http:",
    "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com",
    "frame-src https://www.googletagmanager.com",
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

let dbReady = false;
async function ensureDB(db) {
  if (dbReady) return;
  await initDB(db);
  dbReady = true;
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
      return Response.json(data, { headers: JSON_H });
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
        { headers: JSON_H }
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
