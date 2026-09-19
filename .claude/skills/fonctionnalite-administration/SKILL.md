---
name: fonctionnalite-administration
description: Tenir le catalogue commun et les comptes — gestion des exercices, fusion de deux exercices, façons de cuire, invitations et comptes (désactiver, réactiver, supprimer). Compte administrateur uniquement ; le panneau est invisible et inatteignable pour un compte ordinaire, et les routes sont fermées côté serveur. À charger avec `epreuve-fonctionnalite` pour éprouver et filmer la bobine 8.
---

# L'administration

> **Compte administrateur uniquement.** Toutes les affirmations de cette fiche
> ont été vérifiées dans le code le **16 septembre 2026**, avec leur
> `fichier:ligne`. Les libellés sont recopiés du code.

## Le besoin

Une personne — une seule, en pratique — tient l'application pour les autres :
elle corrige le catalogue commun d'exercices arrivé en anglais et incomplet,
fusionne les doublons sans détruire l'historique de personne, tient la liste des
façons de cuire dont dépend tout le batch cooking, et gère les accès : inviter,
suspendre, supprimer.

Chacun de ces gestes porte sur des données **partagées par tous les comptes**.
D'où les deux exigences qui structurent cette fiche : **ce qui est destructeur
est chiffré avant d'être confirmé**, et **deux gestes sont refusés et non
confirmés** — parce qu'une confirmation, on l'accepte.

## Ce que l'application propose

L'entrée est dans l'onglet **Compte**, sous l'intertitre « **Administration** »,
et **seulement si le compte porte `ROLE_ADMIN`**
(`front/app/(onglets)/compte.tsx:83-99`). Quatre boutons :

| Bouton | Écran | Titre de l'écran |
|---|---|---|
| « **Gestion des exercices** » | `front/app/admin-exercices.tsx` | « Gestion des exercices » |
| « **Fusionner des exercices** » | `front/app/admin-fusion.tsx` | « Fusionner des exercices » |
| « **Façons de cuire** » | `front/app/admin-cuissons.tsx` | « Façons de cuire » |
| « **Inviter quelqu'un** » | `front/app/admin-utilisateurs.tsx` | « Inviter quelqu'un » |

(titres : `front/app/_layout.tsx:211-214`)

### Le panneau est invisible ET inatteignable — depuis le 15 septembre 2026

Trois barrières, et elles ne se valent pas :

1. **Le lien est caché** — conditionné au rôle
   (`front/app/(onglets)/compte.tsx:83`). *Un lien caché ne protège rien : sur
   le web, on TAPE l'adresse.*
2. **Le portier de navigation** — `PortierAdmin`, **un seul endroit et non
   quatre** (`front/app/_layout.tsx:75-100`). Il reconnaît un écran
   d'administration au **préfixe du fichier** (`segments[0].startsWith('admin-')`,
   `:85`), et non à une liste écrite à la main : le prochain écran `admin-*`
   naîtra protégé sans que personne y pense. Un compte ordinaire est renvoyé sur
   `/(onglets)/compte` par `replace` (`:92`), et l'écran **n'est pas monté du
   tout** — ce qui évite aussi les appels `/api/invitations` et `/api/comptes`
   qui partaient avant le garde, avec leurs 403 relancés par la politique de
   réessai. `moi.isPending` veut dire « je ne sais pas encore », **surtout pas
   « non »** (`:71-74,89`).
3. **Les routes de l'API sont fermées côté serveur** — et **c'est la seule vraie
   garantie**. Le commentaire de `_layout.tsx:62-69` le dit lui-même : un compte
   curieux appelle l'API directement, sans jamais passer par l'écran ; le
   portier est du confort.

Les quatre gardes d'écran subsistent (« **Cet écran est réservé à
l'administrateur.** » — `admin-exercices.tsx:55`, `admin-fusion.tsx:65`,
`admin-cuissons.tsx:55`, `admin-utilisateurs.tsx:84`) mais **ne protègent rien
aujourd'hui**, `children` n'étant monté que si `admin === true`. Ils sont gardés
pour le jour où le portier serait déplacé.

**La surface d'administration côté API est écrite, exhaustive et vérifiée dans
les deux sens** : `api/tests/Security/SurfaceAdministrationTest.php:89-124`
(`SURFACE`). Une porte fermée sans être inscrite échoue **autant** qu'une porte
inscrite qu'on aurait rouverte (`:254-270`). S'y ajoutent
`- { path: ^/api/docs, roles: ROLE_ADMIN }`
(`api/config/packages/security.yaml`) : la carte de l'API n'est pas publique.

