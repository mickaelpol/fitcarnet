import { execFileSync } from 'node:child_process';
import { expect, type Page } from '@playwright/test';

/**
 * UN COMPTE QUI N'EXISTE QUE LE TEMPS DE L'ÉPREUVE.
 *
 * LA RÈGLE ABSOLUE DU PROJET : n'écrire JAMAIS sur une donnée qu'on n'a pas
 * créée. Le 14 septembre 2026, un `PATCH` de vérification sur l'exercice `id=1`
 * — une donnée réelle — a écrasé un champ sans que personne ait relevé sa
 * valeur d'abord. Il a fallu restaurer une sauvegarde d'août pour la retrouver.
 *
 * Chaque épreuve monte donc son propre compte, avec une adresse en
 * `@e2e.local` : c'est ce suffixe qui permet, à la fin, de prouver qu'il ne
 * reste rien.
 *
 * LE MOT DE PASSE NE S'INVENTE PAS : le hachage se demande à Symfony, dans le
 * conteneur, exactement comme le fait l'application.
 */

const CONTENEUR_API = 'fitcarnet-app-dev';
const CONTENEUR_BASE = 'fitcarnet-db-dev';

/** Le mot de passe de tous les comptes jetables — il ne protège rien. */
export const MOT_DE_PASSE = 'MotDePasseTest123!';

/** Le suffixe qui rend un compte reconnaissable, et donc supprimable. */
export const SUFFIXE = '@e2e.local';

const sql = (requete: string): string =>
  execFileSync('docker', ['exec', CONTENEUR_BASE, 'psql', '-U', 'fitcarnet', '-tAc', requete],
    { encoding: 'utf-8' }).trim();

/**
 * Crée un compte et rend son adresse.
 *
 * `source` décide du frigo : `base` est ce que fait la production depuis la
 * migration du 20 septembre 2026.
 *
 * ⚠️ **`'grocy'` ÉCRIT DANS L'INSTANCE GROCY RÉELLE DU PROPRIÉTAIRE.**
 * Un compte jetable n'y change rien : `POST /api/mon-frigo/aliment` sur un
 * compte en `source_frigo = 'grocy'` part vers `https://grocy.mickael-pol.fr`,
 * pas vers une base de test. Le 21 septembre 2026, un agent de vérification a
 * ainsi créé un vrai produit (« Poulet verification », id 67) en croyant Grocy
 * injoignable ; il l'a retiré et l'a prouvé, mais la règle du projet — « n'écris
 * jamais sur une donnée que tu n'as pas créée » — ne protège de rien ici :
 * la donnée EST créée par l'agent, dans le vrai Grocy.
 *
 * **N'utiliser `'grocy'` que pour éprouver des REFUS** (422 rendus avant tout
 * appel à Grocy), jamais un chemin d'acceptation.
 */
export function creerCompte(nom: string, source: 'base' | 'grocy' = 'base'): string {
  const email = `${nom}-${Date.now()}${SUFFIXE}`;

  const sortie = execFileSync('docker', [
    'exec', CONTENEUR_API, 'sh', '-c',
    'cd /app && bin/console security:hash-password '
    + `"${MOT_DE_PASSE}" --no-interaction`,
  ], { encoding: 'utf-8' });

  const hachage = /\$2y\$[^\s]+/.exec(sortie)?.[0];
  if (hachage === undefined) {
    throw new Error(`Symfony n'a pas rendu de hachage :\n${sortie}`);
  }

  sql(`INSERT INTO utilisateur (id, email, mot_de_passe, nom, roles, actif, cree_le, source_frigo)
       VALUES (gen_random_uuid(), '${email}', '${hachage}', 'Epreuve E2E',
               'ROLE_USER', true, now(), '${source}')`);

  return email;
}

/**
 * Efface un compte et tout ce qu'il a créé.
 *
 * L'ORDRE COMPTE, et il n'est pas facultatif : `stock.aliment_id` est en
 * `ON DELETE RESTRICT`, et PostgreSQL ne garantit pas l'ordre de deux cascades
 * parties du même compte. Le stock, puis les aliments, puis le compte — comme
 * le fait `ComptesController::supprimer`.
 */
export function supprimerCompte(email: string): void {
  sql(`DELETE FROM stock WHERE aliment_id IN (
         SELECT a.id FROM aliment a JOIN utilisateur u ON u.id = a.utilisateur_id
          WHERE u.email = '${email}')`);
  sql(`DELETE FROM aliment WHERE utilisateur_id IN (
         SELECT id FROM utilisateur WHERE email = '${email}')`);
  sql(`DELETE FROM utilisateur WHERE email = '${email}'`);
}

/** Combien de comptes jetables traînent encore. Doit valoir 0 à la fin. */
export const comptesJetablesRestants = (): number =>
  Number(sql(`SELECT count(*) FROM utilisateur WHERE email LIKE '%${SUFFIXE}'`));

