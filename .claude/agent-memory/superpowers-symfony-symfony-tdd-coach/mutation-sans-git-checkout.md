---
name: mutation-sans-git-checkout
description: Pour vérifier qu'un test peut échouer, sauvegarder le fichier dans /tmp puis le restaurer — jamais `git checkout <fichier>`, qui efface le travail non commité.
metadata:
  type: project
---

Quand on casse volontairement du code pour prouver qu'un test tombe (mutation),
sauvegarder le fichier avec `cp fichier /tmp/x` et le restaurer avec
`cp /tmp/x fichier`. **Ne jamais utiliser `git checkout <fichier>`** pour annuler
la mutation.

**Why:** le 17 septembre 2026, un `git checkout` posé pour retirer une mutation a
ramené le fichier à HEAD — donc effacé, en même temps que la mutation, la
correction non commitée que je venais d'écrire dans ce même fichier
(`ComptesController.php` et `JetonsRafraichissement.php`). Le test de mutation
suivant a alors échoué pour la mauvaise raison, ce qui a failli passer pour un
résultat. Il a fallu réécrire les deux fichiers de mémoire.

Aggravant : **plusieurs agents travaillent parfois dans l'arborescence en même
temps** (vu le même jour sous `presentation/`), donc `git status` ne dit pas
seulement ce que j'ai fait, et toute commande git qui touche au disque peut
emporter le travail de quelqu'un d'autre.

**How to apply:** à chaque fois qu'on éprouve qu'un test « peut échouer » — geste
obligatoire ici, l'audit de septembre 2026 ayant trouvé douze vérifications
incapables d'échouer. Enchaîner mutation → run → restauration dans **une seule**
commande bash séquentielle, puis relancer la suite complète pour prouver que la
restauration est propre.
