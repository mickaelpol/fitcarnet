---
name: fonctionnalite-inventaire
description: Recompter tout le frigo d'un coup — saisie en écarts où un champ vide n'est pas un zéro, seuil d'arrondi, case « vérifié », bouton à libellé variable, réinitialiser, puis le dépôt en lot traité en tâche de fond avec suivi, reprise après coupure et échecs nommés. À charger avec `epreuve-fonctionnalite` pour éprouver et filmer l'onglet « Mon frigo », mode Inventaire.
---

# L'inventaire — recompter tout le frigo d'un coup

## Le besoin

Une fois par semaine, on pèse. Le stock théorique a dérivé : on a cuisiné sans
le dire, jeté un fond de paquet, rangé des courses.

L'utilisateur **ne veut pas ressaisir quarante aliments**. Il veut corriger les
trois qui ont bougé, et que les trente-sept autres restent **exactement** ce
qu'ils étaient. C'est toute la fonctionnalité : une saisie **en écarts**, où
une ligne qu'on n'a pas touchée n'est **pas** un zéro (règle 6).

Et une fois envoyé, l'inventaire ne doit plus dépendre de l'écran. Le 14 août
2026, PHP s'est arrêté à 30 s au milieu de quarante lignes pendant que Grocy
continuait d'appliquer : **frigo à moitié corrigé, et personne pour le dire**
(`api/src/Controller/FrigoController.php:334-341`). Une requête HTTP a une durée
maximale, un inventaire n'en a pas. Depuis, le dépôt répond tout de suite et un
travailleur de fond applique.

Cette fiche couvre le **mode Inventaire**. La consultation et les fiches
d'aliments sont dans `fonctionnalite-frigo` ; les deux partagent un seul écran
et une seule liste (`front/app/(onglets)/frigo.tsx:33-39`).

## Ce que l'application propose

| Capacité | Où | `fichier:ligne` |
|---|---|---|
| **Bascule Stock / Inventaire** sans changer la liste, son ordre ni son regroupement | en-tête | `front/app/(onglets)/frigo.tsx:153-173`, `:183-186` |
| **Champs préremplis avec le stock connu**, à la valeur **exacte** et non à son affichage arrondi | à l'entrée | `front/app/(onglets)/frigo.tsx:18-31` (`stocksInitiaux`) |
| **Saisie conservée d'une visite à l'autre** — revenir sur l'onglet ne rappelle plus le stock par-dessus un inventaire en cours | `entrerInventaire` | `front/app/(onglets)/frigo.tsx:127-141` |
| **Compteur d'en-tête** « **3/8 vérifiés · 2 écarts** » — 8 lignes sur un compte neuf chargé du jeu d'essai | en-tête | `front/app/(onglets)/frigo.tsx:179` |
| **Case « vérifié » par ligne**, purement visuelle, **jamais transmise** — barre le nom et atténue la carte | ligne | `front/src/composants/ligneFrigo.tsx:124-134`, `:139`, `:183-184` |
| **Écart signalé** — bordure vive et « **était 1 250 g** » sous le nom | ligne | `front/src/composants/ligneFrigo.tsx:123`, `:143-147` |
| **Saisie illisible bordée de rouge** — la ligne ne partira pas, et ça se voit | ligne | `front/src/composants/ligneFrigo.tsx:150-155` |
| **Une saisie vide n'est pas un zéro** | calcul | `front/src/calcul/frigo.ts:67-74`, `:82-83` |
| **Seuil d'arrondi 0,001** — en deçà, c'est l'affichage, pas la balance | calcul | `front/src/calcul/frigo.ts:65`, `:90` |
| **Les écarts se calculent sur TOUT le frigo**, pas sur ce que la recherche laisse voir | écran | `front/app/(onglets)/frigo.tsx:92-94` |
| **Bouton à libellé variable** — « Aucun écart à envoyer » / « Enregistrer 3 corrections » / « Envoi… » / « Inventaire en cours… » | pied | `front/app/(onglets)/frigo.tsx:308-314` |
| **Réinitialiser** — repart du stock connu et décoche tout | pied | `front/app/(onglets)/frigo.tsx:282-288` |
| **Le dépôt répond 202 immédiatement** | API | `api/src/Controller/FrigoController.php:350`, `:430-433` |
| **Un seul inventaire à la fois par compte** — index unique partiel, 409 | API + base | `api/src/Service/InventaireLots.php:87-95`, `db/01-schema.sql:594-596` |
| **Bannière « Tu peux quitter l'écran, ça continue tout seul »** avec le compteur venu du **serveur** | en-tête | `front/src/composants/alertesFrigo.tsx:81-88` |
| **Résultat affiché 15 minutes** — « Inventaire appliqué : 12 correction(s). » ou « … 2 refusée(s) — motif · motif » | en-tête | `front/src/composants/alertesFrigo.tsx:90-107`, borne `front/app/(onglets)/frigo.tsx:108-120` |
| **Sondage toutes les 2 s** tant que le lot tourne, **fenêtre non focalisée comprise** ; le frigo n'est relu qu'une fois, au passage à « terminé » | hook | `front/src/api/hooks/frigo.ts:220-224`, `:233`, `:240-265` |
| **Prise de lot exclusive** — `FOR UPDATE SKIP LOCKED` + jeton par travailleur | service | `api/src/Service/InventaireLots.php:108-143` |
| **Reprise exacte** — `traites` incrémenté après **chaque** ligne, la reprise repart de là | service | `api/src/Service/InventaireLots.php:154-160`, `api/src/Service/AppliqueInventaire.php:87`, `:101-117` |
| **Lot abandonné détecté par le SILENCE**, pas par l'ancienneté — plus de 2 min sans signe de vie | service | `api/src/Service/InventaireLots.php:50`, `:217-224` |
| **Échecs nommés ligne par ligne**, le lot continue ; une panne globale donne **un seul** motif | service | `api/src/Service/AppliqueInventaire.php:92-99`, `api/src/Service/InventaireLots.php:186-199` |
| **Deux modes de travailleur** — une passe puis sortie, ou `--boucle` | commande | `api/src/Command/TraiterInventaires.php:72-75`, `:162-164` |

