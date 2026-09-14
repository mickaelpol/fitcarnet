import { useEffect, useMemo, useState } from 'react';
import { useExerciceDetail, useMajExercice } from '../api/hooks';
import type { Exercice } from '../api/types';
import {
  basculerGroupe, type Brouillon, corpsAEnvoyer, type Ecarts, ecarts, saisieDepuis,
} from '../muscles/editionExercice';
import { identifiantYoutube } from './modaleExercice';

/**
 * L'ÉTAT DE L'ÉDITEUR D'UN EXERCICE. Les règles, elles, sont dans
 * `src/muscles/editionExercice.ts` — et elles y sont testées.
 *
 * CE HOOK NE DÉCIDE RIEN. Il tient sept morceaux d'état, va chercher la fiche
 * complète, et confie chaque question à une fonction pure. C'est délibéré :
 * un hook React exige un moteur de rendu pour être testé, et le projet n'en
 * embarque aucun. Tout ce qui pouvait descendre en dessous est descendu ;
 * ce qui reste ici est ce qu'un test ne pourrait pas atteindre de toute façon.
 *
 * IL VA CHERCHER LA FICHE COMPLÈTE, et c'est indispensable : depuis que les
 * textes longs ne voyagent plus avec la collection, `exercices.data` ne
 * contient ni l'exécution, ni les muscles, ni le matériel. Les éditer à
 * partir de la liste écrirait donc du vide par-dessus des données
 * existantes — silencieusement.
 *
 * Extrait de `app/admin-exercices.tsx` le 15 septembre 2026 (03-front §4).
 */
export function useEditeurExercice(exercice: Exercice, onFermer: () => void) {
  const detail = useExerciceDetail(exercice.id);
  const maj = useMajExercice();

  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [groupes, setGroupes] = useState<string[] | null>(null);
  const [muscle, setMuscle] = useState<string | null>(null);
  const [zone, setZone] = useState<string[] | null>(null);
  const [secondaires, setSecondaires] = useState<string[] | null>(null);
  const [materiel, setMateriel] = useState<string[] | null>(null);
  /** La demande d'abandon, quand on ferme sur une saisie non enregistrée. */
  const [abandon, setAbandon] = useState(false);

  const complet = detail.data;

  /* Le brouillon ne se remplit QU'UNE FOIS la fiche arrivée, et il est remis à
     zéro si l'on change d'exercice. Le pré-remplir avec la version légère
     afficherait des champs vides que l'utilisateur croirait vides en base. */
  useEffect(() => {
    if (complet === undefined) {
      /* ⚠ `muscle` N'EST PAS REMIS À `null` ICI, et ce n'était pas remarqué
         avant le découpage du 15 septembre 2026. Les six autres le sont. Le
         cas est aujourd'hui inatteignable — l'écran monte un éditeur NEUF par
         exercice (`key={edite.id}`), donc la fiche n'a jamais le temps de
         redevenir `undefined` sous un `muscle` déjà choisi. Le découpage
         devait être mécanique : l'asymétrie est REPRODUITE telle quelle
         plutôt que corrigée en passant, sans quoi personne ne saurait, dans
         six mois, si c'était voulu. */
      setBrouillon(null);
      setMode(null);
      setGroupes(null);
      setZone(null);
      setSecondaires(null);
      setMateriel(null);

      return;
    }
    const depart = saisieDepuis(complet);
    setBrouillon(depart.brouillon);
    setMode(depart.mode);
    setGroupes(depart.groupes);
    setMuscle(depart.muscle);
    setZone(depart.zone);
    setSecondaires(depart.secondaires);
    setMateriel(depart.materiel);
  }, [complet]);

  const saisie = { brouillon, mode, groupes, muscle, zone, secondaires, materiel };
  const ec: Ecarts = useMemo(
    () => ecarts(saisie, complet),
    [brouillon, mode, groupes, muscle, zone, secondaires, materiel, complet],
  );

  const video = (brouillon?.videoUrl ?? '').trim();
  const videoValide = video === '' || identifiantYoutube(video) !== null;

  /**
   * FERMER EN TAPANT À CÔTÉ — MAIS PAS EN EMPORTANT UNE SAISIE.
   *
   * Toutes les autres modales de l'application se ferment déjà au tap sur le
   * fond ; celle-ci était la seule à obliger à viser « Fermer ». Elle est
   * aussi la seule à porter un brouillon de huit champs, et un tap à côté est
   * un geste qu'on fait SANS Y PENSER — c'est même tout son intérêt.
   *
   * D'où la nuance : rien de modifié, on ferme sans rien demander ; une
   * modification en cours, on demande. Fermer en silence sur six corrections
   * saisies serait exactement le genre de perte qu'on ne comprend qu'après.
   *
   * Le bouton « Fermer » reste, et il passe par le même chemin : deux façons
   * de fermer qui se comporteraient différemment, c'est une règle de plus à
   * retenir pour rien.
   */
  const tenterFermer = () => {
    if (ec.nombre > 0) { setAbandon(true); return; }
    onFermer();
  };

  const enregistrer = () => {
    if (brouillon === null) return;
    maj.mutate({ id: exercice.id, ...corpsAEnvoyer(saisie, ec) }, { onSuccess: onFermer });
  };

  return {
    detail,
    maj,
    brouillon,
    setBrouillon,
    mode,
    setMode,
    groupes,
    basculer: (g: string) => { if (groupes !== null) setGroupes(basculerGroupe(groupes, g)); },
    muscle,
    setMuscle,
    zone,
    setZone,
    secondaires,
    setSecondaires,
    materiel,
    setMateriel,
    abandon,
    setAbandon,
    ecarts: ec,
    videoValide,
    tenterFermer,
    enregistrer,
  };
}
