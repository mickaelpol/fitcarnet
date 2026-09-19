/**
 * OUTILLAGE COMMUN DES ÉPREUVES « point de vue utilisateur » (19 septembre 2026).
 *
 * Extrait de `tourner.mjs` plutôt que recopié : le curseur ambre, la frappe
 * lente et les temps morts servent à trois scénarios différents, et une
 * quatrième copie divergerait le jour où l'on change la couleur.
 *
 * Ce module NE MODIFIE PAS l'application. Il pilote un navigateur.
 */
import { chromium } from 'playwright';
import { mkdirSync, renameSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const ADRESSE = process.env.ADRESSE ?? 'http://192.168.1.118:8080';
export const LARGEUR = 1440, HAUTEUR = 900;

/* POSE DIFFEREE : `addInitScript` s'execute AVANT que <body> existe, et
   `document.body.appendChild` levait alors « Cannot read properties of null ».
   L'erreur etait la MIENNE, pas celle de l'application — exactement le genre
   de bruit qui fait rapporter un faux defaut. */
export const CURSEUR = `
  (() => {
    const poser = () => {
    if (!document.body || document.getElementById('__curseur')) return;
    const c = document.createElement('div');
    c.id = '__curseur';
    c.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;' +
      'border-radius:50%;background:rgba(232,184,75,.35);border:2px solid #e8b84b;pointer-events:none;' +
      'transition:transform .08s ease-out;left:-100px;top:-100px';
    document.body.appendChild(c);
    addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { c.style.transform = 'scale(1.9)'; c.style.background = 'rgba(232,184,75,.6)'; }, true);
    addEventListener('mouseup',   () => { c.style.transform = 'scale(1)';   c.style.background = 'rgba(232,184,75,.35)'; }, true);
    };
    if (document.readyState === 'loading') addEventListener('DOMContentLoaded', poser);
    else poser();
  })();
`;

export const pause = (page, s) => page.waitForTimeout(s * 1000);

/** Un contexte par scénario : la vidéo est écrite à la FERMETURE du contexte. */
export async function ouvrir(navigateur, dossierVideo) {
  mkdirSync(dossierVideo, { recursive: true });
  const ctx = await navigateur.newContext({
    viewport: { width: LARGEUR, height: HAUTEUR },
    recordVideo: { dir: dossierVideo, size: { width: LARGEUR, height: HAUTEUR } },
  });
  await ctx.addInitScript(CURSEUR);
  return ctx;
}

/** Ferme le contexte et renomme la vidéo (Playwright lui donne un nom aléatoire). */
export async function fermerEtRanger(ctx, dossierVideo, nomFinal) {
  const pages = ctx.pages();
  const video = pages[0]?.video();
  await ctx.close();
  if (!video) return null;
  const brut = await video.path();
  const cible = path.join(dossierVideo, nomFinal);
  renameSync(brut, cible);
  return cible;
}

export async function lancerNavigateur() {
  return chromium.launch({ args: ['--no-sandbox'] });
}

/** Clique au centre d'un élément en faisant bouger le curseur (pour la vidéo). */
export async function cliquer(page, loc) {
  const b = await loc.boundingBox();
  if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
  await loc.click();
}

export async function taper(page, loc, texte) {
  await cliquer(page, loc);
  await loc.type(texte, { delay: 60 });
}

/** Relève les erreurs de console et les requêtes en échec. */
export function surveiller(page, journal) {
  page.on('console', (m) => { if (m.type() === 'error') journal.push(`CONSOLE ${m.text()}`); });
  page.on('pageerror', (e) => journal.push(`PAGEERROR ${e.message}`));
  page.on('requestfailed', (r) => journal.push(`REQFAIL ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) journal.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`); });
}
