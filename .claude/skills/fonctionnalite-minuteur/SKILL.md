---
name: fonctionnalite-minuteur
description: Minuter sans quitter sa séance — minuteur de repos (paliers 1:00 / 1:30 / 2:00 / 3:00, relance au cochage, son, vibration, notification système, survie au changement d'écran, écran maintenu allumé) et chronomètre d'effort (tenue par série, temps total « for time », survie au démontage, bandeau de mesure). À charger avec `epreuve-fonctionnalite` pour éprouver et filmer les deux minuteurs.
---

# Minuter le repos et l'effort, sans quitter sa séance

> **Vérifié dans le code le 16 septembre 2026.** C'est la fiche la **moins
> éprouvable sur le web** des trois : le son, la vibration et surtout la
> notification système ne se constatent que sur Android. Voir « Limites
> connues » avant de promettre une couverture.

## Le besoin

Entre deux séries, on ne veut pas sortir de sa séance, ni chercher l'horloge du
téléphone. Le repos doit **se lancer tout seul quand on coche une série**,
compter sans qu'on le regarde, et **signaler la fin même si le téléphone est
dans la poche, écran éteint, musique à fond**. Un repos qu'on rate coûte la
série suivante.

L'autre moitié du besoin est l'inverse : certains efforts **se mesurent** au lieu
de se compter — une tenue isométrique en secondes, un « for time » chronométré
du début à la fin. Là, c'est l'application qui doit tenir le temps pendant qu'on
souffre, et ne pas le perdre parce qu'on a replié un exercice ou changé de mode.

## Ce que l'application propose

### Le minuteur de repos

| Ce que l'utilisateur voit | `fichier:ligne` |
|---|---|
| **Barre fixe en bas de l'écran de séance**, qui garde sa place sous les boutons système d'Android | `front/src/composants/chrono.tsx:104`, marge système `:34-39` |
| **Quatre paliers : 1:00 · 1:30 · 2:00 · 3:00**, affichés en minutes:secondes | `front/src/composants/chrono.tsx:14`, rendu `:147-159`, format `:15` |
| **Durée mémorisée**, 1:30 par défaut | `front/src/composants/etatChrono.ts:17`, `:91-97` |
| **Boutons Go / Stop** et **↺** (« Remettre le chronomètre à zéro ») | `front/src/composants/chrono.tsx:109-124` |
| **Reprise là où on s'est arrêté** — « Go » repart du reste figé, pas de la durée pleine | `front/src/composants/etatChrono.ts:69-75`, `:77-82` |
| **Relance automatique à chaque série cochée** | `front/src/composants/chrono.tsx:46-55`, déclencheur `front/src/composants/serie.tsx:34` → `front/app/seance/[id].tsx:275`, `:281` |
| **Le repos survit au changement d'écran** — l'état vit hors du composant | `front/src/composants/etatChrono.ts:1-15` |
| **Écran maintenu allumé** pendant le décompte, **rendu** dès le passage en arrière-plan | `front/src/composants/chrono.tsx:60`, `front/src/composants/ecranEveille.ts:25-58`, `:48-50` |
| **Son et vibration** en fin de repos — ils ne servent pas au même moment | `front/src/composants/chrono.tsx:164-176` |
| **Cinq sonneries** — Bois, Rappel, Harpe, Cloche, Gong — réglage **propre à l'appareil** | `front/src/composants/sonnerie.ts:33-64`, défaut `:67`, écran `front/app/reglages.tsx` |
| **Notification système programmée** : c'est Android qui sonne, application fermée | `front/src/composants/alarmeRepos.ts:13-31`, `:185-219` |
| **Flux ALARME et non NOTIFICATION** — ce qui la fait sonner téléphone en vibreur ; le volume suit le curseur « alarme » | `front/src/composants/alarmeRepos.ts:127-144` |
| **Un canal Android par sonnerie**, parce qu'Android fige un canal à sa création | `front/src/composants/alarmeRepos.ts:38-56`, `:120-146` |
| **Pas de double bip** — si les minuteurs ont été gelés, c'est la notification qui a sonné, et l'application ne re-sonne pas au retour | `front/src/composants/chrono.tsx:69-88`, signature `alarmeRepos.ts:203-206`, décision `affichageNotification.ts:41-54` |
| **Avertissement si les notifications sont refusées**, avec accès direct aux paramètres | `front/src/composants/chrono.tsx:101`, `:138-145`, `alarmeRepos.ts:169-176` |
| **Le bouton « ⚖ RM »** partage cette barre | `front/src/composants/chrono.tsx:126-130` |

### Le chronomètre d'effort

| Ce que l'utilisateur voit | `fichier:ligne` |
|---|---|
| **Compte vers le haut**, deux usages : tenue isométrique et « for time » | `front/src/composants/chronoSerie.tsx:12-23` |
| **Mode Tenue : un chronomètre par série** | `front/src/composants/serie.tsx:70-79` |
| **Mode Chrono : un temps total** au-dessus des séries, étiqueté **« Temps total de l'exercice »** | `front/src/composants/exerciceSeance.tsx:196-205` |
| **Boutons « ⏱ Go » / « Stop »**, et **×** pour effacer le temps mesuré | `front/src/composants/chronoSerie.tsx:62-83` |
| **La mesure survit au démontage** de son champ : changer de mode, replier l'exercice, faire défiler n'interrompt rien | `front/src/composants/etatMesure.ts:1-17` |
| **Une seule mesure à la fois** — en démarrer une arrête proprement la précédente et met son temps de côté | `front/src/composants/etatMesure.ts:58-68` |
| **Bandeau « mesure en cours »** en haut de l'écran : le libellé de l'exercice, « série N » ou « temps total de l'exercice », le temps, et **Stop** | `front/src/composants/bandeauMesure.tsx:21-61`, monté `front/app/seance/[id].tsx:140` |
| **Le bandeau porte le verrou d'écran** — c'est le seul élément resté monté pendant toute la mesure | `front/src/composants/bandeauMesure.tsx:28`, `:17-20` |
| **Report du temps à la bonne ligne** — appariement sur la position **et** l'exercice ; sans correspondance, **on n'écrit rien** | `front/src/composants/etatMesure.ts:93-115`, `:100-101` |
| **Le temps hérité des anciennes séances est repris** — le chrono était autrefois stocké sur la première série | `front/src/composants/exerciceSeance.tsx:64-66`, repli `front/src/calcul/performance.ts:76-84` |

## Le parcours

**Compte requis** : un compte ordinaire, avec au moins une séance contenant un
exercice. **Plateforme** : Android pour tout ce qui sonne (skill
`verification-android`).

### Repos

1. Ouvrir une séance. La **barre du bas** affiche `1:30` et les quatre paliers
   (`chrono.tsx:104-159`).
2. **Choisir 2:00** : le bouton se borde de la couleur vive, l'affichage passe à
   `2:00`, et le décompte est **à l'arrêt** (`etatChrono.ts:91-97`).
3. **Cocher une série** dans un exercice : le décompte **repart tout seul** sur
   la durée choisie (`chrono.tsx:46-55`).
4. **Quitter l'écran** — aller au frigo, revenir. Le décompte a continué et
   affiche le temps réellement écoulé (`etatChrono.ts:66-67`).
5. **Attendre la fin** : le chiffre passe au rouge à zéro (`chrono.tsx:105`), la
   sonnerie choisie retentit et le téléphone vibre (`:171-176`).
6. **Application fermée**, c'est la **notification système** qui sonne, titrée
   « Repos terminé », corps « Série suivante. » (`alarmeRepos.ts:196-201`).
7. Si les notifications sont refusées, la barre affiche, **pendant le repos** :
   « Aucune alarme hors de l’application : les notifications sont refusées.
   Appuie pour les autoriser. » (`chrono.tsx:138-145`).

### Effort

1. Basculer un exercice sur **Tenue** : chaque série porte son chronomètre
   compact (`serie.tsx:70-79`).
2. **« ⏱ Go »** : le **bandeau** apparaît en haut de l'écran avec le nom de
   l'exercice et « série 1 » (`bandeauMesure.tsx:44-51`).
3. **Basculer sur Charge** pendant que ça tourne : le champ disparaît, **le
   bandeau continue** de compter (`etatMesure.ts:1-17`).
4. **Stop** — depuis le bandeau ou depuis le champ : le temps s'écrit sur la
   ligne dont il vient (`etatMesure.ts:93-115`).
5. En mode **Chrono**, le chronomètre du haut est étiqueté « Temps total de
   l'exercice » et la mesure porte `serieOrdre: null`
   (`exerciceSeance.tsx:196-205`, bandeau `bandeauMesure.tsx:48-50`).

## Critères d'acceptation

1. **Les quatre paliers sont 60, 90, 120 et 180 secondes**, affichés « 1:00 »,
   « 1:30 », « 2:00 », « 3:00 » (`chrono.tsx:14`, `:15`, `:155`).
2. **La durée choisie est mémorisée** et sert à toutes les relances suivantes
   (`etatChrono.ts:17`, `:100-105`).
3. **Cocher une série relance le repos**, à chaque fois — y compris deux séries
   cochées coup sur coup (`chrono.tsx:46-55`). **Décocher ne relance pas**
   (`serie.tsx:34`).
4. **« Go » reprend là où « Stop » avait laissé**, pas à la durée pleine
   (`etatChrono.ts:69-75`). Après « ↺ », il repart de la durée choisie (`:84-89`).
5. **Le repos survit au changement d'écran.** Lancer 3:00, aller dans l'onglet
   Frigo pendant 30 s, revenir : il doit rester ~2:30, pas 3:00
   (`etatChrono.ts:66-67`).
6. **L'écran reste allumé pendant le décompte** et **se reverrouille
   normalement** ensuite (`ecranEveille.ts:25-58`). Le second point compte
   autant : un verrou oublié est pire que pas de verrou (`:9-11`).
7. **Le verrou est rendu en arrière-plan.** Passer l'application en arrière-plan
   pendant une mesure d'effort ne doit pas garder l'écran allumé
   (`ecranEveille.ts:48-50`).
8. **Son ET vibration** en fin de repos (`chrono.tsx:171-176`). Les deux, pas
   l'un ou l'autre.
9. **La sonnerie choisie est celle qu'on entend au premier plan**, parmi les cinq
   (`sonnerie.ts:33-64`, `:107-123`), et le réglage est **propre à l'appareil** :
   « Ce choix est enregistré sur cet appareil. Un autre téléphone gardera le
   sien. » (`front/app/reglages.tsx`).
10. **Application fermée, le système sonne.** Lancer 1:00, fermer l'application,
    attendre : la notification « Repos terminé / Série suivante. » doit arriver
    (`alarmeRepos.ts:196-201`). **C'est le critère qui exige un APK** — voir
    Limites.
11. **Téléphone en vibreur, l'alarme sonne quand même** — flux ALARME
    (`alarmeRepos.ts:141-144`). Et son volume suit le curseur **alarme**, pas
    celui des notifications.
12. **REFUS — pas de double bip.** Lancer un repos, verrouiller l'écran, laisser
    la fin passer, déverrouiller : l'application **ne doit pas** re-sonner au
    retour (`chrono.tsx:69-88`, `:85-87`). Et au **premier plan**, la
    notification ne doit afficher **aucune bannière**, puisque le chrono a déjà
    sonné (`affichageNotification.ts:44-54`).
13. **L'alarme est annulée quand le chrono s'arrête ou se relance** — jamais de
    notification orpheline (`etatChrono.ts:41-46`, `:77-82`, `:100-105`).
14. **REFUS visible — notifications refusées, on le dit.** Refuser la permission,
    lancer un repos : l'avertissement doit apparaître **dans la barre, pendant le
    décompte** (`chrono.tsx:101`, `:138-145`), et y toucher doit ouvrir les
    paramètres du téléphone (`alarmeRepos.ts:169-176`). Une panne silencieuse
    serait indiagnosticable — c'est tout l'objet de ce critère.
15. **Sur le web, l'absence d'alarme n'est pas un défaut** : l'état est
    « indisponible » et **aucun avertissement** ne doit s'afficher
    (`alarmeRepos.ts:103`, garde `chrono.tsx:101`).
16. **La mesure d'effort survit au démontage.** Lancer une tenue, basculer le
    mode sur Charge : le bandeau continue de compter (`etatMesure.ts:1-17`).
    C'était autrefois interdit ; ça ne l'est plus (`exerciceSeance.tsx:171-173`).
17. **Une seule mesure à la fois.** Lancer une tenue sur la série 1, puis « ⏱ Go »
    sur la série 2 : la première **s'arrête et son temps est écrit**, il n'est pas
    perdu (`etatMesure.ts:58-68`).
18. **Le temps atterrit sur la bonne ligne** — y compris après un
    réordonnancement pendant la mesure : l'appariement retombe sur l'exercice
    (`etatMesure.ts:98-101`). **Et sans correspondance, rien n'est écrit** plutôt
    que d'écraser la mauvaise ligne (`:101`). Ce refus est le critère qui compte.
19. **Le bandeau dit ce qu'il mesure** : « série N » pour une tenue, « temps
    total de l’exercice » pour un « for time » (`bandeauMesure.tsx:48-51`).
20. **En mode Chrono, le temps total est un champ à part** et non la somme des
    séries ; mais un exercice ancien, dont le temps était stocké sur les séries,
    doit continuer d'afficher son temps (`exerciceSeance.tsx:64-66`, `:201`,
    `performance.ts:76-84`).
