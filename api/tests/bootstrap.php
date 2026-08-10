<?php

use Symfony\Component\Dotenv\Dotenv;

require dirname(__DIR__).'/vendor/autoload.php';

/*
 * `.env` est dans le .gitignore de ce projet — les variables vivent dans la
 * stack Docker, pas dans un fichier versionne. Sur un clone frais, il n'existe
 * donc pas, et `bootEnv()` levait une PathException AVANT le premier test :
 * la suite entiere etait injouable sans qu'on sache pourquoi, et le message
 * parlait d'un fichier d'environnement plutot que de tests.
 *
 * Les tests de ce projet sont des tests UNITAIRES : ils n'ouvrent ni base, ni
 * noyau, ni reseau. Ils n'ont besoin d'aucune variable. On charge donc
 * l'environnement s'il est la — un poste qui en a un doit le voir respecte —
 * et on s'en passe sinon, plutot que d'exiger un fichier pour rien.
 */
if (\is_file(dirname(__DIR__).'/.env') || \is_file(dirname(__DIR__).'/.env.dist')) {
    (new Dotenv())->bootEnv(dirname(__DIR__).'/.env');
}

if ($_SERVER['APP_DEBUG'] ?? false) {
    umask(0000);
}