## Le parcours

**Compte requis** : ordinaire. **Données de départ** : `db/manuel/jeu-essai.sql`
sur le compte jetable — il pose des quantités **décimales**
(`round(… + 0.5, 2)`), « un inventaire sur des multiples de 100 ne prouverait
rien de la saisie "0,8" ».

**Le travailleur de fond doit tourner** — sans lui le lot reste « en_attente »
et la bannière ne bouge jamais. Voir *Comment l'éprouver*.

1. Onglet **Mon frigo** → segment **Inventaire** (`frigo.tsx:163-172`).
   Les champs se préremplissent avec le stock connu, **sauf si une saisie est
   déjà en cours** (`frigo.tsx:135-138`).
2. L'en-tête passe à « **0/8 vérifiés · 0 écart** » (`frigo.tsx:179`) — huit
   lignes, celles que `jeu-essai.sql` pose sur un compte neuf ; un compte qui a
   déjà ses propres aliments en affiche davantage.
3. Corriger **trois lignes seulement**. Chaque écart fait apparaître la bordure
   vive et « **était 1 250 g** » (`ligneFrigo.tsx:143-147`), et le compteur monte
   à « **3 écarts** ».
4. Cocher la case d'une ligne : le nom se barre, la carte s'atténue, le compteur
   « vérifiés » monte (`ligneFrigo.tsx:124-134`). **Cette case ne part jamais au
   serveur.**
5. **« Réinitialiser »** repart du stock connu et décoche tout
   (`frigo.tsx:282-288`).
6. Le bouton d'envoi dit **« Enregistrer 3 corrections »**
   (`frigo.tsx:314`). Il est éteint s'il n'y a aucun écart, pendant l'envoi, et
   **tant qu'un inventaire tourne** (`frigo.tsx:305`).
7. Appuyer. La saisie est vidée et l'écran **revient au mode Stock**
   (`frigo.tsx:296-300`) — le serveur tient désormais la liste.
8. En haut : « **Inventaire en cours — 0 / 3 ligne(s). Tu peux quitter l'écran,
   ça continue tout seul.** » (`alertesFrigo.tsx:84-85`).
9. Changer d'onglet, revenir. La bannière est devenue « **Inventaire appliqué :
   3 correction(s).** » (`alertesFrigo.tsx:100`), et les quantités du mode Stock
   ont bougé.

