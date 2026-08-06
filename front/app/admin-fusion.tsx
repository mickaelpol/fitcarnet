import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useExercices, useFusionExercices, useMoi } from '@/api/hooks';
import type { Exercice } from '@/api/types';
import { Bouton, Carte, Chargement, Discret, Texte, Vide } from '@/composants/base';
import { ChoixDansListe } from '@/composants/choixAliment';
import { Confirmer } from '@/composants/confirmer';
import { C, E, P, R } from '@/theme';

/** Distance de Levenshtein, pour proposer les correspondances probables. */
function proximite(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;

  const m: number[][] = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = 0; i <= x.length; i++) m[i]![0] = i;
  for (let j = 0; j <= y.length; j++) m[0]![j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      m[i]![j] = Math.min(
        m[i - 1]![j]! + 1,
        m[i]![j - 1]! + 1,
        m[i - 1]![j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
  }

  return 1 - m[x.length]![y.length]! / Math.max(x.length, y.length);
}

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

    return (exercices.data ?? [])
      .filter((e) => e.id !== ancien.id)
      .map((e) => ({ e, score: proximite(ancien.nom, e.nomFr ?? e.nom) }))
      .filter((x) => x.score > 0.45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [ancien, exercices.data]);

  if (moi.isLoading || exercices.isLoading) return <Chargement />;
  if (!moi.data?.roles?.includes('ROLE_ADMIN')) {
    return <Vide message="Cet écran est réservé à l'administrateur." />;
  }

  const elements = (exercices.data ?? []).map((e) => ({
    id: e.id,
    nom: e.nomFr ?? e.nom,
    detail: `${e.source === 'perso' ? '★ tes exercices · ' : ''}${e.partieCorps ?? ''}`,
    couleur: e.source === 'perso' ? C.vif : C.ligne,
  }));

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
            {ancien ? (ancien.nomFr ?? ancien.nom) : 'Choisir…'}
          </Texte>
          <Discret>▾</Discret>
        </Pressable>
        {ancien && (
          <Discret style={{ fontSize: 11.5 }}>
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
              <Texte style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
                {e.nomFr ?? e.nom}
              </Texte>
              <Discret style={{ fontSize: 11 }}>{Math.round(score * 100)} %</Discret>
            </Pressable>
          ))}
        </Carte>
      )}

      <Carte style={{ gap: E.s }}>
        <Discret style={s.etiquette}>Remplacé par</Discret>
        <Pressable onPress={() => setChoix('nouveau')} style={s.choix}>
          <Texte style={{ flex: 1 }} numberOfLines={1}>
            {nouveau ? (nouveau.nomFr ?? nouveau.nom) : 'Choisir…'}
          </Texte>
          <Discret>▾</Discret>
        </Pressable>
        {nouveau && (
          <Discret style={{ fontSize: 11.5 }}>
            {nouveau.nom}{nouveau.partieCorps !== null ? ` · ${nouveau.partieCorps}` : ''}
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
          <Texte style={{ color: C.ok, fontSize: 13.5, lineHeight: 20 }}>
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
          + `« ${nouveau?.nomFr ?? nouveau?.nom ?? ''} », puis supprimé. `
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
  etiquette: { fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase' },
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
