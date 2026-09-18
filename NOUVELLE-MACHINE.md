# Installer fitcarnet sur une machine neuve

De zéro à « je peux coder », en cinq étapes. Compter **une trentaine de
minutes**, dont l'essentiel en téléchargements.

Ce document chapeaute les autres : il dit **dans quel ordre** et **ce qu'on
oublie**. Pour le détail des données, voir [INSTALLATION.md](INSTALLATION.md) ;
pour la mise en production, [DEPLOIEMENT.md](DEPLOIEMENT.md).

> **Une seule arborescence, sous WSL2 ou Linux.** Jamais de second clone
> synchronisé par copie de fichiers. Deux copies désynchronisées ont déjà coûté
> un bug en production : un renommage de méthode propagé à deux appelants sur
> trois, et le bouton « J'ai cuisiné » qui rendait 500 sans déduire le stock.
> Ce qui doit circuler passe par git.

---

## 1. Les prérequis

Sous Windows, **tout se passe dans WSL2** — jamais dans `C:\`. Le système de
fichiers Linux est bien plus rapide pour `node_modules` et git, et l'application
tourne de toute façon en conteneur.

| Outil | Version ici | Pourquoi |
|---|---|---|
| **Docker** | 28.3 | la base et l'API tournent en conteneur ; rien n'est installé sur l'hôte |
| **Node** | 22.20 (nvm conseillé) | le front Expo, et `intelephense` |
| **git** | — | et une clé SSH autorisée sur le Gitea |
| **Claude Code** | 2.1 | l'outillage du dépôt est fait pour lui ([installation](https://claude.com/claude-code)) |
| **jq** | 1.6 | les hooks de vérification l'utilisent (`apt install jq`) |
| **uv** | 0.12 | installe graphify proprement (`curl -LsSf https://astral.sh/uv/install.sh \| sh`) |
| **PHP** | 8.4 | **facultatif sur l'hôte** — voir l'encadré |

> **Tu n'as pas besoin d'un PHP complet sur la machine.** Les tests de l'API
> tournent dans le conteneur (`docker exec fitcarnet-app-dev … bin/phpunit`), qui
> porte déjà PHP 8.3 et ses extensions. Un PHP hôte sans `dom`, `mbstring` ni
> `xmlwriter` ne peut pas lancer PHPUnit — c'est normal, et sans conséquence.

---

## 2. Cloner

```bash
git clone ssh://git@gitea.mickael-pol.fr:2222/mickael/fitcarnet.git
cd fitcarnet
```

Puis les secrets, qui ne sont **pas** dans le dépôt :

```bash
cp .env.exemple .env
```

Cinq variables à renseigner. Les trois premières sont obligatoires **en
production** — le `docker-compose.yml` les exige par `${VAR:?}` et refuse de
démarrer sans elles. Le développement (`compose.dev.yml`, celui qu'utilise
`installer.sh`) n'en lit aucune :

| Variable | À mettre |
|---|---|
| `DB_PASSWORD` | ce que tu veux, en développement |
| `APP_SECRET` | `openssl rand -hex 32` |
| `JWT_PASSPHRASE` | `openssl rand -hex 32` |
| `GROCY_URL`, `GROCY_API_KEY` | seulement si tu utilises le frigo Grocy |

---

## 3. L'outillage de développement

```bash
./installer-outils.sh
```

Il vérifie les prérequis, installe **graphify** (avec son support SQL) et
**intelephense**, puis **installe `superpowers-symfony` de bout en bout** :
clone du marketplace, correction de son manifeste, installation du plugin. Il
ne touche ni à la base, ni aux conteneurs.

Il finit par **confronter les cinq plugins déclarés dans `.claude/settings.json`
à ceux réellement installés**, et pose ceux qui manquent.

Chaque ligne doit être verte. Si l'une est rouge, elle dit quoi faire.

**Puis démarre Claude Code dans ce dossier.** C'est ce démarrage qui charge les
skills — celles du projet et celles des plugins.

> **Pourquoi ce contrôle existe.** Les quatre plugins officiels sont normalement
> posés par Claude Code au premier démarrage, d'après `enabledPlugins`. Le
> 8 septembre 2026 il en a posé trois : `expo` a échoué sans un log, et le
> script comptait alors les plugins *déclarés* au lieu des installés — il
> annonçait « 5 plugins » avec quatre sur le disque. Une relance à la main a
> suffi à poser `expo` : la panne était passagère, l'aveuglement non.

