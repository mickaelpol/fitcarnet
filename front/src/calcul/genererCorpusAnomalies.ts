/**
 * GENERATEUR DU CORPUS DE COMPARAISON — outil de migration, pas de production.
 *
 * Il fait tourner `verifierAliment` — la reference historique, cote front — sur
 * un corpus reel, et ecrit le resultat. Le portage PHP devra rendre EXACTEMENT
 * la meme chose, sur les memes entrees.
 *
 * POURQUOI PAS UNE RELECTURE ATTENTIVE : seize anomalies, des messages de dix
 * lignes, des bornes par categorie. Porter « a l'oeil » et se relire, c'est
 * exactement la methode qui produit une divergence silencieuse — celle que ce
 * projet passe son temps a rattraper.
 *
 * A SUPPRIMER une fois le portage acheve et le juge du front retire : ce
 * fichier n'a de sens que pendant la bascule.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Aliment } from '../solveur/types';
import { verifierAliment } from './plausibilite';

interface Entree {
  nom: string;
  groupe: string;
  kcal100: number;
  prot100: number;
  gluc100: number;
  lip100: number;
  fibres100: number | null;
}

/* Le groupe CIQUAL n'est pas une categorie du projet : on balaie donc TOUTES
   les categories pour chaque entree, et tous les rendements interessants.
   C'est ce qui fait sortir les regles par categorie, que le corpus seul ne
   declencherait jamais. */
const CATEGORIES = ['prot', 'fec', 'leg', 'fruit', 'ole', 'huile', 'lait', 'autre'] as const;
const RATIOS = [0.3, 0.5, 0.75, 0.9, 1, 1.05, 1.3, 1.5, 2.26, 2.5, 3, 5];

const entrees = JSON.parse(
  readFileSync(process.argv[2] ?? '', 'utf-8')) as Entree[];

/* ON STOCKE AUSSI L'ENTREE. Sans elle, le test PHP ne pourrait pas rejouer le
   cas : il verrait le resultat attendu sans savoir sur quoi. */
interface Cas {
  cle: string;
  entree: { nom: string; categorie: string; ratio: number;
            kcal100: number | 'NaN'; prot100: number | 'NaN'; gluc100: number | 'NaN';
            lip100: number | 'NaN'; fibres100: number | null | 'NaN' };
  anomalies: { gravite: string; code: string; message: string }[];
}
const sortie: Cas[] = [];

/* `JSON.stringify(NaN)` rend `null`, et JSON n'a pas de quoi dire autrement.
   Sans cet encodage, les deux cas « valeur illisible » du corpus arriveraient
   en PHP comme des zeros — et le portage paraitrait diverger alors qu'il
   n'aurait jamais recu l'entree. Mesure le 20 septembre 2026. */
const nombreOuNaN = (v: number | null): number | null | 'NaN' =>
  (v !== null && Number.isNaN(v) ? 'NaN' : v);

/* LA CATEGORIE ET LE RENDEMENT SONT STOCKES, pas deduits de la cle : les cas
   fabriques imposent leur propre rendement, qui n'est PAS celui de la boucle.
   Les lire dans la cle faisait rejouer le mauvais cas — mesure le
   20 septembre 2026. */
const entreeDe = (a: Aliment) => ({
  nom: a.nom, categorie: a.categorie, ratio: a.ratio,
  kcal100: nombreOuNaN(a.kcal100), prot100: nombreOuNaN(a.prot100),
  gluc100: nombreOuNaN(a.gluc100), lip100: nombreOuNaN(a.lip100),
  fibres100: nombreOuNaN(a.fibres100),
});

/* UN ECHANTILLON, ET IL EST CHOISI. 3 000 entrees x 8 categories x 12
   rendements feraient 288 000 cas et des dizaines de megaoctets dans le depot.
   Une entree sur SOIXANTE laisse 50 aliments reels par combinaison — assez
   pour que chacune des seize anomalies sorte plusieurs fois, et le fichier
   tient sous le megaoctet.

   Le pas est fixe et non aleatoire : un corpus qui change a chaque generation
   ne permettrait pas de dire si un ecart vient du portage ou du tirage. */
