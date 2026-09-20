# Le serveur calcule, le front lit — et ça marche hors ligne

**Décidé le 19 septembre 2026 par le propriétaire du projet**, en ces termes :

> « Je veux une solution pour que le front ne lise que de la donnée et que le
> back lui fasse tous les calculs, sinon à quoi me sert mon back ? Et voir s'il
> existe une méthode "hors ligne" pour que l'application continue de fonctionner
> en mode hors ligne tout en prenant en compte que le front ne fait que lire la
> data. »

Et, le lendemain, **la raison de fond** — celle qui doit trancher tous les
arbitrages de ce document :

> « Je veux vraiment que ce soit le back qui fasse tous ces traitements, car si
> un jour je change le front pour utiliser une autre techno, je ne veux pas être
> dépendant du front et que tout se traite côté back. »

**À commencer APRÈS la publication de l'APK.** Ce document est la carte, pas le
chantier.

---

## 0. La raison de fond, et ce qu'elle change

Le but n'est pas de « mieux répartir » le calcul : c'est que **le métier survive
au remplacement du front**. Aujourd'hui, jeter `front/` jetterait avec lui la
convention européenne des fibres, Epley et ses garde-fous, le cru/cuit, la
composition de repas — soit 4 893 lignes que personne n'aurait écrites deux fois.
Une réécriture du front en Vue, en Flutter ou en natif repartirait de zéro sur le
métier, et **referait les mêmes erreurs** : le rendement 2,26, les 425 kg, le
« record » à 79,96 kg.

Trois conséquences directes sur ce plan :

1. **Le palier 3 n'est pas optionnel.** Le solveur est le plus gros morceau de
   métier du projet ; le laisser au front, c'est laisser le cœur dans la pièce
   qu'on veut pouvoir remplacer.
2. **« Déclarer un double juge assumé » cesse d'être une porte de sortie
   acceptable** pour un calcul métier. C'était le repli envisagé pour le solveur
   si la latence l'imposait : il faut désormais le traiter comme un **échec
   provisoire**, à documenter comme tel, pas comme une solution.
3. **Le critère de fin est vérifiable** : le jour où un client neuf — un simple
   script `curl` — peut afficher un plan de repas complet et juste sans porter
   une ligne de calcul, le chantier est fini. C'est ce qu'il faut éprouver, et
   non « le front a maigri ».

Ce qui reste légitimement au front après tout ça — la lecture de ce qui est tapé,
la mise en forme — n'est pas du métier : c'est de l'interface, et ça se réécrit
avec elle (voir §6).

## 1. D'où l'on part — mesuré le 19 septembre 2026

```
front/src/calcul + front/src/solveur : 4 893 lignes de calcul métier
api/src, tout confondu               :   396 lignes sur 9 682  (4,1 %)
```

Et sur ces 396 lignes, **l'arithmétique entière de l'API tient en quatre
lignes** (`grep` exhaustif sur `round|floor|ceil|max|min|*|/` dans `api/src`) :

```
AlimentDisponible.php:99    round($apres / $avant, 3)                  // rendement mesure
AlimentDisponible.php:160   $this->stock * $this->grammesParUnite      // stock en grammes
DeductionDuPlan.php:114     max(0.0, $stock - $grammes)                // plancher a zero
DeductionDuPlan.php:116     round($restant / $parUnite, 3)             // retour en unites
```

**Le serveur ne recalcule jamais ce que le front lui envoie.** Éprouvé par HTTP,
sur un compte jetable :

```
aliment : 90 kcal annoncees, Atwater europeen en calcule 350   ->  HTTP 201
cible   : 100 kcal pour 50 P / 150 G / 20 L, soit 980 kcal     ->  HTTP 201
```

Il range le chiffre faux sans broncher. Les endpoints rendent des **lignes
brutes** : `/api/aliments` renvoie exactement ses colonnes, `/api/cibles` ne
recalcule rien, `plan_repas.contenu` est un JSON opaque qui accepte n'importe
quelle clé.

Une seule exception, et elle montre que le gabarit existe déjà : un rendement à
contresens est refusé en **422** (`Aliment.php:266`, un `#[Assert\Callback]` qui
appelle `RendementPlausible`).

