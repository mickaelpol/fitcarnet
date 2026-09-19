import { lancerNavigateur, ADRESSE, surveiller, LARGEUR, HAUTEUR } from './commun.mjs';
const [email, mdp, nouveau] = process.argv.slice(2);
const nav = await lancerNavigateur();
const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
const page = await ctx.newPage();
const journal = []; surveiller(page, journal);
const txt = async () => (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ');
const bouton = () => page.getByText('Changer mon mot de passe', { exact: true }).last();

await page.goto(`${ADRESSE}/connexion`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const inp = page.locator('input');
await inp.nth(0).fill(email); await inp.nth(1).fill(mdp);
await page.keyboard.press('Enter');
await page.waitForURL(/seances/, { timeout: 15000 });
await page.goto(`${ADRESSE}/mot-de-passe`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
const c = page.locator('input');

// le bouton est-il vraiment éteint à vide ? on compte les PATCH
let patchs = 0;
page.on('request', r => { if (r.method() === 'PATCH') patchs++; });
await bouton().click({ force: true }); await page.waitForTimeout(800);
console.log('CLIC A VIDE -> PATCH :', patchs);

// MOT DE PASSE ACTUEL FAUX
await c.nth(0).fill('PasLeBon9!aaa'); await c.nth(1).fill(nouveau); await c.nth(2).fill(nouveau);
await page.waitForTimeout(400);
await bouton().click({ force: true });
await page.waitForTimeout(3000);
console.log('=== ACTUEL FAUX ===\n', await txt());
await page.screenshot({ path: '/tmp/claude-1000/-home-micka-perso-fitcarnet/63b81794-0521-411a-932e-699fb6e29bc0/scratchpad/mdp-actuel-faux.png', fullPage: true });

// NOUVEAU MOT DE PASSE REFUSE PAR LE SERVEUR ? la jauge bloque déjà le bouton — on vérifie l'API à part.

// LE VRAI CHANGEMENT
await c.nth(0).fill(mdp); await c.nth(1).fill(nouveau); await c.nth(2).fill(nouveau);
await page.waitForTimeout(600);
await bouton().click({ force: true });
await page.waitForTimeout(3500);
console.log('=== APRES CHANGEMENT ===\n', await txt());
await page.screenshot({ path: '/tmp/claude-1000/-home-micka-perso-fitcarnet/63b81794-0521-411a-932e-699fb6e29bc0/scratchpad/mdp-cest-fait.png', fullPage: true });

// LE BOUTON « Se reconnecter »
await page.getByText('Se reconnecter', { exact: true }).last().click({ force: true });
await page.waitForTimeout(3000);
console.log('APRES « Se reconnecter » — url =', page.url(), '|', (await txt()).slice(0, 120));
console.log('cookies restants', JSON.stringify((await ctx.cookies()).map(k => k.name)));
console.log('localStorage', await page.evaluate(() => Object.keys(localStorage).join(',') || '(vide)'));
console.log('JOURNAL', journal.join('\n  ') || '(rien)');
await nav.close();
