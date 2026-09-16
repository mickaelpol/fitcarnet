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

## Ce que l'application propose

| Capacité | Où | `fichier:ligne` |
|---|---|---|
| **Quatre cibles, une par moment** — `Matin` / `Midi` / `16 h` / `Soir`, en segments en haut de l'écran ; les noms longs sont `Petit-déjeuner`, `Déjeuner`, `Collation`, `Dîner` | Mes objectifs | `front/app/objectifs.tsx:17`, `:163` |
| **Quatre champs** : `Protéines`, `Glucides`, `Lipides` (en `g`), `Calories` (en `kcal`) | idem | `objectifs.tsx:264` |
| **Les calories se recalculent seules** dès qu'une macro change — `4·P + 4·G + 9·L`, coefficients pris dans `nutrition.ts`, jamais recopiés | idem | `objectifs.tsx:83`, `front/src/solveur/solveur.ts:31`, `front/src/calcul/nutrition.ts:10` |
| **Alerte d'incohérence au-delà de 15 kcal**, avec deux formulations selon la convention | idem | `objectifs.tsx:109`, `:278`, `solveur.ts:16` |
| **Case « Glucides fibres comprises »**, dont le texte d'aide change avec l'état | idem | `objectifs.tsx:181` |
| **Convertisseur de plan américain**, repliable, avec aperçu « Sera enregistré : … » | idem | `objectifs.tsx:197`, `:204` |
| **Avertissement « ton plan les sous-estime »** sur des fibres invraisemblables | idem | `objectifs.tsx:248`, `front/src/calcul/planCoach.ts:80` |
| **Jamais de glucide négatif** à la conversion | — | `planCoach.ts:88` |
| **Récapitulatif des quatre repas** — « 40 P · 60 G · 15 L » ou « à définir » | bas de l'écran | `objectifs.tsx:304` |
| **Refus d'une saisie illisible** : champ bordé de rouge, bouton éteint | idem | `objectifs.tsx:36`, `:102`, `front/src/calcul/saisieNombre.ts:30` |
| **Compléments alimentaires par moment de repas** — consigne, pas journal de prises | onglet Compte, encart repliable | `front/src/composants/complements.tsx:143`, `api/src/Entity/Complement.php:19` |
| **Doublon et quantité invalide annoncés avant l'envoi** | idem | `complements.tsx:281`, `:286` |
| **Isolation par compte** — `Cible` et `Complement` implémentent `ProprieteUtilisateur` | API | `api/src/Entity/Cible.php:36`, `Complement.php:59` |

### Les chiffres qui font foi

- `KCAL_PROTEINES = 4`, `KCAL_GLUCIDES = 4`, **`KCAL_FIBRES = 2`**, `KCAL_LIPIDES = 9`
  — `front/src/calcul/nutrition.ts:10-13`. **Convention européenne** : les fibres
  sont comptées **à part** et valent **2 kcal/g**, jamais 4 ni 0.
- `SEUIL_COHERENCE = 15` kcal — `solveur.ts:16`. En deçà, c'est de l'arrondi.
- Fibres douteuses : **glucides ≥ 20 g ET fibres < glucides / 10** —
  `planCoach.ts:81`. C'est un ordre de grandeur, pas une loi.
- Affichage des nombres : arrondi à l'entier si l'écart est < 0,05, sinon une
  décimale — `nb()`, `front/src/theme/index.ts`.

## Le parcours

**Compte requis** : ordinaire. **Données de départ** : aucune — l'écran sait dire
« aucun objectif enregistré ».

1. Onglet **Compte** → bouton **« Mes objectifs par repas »**
   (`front/app/(onglets)/compte.tsx:56`). L'en-tête de la page est
   **« Mes objectifs »** (`front/app/_layout.tsx:209`).
2. Le segment du haut porte **`Matin` · `Midi` · `16 h` · `Soir`**. `Midi` est
   sélectionné au départ (`objectifs.tsx:42`). Sous la carte :
   **« Déjeuner »**, suivi de **« · aucun objectif enregistré »** tant qu'il
   n'y en a pas (`objectifs.tsx:176`).
