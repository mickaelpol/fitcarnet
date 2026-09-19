/** BOBINE : « Renvoyer un lien » — l'invitation perdue se refait sans retaper l'adresse. */
import { lancerNavigateur, ouvrir, fermerEtRanger, ADRESSE, pause, cliquer, taper, surveiller } from './commun.mjs';
import path from 'node:path';

const [email, mdp, invite] = process.argv.slice(2);
const DOSSIER = path.resolve(process.env.HOME, 'perso/fitcarnet/presentation/captures/administration');
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
await pause(page, 0.6);
await page.keyboard.press('Enter');
await page.waitForURL(/seances/, { timeout: 15000 });
await pause(page, 1.2);

await page.goto(`${ADRESSE}/admin-utilisateurs`, { waitUntil: 'networkidle' });
await pause(page, 2.5);

await taper(page, page.locator('input').first(), invite);
await pause(page, 1);
await cliquer(page, page.getByText('Créer le lien', { exact: true }).last());
await pause(page, 4);           // on laisse lire « Valable 7 jours… »

await cliquer(page, page.getByText('Renvoyer un lien', { exact: true }).first());
await pause(page, 4.5);         // le lien NEUF, et l'ancien qui meurt

const t = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ');
const m = t.match(/https?:\/\/[^\s|]+\/invitation\/([A-Za-z0-9_-]+)/);
console.log('JETON', m ? m[1] : '(aucun)');
console.log('JOURNAL', journal.join('\n  ') || '(rien)');

const f = await fermerEtRanger(ctx, DOSSIER, '06-renvoyer-un-lien.webm');
console.log('VIDEO', f);
await nav.close();
