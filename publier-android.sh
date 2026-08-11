#!/usr/bin/env bash
#
# fitcarnet — publier une nouvelle version Android, en une commande.
#
#   ./publier-android.sh                    version suivante, 1.0.0 -> 1.0.1
#   ./publier-android.sh --version 1.1.0    numéro choisi
#   ./publier-android.sh --notes "Batch cooking"
#   ./publier-android.sh --sans-build       incrémente et prépare, sans lancer EAS
#   ./publier-android.sh --sans-git         passe outre les fichiers non commités
#
# CE SCRIPT EXISTE POUR UNE SEULE RAISON : `android.versionCode` et le
# `versionCode` du `version.json` doivent être LE MÊME NOMBRE.
#
# Le premier décide si Android accepte d'installer par-dessus l'existant. Le
# second décide si l'application propose la mise à jour. Tenus à la main dans
# deux fichiers différents, ils divergent — et la panne est silencieuse dans
# les deux sens : un `version.json` en avance propose un APK qui n'existe pas ;
# en retard, il ne propose jamais celui qui existe. Personne ne s'en aperçoit
# avant des semaines.
#
# Ici, un seul endroit décide, et il écrit les deux.
#
set -euo pipefail

cd "$(dirname "$0")"

VERT=$'\033[0;32m'; ROUGE=$'\033[0;31m'; JAUNE=$'\033[0;33m'; GRIS=$'\033[0;90m'; RAZ=$'\033[0m'
titre() { printf '\n%s──  %s%s\n' "$JAUNE" "$1" "$RAZ"; }
ok()    { printf '   %s✓%s %s\n' "$VERT" "$RAZ" "$1"; }
info()  { printf '   %s%s%s\n' "$GRIS" "$1" "$RAZ"; }
echec() { printf '\n%s✗ %s%s\n\n' "$ROUGE" "$1" "$RAZ" >&2; exit 1; }

VERSION=""
NOTES=""
PROFIL="production"
SANS_BUILD=0
SANS_GIT=0
DOMAINE="${DOMAINE:-carnet.mickael-pol.fr}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version)     VERSION="${2:?}"; shift 2 ;;
        --notes)       NOTES="${2:?}"; shift 2 ;;
        --profil)      PROFIL="${2:?}"; shift 2 ;;
        --sans-build)  SANS_BUILD=1; shift ;;
        --sans-git)    SANS_GIT=1; shift ;;
        -h|--help)     sed -n '2,20p' "$0" | sed 's/^# \?//'; exit 0 ;;
        *)             echec "Option inconnue : $1" ;;
    esac
done

[[ -f front/app.json ]] || echec "Lance ce script depuis la racine du dépôt."

# --------------------------------------------------------------- garde-fous

titre "Avant de publier"

# Un APK qui part avec des tests rouges est un APK qu'il faudra republier, et
# republier coûte un appui sur CHAQUE téléphone. C'est le seul endroit du
# projet où l'on paie une erreur autant de fois qu'il y a d'utilisateurs.
( cd front && npm test >/dev/null 2>&1 ) \
    || echec "Les tests du front échouent. Corrige avant de publier :  cd front && npm test"
ok "Tests du front"

# Chaque greffon declare dans `app.json` doit exister dans `package.json`.
# EAS reinstalle les dependances sur SA machine a partir de ce fichier : un
# module present dans ton node_modules mais absent de package.json passe les
# tests ici et fait echouer le build la-bas, sur un « Unknown error » de la
# phase « Read app config » qui ne nomme meme pas le coupable.
#
# On le verifie AVANT d'incrementer quoi que ce soit et avant d'occuper la
# file d'attente d'Expo pendant dix minutes.
MANQUANTS=$(python3 verifier-greffons.py)

if [[ -n "$MANQUANTS" ]]; then
    echec "Ces greffons sont déclarés dans front/app.json mais absents de front/package.json :
     $MANQUANTS

   EAS réinstalle les dépendances sur sa machine à partir de package.json :
   le build échouerait là-bas sur « Read app config ». Corrige d'abord :

     cd front && npx expo install $MANQUANTS
     rm -rf node_modules package-lock.json && npm install"
fi
ok "Greffons déclarés dans package.json"

# ON ASSEMBLE LE JAVASCRIPT ICI AVANT DE L'ENVOYER LA-BAS.
#
# C'est exactement ce qu'EAS fait dans sa phase « Bundle JavaScript », avec le
# meme Metro. Quand elle echoue chez eux, le resume dit « Unknown error » et il
# faut ouvrir les journaux du build pour apprendre quel fichier est en cause —
# apres dix minutes de file d'attente, et apres avoir incremente le
# versionCode pour rien.
#
# Trente secondes ici valent mieux que dix minutes la-bas.
titre "Assemblage du JavaScript"
SORTIE=$(mktemp -d)
# `--clear` VIDE LE CACHE DE METRO, et ce n'est pas du confort.
#
# Metro garde le resultat de chaque fichier transforme. Change ta
# configuration Babel, il ressert quand meme l'ancienne version — sans un mot.
# On a passe une heure a corriger un preset qui etait deja correct, en lisant
# quatre fois la meme erreur aux memes numeros de ligne : la sortie n'avait
# jamais ete recalculee.
#
# Assembler dure une minute de plus. C'est le prix pour que ce qu'on lit ici
# soit ce que le code dit vraiment.
if ( cd front && npx expo export --platform android --output-dir "$SORTIE" --clear >/tmp/fitcarnet-bundle.log 2>&1 ); then
    rm -rf "$SORTIE"
    ok "Metro assemble sans erreur"
