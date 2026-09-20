import { expect, test } from '@playwright/test';
import { alimentsDe, creerCompte, seConnecter, supprimerCompte } from './compteJetable';

/**
 * AJOUTER UN ALIMENT : L'APPLICATION VÉRIFIE SES MACROS.
 *
 * CE PARCOURS A ÉTÉ FAIT À LA MAIN LE 20 SEPTEMBRE 2026, et il a trouvé trois
 * défauts que 1 293 tests unitaires n'avaient pas vus :
 *
 *   1. le serveur refusait un aliment incohérent par l'entité, mais le chemin
 *      Grocy l'acceptait sans un mot ;
 *   2. l'écran affichait « Cohérent » en vert sur ce que le serveur allait
 *      refuser, parce qu'il jugeait avec la moitié des règles ;
 *   3. le message de refus attendait les QUATRE macros pour apparaître, alors
 *      que les calories et le rendement suffisent à le savoir.
 *
 * Aucun de ces trois ne se voit sans monter l'application entière. C'est la
 * raison d'être de ce fichier.
 *
 * CE QU'ON N'ÉPROUVE PAS ICI : les bornes elles-mêmes. Elles vivent dans
 * `api/regles/coherence.json`, lu par les deux suites unitaires, et les
 * rejouer ici les rendrait lentes sans rien garantir de plus. On éprouve
 * l'ASSEMBLAGE — que l'écran dise ce que le serveur fera, et que la base
 * contienne ce que l'écran a promis.
 */

/* Les valeurs du riz, telles qu'on les pèse (règle 3) : 350 kcal pour du cru.
   130 kcal, ce sont celles du riz CUIT — le calcul resterait juste et ferait
   peser trois fois trop. */
const RIZ_CUIT = { kcal: '130', prot: '2.7', gluc: '28', lip: '0.3' };
const RIZ_SEC = { kcal: '350', prot: '7', gluc: '78', lip: '0.6' };

test.describe('l\'éditeur d\'aliment', () => {
  let email = '';

  test.beforeEach(() => { email = creerCompte('aliment'); });
  test.afterEach(() => { supprimerCompte(email); });

  test('dit le refus DÈS les calories, sans attendre les autres macros', async ({ page }) => {
    await seConnecter(page, email);
    await ouvrirLEditeur(page);

    await page.getByText('Glucide', { exact: true }).click();
    await champ(page, 'Calories').fill(RIZ_CUIT.kcal);
    /* Le rendement par le raccourci, pas par une pesée : personne ne pèse son
       riz avant de l'avoir cuisiné une première fois. */
    await page.getByText(/Riz, pâtes, quinoa/).click();

    /* LE POINT DE L'ÉPREUVE : on n'a touché ni aux protéines, ni aux glucides,
       ni aux lipides, et l'écran sait déjà. */
    await expect(page.getByText(/grain sec/)).toBeVisible();
  });

  test('éteint le bouton, et rien n\'entre en base', async ({ page }) => {
    await seConnecter(page, email);
    await ouvrirLEditeur(page);
    await remplir(page, RIZ_CUIT, 'Riz de l\'epreuve');

    await expect(page.getByText(/grain sec/)).toBeVisible();

    /* TOUT LE RESTE EST VALIDE — nom, catégorie, quatre macros, rendement.
       La seule raison qui reste d'éteindre le bouton est l'incohérence, et
       c'est cela qu'on éprouve. Sans le nom, cette épreuve passait pour une
       mauvaise raison : le bouton était éteint faute de nom. */
    const bouton = page.getByText('Enregistrer', { exact: true });
    await expect(bouton).toBeVisible();

    /* ON VÉRIFIE QU'IL EST BIEN ÉTEINT — relevé par `revue-fitcarnet` le
       20 septembre 2026. Cette épreuve s'appelait « éteint le bouton » et ne
       vérifiait que sa PRÉSENCE : elle serait restée verte avec un bouton
       parfaitement actif, et c'est exactement ce qui est arrivé pendant la
       refonte. Le motif 4 du projet, dans son propre garde-fou.

       React Native Web rend un bouton inactif en `aria-disabled` : c'est ce
       qu'il faut lire, `toBeDisabled` ne voit que l'attribut HTML natif. */
    await expect(bouton.locator('xpath=ancestor-or-self::*[@aria-disabled]').first())
      .toHaveAttribute('aria-disabled', 'true');

    await bouton.click({ force: true });

    /* LA VRAIE VÉRIFICATION EST EN BASE. Un écran peut afficher un refus et
       enregistrer quand même — c'est exactement ce qui est arrivé le
       20 septembre, dans l'autre sens. */
    await page.waitForTimeout(1_000);
    expect(alimentsDe(email)).toEqual([]);
  });

  test('LE TÉMOIN : le riz SEC passe, et arrive en base tel qu\'il a été saisi',
    async ({ page }) => {
      /* Sans ce cas, un refus permanent passerait les deux épreuves ci-dessus
         tout en rendant l'application inutilisable. */
      await seConnecter(page, email);
      await ouvrirLEditeur(page);
      await remplir(page, RIZ_SEC, 'Riz de l\'epreuve');

      await expect(page.getByText(/grain sec/)).toBeHidden();

      /* LE TÉMOIN DU TÉMOIN : le bouton doit être ACTIF ici. Sans cette
         ligne, un écran qui éteindrait tout passerait les trois épreuves.

         MESURÉ : quand il est actif, React Native Web ne pose PAS
         `aria-disabled` — il le retire. On vérifie donc son absence, et non sa
         valeur « false », qui n'existe jamais. */
      const bouton = page.getByText('Enregistrer', { exact: true });
      await expect(bouton.locator('xpath=ancestor-or-self::*[@aria-disabled="true"]'))
        .toHaveCount(0);

      await bouton.click();

      await expect.poll(() => alimentsDe(email).length, { timeout: 10_000 }).toBe(1);

      const [enBase] = alimentsDe(email);
      expect(enBase?.kcal).toBe(350);
      expect(enBase?.ratio).toBeCloseTo(2.3, 1);
    });
});

