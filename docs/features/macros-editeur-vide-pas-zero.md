---
titre: Les macros de l'éditeur ne lisent plus vide comme zéro
slug: macros-editeur-vide-pas-zero
phase: verify
cree_le: 2026-09-26
brainstorm: aucun fichier archivé — débat du 26/09/2026, décisions reportées dans docs/etat/decisions.md
---

# Les macros de l'éditeur ne lisent plus vide comme zéro

Le besoin utilisateur de l'éditeur est écrit dans la skill `fonctionnalite-frigo` :
on y renvoie, on ne le recopie pas. Cette fiche porte **ce qui se lit, se juge et
s'enregistre** dans l'éditeur d'aliment, et qui le fait.

## Le principe, dans les mots du propriétaire (26 septembre 2026)

> « Tout ce qui se décide doit venir du serveur. Le client affiche et fait
> quelques contrôles front légers, mais ne décide de rien : c'est le serveur qui
> renvoie les informations, enregistre, modifie ou supprime. »

C'est le but de la refonte serveur autoritaire. Chaque critère ci-dessous en
découle ; en cas de doute pendant l'implémentation, c'est cette phrase qui tranche.

## Pourquoi

`editeurAliment.tsx:82` lit chaque champ par `nombreSaisi(v) ?? 0` : un champ
vide ou illisible devient **0** dans l'état de l'écran (règle 6). Relu le
26/09/2026, ce 0 n'atteint plus la base — `valide` exige un texte lisible
(`:340`) — mais il nourrit deux décisions prises PAR L'ÉCRAN : `a.kcal100 > 0`
(`:348`) et le masquage du résumé (`:555`). Et l'écran décide encore bien
davantage : il convertit « 12,5 », juge ce qui est lisible, rédige « Renseigne
les quatre valeurs… », calcule le rendement depuis les pesées
(`ratioDepuisPesees`, `provenanceRatio`, `expliquerRatio`) et convertit la
quantité par `parseFloat` (`editeurAlimentConnecte.tsx:127`).

Côté serveur, il y a en plus **deux juges** : le verdict affiché pendant la
saisie (`VerdictAliment`) et les contraintes appliquées à l'écriture
(`Aliment.php:167-211`, via `AlimentProcessor`), qui ne sont pas les mêmes.
L'écran peut dire « enregistrable » de ce que l'écriture refusera.

## Comportement

L'utilisateur ouvre l'éditeur depuis le frigo (création ou modification). Les
champs numériques ouvrent le pavé numérique sur mobile et **refusent toute
frappe** qui ferait apparaître autre chose qu'un chiffre, « , » ou « . » : le
champ garde alors son texte précédent, rien n'est retiré en silence.

À chaque frappe, l'écran envoie au serveur **ce qui est dans les champs, tel
quel**. Le serveur lit, juge, calcule le rendement depuis les pesées et renvoie :
les refus rattachés à leur champ, les avertissements, le résumé, le rendement et
sa phrase d'explication. L'écran affiche chaque refus **en rouge sous son champ**,
sans en rédiger aucun.

À l'enregistrement, l'écran envoie la même saisie brute. Le serveur la rejuge
avec le même `VerdictAliment` et, sans refus, enregistre **les valeurs qu'il a
lues lui-même**. En cas de refus, il répond 422 avec la même liste
`{champ, message}`, affichée sous les champs.

Si le serveur ne répond pas, l'écran le dit et n'affiche aucun chiffre qu'il
aurait calculé.

## Critères d'acceptation

### L'écran ne lit ni ne juge plus rien

- [x] **CA-1** — *Étant donné* une création, *quand* l'utilisateur laisse
  « Protéines » vide et remplit le reste, *alors* la saisie envoyée au serveur
  porte `prot100: ""` (et non `0`), et le message de refus renvoyé par le
  serveur pour `prot100` s'affiche en rouge **sous le champ Protéines**.
- [x] **CA-2** — *Étant donné* n'importe quel champ numérique de l'éditeur
  (kcal, protéines, glucides, lipides, fibres, pesée avant, pesée après,
  quantité), *quand* l'utilisateur tape « a » ou colle « 4a2 », *alors* le
  texte du champ reste celui d'avant la frappe, caractère pour caractère.
- [x] **CA-3** — *Étant donné* un champ contenant « 42 », *quand* l'utilisateur
  tape « ,5 », *alors* le champ affiche « 42,5 » : la virgule et le point sont
  acceptés par le filtre, rien n'est retiré.