## Critères d'acceptation

1. **Un champ vide n'est pas un zéro.** Vider entièrement la saisie d'une ligne,
   envoyer : **cette ligne n'est pas dans le lot**, et son stock ne bouge pas.
   `ecartsInventaire` fait `if (texte === '') continue` **avant** toute lecture
   numérique (`front/src/calcul/frigo.ts:82-83`). C'est le critère qui garde le
   frigo : le confondre avec zéro « viderait le frigo de tout ce qu'on n'a pas
   eu le temps de peser ».

2. **Une saisie illisible n'est pas envoyée, et ça se voit.** Taper `4,2,1` :
   le champ se borde de rouge (`ligneFrigo.tsx:154-155`) et la ligne est
   écartée — `nombreSaisi` rend `null` là où `parseFloat` rendait **4,2**
   (`front/src/calcul/frigo.ts:88-89`, `front/src/calcul/saisieNombre.ts:34-39`).
   **Un négatif est refusé de la même façon** (`saisieNombre.ts:39`).

3. **Le seuil d'arrondi est 0,001.** Une saisie qui ne diffère du stock que de
   moins de ce seuil **n'est pas un écart**
   (`front/src/calcul/frigo.ts:65`, `:90`). C'est pour cela que les champs sont
   préremplis avec la valeur **exacte** et non son affichage : préremplir
   « 1234,6 » pour un stock de 1234,56 créerait un écart de 0,04 sur une ligne
   que personne n'a touchée (`frigo.tsx:18-29`).

4. **La case « vérifié » ne part jamais au serveur.** Cocher dix lignes sans rien
   corriger laisse le bouton sur « **Aucun écart à envoyer** » et **désactivé**
   (`frigo.tsx:305`, `:312-313`). L'état `vus` n'apparaît dans aucun corps de
   requête (`frigo.tsx:59`, `:233-235`).

5. **Le libellé du bouton dit l'état réel**, dans cet ordre de priorité :
   « Inventaire en cours… » (un lot tourne, venu du **serveur**) › « Envoi… » ›
   « Aucun écart à envoyer » › « Enregistrer N correction(s) »
   (`frigo.tsx:308-314`). Le singulier/pluriel suit N.

6. **Les écarts portent sur tout le frigo, pas sur la recherche.** Saisir un
   écart, **puis** filtrer sur autre chose : le compteur d'écarts ne baisse pas
   et l'envoi emporte la ligne filtrée (`frigo.tsx:92-94`).

7. **Réinitialiser repart du stock connu ET décoche tout**
   (`frigo.tsx:284`).

8. **Le dépôt répond 202, avec l'identifiant et le total**, sans avoir touché au
   stock (`FrigoController.php:430-433`).

9. **Refus au dépôt** — chacun observable :
   - aucune ligne ⇒ **422** « Aucune ligne à envoyer. » (`:360-362`) ;
   - plus de **500** lignes ⇒ **422** « Inventaire trop gros : N lignes pour 500
     au maximum. » (`:48`, `:363-369`) ;
   - référence d'une autre source ⇒ **422** « Référence étrangère à ton frigo :
     … » (`:380-384`) ;
   - identifiant ≤ 0 **ou quantité négative** ⇒ **422** « Ligne invalide : … »
     (`:389-391`) ;
   - **deux lignes sur la même référence** ⇒ dédoublonnées, la dernière gagne,
     une seule part (`:371-394`) ;
   - un inventaire tourne déjà ⇒ **409** « Un inventaire est déjà en cours pour
     ce compte. Attends qu'il finisse. » (`InventaireLots.php:93-94`,
     `FrigoController.php:422-428`).

10. **Un seul inventaire à la fois, et c'est la BASE qui tranche.** L'index
    unique partiel `inventaire_lot_un_seul_actif` sur `(utilisateur_id)` où
    `statut IN ('en_attente','en_cours')` (`db/01-schema.sql:594-596`) ; le code
    n'interroge pas avant d'écrire, il **rattrape la violation**
    (`InventaireLots.php:87-95`) — lire d'abord se ferait doubler par le second
    appui, qui est exactement le cas à couvrir.

