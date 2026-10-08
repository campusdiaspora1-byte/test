// Bot de duel : portage en JavaScript de l'IA générique de WindBot Ignite (ProjectIgnis/windbot, AGPL-3.0),
// c'est-à-dire GameAI.cs + DefaultExecutor.cs + DoEverythingExecutor.cs, l'exécuteur que WindBot utilise pour n'importe quel deck :
//   1. Invoquer Spécialement tout ce qui peut l'être
//   2. Activer les effets, sauf pour répondre à sa propre chaîne (DefaultDontChainMyself), 9 fois max par carte et par tour
//   3. Invoquer Normalement (avec Sacrifices seulement si le monstre est plus fort qu'eux), ou Poser si tous les monstres adverses sont meilleurs
//   4. Changer de position selon le rapport de force (DefaultMonsterRepos)
//   5. Poser les Magies et Pièges restants
//   puis Battle Phase s'il a un monstre en Position d'Attaque, et attaques selon OnSelectAttackTarget.
// Comme WindBot, il ne voit que ce qu'un joueur voit : les cartes face verso adverses comptent pour 0.
import { announceCard } from "./announce.mjs";
import { M, cardInfo, fieldFor } from "./engine.mjs";

const R = { SELECT_BATTLECMD: 0, SELECT_IDLECMD: 1, SELECT_EFFECTYN: 2, SELECT_YESNO: 3, SELECT_OPTION: 4, SELECT_CARD: 5, SELECT_UNSELECT_CARD: 7, SELECT_CHAIN: 8,
  SELECT_DISFIELD: 9, SELECT_PLACE: 10, SELECT_POSITION: 11, SELECT_TRIBUTE: 12, SELECT_COUNTER: 13, SELECT_SUM: 14, SORT_CARD: 15, ANNOUNCE_RACE: 16,
  ANNOUNCE_ATTRIB: 17, ANNOUNCE_CARD: 18, ANNOUNCE_NUMBER: 19, ROCK_PAPER_SCISSORS: 20 };
const POS = { FU_ATK: 1, FD_ATK: 2, FU_DEF: 4, FD_DEF: 8 };
const LOC_MZONE = 0x04, LOC_SZONE = 0x08;
const TYPE = { MONSTER: 0x1, TRAP: 0x4, QUICKPLAY: 0x10000 };
// Indications de sélection (HINTMSG_*) où le bot choisit ses meilleures cartes ; sinon il donne ses plus faibles (coûts, Sacrifices, Matériels)
const GOOD_FOR_ME = new Set([505, 506, 509, 516, 517, 518, 527]); // renvoyer / ajouter à la main, Invoquer Spécialement, Équiper, face recto, contrôler
const BAD_FOR_FOE = new Set([502, 503, 504, 505, 507, 522, 549, 551, 552]); // détruire, bannir, envoyer, renvoyer, cible d'attaque, cibler

const attackOf = (c) => (c && c.code ? (c.atk ?? (cardInfo(c.code) || {}).attack ?? 0) : 0);
const isAttackPos = (c) => !!(c.pos & (POS.FU_ATK | POS.FD_ATK));
// GetDefensePower de WindBot : ATK en Attaque, DEF en Défense ; une carte face verso vaut 0
const power = (c) => (!c || !c.code ? 0 : isAttackPos(c) ? (c.atk ?? 0) : (c.def ?? 0));
const monsters = (side) => side.m.filter(Boolean);

/** Contexte tiré des messages : qui a lancé le dernier maillon, combien de fois chaque carte a été activée ce tour, l'indication de sélection en cours. */
function context(r, me) {
  let lastChain = -1, hint = 0, chainDone = false;
  const activated = {};
  for (let i = r.messages.length - 1; i >= 0; i--) {
    const m = r.messages[i];
    if (m.type === M.NEW_TURN) break;
    if (m.type === M.CHAIN_END) chainDone = true;
    if (m.type === M.CHAINING) {
      if (!chainDone && lastChain === -1) lastChain = m.triggering_controller ?? m.controller;
      if ((m.triggering_controller ?? m.controller) === me) activated[m.code] = (activated[m.code] || 0) + 1;
    }
    if (!hint && m.type === M.HINT && m.hint_type === 3 && m.player === me) hint = Number(m.hint);
  }
  return { lastChain, activated, hint };
}

