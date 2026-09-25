---
titre: B4 — le serveur décide ce qu'il enregistre des habitudes de cuisson
slug: habitudes-cuisson-au-serveur
phase: done
cree_le: 2026-09-25
brainstorm: aucun — le cadrage est l'inventaire du 21 septembre 2026, dans REPRENDRE.md § 3 (B4) et docs/plan-serveur-autoritaire.md § palier 2
---

# B4 — le serveur décide ce qu'il enregistre des habitudes de cuisson

Palier B de la refonte serveur autoritaire. **Le récit du chantier reste dans
[REPRENDRE.md](../../REPRENDRE.md) § 3** ; cette fiche ne porte que les critères
de CE morceau. Le besoin utilisateur, lui, est déjà écrit dans la skill
`fonctionnalite-batch-cooking` : on y renvoie, on ne le recopie pas.

## Pourquoi

« Ce qui est pré-rempli est ce que tu as fait la dernière fois. » Cette règle est
aujourd'hui jugée **deux fois** : `habitudesAEcrire`
(`front/src/calcul/habitudesCuisson.ts:126`) décide au front quelle décision
gagne et laquelle ne vaut pas la peine d'être écrite, et `LotDHabitudes::depuis`
(`api/src/Service/LotDHabitudes.php:101`) re-dédoublonne côté serveur avec la même
règle — « la dernière gagne » — pour une autre raison (PostgreSQL refuse un
`ON CONFLICT` dont le lot porte deux fois la même clé).

C'est le cinquième double juge du projet, et il n'était pas dans la liste.

**Et il produit déjà un défaut mesurable.** `usePlanCalcule.ts:133` passe
`mesCuissons.data ?? {}` comme « ce qui est déjà connu ». Quand la requête n'a
pas répondu — hors ligne, `fetchStatus: 'paused'`, `data: undefined` — le front
croit ne rien connaître et déclare **toute** cuisson du plan comme nouvelle : une
trentaine de lignes réécrites et autant de `maj_le` repoussés sans raison,
exactement ce que le commentaire de `habitudesAEcrire` dit vouloir éviter.

## Comportement

Au passage à l'étape « Cuisiner », l'écran envoie au serveur les cuissons
effectives du plan — ce qu'il affiche, habitudes comprises — sans juger ce qui a
changé. Le serveur retient la dernière décision de chaque aliment, la compare à
ce qu'il a en base, et **n'écrit que les écarts**. Il répond combien de lignes
ont réellement bougé.

Pour l'utilisateur, rien ne change à l'écran : c'est le sens de la contrainte du
propriétaire, « je veux la même application qu'au départ mais avec le serveur
autoritaire ». L'échec reste silencieux — une habitude perdue coûte un appui la
semaine prochaine, interrompre quelqu'un qui va cuisiner coûte plus cher.

## Critères d'acceptation

- **CA-1** ✅ *(vert le 25/09/2026)* — *Étant donné* le dépôt entier, *quand* on cherche une comparaison
  entre une cuisson choisie et une habitude connue dans `front/src` ou
  `front/app`, *alors* il n'y en a aucune : `habitudesAEcrire` n'existe plus, et
  un garde du front le refuse à l'avenir (sur le modèle de
  `coherenceCibleUnique.test.ts`). Le garde porte un cas témoin qui prouve qu'il
  peut tomber.
- **CA-2** ✅ *(prouvé contre une vraie base le 25/09/2026 — `e2e/epreuves/habitudesCuisson.spec.ts`, `maj_le` comparé en epoch avant/après)* — *Étant donné* un compte dont « riz basmati » est déjà enregistré au
  mode 2, *quand* `PUT /api/mes-cuissons` reçoit `{"habitudes":[{"aliment":"riz
  basmati","mode":2}]}`, *alors* la réponse est `{"enregistrees":0}` et le
  `maj_le` de la ligne est **inchangé**.
- **CA-3** ✅ *(prouvé en e2e le 25/09/2026)* — *Étant donné* le même compte, *quand* l'envoi porte `"mode":5` (un
  mode qui existe), *alors* la réponse est `{"enregistrees":1}`, la ligne vaut 5
  et son `maj_le` a bougé.
