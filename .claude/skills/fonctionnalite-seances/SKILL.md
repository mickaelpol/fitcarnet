---
name: fonctionnalite-seances
description: Noter sa séance pendant qu'on la fait — liste des séances, création depuis un modèle, ajout d'exercices, trois modes de travail, saisie et cochage des séries, notes, réordonnancement, pré-remplissage par la dernière fois, sauvegarde automatique, passage en modèle et suppression. À charger avec `epreuve-fonctionnalite` pour éprouver et filmer l'onglet Séances.
---

# Noter sa séance pendant qu'on la fait

> **Toutes les lignes ci-dessous ont été vérifiées dans le code le 16 septembre
> 2026.** Les `fichier:ligne` de `presentation/features.md` (section E) sont
> **périmés** pour cet écran :
> `app/seance/[id].tsx` a été refactorisé le 15 septembre (extraction de
> `useSeanceEditable.ts` et de `calcul/blocSeance.ts`), et toutes les lignes ont
> glissé d'environ 15 à 40 rangs. Ce sont les lignes de cette fiche qui font foi.

## Le besoin

Quelqu'un qui s'entraîne trois à cinq fois par semaine veut **noter ce qu'il
fait pendant qu'il le fait** — pas le recopier le soir de mémoire. En salle, le
téléphone se tient d'une main entre deux séries, les doigts glissent, et la
séance doit survivre à un verrouillage d'écran, à un passage dans le frigo ou à
une fermeture d'application.

Le besoin premier n'est pas d'archiver : c'est de **savoir quoi mettre sur la
barre maintenant**, en voyant ce qu'on avait fait la dernière fois. Une séance
notée à moitié, ou une charge perdue parce qu'on a appuyé sur Retour, ne sert à
rien.

## Ce que l'application propose

