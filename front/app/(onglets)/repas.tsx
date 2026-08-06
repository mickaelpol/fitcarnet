import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useAliments, useCibles } from '@/api/hooks';
import type { Aliment as AlimentApi } from '@/api/types';
import { Bouton, Carte, Champ, Chargement, Chiffre, Discret, Erreur, Texte } from '@/composants/base';
import { calculer, pourObtenirCuit } from '@/solveur/solveur';
import type { Aliment, Fixe } from '@/solveur/types';
import { C, E, P, R, TOUCHE, couleurRole, nb } from '@/theme';

const REPAS = [
  { cle: 'R1' as const, court: 'Matin' },
  { cle: 'R2' as const, court: 'Midi' },
  { cle: 'R3' as const, court: '16 h' },
  { cle: 'R4' as const, court: 'Soir' },
];

const GROUPES = [
  { titre: 'Protéines', article: 'une protéine', cle: 'prot', cats: ['prot', 'lait'] },
  { titre: 'Glucides', article: 'un glucide', cle: 'fec', cats: ['fec', 'fruit'] },
  { titre: 'Lipides', article: 'un lipide', cle: 'lip', cats: ['ole', 'huile'] },
  { titre: 'Légumes', article: 'un légume', cle: 'leg', cats: ['leg'] },
];
const groupeDe = (cat: string) => Math.max(0, GROUPES.findIndex((g) => g.cats.includes(cat)));

interface Ligne {
  uid: string;
  alimentId: number;
  stock: string;          // saisi par l'utilisateur, TOTAL pour tous les convives
  unite: 'cru' | 'cuit';
  ecouler: boolean;
}

const vers = (a: AlimentApi): Aliment => ({
  id: a.id, nom: a.nom, categorie: a.categorie,
  kcal100: a.kcal100, prot100: a.prot100, gluc100: a.gluc100, lip100: a.lip100,
  ratio: a.ratio, etatReference: a.etatReference,
});

