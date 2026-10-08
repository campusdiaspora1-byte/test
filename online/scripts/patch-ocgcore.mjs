// ocgcore-wasm lit le message MOVE sans sa dernière valeur, la raison du déplacement (REASON_DESTROY, REASON_BATTLE…).
// Le journal du duel en a besoin pour dire « détruit au combat », « Sacrifié », « défaussé »… On ajoute sa lecture (idempotent).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "ocgcore-wasm", "dist");
const FROM = "case 50:return{type:t,card:e.u32(),from:p(e),to:p(e)}", TO = "case 50:return{type:t,card:e.u32(),from:p(e),to:p(e),reason:e.u32()}";
let patched = 0;
for (const f of readdirSync(DIST).filter((x) => x.endsWith(".js"))) {
  const file = path.join(DIST, f), src = readFileSync(file, "utf8");
  if (src.includes(FROM)) { writeFileSync(file, src.replace(FROM, TO)); patched++; }
  else if (src.includes(TO)) patched++;
}
if (!patched) console.warn("ocgcore-wasm : lecture du message MOVE introuvable, la raison des déplacements ne sera pas affichée");