- [x] **CA-4** — *Étant donné* un champ contenant « 4,2,1 » (accepté par le filtre),
  *alors* c'est le serveur qui le refuse, et son message s'affiche sous ce champ.
- [x] **CA-5** — *Étant donné* l'éditeur, *alors* aucun message de refus n'est
  rédigé par l'écran : « Renseigne les quatre valeurs — écris 0 si l'aliment
  n'en contient pas » et le calcul local `illisible` disparaissent ; le bouton
  « Enregistrer » ne dépend plus de `a.kcal100 > 0` ni de `macrosLisibles`.
- [x] **CA-6** — *Étant donné* le résumé du verdict, *alors* son affichage ne
  dépend plus de `a.kcal100 > 0 || a.prot100 > 0` : ce que le serveur renvoie
  s'affiche ; s'il ne renvoie pas de résumé, rien ne s'affiche.

### Le rendement vient du serveur

- [x] **CA-7** — *Étant donné* des pesées « 100 » avant et « 230 » après, *quand*
  la saisie est envoyée, *alors* elle porte les deux pesées **brutes** (et plus
  de `ratioCandidat` calculé par l'écran) ; le rendement 2,3, sa phrase
  d'explication et sa provenance (mesuré / table) affichés sont ceux **renvoyés
  par le serveur**.
- [x] **CA-8** — `ratioDepuisPesees`, `provenanceRatio` et `expliquerRatio`
  disparaissent de `front/src/calcul/nutrition.ts` (l'éditeur en était le seul
  lecteur) ; leur logique existe côté serveur, avec ses tests PHPUnit.

### L'écriture n'a qu'un juge

- [x] **CA-9** — *Étant donné* `POST /api/aliments` avec `"prot100": "12,5"`,
  *alors* l'aliment est créé avec 12,5 g de protéines, lu par le même lecteur
  que la route de verdict (`VerdictAliment`).
- [x] **CA-10** — *Étant donné* `POST /api/aliments` avec `"prot100": 12.5` (nombre
  JSON), *alors* l'aliment est créé avec 12,5 g : les deux formes sont acceptées
  et lues par le même lecteur. `e2e/epreuves/peseesEditeur.spec.ts:57`, qui
  envoie des nombres, passe sans modification.
- [x] **CA-11** — *Étant donné* des pesées brutes « 100 » et « 230 » dans le corps
  d'écriture, *alors* le rendement enregistré est celui **calculé par le
  serveur** (2,3), quel que soit le `ratio` éventuellement envoyé à côté.
- [x] **CA-12** — *Étant donné* une saisie que `POST /api/verification/aliment`
  déclare `enregistrable`, *quand* la même saisie est envoyée à
  `POST /api/aliments`, *alors* elle est enregistrée ; et inversement, toute
  saisie que le verdict refuse est refusée à l'écriture avec **la même liste**
  `{champ, message}`. (Un seul juge.)
- [x] **CA-13** — *Étant donné* une modification, *alors* `PATCH /api/aliments/{id}`
  reçoit la saisie complète et le serveur juge contre **l'aliment tel qu'il est
  en base** (origine lue en base, jamais celle du client) : un aliment
  incohérent hérité d'avant la règle peut être renommé sans toucher à ses
  valeurs.
- [x] **CA-14** — *Étant donné* la quantité saisie à la création, *alors* elle part
  telle que tapée et c'est le serveur qui la lit ; le `parseFloat` de
  `editeurAlimentConnecte.tsx:127` disparaît.
- [x] **CA-15** — *Étant donné* un 422 de l'écriture, *alors* l'éditeur reste
  ouvert, la saisie intacte, et chaque message s'affiche sous son champ.

### Garde permanente

- [x] **CA-16** — Un test de garde, sur le modèle des cinq existants
  (`front/src/calcul/*Unique.test.ts`), refuse `nombreSaisi`, `parseFloat`,
  `Number(`, `ratioDepuisPesees` dans `editeurAliment.tsx` et
  `editeurAlimentConnecte.tsx`, et porte un cas TÉMOIN qui prouve qu'il tombe
  encore sur sa cible.

## Ce que la feature refuse

- [x] **CA-R1** — *Étant donné* `POST /api/aliments` avec `"prot100": ""`, *alors*
  422, refus rattaché à `prot100`, rien n'est créé en base (vérifié par requête).
- [x] **CA-R2** — *Étant donné* `POST /api/aliments` avec `"prot100": null`, *alors*
  422 avec le même refus que `""` : `null` n'est **jamais** lu 0.
- [x] **CA-R3** — *Étant donné* `POST /api/aliments` avec `"prot100": "abc"`,
  *alors* 422, refus rattaché à `prot100`.
- [x] **CA-R4** — *Étant donné* un aliment incohérent en base, *quand* un `PATCH`
  forgé déclare une fausse origine égale à de nouvelles valeurs incohérentes,
  *alors* 422 : l'origine envoyée par le client est ignorée.
- [x] **CA-R5** — *Étant donné* un `PATCH` sur l'aliment d'un autre compte, *alors*
  404, avant tout jugement de la saisie (règle 2, voter `MIEN`).
- [x] **CA-R6** — *Étant donné* le serveur injoignable **pendant la saisie**,
  *alors* un bandeau gris dit que le serveur ne répond pas et que rien n'est
  vérifié ; aucun message rouge sous les champs ; le rendement s'affiche
  « inconnu », jamais un chiffre.
- [x] **CA-R7** — *Étant donné* le serveur injoignable **à l'enregistrement**,
  *alors* l'écran dit que rien n'a été enregistré et invite à réessayer ; la
  saisie reste intacte et le bouton reste actif.

## Données

- **Aucune migration.** Les colonnes ne changent pas ; les aliments existants
  ne sont pas touchés.
- **Contrat de `POST` / `PATCH /api/aliments`** : chaque champ numérique
  accepte un texte (« 12,5 ») ou un nombre JSON ; `ratio` n'est plus une
  entrée de confiance quand des pesées sont fournies. API Platform attend des
  nombres sur l'entité : il faudra un DTO d'entrée ou un processeur qui lit
  avant de désérialiser — c'est le plus gros morceau côté serveur.
- **Source de vérité** : `VerdictAliment` pour la lecture et le jugement, avant
  ET pendant l'écriture. Les contraintes de l'entité restent en filet.
- **La quantité à la création** passe par la route d'inventaire : elle doit
  accepter la même saisie brute.
- **Écrivains recensés** : dans l'application, seul l'éditeur écrit
  (`front/src/api/hooks/frigo.ts:96`, `:109`, via `versDecimales`) ; hors
  application, `e2e/epreuves/peseesEditeur.spec.ts:57`.

## Droits

Inchangés : tout compte crée et modifie **ses** aliments (règle 2). Un `PATCH`
sur l'aliment d'autrui rend 404 avant tout jugement. Une origine forgée est
ignorée (CA-R4).

## Hors périmètre

- **Grocy.** Quitté en production le 20/09/2026. Son retrait du code est un
  autre chantier (`prochaines-etapes.md`).
- **Les champs numériques des autres écrans** : séances, modèles, inventaire en
  écarts. Même principe, autres features.
- **Enregistrer un aliment dont une macro est inconnue** (`null` en base) :
  rien ne le demande, et cela toucherait le solveur.
- **Le `Bouton` désactivé que le navigateur ne voit pas** (dette du 26/09/2026).
- **L'arrondi silencieux d'une pesée à 2 décimales** (`NUMERIC(7,1)`), accepté
  le 26/09/2026.

## Contrat technique — arrêté à l'entrée en tdd, 26/09/2026

### Serveur
- **`App\Service\NombreSaisi`** (nouveau, statique, sans dépendance) : le SEUL
  lecteur d'un nombre saisi côté serveur. `estVide(mixed): bool` (null, `''`,
  espaces) ; `lire(mixed): ?float` — texte (« 12,5 », « 12.5 », « -2 ») ou
  nombre JSON (int/float) ; `null` pour vide OU illisible (« 4,2,1 », « abc »,
  booléen, tableau). Les négatifs se lisent (le jugement du signe est ailleurs).
  `VerdictAliment::nombreSaisi` disparaît au profit de ce lecteur.
