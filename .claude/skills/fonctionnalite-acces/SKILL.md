---
name: fonctionnalite-acces
description: Entrer dans fitcarnet et y rester — connexion par adresse et mot de passe, aucune inscription libre, invitation par lien à usage unique, création du mot de passe, portier sur toutes les routes, session JWT + jeton de rafraîchissement révocable, limitation des tentatives, compte désactivé, déconnexion et fin de session propre. À charger avec `epreuve-fonctionnalite` pour éprouver et filmer la bobine 1.
---

# Entrer, et rester

## Le besoin

fitcarnet porte ce que quelqu'un mange et ce qu'il soulève. **Personne ne doit y
entrer sans avoir été invité, et personne ne doit voir les données d'un autre.**
Il n'y a pas de page d'inscription : on ouvre un compte parce qu'un
administrateur a envoyé un lien, pas parce qu'on a trouvé l'adresse du site.

Symétriquement, l'application est utilisée **en salle de sport, une main moite,
un réseau qui passe mal**. Elle ne doit donc ni redemander un mot de passe toutes
les heures, ni rester bloquée sur un rond qui tourne quand le serveur se tait, ni
enfermer quelqu'un dans une session qu'elle ne sait plus servir.

Deux exigences opposées, et c'est là toute la difficulté : **une session longue
qu'on peut couper à tout instant**. Le JWT est court parce qu'il ne se révoque
pas ; ce qui tient la session, c'est un jeton de rafraîchissement gardé en base,
donc révocable — par une déconnexion, un changement de mot de passe, ou la
désactivation du compte.

## Ce que l'application propose

