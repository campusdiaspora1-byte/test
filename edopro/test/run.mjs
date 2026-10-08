// Tests de comportement des cartes Hueco Mundo sur le moteur EDOPro.  usage : node run.mjs [filtre]
import { duel, idle, pick, chain, option, attack, toBattle, no, L, P, M, name } from "./harness.mjs";

const C = Object.fromEntries(["ULQ", "LN", "CERO", "SEGUNDA", "FRAC", "MURC", "ENCAD", "DOMIN", "GRIMM", "PANTERA", "STARRK", "LOBOS", "LILY", "BARRA", "ARRO",
  "HARRI", "TIBU", "TRES", "AYON", "GARDE", "LABO", "SZAYEL", "IRA", "SANTA", "AMOR", "GLOTO", "TOKEN"].map((k, i) => [k, 711000001 + i]));
const BEWD = 89631139, DM = 46986414, MST = 5318639, DMG = 38033121, AVIAN = 21844576;
const tests = [];
const t = (title, fn) => tests.push({ title, fn });
const filter = process.argv[2];

// Chaîne une carte dès qu'elle est proposée (Effet Rapide, Magie Jeu-Rapide, déclencheur optionnel)
const chainWhen = (code) => (m) => {
  if (m.type === M.SELECT_CHAIN) { const i = m.selects.findIndex((c) => c.code === code); if (i > -1) return { type: 8, index: i }; }
};
const as = (p, step) => (m) => (m.player === p ? step(m) : undefined);
const pickAll = () => (m) => (m.type === M.SELECT_CARD ? { type: 5, indicies: [...Array(m.max).keys()].slice(0, m.selects.length) } : undefined);
const fresh = (d) => { d.lastIdle = null; return d; };
const selectAnyCard = (code) => (m) => {
  if (m.type === M.SELECT_CARD) { const i = m.selects.findIndex((c) => c.code === code); if (i > -1) return { type: 5, indicies: [i] }; }
};

t("Ulquiorra : Invocation Normale → ajoute Las Noches", async () => {
  const d = await duel({ 0: { hand: [C.ULQ], deck: [BEWD, C.LN, BEWD] } });
  await d.start(); d.steps(idle("summon", C.ULQ)).run({ until: (d) => d.has(0, L.HAND, C.LN), maxTurns: 1 });
  return d.has(0, L.HAND, C.LN) || "Las Noches pas en main";
});

t("Ulquiorra : sans Las Noches au Cimetière, impossible de sortir Murciélago", async () => {
  const d = await duel({ 0: { mzone: [[C.ULQ, 2]], deck: [C.MURC, C.SEGUNDA] } });
  await d.start(); d.run({ until: (d) => d.lastIdle, maxTurns: 1 });
  return !d.lastIdle.activates.some((c) => c.code === C.ULQ) || "l'effet d'Ulquiorra est proposé alors qu'aucune cible n'est légale";
});

t("Ulquiorra : avec Las Noches au Cimetière, se Sacrifie et sort Murciélago du Deck", async () => {
  const d = await duel({ 0: { mzone: [[C.ULQ, 2]], grave: [C.LN], deck: [C.MURC, BEWD] } });
  await d.start(); d.steps(idle("activate", C.ULQ)).run({ until: (d) => d.has(0, L.MZONE, C.MURC), maxTurns: 1 });
  return (d.has(0, L.MZONE, C.MURC) && d.has(0, L.GRAVE, C.ULQ)) || "Murciélago pas invoqué";
});

t("Ulquiorra : ne peut pas sortir Segunda Etapa directement", async () => {
  const d = await duel({ 0: { mzone: [[C.ULQ, 2]], grave: [C.LN], deck: [C.SEGUNDA] } });
  await d.start(); d.run({ until: (d) => d.lastIdle, maxTurns: 1 });
  return !d.lastIdle.activates.some((c) => c.code === C.ULQ) || "Segunda Etapa invocable par Ulquiorra";
});

