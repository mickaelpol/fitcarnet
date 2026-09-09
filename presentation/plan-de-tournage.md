# fitcarnet — script de tournage

Pour filmer les 57 fonctionnalités de [features.md](features.md) **depuis ton
téléphone**, sur l'application de production.

Chaque plan donne : le **geste** exact, ce qu'on doit **voir** à l'écran, ce que
tu **dis** si tu commentes, et une **durée**. Les durées sont des minimums : à
l'écran, un geste trop rapide est un geste illisible.

**Huit bobines indépendantes.** Chacune dit son état de départ. Tu peux en
retourner une sans refaire les autres — et tu le feras, personne ne réussit une
bobine du premier coup.

---

# Partie I — Préparer

## 1. Enregistrer l'écran du téléphone

| Solution | Pour qui | Ce qu'il faut savoir |
|---|---|---|
| **scrcpy** *(recommandé)* | Android, depuis le PC | Gratuit, libre, sans filigrane ni publicité. Le téléphone s'affiche sur ton écran et s'enregistre en MP4. Tu pilotes à la souris **ou** au doigt. `scrcpy --record demo.mp4 --max-size 1080` |
| **Enregistreur intégré** | Android 11 et plus | Aucune installation : volet des raccourcis → « Enregistrement d'écran ». Le plus simple, mais l'interface d'enregistrement apparaît parfois à l'image. |
| **AZ Screen Recorder** | Android | Facilite le recadrage et la coupe sur le téléphone même. Version gratuite avec publicités — vérifie qu'aucune n'apparaît à l'écran pendant la prise. |
| **QuickTime** | iPhone + Mac | Câble Lightning, `Nouvel enregistrement vidéo` → source : le téléphone. |

**Pourquoi scrcpy plutôt qu'un autre** : il n'ajoute rien à l'image — ni bouton
flottant, ni compte à rebours, ni filigrane — et il enregistre la définition
réelle de l'écran. C'est le seul dont on ne voit pas qu'il était là.

### Où l'installer : sur Windows, pas dans WSL

**WSL2 n'a aucun accès USB.** Vérifié le 9 septembre 2026 sur cette machine :
`/dev/bus/usb` n'y contient que les deux hubs racine, et aucun téléphone ne peut
y apparaître sans `usbipd-win`. L'affichage, lui, ne pose pas de problème — WSLg
est présent (`DISPLAY=:0`), une fenêtre scrcpy s'afficherait très bien.

Trois voies, de la plus simple à la plus laborieuse :

**1. scrcpy sur Windows** — recommandé. Le zip des *releases* GitHub est
autonome : `adb` est dedans, il n'y a rien à installer. On branche le téléphone
en USB et c'est fini. Les MP4 atterrissent dans `C:\…`, que WSL lit par `/mnt/c/`.

**2. scrcpy dans WSL, en ADB sans fil** — si l'on tient à rester sous Linux.
Pas d'USB du tout : le débogage sans fil d'Android 11+ suffit, et WSL2 joint le
réseau local.

```bash
sudo apt install scrcpy android-tools-adb
# téléphone : Options développeur → Débogage sans fil → Associer un appareil
adb pair 192.168.x.x:PORT        # le code à six chiffres affiché sur le téléphone
adb connect 192.168.x.x:5555
scrcpy --record ~/tournage/bobine-1.mp4 --max-size 1080 --stay-awake
```

**3. USB depuis WSL via `usbipd-win`** — possible, mais il faut l'installer côté
Windows, puis `usbipd bind --busid …` en administrateur et `usbipd attach --wsl`
**à chaque branchement**. Beaucoup de friction pour filmer une vidéo.

## 2. Régler le téléphone avant la première prise

- **Ne pas déranger** activé — une notification en pleine démonstration est perdue.
- Batterie au-dessus de 50 %, ou branché : l'icône de batterie faible se voit.
- **Luminosité fixe**, automatique désactivée : sinon la vidéo change de teinte.
- Barre d'état la plus vide possible.
- Si tu filmes en français devant un client, vérifie que le clavier ne propose pas
  de suggestions embarrassantes au moment où tu tapes.

## 3. Les deux comptes de production

Sur le NAS. Les conteneurs de production s'appellent `fitcarnet-app` et
`fitcarnet-db` — et non `…-dev`, qui sont ceux de ta machine.

