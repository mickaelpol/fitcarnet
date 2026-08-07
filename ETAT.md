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
autres. Écran branché dessus, groupé par emplacement, avec recherche sur le
nom et l'emplacement.

**Unités de stock.** Chaque aliment porte son unité et le poids en grammes
d'une unité, lus dans Grocy (`quantity_units`, `quantity_unit_conversions_
resolved`). Un œuf déclaré « 1 pièce = 65 g » affiche « soit 715 g » pour
11 pièces. Ce qui n'a pas de poids connu — litre, pack — est nommé à l'écran
et écarté du calculateur.

**Éditeur d'aliment, côté Grocy.** Bouton sur une carte du frigo,
`POST /api/mon-frigo/aliment` écrit les neuf champs personnalisés. Le nom et
l'état de référence sont verrouillés : Grocy est maître du premier, et le
second s'y déduit de la catégorie au lieu d'être stocké. Une valeur absente
est écrite vide et non omise, sans quoi effacer une fibre saisie par erreur
serait impossible.

**Détection des kilojoules.** Les étiquettes affichent « 1473 kJ / 352 kcal »,
les kJ en premier. Deux garde-fous : le plafond de 900 kcal pour 100 g, et le
rapport aux macros quand il serre 4,184 à 10 % près. Un bouton convertit.
Aucun des deux n'attrape un aliment peu calorique saisi sans macros.

**Inventaire.** Mode dédié dans l'onglet Frigo, pour les deux sources. Champs
préremplis avec le stock connu, case « vérifié » purement visuelle, envoi
explicite en fin de parcours et des seuls écarts. Les appels Grocy partent en
parallèle, plafonnés à 60 lignes par envoi.

**Aliments d'un compte ordinaire.** Ajout depuis un catalogue de référence —
on tape, il propose, les macros arrivent préremplies — ou création de zéro.
Correction et suppression depuis la carte. La suppression est refusée tant
qu'il reste du stock, avec le motif à l'écran. Le frigo ne contient que ses
propres aliments : les 50 de référence servent de point de départ, pas de
garnissage. Éprouvé sur un compte d'essai, neuf cas passés.

**Chronomètre de repos.** Cocher une série relance le décompte sur la durée
choisie. Le redémarrage passe par une propriété `relance` et non par un
`key` : un remontage réinitialisait aussi le préréglage, qui retombait à
1:30 dès la première série cochée.

---

## Ce qui reste

**Champs Grocy remplis à la main.** Les trois champs personnalisés
`fibres100`, `pesee_avant` et `pesee_apres` existent désormais dans Grocy et
l'éditeur les écrit, mais `ciqual_vers_grocy.py` ne les pose toujours pas à
l'import.

**Calculateur de repas.** Toujours branché sur des données de démonstration ;
il doit lire `/api/mon-frigo`. Et l'écran s'ouvre vide — il faudrait
reprendre la composition du dernier repas du même type.

**`nutrition.ts` et `frigo.ts` sans tests permanents.** `tsconfig.tests.json`
ne compile que `src/solveur` : la détection des kilojoules et le calcul des
écarts d'inventaire ont été vérifiés à la main, une fois, hors de `npm test`.

**Déploiement NAS.** Image Docker, webhook Gitea vers n8n, sauvegarde
automatisée de la base.

---

## Bugs connus

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

**L'unicité du nom d'un aliment est PAR PROPRIÉTAIRE.** Deux index partiels,
pas une contrainte globale : un nom commun est unique parmi les communs, un
nom privé l'est chez son propriétaire seulement. La contrainte globale
d'origine rendait le modèle des aliments privés inapplicable — deux comptes
ne pouvaient pas nommer pareil. Doctrine ne sait pas exprimer un index
partiel : le doublon se rattrape à l'insertion, dans `AlimentProcessor`.

**Les décimaux se lisent en nombres et s'écrivent en chaînes.** L'extracteur
Doctrine passe avant la réflexion PHP dans `property_info` et déclare un
`DECIMAL` comme `string` : le dénormaliseur refuse un nombre. La lecture, elle,
passe par les accesseurs typés `float`. L'asymétrie est assumée et tient dans
`versDecimales()`, côté front.

**Aucune unité n'est convertie à l'aveugle.** Le kilogramme et la pièce se
ramènent au gramme quand Grocy porte la conversion, et seulement alors. Le
litre et le pack ne se convertissent pas : il faudrait une densité ou un
poids unitaire qu'on n'a pas. Un aliment sans poids connu est nommé à l'écran
et écarté du calculateur, jamais deviné. L'inventaire, lui, reste dans
l'unité native — on compte 6 œufs, on écrit 6, Grocy reçoit 6 pièces, donc
aucun aller-retour de conversion où glisser une erreur.

**Un champ d'inventaire vide n'est pas un zéro.** Vide veut dire « pas encore
compté » et ne part pas ; zéro veut dire « il n'y en a plus » et part.
Confondre les deux viderait le frigo de tout ce qu'on n'a pas eu le temps de
peser. Seuil d'écart à 0,001 : en deçà c'est l'arrondi d'affichage.

**Un champ de saisie garde le texte, pas le nombre.** Piloter l'input avec
`String(parseFloat(v))` interdisait « 0,8 » : il faut traverser « 0 » puis
« 0, », deux états que `parseFloat` écrase. Le bug a vécu jusqu'à ce que
l'éditeur serve pour de bon.

**Les champs personnalisés Grocy se lisent dans `/objects/products`**, jamais
produit par produit. Grocy les renvoie déjà sous la clé `userfields` de chaque
produit. Les relire un par un sur `/userfields/products/{id}` coûtait un appel
HTTP par produit : 62 appels à 1,5 s pour 59 produits, soit 93 s pour une
limite PHP de 30 s. La lecture du frigo mourait en cours de route et renvoyait
une page HTML sans en-tête CORS, ce qui donnait l'illusion d'un problème de
CORS. Toute nouvelle donnée Grocy doit se prendre dans la liste, pas la
détailler.

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
