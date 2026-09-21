import { expect, test } from '@playwright/test';
import { creerCompte, seConnecter, supprimerCompte } from './compteJetable';

/**
 * LES OBJECTIFS : L'APPLICATION DIT QUAND LES CALORIES NE COLLENT PAS AUX GRAMMES.
 *
 * POURQUOI CETTE ÉPREUVE EXISTE — palier B, 21 septembre 2026. L'écran portait
 * cette règle en entier : le seuil de 15 kcal, les deux conventions de
 * glucides, et la phrase affichée. Elle est partie sur le serveur
 * (`POST /api/verification/cible`), et la consigne du chantier est *« je veux
 * la même application qu'au départ mais avec le serveur autoritaire »*.
 *
 * RIEN D'AUTRE NE PEUT LE VÉRIFIER. `app/objectifs.tsx` n'est atteint par
 * aucune suite unitaire — le motif de `tsconfig.tests.json` ne descend que sous
 * `src/`, donc un test posé dans `app/` ne s'exécute jamais, sans le moindre
 * signal. Les tests PHP prouvent que la règle est JUSTE ; celui-ci prouve
 * qu'elle ARRIVE À L'ÉCRAN — et c'est exactement la moitié qui manquait le
 * 20 septembre 2026, quand « l'écran affichait Cohérent en vert sur ce que le
 * serveur allait refuser ».
 *
 * CE QU'ON N'ÉPROUVE PAS ICI : les bornes elles-mêmes, éprouvées par
 * `CoherenceDesCiblesTest`. On éprouve l'ASSEMBLAGE.
 */

/* 4×40 + 9×20 = 340 de socle, plus 100 g de glucides : 740 kcal sans fibres,
   540 si tout était fibres. La cible annonce 710 — sous les 740, au-delà des
   15 kcal d'arrondi. En convention européenne, l'écart se reproche ; en
   glucides TOTAUX, 710 tombe dans [540 ; 740] et ne se reproche plus. */
const CIBLE = { prot: '40', gluc: '100', lip: '20', kcal: '710' };

const AVERTISSEMENT = /Tes grammes représentent 740 calories, pas 710/;

test.describe('l\'écran des objectifs', () => {
  let email = '';

  test.beforeEach(() => { email = creerCompte('cible'); });
  test.afterEach(() => { supprimerCompte(email); });

  test('avertit quand les calories annoncées ne collent pas aux grammes', async ({ page }) => {
    await seConnecter(page, email);
    await page.goto('/objectifs');

    await saisirLaCible(page);

    await expect(page.getByText(AVERTISSEMENT)).toBeVisible();
    await expect(page.getByText(/L'app respecte les grammes/)).toBeVisible();
  });

  test('se tait en glucides TOTAUX : une part de fibres explique l\'écart', async ({ page }) => {
    await seConnecter(page, email);
    await page.goto('/objectifs');

    await saisirLaCible(page);
    await expect(page.getByText(AVERTISSEMENT)).toBeVisible();

    /* LE POINT DE L'ÉPREUVE : le drapeau doit arriver jusqu'à la règle. S'il se
       perdait en route, l'écran accuserait une cible atteignable dès 7,5 g de
       fibres — la panne M1 du 15 septembre 2026, rejouée par le câblage. */
    await page.getByText('Glucides fibres comprises').click();

    await expect(page.getByText(AVERTISSEMENT)).toBeHidden();
  });

  test('n\'interdit rien : la cible s\'enregistre quand même', async ({ page }) => {
    await seConnecter(page, email);
    await page.goto('/objectifs');

    await saisirLaCible(page);
    await expect(page.getByText(AVERTISSEMENT)).toBeVisible();

    /* « L'app respecte les grammes ; les calories suivent » — la phrase le dit,
       et le bouton doit le tenir. Quelqu'un recopie un plan de coach qui ne
       tombe pas juste, et on ne lui interdit pas de le saisir. */
    /* PAR LE TEXTE, ET NON PAR `getByRole('button')` : le `Bouton` du projet
       est un `Pressable` de React Native web, qui rend un élément générique
       sans rôle ARIA. Playwright attendait 30 s un `button` qui n'existe pas. */
    await page.getByText('Enregistrer', { exact: true }).click();

    await expect(page.getByText(/Objectifs enregistrés/)).toBeVisible();
  });
});

/**
 * Les calories se saisissent EN DERNIER : changer une macro les recalcule, et
 * la saisie assistée écraserait le 710 qu'on vient de taper.
 */
async function saisirLaCible(page: import('@playwright/test').Page): Promise<void> {
  await champ(page, 'Protéines').fill(CIBLE.prot);
  await champ(page, 'Glucides').fill(CIBLE.gluc);
  await champ(page, 'Lipides').fill(CIBLE.lip);
  await champ(page, 'Calories').fill(CIBLE.kcal);
}

const champ = (page: import('@playwright/test').Page, etiquette: string) =>
  page.locator('input').nth(indexDuChamp(etiquette));

/* L'ordre des quatre champs de l'écran, de haut en bas. Les libellés ne sont
   pas des `<label for>` en React Native web : on ne peut pas les viser par
   `getByLabel`. */
const indexDuChamp = (etiquette: string): number =>
  ({ 'Protéines': 0, 'Glucides': 1, 'Lipides': 2, 'Calories': 3 })[etiquette] ?? 0;
