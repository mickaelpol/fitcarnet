# Revue de `fonctionnalites-par-onglet.md`

Ton document, passé ligne à ligne contre le code, le 16 septembre 2026.
**Il n'a pas été modifié** : tout ce qui suit est ici.

**Comment lire.** ✓ confirmé dans le code · ◐ vrai avec une nuance qui compte ·
✗ absent de l'application. Chaque verdict porte son `fichier:ligne`.

> **Les renvois ont été recalés le 16 septembre 2026, et il y en avait quatorze
> de faux.** Ils dataient d'avant le découpage du lot 6 : `composer.ts` est
> passé de 817 lignes à 135, `cuisson.ts` de 611 à 22, `repas.tsx` de 2 316 à
> 655 — des renvois comme `composer.ts:800` ou `repas.tsx:2175` tombaient donc
> **hors du fichier**, et d'autres désignaient une ligne qui existe mais ne dit
> pas ce qu'on lui fait dire. Trouvé par `verite-documentaire`, qui les a
> comptés un par un. Un document qui promet « chaque verdict porte son
> `fichier:ligne` » et se trompe de ligne est pire qu'un document sans renvoi :
> il se fait croire. Les renvois pointent désormais vers les modules extraits
> (`solveur/periode.ts`, `calcul/fournees.ts`, `composants/carteRepas.tsx`,
> `calcul/planFige.ts`), et deux renvois trop imprécis pour être datés à la
> ligne citent leur module sans numéro plutôt qu'un chiffre inventé.

**Le résultat en une phrase** : sur tes 45 lignes, **41 sont confirmées**,
**4 demandent un arbitrage**, et il manque surtout des pans entiers — toute
l'administration, les invitations, Grocy, et la moitié de ce qui tient l'écran
debout.

---

## Séances

