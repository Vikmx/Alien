/* AlienSignal – GOAT edition */

// ── Theme ─────────────────────────────────────────────────────────────────────
(function initTheme() {
  const stored = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (stored === "light" || (!stored && !prefersDark)) {
    document.documentElement.classList.add("light");
  }
})();

// ── State ─────────────────────────────────────────────────────────────────────
let currentPage  = 1;
let activeSource = "all";
let searchQuery  = "";
let allArticles  = [];
let searchTimer  = null;

const ICONS = ["👽","🛸","🌌","🔭","🌠","🪐","⭐","🌙","🚀","🔬","🌍","☄️"];

// ── Animated canvas starfield ─────────────────────────────────────────────────
(function canvas() {
  const c = document.getElementById("bg");
  if (!c) return;

  // Skip animation if user prefers reduced motion
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const isMobile  = /Mobi|Android/i.test(navigator.userAgent);
  const isLowPerf = (navigator.hardwareConcurrency || 4) <= 2;
  if (isMobile && isLowPerf) return; // skip on low-end mobile

  const starCount = isMobile ? 80 : 260;
  const x = c.getContext("2d");
  let W, H, stars = [], shooters = [];

  function resize() { W = c.width = innerWidth; H = c.height = innerHeight; }

  function mkStars() {
    stars = Array.from({ length: starCount }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.5 + .25,
      a: Math.random(), da: (Math.random()-.5) * .007,
      dy: Math.random() * .1 + .02,
      col: Math.random() < .06
        ? (Math.random() < .5 ? "#00ffaa" : "#5eb8ff")
        : "#ffffff",
    }));
    shooters = [];
  }

  function launchShooter() {
    if (isMobile || Math.random() > .004) return;
    shooters.push({
      x: Math.random() * W * .7, y: Math.random() * H * .4,
      vx: 6 + Math.random() * 6, vy: 2 + Math.random() * 3,
      life: 1, tail: [],
    });
  }

  function draw() {
    x.clearRect(0, 0, W, H);
    for (const s of stars) {
      s.a = Math.max(.05, Math.min(.95, s.a + s.da));
      if (s.a <= .05 || s.a >= .95) s.da *= -1;
      s.y -= s.dy;
      if (s.y < -2) { s.y = H + 2; s.x = Math.random() * W; }
      x.beginPath();
      x.arc(s.x, s.y, s.r, 0, Math.PI*2);
      x.fillStyle = s.col;
      x.globalAlpha = s.a * .7;
      x.fill();
    }
    launchShooter();
    for (let i = shooters.length - 1; i >= 0; i--) {
      const s = shooters[i];
      s.tail.push({ x: s.x, y: s.y, a: s.life });
      s.x += s.vx; s.y += s.vy; s.life -= .04;
      if (s.life <= 0 || s.x > W + 50 || s.y > H + 50) { shooters.splice(i, 1); continue; }
      for (let j = 0; j < s.tail.length; j++) {
        const t = s.tail[j];
        x.beginPath();
        x.arc(t.x, t.y, .8, 0, Math.PI*2);
        x.fillStyle = "#ffffff";
        x.globalAlpha = t.a * .5 * (j / s.tail.length);
        x.fill();
      }
      if (s.tail.length > 18) s.tail.shift();
    }
    x.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  resize(); mkStars(); draw();
  window.addEventListener("resize", () => { resize(); mkStars(); });
})();

// ── Keyboard shortcut: / to focus search ─────────────────────────────────────
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement !== document.getElementById("searchInput")) {
    e.preventDefault();
    document.getElementById("searchInput").focus();
  }
});