| Capacité | Où | `fichier:ligne` |
|---|---|---|
| **Connexion par adresse et mot de passe** — champs `Adresse e-mail` et `Mot de passe` | écran Connexion | `front/app/connexion.tsx:39`, `:45` |
| **Bouton éteint tant qu'un champ est vide**, libellé `Connexion…` pendant l'attente | idem | `connexion.tsx:60`, `:63` |
| **Le message du serveur s'affiche tel quel** | idem | `connexion.tsx:52-55` |
| **Aucune inscription libre** — « Les comptes sont créés par l'administrateur. » | idem | `connexion.tsx:68` |
| **Aiguillage au lancement** — le coffre est lu, puis Séances ou Connexion | racine | `front/app/index.tsx:12`, `:18` |
| **Portier sur toutes les routes** — trois exceptions seulement : connexion, invitation, racine | racine | `front/app/_layout.tsx:142-150` |
| **« Je ne sais pas encore » n'est pas un refus** — `useConnecte` rend trois valeurs | — | `front/src/api/session.ts:16-44`, `_layout.tsx:148` |
| **Rien ne s'affiche plutôt qu'un écran qu'on va quitter** | racine | `_layout.tsx:177-179` |
| **L'application démarre même si le coffre jette** (navigation privée, stockage refusé) | — | `_layout.tsx:112-122`, `front/src/api/client.ts:56-62`, `session.ts:32` |
| **Invitation créée par un administrateur**, et par lui seul | `POST /api/invitations` | `api/src/Controller/InvitationsController.php:138-139` |
| **Valable 7 jours** | — | `api/src/Service/Invitation.php:21`, `:194-197` |
| **À usage unique** — `accepte_le IS NULL` dans la transaction | — | `InvitationsController.php:316-321` |
| **Révocable**, immédiatement | `DELETE /api/invitations/{id}` | `InvitationsController.php:201-218` |
| **Le serveur n'en garde qu'une empreinte SHA-256** | — | `Invitation.php:55-58`, `InvitationsController.php:173`, `:347-352` |
| **Même message pour un lien inconnu, périmé ou déjà utilisé** | — | `Invitation.php:175-191`, `InvitationsController.php:379-384` |
| **Une nouvelle invitation remplace celle qui attendait** | — | `InvitationsController.php:163-179` |
| **Refus d'inviter une adresse qui a déjà un compte** | — | `InvitationsController.php:151-157` |
| **Refus des domaines impossibles** (sans point, RFC 2606/6761) | — | `Invitation.php:109-125` |
| **L'adresse est affichée, jamais saisie** — elle vient de l'invitation | écran Invitation | `front/app/invitation/[jeton].tsx:96`, `InvitationsController.php:290` |
| **Mot de passe : 10 caractères minimum**, comptés en caractères | idem | `Invitation.php:24`, `:211-214`, `invitation/[jeton].tsx:10` |
| **Divergence signalée seulement une fois la confirmation commencée** | idem | `invitation/[jeton].tsx:83`, `:131` |
| **Pas de connexion automatique après création** | idem | `invitation/[jeton].tsx:66-77` |
| **JWT d'une heure**, volontairement court car non révocable | API | `api/config/packages/lexik_jwt_authentication.yaml:9` |
| **Jeton de rafraîchissement révocable**, 90 jours glissants, stocké en SHA-256 | API | `api/src/Service/JetonsRafraichissement.php:44`, `:59-71`, `:219-222` |
| **Il voyage dans le corps, jamais dans l'URL** | — | `api/src/Controller/SessionController.php:103-115` |
| **Purge des jetons expirés** au passage d'un rafraîchissement | — | `JetonsRafraichissement.php:212-217`, `SessionController.php:73` |
| **Déconnexion côté serveur** — 204 même sur un jeton inconnu | `POST /api/deconnexion` | `SessionController.php:92-101` |
| **Fin de session propre** — mémoire **et** disque vidés, dans cet ordre | — | `front/src/api/persistance.ts:121-124`, `_layout.tsx:161-165` |
| **Limitation des tentatives** — 5 par quart d'heure, plus un compteur global par IP | API | `api/config/packages/security.yaml:39-41` |
| **Un compte désactivé est bloqué à la requête suivante** | API | `api/src/Security/CompteActif.php:56-63`, `security.yaml:96` |
| **Refus de prolonger la session d'un compte désactivé**, même message qu'un jeton inconnu | — | `SessionController.php:69-71` |
| **La désactivation supprime aussi les jetons de rafraîchissement** | — | `api/src/Controller/ComptesController.php:154-161` |
| **Voir et couper une session précise** | `GET`/`DELETE /api/mes-sessions` | `api/src/Controller/MesSessionsController.php:67-83`, `:96-108` |
| **Le serveur ne répond pas → on le dit** (30 s) | tous les écrans | `client.ts:220`, `:363-371` |
| **« Se déconnecter » reste accessible dans les trois états** | onglet Compte | `front/src/composants/cadreCompte.tsx:64-68` |

### Les deux comportements éprouvés le 15 septembre 2026

**1. Un serveur qui accepte sans répondre ne fige plus l'application.**
`fetch` n'a aucun délai par défaut, et ce client n'en posait aucun : une
connexion acceptée puis muette — proxy inverse bloqué, NAS en veille, Wi-Fi
captif — laissait la promesse en suspens pour toujours. Chaque écran restait sur
son rond qui tourne, sans erreur et sans « Réessayer », puisque React Query
attendait encore la première réponse.

Le délai de garde vaut **30 000 ms** (`client.ts:220`) et le message est, au
caractère près (`client.ts:368-370`) :

> **Le serveur ne répond pas (plus de 30 s) : `<adresse>`. Réessaie dans un
> instant ; si ça dure, vérifie ta connexion et que le serveur est bien allumé.**

Trois précisions qui comptent :

- **le corps est lu dans le même délai** (`client.ts:244-251`) : un `fetch` résout
  dès les en-têtes, et annuler le minuteur là laissait `text()` attendre sans
  limite ;