| Ta ligne | Verdict | Précision |
|---|---|---|
| Créer depuis un modèle ou la remplir soi-même | ✓ | le bouton « Partir d'un modèle » n'apparaît que sur une séance vide, et seulement si un modèle existe. `seance/[id].tsx:209-210` |
| Enregistrer une séance comme modèle | ✓ | `seance/[id].tsx:229` |
| Trois modes **charge / tenue / chrono** | ✓ | changer de mode n'interrompt pas une mesure en cours. `choixMode.tsx:55-56` |
| Enregistrer les chronos de tenue et de mode chrono | ✓ | tenue = un chrono **par série**, chrono = un temps **total** pour l'exercice. `chronoSerie.tsx:24` |
| Séries (répétitions × poids) | ✓ | `serie.tsx` |
| Ajout de série | ✓ | bouton « + Série » |
| Notes par exercice | ✓ | repliables, avec aperçu quand elles sont remplies. `exerciceSeance.tsx:262` |
| Ajout d'exercices par groupe musculaire | ✓ | quinze vignettes de muscles, dont « Autre ». `choixMuscle.tsx:57` |
| Recherche textuelle | ◐ | sur le nom français **et** anglais, sans accents (`api/src/Entity/Exercice.php:142-145`). **Mais le champ « Rechercher… » n'apparaît qu'APRÈS avoir choisi une vignette de muscle** (`front/src/composants/choixAliment.tsx:93`) — c'est voulu (chercher dans 1 338 exercices sans filtre ne donnait rien d'utile), et c'est un piège pour qui écrit un script de capture. |
| Tri par groupe musculaire | ✓ | le filtre muscle se cumule avec la recherche |
| Le tri et la recherche se basent sur la catégorie de la séance | ◐ | c'est le **type de la séance** (Push/Pull/Legs) qui filtre la liste proposée, et la recherche s'applique par-dessus. **Un exercice sans groupe reste proposé partout** — sinon un exercice non classé deviendrait introuvable. `seance/[id].tsx:62-66` |
| Agencement et ordre des exercices | ✓ | poignée à glisser **ou** flèches, mobile et web. `listeDeplacable.tsx:36` |
| Information sur l'exercice (vidéo, zone, muscle ciblé, muscles sollicités, format) | ✓ | bouton « Comment faire cet exercice ». Vidéo YouTube intégrée (WebView sur mobile, iframe sur le web) — **et aussi le matériel et l'exécution**, que tu n'as pas listés. `modaleExercice.tsx:143` |
| Proposition de remplir avec la dernière performance | ✓ | charges et répétitions réellement faites ; à défaut le format prescrit ; à défaut 3 séries. Plus le raccourci « ↓ 12×25 · 12×27,5 ». `seance/[id].tsx:53` |
| Évaluation de l'évolution depuis la dernière fois | ✓ | « ▲ +2,5 kg », « = stable », « 1re fois ». `disqueRM.tsx:84` |
| 1RM, zone de travail **70 à 90 %** | ✓ | exact — et c'est `presentation/features.md` qui se trompe en annonçant « 70–80 % ». `performance.ts:170`, `disqueRM.tsx:169` |
| Progression du 1RM sur un exercice | ✓ | plus une courbe à partir de 2 séances : « +7,5 kg sur 6 séances ». `sparkline.tsx:13` |
| Formule d'Epley `1RM = poids × (1 + reps/30)` | ◐ | même formule, écrite `poids × (1 + 0,0333 × reps)`. **Deux garde-fous que ton document ne dit pas** : au-delà de **15 répétitions** l'estimation est refusée (on mesure l'endurance), et une série d'**une** répétition est prise telle quelle, sans les 3,3 % qu'Epley ajouterait. `performance.ts:12,22,34` |
| Bouton de calcul du 1RM en bas de séance | ✓ | « ⚖ RM » : charge + répétitions → 1RM, arrondi réglable 1 / 2,5 / 5 kg, **et la table des paliers**. `calculateurRM.tsx:37` |
| Somme des répétitions, du poids soulevé et du chrono | ✓ | bilan par exercice. `exerciceSeance.tsx:230` |
| Minuteur de pause lancé au cochage, qui sonne | ✓ | son **et** vibration, **et une notification système** pour qu'il sonne application fermée — Android gèle les minuteurs JavaScript. `alarmeRepos.ts:8` |
| Paliers 1 min / 1 min 30 / 2 min / 3 min | ✓ | `PRESETS = [60, 90, 120, 180]`, durée mémorisée. `chrono.tsx:14` |

### Ce qui manque dans ton document, onglet Séances

- **Sauvegarde automatique** 2,5 s après la dernière frappe, forcée quand l'application passe en arrière-plan ; cinq états lisibles et un bouton « Réessayer l'enregistrement ». `sauvegardeAuto.ts:22`
- **Liste des séances** : type, date en français, pastille de couleur, avancement « 4/12 séries », vert quand tout est fait. `seances.tsx:50`
- **Cocher une série remplit les champs vides avec l'objectif**, puis relance le repos. `serie.tsx:40`
- **Avertissement séries longues** — « comptées dans le volume, mais écartées du 1RM ». `exerciceSeance.tsx:242-249`
- **Le repos survit au changement d'écran** ; l'écran reste allumé pendant le décompte ; pas de double bip au retour. `etatChrono.ts:3`, `ecranEveille.ts:25`
- **La mesure d'effort survit au démontage** de son champ, et un bandeau « mesure en cours » la porte. `etatMesure.ts:3`
- **Records antérieurs** par exercice, strictement avant la date de la séance. `historiqueSeances.ts:38`
- **Suppression d'une séance**, confirmée en nommant le type, la date et le nombre de séries. `seance/[id].tsx:298`

---

## Modèles

| Ta ligne | Verdict | Précision |
|---|---|---|
| Modèles réutilisables | ✓ | `modele/[id].tsx` |
| Type Push / Pull / Legs et nom libre | ✓ | le type filtre le catalogue proposé. `modele/[id].tsx:206` |
| Ordre et réagencement | ✓ | poignée ou flèches, aide affichée dès 2 exercices |
| Plusieurs modes de travail (charge / tenue / chrono) | ✓ **depuis le 16 septembre 2026** | ~~À trancher : le modèle stockait bien un mode, mais repris du mode par défaut de l'exercice au moment de l'ajout, et aucun sélecteur n'existait dans son écran.~~ **Tranché : ajouté.** Le sélecteur de la séance est extrait dans `src/composants/choixMode.tsx` et partagé par les deux écrans. Et, l'épreuve sur Android l'ayant montré muet, **les champs de série suivent maintenant le mode** : des secondes en « Tenue », des répétitions et des kilos en « Charge » et « Chrono » (`src/composants/serieModele.tsx`). |

### Ce qui manque dans ton document, onglet Modèles

- **Séries cibles par exercice** dans le modèle : répétitions et charge — ou une durée en mode « Tenue » —, ajout et suppression : ce sont elles qui pré-remplissent la séance. `front/src/composants/serieModele.tsx:31-86`, appelé en `modele/[id].tsx:160-175`
- **Propager l'ordre aux séances** : on annonce d'abord combien de séances l'adopteraient, « y compris les anciennes. Seul l'affichage change ». `OrdreModeleProcessor.php:96-99`
- **Suppression d'un modèle** : « Tes séances passées ne sont pas touchées. » `modele/[id].tsx:310`
- **Le partage d'un modèle n'existe pas** — décision du 15 septembre 2026, le champ a été retiré. Un modèle n'appartient qu'à son compte.

---

## Compte

| Ta ligne | Verdict | Précision |
|---|---|---|
| Objectifs par repas : Glucides / Lipides / Protéines / **Fibres** | ◐ | **Il n'y a pas de cible de fibres.** Une cible porte kcal, protéines, glucides, lipides et une case « glucides fibres comprises ». `db/01-schema.sql` table `cible`, `Cible.php:76`. Les fibres n'interviennent qu'ailleurs : le **convertisseur de plan** (on les retranche des glucides totaux) et l'affichage du repas (« dont X g de fibres »). À trancher : ajouter une cible de fibres, ou corriger la ligne. |
| Quatre moments : matin / midi / 16 h / soir | ✓ | `objectifs.tsx:18-21` |
| Compléments alimentaires (CRUD) | ✓ | par moment de repas ; c'est une **consigne**, pas un journal de prises, et volontairement hors du calcul. `Complement.php:43` |
| Réglages : sonnerie du minuteur | ✓ | cinq sonneries, jouées au toucher, réglage **propre à l'appareil**. `reglages.tsx:29` |

### Ce qui manque dans ton document, onglet Compte

- **Changer son mot de passe ou son adresse** — le mot de passe actuel est exigé, et **toutes les sessions sont révoquées**, y compris la courante. `UtilisateurProcessor.php:106,125-141`
- **Les calories se recalculent seules** dès qu'une macro change, avec alerte au-delà de 15 kcal d'écart : « L'app respecte les grammes ; les calories suivent. » `objectifs.tsx:109-110,278`
- **Convertisseur de plan américain** (protéines, glucides totaux, lipides, fibres, calories) avec aperçu « Sera enregistré : … » et l'avertissement « ton plan sous-estime ses fibres ». `planCoach.ts:51`
- **Récapitulatif des quatre repas** — « 40 P · 60 G · 15 L » ou « à définir ». `objectifs.tsx:310`
- **Savoir quelle version tourne et chercher une mise à jour** ; sur le web, le panneau se tait. `etatMaj.tsx:109`
- **Accès à l'administration** depuis cet onglet, pour un administrateur seulement — invisible et inatteignable pour les autres depuis le 15 septembre 2026.

---

## Frigo

| Ta ligne | Verdict | Précision |
|---|---|---|
| Stock (frigo, congélateur, placard) | ✓ | groupé par emplacement dans l'ordre d'un inventaire réel, avec « 12 en stock sur 40 ». `calcul/frigo.ts:21` |
| Inventaire : on ne renseigne que le poids | ✓ | saisie **en écarts** : on ne corrige que ce qui a bougé, et un champ vide n'est pas un zéro. `calcul/frigo.ts:76` |
| Ajout d'aliment | ✓ | depuis le catalogue commun (**les aliments déjà présents en sont retirés**) ou de zéro. `frigo.tsx:292` |
| Valeurs nutritionnelles, catégorie, poids cru → cuit | ◐ | le ratio de cuisson est exact, **et mesurable** (poids avant / après → « Utiliser ce résultat (2,3) »). Mais les catégories sont **huit**, pas trois : Protéine, Glucide, Légume, Fruit, Oléagineux, Matière grasse, Laitage, Autre. `nutrition.ts:237` |

### Ce qui manque dans ton document, onglet Frigo

- **Recherche** par aliment ou par emplacement, insensible aux accents. `calcul/frigo.ts:46`
- **Correction et suppression d'un aliment** — seulement le sien ; un aliment commun ne se supprime jamais, et un aliment encore en stock non plus (409 nommant le nombre de lignes). `AlimentSuppressionProcessor.php:42-50`
- **Contrôle de cohérence permanent** des valeurs, avec blocage de l'enregistrement sur « incohérent », et **détection des kilojoules** (« Convertir : 1473 kJ = 352 kcal »). `editeurAliment.tsx:133,258`
- **Fibres facultatives** — vide veut dire « non renseigné », pas zéro.
- **L'inventaire part en tâche de fond** : réponse immédiate, application par un travailleur, suivi « Tu peux quitter l'écran, ça continue tout seul », reprise exacte après une coupure, échecs nommés ligne par ligne. `FrigoController.php:326`
- **Le frigo Grocy** — tout un pan absent de ton document : lecture des stocks depuis Grocy, création d'un produit depuis l'application, signalement des produits incomplets, survie à une panne de Grocy. Sur Grocy, **la suppression est refusée et le nom non modifiable**. `FrigoGrocy.php`

---

## Repas

Les dix-sept lignes de ton document sont **toutes confirmées**. Les précisions
qui comptent :

| Ta ligne | Précision |
|---|---|
| Restes | c'est un **plafond**, pas une quantité imposée : le calcul en sert ce qu'il faut, pas plus. Mettre 0 retire l'aliment. `solveur/periode.ts:182` |
| Quantités bloquées pour un repas | vrai **et au-delà** : les jours partagent un seul frigo, résolus dans l'ordre du temps, et **le stock déjà promis à un plan prévu est retiré du disponible**. `solveur/plafonner.ts` |
| Liste de courses | la période est résolue **deux fois** — une fois bridée par le frigo, une fois frigo plein — et la liste est la différence. Seuil de 5 g. `solveur/periode.ts:241-242` |
| Batch cooking par méthode de cuisson | « on pèse **sec** » pour les fournées, mais les boîtes sont **en cuit** : annoncer le poids sec devant des boîtes ferait servir trois fois trop. `calcul/fournees.ts:76-85` |
| Revenir en arrière | oui, mais **revenir à l'étape « Jours » efface le plan** — les quantités ne voudraient plus rien dire. `repas.tsx:338` |
| « Cuisiné » déduit du stock | déduction **en poids pesé, avant cuisson** ; le plan est marqué avant de toucher au stock ; ce qui n'a pas pu être déduit est listé « À retirer toi-même du frigo ». `PlansController.php:148` |

### Ce qui manque dans ton document, onglet Repas

- **Les avertissements** — c'est le moment fort de la démonstration : « Ces
  aliments se ressemblent trop pour que le calcul fonctionne », « retire 40 g de
  riz », « X ne pèse quasiment rien ici ». `front/src/solveur/solveur.ts`

  > **Correction du 16 septembre 2026.** Cette liste comptait aussi « Tes grammes
  > représentent 612 calories, pas 580 ». **Ce message ne s'affiche PAS sur la
  > carte d'un repas** : il est émis en gravité `info`
  > (`front/src/solveur/solveur.ts:437`) et la carte filtre les `info`
  > (`front/src/composants/carteRepas.tsx:513`). On ne le voit que sur l'écran des
  > objectifs. Relevé en écrivant les fiches ; la bobine 4.5 ne peut pas le
  > montrer.
- **Les cuissons ont trois états** — cuit ainsi, se mange tel quel, ou personne n'a décidé. « Je n'en mets pas » n'est pas « je n'ai pas répondu ». Et elles sont **mémorisées d'une fois sur l'autre**. `calcul/fournees.ts:98-105`
- **Remplacer un aliment par rôle**, avec verrouillage : un aliment choisi par toi n'est jamais remplacé dans ton dos. `repas.tsx:583-587`
- **Les échanges automatiques sont expliqués** — « X ne permettait pas de tenir les objectifs : remplacé par Y. Tu peux revenir dessus. » `carteRepas.tsx:414`
- **Les compléments alimentaires apparaissent dans la boîte du repas** qui les porte.
- **Les plans enregistrés** : liste, état en toutes lettres (« Prévu · les ingrédients sont mis de côté » / « Cuisiné le mercredi 13/08 »), **aucune modification possible** (c'est un instantané), suppression. `calcul/planFige.ts:98,201`
- **Ce que l'application refuse de faire** — valeurs déjà cuites détectées, féculent qui rétrécit, plus de 100 g de nutriments dans 100 g. `plausibilite.ts`

---

## Les pans absents de ton document

Ils ne relèvent d'aucun de tes cinq onglets, et représentent une part
importante de ce que l'application sait faire.

**Accès et session** — connexion, aucune inscription libre, **invitation par lien**
(valable 7 jours, à usage unique, révocable, le serveur n'en garde qu'une
empreinte), portier sur toutes les routes, session d'une heure renouvelée par un
jeton révocable, limitation des tentatives, compte désactivé bloqué à la requête
suivante.

**Administration** (onglet Compte, administrateur seulement) — gestion du
catalogue d'exercices (six filtres, compteurs, validation du lien YouTube,
seuls les champs modifiés sont envoyés), **fusion de deux exercices** avec
report de l'historique, **façons de cuire**, **comptes** (inviter, désactiver,
supprimer en chiffrant ce qui sera détruit, refus de se bloquer soi-même ou de
bloquer le dernier administrateur).

