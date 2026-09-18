---
name: fonctionnalite-compte
description: Son compte et ses réglages — voir son nom, son adresse et l'origine de ses ingrédients, changer son mot de passe ou son adresse (mot de passe actuel exigé, toutes les sessions révoquées), choisir sa sonnerie de fin de repos, savoir quelle version tourne et chercher une mise à jour, et l'accès à l'administration réservé aux administrateurs. À charger avec `epreuve-fonctionnalite` pour éprouver et filmer l'onglet Compte.
---

# Mon compte et mes réglages

## Le besoin

L'onglet Compte est **l'endroit où l'on s'occupe de l'application elle-même**,
par opposition aux quatre autres où l'on s'occupe de sa nutrition et de ses
séances. On y va rarement — quelques fois par an pour certaines de ses lignes —
et presque toujours pour une de ces quatre raisons :

- **vérifier qui on est** : le bon compte, la bonne adresse, et d'où viennent ses
  ingrédients (la base de l'application, ou Grocy) ;
- **changer son mot de passe**, en général parce qu'on soupçonne qu'il a fuité —
  auquel cas le changer doit **fermer les portes ouvertes**, sinon le geste ne
  sert à rien ;
- **régler ce qui tient à l'appareil** : la sonnerie qui marque la fin d'un repos,
  qui dépend du téléphone et de son volume, pas de qui s'y connecte ;
- **savoir ce qui tourne** quand quelque chose ne va pas : quelle version, quel
  serveur, répond-il — et un bouton pour aller chercher un correctif.

La règle 7 pèse lourd ici : **un écran de compte qui affiche une information
fausse calmement est pire qu'un écran en erreur.** Une panne réseau a déjà fait
afficher un nom remplacé par un tiret et « Gérés dans l'onglet Mon frigo » comme
un fait, alors que rien n'avait été reçu.

## Ce que l'application propose

| Capacité | Où | `fichier:ligne` |
|---|---|---|
| **Voir son nom et son adresse**, sous l'étiquette `Compte` | onglet Compte | `front/app/(onglets)/compte.tsx:42-44` |
| **Voir l'origine de ses ingrédients** — « Synchronisés depuis Grocy » ou « Gérés dans l'onglet « Mon frigo » » | idem | `compte.tsx:48-53` |
| **Une route qui ne peut rendre que soi** — `GET /api/moi`, six champs écrits à la main | API | `api/src/Controller/MoiController.php:80-95` |
| **Écran en erreur plutôt qu'écran faux** — le contenu ne s'affiche que reçu | idem | `front/src/composants/cadreCompte.tsx:56-62`, `compte.tsx:32` |
| **« Se déconnecter » dans les trois états**, hors de toute condition | idem | `cadreCompte.tsx:64-68` |
| **Changer son mot de passe ou son adresse** — mot de passe actuel exigé | **API seulement** | `api/src/State/UtilisateurProcessor.php:93-95`, `:128-147` |
| **L'administrateur en est dispensé sur autrui, jamais sur lui-même** | idem | `UtilisateurProcessor.php:132-136` |
| **Toutes les sessions révoquées** au changement de mot de passe, la courante comprise | idem | `UtilisateurProcessor.php:105-116` |
| **Cinq sonneries de fin de repos**, jouées au toucher | écran Réglages | `front/app/reglages.tsx:29-47`, `front/src/composants/sonnerie.ts:33-64` |
| **Réglage propre à l'appareil** — « Ce choix est enregistré sur cet appareil. » | idem | `reglages.tsx:54-57`, `sonnerie.ts:69`, `:85-89` |
| **Réécouter la sonnerie choisie** | idem | `reglages.tsx:50-52` |
| **Quelle version tourne, et le serveur répond-il** — résumé sur une ligne | encart replié | `front/src/composants/etatMaj.tsx:164-166` |
| **Pastille d'état du serveur**, avec le mot à côté de la couleur | idem | `etatMaj.tsx:176-192` |
| **`/api/etat` public, et rien d'autre** — ni version, ni base, ni nom de serveur | API | `api/src/Controller/EtatController.php:40-44`, `etatMaj.tsx:99` |
| **« Chercher une mise à jour » pour tout le monde**, détails techniques réservés à l'admin | idem | `etatMaj.tsx:241-245`, `:194-219` |
| **Sur le web, le panneau se tait** sur les mises à jour | idem | `etatMaj.tsx:123`, `:220-225` |
| **Bandeau de nouvelle version** (APK), une seule vérification au démarrage | haut de l'onglet | `front/src/composants/bandeauMaj.tsx:37-48`, `compte.tsx:75` |
| **Accès à l'administration, visible seulement pour un administrateur** | bas de l'onglet | `compte.tsx:83-99` |
| **Et inatteignable même en tapant l'adresse** | racine | `front/app/_layout.tsx:75-100` |

### Les quatre boutons d'administration

Rendus **uniquement** si `roles` contient `ROLE_ADMIN` (`compte.tsx:83`), sous
l'étiquette **`Administration`** : **`Gestion des exercices`**,
**`Fusionner des exercices`**, **`Façons de cuire`**, **`Inviter quelqu'un`**
(`compte.tsx:85-97`).

**Un lien caché ne protège rien** — sur le web on tape l'adresse. Trois barrières
se superposent, et il faut savoir laquelle prouve quoi :

1. le lien conditionné au rôle (`compte.tsx:83`) — **confort** ;
2. le portier `PortierAdmin`, qui refuse de monter tout écran dont le segment
   commence par `admin-` (`_layout.tsx:85-97`) — **confort**, mais en un seul
   endroit au lieu de quatre gardes recopiées ;
3. **la vraie protection : l'API**, où les dix-huit portes d'administration sont
   fermées par `#[IsGranted('ROLE_ADMIN')]` ou par `security:` dans leur
   `#[ApiResource]`, avec l'inventaire vérifié dans les deux sens par
   `api/tests/Security/SurfaceAdministrationTest.php` (`_layout.tsx:63-69`).

`moi.isPending` veut dire « je ne sais pas encore », **jamais « non »** :
rediriger pendant la lecture renverrait l'administrateur hors de ses propres
écrans à chaque démarrage à froid (`_layout.tsx:71-74`, `:89`).

## Le parcours

**Compte requis** : ordinaire pour tout, **administrateur** pour la section
Administration. **Données de départ** : aucune.

1. Onglet **Compte** (`front/app/(onglets)/_layout.tsx:63-69`). L'écran se monte
   dans un cadre à trois états — `attente`, `erreur`, `pret` (`compte.tsx:32`).
2. Carte du haut : étiquette **`COMPTE`**, le **nom** en gros, l'**adresse** en
   dessous ; puis un séparateur, l'étiquette **`MES INGRÉDIENTS`** et
   **« Gérés dans l'onglet « Mon frigo » »** — ou **« Synchronisés depuis Grocy »**
   si `sourceFrigo` vaut `grocy` (`compte.tsx:41-53`).
3. Bouton **`Mes objectifs par repas`** (voir `fonctionnalite-objectifs`), puis
   l'encart replié **`Compléments alimentaires`** (même fiche).
4. Bouton **`Réglages de l'app`** → écran dont l'en-tête est
   **« Réglages de l'app »** (`front/app/_layout.tsx:210`) :
   - étiquette **`SONNERIE DE FIN DE REPOS`**, puis *« Touche une ligne pour
     l'entendre. Le téléphone vibre en plus du son, pour les séances où il reste
     dans la poche. »* (`reglages.tsx:23-27`) ;
   - **cinq lignes**, chacune avec son libellé et sa description
     (`sonnerie.ts:33-64`) :

     | Libellé | Description |
     |---|---|
     | `Bois` | trois lames de marimba qui montent — chaud et bref |
     | `Rappel` | trois groupes de deux notes — pour la salle, par-dessus la musique |
     | `Harpe` | cinq notes pincées ascendantes — présente sans presser |
     | `Cloche` | un coup, longue résonance — le plus calme |
     | `Gong` | grave et long — ne dérange personne autour |

   - **toucher une ligne la choisit ET la joue** (`reglages.tsx:35`) ; la ligne
     active porte un **`✓`** et une bordure vive (`:44`, `:75`) ;
   - bouton **`Réécouter la sonnerie choisie`**, puis *« Ce choix est enregistré
     sur cet appareil. Un autre téléphone gardera le sien. »* (`:50-57`).
   - Le défaut est **`bois`** (`sonnerie.ts:67`).
5. De retour sur Compte : l'encart **`Version de l'application`**, **replié**,
   dont le résumé porte les deux seules choses utiles au quotidien —
   **`<version d'exécution>` · `serveur en ligne`** (ou `serveur hors ligne`, ou
   `vérification…`) (`etatMaj.tsx:152-168`). Sur le web, la version affichée est
   littéralement **`web`** (`:164`).
