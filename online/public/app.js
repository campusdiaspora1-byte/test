// Duel Hueco Mundo : interface. Le serveur (moteur d'EDOPro) décide de tout ; la page affiche le terrain et pose ses questions.
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
  name: store.get("name", ""), decks: store.get("decks", []), deckSel: store.get("deck-sel", "demo"),
  code: null, token: null, view: null, version: 0, log: [], logEnd: 0, busy: false, picks: [], focus: null, editing: null, search: "", announce: "",
};
const TEXT = {}, CHUNK = {};
let STR = { system: {} }, INDEX = null;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
let toastT; function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200); }

/* ---------- textes des cartes ---------- */
function text(code) {
  code = +code;
  if (!code) return null;
  if (TEXT[code]) return TEXT[code];
  const n = code % 100;
  if (!CHUNK[n]) CHUNK[n] = fetch(`/t/${n}.json`).then((r) => r.json()).then((ch) => {
    for (const k in ch) { const [name, desc, strs, type, level, attr, race, atk, def, ls, rs, link, en] = ch[k]; TEXT[k] = { name, desc, strs, type, level, attr, race, atk, def, ls, rs, link, en }; }
    render();
  }).catch(() => {});
  return null;
}
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
  if (code >= HM_FIRST && code < HM_LAST) return [`/hm/${code}.jpg`];
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
    const prevStatus = S.view && S.view.status;
    if (j.duel) {
      if (j.duel.log.length && j.duel.log[0].i < S.logEnd) S.log = []; // nouvelle partie
      if (prevStatus !== "duel" && j.status === "duel" && S.logEnd > j.duel.logEnd) S.log = [];
      S.log.push(...j.duel.log.filter((e) => !S.log.length || e.i > S.log[S.log.length - 1].i));
      S.logEnd = j.duel.logEnd;
    } else { S.log = []; S.logEnd = 0; }
    if (j.duel && S.view && S.view.duel && JSON.stringify(j.duel.prompt) !== JSON.stringify(S.view.duel.prompt)) { S.picks = []; S.focus = null; }
    S.view = j; S.version = j.version;
    render();
    autoAnswer();
  } catch (e) { /* réseau : on réessaiera */ } finally {
    fetching = false;
    if (again) { again = false; refresh(); }
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
  S.busy = true; render();
  try { await api({ action: "respond", code: S.code, token: S.token, response }); S.picks = []; S.focus = null; await refresh(); }
  catch (e) { toast(e.message); }
  finally { S.busy = false; render(); }
}
// Questions sans intérêt : rien à chaîner, on passe tout de suite
function autoAnswer() {
  const p = S.view && S.view.duel && S.view.duel.prompt;
  if (!p || S.busy) return;
  if (p.type === MSG.SELECT_CHAIN && !p.selects.length && !p.forced) send({ type: RESP.SELECT_CHAIN, index: null });
}

/* ---------- decks ---------- */
const allDecks = () => [DEMO, ...S.decks];
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
  INDEX = (await (await fetch("/index-cards.json")).json()).map(([code, name, en, k]) => ({ code, name, en, k, key: norm(name + " " + en) }));
  return INDEX;
}
const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* ---------- vues ---------- */
function render() {
  const app = $("#app");
  const focus = document.activeElement && document.activeElement.id, val = focus && document.activeElement.value, selStart = focus && document.activeElement.selectionStart;
  app.innerHTML = !S.code ? viewHome() : !S.view ? `<p class="muted">Connexion à la salle ${esc(S.code)}…</p>` : S.view.status === "lobby" ? viewRoom() : viewDuel();
  if (focus) { const f = document.getElementById(focus); if (f) { f.focus(); if (val != null && f.value !== val) f.value = val; try { f.setSelectionRange(selStart, selStart); } catch (e) {} } }
  const lg = $("#log"); if (lg) lg.scrollTop = lg.scrollHeight;
}

function viewHome() {
  return `<div class="top"><div><h1>Your Own Duel</h1><p class="muted" style="margin:6px 0 0">Duels Yu-Gi-Oh! entre amis, avec l'archétype Hueco Mundo. Le moteur d'EDOPro applique toutes les règles et tous les effets.</p></div></div>
  <div class="grid2">
    <section class="panel"><h2>Jouer</h2>
      <label class="field">Ton pseudo<input id="pname" maxlength="24" value="${esc(S.name)}" placeholder="ex. Ichigo"></label>
      <button class="primary" data-a="create">Créer une salle</button>
      <div class="row"><input id="jcode" maxlength="5" placeholder="Code de la salle" style="text-transform:uppercase;flex:1"><button data-a="join">Rejoindre</button></div>
      <p class="muted small" style="margin:0">Crée une salle, puis envoie le code (ou le lien) à ton ami. Il choisit son pseudo et rejoint avec le code.</p>
    </section>
    ${viewDecks()}
  </div>
  <p class="muted small" style="margin:0">Moteur de règles : <a href="https://github.com/edo9300/ygopro-core" target="_blank" rel="noopener">ocgcore (EDOPro)</a> · scripts des cartes : <a href="https://github.com/ProjectIgnis/CardScripts" target="_blank" rel="noopener">Project Ignis</a> · <a href="https://github.com/campusdiaspora1-byte/test/tree/claude/new-session-u2ibpp/online" target="_blank" rel="noopener">code source du site</a> (AGPL-3.0). Yu-Gi-Oh! © Kazuki Takahashi, Konami. Site amateur, sans but commercial.</p>`;
}

