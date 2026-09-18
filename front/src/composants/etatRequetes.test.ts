import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { premiereErreur, type RequeteObservee } from './etatRequetes';

/**
 * LA ROUE QUI TOURNE POUR TOUJOURS — constat M6 de l'audit de septembre 2026,
 * corrigé le 18 septembre 2026.
 *
 * Quatre écrans gardaient l'erreur d'UNE requête et pas celle de ses voisines,
 * puis retombaient sur un `return <Chargement />` inconditionnel. Une panne de
 * `/modeles`, de `/cibles` ou de `/comptes` — un tunnel de métro suffit —
 * laissait donc l'écran sur sa roue, sans message ni bouton Réessayer, ou pire
 * (écran des séances) affichait des données FAUSSES.
 *
 * `premiereErreur` est le garde unique : on lui donne les requêtes dont
 * l'écran a besoin pour être JUSTE, il rend de quoi afficher `<Erreur>`.
 *
 * CE QU'IL NE FAIT PAS, ET C'EST LE PIÈGE DE L'ORDRE DES GARDES : il ne
 * connaît pas `isLoading`. « En attente » n'est pas « en panne », et une
 * requête qui n'a pas encore répondu ne doit surtout pas devenir une erreur.
 * L'écran garde donc son `if (…isLoading) return <Chargement />` AVANT
 * l'appel — d'où le cas témoin « une requête en vol n'est pas une panne ».
 */

/* Les fausses requêtes passent par cette fabrique plutôt que par des objets
   littéraux : un littéral déclencherait le contrôle des propriétés en trop
   dès qu'on voudrait y poser un `isLoading` pour la lisibilité. */
function requete(etat: {
  erreur?: string | null;
  isError?: boolean;
  onRefetch?: () => void;
}): RequeteObservee {
  const message = etat.erreur;

  return {
    isError: etat.isError ?? (message !== undefined && message !== null),
    error: message === undefined || message === null ? null : { message },
    refetch: () => { etat.onRefetch?.(); },
  };
}

describe('premiereErreur : le garde unique des écrans', () => {
  it('ne voit aucune panne quand tout répond', () => {
    assert.equal(premiereErreur(requete({}), requete({}), requete({})), null);
  });

  it('ne voit aucune panne sans aucune requête', () => {
    assert.equal(premiereErreur(), null);
  });

  it('rapporte le message de la requête en panne, quel que soit son rang', () => {
    const panne = premiereErreur(requete({}), requete({ erreur: 'Serveur injoignable.' }));

    assert.equal(panne?.message, 'Serveur injoignable.');
  });

  it('rapporte la PREMIÈRE panne, dans l\'ordre des arguments', () => {
    /* Le déterminisme compte : l'écran nomme ses requêtes par ordre
       d'importance, et deux pannes simultanées ne doivent pas faire clignoter
       un message puis l'autre d'un rendu à l'autre. */
    const panne = premiereErreur(
      requete({}),
      requete({ erreur: 'Le catalogue a échoué.' }),
      requete({ erreur: 'Les cibles ont échoué.' }),
    );

    assert.equal(panne?.message, 'Le catalogue a échoué.');
  });

  it('ne prend pas une requête en vol pour une panne', () => {
    /* « En attente » n'est pas « pas de données », et surtout pas « erreur ».
       Transformer un chargement en erreur afficherait une panne inventée à
       chaque ouverture d'écran. */
    const enVol = requete({ isError: false, erreur: null });

    assert.equal(premiereErreur(enVol), null);
  });

  it('réessaie TOUTES les requêtes en panne, et elles seules', () => {
    /* Une seule panne relancée, c'est un second « Réessayer » à faire pour la
       voisine : l'utilisateur voit alors un message d'erreur remplacé par un
       autre message d'erreur, et croit que rien ne marche. */
    const relances: string[] = [];
    const panne = premiereErreur(
      requete({ erreur: 'A', onRefetch: () => relances.push('A') }),
      requete({ onRefetch: () => relances.push('saine') }),
      requete({ erreur: 'B', onRefetch: () => relances.push('B') }),
    );

    assert.deepEqual(relances, []);
    panne?.reessayer();
    assert.deepEqual(relances, ['A', 'B']);
  });

  it('refuse de retomber dans la roue infinie quand l\'erreur n\'a pas de message', () => {
    /* `isError` vrai avec un `error` nul ou vide est le cas limite qui
       ramènerait EXACTEMENT le défaut corrigé : rendre `null` ici, c'est
       renvoyer l'écran sur son `<Chargement />` sans fin. On dit qu'on ne sait
       pas plutôt que de se taire. */
    const sansMessage = premiereErreur(requete({ isError: true, erreur: null }));
    const messageVide = premiereErreur(requete({ isError: true, erreur: '   ' }));

    assert.notEqual(sansMessage, null);
    assert.ok((sansMessage?.message.length ?? 0) > 0);
    assert.equal(messageVide?.message, sansMessage?.message);
  });
});
