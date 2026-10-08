import { duel, L } from "./harness.mjs";
const all = Array.from({ length: 26 }, (_, i) => 711000001 + i);
const extra = [711000010, 711000012, 711000015, 711000017, 711000019];
const d = await duel({ 0: { deck: all.filter((c) => !extra.includes(c)), extra }, 1: { deck: all.filter((c) => !extra.includes(c)), extra } });
await d.start();
d.run({ maxTurns: 2 });
console.log("tours joués :", d.turn, "· erreurs :", d.errors.length ? d.errors : "aucune");
