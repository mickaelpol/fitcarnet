/**
 * Les deux lignes de la liste « Mon frigo » : consultation et comptage.
 *
 * Extraites de `app/(onglets)/frigo.tsx` le 15 septembre 2026 (rang 9 du lot 6
 * de l'audit), sans aucun changement de comportement. Elles vivaient sous le
 * composant d'écran, derrière ses 620 lignes d'état : on ne pouvait pas les
 * lire sans lire tout le reste.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { Bouton, Carte, Champ, Chiffre, Discret, Texte } from './base';
import { controler } from '../calcul/nutrition';
import type { AlimentDisponible } from '../api/types';
import { C, E, N, P, T, couleurRole, nb } from '../theme';
import { nombreSaisi } from '@/calcul/saisieNombre';

/* ------------------------------------------------------------- mode stock */

export function LigneStock({
  aliment, ouvert, modifiable, onOuvrir, onCorriger, onSupprimer,
}: {
  aliment: AlimentDisponible;
  ouvert: boolean;
  modifiable: boolean;
  onOuvrir: () => void;
  onCorriger: () => void;
  onSupprimer: () => void;
}) {
  const controle = controler({
    kcal: aliment.kcal100, prot: aliment.prot100, gluc: aliment.gluc100,
    lip: aliment.lip100, fibres: aliment.fibres100,
  });
  /* Un féculent qui gonfle se pèse sec, tout le reste se pèse cru. C'est la
     seule nuance de vocabulaire qui reste : le geste est le même. */
  const sec = aliment.categorie === 'fec' && aliment.ratio > 1;

  return (
    <Carte style={[s.carte, ouvert && { borderColor: C.vif }]}>
      <Pressable onPress={onOuvrir} style={s.ligne}>
        <View style={[s.pastille, { backgroundColor: couleurRole(aliment.categorie) }]} />
        <View style={{ flex: 1 }}>
          <Texte numberOfLines={2}>{aliment.nom}</Texte>
          <Discret style={{ fontSize: T.petit }} numberOfLines={1}>
            {nb(aliment.kcal100)} kcal · {nb(aliment.prot100)} P
            {' · '}{nb(aliment.gluc100)} G · {nb(aliment.lip100)} L
          </Discret>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Chiffre taille={N.petit} couleur={aliment.stock > 0 ? C.vif : C.discret}>
            {nb(aliment.stock)} {aliment.unite}
          </Chiffre>
          {aliment.unite !== 'g' && aliment.grammesParUnite !== null && (
            <Discret style={{ fontSize: T.minuscule }}>
              soit {nb(aliment.stock * aliment.grammesParUnite)} g
            </Discret>
          )}
          {aliment.unite === 'g' && aliment.ratio !== 1 && (
            <Discret style={{ fontSize: T.minuscule }}>{sec ? 'poids sec' : 'poids cru'}</Discret>
          )}
        </View>
      </Pressable>

      {ouvert && (
        <View style={s.detail}>
          <View style={s.mesures}>
            <Mesure cle="Pour 100 g" valeur={`${nb(aliment.kcal100)} kcal`} />
            <Mesure cle="Protéines" valeur={`${nb(aliment.prot100)} g`} />
            <Mesure cle="Glucides" valeur={`${nb(aliment.gluc100)} g`} />
            <Mesure cle="Lipides" valeur={`${nb(aliment.lip100)} g`} />
            {aliment.fibres100 !== null && aliment.fibres100 !== undefined && (
              <Mesure cle="Fibres" valeur={`${nb(aliment.fibres100)} g`} />
            )}
            <Mesure
              cle="À la cuisson"
              valeur={aliment.ratio === 1
                ? 'poids inchangé'
                : `100 g → ${Math.round(aliment.ratio * 100)} g`}
            />
          </View>

          {controle.verdict !== 'coherent' && (
            <Discret style={{ color: C.vif, fontSize: T.petit, lineHeight: 16 }}>
              {controle.message}
            </Discret>
          )}

          <Discret style={{ fontSize: T.petit, lineHeight: 16 }}>
            La quantité se modifie depuis l'inventaire.
            {modifiable ? '' : ' Cet aliment vient de Grocy : sa fiche s’y modifie aussi.'}
          </Discret>

          <View style={{ flexDirection: 'row', gap: E.s }}>
            <Bouton variante="contour" onPress={onCorriger} style={{ flex: 1 }}>
              Corriger les valeurs
            </Bouton>
            {/* Supprimer reste réservé aux comptes lisant la base : un produit
                Grocy se supprime dans Grocy. */}
            {modifiable && (
              <Bouton variante="discret" onPress={onSupprimer}>
                <Discret style={{ color: C.erreur }}>Supprimer</Discret>
              </Bouton>
            )}
          </View>
        </View>
      )}
    </Carte>
  );
}

