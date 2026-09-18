# fitcarnet — tout ce que l'application sait faire

Inventaire établi le 14 septembre 2026 par exploration systématique du code.

**Les compteurs ci-dessous ont été re-mesurés le 17 septembre 2026** :
**16 écrans** (hors les deux `_layout`), **38 composants** (`.tsx` hors tests),
**9 contrôleurs**, 17 ressources API (15 entités et 2 DTO), 13 services,
**7 processeurs**, 2 commandes, **18 modules de calcul** et leurs tests
(`contenuCompte.ts`, le dix-huitième, date du 17 septembre).
*(La version du 14 annonçait 40 composants, 8 contrôleurs, 6 processeurs et
9 modules de calcul : le découpage du lot 6 est passé par là.)*

> **⚠ LES `fichier:ligne` DE CE DOCUMENT SONT PÉRIMÉS** (relevé le 16 septembre
> 2026). Il a été écrit le 14 septembre, avant le découpage du lot 6 : `repas.tsx`
> est passé de 2 316 à 655 lignes, `composer.ts` de 817 à 135, `cuisson.ts` à 22,
> et `front/src/api/hooks.ts` a été éclaté en dix modules. Les capacités décrites
> restent justes ; **leurs adresses ne le sont plus**. Les adresses à jour sont
> dans les fiches `.claude/skills/fonctionnalite-*/SKILL.md`, vérifiées une par
> une — ce document reste utile comme inventaire, pas comme index.
>
> **Exception, le 17 septembre 2026** : les renvois vers les fichiers touchés ce
> jour-là — `Aliment.php`, `Exercice.php`, `FrigoController.php`,
> `ComptesController.php`, `ProtectionDuCompte.php`,
> `AlimentSuppressionProcessor.php`, `editeurAliment.tsx`,
> `admin-utilisateurs.tsx`, `nutrition.ts`, `plausibilite.ts`, `planCoach.ts`,
> `solveur.ts` — ont été rouverts et recalés un par un. Les autres restent
> périmés.

**Comment lire.** Chaque ligne est une capacité vérifiée dans le code, avec son
emplacement. Les mentions *(à confirmer)* signalent ce qui n'a pas pu être
établi avec certitude. Les encadrés **⚠** signalent ce qu'il ne faut pas
démontrer devant un client.

---

# A · Compte, accès et session

## Entrer dans l'application

- **Connexion par adresse et mot de passe** — bouton désactivé tant qu'un champ est vide, libellé « Connexion… » pendant l'attente, message du serveur affiché tel quel. `connexion.tsx:38`
- **Aucune inscription libre** — « Les comptes sont créés par l'administrateur ». `connexion.tsx:67`
- **Aiguillage au lancement** — lecture du jeton dans le coffre, puis séances ou connexion. `index.tsx:9`
- **Portier d'accès sur toutes les routes** — taper `/frigo` à la main sur le web renvoie à la connexion. `_layout.tsx:63`
- **« Je ne sais pas encore » n'est pas un refus** — le temps de lire le coffre, personne n'est déconnecté. `_layout.tsx:60`
- **Écran blanc plutôt qu'écran fantôme** — rien n'est rendu tant que polices, jeton et décision d'accès ne sont pas prêts. `_layout.tsx:99`

## Rejoindre par invitation

- **Créer un lien d'invitation à partir d'une adresse** — aucun courriel envoyé, c'est un choix : pas de SMTP, pas de panne muette. `InvitationsController.php:138`
- **Le lien n'existe qu'une fois** — le serveur n'en garde qu'une empreinte SHA-256 ; il reste affiché tant qu'on ne quitte pas l'écran. `Invitation.php:38`
- **Partager ou copier le lien** — feuille de partage système sur mobile, presse-papiers sur le web, bouton qui passe à « Envoyé ✓ ». `admin-utilisateurs.tsx:69`
- **Vérification du lien avant le formulaire** — on n'invite pas quelqu'un à choisir un mot de passe pour lui apprendre ensuite que le lien est mort. `invitation/[jeton].tsx:45`
- **Lien inconnu, déjà utilisé ou périmé : le même message** — aucune fuite d'information. `InvitationsController.php:237`
- **L'adresse est affichée, jamais saisie** — elle vient de l'invitation, le serveur ignore ce que le formulaire enverrait. `invitation/[jeton].tsx:96`
- **Mot de passe : 12 caractères minimum, une minuscule, une majuscule, un chiffre et un caractère spécial**, comptés en caractères et non en octets. Durci le 18 septembre 2026 — c'était 10 sans exigence de composition. La règle a **un seul endroit** où elle vit, `api/regles/motdepasse.json`, que les deux suites de tests lisent. `api/src/Service/MotDePasse.php`, `front/src/calcul/motDePasse.ts`
- **Une jauge nomme ce qui manque pendant la frappe**, et ne peut pas encourager un mot de passe que le serveur refusera — un test partagé l'interdit. `front/src/composants/jaugeMotDePasse.tsx`
- **Alerte de divergence différée** — « Les deux ne sont pas identiques » n'apparaît qu'une fois la confirmation commencée. `invitation/[jeton].tsx:80`
- **Pas de connexion automatique après création** — le mot de passe doit être tapé une première fois. `invitation/[jeton].tsx:63`
- **Validité de 7 jours**, annoncée en clair dans la liste des invitations. `Invitation.php:217`
- **Remplacer une invitation en attente** — l'ancien lien meurt à l'instant où le nouveau naît, dans une transaction. `InvitationsController.php:163`
- **Révoquer une invitation** — « Le lien cesse de fonctionner immédiatement, même s'il a déjà été transmis. » `admin-utilisateurs.tsx:277`
- **Refus d'inviter une adresse qui a déjà un compte** — sinon le lien échouerait après avoir été transmis. `InvitationsController.php:151`
- **Refus des domaines impossibles** — sans point, ou réservés RFC 2606/6761 (`.test`, `.example`, `.invalid`, `.localhost`, `.local`). `Invitation.php:109`
- **Double acceptation concurrente impossible** — garde `accepte_le IS NULL` dans la transaction de création. `Invitation.php:211`

## Tenir la session

- **JWT d'une heure** — volontairement court, car non révocable. `lexik_jwt_authentication.yaml:9`
- **Jeton de rafraîchissement d'un an**, révocable, repoussé à chaque usage, stocké **en SHA-256 seulement**. `JetonsRafraichissement.php:27`
- **Le jeton voyage dans le corps, jamais dans l'URL** — les URL finissent dans les journaux. `SessionController.php:44`
- **Purge des jetons expirés** au passage d'un rafraîchissement, sans tâche planifiée. `JetonsRafraichissement.php:108`
- **Déconnexion côté serveur** — répond 204 même sur un jeton inconnu. `SessionController.php:92`
- **Fin de session propre** — cache mémoire **et** cache disque vidés, sinon les données du compte précédent réapparaîtraient. `_layout.tsx:80`
- **Limitation des tentatives** — 5 par quart d'heure par couple adresse+IP, plus un compteur global par IP cinq fois plus large qui attrape le balayage multi-comptes. `security.yaml:39`
- **Un compte désactivé est bloqué à la requête suivante**, pas à l'expiration de son JWT — et le refus intervient avant le calcul de hachage, sans différence de temps observable. `CompteActif.php:178`
- **Refus de prolonger la session d'un compte désactivé**, avec le même message qu'un jeton inconnu. `SessionController.php:69`

