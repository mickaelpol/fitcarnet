# Où on en est — reprendre le travail

Journal de bord du chantier en cours. À lire au début d'une session sur une
machine qui n'a pas suivi les précédentes, **et à tenir à jour** : c'est le seul
endroit qui dit ce que ni le code ni les commits ne racontent — les décisions
prises, ce qui attend un arbitrage, et par quoi continuer.

**Dernière mise à jour : 15 septembre 2026, tard** — **les 84 constats de
l'audit sont traités, les huit lots clos**. Les trois agents de contrôle ont
été lancés sur l'ensemble et ont trouvé trois choses qu'aucun test ne voyait
(voir plus bas). L'application est éprouvée dans un vrai navigateur, écran par
écran, et contre le vrai Grocy. Le dossier de présentation client est prêt ; il
ne reste qu'à tourner les vidéos.

---

## L'essentiel en cinq lignes

Un audit complet a relevé **84 constats** (3 critiques, 15 élevés). **Les huit
lots sont terminés** — garde-fous, ce qui était cassé, les chiffres faux, la
sécurité et l'isolation, la base reproductible, les scripts dangereux,
l'architecture front, les tests du client HTTP, et le lot 8 dans ses vingt
constats.

État : **564 tests front** (562 + 2 de rendu) · **231 API · 617 assertions**, 7 erreurs PHPStan
connues (il y en avait 8), `verifier-schema.sh` et `verifier-migrations.sh` au
vert, `master` synchronisé. Tout est dans
[docs/audit-2026-09/](docs/audit-2026-09/README.md), avec un tableau d'avancement.

En parallèle, un **dossier de présentation** est monté de bout en bout dans
`presentation/` : complet et utilisable, il ne reste qu'à tourner les vidéos
(voir « Le chantier présentation » plus bas).

`master` synchronisé sur Gitea.

---

## Ce que la journée du 14 septembre a changé

**Le lot 3 — sécurité et isolation — est clos.** C3 : l'isolation entre comptes
n'avait aucun test, elle en a 18, chacun **vu échouer** en cassant le code qu'il
protège. É8 : les exercices « personnels » le sont vraiment (`FiltreExercice`,
règle « public **OU** le mien »). M-01, M-03 : faits. M-02 : **complet depuis le
15 septembre** — la fenêtre était passée à 90 jours glissants, et la *visibilité*
existe désormais : `GET /api/mes-sessions`, `DELETE /api/mes-sessions/{id}`, avec
un 404 identique pour « n'existe pas » et « pas à toi ».

**Le lot 4 — base reproductible — est clos.** `verifier-schema.sh` disait 280
lignes d'écart entre base neuve et base migrée ; il dit maintenant
« identiques ». É6 : un lot d'inventaire ne peut plus être volé à un travailleur
vivant (colonne `jeton`, migration 30). Cinq index de jointure créés, cinq
écartés avec argument.

**Trois choses trouvées en chemin, qu'aucun rapport ne mentionnait :**

- **Le critère de réussite de `verifier-schema.sh` était inatteignable.**
  `pg_dump` 17 encadre sa sortie de `\restrict <jeton>` tiré au sort à chaque
  appel : deux vidanges de la *même* base différaient toujours de deux lignes.
- **La migration 30 n'aurait été jouée nulle part.** Les trois lanceurs
  s'arrêtaient au glob `2[0-9]-*.sql` — ni `installer.sh`, ni
  `entrypoint-prod.sh`, ni `verifier-migrations.sh`, qui aurait donc annoncé que
  tout allait bien. **Toute migration numérotée 40 et au-delà retombera dans ce
  piège** : le glob se liste à la main, dans **cinq** fichiers — voir
  « Pièges vérifiés » plus bas pour la commande qui les trouve tous.
- **`doctrine:schema:validate` ne passera jamais sur ce projet**, et son échec ne
  veut rien dire : le schéma est écrit à la main, la base porte plus que les
  entités. Son `--dump-sql` propose `DROP TABLE invitation`. La proposition du
  lot 0 était mauvaise ; la skill `schema-base` porte l'avertissement.

**Une leçon, la plus utile de la journée.** En écrivant `ExerciceProcessor`,
j'ai recopié le garde `null === getCreePar()` d'`AlimentProcessor` — et donc
reproduit M-01 une heure après l'avoir lu. Un admin corrigeant un exercice du
catalogue se le serait approprié. C'est **exactement le motif dominant de
l'audit**, observé en direct : une décision juste, appliquée à un endroit et
oubliée à un autre. Les trois processeurs suivent désormais la même règle —
l'**opération** fait foi, jamais l'état du champ.

**Vérifié sur l'application réelle, pas seulement en test unitaire** : Alice voit
1 339 exercices, Bob 1 338, l'item d'Alice rend 404 pour Bob ; un PATCH admin sur
un exercice commun ne se l'approprie pas ; un inventaire déposé est traité, lot
`termine` avec son jeton, stock passé de 500 à 320 g.

---

## En arrivant : quoi taper

**1. Monter la machine** — [NOUVELLE-MACHINE.md](NOUVELLE-MACHINE.md) en entier
si elle est neuve, sinon juste se remettre à jour :

```bash
git pull
cd front && npm install          # si package.json a bougé
docker compose -f compose.dev.yml up -d
```

**2. Vérifier qu'on part d'un socle sain.** Ces chiffres sont ceux du
15 septembre au soir ; ils ne peuvent que monter :

