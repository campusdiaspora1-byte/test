// Fait jouer deux decks Hueco Mundo l'un contre l'autre avec des réponses automatiques,
// en passant par la relecture (comme le serveur) à chaque réponse.
import { replay, viewFor, M } from "../lib/engine.mjs";
import { OcgResponseType as R } from "ocgcore-wasm";

const HM = (n) => 711000000 + n;
const deck = { main: [1, 1, 1, 6, 6, 6, 4, 9, 9, 11, 11, 13, 13, 20, 20, 20, 5, 5, 5, 22, 22, 14, 16, 18, 2, 2, 2, 3, 3, 3, 7, 7, 8, 21, 23, 24, 25, 26, 26, 3].map(HM),
  extra: [10, 12, 15, 17, 19].map(HM) };
const game = { seed: ["11", "22", "33", "44"], decks: [deck, deck], responses: [] };

function auto(m, step) {
  const pick = (n, k) => [...Array(Math.max(1, k)).keys()].slice(0, n);
  switch (m.type) {
    case M.SELECT_IDLECMD: {
      // essaie d'agir de temps en temps pour exercer les effets, sinon passe
      const acts = [["summons", 0], ["special_summons", 1], ["activates", 5], ["spell_sets", 4], ["monster_sets", 3]];
      for (const [k, a] of acts) if (m[k] && m[k].length && (step % 3 === 0)) return { type: R.SELECT_IDLECMD, action: a, index: 0 };
      return { type: R.SELECT_IDLECMD, action: m.to_bp && step % 2 ? 6 : 7, index: null };
    }
    case M.SELECT_BATTLECMD: return m.attacks && m.attacks.length && step % 2 ? { type: R.SELECT_BATTLECMD, action: 1, index: 0 } : { type: R.SELECT_BATTLECMD, action: m.to_m2 ? 2 : 3, index: null };
    case M.SELECT_CHAIN: return { type: R.SELECT_CHAIN, index: m.forced || (m.selects.length && step % 4 === 0) ? 0 : null };
    case M.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: true };
    case M.SELECT_YESNO: return { type: R.SELECT_YESNO, yes: step % 2 === 0 };
    case M.SELECT_OPTION: return { type: R.SELECT_OPTION, index: 0 };
    case M.SELECT_CARD: return { type: R.SELECT_CARD, indicies: pick(m.min, m.min) };
    case M.SELECT_TRIBUTE: return { type: R.SELECT_TRIBUTE, indicies: pick(m.min, m.min) };
    case M.SELECT_UNSELECT_CARD: return { type: R.SELECT_UNSELECT_CARD, index: m.can_finish || !m.select_cards.length ? null : 0 };
    case M.SELECT_POSITION: return { type: R.SELECT_POSITION, position: [1, 2, 4, 8].find((b) => m.positions & b) };
    case M.SELECT_PLACE: case M.SELECT_DISFIELD: {
      const out = [];
      for (const [base, loc, n] of [[0, 4, 7], [8, 8, 8], [16, 4, 7], [24, 8, 8]])
        for (let i = 0; i < n && out.length < m.count; i++) if (!(m.field_mask & (1 << (base + i)))) out.push({ player: base < 16 ? m.player : 1 - m.player, location: loc, sequence: i });
      return { type: m.type === M.SELECT_PLACE ? R.SELECT_PLACE : R.SELECT_DISFIELD, places: out };
    }
    case M.SELECT_SUM: {
      const must = m.selects_must.reduce((a, c) => a + (c.amount & 0xffff), 0), n = m.selects.length;
      for (let mask = 1; mask < 1 << n; mask++) { let s = must; for (let i = 0; i < n; i++) if (mask & (1 << i)) s += m.selects[i].amount & 0xffff; if (s === m.amount) return { type: R.SELECT_SUM, indicies: [...Array(n).keys()].filter((i) => mask & (1 << i)) }; }
      return { type: R.SELECT_SUM, indicies: [0] };
    }
    case M.SELECT_COUNTER: return { type: R.SELECT_COUNTER, counters: m.cards.map((c, i) => (i === 0 ? m.count : 0)) };
    case M.SORT_CARD: case M.SORT_CHAIN: return { type: R.SORT_CARD, order: null };
    case M.ANNOUNCE_RACE: { const out = []; for (let b = 1n; out.length < m.count; b <<= 1n) if (BigInt(m.available) & b) out.push(b); return { type: R.ANNOUNCE_RACE, races: out }; }
    case M.ANNOUNCE_ATTRIB: return { type: R.ANNOUNCE_ATTRIB, attributes: [1] };
    case M.ANNOUNCE_NUMBER: return { type: R.ANNOUNCE_NUMBER, value: 0 };
    case M.ANNOUNCE_CARD: return { type: R.ANNOUNCE_CARD, card: 89631139 };
    case M.ROCK_PAPER_SCISSORS: return { type: R.ROCK_PAPER_SCISSORS, value: 1 };
  }
  throw new Error("pas de réponse automatique pour " + m.type);
}

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
