/**
 * « UNE NOUVELLE VERSION EST DISPONIBLE. »
 *
 * POURQUOI CE MODULE EXISTE
 *
 * Les mises à jour de JavaScript arrivent toutes seules et sans un mot : le
 * téléphone les prend au démarrage suivant, personne ne touche à rien. Mais
 * une mise à jour du code NATIF — un module ajouté, une permission nouvelle,
 * une montée de version d'Expo — demande d'installer un nouvel APK, et
 * **Android interdit à une application d'en installer une autre sans que
 * l'utilisateur appuie sur « Installer »**. C'est une protection du système,
 * pas une limite qu'on contourne.
 *
 * Tout ce qu'on peut faire, et c'est déjà l'essentiel : le SAVOIR, le DIRE,
 * et amener l'utilisateur à un appui. Sans ça il faudrait prévenir les gens
 * un par un, et une application qu'on croit à jour alors qu'elle ne l'est pas
 * est pire qu'une application visiblement vieille.
 *
 * ON COMPARE DES `versionCode`, PAS DES `1.2.3`.
 *
 * Le numéro de version est une chaîne écrite pour les humains — « 1.10.0 »
 * vient après « 1.9.0 » alors qu'il est avant dans l'ordre alphabétique, et
 * après « 1.9.0-beta » selon des règles que personne ne retient. Android, lui,
 * décide avec un ENTIER qui ne fait qu'augmenter, et c'est le seul chiffre
 * qu'il regarde pour accepter ou refuser une installation par-dessus une
 * autre. On raisonne donc sur le même.
 */

/** Ce que le serveur publie à côté de l'APK. */
export interface VersionPubliee {
  /** l'entier qu'Android compare, celui de `android.versionCode` */
  versionCode: number;
  /** « 1.2.0 » — pour l'affichage, jamais pour la comparaison */
  version: string;
  /** l'adresse complète de l'APK */
  url: string;
  /** ce qui change, en une phrase ; facultatif */
  notes?: string;
}

/**
 * Faut-il proposer cette mise à jour ?
 *
 * STRICTEMENT SUPÉRIEUR. Un `>=` proposerait éternellement d'installer la
 * version déjà installée — et l'utilisateur apprendrait en deux jours à
 * ignorer le bandeau, ce qui reviendrait à ne plus en avoir.
 *
 * Et on ne propose RIEN quand on ne sait pas ce qui tourne : mieux vaut
 * manquer une mise à jour qu'inviter la version web à télécharger un APK.
 */
export function miseAJourNecessaire(
  installee: number | null,
  publiee: VersionPubliee | null,
): boolean {
  if (installee === null || publiee === null) return false;
  if (!Number.isFinite(publiee.versionCode)) return false;

  return publiee.versionCode > installee;
}

/**
 * Ce que le serveur répond, une fois vérifié.
 *
 * On refuse tout ce qui n'a pas la forme attendue plutôt que de faire
 * confiance. Un `version.json` mal recopié à la main — et il sera recopié à
 * la main — ne doit pas envoyer le téléphone télécharger n'importe quoi.
 */
export function lireVersionPubliee(donnees: unknown): VersionPubliee | null {
  if (typeof donnees !== 'object' || donnees === null) return null;
  const d = donnees as Record<string, unknown>;

  const versionCode = d.versionCode;
  const version = d.version;
  const url = d.url;

  if (typeof versionCode !== 'number' || !Number.isFinite(versionCode)) return null;
  if (versionCode <= 0) return null;
  if (typeof version !== 'string' || version === '') return null;
  /* Une URL en clair enverrait Android refuser le téléchargement, et une
     adresse relative ne s'ouvrirait nulle part. On exige donc une adresse
     complète — et `https` parce que le NAS en sert déjà. */
  if (typeof url !== 'string' || !/^https:\/\/\S+$/.test(url)) return null;

  return {
    versionCode,
    version,
    url,
    notes: typeof d.notes === 'string' ? d.notes : undefined,
  };
}

/**
 * Demande au serveur ce qu'il publie.
 *
 * Un échec n'est JAMAIS une erreur visible : on est hors ligne, ou le NAS
 * dort. Interrompre quelqu'un qui veut composer son repas pour lui dire qu'on
 * n'a pas pu vérifier une mise à jour serait absurde.
 */
export async function versionPubliee(url: string): Promise<VersionPubliee | null> {
  try {
    const reponse = await fetch(url, { cache: 'no-store' });
    if (!reponse.ok) return null;

    return lireVersionPubliee(await reponse.json());
  } catch {
    return null;
  }
}