// ── Utils ─────────────────────────────────────────────────────────────────────
function esc(s = "") {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
                  .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function clean(s = "") {
  return String(s)
    .replace(/&lt;[^&]*&gt;/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}
function fmtDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }
  catch { return ""; }
}
function timeAgo(iso) {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1)    return "just now";
  if (m < 60)   return m + "m ago";
  if (m < 1440) return Math.floor(m/60) + "h ago";
  return Math.floor(m/1440) + "d ago";
}
function addDays(iso, n) {
  if (!iso) return "—";
  try {
    const d = new Date(iso); d.setDate(d.getDate()+n);
    return d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
  } catch { return "—"; }
}
function isNew(iso) {
  if (!iso) return false;
  return (Date.now() - new Date(iso)) < 86400000 * 2;
}
function fmtNum(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}
function toast(msg, type = "ok") {
  const el = document.createElement("div");
  el.className = "toast" + (type === "err" ? " err" : "");
  el.textContent = msg;
  document.getElementById("toasts").appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Theme toggle ──────────────────────────────────────────────────────────────
function initThemeToggle() {
  const btn  = document.getElementById("themeBtn");
  const icon = document.getElementById("themeIcon");
  if (!btn) return;

  const SUN  = `<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/><circle cx="12" cy="12" r="5"/>`;
  const MOON = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;

  function applyTheme(light) {
    document.documentElement.classList.toggle("light", light);
    icon.innerHTML = light ? SUN : MOON;
    localStorage.setItem("theme", light ? "light" : "dark");
  }

  // Set initial icon
  const isLight = document.documentElement.classList.contains("light");
  icon.innerHTML = isLight ? SUN : MOON;

  btn.addEventListener("click", () => {
    applyTheme(!document.documentElement.classList.contains("light"));
  });
}

// ── Back to top ───────────────────────────────────────────────────────────────
function initBackToTop() {
  const btn = document.getElementById("backTop");
  if (!btn) return;
  window.addEventListener("scroll", () => {
    btn.classList.toggle("visible", window.scrollY > 400);
  }, { passive: true });
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

// ── Ticker ────────────────────────────────────────────────────────────────────
function buildTicker(articles) {
  const wrap  = document.getElementById("tickerWrap");
  const inner = document.getElementById("tickerInner");
  if (!articles.length) return;
  const recent = articles.slice(0, 10);
  const html = recent.map(a =>
    `<span>📡 <a href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a></span>`
  ).join("");
  inner.innerHTML = html + html;
  wrap.style.display = "flex";
}

// ── Skeletons ─────────────────────────────────────────────────────────────────
function showSkeletons() {
  const el = document.getElementById("skeletons");
  el.innerHTML = Array.from({length:12},()=>`
    <div class="skel">
      <div class="sk-h"></div>
      <div class="sk-b">
        <div class="sk-l w25"></div>
        <div class="sk-l w90"></div>
        <div class="sk-l w70"></div>
        <div class="sk-l w50"></div>
      </div>
    </div>`).join("");
  el.style.display = "grid";
}
function hideSkeletons() {
  const el = document.getElementById("skeletons");
  el.style.display = "none"; el.innerHTML = "";
}

// ── Filters ───────────────────────────────────────────────────────────────────
function buildFilters(articles) {
  const srcs = [...new Set(articles.map(a=>a.source).filter(Boolean))].sort();
  const box = document.getElementById("filters");
  box.innerHTML = `<button class="chip active" data-source="all">All</button>`;
  srcs.forEach(s => {
    const b = document.createElement("button");
    b.className = "chip"; b.dataset.source = s;
    b.textContent = s.replace(/Google News\s*[–—]\s*/i,""); b.title = s;
    box.appendChild(b);
  });
  box.addEventListener("click", e => {
    const b = e.target.closest(".chip");
    if (!b) return;
    box.querySelectorAll(".chip").forEach(c=>c.classList.remove("active"));
    b.classList.add("active");
    activeSource = b.dataset.source;
    currentPage = 1; render();
  });
}

// ── Filter logic ──────────────────────────────────────────────────────────────
function getFiltered() {
  let list = allArticles;
  if (activeSource !== "all") list = list.filter(a=>a.source===activeSource);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(a=>
      (a.title||"").toLowerCase().includes(q) ||
      (a.summary||"").toLowerCase().includes(q) ||
      (a.source||"").toLowerCase().includes(q)
    );
  }
  return list;
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  const perPage = 12;
  const list  = getFiltered();
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  currentPage = Math.min(currentPage, pages);
  const slice = list.slice((currentPage-1)*perPage, currentPage*perPage);

  const heroWrap = document.getElementById("heroWrap");
  const gridEl   = document.getElementById("grid");
  const emptyEl  = document.getElementById("empty");
  const pagEl    = document.getElementById("pagination");

  if (!slice.length) {
    heroWrap.style.display = "none";
    gridEl.style.display   = "none";
    emptyEl.style.display  = "block";
    pagEl.innerHTML = ""; return;
  }
  emptyEl.style.display = "none";

  const showHero = currentPage===1 && activeSource==="all" && !searchQuery;
  const heroIdx = showHero ? slice.findIndex(a => a.image_url) : -1;
  const hero  = heroIdx >= 0 ? slice[heroIdx] : null;
  const cards = hero ? slice.filter((_, i) => i !== heroIdx) : slice;

  if (hero) {
    heroWrap.style.display = "block";
    document.getElementById("heroCard").innerHTML = heroHTML(hero);
  } else {
    heroWrap.style.display = "none";
  }

  gridEl.innerHTML = "";
  cards.forEach((a, i) => {
    const div = document.createElement("article");
    div.className = "card";
    div.dataset.id = a.id;
    div.style.animationDelay = i * .038 + "s";
    div.innerHTML = cardHTML(a, i);
    gridEl.appendChild(div);
  });
  gridEl.style.display = cards.length ? "grid" : "none";

  renderPag(currentPage, pages, pagEl);
  window.scrollTo({top:0,behavior:"smooth"});
}

// ── Hero HTML ─────────────────────────────────────────────────────────────────
function heroHTML(a) {
  const img = a.image_url
    ? `<img src="${esc(a.image_url)}" alt="" loading="eager" onerror="this.parentNode.innerHTML='<div class=ha-img-ph>🛸</div>'">`
    : `<div class="ha-img-ph">🛸</div>`;
  return `
    <article class="hero-article" data-id="${a.id}">
      <div class="ha-img">${img}<div class="ha-grad"></div></div>
      <div class="ha-body">
        <div>
          <div class="ha-badge">📡 ${esc(a.source||"Signal")}</div>
          <h2 class="ha-title">${esc(clean(a.title))}</h2>
          ${a.summary ? `<p class="ha-summary" style="margin-top:.7rem">${esc(clean(a.summary))}</p>` : ""}
        </div>
        <div class="ha-foot">
          <span class="ha-meta">Via <strong>${esc(a.source||"Unknown")}</strong> · ${fmtDate(a.published_at)}</span>
          <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
            <button class="c-link" onclick="shareArticle(${a.id})" style="font-size:.68rem" title="Share this article">Share 🔗</button>
            <a class="btn-story" href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">Read full story →</a>
          </div>
        </div>
      </div>
    </article>`;
}

// ── Card HTML ─────────────────────────────────────────────────────────────────
function cardHTML(a, i) {
  const icon = ICONS[i % ICONS.length];
  const newBadge = isNew(a.published_at) ? `<span class="c-new">NEW</span>` : "";
  const img = a.image_url
    ? `<div class="c-img">${newBadge}<img src="${esc(a.image_url)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='<div class=c-img-ph>${icon}</div>'"></div>`
    : `<div class="c-img">${newBadge}<div class="c-img-ph">${icon}</div></div>`;
  return `${img}
    <div class="c-body">
      <span class="c-src">${esc(a.source||"Unknown")}</span>
      <h3 class="c-title">${esc(clean(a.title))}</h3>
      ${a.summary ? `<p class="c-summary">${esc(clean(a.summary))}</p>` : ""}
      <div class="c-foot">
        <span class="c-date">${fmtDate(a.published_at)}</span>
        <div style="display:flex;gap:.3rem">
          <button class="c-link" onclick="shareArticle(${a.id})" title="Share">🔗</button>
          <a class="c-link" href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">Read →</a>
        </div>
      </div>
    </div>`;
}

// ── Share article ─────────────────────────────────────────────────────────────
function shareArticle(id) {
  const shareUrl = `${location.origin}/article/${id}`;
  if (navigator.share) {
    navigator.share({ url: shareUrl }).catch(() => {});
  } else {
    navigator.clipboard.writeText(shareUrl).then(() => toast("Link copied!")).catch(() => {
      toast("Share URL: " + shareUrl);
    });
  }
}

// ── Article highlight from URL (?article=id) ──────────────────────────────────
function highlightArticleFromURL() {
  const id = new URLSearchParams(location.search).get("article");
  if (!id) return;
  // Remove param from URL without reload
  const clean_url = location.pathname + (location.search.replace(/[?&]article=\d+/, "").replace(/^&/, "?") || "");
  history.replaceState(null, "", clean_url);

  // Find the card and highlight it
  function tryHighlight(attempts = 0) {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el) {
      el.classList.add("highlighted");
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
      setTimeout(() => el.classList.remove("highlighted"), 8000);
    } else if (attempts < 10) {
      setTimeout(() => tryHighlight(attempts + 1), 300);
    }
  }
  tryHighlight();
}

