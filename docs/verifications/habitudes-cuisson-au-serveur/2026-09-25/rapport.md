# Vérification finale — `habitudes-cuisson-au-serveur` (B4)

**Date :** 25 septembre 2026, 19 h 42 – 19 h 54 (Europe/Paris)
**Cible :** http://localhost:8080, application réelle en cours d'exécution
**Branche :** `serveur-autoritaire` (dernier commit `62c69dc`)
**Méthode :** aucun test unitaire rejoué. Vrai navigateur (Chromium/Playwright),
vraie API, vraie base de développement.

> **Aucune donnée existante n'a été modifiée.** Tout ce qui a été écrit l'a été
> sur trois comptes jetables en `@e2e.local`, créés puis supprimés. Aucun
> `UPDATE`, `PATCH` ni `DELETE` sur une donnée que je n'avais pas créée.

## Verdict

| Point | Sujet | Verdict |
|---|---|---|
| **A** | Non-régression visible de l'onglet Repas | **OK** — et plus que demandé : le parcours complet Jours → Repas → Cuisiner a pu être joué au navigateur |
| **B** | Preuve en base : rejeu sans écriture, un changement = une ligne | **OK** |
| **C** | Volume réel (plan de 7 jours, 280 lignes) | **OK** — 30 lignes écrites, 57 ms ; rejeu 0 écriture, `maj_le` intacts |
| **D** | Les deux bornes | **OK sur le comportement, PROBLÈME DOCUMENTAIRE** — la borne brute vaut **10 000** dans le code, pas 2 000 ; cinq endroits de la documentation disent encore 2 000 |

Rien à corriger dans le code. Un écart documentaire est signalé en fin de rapport.

## Environnement relevé avant de commencer

```
$ docker ps --format '{{.Names}}\t{{.Status}}'
fitcarnet-app-dev	Up 2 hours (healthy)
fitcarnet-db-dev	Up 2 hours (healthy)

$ curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api
401                      (route protégée : le serveur répond)

$ curl -s http://localhost:8080/ | grep -o 'entry-[a-f0-9]*\.js'
entry-d0f7640f09821be22791d9f8d55d52cb.js
$ ls front/dist/_expo/static/js/web/
entry-d0f7640f09821be22791d9f8d55d52cb.js      (le bundle servi est celui du dépôt)
```

### Compteurs de départ

```sql
SELECT 'utilisateurs', count(*) FROM utilisateur
UNION ALL SELECT 'utilisateurs @e2e.local', count(*) FROM utilisateur WHERE email LIKE '%@e2e.local'
UNION ALL SELECT 'aliment', count(*) FROM aliment
UNION ALL SELECT 'exercice', count(*) FROM exercice
UNION ALL SELECT 'cuisson_habituelle', count(*) FROM cuisson_habituelle
UNION ALL SELECT 'stock', count(*) FROM stock
UNION ALL SELECT 'inventaire_lot', count(*) FROM inventaire_lot
UNION ALL SELECT 'plan_repas', count(*) FROM plan_repas;
```

```
           quoi           | count
--------------------------+-------
 utilisateurs             |     2
 utilisateurs @e2e.local  |     0
 utilisateurs @test.local |     0
 aliment                  |     8
 exercice                 |  1338
 cuisson_habituelle       |     0
 stock                    |     8
 inventaire_lot           |     0
 plan_repas               |     2
 mode_cuisson             |     8
```

Sauvegarde locale prise avant toute écriture :

```
$ ./sauvegarde.sh
Sauvegarde complète en cours…
→ sauvegardes/fitcarnet_2026-09-25_194203.dump (284K)
```

### Comptes jetables créés

| Compte | Usage |
|---|---|
| `verifb4-1790358149@e2e.local` (`dba4cabe-9e26-4b63-9bd8-5283ef01e1d1`) | points A et B |
| `verifvol-1790358225@e2e.local` (`89cc5324-812e-49dd-a507-ec114550518f`) | point C |
| `verifborne-1790358296@e2e.local` (`20953e1b-f9b0-41f5-bb13-25380177bbb6`) | point D |

---

## A — La non-régression visible

### A.1 L'onglet Repas se charge

Connexion par le formulaire (`/connexion`), puis clic sur l'onglet **Repas**.
Texte réellement lu à l'écran :