> **Pourquoi le script installe `superpowers-symfony` lui-même, et pas Claude
> Code.** Le manifeste de ce marketplace déclare son ancien nom d'organisation,
> ce qui fait tenter à Claude Code un clone SSH refusé sans clé GitHub. Le
> script clone le marketplace en HTTPS — qui marche — corrige la source, puis
> installe. Sans lui, il faudrait lancer le script, démarrer Claude Code, voir
> l'échec, relancer le script, et redémarrer : quatre étapes au lieu de deux.

**Vérifie ensuite dans Claude Code** que les cinq plugins sont là :

```
claude plugin list        # expo, php-lsp, context7, superpowers, superpowers-symfony
```

Le dépôt porte déjà, sans rien à faire : `CLAUDE.md` et les sept règles du
projet, les hooks de vérification, les **25 skills du projet** — dix de métier
et d'outillage (isolation des données, tests API, front, nutrition, schéma,
postgres, revue de code, données de test, épreuve de fonctionnalité,
vérification Android) et les quinze fiches `fonctionnalite-*` —, **7 agents**,
`.graphifyignore`, et le cache sémantique de graphify.

*Ce paragraphe annonçait « 6 skills et 2 agents » jusqu'au 16 septembre 2026 :
il cachait dix-neuf skills et cinq agents à celui qui arrive. Compté à la main
dans `.claude/skills/` et `.claude/agents/`.*

---

## 4. L'application

```bash
./installer.sh --email ton@adresse.fr
```

Il enchaîne : vérifications, base de données, migrations de `db/manuel/`, compte
administrateur, objectifs par repas, catalogue d'exercices, séances, sauvegarde.

Pour le faire pas à pas, ou comprendre ce qu'il fait :
[INSTALLATION.md](INSTALLATION.md).

Enfin, les dépendances du front :

```bash
cd front && npm install
```

---

## 5. Tes données — la partie qui n'est pas dans le dépôt

**À la fin de l'étape 4, l'application tourne, mais elle est vide de ton
historique.** C'est normal, et voulu : le dépôt porte le code, jamais les
données. Tu auras :

| Présent d'emblée | Absent |
|---|---|
| le schéma et les migrations de `db/manuel/` | tes **séances** et ton historique |
| le référentiel commun — exercices, emplacements, modes de cuisson | le **stock** de ton frigo |
| le catalogue de 1 338 exercices (téléchargé par `installer.sh`) | tes **aliments** (voir plus bas) |
| tes **cibles par repas** (`db/manuel/cibles.sql`, versionné) | tes **plans enregistrés** |
| un compte administrateur | |

**Pour développer, c'est suffisant** — une base de test propre vaut mieux que
tes vraies données pour corriger un bug.

> **Une installation neuve n'a aucun aliment, et c'est voulu.** Chaque aliment
> appartient à un compte, et chaque compte saisit les siens en rentrant de
> courses : les valeurs nutritionnelles ne sont pas une constante — deux paquets
> de la même chose ne portent pas les mêmes chiffres, et l'étiquette française
> les donne. Un compte Grocy, lui, les reçoit de Grocy, fibres comprises. Pour avoir de quoi cliquer tout de suite, joue
> `db/manuel/jeu-essai.sql`, qui crée ses propres aliments.

**Pour retrouver ton carnet**, il faut apporter un dump. Il n'y en a pas dans le
dépôt et il ne faut pas en mettre :

```bash
# depuis la machine qui a les données, ou depuis le NAS
scp sauvegardes/fitcarnet_*.dump  autre-pc:~/fitcarnet/sauvegardes/

# puis, sur la nouvelle machine
./sauvegarde.sh --restaurer sauvegardes/fitcarnet_2026-08-11_185210.dump
```

`./sauvegarde.sh --lister` montre ce qui est disponible. La restauration demande
confirmation et **écrase** la base locale.

**Une base restaurée garde le schéma de sa date.** Un dump d'août n'a ni la
colonne `aliment.utilisateur_id` ni les contraintes posées depuis : lance
aussitôt `db/manuel/rattraper-dev.sh`, qui joue les migrations manquantes —
sans quoi l'API répond 500 sur le frigo, ou dès la connexion.

> Attention si tu travailles depuis deux machines : **la base ne se synchronise
> pas**. Deux bases divergentes, c'est le même piège que deux clones du code.
> Décide laquelle fait foi, et restaure depuis elle.

---

## Vérifier que tout est en place

Chaque commande doit donner ce résultat — les chiffres du 18 septembre 2026.
Un chantier peut en retirer autant qu'en ajouter : un chiffre différent se
compare au journal (`REPRENDRE.md`), il ne se juge pas seul.

