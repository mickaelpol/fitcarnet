import { test } from 'node:test';
import assert from 'node:assert/strict';

import { creerEnvoyeur } from './envoiSerialise';
import type { EtatSauvegarde } from './envoiSerialise';

/**
 * UN ENVOI À LA FOIS, ET AUCUNE SAISIE PERDUE.
 *
 * CE QUI SE PASSAIT EN SALLE.
 *
 * `useSauvegardeAuto` abandonnait purement l'envoi si un autre était déjà en
 * vol — `if (v === null || enCours.current) return;` — sans rien reprogrammer.
 * On coche une série (l'envoi part, deux secondes de réseau), on tape la
 * charge suivante, on appuie sur Retour : le démontage appelle `vider()`, qui
 * trouve un envoi en cours, et **la charge n'est jamais envoyée**. Rien ne le
 * signale. C'est exactement le cas que le commentaire de la fonction dit
 * couvrir.
 *
 * Second symptôme, en usage normal : si la minuterie de 2,5 s tombait pendant
 * un envoi, la modification restait à « attente » jusqu'à la frappe suivante.
 * Rien ne repartait tout seul.
 */

/** Une promesse qu'on résout à la main, pour tenir un envoi « en vol ». */
function enAttente<T = void>(): { promesse: Promise<T>; resoudre: (v: T) => void } {
  let resoudre!: (v: T) => void;
  const promesse = new Promise<T>((r) => { resoudre = r as (v: T) => void; });

  return { promesse, resoudre };
}

const journalDEssai = () => {
  const etats: EtatSauvegarde[] = [];
  const motifs: (string | null)[] = [];

  return {
    etats,
    motifs,
    etat: (e: EtatSauvegarde) => { etats.push(e); },
    motif: (m: string | null) => { motifs.push(m); },
  };
};

test('une valeur arrivée pendant un envoi n\'est pas perdue', async () => {
  const vol = enAttente();
  const envoyes: string[] = [];
  let courante = 'charge 60';

  const journal = journalDEssai();
  const envoyeur = creerEnvoyeur<string>(async (v) => {
    envoyes.push(v);
    if (envoyes.length === 1) await vol.promesse;
  }, journal);

  // premier envoi : il part et reste en vol
  const premier = envoyeur.envoyer(() => courante);

  // pendant ce temps, l'utilisateur tape la charge suivante puis quitte l'écran
  courante = 'charge 65';
  await envoyeur.envoyer(() => courante);

  vol.resoudre();
  await premier;

  assert.deepEqual(envoyes, ['charge 60', 'charge 65'],
    'la seconde saisie doit partir après la première, jamais être abandonnée');
});

test('deux valeurs pendant un envoi : seule la dernière part', async () => {
  /* On ne rejoue pas l'historique des frappes : l'état final suffit, et
     envoyer les états intermédiaires ferait trois écritures pour rien. */
  const vol = enAttente();
  const envoyes: string[] = [];
  let courante = 'a';

  const envoyeur = creerEnvoyeur<string>(async (v) => {
    envoyes.push(v);
    if (envoyes.length === 1) await vol.promesse;
  }, journalDEssai());

  const premier = envoyeur.envoyer(() => courante);
  courante = 'b';
  await envoyeur.envoyer(() => courante);
  courante = 'c';
  await envoyeur.envoyer(() => courante);

  vol.resoudre();
  await premier;

  assert.deepEqual(envoyes, ['a', 'c']);
});

test('la même valeur n\'est pas réécrite', async () => {
  const envoyes: string[] = [];
  const envoyeur = creerEnvoyeur<string>((v) => {
    envoyes.push(v);

    return Promise.resolve();
  }, journalDEssai());

  await envoyeur.envoyer(() => 'même');
  await envoyeur.envoyer(() => 'même');

  assert.deepEqual(envoyes, ['même']);
});

test('une valeur nulle ne déclenche rien', async () => {
  const envoyes: string[] = [];
  const envoyeur = creerEnvoyeur<string>((v) => {
    envoyes.push(v);

    return Promise.resolve();
  }, journalDEssai());

  await envoyeur.envoyer(() => null);

  assert.deepEqual(envoyes, []);
});

test('un échec est rapporté avec son motif', async () => {
  const journal = journalDEssai();
  const envoyeur = creerEnvoyeur<string>(
    () => Promise.reject(new Error('le réseau est tombé')), journal);

  await envoyeur.envoyer(() => 'valeur');

  assert.ok(journal.etats.includes('erreur'));
  assert.ok(journal.motifs.includes('le réseau est tombé'),
    'le motif, pas seulement le fait qu\'il y ait eu un échec');
});

test('après un échec, une nouvelle saisie repart', async () => {
  /* Un échec ne doit pas condamner la séance : la valeur suivante retente. */
  const envoyes: string[] = [];
  let premierAppel = true;

  const envoyeur = creerEnvoyeur<string>((v) => {
    envoyes.push(v);
    if (premierAppel) { premierAppel = false; return Promise.reject(new Error('boum')); }

    return Promise.resolve();
  }, journalDEssai());

  await envoyeur.envoyer(() => 'première');
  await envoyeur.envoyer(() => 'seconde');

  assert.deepEqual(envoyes, ['première', 'seconde']);
});

test('un échec ne fige pas la valeur comme enregistrée', async () => {
  /* Sinon la même saisie, retentée, serait prise pour un doublon et jamais
     réécrite — la séance resterait perdue en silence. */
  const envoyes: string[] = [];
  let echoue = true;

  const envoyeur = creerEnvoyeur<string>((v) => {
    envoyes.push(v);
    if (echoue) return Promise.reject(new Error('boum'));

    return Promise.resolve();
  }, journalDEssai());

  await envoyeur.envoyer(() => 'charge 60');
  echoue = false;
  await envoyeur.envoyer(() => 'charge 60');

  assert.deepEqual(envoyes, ['charge 60', 'charge 60']);
});

test('les états suivent la vie de l\'envoi', async () => {
  const journal = journalDEssai();
  const envoyeur = creerEnvoyeur<string>(() => Promise.resolve(), journal);

  await envoyeur.envoyer(() => 'valeur');

  assert.deepEqual(journal.etats, ['envoi', 'enregistre']);
});