- **le renouvellement passe par là aussi** (`client.ts:266`) — `uneSeuleFois` fait
  attendre toutes les requêtes derrière un seul `/jeton/rafraichir`, qui muet les
  figeait toutes d'un coup ;
- **le message ne désigne pas de coupable** : sur Android, un serveur éteint ne
  lève aucune erreur réseau et finit ici comme un serveur qui s'est tu. Il est
  distinct de « Serveur injoignable : … » (`client.ts:374-380`).

Côté serveur, les appels à Grocy sont bornés à **20 s** (`api/src/Service/FrigoGrocy.php:77`)
pour que l'API réponde toujours avant ce délai-ci, et rende le vrai diagnostic.

**2. La porte de sortie ne se ferme jamais.** `compte.tsx` retournait son écran
d'erreur par un `return` précoce, et son bouton « Se déconnecter » quarante
lignes plus bas : dès que `GET /api/moi` échouait, **la seule sortie d'une
session disparaissait de l'écran**. Le chargement enfermait autant que l'erreur.
Le cadre a été extrait dans `src/` pour être testable, et le bouton est rendu
**hors de toute condition** (`cadreCompte.tsx:64-68`) ; l'écran ne fait plus que
le câbler par un état à trois valeurs (`front/app/(onglets)/compte.tsx:32`,
`:39`). Témoin : `front/src/composants/cadreCompte.test-rendu.tsx:46-74`.

## Le parcours

**Compte requis** : un ordinaire pour la connexion ; **un administrateur** pour
créer l'invitation. **Données de départ** : aucune.

### A. Se connecter

1. L'écran porte le titre **`fitcarnet`** et le sous-titre **« Tes séances et tes
   repas, au même endroit. »** (`connexion.tsx:33-36`).
2. Champs **`Adresse e-mail`** (marque-page `prenom@exemple.fr`) et
   **`Mot de passe`**. Le bouton **`Se connecter`** est éteint tant que l'un des
   deux est vide (`connexion.tsx:60`).
3. Pendant l'appel il affiche **`Connexion…`** ; en cas de refus, le message du
   serveur s'affiche en rouge au-dessus (`connexion.tsx:52-55`).
4. En bas, en petit : **« Les comptes sont créés par l'administrateur. »**
5. Au succès, on arrive sur **`/(onglets)/seances`** (`connexion.tsx:20`).

### B. Inviter

1. Onglet **Compte** → **« Inviter quelqu'un »** — visible seulement pour un
   administrateur (`compte.tsx:83`, `:95-97`). L'en-tête de l'écran est
   **« Inviter quelqu'un »** (`_layout.tsx:214`).
2. Champ **`Adresse électronique`**, puis bouton **`Créer le lien`** →
   **`Création…`** (`front/app/admin-utilisateurs.tsx:117`, `:130`).
3. La carte du lien apparaît : **« Lien pour `<adresse>` »**, le lien
   sélectionnable, un bouton **`Envoyer le lien`** (mobile) ou **`Copier le lien`**
   (web) qui passe à **`Envoyé ✓`**, et l'avertissement
   (`admin-utilisateurs.tsx:156-161`) :

   > **Valable `7` jours. Il ne sera plus affiché après cet écran : le serveur
   > n'en garde qu'une empreinte, comme un mot de passe. Perdu, il suffit de
   > réinviter la même adresse — l'ancien lien meurt aussitôt.**

4. La liste en dessous porte une pastille par invitation : **`Compte créé`**,
   **`En attente`**, **`Périmée`** (`admin-utilisateurs.tsx:306-316`), et pour
   une invitation en attente **« Invitée le `11 août`, valable jusqu'au `18 août`. »**
5. **`Révoquer`** demande confirmation : *« Le lien cesse de fonctionner
   immédiatement, même s'il a déjà été transmis. Aucun compte n'est supprimé :
   cette invitation n'en a pas encore créé. »* (`admin-utilisateurs.tsx:276`).

### C. Créer son compte depuis le lien