- **CA-4** ✅ *(prouvé en e2e le 25/09/2026, dans les DEUX sens : `null` → entier et entier → `null`, ce que `IS DISTINCT FROM` ajoute à `<>`)* — *Étant donné* un aliment dont ce compte n'a jamais rien décidé,
  *quand* l'envoi porte `"mode":null`, *alors* la réponse est
  `{"enregistrees":1}` et la ligne est créée avec `mode_cuisson_id` à `NULL` —
  « se mange sans cuisson » est une réponse, pas une absence (règle 6).
- **CA-5** ✅ *(trois preuves : la règle par `LotDHabitudesTest::testLeMemeAlimentDeuxFoisNeFaitQuUneLigne`, son UNICITÉ par le garde CA-1, son effet en base par l'épreuve e2e du 25/09/2026)* — *Étant donné* une base où « riz basmati » vaut 2, *quand* un seul
  envoi porte deux fois cet aliment, d'abord `"mode":2` puis `"mode":5`, *alors*
  la réponse est `{"enregistrees":1}` et la ligne vaut **5** : la dernière
  décision de l'envoi gagne, et c'est désormais la seule écriture de cette règle
  dans le dépôt.
- **CA-6** ✅ *(volet front vert ; « aucun `maj_le` n'a bougé » prouvé en e2e par CA-2, qui rejoue le même envoi. Le volet ÉCRAN a été joué À LA MAIN en vérification le 25/09/2026 : trois passages à « Cuisiner », PUT #1 `{"enregistrees":4}`, PUT #2 sans rien changer `{"enregistrees":0}` et les quatre `maj_le` strictement identiques. Il n'est pas AUTOMATISÉ — `ChoixDansListe` n'offre aucun sélecteur stable pour l'ajout manuel — mais il est vérifié.)* — *Étant donné* un plan dont aucune cuisson n'a changé depuis la
  semaine dernière, *quand* l'utilisateur passe à l'étape « Cuisiner », *alors*
  un seul `PUT` part, il répond `{"enregistrees":0}`, et **aucun** `maj_le` de la
  table `cuisson_habituelle` n'a bougé.
- **CA-7** ✅ *(vert le 25/09/2026 — la fonction n'a plus de paramètre `connues`, elle ne peut plus s'y tromper)* — *Étant donné* que `GET /api/mes-cuissons` n'a pas répondu (hors
  ligne, requête en pause), *quand* l'utilisateur passe à l'étape « Cuisiner »
  après le retour du réseau, *alors* le serveur n'écrit toujours que les écarts :
  le front ne sait rien de ce qui est connu, et ça ne change plus le résultat.
  C'est le défaut décrit dans « Pourquoi » ; ce critère est sa non-régression.
- **CA-8** ✅ *(vert le 25/09/2026)* — *Étant donné* `remplacer()`, *quand* le lot ne contient que des
  valeurs déjà en base, *alors* il rend `0` — et non le nombre de lignes reçues,
  comme aujourd'hui (`return \count($aEcrire)`).

## Ce que la feature refuse

Les messages existants de `LotDHabitudes` **ne changent pas** : ce sont des refus
déjà éprouvés, et les réécrire serait une régression silencieuse.

- **CA-R1** ✅ *(inchangé, test existant vert)* — mode inconnu → 422, « Mode de cuisson inconnu : *N* » (inchangé).
- **CA-R2** ✅ *(inchangé, test existant vert)* — aliment vide → 422, « Aliment non précisé. » (inchangé).
- **CA-R3** ✅ *(inchangé, test existant vert)* — clé `mode` absente → 422, « Cuisson non précisée pour *aliment* »
  (inchangé) ; `array_key_exists` et non `isset`, qui confondrait avec `null`.
- **CA-R4** ✅ *(vert le 25/09/2026)* — **le plafond doit devenir DEUX bornes, et c'est nouveau.**
  `LotDHabitudes::MAX` vaut 200 et se compare au nombre de lignes **reçues**.
  Aujourd'hui le front n'envoie que les écarts, donc 200 n'est jamais atteint ;
  demain il envoie une ligne par couple (repas, aliment) d'un plan qui peut
  compter 28 repas, et le plafond deviendrait atteignable par un usage normal —
  un refus 422 sur un geste légitime. Il faut donc **deux** bornes, chacune avec
  son chiffre, sa raison et son test de refus :
  - `MAX_LIGNES = 10000` sur l'envoi **brut**, avant dédoublonnage ;
  - `MAX = 200` conservé, mais sur le nombre d'aliments **distincts**, après
    dédoublonnage — c'est-à-dire sur ce qui sera réellement écrit.

  Les deux chiffres viennent de la mesure notée dans « Questions ouvertes ».

