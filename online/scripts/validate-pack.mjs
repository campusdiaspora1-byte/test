// Validateur de packs : vérifie un ou plusieurs dossiers packs/<nom>/ et écrit un rapport (Markdown) qui explique quoi corriger.
//
//   npm run build                                  (une fois : cartes officielles et scripts d'EDOPro)
//   node scripts/validate-pack.mjs packs/<nom> [packs/<autre>…] [--report rapport.md] [--json resultat.json]
//
// Contrôles :
//   1. fichiers et champs (cards.json, pack.json, numéros libres, statistiques, types cohérents, images)
//   2. scripts : présents, chargés par le moteur d'EDOPro sans erreur Lua, procédures d'Invocation de l'Extra Deck
//   3. texte ↔ script : chaque action annoncée par le texte (« une fois par tour », « piochez », « détruisez »…) existe dans le script
//   4. parties test : le Deck de démo joue contre lui-même, réponses automatiques, sans erreur du moteur
// Le pack passe s'il n'y a aucune erreur (✗). Les avertissements (⚠) sont à relire mais ne bloquent pas.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { M, autoDuel, cardInfo, loadErrors, useLocal } from "../lib/engine.mjs";
import { auto, pass } from "../lib/autoplay.mjs";
import { TYPES, isExtra, loadPack, parseStringsConf } from "../lib/packs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const args = process.argv.slice(2), opt = {}, dirs = [];
for (let i = 0; i < args.length; i++) args[i].startsWith("--") ? (opt[args[i].slice(2)] = args[++i]) : dirs.push(args[i]);
if (!dirs.length) { console.error("usage : node scripts/validate-pack.mjs packs/<nom> [--report rapport.md] [--json resultat.json]"); process.exit(2); }
if (!existsSync(path.join(DATA, "sources.json"))) { console.error("Lancez d'abord `npm run build` (cartes officielles et scripts d'EDOPro)."); process.exit(2); }

const ENGINE = JSON.parse(readFileSync(path.join(DATA, "cards.json"), "utf8"));
const SOURCES = JSON.parse(readFileSync(path.join(DATA, "sources.json"), "utf8"));
const NAMES = (() => { // noms des cartes officielles (pour dire avec qui un numéro entre en conflit)
  const out = {};
  const dir = path.join(ROOT, "public", "t");
  if (existsSync(dir)) for (const f of readdirSync(dir)) for (const [id, t] of Object.entries(JSON.parse(readFileSync(path.join(dir, f), "utf8")))) out[id] = t[0];
  return out;
})();
const OFFICIAL_SETS = (() => {
  const f = path.join(ROOT, ".cache", "Distribution", "config", "strings.conf");
  return existsSync(f) ? parseStringsConf(readFileSync(f, "utf8")).setname : {};
})();
const OTHER_PACKS = existsSync(path.join(ROOT, "packs")) ? readdirSync(path.join(ROOT, "packs")).filter((d) => existsSync(path.join(ROOT, "packs", d, "pack.json"))) : [];

