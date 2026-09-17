---
name: fonctionnalite-frigo-grocy
description: Tenir son stock dans Grocy — lecture des stocks et des valeurs nutritionnelles, produits écartés faute de valeurs, signalement des produits incomplets (manquants et souhaités), création d'un produit depuis l'application, suppression refusée et nom non modifiable côté application, survie à une panne de Grocy. N'est éprouvable qu'avec GROCY_URL et GROCY_API_KEY renseignés. À charger avec `epreuve-fonctionnalite`.
---

# Le frigo tenu dans Grocy

> **Cette fonctionnalité n'est éprouvable que si `GROCY_URL` et `GROCY_API_KEY`
> sont renseignés côté serveur.** Sans eux, l'écran affiche « Grocy n'est pas
> configuré côté serveur : renseigne GROCY_URL et GROCY_API_KEY. » et rien
> d'autre ne se démontre. Comment le vérifier : section *Comment l'éprouver*.
> **Et quand ils le sont, toute création écrit dans un vrai Grocy** — lire
> l'avertissement avant d'appuyer sur quoi que ce soit.

## Le besoin

Grocy est un gestionnaire de stock domestique : c'est **lui** qui tient
l'inventaire de la maison et qui sort la liste de courses. Quelqu'un qui l'utilise
déjà n'a aucune envie de tenir un second stock dans fitcarnet — deux inventaires
divergent en une semaine.

Mais Grocy **ne connaît aucune valeur nutritionnelle**. Le calculateur de repas,
lui, ne sait rien faire sans kcal, protéines, glucides, lipides, catégorie et
rendement de cuisson. Cette fonctionnalité fait tenir les deux ensemble : les
valeurs vivent dans des **champs personnalisés** de Grocy, et fitcarnet les lit,
les écrit, et **refuse d'inventer celles qui manquent**.

D'où la règle qui gouverne tout l'écran : **un produit sans valeurs est écarté du
frigo, pas complété au jugé.** Un aliment inventé fausserait un repas sans que
rien ne le signale — exactement ce que la règle 7 interdit. Et comme un produit
écarté est un produit qu'on ne voit plus, l'application **dit combien il y en a**
plutôt que de les faire disparaître en silence.

Le partage des rôles est explicite : **Grocy reste maître de l'inventaire et du
nom** ; fitcarnet sait créer un produit et remplir ses valeurs, pour éviter
l'aller-retour entre deux outils quand on ajoute du poulet.

## Ce que l'application propose

| Capacité | Où | `fichier:ligne` |
|---|---|---|
| **Deux sources, un seul écran** — la base pour les comptes ordinaires, Grocy pour `sourceFrigo = grocy` | API | `api/src/Service/Frigo.php:25-32` |
| **Diagnostic si Grocy n'est pas configuré**, avant tout appel | API | `Frigo.php:40-51`, `api/src/Service/FrigoGrocy.php:87-90` |
| **Lecture en cinq appels séquentiels** — le parallélisme a été mesuré et abandonné | API | `FrigoGrocy.php:116-120`, commentaire `:100-115` |
| **Champs personnalisés lus en une fois**, pas produit par produit | API | `FrigoGrocy.php:583-588`, commentaire `:570-582` |
| **Emplacement, unité, conversion vers le gramme** repris de Grocy | API | `FrigoGrocy.php:122-145`, `:193-202` |
| **Un produit sans valeurs est écarté silencieusement**, et journalisé (nombre + 5 exemples) | API | `FrigoGrocy.php:160-165`, `:206-211` |
| **Signalement des produits incomplets** — `manquants` (bloquants) et `souhaites` (les fibres) | `GET /api/mon-frigo/incomplets` | `FrigoGrocy.php:219-249`, `api/src/Controller/FrigoController.php:93-101` |
| **Deux bandeaux distincts**, parce que les deux manques ont des conséquences opposées | onglet Mon frigo | `front/src/composants/alertesFrigo.tsx:134-142`, `:144-154` |
| **Produits sans poids connu signalés** — les macros sont pour 100 g | idem | `alertesFrigo.tsx:109-120`, `front/app/(onglets)/frigo.tsx:129` |
| **Compteur d'en-tête suivi de « · depuis Grocy »** | idem | `frigo.tsx:207-212` |
| **Créer un produit depuis l'application** — création **et** valeurs dans le même appel | `POST /api/mon-frigo/aliment` | `FrigoController.php:182-198`, `:227-239` |
| **Détection de doublon par nom « repéré »** — minuscules, sans accents, non-alphanumériques réduits | API | `FrigoGrocy.php:286-293`, `:340-348` |
| **Création des champs personnalisés manquants avant d'écrire** | API | `FrigoGrocy.php:373-393`, appelée en `:428` |
| **Refus propre plutôt qu'un choix au hasard** — sans unité « gramme », sans emplacement | API | `FrigoGrocy.php:295-308`, `:310-320` |
| **Marquage `source_valeurs = 'moi'`** — protège la saisie des réimports | API | `FrigoGrocy.php:448` |
| **La quantité passe par l'inventaire Grocy**, et s'envoie même à zéro | `POST /api/mon-frigo/quantite` | `FrigoController.php:272-305`, `front/src/composants/editeurAlimentConnecte.tsx:126-138` |
| **Suppression refusée côté application** — « un produit Grocy se supprime dans Grocy » | onglet Mon frigo | `front/src/composants/ligneFrigo.tsx:96-102` |
| **Nom non modifiable en correction** | éditeur d'aliment | `editeurAlimentConnecte.tsx:87-89`, `front/src/composants/editeurAliment.tsx:241`, `:250-255` |
| **Survie à une panne de Grocy** — liste vide et message, jamais un 500 | API | `FrigoController.php:72-82` |
| **Le texte réel de Grocy en cas d'échec**, tronqué à 200 caractères | API | `FrigoGrocy.php:533-547`, `:520` |
| **« Déjà à jour » n'est pas un échec** | API | `FrigoGrocy.php:55`, `:505-515` |
| **Appels bornés à 20 s**, sous les 30 s du front | API | `FrigoGrocy.php:76-77`, commentaire `:57-75` |

