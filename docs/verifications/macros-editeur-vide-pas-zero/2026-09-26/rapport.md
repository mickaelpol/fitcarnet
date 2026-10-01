# Vérification macros-editeur-vide-pas-zero — 2026-09-26

Cible : web http://localhost:8080 (bundle `api/front` servi, non reconstruit, à jour du commit `7705947`)

## Verdict global : 13/13 critères PASS

| # | Critère (résumé) | Résultat | Preuve (fichier) | Écart observé |
|---|---|---|---|---|
| CA-1 | Protéines vide → `prot100: ""` envoyé, refus rouge sous Protéines, rien en base | PASS | `CA-1.webm`, `CA-1.png` | aucun |
| CA-2 | Lettre tapée/collée dans un champ numérique → texte inchangé (Calories, pesée) | PASS | `CA-2.webm`, `CA-2.png` | aucun |
| CA-3 | « 42 » + « ,5 » → « 42,5 » | PASS | `CA-3.webm`, `CA-3.png` | aucun |
| CA-4 | « 4,2,1 » accepté par le filtre de frappe, refusé par le serveur | PASS | `CA-4.webm`, `CA-4.png` | aucun |
| CA-5 | Aucun texte rédigé par l'écran (« Renseigne les quatre valeurs » disparu) ; bouton éteint tant qu'une macro obligatoire est vide ; « 0 » dans une macro l'allume | PASS (2 sous-cas) | `CA-5-texte-disparu.webm/png`, `CA-5-zero-allume.webm/png` | aucun |
| CA-7 | Pesées brutes envoyées sans `ratioCandidat`, rendement affiché = celui du serveur | PASS | `CA-7.webm`, `CA-7.png` | aucun |
| CA-12 | « 12,5 » en Protéines → 12.5 en base | PASS | `CA-12.webm`, `CA-12.png` | aucun |
| CA-15 | 422 à l'écriture → éditeur reste ouvert, saisie intacte, refus sous `refus-prot100` | PASS | `CA-15.webm`, `CA-15.png` | aucun |
| CA-R4 | Aliment incohérent hérité : PATCH qui change une valeur en restant incohérent → 422 ; `origine` forgée sans effet ; renommage seul → passe (CA-13) | PASS (3 sous-cas, par requête) | `CA-R4-console.txt` | voir note ci-dessous : l'exemple de données de la fiche ne produit pas d'incohérence réelle, corrigé pour l'épreuve |
| CA-R5 | PATCH sur l'aliment d'un autre compte → 404 avant tout jugement, même avec un corps invalide | PASS (rejeu `alimentDAutrui.spec.ts`) | `CA-R5-console.txt` | aucun |
| CA-R6 | Vérification serveur injoignable → bandeau gris, aucun refus rouge, rendement « inconnu » | PASS | `CA-R6.webm`, `CA-R6.png` | aucun |
| CA-R7 | Écriture serveur injoignable → « Rien n'a été enregistré », saisie intacte, rien en base | PASS | `CA-R7.webm`, `CA-R7.png` | aucun |
| NON-RÉGRESSION | Suite complète `npx playwright test` | PASS — **30/30** épreuves vertes (~1,8 min) | sortie console ci-dessous | aucun |

**13 critères listés dans la fiche, 13 PASS.**

## Écarts détaillés

Aucun FAIL applicatif. Un point mérite d'être détaillé pour ne pas induire en erreur une prochaine vérification.

**CA-R4 — l'exemple de données donné par la fiche (« kcal100=500 avec macros 10/10/10 ») ne produit PAS un aliment incohérent.**

`ControleDesMacros::pour` (`api/src/Service/ControleDesMacros.php`) est volontairement asymétrique : quand les fibres ne sont pas renseignées et que l'écart est NÉGATIF (les macros calculent MOINS de calories que celles annoncées — ce qui est exactement le cas de kcal 500 / macros 10-10-10, calcul = 170 kcal), le verdict rendu est `"ecart"` (avertissement), jamais `"incoherent"` :
> « Sans fibres renseignées, un écart négatif est normal sur un aliment qui en contient... Inutile d'alarmer sur ce cas-là. »

Vérifié directement par requête sur `/api/verification/aliment` :
```
kcal100=500, prot100=10, gluc100=10, lip100=10  →  verdict: "ecart", enregistrable: true
```
Un aliment ainsi inséré directement en base (contournant le juge, comme demandé par la fiche) est donc en réalité **acceptable** pour le serveur — un PATCH qui le retouche ne serait jamais refusé, pour la bonne raison que rien n'est incohérent à ses yeux. La suite du critère (« un PATCH forgé... alors 422 ») ne pouvait donc pas être jouée telle quelle avec cet exemple.