/** La réponse du bot (équipe `me`) à la question en cours r.pending. memo : mémoire entre deux questions (attaquant choisi). */
export function botAnswer(r, me, memo = {}) {
  const p = r.pending, ctx = context(r, me);
  const [mine, foe] = (() => { const f = fieldFor(r, me); return [f[me], f[1 - me]]; })();
  const canActivate = (c) => (ctx.activated[c.code] || 0) < 9 && ctx.lastChain !== me; // DefaultDontChainMyself + limite de 9
  const myMonsters = monsters(mine), foeMonsters = monsters(foe);
  const bestPower = (list) => (list.length ? Math.max(...list.map(power)) : -1);
  const allEnemyBetter = (value, onlyAtk) => foeMonsters.length > 0 && foeMonsters.every((c) => power(c) > value && (!onlyAtk || isAttackPos(c)));
  const fieldCard = (c) => (c.location === LOC_MZONE ? mine.m[c.sequence] : c.location === LOC_SZONE ? mine.s[c.sequence] : null);

  switch (p.type) {
    case M.SELECT_IDLECMD: {
      if (p.special_summons.length) return { type: R.SELECT_IDLECMD, action: 1, index: 0 };
      const act = p.activates.findIndex(canActivate);
      if (act >= 0) return { type: R.SELECT_IDLECMD, action: 5, index: act };
      for (let i = 0; i < p.summons.length; i++) {
        const c = p.summons[i], info = cardInfo(c.code) || {};
        if (!monsterSummon(info, c.code, myMonsters)) continue;
        // OnSelectMonsterSummonOrSet : Poser si on n'a aucun monstre face recto et que tous les monstres adverses en Attaque sont meilleurs
        const setIdx = p.monster_sets.findIndex((x) => x.code === c.code && x.location === c.location && x.sequence === c.sequence);
        if (setIdx >= 0 && (info.level || 0) <= 4 && !myMonsters.some((m) => m.pos & (POS.FU_ATK | POS.FU_DEF)) && allEnemyBetter(info.attack || 0, true))
          return { type: R.SELECT_IDLECMD, action: 3, index: setIdx };
        return { type: R.SELECT_IDLECMD, action: 0, index: i };
      }
      for (let i = 0; i < p.pos_changes.length; i++) {
        const m = fieldCard(p.pos_changes[i]);
        if (m && monsterRepos(m, bestPower(myMonsters), allEnemyBetter(bestPower(myMonsters), false))) return { type: R.SELECT_IDLECMD, action: 2, index: i };
      }
      if (p.spell_sets.length) return { type: R.SELECT_IDLECMD, action: 4, index: 0 };
      if (p.to_bp && myMonsters.some((m) => m.pos & POS.FU_ATK)) return { type: R.SELECT_IDLECMD, action: 6, index: null };
      return { type: R.SELECT_IDLECMD, action: 7, index: null };
    }
    case M.SELECT_BATTLECMD: {
      const act = p.chains.findIndex(canActivate);
      if (act >= 0) return { type: R.SELECT_BATTLECMD, action: 0, index: act };
      const attackers = p.attacks.map((a, i) => ({ ...a, i, atk: attackOf(mine.m[a.sequence]) })).sort((a, b) => b.atk - a.atk);
      const defenders = foeMonsters.slice().sort((a, b) => power(b) - power(a));
      const go = (a, target) => { memo.attacker = a.code; memo.target = target ? target.seq : null; return { type: R.SELECT_BATTLECMD, action: 1, index: a.i }; };
      const leave = () => ({ type: R.SELECT_BATTLECMD, action: p.to_m2 ? 2 : 3, index: null });
      if (!attackers.length) return leave();
      if (!defenders.length) return go(attackers[attackers.length - 1], null);
      for (let k = 0; k < attackers.length; k++) {
        const a = attackers[k], last = k === attackers.length - 1;
        for (const d of defenders) if (a.atk > power(d) || (a.atk >= power(d) && last && isAttackPos(d))) return go(a, d);
        if (a.can_direct) return go(a, null);
      }
      if (!p.to_m2 && !p.to_ep) return go(attackers[0], defenders[0]);
      return leave();
    }
    case M.SELECT_CHAIN: {
      if (p.forced) return { type: R.SELECT_CHAIN, index: 0 };
      const i = p.selects.findIndex(canActivate);
      return { type: R.SELECT_CHAIN, index: i >= 0 ? i : null };
    }
    case M.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: ctx.lastChain !== me };
    case M.SELECT_YESNO: return { type: R.SELECT_YESNO, yes: true };
    case M.SELECT_OPTION: return { type: R.SELECT_OPTION, index: Math.floor(Math.random() * p.options.length) };
    case M.SELECT_CARD: {
      if (ctx.hint === 549) { // cible d'attaque : celle choisie avec l'attaquant, sinon la plus forte qu'il bat
        const atk = attackOf({ code: memo.attacker, atk: undefined });
        const opts = p.selects.map((c, i) => ({ c, i, pw: power(foe.m[c.sequence]) }));
        const pick = opts.find((o) => o.c.sequence === memo.target) || opts.filter((o) => o.pw < atk).sort((a, b) => b.pw - a.pw)[0];
        if (pick) return { type: R.SELECT_CARD, indicies: [pick.i] };
        if (p.can_cancel) return { type: R.SELECT_CARD, indicies: null };
      }
      return { type: R.SELECT_CARD, indicies: choose(p.selects, p.min, ctx.hint, me) };
    }
    case M.SELECT_TRIBUTE: { // les plus faibles
      const order = p.selects.map((c, i) => ({ i, atk: (cardInfo(c.code) || {}).attack || 0 })).sort((a, b) => a.atk - b.atk);
      return { type: R.SELECT_TRIBUTE, indicies: order.slice(0, p.min).map((o) => o.i) };
    }
    case M.SELECT_UNSELECT_CARD: {
      if (p.can_finish || !p.select_cards.length) return { type: R.SELECT_UNSELECT_CARD, index: null };
      return { type: R.SELECT_UNSELECT_CARD, index: choose(p.select_cards, 1, ctx.hint, me)[0] };
    }
    case M.SELECT_POSITION: { // ATK 0 : Défense face recto ; sinon Attaque face recto
      const info = cardInfo(p.code) || {}, want = info.attack === 0 ? [POS.FU_DEF, POS.FD_DEF, POS.FU_ATK] : [POS.FU_ATK, POS.FU_DEF, POS.FD_DEF, POS.FD_ATK];
      return { type: R.SELECT_POSITION, position: want.find((b) => p.positions & b) || [1, 2, 4, 8].find((b) => p.positions & b) };
    }
    case M.SELECT_PLACE: case M.SELECT_DISFIELD: {
      const out = [];
      for (const [base, loc, n, own] of [[0, LOC_MZONE, 7, true], [8, LOC_SZONE, 8, true], [16, LOC_MZONE, 7, false], [24, LOC_SZONE, 8, false]])
        for (let i = 0; i < n && out.length < p.count; i++) if (!(p.field_mask & (1 << (base + i)))) out.push({ player: own ? p.player : 1 - p.player, location: loc, sequence: i });
      return { type: p.type === M.SELECT_PLACE ? R.SELECT_PLACE : R.SELECT_DISFIELD, places: out };
    }
    case M.SELECT_SUM: return { type: R.SELECT_SUM, indicies: selectSum(p) };
    case M.SELECT_COUNTER: { // GameAI.OnSelectCounter : dans l'ordre, jusqu'au compte
      let left = p.count;
      return { type: R.SELECT_COUNTER, counters: p.cards.map((c) => { const n = Math.min(c.count, left); left -= n; return n; }) };
    }
    case M.SORT_CARD: case M.SORT_CHAIN: return { type: R.SORT_CARD, order: null };
    case M.ANNOUNCE_RACE: { const out = []; for (let b = 1n; out.length < p.count && b < (1n << 40n); b <<= 1n) if (BigInt(p.available) & b) out.push(Number(b)); return { type: R.ANNOUNCE_RACE, races: out }; }
    case M.ANNOUNCE_ATTRIB: { const out = []; for (let b = 1; out.length < p.count && b < 256; b <<= 1) if (p.available & b) out.push(b); return { type: R.ANNOUNCE_ATTRIB, attributes: out }; }
    case M.ANNOUNCE_NUMBER: return { type: R.ANNOUNCE_NUMBER, value: 0 };
    case M.ANNOUNCE_CARD: { // une carte valable, de préférence une que l'adversaire a montrée (terrain, Cimetière, bannies)
      const seen = [...foe.m, ...foe.s, ...foe.gy, ...foe.ban].filter((c) => c && c.code).map((c) => c.code);
      return { type: R.ANNOUNCE_CARD, card: announceCard(p.opcodes, seen) };
    }
    case M.ROCK_PAPER_SCISSORS: return { type: R.ROCK_PAPER_SCISSORS, value: 1 + Math.floor(Math.random() * 3) };
  }
  return null;
}

