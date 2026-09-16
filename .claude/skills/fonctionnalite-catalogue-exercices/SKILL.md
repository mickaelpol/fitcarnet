---
name: fonctionnalite-catalogue-exercices
description: Trouver un exercice et savoir l'exécuter — catalogue commun d'environ 1338 entrées, recherche français/anglais sans accents, vignettes de muscles, fiche détaillée avec vidéo YouTube, chargement progressif, aucune suppression possible. À charger avec `epreuve-fonctionnalite` pour éprouver et filmer le catalogue.
---

# Le catalogue d'exercices

> Toutes les affirmations de cette fiche ont été vérifiées dans le code le
> **16 septembre 2026**, avec leur `fichier:ligne`. Les libellés sont recopiés
> du code. Ce qui n'a pas pu être vérifié est écrit comme tel.

## Le besoin

Au milieu d'une séance, on veut deux choses : **trouver** l'exercice qu'on
s'apprête à faire — sans connaître son nom anglais, sans savoir l'orthographier,
parfois sans savoir comment l'application le nomme — et **savoir l'exécuter** :
une vidéo, le muscle visé, le matériel, le format prescrit.

Le catalogue est **commun à tous les comptes** : c'est le même vocabulaire pour
tout le monde, c'est ce qui rend l'historique et les 1RM comparables dans le
temps. D'où la contrainte qui structure tout le reste : **on n'y supprime
jamais rien.**

## Ce que l'application propose

| Capacité | Où | `fichier:ligne` |
|---|---|---|
| Catalogue commun, **~1338 exercices** | référentiel | `api/src/Entity/Exercice.php:37` · `front/src/api/hooks/referentiels.ts:39` |
| Chargé d'un coup, gardé **30 minutes** | `useExercices` | `front/src/api/hooks/referentiels.ts:15,24-31` |
| **Liste allégée, fiche à la demande** | groupes `exercice:lire` / `exercice:detail` | `api/src/Entity/Exercice.php:214-265` |
| Recherche **sans accents**, sur le nom affiché | modale de choix | `front/src/composants/choixAliment.tsx:51,59` |
| Recherche **français ET anglais** | écran d'administration | `front/src/muscles/catalogueExercices.ts:118-126` |
| Filtres API : `nom`, `nomFr` (partiel) · `partieCorps`, `equipement`, `source` (exact) | `SearchFilter` | `api/src/Entity/Exercice.php:142-145` |
| **Quinze vignettes de muscles**, dont « Autre » | rangée déroulante | `front/src/composants/choixMuscle.tsx:108-135` · `front/src/muscles/groupes.ts:37-63,78` |
| Vignette **et** mot se cumulent | modale de choix | `front/src/composants/choixAliment.tsx:50-61` |
| Fiche détaillée : vidéo, zone, muscle ciblé, aussi sollicités, matériel, format, exécution | « Comment faire cet exercice » | `front/src/composants/modaleExercice.tsx:199-239` |
| **Chargement progressif** de la fiche | `detail.data ?? exercice` | `front/src/composants/modaleExercice.tsx:126-141` |
| Vidéo YouTube intégrée (iframe web / WebView mobile) | fiche | `front/src/composants/modaleExercice.tsx:156-190` |
| **Aucune suppression possible** | pas d'opération `Delete` | `api/src/Entity/Exercice.php:49-104` · `db/01-schema.sql:295,334` |
| Correction : l'administrateur, **ou l'auteur de l'exercice** | `Patch` | `api/src/Entity/Exercice.php:94-103` |
| Création : **administrateur seulement** | `Post` | `api/src/Entity/Exercice.php:79` |

### Qui peut créer, qui peut corriger — l'état réel

**La création est réservée à l'administrateur depuis le 15 septembre 2026.**
Vérifié : `api/src/Entity/Exercice.php:79` porte
`new Post(security: "is_granted('ROLE_ADMIN')", processor: ExerciceProcessor::class)`.
L'opération portait auparavant `ROLE_USER`, et **aucun écran de l'application ne
l'appelait** — zéro appelant dans `front/`. Une porte ouverte sans usage n'est
pas une fonctionnalité en attente, c'est une surface à défendre pour rien
(`:60-78`). Ce n'était pas une fuite : `ExerciceProcessor` posait déjà `creePar`
et `public = false`.

