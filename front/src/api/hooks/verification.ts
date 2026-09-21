import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../client';
import { ilYAQuelqueChoseAJuger } from './saisieAJuger';

/**
 * CE QUE L'ECRAN DOIT DIRE, DEMANDE AU SERVEUR.
 *
 * Decision du 20 septembre 2026 : « tout doit passer par le serveur car le
 * metier doit etre sur le serveur et puis c'est tout, comme ca je peux changer
 * le front quand bon me semble ».
 *
 * Ce hook ne juge RIEN. Il transmet ce qui est tape et rend ce qui revient.
 * Un front ecrit demain dans une autre technologie appelle la meme route et
 * obtient les memes phrases — il n'a rien a reimplementer, donc rien a oublier
 * de reimplementer.
 */

/** Une raison, et le champ qu'elle vise — pour que l'ecran puisse souligner. */
export interface Grief {
  champ: string;
  message: string;
}

/** La teinte du bandeau est une DECISION du serveur, pas un style du front. */
export type Verdict = 'coherent' | 'ecart' | 'incoherent' | 'indecidable';

export interface VerdictAliment {
  refus: Grief[];
  avertissements: Grief[];
  /** La phrase du bandeau de controle, telle que le serveur la formule. */
  resume: string;
  verdict: Verdict;
  /**
   * Une conversion kilojoules -> calories a PROPOSER, ou `null`.
   *
   * A ne pas confondre avec un refus : le refus dit « non », ceci offre un
   * correctif en un geste. Les deux peuvent parler en meme temps, et c'est le
   * comportement d'avant la refonte — qui ne doit rien changer de visible.
   */
  conversion: { saisi: number; converti: number; motif: 'plafond' | 'rapport' } | null;
  /**
   * Le rendement qu'on vient de MESURER, juge a part.
   *
   * L'ecran propose « utiliser ce resultat » apres deux pesees : c'est un
   * candidat, pas la valeur en cours. Sans cette reponse distincte, l'ecran
   * aurait garde un juge local pour ce seul bouton.
   */
  candidat: { acceptable: boolean; motif: string | null } | null;
  enregistrable: boolean;
}

/** Ce que l'ecran envoie : les champs TELS QU'ILS SONT TAPES. */
export interface SaisieAliment {
  categorie: string;
  kcal100: string;
  prot100: string;
  gluc100: string;
  lip100: string;
  fibres100: string;
  ratio: string;
  /** Le rendement issu des deux pesees en cours, s'il y en a. */
  ratioCandidat?: string;
  /**
   * CE QUE LA FICHE PORTAIT DEJA, sur une correction.
   *
   * Un aliment incoherent deja en base — migre avant que la regle existe —
   * doit pouvoir etre renomme. Le serveur ne le lit PAS en base : l'ecran le
   * declare. Cette route n'a donc rien a lire, et la regle 2 n'a pas de
   * nouveau chemin a garder.
   *
   * Absent sur une creation : tout y est nouveau, ce qui est exactement juste.
   */
  origine?: Omit<SaisieAliment, 'origine' | 'ratioCandidat'>;
}

/**
 * Le verdict de la saisie en cours.
 *
 * `placeholderData: keepPreviousData` EST LA PIECE QUI EVITE LE CLIGNOTEMENT :
 * pendant qu'une reponse arrive, l'ecran garde la precedente au lieu de vider
 * le bandeau. Sans elle, le message disparaitrait a chaque frappe et
 * reapparaitrait — ce qui serait pire que l'ancien calcul local.
 *
 * `enabled` coupe l'appel tant que RIEN N'EST TAPE — voir
 * `ilYAQuelqueChoseAJuger`, et la panne qu'il corrige.
 */