else
    rm -rf "$SORTIE"
    printf '\n'
    tail -30 /tmp/fitcarnet-bundle.log
    echec "L'assemblage échoue ICI, il échouerait donc chez EAS.
   La sortie complète est dans /tmp/fitcarnet-bundle.log"
fi

# ON REFUSE DE PARTIR AVEC DES MODIFICATIONS NON COMMITEES.
#
# EAS installe les dependances avec `npm ci`, a partir du `package-lock.json`
# COMMITE. Un verrou modifie mais pas commite veut dire : ca marche chez toi,
# et la-bas ils installent l'ancien jeu de versions. Le build echoue sur
# « Bundle JavaScript » avec un « Unknown error » qui ne dit rien.
#
# C'est exactement ce qui s'est passe, et le script se contentait de
# PREVENIR. Un avertissement qu'on peut ignorer au milieu de dix lignes vertes
# n'est pas un garde-fou.
if (( ! SANS_GIT )) && [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
    printf '\n'
    git status --short
    echec "Des fichiers ne sont pas commités.

   EAS construit à partir du dépôt, pas de ton disque : ces modifications
   n'arriveraient pas chez eux, et surtout package-lock.json y serait dans son
   ancien état. Commite d'abord :

     git add -A && git commit -m \"...\"

   Si tu sais ce que tu fais et veux passer outre :  --sans-git"
fi

# ---------------------------------------------------------------- numéros

titre "Numéros de version"

LU=$(python3 - "$VERSION" <<'PY'
import json, sys, collections
chemin = 'front/app.json'
d = json.load(open(chemin, encoding='utf-8'), object_pairs_hook=collections.OrderedDict)
e = d['expo']

# Le versionCode ne fait qu'AUGMENTER, toujours de un. Android refuse une
# installation par-dessus un numero superieur ou egal, et rien ne permet de
# revenir en arriere : un numero saute est perdu pour toujours.
e['android']['versionCode'] = int(e['android'].get('versionCode', 0)) + 1

demandee = sys.argv[1] if len(sys.argv) > 1 else ''
if demandee:
    e['version'] = demandee
else:
    # Le dernier segment de « 1.2.3 ». Une version qui n'a pas cette forme
    # n'est pas devinee : on la laisse et on le dit.
    morceaux = e['version'].split('.')
    if len(morceaux) == 3 and morceaux[2].isdigit():
        morceaux[2] = str(int(morceaux[2]) + 1)
        e['version'] = '.'.join(morceaux)

json.dump(d, open(chemin, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
open(chemin, 'a', encoding='utf-8').write('\n')
print(f"{e['version']} {e['android']['versionCode']}")
PY
)
VERSION=$(echo "$LU" | cut -d' ' -f1)
CODE=$(echo "$LU" | cut -d' ' -f2)

ok "version $VERSION, versionCode $CODE"
info "écrits dans front/app.json — pense à les commiter"

# ------------------------------------------------------- ce que le NAS sert

titre "Ce que le NAS publiera"

mkdir -p telecharger
cat > telecharger/version.json <<JSON
{
  "versionCode": $CODE,
  "version": "$VERSION",
  "url": "https://$DOMAINE/telecharger/fitcarnet.apk",
  "notes": "${NOTES:-Nouvelle version}"
}
JSON
ok "telecharger/version.json"
info "$(tr -d '\n' < telecharger/version.json | tr -s ' ')"

# ------------------------------------------------------------------ build

if (( SANS_BUILD )); then
    titre "Build ignoré (--sans-build)"
else
    titre "Construction de l'APK"

    # Le paquet s'appelle `eas-cli`, la commande `eas`. `npx eas` cherche donc
    # un paquet nomme « eas », qui n'expose aucun executable — et npm repond
    # « could not determine executable to run », ce qui ne dit pas grand-chose.
    # On prend la commande globale si elle existe, le paquet complet sinon.
    if command -v eas >/dev/null 2>&1; then
        EAS="eas"
    else
        EAS="npx eas-cli@latest"
        info "eas-cli n'est pas installé : je passe par npx (plus lent au démarrage)."
        info "Pour l'installer une bonne fois :  npm install -g eas-cli"
    fi

    info "EAS compile chez Expo ; compte quelques minutes, plus la file d'attente."
    ( cd front && $EAS build -p android --profile "$PROFIL" ) \
        || echec "Le build a échoué. Le versionCode a DÉJÀ été incrémenté :
   relance ce script avec --sans-build pour ne pas le sauter une seconde fois,
   ou remets front/app.json comme il était."
    ok "APK construit"
fi

# ------------------------------------------------------------------ suite

printf '\n%s──  À toi de jouer%s\n\n' "$VERT" "$RAZ"
cat <<FIN
   1. Télécharge l'APK depuis la page qu'EAS vient d'afficher.
   2. Dépose-le sur le NAS, ces deux fichiers ENSEMBLE :

        /volume1/docker/fitcarnet/telecharger/fitcarnet.apk
        /volume1/docker/fitcarnet/telecharger/version.json

      Dans cet ordre : l'APK d'abord. Un version.json qui annonce un fichier
      pas encore arrivé envoie les téléphones sur une adresse morte.

   3. Commite les numéros :

        git add front/app.json telecharger/version.json
        git commit -m "version $VERSION ($CODE)"

   Les téléphones verront la mise à jour dans l'onglet Compte, au prochain
   démarrage. Les changements de JavaScript, eux, n'ont pas besoin de tout ça :

        cd front && eas update --branch production --message "..."
FIN
