# fitcarnet — où on en est

Dépôt : `ssh://git@gitea.mickael-pol.fr:2222/mickael/fitcarnet.git`
Développement : `~/perso/fitcarnet` (WSL)

---

## Ce qui fonctionne

**Infrastructure.** PostgreSQL 16, API Symfony 7 + API Platform 4 sur
FrankenPHP, front Expo SDK 54 (Android, iOS, web). Installation complète en
une commande : `./installer.sh --email …`, avec `--repartir-de-zero` pour
une remise à plat. Sauvegarde et restauration par `./sauvegarde.sh`.

**Sessions.** Une session se termine sur un clic « Se déconnecter », et sur
rien d'autre. Le jeton JWT dure une heure ; à son expiration l'application le
renouvelle en silence à partir d'un jeton de rafraîchissement gardé en base,
rejoue l'appel, et l'utilisateur ne voit rien. Les appels simultanés partagent
un seul renouvellement. Si le renouvellement est refusé — jeton révoqué,
échéance dépassée — retour à l'écran de connexion et cache vidé.

**Exercices.** 1 338 au catalogue — 20 personnels avec leurs formats
prescrits, 1 318 importés d'un jeu de données en français. Vidéos YouTube
renseignées par l'administrateur, fiche « i » avec instructions et muscles
travaillés, fusion de deux exercices avec transfert de l'historique,
réordonnancement par glisser-déposer.

**Séances.** Saisie des séries, trois modes (charge, tenue, chrono),
chronomètre de repos et chronomètre d'effort, 1RM Epley, courbes de
progression, sauvegarde automatique, notes repliables, conversion en modèle.
La sauvegarde automatique ne navigue plus : elle greffe les identifiants
rendus par le serveur sur l'état local, ce qui évite de jeter la saisie des
deux secondes et demie d'attente. Le motif d'un échec est affiché en clair.

**Mesure d'effort qui survit au changement de mode.** L'état vit dans
`src/composants/etatMesure.ts`, pas dans le composant. Basculer Charge /
Tenue / Chrono, replier l'exercice ou faire défiler la séance n'interrompt
plus le décompte ; un bandeau en haut de l'écran le garde sous les yeux et
porte le verrou d'écran. Le temps garde sa destination d'origine — une tenue
lancée sur la série 2 s'écrit dans la série 2. Une seule mesure à la fois.
Six tests, dont le réordonnancement pendant la mesure.

**Modèles.** Glisser-déposer, propagation de l'ordre aux séances existantes,
suppression.

**Repas.** Solveur linéaire exact : substitution sans toucher aux macros,
restes à écouler saisissables en cru ou en cuit, calcul souple quand il manque
des variables. Valeurs nutritionnelles issues de Ciqual (Anses).

**Calculateur de repas.** Branché sur `/api/mon-frigo`. On coche les repas du
jour et le nombre de convives, l'application compose depuis le stock réel, on
corrige, elle recalcule. Quatre colonnes :

| aliment | à cuire | cuit | 1 pers. |

**« À cuire » est ce qu'on pose sur la balance, sur TOUTES les lignes** — riz
sec, viande crue, légume cru. « Cuit » dit ce qui sortira de la casserole,
« 1 pers. » ce qu'on met dans une assiette. Et le contenu de cette assiette
porte exactement les macros du repas réglées dans le compte : c'est le contrat
de l'écran, et deux tests le vérifient sur mille scénarios.

Le stock a le dernier mot — quantités ajustables ET imposées. Une quantité
plafonnée est annoncée, et le manque confié à un autre aliment du même rôle.

**Garde-fou sur les données.** `src/calcul/plausibilite.ts` regarde chaque
aliment du frigo et se demande si ce qu'il raconte est physiquement possible :
rendement à contresens, plus de 100 g de nutriments dans 100 g de produit,
calories qui ne collent pas aux macros, couple rendement/macros impossible. Ce
qu'il trouve s'affiche en tête du calculateur, avant de composer.

**Tests.** 211 côté front (`npm test`), 93 + 17 côté Python, 45 côté PHP.

