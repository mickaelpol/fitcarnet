import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { adresseApi } from '@/api/client';
import { useMoi } from '@/api/hooks';
import { Bouton, Discret, Texte } from './base';
import { Pliant } from './pliant';
import { C, E, P, R, T } from '@/theme';

/**
 * CE QUI TOURNE VRAIMENT, ET UN BOUTON POUR CHANGER ÇA.
 *
 * POURQUOI CE PANNEAU EXISTE
 *
 * Les mises à jour JavaScript arrivent seules et sans un mot. C'est confortable
 * tant que ça marche, et insupportable dès que ça ne marche plus : on ferme
 * l'application, on la rouvre, rien ne change, et **rien nulle part ne dit
 * pourquoi**. Ni erreur, ni journal, ni numéro à comparer.
 *
 * On a perdu une soirée là-dessus. La cause tenait en une ligne — le canal
 * `production` d'Expo ne pointait sur aucune branche, donc l'application
 * demandait poliment s'il y avait du neuf et s'entendait répondre non. Aucun
 * des deux côtés ne considérait ça comme une anomalie.
 *
 * Ce panneau ne répare rien. Il rend l'invisible lisible : la version native
 * installée, la version d'exécution que l'application réclame, le canal qu'elle
 * interroge, et l'identifiant du paquet JavaScript en cours. Avec ces quatre
 * nombres, une divergence se voit en trois secondes au lieu d'une soirée.
 *
 * LE BOUTON REMPLACE « FERME ET ROUVRE DEUX FOIS ».
 *
 * Par défaut, `expo-updates` télécharge au démarrage et applique au démarrage
 * SUIVANT — deux lancements, sans que rien ne l'annonce. Ici on demande,
 * on télécharge, et on redémarre, tout de suite. Ce qui se passe est écrit à
 * l'écran à chaque étape, y compris « tu es déjà à jour », qui est une réponse
 * et pas un silence.
 */
/** Ce que le serveur répond, avant même qu'on lui demande des données. */
type EtatServeur = 'inconnu' | 'joignable' | 'injoignable';

