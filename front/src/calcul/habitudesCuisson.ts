import { cleDeCuisson, type Cuissons, type Repas } from './fournees';
import { SANS_ACCENT } from './texte';

/**
 * CE QUE TU FAIS D'HABITUDE, PRÉ-REMPLI.
 *
 * Le problème tel qu'il s'est présenté : à chaque plan, il fallait redire que
 * le riz passe à l'eau et le poulet à la poêle. Sur une semaine de quatre
 * repas, une trentaine de choix à refaire — et les mêmes que la semaine
 * dernière. Un outil qui fait recommencer ce qu'on vient de lui apprendre
 * n'aide pas, il occupe.
 *
 * LA RÈGLE TIENT EN UNE PHRASE : **ce qui est pré-rempli est ce que tu as
 * fait la dernière fois.** Pas de case « s'en souvenir » à cocher — ce serait
 * une décision de plus à chaque choix, c'est-à-dire exactement la friction
 * qu'on enlève. Pas de « seule la première fois compte » non plus : on ne
 * pourrait plus jamais changer d'avis.
 *
 * Et ce n'est QU'UN DÉFAUT. Il se change d'un geste, repas par repas.
 */

/** La clé d'une habitude : ce qui reste d'un nom quand on l'écrit calmement. */
export type Habitudes = Record<string, number | null>;

/*
 * La table des accents vit dans `calcul/texte.ts`, et nulle part ailleurs.
 *
 * Elle a longtemps ete ecrite ici seulement, avec la bonne raison :
 * `String.prototype.normalize('NFD')` ferait la meme chose en une ligne, mais
 * Hermes — le moteur JavaScript de React Native — ne l'implemente pas
 * toujours, selon la version et selon que l'Intl complet est embarque. Une
 * table de quinze lettres ne depend d'aucun moteur.
 *
 * Le 15 septembre 2026, `texte.ts` a ete cree pour absorber les SIX copies de
 * `sansAccent` qui trainaient dans le projet, toutes en `normalize('NFD')`.
 * Laisser la table ici en aurait fait une septieme — et la regle 5 vaut aussi
 * pour les tables de correspondance.
 */

/**
 * La clé sous laquelle une habitude s'écrit ET se relit.
 *
 * C'est le seul identifiant que les deux frigos aient en commun : un aliment
 * Grocy porte « grocy:12 », un aliment de la base porte un entier, et ces
 * deux mondes n'ont aucun identifiant partagé. Le NOM, lui, en est un.
 *
 * Minuscules, sans accent, espaces réduits. Sans cela « Riz Basmati », « riz
 * basmati » et « Riz basmati  » feraient trois habitudes pour un seul riz, et
 * l'utilisateur verrait ses réglages disparaître au moindre changement de
 * casse.
 *
 * CETTE FONCTION EST LA SEULE À PRODUIRE UN IDENTIFIANT. `sansAccent` de
 * `texte.ts` sert aux RECHERCHES et s'arrête aux accents ; celle-ci va plus
 * loin — elle coupe sur tout ce qui n'est ni lettre ni chiffre — parce qu'une
 * clé doit être stable, pas seulement lisible. Les deux partagent la même
 * table, et un test de `texte.ts` vérifie qu'elles ne divergent pas.
 *
 * Ce commentaire disait « la seule à normaliser dans tout le projet ». C'était
 * faux : il y avait six copies de la suppression d'accents, toutes en
 * `normalize`. Elles ont été fusionnées le 15 septembre 2026. L'API stocke
 * ce qu'elle reçoit sans le lire. La règle doit être la même à l'écriture et
 * à la lecture ; l'écrire des deux côtés, ce serait se donner deux règles
 * libres de diverger — et le jour où elles divergent, l'habitude s'écrit sous
 * une clé et se cherche sous une autre, sans que rien ne le signale.
 */