export default function Repas() {
  const aliments = useAliments();
  const cibles = useCibles();
  const [repas, setRepas] = useState<'R1' | 'R2' | 'R3' | 'R4'>('R2');
  const [portions, setPortions] = useState(1);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [ouvert, setOuvert] = useState<string | null>(null);

  const parId = useMemo(() => {
    const m = new Map<number, Aliment>();
    for (const a of aliments.data ?? []) m.set(a.id, vers(a));

    return m;
  }, [aliments.data]);

  const cible = useMemo(
    () => (cibles.data ?? []).find((c) => c.repas === repas),
    [cibles.data, repas],
  );

  /* Trois aliments servent de variables : celui qui domine chaque macro. */
  const resultat = useMemo(() => {
    if (!cible || parId.size === 0) return null;

    const libres = lignes.filter((l) => !l.ecouler);
    const pris = new Set<string>();
    const dominant = (cle: 'prot100' | 'gluc100' | 'lip100') => {
      let best: Ligne | null = null;
      let score = -1;
      for (const l of libres) {
        if (pris.has(l.uid)) continue;
        const a = parId.get(l.alimentId);
        if (!a) continue;
        const tot = a.prot100 + a.gluc100 + a.lip100 || 1;
        const part = a[cle] / tot;
        if (part < 0.15) continue;
        if (part > score) { score = part; best = l; }
      }
      if (best) pris.add(best.uid);

      return best;
    };

    const vP = dominant('prot100');
    const vG = dominant('gluc100');
    const vL = dominant('lip100');
    const ajustables = new Set([vP, vG, vL].filter(Boolean).map((l) => l!.uid));

    const fixes: Fixe[] = lignes
      .filter((l) => !ajustables.has(l.uid))
      .map((l) => ({ ligne: l, aliment: parId.get(l.alimentId) }))
      .filter((x) => x.aliment && (Number(x.ligne.stock) || 0) > 0)
      .map((x) => ({
        aliment: x.aliment!,
        grammes: (Number(x.ligne.stock) || 0) / portions,
        unite: x.ligne.unite,
      }));

    const variables: { proteine?: Aliment; glucide?: Aliment; lipide?: Aliment } = {};
    if (vP) variables.proteine = parId.get(vP.alimentId);
    if (vG) variables.glucide = parId.get(vG.alimentId);
    if (vL) variables.lipide = parId.get(vL.alimentId);

    return { calcul: calculer(cible, variables, fixes), ajustables };
  }, [cible, lignes, parId, portions]);

  if (aliments.isLoading || cibles.isLoading) return <Chargement />;
  if (aliments.isError) {
    return <Erreur message={aliments.error.message} onReessayer={() => void aliments.refetch()} />;
  }
  if (!cible) {
    return (
      <View style={s.centre}>
        <Discret style={{ textAlign: 'center' }}>
          Aucun objectif défini pour ce repas. Renseigne-les depuis ton compte.
        </Discret>
      </View>
    );
  }

  const modifier = (uid: string, champs: Partial<Ligne>) =>
    setLignes((l) => l.map((x) => (x.uid === uid ? { ...x, ...champs } : x)));

  const ajouter = (indexGroupe: number) => {
    const cats = GROUPES[indexGroupe]!.cats;
    const deja = new Set(lignes.map((l) => l.alimentId));
    const choix = (aliments.data ?? []).find((a) => cats.includes(a.categorie) && !deja.has(a.id))
      ?? (aliments.data ?? []).find((a) => cats.includes(a.categorie));
    if (!choix) return;
    const uid = `l${Date.now().toString(36)}`;
    setLignes((l) => [...l, {
      uid, alimentId: choix.id, stock: '', unite: choix.etatReference, ecouler: false,
    }]);
    setOuvert(uid);
  };

  const triees = [...lignes].sort((a, b) => {
    const ga = groupeDe(parId.get(a.alimentId)?.categorie ?? 'autre');
    const gb = groupeDe(parId.get(b.alimentId)?.categorie ?? 'autre');

    return ga - gb;
  });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.page}>
        {/* ---- repas et convives ---- */}
        <View style={s.tete}>
          <View style={s.seg}>
            {REPAS.map((r) => (
              <Pressable
                key={r.cle}
                onPress={() => { setRepas(r.cle); setPortions(1); }}
                style={[s.segBouton, repas === r.cle && s.segActif]}
              >
                <Texte style={[s.segTexte, repas === r.cle && { color: C.fond }]}>{r.court}</Texte>
              </Pressable>
            ))}
          </View>
          <View style={s.pers}>
            <Pressable onPress={() => setPortions((p) => Math.max(1, p - 1))} style={s.persBouton}>
              <Texte style={{ fontSize: 19, color: C.attenue }}>−</Texte>
            </Pressable>
            <Chiffre taille={21}>{portions}</Chiffre>
            <Pressable onPress={() => setPortions((p) => Math.min(12, p + 1))} style={s.persBouton}>
              <Texte style={{ fontSize: 19, color: C.attenue }}>+</Texte>
            </Pressable>
          </View>
        </View>

        {/* ---- une section par catégorie ---- */}
        {GROUPES.map((groupe, ig) => {
          const dedans = triees.filter(
            (l) => groupeDe(parId.get(l.alimentId)?.categorie ?? 'autre') === ig,
          );

          return (
            <View key={groupe.cle} style={[s.bloc, { borderLeftColor: couleurRole(groupe.cats[0]!) }]}>
              <Texte style={[s.blocTitre, { color: couleurRole(groupe.cats[0]!) }]}>
                {groupe.titre}
                <Discret style={{ fontSize: 11 }}>
                  {'  '}{dedans.length === 0 ? 'aucun' : `${dedans.length} aliment${dedans.length > 1 ? 's' : ''}`}
                </Discret>
              </Texte>

              {dedans.map((ligne) => (
                <LigneAliment
                  key={ligne.uid}
                  ligne={ligne}
                  aliment={parId.get(ligne.alimentId)}
                  resultat={resultat}
                  portions={portions}
                  ouvert={ouvert === ligne.uid}
                  onOuvrir={() => setOuvert(ouvert === ligne.uid ? null : ligne.uid)}
                  onModifier={(c) => modifier(ligne.uid, c)}
                  onRetirer={() => {
                    setLignes((l) => l.filter((x) => x.uid !== ligne.uid));
                    setOuvert(null);
                  }}
                />
              ))}

              <Bouton variante="discret" onPress={() => ajouter(ig)} style={s.ajouter}>
                + Ajouter {groupe.article}
              </Bouton>
            </View>
          );
        })}
      </ScrollView>

      {/* ---- bilan collé en bas ---- */}
      <View style={s.barre}>
        <View style={s.macs}>
          {(['prot', 'gluc', 'lip', 'kcal'] as const).map((k) => {
            const tol = { prot: 1.5, gluc: 2.5, lip: 1.2, kcal: 45 }[k];
            const obtenu = resultat?.calcul.macros[k] ?? 0;
            const bon = Math.abs(obtenu - cible[k]) <= tol;

            return (
              <View key={k} style={s.mac}>
                <Chiffre taille={19} couleur={bon ? C.ok : C.erreur}>{nb(obtenu)}</Chiffre>
                <Discret style={{ fontSize: 9.5, textTransform: 'uppercase' }}>
                  {{ prot: 'prot.', gluc: 'gluc.', lip: 'lip.', kcal: 'kcal' }[k]}
                </Discret>
              </View>
            );
          })}
        </View>
        {resultat?.calcul.diagnostics.find((d) => d.gravite !== 'info') && (
          <Discret style={s.alerte} numberOfLines={3}>
            ⚠ {resultat.calcul.diagnostics.find((d) => d.gravite !== 'info')!.message}
          </Discret>
        )}
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- */

