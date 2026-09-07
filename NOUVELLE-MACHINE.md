# Installer fitcarnet sur une machine neuve

De zéro à « je peux coder », en quatre étapes. Compter **une trentaine de
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

Cinq variables à renseigner. Les trois premières sont obligatoires — le
`docker-compose.yml` les exige par `${VAR:?}` et refuse de démarrer sans elles :

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

Chaque ligne doit être verte. Si l'une est rouge, elle dit quoi faire.

**Puis démarre Claude Code dans ce dossier.** C'est ce démarrage qui installe
les quatre plugins officiels déclarés dans `.claude/settings.json` — Expo,
php-lsp, context7, superpowers — et charge les skills du projet.

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
projet, les hooks de vérification, les `skillOverrides` (28 skills inutiles
coupées), les 11 skills projet et 2 agents, `.graphifyignore`, et le cache
sémantique de graphify.

---

## 4. L'application

```bash
./installer.sh
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

## Vérifier que tout est en place

Chaque commande doit donner **au moins** ce résultat — ce sont les chiffres du
7 septembre 2026 ; ils ne peuvent que monter.

```bash
cd front && npm test                    # 362 tests, 0 échec
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'
                                        # 102 tests, 422 assertions
docker exec fitcarnet-app-dev sh -c 'cd /app && vendor/bin/phpstan analyse'
                                        # 8 erreurs connues, aucune régression
db/manuel/verifier-migrations.sh        # ✓ garde-fous posés
```

Et dans Claude Code : `/graphify .` pour construire le graphe (~5 min). Le cache
sémantique étant versionné, **il ne coûtera aucun token de modèle**.

⚠️ `db/manuel/verifier-schema.sh` signale encore **280 lignes de divergence**
entre base neuve et base migrée. Ce n'est pas une erreur d'installation : c'est
le constat C2 de l'audit, corrigé au lot 4. Voir
[docs/audit-2026-09/](docs/audit-2026-09/README.md).

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

**Les `skillOverrides` ne prennent effet qu'au redémarrage suivant.** Normal :
Claude Code lit la configuration au lancement.

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
- [ ] `./installer-outils.sh` — **toutes les lignes vertes**
- [ ] **Claude Code démarré dans le dossier** ← l'oubli le plus fréquent
- [ ] `claude plugin list` montre bien les **cinq** plugins
- [ ] `./installer.sh`
- [ ] `cd front && npm install`
- [ ] Les quatre vérifications ci-dessus au vert
- [ ] `/graphify .` pour le graphe
- [ ] `./sauvegarde.sh` — le dépôt protège le code, pas les données
