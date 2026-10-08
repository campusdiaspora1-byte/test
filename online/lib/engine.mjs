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

function cards() {
  return (CARDS ||= JSON.parse(readFileSync(path.join(DATA, "cards.json"), "utf8")));
}
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

/**
 * Rejoue une partie.
 * game : { seed: [4 chaînes], decks: [{main, extra}, {main, extra}] (indice = équipe, l'équipe 0 commence), responses: [{team, r}] }
 * extra : une réponse supplémentaire à essayer (refusée si le moteur la rejette).
 * Renvoie { messages, pending, ended, winner, errors, accepted } et le duel encore ouvert dans `close()`.
 */
export async function replay(game, extra = null) {
  lib ||= await createCore({ sync: true });
  const errors = [];
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
  const rand = rng(seed);
  for (const team of [0, 1]) {
    const d = game.decks[team];
    for (const code of shuffled(d.main, rand)) lib.duelNewCard(h, { team, duelist: 0, code, controller: team, location: L.DECK, sequence: 0, position: P.FACEDOWN_DEFENSE });
    for (const code of d.extra) lib.duelNewCard(h, { team, duelist: 0, code, controller: team, location: L.EXTRA, sequence: 0, position: P.FACEDOWN_DEFENSE });
  }
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

/* ---------- ce que voit un joueur ---------- */
const FLAGS = Q.CODE | Q.POSITION | Q.ATTACK | Q.DEFENSE | Q.LEVEL | Q.RANK | Q.LINK | Q.COUNTERS | Q.OVERLAY_CARD | Q.OWNER;
function zone(r, team, loc, viewer) {
  return r.lib.duelQueryLocation(r.h, { flags: FLAGS, controller: team, location: loc }).map((c, seq) => {
    if (!c) return null;
    const hidden = team !== viewer && (loc === L.HAND || loc === L.DECK || (loc === L.EXTRA && !(c.position & P.FACEUP)) || (c.position & FACEDOWN && loc !== L.GRAVE));
    const out = { seq, code: hidden ? 0 : c.code, pos: c.position };
    if (!hidden && (loc === L.MZONE)) Object.assign(out, { atk: c.attack, def: c.defense, level: c.level, rank: c.rank, link: c.link });
    if (c.counters && c.counters.length) out.counters = c.counters;
    if (c.overlay_card && c.overlay_card.length) out.mats = c.overlay_card; // les Matériels Xyz sont publics
    return out;
  });
}
export function fieldFor(r, viewer) {
  const f = r.lib.duelQueryField(r.h);
  return [0, 1].map((team) => ({
    lp: f.players[team].lp,
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
  M.CARD_TARGET, M.ADD_COUNTER, M.REMOVE_COUNTER, M.HINT]);
export function logFor(r, viewer, from = 0) {
  const out = [];
  r.messages.forEach((m, i) => {
    if (i < from || !LOG.has(m.type)) return;
    if (m.type === M.HINT && m.hint_type !== 10 /* HINT_CARD : carte qui s'active */) return;
    let e = { ...m, i };
    if (m.type === M.MOVE) {
      const seen = (m.to.controller === viewer && !(m.to.location & L.DECK)) || ((m.to.location & PUBLIC_LOC) && !(m.to.position & FACEDOWN)) ||
        (m.from.controller === viewer && !(m.from.location & L.DECK) && !(m.from.position & FACEDOWN && m.to.location & L.DECK)) ||
        ((m.from.location & PUBLIC_LOC) && !(m.from.position & FACEDOWN));
      if (!seen) e.card = 0;
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
    chain: (f.chain || []).map((c) => visibleCard({ ...c, ...(c.triggering_card || {}) }, viewer)),
    waitingFor: r.pending ? r.pending.player : null,
    prompt, hint, ended: r.ended, winner: r.winner,
    log: logFor(r, viewer, from), logEnd: r.messages.length,
  };
}
