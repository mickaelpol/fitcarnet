import { expect, test } from '@playwright/test';
import {
  creerCompte, jetonDe, seConnecter, supprimerCompte,
} from './compteJetable';

/**
 * LES PESÉES SE RELISENT À LA VIRGULE — 26 septembre 2026.
 *
 * `editeurAliment.tsx` a longtemps tenu « avant » et « apres » comme deux
 * TEXTES écrits à la main, relus par `String(...)` : une pesée de 42,5 g
 * revenait « 42.5 », le point américain là où tout le reste de l'écran parle
 * la virgule française. Depuis cette date, ces deux champs sont des
 * `ChampNombre` comme les autres — même composant que les répétitions et le
 * poids d'une série, même garde contre la panne du 15 septembre 2026 où
 * « 42,5 » s'enregistrait 425.
 *
 * CE QU'ON ÉPROUVE ICI N'EST PAS LE CALCUL DU RATIO — `ratioDepuisPesees` a
 * son test unitaire — MAIS LA RELECTURE : qu'un aliment dont les pesées sont
 * déjà enregistrées les rouvre bien à la française, et pas au format que
 * `JSON` lui a donné. Aucun test unitaire ne monte l'écran entier avec un
 * aliment réel sorti de la base ; c'est précisément ce qui manquerait pour
 * voir un « 42.5 » anglophone se glisser sous une virgule promise partout
 * ailleurs.
 */

const BASE = process.env.FITCARNET_URL ?? 'http://localhost:8080';

/** Un féculent cohérent, tel que la règle 3 le décrit : cru, pas cuit. */
const RIZ = {
  nom: 'Riz de la pesée',
  categorie: 'fec',
  kcal100: '350',
  prot100: '7',
  gluc100: '78',
  lip100: '0.6',
  fibres100: null,
  ratio: '2.26',
  peseeAvant: '42.5',
  peseeApres: '96',
};

/**
 * Garnit le frigo PAR L'API : un aliment cohérent, puis une ligne de stock.
 *
 * PAR L'API ET NON EN SQL — comme `creerSeance` dans `compteJetable.ts` : poser
 * l'aliment à la main pourrait violer une règle que le serveur applique (la
 * cohérence nutritionnelle, le sens du rendement), et l'épreuve montrerait
 * alors une situation que l'application ne peut jamais produire elle-même.
 *
 * SANS LIGNE DE STOCK, L'ALIMENT N'APPARAÎT PAS COMME UN ARTICLE DU FRIGO
 * QU'ON PEUT OUVRIR DEPUIS L'ÉCRAN — c'est le geste qu'on éprouve, pas
 * seulement la présence en base.
 */
async function garnirLeFrigo(email: string): Promise<number> {
  const jeton = await jetonDe(email);

  const reponseAliment = await fetch(`${BASE}/api/aliments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/ld+json',
      Authorization: `Bearer ${jeton}`,
    },
    body: JSON.stringify(RIZ),
  });

  if (!reponseAliment.ok) {
    throw new Error(`création de l'aliment refusée (${reponseAliment.status}) : `
      + `${await reponseAliment.text()}`);
  }

  const alimentCree = await reponseAliment.json() as { id: number };

  const reponseStock = await fetch(`${BASE}/api/mon-frigo/stock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jeton}`,
    },
    body: JSON.stringify({ alimentId: alimentCree.id, quantite: 500 }),
  });

  if (!reponseStock.ok) {
    throw new Error(`pose du stock refusée (${reponseStock.status}) : `
      + `${await reponseStock.text()}`);
  }

  return alimentCree.id;
}

/* VIDÉO LOCALE À CE FICHIER, ET NON DANS LA CONFIGURATION GLOBALE — la
   config de `playwright.config.ts` ne garde la vidéo QUE sur un échec
   (`video: 'retain-on-failure'`), pour ne pas alourdir le rapport des dix-
   huit autres épreuves. Celle-ci sert à la vérification humaine du geste :
   on la veut TOUJOURS, succès compris. */
test.use({ video: 'on' });

test.describe('l\'éditeur d\'aliment relit les pesées à la française', () => {
  let email = '';

  test.beforeEach(() => { email = creerCompte('pesees'); });
  test.afterEach(() => { supprimerCompte(email); });

  // CA-6, et son complément : « Poids après cuisson »
  test('« Poids avant cuisson » et « Poids après cuisson » affichent 42,5 et 96',
    async ({ page }) => {
      const idAliment = await garnirLeFrigo(email);

      /* LE TÉMOIN. Sans cette relecture directe, un scénario mal garni — un
         aliment créé sans ses pesées, ou une base qui les aurait arrondies —
         laisserait passer un champ vide ou un « 42.5 » anglophone sans que
         rien ne le signale : l'assertion plus bas comparerait un texte à un
         autre texte, tous deux faux pour la même raison. On relit donc par
         l'API, AVANT d'ouvrir l'écran, ce que la base contient vraiment. */
      const jeton = await jetonDe(email);
      const verif = await fetch(`${BASE}/api/aliments/${idAliment}`, {
        headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/ld+json' },
      });
      const enBase = await verif.json() as { peseeAvant: number; peseeApres: number };
      expect(enBase.peseeAvant).toBe(42.5);
      expect(enBase.peseeApres).toBe(96);

      await seConnecter(page, email);
      await page.goto('/frigo');

      /* Ouvrir la fiche du riz, puis sa correction — le chemin de
         `LigneStock` (`ligneFrigo.tsx`) : un appui sur la ligne déplie le
         détail, « Corriger les valeurs » ouvre l'éditeur. */
      await page.getByText(RIZ.nom, { exact: true }).click();
      await page.getByText('Corriger les valeurs', { exact: true }).click();

      /* L'ÉDITEUR OUVRE TOUJOURS SUR LES GUIDES DE RATIO, JAMAIS SUR LA
         MESURE — `editeurAliment.tsx` remet `mesurer` à `false` à chaque
         ouverture, même quand des pesées existent déjà (elles restent
         disponibles derrière « Je préfère mesurer », pour les vérifier ou
         les refaire). */
      await page.getByText('Je préfère mesurer', { exact: true }).click();

      await expect(page.getByLabel('Poids avant cuisson', { exact: true }))
        .toHaveValue('42,5');
      await expect(page.getByLabel('Poids après cuisson', { exact: true }))
        .toHaveValue('96');
    });
});
