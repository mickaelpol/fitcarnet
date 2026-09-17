---
name: fonctionnalite-plans-repas
description: Garder un plan de batch cooking et décrémenter le frigo — enregistrer sous un nom libre, la liste et ses badges, l'état en toutes lettres, l'instantané qu'on ne modifie ni ne recalcule, la suppression, et « J'ai cuisiné » qui déduit en poids pesé avant cuisson, refuse le double appui et nomme ce qu'il n'a pas pu retirer. À charger avec `epreuve-fonctionnalite` pour éprouver et filmer les plans enregistrés (bobines 4.11 et 5).
---

# Les plans enregistrés, et « J'ai cuisiné »

## Le besoin

On cuisine le dimanche pour la semaine. Le jeudi midi, devant sa boîte, il faut
savoir **combien s'en servir**. Sans conservation, il faudrait recomposer tout
le plan ce jeudi-là — avec un frigo qui a changé, donc des quantités
différentes — pour relire un chiffre décidé le dimanche
(`api/src/Entity/PlanRepas.php:18-34`).

D'où un **instantané, pas une recette à rejouer**. On ne veut pas savoir ce
qu'on cuisinerait aujourd'hui ; on veut savoir ce qu'on a cuisiné dimanche.

Et il y a le second besoin, celui qui a fait naître « J'ai cuisiné » : **deux
batch cooking d'affilée comptaient deux fois le même frigo**. On compose
lundi-mercredi, on enregistre ; on compose jeudi-samedi, et le solveur repartait
du stock d'avant. Le premier plan avait beau vider les 800 g de poulet, le
second annonçait « objectifs atteints » sur du poulet qui n'existait plus —
chaque plan juste tout seul, faux ensemble, et **rien ne le disait**
(`api/src/Controller/PlansController.php:22-30`).

Un plan a donc deux états, et ils ont chacun un rôle :

- **PRÉVU** (`cuisine_le` NULL) — la nourriture est encore dans le frigo, mais
  elle est **promise** : l'écran la retire du stock disponible sans rien écrire.
  Supprimer le plan la rend.
- **CUISINÉ** — la nourriture a quitté le frigo, et le stock a été décrémenté
  **au moment de l'appui**. Le plan ne réserve plus rien.

La composition elle-même est couverte par `fonctionnalite-calculateur-repas` ;
cette fiche prend le relais **à partir du bouton « Enregistrer »**.

## Ce que l'application propose

