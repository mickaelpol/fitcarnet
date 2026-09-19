import { lancerNavigateur, ADRESSE, surveiller, LARGEUR, HAUTEUR } from './commun.mjs';
const [jeton] = process.argv.slice(2);
const nav = await lancerNavigateur();
const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
const page = await ctx.newPage();
const journal = []; surveiller(page, journal);
const txt = async () => (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ');
const S = '/tmp/claude-1000/-home-micka-perso-fitcarnet/63b81794-0521-411a-932e-699fb6e29bc0/scratchpad';

await page.goto(`${ADRESSE}/invitation/${jeton}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
console.log('=== INVITATION ===\n', await txt());
console.log('CHAMPS', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ type: i.type, ph: i.placeholder, ac: i.getAttribute('autocomplete') })))));
await page.screenshot({ path: `${S}/invit-accueil.png`, fullPage: true });

const c = page.locator('input');
// enchaînement par Entrée sur CET écran ?
await c.nth(0).click(); await c.nth(0).type('Zoé', { delay: 40 });
await page.keyboard.press('Enter'); await page.waitForTimeout(400);
console.log('Entree depuis « Ton nom » -> index du focus =', await page.evaluate(() => [...document.querySelectorAll('input')].indexOf(document.activeElement)));

await c.nth(1).click(); await c.nth(1).type('motdepasse', { delay: 40 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${S}/invit-jauge-faible.png`, fullPage: true });
console.log('=== JAUGE FAIBLE ===', (await txt()).match(/Trop faible|Faible|Moyen|Bon|Solide/)?.[0]);

await c.nth(1).fill('Kx7#mLp2vQ9z');
await c.nth(2).click(); await c.nth(2).type('Kx7#autre', { delay: 30 });
await page.waitForTimeout(700);
console.log('=== DIVERGENCE ===', (await txt()).includes('Les deux ne sont pas identiques.'));
await page.screenshot({ path: `${S}/invit-divergence.png`, fullPage: true });
await c.nth(2).fill('Kx7#mLp2vQ9z');
await page.waitForTimeout(600);
await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
console.log('Entree depuis la confirmation -> a-t-elle cree le compte ?', (await txt()).includes('Ton compte est prêt'));
await page.getByText('Créer mon compte', { exact: true }).last().click({ force: true });
await page.waitForTimeout(3500);
console.log('=== APRES CREATION ===\n', await txt());
await page.screenshot({ path: `${S}/invit-pret.png`, fullPage: true });
console.log('JOURNAL', journal.join('\n  ') || '(rien)');
await nav.close();