function LigneAliment({
  ligne, aliment, resultat, portions, ouvert, onOuvrir, onModifier, onRetirer,
}: {
  ligne: Ligne;
  aliment?: Aliment;
  resultat: { calcul: ReturnType<typeof calculer>; ajustables: Set<string> } | null;
  portions: number;
  ouvert: boolean;
  onOuvrir: () => void;
  onModifier: (c: Partial<Ligne>) => void;
  onRetirer: () => void;
}) {
  if (!aliment) return null;

  const stock = Number(ligne.stock) || 0;
  const sec = aliment.etatReference === 'cuit' && aliment.ratio > 1;
  const q = resultat?.calcul.quantites.find((x) => x.aliment.nom === aliment.nom);
  const ajustable = resultat?.ajustables.has(ligne.uid) ?? false;

  /* Le gros chiffre est celui sur lequel on peut AGIR. */
  let gros = '—';
  let petit = 'pas utilisé';
  let couleur: (typeof C)[keyof typeof C] = C.vif;

  if (q && q.assiette > 0) {
    const cuireTotal = q.aCuire * portions;
    const besoin = (ligne.unite === 'cuit' ? q.assiette : q.aCuire) * portions;
    const manque = besoin - stock;
    const uSec = sec ? ' sec' : aliment.etatReference === 'cru' ? ' cru' : '';

    if (ligne.ecouler || (stock > 0 && !ajustable)) {
      gros = `${nb(stock)} g`;
      petit = `déjà là, ${ligne.unite}`;
      couleur = C.ok;
    } else if (stock <= 0) {
      gros = `${nb(cuireTotal)} g`;
      petit = (portions > 1 ? 'à cuisiner' : 'à peser') + uSec;
    } else if (manque > 0.5) {
      const sup = ligne.unite === 'cuit' ? pourObtenirCuit(aliment, manque) : manque;
      gros = `+${nb(sup)} g`;
      petit = `à préparer${uSec}, en plus de tes ${nb(stock)} g`;
    } else if (manque < -0.5) {
      gros = `${nb(besoin)} g`;
      petit = `à prélever sur tes ${nb(stock)} g`;
      couleur = C.ok;
    } else {
      gros = `${nb(stock)} g`;
      petit = 'pile ce qu’il faut';
      couleur = C.ok;
    }
  }

  return (
    <Carte style={[s.rang, ouvert && { borderColor: C.vif }]}>
      <Pressable onPress={onOuvrir} style={s.tap}>
        <View style={[s.pastille, { backgroundColor: couleurRole(aliment.categorie) }]} />
        <View style={{ flex: 1 }}>
          <Texte style={{ fontFamily: P.fort }} numberOfLines={1}>{aliment.nom}</Texte>
          <Discret style={{ fontSize: 12 }} numberOfLines={1}>{petit}</Discret>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Chiffre couleur={couleur}>{gros}</Chiffre>
          {q && q.assiette > 0 && (
            <Discret style={{ fontSize: 11 }}>{nb(q.assiette)} g par assiette</Discret>
          )}
        </View>
      </Pressable>

      {ouvert && (
        <View style={s.detail}>
          <View style={s.rangee}>
            <Champ
              etiquette={portions > 1 ? "J'en ai en tout" : "J'en ai"}
              valeur={ligne.stock}
              onChange={(v) => onModifier({ stock: v, ...(Number(v) > 0 ? {} : { ecouler: false }) })}
              placeholder="0"
              unite="g"
              numerique
              style={{ flex: 1 }}
            />
            <View style={s.mini}>
              {(['cuit', 'cru'] as const).map((u) => (
                <Pressable
                  key={u}
                  onPress={() => onModifier({ unite: u })}
                  style={[s.miniBouton, ligne.unite === u && s.miniActif]}
                >
                  <Discret style={ligne.unite === u ? { color: C.encre } : undefined}>
                    {u === 'cuit' ? 'cuit' : sec ? 'sec' : 'cru'}
                  </Discret>
                </Pressable>
              ))}
            </View>
          </View>

          {stock > 0 && (
            <Pressable
              onPress={() => onModifier({ ecouler: !ligne.ecouler })}
              style={s.coche}
            >
              <View style={[s.case_, ligne.ecouler && { backgroundColor: C.vif, borderColor: C.vif }]}>
                {ligne.ecouler && <Texte style={{ color: C.fond, fontSize: 12 }}>✓</Texte>}
              </View>
              <Discret>Je n’en ai pas plus : écouler tout</Discret>
            </Pressable>
          )}

          <Bouton variante="discret" onPress={onRetirer} style={{ alignSelf: 'flex-start' }}>
            Retirer du repas
          </Bouton>
        </View>
      )}
    </Carte>
  );
}