```bash
cd front && npm test                                                  # 562 + 2 tests, 0 echec
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'          # 231 tests, 617 assertions
db/manuel/verifier-schema.sh                                          # ✓ identiques
db/manuel/verifier-migrations.sh                                      # ✓ au vert
```

**Après tout `git pull` qui apporte une migration** :

```bash
db/manuel/rattraper-dev.sh
```

> **LE DÉVELOPPEMENT NE REJOUE JAMAIS `db/manuel/`, et c'est le piège le plus
> coûteux du projet.** `compose.dev.yml` ne monte `./db` que dans
> `docker-entrypoint-initdb.d`, que PostgreSQL ne joue qu'à la **création du
> volume**. La production, elle, guérit seule au redémarrage.
>
> Le 15 septembre 2026, l'agent de vérification bout en bout a trouvé
> `POST /api/connexion` en **HTTP 500 pour tous les comptes** : la migration 32
> n'était pas en base, l'insertion du jeton de rafraîchissement échouait, et
> **l'application était entièrement inutilisable**. Les 750 tests étaient au
> vert. Le message était un 500 opaque, jamais « il manque la migration 32 ».
>
> Le script est idempotent : le lancer sans raison ne coûte rien.

Si l'un des deux est rouge **avant** d'avoir touché à quoi que ce soit, c'est
que l'environnement est en cause, pas le code : le régler d'abord.

**3. Le premier message à donner à Claude.** Deux chantiers sont ouverts —
prends celui que tu veux, la phrase est écrite pour être collée telle quelle.

**Si tu reprends la présentation client** (le plus avancé, il ne reste qu'à
filmer) :

> Lis `REPRENDRE.md` et `presentation/plan-de-tournage.md`. Je veux tourner les
> vidéos de démonstration depuis mon téléphone sur l'application de production.
> Aide-moi à créer les deux comptes de démonstration sur le NAS, à y charger le
> jeu de données, et guide-moi bobine par bobine. Ne travaille pas sur une autre
> branche que `master` sans me le demander.

**Si tu reprends le code** — l'audit est clos, il reste du confort et des
arbitrages, listés dans « Par quoi continuer » :

> Lis `REPRENDRE.md`, puis lance les trois agents de contrôle
> (`revue-fitcarnet`, `verification-bout-en-bout`, `verite-documentaire`) en
> parallèle pour savoir où on en est vraiment. Ensuite on prendra la suite dans
> le tableau « Par quoi continuer ». En TDD. Ne travaille pas sur une autre
> branche que `master` sans me le demander.

Une précision qui évite les allers-retours, si Claude ne la prend pas de
lui-même : la skill à utiliser pour toute correction est
**`superpowers:test-driven-development`**.

**Et l'épreuve qui n'est pas dans `npm test`** — à relancer avant toute
livraison, elle ne modifie rien :

```bash
# 1. l'outillage du script — `presentation/tournage/node_modules` est gitignore,
#    donc absent d'un clone neuf, et Chromium ne s'installe pas tout seul
cd presentation/tournage && npm install && npx playwright install chromium && cd ../..

# 2. le bundle que le navigateur va vraiment charger
docker compose -f compose.dev.yml up -d
cd front && npm run build:web && cd .. && rm -rf api/front && cp -r front/dist api/front

# 3. un compte jetable — le script n'en cree AUCUN, il se contente de s'y connecter
HASH=$(docker exec fitcarnet-app-dev sh -c \
  'cd /app && bin/console security:hash-password "MotDePasseTest123!" --no-interaction' \
  | grep -oE '\$2y\$[^ ]+' | head -1)
docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -c \
  "INSERT INTO utilisateur (id, email, mot_de_passe, nom, roles, actif, cree_le)
   VALUES (gen_random_uuid(), 'ecran-verif@test.local', '$HASH',
           'Ecran Verif', 'ROLE_USER', true, now());"

# 4. l'epreuve elle-meme — elle ne modifie rien
cd presentation/tournage && node verifier-ecrans.mjs ecran-verif@test.local 'MotDePasseTest123!'

# 5. ET ON RETIRE LE COMPTE. Pas « plus tard » : maintenant.
docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -c \
  "DELETE FROM utilisateur WHERE email LIKE '%-verif@test.local';"
```

> **`api/front` est un DOUBLON de `front/dist`, et il périme en silence.** Le
> dépôt versionne `front/dist` ; le développement, lui, sert `api/front`. Un
> `npm run build:web` seul laisse donc le navigateur sur l'ancien bundle, et on
> vérifie alors très soigneusement du code qui n'est plus là. D'où la recopie
> dans la même ligne, à ne pas séparer.
>
> **L'étape 5 n'est pas de la politesse.** Le 15 septembre 2026,
> `ecran-verif@test.local` est resté en base une soirée entière parce que le
> bloc s'arrêtait à l'étape 4 — trouvé par `verite-documentaire`, pas par moi.
> Un compte oublié se met à ressembler à une donnée réelle au bout de quelques
> jours, et plus personne n'ose le supprimer. Voir la skill `donnees-de-test`.

**Pour éprouver le portier d'administration des deux côtés**, il faut un second
compte, en `ROLE_ADMIN` cette fois (même `INSERT`, `roles` à `'ROLE_ADMIN'`) :
sans lui, un contrôle qui refuserait *tout le monde* passerait pour une
correction. Attendu : `ROLE_USER` → **403** sur `/api/comptes`,
`/api/invitations` et `POST /api/exercices` mais **200** sur
`GET /api/exercices` ; `ROLE_ADMIN` → **200, 200, 201**.

