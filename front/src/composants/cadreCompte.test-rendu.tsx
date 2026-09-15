/**
 * LA PORTE DE SORTIE DOIT RESTER OUVERTE, MÊME QUAND TOUT LE RESTE EST FERMÉ.
 *
 * Constat É14, deuxième volet, corrigé le 15 septembre 2026.
 *
 * LA PANNE. `app/(onglets)/compte.tsx` retournait son écran d'erreur — puis,
 * quarante lignes plus bas seulement, son bouton « Se déconnecter ». Un `return`
 * précoce séparait les deux. Résultat : dès que `GET /api/moi` échouait, le
 * seul moyen de quitter une session était retiré de l'écran. Réseau coupé,
 * API en panne, jeton corrompu — on restait enfermé dans un compte auquel
 * l'application ne pouvait plus accéder.
 *
 * ET LE CHARGEMENT COMPTE AUTANT QUE L'ERREUR. `src/api/client.ts` ne pose
 * aucun délai de garde : une requête qui pend laisse `isPending` vrai
 * indéfiniment. L'écran restait alors sur son rond qui tourne, sans erreur à
 * afficher et sans bouton pour sortir. C'est le même enfermement, en plus
 * silencieux — d'où les trois états testés ici et pas seulement l'erreur.
 *
 * C'est la leçon déjà écrite dans `etatMaj.tsx`, à propos du bouton de
 * rafraîchissement caché par le bug qu'il corrigeait : **une porte de secours
 * fermée par ce dont elle protège n'est pas une porte de secours.** Elle était
 * écrite là-bas et pas appliquée ici — le jumeau oublié, une fois de plus.
 *
 * POURQUOI CE FICHIER EST DANS `src/` ET PAS À CÔTÉ DE L'ÉCRAN.
 * `tsconfig.tests.json` ne compile que `src/` : un test posé dans `app/` n'est
 * jamais exécuté, sans le moindre signal. Le cadre a donc été extrait vers
 * `src/composants/cadreCompte.tsx`, et l'écran n'est plus que son câblage.
 * C'est la direction déjà prise pour `repas.tsx`.
 */
import { type TestContext, test } from 'node:test';
import assert from 'node:assert/strict';
import { Text } from 'react-native';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CadreCompte } from './cadreCompte';

/** Ce que l'écran met dans le cadre quand tout va bien. */
const contenu = <Text>Mon adresse et mes réglages</Text>;

/**
 * Les trois états, et la même exigence pour les trois.
 *
 * Écrire la liste plutôt que trois tests recopiés n'est pas de l'économie :
 * un quatrième état ajouté au cadre devra être ajouté ICI, et la boucle le
 * réclamera. Trois tests jumeaux, eux, en auraient laissé passer un.
 */
const ETATS = [
  { etat: 'attente' as const, quand: 'la réponse se fait attendre' },
  { etat: 'erreur' as const, quand: 'la requête a échoué' },
  { etat: 'pret' as const, quand: 'tout va bien' },
];

for (const { etat, quand } of ETATS) {
  test(`on peut se déconnecter quand ${quand}`, (t: TestContext) => {
    t.after(cleanup);
    let partis = 0;

    render(
      <CadreCompte
        etat={etat}
        messageErreur="Impossible de joindre le serveur."
        onReessayer={() => undefined}
        onDeconnexion={() => { partis += 1; }}
      >
        {contenu}
      </CadreCompte>,
    );

    const bouton = screen.getByText('Se déconnecter');
    fireEvent.click(bouton);

    assert.equal(partis, 1,
      `état « ${etat} » : le bouton de déconnexion doit être là ET agir`);
  });
}

test('l’erreur s’affiche, et se réessaie', (t: TestContext) => {
  t.after(cleanup);
  let essais = 0;

  render(
    <CadreCompte
      etat="erreur"
      messageErreur="Impossible de joindre le serveur."
      onReessayer={() => { essais += 1; }}
      onDeconnexion={() => undefined}
    >
      {contenu}
    </CadreCompte>,
  );

  /* Le témoin de l'inverse : sans lui, « toujours afficher le bouton » se
     satisferait d'un cadre qui n'afficherait plus JAMAIS l'erreur. */
  screen.getByText('Impossible de joindre le serveur.');
  fireEvent.click(screen.getByText('Réessayer'));

  assert.equal(essais, 1, 'le bouton de réessai doit rester fonctionnel');
});

test('le contenu du compte ne s’affiche QUE lorsqu’on l’a reçu', (t: TestContext) => {
  t.after(cleanup);

  for (const etat of ['attente', 'erreur'] as const) {
    cleanup();
    render(
      <CadreCompte
        etat={etat}
        messageErreur="Impossible de joindre le serveur."
        onReessayer={() => undefined}
        onDeconnexion={() => undefined}
      >
        {contenu}
      </CadreCompte>,
    );

    /* RÈGLE 7, ET C'EST LA MOITIÉ QUI SE PERD EN CORRIGEANT L'AUTRE. Rendre
       le bouton toujours visible ne doit pas rendre le RESTE toujours visible :
       l'écran afficherait de nouveau un nom en tiret et « Gérés dans l'onglet
       Mon frigo » comme un fait, alors que rien n'a été reçu. */
    assert.equal(screen.queryByText('Mon adresse et mes réglages'), null,
      `état « ${etat} » : le contenu du compte ne doit pas s'afficher`);
  }
});