21. **REFUS côté API — pas de temps négatif.** `secondes` et `secondesTotal` sont
    `PositiveOrZero` (`api/src/Entity/Serie.php:46-49`,
    `api/src/Entity/SeanceExercice.php:55-58`) : une valeur négative doit être
    refusée en 422, pas ramenée à zéro.
22. **Le temps mesuré part avec la séance.** Après un arrêt de mesure, la
    sauvegarde automatique doit l'enregistrer comme n'importe quelle autre
    modification (`useSeanceEditable.ts:75-82`).

## Comment l'éprouver

**Android obligatoire** pour les critères 8 à 14 et 6 à 7. Charger la skill
`verification-android`.

```bash
# suivre ce que le système fait des notifications programmées
adb.exe shell dumpsys notification --noredact | head -60

# les canaux créés par l'application : un par sonnerie, usage ALARM
adb.exe shell cmd notification list_channels 2>/dev/null | grep -i repos

# éteindre l'écran pour éprouver le gel des minuteurs (critère 12)
adb.exe shell input keyevent KEYCODE_POWER
```

**Les pièges propres à cette fonctionnalité :**

- **Expo Go n'a plus les notifications distantes.** L'alarme de fin de repos est
  une notification **locale programmée**, ce qui est différent — mais le son
  personnalisé, lui, exige des ressources natives que Expo Go ne fournit pas
  (`alarmeRepos.ts:26-31`). **Hors de l'application, on entend le son de
  notification du téléphone, pas la sonnerie choisie.** C'est une limite assumée,
  pas un défaut : ne pas la rapporter comme une régression.
