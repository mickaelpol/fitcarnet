import { useEffect, useReducer, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { etatAlarme, ouvrirReglagesDuTelephone } from './alarmeRepos';
import { Chiffre, Discret, Texte } from './base';
import { useEcranEveille } from './ecranEveille';
import {
  abonnerChrono, alarmeChronoPosee, arreterChrono, choisirDureeChrono, chronoCourt,
  demarrerChrono, dureeChrono, relancerChrono, remettreChrono, resteChrono, terminerChrono,
} from './etatChrono';
import { jouerSonnerie } from './sonnerie';
import { C, E, N, P, R, T, TOUCHE } from '@/theme';

const PRESETS = [60, 90, 120, 180];
/* `mmss` VIENT DE `chronoSerie`, il n'est plus réécrit ici — palier 0,
   20 septembre 2026. Les deux écritures étaient identiques ; c'est justement
   ce qui les rendait faciles à laisser diverger. */
import { mmss } from '@/calcul/affichageCourt';

/**
 * Chrono de repos. L'écran reste allumé pendant le décompte : sans ça, le
 * téléphone se verrouille dans la poche et on rate la fin.
 *
 * Le composant ne DÉTIENT rien : l'état vit dans `etatChrono`, pour qu'un
 * changement d'écran n'arrête pas le repos en cours. Ici, on affiche, et on bat
 * la seconde tant qu'on est visible. Quand on ne l'est pas, personne n'a besoin
 * de compter : l'alarme système sonne, et l'heure de fin suffit à retrouver le
 * reste au retour.
 *
 * `relance` : compteur incrémenté par le parent à chaque série cochée. Toute
 * nouvelle valeur relance le décompte sur la durée choisie.
 */
export function ChronoRepos({ relance, onCalculateur }: {
  relance?: number;
  onCalculateur?: () => void;
}) {
  /* LA BARRE EST COLLÉE EN BAS DE L'ÉCRAN, DONC SOUS LES BOUTONS D'ANDROID.
     Le remplissage fixe suffisait sur un téléphone à navigation gestuelle et
     recouvrait « Stop » sur un téléphone à trois boutons — un bouton visible
     et intouchable, ce qui est pire qu'un bouton absent. `insets.bottom` rend
     la hauteur réellement occupée par la barre système, quelle qu'elle soit. */
  const insets = useSafeAreaInsets();
  const [, redessiner] = useReducer((n: number) => n + 1, 0);
  const [reste, setReste] = useState(resteChrono);
  const premierRendu = useRef(true);

  useEffect(() => abonnerChrono(redessiner), []);

  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;

      return;
    }

    relancerChrono();
    setReste(resteChrono());
  }, [relance]);

  const court = chronoCourt();
  const duree = dureeChrono();

  useEcranEveille(court, 'chrono');

  useEffect(() => {
    if (!court) {
      setReste(resteChrono());

      return;
    }

    /* Deux battements espacés de plus d'une seconde et demie : les minuteurs
       ont été gelés — veille, ou autre application. C'est alors la
       notification qui a sonné, pas nous, et il ne faut pas re-sonner au
       retour : c'est exactement le bip en retard qu'on cherche à supprimer. */
    let dernier = Date.now();
    let continu = true;

    const battre = () => {
      const maintenant = Date.now();
      if (maintenant - dernier > 1500) continu = false;
      dernier = maintenant;

      const r = resteChrono();
      setReste(r);
      if (r !== 0) return;

      const parLeSysteme = alarmeChronoPosee() && !continu;
      terminerChrono();
      if (!parLeSysteme) sonner();
    };

    battre();
    // quatre fois par seconde : au retour d'arrière-plan, l'affichage se
    // remet à jour tout de suite au lieu d'attendre la seconde suivante
    const tic = setInterval(battre, 250);

    return () => { clearInterval(tic); };
  }, [court]);

  const fini = reste === 0;
  const agir = (f: () => void) => () => { f(); setReste(resteChrono()); };

  const sansAlarme = court && etatAlarme() === 'refusee';

  return (
    <View style={[s.barre, { paddingBottom: E.m + insets.bottom }]}>
      <Chiffre taille={N.grand} couleur={fini ? C.erreur : court ? C.vif : C.encre}>
        {mmss(reste)}
      </Chiffre>

      <Pressable
        onPress={agir(court ? arreterChrono : demarrerChrono)}
        style={[s.go, court && s.goStop]}
      >
        <Texte style={{ color: C.fond, fontFamily: P.fort }}>{court ? 'Stop' : 'Go'}</Texte>
      </Pressable>

      {/* « ↺ » seul n'est annoncé par aucun lecteur d'écran. Le bouton « Go »
          voisin, lui, porte son texte : il n'avait rien à ajouter. */}
      <Pressable
        onPress={agir(remettreChrono)}
        style={s.reset}
        accessibilityLabel="Remettre le chronomètre à zéro"
      >
        <Texte style={{ color: C.attenue, fontSize: T.moyen }}>↺</Texte>
      </Pressable>

      {onCalculateur !== undefined && (
        <Pressable onPress={onCalculateur} style={s.calc} accessibilityLabel="Calculateur de RM">
          <Texte style={{ color: C.vif, fontSize: T.normal, fontFamily: P.fort }}>⚖ RM</Texte>
        </Pressable>
      )}

      {/* ON LE DIT PENDANT LE REPOS, PAS DANS UN ÉCRAN DE RÉGLAGES.
          Sans permission de notifier, rien ne sonne dès qu'on quitte
          l'application : le décompte continue à l'écran et le signal
          n'arrive jamais. La panne est invisible — on croit avoir oublié de
          regarder. C'est ici, sous le chrono qui tourne, que l'information
          sert. */}
      {sansAlarme && (
        <Pressable onPress={() => { void ouvrirReglagesDuTelephone(); }} style={s.alerte}>
          <Discret style={{ color: C.vif, fontSize: T.petit }}>
            Aucune alarme hors de l’application : les notifications sont
            refusées. Appuie pour les autoriser.
          </Discret>
        </Pressable>
      )}

      <View style={s.presets}>
        {PRESETS.map((p) => (
          <Pressable
            key={p}
            onPress={agir(() => choisirDureeChrono(p))}
            style={[s.preset, duree === p && s.presetActif]}
          >
            <Discret style={duree === p ? { color: C.encre } : undefined}>
              {p < 60 ? `${p}s` : mmss(p)}
            </Discret>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * Signal de fin : un son ET une vibration.
 *
 * Les deux, parce qu'ils ne servent pas au même moment — le son quand le
 * téléphone est posé sur le banc, la vibration quand il est dans la poche
 * sous une musique. La sonnerie se choisit dans les réglages.
 */
function sonner() {
  jouerSonnerie();

  const nav = globalThis as unknown as { navigator?: { vibrate?: (p: number[]) => void } };
  nav.navigator?.vibrate?.([300, 120, 300, 120, 300, 120, 500]);
}

const s = StyleSheet.create({
  barre: {
    flexDirection: 'row', alignItems: 'center', gap: E.s, flexWrap: 'wrap',
    backgroundColor: C.fond, borderTopColor: C.ligne, borderTopWidth: 1,
    paddingHorizontal: E.m, paddingTop: E.s, paddingBottom: E.m,
  },
  go: {
    minWidth: 58, minHeight: TOUCHE, borderRadius: R.s, backgroundColor: C.vif,
    alignItems: 'center', justifyContent: 'center',
  },
  goStop: { backgroundColor: C.erreur },
  reset: {
    width: 42, minHeight: TOUCHE, borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    alignItems: 'center', justifyContent: 'center',
  },
  calc: {
    minWidth: 56, minHeight: TOUCHE, borderRadius: R.s, borderWidth: 1,
    borderColor: C.vifBord, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: E.s,
  },
  alerte: {
    flexBasis: '100%', borderRadius: R.s, borderWidth: 1, borderColor: C.vifBord,
    backgroundColor: C.vifFond, padding: E.s,
  },
  presets: { flexDirection: 'row', gap: 5, flexGrow: 1, flexBasis: '100%' },
  preset: {
    /* 36 px auparavant, sous les 44 que le reste de l'application s'impose.
       Ce sont des boutons qu'on vise entre deux séries, la main moite et sans
       regarder : c'est le pire endroit pour une cible trop petite. */
    flex: 1, minHeight: TOUCHE, borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
  },
  presetActif: { borderColor: C.vif },
});
