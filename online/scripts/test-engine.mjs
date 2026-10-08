// Fait jouer deux decks Hueco Mundo l'un contre l'autre avec des réponses automatiques,
// en passant par la relecture (comme le serveur) à chaque réponse.
import { replay, viewFor } from "../lib/engine.mjs";
import { auto } from "../lib/autoplay.mjs";

const HM = (n) => 711000000 + n;
const deck = { main: [1, 1, 1, 6, 6, 6, 4, 9, 9, 11, 11, 13, 13, 20, 20, 20, 5, 5, 5, 22, 22, 14, 16, 18, 2, 2, 2, 3, 3, 3, 7, 7, 8, 21, 23, 24, 25, 26, 26, 3].map(HM),
  extra: [10, 12, 15, 17, 19].map(HM) };
const game = { seed: ["11", "22", "33", "44"], decks: [deck, deck], responses: [] };

let t0 = Date.now(), slowest = 0, rejected = 0;
for (let step = 0; step < 400; step++) {
  const s = Date.now();
  const r = await replay(game);
  if (r.ended) { console.log(`fin de partie après ${step} réponses, gagnant : équipe ${r.winner}`); r.close(); break; }
  const p = r.pending.player, v = viewFor(r, p), o = viewFor(r, 1 - p);
  // aucune carte de la main adverse ne doit être visible
  if (v.field[1 - p].hand.some((c) => c && c.code)) throw new Error("fuite : main adverse visible");
  if (o.prompt) throw new Error("la question est envoyée au mauvais joueur");
  const resp = auto(v.prompt, step);
  r.close();
  const check = await replay(game, { team: p, r: resp });
  if (!check.accepted) { rejected++; console.log("réponse refusée", v.prompt.type, JSON.stringify(resp, (k, x) => (typeof x === "bigint" ? Number(x) : x))); break; }
  check.close();
  game.responses.push({ team: p, r: resp });
  slowest = Math.max(slowest, Date.now() - s);
}
const r = await replay(game);
const v = viewFor(r, 0);
console.log(`${game.responses.length} réponses · LP ${v.field[0].lp} / ${v.field[1].lp} · ${Date.now() - t0} ms au total, ${slowest} ms max par réponse (2 relectures) · erreurs moteur : ${r.errors.length}`);
console.log("derniers événements :", v.log.slice(-6).map((e) => e.type).join(","));
if (r.errors.length) console.log(r.errors.slice(0, 5));
r.close();
