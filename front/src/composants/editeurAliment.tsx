import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View,
} from 'react-native';
import { Bouton, Champ, Discret, Texte } from './base';
import {
  CATEGORIES, RATIOS_GUIDES, controler, expliquerRatio,
  provenanceRatio, ratioDepuisPesees, ratioVraisemblable, soupconKilojoules,
} from '@/calcul/nutrition';
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
}

/**
 * Point de départ d'une création : aucune valeur préremplie.
 *
 * EXPORTÉ DEPUIS LE 15 SEPTEMBRE 2026, parce qu'il en existait une seconde
 * copie mot pour mot dans `app/(onglets)/frigo.tsx` (D6 de l'audit). Deux
 * objets identiques de dix champs, dont l'écran se servait pour « Créer de
 * zéro » : un champ ajouté ici et pas là-bas, et la création partait avec un
 * `undefined` que l'éditeur ne distingue pas d'une valeur absente.
 */
export const ALIMENT_VIDE: AlimentSaisi = {
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
  quantite, onQuantiteChange, nomModifiable = true,
}: {
  visible: boolean;
  aliment?: AlimentSaisi;
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
  /** faux quand l'état de référence est déduit de la catégorie, non stocké */
}) {
  const [a, setA] = useState<AlimentSaisi>(aliment ?? ALIMENT_VIDE);
  const [mesurer, setMesurer] = useState(false);
  const [avant, setAvant] = useState('');
  const [apres, setApres] = useState('');

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
  const identite = aliment?.id ?? aliment?.nom ?? null;

  useEffect(() => {
    if (visible) {
      const depart = aliment ?? ALIMENT_VIDE;
      setA(depart);
      setTextes(textesDe(aliment));
      setMesurer(false);
      // une mesure antérieure se retrouve, pour la vérifier ou la refaire
      setAvant(depart.peseeAvant ? String(depart.peseeAvant) : '');
      setApres(depart.peseeApres ? String(depart.peseeApres) : '');
    }
    // `aliment` est volontairement absent des dépendances : voir ci-dessus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const macros = {
    kcal: a.kcal100, prot: a.prot100, gluc: a.gluc100,
    lip: a.lip100, fibres: a.fibres100,
  };

  const controle = controler(macros);
  const kilojoules = soupconKilojoules(macros);

  /* `nombreSaisi` ET NON `parseFloat` : « 4,2,1 » g se lisait 4,2 et proposait
     un ratio calculé sur une pesée qui n'existe pas. */
  const ratioMesure = ratioDepuisPesees(nombreSaisi(avant) ?? NaN, nombreSaisi(apres) ?? NaN);

  const OBLIGATOIRES = ['kcal100', 'prot100', 'gluc100', 'lip100'] as const;
  const macrosLisibles = OBLIGATOIRES.every((cle) => lisible(textes[cle]))
    && (textes.fibres100.trim() === '' || lisible(textes.fibres100));
  const illisible = (cle: CleNombre): boolean => textes[cle].trim() !== '' && !lisible(textes[cle]);

  const valide = a.nom.trim() !== ''
    && macrosLisibles
    && a.kcal100 > 0
    && ratioVraisemblable(a.ratio)
    && controle.verdict !== 'incoherent';

  const couleurVerdict = {
    coherent: C.ok, ecart: C.vif, incoherent: C.erreur, indecidable: C.attenue,
  }[controle.verdict];

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
                  onChange={(v) => majNombre('kcal100', v)} placeholder="0"
                  illisible={illisible('kcal100')} />
                <Champ etiquette="Protéines" unite="g" numerique style={{ flex: 1 }}
                  valeur={textes.prot100}
                  onChange={(v) => majNombre('prot100', v)} placeholder="0"
                  illisible={illisible('prot100')} />
              </View>
              <View style={[s.paire, { marginTop: E.s }]}>
                <Champ etiquette="Glucides" unite="g" numerique style={{ flex: 1 }}
                  valeur={textes.gluc100}
                  onChange={(v) => majNombre('gluc100', v)} placeholder="0"
                  illisible={illisible('gluc100')} />
                <Champ etiquette="Lipides" unite="g" numerique style={{ flex: 1 }}
                  valeur={textes.lip100}
                  onChange={(v) => majNombre('lip100', v)} placeholder="0"
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

              {kilojoules !== null && (
                <View style={[s.controle, { borderColor: C.vif }]}>
                  <Discret style={{ color: C.vif, fontSize: T.normal, lineHeight: 18 }}>
                    {kilojoules.motif === 'plafond'
                      ? `${nb(kilojoules.saisi)} kcal pour 100 g est impossible : rien ne dépasse `
                        + '900 kcal, la densité de la matière grasse pure. '
                      : `${nb(kilojoules.saisi)} est exactement 4,18 fois ce que donnent tes macros. `}
                    Tu as probablement recopié les kilojoules.
                  </Discret>
                  <Bouton
                    variante="contour"
                    onPress={() => majNombre('kcal100', String(kilojoules.converti))}
                    style={{ marginTop: E.s }}
                  >
                    {`Convertir : ${nb(kilojoules.saisi)} kJ = ${nb(kilojoules.converti)} kcal`}
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
              {(a.kcal100 > 0 || a.prot100 > 0) && (
                <View style={[s.controle, { borderColor: couleurVerdict }]}>
                  <Discret style={{ color: couleurVerdict, fontSize: T.normal, lineHeight: 18 }}>
                    {controle.message}
                  </Discret>
                </View>
              )}

              {/* ---- ratio ---- */}
              <Discret style={s.section}>Changement de poids à la cuisson</Discret>

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
                    <Champ etiquette="Poids avant cuisson" unite="g" numerique
                      style={{ flex: 1 }} valeur={avant} onChange={setAvant} placeholder="100" />
                    <Champ etiquette="Poids après cuisson" unite="g" numerique
                      style={{ flex: 1 }} valeur={apres} onChange={setApres} placeholder="230" />
                  </View>
                  {ratioMesure !== null && (
                    <Bouton
                      onPress={() => {
                        maj({
                          ratio: ratioMesure,
                          peseeAvant: parseFloat(avant.replace(',', '.')),
                          peseeApres: parseFloat(apres.replace(',', '.')),
                        });
                        setMesurer(false);
                      }}
                      desactive={!ratioVraisemblable(ratioMesure)}
                      style={{ marginTop: E.s }}
                    >
                      {ratioVraisemblable(ratioMesure)
                        ? `Utiliser ce résultat (${nb(ratioMesure)})`
                        : 'Ces deux poids ne sont pas vraisemblables'}
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
