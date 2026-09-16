---
name: epreuve-fonctionnalite
description: La méthode commune pour éprouver UNE fonctionnalité de fitcarnet du point de vue de l'utilisateur final — données de départ, épreuve sur le web ou sur Android, critères « répond au besoin », capture vidéo pour la démonstration, rapport, nettoyage. À charger avec la fiche `fonctionnalite-*` visée.
---

# Éprouver une fonctionnalité, et la filmer

Une fonctionnalité n'est pas « testée » parce que son code a des tests. Elle l'est
quand on a **fait ce que l'utilisateur fait**, sur l'application qui tourne, et
constaté qu'**elle répond au besoin pour lequel elle existe** — le bon chiffre,
le bon message, la bonne donnée en base.

Le 15 septembre 2026, 577 tests étaient au vert pendant qu'un poids de 42,5 kg
s'enregistrait 425 kg. Seule une saisie réelle, frappe par frappe, l'a montré.

Cette skill porte ce qui est COMMUN à toutes les fiches. Chaque fiche
`fonctionnalite-*` porte ce qui est propre à sa fonctionnalité, selon le gabarit
en bas de ce document.

## Les règles, sans exception

1. **Jamais la production.** Tout se passe sur l'environnement de développement
   (`fitcarnet-app-dev`, `fitcarnet-db-dev`). Les scripts `publier*.sh`,
   `deployer-nas.sh`, `restaurer-nas.sh` ne se lancent jamais.
2. **Jamais sur une donnée que tu n'as pas créée.** Charge la skill
   `donnees-de-test` : compte `…@test.local`, ordre de suppression.
3. **Tu ne corriges pas le code.** Tu constates et tu rapportes, avec la
   reproduction. L'auteur décide.
4. **Une preuve par critère** : la commande lancée et sa sortie, la capture, la
   ligne en base. « Ça marche » n'est pas un résultat.
5. **Chemins absolus uniquement.** Des commandes lancées en parallèle se
   disputent le dossier courant : le 15 septembre, un `cd front && npm run build:web`
   a tourné à la racine et un `rm -rf api/front` est parti d'un autre dossier.
   Un `rm` n'a jamais de chemin relatif.

## 1. Préparer

```bash
docker ps --format '{{.Names}}\t{{.Status}}'        # fitcarnet-app-dev et fitcarnet-db-dev
curl -s http://localhost:8080/api/etat               # {"ok":true}
db/manuel/rattraper-dev.sh                           # la base de dev ne rejoue jamais seule ses migrations
```

**Un compte jetable par épreuve**, créé comme le dit `donnees-de-test`. Pour une
fonctionnalité qui a besoin d'historique (séances, progression, plans, cibles),
charge le jeu de démonstration **dans ce compte-là** :

```bash
COMPTE=fonction-verif@test.local
sed "s/demo@fitcarnet.local/$COMPTE/" /home/micka/perso/fitcarnet/db/manuel/jeu-demo.sql \
  | docker exec -i fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -v ON_ERROR_STOP=1
sed "s/essai@fitcarnet.local/$COMPTE/" /home/micka/perso/fitcarnet/db/manuel/jeu-essai.sql \
  | docker exec -i fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -v ON_ERROR_STOP=1
```

**Relis l'adresse du `sed` avant d'appuyer sur Entrée** : `jeu-demo.sql` EFFACE
avant de poser. Son garde-fou refuse un compte qui a déjà des séances — s'il se
déclenche, lis le message au lieu de relancer avec `-v ecraser=oui`.

**Un compte administrateur** n'est nécessaire que pour `fonctionnalite-administration`
et les écrans d'invitation : `roles` à `'ROLE_ADMIN'`, jetable lui aussi.

## 2. Choisir la plateforme

| Plateforme | Quand | Comment |
|---|---|---|
| **Web** | par défaut : c'est la plus rapide, et la vidéo sort propre en 1440×900 | le bundle servi par Caddy, `http://localhost:8080` |
| **Android** | clavier, notifications, sons, gestes, tout ce qui dépend du moteur natif | skill **`verification-android`** |
| **API seule** | pour prouver ce qui arrive en base derrière un geste | `curl` + `psql`, voir `donnees-de-test` |

**Sur le web, le bundle doit être celui du code actuel** — `api/front` est un
doublon de `front/dist` qui périme en silence :

```bash
npm --prefix /home/micka/perso/fitcarnet/front run build:web
test -d /home/micka/perso/fitcarnet/front/dist/_expo \
  && rm -rf /home/micka/perso/fitcarnet/api/front \
  && cp -r /home/micka/perso/fitcarnet/front/dist /home/micka/perso/fitcarnet/api/front
```

Pour vérifier que le bundle contient bien un changement, cherche un **texte
affiché** : les noms de variables sont minifiés, et les accents sont encodés
(`\xe9` pour « é »).

## 3. Éprouver

Chaque fiche liste ses **critères d'acceptation**. Pour chacun :

- **fais le geste de l'utilisateur**, pas un appel d'API qui le contourne — sauf
  si le critère porte sur l'API elle-même ;
- **relis l'écran après chaque geste** : un libellé qui change (« enregistré »),
  une fenêtre système, un clavier qui s'ouvre décalent tout ;
- **vérifie la conséquence** : la valeur en base, le chiffre recalculé, le message
  affiché — au caractère près quand c'est un nombre (règle 7 : un chiffre faux est
  pire qu'un refus) ;