### Les exercices

| Capacité | `fichier:ligne` |
|---|---|
| Compteurs d'en-tête « *n*/*n* renseignés · *n*/*n* traduits · *n* vidéos » + jauge | `front/app/admin-exercices.tsx:63-71` |
| **La jauge compte exactement ce que le filtre liste** (`estRenseigne` = zone **ET** muscle) | `front/src/muscles/catalogueExercices.ts:79-94` |
| **Six filtres** | `front/src/muscles/catalogueExercices.ts:41-54` |
| Recherche « Rechercher un exercice… », sur les **deux** noms, sans accents | `front/app/admin-exercices.tsx:73` · `catalogueExercices.ts:118-126` |
| **La fiche complète est chargée avant édition** | `front/src/composants/useEditeurExercice.ts:62,80-94` |
| Zones proposées tirées du **catalogue réel** | `front/src/muscles/catalogueExercices.ts:137-144` |
| Validation du lien YouTube, enregistrement bloqué | `front/src/composants/useEditeurExercice.ts:102-103` · `modaleEditeurExercice.tsx:195-199,211` |
| Compteur « **Enregistrer (n)** » / « **Aucune modification** » | `front/src/composants/modaleEditeurExercice.tsx:214` |
| **Seuls les champs modifiés sont envoyés** | `front/src/muscles/editionExercice.ts:183-213` |
| **Pas de faux changements** (`traps, trapezius` = `trapezius`) | `front/src/muscles/editionExercice.ts:156-167` |
| Confirmation d'abandon | `front/src/composants/modaleEditeurExercice.tsx:222-230` |

Les six filtres, **libellés exacts** : « **À compléter** », « **Sans muscle** »,
« **Sans vidéo** », « **À traduire** », « **Ajoutés dans l'app** », « **Tous** »
(`front/src/muscles/catalogueExercices.ts:41-54`). Le cinquième s'appelait
« Les miens » : renommé, parce que depuis que `FiltreExercice` applique « public
OU le mien », un administrateur ne voit plus les exercices privés des autres —
le libellé promettait une distinction de propriétaire qui n'existe plus dans ce
que l'écran reçoit (`:46-51`).

### Fusionner deux exercices

Une suppression est **impossible** dès qu'un exercice figure dans une séance
(`ON DELETE RESTRICT`, `db/01-schema.sql:290,329`) — et c'est heureux. La fusion
transfère l'historique **avant** de supprimer :
`api/src/State/FusionExerciceProcessor.php:52-90`.

- Remplacement dans `seance_exercice` **et** `modele_exercice` (`:54-61`).
- L'orphelin cède ce qui n'existait que chez lui : format prescrit, vidéo, et le
  nom français si l'ancien était un exercice perso (`:65-73`).
- **Transaction avec `rollBack`** (`:91-92`) ; en cas d'échec, le SQL part au
  journal et l'écran reçoit « **Fusion impossible. Le détail est dans le journal
  du serveur.** » (`:98-105`, constat M-03).
- Correspondances probables : distance de Levenshtein, seuil 0,45, **cinq au
  plus**, pourcentage affiché (`front/app/admin-fusion.tsx:12-32,52-61,102-109`).
- Réservée à `ROLE_ADMIN` : `api/src/Dto/FusionExercice.php:24`.

### Les façons de cuire

Table **partagée par tous les comptes**, écriture réservée à l'administrateur
(`api/src/Entity/ModeCuisson.php:51-64`). « Deux aliments partent dans la même
fournée s'ils portent la même ligne d'ici » — d'où une liste fermée plutôt qu'un
champ libre, qui finirait avec « four », « Four », « au four » et « four 180 »
(`:38-48`, `front/app/admin-cuissons.tsx:23-33`).

- Doublon détecté **avant** l'envoi (`admin-cuissons.tsx:70-71,111-116`).
- Nouveau rang **par pas de dix**, pour pouvoir intercaler (`:63-68`).
- Réordonner **par échange de rangs**, jamais par incrément — qui produirait
  deux rangs égaux, donc un ordre alphabétique, c'est-à-dire n'importe lequel
  (`:73-83`).
