// Salles de duel : création, arrivée des joueurs, decks, réponses au moteur.
import { randomBytes, randomInt } from "node:crypto";
import { cardInfo, replay, viewFor } from "./engine.mjs";
import { getStore } from "./store.mjs";

const EXTRA_TYPES = 0x40 | 0x2000 | 0x800000 | 0x4000000; // Fusion, Synchro, Xyz, Lien
const TOKEN_TYPE = 0x4000;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans 0/O, 1/I/L
const SEATS = ["A", "B"];

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };

const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
const newToken = () => randomBytes(16).toString("hex");
const cleanName = (n) => String(n || "").replace(/\s+/g, " ").trim().slice(0, 24) || fail(400, "Choisis un pseudo.");

async function load(code) {
  const room = await getStore().get(String(code || "").toUpperCase());
  if (!room) fail(404, "Cette salle n'existe pas (ou plus). Vérifie le code.");
  return room;
}
function seatOf(room, token) {
  const seat = SEATS.find((s) => room.data.players[s] && room.data.players[s].token === token);
  if (!seat) fail(403, "Tu ne fais pas partie de cette salle.");
  return seat;
}
async function save(code, room) {
  const v = await getStore().put(code, room.version, room.data);
  if (v == null) fail(409, "La salle a changé entre-temps : réessaie.");
  return v;
}

/** Vérifie un deck selon les règles officielles (sans liste de bannissement : parties amicales). */
export function checkDeck(deck) {
  const main = (deck && deck.main || []).map(Number), extra = (deck && deck.extra || []).map(Number);
  const problems = [];
  const unknown = [...main, ...extra].filter((c) => !cardInfo(c));
  if (unknown.length) problems.push(`Cartes inconnues : ${[...new Set(unknown)].slice(0, 5).join(", ")}`);
  if (main.length < 40 || main.length > 60) problems.push(`Le Main Deck doit avoir entre 40 et 60 cartes (il en a ${main.length}).`);
  if (extra.length > 15) problems.push(`L'Extra Deck a au plus 15 cartes (il en a ${extra.length}).`);
  if (!unknown.length) {
    if (main.some((c) => cardInfo(c).type & (EXTRA_TYPES | TOKEN_TYPE))) problems.push("Un monstre Fusion, Synchro, Xyz ou Lien (ou un Jeton) est dans le Main Deck.");
    if (extra.some((c) => !(cardInfo(c).type & EXTRA_TYPES))) problems.push("L'Extra Deck ne peut contenir que des monstres Fusion, Synchro, Xyz ou Lien.");
    const copies = {};
    for (const c of [...main, ...extra]) { const i = cardInfo(c), key = i.alias && Math.abs(i.alias - c) < 20 ? i.alias : c; copies[key] = (copies[key] || 0) + 1; }
    const over = Object.entries(copies).filter(([, n]) => n > 3);
    if (over.length) problems.push(`Plus de 3 exemplaires d'une même carte (${over.map(([c]) => c).join(", ")}).`);
  }
  return { main, extra, problems };
}

export async function createRoom(name) {
  const store = getStore();
  const data = { created: Date.now(), status: "lobby", players: { A: { name: cleanName(name), token: newToken(), deck: null }, B: null }, game: null, chat: [] };
  for (let i = 0; i < 8; i++) {
    const code = newCode();
    if (await store.create(code, data)) return { code, seat: "A", token: data.players.A.token };
  }
  fail(500, "Impossible de créer une salle, réessaie.");
}

export async function joinRoom(code, name, token) {
  code = String(code || "").toUpperCase();
  const room = await load(code);
  const p = room.data.players;
  if (token) { const seat = SEATS.find((s) => p[s] && p[s].token === token); if (seat) return { code, seat, token }; }
  if (p.B) fail(409, "La salle est complète (2 joueurs).");
  p.B = { name: cleanName(name), token: newToken(), deck: null };
  await save(code, room);
  return { code, seat: "B", token: p.B.token };
}

export async function setDeck(code, token, deck) {
  code = String(code || "").toUpperCase();
  const room = await load(code), d = room.data, seat = seatOf(room, token);
  if (d.status !== "lobby") fail(409, "Le duel a déjà commencé.");
  const { main, extra, problems } = checkDeck(deck);
  if (problems.length) fail(400, problems.join(" "));
  d.players[seat].deck = { main, extra, name: String(deck.name || "Deck").slice(0, 40) };
  if (d.players.A && d.players.A.deck && d.players.B && d.players.B.deck) { startDuel(d); await settle(d, await replay(d.game)); }
  await save(code, room);
  return { ok: true };
}

