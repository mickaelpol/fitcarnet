import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View,
} from 'react-native';
import { Bouton, Champ, Discret, Texte } from './base';
import { ChampNombre } from './champNombre';
import { ChampRattachement } from './champRattachement';
import type { AlimentReference } from '../api/types';
import type { SaisieAliment, VerdictAliment } from '../api/hooks/verification';
import {
  CATEGORIES, RATIOS_GUIDES, expliquerRatio, provenanceRatio, ratioDepuisPesees,
} from '@/calcul/nutrition';
/* CET ÉCRAN NE JUGE PLUS RIEN — 20 septembre 2026. Il importait
   `rendementPossible`, `controler`, `soupconKilojoules` et `verifierAliment` :
   quatre jugements qu'il refaisait après le serveur. Ils sont partis avec le
   reste du métier, et `api/regles/rendement.json` n'a plus rien à verrouiller
   pour ce qui le concerne. */
import { C, E, P, R, T, TOUCHE, couleurRole, nb } from '@/theme';
import { nombreSaisi } from '@/calcul/saisieNombre';

export interface AlimentSaisi {
  id?: number;
  nom: string;
  categorie: string;
  kcal100: number;
  prot100: number;
  gluc100: number;
  lip100: number;
  fibres100: number | null;
  ratio: number;
  /** pesées ayant servi à mesurer le ratio ; absentes s'il vient d'une liste */
  peseeAvant?: number | null;
  peseeApres?: number | null;
  /**
   * CE QUE CET ALIMENT EST, au sens du catalogue CIQUAL — le code Anses.
   *
   * `null` est légitime : un produit du commerce peut n'avoir aucun équivalent
   * générique. Mesuré le 20 septembre 2026 — « Orangina » ne trouve rien dans
   * CIQUAL, qui ne porte que des aliments génériques. L'aliment reste pesable
   * et mangeable ; il n'est simplement pas proposé dans une composition.
   *
   * IL NE TOUCHE JAMAIS AUX VALEURS CI-DESSUS.
   */
  referenceCiqual?: string | null;
}

/**
 * État interne du formulaire quand il ne reçoit aucun aliment : une création.
 *
 * SES ZÉROS NE SONT NI AFFICHÉS NI ENVOYÉS. Les champs partent du texte vide
 * (`textesDe` sans aliment), et `valide` exige un texte lisible pour chaque
 * macro : ces 0 ne servent qu'à l'aperçu du contrôle.
 *
 * PLUS EXPORTÉ DEPUIS LE 17 SEPTEMBRE 2026. L'écran le passait comme `aliment`
 * pour ouvrir une création : l'éditeur y voyait un aliment existant dont les
 * quatre macros valent zéro, et les affichait « 0 ». Un oubli partait alors en
 * base comme une valeur (règle 6). Une création se demande en ne passant
 * AUCUN aliment — `EditeurAlimentConnecte` le fait sur `creation`.
 */
const ALIMENT_VIDE: AlimentSaisi = {
  nom: '', categorie: 'prot', kcal100: 0, prot100: 0, gluc100: 0,
  lip100: 0, fibres100: null, ratio: 1,
  peseeAvant: null, peseeApres: null,
};

type CleNombre = 'kcal100' | 'prot100' | 'gluc100' | 'lip100' | 'fibres100';

/**
 * Lecture numérique d'un champ de saisie.
 *
 * REMONTÉE ICI LE 15 SEPTEMBRE 2026, ET CE N'EST PAS DU RANGEMENT (F13).
 * C'était un `const` déclaré DANS le composant, une trentaine de lignes SOUS
 * `majNombre`, qui l'appelle. Le code ne plantait que par chance : `majNombre`
 * n'est invoqué qu'à la frappe, donc après le premier rendu, donc après la
 * zone morte temporelle du `const`. Le jour où ce bloc serait appelé pendant
 * le rendu — ou extrait dans un hook, ce que le plan de l'audit prévoit —
 * l'écran serait mort sur un `ReferenceError`.
 *
 * Rien ici ne dépend de l'état du composant : la fonction n'avait aucune raison
 * d'y vivre. Au niveau du module, la zone morte est franchie au chargement et
 * l'ordre ne peut plus se retourner contre nous.
 */