3. **Changer de repas recharge tout** — les champs, la case, et le panneau de
   recopie, qui se **vide et se referme** (`objectifs.tsx:55`).
4. La case **« Glucides fibres comprises »**, décochée par défaut, affiche :
   - décochée : *« Convention française : les fibres sont comptées à part, comme sur tes étiquettes. »*
   - cochée : *« Chiffre d'un plan nord-américain, recopié tel quel. Le calculateur y ajoutera les fibres réelles de tes aliments. »*
   (`objectifs.tsx:186-193`)
5. Le lien **« ▼ Recopier depuis un plan américain — déjeuner »** (le nom long du
   repas courant, en minuscules) déplie le convertisseur (`objectifs.tsx:197`).
   Il porte cinq champs : **`Protéines`**, **`Glucides totaux`**, **`Lipides`**,
   **`Fibres`** (g), **`Calories du plan`** (kcal) — `objectifs.tsx:216-233`.
6. Dès que les cinq sont lisibles, l'aperçu s'affiche :
   **« Sera enregistré : `40` P · `100` G fibres comprises · `20` L · `710` kcal »**,
   puis *« À titre indicatif, hors fibres ces glucides valent `85` g — mais ce
   n'est PAS ce qu'on enregistre : le calculateur retranchera les fibres de tes
   aliments, qui sont connues, plutôt que celles de ton plan, qui ne le sont
   pas. »* (`objectifs.tsx:237-246`).
7. Bouton **« Reporter et cocher « fibres comprises » »** (`objectifs.tsx:256`) :
   il reporte les **glucides TOTAUX tels quels**, coche la case, et referme le
   panneau (`objectifs.tsx:136-146`). **Il ne retranche rien** — c'est une
   décision, voir *Limites connues*.
8. Taper dans `Protéines`, `Glucides` ou `Lipides` **réécrit `Calories`**
   (`objectifs.tsx:83`). Taper dans `Calories` ne touche à rien d'autre
   (`:273`).
9. Si l'écart dépasse 15 kcal, sous les champs :
   - convention française : **« Tes grammes représentent `612` calories, pas `580`. L'app respecte les grammes ; les calories suivent. »**
   - glucides totaux : **« Tes grammes représentent entre `570` et `640` calories selon la part de fibres, pas `500`. L'app respecte les grammes ; les calories suivent. »**
   (`objectifs.tsx:278-287`)
10. **« Enregistrer »** → **« Enregistrement… »** → **« Objectifs enregistrés. »**
    (`objectifs.tsx:289-297`).
11. En bas, la carte **« Mes quatre repas »** liste `Petit-déjeuner`, `Déjeuner`,
    `Collation`, `Dîner` avec **« 40 P · 60 G · 15 L »** ou **« à définir »**
    (`objectifs.tsx:304-318`).

### Les compléments

Onglet **Compte**, juste sous le bouton des objectifs (`compte.tsx:64`). Encart
**replié** intitulé **« Compléments alimentaires »**, résumé
**« 3 compléments  ·  matin, soir »** ou **« aucun pour l'instant »**
(`complements.tsx:182-193`). Texte d'entrée : *« Ce qui s'avale : créatine,
magnésium, vitamine D. Ce qui se mange — une whey, un gainer — reste un aliment
du frigo, pour que le calculateur en tienne compte. »* (`complements.tsx:195`).

**« + Ajouter un complément »** ouvre `Quantité` · `Unité` · `Complément` · la
rangée **« Avec quel repas »** (`Matin`/`Midi`/`16 h`/`Soir`). Après un ajout,
**le formulaire reste ouvert** et seuls le nom et la quantité repartent à zéro
(`complements.tsx:312`).

## Critères d'acceptation

1. **Les quatre moments existent et sont indépendants.** Enregistrer une cible
   sur `Midi` ne change rien aux trois autres ; le récapitulatif du bas montre
   trois « à définir ». En base : quatre lignes au plus dans `cible`, contrainte
   d'unicité `(utilisateur_id, repas)` — `Cible.php:22`.
