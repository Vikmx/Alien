/* AlienSignal – main.js */

// ── State ─────────────────────────────────────────────────────────────────────
let currentPage = 1;
let totalPages  = 1;
let activeSource = "all";
let searchQuery  = "";
let allArticles  = [];   // cache for client-side filter/search
let searchTimer  = null;

const PLACEHOLDERS = ["👽","🛸","🌌","🔭","🌠","🪐","⭐","🌙","🚀","🔬"];

// ── Utils ─────────────────────────────────────────────────────────────────────
function esc(str = "") {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" });
  } catch { return iso; }
}

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function addDays(iso, days) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-US", { month:"short", day:"numeric" });
  } catch { return "—"; }
}

function showToast(msg, type = "ok") {
  const el = document.createElement("div");
  el.className = `toast${type === "error" ? " error" : ""}`;
  el.textContent = msg;
  document.getElementById("toastContainer").appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Skeletons ─────────────────────────────────────────────────────────────────
function showSkeletons(n = 12) {
  const grid = document.getElementById("skeletons");
  grid.className = "articles-grid";
  grid.innerHTML = Array.from({ length: n }, () => `
    <div class="skeleton" aria-hidden="true">
      <div class="sk-img"></div>
      <div class="sk-body">
        <div class="sk-line w40"></div>
        <div class="sk-line w80"></div>
        <div class="sk-line w60"></div>
        <div class="sk-line w80"></div>
        <div class="sk-line w40"></div>
      </div>
    </div>
  `).join("");
  grid.style.display = "grid";
}

function hideSkeletons() {
  const grid = document.getElementById("skeletons");
  grid.style.display = "none";
  grid.innerHTML = "";
}

// ── Filters ───────────────────────────────────────────────────────────────────
function buildFilters(articles) {
  const sources = [...new Set(articles.map(a => a.source).filter(Boolean))].sort();
  const container = document.getElementById("filters");
  container.innerHTML = `<button class="filter-btn active" data-source="all">All</button>`;
  sources.forEach(src => {
    const btn = document.createElement("button");
    btn.className = "filter-btn";
    btn.dataset.source = src;
    btn.textContent = src.replace("Google News – ", "").replace("Google News — ", "");
    btn.title = src;
    container.appendChild(btn);
  });
  container.addEventListener("click", e => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    container.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeSource = btn.dataset.source;
    currentPage = 1;
    renderFiltered();
  });
}

// ── Filtering / search logic ──────────────────────────────────────────────────
function getFiltered() {
  let list = allArticles;
  if (activeSource !== "all") {
    list = list.filter(a => a.source === activeSource);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(a =>
      (a.title || "").toLowerCase().includes(q) ||
      (a.summary || "").toLowerCase().includes(q) ||
      (a.source || "").toLowerCase().includes(q)
    );
  }
  return list;
}

