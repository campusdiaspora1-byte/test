# Your Own Duel

Site de duels Yu-Gi-Oh! entre amis, avec l'archétype Hueco Mundo et toutes les cartes officielles. Les règles et les effets sont appliqués par le moteur d'EDOPro (ocgcore, compilé en WebAssembly) avec les scripts de cartes de Project Ignis.

## Comment ça marche

- **Le moteur tourne sur le serveur** (fonction Vercel `api/room.js`). Chaque partie est enregistrée comme « graine + liste des choix des joueurs ». À chaque action, le serveur rejoue la partie, applique le nouveau choix et l'enregistre. Chaque joueur ne reçoit que ce qu'il a le droit de voir : la main adverse et les cartes posées restent cachées.
- **Les parties sont stockées dans Supabase** (projet `hueco-mundo-duel`). La table des salles est privée : le serveur y accède par des fonctions protégées par le secret `HM_SECRET`. Seul le numéro de version de chaque salle est public ; les navigateurs l'écoutent en temps réel pour savoir quand se mettre à jour.
- **Les données des cartes sont préparées au build** (`npm run build`) : bases ProjectIgnis/BabelCDB, scripts ProjectIgnis/CardScripts, textes système d'EDOPro, textes français de mycard/ygopro-database, et les packs de `packs/` (Hueco Mundo et ceux de la communauté).
- **Formats** : à la création d'une salle, on choisit Amical (sans liste) ou une liste officielle (TCG, OCG, Worlds, Traditionnel, GOAT). Ces listes viennent de [ProjectIgnis/LFLists](https://github.com/ProjectIgnis/LFLists), les mêmes que dans EDOPro, et sont mises à jour à chaque build. Les règles du deck (`public/deckrules.js`) sont communes au serveur et à la page : 40 à 60 cartes, Extra Deck de 15 au plus, 3 exemplaires au plus, et 0, 1 ou 2 exemplaires pour une carte interdite, limitée ou semi-limitée.
- **Les packs de la communauté** arrivent par Pull Request. Un validateur automatique (`scripts/validate-pack.mjs`, lancé par `.github/workflows/pack-check.yml`) répond avec un rapport. Le pack n'est publié qu'après ton approbation (fusion de la Pull Request). Une fois publié, il est en vedette sur l'accueil pendant 14 jours. Guide pour les auteurs : [`packs/README.md`](packs/README.md).

## Mise en ligne sur Vercel



## En local

```
cd online
npm install
npm run build     # télécharge les données (une fois)
npm run dev       # http://127.0.0.1:3000, salles en mémoire
npm test          # fait jouer deux decks l'un contre l'autre dans le moteur
```

Avec `HM_SECRET=… npm run dev`, le serveur local utilise la vraie base Supabase.

Après une modification des cartes Hueco Mundo (`edopro/`), lance `npm run sync-hm` pour mettre à jour `packs/hueco-mundo/`. Pour vérifier un pack : `npm run validate -- packs/<nom>`.

## Packs : réglages GitHub conseillés

- **Settings → Actions → General → Workflow permissions** : laisse « Read repository contents » ; les workflows demandent eux-mêmes les droits dont ils ont besoin. `pack-report.yml` publie le rapport en commentaire, et `pack-publish.yml` écrit la date de publication après la fusion.
- Avant de fusionner, vérifie que la case « Validation des packs » est verte dans la Pull Request. Évite de la rendre obligatoire dans une règle de branche : `pack-publish.yml` pousse la date de publication directement sur la branche, et une règle de branche bloquerait ce push.
- Les Pull Requests venant d'un fork demandent ton accord avant de lancer les Actions (**Approve and run**). C'est voulu.

## Licence

Le moteur ocgcore et les scripts de Project Ignis sont sous licence AGPL-3.0, et ce site aussi : son code source doit rester accessible à ceux qui l'utilisent. Le lien est en bas de la page d'accueil. Yu-Gi-Oh! © Kazuki Takahashi, Konami. Projet amateur, sans but commercial.
