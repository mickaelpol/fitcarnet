import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useAliments, useCreerAliment, useDefinirQuantiteGrocy, useDefinirStock,
  useEnregistrerAliment, useEnvoyerInventaire, useFrigoIncomplets, useMajAliment,
  useMonFrigo, useSuiviInventaire, useSupprimerAliment,
} from '@/api/hooks';
import type { AlimentDisponible } from '@/api/types';
import {
  Bouton, Carte, Champ, Chargement, Chiffre, Discret, Erreur, Texte, Vide,
} from '@/composants/base';
import { ChoixDansListe } from '@/composants/choixAliment';
import { Confirmer } from '@/composants/confirmer';
import { EditeurAliment, type AlimentSaisi } from '@/composants/editeurAliment';
import { ecartsInventaire, filtrerFrigo, grouperParEmplacement } from '@/calcul/frigo';
import { controler } from '@/calcul/nutrition';
import { C, E, N, P, R, T, TOUCHE, couleurRole, nb } from '@/theme';

/** Point de départ d'une création sans modèle. */
const ALIMENT_VIDE: AlimentSaisi = {
  nom: '', categorie: 'prot', kcal100: 0, prot100: 0, gluc100: 0, lip100: 0,
  fibres100: null, ratio: 1, peseeAvant: null, peseeApres: null,
};

/** Un aliment du frigo tel que l'éditeur l'attend. */
const versSaisie = (a: AlimentDisponible): AlimentSaisi => ({
  nom: a.nom,
  categorie: a.categorie,
  kcal100: a.kcal100,
  prot100: a.prot100,
  gluc100: a.gluc100,
  lip100: a.lip100,
  fibres100: a.fibres100 ?? null,
  ratio: a.ratio,
  peseeAvant: a.peseeAvant ?? null,
  peseeApres: a.peseeApres ?? null,
});

/**
 * Champs d'inventaire préremplis avec le stock connu.
 *
 * La valeur exacte, pas son affichage arrondi : préremplir « 1234,6 » pour un
 * stock de 1234,56 créerait un écart de 0,04 sur une ligne que personne n'a
 * touchée, et l'enverrait.
 */