## Son compte

- **Voir son nom, son adresse, l'origine de ses ingrédients.** `compte.tsx:30`
- **Écran en erreur plutôt qu'écran faux** — une panne réseau affichait un nom remplacé par un tiret et une information inventée. `compte.tsx:17`
- **Changer son mot de passe ou son adresse** — le mot de passe actuel est exigé ; l'administrateur en est dispensé sur autrui, jamais sur lui-même. `UtilisateurProcessor.php:229`
- **Toutes les sessions sont révoquées au changement de mot de passe**, y compris la session courante. `UtilisateurProcessor.php:245`
- **Choisir sa sonnerie de fin de repos** parmi cinq, chacune jouée au toucher ; réglage propre à l'appareil. `reglages.tsx:29`
- **Savoir si le serveur répond** — `/api/etat` public, sans version ni nom de serveur ni état de la base. `EtatController.php:259`

---

# B · Le frigo

## Voir son stock

- **Deux sources, un seul geste** — la base pour les comptes ordinaires, Grocy pour l'administrateur ; seule la source décide de l'API appelée. `Frigo.php:25`
- **Groupement par emplacement dans l'ordre d'un inventaire réel** — Frigo, Congélateur, Placard, puis le reste ; on descend du frais au sec. `calcul/frigo.ts:12`
- **Compteur d'en-tête** — « 12 en stock sur 40 », suivi de « · depuis Grocy » le cas échéant. `frigo.tsx:222`
- **Recherche par aliment ou par emplacement**, insensible aux accents et à la casse — « congelateur » doit trouver le congélateur. `calcul/frigo.ts:46`
- **Macros pour 100 g sur chaque ligne**, stock coloré selon qu'il reste quelque chose. `frigo.tsx:644`
- **Conversion affichée** — « soit 1 250 g » pour une unité autre que le gramme. `frigo.tsx:658`
- **Mention « poids cru » ou « poids sec »** quand le rendement de cuisson n'est pas 1. `frigo.tsx:658`
- **Détail dépliable** — macros, fibres si connues, « À la cuisson : 100 g → 230 g » ou « poids inchangé ». `frigo.tsx:669`
- **Contrôle de cohérence permanent** — message en couleur vive quand les macros ne peuvent pas être vraies. `frigo.tsx:635`
- **Tirer pour rafraîchir**, états vides contextuels selon qu'une recherche est en cours. `frigo.tsx:355`

## Ajouter et corriger un aliment

- **« Ajouter un aliment » ouvre l'éditeur vide** — formulaire complet, aucune valeur pré-remplie : on saisit celles de l'étiquette. `frigo.tsx:259`
- **Création en deux temps** — l'aliment, puis sa quantité (même à zéro : c'est cet appel qui le rattache à un emplacement). Si le second échoue, on le dit sans perdre le premier. `frigo.tsx:247`
- **Le stock ne s'écrit que par `/api/mon-frigo`** — `/api/stocks` n'expose plus que ses lectures depuis le 17 septembre 2026 : ses écritures contournaient les contrôles de `FrigoBase` (propriété, emplacement, source du frigo). Un emplacement inconnu est refusé en 422. `Stock.php:29`, `FrigoController.php:158`
- **Un aliment appartient à son compte** — le propriétaire vient du jeton, jamais du corps, et chacun ne voit que les siens. Sur des valeurs nutritionnelles, l'erreur de l'un ne doit pas fausser la diète des autres. `AlimentProcessor.php:38`
- **Catégorie en puces colorées** parmi huit, avec un exemple sous la rangée. `editeurAliment.tsx:291`
- **Fibres facultatives** — vide veut dire « non renseigné », pas zéro. `editeurAliment.tsx:207`
- **Les quatre macros sont obligatoires, et un zéro se dit** — champs vides à la création, texte indicatif « à saisir » (c'était « 0 » jusqu'au 17 septembre 2026), bouton éteint avec « Renseigne les quatre valeurs — écris 0 si l'aliment n'en contient pas. » ; l'API refuse aussi une macro absente, en 422. `editeurAliment.tsx:85`, `Aliment.php:107`
- **Détection des kilojoules** — bandeau et bouton « Convertir : 1473 kJ = 352 kcal », déclenché par le facteur 4,184 ou par le plafond de 900 kcal/100 g. `editeurAliment.tsx:361`
- **Vérificateur de cohérence en direct** — vert, jaune, rouge, gris ; l'enregistrement est **bloqué** sur « incohérent ». `editeurAliment.tsx:236`
- **Rendement de cuisson** — choix parmi des guides, ou **« Je préfère mesurer »** : poids avant, poids après, et « Utiliser ce résultat (2,3) » ou « Ces deux poids sont inversés : ce produit ne peut pas varier ainsi » quand la mesure contredit la catégorie. `editeurAliment.tsx:428`
- **Provenance du ratio affichée** — « ✓ mesuré par toi » ou « Valeur courante — mesure-la pour un chiffre propre à ton produit ». `AlimentDisponible.php:103`
- **Le texte saisi vit à part du nombre** — on peut taper « 0,8 » sans que le séparateur disparaisse. `editeurAliment.tsx:145`
- **Corriger un aliment, mais seulement le sien** — son propriétaire, et lui seul. `Aliment.php:53`
- **Supprimer un aliment, mais seulement le sien.** `Aliment.php:60`
- **Refus de supprimer un aliment encore en stock** — comptage en SQL direct, hors du filtre de propriété — depuis la migration 35, seul le stock du propriétaire peut viser l'aliment —, 409 nommant le nombre de lignes. Les lignes à zéro sont supprimées silencieusement. `AlimentSuppressionProcessor.php:43`
- **Doublon de nom rendu lisible** — un nom par compte, casse ignorée : l'unicité vit dans un index fonctionnel que Doctrine ne sait pas pré-vérifier ; l'exception devient un 422 avec le nom en clair. `AlimentProcessor.php:39`
- **Recherche et filtres sur ses aliments** — nom (partiel), catégorie, code-barres, tri par nom, 200 par page. `Aliment.php:70`

## Le frigo Grocy

