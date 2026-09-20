/**
 * Trois formats courts, longtemps coinces dans des composants.
 *
 * RASSEMBLES LE 20 SEPTEMBRE 2026 (palier 0). Toutes pures, toutes exportees,
 * toutes dans des `.tsx` — donc aucune eprouvable, alors qu'elles decident de
 * ce qui s'affiche sous un chronometre, dans un rappel de complements et sur
 * une vignette video.
 */

/**
 * Des secondes en « m:ss ».
 *
 * `mmss(-5)` rendait « -1:-5 ». Tous les appelants garantissent un temps
 * positif, mais rien ne l'ecrivait : on borne donc a zero plutot que d'afficher
 * une duree impossible sous un chronometre qui tourne.
 */
export const mmss = (s: number): string => {
  const total = Math.max(0, Math.floor(s));

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * L'identifiant d'une URL YouTube, quelle qu'en soit la forme.
 *
 * Quatre formes circulent : `watch?v=`, `youtu.be/`, `embed/` et `shorts/`.
 * Onze caracteres exactement — c'est la longueur d'un identifiant YouTube, et
 * c'est ce qui evite d'attraper un fragment de chemin.
 */
export function identifiantYoutube(url: string | null): string | null {
  if (!url) return null;

  const m = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/
    .exec(url);

  return m?.[1] ?? null;
}

/**
 * Une quantite decimale telle qu'on l'ecrit.
 *
 * `quantite` arrive en chaine — « 5.00 ». L'afficher tel quel donne « 5.00 g
 * de creatine », ce que personne n'ecrit. On enleve les zeros inutiles et on
 * rend la virgule francaise.
 *
 * CE QU'ON NE SAIT PAS LIRE EST RENDU TEL QUEL, et non remplace par zero : une
 * quantite illisible doit se voir, pas se transformer en « 0 g » plausible.
 */
export function nombreLisible(decimale: string): string {
  const n = Number(decimale);

  return Number.isFinite(n) && decimale.trim() !== '' ? String(n).replace('.', ',') : decimale;
}
