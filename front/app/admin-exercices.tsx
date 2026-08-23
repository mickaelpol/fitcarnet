import { useEffect, useMemo, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View,
} from 'react-native';
import { useExerciceDetail, useExercices, useMajExercice, useMoi } from '@/api/hooks';
import type { Exercice } from '@/api/types';
import { Bouton, Carte, Champ, Chargement, Discret, Erreur, Texte, Vide } from '@/composants/base';
import { ChoixMuscle } from '@/composants/choixMuscle';
import { ChoixPuces } from '@/composants/choixPuces';
import { identifiantYoutube, ModaleExercice } from '@/composants/modaleExercice';
import { groupeDeLaValeur, libelleDuMuscle, valeurPourGroupe } from '@/muscles/groupes';
import {
  assembler, casesPour, libelle, normaliser, SECONDAIRES, ZONES,
} from '@/muscles/vocabulaire';
import { C, E, P, R, T, TOUCHE } from '@/theme';

/**
 * GESTION DES EXERCICES — tout ce qu'on peut corriger sur un exercice.
 *
 * Cet écran ne servait qu'aux vidéos et aux noms français. Le reste du
 * contenu — zone, muscles, matériel, exécution — arrivait du catalogue importé,
 * en anglais, et rien ne permettait d'y toucher. Quant aux exercices ajoutés à
 * la main, ils naissaient sans aucune de ces données et le restaient : leur
 * fiche n'affichait jamais que le titre et le format.
 *
 * LES DEUX SORTES D'EXERCICES SONT TRAITEES PAREIL, et c'est le point. Un
 * exercice importé et un exercice personnel sont deux lignes de la même table ;
 * distinguer ce qu'on a le droit de corriger sur l'un et sur l'autre serait une
 * règle de plus à retenir, sans rien protéger.
 *
 * UN EXERCICE A LA FOIS, DANS UN EDITEUR SEPARE. Déplier huit champs dans
 * chaque carte d'une liste de 1338 entrées rendrait le défilement impraticable,
 * et ferait porter à l'écran un brouillon par exercice et par champ. Ici la
 * liste reste une liste ; l'édition est un geste à part, qu'on ouvre et qu'on
 * ferme.
 */

/** Les champs modifiables, dans l'ordre où ils apparaissent sur la fiche. */
const CHAMPS = [
  { cle: 'nomFr', etiquette: 'Nom français' },
  { cle: 'videoUrl', etiquette: 'Lien YouTube' },
  /* `partieCorps` ET `musclesSecondaires` N'Y SONT PLUS NON PLUS, POUR LA
     MÊME RAISON QUE `muscleCible` ci-dessous : c'étaient des champs de texte
     libre sur un vocabulaire qu'il fallait connaître par cœur — `upper legs`,
     `hip flexors` — et que personne ne peut retaper deux fois pareil. La base
     en porte la trace : `traps` ET `trapezius`, `deltoids` ET « épaules »,
     `lats` ET `latissimus dorsi` — quarante-deux mots pour une vingtaine de
     muscles. Ils se choisissent maintenant dans une liste, en français, plus
     bas dans l'éditeur. */
  /* `muscleCible` N'EST PLUS ICI, ET C'EST UNE CORRECTION.
     C'était un champ de texte libre. Or le filtre par vignette compare la
     valeur EXACTEMENT à celle du catalogue — `pectorals`, pas « Pectoraux ».
     Taper le mot en français, ou au pluriel, ou en abrégé, faisait tomber
     l'exercice dans « Autre » sans le moindre message : on l'aurait cherché
     dans les pectoraux pendant longtemps. Il se choisit désormais sur les
     mêmes vignettes que le filtre — ce qu'on peut désigner est exactement ce
     qu'on peut retrouver. */
  { cle: 'equipement', etiquette: 'Matériel' },
  { cle: 'formatPrescrit', etiquette: 'Format prescrit' },
  { cle: 'instructions', etiquette: 'Exécution', long: true },
] as const;

type CleModifiable = (typeof CHAMPS)[number]['cle'];
type Brouillon = Record<CleModifiable, string>;

/**
 * Les deux champs qui ne sont pas du texte libre, et qui changent le
 * COMPORTEMENT de l'exercice — pas seulement son affichage.
 *
 * `modeDefaut` décide de ce qu'on saisit pendant une séance : des charges, un
 * temps sous tension, ou un chronomètre. `groupes` décide dans quelles séances
 * l'exercice est proposé.
 */
