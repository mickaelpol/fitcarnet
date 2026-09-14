import { View } from 'react-native';
import { Discret, Texte } from './base';
import { SR } from './stylesRepas';
import { C, P, couleurRole, nb } from '@/theme';

/**
 * LES TROIS TABLES D'UN PLAN — COURSES, FOURNÉES, BOÎTES — ÉCRITES UNE FOIS.
 *
 * Constat D9 de l'audit de septembre 2026. Le même plan s'affiche à deux
 * endroits : l'écran de batch cooking, qui le calcule, et l'écran d'un plan
 * relu, qui le rejoue depuis l'instantané enregistré. Les deux montraient
 * exactement les mêmes lignes, et les avaient recopiées : `repas.tsx:737-743`
 * contre `:1366-1372` pour les courses, `:750-761` contre `:1402-1416` pour
 * les fournées, `:770-809` contre `:1428-1486` pour les boîtes.
 *
 * Les données, elles, ne sont PAS les mêmes des deux côtés — le plan figé
 * porte des lignes plates (`{nom, categorie, grammes}`), le calcul en cours
 * porte des `Aliment`. C'est ce qui a permis aux deux copies de coexister
 * sans qu'on les remarque. Ce module ne prend donc que ce qui s'affiche :
 * un nom, une catégorie, des grammes. L'appelant traduit.
 *
 * Ce qu'une divergence coûtait : la colonne « 1 pers. » en doré est ce qu'on
 * se sert vraiment. Qu'elle disparaisse d'un côté et pas de l'autre, et le
 * même plan dit deux choses selon l'écran par lequel on le lit.
 */

/**
 * Une ligne « pastille · nom · poids ».
 *
 * Sert aux courses (ce qu'il manque) et aux fournées (ce qu'on met à cuire).
 * Le poids n'a pas la même signification dans les deux cas — à acheter, à
 * peser — mais la ligne, elle, est la même.
 */
export function LigneQuantite({
  nom, categorie, grammes,
}: {
  nom: string;
  categorie: string;
  grammes: number;
}) {
  return (
    <View style={SR.ligneCourse}>
      <View style={[SR.pastille, { backgroundColor: couleurRole(categorie) }]} />
      <Texte style={{ flex: 1 }}>{nom}</Texte>
      <Texte style={{ fontFamily: P.fort }}>{nb(grammes)} g</Texte>
    </View>
  );
}

/**
 * L'en-tête des boîtes.
 *
 * DEUX colonnes de poids, et les confondre ruine tout : la boîte contient de
 * quoi servir tout le monde, mais les macros du plan ne valent que pour UNE
 * personne. Sans la seconde, il faudrait recomposer le repas le jour du repas
 * pour savoir combien s'en servir — soit refaire tout le travail que le batch
 * cooking venait d'éviter.
 */
export function EnteteBoite() {
  return (
    <View style={SR.entete}>
      <Discret style={[SR.col, { flex: 2 }]}>aliment</Discret>
      <Discret style={SR.col}>boîte</Discret>
      <Discret style={SR.col}>1 pers.</Discret>
    </View>
  );
}

/**
 * Une ligne de boîte : l'aliment, ce qu'on y met, ce qu'on s'en sert.
 *
 * `attenue` est réservé à ce qui ne va PAS dans la boîte — le skyr qu'on
 * ajoute au moment de manger. Il se lit en gris, pastille comprise : c'est le
 * seul signal qui distingue « rangé cinq jours à l'avance » de « à sortir du
 * frigo le jour venu », et sans lui la boîte ne correspond plus au repas.
 */
export function LigneBoite({
  nom, categorie, assiette, parPersonne, attenue = false,
}: {
  nom: string;
  categorie: string;
  assiette: number;
  parPersonne: number;
  attenue?: boolean;
}) {
  const Cellule = attenue ? Discret : Texte;

  return (
    <View style={SR.ligneCourse}>
      <View style={[
        SR.pastille,
        { backgroundColor: attenue ? C.discret : couleurRole(categorie) },
      ]}
      />
      <Cellule style={{ flex: 2 }}>{nom}</Cellule>
      <Cellule style={[SR.col, { textAlign: 'right' }]}>{nb(assiette)} g</Cellule>
      <Cellule style={[SR.col, { textAlign: 'right', color: C.vif }]}>
        {nb(parPersonne)} g
      </Cellule>
    </View>
  );
}
