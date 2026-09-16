---
name: fonctionnalite-progression
description: Savoir si l'on progresse — 1RM estimé par la formule d'Epley avec ses deux garde-fous, disque de tendance, écart depuis la dernière fois, courbe de progression, table des paliers (zone 70 à 90 %), calculateur de charge, records antérieurs et bilan par exercice. À charger avec `epreuve-fonctionnalite` pour éprouver et filmer ce que l'application déduit d'une séance.
---

# Savoir si l'on progresse, et quoi mettre sur la barre

> **Vérifié dans le code le 16 septembre 2026.** Deux avertissements avant de
> commencer : `presentation/features.md:294` annonce une zone surlignée à
> « 70–80 % », **c'est faux** — le code affiche « Zone de progression · 70 à
> 90 % » (`disqueRM.tsx:169`) ; et les `fichier:ligne` de `features.md` pour
> `performance.ts` et `calculateurRM.tsx` ont glissé après la fusion des deux
> tables de paliers du 15 septembre. Ce sont les lignes de cette fiche qui font foi.

## Le besoin

Noter ses séries ne sert à rien si l'on ne sait pas quoi en conclure. Ce qu'on
veut savoir en salle tient en deux questions : **est-ce que je progresse ?** et
**qu'est-ce que je mets sur la barre maintenant ?**

L'application y répond par un seul nombre de référence, le **1RM estimé** — la
charge qu'on soulèverait une fois — d'où se déduisent les charges de travail.
C'est une application où **un chiffre faux est pire qu'un refus de répondre**
(règle 7) : un 1RM surestimé fait croire à un record, fait paraître les séances
suivantes en recul, et fait charger une barre trop lourde. Deux garde-fous
existent pour cette raison, et ils sont le cœur de ce qu'il faut éprouver.

## Ce que l'application propose

| Ce que l'utilisateur voit | Où | `fichier:ligne` |
|---|---|---|
| **Le 1RM estimé** d'un exercice : la meilleure de ses séries courtes | disque, en tête de la carte d'exercice | `front/src/calcul/performance.ts:47-59`, rendu `front/src/composants/exerciceSeance.tsx:149-156` |
| **Formule d'Epley**, `poids × (1 + 0,0333 × reps)`, écrite **à un seul endroit** | — | `front/src/calcul/performance.ts:31`, `:35-36` |
| **Garde-fou 1 — plafond de 15 répétitions.** Au-delà, l'estimation est **refusée** : on mesure l'endurance, pas la force | — | `front/src/calcul/performance.ts:19`, appliqué `:52` |
| **Garde-fou 2 — une série d'une répétition est prise telle quelle**, sans les 3,3 % qu'Epley ajouterait | — | `front/src/calcul/performance.ts:54`, et `:127` pour le calculateur |
| **La couleur du disque dit la progression, pas la charge** : vert au-dessus de +3 %, ambre stable, rouge en baisse, gris sans comparaison | disque | `front/src/composants/disqueRM.tsx:21`, `:23-37` |
| **L'écart depuis la dernière fois** : « ▲ +2,5 kg », « = stable », « 1re fois » | sous le disque | `front/src/composants/disqueRM.tsx:39-41`, `:83-91` |
| **Records antérieurs**, strictement **avant** la date de la séance ouverte | alimente la comparaison | `front/src/calcul/historiqueSeances.ts:34-54`, ligne de garde `:41` |
| **Courbe de progression** — 1RM en mode Charge, **volume** dans les autres modes ; à partir de **2 séances** ; « +7,5 kg sur 6 séances » | sous les séries | `front/src/composants/sparkline.tsx:13-74`, choix `exerciceSeance.tsx:222-227` |
| **Table des paliers**, dépliée au tap sur le disque | carte d'exercice | `front/src/composants/exerciceSeance.tsx:163`, `disqueRM.tsx:200-205` |
| **Zone de progression · 70 à 90 %**, par pas de 2,5 %, puis **Échauffement** à 60 / 50 / 40 % | table des paliers | `front/src/calcul/performance.ts:181-194`, libellés `disqueRM.tsx:169`, `:180` |
| **Sous 70 %, la charge est donnée mais pas les répétitions** — un tiret cadratin, jamais un zéro | table des paliers | `front/src/composants/disqueRM.tsx:108-119`, règle `performance.ts:209-210` |
| **L'arrondi suit la salle** — 2,5 kg par défaut, 1 kg seulement quand la zone de travail s'effondre | table des paliers | `front/src/calcul/performance.ts:256-265`, `:216` |
| **Deux paliers de même charge ne font qu'une ligne** — « 90–82,5 % · 17,5 kg » | table des paliers | `front/src/calcul/performance.ts:294-326`, libellé `disqueRM.tsx:100-106` |
| **Calculateur de charge** — « J'ai soulevé … kg » × « Répétitions réussies » → 1RM, arrondi réglable **1 / 2,5 / 5 kg**, et la même table | bouton **« ⚖ RM »**, barre du bas | `front/src/composants/calculateurRM.tsx:20-139`, bouton `front/src/composants/chrono.tsx:126-130` |
| **Avertissement séries longues** — « N séries de plus de 15 répétitions : comptées dans le volume, mais écartées du 1RM » | sous le bilan | `front/src/composants/exerciceSeance.tsx:253-260` |
| **Bilan par exercice** — RÉPÉTITIONS · KG SOULEVÉS · TEMPS | bas de la carte | `front/src/composants/exerciceSeance.tsx:230-251`, calcul `performance.ts:96-108` |