### Les champs, et ce que chacun décide

**Six champs sans lesquels l'aliment n'entre pas dans un calcul**
(`FrigoGrocy.php:23`) : `cat`, `kcal100`, `prot100`, `gluc100`, `lip100`,
`ratio`. Il en manque un → le produit **n'apparaît pas** dans le frigo.

**Un champ souhaité** (`FrigoGrocy.php:35`) : `fibres100`. Son absence
**n'écarte pas** l'aliment — il reste utilisable en convention européenne — mais
**fausse en silence** une cible exprimée en glucides totaux, qui le compte à zéro
fibre et vise trop haut. C'est le plus dangereux des deux manques, d'où son
bandeau propre.

**Dix champs écrits**, créés au besoin (`FrigoGrocy.php:359-370`) : les six
ci-dessus, `fibres100`, `pesee_avant`, `pesee_apres`, et `source_valeurs`.

**Les valeurs décrivent le produit TEL QU'ON LE PÈSE** (règle 3) : le riz sec vaut
350 kcal/100 g, pas 99. La conversion a été faite une fois pour toutes par
`ciqual_vers_grocy.py --convertir-en-pese` ; le commentaire de
`FrigoGrocy.php:180-192` garde la trace de l'erreur qu'elle a corrigée —
les macros du riz **cuit** lues comme celles du riz **sec** faisaient annoncer
220 g à peser pour 73 g de glucides quand 220 g de riz sec en apportent 165.

## Le parcours

**Compte requis** : un compte dont `sourceFrigo` vaut `grocy` — en pratique
l'administrateur (`api/src/Command/CreerUtilisateurCommand.php:67`, option
`--grocy`). **Données de départ** : une instance Grocy joignable, avec au moins
une unité « gramme » et un emplacement.

1. Onglet **Mon frigo** (`front/app/(onglets)/_layout.tsx:56-62`). L'écran est le
   **même que pour un compte tenu en base** — seule l'API appelée diffère
   (`frigo.tsx:70-80`). Voir `fonctionnalite-frigo` pour tout ce qui est commun.
2. L'en-tête affiche **`12 en stock sur 40`** suivi de **` · depuis Grocy`**
   (`frigo.tsx:207-212`) : c'est le seul endroit où la source se lit.
