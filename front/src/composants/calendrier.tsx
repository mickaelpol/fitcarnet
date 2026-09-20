import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  aMinuit, dateDuRang, grilleDuMois, libelleDuJour, rangDepuisAujourdhui,
} from '@/calcul/dates';
import { Discret, Texte } from './base';
import { C, E, P, R, T, TOUCHE } from '@/theme';

/**
 * UN CALENDRIER DE SÉLECTION, PAS UNE BANDE DE DATES.
 *
 * Une bande de jours à faire défiler cache ce qu'on cherche : on planifie sa
 * semaine en la voyant, pas en la parcourant. Une grille de mois montre d'un
 * coup les week-ends, les trous, et ce qui est déjà coché.
 *
 * LES JOURS SORTENT EN RANG, jamais en date. Le rang est le nombre de jours
 * depuis aujourd'hui — 0, 1, 2 — et c'est la seule chose dont le solveur ait
 * besoin : l'ordre. Les dates ne servent qu'ici, à l'affichage, et le calcul
 * du rang passe par des dates ramenées à minuit pour qu'un changement d'heure
 * ne décale rien.
 *
 * Le passé n'est pas sélectionnable : on ne planifie pas un repas d'hier.
 */

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/* La semaine commence le lundi, comme partout en France. */
const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/* LES SIX FONCTIONS DE DATE VIVENT DANS `calcul/dates.ts` DEPUIS LE
   20 SEPTEMBRE 2026. Elles etaient ecrites ici, dans un `.tsx`, donc sans un
   seul test et sans pouvoir en avoir. L'une d'elles portait ce commentaire :
   « la nuit du changement d'heure fait 23 ou 25 heures et decale toute la
   grille d'un jour — un bug qui ne se voit que deux fois par an, donc jamais
   en test ». Elle a desormais son test, qui tombe en nommant le
   dimanche 29 mars 2026. */

export function Calendrier({ rangs, onBasculer }: {
  /** les rangs retenus, relatifs à aujourd'hui */
  rangs: readonly number[];
  onBasculer: (rang: number) => void;
}) {
  const aujourdhui = aMinuit(new Date());
  const [mois, setMois] = useState(
    () => new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1));

  const cases = grilleDuMois(mois.getFullYear(), mois.getMonth());
  /* On ne remonte pas avant le mois courant : rien à y sélectionner. */
  const peutReculer = mois.getFullYear() > aujourdhui.getFullYear()
    || (mois.getFullYear() === aujourdhui.getFullYear()
      && mois.getMonth() > aujourdhui.getMonth());

  const decaler = (pas: number) =>
    setMois((m) => new Date(m.getFullYear(), m.getMonth() + pas, 1));

  return (
    <View style={{ gap: E.s }}>
      <View style={s.tete}>
        <Pressable
          onPress={() => peutReculer && decaler(-1)}
          disabled={!peutReculer}
          style={s.fleche}
          accessibilityLabel="Mois précédent"
        >
          <Texte style={[s.flecheTexte, !peutReculer && s.eteint]}>‹</Texte>
        </Pressable>

        <Texte style={s.mois}>
          {MOIS[mois.getMonth()]} {mois.getFullYear()}
        </Texte>

        <Pressable onPress={() => decaler(1)} style={s.fleche} accessibilityLabel="Mois suivant">
          <Texte style={s.flecheTexte}>›</Texte>
        </Pressable>
      </View>

      <View style={s.semaine}>
        {JOURS.map((lettre, i) => (
          <Discret key={`${lettre}${i}`} style={s.entete}>{lettre}</Discret>
        ))}
      </View>

      <View style={s.grille}>
        {cases.map((jour, i) => {
          if (jour === null) return <View key={`vide-${i}`} style={s.case_} />;

          const rang = rangDepuisAujourdhui(jour);
          const passe = rang < 0;
          const pris = rangs.includes(rang);

          return (
            <Pressable
              key={jour.toISOString()}
              onPress={() => !passe && onBasculer(rang)}
              disabled={passe}
              style={[s.case_, s.jour, pris && s.jourPris, rang === 0 && !pris && s.aujourdhui]}
              accessibilityLabel={libelleDuJour(rang)}
              accessibilityState={{ selected: pris, disabled: passe }}
            >
              <Texte style={[
                s.numero,
                passe && s.eteint,
                pris && s.numeroPris,
              ]}
              >
                {jour.getDate()}
              </Texte>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fleche: {
    minWidth: TOUCHE, minHeight: TOUCHE, alignItems: 'center', justifyContent: 'center',
  },
  flecheTexte: { fontSize: T.titre, color: C.attenue },
  eteint: { color: C.discret },
  mois: { fontFamily: P.fort, fontSize: T.moyen },

  semaine: { flexDirection: 'row' },
  entete: { flex: 1, textAlign: 'center', fontSize: T.minuscule },

  grille: { flexDirection: 'row', flexWrap: 'wrap' },
  /* Un septième de la largeur : la grille garde ses colonnes alignées quelle
     que soit la taille de l'écran. */
  case_: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  jour: { alignItems: 'center', justifyContent: 'center', borderRadius: R.m },
  aujourdhui: { borderWidth: 1, borderColor: C.discret },
  jourPris: { backgroundColor: C.vif },
  numero: { fontFamily: P.chiffre, fontSize: T.moyen },
  numeroPris: { color: C.fond },
});