**Les deux chemins vers le 1RM doivent s'accorder** — la carte d'exercice
(`rmDesSeries`) et le calculateur (`estimerDepuisEssai`) donnaient 103,3 kg
contre 100 kg pour la même série d'une répétition. C'est le constat E1 de
l'audit, corrigé, et tenu par `front/src/calcul/performance.test.ts`.

## Le parcours

**Compte requis** : un compte ordinaire. **Données de départ** : `jeu-demo.sql`
sur le compte jetable — sans historique, **ni le disque ni la courbe n'ont de
point de comparaison**, et tout s'affiche « 1re fois ».

1. **Ouvrir une séance** qui contient un exercice déjà fait plusieurs fois.
2. **Saisir une série** : 8 répétitions à 47,5 kg. Le disque apparaît dès qu'une
   série est exploitable (`exerciceSeance.tsx:149`), affiche le 1RM arrondi au
   dixième (`disqueRM.tsx:77-79`), et l'unité « 1RM kg » (`:52`).
3. **Lire la couleur et l'écart** : « ▲ +2,5 kg » si l'on dépasse de plus de 3 %
   le meilleur 1RM antérieur, « = stable » si l'écart est négligeable, « 1re
   fois » s'il n'y a rien à comparer (`disqueRM.tsx:83-91`).
4. **Toucher le disque** : la **table des paliers** se déplie
   (`exerciceSeance.tsx:153`, `:163`). En-têtes : « % du 1RM », « Charge »,
   « Répétitions » (`disqueRM.tsx:162-164`). Puis « Zone de progression · 70 à
   90 % » et « Échauffement ».
5. **Lire la note du bas** : « Sous 70 % du maximum, la charge est indiquée mais
   pas les répétitions : l'estimation d'Epley dépasserait 15 répétitions, où
   elle ne veut plus rien dire. » (`disqueRM.tsx:187-194`).
6. **La courbe** s'affiche sous les séries dès qu'il y a **plus d'un point**
   (`exerciceSeance.tsx:222`), titrée « Progression du 1RM » en mode Charge,
   « Volume soulevé » sinon (`:223`, `:226`), avec « +7,5 kg sur 6 séances »
   (`sparkline.tsx:68`).
