#!/usr/bin/env bash
# =====================================================================
#  installer-outils — remonter l'outillage de développement sur une machine neuve
#
#  À LANCER UNE FOIS, APRÈS LE CLONE. Puis redémarrer Claude Code.
#
#  Ce que le dépôt porte déjà et que ce script n'a pas à refaire :
#    - CLAUDE.md, les règles du projet et l'aiguillage des skills ;
#    - .claude/settings.json — hooks, skillOverrides, ET la déclaration des
#      plugins (extraKnownMarketplaces + enabledPlugins) ;
#    - .claude/skills/ et .claude/agents/ — les skills propres au projet ;
#    - .graphifyignore, phpstan.dist.neon, les scripts de vérification.
#
#  Ce que ce script installe, parce qu'aucun fichier du dépôt ne peut le faire :
#    - graphify (outil Python global) ;
#    - intelephense (serveur de langage PHP, requis par le plugin php-lsp) ;
#    - le contournement du manifeste cassé de superpowers-symfony ;
#    - les plugins déclarés que le démarrage de Claude Code n'a pas posés. Il est
#      censé s'en charger seul, mais il a déjà échoué en silence (voir la section
#      « Plugins déclarés par le dépôt »), alors on vérifie.
#
#  Il ne touche NI à la base, NI aux conteneurs, NI au NAS. Pour l'application
#  elle-même, voir INSTALLATION.md et installer.sh.
#
#  Usage :  ./installer-outils.sh
# =====================================================================
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
jaune() { printf '\033[33m%s\033[0m\n' "$*"; }
rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
titre() { printf '\n\033[1m%s\033[0m\n' "$*"; }

manquant=0
requis() {
    if command -v "$1" >/dev/null 2>&1; then
        vert "  ✓ $1"
    else
        rouge "  ✗ $1 — $2"
        manquant=1
    fi
}

titre "Prérequis"
requis docker "installe Docker, puis relance : la base et l'API tournent en conteneur"
requis node   "installe Node 22 (nvm conseillé) : le front et intelephense en dépendent"
requis git    "improbable, mais vérifions"
requis jq     "utilisé par les hooks de vérification (apt install jq)"
(( manquant )) && { rouge $'\nInstalle ce qui manque avant de continuer.'; exit 1; }

# ------------------------------------------------------------------ graphify
titre "graphify — le graphe de connaissances du projet"
if command -v graphify >/dev/null 2>&1; then
    vert "  ✓ déjà installé ($(command -v graphify))"
else
    if command -v uv >/dev/null 2>&1; then
        uv tool install --upgrade 'graphifyy[sql]' -q && vert "  ✓ installé via uv"
    else
        jaune "  uv absent — installation par pip"
        python3 -m pip install --quiet 'graphifyy[sql]' \
          || python3 -m pip install --quiet --break-system-packages 'graphifyy[sql]'
        vert "  ✓ installé via pip"
    fi
fi

# Le support SQL n'est pas dans le paquet de base : sans lui les 26 fichiers de
# db/ ne produisent aucun noeud, en silence — un simple avertissement au build.
if ! python3 -c 'import tree_sitter_sql' 2>/dev/null \
   && ! uv tool run --from graphifyy python -c 'import tree_sitter_sql' 2>/dev/null; then
    jaune "  ⚠ tree_sitter_sql absent : le schéma SQL sera ignoré par le graphe"
    jaune "    correction : uv tool install --upgrade 'graphifyy[sql]'"
fi

# ------------------------------------------------------------- intelephense
titre "intelephense — serveur de langage PHP (plugin php-lsp)"
if command -v intelephense >/dev/null 2>&1; then
    vert "  ✓ déjà installé"
else
    npm install -g intelephense >/dev/null 2>&1 && vert "  ✓ installé" \
      || { rouge "  ✗ échec — lance : npm install -g intelephense"; }
fi

# --------------------------------------------------- superpowers-symfony
titre "superpowers-symfony — 44 skills Symfony 7.4 / API Platform v4"
#
# CE PLUGIN NE S'INSTALLE PAS TOUT SEUL, ET CE N'EST PAS DE NOTRE FAIT.
#
# Son manifeste déclare la source `MakFly/superpowers-symfony` — l'ANCIEN nom de
# l'organisation, qui redirige aujourd'hui vers `dev-toolings/`. Claude Code
# tente alors un clone SSH, qui échoue sur toute machine sans clé GitHub
# autorisée : « git@github.com: Permission denied (publickey) ».
#
# Le marketplace, lui, se clone très bien en HTTPS — et il contient déjà le
# plugin entier. On corrige donc la source pour qu'elle pointe sur le dépôt
# local plutôt que de retourner le chercher sur GitHub.
#
# À refaire si le marketplace est rafraîchi (`claude plugin marketplace update`).
MANIFESTE="$HOME/.claude/plugins/marketplaces/superpowers-symfony/.claude-plugin/marketplace.json"

