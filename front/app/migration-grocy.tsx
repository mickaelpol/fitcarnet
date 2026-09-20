import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  useAlimentsReference, useMigrationGrocy, useMigrerAliment, useTerminerMigration,
} from '@/api/hooks';
import type { AlimentAMigrer } from '@/api/types';
import { Bouton, Carte, Champ, Chargement, Discret, Erreur, Texte, Titre } from '@/composants/base';
import { ChampRattachement } from '@/composants/champRattachement';
import { Confirmer } from '@/composants/confirmer';
import { nombreSaisi } from '@/calcul/saisieNombre';
import { C, E, R, T, nb } from '@/theme';

/**
 * QUITTER GROCY : un produit à la fois.
 *
 * But donné par le propriétaire du projet le 20 septembre 2026 : *« migrer de
 * Grocy vers la base de données de l'application car je ne veux plus utiliser
 * Grocy »*. Le rattachement au catalogue CIQUAL se fait dans le même geste —
 * c'est le seul moment où quelqu'un regarde ses soixante aliments un par un.
 *
 * TROIS RÈGLES QUI TIENNENT TOUT CET ÉCRAN :
 *
 *  1. **On ne supprime rien dans Grocy.** On copie. La personne vérifie, tourne
 *     sur la base le temps qu'elle veut, et c'est elle qui éteint Grocy. Une
 *     migration qui détruit sa source n'a pas de marche arrière.
 *  2. **L'état vient du serveur.** Soixante-deux aliments ne se font pas d'une
 *     traite : on ferme l'onglet, le téléphone se verrouille. `dejaEnBase` dit
 *     où l'on s'était arrêté ; un compteur en mémoire ferait tout recommencer.
 *  3. **Aucune valeur n'est inventée.** Les produits dont Grocy ne sait rien —
 *     huit sur soixante-deux, mesuré — demandent de lire l'étiquette. L'écran
 *     le dit et refuse d'avancer sans, plutôt que d'écrire des zéros que
 *     personne n'a saisis (règles 6 et 7).
 */
export default function MigrationGrocy() {
  const router = useRouter();
  const etat = useMigrationGrocy();
  const migrer = useMigrerAliment();
  const terminer = useTerminerMigration();

  const [ouvert, setOuvert] = useState<string | null>(null);
  const [aBasculer, setABasculer] = useState(false);

  if (etat.isLoading) return <Chargement texte="Lecture de ton frigo Grocy…" />;
  if (etat.isError) {
    return <Erreur message={etat.error.message} onReessayer={() => void etat.refetch()} />;
  }

  const donnees = etat.data;
  const faits = new Set(donnees?.dejaEnBase ?? []);
  const tous = donnees?.aRattacher ?? [];
  const restants = tous.filter((a) => !faits.has(a.nom));

  if (donnees?.source === 'base') {
    return (
      <ScrollView contentContainerStyle={s.page}>
        <Titre>Migration terminée</Titre>
        <Carte>
          <Texte>Ton frigo est maintenant tenu dans la base.</Texte>
          {/* ON RAPPELLE QUE GROCY EST INTACT. Quelqu'un qui vient de basculer
              se demande s'il peut fermer Grocy — et la réponse honnête est
              « quand tu auras vérifié », pas « tout de suite ». */}
          <Discret style={s.aide}>
            Rien n'a été supprimé dans Grocy : tout y est encore. Prends le temps
            de vérifier ton frigo ici avant de l'éteindre.
          </Discret>
          <Bouton onPress={() => router.replace('/frigo')}>Aller à mon frigo</Bouton>
        </Carte>
      </ScrollView>
    );
  }

  if (donnees?.probleme != null) {
    return <Erreur message={donnees.probleme} onReessayer={() => void etat.refetch()} />;
  }

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Titre>Quitter Grocy</Titre>

      <Carte style={{ gap: E.s }}>
        <Texte>
          {faits.size} sur {tous.length} aliments sont passés dans la base.
        </Texte>
        {/* PAS DE MARKDOWN DANS DU JSX. Écrit `**Rien n'est supprimé**` d'abord,
            et les astérisques s'affichaient telles quelles à l'écran — vu dans
            le navigateur, pas deviné. React Native rend du texte, pas du
            Markdown : l'emphase se fait avec un `<Texte>`. */}
        <Discret style={s.aide}>
          Chaque aliment se traite seul, et tu peux t'arrêter quand tu veux :
          tu reprendras ici.{' '}
          <Texte style={s.aide}>Rien n'est supprimé dans Grocy</Texte> — on copie.
        </Discret>
        {restants.length === 0 && (
          <Bouton onPress={() => setABasculer(true)}>
            Tout est passé : basculer mon frigo sur la base
          </Bouton>
        )}
      </Carte>

      {restants.length === 0 && tous.length > 0 && (
        <Discret style={s.aide}>
          Tu peux aussi basculer plus tard — le bouton restera ici.
        </Discret>
      )}

      {restants.map((a) => (
        <LigneAMigrer
          key={a.reference}
          aliment={a}
          emplacements={donnees?.emplacements ?? []}
          ouvert={ouvert === a.reference}
          onOuvrir={() => setOuvert(ouvert === a.reference ? null : a.reference)}
          onMigrer={(corps) => migrer.mutate(corps, { onSuccess: () => setOuvert(null) })}
          enCours={migrer.isPending}
          erreur={migrer.error?.message ?? null}
        />
      ))}

      {/* CE QUI EST DÉJÀ PASSÉ RESTE VISIBLE, et c'est voulu : voir la liste
          fondre est ce qui rend une soirée de saisie tenable. */}
      {faits.size > 0 && (
        <Discret style={s.aide}>
          Déjà dans la base : {[...faits].slice(0, 8).join(', ')}
          {faits.size > 8 ? `… et ${faits.size - 8} autres` : ''}.
        </Discret>
      )}

      <Confirmer
        visible={aBasculer}
        titre="Basculer ton frigo sur la base ?"
        message={'L\'application lira désormais tes aliments dans sa propre base, '
          + 'et plus dans Grocy. Rien n\'est supprimé là-bas : tout y reste, et '
          + 'on peut revenir en arrière.'}
        onConfirmer={() => { terminer.mutate(); setABasculer(false); }}
        onAnnuler={() => setABasculer(false)}
      />
    </ScrollView>
  );
}