7. **Le calculateur** : bouton **« ⚖ RM »** dans la barre du bas
   (`chrono.tsx:126-130`). Titre « Calculateur de RM », champs « J'ai soulevé »
   (placeholder « 40 », unité kg) et « Répétitions réussies » (placeholder
   « 3 », unité rép) (`calculateurRM.tsx:61`, `:69`, `:74`). Résultat en grand,
   suivi de « kg au maximum » (`:90-93`), puis « Arrondi · 1 kg / 2,5 kg /
   5 kg » (`:96-109`) et la table. En bas : « Les répétitions sont une
   estimation — ton ressenti prime. » (`:117-119`).

## Critères d'acceptation

1. **Epley donne le bon nombre.** 8 répétitions à 47,5 kg → `47,5 × (1 + 0,0333
   × 8) = 60,2` kg, arrondi au dixième (`performance.ts:35-36`, `:58`). Vérifier
   **au dixième près** : règle 7.
2. **REFUS — au-delà de 15 répétitions, pas de 1RM.** Saisir 30 répétitions à
   40 kg : le disque **ne doit pas** proposer de 1RM issu de cette série
   (`performance.ts:52`). Le cas historique : une série d'endurance posait un
   « record » de 79,96 kg, et les séances suivantes s'affichaient en recul face à
   ce fantôme (`historiqueSeances.ts:8-21`).
3. **La série longue est dite, pas cachée.** Le même cas doit afficher
   « 1 série de plus de 15 répétitions : comptée dans le volume, mais écartée du
   1RM — au-delà, on mesure l'endurance et non la force. »
   (`exerciceSeance.tsx:253-260`). Un refus muet ne serait pas acceptable.
4. **Une série d'une répétition est prise telle quelle.** 1 × 100 kg → **100 kg**,
   et non 103,3 (`performance.ts:54`). **À vérifier sur les deux chemins** : la
   carte d'exercice **et** le calculateur « ⚖ RM » (`:127`). C'est exactement là
   que les deux divergeaient.
5. **REFUS — le calculateur refuse une saisie illisible.** « 8,5 » répétitions ou
   « 4,2,1 » kg ne doivent **pas** produire de 1RM : `nombreSaisi` rend `null`, pas
   un nombre plausible (`calculateurRM.tsx:40-46`, `saisieNombre.ts:30-43`).
6. **REFUS — au-delà du plafond, le calculateur explique.** Saisir 20
   répétitions : « Au-delà de 15 répétitions, on mesure l'endurance :
   l'estimation perdrait son sens. Refais un essai plus lourd. »
   (`calculateurRM.tsx:47`, `:80-85`). Et **aucun chiffre** ne doit s'afficher à
   la place.
7. **Sans saisie, le calculateur ne devine pas.** Champs vides → « Renseigne un
   essai réussi : la charge et le nombre de répétitions que tu as tenues. »
   (`calculateurRM.tsx:123-128`). Vide ≠ zéro (règle 6).
8. **La couleur suit la tendance, au seuil de 3 %.** Un gain de 2 % doit afficher
   « = stable » en ambre, pas « en progression » (`disqueRM.tsx:21`, `:23-30`).
   Une répétition de moins sur douze fait déjà 2,4 % : c'est du bruit.
9. **Sans comparaison, on dit « 1re fois »**, en gris — jamais « +0 kg »
   (`disqueRM.tsx:88`, `:36`).
10. **Les records antérieurs sont strictement antérieurs.** La séance ouverte ne
    doit **pas** se comparer à elle-même : une séance du jour ne compte pas dans
    son propre record (`historiqueSeances.ts:41`, appel `seance/[id].tsx:52`).
    Vérifier en ouvrant deux fois la même séance.
11. **La zone surlignée est 70 à 90 %.** Le titre exact est « Zone de progression
    · 70 à 90 % » (`disqueRM.tsx:169`) et la table porte neuf paliers de travail,
    de 90 % à 70 % par pas de 2,5 % (`performance.ts:181-190`). **C'est le
    critère qui contredit `features.md`.**
