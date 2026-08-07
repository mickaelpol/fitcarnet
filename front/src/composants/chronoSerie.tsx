import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Chiffre, Discret, Texte } from './base';
import { useEcranEveille } from './ecranEveille';
import { C, E, P, R, TOUCHE } from '@/theme';

export const mmss = (s: number): string =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Chronomètre qui compte VERS LE HAUT, pour mesurer un effort.
 *
 * Deux usages : le temps d'une tenue isométrique, et le temps total d'un
 * « for time ». Dans les deux cas on démarre, on arrête, et le temps se
 * reporte dans le champ — plutôt que de le lire sur une montre et de le
 * ressaisir de mémoire.
 */
export function ChronoEffort({
  secondes, onChange, compact = false, etiquette, onEtatChange,
}: {
  secondes: number | null;
  onChange: (s: number) => void;
  compact?: boolean;
  etiquette?: string;
  /** prévient le parent qu'une mesure est en cours, pour éviter de la perdre */
  onEtatChange?: (enCours: boolean) => void;
}) {
  const [court, setCourt] = useState(false);
  const [ecoule, setEcoule] = useState(0);
  const depart = useRef<number>(0);
  const tic = useRef<ReturnType<typeof setInterval> | null>(null);

  useEcranEveille(court, 'effort');

  useEffect(() => {
    if (!court) return;

    depart.current = Date.now() - ecoule * 1000;
    tic.current = setInterval(() => {
      setEcoule(Math.floor((Date.now() - depart.current) / 1000));
    }, 250);

    return () => {
      if (tic.current) clearInterval(tic.current);
    };
  }, [court]);

  const basculer = () => {
    if (court) {
      setCourt(false);
      onEtatChange?.(false);
      onChange(ecoule);          // on reporte le temps mesuré
    } else {
      setEcoule(0);
      setCourt(true);
      onEtatChange?.(true);
    }
  };

  /* Si le composant disparaît alors qu'une mesure court — changement de mode,
     fermeture de l'exercice — le temps écoulé est sauvegardé plutôt que perdu. */
  const ecouleRef = useRef(0);
  ecouleRef.current = ecoule;
  const courtRef = useRef(false);
  courtRef.current = court;
  useEffect(() => () => {
    if (courtRef.current && ecouleRef.current > 0) {
      onChange(ecouleRef.current);
      onEtatChange?.(false);
    }
  }, []);

  const affiche = court ? ecoule : (secondes ?? 0);

  return (
    <View style={[s.barre, compact && { gap: 6 }]}>
      {etiquette !== undefined && !compact && (
        <Discret style={{ fontSize: 11 }}>{etiquette}</Discret>
      )}

      <Chiffre taille={compact ? 20 : 27} couleur={court ? C.vif : C.encre}>
        {mmss(affiche)}
      </Chiffre>

      <Pressable
        onPress={basculer}
        style={[s.bouton, court && s.boutonStop, compact && s.boutonCompact]}
        accessibilityLabel={court ? 'Arrêter le chronomètre' : 'Démarrer le chronomètre'}
      >
        <Texte style={{ color: C.fond, fontFamily: P.fort, fontSize: compact ? 12.5 : 14 }}>
          {court ? 'Stop' : '⏱ Go'}
        </Texte>
      </Pressable>

      {!court && affiche > 0 && (
        <Pressable onPress={() => onChange(0)} style={s.effacer}>
          <Discret style={{ fontSize: 15 }}>×</Discret>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  barre: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  bouton: {
    minWidth: 62, minHeight: TOUCHE, borderRadius: R.s, backgroundColor: C.ok,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: E.s,
  },
  boutonCompact: { minWidth: 52, minHeight: TOUCHE - 4 },
  boutonStop: { backgroundColor: C.erreur },
  effacer: {
    width: 32, minHeight: TOUCHE - 4, alignItems: 'center', justifyContent: 'center',
  },
});
