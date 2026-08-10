import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  useCreerModeCuisson, useMajModeCuisson, useModesCuisson, useMoi,
  useSupprimerModeCuisson,
} from '@/api/hooks';
import type { ModeCuisson } from '@/calcul/cuisson';
import { Bouton, Carte, Champ, Chargement, Discret, Erreur, Texte, Vide } from '@/composants/base';
import { Confirmer } from '@/composants/confirmer';
import { C, E, P, T } from '@/theme';

/**
 * ÉCRAN D'ADMINISTRATION : les façons de cuire.
 *
 * POURQUOI CET ÉCRAN EXISTE
 *
 * La table `mode_cuisson` est partagée par tous les comptes et seul
 * l'administrateur peut y écrire. C'était vrai côté API depuis le début, mais
 * il n'y avait aucune interface pour le faire : ajouter « Plancha » demandait
 * un appel HTTP à la main. Une permission sans écran est une permission que
 * personne n'exerce.
 *
 * POURQUOI UNE LISTE FERMÉE, ET NON UN CHAMP LIBRE PAR UTILISATEUR
 *
 * C'est délibérément plus rigide. Un champ libre finirait avec « four »,
 * « Four », « au four » et « four 180 » — quatre fournées là où il en faut
 * une, et le batch cooking perdrait tout son sens. Un utilisateur qui veut
 * « Plancha » le demande, et ça s'ajoute ici.
 *
 * L'ORDRE COMPTE PLUS QU'IL N'EN A L'AIR. On ne trie pas par ordre
 * alphabétique : « Air fryer » n'a aucune raison de passer avant « Vapeur ».
 * Les cuissons les plus courantes en haut, parce que ce sont celles qu'on
 * choisit trente fois par semaine.
 *
 * SUPPRIMER UN MODE EMPORTE LES HABITUDES QUI LE VISAIENT. C'est voulu : une
 * habitude orpheline se retrouverait pré-remplie « se mange tel quel », donc
 * une réponse fausse et muette, découverte devant la boîte. La question est
 * reposée à la place. On le dit avant de supprimer.
 */