t("Las Noches : +300 ATK aux Démons TÉNÈBRES, recherche contre défausse", async () => {
  const d = await duel({ 0: { hand: [C.LN, BEWD], mzone: [[C.ULQ, 2]], deck: [C.GRIMM, BEWD] } });
  await d.start();
  d.steps(idle("activate", C.LN), idle("activate", C.LN)).run({ until: (d) => d.has(0, L.HAND, C.GRIMM), maxTurns: 1 });
  const ulq = d.cards(0, L.MZONE).find((c) => c && c.code === C.ULQ);
  if (ulq.attack !== 2100) return `ATK d'Ulquiorra = ${ulq.attack}, attendu 2100`;
  return (d.has(0, L.HAND, C.GRIMM) && d.has(0, L.GRAVE, BEWD)) || "pas de recherche";
});

t("Las Noches : remplacée par un autre Terrain → Invoque Ulquiorra depuis la main", async () => {
  const d = await duel({ 0: { fzone: C.LN, hand: [C.LN, C.ULQ] } });
  await d.start(); d.steps(idle("activate", C.LN)).run({ until: (d) => d.has(0, L.MZONE, C.ULQ), maxTurns: 1 });
  return d.has(0, L.MZONE, C.ULQ) || "Ulquiorra pas invoqué (" + d.dump().split("\n").slice(-4).join(" | ") + ")";
});

t("Encadénate : Las Noches au Cimetière, Murciélago du Deck, puis Las Noches ramène Ulquiorra", async () => {
  const d = await duel({ 0: { fzone: C.LN, hand: [C.ENCAD, C.ULQ], deck: [C.MURC, BEWD] } });
  await d.start(); d.steps(idle("activate", C.ENCAD)).run({ until: (d) => d.has(0, L.MZONE, C.MURC) && d.has(0, L.MZONE, C.ULQ), maxTurns: 1 });
  return (d.has(0, L.MZONE, C.MURC) && d.has(0, L.MZONE, C.ULQ) && d.has(0, L.GRAVE, C.LN)) || "combo incomplet : " + d.dump();
});

t("Murciélago : se Sacrifie → Segunda Etapa ; les monstres adverses perdent 800 ATK", async () => {
  const d = await duel({ 0: { mzone: [[C.MURC, 2]], grave: [C.LN], deck: [C.SEGUNDA, BEWD] }, 1: { mzone: [[BEWD, 2]] } });
  await d.start(); d.steps(idle("activate", C.MURC)).run({ until: (d) => d.has(0, L.MZONE, C.SEGUNDA), maxTurns: 1 });
  if (!d.has(0, L.MZONE, C.SEGUNDA)) return "Segunda Etapa pas invoquée : " + d.dump();
  const b = d.cards(1, L.MZONE).find((c) => c && c.code === BEWD);
  return b.attack === 2200 || `ATK adverse = ${b.attack}, attendu 2200`;
});

t("Murciélago : s'Invoque seul depuis le Cimetière (Las Noches au Cimetière)", async () => {
  const d = await duel({ 0: { grave: [C.LN, C.MURC] } });
  await d.start(); d.steps(idle("spsummon", C.MURC)).run({ until: (d) => d.has(0, L.MZONE, C.MURC), maxTurns: 1 });
  return d.has(0, L.MZONE, C.MURC) || "pas d'Invocation depuis le Cimetière";
});

t("Murciélago : bloqué sans Las Noches au Cimetière", async () => {
  const d = await duel({ 0: { hand: [C.MURC] } });
  await d.start(); d.run({ until: (d) => d.lastIdle, maxTurns: 1 });
  return !d.lastIdle.special_summons.some((c) => c.code === C.MURC) || "Murciélago invocable sans Las Noches";
});