function viewDecks() {
  if (S.editing) return viewEditor();
  return `<section class="panel"><div class="top"><h2>Mes decks</h2><button data-a="newdeck">Nouveau deck</button></div>
    <div class="decklist">${allDecks().map((d) => `<div class="deckrow ${d.id === S.deckSel ? "sel" : ""}" data-a="pickdeck" data-id="${esc(d.id)}" tabindex="0">
      <div><b>${esc(d.name)}</b> <span class="muted small">${d.main.length} + ${d.extra.length}</span></div>
      ${d.id === "demo" ? `<span class="chip">démo</span>` : `<div class="row"><button class="ghost" data-a="editdeck" data-id="${esc(d.id)}">Modifier</button></div>`}</div>`).join("")}</div>
    <p class="muted small" style="margin:0">Importe un deck .ydk (EDOPro, YGOPRODeck, DuelingBook…) depuis « Nouveau deck ».</p></section>`;
}

function viewEditor() {
  const d = S.editing, counts = deckCounts(d);
  const problems = [];
  if (d.main.length < 40 || d.main.length > 60) problems.push(`Main Deck : ${d.main.length} cartes (40 à 60)`);
  if (d.extra.length > 15) problems.push(`Extra Deck : ${d.extra.length} cartes (15 max)`);
  const over = Object.entries(counts).filter(([, n]) => n > 3); if (over.length) problems.push(`Plus de 3 exemplaires : ${over.map(([c]) => cname(c)).join(", ")}`);
  const res = S.search.length > 1 && INDEX ? INDEX.filter((c) => c.key.includes(norm(S.search))).slice(0, 60) : [];
  const line = (code, part) => { const t = text(code); return `<div class="r"><b>${esc(t ? t.name : code)}</b><div class="row"><button class="ghost" data-a="rmcard" data-c="${code}" data-p="${part}">−</button><span class="qty">${counts[code]}</span><button class="ghost" data-a="addcard" data-c="${code}">+</button></div></div>`; };
  const uniq = (a) => [...new Set(a)];
  return `<section class="panel"><div class="top"><h2>Deck</h2><div class="row"><button data-a="canceldeck">Annuler</button><button class="primary" data-a="savedeck">Enregistrer</button></div></div>
    <label class="field">Nom<input id="dname" maxlength="40" value="${esc(d.name)}"></label>
    <div class="field">Importer un .ydk<input type="file" id="ydk" accept=".ydk,text/plain"></div>
    <details><summary class="muted small">ou coller le contenu d'un .ydk</summary><textarea id="ydktxt" placeholder="#main&#10;89631139&#10;…"></textarea><button data-a="pasteydk">Importer le texte</button></details>
    <div class="small">${problems.length ? problems.map((p) => `<div class="bad">✗ ${esc(p)}</div>`).join("") : `<div class="ok">✓ Deck valide</div>`}</div>
    <label class="field">Ajouter une carte<input id="dsearch" value="${esc(S.search)}" placeholder="Nom en français ou en anglais"></label>
    ${res.length ? `<div class="results">${res.map((c) => `<div class="r"><b>${esc(c.name)}</b><button class="ghost" data-a="addcard" data-c="${c.code}">+</button></div>`).join("")}</div>` : ""}
    <h3>Main Deck (${d.main.length})</h3><div class="results">${uniq(d.main).map((c) => line(c, "main")).join("") || `<p class="muted small">Vide</p>`}</div>
    <h3>Extra Deck (${d.extra.length})</h3><div class="results">${uniq(d.extra).map((c) => line(c, "extra")).join("") || `<p class="muted small">Vide</p>`}</div>
    ${d.id !== "new" ? `<button class="danger" data-a="deldeck">Supprimer ce deck</button>` : ""}</section>`;
}