| Capacité | Où | `fichier:ligne` |
|---|---|---|
| **Enregistrer un plan sous un nom libre** — champ « Enregistrer ce plan sous », placeholder « Semaine du 11/08 » | étape 3, pied | `front/src/composants/etapeBatch.tsx:220-225` |
| Bouton **« Enregistrer »** / **« Enregistrement… »**, éteint tant que le nom est vide | étape 3, pied | `front/src/composants/etapeBatch.tsx:226-240` |
| **Figer le plan** — courses, fournées, boîtes, et ce qu'il prend au frigo | au clic | `front/src/calcul/planFige.ts:98` (`figerLePlan`), appelé `etapeBatch.tsx:233` |
| **Après enregistrement, tout repart de zéro et la liste s'ouvre**, comme preuve | retour étape 1 | `front/app/(onglets)/repas.tsx:341-348` |
| **Liste « Mes plans enregistrés »**, dépliable, en tête de l'étape 1 | étape 1 | `front/src/composants/etapeReglage.tsx:166-198` |
| **Résumé replié** — « 3 plans · 2 en attente de cuisson » / « tous cuisinés » / « · 1 sans mise de côté » | étape 1 | `front/src/composants/etapeReglage.tsx:178-194` |
| **Badge par plan** — « **· à cuisiner** » (vif) ou « **· ne réserve rien** » (rouge) | étape 1 | `front/src/composants/etapeReglage.tsx:225-235` |
| Sous-titre « **N boîtes · M fournées · touche pour ouvrir** » | étape 1 | `front/src/composants/etapeReglage.tsx:237-244` |
| **Supprimer** par une croix, jamais le mot — avec confirmation | étape 1 | `front/src/composants/etapeReglage.tsx:248-259`, `:554-563` |
| **Un plan relu n'est jamais recalculé** — « Ce plan est figé tel qu'il a été enregistré. » | plan relu | `front/src/composants/planRelu.tsx:71-79` |
| **État en toutes lettres** — « Prévu. Les ingrédients de ce plan sont mis de côté… » / « Cuisiné le mercredi 13/08 · ton frigo a été décrémenté à ce moment-là. » | plan relu | `front/src/composants/planRelu.tsx:86-106` |
| **Date illisible : rien, plutôt qu'« Invalid Date »** | plan relu | `front/src/composants/planRelu.tsx:25-33` |
| **Aucune modification possible** — pas de `Patch` sur la ressource | API | `api/src/Entity/PlanRepas.php:40-41`, `:50-56` |
| **`cuisineLe` en lecture seule pour l'API** — elle se pose par la route dédiée | API | `api/src/Entity/PlanRepas.php:100-108`, `:147-163` |
| **« J'ai cuisiné — retirer du frigo »** / « Déduction en cours… » | plan relu, pied | `front/src/composants/planRelu.tsx:206-218` |
| **Marquer le plan AVANT de toucher au stock** | API | `api/src/Controller/PlansController.php:129-151` |
| **Refus du double appui** — 409 | API | `api/src/Controller/PlansController.php:90-94` |
| **Refus de deviner pour un plan d'ancienne version** — 422 | API | `api/src/Controller/PlansController.php:96-106` |
| **Déduction en poids pesé, avant cuisson** (`aCuire`, jamais `assiette`) | calcul | `front/src/calcul/planFige.ts:147-181` |
| **Le frigo compte en UNITÉS, le plan en GRAMMES** | API | `api/src/Service/DeductionDuPlan.php:20-23`, `:89-92` |
| **Plancher à zéro, et refus d'inventer** — « plus dans ton frigo », « poids par unité inconnu » | API | `api/src/Service/DeductionDuPlan.php:80-90` |
| **Aucun rollback global** — neuf déductions réussies ne sont pas annulées par la dixième | API | `api/src/Controller/PlansController.php:175-212` |
| **« À retirer toi-même du frigo »**, avec le **motif ligne par ligne** | plan relu | `front/src/composants/planRelu.tsx:109-119` |
| **Seuls les plans prévus réservent du stock** | calcul | `front/src/calcul/planFige.ts:201-228` (`estCuisine`, `dejaPromis`) |

## Le parcours

**Compte requis** : ordinaire. **Données de départ** : un frigo garni
(`jeu-essai.sql`) **et un plan composé dans l'application** — voir le piège
majeur en *Comment l'éprouver* : les plans de `jeu-demo.sql` ne conviennent pas.

### Enregistrer

1. Composer un plan, puis **« Passer au batch cooking »** (étape 3).
2. En pied d'écran, champ **« Enregistrer ce plan sous »**, placeholder
   « Semaine du 11/08 » (`etapeBatch.tsx:220-225`). Le nom est libre.
3. **« Enregistrer »** (`etapeBatch.tsx:239`). Le bouton est éteint tant que le
   nom est vide après `trim()` (`:237`).
4. L'écran repart à l'étape 1 **et ouvre la liste des plans**
   (`repas.tsx:341-348`) : « sans ça, le plan semble s'évaporer ».

### Relire

5. Étape 1, en tête : **« Mes plans enregistrés »**, replié, avec son résumé
   (`etapeReglage.tsx:170-194`).
6. Déplier : chaque plan porte son nom, son **badge** et son sous-titre.
7. Toucher un plan → l'écran du plan relu. En tête, l'avertissement « **Ce plan
   est figé tel qu'il a été enregistré. Les quantités ne se recalculent pas :
   c'est ce que tu as cuisiné, pas ce que ton frigo permettrait aujourd'hui.** »
   (`planRelu.tsx:76-78`), puis **l'état**.