t("Ira : permet Murciélago sans Las Noches au Cimetière", async () => {
  const d = await duel({ 0: { hand: [C.IRA, C.MURC] } });
  await d.start(); d.steps(idle("activate", C.IRA), option(0), idle("spsummon", C.MURC)).run({ until: (d) => d.has(0, L.MZONE, C.MURC), maxTurns: 1 });
  return d.has(0, L.MZONE, C.MURC) || "Murciélago toujours bloqué : " + d.dump();
});

t("Segunda Etapa : détruit les cartes adverses des 3 colonnes et inflige 1000", async () => {
  const d = await duel({ 0: { hand: [BEWD], grave: [C.LN], deck: [C.SEGUNDA], mzone: [[DMG, 0], [DMG, 1], [C.MURC, 2]] }, 1: { mzone: [[DM, 2], [AVIAN, 1], [BEWD, 4]] } });
  await d.start(); d.steps(idle("activate", C.MURC), idle("activate", C.SEGUNDA)).run({ until: (d) => d.lp(1) <= 7000, maxTurns: 1 });
  const opp = d.codes(1, L.MZONE);
  return (d.lp(1) === 7000 && opp.length === 1 && opp[0] === BEWD) || `LP ${d.lp(1)}, restants ${opp.map(name)}`;
});

t("Segunda Etapa : se mélange dans le Deck (Las Noches au Cimetière) et ramène Murciélago", async () => {
  const d = await duel({ 0: { grave: [C.LN, C.MURC], deck: [C.SEGUNDA, BEWD], mzone: [[C.ULQ, 0]] } });
  await d.start();
  // Ulquiorra sort Murciélago (Cimetière), Murciélago sort Segunda, Segunda se mélange et ramène un Ulquiorra
  d.steps(idle("activate", C.ULQ), selectAnyCard(C.MURC), idle("activate", C.MURC, 1), idle("activate", C.SEGUNDA, 1))
    .run({ until: (d) => d.has(0, L.DECK, C.SEGUNDA) && d.codes(0, L.MZONE).length > 0 && !d.has(0, L.MZONE, C.SEGUNDA), maxTurns: 1 });
  return (d.has(0, L.DECK, C.SEGUNDA) && d.codes(0, L.MZONE).some((c) => [C.ULQ, C.MURC].includes(c))) || "boucle incomplète : " + d.dump();
});

t("Cero Oscuras : détruit un monstre adverse et inflige la moitié de son ATK", async () => {
  const d = await duel({ 0: { hand: [C.CERO], mzone: [[C.ULQ, 2]] }, 1: { mzone: [[BEWD, 2]] } });
  await d.start(); d.steps(idle("activate", C.CERO)).run({ until: (d) => d.lp(1) < 8000, maxTurns: 1 });
  return (d.lp(1) === 6500 && !d.has(1, L.MZONE, BEWD)) || `LP adverses ${d.lp(1)}`;
});

t("Cero Oscuras : inactivable sans Ulquiorra ni Las Noches", async () => {
  const d = await duel({ 0: { hand: [C.CERO] }, 1: { mzone: [[BEWD, 2]] } });
  await d.start(); d.run({ until: (d) => d.lastIdle, maxTurns: 1 });
  return !d.lastIdle.activates.some((c) => c.code === C.CERO) || "Cero activable";
});

t("Fracciones (main) : annule l'effet de monstre adverse et ajoute une carte « Cero »", async () => {
  // Tour 2 : le joueur 1 Invoque Ulquiorra (recherche) ; le joueur 0 répond avec Fracciones depuis sa main
  const d = await duel({ 0: { hand: [C.FRAC], deck: [C.CERO, BEWD, BEWD] }, 1: { hand: [C.ULQ], deck: [BEWD, C.LN, BEWD, BEWD] } });
  await d.start();
  d.steps(as(1, idle("summon", C.ULQ)), chainWhen(C.FRAC)).run({ until: (d) => d.has(0, L.HAND, C.CERO), maxTurns: 3 });
  return (d.has(0, L.HAND, C.CERO) && d.has(0, L.GRAVE, C.FRAC) && !d.has(1, L.HAND, C.LN)) || "handtrap : " + d.dump();
});

