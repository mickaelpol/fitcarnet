import {
  Pressable, StyleSheet, type StyleProp, View, type ViewStyle,
} from 'react-native';
import { Bouton, Carte, Champ, Discret, Texte } from './base';
import { DetailComplements, RappelComplements } from './complements';
import { SR } from './stylesRepas';
import {
  type Compose, ROLES, TOLERANCE, imposePour, saisieIllisible,
} from '@/calcul/demandeRepas';
import type { ModeCuisson } from '@/calcul/cuisson';
import {
  NOM_REPAS, type AuMieux, type Repas, type Role, rolesDuRepas,
} from '@/solveur/composer';
import type { Aliment } from '@/solveur/types';
import { C, E, P, R, T, TOUCHE, couleurRole, nb } from '@/theme';

/**
 * LA CARTE D'UN REPAS — ce qu'on pèse, ce qu'on sert, ce qu'on corrige.
 *
 * Sortie de `app/(onglets)/repas.tsx` le 15 septembre 2026 (rang 7 du lot 6
 * de l'audit). Elle vivait déjà HORS du composant d'écran — 380 lignes après
 * son `}` de fermeture — donc l'extraction n'a rien eu à démêler : son
 * interface publique n'a pas bougé d'un caractère.
 *
 * Elle ne calcule rien. Le résultat lui vient du plan, où les quatre repas
 * ont été résolus dans l'ordre sur un frigo qui se vide ; une carte qui
 * résolvait son propre repas ne pouvait pas voir ce que les autres avaient
 * déjà pris.
 */

/**
 * L'UNITÉ PAR DÉFAUT D'UNE SAISIE DE POIDS, ÉCRITE UNE FOIS.
 *
 * Elle valait `cuit` pour les aliments choisis par le calcul et `cru` pour
 * ceux qu'on ajoute soi-même — deux contrôles identiques à l'œil, de sens
 * opposé selon la ligne. Personne n'avait décidé ça ; deux littéraux avaient
 * divergé.
 *
 * `cru` PARCE QUE C'EST DÉJÀ LA CONSIGNE. L'écran écrit, trois lignes plus
 * haut : « On pèse AVANT cuisson ». Un défaut qui contredit la consigne
 * affichée au-dessus de lui est un piège, pas un réglage.
 */
const DEFAUT_UNITE: 'cru' | 'cuit' = 'cru';

/**
 * CRU OU CUIT : DEUX PUCES, PAS UN BOUTON.
 *
 * C'ÉTAIT UN BOUTON DONT L'ÉTIQUETTE ÉTAIT SON PROPRE ÉTAT. Il affichait
 * « cru », ce qui veut dire « ton nombre est lu comme du cru » — et se lisait
 * comme « appuie pour passer en cru ». Deux sens opposés pour le même mot, et
 * rien à l'écran pour trancher.
 *
 * ET IL NE CONVERTISSAIT PAS LE NOMBRE. Appuyer changeait la LECTURE des
 * grammes déjà saisis : 127 g lus crus puis lus cuits, ce ne sont pas les
 * mêmes macros pour la même saisie. Un bouton qui semble convertir et qui
 * réinterprète est le pire des deux mondes.
 *
 * Deux puces côte à côte, l'active en surbrillance : on LIT dans quelle unité
 * la saisie est comprise, et on DÉSIGNE l'autre pour en changer. L'état et
 * l'action ne se disputent plus le même mot.
 */
