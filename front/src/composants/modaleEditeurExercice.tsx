import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View,
} from 'react-native';
import type { Exercice } from '@/api/types';
import { Bouton, Champ, Chargement, Discret, Erreur, Texte } from './base';
import { ChoixMuscle } from './choixMuscle';
import { ChoixPuces } from './choixPuces';
import { Confirmer } from './confirmer';
import { useEditeurExercice } from './useEditeurExercice';
import { CHAMPS, GROUPES, MODES } from '@/muscles/editionExercice';
import { casesPour, MATERIELS, SECONDAIRES } from '@/muscles/vocabulaire';
import { C, E, P, R, T, TOUCHE } from '@/theme';

/**
 * L'ÉDITEUR D'UN EXERCICE — le rendu, et rien que le rendu.
 *
 * UN EXERCICE À LA FOIS, DANS UN ÉDITEUR SÉPARÉ. Déplier huit champs dans
 * chaque carte d'une liste de 1338 entrées rendrait le défilement
 * impraticable, et ferait porter à l'écran un brouillon par exercice et par
 * champ. La liste reste une liste ; l'édition est un geste à part, qu'on
 * ouvre et qu'on ferme.
 *
 * LES DEUX SORTES D'EXERCICES SONT TRAITÉES PAREIL, et c'est le point. Un
 * exercice importé et un exercice personnel sont deux lignes de la même
 * table ; distinguer ce qu'on a le droit de corriger sur l'un et sur l'autre
 * serait une règle de plus à retenir, sans rien protéger.
 *
 * Extrait de `app/admin-exercices.tsx` le 15 septembre 2026 (03-front §4).
 * L'état et les règles sont chez `useEditeurExercice` et
 * `src/muscles/editionExercice.ts`.
 */
