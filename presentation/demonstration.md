# fitcarnet — la démonstration

**Ce document est la matière ; le produit se régénère.** Il dit *tout* ce qu'il
faut montrer de l'application, dans quel ordre, avec quel geste, et ce qu'on dit
en le faisant. Il ne se lit pas en entier avant une démonstration : on lit la
partie I (préparer), puis la bobine ou le bloc de minutage qu'on va jouer.

**Un seul point d'entrée le transforme en support projetable :**

```bash
./presentation/preparer-demonstration.sh            # captures + slides + dossier
./presentation/preparer-demonstration.sh --aide     # ce qu'il attend, ce qu'il produit
```

| Sortie | Fichier | Fabriqué par |
|---|---|---|
| **Les images** | `presentation/captures/*.jpg` | `tournage/capturer.mjs` (Playwright) |
| **Les slides** | `presentation/fitcarnet-presentation.html` | `construire.py` |
| **Le document** | `presentation/fitcarnet-dossier.html` | `dossier.py`, **à partir de ce fichier-ci** |
| *(optionnel)* la vidéo | `presentation/fitcarnet-demonstration.mp4` | `tournage/tourner.mjs` + `monter-demo.sh` |

Les quatre sorties sont **ignorées par git** (`presentation/.gitignore`) : on
versionne la matière, pas le produit. Un clone neuf ne les a pas ; la commande
ci-dessus les refait.

