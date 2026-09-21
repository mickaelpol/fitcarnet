---
name: fonctionnalite-objectifs
description: Fixer ce qu'on doit manger — une cible kcal/protéines/glucides/lipides par repas (Matin, Midi, 16 h, Soir), le recalcul automatique des calories, l'alerte d'incohérence, la case « glucides fibres comprises », le convertisseur de plan américain et les compléments alimentaires. À charger avec `epreuve-fonctionnalite` pour éprouver et filmer l'écran « Mes objectifs ».
---

# Mes objectifs par repas

## Le besoin

Quelqu'un suit un plan diététique — donné par un coach, ou calculé en ligne — et
doit **savoir ce qu'il doit manger à chaque repas**, pas sur la journée. Un
petit-déjeuner et un dîner n'ont ni les mêmes macros ni la même forme : une
cible journalière unique ne permettrait pas de composer l'un sans l'autre.

C'est l'écran qui **fixe la référence de tout le calculateur** : sans cible pour
un repas, ce repas ne se compose pas. Et c'est l'écran où se règle ce qui
s'avale sans se peser — créatine, magnésium — pour que ça figure sur la boîte
sans entrer dans le calcul.

La difficulté réelle qu'il traite : **un plan américain ne parle pas la même
langue qu'une étiquette française**. « 61,8 g de glucides » y comprend les
fibres ; ici elles sont comptées à part, à 2 kcal/g. Recopier sans le savoir,
c'est viser huit grammes de trop par repas sans qu'aucun écran ne le signale.

## CET ÉCRAN NE JUGE PLUS RIEN — palier B, 21 septembre 2026

Deux règles ont quitté `front/app/objectifs.tsx` pour le serveur, et cette fiche
a été refaite là-dessus. Ce n'est pas un détail d'implémentation : **ce qui est
affiché n'est plus composé ici, il est reçu tout rédigé**, et une épreuve qui
coupe le serveur ne verra donc plus les mêmes phrases.

| Ce que l'écran faisait | Qui le fait maintenant |
|---|---|
| Le seuil de 15 kcal, les deux conventions de glucides, et la phrase « Tes grammes représentent 740 calories, pas 710 » | `POST /api/verification/cible` → `api/src/Service/CoherenceDesCibles.php` |
| La conversion d'un plan américain, l'arrondi au dixième, le seuil de plausibilité des fibres et sa phrase | `POST /api/verification/plan-coach` → `api/src/Service/PlanCoach.php` |

`front/src/calcul/planCoach.ts` est **supprimé** — il n'avait qu'un appelant,
c'est un déménagement complet et non un jumeau déclaré. `objectifs.tsx`
n'importe plus `SEUIL_COHERENCE`, `ecartDeCoherence` ni `bornesDeCoherence` :
`front/src/calcul/coherenceCibleUnique.test.ts` refuse qu'un écran s'y remette,
et vérifie en plus que le seuil dit **le même nombre dans les deux langages**
(`:118`).

**Le jumeau qui reste est DÉCLARÉ** : `front/src/solveur/solveur.ts` garde ces
trois symboles (`:65`, `:98-108`, `:110-113`) parce que le solveur calcule
encore dans le navigateur et pose le même constat dans ses diagnostics. Il part
au palier 3. Ne pas le confondre avec une copie oubliée.

Ce qui reste du métier à l'écran : **lire un nombre tapé** — la virgule, le vide,
l'illisible (`saisieNombre.ts`) — et **proposer les calories que décrivent les
grammes**, qui est de la saisie assistée et non un jugement, puisque le champ
reste modifiable et que rien n'est refusé (`objectifs.tsx:12-25`, `:69-71`).

## Ce que l'application propose

