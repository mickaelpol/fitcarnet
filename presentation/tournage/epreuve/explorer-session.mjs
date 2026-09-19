import { lancerNavigateur, ADRESSE, surveiller, LARGEUR, HAUTEUR } from './commun.mjs';
const [email, mdp] = process.argv.slice(2);
const nav = await lancerNavigateur();
const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
const page = await ctx.newPage();
const journal = []; surveiller(page, journal);

await page.goto(`${ADRESSE}/connexion`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// bouton éteint tant qu'un champ est vide : on regarde si un clic déclenche un appel réseau
let appels = 0;
page.on('request', (r) => { if (r.url().includes('/api/connexion')) appels++; });
await page.getByText('Se connecter', { exact: true }).click({ force: true });
await page.waitForTimeout(800);
console.log('CLIC A VIDE — appels /api/connexion :', appels);

const inputs = page.locator('input');
await inputs.nth(0).fill(email);
await inputs.nth(1).fill(mdp);
await page.keyboard.press('Enter');
await page.waitForURL(/seances/, { timeout: 15000 });
await page.waitForTimeout(1500);

const cache = await page.evaluate(() => localStorage.getItem('fitcarnet-cache-v1') ?? '');
console.log('cache contient motDePasse ?', cache.includes('motDePasse'));
console.log('cache contient le mdp en clair ?', cache.includes(process.argv?.[3] ?? 'Poireau3Tiede!'));
console.log('cache contient un JWT ?', /eyJ0eXAiOiJKV1Q/.test(cache));
console.log('cles localStorage', await page.evaluate(() => Object.keys(localStorage).join(', ')));

// RECHARGEMENT : le JWT ne vit qu'en mémoire, le cookie doit relancer la session
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
console.log('APRES RECHARGEMENT — url =', page.url());
console.log('TEXTE', (await page.evaluate(() => document.body.innerText)).slice(0, 160).replace(/\n+/g, ' | '));

// PORTIER : adresse tapée à la main dans un contexte neuf
const ctx2 = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
const p2 = await ctx2.newPage();
const j2 = []; surveiller(p2, j2);
await p2.goto(`${ADRESSE}/(onglets)/frigo`, { waitUntil: 'networkidle' });
await p2.waitForTimeout(2500);
console.log('PORTIER sans session — url =', p2.url(), '|', (await p2.evaluate(() => document.body.innerText)).slice(0, 90).replace(/\n+/g, ' | '));

console.log('JOURNAL', journal.length ? journal.join('\n  ') : '(rien)');
await nav.close();
