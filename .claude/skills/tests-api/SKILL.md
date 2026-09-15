---
name: tests-api
description: Comment on teste l'API de fitcarnet — PHPUnit sans base ni noyau, services final readonly instanciés pour de vrai autour d'une Connection doublée, createStub et non createMock. À charger avant d'écrire ou de modifier un test dans api/tests/.
---

# Tester l'API de fitcarnet

`cd api && bin/phpunit` — ou `docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'`
si `vendor/` n'est pas installé côté hôte. **231 tests, 617 assertions** au
15 septembre 2026 au soir ; ce chiffre ne peut que monter.

**La suite tourne sans base de données et sans noyau Symfony, et doit le rester.**
C'est ce qui la rend exécutable partout, en une demi-seconde, sans effet de bord.

## Le TDD n'a pas d'exception ici

Le test échoue **d'abord**, et on lit son message d'échec avant d'écrire une ligne
de correctif. Si le test passe du premier coup, remettre le code fautif pour
vérifier qu'il tombe : l'audit de septembre 2026 avait trouvé **douze**
vérifications qui ne pouvaient pas échouer.

## Le motif : de vrais services, une seule doublure

Les services du projet sont `final readonly` — `Frigo`, `FrigoBase`, `FrigoGrocy`,
`InventaireLots`, `AppliqueInventaire`. **PHPUnit ne peut pas les doubler.** Ce
n'est pas une gêne, c'est une chance : on les instancie pour de vrai autour de
leurs seules vraies dépendances, et le test porte alors sur le **câblage réel**.

Deux dépendances seulement sont doublables, et elles suffisent :

| Dépendance | Doublure |
|---|---|
| `Doctrine\DBAL\Connection` | `self::createStub(Connection::class)` |
| Client HTTP (Grocy, OpenFoodFacts) | `MockHttpClient` de Symfony |

```php
$cnx = self::createStub(Connection::class);
$cnx->method('fetchFirstColumn')->willReturnCallback(...);

$grocy = new FrigoGrocy(new MockHttpClient(), new NullLogger(), 'https://grocy.test', 'cle');
$base  = new FrigoBase($cnx);
$controleur = new FrigoController(new Frigo($grocy, $base), $base, $grocy, new InventaireLots($cnx));
```

**`createStub`, jamais `createMock`.** `phpunit.dist.xml` porte
`failOnNotice="true"`, et PHPUnit 12 émet une notice — donc un échec — sur un mock
sans attente configurée : *« No expectations were configured for the mock object …
Consider refactoring your test code to use a test stub instead. »* On n'attend pas
tel appel à telle requête : on regarde ce qui est **réellement parti**, en
accumulant le SQL vu passer dans un tableau.

**`transactional` doit exécuter sa closure.** Un stub renvoie `null` sans rien
appeler : les écritures de la transaction ne partiraient jamais et le test
passerait au vert pour une mauvaise raison.

```php
$cnx->method('transactional')->willReturnCallback(static fn (callable $t): mixed => $t());
```

## Tester un contrôleur sans lever le noyau

`AbstractController::getUser()` a besoin du conteneur. Un conteneur minimal suffit,
et ne coûte ni noyau ni base :

```php
$stockage = new TokenStorage();
$stockage->setToken(new UsernamePasswordToken($utilisateur, 'principal', $utilisateur->getRoles()));
$conteneur = new Container();
$conteneur->set('security.token_storage', $stockage);
$controleur->setContainer($conteneur);
```

`$this->json()` retombe alors sur une `JsonResponse` nue, faute de `serializer`
dans le conteneur — ce qui est exactement ce qu'on veut observer.

Exemples complets : `tests/Controller/InventaireProprieteTest.php` et
`tests/Service/StockProprieteTest.php`.

**Un second motif, pour les extensions Doctrine** : un `QueryBuilder` monte sans
base — il assemble son DQL en mémoire, l'`EntityManager` n'est sollicité qu'à
l'exécution, qui n'a pas lieu. On lit alors `getDQL()` et les paramètres posés.
Voir `tests/Doctrine/FiltreProprietaireTest.php`.

## Le témoin, obligatoire

Tout test qui vérifie un **refus** s'accompagne du test du cas qui doit **passer**.
Sans lui, un contrôle qui refuse tout le monde ressemble à une correction et
laisse le premier test au vert. Les deux tests d'É1 sont construits ainsi :
« l'aliment d'un autre est refusé » **et** « mon propre aliment passe toujours ».

## Ce qu'un test raconte

Le commentaire d'en-tête dit **la panne réelle et sa date**, pas ce que fait le
code. C'est ce qui permet, des mois plus tard, de savoir si une divergence est un
progrès ou une rechute. Voir `InventaireUneLigneTest` (14 août 2026, l'envoi mort
à mi-parcours) ou `StockProprieteTest` (E-01, 7 septembre 2026).

## Contrôles

```bash
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit --display-all-issues'
docker exec fitcarnet-app-dev sh -c 'cd /app && vendor/bin/phpstan analyse --no-progress src/ tests/'
```

PHPStan sort **7 erreurs connues** — `SessionController:108`,
`JetonRafraichissement::\$empreinte`, `Invitation:175`, `ProtectionDuCompte:76`, et trois
dans `tests/`. Aucune ne doit apparaître sur un fichier que tu viens de toucher.

**Ne jamais déclarer terminé sans coller la sortie.**
