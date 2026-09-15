/**
 * VÉRIFIER QUE LES ÉCRANS S'AFFICHENT VRAIMENT.
 *
 * Le 15 septembre 2026, 751 tests étaient au vert et personne ne savait si
 * l'application s'affichait. jsdom montait le bundle sans une erreur mais
 * s'arrêtait sur l'écran de chargement, derrière le portier de
 * `app/_layout.tsx` (`!polices || !pret`). Il fallait un vrai navigateur.
 *
 * Ce script en pilote un — le même Playwright que `tourner.mjs`, déjà là pour
 * la démonstration. Il se connecte, visite chaque écran, et RAPPORTE :
 *   - ce qui s'affiche réellement (un titre attendu, pas « la page a chargé ») ;
 *   - toute erreur de console et toute requête en échec ;
 *   - une capture par écran, pour regarder de ses yeux.
 *
 * IL NE MODIFIE RIEN. Le compte de test se crée et se supprime en SQL, hors de
 * ce script — voir la skill `donnees-de-test`.
 *
 * Usage :  node verifier-ecrans.mjs <email> <motDePasse>
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const ADRESSE = process.env.ADRESSE ?? 'http://localhost:8080';
const [email, motDePasse] = process.argv.slice(2);

if (!email || !motDePasse) {
  console.error('Usage : node verifier-ecrans.mjs <email> <motDePasse>');
  process.exit(2);
}

/* Ce qu'on doit LIRE sur chaque écran. Un `load` réussi ne prouve rien : une
   page blanche charge très bien. On cherche donc un texte que seul cet écran
   affiche. */
/* LE MOTIF NE DOIT PAS POUVOIR MATCHER L'ÉCRAN DE CONNEXION.
   Premier essai : « séances » reconnaissait le slogan « Tes séances et tes
   repas, au même endroit » — trois écrans sur cinq passaient au vert alors
   qu'aucun n'était atteint. Un test qui se satisfait de la page de connexion
   ne teste rien. D'où le refus explicite ci-dessous. */
const CONNEXION = /au même endroit|ADRESSE E-MAIL/i;

const ECRANS = [
  { chemin: '/(onglets)/repas', nom: 'repas', attendu: /cible|composer|portion/i },
  { chemin: '/(onglets)/frigo', nom: 'frigo', attendu: /stock|inventaire|emplacement/i },
  { chemin: '/(onglets)/seances', nom: 'seances', attendu: /nouvelle séance|aucune séance|volume/i },
  /* PAS `/modèle/i` : la BARRE D'ONGLETS porte « Modèles » sur les cinq
     écrans, donc ce motif-là était vrai partout, y compris sur une page vide.
     Cet écran ne pouvait pas être rapporté cassé. Même piège que le slogan de
     connexion, une ligne plus bas, resté ouvert pour ce cas — relevé par la
     revue le 15 septembre 2026. On exige donc une phrase que seul le contenu
     de l'écran affiche. */
  { chemin: '/(onglets)/modeles', nom: 'modeles',
    attendu: /aucun modèle|crée-en un|séries prescrites/i },
  /* « Se déconnecter », et non « Déconnexion » : le premier motif écrit ici ne
     correspondait à rien et faisait passer l'écran pour cassé. Un motif faux
     use la confiance dans le rapport aussi sûrement qu'un vrai défaut. */
  { chemin: '/(onglets)/compte', nom: 'compte', attendu: /se déconnecter|mes ingrédients/i },
];

const SORTIE = 'captures-verification';
mkdirSync(SORTIE, { recursive: true });

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
const page = await contexte.newPage();

const erreurs = [];
const requetesEnEchec = [];
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => erreurs.push(`PAGEERROR ${e.message.slice(0, 160)}`));
page.on('requestfailed', (r) => requetesEnEchec.push(`${r.method()} ${r.url().slice(0, 90)}`));
page.on('response', (r) => {
  if (r.status() >= 400) requetesEnEchec.push(`${r.status()} ${r.url().slice(0, 90)}`);
});

const dire = (etat, texte) => console.log(`  ${etat}  ${texte}`);
let echecs = 0;

