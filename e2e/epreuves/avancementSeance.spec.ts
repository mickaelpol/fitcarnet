import { expect, test } from '@playwright/test';
import {
  avancementServeur, creerCompte, creerSeance, seConnecter, supprimerCompte,
} from './compteJetable';

/**
 * LE COMPTEUR D'UNE SÉANCE : « 1/3 séries », et la règle du chrono.
 *
 * CE QUE CETTE ÉPREUVE GARDE. Jusqu'au 21 septembre 2026, ce compteur était
 * calculé DEUX fois — `Seance::getAvancement()` pour la liste des séances,
 * `avancementDe()` dans le front pour cet écran-ci, qui le refait à chaque case
 * cochée. C'était le dernier double juge du projet, et le seul qui n'était tenu
 * par rien : ni fichier de règles, ni test croisé.
 *
 * La règle vit désormais sur le serveur seul : il donne à chaque série son
 * POIDS (`poidsDansLAvancement`), et l'écran ne fait plus qu'une addition.
 *
 * POURQUOI ÇA DEMANDE UNE ÉPREUVE DE BOUT EN BOUT. Les deux contraintes se
 * contredisent en apparence, et aucune suite unitaire ne les voit ensemble :
 *
 *   1. le compteur doit bouger IMMÉDIATEMENT à la case cochée, sans
 *      aller-retour réseau — donc l'écran ne peut pas relire `avancement` ;
 *   2. et il doit dire EXACTEMENT ce que le serveur dira.
 *
 * Un test unitaire du front prouve (1) sur des données inventées. Un test
 * PHPUnit prouve (2) sur des entités en mémoire. Seul un vrai navigateur
 * devant une vraie base montre que **les deux chiffres sont le même**.
 *
 * LE CAS QUI DÉPARTAGE TOUT : un chrono dont seule la DEUXIÈME ligne est
 * cochée. L'ancien front faisait `series.slice(0, 1)` — donc « non fait ». Une
 * réécriture qui prendrait « n'importe quelle ligne cochée » rendrait « fait »,
 * et le compteur de l'utilisateur changerait de sens sans que rien ne tombe.
 */

/** Un exercice du catalogue : lequel n'importe pas, le MODE est sur le bloc. */
const EXERCICE = '/api/exercices/1';

const seanceChrono = {
  date: '2026-09-21',
  type: 'Push',
  exercices: [{
    exercice: EXERCICE,
    ordre: 0,
    /* LE MODE EST POSÉ SUR LA LIGNE, et il l'emporte sur celui du catalogue :
       faire un exercice à la charge un jour donné est un choix. L'épreuve ne
       dépend donc pas de ce que vaut `modeDefaut` pour l'exercice 1. */
    mode: 'chrono',
    series: [{ ordre: 0, faite: false }, { ordre: 1, faite: false }],
  }],
};

const seanceOrdinaire = {
  date: '2026-09-21',
  type: 'Pull',
  exercices: [{
    exercice: EXERCICE,
    ordre: 0,
    mode: 'charge',
    series: [{ ordre: 0, faite: false }, { ordre: 1, faite: false }, { ordre: 2, faite: false }],
  }],
};

