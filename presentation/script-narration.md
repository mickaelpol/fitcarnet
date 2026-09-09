# fitcarnet — script de présentation

Ce document se lit **pendant** que tu présentes. Il donne, pour chaque slide, ce
qu'il faut dire, ce qu'il ne faut pas oublier, et ce qu'on va te demander.

**Durée visée : 25 à 30 minutes**, questions comprises. La vidéo dure 74 secondes
et se commente en direct — le minutage est en fin de document.

**Deux publics dans la salle.** Le client attend de savoir ce que le produit
résout ; l'équipe technique attend de savoir si c'est solide. Les actes 1 et 2
sont pour le premier, les actes 3 et 4 pour la seconde. Ne t'excuse jamais de
passer vite sur l'un : dis « j'y reviens en détail dans dix minutes ».

**Navigation** : flèches ← →, `F` pour le plein écran, clic droit/gauche de
l'écran. Le numéro de slide est en bas à droite.

---

## Acte 1 — Le produit · slides 1 à 10 · ~8 min

### 1. Titre
Laisse la slide s'installer deux secondes avant de parler.

> « fitcarnet, c'est une application de suivi nutritionnel et de musculation.
> Ce qui la distingue tient en une phrase : elle part de ce qu'il y a
> réellement dans votre frigo, pas d'un catalogue de 300 000 produits. »

### 2. Le problème
Le moment où le client doit se reconnaître. Ralentis.

> « Aujourd'hui les gens qui suivent leur alimentation sérieusement utilisent
> trois outils : une application de calories, un carnet de musculation, et un
> tableur pour les courses. Et c'est leur mémoire qui relie les trois. »

Puis la phrase qui porte tout :

> « Le suivi ne s'arrête pas par manque de volonté. Il s'arrête parce que la
> saisie coûte plus cher que ce qu'elle rapporte. »

### 3. La réponse
Trois piliers. Nomme-les, ne les détaille pas — les slides suivantes le font.

### 4. Le frigo
Montre l'écran. Puis pointe la mention « poids cru » sous la quantité :

> « Ça a l'air d'un détail. C'en est un qui décide de la justesse de tout le
> reste : le riz sec fait 350 kcal pour 100 grammes, cuit il en fait 130. Si on
> confond les deux, tous les chiffres de l'application sont faux. »

### 5. L'inventaire en écarts
> « On ne ressaisit pas trente aliments. On corrige les trois qui ont bougé.
> Une ligne qu'on n'a pas touchée n'est pas un zéro : elle n'a pas été comptée,
> et son stock ne bouge pas. »

### 6. L'inventaire en tâche de fond
La slide montre l'avant et l'après. **Question technique probable ici**, garde
la réponse pour l'acte 2 :

> « L'écran rend la main tout de suite. Le traitement continue sans lui. Je vous
> expliquerai pourquoi c'est construit comme ça — il y a une panne derrière. »

### 7. Le calculateur
Le cœur du produit. Prends ton temps.

> « À partir des cibles du jour et de ce qui est disponible, l'application
> compose les repas et donne les grammes à peser. Pas des portions, pas des
> recettes : des grammes, avant cuisson. »

### 8. Ce que le calcul donne
Pointe la couleur des écarts.

> « Quand le frigo ne permet pas d'atteindre la cible, l'écart est montré. Il
> n'est pas lissé pour faire joli. »

### 9. Quand les données sont douteuses
**La slide la plus forte de l'acte 1.** Lis l'avertissement à voix haute :

> « "Le calcul sera juste, mais il partira de chiffres qui ne peuvent pas être
> vrais." L'application sait qu'un grain sec fait 300 à 400 kcal pour 100
> grammes — c'est une borne physique. Elle sait aussi qu'une fibre inconnue
> fausse une cible en glucides totaux de 17 % sur un pain complet. Elle le dit
> avant de cuisiner, pas après. »

Puis, en regardant l'équipe technique :

> « C'est une règle du projet : un chiffre faux est pire qu'un refus de
> répondre. »

### 10. Le batch cooking et 11. Le carnet
Enchaîne. Sur le carnet, pointe le 1RM :

> « 63,3 kg estimés, plus 3,1 kg depuis la séance précédente. Neuf semaines de
> données derrière ce chiffre, et la formule est écrite à un seul endroit dans
> tout le code. »