- **`App\Service\RendementExplique`** (nouveau, statique) : `POIDS_INCHANGE = 0.01` ;
  `depuisPesees(?float $avant, ?float $apres): ?float` = `round(apres/avant, 2)`,
  `null` si l'une manque ou ≤ 0 ; `explication(float $ratio): string` — mêmes
  phrases que l'ancien `expliquerRatio` du front (« Le poids ne change pas à la
  cuisson. », « 100 g avant cuisson donnent 230 g une fois cuits. », « … une fois
  cuits (perte d'eau). ») ; `provenance(?float, ?float): ?string` —
  « mesuré : 42,5 g avant cuisson → 96 g après » (entier si |v − arrondi| < 0,05,
  sinon une décimale, **virgule française**), `null` sans pesées.
- **`VerdictAliment::pour($saisie)`** — entrée : `nom`, `categorie`, `kcal100`,
  `prot100`, `gluc100`, `lip100`, `fibres100`, `ratio`, `peseeAvant`,
  `peseeApres`, `quantite` (facultatif), `origine` (route de verdict seulement).
  Chaque champ numérique : texte OU nombre JSON, `null` ≡ `""`. **Plus de
  `ratioCandidat` en entrée, plus de `candidat` en sortie.**
  - Macro obligatoire vide (kcal, prot, gluc, lip) → refus sur son champ,
    message `Aliment::MACRO_ABSENTE`. Calories lues à 0 → refus `kcal100`.
    Catégorie vide → refus `categorie`.
  - Pesées : illisible → refus sur son champ ; ≤ 0 → refus sur son champ ; une
    seule des deux renseignée → refus sur l'autre (« Il manque la pesée après
    cuisson. » / « … avant cuisson. »). Deux lisibles > 0 → **ratio effectif =
    `RendementExplique::depuisPesees`, le `ratio` envoyé est ignoré.**
  - Le sens du rendement se juge sur le ratio effectif (refus `ratio`).
  - `quantite` : vide → rien ; illisible ou négative → refus `quantite`.
  - Sortie : ajoute `rendement: {valeur: float|null, explication: string|null,
    provenance: string|null}`.
  - La cohérence nutritionnelle se calcule dès que les calories sont lues et
    qu'aucune valeur n'est ILLISIBLE ; une macro manquante vaut 0 pour ce seul
    calcul, comme avant.