6. Déplié, pour **tout le monde** : la ligne **`Serveur`** avec sa pastille et son
   mot (`etatMaj.tsx:176-192`), et le bouton **`Chercher une mise à jour`** →
   **`Patiente…`** (`:241-245`). Ses réponses s'affichent en dessous
   (`:250-252`) : **`Recherche…`**, puis **`Tu es déjà à jour.`** ou
   **`Mise à jour trouvée, téléchargement…`** → **`Redémarrage…`** (`:129-139`).
   Une erreur est montrée **telle quelle**, pas remplacée par « une erreur est
   survenue » (`:141-147`).
7. Pour un **administrateur seulement** : l'adresse de l'API en clair (`:194`),
   les quatre lignes de diagnostic — `Application`, `Version d'exécution`,
   `Canal`, `Paquet JavaScript`, et `Publié le` le cas échéant (`:197-217`) — et
   le bouton **`Retester le serveur`** (`:234-238`).
8. **Sur le web**, à la place des diagnostics : *« Version web : le code vient du
   serveur à chaque chargement, il n'y a rien à mettre à jour ici. »* — et le
   bouton « Chercher une mise à jour » **n'existe pas** (`:123`, `:220-225`).
9. Tout en bas, pour un administrateur, l'étiquette **`ADMINISTRATION`** et ses
   quatre boutons (`compte.tsx:83-99`). Voir `fonctionnalite-administration`.