---

## Acte 2 — L'architecture · slides 12 à 17 · ~7 min

Bascule annoncée : « Je passe sous le capot pour vos collègues. »

### 12. La pile
Ne lis pas les lignes une par une. Retiens deux chiffres :

> « 18 000 lignes de TypeScript côté application, 7 500 de PHP côté API. Le tout
> tourne sur un NAS personnel, sans compte tiers et sans mesure d'audience. »

### 13. Un seul code, trois cibles
> « Le même code sert le web et Android. Et le domaine métier — le solveur, les
> calculs nutritionnels, les formules de performance — est écrit une seule fois,
> en TypeScript pur, sans dépendance à React ni au réseau. C'est ce qui le rend
> testable. »

### 14. L'isolation des données
La slide qui rassure une équipe technique. Les quatre étages, dans l'ordre.

> « Le point important, c'est le quatrième : un test refuse toute entité exposée
> qui ne serait pas filtrée. Ce n'est pas une convention qu'on espère respecter,
> c'est une barrière qui casse la suite de tests. »

### 15. Le solveur
> « Ce n'est pas du tâtonnement : c'est un système linéaire résolu par
> élimination de Gauss avec pivot partiel. »

Si on te demande pourquoi pas un solveur du commerce :

> « Parce que les contraintes sont particulières — stock disponible, arrondis
> avant affichage, aliments négligeables à signaler — et parce qu'un module pur
> de quelques centaines de lignes se teste, se lit et se corrige. »

### 16. Pourquoi l'inventaire est asynchrone
**Raconte la panne.** C'est ce qu'on retient.

> « Le 14 août, l'envoi d'un inventaire est mort à mi-parcours. On croyait
> paralléliser quarante corrections ; en face, le service tourne avec cinq
> processus et une base qui n'accepte qu'un écrivain. Rien n'était parallélisé,
> tout faisait la queue, et PHP s'est arrêté à 30 secondes — le frigo à moitié
> corrigé, sans personne pour le dire. »

Puis la leçon :

> « Une requête HTTP a une durée maximale. Un inventaire n'en a pas. Les faire
> coïncider était une erreur de conception, pas un réglage à ajuster. »

### 17. Le déploiement
Rapide. Insiste sur la sauvegarde :

> « Une sauvegarde qu'on n'a jamais essayé de relire n'est pas une sauvegarde. »

---

## Acte 3 — Les garanties · slides 18 à 23 · ~7 min

### 18. Les chiffres
> « 468 tests. Un quart du code est du test. Et ils tournent en moins d'une
> seconde chacun — une suite qu'on attend est une suite qu'on ne lance pas. »

### 19. Le TDD
> « Le test est écrit avant le code, et on le regarde échouer. Deux fois, un
> test est passé du premier coup : on a remis le code fautif pour vérifier qu'il
> tombait. Un test qui ne peut pas échouer ne vaut rien — l'audit en avait
> trouvé douze de ce genre. »

### 20. L'audit
> « 84 constats, chacun reproduit avant d'être corrigé. Pas une liste de
> soupçons : des scénarios rejoués. »

### 21. L'exemple É1
**C'est ici qu'on gagne la confiance d'une équipe technique.** Raconte-le comme
une enquête :

> « Une route vérifiait que l'aliment appartenait bien au demandeur. Sa jumelle,
> qui écrit le même stock par un autre chemin, ne l'avait jamais reçue. Résultat :
> un compte pouvait poser un gramme sur l'aliment privé d'un autre, et cet
> aliment devenait impossible à supprimer. Pas une fuite de données — un blocage
> que la victime ne pouvait pas défaire. »

> « La correction n'a pas été de recopier le contrôle sur la deuxième route.
> Elle a été de le descendre au point de passage obligé de l'écriture : les trois
> chemins sont couverts d'un coup, et le prochain naîtra protégé. »

### 22. Les sept règles · 23. Les garde-fous
Passe vite, ce sont des slides de référence. Une phrase :

> « Chacune de ces règles a été enfreinte au moins une fois. Ce ne sont pas des
> préférences de style, ce sont des cicatrices. »

---

## Acte 4 — L'outillage · slides 24 à 27 · ~5 min

Annonce franchement : « Je vais vous dire comment c'est fabriqué. »

