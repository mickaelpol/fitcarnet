import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View,
} from 'react-native';
import { Bouton, Champ, Discret, Texte } from './base';
import { ChampRattachement } from './champRattachement';
import type { AlimentReference } from '../api/types';
import type { Grief, SaisieAliment, VerdictAliment } from '../api/hooks/verification';
import { CATEGORIES, RATIOS_GUIDES } from '@/calcul/nutrition';
/* CET ÉCRAN NE JUGE PLUS RIEN — 20 septembre 2026. Il importait
   `rendementPossible`, `controler`, `soupconKilojoules` et `verifierAliment` :
   quatre jugements qu'il refaisait après le serveur. Ils sont partis avec le
   reste du métier, et `api/regles/rendement.json` n'a plus rien à verrouiller
   pour ce qui le concerne.

   ET IL NE LIT PLUS RIEN NON PLUS — 26 septembre 2026, feature
   `macros-editeur-vide-pas-zero`. Il importait encore `nombreSaisi` pour
   convertir chaque champ, et `ratioDepuisPesees`, `provenanceRatio`,
   `expliquerRatio` pour calculer puis dire le rendement. Une macro vide ou
   illisible devenait 0 dans son état (`nombreSaisi(v) ?? 0`), et ce 0
   décidait encore du bouton et du résumé (règle 6). Tout est parti au
   serveur : l'écran envoie les textes, affiche ce qui revient.
   `lectureAuServeur.test.ts` refuse qu'une lecture revienne ici. */
import { C, E, P, R, T, TOUCHE, couleurRole, nb } from '@/theme';
import { frappeNumeriqueAcceptee, texteDuNombre } from '@/calcul/saisieNombre';

/** Un aliment déjà connu, tel que l'écran le reçoit : des nombres, venus du serveur. */
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

/** Les champs numériques de l'éditeur : leur TEXTE est tout ce que l'écran tient. */
type CleTexte = 'kcal100' | 'prot100' | 'gluc100' | 'lip100' | 'fibres100'
  | 'ratio' | 'peseeAvant' | 'peseeApres';

/**
 * CE QUE L'ÉDITEUR REMET À L'ENREGISTREMENT : LA SAISIE TELLE QUE TAPÉE.
 *
 * Jusqu'au 26 septembre 2026, c'était un `AlimentSaisi` — des nombres, lus par
 * l'écran, et un ratio qu'il avait calculé lui-même. Le serveur les croyait.
 * Désormais `POST`/`PATCH /api/aliments` reçoivent ces textes et les lisent
 * avec le même lecteur que le verdict (`NombreSaisi`) : un seul juge.
 */
export type AlimentTape = { nom: string; categorie: string; referenceCiqual?: string | null }
  & Record<CleTexte, string>;

/**
 * Texte de départ des champs numériques.
 *
 * Sur un aliment existant, un zéro est une valeur : l'huile n'a pas de
 * protéines et doit afficher « 0 », pas un champ vide. Sur une création,
 * tout part vide pour laisser parler les indications de saisie — sauf le
 * rendement, qui part de « le poids ne change pas ».
 *
 * `texteDuNombre` ET NON `String` : 42,5 g se relit « 42,5 », pas « 42.5 »
 * (feature `pesees-editeur-aliment-saisienombre`, 26 septembre 2026).
 *
 * `ALIMENT_VIDE` VIVAIT ICI, avec ses quatre macros à zéro « qui ne servaient
 * qu'à l'aperçu ». L'aperçu est au serveur : il n'y a plus de zéro à inventer.
 */
const textesDe = (aliment?: AlimentSaisi): Record<CleTexte, string> => {
  if (aliment === undefined) {
    return {
      kcal100: '', prot100: '', gluc100: '', lip100: '', fibres100: '',
      ratio: '1', peseeAvant: '', peseeApres: '',
    };
  }

  return {
    kcal100: texteDuNombre(aliment.kcal100),
    prot100: texteDuNombre(aliment.prot100),
    gluc100: texteDuNombre(aliment.gluc100),
    lip100: texteDuNombre(aliment.lip100),
    fibres100: texteDuNombre(aliment.fibres100),
    ratio: texteDuNombre(aliment.ratio),
    peseeAvant: texteDuNombre(aliment.peseeAvant ?? null),
    peseeApres: texteDuNombre(aliment.peseeApres ?? null),
  };
};

