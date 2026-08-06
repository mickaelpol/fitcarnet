import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useCibles, useEnregistrerCible } from '@/api/hooks';
import type { Cible } from '@/api/types';
import { Bouton, Carte, Champ, Chargement, Discret, Erreur, Texte } from '@/composants/base';
import { C, E, P, R, TOUCHE, nb } from '@/theme';

const REPAS = [
  { cle: 'R1' as const, court: 'Matin', long: 'Petit-déjeuner' },
  { cle: 'R2' as const, court: 'Midi', long: 'Déjeuner' },
  { cle: 'R3' as const, court: '16 h', long: 'Collation' },
  { cle: 'R4' as const, court: 'Soir', long: 'Dîner' },
];

type Saisie = { prot: string; gluc: string; lip: string; kcal: string };
const vide: Saisie = { prot: '', gluc: '', lip: '', kcal: '' };

export default function Objectifs() {
  const router = useRouter();
  const cibles = useCibles();
  const enregistrer = useEnregistrerCible();
  const [repas, setRepas] = useState<'R1' | 'R2' | 'R3' | 'R4'>('R2');
  const [saisie, setSaisie] = useState<Saisie>(vide);

  const existante = (cibles.data ?? []).find((c) => c.repas === repas);

  /* On recharge les champs à chaque changement de repas. */
  useEffect(() => {
    setSaisie(existante
      ? {
          prot: String(existante.prot), gluc: String(existante.gluc),
          lip: String(existante.lip), kcal: String(Math.round(existante.kcal)),
        }
      : vide);
  }, [repas, existante?.id]);

  if (cibles.isLoading) return <Chargement />;
  if (cibles.isError) {
    return <Erreur message={cibles.error.message} onReessayer={() => void cibles.refetch()} />;
  }

  /* Les calories découlent des grammes : 4 / 4 / 9. On les recalcule dès
     qu'une macro change, sinon l'utilisateur affiche un objectif impossible. */
  const majMacro = (champ: 'prot' | 'gluc' | 'lip', valeur: string) => {
    const suite = { ...saisie, [champ]: valeur };
    const p = parseFloat(suite.prot); const g = parseFloat(suite.gluc); const l = parseFloat(suite.lip);
    if (![p, g, l].some(Number.isNaN)) suite.kcal = String(Math.round(4 * p + 4 * g + 9 * l));
    setSaisie(suite);
  };

  const valeurs = {
    prot: parseFloat(saisie.prot), gluc: parseFloat(saisie.gluc),
    lip: parseFloat(saisie.lip), kcal: parseFloat(saisie.kcal),
  };
  const valide = Object.values(valeurs).every((v) => !Number.isNaN(v) && v >= 0);
  const kcalDesMacros = valide ? 4 * valeurs.prot + 4 * valeurs.gluc + 9 * valeurs.lip : 0;
  const incoherent = valide && Math.abs(valeurs.kcal - kcalDesMacros) > 15;

  const valider = () => {
    if (!valide) return;
    enregistrer.mutate(
      existante
        ? ({ ...existante, ...valeurs } as Partial<Cible> & { repas: string })
        : ({ repas, ...valeurs } as Partial<Cible> & { repas: string }),
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: C.fond }}
    >
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <View style={s.seg}>
          {REPAS.map((r) => (
            <Pressable
              key={r.cle}
              onPress={() => setRepas(r.cle)}
              style={[s.segBouton, repas === r.cle && s.segActif]}
            >
              <Texte style={[s.segTexte, repas === r.cle && { color: C.fond }]}>{r.court}</Texte>
            </Pressable>
          ))}
        </View>

        <Carte style={{ gap: E.m }}>
          <Discret style={s.entete}>
            {REPAS.find((r) => r.cle === repas)?.long}
            {existante ? '' : ' · aucun objectif enregistré'}
          </Discret>

          <View style={s.paire}>
            <Champ etiquette="Protéines" valeur={saisie.prot} onChange={(v) => majMacro('prot', v)}
              unite="g" numerique placeholder="0" style={{ flex: 1 }} />
            <Champ etiquette="Glucides" valeur={saisie.gluc} onChange={(v) => majMacro('gluc', v)}
              unite="g" numerique placeholder="0" style={{ flex: 1 }} />
          </View>
          <View style={s.paire}>
            <Champ etiquette="Lipides" valeur={saisie.lip} onChange={(v) => majMacro('lip', v)}
              unite="g" numerique placeholder="0" style={{ flex: 1 }} />
            <Champ etiquette="Calories" valeur={saisie.kcal}
              onChange={(v) => setSaisie({ ...saisie, kcal: v })}
              unite="kcal" numerique placeholder="0" style={{ flex: 1 }} />
          </View>

          {incoherent && (
            <Discret style={{ color: C.vif, fontSize: 12.5 }}>
              Tes grammes représentent {nb(kcalDesMacros)} calories, pas {nb(valeurs.kcal)}.
              L'app respecte les grammes ; les calories suivent.
            </Discret>
          )}

          <Bouton onPress={valider} desactive={!valide || enregistrer.isPending}>
            {enregistrer.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Bouton>

          {enregistrer.isSuccess && (
            <Discret style={{ color: C.ok, fontSize: 12.5, textAlign: 'center' }}>
              Objectifs enregistrés.
            </Discret>
          )}
          {enregistrer.isError && (
            <Discret style={{ color: C.erreur, fontSize: 12.5 }}>{enregistrer.error.message}</Discret>
          )}
        </Carte>

        {/* rappel des quatre repas, pour se repérer d'un coup d'œil */}
        <Carte style={{ marginTop: E.m, gap: E.s }}>
          <Discret style={s.entete}>Mes quatre repas</Discret>
          {REPAS.map((r) => {
            const c = (cibles.data ?? []).find((x) => x.repas === r.cle);

            return (
              <View key={r.cle} style={s.recap}>
                <Texte style={{ flex: 1 }}>{r.long}</Texte>
                <Discret>
                  {c ? `${nb(c.prot)} P · ${nb(c.gluc)} G · ${nb(c.lip)} L` : 'à définir'}
                </Discret>
              </View>
            );
          })}
        </Carte>

        <Bouton variante="discret" onPress={() => router.back()} style={{ marginTop: E.m }}>
          Retour
        </Bouton>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { padding: E.m, paddingBottom: E.xl, maxWidth: 560, width: '100%', alignSelf: 'center' },
  seg: {
    flexDirection: 'row', backgroundColor: C.surface2, borderColor: C.ligne,
    borderWidth: 1, borderRadius: R.m, padding: 3, marginBottom: E.m,
  },
  segBouton: { flex: 1, minHeight: TOUCHE, alignItems: 'center', justifyContent: 'center', borderRadius: R.s },
  segActif: { backgroundColor: C.vif },
  segTexte: { fontFamily: P.chiffre, fontSize: 16, textTransform: 'uppercase', color: C.attenue },
  entete: { fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase' },
  paire: { flexDirection: 'row', gap: E.s },
  recap: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: E.xs,
    borderBottomWidth: 1, borderBottomColor: C.ligne,
  },
});