const nombre = (v: string): number => nombreSaisi(v) ?? 0;
/* LE 0 CI-DESSUS NE SERT QU'À L'APERÇU, ET C'EST TOUT LE CORRECTIF.
   Jusqu'au 15 septembre 2026, ce 0 partait EN BASE : une macro vidée ou
   illisible s'enregistrait « 0 g ». Les calories vides étaient déjà refusées
   (`kcal100 > 0`), un zéro incohérent aussi, par le contrôle — restait le cas
   qui passe, une macro qui vaut zéro pour cet aliment : vider les protéines de
   l'huile d'olive donnait les mêmes valeurs, et « je ne sais pas » devenait
   « zéro gramme » (règle 6). Relevé par la revue. Désormais `valide` exige un
   texte LISIBLE pour chaque macro obligatoire : ce 0 n'atteint plus l'API. */

/**
 * Texte indicatif des quatre macros. « 0 » l'a été jusqu'au 17 septembre 2026 :
 * gris clair dans un champ vide, il se lisait comme un zéro saisi — la
 * confusion même que la règle 6 interdit.
 */
const A_SAISIR = 'à saisir';

/** Ce texte désigne-t-il un nombre ? Vide ne compte pas comme lisible. */
const lisible = (texte: string): boolean => nombreSaisi(texte) !== null;

/**
 * Texte de départ des champs numériques.
 *
 * Sur un aliment existant, un zéro est une valeur : l'huile n'a pas de
 * protéines et doit afficher « 0 », pas un champ vide. Sur une création,
 * tout part vide pour laisser parler les indications de saisie.
 */
const textesDe = (aliment?: AlimentSaisi): Record<CleNombre, string> => {
  if (aliment === undefined) {
    return { kcal100: '', prot100: '', gluc100: '', lip100: '', fibres100: '' };
  }

  return {
    kcal100: String(aliment.kcal100),
    prot100: String(aliment.prot100),
    gluc100: String(aliment.gluc100),
    lip100: String(aliment.lip100),
    fibres100: aliment.fibres100 === null ? '' : String(aliment.fibres100),
  };
};

/**
 * Saisie d'un aliment et de ses valeurs nutritionnelles.
 *
 * Volontairement manuelle : entre deux marques de skyr, les macros varient
 * assez pour fausser une diète. L'emballage de l'utilisateur fait foi,
 * mieux qu'une base contributive.
 */