**Deux conséquences qu'il faut dire telles quelles :**

1. **Aucun écran ne crée d'exercice, même pour l'administrateur.**
   `front/src/api/hooks/referentiels.ts` n'expose que `useExercices` (`:24`),
   `useExerciceDetail` (`:45`), `useMajExercice` (`:63`) et `useFusionExercices`
   (`:82`) — **pas de hook de création**. Le catalogue est alimenté par l'import
   et par la base, pas par l'interface.
2. **Même par l'API, un exercice créé est PRIVÉ.** `ExerciceProcessor` pose
   `public = false` sur tout `Post` (`api/src/State/ExerciceProcessor.php:61-67`),
   et `public` n'a **aucun groupe de sérialisation**
   (`api/src/Entity/Exercice.php:280-281`) : rien dans l'API ne peut le
   rebasculer à `true`. **Le catalogue commun n'a aujourd'hui aucun moyen d'être
   alimenté par l'API** — c'est écrit noir sur blanc en `:74-78`, « en suspens,
   et c'est volontaire ».

**La correction, elle, est ouverte à l'auteur** :
`security: "is_granted('ROLE_ADMIN') or object.getCreePar() == user"` (`:101`,
constat F-09). Sans cette clause, un exercice personnel devenu vraiment privé
n'aurait plus été corrigeable par personne — ni l'auteur, faute de droit, ni
l'administrateur, `FiltreExercice` étant une extension Doctrine qui ignore les
rôles.

**Aucune suppression, et c'est le schéma qui tient la promesse** :
`modele_exercice.exercice_id` et `seance_exercice.exercice_id` sont en
`ON DELETE RESTRICT` (`db/01-schema.sql:295,334`). Supprimer effacerait
l'historique et les 1RM. La sortie prévue est la **fusion**, qui reporte
l'historique avant de supprimer — voir `fonctionnalite-administration`.

## Le parcours

**Compte requis** : ordinaire (la consultation ne demande aucun droit
particulier). **Données de départ** : le catalogue importé, présent par défaut.

1. Dans une séance ou un modèle, **« + Ajouter un exercice »** ouvre la modale
   titrée « **Ajouter un exercice** » (`front/app/modele/[id].tsx:292`).
2. **Les vignettes d'abord, le champ ensuite** — et c'est délibéré : la vignette
   dégrossit 1338 exercices à cent cinquante, le mot trouve le bon parmi eux. Le
   champ « **Rechercher…** » n'apparaît qu'**une fois un muscle choisi**
   (`front/src/composants/choixAliment.tsx:70-99`).
3. Quinze vignettes défilent horizontalement : Pectoraux, Dos, Épaules, Biceps,
   Triceps, Avant-bras, Abdominaux, Trapèzes, Lombaires, Fessiers, Quadriceps,
   Ischios, Mollets, Adducteurs (`front/src/muscles/groupes.ts:37-63`) et
   « **Autre** » (`:78`), sans dessin — pour le cardio, les muscles non couverts
   et **les exercices dont le muscle n'a jamais été renseigné**
   (`front/src/composants/choixMuscle.tsx:119-135`).
4. **Un seul groupe à la fois** : le second appui remplace le premier, le même
   appui deux fois enlève le filtre (`:83`). Changer de muscle **efface le mot
   cherché** (`front/src/composants/choixAliment.tsx:84-89`).
5. Liste vide, le message nomme les deux critères :
   « **Aucun exercice pour ce muscle avec ce mot.** » ou « **Aucun résultat.** »
   (`:110-118`).
6. Dans une séance, le rond « **i** » — libellé d'accessibilité
   « **Comment faire cet exercice** » — ouvre la fiche
   (`front/src/composants/exerciceSeance.tsx:131`).
