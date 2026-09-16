# Feature de l'application fitcarnet
Cette description de fitcarnet permet d'établir toutes les features présente dans l'application

## Séances
* Création d'une séance à partir d'un modèle ou le remplir soit même d'exercices.
* Enregistrer une séance comme modèle.
* Plusieurs modes de travail sur un exercice **(charge/tenue/chrono)**.
* Enregistrement des chronos de tenue ou du mode chrono.
* Enregistrement des séries **(répétitions X poids)**.
* Ajout de série.
* Ajout de notes sur chaque exercice.
* Ajout d'exercices par groupe musculaire.
  * Recherche textuelle d'exercices.
  * Recherche par trie par groupe musculaire.
  * Le trie et la recherche se base sur la catégorie de la séance **(push/pull/legs)**.
* Agencement et ordre des exercices dans la séance.
* Information sur l'exercice **(vidéo/zone musculaire/muscle ciblé/muscle aussi solicités/format (répétitions X poids))**.
* Proposition de remplir l'exercice avec la dernière performance sur cet exercice lors de la séance précédente **(Nombre de séries + répétitions X poids)**.
* Evaluation d'évolution entre la dernière performance sur un exercice et le même exercice sur la séance en cours
* Le **1RM** (1 répétition maximum avec une charge) permet d'indiquer les répétitions X poids recommandé pour progresser, cette progression doit se travailler dans une zone entre 70% et 90% de son **1RM** pour un équilibre intensité/volume.
* Progression du 1RM sur un exercice entre la dernière performance et la performance en cours.
* Calcul du 1RM en fonction des répétitions X poids avec la formule d'Epley: **(La formule d'Epley permet d'estimer la charge maximale d'une répétition (1RM) en musculation à partir d'une série sous-maximale, <ins>la formule : 1RM = Poids X (1+ (répétitions/30))<ins> )**.
* Bouton de calcul du 1RM en bas de la séance, permettant de calculer directement sa série à l'avance.
* Somme du nombre de répétitions + poids total soulevé sur un exercice et/ou le chrono fait sur l'exercice.
* Timer de pause qui se lance une fois la série sur un exercice coché, le timer sonne à la fin du chrono de pause.
* Timer de pause paramétrable **(1m/1m30/2m/3m)**

## modèle
* Création de modèle de séance réutilisable pour ses séances.
* Catégorisé en push/pull/legs (séance poussée / tiré / jambes) possibilité de donner un nom au modèle.
* Ordre des exercices et réagencement de l'ordre des exercices dans le modèle.
* Plusieurs modes de travail (charge/tenue/chrono).

## Compte
* Mes objectifs par repas **(ce que je dois manger)** (macronutrition : Glucides/Lipides/Protéines/Fibres) par repas (matin/midi/16h/soir), peut être obtenu avec un plan auprès d'un coach ou d'un calculateur en ligne.
* Renseigner ses compléments alimentaires (simple CRUD).
* Réglage de l'app (sonnerie du timer uniquement pour l'instant).

## Frigo
* Stock (renseigne le contenu du frigo/placard/congélateur).
* Inventaire (permet de mettre à jour son stock sans ajouter/éditer/supprimer d'aliments) on ne renseigne que le poid de l'aliment et on met à jour.
* Ajout d'aliment
* Valeurs nutritionnelles de chaque aliment (Catégorie de l'aliment (Glucide/Lipide/Protéine)) + changement de poids à la cuisson (combien à la pesée crue est égale à combien pesé cuit).

## Repas
* Sélection du/des repas à préparer sur une journée.
* Configuration du nombre de convives pour lesquels on va cuisiner sur chaque repas sélectionner.
* Sélection de composer des repas sur plusieurs jours :
  * composition du nombre de repas/jours sélectionné (matin/midi/16h/soir).
  * composition du nombre de convives par repas/jours sélectionné.
  * Recopier la configuration du 1er repas + nombre de convives sur tous les autres repas sélectionné de tous les autres jours sélectionné.
  * Composition des menus de chacun des repas sur chaque jour sélectionné + méthode de cuisson sur chaque aliment.
  * Gestion des restes.
  * Prise en charge de ce qu'il y a vraiment de disponible dans le frigo (s'il manque des aliments cela créer une liste de courses).
  * Créer chaque repas en tenant compte des objectifs par repas fixé dans l'onglet "mon compte".
  * Donne la quantité à peser cru pour avoir le cuit final avec les bonnes valeurs nutritionnelle fixé dans ses objectifs par repas (Glucide/Lipides/Protéine) par repas cuisiné.
  * Les quantités d'aliment retenu pour un repas sont bloqué pour ce repas et inutilisable pour les autres repas.
  * Batch-cooking rassemblé par méthode de cuisson avec le poids de chacun des aliments à cuire.
  * Composition des boîtes de chaque repas de chaque jour sélectionné étape 1.
  * Possibilité de revenir en arrière pour modifier le plan.
  * Possibilité d'enregistrer le plan de batch cooking.
  * Possibilité de renseigner le batch cooking comme "cuisiné", ça supprime le poids des aliments consommé par le batch cooking directement dans le stock du frigo.