- **Les canaux Android sont figés à leur création** (`alarmeRepos.ts:38-54`). Si
  un canal a été créé par une version antérieure, changer le réglage **ne change
  rien** tant que le suffixe de version n'a pas bougé. En cas de doute :
  désinstaller l'application du téléphone avant l'épreuve, ou vérifier que les
  canaux `repos_*_1` ont bien été supprimés (`:62-65`).
- **La permission n'est demandée qu'au premier chrono lancé**
  (`alarmeRepos.ts:179`), pas au démarrage. Un test qui ne lance jamais de repos
  ne verra jamais la boîte de dialogue.
- **Le seuil de détection du gel est de 1,5 s entre deux battements**
  (`chrono.tsx:78`). Un émulateur lent peut le franchir **sans** qu'il y ait eu
  gel, et supprimer un bip légitime. Sur émulateur, le critère 12 se conclut avec
  prudence.
- **Le bandeau de mesure n'existe que sur l'écran de séance**
  (`seance/[id].tsx:140`) : quitter la séance pendant une tenue fait disparaître
  le bandeau — la mesure, elle, continue (`etatMesure.ts`). Vérifier au retour.
- **Les modules d'état sont éprouvés hors React** :
  `front/src/composants/etatMesure.test.ts` et
  `front/src/composants/affichageNotification.test.ts`. `etatChrono.ts` et
  `ecranEveille.ts` **n'ont pas de test** — raison de plus pour les éprouver à la
  main.