export const cleDHabitude = (nom: string): string =>
  nom
    .toLowerCase()
    .replace(/[À-ÿœæ]/g, (c) => SANS_ACCENT[c] ?? c)
    /* Tout ce qui n'est ni lettre ni chiffre devient une coupure : « riz
       basmati », « riz-basmati » et « riz (basmati) » sont le même riz. */
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Les cuissons qu'on propose d'office, avant tout choix de l'utilisateur.
 *
 * Rendu SÉPARÉMENT des choix faits à l'écran, et fusionné dessous eux. C'est
 * ce qui rend un choix explicite indéracinable : il est toujours au-dessus du
 * défaut, quoi qu'il arrive aux habitudes entre-temps. L'inverse — recopier
 * les habitudes dans l'état de l'écran au chargement — obligerait à savoir
 * quand recopier, à ne pas écraser ce que l'utilisateur vient de faire, et à
 * distinguer « il n'a pas encore choisi » de « il a choisi la même chose ».
 * Trois questions qui ne se posent pas ici.
 */
export function depuisLesHabitudes(
  repas: readonly Repas[],
  habitudes: Habitudes,
): Cuissons {
  const out: Cuissons = {};

  for (const r of repas) {
    for (const q of r.quantites) {
      const cle = cleDHabitude(q.aliment.nom);
      /* `in` et non `!== undefined` : `null` est une réponse — « se mange
         sans cuisson » — et la confondre avec l'absence ferait redemander
         éternellement pour le skyr et les amandes.

         HONNÊTEMENT : la mutation qui remplace ce `in` par
         `habitudes[cle] !== undefined` SURVIT, et c'est normal — le type
         `Habitudes` interdit la valeur `undefined`, donc les deux écritures
         disent la même chose ici. Ce n'est pas un trou de test : c'est une
         équivalence garantie par le typage. Le `in` reste parce qu'il dit
         l'intention — on demande si l'habitude EXISTE, pas ce qu'elle vaut —
         et parce qu'il resterait juste si le type s'élargissait un jour. */
      if (cle in habitudes) out[cleDeCuisson(r.cle, q.aliment)] = habitudes[cle]!;
    }
  }

  return out;
}

/**
 * Ce qu'il faut renvoyer au serveur : les habitudes que ce plan vient de
 * décider, celles-là seulement.
 *
 * On ne réécrit PAS ce qui n'a pas bougé. Une semaine sans changement doit
 * pouvoir se composer sans une seule écriture — sinon chaque plan repousserait
 * inutilement `maj_le` sur trente lignes, et un envoi qui échoue à moitié
 * porterait sur des données qui n'avaient aucune raison de partir.
 *
 * Un aliment cuit différemment dans deux repas du même plan ne donne qu'UNE
 * habitude : la dernière rencontrée dans l'ordre du plan, c'est-à-dire la
 * plus tardive. C'est le sens de « ce que tu as fait la dernière fois ».
 */
export function habitudesAEcrire(
  repas: readonly Repas[],
  choisi: Cuissons,
  connues: Habitudes,
): { aliment: string; mode: number | null }[] {
  /* DEUX TEMPS, et l'ordre compte. On retient d'abord la dernière décision de
     chaque aliment, on compare ensuite à ce qui est déjà connu.

     Faire les deux en un seul passage — « si c'est inchangé, passer » — a
     l'air plus court et se trompe : un riz mis au four lundi puis remis à
     l'eau jeudi verrait le jeudi écarté comme inchangé, et le lundi resterait
     dans le lot. On enregistrerait « four » pour un plan qui finit à l'eau. */
  const derniere = new Map<string, number | null>();

  for (const r of repas) {
    for (const q of r.quantites) {
      const decide = choisi[cleDeCuisson(r.cle, q.aliment)];
      if (decide === undefined) continue;

      derniere.set(cleDHabitude(q.aliment.nom), decide);
    }
  }

  return [...derniere]
    /* Inchangé : rien à dire.
       Une habitude ABSENTE rend `undefined`, et `mode` ne peut pas valoir
       `undefined` — la boucle ci-dessus l'a écarté. L'absence est donc
       toujours un écart, sans qu'on ait besoin de la tester à part. */
    .filter(([cle, mode]) => connues[cle] !== mode)
    .map(([aliment, mode]) => ({ aliment, mode }));
}