try {
  console.log('\n── connexion ──');
  await page.goto(ADRESSE, { waitUntil: 'networkidle', timeout: 45000 });
  await page.screenshot({ path: `${SORTIE}/00-accueil.png` });

  /* On tape dans les champs plutôt que d'injecter un jeton : c'est le chemin
     de l'utilisateur, et c'est lui qu'on veut éprouver. */
  const champs = page.locator('input');
  await champs.first().waitFor({ timeout: 20000 });

  /* `type()` et non `fill()`, et un CLIC et non « Entrée ».
     React Native Web ne pose pas de vrais champs de formulaire : « Entrée » ne
     soumet rien, et `fill()` écrit la valeur sans que React la voie toujours.
     Constaté le 15 septembre 2026 : le premier essai restait sur l'écran de
     connexion, sans la moindre requête réseau — donc sans erreur non plus. */
  await champs.nth(0).click();
  await champs.nth(0).type(email, { delay: 20 });
  await champs.nth(1).click();
  await champs.nth(1).type(motDePasse, { delay: 20 });

  const bouton = page.getByText(/se connecter/i).first();
  await bouton.click();

  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${SORTIE}/01-apres-connexion.png` });

  const texte = (await page.locator('body').innerText()).slice(0, 400);
  /* LE SEUL CRITÈRE HONNÊTE : A-T-ON QUITTÉ L'ÉCRAN DE CONNEXION ?
     Ici vivait `!/mot de passe/i.test(texte) || texte.length > 200`. Le `||`
     rendait le contrôle inopérant : avec un MAUVAIS mot de passe on reste sur
     l'écran de connexion, dont le texte dépasse allègrement 200 caractères —
     donc « ✓ connecté ». La constante `CONNEXION`, définie soixante lignes
     plus haut pour exactement cette question, n'était pas utilisée.
     Relevé par la revue le 15 septembre 2026. */
  const connecte = !CONNEXION.test(texte);
  dire(connecte ? '✓' : '✗', `après connexion : ${texte.replace(/\s+/g, ' ').slice(0, 90)}`);
  if (!connecte) echecs += 1;

  console.log('\n── les écrans ──');
  for (const e of ECRANS) {
    await page.goto(`${ADRESSE}${e.chemin}`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SORTIE}/${e.nom}.png`, fullPage: true });

    const contenu = await page.locator('body').innerText();
    /* 120 ET NON 40 : la barre d'onglets seule (« Séances · Modèles · Repas ·
       Mon frigo · Compte ») pèse une quarantaine de caractères, plus le titre
       d'en-tête. Le seuil de 40 était donc inatteignable, et la branche
       « ÉCRAN VIDE » n'a jamais pu se déclencher. Elle ne change pas le verdict
       — `attendu` refuse déjà une page vide — mais elle en donne la RAISON,
       et un rapport qui dit « écran vide » vaut mieux qu'un « pas ce qu'on
       attendait ». Relevé par la revue le 15 septembre 2026. */
    const vide = contenu.trim().length < 120;
    const reconnu = e.attendu.test(contenu);

    if (CONNEXION.test(contenu)) { dire('✗', `${e.nom} : RENVOYÉ À LA CONNEXION`); echecs += 1; }
    else if (vide) { dire('✗', `${e.nom} : ÉCRAN VIDE`); echecs += 1; }
    else if (!reconnu) { dire('~', `${e.nom} : affiche quelque chose, mais pas ce qu'on attendait`); echecs += 1; }
    else dire('✓', `${e.nom} : ${contenu.replace(/\s+/g, ' ').slice(0, 70)}`);
  }
  /* ---------------------------------------------------- le portier d'administration
     UN LIEN CACHÉ NE PROTÈGE RIEN : sur le web, on TAPE l'adresse. C'est
     précisément ce que jsdom et les tests unitaires ne peuvent pas éprouver —
     il faut un vrai navigateur, une vraie navigation, un vrai `/moi`.
     Avant le portier du 15 septembre 2026, `admin-utilisateurs` montait ses
     hooks AVANT son garde et tirait `/api/invitations` et `/api/comptes` : deux
     403, relancés deux fois chacun. Le compte utilisé ici est ROLE_USER, donc
     tout 403 remonté plus bas est un portier qui a laissé passer. */
  console.log('\n── le portier d’administration (compte ROLE_USER) ──');
  const ADMIN = ['/admin-exercices', '/admin-fusion', '/admin-cuissons', '/admin-utilisateurs'];

  for (const chemin of ADMIN) {
    await page.goto(`${ADRESSE}${chemin}`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SORTIE}/portier${chemin.replace(/\//g, '-')}.png` });

    const contenu = await page.locator('body').innerText();
    /* Ce que SEUL l'écran d'administration affiche. On ne se contente pas de
       « la page a changé » : elle pourrait afficher l'écran interdit ET
       rediriger une seconde plus tard. */
    const contenuAdmin = /inviter quelqu|fusionner|façons de cuire|gestion des exercices/i;
    const laisseVoir = contenuAdmin.test(contenu);

    /* ET ON EXIGE D'ÊTRE ARRIVÉ QUELQUE PART, pas seulement de n'avoir pas vu
       l'écran interdit. Sans cette seconde moitié, un chargement infini, une
       page blanche ou une frontière d'erreur passaient tous pour « ✓ refusé »
       — le portier aurait pu être cassé au point de ne plus rien afficher, le
       script aurait dit que tout allait bien. Le comportement voulu est une
       redirection vers l'onglet Compte : c'est lui qu'on vérifie.
       Relevé par la revue le 15 septembre 2026. */
    const arriveSurCompte = /se déconnecter|mes ingrédients/i.test(contenu);

    if (laisseVoir) { dire('✗', `${chemin} : L'ÉCRAN D'ADMINISTRATION EST VISIBLE`); echecs += 1; }
    else if (!arriveSurCompte) {
      dire('✗', `${chemin} : n'affiche pas l'admin, mais n'arrive pas sur Compte non plus`
        + ` — ${contenu.replace(/\s+/g, ' ').slice(0, 60)}`);
      echecs += 1;
    } else dire('✓', `${chemin} : renvoyé sur Compte`);
  }
} catch (e) {
  dire('✗', `INTERROMPU : ${e.message.slice(0, 160)}`);
  echecs += 1;
  await page.screenshot({ path: `${SORTIE}/erreur.png` }).catch(() => {});
} finally {
  await navigateur.close();
}

console.log('\n── erreurs de console ──');
const uniques = [...new Set(erreurs)];
if (uniques.length === 0) console.log('  aucune');
else uniques.slice(0, 12).forEach((e) => console.log(`  ✗ ${e}`));

console.log('\n── requêtes en échec ──');
const req = [...new Set(requetesEnEchec)];
if (req.length === 0) console.log('  aucune');
else req.slice(0, 12).forEach((r) => console.log(`  ✗ ${r}`));

console.log(`\ncaptures dans ${SORTIE}/`);
process.exit(echecs > 0 || uniques.length > 0 ? 1 : 0);
