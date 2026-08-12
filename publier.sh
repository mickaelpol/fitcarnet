#!/usr/bin/env bash
#
# fitcarnet — publier tout, en une commande.
#
#   ./publier.sh "ce qui change"
#   ./publier.sh "…" --sans-mobile     ne touche pas aux téléphones
#   ./publier.sh "…" --sans-web        ne reconstruit pas le front web
#   ./publier.sh "…" --nas root@nas    déclenche le déploiement tout de suite
#
# CE QU'IL FAIT, DANS CET ORDRE :
#
#   1. les tests du front           — rien ne part en rouge
#   2. `npm run build:web`          — le NAS sert `front/dist`, qui est versionné
#   3. commit + push                — le NAS tire dans les 5 minutes
#   4. `eas update`                 — les téléphones, au démarrage suivant
#
# POURQUOI QUATRE ÉTAPES ET PAS UNE : IL Y A TROIS CHEMINS, PAS UN.
#
# L'API et le site web arrivent par git, sur ton NAS. L'application Android,
# elle, ne lit pas ton NAS : elle interroge les serveurs d'Expo, et n'y trouve
# quelque chose que si `eas update` y a publié. Un `git push` ne touche AUCUN
# téléphone. Ce script fait les deux, pour que tu n'aies pas à t'en souvenir.
#
# CE QU'IL NE PEUT PAS FAIRE : une mise à jour JavaScript ne remplace pas
# l'application. Si tu as ajouté un module natif, changé un greffon ou monté
# de version Expo, il faut un nouvel APK — `./publier-android.sh`. Le script
# le détecte et refuse de faire semblant.
#
set -euo pipefail
cd "$(dirname "$0")"

VERT=$'\033[0;32m'; ROUGE=$'\033[0;31m'; JAUNE=$'\033[0;33m'; GRIS=$'\033[0;90m'; RAZ=$'\033[0m'
titre() { printf '\n%s──  %s%s\n' "$JAUNE" "$1" "$RAZ"; }
ok()    { printf '   %s✓%s %s\n' "$VERT" "$RAZ" "$1"; }
info()  { printf '   %s%s%s\n' "$GRIS" "$1" "$RAZ"; }
echec() { printf '\n%s✗ %s%s\n\n' "$ROUGE" "$1" "$RAZ" >&2; exit 1; }

MESSAGE=""
SANS_MOBILE=0
SANS_WEB=0
NAS=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --sans-mobile) SANS_MOBILE=1; shift ;;
        --sans-web)    SANS_WEB=1; shift ;;
        --nas)         NAS="${2:?}"; shift 2 ;;
        -h|--help)     sed -n '2,30p' "$0" | sed 's/^# \?//'; exit 0 ;;
        -*)            echec "Option inconnue : $1" ;;
        *)             MESSAGE="$1"; shift ;;
    esac
done

[[ -n "$MESSAGE" ]] || echec "Dis ce qui change :  ./publier.sh \"correction du calcul des fibres\""
[[ -f front/app.json ]] || echec "Lance ce script depuis la racine du dépôt."

# ------------------------------------------------------- ce qui va partir

titre "Ce qui va partir"
if [[ -z "$(git status --porcelain)" ]]; then
    echec "Rien à publier : aucun fichier modifié."
fi
git status --short

# UNE MISE À JOUR JAVASCRIPT NE REMPLACE PAS L'APPLICATION.
#
# `eas update` ne livre que du JavaScript. Le code natif — les modules, les
# permissions, les greffons — est figé dans l'APK installé. Publier du
# JavaScript qui appelle un module absent fait planter l'application AU
# DÉMARRAGE, sur tous les téléphones, et on ne peut alors plus rien y pousser
# pour la réparer : il faut passer chez chacun avec un APK.
#
# `runtimeVersion` sur `appVersion` est le garde-fou d'Expo contre ça — mais
# il se contente de REFUSER l'installation, sans rien dire. Autant le voir ici.
NATIF=""
git diff --quiet HEAD -- front/package.json front/package-lock.json || NATIF="dépendances"
if ! git diff --quiet HEAD -- front/app.json; then
    if ! git show HEAD:front/app.json > /tmp/fitcarnet-app-avant.json 2>/dev/null; then
        NATIF="${NATIF:+$NATIF, }app.json"
    else
        CHANGE=$(python3 - <<'PY'
import json
def cle(chemin):
    d = json.load(open(chemin, encoding='utf-8'))['expo']
    # Le numéro de version change à CHAQUE publication d'APK : le compter
    # comme un changement natif ferait crier le script tous les jours pour
    # rien, et un avertissement qui crie tous les jours n'avertit plus.
    return json.dumps({c: d.get(c) for c in ('plugins', 'android', 'ios', 'sdkVersion')
                       if c != 'version'}, sort_keys=True)
print('oui' if cle('/tmp/fitcarnet-app-avant.json') != cle('front/app.json') else 'non')
PY
)
        [[ "$CHANGE" == "oui" ]] && NATIF="${NATIF:+$NATIF, }greffons ou configuration native"
    fi