**Le motif de test est désormais écrit** : `tests/Controller/InventaireProprieteTest.php`
monte un contrôleur avec ses vrais services et une seule `Connection` doublée
(`self::createStub`, pas `createMock` — `failOnNotice` refuse un mock sans
attente). Les services du projet sont `final readonly`, donc indoublables : c'est
en les instanciant pour de vrai autour d'une connexion doublée qu'on teste le
**câblage**, et le câblage est précisément ce qui manquait à É1.

**4. En repartant** : mettre ce fichier à jour, cocher le lot dans le tableau
d'avancement de l'audit, `graphify update .`, et pousser. Le prochain à ouvrir
le projet n'aura, lui non plus, que ce qui est écrit.

---

## Par quoi continuer

**L'audit est clos, ses huit lots et ses 84 constats.** Ce qui suit est du
confort ou attend un arbitrage — à une exception près, la première ligne du
tableau, qui est une clé d'API à révoquer.

| | Quoi | Effort |
|---|---|---|
| **Tourner les vidéos** | seul vrai reste. Tout le dossier de présentation est écrit, le plan de tournage aussi | voir `presentation/plan-de-tournage.md` |
| **Régénérer la clé d'API Grocy** | ⚠ **À FAIRE PAR TOI, ET VITE.** Elle a été collée dans une conversation le 15 septembre 2026 pour vérifier le pont Grocy de bout en bout. Elle est à considérer comme publiée. Grocy → Paramètres → Clés d'API → révoquer puis recréer, et reporter la nouvelle dans `.env` du NAS | 5 min |
| **`choixRatio.tsx`** | dernier morceau du lot 6, et **il était mal rangé dans l'audit** : il appartient à `editeurAliment.tsx` (section 7), pas à l'écran de séance | 1 h |
| **Le câblage non couvert** | reste du lot 7. `client.ts` a ses 22 témoins ; les hooks React restent partiellement hors de portée — `@testing-library/react` est désormais installé, la porte est ouverte | ~4 h |
| **Extraire `LigneAliment` de `carteRepas.tsx`** | le module `calcul/poidsServi.ts` est testé, mais le composant qui l'appelle ne l'est pas. L'extraire vers `src/` rendrait la ligne de repas testable comme le reste | 1 h |
| **Le second `tsconfig` des tests de rendu** | la garde qui interdisait à un test d'importer un `.tsx` a été levée pour permettre `editeurAliment.test-rendu.tsx`. Un second `tsconfig` la rendrait aux tests non-rendu, qui n'ont pas de raison d'y toucher | 1 h |
| **Publier un exercice depuis l'admin** | `Exercice.public` n'est écrit par personne : aucun mécanisme de publication n'existe. L'exposer en écriture aux seuls administrateurs est la proposition « C » de la revue, à trancher | à trancher |

---

## Ce que la journée du 15 septembre a changé

**Le lot 6 est terminé, les douze rangs.** Les trois écrans passent de 3 935 à
**1 295** lignes (655 + 445 + 195) ; `composer.ts` de **817** à 135,
`cuisson.ts` de **611** à 22, `hooks.ts` en dix modules. *Les chiffres « 1 169 »,
« 827 » et « 613 » ont figuré ici : le premier était périmé, le deuxième était
la taille de `frigo.tsx` — un chiffre transposé d'une ligne à l'autre.* **Les dix duplications D1 à D10 sont closes.**

**Six agents ont travaillé en parallèle**, sur des périmètres strictement
disjoints — c'est la condition, sans quoi ils s'écrasent. Trois ont **refusé**
une partie de leur tâche, et les trois avaient raison : sortir les props
d'`EtapeBatch` aurait donné un riz « à l'eau » sur l'écran de batch alors que
l'utilisateur l'avait mis au four (`cuissonsChoisies` est un `useState`, une
seconde instance a le sien, vide) ; ranger sept tests de cuisson les aurait fait
tomber dans le mauvais fichier ; corriger M7 aurait dépassé le mandat.

**Trois défauts trouvés qui n'étaient dans aucun rapport :**

- **Le mot de passe était écrit en clair sur le disque.** `dehydrateMutation`
  sauvegarde les `variables`, et celles de `useConnexion` sont
  `{email, motDePasse}` — tenter de se connecter hors ligne suffisait.
- **L'application ne démarrait pas en navigation privée.** `localStorage?.` ne
  protège pas d'un objet qui *lève quand on y touche* : écran de chargement
  indéfini, sans message.
- **`verifier-schema.sh` ne contrôlait plus rien depuis trois migrations.** J'avais
  étendu le glob dans trois lanceurs le 14 et oublié le quatrième. Son ✓ vert ne
  prouvait rien — et masquait une vraie divergence, de moi aussi.

**Trois agents ont été créés** — le dossier en compte cinq, les deux hexagonaux datant d'avant et restant sans objet. Les trois nouveaux sont nés de fautes réelles de la session :
`revue-fitcarnet` (les huit motifs de défaut du projet),
`verification-bout-en-bout` (543 tests au vert ne disaient pas si l'API
répondait) et `verite-documentaire` (quatre affirmations fausses trouvées par
accident en deux jours).

---

## Ce que les trois agents de contrôle ont trouvé