1. Le lien ouvre `/invitation/<jeton>`, **sans compte** — le seul écran dans ce
   cas (`_layout.tsx:143`, `security.yaml:70-72`). Pas de flèche de retour :
   il n'y a rien derrière (`_layout.tsx:218-221`).
2. **« Vérification du lien… »** (`invitation/[jeton].tsx:45`) pendant l'appel à
   `GET /api/invitation/{jeton}`.
3. **Lien mort** → titre **« Ce lien n'est plus valable »**, puis *« Il a
   peut-être déjà servi, ou il a passé sa date. Demande une nouvelle invitation —
   c'est l'affaire de quelques secondes pour la personne qui t'a invité. »* et un
   bouton **`Aller à la connexion`** (`invitation/[jeton].tsx:47-61`).
4. **Lien vivant** → **« Bienvenue sur fitcarnet »**, puis *« Ton compte sera créé
   pour `<adresse>`. Choisis un nom et un mot de passe : personne d'autre ne les
   verra. »* — **l'adresse est affichée, pas saisie** (`:96`).
5. Trois champs : **`Ton nom`**, **`Mot de passe`**, **`Répète-le`**. Sous le mot
   de passe : *« 10 caractères au minimum. Ni majuscule ni chiffre imposés : une
   phrase dont tu te souviens vaut mieux qu'un « Motdepasse1! » noté sur un
   papier. »* (`:117-121`), qui **passe en couleur vive** dès que la saisie est
   trop courte (`:79`, `:117`).
6. **« Les deux ne sont pas identiques. »** n'apparaît qu'une fois la
   confirmation commencée (`:83`, `:131`).
7. **`Créer mon compte`** → **`Création…`** → écran **« Ton compte est prêt »** :
   *« Connecte-toi avec `<adresse>` et le mot de passe que tu viens de
   choisir. »* et un bouton **`Se connecter`**. **Aucune connexion automatique**
   (`:66-77`).

### D. Tenir et terminer la session

- La connexion rend `token` **et** `jetonRafraichissement`, ajouté par un
  écouteur greffé sur Lexik (`api/src/EventListener/AjouterJetonRafraichissement.php:36`).
- Les deux jetons vont au coffre : `expo-secure-store` en natif, `localStorage`
  sur le web (`client.ts:64-93`). **Le cache est purgé AVANT l'appel de connexion**
  (`front/src/api/hooks/auth.ts:36`).
- Un 401 déclenche un renouvellement et **un seul rejeu** (`client.ts:303-314`).
- **`Se déconnecter`** (`cadreCompte.tsx:66-68`) prévient le serveur, efface les
  deux jetons, puis purge mémoire **et** disque (`auth.ts:59-80`).
- Une session morte ramène à la connexion et vide les deux caches
  (`_layout.tsx:159-170`).

## Critères d'acceptation

1. **Connexion valide → onglet Séances.** En base, une ligne de plus dans
   `jeton_rafraichissement` pour ce compte, et **jamais le jeton en clair** :
   la colonne porte une empreinte SHA-256 (`JetonsRafraichissement.php:61-66`,
   `:219-222`).
2. **Champ vide → bouton éteint**, aucun appel réseau (`connexion.tsx:60`,
   `:17`).
3. **Mot de passe faux → refus, et le refus n'apprend rien.** Le message doit
   être **le même** pour une adresse inconnue et pour un mot de passe faux — sinon
   il devient un annuaire de comptes. Le texte vient de Symfony, en français
   (`api/config/packages/translation.yaml:12`) ; le repli côté client est
   « Identifiants incorrects. » et ne s'applique qu'aux appels `sansJeton`
   (`client.ts:479-483`).
4. **Aucune inscription libre**, et aucun chemin détourné : `POST /api/utilisateurs`
   exige `ROLE_ADMIN` (`api/src/Entity/Utilisateur.php:31`), et un compte créé
   sans mot de passe est refusé (`api/src/State/UtilisateurProcessor.php:87-91`).
