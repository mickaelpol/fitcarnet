---
name: fonctionnalite-batch-cooking
description: Cuisiner plusieurs jours d'un coup — les trois états d'une cuisson dont « personne n'a décidé », la mémorisation des habitudes, les fournées groupées par façon de cuire (on pèse sec), la répartition en boîtes (en cuit, colonnes boîte et 1 pers.), ce qui s'ajoute au moment de manger, et la liste de courses. À charger avec `epreuve-fonctionnalite` pour éprouver et filmer l'étape « Cuisiner ».
---

# Le batch cooking

## Le besoin

Quelqu'un a un plan de plusieurs jours, calculé sur son frigo réel. Il va
cuisiner **une fois** — dimanche après-midi — pour toute la semaine. À cet
instant, il ne raisonne plus en repas mais **en casseroles** : ce qui part au
four ensemble, ce qui va à l'eau, et ce qu'on met dans chaque boîte.

Deux conversions rendent l'exercice faux si on les rate, et l'écran existe pour
les tenir :

- **on pèse SEC** ce qu'on met à cuire — la cuisson n'ajoute que de l'eau, et
  l'eau absorbée varie d'une fois sur l'autre ;
- **on répartit du CUIT** dans les boîtes — annoncer le poids sec devant des
  boîtes ferait servir **trois fois trop**.

Et une question de plus : **ce qu'il faut acheter** pour que le plan tienne tel
qu'il était prévu, et pas tel que le frigo l'a contraint.

## Ce que l'application propose

| Capacité | Où | `fichier:ligne` |
|---|---|---|
| **Trois états de cuisson**, et la différence entre les deux derniers compte | étape Repas, rangée « cuisson » | `front/src/calcul/fournees.ts:31`, `:46` |
| **Compteur des aliments à situer** et bouton « les autres se mangent tels quels » | étape Repas | `front/app/(onglets)/repas.tsx:405`, `front/src/calcul/fournees.ts:188` |
| **Sélecteur « Comment cuire X ? »**, avec la marque « ce que tu fais d'habitude » | modale | `repas.tsx:600`, `:612` |
| **Les cuissons sont mémorisées** d'une fois sur l'autre, et pré-remplies | — | `front/src/calcul/habitudesCuisson.ts:86`, `repas.tsx:432` |
| **Deux couches** : habitudes en dessous, choix explicites au-dessus | — | `front/src/calcul/planCalcule.ts:221` |
| **Seules les nouveautés sont écrites**, et la dernière décision gagne | — | `habitudesCuisson.ts:126`, `:138` |
| **Écriture au passage au batch cooking**, en un seul `PUT` | — | `front/src/composants/usePlanCalcule.ts:159`, `front/src/api/hooks/cuissons.ts:74` |
| **Fournées groupées par façon de cuire**, quantités additionnées sur la période | étape Cuisiner | `fournees.ts:127` |
| **« On pèse sec »**, dit à l'endroit où la question se pose | étape Cuisiner | `front/src/composants/etapeBatch.tsx:114` |
| **Répartition en boîtes**, une par repas, en poids **cuit** | étape Cuisiner | `fournees.ts:226`, `etapeBatch.tsx:147` |
| **Deux colonnes, `boîte` et `1 pers.`** | idem | `front/src/composants/tablesPlan.tsx:59` |
| **« à ajouter au moment de manger »** | idem | `etapeBatch.tsx:183` |
| **Les compléments du repas dans sa boîte** | idem | `etapeBatch.tsx:209` |
| **Liste de courses** — la période résolue **deux fois** | idem | `front/src/solveur/periode.ts:253`, `etapeBatch.tsx:73` |
| **Enregistrer le plan** sous un nom libre | idem | `etapeBatch.tsx:220`, `front/src/calcul/planFige.ts:98` |
| **Vocabulaire administré** — seul l'administrateur ajoute une façon de cuire | API | `api/src/Entity/ModeCuisson.php:49` |

### Les chiffres et les règles qui font foi