### 24. Développé avec l'IA
> « Ce projet est développé avec Claude Code, en terminal. Le point important
> n'est pas l'outil : c'est que les règles sont écrites dans le dépôt, versionnées,
> et lues à chaque session. L'IA ne décide pas des règles, elle les applique. »

### 25. Les compétences du dépôt
> « Six documents écrits pour ce projet précis : le cloisonnement des données,
> le motif de test de l'API, les conventions nutritionnelles… Et dix compétences
> génériques ont été supprimées la semaine dernière, parce qu'elles décrivaient
> une architecture que le code n'a pas. Un outillage qui ment coûte plus qu'il
> ne rapporte. »

### 26. Le graphe de connaissances
> « Le code, la documentation et l'audit sont indexés ensemble : 2 500 nœuds.
> On demande "où est le contrôle de propriété" et on obtient le sous-graphe,
> pas une recherche textuelle. »

### 27. Ce que ça change
> « 26 000 lignes et 468 tests en cinq semaines, à une personne. Mais rien n'est
> déclaré terminé sans la sortie des tests à l'appui, et une correction ne
> partage jamais un commit avec une refonte. »

---

## La vidéo · 74 secondes

Lance-la en plein écran. Voici ce que tu dis, seconde par seconde.

| Temps | À l'écran | Ce que tu dis |
|---|---|---|
| 0-5 s | Carton d'ouverture | « Deux parcours, filmés dans l'application, sans montage. » |
| 5-11 s | Carton « L'inventaire » | « Le premier : corriger le stock du frigo. » |
| 11-38 s | Saisie et envoi | « Le poulet était à 623 grammes. Je pèse, il en reste 480. Je corrige cette ligne-là, et elle seule. » … « J'envoie. Regardez le message : l'écran rend la main immédiatement, le traitement continue sans lui. » … « Et voilà le stock à jour. Entre les deux, le travail s'est fait en tâche de fond. » |
| 38-44 s | Carton « Composer les repas » | « Le deuxième parcours : composer les repas de la journée. » |
| 44-68 s | Composition | « Je pars des quatre cibles du jour. L'application regarde ce que le frigo permet… » … « Quatre repas, avec leurs macros réelles. Les écarts à la cible sont en couleur — ici le soir est en dessous, parce que le frigo ne permettait pas mieux. Elle le dit au lieu de l'arrondir. » |
| 68-74 s | Carton final | Laisse-le à l'écran pendant les questions. |

**Si on te demande de revoir un passage** : la vidéo est un fichier MP4 ordinaire,
tu peux revenir en arrière. C'est aussi pour ça qu'elle est muette.

---

## Les questions qui viendront

**« Combien de temps pour développer ça ? »**
> Cinq semaines, 120 commits, à une personne — avec l'assistance d'IA décrite
> dans le dernier acte. Le chiffre honnête inclut l'audit et les corrections.

**« Comment vous garantissez qu'un utilisateur ne voit pas les données d'un autre ? »**
> Trois pièces : une interface de marquage, un filtre Doctrine qui pose le WHERE
> sur toutes les requêtes, et un test qui refuse toute entité exposée non
> conforme. Plus, depuis la semaine dernière, un contrôle au point de passage
> obligé de l'écriture. Et je vous dis franchement ce qui manque encore : un test
> qui vérifie le filtre lui-même. C'est le prochain chantier.

**« Et si l'IA écrit du code faux ? »**
> C'est pour ça que le test est écrit avant, et qu'on le regarde échouer. Et que
> rien n'est déclaré terminé sans la sortie des tests collée dans la conversation.
> L'audit qui a trouvé 84 constats a été mené avec le même outil.

**« C'est utilisable par quelqu'un d'autre que vous ? »**
> L'application est multi-comptes, par invitation. Techniquement oui. Le produit
> est aujourd'hui taillé pour un usage personnel — c'est un choix, pas une limite
> technique.

**« Pourquoi pas une application du commerce ? »**
> Parce qu'aucune ne part du frigo réel, et parce que la convention européenne
> des fibres — 2 kcal par gramme, comptées à part — n'est presque jamais
> respectée. Sur un régime riche en fibres, l'écart se voit.

**Ce qu'il ne faut pas promettre** : une date de mise en production ouverte, un
support, ou une reprise de données depuis une autre application. Rien de tout
cela n'existe aujourd'hui.
