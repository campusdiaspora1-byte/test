# Hueco Mundo pour EDOPro

Extension EDOPro de l'archétype **Hueco Mundo** (26 cartes, HMUN-FR001 à FR026). Dans EDOPro, les effets sont **automatiques** : déclencheurs obligatoires, conditions d'Invocation (Las Noches au Cimetière pour les Espada n°4 à n°0), coûts, limites « une fois par tour », compteurs Vieillesse… Le moteur applique tout ça tout seul, comme pour une carte officielle.

## Installation

1. Installez [EDOPro](https://projectignis.github.io/download.html), puis lancez-le une fois pour qu'il télécharge les cartes officielles.
2. Décompressez `hueco-mundo-edopro.zip`. Il contient un dossier `expansions/`.
3. Copiez **le contenu** de ce dossier dans le dossier `expansions/` d'EDOPro (là où se trouve `ProjectIgnis/expansions/`) :

   ```
   ProjectIgnis/
   └── expansions/
       ├── hueco-mundo.cdb      ← les 27 cartes (26 + le Jeton Fracción)
       ├── strings.conf         ← noms d'archétypes et compteur Vieillesse
       ├── pics/711000xxx.jpg   ← les illustrations
       └── script/c711000xxx.lua← les effets
   ```

   Si un `strings.conf` existe déjà dans `expansions/`, ajoutez nos lignes à la fin au lieu de le remplacer.
4. Relancez EDOPro. Dans l'éditeur de deck, cherchez « Hueco Mundo », « Espada » ou « Las Noches ».

## Jouer entre amis

- Chaque joueur doit installer l'extension : la partie se désynchronise si l'un d'eux n'a pas les scripts.
- Créez une salle (**Héberger**) et, dans les règles, choisissez la liste de bannissement **« Aucune »** ou cochez **« Ne pas vérifier le deck »**. Sinon EDOPro refuse les cartes inconnues de la liste officielle.
- En ligne, passez par une salle LAN, ou par un serveur qui accepte les decks non vérifiés.

## Numéros des cartes

| Code | Carte |
|---|---|
| 711000001 à 711000026 | HMUN-FR001 à FR026, dans le même ordre que le classeur |
| 711000027 | Jeton Fracción (pas d'illustration, EDOPro affiche le dos par défaut) |

## Pour les développeurs

- `script/` : les 26 scripts Lua (source). `build_edopro.py` génère `dist/expansions/` à partir de `archetypes/hueco-mundo/classeur.json` et des images de `game/cards/`.
- `test/` : un banc de test sur le vrai moteur (ocgcore-wasm). Il joue des mini-duels et vérifie chaque effet (30 scénarios).

  ```
  cd edopro/test
  npm install
  git clone --depth 1 https://github.com/ProjectIgnis/CardScripts
  node run.mjs            # tout
  node run.mjs Grimmjow   # filtre sur le titre
  ```