fi

if [[ -n "$NATIF" ]] && (( ! SANS_MOBILE )); then
    printf '\n'
    echec "Du code NATIF a changé : $NATIF

   Une mise à jour JavaScript ne le livrerait pas. Les téléphones
   continueraient de tourner sur l'ancien code natif, et l'application
   planterait au démarrage si le nouveau JavaScript en dépend.

   Publie un APK :        ./publier-android.sh --notes \"$MESSAGE\"
   Ou, si tu es sûr que ce changement ne concerne pas les téléphones :
                          ./publier.sh \"$MESSAGE\" --sans-mobile"
fi

# ------------------------------------------------------------- 1. tests

titre "Tests du front"
( cd front && npm test >/dev/null 2>&1 ) \
    || echec "Les tests échouent. Corrige avant de publier :  cd front && npm test"
ok "au vert"

# --------------------------------------------------------- 2. build web

if (( SANS_WEB )); then
    info "build web ignoré (--sans-web)"
else
    titre "Front web"
    # `front/dist` est versionné : c'est lui que le NAS sert, et l'image de
    # production n'a pas Node pour le reconstruire. L'oublier donne un site
    # d'hier sur une API d'aujourd'hui — la seule panne silencieuse du
    # dispositif, et c'est pour la supprimer que ce script existe.
    ( cd front && npm run build:web >/tmp/fitcarnet-web.log 2>&1 ) \
        || { tail -25 /tmp/fitcarnet-web.log; echec "Le build web a échoué. Journal complet : /tmp/fitcarnet-web.log"; }
    ok "front/dist reconstruit"
fi

# ------------------------------------------------------ 3. commit + push

titre "Gitea"
git add -A
git commit -m "$MESSAGE" >/dev/null
git push >/dev/null 2>&1 || echec "Le push a échoué. Regarde :  git push"
ok "poussé sur master"

if [[ -n "$NAS" ]]; then
    info "déclenchement du déploiement sur $NAS…"
    ssh "$NAS" '/volume1/docker/fitcarnet/deployer-nas.sh' \
        || info "le déclenchement a échoué — le NAS prendra le commit tout seul dans les 5 minutes."
else
    info "le NAS prendra le commit dans les 5 minutes (tâche planifiée)."
fi

# ------------------------------------------------------- 4. les téléphones

if (( SANS_MOBILE )); then
    info "téléphones ignorés (--sans-mobile)"