// ---------- texte ↔ script ----------
// Le texte est comparé sans accents ni majuscules. Chaque règle : ce que dit le texte → ce que le script doit contenir.
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’`]/g, "'");
const RULES = [
  { id: "once-per-turn", what: "« une fois par tour » / « par tour »", text: /par tour|per turn/, code: /SetCountLimit|FlagEffect/, fix: "Limitez l'effet : `e1:SetCountLimit(1,id)` (un compteur par effet : `{id,0}`, `{id,1}`…), ou `SetCountLimit(1,id,EFFECT_COUNT_CODE_OATH)` pour « vous ne pouvez activer qu'1 carte … par tour »." },
  { id: "quick-effect", what: "« (Effet Rapide) »", text: /\(effet rapide\)|\(quick effect\)/, code: /EFFECT_TYPE_QUICK_[OF]/, fix: "Un Effet Rapide se déclare avec `e:SetType(EFFECT_TYPE_QUICK_O)` et `e:SetCode(EVENT_FREE_CHAIN)` (ou l'évènement voulu)." },
  { id: "special-summon", what: "Invocation Spéciale", text: /invoqu\w* specialement|special summon/, code: /SpecialSummon|SPSUMMON|AddProcedure|EnableReviveLimit/, fix: "Invoquez avec `Duel.SpecialSummon(…)` dans l'opération (catégorie `CATEGORY_SPECIAL_SUMMON`), ou une procédure `EFFECT_SPSUMMON_PROC` / `EFFECT_SPSUMMON_CONDITION` pour une condition d'Invocation." },
  { id: "unsummonable", what: "« ne peut pas être Invoqué Normalement »", text: /ne peut pas etre invoqu\w* normalement|cannot be normal summoned/, code: /EnableUnsummonable|EnableReviveLimit|AddProcedure|EFFECT_CANNOT_SUMMON|SPSUMMON_CONDITION/, fix: "Ajoutez `c:EnableUnsummonable()` (et `c:EnableReviveLimit()` si elle doit d'abord être Invoquée correctement)." },
  { id: "destroy", what: "destruction", text: /\bdetrui|\bdestroy/, code: /Destroy|DESTROY|INDESTRUCTABLE/, fix: "Détruisez avec `Duel.Destroy(g,REASON_EFFECT)` (catégorie `CATEGORY_DESTROY`) ; pour « si cette carte est détruite », utilisez `EVENT_DESTROYED`." },
  { id: "indestructible", what: "« ne peut pas être détruit »", text: /ne peu\w* pas etre detrui|cannot be destroyed/, code: /INDESTRUCTABLE|DESTROY_REPLACE|DESTROY_SUBSTITUTE/, fix: "Protégez avec un effet `EFFECT_INDESTRUCTABLE_BATTLE` ou `EFFECT_INDESTRUCTABLE_EFFECT` (valeur 1)." },
  { id: "draw", what: "pioche", text: /\bpioch|\bdraws?\b/, code: /Draw|DRAW/, fix: "Faites piocher avec `Duel.Draw(tp,1,REASON_EFFECT)` (catégorie `CATEGORY_DRAW`, et `Duel.IsPlayerCanDraw` dans la cible)." },
  { id: "banish", what: "bannissement", text: /\bbanni|\bbanish/, code: /Remove|REMOVED|REMOVE|Banish|bfgcost/, fix: "Bannissez avec `Duel.Remove(g,POS_FACEUP,REASON_EFFECT)` (catégorie `CATEGORY_REMOVE`)." },
  { id: "to-hand", what: "ajout à la main", text: /\bajout\w* .{0,120}\bmain\b|add .{0,80}\bhand\b|renvo\w* .{0,80}\ba la main/, code: /SendtoHand|TOHAND|SEARCH/, fix: "Ajoutez à la main avec `Duel.SendtoHand(g,nil,REASON_EFFECT)` puis `Duel.ConfirmCards(1-tp,g)` (catégories `CATEGORY_TOHAND+CATEGORY_SEARCH` depuis le Deck)." },
  { id: "to-grave", what: "envoi au Cimetière", text: /\benvo\w* .{0,80}cimetiere|send .{0,60}\b(gy|graveyard)\b/, code: /SendtoGrave|TOGRAVE|TO_GRAVE|GRAVE|ToGrave/, fix: "Envoyez avec `Duel.SendtoGrave(g,REASON_EFFECT)` ; pour « si cette carte est envoyée au Cimetière », utilisez `EVENT_TO_GRAVE`." },
  { id: "discard", what: "défausse", text: /\bdefauss|\bdiscard/, code: /Discard|DISCARD|SendtoGrave/, fix: "Défaussez avec `Duel.DiscardHand(tp,Card.IsDiscardable,1,1,REASON_COST+REASON_DISCARD)` (en coût) ou `REASON_EFFECT+REASON_DISCARD`." },
  { id: "damage", what: "dommages", text: /\binflig|inflict|dommages? (de combat )?percant|piercing/, code: /Damage|DAMAGE|PIERCE/, fix: "Infligez avec `Duel.Damage(1-tp,montant,REASON_EFFECT)` (catégorie `CATEGORY_DAMAGE`) ; dommages perçants : `EFFECT_PIERCE`." },
  { id: "pierce", what: "dommages perçants", text: /percant|piercing/, code: /EFFECT_PIERCE/, fix: "Ajoutez un effet `EFFECT_TYPE_SINGLE` de code `EFFECT_PIERCE`." },
  { id: "recover", what: "gain de LP", text: /\bgagn\w* .{0,30}\b(lp|points de vie)|gain .{0,30}\blp\b/, code: /Recover/, fix: "Faites gagner des LP avec `Duel.Recover(tp,montant,REASON_EFFECT)` (catégorie `CATEGORY_RECOVER`)." },
  { id: "pay-lp", what: "paiement de LP", text: /\bpay\w* \d+ ?(lp|points de vie)|pay \d+ lp/, code: /PayLPCost|CheckLPCost|SetLP|Cost\.PayLP/, fix: "Payez en coût : `if chk==0 then return Duel.CheckLPCost(tp,1000) end Duel.PayLPCost(tp,1000)`." },
  { id: "negate-activation", what: "annulation d'activation", text: /annul\w* (l'|son |leur )?activation|negate the activation/, code: /NegateActivation|NEGATE/, fix: "Annulez avec `Duel.NegateActivation(ev)` (catégorie `CATEGORY_NEGATE`, évènement `EVENT_CHAINING`)." },
  { id: "negate-effect", what: "annulation d'effets", text: /annul\w* (les |ses |son |leurs |l')?effets?|negate .{0,20}effects?/, code: /Negate|DISABLE/, fix: "Annulez les effets d'une carte avec `c:NegateEffects(e:GetHandler(),RESET_PHASE+PHASE_END)` ou des effets `EFFECT_DISABLE` + `EFFECT_DISABLE_EFFECT`." },
  { id: "target", what: "cible", text: /\bcibl|\btargets?\b/, code: /CARD_TARGET|SelectTarget|GetFirstTarget|GetTargetCards|EFFECT_TARGET|CANNOT_BE_EFFECT_TARGET|GetChainInfo/, fix: "Un effet qui cible se déclare avec `e:SetProperty(EFFECT_FLAG_CARD_TARGET)` et choisit avec `Duel.SelectTarget(…)` dans la cible." },
  { id: "tribute", what: "Sacrifice", text: /\bsacrifi|\btribut/, code: /Release|RELEASE|TRIBUTE|Tribute|SUMMON_PROC/, fix: "Sacrifiez avec `Duel.Release(g,REASON_COST)` (ou `REASON_EFFECT`) ; `Duel.CheckReleaseGroupCost` pour vérifier le coût." },
  { id: "atk-def", what: "modification d'ATK/DEF", text: /\b(gagn|perd)\w* \d+ (atk|def)|\b(gains?|loses?) \d+ (atk|def)/, code: /UPDATE_(ATTACK|DEFENSE)|SET_(ATTACK|DEFENSE)|UpdateAttack|UpdateDefense/, fix: "Changez l'ATK avec un effet de code `EFFECT_UPDATE_ATTACK` (et `EFFECT_UPDATE_DEFENSE`) et la valeur voulue." },
  { id: "to-deck", what: "retour dans le Deck", text: /\b(melang|renvo|remet|place)\w* .{0,80}\bdeck\b|shuffle .{0,50}deck|return .{0,50}deck/, code: /SendtoDeck|ShuffleDeck|TODECK|ToDeck|SendtoExtraP|DECK/, fix: "Renvoyez avec `Duel.SendtoDeck(g,nil,SEQ_DECKSHUFFLE,REASON_EFFECT)` (catégorie `CATEGORY_TODECK`)." },
  { id: "attack-all", what: "attaque de tous les monstres", text: /attaquer tous les monstres|attack all monsters/, code: /EFFECT_ATTACK_ALL/, fix: "Ajoutez un effet `EFFECT_TYPE_SINGLE` de code `EFFECT_ATTACK_ALL` (valeur 1)." },
  { id: "direct-attack", what: "attaque directe", text: /peu\w* attaquer directement|can attack directly/, code: /EFFECT_DIRECT_ATTACK/, fix: "Ajoutez un effet de code `EFFECT_DIRECT_ATTACK`." },
  { id: "extra-attack", what: "attaques supplémentaires", text: /(deux|2) attaques|attaquer (deux|2) fois|attack twice/, code: /EXTRA_ATTACK/, fix: "Ajoutez un effet de code `EFFECT_EXTRA_ATTACK` (valeur 1 pour une 2e attaque)." },
  { id: "token", what: "Jeton", text: /\bjetons?\b|\btokens?\b/, code: /CreateToken|TOKEN/, fix: "Créez le Jeton avec `Duel.CreateToken(tp,id_du_jeton)` puis `Duel.SpecialSummon` (catégorie `CATEGORY_TOKEN`) ; le Jeton doit avoir sa propre carte de type TOKEN dans cards.json." },
  { id: "counter", what: "compteurs", text: /\bcompteurs?\b/, code: /Counter|COUNTER/, fix: "Déclarez le compteur avec `c:EnableCounterPermit(0x…)` et posez-le avec `AddCounter` ; nommez-le dans \"counters\" de pack.json." },
  { id: "control", what: "prise de contrôle", text: /prenez le controle|prendre le controle|take control/, code: /GetControl|CONTROL/, fix: "Prenez le contrôle avec `Duel.GetControl(tc,tp)` (catégorie `CATEGORY_CONTROL`)." },
  { id: "fusion-summon", what: "Invocation Fusion par effet", text: /invoqu\w* par fusion|fusion summon/, code: /Fusion|FUSION/, fix: "Pour une Magie de Fusion, utilisez `Fusion.CreateSummonEff(c,filtre)`." },
];
// Ce que le script fait et que le texte devrait annoncer (avertissement seulement)
const ACTIONS = [
  { what: "détruit des cartes", code: /Duel\.Destroy\(/, text: /detrui|destroy/ },
  { what: "fait piocher", code: /Duel\.Draw\(/, text: /pioch|draw/ },
  { what: "inflige des dommages", code: /Duel\.Damage\(/, text: /dommage|damage/ },
  { what: "fait gagner des LP", code: /Duel\.Recover\(/, text: /lp|points de vie/ },
  { what: "bannit des cartes", code: /Duel\.Remove\(/, text: /banni|banish/ },
  { what: "Invoque Spécialement", code: /Duel\.SpecialSummon\(/, text: /invoqu|summon/ },
  { what: "ajoute des cartes à la main", code: /Duel\.SendtoHand\(/, text: /main|hand/ },
  { what: "prend le contrôle d'une carte", code: /Duel\.GetControl\(/, text: /controle|control/ },
];

// ---------- vérification d'un pack ----------
async function check(dir) {
  const p = loadPack(path.resolve(dir));
  const issues = []; // { level: "error" | "warn", card?: id, msg, fix? }
  const add = (level, card, msg, fix) => issues.push({ level, card, msg, fix });
  for (const x of p.problems) add(x.level, null, x.msg, x.fix);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) add("error", null, `nom de dossier « ${p.slug} » invalide`, "Le dossier doit s'appeler packs/<nom> avec des minuscules, des chiffres et des tirets (ex. packs/mon-archetype).");
  const meta = p.meta || {}, ids = new Set(), byName = new Map();
  const mine = new Map(p.cards.filter((c) => Number.isInteger(c.card.id)).map((c) => [c.card.id, c]));

  // ----- pack.json -----
  if (typeof meta.name !== "string" || meta.name.trim().length < 2 || meta.name.length > 40) add("error", null, "pack.json : \"name\" manquant ou trop long", "Donnez au pack un nom de 2 à 40 caractères (affiché sur la page d'accueil).");
  if (typeof meta.author !== "string" || !meta.author.trim()) add("error", null, "pack.json : \"author\" manquant", "Indiquez votre pseudo dans \"author\".");
  if (!meta.description) add("warn", null, "pack.json : pas de \"description\"", "Une phrase de présentation s'affiche sur la page d'accueil quand le pack est en vedette.");
  if (meta.home && p.slug !== "hueco-mundo") add("error", null, "pack.json : \"home\" est réservé au pack Hueco Mundo", "Retirez \"home\".");
  if (meta.published != null && !/^\d{4}-\d{2}-\d{2}/.test(String(meta.published))) add("error", null, "pack.json : \"published\" doit être une date AAAA-MM-JJ", "Laissez ce champ vide : il est rempli automatiquement à la publication.");
  if (!mine.has(+meta.cover)) add("error", null, "pack.json : \"cover\" n'est pas une carte du pack", "Mettez dans \"cover\" le numéro de la carte qui représente le pack (son image sert de couverture).");
  else if (!existsSync(path.join(p.dir, "pics", `${meta.cover}.jpg`))) add("error", null, `l'image de couverture pics/${meta.cover}.jpg manque`, "Ajoutez l'illustration de la carte de couverture.");
  const setnames = {};
  for (const [code, name] of Object.entries(meta.setnames || {})) {
    if (!/^0x[0-9a-f]{1,4}$/i.test(code)) { add("error", null, `pack.json : code d'archétype « ${code} » invalide`, "Format : \"0xf80\": \"Nom de l'archétype\"."); continue; }
    setnames[code.toLowerCase()] = name;
    const official = OFFICIAL_SETS[code.toLowerCase()];
    if (official && official !== name) add("error", null, `le code d'archétype ${code} est déjà celui de l'archétype officiel « ${official} »`, "Choisissez un code libre (par ex. entre 0xf80 et 0xfff, en vérifiant les autres packs).");
  }
  for (const other of OTHER_PACKS) {
    if (other === p.slug) continue;
    try {
      const o = JSON.parse(readFileSync(path.join(ROOT, "packs", other, "pack.json"), "utf8"));
      for (const code of Object.keys(o.setnames || {})) if (setnames[code.toLowerCase()] && o.setnames[code] !== setnames[code.toLowerCase()])
        add("error", null, `le code d'archétype ${code} est déjà utilisé par le pack « ${o.name || other} » (${o.setnames[code]})`, "Choisissez un autre code.");
    } catch (e) { /* l'autre pack sera vérifié à son tour */ }
  }

  // ----- cartes : champs -----
  const usedSets = new Set();
  for (const { card, row, problems } of p.cards) {
    const id = card.id;
    const at = Number.isInteger(id) ? id : null;
    if (!at || id < 1 || id > 0xffffffff) { add("error", null, `carte « ${card.name || "?"} » : numéro \"id\" manquant ou invalide`, `Utilisez un nombre entier libre, par ex. ${freeRange()}.`); continue; }
    if (ids.has(id)) add("error", id, "numéro en double dans cards.json", "Chaque carte doit avoir son propre numéro.");
    ids.add(id);
    const owner = SOURCES.cards[id] || (ENGINE[id] ? "official" : null); // une carte encore absente des données préparées est une nouvelle carte
    if (owner && owner !== p.slug) {
      const who = owner === "official" ? `la carte officielle « ${NAMES[id] || id} »` : `la carte du pack « ${owner} »`;
      add("error", id, `le numéro ${id} est déjà pris par ${who}`, `Renumérotez les cartes du pack dans une plage libre, par ex. ${freeRange()}, et renommez les scripts (c<id>.lua) et images (<id>.jpg) en conséquence.`);
    }
    for (const x of problems) add(x.level, id, x.msg, x.fix);
    if (!card.name || !String(card.name).trim()) add("error", id, "nom manquant", "Renseignez \"name\".");
    else if (byName.has(card.name)) add("error", id, `même nom que la carte ${byName.get(card.name)}`, "Deux cartes ne peuvent pas avoir le même nom.");
    else byName.set(card.name, id);
    const type = row[2], monster = type & TYPES.MONSTER, level = row[3];
    if (!String(card.text || "").trim()) add(type & TYPES.NORMAL ? "warn" : "error", id, "texte de la carte vide", "Renseignez \"text\" : c'est lui que lisent les joueurs, et que le validateur compare au script.");
    (card.setcodes || []).forEach((s) => usedSets.add(String(s).toLowerCase()));
    if (monster) {
      const ex = [TYPES.FUSION, TYPES.SYNCHRO, TYPES.XYZ, TYPES.LINK].filter((b) => type & b).length;
      if (ex > 1) add("error", id, "plusieurs types d'Extra Deck à la fois (Fusion, Synchro, Xyz, Lien)", "Gardez-en un seul.");
      if (!(type & (TYPES.NORMAL | TYPES.EFFECT | TYPES.TOKEN))) add("warn", id, "monstre ni NORMAL ni EFFECT", "Ajoutez \"EFFECT\" (ou \"NORMAL\" pour un monstre sans effet).");
      if (type & TYPES.NORMAL && type & TYPES.EFFECT) add("error", id, "monstre à la fois NORMAL et EFFECT", "Gardez l'un des deux.");
      if (type & TYPES.LINK) {
        const n = (card.markers || []).length;
        if (level < 1 || level > 6) add("error", id, `Lien-${level} : la valeur Lien doit aller de 1 à 6`, "Renseignez \"link\".");
        if (n !== level) add("error", id, `Lien-${level} avec ${n} flèche(s)`, "Un monstre Lien a autant de flèches que sa valeur Lien.");
      } else if (type & TYPES.XYZ) { if (level < 0 || level > 13) add("error", id, `Rang ${level} invalide`, "\"rank\" : de 0 à 13."); }
      else if (!(type & TYPES.TOKEN) && (level < 1 || level > 12)) add("error", id, `Niveau ${level} invalide`, "\"level\" : de 1 à 12.");
      for (const k of ["atk", "def"]) if (Number.isInteger(card[k]) && card[k] > 10000) add("warn", id, `${k.toUpperCase()} ${card[k]} très élevée`, "Vérifiez la valeur.");
      if (type & (TYPES.QUICKPLAY | TYPES.CONTINUOUS | TYPES.EQUIP | TYPES.FIELD | TYPES.COUNTER)) add("error", id, "un monstre ne peut pas être Jeu-Rapide, Continu, Équipement, Terrain ou Contre-Piège", "Retirez ce type.");
    } else if (type & TYPES.SPELL) {
      if ([TYPES.QUICKPLAY, TYPES.CONTINUOUS, TYPES.EQUIP, TYPES.FIELD, TYPES.RITUAL].filter((b) => type & b).length > 1) add("error", id, "Magie de plusieurs sous-types à la fois", "Gardez un seul sous-type : QUICKPLAY, CONTINUOUS, EQUIP, FIELD ou RITUAL (aucun pour une Magie Normale).");
      if (type & (TYPES.TRAP | TYPES.COUNTER | TYPES.EFFECT | TYPES.NORMAL)) add("error", id, "type incompatible avec une Magie", "Une Magie n'est ni TRAP, ni COUNTER, ni EFFECT, ni NORMAL.");
    } else if (type & TYPES.TRAP) {
      if (type & (TYPES.QUICKPLAY | TYPES.EQUIP | TYPES.FIELD | TYPES.RITUAL | TYPES.EFFECT | TYPES.NORMAL)) add("error", id, "type incompatible avec un Piège", "Un Piège peut seulement être CONTINUOUS ou COUNTER (aucun pour un Piège Normal).");
      if (type & TYPES.CONTINUOUS && type & TYPES.COUNTER) add("error", id, "Piège à la fois Continu et Contre-Piège", "Gardez l'un des deux.");
    }
    const pic = path.join(p.dir, "pics", `${id}.jpg`);
    if (!existsSync(pic)) { if (!(type & TYPES.TOKEN)) add("warn", id, `image pics/${id}.jpg manquante`, "Sans image, la carte s'affiche comme un cadre avec son nom. Format conseillé : JPEG 400 × 580 environ, moins de 300 Ko."); }
    else {
      const buf = readFileSync(pic);
      if (buf[0] !== 0xff || buf[1] !== 0xd8) add("error", id, `pics/${id}.jpg n'est pas un vrai JPEG`, "Convertissez l'image en JPEG (pas un PNG renommé).");
      else if (buf.length > 1024 * 1024) add("error", id, `pics/${id}.jpg pèse ${Math.round(buf.length / 1024)} Ko`, "Réduisez l'image sous 1 Mo (300 Ko conseillés).");
      else if (buf.length > 300 * 1024) add("warn", id, `pics/${id}.jpg pèse ${Math.round(buf.length / 1024)} Ko`, "Moins de 300 Ko conseillés, pour un chargement rapide sur mobile.");
    }
  }
  for (const code of usedSets) if (!setnames[code] && !OFFICIAL_SETS[code]) add("warn", null, `le code d'archétype ${code} n'a pas de nom`, `Ajoutez "${code}": "Nom de l'archétype" dans "setnames" de pack.json.`);

  // ----- fichiers en trop -----
  for (const [sub, re, what] of [["script", /^c(\d+)\.lua$/, "script"], ["pics", /^(\d+)\.jpg$/, "image"]]) {
    const d = path.join(p.dir, sub);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      const m = re.exec(f);
      if (!m) add("error", null, `${sub}/${f} : nom de fichier inattendu`, sub === "script" ? "Les scripts s'appellent c<id>.lua." : "Les images s'appellent <id>.jpg.");
      else if (!mine.has(+m[1])) add("warn", null, `${sub}/${f} : ${what} d'une carte absente de cards.json`, "Retirez le fichier, ou ajoutez la carte.");
    }
  }
  for (const f of readdirSync(p.dir)) if (!["pack.json", "cards.json", "script", "pics", "README.md"].includes(f)) add("error", null, `fichier inattendu : ${f}`, "Un pack contient seulement pack.json, cards.json, script/, pics/ et éventuellement README.md.");
  for (const f of walk(p.dir)) if (statSync(f).size > 2 * 1024 * 1024) add("error", null, `${path.relative(p.dir, f)} dépasse 2 Mo`, "Réduisez la taille du fichier.");

  // ----- scripts : lecture, chargement dans le moteur, texte ↔ script -----
  const rows = {}, scripts = {};
  for (const { card, row } of p.cards) if (Number.isInteger(card.id)) {
    rows[card.id] = row;
    const f = path.join(p.dir, "script", `c${card.id}.lua`);
    if (existsSync(f)) scripts[`c${card.id}.lua`] = readFileSync(f, "utf8");
  }
  const free = (id) => SOURCES.cards[id] === p.slug || !ENGINE[id];
  useLocal(Object.fromEntries(Object.entries(rows).filter(([id]) => free(id))), Object.fromEntries(Object.entries(scripts).filter(([f]) => free(f.slice(1, -4)))));
  const stats = { cards: p.cards.length, scripts: Object.keys(scripts).length, pics: 0, tried: 0, activated: new Set() };
  for (const { card, row } of p.cards) {
    const id = card.id;
    if (!Number.isInteger(id)) continue;
    if (existsSync(path.join(p.dir, "pics", `${id}.jpg`))) stats.pics++;
    const type = row[2], src = scripts[`c${id}.lua`];
    const needs = !(type & TYPES.TOKEN) && !(type & TYPES.NORMAL && !(type & TYPES.PENDULUM));
    if (!src) { if (needs) add("error", id, `script script/c${id}.lua manquant`, "Chaque carte à effet (et chaque Magie/Piège) a besoin de son script EDOPro. Modèle : un script officiel proche sur github.com/ProjectIgnis/CardScripts."); continue; }
    if (!/local\s+s\s*,\s*id\s*=\s*GetID\(\)/.test(src)) add("error", id, "le script ne commence pas par `local s,id=GetID()`", "Première ligne de code d'un script EDOPro : `local s,id=GetID()`.");
    if (!/function\s+s\.initial_effect\s*\(/.test(src)) add("error", id, "pas de `function s.initial_effect(c)` dans le script", "Les effets se déclarent dans `function s.initial_effect(c) … end`.");
    if (free(id)) {
      const errs = (await loadErrors(id)).filter((e) => !/^stack traceback/.test(e) && !/attempt to call an error function/.test(e));
      for (const e of errs) add("error", id, "erreur Lua au chargement : `" + clean(e) + "`", "Corrigez la ligne indiquée (faute de frappe, `end` manquant, fonction mal nommée…). Testez dans EDOPro ou avec ce validateur.");
    }
    const code = stripComments(src);
    // Textes des effets : aux.Stringid(id,n) doit correspondre à strings[n]
    for (const m of code.matchAll(/aux\.Stringid\(\s*id\s*,\s*(\d+)\s*\)/g)) {
      const n = +m[1];
      if (!(card.strings || [])[n]) { add("error", id, `le script utilise aux.Stringid(id,${n}) mais "strings"[${n}] est vide`, `Ajoutez le texte du bouton n°${n} (affiché au joueur) dans "strings" de la carte.`); break; }
    }
    // Procédures d'Invocation
    const proc = [[TYPES.FUSION, /Fusion\.AddProc|aux\.AddFusion/, "Fusion.AddProcMix(c,true,true,matériel1,matériel2)"],
      [TYPES.SYNCHRO, /Synchro\.AddProcedure/, "Synchro.AddProcedure(c,filtre_syntoniseur,1,1,Synchro.NonTuner(nil),1,99)"],
      [TYPES.XYZ, /Xyz\.AddProcedure/, "Xyz.AddProcedure(c,filtre,niveau,nombre)"],
      [TYPES.LINK, /Link\.AddProcedure/, "Link.AddProcedure(c,filtre,min,max)"],
      [TYPES.PENDULUM, /Pendulum\.AddProcedure/, "Pendulum.AddProcedure(c)"]];
    const custom = /EFFECT_SPSUMMON_(CONDITION|PROC)/.test(code); // monstre Invoqué autrement (« doit d'abord être Invoqué par l'effet de … »)
    for (const [b, re, ex] of proc) if (type & b && !re.test(code) && !(custom && b !== TYPES.PENDULUM)) add("error", id, "procédure d'Invocation manquante", `Ajoutez \`${ex}\` au début de s.initial_effect.`);
    if ((isExtra(type) || type & TYPES.RITUAL && type & TYPES.MONSTER) && !/EnableReviveLimit/.test(code)) add("warn", id, "pas de `c:EnableReviveLimit()`", "Un monstre de l'Extra Deck ou Rituel doit d'abord être Invoqué correctement : ajoutez `c:EnableReviveLimit()`.");
    // Texte ↔ script
    const t = norm(String(card.text || "").replace(/«[^»]*»|"[^"]*"/g, " ")); // sans les noms de cartes cités
    const ignore = new Set(Array.isArray(card.ignore) ? card.ignore : []);
    for (const i of ignore) if (!RULES.some((r) => r.id === i)) add("error", id, `"ignore" : règle « ${i} » inconnue`, `Règles : ${RULES.map((r) => r.id).join(", ")}.`);
    for (const r of RULES) if (r.text.test(t) && !r.code.test(code)) {
      if (ignore.has(r.id)) add("info", id, `contrôle « ${r.id} » (${r.what}) ignoré à la demande de l'auteur`, "À vérifier à la relecture.");
      else add("error", id, `le texte parle de ${r.what}, mais le script ne le fait pas`, r.fix + ` Si le script est juste malgré tout, ajoutez \`"ignore": ["${r.id}"]\` à la carte.`);
    }
    for (const a of ACTIONS) if (a.code.test(code) && !a.text.test(t)) add("warn", id, `le script ${a.what}, mais le texte ne le dit pas`, "Vérifiez que le texte décrit bien tout ce que fait la carte.");
    // valeurs (500 ATK, 1000 dommages…) : chaque nombre du texte doit se retrouver dans le script
    for (const v of new Set([...t.matchAll(/\b(\d{3,5})\b/g)].map((m) => +m[1])))
      if (v !== row[6] && v !== row[7] && v % 50 === 0 && !new RegExp(`\\b${v}\\b|\\b${v / 2}\\b`).test(code)) add("warn", id, `la valeur ${v} du texte n'apparaît pas dans le script`, "Vérifiez que le script utilise bien la même valeur que le texte.");
    // cartes du pack citées par leur nom : leur numéro doit apparaître dans le script
    for (const m of String(card.text || "").matchAll(/«\s*([^»]+?)\s*»|"([^"]+)"/g)) {
      const name = (m[1] || m[2]).trim(), other = byName.get(name);
      if (other && other !== id && !String(code).includes(String(other))) add("warn", id, `le texte cite « ${name} » (${other}), mais ce numéro n'apparaît pas dans le script`, `Utilisez \`Card.IsCode(c,${other})\` (ou une constante locale) pour reconnaître cette carte.`);
      const set = Object.entries(setnames).find(([, n]) => n === name);
      if (set && !other && !new RegExp(`${set[0]}|${parseInt(set[0], 16)}|SET_`, "i").test(code) && !/IsSetCard/.test(code)) add("warn", id, `le texte cite l'archétype « ${name} », mais le script ne teste pas son code ${set[0]}`, `Reconnaissez l'archétype avec \`c:IsSetCard(${set[0]})\`.`);
    }
  }

  // ----- Deck de démo -----
  const deck = meta.deck || {};
  const main = Array.isArray(deck.main) ? deck.main : [], extra = Array.isArray(deck.extra) ? deck.extra : [];
  if (!main.length) add("error", null, "pack.json : pas de Deck de démo (\"deck\": {\"main\": […], \"extra\": […]})", "Proposez un Deck de 40 à 60 cartes : il sert à la partie test et au bouton « Essayer le deck » de la page d'accueil.");
  else {
    if (main.length < 40 || main.length > 60) add("error", null, `Deck de démo : ${main.length} cartes dans le Main Deck`, "Le Main Deck compte de 40 à 60 cartes.");
    if (extra.length > 15) add("error", null, `Deck de démo : ${extra.length} cartes dans l'Extra Deck`, "L'Extra Deck compte 15 cartes au maximum.");
    const copies = {};
    for (const c of [...main, ...extra]) {
      const info = cardInfo(c);
      if (!info) { add("error", null, `Deck de démo : la carte ${c} n'existe pas`, "Utilisez les numéros de vos cartes ou de cartes officielles."); continue; }
      const key = info.alias || c;
      copies[key] = (copies[key] || 0) + 1;
      if (info.type & TYPES.TOKEN) add("error", null, `Deck de démo : ${c} est un Jeton`, "Les Jetons ne vont pas dans le Deck.");
      if (main.includes(c) && isExtra(info.type)) add("error", null, `Deck de démo : ${c} est un monstre d'Extra Deck placé dans le Main Deck`, "Déplacez-le dans \"extra\".");
      if (extra.includes(c) && !isExtra(info.type)) add("error", null, `Deck de démo : ${c} n'est pas un monstre d'Extra Deck`, "Déplacez-le dans \"main\".");
    }
    for (const [c, n] of Object.entries(copies)) if (n > 3) add("error", null, `Deck de démo : ${n} exemplaires de ${c}`, "3 exemplaires au maximum par carte.");
  }

  // ----- parties test -----
  const games = [], crashes = new Set();
  const ok = !issues.some((x) => x.level === "error" && (/^erreur Lua|script .* manquant/.test(x.msg)));
  if (main.length >= 40 && ok) {
    const own = new Set(mine.keys());
    for (const seed of [["101", "202", "303", "404"], ["7", "77", "777", "7777"], ["31", "41", "59", "26"]]) {
      const res = await autoDuel({ seed, decks: [{ main, extra }, { main, extra }] }, (m, step) => auto(m, step, true), { steps: 250, fallback: pass });
      for (const m of res.messages) if (m.type === M.CHAINING && own.has(m.code)) stats.activated.add(m.code);
      let trace = "";
      for (const e of res.errors) {
        if (/^stack traceback/.test(e.text)) { trace = e.text; continue; }
        const all = trace + "\n" + e.text; trace = "";
        const key = clean(e.text);
        if (crashes.has(key)) continue;
        crashes.add(key);
        // à qui la faute ? au premier script du pack dans la pile d'appels ; sinon à un script officiel (pas bloquant)
        const ownCard = [...all.matchAll(/c(\d+)\.lua/g)].map((m) => +m[1]).find((id) => own.has(id));
        if (ownCard) add("error", ownCard, `erreur du moteur pendant une partie test (réponse n°${e.step}) : \`${key}\``, "L'effet plante quand il se résout : vérifiez la ligne indiquée (une variable nil, un groupe vide…).");
        else {
          const other = (/c(\d+)\.lua/.exec(all) || [])[1];
          add("warn", null, `erreur dans un script officiel pendant une partie test${other ? ` (carte « ${NAMES[other] || other} »)` : ""} : \`${key}\``, "Ce n'est pas un problème de votre pack. Si la carte est dans votre Deck de démo, vous pouvez la remplacer.");
        }
      }
      games.push({ steps: res.steps, ended: res.ended, refused: res.refused });
    }
  }
  stats.tried = [...mine.values()].filter(({ row }) => !(row[2] & TYPES.TOKEN) && !(row[2] & TYPES.NORMAL)).length;
  dedupe(issues);
  return { slug: p.slug, name: meta.name || p.slug, author: meta.author || "", cards: p.cards, issues, stats, games, pass: !issues.some((x) => x.level === "error") };
}

