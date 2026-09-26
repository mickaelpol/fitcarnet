import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Champ, Discret, Texte } from './base';
import type { AlimentReference } from '../api/types';
import { nombreSaisi } from '../calcul/saisieNombre';
import { C, E, R, T, TOUCHE } from '../theme';

/**
 * « ÇA RESSEMBLE À… » : rattacher un aliment au catalogue CIQUAL.
 *
 * Posé le 20 septembre 2026. Ce champ répond à une crainte précise du
 * propriétaire du projet : *« si l'utilisateur crée un aliment "Poulet" ou
 * "poulets" […] est-ce que ça va faire le lien ? »*
 *
 * LE NOM RESTE LIBRE, LE RATTACHEMENT NON. Deux champs et non un : la demande
 * initiale était de n'autoriser que les noms du catalogue, et ça aurait cassé
 * un vrai frigo. CIQUAL est une table d'aliments GÉNÉRIQUES — mesuré le jour
 * même, « Orangina » n'y est pas, ni « Skyr nature Milbona ». Bloqué,
 * quelqu'un choisirait le plus proche pour avancer : pas un rattachement
 * juste, un rattachement FAUX, que la base de connaissance croirait ensuite
 * sur parole.
 *
 * ON PROPOSE, ON NE DEVINE PAS. Rapprocher « poulets » de « poulet » tout seul,
 * c'est choisir à la place de quelqu'un — et rattacher un jour « pâté » à
 * « pâtes » sans que personne le voie. C'est la personne qui tape sur la ligne,
 * et ce qu'on enregistre est le CODE : renommer ensuite ne casse rien.
 *
 * ET IL NE REMPLIT JAMAIS LES MACROS. « Un riz basmati acheté par
 * l'utilisateur A peut ne pas avoir les mêmes macros que celui de
 * l'utilisateur B » : l'étiquette d'un paquet est la vérité pour CET aliment.
 * Les valeurs du catalogue ne servent qu'à l'avertissement ci-dessous.
 *
 * IL NE FAIT AUCUN APPEL RÉSEAU, ET C'EST UNE CORRECTION DU MÊME JOUR. Sa
 * première écriture appelait `useAlimentsReference` elle-même : deux tests de
 * rendu sont tombés aussitôt, parce qu'`EditeurAliment` — qui l'accueille —
 * est un composant PUR, monté sans client HTTP. Importer le hook y tirait tout
 * `api/client.ts`, donc `expo-secure-store`, absent de l'environnement de test.
 *
 * La recherche vit donc chez l'appelant connecté, et ce composant ne fait
 * qu'afficher. C'est la séparation que le dossier porte déjà entre
 * `EditeurAliment` et `EditeurAlimentConnecte`.
 */
