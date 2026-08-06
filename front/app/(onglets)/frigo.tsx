import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useDefinirStock, useFrigoIncomplets, useMonFrigo } from '@/api/hooks';
import type { AlimentDisponible } from '@/api/types';
import {
  Bouton, Carte, Champ, Chargement, Chiffre, Discret, Erreur, Texte, Vide,
} from '@/composants/base';
import { controler } from '@/calcul/nutrition';
import { C, E, P, R, TOUCHE, couleurRole, nb } from '@/theme';

const ORDRE = ['Frigo', 'Congélateur', 'Congelateur', 'Placard'];

export default function MonFrigo() {
  const frigo = useMonFrigo();
  const definir = useDefinirStock();
  const [tout, setTout] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [saisie, setSaisie] = useState('');

  const modifiable = frigo.data?.source === 'base';
  const incomplets = useFrigoIncomplets(frigo.data?.source === 'grocy');

  const sections = useMemo(() => {
    const aliments = (frigo.data?.aliments ?? [])
      .filter((a) => tout || a.stock > 0);

    const parLieu = new Map<string, AlimentDisponible[]>();
    for (const a of aliments) {
      const lieu = a.emplacement ?? 'Sans emplacement';
      parLieu.set(lieu, [...(parLieu.get(lieu) ?? []), a]);
    }

    return [...parLieu.entries()]
      .sort((a, b) => {
        const ia = ORDRE.indexOf(a[0]);
        const ib = ORDRE.indexOf(b[0]);

        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0]);
      })
      .map(([titre, data]) => ({ titre, data }));
  }, [frigo.data, tout]);

  if (frigo.isLoading) return <Chargement texte="Lecture de ton frigo…" />;
  if (frigo.isError) {
    return <Erreur message={frigo.error.message} onReessayer={() => void frigo.refetch()} />;
  }

  const enStock = (frigo.data?.aliments ?? []).filter((a) => a.stock > 0).length;
  const total = (frigo.data?.aliments ?? []).length;

  return (
    <View style={{ flex: 1 }}>
      <View style={s.tete}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: E.s }}>
          <Discret style={{ flex: 1, fontSize: 12.5 }}>
            {enStock} aliment{enStock > 1 ? 's' : ''} en stock sur {total}
            {frigo.data?.source === 'grocy' ? ' · depuis Grocy' : ''}
          </Discret>
          <Pressable onPress={() => setTout(!tout)} style={[s.bascule, tout && s.basculeActive]}>
            <Discret style={tout ? { color: C.fond, fontFamily: P.fort, fontSize: 12 } : { fontSize: 12 }}>
              {tout ? 'Tout' : 'En stock'}
            </Discret>
          </Pressable>
        </View>

        {frigo.data?.probleme !== null && frigo.data?.probleme !== undefined && (
          <View style={s.alerte}>
            <Discret style={{ color: C.vif, fontSize: 12.5, lineHeight: 18 }}>
              {frigo.data.probleme}
            </Discret>
          </View>
        )}

        {(incomplets.data?.produits.length ?? 0) > 0 && (
          <View style={s.alerte}>
            <Discret style={{ color: C.attenue, fontSize: 12, lineHeight: 17 }}>
              {incomplets.data!.produits.length} produit(s) Grocy sans valeurs
              nutritionnelles : ils n'apparaissent pas ici et restent invisibles
              au calculateur. Renseigne-les dans Grocy pour les utiliser.
            </Discret>
          </View>
        )}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(a) => a.reference}
        contentContainerStyle={s.page}
        refreshing={frigo.isRefetching}
        onRefresh={() => void frigo.refetch()}
        ListEmptyComponent={
          <Vide message={tout
            ? "Aucun aliment. Ajoute-les depuis l'écran de composition."
            : 'Rien en stock. Bascule sur « Tout » pour voir le reste.'} />
        }
        renderSectionHeader={({ section }) => (
          <Discret style={s.section}>{section.titre}</Discret>
        )}
        renderItem={({ item }) => {
          const est = ouvert === item.reference;
          const controle = controler({
            kcal: item.kcal100, prot: item.prot100, gluc: item.gluc100,
            lip: item.lip100, fibres: item.fibres100,
          });
          const sec = item.etatReference === 'cuit' && item.ratio > 1;

          return (
            <Carte style={[s.carte, est && { borderColor: C.vif }]}>
              <Pressable
                onPress={() => {
                  setOuvert(est ? null : item.reference);
                  setSaisie(item.stock > 0 ? String(item.stock) : '');
                }}
                style={s.ligne}
              >
                <View style={[s.pastille, { backgroundColor: couleurRole(item.categorie) }]} />
                <View style={{ flex: 1 }}>
                  <Texte numberOfLines={1}>{item.nom}</Texte>
                  <Discret style={{ fontSize: 11.5 }} numberOfLines={1}>
                    {nb(item.kcal100)} kcal · {nb(item.prot100)} P · {nb(item.gluc100)} G
                    {' · '}{nb(item.lip100)} L
                  </Discret>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Chiffre taille={18} couleur={item.stock > 0 ? C.vif : C.discret}>
                    {nb(item.stock)} g
                  </Chiffre>
                  {item.ratio !== 1 && (
                    <Discret style={{ fontSize: 10 }}>
                      {sec ? 'poids sec' : 'poids cru'}
                    </Discret>
                  )}
                </View>
              </Pressable>

              {est && (
                <View style={s.detail}>
                  <View style={s.mesures}>
                    <Mesure cle="Pour 100 g" valeur={`${nb(item.kcal100)} kcal`} />
                    <Mesure cle="Protéines" valeur={`${nb(item.prot100)} g`} />
                    <Mesure cle="Glucides" valeur={`${nb(item.gluc100)} g`} />
                    <Mesure cle="Lipides" valeur={`${nb(item.lip100)} g`} />
                    {item.fibres100 !== null && (
                      <Mesure cle="Fibres" valeur={`${nb(item.fibres100)} g`} />
                    )}
                    <Mesure
                      cle="À la cuisson"
                      valeur={item.ratio === 1
                        ? 'poids inchangé'
                        : `100 g → ${Math.round(item.ratio * 100)} g`}
                    />
                  </View>

                  {controle.verdict !== 'coherent' && (
                    <Discret style={{ color: C.vif, fontSize: 11.5, lineHeight: 16 }}>
                      {controle.message}
                    </Discret>
                  )}

                  {modifiable ? (
                    <View style={{ flexDirection: 'row', gap: E.s, alignItems: 'flex-end' }}>
                      <Champ
                        etiquette="Quantité en stock"
                        valeur={saisie} onChange={setSaisie}
                        unite="g" numerique placeholder="0" style={{ flex: 1 }}
                      />
                      <Bouton
                        onPress={() => definir.mutate({
                          alimentId: Number(item.reference.split(':')[1]),
                          quantite: parseFloat(saisie.replace(',', '.')) || 0,
                        }, { onSuccess: () => setOuvert(null) })}
                        desactive={definir.isPending}
                      >
                        Enregistrer
                      </Bouton>
                    </View>
                  ) : (
                    <Discret style={{ fontSize: 11.5, lineHeight: 16 }}>
                      Cette quantité vient de Grocy. Modifie-la là-bas, ou fais
                      ton inventaire depuis ta page habituelle.
                    </Discret>
                  )}
                </View>
              )}
            </Carte>
          );
        }}
      />
    </View>
  );
}