## Données

- Table `cuisson_habituelle` (`utilisateur_id`, `aliment`, `mode_cuisson_id`,
  `maj_le`), index unique `(utilisateur_id, aliment)`. **Aucune migration** : ni
  colonne, ni contrainte, ni index ne change.
- Source de vérité : la base. Le filtrage de l'inchangé se fait par
  `ON CONFLICT … DO UPDATE … WHERE cuisson_habituelle.mode_cuisson_id IS DISTINCT
  FROM EXCLUDED.mode_cuisson_id` — une clause, dans le seul dépôt qui écrit cette
  table. `IS DISTINCT FROM` traite `NULL` comme une valeur, ce dont la règle 6 a
  besoin ; PostgreSQL ne touche pas la ligne quand la condition est fausse, donc
  `maj_le` ne bouge pas et l'instruction rend 0.
- `aliment` reste la clé **déjà normalisée par l'écran**. `cleDHabitude` ne part
  pas : c'est de la fabrication de clé, sa table d'accents est manuelle
  volontairement (Hermes n'implémente pas `normalize`), et la réécrire en PHP
  créerait la duplication que ce chantier ferme.

## Droits

`#[IsGranted('ROLE_USER')]` sur `CuissonsController`, inchangé. Chaque compte ne
voit et n'écrit que ses lignes : `utilisateur_id` vient de la session, jamais du
corps de la requête. Une requête forgée qui nommerait un autre compte n'a pas de
champ pour le dire.

## Hors périmètre

- **`depuisLesHabitudes` ne part pas, et `REPRENDRE.md` se trompe en le désignant
  « le seul candidat net ».** Il a besoin des repas du plan **résolu**, que le
  solveur calcule au front ; le serveur ne les connaîtra qu'au palier 3. L'y
  envoyer aujourd'hui coûterait un aller-retour réseau par geste — la régression
  que `docs/plan-serveur-autoritaire.md` § palier 1 nomme explicitement. Et ce
  qu'il fait n'est pas un jugement : il réindexe une clé d'habitude en clé de
  cuisson. **Il part avec le palier 3, pas avant.**
- `cuissonsEffectives`, `enFournees`, `resteSansCuisson`, `sansCuisson` et
  `repartition` restent au front pour la même raison : toutes lisent
  `cuissonsChoisies`, un `useState` que l'utilisateur mute en cochant
  (`usePlanCalcule.ts:90`), et l'écran doit répondre à la coche sans attendre le
  réseau. `resteSansCuisson` n'est même pas un calcul : c'est un `setState`.
- `repartition` porte un vrai calcul métier — « ce qu'on ne cuit pas ne gonfle
  pas » (F2, 15 septembre 2026) — et **c'est une dette assumée par cette fiche** :
  elle ne peut partir qu'avec le solveur, au palier 3. Écrit ici pour que
  personne ne croie B4 complet sur les fournées.
- Aucun changement visible à l'écran. Si l'écran change, c'est un défaut.

## Le majorant, mesuré le 25 septembre 2026

**Il n'y en a pas dans le code, et c'est le résultat de la mesure.** Aucune des
deux dimensions n'est bornée :

- **Les jours.** `repas.tsx:142` prend `rangs`, alimenté par `Calendrier`, qui
  affiche une grille MENSUELLE sans plafond (`calendrier.tsx:91`). Cocher
  31 jours est possible. Les repas, eux, sont quatre :
  `REPAS = ['R1','R2','R3','R4']` (`solveur/repasVocabulaire.ts:17`).
- **Les aliments d'un repas.** Sept rôles au plus (`ROLES`,
  `demandeRepas.ts:91`), **plus `ajouts`, une liste libre** (`Compose.ajouts`,
  `demandeRepas.ts:274`) bornée seulement par le frigo — un aliment déjà pris
  par un rôle ne se propose plus (`demandeRepas.ts:328`), rien d'autre.

