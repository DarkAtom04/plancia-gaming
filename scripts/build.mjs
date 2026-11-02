// Plancia Gaming — raccoglitore automatico.
// Legge feed RSS delle testate, offerte (Steam, GOG, Nintendo eShop, Xbox, PlayStation, CheapShark, IsThereAnyDeal),
// giochi gratis (Epic, GamerPower), uscite (Steam, Nintendo, Xbox, RAWG, elenco curato con copertine automatiche)
// e scrive dist/data.json + i file del sito.
// Nessuna dipendenza esterna: gira con Node 20+.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CFG = JSON.parse(await fs.readFile(path.join(ROOT, "config/sources.json"), "utf8"));
const OUT = process.env.OUT_DIR || path.join(ROOT, "dist");
const STATE_FILE = process.env.STATE_FILE || path.join(ROOT, "state/state.json");
const FIXTURES = process.env.FIXTURES_DIR || "";
const NOW = process.env.FAKE_NOW ? new Date(process.env.FAKE_NOW) : new Date();
const ITAD_KEY = process.env.ITAD_KEY || "";
const RAWG_KEY = process.env.RAWG_KEY || "";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 PlanciaGaming/1.0";
const log = (...a) => console.log("[plancia]", ...a);

/* ------------------------------------------------------------------ rete */
let FIX = null;
async function fixtures() {
  if (FIX || !FIXTURES) return FIX;
  FIX = JSON.parse(await fs.readFile(path.join(FIXTURES, "index.json"), "utf8"));
  return FIX;
}
async function fetchText(url, { timeout = 15000, max = 4_000_000, accept = "*/*", headers = {} } = {}) {
  const fx = await fixtures();
  if (fx) {
    const f = fx[url];
    if (!f) return { ok: false, status: 404, text: "", url };
    return { ok: true, status: 200, text: await fs.readFile(path.join(FIXTURES, f), "utf8"), url };
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow",
      headers: { "user-agent": UA, "accept": accept, "accept-language": "it-IT,it;q=0.9,en;q=0.6", ...headers } });
    let text = "";
    if (r.body) {
      const reader = r.body.getReader(); const dec = new TextDecoder(); let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; text += dec.decode(value, { stream: true }); if (size > max) { ctl.abort(); break; } }
    }
    return { ok: r.ok, status: r.status, text, url: r.url || url };
  } catch (e) {
    const cause = e && e.cause ? " (" + (e.cause.code || e.cause.message || e.cause) + ")" : "";
    return { ok: false, status: 0, text: "", url, error: String(e && e.name === "AbortError" ? "timeout" : e && e.message || e) + cause };
  } finally { clearTimeout(t); }
}
async function fetchJSON(url, opt) {
  const r = await fetchText(url, { accept: "application/json", ...opt });
  if (!r.ok) throw new Error(`HTTP ${r.status}${r.error ? " " + r.error : ""}`);
  return JSON.parse(r.text);
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = undefined; } } }));
  return out;
}

/* --------------------------------------------------------------- testo */
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", laquo: "«", raquo: "»", euro: "€", deg: "°", middot: "·", bull: "•", copy: "©", reg: "®", trade: "™",
  agrave: "à", aacute: "á", egrave: "è", eacute: "é", igrave: "ì", iacute: "í", ograve: "ò", oacute: "ó", ugrave: "ù", uacute: "ú", Agrave: "À", Egrave: "È", Eacute: "É", Igrave: "Ì", Ograve: "Ò", Ugrave: "Ù", ccedil: "ç", ntilde: "ñ", ouml: "ö", uuml: "ü", auml: "ä", szlig: "ß" };
