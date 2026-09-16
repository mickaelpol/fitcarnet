import { Pressable, StyleSheet, View } from 'react-native';
import type { ModeleSerie } from '@/api/types';
import { Discret } from './base';
import { ChampNombre } from './champNombre';
import type { ModeTravail } from './choixMode';
import { E, T, TOUCHE } from '@/theme';

/**
 * UNE SÉRIE CIBLE D'UN MODÈLE — le jumeau de `LigneSerie`, côté prescription.
 *
 * EXTRAIT DE `app/modele/[id].tsx` LE 16 SEPTEMBRE 2026, et pas seulement pour
 * alléger l'écran : un test posé dans `front/app/` n'est JAMAIS exécuté (le
 * motif de `tsconfig.tests.json` ne couvre que `src/`, et rien ne le signale).
 * Tant que ces champs vivaient dans l'écran, aucun test ne pouvait les voir.
 *
 * CE QU'ILS NE FAISAIENT PAS. Le sélecteur de mode venait d'arriver dans
 * l'éditeur de modèle, justement parce qu'« un programme de gainage restait en
 * Charge et son modèle prescrivait des kilos là où il faut des secondes ». Or
 * l'éprouve sur émulateur Android a montré qu'après bascule en « Tenue », les
 * quatre lignes affichaient toujours « — kg » et « 12 rép » : le mode était
 * choisi, enregistré, et la prescription qu'il commande ne suivait pas.
 * `ModeleSerie.secondesCible` existait dans le type et dans la base sans être
 * saisissable nulle part. Le jumeau oublié, une fois de plus : `LigneSerie`
 * bascule bien, `series` du modèle non.
 *
 * LES VALEURS DE L'AUTRE MODE NE SONT PAS EFFACÉES en basculant. Un aller-retour
 * Charge → Tenue → Charge doit rendre les kilos qu'on avait saisis ; les jeter
 * au passage serait détruire une donnée que l'utilisateur n'a pas demandé à
 * supprimer (règle 6 : vide veut dire « je ne sais pas »).
 */
export function SerieModele({ serie, mode, index, onChange, onSupprimer }: {
  serie: ModeleSerie;
  mode: ModeTravail;
  index: number;
  onChange: (s: ModeleSerie) => void;
  onSupprimer: () => void;
}) {
  return (
    <View style={s.serie}>
      <Discret style={{ width: 22 }}>{index + 1}</Discret>

      {/* Le même partage que `LigneSerie` : en « for time » comme en charge, on
          prescrit ce qu'il y a à soulever. Les jumeaux de ses champs, et le même
          défaut qu'eux : la virgule effacée pendant la frappe, `|| 0` pour
          l'illisible — et ici en plus `nb()`, qui arrondissait 42,25 en « 42.3 »
          dans le champ même. Corrigés ensemble le 15 septembre 2026. */}
      {(mode === 'charge' || mode === 'chrono') && (
        <>
          <ChampNombre
            valeur={serie.repsCible}
            onChange={(n) => onChange({ ...serie, repsCible: n })}
            entier
            placeholder="—" unite="rép" style={{ flex: 1 }}
          />
          <ChampNombre
            valeur={serie.poidsCible}
            onChange={(n) => onChange({ ...serie, poidsCible: n })}
            placeholder="—" unite="kg" style={{ flex: 1 }}
          />
        </>
      )}

      {/* La tenue isométrique se prescrit en secondes. En séance, la même ligne
          porte un chronomètre (`ChronoEffort`) : là on mesure, ici on annonce. */}
      {mode === 'iso' && (
        <ChampNombre
          valeur={serie.secondesCible}
          onChange={(n) => onChange({ ...serie, secondesCible: n })}
          entier
          placeholder="—" unite="s" style={{ flex: 1 }}
        />
      )}

      {/* Le libellé n'est pas décoratif : un lecteur d'écran annonce « × » comme
          « signe multiplication », ou ne dit rien. Celui de la séance en a un
          depuis le 15 septembre 2026 ; son jumeau du modèle, non. */}
      <Pressable
        onPress={onSupprimer}
        style={s.sup}
        accessibilityLabel={`Supprimer la série ${index + 1}`}
      >
        <Discret style={{ fontSize: T.grand }}>×</Discret>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  serie: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  sup: { width: 32, minHeight: TOUCHE, alignItems: 'center', justifyContent: 'center' },
});
