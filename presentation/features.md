# fitcarnet — inventaire des fonctionnalités

Liste tirée du code le 9 septembre 2026 : 18 écrans (`front/app/`), 27 routes de
contrôleur, 15 ressources API Platform, 36 hooks de données.

**La colonne « vu » est honnête.** ✅ = je l'ai vu fonctionner à l'écran pendant
le tournage ou les captures. 📖 = je l'ai seulement lu dans le code, je ne l'ai
jamais vu tourner et je ne peux pas garantir son comportement réel.

Sert de **liste de tournage** : coche au fur et à mesure.

---

## A · Compte et accès

| | Fonctionnalité | Où | Vu |
|---|---|---|---|
| A1 | Connexion par adresse et mot de passe | `connexion.tsx` | ✅ écran seul |
| A2 | **Rejoindre par invitation** : lien à jeton, choix du nom et du mot de passe | `invitation/[jeton].tsx` | 📖 |
| A3 | Session courte + jeton de rafraîchissement révocable | API `/jeton/rafraichir` | 📖 |
| A4 | Déconnexion | API `/deconnexion` | 📖 |
| A5 | Écran Compte | `(onglets)/compte.tsx` | 📖 |
| A6 | Réglages | `reglages.tsx` | 📖 |
| A7 | Bandeau « nouvelle version disponible » | `bandeauMaj.tsx` | 📖 |

## B · Le frigo

| | Fonctionnalité | Où | Vu |
|---|---|---|---|
| B1 | Stock groupé par emplacement, valeurs pour 100 g | onglet Mon frigo | ✅ |
| B2 | Mention **poids cru** et rendement à la cuisson | détail d'un aliment | ✅ |
| B3 | Recherche par aliment ou emplacement | champ en haut | ✅ non exercé |
| B4 | Détail d'un aliment : macros, suppression | carte dépliée | ✅ |
| B5 | **Ajouter un aliment** : partir d'un des 50 de référence, ou créer de zéro | modale | ✅ ouverte, non menée |
| B6 | Modifier une quantité à la main | `POST /mon-frigo/stock` | 📖 |
| B7 | **Inventaire en écarts** : compteur « n/14 vérifiés · n écart » | onglet Inventaire | ✅ |
| B8 | Envoi en lot et application **en tâche de fond** | `POST /mon-frigo/inventaire` | ✅ |
| B9 | Suivi de l'inventaire, même après avoir quitté l'écran | `/inventaire/dernier` | ✅ |
| B10 | Réinitialiser la saisie d'inventaire | bouton | ✅ non exercé |
| B11 | **Deux sources** : la base, ou Grocy pour l'administrateur | `Frigo::source` | 📖 |
| B12 | Produits Grocy sans valeurs nutritionnelles | `/mon-frigo/incomplets` | 📖 |
| B13 | Écrire les valeurs d'un produit dans Grocy | `/mon-frigo/aliment` | 📖 |

## C · Les repas — le calculateur

| | Fonctionnalité | Où | Vu |
|---|---|---|---|
| C1 | **Cibles par repas** (matin, midi, 16 h, soir), pas un total journalier | étape 1 | ✅ |
| C2 | **Écran Objectifs** : régler calories, protéines, glucides totaux, lipides | `objectifs.tsx` | 📖 |
| C3 | Un ou plusieurs jours, nombre de convives par repas | étape 1 | ✅ partiel |
| C4 | **Composition automatique** (solveur, élimination de Gauss) | « Composer les repas » | ✅ |
| C5 | Tableau à quatre colonnes : aliment, à peser, servi, une personne | étape 2 | ✅ |
| C6 | **Ajuster** : remplacer un aliment, déclarer un « reste », mettre 0 | étape 2 | ✅ non exercé |
| C7 | Ajouter un aliment hors proposition | « + Ajouter un aliment » | ✅ non exercé |
| C8 | **Cuissons** cru/cuit par aliment, réglables d'un coup | étape 2 | ✅ |
| C9 | Les cuissons sont **mémorisées** d'une fois sur l'autre | `cuisson_habituelle` | ✅ message vu |
| C10 | **Avertissements de qualité** : bornes physiques, fibres inconnues | étape 2 | ✅ |
| C11 | **Compléments alimentaires** rattachés à un repas | `Complement` | 📖 |
| C12 | **Batch cooking** : fournées puis répartition en boîtes | étape 3 | ✅ |
| C13 | **Liste de courses** issue du plan | `PlanEnregistre.courses` | 📖 |
| C14 | Enregistrer le plan sous un nom | étape 3 | ✅ non exercé |
| C15 | **Mes plans enregistrés**, avec leur état de cuisson | étape 1 | ✅ |
| C16 | **« J'ai cuisiné »** : décrémente le frigo et marque le plan, en un appel | `/plan_repas/{id}/cuisine` | 📖 |
| C17 | Supprimer un plan | `DELETE` | 📖 |

