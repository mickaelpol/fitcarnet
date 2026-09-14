/**
 * Les sept bandeaux de l'en-tête de « Mon frigo ».
 *
 * Extraits de `app/(onglets)/frigo.tsx` le 15 septembre 2026 (rang 9 du lot 6
 * de l'audit), sans changement de comportement. Ils ne lisent que des dérivés
 * et ne posent aucun état : c'est ce qui rendait l'extraction sûre.
 *
 * Les propriétés sont volontairement DÉCOUPÉES EN « la condition » et « le
 * message » plutôt que rassemblées en un `string | null`. Un message vide
 * n'est pas l'absence de message : le 14 août 2026, une bannière a affirmé
 * « L'aliment a bien été créé » à quelqu'un qui n'avait rien créé, parce
 * qu'elle écoutait une autre mutation que celle dont elle parlait. Chaque
 * bandeau ne doit dépendre que du geste qui produit son fait.
 */

import { StyleSheet, View } from 'react-native';
import { Discret } from './base';
import type { AlimentDisponible } from '../api/types';
import type { EchecInventaire } from '../api/hooks';
import { C, E, R, T } from '../theme';

export function AlertesFrigo({
  erreurSuppression,
  quantiteEnEchec, messageQuantite,
  enCoursDEnvoi, traites, total,
  inventaireFini, echecs,
  sansPoids, probleme, bloquants, sansFibres,
}: {
  /** motif du refus de suppression ; `null` tant qu'aucune n'a échoué */
  erreurSuppression: string | null;
  quantiteEnEchec: boolean;
  messageQuantite?: string;
  enCoursDEnvoi: boolean;
  traites: number;
  total: number;
  inventaireFini: boolean;
  echecs: EchecInventaire[];
  sansPoids: AlimentDisponible[];
  probleme?: string | null;
  /** nombre de produits Grocy sans macros : ils n'apparaissent pas dans la liste */
  bloquants: number;
  sansFibres: { nom: string }[];
}) {
  return (
    <>
      {erreurSuppression !== null && (
        <View style={s.alerte}>
          <Discret style={{ color: C.erreur, fontSize: T.petit, lineHeight: 17 }}>
            {erreurSuppression}
          </Discret>
        </View>
      )}

      {/* La création se fait en deux temps : l'aliment, puis sa quantité.
          Si le second échoue, le premier est déjà passé — le taire laisserait
          croire que rien n'a été fait, et l'utilisateur recréerait un
          doublon. On nomme donc précisément ce qui a marché.

          CE MESSAGE NE PARLE QUE DE LA CRÉATION, et il a fallu une panne
          pour s'en assurer. Il écoutait aussi `envoyer`, la mutation de
          l'inventaire complet : le 14 août 2026, un inventaire de quarante
          lignes a échoué et l'écran a répondu « L'aliment a bien été créé »
          à quelqu'un qui n'avait rien créé. Une bannière qui affirme un fait
          doit dépendre du seul geste qui produit ce fait. */}
      {quantiteEnEchec && (
        <View style={s.alerte}>
          <Discret style={{ color: C.erreur, fontSize: T.petit, lineHeight: 17 }}>
            L'aliment a bien été créé, mais sa quantité n'a pas pu être posée :
            {' '}{messageQuantite}.
            {' '}Renseigne-la depuis l'inventaire.
          </Discret>
        </View>
      )}

      {/* L'INVENTAIRE, PENDANT ET APRÈS — ICI ET NULLE PART AILLEURS.
          Dans l'en-tête et non dans le pied du mode inventaire : l'envoi
          continue quand on quitte l'écran, et le résultat doit se voir au
          retour, quel que soit le mode où l'on revient. Le chiffre vient du
          serveur, pas d'un compteur local : il survit à la fermeture de
          l'application. */}
      {enCoursDEnvoi && (
        <View style={s.alerte}>
          <Discret style={{ color: C.discret, fontSize: T.petit, lineHeight: 17 }}>
            Inventaire en cours — {traites} / {total}
            {' '}ligne(s). Tu peux quitter l'écran, ça continue tout seul.
          </Discret>
        </View>
      )}

      {inventaireFini && (
        <View style={s.alerte}>
          <Discret
            style={{
              color: echecs.length > 0 ? C.erreur : C.ok,
              fontSize: T.petit,
              lineHeight: 17,
            }}
          >
            {echecs.length === 0
              ? `Inventaire appliqué : ${traites} correction(s).`
              : `Inventaire appliqué : `
                + `${traites - echecs.length} correction(s), `
                + `${echecs.length} refusée(s) — `
                + echecs.map((e) => e.motif).join(' · ')}
          </Discret>
        </View>
      )}

      {sansPoids.length > 0 && (
        <View style={s.alerte}>
          <Discret style={{ color: C.attenue, fontSize: T.petit, lineHeight: 17 }}>
            {sansPoids.length} produit(s) sans poids connu
            {' ('}{sansPoids.map((a) => `${a.nom} en ${a.unite}`).join(', ')}
            {'). '}
            Les macros sont données pour 100 g : le calculateur les écarte.
            Déclare la conversion dans Grocy — « 1 {sansPoids[0]?.unite} = … g »
            sur la fiche produit — ou passe-les au gramme.
          </Discret>
        </View>
      )}

      {probleme !== null && probleme !== undefined && (
        <View style={s.alerte}>
          <Discret style={{ color: C.vif, fontSize: T.normal, lineHeight: 18 }}>
            {probleme}
          </Discret>
        </View>
      )}

      {/* Deux manques, deux conséquences opposées. Un aliment sans macros
          disparaît — on le voit. Un aliment sans fibres reste là et fausse
          en silence une cible exprimée en glucides totaux : c'est le plus
          dangereux des deux, et il mérite sa propre alerte. */}
      {bloquants > 0 && (
        <View style={s.alerte}>
          <Discret style={{ color: C.attenue, fontSize: T.petit, lineHeight: 17 }}>
            {bloquants} produit(s) Grocy sans valeurs nutritionnelles :
            ils n'apparaissent pas ici et restent invisibles au calculateur.
            Renseigne-les dans Grocy pour les utiliser.
          </Discret>
        </View>
      )}

      {sansFibres.length > 0 && (
        <View style={[s.alerte, { borderColor: C.vif }]}>
          <Discret style={{ color: C.vif, fontSize: T.petit, lineHeight: 17 }}>
            ⚠ {sansFibres.length} aliment(s) sans fibres renseignées :
            {' '}{sansFibres.slice(0, 4).map((p) => p.nom).join(', ')}
            {sansFibres.length > 4 ? '…' : ''}. Ils restent utilisables, mais
            une cible en glucides totaux les compte à zéro fibre et vise trop
            haut, sans rien signaler.
          </Discret>
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  alerte: { backgroundColor: C.vifFond, borderRadius: R.s, padding: E.s },
});
