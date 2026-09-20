import { useEffect, useMemo, useReducer, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useAlimentsReference, useCreerAliment, useDefinirQuantiteGrocy, useDefinirStock,
  useEnregistrerAliment, useEnvoyerInventaire, useFrigoIncomplets, useMajAliment,
  useMonFrigo, useSuiviInventaire, useSupprimerAliment,
} from '@/api/hooks';
import type { AlimentDisponible, AlimentIncomplet } from '@/api/types';
import { Bouton, Champ, Chargement, Discret, Erreur, Vide } from '@/composants/base';
import { AlertesFrigo } from '@/composants/alertesFrigo';
import { Confirmer } from '@/composants/confirmer';
import { EditeurAlimentConnecte } from '@/composants/editeurAlimentConnecte';
import { LigneIncomplete, LigneInventaire, LigneStock } from '@/composants/ligneFrigo';
import {
  abonnerInventaire, allerAuStock, basculerVu, cloreInventaire, modeFrigo, ouvrirInventaire,
  reinitialiserInventaire, saisirQuantite, saisiesInventaire, vusInventaire,
} from '@/composants/etatInventaire';
import { ecartsInventaire, estIncomplet, filtrerFrigo, grouperParEmplacement } from '@/calcul/frigo';
import { C, E, P, R, T, TOUCHE } from '@/theme';

/**
 * Mon frigo : une seule liste, deux modes.
 *
 * « Stock » consulte et corrige les fiches ; « Inventaire » compte. Le passage
 * de l'un à l'autre ne change ni la liste, ni son ordre, ni son regroupement —
 * seules une case à cocher et une saisie de quantité apparaissent. Deux écrans
 * séparés obligeaient à retrouver sa place après chaque bascule.
 */