/** Les aliments d'un compte, pour vérifier ce qui est VRAIMENT entré en base. */
export const alimentsDe = (email: string): { nom: string; kcal: number; ratio: number }[] => {
  const lignes = sql(`SELECT a.nom || '|' || a.kcal_100 || '|' || a.ratio
                        FROM aliment a JOIN utilisateur u ON u.id = a.utilisateur_id
                       WHERE u.email = '${email}' ORDER BY a.nom`);

  return lignes === '' ? [] : lignes.split('\n').map((l) => {
    const [nom, kcal, ratio] = l.split('|');

    return { nom: nom ?? '', kcal: Number(kcal), ratio: Number(ratio) };
  });
};

/**
 * Les cuissons habituelles d'un compte, telles que la base les tient VRAIMENT.
 *
 * `majLe` est rendu en secondes depuis l'époque (`EXTRACT(EPOCH …)`), et non
 * en texte : la clause `ON CONFLICT … WHERE … IS DISTINCT FROM` (25 septembre
 * 2026) ne touche pas la ligne quand le mode envoyé est celui déjà en base —
 * `maj_le` ne bouge pas du tout, y compris à la microseconde. Une épreuve qui
 * comparerait des horodatages en texte pourrait manquer un arrondi ; un nombre
 * se compare pour une stricte égalité sans ambiguïté.
 */
export const habitudesDe = (
  email: string,
): { aliment: string; mode: number | null; majLe: number }[] => {
  const lignes = sql(`SELECT c.aliment || '|' || coalesce(c.mode_cuisson_id::text, '') || '|'
                              || extract(epoch from c.maj_le)
                        FROM cuisson_habituelle c JOIN utilisateur u ON u.id = c.utilisateur_id
                       WHERE u.email = '${email}' ORDER BY c.aliment`);

  return lignes === '' ? [] : lignes.split('\n').map((l) => {
    const [aliment, mode, majLe] = l.split('|');

    return { aliment: aliment ?? '', mode: mode === '' ? null : Number(mode), majLe: Number(majLe) };
  });
};

/** Où répond l'API — la même adresse que le navigateur des épreuves. */
const BASE = process.env.FITCARNET_URL ?? 'http://localhost:8080';

/** Un jeton, pour préparer une situation sans passer par l'écran. */
export async function jetonDe(email: string): Promise<string> {
  const reponse = await fetch(`${BASE}/api/connexion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, motDePasse: MOT_DE_PASSE }),
  });

  if (!reponse.ok) {
    throw new Error(`connexion refusée pour ${email} : ${reponse.status}`);
  }

  return (await reponse.json() as { token: string }).token;
}

/**
 * Monte une séance par l'API et rend son identifiant.
 *
 * PAR L'API ET NON EN SQL : une séance posée à la main pourrait violer une
 * règle que le serveur applique, et l'épreuve éprouverait alors une situation
 * qui ne peut pas arriver. C'est du *montage*, pas ce qu'on éprouve — ce qu'on
 * éprouve vient après, à l'écran.
 */
export async function creerSeance(email: string, corps: unknown): Promise<string> {
  const reponse = await fetch(`${BASE}/api/seances`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/ld+json',
      Authorization: `Bearer ${await jetonDe(email)}`,
    },
    body: JSON.stringify(corps),
  });

  if (!reponse.ok) {
    throw new Error(`séance refusée (${reponse.status}) : ${await reponse.text()}`);
  }

  return String((await reponse.json() as { id: number | string }).id);
}

/** Ce que le SERVEUR dit de l'avancement — l'autre compteur de l'application. */
export async function avancementServeur(
  email: string,
  id: string,
): Promise<{ faites: number; total: number }> {
  const reponse = await fetch(`${BASE}/api/seances/${id}`, {
    headers: { Authorization: `Bearer ${await jetonDe(email)}` },
  });

  return (await reponse.json() as { avancement: { faites: number; total: number } }).avancement;
}

/**
 * Ouvre l'application et se connecte, par l'écran.
 *
 * ON PASSE PAR LE FORMULAIRE, pas par un jeton posé à la main : c'est le
 * chemin de l'utilisateur, et c'est lui qu'on veut éprouver. Un jeton injecté
 * sauterait justement la partie qui casse.
 */
export async function seConnecter(page: Page, email: string): Promise<void> {
  await page.goto('/connexion');

  /* Les repères viennent du code de l'écran, pas d'une supposition :
     `app/connexion.tsx` pose `placeholder="email@exemple.com"` et un champ
     `motDePasse`, que React Native Web rend en `input[type=password]`. Ma
     première sonde Playwright, le 20 septembre 2026, avait tapé dans la barre
     de recherche du frigo en croyant viser l'éditeur — et j'ai failli en
     conclure que le sélecteur était cassé. On lit l'écran avant de le
     piloter. */
  await page.getByPlaceholder('email@exemple.com').fill(email);
  await page.locator('input[type="password"]').first().fill(MOT_DE_PASSE);
  await page.getByText('Se connecter', { exact: true }).click();

  /* On attend un élément de l'application connectée, pas un délai : une
     attente fixe rend l'épreuve lente ET fragile à la fois. */
  await expect(page).toHaveURL(/onglets|seances|frigo/, { timeout: 15_000 });
}
