import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

/**
 * LE CINQUIÈME DOUBLE JUGE EST PARTI — palier B4, 25 septembre 2026.
 *
 * « Ce qui est pré-rempli est ce que tu as fait la dernière fois » était jugée
 * DEUX fois : `habitudesAEcrire` (front/src/calcul/habitudesCuisson.ts)
 * décidait quelle décision gagne pour un aliment cuisiné deux fois dans un
 * même plan, ET laquelle ne vaut pas la peine d'être écrite — en comparant à
 * `connues[cle]`. `LotDHabitudes::depuis` (api/src/Service/LotDHabitudes.php)
 * re-dédoublonnait côté serveur avec exactement la même règle.
 *
 * Depuis B4, le front envoie les cuissons EFFECTIVES du plan, SANS JUGER, et
 * `PUT /api/mes-cuissons` seul décide ce qui mérite d'être écrit. **En DEUX
 * endroits, et les confondre invite à en recréer un troisième** :
 * `LotDHabitudes::depuis` retient la dernière décision de chaque aliment — il
 * dédoublonne, borne et valide, il ne trie AUCUN écart — et c'est la clause
 * SQL `WHERE ... IS DISTINCT FROM` de `CuissonsHabituelles::remplacer` qui
 * n'écrit que ce qui a changé. Cette phrase attribuait le tri à `depuis` :
 * relevé en revue le 25 septembre 2026, le jour même où elle a été écrite.
 *
 * ── CE QUE LE FRONT GARDE, ET C'EST DÉCLARÉ ───────────────────────────────
 *
 * `cleDHabitude` (fabrication de la clé d'habitude, table d'accents manuelle
 * car Hermes n'implémente pas `normalize`) et `depuisLesHabitudes`
 * (pré-remplissage de l'écran ; il part au palier 3) restent dans
 * `habitudesCuisson.ts`. Ce garde ne les vise pas.
 */

/* Depuis `front/`, là où `npm test` s'exécute. */
const RACINE = resolve(process.cwd(), '..');

const lire = (chemin: string): string => readFileSync(join(RACINE, chemin), 'utf8');

const EXTENSIONS = /\.(ts|tsx)$/;
const IGNORES = new Set(['node_modules', 'dist', '.expo', '.git', 'dist-tests']);

function sources(chemin: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(chemin)) {
    if (IGNORES.has(entree) || entree.startsWith('.')) continue;
    const complet = join(chemin, entree);
    if (statSync(complet).isDirectory()) trouves.push(...sources(complet));
    else if (EXTENSIONS.test(entree)) trouves.push(complet.replace(/\\/g, '/'));
  }

  return trouves;
}

/* Ce dépôt raconte ses pannes dans ses commentaires, et celui de
   `habitudesCuisson.ts` racontera longtemps le déménagement de cette règle
   vers le serveur. Sans ce retrait, le garde se déclencherait sur
   l'explication du déménagement lui-même. */
const sansCommentaires = (source: string): string => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

/* Le front ET l'app : le double juge vivait dans `front/src/calcul` et son
   seul appelant dans `front/src/composants` — le contraire du garde de
   `coherenceCibleUnique.test.ts`, qui ne visait que des écrans. */
const FICHIERS = [
  ...sources(join(RACINE, 'front/src')),
  ...sources(join(RACINE, 'front/app')),
]
  .map((f) => ({
    f: f.slice(RACINE.length + 1),
    source: sansCommentaires(readFileSync(f, 'utf8')),
  }))
  .filter(({ f }) => !/\.test(-rendu|-data)?\.tsx?$/.test(f));

const LOT_D_HABITUDES = 'api/src/Service/LotDHabitudes.php';

/**
 * ── POURQUOI CE GARDE NE CHERCHE (PRESQUE) PLUS UNE FORME ─────────────────
 *
 * Sa première version traquait deux écritures précises : `connues[cle] !== mode`
 * et `new Map<string, number | null>()`. La revue du 25 septembre 2026 leur a
 * passé dix réécritures plausibles ; **neuf passaient**. Deux d'entre elles sont
 * l'écriture naturelle de ce dépôt : `m` est le nom employé pour un mode dans
 * `repas.tsx`, et `Habitudes` est le type du projet pour exactement la table que
 * le motif cherchait — s'en servir efface le `Record<string` qu'il exigeait.
 * Inverser les opérandes suffisait aussi.
 *
 * Un garde qu'on contourne sans le vouloir ne garde rien. Celui-ci vise donc
 * l'INTERFACE, qui ne se renomme pas sans qu'on s'en aperçoive : **ce qui part
 * au serveur vient de `lignesDHabitudes`, et de rien d'autre.** Un juge réécrit
 * sous un autre nom, avec un autre type, dans l'autre sens, devra quand même
 * s'insérer entre cette fonction et la mutation — et c'est là qu'on l'attend.
 */

