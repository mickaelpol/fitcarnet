import { useEffect, useMemo, useState } from 'react';
import { useExerciceDetail, useMajExercice } from '../api/hooks';
import type { Exercice } from '../api/types';
import {
  basculerGroupe, type Brouillon, corpsAEnvoyer, type Ecarts, ecarts,
  type SaisieExercice, saisieDepuis,
} from '../muscles/editionExercice';
import { identifiantYoutube } from '@/calcul/affichageCourt';

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

/**
 * LA SAISIE QUAND IL N'Y A PAS DE FICHE — LES SEPT CHAMPS, PAS SIX.
 *
 * LA PANNE. La remise à zéro était écrite en clair dans une branche de
 * l'effet, et elle avait oublié `muscle` : la vignette de l'exercice précédent
 * survivait à la disparition de sa fiche. Inatteignable en production — l'écran
 * monte un éditeur NEUF par exercice (`key={edite.id}`) — mais la faute
 * mordait à la seconde où quelqu'un retirait cette clé, pour éviter un
 * remontage ou garder un scroll. Et elle mordait en silence : l'éditeur aurait
 * proposé d'écrire les pectoraux sur un exercice de jambes, et `ecarts` aurait
 * compté cette valeur héritée comme une modification à enregistrer.
 *
 * Reproduite telle quelle au découpage du 15 septembre 2026, où le commentaire
 * la signalait lui-même ; corrigée le même jour.
 *
 * LE REMÈDE N'EST PAS D'AJOUTER LE SETTER MANQUANT, c'est de supprimer le
 * jumeau : l'effet n'a plus qu'UN chemin, et le type `SaisieExercice` oblige
 * cette constante à porter les sept champs. Retirer `muscle: null` ne produit
 * plus un oubli silencieux mais une erreur de compilation — la garantie est
 * dans le typage, là où aucun test ne peut atteindre un hook (le projet
 * n'embarque pas de quoi en monter un sans réveiller la moitié d'Expo).
 */
const SAISIE_VIDE: SaisieExercice = {
  brouillon: null,
  mode: null,
  groupes: null,
  muscle: null,
  zone: null,
  secondaires: null,
  materiel: null,
};

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
    /* UN SEUL CHEMIN, ET C'EST TOUT LE CORRECTIF. Les deux branches d'avant
       posaient chacune leur liste de setters, et celle de la fiche absente en
       avait oublié un — voir `SAISIE_VIDE`. Deux listes à tenir d'accord,
       c'est le motif n° 1 de la revue : la règle recopiée devant deux portes
       finit par manquer devant l'une des deux. Il n'y en a plus qu'une. */
    const depart = complet === undefined ? SAISIE_VIDE : saisieDepuis(complet);
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