- Suppression : la conséquence invisible est annoncée (`:209-216`).

### Les comptes et les invitations

- Invitation : on saisit une adresse, on obtient **un lien affiché une seule
  fois** — le serveur n'en garde qu'une empreinte, comme un mot de passe
  (`front/app/admin-utilisateurs.tsx:38-41,156-161` ·
  `api/src/Controller/InvitationsController.php:183-188`).
- Une nouvelle invitation **remplace** celle qui attendait, dans la même
  transaction : l'ancien lien meurt à l'instant où le nouveau naît.
- **« Renvoyer un lien »**, depuis le 18 septembre 2026, sur chaque invitation
  **en attente ou périmée**. C'est le geste du « la personne a perdu son lien »,
  et il se faisait auparavant à l'aveugle : retrouver l'adresse dans la liste, la
  retaper en haut de l'écran, et se tromper d'une lettre créait une SECONDE
  invitation pour une adresse voisine au lieu de remplacer la première. **Aucune
  route nouvelle** — c'est le `POST` ci-dessus, qui remplaçait déjà. L'écran
  remonte pour montrer le lien neuf, **y compris quand l'appel échoue** : le
  seul endroit qui affiche l'erreur est en haut. Une invitation **acceptée** n'a
  pas ce bouton : la personne a son compte, il n'y a rien à renvoyer.
- **LA LISTE SE PURGE TOUTE SEULE**, et il faut le savoir avant de s'étonner
  qu'une ligne ait disparu. `bin/console app:invitations:purger` tourne à chaque
  démarrage de la pile (`docker/entrypoint-prod.sh`). Rétention de **30 jours**
  pour les acceptées (comptés depuis l'acceptation) et les périmées ; **sans
  aucun délai** pour les **orphelines** — celles dont le compte a été supprimé,
  `invitation.utilisateur_id` étant en `ON DELETE SET NULL` : la ligne restait
  « acceptée » et sans nom, pour toujours, et réinviter cette adresse affichait
  deux lignes pour la même personne. Une invitation **vivante n'est jamais
  purgée**, son lien est dehors. **Purger une invitation ne touche pas au
  compte.** Pour voir sans rien supprimer : `--simuler`.
- Liste avec le contenu en chiffres, **neuf compteurs** depuis le 17 septembre
  2026 : « *n* séances · *n* séries · *n* modèles · *n* plans · *n* aliments ·
  *n* lignes de stock · *n* objectifs · *n* compléments · *n* exercices
  personnels » — les exercices personnels étant ceux que le compte a créés et
  qui ne sont pas publics (`cree_par = u.id AND NOT public`)
  (`api/src/Controller/ComptesController.php:69-122` ·
  `front/app/admin-utilisateurs.tsx:230-232`, mise en mots
  `front/src/calcul/contenuCompte.ts:25-37`).
- **Désactiver supprime aussi les jetons de rafraîchissement** — sinon un compte
  bloqué se prolongerait tout seul pendant des semaines
  (`ComptesController.php:127-132,166-173`).
- **Suppression : le compte part avec ses aliments, son stock et ses exercices
  personnels** — les lignes de stock visant ses aliments, **puis** ses
  aliments, **puis** le relevé de ses exercices personnels, **puis** le compte,
  **puis** ces exercices, dans une transaction. `aliment.utilisateur_id` est en
  `ON DELETE CASCADE`, mais `stock.aliment_id` est en `RESTRICT` : l'ordre est
  écrit à la main pour ne pas dépendre de celui des cascades. `exercice.cree_par`
  est en `SET NULL` : sans le relevé fait **avant**, ses exercices resteraient
  sans auteur ni publication, visibles de personne. Ils ne sont retirés
  qu'**après** le compte (ses séances et modèles les citaient, en `RESTRICT`),
  et seulement si plus personne ne les cite (`:191-200`, `:221-256`).
- **Son propre compte n'a aucun bouton** (`admin-utilisateurs.tsx:234-243`).

## Le parcours

**Compte requis** : administrateur jetable (`roles` à `'ROLE_ADMIN'`, voir
`epreuve-fonctionnalite` §1). **Plus un compte ordinaire jetable**, pour les
critères d'isolation.

1. Onglet **Compte** → l'intertitre « **Administration** » et ses quatre
   boutons apparaissent.
2. **Gestion des exercices** : l'en-tête compte, la jauge se remplit, six
   filtres, une recherche. Taper un exercice ouvre l'éditeur ; le rond « i » à
   droite n'apparaît **que si l'exercice a une vidéo**
   (`admin-exercices.tsx:140-148`).
3. Dans l'éditeur : « **Nom français** », « **Lien YouTube** », « **Format
   prescrit** », « **Exécution** » (`front/src/muscles/editionExercice.ts:33-56`),
   puis « **Ce qu'on saisit pendant la séance** » (Charge / **Isométrie** /
   Chrono — `:69-73`), « **Séances où le proposer** » (Push / Pull / Legs),
   « **Zone** », « **Muscle ciblé** », « **Matériel** », « **Aussi sollicités** »
   (`modaleEditeurExercice.tsx:88-193`). Le bouton affiche « **Aucune
   modification** » puis « **Enregistrer (3)** ».
