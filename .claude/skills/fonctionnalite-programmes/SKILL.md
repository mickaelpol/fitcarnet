---
name: fonctionnalite-programmes
description: Préparer ses séances à l'avance — créer un modèle Push/Pull/Legs, y poser des exercices et leurs séries cibles, les réordonner et propager cet ordre aux séances, transformer une séance en modèle. À charger avec `epreuve-fonctionnalite` pour éprouver et filmer l'onglet Modèles (bobine 6).
---

# Les programmes (onglet « Modèles »)

> Toutes les affirmations de cette fiche ont été vérifiées dans le code le
> **16 septembre 2026**, avec leur `fichier:ligne`. Les libellés sont recopiés
> du code, pas devinés. État de référence : le commit qui suit `e17f1e6` — celui
> où **les champs de série suivent le mode** (l'épreuve Android avait montré que
> le sélecteur ne commandait rien). `cd front && npm test` vert —
> **577 tests + 28 de rendu, sortie 0**.
>
> **Les lignes citées ont été recalées après ce correctif** : les champs de série
> ont quitté l'écran pour `front/src/composants/serieModele.tsx`, et
> `front/app/modele/[id].tsx` est passé de 367 à **353 lignes**.

## Le besoin

Quelqu'un qui s'entraîne trois fois par semaine refait les mêmes séances. Il ne
veut pas rechoisir ses exercices ni retaper « 4 × 8 à 55 kg » à chaque fois : il
veut un **patron** — « Haut du corps — poussée » — d'où la séance du jour part
déjà remplie. Et quand il décide de changer l'ordre de ses exercices, il veut
que ce changement vaille pour toutes ses séances, pas seulement pour le patron.

C'est la référence du « répond au besoin » : **le modèle fait autorité, la
séance en découle**, et un modèle n'appartient qu'à son compte.

## Ce que l'application propose