export default function AdminCuissons() {
  const moi = useMoi();
  const modes = useModesCuisson();
  const creer = useCreerModeCuisson();
  const maj = useMajModeCuisson();
  const supprimer = useSupprimerModeCuisson();

  const [libelle, setLibelle] = useState('');
  /* Un brouillon par mode : on saisit sans envoyer à chaque frappe, et on
     n'enregistre que ce qui a réellement changé. */
  const [brouillons, setBrouillons] = useState<Record<number, string>>({});
  const [aSupprimer, setASupprimer] = useState<ModeCuisson | null>(null);

  if (moi.isLoading || modes.isLoading) return <Chargement />;
  if (!moi.data?.roles?.includes('ROLE_ADMIN')) {
    return <Vide message="Cet écran est réservé à l'administrateur." />;
  }
  if (modes.isError) {
    return <Erreur message={modes.error.message} onReessayer={() => void modes.refetch()} />;
  }

  const liste = modes.data ?? [];

  /* Le prochain rang, dix crans après le dernier. Les pas de dix laissent la
     place d'intercaler un mode entre deux existants sans avoir à renuméroter
     toute la liste. */
  const prochainOrdre = liste.length === 0
    ? 10
    : Math.max(...liste.map((m) => m.ordre)) + 10;

  const deja = (v: string) => liste.some(
    (m) => m.libelle.trim().toLowerCase() === v.trim().toLowerCase());

  const decaler = (mode: ModeCuisson, sens: -1 | 1) => {
    const index = liste.findIndex((m) => m.id === mode.id);
    const voisin = liste[index + sens];
    if (voisin === undefined) return;

    /* On ÉCHANGE les deux rangs plutôt que d'incrémenter : incrémenter finit
       par produire deux modes de même rang, et l'ordre devient celui de
       l'alphabet — c'est-à-dire n'importe lequel. */
    maj.mutate({ id: mode.id, ordre: voisin.ordre });
    maj.mutate({ id: voisin.id, ordre: mode.ordre });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.page}>
        <Discret style={s.aide}>
          Ces façons de cuire sont partagées par tous les comptes. Deux aliments
          partent dans la même fournée s'ils portent la même ligne d'ici — donc
          « Four 180 °C » et « Four 200 °C » sont deux lignes, pas une avec une
          température.
        </Discret>

        <Carte style={{ gap: E.s }}>
          <Texte style={{ fontFamily: P.fort }}>Ajouter une façon de cuire</Texte>
          <Champ
            valeur={libelle}
            onChange={setLibelle}
            placeholder="Plancha"
            etiquette="Libellé"
          />
          <Discret style={s.aide}>
            Écris-la comme elle doit apparaître dans le sélecteur, température
            comprise s'il y en a une. Elle sera ajoutée en bas de la liste ;
            tu pourras la remonter ensuite.
          </Discret>
          {deja(libelle) && libelle.trim() !== '' && (
            <Discret style={[s.aide, { color: C.vif }]}>
              Cette façon de cuire existe déjà. En ajouter une seconde ferait
              deux fournées là où il en faut une.
            </Discret>
          )}
          <Bouton
            onPress={() => creer.mutate(
              { libelle: libelle.trim(), ordre: prochainOrdre },
              { onSuccess: () => setLibelle('') },
            )}
            desactive={libelle.trim() === '' || deja(libelle) || creer.isPending}
          >
            {creer.isPending ? 'Ajout…' : 'Ajouter'}
          </Bouton>
          {creer.isError && (
            <Discret style={[s.aide, { color: C.erreur }]}>{creer.error.message}</Discret>
          )}
        </Carte>

        <Texte style={s.titre}>
          {liste.length} façon{liste.length > 1 ? 's' : ''} de cuire
        </Texte>

        {liste.length === 0 && (
          <Vide message="Aucune façon de cuire. Le batch cooking ne pourra grouper aucune fournée tant qu'il n'y en a pas." />
        )}

        {liste.map((m, i) => {
          const brouillon = brouillons[m.id] ?? m.libelle;
          const modifie = brouillon.trim() !== m.libelle && brouillon.trim() !== '';

          return (
            <Carte key={m.id} style={{ gap: E.s }}>
              <View style={s.ligne}>
                <Champ
                  valeur={brouillon}
                  onChange={(v) => setBrouillons((b) => ({ ...b, [m.id]: v }))}
                  style={{ flex: 1 }}
                />
                {/* Monter et descendre plutôt qu'un champ « ordre » : personne
                    ne veut choisir un nombre, on veut juste que la vapeur
                    passe avant le four. */}
                <Bouton
                  variante="contour"
                  onPress={() => decaler(m, -1)}
                  desactive={i === 0 || maj.isPending}
                  style={s.fleche}
                >
                  ↑
                </Bouton>
                <Bouton
                  variante="contour"
                  onPress={() => decaler(m, 1)}
                  desactive={i === liste.length - 1 || maj.isPending}
                  style={s.fleche}
                >
                  ↓
                </Bouton>
              </View>

              <View style={s.ligne}>
                <Bouton
                  variante="contour"
                  onPress={() => maj.mutate(
                    { id: m.id, libelle: brouillon.trim() },
                    { onSuccess: () => setBrouillons((b) => {
                      const suite = { ...b };
                      delete suite[m.id];

                      return suite;
                    }) },
                  )}
                  desactive={!modifie || maj.isPending}
                  style={{ flex: 1 }}
                >
                  Renommer
                </Bouton>
                <Bouton
                  variante="contour"
                  onPress={() => setASupprimer(m)}
                  style={{ flex: 1 }}
                >
                  Supprimer
                </Bouton>
              </View>
            </Carte>
          );
        })}

        {maj.isError && (
          <Discret style={[s.aide, { color: C.erreur }]}>{maj.error.message}</Discret>
        )}
        {supprimer.isError && (
          <Discret style={[s.aide, { color: C.erreur }]}>{supprimer.error.message}</Discret>
        )}
      </ScrollView>

      <Confirmer
        visible={aSupprimer !== null}
        titre={`Supprimer « ${aSupprimer?.libelle ?? ''} » ?`}
        /* On annonce la conséquence, parce qu'elle est invisible : les
           habitudes qui visaient ce mode s'en vont avec lui. Elles ne
           deviennent PAS « se mange tel quel » — ce serait une réponse fausse,
           découverte devant la boîte. La question sera simplement reposée. */
        message="Les plans déjà enregistrés gardent le libellé, ils sont figés. En revanche, les utilisateurs qui cuisaient un aliment de cette façon devront le redire au prochain plan."
        onConfirmer={() => {
          if (aSupprimer !== null) supprimer.mutate(aSupprimer.id);
          setASupprimer(null);
        }}
        onAnnuler={() => setASupprimer(null)}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { padding: E.l, gap: E.m },
  titre: { fontFamily: P.fort, fontSize: T.moyen, marginTop: E.s },
  aide: { fontSize: T.petit, lineHeight: 17 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  fleche: { minWidth: 52 },
});
