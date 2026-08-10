import { Pressable, StyleSheet, View } from 'react-native';

import { Discret, Texte } from './base';
import { C, E, P, R, T, TOUCHE } from '@/theme';

/**
 * OÙ TU EN ES, ET COMBIEN IL EN RESTE.
 *
 * Le calculateur demande trois choses à la suite : quand tu manges, avec
 * quoi, et comment tu le cuis. Vues une par une, chacune est simple ; vues
 * une par une, on ne sait jamais si la suivante est la dernière. Un écran qui
 * enchaîne des étapes sans dire combien il y en a se lit comme un formulaire
 * sans fin, et on abandonne au deuxième.
 *
 * TROIS PASTILLES, PAS UNE BARRE DE PROGRESSION. Une barre dirait « 66 % » —
 * un pourcentage de quoi ? Les trois étapes portent des NOMS, parce que c'est
 * le nom qui dit ce qu'on va devoir faire.
 *
 * ON PEUT REVENIR EN ARRIÈRE EN TOUCHANT UNE ÉTAPE FRANCHIE, et c'est la
 * moitié de l'intérêt du composant. Sans cela, revenir passe par le bouton
 * « ← » du bas, qu'il faut chercher, et qui ne remonte que d'un cran.
 * On n'avance jamais par ici : une étape pas encore atteinte n'est pas un
 * raccourci, c'est un travail qui n'est pas fait.
 */

/* Des noms de GESTES, pas de fonctions. « Jours » et non « paramétrage »,
   « Cuisiner » et non « batch cooking » : on nomme ce qu'on va faire, dans les
   mots de quelqu'un qui prépare à manger. */
export const ETAPES = ['Jours', 'Repas', 'Cuisiner'] as const;

export function Etapes({ courante, onRevenir }: {
  /** 0, 1 ou 2 */
  courante: number;
  /** revenir à une étape déjà franchie ; absent = indicateur seul */
  onRevenir?: (etape: number) => void;
}) {
  return (
    <View style={s.rangee} accessibilityRole="tablist">
      {ETAPES.map((nom, i) => {
        const faite = i < courante;
        const ici = i === courante;
        /* Une étape à venir ne se touche pas : y sauter donnerait un écran de
           cuisson sur un plan qui n'existe pas. */
        const accessible = faite && onRevenir !== undefined;

        return (
          <Pressable
            key={nom}
            onPress={() => accessible && onRevenir(i)}
            disabled={!accessible}
            style={s.etape}
            accessibilityRole="tab"
            accessibilityState={{ selected: ici, disabled: !accessible && !ici }}
            accessibilityLabel={`Étape ${i + 1} sur ${ETAPES.length} : ${nom}`}
          >
            <View style={[s.rond, faite && s.rondFait, ici && s.rondIci]}>
              {/* Une étape franchie porte une COCHE et non son numéro : le
                  numéro dit où elle est dans la liste, la coche dit qu'elle
                  est réglée — et c'est la seule chose qu'on cherche en la
                  regardant. */}
              <Texte style={[s.numero, (faite || ici) && s.numeroFort]}>
                {faite ? '✓' : i + 1}
              </Texte>
            </View>
            {ici
              ? <Texte style={s.nomIci} numberOfLines={1}>{nom}</Texte>
              : <Discret style={s.nom} numberOfLines={1}>{nom}</Discret>}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  rangee: { flexDirection: 'row', alignItems: 'flex-start', gap: E.xs },
  etape: {
    flex: 1, alignItems: 'center', gap: 4, minHeight: TOUCHE, paddingVertical: 4,
  },
  rond: {
    width: 26,
    height: 26,
    /* R.xl dépasse la moitié de 26 : React Native ramène le rayon à la moitié
       du côté, donc un rond parfait sans écrire un second nombre ici. */
    borderRadius: R.xl,
    borderWidth: 1, borderColor: C.ligne,
    alignItems: 'center', justifyContent: 'center',
  },
  rondFait: { backgroundColor: C.okFond, borderColor: C.ok },
  rondIci: { backgroundColor: C.vifFond, borderColor: C.vif },
  numero: { fontFamily: P.chiffre, fontSize: T.petit, color: C.discret },
  numeroFort: { color: C.encre },
  nom: { fontSize: T.minuscule },
  nomIci: { fontFamily: P.fort, fontSize: T.minuscule, color: C.vif },
});