2. **Les calories suivent les grammes.** Taper `40` / `100` / `20` doit écrire
   **`740`** dans `Calories` (4×40 + 4×100 + 9×20). Recalculé à **chaque frappe**
   d'une macro.
3. **L'alerte d'incohérence se déclenche au-delà de 15 kcal, et pas avant.**
   Sur `40 P / 100 G / 20 L`, forcer `Calories` à `730` (écart 10) : **aucun
   message**. À `700` (écart 40) : le message apparaît, avec les deux nombres
   exacts.
4. **La case change la nature du message, pas seulement son texte.** Cocher
   « Glucides fibres comprises » sur `{710 kcal, 40 P, 100 G, 20 L}` doit faire
   **disparaître** l'alerte : 100 g de glucides totaux couvrent l'intervalle
   `[600 ; 740]` kcal selon la part de fibres, et 710 tombe dedans
   (`solveur.ts:53-68`). **Compter les fibres à 4 kcal/g accuserait à tort dès
   7,5 g** — c'est le défaut M1 du 15 septembre 2026, il ne doit pas revenir.
5. **Le convertisseur ne retranche rien de ce qu'il enregistre.** Saisir
   `40 P / 100 G / 20 L / 15 F / 700 kcal`, puis « Reporter » : le champ
   `Glucides` doit valoir **`100`** (et non 85), la case doit être **cochée**,
   `Calories` doit valoir **`700`** — le chiffre du plan, pas un recalcul
   (`objectifs.tsx:138-143`). L'aperçu, lui, mentionne `85` « à titre indicatif ».
6. **Refus d'un plan à fibres invraisemblables.** `100 G / 2 F` doit afficher
   **« ⚠ 2 g de fibres pour 100 g de glucides : ton plan les sous-estime. Sans
   conséquence ici — c'est justement pour ça qu'on ne s'en sert pas. »**
   `100 G / 12 F` ne doit **rien** afficher (seuil : glucides/10).
7. **Jamais de glucide négatif.** `50 G / 80 F` : la conversion retranche au plus
   les 50 g (`planCoach.ts:88`), l'aperçu « hors fibres » affiche `0`, jamais un
   négatif.
8. **Refus d'une saisie illisible (règle 6 : vide ≠ zéro).** Taper `12O` (avec un
   O) ou `4,2,1` dans `Protéines` : le champ se borde de rouge
   (`objectifs.tsx:36`) et **« Enregistrer » reste éteint** (`:102`, `:289`).
   Aucun zéro n'est substitué.
9. **La virgule est lue.** Taper `12,5` dans `Protéines` doit enregistrer
   **12,5** — pas 12. C'est la panne du 15 septembre 2026 : `parseFloat('12,5')`
   rendait 12, et le calculateur visait la mauvaise cible sans rien dire
   (`objectifs.tsx:92`, `saisieNombre.ts:37`).
10. **Un négatif est refusé** : `valide` exige `v >= 0` (`objectifs.tsx:102`), et
    l'API refuse aussi (`Assert\PositiveOrZero`, `Cible.php:56`).
11. **Changer de repas ne traîne pas les chiffres du précédent.** Saisir le
    `Midi` sans enregistrer, passer au `Matin` : les champs affichent la cible du
    matin (ou du vide), la case reprend l'état du matin, le convertisseur est
    **vide et refermé** (`objectifs.tsx:55-65`).
12. **Un complément en double est annoncé avant l'envoi** :
    **« « Créatine » est déjà noté pour Matin. »** et le bouton « Ajouter » est
    éteint (`complements.tsx:281`, `:315`).
13. **Une quantité nulle ou illisible est refusée** :
    **« Une quantité doit être un nombre supérieur à zéro. »**
    (`complements.tsx:286`). Côté API : `Assert\Positive`
    (`Complement.php:87`).