| Capacité | Où | `fichier:ligne` |
|---|---|---|
| **Quatre cibles, une par moment** — `Matin` / `Midi` / `16 h` / `Soir`, en segments en haut de l'écran ; les noms longs sont `Petit-déjeuner`, `Déjeuner`, `Collation`, `Dîner` | Mes objectifs | `front/app/objectifs.tsx:34-36`, `:212-222` |
| **Quatre champs** : `Protéines`, `Glucides`, `Lipides` (en `g`), `Calories` (en `kcal`) | idem | `objectifs.tsx:322-334` |
| **Les calories se recalculent seules** dès qu'une macro change — `4·P + 4·G + 9·L` : `kcalDesMacros` délègue à `kcalDesGrammes`, seule écriture de la somme dans le front depuis le 17 septembre 2026 (`formuleUnique.test.ts`) | idem | `objectifs.tsx:158-165`, `front/src/solveur/solveur.ts:80-82`, `front/src/calcul/nutrition.ts:34-40` |
| **Alerte d'incohérence au-delà de 15 kcal**, avec deux formulations selon la convention — **rédigée par le serveur**, affichée telle quelle | idem | `api/src/Service/CoherenceDesCibles.php:105-130`, affichage `objectifs.tsx:354-359` |
| **Dit quand il n'a PAS pu vérifier** — un serveur muet ne se lit pas « cohérent » | idem | `objectifs.tsx:365-370` |
| **Case « Glucides fibres comprises »**, dont le texte d'aide change avec l'état | idem | `objectifs.tsx:230-244` |
| **Convertisseur de plan américain**, repliable, avec aperçu « Sera enregistré : … » | idem | `objectifs.tsx:246-251`, `:292-303` |
| **Avertissement « ton plan les sous-estime »** sur des fibres invraisemblables — **rédigé par le serveur**, l'écran n'ajoute que le `⚠` | idem | `api/src/Service/PlanCoach.php:95-106`, affichage `objectifs.tsx:305-311` |
| **Ce qui décrit une saisie précédente s'estompe** (opacité 0,45), et « Reporter » s'éteint | idem | `objectifs.tsx:293`, `:313-314`, `:354-359` |
| **Jamais de glucide négatif** à la conversion | — | `PlanCoach.php:54-57` |
| **Récapitulatif des quatre repas** — « 40 P · 60 G · 15 L » ou « à définir » | bas de l'écran | `objectifs.tsx:387-401` |
| **Refus d'une saisie illisible** : champ bordé de rouge, bouton éteint | idem | `objectifs.tsx:50`, `:76`, `front/src/calcul/saisieNombre.ts:30` |
| **Compléments alimentaires par moment de repas** — consigne, pas journal de prises | onglet Compte, encart repliable | `front/src/composants/complements.tsx:135`, `api/src/Entity/Complement.php:19` |
| **Doublon et quantité invalide annoncés avant l'envoi** | idem | `complements.tsx:275`, `:280` |
| **Isolation par compte** — `Cible` et `Complement` implémentent `ProprieteUtilisateur` | API | `api/src/Entity/Cible.php:38`, `Complement.php:59` |

### Les chiffres qui font foi

- `KCAL_PROTEINES = 4`, `KCAL_GLUCIDES = 4`, **`KCAL_FIBRES = 2`**, `KCAL_LIPIDES = 9`
  — `front/src/calcul/nutrition.ts:10-13`. **Convention européenne** : les fibres
  sont comptées **à part** et valent **2 kcal/g**, jamais 4 ni 0.
- `CoherenceDesCibles::SEUIL = 15.0` kcal — `api/src/Service/CoherenceDesCibles.php:38`.
  En deçà, c'est de l'arrondi ; il se franchit **strictement**, 15 kcal pile ne se
  reproche pas (`:112`). Le jumeau déclaré du solveur dit le même nombre —
  `SEUIL_COHERENCE = 15`, `solveur.ts:65` — et `coherenceCibleUnique.test.ts:118`
  refuse qu'ils divergent.
- Fibres douteuses : **glucides ≥ 20 g ET fibres < glucides / 10** —
  `PlanCoach.php:97`. C'est un ordre de grandeur, pas une loi.
- Affichage des nombres : arrondi à l'entier si l'écart est < 0,05, sinon une
  décimale — `nb()`, `front/src/theme/index.ts:174`. **Les phrases du serveur
  emploient le même format** : `FormatCourt::nb`
  (`api/src/Service/FormatCourt.php:44`), portage exact de `toFixed` parce que
  `number_format` pré-arrondit — 3 410 divergences sur 100 001 valeurs, relevé et
  corrigé le 21 septembre 2026.