3. **Les bandeaux**, dans l'ordre où ils peuvent apparaître
   (`front/src/composants/alertesFrigo.tsx`) :
   - **produits sans poids connu** (`:109-120`) — *« `2` produit(s) sans poids
     connu (`Lait` en `Litres`, …). Les macros sont données pour 100 g : le
     calculateur les écarte. Déclare la conversion dans Grocy — « 1 Litres = … g »
     sur la fiche produit — ou passe-les au gramme. »* ;
   - **le problème de source**, en couleur vive et en taille normale (`:122-128`) :
     c'est là que s'affiche « Grocy n'est pas configuré… » ou « Grocy est
     injoignable sur … » ;
   - **produits bloquants** (`:134-142`) — *« `3` produit(s) Grocy sans valeurs
     nutritionnelles : ils n'apparaissent pas ici et restent invisibles au
     calculateur. Renseigne-les dans Grocy pour les utiliser. »* ;
   - **produits sans fibres** (`:144-154`), bordé de vif — *« ⚠ `6` aliment(s)
     sans fibres renseignées : `Pain complet`, … Ils restent utilisables, mais une
     cible en glucides totaux les compte à zéro fibre et vise trop haut, sans rien
     signaler. »*
4. **Déplier une ligne** (`ligneFrigo.tsx:63-105`) : les mesures pour 100 g, les
   fibres **si connues** seulement (`:70-72`), et **`À la cuisson`** —
   « poids inchangé » ou « 100 g → 230 g » (`:73-78`). Puis, sous les mesures :

   > **La quantité se modifie depuis l'inventaire. Cet aliment vient de Grocy :
   > sa fiche s'y modifie aussi.** (`ligneFrigo.tsx:87-90`)

5. **Un seul bouton en bas de la carte dépliée : `Corriger les valeurs`.** Le
   bouton **`Supprimer` n'existe pas** — il est conditionné à `modifiable`, faux
   sur Grocy (`ligneFrigo.tsx:96-102`).
6. **`Corriger les valeurs`** ouvre l'éditeur avec le **nom en lecture seule**
   (`editeurAlimentConnecte.tsx:87-89`) :

   > **Le nom vient de Grocy. Renomme le produit là-bas si besoin : le modifier
   > ici ne changerait rien.** (`editeurAliment.tsx:253-254`)

   L'enregistrement appelle `POST /api/mon-frigo/aliment` avec la **référence du
   produit** (`editeurAlimentConnecte.tsx:114-118`).
7. **`Ajouter un aliment`** (`frigo.tsx:291-293`) est ouvert **aux deux sources**
   (`:76-80`). La liste propose **`Créer de zéro`** en tête, puis les aliments de
   référence dont on ne possède pas déjà le nom (`:142-156`).
8. À la création, le nom **est** saisissable, et un champ
   **`Quantité déjà en stock (facultatif)`** apparaît
   (`editeurAliment.tsx:263`, `editeurAlimentConnecte.tsx:90-93`).
9. À l'enregistrement, **deux appels dans cet ordre**
   (`editeurAlimentConnecte.tsx:111-142`) :
   - `POST /api/mon-frigo/aliment` avec `reference` **vide** → l'API crée le
     produit dans Grocy **puis** écrit ses valeurs, **dans le même appel**, et
     rend `grocy:<id>` (`FrigoController.php:191-198`, `:227-247`) ;
   - `POST /api/mon-frigo/quantite` avec cette référence — **même à zéro**, car
     c'est cet appel qui crée la ligne de stock et rattache le produit à un
     emplacement (`editeurAlimentConnecte.tsx:126-138`).
10. Si le **second** échoue, le premier est déjà passé, et on le dit précisément
    (`alertesFrigo.tsx:65-73`) : *« L'aliment a bien été créé, mais sa quantité
    n'a pas pu être posée : `<motif>`. Renseigne-la depuis l'inventaire. »*

## Critères d'acceptation

1. **Grocy non configuré → liste vide, message, et HTTP 200.** `GET /api/mon-frigo`
   rend `{"source":"grocy","aliments":[],"probleme":"Grocy n'est pas configuré
   côté serveur : renseigne GROCY_URL et GROCY_API_KEY."}` — **jamais un 500**
   (`FrigoController.php:63-70`, `Frigo.php:46-47`). À l'écran, le message
   s'affiche en couleur vive (`alertesFrigo.tsx:122-128`).
