// Moteur de duel : ocgcore (le cœur d'EDOPro, compilé en WebAssembly).
//
// Une partie n'est jamais gardée en mémoire : elle est décrite par { seed, decks, first, responses } et rejouée à
// chaque requête (le moteur est déterministe). C'est ce qui permet de tourner sur des fonctions Vercel sans état.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import createCore, { OcgDuelMode, OcgLocation as L, OcgPosition as P, OcgMessageType as M, OcgProcessResult, OcgQueryFlags as Q } from "ocgcore-wasm";

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
let CARDS = null, lib = null;
const SCRIPTS = new Map();
// Couche de compatibilité entre le cœur et les scripts récents (voir lib/lua/compat.lua)
const COMPAT = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "lua", "compat.lua"), "utf8");

function cards() {
  return (CARDS ||= JSON.parse(readFileSync(path.join(DATA, "cards.json"), "utf8")));
}
// Pour le validateur : les cartes et scripts d'un pack, lus directement dans son dossier (sans relancer la préparation des données)
export function useLocal(rows, scripts) {
  Object.assign(cards(), rows);
  for (const [name, src] of Object.entries(scripts)) SCRIPTS.set(name, src);
}
export const allCodes = () => Object.keys(cards()).map(Number);
export function cardExists(code) { return !!cards()[code]; }
export function cardInfo(code) {
  const c = cards()[code];
  if (!c) return null;
  const [alias, setcodes, type, level, attribute, race, attack, defense, lscale, rscale, link_marker] = c;
  return { code: +code, alias, setcodes, type, level, attribute, race: BigInt(race), attack, defense, lscale, rscale, link_marker };
}
function script(name) {
  if (SCRIPTS.has(name)) return SCRIPTS.get(name);
  const f = path.join(DATA, "scripts", path.basename(name));
  const src = existsSync(f) ? readFileSync(f, "utf8") : /^c\d+\.lua$/.test(name) ? "" : null; // monstres Normaux : pas de script
  SCRIPTS.set(name, src);
  return src;
}

const PUBLIC_LOC = L.GRAVE | L.REMOVED | L.MZONE | L.SZONE | L.OVERLAY;
const FACEDOWN = P.FACEDOWN_ATTACK | P.FACEDOWN_DEFENSE;
// Les questions qui attendent une réponse d'un joueur
export const PROMPTS = new Set([M.SELECT_BATTLECMD, M.SELECT_IDLECMD, M.SELECT_EFFECTYN, M.SELECT_YESNO, M.SELECT_OPTION, M.SELECT_CARD, M.SELECT_CHAIN,
  M.SELECT_PLACE, M.SELECT_POSITION, M.SELECT_TRIBUTE, M.SORT_CHAIN, M.SELECT_COUNTER, M.SELECT_SUM, M.SELECT_DISFIELD, M.SORT_CARD, M.SELECT_UNSELECT_CARD,
  M.ANNOUNCE_RACE, M.ANNOUNCE_ATTRIB, M.ANNOUNCE_CARD, M.ANNOUNCE_NUMBER, M.ROCK_PAPER_SCISSORS]);

// Petit générateur pseudo-aléatoire déterministe (mélange initial des Decks)
function rng(seed) {
  let s = BigInt.asUintN(64, seed[0] ^ (seed[1] << 1n) ^ 0x9e3779b97f4a7c15n);
  return () => { s = BigInt.asUintN(64, s * 6364136223846793005n + 1442695040888963407n); return Number(s >> 33n) / 2 ** 31; };
}
const shuffled = (list, rand) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Les réponses sont stockées en JSON : les Types de monstre annoncés redeviennent des BigInt pour le moteur
const revive = (r) => (r && Array.isArray(r.races) ? { ...r, races: r.races.map((x) => BigInt(x)) } : r);
// JSON des messages du moteur (descriptions d'effet et indices en BigInt)
export const toJSON = (x) => JSON.stringify(x, (k, v) => (typeof v === "bigint" ? Number(v) : v));

