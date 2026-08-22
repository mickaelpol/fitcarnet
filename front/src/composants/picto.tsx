import Svg, { Path } from 'react-native-svg';
import { DOS, FACE } from '@/muscles/silhouettes';
import type { GroupeMusculaire } from '@/muscles/groupes';
import { C } from '@/theme';

/**
 * UN GROUPE MUSCULAIRE, DESSINÉ.
 *
 * La silhouette entière est rendue à chaque fois, cadrée sur le muscle par le
 * `viewBox`. Le reste du corps n'est pas du décor : c'est ce qui permet de
 * SITUER le muscle. Un bloc de pectoraux détouré ne se reconnaît pas ; les
 * mêmes pectoraux avec l'amorce des épaules et du sternum autour, si.
 *
 * DEUX OPACITÉS, UNE SEULE COULEUR. Le muscle ciblé est plein, le corps à
 * 0,28. Tout suit `couleur`, donc l'état sélectionné se joue sur une valeur
 * et non sur un second jeu d'images à tenir à jour.
 *
 * POURQUOI CE N'EST PAS DANS UNE LISTE DE RÉSULTATS. Chaque pictogramme rend
 * 70 à 89 tracés. À 32 px, la tache colorée fait trois pixels : on voit qu'il
 * y a quelque chose, on ne distingue pas les pectoraux des trapèzes. C'est un
 * outil de SÉLECTION, montré une quinzaine de fois en grand, pas une vignette
 * de ligne. Dans une liste de 1338 exercices, ce serait à la fois illisible et
 * coûteux.
 */
export function Picto({
  groupe, taille, couleur = C.attenue,
}: {
  groupe: GroupeMusculaire;
  taille: number;
  couleur?: string;
}) {
  const tracés = groupe.face === 'front' ? FACE : DOS;
  const vifs = new Set(groupe.vifs);

  return (
    <Svg width={taille} height={taille} viewBox={groupe.viewBox}>
      {tracés.map((d, i) => (
        <Path
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          d={d}
          fill={couleur}
          /* L'ORDRE DE DESSIN EST CELUI DU TABLEAU, et il compte : un muscle
             profond tracé après la peau la recouvrirait. C'est pour ça que
             `silhouettes.ts` interdit de trier. */
          opacity={vifs.has(i) ? 1 : 0.28}
        />
      ))}
    </Svg>
  );
}
