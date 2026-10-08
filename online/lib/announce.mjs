// Déclarer une carte (ANNOUNCE_CARD) : le moteur donne un filtre en notation polonaise inverse (OPCODE_* de constant.lua).
// Même évaluation que le client d'EDOPro : pile d'entiers, la carte est valable si le résultat est non nul.
import { allCodes, cardInfo } from "./engine.mjs";

const OP = 0x40000000n << 32n;
const op = (n) => OP | (BigInt(n) << 32n);
const OPS = { ADD: op(0), SUB: op(1), MUL: op(2), DIV: op(3), AND: op(4), OR: op(5), NEG: op(6), NOT: op(7), BAND: op(8), BOR: op(9), BNOT: op(0x10), BXOR: op(0x11),
  LSHIFT: op(0x12), RSHIFT: op(0x13), ALLOW_ALIASES: op(0x14), ALLOW_TOKENS: op(0x15), ISCODE: op(0x100), ISSETCARD: op(0x101), ISTYPE: op(0x102), ISRACE: op(0x103),
  ISATTRIBUTE: op(0x104), GETCODE: op(0x105), GETSETCARD: op(0x106), GETTYPE: op(0x107), GETRACE: op(0x108), GETATTRIBUTE: op(0x109) };
const TOKEN = 0x4000n;

export function announceValid(code, opcodes) {
  const c = cardInfo(code);
  if (!c) return false;
  const st = [], pop = () => st.pop() ?? 0n, b = (x) => (x ? 1n : 0n);
  let aliases = false, tokens = false;
  const sets = c.setcodes.map(BigInt), type = BigInt(c.type), race = BigInt(c.race), attr = BigInt(c.attribute), id = BigInt(code), alias = BigInt(c.alias || 0);
  for (const raw of opcodes) {
    const o = BigInt(raw);
    switch (o) {
      case OPS.ADD: { const r = pop(), l = pop(); st.push(l + r); break; }
      case OPS.SUB: { const r = pop(), l = pop(); st.push(l - r); break; }
      case OPS.MUL: { const r = pop(), l = pop(); st.push(l * r); break; }
      case OPS.DIV: { const r = pop(), l = pop(); st.push(r ? l / r : 0n); break; }
      case OPS.AND: { const r = pop(), l = pop(); st.push(b(l && r)); break; }
      case OPS.OR: { const r = pop(), l = pop(); st.push(b(l || r)); break; }
      case OPS.NEG: st.push(-pop()); break;
      case OPS.NOT: st.push(b(!pop())); break;
      case OPS.BAND: { const r = pop(), l = pop(); st.push(l & r); break; }
      case OPS.BOR: { const r = pop(), l = pop(); st.push(l | r); break; }
      case OPS.BXOR: { const r = pop(), l = pop(); st.push(l ^ r); break; }
      case OPS.BNOT: st.push(~pop()); break;
      case OPS.LSHIFT: { const r = pop(), l = pop(); st.push(l << r); break; }
      case OPS.RSHIFT: { const r = pop(), l = pop(); st.push(l >> r); break; }
      case OPS.ALLOW_ALIASES: aliases = true; break;
      case OPS.ALLOW_TOKENS: tokens = true; break;
      case OPS.ISCODE: { const v = pop(); st.push(b(id === v || alias === v)); break; }
      case OPS.ISSETCARD: { const v = pop(); st.push(b(sets.some((s) => (s & 0xfffn) === (v & 0xfffn) && (s & v) === v))); break; }
      case OPS.ISTYPE: st.push(b(type & pop())); break;
      case OPS.ISRACE: st.push(b(race & pop())); break;
      case OPS.ISATTRIBUTE: st.push(b(attr & pop())); break;
      case OPS.GETCODE: st.push(id); break;
      case OPS.GETSETCARD: st.push(sets[0] || 0n); break;
      case OPS.GETTYPE: st.push(type); break;
      case OPS.GETRACE: st.push(race); break;
      case OPS.GETATTRIBUTE: st.push(attr); break;
      default: st.push(o);
    }
  }
  if (st.length !== 1 || st[0] === 0n) return false;
  if (!aliases && alias) return false;
  if (!tokens && type & TOKEN) return false;
  return true;
}

/** Une carte valable : d'abord parmi `prefer` (cartes vues chez l'adversaire), sinon la première de la base. */
export function announceCard(opcodes, prefer = []) {
  for (const c of prefer) if (announceValid(c, opcodes)) return c;
  for (const c of allCodes()) if (announceValid(c, opcodes)) return c;
  return 0;
}