2. **Grocy injoignable (éteint, DNS mort, clé refusée) → même forme.** Liste vide,
   `probleme` portant « Grocy est injoignable sur `/objects/products` : … », et
   **jamais un 500** (`FrigoController.php:72-82`, `FrigoGrocy.php:609-612`).
   C'est le critère de survie : l'application reste utilisable pour tout le reste.
3. **Un produit sans l'un des six champs n'apparaît pas dans la liste** — et
   n'est pas complété par un zéro (règle 6, règle 7)
   (`FrigoGrocy.php:160-165`).
4. **Le même produit est compté dans le bandeau bloquant** : le nombre affiché
   doit correspondre au nombre de produits écartés
   (`alertesFrigo.tsx:134-142`, `frigo.tsx:85`). Un produit qui disparaît **sans**
   être compté serait le défaut à rapporter.
5. **Un produit sans `fibres100` apparaît bien dans la liste**, et déclenche le
   bandeau ⚠ — pas l'autre (`frigo.tsx:86-87`, `alertesFrigo.tsx:144-154`). Les
   deux listes sont disjointes par construction : `manquants.length === 0 &&
   souhaites.length > 0`.
6. **Le détail n'affiche la ligne `Fibres` que si elles sont connues**
   (`ligneFrigo.tsx:70-72`) : vide ≠ zéro.
7. **Un compte tenu en base ne déclenche aucun de ces appels** :
   `GET /api/mon-frigo/incomplets` rend `{"produits":[]}` sans toucher à Grocy
   (`FrigoController.php:96-98`), et le hook est désactivé côté front
   (`front/src/api/hooks/frigo.ts:41`, `frigo.tsx:81`).
8. **Création : un seul appel pose le produit ET ses valeurs.** Après
   `POST /api/mon-frigo/aliment` avec `reference` vide, le produit doit exister
   dans Grocy **avec** sa catégorie et ses macros — jamais un produit nu
   (`FrigoController.php:182-190`). La réponse porte `{"ok":true,"reference":"grocy:<id>"}`.
9. **Refus : doublon de nom, détecté avant d'arriver dans Grocy.**
   « `« Blanc de poulet »` existe déjà dans Grocy. Ouvre-le pour corriger ses
   valeurs. » en 422 (`FrigoGrocy.php:286-293`, `FrigoController.php:196-198`).
   Le repérage ignore **la casse, les accents et la ponctuation** : « Blanc de
   Poulet » et « blanc-de-poulet » sont des doublons
   (`FrigoGrocy.php:340-348`). Témoins :
   `api/tests/Service/FrigoGrocyCreationTest.php:66`, `:85`.
10. **Refus : nom vide** (`FrigoGrocy.php:281-284`).
11. **Refus : pas d'unité « gramme » dans Grocy**, avec la raison et la
    conséquence — « Grocy n'a pas d'unité « gramme ». Crée-la dans Grocy avant
    d'ajouter un aliment : les valeurs nutritionnelles sont pour 100 g, et le
    calculateur écarte tout ce qui ne se convertit pas en grammes. »
    (`FrigoGrocy.php:302-308`). **On refuse plutôt que de choisir au hasard** :
    une unité prise au hasard serait pire qu'un refus. Témoin :
    `FrigoGrocyCreationTest.php:99`.
12. **Refus : aucun emplacement** (`FrigoGrocy.php:310-315`). Témoin :
    `FrigoGrocyCreationTest.php:120`.
13. **Refus : Grocy accepte la création sans rendre d'identifiant** — erreur
    franche, avec le geste à faire : « Vérifie dans Grocy si le produit existe
    avant de recommencer. » (`FrigoGrocy.php:329-334`).
14. **Les champs personnalisés absents sont créés avant l'écriture**, et
    l'écriture ne part qu'ensuite (`FrigoGrocy.php:373-393`, `:428`). Sans cela
    Grocy **refuse le lot entier** sur une seule clé inconnue (`:350-358`). À
    éprouver sur un Grocy neuf : les dix champs doivent apparaître.
15. **Toute valeur saisie porte `source_valeurs = 'moi'`** (`FrigoGrocy.php:448`),
    ce qui protège la saisie des réimports.
16. **Une fibre effacée est bien effacée** : les valeurs absentes sont écrites
    **vides**, pas omises — Grocy conserve la valeur des clés non transmises
    (`FrigoGrocy.php:437-439`, commentaire `:405-409`).
