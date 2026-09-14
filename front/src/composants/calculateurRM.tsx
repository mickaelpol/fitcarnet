import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View,
} from 'react-native';
import { Bouton, Champ, Chiffre, Discret, Texte } from './base';
import { TablePaliers } from './disqueRM';
import {
  estimerDepuisEssai, paliersPour, pasConseille, PAS_DISPONIBLES, REPS_MAX_POUR_1RM,
} from '@/calcul/performance';
import { C, E, N, P, R, T, nb } from '@/theme';

/**
 * Calculateur de RM, ouvert DEPUIS l'exercice en cours.
 *
 * À la salle on ne quitte pas sa séance : on met du poids, on tente une
 * répétition, on ajuste. Cet écran remplace ce tâtonnement, et se referme
 * sur la séance.
 */
export function ModaleCalculateurRM({
  visible, nomExercice, rmConnu, onFermer,
}: {
  visible: boolean;
  nomExercice: string;
  /** 1RM déjà atteint sur cet exercice, comme point de départ */
  rmConnu: number | null;
  onFermer: () => void;
}) {
  const [poids, setPoids] = useState('');
  const [reps, setReps] = useState('');
  /* `null` = « je n'ai pas choisi », et c'est différent de « 2,5 kg ». Le pas
     par défaut se déduit du maximum : à 20 kg de 1RM, un pas de 2,5 kg faisait
     répéter trois fois « 15 kg » dans le tableau. Vide ≠ zéro, règle 6. */
  const [pasChoisi, setPasChoisi] = useState<number | null>(null);

  useEffect(() => {
    if (visible) { setPoids(''); setReps(''); setPasChoisi(null); }
  }, [visible]);

  const p = parseFloat(poids.replace(',', '.'));
  const r = parseInt(reps, 10);
  const saisi = !Number.isNaN(p) && !Number.isNaN(r) && p > 0 && r >= 1;
  const tropLong = !Number.isNaN(r) && r > REPS_MAX_POUR_1RM;

  const rm = saisi && !tropLong ? estimerDepuisEssai(p, r) : rmConnu;
  const estime = saisi && !tropLong;
  const pas = pasChoisi ?? (rm !== null ? pasConseille(rm) : PAS_DISPONIBLES[1]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFermer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Pressable style={s.fond} onPress={onFermer}>
          <Pressable style={s.boite} onPress={(e) => e.stopPropagation()}>
            <Texte style={s.titre}>Calculateur de RM</Texte>
            <Discret style={{ fontSize: T.normal }} numberOfLines={1}>{nomExercice}</Discret>

            <ScrollView style={{ marginTop: E.m }} keyboardShouldPersistTaps="handled">
              {/* Deux champs empilés : côte à côte, ils s'écrasaient au point
                  de masquer la charge sur un écran de téléphone. */}
              <View style={{ gap: E.s }}>
                <Champ
                  etiquette="J'ai soulevé"
                  valeur={poids} onChange={setPoids}
                  placeholder="40" unite="kg" numerique
                />
                <Champ
                  etiquette="Répétitions réussies"
                  valeur={reps} onChange={setReps}
                  placeholder="3" unite="rép" numerique
                />
              </View>

              {tropLong && (
                <Discret style={{ color: C.vif, fontSize: T.petit, marginTop: E.s, lineHeight: 17 }}>
                  Au-delà de {REPS_MAX_POUR_1RM} répétitions, on mesure l'endurance :
                  l'estimation perdrait son sens. Refais un essai plus lourd.
                </Discret>
              )}

              {rm !== null && (
                <>
                  <View style={s.resultat}>
                    <Chiffre taille={N.grand}>{nb(rm)}</Chiffre>
                    <Discret style={{ fontSize: T.petit }}>
                      kg au maximum{estime ? '' : ' · ton meilleur à ce jour'}
                    </Discret>
                  </View>

                  <View style={s.pas}>
                    <Discret style={{ fontSize: T.petit }}>Arrondi</Discret>
                    {PAS_DISPONIBLES.map((x) => (
                      <Pressable
                        key={x}
                        onPress={() => setPasChoisi(x)}
                        style={[s.pasBouton, pas === x && s.pasActif]}
                      >
                        <Discret style={pas === x ? { color: C.fond, fontFamily: P.fort } : undefined}>
                          {nb(x)} kg
                        </Discret>
                      </Pressable>
                    ))}
                  </View>

                  {/* La table vient de `disqueRM.tsx`, et c'est la même que
                      celle de la carte d'exercice. Cet écran en rendait une
                      autre, depuis une autre liste de pourcentages : c'est
                      exactement comme cela que les deux ont divergé. */}
                  <TablePaliers lignes={paliersPour(rm, pas)} />

                  <Discret style={s.note}>
                    Les répétitions sont une estimation — ton ressenti prime.
                  </Discret>
                </>
              )}

              {rm === null && !tropLong && (
                <Discret style={{ textAlign: 'center', marginTop: E.l, lineHeight: 18 }}>
                  Renseigne un essai réussi : la charge et le nombre de
                  répétitions que tu as tenues.
                </Discret>
              )}
            </ScrollView>

            <Bouton variante="contour" onPress={onFermer} style={{ marginTop: E.m }}>
              Fermer
            </Bouton>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  fond: {
    flex: 1, backgroundColor: C.voile,
    alignItems: 'center', justifyContent: 'center', padding: E.m,
  },
  boite: {
    backgroundColor: C.surface, borderRadius: R.l, borderWidth: 1, borderColor: C.ligne,
    padding: E.m, maxHeight: '86%', width: '100%', maxWidth: 480,
  },
  titre: { fontFamily: P.titre, fontSize: T.titre, letterSpacing: 0.8, textTransform: 'uppercase' },
  resultat: { alignItems: 'center', gap: 2, paddingVertical: E.m },
  pas: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: E.s },
  pasBouton: {
    flex: 1, minHeight: 36, borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
  },
  pasActif: { backgroundColor: C.vif, borderColor: C.vif },
  /* Les styles de tableau ont suivi le tableau dans `disqueRM.tsx` :
     les garder ici, c'était laisser de quoi le réécrire. */
  note: { fontSize: T.minuscule, marginTop: E.s, lineHeight: 15 },
});