const MODES = [
  { cle: 'charge', libelle: 'Charge' },
  { cle: 'iso', libelle: 'Isométrie' },
  { cle: 'chrono', libelle: 'Chrono' },
] as const;

const GROUPES = ['Push', 'Pull', 'Legs'] as const;

type Filtre = 'a_completer' | 'sans_muscle' | 'sans_video' | 'sans_nom_fr' | 'perso' | 'tous';

const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: 'a_completer', libelle: 'À compléter' },
  { cle: 'sans_muscle', libelle: 'Sans muscle' },
  { cle: 'sans_video', libelle: 'Sans vidéo' },
  { cle: 'sans_nom_fr', libelle: 'À traduire' },
  { cle: 'perso', libelle: 'Les miens' },
  { cle: 'tous', libelle: 'Tous' },
];

/**
 * UN EXERCICE PERSO N'A RIEN À TRADUIRE.
 *
 * Le nom français vit dans `nomFr`, et le catalogue importé a son nom anglais
 * dans `nom` : traduire, c'est remplir le second à partir du premier. Mais un
 * exercice que tu as créé toi-même s'appelle déjà « Fente bulgare » — dans
 * `nom`. Pour le faire passer au vert, il fallait retaper le même mot dans un
 * second champ : deux endroits pour un seul nom, et le second se périmerait
 * au premier renommage.
 *
 * ILS SONT DONC TRADUITS D'OFFICE, et surtout ils ne comptent NI dans les
 * traduits NI dans le reste à traduire : la question ne se pose pas pour eux.
 * Sans ça le compteur ne pourrait jamais atteindre son total, et un compteur
 * qui n'arrive jamais au bout n'apprend plus rien.
 *
 * CETTE FONCTION EST LA SEULE DÉFINITION. La pastille, le filtre et le
 * compteur s'en servent tous les trois : ils ne peuvent plus se contredire,
 * ce qui est exactement ce qui vient d'arriver — un « FR » gris sur une fiche
 * où le nom semblait renseigné.
 */
const aTraduire = (e: Exercice): boolean => e.source !== 'perso' && !e.nomFr;

const sansAccent = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------------------------------------------------------------- éditeur

/**
 * L'éditeur d'UN exercice.
 *
 * Il va chercher la fiche complète : depuis que les textes longs ne voyagent
 * plus avec la collection, `exercices.data` ne contient ni l'exécution, ni les
 * muscles, ni le matériel. Les éditer à partir de la liste écrirait donc du
 * vide par-dessus des données existantes — silencieusement.
 */