7. La fiche affiche le nom français en titre, le nom d'origine en dessous s'il
   diffère (`front/src/composants/modaleExercice.tsx:150-153`), puis la vidéo ou
   « **Aucune vidéo pour cet exercice.** » (`:191-197`), puis les lignes :
   « **Zone** », « **Muscle ciblé** », « **Aussi sollicités** », « **Matériel**
   », « **Format prescrit** » (`:210-230`), enfin la section
   « **EXÉCUTION** » (`:236`). Bouton « **Fermer** » (`:242-244`).

**Ce qui n'est pas traduit s'affiche en anglais** — donc se voit, et se corrige
(`:200-209`). La base garde le vocabulaire du catalogue importé (`upper legs`,
`hip flexors`) pour qu'un prochain import n'ait pas à se battre avec nos
libellés ; le français ne vit que du côté de l'écran.

## Critères d'acceptation

1. **Le catalogue arrive en entier** — `GET /api/exercices?itemsPerPage=2000`
   (`front/src/api/hooks/referentiels.ts:29`) rend l'ensemble. Côté serveur,
   `paginationItemsPerPage: 1500` (`api/src/Entity/Exercice.php:115`). Compter
   les entrées rendues et **les comparer au compte en base**.
2. **La liste est allégée** — la réponse de collection ne doit contenir **ni**
   `instructions`, **ni** `equipement`, **ni** `musclesSecondaires`. Elle doit
   en revanche contenir `muscleCible` : c'est l'exception mesurée qui permet de
   filtrer par vignette **sans réseau** (`api/src/Entity/Exercice.php:231-250`).
3. **La fiche complète arrive à la demande** — `GET /api/exercices/{id}` rend en
   plus les quatre champs ci-dessus (`:59`).
4. **Chargement progressif** — à l'ouverture de la fiche, le nom, la zone et le
   format s'affichent **immédiatement** depuis la liste déjà en mémoire ; les
   textes longs se remplissent ensuite, **sans écran d'attente**
   (`front/src/composants/modaleExercice.tsx:138-141`).
5. **Recherche sans accents, dans les deux sens** — « developpe » doit trouver
   « Développé couché » ; « bench » doit trouver l'entrée importée. La recherche
   passe par le module de référence `sansAccent`
   (`front/src/calcul/texte.ts`), jamais par une copie locale.
6. **Vignette + mot se cumulent** — choisir « Dos » puis taper « traction »
   cherche parmi les exercices du dos, pas parmi les 1338
   (`front/src/composants/choixAliment.tsx:53-60`).
7. **Un exercice sans muscle reste atteignable** — il doit sortir sous
   « Autre », jamais disparaître. `muscle: e.muscleCible ?? null` est ce qui le
   garantit (`front/app/modele/[id].tsx:69`).
8. **Le filtre ne survit pas à la fermeture** — rouvrir la modale la rend
   entière, sans filtre résiduel (`front/src/composants/choixAliment.tsx:44`).
9. **Vidéo** — une URL YouTube de n'importe quelle forme (`watch?v=`, `youtu.be`,
   `/embed/`, `/shorts/`) doit être reconnue
   (`front/src/composants/modaleExercice.tsx:12-23`). Sans vidéo, le cadre
   affiche « Aucune vidéo pour cet exercice. » — **jamais un lecteur vide**.
10. **Aucune suppression possible** — `DELETE /api/exercices/{id}` doit répondre
    **405** (opération non déclarée) et **non** 403 ou 204. Aucune opération
    `Delete` n'existe sur la ressource (`api/src/Entity/Exercice.php:49-104`).
11. **Création refusée à un compte ordinaire** — `POST /api/exercices` avec un
    jeton ordinaire doit rendre **403** (`:79`).
12. **Création par l'administrateur : possible par l'API, invisible dans
    l'application** — aucun écran ne l'appelle, et l'exercice créé naît
    **privé** (`public = false`, `api/src/State/ExerciceProcessor.php:61-67`) :
    il n'apparaît **pas** dans le catalogue des autres comptes.
13. **Correction par l'auteur** — le créateur d'un exercice doit pouvoir le
    corriger (200) ; un troisième compte doit être refusé
    (`api/src/Entity/Exercice.php:101`). Déjà figé par
    `ModeleExposeTest::testUnAuteurPeutCorrigerCeQuIlACree`.
