import { lancerNavigateur, ADRESSE, surveiller, LARGEUR, HAUTEUR } from './commun.mjs';
const [email, mdp, nouveau] = process.argv.slice(2);
const nav = await lancerNavigateur();
const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
const page = await ctx.newPage();
const journal = []; surveiller(page, journal);
const txt = async () => (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ');
const S = '/tmp/claude-1000/-home-micka-perso-fitcarnet/63b81794-0521-411a-932e-699fb6e29bc0/scratchpad';

await page.goto(`${ADRESSE}/connexion`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const inp = page.locator('input');
await inp.nth(0).fill(email); await inp.nth(1).fill(mdp);
await page.keyboard.press('Enter');
await page.waitForURL(/seances/, { timeout: 15000 });
await page.waitForTimeout(1500);
await page.getByText('Ton mot de passe ne suit plus les règles — le changer ›', { exact: true }).click();
await page.waitForTimeout(2000);
const c = page.locator('input[type=password]');
await c.nth(0).fill(mdp); await c.nth(1).fill(nouveau); await c.nth(2).fill(nouveau);
await page.waitForTimeout(500);
await page.getByText('Changer mon mot de passe', { exact: true }).last().click({ force: true });
await page.waitForTimeout(3000);
console.log('=== C EST FAIT ===', (await txt()).includes('C’est fait'));
console.log('cookies', JSON.stringify((await ctx.cookies()).map(k => k.name)));

// L'UTILISATEUR APPUIE SUR LA FLÈCHE DE RETOUR AU LIEU DE « Se reconnecter »
await page.locator('text=‹').first().click({ force: true });
await page.waitForTimeout(3000);
console.log('APRES RETOUR — url =', page.url());
console.log('ECRAN :', (await txt()).slice(0, 260));
await page.screenshot({ path: `${S}/retour-apres-changement.png` });

// est-ce qu'on peut encore agir ? on ouvre un onglet qui appelle l'API
await page.goto(`${ADRESSE}/(onglets)/compte`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
console.log('COMPTE APRES RETOUR :', (await txt()).slice(0, 240));
await page.screenshot({ path: `${S}/compte-apres-changement.png` });

// et après un rechargement (le JWT en mémoire est perdu) ?
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
console.log('APRES RECHARGEMENT — url =', page.url(), '|', (await txt()).slice(0, 120));
console.log('JOURNAL', journal.join('\n  ') || '(rien)');
await nav.close();