## Le parcours

**Compte requis** : ordinaire. **Données de départ** : aucune — l'écran sait dire
« aucun objectif enregistré ».

1. Onglet **Compte** → bouton **« Mes objectifs par repas »**
   (`front/app/(onglets)/compte.tsx:85-86`). L'en-tête de la page est
   **« Mes objectifs »** (`front/app/_layout.tsx:319`).
2. Le segment du haut porte **`Matin` · `Midi` · `16 h` · `Soir`**. `Midi` est
   sélectionné au départ (`objectifs.tsx:56`). Sous la carte :
   **« Déjeuner »**, suivi de **« · aucun objectif enregistré »** tant qu'il
   n'y en a pas (`objectifs.tsx:225-228`).
3. **Changer de repas recharge tout** — les champs, la case, et le panneau de
   recopie, qui se **vide et se referme** (`objectifs.tsx:128-140`).
4. La case **« Glucides fibres comprises »**, décochée par défaut, affiche :
   - décochée : *« Convention française : les fibres sont comptées à part, comme sur tes étiquettes. »*
   - cochée : *« Chiffre d'un plan nord-américain, recopié tel quel. Le calculateur y ajoutera les fibres réelles de tes aliments. »*
   (`objectifs.tsx:236-242`)
5. Le lien **« ▼ Recopier depuis un plan américain — déjeuner »** (le nom long du
   repas courant, en minuscules) déplie le convertisseur (`objectifs.tsx:246-251`).
   Il porte cinq champs : **`Protéines`**, **`Glucides totaux`**, **`Lipides`**,
   **`Fibres`** (g), **`Calories du plan`** (kcal) — `objectifs.tsx:264-282`.
6. Dès que les cinq sont lisibles, l'écran interroge
   `POST /api/verification/plan-coach` et l'aperçu s'affiche :
   **« Sera enregistré : `40` P · `100` G fibres comprises · `20` L · `710` kcal »**,
   puis *« À titre indicatif, hors fibres ces glucides valent `85` g — mais ce
   n'est PAS ce qu'on enregistre : le calculateur retranchera les fibres de tes
   aliments, qui sont connues, plutôt que celles de ton plan, qui ne le sont
   pas. »* (`objectifs.tsx:292-303`).
7. Bouton **« Reporter et cocher « fibres comprises » »** (`objectifs.tsx:313-316`) :
   il reporte les **glucides TOTAUX tels quels**, coche la case, et referme le
   panneau (`objectifs.tsx:180-195`). **Il ne retranche rien** — c'est une
   décision, voir *Limites connues*.
8. Taper dans `Protéines`, `Glucides` ou `Lipides` **réécrit `Calories`**
   (`objectifs.tsx:158-165`). Taper dans `Calories` ne touche à rien d'autre
   (`:331-333`).
9. Si l'écart dépasse 15 kcal, sous les champs — **la phrase vient du serveur,
   telle quelle** (`CoherenceDesCibles.php:118-129`), l'écran ne fait que
   l'afficher (`objectifs.tsx:354-359`) :
   - convention française : **« Tes grammes représentent `740` calories, pas `710`. L'app respecte les grammes ; les calories suivent. »**
   - glucides totaux : **« Tes grammes représentent entre `540` et `740` calories selon la part de fibres, pas `500`. L'app respecte les grammes ; les calories suivent. »**
10. **Si le serveur ne répond pas**, à la place :
    **« La cohérence de tes objectifs n'a pas pu être vérifiée : le serveur n'a
    pas répondu. Tu peux enregistrer. »** (`objectifs.tsx:365-370`). Avant le
    palier B, l'écran jugeait sur place et ne pouvait pas se taire ; maintenant
    il peut, et un silence dû au réseau ressemblerait à « tes objectifs sont
    cohérents » (règle 7).
11. **« Enregistrer »** → **« Enregistrement… »** → **« Objectifs enregistrés. »**
    (`objectifs.tsx:372-380`).
12. En bas, la carte **« Mes quatre repas »** liste `Petit-déjeuner`, `Déjeuner`,
    `Collation`, `Dîner` avec **« 40 P · 60 G · 15 L »** ou **« à définir »**
    (`objectifs.tsx:387-401`).

