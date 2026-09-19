/** BOBINE : entrer — la touche « Entrée » enchaîne les champs, puis connecte. */
import { lancerNavigateur, ouvrir, fermerEtRanger, ADRESSE, pause, cliquer, taper, surveiller } from './commun.mjs';
import path from 'node:path';
const [email, mdp] = process.argv.slice(2);
const DOSSIER = path.resolve(process.env.HOME, 'perso/fitcarnet/presentation/captures/acces');
const nav = await lancerNavigateur();
const ctx = await ouvrir(nav, DOSSIER);
const page = await ctx.newPage();
const journal = []; surveiller(page, journal);

await page.goto(`${ADRESSE}/connexion`, { waitUntil: 'networkidle' });
await pause(page, 3);                       // le titre, le slogan, « Se connecter » éteint
const inp = page.locator('input');
await taper(page, inp.nth(0), email);
await pause(page, 1.5);
await page.keyboard.press('Enter');         // la main passe au mot de passe, sans valider
await pause(page, 2);
await page.keyboard.type(mdp, { delay: 60 });
await pause(page, 1.5);
await page.keyboard.press('Enter');         // et là, ça connecte
await page.waitForURL(/seances/, { timeout: 15000 });
await pause(page, 3);
// la sortie : Compte -> Se déconnecter -> retour à la connexion
await page.goto(`${ADRESSE}/(onglets)/compte`, { waitUntil: 'networkidle' });
await pause(page, 2.5);
await cliquer(page, page.getByText('Se déconnecter', { exact: true }).last());
await page.waitForURL(/connexion/, { timeout: 15000 });
await pause(page, 2.5);
console.log('JOURNAL', journal.join('\n  ') || '(rien)');
console.log('VIDEO', await fermerEtRanger(ctx, DOSSIER, '05-connexion-touche-entree.webm'));
await nav.close();