- **Seuil de la liste de courses : 5 g** — `periode.ts:280`. *« Un gramme
  manquant n'est pas une course. »* Les grammes sont ensuite arrondis **au
  supérieur** (`Math.ceil`, `:281`) et triés par nom.
- **Les poids d'une fournée sont ceux de la balance** (`aCuire`), additionnés sur
  toute la période — `fournees.ts:152`, `:154`.
- **Les poids d'une boîte sont en cuit** (`assiette`), **sauf** pour ce qui est
  marqué « sans cuisson », qui reste au poids pesé — `fournees.ts:250`.
- **`parPersonne = servi / Math.max(1, convives)`** — `fournees.ts:258`, et la
  **même** formule dans `poidsServi.ts:76`. Les deux écrans doivent dire le même
  chiffre : à zéro convive, l'un annonçait `Infinity` et l'autre le poids entier.
- **L'identifiant du mode EST la fournée** : « Four 180 » et « Four 200 » sont
  deux lignes, donc **deux fournées** — `fournees.ts:11-19`.
- **Ordre des fournées** : celui de la table, voulu par l'administrateur
  (`ordre`, puis libellé) — `fournees.ts:173`.

## Le parcours

**Compte requis** : ordinaire, avec des cibles, un frigo garni, et **un plan
composé** (étape 2 franchie — voir `fonctionnalite-calculateur-repas`). Il faut
aussi **au moins une façon de cuire** dans la table `mode_cuisson`.

### Régler les cuissons (fin de l'étape 2)

1. Sous le tableau d'un repas, la rangée **« cuisson »** porte une puce par
   aliment : **« Riz · à choisir »** (en couleur vive), **« Skyr · tel quel »**,
   ou **« Riz · Eau bouillante »** (`front/src/composants/carteRepas.tsx:477-510`).
   Le troisième état **doit se voir** : c'est le seul qui demande une action.
2. En haut de l'écran, tant qu'il en reste :
   **« 3 aliments dont on ne sait pas encore comment ils se cuisent.
   Touche-les sous « cuisson » dans le repas, ou règle tout le reste d'un
   coup. »**, avec le bouton **« Les 3 autres se mangent tels quels »**
   (au singulier : **« Le dernier se mange tel quel »**) — `repas.tsx:405-425`.
3. Toucher une puce ouvre **« Comment cuire Riz ? »**. La liste commence par
   **« Se mange tel quel »** (détail : **« aucune cuisson »**), puis les façons
   de cuire de la table. Celle qui correspond à l'habitude porte le détail
   **« ce que tu fais d'habitude »** (`repas.tsx:600-624`).
4. Quand tout est réglé, le bandeau devient : **« Les cuissons sont déjà remplies
   avec ce que tu avais fait la dernière fois. Touche-en une pour la changer —
   c'est la nouvelle qui sera retenue. »** (`repas.tsx:432-438`).
5. Le bouton du pied passe de **« 3 cuissons à renseigner »** (éteint) à
   **« Passer au batch cooking → »** (`repas.tsx:521-528`). L'appui **écrit les
   habitudes nouvelles** puis change d'étape (`:522`, `usePlanCalcule.ts:159`).

### Étape 3 — Cuisiner

6. Le bandeau montre `Jours ✓` · `Repas ✓` · `3 Cuisiner`
   (`etapeBatch.tsx:71`). **L'ordre de l'écran est celui des gestes** : ce qu'il
   faut aller chercher, ce qu'on met à cuire, ce qu'on range.
7. **« Liste de courses »**, repliable, résumé **« 4 aliments manquants »**, et
   l'aide : *« Ce qu'il manque pour cuisiner ce plan tel qu'il est prévu, ton
   frigo déjà déduit. »* (`etapeBatch.tsx:73-95`). Absente s'il ne manque rien.