### Les compléments

Onglet **Compte**, juste sous le bouton des objectifs (`compte.tsx:93`). Encart
**replié** intitulé **« Compléments alimentaires »**, résumé
**« 3 compléments  ·  matin, soir »** ou **« aucun pour l'instant »**
(`complements.tsx:174-177`, `:181-186`). Texte d'entrée : *« Ce qui s'avale :
créatine, magnésium, vitamine D. Ce qui se mange — une whey, un gainer — reste un
aliment du frigo, pour que le calculateur en tienne compte. »*
(`complements.tsx:187-190`).

**« + Ajouter un complément »** (`complements.tsx:225`) ouvre `Quantité` ·
`Unité` · `Complément` · la rangée **« Avec quel repas »**
(`Matin`/`Midi`/`16 h`/`Soir`). Après un ajout, **le formulaire reste ouvert** et
seuls le nom et la quantité repartent à zéro (`complements.tsx:304`).

## Critères d'acceptation

1. **Les quatre moments existent et sont indépendants.** Enregistrer une cible
   sur `Midi` ne change rien aux trois autres ; le récapitulatif du bas montre
   trois « à définir ». En base : quatre lignes au plus dans `cible`, contrainte
   d'unicité `(utilisateur_id, repas)` — `Cible.php:24`.
2. **Les calories suivent les grammes.** Taper `40` / `100` / `20` doit écrire
   **`740`** dans `Calories` (4×40 + 4×100 + 9×20). Recalculé à **chaque frappe**
   d'une macro.
3. **L'alerte d'incohérence se déclenche au-delà de 15 kcal, et pas avant.**
   Sur `40 P / 100 G / 20 L`, forcer `Calories` à `730` (écart 10) : **aucun
   message**. À `700` (écart 40) : le message apparaît, avec les deux nombres
   exacts. Le seuil se franchit strictement — 15 kcal pile ne se reproche pas
   (`CoherenceDesCibles.php:112`).
4. **La case change la nature du message, pas seulement son texte.** Cocher
   « Glucides fibres comprises » sur `{710 kcal, 40 P, 100 G, 20 L}` doit faire
   **disparaître** l'alerte : 100 g de glucides totaux couvrent l'intervalle
   `[540 ; 740]` kcal selon la part de fibres, et 710 tombe dedans
   (`CoherenceDesCibles.php:70-92`). **Compter les fibres à 4 kcal/g accuserait à
   tort dès 7,5 g** — c'est le défaut M1 du 15 septembre 2026, il ne doit pas
   revenir. C'est aussi ce que prouve l'épreuve de bout en bout « se tait en
   glucides TOTAUX » : le drapeau doit arriver **jusqu'à la règle**, et un
   câblage qui le perd rejoue M1 sans que la règle ait bougé.
5. **Le convertisseur ne retranche rien de ce qu'il enregistre.** Saisir
   `40 P / 100 G / 20 L / 15 F / 700 kcal`, puis « Reporter » : le champ
   `Glucides` doit valoir **`100`** (et non 85), la case doit être **cochée**,
   `Calories` doit valoir **`700`** — le chiffre du plan, pas un recalcul
   (`objectifs.tsx:187-192`). L'aperçu, lui, mentionne `85` « à titre indicatif ».
6. **Refus d'un plan à fibres invraisemblables.** `100 G / 2 F` doit afficher
   **« ⚠ 2 g de fibres pour 100 g de glucides : ton plan les sous-estime. Sans
   conséquence ici — c’est justement pour ça qu’on ne s’en sert pas. »**
   `100 G / 12 F` ne doit **rien** afficher (seuil : glucides/10). La phrase est
   celle du serveur **au caractère près**, apostrophes typographiques comprises
   (`PlanCoach.php:101-105`) ; seul le `⚠` est ajouté par l'écran
   (`objectifs.tsx:305-311`).
7. **Jamais de glucide négatif.** `50 G / 80 F` : la conversion retranche au plus
   les 50 g (`PlanCoach.php:54-57`), l'aperçu « hors fibres » affiche `0`, jamais
   un négatif.