10. Et sous tout cela, **toujours**, le bouton **`Se déconnecter`**
    (`cadreCompte.tsx:66-68`). Voir `fonctionnalite-acces`.

### Changer son mot de passe ou son adresse

**Il n'y a pas d'écran.** La capacité existe et est complète côté serveur, mais
aucun composant de `front/` ne l'appelle (voir *Limites connues*). Le chemin réel
est `PATCH /api/utilisateurs/{id}`, autorisé par
`security: "is_granted('ROLE_ADMIN') or object == user"`
(`api/src/Entity/Utilisateur.php:33`), et le processeur fait trois choses dans cet
ordre (`UtilisateurProcessor.php:61-119`) :

1. **exiger le mot de passe actuel** dès qu'on change le mot de passe **ou**
   l'adresse (`:93-95`). Sans cette règle, un jeton volé pendant une heure
   suffisait à prendre le compte définitivement : un `PATCH` posait une nouvelle
   adresse **et** un nouveau mot de passe, et le propriétaire ne pouvait plus se
   connecter avec les siens ;
2. **hacher**, puis oublier le clair (`:97-101`) ;
3. **révoquer toutes les sessions**, la courante comprise, et **après** la
   persistance seulement, par `JetonsRafraichissement::revoquerTout`
   (`:105-116`).

Deux refus, avec leurs textes exacts :

- **« Indique ton mot de passe actuel pour changer ton mot de passe ou ton
  adresse. »** — 422 (`:138-142`) ;
- **« Mot de passe actuel incorrect. »** — accès refusé (`:144-146`).

La comparaison se fait contre **l'ancien hachage** (`$precedent`), jamais contre
l'objet déjà désérialisé — sans quoi on validerait le nouveau mot de passe contre
lui-même (`:124-126`).

## Critères d'acceptation

1. **Le nom et l'adresse affichés sont ceux du compte connecté**, et viennent de
   `GET /api/moi` — une route qui ne peut rendre qu'une personne
   (`MoiController.php:82-95`). Avec deux comptes en base, l'administrateur doit
   voir **son** nom : c'est la panne du 14 août 2026, où `/api/utilisateurs` puis
   `[0]` lui montrait quelqu'un d'autre.
2. **`roles` contient `ROLE_USER`** même pour un administrateur : il est ajouté
   par `getRoles()` (`Utilisateur.php:140-143`, `MoiController.php:91`). Un écran
   qui cherche `ROLE_USER` doit le trouver.