- **Écriture** : `App\Serializer\AlimentDenormalizer` (décore la dénormalisation
  de `Aliment`, drapeau de contexte anti-récursion). POST : le corps est la
  saisie. PATCH : `object_to_populate` est l'aliment EN BASE ; un champ absent du
  corps y est pris, et l'**origine** est lue sur lui — la clé `origine` du corps
  est ignorée. Juge par `VerdictAliment::pour` ; tout refus, ou
  `enregistrable: false`, → `ApiPlatform\Validator\Exception\ValidationException`
  (422, `violations[{propertyPath: champ, message}]`), sans appeler la suite.
  Sinon passe à la dénormalisation normale les valeurs LUES par le serveur
  (ratio effectif, pesées lues ou `null`). Les contraintes de l'entité restent en
  filet.
- `POST /api/mon-frigo/stock` : `quantite` lue par `NombreSaisi` ; vide/absente → 0
  (dit à l'écran : « l'aliment sera créé à zéro ») ; illisible → 422
  `{erreur, refus:[{champ:'quantite', message}]}`. Les routes Grocy
  (`/mon-frigo/aliment`, `/mon-frigo/quantite`) lisent par `NombreSaisi` elles
  aussi : l'éditeur leur envoie désormais du texte, et `(float) "12,5"` vaut 12
  en silence (règle 7). Grocy reste hors périmètre pour tout le reste.

### Écran
- `SaisieAliment` (`api/hooks/verification.ts`) : tous textes ; `peseeAvant`,
  `peseeApres`, `quantite?` ajoutés, `ratioCandidat` retiré. `VerdictAliment` :
  `candidat` retiré, `rendement` ajouté.
- `AlimentSaisi` (entrée de l'éditeur, nombres) inchangé. Nouveau type exporté
  **`AlimentTape`** (sortie `onEnregistrer`) : `nom`, `categorie`, `kcal100`,
  `prot100`, `gluc100`, `lip100`, `fibres100`, `ratio`, `peseeAvant`,
  `peseeApres` en `string`, `referenceCiqual?`.
- Textes de départ par `texteDuNombre` (virgule). Les pesées deviennent des
  `Champ` texte : la pesée tapée EST la saisie (plus de candidat) ; « Utiliser ce
  résultat (2,3) » — chiffre lu dans `verdict.rendement.valeur` — referme la
  mesure ; « Revenir aux valeurs courantes » vide les deux pesées ; choisir un
  guide pose `ratio = texteDuNombre(g.valeur)` et vide les pesées.
- Filtre de frappe : `frappeNumeriqueAcceptee(texte)` dans
  `calcul/saisieNombre.ts` (`/^[0-9.,]*$/`), appliqué aux neuf champs numériques
  de l'éditeur (dont quantité) ; frappe refusée → le texte ne change pas.
- Refus : sous chaque champ, `testID="refus-<champ>"`, en `C.erreur`, les
  messages du verdict ET ceux d'un 422 d'écriture (`ErreurApi.refus`, lu par le
  client depuis `violations` ou `refus`). Refus d'un champ sans case (`nom`,
  `categorie`…) : bloc général. Aucun refus affiché quand `verdictEnPanne`.