**Le catalogue d'exercices** — environ 1 338 exercices, fiche détaillée à la
demande, recherche français/anglais, filtres par zone et équipement, **aucune
suppression possible** pour ne pas effacer l'historique.

**Ce qui tient sans se voir** — isolation stricte entre comptes, cache relu
depuis le disque au démarrage à froid (les écrans s'affichent avec les données
de la veille), tolérance au hors-ligne, anti-N+1, documentation de l'API fermée.

---

## Ce que la rédaction des fiches a mis au jour

Quinze fiches écrites depuis le code, par cinq agents. Chacun a confronté ce que
disent les documents à ce que fait l'application. Ce qu'ils ont trouvé :

**Des fonctionnalités sans écran.** L'API sait faire, rien ne le propose :

- **Changer son mot de passe ou son adresse** — la règle est complète côté
  serveur (mot de passe actuel exigé, toutes les sessions révoquées,
  `api/src/State/UtilisateurProcessor.php`), mais **aucun écran ne l'appelle** :
  pas une occurrence de `motDePasseActuel` dans `front/`. Ce document et
  `features.md` le rangeaient sous « onglet Compte » sans le dire.
- **Voir et révoquer ses sessions ouvertes** (`GET`/`DELETE /api/mes-sessions`) —
  écrit en réponse au constat M-02, **sans consommateur dans le front**.