```bash
ssh nas
# le compte ordinaire, celui qui porte la démonstration
docker exec -it fitcarnet-app php bin/console \
    fitcarnet:creer-utilisateur demo@ton-domaine "Démonstration"

# le compte administrateur, pour les bobines 1 et 8
docker exec -it fitcarnet-app php bin/console \
    fitcarnet:creer-utilisateur demo-admin@ton-domaine "Démo administration" --admin
```

`-it` est **nécessaire** : sans lui la commande ne peut pas demander le mot de
passe et échoue. Les deux **demandent le mot de passe sans l'afficher** — c'est
toi qui le choisis, il n'apparaît ni dans l'historique du terminal ni ici.

Ne mets pas `--grocy` : ce drapeau bascule le frigo sur Grocy.

Puis charge les données de démonstration, **dans le compte de démonstration
seulement**. Depuis ta machine, en envoyant les fichiers par SSH :

```bash
sed 's/essai@fitcarnet.local/demo@ton-domaine/' db/manuel/jeu-essai.sql \
  | ssh nas 'docker exec -i fitcarnet-db psql -U fitcarnet -d fitcarnet'

sed 's/demo@fitcarnet.local/demo@ton-domaine/' db/manuel/jeu-demo.sql \
  | ssh nas 'docker exec -i fitcarnet-db psql -U fitcarnet -d fitcarnet'
```

**Relis l'adresse dans les deux `sed` avant d'appuyer sur Entrée.** C'est la
seule chose qui sépare un compte de démonstration de ton compte personnel.

> **Le garde-fou de `jeu-demo.sql`** refuse tout compte qui a déjà des séances :
> il EFFACE avant de poser, et une adresse mal recopiée détruirait un historique
> réel. Si le message apparaît sur un compte qui est bien celui de démonstration,
> relance avec `psql -v ecraser=oui`. **Si le message nomme ton compte
> personnel, arrête tout** : l'adresse est fausse.

---

# Partie II — Le script

---

## Bobine 1 · On arrive · ~2 min

> **État de départ** : session **administrateur** sur le téléphone. Un second
> appareil ou un navigateur privé pour recevoir l'invitation.

**1.1 — L'onglet Compte** · 8 s
*Geste* : ouvre l'onglet **Compte**, en bas à droite.
*À l'écran* : les boutons d'administration, visibles seulement pour un admin.
*Tu dis* : « Un compte fitcarnet ne se crée pas tout seul. On entre par invitation, et c'est un administrateur qui l'envoie. »

**1.2 — Inviter** · 25 s *(F4)*
*Geste* : **Utilisateurs** → saisis une adresse → **Inviter**.
*À l'écran* : l'invitation apparaît dans la liste, avec son lien.
*Tu dis* : « J'invite une adresse. L'application fabrique un lien à usage unique. »

**1.3 — Recevoir** · 40 s *(A2)*
*Geste* : ouvre le lien sur l'autre appareil.
*À l'écran* : « Vérification du lien… », puis « Ton nom », « Mot de passe », « Répète-le ».
*Tu dis* : « Voilà ce que reçoit la personne invitée. Elle choisit son nom et son mot de passe — l'administrateur ne les connaît jamais. »
*Geste* : valide.
*À l'écran* : on entre dans l'application, frigo vide.
*Tu dis* : « Et elle est dedans. Frigo vide : chaque compte part de zéro et ne verra jamais les données d'un autre. »

**1.4 — Côté administrateur** · 20 s *(F5)*
*Geste* : reviens sur la session admin, rafraîchis la liste.
*À l'écran* : le compte est actif.
*Tu dis* : « De ce côté, l'invitation est consommée et le compte est actif. Je peux le désactiver ou le supprimer. »

**1.5 — Révoquer** · 15 s
*Geste* : crée une seconde invitation, puis **révoque-la** sans l'utiliser.
*Tu dis* : « Et une invitation qui n'a pas servi se révoque. »

> **Remise à zéro** : supprime le compte créé, depuis le même écran.

---

## Bobine 2 · On règle ses objectifs · ~1 min 30

> **État de départ** : session **ordinaire** (`demo@`).

**2.1 — Le compte** · 10 s *(A5)*
*Geste* : onglet **Compte**.
*Tu dis* : « Ici, ce qui appartient à l'utilisateur : ses objectifs, ses réglages. »

