import { useEffect, useReducer, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Chiffre, Discret, Texte } from './base';
import { useEcranEveille } from './ecranEveille';
import {
  abonnerChrono, alarmeChronoPosee, arreterChrono, choisirDureeChrono, chronoCourt,
  demarrerChrono, dureeChrono, relancerChrono, remettreChrono, resteChrono, terminerChrono,
} from './etatChrono';
import { jouerSonnerie } from './sonnerie';
import { C, E, N, P, R, T, TOUCHE } from '@/theme';

const PRESETS = [60, 90, 120, 180];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

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

  return (
    <View style={s.barre}>
      <Chiffre taille={N.grand} couleur={fini ? C.erreur : court ? C.vif : C.encre}>
        {mmss(reste)}
      </Chiffre>

      <Pressable
        onPress={agir(court ? arreterChrono : demarrerChrono)}
        style={[s.go, court && s.goStop]}
      >
        <Texte style={{ color: C.fond, fontFamily: P.fort }}>{court ? 'Stop' : 'Go'}</Texte>
      </Pressable>

      <Pressable onPress={agir(remettreChrono)} style={s.reset}>
        <Texte style={{ color: C.attenue, fontSize: T.moyen }}>↺</Texte>
      </Pressable>

      {onCalculateur !== undefined && (
        <Pressable onPress={onCalculateur} style={s.calc} accessibilityLabel="Calculateur de RM">
          <Texte style={{ color: C.vif, fontSize: T.normal, fontFamily: P.fort }}>⚖ RM</Texte>
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
  presets: { flexDirection: 'row', gap: 5, flexGrow: 1, flexBasis: '100%' },
  preset: {
    flex: 1, minHeight: 36, borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
  },
  presetActif: { borderColor: C.vif },
});