5. **Portier : `/(onglets)/frigo` tapé à la main sans session renvoie à la
   connexion** (`_layout.tsx:147-150`), et l'écran protégé **ne s'affiche pas une
   fraction de seconde** ni ne lance ses requêtes (`:177-179`).
6. **Une lecture de coffre impossible ne bloque pas le démarrage.** En navigation
   privée ou stockage refusé, l'application arrive sur la connexion — jamais un
   écran de chargement indéfini (`_layout.tsx:120-122`, `session.ts:32`).
   Témoin : `client.test.ts:554`.
7. **Un lien d'invitation vivant affiche l'adresse de l'invitation**, et le
   serveur ignore toute adresse envoyée par le formulaire
   (`InvitationsController.php:290`).
8. **Refus : lien inconnu, périmé, ou déjà utilisé → 404, même corps, même
   écran.** « Ce lien n'est plus valable. Demande une nouvelle invitation. »
   (`InvitationsController.php:379-384`). **Aucun des trois cas ne doit se
   distinguer** — ni par le texte, ni par le code HTTP, ni par le temps de
   réponse. Témoins : `InvitationTest.php:135`, `:151`, `:166`.
9. **Mot de passe de 9 caractères → refus**, avec « Le mot de passe doit faire au
   moins 10 caractères. » (`InvitationsController.php:283-288`) ; et 10
   caractères **accentués** passent — on compte les caractères, pas les octets
   (`Invitation.php:211-214`, témoin `InvitationTest.php:181`).
10. **Une invitation ne sert qu'une fois.** Rejouer le même lien après création
    donne le lien mort, et **aucun second compte** n'apparaît en base
    (`InvitationsController.php:316-325`).
11. **Réinviter la même adresse tue l'ancien lien.** L'ancien doit répondre lien
    mort immédiatement après (`InvitationsController.php:165-167`).
12. **Révoquer une invitation en attente la fait disparaître** et son lien cesse
    de fonctionner ; révoquer une invitation déjà acceptée est refusé —
    « Rien à révoquer : cette invitation n'existe pas, ou elle a déjà été
    acceptée. » en 404 (`InvitationsController.php:210-215`).
13. **Le jeton n'est jamais relisible.** `GET /api/invitations` ne porte que
    `id`, `email`, dates, `nomInvite`, `statut` — jamais l'empreinte ni le jeton
    (`InvitationsController.php:110-122`).
14. **Isolation (règle 2) : le compte créé par invitation part de zéro.** Frigo
    vide, aucune séance, aucun objectif — et il ne voit jamais rien d'un autre
    compte. C'est le critère qui se filme (bobine 1.3).
15. **JWT expiré → renouvellement transparent, une seule fois.** L'écran ne doit
    afficher aucune erreur, et une seule requête `/jeton/rafraichir` doit partir
    même si dix requêtes attendent (`client.ts:272-273`, `:303-314`).
16. **Jeton de rafraîchissement révoqué → retour à la connexion, caches vidés.**
    Après une déconnexion depuis un autre appareil, la requête suivante doit
    ramener à `/connexion`, et **aucune donnée du compte ne doit rester** :
    ni en mémoire, ni dans `fitcarnet-cache-v1` (`renouvellement.ts:64-70`,
    `persistance.ts:121-124`).
17. **Une coupure réseau ne déconnecte pas.** Seuls « plus de jeton » et « le
    serveur refuse celui qu'on a » terminent la session ; un 503 ou un tunnel de
    métro non (`renouvellement.ts:52-56`, `:64-70`, `:77`).
18. **Refus : compte désactivé.** À la connexion, « Ce compte est désactivé.
    Demande à l'administrateur de le réactiver. » (`CompteActif.php:59-61`) ;
    une session déjà ouverte tombe **à la requête suivante**, pas à l'expiration
    du JWT (`security.yaml:96`) ; et `POST /api/jeton/rafraichir` répond 401
    « Session expiree, reconnecte-toi. » — **le même message qu'un jeton
    inconnu** (`SessionController.php:69-71`). Témoins :
    `CompteActifTest.php:30`, `:43`.
