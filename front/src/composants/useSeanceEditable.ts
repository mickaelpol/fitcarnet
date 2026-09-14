import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Seance } from '@/api/types';
import { useEnregistrerSeance, useSeance } from '../api/hooks';
import { avecIdentifiantSeance } from '../calcul/blocSeance';
import { abonnerMesure, appliquerResultats, prendreResultats } from './etatMesure';
import { useSauvegardeAuto } from './sauvegardeAuto';
import type { EtatSauvegarde } from './sauvegardeAuto';

/**
 * La séance qu'on est en train de saisir : son état local, sa sauvegarde
 * automatique, et les deux sources qui la remplissent.
 *
 * EXTRAIT DE `app/seance/[id].tsx` LE 15 SEPTEMBRE 2026 (rang 12 du lot 6 de
 * l'audit de septembre), à comportement strictement identique. La logique
 * PURE qui l'accompagnait — `avecIdentifiantSeance` — est descendue dans
 * `calcul/blocSeance.ts`, avec son test : elle est éprouvable, ce hook ne
 * l'est pas (le projet n'embarque aucune bibliothèque de rendu, et un test
 * qui importerait ce fichier tirerait React Native derrière lui).
 *
 * Trois règles y sont enfermées, et chacune vient d'une perte de saisie :
 *
 *   1. ON N'ENREGISTRE PAS UNE SÉANCE SANS EXERCICE. C'est le premier envoi
 *      qui la crée ; le déclencher à vide poserait une séance fantôme.
 *   2. ON GREFFE L'IDENTIFIANT, ON NE REMPLACE PAS L'ÉTAT. Auparavant on
 *      remplaçait la route par /seance/{id} : l'écran se remontait et relisait
 *      la séance depuis l'API. Tout ce qui avait été saisi pendant les deux
 *      secondes et demie d'attente — une série ajoutée, une charge tapée —
 *      était jeté avec l'ancien état, sans que rien ne le signale.
 *   3. LA MESURE SURVIT AU DÉMONTAGE DE SON CHAMP. Le chronomètre d'effort ne
 *      connaît pas la séance : il dépose le temps mesuré, et c'est ici — seul
 *      endroit qui détient l'état — qu'on l'écrit.
 */

const aujourdhui = (): string => new Date().toISOString().slice(0, 10);

export function useSeanceEditable(id: string): {
  /** l'état local, source de vérité tant que l'écran est monté */
  seance: Seance | null;
  setSeance: Dispatch<SetStateAction<Seance | null>>;
  /** vrai quand l'écran crée une séance plutôt que d'en rouvrir une */
  nouvelle: boolean;
  /** la requête de lecture, pour les gardes de chargement et d'erreur */
  seanceApi: ReturnType<typeof useSeance>;
  etat: EtatSauvegarde;
  motif: string | null;
  /** forcer un envoi, après un échec : même règle, on ne remplace pas la route */
  enregistrerMaintenant: (s: Seance) => void;
} {
  const nouvelle = id === 'nouvelle';

  const seanceApi = useSeance(nouvelle ? undefined : Number(id));
  const enregistrer = useEnregistrerSeance();

  const [seance, setSeance] = useState<Seance | null>(null);

  /* La séance s'enregistre toute seule deux secondes et demie après la
     dernière modification. Tant qu'elle n'a pas d'identifiant, on ne
     déclenche rien : c'est le premier enregistrement qui la crée. */
  const { etat, motif } = useSauvegardeAuto(
    seance,
    async (s) => {
      const enregistree = await enregistrer.mutateAsync(s);

      /* On greffe l'identifiant sur l'état LOCAL, sans naviguer. */
      setSeance((courante) => (courante === null
        ? enregistree
        : avecIdentifiantSeance(courante, enregistree)));
    },
    { actif: seance !== null && seance.exercices.length > 0 },
  );

  /* Ce détour est ce qui permet à une mesure de survivre au changement de
     mode, qui démonte le composant où elle s'affichait. */
  useEffect(() => abonnerMesure(() => {
    const resultats = prendreResultats();
    if (resultats.length === 0) return;

    setSeance((courante) => (courante === null
      ? courante
      : { ...courante, exercices: appliquerResultats(courante.exercices, resultats) }));
  }), []);

  useEffect(() => {
    if (nouvelle && seance === null) {
      setSeance({ date: aujourdhui(), type: null, exercices: [] });
    } else if (!nouvelle && seanceApi.data && seance === null) {
      setSeance(seanceApi.data);
    }
  }, [nouvelle, seanceApi.data, seance]);

  /* Même règle que la sauvegarde automatique : on ne remplace pas la route.
     Un remontage jetterait la saisie en cours. */
  const enregistrerMaintenant = (s: Seance): void => {
    enregistrer.mutate(s, {
      onSuccess: (enregistree) => {
        setSeance((courante) => (courante === null
          ? enregistree
          : avecIdentifiantSeance(courante, enregistree)));
      },
    });
  };

  return { seance, setSeance, nouvelle, seanceApi, etat, motif, enregistrerMaintenant };
}