**Correction apportée pour jouer le critère tel qu'il est écrit** : un jeu de données réellement incohérent, avec un écart POSITIF (les macros calculent PLUS de calories que celles annoncées, cas qui n'a pas l'exemption fibres) — `kcal100=10, prot100=20, gluc100=20, lip100=20` (340 kcal calculés contre 10 annoncés, +3300 %, confirmé `verdict: "incoherent", enregistrable: false` par la même route). Avec ce jeu :
- PATCH changeant `prot100` (20→25, reste incohérent) → **422**, message exact du verdict sous `kcal100` ;
- PATCH ne changeant que le `nom` → **200**, valeurs héritées inchangées (CA-13) ;
- PATCH avec une clé `origine` forgée dans le corps → **400**, refusé encore plus tôt que prévu par `RefuserLesChampsInconnus` (« Champ(s) inconnu(s) : origine ») — `origine` n'étant pas une propriété de la ressource, la tentative de contournement est rejetée avant même d'atteindre `AlimentDenormalizer`. La fiche anticipait un 422 (refus par le juge) ; le comportement réel est un 400 (refus par un garde plus en amont), qui protège au moins aussi bien : dans les deux cas, aucune valeur incohérente n'entre en base et l'attaque décrite (imposer un faux point de départ) échoue.

Ni l'un ni l'autre de ces deux constats ne relève d'un défaut applicatif — la coordination `ControleDesMacros` / `RefuserLesChampsInconnus` / `AlimentDenormalizer` protège dans les deux cas exactement ce que CA-R4 vise à garantir : impossible d'aggraver un aliment hérité incohérent par un jeu sur `origine`, possible seulement de le renommer. C'est un écart entre l'exemple illustratif de la fiche et le comportement documenté du serveur, pas un écart entre l'application et sa spécification.

## Non vérifiable

Rien. Les 13 critères ont pu être joués intégralement — 10 dans Chromium (vidéo + capture), 3 par requête HTTP directe (CA-R4, CA-R5 et sa console jointe).

## Ménage

- Chaque épreuve (`macrosEditeur.spec.ts`, `_verifCA5.spec.ts` jetable, scripts `ca-r4*.sh`) a créé son propre compte `@e2e.local` et l'a supprimé (`afterEach` ou nettoyage explicite en fin de script).
- Le fichier d'épreuve jetable `e2e/epreuves/_verifCA5.spec.ts` et la config ad hoc `e2e/playwright.video.config.ts` (jamais suivis par git, `video: 'on'` + `preserveOutput: 'always'` pour obtenir vidéo et capture même sur un test qui passe) ont été supprimés après copie des artefacts.
- Vérifié par SQL, après TOUTES les épreuves ci-dessus ET après le rejeu de la suite complète (30/30, `globalTeardown` compris) :
  ```
  select count(*) from utilisateur where email like '%@e2e.local';
  → 0
  ```
- Aucune autre donnée n'a été touchée : les comptes de sonde (`probe*@e2e.local`) créés pour interroger `/api/verification/aliment` sans écrire d'aliment ont eux aussi été supprimés immédiatement après usage.

## Détail de la non-régression — sortie complète

```
30 passed (1.8m)
```
Comprend, dans l'ordre : `avancementSeance.spec.ts`, `cibleIncoherente.spec.ts`, `habitudesCuisson.spec.ts` (les épreuves déjà présentes dans le dépôt), les 10 épreuves de `macrosEditeur.spec.ts` (CA-1, CA-2, CA-3, CA-4, CA-7, CA-12, CA-15, CA-R6, CA-R7, NON-RÉGRESSION), et `peseesEditeur.spec.ts`. `alimentDAutrui.spec.ts` (CA-R5) a été rejoué séparément (voir `CA-R5-console.txt`) car il ne dépend d'aucun état partagé.

## Fichiers

Dossier : `docs/verifications/macros-editeur-vide-pas-zero/2026-09-26/`

Vidéos + captures (une paire par critère, obtenues via une config Playwright ad hoc `video:'on'`, `screenshot:'on'`, `preserveOutput:'always'`, jamais commitée) :
- `CA-1.webm` / `.png`
- `CA-2.webm` / `.png`
- `CA-3.webm` / `.png`
- `CA-4.webm` / `.png`
- `CA-5-texte-disparu.webm` / `.png` (aucun message rédigé par l'écran)
- `CA-5-zero-allume.webm` / `.png` (glucides à « 0 » sur un blanc de poulet réellement sans glucides — pas un aliment à 0 kcal, refusé pour une raison sans lien avec CA-5)
- `CA-7.webm` / `.png`
- `CA-12.webm` / `.png`
- `CA-15.webm` / `.png`
- `CA-R6.webm` / `.png`
- `CA-R7.webm` / `.png`
- `NON-REGRESSION-scenario.webm` / `.png` (le scénario NON-RÉGRESSION du fichier permanent, pas la suite entière)

Consoles (critères « par requête », sans navigateur) :
- `CA-R4-console.txt`
- `CA-R5-console.txt`

Épreuves utilisées :
- `e2e/epreuves/macrosEditeur.spec.ts` — permanente, non modifiée, 10/10 rejouées.
- `e2e/epreuves/alimentDAutrui.spec.ts` — permanente, non modifiée, rejouée pour CA-R5.
- `e2e/epreuves/_verifCA5.spec.ts` — jetable, écrite pour cette vérification (le fichier permanent n'a pas de test CA-5 dédié), supprimée après copie des artefacts.
- Scripts bash ad hoc (`ca-r4-final.sh` et sondes), exécutés hors dépôt depuis le scratchpad, pour CA-R4 — par requête HTTP directe, sans navigateur.