8. **Refus d'une saisie illisible (règle 6 : vide ≠ zéro).** Taper `12O` (avec un
   O) ou `4,2,1` dans `Protéines` : le champ se borde de rouge
   (`objectifs.tsx:50`) et **« Enregistrer » reste éteint** (`:76`, `:372`).
   Aucun zéro n'est substitué, et **rien n'est demandé au serveur** tant que les
   quatre nombres ne sont pas lisibles (`:88`).
9. **La virgule est lue.** Taper `12,5` dans `Protéines` doit enregistrer
   **12,5** — pas 12. C'est la panne du 15 septembre 2026 : `parseFloat('12,5')`
   rendait 12, et le calculateur visait la mauvaise cible sans rien dire
   (`objectifs.tsx:47`, `:72-75`, `saisieNombre.ts:37`).
10. **Un négatif est refusé** : `valide` exige `v >= 0` (`objectifs.tsx:76`), et
    l'API refuse aussi (`Assert\PositiveOrZero`, `Cible.php:58`).
11. **Changer de repas ne traîne pas les chiffres du précédent.** Saisir le
    `Midi` sans enregistrer, passer au `Matin` : les champs affichent la cible du
    matin (ou du vide), la case reprend l'état du matin, le convertisseur est
    **vide et refermé** (`objectifs.tsx:128-140`).
12. **L'avertissement disparaît dès que la saisie n'est plus lisible.** Sur une
    cible qui avertit, effacer `Calories` : la phrase doit partir. Relevé par
    `revue-fitcarnet` au palier B, 21 septembre 2026 — le verdict vient du
    serveur avec `placeholderData: keepPreviousData`, qui conserve la réponse
    précédente **même quand la requête est coupée**, si bien que la phrase
    restait à l'écran sur une cible qui n'avait plus de calories. Avant le
    palier B le calcul était synchrone et elle disparaissait à la frappe. Le
    garde est le `valide &&` de `objectifs.tsx:354`.
13. **Ce qui décrit une saisie périmée s'estompe, et « Reporter » s'éteint**
    (palier B, 21 septembre 2026). La règle est jugée à distance : entre la
    frappe et la réponse, ce qui est affiché parle de la saisie **précédente**.
    L'avertissement d'incohérence et le bloc du convertisseur passent alors à
    **opacité 0,45** (`objectifs.tsx:293`, `:356`), et le bouton
    **« Reporter et cocher « fibres comprises » » est désactivé**
    (`:313-314`) — reporter à ce moment-là écrirait des grammes qui ne sont pas
    ceux du plan, soit un chiffre faux qui sera pesé (règle 7).
14. **Aucun `NaN` ne sort du mélange serveur + saisie vivante.** La ligne
    « Sera enregistré » mêle la réponse du serveur (`converti.prot`) à la saisie
    en cours (`chiffresPlan.gluc`) : effacer `Glucides totaux` doit **refermer le
    bloc**, jamais afficher « `26,8` P · `NaN` G fibres comprises »
    (`objectifs.tsx:292`, et le commentaire `:284-291`).
15. **Un complément en double est annoncé avant l'envoi** :
    **« « Créatine » est déjà noté pour Matin. »** et le bouton « Ajouter » est
    éteint (`complements.tsx:275`, `:307`).
16. **Une quantité nulle ou illisible est refusée** :
    **« Une quantité doit être un nombre supérieur à zéro. »**
    (`complements.tsx:280`). Côté API : `Assert\Positive`
    (`Complement.php:87`).
17. **Isolation entre comptes (règle 2).** Les cibles et compléments d'un second
    compte ne doivent **jamais** apparaître : `GET /api/cibles` et
    `/api/complements` sont filtrés par `FiltreProprietaire` via
    `ProprieteUtilisateur` (`Cible.php:38`, `Complement.php:59`) ; le
    propriétaire vient du jeton (`ProprietaireProcessor`).
18. **Jamais d'erreur en silence** (garantie I.4) : une panne d'enregistrement
    affiche le message du serveur (`objectifs.tsx:381-383`), une panne de lecture
    affiche `Erreur` avec un bouton « Réessayer » (`:143-145`), et une panne de
    **vérification** le dit au lieu de se taire (`:365-370`). Aucun `NaN` ni
    `undefined` ne doit apparaître à l'écran.