const s = StyleSheet.create({
  page: { padding: E.m, paddingBottom: 130 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: E.xl },

  tete: { flexDirection: 'row', gap: E.s, marginBottom: E.l },
  seg: {
    flex: 1, flexDirection: 'row', backgroundColor: C.surface2,
    borderColor: C.ligne, borderWidth: 1, borderRadius: R.m, padding: 3,
  },
  segBouton: { flex: 1, minHeight: TOUCHE, alignItems: 'center', justifyContent: 'center', borderRadius: R.s },
  segActif: { backgroundColor: C.vif },
  segTexte: { fontFamily: P.chiffre, fontSize: 16, textTransform: 'uppercase', color: C.attenue },
  pers: {
    flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 3,
    backgroundColor: C.surface2, borderColor: C.ligne, borderWidth: 1, borderRadius: R.m,
  },
  persBouton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },

  bloc: { borderLeftWidth: 3, paddingLeft: E.m, marginBottom: E.xl, gap: E.s },
  blocTitre: { fontFamily: P.titre, fontSize: 15, letterSpacing: 1.2, textTransform: 'uppercase' },
  ajouter: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.ligne,
    borderRadius: R.m, minHeight: TOUCHE + 2,
  },

  rang: { padding: 0, overflow: 'hidden' },
  tap: { flexDirection: 'row', alignItems: 'center', gap: E.m, padding: E.m, minHeight: 58 },
  pastille: { width: 4, height: 30, borderRadius: 3, opacity: 0.6 },
  detail: { padding: E.m, paddingTop: 0, gap: E.m, borderTopWidth: 1, borderTopColor: C.ligne },
  rangee: { flexDirection: 'row', alignItems: 'flex-end', gap: E.s },
  mini: { flexDirection: 'row', backgroundColor: C.surface2, borderColor: C.ligne, borderWidth: 1, borderRadius: R.s, padding: 2 },
  miniBouton: { paddingHorizontal: E.m, minHeight: TOUCHE - 4, alignItems: 'center', justifyContent: 'center', borderRadius: R.s - 2 },
  miniActif: { backgroundColor: C.ligne },
  coche: { flexDirection: 'row', alignItems: 'center', gap: E.s, minHeight: TOUCHE },
  case_: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: C.ligne,
    alignItems: 'center', justifyContent: 'center',
  },

  barre: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: C.fond, borderTopColor: C.ligne, borderTopWidth: 1,
    padding: E.s, paddingBottom: E.m, gap: E.s,
  },
  macs: { flexDirection: 'row', gap: 6 },
  mac: {
    flex: 1, backgroundColor: C.surface2, borderColor: C.ligne, borderWidth: 1,
    borderRadius: R.s, paddingVertical: 7, alignItems: 'center',
  },
  alerte: { fontSize: 12, color: C.vif, paddingHorizontal: E.xs },
});
