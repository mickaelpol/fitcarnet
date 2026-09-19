import { lancerNavigateur, ADRESSE, surveiller, LARGEUR, HAUTEUR } from './commun.mjs';
const [email, mdp, invite] = process.argv.slice(2);
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

await page.goto(`${ADRESSE}/(onglets)/compte`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
console.log('=== COMPTE ADMIN ===\n', (await txt()).slice(0, 900));
await page.getByText('Inviter quelqu’un', { exact: true }).or(page.getByText("Inviter quelqu'un", { exact: true })).last().click();
await page.waitForTimeout(2500);
console.log('=== ECRAN INVITATION, url =', page.url(), '===\n', await txt());
await page.screenshot({ path: `${S}/admin-invit-avant.png`, fullPage: true });

const champ = page.locator('input').first();
await champ.click(); await champ.type(invite, { delay: 40 });
await page.waitForTimeout(400);
await page.getByText('Créer le lien', { exact: true }).last().click();
await page.waitForTimeout(3000);
const t = await txt();
console.log('=== APRES CREATION ===\n', t);
await page.screenshot({ path: `${S}/admin-invit-lien.png`, fullPage: true });
const m = t.match(/https?:\/\/[^\s|]+\/invitation\/[A-Za-z0-9_-]+/);
console.log('LIEN1', m ? m[0] : '(introuvable dans le texte)');
console.log('JOURNAL', journal.join('\n  ') || '(rien)');
await nav.close();