| Ce que l'utilisateur fait | Où | `fichier:ligne` |
|---|---|---|
| Voir ses séances : type, date en français, pastille de couleur, « 4/12 séries », vert quand tout est fait | onglet **Séances** | `front/app/(onglets)/seances.tsx:50-72`, date `:13-19`, couleurs `:8-10` |
| L'avancement vient du serveur, pas d'un calcul local | — | `front/app/(onglets)/seances.tsx:51`, calculé par `api/src/Entity/Seance.php:137-159` |
| Ouvrir une séance, ou en commencer une | bouton **« + Nouvelle séance »** | `front/app/(onglets)/seances.tsx:44` → route `/seance/nouvelle` |
| Choisir le type Push / Pull / Legs | en-tête de la séance | `front/app/seance/[id].tsx:23`, `:159-173` |
| **Partir d'un modèle** — n'apparaît que sur une séance **vide** et seulement si un modèle existe | bouton **« ▶ Partir d'un modèle »** | `front/app/seance/[id].tsx:208-212`, copie `src/calcul/blocSeance.ts:109-121` |
| Le modèle impose aussi son type à la séance | — | `front/app/seance/[id].tsx:131` |
| Ajouter un exercice depuis le catalogue | bouton **« + Ajouter un exercice »** → feuille **« Ajouter un exercice »** | `front/app/seance/[id].tsx:218-220`, `:290-296` |
| **Quinze vignettes de muscles**, dont « Autre » ; un seul groupe à la fois, le même appui deux fois enlève le filtre | feuille d'ajout | `front/src/composants/choixMuscle.tsx:76-138`, 14 groupes `src/muscles/groupes.ts:36-77` + `AUTRE:78` |
| **Recherche textuelle** sans accents ni casse, qui se cumule au filtre muscle | champ **« Rechercher… »** | `front/src/composants/choixAliment.tsx:50-62`, `:97` |
| **Le type de la séance filtre le catalogue** — un exercice sans groupe reste proposé partout | feuille d'ajout | `front/app/seance/[id].tsx:62-82`, filtre `:64-65` |
| Les exercices sont nommés en français quand la traduction existe | partout | `front/app/seance/[id].tsx:73`, `front/src/composants/exerciceSeance.tsx:130` |
| Consulter la fiche de l'exercice (vidéo, muscles, matériel, exécution) | pastille **i**, libellé d'accessibilité **« Comment faire cet exercice »** | `front/src/composants/exerciceSeance.tsx:132-142` |
| **Trois modes de travail : Charge · Tenue · Chrono** — changer de mode **n'interrompt pas** une mesure en cours | rangée sous le nom de l'exercice | voir l'encadré ci-dessous |
| Saisir répétitions et charge, série par série | lignes de série | `front/src/composants/serie.tsx:47-67` |
| Mesurer une tenue (un chrono **par série**) ou un « for time » (un temps **total**) | selon le mode | `front/src/composants/serie.tsx:70-79`, total `exerciceSeance.tsx:196-205` |
| **Cocher une série remplit les champs vides avec l'objectif**, puis relance le repos | case à cocher | `front/src/composants/serie.tsx:26-35` |
| Ajouter ou supprimer une série | **« + Série »**, croix **×** | `front/src/composants/exerciceSeance.tsx:284-286`, `:300-306` |
| **Pré-remplissage par la dernière fois** : charges et répétitions réellement faites → à défaut le format prescrit → à défaut 3 séries | à l'ajout de l'exercice | `front/src/calcul/blocSeance.ts:80-100`, source `front/src/api/hooks/seances.ts:49-75` |
| Raccourci **« ↓ 12×25 · 12×27,5 »** — recharge les valeurs de la dernière séance en objectifs (4 au plus affichées) | à droite des modes | `front/src/composants/exerciceSeance.tsx:100-109`, aperçu `:112-122`, `:180-190` |
| Notes par exercice, repliables, avec aperçu **« ✎ … »** quand elles sont remplies | **« ▼ Notes »** | `front/src/composants/exerciceSeance.tsx:262-281` |
| Bilan par exercice : **RÉPÉTITIONS · KG SOULEVÉS · TEMPS** | bas de la carte | `front/src/composants/exerciceSeance.tsx:230-251` |
| Réordonner les exercices : poignée **⠿** à maintenir, **ou** flèches ▲ ▼ | sur mobile et sur le web | `front/src/composants/listeDeplacable.tsx:28-73`, jumeau web `listeDeplacable.web.tsx` |
| **Sauvegarde automatique 2,5 s** après la dernière frappe, forcée au passage en arrière-plan et à la sortie de l'écran | point coloré + libellé | `front/src/composants/sauvegardeAuto.ts:22`, `:67-88` |
| Cinq états lisibles, le **motif** de l'échec en clair, et **« Réessayer l'enregistrement »** | en-tête de la séance | `front/src/composants/sauvegardeAuto.ts:118-124`, affichage `front/app/seance/[id].tsx:176-192`, `:242-246` |
| **Transformer la séance en modèle** — ce qui a été fait devient l'objectif | **« ★ Enregistrer comme modèle »** | `front/app/seance/[id].tsx:222-231`, conversion `front/src/api/hooks/seances.ts:127-154` |
| Retirer un exercice, supprimer la séance — les deux confirmés en nommant ce qui part | **« Retirer l'exercice »**, **« Supprimer la séance »** | `front/src/composants/exerciceSeance.tsx:308-315`, `front/app/seance/[id].tsx:248-256`, `:298-308` |

> **Le sélecteur Charge / Tenue / Chrono : parler du comportement, pas du chemin.**
> Au 16 septembre 2026 il vit dans `front/src/composants/exerciceSeance.tsx:14-18`
> (les clés sont `charge`, `iso`, `chrono` ; les libellés affichés sont
> **Charge**, **Tenue**, **Chrono**) et il est rendu à `:167-191`. **Il est en
> cours d'extraction vers un composant partagé** pour servir aussi dans
> l'éditeur de modèle (décision du 16 septembre 2026, reportée dans
> `presentation/demonstration.md`, partie II·J).
> **Éprouve le comportement, jamais le fichier** : les trois libellés, la
> bascule, et le fait qu'une mesure en cours continue de tourner pendant la
> bascule (`front/src/composants/etatMesure.ts:1-17`). Revérifie le chemin avant
> de le citer dans un rapport.

