# Calculateur de repas — parcours et décisions

Ce document sert de référence pendant la construction. Il dit ce que fait
l'écran, dans quel ordre, et pourquoi chaque choix a été fait plutôt qu'un
autre. Tout ce qui y figure a été arrêté avec Mickaël ; ce qui reste à
trancher est marqué **À TRANCHER**.

**Les étapes 1 et 2 sont livrées.** L'étape 3 — le batch cooking — reste à
faire. Ce qui suit décrit le parcours complet ; les écarts entre le texte et
le code sont signalés au fil.

**Un seul jour n'est pas un cas particulier.** C'est une période de longueur
1, et `resoudreLaJournee` n'est plus qu'un appel à `resoudreLaPeriode`. Il n'y
a donc pas deux chemins de code dont un seul serait éprouvé : un défaut de
partage du stock se verrait des deux côtés à la fois.

**Les jours sont manipulés en RANG, jamais en date.** Le solveur n'a besoin
que de l'ordre ; lui donner une date l'obligerait à connaître un fuseau, un
calendrier et un changement d'heure pour répondre « lequel vient d'abord ».
L'écran numérote ses jours — 0 pour aujourd'hui, 3 pour dans trois jours — et
le solveur reprend ces rangs tels quels dans ses clés de sortie. Une
traduction de moins, c'est une occasion de moins d'attribuer les repas d'un
jour à un autre.

---

## Ce que le calculateur n'est pas

**Il ne produit pas de recettes de cuisine.** Pas de titre, pas d'étapes, pas
de temps de cuisson. Il produit une liste d'aliments avec leurs quantités —
« 120 g de riz sec, 150 g de poulet cru, 200 g de brocolis, 10 g d'huile » —
et les macros correspondantes. C'est une liste de pesées, et c'est
exactement ce que le solveur sait faire depuis ses 47 tests.

**Rien n'est enregistré.** Le plan est un outil d'organisation, pas un
journal. On ferme l'écran, tout disparaît. Aucun stock n'est décrémenté :
c'est l'inventaire du frigo qui fait foi, et lui seul.

**Le nombre de personnes ne multiplie pas des besoins, il multiplie des
portions.** Une portion vaut TES cibles macro, celles des réglages du compte.
Cuisiner pour 3, c'est cuisiner 3 fois la même portion. Ta famille n'a pas
tes besoins, mais elle ne pèse rien : la colonne « dans l'assiette pour une
personne » existe pour que TOI tu te serves au gramme près, le reste part
sans balance.

---

## Le parcours

### 1. Pour quand ?

Un **interrupteur** « plusieurs jours ». Un interrupteur et non deux boutons :
deux boutons obligent à lire lequel est enfoncé, un interrupteur dit tout seul
dans quel état il est.

Activé, il ouvre un **calendrier mensuel** — grille lundi → dimanche, flèches
de mois, aujourd'hui cerclé, passé non cliquable. Une bande de dates à faire
défiler cachait ce qu'on cherche : on planifie sa semaine en la voyant, pas en
la parcourant.

Chaque jour porte ses quatre repas, avec sa propre case et son propre nombre
de personnes — on ne mange pas à trois tous les soirs. Un bouton **« recopier
ce jour sur les autres »** évite de re-régler vingt-huit champs pour une
semaine.

**Tout se plie, à deux niveaux** : le jour, et le repas à l'intérieur. Sept
jours de quatre lignes font vingt-huit blocs, et plus rien de lisible. Deux
règles tenues par le composant `Pliant` plutôt que par chaque écran :

- **replié, un encart dit toujours l'essentiel** — « 3 repas · 5 portions »
  au réglage, « 4 repas · 1 hors cible » une fois composé. On ouvre pour
  AGIR, jamais pour savoir ;
- **un seul jour ouvert à la fois** — sept encarts dépliés reproduiraient
  exactement le mur qu'on veut éviter.

L'action principale est **collée en bas**, hors du défilement : avec sept
jours, la laisser en fin de page obligeait à dérouler pour lancer le calcul
puis à remonter pour corriger.

- *Aujourd'hui* : pas de calendrier. On affiche directement l'en-tête du jour
  et ses quatre repas.
- *Plusieurs jours* : un calendrier. Chaque jour sélectionné ajoute en
  dessous un bloc avec son en-tête — « lundi 12/08 » — et ses quatre repas.

### 2. Quels repas, pour combien de personnes ?

Sous chaque en-tête de jour, quatre lignes : **Matin**, **Midi**, **16 h**,
**Soir**. Chacune porte une case à cocher et un champ « personnes ».

