// Banc de test des scripts Hueco Mundo sur le vrai moteur EDOPro (ocgcore-wasm).
// Les scripts officiels viennent de ProjectIgnis/CardScripts : CARDSCRIPTS=/chemin/vers/CardScripts
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import createCore, { OcgDuelMode, OcgLocation as L, OcgPosition as P, OcgMessageType as M, OcgResponseType as R, OcgProcessResult, OcgQueryFlags as Q } from "ocgcore-wasm";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUR = path.join(HERE, "..", "script");
const CS = process.env.CARDSCRIPTS || path.join(HERE, "CardScripts");
const OURS = Object.fromEntries(JSON.parse(readFileSync(path.join(HERE, "cards.json"), "utf8")).map((c) => [c.code, c]));
const OFFICIAL = existsSync(path.join(HERE, "official.json")) ? Object.fromEntries(JSON.parse(readFileSync(path.join(HERE, "official.json"), "utf8")).map((c) => [c.code, c])) : {};
const NAMES = Object.fromEntries([...Object.values(OURS), ...Object.values(OFFICIAL)].map((c) => [c.code, c.name]));
export const name = (code) => NAMES[code] || String(code);
export { L, P, M };

let lib;
export async function core() { return (lib ||= await createCore({ sync: true })); }

/**
 * Crée un duel.
 * setup: { 0: { hand:[codes], deck:[codes], extra:[codes], grave:[codes], banished:[codes], mzone:[[code,seq,pos]], szone:[[code,seq,pos]], fzone: code }, 1: {...} }
 */
export async function duel(setup, { seed = 7n, lp = 8000 } = {}) {
  const lib = await core();
  const errors = [];
  const handle = lib.createDuel({
    flags: OcgDuelMode.MODE_MR5,
    seed: [seed, 2n, 3n, 4n],
    team1: { drawCountPerTurn: 1, startingDrawCount: 0, startingLP: lp },
    team2: { drawCountPerTurn: 1, startingDrawCount: 0, startingLP: lp },
    cardReader: (code) => { const c = OURS[code] || OFFICIAL[code]; return c ? { ...c, race: BigInt(c.race) } : null; },
    scriptReader: (s) => {
      const our = path.join(OUR, s), off = path.join(CS, "official", s), util = path.join(CS, s), unoff = path.join(CS, "unofficial", s);
      for (const f of [our, off, util, unoff]) if (existsSync(f)) return readFileSync(f, "utf8");
      if (/^c\d+\.lua$/.test(s)) return ""; // monstres Normaux : pas de script
      errors.push("script introuvable : " + s); return null;
    },
    errorHandler: (type, text) => { if (!/not found/.test(text)) errors.push(text); },
  });
  if (!handle) throw new Error("création du duel impossible");
  for (const f of ["constant.lua", "utility.lua"]) lib.loadScript(handle, f, readFileSync(path.join(CS, f), "utf8"));
  const add = (team, code, location, sequence = 0, position = P.FACEUP_ATTACK) =>
    lib.duelNewCard(handle, { team, duelist: 0, code, controller: team, location, sequence, position });
  for (const team of [0, 1]) {
    const s = setup[team] || {};
    // le Deck : chaque carte ajoutée « en dessous » (sequence 1) pour garder l'ordre donné, la 1re carte = dessus
    for (const c of [...(s.deck || [])].reverse()) add(team, c, L.DECK, 0, P.FACEDOWN_DEFENSE);
    for (const c of s.hand || []) add(team, c, L.HAND, 0, P.FACEDOWN_DEFENSE);
    for (const c of s.extra || []) add(team, c, L.EXTRA, 0, P.FACEDOWN_DEFENSE);
    for (const c of s.grave || []) add(team, c, L.GRAVE, 0, P.FACEUP_ATTACK);
    for (const c of s.banished || []) add(team, c, L.REMOVED, 0, P.FACEUP_ATTACK);
    for (const [c, seq, pos] of s.mzone || []) add(team, c, L.MZONE, seq, pos ?? P.FACEUP_ATTACK);
    for (const [c, seq, pos] of s.szone || []) add(team, c, L.SZONE, seq, pos ?? P.FACEDOWN_DEFENSE);
    if (s.fzone) add(team, s.fzone, L.SZONE, 5, P.FACEUP_ATTACK);
  }
  return new Duel(lib, handle, errors);
}

const LOCN = { [L.DECK]: "Deck", [L.HAND]: "main", [L.MZONE]: "Zone Monstre", [L.SZONE]: "Zone M/P", [L.GRAVE]: "Cimetière", [L.REMOVED]: "bannie", [L.EXTRA]: "Extra", [L.OVERLAY]: "Matériel" };