Le gros morceau est `src/solveur/garanties.test.ts` : 250 frigos tirés au sort
— avec une graine fixe, donc rejouables à l'identique — × 4 repas, soit mille
scénarios, sur lesquels une trentaine de PROPRIÉTÉS doivent tenir. Pas des cas :
des phrases qui doivent rester vraies quoi qu'il arrive. « Les macros annoncées
sont celles des grammes du tableau », « aucune quantité ne dépasse ce qu'il
reste », « ce qui est dans une assiette porte les macros du compte ».

`test_ecriture_grocy.py` lance le VRAI script d'import contre un Grocy factice
qui refuse comme le vrai. C'est le seul moyen d'attraper une panne d'écriture ;
sans lui, un champ manquant n'a été découvert qu'en production.

**Chaque garde-fou est vérifié par mutation** : on casse le code sur un point
précis, on regarde le test tomber. Un test qui passe quoi qu'il arrive ne
protège rien.

`tsconfig.tests.json` liste les fichiers testés — **toute nouvelle cible doit
y être ajoutée**, sinon le test compile mais ne s'exécute jamais.

**Import Ciqual.** `ciqual_vers_grocy.py` écrit les macros et `fibres100`.
Absente de la table, la valeur part vide et non à zéro : « inconnu » et
« aucune fibre » ne se valent pas. Le script crée lui-même les champs
personnalisés Grocy dont il a besoin, et n'écrit jamais les pesées.

Il signale ce qu'il ne peut pas trancher seul : un appariement dont un mot
décisif — `naturel`, `huile`, `complet`, `écrémé` — ne figure que d'un côté,
un couple rendement/macros impossible, une énergie qui ne colle pas. Et il
laisse intact tout produit marqué `source_valeurs = moi`.

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

**Frigo à deux modes.** Un seul écran, deux boutons « stock » / « inventaire ».
Même en-tête, même liste, même barre basse dans les deux : basculer ne donne
plus l'impression de changer de page. La quantité ne se saisit qu'en mode
inventaire ; cocher une ligne barre son nom.

**Inventaire.** Pour les deux sources. Champs préremplis avec le stock connu,
case « vérifié » purement visuelle, envoi explicite en fin de parcours et des
seuls écarts. Les appels Grocy partent en parallèle, plafonnés à 60 lignes par
envoi. Mettre une quantité à zéro conserve la ligne et son emplacement, sans
quoi l'aliment perdait son rangement dès qu'il était épuisé.

**Aliments d'un compte ordinaire.** Ajout depuis un catalogue de référence —
on tape, il propose, les macros arrivent préremplies — ou création de zéro.
Correction et suppression depuis la carte. La suppression est refusée tant
qu'il reste du stock, avec le motif à l'écran. Le frigo ne contient que ses
propres aliments : les 50 de référence servent de point de départ, pas de
garnissage. Éprouvé sur un compte d'essai, neuf cas passés.

**Chronomètre de repos.** Cocher une série relance le décompte sur la durée
choisie. Le redémarrage passe par une propriété `relance` et non par un
`key` : un remontage réinitialisait aussi le préréglage, qui retombait à
1:30 dès la première série cochée. L'état vit dans
`src/composants/etatChrono.ts` : quitter l'écran de séance n'arrête plus le
repos. Le décompte se lit sur une heure de fin, pas sur un compteur
décrémenté — l'application mise en arrière-plan ne le fige plus.

**Alarme de fin de repos portée par Android.** Une notification locale est
programmée à l'heure de fin et annulée si le chrono est arrêté ou relancé.
Ça sonne et ça vibre application fermée, téléphone verrouillé. Au premier
plan c'est l'application qui sonne, avec la sonnerie choisie ; la
notification est alors rendue muette pour ne pas doubler le signal. Si le
retour se fait plus d'une seconde et demie après zéro, on ne re-sonne pas :
c'est l'alarme qui a fait le travail.

**Sonneries.** Cinq sons dans `front/assets/sons/`, choisis dans
« Mon compte → Réglages de l'app », `buzzer` par défaut. Le choix est
enregistré sur l'appareil, pas sur le compte : une sonnerie dépend du
téléphone et de son volume, pas de qui s'y connecte.