Les quatre repas viennent de la table `cible` (`R1` à `R4`) : ce sont les
mêmes que ceux de tes réglages, et chacun a ses propres cibles macro.

### 3. L'app propose, tu corriges, elle recalcule

**C'est l'étape qui porte tout le reste.** Le paramétrage validé, l'app
compose chaque repas sélectionné et te les soumet — un ou plusieurs jours,
tous à l'écran en même temps.

Chaque repas montre ses aliments. Chaque aliment peut être remplacé par un
autre. **Toute substitution relance le calcul du repas concerné** : les
quantités de tous ses autres aliments sont recalculées pour retomber sur les
cibles macro de ce repas-là. Sinon la substitution serait cosmétique et les
macros seraient fausses.

Rien n'est figé tant que tu n'as pas validé. Tu peux corriger dix aliments,
relire, en corriger un onzième. C'est seulement à la validation qu'on passe à
la suite.

Le changement reste **local au repas** : remplacer le poulet du lundi midi ne
touche ni le mardi midi ni le lundi soir. Ce qu'on touche change, le reste
est stable.

La liste proposée à la substitution ne contient que des aliments **en stock**
et du même rôle que celui qu'on remplace.

**Une substitution n'engage que le repas qu'on regarde.** Remplacer le poulet
par du saumon à midi n'exclut pas le poulet des midis suivants : rien n'est
retenu, rien n'est banni. Voir « la cohérence des repas ».

**Mettre un reste à 0 écarte l'aliment** sans le remplacer, et le repas se
recalcule autour des autres. Zéro est une quantité comme une autre — « je n'en
mets pas » — et se distingue d'un champ laissé vide.

### 4. Repas par repas, ou batch cooking ?

Un choix qui ne change QUE la restitution, jamais le contenu : les repas
validés à l'étape précédente sont les mêmes dans les deux cas. C'est pour
cela qu'il vient après et non avant — regrouper des fournées n'a de sens que
sur un contenu arrêté.

**Repas par repas.** Une ligne par repas sélectionné, pliée par défaut —
« lundi · Midi », « lundi · Soir ». Dépliée, elle montre les aliments, leurs
quantités et les macros atteintes. Le pliage n'est pas un détail de
présentation : sur cinq jours et quatre repas, vingt blocs dépliés seraient
illisibles.

**Batch cooking.** Tout est cuisiné d'un coup. On regroupe par fournée ce qui
partage un mode de cuisson et une température, et on termine par le tableau
de répartition.

### 5. Le tableau — quatre colonnes

C'est la forme de l'écran d'aujourd'hui, et elle vaudra telle quelle pour le
batch cooking.

| aliment | à cuire | cuit | 1 pers. |
|---|---|---|---|

- **à cuire** : ce qu'on pose sur la balance, avant cuisson, pour toutes les
  portions. Riz **sec**, viande **crue**, légume **cru** — sans exception.
- **cuit** : ce que ça pèsera après, d'après le rendement de l'aliment.
- **1 pers.** : la part d'une seule personne, et **c'est elle qui porte les
  macros du repas au gramme près**.

Le nom de la colonne compte : « à cuire » et non « cru », parce qu'un riz se
pèse SEC et non cru. Le mot juste évite la faute.

**Pourquoi peser cru et manger cuit revient au même.** La cuisson ne détruit
ni protéine, ni glucide, ni lipide : elle ne déplace que de l'eau. Les
nutriments de 200 g de brocoli cru sont encore dans les 150 g cuits. Compter
sur le poids pesé est donc exact — et c'est le SEUL état que l'application
connaisse désormais. Il y a eu un champ pour dire si les valeurs se
rapportaient au cru ou au cuit ; il a été supprimé, avec tout le code qui
rattrapait ses contradictions (voir `ETAT.md`).

**Un piège qui a coûté cher.** Pour un féculent, le rendement se simplifie
entre les deux colonnes : le poids à peser est le même à 2,26 comme à 4,68,
seule la colonne « cuit » en dépend. Il faut donc **peser le sec** ; peser le
poids cuit affiché quand le rendement est faux fait manger jusqu'à deux fois
moins de glucides. Trois tests verrouillent la propriété.

---

## La liste de courses

Le plan dit ce qu'il faut cuisiner ; la liste dit ce qu'il faut acheter pour
y arriver.

