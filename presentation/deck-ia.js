/**
 * Deck « Construire fitcarnet avec l'IA » — dix diapositives, en .pptx natif.
 *
 * Reprend le deck monté dans Lovable le 21 septembre 2026, à la charte de
 * l'application (`front/src/theme/index.ts`) : fond sombre, doré en accent,
 * Barlow Condensed pour les titres et les chiffres, Inter pour le texte.
 *
 * Les chiffres ont été MESURÉS le 21 septembre 2026 sur `serveur-autoritaire` :
 * 756 + 46 tests front, 498 tests API, 6 épreuves E2E, 341 commits. Les
 * remesurer avant de présenter — ils bougent.
 *
 * Dépendances, volontairement hors du dépôt (rien à voir avec l'application) :
 *     npm install pptxgenjs lucide-static sharp      # dans un dossier à part
 *     NODE_PATH=<ce dossier>/node_modules node presentation/deck-ia.js
 *
 * Les deux polices doivent être installées sur le poste qui PROJETTE, sans
 * quoi PowerPoint les remplace et les titres débordent.
 */
const path = require('path');
const fs = require('fs');
const pptxgen = require('pptxgenjs');
const sharp = require('sharp');

const SORTIE = process.argv[2] || path.join(__dirname, 'fitcarnet-construire-avec-ia.pptx');

// La charte — mêmes valeurs que `C` dans front/src/theme/index.ts.
const C = {
  fond: '14161A', surface: '1D2026', surface2: '23272E', ligne: '2F343D',
  encre: 'E8EAED', attenue: 'ADB2B9', discret: '868E99',
  vif: 'E3B23C', ok: '3F9F5F', erreur: 'E2675F',
  prot: '7BA7DD', lip: 'E0906A', leg: '5EC080',
};
const TITRE = 'Barlow Condensed';
const TEXTE = 'Inter';

const L = 13.333;
const H = 7.5;
const MARGE = 0.6;
const LARGEUR = L - 2 * MARGE;

// ------------------------------------------------------------------ icônes
const DOSSIER_ICONES = path.join(path.dirname(require.resolve('lucide-static/package.json')), 'icons');
const cacheIcones = new Map();

async function icone(noms, couleur) {
  const liste = Array.isArray(noms) ? noms : [noms];
  const cle = liste[0] + couleur;
  if (cacheIcones.has(cle)) return cacheIcones.get(cle);
  const fichier = liste.map((n) => path.join(DOSSIER_ICONES, `${n}.svg`)).find((f) => fs.existsSync(f));
  if (!fichier) throw new Error(`icône introuvable : ${liste.join(', ')}`);
  const svg = fs.readFileSync(fichier, 'utf8').replace(/currentColor/g, `#${couleur}`);
  const png = await sharp(Buffer.from(svg), { density: 600 }).resize(256, 256).png().toBuffer();
  const donnee = `image/png;base64,${png.toString('base64')}`;
  cacheIcones.set(cle, donnee);
  return donnee;
}

// ------------------------------------------------------------- briques
function texte(d, contenu, o) {
  d.addText(contenu, { isTextBox: true, margin: 0, fontFace: TEXTE, color: C.encre, valign: 'top', ...o });
}

function carte(d, x, y, w, h, o = {}) {
  d.addShape('roundRect', {
    x, y, w, h,
    rectRadius: o.rayon ?? 0.12,
    fill: { color: o.fond ?? C.surface2, transparency: o.transparence ?? 0 },
    line: { color: o.bord ?? C.ligne, width: 0.75, transparency: o.bordTransparence ?? 0 },
  });
}

/** Carte dorée translucide : `vifFond` et `vifBord` de la charte. */
function carteVive(d, x, y, w, h) {
  carte(d, x, y, w, h, { fond: C.vif, transparence: 88, bord: C.vif, bordTransparence: 60 });
}

async function pastilleIcone(d, noms, x, y, taille = 0.55, fond = C.vif) {
  d.addShape('roundRect', { x, y, w: taille, h: taille, rectRadius: 0.1, fill: { color: fond }, line: { color: fond, width: 0 } });
  const m = taille * 0.22;
  d.addImage({ data: await icone(noms, C.fond), x: x + m, y: y + m, w: taille - 2 * m, h: taille - 2 * m });
}

