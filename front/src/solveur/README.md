# Le solveur de repas

Module TypeScript autonome, sans dépendance, destiné au front React Native.
Il tourne côté client : le calcul est instantané et fonctionne hors ligne.

```
front/src/solveur/
├─ types.ts                 Aliment, Cibles, Resultat, Diagnostic…
├─ algebre.ts               résolution linéaire (Gauss, pivot partiel)
├─ solveur.ts               le calcul
├─ solveur.test.ts          68 tests
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

## Écouler les restes : le cas central

Toute quantité imposée peut être saisie **en cru ou en cuit**, quel que soit
l'aliment. C'est ce qui permet de partir de ce qu'on a sous la main.

```ts
calculer(ciblesDuSoir,
  { proteine: poulet, glucide: patateDouce, lipide: amandes },
  [
    { aliment: riz,        grammes: 100, unite: 'cuit' },  // reste du midi
    { aliment: saumon,     grammes:  40, unite: 'cuit' },  // reste d'hier
    { aliment: courgettes, grammes: 120, unite: 'cuit' },
    { aliment: huile,      grammes:   2 },
  ]);
```

Chaque reste est ramené à l'état dans lequel ses valeurs nutritionnelles ont un
sens — 100 g de riz cuit comptent pour 100 g cuit, 40 g de saumon cuit comptent
pour 47 g de saumon cru — puis le reste du repas est recalculé autour.

Le résultat annonce toujours les deux poids : `aCuire` (ce qu'on pèse avant
cuisson) et `assiette` (ce qu'on mange). `pourObtenirCuit(aliment, grammes)`
répond directement à « combien de riz sec pour 180 g cuits ? » → 60 g.

---

## Calculer même sans marge de manœuvre

Les trois variables sont **facultatives**. Si tu verrouilles tout ce que tu as,
le solveur ne refuse pas de répondre : il calcule ce que donne l'assiette et
chiffre ce qui manque.

- **trois variables** → les trois macros tombent juste ;
- **deux** → les deux macros correspondantes tombent juste, la troisième dérive
  et l'écart est annoncé ;
- **une** → sa macro tombe juste ;
- **aucune** → le solveur additionne ce que tu as et dit ce qui manque.

C'était le défaut le plus grave de la première version : bloquer là où il
fallait informer.

---

## Prévenir quand un aliment ne sert plus à rien

Quand la quantité calculée d'un aliment ajustable tombe sous 8 g, le solveur le
signale au lieu d'afficher « 1 g de thon » sans explication :

> *Thon au naturel ne pèse quasiment rien ici (1,0 g, soit 0,3 g de protéines) :
> le reste du repas couvre déjà l'objectif. Retire-le, ou réduis ce que tu as
> déjà mis.*

Le cas se produit dès qu'un ingrédient déjà présent sature une macro — 100 g de
bœuf haché couvrent à eux seuls la moitié du budget protéique d'un dîner.

---

## Substituer sans toucher à la diète

C'est la garantie principale. **36 combinaisons** protéine × féculent ×
oléagineux ont été vérifiées sur le repas du midi : toutes tombent sur les mêmes
macros, à moins de 0,3 g près.

Remplacer un aliment ne change pas que sa propre quantité : passer de la patate
douce au quinoa fait **baisser le saumon**, parce que le quinoa apporte 4,4 g de
protéines aux 100 g. C'est vérifié par un test dédié.

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

68 tests : algèbre (systèmes simples, singuliers, pivot), cas nominal des
quatre repas, conversions cru/cuit/sec, restes en unités cuites, invariance des
macros sur 36 substitutions, calcul avec moins de trois variables, aliment
devenu négligeable, cible inatteignable, arrondis, robustesse — plus un test de
propriété sur
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

**Les kcal ne sont pas une contrainte indépendante.** Elles découlent des
macros : 4 kcal par gramme de protéines et de glucides, 9 par gramme de lipides.
Si une cible kcal ne correspond pas à ses propres macros, aucune combinaison
d'aliments ne peut satisfaire les deux. Le solveur respecte alors **les macros**
et signale l'incohérence.

C'est le cas des cibles actuelles du coach : le dîner annonce 551,8 kcal pour
30,1 P / 80,3 G / 15,4 L, qui représentent en réalité 580 kcal. L'écart de 28
kcal par repas n'est pas une erreur de calcul, c'est une incohérence de la
consigne. À signaler au coach : soit les kcal, soit les macros doivent être
ajustées.

**Les micronutriments ne sont pas gérés.** Fibres, sucres, vitamines : hors
périmètre. Le calcul porte sur les quatre valeurs que suit ton coach.

**Les valeurs nutritionnelles viennent de la base**, avec leur propre marge
d'erreur — les étiquettes tolèrent des écarts, et un aliment brut varie
naturellement. La précision du solveur dépasse celle de ses données d'entrée ;
viser mieux que 1 g par macro n'aurait pas de sens.
