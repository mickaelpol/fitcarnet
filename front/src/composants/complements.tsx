import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  useComplements, useEnregistrerComplement, useSupprimerComplement,
} from '@/api/hooks';
import type { Complement } from '@/api/types';
import { NOM_REPAS, REPAS, type Repas } from '@/solveur/composer';
import { Bouton, Carte, Champ, Discret, Texte } from './base';
import { C, E, P, R, T, TOUCHE } from '@/theme';

/**
 * LES COMPLÉMENTS SONT DES CONSIGNES, PAS DES PRISES.
 *
 * Une ligne ne dit pas « pris ce matin », elle dit « avec le repas du matin,
 * 5 g de créatine ». Elle vaut tous les jours jusqu'à ce qu'on la change —
 * comme un objectif macro, et pour la même raison : ce qu'on veut savoir en
 * préparant une assiette, c'est ce qu'il faut y ajouter, pas ce qu'on a fait
 * hier.
 *
 * CE QUI N'EST PAS ICI, ET C'EST VOULU : tout ce qui a des calories. Une whey,
 * c'est 24 g de protéines — sa place est dans le frigo, où le calculateur la
 * voit et l'ajuste. La mettre des deux côtés, c'est se garantir de la compter
 * deux fois ou zéro fois, sans jamais savoir laquelle.
 */

