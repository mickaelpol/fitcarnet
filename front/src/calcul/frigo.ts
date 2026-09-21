/**
 * Logique du frigo indépendante de l'affichage : regroupement par emplacement
 * et calcul des écarts d'inventaire.
 *
 * Extrait de l'écran pour que l'inventaire et la consultation partagent le
 * même ordre — sans quoi les deux vues du même frigo divergeraient.
 */

import { nombreSaisi } from './saisieNombre';
import type { AlimentDisponible, AlimentIncomplet } from '@/api/types';
import { sansAccent } from './texte';

/**
 * LE STOCK RAMENÉ AU GRAMME, ou `null` si la conversion est inconnue.
 *
 * Rapatriée le 20 septembre 2026 (palier 0). Cette règle était écrite TROIS
 * fois, dans deux langages, **avec trois gardes différentes** :
 *
 *     api/src/Service/AlimentDisponible.php:167   null !== $g && $g > 0   ← refuse 0
 *     front/src/calcul/planCalcule.ts:65          a.grammesParUnite !== null
 *     front/src/composants/ligneFrigo.tsx:97      … !== null
 *
 * Un produit Grocy dont le facteur de conversion vaut `0` — `FrigoGrocy.php`
 * le lit tel quel — donnait donc trois réponses : le serveur « je ne sais
 * pas », le solveur « zéro gramme », et l'écran du frigo **« soit 0 g »**.
 * Un « je ne sais pas » rendu en zéro, ce que la règle 6 interdit
 * explicitement.
 *
 * C'EST LA GARDE DU SERVEUR QUI FAIT FOI, et c'est la plus stricte : un
 * facteur nul n'est pas une conversion, c'est une conversion absente. Un
 * litre de lait ou un pack n'ont pas de poids connu — le calculateur doit
 * les écarter, pas supposer.
 *
 * *(Aucune instance Grocy n'a été trouvée avec un facteur à zéro : c'est un
 * risque, pas un défaut constaté. Mais les écritures divergeaient VRAIMENT, et
 * c'est cela qu'on corrige.)*
 *
 * ELLES ÉTAIENT CINQ, ET NON TROIS. Ce commentaire annonçait trois sites le
 * 20 septembre au matin ; la revue en a trouvé deux autres l'après-midi, qui
 * posent la même question sans la même réponse :
 *
 *     app/(onglets)/frigo.tsx:144      grammesParUnite === null   ← le bandeau « sans poids connu »
 *     calcul/planCalcule.ts:47         grammesParUnite !== null   ← les aliments calculables
 *
 * Le premier était le plus gênant : un produit au facteur nul était écarté du
 * calculateur par `stockEnGrammes` ET absent du bandeau qui existe exprès pour
 * expliquer son absence. L'aliment disparaissait sans que rien ne le nomme —
 * la règle 7 dit le contraire. D'où `poidsConnu`, la question posée une fois
 * pour les cinq.
 */
export const poidsConnu = (
  aliment: { grammesParUnite: number | null },
): boolean => aliment.grammesParUnite !== null && aliment.grammesParUnite > 0;

export const stockEnGrammes = (
  aliment: { stock: number; grammesParUnite: number | null },
): number | null => (poidsConnu(aliment)
  ? aliment.stock * aliment.grammesParUnite!
  : null);

/** Ordre de parcours d'un inventaire réel : on descend du frais au sec. */
export const ORDRE_EMPLACEMENTS: readonly string[] =
  ['Frigo', 'Congélateur', 'Congelateur', 'Placard'] as const;

/**
 * Une ligne du frigo : un aliment utilisable, OU un produit Grocy incomplet.
 *
 * Les deux se rangent dans la même section depuis le 19 septembre 2026 —
 * « je veux que TOUS mes aliments apparaissent dans mon frigo ». Ce qui les
 * distingue à la lecture est la présence de `manquants`, et le typage oblige
 * à choisir : aucun code ne peut lire `kcal100` sur une ligne incomplète.
 */
export type LigneFrigo = AlimentDisponible | AlimentIncomplet;

export const estIncomplet = (l: LigneFrigo): l is AlimentIncomplet => 'manquants' in l;

export interface SectionFrigo {
  titre: string;
  data: LigneFrigo[];
}

export function grouperParEmplacement(aliments: LigneFrigo[]): SectionFrigo[] {
  const parLieu = new Map<string, LigneFrigo[]>();
  for (const a of aliments) {
    const lieu = a.emplacement ?? 'Sans emplacement';
    parLieu.set(lieu, [...(parLieu.get(lieu) ?? []), a]);
  }

  return [...parLieu.entries()]
    .sort((a, b) => {
      const ia = ORDRE_EMPLACEMENTS.indexOf(a[0]);
      const ib = ORDRE_EMPLACEMENTS.indexOf(b[0]);

      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0], 'fr');
    })
    .map(([titre, data]) => ({
      titre,
      data: [...data].sort((x, y) => x.nom.localeCompare(y.nom, 'fr')),
    }));
}