const Mesure = ({ cle, valeur }: { cle: string; valeur: string }) => (
  <View style={s.mesure}>
    <Discret style={{ fontSize: 10 }}>{cle}</Discret>
    <Texte style={{ fontSize: 13, fontFamily: P.chiffre }}>{valeur}</Texte>
  </View>
);

const s = StyleSheet.create({
  tete: { padding: E.m, gap: E.s, borderBottomWidth: 1, borderBottomColor: C.ligne },
  bascule: {
    paddingHorizontal: E.m, minHeight: 34, borderRadius: R.s, borderWidth: 1,
    borderColor: C.ligne, backgroundColor: C.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  basculeActive: { backgroundColor: C.vif, borderColor: C.vif },
  alerte: {
    backgroundColor: 'rgba(227,178,60,0.10)', borderRadius: R.s, padding: E.s,
  },
  page: { padding: E.m, gap: 6, flexGrow: 1, paddingBottom: E.xl },
  section: {
    fontFamily: P.titre, fontSize: 14, letterSpacing: 1.2, textTransform: 'uppercase',
    marginTop: E.m, marginBottom: E.xs,
  },
  carte: { padding: 0, overflow: 'hidden' },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: E.m, padding: E.m, minHeight: 56 },
  pastille: { width: 4, height: 30, borderRadius: 3, opacity: 0.7 },
  detail: {
    padding: E.m, paddingTop: 0, gap: E.m,
    borderTopWidth: 1, borderTopColor: C.ligne,
  },
  mesures: { flexDirection: 'row', flexWrap: 'wrap', gap: E.m },
  mesure: { minWidth: 78 },
});
