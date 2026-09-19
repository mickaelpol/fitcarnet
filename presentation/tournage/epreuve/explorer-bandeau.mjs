import { lancerNavigateur, ADRESSE, surveiller, LARGEUR, HAUTEUR } from './commun.mjs';
const [email, mdp] = process.argv.slice(2);
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
await page.waitForTimeout(2000);

const bandeau = 'Ton mot de passe ne suit plus les règles — le changer ›';
for (const [nom, chemin] of [['seances','/(onglets)/seances'],['repas','/(onglets)/repas'],['frigo','/(onglets)/frigo'],['modeles','/(onglets)/modeles'],['compte','/(onglets)/compte']]) {
  await page.goto(`${ADRESSE}${chemin}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const t = await txt();
  console.log(`${nom.padEnd(9)} bandeau=${t.includes(bandeau)}`);
}
await page.screenshot({ path: `${S}/bandeau-compte.png` });
await page.goto(`${ADRESSE}/(onglets)/seances`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);
await page.screenshot({ path: `${S}/bandeau-seances.png` });

// contraste réel du bandeau
console.log('STYLE', JSON.stringify(await page.evaluate((b) => {
  const e = [...document.querySelectorAll('div')].find(d => d.childElementCount === 0 && d.textContent === b);
  if (!e) return null;
  const p = e.parentElement; const cs = getComputedStyle(e); const cp = getComputedStyle(p);
  const r = p.getBoundingClientRect();
  return { couleurTexte: cs.color, fondParent: cp.backgroundColor, haut: r.y, hauteur: r.height, largeur: r.width };
}, bandeau)));

// le bandeau mène-t-il quelque part ?
await page.getByText(bandeau, { exact: true }).click();
await page.waitForTimeout(2500);
console.log('APRES CLIC SUR LE BANDEAU — url =', page.url());
const t2 = await txt();
console.log('bandeau encore là sur l\'écran de changement ?', t2.includes(bandeau));
console.log('EXTRAIT', t2.slice(0, 200));
await page.screenshot({ path: `${S}/bandeau-vers-mdp.png` });
console.log('JOURNAL', journal.join('\n  ') || '(rien)');
await nav.close();