3. **L'origine des ingrédients est celle du compte** : « Gérés dans l'onglet
   « Mon frigo » » pour `sourceFrigo = base`, « Synchronisés depuis Grocy » pour
   `grocy` (`compte.tsx:50-52`).
4. **Refus d'inventer (règle 7) : en attente ou en erreur, le contenu du compte
   ne s'affiche pas.** Pas de nom en tiret, pas de « Gérés dans l'onglet Mon
   frigo » présenté comme un fait (`cadreCompte.tsx:56-62`). Témoin :
   `front/src/composants/cadreCompte.test-rendu.tsx:99-122`.
5. **« Se déconnecter » est présent et agit dans les trois états** — attente,
   erreur, prêt (`cadreCompte.tsx:64-68`). Témoin :
   `cadreCompte.test-rendu.tsx:52-74`.
6. **L'erreur s'affiche avec un bouton `Réessayer` qui refait l'appel**
   (`compte.tsx:38`, `front/src/composants/base.tsx:134`). Témoin :
   `cadreCompte.test-rendu.tsx:76-97`.
7. **Cinq sonneries, pas quatre ni six**, et chacune se joue **au toucher**
   (`sonnerie.ts:33-64`, `reglages.tsx:35`). Le choix coche la ligne touchée et
   décoche la précédente.
8. **Le réglage tient à l'appareil, pas au compte.** Il est écrit dans le coffre
   sous `fitcarnet.sonnerie` (`sonnerie.ts:69`, `:85-89`) et **ne part jamais à
   l'API** : aucune requête ne doit être émise au changement de sonnerie, et la
   base ne doit porter aucune colonne de sonnerie. Se déconnecter et se
   reconnecter **sur le même appareil** conserve le choix ; un autre appareil
   garde le sien.
9. **Un réglage inconnu ou absent retombe sur `bois`**, jamais sur un écran sans
   sélection (`sonnerie.ts:78`).
10. **Le résumé de l'encart version ne commence jamais par un point médian
    orphelin.** Sur le web, `Updates.runtimeVersion` vaut la **chaîne vide**, pas
    `null` : c'est `||` et non `??` qui la rattrape (`etatMaj.tsx:164`). Le résumé
    doit se lire **`web  ·  serveur en ligne`**.
11. **La pastille dit l'état du serveur, et le mot est à côté de la couleur**
    (`etatMaj.tsx:178-191`) : une couleur seule ne dit rien à qui ne distingue pas
    le vert du rouge.
12. **`/api/etat` ne rend que `{"ok":true}`**, sans authentification et sans rien
    d'autre — ni version, ni nom de serveur, ni état de la base
    (`EtatController.php:40-44`). C'est un critère de **refus de divulguer** :
    tout champ supplémentaire serait offert au premier venu.
13. **Une réponse ≥ 500 compte comme « hors ligne », un 401 non**
    (`etatMaj.tsx:100`) : la question posée est « le serveur est-il là », pas
    « ai-je le droit ».
14. **Sur le web, le panneau se tait sur les mises à jour** : pas de bouton
    « Chercher une mise à jour », et pour l'admin la phrase « Version web : le
    code vient du serveur à chaque chargement, il n'y a rien à mettre à jour
    ici. » (`etatMaj.tsx:123`, `:220-225`). **Mais le panneau reste visible** —
    le faire disparaître avait fait chercher un problème de cache pendant dix
    minutes (`:109-119`).
15. **Le bouton de mise à jour est pour tout le monde, les diagnostics pour
    l'admin.** Un compte ordinaire voit la version, l'état du serveur, le bouton
    et son message ; il ne voit **ni l'adresse de l'API, ni le canal, ni
    l'identifiant du paquet** (`etatMaj.tsx:194`, `:195`, `:234`, `:241`).
16. **« Déjà à jour » est une réponse, pas un silence** : appuyer doit toujours
    produire un message (`etatMaj.tsx:132`, `:250-252`).
17. **L'administration n'apparaît que pour un administrateur** (`compte.tsx:83`),
    **et taper `/admin-utilisateurs` à la main ne monte pas l'écran** pour un
    compte ordinaire : il est renvoyé sur l'onglet Compte, et **aucune requête
    `/api/invitations` ni `/api/comptes` ne doit partir** (`front/app/_layout.tsx:88-97`).
    C'est vérifiable dans l'onglet réseau : zéro 403.