## Comment l'éprouver

**Web, par défaut.** Prépare comme le dit `epreuve-fonctionnalite` (conteneurs,
`/api/etat`, `rattraper-dev.sh`, bundle reconstruit), avec un compte
`…@test.local` créé selon `donnees-de-test`.

```bash
docker ps --format '{{.Names}}\t{{.Status}}'
curl -s http://localhost:8080/api/etat
npm --prefix "$(git rev-parse --show-toplevel)"/front run build:web
```

**Le geste, pas l'appel.** Ces critères portent sur un formulaire : ils se
prouvent au clavier. Sur React Native Web, `type()` puis un **clic** sur le
bouton — « Entrée » ne soumet rien (voir `presentation/tournage/verifier-ecrans.mjs`).

**Six cas de bout en bout couvrent déjà cet écran** — `e2e/epreuves/cibleIncoherente.spec.ts`,
posés au palier B, 21 septembre 2026 : l'avertissement apparaît, il se tait en
glucides totaux, il n'interdit pas d'enregistrer, il disparaît quand la saisie
redevient illisible, le convertisseur rend bien `61,2 g` hors fibres, et effacer
un champ du plan referme le bloc sans « NaN ». Ils montent l'application entière
dans Chromium : c'est le seul dispositif qui voie que la règle **arrive à
l'écran**, puisque `app/objectifs.tsx` n'est atteint par **aucune** suite
unitaire — le motif de `tsconfig.tests.json` ne descend que sous `src/`. Les
tests PHP (`CoherenceDesCiblesTest`, `PlanCoachTest`) prouvent, eux, que la règle
est **juste**. Les rejouer avant d'éprouver à la main évite de chercher à l'écran
un défaut qui est ailleurs :

```bash
cd e2e && npm test
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'
```

**Ce que la base doit dire**, après enregistrement :

```bash
docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -c \
  "SELECT repas, kcal, prot, gluc, lip, glucides_totaux FROM cible c
     JOIN utilisateur u ON u.id = c.utilisateur_id
    WHERE u.email = 'objectifs-verif@test.local' ORDER BY repas;"
```

Les colonnes sont en `DECIMAL(7,2)` / `DECIMAL(6,2)` : **`12.50` et non `12`**
prouve le critère 9. `glucides_totaux` est un booléen, faux par défaut
(`Cible.php:92`).

**Pièges propres à cet écran :**

- **Les deux phrases viennent du réseau** (palier B). Il existe donc une fenêtre
  entre la frappe et la réponse : **ne jamais conclure sur un message estompé**,
  il parle de ce qu'on tapait un instant plus tôt. Attendre qu'il reprenne sa
  pleine opacité avant de lire ce qu'il dit.
- **Couper le serveur ne fait pas disparaître l'alerte, il fait apparaître
  l'aveu** : « La cohérence de tes objectifs n'a pas pu être vérifiée… ». Un
  écran muet sur une cible incohérente est un **défaut**, pas un mode dégradé.
- **Le champ `Calories` est piloté.** Pour éprouver l'alerte, il faut taper les
  macros **d'abord**, puis `Calories` **en dernier** — toute frappe ultérieure
  sur une macro réécrit les calories et fait disparaître l'écart.
- **La case « fibres comprises » se recharge depuis la cible enregistrée**
  (`objectifs.tsx:137`) : après un aller-retour, vérifier qu'elle est bien dans
  l'état attendu avant de conclure.
- **Le convertisseur n'apparaît qu'une fois les cinq champs lisibles**
  (`objectifs.tsx:102`, `:292`) : un champ vide et l'aperçu ne s'affiche pas. Ce
  n'est pas un bug.
- **Le panneau du convertisseur se déplie AU-DESSUS des quatre champs de la
  cible.** Qui vise les champs par leur position — c'est ce que font les épreuves
  de bout en bout, faute de `<label for>` en React Native web — tape dans le
  mauvais champ dès que le panneau est ouvert (`cibleIncoherente.spec.ts:158-169`).
