# Déploiement

Un `git push` sur `master` met la production à jour. Rien d'autre.

Ce document dit comment ça marche, ce qu'il faut faire **une seule fois** pour
que ça marche, et ce qui reste à ta charge à chaque déploiement.

---

## Le principe

```
WSL ──push──▶ Gitea (NAS) ──webhook──▶ Portainer ──▶ git pull + rebuild + restart
                                                          │
                                                          ▼
                                              le conteneur, en démarrant :
                                              1. installe les dépendances PHP
                                              2. génère les clés JWT si absentes
                                              3. joue les migrations
                                              4. chauffe le cache
```

**Portainer clone le dépôt lui-même.** C'est pour ça que `docker-compose.yml`
n'utilise plus que des chemins relatifs — `./api`, `./db`, `./docker`
désignent le clone, donc toujours le commit qui vient d'être tiré. Il ne peut
plus y avoir d'écart entre ce qui tourne et ce qui est versionné.

**Une seule exception, voulue :** le répertoire de données de PostgreSQL reste
un chemin absolu sur le disque du NAS (`/volume1/docker/fitcarnet/pgdata`).
Les données ne vivent pas dans un dépôt, et un clone qu'on referait ne doit
surtout pas emporter la base avec lui.

---

## Ce que tu fais à chaque déploiement

```bash
cd front && npm run build:web && cd ..
git add -A && git commit -m "…" && git push
```

**Le build du front est à toi**, et c'est le seul geste manuel qui reste.
L'image de production n'a pas Node : l'y ajouter reviendrait à embarquer un
compilateur JavaScript pour regénérer, à chaque démarrage, des fichiers qui ne
changent qu'au moment où l'on pousse. `front/dist` est donc versionné —
volontairement, malgré le gros diff que ça produit.

**Si tu oublies le build**, la production sert l'ancien front avec la nouvelle
API. C'est le seul mode de panne de ce dispositif, et il est silencieux. Le
jour où ça arrive une fois de trop, on ajoutera un hook `pre-push`.

---

## À faire une seule fois

### 1. Le dépôt sur Gitea

Crée le dépôt, puis depuis WSL :

```bash
git remote add nas https://gitea.ton-nas/mickael/fitcarnet.git
git push -u nas master
```

### 2. Les secrets, dans Portainer

Trois variables, dans la section « Environment variables » de la stack. Elles
ne sont **jamais** dans le dépôt :

| Variable | Ce que c'est |
|---|---|
| `DB_PASSWORD` | mot de passe PostgreSQL. **Fixé à la création du volume** : le changer ensuite ne fait que casser la connexion. |
| `APP_SECRET` | secret Symfony. Le changer invalide les cookies signés, sans plus. |
| `JWT_PASSPHRASE` | protège la clé privée JWT. **La changer déconnecte tout le monde** et rend les clés existantes illisibles. |
| `GROCY_URL`, `GROCY_API_KEY` | facultatifs. Vides, l'application le détecte et l'explique. |

Note-les ailleurs qu'ici. Elles ne sont récupérables nulle part si tu les
perds : le mot de passe de la base est dans le volume, la passphrase n'est
écrite nulle part.

### 3. La stack Portainer

*Stacks → Add stack → Repository.*

- **Repository URL** : celle de Gitea
- **Reference** : `refs/heads/master`
- **Compose path** : `docker-compose.yml`
- **Automatic updates** : activer, et choisir **Webhook** plutôt que
  *Polling*. Le polling interroge Gitea toutes les N minutes pour découvrir
  qu'il ne s'est rien passé ; le webhook ne parle que quand il y a quelque
  chose à dire.
- Coche **Re-pull image and redeploy** — la stack construit son image depuis
  `./docker`, elle doit la reconstruire quand le `Dockerfile` change.

Portainer affiche alors une URL de webhook. Copie-la.

### 4. Le webhook, côté Gitea

*Dépôt → Settings → Webhooks → Add Webhook → Gitea.*

- **Target URL** : celle donnée par Portainer
- **HTTP Method** : `POST`
- **Trigger** : *Push events* uniquement
- **Branch filter** : `master`

Gitea et Portainer étant sur la même machine, l'appel ne sort pas du NAS.

---

## Ce que le conteneur fait tout seul, à chaque démarrage

Voir `docker/entrypoint-prod.sh`. Quatre gestes, et **l'ordre est le sujet** :

1. **Dépendances PHP** — `composer install --no-dev`, et seulement si
   `composer.lock` a bougé. Une empreinte gardée dans `vendor/` évite de
   refaire trois minutes de travail à chaque redémarrage.
2. **Clés JWT** — générées au premier démarrage, jamais régénérées ensuite.
   Elles survivent aux `git pull` parce que git ne touche pas aux fichiers
   qu'il ne connaît pas. **Ne supprime jamais `api/config/jwt/` « pour
   repartir propre »** : tout le monde serait déconnecté.
3. **Migrations** — `db/manuel/`, dans l'ordre écrit à la main, jamais trié.
   PostgreSQL ne joue `db/` qu'à la création du volume ; tout ce qui vient
   après passe par là, et personne n'est sur le NAS pour le lancer.
4. **Cache Symfony** — **après** la base. Il fige le schéma et les routes : le
   chauffer avant reviendrait à mémoriser une base qui n'existe pas encore.

Le script s'arrête à la première erreur. Une application qui démarre sur des
migrations à moitié jouées est pire qu'une application qui ne démarre pas : la
seconde se voit tout de suite.

```bash
# ce qui s'est passé au dernier démarrage
docker logs fitcarnet-app | head -40
```

---

## Ce que ce dispositif ne fait pas

- **Il ne teste rien.** Un commit qui casse le typage part en production comme
  un autre. `npm test` avant de pousser reste à ta charge.
- **Il ne sait pas revenir en arrière.** Revenir à la version d'avant, c'est
  `git revert` puis `git push` — donc un aller-retour complet, pas un bouton.
- **Il ne sauvegarde pas avant de migrer.** Une migration destructive
  s'appliquerait sans filet. `./sauvegarde.sh` avant tout déploiement qui
  touche au schéma.

Ces trois trous se bouchent le jour où ils font mal, pas avant.