function enTete(d, surtitre, numero, total) {
  d.background = { color: C.fond };
  d.addShape('ellipse', { x: MARGE, y: 0.42, w: 0.16, h: 0.16, fill: { color: C.vif }, line: { color: C.vif, width: 0 } });
  texte(d, 'FITCARNET', { x: MARGE + 0.3, y: 0.36, w: 3, h: 0.3, fontSize: 11, bold: true, color: C.discret, charSpacing: 3, valign: 'middle' });
  texte(d, surtitre, { x: 3.5, y: 0.36, w: L - 7, h: 0.3, fontSize: 11, bold: true, color: C.discret, charSpacing: 3, align: 'center', valign: 'middle' });
  texte(d, `${numero}/${total}`, { x: L - MARGE - 2, y: 0.33, w: 2, h: 0.36, fontFace: TITRE, fontSize: 16, bold: true, color: C.vif, align: 'right', valign: 'middle' });
}

function titre(d, contenu, o = {}) {
  texte(d, contenu, { x: MARGE, y: 0.95, w: LARGEUR, h: 0.8, fontFace: TITRE, fontSize: 40, bold: true, valign: 'middle', ...o });
}

async function bandeau(d, contenu, o = {}) {
  const y = o.y ?? 6.35;
  const h = o.h ?? 0.62;
  if (o.vif) carteVive(d, MARGE, y, LARGEUR, h);
  else carte(d, MARGE, y, LARGEUR, h);
  d.addImage({ data: await icone('package-check', o.vif ? C.vif : C.attenue), x: MARGE + 0.25, y: y + (h - 0.28) / 2, w: 0.28, h: 0.28 });
  texte(d, contenu, { x: MARGE + 0.7, y, w: LARGEUR - 0.95, h, fontSize: 13.5, bold: true, color: o.vif ? C.vif : C.encre, valign: 'middle' });
}

/** Carte « icône + titre + une ligne » — outils, agents, cadrage. */
async function carteInfo(d, x, y, w, h, noms, nom, description, o = {}) {
  carte(d, x, y, w, h);
  await pastilleIcone(d, noms, x + 0.25, y + 0.25, 0.5, o.couleur ?? C.vif);
  texte(d, nom, { x: x + 0.9, y: y + 0.25, w: w - 1.1, h: 0.5, fontSize: o.tailleNom ?? 15, bold: true, valign: 'middle' });
  texte(d, description, { x: x + 0.25, y: y + 0.9, w: w - 0.5, h: h - 1.05, fontSize: o.tailleTexte ?? 12.5, color: C.attenue });
}

// ------------------------------------------------------------ diapositives
const TOTAL = 10;

async function couverture(p) {
  const d = p.addSlide();
  enTete(d, 'PRÉSENTATION', 1, TOTAL);
  carteVive(d, MARGE, 2.25, 3.75, 0.48);
  d.addImage({ data: await icone(['square-terminal', 'terminal-square'], C.vif), x: MARGE + 0.18, y: 2.36, w: 0.26, h: 0.26 });
  texte(d, 'Retour d’expérience · Claude Code', { x: MARGE + 0.55, y: 2.25, w: 3.15, h: 0.48, fontSize: 12.5, bold: true, color: C.vif, valign: 'middle' });
  texte(d, 'FITCARNET', { x: MARGE, y: 2.9, w: 7.2, h: 1.35, fontFace: TITRE, fontSize: 88, bold: true, valign: 'middle' });
  texte(d, 'Construire une application complète avec l’IA — comment, avec quoi, et dans quel cadre.', { x: MARGE, y: 4.45, w: 6.9, h: 1.3, fontSize: 21, color: C.attenue });

  const chiffres = [['7', 'semaines'], ['341', 'commits'], ['1 306', 'tests automatisés']];
  chiffres.forEach(([valeur, libelle], i) => {
    const y = 1.85 + i * 1.55;
    carte(d, 8.55, y, 4.18, 1.35);
    texte(d, valeur, { x: 8.85, y, w: 1.9, h: 1.35, fontFace: TITRE, fontSize: 50, bold: true, color: C.vif, valign: 'middle' });
    texte(d, libelle, { x: 10.75, y, w: 1.9, h: 1.35, fontSize: 15, color: C.attenue, valign: 'middle' });
  });
  d.addNotes('Accroche : une application complète, en production, construite en sept semaines avec l’IA. Je ne vais pas vous montrer le produit, mais la façon de le construire.');
}