## 2. L'argument qui justifiait tout ça ne tient pas

`front/src/api/persistance.ts:79` :

```ts
shouldDehydrateMutation: () => false,
```

avec, juste au-dessus, sa propre raison : *« rejouer une mutation au démarrage
suivant n'a de sens que pour un mode hors ligne que l'application n'a pas »*.

**Il n'y a donc pas de mode hors ligne aujourd'hui.** Aucune file d'attente
d'écriture, aucun `networkMode` dérogatoire. Hors réseau, l'application ne peut
**rien** enregistrer. Ce qui existe est un cache de **lecture** (`maxAge` de
7 jours), et le fichier le dit lui-même : *« ce qui disparaît, c'est l'ATTENTE,
pas l'appel »*.

Conséquence directe : **« le front doit calculer pour marcher hors ligne » est
une habitude, pas un fait.** Un chiffre calculé par le serveur se mettrait en
cache exactement comme n'importe quelle autre réponse.

## 3. Le principe, en une phrase

> **Le serveur est le seul juge. Le front affiche ce qu'on lui a dit, met ses
> écritures en file, et REFUSE d'inventer ce qu'il ne sait pas.**

Trois états, et le troisième est le cœur du dispositif :

| État | Ce que fait le front |
|---|---|
| **En ligne** | Il appelle, le serveur calcule, il affiche |
| **Hors ligne, lecture** | Il affiche les **dernières valeurs reçues**, datées à l'écran |
| **Hors ligne, calcul neuf** | **Il refuse.** « Je ne peux pas calculer ça sans réseau » |

Ce refus n'est pas une régression : c'est la **règle 7** appliquée à
l'architecture — *un chiffre faux est pire qu'un refus de répondre*. Aujourd'hui
le front invente hors ligne un chiffre que le serveur n'a jamais vu ; demain il
dira qu'il ne sait pas.

**Et c'est le prix à payer, il faut le dire franchement** : « le front ne fait
que lire » et « l'application calcule hors ligne » ne peuvent pas être vrais en
même temps. On peut avoir l'un ou l'autre par calcul. Le compromis proposé est :
*lecture hors ligne complète, écriture hors ligne complète, calcul neuf en ligne
seulement*.

## 4. Le hors-ligne : le mécanisme existe, il est documenté

TanStack Query v5 porte déjà tout ce qu'il faut — vérifié dans la documentation
officielle le 19 septembre 2026 :