export function useVerdictAliment(saisie: SaisieAliment | null) {
  /* L'ANTI-REBOND VIT ICI, ET C'EST TOUT LE POINT DE LA CORRECTION.
     
     Il etait applique par l'appelant — `useVerdictAliment(useRetarde(saisie))`
     — si bien que le hook ne voyait JAMAIS la saisie courante. Or
     `isPlaceholderData` de TanStack Query ne devient vrai qu'une fois la cle
     changee : pendant les 250 ms du retard, la cle etait encore l'ancienne, la
     requete avait ses donnees, et `perime` valait FAUX.
     
     Resultat mesure par `revue-pile` : on tape « 350 » (vert, « cohérent »),
     on efface le 0 — et pendant 250 ms le bandeau reste vert, PLEINE OPACITE,
     bouton actif, sur « 35 ». Un chiffre faux affiche comme s'il etait
     verifie : la regle 7 prise a revers.
     
     La bibliotheque ne pouvait pas le voir : le retard etait en amont d'elle.
     Le hook compare donc lui-meme ce qui est TAPE a ce qui est INTERROGE. */
  const interrogee = useRetarde(saisie);
  const enRetard = JSON.stringify(saisie) !== JSON.stringify(interrogee);

  const requete = useQuery({
    queryKey: ['verdict-aliment', interrogee],
    enabled: ilYAQuelqueChoseAJuger(interrogee),
    /* Le verdict ne vieillit pas : pour une saisie donnee, la reponse est
       toujours la meme. On ne redemande donc jamais la meme — SAUF une saisie
       dont la requete a ete ABANDONNEE : consommer le `signal` fait annuler la
       requete par TanStack avec `cancel({revert: true})`, ce qui remet son
       entree de cache a `undefined`. Borne et benin (l'anti-rebond est a
       250 ms), mais ce n'est plus « jamais ». Precise le 21 septembre 2026. */
    staleTime: Infinity,
    gcTime: 60_000,
    /* L'AIDE DOCUMENTEE PLUTOT QUE LA FONCTION ECRITE A LA MAIN. Les deux
       font la meme chose, mais la lambda `(precedent) => precedent` brouille
       l'inference des le moment ou `queryFn` destructure son argument : TypeScript
       rendait alors `requete.data` du TYPE DE LA LAMBDA, et quatre ecrans
       cessaient de compiler. `keepPreviousData` est ce que nomme la
       documentation de TanStack Query v5 — et ce que ce fichier annoncait
       deja en commentaire sans l'employer. */
    placeholderData: keepPreviousData,
    /* LE SIGNAL DE TANSTACK QUERY EST TRANSMIS — 21 septembre 2026. Cette
       route part a chaque PAUSE de frappe : sans lui, corriger une valeur
       laissait la requete precedente courir jusqu'au bout, et sur un reseau
       lent elles s'empilaient. `Options` ne portait pas de `signal`, et le
       client l'ecrasait de toute facon par celui de son delai de garde. */
    queryFn: ({ signal }) => api<VerdictAliment>(
      '/verification/aliment', { methode: 'POST', corps: interrogee, signal }),
  });

  /* CE QU'ON REND EST-IL LE VERDICT DE CETTE SAISIE, OU DE LA PRECEDENTE ?
     
     RELEVE PAR `revue-pile` LE 20 SEPTEMBRE 2026. `placeholderData` garde la
     reponse precedente pendant l'attente — c'est ce qui evite le
     clignotement — mais l'ecran l'affichait comme si elle etait courante.
     Deux scenarios, tous deux visibles :
     
       - on ferme un riz refuse, on ouvre une huile saine : pendant
         l'anti-rebond ET l'aller-retour, l'huile porte le refus du riz ;
       - on tape « 350 » (accepte) puis on efface un chiffre : le bandeau dit
         encore « cohérent » en vert sur une valeur que le serveur refuserait.
     
     C'est la regle 7 prise a revers — un chiffre faux affiche — et l'ancien
     code, synchrone, ne pouvait pas le produire. L'ecran doit donc savoir
     distinguer les deux, et c'est ce que la documentation de TanStack Query
     nomme `isPlaceholderData`. */
  return {
    ...requete,
    verdict: requete.data,
    /**
     * Vrai quand ce qui est rendu decrit une saisie PRECEDENTE.
     *
     * DEUX FENETRES, ET LA BIBLIOTHEQUE N'EN VOIT QU'UNE : l'anti-rebond
     * (avant que la cle change) et l'aller-retour (apres). `isPlaceholderData`
     * ne couvre que la seconde.
     */
    perime: enRetard || requete.isPlaceholderData,
    /**
     * LE SERVEUR N'A PAS REPONDU, et il faut le DIRE.
     *
     * Avec `placeholderData` pose, TanStack Query v5 ne l'applique JAMAIS
     * par-dessus une erreur : `data` redevient `undefined`. L'ecran affichait
     * alors un cadre borde et VIDE, sans un mot, avec le bouton actif — ni un
     * refus, ni une incertitude enoncee, mais une absence de reponse deguisee
     * en reponse. La regle 7 demande l'inverse.
     */
    enPanne: sansReponse(requete),
  };
}