Chercher un majorant est donc une impasse : le pire cas théorique est
31 × 4 × (taille du frigo). La borne brute ne peut pas être un majorant, ce
sera un **plafond posé**, et voici son calcul.

| | couples (repas, aliment) |
|---|---|
| Plan de la semaine, 7 j × 4 repas, 7 rôles + 3 ajouts | **280** |
| Mois entier coché, 31 j × 4 repas, 15 aliments par repas | **1 860** |
| Pire cas concevable, 31 j × 4 repas × un frigo de 60 | **7 440** |
| `MAX_LIGNES` retenu | **10 000** |

**Ce chiffre a valu 2 000 pendant une demi-journée, et c'était faux** : 2 000
sortait de la deuxième ligne du tableau, « quinze aliments par repas », un chiffre
confortable et rien de plus. À dix-sept, le même mois fait 2 108 lignes et se
faisait refuser — relevé en revue le jour même. La troisième ligne, elle, n'est
pas confortable : c'est le maximum que le calendrier et le frigo permettent
d'atteindre. 10 000 la laisse passer avec de la marge et ferme la porte à un
corps qui ne vient plus de l'écran. Mesuré depuis : 7 440 lignes acceptées en
75 ms. La base de
dev de ce poste ne pouvait pas servir de mesure empirique : elle porte 8
aliments et 2 plans de démonstration. Le seul chiffre mesuré du dépôt sur un
vrai plan est celui de `usePlanCalcule.ts:34`, « sept jours sur 60 aliments ».

Le second plafond, 200 aliments **distincts**, garde son chiffre d'origine et
sa raison d'origine — « une semaine de quatre repas met en jeu une trentaine
d'aliments distincts » — qui, elle, reste vraie : le dédoublonnage la rend
enfin comparable à ce qu'elle prétend compter.

## Vérification

La vidéo doit montrer, sur l'application qui tourne :

1. Un plan composé, réglage des cuissons, passage à « Cuisiner » — **l'écran se
   comporte exactement comme avant** (CA-6, volet visible).
2. Le même passage refait sans rien changer : côté base, aucun `maj_le` n'a bougé
   (CA-2, CA-6). C'est le seul endroit où ça se voit, donc la capture doit montrer
   la requête SQL et son résultat, pas seulement l'écran.
3. Un changement de cuisson d'un aliment, puis passage à « Cuisiner » : une seule
   ligne écrite (CA-3).

CA-2 à CA-5 et CA-8 se prouvent **contre une vraie base** : les suites PHPUnit du
projet tournent sans base ni noyau (skill `tests-api`), et une `Connection`
doublée ne peut attester que la requête émise, pas son effet. La preuve est donc
en e2e ou par `verification-bout-en-bout`, sur un compte jetable en `@e2e.local`.

## Journal

