---
name: fonctionnalite-calculateur-repas
description: Obtenir les quantités à peser qui tombent sur ses cibles avec ce qu'on a vraiment — les trois étapes Jours · Repas · Cuisiner, la composition par rôles, le tableau à quatre colonnes, les corrections (remplacer, verrouiller, déclarer un reste, ajouter), et surtout les avertissements chiffrés. À charger avec `epreuve-fonctionnalite` pour éprouver et filmer l'onglet Repas.
---

# Le calculateur de repas

## Le besoin

Quelqu'un a des cibles par repas et un frigo. Il veut **les grammes à poser sur
la balance**, maintenant, pour les repas qu'il va cuisiner — sur un jour ou sur
la semaine — **sans acheter quoi que ce soit** et sans faire les calculs à la
main.

Ce n'est pas un générateur de menus : c'est un solveur. Trois macros, trois
inconnues, un système linéaire résolu **exactement**, puis confronté au stock
réel. Ce qui fait la valeur de l'écran n'est pas qu'il trouve une solution —
c'est qu'il **dise quand il n'y en a pas**, et **de combien**. Un chiffre faux
est pire qu'un refus de répondre (règle 7) : ce qui est affiché sera pesé et
mangé.

## Ce que l'application propose

| Capacité | Où | `fichier:ligne` |
|---|---|---|
| **Trois étapes nommées** `Jours` · `Repas` · `Cuisiner`, avec retour en arrière seulement | bandeau de tête | `front/src/composants/etapes.tsx:29`, `:44` |
| **Un ou plusieurs jours** — interrupteur, puis calendrier mensuel ; le passé n'est pas sélectionnable | étape Jours | `front/src/composants/etapeReglage.tsx:122`, `front/src/composants/calendrier.tsx:156` |
| **Cases pré-cochées dès qu'un objectif existe** pour ce repas | étape Jours | `front/app/(onglets)/repas.tsx:170`, `front/src/calcul/selectionRepas.ts:34` |
| **Convives par repas, de 1 à 12** | étape Jours | `etapeReglage.tsx:360`, `:371` |
| **« Recopier ce jour sur les N autres »** — cases ET convives | étape Jours | `etapeReglage.tsx:394`, `:428` |
| **Le stock promis à un plan prévu est retiré du disponible** | — | `front/src/composants/useFrigoCalculable.ts:60`, `front/src/calcul/planFige.ts:215` |
| **Sept rôles**, déduits de la catégorie — seule règle automatique | — | `front/src/solveur/repasVocabulaire.ts:36`, `:41` |
| **Un modèle de repas par moment** — le matin un fruit, la collation deux sources de protéines, midi et soir huile + légume | — | `repasVocabulaire.ts:125` |
| **Système 3×3 résolu exactement**, Gauss à pivot partiel | — | `front/src/solveur/algebre.ts:45` |
| **Arrondi AVANT le calcul des macros** | — | `front/src/solveur/solveur.ts:259` |
| **Toute la période partage un seul frigo**, résolue dans l'ordre du temps | — | `front/src/solveur/periode.ts:177` |
| **Plafonnement au stock et relais par rôle**, 12 tours, marge d'un demi-gramme | — | `front/src/solveur/plafonner.ts:175`, `:184` |
| **Recherche d'une meilleure combinaison** — deux échanges seulement | — | `front/src/solveur/auMieux.ts:58` |
| **Tableau à quatre colonnes** `aliment · à peser · servi · 1 pers.` | carte d'un repas | `front/src/composants/carteRepas.tsx:298` |
| **Macros par personne, chaque macro colorée indépendamment** | idem | `carteRepas.tsx:244` |
| **Ligne « dont X g de fibres »** | idem | `carteRepas.tsx:271` |
| **Remplacer un aliment par rôle — le remplaçant est verrouillé** | idem | `carteRepas.tsx:357`, `repas.tsx:583` |
| **Déclarer un reste — c'est un PLAFOND ; 0 retire l'aliment** | idem | `carteRepas.tsx:360`, `front/src/calcul/demandeRepas.ts:115`, `:132` |
| **Ajouter un aliment hors proposition** | idem | `carteRepas.tsx:464`, `demandeRepas.ts:266` |
| **Choisir qui prend le relais** | idem | `carteRepas.tsx:391`, `repas.tsx:534` |
| **Les avertissements**, du plus grave au plus utile | idem + étape Jours | voir ci-dessous |