8. Le corps : **Liste de courses** (dépliable), **À cuire · N fournées**,
   **À servir · M boîtes** avec l'en-tête **aliment / boîte / 1 pers.**
   (`tablesPlan.tsx:59-67`) et l'aide « La colonne dorée est ce que TU te sers
   pour tenir tes macros. » (`planRelu.tsx:155-157`).

### J'ai cuisiné

9. **Avant** : noter la quantité de deux ou trois aliments du plan dans l'onglet
   Frigo.
10. Sur un plan **prévu**, le pied porte **« J'ai cuisiné — retirer du frigo »**
    (`planRelu.tsx:217`) et l'aide « Les quantités de ce plan seront retirées de
    ton stock, **en poids pesé**. À faire une fois les casseroles vidées. »
    (`planRelu.tsx:219-222`).
11. Appuyer : le libellé passe à **« Déduction en cours… »** (`:216`).
12. L'état bascule sur « **Cuisiné le … · ton frigo a été décrémenté à ce
    moment-là.** » et **le bouton disparaît** (`planRelu.tsx:204`).
13. Si des lignes ont résisté : encart **« À retirer toi-même du frigo »**, une
    puce par ligne, « • <nom> — <motif> » (`planRelu.tsx:114-117`).
14. **Après** : retourner au frigo, les quantités ont baissé.

### Supprimer

15. Étape 1, liste dépliée, la **croix** rouge à droite
    (`etapeReglage.tsx:253-259`) → confirmation **« Supprimer « X » ? »**,
    message « **Ce plan et sa liste de courses seront perdus. Les repas déjà
    cuisinés, eux, sont dans ton frigo.** » (`etapeReglage.tsx:556-557`).

## Critères d'acceptation

1. **Le nom est libre et obligatoire.** Bouton éteint sur un nom vide ou
   d'espaces (`etapeBatch.tsx:237`). Côté API, `libelle` est `NotBlank`, 80
   caractères au plus, et `trim()` à l'écriture
   (`api/src/Entity/PlanRepas.php:76-80`, `:141`).

2. **Un plan est un instantané : des noms et des grammes, pas des
   identifiants** — sauf `consomme`, seule partie qui en porte, parce qu'elle
   sert à **désigner une ligne du frigo** (`front/src/calcul/planFige.ts:62-78`).
   Vérifiable en base : `contenu -> 'boites'` ne contient aucun `id` d'aliment.

3. **La date de chaque boîte est résolue AU MOMENT où l'on fige**, pas à la
   lecture : « dans trois jours, le rang 2 ne désignera plus le même jour »
   (`planFige.ts:90-97`, `:126`). Le titre enregistré est déjà « jeudi 14/08 ·
   16 h ».

4. **Aucune modification possible, et c'est structurel.** La ressource n'expose
   que `GetCollection`, `Get`, `Post`, `Delete` — **pas de `Patch`**
   (`api/src/Entity/PlanRepas.php:50-56`). **Refus attendu** : un `PATCH
   /api/plan_repas/{id}` doit répondre **405**.

5. **`cuisineLe` ne se pose pas par l'API.** Elle est en groupe `plan:lire`
   seulement (`PlanRepas.php:106-108`) et il n'existe **pas de
   `setCuisineLe()`** : `marquerCuisine()` pose `now()` et rend la date
   (`:147-163`). Un setter ouvert laisserait **antidater une déduction de stock
   qui vient d'avoir lieu**.

6. **Rien n'est recalculé à la relecture.** Modifier une cible ou vider le frigo,
   puis rouvrir le plan : **les mêmes chiffres**. `PlanRelu` ne lit que
   `plan.contenu` (`planRelu.tsx:64`) et n'appelle aucun solveur.