> **Ce document est né le 17 septembre 2026 de la fusion de quatre autres** —
> `plan-de-tournage.md` (les huit bobines), `script-narration.md` (ce qu'on dit
> slide par slide), `demo-30-minutes.md` (le montage en trente minutes) et
> `fonctionnalites-revue.md` (la confrontation de l'inventaire du propriétaire
> au code). Préparer une démonstration demandait d'ouvrir huit documents et de
> lancer plusieurs scripts ; deux d'entre eux se contredisaient sur le nombre de
> fonctionnalités, et un troisième envoyait en salle avec un **frigo vide**.
> Les deux documents qui restent à côté sont `features.md` (l'inventaire des
> ~288 capacités avec leur `fichier:ligne`, la matière brute) et
> `fonctionnalites-par-onglet.md` (**la référence du besoin, écrite par le
> propriétaire, qu'on ne modifie pas**).

---

# Partie I — Avant d'entrer dans la salle

## 1. Le jeu de données se charge EN DEUX TEMPS

**C'est l'erreur qui coûte la démonstration**, et trois documents l'avaient
faite avant celui-ci : ils ne citaient que `jeu-demo.sql`. En les suivant à la
lettre, on arrive avec un **frigo vide** — et le frigo, c'est le premier tiers
de la démonstration.

| Ordre | Fichier | Ce qu'il pose | Ce qu'il ne pose pas |
|---|---|---|---|
| **1er** | `db/manuel/jeu-essai.sql` | les **aliments privés et le stock** — 14 aliments, 14 lignes de stock, de quoi exercer le frigo et l'inventaire | aucune séance, aucune cible, aucun plan |
| **2e** | `db/manuel/jeu-demo.sql` | l'**historique** : 4 cibles, 3 programmes, 9 séances hebdomadaires, 2 plans de repas, et un 1RM qui monte de 50,7 à 63,3 kg | **ni aliments ni stock** — son propre en-tête le dit |

En développement, sur le conteneur `fitcarnet-db-dev` :

```bash
# le compte, sans --admin ni --grocy
docker compose -f compose.dev.yml exec app php bin/console \
    fitcarnet:creer-utilisateur demo@fitcarnet.local "Démo fitcarnet"

# 1) le frigo
sed 's/essai@/demo@/' db/manuel/jeu-essai.sql \
  | docker compose -f compose.dev.yml exec -T db psql -U fitcarnet -d fitcarnet

# 2) l'histoire
docker compose -f compose.dev.yml exec -T db psql -U fitcarnet -d fitcarnet \
  < db/manuel/jeu-demo.sql
```

Sur la production (NAS), les conteneurs s'appellent `fitcarnet-app` et
`fitcarnet-db` — **et non `…-dev`, qui sont ceux de ta machine** :

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

**Aucun des deux n'est joué au démarrage.** Ni `installer.sh` ni
`entrypoint-prod.sh` ne les nomment, et leurs listes sont écrites à la main :
ce qui n'y figure pas n'est jamais rejoué. Le jeu de démonstration est un
**fichier**, pas un état de la base — ne compte jamais sur « il doit encore y
être ».

## 2. Les comptes

Deux comptes, et le second n'est nécessaire que pour la bobine 1 et la bobine 8.

```bash
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

**Ne mets pas `--grocy`** : ce drapeau bascule le frigo sur Grocy, et le jeu
d'essai refuse alors de se poser (« Le compte lit Grocy. Ce jeu vise un compte
ordinaire. »).

## 3. Filmer l'écran d'un téléphone

Les captures automatiques (`capturer.mjs`) sont prises **depuis le web**, au
pilote Playwright. Elles suffisent aux slides et au dossier. Pour des images de
téléphone — plus vendeuses devant des commerciaux — il faut filmer soi-même.

| Solution | Pour qui | Ce qu'il faut savoir |
|---|---|---|
| **scrcpy** *(recommandé)* | Android, depuis le PC | Gratuit, libre, sans filigrane ni publicité. `scrcpy --record demo.mp4 --max-size 1080` |
| **Enregistreur intégré** | Android 11 et plus | Aucune installation, mais l'interface d'enregistrement apparaît parfois à l'image. |
| **AZ Screen Recorder** | Android | Recadrage et coupe sur le téléphone. Version gratuite avec publicités — vérifie qu'aucune n'apparaît pendant la prise. |
| **QuickTime** | iPhone + Mac | Câble, `Nouvel enregistrement vidéo` → source : le téléphone. |

**Pourquoi scrcpy plutôt qu'un autre** : il n'ajoute rien à l'image — ni bouton
flottant, ni compte à rebours, ni filigrane. C'est le seul dont on ne voit pas
qu'il était là.

### Où l'installer : sur Windows, pas dans WSL

**WSL2 n'a aucun accès USB.** Vérifié le 9 septembre 2026 sur cette machine :
`/dev/bus/usb` n'y contient que les deux hubs racine, et aucun téléphone ne peut
y apparaître sans `usbipd-win`. L'affichage, lui, ne pose pas de problème —
WSLg est présent (`DISPLAY=:0`).

1. **scrcpy sur Windows** — recommandé. Le zip des *releases* GitHub est
   autonome, `adb` compris. On branche le téléphone en USB et c'est fini. Les
   MP4 atterrissent dans `C:\…`, que WSL lit par `/mnt/c/`.
2. **scrcpy dans WSL, en ADB sans fil** — pas d'USB du tout, le débogage sans
   fil d'Android 11+ suffit :
   ```bash
   sudo apt install scrcpy android-tools-adb
   adb pair 192.168.x.x:PORT        # le code à six chiffres affiché sur le téléphone
   adb connect 192.168.x.x:5555
   scrcpy --record ~/tournage/bobine-1.mp4 --max-size 1080 --stay-awake
   ```
3. **USB depuis WSL via `usbipd-win`** — possible, mais `usbipd bind` puis
   `usbipd attach --wsl` **à chaque branchement**. Beaucoup de friction pour
   filmer une vidéo.

## 4. Régler le téléphone avant la première prise

- **Ne pas déranger** activé — une notification en pleine démonstration est perdue.
- Batterie au-dessus de 50 %, ou branché : l'icône de batterie faible se voit.
- **Luminosité fixe**, automatique désactivée : sinon la vidéo change de teinte.
- Barre d'état la plus vide possible.
- Vérifie que le clavier ne propose pas de suggestions embarrassantes au moment
  où tu tapes devant un client.

## 5. Les images des slides — les remplacer par les tiennes

Les slides embarquent **onze images**. Par défaut, ce sont les captures
automatiques de `capturer.mjs`, prises sur le web en 1440 × 900 : l'application y
paraît étirée, et trois d'entre elles ne montrent pas ce que la slide annonce.
**Tes images passent avant** : pose-les dans **`presentation/images/`**, sous le
nom de l'emplacement — `.png` ou `.jpg`, peu importe. Ce dossier est versionné ;
`captures/`, lui, est réécrit à chaque passe, n'y mets rien à la main.

| Slide | Fichier à poser | Ce que l'image doit montrer | Où la prendre | L'image automatique |
|---|---|---|---|---|
| Le frigo | `04-frigo-stock` | Mon frigo, mode Stock : la liste par emplacement, « poids cru » sous une quantité | plan 3.1 | juste, format PC |
| L'inventaire, en écarts | `05-frigo-inventaire` | mode Inventaire, **deux ou trois lignes corrigées**, le compteur « n écarts » | plan 5.4 | **à refaire** : aucune ligne corrigée |
| L'inventaire part en tâche de fond (gauche) | `12-inventaire-envoye` | juste après l'envoi : « Inventaire en cours… Tu peux quitter l'écran, ça continue tout seul » | plan 5.5 | **fausse** : montre déjà l'inventaire appliqué |
| L'inventaire part en tâche de fond (droite) | `13-inventaire-applique` | retour au frigo : « Inventaire appliqué : n corrections », les quantités changées | plan 5.6 | juste, format PC |
| Le calculateur | `07-repas-compose` | étape Repas : un repas déplié, les colonnes À peser / Servi / 1 pers. | plan 4.4 | juste, format PC |
| Ce que le calcul donne | `09-repas-macros` | le jour composé : « 1 hors cible », et la ligne de macros vert / ambre d'un repas | plan 4.5 | **fausse** : montre le tableau, pas les macros |
| Quand les données sont douteuses | `06-repas-cibles` | étape Jours, le bandeau ambre « Fibres inconnues sur … aliments » | plan 4.1 | juste, format PC |
| Le batch cooking | `11-batch-cooking` | étape Cuisiner : les fournées, **et** une boîte dépliée | plan 4.9 | partielle : les boîtes sont hors cadre |
| Le carnet de séances | `18-seance-detail-1rm` | une séance ouverte : séries, disque du 1RM, son écart, la courbe | plan 7.5 | juste, format PC |
| Les objectifs | `03-objectifs` | écran Objectifs : les quatre repas, la case « Glucides fibres comprises » | plan 2.2 | juste, format PC |
| Les programmes | `15-modeles-liste` | un modèle **ouvert** : ses exercices, ses séries cibles, Charge / Tenue / Chrono | plan 6.2 | faible : la liste seule |

**Deux façons de les obtenir.** Une capture d'écran du téléphone pendant le
tournage (sur Android : marche + volume bas), ou une image tirée de ta vidéo :

```bash
# l'image de la seconde 42 de la bobine 4, pour la slide « Ce que le calcul donne »
ffmpeg -ss 42 -i bobine-4.mp4 -frames:v 1 presentation/images/09-repas-macros.png
```

Puis `./presentation/preparer-demonstration.sh --slides` : le rapport de fin dit,
pour chaque slide, si l'image vient de `images/ (toi)` ou de
`captures/ (automatique)`. Une image en portrait s'affiche centrée, sans être
étirée. **Garde les légendes vraies** : elles décrivent l'écran, pas des
chiffres ; si ton image en montre d'autres, c'est normal.

---

# Partie II — L'inventaire de ce qu'il faut montrer

**C'est la table des matières de la démonstration.** Elle fusionne
`fonctionnalites-par-onglet.md` — l'inventaire du propriétaire, 45 lignes, cinq
onglets — et la revue qui l'a confronté au code le 16 septembre 2026 : **41
lignes confirmées**, 4 écarts, et des **pans entiers absents** du document
d'origine. Ce sont ces pans-là qui font la différence entre une démonstration
partielle et une démonstration complète : ils sont marqués **`+`**.

**Comment lire.** `+` absent du document du propriétaire, ajouté par la revue ·
`◐` vrai avec une nuance qui compte · `✗` existe dans l'API mais **n'a pas
d'écran** : ne pas le promettre, ne pas essayer de le filmer.
La colonne **Bobine** renvoie à la partie III.

Les adresses `fichier:ligne` exactes ne sont pas recopiées ici : elles vivent
dans `features.md` (~288 capacités) et, à jour et vérifiées une par une, dans
les quinze fiches `.claude/skills/fonctionnalite-*`. **Ce sont elles qui font
foi** ; `features.md` est daté du 14 septembre et porte encore au moins une
erreur connue (« zone 70–80 % », alors que c'est 70 à 90 %).

## A · Entrer, et rester

| | Ce qu'on montre | Où c'est | Bobine |
|---|---|---|---|
| | Connexion par adresse et mot de passe, **aucune inscription libre** | `/connexion` | 1.3 |
| + | **Invitation par lien** — valable 7 jours, à usage unique, révocable ; le serveur n'en garde qu'une empreinte | Compte → Utilisateurs → Inviter | 1.2 |
| + | Ce que reçoit l'invité : « Vérification du lien… », son nom, son mot de passe. **L'administrateur ne les connaît jamais.** | `/invitation/<jeton>` | 1.3 |
| + | Le compte neuf arrive avec un **frigo vide** — chaque compte part de zéro | après validation | 1.3 |
| + | Révoquer une invitation qui n'a pas servi | Compte → Utilisateurs | 1.5 |
| + | Portier sur toutes les routes, session d'une heure renouvelée par un **jeton révocable** (90 jours glissants), limitation des tentatives, compte désactivé bloqué à la requête suivante | ne se filme pas — se dit | — |
| ✗ | **Voir et couper ses sessions ouvertes** — `GET`/`DELETE /api/mes-sessions` existe, **aucun écran ne l'appelle** | — | — |

## B · Son compte, ses objectifs

| | Ce qu'on montre | Où c'est | Bobine |
|---|---|---|---|
| | Une **cible par repas** — Matin, Midi, 16 h, Soir — et non un total pour la journée | `/objectifs` | 2.2 |
| ◐ | Les quatre champs sont **Protéines, Glucides, Lipides, Calories**. **Il n'y a pas de cible de fibres, et il n'y en aura pas** (décision du 16 septembre 2026). Ce qui porte la convention à l'écran, c'est la case **« Glucides fibres comprises »** | `/objectifs` | 2.3 |
| + | **Les calories se recalculent seules** dès qu'une macro change, avec alerte au-delà de 15 kcal d'écart : « L'app respecte les grammes ; les calories suivent. » | `/objectifs` | 2.2 |
| + | **Convertisseur de plan américain** (protéines, glucides totaux, lipides, fibres, calories), aperçu « Sera enregistré : … » et l'avertissement « ton plan sous-estime ses fibres » | `/objectifs` | 2.3 |
| + | Récapitulatif des quatre repas — « 40 P · 60 G · 15 L » ou « à définir » | `/objectifs` | 2.2 |
| | Compléments alimentaires (CRUD), par moment de repas. C'est une **consigne**, pas un journal de prises, et volontairement hors du calcul | `/(onglets)/compte` | 2.1 |
| | Réglages : cinq sonneries de minuteur, jouées au toucher, réglage **propre à l'appareil** | `/reglages` | 2.4 |
| + | Savoir quelle version tourne et chercher une mise à jour. **Sur le web, le panneau se tait** | `/(onglets)/compte` | — |
| + | L'accès à l'administration, **invisible et inatteignable** pour un compte ordinaire depuis le 15 septembre 2026 | `/(onglets)/compte` | 8.1 |
| ✗ | **Changer son mot de passe ou son adresse** — la règle est complète côté serveur (mot de passe actuel exigé, toutes les sessions révoquées), mais **aucun écran ne l'appelle** : pas une occurrence de `motDePasseActuel` dans `front/`. C'est l'écart le plus trompeur de l'inventaire | — | — |

## C · Le frigo

| | Ce qu'on montre | Où c'est | Bobine |
|---|---|---|---|
| | Le stock **groupé par emplacement** — frigo, congélateur, placard — dans l'ordre d'un inventaire réel, avec « 12 en stock sur 14 » | `/(onglets)/frigo` | 3.1 |
| | Le détail d'un aliment : macros, catégorie, et **« 100 g → 75 g »** à la cuisson | ouvrir « Blanc de poulet » | 3.2 |
| ◐ | Le rendement de cuisson est **mesurable** (poids avant / après → « Utiliser ce résultat (2,3) »). Et les catégories sont **huit**, pas trois : Protéine, Glucide, Légume, Fruit, Oléagineux, Matière grasse, Laitage, Autre | éditeur d'aliment | 3.2 |
| + | **Recherche** par aliment ou par emplacement, insensible aux accents | champ « Rechercher » | 3.3 |
| | Ajouter depuis le **catalogue commun** — 50 aliments de référence, et **les aliments déjà présents en sont retirés** | Ajouter un aliment | 3.4 |
| | Créer un aliment **de zéro** : il reste privé, il ne pollue pas le catalogue commun | Ajouter → Créer de zéro | 3.5 |
| + | **Contrôle de cohérence permanent** des valeurs, **blocage** de l'enregistrement sur « incohérent », et **détection des kilojoules** (« Convertir : 1473 kJ = 352 kcal ») | éditeur d'aliment | 3.5 |
| + | **Fibres facultatives** — vide veut dire « non renseigné », pas zéro | éditeur d'aliment | 3.5 |
| | Corriger une quantité, supprimer un aliment | ligne de stock | 3.6, 3.7 |
| + | **On ne supprime pas n'importe quoi** : jamais un aliment commun, jamais un aliment encore en stock (409 nommant le nombre de lignes) | — | 3.7 |
| + | **Le frigo Grocy** — lecture des stocks, création d'un produit depuis l'application, produits écartés faute de valeurs, signalement des incomplets, survie à une panne de Grocy. Sur Grocy, **la suppression est refusée et le nom non modifiable** | `/(onglets)/frigo` avec `GROCY_URL` | **impasse**, voir fin de partie III |

## D · L'inventaire

| | Ce qu'on montre | Où c'est | Bobine |
|---|---|---|---|
| | Saisie **en écarts** : on ne corrige que ce qui a bougé. **Un champ vide n'est pas un zéro** — la ligne n'a pas été comptée, son stock ne bouge pas | Frigo → Inventaire | 5.4 |
| + | Seuil d'arrondi, case « vérifié », bouton à libellé variable (« Enregistrer n corrections »), **Réinitialiser** | Frigo → Inventaire | 5.4 |
| + | **Le dépôt part en tâche de fond** : réponse immédiate, « Tu peux quitter l'écran, ça continue tout seul » | après l'envoi | 5.5 |
| + | On change d'onglet, on revient : « Inventaire appliqué : 3 corrections ». **Reprise exacte après une coupure**, échecs nommés ligne par ligne | 30 s plus tard | 5.6 |

## E · Les repas — le calculateur

**Les dix-sept lignes du document du propriétaire sont toutes confirmées.** Ce
sont les précisions et les ajouts qui font la démonstration.

| | Ce qu'on montre | Où c'est | Bobine |
|---|---|---|---|
| | Étape **Jours** : cocher les repas à cuisiner, le nombre de convives par repas, plusieurs jours d'un coup, recopier la configuration du premier repas sur tous les autres | `/(onglets)/repas` | 4.1, 4.2 |
| | **Composer** : le calcul part des cibles **et de ce qu'il y a réellement dans le frigo** | Composer les repas | 4.3 |
| | Le tableau à quatre colonnes — **à peser** (avant cuisson), servi, une personne | après le calcul | 4.4 |
| + | **L'écart affiché, jamais lissé — le moment fort.** Chaque macro en vert quand elle tient la cible, en ambre quand elle s'en écarte, et « 1 hors cible » sur le jour. Les lignes « ⚠ » (aliments trop semblables, « retire 40 g de … ») ne sortent que si le plan les provoque | sur le jour composé | 4.5 |
| + | **Le bandeau « Fibres inconnues »**, avant de composer : il nomme les aliments et chiffre l'écart — 17 % sur un pain complet | étape Jours | 4.1 |
| ◐ | **« Tes grammes représentent 612 calories, pas 580 » ne s'affiche PAS sur la carte d'un repas** : émis en gravité `info`, et la carte filtre les `info`. **On ne le voit que sur l'écran des objectifs.** Relevé le 16 septembre 2026 | `/objectifs` | — |
| + | **Les cuissons ont trois états** — cuit ainsi, se mange tel quel, ou **personne n'a décidé**. « Je n'en mets pas » n'est pas « je n'ai pas répondu ». Et elles sont **mémorisées d'une fois sur l'autre** | étape Cuisiner | 4.6 |
| | **Remplacer** un aliment, **verrouiller** (un aliment choisi par toi n'est jamais remplacé dans ton dos), déclarer un **reste**, mettre à **0** (retire l'aliment), **ajouter** hors proposition | carte de repas | 4.7 |
| ◐ | Le **reste** est un **plafond**, pas une quantité imposée : le calcul en sert ce qu'il faut, pas plus | carte de repas | 4.7 |
| + | **Les échanges automatiques sont expliqués** — « X ne permettait pas de tenir les objectifs : remplacé par Y. Tu peux revenir dessus. » | carte de repas | 4.7 |
| | Les quantités retenues sont **bloquées** pour ce repas | — | 4.7 |
| ◐ | Vrai **et au-delà** : les jours partagent un seul frigo, résolus dans l'ordre du temps, et **le stock déjà promis à un plan prévu est retiré du disponible** | — | 4.7 |
| + | Les **compléments alimentaires** apparaissent dans la boîte du repas qui les porte | carte de repas | 4.8 |
| ◐ | **Revenir en arrière** est possible, mais **revenir à l'étape « Jours » efface le plan** — les quantités ne voudraient plus rien dire | bandeau d'étapes | 4.7 |
| + | **Ce que l'application refuse de faire** : valeurs déjà cuites détectées, féculent qui rétrécit, plus de 100 g de nutriments dans 100 g | à l'enregistrement d'un aliment | 3.5 |

## F · Le batch cooking, les courses, les plans

| | Ce qu'on montre | Où c'est | Bobine |
|---|---|---|---|
| ◐ | Les **fournées** groupées par façon de cuire : **on pèse sec**. Mais les **boîtes sont en cuit** — annoncer le poids sec devant des boîtes ferait servir trois fois trop | Passer au batch cooking | 4.9 |
| | La répartition en boîtes : colonne **boîte** (pour tout le monde) et colonne **1 pers.** (ce qu'on se sert) | idem | 4.9 |
| ◐ | La **liste de courses** : la période est résolue **deux fois** — une fois bridée par le frigo, une fois frigo plein — et la liste est la différence. Seuil de 5 g | idem | 4.10 |
| + | **Les plans enregistrés** : nom libre, liste avec badges, **état en toutes lettres** (« Prévu · les ingrédients sont mis de côté » / « Cuisiné le mercredi 13/08 »), **aucune modification possible** — c'est un instantané —, suppression | `/(onglets)/repas` | 4.11, 5.7 |
| ◐ | **« J'ai cuisiné » déduit du stock** en **poids pesé, avant cuisson** ; le plan est marqué **avant** de toucher au stock ; le double appui est refusé ; ce qui n'a pas pu être déduit est listé « À retirer toi-même du frigo » | plan enregistré | 5.2 |

## G · Les séances

| | Ce qu'on montre | Où c'est | Bobine |
|---|---|---|---|
| + | **La liste** : type, date en français, pastille de couleur, avancement « 4/12 séries », vert quand tout est fait | `/(onglets)/seances` | 7.1 |
| ◐ | Créer depuis un modèle — le bouton « Partir d'un modèle » **n'apparaît que sur une séance vide**, et seulement si un modèle existe | + Nouvelle séance | 7.2 |
| | Saisir et **cocher** les séries (répétitions × poids), ajouter une série | `/seance/<id>` | 7.3 |
| + | **Cocher une série remplit les champs vides avec l'objectif**, puis relance le repos | idem | 7.3 |
| ◐ | **Le rappel de la dernière fois n'est pas un bandeau** : c'est une **puce cliquable** bordée d'ambre, « ↓ 12×25 · 12×27,5 », dans la même rangée que les modes. **Elle applique** les valeurs quand on la touche : c'est un geste, pas une information | idem | 7.4 |
| | Trois **modes de travail** — charge / tenue / chrono. Changer de mode **n'interrompt pas une mesure en cours** | idem | 7.6 |
| | Notes par exercice (repliables, avec aperçu quand elles sont remplies) | idem | 7.9 |
| | Réordonner les exercices — poignée à glisser **ou** flèches, mobile et web | idem | 7.9 |
| + | **Sauvegarde automatique** 2,5 s après la dernière frappe, forcée quand l'application passe en arrière-plan ; cinq états lisibles et un bouton « Réessayer l'enregistrement » | idem | 7.3 |
| + | **Avertissement séries longues** — « comptées dans le volume, mais écartées du 1RM » | idem | 7.5 |
| | Transformer la séance en modèle ; supprimer une séance, **confirmée en nommant** le type, la date et le nombre de séries | idem | 7.10, 7.11 |
| ◐ | Ajouter un exercice : **le champ « Rechercher… » n'apparaît qu'APRÈS avoir choisi une vignette de muscle.** C'est voulu — chercher dans 1 338 exercices sans filtre ne donnait rien d'utile. **Prévois le geste dans la prise** | choix d'exercice | 7.2 |

## H · Ce que l'application déduit — 1RM et progression

| | Ce qu'on montre | Où c'est | Bobine |
|---|---|---|---|
| | Le **1RM estimé** se recalcule à chaque saisie, formule d'**Epley** | carte d'exercice | 7.5 |
| ◐ | **Deux garde-fous que l'inventaire ne dit pas** : au-delà de **15 répétitions** l'estimation est refusée (on mesure l'endurance), et une série d'**une** répétition est prise telle quelle. Ils restent tels quels, sauf arbitrage contraire | — | 7.5 |
| | La **zone de travail est 70 à 90 %** — et c'est `features.md` qui se trompe en annonçant « 70–80 % » | disque RM | 7.5 |
| | Écart depuis la dernière fois : « ▲ +2,5 kg », « = stable », « 1re fois » | disque de tendance | 7.5 |
| + | **Courbe de progression** à partir de 2 séances : « +7,5 kg sur 6 séances » | carte d'exercice | 7.5 |
| ◐ | **Le disque et le calculateur sont deux choses.** « ⚖ RM » en bas de séance ouvre le **calculateur de charge** (charge + répétitions → 1RM, arrondi 1 / 2,5 / 5 kg, table des paliers) et **il n'hérite pas** du 1RM de l'exercice ouvert. Le **disque**, lui, est le cercle sur la carte, qui déplie la table des paliers | `/seance/<id>` | 7.8 |
| + | **Records antérieurs** par exercice, strictement avant la date de la séance — ils alimentent le disque de tendance et la courbe | carte d'exercice | 7.5 |
| + | Bilan par exercice : somme des répétitions, poids total soulevé, chrono | carte d'exercice | 7.9 |

## I · Minuter

| | Ce qu'on montre | Où c'est | Bobine |
|---|---|---|---|
| | **Minuteur de repos** lancé au cochage d'une série, paliers **1:00 / 1:30 / 2:00 / 3:00**, durée mémorisée | `/seance/<id>` | 7.7 |
| + | Son **et** vibration, **et une notification système** pour qu'il sonne application fermée — Android gèle les minuteurs JavaScript | idem | 7.7 |
| + | **Le repos survit au changement d'écran** ; l'écran reste allumé pendant le décompte ; pas de double bip au retour | idem | 7.7 |
| + | **La mesure d'effort survit au démontage** de son champ, et un **bandeau « mesure en cours »** la porte | idem | 7.6 |
| ✗ | **La notification téléphone fermé n'est pas éprouvable dans Expo Go** (SDK 53 a retiré les notifications distantes) : il faut l'APK. Ne pas la promettre sur émulateur | — | — |

## J · Les modèles (programmes)

| | Ce qu'on montre | Où c'est | Bobine |
|---|---|---|---|
| | La liste des programmes, type **Push / Pull / Legs** et nom libre. Le type **filtre le catalogue proposé** | `/(onglets)/modeles` | 6.1 |
| + | **Séries cibles par exercice** — répétitions et charge, ou une **durée en mode Tenue** : ce sont elles qui pré-remplissent la séance | `/modele/<id>` | 6.2 |
| | Ajouter, retirer (avec confirmation), réordonner — poignée ou flèches, aide affichée dès 2 exercices | idem | 6.3, 6.4 |
| + | **Propager l'ordre aux séances** : on annonce d'abord combien de séances l'adopteraient, « y compris les anciennes. Seul l'affichage change » | idem | 6.4 |
| | **Le mode de travail se choisit dans un modèle depuis le 16 septembre 2026** — sélecteur partagé avec l'écran de séance, et **les champs de série suivent le mode** : des secondes en « Tenue », des répétitions et des kilos en « Charge » et « Chrono » | idem | 6.2 |
| + | Supprimer un modèle : « Tes séances passées ne sont pas touchées. » | idem | 6.3 |
| ✗ | **Le partage d'un modèle n'existe pas** — le champ n'a jamais rien fait ; il a été retiré de l'entité, de la base et du front le 15 septembre 2026. **Ne rien promettre**, et il n'y a plus rien à éviter de montrer | — | — |

## K · Le catalogue d'exercices

| | Ce qu'on montre | Où c'est | Bobine |
|---|---|---|---|
| + | Environ **1 338 exercices**, communs à tous les comptes | choix d'exercice | 7.2 |
| + | Quinze **vignettes de muscles**, dont « Autre » ; filtres par zone et équipement | idem | 7.2 |
| + | Recherche sur le nom **français et anglais**, sans accents | idem | 7.2 |
| + | Fiche détaillée à la demande : vidéo YouTube intégrée (WebView sur mobile, iframe sur le web), zone, muscle ciblé, muscles sollicités, **matériel, exécution**, format prescrit | « Comment faire cet exercice » | 7.2 |
| + | Chargement progressif, **aucune suppression possible** — pour ne pas effacer l'historique | — | — |
| ◐ | Un **exercice sans groupe reste proposé partout** — sinon un exercice non classé deviendrait introuvable | — | — |

Cette fonctionnalité **n'a pas de bobine propre** : elle se voit dans la
bobine 7, au moment d'ajouter un exercice, et dans la bobine 8 côté
administration.

## L · L'administration (administrateur seulement)

| | Ce qu'on montre | Où c'est | Bobine |
|---|---|---|---|
| + | **Catalogue d'exercices** : six filtres, compteurs, validation du lien YouTube, et **seuls les champs modifiés sont envoyés** | `/admin-exercices` | 8.1 |
| + | **Fusionner deux exercices**, avec report de l'historique des séances | `/admin-fusion` | 8.3 |
| + | **Façons de cuire** — c'est cette table qui alimente les rendements cru/cuit du calculateur | `/admin-cuissons` | 8.4 |
| + | **Comptes** : inviter, désactiver (les données restent), réactiver, supprimer **en chiffrant ce qui sera détruit**, et **refus de se bloquer soi-même ou de bloquer le dernier administrateur** | `/admin-utilisateurs` | 8.5, 1.4 |
| ✗ | **Créer un exercice** — réservé à l'administrateur depuis le 15 septembre 2026, et **aucun écran ne le propose, pour personne**. Un exercice créé par l'API naît privé, sans moyen de le publier. **Le plan 8.2 n'est pas filmable** | — | — |

## M · Ce qui tient sans se voir

Rien de tout cela ne se filme. Tout se dit, et c'est ce qui fait la crédibilité
de la seconde moitié (voir partie IV).

- **Isolation stricte entre comptes** — interface de marquage, filtre Doctrine
  qui pose le `WHERE` sur toutes les requêtes, test qui refuse toute entité
  exposée non conforme, et un contrôle au point de passage obligé de l'écriture.
- **Cache relu depuis le disque au démarrage à froid** : les écrans s'affichent
  avec les données de la veille, tolérance au hors-ligne.
- **Anti-N+1** par jointures ajoutées par-dessus le filtre.
- **Documentation de l'API fermée** en production.
- **Un seul code** pour le web et Android.

---

# Partie III — Les huit bobines

Pour filmer les fonctionnalités **depuis un téléphone**, sur l'application de
production. Chaque plan donne : le **geste** exact, ce qu'on doit **voir**, ce
qu'on **dit** si on commente, et une **durée**. Les durées sont des minimums :
à l'écran, un geste trop rapide est un geste illisible.

**Huit bobines indépendantes.** Chacune dit son état de départ. On peut en
retourner une sans refaire les autres — et on le fera, personne ne réussit une
bobine du premier coup. **Tourner chaque bobine séparément**, sans chercher
l'enchaînement parfait : le montage recolle.

---

## Bobine 1 · On arrive · ~2 min

> **État de départ** : session **administrateur** sur le téléphone. Un second
> appareil ou un navigateur privé pour recevoir l'invitation.

**1.1 — L'onglet Compte** · 8 s
*Geste* : ouvre l'onglet **Compte**, en bas à droite.
*À l'écran* : les boutons d'administration, visibles seulement pour un admin.
*Tu dis* : « Un compte fitcarnet ne se crée pas tout seul. On entre par invitation, et c'est un administrateur qui l'envoie. »

**1.2 — Inviter** · 25 s
*Geste* : **Utilisateurs** → saisis une adresse → **Inviter**.
*À l'écran* : l'invitation apparaît dans la liste, avec son lien.
*Tu dis* : « J'invite une adresse. L'application fabrique un lien à usage unique. »

**1.3 — Recevoir** · 40 s
*Geste* : ouvre le lien sur l'autre appareil.
*À l'écran* : « Vérification du lien… », puis « Ton nom », « Mot de passe », « Répète-le ».
*Tu dis* : « Voilà ce que reçoit la personne invitée. Elle choisit son nom et son mot de passe — l'administrateur ne les connaît jamais. »
*Geste* : valide.
*À l'écran* : on entre dans l'application, frigo vide.
*Tu dis* : « Et elle est dedans. Frigo vide : chaque compte part de zéro et ne verra jamais les données d'un autre. »

**1.4 — Côté administrateur** · 20 s
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

**2.1 — Le compte** · 10 s
*Geste* : onglet **Compte**.
*Tu dis* : « Ici, ce qui appartient à l'utilisateur : ses objectifs, ses réglages. »

**2.2 — Les objectifs** · 45 s
*Geste* : **Objectifs**. Fais défiler lentement.
*À l'écran* : **Protéines, Glucides, Lipides, Calories** — quatre champs, par repas.
*Tu dis* : « Les cibles ne sont pas un total pour la journée : il y en a une par repas. C'est ce qui permet de composer un petit-déjeuner qui ne ressemble pas à un dîner. »
*Geste* : modifie une valeur, enregistre, ressors, reviens.
*Tu dis* : « Ça a tenu. »

**2.3 — La convention des fibres** · 20 s
*Geste* : arrête-toi sur la case **« Glucides fibres comprises »**.
*Tu dis* : « Cette case porte la convention européenne — les fibres comptent 2 kilocalories par gramme, pas 4 et pas 0, et elles sont comptées à part. La plupart des applications se trompent là-dessus, et l'écart se voit sur un régime riche en fibres. »

> **Ne dis pas « Glucides totaux ».** Cet intitulé **n'est pas sur le
> formulaire des objectifs** : « Glucides totaux » et « Fibres » n'existent que
> dans le **convertisseur de plan américain**, plus bas sur le même écran. Dire
> « Glucides fibres comprises », et rien d'autre.

**2.4 — Réglages** · 10 s
*Geste* : entre, montre les cinq sonneries, ressors.

---

## Bobine 3 · On remplit le frigo · ~3 min

> **État de départ** : `jeu-essai.sql` chargé sur le compte.

**3.1 — Le stock** · 25 s
*Geste* : onglet **Mon frigo**, défile lentement sur toute la liste.
*À l'écran* : « 12 en stock sur 14 », les aliments groupés par emplacement.
*Tu dis* : « Voilà ce qu'il y a dans le frigo. Rangé par emplacement — frigo, congélateur, placard — avec les valeurs pour cent grammes. »

**3.2 — Le détail, et le poids cru** · 30 s
*Geste* : ouvre « Blanc de poulet ».
*À l'écran* : macros, et **« 100 g → 75 g »** à la cuisson.
*Tu dis* : « Et la mention qui décide de tout : poids cru. Le riz blanc sec vaut 350 kilocalories aux cent grammes ; cuit, il n'en vaut plus que 155, parce qu'il pèse deux fois et quart plus lourd. Si on confond les deux, tous les chiffres de l'application sont faux. Ici on pèse toujours cru, et le rendement de cuisson est écrit. »

> **Deux mots à ne pas dire : « 130 » et « basmati ».**
>
> **130** est la valeur **américaine** (USDA) du riz blanc long cuit ; elle
> circule partout en français sans sa source. Les chiffres de l'application
> viennent de la table française CIQUAL.
>
> **Basmati** est tout aussi faux : la paire **350 / 155** est celle du **riz
> blanc** dans CIQUAL, et c'est elle qui donne le rendement **2,26** du
> catalogue. Le vrai basmati donne 351 au cru et 148 au cuit, soit 2,37.
>
> Et attention au **2,26 lui-même** : le riz *pèse* 2,26 fois plus, il n'a pas
> « absorbé deux fois et demie son poids en eau » — il en a absorbé 1,26 fois son
> poids. Dire « il pèse deux fois et quart plus lourd » est à la fois juste et
> plus parlant devant une balance.

**3.3 — Chercher** · 15 s
*Geste* : tape « poul » dans le champ de recherche.
*Tu dis* : « Sur un frigo de quarante lignes, on cherche. »

**3.4 — Ajouter depuis le catalogue** · 35 s
*Geste* : **Ajouter un aliment** → la liste des 50 aliments de référence → choisis-en un.
*Tu dis* : « Cinquante aliments de référence, vérifiés, communs à tous les comptes. On part de là plutôt que de retaper des valeurs. »

**3.5 — Créer de zéro** · 40 s
*Geste* : **Ajouter un aliment** → **Créer de zéro** → saisis un nom et des valeurs.
*À l'écran* : le contrôle de cohérence, et le blocage si les valeurs ne peuvent pas être vraies.
*Tu dis* : « Et si le produit n'y est pas, on le crée. Il reste privé : personne d'autre ne le verra, et il ne polluera pas le catalogue commun. Et l'application refuse d'enregistrer des valeurs qui ne peuvent pas être vraies. »

**3.6 — Corriger une quantité** · 15 s
*Geste* : modifie la quantité d'une ligne à la main.

**3.7 — Supprimer** · 20 s
*Geste* : supprime l'aliment créé en 3.5.
*Tu dis* : « Et on peut le retirer. »

> **Remise à zéro** : rejoue `jeu-essai.sql`.

---

## Bobine 4 · On planifie la semaine · ~5 min — **la bobine décisive**

> **État de départ** : frigo garni, aucun plan enregistré.

**4.1 — Les cibles du jour** · 40 s
*Geste* : onglet **Repas**. Étape 1.
*À l'écran* : Matin, Midi, 16 h, Soir, chacun avec ses macros — et dessous, le bandeau ambre **« Fibres inconnues sur … aliments »**.
*Tu dis* : « Quatre repas, quatre cibles. Je coche ceux que je veux cuisiner et je dis pour combien de personnes. »
*Geste* : arrête-toi sur le bandeau ambre.
*Tu dis, en le lisant* : « Et avant même de calculer, l'application prévient : des aliments de mon frigo n'ont pas leurs fibres renseignées, et elle les nomme. Elle ne les invente pas — elle dit ce que ça coûte : sur un pain complet, l'écart atteint 17 %. Elle le dit avant de cuisiner, pas après. »

**4.2 — Plusieurs jours** · 20 s
*Geste* : active **Plusieurs jours**, change le nombre de convives d'un repas.
*Tu dis* : « Et je peux cuisiner pour plusieurs jours d'un coup — c'est là que ça devient intéressant. »

**4.3 — Composer** · 30 s
*Geste* : **Composer les repas**. **Ne parle pas pendant le calcul** : laisse voir.
*Tu dis, une fois le résultat affiché* : « L'application a composé les quatre repas à partir de ce qu'il y a réellement dans le frigo. Ce n'est pas du tâtonnement : c'est un système d'équations résolu par élimination de Gauss, sous contrainte du stock disponible. »

**4.4 — Le tableau** · 30 s
*Geste* : arrête-toi sur les colonnes.
*Tu dis* : « À peser, servi, une personne. La première colonne, c'est ce que je mets sur la balance — avant cuisson. La dernière, ce que je me sers. »

**4.5 — L'écart affiché, jamais lissé** · 40 s — **le moment fort**
*Geste* : sur le jour composé, arrête-toi sur « 4 repas · 1 hors cible », puis sur la ligne de macros sous le nom d'un repas.
*À l'écran* : chaque macro en **vert** quand elle tient la cible, en **ambre** quand elle s'en écarte.
*Tu dis* : « Quand le frigo ne permet pas de tomber pile, l'application ne maquille pas le résultat. Elle affiche l'écart, macro par macro : vert, c'est tenu ; ambre, c'est à côté — et on sait tout de suite quoi corriger. C'est une règle du projet : un chiffre faux est pire qu'un refus de répondre. »

> **Ne lis que ce qui est à l'écran.** Les lignes « ⚠ » sous une carte
> (aliments trop semblables, « retire 40 g de … », apport négligeable)
> n'apparaissent que si le plan les provoque. Et le bandeau rouge « Des données
> de ton frigo rendent le calcul faux » **n'apparaît pas** avec le jeu de
> démonstration : ses valeurs sont justes. « Tes grammes représentent
> 612 calories » ne se voit que sur l'écran des objectifs.

**4.6 — Les cuissons** · 35 s
*Geste* : bascule un aliment de cru à cuit, puis règle le reste d'un coup.
*Tu dis* : « Chaque aliment se pèse cru ou cuit, au choix. Et il y a un troisième état : personne n'a décidé. "Je n'en mets pas" n'est pas "je n'ai pas répondu". L'application retient : la prochaine fois, elles seront déjà remplies avec ce que j'avais fait. »

**4.7 — Ajuster** · 45 s
*Geste* : **remplace** un aliment ; déclare un **« reste »** sur un autre ; mets-en un à **0** ; **ajoute** un aliment hors proposition.
*Tu dis* : « Je change ce qui ne me va pas, et les quantités se recalculent toutes seules pour retomber sur mes objectifs. S'il me reste un fond de casserole, je l'écris dans "reste" et le calcul en sert ce qu'il faut, pas plus. »

**4.8 — Les compléments** · 20 s
*Geste* : ajoute un complément à un repas.
*Tu dis* : « Et les compléments se rattachent au repas. »

**4.9 — Le batch cooking** · 40 s
*Geste* : **Passer au batch cooking**. Montre les fournées, puis les boîtes.
*Tu dis* : « Là, on ne raisonne plus en repas mais en cuissons. Ce qui part au four ensemble, ce qui va à la casserole — et on pèse sec. Puis la répartition en boîtes, en cuit : la colonne "boîte" c'est ce qu'on y met pour tout le monde, la colonne "une personne" c'est ce qu'on se sert le jour venu. »

**4.10 — La liste de courses** · 20 s
*Geste* : montre la liste.
*Tu dis* : « Et ce qu'il manque, on l'achète. »

**4.11 — Enregistrer** · 25 s
*Geste* : nomme le plan, enregistre. Reviens à l'étape 1.
*À l'écran* : « Mes plans enregistrés · 1 en attente de cuisson ».
*Tu dis* : « Le plan est figé. Pas une recette à rejouer : un instantané. Dans trois jours, je veux savoir ce que j'ai cuisiné dimanche, pas ce que je cuisinerais aujourd'hui. »

---

## Bobine 5 · On cuisine, puis on range · ~3 min

> **État de départ** : un plan enregistré non cuisiné.
> **Le travailleur de fond doit tourner.**

> **Filme-la juste après la bobine 4, avec le plan que tu viens d'y
> enregistrer.** Les deux plans du jeu de démonstration ne réservent rien : ils
> affichent « · ne réserve rien » au lieu de « · à cuisiner », et « J'ai
> cuisiné » les refuse.

**5.1 — Avant** · 15 s
*Geste* : va au frigo, montre la quantité de deux ou trois aliments du plan.
*Tu dis* : « Retenez ces quantités. »

**5.2 — J'ai cuisiné** · 30 s
*Geste* : ouvre le plan, appuie sur **« J'ai cuisiné »**.
*Tu dis* : « Un seul geste : le plan est marqué cuisiné, et le frigo est décrémenté de ce qui est parti — en poids pesé, avant cuisson. »

**5.3 — Après** · 20 s
*Geste* : retourne au frigo.
*Tu dis* : « Les quantités ont baissé. Sans que j'aie rien ressaisi. »

**5.4 — L'inventaire** · 40 s
*Geste* : onglet **Inventaire**. Corrige **trois** lignes seulement.
*À l'écran* : le compteur « n écart ».
*Tu dis* : « Une fois par semaine, je pèse. Je ne ressaisis pas quatorze aliments : je corrige les trois qui ont bougé. Une ligne que je ne touche pas n'est pas un zéro — elle n'a pas été comptée, et son stock ne bouge pas. »
*Geste* : appuie sur **Réinitialiser**, puis ressaisis.
*Tu dis* : « Et si je me trompe, je repars. »

**5.5 — L'envoi** · 30 s
*Geste* : **Enregistrer n corrections**.
*À l'écran* : « Inventaire en cours — 0 / 3 lignes. Tu peux quitter l'écran, ça continue tout seul. »
*Tu dis, en lisant le message* : « Regardez : l'écran rend la main immédiatement. Le traitement continue sans lui. »

**5.6 — On quitte, on revient** · 30 s
*Geste* : change d'onglet, attends, reviens.
*À l'écran* : « Inventaire appliqué : 3 corrections ».
*Tu dis* : « J'ai changé d'écran, je suis revenu, c'était fait. Et si j'avais fermé l'application, je retrouverais le résultat au retour. Ce n'est pas un détail de confort : une requête HTTP a une durée maximale, un inventaire n'en a pas. Les faire coïncider nous a déjà coûté un frigo à moitié corrigé. »

**5.7 — Supprimer un plan** · 15 s
*Geste* : supprime le plan depuis la liste des plans enregistrés.

---

## Bobine 6 · Les programmes · ~2 min 30

> **État de départ** : session ordinaire, `jeu-demo.sql` chargé (trois modèles).

**6.1 — La liste** · 15 s
*Geste* : onglet **Modèles**.
*Tu dis* : « Les programmes types. Ce sont les patrons d'où partent les séances. »

**6.2 — Le détail** · 40 s
*Geste* : ouvre « Haut du corps — poussée ».
*À l'écran* : les exercices, les séries cibles en répétitions et charge, et le sélecteur **Charge / Tenue / Chrono**.
*Tu dis* : « Trois exercices, et pour chacun les séries prescrites : quatre fois huit à 55 kilos. C'est ce qui sera pré-rempli quand je commencerai la séance. Et le mode se choisit ici : en "Tenue", ce ne sont plus des kilos qu'on prescrit, ce sont des secondes. »

**6.3 — Ajouter, retirer** · 30 s
*Geste* : **Ajouter un exercice**, puis retire-le (la confirmation apparaît).

**6.4 — Réordonner et appliquer** · 45 s
*Geste* : change l'ordre des exercices → « **Appliquer cet ordre à tes séances ?** » → **Appliquer**.
*Tu dis* : « Et quand je change l'ordre, je peux le répercuter sur mes séances à venir — l'application annonce d'abord combien en seraient touchées. »

> **Le partage d'un modèle ne fait pas partie de l'application.** Rien à
> montrer, donc — et rien à promettre non plus.

---

## Bobine 7 · On s'entraîne · ~4 min

> **État de départ** : session ordinaire, `jeu-demo.sql` chargé (neuf semaines).

**7.1 — La liste** · 20 s
*Geste* : onglet **Séances**, défile.
*À l'écran* : Push, Pull, Legs, les dates, « 9/9 séries ».
*Tu dis* : « Neuf semaines de séances. Le type, la date, et combien de séries ont été faites. »

**7.2 — Depuis un modèle** · 35 s
*Geste* : **+ Nouvelle séance** → choisis un modèle. Puis **Ajouter un exercice** → une vignette de muscle → **et seulement là** le champ « Rechercher… ».
*Tu dis* : « Je pars d'un programme : les exercices et les séries cibles sont déjà là. Et si je veux en ajouter un, je choisis d'abord le muscle : chercher dans mille trois cent trente-huit exercices sans filtre ne donne rien d'utile. »

**7.3 — Saisir** · 40 s
*Geste* : coche une série, saisis répétitions et charge.
*Tu dis* : « Pendant la séance, je coche et je saisis. C'est fait pour être utilisable avec les mains moites, entre deux séries. Et cocher une série remplit ce que je n'ai pas tapé avec l'objectif. »

**7.4 — Le rappel de la dernière fois** · 20 s
*Geste* : **touche la puce ambre** « ↓ 12×25 · 12×27,5 », dans la rangée des modes.
*Tu dis* : « Et juste au-dessus : ce que j'avais fait la dernière fois. Je la touche, elle applique. C'est un geste, pas une information. »

> **Ce n'est pas un bandeau** : c'est une **puce cliquable** bordée d'ambre,
> posée dans la même rangée que les modes, et **elle applique les valeurs**
> quand on la touche.

**7.5 — Le 1RM** · 45 s — **le moment fort**
*Geste* : saisis une charge plus lourde. **Reste sur le nombre.**
*À l'écran* : le 1RM se recalcule, la variation s'affiche, la courbe suit.
*Tu dis* : « Le 1RM estimé — la charge maximale sur une répétition — se recalcule à chaque saisie. Et en dessous, la courbe : ce que j'ai gagné sur mes dernières séances. La formule est écrite à un seul endroit dans tout le code ; trois copies aux règles divergentes avaient produit un record que la formule elle-même déclarait invalide. »

**7.6 — Les trois modes** · 30 s
*Geste* : bascule un exercice sur **Tenue**, puis **Chrono**. Laisse une mesure tourner pendant la bascule.
*Tu dis* : « Tout ne se mesure pas en charge : il y a les tenues, en secondes, et les chronos. Et une mesure en cours n'est pas jetée quand je change de mode. »

**7.7 — Le minuteur** · 25 s
*Geste* : lance **1:30**, laisse tourner cinq secondes.
*Tu dis* : « Et le repos se minute, sans quitter la séance. Il survit au changement d'écran, et il sonne même application fermée. »

**7.8 — Le calculateur de charge** · 30 s
*Geste* : appuie sur **⚖ RM**, en bas de séance. Saisis une charge et des répétitions.
*Tu dis* : « Le calculateur de charge : à partir d'un maximum, ce qu'il faut mettre sur la barre pour un pourcentage donné. »

> **Le disque et le calculateur sont deux choses.** « ⚖ RM » ouvre le
> **calculateur** : **il ne reprend pas** le 1RM de l'exercice ouvert, on y
> saisit une charge et des répétitions. Le **disque**, lui, est le cercle sur la
> carte de l'exercice, qui déplie la table des paliers (zone 70 à 90 %).

**7.9 — Notes, séries, totaux** · 30 s
*Geste* : écris une note, ajoute une série, montre « répétitions / kilos soulevés », réordonne deux exercices.

**7.10 — En modèle** · 20 s
*Geste* : transforme la séance en modèle.
*Tu dis* : « Et une séance qui m'a plu devient un programme. »

**7.11 — Supprimer** · 15 s
*Geste* : supprime la séance — la confirmation nomme le type, la date et le nombre de séries.

> **Remise à zéro** : rejoue `jeu-demo.sql` avec `-v ecraser=oui`.

---

## Bobine 8 · On administre · ~3 min

> **État de départ** : session **administrateur**.

**8.1 — Le catalogue d'exercices** · 60 s
*Geste* : Compte → **Exercices**. Fais défiler, ouvre-en un, montre ses champs, joue d'un filtre.
*À l'écran* : groupes, équipement, muscle ciblé, format prescrit, compteurs.
*Tu dis* : « Le catalogue commun, mille trois cent trente-huit entrées. Un exercice porte son équipement, son muscle ciblé, le format prescrit. C'est ce que tout le monde utilise — et personne ne peut en supprimer un, sinon on effacerait de l'historique. »

> **8.2 — Créer un exercice : non filmable.** **Aucun écran ne le propose,
> pour personne.** Le numéro est laissé vide plutôt que renuméroté, pour que
> les renvois restent justes.

**8.3 — Fusionner** · 40 s
*Geste* : **Fusion** → sélectionne deux doublons → la confirmation.
*Tu dis* : « Quand deux exercices désignent la même chose, on les fusionne — et l'historique des séances suit. »

**8.4 — Les façons de cuire** · 25 s
*Geste* : **Cuissons** → ajoute un mode.
*Tu dis* : « La table des cuissons : plancha, vapeur, four. C'est elle qui alimente les rendements cru-cuit du calculateur. »

**8.5 — Les comptes** · 30 s
*Geste* : **Utilisateurs** → désactive un compte, réactive-le. Montre le refus de se bloquer soi-même.
*Tu dis* : « Et un compte se désactive sans être supprimé. Ses données restent. L'application refuse qu'un administrateur se bloque lui-même, ou bloque le dernier administrateur. »

---

## Ce qui reste hors champ

- **La source Grocy — impasse connue.** Elle n'est tournable que si `GROCY_URL`
  est renseigné sur l'instance filmée. Sinon l'écran affiche « Grocy n'est pas
  configuré côté serveur ». **Ne pas l'évoquer** dans le cas contraire.
- **Le bandeau de mise à jour** — il n'apparaît qu'après une publication.
- **La création d'un exercice** (plan 8.2) — sans écran, pour personne.
- **Changer son mot de passe ou son adresse**, et **voir ses sessions** — l'API
  sait faire, aucun écran ne l'appelle. Ne se filme pas, ne se promet pas.
- **Les notifications téléphone fermé** — Expo Go n'a plus les notifications
  distantes depuis le SDK 53 : il faut l'APK.

---

# Partie IV — Le montage en trente minutes

**Moitié commerciale, moitié technique.** Ce n'est pas un autre dossier : c'est
l'ordre dans lequel sortir ce qui précède, et en combien de temps.

## Le public, et la seule règle qui compte

Des commerciaux ne retiendront pas une architecture. Ils retiendront **trois
phrases qu'ils pourront répéter** et **une chose vue à l'écran** qu'aucun
concurrent ne fait. La première moitié doit produire exactement cela.

La seconde moitié ne leur est pas destinée — elle est là pour qu'ils sachent
**que ça tient**, et pour répondre quand un client leur demandera « c'est
sérieux, votre truc ? ». Ils n'ont pas besoin de comprendre le filtre Doctrine :
ils ont besoin de savoir qu'il existe, qu'il est testé, et de savoir dire
« l'isolation des comptes est vérifiée par un test qui refuse toute entité non
conforme ».

**Ne jamais s'excuser de passer vite** : « j'y reviens en détail dans dix minutes ».

## Le minutage

| Temps | Partie | Support |
|---|---|---|
| 0:00 – 2:00 | Le problème, et pourquoi le suivi s'arrête | slides 1-3 |
| 2:00 – 6:00 | **Ce qu'on a dans le frigo** — stock, inventaire en écarts | bobine 3, ou vidéo 0:11 → 0:51 |
| 6:00 – 11:00 | **Le calculateur** — le cœur du produit | bobine 4, ou vidéo 0:51 → 1:58 + slides 7-9 |
| 11:00 – 13:00 | **Cuisiner puis ranger** — batch cooking, décrément du stock | bobine 5, ou vidéo 1:58 → 2:34 |
| 13:00 – 15:00 | **Le carnet** — séances, 1RM, progression | bobine 7, ou vidéo 2:34 → fin |
| 15:00 – 18:00 | La pile, et un seul code pour trois cibles | slides 12-13, 17 |
| 18:00 – 22:00 | **L'isolation des comptes** + le solveur + l'inventaire asynchrone | slides 14-16 |
| 22:00 – 26:00 | **Les garanties** — tests, TDD, l'audit et ses 84 constats | slides 18-23 |
| 26:00 – 29:00 | **Comment c'est construit** — l'outillage IA, les agents | slides 24-27 |
| 29:00 – 30:00 | Ce qu'on ne promet pas, et la suite | — |

**Trente minutes pleines, questions non comprises.** Si la salle est bavarde, la
variable d'ajustement est le bloc 18:00-22:00 : le solveur et l'inventaire
asynchrone se racontent en une phrase chacun. **Ne jamais rogner sur
22:00-26:00** : c'est le bloc qui fait la crédibilité, et c'est celui qu'on est
le plus tenté de sauter.

## Première moitié · 0:00 → 15:00

**0:00 – 2:00 · Le problème.** C'est le moment où le client doit se reconnaître.
Ralentis.

> « Les gens qui suivent leur alimentation sérieusement utilisent **trois
> outils** : une application de calories, un carnet de musculation, et un
> tableur pour les courses. Et c'est leur mémoire qui relie les trois. »

> « Le suivi ne s'arrête pas par manque de volonté. Il s'arrête parce que **la
> saisie coûte plus cher que ce qu'elle rapporte**. »

**C'est la phrase à faire répéter.** Tout ce qui suit en découle : chaque
fonctionnalité montrée doit se lire comme « ceci retire de la saisie » ou
« ceci évite un chiffre faux ».

**2:00 – 6:00 · On part de ce qu'il y a vraiment.** Deux choses à pointer du
doigt, pas une de plus : la mention **« poids cru »** (plan 3.2, avec ses deux
mots interdits) et **l'inventaire en écarts** —

> « On ne ressaisit pas trente aliments, on corrige les trois qui ont bougé. Et
> une ligne qu'on n'a pas touchée **n'est pas un zéro** : elle n'a pas été
> comptée, son stock ne bouge pas. »

> **Ce deuxième point est un argument de vente, pas un détail d'ergonomie.**
> C'est la différence entre un inventaire qu'on fait et un inventaire qu'on
> abandonne au bout de trois semaines.

**6:00 – 11:00 · Le calculateur — le cœur.** Trois choses, dans cet ordre :
les quantités retenues **bloquées** pour ce repas ; **l'écart à la cible affiché
quand le frigo ne permet pas mieux**, non lissé ; puis le bandeau des fibres
inconnues (plan 4.1), lu à voix haute. Et, en regardant la partie
technique de la salle : « C'est une règle du projet : **un chiffre faux est pire
qu'un refus de répondre.** »

**11:00 – 13:00 · Cuisiner, puis ranger.** La colonne « boîte » et la colonne
« une personne », puis la fin de boucle, qui est le vrai argument :

> « Quand on déclare la fournée cuisinée, **le stock du frigo se décrémente tout
> seul**. On n'a rien ressaisi. »

**13:00 – 15:00 · Le carnet.** « 63,3 kg estimés, **plus 3,1 kg** depuis la
séance précédente. Neuf semaines de données derrière ce chiffre. » Puis la
phrase qui referme la première moitié :

> « Et c'est la même application que le frigo. Pas un deuxième outil, pas un
> deuxième compte : **la nutrition et l'entraînement au même endroit**. C'est
> ça, les trois outils remplacés par un. »

## Les cinq phrases que les commerciaux doivent pouvoir répéter

À donner en fin de présentation, ou sur une feuille. Chacune est défendable
devant un client technique, et chacune est vérifiée dans le code.

1. **« On part de votre frigo, pas d'un catalogue de 300 000 produits. »**
   Le plan ne propose que ce qui est réellement disponible ; ce qui manque part
   en liste de courses.
2. **« On vous donne les grammes à peser crus, pour le résultat cuit que vous
   visez. »** Le rendement cru/cuit est dérivé à la lecture, jamais stocké dans
   les valeurs nutritionnelles.
3. **« Un champ vide veut dire "je ne sais pas", jamais "zéro". »** Cela vaut
   dans l'inventaire comme dans les objectifs.
4. **« Les fibres sont comptées à la convention européenne — 2 kcal par gramme,
   séparément des glucides. »** Presque aucune application ne le fait. Sur un
   régime riche en fibres, l'écart se voit.
5. **« Quand un chiffre n'est pas fiable, l'application le dit au lieu
   d'inventer. »** Et l'écart à la cible est montré, pas lissé.

## Seconde moitié · 15:00 → 30:00

**15:00 – 18:00 · La pile.** « API **Symfony 7** avec API Platform et Doctrine,
front **Expo / React Native**, **PostgreSQL 16**, déployé sur un NAS derrière
Caddy. » Puis le point qui intéresse vraiment : « **Un seul code** donne le site
web et l'application Android. Pas deux équipes, pas deux backlogs, pas deux
façons de calculer la même chose. »

**18:00 – 22:00 · Les trois points d'architecture qui se défendent.**

*L'isolation des comptes* — c'est le point le plus sérieux, et celui qu'on te
demandera :

> « Trois pièces : une interface de marquage, un filtre Doctrine qui pose le
> `WHERE` sur **toutes** les requêtes, et un test qui **refuse** toute entité
> exposée non conforme. Plus un contrôle au point de passage obligé de
> l'écriture. »

> « Une donnée qui fuit d'un compte à l'autre n'est pas un défaut d'affichage.
> C'est la faute la plus grave que ce projet puisse commettre — donc elle est
> traitée comme telle. »

*Le solveur* : un système linéaire résolu par **élimination de Gauss avec pivot
partiel**, pas du tâtonnement. Domaine pur, sans React ni réseau : il se teste
seul.

*L'inventaire asynchrone* : l'écran rend la main tout de suite, le traitement
continue derrière, en deux exemplaires qui ne se marchent pas dessus. **Raconte
la panne si on te le demande, pas avant :**

> « Le 14 août, l'envoi d'un inventaire est mort à mi-parcours. On croyait
> paralléliser quarante corrections ; en face, le service tourne avec cinq
> processus et une base qui n'accepte qu'un écrivain. Rien n'était parallélisé,
> tout faisait la queue, et PHP s'est arrêté à 30 secondes — le frigo à moitié
> corrigé, sans personne pour le dire. Une requête HTTP a une durée maximale ;
> un inventaire n'en a pas. Les faire coïncider était une erreur de conception,
> pas un réglage à ajuster. »

**22:00 – 26:00 · Les garanties — le bloc à ne pas rogner.**

| | |
|---|---|
| Tests front | **625** (596 purs + 29 de rendu) |
| Tests API | **302**, 797 assertions, sans base ni noyau |
| Audit de septembre 2026 | **84 constats** (3 critiques, 15 élevés), **8 lots, tous clos** |
| Catalogue d'exercices | ~1 338 entrées |
| Inventaire des capacités | **288**, chacune avec fichier et ligne |

> **Les compteurs vieillissent.** Ceux-ci ont été relevés le 16 septembre 2026.
> Avant de les annoncer, relance `cd front && npm test` et
> `docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'` et **lis la
> sortie** : annoncer un chiffre qu'on n'a pas recompté est exactement la faute
> que ce projet répare.

> « **Le test est écrit avant, et on le regarde échouer.** Sinon on ne corrige
> pas un bug : on ajuste le test qui fige la mauvaise valeur. L'audit a trouvé
> **douze** vérifications qui ne pouvaient pas échouer — elles ont été
> réparées. »

Et l'exemple à raconter, parce qu'il est concret et qu'il se retient :

> « Un contrôle de propriété était posé sur une route d'écriture et **oublié sur
> sa jumelle**, qui écrit la même chose par un autre chemin. Résultat : quelqu'un
> pouvait rendre l'aliment d'un autre **indélébile**. La correction n'a pas été
> de recopier le contrôle sur la deuxième porte — elle a été de le **descendre au
> point de passage obligé**, ce qui couvre les trois appelants d'un coup, et le
> quatrième qui n'existe pas encore. »

**C'est le motif de défaut dominant du projet, et il a un nom : le jumeau
oublié.** Une décision juste, appliquée à un endroit et oubliée à un autre.

**26:00 – 29:00 · Comment c'est construit.** C'est l'acte qui surprend ; il faut
l'assumer sans le survendre.

> « L'application est développée **avec l'assistance d'une IA**, et le dépôt
> porte son outillage : des compétences qui décrivent les pièges de *ce* projet,
> des agents de contrôle en lecture seule, et un graphe de connaissances du code. »

L'histoire à raconter, parce qu'elle répond d'avance à « et si l'IA écrit du
code faux ? » :

> « Un agent fait tourner l'application sur un **vrai émulateur Android** et fait
> les gestes d'un utilisateur. Il a trouvé que taper **42,5 kg** enregistrait
> **425 kg** — la virgule disparaissait sous les doigts. **577 tests étaient au
> vert.** Aucun test unitaire ne pouvait le voir, parce que le défaut était dans
> le clavier, pas dans le calcul. Et la veille de cette présentation, le même
> agent a trouvé qu'un sélecteur livré la veille ne commandait rien : le choix
> partait en base, l'écran ne suivait pas. »

> « C'est ça, la réponse honnête : l'IA écrit vite, et **on paie des contrôles
> qui cherchent exprès ce qu'elle a manqué**. Rien n'est déclaré terminé sans la
> sortie des tests. »

**29:00 – 30:00 · Ce qu'on ne promet pas.** À dire en propre, parce que c'est ce
qui rend crédible tout le reste : **pas de date de mise en production ouverte**,
**pas de support**, **pas de reprise de données** depuis une autre application ;
le produit est aujourd'hui **taillé pour un usage personnel**, multi-comptes par
invitation. C'est un choix, pas une limite technique.

## Ce qu'on ne montre pas, et pourquoi

| | Raison |
|---|---|
| **Le partage d'un modèle** | Il n'existe pas — décision du 15 septembre 2026. Ne rien promettre. |
| **La création d'un exercice** | Réservée aux administrateurs par l'API, et **sans aucun écran**. |
| **Changer son mot de passe ou son adresse** | L'API sait faire, aucun écran ne l'appelle. |
| **L'administration** (exercices, fusion, cuissons, invitations, comptes) | Demande un second compte administrateur. Hors sujet pour des commerciaux : c'est de l'outillage interne. |
| **La source Grocy** | Ne fonctionne que si `GROCY_URL` est renseigné sur l'instance. À ne pas évoquer sinon. |
| **Les notifications distantes** | Absentes d'Expo Go depuis le SDK 53 : non démontrables sur émulateur. |

## Les questions qui viendront

**« Combien de temps pour développer ça ? »**
> Cinq semaines, à une personne — avec l'assistance d'IA décrite dans le dernier
> acte. Le chiffre honnête inclut l'audit et les corrections.

**« Comment garantissez-vous qu'un utilisateur ne voit pas les données d'un autre ? »**
> Trois pièces : une interface de marquage, un filtre Doctrine qui pose le WHERE
> sur toutes les requêtes, et un test qui refuse toute entité exposée non
> conforme. Plus un contrôle au point de passage obligé de l'écriture. Et je
> vous dis franchement ce qui manque encore : un test qui vérifie le filtre
> lui-même.

**« Et si l'IA écrit du code faux ? »**
> C'est pour ça que le test est écrit avant, et qu'on le regarde échouer. Et que
> rien n'est déclaré terminé sans la sortie des tests collée dans la
> conversation. L'audit qui a trouvé 84 constats a été mené avec le même outil.

**« C'est utilisable par quelqu'un d'autre que vous ? »**
> L'application est multi-comptes, par invitation. Techniquement oui. Le produit
> est aujourd'hui taillé pour un usage personnel — c'est un choix, pas une
> limite technique.

**« Pourquoi pas une application du commerce ? »**
> Parce qu'aucune ne part du frigo réel, et parce que la convention européenne
> des fibres — 2 kcal par gramme, comptées à part — n'est presque jamais
> respectée. Sur un régime riche en fibres, l'écart se voit.

---

# Partie V — Ce qui reste à arbitrer

**Ce ne sont pas des questions techniques : elles appartiennent au
propriétaire.** Elles sont ici pour ne pas être découvertes en salle.

1. **Les catégories d'aliment** — le document du propriétaire en cite **trois**
   (Glucide / Lipide / Protéine), l'application en a **huit**. Simple
   imprécision d'écriture, sans effet — ou faut-il les regrouper à l'écran ?
   *Sans décision depuis le 16 septembre 2026.*
2. **Les deux garde-fous d'Epley** — plafond de 15 répétitions, série d'une
   répétition prise telle quelle. Ils sont voulus et restent tels quels **sauf
   avis contraire**.
3. **`FrigoGrocy::lire()` ne prend aucun utilisateur : le frigo Grocy est
   global**, pas par compte. Sans conséquence aujourd'hui — seul
   l'administrateur l'utilise, et une invitation crée toujours un compte en
   source `base` — mais **deux comptes en Grocy liraient le même stock et
   écriraient l'un chez l'autre**. Ce n'est pas dans la liste des exceptions
   documentées de la règle 2 du projet. *À arbitrer.*
4. **`features.md` est daté du 14 septembre 2026** et porte encore des
   affirmations fausses : « zone 70–80 % » (c'est 70 à 90 %), et le partage de
   modèle. Il reste la matière — les adresses `fichier:ligne` à jour sont dans
   les fiches `fonctionnalite-*` — mais **il est à reprendre**.

## Ce qui n'a pas été vérifié

- **Le frigo Grocy en fonctionnement** : il demande une instance configurée.
- **Les notifications d'alarme téléphone fermé** : Expo Go n'a plus les
  notifications distantes, il faut l'APK.