/**
 * La meme valeur, mais en retard.
 *
 * L'ANTI-REBOND EST CE QUI REND L'APPEL SUPPORTABLE : sans lui, chaque
 * caractere tape partirait au serveur. Avec, c'est un appel par PAUSE de
 * frappe. 250 ms est le delai au-dela duquel une frappe cesse d'etre une
 * frappe — assez court pour que le verdict paraisse immediat, assez long pour
 * qu'ecrire « 350 » ne fasse qu'un appel.
 *
 * Combine a `placeholderData`, l'ecran garde le verdict precedent pendant
 * l'attente : rien ne clignote, rien ne disparait.
 */
export function useRetarde<T>(valeur: T, millisecondes = 250): T {
  const [retarde, setRetarde] = useState(valeur);

  useEffect(() => {
    const minuterie = setTimeout(() => setRetarde(valeur), millisecondes);

    return () => clearTimeout(minuterie);
  }, [valeur, millisecondes]);

  return retarde;
}

/**
 * LE SERVEUR N'A PAS REPONDU — LES DEUX FACONS, ET LA SECONDE ETAIT OUBLIEE.
 *
 * `isError` ne couvre que la requete PARTIE qui echoue. Hors ligne sur le web,
 * TanStack Query v5 en `networkMode: 'online'` (le defaut) ne la fait pas
 * partir du tout : elle passe en `fetchStatus: 'paused'`, `status` reste
 * `pending`, et `isError` reste FAUX.
 *
 * Consequence relevee par `revue-fitcarnet` le 21 septembre 2026 : l'ecran des
 * objectifs n'affichait alors NI l'avertissement, NI le message d'incertitude —
 * exactement le silence que la regle 7 interdit, et que le commentaire de cet
 * ecran disait avoir supprime. Sur Android la requete part et echoue, donc le
 * message s'affichait : le defaut ne se voyait que sur le web.
 *
 * `queryFn` n'est jamais appelee en pause : ce n'est pas une requete perdue,
 * c'est une requete qui attend le reseau. Pour l'ecran, les deux se disent de
 * la meme facon — « le serveur n'a pas repondu ».
 *
 * `isPaused` EST LE DRAPEAU DE LA BIBLIOTHEQUE, pas une comparaison a la main :
 * la documentation de TanStack Query v5 le derive elle-meme de
 * `fetchStatus === 'paused'` et le dit « expose for convenience ». Verifie sur
 * la documentation officielle le 21 septembre 2026, et pas seulement dans le
 * code de `queryObserver`.
 */
const sansReponse = (requete: { isError: boolean; isPaused: boolean }): boolean =>
  requete.isError || requete.isPaused;

/** Ce que le serveur dit d'un mot de passe en cours de frappe. */
export interface VerdictMotDePasse {
  manquements: string[];
  /** Les cinq, dans l'ordre d'affichage, remplies ou non. */
  exigences: { cle: string; dit: string; remplie: boolean }[];
  /** La phrase complete, deja redigee : l'ecran n'a rien a traduire. */
  dit: string | null;
  acceptable: boolean;
  force: 'vide' | 'faible' | 'moyen' | 'bon' | 'solide';
  /** Le mot affiche a cote de la barre. */
  motDeLaForce: string;
}