export function decode(s) {
  return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return m; } }
    return NAMED[e] ?? NAMED[e.toLowerCase()] ?? m;
  });
}
const unCdata = s => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
export function stripHtml(s) {
  let t = unCdata(s);
  if (/&lt;\w/.test(t)) t = decode(t); // HTML codificato due volte
  t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, " ").replace(/<\/p>/gi, " ").replace(/<[^>]+>/g, " ");
  return decode(t).replace(/\s+/g, " ").trim();
}
function cut(s, n) { s = String(s || ""); if (s.length <= n) return s; const c = s.slice(0, n); const i = c.lastIndexOf(" "); return (i > n * 0.6 ? c.slice(0, i) : c).replace(/[\s,.;:–-]+$/, "") + "…"; }
function cleanSummary(s, title) {
  let t = stripHtml(s)
    .replace(/(L'articolo|The post) .{3,200}? (proviene da|appeared first on) .*$/i, "")
    .replace(/(Continua a leggere|Leggi (tutto|l'articolo|di più)|Read more)[\s\S]*$/i, "")
    .replace(/\[(…|\.\.\.)\]\s*$/, "").trim();
  if (title && t.toLowerCase().startsWith(title.toLowerCase())) t = t.slice(title.length).replace(/^[\s:–-]+/, "");
  return cut(t, 230);
}
function tag(xml, name) {
  const re = new RegExp(`<${name.replace(":", "\\:")}(?:\\s[^>]*)?>([\\s\\S]*?)</${name.replace(":", "\\:")}>`, "i");
  const m = xml.match(re); return m ? unCdata(m[1]).trim() : "";
}
function tagsAll(xml, name) {
  const re = new RegExp(`<${name.replace(":", "\\:")}(?:\\s[^>]*)?>([\\s\\S]*?)</${name.replace(":", "\\:")}>`, "gi");
  return [...xml.matchAll(re)].map(m => unCdata(m[1]).trim());
}
function attrs(s) { const o = {}; for (const m of String(s).matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) o[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? ""); return o; }
function openTags(xml, name) { const re = new RegExp(`<${name.replace(":", "\\:")}(\\s[^>]*?)\\/?>`, "gi"); return [...xml.matchAll(re)].map(m => attrs(m[1])); }
function absUrl(u, base) {
  if (!u) return ""; u = decode(String(u).trim());
  if (u.startsWith("//")) u = "https:" + u;
  try { const x = new URL(u, base || undefined); if (!/^https?:$/.test(x.protocol)) return ""; if (x.protocol === "http:") x.protocol = "https:"; return x.href; } catch { return ""; }
}
const BAD_IMG = /(gravatar|feedburner|pixel|tracking|spacer|blank\.gif|1x1|emoji|wp-includes|logo[-_]?(small|feed)|\/ads?\/|doubleclick)/i;
function imgFromHtml(html, base) {
  const h = unCdata(html); const t = /&lt;img/i.test(h) ? decode(h) : h;
  for (const m of t.matchAll(/<img\b([^>]*)>/gi)) {
    const a = attrs(m[1]);
    if ((a.width && +a.width < 80) || (a.height && +a.height < 60)) continue;
    let src = a["data-src"] || a["data-lazy-src"] || a["data-original"] || a.src || "";
    if (!src && a.srcset) src = a.srcset.split(",")[0].trim().split(" ")[0];
    const u = absUrl(src, base); if (u && !BAD_IMG.test(u)) return u;
  }
  return "";
}
function upgradeImg(u) {
  // miniature WordPress "-150x150.jpg" -> originale; alcune CDN accettano parametri di dimensione
  return u.replace(/-\d{2,4}x\d{2,4}(\.(jpe?g|png|webp))(\?.*)?$/i, "$1$3");
}

/* ----------------------------------------------------------- feed RSS */
export function parseFeed(xml, base) {
  const out = [];
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    const title = stripHtml(tag(b, "title"));
    let link = stripHtml(tag(b, "link"));
    if (!/^https?:/i.test(link)) {
      const ls = openTags(b, "link"); const alt = ls.find(l => !l.rel || l.rel === "alternate") || ls[0];
      link = alt && alt.href || "";
    }
    if (!/^https?:/i.test(link)) { const g = stripHtml(tag(b, "guid")); if (/^https?:/i.test(g)) link = g; }
    link = absUrl(link, base);
    if (!title || !link) continue;
    const dateStr = tag(b, "pubDate") || tag(b, "dc:date") || tag(b, "published") || tag(b, "updated") || tag(b, "a10:updated");
    const html = tag(b, "content:encoded") || tag(b, "content") || "";
    const desc = tag(b, "description") || tag(b, "summary") || "";
    let img = "";
    for (const e of openTags(b, "enclosure")) { if ((e.type || "").startsWith("image") || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(e.url || "")) { img = e.url; break; } }
    if (!img) { const mc = openTags(b, "media:content").filter(m => m.url && (!m.medium || m.medium === "image") && (!m.type || m.type.startsWith("image"))); mc.sort((x, y) => (+y.width || 0) - (+x.width || 0)); if (mc[0]) img = mc[0].url; }
    if (!img) { const mt = openTags(b, "media:thumbnail")[0]; if (mt) img = mt.url; }
    if (!img) { const it = openTags(b, "itunes:image")[0]; if (it) img = it.href; }
    if (!img) { const im = tag(b, "image"); const u = tag(im || "", "url") || (/^https?:/.test(im) ? im : ""); if (u) img = u; }
    if (!img) img = imgFromHtml(html, link) || imgFromHtml(desc, link);
    img = absUrl(img, link); if (img && BAD_IMG.test(img)) img = "";
    out.push({ title, url: link, dateStr: stripHtml(dateStr), summary: cleanSummary(desc || html, title), img: img ? upgradeImg(img) : "", tags: tagsAll(b, "category").map(stripHtml).filter(Boolean).slice(0, 8) });
  }
  return out;
}
function discoverFeed(html, base) {
  for (const m of String(html).matchAll(/<link\b([^>]+)>/gi)) {
    const a = attrs(m[1]);
    if (/alternate/i.test(a.rel || "") && /(rss|atom)\+xml/i.test(a.type || "") && a.href) return absUrl(a.href, base);
  }
  return "";
}

/* ---------------------------------------------------- classificazione */
const RX = {
  offerte: /(offert[ae]\b|in sconto|sconti\b|sconto\b|prezzo (minimo|più basso|stracciato)|minimo storico|black friday|cyber monday|prime day|coupon|codice sconto|a soli \d|\b\d{1,2}\s?% di sconto|-\d{1,2}\s?%|\bdeals?\b|\bon sale\b|\bdiscount|\d+% off|price drop|lowest price|cheapest)/i,
  hardware: /\b(rtx\s?\d{3,4}|radeon|geforce|nvidia|amd|intel|arc b\d{3}|scheda video|schede video|graphics cards?|gpu|cpu|processor[ei]?|ryzen|core ultra|ssd|nvme|monitor|ddr5|memoria ram|ram ddr|alimentatore|scheda madre|motherboard|mouse|tastiera|keyboard|cuffie|headset|headphones|case pc|dlss|fsr|pc gaming|gaming pc|notebook gaming|laptop gaming|gaming laptop|overclock|benchmark|driver|steam machine|nintendo switch 2 oled|hyperx|logitech|razer|corsair|steelseries|asus rog|msi|nzxt|elgato|8bitdo|controller|joypad|gamepad)\b/i,
  handheld: /\b(steam deck|rog (xbox )?ally|xbox ally|legion go|msi claw|handhelds?|console portatil[ei]|pc portatil[ei] da gioco|ayaneo|gpd win|onexplayer|switch 2 lite)\b/i,
  ia: /(intelligenza artificiale|\bia generativa\b|\bchatgpt\b|\bopenai\b|\bgemini\b|\bclaude\b|\banthropic\b|\bcopilot\b|\bllm\b|\bdeepseek\b|\bmistral ai\b|\bgrok\b|\bmidjourney\b|\bsora\b|machine learning|deep learning|artificial intelligence|generative ai)/i,
  iaCase: /\b(AI|IA)\b/,
  uscite: /(data di uscita|data d'uscita|in uscita|uscirà|esce il|esce oggi|uscita fissata|disponibile dal|arriva il \d|arriverà il|al lancio|day one|rinviato|rinvio|release date|launches|out now|delayed)/i,
  recensioni: /\b(recensione|review|provato|abbiamo provato|prova su strada|anteprima|hands-on|preview)\b/i,
  gaming: /\b(videogioc\w*|gioco|giochi|gameplay|trailer|dlc|playstation|ps5|ps4|xbox|nintendo|switch|steam|epic games|game pass|ps plus|gta|rpg|fps|remake|remaster|sequel|esports?|videogames?|video games?|gaming|console|gamers?)\b/i
};
const TECH = /\b(smartphone|iphone|ipad|android|samsung|galaxy|xiaomi|pixel|apple|google|microsoft|windows|macos|linux|software|app|chip|tablet|notebook|laptop|\bpc\b|smart ?tv|oled|televisor[ei]|auricolari|earbuds|smartwatch|wearable|streaming|netflix|disney\+|prime video|spotify|youtube|twitch|sicurezza informatica|hacker|attacco informatico|malware|ransomware|cyber\w*|5g|wi-?fi|router|browser|chrome|firefox|whatsapp|instagram|telegram|tiktok|meta|social network|internet|cloud|data center|semiconduttor\w*|tsmc|qualcomm|snapdragon|mediatek|processore|smart glasses|visore|vr|realtà virtuale|realtà aumentata)\b/i;
const OFFTOPIC = /(auto elettric\w*|\bauto\b|automobil\w*|\bsuv\b|\bev\b|veicol\w*|xpeng|\bbyd\b|tesla model|motori\b|\bmoto\b|bici\w*|monopattin\w*|satellit\w*|razz[oi]\b|spazial\w*|\bnasa\b|\besa\b|rocket lab|astronom\w*|pannell[io] solar\w*|fotovoltaic\w*|energia rinnovabil\w*|bollett\w*|climatizzator\w*|condizionator\w*|aspirapolvere|robot aspira\w*|friggitric\w*|lavatric\w*|lavastovigli\w*|frigorifer\w*|asciugacapelli|\bphon\b|dyson|makita|bosch|trapano|sega circolare|avvitatore|utensil\w*|giardin\w*|macchina del caffè|materass\w*|lampadin\w*|aqara|termostat\w*|sanità|farmac\w*|\bcalcio\b|serie a|mutu[oi]|fisco|pensioni|bitcoin|criptovalut\w*|binance|calendari dell'avvento lego|\blego\b)/i;
export function classify(text, src) {
  src = typeof src === "string" ? { cat: src } : (src || {});
  const cats = new Set(); if (src.cat === "gaming") cats.add("gaming");
  for (const k of ["offerte", "hardware", "handheld", "ia", "uscite", "recensioni"]) if (RX[k].test(text)) cats.add(k);
  if (RX.iaCase.test(text)) cats.add("ia");
  const isGaming = RX.gaming.test(text); if (isGaming) cats.add("gaming");
  if (cats.has("handheld")) cats.add("hardware");
  if (src.cat === "ia") cats.add("ia");
  if (TECH.test(text) || ((src.cat === "tech" || src.cat === "hardware") && !cats.size)) cats.add("tech");
  let keep = true;
  if (src.filter) {
    const strong = isGaming || cats.has("hardware") || cats.has("ia") || cats.has("handheld");
    if (OFFTOPIC.test(text) && !strong) keep = false;
    else keep = strong || TECH.test(text);
  }
  if (cats.has("offerte") && !(cats.has("gaming") || cats.has("hardware") || TECH.test(text))) { cats.delete("offerte"); if (src.filter) keep = false; }
  const plats = PLAT.filter(([, r]) => r.test(text)).map(([p]) => p);
  return { cats: [...cats], plats, keep };
}
const PLAT = [["PS5", /\b(ps5|playstation 5|playstation)\b/i], ["Xbox", /\bxbox\b|game pass/i], ["Switch 2", /switch 2/i], ["Switch", /\bswitch\b(?! 2)|\bnintendo\b/i], ["PC", /\b(pc|steam|epic games store|gog)\b/i]];

/* -------------------------------------------------- raggruppamento */
const STOP = new Set("per con dei del della delle degli gli una uno che non sono come dal dalla dalle nel nella nelle sul sulla sulle alla alle agli all anche più tra fra suo sua suoi loro questo questa questi queste ecco ora oggi già solo tutto tutti tutte molto quando dove cosa chi perché però ancora dopo prima nuovo nuova nuovi nuove sarà saranno stato stata viene arriva arrivano the and for with from new will has have are was its your into you about".split(" "));
export function tokens(t) { return new Set(String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w))); }
function similar(a, b) { let inter = 0; for (const w of a) if (b.has(w)) inter++; const uni = a.size + b.size - inter; return { j: uni ? inter / uni : 0, inter }; }
export function cluster(items) {
  const cl = [];
  for (const it of items) {
    const tk = tokens(it.title); let best = null, bs = 0;
    for (const c of cl) {
      if (Math.abs(c.t - it.t) > 36 * 3600e3) continue;
      const { j, inter } = similar(tk, c.tk);
      if (inter >= 3 && j >= 0.34 && j > bs) { best = c; bs = j; }
    }
    if (best) { best.items.push(it); for (const w of tk) best.tk.add(w); }
    else cl.push({ tk, t: it.t, items: [it] });
  }
  return cl;
}

/* ------------------------------------------------------------- date */
const MON = { jan: 0, january: 0, gen: 0, gennaio: 0, feb: 1, february: 1, febbraio: 1, mar: 2, march: 2, marzo: 2, apr: 3, april: 3, aprile: 3, may: 4, mag: 4, maggio: 4, jun: 5, june: 5, giu: 5, giugno: 5, jul: 6, july: 6, lug: 6, luglio: 6, aug: 7, august: 7, ago: 7, agosto: 7, sep: 8, sept: 8, september: 8, set: 8, settembre: 8, oct: 9, october: 9, ott: 9, ottobre: 9, nov: 10, november: 10, novembre: 10, dec: 11, december: 11, dic: 11, dicembre: 11 };
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export function parseLooseDate(s) {
  s = String(s || "").toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/); if (m && MON[m[2]] != null) return `${m[3]}-${pad(MON[m[2]] + 1)}-${pad(+m[1])}`;
  m = s.match(/^([a-z]+)\.?\s+(\d{1,2})\s+(\d{4})$/); if (m && MON[m[1]] != null) return `${m[3]}-${pad(MON[m[1]] + 1)}-${pad(+m[2])}`;
  m = s.match(/^([a-z]+)\s+(\d{4})$/); if (m && MON[m[1]] != null) return `${m[2]}-${pad(MON[m[1]] + 1)}`;
  m = s.match(/^q([1-4])\s+(\d{4})$/); if (m) return `${m[2]}-${pad((+m[1]) * 3)}`;
  return "";
}

/* ---------------------------------------------------------- stato */
async function loadState() { try { return JSON.parse(await fs.readFile(STATE_FILE, "utf8")); } catch { return { seen: {}, og: {}, steamRel: {}, firstRun: NOW.toISOString() }; } }
async function saveState(st) {
  const lim = NOW.getTime() - 8 * 864e5;
  for (const k of Object.keys(st.seen)) if (Date.parse(st.seen[k]) < lim) delete st.seen[k];
  for (const k of Object.keys(st.og)) if (!st.seen[k]) delete st.og[k];
  for (const k of Object.keys(st.steamRel || {})) if (Date.parse(st.steamRel[k].at) < NOW.getTime() - 3 * 864e5) delete st.steamRel[k];
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(st));
}

/* ---------------------------------------------------------- notizie */
async function readSource(src, st) {
  const tried = [];
  for (const u of src.feeds || []) {
    const r = await fetchText(u, { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" });
    tried.push(`${u} → ${r.status || r.error}`);
    if (r.ok && /<(rss|feed|rdf)[\s>]/i.test(r.text)) { const it = parseFeed(r.text, u); if (it.length) return { items: it, feed: u }; }
  }
  if (src.home) {
    const h = await fetchText(src.home, { max: 1_500_000, accept: "text/html" });
    const f = h.ok ? discoverFeed(h.text, src.home) : "";
    tried.push(`autodiscovery ${src.home} → ${f || h.status || h.error}`);
    if (f) { const r = await fetchText(f); if (r.ok) { const it = parseFeed(r.text, f); if (it.length) return { items: it, feed: f }; } }
  }
  throw new Error(tried.join(" | "));
}
async function ogImage(url) {
  const r = await fetchText(url, { max: 600_000, timeout: 12000, accept: "text/html" });
  if (!r.ok) return "";
  const t = r.text;
  const m = t.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*>/i);
  if (!m) return "";
  const a = attrs(m[0]); const u = absUrl(a.content, url);
  return u && !BAD_IMG.test(u) ? u : "";
}
async function collectNews(st, health) {
  const keepMs = (CFG.keepHours || 72) * 3600e3;
  const res = await pool(CFG.feeds, 6, async src => {
    try { const r = await readSource(src, st); health.push({ id: src.id, name: src.name, ok: true, count: r.items.length, feed: r.feed }); return r.items.map(x => ({ ...x, src })); }
    catch (e) { health.push({ id: src.id, name: src.name, ok: false, count: 0, error: String(e.message || e).slice(0, 600) }); log("ERRORE", src.name, String(e.message || e).slice(0, 300)); return []; }
  });
  let all = res.flat().filter(Boolean);
  const seenUrl = new Set();
  all = all.filter(x => { const k = x.url.replace(/[?#].*$/, ""); if (seenUrl.has(k)) return false; seenUrl.add(k); return true; });
  for (const x of all) {
    if (!st.seen[x.url]) st.seen[x.url] = NOW.toISOString();
    let t = Date.parse(x.dateStr);
    if (!isFinite(t) || t > NOW.getTime() + 10 * 60e3) t = Date.parse(st.seen[x.url]);
    x.t = t;
  }
  all = all.filter(x => NOW.getTime() - x.t <= keepMs).sort((a, b) => b.t - a.t);
  // immagini mancanti: prova og:image dalla pagina dell'articolo (con cache)
  const need = all.filter(x => !x.img && st.og[x.url] === undefined).slice(0, 45);
  await pool(need, 6, async x => { st.og[x.url] = await ogImage(x.url); });
  for (const x of all) if (!x.img && st.og[x.url]) x.img = st.og[x.url];
  // classificazione + raggruppamento delle stesse notizie da più testate
  for (const x of all) { const c = classify(`${x.title} ${x.summary} ${x.tags.join(" ")}`, x.src); x.cats = c.cats; x.plats = c.plats; x.keep = c.keep; }
  const dropped = all.filter(x => !x.keep).length; all = all.filter(x => x.keep); log(`notizie fuori tema scartate: ${dropped}`);
  const cls = cluster(all);
  const news = cls.map((c, i) => {
    const lead = c.items.find(x => x.img && x.src.lang !== "en") || c.items.find(x => x.img) || c.items[0];
    const bySrc = new Map(); for (const x of c.items) if (!bySrc.has(x.src.id)) bySrc.set(x.src.id, x);
    const cats = new Set(), plats = new Set(); c.items.forEach(x => { x.cats.forEach(k => cats.add(k)); x.plats.forEach(k => plats.add(k)); });
    const first = Math.min(...c.items.map(x => x.t));
    return {
      id: "n" + i + "-" + lead.src.id, title: lead.title, url: lead.url, source: lead.src.name, sourceId: lead.src.id, lang: lead.src.lang || "it",
      date: new Date(Math.max(...c.items.map(x => x.t))).toISOString(), first: new Date(first).toISOString(),
      img: lead.img || (c.items.find(x => x.img) || {}).img || "", summary: lead.summary || (c.items.find(x => x.summary) || {}).summary || "",
      cats: [...cats], plats: [...plats], tags: lead.tags.slice(0, 5),
      also: [...bySrc.values()].filter(x => x !== lead && x.src.id !== lead.src.id).map(x => ({ source: x.src.name, sourceId: x.src.id, url: x.url, title: x.title, lang: x.src.lang || "it" })),
      size: bySrc.size
    };
  });
  news.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return news.slice(0, CFG.maxNews || 450);
}

/* ---------------------------------------------------------- offerte */
const priceNum = s => { if (typeof s === "number") return s; const m = String(s || "").replace(/\s/g, "").match(/(\d{1,3}(?:[.\s]\d{3})*|\d+)(?:[,.](\d{1,2}))?/); if (!m) return null; return parseFloat(m[1].replace(/[.\s]/g, "") + "." + (m[2] || "0")); };
async function steamFeatured(health) {
  try {
    const j = await fetchJSON(`https://store.steampowered.com/api/featuredcategories?cc=${CFG.steam.cc}&l=${CFG.steam.lang}`);
    health.push({ id: "steam-featured", name: "Steam (vetrina)", ok: true });
    return j;
  } catch (e) { health.push({ id: "steam-featured", name: "Steam (vetrina)", ok: false, error: String(e.message) }); return {}; }
}
function steamItem(x) {
  return { title: x.name, store: "Steam", price: (x.final_price ?? 0) / 100, regular: (x.original_price ?? x.final_price ?? 0) / 100, cut: x.discount_percent || 0,
    img: x.header_image || x.large_capsule_image || x.small_capsule_image || "", url: `https://store.steampowered.com/app/${x.id}/`, appid: x.id,
    until: x.discount_expiration ? new Date(x.discount_expiration * 1000).toISOString() : null, plats: ["PC"] };
}
export function parseSteamSearch(html) {
  const out = [];
  for (const m of String(html).matchAll(/<a\b[^>]*href="https:\/\/store\.steampowered\.com\/(app|bundle|sub)\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
    const kind = m[1], id = m[2], body = m[3];
    const title = stripHtml((body.match(/<span class="title">([\s\S]*?)<\/span>/) || [])[1] || "");
    if (!title) continue;
    const img = (body.match(/<img[^>]+src="([^"]+)"/) || [])[1] || "";
    let pct = (body.match(/class="[^"]*discount_pct[^"]*">\s*-?(\d+)%/) || body.match(/data-discount="(\d+)"/) || [])[1];
    const orig = (body.match(/class="[^"]*discount_original_price[^"]*">([^<]+)</) || [])[1];
    let fin = (body.match(/class="[^"]*discount_final_price[^"]*">([^<]+)</) || [])[1];
    const cents = (body.match(/data-price-final="(\d+)"/) || [])[1];
    if (!fin && cents) fin = (+cents / 100).toFixed(2);
    const rel = stripHtml((body.match(/search_released[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "");
    const header = kind === "app" ? `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg` : img.replace(/capsule_sm_120/, "header");
    const price = priceNum(fin); let regular = priceNum(orig); if (regular == null && price != null && pct > 0) regular = Math.round(price / (1 - pct / 100) * 100) / 100;
    out.push({ title, id: +id, kind, img: header || img, cut: pct ? +pct : 0, regular, price, released: rel, url: `https://store.steampowered.com/${kind}/${id}/` });
  }
  return out;
}
async function steamSearch(params, health, label) {
  try {
    const j = await fetchJSON(`https://store.steampowered.com/search/results/?${params}&cc=${CFG.steam.cc}&l=english&infinite=1&json=1`);
    const r = parseSteamSearch(j.results_html || ""); health.push({ id: "steam-" + label, name: "Steam (" + label + ")", ok: true, count: r.length }); return r;
  } catch (e) { health.push({ id: "steam-" + label, name: "Steam (" + label + ")", ok: false, error: String(e.message) }); return []; }
}
async function gogDeals(health) {
  const g = CFG.gog; const out = [];
  try {
    for (let page = 1; page <= (g.pages || 1); page++) {
      const j = await fetchJSON(`https://catalog.gog.com/v1/catalog?limit=48&order=desc:trending&discounted=eq:true&productType=in:game,pack&page=${page}&countryCode=${g.country}&locale=${g.locale}&currencyCode=${g.currency}`);
      for (const [k, p] of (j.products || []).entries()) {
        const pr = p.price || {}; const fin = priceNum(pr.finalMoney && pr.finalMoney.amount || pr.final); const base = priceNum(pr.baseMoney && pr.baseMoney.amount || pr.base);
        let c = priceNum(String(pr.discount || "").replace("-", "")); if (!c && fin != null && base) c = Math.round((1 - fin / base) * 100);
        const link = absUrl(p.storeLink || (p.slug ? `https://www.gog.com/en/game/${p.slug}` : "")).replace("/en/game/", "/it/game/");
        out.push({ title: p.title, store: "GOG", price: fin, regular: base, cut: c || 0, img: absUrl(p.coverHorizontal || p.coverVertical || ""), url: link, plats: ["PC"], rank: (page - 1) * 48 + k, rating: p.reviewsRating || null });
      }
      if (!j.pages || page >= j.pages) break;
    }
    const ok = out.filter(d => d.title && d.url && d.price != null);
    health.push({ id: "gog", name: "GOG", ok: ok.length > 0, count: ok.length, ...(ok.length ? {} : { error: "nessuna offerta ricevuta" }) }); return ok;
  } catch (e) { health.push({ id: "gog", name: "GOG", ok: false, error: String(e.message) }); return out; }
}
async function itadDeals(health) {
  if (!ITAD_KEY) { health.push({ id: "itad", name: "IsThereAnyDeal", ok: false, error: "chiave non impostata (facoltativa)" }); return []; }
  try {
    const list = [];
    for (const offset of [0, 200, 400]) {
      const j = await fetchJSON(`https://api.isthereanydeal.com/deals/v2?key=${encodeURIComponent(ITAD_KEY)}&country=${CFG.itad.country}&limit=200&offset=${offset}&sort=-trending`);
      list.push(...(j.list || [])); if (!j.hasMore) break;
    }
    const out = list.filter(x => x.type === "game" || !x.type).map(x => {
      const d = x.deal || {}; const a = x.assets || {};
      return { title: x.title, store: d.shop && d.shop.name || "Store", price: d.price && d.price.amount, regular: d.regular && d.regular.amount, cut: d.cut || 0,
        img: a.banner600 || a.banner400 || a.banner300 || a.boxart || "", url: d.url, until: d.expiry || null, rank: list.indexOf(x),
        lowest: !!(d.historyLow && d.historyLow.amount != null && d.price && d.price.amount <= d.historyLow.amount), plats: ["PC"] };
    }).filter(d => d.title && d.url);
    health.push({ id: "itad", name: "IsThereAnyDeal", ok: true, count: out.length }); return out;
  } catch (e) { health.push({ id: "itad", name: "IsThereAnyDeal", ok: false, error: String(e.message) }); return []; }
}
// Le fonti "lente" vengono interrogate al massimo ogni N minuti: tra un giro e l'altro si riusa l'ultimo risultato buono.
async function cachedSource(st, health, id, name, minutes, fn) {
  st.cache ||= {}; const c = st.cache[id]; const fresh = c && NOW.getTime() - Date.parse(c.at) < minutes * 60e3 && c.items && c.items.length;
  if (fresh && !FIXTURES) { health.push({ id, name, ok: true, count: c.items.length, cached: c.at }); return c.items; }
  try {
    const items = (await fn()).filter(d => d && d.title && d.url && typeof d.price === "number" && isFinite(d.price));
    if (!items.length) throw new Error("nessuna offerta ricevuta");
    st.cache[id] = { at: NOW.toISOString(), items };
    health.push({ id, name, ok: true, count: items.length }); return items;
  } catch (e) {
    const old = c && c.items && NOW.getTime() - Date.parse(c.at) < 24 * 3600e3 ? c.items : [];
    health.push({ id, name, ok: old.length > 0, count: old.length, error: String(e.message || e) + (old.length ? " (uso l'ultimo elenco buono)" : "") }); return old;
  }
}
// CheapShark: offerte di tanti store PC senza chiave (prezzi in dollari USA)
const CS_NAMES = { 2: "GamersGate", 3: "Green Man Gaming", 8: "EA app", 11: "Humble Store", 13: "Ubisoft Store", 15: "Fanatical", 21: "WinGameStore", 23: "GameBillet", 24: "Voidu", 25: "Epic Games Store", 27: "Gamesplanet", 28: "Gamesload", 29: "2Game", 30: "IndieGala", 31: "Blizzard", 33: "DLGamer", 34: "Noctre", 35: "DreamGame" };
async function cheapShark() {
  let names = { ...CS_NAMES };
  try { const L = await fetchJSON("https://www.cheapshark.com/api/1.0/stores", { headers: { "user-agent": "PlanciaGaming/1.0 (+https://github.com/DarkAtom04/plancia-gaming)" } }); for (const x of L || []) if (+x.isActive === 1 && CS_NAMES[x.storeID] === undefined && !["1", "7"].includes(String(x.storeID))) names[x.storeID] = x.storeName; else if (+x.isActive === 0) delete names[x.storeID]; } catch {}
  const ids = Object.keys(names); const out = []; const errs = [];
  await pool(ids, 2, async id => {
    let L = null;
    for (const u of [`https://www.cheapshark.com/api/1.0/deals?storeID=${id}&pageSize=60&sortBy=Deal%20Rating&onSale=1`, `https://www.cheapshark.com/api/1.0/deals?storeID=${id}&pageSize=60`]) {
      try { L = await fetchJSON(u, { headers: { "user-agent": "PlanciaGaming/1.0 (+https://github.com/DarkAtom04/plancia-gaming)", "accept-language": "en" } }); break; } catch (e) { errs.push(e.message); }
    }
    if (!L) return;
    (Array.isArray(L) ? L : []).forEach((x, k) => {
      const price = +x.salePrice, regular = +x.normalPrice; if (!(regular > price)) return;
      out.push({ title: decode(x.title), store: names[id], price, regular, cut: Math.round(+x.savings || (1 - price / regular) * 100), cur: "USD",
        img: x.steamAppID ? `https://cdn.akamai.steamstatic.com/steam/apps/${x.steamAppID}/header.jpg` : String(x.thumb || ""),
        url: `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(x.dealID)}`, plats: ["PC"], rank: k + 20, rating: +x.steamRatingPercent || null, meta: +x.metacriticScore || null });
    });
  });
  if (!out.length && errs.length) throw new Error(errs[0]);
  return out;
}
// Nintendo eShop italiano: giochi Switch e Switch 2 in sconto
const nintPlats = d => { const s = [].concat(d.system_names_txt || d.playable_on_txt || []).join(" "); const p = []; if (/switch 2/i.test(s)) p.push("Switch 2"); if (/switch(?! 2)/i.test(s.replace(/switch 2/gi, ""))) p.push("Switch"); return p.length ? p : ["Switch"]; };
const nintImg = d => { const u = d.image_url_h2x1_s || d.image_url || d.image_url_sq_s || ""; return u.startsWith("//") ? "https:" + u : u; };
const nintUrl = u => !u ? "" : /^https?:/.test(u) ? u : "https://www.nintendo.com" + (u.startsWith("/") ? u : "/" + u);
async function nintendoDeals() {
  const out = [];
  for (const start of [0, 200]) {
    const q = new URLSearchParams({ q: "*", fq: "type:GAME AND price_has_discount_b:true", rows: "200", start: String(start), wt: "json", sort: "popularity asc" });
    const j = await fetchJSON(`https://searching.nintendo-europe.com/it/select?${q}`);
    const docs = (j.response && j.response.docs) || [];
    docs.forEach((d, k) => {
      const price = +d.price_discounted_f, regular = +d.price_regular_f; if (!(regular > price) || !d.title) return;
      out.push({ title: decode(d.title), store: "Nintendo eShop", price, regular, cut: Math.round(+d.price_discount_percentage_f || (1 - price / regular) * 100), img: nintImg(d), url: nintUrl(d.url), plats: nintPlats(d), rank: start + k });
    });
    if (docs.length < 200) break;
  }
  return out;
}
// Microsoft Store / Xbox: elenco "Offerte" e dettagli prezzi in euro
// ID dei prodotti dalle pagine di xbox.com (riserva se l'elenco Microsoft non risponde)
async function xboxPageIds(urls) {
  const ids = []; let last = "";
  for (const u of urls) {
    const r = await fetchText(u, { accept: "text/html" }); if (!r.ok) { last = `HTTP ${r.status}${r.error ? " " + r.error : ""}`; continue; }
    for (const m of r.text.matchAll(/\/games\/store\/[^"'\/\s]+\/([A-Z0-9]{12})\b/g)) if (!ids.includes(m[1])) ids.push(m[1]);
    for (const m of r.text.matchAll(/"(?:productId|ProductId|bigId)"\s*:\s*"([A-Z0-9]{12})"/g)) if (!ids.includes(m[1])) ids.push(m[1]);
  }
  if (!ids.length) throw new Error("pagine Xbox senza giochi" + (last ? " (" + last + ")" : ""));
  return ids;
}
async function recoIds(list, max) {
  const ids = [];
  for (const skip of [0, 200]) {
    const j = await fetchJSON(`https://reco-public.rec.mp.microsoft.com/channels/Reco/V8.0/Lists/Computed/${list}?Market=IT&Language=IT&ItemTypes=Game&deviceFamily=Windows.Xbox&count=200&skipitems=${skip}`);
    for (const it of j.Items || []) if (it.Id && !ids.includes(it.Id)) ids.push(it.Id);
    if (!j.Items || j.Items.length < 200 || ids.length >= max) break;
  }
  return ids;
}
async function xboxDeals() {
  let ids = [];
  try { ids = await recoIds("Deal", 400); } catch (e) { ids = await xboxPageIds(["https://www.xbox.com/it-IT/promotions/sales/sales-and-specials", "https://www.xbox.com/it-IT/games/browse/DynamicChannel.GameDeals"]); }
  const chunks = []; for (let i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
  const out = [];
  await pool(chunks, 3, async ch => {
    const j = await fetchJSON(`https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${ch.join(",")}&market=IT&languages=it-IT&MS-CV=DGU1mcuYo0WMMp%2BF.1`);
    for (const p of j.Products || []) {
      const lp = (p.LocalizedProperties || [])[0] || {}; let best = null;
      for (const s of p.DisplaySkuAvailabilities || []) for (const a of s.Availabilities || []) {
        const pr = a.OrderManagementData && a.OrderManagementData.Price; if (!pr || !(a.Actions || []).includes("Purchase")) continue;
        if (pr.ListPrice > 0 && pr.MSRP > pr.ListPrice && (!best || pr.ListPrice < best.price)) best = { price: pr.ListPrice, regular: pr.MSRP, until: a.Conditions && a.Conditions.EndDate && !/^9998|^9999/.test(a.Conditions.EndDate) ? a.Conditions.EndDate : null };
      }
      if (!best || !lp.ProductTitle) continue;
      const imgs = lp.Images || []; const im = imgs.find(i => i.ImagePurpose === "SuperHeroArt") || imgs.find(i => i.ImagePurpose === "TitledHeroArt") || imgs.find(i => i.ImagePurpose === "BoxArt") || imgs.find(i => i.ImagePurpose === "Poster") || imgs[0];
      let img = im && im.Uri || ""; if (img.startsWith("//")) img = "https:" + img; if (img) img += (img.includes("?") ? "&" : "?") + "w=640";
      out.push({ title: lp.ProductTitle, store: "Xbox Store", price: best.price, regular: best.regular, cut: Math.round((1 - best.price / best.regular) * 100), until: best.until, img, url: `https://www.xbox.com/it-IT/games/store/x/${p.ProductId}`, plats: ["Xbox"], rank: ids.indexOf(p.ProductId) });
    }
  });
  return out;
}
// PlayStation Store: categoria "Offerte" tramite l'API del sito (può cambiare senza preavviso)
const PS_HASH = "4ce7d410a4db2c8b635a48c1dcec375906ff63b19dadd87e073f8fd0c0481d35";
async function psDeals() {
  const out = []; const cats = (CFG.playstation && CFG.playstation.categories) || ["3f772501-f6f8-49b7-abac-874a88ca4897"];
  for (const cat of cats) for (const offset of [0, 100, 200]) {
    const vars = { id: cat, pageArgs: { size: 100, offset }, sortBy: null, filterBy: [], facetOptions: [] };
    const url = `https://web.np.playstation.com/api/graphql/v1/op?operationName=categoryGridRetrieve&variables=${encodeURIComponent(JSON.stringify(vars))}&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: PS_HASH } }))}`;
    const j = await fetchJSON(url, { headers: { "x-psn-store-locale-override": "it-IT", "content-type": "application/json" } });
    const L = (((j.data || {}).categoryGridRetrieve || {}).products) || [];
    L.forEach((p, k) => {
      const pr = p.price || {}; const price = priceNum(pr.discountedPrice), regular = priceNum(pr.basePrice);
      if (price == null || !(regular > price) || pr.isFree) return;
      const m = p.media || []; const im = m.find(x => x.role === "MASTER") || m.find(x => x.role === "GAMEHUB_COVER_ART") || m.find(x => x.type === "IMAGE");
      const plats = (p.platforms || []).map(x => /PS5/.test(x) ? "PS5" : /PS4/.test(x) ? "PS4" : x).filter((x, i, a) => a.indexOf(x) === i);
      out.push({ title: p.name, store: "PlayStation Store", price, regular, cut: priceNum(String(pr.discountText || "").replace("-", "")) || Math.round((1 - price / regular) * 100),
        img: im && im.url ? im.url + (im.url.includes("?") ? "" : "?w=640") : "", url: `https://store.playstation.com/it-it/product/${p.id}`, plats: plats.length ? plats : ["PS5"], rank: offset + k, plus: !!(pr.serviceBranding || []).length && /PLUS/i.test(String(pr.serviceBranding)) });
    });
    if (L.length < 100) break;
  }
  return out;
}
const normTitle = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[™®©:’'!?.,\-–—()[\]]/g, " ").replace(/\b(the|edition|edizione|standard|digital|deluxe|goty|game of the year)\b/g, " ").replace(/\s+/g, " ").trim();
async function collectDeals(featured, health, st) {
  const steam = [];
  for (const k of ["specials", "top_sellers", "new_releases"]) for (const x of (featured[k] && featured[k].items) || []) if (x.discounted && x.discount_percent > 0) steam.push(steamItem(x));
  const top = new Set(((featured.top_sellers || {}).items || []).map(x => x.id));
  const s1 = [...await steamSearch("specials=1&start=0&count=100", health, "offerte"), ...await steamSearch("specials=1&start=100&count=100", health, "offerte 2"), ...await steamSearch("specials=1&start=200&count=100", health, "offerte 3")];
  if (s1.length && !s1.some(x => x.price != null)) log("Steam: risultati senza prezzo, esempio:", JSON.stringify(s1[0]));
  s1.forEach((x, k) => { if (x.cut > 0 && x.price != null && x.kind === "app") steam.push({ title: x.title, store: "Steam", price: x.price, regular: x.regular, cut: x.cut, img: x.img, url: x.url, appid: x.id, plats: ["PC"], rank: k }); });
  for (const d of steam) if (top.has(d.appid)) d.bestseller = true;
  const [gog, itad, nin, xbox, ps, cs] = await Promise.all([gogDeals(health), itadDeals(health),
    cachedSource(st, health, "nintendo", "Nintendo eShop", 20, nintendoDeals), cachedSource(st, health, "xbox", "Xbox Store", 30, xboxDeals),
    cachedSource(st, health, "playstation", "PlayStation Store", 30, psDeals), cachedSource(st, health, "cheapshark", "Altri store PC (CheapShark)", 30, cheapShark)]);
  // ITAD (in euro) prima di CheapShark (in dollari): a parità di gioco e store vince quello in euro
  const all = [...steam, ...gog, ...itad, ...nin, ...xbox, ...ps, ...cs].filter(d => typeof d.price === "number" && isFinite(d.price));
  const storeKey = s => String(s).toLowerCase().replace(/ubisoft.*|uplay/, "ubisoft").replace(/^ea.*|origin/, "ea").replace(/humble.*/, "humble").replace(/green man.*|gmg/, "gmg").replace(/epic.*/, "epic").replace(/\W+/g, "");
  const seen = new Map(); const out = [];
  for (const d of all) { const k = normTitle(d.title) + "|" + storeKey(d.store); if (seen.has(k)) { const o = seen.get(k); if (!o.until && d.until) o.until = d.until; if (!o.img && d.img) o.img = d.img; continue; } seen.set(k, d); out.push(d); }
  // confronto prezzi tra store per lo stesso gioco
  const byT = new Map(); for (const d of out) { const k = normTitle(d.title) + "|" + (d.cur || "EUR") + "|" + (d.plats || []).filter(p => p === "PC").join(""); if (!byT.has(k)) byT.set(k, []); byT.get(k).push(d); }
  for (const L of byT.values()) if (L.length > 1) { L.sort((a, b) => a.price - b.price); L.forEach(d => { d.alt = L.filter(x => x !== d).map(x => ({ store: x.store, price: x.price, url: x.url })); d.best = d === L[0]; }); }
  // tieni un numero ragionevole per store, privilegiando i più popolari
  const per = new Map(); const res = [];
  for (const d of out.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))) { const k = storeKey(d.store); const n = per.get(k) || 0; const cap = 320; if (n >= cap) continue; per.set(k, n + 1); res.push(d); }
  return res.slice(0, 2200);
}

/* ---------------------------------------------------------- gratis */
async function epicFree(health) {
  try {
    let j = null; let last = null;
    for (const host of ["store-site-backend-static-ipv4.ak.epicgames.com", "store-site-backend-static.ext.epicgames.com"]) {
      try { j = await fetchJSON(`https://${host}/freeGamesPromotions?locale=it&country=IT&allowCountries=IT`); break; } catch (e) { last = e; }
    }
    if (!j) throw last || new Error("nessuna risposta");
    const els = (((j.data || {}).Catalog || {}).searchStore || {}).elements || [];
    const out = [];
    for (const e of els) {
      const pick = arr => (arr || []).flatMap(p => p.promotionalOffers || []).find(o => o.discountSetting && o.discountSetting.discountPercentage === 0);
      const now = pick(e.promotions && e.promotions.promotionalOffers), next = pick(e.promotions && e.promotions.upcomingPromotionalOffers);
      const o = now || next; if (!o) continue;
      const imgs = e.keyImages || []; const img = (imgs.find(i => i.type === "OfferImageWide") || imgs.find(i => i.type === "DieselStoreFrontWide") || imgs.find(i => i.type === "Thumbnail") || imgs[0] || {}).url || "";
      const slug = (e.productSlug && e.productSlug !== "[]" ? e.productSlug : "") || ((e.offerMappings || [])[0] || {}).pageSlug || (((e.catalogNs || {}).mappings || [])[0] || {}).pageSlug || "";
      out.push({ title: e.title, service: "Epic Games Store", img: absUrl(img), url: slug ? `https://store.epicgames.com/it/p/${slug.replace(/\/home$/, "")}` : "https://store.epicgames.com/it/free-games",
        from: now ? null : o.startDate, until: o.endDate, keep: true, plats: ["PC"], worth: e.price && e.price.totalPrice && e.price.totalPrice.originalPrice ? e.price.totalPrice.originalPrice / 100 : null });
    }
    health.push({ id: "epic", name: "Epic Games (gratis)", ok: true, count: out.length }); return out;
  } catch (e) { health.push({ id: "epic", name: "Epic Games (gratis)", ok: false, error: String(e.message) }); return []; }
}
async function gamerPower(health) {
  try {
    const j = await fetchJSON("https://www.gamerpower.com/api/giveaways?type=game&sort-by=date");
    const out = (Array.isArray(j) ? j : []).filter(g => !g.status || /active/i.test(g.status)).map(g => {
      const p = String(g.platforms || ""); const plats = [];
      if (/pc|steam|epic|gog|itch|ubisoft|origin|ea|battle/i.test(p)) plats.push("PC"); if (/ps4|ps5|playstation/i.test(p)) plats.push("PS5"); if (/xbox/i.test(p)) plats.push("Xbox"); if (/switch|nintendo/i.test(p)) plats.push("Switch");
      const service = (p.split(",").map(s => s.trim()).find(s => !/^pc$/i.test(s)) || p || "Giveaway");
      const until = g.end_date && !/n\/a/i.test(g.end_date) ? new Date(g.end_date.replace(" ", "T") + "Z").toISOString() : null;
      const worth = priceNum(g.worth);
      return { title: String(g.title || "").replace(/\s*giveaway\s*$/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim(),
        service, img: absUrl(g.image || g.thumbnail), url: absUrl(g.open_giveaway_url || g.gamerpower_url), until, keep: !/prime gaming|game pass/i.test(p), plats, worth: worth || null, note: stripHtml(g.instructions || "").slice(0, 160) };
    }).filter(g => g.title && g.url);
    health.push({ id: "gamerpower", name: "GamerPower (gratis)", ok: true, count: out.length }); return out;
  } catch (e) { health.push({ id: "gamerpower", name: "GamerPower (gratis)", ok: false, error: String(e.message) }); return []; }
}
async function collectFree(health) {
  const [ep, gp] = await Promise.all([epicFree(health), gamerPower(health)]);
  const out = []; const seen = new Set();
  for (const f of [...ep, ...gp]) { const k = normTitle(f.title) + "|" + (/epic/i.test(f.service) ? "epic" : f.service.toLowerCase()); if (seen.has(k)) continue; seen.add(k); out.push(f); }
  return out.filter(f => !f.until || Date.parse(f.until) > NOW.getTime() - 3600e3).slice(0, 80);
}

/* ------------------------------------------------- uscite: console e copertine */
async function cachedList(st, health, id, name, minutes, fn) {
  st.cache ||= {}; const c = st.cache[id];
  if (c && !FIXTURES && NOW.getTime() - Date.parse(c.at) < minutes * 60e3 && c.items && c.items.length) { health.push({ id, name, ok: true, count: c.items.length, cached: c.at }); return c.items; }
  try { const items = await fn(); if (!items.length) throw new Error("nessun elemento ricevuto"); st.cache[id] = { at: NOW.toISOString(), items }; health.push({ id, name, ok: true, count: items.length }); return items; }
  catch (e) { const old = c && c.items || []; health.push({ id, name, ok: old.length > 0, count: old.length, error: String(e.message || e) }); return old; }
}
async function nintendoUpcoming() {
  const q = new URLSearchParams({ q: "*", fq: "type:GAME AND dates_released_dts:[NOW TO NOW+400DAYS]", rows: "150", wt: "json", sort: "popularity asc" });
  const j = await fetchJSON(`https://searching.nintendo-europe.com/it/select?${q}`);
  return ((j.response && j.response.docs) || []).map((d, k) => {
    const dt = [].concat(d.dates_released_dts || [])[0]; if (!dt || !d.title) return null;
    return { date: String(dt).slice(0, 10), title: decode(d.title), img: nintImg(d), url: nintUrl(d.url), plats: nintPlats(d), src: "Nintendo", pop: k };
  }).filter(Boolean);
}
async function xboxUpcoming() {
  let ids = [];
  try { const j = await fetchJSON("https://reco-public.rec.mp.microsoft.com/channels/Reco/V8.0/Lists/Computed/ComingSoon?Market=IT&Language=IT&ItemTypes=Game&deviceFamily=Windows.Xbox&count=120"); ids = (j.Items || []).map(x => x.Id).filter(Boolean); }
  catch (e) { ids = (await xboxPageIds(["https://www.xbox.com/it-IT/games/browse/DynamicChannel.ComingSoon", "https://www.xbox.com/it-IT/games/coming-soon"])).slice(0, 120); }
  const out = [];
  const chunks = []; for (let i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
  await pool(chunks, 3, async ch => {
    const r = await fetchJSON(`https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${ch.join(",")}&market=IT&languages=it-IT&MS-CV=DGU1mcuYo0WMMp%2BF.1`);
    for (const p of r.Products || []) {
      const lp = (p.LocalizedProperties || [])[0] || {}; const mp = (p.MarketProperties || [])[0] || {};
      const rd = mp.OriginalReleaseDate || ""; if (!lp.ProductTitle || !rd || /^(9998|9999|2100)/.test(rd)) continue;
      const imgs = lp.Images || []; const im = imgs.find(i => i.ImagePurpose === "SuperHeroArt") || imgs.find(i => i.ImagePurpose === "TitledHeroArt") || imgs.find(i => i.ImagePurpose === "BoxArt") || imgs[0];
      let img = im && im.Uri || ""; if (img.startsWith("//")) img = "https:" + img; if (img) img += "?w=640";
      const plats = ["Xbox"];
      out.push({ date: rd.slice(0, 10), title: lp.ProductTitle, img, url: `https://www.xbox.com/it-IT/games/store/x/${p.ProductId}`, plats, src: "Xbox", pop: ids.indexOf(p.ProductId) });
    }
  });
  return out;
}
// copertina per i giochi dell'elenco manuale: prima Steam, poi Wikipedia (memorizzata per 10 giorni)
async function findCover(title, st) {
  st.covers ||= {}; const k = normTitle(title); const c = st.covers[k];
  if (c && NOW.getTime() - Date.parse(c.at) < (c.img ? 30 : 10) * 864e5) return c;
  let res = { img: "", url: "", at: NOW.toISOString() };
  try {
    const j = await fetchJSON(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&cc=${CFG.steam.cc}&l=english`);
    const want = normTitle(title).replace(/\s*\(switch 2\)$/, "");
    const hit = (j.items || []).find(x => normTitle(x.name) === want) || (j.items || []).find(x => normTitle(x.name).startsWith(want) && !/soundtrack|demo|dlc|pack|kit/i.test(x.name));
    if (hit) res = { ...res, img: `https://cdn.akamai.steamstatic.com/steam/apps/${hit.id}/header.jpg`, url: `https://store.steampowered.com/app/${hit.id}/` };
  } catch {}
  if (!res.img) {
    try {
      const j = await fetchJSON(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=640&pilicense=any&generator=search&gsrlimit=1&gsrsearch=${encodeURIComponent(title + " video game")}`, { headers: { "api-user-agent": "PlanciaGaming/1.0 (sito personale)" } });
      const pg = Object.values((j.query && j.query.pages) || {})[0];
      const head = normTitle(title).split(" ").slice(0, 2).join(" ");
      if (pg && pg.thumbnail && pg.thumbnail.source && normTitle(pg.title).includes(head)) res = { ...res, img: pg.thumbnail.source, wiki: `https://en.wikipedia.org/wiki/${encodeURIComponent(pg.title.replace(/ /g, "_"))}` };
    } catch {}
  }
  st.covers[k] = res; return res;
}
/* ---------------------------------------------------------- uscite */
async function collectReleases(featured, st, health) {
  const today = ymd(NOW); const limit = ymd(new Date(NOW.getTime() + 400 * 864e5)); const out = [];
  // Steam: più attesi in arrivo (data dalla pagina di ricerca, in inglese)
  const up = await steamSearch("filter=popularcomingsoon&start=0&count=100", health, "in arrivo");
  for (const x of up) { if (x.kind !== "app") continue; const d = parseLooseDate(x.released); if (!d) continue; out.push({ date: d, title: x.title, img: x.img, url: x.url, plats: ["PC"], src: "Steam" }); }
  // Steam: vetrina "prossimamente" con data dai dettagli (cache 3 giorni)
  const cs = ((featured.coming_soon || {}).items || []).slice(0, 20);
  await pool(cs, 4, async x => {
    let c = st.steamRel[x.id];
    if (!c) { try { const j = await fetchJSON(`https://store.steampowered.com/api/appdetails?appids=${x.id}&cc=${CFG.steam.cc}&l=english&filters=release_date`); const rd = j[x.id] && j[x.id].data && j[x.id].data.release_date; c = { date: rd ? parseLooseDate(rd.date) : "", at: NOW.toISOString() }; st.steamRel[x.id] = c; } catch { return; } }
    if (c.date) out.push({ date: c.date, title: x.name, img: x.header_image || x.large_capsule_image, url: `https://store.steampowered.com/app/${x.id}/`, plats: ["PC"], src: "Steam" });
  });
  // RAWG (facoltativo): uscite su tutte le piattaforme con copertina
  if (RAWG_KEY) {
    try {
      const to = ymd(new Date(NOW.getTime() + 180 * 864e5)); let n = 0;
      for (const page of [1, 2, 3]) {
        const j = await fetchJSON(`https://api.rawg.io/api/games?key=${encodeURIComponent(RAWG_KEY)}&dates=${today},${to}&ordering=-added&page_size=40&page=${page}`);
        for (const g of j.results || []) {
          const plats = []; for (const p of g.platforms || []) { const nm = p.platform && p.platform.name || ""; if (/^pc$/i.test(nm)) plats.push("PC"); else if (/playstation 5/i.test(nm)) plats.push("PS5"); else if (/xbox series/i.test(nm)) plats.push("Xbox"); else if (/switch 2/i.test(nm)) plats.push("Switch 2"); else if (/nintendo switch/i.test(nm)) plats.push("Switch"); }
          if (g.released) { out.push({ date: g.released, title: g.name, img: absUrl(g.background_image), url: `https://rawg.io/games/${g.slug}`, plats: [...new Set(plats)], src: "RAWG", added: g.added || 0 }); n++; }
        }
        if (!j.next) break;
      }
      health.push({ id: "rawg", name: "RAWG (uscite)", ok: true, count: n });
    } catch (e) { health.push({ id: "rawg", name: "RAWG (uscite)", ok: false, error: String(e.message) }); }
  } else health.push({ id: "rawg", name: "RAWG (uscite)", ok: false, error: "chiave non impostata (facoltativa)" });
  // console: Nintendo eShop e Xbox Store (aggiornati ogni 6 ore)
  const [nu, xu] = await Promise.all([cachedList(st, health, "nintendo-uscite", "Nintendo eShop (uscite)", 360, nintendoUpcoming), cachedList(st, health, "xbox-uscite", "Xbox Store (uscite)", 360, xboxUpcoming)]);
  for (const r of [...nu, ...xu]) out.push({ ...r, big: r.pop < 8 });
  // elenco manuale (titoli attesi) con copertina trovata in automatico
  let manual = []; try { manual = JSON.parse(await fs.readFile(path.join(ROOT, "data/releases-manual.json"), "utf8")); } catch {}
  const needCover = manual.filter(r => !r.img); let looked = 0;
  await pool(needCover, 3, async r => { const k = normTitle(r.title); const known = st.covers && st.covers[k]; if (!known && looked++ >= 30) return; const c = await findCover(r.title, st); if (c.img) r.img = c.img; if (c.url) r.url = c.url; else if (!r.url && c.wiki) r.url = c.wiki; });
  for (const r of manual) out.push({ ...r, plats: r.platforms || r.plats || [], src: "Redazione", big: !!r.big });
  // unione per titolo: tieni data precisa, unisci piattaforme e immagini
  const map = new Map();
  for (const r of out) {
    const k = normTitle(r.title).replace(/\s*\(switch 2\)$/, ""); const o = map.get(k);
    if (!o) { map.set(k, { ...r, plats: [...new Set(r.plats || [])] }); continue; }
    o.plats = [...new Set([...(o.plats || []), ...(r.plats || [])])];
    if ((!o.img || /wikipedia|wikimedia/.test(o.img)) && r.img && !/wikipedia|wikimedia/.test(r.img)) o.img = r.img; else if (!o.img && r.img) o.img = r.img; if (r.big) o.big = true; if (!o.note && r.note) o.note = r.note; if (!o.genre && r.genre) o.genre = r.genre;
    if (!o.url && r.url) o.url = r.url;
    if (o.src === "Redazione") { /* la data della redazione ha la precedenza */ } else if (r.src === "Redazione" || (o.date.length < 10 && r.date.length === 10)) { o.date = r.date; o.url = r.url || o.url; o.src = r.src; }
  }
  const res = [...map.values()].filter(r => r.date && r.date.slice(0, 7) >= today.slice(0, 7) && r.date <= limit && !(r.date.length === 10 && r.date < ymd(new Date(NOW.getTime() - 7 * 864e5))));
  // i più popolari su RAWG/Steam diventano "attesi"
  res.filter(r => r.src === "RAWG").sort((a, b) => (b.added || 0) - (a.added || 0)).slice(0, 15).forEach(r => r.big = true);
  res.sort((a, b) => (a.date + (a.date.length === 7 ? "-28" : "")).localeCompare(b.date + (b.date.length === 7 ? "-28" : "")));
  return res.slice(0, 600);
}

/* ------------------------------------------------------------ video */
async function collectVideos(health) {
  const out = [];
  await pool(CFG.videos || [], 5, async v => {
    const r = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${v.channel}`);
    if (!r.ok) { health.push({ id: v.id, name: "YouTube " + v.name, ok: false, error: `HTTP ${r.status || r.error}` }); return; }
    const it = parseFeed(r.text, "https://www.youtube.com/").filter(x => !/#shorts?\b/i.test(x.title)).slice(0, 12);
    health.push({ id: v.id, name: "YouTube " + v.name, ok: true, count: it.length });
    for (const x of it) {
      const id = (x.url.match(/[?&]v=([\w-]{6,})/) || x.url.match(/\/(?:shorts|embed)\/([\w-]{6,})/) || [])[1];
      const t = Date.parse(x.dateStr); if (!id || !isFinite(t) || NOW.getTime() - t > 7 * 864e5) continue;
      out.push({ title: x.title, url: `https://www.youtube.com/watch?v=${id}`, img: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, channel: v.name, date: new Date(t).toISOString(), trailer: /trailer|gameplay|reveal|announce|teaser/i.test(x.title) });
    }
  });
  return out.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 80);
}

/* --------------------------------------------------------- tendenze */
const TREND_STOP = new Set("il lo la i gli le un una uno di da in con su per tra fra e ed o ma se che non è sono ecco ufficiale nuovo nuova nuovi nuove video trailer gameplay recensione offerta offerte sconto prezzo amazon giochi gioco data uscita oggi novembre dicembre ottobre gennaio annunciato disponibile the a an of to for and in on with new".split(" "));
function trends(news) {
  const since = NOW.getTime() - 30 * 3600e3; const counts = new Map();
  for (const n of news) {
    if (n.lang === "en" || Date.parse(n.date) < since) continue;
    const seen = new Set();
    const re = /\b([A-Z][\p{L}'’]+|[A-Z0-9]{2,})((?:\s+(?:[A-Z0-9][\p{L}\p{N}'’]*|\d+|of|the|di|da|e|&)){0,3})/gu;
    for (const m of n.title.matchAll(re)) {
      let ph = (m[1] + m[2]).replace(/\s+(of|the|di|da|e|&)$/i, "").trim();
      const words = ph.split(/\s+/);
      if (m.index === 0 && words.length === 1 && !/\d|^[A-Z0-9]{2,}$/.test(ph)) continue;
      if (words.every(w => TREND_STOP.has(w.toLowerCase())) || ph.length < 3 || /^\d+$/.test(ph) || /^(Il|La|Lo|Le|Gli|Un|Una|Ecco|Come|Perché|Quando|Dove|Cosa|Nuovo|Nuova|Ufficiale)$/i.test(words[0]) && words.length === 1) continue;
      const k = ph.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
      const c = counts.get(k) || { label: ph, n: 0, w: n.size || 1 }; c.n += 1; c.w += n.size || 1; counts.set(k, c);
    }
  }
  const L = [...counts.values()].filter(c => c.n >= 2).sort((a, b) => b.w - a.w || b.n - a.n);
  const outL = []; for (const c of L) { if (outL.some(o => o.label.toLowerCase().includes(c.label.toLowerCase()) || c.label.toLowerCase().includes(o.label.toLowerCase()))) continue; outL.push({ label: c.label, n: c.n }); if (outL.length >= 14) break; }
  return outL;
}

/* ------------------------------------------------------------- main */
async function copySite() {
  await fs.mkdir(OUT, { recursive: true });
  for (const f of await fs.readdir(path.join(ROOT, "site"))) await fs.copyFile(path.join(ROOT, "site", f), path.join(OUT, f));
}
async function main() {
  const t0 = Date.now(); const st = await loadState(); st.steamRel ||= {}; const health = [];
  const featured = await steamFeatured(health);
  const [news, deals, free, releases, videos] = await Promise.all([collectNews(st, health), collectDeals(featured, health, st), collectFree(health), collectReleases(featured, st, health), collectVideos(health)]);
  let handhelds = null; try { handhelds = JSON.parse(await fs.readFile(path.join(ROOT, "data/handhelds.json"), "utf8")); } catch (e) { log("handhelds.json non leggibile", e.message); }
  let events = []; try { events = JSON.parse(await fs.readFile(path.join(ROOT, "data/events-manual.json"), "utf8")); } catch {}
  events = events.filter(e => !e.end || e.end >= ymd(new Date(NOW.getTime() - 864e5)));
  const sources = CFG.feeds.map(f => ({ id: f.id, name: f.name, color: f.color, home: f.home, ...(health.find(h => h.id === f.id) || {}) }));
  const data = { generatedAt: NOW.toISOString(), tookMs: Date.now() - t0, repo: process.env.GITHUB_REPOSITORY || "", every: 5, sources, health, news, deals, free, releases, events, videos, handhelds, trends: trends(news) };
  await copySite();
  await fs.writeFile(path.join(OUT, "data.json"), JSON.stringify(data));
  await saveState(st);
  const okFeeds = sources.filter(s => s.ok).length;
  log(`notizie ${news.length} (testate ok ${okFeeds}/${sources.length}), offerte ${deals.length}, gratis ${free.length}, uscite ${releases.length}, video ${videos.length}, tendenze ${data.trends.map(t => t.label).join(", ")}, in ${Date.now() - t0} ms`);
  const perStore = {}; for (const d of deals) perStore[d.store] = (perStore[d.store] || 0) + 1;
  log("offerte per store: " + Object.entries(perStore).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + v).join(", "));
  for (const x of health) if (!x.ok && !CFG.feeds.some(f => f.id === x.id) && !/chiave non impostata/.test(x.error || "")) log(`fonte non riuscita: ${x.name} → ${x.error || "?"}`);
  if (okFeeds === 0 && !FIXTURES) { log("Nessuna testata raggiungibile: controllo i dettagli qui sotto"); for (const h of health) log(JSON.stringify(h)); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(e => { console.error(e); process.exit(1); });
}
