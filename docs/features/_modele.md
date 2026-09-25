---
titre: <titre lisible>
slug: <slug>
phase: spec
cree_le: <AAAA-MM-JJ>
brainstorm: docs/brainstorm/<slug>-<date>.md (archivé) | aucun
---

# <titre>

## Pourquoi
2 à 5 lignes : le problème que ça résout, pour qui.

## Comportement
Description du chemin nominal en prose courte, du point de vue de l'utilisateur.

## Critères d'acceptation
Un critère = un test. Numérotés, stables (on ne renumérote pas, on ajoute).

- **CA-1** — *Étant donné* … *quand* … *alors* …
- **CA-2** — …

## Ce que la feature refuse
Chaque refus est un critère aussi (message exact, code HTTP si API).

- **CA-R1** — *Étant donné* … *quand* … *alors* refus avec « … »

## Données
Entités touchées, migrations, source de vérité.

## Droits
Qui peut quoi. Comportement sur requête forgée.

## Hors périmètre
- …

## Questions ouvertes
- … (chacune avec qui doit trancher et avant quand)

## Vérification
Ce que la vidéo doit montrer pour que la feature soit validée (renvoie aux CA).

## Journal
- <date> — spec créée depuis le brainstorm
