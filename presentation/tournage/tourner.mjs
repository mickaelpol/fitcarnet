/**
 * TOURNAGE DE LA DÉMONSTRATION DE FITCARNET.
 *
 * POURQUOI PLAYWRIGHT ET PAS UN ENREGISTREUR DE GIF.
 *
 * Un enregistreur de GIF capture UNE IMAGE PAR ACTION : douze images pour un
 * parcours entier, soit un diaporama accéléré où l'on ne voit rien. Playwright
 * enregistre un FLUX CONTINU à 25 images par seconde, avec les transitions, les
 * champs qui se remplissent caractère par caractère, et les écrans qui se
 * chargent. C'est la différence entre montrer et prétendre montrer.
 *
 * LE RYTHME EST VOLONTAIREMENT LENT. Cette vidéo se commente en direct devant
 * un client : chaque étape reste à l'écran le temps qu'on en dise une phrase.
 * `pause()` marque les temps ; ne pas les raccourcir pour « gagner du temps »,
 * c'est précisément ce temps qui rend la démonstration suivable.
 *
 * LE CURSEUR EST DESSINÉ. Playwright déplace un pointeur que le navigateur
 * n'affiche pas : sans ce point jaune injecté, le spectateur voit des champs se
 * remplir tout seuls sans comprendre d'où vient l'action.
 *
 * Le mot de passe n'est PAS dans ce fichier : il vient de l'environnement.
 *
 *   DEMO_MDP='…' node presentation/tournage/tourner.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const BRUT = path.join(ICI, 'brut');
const ADRESSE = process.env.DEMO_URL ?? 'http://localhost:8081';
const COMPTE = process.env.DEMO_COMPTE ?? 'demo@fitcarnet.local';
const MDP = process.env.DEMO_MDP;
const SEANCE = process.env.DEMO_SEANCE ?? '21';   // la seance ouverte dans la demonstration

/* LA SESSION EST MEMORISEE APRES LE PREMIER TOURNAGE.
   Le mot de passe n'est demande qu'une fois : ensuite Playwright rouvre la
   session enregistree dans etat.json (ignore par git). Sans cela, chaque
   reprise du scenario obligerait a ressaisir un secret — et on finirait par
   l'ecrire dans le script, ce qu'on ne veut pas. */
const ETAT = path.join(ICI, 'etat.json');
const SESSION_MEMORISEE = existsSync(ETAT);

if (!MDP && !SESSION_MEMORISEE) {
  console.error("Aucune session memorisee et DEMO_MDP n'est pas defini. Pour le premier tournage :\n" +
                "  DEMO_MDP='le mot de passe' node presentation/tournage/tourner.mjs");
  process.exit(1);
}

rmSync(BRUT, { recursive: true, force: true });
mkdirSync(BRUT, { recursive: true });

const LARGEUR = 1440, HAUTEUR = 900;

/** Un temps mort, pour laisser le commentateur parler. */
const pause = (page, secondes) => page.waitForTimeout(secondes * 1000);

/**
 * Le curseur visible. Un rond ambre qui suit la souris et pulse au clic —
 * même code couleur que l'application, pour qu'il ne détonne pas.
 */
const CURSEUR = `
  (() => {
    if (document.getElementById('__curseur')) return;
    const c = document.createElement('div');
    c.id = '__curseur';
    c.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;' +
      'border-radius:50%;background:rgba(232,184,75,.35);border:2px solid #e8b84b;pointer-events:none;' +
      'transition:transform .08s ease-out;left:-100px;top:-100px';
    document.body.appendChild(c);
    addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { c.style.transform = 'scale(1.9)'; c.style.background = 'rgba(232,184,75,.6)'; }, true);
    addEventListener('mouseup',   () => { c.style.transform = 'scale(1)';   c.style.background = 'rgba(232,184,75,.35)'; }, true);
  })();
`;

/**
 * Les etapes, avec l'instant ou chacune commence.
 *
 * CES INSTANTS SERVENT AU CHAPITRAGE. Les deviner en regardant la video image
 * par image serait long et faux : le tournage sait exactement quand il passe
 * d'une sequence a l'autre, autant qu'il le dise. `decoupe.json` est relu par
 * le montage pour placer les cartons et les chapitres.
 */
