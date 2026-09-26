import { expect, test } from '@playwright/test';
import {
  alimentsDe, creerCompte, jetonDe, supprimerCompte,
} from './compteJetable';

/**
 * CA-R5 — L'ALIMENT D'AUTRUI REND 404 AVANT TOUT JUGEMENT. 26 septembre 2026.
 *
 * Coché dans `docs/features/macros-editeur-vide-pas-zero.md` sans qu'aucun
 * test le porte : relevé par `revue-fitcarnet`. Depuis cette feature,
 * `PATCH /api/aliments/{id}` passe par `AlimentDenormalizer`, qui JUGE la
 * saisie. Si ce jugement tombait avant la vérification de propriété, un compte
 * apprendrait par un 422 qu'un aliment d'un autre existe — et le texte du
 * refus lui en dirait les valeurs (règle 2).
 *
 * Aujourd'hui, c'est l'ordre des fournisseurs d'API Platform qui l'empêche :
 * la lecture (filtrée par `FiltreProprietaire`) et `security: MIEN` passent
 * avant la désérialisation. RIEN DANS LES TESTS UNITAIRES NE PEUT LE VOIR, ils
 * ne montent pas le noyau : un `securityPostDenormalize`, ou un fournisseur
 * personnalisé, le renverserait en silence. D'où cette épreuve, sans écran —
 * c'est la route qui est en cause, pas l'éditeur.
 */

const BASE = process.env.FITCARNET_URL ?? 'http://localhost:8080';

const POULET = {
  nom: 'Poulet de B',
  categorie: 'prot',
  kcal100: '120',
  prot100: '23',
  gluc100: '0',
  lip100: '2',
  fibres100: null,
  ratio: '0.75',
};

async function creerAliment(email: string): Promise<number> {
  const reponse = await fetch(`${BASE}/api/aliments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/ld+json',
      Authorization: `Bearer ${await jetonDe(email)}`,
    },
    body: JSON.stringify(POULET),
  });
  if (!reponse.ok) {
    throw new Error(`création refusée (${reponse.status}) : ${await reponse.text()}`);
  }

  return (await reponse.json() as { id: number }).id;
}

const corriger = async (email: string, id: number, corps: unknown): Promise<number> =>
  (await fetch(`${BASE}/api/aliments/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/merge-patch+json',
      Authorization: `Bearer ${await jetonDe(email)}`,
    },
    body: JSON.stringify(corps),
  })).status;

test.describe('CA-R5 : un PATCH sur l\'aliment d\'un autre compte', () => {
  let a = '';
  let b = '';

  test.beforeEach(() => {
    a = creerCompte('intrus');
    b = creerCompte('proprietaire');
  });
  test.afterEach(() => {
    supprimerCompte(a);
    supprimerCompte(b);
  });

  test('rend 404, jamais le 422 du jugement, et ne touche à rien', async () => {
    const id = await creerAliment(b);

    /* LE TÉMOIN : la même saisie, envoyée par le propriétaire, EST jugée et
       refusée. Sans lui, un 404 pourrait venir d'une route mal écrite ou d'un
       identifiant faux, et l'épreuve passerait pour la mauvaise raison. */
    expect(await corriger(b, id, { prot100: 'abc' })).toBe(422);

    expect(await corriger(a, id, { prot100: 'abc' })).toBe(404);
    expect(await corriger(a, id, { nom: 'Poulet volé' })).toBe(404);

    expect(alimentsDe(b).map((x) => x.nom)).toEqual([POULET.nom]);
  });
});
