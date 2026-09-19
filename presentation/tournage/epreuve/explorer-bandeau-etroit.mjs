import { lancerNavigateur, ADRESSE } from './commun.mjs';
const [email, mdp] = process.argv.slice(2);
const nav = await lancerNavigateur();
for (const L of [430, 412, 393, 360, 320]) {
  const ctx = await nav.newContext({ viewport: { width: L, height: 800 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${ADRESSE}/connexion`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const inp = page.locator('input');
  await inp.nth(0).fill(email); await inp.nth(1).fill(mdp);
  await page.keyboard.press('Enter');
  await page.waitForURL(/seances/, { timeout: 20000 });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => {
    const e = [...document.querySelectorAll('div')].find(d => d.childElementCount === 0 && /ne suit plus les r/.test(d.textContent));
    if (!e) return null;
    return { rendu: e.clientWidth, voulu: e.scrollWidth, tronque: e.scrollWidth > e.clientWidth + 1 };
  });
  console.log(`${String(L).padStart(4)} px  ${JSON.stringify(r)}`);
  if (L === 320) await page.screenshot({ path: '/tmp/claude-1000/-home-micka-perso-fitcarnet/63b81794-0521-411a-932e-699fb6e29bc0/scratchpad/bandeau-320.png', clip: { x: 0, y: 0, width: L, height: 70 } });
  await ctx.close();
}
await nav.close();