// --------------------------------------------------------------------- outils

/**
 * Un champ de l'éditeur, désigné par son étiquette.
 *
 * PAR L'ÉTIQUETTE ET NON PAR SON RANG. La première version comptait les
 * `input` du document — `nth(1)` pour les calories — et se serait décalée au
 * premier champ ajouté à l'écran, en silence. `Champ` expose désormais son
 * étiquette en `aria-label` : c'est le besoin du test qui a révélé qu'un
 * lecteur d'écran, lui, n'avait jamais su nommer ces champs.
 */
const champ = (page: import('@playwright/test').Page, etiquette: string) =>
  page.getByLabel(etiquette, { exact: true });

async function ouvrirLEditeur(page: import('@playwright/test').Page): Promise<void> {
  /* L'URL est `/frigo` et non `/(onglets)/frigo` : le groupe de routes
     d'expo-router ne paraît pas dans l'adresse. Mesuré avec une sonde avant
     d'écrire cette ligne, plutôt que déduit. */
  await page.goto('/frigo');

  /* Texte EXACT : l'écran vide affiche aussi « Ajoute un aliment pour
     commencer », et une expression régulière trop large attraperait les deux —
     Playwright refuserait alors de choisir, et l'échec parlerait de « strict
     mode » au lieu du vrai sujet. */
  await page.getByText('Ajouter un aliment', { exact: true }).click();
  await expect(champ(page, 'Calories')).toBeVisible();
}

/**
 * Remplit TOUT ce que l'écran exige, nom compris.
 *
 * LE NOM MANQUAIT, et c'est ce qui a fait passer l'épreuve du refus pour une
 * mauvaise raison : sans nom, le bouton est éteint de toute façon, et
 * « rien n'est entré en base » ne prouvait plus rien. Le témoin du riz sec est
 * ce qui l'a révélé — il ne s'enregistrait pas non plus. Motif 4 du projet,
 * attrapé par son propre garde-fou.
 */
async function remplir(
  page: import('@playwright/test').Page,
  v: { kcal: string; prot: string; gluc: string; lip: string },
  nom: string,
): Promise<void> {
  await champ(page, 'Nom').fill(nom);
  await page.getByText('Glucide', { exact: true }).click();
  await champ(page, 'Calories').fill(v.kcal);
  await champ(page, 'Protéines').fill(v.prot);
  await champ(page, 'Glucides').fill(v.gluc);
  await champ(page, 'Lipides').fill(v.lip);
  await page.getByText(/Riz, pâtes, quinoa/).click();
}