**En-tête maison.** `src/composants/enTete.tsx`, branché une seule fois dans
`app/_layout.tsx`. Remplace l'en-tête natif de `react-native-screens`, qui
passait sous l'horloge et les icônes de notification.

**Verrou d'écran.** `src/composants/ecranEveille.ts` détient le verrou et le
relâche quand l'application passe en arrière-plan. Ferme la course entre
l'activation asynchrone et la désactivation synchrone, qui laissait l'écran
allumé indéfiniment.

---

## Ce qui reste

**Calculateur, étapes 2 et 3.** L'étape 1 — aujourd'hui — sert tous les
jours. Restent le calendrier sur plusieurs jours avec le contrôle du stock
CUMULÉ, puis le batch cooking. Voir `CALCULATEUR.md`.

**Les rendements non mesurés.** Ceux des légumes et de quelques féculents
valent 1 faute de mesure. Sans conséquence sur les macros — elles se comptent
sur le poids pesé — mais la colonne « cuit » reste approximative tant qu'une
pesée n'a pas été faite.

**Déploiement NAS.** Image Docker, webhook Gitea vers n8n, sauvegarde
automatisée de la base. Un dev build EAS fait partie du lot.

**Sonnerie personnalisée hors de l'application.** Impossible sous Expo Go :
Android ne joue, sur une notification, qu'un fichier empaqueté dans les
ressources natives. Et comme un canal est figé à sa création, offrir cinq
sonneries au choix demandera cinq canaux, un par son. À faire avec le dev
build.

---

## Bugs connus

**Zones masquées par Android : rien ne reste.** Barre d'onglets, barre
d'envoi du frigo, barre de chrono de la séance et en-tête : corrigés avec
`useSafeAreaInsets`. La barre de bilan du calculateur n'avait pas de
problème — vérifié dans `BottomTabView` : les écrans d'onglet sont rendus
dans un conteneur `flex: 1` **au-dessus** de la barre d'onglets, jamais
dessous. Un `bottom: 0` dans un écran d'onglet s'arrête donc au sommet de la
barre, qui porte déjà le retrait système.

**Retrait redondant dans le frigo.** Conséquence du point ci-dessus : la
barre d'envoi ajoute `insets.bottom` alors que la barre d'onglets le compte
déjà. Ça laisse quelques dizaines de pixels de vide au bas de l'écran.
Cosmétique, non corrigé — la barre reste accessible.

---

## Décisions arrêtées

**Aliments.** Les 50 de référence sont communs et vérifiés ; ceux créés par un
utilisateur lui restent privés. Sur des valeurs nutritionnelles, l'erreur de
l'un ne doit pas fausser la diète des autres. **Le frigo d'un compte ordinaire
ne montre que ses propres aliments** : les 50 de référence servent de
suggestions à la création, pas de garnissage. Tout le monde part de zéro.

**Macros saisies à la main**, pas d'Open Food Facts ni de code-barres : les
écarts entre deux marques suffisent à fausser une diète, l'emballage fait foi.

**Convention européenne** partout : fibres comptées séparément des glucides,
à 2 kcal/g. Mélanger avec une table américaine multiplie les glucides des
oléagineux par quatre.

**1RM calculé uniquement sur les séries de 15 répétitions ou moins.** Au-delà
on mesure l'endurance, et aucune formule ne tient : 93 répétitions à 32 kg
donneraient un 1RM supérieur à 7 répétitions à 35 kg. La progression des
efforts longs se lit sur le volume et le temps.

**Un JWT ne se révoque pas.** Il vaut jusqu'à son échéance, même après une
déconnexion. C'est pourquoi il dure une heure et non un jour, et pourquoi ce
qui tient la session ouverte est un jeton de rafraîchissement gardé en base,
lui révocable. La table n'en garde que le SHA-256 : une fuite ne livre aucune
session utilisable.

**Le jeton de rafraîchissement n'est PAS remplacé à chaque usage.** La
rotation détecterait un vol, mais déconnecterait définitivement à chaque
réponse perdue entre le serveur et le téléphone — coupure de réseau,
application tuée au mauvais moment. Sur une application qui promet de ne
déconnecter que sur demande, ce compromis se paie trop cher. L'échéance est
repoussée à chaque usage : une application qui sert ne déconnecte jamais, un
téléphone abandonné finit par expirer au bout d'un an.