4. **Fusionner** : « **Exercice à remplacer** » → « **Correspondances
   probables** » avec leur pourcentage → « **Remplacé par** » → « **Fusionner** »
   → confirmation « **Fusionner ces exercices ?** » :
   « « *ancien* » sera remplacé partout par « *nouveau* », puis supprimé. **Ton
   historique est conservé, mais l'opération est définitive.** »
   (`admin-fusion.tsx:159-165`)
5. **Façons de cuire** : « **Ajouter une façon de cuire** », champ
   « **Libellé** » (placeholder « Plancha »), puis « **Ajouter** ». Chaque ligne
   porte « **Renommer** », « **Supprimer** » et les flèches ↑ ↓.
6. **Inviter quelqu'un** : « **Adresse électronique** » → « **Créer le lien** »
   → le lien, avec « **Copier le lien** » (web) ou « **Envoyer le lien** »
   (mobile), puis « **Envoyé ✓** » (`admin-utilisateurs.tsx:151-155`). Plus bas,
   « **Comptes** » : « **Désactiver** » / « **Réactiver** » / « **Supprimer** ».

## Critères d'acceptation

### Accès et isolation — le cœur de cette fiche

1. **Un compte ordinaire ne voit pas le panneau** — l'intertitre
   « Administration » et les quatre boutons sont **absents** de l'onglet Compte
   (`front/app/(onglets)/compte.tsx:83`).
2. **Un compte ordinaire ne peut pas atteindre les écrans, même en tapant
   l'adresse** — sur le web, `/admin-exercices`, `/admin-fusion`,
   `/admin-cuissons`, `/admin-utilisateurs` renvoient sur l'onglet Compte, et
   **aucune requête `/api/comptes` ni `/api/invitations` ne part**. Vérifier
   dans l'onglet réseau : **zéro appel**, pas « des appels en 403 »
   (`front/app/_layout.tsx:85-97`).
3. **Un compte ordinaire reçoit 403 sur toutes les routes d'administration** —
   c'est la garantie réelle. Attendu **403** sur chacune :
   `GET /api/comptes`, `POST /api/comptes/{id}/actif`, `DELETE /api/comptes/{id}`,
   `GET /api/invitations`, `POST /api/invitations`, `DELETE /api/invitations/{id}`,
   `POST /api/exercices`, `POST /api/exercices/fusion`,
   `POST|PATCH|DELETE /api/mode_cuissons[/{id}]`, `GET /api/docs`.
4. **La surface est celle qu'on a décidée** — `SurfaceAdministrationTest`
   compare l'inventaire tenu à la main au code réel **dans les deux sens** ; il
   doit être vert. Le faire passer en ajustant la liste `SURFACE` sans décision
   est précisément ce que ce test interdit.
5. **Aucune route de contrôleur sans garde** — chaque `#[Route]` porte un
   `#[IsGranted]`, ou figure dans `SANS_GARDE` **avec sa raison écrite**
   (`SurfaceAdministrationTest:48-66,151-180`). Les cinq dérogations sont servies
   par un pare-feu `security: false` : `etat`, `rafraichir`, `deconnexion`,
   `invitation/verifier`, `invitation/accepter`.
6. **`/api/invitations` ≠ `/api/invitation/`** — la barre oblique finale du
   pare-feu n'est pas décorative : sans elle, la liste des invitations et le
   pouvoir d'en créer deviendraient **publics**
   (`api/config/packages/security.yaml`, pare-feu `invitation` ;
   `InvitationsController.php:43-51`). Vérifier que
   `GET /api/invitations` **sans jeton** rend 401, pas 200.

