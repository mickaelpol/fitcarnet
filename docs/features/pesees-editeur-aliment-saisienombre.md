---
titre: Les pesées de l'éditeur d'aliment passent par saisieNombre
slug: pesees-editeur-aliment-saisienombre
phase: review
cree_le: 2026-09-26
brainstorm: aucun fichier archivé — débat du 26/09/2026, décisions reportées dans docs/etat/decisions.md
---

# Les pesées de l'éditeur d'aliment passent par saisieNombre

Le besoin utilisateur de l'éditeur est écrit dans la skill `fonctionnalite-frigo` :
on y renvoie, on ne le recopie pas. Cette fiche ne porte que les deux champs
« Poids avant cuisson » et « Poids après cuisson ».

## Pourquoi

L'**enregistrement** des pesées passe déjà par `nombreSaisi`
(`front/src/composants/editeurAliment.tsx:640`, palier 1, 20 septembre 2026), et
le ratio aussi (`:299`). Deux écarts restent :

1. **La relecture** (`:271-272`) réécrit la pesée par `String(…)` : 42,5 g
   revient « 42.5 », au point, dans un écran où tout s'écrit à la virgule. C'est
   le défaut que `texteDuNombre` a corrigé dans l'éditeur de modèle.
2. **Les deux champs sont des `Champ` à état texte tenu à la main**, pas des
   `ChampNombre`. La saisie tient, mais c'est une seconde façon de faire, et une
   pesée illisible fait disparaître le bouton « Utiliser ce résultat » **sans
   rien désigner**.

## Comportement

L'utilisateur ouvre l'éditeur d'un aliment depuis le frigo, choisit « Je préfère
mesurer », et trouve ses pesées précédentes écrites à la virgule, sans arrondi.
Il peut taper une virgule au milieu d'une frappe sans la perdre. Une saisie
illisible est bordée de rouge, et aucun résultat n'est proposé tant qu'elle
l'est. Ce qu'il valide remonte au parent exactement comme aujourd'hui.

## Critères d'acceptation

- [x] **CA-1** — *Étant donné* un aliment dont `peseeAvant` vaut 42,5 et
  `peseeApres` 96, *quand* on ouvre l'éditeur puis « Je préfère mesurer »,
  *alors* les champs affichent « 42,5 » et « 96 ».
- [x] **CA-2** — *Étant donné* un aliment sans pesée (`null`/`null`), *quand* on
  ouvre la mesure, *alors* les deux champs sont vides — ni « 0 », ni « null ».
- [x] **CA-3** — *Étant donné* la mesure ouverte, *quand* on tape « 4 », « 2 »,
  « , », « 5 » dans « Poids avant cuisson », *alors* le champ affiche « 42,5 » à
  la fin, la virgule n'ayant jamais disparu.
- [x] **CA-4** — *Étant donné* la mesure ouverte, *quand* on tape « 100 » puis
  « 230 » et qu'on appuie sur « Utiliser ce résultat », *alors* le parent reçoit
  `peseeAvant: 100`, `peseeApres: 230` et le ratio déduit de ces deux pesées.
- [x] **CA-5** — *Étant donné* les deux champs de pesée, *alors* ce sont des
  `ChampNombre` : le rendu de l'éditeur n'en contient aucun autre champ de pesée
  tenu à la main.
- **CA-6** (e2e) — *Étant donné* un compte jetable `@e2e.local` dont le frigo
  est garni **par l'API** d'un aliment à `peseeAvant: 42.5` et d'une ligne de
  stock, *quand* on ouvre son éditeur dans Chromium puis « Je préfère
  mesurer », *alors* le champ « Poids avant cuisson » affiche « 42,5 ». Le
  ménage final ne laisse aucun compte `@e2e.local`.

## Ce que la feature refuse

- [x] **CA-R1** — *Étant donné* la mesure ouverte, *quand* on tape « 4,2,1 » dans
  une pesée (de même « abc », « -3 »), *alors* ce champ est bordé de rouge et le
  bouton « Utiliser ce résultat » n'apparaît pas. **Aucun message propre à cet
  écran** : la bordure est le signal commun aux séries et aux modèles.
- [x] **CA-R2** — *Étant donné* une pesée illisible, *quand* on corrige en « 100 »,
  *alors* la bordure disparaît et, l'autre pesée étant lisible, le bouton
  réapparaît.

## Données

Aucune. Même contrat `peseeAvant`/`peseeApres` en `number | null`, ni migration,
ni route, ni changement serveur. Colonnes inchangées : `NUMERIC(7,1)`, CHECK
`aliment_pesees_positives`.

## Droits

Sans objet : état local de l'écran, tout compte. L'enregistrement, et donc
l'isolation, ne changent pas.

## Hors périmètre

- **Les macros de l'éditeur** (`:82`, `nombreSaisi(v) ?? 0`) lisent vide et
  illisible comme zéro, contre la règle 6. Changer ça touche `ALIMENT_VIDE`, le
  type `Aliment` et le contrat serveur. Dette notée dans
  `docs/etat/prochaines-etapes.md`.
- **Une pesée à deux décimales** (123,45 g) est acceptée telle quelle et
  arrondie à 123,5 par la base, comme aujourd'hui. Aucun refus, ni à l'écran
  (ce serait un juge front) ni au serveur. Dette notée.
- Un message expliquant pourquoi aucun résultat n'est proposé.

## Questions ouvertes

Aucune.

## Vérification

La vidéo de l'épreuve CA-6 montre l'éditeur rouvert sur « 42,5 » à la virgule.
CA-1 à CA-5, CA-R1 et CA-R2 sont prouvés par des tests de rendu qui tapent pour
de vrai (`editeurAliment.test-rendu.tsx`). L'épreuve e2e exige `front/dist`
reconstruit **et** recopié dans `api/front` (voir `CLAUDE.md`, section e2e).

## Journal
- 2026-09-26 — spec créée depuis le brainstorm
- 2026-09-26 — spec validée par le propriétaire, phase tdd
- 2026-09-26 — tdd : CA-1 à CA-5, CA-R1, CA-R2 verts (11 tests de rendu, dont 3 témoins verts dès avant). CA-6 relève de la phase e2e. Phase review.