/**
 * Texte indicatif des quatre macros. « 0 » l'a été jusqu'au 17 septembre 2026 :
 * gris clair dans un champ vide, il se lisait comme un zéro saisi — la
 * confusion même que la règle 6 interdit.
 */
const A_SAISIR = 'à saisir';

/**
 * Les champs qui ont une case à l'écran : leurs refus s'affichent dessous.
 * Les autres — `nom`, `categorie`… — vont dans le bloc général.
 */
const CHAMPS_AVEC_CASE = ['kcal100', 'prot100', 'gluc100', 'lip100', 'fibres100',
  'ratio', 'peseeAvant', 'peseeApres', 'quantite'];

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
  rattachement, verdict, verdictPerime, verdictEnPanne, onSaisie, refusEcriture,
}: {
  visible: boolean;
  aliment?: AlimentSaisi;
  /**
   * Le nom d'un aliment dont on ne connaît AUCUNE valeur.
   *
   * Le cas des produits Grocy jamais renseignés (19 septembre 2026) : le nom
   * existe, les macros n'existent pas. On ne peut donc pas passer `aliment` —
   * il obligerait à inventer des nombres. Les champs restent vides, seul le
   * nom est posé (règle 6 : un oubli n'est pas un zéro).
   */
  nomImpose?: string;
  titre?: string;
  onEnregistrer: (a: AlimentTape) => void;
  onFermer: () => void;
  enCours?: boolean;
  /** message d'échec de l'enregistrement ; la saisie reste à l'écran */
  erreur?: string | null;
  /**
   * Quantité déjà possédée, saisie à la création seulement.
   * Le champ n'apparaît que si `onQuantiteChange` est fourni : ailleurs la
   * quantité se corrige dans l'inventaire, seul endroit où elle s'écrit.
   * Elle part TELLE QUE TAPÉE : c'est le serveur qui la lit (CA-14).
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
   * refus NI résumé, et le rendement est « inconnu », plutôt qu'un avis
   * fabriqué ici en attendant.
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
   * Il FAUT le dire, et ne rien montrer d'autre : aucun refus, aucun
   * rendement chiffré. Un verdict d'avant la panne décrirait une autre saisie
   * (règle 7, CA-R6).
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
  /**
   * LES REFUS D'UN 422 À L'ENREGISTREMENT — 26 septembre 2026 (CA-15).
   *
   * L'écriture est jugée par le même `VerdictAliment` que la saisie : ses
   * refus arrivent champ par champ, et s'affichent sous leur champ comme ceux
   * du verdict. La saisie, elle, reste intacte.
   */
  refusEcriture?: Grief[];
}) {
  /* CE QUI N'EST PAS UN NOMBRE : le nom, la catégorie, le rattachement. */
  const ficheDe = () => ({
    nom: aliment?.nom ?? nomImpose ?? '',
    categorie: aliment?.categorie ?? 'prot',
    referenceCiqual: aliment?.referenceCiqual ?? null,
  });
  const [fiche, setFiche] = useState(ficheDe);
  const [mesurer, setMesurer] = useState(false);

  /* LE TEXTE EST TOUT CE QUE L'ÉCRAN TIENT, pesées comprises.
     Piloter l'input avec String(nombre) rendait la saisie impossible : « 0 »
     redonnait '', « 0,8 » repassait par « 0 » puis « 0, », et le séparateur
     disparaissait sous les doigts. Depuis le 26 septembre 2026, il n'y a plus
     de nombre du tout de ce côté : le serveur lit. */
  const [textes, setTextes] = useState<Record<CleTexte, string>>(() => textesDe(aliment));

  /* LES PESÉES D'AVANT LA MESURE, pour que « Revenir aux valeurs courantes »
     annule la mesure au lieu de la garder. `null` hors mesure. */
  const [peseesDAvant, setPeseesDAvant] = useState<{ avant: string; apres: string } | null>(null);

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

     CE QUI IDENTIFIE UN ALIMENT ICI, ET POURQUOI PAS SEULEMENT `id`.
     `versSaisie`, le seul appelant réel, ne renseigne PAS `id` — un
     `AlimentDisponible` porte une `reference` (« grocy:12 », « base:47 »).
     Le nom sert donc de repli : il est toujours présent, et il ne change pas
     pendant la saisie puisque c'est la PROP, pas l'état local du formulaire. */
  const identite = aliment?.id ?? aliment?.nom ?? nomImpose ?? null;

  useEffect(() => {
    if (visible) {
      setFiche(ficheDe());
      setTextes(textesDe(aliment));
      setMesurer(false);
      setPeseesDAvant(null);
    }
    // `aliment` est volontairement absent des dépendances : voir ci-dessus.
  }, [visible, identite]);

  /**
   * UNE FRAPPE QUI FERAIT APPARAÎTRE AUTRE CHOSE QU'UN CHIFFRE, « , » OU « . »
   * N'EST PAS PRISE — et le champ garde son texte d'avant, caractère pour
   * caractère (CA-2). Ce n'est pas une lecture : « 4,2,1 » passe, et c'est le
   * serveur qui le refuse, sous le champ (CA-4). Rien n'est retiré en silence.
   */
  const majTexte = (cle: CleTexte, texte: string) => {
    if (!frappeNumeriqueAcceptee(texte)) return;
    setTextes((t) => ({ ...t, [cle]: texte }));
  };

  const pesees = { peseeAvant: textes.peseeAvant, peseeApres: textes.peseeApres };
  const sansPesee = textes.peseeAvant.trim() === '' && textes.peseeApres.trim() === '';

  /* CE QUI EST TAPÉ, ENVOYÉ AU PARENT. Il en fait un appel au serveur, avec
     anti-rebond ; cet écran ne sait pas qu'il y a un réseau. On envoie les
     TEXTES : lire « 12,5 » est une règle métier, et elle est au serveur. Les
     pesées partent brutes — c'est le serveur qui en tire le rendement (CA-7). */
  const saisie: SaisieAliment = {
    categorie: fiche.categorie,
    kcal100: textes.kcal100,
    prot100: textes.prot100,
    gluc100: textes.gluc100,
    lip100: textes.lip100,
    fibres100: textes.fibres100,
    ratio: textes.ratio,
    ...pesees,
    ...(onQuantiteChange === undefined ? {} : { quantite: quantite ?? '' }),
    /* CE QUE LA FICHE PORTAIT EN ARRIVANT. Sur une création il n'y a pas
       d'aliment, donc pas d'origine : tout y est nouveau. À l'ÉCRITURE, le
       serveur ne la croit plus — il la lit en base (CA-13, CA-R4). */
    origine: aliment === undefined ? undefined : {
      categorie: aliment.categorie,
      kcal100: texteDuNombre(aliment.kcal100),
      prot100: texteDuNombre(aliment.prot100),
      gluc100: texteDuNombre(aliment.gluc100),
      lip100: texteDuNombre(aliment.lip100),
      fibres100: texteDuNombre(aliment.fibres100),
      ratio: texteDuNombre(aliment.ratio),
    },
  };
  const signature = JSON.stringify(saisie);

  useEffect(() => { onSaisie?.(JSON.parse(signature) as SaisieAliment); }, [signature, onSaisie]);

  /* EN PANNE, ON NE MONTRE RIEN DE CE QUE LE SERVEUR AVAIT DIT : ce verdict
     décrit une saisie d'avant la coupure (CA-R6). */
  const verdictVisible = verdictEnPanne === true ? undefined : verdict;
  const tousLesRefus = [...(verdictVisible?.refus ?? []), ...(refusEcriture ?? [])]
    .filter((x, i, liste) => liste.findIndex((y) => y.champ === x.champ && y.message === x.message) === i);
  const refusGeneraux = tousLesRefus.filter((x) => !CHAMPS_AVEC_CASE.includes(x.champ));

  /** Les refus d'un champ, en rouge, juste sous lui — mot pour mot, rien de rédigé ici. */
  const refus = (champ: string) => {
    const siens = tousLesRefus.filter((x) => x.champ === champ);
    if (siens.length === 0) return null;

    return (
      <View testID={`refus-${champ}`} style={verdictPerime === true && { opacity: 0.45 }}>
        {siens.map((x) => (
          <Discret key={x.message} style={{ color: C.erreur, fontSize: T.petit, lineHeight: 16, marginTop: 2 }}>
            {x.message}
          </Discret>
        ))}
      </View>
    );
  };

  /* LE DROIT D'ENREGISTRER VIENT DU SERVEUR. `enregistrable` porte « aucun
     refus » et « les quatre valeurs obligatoires sont là » : l'écran ne le
     recalcule pas — il ne regarde plus ni `kcal100 > 0` ni la lisibilité
     (CA-5). Tant qu'aucune réponse n'est arrivée, on laisse le bouton actif :
     c'est l'API qui tranchera, et un bouton éteint par défaut ferait croire à
     un formulaire cassé. Le nom reste un contrôle léger de l'écran.
     PAS SUR UN VERDICT PÉRIMÉ : il décrit la saisie d'avant. */
  /* LES QUATRE VALEURS OBLIGATOIRES, VUES SEULEMENT VIDES OU NON — décision
     du propriétaire, 26 septembre 2026 : « il faut quand même un minimum de
     vérification côté front pour éviter à l'utilisateur d'avoir à faire des
     allers-retours, mais seul le serveur reste la vérif finale ». L'écran ne
     LIT aucun nombre ici (garde `lectureAuServeur.test.ts`) : « 0 » est une
     réponse et allume le bouton, « 4,2,1 » aussi — c'est le serveur qui le
     refusera. Un vide ne part jamais, ni vide ni comme un zéro (règle 6). */
  const obligatoiresRemplies = (['kcal100', 'prot100', 'gluc100', 'lip100'] as const)
    .every((cle) => textes[cle].trim() !== '');
  const valide = fiche.nom.trim() !== '' && obligatoiresRemplies
    && (verdictPerime === true || (verdict?.enregistrable ?? true));

  /* La teinte traduit la décision du serveur ; elle ne la prend plus. */
  const couleurVerdict = {
    coherent: C.ok, ecart: C.vif, incoherent: C.erreur, indecidable: C.attenue,
  }[verdictVisible?.verdict ?? 'indecidable'];

  /* LE RENDEMENT EST CELUI DU SERVEUR, ou « inconnu » — jamais un chiffre
     calculé ici en attendant (CA-7, CA-R6). */
  const rendement = verdictVisible?.rendement ?? null;
  const rendementConnu = rendement !== null && rendement.valeur !== null && rendement.explication !== null;

  /** Un champ numérique de l'éditeur : texte tel quel, filtre de frappe, refus dessous. */
  const champNombre = (cle: CleTexte, etiquette: string, unite: string, placeholder: string) => (
    <View style={{ flex: 1 }}>
      <Champ etiquette={etiquette} unite={unite} numerique
        valeur={textes[cle]} onChange={(v) => majTexte(cle, v)} placeholder={placeholder} />
      {refus(cle)}
    </View>
  );

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
                  valeur={fiche.nom}
                  onChange={(v) => setFiche((f) => ({ ...f, nom: v }))}
                  placeholder="Skyr nature Milbona"
                />
              ) : (
                <>
                  <Discret style={[s.section, { marginTop: 0 }]}>Nom</Discret>
                  <Texte>{fiche.nom}</Texte>
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
                    valeur={fiche.referenceCiqual}
                    nomAliment={fiche.nom}
                    kcalTapees={textes.kcal100}
                    recherche={rattachement.recherche}
                    resultats={rattachement.resultats}
                    onRecherche={rattachement.onRecherche}
                    onChange={(code) => setFiche((f) => ({ ...f, referenceCiqual: code }))}
                  />
                </View>
              )}

              {onQuantiteChange !== undefined && (
                <>
                  <Champ
                    etiquette="Quantité déjà en stock (facultatif)"
                    unite="g" numerique style={{ marginTop: E.s }}
                    valeur={quantite ?? ''}
                    onChange={(v) => { if (frappeNumeriqueAcceptee(v)) onQuantiteChange(v); }}
                    placeholder="0"
                  />
                  {refus('quantite')}
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
                    onPress={() => setFiche((f) => ({ ...f, categorie: c.cle }))}
                    style={[
                      s.categorie,
                      fiche.categorie === c.cle && {
                        backgroundColor: couleurRole(c.cle),
                        borderColor: couleurRole(c.cle),
                      },
                    ]}
                  >
                    <Discret style={fiche.categorie === c.cle
                      ? { color: C.fond, fontFamily: P.fort, fontSize: T.petit }
                      : { fontSize: T.petit }}>
                      {c.libelle}
                    </Discret>
                  </Pressable>
                ))}
              </View>
              <Discret style={{ fontSize: T.petit, marginTop: 4 }}>
                {CATEGORIES.find((c) => c.cle === fiche.categorie)?.exemple}
              </Discret>

              {/* ---- valeurs nutritionnelles ---- */}
              <Discret style={s.section}>Pour 100 g, d'après l'emballage</Discret>

              <View style={s.paire}>
                {champNombre('kcal100', 'Calories', 'kcal', A_SAISIR)}
                {champNombre('prot100', 'Protéines', 'g', A_SAISIR)}
              </View>
              <View style={[s.paire, { marginTop: E.s }]}>
                {champNombre('gluc100', 'Glucides', 'g', A_SAISIR)}
                {champNombre('lip100', 'Lipides', 'g', A_SAISIR)}
              </View>
              {/* « Renseigne les quatre valeurs — écris 0 si l'aliment n'en
                  contient pas » ÉTAIT ÉCRIT ICI, par l'écran, jusqu'au
                  26 septembre 2026. Le serveur le dit désormais lui-même, sous
                  le champ vide, avec le texte de l'entité (CA-1, CA-5). */}

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

              {verdictVisible?.conversion != null && verdictPerime !== true && (
                <View style={[s.controle, { borderColor: C.vif }]}>
                  <Discret style={{ color: C.vif, fontSize: T.normal, lineHeight: 18 }}>
                    {verdictVisible.conversion.motif === 'plafond'
                      ? `${nb(verdictVisible.conversion.saisi)} kcal pour 100 g est impossible : rien ne dépasse `
                        + '900 kcal, la densité de la matière grasse pure. '
                      : `${nb(verdictVisible.conversion.saisi)} est exactement 4,18 fois ce que donnent tes macros. `}
                    Tu as probablement recopié les kilojoules.
                  </Discret>
                  <Bouton
                    variante="contour"
                    onPress={() => setTextes((t) => ({
                      ...t, kcal100: texteDuNombre(verdictVisible.conversion?.converti ?? null),
                    }))}
                    style={{ marginTop: E.s }}
                  >
                    {`Convertir : ${nb(verdictVisible.conversion.saisi)} kJ = ${nb(verdictVisible.conversion.converti)} kcal`}
                  </Bouton>
                </View>
              )}

              <View style={{ marginTop: E.s }}>
                {champNombre('fibres100', 'Fibres (facultatif)', 'g', '—')}
              </View>
              {textes.fibres100.trim() === '' && (
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
                    Le serveur n'a pas répondu : rien de ce que tu tapes n'est
                    vérifié pour l'instant. Il vérifiera à l'enregistrement.
                  </Discret>
                </View>
              ) : refusGeneraux.length > 0 ? (
                <View testID="refus-general" style={[s.controle, { borderColor: C.erreur },
                  verdictPerime === true && { opacity: 0.45 }]}>
                  {refusGeneraux.map((x) => (
                    <Discret key={x.champ + x.message}
                      style={{ color: C.erreur, fontSize: T.normal, lineHeight: 18 }}>
                      {x.message}
                    </Discret>
                  ))}
                </View>
              ) : (verdictVisible?.resume ?? '') !== '' && (
                /* LE RÉSUMÉ S'AFFICHE DÈS QUE LE SERVEUR LE RENVOIE (CA-6). Il
                   dépendait de `a.kcal100 > 0 || a.prot100 > 0` — un chiffre
                   lu par l'écran, 0 pour un champ vide. */
                <View style={[s.controle, { borderColor: couleurVerdict },
                  verdictPerime === true && { opacity: 0.45 }]}>
                  <Discret style={{ color: couleurVerdict, fontSize: T.normal, lineHeight: 18 }}>
                    {verdictVisible?.resume}
                  </Discret>
                </View>
              )}

              {/* ---- ratio ---- */}
              <Discret style={s.section}>Changement de poids à la cuisson</Discret>

              {/* LE REFUS DU RENDEMENT EST CELUI DU SERVEUR, mot pour mot. Deux
                  phrases vivaient ici — « Un féculent absorbe de l'eau… »,
                  « Ces deux poids sont inversés… » — rédigées par l'écran à
                  partir de la catégorie : un second juge. Parties le
                  26 septembre 2026 (CA-5) ; `RendementPlausible` dit la même
                  chose, avec ses mots. */}
              {refus('ratio')}

              {!mesurer ? (
                <>
                  {RATIOS_GUIDES.map((g) => {
                    const choisi = sansPesee && textes.ratio === texteDuNombre(g.valeur);

                    return (
                      <Pressable
                        key={g.cle}
                        onPress={() => setTextes((t) => ({
                          ...t, ratio: texteDuNombre(g.valeur), peseeAvant: '', peseeApres: '',
                        }))}
                        style={[s.choixRatio, choisi && s.choixActif]}
                      >
                        <View style={{ flex: 1 }}>
                          <Texte style={{ fontSize: T.normal }}>{g.libelle}</Texte>
                          <Discret style={{ fontSize: T.petit }}>{g.exemple}</Discret>
                        </View>
                        {choisi && <Discret style={{ color: C.vif }}>✓</Discret>}
                      </Pressable>
                    );
                  })}
                  <Bouton variante="discret" onPress={() => {
                    setPeseesDAvant({ avant: textes.peseeAvant, apres: textes.peseeApres });
                    setMesurer(true);
                  }}>
                    <Discret style={{ fontSize: T.normal, textDecorationLine: 'underline' }}>
                      Je préfère mesurer
                    </Discret>
                  </Bouton>
                  {refus('peseeAvant')}
                  {refus('peseeApres')}
                </>
              ) : (
                <View style={s.mesure}>
                  <Discret style={{ fontSize: T.normal, lineHeight: 18 }}>
                    Pèse ton aliment <Texte style={{ fontSize: T.normal }}>avant</Texte> de le
                    cuire, note le poids. Cuis-le, égoutte-le, et pèse-le
                    {' '}<Texte style={{ fontSize: T.normal }}>après</Texte>. L'app en déduit le reste.
                  </Discret>
                  {/* LES PESÉES SONT DES TEXTES, ENVOYÉS BRUTS — 26 septembre
                      2026. Elles passaient par `ChampNombre`, qui les lisait
                      ici pour que l'écran calcule le ratio : c'était la
                      dernière règle de lecture de cet écran. Le serveur lit,
                      calcule et refuse, sous le champ (CA-7). */}
                  <View style={[s.paire, { marginTop: E.s }]}>
                    {champNombre('peseeAvant', 'Poids avant cuisson', 'g', '100')}
                    {champNombre('peseeApres', 'Poids après cuisson', 'g', '230')}
                  </View>
                  {rendementConnu && rendement.provenance !== null && verdictPerime !== true && (
                    <Bouton
                      onPress={() => { setMesurer(false); setPeseesDAvant(null); }}
                      desactive={tousLesRefus.some((x) => x.champ === 'ratio')}
                      style={{ marginTop: E.s }}
                    >
                      {`Utiliser ce résultat (${nb(rendement.valeur ?? 0)})`}
                    </Bouton>
                  )}
                  <Bouton variante="discret" onPress={() => {
                    /* ANNULER LA MESURE, c'est retrouver les pesées d'avant —
                       celles de la fiche, ou aucune. */
                    setTextes((t) => ({
                      ...t,
                      peseeAvant: peseesDAvant?.avant ?? '',
                      peseeApres: peseesDAvant?.apres ?? '',
                    }));
                    setPeseesDAvant(null);
                    setMesurer(false);
                  }}>
                    <Discret style={{ fontSize: T.normal }}>Revenir aux valeurs courantes</Discret>
                  </Bouton>
                </View>
              )}

              <Discret testID="rendement" style={[s.aide, { color: C.attenue }]}>
                {rendementConnu ? rendement.explication : 'Rendement : inconnu'}
              </Discret>
              {rendementConnu && (rendement.provenance !== null ? (
                <Discret style={[s.aide, { color: C.ok }]}>
                  ✓ {rendement.provenance}
                </Discret>
              ) : (
                <Discret style={s.aide}>
                  Valeur courante — mesure-la pour un chiffre propre à ton produit.
                </Discret>
              ))}

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
                onPress={() => onEnregistrer({ ...fiche, ...textes })}
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
