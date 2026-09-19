/** BOBINE : le bandeau suit la personne, et l'écran de changement ferme toutes les sessions. */
import { lancerNavigateur, ouvrir, fermerEtRanger, ADRESSE, pause, cliquer, taper, surveiller } from './commun.mjs';
import path from 'node:path';
const [email, mdp, nouveau] = process.argv.slice(2);
const DOSSIER = path.resolve(process.env.HOME, 'perso/fitcarnet/presentation/captures/compte');
const BANDEAU = 'Ton mot de passe ne suit plus les règles — le changer ›';
const nav = await lancerNavigateur();
const ctx = await ouvrir(nav, DOSSIER);
const page = await ctx.newPage();
const journal = []; surveiller(page, journal);

await page.goto(`${ADRESSE}/connexion`, { waitUntil: 'networkidle' });
await pause(page, 1.5);
const inp = page.locator('input');
await taper(page, inp.nth(0), email);
await page.keyboard.press('Enter'); await pause(page, 0.4);
await page.keyboard.type(mdp, { delay: 60 });
await pause(page, 0.8);
await page.keyboard.press('Enter');
await page.waitForURL(/seances/, { timeout: 15000 });
await pause(page, 3);                       // le bandeau doré, en haut de Séances

for (const c of ['/(onglets)/repas', '/(onglets)/frigo']) {   // il suit d'un onglet à l'autre
  await page.goto(`${ADRESSE}${c}`, { waitUntil: 'networkidle' });
  await pause(page, 2);
}
await cliquer(page, page.getByText(BANDEAU, { exact: true }));
await pause(page, 3.5);                     // l'écran, et « tu seras déconnecté de tous tes appareils »

const c = page.locator('input[type=password]');
await taper(page, c.nth(0), mdp);
await pause(page, 1);
await taper(page, c.nth(1), 'motdepasse');  // la jauge : « Trop faible » + ce qui manque
await pause(page, 3.5);
await c.nth(1).fill('');
await taper(page, c.nth(1), nouveau);
await pause(page, 3);                       // « Solide », les cinq lignes cochées
await taper(page, c.nth(2), nouveau);
await pause(page, 2);
await cliquer(page, page.getByText('Changer mon mot de passe', { exact: true }).last());
await pause(page, 4.5);                     // « C'est fait » + les sessions fermées
await cliquer(page, page.getByText('Se reconnecter', { exact: true }).last());
await page.waitForURL(/connexion/, { timeout: 15000 });
await pause(page, 2.5);
console.log('JOURNAL', journal.join('\n  ') || '(rien)');
console.log('VIDEO', await fermerEtRanger(ctx, DOSSIER, '05-changer-mot-de-passe.webm'));
await nav.close();
