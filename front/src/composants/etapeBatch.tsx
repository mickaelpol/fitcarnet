import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEnregistrerPlan } from '@/api/hooks';
import { Bouton, Carte, Champ, Discret, Texte, Vide } from './base';
import { LigneComplements } from './complements';
import { Etapes } from './etapes';
import { Pliant } from './pliant';
import { EnteteBoite, LigneBoite, LigneQuantite } from './tablesPlan';
import { SR } from './stylesRepas';
import {
  type Boite, type Fournee, type Repas as RepasAPlat, figerLePlan,
} from '@/calcul/cuisson';
import type { Repas } from '@/solveur/composer';
import type { Aliment } from '@/solveur/types';
import { C, E, P, nb } from '@/theme';

/**
 * ÉTAPE 3 — LE BATCH COOKING : les courses, les fournées, les boîtes.
 *
 * Sortie de `app/(onglets)/repas.tsx` le 15 septembre 2026 (rang 11 du lot 6
 * de l'audit). Elle ne calcule rien : tout lui arrive déjà résolu, et c'est
 * la garantie qu'un regroupement d'affichage ne peut pas fausser un gramme.
 *
 * L'ORDRE DE CET ÉCRAN EST CELUI DES GESTES : ce qu'il faut aller chercher,
 * ce qu'on met à cuire, ce qu'on range dans les boîtes. Il ne se réordonne
 * pas pour faire joli.
 *
 * Ce que l'extraction a déplacé, et rien d'autre : `useEnregistrerPlan` vit
 * maintenant ici, où il est seul à servir. Conséquence visible, minuscule et
 * assumée — un message d'échec d'enregistrement ne survit plus à un aller-
 * retour vers l'écran de correction, alors qu'il restait affiché avant.
 * `nomDuPlan`, en revanche, RESTE chez le parent : le nom qu'on vient de
 * taper doit survivre à un retour en arrière pour corriger une quantité.
 *
 * Les trois tables viennent de `tablesPlan.tsx`, partagées avec l'écran d'un
 * plan relu (constat D9 : elles y étaient recopiées).
 */