7. **L'état est dit en toutes lettres, et il a TROIS formes** — le troisième est
   celui qui a coûté 800 g de brocoli pour 500 en stock :
   - prévu **avec** `consomme` ⇒ « Prévu. Les ingrédients de ce plan sont mis de
     côté : tes prochains calculs ne comptent plus dessus. » (`planRelu.tsx:89-90`) ;
   - prévu **sans** `consomme` (version 1) ⇒ « Enregistré avant la mise de côté
     des ingrédients : ce plan ne réserve rien… » (`:96-99`) ;
   - cuisiné ⇒ « Cuisiné le <date> · ton frigo a été décrémenté à ce
     moment-là. » (`:102-105`).

8. **Les badges de la liste suivent la même règle** : « · à cuisiner » quand
   `consomme` est non vide, « · ne réserve rien » sinon, **et rien du tout** sur
   un plan cuisiné (`etapeReglage.tsx:225-235`).

9. **Date illisible ⇒ rien.** `dateCourte` rend `''` sur une date invalide, et la
   phrase reste juste sans elle (`planRelu.tsx:25-33`). **Refus attendu** :
   jamais « Cuisiné le Invalid Date » à l'écran.

10. **Seuls les plans PRÉVUS réservent.** `dejaPromis` saute les plans cuisinés
    (`planFige.ts:220-221`) ; `estCuisine` teste `!= null` **et** `!== ''`,
    attrapant `null` ET `undefined` — « le défaut va vers PRÉVU, et c'est le bon
    sens du risque » (`planFige.ts:201-213`).

11. **Supprimer un plan prévu REND son stock.** La mutation invalide `plans`
    **et** `mon-frigo` (`front/src/api/hooks/plans.ts:51-57`) : sans quoi le
    frigo resterait amputé à l'écran d'une réservation qui n'existe plus.

12. **« J'ai cuisiné » déduit en poids PESÉ, avant cuisson.** `consommationDuPlan`
    somme `q.aCuire`, **jamais** `q.assiette` (`planFige.ts:162-181`) : « l'eau
    que la cuisson ajoute n'a jamais été dans le bac ; prendre l'assiette ferait
    déduire trois fois trop de riz ». Observable : un riz à ratio 2,3 servi 230 g
    dans la boîte doit faire baisser le stock de **100 g**, pas de 230.

13. **Les quantités s'additionnent sur toute la période** : un aliment servi à
    quatre repas donne **une seule ligne** et son total (`planFige.ts:165-176`).
    Éprouvé par `api/tests/Service/DeductionDuPlanTest.php:143`.

14. **Le plan est marqué AVANT que le stock bouge**, et l'ordre est le critère
    (`PlansController.php:150-151`). Entre deux pannes possibles on prend celle
    qui se voit : marquage d'abord laisse un plan cuisiné sur un frigo intact —
    on surestime son stock, on le voit en ouvrant le frigo. L'ordre inverse
    laisserait un stock baissé pour un plan qui **réserve encore**, donc **déduit
    deux fois, en silence**.

15. **Refus du double appui : 409.** « Ce plan est déjà marqué cuisiné. »
    (`PlansController.php:90-94`). Un second appui ne doit **pas** redéduire.

16. **Refus de deviner : 422.** Un plan sans `consomme` (ou vide) ⇒ « Ce plan a
    été enregistré avant cette fonctionnalité : il ne sait pas ce qu'il prend au
    frigo. Refais-en un pour que la déduction fonctionne. »
    (`PlansController.php:96-106`). **Une déduction devinée sur les noms viderait
    le mauvais bac.**

17. **Le frigo compte en UNITÉS.** Un pot de skyr n'est pas « 400 g », c'est
    « 1 » avec 400 g par unité : retirer 200 g pose le stock à **0,5**, pas à 200
    (`DeductionDuPlan.php:89-92`, test `DeductionDuPlanTest.php:33`).

18. **Le stock ne descend jamais sous zéro** — `max(0.0, …)`
    (`DeductionDuPlan.php:90`, test `:46`). Un frigo négatif serait lu par le
    solveur « comme une dette à rembourser sur les repas suivants ».