/** Le seul hook qui écrit des habitudes. */
const MUTATION = /useEnregistrerCuissons\s*\(/;

/** L'appelant unique, et la seule source admise pour sa charge. */
const APPELANT = 'front/src/composants/usePlanCalcule.ts';

/**
 * Retenir la dernière décision de chaque aliment avant l'envoi.
 *
 * Le motif garde une forme, mais il vise une AFFECTATION indexée par clé
 * d'habitude — `.set(cleDHabitude(…))`, `t[cleDHabitude(…)] = …`, ou la clé
 * calculée d'un littéral. Il ne capte pas une LECTURE : `repas.tsx` lit
 * `(mesCuissons.data ?? {})[cleDHabitude(nom)]` pour marquer « ce que tu fais
 * d'habitude » dans le sélecteur, et c'est de l'affichage, pas un jugement.
 *
 * `cleDHabitude` est ce qui ne se contourne pas : c'est la seule fabrique de
 * clé du dépôt, et dédoublonner par aliment sans elle est impossible.
 */
const DEDOUBLONNAGE = /(\.set\(\s*cleDHabitude\(|\[\s*cleDHabitude\([^)]*\)\s*\]\s*[:=][^=])/;

describe('les habitudes de cuisson ne sont dédoublonnées que sur le serveur', () => {
  it('LE TÉMOIN : le balayage voit bien les sources, et LotDHabitudes porte encore la règle', () => {
    // CA-1 (d)
    /* 145 fichiers de production au 25 septembre 2026 (front/src + front/app,
       hors tests). Le plancher est bas exprès : il attrape un balayage qui ne
       descend plus dans les sous-dossiers, pas la disparition d'un fichier. */
    assert.ok(FICHIERS.length > 100,
      `${FICHIERS.length} fichiers parcourus, c'est trop peu : le balayage rate des dossiers`);

    assert.match(lire(LOT_D_HABITUDES), /\$aEcrire\[\$aliment\]\s*=\s*\$mode;/,
      `${LOT_D_HABITUDES} ne porte plus le dédoublonnage « la dernière décision gagne » : `
      + 'si le serveur a cessé de le porter, ce garde n’a plus lieu d’être et doit être '
      + 'retiré avec elle.');
  });

  it('LE TÉMOIN DU MOTIF : il reconnaît les QUATRE façons d’écrire le dédoublonnage', () => {
    /* SANS CE CAS, CE GARDE NE PEUT PLUS TOMBER — c'est le motif 4 du projet,
       le test qui ne peut pas échouer. Une fois `habitudesAEcrire` supprimée,
       `DEDOUBLONNAGE` ne rencontre plus rien : il passerait au vert même écrit
       de travers, même vidé.

       ET UN TÉMOIN QUI NE SERT AU MOTIF QUE SA PROPRE SOURCE NE PROUVE RIEN.
       C'est ce qu'a montré la revue du 25 septembre 2026 : la première version
       de ce fichier redonnait au motif la chaîne dont on l'avait extrait, donc
       elle ne pouvait pas révéler son étroitesse — neuf réécritures plausibles
       sur dix passaient au travers. Les quatre ci-dessous sont celles-là. */
    const REECRITURES = [
      ['la Map d’origine',
        'derniere.set(cleDHabitude(q.aliment.nom), decide);'],
      ['une table typée `Habitudes`, le type du projet',
        'const derniere: Habitudes = {}; derniere[cleDHabitude(nom)] = mode;'],
      ['un littéral à clé calculée, dans un reduce',
        'lignes.reduce((acc, l) => ({ ...acc, [cleDHabitude(l.nom)]: l.mode }), {});'],
      ['une Map sans type',
        'const vus = new Map(); vus.set(cleDHabitude(nom), mode);'],
    ] as const;

    for (const [quoi, code] of REECRITURES) {
      assert.match(code, DEDOUBLONNAGE,
        `\`DEDOUBLONNAGE\` ne reconnaît plus ${quoi} : le motif a été rétréci, et le `
        + 'garde laisse repasser le double juge sous cette écriture-là.');
    }

    /* L'ENVERS DU TÉMOIN. Un motif si large qu'il refuserait la bonne écriture
       serait tout aussi inutile : il finirait désactivé. Ces deux-là doivent
       passer — la mise à plat qui a remplacé le juge, et la LECTURE d'une
       habitude pour marquer « ce que tu fais d'habitude » dans le sélecteur. */
    assert.doesNotMatch(
      'lignes.push({ aliment: cleDHabitude(q.aliment.nom), mode: decide });',
      DEDOUBLONNAGE, 'le motif refuse la mise à plat sans jugement');
    assert.doesNotMatch(
      'const habitude = (mesCuissons.data ?? {})[cleDHabitude(aliment.nom)];',
      DEDOUBLONNAGE, 'le motif refuse une lecture d’affichage, qui est légitime');
  });

  it('aucun fichier ne nomme habitudesAEcrire', () => {
    // CA-1 (a)
    const coupables = FICHIERS.filter(({ source }) => /\bhabitudesAEcrire\b/.test(source)).map(({ f }) => f);

    assert.deepEqual(coupables, [],
      'Ces fichiers nomment encore `habitudesAEcrire`. Elle a disparu : le front envoie '
      + 'désormais les cuissons effectives du plan sans les juger, et `PUT /api/mes-cuissons` '
      + '(`LotDHabitudes::depuis`) seul décide ce qui mérite d’être écrit.');
  });

  it('UN SEUL fichier écrit des habitudes, et c’est le hook du plan', () => {
    // CA-1 (b)
    const ecrivains = FICHIERS.filter(({ source }) => MUTATION.test(source)).map(({ f }) => f);

    assert.deepEqual(ecrivains, ['front/src/api/hooks/cuissons.ts', APPELANT].sort(),
      'Quelqu’un d’autre écrit des habitudes. Tant qu’il n’y a qu’un appelant, ce '
      + 'garde peut vérifier d’où vient ce qui part ; un second appelant rouvre la '
      + 'porte à un juge écrit ailleurs, sous un autre nom.');
  });

  it('ce qui part au serveur vient de `lignesDHabitudes`, et de rien d’autre', () => {
    // CA-1 (b)
    /* LE CŒUR DU GARDE. Peu importe comment un futur juge serait écrit — table,
       Map, reduce, opérandes inversés — il devrait s’insérer ICI, entre la mise
       à plat et la mutation. C’est le seul point de passage obligé. */
    const hook = FICHIERS.find(({ f }) => f === APPELANT);
    assert.ok(hook, `${APPELANT} introuvable : le garde compare à un fichier qui a bougé`);

    const charge = /enregistrerCuissons\.mutate\(\s*([A-Za-z0-9_]+)/.exec(hook.source)?.[1];
    assert.ok(charge,
      `${APPELANT} ne passe plus une simple variable à \`mutate\` : si un calcul s’est `
      + 'glissé dans l’appel, c’est exactement ce que ce garde refuse.');

    const source = new RegExp(`const\\s+${charge}\\s*=\\s*useMemo\\(\\s*\\(\\)\\s*=>\\s*lignesDHabitudes\\(`);
    assert.match(hook.source, source,
      `Ce qui est envoyé au serveur (\`${charge}\`) ne vient plus directement de `
      + '`lignesDHabitudes`. Quelque chose juge entre les deux — et ce tri appartient '
      + 'au serveur : `LotDHabitudes::depuis` pour le dédoublonnage, la clause SQL '
      + '`IS DISTINCT FROM` pour l’inchangé.');
  });

  it('aucun fichier ne dédoublonne par clé d’habitude', () => {
    // CA-1 (c)
    const coupables = FICHIERS.filter(({ source }) => DEDOUBLONNAGE.test(source)).map(({ f }) => f);

    assert.deepEqual(coupables, [],
      'Ces fichiers construisent une table indexée par clé d’habitude — c’est '
      + '« la dernière décision gagne », réécrite. Cette règle n’a plus qu’une '
      + 'écriture : `LotDHabitudes::depuis`, en PHP.');
  });
});
