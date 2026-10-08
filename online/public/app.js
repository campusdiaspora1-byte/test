// Duel Hueco Mundo : interface. Le serveur (moteur d'EDOPro) décide de tout ; la page affiche le terrain et pose ses questions.
import { AMICAL, LIMIT_NAMES, deckProblems, limitOf } from "/deckrules.js";
const SUPABASE_URL = "https://wympdgzjhsrmdkcpvouw.supabase.co";
const SUPABASE_KEY = "sb_publishable_KBs-rT5siZVy4mt3rObQVQ_vLXvdaBr";

/* ---------- constantes du moteur ---------- */
const MSG = { RETRY: 1, HINT: 2, WIN: 5, SELECT_BATTLECMD: 10, SELECT_IDLECMD: 11, SELECT_EFFECTYN: 12, SELECT_YESNO: 13, SELECT_OPTION: 14, SELECT_CARD: 15, SELECT_CHAIN: 16,
  SELECT_PLACE: 18, SELECT_POSITION: 19, SELECT_TRIBUTE: 20, SORT_CHAIN: 21, SELECT_COUNTER: 22, SELECT_SUM: 23, SELECT_DISFIELD: 24, SORT_CARD: 25, SELECT_UNSELECT_CARD: 26,
  CONFIRM_CARDS: 31, SHUFFLE_DECK: 32, NEW_TURN: 40, NEW_PHASE: 41, MOVE: 50, POS_CHANGE: 53, SET: 54, SUMMONING: 60, SPSUMMONING: 62, FLIPSUMMONING: 64,
  CHAINING: 70, CHAIN_SOLVED: 73, CHAIN_NEGATED: 75, CHAIN_DISABLED: 76, DRAW: 90, DAMAGE: 91, RECOVER: 92, EQUIP: 93, CARD_TARGET: 96, PAY_LPCOST: 100, ADD_COUNTER: 101,
  REMOVE_COUNTER: 102, ATTACK: 110, BATTLE: 111, TOSS_COIN: 130, TOSS_DICE: 131, ROCK_PAPER_SCISSORS: 132, ANNOUNCE_RACE: 140, ANNOUNCE_ATTRIB: 141, ANNOUNCE_CARD: 142, ANNOUNCE_NUMBER: 143 };
const RESP = { SELECT_BATTLECMD: 0, SELECT_IDLECMD: 1, SELECT_EFFECTYN: 2, SELECT_YESNO: 3, SELECT_OPTION: 4, SELECT_CARD: 5, SELECT_UNSELECT_CARD: 7, SELECT_CHAIN: 8, SELECT_DISFIELD: 9,
  SELECT_PLACE: 10, SELECT_POSITION: 11, SELECT_TRIBUTE: 12, SELECT_COUNTER: 13, SELECT_SUM: 14, SORT_CARD: 15, ANNOUNCE_RACE: 16, ANNOUNCE_ATTRIB: 17, ANNOUNCE_CARD: 18, ANNOUNCE_NUMBER: 19, ROCK_PAPER_SCISSORS: 20 };
const LOC = { DECK: 1, HAND: 2, MZONE: 4, SZONE: 8, GRAVE: 16, REMOVED: 32, EXTRA: 64, OVERLAY: 128 };
const LOCN = { 1: "Deck", 2: "main", 4: "Zone Monstre", 8: "Zone Magie/Piège", 16: "Cimetière", 32: "bannie", 64: "Extra Deck", 128: "Matériel" };
const POS = { FUA: 1, FDA: 2, FUD: 4, FDD: 8 };
const PHASES = [[1, "Draw"], [2, "Standby"], [4, "Main 1"], [8, "Combat"], [256, "Main 2"], [512, "End"]];
const PHASE_OF = (p) => (p & (8 | 16 | 32 | 64 | 128) ? 8 : p);
const ATTRS = [[1, "TERRE"], [2, "EAU"], [4, "FEU"], [8, "VENT"], [16, "LUMIÈRE"], [32, "TÉNÈBRES"], [64, "DIVIN"]];
const RACES = ["Guerrier", "Magicien", "Elfe", "Démon", "Zombie", "Machine", "Aqua", "Pyro", "Rocher", "Bête Ailée", "Plante", "Insecte", "Tonnerre", "Dragon", "Bête",
  "Bête-Guerrier", "Dinosaure", "Poisson", "Serpent de Mer", "Reptile", "Psychique", "Bête Divine", "Dieu Créateur", "Wyrm", "Cyberse", "Illusion", "Cyborg",
  "Chevalier Magique", "Grand Dragon", "Psychique Oméga", "Guerrier Céleste", "Galaxie"];
const T = { SPELL: 0x2, TRAP: 0x4, EFFECT: 0x20, FUSION: 0x40, RITUAL: 0x80, SYNCHRO: 0x2000, TOKEN: 0x4000, XYZ: 0x800000, PEND: 0x1000000, LINK: 0x4000000, NORMAL: 0x10 };
const EXTRA_T = T.FUSION | T.SYNCHRO | T.XYZ | T.LINK;
const HM_FIRST = 711000001, HM_LAST = 711000027;