/**
 * Recherche sur le nom et l'emplacement, insensible aux accents et à la casse.
 * « congelateur » doit trouver le congélateur, sinon la barre ne sert à rien.
 */
export function filtrerFrigo(
  aliments: LigneFrigo[],
  recherche: string,
): LigneFrigo[] {
  const q = sansAccent(recherche.trim());
  if (q === '') return aliments;

  return aliments.filter(
    (a) => sansAccent(a.nom).includes(q) || sansAccent(a.emplacement ?? '').includes(q));
}

export interface LigneInventaire {
  reference: string;
  quantite: number;
}

/**
 * Ce qui sera réellement envoyé : uniquement les lignes saisies dont la
 * valeur diffère du stock théorique.
 *
 * Une saisie vide n'est pas un zéro — elle signifie « pas encore compté ».
 * Confondre les deux viderait le frigo de tout ce qu'on n'a pas eu le temps
 * de peser.
 *
 * LE SEUIL VIENT DU SERVEUR — palier B, 21 septembre 2026. `SEUIL_ECART = 0.001`
 * était écrit ici, avec sa raison : en deçà, la différence vient de l'arrondi
 * d'AFFICHAGE, pas de la balance. C'est une règle — elle décide de ce qui part
 * vers Grocy — et elle vit maintenant dans `api/src/Service/EcartDInventaire.php`,
 * publiée par `GET /api/mon-frigo` (`seuilEcartInventaire`).
 *
 * LE NOMBRE ET NON LE VERDICT, exprès : un inventaire se compare à chaque
 * frappe sur jusqu'à cinq cents lignes, et `docs/plan-serveur-autoritaire.md`
 * écrit noir sur blanc qu'un aller-retour par case serait une RÉGRESSION. Même
 * motif que `seriesQuiComptent` : le serveur transmet la règle, indexée sur ce
 * que le client possède déjà, et l'écran fait une comparaison paramétrée.
 *
 * `seuil` N'A PAS DE VALEUR PAR DÉFAUT, et c'est voulu : un appelant qui
 * l'oublierait remettrait le nombre ici, en silence.
 */
export function ecartsInventaire(
  aliments: AlimentDisponible[],
  saisies: Record<string, string>,
  seuil: number,
): LigneInventaire[] {
  const lignes: LigneInventaire[] = [];

  for (const a of aliments) {
    const texte = (saisies[a.reference] ?? '').trim();
    if (texte === '') continue;

    /* `nombreSaisi` ET NON `parseFloat` : « 4,2,1 » se lisait 4,2, et partait
       vers Grocy comme une pesée. Relevé par la revue le 15 septembre 2026.
       Négatif et illisible rendent `null` : la ligne n'est pas envoyée. */
    const quantite = nombreSaisi(texte);
    if (quantite === null) continue;
    if (Math.abs(quantite - a.stock) <= seuil) continue;

    lignes.push({ reference: a.reference, quantite });
  }

  return lignes;
}

/**
 * COMBIEN DE TEMPS LE RESULTAT D'UN INVENTAIRE RESTE AFFICHE.
 *
 * Un quart d'heure : on envoie, on va faire autre chose, on revient voir. Le
 * serveur garde le dernier lot trente jours — sans borne, « 12 corrections
 * appliquees » resterait affiche des semaines, et une banniere permanente ne
 * se lit plus.
 */
export const FRAICHEUR_RESULTAT = 15 * 60 * 1000;

/**
 * Ce resultat d'inventaire est-il encore d'actualite ?
 *
 * `maintenant` EST UN PARAMETRE, ET C'EST TOUT LE CORRECTIF DU 20 SEPTEMBRE
 * 2026. La borne vivait dans un `useMemo` de `app/(onglets)/frigo.tsx` dont
 * aucune dependance n'etait le temps :
 *
 *     }, [suivi.data?.statut, suivi.data?.finiLe]);
 *
 * `Date.now()` n'y etait lu qu'au moment ou l'une de ces deux valeurs
 * changeait. Une fois `true`, la reponse le restait — et le partage de
 * structure de React Query preserve justement ces references quand la reponse
 * est identique. Le bandeau restait donc affiche bien au-dela du quart
 * d'heure, c'est-a-dire exactement ce que le commentaire disait empecher. Un
 * garde qui ne pouvait pas se declencher.
 */
export const resultatEncoreFrais = (
  suivi: { statut?: string; finiLe?: string | null } | null | undefined,
  maintenant: number,
): boolean => {
  if (suivi?.statut !== 'termine' && suivi?.statut !== 'echoue') return false;

  const fini = Date.parse(suivi.finiLe ?? '');

  return Number.isFinite(fini) && maintenant - fini < FRAICHEUR_RESULTAT;
};