19. **La désactivation coupe les sessions ouvertes** : plus aucune ligne dans
    `jeton_rafraichissement` pour ce compte (`ComptesController.php:154-161`).
20. **Refus : trop de tentatives.** Six essais faux en moins d'un quart d'heure
    sur le même couple adresse+IP doivent être refusés par le serveur, sans
    atteindre la vérification du mot de passe (`security.yaml:39-41`).
21. **Un mot de passe ne touche jamais le disque.** Aucune mutation n'est
    persistée, `useConnexion` et l'acceptation d'invitation comprises
    (`persistance.ts:79`). Vérifiable : `fitcarnet-cache-v1` ne doit contenir
    aucun `motDePasse`.
22. **Le serveur ne répond pas → message en 30 s, jamais un écran figé**
    (`client.ts:363-371`). Témoins : `client.test.ts:699`, `:744`.
23. **Onglet Compte en erreur OU en attente → « Se déconnecter » présent et
    agissant** (`cadreCompte.tsx:64-68`). Et l'inverse tient aussi : le contenu du
    compte **ne s'affiche pas** tant qu'il n'a pas été reçu — pas de nom en tiret
    présenté comme un fait (règle 7). Témoin :
    `cadreCompte.test-rendu.tsx:52-74`, `:99-122`.
24. **Couper une session qui n'est pas la sienne est refusé sans le dire** :
    `DELETE /api/mes-sessions/{id}` répond « Cette session n'existe pas. » aussi
    bien pour un identifiant inconnu que pour celui d'un autre compte
    (`MesSessionsController.php:110-118`, `JetonsRafraichissement.php:190-203`).
    Témoins : `MesSessionsProprieteTest.php:111`, `:132`.

## Comment l'éprouver

**Web par défaut.** Prépare comme le dit `epreuve-fonctionnalite` (conteneurs,
`/api/etat`, `rattraper-dev.sh`, bundle reconstruit) :

```bash
docker ps --format '{{.Names}}\t{{.Status}}'
curl -s http://localhost:8080/api/etat            # {"ok":true}
"$(git rev-parse --show-toplevel)"/db/manuel/rattraper-dev.sh
npm --prefix "$(git rev-parse --show-toplevel)"/front run build:web
```

**Deux comptes jetables**, créés comme le dit `donnees-de-test` — un ordinaire et
un **administrateur** (`roles` à `'ROLE_ADMIN'`), sans quoi l'écran d'invitation
est inatteignable.

**Le geste, pas l'appel.** Sur React Native Web, `type()` puis un **clic** : la
touche « Entrée » ne soumet rien (`presentation/tournage/verifier-ecrans.mjs`).

**Ce que la base doit dire :**

```bash
# l'invitation : une empreinte, jamais un jeton
docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -c \
  "SELECT email, length(jeton_empreinte) AS empreinte, expire_le, accepte_le
     FROM invitation ORDER BY cree_le DESC LIMIT 5;"

# les sessions ouvertes d'un compte
docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -c \
  "SELECT j.cree_le, j.expire_le, j.vu_le FROM jeton_rafraichissement j
     JOIN utilisateur u ON u.id = j.utilisateur_id
    WHERE u.email = 'acces-verif@test.local';"
```

`length(jeton_empreinte)` doit valoir **64** — un SHA-256 en hexadécimal. Une
valeur plus courte, ou lisible, signerait un jeton stocké en clair.

**Éprouver l'API seule** (utile pour les refus, qui se filment mal) :