- `shouldDehydrateMutation` → passer à `true` (il est à `false` aujourd'hui) ;
- `queryClient.setMutationDefaults(['cle'], { mutationFn })` — **obligatoire** :
  sans fonction par défaut, une mutation rejouée après redémarrage ne sait plus
  quoi appeler ;
- `dehydrate` / `hydrate` à l'arrêt et au lancement ;
- `queryClient.resumePausedMutations()` au retour du réseau ;
- `networkMode` — à laisser sur son défaut (`online`), qui est précisément ce
  qui met les mutations en pause au lieu de les faire échouer.

**Ce qu'il faudra décider en plus**, et que la bibliothèque ne tranche pas :

1. **L'ordre de rejeu.** Deux séances saisies hors ligne doivent repartir dans
   l'ordre. Une file, pas un lot parallèle.
2. **Le conflit.** Que fait-on si le serveur refuse une écriture rejouée trois
   jours plus tard ? La règle du projet impose de **ne rien perdre en silence** :
   un écran « ces saisies n'ont pas pu partir », jamais un `catch` muet.
3. **L'affichage optimiste.** `onMutate` pose la valeur localement ; c'est déjà
   du calcul au front. À garder **strictement** au recopiage de ce que la
   personne a tapé, jamais à une dérivation.

## 5. Les paliers, du moins cher au plus cher

### Palier 0 — ranger le front d'abord (indépendant, à faire en premier)

Avant toute question de serveur : **16 formules sont écrites en dur dans les
écrans**, hors des modules de référence. Elles ne se déplaceront jamais tant
qu'elles sont là. Les plus lourdes :

| Où | Quoi |
|---|---|
| `composants/carteRepas.tsx` | **six** formules, dont la somme des fibres du repas (`:219-224`), qu'aucun module ne porte, et trois `/ portions` qui produisent le chiffre lu devant la balance |
| `composants/disqueRM.tsx:21-29` | `SEUIL = 0.03` et `tendanceDe` — hausse/stable/baisse du 1RM, **sans aucun test** |
| `app/admin-fusion.tsx:12-31` | **un Levenshtein complet** + seuils 0,9 / 0,45, qui décide quels exercices sont proposés à une fusion définitive |
| `composants/editeurAliment.tsx:470-471` | `parseFloat` pour **enregistrer** les deux pesées, alors que le même fichier écrit plus haut « `nombreSaisi` ET NON `parseFloat` » (`:226`). **Risque dormant, pas défaut actif** — vérifié sur douze saisies le 19 septembre 2026 : chaque cas où les deux divergent (`4,2,1`, `1 000`, `100abc`, `-5`) est un cas où `ratioMesure` vaut `null` et où le bouton n'est pas rendu. Le garde les fait coïncider **par accident** ; déplacer ce garde réveille le défaut |
| `composants/planRelu.tsx:163` | recopie exacte de `etapeBatch.tsx:161` |

`formuleUnique.test.ts` ne les voit pas : son motif ne cible que `KCAL_… *`,
jamais un `/100`, un seuil ou une somme.

### Palier 1 — le serveur REFUSE les chiffres faux (petit, fermé, rentable)

Aucun aller-retour ajouté : tout se greffe sur le `POST`/`PATCH` qui existe déjà.

| Quoi | Comment | Ordre de grandeur |
|---|---|---|
| Cohérence kcal ↔ macros d'un aliment | `#[Assert\Callback]` sur `Aliment`, sur le modèle de celui du rendement | ~40 l. PHP |
| Idem sur une cible | `#[Assert\Callback]` sur `Cible` | ~30 l. |
| Soupçon de kilojoules | même endroit | ~15 l. |
| Matière > 100,5 g pour 100 g | **la clé existe déjà** dans `rendement.json`, aucun test ne la lit | ~10 l. |
| Avancement d'une séance | **le serveur le calcule déjà** : `seance/[id].tsx:113` doit lire `seance.avancement` au lieu de recalculer | ~5 l. |

C'est ici que la règle 7 gagne le plus : aujourd'hui l'API accepte 90 kcal pour
un riz qui en fait 350.

### Palier 2 — le serveur rend les chiffres dérivés

| Quoi | Comment |
|---|---|
| 1RM, paliers, volume | Epley en PHP + `api/regles/rm.json` lu par les DEUX suites. **Attention** : la formule n'a aujourd'hui qu'une écriture (`epleyUnique.test.ts` la garde) — la réintroduire côté PHP **rouvre** une duplication, donc le fichier de règles n'est pas optionnel |
| `grammesDisponibles` | champ calculé sur `/api/mon-frigo`, tenant compte de `dejaPromis` |
| Écarts d'inventaire | le serveur reçoit déjà les quantités visées |
| Conversion d'un plan « coach » | route de conversion, ~40 l. |

### Palier 3 — le solveur passe au serveur (le vrai chantier)

~1 800 lignes de TypeScript à réécrire en PHP : Gauss avec pivot partiel,
plafonnement au stock, liste de courses en deux passes, vocabulaire des repas.

**Le coût n'est pas le calcul, c'est la latence par geste.** Mesuré :
jusqu'à 12 `calculer()` par tentative × ~7 tentatives × 1 par repas × 2 passes,
soit **jusqu'à ~5 000 éliminations de Gauss** pour un plan de 7 jours × 4 repas
— refaites à chaque geste : cocher un jour, changer le nombre de convives,
verrouiller un rôle, déclarer un reste, remplacer un aliment.

**À MESURER AVANT DE DÉCIDER, et non à supposer :**

1. Combien de millisecondes prend une résolution complète en PHP ? Écrire
   `algebre.ts` seul en PHP (158 lignes) et le chronométrer sur le pire cas
   réel. C'est une demi-journée, et ça tranche le palier entier.
2. Combien de gestes par minute fait-on réellement sur l'écran de plan ?
   `verification-android` sait le mesurer.
3. Un appel unique par recalcul, anti-rebond de ~300 ms et annulation de la
   requête en vol suffisent-ils à rendre l'écran vivable ?

Si la réponse est non, le repli est **un échec provisoire, pas une solution** :
on déclare le solveur cas à deux juges assumés, on le verrouille par un fichier
de règles partagé comme la jauge de mot de passe, **et on écrit en toutes lettres
que le but n'est pas atteint** — parce qu'une copie au front reste une copie
qu'un changement de technologie ferait perdre (§0). Une duplication déclarée et
gardée vaut infiniment mieux qu'une duplication oubliée — c'est la leçon
d'Epley, écrit **trois** fois dont une version fausse — mais ici elle ne vaut
pas le but recherché.

Les pistes à éprouver avant d'en arriver là : un seul appel par recalcul plutôt
qu'un par geste, un anti-rebond, l'annulation de la requête en vol, et la
résolution rendue **avec** tous les chiffres d'affichage (fibres, écarts, par
personne) pour ne pas ajouter d'aller-retour derrière.

