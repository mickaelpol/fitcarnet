import { lancerNavigateur, ADRESSE, surveiller, LARGEUR, HAUTEUR } from './commun.mjs';

const [email, mdp] = process.argv.slice(2);
const nav = await lancerNavigateur();
const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
const page = await ctx.newPage();
const journal = [];
surveiller(page, journal);

await page.goto(`${ADRESSE}/connexion`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 1. Les champs, tels que le DOM les expose (autofill des gestionnaires de mdp)
const champs = await page.evaluate(() => [...document.querySelectorAll('input')].map((i) => ({
  type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
  autocomplete: i.getAttribute('autocomplete'),
  ariaLabel: i.getAttribute('aria-label'),
  inForm: !!i.closest('form'),
})));
console.log('CHAMPS', JSON.stringify(champs, null, 1));

console.log('ETIQUETTES', JSON.stringify(await page.evaluate(() =>
  [...document.querySelectorAll('div,span')].map(e => e.childElementCount === 0 ? e.textContent : '').filter(t => t && t.length < 80))));

// 2. Bouton éteint tant qu'un champ est vide
const bouton = page.getByText('Se connecter', { exact: true });
console.log('BOUTON visible', await bouton.count());

// 3. Entrée depuis l'adresse : donne la main au mot de passe, ne valide pas
const inputs = page.locator('input');
await inputs.nth(0).click();
await inputs.nth(0).type(email, { delay: 30 });
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
console.log('APRES ENTREE DEPUIS ADRESSE — focus type =', await page.evaluate(() => document.activeElement?.type), '| url =', page.url());

// 4. Entrée depuis le mot de passe : connecte
await page.keyboard.type(mdp, { delay: 30 });
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(3000);
console.log('APRES ENTREE DEPUIS MDP — url =', page.url());
console.log('TEXTE', (await page.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n+/g, ' | '));

// 5. Où vit la session, sur le web
console.log('localStorage', await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage).map(([k,v]) => [k, String(v).slice(0,60)])))));
console.log('cookies', JSON.stringify((await ctx.cookies()).map(c => ({ name: c.name, httpOnly: c.httpOnly, sameSite: c.sameSite, path: c.path, secure: c.secure }))));

console.log('JOURNAL', journal.length ? journal.join('\n  ') : '(rien)');
await nav.close();