```bash
BASE=http://localhost:8080/api
# lien mort : inconnu, périmé et déjà utilisé doivent rendre le MÊME corps
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/invitation/jetonQuiNExistePasDuTout123456"
curl -s "$BASE/invitation/<jeton déjà utilisé>"

# refus de prolonger une session révoquée
curl -s -X POST "$BASE/jeton/rafraichir" -H 'Content-Type: application/json' \
  -d '{"jetonRafraichissement":"inexistant"}'
# → {"detail":"Session expiree, reconnecte-toi."}  (sans accents : voulu)
```

**Pièges propres à cette fonctionnalité :**

- **Le lien d'invitation n'existe qu'une fois.** Il n'est **pas** relisible dans
  la liste : le copier au moment où il s'affiche, ou réinviter.
  `DEFAULT_URI` décide de son domaine (`InvitationsController.php:69`) — en
  développement il peut donc pointer ailleurs que `localhost:8080` ; dans ce cas,
  ne recopier que la partie `/invitation/<jeton>`.
- **Le jeton d'invitation doit faire 20 à 100 caractères de `[A-Za-z0-9_-]`**
  pour seulement atteindre le contrôleur (`InvitationsController.php:237`) :
  un jeton bricolé plus court donne un 404 de **routage**, pas le lien mort qu'on
  croit éprouver.
- **Les adresses en `@test.local` sont refusées à l'invitation** — `.local` est
  réservé (`Invitation.php:118`). Pour éprouver l'invitation, il faut donc une
  adresse d'un domaine plausible, et **la supprimer ensuite** ; le suffixe de
  `donnees-de-test` ne s'applique qu'aux comptes créés en SQL.
- **La limitation des tentatives est portée par le pare-feu, pas par le code du
  projet.** Après l'avoir éprouvée, le compteur reste posé un quart d'heure : ne
  pas enchaîner sur un scénario de connexion avec le même couple adresse+IP.
- **Simuler un serveur muet** (critère 22) : un serveur **éteint** ne le prouve
  pas — il donne « Serveur injoignable ». Il faut un serveur qui **accepte puis se
  tait** ; `docker pause fitcarnet-app-dev` (puis `docker unpause`) est la piste
  la plus directe, **non jouée ici** : la vérifier avant de la présenter comme le
  protocole. À défaut, les témoins `client.test.ts:698-816` couvrent les cinq cas
  au niveau du client.
- **Un JWT dure une heure** : éprouver le renouvellement en attendant n'est pas
  raisonnable. Passer par la révocation du jeton de rafraîchissement (critère 16),
  qui donne le même chemin de code en quelques secondes.

## La capture pour la démonstration

Reprend la **bobine 1** de `presentation/demonstration.md` (« On arrive »,
~2 min), et lui ajoute un scénario pour les deux comportements du 15 septembre.

`presentation/captures/acces/01-invitation.webm` — **~1 min 15**
: session **administrateur**. Onglet **Compte** — montrer que les boutons
d'administration n'existent que là. **« Inviter quelqu'un »** → saisir une
adresse → **`Créer le lien`**. S'arrêter sur la carte du lien et **laisser lire**
« Valable 7 jours. Il ne sera plus affiché après cet écran : le serveur n'en
garde qu'une empreinte, comme un mot de passe. »
*Ce qu'on dit* : « Un compte fitcarnet ne se crée pas tout seul. Un
administrateur fabrique un lien à usage unique — et le serveur lui-même ne sait
plus le relire ensuite. »

`presentation/captures/acces/02-rejoindre.webm` — **~1 min**
: navigateur privé, ouvrir le lien. Montrer **« Vérification du lien… »**, puis
l'écran **« Bienvenue sur fitcarnet »** avec **l'adresse déjà remplie**. Taper un
mot de passe trop court pour faire **passer l'aide en couleur vive**, le
compléter, taper une confirmation différente pour faire apparaître **« Les deux
ne sont pas identiques. »**, corriger, valider. Finir sur **« Ton compte est
prêt »**, se connecter, et **ouvrir l'onglet Mon frigo, vide**.
*Ce qu'on dit* : « Elle choisit son nom et son mot de passe — l'administrateur ne
les connaîtra jamais. Et son frigo est vide : chaque compte part de zéro et ne
verra jamais les données d'un autre. »

