import assert from 'node:assert/strict';
import test from 'node:test';

import { adresseDeLApi, PAR_DEFAUT } from './adresse';

test('page en HTTPS : l\'API est sur la même origine', () => {
  assert.equal(
    adresseDeLApi('http://192.168.1.118:8080/api', {
      protocol: 'https:',
      origin: 'https://carnet.mickael-pol.fr',
    }),
    'https://carnet.mickael-pol.fr/api',
  );
});

test('le HTTPS l\'emporte sur EXPO_PUBLIC_API_URL, et c\'est le sujet', () => {
  /* C'est exactement la panne : le dist publié portait l'adresse du poste de
     développement. Une variable de construction ne doit pas pouvoir renvoyer
     une page HTTPS vers une adresse en clair. */
  assert.equal(
    adresseDeLApi('http://192.168.1.118:8080/api', {
      protocol: 'https:',
      origin: 'https://autre.exemple.fr',
    }),
    'https://autre.exemple.fr/api',
  );
});

test('barre finale sur origin : jamais deux barres', () => {
  assert.equal(
    adresseDeLApi(undefined, { protocol: 'https:', origin: 'https://carnet.mickael-pol.fr/' }),
    'https://carnet.mickael-pol.fr/api',
  );
});

test('serveur de développement d\'Expo : on garde la variable', () => {
  /* `npm run web` sert le bundle sur `:8081` et NE SERT PAS l'API. C'est le
     seul cas web où la page et l'API vivent vraiment à deux endroits, et
     `EXPO_PUBLIC_API_URL` est alors la seule façon de savoir où aller.
     Le troisième argument dit « ce bundle est un bundle de développement ». */
  assert.equal(
    adresseDeLApi('http://localhost:8080/api', {
      protocol: 'http:',
      origin: 'http://localhost:8081',
    }, true),
    'http://localhost:8080/api',
  );
});

test('bundle construit servi en http : l\'API est sur la MÊME origine', () => {
  /* LA PANNE DU 18 SEPTEMBRE 2026, ET ELLE N'EST APPARUE QU'AVEC M5.
   *
   * `front/dist` est servi par Caddy, qui sert AUSSI l'API — en dév comme en
   * production. Mais la règle ne le disait que du HTTPS : en dév, un bundle
   * construit ouvert sur `http://localhost:8080` appelait l'adresse figée à la
   * construction, `http://192.168.1.118:8080/api`.
   *
   * Tant que la session tenait dans `localStorage`, ça marchait — deux
   * origines, mais le jeton voyageait dans un en-tête. Depuis M5 il est dans un
   * cookie `SameSite=Strict`, et `localhost` et `192.168.1.118` sont DEUX
   * SITES : le navigateur ne l'envoie jamais. Conséquence mesurée dans
   * Chromium : la connexion réussit, aucun cookie n'est posé, et le moindre
   * rechargement de page déconnecte.
   *
   * Le schéma n'a jamais été la bonne question. La vraie est : « ce bundle
   * a-t-il été servi par le serveur qui sert l'API ? » — et la réponse est oui
   * pour tout bundle CONSTRUIT, non pour le serveur de développement d'Expo. */
  assert.equal(
    adresseDeLApi('http://192.168.1.118:8080/api', {
      protocol: 'http:',
      origin: 'http://localhost:8080',
    }, false),
    'http://localhost:8080/api',
  );
});

test('un bundle construit ouvert sur l\'IP reste sur l\'IP', () => {
  /* La même règle dans l'autre sens : on suit la page, quelle qu'elle soit.
     C'est ce qui permet d'ouvrir le dév depuis un téléphone du réseau. */
  assert.equal(
    adresseDeLApi('http://localhost:8080/api', {
      protocol: 'http:',
      origin: 'http://192.168.1.118:8080',
    }, false),
    'http://192.168.1.118:8080/api',
  );
});

test('application native : pas d\'emplacement, on garde la variable', () => {
  assert.equal(
    adresseDeLApi('https://carnet.mickael-pol.fr/api', null),
    'https://carnet.mickael-pol.fr/api',
  );
});

test('rien de configuré, hors HTTPS : le WSL de développement', () => {
  assert.equal(adresseDeLApi(undefined, null), PAR_DEFAUT);
  assert.equal(adresseDeLApi('', null), PAR_DEFAUT);
});
