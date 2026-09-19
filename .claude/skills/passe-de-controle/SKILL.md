---
name: passe-de-controle
description: La passe de contrôle avant une livraison, un APK, une démonstration ou une passation — quels agents lancer, dans quel ordre, avec quel périmètre, et ce que chacun ne voit pas. À charger quand on s'apprête à publier quoi que ce soit, ou quand on demande « est-ce qu'il reste quelque chose à corriger ? ».
---

# La passe de contrôle

**Six agents, et aucun ne voit ce que voit son voisin.** Le risque n'est pas
qu'ils se trompent : c'est d'en oublier un. Cette fiche existe pour que ça
n'arrive pas.

## Ce que chacun cherche, et ce qu'il ne verra jamais

| Agent | Cherche | Ne verra jamais |
|---|---|---|
| `revue-fitcarnet` | Le code **contre lui-même** — les huit motifs de l'audit | Qu'une bibliothèque recommande autre chose. Il n'a pas le MCP |
| `revue-pile` | Le code **contre la doc officielle de sa pile**, par `context7` | Les défauts internes ; il ne relit pas le projet pour lui-même |
| `verite-documentaire` | Ce que la doc **du projet** affirme, contre le dépôt réel | Si le code marche |
| `verification-bout-en-bout` | L'application **qui tourne** — API, base, parcours | Ce qui ne se voit qu'à l'écran |
| `verification-android` | Le **vrai moteur d'Android** — clavier, marges, cycle de vie | Ce qui ne casse qu'en production |
| `verification-fonctionnalites` | La fonctionnalité **du point de vue de l'utilisateur**, filmée | Le code |

**Aucun d'eux ne remplace un autre.** Le 18 septembre 2026, quatre lancés en
parallèle ont rendu quatre constats dont aucun n'était visible depuis un autre
angle :

- `revue-fitcarnet` : une connexion pouvant rendre **500** — un `flush()` qui
  échoue ferme l'EntityManager, et le service appelé deux lignes plus loin tient
  le même ;
- `revue-pile` : `login_throttling` devenu un **verrou de tout le site**, faute
  de `trusted_proxies` ;
- `verite-documentaire` : une fiche affirmant encore « le changement de mot de
  passe n'a **aucun écran** », alors que sa jumelle avait été corrigée la veille ;
- `verification-android` : la barre d'état **blanche sur le doré**, 1,96:1 — et
  invisible sur le web, parce qu'`expo-status-bar` n'y fait rien.

## Comment on la lance

**En parallèle, en un seul message**, avec un périmètre distinct pour chacun.
Ils sont longs — compter dix à trente minutes — et ne se gênent pas… sauf sur un
point, voir plus bas.

Le périmètre se donne en `git diff <base>..HEAD` plus une liste de zones à
privilégier. **Un périmètre vague rend un rapport vague.** Dis aussi ce qui a
DÉJÀ été revu, sinon ils le re-rapportent.

### Lesquels, selon ce qu'on publie

| Ce qu'on publie | Les agents à lancer |
|---|---|
| Un correctif sur `api/` | `revue-fitcarnet` + `verification-bout-en-bout` |
| Un correctif sur `front/` | `revue-fitcarnet` + `verification-android` |
| **Un APK** | **les six** — c'est le seul geste qu'on ne peut pas défaire à distance |
| Une montée de version, une config de sécurité | `revue-pile` d'abord, il est fait pour ça |
| Une passation, une démonstration | `verite-documentaire` + `verification-fonctionnalites` |

## Les trois pièges de la passe elle-même

**1. ILS ÉCRIVENT TOUS DANS LA MÊME BASE DE DÉV.** Lancés ensemble,
`verification-bout-en-bout` et `verification-android` créent chacun leurs
comptes jetables — et voient ceux de l'autre apparaître et disparaître. Les deux
l'ont signalé le 19 septembre, correctement : *« un compte est apparu que je
n'ai PAS créé »*. **C'est le bon comportement** : ils ne touchent qu'à ce qu'ils
ont créé. Mais leurs relevés « avant / après » ne peuvent pas se lire
isolément — il faut lire les deux rapports ensemble.

**2. UN RAPPORT N'EST PAS UNE VÉRITÉ.** Vérifie chaque constat avant de
corriger. Le 19 septembre, un agent a conclu que le serveur `context7` refusait
l'authentification, sur la foi d'un `curl` brut qui rendait 401 : c'était faux,
le client MCP répondait parfaitement. **Un outil absent et un outil qui refuse ne
se distinguent pas de l'intérieur.**

**3. CORRIGER PENDANT QU'ILS TOURNENT INVALIDE CE QU'ILS ONT VU.** Le
19 septembre, `front/app/_layout.tsx` a été réécrit au milieu de l'épreuve
Android : l'agent l'a détecté, l'a dit, et a refait la mesure concernée sur un
bundle neuf. **S'il ne l'avait pas dit, son rapport aurait décrit un arbre qui
n'existait plus.** Soit on attend la fin, soit on redemande la mesure touchée.

## Ce qu'il faut leur demander, à tous

Trois phrases à mettre dans chaque consigne, parce qu'elles changent la qualité
du rapport :

- **« Dis ce que tu as vérifié et ce que tu n'as PAS pu vérifier. »** C'est ce
  qui distingue un constat d'une supposition.
- **« Dis ce que tu as regardé sans rien trouver. »** C'est ce qui permet de
  savoir ce qui reste à relire.
- **« Si tu n'y arrives pas, dis-le au lieu de diagnostiquer. »**

## Après la passe

**Ne clos pas la passe sur les rapports.** Corrige, puis **relance ce qui a été
touché** — et lance les suites, qui ne mentent pas :

```bash
cd front && npm test
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'
docker exec fitcarnet-app-dev sh -c 'cd /app && vendor/bin/phpstan analyse --no-progress'
db/manuel/verifier-schema.sh
```

Et si `front/src` ou `front/app` a bougé : `npm run build:web`, puis
`rm -rf api/front && cp -r front/dist api/front`. Le `dist` est versionné ; un
`dist` périmé se commite sans bruit et se déploie tel quel.