const journal = [];
const reperes = [];
const depart = Date.now();
const seconde = () => (Date.now() - depart) / 1000;

async function etape(nom, travail) {
  const debut = seconde();
  try {
    await travail();
    journal.push(`  ✓ ${nom}`);
    reperes.push({ nom, debut, fin: seconde() });
  } catch (e) {
    journal.push(`  ✗ ${nom} — ${String(e.message).split('\n')[0].slice(0, 90)}`);
  }
}

/**
 * Va sur un onglet en cliquant SON LIEN, pas son libelle.
 *
 * Le 9 septembre 2026, deux sequences sur neuf ont ete perdues ainsi :
 * `getByText('Seances')` expirait apres un defilement, le libelle n'etant plus
 * atteignable. Le href, lui, ne bouge pas. On remonte d'abord en haut de page,
 * sinon le clic part sur une barre encore en train de se replacer.
 */
async function onglet(page, chemin) {
  await page.mouse.move(720, 400);
  await page.mouse.wheel(0, -3000);
  await page.waitForTimeout(700);
  const lien = page.locator(`[href="${chemin}"]`).first();
  await lien.waitFor({ state: 'visible', timeout: 8000 });
  await lien.hover();
  await page.waitForTimeout(450);
  await lien.click();
}

/** Clique sur le premier élément qui porte ce texte, en le montrant d'abord. */
async function cliquer(page, texte, { exact = false, index = 0 } = {}) {
  const cible = page.getByText(texte, { exact }).nth(index);
  await cible.waitFor({ state: 'visible', timeout: 8000 });
  await cible.scrollIntoViewIfNeeded();
  await cible.hover();
  await page.waitForTimeout(450);        // le curseur arrive avant le clic
  await cible.click();
}

const navigateur = await chromium.launch({ args: ['--force-device-scale-factor=1'] });
const contexte = await navigateur.newContext({
  ...(SESSION_MEMORISEE && !MDP ? { storageState: ETAT } : {}),
  viewport: { width: LARGEUR, height: HAUTEUR },
  deviceScaleFactor: 1,
  locale: 'fr-FR',
  recordVideo: { dir: BRUT, size: { width: LARGEUR, height: HAUTEUR } },
});
contexte.addInitScript(CURSEUR);
const page = await contexte.newPage();
// Une frappe humaine : 60 ms par caractère. À 0, les champs se remplissent
// d'un coup et on ne voit pas la saisie.
const taper = (champ, texte) => champ.pressSequentially(texte, { delay: 60 });

// ---------------------------------------------------------------- connexion
await etape(MDP ? 'connexion' : 'ouverture (session memorisee)', async () => {
  await page.goto(ADRESSE, { waitUntil: 'networkidle' });
  if (!MDP) { await page.waitForTimeout(4000); return; }
  await pause(page, 2);
  const champs = page.locator('input');
  await champs.nth(0).click();
  await taper(champs.nth(0), COMPTE);
  await pause(page, 0.6);
  await champs.nth(1).click();
  await taper(champs.nth(1), MDP);
  await pause(page, 0.8);
  await cliquer(page, 'Se connecter');
  await page.waitForTimeout(4000);
});

// ------------------------------------------------------- 1. le stock du frigo
await etape('frigo — le stock', async () => {
  await onglet(page, '/frigo');
  await pause(page, 2.5);
  await page.mouse.move(720, 400);
  await page.mouse.wheel(0, 320);        // on parcourt les emplacements
  await pause(page, 2);
  await page.mouse.wheel(0, 320);
  await pause(page, 2);
  await page.mouse.wheel(0, -640);
  await pause(page, 1.5);
  await cliquer(page, 'Blanc de poulet');  // le détail : valeurs et rendement
  await pause(page, 4);
  await page.keyboard.press('Escape').catch(() => {});
  await pause(page, 1);
});

// ---------------------------------------------------------- 2. l'inventaire
await etape('frigo — inventaire', async () => {
  await cliquer(page, 'Inventaire');
  await pause(page, 2.5);
  const cases = page.locator('input');
  // trois écarts, pas un : un inventaire réel en corrige plusieurs
  for (const [rang, valeur] of [[0, '480'], [1, '540'], [2, '260']]) {
    const champ = cases.nth(rang + 1);
    await champ.click();
    await champ.fill('');
    await taper(champ, valeur);
    await pause(page, 1.2);
  }
  await pause(page, 1.5);
  await cliquer(page, /Enregistrer \d+ correction/);
  await pause(page, 6);                  // le lot part et s'applique
});

