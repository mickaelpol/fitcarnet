import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import {
  useDefinirStock, useEnregistrerAliment, useEnvoyerInventaire,
  useFrigoIncomplets, useMonFrigo,
} from '@/api/hooks';
import type { AlimentDisponible } from '@/api/types';
import {
  Bouton, Carte, Champ, Chargement, Chiffre, Discret, Erreur, Texte, Vide,
} from '@/composants/base';
import { EditeurAliment, type AlimentSaisi } from '@/composants/editeurAliment';
import { ModeInventaire } from '@/composants/inventaire';
import { filtrerFrigo, grouperParEmplacement } from '@/calcul/frigo';
import { controler } from '@/calcul/nutrition';
import { C, E, P, R, TOUCHE, couleurRole, nb } from '@/theme';

/** Un aliment du frigo tel que l'éditeur l'attend. */
const versSaisie = (a: AlimentDisponible): AlimentSaisi => ({
  nom: a.nom,
  categorie: a.categorie,
  kcal100: a.kcal100,
  prot100: a.prot100,
  gluc100: a.gluc100,
  lip100: a.lip100,
  fibres100: a.fibres100,
  ratio: a.ratio,
  etatReference: a.etatReference,
  peseeAvant: a.peseeAvant,
  peseeApres: a.peseeApres,
});

