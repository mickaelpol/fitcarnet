import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Chiffre, Discret, Texte } from './base';
import { C, E, P, R, TOUCHE } from '@/theme';

const PRESETS = [60, 90, 120, 180];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Chrono de repos. L'écran reste allumé pendant le décompte : sans ça, le
 * téléphone se verrouille dans la poche et on rate la fin.
 */
export function ChronoRepos({ onCalculateur }: { onCalculateur?: () => void }) {
  const [duree, setDuree] = useState(90);
  const [reste, setReste] = useState(90);
  const [court, setCourt] = useState(false);
  const tic = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!court) return;

    void activateKeepAwakeAsync('chrono');
    tic.current = setInterval(() => {
      setReste((r) => {
        if (r <= 1) {
          setCourt(false);
          sonner();

          return 0;
        }

        return r - 1;
      });
    }, 1000);

    return () => {
      if (tic.current) clearInterval(tic.current);
      void deactivateKeepAwake('chrono');
    };
  }, [court]);

  const demarrer = () => { setReste(reste === 0 ? duree : reste); setCourt(true); };
  const arreter = () => setCourt(false);
  const remettre = () => { setCourt(false); setReste(duree); };

  const choisir = (s: number) => { setDuree(s); setReste(s); setCourt(false); };

  const fini = reste === 0;

  return (
    <View style={s.barre}>
      <Chiffre taille={34} couleur={fini ? C.erreur : court ? C.vif : C.encre}>
        {mmss(reste)}
      </Chiffre>

      <Pressable onPress={court ? arreter : demarrer} style={[s.go, court && s.goStop]}>
        <Texte style={{ color: C.fond, fontFamily: P.fort }}>{court ? 'Stop' : 'Go'}</Texte>
      </Pressable>

      <Pressable onPress={remettre} style={s.reset}>
        <Texte style={{ color: C.attenue, fontSize: 16 }}>↺</Texte>
      </Pressable>

      {onCalculateur !== undefined && (
        <Pressable onPress={onCalculateur} style={s.calc} accessibilityLabel="Calculateur de RM">
          <Texte style={{ color: C.vif, fontSize: 13, fontFamily: P.fort }}>⚖ RM</Texte>
        </Pressable>
      )}

      <View style={s.presets}>
        {PRESETS.map((p) => (
          <Pressable
            key={p}
            onPress={() => choisir(p)}
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

/** Signal de fin : audible même par-dessus de la musique, autant que possible. */
function sonner() {
  if (Platform.OS === 'web') {
    try {
      const Ctx = (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const t0 = ctx.currentTime;
      const comp = ctx.createDynamicsCompressor();
      comp.connect(ctx.destination);
      for (let i = 0; i < 6; i++) {
        const d = t0 + i * 0.34;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(i % 2 ? 1560 : 1180, d);
        o.connect(g); g.connect(comp);
        g.gain.setValueAtTime(0.0001, d);
        g.gain.exponentialRampToValueAtTime(0.5, d + 0.008);
        g.gain.setValueAtTime(0.5, d + 0.18);
        g.gain.exponentialRampToValueAtTime(0.0001, d + 0.25);
        o.start(d); o.stop(d + 0.27);
      }
    } catch { /* pas de son : le décompte reste visible */ }
  }
  // sur mobile, la vibration prend le relais
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
    borderColor: 'rgba(227,178,60,0.4)', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: E.s,
  },
  presets: { flexDirection: 'row', gap: 5, flexGrow: 1, flexBasis: '100%' },
  preset: {
    flex: 1, minHeight: 36, borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
  },
  presetActif: { borderColor: C.vif },
});