**2.2 — Les objectifs** · 45 s *(C2)*
*Geste* : **Objectifs**. Fais défiler lentement.
*À l'écran* : calories, protéines, glucides totaux, lipides.
*Tu dis* : « Les cibles ne sont pas un total pour la journée : il y en a une par repas. C'est ce qui permet de composer un petit-déjeuner qui ne ressemble pas à un dîner. »
*Geste* : modifie une valeur, enregistre, ressors, reviens.
*Tu dis* : « Ça a tenu. »

**2.3 — Les glucides totaux** · 20 s
*Geste* : arrête-toi sur l'intitulé « Glucides totaux ».
*Tu dis* : « "Totaux" veut dire fibres comprises. C'est la convention européenne — les fibres comptent 2 kilocalories par gramme, pas 4 et pas 0. La plupart des applications se trompent là-dessus, et l'écart se voit sur un régime riche en fibres. »

**2.4 — Réglages** · 10 s *(A6)*
*Geste* : entre, montre, ressors.

---

## Bobine 3 · On remplit le frigo · ~3 min

> **État de départ** : `jeu-essai.sql` chargé sur le compte.

**3.1 — Le stock** · 25 s *(B1)*
*Geste* : onglet **Mon frigo**, défile lentement sur toute la liste.
*À l'écran* : « 12 en stock sur 14 », les aliments groupés par emplacement.
*Tu dis* : « Voilà ce qu'il y a dans le frigo. Rangé par emplacement — frigo, congélateur, placard — avec les valeurs pour cent grammes. »

**3.2 — Le détail, et le poids cru** · 30 s *(B2, B4)*
*Geste* : ouvre « Blanc de poulet ».
*À l'écran* : macros, et **« 100 g → 75 g »** à la cuisson.
*Tu dis* : « Et la mention qui décide de tout : poids cru. Le riz sec vaut 350 kilocalories aux cent grammes, cuit il en vaut 130. Si on confond les deux, tous les chiffres de l'application sont faux. Ici on pèse toujours cru, et le rendement de cuisson est écrit. »

**3.3 — Chercher** · 15 s *(B3)*
*Geste* : tape « poul » dans le champ de recherche.
*Tu dis* : « Sur un frigo de quarante lignes, on cherche. »

**3.4 — Ajouter depuis le catalogue** · 35 s *(B5)*
*Geste* : **Ajouter un aliment** → la liste des 50 aliments de référence → choisis-en un.
*Tu dis* : « Cinquante aliments de référence, vérifiés, communs à tous les comptes. On part de là plutôt que de retaper des valeurs. »

**3.5 — Créer de zéro** · 40 s *(B5)*
*Geste* : **Ajouter un aliment** → **Créer de zéro** → saisis un nom et des valeurs.
*Tu dis* : « Et si le produit n'y est pas, on le crée. Il reste privé : personne d'autre ne le verra, et il ne polluera pas le catalogue commun. »

**3.6 — Corriger une quantité** · 15 s *(B6)*
*Geste* : modifie la quantité d'une ligne à la main.

**3.7 — Supprimer** · 20 s
*Geste* : supprime l'aliment créé en 3.5.
*Tu dis* : « Et on peut le retirer. »

> **Remise à zéro** : rejoue `jeu-essai.sql`.

---

## Bobine 4 · On planifie la semaine · ~5 min — **la bobine décisive**

> **État de départ** : frigo garni, aucun plan enregistré.

**4.1 — Les cibles du jour** · 25 s *(C1)*
*Geste* : onglet **Repas**. Étape 1.
*À l'écran* : Matin, Midi, 16 h, Soir, chacun avec ses macros.
*Tu dis* : « Quatre repas, quatre cibles. Je coche ceux que je veux cuisiner et je dis pour combien de personnes. »

**4.2 — Plusieurs jours** · 20 s *(C3)*
*Geste* : active **Plusieurs jours**, change le nombre de convives d'un repas.
*Tu dis* : « Et je peux cuisiner pour plusieurs jours d'un coup — c'est là que ça devient intéressant. »

