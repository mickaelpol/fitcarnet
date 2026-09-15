# Calculateur de repas — parcours et décisions

Ce document sert de référence pendant la construction. Il dit ce que fait
l'écran, dans quel ordre, et pourquoi chaque choix a été fait plutôt qu'un
autre. Tout ce qui y figure a été arrêté avec Mickaël ; ce qui reste à
trancher est marqué **À TRANCHER**.

**Les trois étapes sont livrées.** Ce qui suit décrit le parcours complet ; les écarts entre le texte et
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
exactement ce que le solveur sait faire depuis ses 157 tests.

**Aucun stock n'est décrémenté** : c'est l'inventaire du frigo qui fait foi,
et lui seul.

**Un plan de batch cooking, lui, s'enregistre** — et cette règle-là a changé
en cours de route. Elle disait « rien n'est enregistré, le plan est un outil
d'organisation, pas un journal ». Le batch cooking l'a rendue intenable : on
cuisine le dimanche pour la semaine, et le jeudi midi, devant sa boîte, il
faut savoir combien s'en servir. Sans conservation il faudrait recomposer tout
le plan ce jeudi-là — avec un frigo qui a changé, donc des quantités
différentes — pour lire un chiffre décidé le dimanche.

**On enregistre un INSTANTANÉ, pas une recette à rejouer.** Le contenu est le
résultat déjà calculé : des noms et des grammes, jamais des identifiants
d'aliments. Un plan doit rester lisible même si un aliment a été supprimé
depuis, et surtout il ne doit PAS se recalculer à la lecture — le jeudi, on ne
veut pas savoir ce qu'on cuisinerait aujourd'hui, on veut savoir ce qu'on a
cuisiné dimanche.

La liste de courses fait partie de l'instantané : savoir ce qu'il manquait au
moment où le plan a été fait fait partie du plan. Et les boîtes sont datées en
toutes lettres à l'enregistrement — « jeudi 14/08 · 16 h » — parce qu'un rang
de calendrier ne désigne plus le même jour trois jours plus tard.

Un instantané **ne se modifie pas**, sinon ce n'en est plus un : il n'y a pas
de `PATCH` sur cette ressource. On en refait un, et on supprime l'ancien.

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

**Batch cooking.** Une ÉTAPE, et la dernière — pas un affichage qu'on bascule.
On y arrive une fois toutes les cuissons décidées ; le bouton reste inactif
tant qu'il en manque une, parce que proposer des fournées incomplètes sans le
dire ferait découvrir l'oubli devant les casseroles.

L'écran suit l'ordre des **gestes** :

1. **La liste de courses**, pliée en haut, et seulement s'il manque quelque
   chose — ce qu'il faut aller chercher avant de commencer.
2. **Les fournées** : ce qui part ensemble, en poids de BALANCE. Les quantités
   s'additionnent sur toute la période — cuire 300 g de riz en une fois pour
   trois repas, c'est tout l'intérêt. « Four 180 °C » et « Four 200 °C » sont
   deux lignes de la table, donc deux fournées : on ne met pas le poisson à
   180 avec les légumes à 200 en espérant que ça passe.
3. **La répartition**, une boîte par repas de chaque jour, en poids CUIT.

**Les deux poids ne sont pas les mêmes, et c'est le point.** On pèse du riz
sec pour le mettre à cuire ; on répartit du riz cuit à la cuillère. Annoncer
le poids sec devant des boîtes ferait servir trois fois trop — la même erreur
que le riz de mars, un cran plus loin dans la chaîne.

**Ce qui ne se cuit pas figure quand même dans la boîte**, à part, sous « à
ajouter au moment de manger ». On ne met pas un skyr dans une boîte cinq jours
à l'avance ; mais le taire ferait une boîte qui ne correspond plus au repas, et
des macros fausses le jour venu.

### D'où vient le mode de cuisson

