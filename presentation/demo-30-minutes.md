# Démo 30 minutes — moitié commerciale, moitié technique

Découpage écrit le 16 septembre 2026, à partir des 28 slides
(`fitcarnet-presentation.html`), du script existant (`script-narration.md`), de
la vidéo de 3 min 01 et des 15 fiches `fonctionnalite-*`.

**Ce n'est pas un nouveau dossier : c'est un re-montage.** Tout le contenu cité
ici existe déjà. Ce document dit dans quel ordre le sortir, en combien de temps,
et ce qu'il faut préparer avant d'entrer dans la salle.

> **Pourquoi un re-montage était nécessaire.** Le script existant vise le même
> format — 25 à 30 minutes — mais son équilibre est de **8 minutes de produit
> pour 19 de technique**. Devant des commerciaux, c'est l'inverse du besoin. Le
> découpage ci-dessous rend la première moitié au produit sans rien retirer à la
> seconde : la technique passe de 19 à 15 minutes en **abandonnant le détail, pas
> les preuves**.

## Le public, et la seule règle qui compte

Tes commerciaux ne retiendront pas une architecture. Ils retiendront **trois
phrases qu'ils pourront répéter** et **une chose vue à l'écran** qu'aucun
concurrent ne fait. La première moitié doit produire exactement cela.

La seconde moitié ne leur est pas destinée — elle est là pour qu'ils sachent
**que ça tient**, et pour répondre quand un client leur demandera « c'est
sérieux, votre truc ? ». Ils n'ont pas besoin de comprendre le filtre Doctrine :
ils ont besoin de savoir qu'il existe, qu'il est testé, et de savoir dire
« l'isolation des comptes est vérifiée par un test qui refuse toute entité non
conforme ».

**Ne jamais s'excuser de passer vite.** La formule du script existant est la
bonne : « j'y reviens en détail dans dix minutes ».

---

## Avant d'entrer dans la salle

Cinq points, dont trois bloquants. Les commandes complètes sont dans
`plan-de-tournage.md` (parties I.3 et suivantes) et dans `REPRENDRE.md`.

| | Quoi | Pourquoi c'est bloquant |
|---|---|---|
| ⚠ | **Charger `db/manuel/jeu-demo.sql`** sur le compte de démonstration | Sans lui, pas de courbe de 1RM, pas de stock, pas d'historique : la démo montre une application vide. Le jeu pose 9 semaines de vie — 14 aliments, 14 lignes de stock, 23 séances, 123 séries, 2 plans, 4 cibles, et un 1RM qui monte de 50,7 à 63,3 kg. **C'est cette courbe qui fait vivre la démonstration.** |
| ⚠ | **Régénérer le HTML** avec `construire.py` | `fitcarnet-presentation.html` est *gitignoré* : il est absent d'un clone neuf. |
| ⚠ | **Remonter la vidéo** avec `monter-demo.sh` | Même raison : le MP4 n'est pas versionné. |
| | Un **second compte administrateur** | Seulement si tu montres l'administration (voir « ce qu'on ne montre pas »). |
| | `GROCY_URL` renseigné | Seulement si tu montres la source Grocy. Sinon, ne pas l'évoquer. |

Et un point qui n'est pas pour la salle mais qui traîne : **la clé d'API Grocy
reste à régénérer**.

---

## Le minutage

| Temps | Partie | Support |
|---|---|---|
| 0:00 – 2:00 | Le problème, et pourquoi le suivi s'arrête | slides 1-3 |
| 2:00 – 6:00 | **Ce qu'on a dans le frigo** — stock, inventaire en écarts | vidéo 0:11 → 0:51, commentée |
| 6:00 – 11:00 | **Le calculateur** — le cœur du produit | vidéo 0:51 → 1:58 + slides 7-9 |
| 11:00 – 13:00 | **Cuisiner puis ranger** — batch cooking, décrément du stock | vidéo 1:58 → 2:34 |
| 13:00 – 15:00 | **Le carnet** — séances, 1RM, progression | vidéo 2:34 → fin |
| 15:00 – 18:00 | La pile, et un seul code pour trois cibles | slides 12-13, 17 |
| 18:00 – 22:00 | **L'isolation des comptes** + le solveur + l'inventaire asynchrone | slides 14-16 |
| 22:00 – 26:00 | **Les garanties** — tests, TDD, l'audit et ses 84 constats | slides 18-23 |
| 26:00 – 29:00 | **Comment c'est construit** — l'outillage IA, les agents | slides 24-27 |
| 29:00 – 30:00 | Ce qu'on ne promet pas, et la suite | — |