19. **Ce qu'on ne sait pas calculer est RENDU, pas inventé** — deux motifs
    exacts : « **plus dans ton frigo** » (`DeductionDuPlan.php:81`) et « **poids
    par unité inconnu** » (`:85`). Tests `:59` et `:73`.
    **Une ligne à 0 g n'écrit rien** (`:74-76`, test `:88`) : réécrire poserait
    le stock à sa valeur actuelle, ce qui sur Grocy est une opération
    d'inventaire datée.

20. **Aucun rollback global.** Une ligne qui échoue ne défait pas les autres ; le
    plan **reste cuisiné**, car il l'est — « annuler neuf déductions réussies
    parce que la dixième échoue ne rendrait service à personne »
    (`PlansController.php:175-212`). Test `DeductionDuPlanTest.php:102`.

21. **L'échec est nommé, le détail technique va au journal** — le client reçoit
    « Le stock n'a pas pu être déduit. » et non un message DBAL qui dessinerait
    la carte interne de la base (constat M-03, `PlansController.php:199-210`).

22. **La réponse porte les trois chiffres** : `cuisineLe`, `deduits` (= lignes
    moins échecs) et `ignores` (`PlansController.php:220-224`).

23. **Isolation entre comptes.** Un plan n'est lisible, supprimable et
    « cuisinable » que par son propriétaire :
    - `PlanRepas implements ProprieteUtilisateur` ⇒ `FiltreProprietaire` pose le
      `WHERE` sur la collection (`api/src/Entity/PlanRepas.php:63`) ;
    - `Get` et `Delete` sont gardés par `object.getUtilisateur() == user`
      (`:53`, `:55`) ;
    - la route `cuisine` vérifie **elle-même** la propriété et répond **404**, pas
      403 — elle ne révèle pas l'existence du plan
      (`PlansController.php:87-89`).
    **Et la déduction ne peut pas écrire chez autrui** : elle passe par
    `FrigoBase::definirStock` (`PlansController.php:197`), dont la garde
    « le mien » est le point de passage obligé fermé après la faille É1
    (`api/src/Service/FrigoBase.php:109-126`) ; la base refuse d'ailleurs
    elle-même une telle ligne (clé composite
    `stock_aliment_du_meme_compte_fkey`, migration 35). Un `consomme` trafiqué
    visant l'aliment d'un autre fait **échouer cette ligne**, qui ressort dans
    `ignores` — jamais une écriture.

24. **Zéro erreur JavaScript**, et aucune requête en échec non voulue.

## Comment l'éprouver

### Le piège majeur : les plans de `jeu-demo.sql` ne conviennent pas

**Les deux plans posés par `db/manuel/jeu-demo.sql` portent
`'consomme', jsonb_build_array()` — un tableau VIDE.** Conséquences, toutes
vérifiées dans le code :

- le second plan (« Repas de ce soir », `cuisine_le` NULL) affiche le badge
  « **· ne réserve rien** » en rouge, pas « · à cuisiner »
  (`etapeReglage.tsx:231-233`) ;
- appuyer sur « J'ai cuisiné » y renvoie **422**, pas une déduction
  (`PlansController.php:96-106`) ;
- le premier (« Batch cooking du dimanche ») est **déjà cuisiné**, donc
  **n'affiche aucun bouton** (`planRelu.tsx:204`).

**Pour éprouver ou filmer « J'ai cuisiné », il faut un plan composé et
enregistré DANS l'application**, qui seul porte un `consomme` renseigné
(`etapeBatch.tsx:229-233`). Les plans de démonstration servent à montrer la
**liste**, les **états** et la **relecture** — pas la déduction.

### Préparer

```bash
docker ps --format '{{.Names}}\t{{.Status}}'
curl -s http://localhost:8080/api/etat
"$(git rev-parse --show-toplevel)"/db/manuel/rattraper-dev.sh
```

