import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Bouton, Chargement, Erreur } from './base';
import { E } from '@/theme';

/**
 * LE CADRE DE L'ONGLET COMPTE — ET LA SORTIE QU'IL NE FERME JAMAIS.
 *
 * Constat É14, deuxième volet, corrigé le 15 septembre 2026.
 *
 * `app/(onglets)/compte.tsx` retournait son écran d'erreur par un `return`
 * précoce, et son bouton « Se déconnecter » quarante lignes plus bas. Dès que
 * `GET /api/moi` échouait, la seule façon de quitter une session disparaissait
 * de l'écran : réseau coupé, API en panne, jeton corrompu — on restait enfermé
 * dans un compte auquel l'application ne pouvait plus accéder.
 *
 * LE CHARGEMENT ENFERME AUTANT QUE L'ERREUR, et c'est moins évident.
 * `src/api/client.ts` ne pose aucun délai de garde : une requête qui pend
 * laisse `isPending` vrai indéfiniment. L'écran restait alors sur son rond qui
 * tourne, sans erreur à montrer et sans bouton pour sortir. Le bouton est donc
 * rendu dans les TROIS états.
 *
 * La leçon était déjà écrite dans `etatMaj.tsx` — le bouton de rafraîchissement
 * caché par le bug qu'il corrigeait — et pas appliquée ici. Le jumeau oublié,
 * motif n° 1 du projet.
 *
 * POURQUOI UN COMPOSANT, ET DANS `src/`. Un test posé dans `app/` n'est jamais
 * exécuté : `tsconfig.tests.json` ne compile que `src/`. Une garde qu'on ne
 * peut pas éprouver se re-perdra au prochain découpage de l'écran — c'est
 * précisément ce qui vient d'arriver. Le cadre vit donc ici, avec
 * `cadreCompte.test-rendu.tsx` en regard ; l'écran n'est plus que son câblage.
 *
 * IL NE SAIT RIEN DE L'API, ET C'EST VOULU : trois états et deux fonctions.
 * C'est ce qui le rend rendable dans un test sans monter React Query, sans
 * routeur et sans jeton.
 */
export interface CadreCompteProps {
  /** `'attente'` veut dire « je ne sais pas encore », jamais « il n'y a rien ». */
  etat: 'attente' | 'erreur' | 'pret';
  messageErreur: string;
  onReessayer: () => void;
  onDeconnexion: () => void;
  /** Le compte lui-même — affiché UNIQUEMENT quand on l'a reçu. */
  children: ReactNode;
}

export function CadreCompte({
  etat, messageErreur, onReessayer, onDeconnexion, children,
}: CadreCompteProps) {
  return (
    <ScrollView contentContainerStyle={s.page}>
      {etat === 'attente' && <Chargement />}

      {etat === 'erreur' && <Erreur message={messageErreur} onReessayer={onReessayer} />}

      {/* LE CONTENU RESTE CONDITIONNEL, et c'est la moitié qu'on perd en
          corrigeant l'autre. Rendre la sortie toujours visible ne doit pas
          rendre le reste toujours visible : l'écran réafficherait un nom en
          tiret et « Gérés dans l'onglet Mon frigo » comme un fait alors que
          rien n'a été reçu. Une information fausse présentée calmement est
          pire qu'une erreur — on la croit (règle 7). */}
      {etat === 'pret' && children}

      {/* HORS DE TOUTE CONDITION. C'est tout l'objet de ce composant : le jour
          où quelqu'un rajoute un état, la sortie sera déjà couverte. */}
      <Bouton variante="discret" onPress={onDeconnexion} style={{ marginTop: E.l }}>
        Se déconnecter
      </Bouton>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: E.m, gap: E.s },
});