### Les exercices

7. **Les compteurs et le filtre disent la même chose** — le nombre listé par
   « À compléter » plus les « renseignés » de la jauge doit faire le total. Une
   seule définition les sert (`estRenseigne`,
   `front/src/muscles/catalogueExercices.ts:93-94`) ; c'est la panne réparée du
   « 1319/1338 » qui contredisait sa propre liste.
8. **Catalogue vide → 0 %, jamais 100 %** ni `NaN`
   (`catalogueExercices.ts:177-189`). Règle 7 : un chiffre faux est pire qu'un
   refus.
9. **La fiche complète est chargée avant édition** — ouvrir l'éditeur puis
   enregistrer **sans rien toucher** ne doit **rien** envoyer (bouton « Aucune
   modification », désactivé). Sans ce chargement, on écrirait du vide par-dessus
   des données existantes, silencieusement
   (`front/src/composants/useEditeurExercice.ts:20-24`).
10. **Seuls les champs modifiés partent** — corriger le seul nom français doit
    produire un `PATCH` **ne contenant que `nomFr`**. Relever le corps réel de
    la requête (`front/src/muscles/editionExercice.ts:189-213`).
11. **Pas de faux changement** — ouvrir un exercice portant
    `traps, trapezius` et le refermer : le compteur doit rester à **zéro**
    (`editionExercice.ts:156-167`).
12. **Lien YouTube invalide → enregistrement bloqué** — saisir `https://exemple.fr/x`
    affiche « **Ce lien n'est pas reconnu comme une vidéo YouTube.** » et le
    bouton « Enregistrer » reste **désactivé**
    (`modaleEditeurExercice.tsx:195-199,211`). Un champ **vide** reste valide —
    vide ≠ faux (`useEditeurExercice.ts:103`).
13. **Abandon confirmé** — fermer (bouton **ou tap sur le fond**) avec des
    modifications en cours demande « **Abandonner les modifications ?** » et cite
    leur nombre ; sans modification, ça ferme sans rien demander
    (`useEditeurExercice.ts:121-124`).

### La fusion

14. **L'historique suit** — avant/après, le nombre total de `seance_exercice` et
    de `serie` est **inchangé** ; seul `exercice_id` a bougé. Le message rend les
    deux compteurs : « « X » a été remplacé par « Y » dans *n* séance(s) et *n*
    modèle(s), puis supprimé. » (`FusionExerciceProcessor.php:85-88`).
15. **Tout ou rien** — une fusion qui échoue ne laisse **aucune** modification
    partielle (`rollBack`, `:91-92`), et l'écran ne reçoit **pas** de SQL.
16. **Fusionner un exercice avec lui-même est refusé** — 422 « Les deux
    exercices sont identiques. » (`:48-50`). L'écran désactive déjà le bouton
    (`admin-fusion.tsx:131`), mais **l'API doit refuser aussi**.
17. **Exercice inexistant → 404** (`FusionExerciceProcessor.php:45-47`).
18. **Un compte ordinaire reçoit 403** sur `POST /api/exercices/fusion`.

### Les façons de cuire

19. **Doublon refusé avant l'envoi** — retaper un libellé existant (casse et
    espaces indifférents) affiche « **Cette façon de cuire existe déjà. En
    ajouter une seconde ferait deux fournées là où il en faut une.** » et
    désactive « Ajouter » (`admin-cuissons.tsx:70-71,111-116,122`).
20. **Nouveau rang par pas de dix** (`:66-68`) ; **réordonner échange les deux
    rangs** — vérifier en base qu'aucun couple ne partage le même `ordre`
    (`:73-83`).
21. **Suppression : la conséquence est annoncée** — « Les plans déjà enregistrés
    gardent le libellé, ils sont figés. En revanche, les utilisateurs qui
    cuisaient un aliment de cette façon devront le redire au prochain plan. »
    (`:216`). Vérifier qu'une habitude visant ce mode **disparaît** au lieu de
    devenir « se mange tel quel » — une réponse fausse et muette serait pire.
22. **Écriture refusée à un compte ordinaire** — 403 sur `POST`, `PATCH` et
    `DELETE /api/mode_cuissons` ; **la lecture, elle, reste ouverte à tous**
    (`api/src/Entity/ModeCuisson.php:51-64`).

