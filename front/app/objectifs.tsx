import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  NOM_LONG_REPAS, NOM_REPAS, REPAS as LISTE_REPAS,
} from '@/solveur/repasVocabulaire';
import { useCibles, useEnregistrerCible } from '@/api/hooks';
import type { Cible } from '@/api/types';
import { nombreSaisi } from '@/calcul/saisieNombre';
import { Bouton, Carte, Champ, Chargement, Discret, Erreur, Texte } from '@/composants/base';
import { convertir, fibresDouteuses } from '@/calcul/planCoach';
/* La formule des calories ne se recopie pas : elle vit dans le solveur, qui
   tient ses coefficients de `src/calcul/nutrition.ts`. L'alias `@/` est sans
   danger ici — `app/` n'est jamais compilé vers `dist-tests/`. */
import {
  SEUIL_COHERENCE, bornesDeCoherence, ecartDeCoherence, kcalDesMacros,
} from '@/solveur/solveur';
import { C, E, P, R, T, TOUCHE, nb } from '@/theme';

/* LES NOMS VIENNENT DU VOCABULAIRE, ILS NE SE REECRIVENT PAS. Cette table
   portait ses propres libelles, dont la colonne courte recopiait `NOM_REPAS`
   mot pour mot : renommer « 16 h » en « Collation » dans le calculateur aurait
   donne deux noms pour le meme repas dans la meme application. Rassembles le
   20 septembre 2026. */
const REPAS = LISTE_REPAS.map((cle) => ({
  cle, court: NOM_REPAS[cle], long: NOM_LONG_REPAS[cle],
}));

type Saisie = { prot: string; gluc: string; lip: string; kcal: string };
const vide: Saisie = { prot: '', gluc: '', lip: '', kcal: '' };

/** Ce qu'on recopie d'un plan étranger, avant conversion. */
type Plan = { kcal: string; prot: string; gluc: string; lip: string; fibres: string };
const planVide: Plan = { kcal: '', prot: '', gluc: '', lip: '', fibres: '' };

/* `nombreSaisi` ET NON `parseFloat` : « 4,2,1 » se lisait 4,2 sans broncher.
   `NaN` reste le contrat de ce convertisseur pour « rien d'utilisable ». */
const lire = (v: string): number => nombreSaisi(v) ?? NaN;