17. **Refus : les calories sont obligatoires** — « Les calories sont
    obligatoires. » en 422 (`FrigoController.php:215-220`). Un zéro ferait
    disparaître l'aliment du solveur sans rien signaler.
18. **Refus : catégorie inconnue** (`FrigoController.php:210-213`) et **ratio non
    positif** (`:222-225`).
19. **La quantité s'envoie même à zéro**, et c'est elle qui rattache le produit à
    un emplacement (`editeurAlimentConnecte.tsx:135-138`). Un produit créé sans
    cet appel resterait sous « Sans emplacement ».
20. **Si la quantité échoue, le message parle de la création et d'elle seule**
    (`alertesFrigo.tsx:65-73`) : c'est la panne du 14 août 2026, où un inventaire
    raté affichait « L'aliment a bien été créé » à quelqu'un qui n'avait rien
    créé. Les deux mutations sont désormais distinctes
    (`front/src/api/hooks/frigo.ts:134-153`).
21. **Suppression refusée côté application** : aucun bouton `Supprimer` sur une
    ligne Grocy (`ligneFrigo.tsx:96-102`), et le message du détail le dit
    (`:87-90`).
22. **Nom non modifiable en correction**, avec l'explication — et **modifiable à
    la création** (`editeurAlimentConnecte.tsx:89`,
    `editeurAliment.tsx:241`, `:250-255`). Côté API, `nom` n'est lu que dans la
    branche création (`FrigoController.php:195`).
23. **Refus croisé des deux sources**, dans les deux sens :
    - un compte **base** appelant `/mon-frigo/aliment` → 409 « Tes aliments se
      modifient dans la base, pas ici. » (`FrigoController.php:173-177`) ;
    - un compte **base** appelant `/mon-frigo/quantite` → 409 « Tes quantités se
      modifient dans la base, pas ici. » (`:275-279`) ;
    - un compte **grocy** appelant `/mon-frigo/stock` → 409 « Tes quantités se
      modifient dans Grocy, pas ici. » (`:132-136`).
24. **Une référence étrangère est refusée** : `/mon-frigo/quantite` exige un
    préfixe `grocy:` (`FrigoController.php:285-292`), et l'inventaire exige le
    préfixe de la source du compte (`:331`, `:356-360`).
25. **Un échec d'écriture Grocy remonte en 502 avec le texte de Grocy**, pas un
    500 ni « HTTP 400 returned for … » (`FrigoController.php:240-242`,
    `FrigoGrocy.php:517-520`, `:533-547`). Le corps est tronqué à 200 caractères.
26. **« Déjà à jour » ne compte pas comme un échec** : poser la quantité que
    Grocy a déjà rend `ok`, pas une ligne rouge (`FrigoGrocy.php:505-515`).
27. **Un appel à Grocy ne dépasse pas 20 s**, pour que l'API réponde avant les
    30 s du front et rende le vrai diagnostic (`FrigoGrocy.php:76-77`,
    `front/src/api/client.ts:208-215`). Témoins :
    `api/tests/Service/FrigoGrocyDelaiTest.php:76`, `:98`, `:109`.
28. **Isolation (règle 2), et sa limite assumée** : un compte tenu en base ne voit
    **jamais** le frigo Grocy (`Frigo.php:27-31`). En revanche, **tous les comptes
    en `sourceFrigo = grocy` liraient le MÊME frigo** — `FrigoGrocy::lire()` ne
    prend aucun utilisateur. Voir *Limites connues*.

## Comment l'éprouver

### D'abord : vérifier que Grocy est configuré

La configuration entre par deux variables d'environnement, injectées dans le
service (`api/config/services.yaml:56-57`) et transmises au conteneur
(`compose.dev.yml:41-42`). `default::` signifie qu'elles sont **facultatives** :
absentes, elles valent la chaîne vide et `estConfigure()` rend `false`
(`FrigoGrocy.php:87-90`).

```bash
# 1. ce que le CONTENEUR voit — c'est la seule chose qui compte
docker exec fitcarnet-app-dev printenv GROCY_URL
docker exec fitcarnet-app-dev sh -c 'test -n "$GROCY_API_KEY" && echo "clé présente" || echo "CLÉ ABSENTE"'

# 2. ce que le dépôt fournit (ne jamais afficher la clé en clair)
grep -c GROCY_API_KEY /home/micka/perso/fitcarnet/.env

# 3. la réponse de l'application, qui tranche
curl -s -H "Authorization: Bearer $JETON" http://localhost:8080/api/mon-frigo \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["source"], "|", d["probleme"], "|", len(d["aliments"]), "aliments")'
```

