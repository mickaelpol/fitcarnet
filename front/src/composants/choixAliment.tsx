import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Bouton, Champ, Discret, Texte } from './base';
import { ChoixMuscle } from './choixMuscle';
import { dansLeGroupe } from '@/muscles/groupes';
import { C, E, P, R, T, TOUCHE } from '@/theme';

interface Element {
  id: number;
  nom: string;
  detail?: string;
  couleur?: string;
  /**
   * Le muscle visé, tel que la base l'écrit — `pectorals`, `lats`.
   *
   * Présent pour les exercices, absent pour les aliments : c'est ce champ, et
   * lui seul, qui décide si la rangée de vignettes s'affiche. Pas un drapeau
   * en plus à tenir cohérent avec les données.
   */
  muscle?: string | null;
}

/**
 * Sélecteur avec recherche, insensible à la casse et aux accents.
 * Une liste déroulante native devient inutilisable au-delà de vingt entrées.
 */
export function ChoixDansListe({
  visible, titre, elements, onChoisir, onFermer,
}: {
  visible: boolean;
  titre: string;
  elements: Element[];
  onChoisir: (id: number) => void;
  onFermer: () => void;
}) {
  const [recherche, setRecherche] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);

  /* LE FILTRE NE SURVIT PAS À LA FERMETURE. Rouvrir la liste en la trouvant
     déjà réduite à quatorze exercices, sans savoir pourquoi, se lit comme un
     catalogue amputé — c'est le genre d'état invisible qu'on met dix minutes
     à comprendre. */
  const fermer = () => { setRecherche(''); setMuscle(null); onFermer(); };

  /* La rangée n'apparaît que si les éléments portent un muscle : les aliments
     n'en ont pas, et le même composant les sert. */
  const avecMuscles = elements.some((e) => e.muscle !== undefined);

  const sansAccent = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const filtres = useMemo(() => {
    const q = sansAccent(recherche.trim());

    /* LES DEUX FILTRES SE CUMULENT. On choisit « Dos », puis on tape
       « traction » : la recherche texte porte alors sur 169 exercices au lieu
       de 1338. C'est l'usage réel — la vignette dégrossit, le mot précise. */
    return elements.filter((e) => {
      if (muscle !== null && !dansLeGroupe(e.muscle, muscle)) return false;

      return q === '' || sansAccent(e.nom).includes(q);
    });
  }, [elements, recherche, muscle]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onFermer}>
      {/* le fond ferme au tap ; la feuille l'absorbe pour ne pas se fermer
          quand on tape à l'intérieur */}
      <Pressable style={s.fond} onPress={fermer}>
        <Pressable style={s.feuille} onPress={(e) => e.stopPropagation()}>
          <Texte style={s.titre}>{titre}</Texte>
          {/* LES VIGNETTES D'ABORD, LE CHAMP ENSUITE — ET SEULEMENT APRÈS.
              Les deux affichés côte à côte se lisent comme deux façons de
              faire la même chose, et on ne sait pas laquelle est la bonne. Ils
              ne font pourtant pas le même travail : la vignette dégrossit
              1338 exercices à cent cinquante, le mot trouve le bon parmi eux.
              On les met donc dans cet ordre plutôt que de choisir entre eux —
              le champ apparaît quand il a quelque chose à filtrer.

              POUR LES ALIMENTS, RIEN NE CHANGE : ils n'ont pas de muscle,
              `avecMuscles` est faux, et le champ s'affiche d'emblée comme
              avant. */}
          {avecMuscles && (
            <ChoixMuscle
              choisi={muscle}
              /* CHANGER DE MUSCLE EFFACE LE MOT CHERCHÉ. Sans ça, on tape
                 « incliné » dans les pectoraux, on passe au dos, et la liste
                 est vide — le champ est plus haut, à moitié caché par les
                 vignettes, et on cherche pendant une minute pourquoi le dos
                 n'a aucun exercice. */
              onChoisir={(cle) => { setMuscle(cle); setRecherche(''); }}
            />
          )}

          {(!avecMuscles || muscle !== null) && (
            <Champ
              valeur={recherche}
              onChange={setRecherche}
              placeholder="Rechercher…"
            />
          )}
          <FlatList
            data={filtres}
            keyExtractor={(e) => String(e.id)}
            /* C'EST LA LISTE QUI DOIT CÉDER, PAS LA RANGÉE DE VIGNETTES.
               Sans `flexShrink`, react-native-web répartit la compression sur
               tous les enfants de la feuille — et la rangée, haute de 73 px,
               disparaissait avant la liste qui en fait 500. On désigne
               explicitement celui qui donne. */
            style={{ marginTop: E.s, flexShrink: 1, minHeight: 0 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              /* ON DIT POURQUOI C'EST VIDE. « Aucun résultat » sous une
                 vignette qu'on vient d'appuyer laisse croire que le filtre
                 est cassé. Nommer les deux critères montre lequel relâcher. */
              <Discret style={{ padding: E.l, textAlign: 'center' }}>
                {muscle !== null && recherche.trim() !== ''
                  ? 'Aucun exercice pour ce muscle avec ce mot.'
                  : 'Aucun résultat.'}
              </Discret>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { onChoisir(item.id); setRecherche(''); onFermer(); }}
                style={({ pressed }) => [s.ligne, pressed && { opacity: 0.7 }]}
              >
                {item.couleur !== undefined && (
                  <View style={[s.pastille, { backgroundColor: item.couleur }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Texte numberOfLines={1}>{item.nom}</Texte>
                  {item.detail !== undefined && item.detail !== '' && (
                    <Discret style={{ fontSize: T.petit }}>{item.detail}</Discret>
                  )}
                </View>
              </Pressable>
            )}
          />
          <Bouton variante="contour" onPress={fermer}>Annuler</Bouton>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  fond: { flex: 1, backgroundColor: C.voile, justifyContent: 'flex-end' },
  feuille: {
    backgroundColor: C.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    padding: E.m, paddingBottom: E.xl, maxHeight: '82%', width: '100%',
    maxWidth: 560, alignSelf: 'center', gap: E.s,
  },
  titre: { fontFamily: P.titre, fontSize: T.grand, letterSpacing: 1, textTransform: 'uppercase' },
  ligne: {
    flexDirection: 'row', alignItems: 'center', gap: E.m, minHeight: TOUCHE + 6,
    paddingHorizontal: E.s, borderBottomWidth: 1, borderBottomColor: C.ligne,
  },
  pastille: { width: 4, height: 26, borderRadius: 3 },
});