/**
 * La jauge d'un mot de passe, rendue par le serveur.
 *
 * LE DERNIER DOUBLE JUGE DE CETTE FAMILLE — porte le 20 septembre 2026. La
 * force etait calculee ici ET la-bas, tenue par `api/regles/motdepasse.json`.
 * Le fichier n'a plus rien a verrouiller : il n'y a plus qu'une ecriture.
 *
 * L'ECRAN N'A MEME PLUS A TRADUIRE « longueur » EN « douze caracteres ». C'est
 * ce qui lui faisait porter le chiffre, et c'est ainsi qu'un ecran a conseille
 * « ni majuscule ni chiffre imposes » le jour ou le serveur a commence a les
 * exiger. Le serveur rend la phrase.
 *
 * LA ROUTE EST PUBLIQUE, et il le faut : l'ecran d'invitation s'en sert, et
 * personne n'y a encore de compte.
 */
export function useJaugeMotDePasse(motDePasse: string) {
  const interroge = useRetarde(motDePasse);
  const enRetard = motDePasse !== interroge;

  const requete = useQuery({
    queryKey: ['jauge-mot-de-passe', interroge],
    /* RIEN DE TAPE, RIEN A DEMANDER — le jumeau du garde pose sur l'aliment ce
       matin, et oublie ici le meme jour. Sans lui, monter l'ecran d'invitation
       ou celui du changement de mot de passe partait aussitot en
       `POST {"motDePasse":""}` — sur la SEULE route publique du projet, celle
       qui est bornee a 120 appels par minute. Releve par `revue-pile` le
       21 septembre 2026. */
    enabled: '' !== interroge,
    staleTime: Infinity,
    gcTime: 60_000,
    placeholderData: keepPreviousData,
    /* MEME RAISON QUE POUR L'ALIMENT : une jauge suit la frappe, donc elle
       abandonne ce qu'une frappe plus recente a rendu inutile. */
    queryFn: ({ signal }) => api<VerdictMotDePasse>(
      '/verification/mot-de-passe',
      { methode: 'POST', corps: { motDePasse: interroge }, sansJeton: true, signal }),
  });

  return {
    jauge: requete.data,
    /* Les deux fenetres, comme pour l'aliment : l'anti-rebond que la
       bibliotheque ne voit pas, et l'aller-retour qu'elle voit. */
    perime: enRetard || requete.isPlaceholderData,
    enPanne: sansReponse(requete),
  };
}

/** Ce que le serveur dit d'une cible en cours de saisie. */
export interface VerdictCible {
  /**
   * LA PHRASE, DEJA REDIGEE, ou `null` quand il n'y a rien a dire.
   *
   * L'ecran l'affiche telle quelle. Il n'a ni le seuil, ni les bornes, ni la
   * formule — c'est tout l'interet.
   */
  avertissement: string | null;
}

/** Ce que l'ecran des objectifs soumet au serveur. */
export interface SaisieCible {
  kcal: number;
  prot: number;
  gluc: number;
  lip: number;
  /** Les glucides annonces comprennent-ils les fibres (convention nord-americaine). */
  glucidesTotaux: boolean;
}

/**
 * L'AVERTISSEMENT D'UNE CIBLE, RENDU PAR LE SERVEUR — palier B, 21 septembre 2026.
 *
 * `app/objectifs.tsx` portait la regle entiere : le seuil de 15 kcal, les deux
 * conventions de glucides, et la phrase « Tes grammes representent 740 calories,
 * pas 710 ». Elle vit maintenant dans `api/src/Service/CoherenceDesCibles.php`,
 * et l'ecran ne fait plus qu'afficher.
 *
 * CE N'EST PAS UN REFUS. La cible s'enregistre quand meme : « l'app respecte les
 * grammes ; les calories suivent ». La seule chose que le serveur REFUSE sur une
 * cible, c'est une erreur d'unite (des kilojoules), et c'est `Cible.php` qui s'en
 * charge a l'ecriture. Deux questions differentes, mesurees comme telles.
 *
 * `null` quand l'ecran n'a pas encore de quoi juger : ce qui manque ne vaut pas
 * zero (regle 6), donc on ne demande rien tant que les quatre nombres ne sont
 * pas lisibles. C'est exactement la condition qui commandait l'avertissement
 * avant le palier B.
 */