else
    titre "Téléphones"

    # SANS `updates.url`, `eas update` PUBLIE DANS LE VIDE.
    #
    # La commande réussit, affiche un identifiant de publication, et aucun
    # téléphone ne voit jamais rien : l'application n'a pas d'adresse où
    # aller chercher. Rien dans la sortie ne le dit.
    A_UNE_ADRESSE=$(python3 -c "
import json
d = json.load(open('front/app.json', encoding='utf-8'))['expo']
print('oui' if (d.get('updates') or {}).get('url') else 'non')")

    if [[ "$A_UNE_ADRESSE" != "oui" ]]; then
        echec "\`updates.url\` est absent de front/app.json.

   \`eas update\` publierait sans erreur, et aucun téléphone ne verrait rien.
   Une fois pour toutes :

     cd front && eas update:configure

   Puis republie un APK — l'adresse doit être DANS l'application installée :

     ./publier-android.sh --notes \"$MESSAGE\""
    fi

    if command -v eas >/dev/null 2>&1; then EAS="eas"; else EAS="npx eas-cli@latest"; fi

    # ------------------------------------------------------------------
    #  L'ADRESSE DE PRODUCTION, IMPOSEE A `eas update`.
    #
    #  LE PIEGE, ET IL A COUTE UNE SOIREE : les variables `EXPO_PUBLIC_*` sont
    #  FIGEES DANS LE BUNDLE au moment de l'export. Or `eas update` exporte
    #  avec l'environnement de CETTE machine — donc `front/.env`, qui pointe
    #  sur le WSL de developpement. Le profil `production` d'`eas.json` ne
    #  sert qu'aux BUILDS, jamais aux mises a jour.
    #
    #  Consequence : l'APK sortait correct, et la premiere mise a jour
    #  JavaScript renvoyait les telephones vers `192.168.1.118`. Injoignable
    #  pour tout le monde, y compris toi hors de chez toi — et le telephone
    #  affichait la meme erreur que s'il etait simplement hors ligne.
    #
    #  On lit donc les valeurs dans `eas.json`, profil `production` — le seul
    #  endroit ou elles sont deja ecrites — et on les impose a la commande.
    # ------------------------------------------------------------------
    ENV_PROD=$(python3 -c "
import json
env = json.load(open('front/eas.json', encoding='utf-8'))['build']['production'].get('env', {})
print('\n'.join(f'{c}={v}' for c, v in env.items()))")

    [[ -n "$ENV_PROD" ]] || echec "Le profil « production » d'eas.json ne declare aucune variable.
   Sans elles, la mise a jour emporterait l'adresse de ton .env local."

    # UNE ADRESSE PRIVEE OU EN CLAIR NE DOIT JAMAIS PARTIR SUR LES TELEPHONES.
    URL_PROD=$(printf '%s\n' "$ENV_PROD" | sed -n 's/^EXPO_PUBLIC_API_URL=//p')
    case "$URL_PROD" in
        https://*) : ;;
        *) echec "EXPO_PUBLIC_API_URL du profil production vaut « $URL_PROD ».
   Ce n'est pas une adresse publique en HTTPS : les telephones ne la
   joindraient pas. Corrige front/eas.json." ;;
    esac
    case "$URL_PROD" in
        *192.168.*|*10.0.*|*localhost*|*127.0.0.1*)
            echec "EXPO_PUBLIC_API_URL du profil production est une adresse LOCALE :
   $URL_PROD" ;;
    esac
    info "adresse imposee aux telephones : $URL_PROD"

    ( cd front && env $ENV_PROD $EAS update --branch production --message "$MESSAGE" ) \
        || echec "\`eas update\` a échoué. Le code est poussé et le NAS l'aura :
   seuls les téléphones sont en retard. Relance :
     cd front && $EAS update --branch production --message \"$MESSAGE\""
    ok "publié sur la branche production"

    # LE CANAL DOIT POINTER SUR LA BRANCHE, ET RIEN NE LE VÉRIFIE AILLEURS.
    #
    # `eas update` publie sur une BRANCHE. L'application, elle, interroge un
    # CANAL. Les deux sont reliés par une association qu'on crée une fois — et
    # qui peut ne pas exister. Dans ce cas la publication réussit, le canal
    # répond « rien de neuf », et l'application se tait. Aucune erreur nulle
    # part, des deux côtés.
    #
    # On a passé une soirée dessus. Trois secondes de vérification ici valent
    # mieux qu'une deuxième.
    if ( cd front && $EAS channel:view production --non-interactive 2>/dev/null ) \
        | grep -q 'No branches are pointed to this channel'; then
        echec "Le canal « production » ne pointe sur AUCUNE branche.

   La mise à jour est publiée, mais aucun téléphone ne la verra : ils
   interrogent le canal, qui ne renvoie vers rien. Une fois pour toutes :

     cd front && eas channel:edit production --branch production"
    fi
    ok "canal production relié à sa branche"

    # `eas update` EXPORTE DANS `dist/` AVANT D'ENVOYER, et il y laisse tout :
    # les bundles Android et iOS, `metadata.json`, `assetmap.json` et une
    # soixantaine d'`assets/`. Rien de tout ça ne sert au NAS, qui ne publie
    # que le build web — mais au commit suivant, `git add -A` les emporterait.
    #
    # On remet donc `front/dist` dans l'état qu'on vient de commiter.
    git checkout -- front/dist 2>/dev/null || true
    git clean -fdq front/dist 2>/dev/null || true
    ok "front/dist remis au propre"
fi

printf '\n%s──  Publié%s\n\n' "$VERT" "$RAZ"
cat <<FIN
   API et site web   le NAS, dans les 5 minutes
   Téléphones        au prochain démarrage de l'application, sans rien demander
FIN