function CruOuCuit({
  unite, onChanger,
}: {
  unite: 'cru' | 'cuit';
  onChanger: (u: 'cru' | 'cuit') => void;
}) {
  return (
    <View style={s.uniteGroupe}>
      {(['cru', 'cuit'] as const).map((u) => {
        const actif = u === unite;

        return (
          <Pressable
            key={u}
            onPress={() => onChanger(u)}
            accessibilityRole="radio"
            accessibilityState={{ selected: actif }}
            accessibilityLabel={`Poids pesé ${u}`}
            style={[s.unitePuce, actif && s.unitePuceActive]}
          >
            <Discret style={actif
              ? { fontSize: T.petit, color: C.fond, fontFamily: P.fort }
              : { fontSize: T.petit }}
            >
              {u}
            </Discret>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * UNE LIGNE DU TABLEAU : le nom, ce qu'il est, et ses trois poids.
 *
 * ÉCRITE TROIS FOIS DANS CETTE CARTE avant le 15 septembre 2026 — la ligne
 * d'un rôle, celle du renfort qui le complète, celle d'un aliment ajouté à la
 * main. Trois copies aux onze lignes identiques, à la taille du nom près.
 *
 * Ce que trois copies coûtaient : les colonnes « à peser », « servi » et
 * « 1 pers. » doivent rester dans CET ordre partout, sinon on lit le poids
 * cuit en croyant lire le poids à peser — et on pèse trois fois trop de riz.
 * Rien n'obligeait les trois copies à s'accorder.
 *
 * `q` absente veut dire « le solveur n'a rien servi ici » et s'écrit « — »,
 * jamais zéro : vide n'est pas zéro.
 */
function LigneAliment({
  nom, sousTitre, couleur, q, portions, taille, style,
}: {
  nom: string;
  sousTitre: string;
  couleur: string;
  q: { aCuire: number; assiette: number } | undefined;
  portions: number;
  taille: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.ligne, style]}>
      <View style={{ flex: 2 }}>
        <Texte style={{ fontSize: taille }} numberOfLines={1}>{nom}</Texte>
        <Discret style={{ fontSize: T.minuscule, color: couleur }}>{sousTitre}</Discret>
      </View>
      <Texte style={s.val}>{q ? nb(q.aCuire) : '—'}</Texte>
      <Texte style={s.val}>{q ? nb(q.assiette) : '—'}</Texte>
      <Texte style={[s.val, { color: C.vif }]}>
        {q ? nb(q.assiette / portions) : '—'}
      </Texte>
    </View>
  );
}

export function CarteRepas({
  repas, compose, cible, portions, resultat, fibresDe,
  ouvert, onOuvrir, onRemplacer, onChoisirRelais, onAjouter, onRetirerAjout, onReste,
  cuissonDe, onCuisson,
}: {
  repas: Repas;
  compose: Compose;
  cible: {
    kcal: number; prot: number; gluc: number; lip: number; glucidesTotaux?: boolean;
  } | undefined;
  portions: number;
  /** résolu au niveau du plan : les repas partagent un seul frigo */
  resultat: AuMieux | null;
  /** grammes de fibres pour 100 g, dans l'état de référence de l'aliment */
  fibresDe: (a: Aliment) => number;
  ouvert: boolean;
  onOuvrir: () => void;
  onRemplacer: (role: Role) => void;
  /** ouvrir le choix de l'aliment qui complétera celui qui manque */
  onChoisirRelais: (role: Role, epuise: Aliment) => void;
  onAjouter: () => void;
  onRetirerAjout: (id: number | string) => void;
  onReste: (cle: string, valeurs: { grammes: string; unite: 'cru' | 'cuit' }) => void;
  /**
   * La cuisson de cet aliment DANS CE REPAS : un mode, `null` quand on a
   * décidé qu'il ne se cuit pas, ou « a choisir » tant que personne n'a
   * tranché. Les deux derniers ne se confondent pas.
   */
  cuissonDe: (a: Aliment) => ModeCuisson | null | 'a choisir';
  onCuisson: (a: Aliment) => void;
}) {
  /* Le résultat n'est plus calculé ici : il vient du plan, où les quatre
     repas ont été résolus dans l'ordre sur un frigo qui se vide. Une carte
     qui résolvait son propre repas ne pouvait pas voir ce que les autres
     avaient déjà pris. */

  if (!cible) {
    return (
      <Carte>
        <Texte style={{ fontFamily: P.fort }}>{NOM_REPAS[repas]}</Texte>
        <Discret style={{ fontSize: T.petit }}>
          Aucun objectif défini pour ce repas. Renseigne-les depuis ton compte.
        </Discret>
      </Carte>
    );
  }

  const macros = resultat?.resultat.macros;

  /* Les fibres du repas, et ce qu'elles pèsent. C'est ce qui explique qu'un
     repas juste en protéines, glucides et lipides affiche plus de calories
     que ne le donne le calcul 4/4/9 : la convention européenne les compte à
     part, à 2 kcal le gramme. */
  const fibres = (resultat?.resultat.quantites ?? []).reduce((n, q) => {
    /* Les macros valent pour le poids PESÉ, jamais pour le poids servi : la
       cuisson n'ajoute que de l'eau. C'est donc toujours la colonne « à
       cuire ». Prendre l'assiette fausserait les fibres du rendement. */
    return n + (fibresDe(q.aliment) * q.aCuire) / 100;
  }, 0);

  return (
    <Carte style={{ gap: E.s }}>
      <Pressable onPress={onOuvrir} style={s.tete}>
        <View style={{ flex: 1 }}>
          <Texte style={{ fontFamily: P.fort }}>
            {NOM_REPAS[repas]}
            <Discret style={{ fontSize: T.petit }}>
              {portions > 1 ? `  ·  ${portions} personnes` : '  ·  1 personne'}
            </Discret>
          </Texte>
          {/* Affiché PAR PERSONNE, comme les objectifs du compte. Le total
              cuisiné pour trois — 1772 kcal — ne se compare à rien : cette
              ligne sert à dire si la cible est tenue, pas à cumuler. Les
              quantités à peser, elles, restent en total dans le tableau.

              Chaque macro porte SA couleur : un repas juste en protéines et
              raté en lipides ne doit pas s'afficher tout en jaune, sinon on
              ne sait pas quoi corriger. */}
          {macros && resultat && (
            <View style={{ flexDirection: 'row', gap: E.s, alignItems: 'center' }}>
              {([
                ['kcal', 'kcal'], ['prot', 'P'], ['gluc', 'G'], ['lip', 'L'],
              ] as const).map(([cle, suffixe]) => (
                <Discret
                  key={cle}
                  style={{
                    fontSize: T.petit,
                    /* L'écart est celui du repas entier : on le ramène à la
                       personne avant de le comparer à une tolérance qui,
                       elle, vaut pour une assiette. */
                    color: Math.abs(resultat.resultat.ecarts[cle]) / portions <= TOLERANCE[cle]
                      ? C.ok : C.vif,
                  }}
                >
                  {nb(macros[cle] / portions)} {suffixe}
                </Discret>
              ))}
              {portions > 1 && (
                <Discret style={{ fontSize: T.minuscule }}>/ pers.</Discret>
              )}
            </View>
          )}

          {/* Quand la cible est exprimée en glucides TOTAUX, les fibres sont
              DANS la cible : les annoncer « hors cible » serait faux. */}
          {fibres > 0.5 && (
            <Discret style={{ fontSize: T.minuscule }}>
              dont {nb(fibres / portions)} g de fibres
              {cible.glucidesTotaux === true
                ? ', comprises dans la cible en glucides'
                : `, soit ${nb((fibres * 2) / portions)} kcal hors cible`}
            </Discret>
          )}

          {/* CE QUI S'AJOUTE À CE REPAS ET QUI NE SE PÈSE PAS.
              Les compléments n'entrent pas dans le calcul — leurs macros sont
              nulles et leur dose est fixe, le solveur n'a rien à en faire —
              mais ils font partie du repas. Ici un rappel d'une ligne ; le
              détail est plus bas, là où l'on prépare vraiment l'assiette. */}
          <RappelComplements repas={repas} />
        </View>
        <Discret>{ouvert ? '▲' : '▼'}</Discret>
      </Pressable>

      {ouvert && (
        <View style={{ gap: E.s }}>
          <DetailComplements repas={repas} />

          {/* « à peser » et non « à cuire » : la colonne vaut aussi pour les
              amandes et le skyr, qui ne cuisent pas. C'est ce qu'on met sur
              la balance, cuisson ou pas. Et « servi » plutôt que « cuit »,
              pour la même raison. */}
          <View style={SR.entete}>
            <Discret style={[SR.col, { flex: 2 }]}>aliment</Discret>
            <Discret style={SR.col}>à peser</Discret>
            <Discret style={SR.col}>servi</Discret>
            <Discret style={SR.col}>1 pers.</Discret>
          </View>
          <Discret style={{ fontSize: T.minuscule, lineHeight: 15 }}>
            On pèse AVANT cuisson : la cuisson n'ajoute que de l'eau, jamais
            de calories, et l'eau absorbée change d'une fois sur l'autre.
          </Discret>

          {ROLES.map(({ cle, titre, cat }) => {
            const aliment = compose.roles[cle];
            const fixe = imposePour(repas, cle);

            /* Les renforts de CE rôle : ce que le plafonnement du stock ou un
               échange automatique a fait entrer. Ils s'affichent juste sous
               la ligne qu'ils complètent, pas en bas de la carte — c'est là
               qu'on les cherche. */
            const renforts = (resultat?.resultat.quantites ?? []).filter(
              (q) => q.aliment.id !== aliment?.id
                /* Un aliment qui tient déjà sa propre ligne n'est pas
                   réaffiché ici : quand l'huile prend en charge les lipides,
                   elle apparaissait deux fois, avec la même quantité. */
                && !ROLES.some(({ cle: autre }) => compose.roles[autre]?.id === q.aliment.id)
                && ((resultat?.plafonnes ?? []).some(
                  (pl) => pl.role === cle && pl.releve?.id === q.aliment.id)
                  || (resultat?.echanges ?? []).some(
                    (e) => e.role === cle && e.mis.id === q.aliment.id)));

            const notes = (resultat?.plafonnes ?? []).filter((pl) => pl.role === cle);
            const echange = (resultat?.echanges ?? []).find((e) => e.role === cle);

            if (!aliment) {
              /* Une quantité imposée absente n'est pas un manque : ou bien le
                 modèle du repas ne la demande pas — pas de légume à 16 h — ou
                 bien le frigo n'en a pas. Inutile d'alarmer. */
              if (fixe !== undefined || !rolesDuRepas(repas).has(cle)) return null;

              return (
                <View key={cle} style={s.ligne}>
                  <Discret style={{ flex: 1, fontSize: T.petit }}>
                    Aucun {titre.toLowerCase()} utilisable dans ton frigo.
                  </Discret>
                </View>
              );
            }

            const q = resultat?.resultat.quantites.find((x) => x.aliment.id === aliment.id);
            const reste = compose.restes[String(aliment.id)];

            return (
              <View key={cle} style={{ gap: 4 }}>
                <LigneAliment
                  nom={aliment.nom} sousTitre={titre} couleur={couleurRole(cat)}
                  q={q} portions={portions} taille={T.normal}
                />

                <View style={s.actions}>
                  <Pressable onPress={() => onRemplacer(cle)} style={s.action}>
                    <Discret style={{ fontSize: T.petit, color: C.vif }}>↻ Remplacer</Discret>
                  </Pressable>
                  <Champ
                    valeur={reste?.grammes ?? ''}
                    onChange={(v) => onReste(String(aliment.id),
                      { grammes: v, unite: reste?.unite ?? DEFAUT_UNITE })}
                    placeholder="reste"
                    unite="g" numerique style={{ width: 92 }}
                  />
                  <CruOuCuit
                    unite={reste?.unite ?? DEFAUT_UNITE}
                    onChanger={(u) => onReste(String(aliment.id), {
                      grammes: reste?.grammes ?? '', unite: u,
                    })}
                  />
                </View>

                {renforts.map((q) => (
                  <LigneAliment
                    key={String(q.aliment.id)}
                    nom={q.aliment.nom}
                    sousTitre={echange?.mis.id === q.aliment.id ? 'À la place' : 'Complément'}
                    couleur={C.ok}
                    q={q} portions={portions} taille={T.normal}
                    style={s.renfort}
                  />
                ))}

                {/* LE RELAIS EST UNE DÉCISION, DONC IL SE TOUCHE. Il était
                    annoncé comme un fait — « le reste est porté par
                    Boulgour » — alors que c'est un choix parmi ceux du frigo,
                    fait par défaut. On le rend modifiable là où il s'affiche,
                    plutôt que d'obliger à le deviner ailleurs. */}
                {notes.map((pl) => (
                  <Pressable
                    key={String(pl.aliment.id)}
                    onPress={() => onChoisirRelais(pl.role, pl.aliment)}
                    accessibilityRole="button"
                    accessibilityLabel={`Choisir ce qui complète ${pl.aliment.nom}`}
                  >
                    <Discret style={s.plafond}>
                      {pl.aliment.nom} : {nb(pl.grammes)} g, c'est tout ce que tu as.
                      {pl.releve
                        ? ` Le reste est porté par ${pl.releve.nom}.`
                        : ' Rien d\'autre ne peut prendre le relais.'}
                      {' '}
                      <Texte style={{ color: C.vif, fontSize: T.petit }}>Changer</Texte>
                    </Discret>
                  </Pressable>
                ))}

                {echange && (
                  <Discret style={s.plafond}>
                    {echange.retire.nom} ne permettait pas de tenir les objectifs :
                    {ROLES.some(({ cle: autre }) => compose.roles[autre]?.id === echange.mis.id)
                      ? ` c'est ${echange.mis.nom} qui s'en charge, sur sa propre ligne.`
                      : ` remplacé par ${echange.mis.nom}.`} Tu peux revenir dessus.
                  </Discret>
                )}
              </View>
            );
          })}

          {compose.ajouts.map((a) => {
            const q = resultat?.resultat.quantites.find((x) => x.aliment.id === a.id);
            const reste = compose.restes[String(a.id)];

            return (
              <View key={String(a.id)} style={{ gap: 4 }}>
                <LigneAliment
                  nom={a.nom} sousTitre="Ajouté" couleur={couleurRole(a.categorie)}
                  q={q} portions={portions} taille={T.petit}
                />

                <View style={s.actions}>
                  <Pressable onPress={() => onRetirerAjout(a.id)} style={s.action}>
                    <Discret style={{ fontSize: T.petit, color: C.erreur }}>× Retirer</Discret>
                  </Pressable>
                  <Champ
                    valeur={reste?.grammes ?? ''}
                    onChange={(v) => onReste(String(a.id),
                      { grammes: v, unite: reste?.unite ?? DEFAUT_UNITE })}
                    placeholder="quantité"
                    unite="g" numerique style={{ width: 112 }}
                  />
                  {/* Une saisie jetée en silence est pire qu'une saisie
                      refusée : on la voit encore à l'écran et on croit
                      qu'elle compte. */}
                  {saisieIllisible(reste?.grammes) && (
                    <Discret style={{ color: C.erreur, fontSize: T.minuscule, flexBasis: '100%' }}>
                      Quantité illisible — cet aliment compte pour 0 g.
                    </Discret>
                  )}
                  <CruOuCuit
                    unite={reste?.unite ?? DEFAUT_UNITE}
                    onChanger={(u) => onReste(String(a.id), {
                      grammes: reste?.grammes ?? '', unite: u,
                    })}
                  />
                </View>
              </View>
            );
          })}

          {/* Un repas ne tient pas toujours en un aliment par rôle : un
              petit-déjeuner porte souvent deux protéines et deux glucides. */}
          <Bouton variante="discret" onPress={onAjouter} style={s.ajouterAliment}>
            + Ajouter un aliment
          </Bouton>

          {/* ---- comment on cuit, pour CE repas ----

              Sous le tableau et non dans une colonne : la cuisson ne pèse rien
              et ne change aucun chiffre. La mêler aux grammes lui donnerait une
              importance qu'elle n'a pas, et volerait de la place à ce qu'on
              lit vraiment à la balance.

              Ce qu'on change ici ne touche PAS la fiche de l'aliment : des
              pommes de terre au four ce soir n'engagent pas celles de demain. */}
          {(resultat?.resultat.quantites ?? []).length > 0 && (
            <>
              <Discret style={SR.colTitre}>cuisson</Discret>
              <View style={s.puces}>
                {(resultat?.resultat.quantites ?? []).map((q) => (
                  <Pressable
                    key={`cuisson-${q.aliment.id}`}
                    onPress={() => onCuisson(q.aliment)}
                    style={s.puce}
                    accessibilityLabel={`Changer la cuisson de ${q.aliment.nom}`}
                  >
                    <View style={[
                      SR.pastille,
                      { backgroundColor: couleurRole(q.aliment.categorie) },
                    ]}
                    />
                    {/* Trois états, trois apparences : décidé et cuit,
                        décidé et cru, pas encore décidé. Le troisième doit
                        se voir — c'est le seul qui demande une action. */}
                    <Discret style={cuissonDe(q.aliment) === 'a choisir'
                      ? { color: C.vif } : undefined}
                    >
                      {q.aliment.nom} · {(() => {
                        const c = cuissonDe(q.aliment);
                        if (c === 'a choisir') return 'à choisir';

                        return c === null ? 'tel quel' : c.libelle;
                      })()}
                    </Discret>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {(resultat?.resultat.diagnostics ?? [])
            .filter((d) => d.gravite !== 'info')
            .map((d) => (
              <Discret key={d.code} style={{ fontSize: T.petit, color: C.vif, lineHeight: 16 }}>
                ⚠ {d.message}
              </Discret>
            ))}
        </View>
      )}
    </Carte>
  );
}

const s = StyleSheet.create({
  tete: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCHE },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  val: { flex: 1, fontFamily: P.chiffre, fontSize: T.moyen, textAlign: 'right' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: E.s, paddingBottom: E.s },
  action: {
    minHeight: TOUCHE - 10, justifyContent: 'center', paddingHorizontal: E.s,
    borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
  },
  /* Les deux puces sont collées dans un même cadre : c'est ce qui les fait
     lire comme UN choix à deux positions, et non comme deux boutons voisins
     qu'on pourrait presser tous les deux. */
  uniteGroupe: {
    flexDirection: 'row', borderRadius: R.s, borderWidth: 1,
    borderColor: C.ligne, overflow: 'hidden',
  },
  unitePuce: {
    minHeight: TOUCHE - 10, justifyContent: 'center', paddingHorizontal: E.s,
  },
  unitePuceActive: { backgroundColor: C.vif },
  renfort: { paddingLeft: E.m, borderLeftWidth: 2, borderLeftColor: C.ok },
  ajouterAliment: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.ligne, borderRadius: R.s,
  },
  plafond: {
    fontSize: T.petit, lineHeight: 16, color: C.ok,
    backgroundColor: C.okFond, borderRadius: R.s,
    paddingHorizontal: E.s, paddingVertical: 6,
  },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: E.xs },
  puce: {
    flexDirection: 'row', alignItems: 'center', gap: E.xs,
    paddingHorizontal: E.s, paddingVertical: E.xs,
    borderRadius: R.m, borderWidth: 1, borderColor: C.ligne,
    minHeight: TOUCHE - 14,
  },
});