```
Repas
1  Jours     2  Repas     3  Cuisiner
Plusieurs jours / Aujourd'hui seulement
Coche les repas à cuisiner et dis pour combien de personnes. …
› Matin  aucun objectif défini
› Midi   aucun objectif défini
› 16 h   aucun objectif défini
› Soir   aucun objectif défini
Rien d'utilisable dans ton frigo
…
Composer les repas
```

Appels API émis par l'écran au chargement :

```
POST /api/connexion
GET  /api/moi
GET  /api/seances?order[date]=desc
GET  /api/mon-frigo
GET  /api/cibles
GET  /api/plan_repas
GET  /api/mode_cuissons
GET  /api/mes-cuissons
```

Console du navigateur : **aucune erreur JavaScript**, aucun `pageerror`. Le seul
message est un avertissement `expo-notifications` connu (web), plus un `401` sur
le `POST /api/jeton/rafraichir` **avant** la connexion, ce qui est le
fonctionnement normal du pare-feu.

Les trois pastilles `Jours · Repas · Cuisiner` sont rendues, l'étape 1 est
active, les deux autres sont désactivées. Le renommage du hook
(`habitudesAEcrire` → `lignesDHabitudes`, `retenirLesCuissons`) n'a laissé
aucune trace visible.

Capture : `captures/1-etape-jours.png`

### A.2 Le parcours complet a finalement pu être joué

Le blocage documenté dans `avancementSeance.spec.ts` porte sur `ChoixDansListe`,
c'est-à-dire sur l'**ajout manuel** d'un aliment à un repas. Il ne bloque pas la
**composition automatique** : en garnissant d'abord le frigo du compte jetable et
en lui donnant des cibles — par l'API, avec mes propres données —, le bouton
« Composer les repas » suffit à atteindre l'étape 2, et le bouton du pied
« Passer au batch cooking → » à atteindre l'étape 3.

Montage (données créées par moi, sur mon compte jetable) :

```
POST /api/aliments  → 224 Riz blanc verification (350 kcal, ratio 2,26, fec)
POST /api/aliments  → 225 Poulet verification    (121 kcal, ratio 0,7, prot)
POST /api/aliments  → 226 Brocoli verification   (34 kcal, leg)
POST /api/aliments  → 227 Huile olive verification (900 kcal, huile)
POST /api/mon-frigo/stock ×4 (2 000 g, emplacement 3 « Placard »)  → {"ok":true} HTTP 200
POST /api/cibles ×4 (R1..R4 : 600 kcal / 40 P / 60 G / 20 L)       → HTTP 201
```

Étape 2 atteinte, plan réellement composé et affiché :

```
✓ Jours   2 Repas   3 Cuisiner
14 aliments dont on ne sait pas encore comment ils se cuisent. …
Les 14 autres se mangent tels quels
Matin · 1 personne   573,3 kcal  39,9 P  58,5 G  19,8 L
   Poulet verification  Protéine  149 g …
   Riz blanc verification  Glucide  75 g …
CUISSON
   Poulet verification · à choisir
   Riz blanc verification · à choisir
```

Étape 3 atteinte après « Les 14 autres se mangent tels quels » puis
« Passer au batch cooking → » :

```
✓ Jours   ✓ Repas   3 Cuisiner
À cuire · 0 fournée
Aucun aliment de ce plan ne se cuit. …
À répartir · 4 boîtes
```

Captures : `captures/2-etape-repas.png`, `captures/3-etape-cuisiner.png`.
**Aucune erreur console sur tout le parcours.**

### A.3 Ce que l'écran envoie vraiment (intercepté)

Le passage à « Cuisiner » déclenche bien **un** `PUT /api/mes-cuissons`, avec
**toutes** les lignes du plan, sans tri ni dédoublonnage côté écran — c'est le
comportement attendu de la feature :

```
PUT #1 : 14 lignes — HTTP 200 — {"enregistrees":4}
 {"habitudes":[{"aliment":"poulet verification","mode":null},
               {"aliment":"riz blanc verification","mode":null},
               {"aliment":"huile olive verification","mode":null},
               {"aliment":"brocoli verification","mode":null},
               … 14 lignes au total, une par couple (repas, aliment) …]}
```

Quatre aliments distincts pour quatorze lignes : le dédoublonnage a bien lieu
côté serveur.

---

## B — La preuve en base, requêtes et résultats bruts

### B.1 Par l'API, sur `verifb4-…@e2e.local`

**Envoi 1** — cinq habitudes :

```
$ curl -s -X PUT http://localhost:8080/api/mes-cuissons -H "Authorization: Bearer $JETON" \
       -H 'Content-Type: application/json' --data-binary @lot1.json
{"enregistrees":5}
HTTP 200 — 0.046489s
```