function viewRoom() {
  const v = S.view, me = v.seat, link = location.origin + "/?salle=" + v.code;
  const pl = (s) => { const p = v.players[s]; return p ? `<div class="deckrow"><div><b>${esc(p.name)}</b>${s === me ? ` <span class="muted small">(toi)</span>` : ""}</div>${p.ready ? `<span class="chip ok">prêt · ${esc(p.deckName || "deck")}</span>` : `<span class="chip">choisit son deck</span>`}</div>` : `<div class="deckrow"><span class="muted">En attente du 2e joueur…</span></div>`; };
  return `<div class="top"><div class="row"><button data-a="leave">← Accueil</button><h2>Salle</h2><span class="code">${esc(v.code)}</span></div></div>
  <div class="grid2">
    <section class="panel"><h2>Joueurs</h2>${pl("A")}${pl("B")}
      <div class="field">Lien à envoyer à ton ami<div class="row"><input id="rlink" readonly value="${esc(link)}" style="flex:1"><button data-a="copylink">Copier</button></div></div>
      ${me ? (v.players[me].ready ? `<p class="muted small" style="margin:0">Deck validé. Le duel commence dès que l'autre joueur a validé le sien.</p>` : `<button class="primary" data-a="ready">Valider « ${esc((allDecks().find((d) => d.id === S.deckSel) || DEMO).name)} »</button>`) : `<p class="muted">Tu regardes cette salle.</p>`}
      ${!me && !v.players.B ? `<label class="field">Ton pseudo<input id="pname" maxlength="24" value="${esc(S.name)}"></label><button class="primary" data-a="joinhere">Prendre la place</button>` : ""}
    </section>
    ${me && !v.players[me].ready ? viewDecks() : ""}
  </div>`;
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
    p.monster_sets.forEach((c, i) => add(c, "Poser (face verso)", { type: RESP.SELECT_IDLECMD, action: 3, index: i }));
    p.spell_sets.forEach((c, i) => add(c, "Poser (face verso)", { type: RESP.SELECT_IDLECMD, action: 4, index: i }));
    p.activates.forEach((c, i) => add(c, "Activer : " + desc(c.description), { type: RESP.SELECT_IDLECMD, action: 5, index: i }));
  }
  if (p.type === MSG.SELECT_BATTLECMD) {
    p.chains.forEach((c, i) => add(c, "Activer : " + desc(c.description), { type: RESP.SELECT_BATTLECMD, action: 0, index: i }));
    p.attacks.forEach((c, i) => add(c, c.can_direct ? "Attaquer (directement si possible)" : "Attaquer", { type: RESP.SELECT_BATTLECMD, action: 1, index: i }));
  }
  return A;
}
// Zones libres d'une question SELECT_PLACE : bit à 1 = zone interdite
function placeList(p, me) {
  const out = [];
  for (const [base, l, n, rel] of [[0, LOC.MZONE, 7, 0], [8, LOC.SZONE, 8, 0], [16, LOC.MZONE, 7, 1], [24, LOC.SZONE, 8, 1]])
    for (let i = 0; i < n; i++) if (!(p.field_mask & (1 << (base + i)))) out.push({ player: rel ? 1 - p.player : p.player, location: l, sequence: i });
  return out;
}

function viewDuel() {
  const v = S.view, d = v.duel, me = v.team === 1 ? 1 : 0, op = 1 - me, F = d.field;
  const p = d.prompt, acts = p ? actionsMap(p) : {};
  const places = p && (p.type === MSG.SELECT_PLACE || p.type === MSG.SELECT_DISFIELD) ? placeList(p, me) : [];
  const seatOfTeam = (t) => Object.keys(v.teams).find((s) => v.teams[s] === t);
  const pname = (t) => { const s = seatOfTeam(t); return (v.players[s] && v.players[s].name) || (t ? "Joueur 2" : "Joueur 1"); };

  const cell = (ctrl, l, s, extra = "") => {
    const c = l === LOC.MZONE ? F[ctrl].m[s] : F[ctrl].s[s];
    const k = key(ctrl, l, s), isPlace = places.some((x) => x.player === ctrl && x.location === l && x.sequence === s);
    const picked = S.picks.some((x) => x.player === ctrl && x.location === l && x.sequence === s);
    const lbl = l === LOC.MZONE ? (s >= 5 ? "Extra" : "Monstre") : s === 5 ? "Terrain" : s === 0 || s === 4 ? "M/P · Pendule" : "Mag/Piège";
    return `<div class="cell ${extra} ${isPlace ? "place" : ""} ${picked ? "picked" : ""}" data-a="cell" data-k="${k}" tabindex="0">${c ? cardHTML(c, { cls: acts[k] ? "act" : S.focus === k ? "sel" : "", key: k, monster: l === LOC.MZONE }) : `<span class="lbl">${lbl}</span>`}</div>`;
  };
  const pile = (ctrl, what) => {
    const f = F[ctrl];
    const n = what === "deck" ? f.deck : what === "extra" ? f.extraCount : f[what].filter(Boolean).length;
    const top = what === "gy" || what === "ban" ? f[what].filter(Boolean).slice(-1)[0] : what === "extra" && ctrl === me ? null : null;
    const anyAct = Object.keys(acts).some((k) => k.startsWith(`${ctrl}:${{ gy: LOC.GRAVE, ban: LOC.REMOVED, extra: LOC.EXTRA, deck: LOC.DECK }[what]}:`));
    const label = { deck: "Deck", extra: "Extra", gy: "Cimet.", ban: "Bannies" }[what];
    return `<div class="cell" data-a="pile" data-c="${ctrl}" data-w="${what}" tabindex="0" title="${label}">${n ? `<div class="card ${anyAct ? "act" : ""}">${top ? face(top.code) : `<div class="back"></div>`}<span class="pilecount">${n}</span></div>` : `<span class="lbl">${label}</span>`}</div>`;
  };
  const sRow = (ctrl, flip) => { const idx = flip ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4]; const r = [pile(ctrl, "extra"), ...idx.map((i) => cell(ctrl, LOC.SZONE, i)), pile(ctrl, "deck")]; return flip ? r.reverse() : r; };
  const mRow = (ctrl, flip) => { const idx = flip ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4]; const r = [cell(ctrl, LOC.SZONE, 5), ...idx.map((i) => cell(ctrl, LOC.MZONE, i)), pile(ctrl, "gy")]; return flip ? r.reverse() : r; };
  // Zones Monstre Extra : partagées ; la gauche de l'un est la droite de l'autre
  const emz = (side) => { const mine = side === 0 ? 5 : 6, theirs = side === 0 ? 6 : 5; return F[op].m[theirs] ? cell(op, LOC.MZONE, theirs, "emz") : cell(me, LOC.MZONE, mine, "emz"); };
  const hand = F[me].hand.filter(Boolean).map((c, i) => { const k = key(me, LOC.HAND, i); return cardHTML({ ...c, pos: POS.FUA }, { cls: acts[k] ? "act" : S.focus === k ? "sel" : "", key: k }); }).join("");
  const oppHand = F[op].hand.filter(Boolean).map((c, i) => cardHTML({ ...c, pos: c.code ? POS.FUA : POS.FDA }, { key: key(op, LOC.HAND, i) })).join("");

  // tour et phase, d'après le journal
  let turnPl = null, phase = 0, turnNo = 0;
  for (const e of S.log) { if (e.type === MSG.NEW_TURN) { turnPl = e.player; turnNo++; phase = 1; } if (e.type === MSG.NEW_PHASE) phase = PHASE_OF(e.phase); }

  const lpbar = (t) => `<div class="lpbar"><div class="who"><span class="dot" style="background:${t === me ? "var(--me)" : "var(--opp)"}"></span>${esc(pname(t))}${turnPl === t ? ` <span class="chip ok">son tour</span>` : ""}</div><span class="lp">${F[t].lp} LP</span>
    <button class="ghost" data-a="pile" data-c="${t}" data-w="ban">Bannies (${F[t].ban.filter(Boolean).length})</button></div>`;

  const board = `<section class="mat" aria-label="Terrain">
    ${lpbar(op)}
    <div class="hand opp">${oppHand}</div>
    <div class="zrow">${sRow(op, true).join("")}</div>
    <div class="zrow">${mRow(op, true).join("")}</div>
    <div class="zrow"><div class="cell blank"></div><div class="cell blank"></div>${emz(0)}<div class="cell blank" style="display:grid;place-items:center"><span class="mid">vs</span></div>${emz(1)}<div class="cell blank"></div><div class="cell blank"></div></div>
    <div class="zrow">${mRow(me, false).join("")}</div>
    <div class="zrow">${sRow(me, false).join("")}</div>
    ${lpbar(me)}
    <div class="hand" aria-label="Ta main">${hand || `<span class="muted">Main vide</span>`}</div>
  </section>`;

  const side = `<div style="display:grid;gap:12px;min-width:0">
    <section class="panel"><div class="top"><div><b>Tour ${turnNo || 1}</b> · ${esc(turnPl == null ? "" : pname(turnPl))}</div>${v.seat && !d.ended ? `<button class="danger" data-a="surrender">${S.armed === "surrender" ? "Confirmer l'abandon ?" : "Abandonner"}</button>` : ""}</div>
      <div class="phases">${PHASES.map(([b, n]) => `<span class="${phase === b ? "on" : ""}">${n}</span>`).join("")}</div>
      ${d.chain && d.chain.length ? `<div class="chain"><span class="muted small">Chaîne :</span>${d.chain.map((c) => `<div class="card">${face(c.code)}</div>`).join("")}</div>` : ""}</section>
    ${d.ended ? viewEnd(d, me, pname) : viewPrompt(p, acts, places, me, pname, d)}
    ${S.focus ? viewFocus(acts) : ""}
    <section class="panel"><h3>Journal</h3><div class="log" id="log">${S.log.slice(-120).map((e) => logLine(e, me, pname)).filter(Boolean).join("")}</div>
      ${v.seat ? `<form class="chatform" data-a="chat"><input id="chatin" maxlength="200" placeholder="Message à ton adversaire" aria-label="Message"><button>Envoyer</button></form>` : ""}
      ${(v.chat || []).slice(-6).map((c) => `<div class="small"><b style="color:${v.teams[c.seat] === me ? "var(--me)" : "var(--opp)"}">${esc(v.players[c.seat] ? v.players[c.seat].name : c.seat)}</b> ${esc(c.t)}</div>`).join("")}
    </section></div>`;
  return `<div class="top"><div class="row"><button data-a="leave">← Accueil</button><h2>Salle <span class="code" style="font-size:20px">${esc(v.code)}</span></h2>${v.seat ? "" : `<span class="chip">spectateur</span>`}</div></div>
    <div class="duel">${board}${side}</div>`;
}

function viewEnd(d, me, pname) {
  const won = d.winner === me;
  return `<section class="panel end"><h2>${d.winner == null ? "Égalité" : won ? "Victoire !" : "Défaite"}</h2>
    <p class="muted" style="margin:0">${d.surrendered ? "Abandon." : ""} ${d.winner != null ? esc(pname(d.winner)) + " remporte le duel." : ""}</p>
    ${S.view.seat ? `<button class="primary" data-a="rematch">Revanche</button>` : ""}</section>`;
}

function viewFocus(acts) {
  const [c, l, s] = S.focus.split(":").map(Number);
  const F = S.view.duel.field[c];
  const card = l === LOC.HAND ? F.hand[s] : l === LOC.MZONE ? F.m[s] : l === LOC.SZONE ? F.s[s] : l === LOC.GRAVE ? F.gy[s] : l === LOC.REMOVED ? F.ban[s] : l === LOC.EXTRA ? (F.extra || [])[s] : null;
  const code = card ? card.code : S.focusCode;
  const t = text(code), list = acts[S.focus] || [];
  return `<section class="panel"><div class="detail"><div class="card">${face(code)}</div><div style="display:grid;gap:6px;align-content:start;min-width:0">
    <div class="top"><h3>${esc(code ? cname(code) : "Carte face verso")}</h3><button class="ghost" data-a="unfocus" aria-label="Fermer">✕</button></div>
    <div class="muted small">${esc(typeLine(t))}</div>
    ${card && card.mats && card.mats.length ? `<div class="small muted">Matériels : ${card.mats.map((m) => esc(cname(m))).join(", ")}</div>` : ""}
    ${list.length ? `<div class="menu">${list.map((a, i) => `<button class="primary" data-a="doact" data-i="${i}">${esc(a.label)}</button>`).join("")}</div>` : ""}
    <div class="txt">${esc(t ? t.desc : "")}</div></div></div></section>`;
}

function choiceGrid(cards, { picked = [], marked = [] } = {}) {
  return `<div class="choices">${cards.map((c, i) => `<div class="choice"><div class="card ${picked.includes(i) ? "sel" : ""} ${marked.includes(i) ? "act" : ""}" data-a="pickc" data-i="${i}" tabindex="0">${face(c.code)}</div>
    <small>${esc(c.code ? cname(c.code) : "face verso")}<br>${c.controller === S.view.duel.prompt.player ? "" : "adv. · "}${esc(LOCN[c.location] || "")}${c.amount != null ? ` · ${c.amount & 0xffff}` : ""}</small></div>`).join("")}</div>`;
}

function viewPrompt(p, acts, places, me, pname, d) {
  if (!S.view.seat) return `<section class="panel prompt wait"><h3>${d.waitingFor != null ? `${esc(pname(d.waitingFor))} réfléchit…` : "…"}</h3></section>`;
  if (!p) return `<section class="panel prompt wait"><h3>${d.waitingFor != null && d.waitingFor !== me ? `${esc(pname(d.waitingFor))} réfléchit…` : "Le moteur résout…"}</h3><p class="muted small" style="margin:0">Tu seras prévenu dès que c'est à toi.</p></section>`;
  const busy = S.busy ? "disabled" : "";
  const title = (t) => `<h3>${esc(t)}</h3>${d.hint ? `<p class="muted small" style="margin:0">${esc(desc(d.hint))}</p>` : ""}`;
  const P = (h) => `<section class="panel prompt">${h}</section>`;
  switch (p.type) {
    case MSG.SELECT_IDLECMD: {
      const n = Object.keys(acts).length;
      return P(`<h3>À toi de jouer</h3><p class="muted small" style="margin:0">${n ? "Les cartes qui brillent ont une action : clique dessus." : "Aucune action possible avec tes cartes."}</p>
        <div class="row">${p.to_bp ? `<button ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SELECT_IDLECMD, action: 6, index: null })}'>Battle Phase</button>` : ""}
        ${p.to_ep ? `<button class="primary" ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SELECT_IDLECMD, action: 7, index: null })}'>Fin du tour</button>` : ""}
        ${p.shuffle ? `<button ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SELECT_IDLECMD, action: 8, index: null })}'>Mélanger la main</button>` : ""}</div>`);
    }
    case MSG.SELECT_BATTLECMD:
      return P(`<h3>Battle Phase</h3><p class="muted small" style="margin:0">Clique sur un monstre qui brille pour attaquer ou activer un effet.</p>
        <div class="row">${p.to_m2 ? `<button ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SELECT_BATTLECMD, action: 2, index: null })}'>Main Phase 2</button>` : ""}
        ${p.to_ep ? `<button class="primary" ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SELECT_BATTLECMD, action: 3, index: null })}'>Fin du tour</button>` : ""}</div>`);
    case MSG.SELECT_EFFECTYN:
      return P(`${title(`Activer « ${cname(p.code)} » ?`)}<div class="detail"><div class="card">${face(p.code)}</div><div class="txt">${esc(desc(p.description))}</div></div>
        <div class="row"><button class="primary" ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SELECT_EFFECTYN, yes: true })}'>Oui</button><button ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SELECT_EFFECTYN, yes: false })}'>Non</button></div>`);
    case MSG.SELECT_YESNO:
      return P(`${title(desc(p.description))}<div class="row"><button class="primary" ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SELECT_YESNO, yes: true })}'>Oui</button><button ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SELECT_YESNO, yes: false })}'>Non</button></div>`);
    case MSG.SELECT_OPTION:
      return P(`${title("Choisis une option")}<div class="menu">${p.options.map((o, i) => `<button ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SELECT_OPTION, index: i })}'>${esc(desc(o))}</button>`).join("")}</div>`);
    case MSG.SELECT_CHAIN:
      return P(`${title(p.forced ? "Tu dois activer un effet" : "Chaîner ?")}<p class="muted small" style="margin:0">Clique sur une carte pour l'activer en réponse.</p>
        ${choiceGrid(p.selects)}<div class="menu">${p.selects.map((c, i) => `<button ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SELECT_CHAIN, index: i })}'>${esc(cname(c.code))} : ${esc(desc(c.description))}</button>`).join("")}</div>
        ${p.forced ? "" : `<button class="primary" ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SELECT_CHAIN, index: null })}'>Ne pas chaîner</button>`}`);
    case MSG.SELECT_CARD: case MSG.SELECT_TRIBUTE: {
      const n = S.picks.length, ok = n >= p.min && n <= p.max;
      return P(`${title(p.type === MSG.SELECT_TRIBUTE ? `Choisis ${p.min === p.max ? p.min : `${p.min} à ${p.max}`} monstre(s) à Sacrifier` : `Choisis ${p.min === p.max ? p.min : `${p.min} à ${p.max}`} carte(s)`)}
        ${choiceGrid(p.selects, { picked: S.picks })}<div class="row"><button class="primary" ${busy} ${ok ? "" : "disabled"} data-a="confirmcards">Valider (${n})</button>
        ${p.can_cancel ? `<button ${busy} data-a="raw" data-r='${JSON.stringify({ type: p.type === MSG.SELECT_TRIBUTE ? RESP.SELECT_TRIBUTE : RESP.SELECT_CARD, indicies: null })}'>Annuler</button>` : ""}</div>`);
    }
    case MSG.SELECT_UNSELECT_CARD: {
      const all = [...p.select_cards, ...p.unselect_cards];
      return P(`${title(`Choisis des cartes (${p.min} à ${p.max})`)}<p class="muted small" style="margin:0">Les cartes déjà choisies sont entourées : clique dessus pour les retirer.</p>
        ${choiceGrid(all, { marked: p.unselect_cards.map((_, i) => p.select_cards.length + i) })}
        <div class="row">${p.can_finish ? `<button class="primary" ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SELECT_UNSELECT_CARD, index: null })}'>Terminer</button>` : ""}
        ${p.can_cancel && !p.can_finish ? `<button ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SELECT_UNSELECT_CARD, index: null })}'>Annuler</button>` : ""}</div>`);
    }
    case MSG.SELECT_SUM: {
      const must = p.selects_must.reduce((a, c) => a + (c.amount & 0xffff), 0);
      const sum = must + S.picks.reduce((a, i) => a + (p.selects[i].amount & 0xffff), 0);
      return P(`${title(`Choisis des cartes : total ${p.select_max ? "d'au moins" : "de"} ${p.amount}`)}<p class="muted small" style="margin:0">Total actuel : <b>${sum}</b>${must ? ` (dont ${must} imposé)` : ""}</p>
        ${choiceGrid(p.selects, { picked: S.picks })}<button class="primary" ${busy} data-a="confirmsum">Valider</button>`);
    }
    case MSG.SELECT_PLACE: case MSG.SELECT_DISFIELD:
      return P(`${title(p.type === MSG.SELECT_DISFIELD ? `Choisis ${p.count} zone(s) à rendre inutilisable(s)` : `Choisis ${p.count > 1 ? p.count + " zones" : "une zone"}`)}
        <p class="muted small" style="margin:0">Clique sur une zone en surbrillance sur le terrain (${S.picks.length}/${p.count}).</p>
        ${places.length <= p.count ? `<button class="primary" ${busy} data-a="raw" data-r='${JSON.stringify({ type: p.type === MSG.SELECT_PLACE ? RESP.SELECT_PLACE : RESP.SELECT_DISFIELD, places: places.slice(0, p.count) })}'>Zone imposée : valider</button>` : ""}`);
    case MSG.SELECT_POSITION: {
      const opts = [[POS.FUA, "ATK face recto"], [POS.FUD, "DEF face recto"], [POS.FDD, "DEF face verso"], [POS.FDA, "ATK face verso"]].filter(([b]) => p.positions & b);
      return P(`${title(`Position de « ${cname(p.code)} »`)}<div class="row">${opts.map(([b, n]) => `<button ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SELECT_POSITION, position: b })}'>${n}</button>`).join("")}</div>`);
    }
    case MSG.SELECT_COUNTER: {
      const vals = S.picks.length === p.cards.length ? S.picks : p.cards.map(() => 0);
      return P(`${title(`Retire ${p.count} compteur(s)`)}${p.cards.map((c, i) => `<div class="row"><span style="flex:1">${esc(cname(c.code))} (${c.count})</span><input type="number" min="0" max="${c.count}" value="${vals[i]}" data-a="counter" data-i="${i}" style="width:70px"></div>`).join("")}
        <button class="primary" ${busy} data-a="confirmcounter">Valider</button>`);
    }
    case MSG.SORT_CARD: case MSG.SORT_CHAIN:
      return P(`${title("Choisis l'ordre des cartes")}<p class="muted small" style="margin:0">Clique dans l'ordre voulu (${S.picks.length}/${p.cards.length}).</p>
        ${choiceGrid(p.cards, { picked: S.picks })}<div class="row"><button class="primary" ${busy} ${S.picks.length === p.cards.length ? "" : "disabled"} data-a="confirmsort">Valider l'ordre</button>
        <button ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.SORT_CARD, order: null })}'>Ordre par défaut</button></div>`);
    case MSG.ANNOUNCE_RACE: {
      const av = BigInt(p.available);
      return P(`${title(`Déclare ${p.count} Type(s) de monstre`)}<div class="row">${RACES.map((n, i) => (av & (1n << BigInt(i)) ? `<button class="${S.picks.includes(i) ? "on" : ""}" data-a="pickrace" data-i="${i}">${n}</button>` : "")).join("")}</div>
        <button class="primary" ${busy} ${S.picks.length === p.count ? "" : "disabled"} data-a="confirmrace">Valider</button>`);
    }
    case MSG.ANNOUNCE_ATTRIB:
      return P(`${title(`Déclare ${p.count} Attribut(s)`)}<div class="row">${ATTRS.map(([b, n]) => (p.available & b ? `<button class="${S.picks.includes(b) ? "on" : ""}" data-a="pickattr" data-b="${b}">${n}</button>` : "")).join("")}</div>
        <button class="primary" ${busy} ${S.picks.length === p.count ? "" : "disabled"} data-a="confirmattr">Valider</button>`);
    case MSG.ANNOUNCE_NUMBER:
      return P(`${title("Déclare un nombre")}<div class="row">${p.options.map((o, i) => `<button ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.ANNOUNCE_NUMBER, value: i })}'>${Number(o)}</button>`).join("")}</div>`);
    case MSG.ANNOUNCE_CARD: {
      const res = S.announce.length > 1 && INDEX ? INDEX.filter((c) => c.key.includes(norm(S.announce))).slice(0, 30) : [];
      if (!INDEX) loadIndex().then(render);
      return P(`${title("Déclare un nom de carte")}<input id="announce" value="${esc(S.announce)}" placeholder="Nom de la carte">
        <div class="results">${res.map((c) => `<div class="r"><b>${esc(c.name)}</b><button ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.ANNOUNCE_CARD, card: c.code })}'>Déclarer</button></div>`).join("")}</div>`);
    }
    case MSG.ROCK_PAPER_SCISSORS:
      return P(`${title("Pierre, feuille, ciseaux")}<div class="row">${[[2, "Pierre"], [3, "Feuille"], [1, "Ciseaux"]].map(([vv, n]) => `<button ${busy} data-a="raw" data-r='${JSON.stringify({ type: RESP.ROCK_PAPER_SCISSORS, value: vv })}'>${n}</button>`).join("")}</div>`);
  }
  return P(`<h3>Question du moteur (${p.type})</h3><p class="muted small">Cette question n'est pas encore gérée par l'interface.</p>`);
}

