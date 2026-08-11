import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lireVersionPubliee, miseAJourNecessaire } from './version';

/**
 * Ce module décide de télécharger un fichier depuis Internet et de le donner
 * à installer. C'est la seule partie de l'application qui puisse envoyer
 * quelqu'un installer quelque chose — elle doit donc être difficile à
 * tromper, et silencieuse quand elle ne sait pas.
 */

const publiee = (versionCode: number) =>
  ({ versionCode, version: '1.0.0', url: 'https://exemple.fr/a.apk' });

describe('faut-il proposer la mise à jour', () => {
  it('oui, quand le serveur publie plus récent', () => {
    assert.equal(miseAJourNecessaire(3, publiee(4)), true);
  });

  it('non, quand c\'est la même', () => {
    /* Un `>=` proposerait éternellement d'installer ce qui est déjà là, et
       l'utilisateur apprendrait en deux jours à ignorer le bandeau. */
    assert.equal(miseAJourNecessaire(4, publiee(4)), false);
  });

  it('non, quand le serveur est en retard', () => {
    /* Arrive pendant un déploiement : le nouvel APK est posé avant que le
       `version.json` ne soit à jour, ou l'inverse. */
    assert.equal(miseAJourNecessaire(5, publiee(4)), false);
  });

  it('non, quand on ne sait pas ce qui tourne', () => {
    /* Le web et Expo Go n'ont pas de versionCode. Leur proposer un APK
       n'aurait aucun sens — et sur le web, le lien ne mènerait à rien
       d'installable. */
    assert.equal(miseAJourNecessaire(null, publiee(9)), false);
  });

  it('non, quand le serveur n\'a rien répondu', () => {
    assert.equal(miseAJourNecessaire(3, null), false);
  });
});

describe('ce que le serveur publie est vérifié, pas cru', () => {
  it('accepte une publication bien formée', () => {
    const v = lireVersionPubliee({
      versionCode: 7, version: '1.3.0',
      url: 'https://carnet.mickael-pol.fr/telecharger/fitcarnet.apk',
      notes: 'batch cooking',
    });
    assert.equal(v?.versionCode, 7);
    assert.equal(v?.notes, 'batch cooking');
  });

  it('les notes sont facultatives', () => {
    assert.equal(lireVersionPubliee(
      { versionCode: 7, version: '1.3.0', url: 'https://a.fr/b.apk' })?.notes, undefined);
  });

  it('refuse une adresse en clair', () => {
    /* Android bloque le HTTP en clair depuis l'API 28 : le téléchargement
       échouerait sans dire pourquoi. Autant refuser ici, où on sait
       l'expliquer. */
    assert.equal(lireVersionPubliee(
      { versionCode: 7, version: '1.3.0', url: 'http://a.fr/b.apk' }), null);
  });

  it('refuse une adresse relative', () => {
    assert.equal(lireVersionPubliee(
      { versionCode: 7, version: '1.3.0', url: '/telecharger/b.apk' }), null);
  });

  it('refuse un versionCode qui n\'est pas un entier utilisable', () => {
    /* Ce fichier sera recopié à la main. « 12 » entre guillemets est l'erreur
       la plus probable, et un `>` sur une chaîne comparerait des lettres. */
    for (const mauvais of ['12', null, undefined, Number.NaN, 0, -3]) {
      assert.equal(lireVersionPubliee(
        { versionCode: mauvais, version: '1.0.0', url: 'https://a.fr/b.apk' }),
      null, String(mauvais));
    }
  });

  it('refuse une version vide ou absente', () => {
    assert.equal(lireVersionPubliee(
      { versionCode: 7, version: '', url: 'https://a.fr/b.apk' }), null);
    assert.equal(lireVersionPubliee(
      { versionCode: 7, url: 'https://a.fr/b.apk' }), null);
  });

  it('refuse tout ce qui n\'est pas un objet', () => {
    /* Un NAS qui répond une page d'erreur HTML, une redirection de portail
       captif : le `fetch` réussit, le contenu ne veut rien dire. */
    for (const mauvais of [null, undefined, 'du texte', 42, []]) {
      assert.equal(lireVersionPubliee(mauvais), null, String(mauvais));
    }
  });

  it('un contenu refusé ne déclenche jamais de mise à jour', () => {
    /* Le lien entre les deux fonctions, et c'est lui qui compte : rien de
       mal formé ne doit pouvoir aboutir à un téléchargement. */
    const v = lireVersionPubliee({ versionCode: '99', version: '9', url: 'http://x' });
    assert.equal(miseAJourNecessaire(1, v), false);
  });
});
