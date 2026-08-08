import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { uneSeuleFois } from './uneSeuleFois';

/** Une action qu'on règle à la main, pour maîtriser l'ordre des choses. */
function actionPilotee() {
  let appels = 0;
  let regler: ((v: string) => void) | null = null;
  let rejeter: ((e: Error) => void) | null = null;

  const action = () => {
    appels += 1;

    return new Promise<string>((ok, ko) => { regler = ok; rejeter = ko; });
  };

  return {
    action,
    get appels() { return appels; },
    reglerA: (v: string) => regler?.(v),
    rejeterAvec: (e: Error) => rejeter?.(e),
  };
}

describe('regroupement des appels simultanés', () => {
  it('n\'exécute qu\'une fois pour dix appelants simultanés', async () => {
    const pilote = actionPilotee();
    const groupee = uneSeuleFois(pilote.action);

    const attentes = Array.from({ length: 10 }, () => groupee());
    assert.equal(pilote.appels, 1, 'dix appelants, une seule exécution');

    pilote.reglerA('jeton');
    const resultats = await Promise.all(attentes);
    assert.deepEqual(resultats, Array(10).fill('jeton'), 'tous reçoivent le même résultat');
  });

  it('redevient déclenchable une fois réglée', async () => {
    const pilote = actionPilotee();
    const groupee = uneSeuleFois(pilote.action);

    const premiere = groupee();
    pilote.reglerA('un');
    assert.equal(await premiere, 'un');

    const seconde = groupee();
    assert.equal(pilote.appels, 2, 'ce n\'est pas un cache : la seconde relance');
    pilote.reglerA('deux');
    assert.equal(await seconde, 'deux');
  });

  /* Le piège : si le nettoyage n'a pas lieu avant que la promesse ne soit
     rendue, un appelant qui enchaîne immédiatement retrouve l'ancienne. */
  it('relance bien quand un appelant enchaîne aussitôt', async () => {
    const pilote = actionPilotee();
    const groupee = uneSeuleFois(pilote.action);

    const suite = groupee().then(() => groupee());
    pilote.reglerA('un');

    // vide la file des microtâches : la seconde exécution a bien démarré
    await new Promise((r) => { setImmediate(r); });
    assert.equal(pilote.appels, 2, 'la promesse partagée a bien été libérée');

    pilote.reglerA('deux');
    assert.equal(await suite, 'deux');
  });

  it('un échec ne bloque pas les appels suivants', async () => {
    const pilote = actionPilotee();
    const groupee = uneSeuleFois(pilote.action);

    const premiere = groupee();
    pilote.rejeterAvec(new Error('réseau coupé'));
    await assert.rejects(premiere, /réseau coupé/);

    const seconde = groupee();
    assert.equal(pilote.appels, 2, 'un échec ne condamne pas la suite');
    pilote.reglerA('ça remarche');
    assert.equal(await seconde, 'ça remarche');
  });

  it('partage aussi l\'échec avec tous les appelants simultanés', async () => {
    const pilote = actionPilotee();
    const groupee = uneSeuleFois(pilote.action);

    const attentes = [groupee(), groupee(), groupee()];
    pilote.rejeterAvec(new Error('refus'));

    for (const a of attentes) await assert.rejects(a, /refus/);
    assert.equal(pilote.appels, 1);
  });
});
