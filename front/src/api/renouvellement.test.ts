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
function depotDEssai(
  rafraichissement: string | null,
  /* Le défaut est le TÉLÉPHONE, parce que c'est le cas historique : tous les
     tests écrits avant M5 doivent continuer de dire exactement ce qu'ils
     disaient. Le web se demande explicitement, cas par cas. */
  sessionParCookie = false,
): DepotJetons & {
  jetonEcrit: string | null;
  rafraichissementEcrit: string | null;
  sessionTerminee: boolean;
} {
  const etat = {
    jetonEcrit: null as string | null,
    rafraichissementEcrit: null as string | null,
    sessionTerminee: false,
    sessionParCookie,

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

/* ------------------------------------------------------------------------
 *  LE MODE COOKIE — constat M5, 18 septembre 2026.
 *
 *  Sur le web, le jeton de rafraîchissement n'est plus lisible d'ici : il vit
 *  dans un cookie `HttpOnly` que le navigateur envoie tout seul. `null` cesse
 *  donc de vouloir dire « plus de session » et se met à vouloir dire « je ne
 *  peux pas le voir » — deux choses opposées derrière la même valeur, et
 *  c'est exactement le genre de confusion qui coûte une déconnexion à chaque
 *  rechargement de page.
 * --------------------------------------------------------------------- */

test('sur le web, l\'absence de jeton lisible NE termine PAS la session', async () => {
  /* LE TEST QUI EMPÊCHE LA PANNE LA PLUS BÊTE DE M5. Le web démarre TOUJOURS
     dans cet état : rien en mémoire, un cookie que seul le serveur voit. Si
     cette branche terminait la session comme sur le téléphone, l'application
     web renverrait vers l'écran de connexion à chaque rafraîchissement de
     page — y compris quelqu'un de parfaitement connecté. */
  const depot = depotDEssai(null, true);
  let appels = 0;

  const ok = await renouvelerJeton('https://api.test', depot, () => {
    appels += 1;

    return Promise.resolve(reponse({ token: 'jwt-neuf' }));
  });

  assert.equal(ok, true);
  assert.equal(appels, 1, 'le serveur est le seul à voir le cookie : il faut l\'appeler');
  assert.equal(depot.sessionTerminee, false);
  assert.equal(depot.jetonEcrit, 'jwt-neuf');
});

test('sur le web, la requête emporte le cookie et demande le mode cookie', async () => {
  const depot = depotDEssai(null, true);
  let vu: RequestInit | undefined;

  await renouvelerJeton('https://api.test', depot, (_url, options) => {
    vu = options;

    return Promise.resolve(reponse({ token: 'jwt-neuf' }));
  });

  assert.equal(vu?.credentials, 'include',
    'sans `include`, le cookie ne part pas quand la page et l\'API ont deux origines');
  assert.deepEqual(JSON.parse(String(vu?.body)), { cookieDeSession: true },
    'le corps ne porte QUE la demande : il n\'y a plus de jeton à envoyer');
});

test('la bascule envoie l\'ancien jeton une dernière fois, et le serveur rend un cookie', async () => {
  /* Le jour de la mise à jour, un navigateur porte encore l'ancien jeton dans
     `localStorage`. Il l'envoie UNE fois en demandant le mode cookie ; le
     serveur lui pose un cookie et ne renvoie plus rien dans le corps.
     Personne n'a eu à se reconnecter. */
  const depot = depotDEssai('ancien-jeton-du-localstorage', true);
  let vu: RequestInit | undefined;

  const ok = await renouvelerJeton('https://api.test', depot, (_url, options) => {
    vu = options;

    return Promise.resolve(reponse({ token: 'jwt-neuf' }));
  });

  assert.equal(ok, true);
  assert.deepEqual(JSON.parse(String(vu?.body)), {
    cookieDeSession: true,
    jetonRafraichissement: 'ancien-jeton-du-localstorage',
  });
});

test('sur le web, un jeton renvoyé dans le corps N\'est PAS rangé', async () => {
  /* LA GARDE DE DERNIER RECOURS. Le serveur de M5 n'en renvoie plus ; un
     serveur d'une version antérieure, ou une bascule à moitié déployée, en
     renverrait un — et le ranger le remettrait exactement là d'où on vient de
     le sortir. Le client refuse, quelle que soit la réponse. */
  const depot = depotDEssai(null, true);

  await renouvelerJeton('https://api.test', depot, () => Promise.resolve(
    reponse({ token: 'jwt-neuf', jetonRafraichissement: 'ne-devrait-pas-arriver' })));

  assert.equal(depot.rafraichissementEcrit, null,
    'sur le web, rien ne se range : c\'est tout l\'objet de M5');
});

test('sur le web, un 401 termine quand même la session', async () => {
  /* Le serveur est le seul juge : s'il refuse, c'est qu'il n'y a pas de
     cookie valable, et là l'absence veut bien dire ce qu'elle dit. */
  const depot = depotDEssai(null, true);

  const ok = await renouvelerJeton('https://api.test', depot,
    () => Promise.resolve(reponse({ detail: 'Session expiree' }, 401)));

  assert.equal(ok, false);
  assert.equal(depot.sessionTerminee, true);
});

test('sur le téléphone, rien ne change : pas de cookie, pas d\'`include`', async () => {
  /* LE JUMEAU QU'ON N'OUBLIE PAS. L'application installée ne doit pas
     s'apercevoir de ce chantier. */
  const depot = depotDEssai('cle-du-coffre');
  let vu: RequestInit | undefined;

  await renouvelerJeton('https://api.test', depot, (_url, options) => {
    vu = options;

    return Promise.resolve(reponse({ token: 'jwt-neuf', jetonRafraichissement: 'cle-du-coffre' }));
  });

  assert.equal(vu?.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(String(vu?.body)), { jetonRafraichissement: 'cle-du-coffre' });
  assert.equal(depot.rafraichissementEcrit, 'cle-du-coffre',
    'sur le téléphone, le coffre garde bien le jeton');
});