### Les chiffres qui font foi

- **Tolérances** (une macro est « juste » en deçà) : `kcal 45`, `prot 1,5`,
  `gluc 2,5`, `lip 1,2` — `solveur.ts:10` (le calcul) et `demandeRepas.ts:26`
  (l'affichage). **Les deux tables doivent rester identiques.**
- **Pas d'arrondi** des quantités : protéine `1 g`, glucide `5 g`, lipide `0,5 g`
  — `solveur.ts:11`.
- **Marge de dépassement du stock** : `0,5 g` — `plafonner.ts:184`, `:229`.
- **Seuil de cohérence des cibles** : `15 kcal` — `solveur.ts:14`.
- **Apport négligeable** : une variable arrondie **sous 8 g** — `solveur.ts:457`.
- **Pivot singulier** : `EPSILON_RELATIF = 5e-3`, **relatif à l'amplitude de la
  colonne** — `algebre.ts:39`. Absolu, il ne se déclenchait que sur deux aliments
  strictement identiques.
- **Fibres à 2 kcal/g**, convention européenne — `front/src/calcul/nutrition.ts:12`,
  reprise par la carte à travers `kcalDesGrammes`, seule écriture de la somme
  d'Atwater depuis le 17 septembre 2026 (`carteRepas.tsx:22`, `:276`,
  `nutrition.ts:45-51`).
- **Quantités par personne du modèle** : légume `200 g`, huile `5 g`, fruit
  `55 g` au matin et `83 g` à 16 h, blancs d'œufs `175 g` à 16 h —
  `repasVocabulaire.ts:64`, `:76`, `:86`, `:123`.

## Le parcours

**Compte requis** : ordinaire, **avec au moins une cible enregistrée** (voir
`fonctionnalite-objectifs`) et **un frigo garni** (`db/manuel/jeu-essai.sql`).
Sans cible, la carte du repas affiche *« Aucun objectif défini pour ce repas.
Renseigne-les depuis ton compte. »* (`carteRepas.tsx:206`) ; sans stock, le
bouton « Composer » reste éteint (`etapeReglage.tsx:565`).

### Étape 1 — Jours

1. Onglet **Repas**. Le bandeau montre `1 Jours` · `2 Repas` · `3 Cuisiner`,
   la première en cours (`etapeReglage.tsx:101`).
2. Ligne **« Plusieurs jours »** avec son interrupteur. Sous-titre :
   **« Aujourd'hui seulement »** ou **« Choisis tes jours au calendrier »**
   (`etapeReglage.tsx:140`). **Toute la ligne bascule**, pas seulement
   l'interrupteur (`:122`) — et activer ouvre le calendrier (`:130`).
3. Le texte d'aide change avec l'état (`etapeReglage.tsx:156`) :
   - un jour : *« Coche les repas à cuisiner et dis pour combien de personnes. L'application composera à partir de ton frigo. »*
   - plusieurs : ***« Tous ces jours puisent dans le MÊME frigo : le premier se sert d'abord, le dernier prend ce qui reste. S'il manque quelque chose, tu auras la liste de courses à la fin. »***
4. Encart **« Quels jours »** → grille du mois. Résumé replié :
   **« 4 jours  ·  auj., dem., mar. 12/08, mer. 13/08 »** (`calendrier.tsx:75`).
   **On ne descend jamais sous un jour** (`etapeReglage.tsx:286`).
5. Quatre encarts par jour : `Matin`, `Midi`, `16 h`, `Soir`. Replié, chacun dit
   **« 2 pers.  ·  580 kcal · 40 P · 60 G · 15 L »**, ou **« aucun objectif
   défini »** (`etapeReglage.tsx:310`). La case est à droite ; **cocher ouvre le
   repas, décocher le referme** (`:324`).
6. Les convives se règlent par **− / +**, bornés à **1** et **12**
   (`etapeReglage.tsx:360-378`).
7. Avec plusieurs jours, sous le premier jour :
   **« Recopier ce jour sur les 3 autres »** (`etapeReglage.tsx:428`).
