import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import DraggableFlatList, {
  type RenderItemParams, ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { Discret } from './base';
import { C, E, R, T, TOUCHE } from '@/theme';

/**
 * Version MOBILE : glisser-déposer natif de React Native.
 *
 * On maintient la poignée ⠿ et on déplace, avec le retour visuel habituel.
 * Le fichier jumeau listeDeplacable.web.tsx prend le relais sur le web, où
 * les attributs HTML draggable sont plus fiables que la simulation de
 * gestes tactiles à la souris.
 */
export function ListeDeplacable<T>({
  elements, cle, rendu, onReordonner, entete, pied,
}: {
  elements: T[];
  cle: (element: T, index: number) => string;
  rendu: (element: T, index: number, poignee: ReactNode) => ReactNode;
  onReordonner: (elements: T[]) => void;
  entete?: ReactNode;
  pied?: ReactNode;
  etiquette?: (element: T) => string;
}) {
  const deplacer = (index: number, sens: -1 | 1) => {
    const cible = index + sens;
    if (cible < 0 || cible >= elements.length) return;
    const suite = [...elements];
    [suite[index], suite[cible]] = [suite[cible]!, suite[index]!];
    onReordonner(suite);
  };

  const rendreLigne = ({ item, getIndex, drag, isActive }: RenderItemParams<T>) => {
    const index = getIndex() ?? 0;

    const poignee = (
      <View style={s.poignees}>
        <Pressable
          onLongPress={drag}
          delayLongPress={140}
          disabled={isActive}
          style={s.saisir}
          accessibilityLabel="Maintenir pour déplacer"
        >
          <Discret style={{ fontSize: T.grand, color: isActive ? C.vif : C.discret }}>⠿</Discret>
        </Pressable>
        <View>
          {/* 30 × 22 px plus 6 de marge de touche : 42 × 34, sous les 44 que
              `TOUCHE` impose au reste de l'application. On élargit la MARGE et
              non le bouton — la flèche reste discrète, la cible fait 44.
              Et « ▲ » seul n'est annoncé par aucun lecteur d'écran. */}
          <Pressable
            onPress={() => deplacer(index, -1)}
            style={s.fleche}
            hitSlop={{ top: 11, bottom: 11, left: 7, right: 7 }}
            accessibilityLabel="Monter d’une place"
          >
            <Discret style={{ fontSize: T.petit }}>▲</Discret>
          </Pressable>
          <Pressable
            onPress={() => deplacer(index, 1)}
            style={s.fleche}
            hitSlop={{ top: 11, bottom: 11, left: 7, right: 7 }}
            accessibilityLabel="Descendre d’une place"
          >
            <Discret style={{ fontSize: T.petit }}>▼</Discret>
          </Pressable>
        </View>
      </View>
    );

    return (
      <ScaleDecorator activeScale={1.03}>
        <View style={[s.ligne, isActive && s.actif]}>
          {rendu(item, index, poignee)}
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <DraggableFlatList
      data={elements}
      keyExtractor={cle}
      renderItem={rendreLigne}
      onDragEnd={({ data }) => onReordonner(data)}
      ListHeaderComponent={entete as never}
      ListFooterComponent={pied as never}
      contentContainerStyle={s.page}
      activationDistance={12}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const s = StyleSheet.create({
  page: { padding: E.m, paddingBottom: 150, maxWidth: 560, width: '100%', alignSelf: 'center' },
  ligne: { marginBottom: E.s },
  poignees: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  saisir: {
    width: 34, minHeight: TOUCHE, alignItems: 'center', justifyContent: 'center',
    borderRadius: R.s,
  },
  fleche: { width: 30, height: 22, alignItems: 'center', justifyContent: 'center' },
  actif: {
    borderRadius: R.m, shadowColor: C.ombre, shadowOpacity: 0.45,
    shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 9,
  },
});