- **Lecture en 5 appels séquentiels** — le parallélisme a été mesuré et abandonné : 6,25 s → 29 s, et saturation des 8 fils. `FrigoGrocy.php:71`
- **Champs personnalisés lus en une fois** et non produit par produit — 62 appels ramenés à 1. `FrigoGrocy.php:559`
- **Un produit sans valeurs nutritionnelles est écarté silencieusement** et journalisé (nombre + 5 exemples). `FrigoGrocy.php:138`
- **Signalement des produits incomplets** — `manquants` (bloquants) et `souhaites` (les fibres : utilisable, mais fausse une cible en glucides totaux). `FrigoGrocy.php:197`
- **Créer un produit dans Grocy depuis l'application** — création et écriture des valeurs **dans le même appel**, sinon un produit nu resterait invisible au calculateur. `FrigoGrocy.php:252`
- **Détection de doublon par nom « repéré »** — minuscules, sans accents, non-alphanumériques réduits. `FrigoGrocy.php:318`
- **Création des 10 champs personnalisés manquants avant d'écrire** — Grocy refuse le lot entier si une seule clé lui est inconnue. `FrigoGrocy.php:337`
- **Marquage `source_valeurs = 'moi'`** — protège la saisie des réimports. `FrigoGrocy.php:389`
- **Survie à une panne de Grocy** — liste vide et message explicatif, jamais un 500. `FrigoController.php:72`
- **Le texte réel de Grocy en cas d'échec** — lecture du corps de la réponse (clé `error_message` que Symfony ne cherche pas), tronqué à 200 caractères. `FrigoGrocy.php:479`
- **Produits sans poids connu signalés** — « Les macros sont données pour 100 g : le calculateur les écarte. » `frigo.tsx:141`
- **Sur Grocy, la suppression est refusée et le nom non modifiable** — « un produit Grocy se supprime dans Grocy ». `frigo.tsx:702`

---

# C · L'inventaire

- **Saisie en écarts, pas en ressaisie** — on ne corrige que ce qui a bougé. `frigo.tsx:730`
- **Une saisie vide n'est pas un zéro** — elle veut dire « pas encore compté ». Confondre les deux viderait le frigo de tout ce qu'on n'a pas eu le temps de peser. `calcul/frigo.ts:76`
- **Seuil de 0,001** — en deçà, la différence vient de l'arrondi d'affichage, pas de la balance. `calcul/frigo.ts:66`
- **Case « vérifié » par ligne** — purement visuelle, jamais transmise. `frigo.tsx:730`
- **Écart signalé** — bordure vive et « était 1 250 g » sous le nom. `frigo.tsx:749`
- **Les écarts se calculent sur tout le frigo**, pas seulement sur ce que la recherche laisse voir. `frigo.tsx:111`
- **Saisie conservée d'une visite à l'autre** — revenir sur l'onglet ne rappelle plus le stock initial par-dessus un inventaire en cours. `frigo.tsx:173`
- **Bouton à libellé variable** — « Aucun écart à envoyer » / « Enregistrer 3 corrections » / « Envoi… » / « Inventaire en cours… ». `frigo.tsx:423`
- **Réinitialiser** — repart du stock connu et décoche tout. `frigo.tsx:416`

## Le dépôt et le traitement différé

- **Le dépôt répond 202 immédiatement** — la requête HTTP ne touche plus à Grocy. Le 14 août 2026, PHP s'est arrêté à 30 s au milieu de 40 lignes pendant que Grocy continuait d'appliquer. `FrigoController.php:339`
- **Plafond de 500 lignes**, refus des références étrangères à la source, refus des quantités négatives. `FrigoController.php:368`
- **Dédoublonnage par référence** — deux corrections sur le même produit : la seconde annoncerait la quantité que la première vient de poser, et Grocy la refuserait. `FrigoController.php:376`
- **Contrôle de propriété au dépôt**, sans nommer la ligne fautive — un refus rendu une heure plus tard n'a plus personne devant l'écran. `FrigoController.php:401`
- **Un seul inventaire à la fois par compte** — l'index unique partiel tranche, l'exception devient un 409. `InventaireLots.php:86`
- **Suivi consultable après coup** — statut, traités, échecs, date de fin ; date formatée en ISO 8601 UTC par PostgreSQL, parce que le format natif est refusé par Safari. `InventaireLots.php:216`
- **Sondage toutes les 2 secondes** tant que le lot tourne, y compris fenêtre non focalisée ; le frigo n'est relu qu'une fois, au passage à « terminé ». `api/hooks.ts:460`
- **Bannière « Tu peux quitter l'écran, ça continue tout seul »**, avec le compteur venu du serveur. `frigo.tsx:118`
- **Résultat affiché pendant 15 minutes** — « Inventaire appliqué : 12 corrections » ou « 2 refusées — motif · motif ». `frigo.tsx:127`
- **Prise de lot exclusive** — `SELECT … FOR UPDATE SKIP LOCKED` : deux travailleurs ne se disputent jamais le même lot. `InventaireLots.php:107`
- **Reprise exacte** — le compteur est incrémenté après **chaque ligne**, la reprise repart de là. `AppliqueInventaire.php:77`
- **Détection d'un lot abandonné par le silence, pas par l'ancienneté** — plus de 2 minutes sans signe de vie. La pire conséquence d'un délai trop court est de rejouer des lignes, et poser une quantité absolue est idempotent. `InventaireLots.php:202`
- **Une ligne à la fois vers Grocy** — 5 ouvriers PHP et une base SQLite qui n'accepte qu'un écrivain. La signature `inventorierUn(int, float)` rend le lot groupé impossible à réécrire. `AppliqueInventaire.php:27`
- **« Déjà à jour » n'est pas un échec** — détecté au texte de Grocy, rendu `null`, pour ne pas pousser à renvoyer l'inventaire. `FrigoGrocy.php:488`
- **Échecs nommés ligne par ligne**, le lot continue ; une panne globale donne **un seul** motif plutôt que 40 lignes rouges. `InventaireLots.php:152`
- **Survie à un compte supprimé** entre le dépôt et le traitement. `AppliqueInventaire.php:63`
- **Survie à un EntityManager fermé** — rouvert avec une trace, sinon un processus vivant des semaines devient un zombie. `AppliqueInventaire.php:45`
- **Pas de fuite mémoire** — Doctrine est vidé entre deux lots. `AppliqueInventaire.php:111`
- **Survie à une base injoignable** — reconnexion forcée au tour suivant ; en mode ponctuel, sortie en échec pour que la tâche planifiée ne passe pas pour réussie. `TraiterInventaires.php:284`
- **Survie à un lot qui explose** — le lot n'est pas marqué échoué (la cause peut être passagère), il repart dans 2 minutes. Évite la boucle de redémarrage Docker. `TraiterInventaires.php:317`
- **Deux modes de travailleur** — une passe puis sortie (planificateur), ou `--boucle` en continu, scrutation toutes les 2 secondes. `TraiterInventaires.php:230`

---

# D · Les repas

## Les objectifs