t("Grimmjow : Invocation Spéciale depuis la main avec Las Noches, puis double attaque", async () => {
  const d = await duel({ 0: { fzone: C.LN, hand: [C.GRIMM] }, 1: { mzone: [[DM, 2]] } });
  await d.start(); d.steps(idle("spsummon", C.GRIMM), idle("activate", C.GRIMM)).run({ until: (d) => d.msgs.some((m) => m.type === M.CHAIN_SOLVED) && d.has(0, L.MZONE, C.GRIMM), maxTurns: 1 });
  const dm = d.cards(1, L.MZONE).find((c) => c && c.code === DM);
  return (d.has(0, L.MZONE, C.GRIMM) && dm.level === 5) || `Niveau adverse ${dm && dm.level}`;
});

t("Pantera : Synchro Grimmjow + Ulquiorra, détruit des Magies/Pièges", async () => {
  const d = await duel({ 0: { mzone: [[C.GRIMM, 1], [C.ULQ, 2]], extra: [C.PANTERA] }, 1: { szone: [[MST, 0], [MST, 1]] } });
  await d.start(); d.steps(idle("spsummon", C.PANTERA), pickAll()).run({ until: (d) => d.has(0, L.MZONE, C.PANTERA) && d.codes(1, L.SZONE).length < 2, maxTurns: 1 });
  return (d.has(0, L.MZONE, C.PANTERA) && d.codes(1, L.SZONE).length === 0) || "Pantera / destruction : " + d.dump();
});

t("Starrk : Invocation Normale → Lilynette du Deck ; Los Lobos exige Las Noches au Cimetière", async () => {
  const d = await duel({ 0: { hand: [C.STARRK], deck: [C.LILY, BEWD], extra: [C.LOBOS] } });
  await d.start(); d.steps(idle("summon", C.STARRK)).run({ until: (d) => d.has(0, L.MZONE, C.LILY), maxTurns: 1 });
  if (!d.has(0, L.MZONE, C.LILY)) return "Lilynette pas invoquée";
  d.run({ until: (d) => d.lastIdle && d.has(0, L.MZONE, C.LILY), maxTurns: 1 });
  return !d.lastIdle.special_summons.some((c) => c.code === C.LOBOS) || "Los Lobos invocable sans Las Noches";
});

t("Los Lobos : Xyz avec Las Noches au Cimetière ; Lilynette cherche un Cero ; dommages", async () => {
  const d = await duel({ 0: { mzone: [[C.STARRK, 1], [C.LILY, 2]], grave: [C.LN], extra: [C.LOBOS], deck: [C.CERO, BEWD] }, 1: { mzone: [[BEWD, 2]], szone: [[MST, 1]] } });
  await d.start(); d.steps(idle("spsummon", C.LOBOS)).run({ until: (d) => d.has(0, L.MZONE, C.LOBOS) && d.has(0, L.HAND, C.CERO), maxTurns: 1 });
  if (!d.has(0, L.MZONE, C.LOBOS)) return "Los Lobos pas invoqué : " + d.dump();
  if (!d.has(0, L.HAND, C.CERO)) return "Lilynette n'a pas cherché Cero";
  fresh(d).steps(idle("activate", C.LOBOS)).run({ until: (d) => d.lp(1) < 8000, maxTurns: 1 });
  return d.lp(1) === 7400 || `LP adverses ${d.lp(1)}, attendu 7400`;
});

t("Barragán : Invocation par 1 Sacrifice (« Espada ») puis Fusion d'Arrogante", async () => {
  const d = await duel({ 0: { hand: [C.BARRA], mzone: [[C.ULQ, 2], [C.GARDE, 1]], grave: [C.LN], extra: [C.ARRO] } });
  await d.start(); d.steps(idle("summon", C.BARRA), option(1)).run({ until: (d) => d.has(0, L.MZONE, C.BARRA), maxTurns: 1 });
  if (!d.has(0, L.MZONE, C.BARRA)) return "Barragán pas invoqué";
  d.steps(idle("activate", C.BARRA)).run({ until: (d) => d.has(0, L.MZONE, C.ARRO), maxTurns: 1 });
  return d.has(0, L.MZONE, C.ARRO) || "Arrogante pas invoquée : " + d.dump();
});