Corps envoyé : `riz basmati`→2, `patate douce`→4, `brocoli`→1, `skyr`→null, `poulet`→3.

**Relevé 1**

```sql
SELECT aliment, mode_cuisson_id, maj_le
  FROM cuisson_habituelle
 WHERE utilisateur_id = 'dba4cabe-9e26-4b63-9bd8-5283ef01e1d1'
 ORDER BY aliment;
```

```
   aliment    | mode_cuisson_id |            maj_le
--------------+-----------------+-------------------------------
 brocoli      |               1 | 2026-09-25 17:42:55.438042+00
 patate douce |               4 | 2026-09-25 17:42:55.438042+00
 poulet       |               3 | 2026-09-25 17:42:55.438042+00
 riz basmati  |               2 | 2026-09-25 17:42:55.438042+00
 skyr         |                 | 2026-09-25 17:42:55.438042+00
(5 rows)
```

**Envoi 2 — EXACTEMENT le même corps**

```
{"enregistrees":0}
HTTP 200 — 0.047723s
```

**Relevé 2**, avec l'horodatage en secondes d'époque pour comparer à la
microseconde près :

```sql
SELECT aliment, mode_cuisson_id, maj_le, extract(epoch from maj_le) AS epoch
  FROM cuisson_habituelle WHERE utilisateur_id = '…' ORDER BY aliment;
```

```
   aliment    | mode_cuisson_id |            maj_le             |       epoch
--------------+-----------------+-------------------------------+-------------------
 brocoli      |               1 | 2026-09-25 17:42:55.438042+00 | 1790358175.438042
 patate douce |               4 | 2026-09-25 17:42:55.438042+00 | 1790358175.438042
 poulet       |               3 | 2026-09-25 17:42:55.438042+00 | 1790358175.438042
 riz basmati  |               2 | 2026-09-25 17:42:55.438042+00 | 1790358175.438042
 skyr         |                 | 2026-09-25 17:42:55.438042+00 | 1790358175.438042
(5 rows)
```

```sql
SELECT count(*) AS lignes_touchees FROM cuisson_habituelle
 WHERE utilisateur_id = '…' AND maj_le > timestamptz '2026-09-25 17:42:55.438042+00';
```

```
 lignes_touchees
-----------------
               0
```

**Attendu / obtenu**

| Attendu | Obtenu |
|---|---|
| Réponse `{"enregistrees":0}` | `{"enregistrees":0}` |
| Aucun `maj_le` modifié, à la microseconde | 5 lignes sur 5 à `…438042`, identiques ; 0 ligne postérieure |

**Envoi 3 — une seule cuisson changée** (`riz basmati` 2 → 1) :

```
{"enregistrees":1}
HTTP 200 — 0.046535s
```

```
   aliment    | mode_cuisson_id |            maj_le             | a_bouge
--------------+-----------------+-------------------------------+---------
 brocoli      |               1 | 2026-09-25 17:42:55.438042+00 | f
 patate douce |               4 | 2026-09-25 17:42:55.438042+00 | f
 poulet       |               3 | 2026-09-25 17:42:55.438042+00 | f
 riz basmati  |               1 | 2026-09-25 17:43:17.517352+00 | t
 skyr         |                 | 2026-09-25 17:42:55.438042+00 | f
```

Une ligne écrite, une seule, et c'est la bonne.

### B.2 Le cas `NULL`, que `<>` aurait manqué

`IS DISTINCT FROM` traite `NULL` comme une valeur — c'est ce dont la règle 6 a
besoin (« se mange sans cuisson » est une réponse) :

```
skyr null → 5    : {"enregistrees":1}  HTTP 200 — 0.048631s
skyr 5 → null    : {"enregistrees":1}  HTTP 200 — 0.042420s
skyr null → null : {"enregistrees":0}  HTTP 200 — 0.042773s
```

### B.3 Le même point 2, mais par l'ÉCRAN

Trois passages successifs à « Cuisiner » depuis le navigateur, sur un plan de
quatre repas (14 lignes envoyées à chaque fois) :

