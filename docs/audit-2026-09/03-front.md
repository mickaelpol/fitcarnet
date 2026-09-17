# Audit front-end fitcarnet — architecture & sécurité côté client

> ⚠️ **CE RAPPORT DÉCRIT L'ARBORESCENCE D'AVANT LE LOT 6, ET N'A PAS ÉTÉ RÉÉCRIT.**
>
> Relevé le 15 septembre 2026. `src/api/hooks.ts` **n'existe plus** — il a été
> éclaté en dix modules sous `src/api/hooks/` — donc la section 2 entière et la
> trentaine de renvois `hooks.ts:826`, `:906`, `:158-163` pointent dans le vide.
> Les tailles annoncées non plus ne valent plus (mesurées au `wc -l` le
> 17 septembre 2026) : `composer.ts` 780 → **135** (780 est le compte de ce
> rapport ; git en donne 817 au commit de l'audit, 830 le même soir après le
> correctif É12, 827 au premier rang du lot 6), `cuisson.ts` 611 → **22**,
> `repas.tsx` 2 316 → **655**, `frigo.tsx` 827 → **392**, `admin-exercices.tsx`
> 711 → **195**, `seance/[id].tsx` 430 → **340**.
>
> **État des constats, vérifié le 17 septembre 2026 : 25 clos, 8 ouverts.**
> Clos : É1 à É5, M1 à M4, M7, M14, et les quatorze faibles — F8 refusé avec
> argument, F12 pour l'essentiel (`pourObtenirCuit` gardé, il a ses tests).
> **Ouverts** : M5 (jetons en clair dans `localStorage` sur le web), M6
> (partiel : `seance/[id].tsx` garde son erreur, `modele/[id].tsx`,
> `admin-utilisateurs.tsx` et les cibles de `repas.tsx` non), M8
> (`RECORD_AUDIO` toujours déclaré deux fois dans `app.json`), M9, M10, M11
> (le `retry: false` de `useMoi` ne distingue toujours pas une panne réseau),
> M12 et M13 (`noUncheckedIndexedAccess` toujours à `false`). Le détail est
> dans [README.md](README.md), « Ce qui reste ouvert ».
>
> Ce document garde toute sa valeur pour **le raisonnement** de chaque constat —
> pourquoi c'est un défaut, ce qu'il coûte. Il n'en a plus aucune pour
> **localiser** du code. Le tableau d'avancement de [README.md](README.md) fait foi.