18. **Refus : changer son mot de passe sans donner l'actuel → 422** avec « Indique
    ton mot de passe actuel pour changer ton mot de passe ou ton adresse. »
    (`UtilisateurProcessor.php:138-142`). Idem pour un changement d'adresse seul.
19. **Refus : mot de passe actuel faux → accès refusé**, « Mot de passe actuel
    incorrect. » (`:144-146`), et **rien n'est écrit** en base.
20. **Un changement de mot de passe révoque toutes les sessions.** Après le
    `PATCH`, `SELECT count(*) FROM jeton_rafraichissement` pour ce compte doit
    valoir **0**, la session qui a fait le changement comprise, et l'ancien jeton
    de rafraîchissement doit être refusé (`UtilisateurProcessor.php:115`).
21. **Un administrateur est dispensé du mot de passe actuel sur autrui, jamais
    sur lui-même** (`:132-136`) : le même `PATCH` sur son propre compte doit
    exiger le mot de passe.
22. **Isolation (règle 2) : un compte ordinaire ne peut lire que lui-même.**
    `GET /api/utilisateurs` répond 403 (`Utilisateur.php:30`) ;
    `GET /api/utilisateurs/{id}` d'un autre compte est refusé (`:29`) ; et
    `GET /api/moi` ne peut structurellement rendre que le porteur du jeton.
23. **`actif` ne se change pas par cette route.** Il est en lecture seule dans la
    ressource (`Utilisateur.php:92-109`) : un `PATCH {"actif": false}` sur son
    propre compte ne doit **pas** se verrouiller soi-même. Le seul chemin est
    `POST /api/comptes/{id}/actif`, réservé à l'administrateur.

## Comment l'éprouver

**Web par défaut**, mais **la sonnerie se juge sur Android** : sur le web, le
fichier se joue dans l'onglet et rien ne prouve ni la vibration, ni le
comportement écran verrouillé. Voir la skill `verification-android`.

```bash
docker ps --format '{{.Names}}\t{{.Status}}'
curl -s http://localhost:8080/api/etat            # {"ok":true}
"$(git rev-parse --show-toplevel)"/db/manuel/rattraper-dev.sh
npm --prefix "$(git rev-parse --show-toplevel)"/front run build:web
```

**Deux comptes jetables** (`donnees-de-test`) : un ordinaire et un
administrateur, pour éprouver le critère 17 dans les deux sens. Pour le critère 3,
un troisième compte avec `source_frigo = 'grocy'` — **en lecture seule**, voir
`fonctionnalite-frigo-grocy` avant d'écrire quoi que ce soit.

**Le changement de mot de passe ne se fait qu'au `curl`** (il n'a pas d'écran) :

```bash
BASE=http://localhost:8080/api
ID=$(curl -s -H "Authorization: Bearer $JETON" $BASE/moi \
     | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

# refus attendu : pas de mot de passe actuel
curl -s -X PATCH "$BASE/utilisateurs/$ID" \
  -H "Authorization: Bearer $JETON" \
  -H 'Content-Type: application/merge-patch+json' \
  -d '{"motDePasseClair":"nouveauMotDePasse2026"}'

# accepté : avec le mot de passe actuel
curl -s -X PATCH "$BASE/utilisateurs/$ID" \
  -H "Authorization: Bearer $JETON" \
  -H 'Content-Type: application/merge-patch+json' \
  -d '{"motDePasseClair":"nouveauMotDePasse2026","motDePasseActuel":"MotDePasseTest123!"}'
```

**Ce que la base doit dire** — le critère 20 se prouve ici, pas à l'écran :

```bash
docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -c \
  "SELECT count(*) AS sessions FROM jeton_rafraichissement j
     JOIN utilisateur u ON u.id = j.utilisateur_id
    WHERE u.email = 'compte-verif@test.local';"
```

**Pièges propres à cet écran :**

- **`isPending` et non `isLoading`.** Tant que `useConnecte` lit le coffre,
  `useMoi` est désactivé : rien ne part sur le réseau, donc `isFetching` est faux,
  donc `isLoading` **aussi** — et l'écran passait ses gardes avec `data` indéfini
  (`compte.tsx:23-31`, `front/src/api/hooks/auth.ts:133-141`). Si un jour l'écran
  affiche un tiret, c'est là qu'il faut regarder.
