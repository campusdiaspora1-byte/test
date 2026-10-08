// Réponses automatiques aux questions du moteur (tests et validateur de packs).
// vary : varie les cartes choisies d'une réponse à l'autre, pour essayer plus d'effets.
import { OcgMessageType as M, OcgResponseType as R } from "ocgcore-wasm";

export function auto(m, step, vary = false) {
  const at = (list) => (vary ? (step * 7 + 3) % list.length : 0);
  const pick = (n, k) => [...Array(Math.max(1, k)).keys()].slice(0, n);
  switch (m.type) {
    case M.SELECT_IDLECMD: {
      // essaie d'agir de temps en temps pour exercer les effets, sinon passe
      const acts = [["summons", 0], ["special_summons", 1], ["activates", 5], ["spell_sets", 4], ["monster_sets", 3]];
      for (const [k, a] of acts) if (m[k] && m[k].length && (step % 3 === 0)) return { type: R.SELECT_IDLECMD, action: a, index: at(m[k]) };
      return { type: R.SELECT_IDLECMD, action: m.to_bp && step % 2 ? 6 : 7, index: null };
    }
    case M.SELECT_BATTLECMD: return m.attacks && m.attacks.length && step % 2 ? { type: R.SELECT_BATTLECMD, action: 1, index: at(m.attacks) } : { type: R.SELECT_BATTLECMD, action: m.to_m2 ? 2 : 3, index: null };
    case M.SELECT_CHAIN: return { type: R.SELECT_CHAIN, index: m.forced || (m.selects.length && step % 4 === 0) ? at(m.selects) : null };
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

// Réponse « prudente » quand le moteur refuse la précédente : passer, finir, ne rien choisir de plus.
export const pass = (m) => auto(m, 1);
