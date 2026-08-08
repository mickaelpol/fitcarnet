import { type ReactNode, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Discret } from './base';
import { C, E, R, T, TOUCHE } from '@/theme';

/**
 * Version WEB : glisser-déposer natif du navigateur.
 *
 * On pose directement les attributs HTML draggable / onDragStart / onDrop,
 * comme le fait une page ordinaire. Deux points sont indispensables et
 * faciles à manquer :
 *
 *   1. dataTransfer.setData() DOIT être appelé au démarrage, sinon Firefox
 *      n'émet jamais l'événement de dépôt ;
 *   2. l'indice saisi transite par le dataTransfer plutôt que par l'état
 *      React, qui peut être périmé au moment du dépôt.
 *
 * Le fichier jumeau listeDeplacable.tsx sert sur mobile, avec le glisser
 * natif de React Native. Metro choisit selon la plateforme.
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
  const [saisi, setSaisi] = useState<number | null>(null);
  const [survole, setSurvole] = useState<number | null>(null);
  /* Filet de sécurité : certains navigateurs vident le dataTransfer
     en dehors du gestionnaire de dépôt. */
  const saisiRef = useRef<number | null>(null);

  const deplacer = (depuis: number, vers: number) => {
    if (Number.isNaN(depuis) || vers < 0 || vers >= elements.length || depuis === vers) return;
    const suite = [...elements];
    const [pris] = suite.splice(depuis, 1);
    suite.splice(vers, 0, pris!);
    onReordonner(suite);
  };

  const terminer = () => {
    setSaisi(null);
    setSurvole(null);
    saisiRef.current = null;
  };

  const poigneeDe = (index: number) => (
    <View style={s.poignees}>
      <View style={s.saisir}>
        <Discret style={{ fontSize: T.grand, color: saisi === index ? C.vif : C.discret }}>⠿</Discret>
      </View>
      <View>
        <Pressable onPress={() => deplacer(index, index - 1)} style={s.fleche} hitSlop={4}>
          <Discret style={{ fontSize: T.petit }}>▲</Discret>
        </Pressable>
        <Pressable onPress={() => deplacer(index, index + 1)} style={s.fleche} hitSlop={4}>
          <Discret style={{ fontSize: T.petit }}>▼</Discret>
        </Pressable>
      </View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      {entete}

      {elements.map((element, index) => {
        const enCours = saisi !== null;
        const cible = enCours && survole === index && saisi !== index;

        return (
          <div
            key={cle(element, index)}
            draggable
            onDragStart={(e: {
              dataTransfer: { setData: (t: string, v: string) => void; effectAllowed: string };
            }) => {
              // obligatoire : sans setData, Firefox n'émet aucun dépôt
              e.dataTransfer.setData('text/plain', String(index));
              e.dataTransfer.effectAllowed = 'move';
              saisiRef.current = index;
              setSaisi(index);
            }}
            onDragEnd={terminer}
            onDragEnter={(e: { preventDefault: () => void }) => {
              e.preventDefault();
              setSurvole(index);
            }}
            onDragOver={(e: {
              preventDefault: () => void;
              dataTransfer: { dropEffect: string };
            }) => {
              // sans preventDefault à CHAQUE survol, le dépôt reste interdit
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e: {
              preventDefault: () => void;
              dataTransfer: { getData: (t: string) => string };
            }) => {
              e.preventDefault();
              const lu = Number.parseInt(e.dataTransfer.getData('text/plain'), 10);
              const depuis = Number.isNaN(lu) ? saisiRef.current : lu;
              if (depuis !== null) deplacer(depuis, index);
              terminer();
            }}
            style={{
              cursor: enCours ? 'grabbing' : 'grab',
              opacity: saisi === index ? 0.35 : 1,
              outline: cible ? `2px solid ${C.vif}` : '2px solid transparent',
              outlineOffset: 2,
              borderRadius: R.m,
              marginBottom: E.s,
              transition: 'opacity 120ms, outline-color 120ms',
            }}
          >
            {rendu(element, index, poigneeDe(index))}
          </div>
        );
      })}

      {pied}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: E.m, paddingBottom: 150, maxWidth: 560, width: '100%', alignSelf: 'center' },
  poignees: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  saisir: {
    width: 34, minHeight: TOUCHE, alignItems: 'center', justifyContent: 'center',
    borderRadius: R.s,
  },
  fleche: { width: 30, height: 22, alignItems: 'center', justifyContent: 'center' },
});
