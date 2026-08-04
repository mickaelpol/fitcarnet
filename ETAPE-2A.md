# Étape 2a — sécurité, référentiel et « mon frigo »

Ce lot ajoute : l'authentification JWT, la création de comptes réservée à
l'admin, les référentiels communs (aliments, exercices, emplacements) et les
données privées de base (stock, cibles macro).

Les séances et modèles feront l'objet de l'étape 2b.

---

## 1. Copier les fichiers

Depuis la racine du dépôt, l'arborescence à obtenir :

```
api/
├─ config/
│  ├─ services.yaml                       ← remplace celui généré
│  └─ packages/
│     ├─ security.yaml                    ← remplace
│     ├─ doctrine.yaml                    ← remplace
│     ├─ api_platform.yaml                ← remplace
│     └─ lexik_jwt_authentication.yaml    ← remplace
└─ src/
   ├─ Command/CreerUtilisateurCommand.php
   ├─ Doctrine/FiltreProprietaire.php
   ├─ Entity/{Utilisateur,Aliment,Emplacement,Stock,Cible,Exercice,ProprieteUtilisateur}.php
   └─ State/{ProprietaireProcessor,UtilisateurProcessor}.php
```

Les cinq fichiers de configuration **écrasent** ceux générés par Composer.

---

## 2. Dire à Doctrine que la base existe déjà

Sans ça, la première migration voudrait recréer les 12 tables.

```bash
docker compose -f compose.dev.yml exec app bash

php bin/console doctrine:migrations:sync-metadata-storage
php bin/console cache:clear
```

Vérifie que le mapping correspond bien à la base :

```bash
php bin/console doctrine:schema:validate
```

Attendu : le mapping est valide, et la base « n'est pas synchronisée » sur des
détails (index, contraintes CHECK que Doctrine ignore). **C'est normal** :
ne lance jamais `doctrine:schema:update --force`, il supprimerait la vue
`v_performance` et la fonction `f_unaccent`.

---

## 3. Créer ton compte administrateur

```bash
php bin/console fitcarnet:creer-utilisateur mickael@mickael-pol.fr "Mickaël" --admin --grocy
```

Le mot de passe est demandé de façon masquée (10 caractères minimum).
`--grocy` positionne `sourceFrigo = grocy` : c'est ce qui aiguillera le
calculateur vers ton instance Grocy plutôt que vers la table `stock`.

---

## 4. Tester

```bash
exit   # sortir du conteneur

# connexion : récupère un jeton
curl -s -X POST http://localhost:8080/api/connexion \
  -H 'Content-Type: application/json' \
  -d '{"email":"mickael@mickael-pol.fr","motDePasse":"TON_MOT_DE_PASSE"}'
```

Réponse attendue : `{"token":"eyJ0eXAi..."}`.

```bash
JETON="colle_le_jeton_ici"

# référentiel commun : 50 aliments
curl -s http://localhost:8080/api/aliments -H "Authorization: Bearer $JETON" | head -c 400

# sans jeton : refusé
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/aliments
```

Attendu : la liste des aliments avec le jeton, **401** sans.

Dans le navigateur, **http://localhost:8080/api** liste maintenant les
opérations. Le bouton **Authorize** accepte `Bearer <jeton>` pour tester
directement depuis l'interface.

---

## 5. Commiter

```bash
git add -A
git commit -m "Étape 2a : JWT, comptes admin, référentiels, stock et cibles"
git push
```

---

## Ce qui est en place

**Cloisonnement automatique.** `FiltreProprietaire` restreint toute collection
d'entité marquée `ProprieteUtilisateur` (stock, cibles, et bientôt séances et
modèles) au porteur du jeton. Ce n'est pas une vérification à répéter dans
chaque endpoint : elle s'applique à la requête SQL elle-même, donc impossible à
oublier sur une nouvelle ressource — il suffit d'implémenter l'interface.

**Le propriétaire n'est jamais transmis par le client.** `ProprietaireProcessor`
l'affecte depuis le jeton à la création. Un utilisateur ne peut pas écrire dans
le stock d'un autre, même en forgeant la requête.

**Les mots de passe ne transitent qu'en clair à l'écriture** et sont hachés
avant persistance ; le champ n'est jamais renvoyé en lecture.

**Les référentiels sont ouverts en création à tous, en modification à l'admin.**
Chacun peut ajouter un aliment ou un exercice qui profite à tous, mais ne peut
pas modifier ceux des autres — un compromis raisonnable pour un usage familial.

---

## Étape suivante

Séances et modèles : entités, endpoint de séance complète (DTO), historique et
1RM via la vue `v_performance`.
