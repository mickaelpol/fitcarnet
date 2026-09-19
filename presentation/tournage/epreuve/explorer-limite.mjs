import { lancerNavigateur, ADRESSE, surveiller, LARGEUR, HAUTEUR } from './commun.mjs';
const nav = await lancerNavigateur();
const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
const page = await ctx.newPage();
const journal = []; surveiller(page, journal);
const S = '/tmp/claude-1000/-home-micka-perso-fitcarnet/63b81794-0521-411a-932e-699fb6e29bc0/scratchpad';
const msg = async () => await page.evaluate(() => {
  const t = document.body.innerText;
  const l = t.split('\n').map(s => s.trim()).filter(Boolean);
  return l.filter(s => /identifiant|tentative|incorrect|invalide|d.sactiv/i.test(s)).join(' // ') || '(aucun message)';
});
await page.goto(`${ADRESSE}/connexion`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const c = page.locator('input');
for (let i = 1; i <= 7; i++) {
  await c.nth(0).fill('ux-limite2-verif@test.local');
  await c.nth(1).fill('fauxfauxfaux');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1400);
  console.log(`essai ${i} : ${await msg()}`);
}
await page.screenshot({ path: `${S}/connexion-limite.png` });
// et un compte désactivé ?
console.log('JOURNAL', journal.slice(-4).join('\n  '));
await nav.close();
