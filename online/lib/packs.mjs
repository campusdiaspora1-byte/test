// Packs de cartes : un dossier packs/<nom>/ par archétype.
//
//   pack.json        nom, auteur, description, carte de couverture, noms d'archétypes, Deck de démo
//   cards.json       les cartes, en texte (lisible et facile à relire dans une Pull Request)
//   script/c<id>.lua les effets, au format EDOPro (Project Ignis)
//   pics/<id>.jpg    les illustrations
//
// Ce module lit un pack et le traduit dans le format du moteur (celui des .cdb d'EDOPro), et dans l'autre sens.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "packs");

// Noms des constantes EDOPro (constant.lua), sans le préfixe TYPE_, ATTRIBUTE_, RACE_, LINK_MARKER_
export const TYPES = { MONSTER: 0x1, SPELL: 0x2, TRAP: 0x4, NORMAL: 0x10, EFFECT: 0x20, FUSION: 0x40, RITUAL: 0x80, TRAPMONSTER: 0x100, SPIRIT: 0x200,
  UNION: 0x400, GEMINI: 0x800, TUNER: 0x1000, SYNCHRO: 0x2000, TOKEN: 0x4000, QUICKPLAY: 0x10000, CONTINUOUS: 0x20000, EQUIP: 0x40000, FIELD: 0x80000,
  COUNTER: 0x100000, FLIP: 0x200000, TOON: 0x400000, XYZ: 0x800000, PENDULUM: 0x1000000, SPSUMMON: 0x2000000, LINK: 0x4000000 };
export const ATTRIBUTES = { EARTH: 0x1, WATER: 0x2, FIRE: 0x4, WIND: 0x8, LIGHT: 0x10, DARK: 0x20, DIVINE: 0x40 };
export const RACES = { WARRIOR: 0x1, SPELLCASTER: 0x2, FAIRY: 0x4, FIEND: 0x8, ZOMBIE: 0x10, MACHINE: 0x20, AQUA: 0x40, PYRO: 0x80, ROCK: 0x100,
  WINGEDBEAST: 0x200, PLANT: 0x400, INSECT: 0x800, THUNDER: 0x1000, DRAGON: 0x2000, BEAST: 0x4000, BEASTWARRIOR: 0x8000, DINOSAUR: 0x10000, FISH: 0x20000,
  SEASERPENT: 0x40000, REPTILE: 0x80000, PSYCHIC: 0x100000, DIVINE: 0x200000, CREATORGOD: 0x400000, WYRM: 0x800000, CYBERSE: 0x1000000, ILLUSION: 0x2000000,
  CYBORG: 0x4000000, MAGICALKNIGHT: 0x8000000, HIGHDRAGON: 0x10000000, OMEGAPSYCHIC: 0x20000000, CELESTIALWARRIOR: 0x40000000, GALAXY: 0x80000000 };
export const MARKERS = { BOTTOM_LEFT: 0x1, BOTTOM: 0x2, BOTTOM_RIGHT: 0x4, LEFT: 0x8, RIGHT: 0x20, TOP_LEFT: 0x40, TOP: 0x80, TOP_RIGHT: 0x100 };
const EXTRA = TYPES.FUSION | TYPES.SYNCHRO | TYPES.XYZ | TYPES.LINK;

const names = (table, value) => Object.entries(table).filter(([, b]) => value & b).map(([n]) => n);
const one = (table, value) => Object.keys(table).find((n) => table[n] === value) || null;
const hex = (n) => "0x" + n.toString(16);

/**
 * Une carte de cards.json → { row (ligne moteur), text, problems }.
 * row : [alias, setcodes, type, niveau, attribut, type de monstre (texte), ATK, DEF, échelle gauche, échelle droite, flèches Lien]
 */