**Elle ne se déduit PAS des manques du plan**, et c'est le piège de ce
calcul. Le solveur ne subit pas une pénurie, il la CONTOURNE : à court de
brocoli il sert des haricots, et le plan qui en sort tient donc, par
construction, dans le frigo. Compter ses manques répondrait « rien à
acheter » — exact, et inutile.

On résout donc la période **deux fois** : une fois bridée par le frigo, qui
dit ce qu'on peut cuisiner ce soir, et une fois frigo plein, qui dit ce que le
plan réclame idéalement. La liste est la seconde moins le stock réel.

Les grammes sont arrondis **au-dessus** : acheter 94 g quand il en faut 94,3
fait rater le dernier repas d'un cheveu. En dessous de 5 g manquants, rien
n'est proposé — une liste encombrée de « 2 g d'huile » nés d'un arrondi ne se
lit pas.

---

## Ce qui reste modifiable dans un repas

Les deux fonctions les mieux testées de l'app ne disparaissent pas — elles se
rebranchent. Aujourd'hui tu composes le repas à la main puis tu ajustes ;
demain l'app propose et tu ajustes pareil. Le solveur ne voit pas la
différence.

**Substituer un aliment** — décrit à l'étape 3 : c'est le geste central du
parcours, pas une option.

**Écouler un reste.** Saisie à la main, repas par repas, comme aujourd'hui :
« il me reste 100 g de riz cuit », et le solveur recompose autour. Aucun
report automatique d'un repas au suivant — l'app n'invente jamais un reste
que tu n'as pas, et ne décide pas à ta place de ce que tu gardes.

---

## Le stock

Le calculateur ne propose que ce qui est dans ton frigo, et **aucune quantité
ne dépasse ce qu'il en reste** — ni les quantités ajustables, ni les
quantités imposées. Longtemps seules les premières étaient confrontées au
stock : le légume, l'huile et les blancs d'œufs passaient au travers, et
l'application affichait sereinement 200 g de brocoli quand il en restait 60.

Un aliment plafonné devient une quantité imposée, et le manque est confié à un
AUTRE aliment du même rôle : 200 g de saumon plus du poulet pour le reste des
protéines. S'il n'y a plus personne pour prendre le relais, la macro n'est
plus atteignable et c'est dit en clair, plutôt que de promettre un repas
impossible.

**Le cumul est fait sur la journée.** Les repas cochés ensemble sont résolus
en UNE passe, dans l'ordre matin → soir, sur un stock qui décroît
(`resoudreLaJournee`). Sans cela, le déjeuner et le dîner réclamaient chacun
400 g de brocoli quand il n'en restait que 500 : deux repas annoncés justes,
dont un impossible, et rien ne le disait.

**Le partage suit l'ordre des repas.** Chacun prend ce dont il a besoin, le
suivant compose sur ce qui reste, et le dernier hérite du manque. C'est un
choix : mieux vaut trois repas justes et un recomposé proprement autour de ce
qui reste que quatre repas légèrement faux. Le manque n'est jamais tu — il est
plafonné, annoncé, et confié à un autre aliment du même rôle.

L'ordre ne dépend pas de celui dans lequel l'écran passe les repas : sinon la
présentation déciderait du partage.

Le cumul vaut désormais sur **toute la période**, pas seulement sur la
journée. Le mécanisme est le
même, il ne lui manque que des repas supplémentaires à enchaîner.

Un aliment sans poids connu — litre, pack — reste écarté du calcul, comme
partout ailleurs dans l'app. On ne devine pas une densité.

---

## La cohérence des repas

**Le problème.** On ne mange pas de flocons d'avoine le soir, ni de patate
douce au petit-déjeuner. Aucune propriété nutritionnelle ne les distingue :
même catégorie `fec`, profils voisins. Ce qui les sépare est une convention
culturelle qu'aucun algorithme ne retrouvera dans les données.

**On ne la modélise pas.** L'utilisateur remplace ce qui ne lui convient pas,
et c'est tout. Rien n'est retenu, rien n'est exclu, ni en base ni sur
l'appareil.

Une mémoire des substitutions a été construite puis retirée, et la raison
mérite d'être gardée : **elle ne peut pas distinguer les deux intentions
derrière le même geste.** « L'avoine n'a rien à faire à midi » et « aujourd'hui
j'ai envie de saumon » produisent exactement la même substitution. Une app qui
en déduit une règle permanente bannit un aliment que l'utilisateur voulait
simplement remplacer une fois — et il ne comprend pas pourquoi il ne le
retrouve plus.

