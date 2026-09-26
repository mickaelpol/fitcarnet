# Vérification pesees-editeur-aliment-saisienombre — 2026-09-26

Cible : web http://localhost:8080 (bundle déjà servi, non reconstruit)

## Verdict global : 8/8 critères PASS

| # | Critère (résumé) | Résultat | Preuve (fichier) | Écart observé |
|---|---|---|---|---|
| CA-1 | 42,5/96 se relisent « 42,5 »/« 96 » à l'ouverture de la mesure | PASS | `CA-1.webm`, `CA-1-mesure-ouverte.png` | aucun |
| CA-2 | Aliment sans pesée → deux champs vides (pas « 0 », pas « null ») | PASS | `CA-2.webm`, `CA-2-champs-vides.png` | aucun |
| CA-3 | Frappe « 4 »,« 2 »,« , »,« 5 » → « 42,5 », virgule jamais perdue | PASS | `CA-3.webm`, `CA-3-virgule-gardee.png` | aucun |
| CA-4 | 100/230 → « Utiliser ce résultat » → Enregistrer → base = 100/230/2.3 | PASS | `CA-4.webm`, `CA-4-avant-utiliser.png`, `CA-4-avant-enregistrer.png` | aucun (piège de minuterie, voir note) |
| CA-5 | Les deux champs sont des `ChampNombre` (bordure rouge sur saisie illisible) | PASS | `CA-5.webm`, `CA-5-champNombre-bordure.png`, + `editeurAliment.test-rendu.tsx` describe CA-5 | aucun |
| CA-6 | Compte jetable garni par l'API, mesure ouverte dans Chromium, « 42,5 » affiché ; ménage sans reste | PASS | rejeu de `e2e/epreuves/peseesEditeur.spec.ts` (1 passed) | aucun |
| CA-R1 | Pesée illisible (« 4,2,1 », « abc », « -3 ») → bordure rouge, pas de bouton, aucun message propre à l'écran | PASS (3 sous-cas) | `CA-R1-421.webm/png`, `CA-R1-abc.webm/png`, `CA-R1-3.webm/png` | aucun |
| CA-R2 | Correction en « 100 » → bordure disparaît, bouton réapparaît (l'autre pesée étant lisible) | PASS | `CA-R2.webm`, `CA-R2-avant-correction.png`, `CA-R2-apres-correction.png` | aucun |

**8 critères listés dans la fiche, 8 PASS.** (CA-1 et CA-6 jouent le même comportement sous deux angles différents — voir fiche ; comptés comme deux lignes du tableau ci-dessus, mais comme un total de « 8 critères » explicitement demandé par la fiche.)

## Écarts détaillés

Aucun FAIL. Un piège d'épreuve (pas un défaut de l'application) mérite d'être noté pour ne pas induire en erreur une prochaine vérification :

**CA-4 — l'anti-rebond du verdict serveur (250 ms) désactive un instant le bouton « Utiliser ce résultat ».**
`useVerdictAliment` (`front/src/api/hooks/verification.ts`) retarde de 250 ms l'appel au serveur après chaque frappe, et le bouton reste désactivé (`verdictPerime === true`) tant que la réponse sur le candidat n'est pas revenue. Un premier essai de cette épreuve a cliqué immédiatement après avoir tapé « 230 » : Playwright a bien cliqué (l'élément est un `<div>` React Native Web, sans attribut HTML `disabled`, donc aucune erreur n'est levée), mais l'application n'a rien fait — `setMesurer(false)` n'a jamais été appelé, et l'écran est resté sur la mesure avec le ratio du guide inchangé (2,26 au lieu de 2,3). Ce n'est PAS un défaut applicatif : c'est le comportement voulu (« pas de bouton actif sur un verdict périmé », commenté dans `editeurAliment.tsx`). L'épreuve corrigée attend 800 ms après la frappe avant de cliquer, ce qui laisse le temps à la vérification serveur de revenir. Signalé ici pour qu'une future épreuve sur ce bouton ne conclue pas à tort à un défaut.