14. **Isolation entre comptes (règle 2).** Les cibles et compléments d'un second
    compte ne doivent **jamais** apparaître : `GET /api/cibles` et
    `/api/complements` sont filtrés par `FiltreProprietaire` via
    `ProprieteUtilisateur` (`Cible.php:36`, `Complement.php:59`) ; le
    propriétaire vient du jeton (`ProprietaireProcessor`).
15. **Jamais d'erreur en silence** (garantie I.4) : une panne d'enregistrement
    affiche le message du serveur (`objectifs.tsx:298`), une panne de lecture
    affiche `Erreur` avec un bouton « Réessayer » (`:68`). Aucun `NaN` ni
    `undefined` ne doit apparaître à l'écran.

## Comment l'éprouver

**Web, par défaut.** Prépare comme le dit `epreuve-fonctionnalite` (conteneurs,
`/api/etat`, `rattraper-dev.sh`, bundle reconstruit), avec un compte
`…@test.local` créé selon `donnees-de-test`.

```bash
docker ps --format '{{.Names}}\t{{.Status}}'
curl -s http://localhost:8080/api/etat
npm --prefix /home/micka/perso/fitcarnet/front run build:web
```

**Le geste, pas l'appel.** Ces critères portent sur un formulaire : ils se
prouvent au clavier. Sur React Native Web, `type()` puis un **clic** sur le
bouton — « Entrée » ne soumet rien (voir `presentation/tournage/verifier-ecrans.mjs`).

**Ce que la base doit dire**, après enregistrement :

```bash
docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -c \
  "SELECT repas, kcal, prot, gluc, lip, glucides_totaux FROM cible c
     JOIN utilisateur u ON u.id = c.utilisateur_id
    WHERE u.email = 'objectifs-verif@test.local' ORDER BY repas;"
```

Les colonnes sont en `DECIMAL(7,2)` / `DECIMAL(6,2)` : **`12.50` et non `12`**
prouve le critère 9. `glucides_totaux` est un booléen, faux par défaut
(`Cible.php:90`).

**Pièges propres à cet écran :**

- **Le champ `Calories` est piloté.** Pour éprouver l'alerte, il faut taper les
  macros **d'abord**, puis `Calories` **en dernier** — toute frappe ultérieure
  sur une macro réécrit les calories et fait disparaître l'écart.
- **La case « fibres comprises » se recharge depuis la cible enregistrée**
  (`objectifs.tsx:62`) : après un aller-retour, vérifier qu'elle est bien dans
  l'état attendu avant de conclure.
- **Le convertisseur n'apparaît qu'une fois les cinq champs lisibles**
  (`objectifs.tsx:119-120`) : un champ vide et l'aperçu ne s'affiche pas. Ce
  n'est pas un bug.
- **Ne pas confondre les deux « glucides »** : le champ `Glucides totaux` n'existe
  que **dans le convertisseur**. Le formulaire principal dit simplement
  `Glucides`, et c'est la **case** qui porte la convention.
- Les compléments sont dans l'onglet **Compte**, repliés : les déplier avant de
  chercher le formulaire.

## La capture pour la démonstration

Reprend la **bobine 2** de `presentation/plan-de-tournage.md` (« On règle ses
objectifs », ~1 min 30), corrigée sur deux points signalés en fin de fiche.

`presentation/captures/objectifs/01-quatre-cibles.webm` — **~50 s**
: onglet Compte → « Mes objectifs par repas ». Balayer les quatre segments
`Matin` · `Midi` · `16 h` · `Soir`, s'arrêter sur `Midi`, saisir
`40` / `100` / `20` et **laisser voir `Calories` passer à `740` tout seul**.
Enregistrer, sortir, revenir : la valeur a tenu. Finir sur la carte
**« Mes quatre repas »**.
*À l'image* : le segment actif en couleur vive, le champ `Calories` qui change
sans qu'on le touche, « Objectifs enregistrés. ».

