# Épreuves de bout en bout

Un vrai navigateur, la vraie API, la vraie base. Ce que les 741 tests du front
(plus 46 de rendu) et les 564 de l'API ne peuvent pas voir : **l'assemblage**.

```bash
cd e2e && npm install     # une seule fois
cd e2e && npm test        # les épreuves
cd e2e && npm run test:vu # les mêmes, navigateur visible
cd e2e && npm run rapport # le rapport HTML du dernier passage
```

## Ce qu'elles exigent pour tourner

L'environnement de développement debout — `docker compose -f compose.dev.yml up`
— et l'application servie sur `http://localhost:8080`. Une autre adresse se
donne par `FITCARNET_URL`.

**Le `front/dist` doit être à jour.** C'est lui qui est servi : après une
modification de `front/`, `npm run build:web` puis
`rm -rf api/front && cp -r front/dist api/front`. Une épreuve qui tombe sans
raison est presque toujours un `dist` périmé.

## La règle qui ne se négocie pas

**Ces épreuves n'écrivent JAMAIS sur une donnée qu'elles n'ont pas créée.**
Chacune monte son compte jetable en `@e2e.local`, et le ménage final **refuse
de se terminer** s'il en reste un. Voir `epreuves/compteJetable.ts`, et la
skill `donnees-de-test` pour le pourquoi — un `PATCH` de vérification sur une
donnée réelle a déjà coûté la restauration d'une sauvegarde.

## Pourquoi ce dossier existe

Le 20 septembre 2026, trois défauts se sont succédé en une heure, tous trouvés
**à la main** par le propriétaire du projet, et aucun vu par les 1 293 tests
unitaires :

1. le serveur refusait un aliment incohérent par l'entité, mais le chemin
   Grocy l'acceptait sans un mot ;
2. l'écran affichait « Cohérent » en vert sur ce que le serveur allait
   refuser, parce qu'il jugeait avec la moitié des règles ;
3. le message de refus attendait les quatre macros pour apparaître.

Aucun ne se voit sans monter l'application entière.

## Ce qu'on n'éprouve PAS ici

**Les bornes et les formules.** Elles vivent **sur le serveur**, et les suites
PHPUnit les éprouvent là-bas — dont un corpus de 7 936 cas pour les quatorze
anomalies. Les rejouer dans un navigateur rendrait ces épreuves lentes sans
rien garantir de plus.

*(Ce paragraphe disait « elles vivent dans `api/regles/*.json`, lus par les deux
suites ». Les quatre fichiers ont été supprimés les 20 et 21 septembre 2026 avec
les doubles juges qu'ils tenaient d'accord. La phrase jumelle de `CLAUDE.md` a
été corrigée le 21 ; celle-ci a été oubliée le même jour, et retrouvée par
`verite-documentaire`. Le motif 1 du projet — le jumeau oublié — appliqué à sa
propre documentation.)*

On éprouve **l'assemblage** : que l'écran dise ce que le serveur fera, et que
la base contienne ce que l'écran a promis.

## Écrire une épreuve

1. **Lire l'écran avant de le piloter.** Le premier essai du 20 septembre a
   tapé dans la barre de recherche du frigo en croyant viser l'éditeur.
2. **Désigner par l'étiquette, jamais par le rang.** `getByLabel('Calories')`
   et non `input` numéro 1 : un champ ajouté décalerait tout, en silence.
3. **Vérifier en BASE, pas seulement à l'écran.** Un écran peut afficher un
   refus et enregistrer quand même.
4. **Un témoin par refus.** Sans lui, une règle qui refuserait tout passerait
   l'épreuve tout en rendant l'application inutilisable.
5. **Éprouver que l'épreuve peut tomber**, en sabotant la règle qu'elle garde.