t("Arrogante : Compteur Vieillesse → −1000 ATK et effets annulés", async () => {
  const d = await duel({ 0: { mzone: [[C.ARRO, 2]] }, 1: { mzone: [[DM, 2]] } });
  await d.start(); d.steps(idle("activate", C.ARRO)).run({ until: (d) => { const c = d.cards(1, L.MZONE).find((x) => x && x.code === DM); return c && c.attack < 2500; }, maxTurns: 1 });
  const dm = d.cards(1, L.MZONE).find((x) => x && x.code === DM);
  return (dm && dm.attack === 1500) || `ATK ${dm && dm.attack}`;
});

t("Harribel : s'Invoque en renvoyant un « Espada » en main ; Tiburón en Lien", async () => {
  const d = await duel({ 0: { hand: [C.HARRI], mzone: [[C.ULQ, 2], [C.GARDE, 1]], grave: [C.LN], extra: [C.TIBU] } });
  await d.start(); d.steps(idle("activate", C.HARRI), selectAnyCard(C.ULQ)).run({ until: (d) => d.has(0, L.MZONE, C.HARRI), maxTurns: 1 });
  if (!d.has(0, L.MZONE, C.HARRI) || !d.has(0, L.HAND, C.ULQ)) return "Harribel : " + d.dump();
  d.steps(idle("summon", C.ULQ)).run({ until: (d) => d.has(0, L.MZONE, C.ULQ), maxTurns: 1 });
  d.steps(idle("spsummon", C.TIBU)).run({ until: (d) => d.has(0, L.MZONE, C.TIBU), maxTurns: 1 });
  return d.has(0, L.MZONE, C.TIBU) || "Tiburón pas invoqué : " + d.dump();
});

t("Las Tres Bestias : 3 Jetons, puis Ayon (+300 ATK par carte adverse)", async () => {
  const d = await duel({ 0: { hand: [C.TRES], extra: [C.AYON] }, 1: { mzone: [[BEWD, 2]], szone: [[MST, 0]] } });
  await d.start(); d.steps(idle("summon", C.TRES)).run({ until: (d) => d.codes(0, L.MZONE).filter((c) => c === C.TOKEN).length === 3, maxTurns: 1 });
  if (d.codes(0, L.MZONE).filter((c) => c === C.TOKEN).length !== 3) return "Jetons : " + d.dump();
  d.steps(idle("activate", C.TRES)).run({ until: (d) => { const a = d.cards(0, L.MZONE).find((c) => c && c.code === C.AYON); return a && a.attack > 3000; }, maxTurns: 1 });
  const ay = d.cards(0, L.MZONE).find((c) => c && c.code === C.AYON);
  return (ay && ay.attack === 3600) || `Ayon : ${ay ? ay.attack : "absent"} · ${d.dump().split("\n").slice(-5).join(" | ")}`;
});

t("Garde Servile : Invocation Normale → ajoute un « Espada » de Niveau 4 ou moins", async () => {
  const d = await duel({ 0: { hand: [C.GARDE], deck: [C.BARRA, C.STARRK] } });
  await d.start(); d.steps(idle("summon", C.GARDE)).run({ until: (d) => d.has(0, L.HAND, C.STARRK), maxTurns: 1 });
  return (d.has(0, L.HAND, C.STARRK) && !d.has(0, L.HAND, C.BARRA)) || "mauvaise recherche";
});

