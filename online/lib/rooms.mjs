// Salles de duel : création, arrivée des joueurs, decks, réponses au moteur.
import { randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AMICAL, deckProblems } from "../public/deckrules.js";
import { botAnswer } from "./bot.mjs";
import { pass } from "./autoplay.mjs";
import { advance, cardInfo, replay, toJSON, viewFor } from "./engine.mjs";
import { getStore } from "./store.mjs";

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

// Formats : Amical (sans liste) ou une liste officielle d'EDOPro (TCG, OCG…)
let FORMATS = null;
export function formats() {
  if (!FORMATS) {
    let lists = [];
    try { lists = JSON.parse(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "lflists.json"), "utf8")); } catch (e) { /* pas encore préparées */ }
    FORMATS = [AMICAL, ...lists];
  }
  return FORMATS;
}
const formatOf = (id) => formats().find((f) => f.id === (id || "amical")) || fail(400, "Format inconnu.");
// Decks du bot (WindBot Ignite + Decks de démo des packs), préparés par scripts/build-data.mjs
let BOTS = null;
export function bots() {
  if (!BOTS) { try { BOTS = JSON.parse(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "bots.json"), "utf8")); } catch (e) { BOTS = []; } }
  return BOTS;
}
const formatInfo = (f) => ({ id: f.id, name: f.name, short: f.short || f.name });

/** Vérifie un deck selon les règles officielles et la liste du format (Amical : sans liste). */
export function checkDeck(deck, format = "amical") {
  const main = (deck && deck.main || []).map(Number), extra = (deck && deck.extra || []).map(Number);
  return { main, extra, problems: deckProblems({ main, extra }, cardInfo, formatOf(format)) };
}

export async function createRoom(name, format, bot) {
  const store = getStore();
  const data = { created: Date.now(), status: "lobby", format: formatOf(format).id, players: { A: { name: cleanName(name), token: newToken(), deck: null }, B: null }, game: null, chat: [] };
  if (bot) { // contre le bot : il prend la place B avec son deck (le format ne s'applique qu'au joueur)
    const b = bots().find((x) => x.id === bot) || fail(400, "Ce deck de bot n'existe pas.");
    data.players.B = { name: (b.source === "windbot" ? "WindBot · " : "Bot · ") + b.name, bot: b.id, token: newToken(), deck: { main: b.main, extra: b.extra, name: b.name } };
  }
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
  if (p.B) fail(409, p.B.bot ? "Cette salle est un duel contre le bot." : "La salle est complète (2 joueurs).");
  p.B = { name: cleanName(name), token: newToken(), deck: null };
  await save(code, room);
  return { code, seat: "B", token: p.B.token };
}

export async function setDeck(code, token, deck) {
  code = String(code || "").toUpperCase();
  const room = await load(code), d = room.data, seat = seatOf(room, token);
  if (d.status !== "lobby") fail(409, "Le duel a déjà commencé.");
  const { main, extra, problems } = checkDeck(deck, d.format);
  if (problems.length) fail(400, problems.join(" "));
  d.players[seat].deck = { main, extra, name: String(deck.name || "Deck").slice(0, 40) };
  if (d.players.A && d.players.A.deck && d.players.B && d.players.B.deck) { startDuel(d); await settle(d, await replay(d.game)); }
  await save(code, room);
  return { ok: true };
}

// Le créateur de la salle change le format avant le duel : les decks qui ne le respectent plus sont à revalider
export async function setFormat(code, token, format) {
  code = String(code || "").toUpperCase();
  const room = await load(code), d = room.data, seat = seatOf(room, token);
  if (seat !== "A") fail(403, "Seul le créateur de la salle choisit le format.");
  if (d.status !== "lobby") fail(409, "Le duel a déjà commencé.");
  d.format = formatOf(format).id;
  for (const s of SEATS) if (d.players[s] && !d.players[s].bot && d.players[s].deck && checkDeck(d.players[s].deck, d.format).problems.length) d.players[s].deck = null;
  return { version: await save(code, room) };
}

function startDuel(d) {
  const first = randomInt(2) ? "A" : "B"; // pile ou face : l'équipe 0 du moteur joue en premier
  const teams = { [first]: 0, [first === "A" ? "B" : "A"]: 1 };
  const decks = [];
  for (const s of SEATS) decks[teams[s]] = { main: d.players[s].deck.main, extra: d.players[s].deck.extra };
  d.game = { seed: Array.from({ length: 4 }, () => randomBytes(8).readBigUInt64LE().toString()), decks, teams, responses: [], first };
  d.status = "duel";
}

