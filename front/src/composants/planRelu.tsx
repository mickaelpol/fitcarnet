import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PlanRepas } from '@/api/hooks';
import { useMarquerCuisine } from '@/api/hooks';
import { Bouton, Carte, Discret, Texte } from './base';
import { LigneComplements } from './complements';
import { Pliant } from './pliant';
import { EnteteBoite, LigneBoite, LigneQuantite } from './tablesPlan';
import { SR } from './stylesRepas';
import { estCuisine } from '@/calcul/cuisson';
import { C, E, P, nb } from '@/theme';

/**
 * « le mercredi 13/08 », ou rien du tout si la date est illisible.
 *
 * `new Date('n'importe quoi')` ne lève PAS : il rend un objet dont
 * `toLocaleDateString` écrit « Invalid Date » en toutes lettres, au milieu
 * d'une phrase. C'est ce qui s'est affiché sur un plan jamais cuisiné, et ça
 * a l'air d'un bug de données alors que c'est un bug de lecture.
 *
 * On préfère ne rien dire de la date que d'en dire une fausse : la phrase
 * reste juste sans elle.
 */
const dateCourte = (iso: string | null | undefined): string => {
  if (iso === null || iso === undefined || iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  return ` le ${d.toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: '2-digit',
  })}`;
};

/**
 * UN PLAN QU'ON RELIT — l'instantané, jamais recalculé.
 *
 * Sorti de `app/(onglets)/repas.tsx` le 15 septembre 2026 (rang 7 du lot 6 de
 * l'audit). Il y occupait 185 lignes au milieu de trois autres écrans, et il
 * n'avait AUCUNE variable commune avec eux : ni `plan`, ni `resultats`, ni
 * `plat`, ni `cuissons`, ni `stock`. La seule chose qu'il partageait était
 * accidentelle — les deux replis `courses` et `boiteOuverte`, hissés au
 * sommet du fichier et réutilisés par l'écran de batch cooking, qui n'est
 * jamais affiché en même temps. L'écran d'origine les remettait d'ailleurs à
 * zéro juste avant d'ouvrir un plan : ils sont donc simplement redevenus
 * locaux, à comportement identique.
 *
 * Les trois tables — courses, fournées, boîtes — viennent maintenant de
 * `tablesPlan.tsx`, partagées avec le batch cooking (constat D9).
 */
export function PlanRelu({
  plan, onCuisine, onFermer,
}: {
  plan: PlanRepas;
  /** le plan vient d'être déclaré cuisiné : au parent d'en tenir son état */
  onCuisine: () => void;
  onFermer: () => void;
}) {
  const marquerCuisine = useMarquerCuisine();
  const insets = useSafeAreaInsets();
  const [courses, setCourses] = useState(false);
  const [boiteOuverte, setBoiteOuverte] = useState<string | null>(null);

  const p = plan.contenu;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={SR.page}>
        <Carte style={{ gap: E.xs }}>
          <Texte style={{ fontFamily: P.fort }}>{plan.libelle}</Texte>
          <Discret style={SR.aide}>
            {/* Rien n'est recalculé ici, et c'est le point : le stock a
                bougé depuis, les cibles ont peut-être changé. On ne veut
                pas savoir ce qu'on cuisinerait aujourd'hui, on veut savoir
                ce qu'on a cuisiné ce jour-là. */}
            Ce plan est figé tel qu'il a été enregistré. Les quantités ne se
            recalculent pas : c'est ce que tu as cuisiné, pas ce que ton
            frigo permettrait aujourd'hui.
          </Discret>

          {/* L'ÉTAT DU PLAN, dit en toutes lettres. C'est lui qui explique
              pourquoi le calculateur trouve moins d'aliments qu'il n'y en a
              dans le frigo : ce qui est promis à un plan prévu n'est plus
              disponible pour le suivant. Sans cette ligne, on croirait à un
              bug du solveur. */}
          {!estCuisine(plan) ? (
            <Discret style={[SR.aide, { color: C.vif }]}>
              {(plan.contenu.consomme ?? []).length > 0
                ? 'Prévu. Les ingrédients de ce plan sont mis de côté : tes '
                  + 'prochains calculs ne comptent plus dessus.'
                /* Un plan version 1 ne sait pas ce qu'il prend au frigo. Le
                   TAIRE serait le pire des deux mondes : on croirait ses
                   ingrédients réservés alors que le plan suivant peut les
                   reprendre entièrement. C'est exactement comme ça que trois
                   plans se sont partagé 800 g de brocoli sur 500. */
                : 'Enregistré avant la mise de côté des ingrédients : ce plan '
                  + 'ne réserve rien, et tes prochains calculs peuvent '
                  + 'reprendre les mêmes aliments. Refais-en un pour que le '
                  + 'frigo soit compté juste.'}
            </Discret>
          ) : (
            <Discret style={[SR.aide, { color: C.ok }]}>
              Cuisiné{dateCourte(plan.cuisineLe)} · ton frigo a été
              décrémenté à ce moment-là.
            </Discret>
          )}
        </Carte>

        {/* Ce qui n'a pas pu être retiré du frigo. On le dit une seule fois,
            juste après l'appui, et on ne le devine jamais : un aliment
            disparu du frigo ne doit pas faire vider le bac voisin. */}
        {(marquerCuisine.data?.ignores ?? []).length > 0 && (
          <Carte style={{ gap: E.xs, backgroundColor: C.vifFond }}>
            <Texte style={{ fontFamily: P.fort }}>À retirer toi-même du frigo</Texte>
            {marquerCuisine.data!.ignores.map((x) => (
              <Discret key={x.nom} style={SR.aide}>• {x.nom} — {x.motif}</Discret>
            ))}
          </Carte>
        )}

        {p.courses.length > 0 && (
          <Pliant
            titre="Liste de courses"
            resume={`${p.courses.length} aliment${p.courses.length > 1 ? 's' : ''} manquant`
              + `${p.courses.length > 1 ? 's' : ''} ce jour-là`}
            ouvert={courses}
            onBascule={() => setCourses(!courses)}
            teinte="jour"
          >
            {p.courses.map((c) => (
              <LigneQuantite
                key={c.nom} nom={c.nom} categorie={c.categorie} grammes={c.grammes}
              />
            ))}
          </Pliant>
        )}

        <Texte style={SR.titreEtape}>
          À cuire · {p.fournees.length} fournée{p.fournees.length > 1 ? 's' : ''}
        </Texte>
        {p.fournees.map((f) => (
          <Carte key={f.libelle} style={{ gap: E.xs }}>
            <Texte style={{ fontFamily: P.fort }}>{f.libelle}</Texte>
            {f.lignes.map((l) => (
              <LigneQuantite
                key={l.nom} nom={l.nom} categorie={l.categorie} grammes={l.aCuire}
              />
            ))}
          </Carte>
        ))}

        <Texte style={SR.titreEtape}>
          À servir · {p.boites.length} boîte{p.boites.length > 1 ? 's' : ''}
        </Texte>
        <Discret style={SR.aide}>
          La colonne dorée est ce que TU te sers pour tenir tes macros.
        </Discret>

        {p.boites.map((b) => (
          <Pliant
            key={b.titre}
            titre={b.titre}
            resume={`${nb(b.cuits.reduce((n, x) => n + x.assiette, 0))} g cuits`
              + (b.convives > 1 ? `  ·  ${b.convives} personnes` : '')}
            ouvert={boiteOuverte === b.titre}
            onBascule={() => setBoiteOuverte(boiteOuverte === b.titre ? null : b.titre)}
          >
            <EnteteBoite />
            {[...b.cuits, ...b.crus].map((x) => (
              <LigneBoite
                key={x.nom}
                nom={x.nom}
                categorie={x.categorie}
                assiette={x.assiette}
                parPersonne={x.parPersonne}
              />
            ))}

            {/* LES COMPLÉMENTS NE SONT PAS FIGÉS DANS LE PLAN, ET C'EST
                DÉLIBÉRÉ. Le reste de cet écran est un instantané : les
                quantités du dimanche, relues le jeudi. Les compléments,
                eux, sont une consigne COURANTE — en rouvrant ce plan on
                veut savoir ce qu'on prend aujourd'hui, pas ce qu'on prenait
                quand on l'a enregistré. On les relit donc à chaque
                affichage, et changer sa routine met à jour les plans déjà
                faits.

                `b.repas` manque aux plans enregistrés avant que ce champ
                existe (versions 1 et 2). Ces boîtes-là n'affichent rien,
                plutôt que d'aller deviner le repas en relisant leur titre. */}
            {b.repas !== undefined && <LigneComplements repas={b.repas} />}
          </Pliant>
        ))}
      </ScrollView>

      <View style={[SR.pied, { paddingBottom: E.m + insets.bottom, gap: E.s }]}>
        {/* LE GESTE QUI REND LE FRIGO HONNÊTE.
            Tant qu'on ne l'a pas fait, ce plan met ses ingrédients de côté :
            le calcul suivant ne compte plus dessus, mais le frigo, lui, est
            encore plein. L'appui fait basculer les deux d'un coup — le stock
            baisse vraiment, la mise de côté tombe. Les séparer laisserait,
            au moindre incident, soit un stock déduit deux fois, soit un
            frigo intact pour un plan déclaré cuisiné. */}
        {!estCuisine(plan) && (
          <>
            <Bouton
              onPress={() => marquerCuisine.mutate(plan.id, {
                /* On recharge le plan depuis la liste plutôt que de bricoler
                   l'état local : c'est le serveur qui date la cuisson, et
                   recopier une date à la main ferait deux vérités. */
                onSuccess: onCuisine,
              })}
              desactive={marquerCuisine.isPending}
            >
              {marquerCuisine.isPending
                ? 'Déduction en cours…'
                : "J'ai cuisiné — retirer du frigo"}
            </Bouton>
            <Discret style={SR.aide}>
              Les quantités de ce plan seront retirées de ton stock, en poids
              pesé. À faire une fois les casseroles vidées.
            </Discret>
          </>
        )}
        {marquerCuisine.isError && (
          <Discret style={[SR.aide, { color: C.erreur }]}>
            {marquerCuisine.error.message}
          </Discret>
        )}
        <Bouton variante="contour" onPress={() => { onFermer(); marquerCuisine.reset(); }}>
          ← Fermer
        </Bouton>
      </View>
    </View>
  );
}
