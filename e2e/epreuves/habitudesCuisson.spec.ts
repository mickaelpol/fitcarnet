import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import {
  creerCompte, habitudesDe, jetonDe, supprimerCompte,
} from './compteJetable';

/**
 * LE TRI DE L'INCHANGÉ, ET LA CLAUSE QUI LE FAIT — 25 septembre 2026.
 *
 * CE QUE CETTE ÉPREUVE GARDE. Jusqu'à cette date, l'écran comparait lui-même
 * ce qu'il venait de décider à ce qu'il croyait déjà enregistré, et
 * n'envoyait que les écarts. C'était le cinquième double juge du projet — la
 * même règle, « la dernière décision gagne, et l'inchangé ne s'écrit pas »,
 * tenue dans deux langages — et il avait un défaut mesuré : requête en pause,
 * `mesCuissons.data` valait `undefined`, l'écran croyait ne rien connaître et
 * réécrivait TOUT le plan, une trentaine de `maj_le` repoussés sans raison.
 *
 * Désormais l'écran envoie TOUT ce qu'il affiche, sans juger, et c'est la
 * clause SQL `ON CONFLICT … DO UPDATE … WHERE cuisson_habituelle.mode_cuisson_id
 * IS DISTINCT FROM EXCLUDED.mode_cuisson_id` (`CuissonsHabituelles::remplacer`)
 * qui tranche ce qui bouge vraiment.
 *
 * POURQUOI ÇA DEMANDE UNE ÉPREUVE DE BOUT EN BOUT. Les suites PHPUnit du
 * serveur tournent sans base : aucune d'elles ne peut voir l'effet d'un
 * `ON CONFLICT`, qui n'existe que devant une vraie table. Seul un aller-retour
 * réel — un `PUT` puis une lecture directe de `cuisson_habituelle` — montre
 * que la ligne inchangée ne bouge pas et que celle qui change, elle, bouge.
 *
 * CES SIX ÉPREUVES PASSENT PAR LA ROUTE DIRECTEMENT, SANS ÉCRAN. Le contrat
 * exercé ici est celui du serveur (`PUT /api/mes-cuissons` → la base) ; ce que
 * l'écran en fait — envoyer tout, sans juger — est un choix du FRONT qui n'a
 * plus de règle à trahir : il n'y a plus rien à comparer côté écran. Le seul
 * geste d'écran qui reste à éprouver, « cliquer deux fois sur Cuisiner
 * n'envoie pas deux fois la même chose », est en bas de ce fichier — et
 * abandonné, avec sa raison.
 */

const BASE = process.env.FITCARNET_URL ?? 'http://localhost:8080';
const CONTENEUR_BASE = 'fitcarnet-db-dev';