**Renouveler et se déconnecter passent hors du pare-feu JWT.** Un pare-feu
`jwt` répond 401 avant d'atteindre le contrôleur dès qu'un en-tête
`Authorization` invalide traîne dans la requête — or c'est précisément le cas
quand on appelle ces routes. D'où un pare-feu `session` en `security: false`,
placé **avant** `api` dans `security.yaml` : le premier motif qui correspond
gagne. Ces routes s'authentifient par le jeton de rafraîchissement, dans le
corps et jamais dans l'URL, qui finirait dans les journaux du serveur.

**Le script d'import n'écrit jamais `pesee_avant` ni `pesee_apres`.**
L'application les présente comme « mesuré : 100 g avant cuisson → 187 g
après ». Or le script ne pèse rien : il divise deux énergies Ciqual. Y poser
100 et 187 ferait passer une dérivation pour une mesure, et effacerait les
pesées réelles à chaque réimport.

**Une pesée de l'utilisateur gagne À LA LECTURE, pas à l'écriture.** Le
rendement n'est plus une colonne qu'on espère à jour : `AlimentDisponible` le
DÉRIVE des deux pesées quand elles existent. Aucun import ne peut donc plus
l'écraser, ni côté Grocy ni côté base — la règle s'applique au moment où on
lit, quoi qu'il ait été écrit avant. Elle vaut pour l'administrateur comme
pour un compte ordinaire : les deux ont le même bouton « je préfère mesurer ».

Le rendement était auparavant réécrit par le script à chaque passage, et une
pesée de riz — 84 g secs pour 393 g cuits — avait été jetée en silence pour
« écart avec Ciqual ». Une mesure et une table ne se contredisent pas : elles
décrivent deux produits différents.

Seule exception, et elle ne se discute pas : une mesure à CONTRESENS — une
viande qui grossirait en cuisant, un féculent qui rétrécirait. Là, les deux
colonnes de l'écran s'inverseraient. La table reprend la main, et l'écart est
annoncé au lieu d'être tu.

**Ce qui est saisi à la main n'est jamais réécrit.** Aucune table ne couvre
tout : Ciqual n'a pas de sardine « au naturel », seulement du cru, du grillé
et cinq versions à l'huile de 194 à 224 kcal. Pour ces produits, l'étiquette
de la boîte bat n'importe quelle moyenne. Le produit porte donc
`source_valeurs = moi` dès que l'application écrit ses macros, et le script
d'import le saute. Sans cette marque, recopier une étiquette ne servait à
rien : le prochain import reprenait la main.

**Le rendement cru/cuit ne se dérive de l'énergie QUE pour un grain sec.**
L'hypothèse — la cuisson n'ajoute que de l'eau, donc l'énergie se conserve —
est vraie d'un grain, qui absorbe sans rien perdre. Elle est FAUSSE d'un
légume à l'eau bouillante, dont les sucres partent dans la casserole. Étendue
aux légumes, elle donnait un épinard à 1,70 : il aurait fallu en peser 119 g
crus pour en servir 200 g cuits, quand il en faut 500 à 700. Facteur cinq,
dans le mauvais sens, sur toutes les portions de légumes. Le script refuse
maintenant de démarrer si un légume figure dans cette table.

**Un légume se pèse CRU, comme une viande.** 200 g de brocoli sur la balance,
150 g dans l'assiette après la vapeur : personne ne pèse un légume après
cuisson. Tant qu'ils portaient leurs valeurs cuites, la colonne « à cuire » ne
pouvait être juste qu'en connaissant leur rendement — et il n'est pas
dérivable. Référencés au cru, tout rentre dans l'ordre : à la vapeur seule
l'eau part, les nutriments de 200 g de brocoli cru sont encore dans les 150 g
cuits. Le rendement ne sert alors plus qu'à AFFICHER le poids servi, et peut
être approximatif sans qu'une macro bouge.