/* -------------------------------------------------------- mode inventaire */

export function LigneInventaire({
  aliment, texte, vu, ecart, onTexte, onCocher,
}: {
  aliment: AlimentDisponible;
  texte: string;
  vu: boolean;
  ecart: boolean;
  onTexte: (v: string) => void;
  onCocher: () => void;
}) {
  return (
    <Carte style={[s.carteInv, vu && s.carteVue, ecart && { borderColor: C.vif }]}>
      <Pressable
        onPress={onCocher}
        style={s.case_}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: vu }}
        accessibilityLabel={`${aliment.nom} vérifié`}
      >
        <View style={[s.carre, vu && { backgroundColor: C.ok, borderColor: C.ok }]}>
          {vu && <Texte style={{ color: C.fond, fontSize: T.petit }}>✓</Texte>}
        </View>
      </Pressable>

      <View style={{ flex: 1 }}>
        <Texte
          numberOfLines={2}
          style={[{ fontSize: T.normal }, vu && s.barre]}
        >
          {aliment.nom}
        </Texte>
        {ecart && (
          <Discret style={{ fontSize: T.petit, color: C.vif }}>
            était {nb(aliment.stock)} {aliment.unite}
          </Discret>
        )}
      </View>

      {/* Bordé de rouge quand le texte ne désigne aucune quantité : depuis le
          15 septembre 2026, `ecartsInventaire` n'envoie plus une telle ligne —
          « 4,2,1 » partait en 4,2 — et il faut que ça se VOIE, sans quoi la ligne
          serait ignorée en silence. */}
      <Champ valeur={texte} onChange={onTexte} numerique placeholder="—" style={s.saisie}
        illisible={texte.trim() !== '' && nombreSaisi(texte) === null} />

      {/* L'unité vit à côté du champ, pas dedans : à l'intérieur elle se fait
          écraser par le nombre dès que celui-ci est long. */}
      <Texte style={s.unite}>{aliment.unite}</Texte>
    </Carte>
  );
}

const Mesure = ({ cle, valeur }: { cle: string; valeur: string }) => (
  <View style={s.mesure}>
    <Discret style={{ fontSize: T.minuscule }}>{cle}</Discret>
    <Texte style={{ fontSize: T.normal, fontFamily: P.chiffre }}>{valeur}</Texte>
  </View>
);

const s = StyleSheet.create({
  carte: { padding: 0, overflow: 'hidden' },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: E.m, padding: E.m, minHeight: 56 },
  pastille: { width: 4, height: 30, borderRadius: 3, opacity: 0.7 },
  detail: {
    padding: E.m, paddingTop: 0, gap: E.m,
    borderTopWidth: 1, borderTopColor: C.ligne,
  },
  mesures: { flexDirection: 'row', flexWrap: 'wrap', gap: E.m },
  mesure: { minWidth: 78 },

  carteInv: { flexDirection: 'row', alignItems: 'center', gap: E.s, padding: E.s },
  carteVue: { opacity: 0.66 },
  barre: { textDecorationLine: 'line-through' },
  // 6 px de marge autour d'un carre de 22 donnaient 34 px de cible ; 11 en
  // donnent 44, sans changer le carre lui-meme.
  case_: { padding: 11 },
  carre: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: C.ligne,
    alignItems: 'center', justifyContent: 'center',
  },
  saisie: { width: 96 },
  unite: { fontSize: T.normal, color: C.attenue, minWidth: 30 },
});
