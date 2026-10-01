---
name: fonctionnalite-frigo
description: Savoir ce qu'on a — le stock groupé par emplacement, la recherche sans accents, le détail dépliable, l'ajout d'un aliment dans un éditeur vide, l'éditeur et son contrôle de cohérence bloquant, la correction et la suppression. À charger avec `epreuve-fonctionnalite` pour éprouver et filmer l'onglet « Mon frigo », mode Stock.
---

# Mon frigo — savoir ce qu'on a

## Le besoin

Avant de composer un repas, l'application doit savoir ce qui est réellement
dans le frigo, le congélateur et le placard — **et avec quelles valeurs
nutritionnelles**. C'est la matière première de tout le reste : le solveur ne
peut pas être plus juste que ce que cet écran contient.

L'utilisateur y vient pour trois raisons, dans cet ordre de fréquence : vérifier
ce qu'il a, ajouter un produit qu'il vient d'acheter, corriger une valeur qu'il
a mal recopiée de l'emballage.

**La règle 3 du projet se joue ici** : les valeurs décrivent le produit **tel
qu'on le pèse** — le riz blanc sec vaut 350 kcal/100 g, pas 155, qui est la
valeur du même riz une fois cuit (CIQUAL 2025, colonne « Règlement UE
n° 1169/2011 »). Et la règle 6 : un champ de fibres vide veut dire « je ne sais
pas », jamais « zéro ».

Cette fiche couvre le **mode Stock**. Le recomptage complet est dans
`fonctionnalite-inventaire` ; les deux vivent dans le même écran, sous un
sélecteur à deux segments (`front/app/(onglets)/frigo.tsx:152-173`).

## Ce que l'application propose

