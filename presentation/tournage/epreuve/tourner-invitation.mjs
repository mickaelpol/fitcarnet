/** BOBINE : rejoindre — la jauge dit ce qui manque, et la confirmation ce qui diffère. */
import { lancerNavigateur, ouvrir, fermerEtRanger, ADRESSE, pause, cliquer, taper, surveiller } from './commun.mjs';
import path from 'node:path';
const [jeton] = process.argv.slice(2);
const DOSSIER = path.resolve(process.env.HOME, 'perso/fitcarnet/presentation/captures/acces');
const nav = await lancerNavigateur();
const ctx = await ouvrir(nav, DOSSIER);
const page = await ctx.newPage();
const journal = []; surveiller(page, journal);

await page.goto(`${ADRESSE}/invitation/${jeton}`, { waitUntil: 'networkidle' });
await pause(page, 3.5);                        // « Bienvenue », l'adresse DÉJÀ remplie
const c = page.locator('input');
await taper(page, c.nth(0), 'Camille');
await pause(page, 1);
await taper(page, c.nth(1), 'motdepasse');     // la jauge passe au rouge et NOMME ce qui manque
await pause(page, 3.5);
await c.nth(1).fill('');
await taper(page, c.nth(1), 'Mon-Chat-Dort-9!');
await pause(page, 3);                          // les cinq lignes se cochent
await taper(page, c.nth(2), 'Mon-Chat');       // divergence
await pause(page, 3);
await c.nth(2).fill('Mon-Chat-Dort-9!');
await pause(page, 2);
await cliquer(page, page.getByText('Créer mon compte', { exact: true }).last());
await pause(page, 4);                          // « Ton compte est prêt »
console.log('JOURNAL', journal.join('\n  ') || '(rien)');
console.log('VIDEO', await fermerEtRanger(ctx, DOSSIER, '06-invitation-jauge.webm'));
await nav.close();