- **Ne pas confondre les deux « glucides »** : le champ `Glucides totaux` n'existe
  que **dans le convertisseur**. Le formulaire principal dit simplement
  `Glucides`, et c'est la **case** qui porte la convention.
- Les compléments sont dans l'onglet **Compte**, repliés : les déplier avant de
  chercher le formulaire.

## La capture pour la démonstration

Reprend la **bobine 2** de `presentation/demonstration.md` (« On règle ses
objectifs », ~1 min 30, `:470`), corrigée sur deux points signalés en fin de fiche.

`presentation/captures/objectifs/01-quatre-cibles.webm` — **~50 s**
: onglet Compte → « Mes objectifs par repas ». Balayer les quatre segments
`Matin` · `Midi` · `16 h` · `Soir`, s'arrêter sur `Midi`, saisir
`40` / `100` / `20` et **laisser voir `Calories` passer à `740` tout seul**.
Enregistrer, sortir, revenir : la valeur a tenu. Finir sur la carte
**« Mes quatre repas »**.
*À l'image* : le segment actif en couleur vive, le champ `Calories` qui change
sans qu'on le touche, « Objectifs enregistrés. ».

`presentation/captures/objectifs/02-fibres-et-convention.webm` — **~45 s**
: sur la cible `40 P / 100 G / 20 L`, forcer `Calories` à `640` pour faire
apparaître **« Tes grammes représentent 740 calories, pas 640. L'app respecte les
grammes ; les calories suivent. »**, puis **cocher « Glucides fibres comprises »**
et montrer que le message **disparaît** — 640 tombe dans l'intervalle
`[540 ; 740]`. Forcer alors `Calories` à `500` : le message **revient, sous forme
d'intervalle**.
*Ce qu'on dit* : « Les fibres comptent 2 kilocalories par gramme, pas 4 et pas 0.
C'est la convention européenne. Quand la cible compte les fibres dedans, les
mêmes grammes couvrent tout un intervalle — et l'application refuse de trancher
plutôt que d'inventer la part manquante. »

> **CE PLAN A ÉTÉ CORRIGÉ le 21 septembre 2026.** Il demandait de cocher la case
> sur `640` et de montrer « que le message devient un intervalle ». C'est
> impossible : `640` est dans `[540 ; 740]`, donc cocher le fait **disparaître** —
> ce que dit d'ailleurs le critère 4 deux pages plus haut. La fiche se
> contredisait elle-même. D'où la troisième étape à `500`, qui est la seule
> manière de filmer l'intervalle.

`presentation/captures/objectifs/03-plan-americain.webm` — **~45 s**
: déplier **« Recopier depuis un plan américain »**, saisir
`40` / `100` / `20` / `3` / `700`, laisser lire l'aperçu **« Sera enregistré : … »**
et l'avertissement **« ⚠ 3 g de fibres pour 100 g de glucides : ton plan les
sous-estime. »**, puis appuyer sur **« Reporter et cocher « fibres comprises » »**.
*Ce qu'on dit* : « Un plan américain compte les fibres dans les glucides. On
recopie tel quel, on coche, et c'est le calculateur qui ajoutera les fibres
réelles des aliments — pas celles que le plan déclare, qui sont presque toujours
sous-estimées. »
*À ne pas filmer* : l'instant où l'aperçu est **estompé**. Il décrit la frappe
précédente ; attendre la pleine opacité, sinon la vidéo montre un chiffre périmé.

`presentation/captures/objectifs/04-complements.webm` — **~25 s**
: onglet Compte, déplier **« Compléments alimentaires »**, ajouter
`5` `g` `Créatine` sur `Matin`, puis **retenter le même** pour montrer
**« « Créatine » est déjà noté pour Matin. »**.

Le dossier `presentation/captures/` est ignoré par git : on versionne la matière,
pas les vidéos.

## Limites connues

