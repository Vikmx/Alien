/**
 * AlienSignal – Cloudflare Worker
 *
 * Handles:
 *  - HTTP routes  : /api/articles, /api/status, /api/scrape (POST)
 *  - Static assets: served from ./public via ASSETS binding
 *  - Cron trigger : runs scraper every 3 days
 *  - Auto-init    : creates D1 tables on first request (no manual migration needed)
 */

import { fetchAllFeeds } from "./scraper.js";
import { initDB, saveArticles, logScrape, getArticles, getLastScrape } from "./db.js";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

// Runs once per Worker instance lifetime
let dbReady = false;

async function ensureDB(db) {
  if (dbReady) return;
  await initDB(db);
  dbReady = true;
}

// ── HTTP handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    await ensureDB(env.DB);

    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/")) {
      return handleAPI(request, env, path, url);
    }

    return env.ASSETS.fetch(request);
  },

  // ── Cron trigger (every 3 days) ────────────────────────────────────────────
  async scheduled(_event, env, ctx) {
    await ensureDB(env.DB);
    ctx.waitUntil(runScrape(env));
  },
};

// ── API routes ────────────────────────────────────────────────────────────────

async function handleAPI(request, env, path, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  try {
    if (path === "/api/articles" && request.method === "GET") {
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
      const perPage = Math.min(24, Math.max(6, parseInt(url.searchParams.get("per_page") || "12")));
      const data = await getArticles(env.DB, page, perPage);
      return Response.json(data, { headers: JSON_HEADERS });
    }

    if (path === "/api/status" && request.method === "GET") {
      const [lastScrape, articlesData] = await Promise.all([
        getLastScrape(env.DB),
        getArticles(env.DB, 1, 1),
      ]);
      return Response.json(
        { last_scrape: lastScrape, total_articles: articlesData.total },
        { headers: JSON_HEADERS }
      );
    }

    if (path === "/api/scrape" && request.method === "POST") {
      await runScrape(env);
      return Response.json({ status: "ok", message: "Scrape triggered" }, { headers: JSON_HEADERS });
    }

    return Response.json({ error: "Not found" }, { status: 404, headers: JSON_HEADERS });
  } catch (err) {
    console.error("API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500, headers: JSON_HEADERS });
  }
}

// ── Scrape logic ──────────────────────────────────────────────────────────────

async function runScrape(env) {
  console.log("Starting alien news scrape…");
  try {
    const articles = await fetchAllFeeds();
    const inserted = await saveArticles(env.DB, articles);
    await logScrape(env.DB, inserted, "ok");
    console.log(`Scrape complete – ${inserted} new articles saved.`);
  } catch (err) {
    console.error("Scrape failed:", err);
    try { await logScrape(env.DB, 0, `error: ${err.message}`); } catch { /* ignore */ }
  }
}