```bash
DEPOT="$(git rev-parse --show-toplevel)"   # la racine du dépôt : son chemin change d'un poste à l'autre
COMPTE=plan-verif@test.local
set -o pipefail   # sans lui, un fichier introuvable donne à psql une entrée vide, et psql sort 0
sed "s/essai@fitcarnet.local/$COMPTE/" "$DEPOT/db/manuel/jeu-essai.sql" \
  | docker exec -i fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -v ON_ERROR_STOP=1
sed "s/demo@fitcarnet.local/$COMPTE/" "$DEPOT/db/manuel/jeu-demo.sql" \
  | docker exec -i fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -v ON_ERROR_STOP=1
```

**Relis les deux adresses avant Entrée** : `jeu-demo.sql` **EFFACE avant de
poser** (`DELETE FROM plan_repas WHERE utilisateur_id = v_utilisateur`). Son
garde-fou refuse un compte qui a déjà des séances — **lire le message** plutôt
que de relancer avec `-v ecraser=oui`.

Des **cibles** sont nécessaires pour composer : `jeu-demo.sql` les pose.

### Relever l'état AVANT (règle « relever la valeur avant de l'écraser »)

```bash
docker exec -i fitcarnet-db-dev psql -U fitcarnet -d fitcarnet <<'SQL'
SELECT a.nom, s.quantite
  FROM stock s JOIN aliment a ON a.id = s.aliment_id
  JOIN utilisateur u ON u.id = s.utilisateur_id
 WHERE u.email = 'plan-verif@test.local' ORDER BY a.nom;
SQL
```

### Lire les plans en base

```sql
SELECT p.id, p.libelle, p.cree_le, p.cuisine_le,
       jsonb_array_length(p.contenu -> 'boites')    AS boites,
       jsonb_array_length(p.contenu -> 'fournees')  AS fournees,
       jsonb_array_length(coalesce(p.contenu -> 'consomme', '[]'::jsonb)) AS lignes_consommees,
       p.contenu ->> 'version'                      AS version
  FROM plan_repas p JOIN utilisateur u ON u.id = p.utilisateur_id
 WHERE u.email = 'plan-verif@test.local' ORDER BY p.id DESC;
```

Le détail de ce qui sera décrémenté — **c'est lui qui porte les grammes pesés** :

```sql
SELECT jsonb_pretty(contenu -> 'consomme') FROM plan_repas ORDER BY id DESC LIMIT 1;
```

### Éprouver « J'ai cuisiné » par l'API

```bash
JETON=$(curl -s -X POST http://localhost:8080/api/connexion \
  -H 'Content-Type: application/json' \
  -d '{"email":"plan-verif@test.local","motDePasse":"MotDePasseTest123!"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

curl -s -w '\n%{http_code}\n' -X POST \
  http://localhost:8080/api/plan_repas/<id>/cuisine \
  -H "Authorization: Bearer $JETON" -H 'Content-Type: application/json' -d '{}'
```

- premier appel : **200**, avec `{"cuisineLe":…,"deduits":N,"ignores":[…]}` ;
- **second appel : 409** (critère 15) ;
- sur un plan à `consomme` vide : **422** (critère 16) ;
- sur le plan d'un autre compte : **404** (critère 23).

**Le critère 12 (poids pesé) se prouve par soustraction** : comparer le stock
relevé avant à `contenu -> 'consomme'` ligne à ligne. Pour un aliment tenu au
gramme, `quantite_avant - grammes = quantite_apres`. **Si l'écart vaut
`grammes × ratio`, la déduction prend l'assiette et c'est le défaut.**

**Le refus de modification (critère 4)** :

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH \
  http://localhost:8080/api/plan_repas/<id> \
  -H "Authorization: Bearer $JETON" \
  -H 'Content-Type: application/merge-patch+json' -d '{"libelle":"triche"}'
# attendu : 405
```

### Sans base ni noyau

Tout le calcul de déduction s'éprouve seul, et c'est voulu — « il fallait pouvoir
l'éprouver sans base, sans noyau et sans Grocy »
(`api/src/Service/DeductionDuPlan.php:10-16`) :

```bash
docker exec fitcarnet-app-dev sh -c \
  'cd /app && bin/phpunit tests/Service/DeductionDuPlanTest.php'
