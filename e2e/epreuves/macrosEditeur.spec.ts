import { expect, test } from '@playwright/test';
import {
  alimentsDe, creerCompte, jetonDe, seConnecter, supprimerCompte,
} from './compteJetable';

/**
 * L'ÉDITEUR D'ALIMENT NE LIT PLUS RIEN — feature `macros-editeur-vide-pas-zero`,
 * 26 septembre 2026.
 *
 * Avant cette feature, une macro vide devenait un zéro dans l'état de l'écran
 * (`nombreSaisi(v) ?? 0`), et ce zéro décidait du bouton et du résumé (règle 6
 * prise à l'envers). Depuis, l'écran envoie les TEXTES tapés, tels quels, à
 * `POST /api/verification/aliment` pendant la frappe et à `POST`/`PATCH
 * /api/aliments` à l'écriture : c'est le serveur (`VerdictAliment`,
 * `NombreSaisi`) qui lit, juge et refuse. L'écran n'affiche que ce qui revient.
 *
 * CE QU'ON N'ÉPROUVE PAS ICI : les bornes de cohérence elles-mêmes — elles
 * vivent sur le serveur et sont éprouvées par PHPUnit. On éprouve
 * l'ASSEMBLAGE : que le corps envoyé porte bien le texte tapé (pas un zéro
 * inventé), que le refus du serveur arrive sous le bon champ, et que la base
 * ne contienne que ce que l'écran a vraiment promis.
 */

const BASE = process.env.FITCARNET_URL ?? 'http://localhost:8080';

/* Un féculent cohérent, cru — règle 3 : le riz sec vaut 350 kcal/100 g. */
const RIZ_SEC = { kcal: '350', prot: '7', gluc: '78', lip: '0.6' };

