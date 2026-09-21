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

  /**
   * EFFACER LES CALORIES DOIT FAIRE DISPARAÎTRE L'AVERTISSEMENT.
   *
   * Relevé par `revue-fitcarnet` le 21 septembre 2026. Le verdict vient du
   * serveur avec `placeholderData: keepPreviousData`, qui conserve la réponse
   * précédente même quand la requête est COUPÉE. La phrase restait donc à
   * l'écran sur une cible qui n'avait plus de calories — alors qu'avant le
   * palier B, le calcul étant synchrone, elle disparaissait à la frappe.
   */
  test('l\'avertissement disparaît dès que la saisie n\'est plus lisible', async ({ page }) => {
    await seConnecter(page, email);
    await page.goto('/objectifs');

    await saisirLaCible(page);
    await expect(page.getByText(AVERTISSEMENT)).toBeVisible();

    await champ(page, 'Calories').fill('');

    await expect(page.getByText(AVERTISSEMENT)).toBeHidden();
  });

  /**
   * LE CONVERTISSEUR DE PLAN AMÉRICAIN — porté au serveur le 21 septembre 2026,
   * `front/src/calcul/planCoach.ts` supprimé. Ses treize cas de test sont
   * maintenant en PHP (`PlanCoachTest`) ; ce qu'ils ne peuvent PAS voir, c'est
   * que les cinq champs partent et que la conversion revienne à l'écran.
   */
  test('convertit un plan américain : les fibres quittent les glucides', async ({ page }) => {
    await seConnecter(page, email);
    await page.goto('/objectifs');

    await page.getByText(/Recopier depuis un plan américain/).click();

    /* Le petit-déjeuner du plan réel : 64,7 g de glucides dont 3,5 de fibres,
       soit 61,2 g une fois les fibres retranchées. */
    await champDuPlan(page, 'Protéines').fill('26.8');
    await champDuPlan(page, 'Glucides totaux').fill('64.7');
    await champDuPlan(page, 'Lipides').fill('25.9');
    await champDuPlan(page, 'Fibres').fill('3.5');
    await champDuPlan(page, 'Calories du plan').fill('578.6');

    await expect(page.getByText(/hors fibres ces glucides valent 61,2 g/)).toBeVisible();

    /* Et l'avertissement sur des fibres sous-estimées, rédigé par le serveur :
       3,5 g pour 64,7 g de glucides, soit moins du dixième. */
    await expect(page.getByText(/ton plan les sous-estime/)).toBeVisible();
  });

  /**
   * ET LE BLOC SE REFERME QUAND UN CHAMP REDEVIENT ILLISIBLE, SANS « NaN ».
   *
   * Le jumeau du cas ci-dessus, en pire : la ligne « Sera enregistré » mêle la
   * réponse du serveur à la saisie VIVANTE. Effacer « Glucides totaux »
   * affichait « 26,8 P · NaN G fibres comprises », et le bloc ne se refermait
   * jamais. La fiche `fonctionnalite-objectifs` l'interdit : « aucun NaN ni
   * undefined ne doit apparaître à l'écran ».
   */
  test('effacer un champ du plan referme le bloc, sans afficher « NaN »', async ({ page }) => {
    await seConnecter(page, email);
    await page.goto('/objectifs');

    await page.getByText(/Recopier depuis un plan américain/).click();
    await champDuPlan(page, 'Protéines').fill('26.8');
    await champDuPlan(page, 'Glucides totaux').fill('64.7');
    await champDuPlan(page, 'Lipides').fill('25.9');
    await champDuPlan(page, 'Fibres').fill('3.5');
    await champDuPlan(page, 'Calories du plan').fill('578.6');
    await expect(page.getByText(/Sera enregistré/)).toBeVisible();

    await champDuPlan(page, 'Glucides totaux').fill('');

    await expect(page.getByText(/Sera enregistré/)).toBeHidden();
    await expect(page.getByText(/NaN/)).toHaveCount(0);
  });
});

/* LES CINQ CHAMPS DU CONVERTISSEUR VIENNENT AVANT les quatre de la cible dans
   l'ordre du document : le panneau se déplie AU-DESSUS d'eux (`objectifs.tsx`
   rend le convertisseur, puis les champs de la cible).

   Ce commentaire disait le contraire — relevé par `revue-fitcarnet` le
   21 septembre 2026. Le piège qu'il cachait : `champ()` plus bas vise les
   indices 0 à 3 pour la cible, ce qui n'est vrai QUE PANNEAU FERMÉ. Aucune
   épreuve ne fait les deux à la fois aujourd'hui ; celle qui s'y essaiera
   trouvera ici de quoi comprendre pourquoi elle tape dans le mauvais champ. */
const champDuPlan = (page: import('@playwright/test').Page, etiquette: string) =>
  page.locator('input').nth(
    ({ 'Protéines': 0, 'Glucides totaux': 1, 'Lipides': 2, 'Fibres': 3, 'Calories du plan': 4 })[etiquette] ?? 0);

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

/* L'ordre des quatre champs de la cible, PANNEAU DU CONVERTISSEUR FERMÉ. Les
   libellés ne sont pas des `<label for>` en React Native web : on ne peut pas
   les viser par `getByLabel`. */
const indexDuChamp = (etiquette: string): number =>
  ({ 'Protéines': 0, 'Glucides': 1, 'Lipides': 2, 'Calories': 3 })[etiquette] ?? 0;