export function useVerdictCible(saisie: SaisieCible | null) {
  /* MEME ANTI-REBOND QUE POUR L'ALIMENT, ET POUR LA MEME RAISON : il vit DANS le
     hook, sinon `isPlaceholderData` ne voit pas la fenetre de retard et l'ecran
     affiche un avertissement perime a pleine opacite. */
  const interrogee = useRetarde(saisie);
  const enRetard = JSON.stringify(saisie) !== JSON.stringify(interrogee);

  const requete = useQuery({
    queryKey: ['verdict-cible', interrogee],
    enabled: null !== interrogee,
    staleTime: Infinity,
    gcTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api<VerdictCible>(
      '/verification/cible', { methode: 'POST', corps: interrogee, signal }),
  });

  return {
    verdict: requete.data,
    /* Les deux fenetres, comme partout dans ce fichier. */
    perime: enRetard || requete.isPlaceholderData,
    enPanne: sansReponse(requete),
  };
}

/** La cible europeenne que decrit un plan americain. */
export interface CibleConvertie {
  prot: number;
  /** Fibres retranchees. */
  gluc: number;
  lip: number;
  /** Ce qui a ete retranche des glucides. */
  fibres: number;
  /** Recalculees sur les grammes RENDUS, arrondis au dixieme. */
  kcal: number;
  /** Ce que le plan d'origine annoncait, pour comparaison. */
  kcalAnnoncees: number;
}

/** Ce que le serveur rend d'un plan de coach recopie. */
export interface ConversionPlanCoach {
  cible: CibleConvertie;
  /** La phrase sur des fibres sous-estimees, deja redigee, ou `null`. */
  avertissement: string | null;
}

/** Ce que l'ecran recopie d'un plan etranger, avant conversion. */
export interface SaisiePlanCoach {
  kcal: number;
  prot: number;
  /** Glucides TOTAUX, fibres comprises — c'est la convention du plan. */
  gluc: number;
  lip: number;
  fibres: number;
}

/**
 * UN PLAN DE COACH AMERICAIN, CONVERTI PAR LE SERVEUR — palier B, 21 septembre 2026.
 *
 * `front/src/calcul/planCoach.ts` est SUPPRIME dans le meme commit : la
 * conversion, le seuil de plausibilite des fibres et la phrase qui l'accompagne
 * vivent maintenant dans `api/src/Service/PlanCoach.php`, et nulle part
 * ailleurs. Ce n'est pas un jumeau declare comme `Atwater` — c'est un
 * demenagement complet, parce que le module n'avait qu'un seul appelant.
 *
 * `null` tant que les cinq nombres ne sont pas lisibles : ce qui manque ne vaut
 * pas zero (regle 6), et c'est exactement la condition qui commandait
 * l'affichage avant le palier B.
 */
export function useConversionPlanCoach(saisie: SaisiePlanCoach | null) {
  const interrogee = useRetarde(saisie);
  const enRetard = JSON.stringify(saisie) !== JSON.stringify(interrogee);

  const requete = useQuery({
    queryKey: ['conversion-plan-coach', interrogee],
    enabled: null !== interrogee,
    staleTime: Infinity,
    gcTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api<ConversionPlanCoach>(
      '/verification/plan-coach', { methode: 'POST', corps: interrogee, signal }),
  });

  return {
    conversion: requete.data,
    perime: enRetard || requete.isPlaceholderData,
    enPanne: sansReponse(requete),
  };
}