class Duel {
  constructor(lib, handle, errors) { this.lib = lib; this.h = handle; this.errors = errors; this.log = []; this.plan = []; this.msgs = []; this.ended = false; this.turn = 0; this.lastIdle = null; }
  /** steps() ajoute des décisions : fonctions (msg) => réponse | undefined, consommées dans l'ordre. */
  steps(...steps) { this.plan.push(...steps); return this; }
  async start() { this.lib.startDuel(this.h); return this; }
  /** Fait avancer le duel jusqu'à ce que `until(this)` soit vrai, ou jusqu'à `maxTurns`. */
  run({ until = () => false, maxTurns = 3, maxSteps = 4000 } = {}) {
    for (let i = 0; i < maxSteps && !this.ended; i++) {
      // Reprise après un `until` : le moteur attend encore la réponse au dernier message
      if (this.waiting) { this.waiting = false; this.respond(); }
      const st = this.lib.duelProcess(this.h);
      for (const m of this.lib.duelGetMessage(this.h)) this.note(m);
      if (st === OcgProcessResult.END) { this.ended = true; break; }
      if (st === OcgProcessResult.CONTINUE) continue;
      if (until(this) || this.turn > maxTurns) { this.waiting = true; return this; }
      this.respond();
    }
    return this;
  }
  respond() {
    const msg = this.pending;
    let res;
    if (this.plan.length) { res = this.plan[0](msg, this); if (res !== undefined) this.plan.shift(); }
    if (res === undefined) res = this.auto(msg);
    this.lib.duelSetResponse(this.h, res);
  }
  note(m) {
    this.msgs.push(m);
    const t = m.type;
    if (t === M.NEW_TURN) { this.turn++; this.log.push(`— Tour ${this.turn} (joueur ${m.player})`); }
    else if (t === M.RETRY) { this.errors.push("RETRY : réponse refusée par le moteur"); this.ended = true; }
    else if (t === M.MOVE) this.log.push(`${name(m.card)} : ${LOCN[m.from.location] || m.from.location} → ${LOCN[m.to.location] || m.to.location}`);
    else if (t === M.CHAINING) this.log.push(`Active ${name(m.code)}`);
    else if (t === M.SPSUMMONED || t === M.SUMMONED) this.log.push("(invocation réussie)");
    else if (t === M.DAMAGE) this.log.push(`Joueur ${m.player} perd ${m.amount} LP`);
    else if (t === M.WIN) { this.log.push(`Victoire du joueur ${m.player}`); this.ended = true; }
    if ([M.SELECT_IDLECMD, M.SELECT_BATTLECMD, M.SELECT_CHAIN, M.SELECT_CARD, M.SELECT_EFFECTYN, M.SELECT_YESNO, M.SELECT_OPTION, M.SELECT_PLACE, M.SELECT_POSITION,
      M.SELECT_TRIBUTE, M.SELECT_SUM, M.SELECT_UNSELECT_CARD, M.SELECT_COUNTER, M.SORT_CARD, M.SORT_CHAIN, M.ANNOUNCE_RACE, M.ANNOUNCE_ATTRIB, M.ANNOUNCE_NUMBER, M.ANNOUNCE_CARD, M.SELECT_DISFIELD, M.ROCK_PAPER_SCISSORS].includes(t)) this.pending = m;
    if (t === M.SELECT_IDLECMD) this.lastIdle = m;
  }
  auto(m) {
    switch (m.type) {
      case M.SELECT_IDLECMD: return { type: R.SELECT_IDLECMD, action: m.to_ep ? 7 : 6, index: null };
      case M.SELECT_BATTLECMD: return { type: R.SELECT_BATTLECMD, action: m.to_m2 ? 2 : 3, index: null };
      case M.SELECT_CHAIN: return { type: R.SELECT_CHAIN, index: m.forced ? 0 : null };
      case M.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: true };
      case M.SELECT_YESNO: return { type: R.SELECT_YESNO, yes: true };
      case M.SELECT_OPTION: return { type: R.SELECT_OPTION, index: 0 };
      case M.SELECT_CARD: return { type: R.SELECT_CARD, indicies: [...Array(Math.max(1, m.min)).keys()] };
      case M.SELECT_TRIBUTE: return { type: R.SELECT_TRIBUTE, indicies: [...Array(Math.max(1, m.min)).keys()] };
      case M.SELECT_UNSELECT_CARD: return { type: R.SELECT_UNSELECT_CARD, index: m.can_finish || !m.select_cards.length ? null : 0 };
      case M.SELECT_POSITION: return { type: R.SELECT_POSITION, position: [1, 2, 4, 8].find((b) => m.positions & b) };
      case M.SELECT_PLACE: case M.SELECT_DISFIELD: return { type: m.type === M.SELECT_PLACE ? R.SELECT_PLACE : R.SELECT_DISFIELD, places: freePlaces(m) };
      case M.SELECT_SUM: return { type: R.SELECT_SUM, indicies: sumPick(m) };
      case M.SELECT_COUNTER: return { type: R.SELECT_COUNTER, counters: m.cards.map((c, i) => (i === 0 ? m.count : 0)) };
      case M.SORT_CARD: case M.SORT_CHAIN: return { type: R.SORT_CARD, order: null };
      case M.ANNOUNCE_RACE: { const out = []; for (let b = 1n; out.length < m.count; b <<= 1n) if (BigInt(m.available) & b) out.push(b); return { type: R.ANNOUNCE_RACE, races: out }; }
      case M.ANNOUNCE_ATTRIB: return { type: R.ANNOUNCE_ATTRIB, attributes: [1] };
      case M.ANNOUNCE_NUMBER: return { type: R.ANNOUNCE_NUMBER, value: 0 };
      case M.ROCK_PAPER_SCISSORS: return { type: R.ROCK_PAPER_SCISSORS, value: 1 };
      default: throw new Error("message sans réponse automatique : " + m.type);
    }
  }
  /** Cartes d'un joueur à un emplacement : [{code, seq, pos, atk, def, level, counters, overlay}] */
  cards(team, location) {
    return this.lib.duelQueryLocation(this.h, { flags: Q.CODE | Q.POSITION | Q.ATTACK | Q.DEFENSE | Q.LEVEL | Q.RACE | Q.COUNTERS | Q.OVERLAY_CARD | Q.STATUS, controller: team, location })
      .map((c, seq) => (c ? { ...c, seq, name: name(c.code) } : null));
  }
  codes(team, location) { return this.cards(team, location).filter(Boolean).map((c) => c.code); }
  has(team, location, code) { return this.codes(team, location).includes(code); }
  lp(team) { return this.lib.duelQueryField(this.h).players[team].lp ?? null; }
  dump() { return this.log.join("\n"); }
}
function freePlaces(m) {
  const out = [];
  for (const [base, loc, n] of [[0, L.MZONE, 7], [8, L.SZONE, 8], [16, L.MZONE, 7], [24, L.SZONE, 8]]) {
    for (let i = 0; i < n && out.length < m.count; i++) if (!(m.field_mask & (1 << (base + i)))) out.push({ player: base < 16 ? m.player : 1 - m.player, location: loc, sequence: i });
    if (out.length >= m.count) break;
  }
  return out;
}
function sumPick(m) {
  const must = m.selects_must.reduce((a, c) => a + (c.amount & 0xffff), 0), n = m.selects.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    let s = must, k = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { s += m.selects[i].amount & 0xffff; k++; }
    if (s === m.amount) return [...Array(n).keys()].filter((i) => mask & (1 << i));
  }
  return [0];
}