8. **« À cuire · 3 fournées »** (`etapeBatch.tsx:98`), suivi de la consigne :
   ***« Ces poids sont ceux de la BALANCE, avant cuisson : riz sec, pâtes sèches,
   viande crue. La cuisson n'ajoute que de l'eau — elle change le poids, jamais
   les calories — et l'eau absorbée varie d'une fois sur l'autre. Sec, le chiffre
   est toujours le même. Tout ce qui partage une fournée part ensemble. »***
   (`:114-120`).
9. Une carte par fournée : le **libellé du mode** en titre, puis
   **« 640 g à peser en tout »** (`etapeBatch.tsx:128-130`), puis une ligne
   `pastille · nom · N g` par aliment, **triée par poids décroissant**
   (`fournees.ts:168`).
10. Si rien ne se cuit : **« Aucun aliment de ce plan ne se cuit. Il n'y a rien à
    mettre en fournée — passe directement aux boîtes. »** (`etapeBatch.tsx:123`).
11. **« À répartir · 8 boîtes »** (`etapeBatch.tsx:144`), suivi de :
    ***« Ces poids-là sont ceux du produit CUIT. La colonne « boîte » est ce
    qu'on y met pour tout le monde ; la colonne « 1 pers. », en doré, est ce que
    TU te sers le jour venu pour tenir tes macros. »*** (`:147-151`).
12. Une boîte par repas, dans l'ordre où on les mangera. Titre
    **« Aujourd'hui · Midi »** (`repas.tsx:176-184`), résumé
    **« 480 g cuits  ·  2 personnes  ·  3 à ajouter après »**
    (`etapeBatch.tsx:161-163`).
13. Dépliée : l'en-tête **`aliment` · `boîte` · `1 pers.`**
    (`tablesPlan.tsx:59`), les lignes cuites, puis — s'il y en a — le titre
    **« à ajouter au moment de manger »** et les lignes **en gris, pastille
    comprise** (`etapeBatch.tsx:181-195`, `tablesPlan.tsx:77`).
14. Enfin les **compléments de ce repas**, sous le titre **« compléments »**
    (`etapeBatch.tsx:209`, `front/src/composants/complements.tsx:113`). Ils sont
    relus à chaque affichage, jamais figés.
15. Pied d'écran : le champ **« Enregistrer ce plan sous »** (marque-page
    *« Semaine du 11/08 »*), le bouton **« Enregistrer »** → **« Enregistrement… »**,
    et **« ← Revenir au plan »** (`etapeBatch.tsx:220-248`). Après
    l'enregistrement, **tout repart de zéro** et la liste des plans s'ouvre, comme
    preuve (`repas.tsx:340-346`).

## Critères d'acceptation

1. **Trois états, et « je n'en mets pas » n'est pas « je n'ai pas répondu ».**
   Un aliment sans décision compte dans le compteur ; un aliment marqué
   « se mange tel quel » n'y compte plus, **même s'il n'ira dans aucune
   fournée** (`fournees.ts:204-218`). C'est la même distinction que vide ≠ zéro
   (règle 6).
2. **Le bouton « Les N autres se mangent tels quels » ne touche pas aux choix
   déjà faits** — ni aux explicites, ni aux « sans cuisson » déjà posés
   (`fournees.ts:188-201`).
3. **Il part des cuissons EFFECTIVES, habitudes comprises.** Un riz dont
   l'habitude dit « à l'eau » ne doit **pas** devenir « sans cuisson » après cet
   appui (`repas.tsx:415-420`, `usePlanCalcule.ts:179`).
4. **Un choix explicite est indéracinable.** Les habitudes se superposent
   **en dessous** (`planCalcule.ts:226`) : changer l'habitude entre-temps ne doit
   jamais écraser ce que l'utilisateur vient de toucher.
5. **La mémorisation fonctionne d'un plan à l'autre.** Composer, régler « Riz →
   Eau bouillante », passer au batch cooking, tout recommencer : au plan suivant
   le riz est **déjà** réglé, et la puce ne dit plus « à choisir »
   (`habitudesCuisson.ts:86`).