- **Créer un exercice** — la création est réservée à l'administrateur depuis le
  15 septembre, et **aucun écran ne la propose, pour personne**. Un exercice créé
  par l'API naît privé, sans moyen de le publier. La prise 8.2 du tournage n'est
  donc pas filmable.

**Un écart à la règle d'isolation, à arbitrer.** `FrigoGrocy::lire()` ne prend
aucun utilisateur : **le frigo Grocy est global**, pas par compte. Sans
conséquence aujourd'hui — seul l'administrateur l'utilise et une invitation crée
toujours un compte en source `base` — mais deux comptes en Grocy liraient le même
stock et écriraient l'un chez l'autre. Ce n'est pas dans la liste des exceptions
documentées de la règle 2.

**Un chiffre faux dans l'API, corrigé le jour même.** `SeanceExercice::getRmEstime()`
appliquait Epley **sans le plafond de 15 répétitions ni le cas de la série
unique** : une série de 93 répétitions à 32 kg y valait 131 kg. Le front ne lit
pas ce champ, mais il est exposé. Aligné sur le module de référence, avec quatre
témoins.

**Et de la documentation qui mentait**, corrigée : la skill `nutrition-fitcarnet`
annonçait deux formules Atwater recopiées, réglées depuis le 15 septembre ;
`features.md` annonçait un jeton de rafraîchissement « d'un an » (c'est 90 jours
glissants) et « tout utilisateur peut ajouter un exercice » (c'est faux depuis le
15) ; et **mon propre correcteur automatique de références a abîmé des fiches**
en « corrigeant » des numéros de ligne qu'elles citaient volontairement faux.
Réparé — mais c'est le motif du projet en miniature : une règle juste appliquée
sans lire le contexte.