```bash
npm --prefix /home/micka/perso/fitcarnet/front test
```

## La capture pour la démonstration

Reprend le plan **7.7** de la bobine 7 de `presentation/demonstration.md`,
qui ne prévoit que 25 secondes de minuteur. **C'est trop peu pour montrer ce qui
fait la valeur de cette fonctionnalité** : ce sont les scénarios 02 et 03
ci-dessous qui la portent, et ils **doivent être tournés sur un téléphone**
(`scrcpy`, voir la partie I du plan de tournage).

`presentation/captures/minuteur/` :

| Fichier | Déroulé | Durée | Ce qu'on doit voir |
|---|---|---|---|
| `01-repos.webm` | Choisir 1:30, cocher une série, laisser tourner 10 s | 30 s | Le décompte qui **repart tout seul** au cochage — le geste le plus fréquent en salle |
| `02-survie-ecran.mp4` | Lancer 3:00, aller au Frigo, attendre, revenir | 40 s | Le repos qui a **continué** : on revient, il reste 2:20 |
| `03-alarme-fermee.mp4` | Lancer 1:00, **fermer l'application**, poser le téléphone | 70 s | La notification « Repos terminé · Série suivante. » qui sonne **hors** de l'application, téléphone en vibreur |
| `04-tenue.webm` | Basculer sur Tenue, « ⏱ Go », basculer sur Charge pendant la mesure | 35 s | Le bandeau du haut qui **continue de compter** malgré le changement de mode |
| `05-report.webm` | Stop depuis le bandeau | 20 s | Le temps qui s'écrit **sur la bonne ligne**, celle d'où il vient |
| `06-for-time.webm` | Mode Chrono, mesurer un temps total | 30 s | « Temps total de l'exercice », et le bandeau qui dit « temps total de l’exercice » |