export function EtatMaj() {
  /* REPLIÉ PAR DÉFAUT, ET LE RÉSUMÉ PORTE L'ESSENTIEL.
     Ce panneau sert quelques fois par an. Déplié en permanence, il occupait
     le bas de l'onglet Compte tous les jours pour une information qu'on ne
     lit qu'un jour de panne. Le titre plié dit déjà les deux choses utiles :
     la version qui tourne, et si le serveur répond. */
  const [deplie, setDeplie] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [serveur, setServeur] = useState<EtatServeur>('inconnu');

  /* CE PANNEAU DIT DEUX CHOSES À DEUX PUBLICS.
   *
   * À tout le monde : « ça marche » ou « ça ne marche pas », la version, et
   * le bouton de mise à jour. C'est ce dont on a besoin avant d'écrire à
   * quelqu'un pour signaler une panne — et, souvent, ce qui évite d'avoir à
   * écrire.
   *
   * À l'administrateur seul : l'adresse exacte, le canal, l'identifiant du
   * paquet. Des outils de diagnostic ; pour qui ne les comprend pas, quatre
   * lignes inquiétantes.
   *
   * « CHERCHER UNE MISE À JOUR » A CHANGÉ DE CÔTÉ LE 14 AOÛT 2026.
   *
   * Il était rangé avec les diagnostics, au motif qu'il « donne envie
   * d'appuyer quand rien ne va, sans jamais rien régler ». C'est l'inverse :
   * c'est le SEUL recours de quelqu'un dont l'application n'a pas reçu un
   * correctif. Les mises à jour descendent bien toutes seules — au démarrage
   * suivant, à condition de fermer vraiment l'application, ce que personne ne
   * fait et que personne ne devine.
   *
   * Ce jour-là, une panne affichait à l'administrateur l'identité d'un autre
   * compte. Sur son téléphone il lisait donc ROLE_USER, et le bouton qui lui
   * aurait apporté le correctif était caché par le bug qu'il corrigeait. Une
   * porte de secours fermée par ce dont elle protège n'est pas une porte de
   * secours. */
  const admin = useMoi().data?.roles?.includes('ROLE_ADMIN') === true;

  /**
   * LE SERVEUR RÉPOND-IL ?
   *
   * `/api/etat` existe pour cette seule question, et ne rend rien d'autre
   * qu'un `{ok:true}`. On interrogeait la racine `/api` — qui devait donc
   * rester publique, et qui liste toutes les ressources de l'application.
   * Une pastille verte ne vaut pas la carte complète de l'API offerte au
   * premier venu.
   *
   * Sans jeton : la question est « le serveur est-il là », pas « ai-je le
   * droit ». Les deux erreurs qu'on confondait sont enfin séparées.
   */
  const verifierServeur = useCallback(() => {
    setServeur('inconnu');
    const arret = new AbortController();
    /* Cinq secondes. Au-delà, l'information n'a plus de valeur : on veut
       savoir si le serveur est là, pas attendre qu'il se réveille. */
    const minuteur = setTimeout(() => arret.abort(), 5000);

    fetch(`${adresseApi()}/etat`, { signal: arret.signal, headers: { Accept: 'application/json' } })
      .then((r) => setServeur(r.status >= 500 ? 'injoignable' : 'joignable'))
      .catch(() => setServeur('injoignable'))
      .finally(() => clearTimeout(minuteur));

    return () => { clearTimeout(minuteur); arret.abort(); };
  }, []);

  useEffect(() => verifierServeur(), [verifierServeur]);

  /* SUR LE WEB, LE PANNEAU EXISTE MAIS SE TAIT SUR LES MISES À JOUR.
   *
   * Il n'y a pas de paquet JavaScript à remplacer : le code vient du serveur
   * à chaque chargement, et « chercher une mise à jour » n'y voudrait rien
   * dire. Mais l'adresse du serveur et sa disponibilité, elles, valent
   * autant dans un navigateur que sur un téléphone.
   *
   * La première version cachait le panneau entier sur le web. Résultat : on
   * a cherché un problème de cache pendant dix minutes parce que l'encart
   * n'apparaissait pas. Un composant qui disparaît sans raison visible est
   * un bug, même quand c'est intentionnel.
   *
   * `Updates.isEnabled` est faux aussi en développement, pour la même
   * raison — le code vient de Metro. */
  const avecMaj = Platform.OS !== 'web' && Updates.isEnabled;

  const chercher = () => {
    setOccupe(true);
    setMessage('Recherche…');

    void Updates.checkForUpdateAsync()
      .then(async (r) => {
        if (!r.isAvailable) {
          setMessage('Tu es déjà à jour.');

          return;
        }
        setMessage('Mise à jour trouvée, téléchargement…');
        await Updates.fetchUpdateAsync();
        setMessage('Redémarrage…');
        await Updates.reloadAsync();
      })
      .catch((e: unknown) => {
        /* ON MONTRE L'ERREUR TELLE QUELLE. Hors ligne, canal mal relié, serveur
           injoignable : les causes diffèrent et le message d'Expo les nomme.
           Le remplacer par « une erreur est survenue » rendrait ce panneau
           aussi muet que ce qu'il vient corriger. */
        setMessage(e instanceof Error ? e.message : 'Vérification impossible.');
      })
      .finally(() => setOccupe(false));
  };

  return (
    <Pliant
      titre="Version de l’application"
      apparence="bouton"
      /* Ce qu'on vient chercher ici : quelle version tourne, et est-ce que le
         serveur répond. Les deux tiennent sur une ligne — inutile d'ouvrir.

         `?? 'web'` NE SUFFISAIT PAS, et ça se voyait à l'écran : sur le web,
         `Updates.runtimeVersion` ne vaut pas `null` mais la CHAÎNE VIDE. `??`
         ne rattrape que `null` et `undefined` — le résumé s'affichait donc
         « · serveur en ligne », un point médian tout seul en tête de ligne,
         sans rien avant. Le classique du `??` employé là où il fallait
         constater qu'une valeur est vide. */
      resume={`${Updates.runtimeVersion || 'web'}  ·  ${
        serveur === 'joignable' ? 'serveur en ligne'
          : serveur === 'injoignable' ? 'serveur hors ligne' : 'vérification…'}`}
      ouvert={deplie}
      onBascule={() => setDeplie(!deplie)}
    >
      {/* L'ADRESSE DU SERVEUR, EN PREMIER.
          Elle est figée dans l'APK au moment du build, par le profil EAS
          utilisé. Un APK construit avec le profil `local` parle à
          `192.168.1.118` — injoignable hors du réseau de la maison — et
          l'application affiche exactement la même erreur que si le téléphone
          était hors ligne. Une ligne ici tranche en deux secondes. */}
      <View style={s.ligne}>
        <Discret style={{ flex: 1 }}>Serveur</Discret>
        {/* UNE PASTILLE, PARCE QU'UN ÉTAT SE LIT D'UN COUP D'ŒIL OU NE SE LIT
            PAS. Le mot reste à côté : une couleur seule ne dit rien à qui ne
            distingue pas le vert du rouge. */}
        <View style={[s.pastille, {
          backgroundColor: serveur === 'joignable' ? C.ok
            : serveur === 'injoignable' ? C.erreur : C.discret,
        }]} />
        <Texte style={[s.valeur, {
          color: serveur === 'joignable' ? C.ok
            : serveur === 'injoignable' ? C.erreur : C.attenue,
        }]}>
          {serveur === 'joignable' ? 'en ligne'
            : serveur === 'injoignable' ? 'hors ligne' : 'vérification…'}
        </Texte>
      </View>

      {admin && <Texte style={s.adresse} numberOfLines={2}>{adresseApi()}</Texte>}
      {avecMaj && admin && (
        <>
          <Ligne nom="Application" valeur={Updates.createdAt === null ? 'installée' : 'mise à jour'} />
          {/* `||` et non `??` : voir le résumé plus haut. Une chaîne vide est
              une absence, et `??` ne la voit pas. Ici la conséquence était
              plus discrète — un tiret manquant — mais c'est la même faute. */}
          <Ligne nom="Version d’exécution" valeur={Updates.runtimeVersion || '—'} />
          <Ligne nom="Canal" valeur={Updates.channel ?? 'aucun'} />
          <Ligne
            nom="Paquet JavaScript"
            /* `updateId` est null quand l'application tourne sur le JavaScript
               embarqué dans l'APK — c'est-à-dire quand AUCUNE mise à jour n'a
               jamais été appliquée. C'est l'information la plus utile du lot. */
            valeur={Updates.updateId === null ? 'celui de l’APK' : Updates.updateId.slice(0, 8)}
          />
          {Updates.createdAt !== null && (
            <Ligne
              nom="Publié le"
              valeur={Updates.createdAt.toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
              })}
            />
          )}
        </>
      )}
      {!avecMaj && admin && (
        <Discret style={{ fontSize: T.petit }}>
          Version web : le code vient du serveur à chaque chargement, il n’y a
          rien à mettre à jour ici.
        </Discret>
      )}

      {/* LA VERSION A QUITTÉ LE CORPS POUR LE RÉSUMÉ.
          Elle y était pour les comptes non-administrateurs, parce que c'est le
          seul chiffre utile quand on signale un problème. Depuis que l'encart
          se plie, le résumé la porte — pour tout le monde, et sans avoir à
          ouvrir. La répéter ici ferait deux fois le même nombre à l'écran, et
          un jour deux nombres différents. */}

      {admin && (
        <Bouton variante="contour" onPress={verifierServeur}>
          Retester le serveur
        </Bouton>
      )}

      {/* POUR TOUT LE MONDE. Voir le commentaire en tête du composant. */}
      {avecMaj && (
        <Bouton variante="contour" onPress={chercher} desactive={occupe}>
          {occupe ? 'Patiente…' : 'Chercher une mise à jour'}
        </Bouton>
      )}

      {/* Le message est la réponse du bouton : le réserver à l'administrateur
          rendrait le bouton muet pour les autres — on appuie, rien ne bouge,
          et « déjà à jour » ne se distingue plus de « ça n'a pas marché ». */}
      {message !== null && (
        <Discret style={s.message}>{message}</Discret>
      )}
    </Pliant>
  );
}

const Ligne = ({ nom, valeur }: { nom: string; valeur: string }) => (
  <View style={s.ligne}>
    <Discret style={{ flex: 1 }}>{nom}</Discret>
    <Texte style={s.valeur} numberOfLines={1}>{valeur}</Texte>
  </View>
);

const s = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  valeur: { fontSize: T.petit, color: C.attenue },
  pastille: { width: 9, height: 9, borderRadius: 5 },
  adresse: {
    fontSize: T.petit, color: C.attenue,
    backgroundColor: C.fond, borderRadius: R.s, padding: E.xs,
  },
  message: {
    fontSize: T.petit,
    color: C.vif,
    backgroundColor: C.vifFond,
    borderRadius: R.s,
    padding: E.s,
  },
});
