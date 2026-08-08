import { useEffect, useReducer } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Discret, Texte } from './base';
import { Chiffre } from './base';
import { mmss } from './chronoSerie';
import { useEcranEveille } from './ecranEveille';
import { abonnerMesure, arreterMesure, cibleMesuree, ecouleMesure } from './etatMesure';
import { C, E, N, P, R, T, TOUCHE } from '@/theme';

/**
 * Bandeau « mesure en cours », en haut de l'écran de séance.
 *
 * Il existe parce que le chronomètre d'effort peut désormais tourner alors que
 * son champ n'est plus à l'écran — mode changé, exercice replié, séance
 * défilée. Sans repère fixe, une tenue se poursuivrait sans qu'on le sache, et
 * le temps enregistré serait faux.
 *
 * Il porte aussi le verrou d'écran : c'est le seul élément qui reste monté
 * pendant toute la mesure.
 */
export function BandeauMesure() {
  const [, redessiner] = useReducer((n: number) => n + 1, 0);
  const cible = cibleMesuree();
  const court = cible !== null;

  useEffect(() => abonnerMesure(redessiner), []);

  useEcranEveille(court, 'effort');

  useEffect(() => {
    if (!court) return;
    const tic = setInterval(redessiner, 250);

    return () => { clearInterval(tic); };
  }, [court]);

  if (cible === null) return null;

  return (
    <View style={s.bandeau}>
      <View style={s.point} />

      <View style={{ flex: 1 }}>
        <Texte style={{ fontSize: T.normal, fontFamily: P.fort }} numberOfLines={1}>
          {cible.libelle}
        </Texte>
        <Discret style={{ fontSize: T.petit }}>
          {cible.serieOrdre === null
            ? 'temps total de l’exercice'
            : `série ${cible.serieOrdre + 1}`}
        </Discret>
      </View>

      <Chiffre taille={N.normal} couleur={C.vif}>{mmss(ecouleMesure())}</Chiffre>

      <Pressable onPress={arreterMesure} style={s.stop} accessibilityLabel="Arrêter la mesure">
        <Texte style={{ color: C.fond, fontFamily: P.fort, fontSize: T.normal }}>Stop</Texte>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bandeau: {
    flexDirection: 'row', alignItems: 'center', gap: E.s,
    paddingHorizontal: E.m, paddingVertical: E.s,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.vif,
  },
  point: { width: 8, height: 8, borderRadius: 5, backgroundColor: C.erreur },
  stop: {
    minWidth: 58, minHeight: TOUCHE - 6, borderRadius: R.s, backgroundColor: C.erreur,
    alignItems: 'center', justifyContent: 'center',
  },
});