- 2026-09-25 — spec écrite directement, sans brainstorm : le cadrage existait
  déjà (inventaire du 21 septembre 2026). Deux trouvailles de cette phase, qui
  n'étaient dans aucun document : le double juge « la dernière gagne » entre
  `habitudesAEcrire` et `LotDHabitudes`, et le défaut hors-ligne de
  `mesCuissons.data ?? {}`. Une affirmation de `REPRENDRE.md` est corrigée
  (`depuisLesHabitudes` n'est pas le candidat de B4 ; il part au palier 3).
- 2026-09-25 (nuit) — phase `tdd` terminée. Les huit critères sont portés par du
  code ; cinq sont prouvés ici (CA-1, CA-5, CA-6 volet front, CA-7, CA-8, plus
  CA-R1 à CA-R4), trois attendent une vraie base (CA-2, CA-3, CA-4) comme la
  section « Vérification » l'annonçait dès l'écriture de la spec. Trois commits :
  `b9bd24d` (CA-8), `c35d3d2` (CA-R4), `4dfee03` (CA-1, CA-6, CA-7).
  **Un reste pour la phase `docs`** : `REPRENDRE.md` nomme encore
  `habitudesAEcrire` au présent.
- 2026-09-25 (nuit) — revue par `revue-fitcarnet`, verdict **À CORRIGER**, six
  constats traités le soir même (`2cab7b6`). Le plus instructif est **M3 : la
  borne posée le matin pour éviter un refus sur geste légitime en créait un**
  — 2 000 lignes sortait d'un « quinze aliments par repas » confortable, et un
  mois entier à dix-sept en fait 2 108. Le plafond est désormais adossé au pire
  cas concevable (7 440), pas à un chiffre rond. **M1 : le garde ne gardait
  presque rien** — neuf réécritures plausibles sur dix passaient, et ses témoins
  ne pouvaient pas le révéler puisqu'ils lui servaient sa propre source. Il vise
  maintenant l'interface. **M2 : interblocage possible** sur deux envois
  concurrents, fermé par un `ksort`. Reste **E1**, qui ne dépend pas du code :
  `api/front` doit recevoir le `front/dist` régénéré, sinon la phase e2e serait
  verte pour la mauvaise raison.
- 2026-09-25 (nuit) — phase `e2e`. Six épreuves créées
  (`e2e/epreuves/habitudesCuisson.spec.ts`), suite complète à **18 tests verts**,
  ménage prouvé (zéro compte jetable restant). CA-2, CA-3, CA-4, CA-5 et CA-8
  sont désormais prouvés **contre une vraie base** — c'est la clause
  `IS DISTINCT FROM` qui est exercée, et elle ne pouvait l'être nulle part
  ailleurs. **Un critère reste hors de portée** : le volet ÉCRAN de CA-6. Le
  sélecteur `ChoixDansListe` n'expose ni rôle ni `testID` stable, blocage déjà
  rencontré par `avancementSeance.spec.ts` le 20 septembre. Le montage aurait
  exigé frigo + cibles + plan pour exercer, côté serveur, exactement ce que CA-2
  exerce déjà. Non bricolé, volontairement : `retries: 0`.
- 2026-09-25 (nuit) — phase `verify`, par `verification-bout-en-bout`. Rapport :
  `docs/verifications/habitudes-cuisson-au-serveur/2026-09-25/rapport.md`.
  **Quatre points, tous OK.** Deux résultats que rien d'autre n'avait donnés :
  le **parcours écran complet** a pu être joué en garnissant le frigo par l'API
  (le blocage `ChoixDansListe` ne porte que sur l'ajout manuel), et le **volume
  réel** — 280 lignes pour 30 aliments en 57 ms, trois rejeux à
  `{"enregistrees":0}` avec l'empreinte md5 de la table inchangée. Les deux
  bornes vérifiées en vrai : 7 440 lignes acceptées en 75 ms, 10 001 refusées,
  201 aliments distincts refusés. Ménage prouvé, compteurs identiques avant/après.
  **Le seul défaut trouvé était documentaire, et il était de moi** : cinq
  documents annonçaient encore `MAX_LIGNES = 2000`. Corrigés.
  **Non éprouvé** : le `ksort` anti-interblocage (M2) — deux transactions
  entrelacées ne se constatent pas de façon fiable depuis `curl`. Le code le
  porte, la preuve expérimentale manque.
- 2026-09-25 (nuit) — phase `docs`, par `verite-documentaire`. **Vingt-trois
  écarts**, dont six que personne n'avait vus et qui préexistaient à ce chantier :
  `CLAUDE.md` annonçait **trois** gardes alors qu'il y en a cinq, affirmait que
  deux d'entre eux « ne voient ni le serveur ni la base » — faux pour
  `avancementUnique`, qui compare trois listes de modes à travers SQL, PHP et
  TSX —, disait `epleyUnique` « seul dispositif à voir une divergence entre deux
  langages » alors qu'ils sont quatre, comptait **quatre** doubles juges retirés
  au lieu de six, et portait un tableau à deux en-têtes empilés. Et sa section
  e2e ne prononçait **jamais** le mot `api/front` : la recopie du build, écrite
  dans quatre autres fichiers, manquait précisément là où elle a bloqué la phase
  e2e de ce soir. Quatorze compteurs de tests étaient faux, dont l'entrée de
  `prochaines-etapes.md` **écrite pour traquer un compteur faux**. Tous corrigés ;
  ce qui est écrit au passé et daté est gardé. **Feature terminée.**