8. Bouton du bas : **« Composer les repas »** ou **« Composer les 4 jours »**
   (`etapeReglage.tsx:566`).

### Étape 2 — Repas

9. En tête, l'aide (`repas.tsx:392`) : *« Voilà ce que ton frigo permet. Change
   ce qui ne te va pas : les quantités se recalculent toutes seules pour retomber
   sur tes objectifs. S'il te reste un fond de casserole, écris son poids dans la
   case « reste » : c'est un maximum, le calcul en sert ce qu'il faut et pas plus.
   Mets 0 pour retirer un aliment de ce repas. »*
10. Une carte par repas. En tête : **« Midi  ·  2 personnes »**, puis les quatre
    macros **par personne**, **chacune colorée pour elle-même** — verte si
    `|écart| / convives ≤ tolérance`, vive sinon (`carteRepas.tsx:256`) — puis
    **« / pers. »** dès deux convives (`:264`).
11. Sous les macros : **« dont 12 g de fibres, soit 24 kcal hors cible »**, ou
    **« dont 12 g de fibres, comprises dans la cible en glucides »** si la cible
    est en glucides totaux (`carteRepas.tsx:271-278`). Les fibres se comptent sur
    le poids **à cuire**, jamais sur l'assiette (`:222`).
12. Ouvrir la carte : d'abord **« Compléments »** (`carteRepas.tsx:292`), puis
    l'en-tête du tableau — **`aliment` · `à peser` · `servi` · `1 pers.`**
    (`:298`) — et la consigne : ***« On pèse AVANT cuisson : la cuisson n'ajoute
    que de l'eau, jamais de calories, et l'eau absorbée change d'une fois sur
    l'autre. »*** (`:304`).
13. Une ligne par rôle, dans l'ordre `Laitage`, `Protéine`, `Glucide`, `Fruit`,
    `Oléagineux`, `Huile`, `Légume` (`demandeRepas.ts:30`). Un rôle que le modèle
    ne demande pas n'apparaît pas ; un rôle demandé mais introuvable affiche
    **« Aucun glucide utilisable dans ton frigo. »** (`carteRepas.tsx:340`).
    Une quantité absente s'écrit **« — »**, jamais `0` (`:157`).
14. Sous chaque ligne : **« ↻ Remplacer »**, un champ `reste` (`g`), et deux
    puces **`cru` / `cuit`** (`carteRepas.tsx:356-372`). Le défaut est **`cru`**,
    parce que c'est déjà la consigne affichée au-dessus (`:50`).
15. Les renforts s'affichent **sous la ligne qu'ils complètent**, liseré vert,
    étiquetés **« Complément »** ou **« À la place »** (`carteRepas.tsx:375-384`).
16. **« + Ajouter un aliment »** (`carteRepas.tsx:464`) ouvre la liste du stock
    moins ce qui est déjà au menu (`demandeRepas.ts:266`). Une ligne ajoutée
    porte le sous-titre **« Ajouté »**, un bouton **« × Retirer »** et un champ
    `quantité`.
17. Sous le tableau, la rangée **« cuisson »** : une puce par aliment,
    **« Riz · à choisir »**, **« Skyr · tel quel »** ou **« Riz · Eau bouillante »**
    (`carteRepas.tsx:477-510`). Voir `fonctionnalite-batch-cooking`.
18. Pied d'écran : **« Passer au batch cooking → »**, éteint tant qu'il reste des
    cuissons — il affiche alors **« 3 cuissons à renseigner »**
    (`repas.tsx:521-528`) — et **« ← Changer les jours »** (`:529`).

### Les avertissements — le moment fort

Ils viennent de trois endroits, et ne se ressemblent pas.

**Avant de composer**, sur l'étape Jours :

- **Frigo inutilisable** : **« Rien d'utilisable dans ton frigo »** (ou **« Ton
  frigo est injoignable »**), suivi de l'explication et du bouton
  **« Ouvrir mon frigo → »** (`etapeReglage.tsx:463-480`).