### Palier 4 — de vrais repas, par une base de connaissance (décidé le 19 septembre 2026)

**Le besoin, dans les mots du propriétaire du projet** : *« la composition des
repas c'est un peu aléatoire […] je veux que l'application propose de vrais
repas pour le petit déjeuner quand c'est le petit déj qui est choisi, un repas
de midi quand c'est midi, pareil pour la collation de 16 h et le repas du
soir »*.

**CE N'EST PAS DE L'ALÉATOIRE, ET LE DÉFAUT EST PIRE.**
`front/src/solveur/composer.ts:63` prend **le premier aliment qui remplit le
rôle** :

```ts
return (neufs.length > 0 ? neufs : candidats)[0];
```

Une protéine, un glucide, un lipide — et rien, nulle part, ne sait que le blanc
de poulet ne va pas avec les flocons d'avoine au petit-déjeuner. Ce n'est pas un
manque d'intelligence, c'est **un manque de connaissance** : le code ignore ce
qu'un cuisinier sait.

#### La solution retenue : distiller l'IA dans une table, une seule fois

**Écarté : un LLM appelé en production.** Mesuré le 19 septembre — la charge
réelle est modeste (~1 200 jetons par génération, dont 301 pour un frigo de
37 aliments, puisqu'on n'envoie que des noms et des rôles). Le coût n'est donc
pas l'obstacle. L'obstacle est double : une dépendance à un fournisseur pour une
fonctionnalité centrale, et une intelligence **qu'on ne peut ni relire ni
réparer**, qui change le jour où le modèle est mis à jour.