11. **Isolation entre comptes — la faille É1, et où le contrôle vit
    aujourd'hui.** `POST /mon-frigo/inventaire` est le **jumeau** de
    `POST /mon-frigo/stock` : il écrit du stock par un autre chemin, et ne posait
    aucune question de propriété. Bob déposait 1 g sur un aliment d'Alice,
    et **l'aliment d'Alice devenait indélébile**.
    Le contrôle vit désormais à **deux** endroits du code, et c'est voulu :
    - **au dépôt**, pour refuser tout de suite — « un refus rendu une heure plus
      tard n'a plus personne devant l'écran » (`FrigoController.php:396-420`) ;
    - **au point de passage obligé**, `FrigoBase::definirStock`, qui lève avant
      toute écriture quel que soit l'appelant
      (`api/src/Service/FrigoBase.php:131-133`).
    La règle elle-même n'existe qu'une fois : `alimentsAccessibles`, « le mien »
    (`api/src/Service/FrigoBase.php:89-101`). Et la base la garantit d'elle-même :
    la clé étrangère composite `stock_aliment_du_meme_compte_fkey` refuse toute
    ligne de stock posée sur l'aliment d'un autre compte
    (`db/01-schema.sql:188-190`, migration
    `db/manuel/35-stock-et-aliment-du-meme-compte.sql`).
    **Refus attendu : 404**, « Un aliment de cet inventaire n'existe pas dans ton
    catalogue. » — **sans nommer la ligne fautive**, pour ne pas rendre
    l'énumération confortable (`FrigoController.php:413-418`).
    Éprouvé sans base par `api/tests/Controller/InventaireProprieteTest.php:50`
    (refusé) et `:66` (son propre aliment passe).
    Le contrôle **ne s'applique qu'à la source `base`** : une référence `grocy:`
    désigne un produit que la table `aliment` ne connaît pas
    (`FrigoController.php:405-407`).

12. **Reprise exacte après coupure.** `traites` est incrémenté **après chaque
    ligne** (`AppliqueInventaire.php:101-117`), et la reprise repart de cet index
    via `array_slice($lignes, $faits)` (`:87`). Tuer le travailleur au milieu
    d'un lot puis le relancer doit reprendre **où il s'était arrêté**, pas au
    début.

13. **Un lot abandonné se détecte au silence.** `vu_le` est touché à chaque
    ligne ; au-delà de **2 minutes** sans signe de vie, le lot repasse
    « en_attente », `jeton` remis à `NULL`, **et `traites` est conservé**
    (`InventaireLots.php:50`, `:217-224`). Rejouer une ligne est bénin : poser
    une quantité absolue est idempotent.

14. **Un travailleur qui a perdu son lot s'arrête.** `avancer` rend faux quand le
    jeton n'est plus le sien ; le travailleur sort au lieu d'écraser
    l'avancement de son remplaçant et de clore le lot avec **sa** liste d'échecs
    (`AppliqueInventaire.php:103-117`). Éprouvé par
    `api/tests/Service/LotVolePendantLeTravailTest.php`.

15. **Un échec n'arrête pas les autres, et il est nommé.** Le lot continue, la
    ligne fautive part dans `echecs` avec sa référence et son motif
    (`AppliqueInventaire.php:92-99`), et la bannière les liste
    (`alertesFrigo.tsx:101-104`). **Le détail technique va au journal, pas au
    client** : le motif rendu est « Cette ligne n'a pas pu être appliquée. »
    (`AppliqueInventaire.php:209-215`, constat M-03) — un message DBAL nu
    dessinait la carte interne de la base.

16. **Une panne globale donne UN seul motif**, pas quarante lignes rouges :
    `echouer()` est distinct de `terminer()` avec des échecs
    (`InventaireLots.php:179-199`).