function Editeur({
  exercice, zones, onFermer,
}: {
  exercice: Exercice;
  /* LES ZONES PROPOSÉES VIENNENT DU CATALOGUE, PAS D'UNE LISTE ÉCRITE ICI.
     L'écran a déjà les 1338 exercices en mémoire ; il en tire les zones qui
     existent VRAIMENT. Une liste en dur proposerait un jour une zone que plus
     personne n'utilise, et tairait celle que quelqu'un vient d'ajouter. */
  zones: readonly { cle: string; label: string }[];
  onFermer: () => void;
}) {
  const detail = useExerciceDetail(exercice.id);
  const maj = useMajExercice();
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [groupes, setGroupes] = useState<string[] | null>(null);
  /* `null` avant l'arrivée de la fiche, comme les autres. Ensuite, la clé de
     vignette — ou `null` si le muscle actuel n'en a aucune. */
  const [muscle, setMuscle] = useState<string | null>(null);
  /* La zone telle qu'elle est écrite en base — `upper legs`, pas « Cuisses ».
     Un tableau d'un élément au plus : `ChoixPuces` parle la même langue en
     simple et en multiple, et un cas particulier de moins est un bug de
     moins. */
  const [zone, setZone] = useState<string[] | null>(null);
  const [secondaires, setSecondaires] = useState<string[] | null>(null);

  const complet = detail.data;

  /* Le brouillon ne se remplit QU'UNE FOIS la fiche arrivée, et il est remis à
     zéro si l'on change d'exercice. Le pré-remplir avec la version légère
     afficherait des champs vides que l'utilisateur croirait vides en base. */
  useEffect(() => {
    if (complet === undefined) {
      setBrouillon(null);
      setMode(null);
      setGroupes(null);
      setZone(null);
      setSecondaires(null);

      return;
    }
    setBrouillon(Object.fromEntries(
      CHAMPS.map((c) => [c.cle, complet[c.cle] ?? '']),
    ) as Brouillon);
    setMode(complet.modeDefaut);
    setGroupes(complet.groupes);
    setMuscle(groupeDeLaValeur(complet.muscleCible));
    /* ON PART DE LA FORME NORMALISÉE, ET C'EST CE QUI ÉVITE LES FAUX
       CHANGEMENTS. Un exercice portant `traps, trapezius` ne coche qu'une
       case ; si l'on comparait ensuite à la chaîne d'origine, l'éditeur
       annoncerait une modification sur une fiche qu'on vient seulement
       d'ouvrir, et la réécrirait au premier enregistrement venu. */
    setZone(normaliser(ZONES, complet.partieCorps));
    setSecondaires(normaliser(SECONDAIRES, complet.musclesSecondaires));
  }, [complet]);

  const modifies = useMemo(() => {
    if (brouillon === null || complet === undefined) return [];

    return CHAMPS.filter((c) => brouillon[c.cle].trim() !== (complet[c.cle] ?? ''));
  }, [brouillon, complet]);

  const modeChange = complet !== undefined && mode !== null && mode !== complet.modeDefaut;
  /* Comparaison par chaîne : `groupes` est toujours rangé dans l'ordre de
     GROUPES (voir `basculer`), donc deux sélections identiques donnent deux
     chaînes identiques. Sans cet ordre canonique, cocher Push puis Pull et
     l'inverse passeraient pour deux états différents. */
  const groupesChanges = complet !== undefined && groupes !== null
    && groupes.join(',') !== complet.groupes.join(',');

  /* ON COMPARE DES VIGNETTES, PAS DES VALEURS DE BASE. Un exercice sur
     `upper back` relève de « Dos » ; le rattacher à « Dos » écrirait `lats`,
     et une comparaison sur la valeur crierait au changement alors que rien ne
     bouge pour l'utilisateur. */
  const muscleChange = complet !== undefined
    && muscle !== groupeDeLaValeur(complet.muscleCible);

  /* COMPARÉS À LEUR FORME NORMALISÉE, PAS À LA CHAÎNE D'ORIGINE. `traps,
     trapezius` et `trapezius` cochent la même case : les deux doivent compter
     pour « rien n'a bougé », sinon l'éditeur annonce une modification sur une
     fiche qu'on vient d'ouvrir et la réécrit pour rien. */
  const zoneChange = complet !== undefined && zone !== null
    && assembler(zone) !== assembler(normaliser(ZONES, complet.partieCorps));

  const secondairesChanges = complet !== undefined && secondaires !== null
    && assembler(secondaires) !== assembler(normaliser(SECONDAIRES, complet.musclesSecondaires));

  const nbModifs = modifies.length + (modeChange ? 1 : 0)
    + (groupesChanges ? 1 : 0) + (muscleChange ? 1 : 0)
    + (zoneChange ? 1 : 0) + (secondairesChanges ? 1 : 0);

  const basculer = (g: string) => {
    if (groupes === null) return;
    const suite = groupes.includes(g) ? groupes.filter((x) => x !== g) : [...groupes, g];
    setGroupes(GROUPES.filter((t) => suite.includes(t)));
  };

  const video = (brouillon?.videoUrl ?? '').trim();
  const videoValide = video === '' || identifiantYoutube(video) !== null;

  const enregistrer = () => {
    if (brouillon === null) return;

    /* On n'envoie QUE ce qui a changé. Renvoyer les huit champs à chaque fois
       écraserait une modification faite ailleurs entre-temps, sans qu'on ait
       jamais voulu y toucher. */
    const corps: Partial<Exercice> = {};
    for (const c of modifies) {
      const v = brouillon[c.cle].trim();
      (corps as Record<string, string | null>)[c.cle] = v === '' ? null : v;
    }
    if (modeChange && mode !== null) corps.modeDefaut = mode as Exercice['modeDefaut'];
    if (groupesChanges && groupes !== null) corps.groupes = groupes;
    /* `null` quand aucune vignette n'est retenue : l'exercice rejoint alors
       « Autre », qui est exactement ce que veut dire un muscle non renseigné. */
    if (muscleChange) corps.muscleCible = muscle === null ? null : valeurPourGroupe(muscle);
    /* Rien de coché s'écrit `null`, jamais une chaîne vide : deux façons de
       dire « rien » finissent toujours par ne plus se ressembler — un filtre
       qui teste l'une laisserait passer l'autre. */
    if (zoneChange && zone !== null) corps.partieCorps = zone[0] ?? null;
    if (secondairesChanges && secondaires !== null) {
      corps.musclesSecondaires = secondaires.length === 0 ? null : assembler(secondaires);
    }

    maj.mutate({ id: exercice.id, ...corps }, { onSuccess: onFermer });
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onFermer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.fond}
      >
        <View style={s.feuille}>
          <Texte style={s.titreEditeur} numberOfLines={2}>{exercice.nom}</Texte>
          <Discret style={{ fontSize: T.petit }}>
            {exercice.source === 'perso' ? '★ exercice personnel' : 'catalogue importé'}
          </Discret>

          {detail.isLoading || brouillon === null ? (
            <View style={{ paddingVertical: E.xl }}><Chargement /></View>
          ) : detail.isError ? (
            <Erreur
              message={detail.error.message}
              onReessayer={() => void detail.refetch()}
            />
          ) : (
            <ScrollView
              style={{ marginTop: E.m }}
              contentContainerStyle={{ gap: E.s, paddingBottom: E.m }}
              keyboardShouldPersistTaps="handled"
            >
              {CHAMPS.map((c) => (
                <Champ
                  key={c.cle}
                  etiquette={c.etiquette}
                  valeur={brouillon[c.cle]}
                  onChange={(v) => setBrouillon({ ...brouillon, [c.cle]: v })}
                  placeholder={c.cle === 'nomFr' ? exercice.nom : undefined}
                  multiligne={'long' in c ? c.long : undefined}
                />
              ))}

              {/* CES DEUX-LA NE CHANGENT PAS L'AFFICHAGE, ILS CHANGENT CE QUE
                  L'APPLICATION FAIT. D'où la séparation visuelle. */}
              <View style={{ gap: E.xs, marginTop: E.s }}>
                <Discret style={s.etiquetteChoix}>Ce qu’on saisit pendant la séance</Discret>
                <View style={s.puces}>
                  {MODES.map((m) => (
                    <Pressable
                      key={m.cle}
                      onPress={() => setMode(m.cle)}
                      style={[s.puce, mode === m.cle && s.puceActive]}
                      accessibilityLabel={`Mode ${m.libelle}`}
                    >
                      <Discret style={mode === m.cle
                        ? { color: C.fond, fontFamily: P.fort, fontSize: T.petit }
                        : { fontSize: T.petit }}
                      >
                        {m.libelle}
                      </Discret>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={{ gap: E.xs }}>
                <Discret style={s.etiquetteChoix}>Séances où le proposer</Discret>
                <View style={s.puces}>
                  {GROUPES.map((g) => (
                    <Pressable
                      key={g}
                      onPress={() => basculer(g)}
                      style={[s.puce, groupes?.includes(g) === true && s.puceActive]}
                      accessibilityLabel={`Groupe ${g}`}
                    >
                      <Discret style={groupes?.includes(g) === true
                        ? { color: C.fond, fontFamily: P.fort, fontSize: T.petit }
                        : { fontSize: T.petit }}
                      >
                        {g}
                      </Discret>
                    </Pressable>
                  ))}
                </View>
                {/* Ce n'est pas une erreur, c'est un choix — et il n'est pas
                    devinable depuis l'écran, donc on l'écrit. */}
                {groupes !== null && groupes.length === 0 && (
                  <Discret style={{ fontSize: T.petit }}>
                    Aucun groupe : cet exercice est proposé dans toutes les séances.
                  </Discret>
                )}
              </View>

              {/* UN SEUL CHOIX, PARCE QUE LA DONNÉE N'EN A JAMAIS EU DEUX.
                  Aucun des 1338 exercices ne porte de virgule dans sa zone.
                  Proposer d'en cocher plusieurs inventerait une possibilité
                  que rien, ensuite, ne sait lire : la fiche l'afficherait, et
                  aucun autre écran n'en tiendrait compte. */}
              <View style={{ gap: E.xs }}>
                <Discret style={s.etiquetteChoix}>Zone</Discret>
                <ChoixPuces
                  options={casesPour(zones, zone ?? [])}
                  choisis={zone ?? []}
                  onChanger={setZone}
                  etiquettePour={(l) => `Zone ${l}`}
                />
              </View>

              {/* LES MÊMES VIGNETTES QUE LE FILTRE, ET C'EST TOUT L'INTÉRÊT.
                  Ce qu'on peut désigner ici est exactement ce qu'on pourra
                  retrouver là-bas. Un champ de texte libre laissait les deux
                  vocabulaires diverger sans que rien ne le signale. */}
              <View style={{ gap: E.xs }}>
                <Discret style={s.etiquetteChoix}>Muscle ciblé</Discret>
                <ChoixMuscle choisi={muscle} onChoisir={setMuscle} />
                {muscle === null && (
                  <Discret style={{ fontSize: T.petit }}>
                    Aucun muscle : cet exercice ne sortira que sous « Autre ».
                  </Discret>
                )}
              </View>

              {/* CELUI-CI EST BIEN MULTIPLE : 985 exercices sur 1338 portent
                  plusieurs muscles secondaires. Il ne sert à aucun filtre —
                  chercher « triceps » sur le secondaire remonterait tous les
                  développés couchés, où ils ne sont que sollicités. Il se lit
                  sur la fiche, pour savoir ce qu'on aura courbaturé. */}
              <View style={{ gap: E.xs }}>
                <Discret style={s.etiquetteChoix}>Aussi sollicités</Discret>
                <ChoixPuces
                  multiple
                  options={casesPour(SECONDAIRES, secondaires ?? [])}
                  choisis={secondaires ?? []}
                  onChanger={setSecondaires}
                  etiquettePour={(l) => `Aussi sollicité : ${l}`}
                />
              </View>

              {!videoValide && (
                <Discret style={{ color: C.erreur, fontSize: T.petit }}>
                  Ce lien n’est pas reconnu comme une vidéo YouTube.
                </Discret>
              )}
              {maj.isError && (
                <Discret style={{ color: C.erreur, fontSize: T.petit }}>
                  {maj.error.message}
                </Discret>
              )}
            </ScrollView>
          )}

          <View style={{ flexDirection: 'row', gap: E.s, marginTop: E.s }}>
            <Bouton
              onPress={enregistrer}
              desactive={nbModifs === 0 || !videoValide || maj.isPending}
              style={{ flex: 1 }}
            >
              {nbModifs === 0 ? 'Aucune modification' : `Enregistrer (${nbModifs})`}
            </Bouton>
            <Bouton variante="contour" onPress={onFermer}>Fermer</Bouton>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ------------------------------------------------------------------ écran

export default function AdminExercices() {
  const moi = useMoi();
  const exercices = useExercices();

  const [filtre, setFiltre] = useState<Filtre>('a_completer');
  const [recherche, setRecherche] = useState('');
  const [edite, setEdite] = useState<Exercice | undefined>(undefined);
  const [apercu, setApercu] = useState<Exercice | undefined>(undefined);

  /* LES ZONES QU'ON PROPOSE SONT CELLES QUI EXISTENT DÉJÀ.
     Le catalogue est en mémoire ; on lui demande. Une liste écrite à la main
     finirait par proposer une zone que plus rien n'utilise et par taire celle
     qu'on vient d'ajouter — et personne ne s'en apercevrait, puisque les deux
     échouent en silence. `ZONES` ne sert qu'à traduire ; ce qu'il ne traduit
     pas s'affiche en anglais, ce qui se voit et se corrige. */
  const zonesProposees = useMemo(() => {
    const presentes = (exercices.data ?? []).map((e) => e.partieCorps ?? '').join(',');
    const cles = normaliser(ZONES, presentes);

    return casesPour(ZONES.filter((t) => cles.includes(t.cle)), cles);
  }, [exercices.data]);

  const liste = useMemo(() => {
    const q = sansAccent(recherche.trim());

    return (exercices.data ?? [])
      .filter((e) => {
        /* « À COMPLÉTER » A CHANGÉ DE TÉMOIN, ET LA RAISON EST NEUVE.
         *
         * Il ne regardait que `partieCorps`, choisi parce que c'était alors le
         * seul champ de la fiche à voyager avec la liste. Le muscle y est
         * revenu depuis, et il pèse plus lourd : c'est LUI qui décide sous
         * quelle vignette un exercice se retrouve quand on en cherche un.
         *
         * Un exercice avec une zone mais sans muscle passait donc pour
         * complet, et restait introuvable au filtre — la pire des deux
         * absences, celle qui se croit réglée. On regarde maintenant les deux. */
        if (filtre === 'a_completer') return !e.partieCorps || !e.muscleCible;
        /* SÉPARÉ DE « À compléter », parce que ce n'est pas le même travail.
           Compléter une fiche, c'est saisir plusieurs champs ; rattacher un
           muscle, c'est un appui sur une vignette. Les mélanger ferait remonter
           un exercice presque parfait au milieu de coquilles vides. */
        if (filtre === 'sans_muscle') return !e.muscleCible;
        if (filtre === 'sans_video') return !e.videoUrl;
        if (filtre === 'sans_nom_fr') return aTraduire(e);
        if (filtre === 'perso') return e.source === 'perso';

        return true;
      })
      .filter((e) => !q || sansAccent(`${e.nom} ${e.nomFr ?? ''}`).includes(q));
  }, [exercices.data, filtre, recherche]);

  if (moi.isLoading || exercices.isLoading) return <Chargement />;
  if (!moi.data?.roles?.includes('ROLE_ADMIN')) {
    return <Vide message="Cet écran est réservé à l'administrateur." />;
  }
  if (exercices.isError) {
    return <Erreur message={exercices.error.message} onReessayer={() => void exercices.refetch()} />;
  }

  const tous = exercices.data ?? [];
  const total = tous.length;
  const avecVideo = tous.filter((e) => Boolean(e.videoUrl)).length;
  /* On ne compte QUE les importés, numérateur comme dénominateur : « 2/1275 »
     répond à la question qu'on se pose vraiment — « combien en reste-t-il ? »
     — là où « 2 traduits » sur un total qui comprend tes propres exercices
     n'était comparable à rien. */
  const importes = tous.filter((e) => e.source !== 'perso');
  const traduits = importes.filter((e) => Boolean(e.nomFr)).length;
  /* LA JAUGE COMPTE LA MÊME CHOSE QUE LE FILTRE « À compléter ».
     Elle ne regardait que la zone : elle annonçait donc « 1319/1338 renseignés »
     pendant que le filtre, lui, en listait davantage. Deux chiffres pour une
     seule question, dont un faux — et c'est celui qu'on lit en premier. */
  const renseignes = tous.filter((e) => Boolean(e.partieCorps) && Boolean(e.muscleCible)).length;

  return (
    <View style={{ flex: 1, backgroundColor: C.fond }}>
      <View style={s.tete}>
        <Discret style={{ fontSize: T.normal }}>
          {renseignes}/{total} renseignés{' · '}
          {traduits}/{importes.length} traduits{' · '}
          {avecVideo} vidéos
        </Discret>
        <View style={s.jauge}>
          <View style={[s.jaugeRemplie, { width: `${Math.round((renseignes / total) * 100)}%` }]} />
        </View>

        <Champ valeur={recherche} onChange={setRecherche} placeholder="Rechercher un exercice…" />

        <View style={s.filtres}>
          {FILTRES.map((f) => (
            <Pressable
              key={f.cle}
              onPress={() => setFiltre(f.cle)}
              style={[s.filtre, filtre === f.cle && s.filtreActif]}
              accessibilityLabel={`Filtrer : ${f.libelle}`}
            >
              <Discret
                numberOfLines={1}
                style={filtre === f.cle
                  ? { color: C.fond, fontFamily: P.fort, fontSize: T.petit }
                  : { fontSize: T.petit }}
              >
                {f.libelle}
              </Discret>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={liste}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Vide message="Aucun exercice dans cette sélection." />}
        renderItem={({ item }) => (
          <Carte style={{ padding: 0 }}>
            <View style={s.ligne}>
              <Pressable
                onPress={() => setEdite(item)}
                style={s.zoneNom}
                accessibilityLabel={`Modifier ${item.nomFr ?? item.nom}`}
              >
                <Texte style={{ fontFamily: P.fort }} numberOfLines={1}>
                  {item.nomFr ?? item.nom}
                </Texte>
                {/* LE MUSCLE EST AFFICHÉ ICI, PAS SEULEMENT DANS LA FICHE.
                    C'est lui qui décide sous quelle vignette l'exercice se
                    retrouve quand on en cherche un. Un exercice qui n'en a pas
                    ne sort que sous « Autre » — autant le voir dans la liste
                    plutôt qu'en ouvrant les fiches une par une. */}
                <Discret style={{ fontSize: T.petit }} numberOfLines={1}>
                  {item.source === 'perso' ? '★ ' : ''}
                  {item.nomFr !== null && item.nomFr !== undefined ? `${item.nom} · ` : ''}
                  {item.partieCorps ? libelle(ZONES, item.partieCorps) : 'zone à compléter'}
                  {' · '}
                  {libelleDuMuscle(item.muscleCible) ?? 'muscle à compléter'}
                </Discret>
              </Pressable>

              {/* Deux pastilles, pas une colonne de cases : ce qui manque se
                  voit d'un coup d'œil sans lire. */}
              <View style={s.pastilles}>
                <Discret style={{
                  fontSize: T.petit, color: aTraduire(item) ? C.discret : C.ok,
                }}>
                  FR
                </Discret>
                <Discret style={{ fontSize: T.petit, color: item.videoUrl ? C.ok : C.discret }}>
                  ▶
                </Discret>
              </View>

              {item.videoUrl !== null && item.videoUrl !== undefined && (
                <Pressable
                  onPress={() => setApercu(item)}
                  style={s.oeil}
                  accessibilityLabel="Voir la fiche"
                >
                  <Discret style={{ fontSize: T.moyen }}>i</Discret>
                </Pressable>
              )}
            </View>
          </Carte>
        )}
      />

      {edite !== undefined && (
        <Editeur
          /* La clé force un éditeur NEUF par exercice : sans elle, React
             réutiliserait le composant et son brouillon d'un exercice à
             l'autre. */
          key={edite.id}
          exercice={edite}
          zones={zonesProposees}
          onFermer={() => setEdite(undefined)}
        />
      )}

      <ModaleExercice
        exercice={apercu}
        visible={apercu !== undefined}
        onFermer={() => setApercu(undefined)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  tete: { padding: E.m, gap: E.s, borderBottomWidth: 1, borderBottomColor: C.ligne },
  jauge: { height: 5, backgroundColor: C.surface2, borderRadius: 99, overflow: 'hidden' },
  jaugeRemplie: { height: '100%', backgroundColor: C.ok, borderRadius: 99 },
  filtres: { flexDirection: 'row', gap: 5 },
  filtre: {
    flex: 1, minHeight: TOUCHE, borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 2,
  },
  filtreActif: { backgroundColor: C.vif, borderColor: C.vif },
  page: { padding: E.m, gap: E.xs, paddingBottom: E.xl },

  ligne: { flexDirection: 'row', alignItems: 'center' },
  zoneNom: { flex: 1, minHeight: TOUCHE, justifyContent: 'center', padding: E.s },
  pastilles: { flexDirection: 'row', gap: E.s, paddingHorizontal: E.s },
  oeil: {
    width: 40, minHeight: TOUCHE, alignItems: 'center', justifyContent: 'center',
    borderLeftWidth: 1, borderLeftColor: C.ligne,
  },

  fond: {
    flex: 1, backgroundColor: C.voile,
    alignItems: 'center', justifyContent: 'center', padding: E.m,
  },
  feuille: {
    backgroundColor: C.surface, borderRadius: R.l, borderWidth: 1, borderColor: C.ligne,
    padding: E.m, maxHeight: '90%', width: '100%', maxWidth: 560,
  },
  titreEditeur: {
    fontFamily: P.titre, fontSize: T.titre, letterSpacing: 0.8, textTransform: 'uppercase',
  },
  etiquetteChoix: {
    fontSize: T.minuscule, letterSpacing: 1, textTransform: 'uppercase',
  },
  puces: { flexDirection: 'row', gap: 5 },
  puce: {
    flex: 1, minHeight: TOUCHE, borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 2,
  },
  puceActive: { backgroundColor: C.vif, borderColor: C.vif },
});