## Le parcours

**Compte requis** : un compte ordinaire. **Données de départ** : `jeu-demo.sql`
chargé sur le compte jetable (voir `epreuve-fonctionnalite`), qui pose un
historique de séances — sans lui, ni le pré-remplissage ni le raccourci « ↓ »
n'ont de quoi s'afficher.

1. **Onglet Séances.** Pendant le chargement : « Chargement de tes séances… »
   (`seances.tsx:25`). Sur un compte vierge : « Aucune séance pour l'instant.
   Commences-en une. » (`:37`).
2. **« + Nouvelle séance »** (`:44`). La séance s'ouvre à la date du jour
   (`useSeanceEditable.ts:35`, `:86`), sans type, sans exercice.
3. **Choisir un type** — `PUSH`, `PULL`, `LEGS` en capitales, le choisi prend la
   couleur du type (`seance/[id].tsx:159-173`).
4. **« ▶ Partir d'un modèle »** si la séance est vide et qu'un modèle existe
   (`:208-212`). La feuille s'intitule **« Partir d'un modèle »**, chaque ligne
   porte « N exercice(s) » (`:310-320`).
5. **« + Ajouter un exercice »** (`:218-220`). La feuille **« Ajouter un
   exercice »** s'ouvre sur la **rangée de vignettes** ; le champ
   **« Rechercher… »** n'apparaît **qu'une fois un muscle choisi**
   (`choixAliment.tsx:93`). Liste vide : « Aucun exercice pour ce muscle avec ce
   mot. » ou « Aucun résultat. » (`:116-117`).
6. **L'exercice s'ajoute pré-rempli** par ce qui a été fait la dernière fois, en
   **objectifs** — ils s'affichent en filigrane dans les champs
   (`serie.tsx:57`, `:63`).
7. **Saisir.** Répétitions (entier, unité « rép ») et charge (unité « kg »).
   **Cocher** remplit les champs restés vides avec l'objectif et relance le
   repos (`serie.tsx:26-35`).
8. **En-tête** : le point de sauvegarde et son libellé — « modifications non
   enregistrées… », « enregistrement… », « enregistré » —, puis la jauge
   « N/M séries » (`seance/[id].tsx:176-206`).
9. **« ★ Enregistrer comme modèle »** → « Modèle créé. Tu le retrouves dans
   l'onglet Modèles. » (`:222-237`).
10. **« Supprimer la séance »** → « Supprimer cette séance ? » et, en message,
    le type, la date et le nombre de séries : « Push du 2026-09-16 · 12 série(s).
    Cette action est définitive. » (`:298-308`).

## Critères d'acceptation

1. **La liste dit l'avancement réel.** Une séance dont toutes les séries sont
   cochées affiche « N/N » en vert ; sinon en ambre
   (`seances.tsx:52`, `:64-67`). Le chiffre doit correspondre à
   `SELECT count(*) FROM serie …` **sauf en mode chrono**, où un exercice ne
   compte que pour **une** série (`Seance.php:146-148`,
   `blocSeance.ts:59`). Vérifier les deux cas.
2. **« Partir d'un modèle » ne s'offre pas quand il ne doit pas.** Absent si la
   séance contient déjà un exercice, absent si le compte n'a aucun modèle
   (`seance/[id].tsx:208`). Ajouter un exercice doit le faire disparaître.
3. **Le type filtre le catalogue, sans rien rendre introuvable.** Séance de type
   `Legs` : un exercice classé `Push` ne doit pas être proposé ; un exercice
   **sans groupe** doit rester proposé (`:64-65`). Le second est le critère qui
   compte — c'est lui qui évite qu'un exercice non classé devienne inatteignable.
