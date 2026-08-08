import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useCibles, useEnregistrerCible } from '@/api/hooks';
import type { Cible } from '@/api/types';
import { Bouton, Carte, Champ, Chargement, Discret, Erreur, Texte } from '@/composants/base';
import { convertir, fibresDouteuses } from '@/calcul/planCoach';
import { C, E, P, R, T, TOUCHE, nb } from '@/theme';

const REPAS = [
  { cle: 'R1' as const, court: 'Matin', long: 'Petit-déjeuner' },
  { cle: 'R2' as const, court: 'Midi', long: 'Déjeuner' },
  { cle: 'R3' as const, court: '16 h', long: 'Collation' },
  { cle: 'R4' as const, court: 'Soir', long: 'Dîner' },
];

type Saisie = { prot: string; gluc: string; lip: string; kcal: string };
const vide: Saisie = { prot: '', gluc: '', lip: '', kcal: '' };

/** Ce qu'on recopie d'un plan étranger, avant conversion. */
type Plan = { kcal: string; prot: string; gluc: string; lip: string; fibres: string };
const planVide: Plan = { kcal: '', prot: '', gluc: '', lip: '', fibres: '' };

const lire = (v: string): number => {
  const n = parseFloat(v.replace(',', '.'));

  return Number.isFinite(n) ? n : NaN;
};