**4.3 — Composer** · 30 s *(C4)*
*Geste* : **Composer les repas**. **Ne parle pas pendant le calcul** : laisse voir.
*Tu dis, une fois le résultat affiché* : « L'application a composé les quatre repas à partir de ce qu'il y a réellement dans le frigo. Ce n'est pas du tâtonnement : c'est un système d'équations résolu par élimination de Gauss, sous contrainte du stock disponible. »

**4.4 — Le tableau** · 30 s *(C5)*
*Geste* : arrête-toi sur les colonnes.
*Tu dis* : « À peser, servi, une personne. La première colonne, c'est ce que je mets sur la balance — avant cuisson. La dernière, ce que je me sers. »

**4.5 — Les avertissements** · 40 s *(C10)* — **le moment fort**
*Geste* : fais défiler jusqu'aux bandeaux rouge et ambre.
*Tu dis, en lisant* : « "Des données de ton frigo rendent le calcul faux. Boulgour : 83 kilocalories aux cent grammes de grain sec, alors qu'un grain sec en fait 300 à 400 — c'est une borne physique, pas une moyenne." L'application refuse de calculer sur des chiffres qui ne peuvent pas être vrais. Et juste en dessous : "fibres inconnues sur six aliments, l'écart atteint 17 % sur un pain complet." Elle le dit avant de cuisiner, pas après. »

**4.6 — Les cuissons** · 35 s *(C8, C9)*
*Geste* : bascule un aliment de cru à cuit, puis règle le reste d'un coup.
*Tu dis* : « Chaque aliment se pèse cru ou cuit, au choix. Et l'application retient : la prochaine fois, elles seront déjà remplies avec ce que j'avais fait. »

**4.7 — Ajuster** · 45 s *(C6, C7)*
*Geste* : **remplace** un aliment ; déclare un **« reste »** sur un autre ; mets-en un à **0** ; **ajoute** un aliment hors proposition.
*Tu dis* : « Je change ce qui ne me va pas, et les quantités se recalculent toutes seules pour retomber sur mes objectifs. S'il me reste un fond de casserole, je l'écris dans "reste" et le calcul en sert ce qu'il faut, pas plus. »

**4.8 — Les compléments** · 20 s *(C11)*
*Geste* : ajoute un complément à un repas.
*Tu dis* : « Et les compléments se rattachent au repas. »

**4.9 — Le batch cooking** · 40 s *(C12)*
*Geste* : **Passer au batch cooking**. Montre les fournées, puis les boîtes.
*Tu dis* : « Là, on ne raisonne plus en repas mais en cuissons. Ce qui part au four ensemble, ce qui va à la casserole. Puis la répartition en boîtes : la colonne "boîte" c'est ce qu'on y met pour tout le monde, la colonne "une personne" c'est ce qu'on se sert le jour venu. »

**4.10 — La liste de courses** · 20 s *(C13)*
*Geste* : montre la liste.
*Tu dis* : « Et ce qu'il manque, on l'achète. »

**4.11 — Enregistrer** · 25 s *(C14, C15)*
*Geste* : nomme le plan, enregistre. Reviens à l'étape 1.
*À l'écran* : « Mes plans enregistrés · 1 en attente de cuisson ».
*Tu dis* : « Le plan est figé. Pas une recette à rejouer : un instantané. Dans trois jours, je veux savoir ce que j'ai cuisiné dimanche, pas ce que je cuisinerais aujourd'hui. »

---

## Bobine 5 · On cuisine, puis on range · ~3 min

> **État de départ** : un plan enregistré non cuisiné.
> **Le travailleur de fond doit tourner** (voir la préparation).

**5.1 — Avant** · 15 s
*Geste* : va au frigo, montre la quantité de deux ou trois aliments du plan.
*Tu dis* : « Retenez ces quantités. »

**5.2 — J'ai cuisiné** · 30 s *(C16)*
*Geste* : ouvre le plan, appuie sur **« J'ai cuisiné »**.
*Tu dis* : « Un seul geste : le plan est marqué cuisiné, et le frigo est décrémenté de ce qui est parti. »

**5.3 — Après** · 20 s
*Geste* : retourne au frigo.
*Tu dis* : « Les quantités ont baissé. Sans que j'aie rien ressaisi. »

