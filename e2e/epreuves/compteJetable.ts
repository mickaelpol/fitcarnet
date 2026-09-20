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
 * migration du 20 septembre 2026 ; `grocy` sert à éprouver l'autre chemin
 * d'écriture, celui qui n'emprunte pas l'entité `Aliment` — et qui avait été
 * oublié par le palier 1.
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
