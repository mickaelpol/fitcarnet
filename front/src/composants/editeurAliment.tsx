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

const vide: AlimentSaisi = {
  nom: '', categorie: 'prot', kcal100: 0, prot100: 0, gluc100: 0,
  lip100: 0, fibres100: null, ratio: 1,
  peseeAvant: null, peseeApres: null,
};

type CleNombre = 'kcal100' | 'prot100' | 'gluc100' | 'lip100' | 'fibres100';

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
  const [a, setA] = useState<AlimentSaisi>(aliment ?? vide);
  const [mesurer, setMesurer] = useState(false);
  const [avant, setAvant] = useState('');
  const [apres, setApres] = useState('');

  /* Le texte saisi vit à part du nombre.
     Piloter l'input avec String(nombre) rendait la saisie impossible : « 0 »
     redonnait '', « 0,8 » repassait par « 0 » puis « 0, » que parseFloat
     ramenait à 0, et le séparateur disparaissait sous les doigts. Le champ
     garde donc le texte tel quel ; le nombre n'en est que la lecture. */
  const [textes, setTextes] = useState<Record<CleNombre, string>>(textesDe(aliment));

  useEffect(() => {
    if (visible) {
      const depart = aliment ?? vide;
      setA(depart);
      setTextes(textesDe(aliment));
      setMesurer(false);
      // une mesure antérieure se retrouve, pour la vérifier ou la refaire
      setAvant(depart.peseeAvant ? String(depart.peseeAvant) : '');
      setApres(depart.peseeApres ? String(depart.peseeApres) : '');
    }
  }, [visible, aliment]);

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

  const ratioMesure = ratioDepuisPesees(
    parseFloat(avant.replace(',', '.')), parseFloat(apres.replace(',', '.')));

  const valide = a.nom.trim() !== ''
    && a.kcal100 > 0
    && ratioVraisemblable(a.ratio)
    && controle.verdict !== 'incoherent';

  const nombre = (v: string) => {
    const x = parseFloat(v.replace(',', '.'));

    return Number.isNaN(x) ? 0 : x;
  };

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
                  onChange={(v) => majNombre('kcal100', v)} placeholder="0" />
                <Champ etiquette="Protéines" unite="g" numerique style={{ flex: 1 }}
                  valeur={textes.prot100}
                  onChange={(v) => majNombre('prot100', v)} placeholder="0" />
              </View>
              <View style={[s.paire, { marginTop: E.s }]}>
                <Champ etiquette="Glucides" unite="g" numerique style={{ flex: 1 }}
                  valeur={textes.gluc100}
                  onChange={(v) => majNombre('gluc100', v)} placeholder="0" />
                <Champ etiquette="Lipides" unite="g" numerique style={{ flex: 1 }}
                  valeur={textes.lip100}
                  onChange={(v) => majNombre('lip100', v)} placeholder="0" />
              </View>

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
    paddingHorizontal: E.m, minHeight: 38, borderRadius: R.s, borderWidth: 1,
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
  mini: { flexDirection: 'row', backgroundColor: C.surface2, borderColor: C.ligne,
    borderWidth: 1, borderRadius: R.s, padding: 2 },
  miniBouton: {
    flex: 1, minHeight: TOUCHE - 4, alignItems: 'center', justifyContent: 'center',
    borderRadius: R.s - 2,
  },
  miniActif: { backgroundColor: C.ligne },
});