export function EditeurAliment({
  visible, aliment, titre = 'Nouvel aliment', onEnregistrer, onFermer, enCours, erreur,
  quantite, onQuantiteChange, nomModifiable = true, nomImpose,
  rattachement, verdict, verdictPerime, verdictEnPanne, onSaisie,
}: {
  visible: boolean;
  aliment?: AlimentSaisi;
  /**
   * Le nom d'un aliment dont on ne connaît AUCUNE valeur.
   *
   * Le cas des produits Grocy jamais renseignés (19 septembre 2026) : le nom
   * existe, les macros n'existent pas. On ne peut donc pas passer `aliment` —
   * il obligerait à inventer des nombres, et `ALIMENT_VIDE` les met à zéro,
   * ce qui est précisément le défaut corrigé le 17 septembre (règle 6 : un
   * oubli n'est pas un zéro). Les champs restent vides, seul le nom est posé.
   */
  nomImpose?: string;
  titre?: string;
  onEnregistrer: (a: AlimentSaisi) => void;
  onFermer: () => void;
  enCours?: boolean;
  /** message d'échec de l'enregistrement ; la saisie reste à l'écran */
  erreur?: string | null;
  /**
   * Quantité déjà possédée, saisie à la création seulement.
   * Le champ n'apparaît que si `onQuantiteChange` est fourni : ailleurs la
   * quantité se corrige dans l'inventaire, seul endroit où elle s'écrit.
   */
  quantite?: string;
  onQuantiteChange?: (v: string) => void;
  /** faux quand le nom appartient à une source externe, Grocy par exemple */
  nomModifiable?: boolean;
  /**
   * DE QUOI RATTACHER L'ALIMENT AU CATALOGUE CIQUAL — fourni par l'appelant.
   *
   * Ce composant est PUR : il ne fait aucun appel réseau, et c'est ce qui
   * permet de le monter dans un test sans client HTTP. La recherche vit donc
   * chez `EditeurAlimentConnecte`. Absent, le champ n'apparaît pas — un écran
   * qui n'a pas de quoi chercher ne propose pas de chercher.
   */
  rattachement?: {
    recherche: string;
    resultats: AlimentReference[];
    onRecherche: (q: string) => void;
  };
  /**
   * LE VERDICT, RENDU PAR LE SERVEUR — décision du 20 septembre 2026.
   *
   * Cet écran n'évalue plus rien : il affiche ce qui lui arrive. Le métier
   * vit sur le serveur, pour qu'un front écrit demain dans une autre
   * technologie n'ait rien à réimplémenter — et rien à oublier de
   * réimplémenter, ce qui est le vrai sujet.
   *
   * `undefined` veut dire « pas encore de réponse » : on n'affiche alors NI
   * refus NI résumé, plutôt qu'un avis fabriqué ici en attendant. Inventer un
   * verdict local le temps de l'aller-retour, c'est réintroduire exactement
   * la deuxième écriture qu'on vient de retirer.
   */
  verdict?: VerdictAliment;
  /**
   * Vrai quand `verdict` décrit une saisie PRÉCÉDENTE.
   *
   * On le garde à l'écran plutôt que de vider le bandeau — sinon il
   * clignoterait à chaque frappe — mais on l'ATTÉNUE et on n'agit pas dessus :
   * un bouton éteint par un verdict périmé refuserait une saisie que le
   * serveur accepte.
   */
  verdictPerime?: boolean;
  /**
   * LE SERVEUR N'A PAS RÉPONDU — réseau coupé, ou erreur.
   *
   * Il FAUT le dire. Sans réponse, `verdict` vaut `undefined` et l'écran
   * affichait un cadre bordé et VIDE, avec le bouton actif : ni un refus, ni
   * une incertitude énoncée, mais une absence de réponse déguisée en réponse.
   * La règle 7 demande l'inverse.
   */
  verdictEnPanne?: boolean;
  /**
   * Appelé à chaque frappe, avec les champs TELS QU'ILS SONT TAPÉS.
   *
   * SA RÉFÉRENCE DOIT ÊTRE STABLE — un `setState` de React, ou un
   * `useCallback`. Elle est dans les dépendances de l'effet qui la déclenche :
   * une lambda écrite en ligne bouclerait à l'infini, et ni le typage ni un
   * test ne l'annoncent.
   */
  onSaisie?: (s: SaisieAliment) => void;
}) {
  const [a, setA] = useState<AlimentSaisi>(aliment ?? { ...ALIMENT_VIDE, nom: nomImpose ?? '' });
  const [mesurer, setMesurer] = useState(false);
  /* LES PESÉES SONT DES NOMBRES, ET LEUR TEXTE VIT DANS `ChampNombre`.
     Jusqu'au 26 septembre 2026, c'étaient deux textes tenus à la main : une
     seconde façon de faire, relue par `String(…)` — 42,5 g revenait « 42.5 » —
     et une pesée illisible ne se voyait pas, elle faisait seulement disparaître
     le bouton. `null` : pas de pesée, ou une pesée illisible (règle 6). */
  const [avant, setAvant] = useState<number | null>(null);
  const [apres, setApres] = useState<number | null>(null);

  /* Le texte saisi vit à part du nombre.
     Piloter l'input avec String(nombre) rendait la saisie impossible : « 0 »
     redonnait '', « 0,8 » repassait par « 0 » puis « 0, » que parseFloat
     ramenait à 0, et le séparateur disparaissait sous les doigts. Le champ
     garde donc le texte tel quel ; le nombre n'en est que la lecture. */
  const [textes, setTextes] = useState<Record<CleNombre, string>>(textesDe(aliment));

  /* ON DÉPEND DE L'IDENTITÉ DE L'ALIMENT, PAS DE LA RÉFÉRENCE DE L'OBJET.
     ET C'EST UNE CORRECTION, DU 15 SEPTEMBRE 2026.

     Cet effet dépendait de `aliment`, donc de la référence. L'appelant
     construit cet objet à la volée — `versSaisie(edite)` — c'est-à-dire un
     objet NEUF à chaque rendu du parent. Chaque rendu rejouait donc l'effet
     et remettait le formulaire à ses valeurs de départ, EN PLEINE SAISIE,
     sans rien afficher.

     Le déclencheur n'avait rien de théorique : `useSuiviInventaire` bat
     toutes les deux secondes tant qu'un inventaire tourne, et son
     `refetchIntervalInBackground` le fait battre même écran quitté. Corriger
     les fibres d'un aliment pendant un inventaire, c'était voir sa saisie
     s'effacer toutes les deux secondes.

     Corrigé ICI plutôt que chez l'appelant, en mémoïsant de son côté : un
     seul composant appelle `EditeurAliment` aujourd'hui, le prochain
     n'héritera pas du piège. C'est la leçon d'É1 — le contrôle va au point de
     passage obligé, pas devant chaque porte.

     CE QUI IDENTIFIE UN ALIMENT ICI, ET POURQUOI PAS SEULEMENT `id`.
     Relevé le 15 septembre 2026 par la revue : `versSaisie`, le seul appelant
     réel, ne renseigne PAS `id` — un `AlimentDisponible` porte une `reference`
     (« grocy:12 », « base:47 »), pas un identifiant numérique. `aliment?.id`
     valait donc toujours `null` en production, et cette dépendance était
     inerte : seul `visible` faisait rejouer l'effet.

     Ça marchait, parce que `frigo.tsx` remet `edite` à `null` avant toute
     réouverture. Mais rien ne l'impose : un écran qui passerait de A à B sans
     repasser par `null` afficherait le titre de B et les valeurs de A, en
     silence. Le nom sert donc de repli — il identifie l'aliment aussi bien, il
     est toujours présent, et il ne change pas pendant la saisie puisque c'est
     la PROP, pas l'état local du formulaire. */
  const identite = aliment?.id ?? aliment?.nom ?? nomImpose ?? null;

  useEffect(() => {
    if (visible) {
      const depart = aliment ?? { ...ALIMENT_VIDE, nom: nomImpose ?? '' };
      setA(depart);
      setTextes(textesDe(aliment));
      setMesurer(false);
      // une mesure antérieure se retrouve, pour la vérifier ou la refaire
      setAvant(depart.peseeAvant ?? null);
      setApres(depart.peseeApres ?? null);
    }
    // `aliment` est volontairement absent des dépendances : voir ci-dessus.
  }, [visible, identite]);

  const maj = (champs: Partial<AlimentSaisi>) => setA({ ...a, ...champs });

  /** Saisie d'un champ numérique : on conserve le texte, on en déduit le nombre. */
  const majNombre = (cle: CleNombre, texte: string) => {
    setTextes((t) => ({ ...t, [cle]: texte }));

    if ('fibres100' === cle) {
      // les fibres sont facultatives : vide veut dire « non renseigné », pas zéro
      maj({ fibres100: texte.trim() === '' ? null : nombre(texte) });

      return;
    }

    maj({ [cle]: nombre(texte) });
  };

  const changerCategorie = (categorie: string) => maj({ categorie });



  /* LA LECTURE EST CELLE DE `ChampNombre`, donc de `nombreSaisi` et non de
     `parseFloat` : « 4,2,1 » g se lisait 4,2 et proposait un ratio calculé sur
     une pesée qui n'existe pas. Illisible, la pesée vaut `null` ici. */
  const ratioMesure = ratioDepuisPesees(avant ?? NaN, apres ?? NaN);

  /* CE QUI EST TAPÉ, ENVOYÉ AU PARENT. Il en fait un appel au serveur, avec
     anti-rebond ; cet écran ne sait pas qu'il y a un réseau. On envoie les
     TEXTES et non les nombres : lire « 12,5 » est aussi une règle métier, et
     elle est partie sur le serveur avec le reste. */
  const saisie: SaisieAliment = {
    categorie: a.categorie,
    kcal100: textes.kcal100,
    prot100: textes.prot100,
    gluc100: textes.gluc100,
    lip100: textes.lip100,
    fibres100: textes.fibres100,
    ratio: String(a.ratio),
    /* Le rendement en cours de mesure part avec le reste : c'est le serveur
       qui dira s'il est acceptable, pas cet ecran. */
    ratioCandidat: ratioMesure === null ? '' : String(ratioMesure),
    /* CE QUE LA FICHE PORTAIT EN ARRIVANT. Sur une création il n'y a pas
       d'aliment, donc pas d'origine : tout y est nouveau. */
    origine: aliment === undefined ? undefined : {
      categorie: aliment.categorie,
      kcal100: String(aliment.kcal100),
      prot100: String(aliment.prot100),
      gluc100: String(aliment.gluc100),
      lip100: String(aliment.lip100),
      fibres100: aliment.fibres100 === null ? '' : String(aliment.fibres100),
      ratio: String(aliment.ratio),
    },
  };
  const signature = JSON.stringify(saisie);

  useEffect(() => { onSaisie?.(JSON.parse(signature) as SaisieAliment); }, [signature, onSaisie]);

  const OBLIGATOIRES = ['kcal100', 'prot100', 'gluc100', 'lip100'] as const;
  const macrosLisibles = OBLIGATOIRES.every((cle) => lisible(textes[cle]))
    && (textes.fibres100.trim() === '' || lisible(textes.fibres100));
  const illisible = (cle: CleNombre): boolean => textes[cle].trim() !== '' && !lisible(textes[cle]);

  const refus = verdict?.refus ?? [];

  const valide = a.nom.trim() !== ''
    && macrosLisibles
    && a.kcal100 > 0
    /* LE DROIT D'ENREGISTRER VIENT DU SERVEUR. `enregistrable` porte à la fois
       « aucun refus » et « les quatre valeurs obligatoires sont lisibles » :
       l'écran ne le recalcule pas. Tant qu'aucune réponse n'est arrivée, on
       laisse le bouton actif — c'est l'API qui tranchera, et un bouton éteint
       par défaut ferait croire à un formulaire cassé. */
    /* PAS SUR UN VERDICT PÉRIMÉ : il décrit la saisie d'avant. Éteindre le
       bouton là-dessus refuserait une valeur que le serveur accepte. */
    && (verdictPerime === true || (verdict?.enregistrable ?? true));

  /* La teinte traduit la décision du serveur ; elle ne la prend plus. */
  const couleurVerdict = {
    coherent: C.ok, ecart: C.vif, incoherent: C.erreur, indecidable: C.attenue,
  }[verdict?.verdict ?? 'indecidable'];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFermer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Pressable style={s.fond} onPress={onFermer}>
          <Pressable style={s.boite} onPress={(e) => e.stopPropagation()}>
            <Texte style={s.titre}>{titre}</Texte>

            <ScrollView style={{ marginTop: E.m }} keyboardShouldPersistTaps="handled">
              {nomModifiable ? (
                <Champ
                  etiquette="Nom"
                  valeur={a.nom}
                  onChange={(v) => maj({ nom: v })}
                  placeholder="Skyr nature Milbona"
                />
              ) : (
                <>
                  <Discret style={[s.section, { marginTop: 0 }]}>Nom</Discret>
                  <Texte>{a.nom}</Texte>
                  <Discret style={s.aide}>
                    Le nom vient de Grocy. Renomme le produit là-bas si besoin :
                    le modifier ici ne changerait rien.
                  </Discret>
                </>
              )}

              {/* LE RATTACHEMENT VIENT JUSTE APRÈS LE NOM, et c'est voulu : les
                  deux répondent à la même question — « qu'est-ce que c'est ? ».
                  Le nom est celui du paquet, le rattachement celui du type.
                  Les macros, plus bas, sont d'une autre nature : elles se
                  lisent sur l'étiquette, jamais dans le catalogue. */}
              {rattachement !== undefined && (
                <View style={{ marginTop: E.m }}>
                  <ChampRattachement
                    valeur={a.referenceCiqual ?? null}
                    nomAliment={a.nom}
                    kcalSaisies={nombreSaisi(textes.kcal100)}
                    recherche={rattachement.recherche}
                    resultats={rattachement.resultats}
                    onRecherche={rattachement.onRecherche}
                    onChange={(code) => maj({ referenceCiqual: code })}
                  />
                </View>
              )}

              {onQuantiteChange !== undefined && (
                <>
                  <Champ
                    etiquette="Quantité déjà en stock (facultatif)"
                    unite="g" numerique style={{ marginTop: E.s }}
                    valeur={quantite ?? ''}
                    onChange={onQuantiteChange}
                    placeholder="0"
                  />
                  <Discret style={s.aide}>
                    Laisse vide si tu n'en as pas encore. L'aliment sera créé à
                    zéro et se remplira au prochain inventaire.
                  </Discret>
                </>
              )}

              <Discret style={s.section}>Catégorie</Discret>
              <View style={s.categories}>
                {CATEGORIES.map((c) => (
                  <Pressable
                    key={c.cle}
                    onPress={() => changerCategorie(c.cle)}
                    style={[
                      s.categorie,
                      a.categorie === c.cle && {
                        backgroundColor: couleurRole(c.cle),
                        borderColor: couleurRole(c.cle),
                      },
                    ]}
                  >
                    <Discret style={a.categorie === c.cle
                      ? { color: C.fond, fontFamily: P.fort, fontSize: T.petit }
                      : { fontSize: T.petit }}>
                      {c.libelle}
                    </Discret>
                  </Pressable>
                ))}
              </View>
              <Discret style={{ fontSize: T.petit, marginTop: 4 }}>
                {CATEGORIES.find((c) => c.cle === a.categorie)?.exemple}
              </Discret>

              {/* ---- valeurs nutritionnelles ---- */}
              <Discret style={s.section}>Pour 100 g, d'après l'emballage</Discret>

              <View style={s.paire}>
                <Champ etiquette="Calories" unite="kcal" numerique style={{ flex: 1 }}
                  valeur={textes.kcal100}
                  onChange={(v) => majNombre('kcal100', v)} placeholder={A_SAISIR}
                  illisible={illisible('kcal100')} />
                <Champ etiquette="Protéines" unite="g" numerique style={{ flex: 1 }}
                  valeur={textes.prot100}
                  onChange={(v) => majNombre('prot100', v)} placeholder={A_SAISIR}
                  illisible={illisible('prot100')} />
              </View>
              <View style={[s.paire, { marginTop: E.s }]}>
                <Champ etiquette="Glucides" unite="g" numerique style={{ flex: 1 }}
                  valeur={textes.gluc100}
                  onChange={(v) => majNombre('gluc100', v)} placeholder={A_SAISIR}
                  illisible={illisible('gluc100')} />
                <Champ etiquette="Lipides" unite="g" numerique style={{ flex: 1 }}
                  valeur={textes.lip100}
                  onChange={(v) => majNombre('lip100', v)} placeholder={A_SAISIR}
                  illisible={illisible('lip100')} />
              </View>
              {/* LE BOUTON NE SE DÉSACTIVE PAS EN SILENCE. Une macro vide bloque
                  l'enregistrement : on dit pourquoi, et comment en sortir. */}
              {!macrosLisibles && (
                <Discret style={{ color: C.erreur, marginTop: E.xs }}>
                  Renseigne les quatre valeurs — écris 0 si l'aliment n'en contient pas.
                </Discret>
              )}

              <Discret style={s.aide}>
                Les calories se saisissent en <Texte style={{ fontSize: T.petit }}>kcal</Texte>,
                jamais en kJ. Une étiquette européenne affiche les deux, les
                kilojoules en premier et en plus gros : sur « 1473 kJ / 352 kcal »,
                c'est 352 qu'il faut reprendre. Un paquet qui écrit « cal » ou
                « Calories » parle déjà de kcal.
              </Discret>

              <Discret style={s.aide}>
                « Dont sucres » fait partie des glucides : ne l'ajoute pas.
                Idem pour les acides gras saturés, compris dans les lipides.
              </Discret>

              {verdict?.conversion != null && verdictPerime !== true && (
                <View style={[s.controle, { borderColor: C.vif }]}>
                  <Discret style={{ color: C.vif, fontSize: T.normal, lineHeight: 18 }}>
                    {verdict.conversion.motif === 'plafond'
                      ? `${nb(verdict.conversion.saisi)} kcal pour 100 g est impossible : rien ne dépasse `
                        + '900 kcal, la densité de la matière grasse pure. '
                      : `${nb(verdict.conversion.saisi)} est exactement 4,18 fois ce que donnent tes macros. `}
                    Tu as probablement recopié les kilojoules.
                  </Discret>
                  <Bouton
                    variante="contour"
                    onPress={() => majNombre('kcal100', String(verdict.conversion?.converti ?? ''))}
                    style={{ marginTop: E.s }}
                  >
                    {`Convertir : ${nb(verdict.conversion.saisi)} kJ = ${nb(verdict.conversion.converti)} kcal`}
                  </Bouton>
                </View>
              )}

              <Champ
                etiquette="Fibres (facultatif)"
                unite="g" numerique style={{ marginTop: E.s }}
                valeur={textes.fibres100}
                onChange={(v) => majNombre('fibres100', v)}
                placeholder="—"
              />
              {a.fibres100 === null && (
                <Discret style={s.aide}>
                  Sans les fibres, la vérification ci-dessous reste approximative :
                  elles comptent pour 2 calories par gramme et faussent l'écart sur
                  les aliments qui en contiennent — légumes, oléagineux, céréales
                  complètes.
                </Discret>
              )}

              {/* ---- contrôle ---- */}
              {verdictEnPanne === true ? (
                /* ON DIT L'INCERTITUDE PLUTÔT QU'UN CADRE VIDE (règle 7). */
                <View style={[s.controle, { borderColor: C.attenue }]}>
                  <Discret style={{ color: C.attenue, fontSize: T.normal, lineHeight: 18 }}>
                    Le contrôle des valeurs n'a pas pu être fait : le serveur
                    n'a pas répondu. Tu peux enregistrer — il vérifiera à ce
                    moment-là.
                  </Discret>
                </View>
              ) : refus.length > 0 ? (
                /* LE REFUS PASSE DEVANT. Afficher « cohérent » au-dessus de
                   « le serveur va refuser » serait deux réponses à la même
                   question. */
                <View style={[s.controle, { borderColor: C.erreur },
                  verdictPerime === true && { opacity: 0.45 }]}>
                  {refus.map((x) => (
                    <Discret key={x.champ + x.message}
                      style={{ color: C.erreur, fontSize: T.normal, lineHeight: 18 }}>
                      {x.message}
                    </Discret>
                  ))}
                </View>
              ) : (a.kcal100 > 0 || a.prot100 > 0) && (
                <View style={[s.controle, { borderColor: couleurVerdict },
                  verdictPerime === true && { opacity: 0.45 }]}>
                  <Discret style={{ color: couleurVerdict, fontSize: T.normal, lineHeight: 18 }}>
                    {verdict?.resume ?? ''}
                  </Discret>
                </View>
              )}

              {/* ---- ratio ---- */}
              <Discret style={s.section}>Changement de poids à la cuisson</Discret>

              {/* LE REFUS S'EXPLIQUE, IL NE SE CONTENTE PAS DE GRISER LE BOUTON.
                  Le 16 septembre 2026, `rendementPossible` a remplacé un garde
                  aveugle à la catégorie — un progrès net, mais muet : la
                  catégorie par défaut d'un nouvel aliment est « prot », et
                  choisir le guide « riz, pâtes : 100 g → 230 g » rendait
                  « Enregistrer » inerte SANS un mot, pendant que la ligne
                  au-dessus affichait tranquillement « 100 g avant cuisson
                  donnent 230 g une fois cuits ». Règle 7 : une déviation
                  s'explique à l'écran. Relevé par la revue le soir même. */}
              {refus.some((x) => x.champ === 'ratio') && (
                <Discret style={{ color: C.erreur, fontSize: T.petit, lineHeight: 16 }}>
                  {a.categorie === 'fec'
                    ? 'Un féculent absorbe de l\'eau : il ne peut pas peser moins cuit que cru. '
                    : 'Une viande, un poisson ou un légume PERD de l\'eau : il ne peut pas '
                      + 'peser plus cuit que cru. '}
                  Tant que ce rendement reste tel quel, l'aliment ne peut pas être
                  enregistré — la base le refuserait.
                </Discret>
              )}

              {!mesurer ? (
                <>
                  {RATIOS_GUIDES.map((g) => (
                    <Pressable
                      key={g.cle}
                      onPress={() => maj({
                        ratio: g.valeur, peseeAvant: null, peseeApres: null,
                      })}
                      style={[s.choixRatio, Math.abs(a.ratio - g.valeur) < 0.01 && s.choixActif]}
                    >
                      <View style={{ flex: 1 }}>
                        <Texte style={{ fontSize: T.normal }}>{g.libelle}</Texte>
                        <Discret style={{ fontSize: T.petit }}>{g.exemple}</Discret>
                      </View>
                      {Math.abs(a.ratio - g.valeur) < 0.01 && (
                        <Discret style={{ color: C.vif }}>✓</Discret>
                      )}
                    </Pressable>
                  ))}
                  <Bouton variante="discret" onPress={() => setMesurer(true)}>
                    <Discret style={{ fontSize: T.normal, textDecorationLine: 'underline' }}>
                      Je préfère mesurer
                    </Discret>
                  </Bouton>
                </>
              ) : (
                <View style={s.mesure}>
                  <Discret style={{ fontSize: T.normal, lineHeight: 18 }}>
                    Pèse ton aliment <Texte style={{ fontSize: T.normal }}>avant</Texte> de le
                    cuire, note le poids. Cuis-le, égoutte-le, et pèse-le
                    {' '}<Texte style={{ fontSize: T.normal }}>après</Texte>. L'app en déduit le reste.
                  </Discret>
                  <View style={[s.paire, { marginTop: E.s }]}>
                    <ChampNombre etiquette="Poids avant cuisson" unite="g"
                      style={{ flex: 1 }} valeur={avant} onChange={setAvant} placeholder="100" />
                    <ChampNombre etiquette="Poids après cuisson" unite="g"
                      style={{ flex: 1 }} valeur={apres} onChange={setApres} placeholder="230" />
                  </View>
                  {ratioMesure !== null && (
                    <Bouton
                      onPress={() => {
                        /* `nombreSaisi` ET NON `parseFloat` — corrigé le
                           20 septembre 2026, palier 1. Ces deux lignes
                           enregistraient les pesées par `parseFloat` sous un
                           commentaire qui l'interdisait plus haut (celui de
                           `ratioMesure`), et qui expliquait pourquoi :
                           « 4,2,1 » se lit 4,2.

                           LE GARDE `ratioMesure !== null` LES FAISAIT
                           COÏNCIDER PAR ACCIDENT, et c'est tout ce qui tenait.
                           Trois notations lui échappaient : `Number('0x10')`
                           vaut 16 quand `parseFloat('0x10')` vaut 0 — idem
                           pour `0b101` et `0o17`. Le ratio se calculait sur
                           16, la pesée s'enregistrait à 0. Inatteignable au
                           clavier numérique d'Android, atteignable au collage
                           sur le web. Relevé par `verite-documentaire`.

                           Elles s'écrivaient alors `nombreSaisi(…)`, sans
                           `?? 0` : une pesée illisible est une absence, pas
                           un zéro (règle 6).

                           DEPUIS LE 26 SEPTEMBRE 2026, LA LECTURE N'EST PLUS
                           ICI : `ChampNombre` remonte déjà le nombre, ou
                           `null`. Ce qui s'enregistre est ce qui a servi au
                           ratio — ils ne peuvent plus diverger. */
                        maj({
                          ratio: ratioMesure,
                          peseeAvant: avant,
                          peseeApres: apres,
                        });
                        setMesurer(false);
                      }}
                      desactive={verdictPerime === true || verdict?.candidat?.acceptable === false}
                      style={{ marginTop: E.s }}
                    >
                      {verdict?.candidat?.acceptable === false
                        ? 'Ces deux poids sont inversés : ce produit ne peut pas varier ainsi'
                        : `Utiliser ce résultat (${nb(ratioMesure)})`}
                    </Bouton>
                  )}
                  <Bouton variante="discret" onPress={() => setMesurer(false)}>
                    <Discret style={{ fontSize: T.normal }}>Revenir aux valeurs courantes</Discret>
                  </Bouton>
                </View>
              )}

              <Discret style={[s.aide, { color: C.attenue }]}>
                {expliquerRatio(a.ratio)}
              </Discret>
              {provenanceRatio(a.peseeAvant, a.peseeApres) !== null ? (
                <Discret style={[s.aide, { color: C.ok }]}>
                  ✓ {provenanceRatio(a.peseeAvant, a.peseeApres)}
                </Discret>
              ) : (
                <Discret style={s.aide}>
                  Valeur courante — mesure-la pour un chiffre propre à ton produit.
                </Discret>
              )}

              {/* Il y avait ici un sélecteur « cru ou sec / déjà cuit ». Il a
                  disparu, et c'est la meilleure nouvelle de cet écran : il
                  demandait à l'utilisateur de trancher une question à laquelle
                  son paquet répondait déjà, et une erreur de clic faisait peser
                  trois fois trop de riz sans que rien ne le signale. Les
                  valeurs sont maintenant TOUJOURS celles du produit tel qu'on
                  le pèse — c'est ce que dit l'emballage, toujours. */}
              <Discret style={s.aide}>
                Recopie les valeurs de l'emballage telles quelles : elles décrivent
                le produit tel que tu le pèses, sec pour le riz, cru pour la viande.
                Le poids une fois cuit se déduit du rendement ci-dessus.
              </Discret>
            </ScrollView>

            {erreur !== null && erreur !== undefined && erreur !== '' && (
              <View style={[s.controle, { borderColor: C.erreur }]}>
                <Discret style={{ color: C.erreur, fontSize: T.normal, lineHeight: 18 }}>
                  {erreur}
                </Discret>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: E.s, marginTop: E.m }}>
              <Bouton variante="contour" onPress={onFermer} style={{ flex: 1 }}>
                Annuler
              </Bouton>
              <Bouton
                onPress={() => onEnregistrer(a)}
                desactive={!valide || enCours === true}
                style={{ flex: 1 }}
              >
                {enCours === true ? 'Enregistrement…' : 'Enregistrer'}
              </Bouton>
            </View>
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
  boite: {
    backgroundColor: C.surface, borderRadius: R.l, borderWidth: 1, borderColor: C.ligne,
    padding: E.m, maxHeight: '90%', width: '100%', maxWidth: 520,
  },
  titre: { fontFamily: P.titre, fontSize: T.titre, letterSpacing: 0.8, textTransform: 'uppercase' },
  section: {
    fontSize: T.minuscule, letterSpacing: 1, textTransform: 'uppercase',
    marginTop: E.l, marginBottom: E.xs,
  },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  categorie: {
    // 38 px auparavant, sous les 44 que `TOUCHE` impose au reste de l'app.
    paddingHorizontal: E.m, minHeight: TOUCHE, borderRadius: R.s, borderWidth: 1,
    borderColor: C.ligne, backgroundColor: C.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  paire: { flexDirection: 'row', gap: E.s },
  aide: { fontSize: T.petit, lineHeight: 16, marginTop: 6 },
  controle: {
    borderWidth: 1, borderRadius: R.s, padding: E.s, marginTop: E.m,
    backgroundColor: C.surface2,
  },
  choixRatio: {
    flexDirection: 'row', alignItems: 'center', gap: E.s, minHeight: TOUCHE + 6,
    paddingHorizontal: E.m, borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    backgroundColor: C.surface2, marginBottom: 5,
  },
  choixActif: { borderColor: C.vif },
  mesure: {
    backgroundColor: C.surface2, borderRadius: R.s, padding: E.m,
    borderWidth: 1, borderColor: C.ligne,
  },
});