async function newDuel(game, errors) {
  lib ||= await createCore({ sync: true });
  const seed = game.seed.map((s) => BigInt(s));
  const h = lib.createDuel({
    flags: OcgDuelMode.MODE_MR5,
    seed,
    team1: { drawCountPerTurn: 1, startingDrawCount: 5, startingLP: 8000 },
    team2: { drawCountPerTurn: 1, startingDrawCount: 5, startingLP: 8000 },
    cardReader: (code) => cardInfo(code),
    scriptReader: (name) => { const s = script(name); if (s == null) errors.push("script introuvable : " + name); return s; },
    errorHandler: (type, text) => { if (!/not found/.test(text)) errors.push(text); },
  });
  if (!h) throw new Error("création du duel impossible");
  lib.loadScript(h, "constant.lua", script("constant.lua"));
  lib.loadScript(h, "utility.lua", script("utility.lua"));
  lib.loadScript(h, "compat.lua", COMPAT);
  const rand = rng(seed);
  for (const team of [0, 1]) {
    const d = game.decks[team];
    for (const code of shuffled(d.main, rand)) lib.duelNewCard(h, { team, duelist: 0, code, controller: team, location: L.DECK, sequence: 0, position: P.FACEDOWN_DEFENSE });
    for (const code of d.extra) lib.duelNewCard(h, { team, duelist: 0, code, controller: team, location: L.EXTRA, sequence: 0, position: P.FACEDOWN_DEFENSE });
  }
  return h;
}

/**
 * Rejoue une partie.
 * game : { seed: [4 chaînes], decks: [{main, extra}, {main, extra}] (indice = équipe, l'équipe 0 commence), responses: [{team, r}] }
 * extra : une réponse supplémentaire à essayer (refusée si le moteur la rejette).
 * Renvoie { messages, pending, ended, winner, errors, accepted } et le duel encore ouvert dans `close()`.
 */
export async function replay(game, extra = null) {
  const errors = [];
  const h = await newDuel(game, errors);
  lib.startDuel(h);

  const messages = [];
  const queue = [...game.responses];
  if (extra) queue.push(extra);
  let pending = null, ended = false, winner = null, sentExtra = false, rejected = false;
  for (let guard = 0; guard < 100000 && !rejected; guard++) {
    const st = lib.duelProcess(h);
    for (const m of lib.duelGetMessage(h)) {
      if (m.type === M.RETRY) { // réponse refusée par le moteur
        if (sentExtra) { rejected = true; break; }
        lib.destroyDuel(h);
        throw new Error("partie corrompue : réponse refusée pendant la relecture");
      }
      messages.push(m);
      if (PROMPTS.has(m.type)) pending = m;
      if (m.type === M.WIN) { ended = true; winner = m.player; }
    }
    if (rejected) break;
    if (st === OcgProcessResult.END || ended) { ended = true; pending = null; break; }
    if (st === OcgProcessResult.CONTINUE) continue;
    if (sentExtra) sentExtra = false; // la réponse en plus a été acceptée : le moteur pose la question suivante
    if (!queue.length) break;
    const next = queue.shift();
    if (!pending || pending.player !== next.team) { lib.destroyDuel(h); throw new Error("ce n'est pas à ce joueur de répondre"); }
    if (next === extra) sentExtra = true;
    lib.duelSetResponse(h, revive(next.r));
  }
  const accepted = !extra || !rejected;
  if (!accepted) { lib.destroyDuel(h); return { accepted: false, errors }; }
  return { h, lib, messages, pending, ended, winner, errors, accepted, close: () => lib.destroyDuel(h) };
}

/**
 * Continue une partie ouverte par replay() avec une réponse de plus, sans tout rejouer (tour du bot, passes automatiques).
 * Renvoie false si le moteur refuse la réponse : la question en cours reste posée.
 */
export function advance(r, response) {
  const { lib: core, h } = r;
  core.duelSetResponse(h, revive(response));
  for (let guard = 0; guard < 100000; guard++) {
    const st = core.duelProcess(h);
    for (const m of core.duelGetMessage(h)) {
      if (m.type === M.RETRY) return false;
      r.messages.push(m);
      if (PROMPTS.has(m.type)) r.pending = m;
      if (m.type === M.WIN) { r.ended = true; r.winner = m.player; }
    }
    if (st === OcgProcessResult.END || r.ended) { r.ended = true; r.pending = null; return true; }
    if (st !== OcgProcessResult.CONTINUE) return true;
  }
  return true;
}