```
--- base APRES passage #1 ---
         aliment          | mode_cuisson_id |            maj_le
--------------------------+-----------------+-------------------------------
 brocoli verification     |                 | 2026-09-25 17:51:38.499791+00
 huile olive verification |                 | 2026-09-25 17:51:38.499791+00
 poulet verification      |                 | 2026-09-25 17:51:38.499791+00
 riz blanc verification   |                 | 2026-09-25 17:51:38.499791+00

--- base APRES passage #2 (retour au plan, rien changé, on repasse) ---
 brocoli verification     |                 | 2026-09-25 17:51:38.499791+00
 huile olive verification |                 | 2026-09-25 17:51:38.499791+00
 poulet verification      |                 | 2026-09-25 17:51:38.499791+00
 riz blanc verification   |                 | 2026-09-25 17:51:38.499791+00

PUT #1 : 14 lignes — HTTP 200 — {"enregistrees":4}
PUT #2 : 14 lignes — HTTP 200 — {"enregistrees":0}
```

Les quatre `maj_le` sont **strictement identiques** après le second passage.

**Puis un changement de cuisson à l'écran** — repas du **Soir** déplié, puce
« Riz blanc verification · tel quel » touchée, « Eau bouillante » (mode 2)
choisie, puis « Passer au batch cooking → » :

```
PUT #1 : 14 lignes — HTTP 200 — {"enregistrees":1}
 corps : […,{"aliment":"riz blanc verification","mode":2} en 13e position,…]

--- base APRES passage ---
         aliment          | mode_cuisson_id |            maj_le
--------------------------+-----------------+-------------------------------
 brocoli verification     |                 | 2026-09-25 17:51:38.499791+00
 huile olive verification |                 | 2026-09-25 17:51:38.499791+00
 poulet verification      |                 | 2026-09-25 17:51:38.499791+00
 riz blanc verification   |               2 | 2026-09-25 17:53:51.555542+00
```

Une seule ligne écrite, les trois autres `maj_le` inchangés. Point 3 prouvé par
le geste réel de l'utilisateur, pas seulement par `curl`.
Capture : `captures/4-cuisson-changee.png`

### B.4 Un cas de lecture qui surprend, et qui n'est PAS une régression

Lors d'un essai précédent, la cuisson du riz avait été changée sur le repas du
**Matin** seulement, les trois autres repas restant « tel quel ». Résultat :

```
PUT : 14 lignes — HTTP 200 — {"enregistrees":0}
 corps : [{"riz blanc verification", mode:2} (Matin), …, {"riz blanc verification", mode:null} (Soir)]
```

L'habitude n'est **pas** modifiée, parce que le serveur retient la **dernière**
décision du plan (`LotDHabitudes::depuis`) et que la dernière est `null`.

J'ai vérifié que l'ancien code faisait exactement pareil
(`git show 4dfee03^:front/src/calcul/habitudesCuisson.ts`, fonction
`habitudesAEcrire`) : il retenait d'abord la dernière décision de chaque
aliment, puis filtrait l'inchangé — donc `null`, égal à l'habitude connue, était
écarté lui aussi. **Comportement identique avant et après.** Ce n'est pas un
défaut de la feature ; c'est simplement contre-intuitif au premier regard, et
mérite d'être su.

---

## C — L'effet du volume (jamais joué jusqu'ici)

Lot construit comme un vrai plan de sept jours : **7 jours × 4 repas ×
10 aliments = 280 lignes**, puisées dans **30 aliments distincts**
(10 571 octets de JSON).

**Premier passage à « Cuisiner »**

```
$ curl -s -X PUT http://localhost:8080/api/mes-cuissons … --data-binary @lot280.json
{"enregistrees":30}
HTTP 200 — 0.057376s
```

```sql
SELECT count(*) AS lignes_en_base, min(maj_le), max(maj_le)
  FROM cuisson_habituelle WHERE utilisateur_id = '89cc5324-812e-49dd-a507-ec114550518f';
```

```
 lignes_en_base |          plus_ancien          |          plus_recent
----------------+-------------------------------+-------------------------------
             30 | 2026-09-25 17:44:09.542699+00 | 2026-09-25 17:44:09.542699+00
```

280 lignes envoyées, **30 écrites** : le dédoublonnage serveur fait son travail.

**Rejeu à l'identique, trois fois**

```
{"enregistrees":0} HTTP 200 — 0.052560s
{"enregistrees":0} HTTP 200 — 0.048841s
{"enregistrees":0} HTTP 200 — 0.055088s
```

Empreinte de la table avant et après les trois rejeux :

```sql
SELECT count(*), sum(extract(epoch from maj_le))::numeric(20,6) AS somme_epoch,
       md5(string_agg(aliment||coalesce(mode_cuisson_id::text,'-')||extract(epoch from maj_le),
                      ',' ORDER BY aliment)) AS empreinte
  FROM cuisson_habituelle WHERE utilisateur_id = '89cc5324-…';
```

