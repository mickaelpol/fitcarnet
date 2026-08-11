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

test('web de développement en http : on garde la variable', () => {
  assert.equal(
    adresseDeLApi('http://localhost:8080/api', {
      protocol: 'http:',
      origin: 'http://localhost:8081',
    }),
    'http://localhost:8080/api',
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