Lancés en parallèle sur l'ensemble du dépôt, tous les trois en lecture seule.
**Ils ont trouvé trois choses qu'aucun test unitaire ne pouvait voir**, et c'est
l'argument pour les relancer avant chaque livraison.

- **`verification-bout-en-bout` : l'application ne se connectait plus du tout.**
  `POST /api/connexion` répondait **HTTP 500 pour tous les comptes** en
  développement — la migration 32 n'était pas en base. Voir l'encadré plus haut,
  et `db/manuel/rattraper-dev.sh`, écrit pour ça.
- **`revue-fitcarnet` : le mot de passe était écrit en clair sur le disque.**
  Le cache de TanStack Query persistait aussi les **mutations**, dont le corps
  de `useConnexion`. `shouldDehydrateMutation: () => false` dans
  `src/api/persistance.ts`. Il a aussi trouvé **trois commentaires écrits le
  jour même qui mentaient déjà** (`Exercice.php`, `Aliment.php`, `texte.ts`) et
  un témoin de test qui éprouvait un scénario **impossible**.
- **`verite-documentaire` : `INSTALLATION.md` renvoyait à un fichier qui
  n'a jamais existé.**

---

## Ce que la fin du 15 septembre a changé

**La surface d'administration est fermée, des deux côtés.** Côté API, les
**18 portes** d'administration sont fermées, `POST /api/exercices` compris — un
utilisateur ne peut plus créer d'exercice.

> **Mais pas toutes de la même façon, et c'est à savoir avant d'auditer.**
> Six seulement portent un `#[IsGranted('ROLE_ADMIN')]` (`ComptesController`, au
> niveau **classe**, et `InvitationsController` ×3) ; les douze autres sont
> fermées par `security: "is_granted('ROLE_ADMIN')"` **dans l'`#[ApiResource]`**
> de l'entité ou du DTO, plus une ligne d'`access_control` pour `/api/docs`. Un
> `grep '#\[IsGranted'` pour « vérifier la surface » en manquerait les deux
> tiers et conclurait à une passoire.
>
> C'est exactement pour ça que l'inventaire est un **test** et pas une phrase :
> `api/tests/Security/SurfaceAdministrationTest.php` balaie les trois sources
> (`#[ApiResource]` de `src/Entity` et `src/Dto`, `#[Route]` de
> `src/Controller`, `access_control` de `security.yaml`) et compare **dans les
> deux sens** — une porte fermée non inscrite échoue autant qu'une porte
> inscrite rouverte. Les cinq routes volontairement sans garde y sont, chacune
> avec sa raison écrite : la dérogation muette est impossible.
Côté écran, les quatre gardes recopiés dans les `admin-*.tsx` — déjà **dans deux
orthographes différentes** — sont doublés par un **portier unique** dans
`app/_layout.tsx`, qui reconnaît un écran d'administration à son préfixe de
fichier et non à une liste. Le prochain `admin-*.tsx` naîtra protégé.

*Éprouvé pour de vrai, pas seulement en test :* avec un compte `ROLE_USER`,
`GET /api/comptes`, `GET /api/invitations` et `POST /api/exercices` répondent
**403**, `GET /api/exercices` répond **200** (le témoin — sans lui, un contrôle
qui refuse tout le monde ressemble à une correction) ; avec un compte
administrateur jetable, les mêmes routes répondent **200, 200 et 201**. Et dans
un vrai navigateur, les quatre adresses `/admin-*` tapées à la main renvoient
sur l'onglet Compte, **sans un seul 403 au réseau** — l'écran n'est plus monté
du tout, là où `admin-utilisateurs` lançait ses requêtes avant son garde.

**M7 — le 401 qui accusait l'utilisateur.** Le repli d'un 401 était
« Identifiants incorrects. » quel que soit le chemin appelé : la session
expirait, on ouvrait son frigo, et l'application faisait chercher une faute de
frappe dans un mot de passe qu'on n'avait pas tapé. Le repli distingue
désormais `/connexion` du reste (`repli()` dans `src/api/client.ts`), avec la
lecture de `security.yaml` qui le justifie écrite au-dessus.

**F2 — les deux écrans se contredisaient devant la balance.** `carteRepas.tsx`
affichait `pesé × rendement` pour **tous** les aliments, cuisson choisie ou non :
100 g de riz marqués « tel quel » s'annonçaient à 300 g. La boîte de batch
cooking, elle, disait 100 g. La règle vit maintenant dans
`src/calcul/poidsServi.ts`, testée, et un test croisé refuse que les deux
affichages divergent à nouveau.

**Les bugs latents ont été corrigés, pas classés « inatteignables ».** J'avais
écrit qu'aucun n'était atteignable ; c'était faux, et tu as eu raison
d'insister. `exercices.isError` manquait dans `app/seance/[id].tsx` : un
catalogue en échec — un tunnel de métro suffit — affichait une séance **fausse**
plutôt que pas de séance, blocs sans nom et tous en mode « charge ».
`src/muscles/gardeCatalogue.test.ts` interdit désormais l'oubli **sur tout écran
présent ou futur** qui indexe le catalogue par identifiant. Et la jauge du
catalogue vide, qui recevait `width: 'NaN%'` à la toute première installation,
vaut 0 %.

**La lecture d'une clé de repas est devenue une fonction.**
`` `${jour}|${repas}` `` s'écrivait dans `cleDuRepas` et se relisait à deux
endroits avec un `split('|')` nu — dont un `Number()` qui donnait
`libelleDuJour(NaN)` à l'écran sans que rien ne le signale. `lireLaCle()` vit
dans `src/solveur/periode.ts`, là où la clé s'écrit, et **son propre test a
attrapé que `2|R2|R3` passait**.