### Les comptes

23. **Refus de se bloquer soi-même** — message exact : « Tu ne peux pas
    désactiver ton propre compte : la requête suivante serait refusée, y compris
    celle qui te réactiverait. » (`api/src/Service/ProtectionDuCompte.php:40-43`).
    Un **refus**, pas une confirmation. L'écran ne propose même aucun bouton
    (`admin-utilisateurs.tsx:239-243`) : **éprouver quand même par l'API**.
24. **Refus de se supprimer soi-même** — « Tu ne peux pas supprimer ton propre
    compte depuis l'application. » (`ProtectionDuCompte.php:61-63`).
25. **Refus de bloquer ou supprimer le dernier administrateur actif** — on
    compte les **actifs**, et le test est `<= 1` et non `=== 1`, pour qu'un état
    incohérent (zéro admin actif) n'ouvre pas la porte par accident
    (`:83-98` · `ComptesController.php:296-302`). **Une cible désactivée n'est
    le dernier de personne** : un administrateur désactivé se supprime même s'il
    ne reste qu'un administrateur actif — la règle
    reçoit `cibleEstActive` depuis le 17 septembre 2026 (constat 04#12,
    `ProtectionDuCompte.php:89-98`, `ComptesController.php:151`, `:213`).
    Jusque-là, elle ne regardait que le rôle et refusait la suppression d'un
    ancien administrateur dès qu'il ne restait qu'un actif — celui qui agit.
    Déjà figé par `api/tests/Service/ProtectionDuCompteTest.php`
    (`testLeDernierAdministrateurActifEstIntouchable`,
    `testZeroAdministrateurActifNOuvrePasLaPorte`,
    `testUnAdministrateurDesactiveSeSupprimeQuandIlNeResteQuUnActif`).
26. **Réactiver ne se refuse jamais** (`ProtectionDuCompte.php:77-80`).
27. **Désactiver coupe la session en cours** — après désactivation, le jeton du
    compte visé doit être refusé **à la requête suivante** (`CompteActif` sur le
    pare-feu `api`), et `jeton_rafraichissement` doit être **vide** pour ce
    compte (`ComptesController.php:166-173`).
28. **Supprimer chiffre ce qui sera détruit** — la confirmation cite les neuf
    compteurs : « *n* séances, *n* séries, *n* modèles, *n* plans, *n*
    aliments, *n* lignes de stock, *n* objectifs, *n* compléments et *n*
    exercices personnels **seront effacés définitivement.** »
    (`admin-utilisateurs.tsx:288-295`,
    `front/src/calcul/contenuCompte.ts:25-44`). « Supprimer ? Oui / Non » sans
    chiffres n'est pas une question, c'est un piège.
29. **Aucun aliment ne survit au compte supprimé** — après suppression,
    `SELECT count(*) FROM aliment WHERE utilisateur_id = '<id>'` doit rendre
    **0**, et aucune ligne de `stock` ne doit viser un aliment disparu
    (`ComptesController.php:221-256`). C'est le critère le plus important de
    cette section. **Ses exercices personnels partent aussi** : relevés avant
    la suppression (`id`), aucun ne doit subsister après — sauf celui qu'un
    autre compte cite encore, qui reste en place plutôt que de faire échouer
    toute la suppression (`:232-255`, figé par
    `ComptesContenuTest::testLaSuppressionRetireSesExercicesPersonnelsQuePersonneNeCite`).
30. **Compte inexistant → 404**, refus métier → **422**
    (`ComptesController.php:138-140,312-315`).
31. **Invitation** — le lien n'est rendu qu'**une fois** ; la base n'en garde
    qu'une empreinte (`InvitationsController.php:159-166`). Inviter une adresse
    déjà titulaire d'un compte est refusé en nommant la personne (`:140-148`).
    Révoquer rend le lien inopérant **immédiatement**, et depuis le
    19 septembre 2026 **une invitation ACCEPTÉE se supprime aussi** — la ligne
    quitte la liste, le compte n'est pas touché (`:187-198`). Deux boutons
    distincts à l'écran, « Révoquer » et « Supprimer de la liste », parce que
    ce ne sont pas les mêmes gestes.
