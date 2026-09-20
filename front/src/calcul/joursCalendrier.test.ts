import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aMinuit, dateDuRang, grilleDuMois, libelleCourt, libelleDuJour, rangDepuisAujourdhui,
} from './dates';

/**
 * LES JOURS DU CALENDRIER DE COMPOSITION.
 *
 * Six fonctions pures qui vivaient dans `src/composants/calendrier.tsx`.
 * Aucune n'était testée, et aucune ne POUVAIT l'être : un `.test.ts` qui
 * importe une valeur depuis un `.tsx` casse à l'exécution. Elles décident quel
 * jour on compose, et l'écran de réglage s'en sert pour nommer les repas.
 *
 * LA RÈGLE LA PLUS PRÉCIEUSE EST CELLE QUE SON PROPRE COMMENTAIRE DÉCRIVAIT :
 *
 *     « la nuit du changement d'heure fait 23 ou 25 heures et décale toute la
 *      grille d'un jour — un bug qui ne se voit que deux fois par an, donc
 *      jamais en test »
 *
 * Elle méritait un test. Elle n'en avait pas. C'est fait ici, et sans dépendre
 * du fuseau de la machine : on parcourt plus d'une année de jours consécutifs
 * et on exige que CHAQUE pas vaille exactement un. Dans un fuseau à heure
 * d'été, les deux nuits en cause sont forcément dans le lot.
 *
 * Descendues le 20 septembre 2026 (palier 0).
 */

describe('ramener à minuit', () => {
  it('efface l\'heure sans changer le jour', () => {
    const midi = new Date(2026, 8, 20, 14, 37, 12, 500);
    const m = aMinuit(midi);

    assert.equal(m.getFullYear(), 2026);
    assert.equal(m.getMonth(), 8);
    assert.equal(m.getDate(), 20);
    assert.deepEqual([m.getHours(), m.getMinutes(), m.getSeconds(), m.getMilliseconds()],
      [0, 0, 0, 0]);
  });

  it('ne modifie pas la date qu\'on lui donne', () => {
    /* Elle est appelée sur des dates que l'écran garde : la muter ferait
       glisser la grille sous les doigts. */
    const origine = new Date(2026, 8, 20, 14, 0, 0);
    aMinuit(origine);

    assert.equal(origine.getHours(), 14);
  });
});

describe('le rang d\'un jour', () => {
  const AUJOURDHUI = new Date(2026, 8, 20, 11, 0, 0);

  it('aujourd\'hui vaut zéro, quelle que soit l\'heure', () => {
    assert.equal(rangDepuisAujourdhui(new Date(2026, 8, 20, 23, 59), AUJOURDHUI), 0);
    assert.equal(rangDepuisAujourdhui(new Date(2026, 8, 20, 0, 1), AUJOURDHUI), 0);
  });

  it('demain vaut un, hier vaut moins un', () => {
    assert.equal(rangDepuisAujourdhui(new Date(2026, 8, 21, 3, 0), AUJOURDHUI), 1);
    assert.equal(rangDepuisAujourdhui(new Date(2026, 8, 19, 22, 0), AUJOURDHUI), -1);
  });

  it('LE BUG DE DEUX FOIS PAR AN : chaque jour consécutif avance de UN', () => {
    /* Sans le passage par minuit et l'arrondi, la nuit du changement d'heure
       fait 23 ou 25 heures : une journée entière se voit attribuer le rang de
       sa voisine, et toute la grille glisse. On balaie 400 jours, donc les
       deux transitions du fuseau local si ce fuseau en a. */
    const depart = new Date(2026, 0, 1, 12, 0, 0);

    for (let j = 0; j < 400; j += 1) {
      const jour = new Date(2026, 0, 1 + j, 12, 0, 0);

      assert.equal(rangDepuisAujourdhui(jour, depart), j,
        `le ${jour.toDateString()} doit être à ${j} jours du 1er janvier`);
    }
  });

  it('l\'heure de la journée ne change jamais le rang', () => {
    /* Même balayage, mais en comparant une aube à un soir : c'est l'autre face
       du même piège. */
    const aube = new Date(2026, 0, 1, 1, 0, 0);

    for (let j = 0; j < 400; j += 1) {
      const soir = new Date(2026, 0, 1 + j, 23, 0, 0);

      assert.equal(rangDepuisAujourdhui(soir, aube), j);
    }
  });
});