/** Les compléments d'un repas donné, triés par nom. */
export function complementsDuRepas(
  tous: Complement[] | undefined,
  repas: Repas,
): Complement[] {
  return (tous ?? [])
    .filter((c) => c.repas === repas)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/** « 5 g Créatine · 400 mg Magnésium » — la forme courte, pour un rappel. */
export const resumeComplements = (liste: Complement[]): string =>
  liste.map((c) => `${nombreLisible(c.quantite)} ${c.unite} ${c.nom}`).join(' · ');

/* `quantite` arrive en chaîne décimale — « 5.00 ». L'afficher tel quel donne
   « 5.00 g de créatine », ce que personne n'écrit. On enlève les zéros
   inutiles et on rend la virgule française. */
export function nombreLisible(decimale: string): string {
  const n = Number(decimale);

  return Number.isFinite(n) ? String(n).replace('.', ',') : decimale;
}

/**
 * Le rappel court, à poser sous les macros d'un repas.
 *
 * Ne rend RIEN quand il n'y a pas de complément pour ce repas. Une ligne
 * « aucun complément » sur quatre cartes déjà denses serait du bruit répété
 * quatre fois pour ne rien dire.
 */
export function RappelComplements({ repas }: { repas: Repas }) {
  const complements = useComplements();
  const liste = complementsDuRepas(complements.data, repas);

  if (liste.length === 0) return null;

  return (
    <Discret style={{ fontSize: T.petit, color: C.attenue }}>
      + {resumeComplements(liste)}
    </Discret>
  );
}

/**
 * Le détail, à l'ouverture d'un repas — à côté des quantités à peser.
 *
 * Ici on affiche même quand la liste est vide : on est dans l'écran où l'on
 * prépare vraiment l'assiette, et « rien à ajouter » est une réponse utile.
 * Sur la carte fermée ce serait du bruit ; ici c'est une confirmation.
 */
export function DetailComplements({ repas }: { repas: Repas }) {
  const complements = useComplements();
  const liste = complementsDuRepas(complements.data, repas);

  if (complements.isLoading) return null;

  return (
    <View style={{ gap: E.xs }}>
      <Discret style={s.etiquette}>Compléments</Discret>
      {liste.length === 0 ? (
        <Discret style={{ fontSize: T.petit }}>Rien à ajouter à ce repas.</Discret>
      ) : (
        liste.map((c) => (
          <View key={c.id} style={s.ligneDetail}>
            <Texte style={{ flex: 1 }}>{c.nom}</Texte>
            <Texte style={{ fontFamily: P.fort }}>
              {nombreLisible(c.quantite)} {c.unite}
            </Texte>
          </View>
        ))
      )}
    </View>
  );
}

/**
 * Les compléments d'une boîte, dans l'écran « Cuisiner ».
 *
 * MÊME FORME QUE « à ajouter au moment de manger », juste au-dessous, parce
 * que c'est le même geste : ce qui ne se cuit pas et ne se range pas dans une
 * boîte cinq jours à l'avance.
 *
 * Ne rend rien quand il n'y a pas de complément : une boîte porte déjà son
 * titre, ses convives et ses lignes, et un « aucun complément » répété sur
 * chaque boîte de la semaine serait du bruit à chaque ligne.
 */
export function LigneComplements({ repas }: { repas: Repas }) {
  const complements = useComplements();
  const liste = complementsDuRepas(complements.data, repas);

  if (liste.length === 0) return null;

  return (
    <>
      <Discret style={s.colTitre}>compléments</Discret>
      {liste.map((c) => (
        <View key={c.id} style={s.ligneDetail}>
          <View style={s.puce} />
          <Discret style={{ flex: 1 }}>{c.nom}</Discret>
          <Discret style={{ color: C.vif }}>
            {nombreLisible(c.quantite)} {c.unite}
          </Discret>
        </View>
      ))}
    </>
  );
}

/**
 * L'écran de gestion, dans l'onglet Compte.
 *
 * LE FORMULAIRE RESTE OUVERT APRÈS UN AJOUT, et le champ « repas » garde sa
 * valeur. On ajoute rarement un seul complément : on s'assoit une fois, on
 * saisit sa routine, et redemander le moment à chaque ligne ferait quatre
 * gestes de plus pour rien.
 */
export function MesComplements() {
  const complements = useComplements();
  const enregistrer = useEnregistrerComplement();
  const supprimer = useSupprimerComplement();

  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState('');
  const [quantite, setQuantite] = useState('');
  const [unite, setUnite] = useState('g');
  const [repas, setRepas] = useState<Repas>('R1');

  const q = Number(quantite.replace(',', '.'));
  const quantiteValide = quantite.trim() !== '' && Number.isFinite(q) && q > 0;
  const complet = nom.trim() !== '' && unite.trim() !== '' && quantiteValide;

  /* Le doublon est refusé par la base — un index unique sur (compte, nom,
     repas). On le dit AVANT l'envoi : découvrir un refus après coup, sur un
     geste aussi simple, donne l'impression que l'application est cassée. */
  const enDouble = useMemo(
    () => complementsDuRepas(complements.data, repas)
      .some((c) => c.nom.trim().toLowerCase() === nom.trim().toLowerCase()),
    [complements.data, repas, nom],
  );

  const parRepas = useMemo(
    () => REPAS.map((r) => ({ repas: r, liste: complementsDuRepas(complements.data, r) }))
      .filter((g) => g.liste.length > 0),
    [complements.data],
  );

  return (
    <Carte style={{ gap: E.s }}>
      <Texte style={{ fontFamily: P.fort }}>Compléments alimentaires</Texte>
      <Discret style={{ fontSize: T.petit, lineHeight: 17 }}>
        Ce qui s'avale : créatine, magnésium, vitamine D. Ce qui se mange —
        une whey, un gainer — reste un aliment du frigo, pour que le
        calculateur en tienne compte.
      </Discret>

      {parRepas.length === 0 && !ouvert && (
        <Discret style={{ fontSize: T.petit }}>Aucun complément pour l'instant.</Discret>
      )}

      {parRepas.map(({ repas: r, liste }) => (
        <View key={r} style={{ gap: E.xs }}>
          <Discret style={s.etiquette}>{NOM_REPAS[r]}</Discret>
          {liste.map((c) => (
            <View key={c.id} style={s.ligne}>
              <Texte style={{ flex: 1 }}>{c.nom}</Texte>
              <Texte style={{ fontFamily: P.fort }}>
                {nombreLisible(c.quantite)} {c.unite}
              </Texte>
              <Pressable
                onPress={() => supprimer.mutate(c.id)}
                disabled={supprimer.isPending}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Supprimer ${c.nom} du repas ${NOM_REPAS[r]}`}
                style={s.retirer}
              >
                <Texte style={{ color: C.erreur, fontFamily: P.fort }}>×</Texte>
              </Pressable>
            </View>
          ))}
        </View>
      ))}

      {supprimer.isError && (
        <Discret style={{ color: C.erreur, fontSize: T.petit }}>
          {supprimer.error.message}
        </Discret>
      )}

      {!ouvert ? (
        <Bouton variante="contour" onPress={() => setOuvert(true)}>
          + Ajouter un complément
        </Bouton>
      ) : (
        <View style={{ gap: E.s }}>
          <View style={{ flexDirection: 'row', gap: E.s }}>
            <Champ
              valeur={quantite}
              onChange={setQuantite}
              etiquette="Quantité"
              placeholder="5"
              numerique
              style={{ flex: 1 }}
            />
            <Champ
              valeur={unite}
              onChange={setUnite}
              etiquette="Unité"
              placeholder="g"
              style={{ flex: 1 }}
            />
          </View>

          <Champ
            valeur={nom}
            onChange={setNom}
            etiquette="Complément"
            placeholder="Créatine"
          />

          <View style={{ gap: E.xs }}>
            <Discret style={s.etiquette}>Avec quel repas</Discret>
            <View style={{ flexDirection: 'row', gap: E.xs }}>
              {REPAS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRepas(r)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: repas === r }}
                  style={[s.moment, repas === r && s.momentActif]}
                >
                  <Discret style={repas === r ? s.momentTexteActif : s.momentTexte}>
                    {NOM_REPAS[r]}
                  </Discret>
                </Pressable>
              ))}
            </View>
          </View>

          {enDouble && nom.trim() !== '' && (
            <Discret style={{ color: C.erreur, fontSize: T.petit }}>
              « {nom.trim()} » est déjà noté pour {NOM_REPAS[repas]}.
            </Discret>
          )}
          {quantite.trim() !== '' && !quantiteValide && (
            <Discret style={{ color: C.erreur, fontSize: T.petit }}>
              Une quantité doit être un nombre supérieur à zéro.
            </Discret>
          )}
          {enregistrer.isError && (
            <Discret style={{ color: C.erreur, fontSize: T.petit }}>
              {enregistrer.error.message}
            </Discret>
          )}

          <View style={{ flexDirection: 'row', gap: E.s }}>
            <Bouton
              variante="contour"
              onPress={() => { setOuvert(false); setNom(''); setQuantite(''); enregistrer.reset(); }}
              style={{ flex: 1 }}
            >
              Annuler
            </Bouton>
            <Bouton
              onPress={() => enregistrer.mutate(
                { nom: nom.trim(), quantite: q, unite: unite.trim(), repas },
                {
                  /* Seuls le nom et la quantité repartent à zéro : l'unité et
                     le repas restent, parce qu'on saisit sa routine d'un
                     seul moment de la journée d'affilée. */
                  onSuccess: () => { setNom(''); setQuantite(''); },
                },
              )}
              desactive={!complet || enDouble || enregistrer.isPending}
              style={{ flex: 1.4 }}
            >
              {enregistrer.isPending ? 'Ajout…' : 'Ajouter'}
            </Bouton>
          </View>
        </View>
      )}
    </Carte>
  );
}

const s = StyleSheet.create({
  etiquette: {
    fontSize: T.minuscule, letterSpacing: 1, textTransform: 'uppercase',
    color: C.discret,
  },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: E.s, minHeight: TOUCHE },
  ligneDetail: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  /* Mêmes dimensions que la pastille des aliments dans l'écran repas, et
     volontairement de la couleur `discret` : un complément n'a pas de rôle
     macro, lui donner une des quatre couleurs de rôle le ferait passer pour
     un aliment du calcul. */
  colTitre: { fontSize: T.minuscule, textTransform: 'uppercase', color: C.discret },
  puce: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.discret },
  retirer: {
    width: TOUCHE, height: TOUCHE, alignItems: 'center', justifyContent: 'center',
  },
  moment: {
    flex: 1, minHeight: TOUCHE, alignItems: 'center', justifyContent: 'center',
    borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
  },
  momentActif: { backgroundColor: C.vifFond, borderColor: C.vifBord },
  momentTexte: { fontSize: T.petit },
  momentTexteActif: { fontSize: T.petit, color: C.vif, fontFamily: P.fort },
});