- **Données impossibles** : **« Des données de ton frigo rendent le calcul faux »**
  (fond rouge) ou **« Des données de ton frigo méritent une vérification »**,
  puis *« Le calcul sera juste, mais il partira de chiffres qui ne peuvent pas
  être vrais — et un résultat juste sur des chiffres faux reste faux. Corrige-les
  avant de cuisiner. »*, **jusqu'à 6 lignes** puis « … et N autre(s) », et
  **« Corriger dans mon frigo → »** (`etapeReglage.tsx:483-522`). Le contenu
  vient de `front/src/calcul/plausibilite.ts` — grain sec sous 300 kcal, féculent
  qui rétrécit, plus de 100 g de nutriments dans 100 g.
- **Fibres inconnues**, **seulement si une cible est en glucides totaux**
  (`front/src/calcul/planCalcule.ts:123`) : **« Fibres inconnues sur 6
  aliments »**, *« Ta cible compte les glucides TOTAUX — fibres comprises. Un
  aliment dont les fibres sont inconnues est compté comme s'il n'en avait aucune,
  et le calculateur en sert davantage pour atteindre le chiffre. Sur un pain
  complet, l'écart atteint 17 %. »* (`etapeReglage.tsx:529-548`).

**Pendant le calcul**, rendus en bas de la carte du repas, précédés de **« ⚠ »**
(`carteRepas.tsx:512`) :

- **Système singulier** (blocage) — *« Ces aliments se ressemblent trop pour que
  le calcul fonctionne. Choisis-en un plus riche en protéines, un plus riche en
  féculents et un plus gras. »* (`solveur.ts:200-206`).
- **Lipides incompressibles** (blocage) — *« Trop gras de 8,4 g : ce repas en
  apporte 60,0 g pour un objectif de 51,6 g, sans le moindre oléagineux. Choisis
  une viande ou un poisson plus maigre. »* (`solveur.ts:370-373`).
- **Le conseil chiffré** — un aliment, un nombre, un geste :
  ***« Retire environ 40 g de « riz » — ou garde-les pour le repas suivant. »***
  ou ***« Ajoute environ 44 g de « riz ». »***, et quand retirer tout ne suffit
  pas : *« Même en retirant tout le « riz » (290 g), il resterait un écart :
  c'est ailleurs qu'il faut couper. »* (`solveur.ts:332-350`). Il complète le
  constat : *« Trop de glucides de 12,3 g : ce repas en apporte 72,3 g pour un
  objectif de 60,0 g. »* (`:353`).
- **Apport négligeable** — *« Thon ne pèse quasiment rien ici (1,0 g, soit 0,3 g
  de protéines) : le reste du repas couvre déjà l'objectif. Retire-le, ou réduis
  ce que tu as déjà mis. »* (`solveur.ts:464-471`).
- **Quantité négative écartée** — *« Pas de skyr dans ce repas : le reste apporte
  déjà tout ce qu'il faut. »* (`solveur.ts:238-242`).
- **Stock insuffisant** (blocage) — *« Ce repas demande plus que ce que le frigo
  contient : Poulet (320 g demandés, 200 g en stock). Les relais du stock n'ont
  pas suffi à boucler le compte. Complète le frigo, ou compose ce repas à la
  main. »* (`plafonner.ts:163-170`).
- **Tout verrouillé** — *« Tout est verrouillé : rien ne peut être ajusté. Voici
  ce que donne ce que tu as, et ce qui manque pour tomber juste. »*
  (`solveur.ts:180-186`).

**Dans le corps du tableau**, en vert et non en rouge, parce que ce sont des
décisions et non des pannes :

- **Le relais, qui se touche** — *« Saumon : 200 g, c'est tout ce que tu as. Le
  reste est porté par Poulet.* **Changer** *»* — ou *« Rien d'autre ne peut
  prendre le relais. »* (`carteRepas.tsx:398-405`).
- **L'échange automatique** — *« Amandes ne permettait pas de tenir les
  objectifs : remplacé par Huile d'olive. Tu peux revenir dessus. »*, ou
  *« … c'est Huile d'olive qui s'en charge, sur sa propre ligne. »*
  (`carteRepas.tsx:409-416`).
- **Saisie illisible** — *« Quantité illisible — cet aliment compte pour 0 g. »*
  (`carteRepas.tsx:446-450`).

## Critères d'acceptation