**Ce qu'il faut dire sur le 03** : Android gèle les minuteurs JavaScript dès
qu'on quitte l'application. Le décompte *semblait* continuer — il relit une heure
de fin au retour — mais à zéro, plus aucun code ne s'exécutait : le signal
partait au réveil, parfois une demi-heure trop tard. C'est le système qui sonne
maintenant, sur le flux alarme.

## Limites connues

- **La notification téléphone fermé n'est pas éprouvable dans Expo Go.** C'est
  l'angle mort connu, déjà signalé par `presentation/demonstration.md`
  (partie II·I, et « ce qui reste hors champ ») : **il faut
  l'APK**. Tant qu'on n'en a pas, les critères 10 et 11 restent **non vérifiés**,
  et un rapport qui les coche est faux.
- **La sonnerie choisie ne s'entend pas hors de l'application** tant que les cinq
  fichiers ne sont pas empaquetés dans les ressources natives
  (`alarmeRepos.ts:26-31`). Limite assumée et écrite, à ne pas rapporter comme
  défaut.
- **Le web n'a pas d'alarme du tout** (`alarmeRepos.ts:103`), et la vibration y
  dépend du navigateur (`chrono.tsx:174-175` passe par `navigator.vibrate`, absent
  sur plusieurs navigateurs de bureau). Une capture web ne prouve rien de ce pan.
- **Non vérifié : le comportement sur iOS.** Le code distingue explicitement iOS
  (son porté par la notification et non par un canal, `alarmeRepos.ts:198-201`)
  mais le projet ne cible qu'Android et le web — aucun appareil iOS n'a servi.
- **Non vérifié : deux séries cochées pendant qu'une alarme est en vol.** La file
  d'enchaînement des alarmes existe précisément pour ça
  (`etatChrono.ts:36-39`) ; le cas n'a pas été reproduit, et une notification
  orpheline y serait difficile à observer.
- **Non vérifié : `ecranEveille.ts` et `etatChrono.ts` n'ont aucun test
  automatisé.** Leurs garanties — la course entre prise et relâche du verrou
  (`ecranEveille.ts:13-17`), la reprise depuis le reste figé — reposent
  entièrement sur l'épreuve à la main.
- **Le plan 7.7 du plan de tournage sous-dimensionne cette fonctionnalité** (25 s
  pour « le repos se minute »), et ne mentionne ni la survie au changement
  d'écran, ni l'alarme système, ni le chronomètre d'effort. À compléter si l'on
  reprend la bobine 7.
