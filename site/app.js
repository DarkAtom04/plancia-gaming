/* Plancia Gaming — interfaccia. Legge data.json (generato ogni 10 minuti) e costruisce le sezioni. */
(function () {
"use strict";
const VIEWS = [
  ["home", "Home"], ["notizie", "Notizie"], ["offerte", "Offerte"], ["gratis", "Gratis"], ["uscite", "Uscite"],
  ["hardware", "PC & Hardware"], ["handheld", "Handheld"], ["tech", "Tech & IA"], ["recensioni", "Recensioni"], ["perte", "Per te"]
];
const CATS = { gaming: "Gaming", offerte: "Offerte", recensioni: "Recensioni", uscite: "Uscite", hardware: "Hardware", handheld: "Handheld", tech: "Tech", ia: "IA" };
const CAT_ORDER = ["offerte", "recensioni", "handheld", "hardware", "ia", "uscite", "tech", "gaming"];
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MESI_L = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const GIORNI_L = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const PLATS = ["PC", "PS5", "Xbox", "Switch 2", "Switch"];
const POLL_MS = 120000;
const $ = s => document.querySelector(s);
const LS = {
  get(k, d) { try { const v = localStorage.getItem("pg." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("pg." + k, JSON.stringify(v)); } catch (e) {} }
};
let D = null;
const st = {
  view: "home", q: "", page: 30, newsCat: "tutte", newsSrc: "tutte", newsPlat: "tutte",
  dealStore: "tutti", dealSort: "cut", dealMax: null, dealLowest: false, dealPage: 48,
  relPlat: "tutte", cal: null, calSel: null, techSub: "tutte",
  seen: new Set(LS.get("seen", [])), kw: LS.get("kw", []), prevVisit: LS.get("lastVisit", null)
};
setTimeout(() => LS.set("lastVisit", new Date().toISOString()), 15000);

/* ---------------------------------------------------------- utilità */
function h(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function safeUrl(u) { try { const x = new URL(String(u || ""), location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } }
function ext(u) { const s = safeUrl(u); return s ? `href="${h(s)}" target="_blank" rel="noopener noreferrer"` : 'href="#"'; }
const pad = n => String(n).padStart(2, "0");
function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function today0() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function parseD(s) { if (typeof s !== "string") return null; let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return new Date(+m[1], +m[2] - 1, +m[3]); m = s.match(/^(\d{4})-(\d{2})$/); if (m) return new Date(+m[1], +m[2] - 1, 1); const t = Date.parse(s); return isFinite(t) ? new Date(t) : null; }
const monthOnly = s => typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
function daysTo(s) { const d = parseD(s); if (!d) return null; const x = new Date(d); x.setHours(0, 0, 0, 0); return Math.round((x - today0()) / 864e5); }
function fmtD(s) { const d = parseD(s); if (!d) return "Da annunciare"; if (monthOnly(s)) return MESI_L[d.getMonth()] + " " + d.getFullYear(); return d.getDate() + " " + MESI[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : ""); }
function hm(iso) { const d = new Date(iso); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function ago(iso) {
  const t = Date.parse(iso); if (!isFinite(t)) return ""; const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "adesso"; if (m < 60) return m + " min fa"; const hh = Math.floor(m / 60); if (hh < 24 && new Date(t).getDate() === new Date().getDate()) return hh + (hh === 1 ? " ora fa" : " ore fa");
  const d = new Date(t); const y = new Date(); y.setDate(y.getDate() - 1); if (d.toDateString() === y.toDateString()) return "ieri " + hm(iso);
  return d.getDate() + " " + MESI[d.getMonth()] + " " + hm(iso);
}
function left(iso) { const t = Date.parse(iso); if (!isFinite(t)) return ""; let s = Math.max(0, (t - Date.now()) / 1000); const dd = Math.floor(s / 86400); s -= dd * 86400; const hh = Math.floor(s / 3600); s -= hh * 3600; const mm = Math.floor(s / 60);
  return dd > 0 ? `${dd} g ${hh} h` : hh > 0 ? `${hh} h ${mm} min` : `${mm} min`; }
const eur = n => typeof n === "number" && isFinite(n) ? (n === 0 ? "Gratis" : n.toLocaleString("it-IT", { style: "currency", currency: "EUR" })) : "";
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function qOk(...f) { if (!st.q) return true; const s = norm(f.map(x => Array.isArray(x) ? x.join(" ") : x).join(" ")); return norm(st.q).split(/\s+/).every(w => s.includes(w)); }
const srcColor = id => { const s = D && D.sources.find(x => x.id === id); return s && s.color || "#8C93A5"; };
const isNew = n => st.prevVisit && Date.parse(n.first || n.date) > Date.parse(st.prevVisit);
const primaryCat = n => CAT_ORDER.find(c => (n.cats || []).includes(c)) || "gaming";
function platTags(list, max) { const L = (list || []).slice(0, max || 6); return L.map(p => `<span class="plat ${h(String(p).replace(" ", ""))}">${h(p)}</span>`).join(""); }
function igUrl(t) { return "https://www.instant-gaming.com/it/ricerca/?q=" + encodeURIComponent(t); }
function itadUrl(t) { return "https://isthereanydeal.com/search/?q=" + encodeURIComponent(t); }

/* --------------------------------------- copertine di riserva generate */
function hash(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const COV = new Map();
function cover(key) {
  key = String(key || "x"); if (COV.has(key)) return COV.get(key);
  const r = rng(hash(key)), h1 = Math.floor(r() * 360), h2 = (h1 + 30 + Math.floor(r() * 70)) % 360, v = Math.floor(r() * 3); let g = "";
  if (v === 0) for (let i = 0; i < 14; i++) g += `<rect x="${-200 + i * 90}" y="-300" width="${10 + Math.floor(r() * 50)}" height="1100" fill="hsl(${h2},90%,65%)" opacity="${(0.06 + r() * 0.16).toFixed(2)}" transform="rotate(25 400 225)"/>`;
  else if (v === 1) { const cx = Math.floor(r() * 800), cy = Math.floor(r() * 450); for (let i = 1; i < 15; i++) g += `<circle cx="${cx}" cy="${cy}" r="${i * 50}" fill="none" stroke="hsl(${h2},90%,72%)" stroke-width="${2 + Math.floor(r() * 8)}" opacity="${(0.05 + r() * 0.15).toFixed(2)}"/>`; }
  else { const cx = Math.floor(r() * 800), cy = Math.floor(r() * 250); for (let i = 0; i < 24; i++) { const a = i * 15 * Math.PI / 180, b = (i * 15 + 7) * Math.PI / 180; g += `<polygon points="${cx},${cy} ${Math.round(cx + 1500 * Math.cos(a))},${Math.round(cy + 1500 * Math.sin(a))} ${Math.round(cx + 1500 * Math.cos(b))},${Math.round(cy + 1500 * Math.sin(b))}" fill="hsl(${h2},95%,72%)" opacity="${(0.04 + r() * 0.1).toFixed(2)}"/>`; } }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1},70%,18%)"/><stop offset="1" stop-color="hsl(${h2},80%,44%)"/></linearGradient></defs><rect width="800" height="450" fill="url(#a)"/>${g}</svg>`;
  const u = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")'; COV.set(key, u); return u;
}
function initials(s) { const w = String(s || "").replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(x => x && x.length > 1); return h((w.slice(0, 2).map(x => x[0]).join("") || "?").toUpperCase()); }
function genDiv(title) { return `<div class="gen" style='background-image:${cover(title)}'><b>${initials(title)}</b></div>`; }
function ph(src, title, cls) {
  const u = safeUrl(src);
  return `<div class="ph ${cls || ""}">${u ? `<img src="${h(u)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-t="${h(title)}">` : genDiv(title)}</div>`;
}
document.addEventListener("error", e => { const t = e.target; if (t && t.tagName === "IMG" && t.dataset.t != null && t.parentNode) { t.outerHTML = genDiv(t.dataset.t); } }, true);

/* ------------------------------------------------------- componenti */
function srcLabel(n) { return `<span class="src" style="--c:${h(srcColor(n.sourceId))}"><i></i>${h(n.source)}</span>`; }
function fontiBtn(n) { return n.also && n.also.length ? `<button type="button" class="fonti" data-also="${h(n.id)}">+${n.also.length} ${n.also.length === 1 ? "fonte" : "fonti"}</button>` : ""; }
function alsoList(n) { return n.also && n.also.length ? `<div class="also" id="also-${h(n.id)}">${n.also.map(a => `<a ${ext(a.url)} data-read="${h(a.url)}"><span class="src" style="--c:${h(srcColor(a.sourceId))}"><i></i>${h(a.source)}</span> · ${h(a.title)}</a>`).join("")}</div>` : ""; }
function newsItem(n) {
  const c = primaryCat(n);
  return `<article class="item ${st.seen.has(n.url) ? "seen" : ""}"><a ${ext(n.url)} data-read="${h(n.url)}" tabindex="-1" aria-hidden="true">${ph(n.img, n.title)}</a>
  <div><div class="meta"><span class="tag ${c}">${CATS[c]}</span>${isNew(n) ? '<span class="newb">NUOVO</span>' : ""}${srcLabel(n)}<span class="when" title="${h(new Date(n.date).toLocaleString("it-IT"))}">${ago(n.date)}</span></div>
  <h3><a ${ext(n.url)} data-read="${h(n.url)}">${h(n.title)}</a></h3>${n.summary ? `<p>${h(n.summary)}</p>` : ""}
  <div class="meta">${platTags(n.plats, 4)}${fontiBtn(n)}</div>${alsoList(n)}</div></article>`;
}
function newsCard(n) {
  const c = primaryCat(n);
  return `<article class="card"><a class="cover-link" ${ext(n.url)} data-read="${h(n.url)}">${ph(n.img, n.title)}</a><div class="over"><span class="tag ${c}">${CATS[c]}</span>${isNew(n) ? '<span class="newb">NUOVO</span>' : ""}</div>
  <div class="body"><h3><a ${ext(n.url)} data-read="${h(n.url)}">${h(n.title)}</a></h3>${n.summary ? `<p>${h(n.summary)}</p>` : ""}<div class="bot"><span class="meta">${srcLabel(n)}<span class="when">${ago(n.date)}</span></span>${fontiBtn(n)}</div>${alsoList(n)}</div></article>`;
}
function dealCard(d) {
  const alt = (d.alt || []).slice(0, 3).map(a => `<a ${ext(a.url)}>${h(a.store)} ${eur(a.price)}</a>`).join("");
  return `<article class="card"><a class="cover-link" ${ext(d.url)}>${ph(d.img, d.title)}</a><div class="over"><span class="storeb">${h(d.store)}</span></div>${d.cut ? `<span class="cutb">-${Math.round(d.cut)}%</span>` : ""}
  <div class="body"><h3><a ${ext(d.url)}>${h(d.title)}</a></h3><div class="meta">${platTags(d.plats, 3)}${d.lowest ? '<span class="pill good">Minimo storico</span>' : ""}${d.best ? '<span class="pill good">Prezzo migliore</span>' : ""}${d.until && Date.parse(d.until) > Date.now() ? `<span class="pill warn">Scade tra ${left(d.until)}</span>` : ""}</div>
  <div class="bot"><div><span class="price">${eur(d.price)}</span>${typeof d.regular === "number" && d.regular > d.price ? `<span class="was">${eur(d.regular)}</span>` : ""}</div></div>
  <div class="cmp">${alt}<a ${ext(igUrl(d.title))}>Instant Gaming</a><a ${ext(itadUrl(d.title))}>Storico prezzi</a></div></div></article>`;
}
function freeCard(f) {
  const soon = f.from && Date.parse(f.from) > Date.now();
  return `<article class="card"><a class="cover-link" ${ext(f.url)}>${ph(f.img, f.title)}</a><div class="over"><span class="storeb">${h(f.service)}</span></div><span class="cutb" style="background:${soon ? "#0B0E17" : "var(--good)"}">${soon ? "PRESTO" : "GRATIS"}</span>
  <div class="body"><h3><a ${ext(f.url)}>${h(f.title)}</a></h3><div class="meta">${platTags(f.plats, 3)}${f.keep === false ? '<span class="pill warn">Con abbonamento</span>' : '<span class="pill good">Resta tuo</span>'}</div>
  <div class="bot"><span class="sub">${soon ? "Dal " + fmtD(f.from.slice(0, 10)) + " alle " + hm(f.from) : f.until ? "Scade tra <b>" + left(f.until) + "</b>" : "Fino a esaurimento"}</span>${f.worth ? `<span class="was">${eur(f.worth)}</span>` : ""}</div>
  <a class="btn" style="justify-content:center;margin-top:4px" ${ext(f.url)}>${soon ? "Vedi la pagina" : "Riscatta ora"}</a></div></article>`;
}
function relCard(r) {
  const d = parseD(r.date), mo = monthOnly(r.date), n = daysTo(r.date);
  return `<article class="card"><a class="cover-link" ${ext(r.url)}>${ph(r.img, r.title)}${d ? `<span class="datebox">${mo ? `<small>${MESI[d.getMonth()]}</small><b>${String(d.getFullYear()).slice(2)}</b>` : `<b>${d.getDate()}</b><small>${MESI[d.getMonth()]}</small>`}</span>` : ""}</a>${r.big ? '<div class="over"><span class="tag offerte">Atteso</span></div>' : ""}
  <div class="body"><h3><a ${ext(r.url)}>${h(r.title)}</a></h3><div class="meta">${platTags(r.plats, 5)}</div>${r.note || r.genre ? `<p>${h([r.genre, r.note].filter(Boolean).join(" · "))}</p>` : ""}
  <div class="bot"><span class="sub">${mo ? "Giorno da annunciare" : n === 0 ? "<b>Esce oggi</b>" : n > 0 ? "Tra " + n + (n === 1 ? " giorno" : " giorni") : "Uscito"}</span></div></div></article>`;
}
function mini(url, img, title, sub) { return `<a class="mini" ${ext(url)}>${ph(img, title)}<div><b>${h(title)}</b><span>${sub}</span></div></a>`; }
function sh(title, side) { return `<div class="sh"><h2>${title}</h2><div class="side">${side || ""}</div></div>`; }
function rail(id, title, href, cards) {
  if (!cards.length) return "";
  return sh(title, `<button class="arrow" type="button" data-rail="${id}" data-dir="-1" aria-label="Indietro">‹</button><button class="arrow" type="button" data-rail="${id}" data-dir="1" aria-label="Avanti">›</button><a class="more" href="${href}">Vedi tutto ›</a>`) + `<div class="rail" id="rail-${id}">${cards.join("")}</div>`;
}
function empty(msg) { return `<div class="empty">${msg}</div>`; }

/* ---------------------------------------------------------- insiemi */
const news = () => (D.news || []).filter(n => qOk(n.title, n.summary, n.source, n.tags));
const byCat = (...c) => news().filter(n => c.some(k => (n.cats || []).includes(k)));
function deals() {
  let L = (D.deals || []).filter(d => qOk(d.title, d.store));
  if (st.dealStore !== "tutti") L = L.filter(d => d.store === st.dealStore);
  if (typeof st.dealMax === "number") L = L.filter(d => d.price <= st.dealMax);
  if (st.dealLowest) L = L.filter(d => d.lowest || d.best);
  if (st.dealSort === "cut") L = L.slice().sort((a, b) => (b.cut || 0) - (a.cut || 0));
  if (st.dealSort === "price") L = L.slice().sort((a, b) => a.price - b.price);
  if (st.dealSort === "name") L = L.slice().sort((a, b) => a.title.localeCompare(b.title, "it"));
  return L;
}
const free = () => (D.free || []).filter(f => qOk(f.title, f.service) && (!f.until || Date.parse(f.until) > Date.now()));
function rels(all) {
  return (D.releases || []).filter(r => qOk(r.title, r.plats, r.note) && (st.relPlat === "tutte" || (r.plats || []).includes(st.relPlat)))
    .filter(r => all || monthOnly(r.date) || daysTo(r.date) >= 0)
    .sort((a, b) => (a.date + (monthOnly(a.date) ? "-28" : "")).localeCompare(b.date + (monthOnly(b.date) ? "-28" : "")));
}
function topStories() {
  const day = Date.now() - 30 * 3600e3;
  const L = (D.news || []).filter(n => n.img && Date.parse(n.date) > day);
  const score = n => (n.size || 1) * 3 + Math.max(0, 6 - (Date.now() - Date.parse(n.date)) / 3600e3) * 0.6 + (n.cats.includes("gaming") ? 1 : 0);
  return L.sort((a, b) => score(b) - score(a)).slice(0, 5);
}

/* ------------------------------------------------------------ viste */
function vHome() {
  const top = topStories(); const ids = new Set(top.map(n => n.id));
  const stream = news().filter(n => !ids.has(n.id));
  const mosaic = top.length ? `<section class="mosaic" aria-label="In primo piano">${top.map((n, i) => `<a class="tile" ${ext(n.url)} data-read="${h(n.url)}">${ph(n.img, n.title)}<div class="cap"><div class="meta"><span class="tag ${primaryCat(n)}">${CATS[primaryCat(n)]}</span>${n.size > 1 ? `<span class="fonti">Ne parlano ${n.size} testate</span>` : ""}</div><h3>${h(n.title)}</h3>${i === 0 && n.summary ? `<p>${h(n.summary)}</p>` : ""}<div class="meta">${srcLabel(n)}<span class="when">${ago(n.date)}</span></div></div></a>`).join("")}</section>` : "";
  const latest = (D.news || []).slice(0, 25);
  const fr = free().filter(f => !f.from || Date.parse(f.from) <= Date.now());
  const wk = rels(false).filter(r => !monthOnly(r.date) && daysTo(r.date) <= 7);
  const srcs = (D.sources || []).filter(s => s.ok).map(s => ({ ...s, n: (D.news || []).filter(n => n.sourceId === s.id || (n.also || []).some(a => a.sourceId === s.id)).length })).sort((a, b) => b.n - a.n);
  let out = mosaic;
  out += `<div class="cols" style="margin-top:28px"><div>${sh("Ultime <em>notizie</em>", `<a class="more" href="#notizie">Tutte le notizie ›</a>`)}
    <div class="stream">${stream.slice(0, st.page).map(newsItem).join("") || empty("Nessuna notizia trovata.")}</div>
    ${stream.length > st.page ? `<button class="btn ghost loadmore" type="button" data-more="news">Carica altre notizie (${stream.length - st.page})</button>` : ""}</div>
    <aside>
      <div class="box"><h4>Ultim'ora <a href="#notizie">Tutte</a></h4><ul class="tl">${latest.map(n => `<li><a ${ext(n.url)} data-read="${h(n.url)}"><time>${hm(n.date)}</time><span>${h(n.title)}<span class="s">${h(n.source)}</span></span></a></li>`).join("")}</ul></div>
      ${fr.length ? `<div class="box"><h4>Gratis ora <a href="#gratis">Tutti</a></h4>${fr.slice(0, 5).map(f => mini(f.url, f.img, f.title, `${h(f.service)}${f.until ? " · scade tra " + left(f.until) : ""}`)).join("")}</div>` : ""}
      ${wk.length ? `<div class="box"><h4>Escono a breve <a href="#uscite">Calendario</a></h4>${wk.slice(0, 6).map(r => mini(r.url, r.img, r.title, `${fmtD(r.date)} · ${h((r.plats || []).join(", "))}`)).join("")}</div>` : ""}
      ${srcs.length ? `<div class="box"><h4>Testate <a href="#fonti">Stato</a></h4><div style="padding:10px 14px;display:flex;flex-wrap:wrap;gap:6px">${srcs.map(s => `<button type="button" class="chip" style="--c:${h(s.color)}" data-gosrc="${h(s.id)}"><i></i>${h(s.name)} <span class="n">${s.n}</span></button>`).join("")}</div></div>` : ""}
    </aside></div>`;
  const dl = (D.deals || []).filter(d => d.img).slice().sort((a, b) => (b.cut || 0) - (a.cut || 0)).slice(0, 16);
  out += rail("deals", "Offerte del <em>giorno</em>", "#offerte", dl.map(dealCard));
  out += rail("free", "Giochi <em>gratis</em>", "#gratis", free().slice(0, 14).map(freeCard));
  const hw = byCat("hardware", "handheld").slice(0, 8); if (hw.length) out += sh("PC, hardware e <em>handheld</em>", `<a class="more" href="#hardware">Altro ›</a>`) + `<div class="grid">${hw.map(newsCard).join("")}</div>`;
  const ti = byCat("tech", "ia").filter(n => !n.cats.includes("gaming") || n.cats.includes("ia")).slice(0, 8); if (ti.length) out += sh("Tech e <em>intelligenza artificiale</em>", `<a class="more" href="#tech">Altro ›</a>`) + `<div class="grid">${ti.map(newsCard).join("")}</div>`;
  const rv = byCat("recensioni").slice(0, 4); if (rv.length) out += sh("Ultime <em>recensioni</em>", `<a class="more" href="#recensioni">Altro ›</a>`) + `<div class="grid">${rv.map(newsCard).join("")}</div>`;
  return out;
}
function vNotizie() {
  let L = news();
  if (st.newsCat !== "tutte") L = L.filter(n => (n.cats || []).includes(st.newsCat));
  if (st.newsSrc !== "tutte") L = L.filter(n => n.sourceId === st.newsSrc || (n.also || []).some(a => a.sourceId === st.newsSrc));
  if (st.newsPlat !== "tutte") L = L.filter(n => (n.plats || []).includes(st.newsPlat));
  const srcs = (D.sources || []).filter(s => s.ok);
  return sh("Tutte le <em>notizie</em>", `<span class="sub">${L.length} notizie dalle ultime 72 ore</span>`) +
    `<div class="filters">${["tutte", ...Object.keys(CATS)].map(c => `<button type="button" class="chip" data-ncat="${c}" aria-pressed="${st.newsCat === c}">${c === "tutte" ? "Tutte" : CATS[c]}</button>`).join("")}</div>
    <div class="filters"><button type="button" class="chip" data-nsrc="tutte" aria-pressed="${st.newsSrc === "tutte"}">Tutte le testate</button>${srcs.map(s => `<button type="button" class="chip" style="--c:${h(s.color)}" data-nsrc="${h(s.id)}" aria-pressed="${st.newsSrc === s.id}"><i></i>${h(s.name)}</button>`).join("")}</div>
    <div class="filters"><button type="button" class="chip" data-nplat="tutte" aria-pressed="${st.newsPlat === "tutte"}">Tutte le piattaforme</button>${PLATS.map(p => `<button type="button" class="chip" data-nplat="${p}" aria-pressed="${st.newsPlat === p}">${p}</button>`).join("")}</div>
    <div class="stream">${L.slice(0, st.page).map(newsItem).join("") || empty("Nessuna notizia con questi filtri.")}</div>
    ${L.length > st.page ? `<button class="btn ghost loadmore" type="button" data-more="news">Carica altre (${L.length - st.page})</button>` : ""}`;
}
function vOfferte() {
  const all = D.deals || []; const stores = [...new Set(all.map(d => d.store))].sort((a, b) => all.filter(d => d.store === b).length - all.filter(d => d.store === a).length);
  const maxP = Math.ceil(Math.max(10, ...all.map(d => d.price || 0))); const cur = st.dealMax == null ? maxP : Math.min(st.dealMax, maxP);
  const L = deals(); const nd = byCat("offerte").slice(0, 12);
  return sh("Offerte <em>giochi PC</em>", `<span class="sub" id="dealCount">${L.length} offerte</span>`) +
    `<div class="filters"><button type="button" class="chip" data-store="tutti" aria-pressed="${st.dealStore === "tutti"}">Tutti gli store <span class="n">${all.length}</span></button>${stores.map(s => `<button type="button" class="chip" data-store="${h(s)}" aria-pressed="${st.dealStore === s}">${h(s)} <span class="n">${all.filter(d => d.store === s).length}</span></button>`).join("")}</div>
    <div class="filters"><select id="dealSort" aria-label="Ordina"><option value="cut">Sconto più alto</option><option value="price">Prezzo più basso</option><option value="pop">Più popolari</option><option value="name">Nome A-Z</option></select>
    <label class="range" for="dealMax">Fino a <span id="dealMaxV">${eur(cur)}</span><input type="range" id="dealMax" min="1" max="${maxP}" step="1" value="${cur}"></label>
    <label class="toggle"><input type="checkbox" id="dealLowest" ${st.dealLowest ? "checked" : ""}> Solo minimi storici e prezzi migliori</label></div>
    <div id="dealGrid">${dealGrid(L)}</div>
    ${nd.length ? sh("Offerte console e Amazon <em>dalle testate</em>", `<a class="more" href="#notizie" data-gocat="offerte">Tutte ›</a>`) + `<div class="grid">${nd.map(newsCard).join("")}</div>` : ""}`;
}
function dealGrid(L) { return L.length ? `<div class="grid">${L.slice(0, st.dealPage).map(dealCard).join("")}</div>${L.length > st.dealPage ? `<button class="btn ghost loadmore" type="button" data-more="deals">Carica altre offerte (${L.length - st.dealPage})</button>` : ""}` : empty("Nessuna offerta con questi filtri."); }
function vGratis() {
  const L = free(); const now = L.filter(f => !f.from || Date.parse(f.from) <= Date.now()), soon = L.filter(f => f.from && Date.parse(f.from) > Date.now());
  const nd = news().filter(n => /gratis|gratuit|free to play|giochi del mese|ps plus|game pass|prime gaming/i.test(n.title)).slice(0, 8);
  return sh("Gratis <em>adesso</em>", `<span class="sub">${now.length} giochi da riscattare</span>`) + (now.length ? `<div class="grid">${now.map(freeCard).join("")}</div>` : empty("Nessun gioco gratis in questo momento.")) +
    (soon.length ? sh("In arrivo <em>gratis</em>") + `<div class="grid">${soon.map(freeCard).join("")}</div>` : "") +
    (nd.length ? sh("Abbonamenti e <em>giochi del mese</em>") + `<div class="grid">${nd.map(newsCard).join("")}</div>` : "");
}
function vUscite() {
  if (!st.cal) { const t = new Date(); st.cal = { y: t.getFullYear(), m: t.getMonth() }; }
  const { y, m } = st.cal; const first = new Date(y, m, 1); const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const R = rels(true); const E = D.events || []; const tk = ymd(today0()); let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i); if (i >= 35 && d.getMonth() !== m) break; const k = ymd(d);
    const L = R.filter(r => r.date === k).sort((a, b) => (b.big ? 1 : 0) - (a.big ? 1 : 0) || (b.img ? 1 : 0) - (a.img ? 1 : 0)); const ev = E.filter(e => e.start === k);
    cells += `<button type="button" class="cell ${d.getMonth() !== m ? "out" : ""} ${k === tk ? "today" : ""}" data-day="${k}" aria-pressed="${st.calSel === k}" aria-label="${d.getDate()} ${MESI_L[d.getMonth()]}: ${L.length} uscite">
      <span class="num">${d.getDate()}</span>${ev.map(e => `<span class="ev">${h(e.name)}</span>`).join("")}
      ${L.length ? `<span class="thumbs">${L.slice(0, 2).map(r => ph(r.img, r.title)).join("")}</span>${L.slice(0, 2).map(r => `<span class="t ${r.big ? "big" : ""}">${h(r.title)}</span>`).join("")}${L.length > 2 ? `<span class="sub" style="font-size:11px">+${L.length - 2} altri</span>` : ""}` : ""}</button>`;
  }
  const mo = R.filter(r => r.date === y + "-" + pad(m + 1));
  let sel = ""; if (st.calSel) { const L = R.filter(r => r.date === st.calSel); sel = sh(fmtD(st.calSel)) + (L.length ? `<div class="grid">${L.map(relCard).join("")}</div>` : empty("Nessuna uscita in questo giorno.")); }
  const next = R.filter(r => !monthOnly(r.date) && daysTo(r.date) >= 0 && daysTo(r.date) <= 14);
  const big = R.filter(r => r.big && (monthOnly(r.date) || daysTo(r.date) >= 0)).slice(0, 16);
  const ev = E.filter(e => !e.end || daysTo(e.end) >= 0).sort((a, b) => a.start.localeCompare(b.start));
  return sh("Calendario <em>uscite</em>", `<span class="sub">Tocca un giorno per vedere i giochi</span>`) +
    `<div class="filters"><button type="button" class="chip" data-rplat="tutte" aria-pressed="${st.relPlat === "tutte"}">Tutte</button>${PLATS.map(p => `<button type="button" class="chip" data-rplat="${p}" aria-pressed="${st.relPlat === p}">${p}</button>`).join("")}</div>
    <div class="cal-head"><button class="arrow" type="button" data-cal="-1" aria-label="Mese precedente">‹</button><h3>${MESI_L[m]} ${y}</h3><button class="arrow" type="button" data-cal="1" aria-label="Mese successivo">›</button><button class="btn ghost" type="button" data-cal="0">Oggi</button></div>
    <div class="calwrap"><div class="cal">${["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(g => `<div class="wd">${g}</div>`).join("")}${cells}</div></div>
    ${mo.length ? `<p class="sub">Nel mese, giorno ancora da annunciare: ${mo.map(r => `<b>${h(r.title)}</b>`).join(", ")}</p>` : ""}${sel}
    ${ev.length ? sh("Saldi ed <em>eventi</em>") + `<div class="events">${ev.map(e => { const on = daysTo(e.start) <= 0 && (!e.end || daysTo(e.end) >= 0); return `<a class="ev-c ${on ? "on" : ""}" ${ext(e.url)}>${on ? '<span class="pill good" style="align-self:flex-start">In corso</span>' : ""}<b>${h(e.name)}</b><span>${fmtD(e.start)}${e.end ? " → " + fmtD(e.end) : ""}</span>${e.note ? `<span>${h(e.note)}</span>` : ""}</a>`; }).join("")}</div>` : ""}
    ${next.length ? sh("Prossimi <em>14 giorni</em>") + `<div class="grid">${next.map(relCard).join("")}</div>` : ""}
    ${big.length ? sh("I più <em>attesi</em>") + `<div class="grid">${big.map(relCard).join("")}</div>` : ""}`;
}
function vCat(title, cats, sub) {
  let L = byCat(...cats); if (sub) L = L.filter(sub);
  return sh(title, `<span class="sub">${L.length} notizie</span>`) + (L.length ? `<div class="grid g3">${L.slice(0, st.page).map(newsCard).join("")}</div>${L.length > st.page ? `<button class="btn ghost loadmore" type="button" data-more="news">Carica altre (${L.length - st.page})</button>` : ""}` : empty("Nessuna notizia in questa sezione al momento."));
}
function vTech() {
  const f = st.techSub === "ia" ? n => n.cats.includes("ia") : st.techSub === "tech" ? n => n.cats.includes("tech") && !n.cats.includes("ia") : null;
  return `<div class="filters" style="margin-bottom:0">${[["tutte", "Tutto"], ["tech", "Tecnologia"], ["ia", "Intelligenza artificiale"]].map(([k, l]) => `<button type="button" class="chip" data-tsub="${k}" aria-pressed="${st.techSub === k}">${l}</button>`).join("")}</div>` + vCat("Tech e <em>IA</em>", ["tech", "ia"], f);
}
function matches() {
  const kws = st.kw.map(norm).filter(Boolean); if (!kws.length) return { news: [], deals: [], free: [], rels: [] };
  const hit = s => { s = norm(s); return kws.some(k => s.includes(k)); };
  return { news: (D.news || []).filter(n => hit(n.title + " " + n.summary)), deals: (D.deals || []).filter(d => hit(d.title)), free: (D.free || []).filter(f => hit(f.title)), rels: (D.releases || []).filter(r => hit(r.title)) };
}
function vPerte() {
  const M = matches(); const perm = "Notification" in window ? Notification.permission : "unsupported";
  return sh("Per <em>te</em>", `<span class="sub">Scrivi i giochi, le console o i pezzi che ti interessano</span>`) +
    `<form class="watch-form" id="kwForm"><input id="kwIn" maxlength="60" placeholder="Es. GTA VI, Silksong, RTX 5070, Steam Deck, Zelda" aria-label="Parola da seguire"><button class="btn" type="submit">Segui</button>
    ${perm === "default" ? `<button class="btn ghost" type="button" id="notifBtn">Attiva avvisi sul dispositivo</button>` : perm === "granted" ? '<span class="pill good" style="align-self:center">Avvisi attivi</span>' : ""}</form>
    <div class="filters">${st.kw.map((k, i) => `<span class="kw">${h(k)}<button type="button" data-delkw="${i}" aria-label="Smetti di seguire ${h(k)}">×</button></span>`).join("") || '<span class="sub">Non segui ancora niente: aggiungi il primo titolo qui sopra.</span>'}</div>
    ${st.kw.length ? (
      (M.deals.length ? sh("Offerte che ti <em>interessano</em>") + `<div class="grid">${M.deals.map(dealCard).join("")}</div>` : "") +
      (M.free.length ? sh("Gratis per <em>te</em>") + `<div class="grid">${M.free.map(freeCard).join("")}</div>` : "") +
      (M.rels.length ? sh("Uscite che <em>segui</em>") + `<div class="grid">${M.rels.map(relCard).join("")}</div>` : "") +
      (M.news.length ? sh("Notizie che <em>segui</em>") + `<div class="stream">${M.news.slice(0, 40).map(newsItem).join("")}</div>` : "") +
      (!M.deals.length && !M.free.length && !M.rels.length && !M.news.length ? empty("Al momento non c'è niente su quello che segui. Ti avviso appena compare.") : "")) : ""}`;
}
function vFonti() {
  const H = D.health || [];
  return sh("Stato delle <em>fonti</em>", `<span class="sub">Ultimo aggiornamento ${new Date(D.generatedAt).toLocaleString("it-IT")}</span>`) +
    `<div class="health">${H.map(x => `<div><span>${h(x.name)}</span><b class="${x.ok ? "" : "ko"}">${x.ok ? (x.count != null ? x.count + " elementi" : "ok") : "non raggiungibile"}</b></div>`).join("")}</div>
    <p class="sub" style="margin-top:14px">Le notizie restano in pagina 72 ore. Le stesse notizie pubblicate da più testate vengono raggruppate: tocca "+N fonti" per leggerle tutte.</p>`;
}
function vCerca() {
  const N = news().slice(0, 60), Dl = (D.deals || []).filter(d => qOk(d.title, d.store)).slice(0, 24), F = free(), R = rels(true).slice(0, 24);
  return sh(`Risultati per <em>“${h(st.q)}”</em>`, `<button class="btn ghost" type="button" id="clearQ">Cancella ricerca</button>`) +
    (Dl.length ? sh("Offerte") + `<div class="grid">${Dl.map(dealCard).join("")}</div>` : "") + (F.length ? sh("Gratis") + `<div class="grid">${F.map(freeCard).join("")}</div>` : "") +
    (R.length ? sh("Uscite") + `<div class="grid">${R.map(relCard).join("")}</div>` : "") + (N.length ? sh("Notizie") + `<div class="stream">${N.map(newsItem).join("")}</div>` : "") +
    (!N.length && !Dl.length && !F.length && !R.length ? empty("Nessun risultato. Prova con un'altra parola.") : "");
}

/* ----------------------------------------------------------- render */
function renderNav() {
  const M = st.kw.length ? matches() : null; const nNew = (D.news || []).filter(isNew).length;
  const c = { notizie: nNew ? nNew : (D.news || []).length, offerte: (D.deals || []).length, gratis: free().filter(f => !f.from || Date.parse(f.from) <= Date.now()).length, perte: M ? M.deals.length + M.free.length + M.news.filter(isNew).length : 0 };
  $("#nav").innerHTML = VIEWS.map(([id, l]) => `<a href="#${id}" class="${(id === "notizie" && nNew) || (id === "perte" && c.perte) ? "hot" : ""}" ${st.view === id && !st.q ? 'aria-current="page"' : ""}>${l}${c[id] ? `<span class="n">${c[id]}</span>` : ""}</a>`).join("");
}
function renderLive() {
  const el = $("#live"), t = $("#liveTxt"); if (!D) return; const m = Math.round((Date.now() - Date.parse(D.generatedAt)) / 60000);
  el.className = "live " + (m < 40 ? "on" : "old"); t.textContent = "Aggiornato " + (m < 1 ? "ora" : m < 60 ? m + " min fa" : Math.round(m / 60) + " h fa") + " · ogni 10 min";
}
function renderTicker() {
  const L = (D.news || []).slice(0, 14); if (!L.length) { $("#ticker").hidden = true; return; }
  const one = L.map(n => `<a ${ext(n.url)} data-read="${h(n.url)}"><time>${hm(n.date)}</time><span>${h(n.title)}</span></a>`).join("");
  $("#tkTrack").innerHTML = one + one; $("#ticker").hidden = false;
}
function render(keepScroll) {
  if (!D) return; renderNav(); renderLive(); renderTicker();
  const f = st.q ? vCerca : { home: vHome, notizie: vNotizie, offerte: vOfferte, gratis: vGratis, uscite: vUscite, hardware: () => vCat("PC, hardware e <em>componenti</em>", ["hardware", "handheld"]), handheld: () => vCat("Handheld e <em>PC portatili da gioco</em>", ["handheld"]), tech: vTech, recensioni: () => vCat("<em>Recensioni</em> e prove", ["recensioni"]), perte: vPerte, fonti: vFonti }[st.view] || vHome;
  let html; try { html = f(); } catch (e) { console.error(e); html = `<div class="notice">Questa sezione non si è caricata. Le altre funzionano: riprova tra qualche minuto.</div>`; }
  const ok = (D.sources || []).filter(s => s.ok).length;
  if (ok === 0) html = `<div class="notice">Nessuna testata raggiungibile all'ultimo aggiornamento: riprovo da solo tra 10 minuti.</div>` + html;
  const y = window.scrollY; $("#main").innerHTML = html; if (keepScroll) window.scrollTo(0, y);
  const ds = $("#dealSort"); if (ds) ds.value = st.dealSort;
  $("#footSrc").innerHTML = "Fonti: " + (D.sources || []).filter(s => s.ok).map(s => `<a href="${h(s.home)}" target="_blank" rel="noopener noreferrer">${h(s.name)}</a>`).join(", ") + ` · <a href="#fonti">Stato delle fonti</a>`;
}
function route() { const id = (location.hash || "").slice(1); st.view = VIEWS.some(v => v[0] === id) || id === "fonti" ? id : "home"; st.page = 30; st.dealPage = 48; if (st.q) { st.q = ""; $("#q").value = ""; } render(); window.scrollTo(0, 0); }

/* ----------------------------------------------------------- eventi */
let toastT; function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2800); }
function markRead(u) { if (!u) return; st.seen.add(u); const a = [...st.seen].slice(-600); LS.set("seen", a); }
document.addEventListener("click", e => {
  const t = e.target;
  const rd = t.closest("[data-read]"); if (rd) { markRead(rd.dataset.read); const it = rd.closest(".item"); if (it) it.classList.add("seen"); return; }
  const al = t.closest("[data-also]"); if (al) { const b = document.getElementById("also-" + al.dataset.also); if (b) b.classList.toggle("open"); return; }
  const rb = t.closest("[data-rail]"); if (rb) { const r = document.getElementById("rail-" + rb.dataset.rail); if (r) r.scrollBy({ left: +rb.dataset.dir * r.clientWidth * 0.85, behavior: "smooth" }); return; }
  const mo = t.closest("[data-more]"); if (mo) { if (mo.dataset.more === "deals") { st.dealPage += 48; $("#dealGrid").innerHTML = dealGrid(deals()); } else { st.page += 30; render(true); } return; }
  const set = (k, v) => { st[k] = v; st.page = 30; render(true); };
  let x;
  if ((x = t.closest("[data-ncat]"))) return set("newsCat", x.dataset.ncat);
  if ((x = t.closest("[data-nsrc]"))) return set("newsSrc", x.dataset.nsrc);
  if ((x = t.closest("[data-nplat]"))) return set("newsPlat", x.dataset.nplat);
  if ((x = t.closest("[data-tsub]"))) return set("techSub", x.dataset.tsub);
  if ((x = t.closest("[data-rplat]"))) return set("relPlat", x.dataset.rplat);
  if ((x = t.closest("[data-gosrc]"))) { st.newsSrc = x.dataset.gosrc; st.newsCat = "tutte"; location.hash = "#notizie"; return; }
  if ((x = t.closest("[data-gocat]"))) { st.newsCat = x.dataset.gocat; return; }
  if ((x = t.closest("[data-store]"))) { st.dealStore = x.dataset.store; st.dealPage = 48; document.querySelectorAll("[data-store]").forEach(b => b.setAttribute("aria-pressed", b === x ? "true" : "false")); updDeals(); return; }
  if ((x = t.closest("[data-cal]"))) { const d = +x.dataset.cal; if (!d) { const n = new Date(); st.cal = { y: n.getFullYear(), m: n.getMonth() }; st.calSel = ymd(today0()); } else { let { y, m } = st.cal; m += d; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } st.cal = { y, m }; } render(true); return; }
  if ((x = t.closest("[data-day]"))) { st.calSel = st.calSel === x.dataset.day ? null : x.dataset.day; render(true); return; }
  if ((x = t.closest("[data-delkw]"))) { st.kw.splice(+x.dataset.delkw, 1); LS.set("kw", st.kw); render(true); return; }
  if (t.closest("#notifBtn")) { Notification.requestPermission().then(p => { toast(p === "granted" ? "Avvisi attivi su questo dispositivo" : "Avvisi non attivati"); render(true); }); return; }
  if (t.closest("#clearQ")) { st.q = ""; $("#q").value = ""; render(); return; }
});
function updDeals() { const L = deals(); const g = $("#dealGrid"); if (g) g.innerHTML = dealGrid(L); const c = $("#dealCount"); if (c) c.textContent = L.length + " offerte"; }
document.addEventListener("change", e => {
  if (e.target.id === "dealSort") { st.dealSort = e.target.value; updDeals(); }
  if (e.target.id === "dealLowest") { st.dealLowest = e.target.checked; updDeals(); }
});
document.addEventListener("input", e => { if (e.target.id === "dealMax") { st.dealMax = +e.target.value; $("#dealMaxV").textContent = eur(st.dealMax); updDeals(); } });
document.addEventListener("submit", e => {
  if (e.target.id === "kwForm") { e.preventDefault(); const v = $("#kwIn").value.trim(); if (v && !st.kw.some(k => norm(k) === norm(v))) { st.kw.push(v); LS.set("kw", st.kw); toast("Ora segui: " + v); } render(true); }
  if (e.target.id === "searchForm") e.preventDefault();
});
let qT; $("#q").addEventListener("input", e => { clearTimeout(qT); qT = setTimeout(() => { st.q = e.target.value.trim(); render(); }, 180); });
window.addEventListener("hashchange", route);
$("#themeBtn").addEventListener("click", () => { const r = document.documentElement; const cur = r.dataset.theme || "auto"; const nx = cur === "auto" ? "dark" : cur === "dark" ? "light" : "auto"; if (nx === "auto") delete r.dataset.theme; else r.dataset.theme = nx; LS.set("theme", nx === "auto" ? null : nx); try { if (nx === "auto") localStorage.removeItem("pg.theme"); else localStorage.setItem("pg.theme", nx); } catch (e) {} toast(nx === "auto" ? "Tema automatico" : nx === "dark" ? "Tema scuro" : "Tema chiaro"); });
(function () { const d = new Date(); $("#today").textContent = GIORNI_L[d.getDay()].replace(/^./, c => c.toUpperCase()) + " " + d.getDate() + " " + MESI_L[d.getMonth()].toLowerCase() + " " + d.getFullYear(); })();

/* ---------------------------------------------- dati e aggiornamenti */
function notifyMatches(oldIds) {
  if (!("Notification" in window) || Notification.permission !== "granted" || !st.kw.length) return;
  const M = matches(); const fresh = [...M.deals.map(d => ({ k: "d" + d.url, t: `${d.title}: ${eur(d.price)} su ${d.store}`, u: d.url })), ...M.free.map(f => ({ k: "f" + f.url, t: `Gratis: ${f.title}`, u: f.url })), ...M.news.map(n => ({ k: "n" + n.url, t: n.title, u: n.url }))];
  const done = new Set(LS.get("notified", [])); let n = 0;
  for (const x of fresh) { if (done.has(x.k) || (oldIds && oldIds.has(x.k))) continue; done.add(x.k); if (n++ < 3) { try { const no = new Notification("Plancia Gaming", { body: x.t, tag: x.k }); no.onclick = () => window.open(x.u, "_blank"); } catch (e) {} } }
  LS.set("notified", [...done].slice(-800));
}
async function load(first) {
  try {
    const r = await fetch("data.json?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) throw new Error(r.status);
    const nd = await r.json();
    if (first) { D = nd; render(); if (st.kw.length) { const M = matches(); LS.set("notified", [...new Set([...LS.get("notified", []), ...M.deals.map(d => "d" + d.url), ...M.free.map(f => "f" + f.url), ...M.news.map(n => "n" + n.url)])].slice(-800)); } return; }
    if (D && nd.generatedAt === D.generatedAt) { renderLive(); return; }
    const old = new Set((D.news || []).map(n => n.url)); const nNew = (nd.news || []).filter(n => !old.has(n.url)).length;
    const apply = () => { D = nd; render(true); $("#newPill").hidden = true; notifyMatches(); };
    const typing = document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName);
    if (window.scrollY < 300 && !typing) { apply(); if (nNew) toast(nNew + (nNew === 1 ? " nuova notizia" : " nuove notizie")); }
    else if (nNew) { const p = $("#newPill"); p.textContent = "↑ " + nNew + (nNew === 1 ? " nuova notizia" : " nuove notizie"); p.hidden = false; p.onclick = () => { apply(); window.scrollTo({ top: 0, behavior: "smooth" }); }; }
    else { D = nd; renderLive(); renderNav(); }
  } catch (e) {
    if (first) $("#main").innerHTML = `<div class="notice">Non riesco a caricare i dati in questo momento. Riprovo da solo tra due minuti.</div>`;
    $("#liveTxt").textContent = "Connessione assente, riprovo…";
  }
}
route(); load(true);
setInterval(() => load(false), POLL_MS);
setInterval(renderLive, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(false); });
})();
