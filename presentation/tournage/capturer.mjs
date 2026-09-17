/**
 * LES CAPTURES DE LA DÉMONSTRATION.
 *
 * Pilote l'application avec Playwright et pose une image par écran dans
 * `presentation/captures/`. Ce sont elles que `construire.py` embarque dans les
 * slides et que `dossier.py` illustre.
 *
 * POURQUOI UN SCRIPT ET PAS DES CAPTURES À LA MAIN.
 *
 * Les treize images qui vivaient ici jusqu'au 17 septembre 2026 avaient été
 * prises à la main, un jour, sur un état de la base que personne ne savait plus
 * reconstituer. Elles couvraient neuf écrans sur seize, et l'une d'elles était
 * un DOUBLON au nom vide (`captures/.jpg`, md5 identique à `02-seances-liste`),
 * découvert par hasard le 16 septembre. Une image qu'on ne sait pas refaire est
 * une image qu'on n'ose plus remplacer — donc une image qui ment bientôt.
 *
 * CHAQUE CAPTURE EST VÉRIFIÉE AVANT D'ÊTRE ÉCRITE. C'est la leçon de
 * `verifier-ecrans.mjs` : un `goto` réussi ne prouve rien, une page blanche
 * charge très bien, et l'écran de connexion répond 200. Sans le motif
 * `attendu`, on repart avec vingt-cinq photos du formulaire de connexion et on
 * s'en aperçoit en réunion.
 *
 *   DEMO_MDP='…' node presentation/tournage/capturer.mjs
 *
 * Variables : DEMO_URL (défaut http://localhost:8080), DEMO_COMPTE, DEMO_MDP,
 * DEMO_SEANCE, DEMO_MODELE, et DEMO_ADMIN_COMPTE / DEMO_ADMIN_MDP pour les
 * quatre écrans d'administration (sautés sans eux).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SORTIE = path.join(ICI, '..', 'captures');

const ADRESSE = (process.env.DEMO_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const COMPTE = process.env.DEMO_COMPTE ?? 'demo@fitcarnet.local';
const MDP = process.env.DEMO_MDP;
const SEANCE = process.env.DEMO_SEANCE ?? '';
const MODELE = process.env.DEMO_MODELE ?? '';
const ADMIN_COMPTE = process.env.DEMO_ADMIN_COMPTE ?? '';
const ADMIN_MDP = process.env.DEMO_ADMIN_MDP ?? '';

if (!MDP) {
  console.error(
    "capturer : DEMO_MDP n'est pas défini.\n" +
    "  DEMO_MDP='le mot de passe' node presentation/tournage/capturer.mjs\n" +
    "Le mot de passe n'est PAS dans ce fichier, et n'y sera jamais.");
  process.exit(2);
}

/* LE MOTIF QUI RECONNAÎT L'ÉCRAN DE CONNEXION.
   Il sert à refuser une capture prise avant d'être entré. Repris tel quel de
   `verifier-ecrans.mjs`, où « séances » reconnaissait le slogan de l'accueil et
   validait trois écrans qu'on n'avait jamais atteints. */
const CONNEXION = /au même endroit|ADRESSE E-MAIL/i;

const LARGEUR = 1440, HAUTEUR = 900;   // le viewport de tourner.mjs, pour que
                                        // les images et la vidéo se ressemblent

/* Les captures, dans l'ordre de la démonstration (voir presentation/demonstration.md).
   `aller` amène à l'écran, `attendu` dit ce qu'on doit y LIRE, `legende` sert au
   rapport. `admin` marque les écrans qui exigent la seconde session. */
