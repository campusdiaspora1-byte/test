// Après la fusion d'une Pull Request : date de publication des nouveaux packs (pour la mise en vedette de 14 jours sur l'accueil).
// Écrit "published": "AAAA-MM-JJ" dans le pack.json des packs qui n'en ont pas encore, et affiche leurs noms.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PACKS } from "../lib/packs.mjs";

const today = new Date().toISOString().slice(0, 10), stamped = [];
for (const d of existsSync(PACKS) ? readdirSync(PACKS) : []) {
  const f = path.join(PACKS, d, "pack.json");
  if (!existsSync(f)) continue;
  const meta = JSON.parse(readFileSync(f, "utf8"));
  if (meta.home || meta.published) continue;
  meta.published = today;
  writeFileSync(f, JSON.stringify(meta, null, 2) + "\n");
  stamped.push(meta.name || d);
}
console.log(stamped.join(", "));