```

Douze cas, dont les unités, le plancher à zéro, les deux motifs d'`ignores`, la
ligne à 0 g et le cumul (`DeductionDuPlanTest.php:20` à `:143`).

Côté front, `figerLePlan`, `estCuisine` et `dejaPromis` :

```bash
npm --prefix "$(git rev-parse --show-toplevel)"/front test
```

### Pièges propres à cette fonctionnalité

- **Un plan relu se teste AVANT l'écran de réglage.** Le test était placé après
  `if (plan === null)` : toucher un plan le posait dans l'état, puis l'écran
  rendait le réglage — « le clic marchait, l'écran ne changeait jamais »
  (`front/app/(onglets)/repas.tsx:262-282`). Si un plan ne s'ouvre pas, c'est
  cette régression-là.
- **La croix et le chevron sont voisins.** La croix fait `TOUCHE` de large avec
  sa marge, exprès : « viser "ouvrir" supprimait le plan »
  (`etapeReglage.tsx:248-252`). À vérifier au doigt sur Android.
- **`consomme` absent ≠ `consomme` vide côté affichage** : les deux donnent
  « ne réserve rien » (`?? []` à `etapeReglage.tsx:231`), mais seul le premier
  est un vrai plan version 1.
- **Le message d'échec d'enregistrement ne survit plus à un aller-retour** vers
  l'écran de correction — conséquence assumée de l'extraction
  (`etapeBatch.tsx:28-32`). Ne pas le rapporter comme un bug.
- **`nomDuPlan` vit chez le parent** pour survivre à un retour en arrière
  (`repas.tsx:122`, `etapeBatch.tsx:32-33`).

### Nettoyer

`plan_repas` part en **CASCADE** avec le compte (`db/01-schema.sql:502`). Mais
**`plan_repas.contenu` est du JSON que nulle clé étrangère ne protège** : un
aliment supprimé qui y figure laisse le plan incohérent **sans la moindre erreur
SQL** (`donnees-de-test`). Vérifier qu'aucun plan ne cite un aliment avant de le
supprimer.

Ordre : plans (ou compte, qui les emporte), puis stock, puis aliments, puis
compte. Puis recompter et comparer aux chiffres d'avant.

```sql
SELECT count(*) FROM plan_repas p
  LEFT JOIN utilisateur u ON u.id = p.utilisateur_id WHERE u.id IS NULL;  -- 0
