import { lancerNavigateur, ADRESSE, surveiller, LARGEUR, HAUTEUR } from './commun.mjs';
const [email, mdp, nouveau] = process.argv.slice(2);
const nav = await lancerNavigateur();
const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
const page = await ctx.newPage();
const journal = []; surveiller(page, journal);
const txt = async () => (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ');

await page.goto(`${ADRESSE}/connexion`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const inp = page.locator('input');
await inp.nth(0).fill(email); await inp.nth(1).fill(mdp);
await page.keyboard.press('Enter');
await page.waitForURL(/seances/, { timeout: 15000 });

await page.goto(`${ADRESSE}/(onglets)/compte`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
console.log('=== COMPTE ===\n', (await txt()).slice(0, 700));

await page.getByText('Changer mon mot de passe', { exact: true }).first().click();
await page.waitForTimeout(1800);
console.log('=== ECRAN MDP, url =', page.url(), '===\n', await txt());
console.log('CHAMPS', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ type: i.type, ac: i.getAttribute('autocomplete') })))));

const c = page.locator('input');
// enchaînement par Entrée
await c.nth(0).click(); await c.nth(0).type('x', { delay: 20 });
await page.keyboard.press('Enter'); await page.waitForTimeout(300);
console.log('Entree depuis actuel -> index du focus =', await page.evaluate(() => [...document.querySelectorAll('input')].indexOf(document.activeElement)));
await page.keyboard.type('y', { delay: 20 });
await page.keyboard.press('Enter'); await page.waitForTimeout(300);
console.log('Entree depuis nouveau -> index du focus =', await page.evaluate(() => [...document.querySelectorAll('input')].indexOf(document.activeElement)));

// jauge : mot de passe faible
await c.nth(1).fill(''); await c.nth(1).type('motdepasse', { delay: 40 });
await page.waitForTimeout(600);
console.log('=== JAUGE sur "motdepasse" ===\n', await txt());

// mot de passe identique à l'actuel
await c.nth(0).fill(mdp); await c.nth(1).fill(mdp);
await page.waitForTimeout(500);
console.log('=== NOUVEAU == ACTUEL ===', (await txt()).includes('Ce mot de passe est déjà le tien.'));

// divergence
await c.nth(1).fill(nouveau); await c.nth(2).fill('autre-chose');
await page.waitForTimeout(500);
console.log('=== DIVERGENCE ===', (await txt()).includes('Les deux ne sont pas identiques.'));

// mot de passe actuel FAUX
await c.nth(0).fill('PasLeBon9!aaa'); await c.nth(2).fill(nouveau);
await page.waitForTimeout(400);
await page.getByText('Changer mon mot de passe', { exact: true }).first().click();
await page.waitForTimeout(2500);
console.log('=== ACTUEL FAUX ===\n', await txt());

console.log('JOURNAL', journal.join('\n  ') || '(rien)');
await page.screenshot({ path: '/tmp/claude-1000/-home-micka-perso-fitcarnet/63b81794-0521-411a-932e-699fb6e29bc0/scratchpad/mdp-actuel-faux.png' });
await nav.close();
