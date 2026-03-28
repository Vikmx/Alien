/* AlienSignal – main.js */

const API_BASE = "";
let currentPage = 1;
let totalPages = 1;

// ── Utils ──────────────────────────────────────────────────────────────────

function formatDate(isoStr) {
  if (!isoStr) return "Unknown date";
  try {
    return new Date(isoStr).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch { return isoStr; }
}

function timeAgo(isoStr) {
  if (!isoStr) return "";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function addDays(isoStr, days) {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch { return "—"; }
}

function showToast(msg, type = "ok") {
  const el = document.createElement("div");
  el.className = `toast${type === "error" ? " error" : ""}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Stars ──────────────────────────────────────────────────────────────────

function generateStars() {
  const container = document.getElementById("stars");
  if (!container) return;
  const count = 80;
  for (let i = 0; i < count; i++) {
    const star = document.createElement("div");
    star.style.cssText = `
      position:absolute;
      width:${Math.random() * 2 + 1}px;
      height:${Math.random() * 2 + 1}px;
      background:rgba(255,255,255,${Math.random() * 0.6 + 0.2});
      border-radius:50%;
      top:${Math.random() * 100}%;
      left:${Math.random() * 100}%;
      animation: twinkle ${Math.random() * 4 + 2}s ease-in-out infinite;
      animation-delay: ${Math.random() * 4}s;
    `;
    container.appendChild(star);
  }
  // Add twinkle keyframes dynamically
  const style = document.createElement("style");
  style.textContent = `
    @keyframes twinkle {
      0%,100%{opacity:1;transform:scale(1)}
      50%{opacity:0.2;transform:scale(0.6)}
    }
  `;
  document.head.appendChild(style);
}

// ── Placeholder icons ──────────────────────────────────────────────────────

const PLACEHOLDERS = ["👽", "🛸", "🌌", "🔭", "🌠", "🪐", "⭐", "🌙", "🚀", "🔬"];

function getPlaceholder(index) {
  return PLACEHOLDERS[index % PLACEHOLDERS.length];
}

// ── Card rendering ─────────────────────────────────────────────────────────

function renderCard(article, index) {
  const card = document.createElement("article");
  card.className = "card";
  card.style.animationDelay = `${index * 0.04}s`;

  const imgHtml = article.image_url
    ? `<img class="card-img" src="${escapeHtml(article.image_url)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='<div class=\\'card-img-placeholder\\'>${getPlaceholder(index)}</div>'">`
    : `<div class="card-img-placeholder">${getPlaceholder(index)}</div>`;

  card.innerHTML = `
    ${imgHtml}
    <div class="card-body">
      <span class="card-source">📡 ${escapeHtml(article.source || "Unknown")}</span>
      <h2 class="card-title">${escapeHtml(article.title)}</h2>
      ${article.summary ? `<p class="card-summary">${escapeHtml(article.summary)}</p>` : ""}
      <div class="card-footer">
        <span class="card-date">${formatDate(article.published_at)}</span>
        <a class="card-link" href="${escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer">
          Read Signal →
        </a>
      </div>
    </div>
  `;
  return card;
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Pagination ─────────────────────────────────────────────────────────────

function renderPagination(page, pages) {
  const container = document.getElementById("pagination");
  container.innerHTML = "";
  if (pages <= 1) return;

  const prev = document.createElement("button");
  prev.className = "page-btn";
  prev.textContent = "← Prev";
  prev.disabled = page <= 1;
  prev.onclick = () => loadArticles(page - 1);
  container.appendChild(prev);

  // Show page numbers with ellipsis
  const range = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) {
    range.push(i);
  }
  if (range[0] > 1) {
    const first = makePageBtn(1);
    container.appendChild(first);
    if (range[0] > 2) container.appendChild(makeEllipsis());
  }
  range.forEach(p => container.appendChild(makePageBtn(p, p === page)));
  if (range[range.length - 1] < pages) {
    if (range[range.length - 1] < pages - 1) container.appendChild(makeEllipsis());
    container.appendChild(makePageBtn(pages));
  }

  const next = document.createElement("button");
  next.className = "page-btn";
  next.textContent = "Next →";
  next.disabled = page >= pages;
  next.onclick = () => loadArticles(page + 1);
  container.appendChild(next);
}

function makePageBtn(p, active = false) {
  const btn = document.createElement("button");
  btn.className = `page-btn${active ? " active" : ""}`;
  btn.textContent = p;
  btn.onclick = () => loadArticles(p);
  return btn;
}

function makeEllipsis() {
  const span = document.createElement("span");
  span.textContent = "…";
  span.style.color = "var(--text-dim)";
  span.style.padding = "0 0.3rem";
  return span;
}

// ── Data loading ───────────────────────────────────────────────────────────

async function loadArticles(page = 1) {
  currentPage = page;

  const loading = document.getElementById("loading");
  const grid = document.getElementById("articlesGrid");
  const empty = document.getElementById("emptyState");
  const pagination = document.getElementById("pagination");

  loading.style.display = "block";
  grid.innerHTML = "";
  pagination.innerHTML = "";
  empty.style.display = "none";

  try {
    const res = await fetch(`${API_BASE}/api/articles?page=${page}&per_page=12`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    loading.style.display = "none";
    totalPages = data.pages || 1;

    if (!data.articles || data.articles.length === 0) {
      empty.style.display = "block";
      return;
    }

    data.articles.forEach((article, i) => {
      grid.appendChild(renderCard(article, i));
    });

    renderPagination(page, totalPages);
    window.scrollTo({ top: 0, behavior: "smooth" });

  } catch (err) {
    loading.style.display = "none";
    empty.style.display = "block";
    showToast("Failed to load signals: " + err.message, "error");
  }
}

async function loadStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById("totalArticles").textContent = data.total_articles ?? "—";

    if (data.last_scrape) {
      const lastRan = data.last_scrape.ran_at;
      document.getElementById("lastScan").textContent = timeAgo(lastRan) || "—";
      document.getElementById("nextScan").textContent = addDays(lastRan, 3);
      document.getElementById("statusText").textContent =
        data.last_scrape.status === "ok" ? "Online" : "Error";
    } else {
      document.getElementById("lastScan").textContent = "Never";
      document.getElementById("nextScan").textContent = "Soon";
      document.getElementById("statusText").textContent = "Initializing";
    }
  } catch {
    document.getElementById("statusText").textContent = "Offline";
  }
}

// ── Manual scan ────────────────────────────────────────────────────────────

async function triggerScan() {
  const btn = document.getElementById("scanBtn");
  if (btn) { btn.disabled = true; btn.textContent = "⟳ Scanning…"; }

  showToast("Initiating deep space scan…");

  try {
    const res = await fetch(`${API_BASE}/api/scrape`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast("Scan complete — refreshing signals!");
    await Promise.all([loadStatus(), loadArticles(1)]);
  } catch (err) {
    showToast("Scan failed: " + err.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "⟳ Scan Now"; }
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  generateStars();

  const scanBtn = document.getElementById("scanBtn");
  if (scanBtn) scanBtn.addEventListener("click", triggerScan);

  loadStatus();
  loadArticles(1);

  // Refresh status every 30s
  setInterval(loadStatus, 30_000);
});