describe('la date d\'un rang', () => {
  const AUJOURDHUI = new Date(2026, 8, 20, 11, 0, 0);

  it('fait l\'aller-retour avec le rang', () => {
    for (const rang of [-30, -1, 0, 1, 7, 45, 200]) {
      assert.equal(
        rangDepuisAujourdhui(dateDuRang(rang, AUJOURDHUI), AUJOURDHUI), rang,
        `aller-retour sur ${rang}`);
    }
  });

  it('rend toujours un minuit local', () => {
    assert.equal(dateDuRang(5, AUJOURDHUI).getHours(), 0);
  });

  it('franchit les mois et les années', () => {
    const saintSylvestre = new Date(2026, 11, 31, 18, 0, 0);

    assert.equal(dateDuRang(1, saintSylvestre).getFullYear(), 2027);
    assert.equal(dateDuRang(1, saintSylvestre).getMonth(), 0);
    assert.equal(dateDuRang(1, saintSylvestre).getDate(), 1);
  });
});

describe('les libellés', () => {
  const AUJOURDHUI = new Date(2026, 8, 20, 11, 0, 0);

  it('nomme les deux premiers jours en toutes lettres', () => {
    /* « mardi 22/09 » est juste mais illisible pour aujourd'hui : on lit la
       date au lieu de se repérer. */
    assert.equal(libelleDuJour(0, AUJOURDHUI), "Aujourd'hui");
    assert.equal(libelleDuJour(1, AUJOURDHUI), 'Demain');
    assert.equal(libelleCourt(0, AUJOURDHUI), 'auj.');
    assert.equal(libelleCourt(1, AUJOURDHUI), 'dem.');
  });

  it('au-delà, il dit le jour et la date', () => {
    /* On n'éprouve PAS la chaîne mot pour mot : elle vient d'`Intl`, qui
       s'appuie sur l'ICU du système et peut varier d'une version d'Android à
       l'autre. On vérifie ce dont l'écran a besoin — le quantième est là. */
    assert.match(libelleDuJour(2, AUJOURDHUI), /22/);
    assert.match(libelleCourt(2, AUJOURDHUI), /22/);
  });

  it('la forme courte est bien plus courte', () => {
    /* C'est sa seule raison d'exister : tenir sur une ligne repliée. */
    assert.ok(libelleCourt(2, AUJOURDHUI).length < libelleDuJour(2, AUJOURDHUI).length);
  });
});

describe('la grille d\'un mois', () => {
  it('commence un lundi et tient en semaines entières', () => {
    for (let mois = 0; mois < 12; mois += 1) {
      const cases = grilleDuMois(2026, mois);

      assert.equal(cases.length % 7, 0, `mois ${mois} : la grille doit être en semaines`);
      const premier = cases.find((c) => c !== null);
      assert.ok(premier);
      assert.equal(cases.indexOf(premier) % 7, (premier.getDay() + 6) % 7,
        `mois ${mois} : le 1er doit tomber dans sa colonne`);
    }
  });

  it('porte tous les jours du mois, et rien d\'autre', () => {
    const cases = grilleDuMois(2026, 1).filter((c) => c !== null);

    assert.equal(cases.length, 28, 'février 2026 fait 28 jours');
    assert.equal(cases[0]!.getDate(), 1);
    assert.equal(cases[27]!.getDate(), 28);
  });

  it('connaît les années bissextiles', () => {
    /* LE TÉMOIN : un mois de 28 jours codé en dur passerait tous les cas
       ci-dessus et se tromperait un an sur quatre. */
    assert.equal(grilleDuMois(2028, 1).filter((c) => c !== null).length, 29);
    assert.equal(grilleDuMois(2100, 1).filter((c) => c !== null).length, 28);
  });

  it('remplit le début et la fin de vide, jamais de dates voisines', () => {
    /* Les cases hors mois sont `null` : afficher le 31 du mois précédent ferait
       composer un repas pour un jour qu'on croit être dans le mois affiché. */
    const cases = grilleDuMois(2026, 8);
    const dedans = cases.filter((c) => c !== null);

    assert.ok(dedans.every((d) => d.getMonth() === 8),
      'aucune case ne doit porter un jour d\'un autre mois');
  });
});
