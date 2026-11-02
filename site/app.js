/* Plancia Gaming — interfaccia. Legge data.json (rigenerato ogni 5 minuti) e costruisce le sezioni. */
(function () {
"use strict";
const VIEWS = [
  ["home", "Home"], ["notizie", "Notizie"], ["offerte", "Offerte"], ["gratis", "Gratis"], ["uscite", "Uscite"], ["video", "Video"],
  ["hardware", "PC & Hardware"], ["handheld", "Handheld"], ["tech", "Tech & IA"], ["recensioni", "Recensioni"], ["perte", "Per te"]
];
const CATS = { gaming: "Gaming", offerte: "Offerte", recensioni: "Recensioni", uscite: "Uscite", hardware: "Hardware", handheld: "Handheld", tech: "Tech", ia: "IA" };
const CAT_ORDER = ["offerte", "recensioni", "handheld", "hardware", "ia", "uscite", "gaming", "tech"];
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MESI_L = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const GIORNI_L = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const PLATS = ["PC", "PS5", "Xbox", "Switch 2", "Switch"];
const POLL_MS = 60000;
const $ = s => document.querySelector(s);
const LS = {
  get(k, d) { try { const v = localStorage.getItem("pg." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { if (v == null) localStorage.removeItem("pg." + k); else localStorage.setItem("pg." + k, JSON.stringify(v)); } catch (e) {} }
};
let D = null;
const st = {
  view: "home", q: "", page: 30, newsCat: "tutte", newsSrc: "tutte", newsPlat: "tutte",
  dealStore: "tutti", dealPlat: "tutte", dealSort: "best", dealMax: null, dealLowest: false, dealPage: 48,
  relPlat: "tutte", hhSort: "perf", hhOs: "tutti", hhMax: null, hhCmp: LS.get("hhCmp", []), hhOpen: null, cal: null, calSel: null, techSub: "tutte", vidCh: "tutti",
  seen: new Set(LS.get("seen", [])), kw: LS.get("kw", []), saved: LS.get("saved", []), prevVisit: LS.get("lastVisit", null),
  lang: LS.get("lang", "tutte"), hidden: new Set(LS.get("hidden", [])), token: LS.get("ghToken", ""), forcing: null
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
const eur = (n, cur) => typeof n === "number" && isFinite(n) ? (n === 0 ? "Gratis" : n.toLocaleString("it-IT", { style: "currency", currency: cur || "EUR", currencyDisplay: "narrowSymbol" })) : "";
const dealPlat = d => (d.plats || []).some(p => /^PS/.test(p)) ? "PlayStation" : (d.plats || []).includes("Xbox") ? "Xbox" : (d.plats || []).some(p => /Switch/.test(p)) ? "Nintendo" : "PC";
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function qOk(...f) { if (!st.q) return true; const s = norm(f.map(x => Array.isArray(x) ? x.join(" ") : x).join(" ")); return norm(st.q).split(/\s+/).every(w => s.includes(w)); }
const srcOf = id => D && D.sources.find(x => x.id === id) || {};
const srcColor = id => srcOf(id).color || "#8C93A5";
function fav(id) { const hm0 = srcOf(id).home; if (!hm0) return ""; try { return `<img class="fav" src="https://www.google.com/s2/favicons?domain=${h(new URL(hm0).hostname)}&sz=32" alt="" loading="lazy" referrerpolicy="no-referrer">`; } catch (e) { return ""; } }
const isNew = n => st.prevVisit && Date.parse(n.first || n.date) > Date.parse(st.prevVisit);
const primaryCat = n => CAT_ORDER.find(c => (n.cats || []).includes(c)) || "gaming";
function platTags(list, max) { const L = (list || []).slice(0, max || 6); return L.map(p => `<span class="plat ${h(String(p).replace(" ", ""))}">${h(p)}</span>`).join(""); }
const igUrl = t => "https://www.instant-gaming.com/it/ricerca/?q=" + encodeURIComponent(t);
const itadUrl = t => "https://isthereanydeal.com/search/?q=" + encodeURIComponent(t);
const savedSet = () => new Set(st.saved.map(x => x.url));

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
function ph(src, title, cls, extra) {
  const u = safeUrl(src);
  return `<div class="ph ${cls || ""}">${u ? `<img src="${h(u)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-t="${h(title)}">` : genDiv(title)}${extra || ""}</div>`;
}
document.addEventListener("error", e => { const t = e.target; if (t && t.tagName === "IMG") { if (t.dataset.t != null && t.parentNode) t.outerHTML = genDiv(t.dataset.t); else if (t.classList.contains("fav")) t.remove(); } }, true);

/* ------------------------------------------------------- componenti */
function srcLabel(n) { return `<span class="src" style="--c:${h(srcColor(n.sourceId))}">${fav(n.sourceId) || "<i></i>"}${h(n.source)}${n.lang === "en" ? '<span class="en">EN</span>' : ""}</span>`; }
function fontiBtn(n) { return n.also && n.also.length ? `<button type="button" class="fonti" data-also="${h(n.id)}">+${n.also.length} ${n.also.length === 1 ? "fonte" : "fonti"}</button>` : ""; }
function alsoList(n) { return n.also && n.also.length ? `<div class="also" id="also-${h(n.id)}">${n.also.map(a => `<a ${ext(a.url)} data-read="${h(a.url)}"><span class="src" style="--c:${h(srcColor(a.sourceId))}">${fav(a.sourceId) || "<i></i>"}${h(a.source)}</span> ${h(a.title)}</a>`).join("")}</div>` : ""; }
function saveBtn(n, ss) { const on = ss.has(n.url); return `<button type="button" class="save ${on ? "on" : ""}" data-save="${h(n.url)}" aria-pressed="${on}" title="${on ? "Togli dai salvati" : "Salva per dopo"}" aria-label="${on ? "Togli dai salvati" : "Salva per dopo"}">${on ? "★" : "☆"}</button>`; }
const isVideoNews = n => /\b(trailer|video|gameplay|teaser|filmato)\b/i.test(n.title);
const playIco = '<span class="play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>';
function newsItem(n, ss) {
  const c = primaryCat(n);
  return `<article class="item ${st.seen.has(n.url) ? "seen" : ""}"><a ${ext(n.url)} data-read="${h(n.url)}" tabindex="-1" aria-hidden="true">${ph(n.img, n.title, "", isVideoNews(n) ? playIco : "")}</a>
  <div><div class="meta"><span class="tag ${c}">${CATS[c]}</span>${isNew(n) ? '<span class="newb">NUOVO</span>' : ""}${srcLabel(n)}<span class="when" title="${h(new Date(n.date).toLocaleString("it-IT"))}">${ago(n.date)}</span></div>
  <h3><a ${ext(n.url)} data-read="${h(n.url)}">${h(n.title)}</a></h3>${n.summary ? `<p>${h(n.summary)}</p>` : ""}
  <div class="meta">${platTags(n.plats, 4)}${fontiBtn(n)}<span class="grow"></span>${saveBtn(n, ss)}</div>${alsoList(n)}</div></article>`;
}
function newsCard(n, ss) {
  const c = primaryCat(n);
  return `<article class="card"><a class="cover-link" ${ext(n.url)} data-read="${h(n.url)}">${ph(n.img, n.title, "", isVideoNews(n) ? playIco : "")}</a><div class="over"><span class="tag ${c}">${CATS[c]}</span>${isNew(n) ? '<span class="newb">NUOVO</span>' : ""}</div>
  <div class="body"><h3><a ${ext(n.url)} data-read="${h(n.url)}">${h(n.title)}</a></h3>${n.summary ? `<p>${h(n.summary)}</p>` : ""}<div class="bot"><span class="meta">${srcLabel(n)}<span class="when">${ago(n.date)}</span></span><span class="meta">${fontiBtn(n)}${saveBtn(n, ss)}</span></div>${alsoList(n)}</div></article>`;
}
function dealCard(d) {
  const c = d.cur; const pc = dealPlat(d) === "PC";
  const alt = (d.alt || []).slice(0, 3).map(a => `<a ${ext(a.url)}>${h(a.store)} ${eur(a.price, c)}</a>`).join("");
  return `<article class="card deal"><a class="cover-link" ${ext(d.url)}>${ph(d.img, d.title)}</a><div class="over"><span class="storeb s-${h(String(d.store).toLowerCase().replace(/\W+/g, ""))}">${h(d.store)}</span>${d.bestseller ? '<span class="storeb hotb">Più venduto</span>' : ""}</div>${d.cut ? `<span class="cutb">-${Math.round(d.cut)}%</span>` : ""}
  <div class="body"><h3><a ${ext(d.url)}>${h(d.title)}</a></h3><div class="meta">${platTags(d.plats, 3)}${d.lowest ? '<span class="pill good">Minimo storico</span>' : ""}${d.best ? '<span class="pill good">Prezzo migliore</span>' : ""}${d.until && Date.parse(d.until) > Date.now() ? `<span class="pill warn">Scade tra ${left(d.until)}</span>` : ""}</div>
  <div class="bot"><div><span class="price">${eur(d.price, c)}</span>${typeof d.regular === "number" && d.regular > d.price ? `<span class="was">${eur(d.regular, c)}</span>` : ""}</div>${typeof d.regular === "number" && d.regular > d.price ? `<span class="save-eur">Risparmi ${eur(d.regular - d.price, c)}</span>` : ""}</div>
  ${c === "USD" ? '<p class="curnote">Prezzo del negozio USA: in Italia può variare</p>' : ""}${d.plus ? '<p class="curnote">Sconto extra con PS Plus</p>' : ""}
  <div class="cmp">${alt}${pc ? `<a ${ext(igUrl(d.title))}>Cerca su Instant Gaming</a><a ${ext(itadUrl(d.title))}>Storico prezzi</a>` : `<a ${ext("https://www.instant-gaming.com/it/ricerca/?q=" + encodeURIComponent(d.title))}>Chiave su Instant Gaming</a>`}</div></div></article>`;
}
function freeCard(f) {
  const soon = f.from && Date.parse(f.from) > Date.now();
  const urgent = !soon && f.until && Date.parse(f.until) - Date.now() < 48 * 3600e3;
  return `<article class="card"><a class="cover-link" ${ext(f.url)}>${ph(f.img, f.title)}</a><div class="over"><span class="storeb">${h(f.service)}</span></div><span class="cutb ${soon ? "dark" : "green"}">${soon ? "PRESTO" : "GRATIS"}</span>
  <div class="body"><h3><a ${ext(f.url)}>${h(f.title)}</a></h3><div class="meta">${platTags(f.plats, 3)}${f.keep === false ? '<span class="pill warn">Con abbonamento</span>' : '<span class="pill good">Resta tuo</span>'}</div>
  <div class="bot"><span class="sub ${urgent ? "urgent" : ""}">${soon ? "Dal " + fmtD(f.from.slice(0, 10)) + " alle " + hm(f.from) : f.until ? "Scade tra <b>" + left(f.until) + "</b>" : "Fino a esaurimento"}</span>${f.worth ? `<span class="was">${eur(f.worth)}</span>` : ""}</div>
  <a class="btn block" ${ext(f.url)}>${soon ? "Vedi la pagina" : "Riscatta ora"}</a></div></article>`;
}
function relCard(r) {
  const d = parseD(r.date), mo = monthOnly(r.date), n = daysTo(r.date);
  const box = d ? `<span class="datebox">${mo ? `<small>${MESI[d.getMonth()]}</small><b>${String(d.getFullYear()).slice(2)}</b>` : `<b>${d.getDate()}</b><small>${MESI[d.getMonth()]}</small>`}</span>` : "";
  return `<article class="card"><a class="cover-link" ${ext(r.url)}>${ph(r.img, r.title, "", box)}</a>${r.big ? '<div class="over"><span class="tag offerte">Atteso</span></div>' : ""}
  <div class="body"><h3><a ${ext(r.url)}>${h(r.title)}</a></h3><div class="meta">${platTags(r.plats, 5)}</div>${r.note || r.genre ? `<p>${h([r.genre, r.note].filter(Boolean).join(" · "))}</p>` : ""}
  <div class="bot"><span class="sub">${mo ? "Giorno da annunciare" : n === 0 ? "<b>Esce oggi</b>" : n > 0 ? "Tra " + n + (n === 1 ? " giorno" : " giorni") : "Uscito"}</span></div></div></article>`;
}
function videoCard(v) {
  return `<article class="card video"><a class="cover-link" ${ext(v.url)}>${ph(v.img, v.title, "", playIco)}</a>${v.trailer ? '<div class="over"><span class="tag uscite">Trailer</span></div>' : ""}
  <div class="body"><h3><a ${ext(v.url)}>${h(v.title)}</a></h3><div class="bot"><span class="meta"><span class="src" style="--c:#FF0000"><i></i>${h(v.channel)}</span><span class="when">${ago(v.date)}</span></span></div></div></article>`;
}
function mini(url, img, title, sub) { return `<a class="mini" ${ext(url)}>${ph(img, title)}<div><b>${h(title)}</b><span>${sub}</span></div></a>`; }
function sh(title, side) { return `<div class="sh"><h2>${title}</h2><div class="side">${side || ""}</div></div>`; }
function rail(id, title, href, cards) {
  if (!cards.length) return "";
  return sh(title, `<button class="arrow" type="button" data-rail="${id}" data-dir="-1" aria-label="Indietro">‹</button><button class="arrow" type="button" data-rail="${id}" data-dir="1" aria-label="Avanti">›</button><a class="more" href="${href}">Vedi tutto ›</a>`) + `<div class="rail" id="rail-${id}">${cards.join("")}</div>`;
}
function empty(msg) { return `<div class="empty">${msg}</div>`; }

/* ---------------------------------------------------------- insiemi */
const visible = n => (st.lang === "tutte" || n.lang !== "en") && !st.hidden.has(n.sourceId);
const allNews = () => (D.news || []).filter(visible);
const news = () => allNews().filter(n => qOk(n.title, n.summary, n.source, n.tags));
const byCat = (...c) => news().filter(n => c.some(k => (n.cats || []).includes(k)));
function deals() {
  let L = (D.deals || []).filter(d => qOk(d.title, d.store));
  if (st.dealPlat !== "tutte") L = L.filter(d => dealPlat(d) === st.dealPlat);
  if (st.dealStore !== "tutti") L = L.filter(d => d.store === st.dealStore);
  if (typeof st.dealMax === "number") L = L.filter(d => d.price <= st.dealMax);
  if (st.dealLowest) L = L.filter(d => d.lowest || d.best);
  const score = d => (d.cut || 0) + (d.bestseller ? 25 : 0) + (d.lowest ? 15 : 0) - Math.min(40, (d.rank || 0) * 0.25);
  if (st.dealSort === "best") L = L.slice().sort((a, b) => score(b) - score(a));
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
const videos = () => (D.videos || []).filter(v => qOk(v.title, v.channel) && (st.vidCh === "tutti" || v.channel === st.vidCh));
function topStories() {
  const day = Date.now() - 30 * 3600e3;
  const L = allNews().filter(n => n.img && Date.parse(n.date) > day && n.lang !== "en");
  const score = n => (n.size || 1) * 3 + Math.max(0, 6 - (Date.now() - Date.parse(n.date)) / 3600e3) * 0.6 + ((n.cats || []).includes("gaming") ? 1 : 0);
  return L.sort((a, b) => score(b) - score(a)).slice(0, 5);
}

/* ------------------------------------------------------------ viste */
function vHome() {
  const ss = savedSet(); const top = topStories(); const ids = new Set(top.map(n => n.id));
  const stream = news().filter(n => !ids.has(n.id));
  const mosaic = top.length ? `<section class="mosaic" aria-label="In primo piano">${top.map((n, i) => `<a class="tile" ${ext(n.url)} data-read="${h(n.url)}">${ph(n.img, n.title, "", isVideoNews(n) ? playIco : "")}<div class="cap"><div class="meta"><span class="tag ${primaryCat(n)}">${CATS[primaryCat(n)]}</span>${n.size > 1 ? `<span class="fonti">Ne parlano ${n.size} testate</span>` : ""}</div><h3>${h(n.title)}</h3>${i === 0 && n.summary ? `<p>${h(n.summary)}</p>` : ""}<div class="meta">${srcLabel(n)}<span class="when">${ago(n.date)}</span></div></div></a>`).join("")}</section>` : "";
  const latest = allNews().slice(0, 30);
  const hot = allNews().filter(n => n.size >= 3 && Date.parse(n.date) > Date.now() - 36 * 3600e3).sort((a, b) => b.size - a.size).slice(0, 6);
  const fr = free().filter(f => !f.from || Date.parse(f.from) <= Date.now());
  const wk = rels(false).filter(r => !monthOnly(r.date) && daysTo(r.date) <= 7);
  const srcs = (D.sources || []).filter(s => s.ok && (st.lang === "tutte" || s.lang !== "en")).map(s => ({ ...s, n: (D.news || []).filter(n => n.sourceId === s.id || (n.also || []).some(a => a.sourceId === s.id)).length })).sort((a, b) => b.n - a.n);
  let out = mosaic;
  out += `<div class="cols"><div>${sh("Ultime <em>notizie</em>", `<a class="more" href="#notizie">Tutte le notizie ›</a>`)}
    <div class="stream">${stream.slice(0, st.page).map(n => newsItem(n, ss)).join("") || empty("Nessuna notizia trovata.")}</div>
    ${stream.length > st.page ? `<button class="btn ghost loadmore" type="button" data-more="news">Carica altre notizie (${stream.length - st.page})</button>` : ""}</div>
    <aside>
      <div class="box"><h4><span><i class="dotlive"></i>Ultim'ora</span><a href="#notizie">Tutte</a></h4><ul class="tl">${latest.map(n => `<li><a ${ext(n.url)} data-read="${h(n.url)}"><time>${hm(n.date)}</time><span>${h(n.title)}<span class="s">${h(n.source)}${n.lang === "en" ? " · EN" : ""}</span></span></a></li>`).join("")}</ul></div>
      ${hot.length ? `<div class="box"><h4>Più discusse</h4><ol class="hotlist">${hot.map(n => `<li><a ${ext(n.url)} data-read="${h(n.url)}"><span class="hn">${n.size}</span><span>${h(n.title)}<span class="s">${n.size} testate ne parlano</span></span></a></li>`).join("")}</ol></div>` : ""}
      ${fr.length ? `<div class="box"><h4>Gratis ora <a href="#gratis">Tutti</a></h4>${fr.slice(0, 5).map(f => mini(f.url, f.img, f.title, `${h(f.service)}${f.until ? " · scade tra " + left(f.until) : ""}`)).join("")}</div>` : ""}
      ${wk.length ? `<div class="box"><h4>Escono a breve <a href="#uscite">Calendario</a></h4>${wk.slice(0, 6).map(r => mini(r.url, r.img, r.title, `${fmtD(r.date)} · ${h((r.plats || []).join(", "))}`)).join("")}</div>` : ""}
      ${srcs.length ? `<div class="box"><h4>Testate <a href="#fonti">Stato</a></h4><div class="srcchips">${srcs.map(s => `<button type="button" class="chip" style="--c:${h(s.color)}" data-gosrc="${h(s.id)}">${fav(s.id) || "<i></i>"}${h(s.name)} <span class="n">${s.n}</span></button>`).join("")}</div></div>` : ""}
    </aside></div>`;
  const dsc = d => (d.cut || 0) + (d.bestseller ? 25 : 0) + (d.lowest ? 15 : 0) - Math.min(40, (d.rank || 0) * 0.25);
  const dByP = ["PC", "PlayStation", "Xbox", "Nintendo"].map(p => (D.deals || []).filter(d => d.img && dealPlat(d) === p).sort((a, b) => dsc(b) - dsc(a)));
  const dl = []; for (let i = 0; dl.length < 20 && i < 20; i++) for (const L of dByP) if (L[i] && dl.length < 20) dl.push(L[i]);
  out += rail("deals", "Offerte del <em>giorno</em>", "#offerte", dl.map(dealCard));
  out += rail("vid", "Video e <em>trailer</em>", "#video", videos().slice(0, 14).map(videoCard));
  out += rail("free", "Giochi <em>gratis</em>", "#gratis", free().slice(0, 14).map(freeCard));
  out += rail("rel", "In <em>uscita</em>", "#uscite", rels(false).filter(r => r.img || r.big).slice(0, 16).map(relCard));
  const hw = byCat("hardware", "handheld").slice(0, 8); if (hw.length) out += sh("PC, hardware e <em>handheld</em>", `<a class="more" href="#hardware">Altro ›</a>`) + `<div class="grid">${hw.map(n => newsCard(n, ss)).join("")}</div>`;
  const ti = byCat("tech", "ia").filter(n => !(n.cats || []).includes("gaming") || (n.cats || []).includes("ia")).slice(0, 8); if (ti.length) out += sh("Tech e <em>intelligenza artificiale</em>", `<a class="more" href="#tech">Altro ›</a>`) + `<div class="grid">${ti.map(n => newsCard(n, ss)).join("")}</div>`;
  const rv = byCat("recensioni").slice(0, 4); if (rv.length) out += sh("Ultime <em>recensioni</em>", `<a class="more" href="#recensioni">Altro ›</a>`) + `<div class="grid">${rv.map(n => newsCard(n, ss)).join("")}</div>`;
  return out;
}
function vNotizie() {
  const ss = savedSet(); let L = news();
  if (st.newsCat !== "tutte") L = L.filter(n => (n.cats || []).includes(st.newsCat));
  if (st.newsSrc !== "tutte") L = L.filter(n => n.sourceId === st.newsSrc || (n.also || []).some(a => a.sourceId === st.newsSrc));
  if (st.newsPlat !== "tutte") L = L.filter(n => (n.plats || []).includes(st.newsPlat));
  const srcs = (D.sources || []).filter(s => s.ok && !st.hidden.has(s.id) && (st.lang === "tutte" || s.lang !== "en"));
  return sh("Tutte le <em>notizie</em>", `<span class="sub">${L.length} notizie degli ultimi 4 giorni</span>`) +
    `<div class="filters">${["tutte", ...Object.keys(CATS)].map(c => `<button type="button" class="chip" data-ncat="${c}" aria-pressed="${st.newsCat === c}">${c === "tutte" ? "Tutte" : CATS[c]}</button>`).join("")}</div>
    <div class="filters scrollx"><button type="button" class="chip" data-nsrc="tutte" aria-pressed="${st.newsSrc === "tutte"}">Tutte le testate</button>${srcs.map(s => `<button type="button" class="chip" style="--c:${h(s.color)}" data-nsrc="${h(s.id)}" aria-pressed="${st.newsSrc === s.id}">${fav(s.id) || "<i></i>"}${h(s.name)}</button>`).join("")}</div>
    <div class="filters"><button type="button" class="chip" data-nplat="tutte" aria-pressed="${st.newsPlat === "tutte"}">Tutte le piattaforme</button>${PLATS.map(p => `<button type="button" class="chip" data-nplat="${p}" aria-pressed="${st.newsPlat === p}">${p}</button>`).join("")}</div>
    <div class="stream">${L.slice(0, st.page).map(n => newsItem(n, ss)).join("") || empty("Nessuna notizia con questi filtri.")}</div>
    ${L.length > st.page ? `<button class="btn ghost loadmore" type="button" data-more="news">Carica altre (${L.length - st.page})</button>` : ""}`;
}
function vOfferte() {
  const every = D.deals || []; const all = st.dealPlat === "tutte" ? every : every.filter(d => dealPlat(d) === st.dealPlat); const stores = [...new Set(all.map(d => d.store))].sort((a, b) => all.filter(d => d.store === b).length - all.filter(d => d.store === a).length);
  const maxP = Math.ceil(Math.max(10, ...all.map(d => d.price || 0))); const cur = st.dealMax == null ? maxP : Math.min(st.dealMax, maxP);
  const L = deals(); const nd = byCat("offerte").slice(0, 12); const ss = savedSet();
  const quick = [5, 10, 20, 30].map(v => `<button type="button" class="chip" data-qmax="${v}" aria-pressed="${st.dealMax === v}">Sotto ${v} €</button>`).join("");
  const pls = ["PC", "PlayStation", "Xbox", "Nintendo"].map(p => [p, every.filter(d => dealPlat(d) === p).length]).filter(x => x[1]);
  return sh("Offerte <em>giochi</em>", `<span class="sub" id="dealCount">${L.length} offerte</span>`) +
    `<div class="filters plats"><button type="button" class="chip big" data-dplat="tutte" aria-pressed="${st.dealPlat === "tutte"}">Tutte <span class="n">${every.length}</span></button>${pls.map(([p, n]) => `<button type="button" class="chip big" data-dplat="${p}" aria-pressed="${st.dealPlat === p}">${p} <span class="n">${n}</span></button>`).join("")}</div>
    <div class="filters scrollx"><button type="button" class="chip" data-store="tutti" aria-pressed="${st.dealStore === "tutti"}">Tutti gli store <span class="n">${all.length}</span></button>${stores.map(s => `<button type="button" class="chip" data-store="${h(s)}" aria-pressed="${st.dealStore === s}">${h(s)} <span class="n">${all.filter(d => d.store === s).length}</span></button>`).join("")}</div>
    <div class="filters"><select id="dealSort" aria-label="Ordina"><option value="best">Consigliate</option><option value="cut">Sconto più alto</option><option value="price">Prezzo più basso</option><option value="name">Nome A-Z</option></select>
    ${quick}<button type="button" class="chip" data-qmax="0" aria-pressed="${st.dealMax == null}">Qualsiasi prezzo</button>
    <label class="range" for="dealMax">Fino a <span id="dealMaxV">${eur(cur)}</span><input type="range" id="dealMax" min="1" max="${maxP}" step="1" value="${cur}"></label>
    <label class="toggle"><input type="checkbox" id="dealLowest" ${st.dealLowest ? "checked" : ""}> Solo minimi storici e prezzi migliori</label></div>
    <div id="dealGrid">${dealGrid(L)}</div>
    ${nd.length ? sh("Offerte console e Amazon <em>dalle testate</em>", `<a class="more" href="#notizie" data-gocat="offerte">Tutte ›</a>`) + `<div class="grid">${nd.map(n => newsCard(n, ss)).join("")}</div>` : ""}`;
}
function dealGrid(L) { return L.length ? `<div class="grid">${L.slice(0, st.dealPage).map(dealCard).join("")}</div>${L.length > st.dealPage ? `<button class="btn ghost loadmore" type="button" data-more="deals">Carica altre offerte (${L.length - st.dealPage})</button>` : ""}` : empty("Nessuna offerta con questi filtri."); }
function vGratis() {
  const L = free(); const now = L.filter(f => !f.from || Date.parse(f.from) <= Date.now()), soon = L.filter(f => f.from && Date.parse(f.from) > Date.now());
  const ss = savedSet(); const nd = news().filter(n => /gratis|gratuit|free to play|giochi del mese|ps plus|game pass|prime gaming|free games?/i.test(n.title)).slice(0, 8);
  return sh("Gratis <em>adesso</em>", `<span class="sub">${now.length} giochi da riscattare</span>`) + (now.length ? `<div class="grid">${now.map(freeCard).join("")}</div>` : empty("Nessun gioco gratis in questo momento.")) +
    (soon.length ? sh("In arrivo <em>gratis</em>") + `<div class="grid">${soon.map(freeCard).join("")}</div>` : "") +
    (nd.length ? sh("Abbonamenti e <em>giochi del mese</em>") + `<div class="grid">${nd.map(n => newsCard(n, ss)).join("")}</div>` : "");
}
function vVideo() {
  const L = videos(); const ch = [...new Set((D.videos || []).map(v => v.channel))];
  return sh("Video e <em>trailer</em>", `<span class="sub">${L.length} video degli ultimi 7 giorni</span>`) +
    `<div class="filters"><button type="button" class="chip" data-vch="tutti" aria-pressed="${st.vidCh === "tutti"}">Tutti i canali</button>${ch.map(c => `<button type="button" class="chip" data-vch="${h(c)}" aria-pressed="${st.vidCh === c}">${h(c)}</button>`).join("")}</div>` +
    (L.length ? `<div class="grid">${L.map(videoCard).join("")}</div>` : empty("Nessun video al momento."));
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
      ${L.length ? `<span class="cv">${ph((L.find(r => r.img) || L[0]).img, (L.find(r => r.img) || L[0]).title)}${L.length > 1 ? `<span class="cn">+${L.length - 1}</span>` : ""}</span>${L.slice(0, 2).map(r => `<span class="t ${r.big ? "big" : ""}">${h(r.title)}</span>`).join("")}` : ""}</button>`;
  }
  const mo = R.filter(r => r.date === y + "-" + pad(m + 1));
  let sel = ""; if (st.calSel) { const L = R.filter(r => r.date === st.calSel); sel = sh(fmtD(st.calSel)) + (L.length ? `<div class="grid">${L.map(relCard).join("")}</div>` : empty("Nessuna uscita in questo giorno.")); }
  const mk = y + "-" + pad(m + 1); const inMonth = R.filter(r => !monthOnly(r.date) && r.date.slice(0, 7) === mk && (daysTo(r.date) >= -7));
  const days = [...new Set(inMonth.map(r => r.date))].sort();
  const monthList = days.map(dk => { const L = inMonth.filter(r => r.date === dk).sort((a, b) => (b.big ? 1 : 0) - (a.big ? 1 : 0) || (b.img ? 1 : 0) - (a.img ? 1 : 0)); const dd = parseD(dk); const n = daysTo(dk);
    return `<div class="dayg" id="day-${dk}"><h3 class="dayh"><b>${dd.getDate()}</b><span>${GIORNI_L[dd.getDay()]} ${MESI_L[dd.getMonth()].toLowerCase()}</span><em>${n === 0 ? "oggi" : n === 1 ? "domani" : n > 0 ? "tra " + n + " giorni" : "uscito"}</em><small>${L.length} ${L.length === 1 ? "uscita" : "uscite"}</small></h3><div class="grid g5">${L.map(relCard).join("")}</div></div>`; }).join("");
  const big = R.filter(r => r.big && (monthOnly(r.date) || daysTo(r.date) >= 0)).slice(0, 16);
  const ev = E.filter(e => !e.end || daysTo(e.end) >= 0).sort((a, b) => a.start.localeCompare(b.start));
  return sh("Calendario <em>uscite</em>", `<span class="sub">${R.filter(r => monthOnly(r.date) || daysTo(r.date) >= 0).length} giochi in arrivo · tocca un giorno per vederli</span>`) +
    `<div class="filters"><button type="button" class="chip" data-rplat="tutte" aria-pressed="${st.relPlat === "tutte"}">Tutte</button>${PLATS.map(p => `<button type="button" class="chip" data-rplat="${p}" aria-pressed="${st.relPlat === p}">${p}</button>`).join("")}</div>
    <div class="cal-head"><button class="arrow" type="button" data-cal="-1" aria-label="Mese precedente">‹</button><h3>${MESI_L[m]} ${y}</h3><button class="arrow" type="button" data-cal="1" aria-label="Mese successivo">›</button><button class="btn ghost" type="button" data-cal="0">Oggi</button></div>
    <div class="calwrap"><div class="cal">${["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(g => `<div class="wd">${g}</div>`).join("")}${cells}</div></div>
${sel}
    ${ev.length ? sh("Saldi ed <em>eventi</em>") + `<div class="events">${ev.map(e => { const on = daysTo(e.start) <= 0 && (!e.end || daysTo(e.end) >= 0); return `<a class="ev-c ${on ? "on" : ""}" ${ext(e.url)}>${on ? '<span class="pill good" style="align-self:flex-start">In corso</span>' : `<span class="pill acc" style="align-self:flex-start">Tra ${daysTo(e.start)} giorni</span>`}<b>${h(e.name)}</b><span>${fmtD(e.start)}${e.end ? " → " + fmtD(e.end) : ""}</span>${e.note ? `<span>${h(e.note)}</span>` : ""}</a>`; }).join("")}</div>` : ""}
    ${big.length ? sh("I più <em>attesi</em>") + `<div class="rail" id="rail-big">${big.map(relCard).join("")}</div>` : ""}
    ${sh(`Tutte le uscite di <em>${MESI_L[m].toLowerCase()}</em>`, `<span class="sub">${inMonth.length} giochi · si aggiorna da solo da Steam, Nintendo eShop, Xbox Store${(D.health || []).some(x => x.id === "rawg" && x.ok) ? ", RAWG" : ""} e redazione</span>`)}
    ${monthList || empty("Nessuna uscita con data precisa in questo mese.")}
    ${mo.length ? sh("Nel mese, giorno <em>da annunciare</em>") + `<div class="grid g5">${mo.map(relCard).join("")}</div>` : ""}`;
}
function vCat(title, cats, sub) {
  const ss = savedSet(); let L = byCat(...cats); if (sub) L = L.filter(sub);
  return sh(title, `<span class="sub">${L.length} notizie</span>`) + (L.length ? `<div class="grid g3">${L.slice(0, st.page).map(n => newsCard(n, ss)).join("")}</div>${L.length > st.page ? `<button class="btn ghost loadmore" type="button" data-more="news">Carica altre (${L.length - st.page})</button>` : ""}` : empty("Nessuna notizia in questa sezione al momento."));
}
function vTech() {
  const f = st.techSub === "ia" ? n => n.cats.includes("ia") : st.techSub === "tech" ? n => n.cats.includes("tech") && !n.cats.includes("ia") : null;
  return `<div class="filters">${[["tutte", "Tutto"], ["tech", "Tecnologia"], ["ia", "Intelligenza artificiale"]].map(([k, l]) => `<button type="button" class="chip" data-tsub="${k}" aria-pressed="${st.techSub === k}">${l}</button>`).join("")}</div>` + vCat("Tech e <em>IA</em>", ["tech", "ia"], f);
}
function matches() {
  const kws = st.kw.map(norm).filter(Boolean); if (!kws.length) return { news: [], deals: [], free: [], rels: [], vids: [] };
  const hit = s => { s = norm(s); return kws.some(k => s.includes(k)); };
  return { news: allNews().filter(n => hit(n.title + " " + n.summary)), deals: (D.deals || []).filter(d => hit(d.title)), free: (D.free || []).filter(f => hit(f.title)), rels: (D.releases || []).filter(r => hit(r.title)), vids: (D.videos || []).filter(v => hit(v.title)) };
}
function vPerte() {
  const M = matches(); const perm = "Notification" in window ? Notification.permission : "unsupported"; const ss = savedSet();
  const sug = (D.trends || []).slice(0, 8).filter(t => !st.kw.some(k => norm(k) === norm(t.label)));
  return sh("Per <em>te</em>", `<span class="sub">Segui giochi, console o pezzi: raccolgo tutto qui</span>`) +
    `<form class="watch-form" id="kwForm"><input id="kwIn" maxlength="60" placeholder="Es. GTA VI, Silksong, RTX 5070, Steam Deck, Zelda" aria-label="Parola da seguire"><button class="btn" type="submit">Segui</button>
    ${perm === "default" ? `<button class="btn ghost" type="button" id="notifBtn">Attiva avvisi sul dispositivo</button>` : perm === "granted" ? '<span class="pill good" style="align-self:center">Avvisi attivi</span>' : ""}</form>
    <div class="filters">${st.kw.map((k, i) => `<span class="kw">${h(k)}<button type="button" data-delkw="${i}" aria-label="Smetti di seguire ${h(k)}">×</button></span>`).join("") || '<span class="sub">Non segui ancora niente: aggiungi il primo titolo qui sopra.</span>'}</div>
    ${sug.length ? `<div class="filters"><span class="sub">Suggeriti adesso:</span>${sug.map(t => `<button type="button" class="chip" data-addkw="${h(t.label)}">+ ${h(t.label)}</button>`).join("")}</div>` : ""}
    ${st.saved.length ? sh("Salvati per <em>dopo</em>", `<button class="btn ghost" type="button" id="clearSaved">Svuota</button>`) + `<div class="stream">${st.saved.slice().reverse().map(n => newsItem(n, ss)).join("")}</div>` : ""}
    ${st.kw.length ? (
      (M.deals.length ? sh("Offerte che ti <em>interessano</em>") + `<div class="grid">${M.deals.map(dealCard).join("")}</div>` : "") +
      (M.free.length ? sh("Gratis per <em>te</em>") + `<div class="grid">${M.free.map(freeCard).join("")}</div>` : "") +
      (M.rels.length ? sh("Uscite che <em>segui</em>") + `<div class="grid">${M.rels.map(relCard).join("")}</div>` : "") +
      (M.vids.length ? sh("Video che <em>segui</em>") + `<div class="grid">${M.vids.map(videoCard).join("")}</div>` : "") +
      (M.news.length ? sh("Notizie che <em>segui</em>") + `<div class="stream">${M.news.slice(0, 40).map(n => newsItem(n, ss)).join("")}</div>` : "") +
      (!M.deals.length && !M.free.length && !M.rels.length && !M.news.length && !M.vids.length ? empty("Al momento non c'è niente su quello che segui. Ti avviso appena compare.") : "")) : ""}`;
}
function vFonti() {
  const H = D.health || [];
  return sh("Stato delle <em>fonti</em>", `<span class="sub">Ultimo aggiornamento ${new Date(D.generatedAt).toLocaleString("it-IT")} · ${H.filter(x => x.ok).length}/${H.length} attive</span>`) +
    `<div class="health">${H.map(x => `<div><span>${h(x.name)}</span><b class="${x.ok ? "ok" : "ko"}">${x.ok ? (x.count != null ? x.count + " elementi" : "attiva") : "non raggiungibile"}</b></div>`).join("")}</div>
    <p class="sub" style="margin-top:14px">Le notizie restano in pagina 4 giorni. Le stesse notizie pubblicate da più testate vengono raggruppate: tocca "+N fonti" per leggerle tutte. Le notizie fuori tema (auto, elettrodomestici, spazio…) delle testate di tecnologia vengono escluse in automatico.</p>`;
}
function vCerca() {
  const ss = savedSet(); const N = news().slice(0, 60), Dl = (D.deals || []).filter(d => qOk(d.title, d.store)).slice(0, 24), F = free(), R = rels(true).slice(0, 24), V = videos().slice(0, 12);
  return sh(`Risultati per <em>“${h(st.q)}”</em>`, `<button class="btn ghost" type="button" id="clearQ">Cancella ricerca</button>`) +
    (Dl.length ? sh("Offerte") + `<div class="grid">${Dl.map(dealCard).join("")}</div>` : "") + (F.length ? sh("Gratis") + `<div class="grid">${F.map(freeCard).join("")}</div>` : "") +
    (R.length ? sh("Uscite") + `<div class="grid">${R.map(relCard).join("")}</div>` : "") + (V.length ? sh("Video") + `<div class="grid">${V.map(videoCard).join("")}</div>` : "") +
    (N.length ? sh("Notizie") + `<div class="stream">${N.map(n => newsItem(n, ss)).join("")}</div>` : "") +
    (!N.length && !Dl.length && !F.length && !R.length && !V.length ? empty("Nessun risultato. Prova con un'altra parola.") : "");
}

/* ---------------------------------------------------------- handheld */
const HH_SORT = { perf: "Più potenti", price: "Prezzo più basso", screen: "Schermo più grande" };
function hhList() {
  const H = (D.handhelds && D.handhelds.devices) || [];
  let L = H.filter(x => st.hhOs === "tutti" || (x.os_tags || []).includes(st.hhOs));
  if (st.hhMax) L = L.filter(x => typeof x.price === "number" && x.price <= st.hhMax);
  const scr = x => parseFloat(String(x.display).replace(",", ".")) || 0;
  if (st.hhSort === "perf") L = L.slice().sort((a, b) => (b.perf ?? -1) - (a.perf ?? -1) || (b.price || 0) - (a.price || 0));
  if (st.hhSort === "price") L = L.slice().sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9));
  if (st.hhSort === "screen") L = L.slice().sort((a, b) => scr(b) - scr(a));
  return L;
}
function hhArt(x) {
  const c = x.color || "#334"; const sc = /OLED/.test(x.display) ? "#05070c" : "#0d1524";
  return `<svg class="hh-art" viewBox="0 0 320 150" role="img" aria-label="${h(x.name)}"><defs><linearGradient id="g-${h(x.id)}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${h(c)}" stop-opacity=".95"/><stop offset="1" stop-color="${h(c)}" stop-opacity=".55"/></linearGradient></defs>
  <rect x="8" y="22" width="304" height="108" rx="46" fill="url(#g-${h(x.id)})"/><rect x="84" y="32" width="152" height="88" rx="8" fill="${sc}"/><rect x="92" y="40" width="136" height="72" rx="4" fill="${h(c)}" opacity=".18"/>
  <text x="160" y="83" text-anchor="middle" font-family="Saira Condensed, sans-serif" font-weight="800" font-size="19" fill="#fff" opacity=".92">${h(x.brand.toUpperCase())}</text>
  <circle cx="44" cy="62" r="14" fill="#0006"/><circle cx="270" cy="96" r="14" fill="#0006"/><g fill="#0007"><circle cx="270" cy="50" r="6"/><circle cx="258" cy="62" r="6"/><circle cx="282" cy="62" r="6"/><circle cx="270" cy="74" r="6"/></g><path d="M38 96h12M44 90v12" stroke="#0008" stroke-width="5" stroke-linecap="round"/></svg>`;
}
function hhNews(x) { const kw = (x.keywords || []).map(norm); return allNews().filter(n => { const t = norm(n.title); return kw.some(k => t.includes(k)); }); }
function hhRow(x, i, maxPerf) {
  const on = st.hhCmp.includes(x.id); const open = st.hhOpen === x.id; const N = hhNews(x);
  const bar = x.perf ? `<div class="perf"><span style="width:${Math.max(6, Math.round(x.perf / maxPerf * 100))}%;--c:${h(x.color)}"></span><b>${x.perf}</b></div>` : `<div class="perf na"><b>n.c.</b><small>console</small></div>`;
  return `<article class="hh ${open ? "open" : ""}" id="hh-${h(x.id)}">
    <div class="hh-rank ${x.perf && st.hhSort === "perf" && i < 3 ? "r" + (i + 1) : ""}">${x.perf ? i + 1 : "–"}</div>
    <div class="hh-pic">${hhArt(x)}</div>
    <div class="hh-main"><div class="hh-top"><span class="tier t-${h(norm(x.tier).replace(/\W+/g, ""))}">${h(x.tier)}</span>${(x.os_tags || []).map(o => `<span class="pill">${h(o)}</span>`).join("")}${N.length ? `<span class="pill acc">${N.length} notizie</span>` : ""}</div>
      <h3>${h(x.name)}</h3><p class="hh-chip">${h(x.apu)} · ${h(x.ram)} · ${h(x.display)}</p>${bar}</div>
    <div class="hh-side"><div class="hh-price">${h(x.priceText)}</div><div class="hh-btns"><button type="button" class="btn ghost small" data-hhopen="${h(x.id)}" aria-expanded="${open}">${open ? "Chiudi" : "Scheda completa"}</button><label class="toggle"><input type="checkbox" data-hhcmp="${h(x.id)}" ${on ? "checked" : ""}> Confronta</label></div></div>
    ${open ? hhDetail(x, N) : ""}</article>`;
}
function hhDetail(x, N) {
  const specs = [["Processore", x.apu], ["CPU", x.cpu], ["Grafica", x.gpu], ["Memoria", x.ram], ["Archiviazione", x.storage], ["Schermo", x.display], ["Batteria", x.battery], ["Peso", x.weight], ["Consumo massimo", x.tdp], ["Sistema", x.os]];
  return `<div class="hh-det">
    <div><h4>Scheda tecnica</h4><table class="spec">${specs.map(([k, v]) => `<tr><th>${k}</th><td>${h(v || "n.d.")}</td></tr>`).join("")}</table>
      <p class="sub">${h(x.priceNote || "")}</p></div>
    <div><h4>Pro e contro</h4><ul class="pc">${(x.pros || []).map(p => `<li class="pro">${h(p)}</li>`).join("")}${(x.cons || []).map(p => `<li class="con">${h(p)}</li>`).join("")}</ul>
      <h4>Come girano i giochi</h4>${(x.tests || []).length ? `<table class="spec fps">${x.tests.map(t => `<tr><th>${h(t.game)}<small>${h(t.settings)}</small></th><td><b>${t.fps}</b> fps</td></tr>`).join("")}</table>` : ""}${x.testNote ? `<p class="sub">${h(x.testNote)}</p>` : ""}${!(x.tests || []).length && !x.testNote ? `<p class="sub">Nessun test affidabile ancora pubblicato.</p>` : ""}</div>
    <div><h4>Dove comprarlo</h4><div class="buy">${(x.buy || []).map(b => `<a class="btn ${b === x.buy[0] ? "" : "ghost"} small" ${ext(b.url)}>${h(b.name)}</a>`).join("")}</div>
      <p class="sub">I link aprono la ricerca nel negozio: confronta prezzo e venditore prima di comprare.</p>
      <h4>Fonti</h4><ul class="srcl">${(x.sources || []).map(s => `<li><a ${ext(s.url)}>${h(s.name)}</a></li>`).join("")}</ul>
      ${N.length ? `<h4>Ultime notizie</h4><ul class="tl">${N.slice(0, 6).map(n => `<li><a ${ext(n.url)} data-read="${h(n.url)}"><time>${ago(n.date)}</time><span>${h(n.title)}<span class="s">${h(n.source)}</span></span></a></li>`).join("")}</ul>` : ""}</div></div>`;
}
function hhCompare() {
  const H = (D.handhelds && D.handhelds.devices) || []; const L = st.hhCmp.map(id => H.find(x => x.id === id)).filter(Boolean);
  if (L.length < 2) return "";
  const G = D.handhelds.games || []; const maxP = Math.max(...L.map(x => x.perf || 0));
  const row = (k, f, best) => `<tr><th>${k}</th>${L.map(x => { const v = f(x); return `<td class="${best && best(x) ? "best" : ""}">${v == null || v === "" ? "—" : v}</td>`; }).join("")}</tr>`;
  const num = s => parseFloat(String(s || "").replace(",", ".")) || 0;
  const maxBy = f => x => f(x) && f(x) === Math.max(...L.map(f));
  return `<section class="cmpbox" id="cmpbox">${sh("Confronto <em>diretto</em>", `<button type="button" class="btn ghost small" id="hhClear">Svuota confronto</button>`)}
    <div class="tblwrap"><table class="cmpt"><thead><tr><th></th>${L.map(x => `<th><span class="dot" style="--c:${h(x.color)}"></span>${h(x.name)}</th>`).join("")}</tr></thead><tbody>
    ${row("Potenza (indice)", x => x.perf ? `<div class="perf sm"><span style="width:${Math.round(x.perf / maxP * 100)}%;--c:${h(x.color)}"></span><b>${x.perf}</b></div>` : "n.c.", maxBy(x => x.perf || 0))}
    ${row("Prezzo", x => h(x.priceText))}
    ${row("Processore", x => h(x.apu))}${row("Grafica", x => h(x.gpu))}${row("Memoria", x => h(x.ram), maxBy(x => num(String(x.ram).match(/(\d+)\s*GB/g)?.pop())))}${row("Archiviazione", x => h(x.storage))}
    ${row("Schermo", x => h(x.display), maxBy(x => num(x.display)))}${row("Batteria", x => h(x.battery), maxBy(x => num(x.battery)))}${row("Peso", x => h(x.weight))}${row("Sistema", x => h(x.os))}
    ${G.map((g, i) => row(`${h(g)}<small>${h((D.handhelds.gameSettings || [])[i] || "")}</small>`, x => { const t = (x.tests || []).find(t => t.game === g); return t ? `<b>${t.fps}</b> fps` : ""; }, x => { const t = (x.tests || []).find(t => t.game === g); const all = L.map(y => ((y.tests || []).find(t => t.game === g) || {}).fps || 0); return t && t.fps === Math.max(...all) && all.filter(Boolean).length > 1; })).join("")}
    </tbody></table></div><p class="sub">In verde il valore migliore. "—" = test non disponibile con le stesse impostazioni.</p></section>`;
}
function vHandheld() {
  const HH = D.handhelds; const ss = savedSet();
  if (!HH || !(HH.devices || []).length) return vCat("Handheld e <em>PC portatili da gioco</em>", ["handheld"]);
  const L = hhList(); const ranked = L.filter(x => x.perf); const maxPerf = Math.max(...HH.devices.map(x => x.perf || 0));
  const G = HH.games || []; const withT = HH.devices.filter(x => (x.tests || []).some(t => G.includes(t.game)));
  const N = byCat("handheld"); const deal = N.filter(n => (n.cats || []).includes("offerte")).slice(0, 8);
  const oses = ["tutti", "Windows", "SteamOS", "Console"];
  return sh("Classifica <em>handheld</em>", `<span class="sub">Dal più potente al più economico · aggiornata il ${fmtD(HH.updated)}</span>`) +
    `<p class="lead">${h(HH.perfNote || "")}</p>
    <div class="filters"><select id="hhSort" aria-label="Ordina">${Object.entries(HH_SORT).map(([k, v]) => `<option value="${k}" ${st.hhSort === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      ${oses.map(o => `<button type="button" class="chip" data-hhos="${o}" aria-pressed="${st.hhOs === o}">${o === "tutti" ? "Tutti i sistemi" : o}</button>`).join("")}
      ${[700, 1000, 1600].map(v => `<button type="button" class="chip" data-hhmax="${v}" aria-pressed="${st.hhMax === v}">Fino a ${v} €</button>`).join("")}<button type="button" class="chip" data-hhmax="0" aria-pressed="${!st.hhMax}">Qualsiasi prezzo</button></div>
    <div class="hhlist">${L.map(x => hhRow(x, ranked.indexOf(x), maxPerf)).join("") || empty("Nessun modello con questi filtri.")}</div>
    ${hhCompare()}
    ${withT.length ? sh("Come girano i <em>giochi</em>", `<span class="sub">fps medi negli stessi test</span>`) + `<div class="tblwrap"><table class="cmpt fpsall"><thead><tr><th>Gioco</th>${withT.map(x => `<th><span class="dot" style="--c:${h(x.color)}"></span>${h(x.name)}</th>`).join("")}</tr></thead><tbody>${G.map((g, i) => `<tr><th>${h(g)}<small>${h((HH.gameSettings || [])[i] || "")}</small></th>${withT.map(x => { const t = (x.tests || []).find(t => t.game === g); return `<td>${t ? `<b>${t.fps}</b>` : "—"}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div><p class="sub">Fonte: <a ${ext("https://sovisgames.com/posts/rog-ally-x20-vs-competition/")}>SovisGames</a>. Gli altri test sono nelle schede dei singoli modelli.</p>` : ""}
    ${deal.length ? sh("Offerte handheld <em>dalle testate</em>") + `<div class="grid">${deal.map(n => newsCard(n, ss)).join("")}</div>` : ""}
    ${N.length ? sh("Notizie <em>handheld</em>", `<span class="sub">${N.length} notizie</span>`) + `<div class="grid g3">${N.slice(0, st.page).map(n => newsCard(n, ss)).join("")}</div>${N.length > st.page ? `<button class="btn ghost loadmore" type="button" data-more="news">Carica altre (${N.length - st.page})</button>` : ""}` : ""}
    ${st.hhCmp.length ? `<div class="cmpbar"><span>${st.hhCmp.length === 1 ? "Scegline almeno un altro" : st.hhCmp.length + " a confronto"}</span>${st.hhCmp.length > 1 ? `<a class="btn small" href="#cmpbox" data-goto="cmpbox">Vedi confronto</a>` : ""}</div>` : ""}`;
}
/* ------------------------------------------------------ impostazioni */
function renderSettings() {
  const S = (D && D.sources || []);
  $("#setBody").innerHTML = `
    <section class="${st.setHint ? "hint" : ""}"><h3>Aggiornamento immediato</h3>
      ${st.setHint ? `<p class="notice small">Il tasto <b>Aggiorna ora</b> senza collegamento ricarica soltanto i dati dell'ultimo giro (delle ${D ? hm(D.generatedAt) : "--:--"}). Collegalo qui sotto e farà partire subito un giro completo.</p>` : ""}
      <p class="sub">Il sito si aggiorna da solo circa ogni 5 minuti. Per far partire un aggiornamento completo quando vuoi con il tasto <b>Aggiorna ora</b>, collega GitHub una volta sola su questo dispositivo.</p>
      ${st.token ? `<p><span class="pill good">Collegato</span> <button class="btn ghost small" type="button" id="tokDel">Scollega</button></p>` : `
      <ol class="steps"><li>Apri <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">questa pagina di GitHub</a>.</li>
      <li>Nome: <b>Plancia</b>. Scadenza: quella che preferisci.</li>
      <li><b>Repository access</b> → <b>Only select repositories</b> → scegli <b>plancia-gaming</b>.</li>
      <li><b>Permissions</b> → <b>Repository permissions</b> → <b>Actions</b>: <b>Read and write</b>.</li>
      <li>Premi <b>Generate token</b>, copia il codice e incollalo qui sotto.</li></ol>
      <form id="tokForm" class="row2"><input id="tokIn" type="password" autocomplete="off" placeholder="github_pat_…" aria-label="Codice di accesso GitHub"><button class="btn" type="submit">Collega</button></form>
      <p class="sub">Il codice resta solo in questo browser e serve solo a far partire l'aggiornamento.</p>`}
    </section>
    <section><h3>Lingua delle notizie</h3>
      <div class="filters"><button type="button" class="chip" data-lang="tutte" aria-pressed="${st.lang === "tutte"}">Italiane e internazionali</button><button type="button" class="chip" data-lang="it" aria-pressed="${st.lang === "it"}">Solo italiane</button></div></section>
    <section><h3>Testate da mostrare</h3><div class="srcgrid">${S.map(s => `<label class="toggle"><input type="checkbox" data-hide="${h(s.id)}" ${st.hidden.has(s.id) ? "" : "checked"}> ${fav(s.id)}${h(s.name)}${s.lang === "en" ? ' <span class="en">EN</span>' : ""}${s.ok ? "" : ' <span class="pill bad">non attiva</span>'}</label>`).join("")}</div></section>
    <section><h3>Il tuo dispositivo</h3><button class="btn ghost small" type="button" id="resetRead">Segna tutto come non letto</button></section>`;
}
function openSettings() { renderSettings(); $("#settings").hidden = false; document.body.classList.add("lock"); setTimeout(() => { const b = $("#setClose"); b && b.focus(); }, 30); }
function closeSettings() { st.setHint = false; $("#settings").hidden = true; document.body.classList.remove("lock"); }

/* ------------------------------------------------- aggiornamento ora */
async function forceUpdate() {
  if (st.forcing) return;
  const repo = (D && D.repo) || guessRepo();
  if (!st.token || !repo) {
    const before = D && D.generatedAt; const btn0 = $("#forceBtn"); btn0.classList.add("spin");
    await load(false, true); btn0.classList.remove("spin");
    if (D && D.generatedAt !== before) { toast("Caricate le novità dell'ultimo giro"); return; }
    toast(`Nessuna novità dall'ultimo giro delle ${D ? hm(D.generatedAt) : "--:--"}. Per farne partire uno subito collega GitHub (1 minuto)`);
    st.setHint = true; openSettings(); return;
  }
  const btn = $("#forceBtn"); const t0 = new Date(Date.now() - 5000).toISOString(); st.forcing = { t0 };
  btn.classList.add("spin"); setBanner("Avvio l'aggiornamento…");
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/aggiorna.yml/dispatches`, { method: "POST", headers: gh(), body: JSON.stringify({ ref: "main" }) });
    if (r.status === 401 || r.status === 403) throw new Error("auth");
    if (!r.ok && r.status !== 204) throw new Error("http " + r.status);
    const start = Date.now();
    const tick = async () => {
      const s = Math.round((Date.now() - start) / 1000);
      let run = null; try { const q = await fetch(`https://api.github.com/repos/${repo}/actions/runs?event=workflow_dispatch&per_page=10`, { headers: gh() }); const j = await q.json(); run = (j.workflow_runs || []).filter(x => x.created_at >= t0 && !(x.triggering_actor && /\[bot\]$/.test(x.triggering_actor.login))).pop() || null; } catch (e) {}
      if (run && run.status === "completed") {
        if (run.conclusion === "success") { setBanner("Fatto! Carico le novità…"); setTimeout(async () => { await load(false, true); endForce("Sito aggiornato"); }, 15000); }
        else endForce("L'aggiornamento non è riuscito: riprova tra poco");
        return;
      }
      if (s > 420) { endForce("Ci sta mettendo più del solito: le novità arriveranno da sole"); return; }
      setBanner(`Aggiornamento in corso… ${Math.floor(s / 60)}:${pad(s % 60)} ${run ? (run.status === "in_progress" ? "· raccolgo notizie e offerte" : "· in coda su GitHub") : "· avvio"}`);
      st.forcing.timer = setTimeout(tick, 6000);
    };
    tick();
  } catch (e) {
    endForce(e.message === "auth" ? "Il collegamento a GitHub non è più valido: ricollegalo nelle impostazioni ⚙" : "Non riesco a contattare GitHub in questo momento");
    if (e.message === "auth") { st.token = ""; LS.set("ghToken", null); }
  }
}
function gh() { return { "Authorization": "Bearer " + st.token, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }; }
function guessRepo() { const m = location.hostname.match(/^([\w-]+)\.github\.io$/); const p = location.pathname.split("/").filter(Boolean)[0]; return m && p ? m[1] + "/" + p : ""; }
function setBanner(t) { const b = $("#banner"); b.textContent = t; b.hidden = false; }
function endForce(msg) { if (st.forcing && st.forcing.timer) clearTimeout(st.forcing.timer); st.forcing = null; $("#forceBtn").classList.remove("spin"); $("#banner").hidden = true; toast(msg); }

/* ----------------------------------------------------------- render */
function renderNav() {
  const M = st.kw.length ? matches() : null; const nNew = allNews().filter(isNew).length;
  const c = { notizie: nNew ? nNew : allNews().length, offerte: (D.deals || []).length, gratis: free().filter(f => !f.from || Date.parse(f.from) <= Date.now()).length, video: (D.videos || []).length, handheld: ((D.handhelds || {}).devices || []).length, perte: M ? M.deals.length + M.free.length + M.news.filter(isNew).length : 0 };
  $("#nav").innerHTML = VIEWS.map(([id, l]) => `<a href="#${id}" class="${(id === "notizie" && nNew) || (id === "perte" && c.perte) ? "hot" : ""}" ${st.view === id && !st.q ? 'aria-current="page"' : ""}>${l}${c[id] ? `<span class="n">${c[id]}</span>` : ""}</a>`).join("");
}
function renderLive() {
  const el = $("#live"), t = $("#liveTxt"); if (!D) return; const m = Math.round((Date.now() - Date.parse(D.generatedAt)) / 60000);
  el.className = "live " + (m < 30 ? "on" : "old"); t.textContent = "Aggiornato " + (m < 1 ? "ora" : m < 60 ? m + " min fa" : Math.round(m / 60) + " h fa") + (m < 5 ? " · prossimo tra ~" + (5 - m) + " min" : m < 15 ? " · prossimo a momenti" : "");
}
function renderTicker() {
  const L = allNews().slice(0, 16); if (!L.length) { $("#ticker").hidden = true; return; }
  const one = L.map(n => `<a ${ext(n.url)} data-read="${h(n.url)}"><time>${hm(n.date)}</time><span>${h(n.title)}</span></a>`).join("");
  $("#tkTrack").innerHTML = one + one; $("#ticker").hidden = false;
  const T = D.trends || []; const tb = $("#trends");
  if (T.length) { tb.hidden = false; tb.querySelector(".tr-list").innerHTML = T.map(t => `<button type="button" class="trend" data-q="${h(t.label)}">#${h(t.label.replace(/\s+/g, ""))}<span>${t.n}</span></button>`).join(""); } else tb.hidden = true;
}
function render(keepScroll) {
  if (!D) return; renderNav(); renderLive(); renderTicker();
  const f = st.q ? vCerca : { home: vHome, notizie: vNotizie, offerte: vOfferte, gratis: vGratis, uscite: vUscite, video: vVideo, hardware: () => vCat("PC, hardware e <em>componenti</em>", ["hardware", "handheld"]), handheld: vHandheld, tech: vTech, recensioni: () => vCat("<em>Recensioni</em> e prove", ["recensioni"]), perte: vPerte, fonti: vFonti }[st.view] || vHome;
  let html; try { html = f(); } catch (e) { console.error(e); html = `<div class="notice">Questa sezione non si è caricata. Le altre funzionano: riprova tra qualche minuto.</div>`; }
  const ok = (D.sources || []).filter(s => s.ok).length;
  if (ok === 0) html = `<div class="notice">Nessuna testata raggiungibile all'ultimo aggiornamento: riprovo da solo tra 5 minuti.</div>` + html;
  const y = window.scrollY; $("#main").innerHTML = html; if (keepScroll) window.scrollTo(0, y);
  const ds = $("#dealSort"); if (ds) ds.value = st.dealSort;
  $("#footSrc").innerHTML = "Fonti: " + (D.sources || []).filter(s => s.ok).map(s => `<a href="${h(s.home)}" target="_blank" rel="noopener noreferrer">${h(s.name)}</a>`).join(", ") + ` · <a href="#fonti">Stato delle fonti</a>`;
}
function route() { const id = (location.hash || "").slice(1); st.view = VIEWS.some(v => v[0] === id) || id === "fonti" ? id : "home"; st.page = 30; st.dealPage = 48; if (st.q) { st.q = ""; $("#q").value = ""; } render(); window.scrollTo(0, 0); }

/* ----------------------------------------------------------- eventi */
let toastT; function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }
function markRead(u) { if (!u) return; st.seen.add(u); LS.set("seen", [...st.seen].slice(-800)); }
function findNews(url) { return (D.news || []).find(n => n.url === url) || st.saved.find(n => n.url === url); }
document.addEventListener("click", e => {
  const t = e.target;
  if (t.closest("[data-close-set]")) { closeSettings(); return; }
  const sv = t.closest("[data-save]"); if (sv) {
    const u = sv.dataset.save; const i = st.saved.findIndex(x => x.url === u);
    if (i >= 0) { st.saved.splice(i, 1); toast("Tolto dai salvati"); } else { const n = findNews(u); if (n) { st.saved.push({ id: "s" + hash(u), title: n.title, url: n.url, img: n.img, source: n.source, sourceId: n.sourceId, date: n.date, cats: n.cats, summary: n.summary, lang: n.lang }); toast("Salvato in Per te"); } }
    LS.set("saved", st.saved.slice(-200)); render(true); return;
  }
  const rd = t.closest("[data-read]"); if (rd) { markRead(rd.dataset.read); const it = rd.closest(".item"); if (it) it.classList.add("seen"); return; }
  const al = t.closest("[data-also]"); if (al) { const b = document.getElementById("also-" + al.dataset.also); if (b) b.classList.toggle("open"); return; }
  const rb = t.closest("[data-rail]"); if (rb) { const r = document.getElementById("rail-" + rb.dataset.rail); if (r) r.scrollBy({ left: +rb.dataset.dir * r.clientWidth * 0.85, behavior: "smooth" }); return; }
  const mo = t.closest("[data-more]"); if (mo) { if (mo.dataset.more === "deals") { st.dealPage += 48; $("#dealGrid").innerHTML = dealGrid(deals()); } else { st.page += 30; render(true); } return; }
  const set = (k, v) => { st[k] = v; st.page = 30; render(true); };
  let x;
  if ((x = t.closest("[data-q]"))) { st.q = x.dataset.q; $("#q").value = st.q; render(); window.scrollTo(0, 0); return; }
  if ((x = t.closest("[data-ncat]"))) return set("newsCat", x.dataset.ncat);
  if ((x = t.closest("[data-nsrc]"))) return set("newsSrc", x.dataset.nsrc);
  if ((x = t.closest("[data-nplat]"))) return set("newsPlat", x.dataset.nplat);
  if ((x = t.closest("[data-tsub]"))) return set("techSub", x.dataset.tsub);
  if ((x = t.closest("[data-rplat]"))) return set("relPlat", x.dataset.rplat);
  if ((x = t.closest("[data-vch]"))) return set("vidCh", x.dataset.vch);
  if ((x = t.closest("[data-gosrc]"))) { st.newsSrc = x.dataset.gosrc; st.newsCat = "tutte"; location.hash = "#notizie"; return; }
  if ((x = t.closest("[data-gocat]"))) { st.newsCat = x.dataset.gocat; return; }
  if ((x = t.closest("[data-hhopen]"))) { const id = x.dataset.hhopen; st.hhOpen = st.hhOpen === id ? null : id; render(true); const el = document.getElementById("hh-" + id); if (el && st.hhOpen) el.scrollIntoView({ block: "nearest", behavior: "smooth" }); return; }
  if ((x = t.closest("[data-hhos]"))) { st.hhOs = x.dataset.hhos; render(true); return; }
  if ((x = t.closest("[data-hhmax]"))) { st.hhMax = +x.dataset.hhmax || null; render(true); return; }
  if (t.closest("#hhClear")) { st.hhCmp = []; LS.set("hhCmp", []); render(true); return; }
  if ((x = t.closest("[data-goto]"))) { e.preventDefault(); const el = document.getElementById(x.dataset.goto); if (el) el.scrollIntoView({ behavior: "smooth" }); return; }
  if ((x = t.closest("[data-dplat]"))) { st.dealPlat = x.dataset.dplat; st.dealStore = "tutti"; st.dealPage = 48; render(true); return; }
  if ((x = t.closest("[data-store]"))) { st.dealStore = x.dataset.store; st.dealPage = 48; document.querySelectorAll("[data-store]").forEach(b => b.setAttribute("aria-pressed", b === x ? "true" : "false")); updDeals(); return; }
  if ((x = t.closest("[data-qmax]"))) { const v = +x.dataset.qmax; st.dealMax = v || null; st.dealPage = 48; render(true); return; }
  if ((x = t.closest("[data-cal]"))) { const d = +x.dataset.cal; if (!d) { const n = new Date(); st.cal = { y: n.getFullYear(), m: n.getMonth() }; st.calSel = ymd(today0()); } else { let { y, m } = st.cal; m += d; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } st.cal = { y, m }; } render(true); return; }
  if ((x = t.closest("[data-day]"))) { st.calSel = st.calSel === x.dataset.day ? null : x.dataset.day; render(true); return; }
  if ((x = t.closest("[data-delkw]"))) { st.kw.splice(+x.dataset.delkw, 1); LS.set("kw", st.kw); render(true); return; }
  if ((x = t.closest("[data-addkw]"))) { st.kw.push(x.dataset.addkw); LS.set("kw", st.kw); toast("Ora segui: " + x.dataset.addkw); render(true); return; }
  if ((x = t.closest("[data-lang]"))) { st.lang = x.dataset.lang; LS.set("lang", st.lang); renderSettings(); render(true); return; }
  if (t.closest("#notifBtn")) { Notification.requestPermission().then(p => { toast(p === "granted" ? "Avvisi attivi su questo dispositivo" : "Avvisi non attivati"); render(true); }); return; }
  if (t.closest("#clearQ")) { st.q = ""; $("#q").value = ""; render(); return; }
  if (t.closest("#clearSaved")) { st.saved = []; LS.set("saved", []); render(true); return; }
  if (t.closest("#tokDel")) { st.token = ""; LS.set("ghToken", null); renderSettings(); toast("GitHub scollegato da questo dispositivo"); return; }
  if (t.closest("#resetRead")) { st.seen = new Set(); LS.set("seen", []); toast("Tutto segnato come non letto"); render(true); return; }
});
function updDeals() { const L = deals(); const g = $("#dealGrid"); if (g) g.innerHTML = dealGrid(L); const c = $("#dealCount"); if (c) c.textContent = L.length + " offerte"; }
document.addEventListener("change", e => {
  if (e.target.id === "dealSort") { st.dealSort = e.target.value; updDeals(); }
  if (e.target.id === "dealLowest") { st.dealLowest = e.target.checked; updDeals(); }
  if (e.target.id === "hhSort") { st.hhSort = e.target.value; render(true); }
  if (e.target.dataset && e.target.dataset.hhcmp) { const id = e.target.dataset.hhcmp; st.hhCmp = e.target.checked ? [...st.hhCmp.filter(x => x !== id), id].slice(-4) : st.hhCmp.filter(x => x !== id); LS.set("hhCmp", st.hhCmp); render(true); if (e.target.checked && st.hhCmp.length === 4) toast("Puoi confrontare fino a 4 modelli"); }
  if (e.target.dataset && e.target.dataset.hide) { const id = e.target.dataset.hide; if (e.target.checked) st.hidden.delete(id); else st.hidden.add(id); LS.set("hidden", [...st.hidden]); render(true); }
});
document.addEventListener("input", e => { if (e.target.id === "dealMax") { st.dealMax = +e.target.value; $("#dealMaxV").textContent = eur(st.dealMax); updDeals(); } });
document.addEventListener("submit", e => {
  if (e.target.id === "kwForm") { e.preventDefault(); const v = $("#kwIn").value.trim(); if (v && !st.kw.some(k => norm(k) === norm(v))) { st.kw.push(v); LS.set("kw", st.kw); toast("Ora segui: " + v); } render(true); }
  if (e.target.id === "searchForm") e.preventDefault();
  if (e.target.id === "tokForm") { e.preventDefault(); const v = $("#tokIn").value.trim(); if (!/^(github_pat_|ghp_)[\w]{20,}$/.test(v)) { toast("Il codice non sembra giusto: deve iniziare con github_pat_"); return; } st.token = v; LS.set("ghToken", v); renderSettings(); toast("GitHub collegato: ora puoi usare Aggiorna ora"); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#settings").hidden) closeSettings(); if (e.key === "/" && !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName)) { e.preventDefault(); $("#q").focus(); } });
let qT; $("#q").addEventListener("input", e => { clearTimeout(qT); qT = setTimeout(() => { st.q = e.target.value.trim(); render(); }, 180); });
window.addEventListener("hashchange", route);
$("#themeBtn").addEventListener("click", () => { const r = document.documentElement; const cur = r.dataset.theme || "auto"; const nx = cur === "auto" ? "dark" : cur === "dark" ? "light" : "auto"; if (nx === "auto") delete r.dataset.theme; else r.dataset.theme = nx; try { if (nx === "auto") localStorage.removeItem("pg.theme"); else localStorage.setItem("pg.theme", nx); } catch (e) {} toast(nx === "auto" ? "Tema automatico" : nx === "dark" ? "Tema scuro" : "Tema chiaro"); });
$("#setBtn").addEventListener("click", openSettings);
$("#forceBtn").addEventListener("click", forceUpdate);
$("#toTop").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
let lastY = 0; window.addEventListener("scroll", () => { const y = window.scrollY; $("#toTop").hidden = y < 900; document.body.classList.toggle("scrolled", y > 60); lastY = y; }, { passive: true });
(function () { const d = new Date(); $("#today").textContent = GIORNI_L[d.getDay()].replace(/^./, c => c.toUpperCase()) + " " + d.getDate() + " " + MESI_L[d.getMonth()].toLowerCase() + " " + d.getFullYear(); })();

/* ---------------------------------------------- dati e aggiornamenti */
function notifyMatches() {
  if (!("Notification" in window) || Notification.permission !== "granted" || !st.kw.length) return;
  const M = matches(); const fresh = [...M.deals.map(d => ({ k: "d" + d.url, t: `${d.title}: ${eur(d.price)} su ${d.store}`, u: d.url })), ...M.free.map(f => ({ k: "f" + f.url, t: `Gratis: ${f.title}`, u: f.url })), ...M.news.map(n => ({ k: "n" + n.url, t: n.title, u: n.url }))];
  const done = new Set(LS.get("notified", [])); let n = 0;
  for (const x of fresh) { if (done.has(x.k)) continue; done.add(x.k); if (n++ < 3) { try { const no = new Notification("Plancia Gaming", { body: x.t, tag: x.k }); no.onclick = () => window.open(x.u, "_blank"); } catch (e) {} } }
  LS.set("notified", [...done].slice(-1000));
}
async function load(first, forceApply) {
  try {
    const r = await fetch("data.json?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) throw new Error(r.status);
    const nd = await r.json();
    if (first) { D = nd; render(); if (st.kw.length) { const M = matches(); LS.set("notified", [...new Set([...LS.get("notified", []), ...M.deals.map(d => "d" + d.url), ...M.free.map(f => "f" + f.url), ...M.news.map(n => "n" + n.url)])].slice(-1000)); } return; }
    if (D && nd.generatedAt === D.generatedAt) { renderLive(); return; }
    const old = new Set((D.news || []).map(n => n.url)); const nNew = (nd.news || []).filter(n => !old.has(n.url) && visible(n)).length;
    const apply = () => { D = nd; render(true); $("#newPill").hidden = true; notifyMatches(); };
    const typing = document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName);
    if (forceApply || (window.scrollY < 300 && !typing)) { apply(); if (nNew) toast(nNew + (nNew === 1 ? " nuova notizia" : " nuove notizie")); }
    else if (nNew) { const p = $("#newPill"); p.textContent = "↑ " + nNew + (nNew === 1 ? " nuova notizia" : " nuove notizie"); p.hidden = false; p.onclick = () => { apply(); window.scrollTo({ top: 0, behavior: "smooth" }); }; }
    else { D = nd; renderLive(); renderNav(); }
  } catch (e) {
    if (first) $("#main").innerHTML = `<div class="notice">Non riesco a caricare i dati in questo momento. Riprovo da solo tra un minuto.</div>`;
    $("#liveTxt").textContent = "Connessione assente, riprovo…";
  }
}
route(); load(true);
setInterval(() => { if (!document.hidden) load(false); }, POLL_MS);
setInterval(renderLive, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(false); });
})();