- **Il n'y a PAS de cible de fibres, et il n'y en aura pas.** Décision du
  **16 septembre 2026**, reportée dans `presentation/demonstration.md`
  (partie II·B). Une cible porte `kcal`, `prot`, `gluc`, `lip` et le drapeau
  `glucides_totaux` — `api/src/Entity/Cible.php:57-94` ; la table `cible` n'a
  aucune colonne de fibres. **La case « Glucides fibres comprises » suffit** :
  elle dit dans quelle convention les glucides sont écrits, et le calculateur
  ajoute les fibres **réelles** des aliments au moment de comparer
  (`front/src/solveur/solveur.ts:150-151`). Ajouter une cible de fibres
  reviendrait à demander à l'utilisateur un chiffre que les plans remplissent
  mal — celui de référence annonce 14 g par jour pour un contenu réel proche de
  48 (`objectifs.tsx:172-174`), et sur ce même plan trois repas sur quatre sont
  signalés à juste titre (`api/src/Service/PlanCoach.php:87-89`). Le
  document du propriétaire (`presentation/fonctionnalites-par-onglet.md`, ligne
  « Compte ») dit l'inverse : **c'est cette ligne-là qui est à corriger**, pas
  l'application.
- **Le convertisseur ne convertit plus rien de ce qu'il enregistre.** Un second
  chemin a existé — retrancher les fibres déclarées pour obtenir une cible
  européenne — et il a été **retiré** (`objectifs.tsx:167-179`). Le chiffre
  « hors fibres » reste affiché à titre indicatif, et c'est **le serveur** qui le
  calcule désormais (`PlanCoach::convertir`, `PlanCoach.php:47-73`). Deux chemins
  pour un même but, dont l'un dépend d'une déclaration peu fiable, c'en était un
  de trop.
- **Il reste un jumeau DÉCLARÉ de la règle de cohérence** — `SEUIL_COHERENCE`,
  `ecartDeCoherence` et `bornesDeCoherence` dans `front/src/solveur/solveur.ts`
  (`:65`, `:98-108`, `:110-113`), parce que le solveur calcule encore dans le
  navigateur. Il part au palier 3, avec le reste du solveur. Ce qui est interdit,
  c'est la copie **non déclarée** : `coherenceCibleUnique.test.ts` refuse qu'un
  écran touche ces trois symboles, et vérifie que les deux seuils disent le même
  nombre. Ne pas « factoriser » celui-ci en attendant.
- **Les kilocalories ne sont pas une contrainte indépendante** : elles découlent
  des macros. En cas de cible incohérente, l'application **respecte les grammes**
  et le dit (`presentation/features.md`, section I, « Les limites, assumées et
  écrites », `:448-451`).
- **Les micronutriments sont hors périmètre.**
- **Les compléments sont volontairement hors du solveur** : dose fixe, macros
  nulles. En faire un aliment donnerait au solveur une variable qu'il n'a pas le
  droit de bouger (`api/src/Entity/Complement.php:27`). La ligne de partage : ce
  qui **se mange** va au frigo, ce qui **s'avale** vient ici. Une whey, c'est 24 g
  de protéines : sa place est dans le frigo.
- **L'unité d'un complément est un texte libre**, donc rien ne se convertit et
  rien ne s'additionne (`Complement.php:92`). C'est assumé.
- **Rien ne vérifie qu'une cible est atteignable avec le frigo** : ça se découvre
  à l'étape « Repas » du calculateur. Voir `fonctionnalite-calculateur-repas`.
- **Le message d'incohérence de cet écran n'est pas celui du calculateur.** Le
  solveur produit le même constat sous le code `cibles_incoherentes`, mais avec
  la gravité `info` (`solveur.ts:487-488`) — et la carte d'un repas **filtre les
  diagnostics `info`** (`front/src/composants/carteRepas.tsx:516`). L'alerte de
  cohérence ne se voit donc **que sur cet écran-ci**. Ne pas promettre de la
  montrer pendant la bobine 4.
- **Zone d'ombre de `presentation/features.md` (section K)** : ce document est
  daté du 14 septembre 2026 et ses `fichier:ligne` de la section D **ne
  correspondent plus au code** (l'écran des objectifs y est cité en `:10`, `:64`,
  `:79`, `:150`, `:166`, `:269` — `presentation/features.md:184-191`). S'y fier
  pour naviguer fait perdre du temps ; les lignes de cette fiche ont été relues
  le **21 septembre 2026**, après le palier B.