function logLine(e, me, pname) {
  const who = (t) => esc(pname(t)), cls = (t) => (t === me ? "me" : "op");
  const nm = (c) => `<b>${esc(cname(c))}</b>`;
  switch (e.type) {
    case MSG.NEW_TURN: return `<div class="e turn">Tour de ${who(e.player)}</div>`;
    case MSG.NEW_PHASE: return `<div class="e">${esc((PHASES.find(([b]) => b === PHASE_OF(e.phase)) || [0, ""])[1])} Phase</div>`;
    case MSG.DRAW: return `<div class="e ${cls(e.player)}">${who(e.player)} pioche ${e.drawn.length} carte${e.drawn.length > 1 ? "s" : ""}${e.drawn.some((c) => c.code) ? " : " + e.drawn.map((c) => nm(c.code)).join(", ") : ""}</div>`;
    case MSG.SUMMONING: return `<div class="e">Invocation Normale : ${nm(e.code)}</div>`;
    case MSG.SPSUMMONING: return `<div class="e">Invocation Spéciale : ${nm(e.code)}</div>`;
    case MSG.FLIPSUMMONING: return `<div class="e">Invocation Flip : ${nm(e.code)}</div>`;
    case MSG.SET: return `<div class="e">${e.code ? nm(e.code) + " est Posée" : "Une carte est Posée"}</div>`;
    case MSG.CHAINING: return `<div class="e ${cls(e.controller)}">Maillon ${e.chain_size} : ${nm(e.code)} s'active</div>`;
    case MSG.CHAIN_NEGATED: case MSG.CHAIN_DISABLED: return `<div class="e">Maillon ${e.chain_size} annulé</div>`;
    case MSG.DAMAGE: return `<div class="e ${cls(e.player)}">${who(e.player)} perd ${e.amount} LP</div>`;
    case MSG.PAY_LPCOST: return `<div class="e ${cls(e.player)}">${who(e.player)} paie ${e.amount} LP</div>`;
    case MSG.RECOVER: return `<div class="e ${cls(e.player)}">${who(e.player)} gagne ${e.amount} LP</div>`;
    case MSG.ATTACK: { const a = F_code(e.card), t = e.target ? F_code(e.target) : null; return `<div class="e ${cls(e.card.controller)}">${a ? nm(a) : "Un monstre"} attaque ${e.target ? (t ? nm(t) : "un monstre face verso") : "directement"}</div>`; }
    case MSG.MOVE: {
      if (e.from.location === e.to.location && e.from.controller === e.to.controller) return "";
      if (e.from.location === LOC.DECK && e.to.location === LOC.HAND && !e.card) return "";
      const what = e.card ? nm(e.card) : "Une carte";
      return `<div class="e">${what} : ${esc(LOCN[e.from.location] || "")} → ${esc(LOCN[e.to.location] || "")}${e.to.controller !== e.from.controller && e.from.location ? ` (${who(e.to.controller)})` : ""}</div>`;
    }
    case MSG.CONFIRM_CARDS: return `<div class="e">Révèle : ${e.cards.map((c) => nm(c.code)).join(", ")}</div>`;
    case MSG.TOSS_COIN: return `<div class="e">Pile ou face : ${e.results.map((r) => (r ? "Face" : "Pile")).join(", ")}</div>`;
    case MSG.TOSS_DICE: return `<div class="e">Dé : ${e.results.join(", ")}</div>`;
    case MSG.WIN: return `<div class="e turn">${e.player < 2 ? who(e.player) + " remporte le duel" : "Égalité"}</div>`;
  }
  return "";
}
// Code d'une carte du terrain désignée par sa position
function F_code(lp) {
  const F = S.view.duel.field[lp.controller];
  const c = lp.location === LOC.MZONE ? F.m[lp.sequence] : lp.location === LOC.SZONE ? F.s[lp.sequence] : null;
  return c && c.code;
}

