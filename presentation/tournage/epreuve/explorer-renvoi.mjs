import { lancerNavigateur, ADRESSE, surveiller, LARGEUR, HAUTEUR } from './commun.mjs';
const [email, mdp, invite, lien1] = process.argv.slice(2);
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
await page.goto(`${ADRESSE}/admin-utilisateurs`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// le lien précédent n'est PLUS affiché après rechargement de l'écran — on le vérifie
console.log('lien encore affiché après rechargement ?', (await txt()).includes(lien1.split('/').pop()));

await page.getByText('Renvoyer un lien', { exact: true }).first().click();
await page.waitForTimeout(3000);
const t = await txt();
const m = t.match(/https?:\/\/[^\s|]+\/invitation\/[A-Za-z0-9_-]+/);
console.log('LIEN2', m ? m[0] : '(aucun)');
console.log('EXTRAIT HAUT :', t.slice(0, 700));
await page.screenshot({ path: `${S}/admin-renvoi.png`, fullPage: true });
// la page est-elle remontée en haut pour montrer le lien neuf ?
console.log('scrollY =', await page.evaluate(() => { const e=[...document.querySelectorAll('div')].find(d=>d.scrollTop>0); return e ? e.scrollTop : window.scrollY; }));
console.log('JOURNAL', journal.join('\n  ') || '(rien)');
await nav.close();
