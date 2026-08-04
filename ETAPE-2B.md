# Étape 2b — séances et modèles

Six entités qui complètent l'API : les modèles de séance et les séances
réalisées, chacune lue et écrite **en un seul objet complet**.

---

## 1. Copier les fichiers

Tous dans `api/src/Entity/` :

```
Modele.php   ModeleExercice.php   ModeleSerie.php
Seance.php   SeanceExercice.php   Serie.php
```

Puis :

```bash
docker compose -f compose.dev.yml exec app php bin/console cache:clear
docker compose -f compose.dev.yml exec app php bin/console doctrine:schema:validate --skip-sync
```

Attendu : « The mapping files are correct. »

---

## 2. Tester

```bash
JETON=$(curl -s -X POST http://localhost:8080/api/connexion \
  -H 'Content-Type: application/json' \
  -d '{"email":"TON_EMAIL","motDePasse":"TON_MOT_DE_PASSE"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

# quel identifiant pour « Chest press machine » ?
curl -s 'http://localhost:8080/api/exercices?nom=chest' -H "Authorization: Bearer $JETON"
```

Note l'`@id` renvoyé (par exemple `/api/exercices/3`), puis crée une séance
complète en un seul appel :

```bash
curl -s -X POST http://localhost:8080/api/seances \
  -H "Authorization: Bearer $JETON" \
  -H 'Content-Type: application/ld+json' \
  -d '{
    "date": "2026-08-04",
    "type": "Push",
    "exercices": [{
      "exercice": "/api/exercices/3",
      "ordre": 0,
      "mode": "charge",
      "series": [
        {"ordre":0,"reps":12,"poids":40,"faite":true,"repsCible":12,"poidsCible":40},
        {"ordre":1,"reps":12,"poids":40,"faite":true,"repsCible":12,"poidsCible":40},
        {"ordre":2,"reps":10,"poids":42.5,"faite":true,"repsCible":12,"poidsCible":40}
      ]
    }]
  }'
```

La réponse contient la séance entière, plus deux valeurs calculées :
`avancement` (`{"faites":3,"total":3}`) et, sur chaque exercice, `rmEstime`
(le 1RM Epley de la meilleure série — ici **56.6 kg**).

Relis-la :

```bash
curl -s http://localhost:8080/api/seances -H "Authorization: Bearer $JETON"
```

---

## 3. Commiter

```bash
git add -A
git commit -m "Étape 2b : séances et modèles, lus et écrits en un seul objet"
git push
```

---

## Ce qui est en place

**Un appel par séance, pas vingt.** Les collections `exercices` et `series` sont
sérialisées et désérialisées avec l'objet parent (`cascade: persist`), ce qui
évite l'aller-retour par ressource imbriquée — décisif sur mobile avec une
connexion de salle de sport.

**`orphanRemoval`** : retirer un exercice du tableau envoyé le supprime en base.
Un `PATCH` avec la séance complète suffit donc à tout synchroniser, y compris
les suppressions.

**Le prévu et le réalisé cohabitent** dans `serie` : `reps` / `repsCible`,
`poids` / `poidsCible`. C'est ce qui permet d'afficher l'objectif en filigrane
pendant la saisie, comme dans l'application actuelle.

**Deux valeurs calculées, jamais stockées** : `avancement` sur la séance et
`rmEstime` sur chaque exercice. Elles se recalculent à la lecture, donc aucune
donnée ne peut se désynchroniser.

**`ModeleExercice`, `ModeleSerie`, `SeanceExercice` et `Serie` n'ont aucune
opération HTTP propre** (`operations: []`) : elles n'existent qu'à travers leur
parent. Impossible de les manipuler isolément, donc impossible de contourner le
contrôle de propriété.

---

## Étape suivante

Le calculateur de repas : endpoint qui résout les quantités pour atteindre les
cibles macro, avec l'aiguillage `sourceFrigo` entre Grocy et la table `stock`.