12. **REFUS — sous 70 %, pas de répétitions annoncées.** Les lignes 60 / 50 /
    40 % doivent afficher un **tiret cadratin** dans la colonne Répétitions, pas
    un nombre (`disqueRM.tsx:115-119`, `performance.ts:209-210`). Avant
    correction, la table annonçait « 45 » à 40 % avec le même aplomb que « 3 » à
    90 % — le défaut type de la règle 7.
13. **L'arrondi ne propose pas des charges qui n'existent pas.** À 20 kg de 1RM,
    la table ne doit pas répéter trois fois « 15 kg » : le pas descend à 1 kg
    quand la zone de travail donne moins de 5 charges distinctes
    (`performance.ts:216`, `:256-265`). À 100 kg, le pas reste 2,5 kg.
14. **Deux paliers confondus ne font qu'une ligne**, et cette ligne porte
    l'intervalle — « 90–82,5 % » — et **perd** la prédiction si une extrémité
    sort du domaine (`performance.ts:294-326`, `disqueRM.tsx:100-106`). La note
    du bas mentionne alors les paliers confondus (`disqueRM.tsx:191-193`).
15. **La courbe ne s'affiche pas avec un seul point**, et jamais pour des valeurs
    non finies (`sparkline.tsx:22-23`). Deux séances au même niveau donnent une
    ligne médiane, pas des barres pleines (`:31`).
16. **La courbe change de nature avec le mode.** En Charge : « Progression du
    1RM ». En Tenue ou Chrono : « Volume soulevé » — parce que le 1RM n'a pas de
    sens sur une série longue (`exerciceSeance.tsx:222-227`).
17. **Le bilan compte tout, le 1RM non.** Une série de 30 × 40 kg doit apparaître
    dans « KG SOULEVÉS » (1 200) et dans « RÉPÉTITIONS » (30) tout en étant
    exclue du 1RM (`performance.ts:62-73`, `:96-108`). C'est la distinction
    centrale de cette fiche.
18. **Le temps n'apparaît pas en mode Charge** (`performance.ts:103`).
19. **Isolation entre comptes.** Les records et la courbe se calculent à partir
    de `GET /api/seances`, filtré par propriétaire : un compte neuf doit voir
    « 1re fois » partout, jamais les records d'un autre (règle 2).

## Comment l'éprouver

**Le web suffit** pour tout, sauf la saisie décimale au clavier natif (voir
`fonctionnalite-seances`, critère 7).

Le cœur de cette fiche est **arithmétique** : chaque critère se vérifie en
comparant le nombre affiché au nombre calculé à la main.

```bash
# la règle de référence, isolée — le test tombe si une formule est recopiée
npm --prefix /home/micka/perso/fitcarnet/front test
```

Les modules de référence sont éprouvés par `front/src/calcul/performance.test.ts`
et `front/src/calcul/historiqueSeances.test.ts`. **Ils ne dispensent pas de
l'épreuve à l'écran** : le défaut historique n'était pas dans la formule, il
était dans le fait qu'il y en avait **trois**, aux bornes divergentes.

**Les pièges propres à cette fonctionnalité :**

- **Le disque n'apparaît qu'avec une série exploitable** (`exerciceSeance.tsx:149`).
  Répétitions ou charge manquantes, charge nulle, plus de 15 répétitions : pas de
  disque. Ne pas le lire comme une panne d'affichage.
- **Le bouton « ⚖ RM » ouvre le calculateur, pas le disque.** Depuis l'écran de
  séance il est appelé avec `rmConnu={null}` (`seance/[id].tsx:286`) : il
  **n'hérite pas** du 1RM de l'exercice en cours, et affiche donc l'invite de
  saisie tant qu'on n'a rien tapé. Le plan de tournage 7.8 confond les deux.
- **La table est la même des deux côtés** (`calculateurRM.tsx:111-115`) : si elles
  diffèrent à l'écran, c'est une régression, pas une variante.
- **Un compte sans historique rend cette fiche inéprouvable** : charger
  `jeu-demo.sql` d'abord.

## La capture pour la démonstration

Reprend les plans **7.4, 7.5 et 7.8** de la bobine 7 de
`presentation/demonstration.md` — 7.5 y est marqué **« le moment fort »**.