if ! command -v claude >/dev/null 2>&1; then
    jaune "  Claude Code n'est pas installé — étape ignorée."
    jaune "  Installe-le (https://claude.com/claude-code) puis relance ce script."
else
    # Le marketplace, lui, se clone très bien en HTTPS. On le fait ICI plutôt que
    # d'attendre le premier démarrage de Claude Code : sinon il faudrait lancer
    # ce script DEUX fois, une avant et une après, pour que la correction du
    # manifeste ait un fichier à corriger. La commande est idempotente.
    if [[ ! -f "$MANIFESTE" ]]; then
        claude plugin marketplace add dev-toolings/superpowers-symfony >/dev/null 2>&1 \
          && vert "  ✓ marketplace cloné" \
          || jaune "  ⚠ le clone du marketplace a échoué — réseau ?"
    fi

    if [[ -f "$MANIFESTE" ]]; then
        if grep -q '"source": "./"' "$MANIFESTE"; then
            vert "  ✓ manifeste déjà corrigé"
        else
            python3 - "$MANIFESTE" <<'PY'
import json, sys, pathlib
p = pathlib.Path(sys.argv[1])
d = json.loads(p.read_text())
for plug in d.get('plugins', []):
    if plug.get('name') == 'superpowers-symfony':
        plug['source'] = './'
p.write_text(json.dumps(d, indent=2) + "\n")
PY
            vert "  ✓ manifeste corrigé (source locale au lieu du clone SSH)"
        fi

        # Et on installe dans la foulée, tant que le manifeste est bon.
        if claude plugin list 2>/dev/null | grep -q 'superpowers-symfony'; then
            vert "  ✓ plugin déjà installé"
        else
            claude plugin install superpowers-symfony@superpowers-symfony >/dev/null 2>&1 \
              && vert "  ✓ plugin installé (44 skills Symfony)" \
              || rouge "  ✗ installation refusée — relance ce script, ou vois NOUVELLE-MACHINE.md"
        fi
    else
        rouge "  ✗ marketplace absent : superpowers-symfony ne sera pas disponible."
        rouge "    Réessaie : claude plugin marketplace add dev-toolings/superpowers-symfony"
    fi
fi

# ------------------------------------------- les plugins que le dépôt déclare
titre "Plugins déclarés par le dépôt"
#
# LE 8 SEPTEMBRE 2026, `expo` MANQUAIT ET RIEN NE LE DISAIT.
#
# Les quatre plugins officiels sont posés par Claude Code au démarrage dans ce
# dossier, d'après `enabledPlugins`. Ce jour-là il en a posé trois — php-lsp et
# context7 à 11:17:16, superpowers à 11:17:37 — et rien pour `expo`, le seul dont
# la source oblige à cloner un sous-dossier d'un AUTRE dépôt (`git-subdir` vers
# github.com/expo/skills). L'échec n'a laissé aucun log. Et le contrôle de ce
# script comptait les plugins DÉCLARÉS, jamais les installés : il annonçait
# « 5 plugins » alors qu'il n'y en avait que quatre sur le disque. Une relance à
# la main a suffi à poser expo — la panne était passagère, l'aveuglement non.
#
# D'où cette section : on compare vraiment, et on installe ce qui manque.
declares=()
plugins_manquants=()
plugins_verifies=1
plugins_poses=0

if ! command -v claude >/dev/null 2>&1; then
    plugins_verifies=0
    jaune "  Claude Code n'est pas installé — impossible de vérifier."