for (const [rang, e] of entrees.entries()) {
  if (rang % 60 !== 0) continue;

  for (const categorie of CATEGORIES) {
    for (const ratio of RATIOS) {
      const a = {
        id: rang, nom: e.nom, categorie,
        kcal100: e.kcal100, prot100: e.prot100, gluc100: e.gluc100,
        lip100: e.lip100, fibres100: e.fibres100, ratio,
      } as Aliment;

      const anomalies = verifierAliment(a);
      if (anomalies.length === 0) continue;

      sortie.push({
        cle: `${rang}|${categorie}|${ratio}`,
        entree: entreeDe(a),
        anomalies: anomalies.map((x) => ({ gravite: x.gravite, code: x.code, message: x.message })),
      });
    }
  }
}

/* LES CAS QUE CIQUAL NE DECLENCHE JAMAIS, parce que ses donnees sont propres.
   Sans eux, sept des seize anomalies ne sortiraient pas du corpus — et le
   portage PHP pourrait les rendre de travers sans que rien ne tombe. C'est le
   temoin, applique a un corpus. */
const FABRIQUES: { nom: string; a: Partial<Aliment> }[] = [
  { nom: 'valeur illisible', a: { kcal100: Number.NaN, prot100: 1, gluc100: 1, lip100: 1 } },
  { nom: 'proteines illisibles', a: { kcal100: 100, prot100: Number.NaN, gluc100: 1, lip100: 1 } },
  { nom: 'valeur negative', a: { kcal100: 100, prot100: -2, gluc100: 1, lip100: 1 } },
  { nom: 'calories negatives', a: { kcal100: -5, prot100: 1, gluc100: 1, lip100: 1 } },
  { nom: 'rendement nul', a: { kcal100: 100, prot100: 1, gluc100: 1, lip100: 1, ratio: 0 } },
  { nom: 'rendement negatif', a: { kcal100: 100, prot100: 1, gluc100: 1, lip100: 1, ratio: -1 } },
  { nom: 'plus de cent grammes', a: { kcal100: 400, prot100: 40, gluc100: 40, lip100: 20, fibres100: 10 } },
  { nom: 'pile a la borne des cent', a: { kcal100: 380, prot100: 30, gluc100: 60, lip100: 10, fibres100: 0 } },
  { nom: 'kilojoules recopies', a: { kcal100: 1465, prot100: 7, gluc100: 78, lip100: 0.6, fibres100: 1.4 } },
  { nom: 'kilojoules a bas niveau', a: { kcal100: 661, prot100: 10, gluc100: 25, lip100: 2, fibres100: 0 } },
  { nom: 'huile tres dense', a: { kcal100: 900, prot100: 0, gluc100: 0, lip100: 100 } },
  { nom: 'tout a zero', a: { kcal100: 0, prot100: 0, gluc100: 0, lip100: 0 } },
];

for (const [rang, f] of FABRIQUES.entries()) {
  for (const categorie of CATEGORIES) {
    for (const ratio of RATIOS) {
      const a = {
        id: 900000 + rang, nom: f.nom, categorie,
        kcal100: 0, prot100: 0, gluc100: 0, lip100: 0, fibres100: null, ratio,
        ...f.a,
      } as Aliment;

      const anomalies = verifierAliment(a);
      if (anomalies.length === 0) continue;

      sortie.push({
        cle: `fabrique-${rang}|${categorie}|${ratio}`,
        entree: entreeDe(a),
        anomalies: anomalies.map((x) => ({ gravite: x.gravite, code: x.code, message: x.message })),
      });
    }
  }
}

writeFileSync(process.argv[3] ?? '', JSON.stringify(sortie));
console.log(`  ${sortie.length} cas avec anomalie, sur ${Math.ceil(entrees.length / 20) * 8 * 12} combinaisons`);