6. **Seules les nouveautés sont écrites.** Recomposer un plan identique sans rien
   changer ne doit provoquer **aucune écriture** (`habitudesCuisson.ts:126`,
   `usePlanCalcule.ts:160`). Vérifiable sur `maj_le` en base.
7. **La dernière décision gagne.** Un riz mis au four lundi puis remis à l'eau
   jeudi enregistre **« eau »** (`habitudesCuisson.ts:131-147`).
8. **La clé d'habitude est le nom normalisé.** « Riz Basmati », « riz basmati » et
   « Riz basmati  » sont **un seul** riz (`habitudesCuisson.ts:66`). C'est le seul
   identifiant que les deux frigos aient en commun — un aliment Grocy porte
   `grocy:12`, un aliment de la base porte un entier.
9. **Deux modes différents font deux fournées.** « Four 180 » et « Four 200 » ne
   se mélangent jamais (`fournees.ts:132-157`).
10. **Les quantités s'additionnent sur toute la période** : un aliment servi à
    quatre repas donne **une seule ligne** et son total (`fournees.ts:151-155`).
11. **Une fournée annonce des poids SECS.** Vérifier sur un féculent : la ligne de
    fournée doit porter le **même chiffre** que la colonne « à peser » de la carte
    du repas, pas le poids cuit.
12. **Une boîte annonce des poids CUITS** — sauf pour ce qui est marqué « sans
    cuisson », qui reste au poids pesé (`fournees.ts:250`). C'est le défaut F2 du
    15 septembre 2026 : la boîte annonçait 200 g de flocons d'avoine pour 100 g
    pesés tout en les rangeant parmi les crus, et qui suit la boîte se sert du
    double.
13. **La carte et la boîte ne se contredisent jamais** sur le même aliment du même
    repas. C'est la deuxième moitié de F2 : `poidsServi.ts` porte la décision et
    son test croisé la compare à celle de `repartition`
    (`front/src/calcul/poidsServi.ts:59-76`).
14. **La colonne « 1 pers. » vaut pour une personne, quelle que soit la tablée**
    (garantie I.11, `front/src/solveur/garanties.test.ts:726`) : cuisiner pour
    trois ne déplace pas l'assiette. Une boîte pour trois contient trois
    portions, mais **ses macros ne valent que pour une**.
15. **Ce qui ne se cuit pas est listé à part et se voit.** Le titre « à ajouter au
    moment de manger » et le gris de la ligne sont le seul signal qui distingue
    « rangé cinq jours à l'avance » de « à sortir le jour venu »
    (`tablesPlan.tsx:69-75`). Le taire ferait des macros fausses le jour venu.
16. **La liste de courses répond à la bonne question.** La période est résolue
    **deux fois** — une fois bridée par le frigo, une fois **frigo plein** — et la
    liste est la différence (`periode.ts:253-283`). Compter les manques du premier
    calcul répondrait **« rien »** : le solveur ne subit pas une pénurie, il la
    **contourne** (à court de brocoli il sert des haricots, et le plan tient).
17. **Les restes déclarés sont ignorés dans la passe « frigo plein »**
    (`periode.ts:191`, `:261-263`). Déclarer « il me reste 80 g de riz » faisait
    **sous-acheter jusqu'à 542 g** sur un seul aliment : un plafond décrit le
    frigo, pas le plan.
18. **Seuil de 5 g** : un manque de 2 g n'apparaît pas dans la liste
    (`periode.ts:280`). Les grammes affichés sont arrondis au supérieur.
19. **Un mode supprimé par l'administrateur n'invente pas de libellé** : la
    fournée est écartée (`fournees.ts:162-165`), et les habitudes qui le visaient
    partent en `CASCADE` — l'écran **repose la question** plutôt que de
    pré-remplir « se mange tel quel », qui serait une réponse fausse et muette
    (`api/src/Entity/CuissonHabituelle.php:69-81`,
    `front/src/api/hooks/cuissons.ts:111-118`).