`presentation/captures/progression/` :

| Fichier | Déroulé | Durée | Ce qu'on doit voir |
|---|---|---|---|
| `01-derniere-fois.webm` | Montrer la puce « ↓ 12×25 · 12×27,5 » au-dessus des séries | 20 s | Ce qu'on avait fait la dernière fois, **avant** de saisir |
| `02-1rm-en-direct.webm` | Saisir une charge plus lourde, **rester sur le nombre** | 45 s | Le disque qui se recalcule à la frappe, la couleur qui bascule au vert, « ▲ +2,8 kg » |
| `03-paliers.webm` | Toucher le disque, laisser lire la table | 35 s | « Zone de progression · 70 à 90 % » surlignée, puis « Échauffement » avec des **tirets** en colonne Répétitions |
| `04-garde-fou.webm` | Saisir 30 répétitions à 40 kg | 30 s | L'avertissement séries longues, et le 1RM qui **ne bouge pas** — le refus, filmé |
| `05-courbe.webm` | Défiler jusqu'à la courbe | 25 s | Les barres, la dernière colorée, « +7,5 kg sur 6 séances » |
| `06-calculateur.webm` | « ⚖ RM » → 40 kg × 3 rép → changer l'arrondi | 40 s | Le résultat en grand, les trois pas d'arrondi, la table qui se recompose |

**Ce qu'il faut dire sur le plan 04** : c'est le plan qui vend l'application.
Une application de musculation qui **refuse** d'afficher un chiffre, et qui dit
pourquoi, se distingue de toutes celles qui affichent 79,96 kg sans broncher.

## Limites connues

- **L'API publie son propre 1RM, et il ne suit pas les deux garde-fous.**
  `SeanceExercice::getRmEstime()` (`api/src/Entity/SeanceExercice.php:129-146`)
  recalcule Epley **sans plafond de répétitions** (`:136` ne teste que `reps < 1`)
  et **sans** le cas de la série d'une répétition — elle y reçoit les 3,3 %
  qu'Epley ajoute. Le champ est exposé dans le groupe `seance:lire` et vaut donc
  pour tout consommateur de l'API. **Le front ne l'utilise pas** : l'écran de
  séance recalcule depuis les séries via `performance.ts`
  (`exerciceSeance.tsx:63`), et aucun écart n'est visible à l'écran. Mais c'est
  une **sixième écriture de la formule**, divergente, et contraire à la règle 5.
  Relevé le 16 septembre 2026, **non corrigé** — à signaler, pas à corriger dans
  une épreuve (`epreuve-fonctionnalite`, règle 3).
- **`presentation/features.md:294` dit « zone 70–80 % »** : faux, c'est 70 à
  90 %. Déjà signalé par `presentation/demonstration.md` (partie V, point 4),
  toujours pas corrigé dans `features.md`.
- **Le document du propriétaire ne mentionne pas les deux garde-fous**
  (`presentation/fonctionnalites-par-onglet.md`, ligne sur la formule d'Epley).
  Arbitrage rendu le 16 septembre : **ils restent tels quels**.
- **Non vérifié : le comportement au-delà de 100 répétitions.** L'API borne
  `reps` à 100 (`api/src/Entity/Serie.php:37`) ; le cas historique cité dans le
  code parle d'une série de 93 répétitions. Le comportement exact à la borne n'a
  pas été éprouvé.
- **Non vérifié : la table des paliers sous 10 kg de 1RM.** Le code prévoit qu'un
  palier de travail et un palier d'échauffement s'y confondent
  (`performance.ts:281-293`) ; ce cas n'a pas été reproduit à l'écran.
- **Non vérifié : `predictionValide` au-delà de 100 %.** `repsAu` répond pour
  tout pourcentage et son commentaire avertit de ne jamais l'afficher sans garde
  (`performance.ts:132-141`) ; aucun chemin d'affichage n'a été trouvé qui la
  contourne, mais l'absence n'a pas été prouvée par recherche exhaustive.