const CAPTURES = [
  { fichier: '01-acces-connexion.jpg', legende: "L'écran de connexion — aucune inscription libre",
    avantConnexion: true, attendu: CONNEXION },

  { fichier: '02-compte.jpg', legende: "L'onglet Compte",
    aller: (p) => p.goto(`${ADRESSE}/(onglets)/compte`), attendu: /se déconnecter|mes ingrédients/i },
  { fichier: '03-objectifs.jpg', legende: 'Une cible par repas — Matin, Midi, 16 h, Soir',
    aller: (p) => p.goto(`${ADRESSE}/objectifs`), attendu: /objectif|protéines|calories/i },
  { fichier: '25-reglages.jpg', legende: 'Les cinq sonneries du minuteur',
    aller: (p) => p.goto(`${ADRESSE}/reglages`), attendu: /sonnerie|réglage/i },

  { fichier: '04-frigo-stock.jpg', legende: 'Le stock, groupé par emplacement, avec les valeurs pour 100 g',
    aller: (p) => p.goto(`${ADRESSE}/(onglets)/frigo`), attendu: /stock|emplacement/i, jeu: 'essai' },
  { fichier: '05-frigo-inventaire.jpg', legende: "L'inventaire en écarts — on ne corrige que ce qui a bougé",
    aller: async (p) => { await p.goto(`${ADRESSE}/(onglets)/frigo`); await clic(p, /Inventaire/); },
    attendu: /vérifi|écart/i, jeu: 'essai' },

  /* LE GARDE-FOU DES VALEURS N'EST PAS SUR L'ÉCRAN REPAS.
     Cette capture y était prise, après un `wheel(0, 320)` de plus — mais la
     page était DÉJÀ EN BAS : le 17 septembre 2026 elle est sortie avec le md5
     exact de `08-repas-cuissons.jpg`. Deux images identiques nommées comme
     deux fonctionnalités différentes, c'est une image qui ment, et c'est
     précisément ce que ce script existe pour empêcher.
     Le contrôle de cohérence vit dans l'éditeur d'aliment — seul appelant de
     `rendementPossible` dans tout le front (`editeurAliment.tsx:15`). On va
     donc l'y chercher, par le chemin de l'utilisateur. */
  { fichier: '14-garde-fou-donnees.jpg',
    legende: "Le contrôle de cohérence permanent des valeurs, dans l'éditeur d'aliment",
    aller: async (p) => {
      await p.goto(`${ADRESSE}/(onglets)/frigo`, { waitUntil: 'networkidle' });
      await p.waitForTimeout(2500);
      if (!await clic(p, /Poulet, filet/i)) throw new Error('aucune ligne de stock a ouvrir');
      if (!await clic(p, /Corriger les valeurs/i)) throw new Error('bouton « Corriger les valeurs » absent');
      await p.waitForTimeout(1500);
    },
    attendu: /pour 100 g|changement de poids/i, jeu: 'essai' },

  { fichier: '06-repas-cibles.jpg', legende: 'Étape Jours — les repas à cuisiner et le nombre de convives',
    aller: (p) => p.goto(`${ADRESSE}/(onglets)/repas`), attendu: /cible|composer|repas/i, jeu: 'demo' },

  { fichier: '17-seances-liste.jpg', legende: 'Neuf semaines de séances : le type, la date, les séries faites',
    aller: (p) => p.goto(`${ADRESSE}/(onglets)/seances`), attendu: /nouvelle séance|volume|push|pull|legs/i,
    jeu: 'demo' },
  { fichier: '18-seance-detail-1rm.jpg', legende: 'Séance en cours : séries, charges, minuteur, 1RM estimé',
    aller: (p) => ouvrirPremier(p, `${ADRESSE}/(onglets)/seances`, SEANCE, 'seance'),
    attendu: /série|rm|répétition/i, jeu: 'demo' },

  { fichier: '15-modeles-liste.jpg', legende: 'Les programmes, patrons des séances',
    aller: (p) => p.goto(`${ADRESSE}/(onglets)/modeles`), attendu: /modèle|séries prescrites|crée-en un/i,
    jeu: 'demo' },
  { fichier: '16-modele-detail.jpg', legende: 'Un programme et ses séries cibles',
    aller: (p) => ouvrirPremier(p, `${ADRESSE}/(onglets)/modeles`, MODELE, 'modele'),
    attendu: /exercice|série/i, jeu: 'demo' },

  { fichier: '21-admin-exercices.jpg', legende: 'Le catalogue commun, côté administration',
    admin: true, aller: (p) => p.goto(`${ADRESSE}/admin-exercices`), attendu: /gestion des exercices|exercice/i },
  { fichier: '22-admin-fusion.jpg', legende: 'Fusionner deux exercices, avec report de l’historique',
    admin: true, aller: (p) => p.goto(`${ADRESSE}/admin-fusion`), attendu: /fusionner/i },
  { fichier: '23-admin-cuissons.jpg', legende: 'Les façons de cuire, qui alimentent les rendements cru/cuit',
    admin: true, aller: (p) => p.goto(`${ADRESSE}/admin-cuissons`), attendu: /façons de cuire|cuisson/i },
  { fichier: '24-admin-utilisateurs.jpg', legende: 'Les comptes et les invitations',
    admin: true, aller: (p) => p.goto(`${ADRESSE}/admin-utilisateurs`), attendu: /inviter quelqu|invitation|compte/i },
];