La troisième commande est la seule preuve : `grocy | None | 59 aliments` dit que
tout fonctionne ; `grocy | Grocy n'est pas configuré côté serveur… | 0 aliments`
dit que les variables manquent ; `base | None | …` dit que le compte utilisé
n'est **pas** sur Grocy.

**Si elles ne sont pas renseignées, s'arrêter là et le dire** : rien de cette
fiche ne s'éprouve, et la plupart des critères ne peuvent pas être simulés. C'est
exactement l'impasse notée en fin de `presentation/demonstration.md` (« la
source Grocy n'est tournable que si `GROCY_URL` est renseigné sur l'instance
filmée »).

### L'avertissement qui prime sur tous les autres

> **Toute création écrit dans le VRAI Grocy, qui n'est pas une base de test.**

`donnees-de-test` pose la règle : **n'écris jamais sur une donnée que tu n'as pas
créée.** Ici, la lecture est sans danger ; la **création** et la **quantité** ne
le sont pas — elles posent un produit et un mouvement de stock dans l'instance
configurée, et **fitcarnet ne sait pas les supprimer** (critère 21). Donc :

- **lecture seule par défaut** : critères 1 à 7, 21, 22, 23, 28 se prouvent sans
  rien écrire ;
- pour les critères d'**écriture** (8 à 20, 24 à 26), trois voies, dans cet
  ordre de préférence :
  1. **les témoins unitaires**, qui couvrent déjà tous les refus avec des
     réponses simulées — `api/tests/Service/FrigoGrocyCreationTest.php` (9 cas),
     `FrigoGrocyDelaiTest.php`, `DeductionGrocyTest.php` :
     ```bash
     docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit --filter FrigoGrocy'
     ```
  2. **une instance Grocy jetable** (conteneur local), en pointant `GROCY_URL`
     dessus — la seule façon d'éprouver honnêtement le critère 14 (champs
     personnalisés créés sur une base neuve) ;
  3. **en dernier recours, l'instance réelle** : un nom sans ambiguïté
     (`ZZ-verif-<date>`), noté **avant** d'appuyer, et **supprimé à la main dans
     Grocy** aussitôt après. Le relever dans le rapport.

**Ne jamais lancer `test_ecriture_grocy.py`** (`donnees-de-test`, « Ce qu'on ne
lance jamais »).

### Préparer, et éprouver les refus

```bash
docker ps --format '{{.Names}}\t{{.Status}}'
curl -s http://localhost:8080/api/etat
/home/micka/perso/fitcarnet/db/manuel/rattraper-dev.sh
npm --prefix /home/micka/perso/fitcarnet/front run build:web
```

Un **compte jetable sur Grocy** se fait en basculant la colonne — et **en
relevant la valeur avant de l'écraser** :

```bash
docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -c \
  "SELECT email, source_frigo FROM utilisateur WHERE email = 'grocy-verif@test.local';"
docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -c \
  "UPDATE utilisateur SET source_frigo = 'grocy' WHERE email = 'grocy-verif@test.local';"
```

**Simuler la panne (critère 2)** sans toucher à Grocy : pointer l'API sur une
adresse morte le temps de l'épreuve, puis la remettre.

```bash
# dans compose.dev.yml, ou par l'environnement du conteneur :
#   GROCY_URL=http://grocy-qui-nexiste-pas.invalid
# puis relire /api/mon-frigo : liste vide + « Grocy est injoignable sur … »
```

**Les refus croisés (critère 23) se prouvent au `curl`**, et ce sont les plus
rapides :

```bash
BASE=http://localhost:8080/api
# avec le jeton d'un compte tenu en BASE :
curl -s -X POST "$BASE/mon-frigo/aliment" -H "Authorization: Bearer $JETON_BASE" \
  -H 'Content-Type: application/json' -d '{"reference":"","nom":"x","categorie":"prot","kcal100":100}'
# → 409 {"erreur":"Tes aliments se modifient dans la base, pas ici."}
```

**Pièges propres à cette fonctionnalité :**