- **L'encart version est replié par défaut** (`etatMaj.tsx:48`) : le déplier avant
  de conclure qu'une ligne manque.
- **`Updates.isEnabled` est faux en développement**, comme sur le web
  (`etatMaj.tsx:121-123`) : le bouton « Chercher une mise à jour » **n'apparaît
  pas** sous Metro. Le critère 16 ne s'éprouve que sur un **APK**.
- **Le bandeau de nouvelle version ne s'affiche jamais en dév** : il exige
  `EXPO_PUBLIC_MAJ_URL` et une version publiée supérieure
  (`bandeauMaj.tsx:37-48`). Ne pas le chercher, ne pas le promettre à l'image.
- **Ne pas confondre les deux encarts** : `BandeauMaj` parle d'un **APK à
  installer** (`compte.tsx:75`), `EtatMaj` de ce qui **tourne aujourd'hui** et des
  mises à jour JavaScript (`compte.tsx:81`).
- **La sonnerie reste en mémoire une fois lue** (`sonnerie.ts:72-83`) : pour
  éprouver la relecture depuis le coffre, il faut **recharger la page** ou
  relancer l'application, pas seulement changer d'écran.
- **Le compte administrateur est aussi celui dont le frigo peut être sur Grocy**
  (`api/src/Command/CreerUtilisateurCommand.php:67`) : sur un compte de
  démonstration, ne pas passer `--grocy` si l'on veut montrer « Gérés dans
  l'onglet « Mon frigo » ».

## La capture pour la démonstration

Complète la **bobine 2** de `presentation/demonstration.md` (« On règle ses
objectifs »), dont les points 2.1 et 2.4 relèvent de cette fiche — les objectifs
eux-mêmes sont dans `fonctionnalite-objectifs`.

`presentation/captures/compte/01-mon-compte.webm` — **~25 s**
: onglet **Compte**. S'arrêter sur la carte du haut : le nom, l'adresse, et
**`MES INGRÉDIENTS`**. Faire défiler lentement jusqu'en bas pour montrer
**`Se déconnecter`**.
*Ce qu'on dit* : « Ici, ce qui appartient à l'utilisateur : qui il est, d'où
viennent ses ingrédients, ses objectifs, ses réglages. Et la sortie, toujours au
même endroit. »

`presentation/captures/compte/02-sonnerie.webm` — **~35 s** — **à filmer sur
Android**
: **`Réglages de l'app`**, puis **toucher trois sonneries l'une après l'autre**
en laissant chacune se jouer. Finir sur **`Réécouter la sonnerie choisie`** et la
phrase « Ce choix est enregistré sur cet appareil. »
*Ce qu'on dit* : « Cinq sonneries, qu'on entend en les choisissant — parce qu'un
nom de sonnerie ne dit rien. Et c'est un réglage de téléphone : il ne suit pas le
compte, il reste sur l'appareil qui sonne. »
*Note de tournage* : le son doit être **capté**. `adb shell screenrecord`
n'enregistre pas l'audio (voir `verification-android`) : prévoir une prise
externe, ou annoncer à l'oral ce qu'on entend.

`presentation/captures/compte/03-version.webm` — **~30 s**
: déplier **`Version de l'application`**. Montrer la **pastille verte** et
`serveur en ligne`, puis appuyer sur **`Chercher une mise à jour`** et laisser
lire **`Tu es déjà à jour.`**
*Ce qu'on dit* : « Les mises à jour arrivent toutes seules, et c'est confortable
tant que ça marche. Le jour où ça ne marche plus, il faut pouvoir demander — et
obtenir une réponse, même quand la réponse est « il n'y a rien ». »
*Impasse connue* : sur le web ce bouton n'existe pas ; ce plan se tourne sur
l'APK.

`presentation/captures/compte/04-administration.webm` — **~20 s**
: bas de l'onglet Compte sur une session **administrateur** — l'étiquette
`ADMINISTRATION` et ses quatre boutons — puis **la même vue sur un compte
ordinaire**, où la section n'existe pas.
*Ce qu'on dit* : « Un administrateur a quatre écrans de plus. Pour tous les
autres, ils n'existent pas — et pas seulement à l'écran : les portes sont fermées
côté serveur, taper l'adresse ne mène nulle part. »