1. **Les trois étapes sont nommées et on ne saute pas en avant.** `Jours`,
   `Repas`, `Cuisiner` ; une étape franchie porte **« ✓ »**, une étape à venir
   n'est pas touchable (`etapes.tsx:29`, `:44`).
2. **Revenir à « Jours » efface le plan.** Depuis l'étape Repas, toucher `Jours`
   (ou « ← Changer les jours ») repose l'écran de réglage et le plan est perdu
   (`repas.tsx:390`, `:529`) — les quantités ne voudraient plus rien dire.
   Depuis l'étape Cuisiner, toucher `Repas` revient au plan **sans l'effacer**,
   toucher `Jours` l'efface (`repas.tsx:338`).
3. **Le passé n'est pas sélectionnable** au calendrier ; le mois courant est la
   borne basse (`calendrier.tsx:111`, `:156`).
4. **Les repas ayant une cible sont pré-cochés, et un seul appui décoche.** C'est
   le bug du double appui : la bascule part de **ce qui est affiché**, pas du
   dictionnaire (`selectionRepas.ts:46`, `etapeReglage.tsx:338`).
5. **« Recopier ce jour sur les N autres » recopie les cases ET les convives**
   sur tous les jours suivants (`etapeReglage.tsx:402-425`).
6. **La colonne « à peser » ne dépend jamais du rendement.** Changer le rendement
   d'un aliment doit laisser « à peser » identique **à moins d'un gramme** et
   changer « servi » (`solveur.ts:120-135`, garantie I.10 de
   `front/src/solveur/garanties.test.ts:649`).
7. **« servi » respecte la cuisson choisie.** Un aliment marqué « tel quel »
   (`null`) s'affiche au poids de la balance, pas au poids × rendement — sinon
   100 g de riz s'annoncent à 300 g. La carte et la boîte doivent dire **le même
   chiffre** (`front/src/calcul/poidsServi.ts:67`, test croisé `poidsServi.test.ts`).
8. **Chaque macro est colorée pour elle-même**, sur l'écart **ramené à la
   personne** (`carteRepas.tsx:256`). Un repas juste en protéines et raté en
   lipides ne doit pas s'afficher tout en jaune.
9. **Un reste est un PLAFOND.** Déclarer « 290 g de pommes de terre » alors que
   la cible n'en demande que 150 doit servir **150**, pas 290
   (`demandeRepas.ts:115`). Le plafond vaut **pour ce repas seulement**
   (`periode.ts:36`).
10. **Zéro retire l'aliment**, il ne cherche pas de remplaçant
    (`demandeRepas.ts:132`). C'est la distinction vide ≠ zéro de la règle 6 :
    un champ vide laisse le calcul libre, un `0` est une décision.
11. **Une saisie illisible n'est jamais silencieusement un zéro.** Taper `8O` ou
    `-50` dans un `reste` : le message **« Quantité illisible — cet aliment
    compte pour 0 g. »** doit s'afficher (`carteRepas.tsx:446`,
    `demandeRepas.ts:64`).
12. **Un aliment remplacé est verrouillé** : le calculateur ne le remplacera plus
    de lui-même (`repas.tsx:583`, `auMieux.ts:102`, `:116`). Garantie I.6,
    `garanties.test.ts:424`.
13. **Le frigo a le dernier mot** (garantie I.3, `garanties.test.ts:266`) : aucune
    quantité ne dépasse le stock, marge de `0,5 g` comprise, et **tout
    plafonnement est annoncé** — soit par la ligne verte « c'est tout ce que tu
    as », soit par le blocage `stock_insuffisant`. Y compris sur la **sortie de
    secours** des 12 tours : c'est le défaut F7 du 15 septembre 2026, où un repas
    impossible ressortait `ok: true` sans un diagnostic (`plafonner.ts:125-146`).
14. **Une période partage un seul frigo, dans l'ordre du temps.** Deux repas qui
    réclament chacun 400 g de brocoli quand il en reste 500 : le premier est
    servi, le second est plafonné et **le dit** (`periode.ts:177`,
    `garanties.test.ts:910`). Cocher ses jours à rebours doit donner **le même
    résultat** (`periode.ts:205`).
15. **Le stock promis à un plan prévu est indisponible.** Enregistrer un plan,
    puis en composer un second : le second ne doit pas reprendre les mêmes
    grammes (`useFrigoCalculable.ts:60`, `planFige.ts:215`). Un plan **cuisiné**
    ne réserve plus rien.