17. **Le suivi survit à la fermeture de l'application.** `GET
    /mon-frigo/inventaire/dernier` rend le dernier lot **quel que soit son
    état**, avec `fini_le` formaté en **ISO 8601 UTC par PostgreSQL** — le format
    natif est refusé par Safari et `Date.parse` y rendrait `NaN`
    (`InventaireLots.php:233-241`). Le résultat s'efface au bout de **15 minutes**
    (`frigo.tsx:108-120`).

18. **Le sondage s'arrête tout seul.** 2 000 ms tant que le statut est
    `en_attente` ou `en_cours`, `false` ensuite
    (`front/src/api/hooks/frigo.ts:220-224`) ; et il bat **même fenêtre non
    focalisée** (`:233`), sans quoi la notification ne partirait jamais. Le frigo
    n'est invalidé **qu'au passage** à « terminé », une seule fois (`:249-265`).

19. **Survie du travailleur** : compte supprimé entre le dépôt et le traitement
    ⇒ le lot échoue proprement sur « Le compte n'existe plus. »
    (`AppliqueInventaire.php:70-76`) ; `EntityManager` fermé ⇒ rouvert avec une
    trace (`:152-165`) ; Doctrine vidé entre deux lots (`:133`).

20. **Zéro erreur JavaScript**, et aucune requête en échec non voulue.

## Comment l'éprouver

### Préparer, et faire tourner le travailleur

Le mode Inventaire ne prouve rien sans lui : le lot resterait « en_attente ».

```bash
docker ps --format '{{.Names}}\t{{.Status}}'
curl -s http://localhost:8080/api/etat
"$(git rev-parse --show-toplevel)"/db/manuel/rattraper-dev.sh
```

```bash
DEPOT="$(git rev-parse --show-toplevel)"   # la racine du dépôt : son chemin change d'un poste à l'autre
COMPTE=inv-verif@test.local
set -o pipefail   # sans lui, un fichier introuvable donne à psql une entrée vide, et psql sort 0
sed "s/essai@fitcarnet.local/$COMPTE/" "$DEPOT/db/manuel/jeu-essai.sql" \
  | docker exec -i fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -v ON_ERROR_STOP=1
```

### Éprouver le traitement différé SANS attendre

C'est le point propre à cette fonctionnalité : **le travailleur se pilote à la
main**. Deux modes, et on choisit selon ce qu'on veut montrer.

**Mode « une passe puis sortie »** — pour voir le lot partir au moment qu'on
décide. C'est celui qui permet d'observer l'état « en_attente » **avant**
application, puis de le débloquer :

```bash
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/console app:inventaire:traiter'
# sortie attendue :
#   lot 12 — 3 ligne(s), source base
#     3 ligne(s) envoyee(s)
```

Il **vide la file puis sort** (`api/src/Command/TraiterInventaires.php:162-164`).
C'est aussi le mode du planificateur DSM, en filet.

**Mode continu** — pour filmer le parcours réel, où la bannière se met à jour
toute seule :

```bash
docker exec -d fitcarnet-app-dev sh -c 'cd /app && bin/console app:inventaire:traiter --boucle'
```

Il scrute toutes les **2 secondes** (`TraiterInventaires.php:50`) et fait le
ménage des lots abandonnés toutes les **30 boucles à vide**, soit une minute
(`:62`, `:166-169`).

### Lire le lot en base — la preuve, pas la bannière

```bash
docker exec -i fitcarnet-db-dev psql -U fitcarnet -d fitcarnet <<'SQL'
SELECT l.id, l.statut, l.total, l.traites, l.source,
       l.cree_le, l.commence_le, l.vu_le, l.fini_le,
       l.jeton IS NOT NULL AS pris_par_un_travailleur,
       jsonb_array_length(l.echecs) AS nb_echecs
  FROM inventaire_lot l
  JOIN utilisateur u ON u.id = l.utilisateur_id
 WHERE u.email = 'inv-verif@test.local'
 ORDER BY l.id DESC LIMIT 5;
SQL
```

Le contenu exact déposé, et les échecs ligne par ligne :

```sql
SELECT jsonb_pretty(lignes), jsonb_pretty(echecs)
  FROM inventaire_lot ORDER BY id DESC LIMIT 1;
```

**Vérifier le critère 1 (vide ≠ zéro) en base** : la ligne laissée vide **ne
doit pas figurer dans `lignes`**, et son stock doit être inchangé :

```sql
SELECT a.nom, s.quantite FROM stock s JOIN aliment a ON a.id = s.aliment_id
  JOIN utilisateur u ON u.id = s.utilisateur_id
 WHERE u.email = 'inv-verif@test.local' ORDER BY a.nom;