test.describe('le compteur d\'une séance', () => {
  let email = '';

  test.beforeEach(() => { email = creerCompte('avancement'); });
  test.afterEach(() => { supprimerCompte(email); });

  test('un exercice chrono ne compte que pour UNE série, ses deux lignes comprises',
    async ({ page }) => {
      const id = await creerSeance(email, seanceChrono);
      await seConnecter(page, email);
      await page.goto(`/seance/${id}`);

      /* DEUX lignes à l'écran, UNE seule qui compte. C'est toute la règle :
         un « for time » n'a qu'un temps total. */
      await expect(compteur(page)).toHaveText('0/1 séries');
      await expect(page.getByLabel('Série 2 faite')).toBeVisible();

      await page.getByLabel('Série 1 faite').click();

      /* SANS ATTENTE RÉSEAU : c'est la contrainte qui interdisait de lire
         `seance.avancement`, et donc ce qui rendait le double juge tentant. */
      await expect(compteur(page)).toHaveText('1/1 séries');
    });

  test('LE CAS QUI DÉPARTAGE : cocher la DEUXIÈME ligne d\'un chrono ne compte pas',
    async ({ page }) => {
      const id = await creerSeance(email, seanceChrono);
      await seConnecter(page, email);
      await page.goto(`/seance/${id}`);

      await page.getByLabel('Série 2 faite').click();

      /* « 0/1 », et non « 1/1 ». Sans ce cas, remplacer « la première ligne »
         par « n'importe quelle ligne » passerait l'épreuve ci-dessus. */
      await expect(compteur(page)).toHaveText('0/1 séries');

      /* ET LE SERVEUR DIT LA MÊME CHOSE. C'est l'assertion qui n'a de sens que
         de bout en bout : deux compteurs, un seul chiffre. */
      await expect.poll(() => avancementServeur(email, id), { timeout: 15_000 })
        .toEqual({ faites: 0, total: 1 });
    });

  test('LE TÉMOIN : un exercice ordinaire compte toutes ses séries',
    async ({ page }) => {
      /* Sans ce cas, un compteur bloqué sur « /1 » passerait les deux épreuves
         ci-dessus tout en cassant toutes les séances de musculation. */
      const id = await creerSeance(email, seanceOrdinaire);
      await seConnecter(page, email);
      await page.goto(`/seance/${id}`);

      await expect(compteur(page)).toHaveText('0/3 séries');

      await page.getByLabel('Série 2 faite').click();

      /* ICI la deuxième ligne compte, elle : la règle du chrono ne doit pas
         déborder sur les autres modes. */
      await expect(compteur(page)).toHaveText('1/3 séries');

      await expect.poll(() => avancementServeur(email, id), { timeout: 15_000 })
        .toEqual({ faites: 1, total: 3 });
    });
});

// --------------------------------------------------------------------- outils

/**
 * Le compteur global de la séance, celui qui porte la règle.
 *
 * À NE PAS CONFONDRE avec le compteur de chaque carte d'exercice, qui affiche
 * le même format — `{faites}/{visibles} série(s)` dans `exerciceSeance.tsx` —
 * mais compte les lignes BRUTES, sans la règle du chrono. C'est voulu : cette
 * carte montre ce qu'il y a à remplir, pas ce qui avance. On vise donc le
 * compteur par son voisinage de la barre de progression, et non par son texte.
 */
const compteur = (page: import('@playwright/test').Page) =>
  page.getByText(/^\d+\/\d+ séries?$/).first();

/* CE QUI MANQUE ENCORE ICI, ET IL FAUT LE DIRE — 21 septembre 2026.
 *
 * Ces trois épreuves posent la séance par l'API puis ne font que COCHER. Elles
 * n'ajoutent pas d'exercice, n'en suppriment pas, ne changent pas de mode. Or
 * c'est exactement là que la première version de la refonte cassait : le
 * serveur envoyait un POIDS par série, et un bloc que l'écran vient de
 * fabriquer n'en a aucun — un « for time » ajouté affichait 0/3 là où le
 * serveur dirait 0/1.
 *
 * LE GESTE EST DÉSORMAIS COUVERT PAR UN TEST UNITAIRE, `blocSeance.test.ts`,
 * cas « UN BLOC FABRIQUÉ PAR L'ÉCRAN compte juste » — qui construit le bloc
 * avec la vraie `blocDepuisExercice`. Il n'est PAS couvert de bout en bout :
 * je n'ai pas su piloter le sélecteur d'exercice (`ChoixDansListe`) depuis
 * Playwright — ni le champ de recherche ni le titre de la modale ne se
 * laissent viser, et la modale ne paraît pas s'ouvrir sous le navigateur de
 * test. À reprendre : c'est le geste le plus banal de cet écran, et deux
 * agents ont trouvé la régression avant qu'aucune épreuve ne la voie.
 */
