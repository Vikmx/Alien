/* AlienSignal – main.js */

// ── State ─────────────────────────────────────────────────────────────────────
let currentPage  = 1;
let activeSource = "all";
let searchQuery  = "";
let allArticles  = [];
let searchTimer  = null;

const ICONS = ["👽","🛸","🌌","🔭","🌠","🪐","⭐","🌙","🚀","🔬","🌍","☄️"];

// ── Canvas starfield ──────────────────────────────────────────────────────────
(function initCanvas() {
  const canvas = document.getElementById("bg");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let W, H, stars = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function mkStars(n) {
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.4 + .3,
      a: Math.random(),
      da: (Math.random() - .5) * .008,
      dy: Math.random() * .12 + .03,
      color: Math.random() < .08
        ? (Math.random() < .5 ? "#00f0a0" : "#4db8ff")
        : "#ffffff",
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      s.a = Math.max(.05, Math.min(1, s.a + s.da));
      if (s.a <= .05 || s.a >= 1) s.da *= -1;
      s.y -= s.dy;
      if (s.y < -2) { s.y = H + 2; s.x = Math.random() * W; }

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.globalAlpha = s.a * .75;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  resize();
  mkStars(220);
  draw();
  window.addEventListener("resize", () => { resize(); mkStars(220); });
})();

// ── Utils ─────────────────────────────────────────────────────────────────────
function esc(s = "") {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
          .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function fmtDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }
  catch { return ""; }
}
function timeAgo(iso) {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (d < 1) return "just now";
  if (d < 60) return d + "m ago";
  if (d < 1440) return Math.floor(d/60) + "h ago";
  return Math.floor(d/1440) + "d ago";
}
function addDays(iso, n) {
  if (!iso) return "—";
  try {
    const d = new Date(iso); d.setDate(d.getDate() + n);
    return d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
  } catch { return "—"; }
}
function toast(msg, type = "ok") {
  const el = document.createElement("div");
  el.className = "toast" + (type === "err" ? " err" : "");
  el.textContent = msg;
  document.getElementById("toasts").appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Skeletons ─────────────────────────────────────────────────────────────────
function showSkeletons() {
  const el = document.getElementById("skeletons");
  el.innerHTML = Array.from({length:12},()=>`
    <div class="skel">
      <div class="sk-h"></div>
      <div class="sk-b">
        <div class="sk-l w30"></div>
        <div class="sk-l w90"></div>
        <div class="sk-l w75"></div>
        <div class="sk-l w55"></div>
      </div>
    </div>`).join("");
  el.style.display = "grid";
}
function hideSkeletons() {
  const el = document.getElementById("skeletons");
  el.style.display = "none";
  el.innerHTML = "";
}

// ── Filters ───────────────────────────────────────────────────────────────────
function buildFilters(articles) {
  const sources = [...new Set(articles.map(a=>a.source).filter(Boolean))].sort();
  const box = document.getElementById("filters");
  box.innerHTML = `<button class="chip active" data-source="all">All sources</button>`;
  sources.forEach(s => {
    const b = document.createElement("button");
    b.className = "chip";
    b.dataset.source = s;
    b.textContent = s.replace(/Google News\s*[–—]\s*/i,"");
    b.title = s;
    box.appendChild(b);
  });
  box.addEventListener("click", e => {
    const b = e.target.closest(".chip");
    if (!b) return;
    box.querySelectorAll(".chip").forEach(c=>c.classList.remove("active"));
    b.classList.add("active");
    activeSource = b.dataset.source;
    currentPage = 1;
    render();
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
function filtered() {
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

function render() {
  const perPage = 12;
  const list = filtered();
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  currentPage = Math.min(currentPage, pages);
  const slice = list.slice((currentPage-1)*perPage, currentPage*perPage);

  const heroWrap = document.getElementById("heroWrap");
  const gridEl   = document.getElementById("grid");
  const emptyEl  = document.getElementById("empty");
  const pagEl    = document.getElementById("pagination");

  if (!list.length) {
    heroWrap.style.display = "none";
    gridEl.style.display   = "none";
    emptyEl.style.display  = "block";
    pagEl.innerHTML = "";
    return;
  }
  emptyEl.style.display = "none";

  const showHero = currentPage === 1 && activeSource === "all" && !searchQuery;
  const hero     = showHero && slice.length ? slice[0] : null;
  const cards    = hero ? slice.slice(1) : slice;

  // Hero
  if (hero) {
    heroWrap.style.display = "block";
    document.getElementById("heroCard").innerHTML = heroHTML(hero);
  } else {
    heroWrap.style.display = "none";
  }

  // Grid
  gridEl.innerHTML = "";
  cards.forEach((a, i) => {
    const div = document.createElement("article");
    div.className = "card";
    div.style.animationDelay = i * .04 + "s";
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
    <article class="hero-article">
      <div class="ha-img">${img}<div class="ha-overlay"></div></div>
      <div class="ha-body">
        <div>
          <div class="ha-tag">📡 ${esc(a.source||"Signal")}</div>
          <h2 class="ha-title" style="margin-top:.75rem">${esc(a.title)}</h2>
          ${a.summary?`<p class="ha-summary" style="margin-top:.65rem">${esc(a.summary)}</p>`:""}
        </div>
        <div class="ha-foot">
          <span class="ha-meta">Via <strong>${esc(a.source||"Unknown")}</strong> · ${fmtDate(a.published_at)}</span>
          <a class="btn-go" href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">
            Read full story →
          </a>
        </div>
      </div>
    </article>`;
}

// ── Card HTML ─────────────────────────────────────────────────────────────────
function cardHTML(a, i) {
  const icon = ICONS[i % ICONS.length];
  const img  = a.image_url
    ? `<div class="c-img"><img src="${esc(a.image_url)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='<div class=c-img-ph>${icon}</div>'"></div>`
    : `<div class="c-img"><div class="c-img-ph">${icon}</div></div>`;
  return `${img}
    <div class="c-body">
      <span class="c-src">${esc(a.source||"Unknown")}</span>
      <h3 class="c-title">${esc(a.title)}</h3>
      ${a.summary?`<p class="c-summary">${esc(a.summary)}</p>`:""}
      <div class="c-foot">
        <span class="c-date">${fmtDate(a.published_at)}</span>
        <a class="c-link" href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">
          Read story →
        </a>
      </div>
    </div>`;
}

// ── Pagination ────────────────────────────────────────────────────────────────
function renderPag(page, pages, el) {
  el.innerHTML = "";
  if (pages <= 1) return;

  const prev = btn("← Prev", page<=1, ()=>{ currentPage=page-1; render(); });
  el.appendChild(prev);

  const range = [];
  for (let i=Math.max(1,page-2); i<=Math.min(pages,page+2); i++) range.push(i);

  if (range[0]>1) {
    el.appendChild(pgBtn(1,page));
    if (range[0]>2) el.appendChild(dots());
  }
  range.forEach(p=>el.appendChild(pgBtn(p,page)));
  if (range.at(-1)<pages) {
    if (range.at(-1)<pages-1) el.appendChild(dots());
    el.appendChild(pgBtn(pages,page));
  }

  el.appendChild(btn("Next →", page>=pages, ()=>{ currentPage=page+1; render(); }));
}
function btn(label, disabled, fn) {
  const b = document.createElement("button");
  b.className="pg"; b.textContent=label; b.disabled=disabled;
  b.onclick=fn; return b;
}
function pgBtn(p, active) {
  const b = document.createElement("button");
  b.className = "pg" + (p===active?" on":"");
  b.textContent = p;
  b.onclick = ()=>{ currentPage=p; render(); };
  return b;
}
function dots() {
  const s = document.createElement("span");
  s.className="pg-dots"; s.textContent="…"; return s;
}

// ── Load data ─────────────────────────────────────────────────────────────────
async function loadArticles() {
  showSkeletons();
  ["heroWrap","grid","empty","pagination"].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.style.display="none";
  });
  try {
    const res = await fetch("/api/articles?page=1&per_page=200");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    allArticles = data.articles || [];
    hideSkeletons();
    buildFilters(allArticles);
    render();
  } catch (e) {
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
  toast("Initiating scan…");
  try {
    await fetch("/api/scrape",{method:"POST"});
    toast("Scan complete!");
    await Promise.all([loadStatus(), loadArticles()]);
  } catch(e) {
    toast("Scan failed: "+e.message,"err");
  } finally {
    if (b) b.disabled = false;
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("year").textContent = new Date().getFullYear();

  document.getElementById("scanBtn").addEventListener("click", triggerScan);

  document.getElementById("searchInput").addEventListener("input", e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value.trim();
      currentPage = 1;
      render();
    }, 250);
  });

  loadStatus();
  loadArticles();
  setInterval(loadStatus, 30_000);
});