| Capacité | Où | `fichier:ligne` |
|---|---|---|
| **Stock groupé par emplacement**, dans l'ordre d'un inventaire réel — Frigo, Congélateur, Placard, puis le reste, et « Sans emplacement » en dernier | liste | `front/src/calcul/frigo.ts:14` (`ORDRE_EMPLACEMENTS`), `:21` (`grouperParEmplacement`) |
| En-tête de section « **Frigo · 6** » — le nom du lieu et son nombre de lignes | liste | `front/app/(onglets)/frigo.tsx:221-223` |
| **Compteur d'en-tête** « **6 en stock sur 8** » sur le jeu d'essai, suivi de « **· depuis Grocy** » le cas échéant | en-tête | `front/app/(onglets)/frigo.tsx:176-181`, comptage `:96` |
| **Recherche par aliment OU par emplacement**, insensible aux accents et à la casse — « congelateur » trouve le Congélateur | champ « Chercher un aliment ou un emplacement » | `front/app/(onglets)/frigo.tsx:187-191`, `front/src/calcul/frigo.ts:45-54`, `front/src/calcul/texte.ts:57` |
| **Macros pour 100 g sur chaque ligne**, stock coloré selon qu'il en reste | ligne | `front/src/composants/ligneFrigo.tsx:43-51` |
| « **soit 1 250 g** » quand l'unité n'est pas le gramme | ligne | `front/src/composants/ligneFrigo.tsx:52-56` |
| Mention « **poids cru** » / « **poids sec** » quand le rendement n'est pas 1 | ligne | `front/src/composants/ligneFrigo.tsx:35`, `:57-59` |
| **Détail dépliable** : Pour 100 g, Protéines, Glucides, Lipides, **Fibres si connues**, et « **À la cuisson : 100 g → 230 g** » ou « **poids inchangé** » | carte ouverte | `front/src/composants/ligneFrigo.tsx:63-78` |
| **Contrôle de cohérence** affiché dans le détail dès que le verdict n'est pas « cohérent » | carte ouverte | `front/src/composants/ligneFrigo.tsx:81-85` (le verdict vient du serveur) |
| « **La quantité se modifie depuis l'inventaire.** » | carte ouverte | `front/src/composants/ligneFrigo.tsx:87-90` |
| **Ajouter un aliment** — l'éditeur s'ouvre directement, **macros vides** : l'écran demande une création (`creation`) et ne passe aucun aliment | « Ajouter un aliment » | `front/app/(onglets)/frigo.tsx` (`setCreation(true)`) ; `front/src/composants/editeurAlimentConnecte.tsx` (`creation`, `aliment={!creation && edite !== null ? … : undefined}`) ; `front/src/composants/editeurAliment.tsx` (`textesDe`) |
| **Huit catégories** en puces colorées, avec un exemple sous la rangée | éditeur | `CATEGORIES` dans `front/src/calcul/nutrition.ts`, rendu dans `front/src/composants/editeurAliment.tsx` |
| **Fibres facultatives** — vide ≠ zéro : le champ vide part comme une chaîne vide, et c'est le serveur qui le lit (depuis le 26 septembre 2026, `macros-editeur-vide-pas-zero`) | éditeur | `champNombre('fibres100', …)` dans `front/src/composants/editeurAliment.tsx`, `NombreSaisi::estVide` côté serveur |
| **Contrôle de cohérence permanent** qui **BLOQUE** l'enregistrement sur « incohérent » (le serveur répond `enregistrable`) | éditeur | `valide` dans `front/src/composants/editeurAliment.tsx`, `api/src/Service/VerdictAliment.php` |
| **Détection des kilojoules** — bandeau + bouton « **Convertir : 1473 kJ = 352 kcal** » | éditeur | `verdictVisible.conversion` dans `front/src/composants/editeurAliment.tsx` ; la détection est au serveur (`api/src/Service/VerdictAliment.php`, `CoherenceNutritionnelle.php`) |
| **Rendement de cuisson** : cinq guides, ou « **Je préfère mesurer** » → deux pesées → « **Utiliser ce résultat (2,3)** » | éditeur | `front/src/composants/editeurAliment.tsx` (« Changement de poids à la cuisson »), `RATIOS_GUIDES` dans `front/src/calcul/nutrition.ts`, `api/src/Service/RendementExplique.php::depuisPesees` |
| **Provenance du rendement** — « ✓ mesuré : 100 g avant cuisson → 230 g après » ou « Valeur courante — mesure-la pour un chiffre propre à ton produit. » | éditeur | `front/src/composants/editeurAliment.tsx` (`testID="rendement"`), `api/src/Service/RendementExplique.php::provenance` et `::explication` |
| **Le texte saisi vit à part du nombre** — on tape « 0,8 » sans que le séparateur disparaisse | éditeur | `texteDuNombre` et `frappeNumeriqueAcceptee` dans `front/src/calcul/saisieNombre.ts` ; les champs de l'éditeur gardent le texte tapé |
| **Corriger un aliment** — le sien | « Corriger les valeurs » | `front/src/composants/ligneFrigo.tsx:93-95`, `api/src/Entity/Aliment.php:53-56` |
| **Supprimer, mais seulement le sien** — le bouton n'apparaît que si `modifiable`, c'est-à-dire **si le compte tient son frigo en base** (`frigo.data?.source === 'base'`, `front/app/(onglets)/frigo.tsx:71`) ; « le sien » est garanti par l'API | « Supprimer » | `front/src/composants/ligneFrigo.tsx:98-102`, `api/src/Entity/Aliment.php:60-63` |
| **Refus de supprimer un aliment encore en stock**, comptage en SQL direct, hors du filtre de propriété, 409 nommant le nombre de lignes | API | `api/src/State/AlimentSuppressionProcessor.php:43-53` |
| **Un aliment appartient au compte qui le crée** — `utilisateur` vient du jeton, jamais du corps | API | `api/src/State/AlimentProcessor.php:38` (délègue à `ProprietaireProcessor`) |
| **Doublon de nom dans le compte rendu lisible** — 422 avec le nom en clair ; deux comptes peuvent nommer pareil | API | `api/src/State/AlimentProcessor.php:39-44`, index `aliment_nom_unique_par_compte` |
| **Tirer pour rafraîchir**, en mode Stock seulement | liste | `front/app/(onglets)/frigo.tsx:214-215` |

## Le parcours