// ── Pagination ────────────────────────────────────────────────────────────────
function renderPag(page, pages, el) {
  el.innerHTML = "";
  if (pages <= 1) return;
  el.appendChild(mkBtn("← Prev", page<=1, ()=>{ currentPage=page-1; render(); }));
  const range = [];
  for (let i=Math.max(1,page-2); i<=Math.min(pages,page+2); i++) range.push(i);
  if (range[0]>1) { el.appendChild(mkPg(1,page)); if(range[0]>2) el.appendChild(mkDots()); }
  range.forEach(p=>el.appendChild(mkPg(p,page)));
  if (range.at(-1)<pages) { if(range.at(-1)<pages-1) el.appendChild(mkDots()); el.appendChild(mkPg(pages,page)); }
  el.appendChild(mkBtn("Next →", page>=pages, ()=>{ currentPage=page+1; render(); }));
}
function mkBtn(lbl, dis, fn) {
  const b = document.createElement("button"); b.className="pg";
  b.textContent=lbl; b.disabled=dis; b.onclick=fn; return b;
}
function mkPg(p, active) {
  const b = document.createElement("button");
  b.className="pg"+(p===active?" on":""); b.textContent=p;
  b.onclick=()=>{ currentPage=p; render(); }; return b;
}
function mkDots() {
  const s=document.createElement("span"); s.className="pg-dots"; s.textContent="…"; return s;
}

