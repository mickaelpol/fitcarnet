import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renouvelerJeton, type DepotJetons } from './renouvellement';

/**
 * RENOUVELER LE JETON — ET SAVOIR QUAND LA SESSION EST MORTE.
 *
 * LA PORTE FERMÉE DE L'INTÉRIEUR.
 *
 * Le jeton de rafraîchissement disparaît (SecureStore réinitialisé, données de
 * site effacées, APK antérieur à la fonctionnalité). Le JWT, lui, survit puis
 * expire. Trois décisions correctes séparément s'enfermaient alors :
 *
 *   1. le renouvellement rendait `false` SANS terminer la session — le JWT mort
 *      restait dans le coffre ;
 *   2. le portier de `_layout.tsx` ne teste que la PRÉSENCE d'une chaîne : un
 *      JWT expiré comptait donc comme « connecté », et il refusait d'aller vers
 *      l'écran de connexion ;
 *   3. l'onglet Compte affiche son erreur AVANT son bouton « Se déconnecter »,
 *      le seul de toute l'application.
 *
 * Tous les écrans affichaient « Identifiants incorrects. » avec un « Réessayer »
 * qui ne pouvait pas réussir. Seule issue : effacer les données de l'app.
 *
 * C'est le premier point qui se répare ici : sans jeton de rafraîchissement, il
 * n'y a plus de session — on le dit, au lieu de rendre `false` en silence.
 */

/** Un dépôt de jetons en mémoire, qui note ce qu'on lui demande. */
function depotDEssai(rafraichissement: string | null): DepotJetons & {
  jetonEcrit: string | null;
  rafraichissementEcrit: string | null;
  sessionTerminee: boolean;
} {
  const etat = {
    jetonEcrit: null as string | null,
    rafraichissementEcrit: null as string | null,
    sessionTerminee: false,

    lireRafraichissement: () => Promise.resolve(rafraichissement),
    definirJeton: (v: string) => { etat.jetonEcrit = v; return Promise.resolve(); },
    definirRafraichissement: (v: string) => { etat.rafraichissementEcrit = v; return Promise.resolve(); },
    terminerSession: () => { etat.sessionTerminee = true; return Promise.resolve(); },
  };

  return etat;
}

const reponse = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut });

test('sans jeton de rafraîchissement, la session est terminée au lieu d\'être laissée morte', async () => {
  const depot = depotDEssai(null);
  let appels = 0;

  const ok = await renouvelerJeton('https://api.test', depot, () => {
    appels += 1;

    return Promise.resolve(reponse({}));
  });

  assert.equal(ok, false);
  assert.equal(appels, 0, 'inutile d\'appeler le serveur sans jeton à présenter');
  assert.equal(depot.sessionTerminee, true,
    'sans jeton de rafraîchissement il n\'y a plus de session : le JWT mort doit partir du coffre');
});

test('un refus du serveur termine la session', async () => {
  const depot = depotDEssai('cle-revoquee');

  const ok = await renouvelerJeton('https://api.test', depot,
    () => Promise.resolve(reponse({ erreur: 'révoqué' }, 401)));

  assert.equal(ok, false);
  assert.equal(depot.sessionTerminee, true);
});

test('une panne réseau ne déconnecte personne', async () => {
  /* Une coupure de métro n'est pas une révocation. Terminer la session ici
     obligerait à retaper son mot de passe à chaque tunnel. */
  const depot = depotDEssai('cle-valable');

  await assert.rejects(
    renouvelerJeton('https://api.test', depot, () => Promise.reject(new Error('réseau'))));

  assert.equal(depot.sessionTerminee, false);
});

test('une erreur serveur passagère ne déconnecte pas non plus', async () => {
  const depot = depotDEssai('cle-valable');

  const ok = await renouvelerJeton('https://api.test', depot,
    () => Promise.resolve(reponse({ erreur: 'indisponible' }, 503)));

  assert.equal(ok, false);
  assert.equal(depot.sessionTerminee, false, 'un 503 est passager, pas un refus');
});

test('un renouvellement réussi range le nouveau jeton', async () => {
  const depot = depotDEssai('cle-valable');

  const ok = await renouvelerJeton('https://api.test', depot,
    () => Promise.resolve(reponse({ token: 'jwt-neuf' })));

  assert.equal(ok, true);
  assert.equal(depot.jetonEcrit, 'jwt-neuf');
  assert.equal(depot.sessionTerminee, false);
});

test('un jeton de rafraîchissement renvoyé remplace l\'ancien', async () => {
  const depot = depotDEssai('cle-valable');

  await renouvelerJeton('https://api.test', depot,
    () => Promise.resolve(reponse({ token: 'jwt-neuf', jetonRafraichissement: 'cle-neuve' })));

  assert.equal(depot.rafraichissementEcrit, 'cle-neuve');
});

test('une réponse sans jeton ne déconnecte pas : c\'est le serveur qui est en faute', async () => {
  const depot = depotDEssai('cle-valable');

  const ok = await renouvelerJeton('https://api.test', depot,
    () => Promise.resolve(reponse({ rien: true })));

  assert.equal(ok, false);
  assert.equal(depot.sessionTerminee, false);
  assert.equal(depot.jetonEcrit, null);
});

test('le jeton présenté part bien dans le corps de la requête', async () => {
  const depot = depotDEssai('cle-a-presenter');
  let corpsRecu: string | null = null;
  let cheminRecu: string | null = null;

  await renouvelerJeton('https://api.test', depot, (url, options) => {
    cheminRecu = String(url);
    corpsRecu = String((options as RequestInit).body);

    return Promise.resolve(reponse({ token: 'jwt-neuf' }));
  });

  assert.equal(cheminRecu, 'https://api.test/jeton/rafraichir');
  assert.deepEqual(JSON.parse(corpsRecu ?? '{}'), { jetonRafraichissement: 'cle-a-presenter' });
});
