// Prépare les données du jeu (lancé par `npm run build`, en local comme sur Vercel).
//
//  data/cards.json      données moteur de chaque carte (lues par ocgcore)
//  data/strings.json    textes système d'EDOPro en français (avec l'anglais en secours)
//  data/scripts/        scripts Lua : ProjectIgnis/CardScripts (officiels + utilitaires) + packs
//  data/sources.json    origine de chaque carte des packs, et cartes refusées (numéro déjà pris), pour le validateur
//  public/t/<n>.json    nom, type et texte des cartes pour l'interface (paquets par code % 100)
//  public/index-cards.json  liste de recherche du deck : [code, nom FR, nom EN, catégorie, type, niveau, attribut, type de monstre, ATK, DEF]
//  public/hm/<code>.jpg illustrations des cartes des packs
//  data/lflists.json, public/lflists.json  formats et listes de cartes interdites / limitées (ProjectIgnis/LFLists)
//  public/packs.json    les packs (nom, auteur, cartes, Deck de démo, date de publication) pour l'accueil et l'éditeur de deck
//
// Sources : ProjectIgnis/BabelCDB et ProjectIgnis/Distribution (EDOPro), mycard/ygopro-database (textes français).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";
import { PACKS, loadPack } from "../lib/packs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".cache"), DATA = path.join(ROOT, "data"), PUB = path.join(ROOT, "public");
const CHUNKS = 100;

