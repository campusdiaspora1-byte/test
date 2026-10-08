# Proposer ses cartes

Chaque archétype du site est un **pack** : un dossier `online/packs/<nom>/`. Pour ajouter le tien, ouvre une Pull Request qui ajoute ce dossier.

1. Un validateur automatique vérifie le pack et répond dans la Pull Request avec un rapport, carte par carte : ce qui ne va pas et comment le corriger.
2. Quand le rapport est vert, le propriétaire du dépôt relit et approuve (bouton *Merge*).
3. Le pack est en ligne : ses cartes sont jouables dans l'éditeur de deck. Pendant **14 jours**, il est aussi **en vedette sur la page d'accueil** avec un bouton « Jouer avec ce deck ». Ensuite, l'accueil revient à Hueco Mundo (le pack reste jouable).

## Contenu d'un pack

```
online/packs/mon-archetype/
├── pack.json          le pack : nom, auteur, présentation, Deck de démo
├── cards.json         les cartes, en texte
├── script/
│   └── c700000001.lua un script EDOPro par carte à effet
└── pics/
    └── 700000001.jpg  une illustration par carte (JPEG, moins de 300 Ko)
```

Le nom du dossier : minuscules, chiffres et tirets (`mon-archetype`).

### pack.json

```json
{
  "name": "Lames de Feu",
  "author": "ton pseudo",
  "description": "Une phrase qui donne envie, affichée sur l'accueil.",
  "cover": 700000001,
  "setnames": { "0xf90": "Lame de Feu" },
  "counters": {},
  "deck": { "main": [700000001, 700000001, 700000001, "… 40 à 60 cartes"], "extra": [] }
}
```

- `cover` : la carte dont l'image représente le pack.
- `setnames` : le code et le nom de chaque archétype du pack. Le code ne doit pas être celui d'un archétype officiel ni d'un autre pack.
- `deck` : un Deck de démo jouable, avec tes cartes et des cartes officielles. Il sert aux parties test du validateur et au bouton « Jouer avec ce deck ».
- Ne mets pas `published` : la date est ajoutée toute seule à la publication.

### cards.json

Une liste de cartes. Les mots en majuscules sont les noms des constantes d'EDOPro.

```json
[
  {
    "id": 700000001,
    "name": "Lame de Feu - Kaen",
    "text": "Si cette carte est Invoquée Normalement : vous pouvez infliger 500 dommages à votre adversaire. Vous ne pouvez utiliser cet effet de « Lame de Feu - Kaen » qu'une fois par tour.",
    "types": ["MONSTER", "EFFECT"],
    "attribute": "FIRE",
    "race": "WARRIOR",
    "level": 4,
    "atk": 1800,
    "def": 1000,
    "setcodes": ["0xf90"],
    "strings": ["Infliger 500 dommages"]
  }
]
```

| Champ | Valeurs |
|---|---|
| `id` | un numéro libre (le validateur en propose une plage s'il est déjà pris) |
| `types` | `MONSTER`, `SPELL`, `TRAP`, puis `NORMAL`, `EFFECT`, `TUNER`, `FUSION`, `SYNCHRO`, `XYZ`, `LINK`, `PENDULUM`, `RITUAL`, `FLIP`, `TOKEN`, `QUICKPLAY`, `CONTINUOUS`, `EQUIP`, `FIELD`, `COUNTER`… |
| `attribute` | `EARTH`, `WATER`, `FIRE`, `WIND`, `LIGHT`, `DARK`, `DIVINE` |
| `race` | `WARRIOR`, `SPELLCASTER`, `FAIRY`, `FIEND`, `ZOMBIE`, `MACHINE`, `DRAGON`, `BEAST`, `CYBERSE`… |
| `level` / `rank` / `link` | Niveau, Rang (Xyz) ou valeur Lien |
| `atk`, `def` | un nombre, ou `"?"` |
| `scale` | Échelle Pendule : `4`, ou `[gauche, droite]` |
| `markers` | Flèches Lien : `TOP`, `BOTTOM`, `LEFT`, `RIGHT`, `TOP_LEFT`, `TOP_RIGHT`, `BOTTOM_LEFT`, `BOTTOM_RIGHT` |
| `strings` | les textes des boutons d'effet, dans l'ordre de `aux.Stringid(id,0)`, `aux.Stringid(id,1)`… |
| `ignore` | voir « Faux positifs » plus bas |

Les Magies et les Pièges n'ont ni `attribute`, ni `race`, ni `level`, ni `atk`, ni `def`.

### Tu as déjà tes cartes dans EDOPro ?

Si tu as fait tes cartes avec DataEditorX ou l'éditeur d'EDOPro, convertis ton `.cdb` :

```bash
cd online
npm install
node scripts/pack-from-cdb.mjs ~/EDOPro/expansions/mes-cartes.cdb packs/mon-archetype --author "ton pseudo"
```

Le script écrit `cards.json`, prépare `pack.json` et copie les scripts `script/c<id>.lua` et les images `pics/<id>.jpg` trouvés à côté du `.cdb`. Ailleurs, indique-les avec `--scripts`, `--pics` et `--strings`.

## Ce que vérifie le validateur

| | Contrôle |
|---|---|
| Fichiers | JSON valide, champs complets, types cohérents (une Magie n'a pas de Niveau, un Lien-2 a 2 flèches…), images en JPEG |
| Numéros | aucun numéro déjà pris par une carte officielle (plus de 14 000) ou un autre pack |
| Scripts | un script par carte à effet, chargé par le moteur d'EDOPro sans erreur Lua, procédure d'Invocation des monstres d'Extra Deck, textes des boutons |
| Texte ↔ script | chaque action annoncée par le texte existe dans le script : « une fois par tour » → `SetCountLimit`, « (Effet Rapide) » → `EFFECT_TYPE_QUICK_O`, « piochez » → `Duel.Draw`, « détruisez » → `Duel.Destroy`, « bannissez », « Invoquez Spécialement », « infligez … dommages », « payez … LP », « ciblez »… |
| Parties test | le Deck de démo joue contre lui-même (3 parties, réponses automatiques) sans que le moteur plante |

✗ = erreur : le pack ne passe pas tant qu'elle n'est pas corrigée. ⚠ = avertissement : à relire, mais pas bloquant.

Pour vérifier ton pack avant d'ouvrir la Pull Request :

```bash
cd online
npm install
npm run build                                  # cartes officielles et scripts d'EDOPro (une fois)
node scripts/validate-pack.mjs packs/mon-archetype --report rapport.md
```

### Faux positifs

La comparaison texte ↔ script se fait par mots-clés. Si ton script est juste mais qu'un contrôle se trompe, ajoute le nom de la règle dans `"ignore"` de la carte (le rapport donne ce nom), par exemple `"ignore": ["special-summon"]`. Le contrôle ignoré reste affiché dans le rapport (ⓘ), pour la relecture.

## Écrire les scripts

Les scripts sont ceux d'EDOPro : pars d'une carte officielle qui fait quelque chose de proche, sur [ProjectIgnis/CardScripts](https://github.com/ProjectIgnis/CardScripts). Les 26 scripts de `packs/hueco-mundo/script/` sont aussi des exemples. Un script commence toujours par :

```lua
local s,id=GetID()
function s.initial_effect(c)
	-- les effets
end
```