**D'une table partagée, et de nulle part ailleurs.** `mode_cuisson` liste des
façons de cuire toutes faites — « Vapeur », « Eau bouillante », « Four
180 °C » — lisibles par tous les comptes, alimentées par le seul
administrateur. Un utilisateur qui veut « plancha » le demande.

**Rien n'est stocké sur la fiche de l'aliment**, et c'est la décision qui
compte. Deux raisons :

- Le frigo a **deux sources** : la table `aliment` pour les comptes ordinaires,
  Grocy pour l'administrateur. Un mode posé sur la fiche aurait existé en
  double — une colonne SQL et un champ personnalisé Grocy — avec deux
  vocabulaires libres de diverger. C'est exactement la structure qui a produit
  le désastre de `etat_reference`.
- Le mode de cuisson **n'est pas une propriété de l'aliment**. Les mêmes
  pommes de terre passent au four un soir et à la vapeur le lendemain. Le
  figer sur la fiche revenait à arrêter un choix qu'on refait à chaque plan.

Il se choisit donc **au moment de composer**, sous le tableau de chaque repas.
Sous le tableau et non dans une colonne : la cuisson ne pèse rien et ne change
aucun chiffre, la mêler aux grammes lui donnerait une importance qu'elle n'a
pas. Le choix porte sur le couple **repas + aliment**, jamais sur l'aliment
seul — sans quoi régler ce soir engagerait demain.

**Une seule colonne décrit une cuisson.** « Four 180 °C » est un libellé, pas
un mode plus une température. Ajouter une colonne `degres` reviendrait à
écrire deux fois le même fait, et ce projet sait ce que ça coûte. Le libellé
s'affiche, l'**identifiant** regroupe : deux aliments partagent une fournée
s'ils pointent la même ligne.

**« Sans cuisson » est un CHOIX, pas une absence de réponse.** Le skyr, les
amandes, les fruits se mangent tels quels. Trois états, donc, et la différence
entre les deux derniers compte :

- un mode → cet aliment se cuit ainsi ;
- **sans cuisson** → il ne se cuit pas, et c'est décidé ;
- **à choisir** → personne n'a encore tranché.

Sans cette distinction, le skyr resterait éternellement « à situer » et on ne
saurait jamais si un plan est complet. C'est la même différence que le zéro et
le champ vide dans les restes.

L'écran annonce toujours combien d'aliments restent **à situer** — une fournée
incomplète affichée sans un mot laisserait croire que tout est prévu, et on
découvrirait l'oubli devant les casseroles. Et comme un plan de sept jours
porte une trentaine de lignes dont beaucoup ne se cuisent pas, un bouton règle
**tout le reste d'un geste** : ce qui est cuit se choisit à la main, le reste
se déclare en bloc. Les choix déjà faits ne sont jamais écrasés.

### Ce que tu fais d'habitude est pré-rempli

Le choix porte sur le couple repas + aliment, et c'est juste — mais rejouer ce
choix à chaque plan ne l'est pas. Sur une semaine de quatre repas, c'était une
trentaine de décisions à refaire, et les mêmes que la semaine précédente. Un
outil qui fait recommencer ce qu'on vient de lui apprendre n'aide pas, il
occupe.

`cuisson_habituelle` retient donc, **par compte et par aliment**, la dernière
cuisson employée. Elle sert de DÉFAUT au moment de composer ; les choix faits à
l'écran passent toujours par-dessus.

**La règle tient en une phrase : ce qui est pré-rempli est ce que tu as fait la
dernière fois.** Pas de case « s'en souvenir » à cocher — ce serait une
décision de plus à chaque choix, c'est-à-dire exactement la friction qu'on
enlève. Pas de « seule la première fois compte » non plus : on ne pourrait plus
jamais changer d'avis.