```
AVANT : 30 | 53710747486.280970 | 8ef5ab9f660cf7b6202328b648103a2f
APRÈS : 30 | 53710747486.280970 | 8ef5ab9f660cf7b6202328b648103a2f
lignes dont maj_le a bougé : 0
```

**Un aliment changé dans le plan de 280 lignes** (`brocoli`, présent 10 fois,
passé du mode 6 au mode 1 sur ses dix occurrences) :

```
{"enregistrees":1}
HTTP 200 — 0.055591s

 lignes_qui_ont_bouge | total
----------------------+-------
                    1 |    30
```

| Attendu | Obtenu |
|---|---|
| Premier passage : ~30 lignes écrites | 30 |
| Temps du cas d'usage réel | **57 ms** pour 280 lignes / 30 écritures (30 `INSERT … ON CONFLICT` dans une transaction) |
| Rejeu : `{"enregistrees":0}`, aucun `maj_le` touché | 3 rejeux à 0, empreinte md5 identique |
| Un changement = une ligne | 1 ligne sur 30 |

Le coût est négligeable : ~50 ms pour un lot vide d'effets, ~57 ms pour le
premier écrit. À titre de comparaison, un lot de 10 000 lignes / 60 distincts
répond en 80 ms et 200 écritures réelles en 109 ms (voir D).

---

## D — Les deux bornes

Tous les envois sur `verifborne-…@e2e.local`.

| Cas | Lignes brutes | Aliments distincts | Attendu (consigne) | Obtenu |
|---|---|---|---|---|
| D1 | 2 001 | 40 | 422 nommant 2000 | **HTTP 200 `{"enregistrees":40}`** en 64 ms |
| D2 | 10 001 | 60 | — | **HTTP 422** `Trop de lignes d'un coup : 10001 pour 10000 au maximum.` (47 ms) |
| D3 | 10 000 (pile la borne) | 60 | — | HTTP 200 `{"enregistrees":60}` (80 ms) |
| D4 | **7 440** (31 j × 4 repas × frigo de 60) | 60 | **ACCEPTÉ** | **HTTP 200 `{"enregistrees":60}`** (75 ms) |
| D5 | 201 | 201 | 422 nommant 200 | **HTTP 422** `Trop d'habitudes d'un coup : 201 pour 200 au maximum.` (40 ms) |
| D6 | 200 (pile la borne) | 200 | accepté | HTTP 200 `{"enregistrees":200}` (109 ms) |

Sorties brutes :

```
=== d2_10001 ===
{"erreur":"Trop de lignes d'un coup : 10001 pour 10000 au maximum."}
HTTP 422 — 0.047227s
=== d4_7440 ===
{"enregistrees":60}
HTTP 200 — 0.074997s
=== d5_201distincts ===
{"erreur":"Trop d'habitudes d'un coup : 201 pour 200 au maximum."}
HTTP 422 — 0.039708s
```

### Ce qui diverge de la consigne — et qui a raison