// -------------------------------------------------- 3. les cibles par repas
await etape('repas — les cibles', async () => {
  await onglet(page, '/repas');
  await pause(page, 3);
  await cliquer(page, 'Midi');           // déplier un repas pour voir sa cible
  await pause(page, 4);
  await cliquer(page, 'Midi');
  await pause(page, 1.5);
});

// ------------------------------------------------------- 4. le calculateur
await etape('repas — composer', async () => {
  await cliquer(page, 'Composer les repas');
  await pause(page, 6);
  await page.mouse.move(720, 400);
  await page.mouse.wheel(0, 300);
  await pause(page, 3);
  // les avertissements de qualité de données, s'ils sont levés
  await cliquer(page, /se mangent tels quels/).catch(() => {});
  await pause(page, 4);
  await page.mouse.wheel(0, 320);
  await pause(page, 3.5);
  await page.mouse.wheel(0, 320);
  await pause(page, 3.5);
});

await etape('repas — batch cooking', async () => {
  await cliquer(page, /Passer au batch cooking/);
  await pause(page, 5);
  await page.mouse.wheel(0, 300);
  await pause(page, 3.5);
  await page.mouse.wheel(0, 300);
  await pause(page, 3.5);
});

// ---------------------------------------------------------- 5. les séances
await etape('séances — la liste', async () => {
  await onglet(page, '/seances');
  await pause(page, 3);
  await page.mouse.move(720, 400);
  await page.mouse.wheel(0, 300);
  await pause(page, 2.5);
  await page.mouse.wheel(0, -300);
  await pause(page, 1.5);
});

await etape('séances — le détail, la saisie et le 1RM', async () => {
  /* ON Y VA PAR L'URL, PAS PAR LE CLIC.
     Le 9 septembre, `getByText('Push').click()` expirait : l'element est trouve
     mais le clic est intercepte par la carte qui le porte. La liste vient d'etre
     montree juste avant, on ne perd donc rien a entrer directement. */
  await page.goto(`${ADRESSE}/seance/${SEANCE}`, { waitUntil: 'networkidle' });
  await pause(page, 5);                  // le 1RM estime et la seance precedente
  /* LA SAISIE D'UNE SERIE. C'est le geste que fait l'utilisateur entre deux
     exercices, et il ne se devine pas devant un tableau deja rempli. */
  const champs = page.locator('input');
  if (await champs.count() >= 2) {
    for (const [rang, valeur] of [[0, '9'], [1, '52.5']]) {
      const champ = champs.nth(rang);
      await champ.click();
      await champ.fill('');
      await taper(champ, valeur);
      await pause(page, 1.4);
    }
  }
  await pause(page, 3);                  // le 1RM se recalcule sous les yeux
  await page.mouse.move(720, 400);
  await page.mouse.wheel(0, 320);
  await pause(page, 3.5);
  await page.mouse.wheel(0, 320);
  await pause(page, 3);
  await page.mouse.wheel(0, -640);
  await pause(page, 2);
});

// --------------------------------------------------------- 6. les programmes
await etape('modèles — les programmes', async () => {
  await page.goto(`${ADRESSE}/seances`, { waitUntil: 'networkidle' });
  await pause(page, 1.5);
  await onglet(page, '/modeles');
  await pause(page, 3);
  await cliquer(page, /Haut du corps/, { index: 0 });
  await pause(page, 5);
  await page.mouse.move(720, 400);
  await page.mouse.wheel(0, 300);
  await pause(page, 3);
});

await pause(page, 2);
await contexte.storageState({ path: ETAT });   // pour les tournages suivants
await page.close();
await contexte.close();
await navigateur.close();

writeFileSync(path.join(ICI, 'decoupe.json'), JSON.stringify(reperes, null, 2), 'utf-8');
console.log(journal.join('\n'));
console.log('\nrepères :');
for (const r of reperes) console.log(`  ${r.debut.toFixed(1).padStart(6)} s → ${r.nom}`);
console.log(`\nvidéo brute dans ${path.relative(process.cwd(), BRUT)}/`);