/* ---------- décisions utiles pour les tests ---------- */
const at = (c, code) => c.code === code;
export const idle = (action, code, pick = 0) => (m) => {
  if (m.type !== M.SELECT_IDLECMD) return;
  const list = { summon: m.summons, spsummon: m.special_summons, mset: m.monster_sets, sset: m.spell_sets, activate: m.activates, repos: m.pos_changes }[action];
  const i = list.findIndex((c) => at(c, code));
  if (i < 0) throw new Error(`${action} impossible : ${name(code)} (proposés : ${list.map((c) => name(c.code)).join(", ") || "aucun"})`);
  return { type: R.SELECT_IDLECMD, action: { summon: 0, spsummon: 1, repos: 2, mset: 3, sset: 4, activate: 5 }[action], index: i + pick };
};
export const activateNth = (code, n) => (m) => {
  if (m.type !== M.SELECT_IDLECMD) return;
  const idx = m.activates.map((c, i) => [c, i]).filter(([c]) => at(c, code));
  if (!idx[n]) throw new Error(`activation n°${n} impossible : ${name(code)}`);
  return { type: R.SELECT_IDLECMD, action: 5, index: idx[n][1] };
};
export const toBattle = () => (m) => (m.type === M.SELECT_IDLECMD ? { type: R.SELECT_IDLECMD, action: 6, index: null } : undefined);
export const attack = (code, target = 0) => (m) => {
  if (m.type === M.SELECT_BATTLECMD) { const i = m.attacks.findIndex((c) => at(c, code)); if (i < 0) throw new Error("attaque impossible : " + name(code)); return { type: R.SELECT_BATTLECMD, action: 1, index: i }; }
};
export const chain = (code) => (m) => {
  if (m.type !== M.SELECT_CHAIN && m.type !== M.SELECT_BATTLECMD && m.type !== M.SELECT_IDLECMD) return;
  if (m.type === M.SELECT_CHAIN) { const i = m.selects.findIndex((c) => at(c, code)); return i < 0 ? undefined : { type: R.SELECT_CHAIN, index: i }; }
};
export const pick = (...codes) => (m) => {
  if (m.type === M.SELECT_CARD) {
    const out = codes.map((code) => m.selects.findIndex((c, i) => at(c, code))).filter((i) => i > -1);
    if (out.length === codes.length) return { type: R.SELECT_CARD, indicies: out };
  }
  if (m.type === M.SELECT_UNSELECT_CARD) { const i = m.select_cards.findIndex((c) => at(c, codes[0])); if (i > -1) { codes.shift(); return codes.length ? undefined : { type: R.SELECT_UNSELECT_CARD, index: i }; } }
};
export const option = (index) => (m) => (m.type === M.SELECT_OPTION ? { type: R.SELECT_OPTION, index } : undefined);
export const no = () => (m) => (m.type === M.SELECT_EFFECTYN ? { type: R.SELECT_EFFECTYN, yes: false } : m.type === M.SELECT_YESNO ? { type: R.SELECT_YESNO, yes: false } : undefined);