const stocksInitiaux = (aliments: AlimentDisponible[]): Record<string, string> =>
  Object.fromEntries(aliments.map((a) => [a.reference, String(a.stock)]));

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
  const catalogue = useAliments();
  const creer = useCreerAliment();
  const majAliment = useMajAliment();
  const supprimer = useSupprimerAliment();

  const [mode, setMode] = useState<'stock' | 'inventaire'>('stock');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');

  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [vus, setVus] = useState<Record<string, boolean>>({});

  const [edite, setEdite] = useState<AlimentDisponible | null>(null);
  const [nouveau, setNouveau] = useState<AlimentSaisi | null>(null);
  const [quantiteNouvelle, setQuantiteNouvelle] = useState('');
  const [choixModele, setChoixModele] = useState(false);
  const [aSupprimer, setASupprimer] = useState<AlimentDisponible | null>(null);

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

  /* Sans macros, l'aliment est écarté du frigo ; sans fibres, il y reste. Les
     deux listes n'appellent donc pas le même message. */
  const bloquants = (incomplets.data?.produits ?? []).filter((p) => p.manquants.length > 0);
  const sansFibres = (incomplets.data?.produits ?? [])
    .filter((p) => p.manquants.length === 0 && (p.souhaites ?? []).length > 0);

  const tous = frigo.data?.aliments ?? [];

  const sections = useMemo(
    () => grouperParEmplacement(filtrerFrigo(tous, recherche)),
    [tous, recherche],
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

  /** Les noms déjà présents, pour ne pas les reproposer au catalogue. */
  const dejaChezMoi = useMemo(
    () => new Set(tous.map((a) => a.nom.trim().toLowerCase())),
    [tous],
  );

  /* MEMOISE, PARCE QUE C'ETAIT ECRIT DANS LE JSX.
     Ce filtrage porte sur les ~500 aliments du catalogue. Pose directement
     dans les attributs de `ChoixDansListe`, il se rejouait a chaque rendu de
     l'ecran — modale fermee comprise, donc a chaque caractere tape dans la
     recherche. Meme motif que dans les ecrans de seance et de modele. */
  const modelesPossibles = useMemo(() => [
    { id: 0, nom: 'Créer de zéro', detail: 'aucune valeur préremplie' },
    ...(catalogue.data ?? [])
      // On écarte ce qu'on possède déjà, par le nom. Le catalogue mêle les
      // aliments de référence et les siens ; proposer les siens ferait créer
      // un doublon, que l'unicité par propriétaire refuse.
      .filter((a) => !dejaChezMoi.has(a.nom.trim().toLowerCase()))
      .map((a) => ({
        id: a.id,
        nom: a.nom,
        detail: `${nb(a.kcal100)} kcal · ${nb(a.prot100)} P · ${nb(a.gluc100)} G`
          + ` · ${nb(a.lip100)} L`,
        couleur: couleurRole(a.categorie),
      })),
  ], [catalogue.data, dejaChezMoi]);

  const entrerInventaire = () => {
    envoyer.reset();
    /* ON NE REPART DE ZERO QUE S'IL N'Y A RIEN EN COURS.
       Avant, revenir sur cet onglet rappelait `stocksInitiaux` : un inventaire
       de trente articles disparaissait parce qu'on etait alle verifier une
       quantite dans l'onglet Stock. Rien ne prevenait, et rien ne permettait
       de le recuperer. Repartir de zero reste possible — c'est le bouton
       « Reinitialiser », en bas, et c'est un geste qu'on decide. */
    if (Object.keys(saisies).length === 0) {
      setSaisies(stocksInitiaux(tous));
      setVus({});
    }
    setOuvert(null);
    setMode('inventaire');
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
              onPress={() => setMode('stock')}
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

        {supprimer.isError && (
          <View style={s.alerte}>
            <Discret style={{ color: C.erreur, fontSize: T.petit, lineHeight: 17 }}>
              {supprimer.error.message}
            </Discret>
          </View>
        )}

        {/* La création se fait en deux temps : l'aliment, puis sa quantité.
            Si le second échoue, le premier est déjà passé — le taire laisserait
            croire que rien n'a été fait, et l'utilisateur recréerait un
            doublon. On nomme donc précisément ce qui a marché.

            CE MESSAGE NE PARLE QUE DE LA CRÉATION, et il a fallu une panne
            pour s'en assurer. Il écoutait aussi `envoyer`, la mutation de
            l'inventaire complet : le 14 août 2026, un inventaire de quarante
            lignes a échoué et l'écran a répondu « L'aliment a bien été créé »
            à quelqu'un qui n'avait rien créé. Une bannière qui affirme un fait
            doit dépendre du seul geste qui produit ce fait. */}
        {(definir.isError || poserQuantite.isError) && (
          <View style={s.alerte}>
            <Discret style={{ color: C.erreur, fontSize: T.petit, lineHeight: 17 }}>
              L'aliment a bien été créé, mais sa quantité n'a pas pu être posée :
              {' '}{(definir.error ?? poserQuantite.error)?.message}.
              {' '}Renseigne-la depuis l'inventaire.
            </Discret>
          </View>
        )}

        {/* L'INVENTAIRE, PENDANT ET APRÈS — ICI ET NULLE PART AILLEURS.
            Dans l'en-tête et non dans le pied du mode inventaire : l'envoi
            continue quand on quitte l'écran, et le résultat doit se voir au
            retour, quel que soit le mode où l'on revient. Le chiffre vient du
            serveur, pas d'un compteur local : il survit à la fermeture de
            l'application. */}
        {enCoursDEnvoi && (
          <View style={s.alerte}>
            <Discret style={{ color: C.discret, fontSize: T.petit, lineHeight: 17 }}>
              Inventaire en cours — {suivi.data?.traites ?? 0} / {suivi.data?.total ?? 0}
              {' '}ligne(s). Tu peux quitter l'écran, ça continue tout seul.
            </Discret>
          </View>
        )}

        {inventaireFini && (
          <View style={s.alerte}>
            <Discret
              style={{
                color: echecsInventaire.length > 0 ? C.erreur : C.ok,
                fontSize: T.petit,
                lineHeight: 17,
              }}
            >
              {echecsInventaire.length === 0
                ? `Inventaire appliqué : ${suivi.data?.traites ?? 0} correction(s).`
                : `Inventaire appliqué : `
                  + `${(suivi.data?.traites ?? 0) - echecsInventaire.length} correction(s), `
                  + `${echecsInventaire.length} refusée(s) — `
                  + echecsInventaire.map((e) => e.motif).join(' · ')}
            </Discret>
          </View>
        )}

        {sansPoids.length > 0 && (
          <View style={s.alerte}>
            <Discret style={{ color: C.attenue, fontSize: T.petit, lineHeight: 17 }}>
              {sansPoids.length} produit(s) sans poids connu
              {' ('}{sansPoids.map((a) => `${a.nom} en ${a.unite}`).join(', ')}
              {'). '}
              Les macros sont données pour 100 g : le calculateur les écarte.
              Déclare la conversion dans Grocy — « 1 {sansPoids[0]?.unite} = … g »
              sur la fiche produit — ou passe-les au gramme.
            </Discret>
          </View>
        )}

        {frigo.data?.probleme !== null && frigo.data?.probleme !== undefined && (
          <View style={s.alerte}>
            <Discret style={{ color: C.vif, fontSize: T.normal, lineHeight: 18 }}>
              {frigo.data.probleme}
            </Discret>
          </View>
        )}

        {/* Deux manques, deux conséquences opposées. Un aliment sans macros
            disparaît — on le voit. Un aliment sans fibres reste là et fausse
            en silence une cible exprimée en glucides totaux : c'est le plus
            dangereux des deux, et il mérite sa propre alerte. */}
        {bloquants.length > 0 && (
          <View style={s.alerte}>
            <Discret style={{ color: C.attenue, fontSize: T.petit, lineHeight: 17 }}>
              {bloquants.length} produit(s) Grocy sans valeurs nutritionnelles :
              ils n'apparaissent pas ici et restent invisibles au calculateur.
              Renseigne-les dans Grocy pour les utiliser.
            </Discret>
          </View>
        )}

        {sansFibres.length > 0 && (
          <View style={[s.alerte, { borderColor: C.vif }]}>
            <Discret style={{ color: C.vif, fontSize: T.petit, lineHeight: 17 }}>
              ⚠ {sansFibres.length} aliment(s) sans fibres renseignées :
              {' '}{sansFibres.slice(0, 4).map((p) => p.nom).join(', ')}
              {sansFibres.length > 4 ? '…' : ''}. Ils restent utilisables, mais
              une cible en glucides totaux les compte à zéro fibre et vise trop
              haut, sans rien signaler.
            </Discret>
          </View>
        )}
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
          mode === 'inventaire'
            ? (
              <LigneInventaire
                aliment={item}
                texte={saisies[item.reference] ?? ''}
                vu={vus[item.reference] === true}
                ecart={ecarts.some((l) => l.reference === item.reference)}
                onTexte={(v) => setSaisies((x) => ({ ...x, [item.reference]: v }))}
                onCocher={() => setVus((v) => ({
                  ...v, [item.reference]: !(v[item.reference] === true),
                }))}
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
        )}
      />

      {/* Barre du bas, présente dans les deux modes : c'est elle qui porte
          l'action principale, à portée du pouce. Sa présence constante évite
          que la liste ne se redimensionne au changement de mode. */}
      {mode === 'stock' && peutCreer && (
        <View style={[s.pied, { paddingBottom: E.m + insets.bottom }]}>
          <Bouton onPress={() => { creer.reset(); definir.reset(); setChoixModele(true); }}>
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
              onPress={() => { setSaisies(stocksInitiaux(tous)); setVus({}); }}
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
                onSuccess: () => {
                  setSaisies({});
                  setVus({});
                  setMode('stock');
                },
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

      {/* ---- compte Grocy : création, et correction des macros ---- */}
      <EditeurAliment
        visible={surGrocy && (nouveau !== null || edite !== null)}
        titre={nouveau !== null ? 'Nouvel aliment' : (edite?.nom ?? 'Aliment')}
        aliment={nouveau ?? (edite !== null ? versSaisie(edite) : undefined)}
        enCours={enregistrer.isPending || poserQuantite.isPending}
        erreur={enregistrer.error?.message ?? null}
        /* Le nom ne se saisit qu'à la création : ensuite Grocy en est maître,
           et le changer ici ferait diverger les deux outils. */
        nomModifiable={nouveau !== null}
        quantite={nouveau !== null ? quantiteNouvelle : undefined}
        onQuantiteChange={nouveau !== null ? setQuantiteNouvelle : undefined}
        onFermer={() => { setNouveau(null); setEdite(null); setQuantiteNouvelle(''); }}
        onEnregistrer={(v) => {
          if (nouveau === null && edite === null) return;

          enregistrer.mutate({
            /* Vide = création : l'API pose le produit dans Grocy avant
               d'écrire ses valeurs. */
            reference: edite?.reference ?? '',
            nom: v.nom.trim(),
            categorie: v.categorie,
            kcal100: v.kcal100,
            prot100: v.prot100,
            gluc100: v.gluc100,
            lip100: v.lip100,
            fibres100: v.fibres100,
            ratio: v.ratio,
            peseeAvant: v.peseeAvant ?? null,
            peseeApres: v.peseeApres ?? null,
          }, {
            onSuccess: (rendu) => {
              if (nouveau === null) { setEdite(null); return; }

              const q = parseFloat(quantiteNouvelle.replace(',', '.'));
              setNouveau(null);
              setQuantiteNouvelle('');

              /* La quantité passe par l'INVENTAIRE, pas par `/mon-frigo/stock`
                 qui est réservé aux comptes tenus en base et répond 409 ici.

                 Ce n'est pas qu'une question de route : côté Grocy, poser une
                 quantité EST un inventaire — on déclare le poids réellement
                 présent, Grocy en déduit l'écart. C'est exactement ce qu'on
                 veut à la création : le produit passe de « inconnu » à « j'en
                 ai tant ».

                 On l'envoie même à zéro. C'est cet appel qui crée la ligne de
                 stock, donc qui rattache le produit à un emplacement — sans
                 lui il resterait sous « Sans emplacement », tout en bas. */
              poserQuantite.mutate({
                reference: rendu.reference,
                quantite: Number.isNaN(q) ? 0 : q,
              });
            },
          });
        }}
      />

      {/* ---- compte ordinaire : création et correction ---- */}
      <EditeurAliment
        visible={modifiable && (nouveau !== null || edite !== null)}
        titre={nouveau !== null ? 'Nouvel aliment' : (edite?.nom ?? 'Aliment')}
        aliment={nouveau ?? (edite !== null ? versSaisie(edite) : undefined)}
        enCours={creer.isPending || majAliment.isPending || definir.isPending}
        erreur={(creer.error ?? majAliment.error)?.message ?? null}
        // la quantité ne se saisit qu'à la création : ailleurs elle se corrige
        // dans l'inventaire, seul endroit où elle s'écrit
        quantite={nouveau !== null ? quantiteNouvelle : undefined}
        onQuantiteChange={nouveau !== null ? setQuantiteNouvelle : undefined}
        onFermer={() => { setNouveau(null); setEdite(null); setQuantiteNouvelle(''); }}
        onEnregistrer={(v) => {
          const corps = {
            nom: v.nom.trim(),
            categorie: v.categorie,
            kcal100: v.kcal100,
            prot100: v.prot100,
            gluc100: v.gluc100,
            lip100: v.lip100,
            fibres100: v.fibres100,
            ratio: v.ratio,
            peseeAvant: v.peseeAvant ?? null,
            peseeApres: v.peseeApres ?? null,
          };

          if (nouveau !== null) {
            creer.mutate(corps, {
              onSuccess: (cree) => {
                const q = parseFloat(quantiteNouvelle.replace(',', '.'));

                setNouveau(null);
                setQuantiteNouvelle('');

                // On pose la quantité MÊME à zéro : c'est cet appel qui crée
                // la ligne de stock, donc qui rattache l'aliment à un
                // emplacement. Sans lui il resterait sous « Sans emplacement »,
                // tout en bas, jusqu'au premier inventaire.
                definir.mutate({
                  alimentId: cree.id,
                  quantite: Number.isNaN(q) ? 0 : q,
                });
              },
            });

            return;
          }

          if (edite === null) return;

          majAliment.mutate(
            { id: Number(edite.reference.split(':')[1]), ...corps },
            { onSuccess: () => setEdite(null) },
          );
        }}
      />

      {/* ---- point de départ d'une création ---- */}
      <ChoixDansListe
        visible={choixModele}
        titre="Partir d'un aliment de référence"
        elements={modelesPossibles}
        onFermer={() => setChoixModele(false)}
        onChoisir={(id) => {
          // « Créer de zéro » porte l'identifiant 0, qu'aucun aliment n'a
          const modele = (catalogue.data ?? []).find((a) => a.id === id);

          setQuantiteNouvelle('');
          // « ?? null » n'est pas cosmétique : l'API omet les champs nuls, ils
          // arrivent donc en « undefined », que l'éditeur ne distingue pas
          // d'une valeur absente de son formulaire.
          setNouveau(modele === undefined ? ALIMENT_VIDE : {
            nom: modele.nom,
            categorie: modele.categorie,
            kcal100: modele.kcal100,
            prot100: modele.prot100,
            gluc100: modele.gluc100,
            lip100: modele.lip100,
            fibres100: modele.fibres100 ?? null,
            ratio: modele.ratio,
            peseeAvant: modele.peseeAvant ?? null,
            peseeApres: modele.peseeApres ?? null,
          });
        }}
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

/* ------------------------------------------------------------- mode stock */

function LigneStock({
  aliment, ouvert, modifiable, onOuvrir, onCorriger, onSupprimer,
}: {
  aliment: AlimentDisponible;
  ouvert: boolean;
  modifiable: boolean;
  onOuvrir: () => void;
  onCorriger: () => void;
  onSupprimer: () => void;
}) {
  const controle = controler({
    kcal: aliment.kcal100, prot: aliment.prot100, gluc: aliment.gluc100,
    lip: aliment.lip100, fibres: aliment.fibres100,
  });
  /* Un féculent qui gonfle se pèse sec, tout le reste se pèse cru. C'est la
     seule nuance de vocabulaire qui reste : le geste est le même. */
  const sec = aliment.categorie === 'fec' && aliment.ratio > 1;

  return (
    <Carte style={[s.carte, ouvert && { borderColor: C.vif }]}>
      <Pressable onPress={onOuvrir} style={s.ligne}>
        <View style={[s.pastille, { backgroundColor: couleurRole(aliment.categorie) }]} />
        <View style={{ flex: 1 }}>
          <Texte numberOfLines={2}>{aliment.nom}</Texte>
          <Discret style={{ fontSize: T.petit }} numberOfLines={1}>
            {nb(aliment.kcal100)} kcal · {nb(aliment.prot100)} P
            {' · '}{nb(aliment.gluc100)} G · {nb(aliment.lip100)} L
          </Discret>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Chiffre taille={N.petit} couleur={aliment.stock > 0 ? C.vif : C.discret}>
            {nb(aliment.stock)} {aliment.unite}
          </Chiffre>
          {aliment.unite !== 'g' && aliment.grammesParUnite !== null && (
            <Discret style={{ fontSize: T.minuscule }}>
              soit {nb(aliment.stock * aliment.grammesParUnite)} g
            </Discret>
          )}
          {aliment.unite === 'g' && aliment.ratio !== 1 && (
            <Discret style={{ fontSize: T.minuscule }}>{sec ? 'poids sec' : 'poids cru'}</Discret>
          )}
        </View>
      </Pressable>

      {ouvert && (
        <View style={s.detail}>
          <View style={s.mesures}>
            <Mesure cle="Pour 100 g" valeur={`${nb(aliment.kcal100)} kcal`} />
            <Mesure cle="Protéines" valeur={`${nb(aliment.prot100)} g`} />
            <Mesure cle="Glucides" valeur={`${nb(aliment.gluc100)} g`} />
            <Mesure cle="Lipides" valeur={`${nb(aliment.lip100)} g`} />
            {aliment.fibres100 !== null && aliment.fibres100 !== undefined && (
              <Mesure cle="Fibres" valeur={`${nb(aliment.fibres100)} g`} />
            )}
            <Mesure
              cle="À la cuisson"
              valeur={aliment.ratio === 1
                ? 'poids inchangé'
                : `100 g → ${Math.round(aliment.ratio * 100)} g`}
            />
          </View>

          {controle.verdict !== 'coherent' && (
            <Discret style={{ color: C.vif, fontSize: T.petit, lineHeight: 16 }}>
              {controle.message}
            </Discret>
          )}

          <Discret style={{ fontSize: T.petit, lineHeight: 16 }}>
            La quantité se modifie depuis l'inventaire.
            {modifiable ? '' : ' Cet aliment vient de Grocy : sa fiche s’y modifie aussi.'}
          </Discret>

          <View style={{ flexDirection: 'row', gap: E.s }}>
            <Bouton variante="contour" onPress={onCorriger} style={{ flex: 1 }}>
              Corriger les valeurs
            </Bouton>
            {/* Supprimer reste réservé aux comptes lisant la base : un produit
                Grocy se supprime dans Grocy. */}
            {modifiable && (
              <Bouton variante="discret" onPress={onSupprimer}>
                <Discret style={{ color: C.erreur }}>Supprimer</Discret>
              </Bouton>
            )}
          </View>
        </View>
      )}
    </Carte>
  );
}

/* -------------------------------------------------------- mode inventaire */

function LigneInventaire({
  aliment, texte, vu, ecart, onTexte, onCocher,
}: {
  aliment: AlimentDisponible;
  texte: string;
  vu: boolean;
  ecart: boolean;
  onTexte: (v: string) => void;
  onCocher: () => void;
}) {
  return (
    <Carte style={[s.carteInv, vu && s.carteVue, ecart && { borderColor: C.vif }]}>
      <Pressable
        onPress={onCocher}
        style={s.case_}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: vu }}
        accessibilityLabel={`${aliment.nom} vérifié`}
      >
        <View style={[s.carre, vu && { backgroundColor: C.ok, borderColor: C.ok }]}>
          {vu && <Texte style={{ color: C.fond, fontSize: T.petit }}>✓</Texte>}
        </View>
      </Pressable>

      <View style={{ flex: 1 }}>
        <Texte
          numberOfLines={2}
          style={[{ fontSize: T.normal }, vu && s.barre]}
        >
          {aliment.nom}
        </Texte>
        {ecart && (
          <Discret style={{ fontSize: T.petit, color: C.vif }}>
            était {nb(aliment.stock)} {aliment.unite}
          </Discret>
        )}
      </View>

      <Champ valeur={texte} onChange={onTexte} numerique placeholder="—" style={s.saisie} />

      {/* L'unité vit à côté du champ, pas dedans : à l'intérieur elle se fait
          écraser par le nombre dès que celui-ci est long. */}
      <Texte style={s.unite}>{aliment.unite}</Texte>
    </Carte>
  );
}

const Mesure = ({ cle, valeur }: { cle: string; valeur: string }) => (
  <View style={s.mesure}>
    <Discret style={{ fontSize: T.minuscule }}>{cle}</Discret>
    <Texte style={{ fontSize: T.normal, fontFamily: P.chiffre }}>{valeur}</Texte>
  </View>
);

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

  alerte: { backgroundColor: C.vifFond, borderRadius: R.s, padding: E.s },
  page: { padding: E.m, gap: 6, flexGrow: 1, paddingBottom: E.xl },
  section: {
    fontFamily: P.titre, fontSize: T.normal, letterSpacing: 1.2, textTransform: 'uppercase',
    marginTop: E.m, marginBottom: E.xs,
  },

  carte: { padding: 0, overflow: 'hidden' },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: E.m, padding: E.m, minHeight: 56 },
  pastille: { width: 4, height: 30, borderRadius: 3, opacity: 0.7 },
  detail: {
    padding: E.m, paddingTop: 0, gap: E.m,
    borderTopWidth: 1, borderTopColor: C.ligne,
  },
  mesures: { flexDirection: 'row', flexWrap: 'wrap', gap: E.m },
  mesure: { minWidth: 78 },

  carteInv: { flexDirection: 'row', alignItems: 'center', gap: E.s, padding: E.s },
  carteVue: { opacity: 0.66 },
  barre: { textDecorationLine: 'line-through' },
  // 6 px de marge autour d'un carre de 22 donnaient 34 px de cible ; 11 en
  // donnent 44, sans changer le carre lui-meme.
  case_: { padding: 11 },
  carre: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: C.ligne,
    alignItems: 'center', justifyContent: 'center',
  },
  saisie: { width: 96 },
  unite: { fontSize: T.normal, color: C.attenue, minWidth: 30 },

  /* Barre d'envoi collée en bas. Le retrait vient de useSafeAreaInsets :
     sans lui, Android la glisse sous sa barre de navigation. */
  pied: {
    padding: E.m, gap: E.s,
    borderTopWidth: 1, borderTopColor: C.ligne, backgroundColor: C.fond,
  },
});