else
    mapfile -t declares < <(jq -r '.enabledPlugins // {} | to_entries[] | select(.value) | .key' \
                              "$RACINE/.claude/settings.json")
    installes="$(claude plugin list --json 2>/dev/null | jq -r '.[].id' 2>/dev/null || true)"

    for plugin in "${declares[@]}"; do
        if grep -qxF "$plugin" <<<"$installes"; then
            vert "  ✓ $plugin"
            continue
        fi

        # Marketplace inconnu : `claude plugin install` échouerait sans dire
        # pourquoi. `claude-plugins-official` est intégré à Claude Code.
        marche="${plugin##*@}"
        if [[ "$marche" != "claude-plugins-official" ]] \
           && ! jq -e --arg m "$marche" 'has($m)' \
                   "$HOME/.claude/plugins/known_marketplaces.json" >/dev/null 2>&1 \
           && ! jq -e --arg m "$marche" '.extraKnownMarketplaces | has($m)' \
                   "$RACINE/.claude/settings.json" >/dev/null 2>&1; then
            rouge "  ✗ $plugin — marketplace « $marche » inconnu"
            rouge "    claude plugin marketplace add <organisation>/$marche"
            plugins_manquants+=("$plugin")
            continue
        fi

        # `--scope project` n'est pas décoratif : sans lui l'installation part en
        # scope utilisateur, et le plugin s'active dans TOUS les projets de la
        # machine — expo dans un dépôt qui n'a pas une ligne de React Native.
        if claude plugin install "$plugin" --scope project >/dev/null 2>&1; then
            vert "  ✓ $plugin — installé"
            plugins_poses=1
        else
            rouge "  ✗ $plugin — installation refusée ; relance, ou vois NOUVELLE-MACHINE.md"
            plugins_manquants+=("$plugin")
        fi
    done

    # Le CLI réécrit .claude/settings.json en réordonnant ses clés : contenu
    # identique, diff bruyant. Le dire, plutôt que de laisser un `git status` sale
    # sans explication. Seulement si on vient d'installer, et seulement dans un
    # dépôt git — sinon on accuserait le CLI d'une modification faite à la main.
    if (( plugins_poses )) \
       && git -C "$RACINE" rev-parse --git-dir >/dev/null 2>&1 \
       && ! git -C "$RACINE" diff --quiet .claude/settings.json 2>/dev/null; then
        jaune "  ⚠ .claude/settings.json réordonné par le CLI (contenu inchangé)"
        jaune "    git checkout -- .claude/settings.json"
    fi
fi

# ------------------------------------------------------------------ contrôle
titre "Contrôle"
cd "$RACINE"
[[ -f CLAUDE.md ]]                  && vert "  ✓ CLAUDE.md"
# `skillOverrides` NE COUPE QUE LES SKILLS LOCALES. Vérifié le 8 septembre 2026 :
# les six entrées sans préfixe (skills de .claude/skills) sont bien refusées à
# l'invocation, tandis que les vingt-deux qui visaient `expo:` et
# `superpowers-symfony:` ne coupaient rien — ni depuis ce fichier, ni depuis
# ~/.claude/settings.json, testé en déplaçant un témoin. Elles ont été retirées :
# elles annonçaient « 28 skills coupées » et payaient quand même ~2 950 tokens
# de contexte à chaque session. Pour une skill de plugin, le seul levier est
# `claude plugin disable` — le plugin entier, pas une skill.
coupees=$(jq '.skillOverrides | length' .claude/settings.json)
morts=$(jq '[.skillOverrides // {} | keys[] | select(contains(":"))] | length' .claude/settings.json)
if (( ! plugins_verifies )); then
    jaune "  ⚠ .claude/settings.json — plugins NON vérifiés, $coupees skills coupées"
elif (( ${#plugins_manquants[@]} )); then
    rouge "  ✗ .claude/settings.json — $(( ${#declares[@]} - ${#plugins_manquants[@]} ))/${#declares[@]} plugins installés"
    rouge "    manque : ${plugins_manquants[*]}"
else
    vert "  ✓ .claude/settings.json (${#declares[@]}/${#declares[@]} plugins installés, $coupees skills coupées)"
fi
(( morts )) && jaune "  ⚠ $morts skillOverrides visent une skill de plugin : sans effet, à retirer"
[[ -d .claude/skills ]]             && vert "  ✓ .claude/skills ($(ls .claude/skills | wc -l) skills projet)"
[[ -f .graphifyignore ]]            && vert "  ✓ .graphifyignore"
[[ -f api/phpstan.dist.neon ]]      && vert "  ✓ phpstan.dist.neon"
[[ -d graphify-out ]] && vert "  ✓ graphify-out (graphe présent)" \
                      || jaune "  ⚠ pas de graphe : lance /graphify . dans Claude Code (~5 min)"

titre "Il reste à faire, à la main"
cat <<'FIN'
  1. Redémarrer Claude Code dans ce dossier — c'est ce qui charge les skills des
     plugins qui viennent d'être installés.
  2. Lancer l'application elle-même : voir INSTALLATION.md, puis ./installer.sh
     (base, conteneurs, compte administrateur).
  3. Si le graphe manque, le construire : /graphify . dans Claude Code.

  Une seule arborescence fait foi. Ne jamais créer de second clone synchronisé
  par copie de fichiers : ce qui doit circuler passe par git.
FIN