**5.4 — L'inventaire** · 40 s *(B7, B10)*
*Geste* : onglet **Inventaire**. Corrige **trois** lignes seulement.
*À l'écran* : le compteur « n écart ».
*Tu dis* : « Une fois par semaine, je pèse. Je ne ressaisis pas quatorze aliments : je corrige les trois qui ont bougé. Une ligne que je ne touche pas n'est pas un zéro — elle n'a pas été comptée, et son stock ne bouge pas. »
*Geste* : appuie sur **Réinitialiser**, puis ressaisis.
*Tu dis* : « Et si je me trompe, je repars. »

**5.5 — L'envoi** · 30 s *(B8)*
*Geste* : **Enregistrer n corrections**.
*À l'écran* : « Inventaire en cours — 0 / 3 lignes. Tu peux quitter l'écran, ça continue tout seul. »
*Tu dis, en lisant le message* : « Regardez : l'écran rend la main immédiatement. Le traitement continue sans lui. »

**5.6 — On quitte, on revient** · 30 s *(B9)*
*Geste* : change d'onglet, attends, reviens.
*À l'écran* : « Inventaire appliqué : 3 corrections ».
*Tu dis* : « J'ai changé d'écran, je suis revenu, c'était fait. Et si j'avais fermé l'application, je retrouverais le résultat au retour. Ce n'est pas un détail de confort : une requête HTTP a une durée maximale, un inventaire n'en a pas. Les faire coïncider nous a coûté un frigo à moitié corrigé, un soir d'août. »

**5.7 — Supprimer un plan** · 15 s *(C17)*

---

## Bobine 6 · Les programmes · ~2 min 30

**6.1 — La liste** · 15 s *(E1)*
*Geste* : onglet **Modèles**.
*Tu dis* : « Les programmes types. Ce sont les patrons d'où partent les séances. »

**6.2 — Le détail** · 40 s *(E2)*
*Geste* : ouvre « Haut du corps — poussée ».
*À l'écran* : les exercices, les séries cibles en répétitions et charge.
*Tu dis* : « Trois exercices, et pour chacun les séries prescrites : quatre fois huit à 55 kilos. C'est ce qui sera pré-rempli quand je commencerai la séance. »

**6.3 — Ajouter, retirer** · 30 s *(E3)*
*Geste* : **Ajouter un exercice**, puis retire-le (la confirmation apparaît).

**6.4 — Réordonner et appliquer** · 45 s *(E4)*
*Geste* : change l'ordre des exercices → « **Appliquer cet ordre à tes séances ?** » → **Appliquer**.
*Tu dis* : « Et quand je change l'ordre, je peux le répercuter sur mes séances à venir. »

> **À NE PAS FILMER** : le **partage d'un modèle** *(E5)*. Il est inopérant —
> constat F-05 de l'audit. Ne le montre pas tant qu'il n'est pas corrigé.

---

## Bobine 7 · On s'entraîne · ~4 min

**7.1 — La liste** · 20 s *(D1)*
*Geste* : onglet **Séances**, défile.
*À l'écran* : Push, Pull, Legs, les dates, « 9/9 séries ».
*Tu dis* : « Neuf semaines de séances. Le type, la date, et combien de séries ont été faites. »

**7.2 — Depuis un modèle** · 35 s *(D11)*
*Geste* : **+ Nouvelle séance** → choisis un modèle.
*Tu dis* : « Je pars d'un programme : les exercices et les séries cibles sont déjà là. »

**7.3 — Saisir** · 40 s *(D2)*
*Geste* : coche une série, saisis répétitions et charge.
*Tu dis* : « Pendant la séance, je coche et je saisis. C'est fait pour être utilisable avec les mains moites, entre deux séries. »

**7.4 — Le rappel de la dernière fois** · 20 s *(D5)*
*Geste* : montre le bandeau ambre en haut de l'exercice.
*Tu dis* : « Et juste au-dessus : ce que j'avais fait la dernière fois. Huit fois 47,5. C'est ce qui me dit si je monte. »

**7.5 — Le 1RM** · 45 s *(D4)* — **le moment fort**
*Geste* : saisis une charge plus lourde. **Reste sur le nombre.**
*À l'écran* : le 1RM se recalcule, la variation s'affiche.
*Tu dis* : « Le 1RM estimé — la charge maximale sur une répétition — se recalcule à chaque saisie. Et en dessous, la progression : plus 2,8 kilos sur neuf séances. La formule est écrite à un seul endroit dans tout le code ; trois copies aux règles divergentes avaient produit un record que la formule elle-même déclarait invalide. »