16. **Deux fois la même question, deux fois la même réponse** (garantie I.5,
    `garanties.test.ts:371`) : recomposer sans rien changer redonne exactement le
    même plan. Le départage des aliments est stable (`composer.ts:77`).
17. **Chercher mieux ne fait jamais pire, et un échange annoncé a eu lieu**
    (garantie I.7, `garanties.test.ts:489`) : un échange n'est retenu que si la
    pénalité **baisse strictement**, et il n'est **annoncé** que si l'aliment
    retiré n'est pas revenu et que le remplaçant pèse quelque chose
    (`auMieux.ts:79-96`).
18. **Les nombres affichés sont les vrais** (garantie I.1,
    `garanties.test.ts:157`) : les macros se recomposent depuis l'affichage, et
    **aucun message ne laisse échapper un `NaN` ou un `undefined`**.
19. **Il ne se trompe jamais en silence** (garantie I.4, `garanties.test.ts:316`) :
    « objectifs atteints » veut dire atteints sur les **trois** macros ; un repas
    raté le dit ; un repas juste ne crie pas au loup. Le résumé d'un jour replié
    affiche **« 4 repas  ·  2 hors cible »** (`repas.tsx:503`).
20. **La convention glucidique ne se retourne jamais contre l'utilisateur**
    (garantie I.8, `garanties.test.ts:527`) : cocher « fibres comprises » ne doit
    **jamais** faire servir **plus** de féculent.
21. **On ne signale que ce qui manque vraiment** (`garanties.test.ts:849`) : pas
    de « Aucune huile utilisable » au petit-déjeuner, qui n'en sert pas
    (`repasVocabulaire.ts:175`, `carteRepas.tsx:335`).
22. **Le refus quand il n'y a pas de solution.** Trois aliments trop semblables
    doivent produire le blocage `systeme_singulier` — et le seuil est **relatif** :
    deux riz distants de 1,4 % doivent être refusés, riz blanc et riz complet
    doivent passer (`algebre.ts:39`).
23. **Le conseil chiffré désigne un seul aliment et un seul nombre**, avec le bon
    verbe selon le signe de l'écart (`solveur.ts:319-350`). Il ne s'affiche pas
    s'il proposerait 0 g ou s'il désignerait le mauvais aliment.
24. **Isolation entre comptes (règle 2)** : le frigo, les cibles et les plans d'un
    second compte n'apparaissent jamais.

## Comment l'éprouver