/* ---------- événements ---------- */
let armedT;
function arm(k) { if (S.armed === k) { S.armed = null; return true; } S.armed = k; render(); clearTimeout(armedT); armedT = setTimeout(() => { S.armed = null; render(); }, 3000); return false; }
const ACT = {
  async create() {
    if (!S.name) return toast("Choisis d'abord un pseudo.");
    try { const r = await api({ action: "create", name: S.name }); store.set("room-" + r.code, r.token); enter(r.code, r.token); } catch (e) { toast(e.message); }
  },
  async join() {
    const code = ($("#jcode").value || "").trim().toUpperCase();
    if (!S.name) return toast("Choisis d'abord un pseudo.");
    if (code.length !== 5) return toast("Le code de salle fait 5 caractères.");
    try { const r = await api({ action: "join", code, name: S.name, token: store.get("room-" + code) }); store.set("room-" + code, r.token); enter(r.code, r.token); } catch (e) { toast(e.message); }
  },
  async joinhere() {
    if (!S.name) return toast("Choisis d'abord un pseudo.");
    try { const r = await api({ action: "join", code: S.code, name: S.name }); store.set("room-" + r.code, r.token); enter(r.code, r.token); } catch (e) { toast(e.message); }
  },
  leave,
  copylink() { const v = $("#rlink").value; navigator.clipboard.writeText(v).then(() => toast("Lien copié"), () => { $("#rlink").select(); toast("Sélectionné : copie-le avec Ctrl+C"); }); },
  pickdeck(el) { S.deckSel = el.dataset.id; store.set("deck-sel", S.deckSel); render(); },
  async ready() {
    const d = allDecks().find((x) => x.id === S.deckSel) || DEMO;
    try { await api({ action: "deck", code: S.code, token: S.token, deck: { name: d.name, main: d.main, extra: d.extra } }); await refresh(true); } catch (e) { toast(e.message); }
  },
  newdeck() { S.editing = { id: "new", name: "Nouveau deck", main: [], extra: [] }; loadIndex().then(render); render(); },
  editdeck(el) { const d = S.decks.find((x) => x.id === el.dataset.id); if (d) { S.editing = JSON.parse(JSON.stringify(d)); [...d.main, ...d.extra].forEach(text); loadIndex().then(render); render(); } },
  canceldeck() { S.editing = null; render(); },
  savedeck() {
    const d = S.editing; d.name = ($("#dname").value || "").trim() || "Deck sans nom";
    if (d.id === "new") { d.id = "d" + Date.now().toString(36); S.decks.push(d); } else S.decks[S.decks.findIndex((x) => x.id === d.id)] = d;
    saveDecks(); S.deckSel = d.id; store.set("deck-sel", d.id); S.editing = null; toast("Deck enregistré"); render();
  },
  deldeck() { if (!arm("del")) return toast("Clique encore pour supprimer ce deck."); S.decks = S.decks.filter((x) => x.id !== S.editing.id); saveDecks(); S.editing = null; S.deckSel = "demo"; render(); },
  addcard(el) {
    const c = +el.dataset.c, t = text(c), d = S.editing;
    if ((deckCounts(d)[c] || 0) >= 3) return toast("3 exemplaires maximum.");
    const isExtra = t ? t.type & EXTRA_T : INDEX && (INDEX.find((x) => x.code === c) || {}).k === "x";
    (isExtra ? d.extra : d.main).push(c); render();
  },
  rmcard(el) { const d = S.editing, part = d[el.dataset.p], i = part.lastIndexOf(+el.dataset.c); if (i > -1) part.splice(i, 1); render(); },
  pasteydk() { importYdk($("#ydktxt").value); },
  cell(el) {
    const p = S.view.duel && S.view.duel.prompt, [c, l, s] = el.dataset.k.split(":").map(Number);
    if (p && (p.type === MSG.SELECT_PLACE || p.type === MSG.SELECT_DISFIELD)) {
      const me = S.view.team === 1 ? 1 : 0;
      if (!placeList(p, me).some((x) => x.player === c && x.location === l && x.sequence === s)) return toast("Choisis une zone en surbrillance.");
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
    if (!list.filter(Boolean).length) return toast(w === "deck" ? `Deck : ${F.deck} cartes` : "Aucune carte.");
    S.pileView = { c, w, l }; showPile(list, c, l, acts);
  },
  doact(el) { const a = (actionsMap(S.view.duel.prompt)[S.focus] || [])[+el.dataset.i]; if (a) send(a.resp); },
  unfocus() { S.focus = null; render(); },
  raw(el) { send(JSON.parse(el.dataset.r)); },
  pickc(el) {
    const p = S.view.duel.prompt, i = +el.dataset.i;
    if (!p) return;
    if (p.type === MSG.SELECT_UNSELECT_CARD) return send({ type: RESP.SELECT_UNSELECT_CARD, index: i });
    if (p.type === MSG.SELECT_CHAIN) return send({ type: RESP.SELECT_CHAIN, index: i });
    if (p.type === MSG.SORT_CARD || p.type === MSG.SORT_CHAIN) { if (!S.picks.includes(i)) S.picks.push(i); return render(); }
    const k = S.picks.indexOf(i);
    if (k > -1) S.picks.splice(k, 1); else if ((p.type !== MSG.SELECT_CARD && p.type !== MSG.SELECT_TRIBUTE) || S.picks.length < p.max) S.picks.push(i);
    if (p.type === MSG.SELECT_CARD && p.min === 1 && p.max === 1 && S.picks.length === 1) return send({ type: RESP.SELECT_CARD, indicies: S.picks });
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
  closepile() { S.pileView = null; $("#pilebox") && $("#pilebox").remove(); },
};
function showPile(list, c, l, acts) {
  const old = $("#pilebox"); if (old) old.remove();
  const box = document.createElement("div");
  box.id = "pilebox"; box.className = "panel"; box.style.cssText = "position:fixed;inset:auto 16px 16px 16px;max-height:70vh;overflow:auto;z-index:40;box-shadow:0 -12px 40px rgba(0,0,0,.6)";
  const title = { [LOC.GRAVE]: "Cimetière", [LOC.REMOVED]: "Cartes bannies", [LOC.EXTRA]: "Extra Deck" }[l];
  box.innerHTML = `<div class="top"><h3>${title} (${list.filter(Boolean).length})</h3><button class="ghost" data-a="closepile">✕</button></div>
    <div class="choices">${list.map((card, s) => (card ? `<div class="choice"><div class="card ${acts[key(c, l, s)] ? "act" : ""}" data-a="pilecard" data-k="${key(c, l, s)}" tabindex="0">${face(card.code)}</div><small>${esc(card.code ? cname(card.code) : "face verso")}</small></div>` : "")).join("")}</div>`;
  document.body.appendChild(box);
}
ACT.pilecard = (el) => { S.focus = el.dataset.k; ACT.closepile(); render(); };

function importYdk(txt) {
  const { main, extra } = parseYdk(txt || "");
  if (!main.length && !extra.length) return toast("Aucune carte trouvée dans ce fichier.");
  S.editing.main = main; S.editing.extra = extra; [...main, ...extra].forEach(text);
  toast(`${main.length} + ${extra.length} cartes importées`); render();
}

document.addEventListener("click", (e) => {
  const cardEl = e.target.closest(".hand .card[data-key], .hand.opp .card");
  if (cardEl && cardEl.dataset.key) { S.focus = cardEl.dataset.key; render(); return; }
  const el = e.target.closest("[data-a]"); if (!el || el.tagName === "FORM" || el.tagName === "INPUT") return;
  const f = ACT[el.dataset.a]; if (f) { e.preventDefault(); f(el); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if ($("#pilebox")) ACT.closepile(); else if (S.focus) ACT.unfocus(); }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[tabindex]")) { e.preventDefault(); e.target.click(); }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (e.target.dataset.a === "chat") { const v = ($("#chatin").value || "").trim(); if (!v) return; $("#chatin").value = ""; try { await api({ action: "chat", code: S.code, token: S.token, text: v }); refresh(); } catch (err) { toast(err.message); } }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "pname") { S.name = e.target.value.trim().slice(0, 24); store.set("name", S.name); }
  if (e.target.id === "dsearch") { S.search = e.target.value; render(); }
  if (e.target.id === "announce") { S.announce = e.target.value; render(); }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "ydk" && e.target.files[0]) { const r = new FileReader(); r.onload = () => importYdk(r.result); r.readAsText(e.target.files[0]); }
});

/* ---------- démarrage ---------- */
fetch("/strings.json").then((r) => r.json()).then((s) => { STR = s; render(); }).catch(() => {});
DEMO.main.concat(DEMO.extra).forEach(text);
const qs = new URLSearchParams(location.search).get("salle");
if (qs) enter(qs.toUpperCase(), store.get("room-" + qs.toUpperCase()));
else render();