20. **Une clé de boîte illisible n'affiche pas les compléments d'un repas tiré au
    sort** : `lireLaCle` rend `null` et la ligne est omise (`etapeBatch.tsx:155`,
    `:209`, `front/src/solveur/periode.ts:142`).
21. **Le plan enregistré est un instantané.** Il porte des noms et des grammes,
    la date de chaque boîte **résolue au moment où on fige**, et le champ `repas`
    en code — **sans repli sur `'R1'`** (`planFige.ts:98-145`). Un repli aurait
    écrit « Matin » dans un plan persisté, et la relecture aurait montré les
    compléments du matin sur une boîte prise le soir.
22. **Le passage à l'étape 3 est interdit tant qu'une cuisson manque**
    (`repas.tsx:524`) : des fournées incomplètes se découvriraient devant les
    casseroles.
23. **L'échec d'écriture des habitudes ne bloque rien et ne s'affiche pas**
    (`usePlanCalcule.ts:161`) : une habitude perdue coûte un appui la semaine
    prochaine ; interrompre quelqu'un qui va cuisiner coûte plus cher.
24. **Isolation entre comptes (règle 2)** : `GET /api/mes-cuissons` ne rend que
    les habitudes du compte connecté ; la table `cuisson_habituelle` porte
    `utilisateur_id` avec un index unique `(utilisateur_id, aliment)`
    (`CuissonHabituelle.php:39`). Les **façons de cuire**, elles, sont
    volontairement **communes** : tout le monde lit, seul l'administrateur écrit
    (`ModeCuisson.php:51-57`).
25. **Jamais d'erreur en silence** : un échec d'enregistrement du plan affiche le
    message du serveur sous le bouton (`etapeBatch.tsx:241`).

## Comment l'éprouver

**Web par défaut**, avec la préparation de `epreuve-fonctionnalite`. Il faut en
plus **au moins deux façons de cuire** en base pour éprouver le groupement :

```bash
docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -c \
  "SELECT id, libelle, ordre FROM mode_cuisson ORDER BY ordre, libelle;"
```

S'il n'y en a pas, elles s'ajoutent depuis **Compte → Façons de cuire** avec un
compte administrateur jetable (`front/app/(onglets)/compte.tsx:92`) — **jamais en
écrivant directement dans la table d'un autre compte**.

**Prouver la mémorisation, de bout en bout :**

```bash
# avant : ce que le compte sait déjà
docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -c \
  "SELECT h.aliment, m.libelle, h.maj_le FROM cuisson_habituelle h
     LEFT JOIN mode_cuisson m ON m.id = h.mode_cuisson_id
     JOIN utilisateur u ON u.id = h.utilisateur_id
    WHERE u.email = 'batch-verif@test.local' ORDER BY h.aliment;"
```

Régler une cuisson, appuyer sur **« Passer au batch cooking → »**, rejouer la
requête : la ligne doit apparaître, avec `aliment` **en minuscules et sans
accents** (c'est `cleDHabitude` qui l'écrit, l'API ne la lit pas). Recomposer un
plan identique et vérifier que **`maj_le` n'a pas bougé** prouve le critère 6.

`mode_cuisson_id` à **`NULL`** veut dire « se mange tel quel » — c'est une
réponse, pas une absence (`CuissonHabituelle.php:69`).

**Prouver les deux pesées.** Sur un féculent à fort rendement (riz, rendement
≈ 3), relever les trois chiffres et vérifier à la main :

- carte du repas, colonne **« à peser »** = ligne de **fournée** ;
- colonne **« servi »** = colonne **« boîte »** de la boîte correspondante ;
- **« boîte » / convives** = colonne **« 1 pers. »**.

Marquer ensuite ce même riz **« Se mange tel quel »** : les trois colonnes
doivent retomber sur le **poids pesé** des deux côtés (critères 12 et 13).

**Prouver la liste de courses.** Le seul moyen honnête est de **réduire le
stock** d'un aliment créé par le compte jetable jusqu'à ce que le plan ne tienne
plus, puis de vérifier que la ligne apparaît avec un manque **≥ 5 g**. Déclarer
ensuite un **reste** sur ce même aliment ne doit **pas** faire baisser la
quantité à acheter (critère 17).

**Les modules se prouvent aussi sans écran :**

```bash
cd "$(git rev-parse --show-toplevel)"/front && npm test
```

`fournees.test.ts`, `habitudesCuisson.test.ts`, `poidsServi.test.ts`,
`planFige.test.ts` et `periode.test.ts` portent l'essentiel de cette fiche.

**Pièges propres à cet écran :**

- **`front/src/calcul/cuisson.ts` ne fait plus que ré-exporter** (22 lignes,
  `:20-22`). Le vrai code est dans `fournees.ts`, `planFige.ts` et
  `habitudesCuisson.ts`. Chercher une formule dans `cuisson.ts` fait perdre du
  temps ; un module qui naît aujourd'hui vise le fichier précis.
- **Les habitudes ne s'écrivent qu'au passage à l'étape 3** — pas à chaque appui
  dans le sélecteur (pour ne pas enregistrer des hésitations), pas à
  l'enregistrement du plan (pour ne pas rater les plans qu'on consulte sans
  enregistrer). Éprouver la mémorisation **sans passer à l'étape 3** ne prouve
  rien (`usePlanCalcule.ts:146-162`).