export default function MonFrigo() {
  const insets = useSafeAreaInsets();

  const frigo = useMonFrigo();
  const definir = useDefinirStock();
  const enregistrer = useEnregistrerAliment();
  const poserQuantite = useDefinirQuantiteGrocy();
  const envoyer = useEnvoyerInventaire();
  const suivi = useSuiviInventaire();
  const creer = useCreerAliment();
  const majAliment = useMajAliment();
  const supprimer = useSupprimerAliment();

  const [ouvert, setOuvert] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');

  /* L'INVENTAIRE EN COURS NE VIT PAS ICI — constat M12, 18 septembre 2026.
     Cet onglet est démonté dès qu'on en regarde un autre : tant que le
     comptage était un `useState`, aller vérifier une quantité dans l'onglet
     Stock emportait trente articles saisis. `etatInventaire` survit à la
     navigation ; l'onglet n'en est plus que la vue, et se redessine quand le
     module le prévient. Même patron que le chrono et la mesure d'effort. */
  const [, redessiner] = useReducer((n: number) => n + 1, 0);
  useEffect(() => abonnerInventaire(redessiner), []);
  const mode = modeFrigo();
  const saisies = saisiesInventaire();
  const vus = vusInventaire();

  const [edite, setEdite] = useState<AlimentDisponible | null>(null);
  const [creation, setCreation] = useState(false);
  const [quantiteNouvelle, setQuantiteNouvelle] = useState('');
  const [aSupprimer, setASupprimer] = useState<AlimentDisponible | null>(null);
  /* Le produit Grocy dont on renseigne les valeurs pour la PREMIÈRE fois. Un
     état à part de `edite` : il n'a aucune valeur à corriger, seulement un nom
     et une référence. Les mélanger aurait obligé à fabriquer un aliment à
     zéros, et un zéro inventé s'enregistre comme une valeur (règle 6). */
  const [aCompleter, setACompleter] = useState<AlimentIncomplet | null>(null);

  /** Les comptes lisant Grocy gèrent leurs fiches et leurs quantités là-bas. */
  /* Qui tient la fiche d'un aliment : la base pour un compte ordinaire,
     Grocy pour l'administrateur. Le geste, lui, est le meme des deux cotes —
     l'ecran ne distingue les deux que pour choisir l'API. */
  const surGrocy = frigo.data?.source === 'grocy';
  const modifiable = frigo.data?.source === 'base';
  /* La CREATION, elle, est ouverte aux deux. Grocy reste maitre de
     l'inventaire — c'est lui qui sort la liste de courses — mais rien
     n'oblige a ouvrir son interface pour y poser une ligne : l'API cree le
     produit puis ecrit ses valeurs dans le meme appel. */
  const peutCreer = modifiable || surGrocy;
  const incomplets = useFrigoIncomplets(frigo.data?.source === 'grocy');

  /* LA RECHERCHE DU RATTACHEMENT CIQUAL vit ici, avec les autres hooks : les
     deux éditeurs ne font qu'assembler, et n'appellent rien eux-mêmes. */
  const [rechercheReference, setRechercheReference] = useState('');
  const references = useAlimentsReference(rechercheReference);

  /* Sans macros, l'aliment est écarté du frigo ; sans fibres, il y reste. Les
     deux listes n'appellent donc pas le même message. */
  const bloquants = (incomplets.data?.produits ?? []).filter((p) => p.manquants.length > 0);
  const sansFibres = (incomplets.data?.produits ?? [])
    .filter((p) => p.manquants.length === 0 && (p.souhaites ?? []).length > 0);

  const tous = frigo.data?.aliments ?? [];

  /* LES PRODUITS GROCY INCOMPLETS SONT DANS LA MEME LISTE — 19 septembre 2026.
     Ils étaient purement absents : `FrigoGrocy::lire()` les écartait, et
     l'application refusait de les recréer puisqu'ils existent déjà dans Grocy.
     On cherchait un aliment qu'on ne voyait nulle part et qu'on ne pouvait pas
     ajouter.

     ILS RESTENT HORS DE `tous`, ET C'EST VOLONTAIRE : `tous` alimente les
     écarts d'inventaire, le compteur « en stock » et tout ce qui compte. Un
     produit sans macros n'a rien à y faire — il n'a pas de valeurs, pas un
     zéro. Seul l'AFFICHAGE les réunit. */
  const incompletsGrocy = frigo.data?.incomplets ?? [];

  const sections = useMemo(
    () => grouperParEmplacement(filtrerFrigo([...tous, ...incompletsGrocy], recherche)),
    [tous, incompletsGrocy, recherche],
  );

  /* Les écarts se calculent sur TOUT le frigo, pas sur ce que la recherche
     laisse voir : filtrer puis envoyer perdrait les lignes déjà saisies. */
  const ecarts = useMemo(() => ecartsInventaire(tous, saisies), [tous, saisies]);

  const enStock = useMemo(() => tous.filter((a) => a.stock > 0).length, [tous]);
  const comptes = Object.values(vus).filter(Boolean).length;

  /* L'ÉTAT DE L'INVENTAIRE VIENT DU SERVEUR, PAS DE LA MUTATION.
     `envoyer.isSuccess` ne dit plus que « le dépôt est passé » : le travail
     se fait ailleurs, dans le conteneur des tâches, et peut durer une minute.
     Seul `suivi` sait où il en est — y compris si on a fermé l'application
     entre-temps. */
  const enCoursDEnvoi =
    suivi.data?.statut === 'en_attente' || suivi.data?.statut === 'en_cours';
  const echecsInventaire = suivi.data?.echecs ?? [];

  /* LE RÉSULTAT S'EFFACE AU BOUT D'UN QUART D'HEURE, ET IL LE FAUT.
     Le serveur garde le dernier lot trente jours : sans cette borne, « 12
     corrections appliquées » resterait affiché des semaines après, et une
     bannière permanente ne se lit plus. Un quart d'heure couvre le cas réel —
     on envoie, on va faire autre chose, on revient voir. */
  const inventaireFini = useMemo(() => {
    const s = suivi.data?.statut;
    if (s !== 'termine' && s !== 'echoue') return false;

    const fini = Date.parse(suivi.data?.finiLe ?? '');

    return Number.isFinite(fini) && Date.now() - fini < 15 * 60 * 1000;
  }, [suivi.data?.statut, suivi.data?.finiLe]);

  /* Les macros sont données pour 100 g. Une autre unité ne pose problème que
     si son poids est inconnu : le kilogramme et la pièce se convertissent dès
     que Grocy porte la conversion, le litre et le pack non. */
  const sansPoids = useMemo(() => tous.filter((a) => a.grammesParUnite === null), [tous]);

  /* `ouvrirInventaire` décide seul s'il préremplit : une session déjà ouverte
     se poursuit, elle ne recommence pas. Le contournement qui regardait
     `Object.keys(saisies).length === 0` est parti avec le constat M12 — il
     lisait l'état au lieu de l'intention, et tout effacer à la main suffisait
     à le tromper. Repartir de zéro reste un geste qu'on décide : c'est le
     bouton « Réinitialiser », en bas. */
  const entrerInventaire = () => {
    envoyer.reset();
    setOuvert(null);
    ouvrirInventaire(tous);
  };

  if (frigo.isLoading) return <Chargement texte="Lecture de ton frigo…" />;
  if (frigo.isError) {
    return <Erreur message={frigo.error.message} onReessayer={() => void frigo.refetch()} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={s.tete}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: E.s }}>
          <View style={s.segmente}>
            <Pressable
              onPress={allerAuStock}
              style={[s.segment, mode === 'stock' && s.segmentActif]}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'stock' }}
            >
              <Discret style={mode === 'stock' ? s.segmentTexteActif : s.segmentTexte}>
                Stock
              </Discret>
            </Pressable>
            <Pressable
              onPress={entrerInventaire}
              style={[s.segment, mode === 'inventaire' && s.segmentActif]}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'inventaire' }}
            >
              <Discret style={mode === 'inventaire' ? s.segmentTexteActif : s.segmentTexte}>
                Inventaire
              </Discret>
            </Pressable>
          </View>
        </View>

        <Discret style={{ fontSize: T.petit }}>
          {mode === 'stock'
            ? `${enStock} en stock sur ${tous.length}`
            : `${comptes}/${tous.length} vérifiés · ${ecarts.length} écart${ecarts.length > 1 ? 's' : ''}`}
          {frigo.data?.source === 'grocy' ? ' · depuis Grocy' : ''}
        </Discret>

        {/* L'en-tête est volontairement IDENTIQUE dans les deux modes : mêmes
            éléments, même hauteur, seul le texte du compteur change. Un bouton
            qui apparaissait ici et une aide qui disparaissait là faisaient
            sauter la liste, et la bascule ressemblait à un changement de page. */}
        <Champ
          valeur={recherche}
          onChange={setRecherche}
          placeholder="Chercher un aliment ou un emplacement"
        />

        <AlertesFrigo
          erreurSuppression={supprimer.isError ? supprimer.error.message : null}
          quantiteEnEchec={definir.isError || poserQuantite.isError}
          messageQuantite={(definir.error ?? poserQuantite.error)?.message}
          enCoursDEnvoi={enCoursDEnvoi}
          traites={suivi.data?.traites ?? 0}
          total={suivi.data?.total ?? 0}
          inventaireFini={inventaireFini}
          echecs={echecsInventaire}
          sansPoids={sansPoids}
          probleme={frigo.data?.probleme}
          bloquants={bloquants}
          sansFibres={sansFibres}
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(a) => a.reference}
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
        refreshing={frigo.isRefetching}
        onRefresh={mode === 'stock' ? () => void frigo.refetch() : undefined}
        ListEmptyComponent={
          <Vide message={recherche.trim() !== ''
            ? `Aucun aliment ne correspond à « ${recherche} ».`
            : 'Ton frigo est vide. Ajoute un aliment pour commencer.'} />
        }
        renderSectionHeader={({ section }) => (
          <Discret style={s.section}>{section.titre} · {section.data.length}</Discret>
        )}
        renderItem={({ item }) => (
          /* SANS MACROS, PAS DE FICHE NI DE COMPTAGE. On ne peut ni corriger
             ses valeurs ici (elles vivent dans Grocy), ni le compter dans un
             inventaire dont le résultat nourrit le calculateur. On le MONTRE,
             et on dit pourquoi il est à part. */
          estIncomplet(item) ? (
            <LigneIncomplete
              produit={item}
              onRenseigner={() => { enregistrer.reset(); setACompleter(item); }}
            />
          ) : (
          mode === 'inventaire'
            ? (
              <LigneInventaire
                aliment={item}
                texte={saisies[item.reference] ?? ''}
                vu={vus[item.reference] === true}
                ecart={ecarts.some((l) => l.reference === item.reference)}
                onTexte={(v) => saisirQuantite(item.reference, v)}
                onCocher={() => basculerVu(item.reference)}
              />
            )
            : (
              <LigneStock
                aliment={item}
                ouvert={ouvert === item.reference}
                modifiable={modifiable}
                onOuvrir={() => setOuvert(ouvert === item.reference ? null : item.reference)}
                onCorriger={() => {
                  majAliment.reset();
                  enregistrer.reset();
                  setEdite(item);
                }}
                onSupprimer={() => { supprimer.reset(); setASupprimer(item); }}
              />
            )
          )
        )}
      />

      {/* Barre du bas, présente dans les deux modes : c'est elle qui porte
          l'action principale, à portée du pouce. Sa présence constante évite
          que la liste ne se redimensionne au changement de mode. */}
      {mode === 'stock' && peutCreer && (
        <View style={[s.pied, { paddingBottom: E.m + insets.bottom }]}>
          <Bouton
            onPress={() => {
              creer.reset();
              definir.reset();
              setQuantiteNouvelle('');
              setCreation(true);
            }}
          >
            Ajouter un aliment
          </Bouton>
        </View>
      )}

      {mode === 'inventaire' && (
        <View style={[s.pied, { paddingBottom: E.m + insets.bottom }]}>
          {envoyer.isError && (
            <Discret style={{ color: C.erreur, fontSize: T.petit, lineHeight: 17 }}>
              {envoyer.error.message}
            </Discret>
          )}

          <View style={{ flexDirection: 'row', gap: E.s }}>
            <Bouton
              variante="contour"
              onPress={() => reinitialiserInventaire(tous)}
              style={{ flex: 1 }}
            >
              Réinitialiser
            </Bouton>
            <Bouton
              onPress={() => envoyer.mutate(ecarts, {
                /* DÉPOSÉ, PAS APPLIQUÉ — et on vide quand même la saisie.
                   Le serveur tient désormais la liste : la garder ici ferait
                   rouvrir l'inventaire sur des chiffres déjà partis, et c'est
                   ce renvoi-là qui a mis le frigo en désordre le 14 août. Ce
                   qui reste à surveiller s'affiche au-dessus. */
                onSuccess: cloreInventaire,
              })}
              /* Un seul inventaire à la fois. Le serveur le refuse aussi — un
                 index unique en base —, mais un bouton grisé explique mieux
                 qu'un message d'erreur après coup. */
              desactive={ecarts.length === 0 || envoyer.isPending || enCoursDEnvoi}
              style={{ flex: 1.6 }}
            >
              {enCoursDEnvoi
                ? 'Inventaire en cours…'
                : envoyer.isPending
                  ? 'Envoi…'
                  : ecarts.length === 0
                    ? 'Aucun écart à envoyer'
                    : `Enregistrer ${ecarts.length} correction${ecarts.length > 1 ? 's' : ''}`}
            </Bouton>
          </View>
        </View>
      )}

      {/* ---- création et correction des valeurs, quelle que soit la source ---- */}
      <EditeurAlimentConnecte
        source={frigo.data?.source}
        creation={creation}
        edite={edite}
        aCompleter={aCompleter}
        /* PAS DE RATTACHEMENT SUR UN FRIGO GROCY, et c'est un refus assumé.
           La colonne `reference_ciqual` vit dans la base ; l'écriture d'un
           compte Grocy passe par `POST /mon-frigo/aliment`, qui écrit des
           `userfields` et ignore ce champ. Proposer le sélecteur là-bas
           laisserait quelqu'un rattacher soixante aliments un par un, et tout
           perdre en silence — relevé le 20 septembre 2026 avant que ça arrive.

           Il reviendra avec la migration vers la base (`docs/plan-serveur-
           autoritaire.md`), qui est précisément le moment où ces aliments
           cesseront de vivre dans Grocy. */
        rattachement={modifiable ? {
          recherche: rechercheReference,
          resultats: references.data ?? [],
          onRecherche: setRechercheReference,
        } : undefined}
        quantite={quantiteNouvelle}
        onQuantiteChange={setQuantiteNouvelle}
        onFermer={() => {
          setCreation(false); setEdite(null); setACompleter(null); setQuantiteNouvelle('');
        }}
        onCreationEnvoyee={() => { setCreation(false); setQuantiteNouvelle(''); }}
        onEditionFaite={() => { setEdite(null); setACompleter(null); }}
        creer={creer}
        majAliment={majAliment}
        definir={definir}
        enregistrer={enregistrer}
        poserQuantite={poserQuantite}
      />

      <Confirmer
        visible={aSupprimer !== null}
        titre={`Supprimer « ${aSupprimer?.nom ?? ''} » ?`}
        message={
          'Il quittera définitivement ta liste d’aliments. '
          + 'La suppression est refusée s’il t’en reste en stock : '
          + 'mets sa quantité à zéro depuis l’inventaire d’abord.'
        }
        onAnnuler={() => setASupprimer(null)}
        onConfirmer={() => {
          if (aSupprimer === null) return;

          supprimer.mutate(Number(aSupprimer.reference.split(':')[1]), {
            // en cas d'échec la carte reste ouverte : le motif s'affiche en
            // haut de l'écran, et on garde sous les yeux l'aliment concerné
            onSuccess: () => { setASupprimer(null); setOuvert(null); },
            onError: () => setASupprimer(null),
          });
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  tete: { padding: E.m, gap: E.s, borderBottomWidth: 1, borderBottomColor: C.ligne },

  /* Sélecteur à deux segments : les deux choix restent lisibles, celui qui
     est actif est plein. */
  segmente: {
    flex: 1, flexDirection: 'row', padding: 2,
    borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    backgroundColor: C.surface2,
  },
  segment: {
    // 36 px auparavant, sous les 44 que le theme impose.
    flex: 1, minHeight: TOUCHE, borderRadius: R.s - 2,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: E.xs,
  },
  segmentActif: { backgroundColor: C.vif },
  segmentTexte: { fontSize: T.normal },
  segmentTexteActif: { color: C.fond, fontFamily: P.fort, fontSize: T.normal },

  page: { padding: E.m, gap: 6, flexGrow: 1, paddingBottom: E.xl },
  section: {
    fontFamily: P.titre, fontSize: T.normal, letterSpacing: 1.2, textTransform: 'uppercase',
    marginTop: E.m, marginBottom: E.xs,
  },

  /* Barre d'envoi collée en bas. Le retrait vient de useSafeAreaInsets :
     sans lui, Android la glisse sous sa barre de navigation. */
  pied: {
    padding: E.m, gap: E.s,
    borderTopWidth: 1, borderTopColor: C.ligne, backgroundColor: C.fond,
  },
});