**L'application est vérifiée dans un vrai navigateur.**
`presentation/tournage/verifier-ecrans.mjs` pilote Chromium : il se connecte
comme un humain, visite les cinq écrans, éprouve le portier d'administration, et
rapporte **toute** erreur de console et **toute** requête en échec. Il ne
modifie rien. État actuel : tout au vert, **zéro erreur de console, zéro requête
en échec**.

> **Deux fois, ce script a été plus honnête que moi.** Son premier motif
> reconnaissait « séances » dans le slogan de la page de connexion : trois
> écrans sur cinq passaient au vert alors qu'aucun n'était atteint. Puis il a
> trouvé un `GET /api/moi` **sans jeton** sur l'écran de connexion — `useMoi`
> ne connaissait pas la session et partait sur tous les écrans. La garde est
> allée dans le hook, point de passage obligé de ses six appelants.

**Et la revue a relu le travail de la soirée, y compris mes corrections.** Elle
a trouvé onze choses, dont trois qui comptent — la plus instructive étant une
**régression que je venais d'introduire** :

- **Garder `useMoi` a cassé l'onglet Compte.** `isLoading` vaut
  `isPending && isFetching` : quand la requête est désactivée, rien ne part sur
  le réseau, donc `isFetching` est faux, donc `isLoading` **aussi**. L'écran
  passait ses deux gardes avec `data` indéfini et réaffichait le tiret et
  « Gérés dans l'onglet Mon frigo » comme un fait — c'est-à-dire exactement la
  panne que son propre commentaire déclare corrigée, revenue par la porte de
  derrière. C'est `isPending` qu'il faut lire.
- **`planFige.ts` inventait un repas.** `?? 'R1'` sur une clé illisible, dans
  un plan **persisté** : à la relecture, les compléments du matin sur une boîte
  peut-être prise le soir. Le champ est facultatif et `planRelu.tsx` sait déjà
  lire son absence — le repli honnête existait, il suffisait de ne pas le
  contourner.
- **`lireLaCle` annonçait deux découpages à la main ; il y en avait quatre**,
  dont un **vingt lignes au-dessus d'elle**, dans le fichier même. Les deux
  oubliés n'avaient en fait pas besoin de lire la clé du tout. Il n'en reste
  aucun.

Elle a aussi montré que **trois des contrôles de mon script navigateur ne
contrôlaient rien** : le motif de l'écran Modèles était satisfait par la barre
d'onglets (donc cet écran ne pouvait jamais être rapporté cassé), le contrôle
de connexion passait au vert sur un mauvais mot de passe à cause d'un `||`, et
le portier était jugé sur une absence — un chargement infini passait pour un
refus réussi. Les trois sont corrigés, et le contrôle de connexion a été
**vérifié en lui donnant un faux mot de passe**.

> **La leçon, et elle vaut pour la suite.** Sur onze défauts, sept étaient dans
> du code écrit **le jour même**, et trois dans des commentaires écrits le jour
> même. Ce n'est pas un accident de fatigue : c'est que la relecture par un
> autre regard trouve ce que l'auteur ne peut structurellement pas voir. Les
> trois agents ne sont pas une formalité d'avant-livraison.

**Le pont Grocy est vérifié de bout en bout, écriture comprise.** Lecture des
stocks, correspondance des quantités produit par produit, et une écriture réelle
sur un seul produit (Fraises, 112 → 100 → **112 restauré**) — la valeur relevée
**avant** d'écrire, comme l'exige `donnees-de-test`.

---

## Le chantier présentation — terminé, sauf le tournage

Monté du 9 au 14 septembre 2026 pour présenter fitcarnet **à un client et à une
équipe technique dans la même salle**. Tout est dans `presentation/`.

> **On versionne la matière, pas le produit** (`presentation/.gitignore`) : le
> HTML et le MP4 sont **absents d'un clone neuf**, et se régénèrent depuis les
> sources ci-dessous. Un ✅ dit ici « le travail est fait », pas « le fichier
> est sur ton disque ».

| Fichier | Ce que c'est | État |
|---|---|---|
| `fitcarnet-presentation.html` | 28 slides en quatre actes : le produit, l'architecture, les garanties, l'outillage IA. Captures embarquées, fichier autonome. **Gitignoré — à régénérer** avec `construire.py` | ✅ fait, absent d'un clone |
| `construire.py` | le génère ; **relancer après toute modification** | ✅ |
| `fitcarnet-demonstration.mp4` | 3 min 01, muette, 8 chapitres. **Gitignoré — à remonter** avec `monter-demo.sh` | ✅ fait, absent d'un clone |
| `tournage/tourner.mjs` | pilote l'application avec Playwright et enregistre en continu | ✅ |
| `monter-demo.sh` | cartons, légendes, chapitres | ✅ |
| `script-narration.md` | ce qu'il faut dire, slide par slide, vidéo minutée | ✅ |
| `features.md` | **les ~220 fonctionnalités**, avec fichier et ligne | ✅ |
| `plan-de-tournage.md` | le script de tournage en 8 bobines, pour filmer au téléphone | ✅ |

**Ce qui reste à faire**, et c'est la suite naturelle :

