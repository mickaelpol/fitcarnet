# fitcarnet — où on en est

## Ce qui fonctionne
- Base PostgreSQL, API Symfony + API Platform, front Expo SDK 54
- Installation en une commande : ./installer.sh --email …
- 1338 exercices (20 perso + catalogue), vidéos YouTube, fusion, réordonnancement
- Séances : saisie, chrono, 1RM, courbes, sauvegarde automatique
- Modèles : glisser-déposer, propagation de l'ordre aux séances
- Calculateur de RM dans la séance
- Solveur de repas : 47 tests, ratios cru/cuit, restes à écouler
- Valeurs nutritionnelles depuis Ciqual (Anses), ratios dérivés de l'énergie
- /api/mon-frigo : aiguillage Grocy (admin) / table aliment (autres)
- Écran Mon frigo branché sur cet endpoint

## Ce qui reste
- Brancher editeurAliment.tsx : aucun bouton ne l'ouvre, rien ne l'enregistre
- Écriture des macros : champs Grocy pour l'admin, table aliment sinon
- Champs fibres et pesées côté Grocy (absents du script d'origine)
- Brancher le calculateur de repas sur /api/mon-frigo
- Composition de départ du calculateur (écran vide à l'ouverture)
- Déploiement NAS : image Docker, webhook Gitea → n8n

## Bugs connus
- Chrono de repos disparaît en partant d'un modèle (key={relance} remonte le composant)
- Vérifier que chrono et bilan ne passent pas sous la barre Android

## Décisions arrêtées
- Aliments : les 50 de référence sont communs, ceux créés par un utilisateur restent privés
- Macros saisies à la main, pas d'Open Food Facts : les écarts entre marques faussent la diète
- Convention européenne : fibres séparées des glucides, 2 kcal/g
- 1RM calculé uniquement sur les séries ≤ 15 répétitions ; au-delà, c'est le volume qui compte
- db/ = base vierge (joué par PostgreSQL) · db/manuel/ = le reste (joué par installer.sh)
