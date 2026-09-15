import { Pressable, StyleSheet, View } from 'react-native';
import type { Serie } from '@/api/types';
import { Discret, Texte } from './base';
import { ChampNombre } from './champNombre';
import { ChronoEffort } from './chronoSerie';
import { texteDuNombre } from '@/calcul/saisieNombre';
import type { CibleMesure } from './etatMesure';
import { C, E, R, T, TOUCHE } from '@/theme';

/**
 * Une série. Cocher la remplit avec l'objectif si les champs sont vides,
 * puis relance le repos : c'est le geste le plus fréquent en salle.
 */
export function LigneSerie({
  serie, mode, index, cible, onChange, onSupprimer, onCochee,
}: {
  serie: Serie;
  mode: 'charge' | 'iso' | 'chrono';
  index: number;
  /** ce que vise le chronomètre de cette ligne */
  cible: CibleMesure;
  onChange: (s: Serie) => void;
  onSupprimer: () => void;
  onCochee: () => void;
}) {
  const cocher = () => {
    const suite: Serie = { ...serie, faite: !serie.faite };
    if (suite.faite) {
      if (serie.reps === null && serie.repsCible !== null) suite.reps = serie.repsCible;
      if (serie.poids === null && serie.poidsCible !== null) suite.poids = serie.poidsCible;
      if (serie.secondes === null && serie.secondesCible !== null) suite.secondes = serie.secondesCible;
    }
    onChange(suite);
    if (suite.faite) onCochee();
  };

  return (
    <View style={[s.ligne, serie.faite && s.faite]}>
      <Pressable onPress={cocher} style={s.case_} accessibilityLabel={`Série ${index + 1} faite`}>
        <View style={[s.carre, serie.faite && { backgroundColor: C.ok, borderColor: C.ok }]}>
          {serie.faite && <Texte style={{ color: C.fond, fontSize: T.petit }}>✓</Texte>}
        </View>
      </Pressable>

      {/* En « for time » comme en charge, on note ce qu'on a soulevé :
          c'est ce détail qui montre la progression sur une série longue. */}
      {(mode === 'charge' || mode === 'chrono') && (
        <>
          {/* `ChampNombre` ET NON `Champ` + `String(serie.poids)` : piloté par le
              nombre, ce champ effaçait la virgule pendant la frappe, et 42,5 kg
              s'enregistraient 425 kg — prouvé sur émulateur Android le
              15 septembre 2026. Et `|| 0` faisait d'une saisie illisible un zéro. */}
          <ChampNombre
            valeur={serie.reps}
            onChange={(n) => onChange({ ...serie, reps: n })}
            entier
            placeholder={serie.repsCible === null ? '—' : String(serie.repsCible)}
            unite="rép" style={{ flex: 1 }}
          />
          <ChampNombre
            valeur={serie.poids}
            onChange={(n) => onChange({ ...serie, poids: n })}
            placeholder={serie.poidsCible === null ? '—' : texteDuNombre(serie.poidsCible)}
            unite="kg" style={{ flex: 1 }}
          />
        </>
      )}

      {/* L'isométrie se mesure série par série : un chrono par ligne. */}
      {mode === 'iso' && (
        <View style={{ flex: 1 }}>
          <ChronoEffort
            cible={cible}
            secondes={serie.secondes}
            onEffacer={() => onChange({ ...serie, secondes: null })}
            compact
          />
        </View>
      )}

      {/* Le libellé n'est pas décoratif : un lecteur d'écran annonce « × »
          comme « signe multiplication », ou ne dit rien. La case à cocher
          voisine en a un depuis le début ; celui-ci manquait. */}
      <Pressable
        onPress={onSupprimer}
        style={s.sup}
        accessibilityLabel={`Supprimer la série ${index + 1}`}
      >
        <Discret style={{ fontSize: T.grand }}>×</Discret>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  faite: { opacity: 0.72 },
  case_: { width: 32, minHeight: TOUCHE, alignItems: 'center', justifyContent: 'center' },
  carre: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.ligne,
    alignItems: 'center', justifyContent: 'center',
  },
  sup: { width: 32, minHeight: TOUCHE, alignItems: 'center', justifyContent: 'center' },
});