- **La lecture prend plusieurs secondes**, et c'est normal : cinq appels
  séquentiels, mesurés à 6,25 s en production. Le parallélisme a été essayé et
  **abandonné** — il était passé à 29 s et saturait les huit fils de FrankenPHP
  (`FrigoGrocy.php:100-115`). Ne pas rapporter cette lenteur comme un défaut sans
  lire ce commentaire.
- **Le front abandonne à 30 s, l'API borne Grocy à 20 s.** Si l'épreuve donne
  « Le serveur ne répond pas (plus de 30 s) » **au lieu** du 502 « Grocy est
  injoignable… », c'est une régression de l'ordre des deux bornes — c'est
  précisément ce que `FrigoGrocyDelaiTest` protège.
- **Un produit Grocy sans conversion vers le gramme n'est pas « incomplet »** :
  il a toutes ses valeurs, mais son stock n'est pas convertible. Il apparaît dans
  la liste et déclenche le bandeau *sans poids connu* (`frigo.tsx:129`), pas le
  bandeau des bloquants. Deux bandeaux différents, deux causes différentes.
- **`produitsIncomplets()` relit tout le catalogue Grocy** (`FrigoGrocy.php:226`) :
  c'est un second passage sur `/objects/products`, en plus de la lecture du
  frigo. Attendre.
- **Le compteur « n en stock sur m » ne compte que ce que l'application voit** :
  les produits écartés n'y figurent pas. C'est le bandeau qui les nomme.
- **La suppression d'un aliment de la liste appelle `DELETE /api/aliments/{id}`**
  avec `reference.split(':')[1]` (`frigo.tsx:350`) — sur une référence `grocy:`,
  ce nombre est un identifiant **Grocy**, pas un identifiant d'aliment. C'est
  pour cela que le bouton n'existe pas côté Grocy ; ne pas le réactiver « pour
  voir ».

## La capture pour la démonstration

`presentation/demonstration.md` classe cette source en **impasse connue**
(bobine 8) : ces plans ne se tournent que sur une instance où `GROCY_URL` est
renseigné. Si ce n'est pas le cas, **le dire dans le rapport plutôt que de
filmer l'écran « non configuré »**, qui ne démontre rien.

`presentation/captures/frigo-grocy/01-stock-depuis-grocy.webm` — **~40 s**
: onglet **Mon frigo** sur le compte Grocy. S'arrêter sur l'en-tête
**`… en stock sur … · depuis Grocy`**, puis défiler la liste et **déplier un
produit** pour montrer ses macros et **`À la cuisson`**.
*Ce qu'on dit* : « Ce stock n'est pas tenu ici : il vient de Grocy, qui gère
l'inventaire de la maison et sort la liste de courses. fitcarnet y ajoute ce que
Grocy ne sait pas faire — les valeurs nutritionnelles — et s'en sert pour
calculer. »

`presentation/captures/frigo-grocy/02-ce-quon-ne-voit-pas.webm` — **~35 s** —
**le moment fort**
: montrer les bandeaux. D'abord les **bloquants**, puis le bandeau **⚠ sans
fibres**, en les lisant à l'écran.
*Ce qu'on dit* : « Trois produits n'apparaissent pas dans cette liste : il leur
manque des valeurs, et l'application refuse de les inventer — un chiffre faux
serait pesé et mangé. Elle ne les efface pas en silence pour autant : elle dit
combien il y en a. Et en dessous, le cas plus vicieux : ces aliments-là sont
utilisables, mais leurs fibres sont inconnues. Avec une cible en glucides totaux,
ils seraient comptés à zéro fibre — et on viserait trop haut sans que rien ne le
signale. »

`presentation/captures/frigo-grocy/03-creer-un-produit.webm` — **~45 s**
: **`Ajouter un aliment`** → **`Créer de zéro`** → saisir un nom repérable, une
catégorie, des macros et une quantité, puis enregistrer. Montrer la ligne
apparue. **Puis rouvrir le produit** et montrer le **nom en lecture seule** avec
« Le nom vient de Grocy. Renomme le produit là-bas si besoin ».
*Ce qu'on dit* : « On crée le produit sans quitter l'application : il est posé
dans Grocy et ses valeurs écrites dans le même appel — sinon un produit nu
resterait là, invisible au calculateur. Mais Grocy reste maître du nom et de
l'inventaire : ici on ne le renomme pas, et on ne le supprime pas. »
*Remise à zéro* : **supprimer le produit dans Grocy** — l'application ne sait pas
le faire.