/**
 * Une ligne : ce que Grocy sait, ce qu'il faut compléter, et le rattachement.
 *
 * L'ÉTAT DE SAISIE VIT DANS LA LIGNE, pas dans l'écran. Soixante-deux formulaires
 * ouverts ensemble dans un seul état seraient réinitialisés à chaque réponse du
 * serveur — et on perdrait la saisie en cours sur les soixante et un autres.
 */
function LigneAMigrer({
  aliment, emplacements, ouvert, onOuvrir, onMigrer, enCours, erreur,
}: {
  aliment: AlimentAMigrer;
  emplacements: string[];
  ouvert: boolean;
  onOuvrir: () => void;
  onMigrer: (corps: Record<string, unknown>) => void;
  enCours: boolean;
  erreur: string | null;
}) {
  const [textes, setTextes] = useState<Record<string, string>>(() => ({
    kcal100: aliment.kcal100 != null ? String(aliment.kcal100) : '',
    prot100: aliment.prot100 != null ? String(aliment.prot100) : '',
    gluc100: aliment.gluc100 != null ? String(aliment.gluc100) : '',
    lip100: aliment.lip100 != null ? String(aliment.lip100) : '',
    fibres100: aliment.fibres100 != null ? String(aliment.fibres100) : '',
  }));
  const [categorie, setCategorie] = useState(aliment.categorie ?? '');
  const [reference, setReference] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');

  const resultats = useAlimentsReference(recherche);

  const valeur = (cle: string) => nombreSaisi(textes[cle] ?? '');

  /* LES QUATRE MACROS ET LA CATÉGORIE SONT OBLIGATOIRES, les fibres non. Le
     bouton reste désactivé tant qu'il manque quelque chose : refuser à l'envoi
     après avoir tout retapé serait la pire des façons de le dire. */
  const pret = categorie.trim() !== ''
    && ['kcal100', 'prot100', 'gluc100', 'lip100'].every((c) => valeur(c) !== null);

  const envoyer = () => {
    if (!pret || enCours) return;
    onMigrer({
      nom: aliment.nom,
      categorie,
      kcal100: valeur('kcal100'),
      prot100: valeur('prot100'),
      gluc100: valeur('gluc100'),
      lip100: valeur('lip100'),
      fibres100: valeur('fibres100'),
      ratio: aliment.ratio ?? 1,
      peseeAvant: aliment.peseeAvant ?? null,
      peseeApres: aliment.peseeApres ?? null,
      referenceCiqual: reference ?? '',
      stock: aliment.stock,
      emplacement: aliment.emplacement ?? '',
    });
  };

  return (
    <Carte style={[s.carte, !aliment.valeursConnues && { borderColor: C.vif }]}>
      <View style={s.entete}>
        <View style={{ flex: 1 }}>
          <Texte numberOfLines={2}>{aliment.nom}</Texte>
          <Discret style={{ fontSize: T.petit }}>
            {nb(aliment.stock)} {aliment.unite ?? 'g'}
            {aliment.emplacement != null ? ` · ${aliment.emplacement}` : ''}
            {aliment.valeursConnues ? '' : ' · valeurs à renseigner'}
          </Discret>
        </View>
        <Bouton variante="contour" onPress={onOuvrir}>{ouvert ? 'Fermer' : 'Traiter'}</Bouton>
      </View>

      {ouvert && (
        <View style={{ gap: E.s, marginTop: E.s }}>
          {!aliment.valeursConnues && (
            <Discret style={[s.aide, { color: C.vif }]}>
              Grocy ne connaît aucune valeur pour ce produit. Prends son paquet :
              ces chiffres seront ceux de TON aliment, pas une moyenne.
            </Discret>
          )}

          <ChampRattachement
            valeur={reference}
            nomAliment={aliment.nom}
            kcalSaisies={valeur('kcal100')}
            recherche={recherche}
            resultats={resultats.data ?? []}
            onRecherche={setRecherche}
            onChange={(code, choisi) => {
              setReference(code);
              /* LA CATÉGORIE SE PROPOSE, LES MACROS JAMAIS. Le sous-groupe
                 CIQUAL dit de quelle famille est l'aliment — c'est une
                 classification, pas une mesure. Ses calories, elles, sont
                 celles d'un produit générique : les recopier écrirait un
                 chiffre que personne n'a lu sur un paquet. */
              if (choisi !== null && categorie.trim() === '') {
                setCategorie(categorieDepuis(choisi.sousgroupeCode));
              }
            }}
          />

          <Champ
            etiquette="Catégorie"
            valeur={categorie}
            onChange={setCategorie}
            placeholder="prot, fec, leg, ole, huile, lait, fruit, autre"
          />

          <View style={s.paire}>
            <Champ etiquette="Calories" unite="kcal" numerique style={{ flex: 1 }}
              valeur={textes.kcal100 ?? ''}
              onChange={(v) => setTextes((t) => ({ ...t, kcal100: v }))} placeholder="à saisir" />
            <Champ etiquette="Protéines" unite="g" numerique style={{ flex: 1 }}
              valeur={textes.prot100 ?? ''}
              onChange={(v) => setTextes((t) => ({ ...t, prot100: v }))} placeholder="à saisir" />
          </View>
          <View style={s.paire}>
            <Champ etiquette="Glucides" unite="g" numerique style={{ flex: 1 }}
              valeur={textes.gluc100 ?? ''}
              onChange={(v) => setTextes((t) => ({ ...t, gluc100: v }))} placeholder="à saisir" />
            <Champ etiquette="Lipides" unite="g" numerique style={{ flex: 1 }}
              valeur={textes.lip100 ?? ''}
              onChange={(v) => setTextes((t) => ({ ...t, lip100: v }))} placeholder="à saisir" />
          </View>
          <Champ etiquette="Fibres (facultatif)" unite="g" numerique
            valeur={textes.fibres100 ?? ''}
            onChange={(v) => setTextes((t) => ({ ...t, fibres100: v }))} placeholder="—" />

          {erreur != null && <Discret style={[s.aide, { color: C.erreur }]}>{erreur}</Discret>}

          <Bouton onPress={envoyer} desactive={!pret || enCours}>
            {pret ? 'Copier dans la base' : 'Catégorie et quatre macros obligatoires'}
          </Bouton>
        </View>
      )}
    </Carte>
  );
}

