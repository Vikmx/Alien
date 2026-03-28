/**
 * AlienSignal – Cloudflare Worker
 */

import { fetchAllFeeds } from "./scraper.js";
import { initDB, saveArticles, logScrape, getArticles, getLastScrape, trackVisit, getTotalVisits } from "./db.js";

const JSON_H = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

let dbReady = false;
async function ensureDB(db) {
  if (dbReady) return;
  await initDB(db);
  dbReady = true;
}
export default {
  async fetch(request, env) {
    await ensureDB(env.DB);

    const url  = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/")) return handleAPI(request, env, path, url);

    // Count page visit (HTML requests only, not assets)
    if (request.method === "GET" && (path === "/" || path === "")) {
      env.DB && trackVisit(env.DB).catch(() => {});
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env, ctx) {
    await ensureDB(env.DB);
    ctx.waitUntil(runScrape(env));
  },
};

async function handleAPI(request, env, path, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_H });

  try {
    // GET /api/articles
    if (path === "/api/articles" && request.method === "GET") {
      const page    = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
      const perPage = Math.min(24, Math.max(6, parseInt(url.searchParams.get("per_page") || "12")));
      return Response.json(await getArticles(env.DB, page, perPage), { headers: JSON_H });
    }

    // GET /api/status  — includes visitor count
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

    // POST /api/scrape
    if (path === "/api/scrape" && request.method === "POST") {
      await runScrape(env);
      return Response.json({ status: "ok" }, { headers: JSON_H });
    }

    return Response.json({ error: "Not found" }, { status: 404, headers: JSON_H });
  } catch (err) {
    console.error("API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500, headers: JSON_H });
  }
}

async function runScrape(env) {
  try {
    const articles = await fetchAllFeeds();
    const inserted = await saveArticles(env.DB, articles);
    await logScrape(env.DB, inserted, "ok");
  } catch (err) {
    try { await logScrape(env.DB, 0, `error: ${err.message}`); } catch { /* ignore */ }
  }
}