async function programme(p) {
  const d = p.addSlide();
  enTete(d, 'AU PROGRAMME', 2, TOTAL);
  titre(d, 'Ce que je vais vous présenter');
  const etapes = [
    ['01', 'Le besoin', 'pourquoi cette application'],
    ['02', 'Le cadrage', 'les règles avant le code'],
    ['03', 'La boîte à outils IA', 'l’agent et son écosystème'],
    ['04', 'Skills et agents', 'l’IA spécialisée sur mon projet'],
    ['05', 'Tests et garde-fous', 'unitaires, API, bout en bout'],
    ['06', 'Bilan', 'ce que l’IA accélère, ce qui reste humain'],
  ];
  const w = (LARGEUR - 0.3) / 2;
  etapes.forEach(([n, nom, detail], i) => {
    const x = MARGE + (i % 2) * (w + 0.3);
    const y = 2.1 + Math.floor(i / 2) * 1.55;
    carte(d, x, y, w, 1.3);
    texte(d, n, { x: x + 0.3, y, w: 0.9, h: 1.3, fontFace: TITRE, fontSize: 36, bold: true, color: C.vif, valign: 'middle' });
    texte(d, nom, { x: x + 1.25, y: y + 0.25, w: w - 1.5, h: 0.42, fontSize: 18, bold: true, valign: 'middle' });
    texte(d, detail, { x: x + 1.25, y: y + 0.69, w: w - 1.5, h: 0.36, fontSize: 13, color: C.attenue, valign: 'middle' });
  });
  d.addNotes('Six temps : pourquoi, comment j’ai cadré, avec quels outils, comment l’IA est spécialisée sur le projet, comment je vérifie, et ce que j’en retiens.');
}

async function besoin(p) {
  const d = p.addSlide();
  enTete(d, '01 · LE BESOIN', 3, TOTAL);
  texte(d, 'Je visais au gramme près.\nJe mangeais à peu près.', { x: MARGE, y: 1.1, w: 5.7, h: 1.75, fontFace: TITRE, fontSize: 40, bold: true });
  texte(d, 'Je vise des macros précises et je m’entraîne en salle. Avant : une calculatrice, un frigo qu’on oublie, un carnet papier. Aucun outil ne reliait mes cibles, mon stock réel et mes séances.', { x: MARGE, y: 3.05, w: 5.5, h: 2.4, fontSize: 16, color: C.attenue, lineSpacingMultiple: 1.15 });

  texte(d, 'LA RÉPONSE', { x: 6.9, y: 1.2, w: 3, h: 0.3, fontSize: 11, bold: true, color: C.vif, charSpacing: 3 });
  const reponses = [
    'Composer un repas qui atteint mes cibles avec ce qu’il y a vraiment dans le frigo',
    'Planifier plusieurs jours, batch cooking et liste de courses',
    'Suivre mes séances et ma progression (1RM)',
  ];
  reponses.forEach((r, i) => {
    const y = 1.65 + i * 1.5;
    carte(d, 6.9, y, 5.83, 1.3);
    texte(d, `0${i + 1}`, { x: 7.15, y, w: 0.7, h: 1.3, fontFace: TITRE, fontSize: 26, bold: true, color: C.vif, valign: 'middle' });
    texte(d, r, { x: 7.9, y, w: 4.6, h: 1.3, fontSize: 15, bold: true, valign: 'middle' });
  });
  // Le bandeau ne parle que du BESOIN : la fiche technique est sur la diapositive du cadrage.
  await bandeau(d, 'Un besoin réel : je m’en sers tous les jours — ce qui s’affiche est pesé, puis mangé.');
  d.addNotes('Le besoin est personnel et réel : je m’en sers tous les jours. C’est ce qui rend le projet exigeant — ce qui est affiché est pesé et mangé.');
}

