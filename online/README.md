# Your Own Duel

Site de duels Yu-Gi-Oh! entre amis, avec l'archétype Hueco Mundo et toutes les cartes officielles. Les règles et les effets sont appliqués par le moteur d'EDOPro (ocgcore, compilé en WebAssembly) avec les scripts de cartes de Project Ignis.

## Comment ça marche

- **Le moteur tourne sur le serveur** (fonction Vercel `api/room.js`). Chaque partie est enregistrée comme « graine + liste des choix des joueurs ». À chaque action, le serveur rejoue la partie, applique le nouveau choix et l'enregistre. Chaque joueur ne reçoit que ce qu'il a le droit de voir : la main adverse et les cartes posées restent cachées.
- **Les parties sont stockées dans Supabase** (projet `hueco-mundo-duel`). La table des salles est privée : le serveur y accède par des fonctions protégées par le secret `HM_SECRET`. Seul le numéro de version de chaque salle est public ; les navigateurs l'écoutent en temps réel pour savoir quand se mettre à jour.
- **Les données des cartes sont préparées au build** (`npm run build`) : bases ProjectIgnis/BabelCDB, scripts ProjectIgnis/CardScripts, textes système d'EDOPro, textes français de mycard/ygopro-database, et les fichiers Hueco Mundo de `vendor/hueco-mundo/`.

## Mise en ligne sur Vercel

1. Sur [vercel.com](https://vercel.com/new), choisis l'équipe voulue puis **Import Git Repository** → `campusdiaspora1-byte/test`.
2. Réglages du projet :
   - **Project Name** : `your-own-duel`
   - **Root Directory** : `online`
   - **Framework Preset** : `Other` (le reste est lu dans `vercel.json`)
3. **Environment Variables** : ajoute `HM_SECRET` avec la valeur du secret enregistré dans Supabase (table `hm_config`, clé `secret`). Coche Production et Preview.
4. Clique sur **Deploy**.
5. Dans **Settings → Git**, mets **Production Branch** sur la branche qui contient ce dossier (aujourd'hui `claude/new-session-u2ibpp`), puis redéploie. Chaque push sur cette branche redéploiera le site.
6. Dans **Settings → Deployment Protection**, désactive **Vercel Authentication**, sinon tes amis devront avoir un compte Vercel pour ouvrir le site.

## En local

```
cd online
npm install
npm run build     # télécharge les données (une fois)
npm run dev       # http://127.0.0.1:3000, salles en mémoire
npm test          # fait jouer deux decks l'un contre l'autre dans le moteur
```

Avec `HM_SECRET=… npm run dev`, le serveur local utilise la vraie base Supabase.

Après une modification des cartes Hueco Mundo (`edopro/`), lance `npm run sync-hm` pour mettre à jour `vendor/hueco-mundo/`.

## Licence

Le moteur ocgcore et les scripts de Project Ignis sont sous licence AGPL-3.0, et ce site aussi : son code source doit rester accessible à ceux qui l'utilisent. Le lien est en bas de la page d'accueil. Yu-Gi-Oh! © Kazuki Takahashi, Konami. Projet amateur, sans but commercial.