/**
 * Pour le validateur de packs : charge une carte seule (son script et son initial_effect) et renvoie les erreurs Lua.
 */
export async function loadErrors(code) {
  const errors = [];
  const h = await newDuel({ seed: ["1", "2", "3", "4"], decks: [{ main: [code], extra: [] }, { main: [], extra: [] }] }, errors);
  lib.destroyDuel(h);
  return errors;
}

/**
 * Pour le validateur de packs : joue une partie d'un trait (sans relecture), en demandant chaque réponse à answer(message, étape).
 * Une réponse refusée par le moteur est remplacée par la réponse de secours fallback(message) si elle existe.
 * Renvoie { steps, ended, winner, errors (avec l'étape), messages, refused }.
 */
export async function autoDuel(game, answer, { steps = 300, fallback = null } = {}) {
  const errors = [], log = [], messages = [];
  const h = await newDuel(game, errors);
  lib.startDuel(h);
  let pending = null, ended = false, winner = null, n = 0, refused = 0, retried = false;
  const note = () => { while (log.length < errors.length) log.push({ step: n, text: errors[log.length] }); };
  for (let guard = 0; guard < 200000 && n < steps; guard++) {
    let st, retry = false;
    try { st = lib.duelProcess(h); } catch (e) { errors.push("le moteur s'est arrêté : " + e.message); note(); break; }
    for (const m of lib.duelGetMessage(h)) {
      if (m.type === M.RETRY) { retry = true; continue; }
      messages.push(m);
      if (PROMPTS.has(m.type)) pending = m;
      if (m.type === M.WIN) { ended = true; winner = m.player; }
    }
    note();
    if (st === OcgProcessResult.END || ended) { ended = true; break; }
    if (st === OcgProcessResult.CONTINUE) continue;
    if (!pending) break;
    let r;
    if (retry) { refused++; r = !retried && fallback ? fallback(pending) : null; retried = true; if (!r) break; }
    else { retried = false; r = answer(pending, n++); }
    lib.duelSetResponse(h, revive(r));
  }
  lib.destroyDuel(h);
  return { steps: n, ended, winner, errors: log, messages, refused };
}

/* ---------- ce que voit un joueur ---------- */
// Effets actifs affichés sur les cartes (EFFECT_FLAG_CLIENT_HINT, comme les icônes d'EDOPro) : « Ne peut pas être détruit au combat »…
// Le moteur les envoie par CARD_HINT (6 : ajout, 7 : retrait) ; ils disparaissent quand la carte quitte sa zone.
function cardHints(r) {
  if (r._hints && r._hints.n === r.messages.length) return r._hints.map;
  const map = new Map(), key = (c) => `${c.controller}:${c.location}:${c.sequence}`;
  for (const m of r.messages) {
    if (m.type === M.MOVE) { map.delete(key(m.from)); map.delete(key(m.to)); }
    else if (m.type === M.CARD_HINT && (m.card_hint === 6 || m.card_hint === 7) && m.location & (L.MZONE | L.SZONE)) {
      const k = key(m), list = map.get(k) || [], d = Number(m.description);
      if (m.card_hint === 6) { if (!list.includes(d)) list.push(d); } else list.splice(list.indexOf(d) >>> 0, list.includes(d) ? 1 : 0);
      list.length ? map.set(k, list) : map.delete(k);
    }
  }
  r._hints = { n: r.messages.length, map };
  return map;
}
const FLAGS = Q.CODE | Q.POSITION | Q.ATTACK | Q.DEFENSE | Q.LEVEL | Q.RANK | Q.LINK | Q.COUNTERS | Q.OVERLAY_CARD | Q.OWNER;
function zone(r, team, loc, viewer) {
  return r.lib.duelQueryLocation(r.h, { flags: FLAGS, controller: team, location: loc }).map((c, seq) => {
    if (!c) return null;
    const hidden = team !== viewer && (loc === L.HAND || loc === L.DECK || (loc === L.EXTRA && !(c.position & P.FACEUP)) || (c.position & FACEDOWN && loc !== L.GRAVE));
    const out = { seq, code: hidden ? 0 : c.code, pos: c.position };
    if (!hidden && (loc === L.MZONE)) Object.assign(out, { atk: c.attack, def: c.defense, level: c.level, rank: c.rank, link: c.link });
    if (c.counters && c.counters.length) out.counters = c.counters;
    if (c.overlay_card && c.overlay_card.length) out.mats = c.overlay_card; // les Matériels Xyz sont publics
    if (!hidden && loc & (L.MZONE | L.SZONE)) { const h = cardHints(r).get(`${team}:${loc}:${seq}`); if (h) out.hints = h; }
    return out;
  });
}
export function fieldFor(r, viewer) {
  const f = r.lib.duelQueryField(r.h);
  return [0, 1].map((team) => ({
    lp: Math.max(0, f.players[team].lp | 0), // le moteur renvoie un entier non signé : sous 0, il « déborde »
    hand: zone(r, team, L.HAND, viewer),
    deck: f.players[team].deck_size ?? r.lib.duelQueryCount(r.h, team, L.DECK),
    extra: team === viewer ? zone(r, team, L.EXTRA, viewer) : zone(r, team, L.EXTRA, viewer).map((c) => (c && c.code ? c : null)).filter(Boolean),
    extraCount: r.lib.duelQueryCount(r.h, team, L.EXTRA),
    m: zone(r, team, L.MZONE, viewer),
    s: zone(r, team, L.SZONE, viewer),
    gy: zone(r, team, L.GRAVE, viewer),
    ban: zone(r, team, L.REMOVED, viewer),
  }));
}