4. **Recherche et vignettes se cumulent.** Choisir « Dos » puis taper
   « traction » réduit la liste ; **changer de vignette efface le mot cherché**
   (`choixAliment.tsx:88`) ; fermer et rouvrir la feuille remet les deux à zéro
   (`:43`). Une liste vide doit **dire pourquoi** (`:116-117`).
5. **Les trois modes changent ce qu'on saisit.** Charge → répétitions + kg ;
   Tenue → un chronomètre **par série** ; Chrono → un chronomètre **total** au-dessus
   des séries, étiqueté « Temps total de l'exercice »
   (`serie.tsx:47-79`, `exerciceSeance.tsx:196-205`).
6. **Basculer de mode n'interrompt pas une mesure en cours.** Lancer une tenue,
   passer en Charge : le bandeau du haut continue de compter
   (`etatMesure.ts:1-17`). Voir `fonctionnalite-minuteur`.
7. **REFUS — 42,5 kg reste 42,5 kg.** Taper « 4 », « 2 », « , », « 5 » dans la
   charge : le champ doit afficher « 42,5 » et la base enregistrer `42.50`.
   C'est la panne prouvée sur émulateur le 15 septembre 2026, où 425 kg
   s'enregistraient (`champNombre.tsx:9-20`, `saisieNombre.ts:4-11`).
   **À refaire frappe par frappe, jamais par un appel d'API.**
8. **REFUS — une saisie illisible n'est pas un zéro.** « 4,2,1 » ou « abc » doit
   **rester à l'écran, bordé de rouge**, et ne rien écrire (`null`), pas `0`
   (`champNombre.tsx:22-24`, `:48`, `saisieNombre.ts:30-43`). Règle 7.
9. **REFUS — vide ≠ zéro.** Un champ laissé vide reste `null` en base, jamais
   `0` (`saisieNombre.ts:32`). Règle 6.
10. **REFUS — 8,5 répétitions n'existent pas.** Le champ de répétitions est
    `entier` : un décimal est **refusé**, pas arrondi en silence
    (`saisieNombre.ts:40`, `serie.tsx:56`).
11. **REFUS côté API.** `reps` hors de 1..100 → 422 (`api/src/Entity/Serie.php:37`) ;
    `poids` négatif → 422 (`:42`) ; `type` hors Push/Pull/Legs → « Type attendu :
    Push, Pull ou Legs. » (`Seance.php:67`) ; `mode` hors charge/iso/chrono →
    « Mode attendu : charge, iso ou chrono. » (`SeanceExercice.php:42`).
12. **Cocher remplit, et seulement ce qui est vide.** Une série dont la charge est
    déjà saisie ne doit **pas** être écrasée par l'objectif (`serie.tsx:29-31`).
13. **Le raccourci « ↓ » n'apparaît que s'il a quelque chose à proposer**, et
    recharge en **objectifs**, pas en valeurs réalisées
    (`exerciceSeance.tsx:100-109`, `:180`).
14. **Réordonner marche des deux façons et sur les deux plateformes** : poignée
    ⠿ maintenue, et flèches ▲ ▼ (`listeDeplacable.tsx:39-73`). Après
    réordonnancement, `ordre` est renuméroté de 0 à n-1 (`seance/[id].tsx:151-153`).
15. **La sauvegarde automatique tient ses cinq états.** Taper → « modifications
    non enregistrées… » ; attendre 2,5 s → « enregistrement… » puis
    « enregistré » (`sauvegardeAuto.ts:118-124`). Couper le réseau → « échec de
    l'enregistrement » **et le motif en clair** (`seance/[id].tsx:188-192`), plus
    le bouton « Réessayer l'enregistrement » (`:242-246`).