**La clé est le NOM de l'aliment, normalisé.** C'est le seul identifiant que
les deux frigos aient en commun : un aliment Grocy porte « grocy:12 », un
aliment de la base porte un entier, et ces deux mondes n'ont aucun identifiant
partagé. La normalisation — minuscules, sans accent, ponctuation ramenée à des
espaces — est écrite **une seule fois, dans l'écran** (`cleDHabitude`). L'API
transporte une chaîne opaque et ne la lit pas : la règle doit être la même à
l'écriture et à la lecture, et l'écrire des deux côtés serait se donner deux
règles libres de diverger.

**Deux couches, jamais une seule.** Les habitudes se superposent SOUS les choix
de l'écran au lieu d'y être recopiées. Recopier obligerait à savoir quand
recopier, à ne pas écraser ce que l'utilisateur vient de faire, et à distinguer
« il n'a pas encore choisi » de « il a choisi la même chose ». Trois questions
qui ne se posent pas si le défaut reste en dessous.

**On écrit au passage au batch cooking**, et seulement ce qui a changé. Plus
tôt — à chaque appui dans le sélecteur — on enregistrerait des aller-retours
d'hésitation ; plus tard, à l'enregistrement du plan, on raterait les plans
qu'on consulte sans enregistrer. Un échec d'écriture ne bloque rien et ne
s'affiche pas : une habitude perdue coûte un appui la semaine prochaine,
interrompre quelqu'un qui va cuisiner coûte plus cher.

**Un mode supprimé emporte les habitudes qui le visaient** (`ON DELETE
CASCADE`). La première version posait `SET NULL` pour que l'habitude survive :
le riz dont on supprime « Eau bouillante » se serait retrouvé pré-rempli « se
mange tel quel » — une réponse fausse, et muette, découverte devant la boîte.
`NULL` veut dire une seule chose ici. Une question de trop coûte un geste ; une
réponse fausse coûte un repas.

**Rien de tout cela ne touche une macro**, et le regroupement ne recalcule
rien : il additionne ce que le solveur a déjà résolu. C'est la garantie qu'une
fournée ne peut pas fausser un gramme.

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
rattrapait ses contradictions (voir `db/manuel/18-un-seul-etat.sql`).

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

La cuisson et la température ont été **tranchées à l'étape 3** : une table
partagée, choisie au moment de composer. Voir plus haut. Ce qui suit est le
raisonnement qui y a mené, gardé parce qu'il explique ce qu'on n'a PAS fait :

- *Une API ?* Je n'en connais pas qui donne un mode de cuisson et une
  température par ingrédient. Ciqual ne le fait pas ; Open Food Facts non
  plus, et il a déjà été écarté pour les macros avec des raisons qui valent
  ici ; les API de recettes donnent des plats, pas des paramètres par
  ingrédient, sont payantes au-delà d'un quota et en anglais. **À vérifier
  avant d'y compter.** Une API supposerait aussi du réseau dans la cuisine.
- *Saisi une fois, sur l'appareil.* Écarté : le réglage ne suivrait pas d'un
  téléphone à l'autre, et un utilisateur ordinaire repartirait de zéro.
- *Un champ sur la fiche de l'aliment.* Écrit, puis retiré avant d'être joué :
  le frigo ayant deux sources, ce champ aurait existé en double avec deux
  vocabulaires libres de diverger — et un mode de cuisson n'est de toute
  façon pas une propriété de l'aliment.

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

### Deux batch cooking ne comptent plus deux fois le même frigo

Le bug, tel qu'il s'est présenté : on compose lundi-mercredi, on enregistre ;
on compose jeudi-samedi, et le solveur repartait du stock d'avant. Le premier
plan avait beau vider les 800 g de poulet, le second annonçait « objectifs
atteints » sur du poulet qui n'existait plus. Chaque plan était juste tout
seul ; ensemble, ils mentaient — et rien ne le disait.

C'est la pire forme d'erreur pour cette application : un résultat exact sur un
stock imaginaire, découvert devant le frigo vide.

**Un plan enregistré a désormais deux états.**