export function cardToRow(card) {
  const problems = [];
  const bad = (msg, fix) => problems.push({ level: "error", msg, fix });
  let type = 0;
  for (const t of card.types || []) {
    const b = TYPES[String(t).toUpperCase()];
    if (b) type |= b; else bad(`type inconnu « ${t} »`, `Types possibles : ${Object.keys(TYPES).join(", ")}.`);
  }
  if (!(type & (TYPES.MONSTER | TYPES.SPELL | TYPES.TRAP))) bad("la carte n'est ni MONSTER, ni SPELL, ni TRAP", 'Ajoutez "MONSTER", "SPELL" ou "TRAP" dans "types".');
  const monster = !!(type & TYPES.MONSTER);
  let attribute = 0, race = 0n, level = 0, atk = 0, def = 0, ls = 0, rs = 0, markers = 0;
  if (monster) {
    attribute = ATTRIBUTES[String(card.attribute || "").toUpperCase()] || 0;
    if (!attribute) bad(`attribut manquant ou inconnu (« ${card.attribute ?? ""} »)`, `"attribute" : ${Object.keys(ATTRIBUTES).join(", ")}.`);
    const r = RACES[String(card.race || "").toUpperCase()];
    if (!r) bad(`Type de monstre manquant ou inconnu (« ${card.race ?? ""} »)`, `"race" : ${Object.keys(RACES).join(", ")}.`);
    race = BigInt(r || 0);
    level = card.level ?? card.rank ?? card.link ?? 0;
    const stat = (v, n) => (v === "?" ? -2 : Number.isInteger(v) && v >= 0 ? v : (bad(`${n} invalide (« ${v} »)`, `"${n.toLowerCase()}" : un entier positif, ou "?".`), 0));
    atk = stat(card.atk ?? 0, "ATK");
    if (type & TYPES.LINK) {
      for (const m of card.markers || []) { const b = MARKERS[String(m).toUpperCase()]; if (b) markers |= b; else bad(`flèche Lien inconnue « ${m} »`, `Flèches : ${Object.keys(MARKERS).join(", ")}.`); }
      if (card.def != null) bad("un monstre Lien n'a pas de DEF", 'Retirez "def".');
    } else def = stat(card.def ?? 0, "DEF");
    if (type & TYPES.PENDULUM) {
      const sc = Array.isArray(card.scale) ? card.scale : [card.scale, card.scale];
      [ls, rs] = sc.map((v) => (Number.isInteger(v) && v >= 0 && v <= 13 ? v : (bad(`échelle Pendule invalide (« ${card.scale} »)`, '"scale" : un nombre de 0 à 13, ou [gauche, droite].'), 0)));
    }
  } else {
    for (const k of ["attribute", "race", "level", "rank", "link", "atk", "def", "scale", "markers"])
      if (card[k] != null) bad(`une Magie ou un Piège n'a pas de champ « ${k} »`, `Retirez "${k}".`);
  }
  const setcodes = [];
  for (const s of card.setcodes || []) {
    const v = typeof s === "number" ? s : parseInt(s, 16);
    if (Number.isInteger(v) && v > 0 && v <= 0xffff) setcodes.push(v); else bad(`code d'archétype invalide « ${s} »`, 'Codes d\'archétype : texte hexadécimal, ex. "0xf80".');
  }
  if (setcodes.length > 4) bad("plus de 4 archétypes", "Le moteur accepte 4 codes d'archétype par carte au maximum.");
  const row = [card.alias || 0, setcodes, type, level & 0xff, attribute, String(race), atk, def, ls, rs, markers];
  const strs = Array.from({ length: 16 }, (_, i) => (card.strings && card.strings[i]) || "");
  return { row, text: { name: card.name || "", desc: card.text || "", strs }, problems };
}

// Ligne d'un .cdb (tables datas + texts) → carte de cards.json
export function cdbToCard({ id, alias, setcode, type, atk, def, level, race, attribute, name, desc, strs }) {
  const card = { id, name, text: desc || "", types: names(TYPES, type) };
  const sc = BigInt(setcode), setcodes = [];
  for (let i = 0n; i < 4n; i++) { const v = Number((sc >> (i * 16n)) & 0xffffn); if (v) setcodes.push(hex(v)); }
  if (setcodes.length) card.setcodes = setcodes;
  if (alias) card.alias = alias;
  if (type & TYPES.MONSTER) {
    card.attribute = one(ATTRIBUTES, attribute);
    card.race = one(RACES, Number(race));
    card[type & TYPES.XYZ ? "rank" : type & TYPES.LINK ? "link" : "level"] = level & 0xff;
    card.atk = atk === -2 ? "?" : atk;
    if (type & TYPES.LINK) card.markers = names(MARKERS, def);
    else card.def = def === -2 ? "?" : def;
    if (type & TYPES.PENDULUM) { const l = (level >> 24) & 0xff, r = (level >> 16) & 0xff; card.scale = l === r ? l : [l, r]; }
  }
  const s = (strs || []).map((x) => x || "");
  while (s.length && !s[s.length - 1]) s.pop();
  if (s.length) card.strings = s;
  return card;
}

// Fichier strings.conf d'EDOPro → { setname: {code: nom}, counter: {code: nom} }
export function parseStringsConf(src) {
  const out = { setname: {}, counter: {} };
  for (const line of src.split(/\r?\n/)) {
    const m = /^!(setname|counter)\s+(0x[0-9a-f]+)\s+(.*)$/i.exec(line);
    if (m) out[m[1]][m[2].toLowerCase()] = m[3].trim();
  }
  return out;
}

const readJSON = (file) => JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
export const isExtra = (type) => !!(type & EXTRA);

/** Lit packs/<slug>/. Renvoie { slug, dir, meta, cards: [{ card, row, text, problems }], problems } — sans jamais lever d'exception. */
export function loadPack(dir) {
  const slug = path.basename(dir), problems = [];
  const bad = (msg, fix) => problems.push({ level: "error", msg, fix });
  let meta = {}, list = [];
  try { meta = readJSON(path.join(dir, "pack.json")); }
  catch (e) { bad(existsSync(path.join(dir, "pack.json")) ? `pack.json n'est pas du JSON valide : ${e.message}` : "pack.json manquant", "Copiez packs/hueco-mundo/pack.json et adaptez-le."); }
  try { list = readJSON(path.join(dir, "cards.json")); if (!Array.isArray(list)) { bad("cards.json doit être une liste [ … ] de cartes"); list = []; } }
  catch (e) { bad(existsSync(path.join(dir, "cards.json")) ? `cards.json n'est pas du JSON valide : ${e.message}` : "cards.json manquant", "Exportez vos cartes avec `node scripts/pack-from-cdb.mjs votre.cdb packs/" + slug + "`."); }
  const cards = list.map((card) => ({ card, ...cardToRow(card) }));
  return { slug, dir, meta, cards, problems };
}
