// Crée ou met à jour un pack à partir d'une base EDOPro (.cdb, faite avec DataEditorX ou l'éditeur d'EDOPro).
//
//   node scripts/pack-from-cdb.mjs <cartes.cdb> packs/<nom> [--scripts <dossier>] [--pics <dossier>] [--strings <strings.conf>] [--author <pseudo>]
//
// Écrit packs/<nom>/cards.json, crée pack.json s'il n'existe pas, et copie les scripts c<id>.lua et les images <id>.jpg des cartes du .cdb.
// Sans --scripts / --pics / --strings, cherche script/, pics/ et strings.conf à côté du .cdb (la disposition d'un dossier expansions/ d'EDOPro).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import { cdbToCard, parseStringsConf } from "../lib/packs.mjs";

const args = process.argv.slice(2), opt = {}, pos = [];
for (let i = 0; i < args.length; i++) args[i].startsWith("--") ? (opt[args[i].slice(2)] = args[++i]) : pos.push(args[i]);
const [cdb, dir] = pos;
if (!cdb || !dir) { console.error("usage : node scripts/pack-from-cdb.mjs <cartes.cdb> packs/<nom> [--scripts dossier] [--pics dossier] [--strings strings.conf] [--author pseudo]"); process.exit(2); }
const slug = path.basename(path.resolve(dir));
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { console.error(`nom de dossier « ${slug} » : lettres minuscules, chiffres et tirets seulement (ex. packs/mon-archetype)`); process.exit(2); }
const near = path.dirname(path.resolve(cdb));
const scripts = opt.scripts || path.join(near, "script"), pics = opt.pics || path.join(near, "pics"), strings = opt.strings || path.join(near, "strings.conf");

const SQL = await initSqlJs();
const db = new SQL.Database(readFileSync(cdb));
const res = db.exec("select d.id, d.alias, d.setcode, d.type, d.atk, d.def, d.level, d.race, d.attribute, t.name, t.desc, " +
  Array.from({ length: 16 }, (_, i) => `t.str${i + 1}`).join(", ") + " from datas d join texts t on t.id = d.id order by d.id")[0];
db.close();
const cards = (res ? res.values : []).map(([id, alias, setcode, type, atk, def, level, race, attribute, name, desc, ...strs]) =>
  cdbToCard({ id, alias, setcode, type, atk, def, level, race, attribute, name, desc, strs }));

// garde les champs propres au pack ("ignore" du validateur) d'un cards.json existant
const old = existsSync(path.join(dir, "cards.json")) ? JSON.parse(readFileSync(path.join(dir, "cards.json"), "utf8")) : [];
for (const c of cards) { const o = old.find((x) => x.id === c.id); if (o && o.ignore) c.ignore = o.ignore; }
mkdirSync(path.join(dir, "script"), { recursive: true });
mkdirSync(path.join(dir, "pics"), { recursive: true });
writeFileSync(path.join(dir, "cards.json"), "[\n" + cards.map((c) => "  " + JSON.stringify(c)).join(",\n") + "\n]\n");

let copied = 0, pictures = 0;
for (const c of cards) {
  const s = path.join(scripts, `c${c.id}.lua`), p = path.join(pics, `${c.id}.jpg`);
  if (existsSync(s)) { copyFileSync(s, path.join(dir, "script", `c${c.id}.lua`)); copied++; }
  if (existsSync(p)) { copyFileSync(p, path.join(dir, "pics", `${c.id}.jpg`)); pictures++; }
}

const metaFile = path.join(dir, "pack.json");
if (!existsSync(metaFile)) {
  const conf = existsSync(strings) ? parseStringsConf(readFileSync(strings, "utf8")) : { setname: {}, counter: {} };
  const main = cards.filter((c) => !c.types.some((t) => ["FUSION", "SYNCHRO", "XYZ", "LINK", "TOKEN"].includes(t))).map((c) => c.id);
  const extra = cards.filter((c) => c.types.some((t) => ["FUSION", "SYNCHRO", "XYZ", "LINK"].includes(t))).map((c) => c.id);
  const meta = { name: slug.replace(/-/g, " ").replace(/\b\w/g, (x) => x.toUpperCase()), author: opt.author || "", description: "", cover: cards[0] ? cards[0].id : 0,
    setnames: conf.setname, counters: conf.counter, deck: { main: Array.from({ length: Math.min(40, main.length * 3) }, (_, i) => main[i % main.length]), extra: extra.slice(0, 15) } };
  writeFileSync(metaFile, JSON.stringify(meta, null, 2) + "\n");
  console.log(`pack.json créé : complétez "name", "author", "description" et le Deck de démo.`);
}
console.log(`${dir} : ${cards.length} cartes, ${copied} scripts, ${pictures} images. Vérifiez avec : node scripts/validate-pack.mjs ${dir}`);