- **Prévu** (`cuisine_le` NULL) — la nourriture est encore dans le frigo, mais
  elle est promise. Le plan RÉSERVE son stock : les compositions suivantes ne
  peuvent plus compter dessus. Rien n'est écrit ; supprimer le plan libère la
  réservation.
- **Cuisiné** — la nourriture a quitté le frigo, et le stock a été décrémenté
  pour de vrai au moment de l'appui sur « J'ai cuisiné ». Le plan ne réserve
  plus rien, sinon on déduirait deux fois.

**Pourquoi un geste et pas une déduction automatique à l'enregistrement.**
Enregistrer et cuisiner ne sont pas le même moment. On enregistre le samedi
soir en préparant sa liste de courses ; on cuisine le dimanche après-midi.
Décrémenter dès le samedi ferait mentir le frigo pendant vingt heures — et un
plan enregistré puis abandonné laisserait un stock faux que rien ne viendrait
corriger. La réservation couvre l'entre-deux sans rien écrire d'irréversible.

**Le décrément et le marquage sont un SEUL appel.** Les séparer laisserait, au
moindre échec entre les deux, soit un stock baissé pour un plan qui réserve
encore — donc déduit deux fois —, soit un plan marqué cuisiné sur un frigo
intact. Les deux erreurs sont silencieuses.

**Ce qui est déduit, ce sont les grammes de la BALANCE** — poids pesé, avant
cuisson. L'eau que la cuisson ajoute n'est jamais sortie du frigo ; déduire le
poids cuit ferait disparaître trois fois trop de riz.

**L'instantané porte donc une liste `consomme`, et c'est la seule partie du
plan qui contienne des IDENTIFIANTS.** Le reste se lit ; celle-ci se calcule
avec — réserver puis décrémenter demande de désigner une ligne du frigo, pas de
l'appeler par son nom. Un aliment disparu depuis rend sa ligne inapplicable, et
c'est dit plutôt que deviné : retirer du mauvais bac serait pire que ne rien
retirer. Les plans enregistrés avant (version 1) ne réservent rien et ne
peuvent pas être marqués cuisinés — ils ne savent pas ce qu'ils prennent, et on
ne l'invente pas.

### Les façons de cuire s'administrent depuis l'application

`mode_cuisson` était en écriture réservée à l'administrateur depuis le début,
sans aucun écran pour l'exercer : ajouter « Plancha » demandait un appel HTTP à
la main. Une permission sans écran est une permission que personne n'exerce.
L'écran vit avec les deux autres outils d'administration, dans l'onglet Compte.

On y renomme, on y réordonne — en montant et descendant, pas en tapant un
nombre — et on y supprime. La suppression annonce sa conséquence : les
habitudes qui visaient ce mode s'en vont avec lui, et la question sera reposée.
Elles ne deviennent pas « se mange tel quel », ce qui serait une réponse fausse
et muette.

**Allègement du parcours.** Ajouté après coup, une fois les trois étapes
utilisables et le parcours jugé trop lourd à l'usage :

- un **indicateur d'étapes** en haut de chaque écran, qui dit où on en est et
  combien il en reste — et par lequel on revient en arrière ;
- les **cuissons habituelles**, pré-remplies (ci-dessus) ;
- les repas **pré-cochés** dès qu'un objectif existe pour eux : avoir renseigné
  une cible pour le déjeuner, c'est avoir dit qu'on déjeune ;
- une **sortie vers le frigo** quand il est vide ou injoignable, au lieu d'un
  bouton éteint sans explication ;
- le **vocabulaire** revu : « à peser » plutôt que « à cuire » — la colonne vaut
  aussi pour les amandes —, « servi » plutôt que « cuit », « se mange tel quel »
  plutôt que « sans cuisson » ;
- **pourquoi on pèse sec**, dit à l'endroit où la question se pose : devant la
  balance, un riz annoncé à 80 g quand on en servira 240 a l'air d'une erreur.