`presentation/captures/acces/03-lien-mort.webm` — **~30 s**
: côté administrateur, créer une seconde invitation puis la **révoquer** — laisser
lire la confirmation. Ouvrir le lien révoqué : **« Ce lien n'est plus valable »**.
*Ce qu'on dit* : « Un lien qui n'a pas servi se révoque. Et qu'il soit révoqué,
périmé, déjà utilisé ou inventé, l'écran dit exactement la même chose : un refus
n'a pas à renseigner celui qui insiste. »

`presentation/captures/acces/04-session.webm` — **~40 s**
: onglet **Compte**, **`Se déconnecter`**, puis retour immédiat sur la connexion.
Taper `/(onglets)/frigo` dans la barre d'adresse : on repart sur la connexion.
*Ce qu'on dit* : « La déconnexion prévient le serveur — le jeton est détruit en
base, pas seulement sur le téléphone — et le cache local part avec. Et l'adresse
d'un écran tapée à la main ne mène nulle part sans session. »

Le dossier `presentation/captures/` est ignoré par git : on versionne la matière,
pas les vidéos.

## Limites connues

- **Aucun écran ne change de mot de passe ni d'adresse.** La règle existe et
  fonctionne côté API — mot de passe actuel exigé, toutes les sessions révoquées
  (`UtilisateurProcessor.php:93-95`, `:105-116`) — mais **rien dans `front/` ne
  l'appelle** : aucune occurrence de `motDePasseActuel` ni de `/utilisateurs/`
  dans `front/src` ni `front/app` au 16 septembre 2026. Cela ne s'éprouve donc
  que par `PATCH /api/utilisateurs/{id}`, et **ne se filme pas**. Voir
  `fonctionnalite-compte`.
- **`GET /api/mes-sessions` n'a aucun consommateur côté front** non plus. Les
  routes, les tests et la colonne `vu_le` existent ; l'écran qui listerait les
  sessions n'existe pas. « Voir ses sessions » ne se démontre qu'au `curl`.
- **Le texte du refus après cinq tentatives n'est écrit nulle part dans le
  dépôt** : il vient du catalogue de Symfony, rendu en français par
  `translation.yaml:12`. `api/translations/` est vide. Relever le texte exact à
  l'épreuve plutôt que de l'annoncer.
- **Aucun courriel n'est envoyé, et c'est une décision** (`InvitationsController.php:35-41`) :
  pas de SMTP, donc pas de panne muette. Le lien se transmet à la main.
- **`Invitation::domaineAccepteDuCourrier()` n'a aucun appelant** dans l'API
  (`Invitation.php:140-160`) — zone d'ombre relevée en section K de
  `presentation/features.md`, toujours vraie. La vérification DNS ne tourne donc
  jamais ; seul `domaineImpossible` bloque.
- **Le jeton de rafraîchissement n'est pas remplacé à chaque usage**
  (`JetonsRafraichissement.php:73-81`) : la rotation détecterait un vol, au prix
  d'une déconnexion définitive à chaque réponse perdue. Assumé.
- **Un échec d'écriture du coffre est avalé sur le web** (`client.ts:74-79`) : la
  session ne survivra pas au rechargement, et **l'utilisateur n'en est pas
  averti**. Noté dans le code comme méritant un mot à l'écran (règle 7), non
  tranché.
- **`presentation/features.md` (14 septembre) annonce un jeton de
  rafraîchissement « d'un an »** ; le code dit **90 jours** depuis le
  14 septembre (`JetonsRafraichissement.php:44`, constat M-02). Les lignes de
  cette fiche ont été relues le **16 septembre 2026**.