**Trente minutes pleines, questions non comprises.** Si la salle est bavarde,
la variable d'ajustement est le bloc 18:00-22:00 : le solveur et l'inventaire
asynchrone se racontent en une phrase chacun si nécessaire. **Ne jamais rogner
sur 22:00-26:00** : c'est le bloc qui fait la crédibilité, et c'est celui qu'on
est le plus tenté de sauter.

---

## Première moitié · 0:00 → 15:00 · pour les commerciaux

### 0:00 – 2:00 · Le problème

C'est le moment où le client doit se reconnaître. Ralentis.

> « Les gens qui suivent leur alimentation sérieusement utilisent **trois
> outils** : une application de calories, un carnet de musculation, et un
> tableur pour les courses. Et c'est leur mémoire qui relie les trois. »

Puis la phrase qui porte tout le reste :

> « Le suivi ne s'arrête pas par manque de volonté. Il s'arrête parce que **la
> saisie coûte plus cher que ce qu'elle rapporte**. »

**C'est la phrase à faire répéter à tes commerciaux.** Tout ce qui suit en
découle : chaque fonctionnalité montrée doit se lire comme « ceci retire de la
saisie » ou « ceci évite un chiffre faux ».

### 2:00 – 6:00 · On part de ce qu'il y a vraiment

Vidéo, chapitres 0:11 et 0:31. Deux choses à pointer du doigt, pas une de plus.

**La mention « poids cru »** sous la quantité :

> « Ça a l'air d'un détail. C'en est un qui décide de la justesse de tout le
> reste : le riz sec fait **350 kcal** pour 100 grammes, cuit il en fait **130**.
> Si on confond les deux, tous les chiffres de l'application sont faux. »

**L'inventaire en écarts** :

> « On ne ressaisit pas trente aliments, on corrige les trois qui ont bougé. Et
> une ligne qu'on n'a pas touchée **n'est pas un zéro** : elle n'a pas été
> comptée, son stock ne bouge pas. »

> **Ce deuxième point est un argument de vente, pas un détail d'ergonomie.**
> C'est la différence entre un inventaire qu'on fait et un inventaire qu'on
> abandonne au bout de trois semaines.

### 6:00 – 11:00 · Le calculateur — le cœur

Vidéo, chapitre 1:06 (le plus long, laisse-le se dérouler), puis les slides 7 à 9.

> « À partir des cibles du jour et de **ce qui est disponible**, l'application
> compose les repas et donne les grammes à peser. Pas des portions, pas des
> recettes : **des grammes, avant cuisson**. »

Trois choses à montrer dans cet ordre :

1. **Les quantités retenues sont bloquées** pour ce repas et indisponibles pour
   les autres. C'est ce qui fait qu'un plan sur quatre jours tient debout.
2. **L'écart à la cible est affiché quand le frigo ne permet pas mieux** — et il
   n'est pas lissé pour faire joli.
3. **L'avertissement sur les données douteuses**, la slide la plus forte de la
   première moitié. Lis-le à voix haute :

> « "Le calcul sera juste, mais il partira de chiffres qui ne peuvent pas être
> vrais." L'application sait qu'un grain sec fait **300 à 400 kcal** pour
> 100 grammes — c'est une borne physique. Elle le dit **avant** de cuisiner,
> pas après. »

Puis, en regardant la partie technique de la salle :

> « C'est une règle du projet : **un chiffre faux est pire qu'un refus de
> répondre.** »

### 11:00 – 13:00 · Cuisiner, puis ranger

Vidéo, chapitre 1:58.

> « Une cuisson, plusieurs boîtes. La colonne "boîte", c'est ce qu'on met dedans
> pour tout le monde ; la colonne "une personne", ce qu'on se sert. »

Et la fin de boucle, qui est le vrai argument :