export function ModaleEditeurExercice({
  exercice, zones, onFermer,
}: {
  exercice: Exercice;
  /* LES ZONES PROPOSÉES VIENNENT DU CATALOGUE, PAS D'UNE LISTE ÉCRITE ICI.
     L'écran a déjà les 1338 exercices en mémoire ; il en tire les zones qui
     existent VRAIMENT. Une liste en dur proposerait un jour une zone que plus
     personne n'utilise, et tairait celle que quelqu'un vient d'ajouter. */
  zones: readonly { cle: string; label: string }[];
  onFermer: () => void;
}) {
  const e = useEditeurExercice(exercice, onFermer);
  const { brouillon, ecarts } = e;
  const nbModifs = ecarts.nombre;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={e.tenterFermer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* le fond ferme au tap ; la feuille l'absorbe pour ne pas se fermer
            quand on tape à l'intérieur */}
        <Pressable style={s.fond} onPress={e.tenterFermer}>
          <Pressable style={s.feuille} onPress={(ev) => ev.stopPropagation()}>
            <Texte style={s.titreEditeur} numberOfLines={2}>{exercice.nom}</Texte>
            <Discret style={{ fontSize: T.petit }}>
              {exercice.source === 'perso' ? "★ ajouté dans l'app" : 'catalogue importé'}
            </Discret>

            {e.detail.isLoading || brouillon === null ? (
              <View style={{ paddingVertical: E.xl }}><Chargement /></View>
            ) : e.detail.isError ? (
              <Erreur
                message={e.detail.error.message}
                onReessayer={() => void e.detail.refetch()}
              />
            ) : (
              <ScrollView
                style={{ marginTop: E.m }}
                contentContainerStyle={{ gap: E.s, paddingBottom: E.m }}
                keyboardShouldPersistTaps="handled"
              >
                {CHAMPS.map((c) => (
                  <Champ
                    key={c.cle}
                    etiquette={c.etiquette}
                    valeur={brouillon[c.cle]}
                    onChange={(v) => e.setBrouillon({ ...brouillon, [c.cle]: v })}
                    placeholder={c.cle === 'nomFr' ? exercice.nom : undefined}
                    multiligne={'long' in c ? c.long : undefined}
                  />
                ))}

                {/* CES DEUX-LÀ NE CHANGENT PAS L'AFFICHAGE, ILS CHANGENT CE QUE
                    L'APPLICATION FAIT. D'où la séparation visuelle. */}
                <View style={{ gap: E.xs, marginTop: E.s }}>
                  <Discret style={s.etiquetteChoix}>Ce qu’on saisit pendant la séance</Discret>
                  <View style={s.puces}>
                    {MODES.map((m) => (
                      <Pressable
                        key={m.cle}
                        onPress={() => e.setMode(m.cle)}
                        style={[s.puce, e.mode === m.cle && s.puceActive]}
                        accessibilityLabel={`Mode ${m.libelle}`}
                      >
                        <Discret style={e.mode === m.cle
                          ? { color: C.fond, fontFamily: P.fort, fontSize: T.petit }
                          : { fontSize: T.petit }}
                        >
                          {m.libelle}
                        </Discret>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={{ gap: E.xs }}>
                  <Discret style={s.etiquetteChoix}>Séances où le proposer</Discret>
                  <View style={s.puces}>
                    {GROUPES.map((g) => (
                      <Pressable
                        key={g}
                        onPress={() => e.basculer(g)}
                        style={[s.puce, e.groupes?.includes(g) === true && s.puceActive]}
                        accessibilityLabel={`Groupe ${g}`}
                      >
                        <Discret style={e.groupes?.includes(g) === true
                          ? { color: C.fond, fontFamily: P.fort, fontSize: T.petit }
                          : { fontSize: T.petit }}
                        >
                          {g}
                        </Discret>
                      </Pressable>
                    ))}
                  </View>
                  {/* Ce n'est pas une erreur, c'est un choix — et il n'est pas
                      devinable depuis l'écran, donc on l'écrit. */}
                  {e.groupes !== null && e.groupes.length === 0 && (
                    <Discret style={{ fontSize: T.petit }}>
                      Aucun groupe : cet exercice est proposé dans toutes les séances.
                    </Discret>
                  )}
                </View>

                {/* UN SEUL CHOIX, PARCE QUE LA DONNÉE N'EN A JAMAIS EU DEUX.
                    Aucun des 1338 exercices ne porte de virgule dans sa zone.
                    Proposer d'en cocher plusieurs inventerait une possibilité
                    que rien, ensuite, ne sait lire : la fiche l'afficherait, et
                    aucun autre écran n'en tiendrait compte. */}
                <View style={{ gap: E.xs }}>
                  <Discret style={s.etiquetteChoix}>Zone</Discret>
                  <ChoixPuces
                    options={casesPour(zones, e.zone ?? [])}
                    choisis={e.zone ?? []}
                    onChanger={e.setZone}
                    etiquettePour={(l) => `Zone ${l}`}
                  />
                </View>

                {/* LES MÊMES VIGNETTES QUE LE FILTRE, ET C'EST TOUT L'INTÉRÊT.
                    Ce qu'on peut désigner ici est exactement ce qu'on pourra
                    retrouver là-bas. Un champ de texte libre laissait les deux
                    vocabulaires diverger sans que rien ne le signale. */}
                <View style={{ gap: E.xs }}>
                  <Discret style={s.etiquetteChoix}>Muscle ciblé</Discret>
                  <ChoixMuscle choisi={e.muscle} onChoisir={e.setMuscle} />
                  {e.muscle === null && (
                    <Discret style={{ fontSize: T.petit }}>
                      Aucun muscle : cet exercice ne sortira que sous « Autre ».
                    </Discret>
                  )}
                </View>

                {/* UN SEUL MATÉRIEL, ET C'EST MESURÉ : la somme des vingt-huit
                    valeurs distinctes fait exactement 1318, le nombre
                    d'exercices importés. Aucun n'en porte donc deux. */}
                <View style={{ gap: E.xs }}>
                  <Discret style={s.etiquetteChoix}>Matériel</Discret>
                  <ChoixPuces
                    options={casesPour(MATERIELS, e.materiel ?? [])}
                    choisis={e.materiel ?? []}
                    onChanger={e.setMateriel}
                    etiquettePour={(l) => `Matériel ${l}`}
                  />
                </View>

                {/* CELUI-CI EST BIEN MULTIPLE : 985 exercices sur 1338 portent
                    plusieurs muscles secondaires. Il ne sert à aucun filtre —
                    chercher « triceps » sur le secondaire remonterait tous les
                    développés couchés, où ils ne sont que sollicités. Il se lit
                    sur la fiche, pour savoir ce qu'on aura courbaturé. */}
                <View style={{ gap: E.xs }}>
                  <Discret style={s.etiquetteChoix}>Aussi sollicités</Discret>
                  <ChoixPuces
                    multiple
                    options={casesPour(SECONDAIRES, e.secondaires ?? [])}
                    choisis={e.secondaires ?? []}
                    onChanger={e.setSecondaires}
                    etiquettePour={(l) => `Aussi sollicité : ${l}`}
                  />
                </View>

                {!e.videoValide && (
                  <Discret style={{ color: C.erreur, fontSize: T.petit }}>
                    Ce lien n’est pas reconnu comme une vidéo YouTube.
                  </Discret>
                )}
                {e.maj.isError && (
                  <Discret style={{ color: C.erreur, fontSize: T.petit }}>
                    {e.maj.error.message}
                  </Discret>
                )}
              </ScrollView>
            )}

            <View style={{ flexDirection: 'row', gap: E.s, marginTop: E.s }}>
              <Bouton
                onPress={e.enregistrer}
                desactive={nbModifs === 0 || !e.videoValide || e.maj.isPending}
                style={{ flex: 1 }}
              >
                {nbModifs === 0 ? 'Aucune modification' : `Enregistrer (${nbModifs})`}
              </Bouton>
              <Bouton variante="contour" onPress={e.tenterFermer}>Fermer</Bouton>
            </View>

            {/* IMBRIQUÉE DANS LA MODALE, pas posée à côté. Deux modales sœurs
                s'empilent dans un ordre que la plateforme décide seule ; ici
                la question ne se pose pas. */}
            <Confirmer
              visible={e.abandon}
              titre="Abandonner les modifications ?"
              message={`${nbModifs} modification${nbModifs > 1 ? 's' : ''} non `
                + `enregistrée${nbModifs > 1 ? 's' : ''} sur cet exercice.`}
              libelle="Abandonner"
              onConfirmer={() => { e.setAbandon(false); onFermer(); }}
              onAnnuler={() => e.setAbandon(false)}
            />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  fond: {
    flex: 1, backgroundColor: C.voile,
    alignItems: 'center', justifyContent: 'center', padding: E.m,
  },
  feuille: {
    backgroundColor: C.surface, borderRadius: R.l, borderWidth: 1, borderColor: C.ligne,
    padding: E.m, maxHeight: '90%', width: '100%', maxWidth: 560,
  },
  titreEditeur: {
    fontFamily: P.titre, fontSize: T.titre, letterSpacing: 0.8, textTransform: 'uppercase',
  },
  etiquetteChoix: {
    fontSize: T.minuscule, letterSpacing: 1, textTransform: 'uppercase',
  },
  puces: { flexDirection: 'row', gap: 5 },
  puce: {
    flex: 1, minHeight: TOUCHE, borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 2,
  },
  puceActive: { backgroundColor: C.vif, borderColor: C.vif },
});