/** Une saisie non vide qui ne désigne aucun nombre : le champ se borde de rouge. */
const illisible = (v: string): boolean => v.trim() !== '' && nombreSaisi(v) === null;

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

  /* On recharge les champs à chaque changement de repas.
     Le panneau de recopie se vide AUSSI, et se referme : il gardait les
     chiffres du repas précédent, si bien qu'on croyait saisir le midi en
     regardant ceux du matin. Un formulaire qui garde des valeurs d'un autre
     contexte ne prête pas à confusion, il la garantit.

     PENDANT LE RENDU, ET NON DANS UN `useEffect` — corrigé le 20 septembre
     2026. Un effet ne s'exécute qu'APRÈS le commit : React affichait donc une
     image des quatre champs avec les chiffres du MATIN sous l'intitulé
     « Midi », puis une seconde passe posait les bons. Exactement le mensonge
     que le paragraphe ci-dessus dit vouloir éviter, et une règle 7 en
     miniature — un chiffre faux affiché, même un instant, sera lu.

     React documente ce motif (« adjusting state when a prop changes ») : on
     garde la valeur précédente et on remet à jour pendant le rendu. React
     relance alors le rendu immédiatement, sans rien commiter entre les deux. */
  const [repasAffiche, setRepasAffiche] = useState(repas);
  const [cibleAffichee, setCibleAffichee] = useState(existante?.id);

  if (repas !== repasAffiche || existante?.id !== cibleAffichee) {
    setRepasAffiche(repas);
    setCibleAffichee(existante?.id);
    setSaisie(existante
      ? {
          prot: String(existante.prot), gluc: String(existante.gluc),
          lip: String(existante.lip), kcal: String(Math.round(existante.kcal)),
        }
      : vide);
    setTotaux(existante?.glucidesTotaux === true);
    setPlan(planVide);
    setConvertisseur(false);
  }

  if (cibles.isLoading) return <Chargement />;
  if (cibles.isError) {
    return <Erreur message={cibles.error.message} onReessayer={() => void cibles.refetch()} />;
  }

  /* Les calories découlent des grammes. On les recalcule dès qu'une macro
     change, sinon l'utilisateur affiche un objectif impossible.

     M1, 15 septembre 2026 : ce `4·P + 4·G + 9·L` était écrit ici à la main,
     et une deuxième fois vingt lignes plus bas. La formule vit maintenant dans
     `kcalDesMacros`, qui tient ses coefficients de `src/calcul/nutrition.ts`.

     Ce que ce champ propose reste la borne HAUTE quand la case « glucides
     totaux » est cochée : sans connaître la part de fibres, c'est la seule
     valeur qu'on puisse écrire, et l'avertissement plus bas raisonne sur
     l'intervalle entier pour ne pas la contredire. */
  const majMacro = (champ: 'prot' | 'gluc' | 'lip', valeur: string) => {
    const suite = { ...saisie, [champ]: valeur };
    const p = lire(suite.prot); const g = lire(suite.gluc); const l = lire(suite.lip);
    if (![p, g, l].some(Number.isNaN)) {
      suite.kcal = String(Math.round(kcalDesMacros({ prot: p, gluc: g, lip: l })));
    }
    setSaisie(suite);
  };

  /* LA VIRGULE ÉTAIT IGNORÉE ICI — 15 septembre 2026, relevé par la revue.
     `parseFloat('12,5')` rend 12 : sur un clavier Android français, 12,5 g de
     protéines s'enregistraient 12, et le calcul des repas visait la mauvaise
     cible sans que rien ne le montre. Le convertisseur du plan étranger, trente
     lignes plus haut, remplaçait bien la virgule : le jumeau de ces quatre
     lectures, oublié d'elles. */
  const valeurs = {
    prot: lire(saisie.prot), gluc: lire(saisie.gluc),
    lip: lire(saisie.lip), kcal: lire(saisie.kcal),
  };
  const valide = Object.values(valeurs).every((v) => !Number.isNaN(v) && v >= 0);
  /* Même règle que le solveur, et la même fonction : en glucides TOTAUX les
     fibres sont dans la cible sans qu'on sache combien, donc les mêmes grammes
     couvrent un intervalle de calories. Compter les fibres à 4 kcal/g déclarait
     « incohérente » une cible atteignable dès 7,5 g de fibres — l'écran
     accusait l'utilisateur d'une faute qu'il n'avait pas commise. */
  const bornes = valide ? bornesDeCoherence(valeurs) : { min: 0, max: 0 };
  const incoherent = valide
    && Math.abs(ecartDeCoherence(valeurs, totaux)) > SEUIL_COHERENCE;

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

  /**
   * Reporte le plan tel qu'il est imprimé, et coche la case.
   *
   * Il a existé un second chemin : retrancher des glucides les fibres que le
   * plan déclare, pour obtenir une cible européenne. Il a été retiré. Non
   * parce qu'il était faux, mais parce qu'il dépendait entièrement d'un
   * chiffre que les plans remplissent mal — celui de référence annonce 14 g
   * de fibres par jour pour un contenu réel proche de 48.
   *
   * Garder le chiffre du plan et laisser le calculateur ajouter les fibres
   * RÉELLES des aliments ne dépend, lui, d'aucune déclaration. Deux chemins
   * pour un même but, dont l'un est moins sûr, c'en était un de trop.
   */
  const appliquerConversion = () => {
    if (converti === null) return;
    setSaisie({
      prot: String(converti.prot),
      gluc: String(chiffresPlan.glucides),
      lip: String(converti.lip),
      kcal: String(converti.kcalAnnoncees),
    });
    setTotaux(true);
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
              {' — '}{REPAS.find((r) => r.cle === repas)?.long.toLowerCase()}
            </Discret>
          </Pressable>

          {convertisseur && (
            <View style={s.convertisseur}>
              <Discret style={{ fontSize: T.petit, lineHeight: 18 }}>
                Les plans américains — MyFitnessPal, USDA, la plupart des coachs
                anglophones — comptent les fibres DANS les glucides. Recopie les
                chiffres tels qu'ils sont imprimés : ils sont enregistrés tels
                quels, et le calculateur y ajoutera les fibres réelles de tes
                aliments. Rien n'est déduit des fibres que ton plan déclare —
                elles sont presque toujours sous-estimées.
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
                    Sera enregistré : <Texte style={{ fontFamily: P.fort }}>
                      {nb(converti.prot)} P · {nb(chiffresPlan.glucides)} G fibres comprises
                      · {nb(converti.lip)} L · {converti.kcalAnnoncees} kcal
                    </Texte>
                    {'\n'}À titre indicatif, hors fibres ces glucides valent
                    {' '}{nb(converti.gluc)} g — mais ce n'est PAS ce qu'on enregistre :
                    le calculateur retranchera les fibres de tes aliments, qui sont
                    connues, plutôt que celles de ton plan, qui ne le sont pas.
                  </Discret>

                  {fibresSuspectes && (
                    <Discret style={{ color: C.vif, fontSize: T.petit, lineHeight: 18 }}>
                      ⚠ {nb(chiffresPlan.fibres)} g de fibres pour {nb(chiffresPlan.glucides)} g
                      de glucides : ton plan les sous-estime. Sans conséquence ici —
                      c'est justement pour ça qu'on ne s'en sert pas.
                    </Discret>
                  )}

                  <Bouton variante="contour" onPress={appliquerConversion}>
                    Reporter et cocher « fibres comprises »
                  </Bouton>
                </>
              )}
            </View>
          )}

          <View style={s.paire}>
            <Champ etiquette="Protéines" valeur={saisie.prot} onChange={(v) => majMacro('prot', v)} illisible={illisible(saisie.prot)}
              unite="g" numerique placeholder="0" style={{ flex: 1 }} />
            <Champ etiquette="Glucides" valeur={saisie.gluc} onChange={(v) => majMacro('gluc', v)} illisible={illisible(saisie.gluc)}
              unite="g" numerique placeholder="0" style={{ flex: 1 }} />
          </View>
          <View style={s.paire}>
            <Champ etiquette="Lipides" valeur={saisie.lip} onChange={(v) => majMacro('lip', v)} illisible={illisible(saisie.lip)}
              unite="g" numerique placeholder="0" style={{ flex: 1 }} />
            <Champ etiquette="Calories" valeur={saisie.kcal}
              onChange={(v) => setSaisie({ ...saisie, kcal: v })} illisible={illisible(saisie.kcal)}
              unite="kcal" numerique placeholder="0" style={{ flex: 1 }} />
          </View>

          {incoherent && (
            <Discret style={{ color: C.vif, fontSize: T.normal }}>
              {totaux
                ? `Tes grammes représentent entre ${nb(bornes.min)} et ${nb(bornes.max)} `
                  + `calories selon la part de fibres, pas ${nb(valeurs.kcal)}. `
                : `Tes grammes représentent ${nb(bornes.max)} calories, `
                  + `pas ${nb(valeurs.kcal)}. `}
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