export function ChampRattachement({
  valeur, nomAliment, kcalTapees, recherche, resultats, onRecherche, onChange,
}: {
  /** le code CIQUAL retenu, `null` tant qu'on n'a rien choisi */
  valeur: string | null;
  /** sert d'invite : on part de ce que la personne a déjà tapé comme nom */
  nomAliment: string;
  /**
   * Les calories TELLES QUE TAPÉES, pour l'avertissement d'écart.
   *
   * UN TEXTE DEPUIS LE 26 SEPTEMBRE 2026 : l'éditeur ne lit plus aucun nombre
   * (`lectureAuServeur.test.ts`). Cet avertissement, lui, se juge ENCORE à
   * l'écran — le seul jugement de l'éditeur resté au front, DÉCLARÉ en dette
   * dans `docs/etat/prochaines-etapes.md`. Il ne bloque rien : il invite à
   * relire l'étiquette.
   */
  kcalTapees: string;
  /** la recherche en cours, tenue par l'appelant qui interroge le serveur */
  recherche: string;
  resultats: AlimentReference[];
  onRecherche: (q: string) => void;
  onChange: (code: string | null, choisi: AlimentReference | null) => void;
}) {
  const [choisi, setChoisi] = useState<AlimentReference | null>(null);

  if (valeur !== null && choisi !== null) {
    return (
      <View style={s.bloc}>
        <Discret style={s.etiquette}>Ça ressemble à</Discret>
        <View style={s.retenu}>
          <View style={{ flex: 1 }}>
            <Texte numberOfLines={2}>{choisi.nom}</Texte>
            <Discret style={{ fontSize: T.petit }}>{choisi.sousgroupe}</Discret>
          </View>
          <Pressable
            onPress={() => { setChoisi(null); onRecherche(''); onChange(null, null); }}
            style={s.changer}
            accessibilityRole="button"
            accessibilityLabel="Changer le rattachement"
          >
            <Discret style={{ color: C.vif }}>Changer</Discret>
          </Pressable>
        </View>
        <Ecart choisi={choisi} kcalSaisies={nombreSaisi(kcalTapees)} />
      </View>
    );
  }

  return (
    <View style={s.bloc}>
      <Champ
        etiquette="Ça ressemble à"
        valeur={recherche}
        onChange={onRecherche}
        placeholder="poulet, riz, yaourt…"
      />
      {/* « CRU » ET « SEC », ET CE N'EST PAS UN DÉTAIL DE VOCABULAIRE.
          CIQUAL porte souvent deux entrées pour le même aliment — « Riz blanc,
          cru » à 350 kcal et « Riz blanc, cuit » à 155. La règle 3 du projet
          impose le produit TEL QU'ON LE PÈSE, donc le cru.

          Mesuré le 20 septembre 2026 : rattacher un riz sec à l'entrée cuite
          donne un rapport de 2,26 — au-dessus du seuil de 2 — et déclenche
          l'avertissement d'écart sur CHAQUE féculent. On apprend alors à
          l'ignorer, et il ne sert plus à rien le jour où il a raison. */}
      <Discret style={s.aide}>
        Ce que c'est, en général — pas la marque. Choisis la version{' '}
        <Texte style={s.aide}>crue ou sèche</Texte> quand les deux existent :
        c'est ainsi que tu le pèses. Tes valeurs, elles, restent celles de ton
        paquet.
      </Discret>

      {/* PARTIR DU NOM DÉJÀ TAPÉ, MAIS EN LE DEMANDANT.
          La première écriture mettait ce nom en INVITE du champ — le texte
          grisé. Mesuré le 20 septembre 2026 : quelqu'un tape « poulet » dans
          « Nom », voit « poulet » apparaître sous « Ça ressemble à », croit le
          champ rempli, et ne comprend pas pourquoi rien ne se cherche. Le
          champ était vide ; c'est l'invite qui mentait.

          Une invite décrit ce qu'on ATTEND, elle ne propose pas une valeur.
          Le raccourci est donc un bouton : un geste, visible, qui remplit
          vraiment le champ. */}
      {recherche.trim() === '' && nomAliment.trim() !== '' && (
        <Pressable
          onPress={() => onRecherche(nomAliment.trim())}
          style={s.raccourci}
          accessibilityRole="button"
        >
          <Discret style={{ color: C.vif }}>
            Chercher « {nomAliment.trim()} »
          </Discret>
        </Pressable>
      )}

      {resultats.map((r) => (
        <Pressable
          key={r.code}
          onPress={() => { setChoisi(r); onRecherche(''); onChange(r.code, r); }}
          style={s.ligne}
          accessibilityRole="button"
        >
          <Texte numberOfLines={2} style={{ flex: 1 }}>{r.nom}</Texte>
          <Discret style={{ fontSize: T.minuscule }}>{r.sousgroupe}</Discret>
        </Pressable>
      ))}

      {/* RIEN TROUVÉ N'EST PAS UNE ERREUR, et le dire évite de bloquer.
          Une marque n'est pas dans CIQUAL ; l'aliment s'enregistre quand
          même. Ce qu'on perd est la proposition en repas, pas la pesée. */}
      {recherche.trim().length >= 2 && resultats.length === 0 && (
        <Discret style={s.aide}>
          Rien de ce nom dans le catalogue. Essaie le nom générique — « soda »
          plutôt que la marque. Tu peux aussi laisser vide : l'aliment se pèse
          et se mange quand même, il ne sera simplement pas proposé dans un repas.
        </Discret>
      )}
    </View>
  );
}

/**
 * L'AVERTISSEMENT D'ÉCART — le seul usage des valeurs du catalogue.
 *
 * Le serveur accepte aujourd'hui 90 kcal pour un riz qui en fait 350 (mesuré
 * le 19 septembre 2026). Ce n'est pas une faute de sa part : un produit allégé
 * ou enrichi s'écarte légitimement, et refuser serait pire. Mais une saisie à
 * un tiers de la valeur de son type mérite un regard.
 *
 * CE N'EST NI UN REFUS NI UNE CORRECTION. On ne remplace rien, on ne bloque
 * rien : on invite à relire l'étiquette. C'est la règle 7 dans son sens le plus
 * exact — on affiche l'incertitude plutôt qu'un chiffre qu'on n'a pas vérifié.
 */
function Ecart({
  choisi, kcalSaisies,
}: {
  choisi: AlimentReference;
  kcalSaisies: number | null;
}) {
  const reference = choisi.kcal100;

  if (reference === null || reference <= 0 || kcalSaisies === null || kcalSaisies <= 0) {
    return null;
  }

  /* MOITIÉ MOINS OU DEUX FOIS PLUS. Le seuil est volontairement large : entre
     un yaourt nature et un yaourt entier il y a un facteur deux, et crier
     dessus apprendrait à ignorer l'avertissement. */
  const rapport = kcalSaisies / reference;
  if (rapport > 0.5 && rapport < 2) return null;

  return (
    <Discret style={[s.aide, { color: C.vif }]}>
      Tu as saisi {kcalSaisies} kcal ; un « {choisi.nom} » en fait environ
      {' '}{reference}. Les deux sont possibles — vérifie quand même ton étiquette.
    </Discret>
  );
}

const s = StyleSheet.create({
  bloc: { gap: E.xs },
  etiquette: { fontSize: T.petit, color: C.attenue },
  aide: { fontSize: T.petit, lineHeight: 17, color: C.attenue },
  retenu: {
    flexDirection: 'row', alignItems: 'center', gap: E.s,
    borderWidth: 1, borderColor: C.ligne, borderRadius: R.m, padding: E.m,
  },
  changer: { minHeight: TOUCHE, justifyContent: 'center', paddingHorizontal: E.s },
  raccourci: { minHeight: TOUCHE, justifyContent: 'center' },
  ligne: {
    flexDirection: 'row', alignItems: 'center', gap: E.s,
    minHeight: TOUCHE, paddingVertical: E.xs, paddingHorizontal: E.m,
    borderBottomWidth: 1, borderBottomColor: C.ligne,
  },
});