- **Le compteur « à situer » lit les cuissons effectives**, habitudes comprises :
  sur un compte qui a déjà tout réglé, il vaut `0` dès la composition et le
  bandeau du bouton n'apparaît jamais. Pour filmer le bandeau, il faut un compte
  **neuf** ou un aliment jamais cuisiné.
- **Une boîte vide de cuits existe** : si rien ne se cuit dans ce repas, le
  résumé annonce `0 g cuits` et tout est en « à ajouter après ». Ce n'est pas un
  bug.
- **La liste de courses ne s'affiche pas quand il ne manque rien**
  (`etapeBatch.tsx:73`) — sur un frigo bien garni, il n'y a rien à filmer.
- **Les compléments d'une boîte ne sont pas figés** : changer sa routine met à
  jour les plans déjà enregistrés (`front/src/composants/planRelu.tsx:179-191`).
  C'est délibéré — une consigne courante, pas un instantané.

## La capture pour la démonstration

Reprend les plans **4.6**, **4.9**, **4.10** et **4.11** de la **bobine 4** de
`presentation/demonstration.md`.

`presentation/captures/batch-cooking/01-les-cuissons.webm` — **~45 s**
: sur un plan composé, montrer le bandeau **« 6 aliments dont on ne sait pas
encore comment ils se cuisent »**, toucher une puce **« Riz · à choisir »**,
choisir une façon de cuire dans **« Comment cuire Riz ? »**, puis appuyer sur
**« Les 5 autres se mangent tels quels »**. Finir sur le bouton du pied qui
passe de **« 5 cuissons à renseigner »** à **« Passer au batch cooking → »**.
*Ce qu'on dit* : « Chaque aliment se cuit d'une façon, ou se mange tel quel — et
les deux ne sont pas la même chose que « je n'ai pas répondu ». L'application
retient : la prochaine fois, elles seront déjà remplies. »

`presentation/captures/batch-cooking/02-les-fournees.webm` — **~40 s**
: entrer dans l'étape Cuisiner, s'arrêter sur **« À cuire · 3 fournées »** et
**laisser lire** la consigne « Ces poids sont ceux de la BALANCE, avant cuisson ».
Dérouler les trois fournées.
*Ce qu'on dit* : « On ne raisonne plus en repas mais en casseroles. Ce qui part
au four ensemble, ce qui va à l'eau. Et on pèse sec : cuire n'ajoute que de
l'eau, jamais une calorie — l'eau absorbée change d'une fois sur l'autre, le
poids sec ne change jamais. »