**Web par défaut**, avec la préparation de `epreuve-fonctionnalite` et un compte
jetable chargé avec `jeu-essai.sql` **et** `jeu-demo.sql` (relire l'adresse du
`sed` avant d'appuyer sur Entrée : `jeu-demo.sql` EFFACE avant de poser).

```bash
docker ps --format '{{.Names}}\t{{.Status}}'
curl -s http://localhost:8080/api/etat
"$(git rev-parse --show-toplevel)"/db/manuel/rattraper-dev.sh
npm --prefix "$(git rev-parse --show-toplevel)"/front run build:web
```

**Éprouver les avertissements demande de fabriquer le cas.** Ils ne s'affichent
pas sur un frigo sain — c'est le but. Sur un aliment **créé par le compte
jetable** (jamais sur une donnée qu'on n'a pas créée) :

| Avertissement visé | Comment le provoquer |
|---|---|
| `grain_sec_invraisemblable` | un aliment `fec`, rendement `2,3`, **83 kcal/100 g** |
| `valeurs_deja_cuites` | un aliment `fec`, rendement `3,5`, **99 kcal/100 g** (350 une fois multiplié) |
| `feculent_qui_retrecit` | un aliment `fec` avec un rendement **`0,41`** — **impossible à créer sur un compte tenu en base** : l'éditeur (`rendementPossible`), l'API (`RendementPlausible::sens`) et la base (`aliment_ratio_sens`) refusent un féculent sous 1. Seul un produit Grocy peut le porter |
| fibres inconnues | une cible **en glucides totaux** + un aliment `fec` sans fibres |
| `systeme_singulier` | deux féculents quasi identiques et rien d'autre d'utilisable |
| `lipides_incompressibles` | une protéine grasse, **aucun oléagineux** en stock |
| conseil chiffré | déclarer un `reste` très supérieur à la cible sur le féculent |
| `apport_negligeable` | une cible protéines déjà couverte par un ajout imposé |
| `stock_insuffisant` | un stock de quelques grammes sur tous les candidats d'un rôle |

**Les modules de calcul se prouvent aussi sans écran**, et c'est la preuve la
plus courte pour les chiffres :

```bash
cd "$(git rev-parse --show-toplevel)"/front && npm test
```

**Pièges propres à cet écran :**

- **Une cible manquante, et le repas n'est pas résolu du tout.**
  `demandesDuPlan` saute les repas sans cible (`planCalcule.ts:175`) : la carte
  affiche « Aucun objectif défini », pas un plan vide. Ce n'est pas un bug.
- **Un aliment sans poids par unité ou sans calories est écarté du stock**
  (`planCalcule.ts:42`). Un frigo qui paraît plein peut être vide pour le
  calculateur — le message de l'étape Jours le dit.
- **Le message de cible incohérente n'apparaît PAS sur la carte du repas.** Le
  solveur l'émet en gravité `info` (`solveur.ts:431`) et la carte filtre les
  `info` (`carteRepas.tsx:513`). Il ne se voit que sur l'écran des objectifs.
  **Ne pas le chercher ici**, et ne pas le promettre pendant la bobine 4.
- **Le champ `reste` et les puces `cru`/`cuit` sont deux réglages distincts** :
  changer l'unité **ne convertit pas** le nombre déjà tapé, elle change sa
  lecture (`carteRepas.tsx:52-68`). C'est assumé et affiché par deux puces
  plutôt que par un bouton à étiquette ambiguë.
- **Le bouton du batch cooking est éteint tant qu'une cuisson manque**
  (`repas.tsx:524`). Pour passer à l'étape 3, régler les cuissons ou appuyer sur
  « Les N autres se mangent tels quels ».
- **Aucun rendu de cet écran n'est couvert par les tests.** Le projet embarque
  bien `@testing-library/react` (sous `global-jsdom`) et `npm test` passe 33
  tests de rendu (17 septembre 2026), mais aucun ne monte `carteRepas.tsx` :
  monter une ligne charge tout le fichier, donc `complements` → `api/hooks` →
  `client.ts` → `expo-secure-store`, un module natif que le banc ne fournit
  pas sans doublure (`carteRepas.tsx:127-134`,
  `front/src/tests/environnement.ts:60-63`). Le câblage écran ↔ module **ne se
  prouve qu'à l'écran** — c'est exactement ce que cette fiche existe pour faire.

## La capture pour la démonstration

Reprend la **bobine 4** de `presentation/demonstration.md` (« On planifie la
semaine », ~5 min, *la bobine décisive*), découpée en prises courtes. Les plans
4.6 (cuissons), 4.9 (batch), 4.10 (courses) appartiennent à
`fonctionnalite-batch-cooking`.

`presentation/captures/calculateur-repas/01-jours-et-convives.webm` — **~45 s**
: onglet Repas. Montrer les quatre repas et leurs cibles, activer **« Plusieurs
jours »**, cocher quatre jours au calendrier, régler les convives d'un repas,
puis **« Recopier ce jour sur les 3 autres »**. Finir sur
**« Composer les 4 jours »**.
*Ce qu'on dit* : « Quatre repas, quatre cibles. Je coche ce que je cuisine, je
dis pour combien — et tous ces jours puisent dans le même frigo. »

`presentation/captures/calculateur-repas/02-le-tableau.webm` — **~40 s**
: **ne pas parler pendant le calcul**. Une fois le résultat affiché, ouvrir une
carte et s'arrêter sur les colonnes **`à peser` · `servi` · `1 pers.`** et sur la
consigne **« On pèse AVANT cuisson »**.
*Ce qu'on dit* : « La première colonne, c'est ce que je mets sur la balance,
avant cuisson. La dernière, ce que je me sers. Ce n'est pas du tâtonnement :
c'est un système d'équations résolu par élimination de Gauss, sous contrainte du
stock réel. »

`presentation/captures/calculateur-repas/03-les-avertissements.webm` — **~50 s**,
**le moment fort**
: sur un frigo préparé, dérouler jusqu'aux bandeaux. Lire à l'image
**« Des données de ton frigo rendent le calcul faux »** puis la ligne du grain
sec, et juste en dessous **« Fibres inconnues sur 6 aliments »** avec l'écart de
17 %. Puis ouvrir une carte ratée et lire un **conseil chiffré**.
*Ce qu'on dit* : « Un grain sec fait 300 à 400 kilocalories aux cent grammes.
C'est une borne physique, pas une moyenne — l'application refuse de calculer sur
des chiffres qui ne peuvent pas être vrais. Et quand ça ne tombe pas juste, elle
ne dit pas « réduisez une quantité » : elle dit lequel, et combien. »

`presentation/captures/calculateur-repas/04-corriger.webm` — **~50 s**
: **remplacer** un aliment (montrer qu'il devient verrouillé), déclarer un
**reste** sur un autre et voir les quantités se recalculer **sans dépasser** le
chiffre déclaré, mettre un aliment à **0** pour le retirer, puis **ajouter** un
aliment hors proposition.
*Ce qu'on dit* : « Je change ce qui ne me va pas, et tout se recalcule pour
retomber sur mes objectifs. Un reste, c'est un maximum : le calcul en sert ce
qu'il faut, pas plus. »

Une prise ratée se refait ; **on ne monte jamais une prise fausse**.

## Limites connues

- **Le solveur ne juge pas de la pertinence culinaire** : 380 g de skyr sont
  mathématiquement justes (`features.md`, section I).
- **Les kilocalories ne sont pas une contrainte indépendante** : elles découlent
  des macros. En cas de cible incohérente, l'application respecte les grammes.
- **Les micronutriments sont hors périmètre.**
- **Les valeurs viennent de la base avec leur propre marge d'erreur** : viser
  mieux qu'un gramme par macro n'aurait pas de sens.
- **Le garde-fou nutritionnel n'est pas infaillible** : un aliment sans macros et
  sous 900 kcal passe entre les mailles (`nutrition.ts:155-156`). C'est un garde-fou,
  pas une garantie.
- **Trois variables au plus.** Le modèle d'un repas fige ce qui n'est pas
  ajustable (`repasVocabulaire.ts:99`) : quatre variables libres pour trois
  macros n'auraient pas de solution unique. Les aliments ajoutés à la main sont
  donc des quantités **imposées**, pas des variables (`demandeRepas.ts:206`).
- **La forme d'un repas est celle du propriétaire**, dictée par lui, et se change
  dans `MODELE` — nulle part ailleurs (`repasVocabulaire.ts:102`). Ce n'est pas
  une règle déduite des catégories.
- **Deux échanges automatiques seulement** (huile ↔ oléagineux, et les trois
  protéines les plus maigres) : au-delà, on ne rabote que des dixièmes de gramme
  (`auMieux.ts:99-135`).
- **Remplacer n'engage que le repas qu'on regarde.** L'application ne retient pas
  qu'un aliment « n'a pas sa place » à ce repas : elle ne sait pas distinguer
  « l'avoine n'a rien à faire à midi » de « aujourd'hui j'ai envie de saumon »
  (`repasVocabulaire.ts:29`).
- **Le câblage écran ↔ module n'a pas de test.** C'est exactement le défaut F2 du
  15 septembre 2026 : la règle était juste dans `fournees.ts` et absente de
  l'écran, et un test de la fonction pure serait resté vert. Sortir
  `LigneAliment` dans son propre module la rendrait montable seule — **un quart
  d'heure, non fait** (`carteRepas.tsx:127-134`).
- **`presentation/features.md` (14 septembre 2026) cite cet écran en
  `repas.tsx:2054`, `:2120`, `:2239`, `composer.ts:800` : ces lignes n'existent
  plus.** Ses renvois vers `solveur.ts`, `nutrition.ts` et `plausibilite.ts`,
  eux, ont été recalés le 17 septembre 2026. Le découpage du 15 septembre a ramené `repas.tsx` à
  655 lignes et éclaté `composer.ts` en cinq fichiers. Les `fichier:ligne` de
  cette fiche ont été relus le 16 septembre 2026.