/* LES CAPTURES QUI DEMANDENT UN PARCOURS, PAS UNE ADRESSE.
   Elles ne sont pas dans la table ci-dessus parce qu'elles n'ont pas d'URL : il
   faut composer un plan, attendre le calcul, puis descendre. Elles sont donc
   prises d'affilée, dans une seule visite de l'onglet Repas. */
const NOMS_DU_PARCOURS_REPAS = [
  '07-repas-compose.jpg', '09-repas-macros.jpg',
  '08-repas-cuissons.jpg', '11-batch-cooking.jpg', '10-repas-courses.jpg',
];

mkdirSync(SORTIE, { recursive: true });

const rapport = [];
const dire = (etat, texte) => { console.log(`  ${etat}  ${texte}`); rapport.push(etat); };

/** Clique le premier élément qui porte ce texte. Rend false s'il n'est pas là. */
async function clic(page, motif, delai = 6000) {
  try {
    const cible = page.getByText(motif).first();
    await cible.waitFor({ state: 'visible', timeout: delai });
    await cible.scrollIntoViewIfNeeded();
    await cible.click();
    await page.waitForTimeout(1200);
    return true;
  } catch { return false; }
}

/** Ouvre l'identifiant donné, ou à défaut la première carte de la liste. */
async function ouvrirPremier(page, liste, identifiant, prefixe) {
  if (identifiant) {
    await page.goto(`${ADRESSE}/${prefixe}/${identifiant}`, { waitUntil: 'networkidle' });
    return;
  }
  await page.goto(liste, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  /* PAR LE LIEN, PAS PAR LE LIBELLÉ. Le 9 septembre 2026, un clic sur le texte
     d'une carte était intercepté par la carte elle-même et expirait. Le href,
     lui, ne bouge pas. */
  const lien = page.locator(`[href^="/${prefixe}/"]`).first();
  await lien.waitFor({ state: 'visible', timeout: 8000 });
  await lien.click();
}

async function prendre(page, fichier, legende) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SORTIE, fichier), type: 'jpeg', quality: 82 });
  dire('✓', `${fichier} — ${legende}`);
}

const navigateur = await chromium.launch({ args: ['--force-device-scale-factor=1'] });
const contexte = await navigateur.newContext({
  viewport: { width: LARGEUR, height: HAUTEUR },
  deviceScaleFactor: 1,
  locale: 'fr-FR',
});
const page = await contexte.newPage();

const erreurs = [];
page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 140)));

/** Se connecte. `type()` et un CLIC, jamais `fill()` ni « Entrée » : React
    Native Web ne pose pas de vrais champs de formulaire, et le 15 septembre 2026
    le premier essai restait sur l'écran de connexion sans la moindre requête
    réseau — donc sans erreur non plus. */
async function connecter(email, motDePasse) {
  await page.goto(ADRESSE, { waitUntil: 'networkidle', timeout: 45000 });
  const champs = page.locator('input');
  await champs.first().waitFor({ timeout: 20000 });
  await champs.nth(0).click();
  await champs.nth(0).type(email, { delay: 20 });
  await champs.nth(1).click();
  await champs.nth(1).type(motDePasse, { delay: 20 });
  await page.getByText(/se connecter/i).first().click();
  await page.waitForTimeout(6000);
  const texte = await page.locator('body').innerText();
  return !CONNEXION.test(texte);
}

let echecs = 0;