32. **Un lien mort ne dit pas pourquoi** — jeton inconnu, déjà utilisé ou périmé
    donnent le **même** 404 et le même texte : « Ce lien n'est plus valable.
    Demande une nouvelle invitation. » (`:224`, `:254`, `:369-374`).

## Comment l'éprouver

**Deux comptes jetables** (skill `donnees-de-test`) : un administrateur et un
ordinaire. **Ne jamais toucher à un compte qu'on n'a pas créé** — cette fiche
est la seule qui manipule des comptes, c'est celle où cette règle coûte le plus
cher.

```bash
# LE CRITÈRE 3, EN UNE PASSE : un compte ordinaire doit recevoir 403 partout
for r in "GET /api/comptes" "GET /api/invitations" "GET /api/docs" \
         "POST /api/exercices" "POST /api/exercices/fusion" "POST /api/mode_cuissons"; do
  m=${r% *}; u=${r#* }
  printf '%-34s %s\n' "$r" "$(curl -s -o /dev/null -w '%{http_code}' -X "$m" \
    "http://localhost:8080$u" -H "Authorization: Bearer $JETON_ORDINAIRE" \
    -H 'Content-Type: application/ld+json' -d '{}')"
done
# attendu : 403 partout

# et sans aucun jeton, la liste des invitations doit être 401 (pas 200)
curl -s -o /dev/null -w 'sans jeton %{http_code}\n' http://localhost:8080/api/invitations

# LES DEUX REFUS, par l'API — l'écran ne propose pas le geste
curl -s -X POST "http://localhost:8080/api/comptes/$MON_ID/actif" \
  -H "Authorization: Bearer $JETON_ADMIN" -H 'Content-Type: application/json' \
  -d '{"actif":false}'     # 422 + « Tu ne peux pas désactiver ton propre compte… »
```

```bash
# l'inventaire de la surface, côté tests — DANS LE CONTENEUR
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit --filter SurfaceAdministration'
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit --filter ProtectionDuCompte'
```

```sql
-- FUSION : l'historique doit être conservé, en nombre
SELECT count(*) FROM seance_exercice;      -- identique avant / après
SELECT count(*) FROM serie;                -- identique avant / après

-- DÉSACTIVATION : les jetons doivent avoir disparu
SELECT count(*) FROM jeton_rafraichissement WHERE utilisateur_id = :cible;   -- 0

-- SUPPRESSION : aucun aliment ne survit au compte
SELECT count(*) FROM aliment WHERE utilisateur_id = '<id>';                  -- 0
-- ni ses exercices personnels : relever leurs id AVANT (cree_par passe à NULL)
SELECT id FROM exercice WHERE cree_par = '<id>' AND NOT public;              -- avant
SELECT count(*) FROM exercice WHERE id IN (<ids relevés>);                   -- après : 0

-- CUISSONS : deux modes ne partagent jamais un rang
SELECT ordre, count(*) FROM mode_cuisson GROUP BY ordre HAVING count(*) > 1; -- 0 ligne
```

**Pièges propres à cette fonctionnalité**

- **Ne jamais éprouver la suppression de compte sur autre chose qu'un compte
  jetable créé pour l'épreuve.** Rien ne se restaure sans une sauvegarde
  (`ComptesController.php:32-35`).
- **Un 403 attendu n'est pas une panne** : sur cette fiche, le 403 *est* le
  résultat. Ce qui serait une panne, c'est un **200**.
- **Le portier fait qu'aucune requête ne part** (critère 2) : chercher des 403
  dans l'onglet réseau d'un compte ordinaire et n'en trouver aucun est le
  **succès**, pas un échec d'épreuve.
- `ComptesController` porte son garde **sur la classe** (`:47`),
  `InvitationsController` **sur chaque méthode** (`:91,139,202`). Une lecture qui
  ne regarde qu'un niveau déclarerait l'autre sans protection —
  `SurfaceAdministrationTest:347-379` lit les deux.
- **La fusion est définitive** : la faire sur deux exercices jetables, jamais sur
  le catalogue réel de la base de développement.
- **Ne pas lancer `bin/phpunit` depuis l'hôte** : le PHP de l'hôte n'a ni `dom`,
  ni `mbstring`, ni `xmlwriter`. Toujours `docker exec fitcarnet-app-dev`.

## La capture pour la démonstration

`presentation/captures/administration/` — reprend la **bobine 8** de
`presentation/demonstration.md` (~3 min), **état de départ : session
administrateur**.

