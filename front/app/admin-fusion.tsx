import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useExercices, useFusionExercices, useMoi } from '@/api/hooks';
import type { Exercice } from '@/api/types';
import { Bouton, Carte, Chargement, Discret, Texte, Vide } from '@/composants/base';
import { ChoixDansListe } from '@/composants/choixAliment';
import { Confirmer } from '@/composants/confirmer';
import { SEUIL_PROXIMITE, proximite } from '@/calcul/proximite';
import { libelle, ZONES } from '@/muscles/vocabulaire';
import { C, E, P, R, T } from '@/theme';

/** Le nom qu'on montre, et donc le seul qu'on doit comparer. */
const nomAffiche = (e: Exercice): string => e.nomFr ?? e.nom;

/**
 * Fusion de deux exercices.
 *
 * Une simple suppression est impossible dès qu'un exercice figure dans une
 * séance passée — et c'est heureux, sinon on effacerait l'historique. La
 * fusion transfère cet historique au nouvel exercice avant de supprimer
 * l'ancien : les 1RM et la progression sont préservés.
 */
export default function AdminFusion() {
  const moi = useMoi();
  const exercices = useExercices();
  const fusion = useFusionExercices();

  const [ancien, setAncien] = useState<Exercice | undefined>(undefined);
  const [nouveau, setNouveau] = useState<Exercice | undefined>(undefined);
  const [choix, setChoix] = useState<'ancien' | 'nouveau' | null>(null);
  const [confirmer, setConfirmer] = useState(false);

  const suggestions = useMemo(() => {
    if (!ancien) return [];

    /* LE MEME NOM DES DEUX COTES. On lisait ici `ancien.nom` — l'anglais —
       contre `e.nomFr ?? e.nom` — le francais. `29-noms-francais.sql`
       renseigne `nom_fr` pour 1314 des 1318 exercices importes et laisse `nom`
       en anglais : l'ecran comparait « barbell incline bench press » a 1314
       noms francais, et ne proposait que du bruit. Deux lignes plus bas, le
       meme ecran affichait pourtant `ancien.nomFr ?? ancien.nom`. Corrige le
       20 septembre 2026 ; le cas perso -> catalogue marchait, francais des
       deux cotes, et c'est ce qui rendait la panne invisible a l'essai. */
    return (exercices.data ?? [])
      .filter((e) => e.id !== ancien.id)
      .map((e) => ({ e, score: proximite(nomAffiche(ancien), nomAffiche(e)) }))
      .filter((x) => x.score > SEUIL_PROXIMITE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [ancien, exercices.data]);

  /* MEMOISE, ET AU-DESSUS DES RETOURS ANTICIPES. Ce tableau etait construit
     dans le corps du rendu, plus bas : un tableau NEUF a chaque frappe, donc
     le `useMemo` de `ChoixDansListe` refiltrait les 1338 exercices a chaque
     caractere, modale fermee comprise. Meme correctif que `seance/[id].tsx:62`
     et `modele/[id].tsx:70` — ce troisieme frere avait ete oublie. */
  const elements = useMemo(
    () => (exercices.data ?? []).map((e) => ({
      id: e.id,
      nom: nomAffiche(e),
      detail: `${e.source === 'perso' ? "★ ajouté dans l'app · " : ''}`
        + `${e.partieCorps ? libelle(ZONES, e.partieCorps) : ''}`,
      couleur: e.source === 'perso' ? C.vif : C.ligne,
      /* Comme chez les deux freres : c'est ce champ qui fait apparaitre les
         vignettes de muscles. Sans lui, cet ecran etait le seul selecteur ou
         il fallait chercher parmi 1338 entrees au mot seul. */
      muscle: e.muscleCible ?? null,
    })),
    [exercices.data],
  );

  if (moi.isLoading || exercices.isLoading) return <Chargement />;
  if (!moi.data?.roles?.includes('ROLE_ADMIN')) {
    return <Vide message="Cet écran est réservé à l'administrateur." />;
  }

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Discret style={{ lineHeight: 19 }}>
        L'exercice remplacé disparaît, mais son historique est transféré :
        séances passées et modèles pointent vers le nouveau. Tes 1RM sont conservés.
      </Discret>

      <Carte style={{ gap: E.s }}>
        <Discret style={s.etiquette}>Exercice à remplacer</Discret>
        <Pressable onPress={() => setChoix('ancien')} style={s.choix}>
          <Texte style={{ flex: 1 }} numberOfLines={1}>
            {ancien ? nomAffiche(ancien) : 'Choisir…'}
          </Texte>
          <Discret>▾</Discret>
        </Pressable>
        {ancien && (
          <Discret style={{ fontSize: T.petit }}>
            {ancien.source === 'perso' ? '★ ' : ''}{ancien.nom}
            {ancien.formatPrescrit !== null ? ` · ${ancien.formatPrescrit}` : ''}
          </Discret>
        )}
      </Carte>

      {suggestions.length > 0 && !nouveau && (
        <Carte style={{ gap: E.xs }}>
          <Discret style={s.etiquette}>Correspondances probables</Discret>
          {suggestions.map(({ e, score }) => (
            <Pressable key={e.id} onPress={() => setNouveau(e)} style={s.suggestion}>
              <Texte style={{ flex: 1, fontSize: T.normal }} numberOfLines={1}>
                {nomAffiche(e)}
              </Texte>
              <Discret style={{ fontSize: T.petit }}>{Math.round(score * 100)} %</Discret>
            </Pressable>
          ))}
        </Carte>
      )}

      <Carte style={{ gap: E.s }}>
        <Discret style={s.etiquette}>Remplacé par</Discret>
        <Pressable onPress={() => setChoix('nouveau')} style={s.choix}>
          <Texte style={{ flex: 1 }} numberOfLines={1}>
            {nouveau ? nomAffiche(nouveau) : 'Choisir…'}
          </Texte>
          <Discret>▾</Discret>
        </Pressable>
        {nouveau && (
          <Discret style={{ fontSize: T.petit }}>
            {nouveau.nom}
            {nouveau.partieCorps !== null ? ` · ${libelle(ZONES, nouveau.partieCorps)}` : ''}
          </Discret>
        )}
      </Carte>

      <Bouton
        onPress={() => setConfirmer(true)}
        desactive={!ancien || !nouveau || ancien.id === nouveau.id || fusion.isPending}
      >
        {fusion.isPending ? 'Fusion en cours…' : 'Fusionner'}
      </Bouton>

      {fusion.isSuccess && (
        <Carte style={{ borderColor: C.ok }}>
          <Texte style={{ color: C.ok, fontSize: T.normal, lineHeight: 20 }}>
            {fusion.data.message}
          </Texte>
        </Carte>
      )}
      {fusion.isError && (
        <Discret style={{ color: C.erreur }}>{fusion.error.message}</Discret>
      )}

      <ChoixDansListe
        visible={choix !== null}
        titre={choix === 'ancien' ? 'Exercice à remplacer' : 'Remplacé par'}
        elements={elements}
        onChoisir={(id) => {
          const e = (exercices.data ?? []).find((x) => x.id === id);
          if (choix === 'ancien') { setAncien(e); setNouveau(undefined); }
          else setNouveau(e);
        }}
        onFermer={() => setChoix(null)}
      />

      <Confirmer
        visible={confirmer}
        titre="Fusionner ces exercices ?"
        message={`« ${ancien?.nom ?? ''} » sera remplacé partout par `
          + `« ${nouveau ? nomAffiche(nouveau) : ''} », puis supprimé. `
          + 'Ton historique est conservé, mais l\'opération est définitive.'}
        libelle="Fusionner"
        onConfirmer={() => {
          setConfirmer(false);
          if (ancien && nouveau) {
            fusion.mutate({ ancienId: ancien.id, nouveauId: nouveau.id }, {
              onSuccess: () => { setAncien(undefined); setNouveau(undefined); },
            });
          }
        }}
        onAnnuler={() => setConfirmer(false)}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: E.m, gap: E.m, maxWidth: 560, width: '100%', alignSelf: 'center' },
  etiquette: { fontSize: T.minuscule, letterSpacing: 1, textTransform: 'uppercase' },
  choix: {
    flexDirection: 'row', alignItems: 'center', gap: E.s, minHeight: 46,
    backgroundColor: C.surface2, borderColor: C.ligne, borderWidth: 1,
    borderRadius: R.s, paddingHorizontal: E.m,
  },
  suggestion: {
    flexDirection: 'row', alignItems: 'center', gap: E.s, minHeight: 42,
    paddingHorizontal: E.s, borderBottomWidth: 1, borderBottomColor: C.ligne,
  },
});