function startDuel(d) {
  const first = randomInt(2) ? "A" : "B"; // pile ou face : l'équipe 0 du moteur joue en premier
  const teams = { [first]: 0, [first === "A" ? "B" : "A"]: 1 };
  const decks = [];
  for (const s of SEATS) decks[teams[s]] = { main: d.players[s].deck.main, extra: d.players[s].deck.extra };
  d.game = { seed: Array.from({ length: 4 }, () => randomBytes(8).readBigUInt64LE().toString()), decks, teams, responses: [], first };
  d.status = "duel";
}

// Comme EDOPro : quand un joueur ne peut rien chaîner, on passe pour lui sans attendre son navigateur
const nothingToChain = (p) => p && p.type === 16 /* SELECT_CHAIN */ && !p.selects.length && !p.forced;
async function settle(d, r) {
  for (let i = 0; i < 50 && nothingToChain(r.pending); i++) {
    const team = r.pending.player;
    r.close();
    d.game.responses.push({ team, r: { type: 8, index: null } });
    r = await replay(d.game);
  }
  if (r.ended) { d.status = "ended"; d.game.winner = r.winner; }
  r.close();
}

export async function respond(code, token, response) {
  code = String(code || "").toUpperCase();
  const room = await load(code), d = room.data, seat = seatOf(room, token);
  if (d.status !== "duel") fail(409, "Aucun duel en cours.");
  const team = d.game.teams[seat];
  const r = await replay(d.game, { team, r: response });
  if (!r.accepted) fail(400, "Le moteur refuse ce choix.");
  d.game.responses.push({ team, r: response });
  await settle(d, r);
  return { version: await save(code, room) };
}

export async function surrender(code, token) {
  code = String(code || "").toUpperCase();
  const room = await load(code), d = room.data, seat = seatOf(room, token);
  if (d.status !== "duel") fail(409, "Aucun duel en cours.");
  d.status = "ended"; d.game.winner = 1 - d.game.teams[seat]; d.game.surrendered = seat;
  return { version: await save(code, room) };
}

export async function rematch(code, token) {
  code = String(code || "").toUpperCase();
  const room = await load(code), d = room.data;
  seatOf(room, token);
  if (d.status !== "ended") fail(409, "Le duel n'est pas terminé.");
  d.status = "lobby"; d.game = null; // chacun garde son deck : il suffit de le revalider
  for (const s of SEATS) if (d.players[s]) d.players[s].deck = null;
  return { version: await save(code, room) };
}

export async function chat(code, token, text) {
  code = String(code || "").toUpperCase();
  const room = await load(code), d = room.data, seat = seatOf(room, token);
  const t = String(text || "").trim().slice(0, 200);
  if (!t) return { ok: true };
  d.chat = [...(d.chat || []), { seat, t, at: Date.now() }].slice(-50);
  return { version: await save(code, room) };
}

/** Ce que le joueur `token` voit de la salle (ou un spectateur sans token). */
export async function roomView(code, token, from = 0, knownVersion = 0) {
  code = String(code || "").toUpperCase();
  const room = await load(code), d = room.data;
  if (knownVersion && knownVersion === room.version) return { code, version: room.version, same: true }; // rien de neuf : pas de relecture
  const seat = SEATS.find((s) => token && d.players[s] && d.players[s].token === token) || null;
  const players = Object.fromEntries(SEATS.map((s) => [s, d.players[s] ? { name: d.players[s].name, ready: !!d.players[s].deck, deckName: d.players[s].deck && d.players[s].deck.name } : null]));
  const out = { code, version: room.version, status: d.status, seat, players, chat: d.chat || [] };
  if (d.game) {
    const team = seat ? d.game.teams[seat] : 2; // spectateur : ne voit aucune carte cachée
    out.team = team; out.teams = d.game.teams; out.first = d.game.first;
    const r = await replay(d.game);
    out.duel = viewFor(r, team, from);
    if (d.status === "ended") { out.duel.ended = true; out.duel.winner = d.game.winner ?? r.winner; out.duel.surrendered = d.game.surrendered || null; out.duel.prompt = null; }
    if (!seat) out.duel.prompt = null;
    r.close();
  }
  return out;
}