/** Envoie un lot d'habitudes par la vraie route, comme le fait l'écran. */
async function enregistrer(
  email: string,
  habitudes: { aliment: string; mode: number | null }[],
): Promise<{ enregistrees: number } | { erreur: string }> {
  const reponse = await fetch(`${BASE}/api/mes-cuissons`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await jetonDe(email)}`,
    },
    body: JSON.stringify({ habitudes }),
  });

  return reponse.json() as Promise<{ enregistrees: number } | { erreur: string }>;
}

/**
 * Les identifiants de modes de cuisson RÉELLEMENT présents au catalogue.
 *
 * LUS EN BASE, ET NON SUPPOSÉS : le catalogue est partagé entre tous les
 * comptes (`mode_cuisson`), et rien ne garantit que les identifiants 1 et 2
 * existent sur une base fraîchement reconstituée — seul l'ORDRE des lignes
 * insérées par le jeu de démonstration le garantirait, ce qui n'est pas une
 * chose à supposer dans une épreuve.
 */
function modesConnus(): number[] {
  const sortie = execFileSync('docker', [
    'exec', CONTENEUR_BASE, 'psql', '-U', 'fitcarnet', '-tAc',
    'SELECT id FROM mode_cuisson ORDER BY id',
  ], { encoding: 'utf-8' }).trim();

  return sortie === '' ? [] : sortie.split('\n').map(Number);
}

/** Une pause franche : `maj_le` a une résolution microseconde, mais on ne
 * chipote pas — quelques dizaines de millisecondes suffisent à rendre un écart
 * indiscutable si jamais la ligne était (à tort) réécrite. */
const pause = (ms: number) => new Promise((resoudre) => { setTimeout(resoudre, ms); });

test.describe('les habitudes de cuisson : le tri de l\'inchangé', () => {
  let email = '';
  let modeA = 0;
  let modeB = 0;

  test.beforeEach(() => {
    email = creerCompte('habitudes');
    const modes = modesConnus();
    expect(modes.length).toBeGreaterThanOrEqual(2);
    [modeA, modeB] = modes;
  });
  test.afterEach(() => { supprimerCompte(email); });

  // CA-4
  test('un aliment jamais décidé, envoyé à `null`, s\'enregistre comme « sans cuisson »',
    async () => {
      const reponse = await enregistrer(email, [{ aliment: 'skyr', mode: null }]);

      expect(reponse).toEqual({ enregistrees: 1 });

      const lignes = habitudesDe(email);
      expect(lignes).toEqual([{ aliment: 'skyr', mode: null, majLe: expect.any(Number) }]);
    });

  // CA-2
  test('renvoyer EXACTEMENT le même mode ne change rien, ni la réponse ni `maj_le`',
    async () => {
      await enregistrer(email, [{ aliment: 'riz basmati', mode: modeA }]);
      const [avant] = habitudesDe(email);
      expect(avant).toBeDefined();

      /* Pause franche avant le second envoi : si la ligne était (à tort)
         réécrite, l'écart de `maj_le` serait sans ambiguïté possible. */
      await pause(50);

      const reponse = await enregistrer(email, [{ aliment: 'riz basmati', mode: modeA }]);

      expect(reponse).toEqual({ enregistrees: 0 });

      const [apres] = habitudesDe(email);
      expect(apres?.mode).toBe(modeA);
      expect(apres?.majLe).toBe(avant?.majLe);
    });

  // CA-3
  test('renvoyer un AUTRE mode existant enregistre le changement et avance `maj_le`',
    async () => {
      await enregistrer(email, [{ aliment: 'riz basmati', mode: modeA }]);
      const [avant] = habitudesDe(email);

      await pause(50);

      const reponse = await enregistrer(email, [{ aliment: 'riz basmati', mode: modeB }]);

      expect(reponse).toEqual({ enregistrees: 1 });

      const [apres] = habitudesDe(email);
      expect(apres?.mode).toBe(modeB);
      expect(apres?.majLe).toBeGreaterThan(avant?.majLe ?? 0);
    });

  // CA-4 bis (le retour à null)
  test('un mode entier qui repasse à `null` s\'enregistre — `IS DISTINCT FROM`, pas `<>`',
    async () => {
      await enregistrer(email, [{ aliment: 'riz basmati', mode: modeA }]);
      await pause(50);

      /* SANS `IS DISTINCT FROM`, `mode_cuisson_id <> EXCLUDED.mode_cuisson_id`
         vaudrait `NULL` dès que l'un des deux côtés est `NULL` — donc ni vrai
         ni faux, et PostgreSQL ne réécrirait JAMAIS la ligne dans ce sens. */
      const versNull = await enregistrer(email, [{ aliment: 'riz basmati', mode: null }]);
      expect(versNull).toEqual({ enregistrees: 1 });
      expect(habitudesDe(email)).toEqual([
        { aliment: 'riz basmati', mode: null, majLe: expect.any(Number) },
      ]);

      /* Et l'inverse doit bouger aussi : de `null` vers un entier. */
      await pause(50);
      const versEntier = await enregistrer(email, [{ aliment: 'riz basmati', mode: modeA }]);
      expect(versEntier).toEqual({ enregistrees: 1 });
      expect(habitudesDe(email)).toEqual([
        { aliment: 'riz basmati', mode: modeA, majLe: expect.any(Number) },
      ]);
    });

  // CA-5
  test('DEUX décisions du même aliment dans UN SEUL envoi : la dernière gagne',
    async () => {
      await enregistrer(email, [{ aliment: 'riz basmati', mode: modeA }]);

      /* Un seul appel HTTP, un seul corps — et deux fois « riz basmati ».
         `LotDHabitudes::depuis` dédoublonne AVANT d'écrire : sans quoi
         PostgreSQL refuserait le lot entier (« command cannot affect row a
         second time »). */
      const reponse = await enregistrer(email, [
        { aliment: 'riz basmati', mode: modeA },
        { aliment: 'riz basmati', mode: modeB },
      ]);

      expect(reponse).toEqual({ enregistrees: 1 });
      expect(habitudesDe(email)).toEqual([
        { aliment: 'riz basmati', mode: modeB, majLe: expect.any(Number) },
      ]);
    });

  // CA-8
  test('dans un lot de plusieurs habitudes, seule celle qui change est comptée',
    async () => {
      await enregistrer(email, [
        { aliment: 'riz basmati', mode: modeA },
        { aliment: 'skyr', mode: null },
        { aliment: 'poulet', mode: modeB },
      ]);
      const avant = habitudesDe(email);
      expect(avant).toHaveLength(3);

      await pause(50);

      /* Seul le poulet change de mode ; les deux autres sont renvoyés à
         l'identique, comme le fait l'écran depuis le 25 septembre 2026 — il
         n'envoie plus que ce qu'il affiche, sans juger ce qui a changé. */
      const reponse = await enregistrer(email, [
        { aliment: 'riz basmati', mode: modeA },
        { aliment: 'skyr', mode: null },
        { aliment: 'poulet', mode: modeA },
      ]);

      expect(reponse).toEqual({ enregistrees: 1 });

      const apres = habitudesDe(email);
      const parAliment = (l: typeof apres) => Object.fromEntries(l.map((h) => [h.aliment, h]));
      const avantParAliment = parAliment(avant);
      const apresParAliment = parAliment(apres);

      expect(apresParAliment.poulet?.mode).toBe(modeA);
      expect(apresParAliment.poulet?.majLe).toBeGreaterThan(avantParAliment.poulet?.majLe ?? 0);

      expect(apresParAliment['riz basmati']?.majLe).toBe(avantParAliment['riz basmati']?.majLe);
      expect(apresParAliment.skyr?.majLe).toBe(avantParAliment.skyr?.majLe);
    });
});

/*
 * CA-6, VOLET ÉCRAN — ABANDONNÉ, ET VOICI POURQUOI, 25 septembre 2026.
 *
 * Le critère demande de composer un plan à l'écran, passer à l'étape
 * « Cuisiner » deux fois de suite sans rien changer, et vérifier qu'un seul
 * `PUT` part à chaque passage (le second devant répondre `{"enregistrees":0}`
 * sans qu'aucun `maj_le` ne bouge).
 *
 * CE QUE ÇA DEMANDE DE MONTER, ET POURQUOI CE N'EST PAS UN MONTAGE SÛR. Le
 * plan de `front/app/(onglets)/repas.tsx` n'est PAS persisté côté serveur tant
 * qu'on ne l'enregistre pas : il vit en état React local, construit en trois
 * étapes (« Jours », « Repas », « Cuisiner »), et `retenirLesCuissons`
 * (`usePlanCalcule.ts`) ne part QUE si `cuissonsAEnvoyer` n'est pas vide — donc
 * il faut au moins un aliment réellement affecté à un repas, avec une cuisson
 * décidée (habitude ou choix explicite), pour qu'il y ait quoi que ce soit à
 * intercepter.
 *
 * Affecter un aliment à un repas passe par `ChoixDansListe` (le même
 * sélecteur que celui qui a déjà bloqué une épreuve de bout en bout : voir
 * `avancementSeance.spec.ts`, tout en bas — « ni le champ de recherche ni le
 * titre de la modale ne se laissent viser, et la modale ne paraît pas
 * s'ouvrir sous le navigateur de test »). Le montage complet demanderait EN
 * PLUS un frigo garni (`POST /api/mon-frigo/...`) et des cibles nutritionnelles
 * pour que le solveur ait quelque chose à proposer — trois couches de montage
 * pour un seul geste, sur un sélecteur déjà connu pour ne pas se laisser
 * piloter par Playwright dans cet écran.
 *
 * CE QUI MANQUERAIT POUR LE FAIRE PROPREMENT : soit un moyen de piloter
 * `ChoixDansListe` depuis un test (un `testID`/rôle accessible stable sur son
 * champ de recherche et ses résultats, à poser dans l'écran lui-même — hors du
 * périmètre de cette épreuve), soit un point d'entrée qui permette de poser un
 * plan déjà composé sans repasser par le sélecteur.
 *
 * CE QUI RESTE SÛR SANS CE MONTAGE : les six épreuves ci-dessus exercent
 * exactement la même clause SQL (`IS DISTINCT FROM`) que ce que verrait un
 * double clic sur « Cuisiner » — l'écran, depuis le 25 septembre 2026, ne fait
 * plus que rejouer le PUT avec les mêmes données ; c'est très exactement le
 * cas de CA-2. Une épreuve fragile sur un sélecteur qui ne se laisse pas
 * piloter est pire que pas d'épreuve : `playwright.config.ts` le dit en toutes
 * lettres (`retries: 0`).
 */