```

## La capture pour la démonstration

Reprend **la bobine 4.11** (enregistrer) et **la bobine 5**, plans 5.1 à 5.3 et
5.7, de `presentation/demonstration.md`. Dossier :
`presentation/captures/plans-repas/`.

> **État de départ** : un plan **composé dans l'application** et enregistré, non
> cuisiné — pas un plan de `jeu-demo.sql` (voir le piège majeur).

| Fichier | Déroulé | Durée | Ce qu'on doit voir |
|---|---|---|---|
| `01-enregistrer.webm` | étape 3, taper un nom dans **« Enregistrer ce plan sous »**, **Enregistrer** | 25 s | le retour à l'étape 1 **avec la liste des plans ouverte** — « 1 plan · 1 en attente de cuisson » |
| `02-la-liste-et-les-etats.webm` | déplier **Mes plans enregistrés**, montrer les badges | 25 s | « **· à cuisiner** » sur le plan composé, « **· ne réserve rien** » sur un plan de démonstration — **les deux côte à côte, c'est ce qui rend la règle lisible** |
| `03-un-instantane.webm` | ouvrir le plan, lire l'avertissement, faire défiler courses / fournées / boîtes | 40 s | « **Ce plan est figé tel qu'il a été enregistré. Les quantités ne se recalculent pas…** », l'état « Prévu. Les ingrédients de ce plan sont mis de côté… », l'en-tête **aliment / boîte / 1 pers.** |
| `04-avant.webm` | onglet Frigo, montrer la quantité de deux ou trois aliments du plan | 15 s | *« Retenez ces quantités. »* — les chiffres doivent être **lisibles à l'image** |
| `05-j-ai-cuisine.webm` | rouvrir le plan, **« J'ai cuisiné — retirer du frigo »** | 30 s | **le moment fort** : « Déduction en cours… », puis l'état qui bascule sur « **Cuisiné le … · ton frigo a été décrémenté à ce moment-là.** » et **le bouton qui disparaît** |
| `06-apres.webm` | retour au frigo | 20 s | les mêmes lignes qu'en `04`, **baissées** — et baissées du poids **pesé**, pas du poids servi |
| `07-a-retirer-soi-meme.webm` | sur un plan dont une ligne est inapplicable | 20 s | l'encart « **À retirer toi-même du frigo** » et le motif ligne par ligne — « • X — plus dans ton frigo » |
| `08-supprimer.webm` | la croix rouge → la confirmation → **Supprimer** | 15 s | « Supprimer « X » ? · **Ce plan et sa liste de courses seront perdus. Les repas déjà cuisinés, eux, sont dans ton frigo.** » |

Pour `07`, provoquer le cas **sur une donnée créée par l'épreuve** : supprimer du
frigo un aliment du plan avant d'appuyer. Jamais sur une donnée réelle.

**`04` et `06` se filment en une seule prise de pensée** : ce sont les deux
moitiés de la même preuve, et la démonstration ne vaut que si les mêmes lignes
sont à l'image des deux côtés.

## Limites connues

- **La branche Grocy n'est pas éprouvable sans instance configurée.** « J'ai
  cuisiné » y suit un autre chemin — `DeductionGrocy::appliquer`, une ligne à la
  fois, avec un repli qui rend « tout le plan » en `ignores` si l'appel entier
  échoue (`PlansController.php:155-173`).
- **Aucune modification d'un plan, volontairement.** Une correction se fait en
  **refaisant un plan** et en supprimant l'ancien
  (`front/src/api/hooks/plans.ts:48-50`). Ne pas rapporter l'absence de `Patch`
  comme un manque.
- **Les compléments alimentaires ne sont PAS figés dans le plan** : ce sont des
  consignes courantes, relues à chaque affichage — changer sa routine met à jour
  les plans déjà faits (`planRelu.tsx:179-191`). Les boîtes des plans version 1
  et 2 n'ont pas de champ `repas` et **n'affichent donc aucun complément**,
  plutôt que d'en deviner un.
- **Un plan version 1 ne réserve rien, et c'est irréparable** : inventer une
  consommation à partir de ses noms d'aliments serait deviner
  (`planFige.ts:196-199`). La seule sortie est d'en refaire un.
- **`presentation/features.md` (« Les plans enregistrés » et « J'ai cuisiné »)
  est périmé sur ses `fichier:ligne` front.** Il cite `repas.tsx:709`, `:732`,
  `:694`, `:1002`, `:1510`, `:601`, `:573` — or ces écrans ont été extraits le
  15 septembre 2026 vers `planRelu.tsx`, `etapeReglage.tsx` et `etapeBatch.tsx`.
  Ses références **API** (`PlansController.php:79`, `:88`, `:94`, `:148`,
  `:193`) restent justes à quelques lignes près. Ne pas recopier les numéros
  front.
- **`features.md` cite `DeductionDuPlan.php:346`** pour le plancher et les motifs :
  le fichier fait **112 lignes**. Les vraies références sont `:80-90`.
- **Le commentaire de `db/manuel/jeu-demo.sql` se contredit** : il annonce « Le
  premier est déjà cuisiné (`cuisine_le` renseigné) : c'est lui qui montre le
  bouton "J'ai cuisiné" dans son état d'après » — or un plan cuisiné **n'affiche
  aucun bouton** (`planRelu.tsx:204`). Et les deux plans ont un `consomme` vide,
  donc **aucun des deux** ne peut démontrer la déduction.