`presentation/captures/batch-cooking/03-les-boites.webm` — **~45 s**
: **« À répartir · 8 boîtes »**, ouvrir une boîte pour plusieurs personnes,
s'arrêter sur les deux colonnes **`boîte`** et **`1 pers.`**, puis sur le bloc
**« à ajouter au moment de manger »** et les compléments.
*Ce qu'on dit* : « La colonne « boîte », c'est ce qu'on y met pour tout le monde.
La colonne dorée, c'est ce que je me sers le jour venu pour tenir mes macros.
Une boîte pour trois contient trois portions, mais ses macros ne valent que pour
une. Et ce qui ne se range pas cinq jours à l'avance — le skyr, les fruits — est
listé à part. »

`presentation/captures/batch-cooking/04-courses-et-enregistrement.webm` — **~40 s**
: déplier **« Liste de courses »** sur un plan qui manque de quelque chose, lire
l'aide, puis nommer le plan et **« Enregistrer »**. Montrer le retour à l'étape 1
avec **« Mes plans enregistrés  ·  1 en attente de cuisson »**.
*Ce qu'on dit* : « Ce qu'il manque, on l'achète. Et ce n'est pas la liste de ce
qui a manqué au calcul — le solveur contourne une pénurie au lieu de la subir,
donc il aurait répondu « rien ». C'est la période résolue une seconde fois, frigo
plein, moins ce que j'ai déjà. Le plan est ensuite figé : un instantané, pas une
recette à rejouer. »

## Limites connues

- **Un plan enregistré ne se modifie pas**, volontairement : un instantané ne se
  modifie pas, on en refait un (`features.md`, section D). Rien n'est recalculé à
  la relecture (`planRelu.tsx:71-79`).
- **Les fournées ne disent pas le temps de cuisson ni l'ordre des casseroles.**
  L'application groupe ce qui part ensemble ; elle ne conduit pas la cuisine.
- **Un libellé décrit toute la cuisson.** « Four 180 °C » est un libellé, pas un
  mode plus une température : une colonne `degres` écrirait deux fois le même
  fait (`ModeCuisson.php:38-42`).
- **La liste des façons de cuire est fermée**, et c'est délibérément plus rigide
  qu'un champ libre : une liste ouverte finirait avec « four », « Four »,
  « au four » et « four 180 » — quatre fournées là où il en faut une
  (`ModeCuisson.php:44`). Un utilisateur qui veut « plancha » la demande.
- **La cuisson n'est pas une propriété de l'aliment** : les mêmes pommes de terre
  passent au four un soir et à la vapeur le lendemain. Changer une cuisson dans
  un repas ne touche jamais la fiche de l'aliment (`repas.tsx:595-599`).
- **Les habitudes sont indexées par NOM, pas par identifiant** — c'est le seul
  point commun entre le frigo de la base et celui de Grocy
  (`CuissonHabituelle.php:51-64`). Renommer un aliment perd donc son habitude,
  et l'écran repose la question. C'est assumé : une question de trop coûte un
  geste, une réponse fausse coûte un repas.
- **Le batch cooking ne réserve rien par lui-même** : c'est l'**enregistrement**
  du plan qui met les ingrédients de côté, et **« J'ai cuisiné »** qui décrémente
  le frigo (`planRelu.tsx:204-222`). Ces deux gestes appartiennent à la
  fonctionnalité des plans enregistrés, pas à celle-ci.
- **Aucun test de rendu ne couvre ces écrans** : le projet n'embarque ni
  `@testing-library` ni `react-test-renderer`. Les modules purs sont éprouvés,
  le **câblage ne l'est qu'à l'écran** — c'est ce que cette fiche fait.
- **`presentation/features.md` (14 septembre 2026) cite cette fonctionnalité en
  `cuisson.ts:134`, `:233`, `:581`, `composer.ts:800`, `:821`, `repas.tsx:1396`,
  `:1479` : ces lignes n'existent plus.** Le découpage du 15 septembre a réduit
  `cuisson.ts` à 22 lignes de ré-exportation et sorti les écrans dans
  `src/composants/`. Les `fichier:ligne` de cette fiche ont été relus le
  16 septembre 2026.