// ── Load data ─────────────────────────────────────────────────────────────────
async function loadArticles() {
  showSkeletons();
  ["heroWrap","grid","empty","pagination"].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display="none";
  });
  try {
    const res = await fetch("/api/articles?page=1&per_page=200");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    allArticles = data.articles || [];
    hideSkeletons();
    buildFilters(allArticles);
    buildTicker(allArticles);
    render();
    highlightArticleFromURL();
  } catch(e) {
    hideSkeletons();
    document.getElementById("empty").style.display = "block";
    toast("Failed to load: " + e.message, "err");
  }
}

async function loadStatus() {
  try {
    const r = await fetch("/api/status");
    if (!r.ok) return;
    const d = await r.json();
    document.getElementById("totalArticles").textContent = d.total_articles ?? "—";
    const ran = d.last_scrape?.ran_at;
    document.getElementById("lastScan").textContent = timeAgo(ran);
    document.getElementById("nextScan").textContent  = addDays(ran, 3);
    document.getElementById("statusText").textContent =
      !ran ? "Warming up" : d.last_scrape?.status==="ok" ? "Live" : "Check";
  } catch { document.getElementById("statusText").textContent = "Offline"; }
}

// ── Manual scan ───────────────────────────────────────────────────────────────
async function triggerScan() {
  const b = document.getElementById("scanBtn");
  if (b) b.disabled = true;
  toast("Initiating deep space scan…");
  try {
    await fetch("/api/scrape",{method:"POST"});
    toast("Scan complete — new signals incoming!");
    await Promise.all([loadStatus(), loadArticles()]);
  } catch(e) {
    toast("Scan failed: "+e.message,"err");
  } finally { if(b) b.disabled=false; }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("year").textContent = new Date().getFullYear();
  document.getElementById("scanBtn").addEventListener("click", triggerScan);
  document.getElementById("searchInput").addEventListener("input", e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value.trim();
      currentPage = 1; render();
    }, 240);
  });
  initThemeToggle();
  initBackToTop();
  loadStatus();
  loadArticles();
  setInterval(loadStatus, 30_000);
});
