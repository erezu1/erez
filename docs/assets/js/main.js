// Shared page logic: theme, nav, reveal-on-scroll, publication rendering,
// research page rendering, and a live refresh of citation counts from INSPIRE.
(function () {
  const D = window.SITE_DATA || { papers: [], stats: {}, profile: {} };
  const TOPICS = window.TOPICS || [];
  const SITE = window.SITE || {};
  const INSPIRE_BAI = "Erez.Y.Urbach.1";
  const ME = /Urbach/;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const page = document.body.dataset.page;

  /* ---------- theme ---------- */
  const root = document.documentElement;
  const currentTheme = () => root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  $$(".theme-toggle").forEach(btn => btn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
    window.dispatchEvent(new Event("themechange"));
  }));

  /* ---------- nav ---------- */
  $$(".site-nav a[data-page]").forEach(a => a.classList.toggle("active", a.dataset.page === page));

  /* ---------- reveal ---------- */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.06, rootMargin: "0px 0px -5% 0px" });
  const observeReveals = () => $$(".reveal:not(.in)").forEach(el => io.observe(el));

  /* ---------- math ---------- */
  const math = el => {
    if (!window.renderMathInElement) return;
    renderMathInElement(el, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
      ],
      throwOnError: false,
    });
  };

  /* ---------- helpers ---------- */
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const topicOf = slug => TOPICS.find(t => t.slug === slug);
  function fmtAuthors(list) {
    return (list || []).map(n => {
      const [last, first] = n.split(", ");
      const s = esc(first ? `${first} ${last}` : n);
      return ME.test(last) ? `<b>${s}</b>` : s;
    }).join(", ");
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  function paperHTML(p, { compact = false } = {}) {
    const tags = (p.topics || []).map(s => {
      const t = topicOf(s);
      return t ? `<a class="tag topic-tag" href="research.html#${s}">${esc(t.title)}</a>` : "";
    }).join("");
    const links = [
      p.arxiv_url && `<a href="${p.arxiv_url}" target="_blank" rel="noopener">arXiv:${p.arxiv}</a>`,
      p.doi && `<a href="https://doi.org/${p.doi}" target="_blank" rel="noopener">Journal</a>`,
      p.inspire_url && `<a href="${p.inspire_url}" target="_blank" rel="noopener">INSPIRE</a>`,
    ].filter(Boolean).join("");
    const titleHref = compact ? `publications.html#p-${p.id}` : `#p-${p.id}`;
    return `<li class="pub reveal" id="p-${p.id}" data-id="${p.id}">
      <div class="pub-meta">
        <span>${p.year}</span>
        ${p.arxiv ? `<span>${p.arxiv}</span>` : ""}
        <span class="cites" data-cites="${p.id}">${p.citations ? `<b>${p.citations}</b> citation${p.citations === 1 ? "" : "s"}` : ""}</span>
      </div>
      <div class="pub-body">
        <h3 class="pub-title"><a href="${titleHref}"${compact ? "" : ' data-toggle="abstract"'}>${p.title}</a></h3>
        <div class="pub-authors">${fmtAuthors(p.authors)}</div>
        ${p.journal ? `<div class="pub-journal">${esc(p.journal)}</div>` : ""}
        <div class="pub-links">${links}${tags}</div>
        ${!compact && p.abstract ? `<details class="abstract"><summary>Abstract</summary><div class="abstract-body"><p>${p.abstract}</p></div></details>` : ""}
      </div>
    </li>`;
  }

  /* ---------- live refresh from INSPIRE ---------- */
  // The static JSON is the source of truth at build time; this quietly updates
  // citation counts (and picks up brand-new papers) whenever a visitor loads the page.
  async function liveRefresh() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
      const fields = "control_number,citation_count,titles,arxiv_eprints,earliest_date,authors.full_name,publication_info,dois";
      const url = `https://inspirehep.net/api/literature?q=${encodeURIComponent("a " + INSPIRE_BAI)}&size=250&sort=mostrecent&fields=${fields}`;
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(res.status);
      const j = await res.json();
      let added = 0;
      for (const h of j.hits.hits) {
        const m = h.metadata;
        const p = D.papers.find(q => q.id === m.control_number);
        if (p) { p.citations = m.citation_count || 0; continue; }
        const ax = (m.arxiv_eprints || [{}])[0].value;
        const pi = (m.publication_info || [{}])[0];
        D.papers.push({
          id: m.control_number, title: (m.titles[0].title || "").replace(/<[^>]+>/g, ""),
          authors: (m.authors || []).map(a => a.full_name), arxiv: ax, arxiv_url: ax ? `https://arxiv.org/abs/${ax}` : null,
          doi: (m.dois || [{}])[0].value, journal: pi.journal_title ? `${pi.journal_title} ${pi.journal_volume || ""} (${pi.year || ""})`.trim() : null,
          year: +String(m.earliest_date).slice(0, 4), date: m.earliest_date, citations: m.citation_count || 0, topics: [],
          inspire_url: `https://inspirehep.net/literature/${m.control_number}`,
        });
        added++;
      }
      D.papers.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
      const cites = D.papers.map(p => p.citations).sort((a, b) => b - a);
      D.stats = { papers: D.papers.length, citations: cites.reduce((a, b) => a + b, 0), h_index: cites.filter((c, i) => c >= i + 1).length };
      return { ok: true, added };
    } catch (e) {
      return { ok: false };
    } finally { clearTimeout(timer); }
  }
  function paintStats() {
    const s = D.stats || {};
    const set = (id, v) => { const el = $(id); if (el && v != null) el.textContent = v; };
    set("#stat-papers", s.papers); set("#stat-cites", s.citations); set("#stat-h", s.h_index);
    $$("[data-cites]").forEach(el => {
      const p = D.papers.find(q => String(q.id) === el.dataset.cites);
      if (p) el.innerHTML = p.citations ? `<b>${p.citations}</b> citation${p.citations === 1 ? "" : "s"}` : "";
    });
  }

  /* ---------- texts from content/site.json ---------- */
  const setText = (sel, v) => { const el = $(sel); if (el && v) el.textContent = v; };
  setText("#hero-eyebrow", SITE.eyebrow); setText("#hero-role", SITE.role);
  // the name, with a middle initial such as "Y." set in red italics like in the header
  if ($("#hero-name") && SITE.name) $("#hero-name").innerHTML = esc(SITE.name).replace(/\b([A-Z])\.(?=\s)/, "<em>$1.</em>");
  setText("#research-title", SITE.researchTitle);
  { const key = { home: "home", research: "research", pubs: "publications" }[page]; const t = SITE.titles && SITE.titles[key]; if (t) document.title = t; }
  if ($("#hero-intro")) $("#hero-intro").innerHTML = (SITE.intro || []).map(t => `<p class="lead">${t}</p>`).join("");
  if ($("#hero-links")) $("#hero-links").innerHTML = (SITE.links || []).map(l =>
    `<a class="chip" href="${esc(l.url)}"${/^https?:/i.test(l.url) ? ' target="_blank" rel="noopener"' : ""}>${esc(l.label)}</a>`).join("");
  if ($("#cv-list")) $("#cv-list").innerHTML = (SITE.cv || []).map(e => `<li class="pub reveal">
      <div class="pub-meta"><span>${esc(e.years)}</span></div>
      <div class="pub-body"><h3 class="pub-title">${esc(e.title)}</h3>
        ${e.place ? `<div class="pub-place">${esc(e.place)}</div>` : ""}${e.note ? `<div class="pub-note">${esc(e.note)}</div>` : ""}</div>
    </li>`).join("");

  /* ---------- home ---------- */
  if (page === "home") {
    // show the name in the header only once the big one has scrolled out of view
    const heroName = $("#hero-name");
    if (heroName) new IntersectionObserver(es => es.forEach(e =>
      document.body.classList.toggle("show-brand", !e.isIntersecting && e.boundingClientRect.top < 0)),
      { rootMargin: "-54px 0px 0px 0px", threshold: 0 }).observe(heroName);
    $("#recent").innerHTML = D.papers.slice(0, 3).map(p => paperHTML(p, { compact: true })).join("");
    $("#topic-cards").innerHTML = TOPICS.map(t => `
      <a class="topic-card reveal" href="research.html#${t.slug}">
        <canvas data-anim="${t.anim}" aria-hidden="true"></canvas>
        <div><h3>${esc(t.title)}</h3><p>${esc(t.lead)}</p></div>
      </a>`).join("");
    liveRefresh().then(r => { if (r.ok) paintStats(); });  // keeps per-paper citation counts current
  }

  /* ---------- research ---------- */
  if (page === "research") {
    const nn = n => String(n).padStart(2, "0");
    $("#topics").innerHTML = TOPICS.map((t, i) => `
      <section class="topic" id="${t.slug}">
        <figure class="topic-figure reveal">
          <canvas data-anim="${t.anim}" aria-hidden="true"></canvas>
        </figure>
        <div class="topic-body reveal">
          <div class="eyebrow">${nn(i + 1)} / ${nn(TOPICS.length)}</div>
          <h2><span class="t">${esc(t.title)}</span></h2>
          <p class="lead">${esc(t.lead)}</p>
          ${t.body.map(b => `<p>${b}</p>`).join("")}
          <div class="topic-papers"><h4>Selected publications</h4><ul>${(t.papers || []).map(ax => {
            const p = D.papers.find(q => q.arxiv === ax);
            return p ? `<li><span class="yr">${p.year}</span><span class="t"><a href="publications.html#p-${p.id}">${p.title}</a></span></li>` : "";
          }).join("")}</ul></div>
        </div>
      </section>`).join("");
    $("#toc").innerHTML = TOPICS.map(t => `<a class="chip" href="#${t.slug}">${esc(t.title)}</a>`).join("");
    // Mark the topic whose section crosses a line 42% down the viewport (a thin band, so only one at a time).
    const band = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle("is-current", e.isIntersecting)),
      { rootMargin: "-42% 0px -57.5% 0px", threshold: 0 });
    $$(".topic").forEach(sec => band.observe(sec));
  }

  /* ---------- publications ---------- */
  if (page === "pubs") {
    const state = { q: "", topic: null };
    const list = $("#pub-list"), search = $("#pub-search"), filters = $("#pub-filters");

    filters.innerHTML = [`<button class="chip selected" data-topic="">All</button>`]
      .concat(TOPICS.map(t => `<button class="chip" data-topic="${t.slug}">${esc(t.title)}</button>`)).join("");

    function render() {
      const q = state.q.trim().toLowerCase();
      const items = D.papers.filter(p =>
        (!state.topic || (p.topics || []).includes(state.topic)) &&
        (!q || [p.title, ...(p.authors || []), p.arxiv, p.journal, p.abstract].join(" ").toLowerCase().includes(q)));
      if (!items.length) { list.innerHTML = `<p class="empty">Nothing matches.</p>`; return; }
      // one group per year, so each sticky year label is pushed away by the next
      const groups = new Map();
      for (const p of items) { if (!groups.has(p.year)) groups.set(p.year, []); groups.get(p.year).push(p); }
      list.innerHTML = Array.from(groups, ([year, ps]) =>
        `<li class="year-group"><div class="year-head" aria-hidden="true"><span class="mark">${year}</span></div><ul class="pub-list">${ps.map(p => paperHTML(p)).join("")}</ul></li>`).join("");
      math(list); observeReveals(); highlightMatches(q);
      $("#pub-count").textContent = plural(items.length, "publication");
    }
    // Mark search hits with the highlighter without touching the DOM (keeps KaTeX intact).
    function highlightMatches(q) {
      if (!("highlights" in CSS)) return;
      CSS.highlights.delete("search");
      if (!q) return;
      const hl = new Highlight(), walker = document.createTreeWalker(list, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement.closest(".katex-mathml, .year-head")) continue;
        const text = node.data.toLowerCase();
        for (let i = text.indexOf(q); i !== -1; i = text.indexOf(q, i + q.length)) {
          const r = new Range(); r.setStart(node, i); r.setEnd(node, i + q.length); hl.add(r);
        }
      }
      CSS.highlights.set("search", hl);
    }
    search.addEventListener("input", () => { state.q = search.value; render(); });
    filters.addEventListener("click", e => {
      const b = e.target.closest("[data-topic]"); if (!b) return;
      state.topic = b.dataset.topic || null;
      $$("[data-topic]", filters).forEach(x => x.classList.toggle("selected", x === b));
      render();
    });
    const hash = location.hash.slice(1);
    if (hash && topicOf(hash)) { state.topic = hash; $$("[data-topic]", filters).forEach(x => x.classList.toggle("selected", x.dataset.topic === hash)); }
    render();

    // Abstracts open and close with a height/opacity tween instead of the native snap.
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    function setAbstract(d, open, animate = true) {
      const body = d.querySelector(".abstract-body");
      if (!body || d.dataset.animating || open === d.open) return;
      d.classList.toggle("is-open", open);
      if (!animate || reduceMotion || !body.animate) { d.open = open; return; }
      d.dataset.animating = "1";
      body.style.overflow = "hidden";
      const done = () => { body.style.overflow = ""; delete d.dataset.animating; };
      if (open) {
        d.open = true;
        const h = body.scrollHeight;
        body.animate([{ height: "0px", opacity: 0 }, { height: h + "px", opacity: 1 }],
          { duration: 380, easing: "cubic-bezier(.22,.61,.36,1)" }).onfinish = done;
      } else {
        const h = body.getBoundingClientRect().height;
        body.animate([{ height: h + "px", opacity: 1 }, { height: "0px", opacity: 0 }],
          { duration: 300, easing: "cubic-bezier(.22,.61,.36,1)" }).onfinish = () => { d.open = false; done(); };
      }
    }

    // Deep links: publications.html#p-<inspire id> opens that paper's abstract and scrolls to it.
    function showFromHash(smooth) {
      const m = location.hash.match(/^#p-([\w.:-]+)$/);
      if (!m) return;
      const li = document.getElementById("p-" + m[1]);
      if (!li) return;
      const d = li.querySelector("details.abstract");
      if (d) setAbstract(d, true, smooth);
      li.classList.add("in");
      li.classList.remove("flash"); void li.offsetWidth; li.classList.add("flash");
      li.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
    }
    showFromHash(false);
    window.addEventListener("hashchange", () => showFromHash(true));
    list.addEventListener("click", e => {
      const sum = e.target.closest("summary"), a = e.target.closest("a[data-toggle]");
      if (!sum && !a) return;
      e.preventDefault();
      const li = e.target.closest(".pub"), d = li && li.querySelector("details.abstract");
      if (!d) return;
      const open = !d.classList.contains("is-open");
      setAbstract(d, open);
      history.replaceState(null, "", open ? `#${li.id}` : location.pathname);
    });

    liveRefresh().then(r => { if (r.ok) { paintStats(); if (r.added) render(); } });
  }

  /* ---------- common ---------- */
  // Cross-document view transitions reject their promise when the browser skips one
  // (e.g. a fast back/forward); swallow that so it does not show up as a console error.
  for (const ev of ["pagereveal", "pageswap"]) window.addEventListener(ev, e => {
    const vt = e.viewTransition; if (!vt) return;
    for (const p of [vt.ready, vt.finished, vt.updateCallbackDone]) p && p.catch(() => {});
  });

  $$("[data-fetched]").forEach(el => el.textContent = D.fetched || "");
  math(document.body);
  observeReveals();
  if (window.mountAllAnims) mountAllAnims();

  // portrait fallback: hide the <img> if there is no photo yet
  $$(".portrait img").forEach(img => { img.addEventListener("error", () => { img.hidden = true; }); if (img.complete && !img.naturalWidth) img.hidden = true; });
})();