---

## Décisions prises, le 16 septembre 2026

1. **Les fibres ne deviennent pas un objectif par repas.** L'application reste
   comme elle est : la cible porte kcal, protéines, glucides et lipides, et la
   case « glucides fibres comprises » suffit. C'est la ligne du document qui est
   à corriger.
2. **Le mode de travail devient choisissable dans un modèle.** Le sélecteur
   Charge / Tenue / Chrono de la séance est extrait dans un composant partagé et
   rendu aussi dans l'éditeur de modèle — plutôt que recopié. **Et il commande
   ce qu'on prescrit** : l'épreuve sur émulateur Android a trouvé qu'après
   bascule en « Tenue », les lignes de série affichaient encore « — kg » et
   « 12 rép ». Les champs sont sortis vers `src/composants/serieModele.tsx`,
   testables, et donnent des secondes en « Tenue ».
3. **Les fiches suivent le découpage en 15 fonctionnalités**, une par fonction
   perçue, pour des captures vidéo courtes et ciblées.

Reste sans décision : les **catégories d'aliment** (huit dans l'application,
trois dans le document — imprécision d'écriture, aucun effet), et les **deux
garde-fous d'Epley**, qui restent tels quels.

## Ce qu'il fallait trancher

1. **Les fibres sont-elles un objectif par repas ?** Aujourd'hui non. Ton
   document dit oui.
2. **Le mode de travail doit-il se choisir dans un modèle ?** Aujourd'hui il est
   hérité de l'exercice et non modifiable là.
3. **Les catégories d'aliment** : ton document en cite trois, l'application en a
   huit. Simple imprécision, ou faut-il les regrouper à l'écran ?
4. **La formule d'Epley** : ton document ne mentionne pas les deux garde-fous
   (plafond de 15 répétitions, série d'une répétition prise telle quelle). Ils
   sont voulus — je les garde tels quels sauf avis contraire.

## Ce que je n'ai pas vérifié

- Le **frigo Grocy** en fonctionnement : il demande une instance configurée.
- Les **notifications d'alarme** téléphone fermé : Expo Go n'a plus les
  notifications distantes, il faut l'APK.
- **`presentation/features.md` est daté du 14 septembre** : il annonce encore
  « zone 70–80 % » (faux, c'est 70–90 %), le partage de modèle, et des fichiers
  comme inexistants qui existent depuis. À reprendre.