La consigne annonçait `MAX_LIGNES = 2000`. **Le code dit 10 000**
(`api/src/Service/LotDHabitudes.php:75`), et son commentaire explique pourquoi :
2 000 a valu une demi-journée et refusait un geste légitime (un mois entier à
17 aliments par repas fait 2 108 lignes → 422 → lot perdu en silence, l'échec
d'écriture des habitudes étant muet par décision). Le plafond a été adossé au
pire cas concevable, 31 × 4 × 60 = 7 440, et porté à 10 000.

Le comportement mesuré est donc **celui que la revue du soir a voulu** : 7 440
lignes passent (D4, l'exigence centrale du point D), et un envoi démesuré est
refusé en nommant sa borne (D2). **Les deux bornes se prouvent séparément**, ce
qui était le but : D5 montre que la seconde mord sur les distincts même très en
dessous de la première.

**Écart documentaire à corriger (aucune correction faite ici, lecture seule).**
Cinq endroits annoncent encore 2 000 :

```
docs/features/habitudes-cuisson-au-serveur.md:101   « MAX_LIGNES = 2000 sur l'envoi brut »
docs/features/habitudes-cuisson-au-serveur.md:172   « | MAX_LIGNES retenu | 2 000 | »
docs/etat/prochaines-etapes.md:16                   « plafond posé — MAX_LIGNES = 2000 »
docs/etat/statut.md:80                              « CA-R4 porte désormais ses deux chiffres : MAX_LIGNES = 2000 »
docs/etat/decisions.md:26                           « LotDHabitudes porte deux bornes : MAX_LIGNES = 2000 »
```

`docs/etat/statut.md:18` (entrée de la nuit) dit, lui, la bonne valeur — « porté
à 10 000 ». Le dépôt se contredit donc à l'intérieur d'un même fichier. C'est
exactement le motif « le commentaire qui ment » de `revue-de-code`, et c'est ce
qui m'a fait attendre un 422 sur D1.

---

## Ce que je n'ai pas pu éprouver

- **L'ajout manuel d'un aliment à un repas** (`ChoixDansListe`) : blocage connu,
  non contourné — conformément à la consigne. Il n'était pas nécessaire : la
  composition automatique suffit à atteindre les trois étapes.
- **Le chemin Grocy** : `source: 'grocy'` écrit dans l'instance réelle du
  propriétaire. Interdit, non joué. Les comptes jetables sont tous en
  `source_frigo = 'base'`.
- **La concurrence** (le `ksort` anti-interblocage, constat M2 de la revue) :
  deux envois simultanés du même compte avec des ordres d'aliments différents.
  Non joué — il aurait fallu forcer un entrelacement de transactions, ce qui ne
  se constate pas de façon fiable depuis `curl`. Le tri est en place dans
  `CuissonsHabituelles::remplacer` et la lecture du code le confirme, mais
  **cette protection n'est pas prouvée par une mesure.**
- **Le comportement hors ligne** (le défaut historique : `mesCuissons.data ===
  undefined` faisait tout réécrire). Par construction il ne peut plus se
  produire — l'écran n'envoie plus de jugement —, mais je ne l'ai pas rejoué
  réseau coupé.

---

## Preuve du ménage

État des comptes jetables juste avant suppression :

```
              email              | aliments | stock | cibles | habitudes | plans | exercices
---------------------------------+----------+-------+--------+-----------+-------+-----------
 verifb4-1790358149@e2e.local    |        4 |     4 |      4 |         9 |     0 |         0
 verifborne-1790358296@e2e.local |        0 |     0 |      0 |       360 |     0 |         0
 verifvol-1790358225@e2e.local   |        0 |     0 |      0 |        30 |     0 |         0
```

Suppression dans l'ordre de la skill `donnees-de-test` (stock → aliments → compte) :

```sql
DELETE FROM stock WHERE aliment_id IN (SELECT a.id FROM aliment a
  JOIN utilisateur u ON u.id = a.utilisateur_id WHERE u.email LIKE '%@e2e.local');   -- DELETE 4
DELETE FROM aliment WHERE utilisateur_id IN
  (SELECT id FROM utilisateur WHERE email LIKE '%@e2e.local');                        -- DELETE 4
DELETE FROM utilisateur WHERE email LIKE '%@e2e.local';                               -- DELETE 3
```

Recompte final, à comparer aux compteurs de départ :

```
                 quoi                  |                   valeur
---------------------------------------+---------------------------------------------
 comptes @e2e.local restants           | 0
 comptes @test.local restants          | 0
 utilisateurs                          | 2
 aliment                               | 8
 exercice                              | 1338
 cuisson_habituelle                    | 0
 stock                                 | 8
 cible                                 | 4
 inventaire_lot                        | 0
 plan_repas                            | 2
 aliment orphelin (nom ~ verification) | 0
 comptes                               | demo@fitcarnet.local, admin@fitcarnet.local
```

| Compteur | Avant | Après |
|---|---|---|
| utilisateurs | 2 | 2 |
| comptes `@e2e.local` | 0 | **0** |
| aliment | 8 | 8 |
| exercice | 1338 | 1338 |
| cuisson_habituelle | 0 | 0 |
| stock | 8 | 8 |
| inventaire_lot | 0 | 0 |
| plan_repas | 2 | 2 |

Contrôles complémentaires :

```
jetons_orphelins                  : 0
exercices_sans_auteur_non_publics : 0
cibles restantes                  : 4, toutes à demo@fitcarnet.local (ids 25 à 28)
```

Les quatre cibles restantes ne sont pas les miennes (les miennes portaient les
ids 30 à 33 et sont parties en cascade avec le compte).

**Aucune donnée existante n'a été écrite, modifiée ou supprimée.** La sauvegarde
`sauvegardes/fitcarnet_2026-09-25_194203.dump` n'a pas eu à servir.