16. **Rien ne se perd en quittant.** Taper une charge puis quitter l'écran
    **avant** les 2,5 s : l'envoi doit partir quand même
    (`sauvegardeAuto.ts:82-87`). Revenir : la valeur est là.
17. **Une séance vide ne crée rien.** Ouvrir `/seance/nouvelle`, choisir un type,
    ressortir sans ajouter d'exercice : **aucune ligne** ne doit apparaître dans
    `seance` (`useSeanceEditable.ts:70`).
18. **La première sauvegarde ne fait pas perdre la saisie.** Sur une séance
    neuve, taper sans interruption pendant l'enregistrement initial : l'écran ne
    doit **pas** naviguer ni se remonter, et rien de ce qui a été tapé ne doit
    disparaître (`useSeanceEditable.ts:65-68`, `blocSeance.ts:137-138`).
19. **Le passage en modèle transporte le réalisé.** « ★ Enregistrer comme
    modèle » : les répétitions et charges **faites** deviennent les cibles du
    modèle ; à défaut, les cibles d'origine (`hooks/seances.ts:143-145`).
20. **La suppression est confirmée en nommant**, et la séance supprimée ne
    revient pas par le cache (`hooks/seances.ts:163-168`) : revenir en arrière
    après suppression ne doit **pas** réafficher une séance complète et crédible.
21. **Isolation entre comptes.** Avec le jeton du compte B, `GET /api/seances/{id}`
    d'une séance du compte A doit échouer, et `GET /api/seances` ne doit jamais
    la lister (`Seance.php:35`, `:49` + `FiltreProprietaire`). Règle 2.

## Comment l'éprouver

**Plateforme par défaut : le web** ; mais les critères 7, 8 et 10 **doivent être
refaits sur Android** — la panne de 42,5 kg n'était visible que sur le vrai
clavier natif (skill `verification-android`).

```bash
# la séance telle que l'API la rend, avancement compris
curl -s -H "Authorization: Bearer $JETON" http://localhost:8080/api/seances | jq '.member[0]'

# ce qui est réellement en base, série par série
docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -c \
  "SELECT se.ordre, s.ordre, s.reps, s.poids, s.secondes, s.faite, s.reps_cible, s.poids_cible
     FROM seance s2
     JOIN seance_exercice se ON se.seance_id = s2.id
     JOIN serie s ON s.seance_exercice_id = se.id
    WHERE s2.utilisateur_id = (SELECT id FROM utilisateur WHERE email = '$COMPTE')
    ORDER BY se.ordre, s.ordre;"
```

**Les pièges propres à cet écran :**

- **Le champ de recherche ne s'affiche pas tout de suite.** Pour les exercices,
  il faut d'abord choisir une vignette (`choixAliment.tsx:93`). Un script de
  capture qui tape dans le champ sans avoir cliqué une vignette **ne trouvera
  pas le sélecteur** et échouera sans message clair.
- **Le décompte de séries n'est pas le nombre de lignes** en mode chrono
  (`Seance.php:146-148`). Comparer à `count(*)` fera croire à un défaut.
- **`poids` est un `DECIMAL` rendu en chaîne** par Doctrine
  (`Serie.php:74`) : comparer `"42.50"` et `42.5` en JavaScript donne faux.
- **Sur le web, le bundle servi doit être celui du code actuel** : suivre la
  recette de `epreuve-fonctionnalite` (§2) avant toute conclusion.
- **Les tests unitaires existent et se lancent en trois secondes** :
  `src/calcul/blocSeance.test.ts`, `src/calcul/saisieNombre.test.ts`,
  `src/composants/envoiSerialise.test.ts`. Ils ne remplacent pas l'épreuve —
  577 tests étaient au vert pendant que 42,5 kg s'enregistrait 425.

```bash
npm --prefix /home/micka/perso/fitcarnet/front test
```

## La capture pour la démonstration

