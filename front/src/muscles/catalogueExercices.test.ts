import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Exercice } from '../api/types';
import {
  aTraduire, avancementCatalogue, estRenseigne, filtrerExercices, zonesPresentes,
} from './catalogueExercices';

/**
 * CE QUE CES TESTS PROTÈGENT : QUE LA JAUGE ET LE FILTRE COMPTENT PAREIL.
 *
 * `app/admin-exercices.tsx` documentait DEUX FOIS la même panne, à cinquante
 * lignes d'écart (l. 505-514 et l. 547-550 avant découpage) : le filtre
 * « À compléter » et la jauge de progression ont divergé sur la définition
 * de « renseigné ». La jauge annonçait « 1319/1338 renseignés » pendant que
 * le filtre en listait davantage — deux chiffres pour une seule question,
 * dont un faux, et c'est celui qu'on lit en premier.
 *
 * Le test `la jauge et le filtre partitionnent le catalogue` est la garantie
 * elle-même : tout exercice est soit compté renseigné, soit listé à
 * compléter, jamais les deux, jamais aucun des deux. Si quelqu'un touche à
 * l'une des deux définitions sans l'autre, il tombe ici.
 */

const ex = (p: Partial<Exercice>): Exercice => ({
  '@id': `/api/exercices/${p.id ?? 1}`,
  id: 1,
  nom: 'Bench press',
  nomFr: null,
  formatPrescrit: null,
  modeDefaut: 'charge',
  groupes: [],
  videoUrl: null,
  partieCorps: null,
  source: 'import',
  ...p,
});

describe('catalogueExercices — filtres', () => {
  const tous = [
    ex({ id: 1, partieCorps: 'chest', muscleCible: 'pectorals', nomFr: 'Développé couché' }),
    ex({ id: 2, partieCorps: 'chest' }), // zone mais pas de muscle
    ex({ id: 3, muscleCible: 'lats' }), // muscle mais pas de zone
    ex({ id: 4 }), // ni l'un ni l'autre
    ex({ id: 5, nom: 'Fente bulgare', source: 'perso', partieCorps: 'upper legs', muscleCible: 'quads' }),
  ];

  it('« À compléter » retient ce à quoi il manque la zone OU le muscle', () => {
    assert.deepEqual(
      filtrerExercices(tous, 'a_completer', '').map((e) => e.id),
      [2, 3, 4],
    );
  });

  it('la jauge et le filtre partitionnent le catalogue', () => {
    const aCompleter = filtrerExercices(tous, 'a_completer', '').length;
    assert.equal(avancementCatalogue(tous).renseignes + aCompleter, tous.length);
  });

  it('« Sans muscle » est un travail à part de « À compléter »', () => {
    assert.deepEqual(filtrerExercices(tous, 'sans_muscle', '').map((e) => e.id), [2, 4]);
  });

  it('« Sans vidéo » retient tout ce qui n’a pas de lien', () => {
    const avec = [...tous, ex({ id: 6, videoUrl: 'https://youtu.be/abcdefghijk' })];
    assert.deepEqual(filtrerExercices(avec, 'sans_video', '').map((e) => e.id), [1, 2, 3, 4, 5]);
  });

  it('un exercice perso n’a jamais rien à traduire', () => {
    assert.equal(aTraduire(ex({ source: 'perso', nomFr: null })), false);
    assert.equal(aTraduire(ex({ source: 'import', nomFr: null })), true);
    assert.equal(aTraduire(ex({ source: 'import', nomFr: 'Développé couché' })), false);
  });

  it('« À traduire » et « Ajoutés dans l’app » ne se recouvrent pas', () => {
    assert.deepEqual(filtrerExercices(tous, 'sans_nom_fr', '').map((e) => e.id), [2, 3, 4]);
    assert.deepEqual(filtrerExercices(tous, 'perso', '').map((e) => e.id), [5]);
  });

  it('« Tous » ne retire rien', () => {
    assert.equal(filtrerExercices(tous, 'tous', '').length, tous.length);
  });

  it('la recherche ignore les accents et la casse, et regarde les deux noms', () => {
    assert.deepEqual(filtrerExercices(tous, 'tous', 'DEVELOPPE').map((e) => e.id), [1]);
    assert.deepEqual(filtrerExercices(tous, 'tous', 'bulgäre').map((e) => e.id), [5]);
    assert.deepEqual(filtrerExercices(tous, 'tous', 'bench').map((e) => e.id), [1, 2, 3, 4]);
  });

  it('une recherche vide, ou faite d’espaces, ne filtre rien', () => {
    assert.equal(filtrerExercices(tous, 'tous', '   ').length, tous.length);
  });

  it('la recherche s’applique APRÈS le filtre, pas à sa place', () => {
    assert.deepEqual(filtrerExercices(tous, 'a_completer', 'bench').map((e) => e.id), [2, 3, 4]);
  });
});