async function cadrage(p) {
  const d = p.addSlide();
  enTete(d, '02 · LE CADRAGE', 4, TOTAL);
  texte(d, 'Cadrer avant de générer.', { x: MARGE, y: 0.9, w: 5.2, h: 1.4, fontFace: TITRE, fontSize: 40, bold: true, valign: 'middle' });
  texte(d, 'L’IA code vite. Sans cadre, elle code vite dans la mauvaise direction. Tout le cadre est écrit, versionné dans git, et relu par l’IA à chaque session.', { x: 6.2, y: 0.9, w: 6.5, h: 1.4, fontSize: 15, color: C.attenue, valign: 'middle', lineSpacingMultiple: 1.15 });
  const cartes = [
    ['boxes', 'Une pile choisie par moi', 'Symfony 7.4 · API Platform 4 · PostgreSQL 16 · Expo / React Native · Docker'],
    [['file-check-2', 'file-check-corner', 'file-check'], 'CLAUDE.md', 'La « constitution » du projet : architecture, 7 règles non négociables, pièges connus'],
    ['file-text', 'REPRENDRE.md', 'Le journal de bord : ce qui est fait, par quoi continuer, les décisions prises'],
    ['shield-check', 'Des règles métier explicites', 'Ex. « Un chiffre faux est pire qu’un refus de répondre »'],
  ];
  const w = (LARGEUR - 0.3) / 2;
  for (let i = 0; i < cartes.length; i++) {
    const [ic, nom, desc] = cartes[i];
    await carteInfo(d, MARGE + (i % 2) * (w + 0.3), 2.5 + Math.floor(i / 2) * 1.85, w, 1.65, ic, nom, desc, { tailleNom: 17, tailleTexte: 13.5 });
  }
  await bandeau(d, 'L’application : multi-comptes · auto-hébergée sur mon NAS · web + Android');
  d.addNotes('Le point clé de toute la présentation : l’IA relit ce cadre à chaque session. Ce n’est pas un prompt, c’est de la documentation versionnée.');
}

async function outils(p) {
  const d = p.addSlide();
  enTete(d, '03 · LA BOÎTE À OUTILS', 5, TOTAL);
  titre(d, 'Un agent au centre, un écosystème autour.');
  carteVive(d, MARGE, 1.95, LARGEUR, 1.05);
  await pastilleIcone(d, ['square-terminal', 'terminal-square'], MARGE + 0.3, 2.2, 0.55);
  texte(d, 'Claude Code', { x: MARGE + 1.1, y: 1.95, w: 2.4, h: 1.05, fontFace: TITRE, fontSize: 28, bold: true, color: C.vif, valign: 'middle' });
  texte(d, 'L’agent de développement, en terminal : il lit le dépôt, code, lance les tests, commite.', { x: MARGE + 3.5, y: 1.95, w: LARGEUR - 3.8, h: 1.05, fontSize: 15, valign: 'middle' });

  const cartes = [
    ['sparkles', 'superpowers', 'Méthodes : TDD, brainstorming, plans, débogage systématique'],
    [['code-xml', 'code-2', 'code'], 'superpowers-symfony', '44 skills Symfony · API Platform · Doctrine'],
    ['smartphone', 'expo', 'Skills React Native / Expo'],
    ['book-open-check', 'context7 (MCP)', 'La documentation officielle à jour, injectée dans le contexte'],
    ['network', 'graphify', 'Graphe de connaissances du code : 4 387 nœuds, interrogé avant toute recherche'],
    ['wrench', 'Hooks automatiques', 'Typage du front et analyse PHPStan après chaque fichier modifié'],
  ];
  const w = (LARGEUR - 0.5) / 3;
  for (let i = 0; i < cartes.length; i++) {
    const [ic, nom, desc] = cartes[i];
    await carteInfo(d, MARGE + (i % 3) * (w + 0.25), 3.2 + Math.floor(i / 3) * 1.75, w, 1.62, ic, nom, desc);
  }
  texte(d, 'Et ce deck : généré dans Lovable, piloté par Claude via MCP.', { x: MARGE, y: 6.75, w: LARGEUR, h: 0.3, fontSize: 12, italic: true, color: C.discret });
  d.addNotes('Un seul agent, mais outillé : des méthodes (superpowers), du savoir sur ma pile (symfony, expo), la doc à jour (context7), une carte du code (graphify), et des contrôles qui se déclenchent tout seuls (hooks).');
}