14. **Isolation entre comptes** — `FiltreExercice` applique « public **OU** le
    mien » : un exercice privé du compte A ne doit **jamais** apparaître dans le
    catalogue du compte B, ni en collection ni en élément seul. Déjà couvert
    par `api/tests/Doctrine/FiltreExerciceTest.php`
    (`testUnExercicePriveDUnAutreCompteNeRemontePas`,
    `testLaRestrictionVautAUSSIPourUnElementSeul`,
    `testLeORResteUnBlocFaceAUneRechercheAjouteeEnsuite`).
15. **Un PATCH ne s'approprie pas un exercice commun** — corriger une entrée du
    catalogue ne doit pas y poser `creePar`, ce qui la ferait disparaître pour
    tout le monde. C'est le constat M-01, figé par
    `ExerciceProcessorTest::testCorrigerUnExerciceDuCatalogueCommunNeSeLApproprie`.
16. **Deux exercices ne peuvent pas porter le même nom** — un `POST` sur un nom
    existant doit rendre **422 « Un exercice porte déjà ce nom. »**, et non une
    erreur de contrainte SQL brute (`api/src/Entity/Exercice.php:45-48`).
17. **Refus du démesuré** — les plafonds de longueur sont mesurés sur les
    données réelles (`:150-163`) : nom 150, nomFr 150, instructions 4000,
    musclesSecondaires 255, vidéo 500. Un dépassement doit rendre 422 en
    **désignant le champ**. Déjà figé par
    `api/tests/Entity/BornesDuCatalogueCommunTest.php`.
18. **Pas de cache HTTP sur ce catalogue** — la réponse ne doit porter ni
    `max-age` ni `shared-max-age` : entre deux caches, on garde celui qu'on peut
    invalider (`:116-140`). Une correction faite par l'administrateur doit être
    visible au rafraîchissement suivant, pas une heure plus tard.

## Comment l'éprouver

```bash
# 1. combien d'exercices, vraiment — le chiffre de la fiche est un commentaire
docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -Atc \
  "SELECT count(*), count(*) FILTER (WHERE source='import'),
          count(*) FILTER (WHERE public), count(*) FILTER (WHERE video_url IS NOT NULL)
     FROM exercice;"

# 2. la liste est-elle allégée ? (aucun des trois champs ne doit sortir)
curl -s 'http://localhost:8080/api/exercices?itemsPerPage=2' \
  -H "Authorization: Bearer $JETON" | grep -c 'instructions\|equipement\|musclesSecondaires'
# attendu : 0

# 3. la fiche, elle, les porte
curl -s http://localhost:8080/api/exercices/1 -H "Authorization: Bearer $JETON" | head -40

# 4. LES REFUS
curl -s -o /dev/null -w 'DELETE %{http_code}\n' -X DELETE \
  http://localhost:8080/api/exercices/1 -H "Authorization: Bearer $JETON"      # 405
curl -s -o /dev/null -w 'POST ordinaire %{http_code}\n' -X POST \
  http://localhost:8080/api/exercices -H "Authorization: Bearer $JETON_ORDINAIRE" \
  -H 'Content-Type: application/ld+json' -d '{"nom":"Essai verif"}'            # 403

# 5. pas de cache HTTP
curl -sI 'http://localhost:8080/api/exercices?itemsPerPage=1' \
  -H "Authorization: Bearer $JETON" | grep -i 'cache-control'
```

**Isolation, avec deux comptes jetables** (skill `donnees-de-test`) : créer un
exercice privé pour A **par l'API en compte administrateur**, puis vérifier
qu'il n'apparaît pas pour B.

```sql
-- ce qui est privé, et à qui
SELECT id, nom, source, public, cree_par FROM exercice WHERE public = false;
```

**Pièges propres à cette fonctionnalité**

- **Le chiffre 1338 est un commentaire, pas une mesure du jour.** Il apparaît
  dans `api/src/Entity/Exercice.php:37`, `front/src/api/hooks/referentiels.ts:39`
  et `front/src/muscles/editionExercice.ts:44` (qui parle, lui, de **1318
  importés**). **Recompter en base** avant de l'annoncer à l'écran ou dans une
  narration — règle 7.