Périmètre : `front/app/`, `front/src/`, `front/package.json`, `front/app.json`, `front/tsconfig.json`.
`front/dist/` et `front/node_modules/` exclus (deux lectures ponctuelles de `node_modules` pour vérifier le comportement d'une bibliothèque, signalées là où elles interviennent).
**Audit en lecture seule : aucun fichier du projet n'a été modifié.**

Contexte de calibrage : application personnelle, quelques comptes, back-end Symfony sur la même origine en HTTPS.
Chaque constat a été vérifié en lisant le code ; ceux marqués « reproduit » ont en plus été exécutés sur un scénario chiffré.

## Compte par gravité

| Gravité | Nombre |
|---|---|
| CRITIQUE | 0 |
| ÉLEVÉE | 5 |
| MOYENNE | 14 |
| FAIBLE | 14 |

La section « Découpage proposé des gros fichiers » est à part : ce sont des travaux, pas des défauts.

---

# ÉLEVÉE

## É1. Deux 1RM différents pour la même question, sur le même écran
**ÉLEVÉE · CONFIRMÉ**
`front/src/api/hooks.ts:825-826` · `front/src/api/hooks.ts:905-908` · `front/src/calcul/performance.ts:26-38`

La formule d'Epley est écrite **trois fois**, et les trois copies n'appliquent pas la même règle de validité.

```ts
// performance.ts:31 — la référence, avec son plafond
if (s.reps < 1 || s.reps > REPS_MAX_POUR_1RM || s.poids <= 0) continue;   // REPS_MAX_POUR_1RM = 15

// hooks.ts:905-907 — useHistorique : le plafond est recopié en dur
if (serie.reps <= 15) { const e = serie.poids * (1 + 0.0333 * serie.reps); ... }

// hooks.ts:825-826 — useRecordsAnterieurs : AUCUN plafond
if (serie.reps === null || serie.poids === null || serie.reps < 1 || serie.poids <= 0) continue;
const rm = serie.poids * (1 + 0.0333 * serie.reps);
```

`performance.ts:11-18` documente pourtant pourquoi le plafond existe : « une série de 93 répétitions à 32 kg donnerait, selon la formule, entre 50 et 131 kg — c'est-à-dire davantage qu'une série de 7 à 35 kg, ce qui est absurde ».

**Ce qui se passe.** L'écran `front/app/seance/[id].tsx` consomme les deux : ligne 65 `useRecordsAnterieurs(seance?.date)` pour le record de référence (**sans plafond**), et via `src/composants/exerciceSeance.tsx:63` → `performanceDe` → `rmDesSeries` pour la séance en cours (**avec plafond**). Le disque RM compare donc deux nombres calculés selon deux règles différentes.

Scénario chiffré : une séance d'endurance contient 30 répétitions à 40 kg. `useRecordsAnterieurs` en tire un « record » de 40 × (1 + 0,0333 × 30) = **79,96 kg**. Le vrai 1RM est, disons, 60 kg. À partir de ce jour, chaque séance de développé s'affiche en **recul** face à un record fantôme que la formule elle-même déclare invalide — et la courbe de progression (`useHistorique`, qui plafonne) raconte l'inverse.

**Correction (petit, ~1 h).** Extraire les trois hooks dans `src/calcul/historiqueSeances.ts` (voir le découpage) et les faire appeler `epley` / `rmDesSeries` de `performance.ts`. Supprimer les deux copies. Ajouter un test : une série de 30 répétitions ne produit aucun record.

## É2. Un « reste » déclaré rétrécit la liste de courses
**ÉLEVÉE · CONFIRMÉ (reproduit)**
`front/src/solveur/composer.ts:713-718` et `:754-760`

```ts
// resoudreLaPeriode, l. 713-718
const dispo = d.plafonds === undefined ? restant
  : (a) => Math.min(restant(a), d.plafonds![String(a.id)] ?? Number.POSITIVE_INFINITY);

// listeDeCourses, l. 754-757 — la passe « frigo plein »
const ALaCarte = (): number => Number.POSITIVE_INFINITY;
for (const sortie of resoudreLaPeriode(demandes, ALaCarte, candidats).values()) {
```

`listeDeCourses` fait délibérément une seconde passe frigo plein, et la doc des lignes 736-751 en explique la raison : « de quoi ai-je besoin pour manger ce que je voulais manger, et non ce que mon frigo m'impose ». Mais `plafonds` est porté par la `DemandeDatee`, pas par `stockDe` : il survit à `ALaCarte` et redevient **le seul plafond de la passe censée n'en avoir aucun**. `app/(onglets)/repas.tsx:471` et `:479` passent bien le même tableau `demandes` aux deux appels.

Le code contredit son propre commentaire quatre lignes plus haut (l. 708-712) : « LE PLAFOND DÉCLARÉ SE COMPORTE COMME UN FRIGO PLUS PETIT, et rien de plus » — précisément ce que la seconde passe doit lever.

Scénario exécuté (poulet / riz / amandes, cibles 45 P / 80 G / 20 L, 80 g de riz en stock) :
- sans reste déclaré → liste de courses = **`[Riz, 20 g]`** ;
- en déclarant « il me reste 80 g de riz » (`plafonds: { r: 80 }`) → liste de courses = **`[]`**.

Les deux plans cuisinés sont pourtant **identiques** (riz 80 g, poulet 141 g, amandes 33 g). Décrire la même réalité de deux façons donne deux listes de courses différentes, et la seconde fait **sous-acheter**. Sur une période de 7 jours, l'écart se multiplie par le nombre de repas concernés — et il ne se voit qu'au supermarché.

**Correction (~15 min + 1 test).** Un 4ᵉ paramètre `ignorerPlafonds = false` sur `resoudreLaPeriode`, passé à `true` depuis `listeDeCourses`.

À noter : `plafonds` fait partie du travail **non encore committé** de l'arbre de travail (`front/src/solveur/composer.ts` et `front/src/solveur/solveur.ts` sont modifiés mais non validés, tout comme `front/app/(onglets)/repas.tsx`). C'est donc le meilleur moment pour corriger : le défaut n'a jamais atteint l'historique.

## É3. `kcalAtwater` ignore les fibres et accuse une donnée juste
**ÉLEVÉE · CONFIRMÉ (reproduit)**
`front/src/calcul/plausibilite.ts:49-50`, utilisé en `:155-163`

```ts
export const kcalAtwater = (a: Aliment): number =>
  4 * a.prot100 + 4 * a.gluc100 + 9 * a.lip100;
```

C'est la formule **américaine**, celle que l'en-tête de `front/src/calcul/nutrition.ts:4-7` interdit explicitement (« Mélanger les deux fausse tout ») et que `nutrition.ts:45-53` applique correctement avec `KCAL_FIBRES = 2`. Les deux fichiers sont côte à côte dans `src/calcul/`. Ici, les fibres — comptées à part dans `Aliment.fibres100` — valent implicitement 0 kcal/g.

Le contrôle se déclenche dès que `2 × fibres100 > max(25 ; 0,2 × kcal100)`.

Scénario exécuté sur des graines de chia (`ole`, 486 kcal, 17 P, 7,7 G, 31 L, **34 g de fibres**) :

```
avertissement / calories_incoherentes :
« Graines de chia : 486 kcal déclarées pour 100 g, mais ses macros en font 378.
  Une des deux valeurs est fausse. »
```

Dans la convention de l'application, 4×17 + 4×7,7 + **2×34** + 9×31 = **445,8** — les valeurs saisies sont cohérentes. Le 378 affiché est faux, et **aucune des deux valeurs n'est fausse**. Le module dont la raison d'être est « les données ne peuvent pas mentir sans qu'on le voie » accuse une donnée juste, sur les oléagineux et les aliments riches en fibres : exactement la famille que `nutrition.ts` cite en exemple.

**Correction (~10 min).** Ajouter `+ 2 * (a.fibres100 ?? 0)`. Attention : `plausibilite.test.ts:165` fige la valeur actuelle (`kcalAtwater(base()) === 379` pour 2,1 g de fibres) — le test doit passer à 383.

## É4. Session morte sans porte de sortie
**ÉLEVÉE · CONFIRMÉ**
`front/src/api/client.ts:144-146` + `front/app/(onglets)/compte.tsx:24-26` + `front/app/_layout.tsx:68-71`

Trois décisions correctes séparément, qui s'enferment mutuellement :

1. `client.ts:145-146` — `renouveler()` : `const cle = await lireRafraichissement(); if (cle === null) return false;` — **sans appeler `terminerSession()`**. Le JWT mort reste dans le coffre.
2. `_layout.tsx:70` — le portier ne redirige que si `!connecte`, et `useConnecte` (via `client.ts:98`) ne teste que la **présence** d'une chaîne dans `fitcarnet.jeton`. Un JWT expiré compte comme « connecté ».
3. `compte.tsx:24-26` — `if (isError) return <Erreur .../>` : la sortie anticipée est **avant** le bouton « Se déconnecter » de la ligne 90. Et c'est le seul bouton de déconnexion de toute l'application (`reglages.tsx` n'en a pas ; aucune autre occurrence dans `app/` ni `src/`).

**Ce qui se passe.** Le jeton de rafraîchissement disparaît — SecureStore réinitialisé, données de site effacées dans le navigateur, ou APK installé avant que la fonction n'existe. Le JWT, lui, survit et expire une heure plus tard. Dès lors : tous les onglets affichent « Identifiants incorrects. » en rouge avec un bouton « Réessayer » qui ne réussira jamais ; l'onglet Compte affiche la même chose ; le portier refuse d'aller vers `/connexion` puisqu'il croit la session vivante. Seule issue : effacer les données de l'application.

**Correction (petit, ~30 min).**
- `client.ts:146` → `if (cle === null) { await terminerSession(); return false; }`
- `compte.tsx` : rendre le bouton « Se déconnecter » **avant** le `if (isError)`, ou remplacer la sortie anticipée par un encart d'erreur en tête de page.
- En complément : dans `api()` (`client.ts:214-218`), si le rejeu après renouvellement rend encore 401, appeler `terminerSession()`.

## É5. `useSauvegardeAuto` perd la dernière saisie si un envoi est déjà en vol
**ÉLEVÉE · CONFIRMÉ**
`front/src/composants/sauvegardeAuto.ts:33-53` et `:70-91`

```ts
const envoyer = async () => {
  const v = valeurCourante.current;
  if (v === null || enCours.current) return;   // ligne 35 : abandon, sans réessai programmé
```

Aucun réessai n'est reprogrammé quand `enCours` est vrai. Deux conséquences :

1. **Perte à la sortie d'écran** — exactement le cas que le commentaire des lignes 55-58 dit vouloir couvrir (« 2,5 secondes suffisent à perdre une saisie »). En salle : on coche une série, l'envoi part (2 s de réseau) ; on tape la charge de la suivante ; on appuie sur Retour dans la seconde. Le démontage appelle `vider()` (l. 71) → `envoyer()` → `enCours === true` → **retour immédiat, la charge n'est jamais envoyée**. L'écran a disparu, rien ne le signale.
2. **Blocage en régime normal** — si le minuteur de 2,5 s (l. 107) tombe pendant un envoi, la modification reste à l'état `'attente'` (« modifications non enregistrées… ») jusqu'à la frappe suivante. Le libellé ne ment pas, mais rien ne repart tout seul.

**Correction (petit, ~1 h).** Poser un drapeau `enAttente` quand `envoyer` sort sur `enCours`, et relancer dans le `finally` (l. 50-52) tant que la signature courante diffère de `derniereEnvoyee`. Traiter aussi l'état `'erreur'` par un réessai borné.

Note liée : le commentaire de `forcer` (l. 112) annonce « Marque la valeur courante comme déjà enregistrée » alors que le corps **envoie**.

---

# MOYENNE

## M1. `cibles_incoherentes` compte les fibres à 4 kcal/g en mode glucides totaux
**MOYENNE · CONFIRMÉ (reproduit) · `front/src/solveur/solveur.ts:340`**

```ts
const kcalDesMacros = 4 * cibles.prot + 4 * cibles.gluc + 9 * cibles.lip;
```
Tout le reste de `calculer` gère `glucidesTotaux` (l. 44-45, 110, 135, 194, 205, 235) ; pas cette ligne. Exécuté avec `glucidesTotaux: true` et la cible `{kcal: 710, prot: 40, gluc: 100, lip: 20}` (100 g de glucides totaux dont ~15 g de fibres → 710 est juste) :
« … 40 g de protéines, 100 g de glucides et 20 g de lipides font forcément **740** calories, pas 710. » Faux de 30 kcal, et le repas composé rend 726,9 kcal. Le seuil de déclenchement étant de 15 kcal, l'erreur suffit à faire apparaître ou disparaître le diagnostic à tort.
**Correction (~20 min)** : ne pas émettre ce diagnostic quand `glucidesTotaux` est actif (la cible ne dit pas sa part de fibres), ou porter le seuil à `15 + 2 × fibresEstimees`.

## M2. Une série d'UNE répétition donne deux 1RM différents
**MOYENNE · CONFIRMÉ · `front/src/calcul/performance.ts:31-33` vs `:108-112`**

`estimerDepuisEssai` traite explicitement le cas — « le maximum EST la charge soulevée, par définition. Epley y ajouterait 3,3 % — un chiffre inventé » (l. 105-106) — mais `rmDesSeries`, qui alimente le 1RM de chaque exercice de séance (`exerciceSeance.tsx:63`, disque `DisqueRM`), n'a pas cette garde. Une série de **1 × 100 kg** affiche **103,3 kg** sur la carte de l'exercice et **100 kg** dans le calculateur de RM. Effet dérivé : un 1×100 passe pour un moins bon max qu'un 2×98 (104,5), et la flèche de tendance s'inverse.
**Correction (~10 min)** : faire appeler `estimerDepuisEssai` par `rmDesSeries`, une seule règle.

## M3. La table des paliers prédit 30 à 45 répétitions, au-delà du domaine déclaré
**MOYENNE · CONFIRMÉ (exécuté) · `front/src/calcul/performance.ts:116,122-123` et `front/src/composants/disqueRM.tsx:41-44`**

`repsAu` rend 16 à 65 %, 20 à 60 %, 25 à 55 %, **30 à 50 %** — alors que `REPS_MAX_POUR_1RM = 15` et que le commentaire de la ligne 19 dit « aucune formule de 1RM n'est fiable » au-delà. Contradiction directe à l'écran : dans `src/composants/calculateurRM.tsx:40,119`, taper 16 répétitions est **refusé** avec « Au-delà de 15 répétitions, on mesure l'endurance : l'estimation perdrait son sens » — puis la même modale annonce sereinement 30 répétitions à 50 %. Et `disqueRM.tsx:41-44` **duplique `repsAu` sans l'importer**, avec des paliers descendant à 40 % → **45 répétitions**.
**Correction (~30 min)** : borner l'affichage à `REPS_MAX_POUR_1RM` (« 15+ »), et faire importer `repsAu`/`PALIERS` par `disqueRM.tsx`.

## M4. Le diagnostic « système singulier » ne se déclenche jamais dans le cas qu'il décrit
**MOYENNE · CONFIRMÉ (reproduit) · `front/src/solveur/algebre.ts:7,31` + `front/src/solveur/solveur.ts:141-166`**

`EPSILON = 1e-10` est un seuil **absolu** sur une matrice dont les coefficients sont des macros/100 g. J'ai exécuté le cas exact que vise le message : deux féculents quasi identiques (riz 7,0/78,0/0,6 et riz 7,1/78,2/0,62) plus de l'huile → déterminant **6,4 × 10⁻⁴**, soit six ordres de grandeur au-dessus du seuil. `resoudre` rend donc une « solution » de **−41 109 g / +41 094 g / 11,9 g**, et le diagnostic `systeme_singulier` (« Ces aliments se ressemblent trop pour que le calcul fonctionne ») **n'est jamais émis**. Il ne se déclenche que pour deux aliments *strictement* identiques (vérifié : `resoudre` rend bien `null`).

Le rattrapage limite les dégâts — la boucle des négatifs zéroe le −41 109, re-résout le sous-système 2×2 → riz 89,5 g / huile 19,4 g — mais le message affiché est alors **faux** : « Pas de riz A dans ce repas : le reste apporte déjà tout ce qu'il faut » (`solveur.ts:164`), alors que les protéines finissent à 6,4 g pour 40 visés. L'écart, lui, est correctement reporté ; c'est l'explication qui ment.
**Correction (~30 min)** : seuil relatif (`EPSILON × max|A|` calculé une fois sur la matrice d'entrée), et un message de `quantite_negative` qui distingue « le reste couvre déjà » d'« aliments trop proches ».

## M5. Jetons en clair dans localStorage sur le web
**MOYENNE · CONFIRMÉ · `front/src/api/client.ts:36-50`**

`coffre` utilise `SecureStore` en natif (chiffré, correct) mais retombe sur `globalThis.localStorage` sur le web. Le JWT **et le jeton de rafraîchissement** y sont écrits en clair sous `fitcarnet.jeton` / `fitcarnet.rafraichissement`, lisibles par tout script de la page et persistants. Le jeton de rafraîchissement est le plus exposé : il rouvre la session indéfiniment, là où le JWT expire en une heure. Le commentaire de la ligne 30 (« une seule porte, une seule règle ») élude le fait que la règle n'est pas la même des deux côtés.
Risque réel faible ici : pas de contenu tiers dans la page, quelques utilisateurs connus. Mais c'est la seule chose du front qui, volée, donne un accès durable.
**Correction (moyen)** : sur le web, JWT en mémoire seule et rafraîchissement dans un cookie `HttpOnly; Secure; SameSite=Strict` posé par Symfony — front et API sont sur la même origine en HTTPS (`adresse.ts:56-60`), donc directement faisable. À défaut : l'assumer par écrit.

## M6. Écrans bloqués sur un chargement infini quand une requête voisine échoue
**MOYENNE · CONFIRMÉ**

Quatre écrans testent l'erreur d'**une** requête et pas des autres, puis retombent sur un `return <Chargement />` inconditionnel :
- `front/app/modele/[id].tsx:73-77` — `modeles.isError` jamais lu. Si `/modeles` échoue, l'effet des l. 37-45 ne trouve rien, `modele` reste `null` → **roue qui tourne indéfiniment**, sans message ni bouton Réessayer. Même chose si l'`id` de l'URL ne correspond à aucun modèle (supprimé, lien partagé).
- `front/app/seance/[id].tsx:147-151` — `exercices.isError` non traité. Si le catalogue échoue mais que la séance charge, `parId` (l. 141) est vide : chaque bloc retombe silencieusement sur `mode = 'charge'` (l. 156) et perd son nom. La séance s'affiche **fausse plutôt que vide**.
- `front/app/(onglets)/repas.tsx:652-655` — `cibles.isError` non traité. `cibleDe` (l. 439) et `demandes` (l. 451) filtrent sur `cibles.data ?? []` : sans cibles, `demandes` est vide, le solveur ne tourne pas, et l'écran ne propose rien **sans dire pourquoi**. C'est l'écran le plus sensible de l'application.
- `front/app/admin-utilisateurs.tsx:81-88` — `comptes.isError` non lu.

**Correction (petit, ~1 h pour les quatre)** : un helper `premiereErreur(...requetes)` dans `src/composants/base.tsx`, un seul garde par écran, plus un cas explicite « ce modèle n'existe pas ».

## M7. Message d'erreur trompeur sur les 401 de données
**MOYENNE · CONFIRMÉ · `front/src/api/client.ts:330-331`**

```ts
?? (reponse.status === 401 ? 'Identifiants incorrects.' : `Erreur ${reponse.status}`)
```
Correct sur `/connexion`, faux partout ailleurs. Un 401 sur `/moi`, `/seances` ou `/mon-frigo` veut dire « session expirée », jamais « mot de passe faux ». L'utilisateur qui lit « Identifiants incorrects. » sur son onglet Frigo cherche une faute de frappe dans un mot de passe qu'il n'a pas tapé.
**Correction (trivial)** : faire dépendre le repli de `options.sansJeton`.

## M8. Permission microphone demandée pour rien, et en double
**MOYENNE · CONFIRMÉ · `front/app.json`, bloc `android.permissions`**

```json
["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS",
 "android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"]
```
Les deux permissions sont déclarées **deux fois**, et `RECORD_AUDIO` est la permission **microphone**. Aucune ligne de `front/src` ni `front/app` n'enregistre de son (`grep -niE "record|micro|AudioRecorder|requestRecordingPermission"` : rien hors de `Record<...>` TypeScript). L'application ne fait que **lire** des `.wav` (`sonnerie.ts:117`), ce qui ne demande aucune permission. La fiche Android annonce donc « Microphone » à qui installe l'APK.
**Correction (2 min)** : réduire à `["android.permission.MODIFY_AUDIO_SETTINGS"]`, puis vérifier que la sonnerie sort toujours sur le flux ALARME.

## M9. `@react-navigation/native-stack` importé mais absent de `package.json`
**MOYENNE · CONFIRMÉ · `front/src/composants/enTete.tsx:1`**

Le paquet n'est pas dans `dependencies` (diff imports/deps vérifié) ; il n'est dans `node_modules` que par transitivité d'expo-router (`package-lock.json:4785`). C'est exactement le mode de panne que `verifier-greffons.py` a été écrit pour attraper — sauf que ce script ne regarde **que** les greffons `expo-*` déclarés dans `app.json`, jamais les imports du code. Atténuation : c'est un `import type`, effacé à la compilation, donc Metro ne le cherchera pas ; mais `tsc --noEmit` (script `verif`, exécuté par `npm test`) échouera dès que le hoisting change.
**Correction (trivial)** : `npm i @react-navigation/native-stack`, et élargir `verifier-greffons.py` au sens inverse.

## M10. Course sur le chargement des jetons
**MOYENNE · CONFIRMÉ (code) · probabilité faible · `front/src/api/client.ts:63-70`**

```ts
if (jetonsCharges) return;
[jeton, rafraichissement] = await Promise.all([...]);   // affectation APRÈS l'await
jetonsCharges = true;
```
Si `definirJeton(nouveau)` s'exécute pendant que ce `Promise.all` est en vol, l'affectation **écrase le jeton neuf par la valeur ancienne lue du disque** ; `terminerSession()` peut de même se voir annulée. Les trois appelants de `chargerJeton` sont au montage (`_layout.tsx:43`, `index.tsx:12`, `session.ts:21`) et la connexion arrive bien après, donc la fenêtre est étroite — mais aucune garde n'existe.
**Correction (petit)** : ne réaffecter au retour du `await` que si `!jetonsCharges`.

## M11. `useMoi` : `retry: false` s'applique aussi aux pannes réseau
**MOYENNE · CONFIRMÉ · `front/src/api/hooks.ts:111-116`**

Désactiver les réessais est justifié pour un refus d'identité, mais `retry: false` couvre aussi la panne réseau, que le client ramène à une `ErreurApi` de statut `0` (`client.ts:261-269`). Une coupure d'une seconde condamne l'onglet Compte à `<Erreur>` plein cadre — sans le bouton « Se déconnecter », voir É4 — alors que tous les autres écrans réessaient deux fois (`_layout.tsx:27`). Le message affiché est correct (« Serveur injoignable : … ») ; c'est la stratégie de réessai qui manque de nuance.
**Correction (petit)** : `retry: (n, e) => e instanceof ErreurApi && e.statut === 0 && n < 2`.

## M12. Session d'inventaire perdue au changement d'onglet
**MOYENNE · CONFIRMÉ · `front/app/(onglets)/frigo.tsx:72-77` et `:173-187`**

`mode`, `saisies` et `vus` sont des `useState` du composant d'onglet. Le commentaire des l. 175-180 raconte le bug (« un inventaire de trente articles disparaissait parce qu'on était allé vérifier une quantité dans l'onglet Stock ») et le correctif posé (`if (Object.keys(saisies).length === 0)`, l. 181) est un contournement : quitter l'onglet démonte quand même le composant. Le projet a déjà le bon patron, deux fois (`etatChrono.ts`, `etatMesure.ts`).
**Correction (moyen)** : `src/composants/etatInventaire.ts`.

## M13. `noUncheckedIndexedAccess` désactivé
**MOYENNE · CONFIRMÉ · `front/tsconfig.json:5`**

`strict: true` est bien activé, mais ce drapeau à `false` désactive le seul garde-fou qui rende `tableau[i]` typé `T | undefined`. Dans une base qui indexe beaucoup — `joursRetenus[0]`, `e.groupes[0]`, `b.cle.split('|')[1] as Repas` (`cuisson.ts:367`, `composer.ts:643`, `repas.tsx:1484`), `Object.keys(suite)[0]` — c'est le chemin le plus court vers un `undefined` qui traverse un calcul sans bruit. Le code montre que l'auteur en est conscient (`?? null` posés à la main, `SONNERIES[0]` suivi d'un `if (son === undefined)`), mais la protection est manuelle donc oubliable — et les trois `as Repas` contournent le typage précisément là où l'index peut manquer.
**Correction** : rallumer et mesurer d'abord (`tsc --noEmit`) avant de s'engager.

## M14. `performance.ts` est le seul module de calcul sans aucun test
**MOYENNE · CONFIRMÉ · `front/tsconfig.tests.json`**

L'`include` liste nommément `nutrition.ts`, `frigo.ts`, `planCoach.ts`, `plausibilite.ts`, `cuisson.ts`, `selectionRepas.ts`, tout `src/solveur/**`, et leurs `.test.ts` — tous présents. **`src/calcul/performance.ts` n'y figure pas**, et aucun `performance.test.ts` n'existe. C'est le module où vivent É1 (le plafond de 15 répétitions), M2 (la série d'une répétition) et M3 (les paliers hors domaine) — trois des chiffres les plus visibles de l'application, et le seul endroit où rien ne les garde.
**Correction (petit)** : ajouter `src/calcul/performance.ts` + un `performance.test.ts` à l'`include`. Idem pour `src/calcul/historiqueSeances.ts` une fois extrait.

---

# FAIBLE

- **F1. Quantité négative de « second niveau » écrêtée en silence** — CONFIRMÉ (reproduit), `front/src/solveur/solveur.ts:177`. `nouveau[v] = Math.max(0, sol[i]!)` clampe au lieu de relancer une réduction ; la boucle `for (essai < 3)` ne repasse alors jamais et **aucun `quantite_negative` n'est émis**. Scénario exécuté (skyr / avoine / amandes, 100 g d'œufs imposés) : le skyr disparaît de la collation sans un mot. Les macros restent honnêtes (`ok: false`, écarts justes) — c'est une explication manquante, pas un chiffre faux. Correction : retirer le clamp et laisser la boucle travailler, en émettant le diagnostic à chaque tour (~30 min).
- **F2. `assiette` applique le ratio de cuisson même aux aliments « sans cuisson »** — SUSPECTÉ, `front/src/calcul/cuisson.ts:238-248` (source du chiffre : `solveur.ts:79`). `q.assiette = reference × ratio` **toujours**, y compris pour un aliment rangé dans `crus`. Des flocons d'avoine à `ratio: 2.5` mangés crus dans le skyr : le solveur fait peser 40 g, la boîte annonce 100 g. `plausibilite.ts:263-264` n'avertit sur `ratio !== 1` que pour `fruit/lait/huile/ole`, pas pour `fec`. **À vérifier** : un aliment du catalogue réel a-t-il un `ratio ≠ 1` tout en étant régulièrement marqué « sans cuisson » ? Une requête sur la table des aliments tranche (10 min).
- **F3. `apport_negligeable` annonce les glucides dans la mauvaise convention** — CONFIRMÉ, `front/src/solveur/solveur.ts:365`. `macrosDe(aliment, q)` sans le 3ᵉ paramètre `glucidesTotaux` — le **seul** des cinq appels du fichier à l'oublier (cf. l. 110, 194, 205, 235). Message seulement, aucun calcul n'en dépend. Correction : 1 min.
- **F4. `normalize('NFD')` dans `composer.ts`, alors que `cuisson.ts` l'interdit** — CONFIRMÉ, `front/src/solveur/composer.ts:182-183`. `cuisson.ts:481-490` déroule pourquoi la table `SANS_ACCENT` a été écrite à la main : « Hermes ne l'implémente pas toujours ». `composer.ts` l'utilise malgré tout, dans `choisir()` (l. 220), sur le chemin de composition de **chaque** repas. Pas un chiffre faux : un `TypeError` et un écran vide sur les builds Hermes concernés (~15 min).
- **F5. Message « rendement hors norme » : facteur de matière sèche oublié** — CONFIRMÉ, `front/src/calcul/plausibilite.ts:255-259`. La phrase pose 88 g de matière sèche pour 100 g de grain sec, puis calcule `100 / a.ratio` sans réappliquer ce 0,88 : pour un ratio de 6, elle annonce 17 g là où son propre raisonnement donne 15 g. Correction : `(88 / a.ratio)` (2 min).
- **F6. `planCoach.convertir` arrondit les glucides avant de les sommer en kcal** — CONFIRMÉ, `front/src/calcul/planCoach.ts:76` puis `:83-85`. `gluc` entre arrondi (0,1 g) dans le total, alors que `prot`, `lipides` et `fibres` y entrent bruts. Erreur maximale 0,2 kcal sur plusieurs centaines — signalé parce que c'est le motif « arrondir puis réutiliser » et que ça coûte une ligne (2 min).
- **F7. `ajusterAuStock` peut rendre un plan hors stock après 12 tours** — SUSPECTÉ, `front/src/solveur/composer.ts:358` et `:446-449`. La sortie de secours renvoie `calculer(...)` **sans revérifier le stock**, avec un `ok` qui peut valoir `true`. Le commentaire l. 351-353 assume la borne, pas le fait de rendre un résultat présenté comme valide. **À vérifier** : atteindre 12 tours n'a pas pu être provoqué avec des frigos réalistes ; un compteur de tours dans la sortie + une assertion en test trancherait. Correction : pousser un `Diagnostic` de gravité `blocage` (~15 min).
- **F8. Cache TanStack Query non chiffré sur disque** — CONFIRMÉ, `front/src/api/persistance.ts:39-61`. La déshydratation de toutes les requêtes réussies (`/moi` avec nom et e-mail, `/mon-frigo`, `/seances`, `/cibles`, `/plans`) est écrite dans AsyncStorage, non chiffré. **La purge, elle, est correcte et vérifiée aux trois endroits qui comptent** : `hooks.ts:43-44` (connexion, avant l'appel réseau), `hooks.ts:82-87` (déconnexion), `_layout.tsx:82-87` (fin de session forcée). Stockage en clair assumé, pas de fuite entre comptes.
- **F9. Réécriture différée du cache après purge** — SUSPECTÉ, `front/src/api/persistance.ts:72-79`. `asyncThrottle` (lu dans `node_modules/@tanstack/query-async-storage-persister/build/modern/asyncThrottle.js`) mémorise `lastArgs` et peut s'exécuter jusqu'à 1 s après l'appel : une écriture programmée avant la déconnexion s'exécute **après** `oublierLeCacheDisque()`. Comme `qc.clear()` déclenche un nouvel appel qui écrase `lastArgs` par un état vide, ce qui est réécrit devrait être vide. **À vérifier** : lire la clé `fitcarnet-cache-v1` 2 s après une déconnexion, et déconnecter pendant qu'une requête est en vol.
- **F10. Deux modules se disputent le gestionnaire global de notifications** — CONFIRMÉ, `front/src/composants/alarmeRepos.ts:67-74` vs `front/src/composants/notifications.ts:60-67`. `setNotificationHandler` est global et unique. `alarmeRepos` l'installe au chargement du module avec `shouldShowBanner: false` (volontaire : ne pas doubler le signal du chrono au premier plan, commentaire l. 64-66) ; `notifications.ts` le remplace au **premier envoi d'inventaire** par `shouldShowBanner: true`, une fois pour toutes (garde `pret`, l. 56). Après ce premier inventaire, la fin de repos affiche une bannière au premier plan. Pas de conséquence sonore, mais la règle documentée n'est plus vraie.
- **F11. Module mort de 187 lignes** — CONFIRMÉ, `front/src/composants/inventaire.tsx`. Exporte `ModeInventaire` (l. 31), **zéro import** dans tout `app/` et `src/`. Version antérieure du mode inventaire, qui vit maintenant dans `app/(onglets)/frigo.tsx:366-377` + `718-763`.
- **F12. Autres exports morts** — CONFIRMÉ (`grep -rw` sur `src` + `app`, occurrence unique = la déclaration) : `useEmplacements` (`front/src/api/hooks.ts:158-163`, requête `/emplacements` comprise — même geste que la suppression de `useStock`, documentée l. 514-518) ; `chargePour` (`front/src/calcul/performance.ts`) ; `versSecondes` et `versTemps` (`front/src/composants/serie.tsx`) ; `pourObtenirCuit` (`front/src/solveur/solveur.ts`, référencé seulement dans `README.md`). Plus des `export` inutiles sur des fonctions internes : `grammesSaisis` et `saisieIllisible` exportés depuis la **route** `front/app/(onglets)/repas.tsx:96,106`, `definirSonnerie` (`sonnerie.ts:85`). Styles orphelins : `ligneRepas` (`repas.tsx:2262`), `mini`/`miniBouton`/`miniActif` (`editeurAliment.tsx:458-464`).
- **F13. `nombre` utilisé avant sa déclaration** — CONFIRMÉ, `front/src/composants/editeurAliment.tsx`. Déclaré en `const` l. 144, appelé l. 118 et 123 dans `majNombre`. Ne plante que parce que `majNombre` n'est invoqué qu'après le premier rendu (zone morte temporelle franchie). À remonter — impérativement avant toute extraction de ce bloc.
- **F14. `localStorage` non protégé contre les accès qui lèvent** — SUSPECTÉ, `front/src/api/client.ts:38-48`. `globalThis.localStorage?.getItem(cle)` gère l'absence de l'objet mais pas le cas où il existe et **lève** (navigation privée Safari, blocage du stockage). L'exception remonterait jusqu'à `chargerJeton`, non capturée, au démarrage. **À vérifier** sur un navigateur configuré ainsi ; correction triviale (`try/catch` dans `coffre`).

---

# Découpage proposé des gros fichiers

Préalable : `front/src/muscles/silhouettes.ts` (42 Ko) est un **fichier engendré** (en-tête « FICHIER ENGENDRÉ », 2 exports de tracés SVG dédupliqués depuis `pictogrammes-muscles.zip`). Rien à découper.

Le projet a déjà sa convention d'extraction, et elle marche : `src/calcul/selectionRepas.ts` (37 lignes, testé) a été sorti de `repas.tsx` pour un bug de trois lignes ; `src/calcul/frigo.ts`, `src/calcul/plausibilite.ts`, `src/calcul/cuisson.ts` sont des extractions pures avec leur `.test.ts` en regard. Le plan ci-dessous reproduit exactement ce geste.

## 1. `front/app/(onglets)/repas.tsx` — 2 316 lignes, 15 responsabilités

Quatre écrans complets cohabitent dans une seule fonction, sélectionnés par des `return` précoces (l. 670, 858, 1338, 1543), plus 17 `useState` au sommet.

| Lignes | Responsabilité |
|---|---|
| 53-72 | Vocabulaire des rôles : `TOLERANCE`, `ROLES`, `imposePour` |
| 74-107 | Validation de saisie de poids : `grammesSaisis`, `saisieIllisible` (purs) |
| 109-209 | **Traduction état-écran → contrat solveur** : `demandePour` (100 l., pure) |
| 211-253 | Modèle de l'écran : `interface Compose`, `vers` |
| 255-330 | Câblage : 9 hooks API + 17 `useState` + `joursRetenus` |
| 331-440 | Dérivés du frigo : `stock`, `stockDe`, `promis`, `fibresDe`, `anomalies`, `cibleDe`… |
| 441-556 | **Chaîne de calcul** : `demandes`→`resultats`→`aAcheter`→`plat`→`cuissons`→`parFournee`→`boites` |
| 557-650 | Formatage & actions : `dateCourte`, `nomDeLaBoite`, `toutRecommencer`, `composerTout` |
| 659-854 | **Écran A — plan relu** (instantané figé, lecture seule) |
| 856-1334 | **Écran B — paramétrage** (jours, repas, convives, plans, 3 encarts d'alerte) |
| 1336-1532 | **Écran C — batch cooking** (courses, fournées, boîtes) |
| 1534-1788 | **Écran D — correction du plan** + 3 modales |
| 1791-1855 | Composant `CruOuCuit` |
| 1857-2217 | Composant `CarteRepas` (360 l.) |
| 2219-2316 | 33 styles |

**Frontières nettes (vérifiées, zéro variable partagée à travers la coupure)** : 96-253 (bloc entièrement pur) ; 1791-2217 (déjà hors du composant) ; 659-854 (l'écran A ne lit ni `plan`, ni `resultats`, ni `plat`, ni `cuissons`, ni `stock`).
Les écrans C et D partagent la chaîne 441-556 : c'est la vraie dépendance, et elle est cohésive — elle doit devenir **un hook**, pas être coupée.

**Extractions, dans l'ordre :**

1. **`src/calcul/demandeRepas.ts`** *(petit)* ← l. 53-72, 74-107, 109-209, 211-253.
   Exports : `TOLERANCE`, `ROLES`, `imposePour`, `grammesSaisis`, `saisieIllisible`, `interface Compose`, `vers`, `demandePour(repas, compose, portions, cible): DemandeRepas`.
   100 % pur, testable immédiatement — et **`demandePour` n'a aucun test aujourd'hui** alors qu'il porte la règle « un reste déclaré est un plafond, zéro est un retrait » (l. 159-171), c'est-à-dire l'entrée même de É2.
2. **`src/composants/usePlanCalcule.ts` + `useFrigoCalculable`** *(moyen)* ← l. 331-440 et 441-556. Neuf `useMemo` enchaînés qui n'ont besoin que de leurs entrées :
   `usePlanCalcule({ plan, joursRetenus, portions, cibles, stock, stockDe, modesCuisson, mesCuissons, cuissonsChoisies })` → `{ demandes, resultats, aAcheter, plat, cuissons, habitudesNouvelles, parFournee, restentASituer, boites }`.
3. **`src/composants/planRelu.tsx`** *(petit)* ← l. 659-854 + `dateCourte` (568-576). `PlanRelu({ plan, onFermer })` ; `useMarquerCuisine`, `courses`, `boiteOuverte` descendent dedans. Retire 4 `useState` du parent.
4. **`src/composants/carteRepas.tsx`** *(moyen)* ← l. 1791-2217 + 17 styles. Interface publique inchangée. Au passage : factoriser les **trois** lignes de tableau identiques 2040-2050, 2072-2082, 2112-2124 en un `<LigneQuantite>` local.
5. **`src/composants/etapeBatch.tsx`** *(moyen)* ← l. 1336-1532. `nomDuPlan`, `courses`, `boiteOuverte` deviennent locaux ; `useEnregistrerPlan` descend dedans.
6. **`src/composants/etapeReglage.tsx`** *(gros)* ← l. 856-1334. Le plus enchevêtré (11 states). **À faire en dernier** : les cinq extractions précédentes réduisent d'elles-mêmes le nombre de `useState` avec lesquels il faut négocier.

Après ces six extractions, `repas.tsx` retombe à **~250 lignes** : les hooks, le state de navigation (`plan`, `batch`, `relu`, `cuissonsChoisies`), `composerTout`, `toutRecommencer`, et l'aiguillage.

**State qui devrait vivre ailleurs.** Sur les 17 `useState`, **9 sont des états d'affichage local** hissés au sommet sans raison : `courses` (286) et `boiteOuverte` (298) sont partagés par A et C **par accident** (jamais à l'écran en même temps) ; `plansOuverts`, `planASupprimer`, `calendrierOuvert`, `detaille`, `jourOuvert` n'appartiennent qu'à B ; `nomDuPlan` qu'à C ; `ouvert`, `remplacer`, `ajouter`, `choisirCuisson` qu'à D. Le symptôme est visible : `toutRecommencer` (595-611) remet **14 states** à zéro — ce serait un `setEtat({phase:'reglage'})` si chaque écran possédait les siens.

## 2. `front/src/api/hooks.ts` — 1 228 lignes, 10 domaines + 1 intrus

Frontières excellentes : chaque domaine est déjà séparé par un bandeau de commentaire (l. 16, 118, 213, 535, 588, 673, 746, 1079, 1165) et **aucune variable n'est partagée entre domaines**. Découpage mécanique.

Créer `src/api/hooks/` avec un **barrel** `index.ts` qui ré-exporte tout, pour que les 54 `from '@/api/hooks'` existants ne bougent pas :

| Fichier | Lignes d'origine | Contenu |
|---|---|---|
| `hooks/decimales.ts` | 290-326, 717-731, 927-958 | `versDecimales`, `cibleEnEcriture`, `nombreEnTexte`, `serieEnEcriture`, `seanceEnEcriture`, `modeleEnEcriture` — **à faire en premier**, tout le reste en dépend |
| `hooks/auth.ts` | 16-116 | `useConnexion`, `useDeconnexion`, `useMoi` |
| `hooks/referentiels.ts` | 118-211 | `REFERENTIEL`, `useExercices`, `useExerciceDetail`, `useMajExercice`, `useFusionExercices` |
| `hooks/frigo.ts` | 213-518 | les 10 hooks du frigo + `EchecInventaire`, `SuiviInventaire` |
| `hooks/cuissons.ts` | 520-533, 535-586, 673-709 | recolle lecture et écriture, aujourd'hui **séparées par 140 lignes** |
| `hooks/plans.ts` | 588-671 | `PlanRepas`, `usePlans`, `useEnregistrerPlan`, `useSupprimerPlan`, `useMarquerCuisine` |
| `hooks/nutrition.ts` | 711-792 | cibles + compléments |
| `hooks/seances.ts` | 794-798, 920-1077 | recolle lecture et écriture, aujourd'hui **séparées par 120 lignes** |
| `hooks/comptes.ts` | 1079-1228 | invitations + comptes admin |

**Extraction prioritaire, avant tout le reste : `src/calcul/historiqueSeances.ts`** *(petit)*.
Les l. **800-918** contiennent trois hooks qui **ne font aucune requête** — ce sont des réductions pures sur `seances.data` :
```ts
export const recordsAvant:    (seances: Seance[], dateExclue?: string) => Map<number, number>;
export const derniereFoisPar: (seances: Seance[], dateExclue?: string) => Map<number, {reps;poids;secondes}[]>;
export const courbesPar:      (seances: Seance[]) => { rm: Map<number, number[]>; volume: Map<number, number[]> };
```
C'est cette extraction qui corrige **É1** : les trois fonctions doivent appeler `epley` / `rmDesSeries` de `performance.ts` au lieu de réimplémenter la formule (et son plafond, ou son absence de plafond). Aucune des trois n'est testée aujourd'hui, alors qu'elles alimentent le disque RM, le pré-remplissage de séance et les courbes.

## 3. `front/app/(onglets)/frigo.tsx` — 827 lignes, 8 responsabilités

Frontières nettes : 20-48 (adaptateurs purs), 194-348 (les 7 bannières ne lisent que des dérivés, aucun setter), 454-568 (les deux `EditeurAliment`), 625-770 (déjà hors composant).

1. **`src/calcul/frigo.ts`** (existant, y ajouter) *(petit)* ← l. 20-48 : `versSaisie`, `stocksInitiaux`. `ALIMENT_VIDE` disparaît (doublon, voir D6).
2. **`src/composants/alertesFrigo.tsx`** *(petit)* ← l. 239-347, les 7 bannières + `s.alerte`. Retire 155 lignes du corps.
3. **`src/composants/editeurAlimentConnecte.tsx`** *(moyen)* ← l. 454-568, **fusionnées en un seul composant** paramétré par `source: 'grocy' | 'base'`. Supprime la duplication du corps à 9 champs (D5).
4. **`src/composants/ligneFrigo.tsx`** *(petit)* ← l. 625-770 (`LigneStock`, `LigneInventaire`, `Mesure`) + leurs 13 styles.

Reste : ~230 lignes. Plus la session d'inventaire hors composant (M12).

## 4. `front/app/admin-exercices.tsx` — 711 lignes, 7 responsabilités

Coupure très nette entre la logique de l'éditeur (143-285) et son rendu (287-475).

1. **`src/muscles/catalogueExercices.ts`** *(petit)* ← l. 84-118 et 489-553 : `Filtre`, `FILTRES`, `aTraduire`, `zonesPresentes`, `filtrerExercices`, `avancementCatalogue`.
   Important : le fichier documente **deux fois** (l. 507-516 et 549-552) que la jauge de progression et le filtre ont divergé sur la définition de « à compléter ». Les mettre dans le même module rend la divergence impossible — c'est la raison même qui avait justifié `aTraduire` (l. 95-115).
2. **`src/composants/useEditeurExercice.ts`** *(moyen)* ← l. 143-285. Testable sans rendu, et c'est là que vivent les 7 règles de comparaison normalisée (l. 216-223) qui décident si un enregistrement écrase ou non une valeur existante.
3. **`src/composants/modaleEditeurExercice.tsx`** *(petit)* ← l. 287-475 + 7 styles.

Reste : ~120 lignes.

## 5. `front/src/solveur/composer.ts` — 780 lignes

**Le plus sain des huit.** Cinq modules empilés dans un ordre de dépendance strictement croissant, sans aucun retour en arrière — vérifié : zéro cycle, zéro variable partagée. Découpage purement mécanique *(petit)* :

| Fichier | Lignes | Exports |
|---|---|---|
| `src/solveur/repasVocabulaire.ts` | 13-183 | `Repas`, `REPAS`, `NOM_REPAS`, `Role`, `roleDe`, les 4 constantes de portion, `ModeleRepas`, `MODELE`, `rolesDuRepas` |
| `src/solveur/composer.ts` *(rétréci)* | 186-282 | `Composition`, `composer` |
| `src/solveur/plafonner.ts` | 284-450 | `Plafonne`, `Ajuste`, `ajusterAuStock` |
| `src/solveur/auMieux.ts` | 452-582 | `AuMieux`, `resoudreAuMieux` |
| `src/solveur/periode.ts` | 584-780 | `DemandeRepas`, `DemandeDatee`, `cleDuRepas`, `resoudreLaJournee`, `resoudreLaPeriode`, `listeDeCourses` |

`src/solveur/periode.test.ts` existe déjà et testerait alors exactement son module — c'est aussi là que se pose le test de non-régression de É2.
Attention : les 4 constantes de portion (l. 62, 74, 84, 121) semblent inutilisées hors tests mais sont consommées **via `MODELE`** (l. 127, 134-135, 145-146, 153-154). Ce n'est pas du code mort.

## 6. `front/src/calcul/cuisson.ts` — 611 lignes

Coupures parfaites, déjà marquées par des bandeaux (255, 458), et vérifiées : le bloc 3 n'utilise du bloc 1 que le type `Repas` et la fonction `cleDeCuisson` (2 lignes). *(petit)*

| Fichier | Lignes | Contenu |
|---|---|---|
| `src/calcul/fournees.ts` | 32-253 | `cleDeCuisson`, `enFournees`, `resteSansCuisson`, `sansCuisson`, `repartition` + leurs types |
| `src/calcul/planFige.ts` | 255-456 | `figerLePlan`, `consommationDuPlan`, `estCuisine`, `dejaPromis` |
| `src/calcul/habitudesCuisson.ts` | 458-611 | `cleDHabitude`, `depuisLesHabitudes`, `habitudesAEcrire`, la table `SANS_ACCENT` |

Scinder `cuisson.test.ts` en trois en regard. **C'est le mieux tenu des huit** : le découpage est un confort, pas une urgence.

## 7. `front/src/composants/editeurAliment.tsx` — 465 lignes

Frontière nette à 302-391 (le bloc « ratio de cuisson » ne partage que 3 states qui n'existent que pour lui). *(petit)*
- `src/composants/choixRatio.tsx` ← l. 302-391 + styles `choixRatio`, `choixActif`, `mesure`.
- `src/composants/brouillonAliment.ts` ← l. 33-54 + 86-152 : `useBrouillonAliment(aliment, visible)`. **Remonter `nombre` en tête au passage** (F13).

Le composant retombe à ~200 lignes. Le moins urgent des huit : il fait une seule chose.

## 8. `front/app/seance/[id].tsx` — 430 lignes

**Le mieux structuré des huit écrans** — 430 lignes pour 4 modales et une liste réordonnable, c'est proportionné. Une seule extraction vaut vraiment le coup :
- **`src/calcul/blocSeance.ts`** *(petit)* ← l. 153-224 : `avancementDe`, `blocDepuisExercice`, `blocsDepuisModele`. Trois fonctions pures, **aucune testée** — `blocDepuisExercice` (l. 168-192) porte la règle « on reprend ce qui a été fait la dernière fois, sinon le format prescrit ».
- Optionnel *(moyen)* : `src/composants/useSeanceEditable.ts` ← l. 43-44, 97-145 (sauvegarde auto + abonnement `etatMesure` + hydratation).

## Duplication réelle (vérifiée, deux emplacements cités)

| # | Ce qui est copié | Où |
|---|---|---|
| D1 | **Formule d'Epley**, avec des règles de validité divergentes → É1 | `src/calcul/performance.ts:22-23` · `src/api/hooks.ts:826` · `src/api/hooks.ts:906` |
| D2 | `rmDesSeries` / `volumeDesSeries` réimplémentés, mêmes arrondis inclus | `src/calcul/performance.ts:26-49` · `src/api/hooks.ts:899-911` |
| D3 | `repsAu` + table des paliers, avec des bornes différentes → M3 | `src/calcul/performance.ts:116,122` · `src/composants/disqueRM.tsx:41-44` |
| D4 | `sansAccent`, **4 copies** au corps strictement identique | `src/solveur/composer.ts:182` · `src/calcul/frigo.ts:39` · `src/composants/choixAliment.tsx:49` · `app/admin-exercices.tsx:117` → `src/calcul/texte.ts`. ⚠ **Ne pas y toucher** à `cleDHabitude` (`src/calcul/cuisson.ts:521-528`), qui utilise **délibérément** une table manuelle parce que Hermes n'implémente pas toujours `normalize` (commentaire l. 482-489). Voir F4 : c'est `composer.ts` qui doit s'aligner sur `cuisson.ts`, pas l'inverse |
| D5 | Le `corps` à 9 champs de l'éditeur d'aliment, deux fois | `app/(onglets)/frigo.tsx:471-483` · `:526-537` |
| D6 | `ALIMENT_VIDE` / `vide`, objets littéralement identiques (10 champs) | `app/(onglets)/frigo.tsx:21-24` · `src/composants/editeurAliment.tsx:27-31` |
| D7 | `grammesSaisis` réimplémenté en ligne 35 lignes plus bas, alors que le commentaire l. 87-94 proclame « UN SEUL ENDROIT DÉCIDE CE QU'EST UNE SAISIE VALABLE » | `app/(onglets)/repas.tsx:96-103` · `:138-140` |
| D8 | Le filtre « aliments ajoutables » calculé deux fois — si l'une change sans l'autre, `onChoisir` désigne le mauvais aliment | `app/(onglets)/repas.tsx:1765-1769` · `:1774-1775` |
| D9 | Les trois tables « courses / fournées / boîtes », écran A vs écran C | `repas.tsx:737-743`↔`1366-1372` · `750-761`↔`1402-1416` · `770-809`↔`1428-1486` |
| D10 | `idDe`, **5 occurrences** du même ternaire | `app/seance/[id].tsx:26` · `app/modele/[id].tsx:18` · `src/api/hooks.ts:821`, `859`, `895` → `src/api/types.ts` |

## Ordre d'exécution recommandé

| Rang | Action | Effort | Gain |
|---|---|---|---|
| 1 | Supprimer `src/composants/inventaire.tsx`, `useEmplacements`, `chargePour`, `versSecondes`/`versTemps`, les 4 styles orphelins | trivial | −200 lignes |
| 2 | `src/calcul/texte.ts` → `sansAccent` (D4) **en s'alignant sur la table manuelle** (F4) | petit | 4 copies fusionnées + un `TypeError` Hermes évité |
| 3 | **`src/calcul/historiqueSeances.ts` (D1+D2)** + `performance.ts` dans `tsconfig.tests.json` | petit | **corrige É1, M2, M3, M14** |
| 4 | `src/calcul/demandeRepas.ts` + corriger D7, puis le test de non-régression de **É2** | petit | 160 l. hors de `repas.tsx`, testables |
| 5 | `src/api/hooks/*` + barrel | moyen | 1 228 → 9 × ~130 l. |
| 6 | `src/solveur/*` et `src/calcul/{fournees,planFige,habitudesCuisson}.ts` | petit | mécanique, zéro risque |
| 7 | `planRelu.tsx` + `carteRepas.tsx` | moyen | −560 l. dans `repas.tsx` |
| 8 | `usePlanCalcule` + `useFrigoCalculable` | moyen | isole la chaîne de calcul |
| 9 | `alertesFrigo.tsx` + `ligneFrigo.tsx` + `editeurAlimentConnecte.tsx` (D5, D6) | moyen | 827 → ~230 l. |
| 10 | `catalogueExercices.ts` + `useEditeurExercice.ts` + modale | moyen | 711 → ~120 l. |
| 11 | `etapeBatch.tsx` puis `etapeReglage.tsx` | gros | `repas.tsx` → ~250 l. |
| 12 | `blocSeance.ts`, `useSeanceEditable.ts`, `choixRatio.tsx` | moyen | confort + tests |

Les rangs 1-4 se font en une session, ne cassent rien, et corrigent cinq constats dont deux ÉLEVÉE.

---

# Ce qui va bien

1. **`tsc --noEmit` passe sans une seule erreur**, `strict` activé, et **aucun `any`, aucun `@ts-ignore`, aucun `@ts-expect-error`** dans tout `front/app` + `front/src`. Les rares `as` sont étroits et localisés.
2. **L'ordre des arrondis dans le solveur est correct et volontaire** — les quantités sont arrondies **puis** les macros recalculées dessus (`solveur.ts:185-209`) : ce qui est affiché est ce qui sera pesé. `listeDeCourses` somme brut, soustrait le stock, arrondit en dernier. C'est précisément le piège que la question 4 cherchait, et il est évité par construction.
3. **Toutes les divisions par zéro sont gardées, sans exception trouvée.** `versReference` / `convertir` / `pourObtenirCuit` / `macrosSiDejaCuites` protègent le ratio par `a.ratio > 0 ? a.ratio : 1` (qui attrape aussi `NaN` et `undefined`) ; `conseil()` par `f.reference <= 0` ; `grasParProteine` par `prot100 > 0` ; `repartition` par `Math.max(1, r.convives)` ; `resoudre` par `Number.isFinite` ; `soupconKilojoules` par `calculees <= 0`. Le sens des conversions cru↔cuit est cohérent d'un bout à l'autre, aller-retour exact.
4. **Le renouvellement de jeton est correctement dessiné.** `uneSeuleFois` partage la promesse en cours et la libère dans `.finally()` — dix 401 simultanés déclenchent un seul `/jeton/rafraichir` et rejouent tous ; une panne réseau est distinguée d'un refus serveur ; le rejeu est unique, sans risque de boucle. Le module est isolé et testé. La purge du cache est faite aux trois endroits qui comptent, et à la connexion **avant** l'appel réseau plutôt qu'après.
5. **Le client HTTP ne suppose pas que la réponse est du JSON** (`client.ts:296-318`) : une page d'erreur HTML de Caddy devient un message actionnable, et une panne réseau **nomme l'adresse** qui a échoué. Les minuteurs sont proprement nettoyés partout (`chrono.tsx:95`, `chronoSerie.tsx:45`, `bandeauMesure.tsx:32`, `etatMaj.tsx:102-104` avec `AbortController`), et l'état du chrono vit hors composant, avec les alarmes système sérialisées dans une file.
6. **Le code se documente par ses pannes.** Une grande partie des commentaires raconte le bug réel qui a motivé la ligne, avec la date et le symptôme. C'est ce qui a rendu cet audit rapide — et c'est aussi ce qui rend les divergences d'autant plus visibles : **presque tous les constats de ce rapport contredisent un commentaire du projet lui-même** (le plafond de 15 répétitions, la convention européenne des fibres, « le plafond se comporte comme un frigo plus petit », « un seul endroit décide ce qu'est une saisie valable », l'interdiction de `normalize`). Le désaccord n'est pas entre l'auteur et l'auditeur ; il est entre le code et sa propre documentation, ce qui est la forme la plus facile à corriger.