**Compte requis** : ordinaire (`source_frigo = 'base'`). Un compte Grocy suit le
même écran mais une autre API — voir *Limites connues*.

**Données de départ** : `db/manuel/jeu-essai.sql` joué sur le compte jetable. Il
pose sept aliments du compte, valeurs CIQUAL du produit tel qu'on le pèse, plus
« Skyr d'essai (compte ordinaire) », répartis sur trois emplacements, avec des
quantités décimales, et **laisse deux aliments à zéro**
(`db/manuel/jeu-essai.sql`, bloc `UPDATE stock SET quantite = 0`).

### Consulter

1. Onglet **Mon frigo**. Le segment **Stock** est actif par défaut
   (`frigo.tsx:54`).
2. L'en-tête affiche « **N en stock sur M** » (`frigo.tsx:178`). Les sections se
   suivent : **FRIGO**, **CONGÉLATEUR**, **PLACARD**.
3. Taper **`poul`**, puis **`congelateur`** (sans accent) dans « Chercher un
   aliment ou un emplacement ». Sans résultat :
   « **Aucun aliment ne correspond à « xyz ».** » (`frigo.tsx:217-219`).
4. Toucher une ligne : elle se déplie sur les macros, les fibres si elles sont
   connues, et « **À la cuisson** — 100 g → 230 g » (`ligneFrigo.tsx:73-78`).

### Ajouter un aliment

5. **« Ajouter un aliment »** (`frigo.tsx:268`) : l'éditeur s'ouvre
   directement, titre **« Nouvel aliment »** (`editeurAlimentConnecte.tsx`, `titre`).
   L'écran demande une création (`setCreation(true)`, `frigo.tsx:265`) et
   l'éditeur ne reçoit alors aucun aliment (`editeurAlimentConnecte.tsx`, `aliment`) :
   tous les champs partent vides, les quatre macros comprises
   (`textesDe` dans `editeurAliment.tsx`).
6. **Nom** (placeholder « Skyr nature Milbona »), **Quantité déjà en stock
   (facultatif)** avec l'aide « Laisse vide si tu n'en as pas encore. L'aliment
   sera créé à zéro et se remplira au prochain inventaire. »
   (`editeurAliment.tsx`, champ « Quantité déjà en stock »).
7. **Catégorie** : huit puces — Protéine, Glucide, Légume, Fruit, Oléagineux,
    Matière grasse, Laitage, Autre (`CATEGORIES`, `nutrition.ts`).
8. **« Pour 100 g, d'après l'emballage »** : Calories, Protéines, Glucides,
    Lipides, texte indicatif **« à saisir »** dans les quatre
    (`editeurAliment.tsx`, constante `A_SAISIR`) — c'était « 0 »
    jusqu'au 17 septembre 2026, un gris clair qui se lisait comme un zéro saisi.
    Puis **Fibres (facultatif)**, placeholder « — »
    (`editeurAliment.tsx`, `champNombre('fibres100', …)`).
9. **« Changement de poids à la cuisson »** : cinq guides, ou
    **« Je préfère mesurer »** (`editeurAliment.tsx`).
10. **« Enregistrer »** (`editeurAliment.tsx`, `onEnregistrer`). La création part en deux
    temps : l'aliment, puis sa quantité **même à zéro** — c'est cet appel qui le
    rattache à un emplacement (`editeurAlimentConnecte.tsx`, `definir.mutate`).

### Corriger et supprimer

11. Déplier une ligne → **« Corriger les valeurs »** (`ligneFrigo.tsx:93-95`).
12. Déplier une ligne → **« Supprimer »** (`ligneFrigo.tsx:99-101`) →
    confirmation **« Supprimer « X » ? »** avec le message : « Il quittera
    définitivement ta liste d'aliments. La suppression est refusée s'il t'en
    reste en stock : mets sa quantité à zéro depuis l'inventaire d'abord. »
    (`frigo.tsx:337-344`).

## Critères d'acceptation

1. **Le groupement respecte l'ordre d'un inventaire réel.** Frigo, puis
   Congélateur, puis Placard, puis tout le reste par ordre alphabétique français,
   et les aliments triés par nom dans chaque section.
   *Preuve* : `front/src/calcul/frigo.ts:28-38` + copie d'écran.