- **Une cible par repas, pas un total journalier** — Matin, Midi, 16 h, Soir. `objectifs.tsx:10`
- **Les calories se recalculent automatiquement** dès qu'une macro change (4/4/9). `objectifs.tsx:64`
- **Alerte d'incohérence au-delà de 15 kcal** — « Tes grammes représentent 612 calories, pas 580. L'app respecte les grammes ; les calories suivent. » `objectifs.tsx:79`
- **Case « Glucides fibres comprises »** — le texte d'aide change selon l'état, convention nord-américaine ou française. `objectifs.tsx:150`
- **Convertisseur de plan américain** — protéines, glucides totaux, lipides, fibres, calories ; aperçu « Sera enregistré : … » avant report. `objectifs.tsx:166`
- **Avertissement « ton plan sous-estime ses fibres »** — la règle est un ordre de grandeur (moins d'un dixième des glucides), éprouvée sur un plan réel où trois repas sur quatre étaient signalés à juste titre. `planCoach.ts:78`
- **Jamais de glucide négatif** à la conversion — on préfère ne rien retrancher. `planCoach.ts:86`
- **Récapitulatif des quatre repas** — « 40 P · 60 G · 15 L » ou « à définir ». `objectifs.tsx:269`
- **Compléments alimentaires par moment de repas** — une consigne, pas un journal de prises ; volontairement hors du solveur. Ce qui se mange va au frigo, ce qui s'avale vient ici. `Complement.php:43`
- **Doublon et quantité invalide annoncés avant l'envoi.** `complements.tsx:163`

## Le calculateur — paramétrage

- **Trois étapes nommées** : Jours · Repas · Cuisiner, avec retour possible en arrière seulement. `etapes.tsx:29`
- **Revenir à « Jours » efface le plan** — les quantités ne voudraient plus rien dire. `repas.tsx:1360`
- **Un ou plusieurs jours** — calendrier mensuel, passé non sélectionnable, navigation par mois. `calendrier.tsx:100`
- **« Tous ces jours puisent dans le MÊME frigo : le premier se sert d'abord, le dernier prend ce qui reste. »** `repas.tsx:940`
- **Nombre de convives par repas**, de 1 à 12. `repas.tsx:1132`
- **« Recopier ce jour sur les n autres »** — cases cochées et convives dupliqués. `repas.tsx:1171`
- **Cases pré-cochées dès qu'un objectif existe** pour ce repas. `repas.tsx:347`
- **Le stock déjà promis à un plan prévu est retiré du disponible** — deux batch cooking d'affilée ne comptent plus deux fois les mêmes 800 g de poulet. `repas.tsx:385`
- **Frigo inutilisable : on dit quoi faire et on y emmène** — « Rien d'utilisable dans ton frigo » + bouton « Ouvrir mon frigo → ». `repas.tsx:1240`
- **Anomalies des données listées** — jusqu'à 6 messages, fond rouge si bloquant. `repas.tsx:1260`
- **Alerte fibres inconnues** — seulement si une cible est en glucides totaux ; explique l'écart de 17 % sur un pain complet. `repas.tsx:428`

## Le calculateur — la composition

- **Sept rôles** : Protéine, Laitage, Glucide, Fruit, Oléagineux, Huile, Légume — déduits de la catégorie, seule règle automatique. `composer.ts:34`
- **Un modèle de repas par moment** — le matin impose un fruit, la collation prend un laitage comme source protéique, midi et soir imposent huile et légume. `composer.ts:123`
- **On ne signale que ce qui manque vraiment** — plus de « Aucune huile utilisable » au petit-déjeuner. `composer.ts:173`
- **Choix déterministe** — un aliment préféré passe devant, puis ce qui n'a pas encore servi aujourd'hui, puis l'ordre du stock. Un tri instable ferait croire à un bug. `composer.ts:224`
- **Système 3×3 résolu exactement** — élimination de Gauss avec pivot partiel, aucune itération, aucune convergence à espérer. `algebre.ts:13`
- **Moins de trois variables : on résout le sous-système** — trois macros justes, ou deux et une qui dérive, ou une seule, et on le dit. `solveur.ts:167`
- **Arrondi avant le calcul des macros, jamais après** — ce qui est affiché est ce qui sera pesé. `solveur.ts:259`
- **Jamais de quantité négative** — la variable est fixée à zéro et le reste est résolu à nouveau, jusqu'à 3 passes, avec double écrêtage. `solveur.ts:210`
- **Repli lipides** — sans oléagineux, l'huile prend le rôle et cesse d'être une quantité fixe. `composer.ts:236`
- **Ajustement au stock en 12 tours** — les quantités imposées passent devant les variables, avec une marge d'un demi-gramme avant de déclarer un dépassement. `composer.ts:393`
- **Relais par rôle** — seul un aliment du même rôle prend la suite ; exception unique, huile et oléagineux se suppléent. `composer.ts:311`
- **Recherche d'une meilleure combinaison** — deux échanges seulement : l'huile à la place de l'oléagineux, et la protéine remplacée par les trois plus maigres du stock. Au-delà, on ne rabote que des dixièmes de gramme. `composer.ts:487`
- **Ne fait jamais pire** — un échange n'est retenu que si la pénalité baisse strictement. `composer.ts:544`
- **Un échange annoncé a vraiment eu lieu** — annoncer qu'un aliment a été remplacé alors qu'il est toujours au menu est un mensonge d'affichage. `composer.ts:546`
- **Verrous** — un rôle choisi par l'utilisateur n'est jamais remplacé dans son dos. `composer.ts:1766`
- **Une période partage un seul frigo**, résolue dans l'ordre du temps : mieux vaut savoir dès le lundi que le jeudi ne passera pas. `composer.ts:672`
- **Le jour est un rang, pas une date** — aucun fuseau, aucun calendrier. `composer.ts:687`

## Le calculateur — corriger le plan

- **Tableau à quatre colonnes** : aliment · à peser · servi · 1 personne, avec la consigne « On pèse AVANT cuisson ». `repas.tsx:2054`
- **Macros par personne, chaque macro colorée indépendamment** — tolérance kcal 45, prot 1,5, gluc 2,5, lip 1,2. `repas.tsx:2000`
- **Ligne « dont X g de fibres »** — « comprises dans la cible » ou « soit Y kcal hors cible ». `repas.tsx:2027`
- **Remplacer un aliment par rôle** — le remplaçant est **verrouillé**, le calculateur ne le changera plus. `repas.tsx:2120`
- **Déclarer un « reste »** — c'est un **plafond**, pas une quantité imposée ; le calcul en sert ce qu'il faut, pas plus. Bascule cru/cuit. `repas.tsx:143`
- **Mettre 0 retire l'aliment** du repas. `repas.tsx:143`
- **Ajouter un aliment hors proposition** — le repas se recalcule autour. `repas.tsx:2239`
- **« Quantité illisible — cet aliment compte pour 0 g »** sur une saisie erronée. `repas.tsx:2218`
- **Renforts affichés sous la ligne qu'ils complètent** — étiquetés « Complément » ou « À la place », liseré vert. `repas.tsx:2069`
- **Relais modifiable** — « X : 200 g, c'est tout ce que tu as. Le reste est porté par Y. **Changer** ». `repas.tsx:2152`
- **Échange automatique expliqué** — « X ne permettait pas de tenir les objectifs : remplacé par Y. Tu peux revenir dessus. » `repas.tsx:2175`
- **Conseil chiffré de correction** — un seul aliment, un seul nombre, un seul geste : « retire 40 g de riz ». Et si retirer tout ne suffit pas, on le dit. `solveur.ts:319`

## Le calculateur — les cuissons

- **Trois états, et la différence entre les deux derniers compte** : cuit ainsi, se mange tel quel, ou personne n'a décidé. « Je n'en mets pas » n'est pas « je n'ai pas répondu ». `cuisson.ts:38`
- **Compteur « n aliments dont on ne sait pas comment ils se cuisent »** et bouton « Les n autres se mangent tels quels », qui ne touche pas aux choix déjà faits. `repas.tsx:1597`
- **Les cuissons sont mémorisées** d'une fois sur l'autre et pré-remplies, avec la mention « ce que tu fais d'habitude » dans le sélecteur. `repas.tsx:1791`
- **Deux couches** — habitudes en dessous, choix explicites au-dessus, indéracinables. `repas.tsx:517`
- **Seules les nouveautés sont écrites** — une semaine sans changement ne provoque aucune écriture. `cuisson.ts:581`
- **La dernière décision gagne** — un riz mis au four lundi puis remis à l'eau jeudi enregistre « eau ». `cuisson.ts:581`
- **Clé d'habitude normalisée par une table manuelle de 25 lettres** — Hermes n'implémente pas toujours `normalize('NFD')`. **Seule fonction à normaliser dans tout le projet.** `cuisson.ts:481`
- **Vocabulaire partagé, administré** — une liste ouverte donnerait « four », « Four », « au four », « four 180 ». `ModeCuisson.php:51`

## Le batch cooking

- **Fournées groupées par façon de cuire** — « Four 180 » et « Four 200 » sont deux lignes, donc deux fournées. `cuisson.ts:134`
- **Les quantités s'additionnent sur toute la période** — une seule ligne par aliment. `cuisson.ts:134`
- **« On pèse sec »** — la cuisson n'ajoute que de l'eau, et l'eau absorbée varie ; sec, le chiffre est toujours le même. `repas.tsx:1396`
- **Répartition en boîtes, une par repas** — poids **en cuit** : annoncer le poids sec devant des boîtes ferait servir trois fois trop. `cuisson.ts:233`
- **Deux colonnes, boîte et une personne** — une boîte pour trois contient trois portions, mais ses macros ne valent que pour une. `cuisson.ts:104`
- **« À ajouter au moment de manger »** — ce qui ne se met pas en boîte cinq jours à l'avance. `repas.tsx:1479`
- **Liste de courses** — la période est résolue **deux fois**, une fois bridée par le frigo et une fois frigo plein, et la liste est la différence. Le solveur ne subit pas une pénurie, il la contourne : compter les manques du premier calcul répondrait « rien ». `composer.ts:800`
- **Les restes déclarés sont ignorés dans la passe « frigo plein »** — sinon déclarer « il me reste 80 g de riz » faisait sous-acheter jusqu'à 542 g. `composer.ts:800`
- **Seuil de 5 g** — un gramme manquant n'est pas une course. `composer.ts:821`

## Les plans enregistrés

- **Enregistrer un plan sous un nom libre.** `repas.tsx:1510`
- **Un instantané, pas une recette** — des noms et des grammes, jamais d'identifiants (sauf ce qui sera décrémenté), et la date de chaque boîte résolue au moment où on fige. `cuisson.ts:336`
- **Pas de modification possible, volontairement** — un instantané ne se modifie pas, on en refait un. `PlanRepas.php:50`
- **Rien n'est recalculé à la relecture** — « c'est ce que tu as cuisiné, pas ce que ton frigo permettrait aujourd'hui ». `repas.tsx:694`
- **État en toutes lettres** — « Prévu. Les ingrédients sont mis de côté » / « Cuisiné le mercredi 13/08 · ton frigo a été décrémenté ». `repas.tsx:709`
- **Badge par plan dans la liste** — « · à cuisiner » ou « · ne réserve rien » pour les plans d'avant la réservation. `repas.tsx:1002`
- **Seuls les plans prévus réservent du stock** — le défaut va vers « prévu », et c'est le bon sens du risque. `cuisson.ts:411`
- **Après enregistrement, tout repart de zéro** et la liste s'ouvre, comme preuve. `repas.tsx:601`
- **Date illisible : rien plutôt qu'« Invalid Date ».** `repas.tsx:573`

## « J'ai cuisiné »

- **Marquer le plan et décrémenter le frigo en un seul appel.** `PlansController.php:79`
- **Le plan est marqué avant de toucher au stock** — l'ordre inverse laisserait, en cas de panne, un stock baissé pour un plan qui réserve encore. Dans ce sens-ci on surestime son frigo, ce qu'on voit en l'ouvrant. `PlansController.php:148`
- **Refus du double appui** — 409. `PlansController.php:88`
- **Refus de deviner pour un plan d'ancienne version** — 422 avec explication, plutôt qu'une déduction devinée sur les noms. `PlansController.php:94`
- **Déduction en poids pesé, avant cuisson** — l'eau que la cuisson ajoute n'a jamais été dans le bac ; prendre l'assiette ferait déduire trois fois trop de riz. `cuisson.ts:390`
- **Plancher à zéro, et refus d'inventer** — un aliment absent du frigo est nommé « plus dans ton frigo », un poids par unité inconnu est nommé aussi. `DeductionDuPlan.php:346`
- **Aucun rollback global** — neuf déductions réussies ne sont pas annulées par la dixième. `PlansController.php:193`
- **« À retirer toi-même du frigo »** — la liste de rattrapage, avec le motif ligne par ligne. `repas.tsx:732`

---

# E · Les séances

- **Liste avec type, date en français, pastille de couleur et avancement** — « 4/12 séries », vert quand tout est fait. `seances.tsx:50`
- **Créer une séance, ou partir d'un modèle** — le bouton n'apparaît que sur une séance vide quand un modèle existe ; il copie exercices et séries cibles et adopte le type. `seance/[id].tsx:194`
- **Le type filtre le catalogue proposé** — un exercice sans groupe reste proposé partout. `seance/[id].tsx:76`
- **Sauvegarde automatique 2,5 s après la dernière modification**, envoi forcé quand l'application passe en arrière-plan ou quand on quitte l'écran. `sauvegardeAuto.ts:22`
- **Cinq états de sauvegarde lisibles**, plus le motif de l'échec et un bouton « Réessayer l'enregistrement ». `sauvegardeAuto.ts:118`
- **Pas de navigation après la première sauvegarde** — seul l'identifiant est greffé, pour ne pas jeter ce qui a été tapé pendant l'attente. `seance/[id].tsx:29`
- **Pré-remplissage par la dernière fois** — charges et répétitions réellement faites, à défaut le format prescrit, à défaut 3 séries. `seance/[id].tsx:168`
- **Raccourci « ↓ 12×25 · 12×27,5 »** — recharge les valeurs de la dernière séance en objectifs. `exerciceSeance.tsx:100`
- **Trois modes par exercice** — Charge, Tenue, Chrono ; changer de mode n'interrompt pas une mesure en cours. `exerciceSeance.tsx:14`
- **Cocher une série remplit les champs vides avec l'objectif**, puis relance le repos. `serie.tsx:40`
- **Réordonner les exercices** — poignée à glisser ou flèches, sur mobile comme sur le web. `listeDeplacable.tsx:36`
- **Notes par exercice**, repliables, avec aperçu quand elles sont remplies. `exerciceSeance.tsx:262`
- **Bilan par exercice** — répétitions, kilos soulevés, temps. `exerciceSeance.tsx:230`
- **Transformer une séance en modèle.** `seance/[id].tsx:312`
- **Suppression confirmée en nommant** le type, la date et le nombre de séries. `seance/[id].tsx:338`

## Le 1RM et la progression

- **Formule d'Epley** — `poids × (1 + 0,0333 × reps)`. `performance.ts:22`
- **Plafond de 15 répétitions** — au-delà on mesure l'endurance, pas la force. Une série de 93 répétitions à 32 kg donnerait entre 50 et 131 kg selon la formule, soit davantage qu'une série de 7 à 35 kg. `performance.ts:12`
- **Une répétition unique est prise telle quelle** — le maximum *est* la charge soulevée, et Epley y ajouterait 3,3 % inventés. `performance.ts:34`
- **Disque 1RM** — la couleur dit la progression, pas la charge : vert au-dessus de +3 %, jaune stable, rouge en baisse, gris sans comparaison. `disqueRM.tsx:9`
- **Écart affiché** — « ▲ +2,5 kg », « = stable », « 1re fois ». `disqueRM.tsx:84`
- **Courbe de progression** — 1RM en mode Charge, volume dans les autres modes, à partir de 2 séances, avec « +7,5 kg sur 6 séances ». `sparkline.tsx:13`
- **Avertissement séries longues** — « n séries de plus de 15 répétitions : comptées dans le volume, mais écartées du 1RM ». `exerciceSeance.tsx:253`
- **Table des paliers** — 90 % à 40 % du 1RM, charge arrondie au palier réel de la salle, zone de progression **70 à 90 %** mise en avant (corrigé le 16 septembre 2026 : ce document annonçait « 70–80 % », l'écran affiche « Zone de progression · 70 à 90 % »). `disqueRM.tsx:106`
- **Calculateur de charge** — « J'ai soulevé … kg » × « Répétitions réussies » → 1RM, arrondi réglable 1 / 2,5 / 5 kg. `calculateurRM.tsx:37`
- **Garde-fou au-delà du plafond** — « on mesure l'endurance : l'estimation perdrait son sens. Refais un essai plus lourd. » `calculateurRM.tsx:40`
- **Les deux chemins vers le 1RM s'accordent** — la carte d'exercice et le calculateur donnaient 103,3 kg contre 100 kg pour la même série. `performance.test.ts:43`
- **Records antérieurs par exercice**, strictement avant une date donnée. `historiqueSeances.ts:38`

## Le minuteur et les mesures

- **Barre fixe de repos** — 1:00, 1:30, 2:00, 3:00, durée mémorisée. `chrono.tsx:14`
- **Le repos survit au changement d'écran** — on peut aller voir le frigo sans perdre le décompte. `etatChrono.ts:3`
- **Relance automatique à chaque série cochée.** `chrono.tsx:46`
- **Reprise là où on s'est arrêté** — « Go » repart du reste figé. `etatChrono.ts:69`
- **Écran maintenu allumé** pendant le décompte, rendu dès le passage en arrière-plan. `ecranEveille.ts:25`
- **Son et vibration** en fin de repos — ils ne servent pas au même moment. `chrono.tsx:164`
- **Notification système programmée** — Android gèle les minuteurs JavaScript ; c'est le système qui sonne, application fermée. `alarmeRepos.ts:8`
- **Flux ALARME et non NOTIFICATION** — c'est ce qui la fait sonner téléphone en vibreur, et le volume suit le curseur « alarme ». `alarmeRepos.ts:128`
- **Pas de double bip** — si les minuteurs ont été gelés, c'est la notification qui a sonné et l'application ne re-sonne pas au retour. `chrono.tsx:69`
- **Avertissement si les notifications sont refusées**, avec accès direct aux paramètres du téléphone. `chrono.tsx:132`
- **Chronomètre d'effort** — tenue isométrique par série, ou temps total « for time ». `chronoSerie.tsx:24`
- **La mesure survit au démontage** — replier l'exercice ou faire défiler n'interrompt rien ; une seule mesure à la fois. `etatMesure.ts:3`
- **Bandeau « mesure en cours »** en haut de l'écran, qui porte le verrou d'écran. `bandeauMesure.tsx:21`
- **Report du temps à la bonne ligne** — appariement sur la position **et** l'exercice ; sans correspondance, on n'écrit rien plutôt que d'écraser la mauvaise ligne. `etatMesure.ts:85`

---

# F · Les programmes

- **Nom libre et type** Push / Pull / Legs, qui filtre le catalogue proposé. `modele/[id].tsx:196`
- **Séries cibles par exercice** — répétitions et charge, ajout et suppression. `modele/[id].tsx:141`
- **Réordonner** par poignée ou flèches, avec l'aide affichée dès 2 exercices. `modele/[id].tsx:217`
- **Propager l'ordre aux séances** — on compte d'abord (« n séances adopteraient cet ordre, y compris les anciennes. Seul l'affichage change : aucune série, aucune charge n'est modifiée »), puis on applique. `OrdreModeleProcessor.php:32`
- **Appariement en deux temps** — séances issues du modèle, ou du même type ; un exercice absent du modèle est repoussé à la fin dans son ordre d'origine, rien n'est perdu. `OrdreModele.php:73`
- **404 et non 403 sur un modèle qui n'est pas le sien** — ne révèle pas son existence. `OrdreModeleProcessor.php:42`
- **Suppression confirmée** — « Tes séances passées ne sont pas touchées. » `modele/[id].tsx:247`

> **Le partage d'un modèle n'existe pas, et c'est une décision** du
> 15 septembre 2026. Le champ a existé sans jamais rien faire — la règle de
> sécurité l'autorisait, le filtre Doctrine l'interdisait (constat **F-05**).
> Il a été retiré de l'entité, de la base et du front plutôt que rendu
> fonctionnel : l'ouvrir aurait déplacé l'isolation d'une extension Doctrine
> vers une expression de sécurité, le contraire de la règle 2. **Un modèle
> n'appartient qu'à son compte.**

---

# G · Le catalogue d'exercices

- **~1338 exercices**, référentiel commun. `Exercice.php:38`
- **Liste allégée, fiche détaillée à la demande** — instructions, muscles et matériel ne sont pas transportés à chaque liste. `Exercice.php:214`
- **Recherche sur le nom anglais et français**, sans accents, plus filtres par zone, équipement et source. `Exercice.php:141`
- **Sélecteur à vignettes de muscles** — quinze silhouettes dessinées, dont « Autre » pour le cardio et les exercices sans muscle renseigné ; le filtre se cumule avec la recherche. `choixMuscle.tsx:57`
- **Fiche d'exercice** — vidéo YouTube intégrée (iframe sur le web, WebView sur mobile), zone, muscle ciblé, muscles secondaires, matériel, format prescrit, exécution. `modaleExercice.tsx:199`
- **Chargement progressif de la fiche** — le nom et la zone s'affichent tout de suite, le reste arrive ensuite. `modaleExercice.tsx:126`
- **Ce qui n'est pas traduit s'affiche en anglais** — donc se voit, et se corrige. `modaleExercice.tsx:199`
- **Seul l'administrateur crée un exercice ; l'administrateur ou son auteur le corrige** — depuis le 15 septembre 2026. Ce document annonçait le 14 « tout utilisateur peut ajouter un exercice ; seul l'admin peut le corriger » : ce n'est plus vrai. Aucun écran ne crée d'exercice, et un exercice créé par l'API naît privé. `Exercice.php:79`, `:100`
- **Aucune suppression** — le schéma l'interdit, pour ne pas effacer l'historique et les 1RM. `Exercice.php:50`, `01-schema.sql:290`

---

# H · L'administration

## Les exercices

- **Compteurs d'en-tête** — « 1319/1338 renseignés · 240/1275 traduits · 180 vidéos », avec une jauge qui compte exactement la même chose que le filtre. `admin-exercices.tsx:540`
- **Six filtres** — À compléter, Sans muscle, Sans vidéo, À traduire, Les miens, Tous. `admin-exercices.tsx:84`
- **La fiche complète est chargée avant édition** — sinon on écrirait du vide par-dessus des données existantes. `admin-exercices.tsx:122`
- **Zones proposées tirées du catalogue réel**, pas d'une liste écrite à la main. `admin-exercices.tsx:489`
- **Validation du lien YouTube** — l'enregistrement est bloqué si le lien n'est pas reconnu. `admin-exercices.tsx:256`
- **Compteur de modifications** — « Enregistrer (3) », et **seuls les champs modifiés sont envoyés**. `admin-exercices.tsx:259`
- **Pas de faux changements** — `traps, trapezius` et `trapezius` cochent la même case et comptent pour « rien n'a bougé ». `admin-exercices.tsx:181`
- **Confirmation d'abandon** si une saisie est en cours. `admin-exercices.tsx:235`

## Fusionner deux exercices

- **Remplacement partout** — séances et modèles ; l'orphelin récupère ce qui n'existait que chez l'ancien ; transaction avec rollback. `FusionExerciceProcessor.php:173`
- **Correspondances probables** — jusqu'à 5 suggestions par distance de Levenshtein, avec le pourcentage affiché. `admin-fusion.tsx:11`
- **Confirmation nommant les deux exercices** — « Ton historique est conservé, mais l'opération est définitive. » `admin-fusion.tsx:159`

## Les façons de cuire

- **Avertissement partagé** — « Deux aliments partent dans la même fournée s'ils portent la même ligne d'ici. » `admin-cuissons.tsx:91`
- **Détection du doublon avant l'envoi** — « En ajouter une seconde ferait deux fournées là où il en faut une. » `admin-cuissons.tsx:70`
- **Réordonner par échange de rangs** — jamais d'incrément, qui produirait deux rangs égaux. `admin-cuissons.tsx:73`
- **Nouveau rang par pas de dix**, pour pouvoir intercaler. `admin-cuissons.tsx:63`
- **Suppression qui annonce la conséquence invisible** — « Les plans déjà enregistrés gardent le libellé, ils sont figés. En revanche, les utilisateurs qui cuisaient un aliment de cette façon devront le redire. » `admin-cuissons.tsx:209`

## Les comptes

- **Liste avec le contenu en chiffres** — neuf compteurs depuis le 17 septembre 2026 : « *n* séances · *n* séries · *n* modèles · *n* plans · *n* aliments · *n* lignes de stock · *n* objectifs · *n* compléments · *n* exercices personnels ». Les compteurs existent pour rendre la suppression décidable. `ComptesController.php:69`, `contenuCompte.ts:25`
- **Désactiver ou réactiver** — la désactivation supprime aussi les jetons de rafraîchissement, sinon un compte bloqué se prolongerait tout seul pendant des semaines. `ComptesController.php:127`
- **Refus de se bloquer soi-même** — irréversible depuis l'application. Refus, pas confirmation. `ProtectionDuCompte.php:40`
- **Refus de bloquer ou supprimer le dernier administrateur actif** — comptage des admins **actifs**, test `<= 1` pour qu'un état incohérent n'ouvre pas la porte. Un administrateur **désactivé** n'est le dernier de personne : il se supprime même s'il ne reste qu'un actif (constat 04#12, corrigé le 17 septembre 2026). `ProtectionDuCompte.php:83`
- **Suppression qui chiffre ce qui sera détruit** — les neuf compteurs, en toutes lettres : « … seront effacés définitivement ». `admin-utilisateurs.tsx:291`
- **Nettoyage ordonné avant suppression** — les lignes de stock visant ses aliments, puis ses aliments, puis le compte : la contrainte RESTRICT du stock bloquerait sinon la cascade. Ses exercices personnels sont relevés avant et retirés après (`cree_par` est en `SET NULL`), sauf celui qu'un autre compte cite encore. `ComptesController.php:221`
- **Son propre compte n'a aucun bouton.** `admin-utilisateurs.tsx:234`

---

# I · Ce que l'application garantit

Ces garanties sont **éprouvées par test de propriétés** — 250 frigos aléatoires
× 4 repas, soit environ 1 000 scénarios, plus 5 000 combinaisons sur le solveur.
`garanties.test.ts`

1. **Les nombres affichés sont les vrais** — les macros sont recomposées depuis l'affichage et doivent correspondre ; aucun message ne laisse échapper un `NaN` ou un `undefined`.
2. **Les deux pesées disent la même chose** — `assiette = aCuire × ratio`, et un aliment qui sort du four ne pèse jamais zéro.
3. **Le frigo a le dernier mot** — aucune quantité ne dépasse le stock, et tout plafonnement est annoncé.
4. **Il ne se trompe jamais en silence** — « objectifs atteints » veut dire atteints sur les trois macros ; un repas raté le dit ; un repas juste ne crie pas au loup.
5. **Deux fois la même question, deux fois la même réponse.**
6. **Ce que l'utilisateur verrouille reste verrouillé.**
7. **Chercher mieux ne fait jamais pire**, et un échange annoncé a bien eu lieu.
8. **La convention glucidique ne se retourne pas contre lui** — compter les fibres dans la cible ne fait jamais servir plus de féculents.
9. **Le repas ressemble à un repas** — plafonds par personne mesurés dans l'assiette, et cohérence à 12 % entre calories annoncées et macros.
10. **Le rendement ne change pas ce qu'il faut peser** — démontré algébriquement et vérifié sur six rendements : le poids à peser est identique à moins d'un gramme, l'assiette change du simple au double.
11. **Une assiette, une personne, ses macros** — cuisiner pour trois ne déplace pas l'assiette.
12. **Un méta-test vérifie que la batterie couvre vraiment quelque chose** — il exige plus de 100 scénarios réussis **et** plus de 100 ratés. Un jeu où tout tombe juste ne teste pas la gestion de l'échec.

## Ce que l'application refuse de faire

- **Système singulier** — « Ces aliments se ressemblent trop pour que le calcul fonctionne. Choisis-en un plus riche en protéines, un plus riche en féculents et un plus gras. » `solveur.ts:199`
- **Lipides incompressibles** — « Trop gras de X g… sans le moindre oléagineux. Choisis une viande ou un poisson plus maigre. » `solveur.ts:363`
- **Valeurs déjà cuites détectées** — bande physique du grain sec, 300 à 400 kcal/100 g, avec la correction chiffrée complète. `plausibilite.ts:244`
- **Féculent qui rétrécit** — « un féculent absorbe de l'eau, il ne peut pas peser moins cuit que sec. Ce n'est pas une cuisson inhabituelle, c'est impossible. » `plausibilite.ts:349`
- **Plus de 100 g de nutriments dans 100 g de produit.** `plausibilite.ts:215`
- **Soupçon de kilojoules** — deux détections, le plafond de 900 kcal et le rapport 4,184 aux macros. `nutrition.ts:158`
- **Apport négligeable** — « X ne pèse quasiment rien ici (1,0 g, soit 0,3 g de protéines). Retire-le, ou réduis ce que tu as déjà mis. » `solveur.ts:464`
- **Rendement à contresens** — une viande qui gagnerait du poids, un féculent qui en perdrait. `RendementPlausible.php:255`
- **Une pesée non retenue est dite explicitement** — la taire laisserait croire qu'elle a été prise en compte. `AlimentDisponible.php:118`

## Les limites, assumées et écrites

- Le solveur **ne juge pas de la pertinence culinaire** — 380 g de skyr sont mathématiquement justes.
- Les **kilocalories ne sont pas une contrainte indépendante** : elles découlent des macros. En cas de cible incohérente, l'application **respecte les grammes** et le signale.
- Les **micronutriments sont hors périmètre**.
- Les valeurs viennent de la base, **avec leur propre marge d'erreur** : viser mieux qu'un gramme par macro n'aurait pas de sens.
- Le garde-fou nutritionnel **n'est pas infaillible** : « un aliment sans macros et sous 900 kcal passera entre les mailles. C'est un garde-fou, pas une garantie. »

---

# J · Ce qui tient sans qu'on le voie

- **Cache prudent, hors ligne toléré** — les données restent affichées pendant un rechargement : une salle de sport mal couverte ne vide pas l'écran. `_layout.tsx:22`
- **Cache relu depuis le disque avant le premier rendu** — au démarrage à froid, les écrans s'affichent avec les données de la veille. `_layout.tsx:113`
- **Isolation automatique par propriétaire** — toute entité marquée voit ses requêtes restreintes ; non authentifié donne `1 = 0`. `FiltreProprietaire.php:48`
- **Chargement complet anti-N+1** — une séance et ses séries en une requête, là où il en fallait environ 200. `ChargementComplet.php:205`
- **Le propriétaire vient du jeton, jamais du corps.** `ProprietaireProcessor.php:27`
- **Documentation de l'API fermée** — `/api/docs` réservé aux administrateurs, `/api` authentifié. Les deux étaient publics. `security.yaml:119`
- **Bandeau de nouvelle version** — une seule vérification au démarrage ; rien ne s'affiche hors ligne, serveur endormi ou version à jour. `bandeauMaj.tsx:26`
- **« Chercher une mise à jour » pour tout le monde**, avec le détail technique réservé à l'administrateur. `etatMaj.tsx:125`
- **Sur le web, le panneau se tait** — « le code vient du serveur à chaque chargement, il n'y a rien à mettre à jour ici ». `etatMaj.tsx:109`

---

# K · Zones d'ombre et code suspect

Relevé pendant l'exploration, à trancher :

- ~~**`front/src/composants/inventaire.tsx` semble ne plus être utilisé**~~ —
  **réglé : le fichier n'existe plus** (vérifié le 16 septembre 2026). Ce qui suit
  décrivait l'état d'alors.
- **`front/src/composants/inventaire.tsx` semblait ne plus être utilisé** — aucun écran ne l'importe, `frigo.tsx` réimplémente le mode inventaire. Ses seules divergences visibles sont un bouton « Quitter » et un libellé « Envoyer » au lieu de « Enregistrer ». *(à confirmer)*
- **`Invitation::domaineAccepteDuCourrier()`** — vérification DNS MX puis A, documentée comme « conseille, ne bloque jamais » — **n'a aucun appelant** dans l'API. *(à confirmer)*
- **Aucun appel à OpenFoodFacts dans l'API**, alors que le champ `source` prévoit la valeur : l'import se fait ailleurs, ou pas du tout. *(à confirmer)*
- ~~**`front/src/calcul/texte.ts` n'existe pas**~~ — **il existe depuis le
  15 septembre 2026** et porte `sansAccent`, seule définition du projet (constat
  D4 clos). Ce qui suit décrivait l'état d'alors.
- **`front/src/calcul/texte.ts` n'existait pas** — `CLAUDE.md` l'annonçait comme module de référence. `sansAccent` est recopié quatre fois : `composer.ts:182`, `frigo.ts:39`, `choixAliment.tsx:49`, `admin-exercices.tsx:117`. C'est le constat **D4**, non corrigé.
- ~~**`front/src/solveur/periode.ts` n'existe pas**~~ — **il existe** : sorti du
  découpage de `composer.ts`, il porte `cleDuRepas`, `lireLaCle` et
  `listeDeCourses`. Ce qui suit décrivait l'état d'alors.
- **`front/src/solveur/periode.ts` n'existait pas** — seul son fichier de test existe, il éprouve une fonction qui vit dans `composer.ts`.
- **`ChargementComplet` signale lui-même un risque non vérifié** — le total de pagination sur collections jointes, « à vérifier sur des données réelles ».
- **`notifications.ts` et `envoiSerialise.ts`** n'ont pas été lus ligne à ligne. *(à confirmer)*
