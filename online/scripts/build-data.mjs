// Prépare les données du jeu (lancé par `npm run build`, en local comme sur Vercel).
//
//  data/cards.json      données moteur de chaque carte (lues par ocgcore)
//  data/strings.json    textes système d'EDOPro en français (avec l'anglais en secours)
//  data/scripts/        scripts Lua : ProjectIgnis/CardScripts (officiels + utilitaires) + Hueco Mundo
//  public/t/<n>.json    nom, type et texte des cartes pour l'interface (paquets par code % 100)
//  public/index-cards.json  liste de recherche du deck : [code, nom FR, nom EN, catégorie, type, niveau, attribut, type de monstre, ATK, DEF]
//  public/hm/<code>.jpg illustrations des cartes Hueco Mundo
//
// Sources : ProjectIgnis/BabelCDB et ProjectIgnis/Distribution (EDOPro), mycard/ygopro-database (textes français).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

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
const frCdb = await download("https://raw.githubusercontent.com/mycard/ygopro-database/master/locales/fr-FR/cards.cdb", "fr-FR.cdb");
// Hueco Mundo : copie de edopro/dist/expansions (régénérer avec `npm run sync-hm` après avoir modifié les cartes)
const HM = path.join(ROOT, "vendor", "hueco-mundo");
const ourCdb = path.join(HM, "hueco-mundo.cdb");

// ---------- cartes ----------
const T = { MONSTER: 0x1, SPELL: 0x2, TRAP: 0x4, NORMAL: 0x10, EFFECT: 0x20, FUSION: 0x40, RITUAL: 0x80, TUNER: 0x1000, SYNCHRO: 0x2000, TOKEN: 0x4000,
  QUICK: 0x10000, CONT: 0x20000, EQUIP: 0x40000, FIELD: 0x80000, COUNTER: 0x100000, XYZ: 0x800000, PEND: 0x1000000, LINK: 0x4000000 };
const EXTRA = T.FUSION | T.SYNCHRO | T.XYZ | T.LINK;
const cdbs = [path.join(babel, "cards.cdb"), ...readdirSync(babel).filter((f) => /^release-.*\.cdb$/.test(f)).map((f) => path.join(babel, f)), ourCdb];

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
// textes français (mycard) quand ils existent
let fr = 0;
for (const [id, name, desc, ...strs] of rows(frCdb, "select id, name, desc, " + Array.from({ length: 16 }, (_, i) => `str${i + 1}`).join(", ") + " from texts")) {
  const t = text[id];
  if (!t || !name) continue;
  t.en = t.name; t.name = name; t.desc = desc || t.desc;
  t.strs = t.strs.map((s, i) => strs[i] || s);
  fr++;
}

rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });
writeFileSync(path.join(DATA, "cards.json"), JSON.stringify(engine));

// ---------- interface : textes et recherche ----------
const ATTR = { 1: "TERRE", 2: "EAU", 4: "FEU", 8: "VENT", 16: "LUMIÈRE", 32: "TÉNÈBRES", 64: "DIVIN" };
const kindOf = (type) => (type & T.SPELL ? "s" : type & T.TRAP ? "t" : type & T.TOKEN ? "k" : type & EXTRA ? "x" : "m");
rmSync(path.join(PUB, "t"), { recursive: true, force: true });
mkdirSync(path.join(PUB, "t"), { recursive: true });
const chunks = Array.from({ length: CHUNKS }, () => ({}));
const index = [];
for (const [id, e] of Object.entries(engine)) {
  const [alias, , type, level, attribute, , atk, def, ls, rs, link] = e, t = text[id];
  chunks[id % CHUNKS][id] = [t.name, t.desc, t.strs, type, level, ATTR[attribute] || "", +e[5], atk, def, ls, rs, link, t.en || ""];
  if (!(type & T.TOKEN) && !(alias && Math.abs(alias - id) < 20)) {
    const race = BigInt(e[5]), raceIdx = race ? (race & -race).toString(2).length - 1 : -1; // n° du bit : Guerrier = 0, Magicien = 1…
    index.push([+id, t.name, t.en && t.en !== t.name ? t.en : "", kindOf(type), type, level, attribute, raceIdx, atk, def]);
  }
}
chunks.forEach((c, i) => writeFileSync(path.join(PUB, "t", `${i}.json`), JSON.stringify(c)));
const sortName = (n) => n.replace(/^[\s"«“'(]+/, "");
index.sort((a, b) => sortName(a[1]).localeCompare(sortName(b[1]), "fr"));
writeFileSync(path.join(PUB, "index-cards.json"), JSON.stringify(index));

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
const ours = parseStrings(path.join(HM, "strings.conf"));
const strings = {};
for (const k of Object.keys(en)) strings[k] = { ...en[k], ...frs[k], ...ours[k] };
writeFileSync(path.join(DATA, "strings.json"), JSON.stringify(strings));
writeFileSync(path.join(PUB, "strings.json"), JSON.stringify(strings));

// ---------- scripts ----------
const dst = path.join(DATA, "scripts");
mkdirSync(dst, { recursive: true });
for (const f of readdirSync(scripts)) if (f.endsWith(".lua")) cpSync(path.join(scripts, f), path.join(dst, f));
for (const f of readdirSync(path.join(scripts, "official"))) if (f.endsWith(".lua")) cpSync(path.join(scripts, "official", f), path.join(dst, f));
// utilitaires du dossier unofficial (proc_unofficial.lua…), sans les cartes non officielles
for (const f of readdirSync(path.join(scripts, "unofficial"))) if (f.endsWith(".lua") && !/^c\d+\.lua$/.test(f)) cpSync(path.join(scripts, "unofficial", f), path.join(dst, f));
for (const f of readdirSync(path.join(HM, "script"))) cpSync(path.join(HM, "script", f), path.join(dst, f));

// ---------- illustrations Hueco Mundo ----------
rmSync(path.join(PUB, "hm"), { recursive: true, force: true });
mkdirSync(path.join(PUB, "hm"), { recursive: true });
const pics = path.join(HM, "pics");
for (const f of readdirSync(pics)) cpSync(path.join(pics, f), path.join(PUB, "hm", f));

console.log(`${Object.keys(engine).length} cartes (${fr} en français) · ${readdirSync(dst).length} scripts · ${index.length} cartes dans la recherche`);