// Une carte d'une question n'est visible que si elle est à soi ou face recto sur le terrain / dans un lieu public
function visibleCard(c, viewer) {
  if (!c || c.code == null) return c;
  if (c.controller === viewer) return c;
  if (c.location & (L.HAND | L.DECK)) return { ...c, code: 0 };
  if ((c.location & (L.MZONE | L.SZONE)) && c.position != null && c.position & FACEDOWN) return { ...c, code: 0 };
  return c;
}
export function promptFor(r, viewer) {
  const p = r.pending;
  if (!p || p.player !== viewer) return null;
  const out = { ...p };
  for (const k of Object.keys(out)) if (Array.isArray(out[k])) out[k] = out[k].map((x) => (x && typeof x === "object" && "code" in x ? visibleCard(x, viewer) : x));
  delete out.__extra;
  return out;
}

// Journal : les événements, avec les cartes cachées masquées pour ce joueur
const LOG = new Set([M.NEW_TURN, M.NEW_PHASE, M.MOVE, M.SUMMONING, M.SPSUMMONING, M.FLIPSUMMONING, M.SET, M.CHAINING, M.CHAIN_SOLVED, M.CHAIN_NEGATED, M.CHAIN_DISABLED,
  M.DAMAGE, M.RECOVER, M.PAY_LPCOST, M.ATTACK, M.BATTLE, M.DRAW, M.WIN, M.CONFIRM_CARDS, M.TOSS_COIN, M.TOSS_DICE, M.POS_CHANGE, M.SHUFFLE_DECK, M.EQUIP,
  M.CARD_TARGET, M.ADD_COUNTER, M.REMOVE_COUNTER, M.HINT, M.CARD_HINT]);