function renderFiltered() {
  const filtered = getFiltered();
  const perPage  = 12;
  totalPages     = Math.max(1, Math.ceil(filtered.length / perPage));
  currentPage    = Math.min(currentPage, totalPages);
  const start    = (currentPage - 1) * perPage;
  const page     = filtered.slice(start, start + perPage);

  const heroWrap  = document.getElementById("heroWrap");
  const grid      = document.getElementById("articlesGrid");
  const emptyEl   = document.getElementById("emptyState");
  const pagEl     = document.getElementById("pagination");

  if (filtered.length === 0) {
    heroWrap.style.display = "none";
    grid.style.display = "none";
    emptyEl.style.display = "block";
    pagEl.innerHTML = "";
    return;
  }
  emptyEl.style.display = "none";

  // Hero = first article of current page when on page 1 and no filter/search
  const showHero = currentPage === 1 && activeSource === "all" && !searchQuery && page.length > 0;
  const cards    = showHero ? page.slice(1) : page;
  const hero     = showHero ? page[0] : null;

  if (hero) {
    heroWrap.style.display = "block";
    document.getElementById("heroCard").outerHTML = renderHero(hero);
  } else {
    heroWrap.style.display = "none";
  }

  grid.innerHTML = "";
  cards.forEach((a, i) => {
    const el = document.createElement("article");
    el.className = "card";
    el.style.animationDelay = `${i * 0.04}s`;
    el.innerHTML = cardInner(a, i);
    grid.appendChild(el);
  });
  grid.style.display = cards.length ? "grid" : "none";

  renderPagination(currentPage, totalPages, pagEl);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function renderHero(a) {
  const img = a.image_url
    ? `<img class="hero-img" src="${esc(a.image_url)}" alt="" loading="eager" onerror="this.parentNode.innerHTML='<div class=hero-img-placeholder>🛸</div>'">`
    : `<div class="hero-img-placeholder">🛸</div>`;

  return `<article id="heroCard" class="hero-card">
    <div class="hero-img-wrap">${img}</div>
    <div class="hero-body">
      <div>
        <div class="hero-label">📡 ${esc(a.source || "Latest Signal")}</div>
        <h2 class="hero-title">${esc(a.title)}</h2>
        ${a.summary ? `<p class="hero-summary">${esc(a.summary)}</p>` : ""}
      </div>
      <div class="hero-footer">
        <span class="hero-source">Via <strong>${esc(a.source || "Unknown")}</strong> · ${formatDate(a.published_at)}</span>
        <a class="btn-read" href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">
          Read Full Article →
        </a>
      </div>
    </div>
  </article>`;
}

// ── Card ──────────────────────────────────────────────────────────────────────
function cardInner(a, idx) {
  const icon = PLACEHOLDERS[idx % PLACEHOLDERS.length];
  const img  = a.image_url
    ? `<div class="card-img-wrap"><img class="card-img" src="${esc(a.image_url)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='<div class=card-img-placeholder>${icon}</div>'"></div>`
    : `<div class="card-img-wrap"><div class="card-img-placeholder">${icon}</div></div>`;

  return `${img}
    <div class="card-body">
      <span class="card-source">${esc(a.source || "Unknown")}</span>
      <h3 class="card-title">${esc(a.title)}</h3>
      ${a.summary ? `<p class="card-summary">${esc(a.summary)}</p>` : ""}
      <div class="card-footer">
        <span class="card-date">${formatDate(a.published_at)}</span>
        <a class="card-link" href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">
          Read at source →
        </a>
      </div>
    </div>`;
}

// ── Pagination ────────────────────────────────────────────────────────────────
function renderPagination(page, pages, container) {
  container.innerHTML = "";
  if (pages <= 1) return;

  const prev = document.createElement("button");
  prev.className = "page-btn";
  prev.textContent = "← Prev";
  prev.disabled = page <= 1;
  prev.onclick = () => { currentPage = page - 1; renderFiltered(); };
  container.appendChild(prev);

  const range = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) range.push(i);

  if (range[0] > 1) {
    container.appendChild(makePageBtn(1, page));
    if (range[0] > 2) container.appendChild(Object.assign(document.createElement("span"), { className:"page-ellipsis", textContent:"…" }));
  }
  range.forEach(p => container.appendChild(makePageBtn(p, page)));
  if (range.at(-1) < pages) {
    if (range.at(-1) < pages - 1) container.appendChild(Object.assign(document.createElement("span"), { className:"page-ellipsis", textContent:"…" }));
    container.appendChild(makePageBtn(pages, page));
  }

  const next = document.createElement("button");
  next.className = "page-btn";
  next.textContent = "Next →";
  next.disabled = page >= pages;
  next.onclick = () => { currentPage = page + 1; renderFiltered(); };
  container.appendChild(next);
}

function makePageBtn(p, active) {
  const btn = document.createElement("button");
  btn.className = `page-btn${p === active ? " active" : ""}`;
  btn.textContent = p;
  btn.onclick = () => { currentPage = p; renderFiltered(); };
  return btn;
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadArticles() {
  showSkeletons(12);
  document.getElementById("heroWrap").style.display = "none";
  document.getElementById("articlesGrid").style.display = "none";
  document.getElementById("emptyState").style.display = "none";
  document.getElementById("pagination").innerHTML = "";

  try {
    // Fetch all articles for client-side filtering (up to 200)
    const res = await fetch("/api/articles?page=1&per_page=200");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    allArticles = data.articles || [];
    hideSkeletons();
    buildFilters(allArticles);
    renderFiltered();
  } catch (err) {
    hideSkeletons();
    document.getElementById("emptyState").style.display = "block";
    showToast("Failed to load signals: " + err.message, "error");
  }
}

async function loadStatus() {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById("totalArticles").textContent = data.total_articles ?? "—";

    const lastRan = data.last_scrape?.ran_at;
    document.getElementById("lastScan").textContent = timeAgo(lastRan);
    document.getElementById("nextScan").textContent  = addDays(lastRan, 3);
    document.getElementById("statusText").textContent =
      !lastRan ? "Initializing" : data.last_scrape?.status === "ok" ? "Live" : "Error";
  } catch {
    document.getElementById("statusText").textContent = "Offline";
  }
}

// ── Manual scan ───────────────────────────────────────────────────────────────
async function triggerScan() {
  const btn = document.getElementById("scanBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Scanning…"; }
  showToast("Initiating deep space scan…");
  try {
    const res = await fetch("/api/scrape", { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast("Scan complete — refreshing signals!");
    await Promise.all([loadStatus(), loadArticles()]);
  } catch (err) {
    showToast("Scan failed: " + err.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Scan Now`; }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("year").textContent = new Date().getFullYear();

  document.getElementById("scanBtn").addEventListener("click", triggerScan);

  // Search with debounce
  document.getElementById("searchInput").addEventListener("input", e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value.trim();
      currentPage = 1;
      renderFiltered();
    }, 280);
  });

  loadStatus();
  loadArticles();
  setInterval(loadStatus, 30_000);
});
