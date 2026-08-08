# Calculateur de repas — parcours et décisions

Ce document sert de référence pendant la construction. Il dit ce que fait
l'écran, dans quel ordre, et pourquoi chaque choix a été fait plutôt qu'un
autre. Tout ce qui y figure a été arrêté avec Mickaël ; ce qui reste à
trancher est marqué **À TRANCHER**.

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

Un sélecteur à deux positions : **aujourd'hui** ou **plusieurs jours**.

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

### 5. Le tableau de répartition (batch cooking)

Quatre colonnes :

| repas | cru | cuit | dans l'assiette pour 1 personne |
|---|---|---|---|

- **cru** : ce qu'il faut peser avant cuisson, pour toutes les portions.
- **cuit** : ce que ça pèsera après, calculé avec le ratio de l'aliment.
- **dans l'assiette** : la part d'une seule personne, celle qui respecte tes
  macros au gramme près.

C'est la colonne de droite qui fait tout l'intérêt du batch : sans elle, on
sait quoi cuire mais plus comment se servir.

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

Le calculateur ne propose que ce qui est dans ton frigo, et **vérifie le
total sur tous les repas sélectionnés**. Sans ce cumul, deux repas peuvent
réclamer les mêmes 200 g de riz et le plan devient physiquement impossible —
un piège qui n'apparaît qu'à partir de deux jours.

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

Un aliment par rôle, pris dans le stock :

| rôle | catégories | quantité |
|---|---|---|
| protéine | `prot`, `lait` | calculée par le solveur |
| glucide | `fec`, `fruit` | calculée par le solveur |
| oléagineux | `ole` | calculée par le solveur |
| huile | `huile` | fixe, 10 g par portion |
| légume | `leg` | fixe, 150 g par portion |

**Trois variables, pas quatre.** L'huile et l'oléagineux figurent tous deux au
repas, mais un seul des deux peut s'ajuster : trois macros ne déterminent que
trois inconnues, et laisser les quatre libres donnerait une infinité de
solutions toutes également valables. On fige donc celle qui se dose à la
cuillère et non à la balance ; l'oléagineux absorbe le reste. Les deux
quantités restent modifiables repas par repas.

S'il n'y a aucun oléagineux en stock, c'est l'huile qui porte les lipides et
cesse d'être fixe — sans elle, plus rien ne les porterait. Un légume ou une
huile absents ne sont pas des manques : le repas s'en passe.

C'est le découpage déjà utilisé par l'écran actuel, à ceci près que l'app
choisit au lieu d'attendre que tu ajoutes les lignes.

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

**Étape 1 — aujourd'hui.**
Le sélecteur, les quatre cases avec le nombre de personnes, la génération
depuis le frigo, **l'étape de correction et de validation**, le plié/déplié,
les macros, la substitution et les restes.
*À la fin de cette étape, le calculateur sert tous les jours.*

**Étape 2 — plusieurs jours.**
Le calendrier, les en-têtes par date, la correction et la validation étendues
à plusieurs jours d'un coup, et surtout le contrôle du stock cumulé — le
piège qui n'existe pas sur un seul jour.

**Étape 3 — batch cooking.**
La cuisson et la température, le regroupement par fournée, et le tableau de
répartition à quatre colonnes.