Retenir supposerait un geste distinct, explicite, dont l'intention ne fait
aucun doute. Tant que la répétition ne gêne pas à l'usage, ce geste n'existe
pas.

### De quoi se compose un repas généré

**Sept rôles, un par catégorie.** Le rôle dit quelle macro l'aliment pilote,
et rien du moment de la journée :

| rôle | catégorie |
|---|---|
| protéine | `prot` |
| laitage | `lait` |
| glucide | `fec` |
| fruit | `fruit` |
| oléagineux | `ole` |
| huile | `huile` |
| légume | `leg` |

Le **fruit** et le **laitage** ont leur propre rôle depuis qu'un
petit-déjeuner doit porter un féculent ET un fruit, et la collation DEUX
sources de protéines — le skyr et les blancs d'œufs. Confondus sous un rôle
commun, l'un chassait l'autre.

**Chaque repas a sa forme**, décrite une seule fois dans `MODELE`
(`src/solveur/composer.ts`). Ce n'est pas une règle devinée : c'est la façon
dont Mickaël mange, dictée par lui. Une table qui prétendrait déduire ça des
catégories se tromperait — c'est une habitude, pas une propriété des aliments.

| repas | les trois variables | ce qui est imposé |
|---|---|---|
| Matin | protéine · glucide · oléagineux | 55 g de fruit |
| Midi | protéine · glucide · oléagineux | 5 g d'huile · 200 g de légume |
| 16 h | **laitage** · glucide · oléagineux | 175 g de blancs d'œufs · 83 g de fruit |
| Soir | protéine · glucide · oléagineux | 5 g d'huile · 200 g de légume |

Les quantités imposées sont **celles du plan**, pas des moyennes inventées.
Elles restent modifiables repas par repas.

À 16 h, c'est le **laitage** qui porte la cible protéique et les blancs d'œufs
qui sont figés : trois macros ne déterminent que trois inconnues, l'un des
deux devait être fixe, et c'est celui qui se dose au verre doseur.

Le modèle peut aussi **nommer** un aliment — l'avoine le matin, la banane à
16 h. C'est une préférence, pas une contrainte : absent du frigo, on prend
n'importe quel aliment du rôle. Elle existe parce qu'un plan nomme ses
aliments et qu'aucune propriété nutritionnelle ne permet de le deviner.

**Trois variables, pas quatre.** L'huile et l'oléagineux figurent tous deux au
repas, mais un seul des deux peut s'ajuster : trois macros ne déterminent que
trois inconnues, et laisser les quatre libres donnerait une infinité de
solutions toutes également valables. On fige donc celle qui se dose à la
cuillère et non à la balance ; l'oléagineux absorbe le reste.

S'il n'y a aucun oléagineux en stock, c'est l'huile qui porte les lipides et
cesse d'être fixe — sans elle, plus rien ne les porterait.

**On ne signale que ce qui manque VRAIMENT.** Un repas ne réclame que les
rôles de son modèle. Le déjeuner a longtemps annoncé « Aucun laitage
utilisable dans ton frigo » et « Aucun fruit utilisable » — deux rôles qu'il
ne demande pas ; puis le petit-déjeuner s'est mis à réclamer de l'huile alors
qu'il n'en sert pas. Un message faux coûte plus cher qu'un message absent :
il fait douter de tous les autres.

### Quand la combinaison ne tombe pas juste

Le calculateur essaie d'autres aliments **avant** de renvoyer l'utilisateur
corriger à la main. Deux échanges, ceux qui correspondent aux impasses
réelles :

- **les lipides ne tiennent pas** — l'oléagineux tombe à zéro et le gras reste
  hors cible : on confie les lipides à l'huile, qui cesse d'être figée ;
- **la protéine est trop grasse** — aucun oléagineux ne peut compenser : on
  essaie les protéines les plus maigres du stock.

Un rôle que l'utilisateur a choisi lui-même n'est **jamais** remplacé dans son
dos. Et un échange n'est annoncé que s'il a vraiment eu lieu : si le
remplaçant pèse zéro, ou si l'aliment sorti revient par ailleurs, on se tait
plutôt que de mentir sur sa propre ligne.

### Ajouter un aliment hors des rôles

Un vrai petit-déjeuner porte deux protéines et deux glucides. Un aliment par
rôle ne sait pas écrire ça. Le bouton **« + Ajouter un aliment »** pose donc
une quantité IMPOSÉE, saisie par l'utilisateur, et le repas se recalcule
autour — quatre aliments ajustables pour trois macros n'auraient pas de
solution unique.

---

## Ce que le calculateur ne peut pas rattraper