2. **Le compteur d'en-tête ne compte que ce qui reste.** « N en stock sur M » :
   N = aliments à `stock > 0`, M = tous. Les deux lignes laissées à zéro par
   `jeu-essai.sql` comptent dans M et pas dans N (`frigo.tsx:96`, `:178`).

3. **La recherche trouve sans accents, sur le nom ET sur l'emplacement.**
   `congelateur` doit ramener les lignes du **Congélateur**. `filtrerFrigo`
   compare `sansAccent(nom)` **ou** `sansAccent(emplacement)`
   (`frigo.ts:52-53`). Une recherche vide rend tout (`frigo.ts:50`).

4. **Le détail dit le rendement en toutes lettres.** `ratio = 1` ⇒ « poids
   inchangé » ; sinon « 100 g → `round(ratio*100)` g »
   (`ligneFrigo.tsx:75-77`). **Refus** : la ligne « Fibres » **n'apparaît pas**
   quand `fibres100` est `null` ou `undefined` — vide n'est pas zéro
   (`ligneFrigo.tsx:70-72`).

5. **Un nom ne sert qu'une fois par compte.** Créer un second aliment du même
   nom, à la casse près, est refusé en **422** : « Tu as déjà un aliment nommé
   « X ». Choisis un autre nom, ou corrige celui qui existe. »
   (`AlimentProcessor.php:39-44`, index `aliment_nom_unique_par_compte`). Le
   même nom dans un **autre** compte passe.

6. **L'enregistrement est BLOQUÉ sur « incohérent ».** Depuis le 20 septembre
   2026, ce n'est plus l'écran qui décide : il envoie la saisie à
   `POST /api/verification/aliment` et lit `enregistrable`. Le serveur exige un
   nom non vide, les quatre macros lisibles, `kcal100 > 0`, une catégorie
   connue, un rendement possible pour cette catégorie, et un verdict qui ne
   soit pas `incoherent` (`api/src/Service/VerdictAliment.php`). Le verdict passe à `incoherent` au-delà de
   **30 %** d'écart (`ECART_FRANC = 0.3` dans `api/src/Service/ControleDesMacros.php`).
   **Et le refus se dit, il ne se devine pas — mais ce n'est plus l'écran qui
   l'écrit** (changé le 26 septembre 2026, feature
   `macros-editeur-vide-pas-zero`). Jusque-là l'écran rédigeait lui-même :
   « Renseigne les quatre valeurs — écris 0 si l'aliment n'en contient pas. »
   Ce texte a disparu de l'éditeur. Le serveur refuse la macro vide avec le
   message de `Aliment::MACRO_ABSENTE` (« Valeur manquante : écris 0 si
   l'aliment n'en contient pas. »), rattaché à son champ, et l'écran
   l'affiche en rouge **sous le champ concerné** (`testID="refus-<champ>"`, par
   exemple `refus-prot100`).
   **L'API refuse aussi, pour les clients qui ne passent pas par cet écran** :
   depuis le 17 septembre 2026, les quatre macros d'`Aliment` partent de
   `null` et `NotNull` refuse leur absence en **422** — « Valeur manquante :
   écris 0 si l'aliment n'en contient pas. » (`api/src/Entity/Aliment.php`, `MACRO_ABSENTE` et les quatre `NotNull`,
   `api/tests/Entity/AlimentMacrosObligatoiresTest.php`). Jusque-là,
   `POST /api/aliments` sans `lip100` répondait 201 et la base enregistrait
   `lip_100 = 0.00`.