function walk(d) { const out = []; for (const f of readdirSync(d)) { const x = path.join(d, f); statSync(x).isDirectory() ? out.push(...walk(x)) : out.push(x); } return out; }
const clean = (e) => String(e).replace(/\[string "([^"]+)"\]/g, "$1").replace(/\s+/g, " ").trim().slice(0, 300);
const stripComments = (s) => s.replace(/--\[\[[\s\S]*?\]\]/g, "").replace(/--[^\n]*/g, "");
function dedupe(list) { const seen = new Set(), keep = list.filter((x) => { const k = `${x.card}|${x.msg}`; return !seen.has(k) && seen.add(k); }); list.splice(0, list.length, ...keep); }
function freeRange() { // première plage de 1000 numéros libre au-dessus de 700 000 000
  const used = new Set(Object.keys(ENGINE).map((x) => Math.floor(+x / 1000)));
  for (let b = 700000; b < 4294967; b++) if (!used.has(b)) return `${b * 1000 + 1} à ${b * 1000 + 999}`;
  return "un numéro libre";
}

// ---------- rapport ----------
function report(results) {
  const all = results.every((r) => r.pass);
  const out = [`<!-- validateur-de-packs -->`, `# ${all ? "✅" : "❌"} Validation ${results.length > 1 ? "des packs" : "du pack"}`, ""];
  for (const r of results) {
    const errs = r.issues.filter((x) => x.level === "error"), warns = r.issues.filter((x) => x.level === "warn"), infos = r.issues.filter((x) => x.level === "info");
    out.push(`## ${r.pass ? "✅" : "❌"} ${r.name} (\`packs/${r.slug}\`)${r.author ? ` · par ${r.author}` : ""}`, "");
    out.push(r.pass ? `**Le pack passe le filtre.** Il peut être publié : il apparaîtra en vedette sur la page d'accueil pendant 14 jours.${infos.length ? ` ${infos.length} contrôle${infos.length > 1 ? "s" : ""} ignoré${infos.length > 1 ? "s" : ""} par l'auteur (ⓘ) : à relire avant d'approuver.` : ""}` : `**Le pack ne passe pas encore** : ${errs.length} erreur${errs.length > 1 ? "s" : ""} à corriger (✗). Corrigez-les, poussez les changements sur la même Pull Request : la validation se relance seule.`, "");
    const g = r.games, act = r.stats.activated.size;
    out.push("| Cartes | Scripts | Images | Erreurs | Avertissements | Parties test |", "|---|---|---|---|---|---|");
    out.push(`| ${r.stats.cards} | ${r.stats.scripts} | ${r.stats.pics} | ${errs.length} | ${warns.length} | ${g.length ? `${g.length} parties, ${g.reduce((a, x) => a + x.steps, 0)} réponses, ${act}/${r.stats.tried} cartes à effet activées` : "non jouées"} |`, "");
    const general = r.issues.filter((x) => x.card == null);
    if (general.length) { out.push("### Pack", ""); for (const x of general) out.push(line(x)); out.push(""); }
    const cards = r.cards.filter((c) => Number.isInteger(c.card.id));
    if (cards.length) {
      out.push("### Cartes", "", "| | Carte | Résultat |", "|---|---|---|");
      for (const { card } of cards) {
        const mine = r.issues.filter((x) => x.card === card.id), e = mine.filter((x) => x.level === "error").length, w = mine.filter((x) => x.level === "warn").length, i = mine.length - e - w;
        out.push(`| ${e ? "✗" : w ? "⚠" : "✓"} | ${card.id} · ${esc(card.name || "?")} | ${e ? `${e} erreur${e > 1 ? "s" : ""}` : ""}${e && w ? ", " : ""}${w ? `${w} avertissement${w > 1 ? "s" : ""}` : ""}${!e && !w ? "OK" : ""}${i ? ` · ${i} contrôle${i > 1 ? "s" : ""} ignoré${i > 1 ? "s" : ""}` : ""} |`);
      }
      out.push("");
      for (const { card } of cards) {
        const mine = r.issues.filter((x) => x.card === card.id);
        if (!mine.length) continue;
        const e = mine.some((x) => x.level === "error");
        out.push(`<details${e ? " open" : ""}><summary>${e ? "✗" : mine.some((x) => x.level === "warn") ? "⚠" : "ⓘ"} <b>${card.id} · ${esc(card.name || "?")}</b></summary>`, "");
        for (const x of mine) out.push(line(x));
        out.push("", "</details>", "");
      }
    }
    if (g.length) out.push(`<sub>Parties test : le Deck de démo contre lui-même, ${g.length} graines, réponses automatiques (${g.filter((x) => x.ended).length} parties terminées avant la limite). Les cartes « activées » ont été jouées au moins une fois ; les autres n'ont simplement pas eu l'occasion, ce n'est pas une erreur.</sub>`, "");
  }
  out.push("---", "<sub>Ce rapport compare le texte des cartes aux scripts par mots-clés : il repère les oublis courants mais ne remplace pas une partie dans EDOPro. Guide : `online/packs/README.md`.</sub>");
  let md = out.join("\n");
  if (md.length > 60000) md = md.slice(0, 60000) + "\n\n… (rapport tronqué : relancez le validateur en local pour tout voir)";
  return md;
}
const esc = (s) => String(s).replace(/[|<>]/g, (c) => ({ "|": "\\|", "<": "&lt;", ">": "&gt;" })[c]);
const line = (x) => `- ${x.level === "error" ? "✗" : x.level === "info" ? "ⓘ" : "⚠"} ${esc(x.msg)}${x.fix ? `<br>→ ${x.fix}` : ""}`;

// ---------- lancement ----------
const results = [];
for (const d of dirs) {
  if (!existsSync(path.join(d, "cards.json")) && !existsSync(path.join(d, "pack.json"))) { console.error(`${d} : ni cards.json ni pack.json, ignoré`); continue; }
  results.push(await check(d));
}
const md = report(results);
if (opt.report) writeFileSync(opt.report, md + "\n");
if (opt.json) writeFileSync(opt.json, JSON.stringify(results.map((r) => ({ slug: r.slug, name: r.name, pass: r.pass, errors: r.issues.filter((x) => x.level === "error").length, warnings: r.issues.filter((x) => x.level === "warn").length }))));
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.slug} : ${r.issues.filter((x) => x.level === "error").length} erreur(s), ${r.issues.filter((x) => x.level === "warn").length} avertissement(s)`);
  for (const x of r.issues) console.log(`  ${x.level === "error" ? "✗" : x.level === "info" ? "ⓘ" : "⚠"} ${x.card ? x.card + " " : ""}${x.msg}`);
}
process.exit(results.length && results.every((r) => r.pass) ? 0 : 1);