Le solveur est juste : il résout exactement le système qu'on lui donne. Sa
faiblesse n'est pas l'algèbre, c'est ce qu'on lui raconte sur les aliments. Un
riz dont les valeurs sont celles du produit cuit mais qu'on pèse sec se calcule
parfaitement — il fait simplement peser trois fois trop, et aucun test du
solveur ne peut le voir.

`src/calcul/plausibilite.ts` regarde donc chaque aliment du frigo AVANT de
composer, et se demande si ce qu'il raconte est physiquement possible :

- des valeurs finies, positives, qui tiennent dans 100 g ;
- des calories qui correspondent aux macros, à la règle d'Atwater près ;
- un rendement qui va dans le bon SENS — une viande perd de l'eau, un féculent
  en absorbe. Aucun de ces contrôles ne bloque : le rendement n'entre dans
  aucune macro, il n'annonce que le poids servi ;
- un grain sec qui pèse ce que pèse la matière sèche : 300 à 400 kcal aux
  100 g, toujours. C'est le seul contrôle qui attrape encore une erreur de
  saisie — des valeurs de riz cuit posées sur un riz qu'on pèse sec — et il
  sait la réparer : multiplier par le rendement. Une seule correction, pas un
  choix à faire.

Le contrôle du « couple rendement/macros » a disparu, et c'est une bonne
nouvelle. Il existait parce que les deux nombres décrivaient chacun l'aliment
de leur côté et pouvaient donc se contredire ; il fallait alors demander à
l'utilisateur lequel était le sien. Depuis que les macros décrivent le produit
pesé, le rendement ne peut plus les contredire — il n'y a plus rien à
arbitrer.

Ce dernier contrôle ne dépend d'aucune table : c'est la conservation de
l'énergie, qu'aucune casserole ne viole. Il ne dit pas que la pesée est
fausse — il dit que les deux nombres décrivent deux produits différents, et
propose les deux corrections possibles.

Ce que le module trouve s'affiche en tête du calculateur. Il ne bloque rien :
l'aliment est peut-être le seul du frigo. Mais il ne laisse pas non plus
bâtir dessus sans un mot.

---

## Ce qu'il faut ajouter aux données

**Rien pour les étapes 1 et 2.** Ni colonne, ni champ Grocy, ni migration,
ni stockage local : le calculateur ne retient rien entre deux ouvertures.

Restent la cuisson et la température, nécessaires à l'étape 3 seulement.
**À TRANCHER À L'ÉTAPE 3**, avec de l'usage derrière nous :

- *Une API ?* Je n'en connais pas qui donne un mode de cuisson et une
  température par ingrédient. Ciqual ne le fait pas ; Open Food Facts non
  plus, et il a déjà été écarté pour les macros avec des raisons qui valent
  ici ; les API de recettes donnent des plats, pas des paramètres par
  ingrédient, sont payantes au-delà d'un quota et en anglais. **À vérifier
  avant d'y compter.** Une API supposerait aussi du réseau dans la cuisine.
- *Saisi une fois, sur l'appareil.* On ne fait pas du batch cooking avec
  cinquante aliments : une dizaine suffit. Dix modes de cuisson renseignés une
  fois. Pas de base, pas de Grocy, pas de réseau.

---

## Découpage

Trois étapes, chacune utilisable seule. Livrer les trois d'un coup, c'est
trois semaines avant de pouvoir juger, et la certitude de se tromper sur des
détails qui ne se voient qu'à l'usage.

**Étape 1 — aujourd'hui. LIVRÉE.**
Le sélecteur, les quatre cases avec le nombre de personnes, la génération
depuis le frigo réel, la correction, le plié/déplié, les macros par personne,
la substitution, les restes, l'ajout d'un aliment, le plafonnement par le
stock et le garde-fou sur les données.
*Le calculateur sert tous les jours.*

Deux choses ont été ajoutées en route, absentes du plan d'origine : la
**convention glucidique** — une cible peut être exprimée en glucides TOTAUX,
fibres comprises, comme le font les plans nord-américains — et le **garde-fou
sur les données**, né des pannes rencontrées.

**Étape 2 — plusieurs jours.**
Le calendrier, les en-têtes par date, la correction et la validation étendues
à plusieurs jours d'un coup, et surtout le contrôle du stock cumulé — le
piège qui n'existe pas sur un seul jour.

**Étape 3 — batch cooking.**
La cuisson et la température, le regroupement par fournée, et le tableau de
répartition à quatre colonnes.