| Capacité | Où | `fichier:ligne` |
|---|---|---|
| Lister ses modèles, pastille de couleur par type, nombre d'exercices | onglet Modèles | `front/app/(onglets)/modeles.tsx:27-39` |
| Créer un modèle | bouton « + Nouveau modèle » | `front/app/(onglets)/modeles.tsx:42` |
| Nom libre | champ « Nom du modèle » | `front/app/modele/[id].tsx:200-205` |
| Type **Push / Pull / Legs** | trois pavés | `front/app/modele/[id].tsx:18,206-219` |
| **Le type filtre le catalogue proposé** | modale d'ajout | `front/app/modele/[id].tsx:59-72` |
| Ajouter un exercice (recherche + vignettes de muscles) | « + Ajouter un exercice » | `front/app/modele/[id].tsx:232-234,278-284` |
| **Mode de travail Charge / Tenue / Chrono** | sélecteur partagé, dans la carte | `front/app/modele/[id].tsx:152` · `front/src/composants/choixMode.tsx:45-68` |
| Séries cibles, **de la nature du mode** : rép et kg en Charge et Chrono, secondes en Tenue | carte d'exercice | `front/src/composants/serieModele.tsx:31-86` · appelé en `front/app/modele/[id].tsx:160-175` |
| Réordonner (poignée ⠿ **ou** flèches ▲▼) | liste déplaçable | `front/src/composants/listeDeplacable.tsx:28-73` |
| **Propager l'ordre aux séances**, après comptage | confirmation | `front/app/modele/[id].tsx:114-119,320-333` · `api/src/State/OrdreModeleProcessor.php:96-135` |
| Retirer un exercice du modèle | « Retirer » + confirmation | `front/app/modele/[id].tsx:190-192,286-303` |
| Supprimer le modèle | « Supprimer le modèle » + confirmation | `front/app/modele/[id].tsx:250-258,305-318` |
| **Transformer une séance en modèle** | « ★ Enregistrer comme modèle » | `front/app/seance/[id].tsx` (bouton) · `front/src/api/hooks/seances.ts:127-153` |
| Partir d'un modèle pour remplir une séance | « ▶ Partir d'un modèle » | `front/app/seance/[id].tsx:209` (modale titrée « Partir d'un modèle ») |

### Deux points à lire avant d'écrire quoi que ce soit dessus

**1. Le partage d'un modèle n'existe pas — et c'est une décision, pas un
manque.** Tranchée le 15 septembre 2026 (constat **F-05**). Le champ `partage`
a existé sans jamais rien faire : l'expression de sécurité l'autorisait
(`object.isPartage()`) pendant que `FiltreProprietaire` posait
`WHERE utilisateur = :moi` **dans la requête**, donc avant que l'expression ne
soit évaluée — le modèle d'un autre compte n'était jamais trouvé, la réponse
était 404, et la clause n'était jamais atteinte. Ce n'était pas un trou : la
fermeture gagnait. C'était une fonctionnalité morte qui affirmait le contraire.

Il a été retiré des **quatre** endroits le même jour :
`api/src/Entity/Modele.php:27-53` (le commentaire qui raconte la décision),
`db/manuel/33-retirer-le-partage-de-modele.sql`,
`db/01-schema.sql:283` (« PAS DE COLONNE `partage` ») et
`front/src/api/types.ts:179-185`. **Un modèle n'appartient qu'à son compte.**
Ne rien filmer, ne rien promettre, ne pas réintroduire le champ sans rouvrir la
décision.

**2. Le mode de travail Charge / Tenue / Chrono se choisit désormais dans
l'éditeur de modèle — livré le 16 septembre 2026** (commit `e17f1e6`). Cette
fiche a été commencée pendant que le chantier tournait ; voici l'état **vérifié
après son atterrissage** :

- Le modèle **stocke** un mode depuis toujours :
  `api/src/Entity/ModeleExercice.php:41-44`
  (`Assert\Choice(choices: Exercice::MODES)`), et le type front le porte
  (`front/src/api/types.ts:165-172`). Ce qui manquait, c'était le **choix**.
- Le sélecteur a été **extrait, pas recopié**, dans
  `front/src/composants/choixMode.tsx` : type `ModeTravail`, table `MODES`
  (`:9-13`) et composant `ChoixMode({ mode, onChange, suite })` (`:45-68`).
  Libellés exacts : **« Charge »**, **« Tenue »**, **« Chrono »** — pour les
  valeurs internes `charge`, `iso`, `chrono`.
- **Les deux écrans partagent ce composant** : l'éditeur de modèle
  (`front/app/modele/[id].tsx:10,152`) et la séance
  (`front/src/composants/exerciceSeance.tsx:10,166`). L'ancienne table `MODES`
  locale de `exerciceSeance.tsx` a disparu ; le raccourci « ↓ 12×25 » de la
  séance passe désormais par la propriété `suite`, pour rester dans la même
  rangée.
- Dans le modèle, `mode: ex.modeDefaut` (`:87`) reste la valeur **initiale** à
  l'ajout — c'est un défaut, plus une fatalité ; le mode affiché est lu **une
  seule fois** par carte, `bloc.mode ?? ex?.modeDefaut ?? 'charge'` (`:129`),
  et sert à la fois au sélecteur et aux lignes de série (`:152`, `:164`).
- **Et il commande ce qu'on prescrit — depuis le correctif du 16 septembre
  2026, pas depuis `e17f1e6`.** L'épreuve sur émulateur Android a montré
  qu'après bascule en « Tenue », les lignes affichaient encore « — kg » et
  « 12 rép » : le mode partait en base, la prescription ne suivait pas, et
  `ModeleSerie.secondesCible` n'était saisissable nulle part. Les champs sont
  sortis vers `front/src/composants/serieModele.tsx` — **rép et kg** en Charge
  et Chrono (`:47-61`), **secondes** en Tenue (`:65-72`) — et couverts par
  `serieModele.test-rendu.tsx` (5 tests, dont le témoin inverse du mode Chrono).
  Basculer de mode **ne jette pas** ce qui était saisi dans l'autre.
- **Accessibilité** : c'est un groupe **radio**, pas des boutons —
  `accessibilityRole="radiogroup"` sur la rangée, `accessibilityRole="radio"` et
  `aria-checked` **en clair** sur chaque pavé (`choixMode.tsx:51-60`). Le
  commentaire du fichier raconte pourquoi : `accessibilityState={{ selected }}`
  puis `{{ checked }}` ne produisaient **rien** dans le rendu de cette version de
  react-native-web, constaté en lisant le HTML réel (`:36-43`).
- **Couvert par des tests de rendu** :
  `front/src/composants/choixMode.test-rendu.tsx` — les trois modes proposés,
  un seul annoncé sélectionné, la valeur interne remontée (« Tenue » →
  `iso`), et le rechoix du mode actif qui ne casse rien.

C'est donc une capacité **livrée et filmable**, et non plus une promesse du
document du propriétaire.

## Le parcours

**Compte requis** : ordinaire. **Données de départ** : au moins un exercice au
catalogue (il y en a ~1338), et — pour le critère de propagation — au moins deux
séances du même type que le modèle (`db/manuel/jeu-demo.sql`).

1. Onglet **Modèles**. Vide, l'écran dit :
   « **Aucun modèle. Crée-en un pour préparer tes séances à l'avance.** »
   (`front/app/(onglets)/modeles.tsx:25`)
2. **« + Nouveau modèle »** (`:42`) → route `/modele/nouveau`, titre d'écran
   « **Modèle** » (`front/app/_layout.tsx:208`).
3. Champ « **Nom du modèle** », placeholder « **Push lourd, Pull volume…** »
   (`front/app/modele/[id].tsx:201,204`).
4. Choisir le type : **PUSH / PULL / LEGS** (affichés en majuscules,
   `:206-219`, `s.typeTexte` porte `textTransform: 'uppercase'` `:344`).
5. **« + Ajouter un exercice »** (`:232-234`) ouvre une modale titrée
   « **Ajouter un exercice** » (`:280`) : rangée de vignettes de muscles puis
   champ « **Rechercher…** » (`front/src/composants/choixAliment.tsx:81-99`).
   **La liste est déjà réduite au type du modèle** (`:59-72`) — un exercice sans
   groupe (`e.groupes.length === 0`) reste proposé partout, sinon il deviendrait
   introuvable.
6. La carte de l'exercice affiche « **n série(s)** » et le format prescrit
   (`:138-141`), puis le sélecteur **Charge / Tenue / Chrono** (`:152`), puis
   une ligne par série (`:160-175`, rendue par
   `front/src/composants/serieModele.tsx`) — **et ces champs dépendent du
   mode** : « **rép** » et « **kg** » en Charge et en Chrono (`:47-61`), un seul
   champ « **s** » en Tenue (`:65-72`). Un **×** retire la série (`:77-83`,
   libellé « Supprimer la série n » pour un lecteur d'écran), et les boutons
   « **+ Série** » (`:188`) et « **Retirer** » (`:190-192`) ferment la carte.
7. Dès **deux** exercices, l'aide apparaît (`:220-226`) :
   « Touche ⠿ pour saisir un exercice, puis l'endroit où le déposer. Les flèches
   ▲▼ le déplacent d'un cran. L'ordre du modèle pourra ensuite être appliqué à
   tes séances. »
8. **« Enregistrer le modèle »** (`:237`, « **Enregistrement…** » pendant
   l'envoi) → « **Enregistré.** » (`:244`).
9. Si l'ordre a changé, l'application **compte d'abord** (`appliquer: false`,
   `:114-119`) puis demande :
   titre « **Appliquer cet ordre à tes séances ?** », message
   « *n* séance(s) adopteraient l'ordre de ce modèle, y compris les anciennes.
   Seul l'affichage change : aucune série, aucune charge n'est modifiée. »,
   bouton « **Appliquer** » (`:320-333`).
10. Suppression : « **Supprimer le modèle** » (`:256`) → titre
    « **Supprimer ce modèle ?** », message
    « *<nom>* et ses *n* exercice(s) seront supprimés. **Tes séances passées ne
    sont pas touchées.** » (`:305-310`).

**Chemin inverse** : dans une séance remplie, « **★ Enregistrer comme
modèle** » (« **Création…** » pendant l'envoi) copie les blocs, **le mode
compris**, et transforme ce qui a été *fait* en objectifs — `repsCible:
s.reps ?? s.repsCible` (`front/src/api/hooks/seances.ts:127-153`). Une séance
vide propose au contraire « **▶ Partir d'un modèle** », et seulement s'il existe
au moins un modèle (`front/app/seance/[id].tsx:209`).

## Critères d'acceptation

1. **Créer** — un modèle nommé, de type Push, avec deux exercices, s'enregistre
   et réapparaît dans l'onglet Modèles avec sa pastille de couleur et
   « 2 exercices ». En base : une ligne `modele`, deux `modele_exercice`.
2. **Le type filtre le catalogue** — sur un modèle Legs, la modale d'ajout ne
   propose que les exercices dont `groupes` contient `Legs`, **plus** ceux dont
   `groupes` est vide. Un exercice Push ne doit pas apparaître.
   (`front/app/modele/[id].tsx:59-72`)
3. **Séries cibles** — « + Série » ajoute une ligne ; 12 et 55 saisis
   s'enregistrent en `repsCible = 12` et `poidsCible = 55`. **Une virgule ne
   doit pas être effacée pendant la frappe et 42,5 ne doit pas devenir 425** —
   c'est la panne du 15 septembre 2026, et ces champs en sont les jumeaux
   (`front/src/composants/serieModele.tsx:42-46`,
   `front/src/composants/champNombre.tsx`).
4. **Mode de travail, choisi dans le modèle** — les trois pavés **Charge /
   Tenue / Chrono** apparaissent sur chaque carte d'exercice (`:152`). À
   l'ajout, le pavé actif est celui du mode par défaut de l'exercice (`:87,129`).
   En choisir un autre doit :
   - le marquer comme sélectionné, **et lui seul** ;
   - écrire la **valeur interne** et non le libellé — « Tenue » s'enregistre
     `iso` (`front/src/composants/choixMode.tsx:9-13`) ; un libellé envoyé tel
     quel serait refusé par `Assert\Choice`
     (`api/src/Entity/ModeleExercice.php:41-44`) ;
   - **survivre à l'enregistrement** : relever `modele_exercice.mode` en base et
     vérifier qu'il porte le mode choisi et **non** `exercice.mode_defaut`.
   Un exercice de gainage passé en « Tenue » ne doit plus prescrire des kilos là
   où il faut des secondes — c'est la panne que ce chantier corrige. **Le
   vérifier à l'écran, et pas seulement en base** : c'est précisément ce qui
   manquait à la première livraison. Attendu : les champs « rép » et « kg »
   disparaissent, un champ « **s** » les remplace, et la durée saisie part en
   `modele_serie.secondes_cible`. Repasser en « Charge » doit **rendre** les
   kilos saisis : une bascule n'efface rien (règle 6).
5. **Un seul mode actif à la fois** — deux pavés annoncés sélectionnés ne
   veulent rien dire. L'état est porté par `aria-checked` sur un
   `accessibilityRole="radio"` (`choixMode.tsx:51-60`), donc **lisible par un
   lecteur d'écran** et pas seulement peint. Déjà figé par
   `front/src/composants/choixMode.test-rendu.tsx`.
5. **Réordonner** — la poignée ⠿ et les flèches ▲▼ donnent le même résultat ;
   l'aide apparaît à partir de deux exercices. Sur le web, c'est
   `listeDeplacable.web.tsx` qui sert (attributs HTML natifs), sur mobile
   `listeDeplacable.tsx` (`front/src/composants/listeDeplacable.tsx:9-16`).
6. **Propager l'ordre — on compte avant d'agir** — le premier appel ne modifie
   rien et rend `seancesConcernees` ; la confirmation le cite ; « Appliquer »
   fait le second appel. Messages exacts du serveur :
   « *n* séance(s) suivraient ce nouvel ordre. » (comptage),
   « *n* séance(s) réorganisée(s). » ou « **Tes séances suivaient déjà cet
   ordre.** » (`api/src/State/OrdreModeleProcessor.php:96-135`).
7. **Appariement en deux temps** — sont concernées les séances **issues de ce
   modèle** `OR` **du même type** ; un modèle **sans type** n'apparie que par
   filiation (`:83-90`). Un exercice absent du modèle est **repoussé à la fin
   dans son ordre d'origine** (`PHP_INT_MAX`, `:110-115`) : rien ne se perd.
8. **Rien d'autre que l'ordre ne bouge** — après propagation, relever en base
   que `serie.reps`, `serie.poids` et `serie.faite` sont **inchangés** ; seul
   `seance_exercice.ordre` a changé. C'est la promesse écrite à l'écran, règle 7.
9. **Modèle vide** — un modèle sans exercice répond « **Ce modèle ne contient
   aucun exercice.** » et ne touche à rien (`:56-60`).
10. **Isolation entre comptes** — `Modele` implémente `ProprieteUtilisateur`
    (`api/src/Entity/Modele.php:65`), donc `FiltreProprietaire` pose le `WHERE`.
    Le modèle d'un autre compte doit rendre **404, et non 403** — ne pas révéler
    son existence (`api/src/State/OrdreModeleProcessor.php:38-45`, deux fois :
    modèle inexistant et modèle d'autrui donnent le même message
    « Modèle introuvable. »). Éprouver avec deux comptes jetables.
11. **Le partage n'existe pas** — `GET /api/modeles` d'un compte B ne doit
    jamais faire apparaître un modèle de A, et aucun champ `partage` ne doit
    figurer dans la réponse. Contrôle statique déjà en place :
    `ModeleExposeTest::testAucuneExpressionDeSecuriteNePrometCeQueLeFiltreInterdit`.
12. **Séance → modèle** — « ★ Enregistrer comme modèle » crée un modèle dont
    les `repsCible`/`poidsCible` valent ce qui a été **fait** (`s.reps`), et à
    défaut l'objectif d'origine (`s.repsCible`). Le `mode` de chaque bloc est
    recopié (`front/src/api/hooks/seances.ts:139`).
13. **Suppression** — supprimer le modèle ne touche **aucune** séance passée :
    recompter `seance` et `serie` avant/après. La cascade ne descend que sur
    `modele_exercice` et `modele_serie` (`db/01-schema.sql:292-306`).
14. **Refus et vide ≠ zéro** — un champ de série laissé vide s'enregistre
    `null` (« je ne sais pas »), jamais `0`. Un type non choisi reste `null` et
    l'application ne doit pas en inventer un.

## Comment l'éprouver

**Web, par défaut.** Reconstruire le bundle avant toute épreuve (le doublon
`api/front` périme en silence) — voir `epreuve-fonctionnalite` §2.

```bash
# la propagation, vue de l'API : on COMPTE, puis on applique
curl -s -X POST http://localhost:8080/api/modeles/$ID/appliquer-ordre \
  -H "Authorization: Bearer $JETON" -H 'Content-Type: application/ld+json' \
  -d '{"appliquer":false}'
# -> {"seancesConcernees":N,"seancesModifiees":0,"message":"N séance(s) suivraient…"}
```

```sql
-- l'ordre a bougé, et RIEN D'AUTRE
SELECT se.seance_id, se.ordre, se.exercice_id
  FROM seance_exercice se JOIN seance s ON s.id = se.seance_id
 WHERE s.utilisateur_id = :moi ORDER BY se.seance_id, se.ordre;
-- le témoin qui doit rester identique avant/après :
SELECT count(*), sum(reps), sum(poids) FROM serie sr
  JOIN seance_exercice se ON se.id = sr.seance_exercice_id
  JOIN seance s ON s.id = se.seance_id WHERE s.utilisateur_id = :moi;
```

**Isolation** — avec deux comptes jetables (skill `donnees-de-test`) :

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://localhost:8080/api/modeles/$ID_DE_A/appliquer-ordre \
  -H "Authorization: Bearer $JETON_DE_B" -H 'Content-Type: application/ld+json' \
  -d '{"appliquer":true}'          # attendu : 404, PAS 403
curl -s http://localhost:8080/api/modeles -H "Authorization: Bearer $JETON_DE_B" \
  | grep -c "\"id\":$ID_DE_A"      # attendu : 0
```

**Pièges propres à cette fonctionnalité**

- **L'ordre ne part qu'après un enregistrement réussi** : `sauver()` déclenche
  le comptage dans son `onSuccess`, et seulement si `ordreChange` est vrai
  (`front/app/modele/[id].tsx:105-122`). Réordonner sans enregistrer ne propose
  rien — ce n'est pas une panne.
- **Un modèle neuf ne propose jamais la propagation** : `router.replace` sort de
  la fonction avant (`:109-113`).
- **Le mode ne se relit pas dans l'en-tête de la carte** : elle n'affiche que le
  nombre de séries et le format prescrit (`:138-141`). Ce qui trahit le mode, ce
  sont les **champs de série** en dessous — « s » plutôt que « rép » et « kg ».
  Pour la liste des modèles, en revanche, il faut relire la **base** ou rouvrir
  le modèle.
- Les séries d'un modèle passent par `addSeries()/removeSeries()` — les noms
  devinés par API Platform. Sans eux, **les séries envoyées à la création
  disparaissaient sans aucune erreur**, la réponse rendant `series: []`
  (`api/src/Entity/ModeleExercice.php:79-92`). Toujours **relire la réponse**,
  pas seulement le code HTTP.
- `paginationEnabled: false` sur `Modele` (`api/src/Entity/Modele.php:63`) : la
  liste n'est pas paginée, inutile de chercher un `itemsPerPage`.
- Vérifier la console : zéro erreur, et **aucun 403** — sur cette fonctionnalité
  un 403 serait le signe que le filtre a été contourné au profit d'un
  `security:`.

## La capture pour la démonstration

`presentation/captures/programmes/` — reprend la **bobine 6** de
`presentation/plan-de-tournage.md` (~2 min 30), état de départ : session
ordinaire avec le jeu de démonstration chargé.

| Fichier | Déroulé | Durée | Ce qu'on doit voir |
|---|---|---|---|
| `01-liste.webm` | onglet Modèles, défilement | 15 s | les pastilles de couleur, « n exercices » |
| `02-detail.webm` | ouvrir « Haut du corps — poussée » | 40 s | les exercices, **le sélecteur Charge / Tenue / Chrono** et **les séries cibles en rép et kg** (l'exercice étant en Charge) |
| `03-ajouter-retirer.webm` | « + Ajouter un exercice », puis « Retirer » | 30 s | la modale avec vignettes **et** le filtrage par type ; la confirmation « Retirer cet exercice ? » |
| `04-ordre-propagation.webm` | changer l'ordre → Enregistrer → « Appliquer cet ordre à tes séances ? » → **Appliquer** | 45 s | le **nombre de séances** dans la confirmation, puis le message de retour |
| `05-mode-de-travail.webm` | sur un exercice de gainage, passer de **Charge** à **Tenue**, enregistrer | 20 s | le pavé qui devient actif, et le modèle qui prescrit des secondes plutôt que des kilos |

**À ne PAS filmer** : le partage d'un modèle — *il n'existe plus*, tranché le
15 septembre 2026. Le plan de tournage porte encore la consigne barrée : il n'y
a plus rien à éviter de montrer, la fonctionnalité n'est pas dans
l'application.

**Le mode de travail est filmable depuis le 16 septembre 2026** (commit
`e17f1e6`) : c'est la prise `05`, qui n'existait pas dans la bobine 6 d'origine.
Elle répond directement à la ligne du document du propriétaire — « plusieurs
modes de travail » sur un modèle — que l'application ne tenait pas jusque-là.

## Limites connues

- **Le sélecteur de mode a été livré pendant la rédaction de cette fiche**
  (commit `e17f1e6`), puis **corrigé le même jour** : il ne commandait pas les
  champs de série, ce que seule l'épreuve Android a vu. Les citations ci-dessus
  portent sur le fichier **d'après ce correctif** — `front/app/modele/[id].tsx`
  fait désormais **353 lignes** (355 avant `e17f1e6`, 367 entre les deux), et
  les champs de série vivent dans `front/src/composants/serieModele.tsx`. Tout
  document qui cite `modele/[id].tsx` au-delà de `:125` sans avoir été recalé
  depuis est décalé.
- **Le partage de modèle n'existe pas** et ne doit pas être réintroduit sans
  rouvrir la décision du 15 septembre 2026.
- **Non éprouvé ici** : le mode de travail choisi dans un modèle est-il bien
  repris dans la séance qui en part (`partirDuModele`) ? Le composant et
  l'enregistrement sont vérifiés, **le trajet modèle → séance ne l'est pas**.
- `presentation/features.md` (section F, datée du 14 septembre) cite des lignes
  qui ne correspondent plus. **Les renvois cités dans ce paragraphe sont
  volontairement reproduits FAUX** — ce sont ceux de `features.md`, pas les
  miens : ne pas les « corriger ». Sa ligne « Appariement en deux temps »
  renvoie au fichier `OrdreModele.php` à la **ligne 73**, alors que ce fichier
  n'en compte que **53** — le renvoi tombe hors du fichier, et le mécanisme
  décrit vit en réalité dans `OrdreModeleProcessor.php:105-127`. Ses renvois à
  `modele/[id].tsx` (lignes 141, 196, 217 et 247) existent bien dans le fichier
  mais désignent autre chose que ce qu'ils annoncent — et ils ont encore glissé
  depuis, le fichier étant passé à 367 puis à 353 lignes. Se fier à cette fiche.
- **Non vérifié ici** : le comportement de la propagation sur un compte à
  l'historique très long. `OrdreModeleProcessor` a été corrigé d'un N+1 massif
  (`:62-74`) mais le gain n'a pas été mesuré sur des données réelles.
- **Non vérifié ici** : le glisser-déposer natif sur un vrai téléphone
  (`listeDeplacable.tsx`, `react-native-draggable-flatlist`). Le web utilise le
  fichier jumeau. Passer par la skill `verification-android` pour le geste
  tactile réel.