Reprend la **bobine 7** de `presentation/demonstration.md` (plans 7.1, 7.2,
7.3, 7.6, 7.9, 7.10, 7.11 ; les plans 7.4, 7.5 et 7.8 appartiennent à
`fonctionnalite-progression`, le plan 7.7 à `fonctionnalite-minuteur`).

`presentation/captures/seances/` :

| Fichier | Déroulé | Durée | Ce qu'on doit voir |
|---|---|---|---|
| `01-liste.webm` | Onglet Séances, défilement lent | 20 s | Push / Pull / Legs, les dates en français, « 9/9 séries » en vert |
| `02-depuis-modele.webm` | « + Nouvelle séance » → « ▶ Partir d'un modèle » → choisir | 35 s | La séance se remplit d'un coup, exercices **et** séries cibles, le type adopté |
| `03-ajouter-exercice.webm` | « + Ajouter un exercice » → une vignette de muscle → « Rechercher… » → choisir | 40 s | La rangée de quinze vignettes, **puis** le champ qui apparaît, la liste qui se réduit |
| `04-saisir.webm` | Cocher une série, taper répétitions et charge **avec une décimale** | 40 s | « 42,5 » qui reste 42,5 ; la case qui remplit les champs vides |
| `05-trois-modes.webm` | Basculer un exercice sur Tenue, puis Chrono | 30 s | Les champs qui changent de nature ; le bandeau de mesure qui **continue** pendant la bascule |
| `06-notes-series-bilan.webm` | Écrire une note, ajouter une série, montrer le bilan | 30 s | « ✎ » en aperçu, « RÉPÉTITIONS · KG SOULEVÉS » |
| `07-vers-modele.webm` | « ★ Enregistrer comme modèle » | 20 s | « Modèle créé. Tu le retrouves dans l'onglet Modèles. » |
| `08-supprimer.webm` | « Supprimer la séance » → confirmation | 15 s | Le message qui **nomme** le type, la date et le nombre de séries |

**Un contexte Playwright par scénario**, sinon tout tombe dans une seule vidéo
(`epreuve-fonctionnalite`, §4).

## Limites connues

- **Le plan 7.4 a longtemps décrit un « bandeau ambre en haut de l'exercice »
  qui n'existe pas.** Ce qu'on voit est une **puce bordée d'ambre** portant
  « ↓ 12×25 · 12×27,5 » (`exerciceSeance.tsx:180-190`) — un bouton, pas un
  bandeau, et il **applique** les valeurs quand on le touche. **Corrigé dans
  `presentation/demonstration.md` le 17 septembre 2026** : le plan 7.4 dit
  désormais « touche la puce ambre », et porte l'encadré qui raconte l'erreur.
- **`presentation/features.md` est daté du 14 septembre** : ses `fichier:ligne`
  de la section E ne correspondent plus (voir l'encadré en tête de fiche), et il
  annonce encore « zone 70–80 % » (faux, c'est 70 à 90 %).
- **L'éditeur de modèle n'a pas encore de sélecteur de mode** : le mode y est
  hérité du mode par défaut de l'exercice (`front/app/modele/[id].tsx:86`).
  L'extraction du sélecteur est décidée mais **non terminée** au 16 septembre
  2026. Ne pas éprouver ici ce qui n'existe pas encore là-bas.
- **Non vérifié : le comportement hors ligne complet.** Le cache disque est
  annoncé (`front/app/_layout.tsx`), mais une séance saisie sans réseau puis
  reconnectée n'a pas été éprouvée de bout en bout dans cette fiche.
- **Non vérifié : la limite de 30 séances par page** (`Seance.php:44`). Un compte
  de plus de 30 séances n'a pas été monté ; le comportement de la liste au-delà
  reste à constater.
- **Non vérifié : le glisser-déposer tactile réel** sur Android
  (`listeDeplacable.tsx`, version mobile). Le web utilise un fichier jumeau
  (`listeDeplacable.web.tsx`) qui n'a **pas** été lu pour cette fiche : les
  flèches y sont supposées présentes, pas prouvées.