```bash
cd front && npm test                    # 644 tests, puis 33 de rendu, 0 échec
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'
                                        # 415 tests, 1 026 assertions, 0 échec
docker exec fitcarnet-app-dev sh -c 'cd /app && vendor/bin/phpstan analyse'
                                        # 5 erreurs connues, aucune régression
docker pull postgres:16                 # l'image des deux scripts ci-dessous (451 Mo),
                                        # pas l'alpine du dev — voir la skill schema-base
db/manuel/verifier-migrations.sh        # ✓ garde-fous posés
db/manuel/verifier-jeux.sh              # ✓ jeux de données et garde-fou
```

Et dans Claude Code : `/graphify .` pour construire le graphe (~5 min). Le cache
sémantique étant versionné, **il ne coûtera aucun token de modèle**.

✅ `db/manuel/verifier-schema.sh` doit répondre **« Base neuve et base migrée
sont identiques »**. C'était 280 lignes de divergence jusqu'au 14 septembre
2026 — constat C2, corrigé au lot 4.

> **S'il signale une divergence aujourd'hui, c'est une régression, pas un
> défaut connu.** Ce paragraphe a longtemps dit l'inverse et invitait à passer
> outre : il apprenait à ignorer le seul contrôle capable de détecter une
> évolution de schéma écrite d'un seul côté.

---

## Les pièges, et pourquoi ils reviendront

**`superpowers-symfony` ne s'installe pas seul**, et c'est pour ça que
`installer-outils.sh` s'en charge entièrement. Son manifeste déclare la source
`MakFly/superpowers-symfony` — l'ancien nom de l'organisation, qui redirige
aujourd'hui vers `dev-toolings/`. Claude Code tente alors un clone SSH, refusé
sur toute machine sans clé GitHub autorisée.

**Relancer `./installer-outils.sh` après un `claude plugin marketplace update`** :
la mise à jour réécrit le manifeste et efface la correction. Le symptôme est net
— `claude plugin list` ne montre plus que quatre plugins.

**Un plugin peut manquer sans que rien ne le dise.** C'est ce que le contrôle du
script attrape désormais : il installe le manquant, en scope projet. Sans
`--scope project`, `claude plugin install` pose le plugin en scope *utilisateur*
et l'active dans tous les dépôts de la machine.

**Des `skillOverrides`, s'il en fallait un jour, ne prendraient effet qu'au
redémarrage suivant** — Claude Code lit la configuration au lancement. Le dépôt
n'en déclare aucun aujourd'hui.

**Et ils ne peuvent rien contre les skills des plugins.** Une entrée
`expo:expo-dom` est acceptée sans broncher et ne coupe rien — vérifié le
8 septembre 2026 dans les deux fichiers de configuration, projet et utilisateur.
Seules les skills de `.claude/skills/` obéissent. Pour une skill de plugin, le
seul levier est `claude plugin disable`, qui désactive le plugin entier. Le
script prévient si une entrée de ce genre réapparaît.

**Le graphe se périme.** `graphify update .` après une modification de code
(gratuit, AST seul) ; `/graphify . --update` après un changement de
documentation. Sans ça il ment — il a déjà décrit une méthode supprimée pendant
une demi-journée.

**Ne jamais recréer de second clone.** Ni sous Windows, ni ailleurs. Claude
Cowork refuse les chemins `\\wsl.localhost\…` et n'est donc pas utilisable ici :
le projet se travaille en terminal, avec Claude Code.

---

## Aide-mémoire

- [ ] Docker, Node 22, git + clé SSH Gitea, jq, uv
- [ ] `git clone` sous WSL2 ou Linux — **jamais** dans `C:\`
- [ ] `.env` créé depuis `.env.exemple`, trois secrets renseignés
- [ ] `./installer-outils.sh` — **toutes les lignes vertes**, dont « 5/5 plugins installés »
- [ ] **Claude Code démarré dans le dossier** ← l'oubli le plus fréquent
- [ ] `claude plugin list` montre bien les **cinq** plugins
- [ ] `./installer.sh --email ton@adresse.fr`
- [ ] `cd front && npm install`
- [ ] Les quatre vérifications ci-dessus au vert
- [ ] `/graphify .` pour le graphe
- [ ] **Tes données** : la base est vide de ton historique. Apporter un dump et
      `./sauvegarde.sh --restaurer <fichier>` si tu veux retrouver ton carnet
- [ ] `./sauvegarde.sh` avant de repartir — le dépôt protège le code, pas les données