1. Créer les **deux comptes de démonstration sur la production** — un ordinaire,
   un administrateur. Les commandes sont dans `plan-de-tournage.md`, partie I.3.
   Sans le compte admin, les bobines 1 et 8 sont impossibles : les quatre écrans
   d'administration ne s'affichent pas pour un compte ordinaire.
2. Y charger le jeu de données (`jeu-essai.sql` puis `jeu-demo.sql`). **Relire
   l'adresse dans les `sed`** : `jeu-demo.sql` efface avant de poser. Un garde-fou
   refuse tout compte ayant déjà des séances, il faut `-v ecraser=oui` pour passer
   outre — si le message nomme un compte personnel, l'adresse est fausse.
3. **Tourner les huit bobines** avec scrcpy (installé sur Windows, pas dans WSL2 :
   WSL2 n'a aucun accès USB).
4. Remonter la vidéo à partir des prises téléphone.

**Deux choses à ne pas découvrir caméra allumée** : la source Grocy n'est
tournable que si `GROCY_URL` est renseigné sur l'instance filmée, et le **partage
d'un modèle est inopérant** (constat F-05).

**Le jeu de démonstration est un FICHIER, pas un état de la base.**
`db/manuel/jeu-demo.sql` pose neuf semaines de vie d'un compte : 14 aliments,
14 lignes de stock, 23 séances, 123 séries, 2 plans, 4 cibles, et un 1RM qui
monte de 50,7 à 63,3 kg — c'est cette courbe qui fait vivre la démonstration.

> **Il n'est PAS en base sur cette machine**, et il ne faut pas compter dessus :
> le volume `pgdata_dev` a été recréé depuis, et `demo@fitcarnet.local`
> n'existe plus. `jeu-demo.sql` n'est joué ni par `installer.sh` ni par
> `entrypoint-prod.sh` — leurs listes sont écrites à la main, et il n'y figure
> pas, volontairement. **Le remonter est une commande**, décrite dans
> `presentation/plan-de-tournage.md` (l. 98 pour le local, l. 415 pour la
> remise à zéro) ; son garde-fou refuse un compte qui a déjà des séances, sauf
> `-v ecraser=oui`.

---

## Ce que l'inventaire des fonctionnalités a mis au jour

`presentation/features.md` a été établi par exploration systématique du code —
écrans, calculs, back-end. Il recense environ **220 capacités** là où un premier
inventaire de surface en voyait 57. Il a aussi montré que **la documentation
mentait sur deux points** :

- ~~`front/src/calcul/texte.ts` n'existe pas~~ — **créé le 15 septembre 2026.**
  `sansAccent` n'a plus qu'**une** définition. **Cinq** des six copies qui
  traînaient appelaient `normalize('NFD')`, que Hermes n'implémente pas
  toujours — cinq `TypeError` en puissance. La sixième était justement la table
  manuelle de `cleDHabitude`, écrite *contre* `normalize` : c'est sur elle que
  le module s'est aligné, et non l'inverse.
- ~~`front/src/solveur/periode.ts` n'existe pas~~ — **il existe**, sorti du
  découpage de `composer.ts` (rang 6).

**Trois pistes ouvertes, à trancher un jour :**

- ~~`front/src/composants/inventaire.tsx` semble être du code mort~~ —
  **confirmé et supprimé** le 15 septembre : 187 lignes, aucun import, son
  unique export sans usage.
- `Invitation::domaineAccepteDuCourrier()` — vérification DNS complète et
  documentée — **n'a aucun appelant** dans l'API.
- **Aucun appel à OpenFoodFacts** n'existe côté back, alors que le champ
  `Aliment::source` en prévoit la valeur.

---

## Décisions prises, et pourquoi

Elles ne se déduisent ni du code ni des commits. **Ne pas les rouvrir sans
raison.**

**L'architecture hexagonale est un objectif assumé, mais n'a pas commencé.** Les
skills sont installées (`symfony-hexagonal-architecture`, `-domain-modeling`,
`-ports-adapters`, `-cqrs-handlers`). `api/src` suit toujours la structure
Symfony classique. La refonte ne doit **jamais** se mélanger à une correction de
bug dans un même commit. À noter : le domaine riche du projet — le solveur de
repas — est déjà isolé, pur et testé… côté front, en TypeScript.

**Une seule arborescence, en terminal.** Claude Cowork refuse les chemins
`\\wsl.localhost\…`, donc il n'est pas utilisable ici. Le clone Windows a été
renommé `fitcarnet.OBSOLETE-2026-09-07` et son `fitsync.sh` neutralisé. Deux
copies désynchronisées ont produit le bug critique C1.

**Le TDD n'a pas d'exception.** Chacune des dix corrections a eu son test écrit
et vu échouer d'abord. Deux fois, le test est passé du premier coup : on a alors
**remis le code fautif** pour vérifier qu'il tombait — un test qui ne peut pas
échouer ne vaut rien, et l'audit en avait trouvé douze de ce genre.

**graphify oriente, il ne remplace pas `grep`.** Deux hooks le rappellent avant
chaque recherche. Son périmètre est fixé par `.graphifyignore` : les skills
tierces en sont exclues, faute de quoi le graphe se remplit de documentation
PostgreSQL qui ne parle pas du projet.

---

## Ce qui attend une décision de ta part

~~**La table des paliers du disque RM.**~~ **Tranché le 15 septembre 2026** :
centrée sur **70-90 %**, la zone où l'on progresse — et, heureuse coïncidence,
la seule où la formule dit vrai (13 répétitions à 70 %, 3 à 90 %, plafond à 15).
Neuf paliers par pas de 2,5 %, donnant neuf cibles distinctes là où le pas de
5 % laissait quatre trous. En dessous de 70 %, la charge s'affiche et **la
prédiction disparaît** ; le seuil n'est pas écrit à la main mais dérivé de
`REPS_MAX_POUR_1RM`, pour que la table suive si le plafond bouge.

Les petites charges étaient la seconde exigence : à 20 kg de 1RM, onze paliers
ne donnaient que **cinq charges distinctes** — trois lignes disaient « 15 kg »
sans le signaler. `pasConseille` descend à 1 kg quand 2,5 kg fait tomber la zone
de travail sous cinq charges, et les paliers confondus fusionnent en une ligne
qui dit son étendue.

**Trois points restent à ton arbitrage** : 95 % et 100 % ont été retirés (le
maximum est déjà affiché au-dessus) ; l'échauffement est à 60/50/40 sans
granularité fine ; et sous 10 kg de 1RM, une ligne fusionnée peut perdre une
prédiction juste à cause d'un voisin hors domaine.

~~**Les exercices personnels**~~ — tranché le 14 septembre : filtrés pour de
vrai, règle « public OU le mien ». La conséquence — un exercice personnel mal
orthographié devenu **incorrigible**, l'administrateur ne voyant plus les
exercices privés — était le constat **F-09**, **clos depuis** :
`api/src/Entity/Exercice.php` porte
`security: "is_granted('ROLE_ADMIN') or object.getCreePar() == user"` sur le
`PATCH`. L'auteur corrige le sien, et lui seul.

---

## Deux chantiers laissés ouverts, sciemment

**É14 n'a reçu qu'un volet sur trois.** Terminer la session quand le jeton de
rafraîchissement a disparu suffit à rouvrir la porte — vérifié jusqu'à la
redirection. Les deux ceintures de sécurité restantes : le bouton de déconnexion
rendu **avant** l'écran d'erreur dans `compte.tsx` (aujourd'hui `if (isError)`
retourne l. 24, le bouton est l. 95 — donc inatteignable quand `/moi` échoue),
et le portier de `_layout.tsx`.

**Le blocage a sauté.** Elles attendaient une bibliothèque de test de
composants ; `@testing-library/react` est installé depuis le 15 septembre 2026,
et `src/composants/editeurAliment.test-rendu.tsx` montre le motif — suffixe
`.test-rendu.tsx`, seconde passe de `npm test`, `--import` de
`src/tests/environnement.js`. Il ne reste qu'à écrire les deux témoins.

~~**M1 et M4 du lot 2**~~ — **faits le 15 septembre 2026.** M1 n'était pas qu'une
duplication : en mode « glucides totaux », la cible comprend les fibres à 2 kcal/g
et non 4, si bien que **7,5 g de fibres suffisaient** à faire accuser une cible
parfaitement atteignable. M4 a reçu un seuil **relatif**, choisi après mesure de
134 860 pivots — le rapport vaut soit 0, soit ≥ 0,484, rien entre les deux.

---

**Le réseau sortant des conteneurs est cassé sur cette machine.** Ni DNS ni
routage : même vers une IP brute, `curl` rend `000` depuis `fitcarnet-app-dev`.
D'où l'échec de `composer install` dans le conteneur, contourné en installant
`vendor` depuis l'hôte (le dossier est monté). C'est du NAT Docker sous WSL2,
pas le dépôt — **réparation à faire**, elle n'a pas été tentée.

**Le port 8080 se dispute avec `gestion-interne-api`.** Son Keycloak le tenait ;
`fitcarnet-app-dev` refusait de démarrer, puis a tourné sans port publié — sain
au `docker ps`, injoignable. Le recréer (`up -d --force-recreate app`) après
avoir libéré le port. **Keycloak a été arrêté le 9 septembre et n'a pas été
relancé.**

---

## Pièges vérifiés, qui reviendront

- ~~`verifier-schema.sh` signale 280 lignes de divergence~~ — **corrigé le
  14 septembre**. Il doit désormais dire « identiques ». S'il ne le dit plus,
  c'est une régression : une évolution du schéma écrite d'un seul côté.
- **Le glob des migrations s'arrête à `3[0-9]-*.sql`.** Une migration numérotée
  40 ne serait jouée nulle part. **CINQ fichiers à étendre**, et ce document en
  a longtemps annoncé trois — c'est-à-dire qu'il désignait lui-même le piège en
  en oubliant deux, dont celui qui *vérifie* :

  ```bash
  grep -rn '3\[0-9\]' installer.sh docker/entrypoint-prod.sh \
      db/manuel/verifier-migrations.sh db/manuel/verifier-schema.sh \
      db/manuel/rattraper-dev.sh
  ```

  Oublier `verifier-schema.sh` est le pire des cinq : il annoncerait
  « identiques » sans avoir joué la migration, et son ✓ ne prouverait plus
  rien. C'est arrivé le 14 septembre avec la migration 30.
- **7 erreurs PHPStan sont attendues** (c'était 8). `$creeLe` a disparu de la
  liste : M-02 lui a donné un accesseur, la date d'ouverture était en base et
  inaccessible au code. `JetonRafraichissement::$empreinte` **reste, et doit
  rester** — lui donner un accesseur pour faire taire l'analyse irait contre la
  raison même de ne stocker qu'un SHA-256.
- **`superpowers-symfony` ne s'installe pas seul** — manifeste pointant sur
  l'ancien nom d'organisation, clone SSH refusé. `installer-outils.sh` s'en
  charge ; à relancer après un `claude plugin marketplace update`.
- **Un plugin déclaré peut manquer sans un mot.** Le 8 septembre, `expo` n'a pas
  été posé par le démarrage de Claude Code, et le contrôle d'`installer-outils.sh`
  comptait les plugins *déclarés* au lieu des installés : il annonçait « 5 » avec
  quatre sur le disque. Le script compare désormais pour de bon et pose ce qui
  manque, en `--scope project` — sans ce drapeau, le plugin s'active dans tous
  les dépôts de la machine. La ligne à lire : « 5/5 plugins installés ».
- **`skillOverrides` ne coupe que les skills du projet.** Les vingt-deux entrées
  qui visaient `expo:` et `superpowers-symfony:` n'ont jamais rien coupé — le
  8 septembre, une skill déclarée « off » s'est chargée à la demande, et la
  déplacer dans `~/.claude/settings.json` n'y a rien changé. Retirées. Le seul
  levier pour une skill de plugin est `claude plugin disable`, qui prend le
  plugin entier ; on paie donc ~2 950 tokens de contexte par session pour des
  skills dont on ne se sert pas ici. À rouvrir si Claude Code gagne un réglage
  par composant.
- **Monter l'environnement sans `installer.sh` laisse une base INCOMPLÈTE.**
  PostgreSQL ne joue que `db/*.sql` à la création du volume ; les migrations de
  `db/manuel/` ne partent que par `installer.sh` ou `entrypoint-prod.sh`, dont
  l'ordre est écrit à la main. Le 9 septembre, la base avait 18 tables au lieu de
  20 : `inventaire_lot` manquait, et l'envoi d'un inventaire répondait
  « relation "inventaire_lot" does not exist ». Rejouer la liste dans l'ordre
  d'`installer.sh` — les 23 migrations passent, `25-garde-fous.sql` compris.
- **`bin/console` exige `api/.env`, que le clone ne fournit pas.** Sans lui :
  « Unable to read the "/app/.env" ». L'API servie par FrankenPHP s'en passe —
  ses variables viennent du conteneur. Un fichier local suffit, avec `APP_ENV`
  et `DEFAULT_URI` ; il est ignoré par git.
- **Les clés JWT ne sont pas dans le dépôt** (et c'est heureux). Sans elles, la
  connexion répond « An error occurred while trying to encode the JWT token ».
  `bin/console lexik:jwt:generate-keypair --skip-if-exists`.
- **Une machine neuve n'a ni `front/node_modules` ni `api/vendor`, et rien ne le
  dit.** Le 8 septembre, `npm test` a échoué sur `expo/tsconfig.base not found`
  et `bin/phpunit` n'existait pas. Faire `cd front && npm install`, et pour l'API
  un `composer install` — ce qui suppose Composer, absent de cette machine :
  récupéré par `getcomposer.org` et lancé avec `--ignore-platform-reqs`, l'hôte
  n'ayant pas `php8.3-xml`. L'exécution, elle, se fait dans le conteneur, qui a
  toutes les extensions.
- **Node 22 est exigé, et `installer-outils.sh` ne vérifie que la présence de
  node.** La machine avait 20.11.1 : `node --test` n'y développe pas les globs,
  donc `npm test` répondait « Could not find dist-tests/**/*.test.js » — un
  message qui ne parle pas de version. `nvm install 22 && nvm alias default 22`.
  Attention, un terminal déjà ouvert garde l'ancien PATH.
- **Le port 8080 se dispute avec les autres projets.** Le Keycloak de
  `gestion-interne-api` le tenait ; `fitcarnet-app-dev` refusait de démarrer.
  `docker stop gestion-intenre-api-keycloak-1` le temps de la session — **et le
  redémarrer après**.
- **Le réseau sortant des conteneurs est cassé sur cette machine.** Ni DNS ni
  routage : même vers une IP brute, `curl` rend `000`. D'où l'échec de
  `composer install` dans le conteneur. Contourné en installant `vendor` depuis
  l'hôte (le dossier est monté), **réparation remise à plus tard** : c'est du
  NAT Docker sous WSL2, pas le dépôt.
- **scrcpy ne voit pas le téléphone depuis WSL2.** WSL2 n'a aucun accès USB :
  `/dev/bus/usb` n'y contient que les deux hubs racine. L'affichage, lui, marche
  (WSLg est présent). Installer scrcpy **sur Windows** — le zip des *releases*
  GitHub est autonome, `adb` compris. Les voies de repli sont dans
  `presentation/plan-de-tournage.md`.
- **Le graphe se périme.** `graphify update .` après du code, `/graphify . --update`
  après de la documentation.

---

## Comment travailler ici

[CLAUDE.md](CLAUDE.md) porte les sept règles non négociables et l'aiguillage des
skills. Trois qui reviennent le plus :

1. **TDD sans exception** — le test échoue d'abord.
2. **Ne jamais déclarer terminé sans preuve** — coller la sortie, pas une
   affirmation.
3. **Les commentaires racontent la panne réelle et sa date.** C'est ce qui a
   permis à l'audit de retrouver l'origine de chaque défaut.

Pour monter la machine : [NOUVELLE-MACHINE.md](NOUVELLE-MACHINE.md). Attention,
**la base sera vide de ton historique** — voir son étape 5.
