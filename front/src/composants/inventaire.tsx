import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import type { AlimentDisponible } from '@/api/types';
import { Bouton, Carte, Champ, Discret, Texte, Vide } from './base';
import {
  ecartsInventaire, filtrerFrigo, grouperParEmplacement, type LigneInventaire,
} from '@/calcul/frigo';
import { C, E, P, R, T, nb } from '@/theme';

/**
 * Mode inventaire : on compte le frigo en vrai, ligne par ligne.
 *
 * Rien ne part pendant la saisie. On peut poser la balance, revenir, se
 * tromper et corriger ; l'envoi est un geste explicite, en fin de parcours.
 * Envoyer au fil de l'eau enverrait des poids intermédiaires vers le stock.
 *
 * La case à cocher ne sert qu'à l'œil : elle marque ce qu'on a déjà vu dans
 * le placard, y compris quand le poids était juste et qu'il n'y a rien à
 * corriger. Elle n'est jamais transmise.
 */
/**
 * Champs préremplis avec le stock connu.
 *
 * La valeur exacte, pas son affichage arrondi : préremplir « 1234,6 » pour un
 * stock de 1234,56 créerait un écart de 0,04 sur une ligne que personne n'a
 * touchée, et l'enverrait à Grocy.
 */
const stocksInitiaux = (aliments: AlimentDisponible[]): Record<string, string> =>
  Object.fromEntries(aliments.map((a) => [a.reference, String(a.stock)]));

export function ModeInventaire({
  aliments, enCours, erreur, onEnvoyer, onQuitter,
}: {
  aliments: AlimentDisponible[];
  enCours: boolean;
  erreur: string | null;
  onEnvoyer: (lignes: LigneInventaire[]) => void;
  onQuitter: () => void;
}) {
  const [saisies, setSaisies] = useState<Record<string, string>>(() => stocksInitiaux(aliments));
  const [vus, setVus] = useState<Record<string, boolean>>({});
  const [recherche, setRecherche] = useState('');

  /* Les écarts se calculent sur TOUT le frigo, pas sur ce que la recherche
     laisse voir : filtrer puis envoyer perdrait les lignes déjà saisies. */
  const ecarts = useMemo(() => ecartsInventaire(aliments, saisies), [aliments, saisies]);

  const sections = useMemo(
    () => grouperParEmplacement(filtrerFrigo(aliments, recherche)),
    [aliments, recherche],
  );

  const comptes = Object.values(vus).filter(Boolean).length;

  const reinitialiser = () => { setSaisies(stocksInitiaux(aliments)); setVus({}); };

  return (
    <View style={{ flex: 1 }}>
      <View style={s.tete}>
        <View style={s.teteLigne}>
          <Discret style={{ flex: 1, fontSize: T.normal }}>
            {comptes}/{aliments.length} vérifiés · {ecarts.length} écart
            {ecarts.length > 1 ? 's' : ''}
          </Discret>
          <Pressable onPress={onQuitter} style={s.bascule}>
            <Discret style={{ fontSize: T.petit }}>Quitter</Discret>
          </Pressable>
        </View>
        <Champ
          valeur={recherche}
          onChange={setRecherche}
          placeholder="Chercher un produit ou un emplacement"
        />

        <Discret style={{ fontSize: T.petit, lineHeight: 16 }}>
          Les champs portent le stock connu. Corrige ceux qui ne collent pas.
          Rien n'est envoyé tant que tu n'as pas cliqué en bas, et seules les
          lignes modifiées partent.
        </Discret>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(a) => a.reference}
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Vide message={`Aucun produit ne correspond à « ${recherche} ».`} />}
        renderSectionHeader={({ section }) => (
          <Discret style={s.section}>
            {section.titre} · {section.data.length}
          </Discret>
        )}
        renderItem={({ item }) => {
          const vu = vus[item.reference] === true;
          const texte = saisies[item.reference] ?? '';
          const ecart = ecarts.some((l) => l.reference === item.reference);

          return (
            <Carte style={[s.carte, vu && s.carteVue, ecart && { borderColor: C.vif }]}>
              <Pressable
                onPress={() => setVus((v) => ({ ...v, [item.reference]: !vu }))}
                style={s.case_}
                accessibilityLabel={`${item.nom} vérifié`}
              >
                <View style={[s.carre, vu && { backgroundColor: C.ok, borderColor: C.ok }]}>
                  {vu && <Texte style={{ color: C.fond, fontSize: T.petit }}>✓</Texte>}
                </View>
              </Pressable>

              <View style={{ flex: 1 }}>
                <Texte numberOfLines={2} style={{ fontSize: T.normal }}>{item.nom}</Texte>
                {ecart && (
                  <Discret style={{ fontSize: T.petit, color: C.vif }}>
                    était {nb(item.stock)} {item.unite}
                  </Discret>
                )}
              </View>

              <Champ
                valeur={texte}
                onChange={(v) => setSaisies((x) => ({ ...x, [item.reference]: v }))}
                numerique
                placeholder="—"
                style={s.saisie}
              />

              {/* L'unité vit à côté du champ, pas dedans : à l'intérieur elle
                  se fait écraser par le nombre dès que celui-ci est long, et
                  on ne sait plus ce qu'on pèse. */}
              <Texte style={s.unite}>{item.unite}</Texte>
            </Carte>
          );
        }}
      />

      <View style={s.pied}>
        {erreur !== null && erreur !== '' && (
          <Discret style={{ color: C.erreur, fontSize: T.petit, lineHeight: 17 }}>{erreur}</Discret>
        )}
        <View style={{ flexDirection: 'row', gap: E.s }}>
          <Bouton variante="contour" onPress={reinitialiser} style={{ flex: 1 }}>
            Réinitialiser
          </Bouton>
          <Bouton
            onPress={() => onEnvoyer(ecarts)}
            desactive={ecarts.length === 0 || enCours}
            style={{ flex: 1.6 }}
          >
            {enCours
              ? 'Envoi…'
              : ecarts.length === 0
                ? 'Aucun écart à envoyer'
                : `Envoyer ${ecarts.length} correction${ecarts.length > 1 ? 's' : ''}`}
          </Bouton>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tete: { padding: E.m, gap: E.s, borderBottomWidth: 1, borderBottomColor: C.ligne },
  teteLigne: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  bascule: {
    paddingHorizontal: E.m, minHeight: 34, borderRadius: R.s, borderWidth: 1,
    borderColor: C.ligne, backgroundColor: C.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  page: { padding: E.m, gap: 6, flexGrow: 1, paddingBottom: E.xl },
  section: {
    fontFamily: P.titre, fontSize: T.normal, letterSpacing: 1.2, textTransform: 'uppercase',
    marginTop: E.m, marginBottom: E.xs,
  },
  carte: { flexDirection: 'row', alignItems: 'center', gap: E.s, padding: E.s },
  carteVue: { opacity: 0.66 },
  case_: { padding: 6 },
  carre: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: C.ligne,
    alignItems: 'center', justifyContent: 'center',
  },
  saisie: { width: 96 },
  unite: { fontSize: T.normal, color: C.attenue, minWidth: 30 },
  pied: {
    padding: E.m, gap: E.s,
    borderTopWidth: 1, borderTopColor: C.ligne, backgroundColor: C.fond,
  },
});