t("Szayel : cherche le Laboratoire, s'équipe ; le Laboratoire rend « Espada »", async () => {
  const d = await duel({ 0: { hand: [C.SZAYEL, C.HARRI], mzone: [[BEWD, 2]], deck: [C.LABO] } });
  await d.start(); d.steps(idle("summon", C.SZAYEL)).run({ until: (d) => d.has(0, L.HAND, C.LABO), maxTurns: 1 });
  if (!d.has(0, L.HAND, C.LABO)) return "pas de Laboratoire";
  d.steps(idle("activate", C.SZAYEL)).run({ until: (d) => d.has(0, L.SZONE, C.SZAYEL), maxTurns: 1 });
  if (!d.has(0, L.SZONE, C.SZAYEL)) return "Szayel pas équipé : " + d.dump();
  // Blue-Eyes équipé de Szayel = « Espada » : Harribel peut le cibler
  fresh(d).run({ until: (d) => d.lastIdle, maxTurns: 1 });
  return d.lastIdle.activates.some((c) => c.code === C.HARRI) || "Blue-Eyes équipé n'est pas « Espada »";
});

t("Santa Teresa : 1 « Espada » indestructible et double attaque", async () => {
  const d = await duel({ 0: { mzone: [[C.ULQ, 2]], szone: [[C.SANTA, 0]] } });
  await d.start(); d.steps(idle("activate", C.SANTA)).run({ until: (d) => d.has(0, L.GRAVE, C.SANTA), maxTurns: 1 });
  return d.has(0, L.GRAVE, C.SANTA) || "Santa Teresa pas résolue";
});

t("Amor : prend le contrôle d'un monstre adverse, qui devient « Espada »", async () => {
  const d = await duel({ 0: { szone: [[C.AMOR, 0]], hand: [C.HARRI] }, 1: { mzone: [[BEWD, 2]] } });
  await d.start(); d.steps(idle("activate", C.AMOR)).run({ until: (d) => d.has(0, L.MZONE, BEWD), maxTurns: 1 });
  if (!d.has(0, L.MZONE, BEWD)) return "pas de prise de contrôle";
  fresh(d).run({ until: (d) => d.lastIdle, maxTurns: 1 });
  return d.lastIdle.activates.some((c) => c.code === C.HARRI) || "le monstre volé n'est pas « Espada »";
});

t("Glotonería : bannit un monstre du Cimetière, +ATK et son nom", async () => {
  const d = await duel({ 0: { hand: [C.GLOTO], mzone: [[C.ULQ, 2]] }, 1: { grave: [BEWD] } });
  await d.start(); d.steps(idle("activate", C.GLOTO)).run({ until: (d) => d.codes(1, L.REMOVED).includes(BEWD), maxTurns: 1 });
  const u = d.cards(0, L.MZONE).find((c) => c && c.code === C.ULQ);
  return (u && u.attack === 3300) || `ATK ${u && u.attack}`;
});

t("Laboratoire : déclare un Type, Sacrifie pour piocher", async () => {
  const d = await duel({ 0: { hand: [C.LABO], mzone: [[BEWD, 2]], deck: [DM, DM] } });
  await d.start(); d.steps(idle("activate", C.LABO), idle("activate", C.LABO)).run({ until: (d) => d.has(0, L.HAND, DM), maxTurns: 1 });
  return (d.has(0, L.HAND, DM) && d.has(0, L.GRAVE, BEWD)) || "pas de pioche : " + d.dump();
});

let pass = 0, fail = 0, manual = 0;
for (const { title, fn } of tests) {
  if (filter && !title.toLowerCase().includes(filter.toLowerCase())) continue;
  let res;
  try { res = await fn(); } catch (e) { res = "exception : " + e.message; }
  if (res === true) { pass++; console.log("✓", title); }
  else if (res === "manuel") { manual++; console.log("…", title, "(à compléter)"); }
  else { fail++; console.log("✗", title, "\n   ", res); }
}
console.log(`\n${pass} réussis, ${fail} échoués${manual ? `, ${manual} à compléter` : ""}`);
process.exit(fail ? 1 : 0);
