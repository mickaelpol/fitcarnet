# fitcarnet — où on en est

Dépôt : `ssh://git@gitea.mickael-pol.fr:2222/mickael/fitcarnet.git`
Développement : `~/perso/fitcarnet` (WSL)

---

## Ce qui fonctionne

**Infrastructure.** PostgreSQL 16, API Symfony 7 + API Platform 4 sur
FrankenPHP, front Expo SDK 54 (Android, iOS, web). Installation complète en
une commande : `./installer.sh --email …`, avec `--repartir-de-zero` pour
une remise à plat. Sauvegarde et restauration par `./sauvegarde.sh`.

**Exercices.** 1 338 au catalogue — 20 personnels avec leurs formats
prescrits, 1 318 importés d'un jeu de données en français. Vidéos YouTube
renseignées par l'administrateur, fiche « i » avec instructions et muscles
travaillés, fusion de deux exercices avec transfert de l'historique,
réordonnancement par glisser-déposer.

**Séances.** Saisie des séries, trois modes (charge, tenue, chrono),
chronomètre de repos et chronomètre d'effort, 1RM Epley, courbes de
progression, sauvegarde automatique, notes repliables, conversion en modèle.

**Modèles.** Glisser-déposer, propagation de l'ordre aux séances existantes,
suppression.

**Repas.** Solveur linéaire exact à 47 tests : substitution sans toucher aux
macros, restes à écouler saisissables en cru ou en cuit, calcul souple quand
il manque des variables. Valeurs nutritionnelles issues de Ciqual (Anses),
ratios cru/cuit dérivés de la conservation de l'énergie.

**Frigo.** `/api/mon-frigo` renvoie une forme unique quelle que soit la
source : Grocy pour le compte administrateur, table `aliment` pour les
autres. Écran branché dessus, groupé par emplacement.

---

## Ce qui reste

**Brancher l'éditeur d'aliment.** `front/src/composants/editeurAliment.tsx`
et `front/src/calcul/nutrition.ts` existent et sont testés, mais aucun bouton
ne les ouvre et rien ne les enregistre. Il faut : un bouton d'ajout et
d'édition sur l'écran Mon frigo, l'écriture dans les champs personnalisés
Grocy pour l'administrateur et dans la table `aliment` pour les autres.

**Champs manquants côté Grocy.** Les fibres et les deux pesées du ratio ne
sont pas posés par `ciqual_vers_grocy.py`.

**Calculateur de repas.** Toujours branché sur des données de démonstration ;
il doit lire `/api/mon-frigo`. Et l'écran s'ouvre vide — il faudrait
reprendre la composition du dernier repas du même type.

**Ajout d'ingrédients au frigo** pour les comptes ordinaires.

**Déploiement NAS.** Image Docker, webhook Gitea vers n8n, sauvegarde
automatisée de la base.

---

## Bugs connus

**Le chronomètre de repos disparaît** quand on part d'un modèle. Cause
identifiée : `key={relance}` sur `<ChronoRepos>` dans `app/seance/[id].tsx`
remonte le composant à chaque changement d'état de la séance. Correction :
faire redémarrer le chrono par une propriété plutôt que par un remontage.

**Zones basses masquées par Android.** La barre d'onglets a été corrigée avec
`useSafeAreaInsets`. Reste à vérifier la barre de chrono de la séance et la
barre de bilan du calculateur.

---

## Décisions arrêtées

**Aliments.** Les 50 de référence sont communs et vérifiés ; ceux créés par un
utilisateur lui restent privés. Sur des valeurs nutritionnelles, l'erreur de
l'un ne doit pas fausser la diète des autres.

**Macros saisies à la main**, pas d'Open Food Facts ni de code-barres : les
écarts entre deux marques suffisent à fausser une diète, l'emballage fait foi.

**Convention européenne** partout : fibres comptées séparément des glucides,
à 2 kcal/g. Mélanger avec une table américaine multiplie les glucides des
oléagineux par quatre.

**1RM calculé uniquement sur les séries de 15 répétitions ou moins.** Au-delà
on mesure l'endurance, et aucune formule ne tient : 93 répétitions à 32 kg
donneraient un 1RM supérieur à 7 répétitions à 35 kg. La progression des
efforts longs se lit sur le volume et le temps.

**Ratio cru/cuit dérivé de l'énergie.** La cuisson n'ajoute que de l'eau :
riz complet à 350 kcal secs et 187 cuits donne un ratio de 1,87, et non 3
comme supposé initialement.

**Deux dossiers SQL.** `db/` ne contient que ce qui s'applique à une base
vierge — PostgreSQL ne le joue qu'à la création. `db/manuel/` contient les
évolutions ultérieures, jouées par `installer.sh`, et doit rester idempotent.

**Les objectifs du coach sont incohérents** entre eux : le dîner annonce
551,8 kcal pour des macros qui en font 580. L'application respecte les
grammes et signale l'écart.

---

## Environnement

Front : `EXPO_PUBLIC_API_URL` dans `front/.env`.
API : `GROCY_URL` et `GROCY_API_KEY` dans `.env` à la racine.

Test sur téléphone depuis WSL : redirection `netsh portproxy` des ports 8080
et 8081 vers l'IP WSL, règles de pare-feu, et `REACT_NATIVE_PACKAGER_HOSTNAME`
avec l'IP réelle du PC — celle qu'annonce Expo peut être fausse.