7. **Vide ≠ zéro sur les fibres, et jusqu'en base.** Depuis le 26 septembre
   2026 (feature `macros-editeur-vide-pas-zero`), l'éditeur ne convertit plus
   rien : les fibres partent en **texte**, tel que tapé
   (`editeurAlimentConnecte.tsx`, `fibres100: v.fibres100`, de type `string`),
   et c'est le serveur qui lit — `NombreSaisi::estVide` pour le vide, qui reste
   « je ne sais pas » et non zéro. Jusqu'au 26 septembre, vider le champ posait
   `fibres100: null` côté écran. Colonne nullable côté API
   (`api/src/Entity/Aliment.php`, `$fibres100`). **Refus** : le bouton
   « Enregistrer » ne s'éteint que sur une macro **obligatoire VIDE** (contrôle
   léger voulu par le propriétaire, CA-5 amendé le 26 septembre 2026). Un texte
   illisible comme « 4,2,1 » **passe** le bouton, et c'est le serveur qui le
   refuse, sous le champ. Avant cette date (correctif du 15 septembre 2026),
   l'écran bloquait aussi l'illisible : il ne lit plus rien.

8. **Les kilojoules sont détectés de deux façons.** Plafond de **900 kcal/100 g**
   (`VerdictAliment::KCAL_MAX_100G`) **ou** rapport à **4,184** des macros
   (`VerdictAliment.php`, `CoherenceNutritionnelle.php`) — la tolérance
   annoncée jusqu'ici, « 10 % près », n'a pas été re-vérifiée. Le bouton
   propose la conversion chiffrée, que **le serveur calcule** (`conversion`
   dans le verdict ; `editeurAliment.tsx` l'affiche).

9. **Le rendement se mesure par deux pesées.** Le serveur le tire des deux
   pesées **brutes** que l'écran envoie, au centième
   (`api/src/Service/RendementExplique.php::depuisPesees`) ; `ratioDepuisPesees`,
   `provenanceRatio` et `expliquerRatio` ont quitté le front le 26 septembre
   2026 (feature `macros-editeur-vide-pas-zero`), et le `ratio` envoyé à côté
   est ignoré. Le bouton dit « Utiliser ce résultat
   (2,3) » et se désactive en « **Ces deux poids sont inversés : ce produit ne
   peut pas varier ainsi** » quand la mesure contredit la catégorie : un
   féculent ne pèse pas moins cuit que cru, une protéine ou un légume cuit ne
   dépasse pas 1,05 fois son poids cru. La règle est sur le SERVEUR depuis le
   20 septembre 2026 — `api/src/Service/RendementPlausible.php::sens`, servie
   par `POST /api/verification/aliment` ; l'écran affiche ce qui revient. **Refus** : l'éditeur n'appelle plus
   `nombreSaisi` ni `parseFloat` (garde `lectureAuServeur.test.ts`) — « 4,2,1 »
   ne produit aucun rendement, parce que le serveur le refuse et l'écran
   affiche ce refus **sous le champ de pesée**. Les deux champs de pesée
   étaient des `ChampNombre` du 26 septembre 2026 (feature
   `pesees-editeur-aliment-saisienombre`, bordure rouge calculée par l'écran) ;
   le même jour, `macros-editeur-vide-pas-zero` en a fait des textes tenus par
   l'éditeur, sans bordure locale : le refus et la phrase d'explication
   (`testID="rendement"`, « Rendement : inconnu » si le serveur ne répond pas)
   viennent du serveur.

10. **Un aliment créé appartient à son compte.** Après création, en base :
    `utilisateur_id = <le compte>`, **posé par l'API depuis le jeton** et
    jamais par le corps (`AlimentProcessor.php:38`, `ProprietaireProcessor`).

11. **Isolation entre comptes — la faille É1, et où le contrôle vit
    aujourd'hui.** On ne pose pas de stock sur l'aliment d'autrui. Le
    contrôle est au **point de passage obligé**, `FrigoBase::definirStock`, qui
    lève une exception avant toute écriture
    (`api/src/Service/FrigoBase.php:131-133`) ; la règle elle-même est
    `alimentsAccessibles`, « le mien »
    (`api/src/Service/FrigoBase.php:89-101`). Les deux routes qui écrivent du
    stock la posent aussi **en amont**, pour répondre tout de suite :
    `POST /mon-frigo/stock` (`FrigoController.php:125-128`, `:154-156`) et son
    jumeau `POST /mon-frigo/inventaire` (`FrigoController.php:417-424`).
    **Refus attendu : 404**, avec le **même message** que pour « n'existe pas »,
    pour ne pas laisser énumérer les identifiants
    (`FrigoController.php:151-156`). Derrière le code, la base refuse
    d'elle-même une ligne de stock posée sur l'aliment d'un autre compte : clé
    étrangère composite `stock_aliment_du_meme_compte_fkey`, (`aliment_id`,
    `utilisateur_id`) vers `aliment` (`db/01-schema.sql:188-190`, migration
    `db/manuel/35-stock-et-aliment-du-meme-compte.sql`).
    **Le stock ne s'écrit que par `/api/mon-frigo`** : `/api/stocks` n'expose
    plus que `GetCollection` et `Get` depuis le 17 septembre 2026
    (`api/src/Entity/Stock.php:29-37`, `StockEnLectureSeuleTest`) — ses
    `POST`/`PATCH`/`DELETE` contournaient `FrigoBase`. Et un `emplacementId`
    inconnu envoyé à `POST /mon-frigo/stock` est refusé en **422** « Cet
    emplacement n'existe pas. » au lieu d'un 500 SQL
    (`FrigoController.php:158-164`, `FrigoBase::emplacementExiste`,
    `EmplacementInconnuTest`).

12. **Corriger et supprimer : seulement le sien.** `Patch` et `Delete` sont
    gardés par `object.getUtilisateur() == user`
    (`api/src/Entity/Aliment.php:53-56`, `:60-63`), sans passe-droit
    administrateur ; `FiltreProprietaire` ne laisse de toute façon charger que
    les aliments du compte.

13. **Refus de supprimer un aliment encore en stock.** 409 : « Cet aliment est
    encore dans un frigo (N ligne(s) de stock). Mets sa quantité à zéro avant de
    le supprimer. » Le comptage passe en SQL direct, hors du filtre de propriété
    (`AlimentSuppressionProcessor.php:43-53`) ; depuis la clé composite de la
    migration 35, les seules lignes de stock qui puissent viser un aliment sont
    celles de son compte. **Les lignes à zéro, elles, sont
    supprimées silencieusement** (`:57-60`) : un aliment dont le stock est à 0
    se supprime.

14. **Le frigo ne montre que SES aliments.** La requête filtre
    `WHERE a.utilisateur_id = :utilisateur` (`api/src/Service/FrigoBase.php:40`),
    comme `/api/aliments` par `FiltreProprietaire`. Un compte neuf a un frigo
    vide : « Ton frigo est vide. Ajoute un aliment pour commencer. »
    (`frigo.tsx:219`).

15. **Zéro erreur JavaScript**, et aucune requête en échec non voulue.

## Comment l'éprouver

### Préparer

```bash
docker ps --format '{{.Names}}\t{{.Status}}'
curl -s http://localhost:8080/api/etat
"$(git rev-parse --show-toplevel)"/db/manuel/rattraper-dev.sh
```

Compte jetable selon `donnees-de-test`, puis le jeu d'essai **sur ce compte-là** :

```bash
DEPOT="$(git rev-parse --show-toplevel)"   # la racine du dépôt : son chemin change d'un poste à l'autre
COMPTE=frigo-verif@test.local
set -o pipefail   # sans lui, un fichier introuvable donne à psql une entrée vide, et psql sort 0
sed "s/essai@fitcarnet.local/$COMPTE/" "$DEPOT/db/manuel/jeu-essai.sql" \
  | docker exec -i fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -v ON_ERROR_STOP=1
```

**Relis l'adresse du `sed` avant Entrée.** Le script refuse un compte qui lit
Grocy (`RAISE EXCEPTION ... Ce jeu vise un compte ordinaire.`). Il finit par une
**requête de contrôle** qui donne les deux chiffres attendus — `aliments_a_moi`
et `en_stock` : **c'est d'elle qu'on tire le « N en stock
sur M » à vérifier à l'écran**, pas d'un chiffre écrit d'avance.

### Web

Le bundle doit être celui du code actuel (voir `epreuve-fonctionnalite`, §2).
Pour vérifier qu'un libellé y est, cherche un **texte affiché**, accents encodés
(`\xe9`).

### API — prouver ce qui arrive en base

```bash
JETON=$(curl -s -X POST http://localhost:8080/api/connexion \
  -H 'Content-Type: application/json' \
  -d '{"email":"frigo-verif@test.local","motDePasse":"MotDePasseTest123!"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

curl -s -H "Authorization: Bearer $JETON" http://localhost:8080/api/mon-frigo | head -c 600
```

**Le critère 10 (aliment du compte)** :

```sql
SELECT a.nom, u.email
  FROM aliment a JOIN utilisateur u ON u.id = a.utilisateur_id
 WHERE a.nom LIKE '%verif%';
-- attendu : chaque ligne porte l'adresse du compte qui l'a créée
```

**Le critère 11 (isolation, faille É1)** — deux comptes, `alice-verif@` et
`bob-verif@`. Alice crée son aliment **par l'API**. Puis Bob tente d'y poser du
stock :

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  http://localhost:8080/api/mon-frigo/stock \
  -H "Authorization: Bearer $JETON_BOB" -H 'Content-Type: application/json' \
  -d '{"alimentId":<id de l’aliment d’Alice>,"quantite":1}'
# attendu : 404
```

Puis vérifier qu'**aucune ligne n'a été écrite** :

```sql
SELECT count(*) FROM stock WHERE aliment_id = <id d'Alice>;  -- inchangé
```

Le même refus est couvert sans base par
`api/tests/Service/StockProprieteTest.php:32` et `:50`.

### Pièges propres à cette fonctionnalité

- **`api/front` est un doublon de `front/dist` qui périme en silence.** Un
  libellé corrigé qui « ne s'affiche pas » vient presque toujours de là.
- **La quantité ne se saisit qu'à la création.** Ailleurs elle passe par
  l'inventaire (`editeurAlimentConnecte.tsx`, `definir`, `poserQuantite`). Chercher un champ quantité
  sur une correction est une fausse piste.
- **L'éditeur ne se réinitialise plus pendant la saisie**, mais l'effet dépend de
  `visible` et de l'**identité** de l'aliment, pas de la référence de l'objet
  (`editeurAliment.tsx`, l'effet sur `visible`). Si une saisie s'efface toutes les deux
  secondes pendant un inventaire, c'est cette régression-là.
- **La suppression envoie `idDeLaReference(reference)`** (`front/src/calcul/frigo.ts`,
  appelé dans `frigo.tsx`, `supprimer.mutate`) — c'était un
  `Number(reference.split(':')[1])` écrit deux fois, réuni le 26 septembre 2026 :
  sur une référence `grocy:…` le bouton n'existe pas, c'est voulu.

### Nettoyer

Dans l'ordre de `donnees-de-test`. Supprimer le compte emporte ses aliments
(`aliment.utilisateur_id` est en `ON DELETE CASCADE`). Puis recompter et comparer aux chiffres relevés avant de commencer.

## La capture pour la démonstration

Reprend **la bobine 3** de `presentation/demonstration.md` (~3 min), découpée
en scénarios courts. Dossier :
`presentation/captures/frigo/` (ignoré par git).

| Fichier | Déroulé | Durée | Ce qu'on doit voir |
|---|---|---|---|
| `01-le-stock.webm` | onglet **Mon frigo**, défilé lent sur toute la liste | 25 s | le compteur « N en stock sur M », les sections **FRIGO / CONGÉLATEUR / PLACARD**, les macros pour 100 g |
| `02-le-detail-et-le-poids-cru.webm` | ouvrir un féculent au rendement ≠ 1 | 30 s | les macros, **« À la cuisson · 100 g → 230 g »**, la mention **poids sec** sur la ligne |
| `03-chercher.webm` | taper `poul`, effacer, taper `congelateur` **sans accent** | 15 s | la liste se réduit ; l'emplacement est trouvé sans son accent |
| `04-ajouter-un-aliment.webm` | **Ajouter un aliment** → l'éditeur vide → nom, huit catégories, macros, fibres laissées **vides** → **Enregistrer** | 40 s | les huit puces, le champ **Fibres (facultatif)** laissé vide et l'aide qui l'explique, la ligne qui apparaît dans sa section |
| `05-le-controle-bloque.webm` | saisir des macros incohérentes, montrer le bandeau rouge et le bouton **Enregistrer** éteint, puis corriger | 30 s | **le moment fort** : le verdict passe de rouge à vert et le bouton se rallume |
| `06-les-kilojoules.webm` | saisir `1473` en calories | 20 s | le bandeau et le bouton **« Convertir : 1473 kJ = 352 kcal »** |
| `07-mesurer-le-rendement.webm` | **Je préfère mesurer** → `100` / `230` | 25 s | **« Utiliser ce résultat (2,3) »**, puis « ✓ mesuré : 100 g avant cuisson → 230 g après » |
| `08-supprimer.webm` | supprimer l'aliment créé en 04 ; puis tenter d'en supprimer un **en stock** | 20 s | la confirmation, puis **le refus 409 nommant le nombre de lignes** |

**Un contexte Playwright par scénario**, sinon tout tombe dans une seule vidéo.
La frappe à 60 ms par caractère et les temps morts volontaires viennent de
`presentation/tournage/tourner.mjs`.

> **Remise à zéro entre deux prises** : rejouer `jeu-essai.sql` (idempotent — il
> remet les quantités et n'ajoute aucun doublon).

## Limites connues

- **Le frigo Grocy n'est pas éprouvable ici.** Il demande `GROCY_URL` et
  `GROCY_API_KEY` renseignés ; sinon l'écran affiche « Grocy n'est pas configuré
  côté serveur : renseigne GROCY_URL et GROCY_API_KEY. »
  (`api/src/Service/Frigo.php:45-48`). Sur Grocy, **la suppression est refusée et
  le nom n'est pas modifiable** (`ligneFrigo.tsx:96-102`,
  `editeurAlimentConnecte.tsx`, `nomModifiable`) — c'est l'impasse déjà notée en bobine 8 du
  plan de tournage.
- **Le contrôle de cohérence est un garde-fou, pas une garantie** : « un aliment
  sans macros et sous 900 kcal passera entre les mailles »
  (le plafond de 900 kcal est au serveur : `VerdictAliment::KCAL_MAX_100G`).
- **Les anomalies du serveur ne s'affichent pas dans cet écran.** Le
  refus des valeurs déjà cuites, du féculent qui rétrécit et des « plus de 100 g
  de nutriments dans 100 g » vit dans l'onglet **Repas**, au paramétrage
  (`api/src/Service/AnomaliesAliment.php`, affichage
  `front/src/composants/etapeReglage.tsx:483-523`). Ne pas le chercher ici.
- **`presentation/features.md` (section B) est périmé sur ses `fichier:ligne`.**
  Il cite `frigo.tsx:222`, `:635`, `:644`, `:658`, `:669`, `:702`, `:730` — or le
  fichier fait **392 lignes** (mesuré le 17 septembre 2026). Ces éléments vivent dans `ligneFrigo.tsx` et `alertesFrigo.tsx`. Ne pas
  recopier ses numéros.
- **`presentation/features.md` (section K) est faux sur deux points depuis le
  15 septembre 2026** : `front/src/calcul/texte.ts` **existe**
  (`sansAccent:57`, et `calcul/frigo.ts:11` l'importe), et
  `front/src/solveur/periode.ts` **existe** aussi
  (`planFige.ts:10` importe `lireLaCle`).
- **`front/src/composants/inventaire.tsx` n'existe plus** : la zone d'ombre K du
  14 septembre est réglée par suppression, pas par confirmation.
- Le chiffre « 6 en stock sur 8 » de la bobine 3.1 **suppose un compte neuf** :
  `jeu-essai.sql` pose huit aliments, skyr compris, et en laisse deux à zéro ;
  un compte qui a déjà ses propres aliments en affiche davantage. **Relever le
  chiffre réel** avec la requête de contrôle du script.