**Écarté aussi : un modèle local sur le NAS.** DS718+, Celeron J3455 (Apollo
Lake, pas d'AVX2), 6 Go partagés avec Grocy, PostgreSQL et FrankenPHP. Grocy met
déjà 1 à 5 s à répondre sur une lecture ; ajouter un modèle sur la même machine
dégraderait tout. *(À revérifier si le NAS change : `grep -o 'avx[0-9_]*'
/proc/cpuinfo`.)*

**Retenu : une base de connaissance versionnée, générée une fois.** Trois
niveaux, et c'est le troisième point qui la rend finie :

| Niveau | Quoi | Taille | Stabilité |
|---|---|---|---|
| 1. Sous-groupes CIQUAL | quel sous-groupe va à quel créneau, avec quoi, salé ou sucré | ~45 | permanente |
| 2. Patrons de repas | « R1 = céréale + laitage + fruit + oléagineux » | ~100 à 300 | permanente |
| 3. Exceptions nommées | les aliments dont le sous-groupe ment : flageolet (protéine ET féculent), avocat, olive | quelques centaines | rare |

**L'HÉRITAGE PAR SOUS-GROUPE EST CE QUI COUVRE « TOUS LES ALIMENTS ».** On
n'énumère pas les paires — 3 200 aliments CIQUAL feraient dix millions de
combinaisons, ingénérables et irrelisables. Chaque aliment hérite des
associations de son sous-groupe (`alim_ssgrp_nom_fr`, déjà lu par
`ciqual_vers_grocy.py`). Un aliment ajouté par un utilisateur demain est couvert
**le jour même**, sans que personne touche à la table.

#### Les sources publiques — licences À VÉRIFIER avant usage

CIQUAL (Anses, déjà l'ancrage du projet) ; Wikidata et Wikipédia pour les plats
et leurs ingrédients ; Wikilivres « Livre de cuisine » ; PNNS / Santé publique
France pour la structure d'un repas par créneau ; Open Food Facts (ODbL) pour
les catégories de produits. **L'IA ne crée pas la connaissance, elle met ces
sources en forme** — c'est autrement plus fiable que de lui demander d'inventer.

#### Ce qui garantit que la table est bonne

La même chose que partout ailleurs ici : **on ne fait pas confiance, on
éprouve.** C'est tout l'avantage d'une table sur un appel en production — elle
se lit, se corrige, ne change jamais toute seule, et une erreur y est
reproductible.

Les gardes à écrire, qui doivent pouvoir TOMBER :

- aucun patron de petit-déjeuner ne propose une protéine salée sans étiquette
  explicite ;
- **tout aliment du catalogue a ses étiquettes** — un aliment non étiqueté fait
  échouer la suite, sur le modèle de `ModeleExposeTest` qui refuse une entité
  absente de sa liste ;
- chaque patron est réalisable sur les frigos d'essai du dépôt
  (`front/src/solveur/frigos.test-data.ts`) ;
- **un témoin** : un patron volontairement absurde doit être rejeté, sinon les
  gardes ne gardent rien.

Et le défaut par défaut est un REFUS, jamais un hasard : un aliment dont on ne
sait rien ne sert que dans les patrons de sa catégorie, ou ne sert pas. Règle 7.

**Le coût honnête** : la première génération sera médiocre et demandera une
relecture humaine — celle du propriétaire du projet, une soirée. C'est le prix
de quelque chose qu'on possède au lieu de le louer.

#### Rattacher un aliment à la table : le nom est libre, le LIEN ne l'est pas

**La crainte, dans les mots du propriétaire du projet** (20 septembre 2026) :
*« si l'utilisateur crée un aliment "Poulet" ou "poulets" et qu'on a "poulet"
dans la table, est-ce que ça va faire le lien ? »*

**ON NE DEVINE JAMAIS APRÈS COUP.** Rapprocher « poulets » de « poulet » par
ressemblance, c'est choisir à la place de quelqu'un, en silence — et un jour
rattacher « pâté » à « pâtes » sans que personne le voie. C'est le chiffre
plausible et faux de la règle 7, appliqué à un rattachement. La ressemblance
sert à **proposer**, jamais à **décider**.

**CE QU'ON STOCKE EST LE CODE CIQUAL, PAS LE NOM.** Une fois rattaché, l'aliment
peut s'appeler « Blanc de poulet Lidl », « poulets » ou « PLT » : le lien tient.
Renommer ne casse rien, une faute de frappe ne casse rien — le nom ne sert plus
à retrouver quoi que ce soit.

**DEUX CHAMPS, ET C'EST LE POINT DE CONCEPTION.** La demande initiale était de
n'autoriser QUE les noms de la table. À ne pas faire tel quel, et la raison est
dans le frigo réel du projet : `Blancs d'oeufs pasteurisés (bouteille, frais)`,
`Oasis sorbet`, `Skyr nature Milbona` (le placeholder de l'écran lui-même).
CIQUAL est une table d'aliments **génériques** — elle a « Yaourt nature », pas la
marque. Interdire le reste ne produit pas un rattachement juste : l'utilisateur
bloqué **choisit le plus proche pour avancer**, et la base de connaissance croit
ensuite ce faux sur parole. Pire qu'un aliment non rattaché, parce qu'invisible.

| Champ | Qui décide | Obligatoire |
|---|---|---|
| **Nom** | l'utilisateur, texte libre | oui |
| **« Ça ressemble à… »** | **sélecteur, uniquement la table** | **oui** — pas d'enregistrement sans |

La garantie demandée est donc tenue — *aucun aliment ne peut exister sans un lien
issu de la table* — sans bloquer les produits du commerce, qui font la majorité
d'un vrai frigo. Et quand la frappe correspond, le sélecteur se pré-remplit :
« poule » propose « Poulet, blanc, cru », on tape dessus, c'est fini.

*Témoin réel : le produit `Colomiers` du frigo de production est un Coulommiers
mal orthographié. Avec un champ libre seul, personne ne l'a vu depuis des mois.
Avec le sélecteur obligatoire, le nom fautif n'aurait eu aucune conséquence.*

#### La dégradation, en trois crans — jamais « au hasard »

| Ce qu'on sait de l'aliment | Ce que le compositeur en fait |
|---|---|
| rattaché à un sous-groupe CIQUAL | tous les patrons — connaissance complète |
| seulement une catégorie (`prot`, `fec`…) | uniquement les patrons génériques de sa catégorie |
| rien | **il n'est pas proposé**, et l'écran le signale |

Le troisième cran est le plus important : un aliment dont on ne sait rien reste
dans le frigo, se pèse et se mange — mais le compositeur ne l'invite pas. Une
absence reste une absence (règles 6 et 7).

**À prévoir le moment venu** : une colonne de plus sur `aliment`, donc règle 1 —
`db/01-schema.sql` **et** une migration numérotée ; et côté Grocy un `userfield`
de plus, écrit par `assurerLesChamps()`. Les briques de recherche existent déjà :
`sansAccent` (`front/src/calcul/texte.ts`) et la correspondance par mots-clés sur
`alim_nom_fr` de `ciqual_vers_grocy.py`.

#### Ce que ça ne change pas

Le solveur garde les grammes. Ce qui change est **uniquement** le `[0]` de
`composer.ts:63`, remplacé par « celui qui va avec le reste, à ce créneau ».

## 6. Ce qui reste au front, et pourquoi ce n'est pas du calcul métier

Ces trois-là ne partiront jamais, et c'est juste :

1. **La lecture de ce qui est tapé** — `saisieNombre.ts`, `ChampNombre`. Le
   champ doit garder « 42, » entre deux frappes. C'est ce qui a coûté 425 kg
   enregistrés au lieu de 42,5 le 15 septembre 2026.
2. **La jauge de mot de passe** — elle répond à chaque caractère. Déjà résolue
   proprement par `api/regles/motdepasse.json`, et c'est le modèle à suivre
   pour tout double juge assumé.
3. **La mise en forme** — tri, libellés, regroupement par emplacement, dates
   locales, `sansAccent`.

Ce ne sont pas des chiffres que l'on pèse : ce sont la saisie et l'affichage.

## 7. L'ordre recommandé

```
Palier 0  ranger les 16 formules éparses        indépendant, à faire en premier
Palier 1  le serveur refuse les chiffres faux   petit, fermé, gain immédiat
   ↓      (mesurer ici le coût réel de Gauss en PHP)
Palier 2  le serveur rend les chiffres dérivés
Palier 3  le solveur passe au serveur — ou est déclaré double juge et verrouillé
Palier 4  la base de connaissance culinaire     après le 3 : elle nourrit le
                                                 choix des aliments, que le
                                                 serveur fera alors
Hors ligne : à brancher AVEC le palier 1, pas après. C'est ce qui prouve que le
             front sait afficher sans calculer.
```

## 8. Ce qui n'a PAS été vérifié

À reprendre avant de s'engager :

- **Le temps de résolution en PHP** — aucune mesure. Tout le palier 3 en dépend.
- **`AppliqueInventaire` en fonctionnement** — le lot déposé reste `en_attente`
  en dév, aucun consommateur ne tourne. Lu, jamais vu s'exécuter.
- **Le chemin Grocy** (`FrigoGrocy.php`, 614 lignes) — jamais atteint, la base
  de dév est en `sourceFrigo = base`.
- **La contrainte SQL `aliment_ratio_sens`** — troisième juge du rendement, en
  base, qu'aucun des deux tests partagés ne confronte à `rendement.json`.
- **L'écart d'arrondi du rendement** — 2 décimales au front
  (`plausibilite.ts`), 3 à l'API (`AlimentDisponible.php:99`). Constaté ; on
  ignore s'il se voit à l'écran.