- **éprouve aussi le refus** : saisie vide, illisible, négative, droit manquant. Une
  fonctionnalité qui accepte tout n'est pas « fonctionnelle » ;
- **regarde la console** : zéro erreur JavaScript, zéro requête en échec non
  voulue.

Le script `presentation/tournage/verifier-ecrans.mjs` montre le motif web :
`type()` et un clic (React Native Web ne soumet rien sur « Entrée »), un motif
qui ne peut PAS correspondre à l'écran de connexion, et le relevé des erreurs.

## 4. Filmer

**Une vidéo par scénario de fonctionnalité**, rangée ainsi :

```
presentation/captures/<fonctionnalite>/<nn>-<scenario>.webm   (web)
presentation/captures/<fonctionnalite>/<nn>-<scenario>.mp4    (Android)
```

Ce dossier est ignoré par git : on versionne la matière, pas les vidéos.

**Sur le web**, reprends la mécanique de `presentation/tournage/tourner.mjs` :
`recordVideo` sur le contexte Playwright (la vidéo est écrite à la FERMETURE du
contexte, sous un nom aléatoire — renomme-la ensuite), le curseur ambre injecté
par `addInitScript`, la frappe à 60 ms par caractère, et des temps morts
volontaires pour qu'on puisse commenter. **Un contexte par scénario**, sinon tout
tombe dans une seule vidéo. Si plusieurs scripts de capture finissent par
reprendre le curseur et `cliquer()`, extrais-les dans un module partagé de
`presentation/tournage/` plutôt que de les recopier.

**Sur Android**, `adb shell screenrecord` — trois minutes au plus par fichier :
voir `verification-android`.

**Ce qu'on filme** : le parcours de la fiche, du point de départ à la conséquence
visible, sans les tâtonnements. Une prise ratée se refait ; on ne monte pas une
prise fausse.

## 5. Nettoyer, et le prouver

Supprime tout ce que l'épreuve a créé, dans l'ordre de `donnees-de-test` (stock,
puis aliments dont le compte est l'auteur, puis le compte), et montre le résultat :

```sql
SELECT count(*) FROM utilisateur WHERE email LIKE '%@test.local';                        -- 0
SELECT count(*) FROM aliment WHERE cree_par IS NULL AND nom LIKE '%verif%';               -- 0
SELECT count(*) FROM seance s LEFT JOIN utilisateur u ON u.id = s.utilisateur_id WHERE u.id IS NULL;  -- 0
```

Arrête ce que tu as lancé (serveurs, Metro, émulateur), retire les fichiers
temporaires (`front/.env.local`, APK…).

## 6. Rapporter

Un bloc par fonctionnalité :

```
## <fonctionnalité> — ✓ répond au besoin | ◐ partiel | ✗ ne répond pas
Plateforme : web | Android | les deux · compte : ordinaire | administrateur
| Critère | Résultat | Preuve |
|---|---|---|
| … | ✓ / ✗ | commande + sortie, capture, ligne en base |
Écarts : chaque défaut avec sa reproduction exacte, sa gravité, fichier:ligne si connu.
Captures : presentation/captures/<fonctionnalite>/…
Nettoyage : la requête et son résultat.
```

**Termine par ce que tu n'as PAS pu éprouver**, et pourquoi (Grocy non configuré,
notification distante absente d'Expo Go…). Un rapport qui tait ses angles morts
fait croire à une couverture qui n'existe pas.

---

## Le gabarit d'une fiche `fonctionnalite-*`

Chaque fiche suit exactement ce plan. **Toute affirmation sur l'application est
vérifiée dans le code**, avec son `fichier:ligne` ; un libellé d'écran est recopié
depuis le code, pas deviné. Ce qui n'a pas pu être vérifié est écrit comme tel.

```markdown
---
name: fonctionnalite-<nom>
description: <une phrase : le besoin couvert et ce que la fiche permet d'éprouver et de filmer>
---

# <Nom lisible par l'utilisateur>

## Le besoin
Pour qui, pour quoi faire, dans quelle situation — en deux ou trois phrases, du
point de vue de l'utilisateur final. C'est la référence du « répond au besoin ».

## Ce que l'application propose
La liste des capacités, telle qu'un utilisateur les décrirait, chacune avec son
écran et son `fichier:ligne`.

## Le parcours
Écrans, gestes et libellés EXACTS (copiés du code), du point de départ à la
conséquence visible. Compte requis, données de départ nécessaires.

## Critères d'acceptation
Numérotés. Chacun observable : ce qu'on fait, ce qu'on doit voir, ce qui doit être
en base. Y compris les refus (vide, illisible, droit manquant) et les règles du
projet qui s'appliquent (vide ≠ zéro, chiffre faux, isolation entre comptes).

## Comment l'éprouver
Web, Android et/ou API : les commandes, sélecteurs ou requêtes utiles, et les
pièges propres à cette fonctionnalité.

## La capture pour la démonstration
Un ou plusieurs scénarios : nom de fichier, déroulé, durée visée, ce qu'on doit
voir à l'image. Reprend la bobine correspondante de `presentation/demonstration.md`
quand elle existe.

## Limites connues
Ce qui n'est pas éprouvable ici, les défauts déjà connus, les zones d'ombre de
`presentation/features.md` (section K) qui la concernent.
```