`presentation/captures/frigo-grocy/04-grocy-eteint.webm` — **~25 s**
: avec `GROCY_URL` pointé sur une adresse morte, ouvrir l'onglet : **liste vide,
message explicatif**, et le reste de l'application toujours navigable.
*Ce qu'on dit* : « Et quand Grocy ne répond pas, l'écran le dit et rend la main.
Pas une page d'erreur, pas un 500 : une liste vide et la raison. »

Le dossier `presentation/captures/` est ignoré par git : on versionne la matière,
pas les vidéos.

## Limites connues

- **Le frigo Grocy est unique et global.** `FrigoGrocy::lire()` ne prend **aucun
  utilisateur** (`FrigoGrocy.php:93`, `Frigo.php:27-31`) : deux comptes en
  `sourceFrigo = grocy` liraient **le même stock**, et l'un écrirait dans le
  frigo de l'autre. Aujourd'hui c'est sans conséquence — l'administrateur est le
  seul dans ce cas, et l'invitation crée toujours des comptes en `base`
  (`api/src/Controller/InvitationsController.php:303-306`) — mais **c'est une
  exception à la règle 2 qui ne figure ni dans la skill `isolation-donnees`, ni
  dans sa liste d'exceptions documentées**. À trancher avant de basculer un
  second compte sur Grocy.
- **L'application ne supprime jamais un produit Grocy**, et ne le renomme pas.
  C'est une décision (`ligneFrigo.tsx:96-97`), pas un manque : Grocy est maître
  de son inventaire. Conséquence pratique : **tout produit créé pendant une
  épreuve doit être retiré à la main dans Grocy.**
- **Cette fonctionnalité n'a pas de test de bout en bout**, et ne peut pas en
  avoir sans instance : les témoins simulent les réponses HTTP de Grocy
  (`MockResponse`). `presentation/demonstration.md` le dit déjà, en fin de
  partie V (« Ce qui n'a pas été vérifié ») — « le frigo Grocy en fonctionnement :
  il demande une instance configurée » n'a **pas** été vérifié lors de la revue
  du 16 septembre 2026.
- **La détection de doublon est la seule barrière contre les homonymes.** Grocy
  accepte deux produits de même nom sans broncher, et le frigo afficherait deux
  lignes identiques dont une seule porte les macros
  (`FrigoGrocy.php:269-273`). Elle porte sur le nom « repéré », donc « Poulet » et
  « Poulet fermier » restent deux produits distincts.
- **Le premier emplacement fait office de défaut** à la création
  (`FrigoGrocy.php:316-320`) : le produit est visible tout de suite, à
  l'utilisateur de le ranger dans Grocy. Assumé.
- **L'unité de création est toujours le gramme** (`FrigoGrocy.php:322-327`) :
  l'application ne propose pas de créer un produit en pièces ou en litres, parce
  qu'il serait aussitôt écarté du calculateur.
- **`source_valeurs = 'moi'` protège des réimports de `ciqual_vers_grocy.py`**,
  mais rien n'empêche une modification manuelle dans Grocy de reprendre la main —
  c'est normal, Grocy est l'autre moitié du système.
- **Le reste de l'onglet est couvert ailleurs** : le mode Stock, l'éditeur et son
  contrôle de cohérence dans `fonctionnalite-frigo` ; la saisie en écarts et le
  traitement en tâche de fond dans `fonctionnalite-inventaire` — c'est là que se
  trouvent `AppliqueInventaire` et `inventorierUn` en lot.
- **`presentation/features.md` (14 septembre) cite cette fonctionnalité avec des
  `fichier:ligne` périmés** : il annonce `FrigoGrocy.php:71` pour la lecture,
  `:197` pour les incomplets, `:252` pour la création, `:318`, `:337`, `:389`,
  `:479`, `:488` — le fichier en compte 614 et les vraies positions sont `:93`,
  `:219`, `:274`, `:340`, `:373`, `:448`, `:533`, `:55`. De même `frigo.tsx:141`
  et `:702` pour un écran qui fait 445 lignes depuis l'extraction des composants
  du 15 septembre. Les lignes de cette fiche ont été relues le
  **16 septembre 2026**.
