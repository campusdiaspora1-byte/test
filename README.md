# Atelier de cartes Yu-Gi-Oh!

Un éditeur de cartes Yu-Gi-Oh! personnalisées, pour des parties amicales entre amis (aucun usage commercial).
Il s'inspire du modèle Figma « Yu-Gi-Oh! Card Customizer » d'Oranga, qui monte une carte en calques :
Background, Texture, Text boxes, Illustration, Text et Cut.

## Utilisation

Ouvrez `index.html` dans un navigateur. Il n'y a rien à installer.

- **Fiche de la carte** : catégorie (Monstre / Magie / Piège), cadre, Attribut, Type, Niveau/Rang, Flèches Lien, Pendule, ATK/DEF, texte.
- **Contrôle des règles** : la carte est vérifiée en direct selon les règles officielles Konami (voir `REGLES.md`).
  Une *Erreur* veut dire que la carte est impossible selon les règles. Une *Alerte* veut dire qu'elle s'écarte du style officiel.
- **Calques** : vous pouvez afficher ou masquer chaque calque. Le calque *Cut* montre la ligne de coupe (59 × 86 mm).
- **Exporter en PNG** : image à 1380 × 2012 px, pour imprimer la carte et la glisser dans une pochette devant une carte de base.
- **Classeur** : les cartes sont enregistrées dans le navigateur. L'export `.json` permet d'échanger un classeur entre amis.

## Fichiers

- `src/customizer.html` : le code source de l'application (HTML, CSS et JS dans un seul fichier).
- `index.html` : la page complète, générée à partir de `src/customizer.html`.
- `REGLES.md` : les règles vérifiées par l'atelier.

Pour régénérer `index.html` après avoir modifié la source :

```sh
./build.sh
```