/**
 * La catégorie du projet qui correspond à un sous-groupe CIQUAL.
 *
 * PROPOSITION, PAS DÉCISION : elle pré-remplit un champ que la personne peut
 * changer. Le code CIQUAL commence par le groupe (« 09 » = viandes), et c'est
 * assez pour une première approximation.
 *
 * Elle ne couvre volontairement pas tout : ce qu'on ne sait pas reste vide, et
 * le bouton d'envoi attend. Une catégorie devinée de travers classerait un
 * aliment dans le mauvais rôle du calculateur, en silence.
 */
function categorieDepuis(sousgroupeCode: string): string {
  const groupe = sousgroupeCode.slice(0, 2);

  switch (groupe) {
    case '01': return 'autre';   // entrées et plats composés
    case '02': return 'prot';    // viandes, œufs, poissons
    case '03': return 'fec';     // produits céréaliers
    case '04': return 'lait';    // laits et produits laitiers
    case '09': return 'prot';    // viandes et charcuteries
    case '11': return 'prot';    // poissons et fruits de mer
    case '12': return 'lait';
    case '13': return 'huile';   // huiles et graisses
    case '15': return 'ole';     // fruits à coque et graines
    case '20': return 'leg';     // légumes
    case '13000': return 'huile';
    default: return '';
  }
}

const s = StyleSheet.create({
  page: { padding: E.m, gap: E.m, paddingBottom: E.xl },
  carte: { gap: E.xs, borderWidth: 1, borderColor: C.ligne, borderRadius: R.m, padding: E.m },
  entete: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  paire: { flexDirection: 'row', gap: E.s },
  aide: { fontSize: T.petit, lineHeight: 17, color: C.attenue },
});
