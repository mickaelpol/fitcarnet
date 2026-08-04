# fitcarnet — étape 1 : socle

Application multi-utilisateurs (séances de musculation + calculateur de repas),
**déployée à côté de ton carnet actuel**, qui continue de fonctionner sans changement.

- Front : React (à venir, étape 2)
- API : Symfony + API Platform sur **FrankenPHP**, PHP 8.3
- Base : PostgreSQL 16, dédiée
- Sous-domaine visé : `fitcarnet.mickael-pol.fr` (port local **8094**)

> **Pourquoi FrankenPHP plutôt que nginx + php-fpm** : un seul conteneur au lieu
> de deux, plus aucune configuration nginx à maintenir, HTTP/3 natif, et la
> possibilité d'activer plus tard le *mode worker* (application gardée en
> mémoire, débit 3 à 4×). On démarre en **mode classique** : même modèle de
> requête que php-fpm, sans le risque de fuite mémoire des workers longue durée.

---

## Ce que contient cette livraison

```
fitcarnet/
├─ docker-compose.yml        stack (db + api + web)
├─ .env.exemple              variables à renseigner
├─ docker/
│  ├─ Dockerfile             image FrankenPHP (cibles dev et prod)
│  └─ Caddyfile              API sous /api + front React ailleurs
└─ db/
   ├─ 01-schema.sql          12 tables + 1 vue
   └─ 02-donnees.sql         50 aliments + 20 exercices de référence
```

---

## Installation

**1. Arborescence sur le NAS**

```bash
sudo mkdir -p /volume1/docker/fitcarnet/{db,docker,api,front,pgdata}
```

Dépose `db/*.sql` dans `/volume1/docker/fitcarnet/db/`, puis `Dockerfile` et
`Caddyfile` dans `/volume1/docker/fitcarnet/docker/`.

**2. Secrets**

```bash
cd /volume1/docker/fitcarnet
cp .env.exemple .env
# génère trois valeurs distinctes :
openssl rand -hex 24    # DB_PASSWORD
openssl rand -hex 32    # APP_SECRET
openssl rand -hex 24    # JWT_PASSPHRASE
```

**3. Déploiement**

Portainer → Stacks → Add stack → colle `docker-compose.yml` → ajoute les trois
variables d'environnement → Deploy.

Les fichiers SQL sont joués **automatiquement à la création de la base**, dans
l'ordre alphabétique. Ils ne seront **pas rejoués** ensuite : pour repartir de
zéro, supprime le dossier `pgdata`.

**4. Vérification**

```bash
sudo docker exec -it fitcarnet-db psql -U fitcarnet -d fitcarnet \
  -c "\dt" -c "SELECT count(*) FROM aliment;" -c "SELECT count(*) FROM exercice;"
```

Attendu : 12 tables, 50 aliments, 20 exercices.

**5. Reverse proxy**

DSM → Portail de connexion → Proxy inversé → `fitcarnet.mickael-pol.fr`
vers `IP_NAS:8094`, avec certificat Let's Encrypt.

---

## Le modèle de données en un coup d'œil

**Commun à tous** — `aliment`, `exercice`, `emplacement`.
Enrichi par n'importe quel utilisateur, profite à tout le monde.

**Privé par utilisateur** — `stock`, `cible`, `modele` (+ exercices et séries),
`seance` (+ exercices et séries).

**Le point clé** : `utilisateur.source_frigo` vaut `grocy` pour toi et `base`
pour les autres. C'est ce seul champ qui aiguille le calculateur vers l'API
Grocy ou vers la table `stock`. Ta mécanique diète actuelle reste intacte.

**Les séries conservent le prévu et le réalisé** (`reps` / `reps_cible`), ce qui
permet de comparer la séance à son modèle sans dupliquer les données.

La vue `v_performance` calcule le 1RM estimé (Epley), la meilleure tenue et le
meilleur chrono par exercice et par date — de quoi alimenter directement les
courbes de progression sans recalcul côté application.

---

## Étape suivante

Squelette Symfony + API Platform : entités, DTO, authentification JWT,
et création des comptes réservée à l'admin.


---

## Passer en mode worker plus tard

Quand l'application tournera et que tu voudras la performance :

1. décommente le bloc `frankenphp { worker ./public/index.php 2 }` du `Caddyfile` ;
2. installe `runtime/frankenphp-symfony` côté Symfony ;
3. surveille la mémoire du conteneur les premiers jours.

Les workers gardent l'application en mémoire entre les requêtes : c'est ce qui
donne le gain de débit, mais aussi ce qui rend visibles les fuites mémoire que
php-fpm masquait en redémarrant à chaque requête. À activer une fois l'app
stabilisée, pas avant.