describe('catalogueExercices — zones proposées', () => {
  it('ne propose que les zones réellement portées par le catalogue', () => {
    const cles = zonesPresentes([
      ex({ id: 1, partieCorps: 'chest' }),
      ex({ id: 2, partieCorps: 'upper legs' }),
      ex({ id: 3, partieCorps: null }),
    ]).map((c) => c.cle);
    assert.ok(cles.includes('chest'));
    assert.ok(cles.includes('upper legs'));
    assert.ok(!cles.includes('waist'), 'une zone absente du catalogue ne se propose pas');
  });

  it('une zone inconnue de la table reste proposable, sous son mot brut', () => {
    /* Sinon le sélecteur EFFACERAIT en silence une valeur qu'il ne sait pas
       représenter — c'est la garantie que porte déjà `casesPour`. */
    const cles = zonesPresentes([ex({ id: 1, partieCorps: 'exosquelette' })]).map((c) => c.cle);
    assert.ok(cles.includes('exosquelette'));
  });

  it('un catalogue vide ne propose aucune zone', () => {
    assert.deepEqual(zonesPresentes([]), []);
  });
});

describe('catalogueExercices — avancement', () => {
  const tous = [
    ex({ id: 1, partieCorps: 'chest', muscleCible: 'pectorals', nomFr: 'Développé couché', videoUrl: 'https://youtu.be/abcdefghijk' }),
    ex({ id: 2, partieCorps: 'chest' }),
    ex({ id: 3, source: 'perso', partieCorps: 'upper legs', muscleCible: 'quads' }),
  ];

  it('compte les traduits parmi les IMPORTÉS seulement', () => {
    const a = avancementCatalogue(tous);
    assert.equal(a.importes, 2, 'l’exercice perso ne compte pas au dénominateur');
    assert.equal(a.traduits, 1);
  });

  it('compte le total, les vidéos et les renseignés sur TOUT le catalogue', () => {
    const a = avancementCatalogue(tous);
    assert.equal(a.total, 3);
    assert.equal(a.avecVideo, 1);
    assert.equal(a.renseignes, 2);
  });

  it('« renseigné » veut dire zone ET muscle', () => {
    assert.equal(estRenseigne(ex({ partieCorps: 'chest', muscleCible: 'pectorals' })), true);
    assert.equal(estRenseigne(ex({ partieCorps: 'chest' })), false);
    assert.equal(estRenseigne(ex({ muscleCible: 'pectorals' })), false);
    assert.equal(estRenseigne(ex({})), false);
  });

  /* LE BUG DU CATALOGUE VIDE, ÉPINGLÉ LE 15 SEPTEMBRE 2026 ET CORRIGÉ LE MÊME
   * JOUR.
   *
   * Ce témoin figeait la panne : `renseignes / total` valait `0/0` = NaN, et
   * la jauge d'`app/admin-exercices.tsx` recevait `width: 'NaN%'` — une
   * largeur que ni React Native ni le web ne savent lire, sur une base neuve,
   * c'est-à-dire sur la toute première installation. Il dit maintenant ce que
   * la fonction DOIT faire.
   *
   * ZÉRO ET NON CENT. Un catalogue vide n'a rien de renseigné ; le remplir à
   * cent pour cent annoncerait « catalogue complet » à un administrateur qui
   * n'a simplement pas encore de données — règle 7, un chiffre faux est pire
   * qu'un refus. La barre reste vide, le bandeau lit « 0/0 », et les deux
   * disent la même chose. */
  it('un catalogue vide donne 0 %, pas NaN', () => {
    const a = avancementCatalogue([]);
    assert.equal(a.pourcentRenseignes, 0);
    assert.ok(Number.isFinite(a.pourcentRenseignes),
      'la jauge reçoit cette valeur telle quelle : `width: \'NaN%\'` ne se rend pas');
  });

  /* Le cas normal ne doit pas bouger au passage : la garde ne s'applique qu'à
     un dénominateur nul, elle ne rabote pas le calcul réel. */
  it('un catalogue non vide garde son pourcentage exact', () => {
    assert.equal(avancementCatalogue(tous).pourcentRenseignes, 67);
  });
});