Le dossier `presentation/captures/` est ignoré par git : on versionne la matière,
pas les vidéos.

## Limites connues

- ~~**Le changement de mot de passe n'a AUCUN écran.**~~ **Levée le 18 septembre
  2026**, et cette fiche l'a su un jour plus tard que sa jumelle
  `fonctionnalite-acces` — le genre d'oubli que cette fiche est censée
  attraper.

  `front/app/mot-de-passe.tsx` existe, accessible depuis l'onglet Compte par le
  bouton **« Changer mon mot de passe »**, et par le bandeau d'avertissement qui
  coiffe tous les écrans quand le mot de passe ne suit plus les règles. Trois
  champs — actuel, nouveau, confirmation —, une jauge qui nomme ce qui manque
  (`front/src/composants/jaugeMotDePasse.tsx`), et un panneau de fin.

  **CE QU'IL FAUT SAVOIR POUR LE FILMER** : un changement réussi **révoque
  toutes les sessions du compte, y compris celle qui le fait**. C'est délibéré —
  un jeton de rafraîchissement volé ne doit pas survivre au changement qu'il a
  motivé. L'écran l'annonce et propose de se reconnecter ; ne pas prendre cette
  déconnexion pour un échec de la démonstration.

  **L'ADRESSE, ELLE, NE SE CHANGE TOUJOURS PAR AUCUN ÉCRAN.** La capacité existe
  côté API (`UtilisateurProcessor`, mot de passe actuel exigé) et ne s'éprouve
  qu'au `curl`. C'est ce qui reste de cette limite.

- **Le drapeau « mot de passe faible » ne se voit qu'après une connexion.** Il
  est posé par `AjouterJetonRafraichissement`, seul moment où le serveur tient
  le mot de passe en clair — une empreinte ne se relit pas pour savoir si elle
  contenait une majuscule. Conséquence pour qui veut filmer le bandeau : le
  poser en base puis se connecter le remet à sa vraie valeur. Il faut un compte
  dont le mot de passe est **réellement** faible.
  `presentation/demonstration.md` marquait cette fonctionnalité `✗` — « l'API
  sait faire, aucun écran ne l'appelle » ; c'est corrigé depuis le 19 septembre
  2026, elle se démontre.
- **Voir et couper ses sessions n'a pas d'écran non plus.**
  `GET`/`DELETE /api/mes-sessions` existent, sont testées
  (`api/tests/Controller/MesSessionsProprieteTest.php`), et la colonne `vu_le`
  est renseignée — mais rien dans `front/` ne les appelle. C'était pourtant « la
  vraie réponse » au constat M-02 (`MesSessionsController.php:20-28`).
- **Le panneau de version ne répare rien**, et c'est assumé : il rend l'invisible
  lisible (`etatMaj.tsx:12-38`). Le seul geste qu'il offre est de chercher une
  mise à jour.
- **Aucun réglage d'application n'est synchronisé entre appareils.** La sonnerie
  est le seul réglage existant, et il est **volontairement** local
  (`reglages.tsx:6-12`). Si un second réglage apparaît un jour, la question se
  reposera.
- **La vibration n'est pas réglable** : elle accompagne toujours le son
  (`reglages.tsx:24-27`). Voir `fonctionnalite-minuteur`.
- **`/api/etat` répond même si la base est tombée**, et c'est voulu : la pastille
  dit « le serveur est joignable », pas « tout va bien »
  (`EtatController.php:33-36`). Ne pas la présenter comme un état de santé
  complet.
- **Les objectifs, les compléments et les quatre écrans d'administration sont
  atteints depuis cet onglet mais couverts ailleurs** :
  `fonctionnalite-objectifs` et `fonctionnalite-administration`. La déconnexion
  et la session sont dans `fonctionnalite-acces`.
- **`presentation/features.md` est daté du 14 septembre 2026** et ses
  `fichier:ligne` de la section A ne correspondent plus au code (`compte.tsx:17`,
  `:30`, `reglages.tsx:29`, `etatMaj.tsx:109`, `:125`, `EtatController.php:259`
  pour un fichier de 45 lignes). Les lignes de cette fiche ont été relues le
  **16 septembre 2026**.