try {
  console.log(`\n── ${ADRESSE} ──`);

  /* La capture de l'écran de connexion se prend AVANT de se connecter : après,
     on ne peut plus y revenir sans se déconnecter, et se déconnecter ferait
     reprendre toute la série. */
  const avant = CAPTURES.filter((c) => c.avantConnexion);
  await page.goto(ADRESSE, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);
  for (const c of avant) await prendre(page, c.fichier, c.legende);

  console.log('\n── connexion ──');
  if (!await connecter(COMPTE, MDP)) {
    console.error(`\n✗ La connexion a échoué pour ${COMPTE}.\n` +
      "  Vérifie DEMO_COMPTE et DEMO_MDP, et que le compte est actif.");
    await navigateur.close();
    process.exit(1);
  }
  dire('✓', `connecté : ${COMPTE}`);

  console.log('\n── les écrans ──');
  for (const c of CAPTURES.filter((x) => !x.avantConnexion && !x.admin)) {
    try {
      await c.aller(page);
      await page.waitForTimeout(2500);
      const contenu = await page.locator('body').innerText();

      if (CONNEXION.test(contenu)) { dire('✗', `${c.fichier} : RENVOYÉ À LA CONNEXION`); echecs += 1; continue; }
      if (!c.attendu.test(contenu)) {
        dire('✗', `${c.fichier} : pas l'écran attendu — ${contenu.replace(/\s+/g, ' ').slice(0, 70)}`);
        echecs += 1;
        continue;
      }
      /* LE PIÈGE DU FRIGO VIDE. `jeu-demo.sql` ne pose NI aliments NI stock :
         c'est `jeu-essai.sql`, qu'il exige en prérequis. Charger le seul jeu de
         démonstration, c'est arriver en salle avec un frigo vide — et le frigo
         est le premier tiers de la démonstration. On refuse la capture plutôt
         que de la livrer vide. */
      if (c.jeu === 'essai' && /aucun aliment|frigo est vide|rien en stock/i.test(contenu)) {
        dire('✗', `${c.fichier} : FRIGO VIDE — charge d'abord db/manuel/jeu-essai.sql`);
        echecs += 1;
        continue;
      }
      if (c.jeu === 'demo' && /aucune séance|aucun modèle|aucune cible/i.test(contenu)) {
        dire('✗', `${c.fichier} : PAS D'HISTORIQUE — charge db/manuel/jeu-demo.sql (après jeu-essai.sql)`);
        echecs += 1;
        continue;
      }
      await prendre(page, c.fichier, c.legende);
    } catch (e) {
      dire('✗', `${c.fichier} : ${String(e.message).split('\n')[0].slice(0, 90)}`);
      echecs += 1;
    }
  }

  // ------------------------------------- l'inventaire en tâche de fond (12, 13)
  //
  // LES DEUX SEULES CAPTURES QUI ÉCRIVENT, ET ELLES SONT DONC SUR DEMANDE.
  //
  // Elles montrent l'avant et l'après d'un dépôt d'inventaire — « Tu peux
  // quitter l'écran, ça continue tout seul », puis « Inventaire appliqué ». Ce
  // message ne s'obtient pas en regardant : il faut déposer des corrections, et
  // le stock du compte bouge pour de bon.
  //
  // Deux slides les portent (« L'inventaire part en tâche de fond »), donc les
  // sauter par défaut laisse deux « capture manquante » — c'est assumé : un
  // script de capture qui écrit dans le dos de celui qui le lance est pire.
  // Pour les obtenir : DEMO_ECRIRE=1, et rejouer db/manuel/jeu-essai.sql après.
  console.log("\n── l'inventaire en tâche de fond ──");
  if (process.env.DEMO_ECRIRE !== '1') {
    dire('~', 'sautées : 12 et 13 écrivent en base — relance avec DEMO_ECRIRE=1 si tu les veux');
  } else {
    try {
      await page.goto(`${ADRESSE}/(onglets)/frigo`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      if (!await clic(page, /Inventaire/)) throw new Error("onglet Inventaire introuvable");
      await page.waitForTimeout(2000);

      const champs = page.locator('input');
      // `nth(rang + 1)` : le premier champ de l'écran est la RECHERCHE, pas une
      // ligne de stock. Repris de tourner.mjs, où le décalage est déjà écrit.
      for (const [rang, valeur] of [[0, '480'], [1, '540'], [2, '260']]) {
        const champ = champs.nth(rang + 1);
        await champ.click();
        await champ.fill('');
        await champ.type(valeur, { delay: 40 });
        await page.waitForTimeout(600);
      }
      await page.waitForTimeout(1000);

      if (!await clic(page, /Enregistrer \d+ correction/, 8000)) {
        throw new Error("le bouton « Enregistrer n corrections » n'apparaît pas");
      }
      await page.waitForTimeout(1200);
      await prendre(page, '12-inventaire-envoye.jpg', "« Tu peux quitter l'écran, ça continue tout seul »");

      await page.waitForTimeout(8000);       // le travailleur de fond applique
      await page.goto(`${ADRESSE}/(onglets)/frigo`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      await prendre(page, '13-inventaire-applique.jpg', 'Appliqué : le stock a bougé, sans rien ressaisir');

      dire('~', 'le stock du compte a été modifié — rejoue db/manuel/jeu-essai.sql pour le remettre');
    } catch (e) {
      dire('✗', `inventaire : ${String(e.message).split('\n')[0].slice(0, 90)}`);
      echecs += 2;
    }
  }

  // ------------------------------------------------ le parcours de composition
  console.log('\n── le calculateur (un seul parcours, six images) ──');
  try {
    await page.goto(`${ADRESSE}/(onglets)/repas`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    /* PLUSIEURS JOURS, ET C'EST CE QUI FAIT EXISTER LA LISTE DE COURSES.
       Sur un seul jour, le frigo de démonstration couvre tout : `aAcheter`
       est vide, le panneau « Liste de courses » n'est même pas rendu
       (`etapeBatch.tsx:73`), et la capture 10 sortait avec le md5 EXACT de
       la 11 — deux noms pour une seule image. Trois jours épuisent les plus
       petits stocks et la liste se remplit pour de vrai.
       Ce n'est pas un détour : composer sur plusieurs jours est lui-même une
       fonctionnalité de l'inventaire, et il vaut mieux la montrer. */
    if (await clic(page, /Plusieurs jours/, 8000)) {
      await page.waitForTimeout(1500);   // l'interrupteur ouvre le calendrier

      /* Les cases portent `libelleDuJour` en étiquette d'accessibilité
         (`calendrier.tsx:59`), que react-native-web rend en `aria-label`. On
         reconstruit les mêmes libellés avec la même API que l'écran, plutôt
         que de viser une position dans la grille. */
      const libelleDuJour = (rang) => {
        if (rang === 1) return 'Demain';
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + rang);
        return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit' });
      };

      for (const rang of [1, 2]) {
        const libelle = libelleDuJour(rang);
        try {
          const jour = page.getByLabel(libelle, { exact: true }).first();
          await jour.waitFor({ state: 'visible', timeout: 5000 });
          await jour.click();
          await page.waitForTimeout(800);
        } catch {
          dire('~', `jour « ${libelle} » non cochable — la liste de courses sera peut-être vide`);
        }
      }
      await page.waitForTimeout(1200);
    }

    if (!await clic(page, /Composer les \d+ jours|Composer les repas/)) {
      dire('✗', "aucun bouton « Composer » — les cinq images du calculateur manquent");
      echecs += NOMS_DU_PARCOURS_REPAS.length;
    } else {
      await page.waitForTimeout(7000);          // le solveur travaille
      await prendre(page, '07-repas-compose.jpg', 'Quatre repas composés à partir du frigo');

      await page.mouse.move(720, 400);
      await page.mouse.wheel(0, 320);
      await prendre(page, '09-repas-macros.jpg', "Les macros réelles et l'écart à la cible");

      await page.mouse.wheel(0, 320);
      await prendre(page, '08-repas-cuissons.jpg', 'Les cuissons — et leur troisième état');

      /* LE BOUTON DU BATCH COOKING EST DÉSACTIVÉ TANT QU'UNE CUISSON MANQUE,
         et un bouton désactivé ne dit pas non : il porte un AUTRE libellé.
         Le 17 septembre 2026 il affichait « 18 cuissons à renseigner » et le
         parcours repartait sans 11 ni 10. Ce n'était pas un sélecteur fautif,
         c'était une étape sautée — le script ne décidait aucune cuisson.
         `repas.tsx:407-425` offre le geste unique « Les N autres se mangent
         tels quels », qui ne remplit que les trous sans écraser les choix. */
      if (!await clic(page, /se mangent tels quels|se mange tel quel/i, 8000)) {
        dire('~', 'aucune cuisson a solder — le bouton du batch cooking devrait deja etre actif');
      }
      await page.waitForTimeout(2500);

      if (await clic(page, /Passer au batch cooking/, 8000)) {
        await page.waitForTimeout(4000);
        await prendre(page, '11-batch-cooking.jpg', 'Les fournées (en sec) puis les boîtes (en cuit)');

        /* LA LISTE DE COURSES EST UN PANNEAU REPLIABLE, PAS UN BAS DE PAGE.
           Elle était prise après un `wheel(0, 500)` : le 17 septembre 2026
           `10-repas-courses.jpg` est sorti avec le md5 EXACT de
           `11-batch-cooking.jpg`. Un défilement qui ne défile pas ne lève
           aucune erreur — il rend deux fois la même image, sous deux noms.
           `etapeBatch.tsx:75` la pose dans un `Pliant` fermé : on l'ouvre. */
        if (!await clic(page, /Liste de courses/i, 8000)) {
          dire('✗', "10-repas-courses.jpg : panneau « Liste de courses » introuvable");
          echecs += 1;
        } else {
          await page.waitForTimeout(1200);
          await prendre(page, '10-repas-courses.jpg', 'Ce qui manque part en liste de courses');
        }
      } else {
        dire('✗', "pas de « Passer au batch cooking » — 11 et 10 manquent");
        echecs += 2;
      }
    }
  } catch (e) {
    dire('✗', `calculateur : ${String(e.message).split('\n')[0].slice(0, 90)}`);
    echecs += 1;
  }

  // ------------------------------------------------------- l'administration
  const admins = CAPTURES.filter((c) => c.admin);
  console.log("\n── l'administration ──");
  if (!ADMIN_COMPTE || !ADMIN_MDP) {
    /* ON NE PREND PAS LA CAPTURE PLUTÔT QUE D'EN PRENDRE UNE FAUSSE. Sans
       session administrateur, les quatre routes renvoient sur l'onglet Compte :
       on repartirait avec quatre photos de l'écran Compte nommées
       « admin-… ». Une image qui ment est pire qu'une image absente. */
    dire('~', `sautée : DEMO_ADMIN_COMPTE / DEMO_ADMIN_MDP non fournis (${admins.length} images)`);
  } else {
    /* SE DÉCONNECTER D'ABORD, SANS QUOI IL N'Y A AUCUN FORMULAIRE À REMPLIR.
       `connecter()` attend un champ de saisie sur l'accueil — mais la session
       du compte ordinaire est encore ouverte, donc l'accueil affiche
       l'application. Le 17 septembre 2026 les quatre écrans d'administration
       sont tombés d'un coup sur « Timeout 20000ms exceeded », un message qui
       ne parle ni de session ni de connexion et envoie chercher ailleurs.
       Sur le web, le coffre est `localStorage` (`src/api/session.ts:24`). */
    await contexte.clearCookies();
    await page.goto(ADRESSE, { waitUntil: 'networkidle', timeout: 45000 });
    await page.evaluate(() => {
      try { localStorage.clear(); sessionStorage.clear(); } catch { /* stockage refuse */ }
    });
    await page.waitForTimeout(1500);

    if (!await connecter(ADMIN_COMPTE, ADMIN_MDP)) {
      dire('✗', `connexion administrateur refusée pour ${ADMIN_COMPTE}`);
      echecs += 1;
    } else {
      for (const c of admins) {
        try {
          await c.aller(page);
          await page.waitForTimeout(2500);
          const contenu = await page.locator('body').innerText();
          if (!c.attendu.test(contenu) || /se déconnecter|mes ingrédients/i.test(contenu)) {
            dire('✗', `${c.fichier} : renvoyé sur Compte — ce compte n'est pas administrateur ?`);
            echecs += 1;
            continue;
          }
          await prendre(page, c.fichier, c.legende);
        } catch (e) {
          dire('✗', `${c.fichier} : ${String(e.message).split('\n')[0].slice(0, 90)}`);
          echecs += 1;
        }
      }
    }
  }
} catch (e) {
  dire('✗', `INTERROMPU : ${String(e.message).split('\n')[0].slice(0, 140)}`);
  echecs += 1;
} finally {
  await navigateur.close();
}

const prises = rapport.filter((e) => e === '✓').length;
console.log(`\n${prises} images dans ${path.relative(process.cwd(), SORTIE)}/`);
if (erreurs.length) {
  console.log('\n── erreurs de page ──');
  [...new Set(erreurs)].slice(0, 6).forEach((e) => console.log(`  ✗ ${e}`));
}
if (echecs > 0) {
  console.error(`\n${echecs} capture(s) manquante(s). Les slides afficheront « capture manquante ».`);
}
process.exit(echecs > 0 ? 1 : 0);