**7.6 — Les trois modes** · 30 s *(D3)*
*Geste* : bascule un exercice sur **Tenue**, puis **Chrono**.
*Tu dis* : « Tout ne se mesure pas en charge : il y a les tenues, en secondes, et les chronos. »

**7.7 — Le minuteur** · 25 s *(D6)*
*Geste* : lance **1:30**, laisse tourner cinq secondes.
*Tu dis* : « Et le repos se minute, sans quitter la séance. »

**7.8 — Le disque RM** · 30 s *(D7)*
*Geste* : appuie sur **RM**.
*Tu dis* : « Le calculateur de charge : à partir d'un maximum, ce qu'il faut mettre sur la barre pour un pourcentage donné. »

**7.9 — Notes, séries, totaux** · 30 s *(D8, D9, D10)*
*Geste* : écris une note, ajoute une série, montre « répétitions / kilos soulevés ».

**7.10 — En modèle** · 20 s *(D12)*
*Geste* : transforme la séance en modèle.
*Tu dis* : « Et une séance qui m'a plu devient un programme. »

**7.11 — Supprimer** · 15 s *(D14)*

> **Remise à zéro** : rejoue `jeu-demo.sql` avec `-v ecraser=oui`.

---

## Bobine 8 · On administre · ~3 min

> **État de départ** : session **administrateur**.

**8.1 — Le catalogue d'exercices** · 60 s *(F1)*
*Geste* : Compte → **Exercices**. Fais défiler, ouvre-en un, montre ses champs.
*À l'écran* : groupes, équipement, muscle ciblé, format prescrit.
*Tu dis* : « Le catalogue commun. Un exercice porte son équipement, son muscle ciblé, le format prescrit. C'est ce que tout le monde utilise. »

**8.2 — Créer** · 30 s *(F1)*
*Geste* : crée un exercice, enregistre.

**8.3 — Fusionner** · 40 s *(F2)*
*Geste* : **Fusion** → sélectionne deux doublons → la confirmation.
*Tu dis* : « Quand deux exercices désignent la même chose, on les fusionne — et l'historique des séances suit. »

**8.4 — Les modes de cuisson** · 25 s *(F3)*
*Geste* : **Cuissons** → ajoute un mode.
*Tu dis* : « La table des cuissons : plancha, vapeur, four. C'est elle qui alimente les rendements cru-cuit du calculateur. »

**8.5 — Les comptes** · 30 s *(F5)*
*Geste* : **Utilisateurs** → désactive un compte, réactive-le.
*Tu dis* : « Et un compte se désactive sans être supprimé. Ses données restent. »

> **Impasse connue** : la source **Grocy** *(B11 à B13)* n'est tournable que si
> `GROCY_URL` est renseigné sur l'instance filmée. Sinon l'écran affiche
> « Grocy n'est pas configuré côté serveur ».

---

# Partie III — Après le tournage

## Remettre les données à zéro entre deux bobines

```bash
# le frigo, tel qu'au départ
sed 's/essai@fitcarnet.local/<le compte de démo>/' db/manuel/jeu-essai.sql | psql …

# les cibles, programmes, séances et plans
sed 's/demo@fitcarnet.local/<le compte de démo>/' db/manuel/jeu-demo.sql | psql … -v ecraser=oui
```

Le second **efface avant de poser**. Le garde-fou t'arrêtera si l'adresse ne
correspond pas à un compte de démonstration — lis le message plutôt que de
relancer avec le drapeau par réflexe.

## Ce qui reste hors champ

- **La source Grocy** *(B11 à B13)* — selon la configuration de l'instance filmée.
- **Le bandeau de mise à jour** *(A7)* — il n'apparaît qu'après une publication.
- **L'historique et les records antérieurs** *(D13)* — les hooks existent
  (`useHistorique`, `useRecordsAnterieurs`, `useDerniereFois`), je n'ai pas
  identifié l'écran qui les affiche. Cherche pendant la bobine 7 : si tu le
  trouves, ajoute-le au script.

## Un conseil de montage

Tourne **chaque bobine séparément**, sans chercher l'enchaînement parfait. Le
montage recolle. Une prise ratée sur la bobine 4 ne doit jamais t'obliger à
refilmer les sept autres — c'est pour ça qu'elles sont découpées ainsi.