> « Quand on déclare la fournée cuisinée, **le stock du frigo se décrémente
> tout seul**. On n'a rien ressaisi. »

### 13:00 – 15:00 · Le carnet

Vidéo, chapitre 2:34.

> « 63,3 kg estimés, **plus 3,1 kg** depuis la séance précédente. Neuf semaines
> de données derrière ce chiffre. »

Et la phrase qui referme la première moitié :

> « Et c'est la même application que le frigo. Pas un deuxième outil, pas un
> deuxième compte : **la nutrition et l'entraînement au même endroit**. C'est
> ça, les trois outils remplacés par un. »

---

## Les cinq phrases que tes commerciaux doivent pouvoir répéter

À donner en fin de présentation, ou sur une feuille. Chacune est défendable
devant un client technique, et chacune est vérifiée dans le code.

1. **« On part de votre frigo, pas d'un catalogue de 300 000 produits. »**
   Le plan ne propose que ce qui est réellement disponible ; ce qui manque part
   en liste de courses.
2. **« On vous donne les grammes à peser crus, pour le résultat cuit que vous
   visez. »** Le rendement cru/cuit est dérivé à la lecture, jamais stocké dans
   les valeurs nutritionnelles.
3. **« Un champ vide veut dire "je ne sais pas", jamais "zéro". »** Cela vaut
   dans l'inventaire comme dans les objectifs.
4. **« Les fibres sont comptées à la convention européenne — 2 kcal par gramme,
   séparément des glucides. »** Presque aucune application ne le fait. Sur un
   régime riche en fibres, l'écart se voit.
5. **« Quand un chiffre n'est pas fiable, l'application le dit au lieu
   d'inventer. »** Et l'écart à la cible est montré, pas lissé.

---

## Seconde moitié · 15:00 → 30:00 · pour la crédibilité

### 15:00 – 18:00 · La pile, et un seul code pour trois cibles

Slides 12, 13 et 17.

> « API **Symfony 7** avec API Platform et Doctrine, front **Expo / React
> Native**, **PostgreSQL 16**, déployé sur un NAS derrière Caddy. »

Le point qui intéresse vraiment :

> « **Un seul code** donne le site web et l'application Android. Pas deux
> équipes, pas deux backlogs, pas deux façons de calculer la même chose. »

### 18:00 – 22:00 · Les trois points d'architecture qui se défendent

**L'isolation des comptes** — c'est le point le plus sérieux, et celui qu'on te
demandera :

> « Trois pièces : une interface de marquage, un filtre Doctrine qui pose le
> `WHERE` sur **toutes** les requêtes, et un test qui **refuse** toute entité
> exposée non conforme. Plus un contrôle au point de passage obligé de
> l'écriture. »

Et la phrase qui vaut mieux que dix slides :

> « Une donnée qui fuit d'un compte à l'autre n'est pas un défaut d'affichage.
> C'est la faute la plus grave que ce projet puisse commettre — donc elle est
> traitée comme telle. »

**Le solveur** : la composition de repas est un problème d'optimisation isolé,
pur et testé.

**L'inventaire asynchrone** : l'écran rend la main tout de suite, le traitement
continue derrière, en deux exemplaires qui ne se marchent pas dessus. *Il y a une
panne réelle derrière ce choix* — la raconter si on te le demande, pas avant.

### 22:00 – 26:00 · Les garanties — le bloc à ne pas rogner

Slides 18 à 23. Les chiffres, tels quels :

| | |
|---|---|
| Tests front | **605** (577 purs + 28 de rendu) |
| Tests API | **252**, 661 assertions, sans base ni noyau |
| Audit de septembre 2026 | **84 constats** (3 critiques, 15 élevés), **8 lots, tous clos** |
| Catalogue d'exercices | ~1 338 entrées |
| Inventaire des capacités | ~220, avec fichier et ligne |

> « **Le test est écrit avant, et on le regarde échouer.** Sinon on ne corrige
> pas un bug : on ajuste le test qui fige la mauvaise valeur. L'audit a trouvé
> **douze** vérifications qui ne pouvaient pas échouer — elles ont été
> réparées. »