- **Le champ de recherche n'apparaît qu'après le choix d'un muscle** pour les
  exercices. Chercher le champ tout de suite et conclure qu'il manque est une
  erreur d'épreuve, pas un défaut (`front/src/composants/choixAliment.tsx:93`).
- **La liste compare sur le nom AFFICHÉ** (`nomFr ?? nom`,
  `front/app/modele/[id].tsx:64`) : chercher le nom anglais d'un exercice
  traduit ne le trouve **pas** dans cette modale. La recherche sur les deux noms
  n'existe que dans l'écran d'administration
  (`front/src/muscles/catalogueExercices.ts:125`) et dans les filtres de l'API.
  Ne pas confondre les trois.
- Sur mobile, la vidéo passe par une **WebView avec une page porteuse** et une
  `baseUrl` : sans origine, YouTube rend « Erreur 153 » sur fond gris
  (`front/src/composants/modaleExercice.tsx:28-110`). L'écran noir au retour du
  plein écran a son propre correctif (`:77-108`) — à éprouver **sur Android**,
  pas sur le web.
- 33 Ko : c'est ce que pèse `muscleCible` sur les 1338 entrées, et ce qu'il
  achète est un filtrage **instantané, hors réseau, dans une salle sans
  couverture** (`api/src/Entity/Exercice.php:236-248`). Éprouver le filtre en
  coupant le réseau après le premier chargement.

## La capture pour la démonstration

`presentation/captures/catalogue-exercices/` — cette fonctionnalité n'a **pas**
de bobine propre dans `presentation/demonstration.md` : elle se voit dans la
**bobine 7** (« On s'entraîne ») côté utilisateur, et dans la **bobine 8.1**
côté administrateur. Les scénarios ci-dessous sont donc à tourner en compte
**ordinaire**.

| Fichier | Déroulé | Durée | Ce qu'on doit voir |
|---|---|---|---|
| `01-trouver.webm` | « + Ajouter un exercice » → vignette **Dos** → taper « traction » | 35 s | la rangée de silhouettes, puis la liste qui se réduit ; **le champ n'apparaît qu'après la vignette** |
| `02-fiche.webm` | rond « i » sur un exercice → la fiche | 45 s | la vidéo qui se lance, puis Zone / Muscle ciblé / Aussi sollicités / Matériel / Format prescrit / Exécution |
| `03-sans-video.webm` | ouvrir la fiche d'un exercice sans vidéo | 10 s | « Aucune vidéo pour cet exercice. » — l'application dit ce qu'elle n'a pas |

**Ce qu'on ne filme pas** : la création d'un exercice. **Aucun écran ne la
propose**, à aucun compte (voir plus haut). La bobine 8.2 du plan de tournage
(« crée un exercice, enregistre ») **n'est pas tournable en l'état** — le
signaler à l'auteur du plan plutôt que de mettre en scène un geste impossible.

## Limites connues

- **Le nombre d'exercices n'a pas été recompté en base** pour cette fiche : les
  chiffres 1338 et 1318 viennent des commentaires du code. À vérifier avant
  toute annonce chiffrée.
- **La création d'un exercice n'existe dans aucun écran**, pour aucun compte —
  et un exercice créé par l'API naît privé, sans moyen de rejoindre le catalogue
  commun (`api/src/Entity/Exercice.php:74-78`). Publier demanderait d'exposer
  `public` en écriture, **ce qui n'est pas tranché**.
- `presentation/features.md` (section G, datée du 14 septembre) affirme
  « **Tout utilisateur peut ajouter un exercice** » : **c'est faux depuis le
  15 septembre 2026**. Ses renvois `Exercice.php:48`, `:59`, `:62`, `:96`
  tombent par ailleurs à côté du contenu annoncé.
- **Non éprouvé ici** : la lecture de la vidéo sur un vrai téléphone (WebView,
  plein écran, retour) — passer par `verification-android`. Expo Go et un APK ne
  se comportent pas pareil sur ce point.
- **Non éprouvé ici** : le comportement hors ligne réel du filtrage par
  vignette après purge du cache disque.