// Comme EDOPro : quand un joueur ne peut rien chaîner, on passe pour lui sans attendre son navigateur.
// Contre le bot, on le fait jouer ici jusqu'à ce que ce soit au joueur (sur la partie déjà ouverte, sans tout rejouer).
// Au-delà de `budget` ms, on s'arrête : la suite sera jouée à la prochaine requête (roomView).
const botTeam = (d) => { const s = SEATS.find((x) => d.players[x] && d.players[x].bot); return s && d.game ? d.game.teams[s] : null; };
// Modes de chaîne (comme EDOPro) : « normal » ne demande que si une carte peut répondre, « ignore » ne demande jamais
// (sauf obligation), « always » demande à chaque occasion, même sans rien à activer.
const chainMode = (d, team) => { const s = SEATS.find((x) => d.game.teams[x] === team); return (s && d.players[s] && d.players[s].chain) || "normal"; };
const plain = (x) => JSON.parse(toJSON(x)); // réponses stockées en JSON (pas de BigInt)
// Le bot joue une action à la fois (une Invocation, une activation, une attaque…) : la page redemande la suite
// après un court délai, pour que le joueur voie chaque coup et ses animations.
const isDecision = (p) => p.type === 11 /* IDLECMD */ || p.type === 10 /* BATTLECMD */ || p.type === 12 /* EFFECTYN */ || (p.type === 16 /* CHAIN */ && p.selects.length > 0);
const isVisible = (p, resp) => p.type === 11 || p.type === 10 || (p.type === 12 && resp.yes) || (p.type === 16 && resp.index != null);
async function settle(d, r, budget = 18000) {
  const bt = botTeam(d), t0 = Date.now();
  const memo = (d.game.botMemo ||= {});
  let acted = false;
  for (let i = 0; i < 3000 && r.pending && !r.ended && Date.now() - t0 < budget; i++) {
    const p = r.pending, team = p.player;
    let resp;
    if (team === bt && acted && isDecision(p)) break; // pause : le coup suivant attendra la prochaine requête
    const mode = chainMode(d, team);
    if (team === bt) { resp = botAnswer(r, team, memo); if (resp && isVisible(p, resp)) acted = true; }
    else if (p.type === 16 && !p.forced && (mode === "ignore" ? true : mode === "always" ? false : !p.selects.length)) resp = { type: 8, index: null };
    else break;
    if (!resp || !advance(r, resp)) { // réponse refusée : comme WindBot après un « retry », il passe
      resp = pass(p);
      if (!advance(r, resp)) break;
    }
    d.game.responses.push({ team, r: plain(resp) });
  }
  d.game.waiting = r.ended || !r.pending ? null : r.pending.player; // à qui de répondre (évite une relecture pour le savoir)
  if (r.ended) { d.status = "ended"; d.game.winner = r.winner; }
  r.close();
}

export async function setChainMode(code, token, mode) {
  code = String(code || "").toUpperCase();
  const room = await load(code), d = room.data, seat = seatOf(room, token);
  if (!["normal", "ignore", "always"].includes(mode)) fail(400, "Mode de chaîne inconnu.");
  d.players[seat].chain = mode;
  if (d.status === "duel") { const r = await replay(d.game); await settle(d, r); } // « ignorer » : passe tout de suite la question en cours
  return { version: await save(code, room) };
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
  d.status = "lobby"; d.game = null; // chacun garde son deck : il suffit de le revalider (le bot garde le sien)
  for (const s of SEATS) if (d.players[s] && !d.players[s].bot) d.players[s].deck = null;
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
  // tour du bot pas fini (requête précédente trop longue) : on le continue
  if (d.status === "duel" && botTeam(d) != null && d.game.waiting === botTeam(d)) {
    const r = await replay(d.game);
    if (r.pending && r.pending.player === botTeam(d) && !r.ended) { await settle(d, r, 12000); try { room.version = await save(code, room); } catch (e) { /* une autre requête a avancé la partie */ } }
    else r.close();
  }
  if (knownVersion && knownVersion === room.version) return { code, version: room.version, same: true }; // rien de neuf : pas de relecture
  const seat = SEATS.find((s) => token && d.players[s] && d.players[s].token === token) || null;
  const players = Object.fromEntries(SEATS.map((s) => [s, d.players[s] ? { name: d.players[s].name, bot: !!d.players[s].bot, chain: d.players[s].chain || "normal", ready: !!d.players[s].deck, deckName: d.players[s].deck && d.players[s].deck.name } : null]));
  const out = { code, version: room.version, status: d.status, seat, players, chat: d.chat || [], format: formatInfo(formatOf(d.format)),
    botTurn: d.status === "duel" && botTeam(d) != null && d.game.waiting === botTeam(d) };
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