`presentation/captures/objectifs/02-fibres-et-convention.webm` — **~45 s**
: sur une cible enregistrée, forcer `Calories` à `640` pour faire apparaître
**« Tes grammes représentent 740 calories, pas 640. L'app respecte les grammes ;
les calories suivent. »**, puis **cocher « Glucides fibres comprises »** et
montrer que le message devient un **intervalle**.
*Ce qu'on dit* : « Les fibres comptent 2 kilocalories par gramme, pas 4 et pas 0.
C'est la convention européenne. Quand la cible compte les fibres dedans, les
mêmes grammes couvrent tout un intervalle — et l'application refuse de trancher
plutôt que d'inventer la part manquante. »

`presentation/captures/objectifs/03-plan-americain.webm` — **~45 s**
: déplier **« Recopier depuis un plan américain »**, saisir
`40` / `100` / `20` / `3` / `700`, laisser lire l'aperçu **« Sera enregistré : … »**
et l'avertissement **« ⚠ 3 g de fibres pour 100 g de glucides : ton plan les
sous-estime. »**, puis appuyer sur **« Reporter et cocher « fibres comprises » »**.
*Ce qu'on dit* : « Un plan américain compte les fibres dans les glucides. On
recopie tel quel, on coche, et c'est le calculateur qui ajoutera les fibres
réelles des aliments — pas celles que le plan déclare, qui sont presque toujours
sous-estimées. »

`presentation/captures/objectifs/04-complements.webm` — **~25 s**
: onglet Compte, déplier **« Compléments alimentaires »**, ajouter
`5` `g` `Créatine` sur `Matin`, puis **retenter le même** pour montrer
**« « Créatine » est déjà noté pour Matin. »**.

Le dossier `presentation/captures/` est ignoré par git : on versionne la matière,
pas les vidéos.

## Limites connues

- **Il n'y a PAS de cible de fibres, et il n'y en aura pas.** Décision du
  **16 septembre 2026** (`presentation/fonctionnalites-revue.md`, « Décisions
  prises »). Une cible porte `kcal`, `prot`, `gluc`, `lip` et le drapeau
  `glucides_totaux` — `api/src/Entity/Cible.php:55-92` ; la table `cible` n'a
  aucune colonne de fibres. **La case « Glucides fibres comprises » suffit** :
  elle dit dans quelle convention les glucides sont écrits, et le calculateur
  ajoute les fibres **réelles** des aliments au moment de comparer
  (`front/src/solveur/solveur.ts:105`). Ajouter une cible de fibres reviendrait à
  demander à l'utilisateur un chiffre que les plans remplissent mal — celui de
  référence annonce 14 g par jour pour un contenu réel proche de 48
  (`objectifs.tsx:123-135`). Le document du propriétaire
  (`presentation/fonctionnalites-par-onglet.md`, ligne « Compte ») dit l'inverse :
  **c'est cette ligne-là qui est à corriger**, pas l'application.
- **Le convertisseur ne convertit plus rien de ce qu'il enregistre.** Un second
  chemin a existé — retrancher les fibres déclarées pour obtenir une cible
  européenne — et il a été **retiré** (`objectifs.tsx:123-135`). Le chiffre
  « hors fibres » reste affiché à titre indicatif. Deux chemins pour un même but,
  dont l'un dépend d'une déclaration peu fiable, c'en était un de trop.
- **Les kilocalories ne sont pas une contrainte indépendante** : elles découlent
  des macros. En cas de cible incohérente, l'application **respecte les grammes**
  et le dit (`features.md`, section I, « Les limites, assumées et écrites »).
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
  la gravité `info` (`solveur.ts:437`) — et la carte d'un repas **filtre les
  diagnostics `info`** (`front/src/composants/carteRepas.tsx:513`). L'alerte de
  cohérence ne se voit donc **que sur cet écran-ci**. Ne pas promettre de la
  montrer pendant la bobine 4.
- **Zone d'ombre de `features.md` (section K)** : ce document est daté du
  14 septembre 2026 et ses `fichier:ligne` de la section D **ne correspondent
  plus au code** (l'écran des objectifs y est cité en `:10`, `:64`, `:79`,
  `:150`, `:166`, `:269`). S'y fier pour naviguer fait perdre du temps ; les
  lignes de cette fiche ont été relues le 16 septembre 2026.
