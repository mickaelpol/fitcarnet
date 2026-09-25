import { defineConfig, devices } from '@playwright/test';

/**
 * ÉPREUVES DE BOUT EN BOUT — un vrai navigateur, la vraie API, la vraie base.
 *
 * POURQUOI ELLES EXISTENT. Les 741 tests du front et les 564 de l'API ne
 * montent jamais l'application entière : ils éprouvent des fonctions et des
 * composants. Entre les deux, il reste tout ce qui ne casse qu'assemblé — un
 * champ branché sur la mauvaise route, un message que le serveur envoie et que
 * l'écran n'affiche pas, un bouton qui reste actif alors que l'API refusera.
 *
 * Le 20 septembre 2026, trois défauts de ce genre se sont succédé en une
 * heure, tous trouvés à la main par le propriétaire du projet :
 *
 *   - le serveur refusait un aliment incohérent, mais SEULEMENT par l'entité ;
 *     le chemin Grocy, lui, l'acceptait ;
 *   - l'écran affichait « Cohérent » en vert sur ce que le serveur allait
 *     refuser, parce qu'il jugeait avec la moitié des règles ;
 *   - le message de refus attendait les quatre macros pour apparaître.
 *
 * Aucun des 1 293 tests unitaires n'a vu ces trois-là. Ce dossier est là pour
 * qu'ils ne se retrouvent plus jamais à la main.
 *
 * CE QU'ELLES NE FONT JAMAIS : écrire sur une donnée qu'elles n'ont pas créée.
 * Chaque épreuve monte son propre compte jetable en `@e2e.local`, et le
 * `globalTeardown` prouve qu'il n'en reste aucun. C'est la règle de la skill
 * `donnees-de-test`, appliquée au navigateur.
 */
export default defineConfig({
  testDir: './epreuves',
  /* Une seule à la fois : elles partagent la base de développement, et deux
     comptes jetables créés en même temps rendraient les relevés « avant /
     après » illisibles — le piège n° 1 de la passe de contrôle. */
  workers: 1,
  fullyParallel: false,
  /* Pas de nouvelle tentative : une épreuve qui ne passe qu'une fois sur deux
     est un défaut, pas un aléa. La masquer par un `retry` reviendrait à
     écrire un test qui ne peut pas échouer. */
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'rapport' }]],
  globalTeardown: './epreuves/menage.ts',

  use: {
    baseURL: process.env.FITCARNET_URL ?? 'http://localhost:8080',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    /* On garde la trace et la capture des ÉCHECS seulement : un rapport qui
       pèse un gigaoctet ne se lit pas. */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