// DefaultMonsterSummon : Niveau 4 ou moins ; sinon seulement si les Sacrifices sont plus faibles que lui, et pas de doublon face recto
function monsterSummon(info, code, myMonsters) {
  if ((info.level || 0) <= 4) return true;
  if (myMonsters.some((m) => m.code === code && m.pos & (POS.FU_ATK | POS.FU_DEF))) return false;
  let tributes = Math.ceil(((info.level || 0) - 4) / 2);
  for (const m of myMonsters) if (power(m) < (info.attack || 0)) tributes--;
  return tributes <= 0;
}
// DefaultMonsterRepos
function monsterRepos(m, myBest, enemyBetter) {
  const atk = m.atk ?? 0, def = m.def ?? 0, faceup = !!(m.pos & (POS.FU_ATK | POS.FU_DEF));
  if (atk === 0 && faceup) return isAttackPos(m);
  if (isAttackPos(m) && enemyBetter) return true;
  if (!isAttackPos(m) && !enemyBetter && (atk >= def || atk >= myBest)) return true;
  return false;
}
// Choix de cartes : contre l'adversaire ses cartes les plus fortes ; pour soi ses meilleures (recherche, Invocation) ou ses plus faibles (coûts)
function choose(list, min, hint, me) {
  const val = (c) => { const i = cardInfo(c.code) || {}; return i.type & TYPE.MONSTER ? (i.attack || 0) + (i.level || 0) * 100 : 1500; };
  const good = GOOD_FOR_ME.has(hint), bad = BAD_FOR_FOE.has(hint);
  const scored = list.map((c, i) => {
    const foe = c.controller !== me;
    const score = foe ? (bad ? 10000 + val(c) : -val(c)) : good ? 5000 + val(c) : bad ? -10000 - val(c) : -val(c);
    return { i, score };
  }).sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, min)).map((s) => s.i);
}
// GameAI.OnSelectSum : la plus petite combinaison qui fait le compte (exact ou au moins, selon le mode)
function selectSum(p) {
  const must = p.selects_must.reduce((a, c) => a + (c.amount & 0xffff), 0), n = p.selects.length, exact = !p.select_max; // select_max : « au moins » (Rituels) plutôt que « exactement »
  const val = (c, hi) => (hi && c.amount >> 16 ? c.amount >> 16 : c.amount & 0xffff);
  let best = null;
  for (let mask = 1; mask < 1 << Math.min(n, 16); mask++) {
    const idx = [...Array(n).keys()].filter((i) => mask & (1 << i));
    if (idx.length < (p.min || 1) || (p.max && idx.length > p.max)) continue;
    for (const hi of [false, true]) {
      const s = must + idx.reduce((a, i) => a + val(p.selects[i], hi), 0);
      if (exact ? s === p.amount : s >= p.amount) { if (!best || idx.length < best.length) best = idx; }
    }
  }
  return best || [0];
}