```

**Éprouver la reprise (critère 12)** sans attendre une vraie panne : déposer un
lot d'une dizaine de lignes, lancer le travailleur en boucle, le tuer en plein
travail, relever `traites`, puis le relancer et vérifier qu'il **repart de là**.

```bash
docker exec fitcarnet-app-dev sh -c 'pkill -f "inventaire:traiter"'
# relever traites, puis :
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/console app:inventaire:traiter'
```

**Éprouver la détection d'abandon (critère 13)** sans attendre deux minutes :
vieillir `vu_le` à la main sur un lot **créé par l'épreuve**, puis relancer le
travailleur, qui annonce « N inventaire(s) abandonne(s) remis en attente. »
(`TraiterInventaires.php:94-97`) :

```sql
UPDATE inventaire_lot SET vu_le = now() - INTERVAL '5 minutes'
 WHERE id = <l'id relevé ci-dessus> AND statut = 'en_cours';
```

> **N'écris jamais sur une donnée que tu n'as pas créée** : ce `UPDATE` ne vise
> qu'un `id` relevé dans le lot de ton compte jetable, jamais `WHERE statut =
> 'en_cours'` tout court.

**Éprouver le 409 (un seul à la fois)** : déposer deux inventaires de suite,
travailleur **arrêté**.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  http://localhost:8080/api/mon-frigo/inventaire \
  -H "Authorization: Bearer $JETON" -H 'Content-Type: application/json' \
  -d '{"lignes":[{"reference":"base:<id>","quantite":123}]}'
# premier : 202 — second : 409
```

**Éprouver l'isolation (critère 11)** : Bob dépose un inventaire visant
un aliment d'Alice.

```bash
curl -s -w '\n%{http_code}\n' -X POST \
  http://localhost:8080/api/mon-frigo/inventaire \
  -H "Authorization: Bearer $JETON_BOB" -H 'Content-Type: application/json' \
  -d '{"lignes":[{"reference":"base:<id de l’aliment d’Alice>","quantite":1}]}'
# attendu : 404, « Un aliment de cet inventaire n’existe pas dans ton catalogue. »
```

Puis prouver qu'**aucun lot n'a été déposé** et qu'**aucun stock n'a bougé** :

```sql
SELECT count(*) FROM inventaire_lot l JOIN utilisateur u ON u.id = l.utilisateur_id
 WHERE u.email = 'bob-verif@test.local';            -- 0
SELECT count(*) FROM stock WHERE aliment_id = <id d'Alice>;  -- inchangé
```

### Pièges propres à cette fonctionnalité

- **Sans travailleur, rien ne se passe et l'écran a raison** : la bannière dit
  « Inventaire en cours » indéfiniment. Vérifier `statut` en base avant de
  conclure à un bug du front.
- **Le bouton reste éteint tant qu'un lot tourne** (`frigo.tsx:305`). Après une
  épreuve interrompue, un lot resté « en_cours » bloque le bouton **et** le
  dépôt suivant (409) : le débloquer en lançant le travailleur, pas en
  supprimant la ligne.
- **Le résultat s'efface au bout de 15 minutes.** Une bannière absente ne veut
  pas dire que l'inventaire a échoué — relire le lot en base.
- **`contrainte inventaire_lot_avancement_coherent`** impose `total > 0` et
  `traites <= total` (`db/01-schema.sql:587-588`) : un lot fabriqué à la main
  hors de ces bornes est refusé par la base.
- **La permission de notification est demandée au moment de l'envoi**, pas au
  démarrage (`front/src/api/hooks/frigo.ts:181-189`). Sur le web elle ne
  s'affiche pas ; sur Android une boîte système peut décaler la capture.

### Nettoyer

`inventaire_lot` part en **CASCADE** avec le compte
(`db/01-schema.sql:568`) — mais le stock et les aliments, non. Ordre de
`donnees-de-test` : stock, puis aliments, puis compte. Puis recompter.

```sql
SELECT count(*) FROM inventaire_lot l
  LEFT JOIN utilisateur u ON u.id = l.utilisateur_id WHERE u.id IS NULL;  -- 0
```

Et **arrêter le travailleur** lancé par l'épreuve :

```bash
docker exec fitcarnet-app-dev sh -c 'pkill -f "inventaire:traiter"'
```

## La capture pour la démonstration

Reprend **la bobine 5**, plans 5.4 à 5.6, de `presentation/demonstration.md`.
Dossier : `presentation/captures/inventaire/`.

> **État de départ** : frigo garni, **aucun inventaire en cours**, et **le
> travailleur de fond en `--boucle`**.