| Fichier | Déroulé | Durée | Ce qu'on doit voir |
|---|---|---|---|
| `01-catalogue.webm` | Compte → **Gestion des exercices**, défiler, en ouvrir un | 60 s | les compteurs et la jauge, les six filtres, puis l'éditeur avec ses puces |
| `02-fusion.webm` | **Fusionner des exercices** → deux doublons → la confirmation | 40 s | « Correspondances probables » avec leur pourcentage, puis « Ton historique est conservé, mais l'opération est définitive. » |
| `03-cuissons.webm` | **Façons de cuire** → ajouter un mode → le remonter | 25 s | l'avertissement sur la fournée partagée, et l'échange de rangs |
| `04-comptes.webm` | **Inviter quelqu'un** → « Comptes » → désactiver un compte, réactiver | 30 s | les neuf compteurs « *n* séances · *n* séries · *n* modèles · *n* plans · *n* aliments · *n* lignes de stock · *n* objectifs · *n* compléments · *n* exercices personnels », et la pastille « Désactivé » |
| `05-refus.webm` *(hors bobine 8)* | son propre compte dans la liste | 15 s | « C'est ton compte. Rien à faire ici : un administrateur ne peut ni se désactiver ni se supprimer lui-même. » |

**Ce qui n'est PAS tournable en l'état** : la prise **8.2 du plan de tournage**
(« Créer un exercice, enregistrer »). **Aucun écran de l'application ne crée
d'exercice** — il n'existe pas de hook de création dans
`front/src/api/hooks/referentiels.ts`, et un `POST` par l'API produirait de
toute façon un exercice **privé**, invisible des autres comptes
(`api/src/State/ExerciceProcessor.php:60-66`). Le signaler à l'auteur du plan
plutôt que de mettre en scène un geste impossible.

**Impasse connue du plan** : la source **Grocy** (B11 à B13) n'est tournable que
si `GROCY_URL` est renseigné sur l'instance filmée ; sinon l'écran affiche
« Grocy n'est pas configuré côté serveur ».

## Limites connues

- **`SurfaceAdministrationTest` lit des ATTRIBUTS, pas des réponses HTTP**
  (`:34-38`). Il prouve que le garde est **écrit**, pas que Symfony le fait
  respecter — le projet ne lève pas de noyau dans sa suite de tests. **C'est
  exactement pourquoi le critère 3 doit être éprouvé par `curl` sur
  l'application qui tourne**, et pas seulement par `bin/phpunit`.
- **Non vérifié ici** : le comportement de l'invitation de bout en bout jusqu'à
  la création du compte (le lien ouvert dans un navigateur sans session). Le
  contrôleur est lu, le parcours réel ne l'est pas.
- **Non vérifié ici** : l'envoi du lien par la feuille de partage **Android**
  (`Share.share`, `admin-utilisateurs.tsx:79`). Sur le web c'est le
  presse-papiers du navigateur, qui n'a pas le même comportement — passer par
  `verification-android`.
- **Non vérifié ici** : le nombre réel d'exercices, de traduits et de vidéos —
  les compteurs ont été lus dans le code, pas recomptés en base.
- `presentation/features.md` (section H, datée du 14 septembre) est **périmée
  sur cette fonctionnalité** : elle annonce un filtre « **Les miens** » qui
  s'appelle aujourd'hui « **Ajoutés dans l'app** », et **six de ses renvois
  pointent hors fichier**. **Les numéros qui suivent sont volontairement
  reproduits FAUX** — ce sont ceux de `features.md`, pas les miens : ne pas les
  « corriger », c'est précisément le défaut qu'ils documentent.
  - `admin-exercices.tsx` aux lignes **235, 256, 259, 489 et 540**, alors que ce
    fichier n'en compte plus que **195** depuis le découpage du 15 septembre
    2026 (son contenu est parti dans `modaleEditeurExercice.tsx`,
    `useEditeurExercice.ts` et `editionExercice.ts`) ;
  - `FusionExerciceProcessor.php` à la ligne **173**, pour un fichier de **108**
    lignes.

  Ses deux renvois `ProtectionDuCompte.php:158` et `:207`, eux aussi hors
  fichier, ont été recalés le 17 septembre 2026 avec ceux qui visent
  `ComptesController.php` et `admin-utilisateurs.tsx`.

  Se fier à cette fiche, et non à ces renvois.