export default function Objectifs() {
  const router = useRouter();
  const cibles = useCibles();
  const enregistrer = useEnregistrerCible();
  const [repas, setRepas] = useState<'R1' | 'R2' | 'R3' | 'R4'>('R2');
  const [saisie, setSaisie] = useState<Saisie>(vide);
  const [plan, setPlan] = useState<Plan>(planVide);
  const [convertisseur, setConvertisseur] = useState(false);
  const [totaux, setTotaux] = useState(false);

  const existante = (cibles.data ?? []).find((c) => c.repas === repas);

  /* On recharge les champs à chaque changement de repas. */
  useEffect(() => {
    setSaisie(existante
      ? {
          prot: String(existante.prot), gluc: String(existante.gluc),
          lip: String(existante.lip), kcal: String(Math.round(existante.kcal)),
        }
      : vide);
    setTotaux(existante?.glucidesTotaux === true);
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

  /* Le convertisseur ne fait qu'une chose : retrancher les fibres des
     glucides. C'est là qu'est le piège d'un plan américain, et nulle part
     ailleurs — protéines et lipides ne dépendent d'aucune convention. */
  const chiffresPlan = {
    kcal: lire(plan.kcal), prot: lire(plan.prot),
    glucides: lire(plan.gluc), lipides: lire(plan.lip), fibres: lire(plan.fibres),
  };
  const planLisible = Object.values(chiffresPlan).every((v) => !Number.isNaN(v) && v >= 0);
  const converti = planLisible ? convertir(chiffresPlan) : null;
  const fibresSuspectes = planLisible && fibresDouteuses(chiffresPlan);

  const appliquerConversion = () => {
    if (converti === null) return;
    /* En mode « glucides totaux », le chiffre du plan se reporte TEL QUEL :
       c'est le calculateur qui ajoutera les fibres réelles des aliments. Y
       retrancher les fibres déclarées le rabaisserait deux fois. */
    setSaisie({
      prot: String(converti.prot),
      gluc: String(totaux ? chiffresPlan.glucides : converti.gluc),
      lip: String(converti.lip), kcal: String(converti.kcal),
    });
    setConvertisseur(false);
  };

  const valider = () => {
    if (!valide) return;
    enregistrer.mutate(
      existante
        ? ({ ...existante, ...valeurs, glucidesTotaux: totaux } as Partial<Cible> & { repas: string })
        : ({ repas, ...valeurs, glucidesTotaux: totaux } as Partial<Cible> & { repas: string }),
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

          <Pressable onPress={() => setTotaux(!totaux)} style={s.coche}>
            <View style={[s.carre, totaux && { backgroundColor: C.ok, borderColor: C.ok }]}>
              {totaux && <Texte style={{ color: C.fond, fontSize: T.petit }}>✓</Texte>}
            </View>
            <View style={{ flex: 1 }}>
              <Texte style={{ fontSize: T.normal }}>Glucides fibres comprises</Texte>
              <Discret style={{ fontSize: T.petit, lineHeight: 18 }}>
                {totaux
                  ? 'Chiffre d\'un plan nord-américain, recopié tel quel. Le calculateur '
                    + 'y ajoutera les fibres réelles de tes aliments.'
                  : 'Convention française : les fibres sont comptées à part, comme sur '
                    + 'tes étiquettes.'}
              </Discret>
            </View>
          </Pressable>

          <Pressable onPress={() => setConvertisseur(!convertisseur)} style={s.replier}>
            <Discret style={{ color: C.vif, fontSize: T.normal }}>
              {convertisseur ? '▲' : '▼'} Recopier depuis un plan américain
            </Discret>
          </Pressable>

          {convertisseur && (
            <View style={s.convertisseur}>
              <Discret style={{ fontSize: T.petit, lineHeight: 18 }}>
                Les plans américains — MyFitnessPal, USDA, la plupart des coachs
                anglophones — comptent les fibres DANS les glucides. Les étiquettes
                françaises et cette application les comptent à part. Recopie les
                chiffres tels qu'ils sont imprimés : la conversion est faite ici.
              </Discret>

              <View style={s.paire}>
                <Champ etiquette="Protéines" valeur={plan.prot}
                  onChange={(v) => setPlan({ ...plan, prot: v })}
                  unite="g" numerique placeholder="0" style={{ flex: 1 }} />
                <Champ etiquette="Glucides totaux" valeur={plan.gluc}
                  onChange={(v) => setPlan({ ...plan, gluc: v })}
                  unite="g" numerique placeholder="0" style={{ flex: 1 }} />
              </View>
              <View style={s.paire}>
                <Champ etiquette="Lipides" valeur={plan.lip}
                  onChange={(v) => setPlan({ ...plan, lip: v })}
                  unite="g" numerique placeholder="0" style={{ flex: 1 }} />
                <Champ etiquette="Fibres" valeur={plan.fibres}
                  onChange={(v) => setPlan({ ...plan, fibres: v })}
                  unite="g" numerique placeholder="0" style={{ flex: 1 }} />
              </View>
              <Champ etiquette="Calories du plan" valeur={plan.kcal}
                onChange={(v) => setPlan({ ...plan, kcal: v })}
                unite="kcal" numerique placeholder="0" />

              {converti !== null && (
                <>
                  <Discret style={{ fontSize: T.petit, lineHeight: 18 }}>
                    En convention française : <Texte style={{ fontFamily: P.fort }}>
                      {nb(converti.prot)} P · {nb(converti.gluc)} G · {nb(converti.lip)} L
                      · {converti.kcal} kcal
                    </Texte>
                    {'\n'}Les {nb(converti.fibres)} g de fibres sortent des glucides ; elles
                    restent comptées à 2 kcal, d'où {converti.kcal} kcal au lieu des
                    {' '}{converti.kcalAnnoncees} annoncées.
                  </Discret>

                  {fibresSuspectes && (
                    <Discret style={{ color: C.vif, fontSize: T.petit, lineHeight: 18 }}>
                      ⚠ {nb(chiffresPlan.fibres)} g de fibres pour {nb(chiffresPlan.glucides)} g
                      de glucides : c'est peu, et beaucoup de plans ne les comptent qu'à
                      moitié. Vérifie ce chiffre auprès de ton coach — s'il est
                      sous-estimé, les glucides convertis resteront trop hauts.
                    </Discret>
                  )}

                  <Bouton variante="contour" onPress={appliquerConversion}>
                    Reporter dans les objectifs
                  </Bouton>
                </>
              )}
            </View>
          )}

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
            <Discret style={{ color: C.vif, fontSize: T.normal }}>
              Tes grammes représentent {nb(kcalDesMacros)} calories, pas {nb(valeurs.kcal)}.
              L'app respecte les grammes ; les calories suivent.
            </Discret>
          )}

          <Bouton onPress={valider} desactive={!valide || enregistrer.isPending}>
            {enregistrer.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Bouton>

          {enregistrer.isSuccess && (
            <Discret style={{ color: C.ok, fontSize: T.normal, textAlign: 'center' }}>
              Objectifs enregistrés.
            </Discret>
          )}
          {enregistrer.isError && (
            <Discret style={{ color: C.erreur, fontSize: T.normal }}>{enregistrer.error.message}</Discret>
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
  segTexte: { fontFamily: P.chiffre, fontSize: T.moyen, textTransform: 'uppercase', color: C.attenue },
  entete: { fontSize: T.minuscule, letterSpacing: 1, textTransform: 'uppercase' },
  paire: { flexDirection: 'row', gap: E.s },
  replier: { minHeight: TOUCHE, justifyContent: 'center' },
  coche: { flexDirection: 'row', alignItems: 'flex-start', gap: E.s, paddingVertical: E.xs },
  carre: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.ligne,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  convertisseur: {
    gap: E.s, padding: E.s, borderRadius: R.s,
    borderWidth: 1, borderColor: C.vifBord, backgroundColor: C.vifVoile,
  },
  recap: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: E.xs,
    borderBottomWidth: 1, borderBottomColor: C.ligne,
  },
});
