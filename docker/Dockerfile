# =====================================================================
#  fitcarnet — API Symfony sur FrankenPHP (mode classique)
#  Un seul service : sert l'API ET le front React statique.
#  PHP 8.3 : version éprouvée, compatible Symfony 7.x et API Platform 4.
# =====================================================================

# ---------- base commune ----------
FROM dunglas/frankenphp:1-php8.3 AS base

# extensions : PostgreSQL, intl (dates/locales FR), zip, opcache
RUN install-php-extensions \
        pdo_pgsql \
        intl \
        zip \
        opcache \
        apcu

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

ENV SERVER_NAME=":80"
# racine servie par Caddy : le public/ de Symfony
ENV FRANKENPHP_CONFIG=""

# ---------- développement ----------
FROM base AS dev

# Xdebug + outils de confort
RUN install-php-extensions xdebug \
 && apt-get update && apt-get install -y --no-install-recommends git unzip \
 && rm -rf /var/lib/apt/lists/*

ENV APP_ENV=dev
RUN mv "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini" \
 && { \
      echo 'memory_limit=512M'; \
      echo 'date.timezone=Europe/Paris'; \
    } > "$PHP_INI_DIR/conf.d/fitcarnet.ini" \
 && { \
      echo 'xdebug.mode=debug,develop'; \
      echo 'xdebug.start_with_request=trigger';   \
      echo 'xdebug.client_host=host.docker.internal'; \
      echo 'xdebug.client_port=9003'; \
      echo 'xdebug.idekey=PHPSTORM'; \
      echo 'xdebug.log_level=0'; \
      echo 'xdebug.discover_client_host=false'; \
    } > "$PHP_INI_DIR/conf.d/xdebug.ini"

# start_with_request=trigger : Xdebug ne se déclenche QUE sur demande
# (bouton « écouter » de PhpStorm + cookie/param XDEBUG_TRIGGER).
# Passe à "yes" si tu veux qu'il s'attache à chaque requête.

# --watch : FrankenPHP recharge à chaud dès qu'un fichier PHP change
CMD ["frankenphp", "run", "--config", "/etc/frankenphp/Caddyfile", "--watch"]

# ---------- production ----------
FROM base AS prod

# Trois outils, trois raisons precises :
#   - git et unzip : composer en a besoin pour poser les paquets. L'etape
#     `dev` les avait, pas `prod` — et depuis que le conteneur installe
#     lui-meme ses dependances au demarrage, il lui les faut aussi.
#   - postgresql-client : les migrations de `db/manuel/` sont du SQL joue par
#     psql, meta-commandes comprises (`\gset`, `\if`). Doctrine ne sait pas
#     les executer ; psql si.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git unzip postgresql-client \
 && rm -rf /var/lib/apt/lists/*

ENV APP_ENV=prod

# LES DEUX DERNIERES PAIRES DE LIGNES CI-DESSOUS SONT NOUVELLES. POURQUOI.
#
# `opcache.preload` — `api/config/preload.php` existait depuis toujours et n'a
# JAMAIS servi : sans cette directive, PHP ne le lit pas. Chaque requete
# redemarrait donc le noyau Symfony au complet (autoload, conteneur de
# services, metadonnees Doctrine) alors que ce fichier est fait pour les garder
# en memoire partagee une fois pour toutes.
#
#   L'ORDRE EST DEJA BON, ET C'EST CE QUI REND LA DIRECTIVE SURE : dans
#   `entrypoint-prod.sh`, `cache:warmup` tourne AVANT le `exec` qui lance
#   FrankenPHP. Le fichier compile existe donc quand PHP demarre. S'il
#   manquait, `preload.php` ne fait rien — il teste sa presence avant
#   d'inclure quoi que ce soit.
#
#   `preload_user=root` N'EST PAS UN OUBLI DE DURCISSEMENT : PHP REFUSE tout
#   prechargement lorsqu'il tourne en root sans cette valeur, et cette image
#   n'a pas de directive USER. Sans elle, le prechargement serait simplement
#   ignore — soit exactement la situation qu'on corrige.
#
# `opcache.jit` — gain modeste et honnetement incertain sur une charge dominee
# par le SQL et la serialisation. Purement additif.
#
# SI L'APPLICATION NE DEMARRE PLUS APRES CE CHANGEMENT, c'est ici qu'il faut
# regarder en premier : `docker logs fitcarnet-app` nommera la directive
# fautive des les premieres lignes.
RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
 && { \
      echo 'memory_limit=256M'; \
      echo 'date.timezone=Europe/Paris'; \
      echo 'expose_php=Off'; \
      echo 'opcache.enable=1'; \
      echo 'opcache.memory_consumption=128'; \
      echo 'opcache.max_accelerated_files=20000'; \
      echo 'opcache.validate_timestamps=0'; \
      echo 'realpath_cache_size=4096K'; \
      echo 'realpath_cache_ttl=600'; \
      echo 'opcache.preload=/app/config/preload.php'; \
      echo 'opcache.preload_user=root'; \
      echo 'opcache.jit=tracing'; \
      echo 'opcache.jit_buffer_size=64M'; \
    } > "$PHP_INI_DIR/conf.d/fitcarnet.ini"

# Ce qui doit etre vrai avant que l'application reponde : dependances, cles
# JWT, migrations, cache. Voir `entrypoint-prod.sh` — c'est lui qui rend le
# deploiement possible sans ouvrir un terminal sur le NAS.
COPY entrypoint-prod.sh /usr/local/bin/entrypoint-prod
RUN chmod +x /usr/local/bin/entrypoint-prod

ENTRYPOINT ["/usr/local/bin/entrypoint-prod"]

# La commande par defaut de l'image de base ne designe pas forcement le
# Caddyfile que la stack monte. On l'ecrit, comme le fait deja l'etape `dev` :
# une montee de version de FrankenPHP ne doit pas changer le fichier lu.
CMD ["frankenphp", "run", "--config", "/etc/frankenphp/Caddyfile"]