**L'état de référence se DÉDUIT de la catégorie, il ne se stocke pas.** Il y
a eu deux règles pour la même chose : Grocy la déduisait, la base la lisait
dans une colonne qui pouvait dire le contraire. Les deux rendaient pourtant le
même `AlimentDisponible`, et rien ne pouvait signaler qu'elles divergeaient —
un compte ordinaire dont la colonne portait « cru » sur un féculent mangeait
jusqu'à trois fois trop de glucides. La règle vit dans
`App\Service\EtatReference` et `AlimentDisponible` la dérive : la divergence
est devenue impossible à écrire. La colonne survit pour l'historique et ne
décide plus rien.

**La colonne « à cuire » d'un féculent est exacte même si son rendement est
faux.** Les macros cuites sont les macros sèches divisées par le rendement, et
le poids à peser est le poids cuit divisé par ce même rendement : il se
simplifie. Seule la colonne « cuit » en dépend. Conséquence contre-intuitive
et importante : **il faut peser le féculent SEC.** Peser le poids cuit affiché
quand le rendement est faux fait manger jusqu'à deux fois moins de glucides
que prévu. Trois tests verrouillent cette propriété.

**Deux dossiers SQL.** `db/` ne contient que ce qui s'applique à une base
vierge — PostgreSQL ne le joue qu'à la création. `db/manuel/` contient les
évolutions ultérieures, jouées par `installer.sh`, et doit rester idempotent.
Elles sont exécutées dans l'ordre alphabétique, ce qui vaut ordre numérique
tant qu'on préfixe : `15-legumes-peses-crus.sql` remplace les contraintes
posées par `14-etat-reference-coherent.sql` et n'a de sens qu'après lui.

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
`versDecimales()` pour les aliments, `seanceEnEcriture()` et
`modeleEnEcriture()` pour `poids` et `poidsCible`, côté front. **Toute
nouvelle colonne `DECIMAL` doit passer par là**, sinon l'écriture échoue avec
« The type of the "x" attribute must be "string" ».

**« series » est invariant pour l'inflecteur Symfony.** API Platform cherche
donc `addSeries()` / `removeSeries()`, quand Doctrine génère `addSery()` /
`removeSery()`. Sans les alias, une séance s'enregistrait avec
`"series": []` — les séries partaient à la poubelle en silence. Les alias
sont dans `SeanceExercice` et `ModeleExercice`.

**Les contraintes d'ordre sont DIFFERABLE INITIALLY DEFERRED.** Quand
Doctrine remplace une collection, il émet les INSERT avant les DELETE : deux
lignes portent la même `(seance_id, ordre)` le temps d'un instant, et une
contrainte ordinaire, vérifiée à chaque instruction, refuse. Le même piège
frappe un simple réordonnancement. Voir
`db/manuel/11-contraintes-differables.sql`.

**Un canal de notification Android est figé à sa création.** Ni le son, ni
l'importance, ni la vibration ne se modifient ensuite — seuls le nom et la
description. Corriger un réglage impose de créer un canal au nom nouveau et
de supprimer l'ancien. Et le champ `sound` attend le nom d'un **fichier**
empaqueté : y mettre « default » fait chercher un fichier de ce nom,
introuvable, et le canal devient muet. Absent, Android retient le son de
notification du téléphone.

**Les notifications locales marchent dans Expo Go, pas les push.** Retirées
d'Expo Go sur Android au SDK 53. `expo-notifications` le signale par un
`console.error` au chargement du module, que LogBox affiche en rouge plein
écran alors qu'aucune erreur n'a eu lieu. Filtré, et lui seul, dans
`src/composants/silenceExpoGo.ts`.

**Ce qui doit survivre à un démontage ne vit pas dans un composant.** Chrono
de repos, mesure d'effort : leur état est dans un module qui expose un
abonnement, et le composant n'en est que la vue. C'est ce qui permet de
quitter l'écran, de changer de mode ou de replier une carte sans perdre ce
qui court. Un décompte se lit toujours sur une heure de fin, jamais sur un
compteur décrémenté par un minuteur — Android gèle les minuteurs en
arrière-plan.

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
