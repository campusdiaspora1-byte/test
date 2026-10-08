// Règles de construction d'un deck, partagées par le serveur (lib/rooms.mjs) et la page (app.js).
// Listes des cartes interdites et limitées : ProjectIgnis/LFLists (celles d'EDOPro), préparées par scripts/build-data.mjs.
export const EXTRA_TYPES = 0x40 | 0x2000 | 0x800000 | 0x4000000; // Fusion, Synchro, Xyz, Lien
export const TOKEN_TYPE = 0x4000;
export const AMICAL = { id: "amical", name: "Amical", short: "Amical", whitelist: false, cards: {} };

// Les versions alternatives d'une carte (illustration différente) comptent comme la même carte
export const baseCode = (code, info) => (info && info.alias && Math.abs(info.alias - code) < 20 ? info.alias : code);

/** Nombre d'exemplaires autorisés de `code` dans le format `list` (3 hors liste ; 0 hors liste blanche). */
export function limitOf(code, info, list) {
  if (!list || !list.cards) return 3;
  const n = list.cards[code] ?? list.cards[baseCode(code, info)];
  return n ?? (list.whitelist ? 0 : 3);
}
export const LIMIT_NAMES = ["interdite", "limitée", "semi-limitée"];

/**
 * Vérifie un deck. info(code) → { type, alias } ou null ; name(code) → nom à afficher.
 * Renvoie la liste des problèmes (vide si le deck est valide).
 */
export function deckProblems(deck, info, list = AMICAL, name = (c) => String(c)) {
  const main = deck.main || [], extra = deck.extra || [], problems = [];
  const unknown = [...new Set([...main, ...extra].filter((c) => !info(c)))];
  if (unknown.length) problems.push(`Cartes inconnues : ${unknown.slice(0, 5).join(", ")}`);
  if (main.length < 40 || main.length > 60) problems.push(`Le Main Deck doit avoir de 40 à 60 cartes (il en a ${main.length}).`);
  if (extra.length > 15) problems.push(`L'Extra Deck a 15 cartes au maximum (il en a ${extra.length}).`);
  if (unknown.length) return problems;
  const badMain = main.filter((c) => info(c).type & (EXTRA_TYPES | TOKEN_TYPE));
  if (badMain.length) problems.push(`Pas de monstre Fusion, Synchro, Xyz, Lien ni de Jeton dans le Main Deck : ${[...new Set(badMain)].map(name).join(", ")}.`);
  const badExtra = extra.filter((c) => !(info(c).type & EXTRA_TYPES));
  if (badExtra.length) problems.push(`L'Extra Deck ne contient que des monstres Fusion, Synchro, Xyz ou Lien : ${[...new Set(badExtra)].map(name).join(", ")}.`);
  const copies = {}, first = {};
  for (const c of [...main, ...extra]) { const k = baseCode(c, info(c)); copies[k] = (copies[k] || 0) + 1; first[k] ??= c; }
  const banned = [], off = [], fmt = list.short || list.name;
  for (const [k, n] of Object.entries(copies)) {
    const c = first[k], max = limitOf(c, info(c), list);
    if (n <= max) continue;
    if (max === 0) (list.whitelist && list.cards[c] == null && list.cards[k] == null ? off : banned).push(name(c));
    else if (max < 3) problems.push(`${name(c)} est ${LIMIT_NAMES[max]} en format ${fmt} : ${max} exemplaire${max > 1 ? "s" : ""} au maximum (le deck en a ${n}).`);
    else problems.push(`${name(c)} : 3 exemplaires au maximum (le deck en a ${n}).`);
  }
  const few = (a) => a.slice(0, 6).join(", ") + (a.length > 6 ? ` et ${a.length - 6} autre${a.length > 7 ? "s" : ""}` : "");
  if (banned.length) problems.unshift(`Interdite${banned.length > 1 ? "s" : ""} en format ${fmt} : ${few(banned)}.`);
  if (off.length) problems.unshift(`Hors de la liste des cartes permises en format ${fmt} (${off.length} carte${off.length > 1 ? "s" : ""}) : ${few(off)}.`);
  return problems;
}