test.describe('l\'éditeur d\'aliment : vide n\'est pas zéro, et c\'est le serveur qui lit', () => {
  let email = '';

  test.beforeEach(() => { email = creerCompte('macros'); });
  test.afterEach(() => { supprimerCompte(email); });

  test('CA-1 : Protéines vide part "" au serveur, le refus s\'affiche, rien n\'entre en base',
    async ({ page }) => {
      await seConnecter(page, email);
      await ouvrirLEditeur(page);

      await champ(page, 'Nom').fill('Riz CA1');
      await page.getByText('Glucide', { exact: true }).click();

      /* LE TÉMOIN DE CE QUI EST VRAIMENT ENVOYÉ. On intercepte la requête de
         verdict et on lit SON CORPS : un `prot100: 0` inventé par l'écran
         serait le défaut exact que la feature corrige, et rien à l'écran ne
         le distinguerait d'un `""`. */
      const requeteDeVerdict = page.waitForResponse((r) => {
        if (!r.url().includes('/verification/aliment')) return false;
        const b = r.request().postDataJSON() as Record<string, unknown> | null;

        return b?.['gluc100'] === '78' && b?.['lip100'] === '0.6';
      });

      await champ(page, 'Calories').fill(RIZ_SEC.kcal);
      await champ(page, 'Glucides').fill(RIZ_SEC.gluc);
      await champ(page, 'Lipides').fill(RIZ_SEC.lip);

      const reponse = await requeteDeVerdict;
      const corps = reponse.request().postDataJSON() as Record<string, unknown>;
      expect(corps['prot100']).toBe('');

      await expect(page.getByTestId('refus-prot100')).toBeVisible();

      /* MÊME EN FORÇANT LE CLIC : le bouton est éteint par le serveur
         (`enregistrable: false`, une macro obligatoire manque), et rien ne
         doit entrer en base. */
      const bouton = page.getByText('Enregistrer', { exact: true });
      await expect(bouton.locator('xpath=ancestor-or-self::*[@aria-disabled="true"]').first())
        .toBeVisible();
      await bouton.click({ force: true });

      await page.waitForTimeout(500);
      expect(alimentsDe(email)).toEqual([]);
    });

  test('CA-2 : une lettre tapée, ou collée au milieu d\'un nombre, ne change rien au champ',
    async ({ page }) => {
      await seConnecter(page, email);
      await ouvrirLEditeur(page);

      const calories = champ(page, 'Calories');
      await calories.fill('350');
      await calories.click();
      await page.keyboard.insertText('a');
      await expect(calories).toHaveValue('350');
      await page.keyboard.insertText('4a2');
      await expect(calories).toHaveValue('350');

      /* Le même filtre s'applique à « Poids avant cuisson », derrière
         « Je préfère mesurer ». */
      await page.getByText('Je préfère mesurer', { exact: true }).click();
      const avant = champ(page, 'Poids avant cuisson');
      await avant.fill('100');
      await avant.click();
      await page.keyboard.insertText('a');
      await expect(avant).toHaveValue('100');
      await page.keyboard.insertText('4a2');
      await expect(avant).toHaveValue('100');
    });

  test('CA-3 : "42" puis ",5" tapé affiche "42,5"', async ({ page }) => {
    await seConnecter(page, email);
    await ouvrirLEditeur(page);

    const calories = champ(page, 'Calories');
    await calories.fill('42');
    await calories.click();
    await page.keyboard.insertText(',5');

    await expect(calories).toHaveValue('42,5');
  });

  test('CA-4 : "4,2,1" est accepté par le filtre de frappe, et refusé par le serveur',
    async ({ page }) => {
      await seConnecter(page, email);
      await ouvrirLEditeur(page);

      const prot = champ(page, 'Protéines');
      await prot.fill('4,2,1');
      /* LE FILTRE FRONT NE BLOQUE PAS CETTE SAISIE : `frappeNumeriqueAcceptee`
         n'accepte que des chiffres, virgules et points, et « 4,2,1 » n'a que
         ça. Le témoin de cette moitié de l'épreuve. */
      await expect(prot).toHaveValue('4,2,1');

      await expect(page.getByTestId('refus-prot100')).toBeVisible();
    });

  test('CA-7 : les deux pesées brutes partent au serveur, sans ratioCandidat, '
    + 'et le rendement affiché est celui du serveur',
  async ({ page }) => {
    await seConnecter(page, email);
    await ouvrirLEditeur(page);

    const nom = `Riz mesuré ${Date.now()}`;
    await champ(page, 'Nom').fill(nom);
    await page.getByText('Glucide', { exact: true }).click();
    await champ(page, 'Calories').fill(RIZ_SEC.kcal);
    await champ(page, 'Protéines').fill(RIZ_SEC.prot);
    await champ(page, 'Glucides').fill(RIZ_SEC.gluc);
    await champ(page, 'Lipides').fill(RIZ_SEC.lip);

    await page.getByText('Je préfère mesurer', { exact: true }).click();

    const requeteDeVerdict = page.waitForResponse((r) => {
      if (!r.url().includes('/verification/aliment')) return false;
      const b = r.request().postDataJSON() as Record<string, unknown> | null;

      return b?.['peseeAvant'] === '100' && b?.['peseeApres'] === '230';
    });

    await champ(page, 'Poids avant cuisson').fill('100');
    await champ(page, 'Poids après cuisson').fill('230');

    const reponse = await requeteDeVerdict;
    const corps = reponse.request().postDataJSON() as Record<string, unknown>;
    expect(corps['peseeAvant']).toBe('100');
    expect(corps['peseeApres']).toBe('230');
    expect('ratioCandidat' in corps).toBe(false);

    const verdict = await reponse.json() as {
      rendement: { valeur: number | null; explication: string | null };
    };
    expect(verdict.rendement.explication).toBe(
      '100 g avant cuisson donnent 230 g une fois cuits.');

    await expect(page.getByTestId('rendement')).toHaveText(verdict.rendement.explication ?? '');

    const bouton = page.getByText('Enregistrer', { exact: true });
    await expect(bouton.locator('xpath=ancestor-or-self::*[@aria-disabled="true"]'))
      .toHaveCount(0);
    await bouton.click();

    await expect.poll(() => alimentsDe(email).length, { timeout: 10_000 }).toBe(1);
    const [enBase] = alimentsDe(email);
    expect(enBase?.ratio).toBeCloseTo(2.3, 1);
  });

  test('CA-12 : "12,5" tapé en Protéines devient 12.5 en base, lu par le serveur',
    async ({ page }) => {
      await seConnecter(page, email);
      await ouvrirLEditeur(page);

      const nom = `Riz CA12 ${Date.now()}`;
      await champ(page, 'Nom').fill(nom);
      await page.getByText('Glucide', { exact: true }).click();
      await champ(page, 'Calories').fill(RIZ_SEC.kcal);
      await champ(page, 'Protéines').fill('12,5');
      await champ(page, 'Glucides').fill(RIZ_SEC.gluc);
      await champ(page, 'Lipides').fill(RIZ_SEC.lip);
      await page.getByText(/Riz, pâtes, quinoa/).click();

      const bouton = page.getByText('Enregistrer', { exact: true });
      await expect(bouton.locator('xpath=ancestor-or-self::*[@aria-disabled="true"]'))
        .toHaveCount(0);

      const creation = page.waitForResponse((r) =>
        r.url().includes('/api/aliments') && r.request().method() === 'POST');
      await bouton.click();
      await creation;

      const jeton = await jetonDe(email);
      const liste = await fetch(`${BASE}/api/aliments`, {
        headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/ld+json' },
      });
      const donnees = await liste.json() as { member?: { nom: string; prot100: number }[] };
      const cree = (donnees.member ?? []).find((a) => a.nom === nom);
      expect(cree?.prot100).toBe(12.5);
    });

  test('CA-15 : un 422 à l\'écriture affiche son refus sous le champ, la saisie reste intacte',
    async ({ page }) => {
      await seConnecter(page, email);
      await ouvrirLEditeur(page);

      const nom = `Riz CA15 ${Date.now()}`;
      await champ(page, 'Nom').fill(nom);
      await page.getByText('Glucide', { exact: true }).click();
      await champ(page, 'Calories').fill(RIZ_SEC.kcal);
      await champ(page, 'Protéines').fill(RIZ_SEC.prot);
      await champ(page, 'Glucides').fill(RIZ_SEC.gluc);
      await champ(page, 'Lipides').fill(RIZ_SEC.lip);
      await page.getByText(/Riz, pâtes, quinoa/).click();

      const bouton = page.getByText('Enregistrer', { exact: true });
      await expect(bouton.locator('xpath=ancestor-or-self::*[@aria-disabled="true"]'))
        .toHaveCount(0);

      await page.route('**/api/aliments', async (route) => {
        if (route.request().method() !== 'POST') { await route.continue(); return; }
        await route.fulfill({
          status: 422,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            violations: [{ propertyPath: 'prot100', message: 'Refus d\'essai' }],
          }),
        });
      });

      await bouton.click();

      await expect(page.getByTestId('refus-prot100')).toContainText('Refus d\'essai');
      await expect(champ(page, 'Nom')).toHaveValue(nom);
      await expect(champ(page, 'Calories')).toHaveValue(RIZ_SEC.kcal);
      await expect(champ(page, 'Protéines')).toHaveValue(RIZ_SEC.prot);

      expect(alimentsDe(email)).toEqual([]);
    });

  test('CA-R6 : le serveur de vérification injoignable pendant la saisie — '
    + 'bandeau d\'incertitude, aucun refus, rendement inconnu',
  async ({ page }) => {
    await seConnecter(page, email);
    await ouvrirLEditeur(page);

    await page.route('**/api/verification/aliment', (route) => route.abort());

    await champ(page, 'Nom').fill('Riz en panne');
    await page.getByText('Glucide', { exact: true }).click();
    await champ(page, 'Calories').fill(RIZ_SEC.kcal);
    /* Une saisie que le serveur refuserait normalement (CA-4) : en panne,
       aucun refus ne doit apparaître — il n'y a personne pour le dire. */
    await champ(page, 'Protéines').fill('4,2,1');
    await champ(page, 'Glucides').fill(RIZ_SEC.gluc);
    await champ(page, 'Lipides').fill(RIZ_SEC.lip);

    await expect(page.getByText(
      /Le serveur n'a pas répondu : rien de ce que tu tapes n'est vérifié/))
      .toBeVisible();

    await expect(page.locator('[data-testid^="refus-"]')).toHaveCount(0);
    await expect(page.getByTestId('rendement')).toHaveText('Rendement : inconnu');
  });

  test('CA-R7 : le serveur injoignable à l\'enregistrement — '
    + '« Rien n\'a été enregistré », saisie intacte, rien en base',
  async ({ page }) => {
    await seConnecter(page, email);
    await ouvrirLEditeur(page);

    const nom = `Riz CA-R7 ${Date.now()}`;
    await champ(page, 'Nom').fill(nom);
    await page.getByText('Glucide', { exact: true }).click();
    await champ(page, 'Calories').fill(RIZ_SEC.kcal);
    await champ(page, 'Protéines').fill(RIZ_SEC.prot);
    await champ(page, 'Glucides').fill(RIZ_SEC.gluc);
    await champ(page, 'Lipides').fill(RIZ_SEC.lip);
    await page.getByText(/Riz, pâtes, quinoa/).click();

    const bouton = page.getByText('Enregistrer', { exact: true });
    await expect(bouton.locator('xpath=ancestor-or-self::*[@aria-disabled="true"]'))
      .toHaveCount(0);

    /* SEULE L'ÉCRITURE EST COUPÉE : le verdict, lui, a déjà répondu. */
    await page.route('**/api/aliments', async (route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      await route.abort();
    });

    await bouton.click();

    await expect(page.getByText(/Rien n'a été enregistré/)).toBeVisible();
    await expect(champ(page, 'Nom')).toHaveValue(nom);
    await expect(champ(page, 'Calories')).toHaveValue(RIZ_SEC.kcal);

    expect(alimentsDe(email)).toEqual([]);
  });

  test('NON-RÉGRESSION : un aliment cohérent se crée, apparaît dans le frigo, '
    + 'et se corrige par "Corriger les valeurs"',
  async ({ page }) => {
    await seConnecter(page, email);
    await ouvrirLEditeur(page);

    const nomDepart = `Riz blanc cru ${Date.now()}`;
    await champ(page, 'Nom').fill(nomDepart);
    await page.getByText('Glucide', { exact: true }).click();
    await champ(page, 'Calories').fill(RIZ_SEC.kcal);
    await champ(page, 'Protéines').fill(RIZ_SEC.prot);
    await champ(page, 'Glucides').fill(RIZ_SEC.gluc);
    await champ(page, 'Lipides').fill(RIZ_SEC.lip);
    /* Rendement GUIDE, pas mesuré : le cas le plus courant de l'écran. */
    await page.getByText(/Riz, pâtes, quinoa/).click();

    const bouton = page.getByText('Enregistrer', { exact: true });
    await expect(bouton.locator('xpath=ancestor-or-self::*[@aria-disabled="true"]'))
      .toHaveCount(0);
    await bouton.click();

    await expect(page.getByText(nomDepart, { exact: true })).toBeVisible();

    await page.getByText(nomDepart, { exact: true }).click();
    await page.getByText('Corriger les valeurs', { exact: true }).click();

    const nomCorrige = `${nomDepart} corrigé`;
    await champ(page, 'Nom').fill(nomCorrige);

    const boutonCorrection = page.getByText('Enregistrer', { exact: true });
    await expect(boutonCorrection.locator('xpath=ancestor-or-self::*[@aria-disabled="true"]'))
      .toHaveCount(0);
    await boutonCorrection.click();

    await expect(page.getByText(nomCorrige, { exact: true })).toBeVisible();
    await expect(page.getByText(nomDepart, { exact: true })).toBeHidden();
  });
});

// --------------------------------------------------------------------- outils

/** Un champ de l'éditeur, désigné par son étiquette — jamais par son rang. */
const champ = (page: import('@playwright/test').Page, etiquette: string) =>
  page.getByLabel(etiquette, { exact: true });

/**
 * Ouvre l'éditeur de CRÉATION depuis `/frigo`.
 *
 * Texte EXACT sur le bouton : l'écran vide affiche aussi « Ajoute un aliment
 * pour commencer », qu'une expression régulière trop large attraperait aussi.
 */
async function ouvrirLEditeur(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/frigo');
  await page.getByText('Ajouter un aliment', { exact: true }).click();
  await expect(champ(page, 'Calories')).toBeVisible();
}