export function EtapeBatch({
  aAcheter, parFournee, boites, plat, nomDeLaBoite,
  courses, onBasculerCourses,
  boiteOuverte, onBasculerBoite,
  nomDuPlan, onNomDuPlan,
  onRevenirEtape, onRevenirAuPlan, onEnregistre,
}: {
  aAcheter: readonly { aliment: Aliment; grammes: number }[];
  parFournee: readonly Fournee[];
  boites: readonly Boite[];
  /** le plan à plat : ce qui sort réellement du frigo, cuisson ou pas */
  plat: readonly RepasAPlat[];
  nomDeLaBoite: (cle: string) => string;
  courses: boolean;
  onBasculerCourses: () => void;
  boiteOuverte: string | null;
  onBasculerBoite: (cle: string) => void;
  nomDuPlan: string;
  onNomDuPlan: (v: string) => void;
  onRevenirEtape: (etape: number) => void;
  onRevenirAuPlan: () => void;
  onEnregistre: () => void;
}) {
  const enregistrerPlan = useEnregistrerPlan();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={SR.page}>
        {/* Revenir à « Jours » depuis ici efface le plan : les jours
            changés, les quantités ne veulent plus rien dire. On enlève donc
            les deux, plutôt que de garder un plan qui parle d'autre chose
            que ce que l'écran affiche. */}
        <Etapes courante={2} onRevenir={onRevenirEtape} />

        {aAcheter.length > 0 && (
          <Pliant
            titre="Liste de courses"
            resume={`${aAcheter.length} aliment${aAcheter.length > 1 ? 's' : ''} manquant`
              + `${aAcheter.length > 1 ? 's' : ''}`}
            ouvert={courses}
            onBascule={onBasculerCourses}
            teinte="jour"
          >
            <Discret style={SR.aide}>
              Ce qu'il manque pour cuisiner ce plan tel qu'il est prévu, ton
              frigo déjà déduit.
            </Discret>
            {aAcheter.map(({ aliment, grammes }) => (
              <LigneQuantite
                key={String(aliment.id)}
                nom={aliment.nom}
                categorie={aliment.categorie}
                grammes={grammes}
              />
            ))}
          </Pliant>
        )}

        {/* ---- les fournées ---- */}
        <Texte style={SR.titreEtape}>
          À cuire · {parFournee.length} fournée{parFournee.length > 1 ? 's' : ''}
        </Texte>
        {/* POURQUOI ON PÈSE SEC, dit une fois et à l'endroit où la question
            se pose — devant la balance, un riz annoncé à 80 g alors qu'on
            en servira 240 a l'air d'une erreur.

            Cuire n'ajoute que de l'EAU. 80 g de riz sec deviennent 240 g de
            riz cuit et n'ont pas gagné une calorie au passage ; le même riz
            cuit pèse trois fois plus pour les mêmes macros. Peser cuit
            obligerait donc à connaître le temps de cuisson, le couvercle,
            l'altitude — tout ce qui fait varier l'eau absorbée. Peser sec ne
            dépend de rien. */}
        <Discret style={SR.aide}>
          Ces poids sont ceux de la BALANCE, avant cuisson : riz sec, pâtes
          sèches, viande crue. La cuisson n'ajoute que de l'eau — elle change
          le poids, jamais les calories — et l'eau absorbée varie d'une fois
          sur l'autre. Sec, le chiffre est toujours le même. Tout ce qui
          partage une fournée part ensemble.
        </Discret>

        {parFournee.length === 0 && (
          <Vide message="Aucun aliment de ce plan ne se cuit. Il n'y a rien à mettre en fournée — passe directement aux boîtes." />
        )}

        {parFournee.map((f) => (
          <Carte key={f.mode.id} style={{ gap: E.xs }}>
            <Texte style={{ fontFamily: P.fort }}>{f.mode.libelle}</Texte>
            <Discret style={SR.aide}>
              {nb(f.lignes.reduce((n, l) => n + l.aCuire, 0))} g à peser en tout
            </Discret>
            {f.lignes.map((l) => (
              <LigneQuantite
                key={String(l.aliment.id)}
                nom={l.aliment.nom}
                categorie={l.aliment.categorie}
                grammes={l.aCuire}
              />
            ))}
          </Carte>
        ))}

        {/* ---- la répartition ---- */}
        <Texte style={SR.titreEtape}>
          À répartir · {boites.length} boîte{boites.length > 1 ? 's' : ''}
        </Texte>
        <Discret style={SR.aide}>
          Ces poids-là sont ceux du produit CUIT. La colonne « boîte » est ce
          qu'on y met pour tout le monde ; la colonne « 1 pers. », en doré,
          est ce que TU te sers le jour venu pour tenir tes macros.
        </Discret>

        {boites.map((b) => (
          <Pliant
            key={b.cle}
            titre={nomDeLaBoite(b.cle)}
            resume={`${nb(b.cuits.reduce((n, x) => n + x.assiette, 0))} g cuits`
              + (b.convives > 1 ? `  ·  ${b.convives} personnes` : '')
              + (b.crus.length > 0 ? `  ·  ${b.crus.length} à ajouter après` : '')}
            ouvert={boiteOuverte === b.cle}
            onBascule={() => onBasculerBoite(b.cle)}
          >
            <EnteteBoite />
            {b.cuits.map((x) => (
              <LigneBoite
                key={String(x.aliment.id)}
                nom={x.aliment.nom}
                categorie={x.aliment.categorie}
                assiette={x.assiette}
                parPersonne={x.parPersonne}
              />
            ))}

            {/* On ne met pas un skyr dans une boîte cinq jours à l'avance.
                Mais le taire ferait une boîte qui ne correspond plus au
                repas, et des macros fausses le jour venu. */}
            {b.crus.length > 0 && (
              <>
                <Discret style={SR.colTitre}>à ajouter au moment de manger</Discret>
                {b.crus.map((x) => (
                  <LigneBoite
                    key={String(x.aliment.id)}
                    nom={x.aliment.nom}
                    categorie={x.aliment.categorie}
                    assiette={x.assiette}
                    parPersonne={x.parPersonne}
                    attenue
                  />
                ))}
              </>
            )}

            {/* Les compléments de CE repas, dans la boîte qui le prépare.
                C'est l'endroit le plus juste : un complément ne se cuit
                pas et ne se range pas dans une boîte cinq jours à
                l'avance — il s'avale au moment de manger, comme le skyr
                au-dessus. */}
            <LigneComplements repas={b.cle.split('|')[1] as Repas} />
          </Pliant>
        ))}
      </ScrollView>

      <View style={[SR.pied, { paddingBottom: E.m + insets.bottom, gap: E.s }]}>
        {/* Sans enregistrement, il faudrait recomposer tout le plan le
            jeudi — avec un frigo qui a changé — pour lire un chiffre décidé
            le dimanche. Le nom est libre : « Semaine du 11/08 » ou ce qu'on
            veut, tant qu'on s'y retrouve. */}
        <Champ
          valeur={nomDuPlan}
          onChange={onNomDuPlan}
          placeholder="Semaine du 11/08"
          etiquette="Enregistrer ce plan sous"
        />
        <Bouton
          onPress={() => enregistrerPlan.mutate({
            libelle: nomDuPlan.trim(),
            /* `plat` porte ce que le plan prend au frigo, aliment par
               aliment, en poids PESÉ. Sans lui, l'instantané ne saurait pas
               ce qu'il consomme — il ne pourrait ni réserver son stock, ni
               le décrémenter au moment de cuisiner. */
            contenu: figerLePlan(aAcheter, parFournee, boites, nomDeLaBoite, plat),
          }, {
            onSuccess: onEnregistre,
          })}
          desactive={nomDuPlan.trim() === '' || enregistrerPlan.isPending}
        >
          {enregistrerPlan.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Bouton>
        {enregistrerPlan.isError && (
          <Discret style={[SR.aide, { color: C.erreur }]}>
            {enregistrerPlan.error.message}
          </Discret>
        )}
        <Bouton variante="contour" onPress={onRevenirAuPlan}>
          ← Revenir au plan
        </Bouton>
      </View>
    </View>
  );
}