/* ---------- état ---------- */
const store = {
  get(k, d = null) { try { const v = localStorage.getItem("hm-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("hm-" + k, JSON.stringify(v)); } catch (e) {} },
};
const HM = (n) => 711000000 + n;
const DEMO = { id: "demo", name: "Hueco Mundo · démo", main: [1, 1, 1, 6, 6, 6, 4, 9, 9, 11, 11, 13, 13, 20, 20, 20, 5, 5, 5, 22, 22, 14, 16, 18, 2, 2, 2, 3, 3, 3, 7, 7, 8, 21, 23, 24, 25, 26, 26, 8].map(HM), extra: [10, 12, 15, 17, 19].map(HM) };
const S = {
  fmt: store.get("fmt", "amical"),
  name: store.get("name", ""), decks: store.get("decks", []), deckSel: store.get("deck-sel", "demo"),
  code: null, token: null, view: null, version: 0, log: [], logEnd: 0, busy: false, picks: [], focus: null, editing: null, search: "", announce: "",
  tab: "play", selCard: null, rooms: store.get("rooms", []),
  f: { cat: "all", sub: "", attr: "", race: "", lvl: "", ban: "", sort: "name" }, limit: 60,
};
const TEXT = {}, CHUNK = {};
let STR = { system: {} }, INDEX = null;
// Packs de cartes (Hueco Mundo + packs de la communauté) et version des données (pour ne pas garder d'anciens fichiers en cache)
let PACKS = [], VER = "";
const CUSTOM = new Set();
const META = fetch("/packs.json", { cache: "no-cache" }).then((r) => r.json()).then((j) => {
  VER = j.v || ""; PACKS = j.packs || [];
  for (const p of PACKS) for (const c of p.cards) CUSTOM.add(c);
  const f = featured(); if (f) [f.cover, ...f.deck.main.slice(0, 8)].forEach(text);
  render();
  return fetch(`/lflists.json?v=${VER}`).then((r) => r.json()).then((l) => { FORMATS = [AMICAL, ...l]; render(); });
}).catch(() => {});
// Decks du bot (WindBot Ignite de Project Ignis, et les Decks de démo des packs), chargés à l'ouverture du choix
let BOTS = null;
const loadBots = () => (BOTS ? Promise.resolve(BOTS) : META.then(() => fetch(`/bots.json?v=${VER}`)).then((r) => r.json()).then((b) => { BOTS = b; b.forEach((x) => text(x.cover)); render(); return b; }).catch(() => (BOTS = [])));
function viewBotPick() {
  const q = norm(S.botSearch || "").trim();
  const list = (BOTS || []).filter((b) => !q || norm(b.name).includes(q));
  const lvl = (b) => (b.source === "pack" ? "Pack" : b.difficulty == null ? "WindBot" : `WindBot · ${"★".repeat(Math.max(1, b.difficulty))}`);
  return `<div class="overlay" data-a="closebot" role="dialog" aria-modal="true" aria-label="Choisir le deck du bot"><div class="popup side-card bot-pick" data-a="noop">
    <div class="turn-heading"><strong>AFFRONTER LE BOT</strong><button class="side-ghost" data-a="closebot" aria-label="Fermer">${icon("x", 14)}</button></div>
    <p class="muted small">Le bot joue avec l'IA générique de <a href="https://github.com/ProjectIgnis/windbot" target="_blank" rel="noopener">WindBot Ignite</a> (le bot d'EDOPro). Choisis le deck qu'il utilise : ton deck « ${esc((allDecks().find((x) => x.id === S.deckSel) || DEMO).name)} » doit respecter le format ${esc(fmtOf(S.fmt).short || fmtOf(S.fmt).name)}.</p>
    <div class="search-field">${icon("search", 16)}<input id="botsearch" value="${esc(S.botSearch || "")}" placeholder="Chercher un deck (Blue-Eyes, Dark Magician…)" aria-label="Chercher un deck de bot"></div>
    <div class="bot-list">${BOTS ? list.map((b) => `<button class="bot-option" data-a="vsbot" data-id="${esc(b.id)}"><span class="thumb">${thumb(b.cover)}</span><span><strong>${esc(b.name)}</strong><small>${lvl(b)} · ${b.size} cartes</small></span>${icon("chevron", 16)}</button>`).join("") || `<p class="muted small">Aucun deck ne correspond.</p>` : `<p class="muted small">Chargement des decks…</p>`}</div>
  </div></div>`;
}
// Formats : Amical (sans liste) ou une liste officielle d'EDOPro (ProjectIgnis/LFLists)
let FORMATS = [AMICAL];
const fmtOf = (id) => FORMATS.find((f) => f.id === id) || AMICAL;
const fmtName = (f) => (f.id === "amical" ? "Amical · sans liste" : f.name);
const fmtSelect = (id, val, label) => `<select id="${id}" aria-label="${label}">${FORMATS.map((f) => `<option value="${f.id}" ${f.id === val ? "selected" : ""}>${esc(fmtName(f))}</option>`).join("")}</select>`;
const cardRule = (c) => { const t = text(c); return t ? { type: t.type, alias: t.alias || 0 } : null; };
const limitBadge = (c, f) => { const n = limitOf(c, cardRule(c), f); return n < 3 ? `<span class="lim lim-${n}" title="${n ? LIMIT_NAMES[n] : f.whitelist ? "hors liste" : "interdite"} (${esc(f.short || f.name)})">${n}</span>` : ""; };
// Problèmes du deck dans un format ; null tant que les textes des cartes ne sont pas chargés
function checkDeck(d, f) {
  const all = [...d.main, ...d.extra];
  if (all.some((c) => !text(c))) return null;
  return deckProblems(d, cardRule, f, cname);
}
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
let toastT; function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200); }

/* ---------- textes des cartes ---------- */
function text(code) {
  code = +code;
  if (!code) return null;
  if (TEXT[code]) return TEXT[code];
  const n = code % 100;
  if (!CHUNK[n]) CHUNK[n] = META.then(() => fetch(`/t/${n}.json?v=${VER}`)).then((r) => r.json()).then((ch) => {
    for (const k in ch) { const [name, desc, strs, type, level, attr, race, atk, def, ls, rs, link, en, alias] = ch[k]; TEXT[k] = { name, desc, strs, type, level, attr, race, atk, def, ls, rs, link, en, alias }; }
    render();
  }).catch(() => {});
  return null;
}
// Textes système d'EDOPro avec emplacements : %ls (texte), %d (nombre), remplis dans l'ordre
const fill = (t, args) => { let i = 0; return String(t).replace(/%ls|%d|%s/g, () => (i < args.length ? args[i++] : "")); };
const cname = (code) => (code ? (text(code) || { name: "…" }).name : "une carte face verso");
const sys = (n) => (STR.system && STR.system[n]) || `#${n}`;
function desc(d) {
  d = Number(d || 0);
  if (d < 2 ** 20) return sys(d);
  const code = Math.floor(d / 2 ** 20), i = d % 2 ** 20, t = text(code);
  return t ? (t.strs[i] || `Effet de ${t.name}`) : "…";
}
function typeLine(t) {
  if (!t) return "";
  if (t.type & T.SPELL) return "Magie" + (t.type & 0x10000 ? " Jeu-Rapide" : t.type & 0x20000 ? " Continue" : t.type & 0x40000 ? " Équipement" : t.type & 0x80000 ? " Terrain" : t.type & T.RITUAL ? " Rituelle" : " Normale");
  if (t.type & T.TRAP) return "Piège" + (t.type & 0x20000 ? " Continu" : t.type & 0x100000 ? " Contre-Piège" : " Normal");
  const race = RACES[Math.log2(t.race & -t.race)] || "";
  const kinds = [[T.FUSION, "Fusion"], [T.SYNCHRO, "Synchro"], [T.XYZ, "Xyz"], [T.LINK, "Lien"], [T.RITUAL, "Rituel"], [T.PEND, "Pendule"], [0x1000, "Syntoniseur"], [T.EFFECT, "Effet"], [T.NORMAL, "Normal"]]
    .filter(([b]) => t.type & b).map(([, n]) => n);
  const lvl = t.type & T.LINK ? `LINK-${t.level}` : `${t.type & T.XYZ ? "Rang" : "Niveau"} ${t.level}`;
  return `${t.attr} · [${[race, ...kinds].join("/")}] · ${lvl} · ATK ${t.atk < 0 ? "?" : t.atk}${t.type & T.LINK ? "" : ` / DEF ${t.def < 0 ? "?" : t.def}`}`;
}
const kindOf = (t) => (!t ? "m" : t.type & T.SPELL ? "s" : t.type & T.TRAP ? "t" : t.type & T.TOKEN ? "k" : t.type & EXTRA_T ? "x" : t.type & T.EFFECT ? "e" : "m");

/* ---------- images ---------- */
// Cartes officielles : serveur d'images d'EDOPro, puis YGOPRODeck ; sinon cadre texte
function imgUrl(code) {
  if (CUSTOM.has(+code) || (code >= HM_FIRST && code < HM_LAST)) return [`/hm/${code}.jpg${VER ? "?v=" + VER : ""}`];
  return [`https://pics.projectignis.org:2096/pics/${code}.jpg`, `https://images.ygoprodeck.com/images/cards_small/${code}.jpg`];
}
window.__imgFail = (img) => {
  const next = (img.dataset.alt || "").split("|").filter(Boolean);
  if (next.length) { img.dataset.alt = next.slice(1).join("|"); img.src = next[0]; return; }
  const t = text(img.dataset.code);
  img.outerHTML = `<div class="ttile k-${kindOf(t)}">${esc(t ? t.name : "?")}</div>`;
};
function face(code) {
  if (!code) return `<div class="back"></div>`;
  const [first, ...alt] = imgUrl(code);
  return `<img src="${first}" data-code="${code}" data-alt="${alt.join("|")}" alt="${esc(cname(code))}" loading="lazy" onerror="__imgFail(this)">`;
}
function cardHTML(c, { cls = "", key = "", stat = true, monster = false } = {}) {
  if (!c) return "";
  const down = c.pos & (POS.FDA | POS.FDD), def = monster && c.pos & (POS.FUD | POS.FDD); // seuls les monstres se tournent en Défense
  const k = ["card", def ? "def" : "", down && c.code ? "down" : "", cls].filter(Boolean).join(" ");
  const st = stat && c.atk != null && !down ? `<span class="stat">${c.link ? `${c.atk}` : def ? c.def : c.atk}</span>` : "";
  const mats = c.mats && c.mats.length ? `<span class="badge" title="Matériels">${c.mats.length}</span>` : "";
  const counters = c.counters && c.counters.length ? `<span class="badge" style="bottom:auto;top:2px" title="Compteurs">●${c.counters.reduce((a, x) => a + (x.count || 0), 0)}</span>` : "";
  return `<div class="${k}" ${key ? `data-key="${key}"` : ""} tabindex="0">${face(down && !c.code ? 0 : c.code)}${st}${mats}${counters}</div>`;
}

/* ---------- réseau ---------- */
async function api(body) {
  const r = await fetch("/api/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: "Réponse illisible du serveur." }));
  if (!r.ok) throw new Error(j.error || "Erreur " + r.status);
  return j;
}
let pollT = null, channel = null, sb = null, fetching = false, again = false;
async function refresh(force = false) {
  if (!S.code) return;
  if (fetching) { again = true; return; }
  fetching = true;
  try {
    const q = new URLSearchParams({ code: S.code, token: S.token || "", from: S.logEnd, v: force ? 0 : S.version });
    const r = await fetch("/api/room?" + q);
    const j = await r.json();
    if (!r.ok) { if (r.status === 404) { toast(j.error); leave(); } return; }
    if (j.same) return;
    applyView(j);
  } catch (e) { /* réseau : on réessaiera */ } finally {
    fetching = false;
    if (again) { again = false; refresh(); }
  }
}
function applyView(j) {
  {
    const prevStatus = S.view && S.view.status;
    const prevLast = S.log.length ? S.log[S.log.length - 1].i : -1, animate = !!(S.view && S.view.duel), before = animate ? snapRects() : null;
    if (j.duel) {
      if (j.duel.log.length && j.duel.log[0].i < S.logEnd) S.log = []; // nouvelle partie
      if (prevStatus !== "duel" && j.status === "duel" && S.logEnd > j.duel.logEnd) S.log = [];
      S.log.push(...j.duel.log.filter((e) => !S.log.length || e.i > S.log[S.log.length - 1].i));
      S.logEnd = j.duel.logEnd;
    } else { S.log = []; S.logEnd = 0; }
    if (j.duel && S.view && S.view.duel && JSON.stringify(j.duel.prompt) !== JSON.stringify(S.view.duel.prompt)) { S.picks = []; S.focus = null; S.mini = false; }
    S.view = j; S.version = j.version;
    render();
    if (animate && j.duel) playAnims(S.log.filter((e) => e.i > prevLast), before);
    autoAnswer();
  }
}
function listen() {
  clearInterval(pollT);
  pollT = setInterval(() => refresh(), 4000); // filet de sécurité si le temps réel décroche
  try {
    sb ||= window.supabase && window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    if (channel) sb.removeChannel(channel);
    if (sb) channel = sb.channel("room-" + S.code).on("postgres_changes", { event: "*", schema: "public", table: "room_pings", filter: `code=eq.${S.code}` }, () => refresh()).subscribe();
  } catch (e) {}
}
function enter(code, token) {
  S.code = code; S.token = token; S.view = null; S.version = 0; S.log = []; S.logEnd = 0; S.picks = []; S.focus = null;
  S.rooms = [{ code, at: Date.now() }, ...S.rooms.filter((r) => r.code !== code)].slice(0, 12); store.set("rooms", S.rooms);
  history.replaceState(null, "", "/?salle=" + code);
  listen(); refresh(true); render();
}
function leave() {
  S.code = null; S.token = null; S.view = null; clearInterval(pollT);
  if (channel && sb) sb.removeChannel(channel);
  channel = null; history.replaceState(null, "", "/"); render();
}
async function send(response) {
  if (S.busy) return;
  S.busy = true; S.focus = null; render(); // la fenêtre se ferme tout de suite : « Le moteur résout… »
  try {
    const r = await api({ action: "respond", code: S.code, token: S.token, response, from: S.logEnd });
    S.picks = [];
    S.busy = false;
    if (r.view) applyView(r.view); else await refresh();
  } catch (e) { toast(e.message); }
  finally { S.busy = false; render(); }
}
// Questions sans intérêt : rien à chaîner, on passe tout de suite
function autoAnswer() {
  const p = S.view && S.view.duel && S.view.duel.prompt;
  if (!p || S.busy) return;
  if (p.type === MSG.SELECT_CHAIN && !p.selects.length && !p.forced) send({ type: RESP.SELECT_CHAIN, index: null });
}

/* ---------- decks ---------- */
// Pack en vedette : le plus récent publié il y a moins de 14 jours ; sinon l'accueil reste sur Hueco Mundo
const FEATURE_DAYS = 14;
function featured() {
  const now = Date.now(), t = (p) => Date.parse(p.published);
  return PACKS.filter((p) => !p.home && p.published && now >= t(p) && now - t(p) < FEATURE_DAYS * 864e5).sort((a, b) => t(b) - t(a))[0] || null;
}
const featureEnd = (p) => new Date(Date.parse(p.published) + FEATURE_DAYS * 864e5).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
const packDeck = (p) => (p.deck && p.deck.main.length >= 40 ? { id: "pack:" + p.slug, name: p.name + " · démo", main: p.deck.main, extra: p.deck.extra } : null);
const isDemo = (d) => d.id === "demo" || String(d.id).startsWith("pack:");
function allDecks() {
  const f = featured(), community = PACKS.filter((p) => !p.home).sort((a, b) => (b === f) - (a === f));
  return [DEMO, ...community.map(packDeck).filter(Boolean), ...S.decks];
}
const saveDecks = () => store.set("decks", S.decks);
function parseYdk(txt) {
  const main = [], extra = []; let part = null;
  for (const raw of txt.split(/\r?\n/)) {
    const l = raw.trim();
    if (l === "#main") part = main; else if (l === "#extra") part = extra; else if (l === "!side") part = null;
    else if (/^\d+$/.test(l) && part) part.push(+l);
  }
  return { main, extra };
}
function deckCounts(d) {
  const c = {}; for (const x of [...d.main, ...d.extra]) c[x] = (c[x] || 0) + 1;
  return c;
}
async function loadIndex() {
  if (INDEX) return INDEX;
  await META;
  INDEX = (await (await fetch(`/index-cards.json?v=${VER}`)).json()).map(([code, name, en, k, type, level, attr, race, atk, def]) => ({ code, name, en, k, type, level, attr, race, atk, def, key: norm(name + " " + en) }));
  return INDEX;
}
const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* ---------- icônes (design Figma) ---------- */
const ICONS = {
  cards: `<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h3M4 6H3a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h9"/>`,
  chevron: `<path d="m9 18 6-6-6-6"/>`,
  copy: `<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>`,
  edit: `<path d="m4 20 4.3-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14 7 3 3"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  search: `<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>`,
  shield: `<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/>`,
  spark: `<path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z"/>`,
  swords: `<path d="m14.5 5.5 4-3 3 3-3 4M13 7l4 4M8 16l-4.5 4.5M3 14l7 7M9.5 5.5l-4-3-3 3 3 4M11 7l-8 8M16 16l4.5 4.5M21 14l-7 7"/>`,
  users: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>`,
  x: `<path d="m6 6 12 12M18 6 6 18"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
};
const icon = (n, size = 20) => `<svg aria-hidden="true" class="icon" width="${size}" height="${size}" viewBox="0 0 24 24">${ICONS[n]}</svg>`;
const initials = (n) => (String(n || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "?").toUpperCase();
const logo = () => `<div class="brand"><div class="brand-symbol">${icon("swords", 25)}</div><div><div class="brand-name">YOUR OWN <span>DUEL</span></div><div class="brand-tagline">BUILD · CHALLENGE · CONQUER</div></div></div>`;
const thumb = (code, cls = "") => `<div class="card ${cls}">${face(code)}</div>`;

/* ---------- rendu ---------- */
function render() {
  const app = $("#app");
  const focus = document.activeElement && document.activeElement.id, val = focus && document.activeElement.value, selStart = focus && document.activeElement.selectionStart;
  let html;
  if (S.code && S.view && S.view.status !== "lobby") html = viewDuel();
  else html = `<main class="app-shell"><div class="ambient-grid"></div>${topbar()}${S.code ? (S.view ? viewPrep() : `<div class="prep"><div class="loader-content">${emblem()}<div class="loader-title">CONNEXION…</div><p>Salle ${esc(S.code)}</p></div></div>`) : S.tab === "decks" ? viewDecks() : S.tab === "rooms" ? viewRooms() : viewPlay()}${S.botPick && !S.code ? viewBotPick() : ""}</main>`;
  app.innerHTML = html;
  if (focus) { const f = document.getElementById(focus); if (f) { f.focus(); if (val != null && f.value !== val) f.value = val; try { f.setSelectionRange(selStart, selStart); } catch (e) {} } }
  const lg = $("#log"); if (lg) lg.scrollTop = lg.scrollHeight;
}

function topbar() {
  const tab = (id, ic, label) => `<button class="${!S.code && S.tab === id ? "active" : ""}" data-a="tab" data-t="${id}">${icon(ic, 17)}${label}</button>`;
  return `<nav class="topbar" aria-label="Navigation principale">${logo()}
    <div class="main-nav">${tab("play", "swords", "Jouer")}${tab("decks", "cards", "Mes decks")}${tab("rooms", "users", "Salles")}</div>
    <div class="user-area">${installButton()}<div class="online-dot"></div><div><strong>${esc(S.name || "Sans pseudo")}</strong><small>${S.name ? "Duelliste" : "Choisis un pseudo"}</small></div><div class="avatar">${esc(initials(S.name))}</div></div></nav>`;
}
const emblem = () => `<div class="loader-emblem"><div class="loader-ring"></div><div class="loader-ring second"></div>${icon("swords", 42)}</div>`;

/* ---------- accueil ---------- */
function deckStats(d) {
  let m = 0, s = 0, t = 0;
  for (const c of d.main) { const x = text(c); if (!x) continue; if (x.type & T.SPELL) s++; else if (x.type & T.TRAP) t++; else m++; }
  return { m, s, t };
}
function viewPlay() {
  const d = allDecks().find((x) => x.id === S.deckSel) || DEMO, st = deckStats(d);
  const preview = [...new Set(d.main)].slice(0, 4);
  const fp = featured(), duo = fp ? [fp.cover, fp.cards.find((c) => c !== fp.cover && fp.deck.main.includes(c)) || fp.cards.find((c) => c !== fp.cover) || fp.cover] : [HM(1), HM(9)];
  const spotlight = fp ? `<div class="spotlight">
        <div class="spotlight-tag">${icon("spark", 13)} PACK À L'HONNEUR</div>
        <strong>${esc(fp.name)}</strong>
        <small>${fp.author ? `par ${esc(fp.author)} · ` : ""}${fp.cards.length} cartes · en vedette jusqu'au ${featureEnd(fp)}</small>
        ${fp.description ? `<p>${esc(fp.description)}</p>` : ""}
        ${packDeck(fp) ? `<button class="secondary-action" data-a="trydeck" data-id="pack:${esc(fp.slug)}">${icon("cards", 17)}Jouer avec ce deck</button>` : ""}
      </div>` : "";
  return `<section class="page play-page">
    <div class="hero-copy">
      <div class="eyebrow"><span></span> ARÈNE 1 CONTRE 1</div>
      <div class="hero-title">TON DECK.<br><em>TES RÈGLES.</em><br>TON DUEL.</div>
      <p>Crée une salle privée, invite ton adversaire avec un code et prouve que ta stratégie mérite la victoire. Le moteur d'EDOPro applique toutes les règles et tous les effets.</p>
      <div class="hero-actions">
        <button class="primary-action" data-a="create">${icon("plus")}Créer une salle${icon("chevron", 17)}</button>
        <button class="secondary-action" data-a="tab" data-t="rooms">${icon("users")}Rejoindre une salle</button>
        <button class="secondary-action" data-a="botpick">${icon("shield")}Affronter le bot</button>
      </div>
      ${spotlight}
      <div class="facts"><i></i><strong>14 872</strong> cartes officielles · ${fp ? `nouveau pack <strong>${esc(fp.name)}</strong>` : "archétype <strong>Hueco Mundo</strong>"}</div>
    </div>
    <div class="duel-stage" aria-hidden="true">
      <div class="stage-ring"></div><div class="stage-ring ring-two"></div>
      <div class="versus-card left-card">${thumb(duo[0])}</div>
      <div class="versus-mark"><small>PRÊT POUR</small><strong>VS</strong><span>LE DUEL</span></div>
      <div class="versus-card right-card">${thumb(duo[1])}</div>
    </div>
    <div class="quick-panel">
      <div class="panel-heading"><div><small>Deck actif</small><strong>${esc(d.name)}</strong></div><button class="icon-button" aria-label="Modifier le deck" data-a="tab" data-t="decks">${icon("edit", 17)}</button></div>
      <div class="deck-preview">${preview.map((c, i) => `<div class="mini-stack" style="transform:translateX(${i * -8}px)">${thumb(c)}</div>`).join("")}</div>
      <div class="deck-stats"><span><strong>${d.main.length}</strong> cartes</span><span><strong>${st.m}</strong> monstres</span><span><strong>${st.s}</strong> magies</span><span><strong>${st.t}</strong> pièges</span><span><strong>${d.extra.length}</strong> extra</span></div>
      <label class="field">Ton pseudo<input id="pname" maxlength="24" value="${esc(S.name)}" placeholder="ex. Ichigo"></label>
      <label class="field">Format de la salle${fmtSelect("fmt", S.fmt, "Format de la salle")}</label>
      <button class="launch-action" data-a="create"><span>${icon("swords")}</span><div><small>PARTIE PRIVÉE</small><strong>CRÉER UNE SALLE</strong></div>${icon("chevron")}</button>
      <button class="launch-action bot-launch" data-a="botpick"><span>${icon("shield")}</span><div><small>ENTRAÎNEMENT</small><strong>DUEL CONTRE LE BOT</strong></div>${icon("chevron")}</button>
    </div>
  </section>${footer()}`;
}
const footer = () => `<p class="foot">Moteur de règles : <a href="https://github.com/edo9300/ygopro-core" target="_blank" rel="noopener">ocgcore (EDOPro)</a> · scripts des cartes : <a href="https://github.com/ProjectIgnis/CardScripts" target="_blank" rel="noopener">Project Ignis</a> · <a href="https://github.com/martinshiroe/test/tree/claude/new-session-u2ibpp/online" target="_blank" rel="noopener">code source du site</a> (AGPL-3.0) · <a href="https://github.com/martinshiroe/test/tree/claude/new-session-u2ibpp/online/packs#readme" target="_blank" rel="noopener">proposer ses cartes</a>. Yu-Gi-Oh! © Kazuki Takahashi, Konami. Site amateur, sans but commercial.</p>`;

/* ---------- decks ---------- */
function ensureEditing() {
  if (S.editing) return S.editing;
  const d = allDecks().find((x) => x.id === S.deckSel) || DEMO;
  S.editing = JSON.parse(JSON.stringify(d));
  if (isDemo(d)) { S.editing.id = "new"; S.editing.name = d.name; S.editing.fromDemo = true; }
  [...S.editing.main, ...S.editing.extra].forEach(text);
  loadIndex().then(render);
  return S.editing;
}
// Filtres de la collection
const SUBS = {
  m: [["", "Tous les monstres"], ["0x20", "Effet"], ["0x10", "Normal"], ["0x80", "Rituel"], ["0x1000000", "Pendule"], ["0x1000", "Syntoniseur"], ["0x200000", "Flip"]],
  x: [["", "Tout l'Extra Deck"], ["0x40", "Fusion"], ["0x2000", "Synchro"], ["0x800000", "Xyz"], ["0x4000000", "Lien"]],
  s: [["", "Toutes les magies"], ["n", "Normale"], ["0x10000", "Jeu-Rapide"], ["0x20000", "Continue"], ["0x40000", "Équipement"], ["0x80000", "Terrain"], ["0x80", "Rituelle"]],
  t: [["", "Tous les pièges"], ["n", "Normal"], ["0x20000", "Continu"], ["0x100000", "Contre-Piège"]],
};
const SORTS = [["name", "Nom (A → Z)"], ["atk-", "ATK (forte → faible)"], ["atk+", "ATK (faible → forte)"], ["def-", "DEF (forte → faible)"], ["lvl-", "Niveau / Rang (haut → bas)"], ["lvl+", "Niveau / Rang (bas → haut)"]];
const isMonster = (c) => c.k === "m" || c.k === "x";
function filteredCards() {
  if (!INDEX) return null;
  const f = S.f, q = norm(S.search.trim()), sub = f.sub ? (f.sub === "n" ? "n" : parseInt(f.sub, 16)) : 0;
  const SUB_FLAGS = 0x10000 | 0x20000 | 0x40000 | 0x80000 | 0x80 | 0x100000;
  const pk = f.cat.startsWith("pack:") && PACKS.find((p) => "pack:" + p.slug === f.cat), pack = f.cat.startsWith("pack:") ? new Set(pk ? pk.cards : []) : null;
  const fl = fmtOf(S.fmt);
  let list = INDEX.filter((c) => {
    if (q.length > 1 && !c.key.includes(q)) return false;
    if (f.cat === "hm") { if (c.code < HM_FIRST || c.code >= HM_LAST) return false; }
    else if (pack) { if (!pack.has(c.code)) return false; }
    else if (!pack && f.cat !== "all" && c.k !== f.cat) return false;
    if (sub === "n" && c.type & SUB_FLAGS) return false;
    if (sub && sub !== "n" && !(c.type & sub)) return false;
    if (f.attr && c.attr !== +f.attr) return false;
    if (f.race !== "" && c.race !== +f.race) return false;
    if (f.lvl && (!isMonster(c) || c.level !== +f.lvl)) return false;
    if (f.ban !== "" && f.ban != null && limitOf(c.code, null, fl) !== +f.ban) return false;
    return true;
  });
  const [key, dir] = [f.sort.replace(/[+-]$/, ""), f.sort.endsWith("+") ? 1 : -1];
  if (key !== "name") list = list.filter(isMonster).sort((a, b) => dir * ((key === "atk" ? a.atk - b.atk : key === "def" ? a.def - b.def : a.level - b.level)) || a.name.localeCompare(b.name, "fr"));
  return list;
}
function filterBar() {
  const f = S.f, sel = (id, opts, val, label) => `<select id="${id}" aria-label="${label}">${opts.map(([v, n]) => `<option value="${v}" ${String(val) === String(v) ? "selected" : ""}>${n}</option>`).join("")}</select>`;
  const cats = [["all", "Toutes les cartes"], ["m", "Monstres"], ["x", "Extra Deck"], ["s", "Magies"], ["t", "Pièges"], ["hm", "Hueco Mundo"], ...PACKS.filter((p) => !p.home).map((p) => ["pack:" + p.slug, "Pack · " + p.name])];
  const mon = f.cat === "m" || f.cat === "x" || f.cat === "all" || f.cat === "hm" || f.cat.startsWith("pack:");
  return `<div class="filters">${sel("f-cat", cats, f.cat, "Catégorie")}
    ${SUBS[f.cat] ? sel("f-sub", SUBS[f.cat], f.sub, "Sous-type") : ""}
    ${mon ? sel("f-attr", [["", "Tous les attributs"], ...ATTRS.map(([b, n]) => [b, n])], f.attr, "Attribut") : ""}
    ${mon ? sel("f-race", [["", "Tous les types"], ...RACES.slice(0, 26).map((n, i) => [i, n])], f.race, "Type de monstre") : ""}
    ${mon ? sel("f-lvl", [["", "Tous les niveaux"], ...Array.from({ length: 13 }, (_, i) => [i + 1, `Niveau / Rang ${i + 1}`])], f.lvl, "Niveau") : ""}
    ${S.fmt !== "amical" ? sel("f-ban", [["", "Tous les statuts"], ["0", fmtOf(S.fmt).whitelist ? "Non permises" : "Interdites"], ["1", "Limitées (1)"], ["2", "Semi-limitées (2)"], ["3", "Libres (3)"]], f.ban ?? "", "Statut dans le format") : ""}
    ${sel("f-sort", SORTS, f.sort, "Tri")}
    ${f.cat !== "all" || f.sub || f.attr || f.race !== "" || f.lvl || f.ban || f.sort !== "name" || S.search ? `<button class="ghost-action" data-a="resetfilters">Effacer les filtres</button>` : ""}</div>`;
}
function viewDecks() {
  const d = ensureEditing(), counts = deckCounts(d);
  const fmt = fmtOf(S.fmt), problems = checkDeck(d, fmt);
  const all = filteredCards(), results = all ? all.slice(0, S.limit).map((c) => c.code) : [];
  const sel = S.selCard || results[0], st = text(sel), stats = deckStats(d);
  const row = (code, part) => { const t = text(code); return `<div class="deck-list-row"><div class="thumb">${thumb(code)}${limitBadge(code, fmt)}</div><div><strong>${esc(t ? t.name : code)}</strong><small>${esc(t ? typeLine(t).split(" · ").slice(0, 2).join(" · ") : "")}</small></div><span>×${counts[code]}</span><button aria-label="Retirer ${esc(t ? t.name : "")}" data-a="rmcard" data-c="${code}" data-p="${part}">${icon("x", 14)}</button></div>`; };
  const uniq = (a) => [...new Set(a)];
  return `<section class="page">
    <header class="section-heading"><div><div class="eyebrow"><span></span> ATELIER DU DUELLISTE</div><div class="section-title">ÉDITEUR DE DECK</div><p>Construis ta stratégie : toutes les cartes officielles, l'archétype Hueco Mundo et les packs de la communauté.</p></div></header>
    <div class="deck-workspace">
      <aside class="deck-sidebar">
        <div class="sidebar-label">MES DECKS <span>${allDecks().length}</span></div>
        ${allDecks().map((x) => `<button class="deck-option ${x.id === S.deckSel ? "selected" : ""}" data-a="pickdeck" data-id="${esc(x.id)}"><span class="deck-option-icon">${icon("cards")}</span><span><strong>${esc(x.name)}</strong><small>${x.main.length} + ${x.extra.length} cartes${isDemo(x) ? " · démo" : ""}</small></span></button>`).join("")}
        <button class="new-deck" data-a="newdeck">${icon("plus", 17)}NOUVEAU DECK</button>
        <details class="import-box"><summary>Importer un .ydk</summary><input type="file" id="ydk" accept=".ydk,text/plain" aria-label="Fichier .ydk"><textarea id="ydktxt" placeholder="ou colle le contenu du .ydk ici"></textarea><button class="ghost-action" data-a="pasteydk">Importer le texte</button></details>
        <div class="deck-rules">${icon("shield", 18)}<div><strong>FORMAT</strong>${fmtSelect("fmtpick", S.fmt, "Format")}<span>40 à 60 cartes · Extra Deck 15 max · 3 exemplaires max${fmt.id === "amical" ? " · sans liste de bannissement" : fmt.whitelist ? ` · seulement les ${Object.keys(fmt.cards).length} cartes de la liste` : ` · liste ${esc(fmt.name)} : ${Object.values(fmt.cards).filter((n) => n === 0).length} interdites, ${Object.values(fmt.cards).filter((n) => n === 1).length} limitées, ${Object.values(fmt.cards).filter((n) => n === 2).length} semi-limitées`}</span></div></div>
      </aside>
      <div class="collection-panel">
        <div class="collection-toolbar"><div class="search-field">${icon("search", 18)}<input id="dsearch" value="${esc(S.search)}" placeholder="Rechercher une carte (français ou anglais)…" aria-label="Rechercher une carte"></div>
          <span class="collection-count">${all ? `${all.length.toLocaleString("fr-FR")} CARTES` : "CHARGEMENT…"}</span></div>
        ${filterBar()}
        <div class="card-grid">${results.map((c) => `<button class="collection-card ${sel === c ? "selected" : ""}" data-a="addcard" data-c="${c}" aria-label="Ajouter ${esc(cname(c))}">${thumb(c)}${limitBadge(c, fmt)}${counts[c] ? `<span class="owned">×${counts[c]}</span>` : ""}<span class="add-card">${icon("plus", 14)}</span></button>`).join("") || `<p class="muted">${all ? "Aucune carte ne correspond à ces filtres." : "Chargement des 14 000 cartes…"}</p>`}</div>
        ${all && all.length > S.limit ? `<button class="ghost-action more" data-a="more">Afficher plus (${(all.length - S.limit).toLocaleString("fr-FR")} restantes)</button>` : ""}
        <div class="card-detail"><div class="detail-accent"></div><div><small class="label">Carte sélectionnée</small><strong>${esc(cname(sel))}</strong><span>${esc(typeLine(st))}</span><p>${esc(st ? st.desc : "")}</p></div></div>
      </div>
      <aside class="current-deck">
        <div class="current-deck-head"><input id="dname" maxlength="40" value="${esc(d.name)}" aria-label="Nom du deck">
          <div class="meter-line"><small class="label">Deck principal</small><strong>${d.main.length} <span>/ 40</span></strong></div>
          <div class="deck-meter"><i class="${d.main.length > 60 ? "over" : ""}" style="width:${Math.min(100, (d.main.length / 40) * 100)}%"></i></div></div>
        <div class="deck-card-list">${uniq(d.main).map((c) => row(c, "main")).join("") || `<p class="muted small">Clique sur une carte pour l'ajouter.</p>`}
          ${d.extra.length ? `<div class="list-title">EXTRA DECK (${d.extra.length})</div>${uniq(d.extra).map((c) => row(c, "extra")).join("")}` : ""}</div>
        <div class="problems">${!problems ? `<div class="muted small">Vérification…</div>` : problems.length ? problems.map((p) => `<div class="bad">✗ ${esc(p)}</div>`).join("") : `<div class="ok">✓ Deck valide en format ${esc(fmt.short || fmt.name)}</div>`}</div>
        <div class="deck-summary"><div><span>Monstres</span><strong>${stats.m}</strong></div><div><span>Magies</span><strong>${stats.s}</strong></div><div><span>Pièges</span><strong>${stats.t}</strong></div><div><span>Extra</span><strong>${d.extra.length}</strong></div></div>
        <button class="save-button" data-a="savedeck">${d.fromDemo ? "ENREGISTRER UNE COPIE" : "SAUVEGARDER LE DECK"}</button>
        ${d.id !== "new" ? `<button class="ghost-action danger-action" data-a="deldeck">${S.armed === "del" ? "Confirmer la suppression ?" : "Supprimer ce deck"}</button>` : ""}
      </aside>
    </div></section>`;
}

/* ---------- salles ---------- */
function viewRooms() {
  return `<section class="page">
    <header class="section-heading"><div><div class="eyebrow"><span></span> SALLES PRIVÉES</div><div class="section-title">CHOISIS TON ADVERSAIRE</div><p>Crée une salle et envoie son code, ou rejoins celle d'un ami.</p></div>
      <button class="primary-action" data-a="create">${icon("plus")}Créer une salle</button></header>
    <div class="room-layout">
      <div class="join-card"><div class="join-icon">${icon("users", 28)}</div><small>REJOINDRE PAR CODE</small><strong>Tu as reçu une invitation ?</strong><p>Saisis le code à 5 caractères de la salle de ton adversaire.</p>
        <label class="field" style="text-align:left">Ton pseudo<input id="pname" maxlength="24" value="${esc(S.name)}" placeholder="ex. Ulquiorra"></label>
        <form class="code-entry" data-a="joinform"><input id="jcode" maxlength="5" placeholder="CODE" aria-label="Code de salle" autocomplete="off"><button aria-label="Rejoindre">${icon("chevron")}</button></form></div>
      <div class="room-browser"><div class="browser-head"><div><small class="label">Sur cet appareil</small><strong>Mes salles récentes</strong></div></div>
        ${S.rooms.length ? S.rooms.map((r) => `<div class="room-row"><span class="host"><i>${esc(r.code.slice(0, 2))}</i><b>${esc(r.code)}</b><small>${new Date(r.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</small></span><span>${store.get("room-" + r.code) ? "Ta place est gardée" : "Spectateur"}</span><button class="join-room" data-a="reopen" data-c="${esc(r.code)}">REVENIR</button></div>`).join("")
          : `<div class="empty-rooms">Aucune salle pour l'instant. Crée la première, ou entre le code qu'un ami t'a envoyé.</div>`}
      </div>
    </div></section>${footer()}`;
}

/* ---------- préparation ---------- */
function viewPrep() {
  const v = S.view, me = v.seat, link = location.origin + "/?salle=" + v.code;
  const pl = (s) => { const p = v.players[s]; return p ? `<b>${esc(initials(p.name))}</b><div><span>${esc(p.name)}${s === me ? " (toi)" : ""}</span><em class="${p.ready ? "ready" : ""}">${p.ready ? "PRÊT · " + esc(p.deckName || "deck") : "CHOIX DU DECK"}</em></div>` : `<b>?</b><div><span>Adversaire</span><em>EN ATTENTE</em></div>`; };
  const d = allDecks().find((x) => x.id === S.deckSel) || DEMO;
  return `<section class="prep"><div class="loader-content">
    ${emblem()}<div class="loader-title">PRÉPARATION DU DUEL</div>
    <p>${v.players.B && v.players.B.bot ? `Duel contre le bot <strong>${esc(v.players.B.name)}</strong> : valide ton deck pour commencer.` : v.players.B ? "Les deux duellistes sont là : validez vos decks." : "Envoie ce code ou le lien à ton adversaire."}</p>
    <div class="room-code">${esc(v.code)}</div>
    <div class="players-loading"><span>${pl("A")}</span><strong>VS</strong><span>${pl("B")}</span></div>
    <div class="prep-box">
      <div class="field">Format${me === "A" && v.status === "lobby" ? fmtSelect("roomfmt", v.format ? v.format.id : "amical", "Format de la salle") : `<div class="fmt-tag">${esc(v.format ? (v.format.id === "amical" ? fmtName(AMICAL) : v.format.name) : fmtName(AMICAL))}</div>`}</div>
      ${v.players.B && v.players.B.bot ? "" : `<div class="field">Lien d'invitation<div class="row"><input id="rlink" readonly value="${esc(link)}"><button class="ghost-action" data-a="copylink">${icon("copy", 15)}Copier</button></div></div>`}
      ${me ? (v.players[me].ready ? `<p class="muted small" style="margin:0">Ton deck est validé. Le duel commence dès que ton adversaire a validé le sien.</p>`
        : `<div class="field">Ton deck<div class="row"><select id="deckpick" aria-label="Deck">${allDecks().map((x) => `<option value="${esc(x.id)}" ${x.id === d.id ? "selected" : ""}>${esc(x.name)} (${x.main.length} + ${x.extra.length})</option>`).join("")}</select><button class="primary-action" data-a="ready">Valider</button></div></div>`)
        : !v.players.B ? `<label class="field">Ton pseudo<input id="pname" maxlength="24" value="${esc(S.name)}"></label><button class="primary-action" data-a="joinhere">Prendre la place</button>` : `<p class="muted small" style="margin:0">La salle est complète : tu la regardes en spectateur.</p>`}
    </div>
    <button class="cancel-load" data-a="leave">QUITTER LA SALLE</button>
  </div></section>`;
}

/* ---------- duel ---------- */
const key = (c, l, s) => `${c}:${l}:${s}`;
function actionsMap(p) {
  const A = {};
  const add = (c, label, resp) => { const k = key(c.controller, c.location, c.sequence); (A[k] ||= []).push({ label, resp }); };
  if (p.type === MSG.SELECT_IDLECMD) {
    p.summons.forEach((c, i) => add(c, "Invocation Normale", { type: RESP.SELECT_IDLECMD, action: 0, index: i }));
    p.special_summons.forEach((c, i) => add(c, "Invocation Spéciale", { type: RESP.SELECT_IDLECMD, action: 1, index: i }));
    p.pos_changes.forEach((c, i) => add(c, "Changer de position", { type: RESP.SELECT_IDLECMD, action: 2, index: i }));
    p.monster_sets.forEach((c, i) => add(c, "Poser", { type: RESP.SELECT_IDLECMD, action: 3, index: i }));
    p.spell_sets.forEach((c, i) => add(c, "Poser", { type: RESP.SELECT_IDLECMD, action: 4, index: i }));
    p.activates.forEach((c, i) => add(c, "Activer : " + desc(c.description), { type: RESP.SELECT_IDLECMD, action: 5, index: i }));
  }
  if (p.type === MSG.SELECT_BATTLECMD) {
    p.chains.forEach((c, i) => add(c, "Activer : " + desc(c.description), { type: RESP.SELECT_BATTLECMD, action: 0, index: i }));
    p.attacks.forEach((c, i) => add(c, c.can_direct ? "Attaquer (directement si possible)" : "Attaquer", { type: RESP.SELECT_BATTLECMD, action: 1, index: i }));
  }
  return A;
}
// Zones libres d'une question SELECT_PLACE : bit à 1 = zone interdite
function placeList(p) {
  const out = [];
  for (const [base, l, n, rel] of [[0, LOC.MZONE, 7, 0], [8, LOC.SZONE, 8, 0], [16, LOC.MZONE, 7, 1], [24, LOC.SZONE, 8, 1]])
    for (let i = 0; i < n; i++) if (!(p.field_mask & (1 << (base + i)))) out.push({ player: rel ? 1 - p.player : p.player, location: l, sequence: i });
  return out;
}

function viewDuel() {
  const v = S.view, d = v.duel, me = v.team === 1 ? 1 : 0, op = 1 - me, F = d.field;
  const p = d.prompt, acts = p ? actionsMap(p) : {};
  const places = p && (p.type === MSG.SELECT_PLACE || p.type === MSG.SELECT_DISFIELD) ? placeList(p) : [];
  const seatOfTeam = (t) => Object.keys(v.teams).find((s) => v.teams[s] === t);
  const pname = (t) => { const s = seatOfTeam(t); return (v.players[s] && v.players[s].name) || (t ? "Joueur 2" : "Joueur 1"); };

  const zone = (ctrl, l, s, extra = "") => {
    const c = l === LOC.MZONE ? F[ctrl].m[s] : F[ctrl].s[s];
    const k = key(ctrl, l, s), isPlace = places.some((x) => x.player === ctrl && x.location === l && x.sequence === s);
    const picked = S.picks.some((x) => x.player === ctrl && x.location === l && x.sequence === s);
    const lbl = l === LOC.MZONE ? (s >= 5 ? "Zone Monstre Extra" : "Monstre") : s === 5 ? "Terrain" : s === 0 || s === 4 ? "Mag/Piège · Pendule" : "Mag / Piège";
    const pend = l === LOC.SZONE && (s === 0 || s === 4) ? ((s === 0) === (ctrl === me) ? "blue" : "red") : "";
    return `<div class="board-zone ${extra} ${pend} ${isPlace ? "place" : ""} ${picked ? "picked" : ""}" data-a="cell" data-k="${k}" tabindex="0" aria-label="${esc(c && c.code ? cname(c.code) : lbl)}">${c ? cardHTML(c, { cls: acts[k] ? "act" : S.focus === k ? "sel" : "", key: k, monster: l === LOC.MZONE }) : `<span class="zone-mark">${lbl}</span>`}${pend ? `<span class="pendulum-gem"><i></i></span>` : ""}</div>`;
  };
  const pile = (ctrl, what) => {
    const f = F[ctrl];
    const n = what === "deck" ? f.deck : what === "extra" ? f.extraCount : f[what].filter(Boolean).length;
    const top = what === "gy" || what === "ban" ? f[what].filter(Boolean).slice(-1)[0] : null;
    const lc = { gy: LOC.GRAVE, ban: LOC.REMOVED, extra: LOC.EXTRA, deck: LOC.DECK }[what];
    const anyAct = Object.keys(acts).some((k) => k.startsWith(`${ctrl}:${lc}:`));
    const label = { deck: "Deck", extra: "Extra Deck", gy: "Cimetière", ban: "Bannies" }[what];
    return `<div class="board-zone ${what === "ban" ? "emz" : ""}" data-a="pile" data-c="${ctrl}" data-w="${what}" tabindex="0" aria-label="${label} : ${n}">${n ? `<div class="card ${anyAct ? "act" : ""}">${top ? face(top.code) : `<div class="back"></div>`}</div><span class="zone-count">${n}</span>` : `<span class="zone-mark">${label}</span>`}</div>`;
  };
  const sRow = (ctrl, flip) => { const idx = flip ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4]; const r = [pile(ctrl, "extra"), ...idx.map((i) => zone(ctrl, LOC.SZONE, i)), pile(ctrl, "deck")]; return (flip ? r.reverse() : r).join(""); };
  const mRow = (ctrl, flip) => { const idx = flip ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4]; const r = [zone(ctrl, LOC.SZONE, 5), ...idx.map((i) => zone(ctrl, LOC.MZONE, i)), pile(ctrl, "gy")]; return (flip ? r.reverse() : r).join(""); };
  const emz = (side) => { const mine = side === 0 ? 5 : 6, theirs = side === 0 ? 6 : 5; return F[op].m[theirs] ? zone(op, LOC.MZONE, theirs, "emz") : zone(me, LOC.MZONE, mine, "emz"); };
  const hand = F[me].hand.filter(Boolean).map((c, i) => { const k = key(me, LOC.HAND, i); return `<div class="hand-card ${S.focus === k ? "selected" : ""}">${cardHTML({ ...c, pos: POS.FUA }, { cls: acts[k] ? "act" : "", key: k })}</div>`; }).join("");
  const oppHand = F[op].hand.filter(Boolean).map((c, i) => (c.code ? cardHTML({ ...c, pos: POS.FUA }, { key: key(op, LOC.HAND, i) }) : `<div class="back" data-key="${key(op, LOC.HAND, i)}"></div>`)).join("");

  let turnPl = null, phase = 0, turnNo = 0;
  for (const e of S.log) { if (e.type === MSG.NEW_TURN) { turnPl = e.player; turnNo++; phase = 1; } if (e.type === MSG.NEW_PHASE) phase = PHASE_OF(e.phase); }
  const phaseIdx = PHASES.findIndex(([b]) => b === phase);

  const player = (t, top) => `<div class="arena-player ${top ? "top-player" : "bottom-player"}">
    <div class="player-name"><span class="presence ${t === me ? "" : "rival"}"></span><strong>${esc(pname(t))}</strong>${turnPl === t ? `<i>SON TOUR</i>` : "<span></span>"}<small>${t === me ? (v.seat ? "TOI" : "JOUEUR") : "ADVERSAIRE"}</small></div>
    <div class="arena-lp" data-lp="${t}"><small>LIFE POINTS</small><strong>${F[t].lp.toLocaleString("fr-FR")}</strong><i><b style="width:${Math.max(0, Math.min(100, F[t].lp / 80))}%"></b></i></div>
    <button class="banished" data-a="pile" data-c="${t}" data-w="ban">BANNIES <span>${F[t].ban.filter(Boolean).length}</span></button></div>`;

  const board = `<div class="arena-panel" aria-label="Terrain">
    ${player(op, true)}
    <div class="table-hand opponent-cards">${oppHand}</div>
    <div class="compact-board">
      <div class="board-row">${sRow(op, true)}</div>
      <div class="board-row">${mRow(op, true)}</div>
      <div class="board-row">${pile(op, "ban")}<div class="board-zone blank"></div>${emz(0)}<div class="board-zone blank versus-chip">${icon("swords", 17)}<span>YOUR OWN DUEL</span></div>${emz(1)}<div class="board-zone blank"></div>${pile(me, "ban")}</div>
      <div class="board-row">${mRow(me, false)}</div>
      <div class="board-row">${sRow(me, false)}</div>
    </div>
    ${player(me, false)}
    <div class="table-hand player-cards" aria-label="Ta main">${hand || `<span class="muted small">Main vide</span>`}</div>
  </div>`;

  const sidebar = `<aside class="game-sidebar">
    <div class="side-card turn-card">
      <div class="turn-heading"><div><strong>TOUR ${turnNo || 1}</strong> <span>· ${esc(turnPl == null ? "" : pname(turnPl))}</span></div>${v.seat && !d.ended ? `<button class="side-ghost danger-action" data-a="surrender">${S.armed === "surrender" ? "CONFIRMER ?" : "ABANDONNER"}</button>` : ""}</div>
      <div class="horizontal-phases">${PHASES.map(([b, n], i) => `<span class="${i === phaseIdx ? "active" : i < phaseIdx ? "done" : ""}">${n.toUpperCase()}</span>`).join("")}</div>
      ${d.chain && d.chain.length ? `<div class="chain-preview"><span>CHAÎNE :</span>${d.chain.map((c) => `<div class="chain-card">${thumb(c.code)}</div>`).join("")}</div>` : ""}
    </div>
    ${d.ended ? viewEnd(d, me, pname) : ""}
    <div class="side-card journal-card"><div class="journal-heading"><strong>JOURNAL DU DUEL</strong><span>EN DIRECT</span></div>
      <div class="journal-feed" id="log">${S.log.slice(-150).map((e) => logLine(e, me, pname)).filter(Boolean).join("")}</div>
      ${(v.chat || []).slice(-6).map((c) => `<div class="chat-line"><b style="color:${v.teams[c.seat] === me ? "var(--green)" : "#dd6965"}">${esc(v.players[c.seat] ? v.players[c.seat].name : c.seat)}</b> ${esc(c.t)}</div>`).join("")}
      ${v.seat ? `<form class="chat-entry" data-a="chat"><input id="chatin" maxlength="200" placeholder="Message à ton adversaire…" aria-label="Message"><button>ENVOYER</button></form>` : ""}
    </div>
  </aside>`;

  // Les interactions s'ouvrent par-dessus le terrain : barre fixe en bas pour les commandes, pop-up pour le reste
  const DOCK = new Set([MSG.SELECT_IDLECMD, MSG.SELECT_BATTLECMD, MSG.SELECT_PLACE, MSG.SELECT_DISFIELD]);
  const promptHTML = d.ended ? "" : viewPrompt(p, acts, places, me, pname, d);
  const inPopup = p && !DOCK.has(p.type) && !S.busy;
  const busyCard = `<div class="side-card prompt-card wait"><div class="prompt-head"><div class="waiting-icon spin">${icon("clock", 20)}</div><div><strong>Le moteur résout…</strong><p>Ton choix est envoyé.</p></div></div></div>`;
  const dock = d.ended ? "" : `<div class="duel-dock">${S.busy ? busyCard : inPopup ? `<div class="side-card prompt-card"><div class="prompt-head"><div class="waiting-icon">${icon("spark", 20)}</div><div><strong>Une décision t'attend</strong><p>${S.mini ? "Regarde le terrain, puis reprends ta décision." : "Réponds dans la fenêtre ouverte."}</p></div></div>${S.mini ? `<div class="btns"><button class="next-phase" data-a="unmini">REPRENDRE MA DÉCISION ${icon("chevron", 15)}</button></div>` : ""}</div>` : promptHTML}</div>`;
  const popup = inPopup && !S.mini ? `<div class="overlay" role="dialog" aria-modal="true"><div class="popup" data-a="noop"><button class="mini-btn" data-a="mini">${icon("chevron", 15)} VOIR LE TERRAIN</button>${promptHTML}</div></div>`
    : S.focus ? `<div class="overlay" data-a="unfocus" role="dialog" aria-modal="true"><div class="popup" data-a="noop">${viewFocus(acts)}</div></div>` : "";
  return `<section class="yod-game">
    <header class="game-header"><button class="back-lobby" data-a="leave">${icon("chevron", 16)}ACCUEIL</button>
      <div class="room-identity"><small>SALLE PRIVÉE</small><strong>${esc(v.code)}</strong></div>${v.seat ? "" : `<span class="spectator">SPECTATEUR</span>`}
      ${v.players.B && v.players.B.bot ? "" : `<button class="invite-code" data-a="copycode">${icon("copy", 15)}COPIER LE LIEN</button>`}</header>
    <div class="game-layout">${board}${sidebar}</div>${dock}${popup}</section>`;
}

function viewEnd(d, me, pname) {
  const won = d.winner === me;
  return `<div class="side-card end-card"><h2 class="${d.winner == null ? "" : won ? "win" : "lose"}">${d.winner == null ? "ÉGALITÉ" : won ? "VICTOIRE" : "DÉFAITE"}</h2>
    <p class="muted small" style="margin:0">${d.surrendered ? "Abandon. " : ""}${d.winner != null ? esc(pname(d.winner)) + " remporte le duel." : ""}</p>
    ${S.view.seat ? `<button class="next-phase" data-a="rematch">REVANCHE ${icon("chevron", 15)}</button>` : ""}</div>`;
}

function viewFocus(acts) {
  const [c, l, s] = S.focus.split(":").map(Number);
  const F = S.view.duel.field[c];
  const card = l === LOC.HAND ? F.hand[s] : l === LOC.MZONE ? F.m[s] : l === LOC.SZONE ? F.s[s] : l === LOC.GRAVE ? F.gy[s] : l === LOC.REMOVED ? F.ban[s] : l === LOC.EXTRA ? (F.extra || [])[s] : null;
  const code = card ? card.code : 0;
  const t = text(code), list = acts[S.focus] || [];
  return `<div class="selected-side-card"><div class="selected-top">${thumb(code)}<div>
      <div class="turn-heading"><small>CARTE SÉLECTIONNÉE</small><button class="side-ghost" style="min-height:26px;padding:0 8px" data-a="unfocus" aria-label="Fermer">${icon("x", 14)}</button></div>
      <strong>${esc(code ? cname(code) : "Carte face verso")}</strong><span>${esc(typeLine(t))}</span>
      ${card && card.mats && card.mats.length ? `<span>Matériels : ${card.mats.map((m) => esc(cname(m))).join(", ")}</span>` : ""}</div></div>
    ${list.length ? `<div class="menu">${list.map((a, i) => `<button class="${i === 0 ? "side-primary" : "side-ghost"}" ${S.busy ? "disabled" : ""} data-a="doact" data-i="${i}">${esc(a.label)}</button>`).join("")}</div>` : ""}
    ${t && t.desc ? `<div class="card-text">${esc(t.desc)}</div>` : ""}</div>`;
}

function choiceGrid(cards, { picked = [], marked = [] } = {}) {
  return `<div class="choices">${cards.map((c, i) => `<div class="choice"><div class="card ${picked.includes(i) ? "sel" : ""} ${marked.includes(i) ? "act" : ""}" data-a="pickc" data-i="${i}" tabindex="0">${face(c.code)}</div>
    <small>${esc(c.code ? cname(c.code) : "face verso")}<br>${c.controller === S.view.duel.prompt.player ? "" : "adv. · "}${esc(LOCN[c.location] || "")}${c.amount != null ? ` · ${c.amount & 0xffff}` : ""}</small></div>`).join("")}</div>`;
}

function viewPrompt(p, acts, places, me, pname, d) {
  const wait = (title, sub) => `<div class="side-card prompt-card wait"><div class="prompt-head"><div class="waiting-icon">${icon("clock", 20)}</div><div><strong>${esc(title)}</strong><p>${esc(sub)}</p></div></div></div>`;
  if (!S.view.seat) return wait(d.waitingFor != null ? `${pname(d.waitingFor)} réfléchit…` : "…", "Tu regardes ce duel en spectateur.");
  if (!p) return wait(d.waitingFor != null && d.waitingFor !== me ? `${pname(d.waitingFor)} réfléchit…` : "Le moteur résout…", "Tu seras prévenu dès que c'est à toi.");
  const busy = S.busy ? "disabled" : "";
  const R = (r) => `data-a="raw" data-r='${JSON.stringify(r)}'`;
  const P = (title, sub, body = "") => `<div class="side-card prompt-card"><div class="prompt-head"><div class="waiting-icon">${icon("spark", 20)}</div><div><strong>${esc(title)}</strong>${sub || d.hint ? `<p>${esc(sub || desc(d.hint))}</p>` : ""}</div></div>${body}</div>`;
  switch (p.type) {
    case MSG.SELECT_IDLECMD: {
      const n = Object.keys(acts).length;
      return P("À toi de jouer", n ? "Les cartes qui brillent ont une action : clique dessus." : "Aucune action possible avec tes cartes.",
        `<div class="btns">${p.to_bp ? `<button class="side-ghost" ${busy} ${R({ type: RESP.SELECT_IDLECMD, action: 6, index: null })}>BATTLE PHASE</button>` : ""}
        ${p.to_ep ? `<button class="next-phase" ${busy} ${R({ type: RESP.SELECT_IDLECMD, action: 7, index: null })}>FIN DU TOUR ${icon("chevron", 15)}</button>` : ""}
        ${p.shuffle ? `<button class="side-ghost" ${busy} ${R({ type: RESP.SELECT_IDLECMD, action: 8, index: null })}>MÉLANGER LA MAIN</button>` : ""}</div>`);
    }
    case MSG.SELECT_BATTLECMD:
      return P("Battle Phase", "Clique sur un monstre qui brille pour attaquer ou activer un effet.",
        `<div class="btns">${p.to_m2 ? `<button class="side-ghost" ${busy} ${R({ type: RESP.SELECT_BATTLECMD, action: 2, index: null })}>MAIN PHASE 2</button>` : ""}
        ${p.to_ep ? `<button class="next-phase" ${busy} ${R({ type: RESP.SELECT_BATTLECMD, action: 3, index: null })}>FIN DU TOUR ${icon("chevron", 15)}</button>` : ""}</div>`);
    case MSG.SELECT_EFFECTYN:
      return P(`Activer « ${cname(p.code)} » ?`, fill(desc(p.description), [cname(p.code), LOCN[p.location] || ""]), `<div class="btns"><button class="next-phase" ${busy} ${R({ type: RESP.SELECT_EFFECTYN, yes: true })}>OUI</button><button class="side-ghost" ${busy} ${R({ type: RESP.SELECT_EFFECTYN, yes: false })}>NON</button></div>`);
    case MSG.SELECT_YESNO:
      return P(fill(desc(p.description), []), "", `<div class="btns"><button class="next-phase" ${busy} ${R({ type: RESP.SELECT_YESNO, yes: true })}>OUI</button><button class="side-ghost" ${busy} ${R({ type: RESP.SELECT_YESNO, yes: false })}>NON</button></div>`);
    case MSG.SELECT_OPTION:
      return P("Choisis une option", "", `<div class="menu">${p.options.map((o, i) => `<button class="side-ghost" ${busy} ${R({ type: RESP.SELECT_OPTION, index: i })}>${esc(desc(o))}</button>`).join("")}</div>`);
    case MSG.SELECT_CHAIN:
      return P(p.forced ? "Tu dois activer un effet" : "Chaîner ?", "Active une carte en réponse, ou passe.",
        `${choiceGrid(p.selects, { picked: S.picks })}
        ${S.picks.length ? `<div class="pick-summary"><b>${esc(cname(p.selects[S.picks[0]].code))}</b> : ${esc(desc(p.selects[S.picks[0]].description))}</div>` : `<p class="muted small" style="margin:0">Touche une carte pour voir son effet, puis confirme.</p>`}
        <div class="btns"><button class="next-phase" ${busy} ${S.picks.length ? "" : "disabled"} ${R({ type: RESP.SELECT_CHAIN, index: S.picks[0] ?? 0 })}>ACTIVER</button>
        ${p.forced ? "" : `<button class="side-ghost" ${busy} ${R({ type: RESP.SELECT_CHAIN, index: null })}>NE PAS CHAÎNER</button>`}</div>`);
    case MSG.SELECT_CARD: case MSG.SELECT_TRIBUTE: {
      const n = S.picks.length, ok = n >= p.min && n <= p.max, range = p.min === p.max ? p.min : `${p.min} à ${p.max}`;
      return P(p.type === MSG.SELECT_TRIBUTE ? `Choisis ${range} monstre(s) à Sacrifier` : `Choisis ${range} carte(s)`, "",
        `${choiceGrid(p.selects, { picked: S.picks })}<div class="btns"><button class="next-phase" ${busy} ${ok ? "" : "disabled"} data-a="confirmcards">VALIDER (${n})</button>
        ${p.can_cancel ? `<button class="side-ghost" ${busy} ${R({ type: p.type === MSG.SELECT_TRIBUTE ? RESP.SELECT_TRIBUTE : RESP.SELECT_CARD, indicies: null })}>ANNULER</button>` : ""}</div>`);
    }
    case MSG.SELECT_UNSELECT_CARD: {
      const all = [...p.select_cards, ...p.unselect_cards];
      return P(`Choisis des cartes (${p.min} à ${p.max})`, "Les cartes déjà choisies brillent : clique dessus pour les retirer.",
        `${choiceGrid(all, { picked: S.picks, marked: p.unselect_cards.map((_, i) => p.select_cards.length + i) })}
        <div class="btns">${S.picks.length ? `<button class="next-phase" ${busy} ${R({ type: RESP.SELECT_UNSELECT_CARD, index: S.picks[0] })}>${S.picks[0] >= p.select_cards.length ? "RETIRER" : "CHOISIR"} « ${esc(cname(all[S.picks[0]].code))} »</button>` : ""}${p.can_finish ? `<button class="next-phase" ${busy} ${R({ type: RESP.SELECT_UNSELECT_CARD, index: null })}>TERMINER</button>` : ""}
        ${p.can_cancel && !p.can_finish ? `<button class="side-ghost" ${busy} ${R({ type: RESP.SELECT_UNSELECT_CARD, index: null })}>ANNULER</button>` : ""}</div>`);
    }
    case MSG.SELECT_SUM: {
      const must = p.selects_must.reduce((a, c) => a + (c.amount & 0xffff), 0);
      const sum = must + S.picks.reduce((a, i) => a + (p.selects[i].amount & 0xffff), 0);
      return P(`Total ${p.select_max ? "d'au moins" : "de"} ${p.amount}`, `Total actuel : ${sum}${must ? ` (dont ${must} imposé)` : ""}`,
        `${choiceGrid(p.selects, { picked: S.picks })}<button class="next-phase" ${busy} data-a="confirmsum">VALIDER</button>`);
    }
    case MSG.SELECT_PLACE: case MSG.SELECT_DISFIELD:
      return P(p.type === MSG.SELECT_DISFIELD ? `Choisis ${p.count} zone(s) à rendre inutilisable(s)` : `Choisis ${p.count > 1 ? p.count + " zones" : "une zone"}`,
        `Clique sur une zone en vert sur le terrain (${S.picks.length}/${p.count}).`,
        places.length <= p.count ? `<button class="next-phase" ${busy} ${R({ type: p.type === MSG.SELECT_PLACE ? RESP.SELECT_PLACE : RESP.SELECT_DISFIELD, places: places.slice(0, p.count) })}>ZONE IMPOSÉE : VALIDER</button>` : "");
    case MSG.SELECT_POSITION: {
      const opts = [[POS.FUA, "ATK face recto"], [POS.FUD, "DEF face recto"], [POS.FDD, "DEF face verso"], [POS.FDA, "ATK face verso"]].filter(([b]) => p.positions & b);
      return P(`Position de « ${cname(p.code)} »`, "", `<div class="btns">${opts.map(([b, n]) => `<button class="side-ghost" ${busy} ${R({ type: RESP.SELECT_POSITION, position: b })}>${n}</button>`).join("")}</div>`);
    }
    case MSG.SELECT_COUNTER:
      return P(`Retire ${p.count} compteur(s)`, "", `${p.cards.map((c, i) => `<div class="btns" style="align-items:center"><span style="flex:1;font-size:12px">${esc(cname(c.code))} (${c.count})</span><input type="number" min="0" max="${c.count}" value="0" data-a="counter" data-i="${i}" style="width:70px"></div>`).join("")}
        <button class="next-phase" ${busy} data-a="confirmcounter">VALIDER</button>`);
    case MSG.SORT_CARD: case MSG.SORT_CHAIN:
      return P("Choisis l'ordre des cartes", `Clique dans l'ordre voulu (${S.picks.length}/${p.cards.length}).`,
        `${choiceGrid(p.cards, { picked: S.picks })}<div class="btns"><button class="next-phase" ${busy} ${S.picks.length === p.cards.length ? "" : "disabled"} data-a="confirmsort">VALIDER L'ORDRE</button>
        <button class="side-ghost" ${busy} ${R({ type: RESP.SORT_CARD, order: null })}>ORDRE PAR DÉFAUT</button></div>`);
    case MSG.ANNOUNCE_RACE: {
      const av = BigInt(p.available);
      return P(`Déclare ${p.count} Type(s) de monstre`, "", `<div class="btns">${RACES.map((n, i) => (av & (1n << BigInt(i)) ? `<button class="side-ghost ${S.picks.includes(i) ? "on" : ""}" data-a="pickrace" data-i="${i}">${n}</button>` : "")).join("")}</div>
        <button class="next-phase" ${busy} ${S.picks.length === p.count ? "" : "disabled"} data-a="confirmrace">VALIDER</button>`);
    }
    case MSG.ANNOUNCE_ATTRIB:
      return P(`Déclare ${p.count} Attribut(s)`, "", `<div class="btns">${ATTRS.map(([b, n]) => (p.available & b ? `<button class="side-ghost ${S.picks.includes(b) ? "on" : ""}" data-a="pickattr" data-b="${b}">${n}</button>` : "")).join("")}</div>
        <button class="next-phase" ${busy} ${S.picks.length === p.count ? "" : "disabled"} data-a="confirmattr">VALIDER</button>`);
    case MSG.ANNOUNCE_NUMBER:
      return P("Déclare un nombre", "", `<div class="btns">${p.options.map((o, i) => `<button class="side-ghost" ${busy} ${R({ type: RESP.ANNOUNCE_NUMBER, value: i })}>${Number(o)}</button>`).join("")}</div>`);
    case MSG.ANNOUNCE_CARD: {
      const res = S.announce.length > 1 && INDEX ? INDEX.filter((c) => c.key.includes(norm(S.announce))).slice(0, 30) : [];
      if (!INDEX) loadIndex().then(render);
      return P("Déclare un nom de carte", "", `<input id="announce" value="${esc(S.announce)}" placeholder="Nom de la carte">
        <div class="menu">${res.map((c) => `<button class="side-ghost" ${busy} ${R({ type: RESP.ANNOUNCE_CARD, card: c.code })}>${esc(c.name)}</button>`).join("")}</div>`);
    }
    case MSG.ROCK_PAPER_SCISSORS:
      return P("Pierre, feuille, ciseaux", "", `<div class="btns">${[[2, "Pierre"], [3, "Feuille"], [1, "Ciseaux"]].map(([vv, n]) => `<button class="side-ghost" ${busy} ${R({ type: RESP.ROCK_PAPER_SCISSORS, value: vv })}>${n}</button>`).join("")}</div>`);
  }
  return P(`Question du moteur (${p.type})`, "Cette question n'est pas encore gérée par l'interface.");
}

function logLine(e, me, pname) {
  const who = (t) => `<b>${esc(pname(t))}</b>`;
  const nm = (c) => `<b>${esc(cname(c))}</b>`;
  const item = (cls, label, html) => `<div class="feed-item ${cls}"><small>${label}</small><p>${html}</p></div>`;
  switch (e.type) {
    case MSG.NEW_TURN: return item("gold", "NOUVEAU TOUR", `${who(e.player)} commence son tour.`);
    case MSG.DRAW: return item("", "PIOCHE", `${who(e.player)} pioche ${e.drawn.length} carte${e.drawn.length > 1 ? "s" : ""}${e.drawn.some((c) => c.code) ? " : " + e.drawn.map((c) => nm(c.code)).join(", ") : ""}.`);
    case MSG.SUMMONING: return item("blue", "INVOCATION NORMALE", `${nm(e.code)} est Invoqué.`);
    case MSG.SPSUMMONING: return item("blue", "INVOCATION SPÉCIALE", `${nm(e.code)} est Invoqué Spécialement.`);
    case MSG.FLIPSUMMONING: return item("blue", "INVOCATION FLIP", `${nm(e.code)} est retourné.`);
    case MSG.SET: return item("", "POSE", e.code ? `${nm(e.code)} est Posée.` : "Une carte est Posée.");
    case MSG.CHAINING: return item("green", `EFFET ACTIVÉ · MAILLON ${e.chain_size}`, `${nm(e.code)} s'active.`);
    case MSG.CHAIN_NEGATED: case MSG.CHAIN_DISABLED: return item("red", "ANNULATION", `Le maillon ${e.chain_size} est annulé.`);
    case MSG.DAMAGE: return item("red", "DÉGÂTS", `${who(e.player)} perd <b>${e.amount.toLocaleString("fr-FR")} LP</b>.`);
    case MSG.PAY_LPCOST: return item("red", "COÛT", `${who(e.player)} paie <b>${e.amount.toLocaleString("fr-FR")} LP</b>.`);
    case MSG.RECOVER: return item("green", "SOIN", `${who(e.player)} gagne <b>${e.amount.toLocaleString("fr-FR")} LP</b>.`);
    case MSG.ATTACK: { const a = F_code(e.card), t = e.target ? F_code(e.target) : null; return item("red", "COMBAT", `${a ? nm(a) : "Un monstre"} attaque ${e.target ? (t ? nm(t) : "un monstre face verso") : "directement"}.`); }
    case MSG.MOVE: {
      if (e.from.location === e.to.location && e.from.controller === e.to.controller) return "";
      if (e.from.location === LOC.DECK && e.to.location === LOC.HAND && !e.card) return "";
      if (e.to.location === LOC.OVERLAY && !e.card) return "";
      return item("", "DÉPLACEMENT", `${e.card ? nm(e.card) : "Une carte"} : ${esc(LOCN[e.from.location] || "")} → ${esc(LOCN[e.to.location] || "")}${e.to.controller !== e.from.controller && e.from.location ? ` (${who(e.to.controller)})` : ""}.`);
    }
    case MSG.CONFIRM_CARDS: return item("", "RÉVÉLATION", e.cards.map((c) => nm(c.code)).join(", "));
    case MSG.TOSS_COIN: return item("gold", "PILE OU FACE", e.results.map((r) => (r ? "Face" : "Pile")).join(", "));
    case MSG.TOSS_DICE: return item("gold", "DÉ", e.results.join(", "));
    case MSG.WIN: return item("gold", "FIN DU DUEL", e.player < 2 ? `${who(e.player)} remporte le duel.` : "Égalité.");
  }
  return "";
}
function F_code(lp) {
  const F = S.view.duel.field[lp.controller];
  const c = lp.location === LOC.MZONE ? F.m[lp.sequence] : lp.location === LOC.SZONE ? F.s[lp.sequence] : null;
  return c && c.code;
}


/* ---------- animations (pioche, déplacements, destruction, attaque, dégâts) ---------- */
const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Position à l'écran de chaque zone, pile, carte en main et barre de LP
function snapRects() {
  const R = {};
  document.querySelectorAll(".yod-game [data-k], .yod-game .board-zone[data-a=pile], .yod-game [data-key], .yod-game [data-lp]").forEach((el) => {
    const k = el.dataset.lp != null ? "lp:" + el.dataset.lp : el.dataset.a === "pile" ? `pile:${el.dataset.c}:${el.dataset.w}` : el.dataset.k || el.dataset.key;
    if (k && !R[k]) R[k] = el.getBoundingClientRect();
  });
  return R;
}
function locKey(c, loc, seq) {
  if (loc & LOC.OVERLAY) return `${c}:${LOC.MZONE}:${seq}`;
  if (loc & LOC.MZONE) return `${c}:${LOC.MZONE}:${seq}`;
  if (loc & LOC.SZONE) return `${c}:${LOC.SZONE}:${seq}`;
  if (loc & LOC.HAND) return `${c}:${LOC.HAND}:${seq}`;
  const w = loc & LOC.GRAVE ? "gy" : loc & LOC.REMOVED ? "ban" : loc & LOC.EXTRA ? "extra" : loc & LOC.DECK ? "deck" : null;
  return w ? `pile:${c}:${w}` : null;
}
const rectOf = (map, k) => (k && map[k] && map[k].width ? map[k] : null);
function ghost(code, r) {
  const g = document.createElement("div");
  g.className = "ghost";
  g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
  g.innerHTML = code ? face(code) : `<div class="back"></div>`;
  document.body.appendChild(g);
  return g;
}
const centerShift = (a, b) => [b.left + b.width / 2 - (a.left + a.width / 2), b.top + b.height / 2 - (a.top + a.height / 2)];
function fly(code, from, to, ms = 460) {
  const g = ghost(code, from), [dx, dy] = centerShift(from, to), sc = to.width / from.width || 1;
  return g.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { offset: .7, opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${sc})`, opacity: .2 }], { duration: ms, easing: "cubic-bezier(.4,.1,.2,1)" }).finished.then(() => g.remove());
}
function burst(r, cls = "") {
  const b = document.createElement("div");
  b.className = "fx-ring " + cls;
  b.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px`;
  document.body.appendChild(b);
  return b.animate([{ transform: "translate(-50%,-50%) scale(.3)", opacity: .95 }, { transform: "translate(-50%,-50%) scale(1.6)", opacity: 0 }], { duration: 520, easing: "ease-out" }).finished.then(() => b.remove());
}
function floatText(r, text, cls) {
  const f = document.createElement("div");
  f.className = "fx-float " + cls; f.textContent = text;
  f.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top}px`;
  document.body.appendChild(f);
  return f.animate([{ transform: "translate(-50%,0)", opacity: 0 }, { offset: .15, opacity: 1 }, { transform: "translate(-50%,-46px)", opacity: 0 }], { duration: 1100, easing: "ease-out" }).finished.then(() => f.remove());
}
function shake(el) { if (el) el.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }], { duration: 320 }); }
async function destroy(code, r) {
  const g = ghost(code, r);
  await g.animate([{ transform: "scale(1) rotate(0)", filter: "brightness(1)" }, { offset: .4, transform: "scale(1.08) rotate(-3deg)", filter: "brightness(1.8) sepia(1) hue-rotate(-40deg) saturate(4)" },
    { transform: "scale(1.25) rotate(4deg)", filter: "brightness(2.2) saturate(5)", opacity: 0 }], { duration: 420, easing: "ease-in" }).finished;
  g.remove();
}
async function lunge(fromKey, toRect) {
  const el = document.querySelector(`.yod-game [data-k="${fromKey}"] .card`);
  if (!el || !toRect) return;
  const [dx, dy] = centerShift(el.getBoundingClientRect(), toRect);
  el.style.zIndex = 20; el.style.position = "relative";
  await el.animate([{ transform: el.classList.contains("def") ? "rotate(90deg) scale(.69)" : "none" }, { offset: .45, transform: `translate(${dx * .78}px,${dy * .78}px) scale(1.12)` }, { transform: el.classList.contains("def") ? "rotate(90deg) scale(.69)" : "none" }], { duration: 520, easing: "cubic-bezier(.5,0,.3,1)" }).finished;
  el.style.zIndex = "";
}
let animQueue = Promise.resolve();
function playAnims(events, before) {
  if (!before || reduceMotion() || !events.length) return;
  events = events.slice(-12); // une reconnexion ne rejoue pas toute la partie
  const after = snapRects(), me = S.view.team === 1 ? 1 : 0;
  const pos = (k) => rectOf(after, k) || rectOf(before, k);
  const steps = [];
  for (const e of events) {
    if (e.type === MSG.DRAW) {
      const deck = pos(`pile:${e.player}:deck`), n = (S.view.duel.field[e.player].hand || []).filter(Boolean).length;
      e.drawn.forEach((c, j) => { const to = rectOf(after, `${e.player}:${LOC.HAND}:${n - e.drawn.length + j}`); if (deck && to) steps.push(() => fly(e.player === me ? c.code : 0, deck, to, 420)); });
    } else if (e.type === MSG.MOVE) {
      const f = e.from, t = e.to;
      if (f.location === t.location && f.controller === t.controller && f.sequence === t.sequence) continue;
      const from = rectOf(before, locKey(f.controller, f.location, f.sequence)) || pos(locKey(f.controller, f.location, f.sequence));
      const to = pos(locKey(t.controller, t.location, t.sequence));
      if (!from || !to) continue;
      const onField = (l) => l & (LOC.MZONE | LOC.SZONE);
      if (onField(f.location) && t.location & LOC.GRAVE) steps.push(async () => { await destroy(e.card, from); await fly(e.card, from, to, 380); });
      else steps.push(() => fly(e.card, from, to));
    } else if (e.type === MSG.SUMMONING || e.type === MSG.SPSUMMONING || e.type === MSG.FLIPSUMMONING) {
      const r = pos(locKey(e.controller, e.location, e.sequence)); if (r) steps.push(() => burst(r, "gold"));
    } else if (e.type === MSG.CHAINING) {
      const r = pos(locKey(e.controller, e.location, e.sequence)); if (r) steps.push(() => burst(r, "green"));
    } else if (e.type === MSG.ATTACK) {
      const a = e.card, t = e.target;
      const target = t ? pos(locKey(t.controller, t.location, t.sequence)) : pos(`lp:${1 - a.controller}`);
      steps.push(async () => { await lunge(locKey(a.controller, a.location, a.sequence), target); if (target) burst(target, "red"); });
    } else if (e.type === MSG.DAMAGE || e.type === MSG.PAY_LPCOST || e.type === MSG.RECOVER) {
      const r = pos(`lp:${e.player}`); if (!r) continue;
      const heal = e.type === MSG.RECOVER;
      steps.push(() => { shake(document.querySelector(`.yod-game [data-lp="${e.player}"]`)); return floatText(r, `${heal ? "+" : "−"}${e.amount.toLocaleString("fr-FR")}`, heal ? "heal" : "hurt"); });
    }
  }
  for (const step of steps) animQueue = animQueue.then(() => Promise.race([step(), new Promise((r) => setTimeout(r, 1200))])).catch(() => {});
}

/* ---------- événements ---------- */
let armedT;
function arm(k) { if (S.armed === k) { S.armed = null; return true; } S.armed = k; render(); clearTimeout(armedT); armedT = setTimeout(() => { S.armed = null; render(); }, 3000); return false; }
function copy(v, input) { navigator.clipboard.writeText(v).then(() => toast("Lien copié"), () => { if (input) input.select(); toast("Sélectionné : copie-le avec Ctrl+C"); }); }
async function joinCode(code) {
  code = String(code || "").trim().toUpperCase();
  if (!S.name) return toast("Choisis d'abord un pseudo.");
  if (code.length !== 5) return toast("Le code de salle fait 5 caractères.");
  try { const r = await api({ action: "join", code, name: S.name, token: store.get("room-" + code) }); store.set("room-" + code, r.token); enter(r.code, r.token); } catch (e) { toast(e.message); }
}
const ACT = {
  tab(el) { if (S.code) leave(); S.tab = el.dataset.t; if (S.tab !== "decks") S.editing = null; render(); window.scrollTo(0, 0); },
  async create() {
    if (!S.name) { S.tab = S.tab === "rooms" ? "rooms" : "play"; render(); const f = $("#pname"); if (f) f.focus(); return toast("Choisis d'abord un pseudo."); }
    try { const r = await api({ action: "create", name: S.name, format: S.fmt }); store.set("room-" + r.code, r.token); enter(r.code, r.token); } catch (e) { toast(e.message); }
  },
  reopen(el) { const c = el.dataset.c; enter(c, store.get("room-" + c)); },
  async joinhere() {
    if (!S.name) return toast("Choisis d'abord un pseudo.");
    try { const r = await api({ action: "join", code: S.code, name: S.name }); store.set("room-" + r.code, r.token); enter(r.code, r.token); } catch (e) { toast(e.message); }
  },
  leave() { leave(); },
  copylink() { copy($("#rlink").value, $("#rlink")); },
  copycode() { copy(location.origin + "/?salle=" + S.code); },
  botpick() { S.botPick = true; loadBots(); render(); setTimeout(() => { const f = $("#botsearch"); if (f) f.focus(); }, 0); },
  closebot() { S.botPick = false; render(); },
  async vsbot(el) {
    if (!S.name) { S.botPick = false; S.tab = "play"; render(); const f = $("#pname"); if (f) f.focus(); return toast("Choisis d'abord un pseudo."); }
    const d = allDecks().find((x) => x.id === S.deckSel) || DEMO, pb = checkDeck(d, fmtOf(S.fmt));
    if (pb && pb.length) return toast(`Ton deck « ${d.name} » : ${pb[0]}`);
    try {
      const r = await api({ action: "create", name: S.name, format: S.fmt, bot: el.dataset.id });
      store.set("room-" + r.code, r.token); S.botPick = false;
      await api({ action: "deck", code: r.code, token: r.token, deck: { name: d.name, main: d.main, extra: d.extra } });
      enter(r.code, r.token);
    } catch (e) { toast(e.message); }
  },
  trydeck(el) {
    S.deckSel = el.dataset.id; store.set("deck-sel", S.deckSel); S.editing = null;
    const d = allDecks().find((x) => x.id === S.deckSel);
    toast(d ? `Deck « ${d.name} » choisi : crée une salle pour jouer` : "Deck introuvable");
    render();
  },
  pickdeck(el) { S.deckSel = el.dataset.id; store.set("deck-sel", S.deckSel); S.editing = null; S.selCard = null; render(); },
  async ready() {
    const pick = $("#deckpick"); if (pick) { S.deckSel = pick.value; store.set("deck-sel", S.deckSel); }
    const d = allDecks().find((x) => x.id === S.deckSel) || DEMO;
    const pb = S.view && S.view.format && checkDeck(d, fmtOf(S.view.format.id));
    if (pb && pb.length) return toast(pb[0]);
    try { await api({ action: "deck", code: S.code, token: S.token, deck: { name: d.name, main: d.main, extra: d.extra } }); await refresh(true); } catch (e) { toast(e.message); }
  },
  newdeck() { S.editing = { id: "new", name: "Nouveau deck", main: [], extra: [] }; S.deckSel = null; loadIndex().then(render); render(); },
  savedeck() {
    const d = S.editing; d.name = ($("#dname").value || "").trim() || "Deck sans nom";
    const isNew = d.id === "new"; delete d.fromDemo;
    if (isNew) { d.id = "d" + Date.now().toString(36); S.decks.push(d); } else S.decks[S.decks.findIndex((x) => x.id === d.id)] = d;
    saveDecks(); S.deckSel = d.id; store.set("deck-sel", d.id); S.editing = null; toast("Deck sauvegardé"); render();
  },
  deldeck() { if (!arm("del")) return; S.decks = S.decks.filter((x) => x.id !== S.editing.id); saveDecks(); S.editing = null; S.deckSel = "demo"; render(); },
  addcard(el) {
    const c = +el.dataset.c, t = text(c), d = S.editing;
    S.selCard = c;
    const f = fmtOf(S.fmt), max = limitOf(c, cardRule(c), f), base = (x) => { const r = cardRule(x); return r && r.alias && Math.abs(r.alias - x) < 20 ? r.alias : x; };
    const have = [...d.main, ...d.extra].filter((x) => base(x) === base(c)).length;
    if (have >= max) { render(); return toast(max === 0 ? `${cname(c)} : ${f.whitelist ? "hors de la liste" : "interdite"} en format ${f.short || f.name}.` : max < 3 ? `${cname(c)} : ${LIMIT_NAMES[max]} en format ${f.short || f.name} (${max} max).` : "3 exemplaires maximum."); }
    const isExtra = t ? t.type & EXTRA_T : INDEX && (INDEX.find((x) => x.code === c) || {}).k === "x";
    (isExtra ? d.extra : d.main).push(c); render();
  },
  rmcard(el) { const d = S.editing, part = d[el.dataset.p], i = part.lastIndexOf(+el.dataset.c); if (i > -1) part.splice(i, 1); render(); },
  pasteydk() { importYdk($("#ydktxt").value); },
  cell(el) {
    const p = S.view.duel && S.view.duel.prompt, [c, l, s] = el.dataset.k.split(":").map(Number);
    if (p && (p.type === MSG.SELECT_PLACE || p.type === MSG.SELECT_DISFIELD)) {
      if (!placeList(p).some((x) => x.player === c && x.location === l && x.sequence === s)) return toast("Choisis une zone en vert.");
      const i = S.picks.findIndex((x) => x.player === c && x.location === l && x.sequence === s);
      if (i > -1) S.picks.splice(i, 1); else S.picks.push({ player: c, location: l, sequence: s });
      if (S.picks.length === p.count) return send({ type: p.type === MSG.SELECT_PLACE ? RESP.SELECT_PLACE : RESP.SELECT_DISFIELD, places: S.picks });
      return render();
    }
    const F = S.view.duel.field[c], card = l === LOC.MZONE ? F.m[s] : F.s[s];
    if (card) { S.focus = el.dataset.k; render(); }
  },
  pile(el) {
    const c = +el.dataset.c, w = el.dataset.w, F = S.view.duel.field[c];
    const list = w === "gy" ? F.gy : w === "ban" ? F.ban : w === "extra" ? F.extra || [] : [];
    const p = S.view.duel.prompt, acts = p ? actionsMap(p) : {};
    const l = { gy: LOC.GRAVE, ban: LOC.REMOVED, extra: LOC.EXTRA, deck: LOC.DECK }[w];
    if (!list.filter(Boolean).length) return toast(w === "deck" ? `Deck : ${F.deck} cartes` : w === "extra" && c !== (S.view.team === 1 ? 1 : 0) ? `Extra Deck adverse : ${F.extraCount} cartes` : "Aucune carte.");
    showPile(list, c, l, acts);
  },
  doact(el) { const a = (actionsMap(S.view.duel.prompt)[S.focus] || [])[+el.dataset.i]; if (a) send(a.resp); },
  unfocus() { S.focus = null; render(); },
  noop() {},
  mini() { S.mini = true; render(); },
  unmini() { S.mini = false; render(); },
  more() { S.limit += 60; render(); },
  resetfilters() { S.f = { cat: "all", sub: "", attr: "", race: "", lvl: "", ban: "", sort: "name" }; S.search = ""; S.limit = 60; render(); },
  raw(el) { send(JSON.parse(el.dataset.r)); },
  pickc(el) {
    const p = S.view.duel.prompt, i = +el.dataset.i;
    if (!p) return;
    if (p.type === MSG.SELECT_UNSELECT_CARD || p.type === MSG.SELECT_CHAIN) { S.picks = S.picks[0] === i ? [] : [i]; return render(); } // un seul choix, confirmé par le bouton
    if (p.type === MSG.SORT_CARD || p.type === MSG.SORT_CHAIN) { if (!S.picks.includes(i)) S.picks.push(i); return render(); }
    const k = S.picks.indexOf(i);
    if ((p.type === MSG.SELECT_CARD || p.type === MSG.SELECT_TRIBUTE) && p.max === 1) S.picks = k > -1 ? [] : [i]; // remplace la sélection, on confirme avec « Valider »
    else if (k > -1) S.picks.splice(k, 1); else if ((p.type !== MSG.SELECT_CARD && p.type !== MSG.SELECT_TRIBUTE) || S.picks.length < p.max) S.picks.push(i);
    render();
  },
  confirmcards() { const p = S.view.duel.prompt; send({ type: p.type === MSG.SELECT_TRIBUTE ? RESP.SELECT_TRIBUTE : RESP.SELECT_CARD, indicies: S.picks }); },
  confirmsum() { send({ type: RESP.SELECT_SUM, indicies: S.picks }); },
  confirmsort() { send({ type: RESP.SORT_CARD, order: S.picks }); },
  confirmcounter() { const p = S.view.duel.prompt; const vals = [...document.querySelectorAll("[data-a=counter]")].map((x) => +x.value || 0); if (vals.reduce((a, b) => a + b, 0) !== p.count) return toast(`Il faut retirer ${p.count} compteur(s) au total.`); send({ type: RESP.SELECT_COUNTER, counters: vals }); },
  pickrace(el) { const i = +el.dataset.i, k = S.picks.indexOf(i); if (k > -1) S.picks.splice(k, 1); else S.picks.push(i); render(); },
  confirmrace() { send({ type: RESP.ANNOUNCE_RACE, races: S.picks.map((i) => 2 ** i) }); },
  pickattr(el) { const b = +el.dataset.b, k = S.picks.indexOf(b); if (k > -1) S.picks.splice(k, 1); else S.picks.push(b); render(); },
  confirmattr() { send({ type: RESP.ANNOUNCE_ATTRIB, attributes: S.picks }); },
  async surrender() { if (!arm("surrender")) return; try { await api({ action: "surrender", code: S.code, token: S.token }); await refresh(); } catch (e) { toast(e.message); } },
  async rematch() { try { await api({ action: "rematch", code: S.code, token: S.token }); S.log = []; S.logEnd = 0; await refresh(true); } catch (e) { toast(e.message); } },
  closepile() { const b = $("#pilebox"); if (b) b.remove(); },
};
function showPile(list, c, l, acts) {
  ACT.closepile();
  const box = document.createElement("div");
  box.id = "pilebox"; box.className = "overlay"; box.dataset.a = "closepile";
  const title = { [LOC.GRAVE]: "Cimetière", [LOC.REMOVED]: "Cartes bannies", [LOC.EXTRA]: "Extra Deck" }[l];
  box.innerHTML = `<div class="popup side-card" data-a="noop"><div class="turn-heading"><strong>${title.toUpperCase()} (${list.filter(Boolean).length})</strong><button class="side-ghost" data-a="closepile" aria-label="Fermer">${icon("x", 14)}</button></div>
    <div class="choices">${list.map((card, s) => (card ? `<div class="choice"><div class="card ${acts[key(c, l, s)] ? "act" : ""}" data-a="pilecard" data-k="${key(c, l, s)}" tabindex="0">${face(card.code)}</div><small>${esc(card.code ? cname(card.code) : "face verso")}</small></div>` : "")).join("")}</div></div>`;
  document.body.appendChild(box);
}
ACT.pilecard = (el) => { S.focus = el.dataset.k; ACT.closepile(); render(); };

function importYdk(txt) {
  const { main, extra } = parseYdk(txt || "");
  if (!main.length && !extra.length) return toast("Aucune carte trouvée dans ce fichier.");
  ensureEditing(); S.editing.main = main; S.editing.extra = extra; [...main, ...extra].forEach(text);
  toast(`${main.length} + ${extra.length} cartes importées`); render();
}

document.addEventListener("click", (e) => {
  const cardEl = e.target.closest(".player-cards .card[data-key]");
  if (cardEl) { S.focus = cardEl.dataset.key; render(); return; }
  const el = e.target.closest("[data-a]"); if (!el || el.tagName === "FORM" || el.tagName === "INPUT") return;
  const f = ACT[el.dataset.a]; if (f) { e.preventDefault(); f(el); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if ($("#pilebox")) ACT.closepile(); else if (S.focus) ACT.unfocus(); else if (S.botPick) ACT.closebot(); }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[tabindex]") && e.target.tagName !== "INPUT") { e.preventDefault(); e.target.click(); }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (e.target.dataset.a === "joinform") return joinCode($("#jcode").value);
  if (e.target.dataset.a === "chat") { const v = ($("#chatin").value || "").trim(); if (!v) return; $("#chatin").value = ""; try { await api({ action: "chat", code: S.code, token: S.token, text: v }); refresh(); } catch (err) { toast(err.message); } }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "pname") { S.name = e.target.value.trim().slice(0, 24); store.set("name", S.name); const u = document.querySelector(".user-area strong"); if (u) u.textContent = S.name || "Sans pseudo"; const a = document.querySelector(".avatar"); if (a) a.textContent = initials(S.name); }
  if (e.target.id === "botsearch") { S.botSearch = e.target.value; render(); }
  if (e.target.id === "dsearch") { S.search = e.target.value; S.limit = 60; if (!INDEX) loadIndex().then(render); render(); }
  if (e.target.id === "announce") { S.announce = e.target.value; render(); }
  if (e.target.id === "dname" && S.editing) S.editing.name = e.target.value;
});
document.addEventListener("change", (e) => {
  if (e.target.id === "ydk" && e.target.files[0]) { const r = new FileReader(); r.onload = () => importYdk(r.result); r.readAsText(e.target.files[0]); }
  if (e.target.id === "deckpick") { S.deckSel = e.target.value; store.set("deck-sel", S.deckSel); }
  if (e.target.id === "fmtpick" || e.target.id === "fmt") { S.fmt = e.target.value; store.set("fmt", S.fmt); if (S.fmt === "amical") S.f.ban = ""; render(); }
  if (e.target.id === "roomfmt") api({ action: "format", code: S.code, token: S.token, format: e.target.value }).then(() => refresh(true)).catch((err) => { toast(err.message); render(); });
  const fk = { "f-cat": "cat", "f-sub": "sub", "f-attr": "attr", "f-race": "race", "f-lvl": "lvl", "f-ban": "ban", "f-sort": "sort" }[e.target.id];
  if (fk) { S.f[fk] = e.target.value; if (fk === "cat") S.f.sub = ""; S.limit = 60; render(); }
});

/* ---------- appli installable ---------- */
let installEvt = null;
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; render(); });
window.addEventListener("appinstalled", () => { installEvt = null; toast("Your Own Duel est installé sur ton appareil"); render(); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
const installButton = () => (standalone() ? "" : installEvt || isIOS ? `<button class="install-btn" data-a="install">${icon("plus", 15)}Installer l'appli</button>` : "");
ACT.install = async () => {
  if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); if (r && r.outcome === "accepted") installEvt = null; render(); return; }
  if (isIOS) toast("Sur iPhone : touche Partager, puis « Sur l'écran d'accueil ».");
};

/* ---------- démarrage ---------- */
fetch("/strings.json").then((r) => r.json()).then((s) => { STR = s; render(); }).catch(() => {});
DEMO.main.concat(DEMO.extra).forEach(text);
const qs = new URLSearchParams(location.search).get("salle");
if (qs) enter(qs.toUpperCase(), store.get("room-" + qs.toUpperCase()));
else render();