export default function MonFrigo() {
  const frigo = useMonFrigo();
  const definir = useDefinirStock();
  const enregistrer = useEnregistrerAliment();
  const envoyer = useEnvoyerInventaire();
  const [tout, setTout] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [saisie, setSaisie] = useState('');
  const [edite, setEdite] = useState<AlimentDisponible | null>(null);
  const [inventaire, setInventaire] = useState(false);
  const [recherche, setRecherche] = useState('');

  const modifiable = frigo.data?.source === 'base';
  const incomplets = useFrigoIncomplets(frigo.data?.source === 'grocy');

  const sections = useMemo(
    () => grouperParEmplacement(filtrerFrigo(
      (frigo.data?.aliments ?? []).filter((a) => tout || a.stock > 0), recherche)),
    [frigo.data, tout, recherche],
  );

  /* Les macros sont données pour 100 g. Une autre unité ne pose problème que
     si son poids est inconnu : le kilogramme et la pièce se convertissent dès
     que Grocy porte la conversion, le litre et le pack non. */
  const sansPoids = useMemo(
    () => (frigo.data?.aliments ?? []).filter((a) => a.grammesParUnite === null),
    [frigo.data],
  );

  if (frigo.isLoading) return <Chargement texte="Lecture de ton frigo…" />;
  if (frigo.isError) {
    return <Erreur message={frigo.error.message} onReessayer={() => void frigo.refetch()} />;
  }

  /* L'inventaire porte sur TOUT le frigo, pas seulement sur ce qui est en
     stock : un produit à zéro qu'on retrouve au fond du placard est
     précisément ce qu'un inventaire sert à rattraper. */
  if (inventaire) {
    return (
      <ModeInventaire
        aliments={frigo.data?.aliments ?? []}
        enCours={envoyer.isPending}
        erreur={envoyer.error?.message ?? null}
        onQuitter={() => { envoyer.reset(); setInventaire(false); }}
        onEnvoyer={(lignes) => envoyer.mutate(lignes, {
          onSuccess: (r) => { if (r.echecs.length === 0) setInventaire(false); },
        })}
      />
    );
  }

  const enStock = (frigo.data?.aliments ?? []).filter((a) => a.stock > 0).length;
  const total = (frigo.data?.aliments ?? []).length;

  return (
    <View style={{ flex: 1 }}>
      <View style={s.tete}>
        {/* Deux segments visibles plutôt qu'un bouton qui change de nom : sur
            une bascule à libellé unique, on ne sait ni qu'elle se clique, ni si
            le mot désigne l'état courant ou ce qu'on obtiendra en cliquant. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: E.s }}>
          <View style={s.segmente}>
            <Pressable
              onPress={() => setTout(false)}
              style={[s.segment, !tout && s.segmentActif]}
              accessibilityRole="button"
              accessibilityState={{ selected: !tout }}
            >
              <Discret style={!tout ? s.segmentTexteActif : s.segmentTexte}>
                En stock · {enStock}
              </Discret>
            </Pressable>
            <Pressable
              onPress={() => setTout(true)}
              style={[s.segment, tout && s.segmentActif]}
              accessibilityRole="button"
              accessibilityState={{ selected: tout }}
            >
              <Discret style={tout ? s.segmentTexteActif : s.segmentTexte}>
                Tout · {total}
              </Discret>
            </Pressable>
          </View>

          <Bouton
            variante="contour"
            onPress={() => { envoyer.reset(); setInventaire(true); }}
          >
            Inventaire
          </Bouton>
        </View>

        <Discret style={{ fontSize: 11, lineHeight: 16 }}>
          « Tout » ajoute les aliments à zéro, ceux qu'il reste à racheter.
          {frigo.data?.source === 'grocy' ? ' Stock tenu dans Grocy.' : ''}
        </Discret>

        <Champ
          valeur={recherche}
          onChange={setRecherche}
          placeholder="Chercher un aliment ou un emplacement"
        />

        {sansPoids.length > 0 && (
          <View style={s.alerte}>
            <Discret style={{ color: C.attenue, fontSize: 12, lineHeight: 17 }}>
              {sansPoids.length} produit(s) sans poids connu
              {' ('}{sansPoids.map((a) => `${a.nom} en ${a.unite}`).join(', ')}
              {'). '}
              Les macros sont données pour 100 g : le calculateur les écarte.
              Déclare la conversion dans Grocy — « 1 {sansPoids[0]?.unite} = … g »
              sur la fiche produit — ou passe-les au gramme.
            </Discret>
          </View>
        )}

        {envoyer.isSuccess && envoyer.data.echecs.length > 0 && (
          <View style={s.alerte}>
            <Discret style={{ color: C.erreur, fontSize: 12, lineHeight: 17 }}>
              {envoyer.data.corriges} produit(s) corrigé(s),
              {' '}{envoyer.data.echecs.length} en échec :
              {' '}{envoyer.data.echecs.map((e) => e.motif).join(' · ')}
            </Discret>
          </View>
        )}

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
                    {nb(item.stock)} {item.unite}
                  </Chiffre>
                  {item.unite !== 'g' && item.grammesParUnite !== null && (
                    <Discret style={{ fontSize: 10 }}>
                      soit {nb(item.stock * item.grammesParUnite)} g
                    </Discret>
                  )}
                  {item.unite === 'g' && item.ratio !== 1 && (
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
                        unite={item.unite} numerique placeholder="0" style={{ flex: 1 }}
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
                    <View style={{ gap: E.s }}>
                      <Discret style={{ fontSize: 11.5, lineHeight: 16 }}>
                        Cette quantité vient de Grocy. Modifie-la là-bas, ou fais
                        ton inventaire depuis ta page habituelle.
                      </Discret>
                      <Bouton
                        variante="contour"
                        onPress={() => { enregistrer.reset(); setEdite(item); }}
                      >
                        Corriger les valeurs nutritionnelles
                      </Bouton>
                    </View>
                  )}
                </View>
              )}
            </Carte>
          );
        }}
      />

      <EditeurAliment
        visible={edite !== null}
        titre={edite?.nom ?? 'Aliment'}
        aliment={edite !== null ? versSaisie(edite) : undefined}
        enCours={enregistrer.isPending}
        erreur={enregistrer.error?.message ?? null}
        // Grocy est maître du nom, et l'état de référence s'y déduit de la
        // catégorie au lieu d'être stocké : les laisser modifiables ferait
        // croire à une saisie qui ne serait jamais enregistrée.
        nomModifiable={false}
        etatModifiable={false}
        onFermer={() => setEdite(null)}
        onEnregistrer={(v) => {
          if (edite === null) return;

          enregistrer.mutate({
            reference: edite.reference,
            categorie: v.categorie,
            kcal100: v.kcal100,
            prot100: v.prot100,
            gluc100: v.gluc100,
            lip100: v.lip100,
            fibres100: v.fibres100,
            ratio: v.ratio,
            peseeAvant: v.peseeAvant ?? null,
            peseeApres: v.peseeApres ?? null,
          }, { onSuccess: () => setEdite(null) });
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
  /* Sélecteur à deux segments : les deux choix restent lisibles, celui qui
     est actif est plein. On voit d'un coup ce qu'on regarde et ce qu'on peut
     obtenir en touchant l'autre. */
  segmente: {
    flex: 1, flexDirection: 'row', padding: 2,
    borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    backgroundColor: C.surface2,
  },
  segment: {
    flex: 1, minHeight: TOUCHE - 8, borderRadius: R.s - 2,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: E.xs,
  },
  segmentActif: { backgroundColor: C.vif },
  segmentTexte: { fontSize: 12.5 },
  segmentTexteActif: { color: C.fond, fontFamily: P.fort, fontSize: 12.5 },
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