async function skills(p) {
  const d = p.addSlide();
  enTete(d, '04 · SKILLS', 6, TOTAL);
  texte(d, '26 skills : la mémoire métier du projet.', { x: MARGE, y: 1.1, w: 5.3, h: 1.75, fontFace: TITRE, fontSize: 40, bold: true });
  texte(d, 'Une skill est une fiche de savoir-faire que l’IA charge au bon moment. Les miennes portent ce que personne d’autre ne peut écrire : le métier et les pièges de CE projet.', { x: MARGE, y: 3.05, w: 5.2, h: 2.4, fontSize: 16, color: C.attenue, lineSpacingMultiple: 1.15 });

  const x = 6.4;
  const w = L - MARGE - x;
  carte(d, x, 1.15, w, 3.0);
  texte(d, '11', { x: x + 0.3, y: 1.3, w: 0.9, h: 0.6, fontFace: TITRE, fontSize: 38, bold: true, color: C.vif, valign: 'middle' });
  texte(d, 'skills de métier et d’outillage', { x: x + 1.2, y: 1.3, w: w - 1.5, h: 0.6, fontSize: 16, bold: true, valign: 'middle' });
  const pastilles = ['isolation-donnees', 'nutrition-fitcarnet', 'schema-base', 'tests-api', 'front-fitcarnet', 'revue-de-code', 'donnees-de-test', 'passe-de-controle'];
  const wp = (w - 0.8) / 2;
  pastilles.forEach((nom, i) => {
    const px = x + 0.3 + (i % 2) * (wp + 0.2);
    const py = 2.1 + Math.floor(i / 2) * 0.48;
    carte(d, px, py, wp, 0.38, { fond: C.fond, rayon: 0.19 });
    texte(d, nom, { x: px, y: py, w: wp, h: 0.38, fontSize: 12, color: C.attenue, align: 'center', valign: 'middle' });
  });

  carte(d, x, 4.35, w, 1.75);
  texte(d, '15', { x: x + 0.3, y: 4.5, w: 0.9, h: 0.6, fontFace: TITRE, fontSize: 38, bold: true, color: C.vif, valign: 'middle' });
  texte(d, 'fiches fonctionnalité', { x: x + 1.2, y: 4.5, w: w - 1.5, h: 0.6, fontSize: 16, bold: true, valign: 'middle' });
  texte(d, 'Le besoin, le parcours utilisateur, les critères d’acceptation — une par fonctionnalité.', { x: x + 0.3, y: 5.15, w: w - 0.6, h: 0.8, fontSize: 13, color: C.attenue });

  await bandeau(d, 'Une table d’aiguillage dit quelle skill charger pour quel travail. 10 skills génériques ont été supprimées : elles n’apportaient rien.', { vif: true, y: 6.3, h: 0.7 });
  d.addNotes('Les skills génériques d’Internet ne valent rien ici. Celles qui comptent racontent mes règles : isolation des données entre comptes, conventions nutritionnelles, double écriture du schéma…');
}

async function agents(p) {
  const d = p.addSlide();
  enTete(d, '04 · AGENTS', 7, TOTAL);
  titre(d, '6 agents spécialisés. Ils rapportent, je décide.');
  const liste = [
    ['shield-check', 'revue-fitcarnet', 'Relit le code selon les 8 motifs de défaut réels du projet'],
    ['book-open-check', 'revue-pile', 'Confronte le code à la documentation officielle de la pile'],
    [['circle-play', 'play-circle'], 'verification-bout-en-bout', 'Éprouve l’application qui tourne, puis efface ses traces'],
    ['smartphone', 'verification-android', 'Fait les gestes de l’utilisateur sur émulateur Android'],
    ['user-check', 'verification-fonctionnalites', 'Point de vue utilisateur, avec capture vidéo'],
    [['file-check-2', 'file-check-corner', 'file-check'], 'verite-documentaire', 'Vérifie que la documentation dit vrai'],
  ];
  const w = (LARGEUR - 0.5) / 3;
  for (let i = 0; i < liste.length; i++) {
    const [ic, nom, desc] = liste[i];
    await carteInfo(d, MARGE + (i % 3) * (w + 0.25), 2.0 + Math.floor(i / 3) * 2.05, w, 1.85, ic, nom, desc, { tailleNom: 14, tailleTexte: 13.5 });
  }
  // Corrigé par rapport au deck Lovable, qui disait « tous en lecture seule » :
  // les agents de vérification créent puis effacent des données jetables.
  await bandeau(d, 'Aucun ne modifie le code : ils rapportent, je décide. Aucun ne touche une donnée qu’il n’a pas créée.');
  d.addNotes('Chaque agent a un regard que les autres n’ont pas. Exemple : verite-documentaire a trouvé des compteurs faux dans ma propre documentation.');
}