- Rendement : `testID="rendement"` — `verdict.rendement.explication`, ou
  « Rendement : inconnu » (pas de verdict, panne, ou `valeur` nulle).
- Bouton « Enregistrer » : `nom` non vide ET (`verdictPerime` OU
  `verdict?.enregistrable ?? true`). Plus aucune lecture de nombre dans les deux
  éditeurs (garde CA-16). La quantité part telle que tapée (`definir`,
  `poserQuantite`).
- `ChampRattachement` reçoit le TEXTE des calories et fait sa lecture lui-même
  pour son avertissement d'écart au type CIQUAL : **jugement resté à l'écran,
  déclaré en dette**, hors de cette spec.

## Questions ouvertes

- Aucune.

## Vérification

La vidéo doit montrer : CA-1 (vide → message sous Protéines, rien en base),
CA-2 et CA-3 (« a » refusé, « 42,5 » accepté), CA-7 (100 → 230 : rendement et
phrase venus du serveur), CA-R6 (serveur coupé : « inconnu », aucun chiffre),
CA-15 (un 422 affiché sous les champs). CA-R4 et CA-R5 se prouvent par requête.

## Journal
- 2026-09-26 — spec créée depuis le brainstorm.
- 2026-09-26 — spec validée par le propriétaire ; phase tdd.
- 2026-09-26 — tdd : 23/23 critères portés par un test, suites vertes (API 631 tests,
  front 747 + 72 de rendu). Contrat technique ajouté ci-dessus. Tests d'avant
  RÉÉCRITS parce que la spec les contredit : dans `editeurAliment.test-rendu.tsx`,
  le bloc « les pesées passent par ChampNombre » (CA-4, CA-5 et CA-R1/R2 de
  `pesees-editeur-aliment-saisienombre` : ratio et bordure calculés par l'écran)
  et « des protéines vidées / des lipides illisibles ne partent pas » (l'écran
  retenait l'envoi : il envoie désormais le texte, le serveur refuse) ; leur
  jumeau « des lipides oubliés » dans `editeurAlimentConnecte.test-rendu.tsx` ;
  `VerdictAlimentTest` (macros vides désormais refusées) ;
  `nutrition.test.ts` supprimé (il ne testait que `ratioDepuisPesees`).
  Hors CA, nécessaires : les routes Grocy et `/mon-frigo/quantite` lisent par
  `NombreSaisi` ; `idDeLaReference` (`calcul/frigo.ts`) remplace deux
  `Number(ref.split(':')[1])`.
- 2026-09-26 — revue (`revue-fitcarnet`) : À CORRIGER, rien de bloquant. Corrigé le
  même jour : CA-13 valait aussi pour un aliment hérité hors d'Atwater
  (`VerdictAliment::macrosDeLOrigine`) ; l'éditeur n'affiche plus l'échec d'un
  autre geste (`editeurAlimentConnecte.tsx`, `echec` selon le mode) ; CA-R5 est
  désormais porté par `e2e/epreuves/alimentDAutrui.spec.ts` (404 avant jugement,
  avec témoin 422) ; contrat OpenAPI du verdict à jour ; en-tête de
  `NombreSaisi` corrigé (« le seul lecteur » était faux) ; PHPStan revenu à ses
  5 erreurs d'avant. Écartés : les deux constats du seul chemin Grocy —
  **Grocy est abandonné** (`decisions.md`, 26/09/2026).
- 2026-09-26 — e2e : `e2e/epreuves/macrosEditeur.spec.ts`, 10 épreuves (CA-1 à 4, 7, 12, 15, R6, R7, non-régression création + renommage) ; suite complète 30/30 verte, aucune épreuve préexistante rouge.
