import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View,
} from 'react-native';
import { Bouton, Champ, Chiffre, Discret, Texte } from './base';
import {
  arrondirCharge, estimerDepuisEssai, PALIERS, repsAu, REPS_MAX_POUR_1RM,
} from '@/calcul/performance';
import { C, E, P, R, nb } from '@/theme';

const PAS = [1, 2.5, 5] as const;

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
  const [pas, setPas] = useState<number>(2.5);

  useEffect(() => {
    if (visible) { setPoids(''); setReps(''); }
  }, [visible]);

  const p = parseFloat(poids.replace(',', '.'));
  const r = parseInt(reps, 10);
  const saisi = !Number.isNaN(p) && !Number.isNaN(r) && p > 0 && r >= 1;
  const tropLong = !Number.isNaN(r) && r > REPS_MAX_POUR_1RM;

  const rm = saisi && !tropLong ? estimerDepuisEssai(p, r) : rmConnu;
  const estime = saisi && !tropLong;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFermer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Pressable style={s.fond} onPress={onFermer}>
          <Pressable style={s.boite} onPress={(e) => e.stopPropagation()}>
            <Texte style={s.titre}>Calculateur de RM</Texte>
            <Discret style={{ fontSize: 12.5 }} numberOfLines={1}>{nomExercice}</Discret>

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
                <Discret style={{ color: C.vif, fontSize: 12, marginTop: E.s, lineHeight: 17 }}>
                  Au-delà de {REPS_MAX_POUR_1RM} répétitions, on mesure l'endurance :
                  l'estimation perdrait son sens. Refais un essai plus lourd.
                </Discret>
              )}

              {rm !== null && (
                <>
                  <View style={s.resultat}>
                    <Chiffre taille={38}>{nb(rm)}</Chiffre>
                    <Discret style={{ fontSize: 11.5 }}>
                      kg au maximum{estime ? '' : ' · ton meilleur à ce jour'}
                    </Discret>
                  </View>

                  <View style={s.pas}>
                    <Discret style={{ fontSize: 11.5 }}>Arrondi</Discret>
                    {PAS.map((x) => (
                      <Pressable
                        key={x}
                        onPress={() => setPas(x)}
                        style={[s.pasBouton, pas === x && s.pasActif]}
                      >
                        <Discret style={pas === x ? { color: C.fond, fontFamily: P.fort } : undefined}>
                          {x} kg
                        </Discret>
                      </Pressable>
                    ))}
                  </View>

                  <View style={s.table}>
                    <View style={s.entete}>
                      <Discret style={[s.col, s.colPct]}>%</Discret>
                      <Discret style={[s.col, s.colKg]}>Charge</Discret>
                      <Discret style={[s.col, s.colRep]}>Répétitions</Discret>
                    </View>
                    {PALIERS.map((pct) => {
                      const charge = arrondirCharge((rm * pct) / 100, pas);
                      const zone = pct >= 70 && pct <= 80;

                      return (
                        <View key={pct} style={[s.ligne, zone && s.zone]}>
                          <Texte style={[s.col, s.colPct, s.valeur]}>{pct} %</Texte>
                          <Texte style={[s.col, s.colKg, s.valeur, zone && { color: C.vif }]}>
                            {nb(charge)} kg
                          </Texte>
                          <Texte style={[s.col, s.colRep, s.valeur]}>{repsAu(pct)}</Texte>
                        </View>
                      );
                    })}
                  </View>

                  <Discret style={s.note}>
                    Zone surlignée : 70 à 80 %, le compromis volume / intensité.
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
    flex: 1, backgroundColor: 'rgba(10,11,13,0.78)',
    alignItems: 'center', justifyContent: 'center', padding: E.m,
  },
  boite: {
    backgroundColor: C.surface, borderRadius: R.l, borderWidth: 1, borderColor: C.ligne,
    padding: E.m, maxHeight: '86%', width: '100%', maxWidth: 480,
  },
  titre: { fontFamily: P.titre, fontSize: 20, letterSpacing: 0.8, textTransform: 'uppercase' },
  resultat: { alignItems: 'center', gap: 2, paddingVertical: E.m },
  pas: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: E.s },
  pasBouton: {
    flex: 1, minHeight: 36, borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
  },
  pasActif: { backgroundColor: C.vif, borderColor: C.vif },
  table: { backgroundColor: C.surface2, borderRadius: R.s, padding: E.s },
  entete: { flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.ligne },
  ligne: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: 'rgba(47,52,61,0.5)',
  },
  zone: { backgroundColor: 'rgba(227,178,60,0.08)', borderRadius: 5 },
  col: { fontSize: 11.5 },
  colPct: { flex: 1 },
  colKg: { flex: 1, textAlign: 'right' },
  colRep: { flex: 1, textAlign: 'right' },
  valeur: { fontFamily: P.chiffre, fontSize: 15, fontVariant: ['tabular-nums'] },
  note: { fontSize: 10.5, marginTop: E.s, lineHeight: 15 },
});