function clone(repo, dir) {
  const dest = path.join(CACHE, dir);
  if (existsSync(path.join(dest, ".git"))) return dest;
  mkdirSync(CACHE, { recursive: true });
  console.log("clone", repo);
  execFileSync("git", ["clone", "-q", "--depth", "1", `https://github.com/${repo}`, dest], { stdio: "inherit" });
  return dest;
}
async function download(url, file) {
  const dest = path.join(CACHE, file);
  if (existsSync(dest)) return dest;
  console.log("téléchargement", url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} : ${r.status}`);
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  return dest;
}

const SQL = await initSqlJs();
const rows = (file, sql) => {
  const db = new SQL.Database(readFileSync(file));
  const res = db.exec(sql)[0];
  db.close();
  return res ? res.values : [];
};

// ---------- sources ----------
mkdirSync(CACHE, { recursive: true });
const babel = clone("ProjectIgnis/BabelCDB", "BabelCDB");
const scripts = clone("ProjectIgnis/CardScripts", "CardScripts");
const distrib = clone("ProjectIgnis/Distribution", "Distribution");
const lflists = clone("ProjectIgnis/LFLists", "LFLists");
const frCdb = await download("https://raw.githubusercontent.com/mycard/ygopro-database/master/locales/fr-FR/cards.cdb", "fr-FR.cdb");
// Packs : packs/<nom>/ (Hueco Mundo compris ; régénéré depuis edopro/ par `npm run sync-hm`)
const packs = existsSync(PACKS) ? readdirSync(PACKS).filter((d) => existsSync(path.join(PACKS, d, "cards.json"))).sort().map((d) => loadPack(path.join(PACKS, d))) : [];

// ---------- cartes ----------
const T = { MONSTER: 0x1, SPELL: 0x2, TRAP: 0x4, NORMAL: 0x10, EFFECT: 0x20, FUSION: 0x40, RITUAL: 0x80, TUNER: 0x1000, SYNCHRO: 0x2000, TOKEN: 0x4000,
  QUICK: 0x10000, CONT: 0x20000, EQUIP: 0x40000, FIELD: 0x80000, COUNTER: 0x100000, XYZ: 0x800000, PEND: 0x1000000, LINK: 0x4000000 };
const EXTRA = T.FUSION | T.SYNCHRO | T.XYZ | T.LINK;
const cdbs = [path.join(babel, "cards.cdb"), ...readdirSync(babel).filter((f) => /^release-.*\.cdb$/.test(f)).map((f) => path.join(babel, f))];

const engine = {}, text = {};
const SELECT = "select d.id, d.alias, d.setcode, d.type, d.atk, d.def, d.level, d.race, d.attribute, d.ot, t.name, t.desc, " +
  Array.from({ length: 16 }, (_, i) => `t.str${i + 1}`).join(", ") + " from datas d join texts t on t.id = d.id";
for (const file of cdbs) {
  for (const [id, alias, setcode, type, atk, def, level, race, attribute, , name, desc, ...strs] of rows(file, SELECT)) {
    const sc = BigInt(setcode), setcodes = [];
    for (let i = 0n; i < 4n; i++) { const v = Number((sc >> (i * 16n)) & 0xffffn); if (v) setcodes.push(v); }
    const link = type & T.LINK ? def : 0;
    engine[id] = [alias, setcodes, type, level & 0xff, attribute, String(race), atk, type & T.LINK ? 0 : def, (level >> 24) & 0xff, (level >> 16) & 0xff, link];
    text[id] = { name, desc: desc || "", strs: strs.map((s) => s || "") };
  }
}
// cartes des packs : un numéro déjà pris (carte officielle ou autre pack) est refusé
const sources = { cards: {}, rejected: [] };
for (const p of packs) {
  for (const { card, row, text: t } of p.cards) {
    const id = card.id;
    if (!Number.isInteger(id) || id <= 0) continue;
    if (engine[id]) { sources.rejected.push({ pack: p.slug, id, owner: sources.cards[id] || "official" }); continue; }
    engine[id] = row; text[id] = t; sources.cards[id] = p.slug;
  }
}
// textes français (mycard) quand ils existent
let fr = 0;
for (const [id, name, desc, ...strs] of rows(frCdb, "select id, name, desc, " + Array.from({ length: 16 }, (_, i) => `str${i + 1}`).join(", ") + " from texts")) {
  const t = text[id];
  if (!t || !name || sources.cards[id]) continue;
  t.en = t.name; t.name = name; t.desc = desc || t.desc;
  t.strs = t.strs.map((s, i) => strs[i] || s);
  fr++;
}

rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });
writeFileSync(path.join(DATA, "cards.json"), JSON.stringify(engine));
writeFileSync(path.join(DATA, "sources.json"), JSON.stringify(sources));

// ---------- interface : textes et recherche ----------
const ATTR = { 1: "TERRE", 2: "EAU", 4: "FEU", 8: "VENT", 16: "LUMIÈRE", 32: "TÉNÈBRES", 64: "DIVIN" };
const kindOf = (type) => (type & T.SPELL ? "s" : type & T.TRAP ? "t" : type & T.TOKEN ? "k" : type & EXTRA ? "x" : "m");
rmSync(path.join(PUB, "t"), { recursive: true, force: true });
mkdirSync(path.join(PUB, "t"), { recursive: true });
const chunks = Array.from({ length: CHUNKS }, () => ({}));
const index = [];
for (const [id, e] of Object.entries(engine)) {
  const [alias, , type, level, attribute, , atk, def, ls, rs, link] = e, t = text[id];
  chunks[id % CHUNKS][id] = [t.name, t.desc, t.strs, type, level, ATTR[attribute] || "", +e[5], atk, def, ls, rs, link, t.en || "", alias];
  if (!(type & T.TOKEN) && !(alias && Math.abs(alias - id) < 20)) {
    const race = BigInt(e[5]), raceIdx = race ? (race & -race).toString(2).length - 1 : -1; // n° du bit : Guerrier = 0, Magicien = 1…
    index.push([+id, t.name, t.en && t.en !== t.name ? t.en : "", kindOf(type), type, level, attribute, raceIdx, atk, def]);
  }
}
// version des données : les fichiers de cartes sont gardés en cache par les navigateurs, la version change leur adresse (?v=…)
const version = createHash("sha1");
chunks.forEach((c, i) => { const j = JSON.stringify(c); version.update(j); writeFileSync(path.join(PUB, "t", `${i}.json`), j); });
const sortName = (n) => n.replace(/^[\s"«“'(]+/, "");
index.sort((a, b) => sortName(a[1]).localeCompare(sortName(b[1]), "fr"));
writeFileSync(path.join(PUB, "index-cards.json"), JSON.stringify(index));
version.update(JSON.stringify(index));

// ---------- textes système ----------
const parseStrings = (file) => {
  const out = { system: {}, victory: {}, counter: {}, setname: {} };
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^!(system|victory|counter|setname)\s+(\S+)\s+(.*)$/.exec(line);
    if (m) out[m[1]][m[1] === "system" ? +m[2] : parseInt(m[2], 16)] = m[3].trim();
  }
  return out;
};
const en = parseStrings(path.join(distrib, "config", "strings.conf"));
const frs = parseStrings(path.join(distrib, "config", "languages", "Français", "strings.conf"));
const ours = { setname: {}, counter: {} };
for (const p of packs) for (const k of ["setname", "counter"]) for (const [code, n] of Object.entries(p.meta[k === "setname" ? "setnames" : "counters"] || {})) ours[k][parseInt(code, 16)] = n;
const strings = {};
for (const k of Object.keys(en)) strings[k] = { ...en[k], ...frs[k], ...ours[k] };
writeFileSync(path.join(DATA, "strings.json"), JSON.stringify(strings));
writeFileSync(path.join(PUB, "strings.json"), JSON.stringify(strings));

// ---------- formats (listes des cartes interdites et limitées d'EDOPro) ----------
// Fichier .lflist.conf : « !nom de la liste », « $whitelist » (seules les cartes listées sont permises), puis « code nombre --nom »
const FORMATS = [["tcg", "0TCG.lflist.conf", "TCG"], ["ocg", "OCG.lflist.conf", "OCG"], ["world", "World.lflist.conf", "Worlds"],
  ["traditional", "Traditional.lflist.conf", "Traditionnel"], ["goat", "GOAT.lflist.conf", "GOAT"]];
const formats = [];
for (const [id, file, short] of FORMATS) {
  const f = path.join(lflists, file);
  if (!existsSync(f)) { console.warn("liste absente :", file); continue; }
  const list = { id, short, name: short, whitelist: false, cards: {} };
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    if (line.startsWith("!")) list.name = line.slice(1).trim();
    else if (line.trim() === "$whitelist") list.whitelist = true;
    else { const m = /^(\d+)\s+(-?\d+)/.exec(line); if (m) list.cards[m[1]] = Math.max(0, Math.min(3, +m[2])); }
  }
  formats.push(list);
}
writeFileSync(path.join(DATA, "lflists.json"), JSON.stringify(formats));
writeFileSync(path.join(PUB, "lflists.json"), JSON.stringify(formats));
version.update(JSON.stringify(formats));

// ---------- scripts ----------
const dst = path.join(DATA, "scripts");
mkdirSync(dst, { recursive: true });
for (const f of readdirSync(scripts)) if (f.endsWith(".lua")) cpSync(path.join(scripts, f), path.join(dst, f));
for (const f of readdirSync(path.join(scripts, "official"))) if (f.endsWith(".lua")) cpSync(path.join(scripts, "official", f), path.join(dst, f));
// utilitaires du dossier unofficial (proc_unofficial.lua…), sans les cartes non officielles
for (const f of readdirSync(path.join(scripts, "unofficial"))) if (f.endsWith(".lua") && !/^c\d+\.lua$/.test(f)) cpSync(path.join(scripts, "unofficial", f), path.join(dst, f));
// scripts des packs : seulement ceux de leurs propres cartes (un pack ne peut pas remplacer une carte officielle)
const own = (p, f) => { const m = /^c(\d+)\.lua$/.exec(f); return m && sources.cards[m[1]] === p.slug; };
for (const p of packs) {
  const dir = path.join(p.dir, "script");
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (own(p, f)) cpSync(path.join(dir, f), path.join(dst, f));
}

// ---------- illustrations et liste des packs ----------
rmSync(path.join(PUB, "hm"), { recursive: true, force: true });
mkdirSync(path.join(PUB, "hm"), { recursive: true });
const shallow = (() => { try { return execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: ROOT, encoding: "utf8" }).trim() !== "false"; } catch (e) { return true; } })();
const addedOn = (file) => { // date d'arrivée du pack dans le dépôt, si l'historique complet est disponible
  if (shallow) return null;
  try { return execFileSync("git", ["log", "--diff-filter=A", "--format=%cI", "--", file], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").pop() || null; } catch (e) { return null; }
};
const list = [];
for (const p of packs) {
  const pics = path.join(p.dir, "pics"), ids = p.cards.map((c) => c.card.id).filter((id) => sources.cards[id] === p.slug);
  if (existsSync(pics)) for (const f of readdirSync(pics)) if (/^\d+\.jpg$/.test(f) && sources.cards[f.slice(0, -4)] === p.slug) { cpSync(path.join(pics, f), path.join(PUB, "hm", f)); version.update(readFileSync(path.join(pics, f))); }
  const m = p.meta, deck = m.deck || {};
  list.push({ slug: p.slug, name: String(m.name || p.slug), author: String(m.author || ""), description: String(m.description || ""), cover: +m.cover || ids[0] || 0,
    home: !!m.home, published: m.published || addedOn(path.join(p.dir, "pack.json")), cards: ids,
    deck: { main: (deck.main || []).filter((c) => engine[c]), extra: (deck.extra || []).filter((c) => engine[c]) } });
}
writeFileSync(path.join(PUB, "packs.json"), JSON.stringify({ v: version.digest("hex").slice(0, 12), packs: list }));
if (sources.rejected.length) console.warn("cartes refusées (numéro déjà pris) :", sources.rejected.map((r) => `${r.pack}/${r.id} (${r.owner})`).join(", "));

console.log(`${Object.keys(engine).length} cartes (${fr} en français) · ${packs.length} packs · formats ${formats.map((f) => f.name).join(", ")} · ${readdirSync(dst).length} scripts · ${index.length} cartes dans la recherche`);