// Le journal est enrichi pendant la lecture des messages, pour qu'il explique ce qui se passe :
//  · quelle carte occupe chaque zone (le nom d'un attaquant reste connu même s'il a quitté le terrain depuis)
//  · quel maillon de chaîne se résout (« détruit par l'effet de … »)
//  · la raison de chaque déplacement (REASON_*, lue par scripts/patch-ocgcore.mjs)
export function logFor(r, viewer, from = 0) {
  const out = [], zones = new Map(), chain = [], hints = new Map();
  const zk = (c) => `${c.controller}:${c.location}:${c.sequence}`;
  const shown = (c, code) => (c && !(c.position & FACEDOWN) ? code : c && c.controller === viewer ? code : 0);
  let solving = null;
  r.messages.forEach((m, i) => {
    // suivi de l'état, même avant `from`
    if (m.type === M.MOVE) {
      hints.delete(zk(m.from)); hints.delete(zk(m.to));
      if (m.from.location & (L.MZONE | L.SZONE)) zones.delete(zk(m.from));
      if (m.to.location & (L.MZONE | L.SZONE)) zones.set(zk(m.to), { code: m.card, pos: m.to.position });
    }
    if (m.type === M.SUMMONING || m.type === M.SPSUMMONING || m.type === M.FLIPSUMMONING || m.type === M.POS_CHANGE) zones.set(zk(m), { code: m.code, pos: m.position });
    if (m.type === M.CARD_HINT && (m.card_hint === 6 || m.card_hint === 7)) {
      const k = zk(m), list = hints.get(k) || [], d = Number(m.description);
      if (m.card_hint === 6) { if (!list.includes(d)) list.push(d); } else if (list.includes(d)) list.splice(list.indexOf(d), 1);
      hints.set(k, list);
    }
    if (m.type === M.CHAINING) chain[m.chain_size] = { code: m.code, controller: m.controller };
    if (m.type === M.CHAIN_SOLVING) solving = chain[m.chain_size] || null;
    if (m.type === M.CHAIN_SOLVED) solving = null;
    if (m.type === M.CHAIN_END) { chain.length = 0; solving = null; }
    if (i < from || !LOG.has(m.type)) return;
    if (m.type === M.HINT && m.hint_type !== 10 /* HINT_CARD : carte qui s'active */) return;
    if (m.type === M.CARD_HINT && (m.card_hint !== 6 || !(m.location & (L.MZONE | L.SZONE)))) return; // seulement les effets ajoutés sur le terrain
    let e = { ...m, i };
    if (m.type === M.CARD_HINT) { const z = zones.get(zk(m)); e.code = z ? shown({ ...m, position: z.pos }, z.code) : 0; if (solving) e.by = solving.code; }
    if (m.type === M.MOVE) {
      const seen = (m.to.controller === viewer && !(m.to.location & L.DECK)) || ((m.to.location & PUBLIC_LOC) && !(m.to.position & FACEDOWN)) ||
        (m.from.controller === viewer && !(m.from.location & L.DECK) && !(m.from.position & FACEDOWN && m.to.location & L.DECK)) ||
        ((m.from.location & PUBLIC_LOC) && !(m.from.position & FACEDOWN));
      if (!seen) e.card = 0;
      if (solving && (m.reason ?? 0x40) & 0x40) e.by = solving.code; // pendant la résolution d'un effet
    }
    if (m.type === M.ATTACK) {
      const a = zones.get(zk(m.card)), t = m.target && zones.get(zk(m.target));
      e.code = a ? a.code : 0;
      e.tcode = t ? shown({ ...m.target, position: t.pos }, t.code) : 0;
    }
    if (m.type === M.BATTLE) {
      if (m.target && !m.target.location) e.target = null; // attaque directe : le moteur envoie une cible vide
      const a = zones.get(zk(m.card)), t = e.target && zones.get(zk(m.target));
      e.code = a ? a.code : 0; e.tcode = t ? t.code : 0;
      e.ahints = hints.get(zk(m.card)) || []; e.thints = e.target ? hints.get(zk(m.target)) || [] : [];
    }
    if (m.type === M.DRAW && m.player !== viewer) e.drawn = m.drawn.map(() => ({ code: 0 }));
    if (m.type === M.SET) e.code = m.card && m.card.controller === viewer ? m.code : 0;
    if (m.type === M.SET && m.card) e.card = visibleCard(m.card, viewer);
    out.push(e);
  });
  return out;
}

export { L, P, M };

/** Tout ce qu'un joueur a le droit de voir : terrain, chaîne en cours, question qui l'attend, journal depuis `from`. */
export function viewFor(r, viewer, from = 0) {
  const f = r.lib.duelQueryField(r.h);
  const prompt = promptFor(r, viewer);
  let hint = null;
  if (prompt) for (let i = r.messages.length - 1; i >= 0; i--) {
    const m = r.messages[i];
    if (PROMPTS.has(m.type)) break;
    if (m.type === M.HINT && m.player === viewer && m.hint_type === 3) { hint = m.hint; break; }
  }
  return {
    field: fieldFor(r, viewer),
    chain: (f.chain || []).map((c) => ({ code: c.code, controller: c.controller, location: c.location, sequence: c.sequence })), // une carte activée est publique
    waitingFor: r.pending ? r.pending.player : null,
    prompt, hint, ended: r.ended, winner: r.winner,
    log: logFor(r, viewer, from), logEnd: r.messages.length,
  };
}