## D · Les séances

| | Fonctionnalité | Où | Vu |
|---|---|---|---|
| D1 | Liste des séances : type, date, séries faites | onglet Séances | ✅ |
| D2 | Détail : exercices, séries, cases à cocher | `seance/[id].tsx` | ✅ |
| D3 | **Trois modes** : Charge, Tenue, Chrono | par exercice | ✅ non exercé |
| D4 | **1RM estimé**, variation, et **graphique de progression** | par exercice | ✅ |
| D5 | Rappel de la séance précédente (charges et répétitions) | bandeau ambre | ✅ |
| D6 | **Minuteur de repos** : 1:00 / 1:30 / 2:00 / 3:00 | barre du bas | ✅ non exercé |
| D7 | **Calculateur de charge / disque RM** | bouton « RM » | 📖 |
| D8 | Notes par exercice | section Notes | ✅ |
| D9 | Ajouter ou retirer une série, un exercice | boutons | ✅ non exercé |
| D10 | Totaux : répétitions et kilos soulevés | par exercice | ✅ |
| D11 | Créer une séance à partir d'un modèle | « + Nouvelle séance » | 📖 |
| D12 | **Transformer une séance en modèle** | `useSeanceVersModele` | 📖 |
| D13 | Historique, records antérieurs, « la dernière fois » | `useHistorique` | 📖 |
| D14 | Supprimer une séance | `DELETE` | 📖 |

## E · Les programmes (modèles)

| | Fonctionnalité | Où | Vu |
|---|---|---|---|
| E1 | Liste des modèles | onglet Modèles | ✅ |
| E2 | Détail : nom, exercices, séries cibles (reps, poids, secondes) | `modele/[id].tsx` | 📖 |
| E3 | Ajouter ou retirer un exercice du modèle | `modele/[id].tsx` | 📖 |
| E4 | **Réordonner, et appliquer ce nouvel ordre aux séances** | `useAppliquerOrdre` | 📖 |
| E5 | Partage d'un modèle | champ `partage` | 📖 — **inopérant**, constat F-05 de l'audit |

## F · Administration

| | Fonctionnalité | Où | Vu |
|---|---|---|---|
| F1 | **Catalogue d'exercices** : créer, modifier (711 lignes d'écran) | `admin-exercices.tsx` | 📖 |
| F2 | **Fusionner deux exercices** en double | `admin-fusion.tsx` | 📖 |
| F3 | **Modes de cuisson** : gérer la table (plancha, vapeur…) | `admin-cuissons.tsx` | 📖 |
| F4 | **Inviter** quelqu'un, révoquer une invitation | `admin-utilisateurs.tsx` | 📖 |
| F5 | Activer, désactiver, supprimer un compte | `admin-utilisateurs.tsx` | 📖 |
| F6 | Cuissons habituelles par aliment | `/mes-cuissons` | 📖 |

---

## Ce que je n'ai jamais vu tourner

Trente-deux fonctionnalités sur cinquante-sept. Les plus lourdes :

- **toute l'administration** (F1 à F6) — dont `admin-exercices.tsx`, le deuxième
  plus gros écran du projet ;
- **le parcours d'invitation** (A2), qui est pourtant la porte d'entrée du produit ;
- **« J'ai cuisiné »** (C16), qui est le geste qui relie les repas au frigo ;
- **l'écran Objectifs** (C2), où se règlent les cibles ;
- **le disque RM** (D7) et l'historique (D13) ;
- **les compléments** (C11) et la liste de courses (C13).

## Ordre suggéré pour ton tournage

Un parcours qui raconte une semaine, plutôt qu'une visite d'écrans :

1. **On arrive** — invitation, création du compte (A2), objectifs (C2)
2. **On remplit le frigo** — ajouter des aliments (B5), poser les quantités (B6)
3. **On planifie** — cibles (C1), composer (C4), ajuster (C6), cuissons (C8),
   compléments (C11), courses (C13), batch cooking (C12), enregistrer (C14)
4. **On cuisine** — « J'ai cuisiné » (C16), et le frigo qui baisse
5. **On fait ses courses, on range** — inventaire en écarts (B7 à B9)
6. **On s'entraîne** — modèle (E2), séance depuis un modèle (D11), saisie,
   modes (D3), minuteur (D6), disque RM (D7), 1RM et progression (D4)
7. **On administre** — catalogue d'exercices (F1), invitations (F4)

Les points ✅ « non exercé » valent le détour : ils sont à l'écran dans ma vidéo,
mais on ne les voit jamais fonctionner.