**Second piège d'épreuve, sans conséquence sur le verdict** : le texte « Corriger les valeurs » reste visible sur la ligne dépliée du frigo même après la fermeture de la modale d'édition — ce n'est donc pas un bon témoin de fermeture de modale. L'épreuve corrigée attend la disparition du bouton « Annuler », propre à la modale.

## Non vérifiable

Rien. Les 8 critères ont pu être joués intégralement dans Chromium, avec vérification de bout en bout jusqu'à la base pour CA-4 (lecture `GET /api/aliments/{id}` après l'enregistrement réel).

## Détail de CA-4 — preuve de bout en bout

Relu par l'API après clic sur « Enregistrer » :
```
peseeAvant = 100
peseeApres = 230
ratio      = 2.3
```
Le serveur n'a opposé aucun refus.

## Détail de CA-5

La preuve comportementale (bordure rouge sur saisie illisible, capturée dans `CA-5.webm`/`CA-5-champNombre-bordure.png`) est complétée par la preuve structurelle déjà présente dans le dépôt : `front/src/composants/editeurAliment.test-rendu.tsx`, `describe('CA-5 : ce sont des ChampNombre, aucune pesée tenue à la main — porté sur le SOURCE')`, qui relit le code source et vérifie que les étiquettes « Poids avant cuisson » / « Poids après cuisson » sont bien portées par la balise `<ChampNombre>` et non par un `useState('')` texte tenu à la main.

## Ménage

- Compte jetable créé par chaque test (`verif-pesees-*@e2e.local`), supprimé en `afterEach`.
- Vérifié par SQL après la vérification humaine ET après le rejeu complet de la suite permanente (`npm test`, 19/19 PASS, `globalTeardown` compris) :
  ```
  select count(*) from utilisateur where email like '%@e2e.local';
  → 0
  ```
- Le fichier d'épreuve jetable `e2e/epreuves/verificationPesees.spec.ts` a été supprimé après copie des vidéos et captures. Il n'a jamais été suivi par git (`git status` ne le montre pas).
- `e2e/test-results/` et `e2e/rapport/` (artefacts locaux non versionnés) ont été nettoyés.

## Fichiers

Dossier : `docs/verifications/pesees-editeur-aliment-saisienombre/2026-09-26/`

Vidéos (une par critère, `video: 'on'`) :
- `CA-1.webm`, `CA-2.webm`, `CA-3.webm`, `CA-4.webm`, `CA-5.webm`
- `CA-R1-421.webm` (saisie « 4,2,1 »), `CA-R1-abc.webm` (saisie « abc »), `CA-R1-3.webm` (saisie « -3 »)
- `CA-R2.webm`
- Pour CA-6 : la vidéo est produite par le rejeu de `e2e/epreuves/peseesEditeur.spec.ts` (fichier permanent du dépôt, non jetable, non modifié) ; son artefact est éphémère dans `e2e/test-results/` et a été supprimé avec le reste après vérification — le PASS est constaté par la sortie `1 passed` de `npx playwright test epreuves/peseesEditeur.spec.ts`, reproductible à volonté.

Captures :
- `CA-1-mesure-ouverte.png`, `CA-2-champs-vides.png`, `CA-3-virgule-gardee.png`
- `CA-4-avant-utiliser.png`, `CA-4-avant-enregistrer.png`
- `CA-5-champNombre-bordure.png`
- `CA-R1-421.png`, `CA-R1-abc.png`, `CA-R1-3.png`
- `CA-R2-avant-correction.png`, `CA-R2-apres-correction.png`

Épreuve jetable utilisée puis supprimée : `e2e/epreuves/verificationPesees.spec.ts` (n'existe plus dans le dépôt).
Épreuve permanente rejouée sans modification : `e2e/epreuves/peseesEditeur.spec.ts`.