| Fichier | Déroulé | Durée | Ce qu'on doit voir |
|---|---|---|---|
| `01-recompter.webm` | segment **Inventaire**, corriger **trois** lignes seulement, cocher deux cases | 40 s | le compteur « n/N vérifiés · 3 écarts », les bordures vives et « **était 1 250 g** », les noms barrés. **On ne touche pas aux autres lignes — c'est le message.** |
| `02-reinitialiser.webm` | **Réinitialiser**, puis ressaisir | 15 s | tout repart du stock connu, les cases se décochent |
| `03-vide-nest-pas-zero.webm` | vider entièrement un champ, envoyer, puis rouvrir le mode Stock | 25 s | **le moment fort** : la ligne vidée n'a **pas** été mise à zéro, son stock est intact |
| `04-l-envoi.webm` | **Enregistrer 3 corrections** | 30 s | l'écran rend la main **immédiatement** et revient au mode Stock ; la bannière « **Inventaire en cours — 0 / 3 ligne(s). Tu peux quitter l'écran, ça continue tout seul.** » |
| `05-on-quitte-on-revient.webm` | changer d'onglet, attendre, revenir | 30 s | « **Inventaire appliqué : 3 correction(s).** » et les quantités du mode Stock qui ont bougé |
| `06-un-echec-nomme.webm` | déposer un lot dont une ligne échouera, montrer la bannière | 20 s | « Inventaire appliqué : 2 correction(s), 1 refusée(s) — … » — le lot **continue** malgré l'échec |

Pour `06`, provoquer l'échec **sur une donnée créée par l'épreuve** (supprimer
l'aliment visé entre le dépôt et le traitement, travailleur arrêté), jamais sur
une donnée réelle.

**Ne pas accélérer la vidéo entre 04 et 05** : c'est précisément l'attente qui se
démontre. Si le travailleur va trop vite pour qu'on voie la bannière « en
cours », le lancer en mode **une passe** au moment voulu plutôt que de
tronquer la prise.

> **Remise à zéro** : rejouer `jeu-essai.sql`, et vérifier qu'aucun lot ne reste
> en `en_cours`.

## Limites connues

- **La branche Grocy n'est pas éprouvable sans instance configurée.** C'est elle
  qui justifie toute l'architecture différée — « cinq ouvriers PHP et une base
  SQLite qui n'accepte qu'un écrivain », d'où **une ligne à la fois**
  (`api/src/Service/AppliqueInventaire.php:16-25`). Sur la source `base`, le
  traitement est quasi instantané : **le différé se démontre, mais sa nécessité
  ne se ressent pas.** Le dire en commentaire de la démonstration.
- **« Déjà à jour » n'est pas un échec** — détecté au texte de Grocy et rendu
  `null` (`api/src/Service/FrigoGrocy.php`). Non vérifiable ici, faute
  d'instance.
- **Les notifications de fin d'inventaire ne partent pas depuis Expo Go** : il
  faut l'APK (voir `verification-android`). Sur le web, le hook les demande sans
  effet visible.
- **`presentation/features.md` (section C) est périmé sur ses `fichier:ligne`** :
  il cite `frigo.tsx:730`, `:749`, `:423`, `:416`, `:118`, `:127` et
  `api/hooks.ts:460` — or `frigo.tsx` fait **392 lignes** (mesuré le
  17 septembre 2026), et `front/src/api/hooks.ts` **n'existe plus** : les hooks
  sont éclatés dans `front/src/api/hooks/` (ici `frigo.ts`). Ne pas recopier ses
  numéros.
- **Le plafond de 500 lignes ne protège plus d'une minuterie** et son ancienne
  justification était fausse : il ne sert qu'à refuser l'absurde
  (`api/src/Controller/FrigoController.php:32-48`). Ne pas le présenter comme une
  limite de performance.
- **`stocksInitiaux` vit dans l'écran et non dans `src/calcul/frigo.ts`**, à côté
  de `ecartsInventaire` dont il est le pendant : **un test posé là ne serait
  jamais exécuté**, `tsconfig.tests.json` ne couvrant que `src/`
  (`front/app/(onglets)/frigo.tsx:18-29`). Toute épreuve de son comportement
  passe donc par l'écran, pas par un test unitaire.