Et l'exemple à raconter, parce qu'il est concret et qu'il se retient :

> « Un contrôle de propriété était posé sur une route d'écriture et **oublié sur
> sa jumelle**, qui écrit la même chose par un autre chemin. Résultat : quelqu'un
> pouvait rendre l'aliment d'un autre **indélébile**. La correction n'a pas été
> de recopier le contrôle sur la deuxième porte — elle a été de le **descendre au
> point de passage obligé**, ce qui couvre les trois appelants d'un coup, et le
> quatrième qui n'existe pas encore. »

**C'est le motif de défaut dominant du projet, et il a un nom : le jumeau
oublié.** Une décision juste, appliquée à un endroit et oubliée à un autre.

### 26:00 – 29:00 · Comment c'est construit

Slides 24 à 27. C'est l'acte qui surprend, et il faut l'assumer sans le survendre.

> « L'application est développée **avec l'assistance d'une IA**, et le dépôt
> porte son outillage : des compétences qui décrivent les pièges de *ce* projet,
> des agents de contrôle en lecture seule, et un graphe de connaissances du code. »

L'histoire à raconter, parce qu'elle répond d'avance à « et si l'IA écrit du code
faux ? » :

> « Un agent fait tourner l'application sur un **vrai émulateur Android** et fait
> les gestes d'un utilisateur. Il a trouvé que taper **42,5 kg** enregistrait
> **425 kg** — la virgule disparaissait sous les doigts. **577 tests étaient au
> vert.** Aucun test unitaire ne pouvait le voir, parce que le défaut était dans
> le clavier, pas dans le calcul. »

Et, la veille de cette présentation, le même agent a trouvé qu'un sélecteur
livré la veille **ne commandait rien** : le choix partait en base, l'écran ne
suivait pas.

> « C'est ça, la réponse honnête : l'IA écrit vite, et **on paie des contrôles
> qui cherchent exprès ce qu'elle a manqué**. Rien n'est déclaré terminé sans la
> sortie des tests. »

### 29:00 – 30:00 · Ce qu'on ne promet pas

À dire en propre, parce que c'est ce qui rend crédible tout le reste :

- **pas de date de mise en production ouverte** ;
- **pas de support** ;
- **pas de reprise de données** depuis une autre application ;
- le produit est aujourd'hui **taillé pour un usage personnel**, multi-comptes
  par invitation. C'est un choix, pas une limite technique.

---

## Ce qu'on ne montre pas, et pourquoi

| | Raison |
|---|---|
| **Le partage d'un modèle** | Il n'existe pas — décision du 15 septembre 2026, le champ a été retiré des quatre endroits. Ne rien promettre. |
| **L'administration** (exercices, fusion, cuissons, invitations, comptes) | Demande un second compte administrateur. Hors sujet pour des commerciaux : c'est de l'outillage interne. |
| **La source Grocy** | Ne fonctionne que si `GROCY_URL` est renseigné sur l'instance filmée. À ne pas évoquer sinon. |
| **Les notifications distantes** | Absentes d'Expo Go depuis le SDK 53 : non démontrables sur émulateur. |
| **La création d'un exercice** | L'API la réserve aux administrateurs ; il n'y a pas d'écran pour un compte ordinaire. |

---

## Ce qu'il reste à produire

La vidéo actuelle (3 min 01, muette, 8 chapitres) est tournée **depuis le web**,
au pilote Playwright. Elle suffit pour cette présentation.

**Si tu veux des images de téléphone** — plus vendeuses devant des commerciaux —
c'est le travail des **8 bobines** de `plan-de-tournage.md`, tournées à scrcpy.
Trois d'entre elles couvrent exactement la première moitié ci-dessus : bobine 3
(le frigo, ~3 min), **bobine 4 (planifier la semaine, ~5 min — la décisive)** et
bobine 7 (on s'entraîne, ~4 min). Les bobines 1, 2, 5, 6 et 8 ne sont pas
nécessaires à ce format de 30 minutes.

> **Deux pièges déjà relevés dans le plan de tournage** : la bobine 5 n'est pas
> tournable avec le seul jeu de démonstration, et la bobine 8 exige le compte
> administrateur. Aucune des deux n'est au programme ici.
