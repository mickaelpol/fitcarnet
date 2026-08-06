import { Pressable, StyleSheet, View } from 'react-native';
import type { Serie } from '@/api/types';
import { Champ, Discret, Texte } from './base';
import { ChronoEffort } from './chronoSerie';
import { C, E, R, TOUCHE, nb } from '@/theme';

/** « 42 » ou « 1:20 » -> secondes. */
export const versSecondes = (t: string): number | null => {
  const s = t.trim();
  if (!s) return null;
  if (s.includes(':')) {
    const [m, sec] = s.split(':');

    return (parseInt(m ?? '0', 10) || 0) * 60 + (parseInt(sec ?? '0', 10) || 0);
  }

  return parseInt(s, 10) || 0;
};

export const versTemps = (s: number | null): string =>
  s === null ? '' : s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);

/**
 * Une série. Cocher la remplit avec l'objectif si les champs sont vides,
 * puis relance le repos : c'est le geste le plus fréquent en salle.
 */
export function LigneSerie({
  serie, mode, index, onChange, onSupprimer, onCochee, onChronoChange,
}: {
  serie: Serie;
  mode: 'charge' | 'iso' | 'chrono';
  index: number;
  onChange: (s: Serie) => void;
  onSupprimer: () => void;
  onCochee: () => void;
  onChronoChange?: (enCours: boolean) => void;
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
          {serie.faite && <Texte style={{ color: C.fond, fontSize: 12 }}>✓</Texte>}
        </View>
      </Pressable>

      {/* En « for time » comme en charge, on note ce qu'on a soulevé :
          c'est ce détail qui montre la progression sur une série longue. */}
      {(mode === 'charge' || mode === 'chrono') && (
        <>
          <Champ
            valeur={serie.reps === null ? '' : String(serie.reps)}
            onChange={(v) => onChange({ ...serie, reps: v === '' ? null : parseInt(v, 10) || 0 })}
            placeholder={serie.repsCible === null ? '—' : String(serie.repsCible)}
            unite="rép" numerique style={{ flex: 1 }}
          />
          <Champ
            valeur={serie.poids === null ? '' : String(serie.poids)}
            onChange={(v) => onChange({ ...serie, poids: v === '' ? null : parseFloat(v.replace(',', '.')) || 0 })}
            placeholder={serie.poidsCible === null ? '—' : nb(serie.poidsCible)}
            unite="kg" numerique style={{ flex: 1 }}
          />
        </>
      )}

      {/* L'isométrie se mesure série par série : un chrono par ligne. */}
      {mode === 'iso' && (
        <View style={{ flex: 1 }}>
          <ChronoEffort
            secondes={serie.secondes}
            onChange={(sec) => onChange({ ...serie, secondes: sec })}
            onEtatChange={onChronoChange}
            compact
          />
        </View>
      )}

      <Pressable onPress={onSupprimer} style={s.sup}>
        <Discret style={{ fontSize: 17 }}>×</Discret>
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
