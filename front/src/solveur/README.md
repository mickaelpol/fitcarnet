# Le solveur de repas

Module TypeScript autonome, sans dépendance, destiné au front React Native.
Il tourne côté client : le calcul est instantané et fonctionne hors ligne.

```
front/src/solveur/
├─ types.ts                 Aliment, Cibles, Resultat, Diagnostic…
├─ algebre.ts               résolution linéaire (Gauss, pivot partiel)
├─ solveur.ts               le calcul
├─ solveur.test.ts          29 tests
└─ aliments.test-data.ts    jeu d'aliments de référence
```

---

## Le principe

Un repas se compose de trois **variables** et d'un nombre quelconque
d'ingrédients **imposés** :

| rôle | règle | exemple |
|---|---|---|
| `proteine` | les protéines | saumon, poulet, skyr |
| `glucide` | les glucides | patate douce, riz, avoine |
| `lipide` | les lipides | amandes, noix |
| *fixes* | quantités imposées | légume 180 g, huile 6 g, reste de riz |

Trois inconnues, trois équations : le système est **linéaire** et se résout
**exactement**, par élimination de Gauss avec pivot partiel. Aucune itération,
aucune approximation, aucun risque de non-convergence.

```ts
import { calculer } from './solveur';

const r = calculer(
  { kcal: 661.9, prot: 42.8, gluc: 61.8, lip: 25.8 },
  { proteine: saumon, glucide: patateDouce, lipide: amandes },
  [
    { aliment: haricots, grammes: 180 },
    { aliment: concombre, grammes: 100 },
    { aliment: huile, grammes: 6 },
  ],
);

r.ok          // true si toutes les macros sont dans la tolérance
r.quantites   // [{ aliment, aCuire, assiette }, …]
r.macros      // ce que donne RÉELLEMENT l'assiette
r.ecarts      // écart à la cible, macro par macro
r.diagnostics // explications quand ça ne tombe pas juste
```

---

## Ce qui est garanti

**Les macros affichées sont celles qui seront réellement mangées.**
L'arrondi (5 g sur les féculents, 1 g sur les protéines, 0,5 g sur les
oléagineux) est appliqué **avant** le calcul des macros, pas après. Un test
recompose les totaux à partir des seules quantités annoncées et vérifie
qu'ils correspondent : ce que tu lis à l'écran est ce que la balance mesurera.

**Jamais de quantité négative.** Quand la solution mathématique en produit une —
le cas typique du saumon trop gras pour une cible lipides basse — la variable
est fixée à zéro et le système réduit est résolu en **privilégiant protéines et
glucides**, l'écart se reportant sur les lipides. Le diagnostic explique alors
quoi changer.

**Toute déviation est expliquée.** Aucun cas ne renvoie `ok: false` sans
diagnostic ; c'est vérifié sur 5 000 combinaisons aléatoires.

**Les conversions cru / cuit / sec sont explicites.** Chaque ligne du résultat
porte `aCuire` (ce qu'on pèse en cuisinant : riz sec, viande crue) et
`assiette` (ce qu'on pose dans l'assiette, tout cuit).

---

## Les tests

```bash
cd front && npx tsc && node --test dist/solveur.test.js
```

29 tests : algèbre (systèmes simples, singuliers, pivot), cas nominal des
quatre repas, conversions, cible inatteignable, quantité imposée avec
complément, arrondis, robustesse — plus un test de propriété sur
**5 000 combinaisons aléatoires** vérifiant l'absence de valeur invalide,
de quantité négative et d'écart non expliqué.

Sur ces 5 000 tirages (dont beaucoup d'assemblages absurdes : 250 g de
concombre avec 10 g d'huile pour une cible de collation), **76 % tombent dans
la tolérance**. Les 24 % restants sont des combinaisons réellement impossibles,
toutes accompagnées d'un diagnostic.

---

## Les limites, en toute franchise

**Le solveur ne juge pas de la pertinence culinaire.** Il peut proposer 380 g de
skyr ou 22 g d'amandes : c'est mathématiquement juste, à toi de voir si c'est
mangeable.

**Trois aliments au profil trop proche rendent le système singulier** — par
exemple trois féculents. Le cas est détecté et signalé, mais pas contourné :
il faut choisir des aliments aux profils différents.

**Les micronutriments ne sont pas gérés.** Fibres, sucres, vitamines : hors
périmètre. Le calcul porte sur les quatre valeurs que suit ton coach.

**Les valeurs nutritionnelles viennent de la base**, avec leur propre marge
d'erreur — les étiquettes tolèrent des écarts, et un aliment brut varie
naturellement. La précision du solveur dépasse celle de ses données d'entrée ;
viser mieux que 1 g par macro n'aurait pas de sens.