async function tests(p) {
  const d = p.addSlide();
  enTete(d, '05 · TESTS', 8, TOTAL);
  titre(d, 'Jamais « terminé » sans preuve.');
  const niveaux = [
    ['756', 'tests unitaires front', '+ 46 tests de rendu', C.prot],
    ['498', 'tests API PHPUnit', 'sans base ni réseau, en 1,5 s', C.vif],
    ['6', 'épreuves E2E', 'Playwright : vrai navigateur, vraie API, vraie base, comptes jetables', C.lip],
    ['Android', 'parcours rejoués', 'sur émulateur, avec les gestes de l’utilisateur', C.leg],
  ];
  const w = (LARGEUR - 0.75) / 4;
  niveaux.forEach(([valeur, nom, detail, couleur], i) => {
    const x = MARGE + i * (w + 0.25);
    carte(d, x, 1.95, w, 2.45);
    texte(d, valeur, { x: x + 0.25, y: 2.05, w: w - 0.5, h: 0.95, fontFace: TITRE, fontSize: valeur.length > 4 ? 40 : 56, bold: true, color: couleur, valign: 'middle' });
    texte(d, nom, { x: x + 0.25, y: 3.05, w: w - 0.5, h: 0.4, fontSize: 14, bold: true, valign: 'middle' });
    texte(d, detail, { x: x + 0.25, y: 3.5, w: w - 0.5, h: 0.8, fontSize: 11.5, color: C.attenue });
  });
  texte(d, 'TDD systématique : le test échoue d’abord, puis le correctif le fait passer. L’IA doit coller la sortie des tests, pas une affirmation.', { x: MARGE, y: 4.75, w: 5.6, h: 1.9, fontSize: 15, color: C.attenue, valign: 'middle', lineSpacingMultiple: 1.15 });
  carteVive(d, 6.6, 4.75, L - MARGE - 6.6, 1.9);
  texte(d, 'POURQUOI PLUSIEURS NIVEAUX', { x: 6.9, y: 4.95, w: 5.5, h: 0.3, fontSize: 11, bold: true, color: C.vif, charSpacing: 3 });
  texte(d, '42,5 kg saisis, 425 kg enregistrés — avec 577 tests unitaires au vert. C’est l’émulateur Android qui l’a vu.', { x: 6.9, y: 5.35, w: 5.55, h: 1.15, fontSize: 15, bold: true, valign: 'middle' });
  d.addNotes('L’anecdote à raconter : une virgule décimale mal lue par le clavier Android. 577 tests verts, et dix fois trop de poids en base. Seule l’épreuve sur le vrai moteur l’a montrée.');
}

