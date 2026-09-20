import { useEffect, useReducer } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { mmss } from '@/calcul/affichageCourt';
import { Chiffre, Discret, Texte } from './base';
import {
  type CibleMesure, abonnerMesure, arreterMesure, demarrerMesure, ecouleMesure, mesureSur,
} from './etatMesure';
import { C, E, N, P, R, T, TOUCHE } from '@/theme';

/**
 * Chronomètre qui compte VERS LE HAUT, pour mesurer un effort.
 *
 * Deux usages : le temps d'une tenue isométrique, et le temps total d'un
 * « for time ». Dans les deux cas on démarre, on arrête, et le temps se
 * reporte dans le champ — plutôt que de le lire sur une montre et de le
 * ressaisir de mémoire.
 *
 * Le composant ne DÉTIENT pas la mesure : elle vit dans `etatMesure`, pour
 * qu'un changement de mode ne l'interrompe pas. Ici on affiche, on démarre, on
 * arrête. Le temps est écrit par l'écran de séance, qui seul détient l'état.
 */
export function ChronoEffort({
  cible, secondes, onEffacer, compact = false, etiquette,
}: {
  /** ce que cette mesure vise : l'exercice entier, ou une série précise */
  cible: CibleMesure;
  /** temps déjà enregistré, affiché quand rien ne tourne */
  secondes: number | null;
  /** remet le temps enregistré à zéro */
  onEffacer: () => void;
  compact?: boolean;
  etiquette?: string;
}) {
  const [, redessiner] = useReducer((n: number) => n + 1, 0);
  const court = mesureSur(cible.blocOrdre, cible.serieOrdre);

  useEffect(() => abonnerMesure(redessiner), []);

  /* Le battement n'existe que pendant l'affichage. Le décompte, lui, se déduit
     de l'heure de départ : il n'a besoin de personne pour avancer. */
  useEffect(() => {
    if (!court) return;
    const tic = setInterval(redessiner, 250);

    return () => { clearInterval(tic); };
  }, [court]);

  const affiche = court ? ecouleMesure() : (secondes ?? 0);

  return (
    <View style={[s.barre, compact && { gap: 6 }]}>
      {etiquette !== undefined && !compact && (
        <Discret style={{ fontSize: T.petit }}>{etiquette}</Discret>
      )}

      <Chiffre taille={compact ? N.petit : N.normal} couleur={court ? C.vif : C.encre}>
        {mmss(affiche)}
      </Chiffre>

      <Pressable
        onPress={() => (court ? arreterMesure() : demarrerMesure(cible))}
        style={[s.bouton, court && s.boutonStop, compact && s.boutonCompact]}
        accessibilityLabel={court ? 'Arrêter le chronomètre' : 'Démarrer le chronomètre'}
      >
        <Texte style={{ color: C.fond, fontFamily: P.fort, fontSize: compact ? T.petit : T.petit }}>
          {court ? 'Stop' : '⏱ Go'}
        </Texte>
      </Pressable>

      {/* Libellé absent, et cible à 40 px au lieu des 44 que le thème
          s'impose : le `hitSlop` rattrape les 4 px sans rien déplacer. */}
      {!court && affiche > 0 && (
        <Pressable
          onPress={onEffacer}
          style={s.effacer}
          hitSlop={2}
          accessibilityLabel="Effacer le temps mesuré"
        >
          <Discret style={{ fontSize: T.moyen }}>×</Discret>
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