async function boucle(p) {
  const d = p.addSlide();
  enTete(d, '05 · GARDE-FOUS', 9, TOTAL);
  titre(d, 'Chaque panne devient une règle.');
  carte(d, MARGE, 1.95, 4.0, 3.85);
  texte(d, '79', { x: MARGE + 0.35, y: 2.05, w: 3.3, h: 1.45, fontFace: TITRE, fontSize: 100, bold: true, color: C.vif, valign: 'middle' });
  texte(d, 'constats d’audit', { x: MARGE + 0.35, y: 3.55, w: 3.3, h: 0.4, fontSize: 17, bold: true, valign: 'middle' });
  texte(d, '78 clos', { x: MARGE + 0.35, y: 4.0, w: 3.3, h: 0.55, fontFace: TITRE, fontSize: 30, bold: true, color: C.leg, valign: 'middle' });
  texte(d, 'Audit complet du code mené avec l’IA — septembre 2026', { x: MARGE + 0.35, y: 4.75, w: 3.3, h: 0.9, fontSize: 12, color: C.discret });

  const etapes = [
    ['circle-dot', 'Panne ou constat'],
    [['test-tubes', 'test-tube'], 'Test qui la reproduit'],
    ['wrench', 'Correctif'],
    [['file-check-2', 'file-check-corner', 'file-check'], 'Règle, skill ou garde-fou écrit dans le dépôt'],
  ];
  const x0 = 5.0;
  const pas = (L - MARGE - x0) / 4;
  for (let i = 0; i < etapes.length; i++) {
    const [ic, nom] = etapes[i];
    const cx = x0 + i * pas + pas / 2;
    d.addShape('ellipse', { x: cx - 0.5, y: 2.75, w: 1.0, h: 1.0, fill: { color: C.vif, transparency: 88 }, line: { color: C.vif, width: 1, transparency: 40 } });
    d.addImage({ data: await icone(ic, C.vif), x: cx - 0.24, y: 3.01, w: 0.48, h: 0.48 });
    texte(d, `0${i + 1}`, { x: cx - 0.8, y: 2.25, w: 1.6, h: 0.35, fontFace: TITRE, fontSize: 18, bold: true, color: C.vif, align: 'center', valign: 'middle' });
    texte(d, nom, { x: cx - 0.85, y: 3.95, w: 1.7, h: 1.3, fontSize: 13.5, bold: true, align: 'center' });
    if (i < etapes.length - 1) {
      d.addImage({ data: await icone('arrow-right', C.discret), x: cx + pas / 2 - 0.18, y: 3.07, w: 0.36, h: 0.36 });
    }
  }
  await bandeau(d, 'Résultat : l’IA de demain ne refait pas l’erreur d’hier — le contexte est un actif versionné.', { vif: true });
  d.addNotes('L’IA n’a pas de mémoire d’une session à l’autre. Le dépôt, si. Chaque panne laisse un test, une règle datée dans CLAUDE.md ou une skill.');
}

async function bilan(p) {
  const d = p.addSlide();
  enTete(d, '06 · BILAN', 10, TOTAL);
  titre(d, 'L’IA accélère. Le cadre fait la qualité.');
  const colonnes = [
    ['sparkles', 'Ce que l’IA a accéléré', ['Une application full-stack en production en 7 semaines', '341 commits', '1 306 tests automatisés', 'Audit, relecture et documentation en continu']],
    ['user-check', 'Ce qui reste humain', ['Le besoin et les arbitrages', 'Les règles non négociables', 'La décision finale : l’IA propose et prouve, je valide']],
  ];
  const w = (LARGEUR - 0.3) / 2;
  for (let c = 0; c < colonnes.length; c++) {
    const [ic, nom, lignes] = colonnes[c];
    const x = MARGE + c * (w + 0.3);
    carte(d, x, 1.95, w, 3.55);
    await pastilleIcone(d, ic, x + 0.3, 2.2, 0.5);
    texte(d, nom, { x: x + 1.0, y: 2.2, w: w - 1.3, h: 0.5, fontFace: TITRE, fontSize: 24, bold: true, valign: 'middle' });
    for (let i = 0; i < lignes.length; i++) {
      const y = 2.95 + i * 0.62;
      d.addImage({ data: await icone(['circle-check', 'check-circle-2'], C.ok), x: x + 0.35, y: y + 0.11, w: 0.26, h: 0.26 });
      texte(d, lignes[i], { x: x + 0.8, y, w: w - 1.1, h: 0.5, fontSize: 14, valign: 'middle' });
    }
  }
  texte(d, 'Questions ?', { x: MARGE, y: 5.8, w: LARGEUR, h: 1.0, fontFace: TITRE, fontSize: 48, bold: true, color: C.vif, align: 'center', valign: 'middle' });
  d.addNotes('La phrase à laisser : l’IA propose et prouve, je valide. La vitesse vient de l’IA ; la qualité vient du cadre que je lui ai écrit.');
}

(async () => {
  const p = new pptxgen();
  p.layout = 'LAYOUT_WIDE';
  p.title = 'Fitcarnet — Construire une application avec l’IA';
  p.author = 'Mickaël Pol';
  for (const diapositive of [couverture, programme, besoin, cadrage, outils, skills, agents, tests, boucle, bilan]) {
    await diapositive(p);
  }
  await p.writeFile({ fileName: SORTIE });
  console.log(`écrit : ${SORTIE}`);
})();
