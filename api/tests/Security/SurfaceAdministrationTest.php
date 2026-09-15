<?php

declare(strict_types=1);

namespace App\Tests\Security;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Operation;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Yaml\Yaml;

/**
 * L'INVENTAIRE DE LA SURFACE D'ADMINISTRATION — 15 septembre 2026.
 *
 * Ce projet a un motif de defaut dominant, et l'audit l'a mesure quatre fois
 * en trois jours : LE JUMEAU OUBLIE. Une porte recoit son verrou, sa voisine
 * ne le recoit pas, et rien ne le signale — parce qu'il n'existait aucun
 * endroit ou la liste des portes soit ecrite.
 *
 * Trois inventaires ici, et aucun test route par route : un test par route ne
 * voit jamais la route qu'on ajoutera demain.
 *
 *   1. Chaque #[Route] de controleur porte un garde, ou figure dans SANS_GARDE
 *      avec sa raison ECRITE.
 *   2. Modifier ou supprimer une ligne d'un catalogue COMMUN exige d'en etre
 *      l'auteur ou l'administrateur — jamais le seul fait d'etre connecte.
 *   3. La surface d'administration exacte est figee. Ouvrir ou fermer une
 *      porte devient une modification VISIBLE de cette liste, donc un acte de
 *      revue, au lieu d'une ligne perdue dans un diff.
 *
 * CE QUE CES TESTS NE COUVRENT PAS, et il faut le savoir : ils lisent des
 * ATTRIBUTS, pas des reponses HTTP. Ils prouvent que le garde est ECRIT, pas
 * que Symfony le fait respecter — ca, c'est le travail du framework, et le
 * projet ne leve pas de noyau dans sa suite de tests.
 */
final class SurfaceAdministrationTest extends TestCase
{
    /**
     * Les routes de controleur volontairement SANS #[IsGranted], et pourquoi.
     *
     * Aucune n'est un oubli : chacune est servie par un pare-feu
     * `security: false` de security.yaml, donc atteinte sans jeton. Y ajouter
     * un garde ne les protegerait pas — il les casserait.
     */
    private const SANS_GARDE = [
        'EtatController::etat' => 'La pastille verte ou rouge de l\'ecran. Hors pare-feu '
            . 'expres : un jeton perime dans l\'en-tete ferait repondre 401 avant le '
            . 'controleur, et la pastille dirait « hors ligne » sur un serveur sain.',

        'SessionController::rafraichir' => 'On appelle cette route JUSTEMENT quand le jeton '
            . 'd\'acces est perime. Elle s\'authentifie par le jeton de rafraichissement, '
            . 'dans le corps.',

        'SessionController::deconnexion' => 'Meme raison que rafraichir : se deconnecter doit '
            . 'marcher avec un jeton d\'acces deja mort.',

        'InvitationsController::verifier' => 'Ouverte par quelqu\'un qui n\'a PAS ENCORE de '
            . 'compte — c\'est tout l\'objet. Le jeton de 256 bits dans l\'URL tient lieu '
            . 'd\'authentification.',

        'InvitationsController::accepter' => 'Idem : c\'est la requete qui CREE le compte. '
            . 'Exiger un compte pour en creer un n\'aurait pas de sens.',
    ];

    /**
     * Les catalogues COMMUNS : les tables qu'un compte lit sans en etre le
     * proprietaire. Ce sont exactement les derogations de ModeleExposeTest,
     * et c'est la que l'ecriture doit etre gardee a la main, faute de
     * `FiltreProprietaire` pour le faire.
     *
     * `Utilisateur` n'y figure pas : ce n'est pas un catalogue, c'est le
     * proprietaire lui-meme, et ModeleExposeTest dit deja ce qui le protege.
     */
    private const CATALOGUES_COMMUNS = ['Aliment', 'Emplacement', 'Exercice', 'ModeCuisson'];

    /**
     * LA SURFACE D'ADMINISTRATION, EXHAUSTIVE.
     *
     * Une entree se lit « cette porte demande ROLE_ADMIN ». Certaines le
     * demandent en alternative — « ROLE_ADMIN ou l'auteur » — et c'est note.
     *
     * MODIFIER CETTE LISTE EST UNE DECISION. Le test compare la liste au code
     * reel dans les deux sens : une porte fermee sans etre inscrite ici echoue
     * autant qu'une porte inscrite ici qu'on aurait rouverte.
     */
    private const SURFACE = [
        // --- referentiel commun : l'ecriture est de l'administration
        'ModeCuisson::Post',
        'ModeCuisson::Patch',
        'ModeCuisson::Delete',

        // --- catalogue des exercices
        //
        // Post FERME LE 15 SEPTEMBRE 2026. Il portait ROLE_USER, et AUCUN
        // ecran de l'application ne l'appelait : une porte ouverte sans usage.
        // Le catalogue est commun, alimente par l'import et par
        // l'administrateur.
        'Exercice::Post',
        // « ROLE_ADMIN ou l'auteur » — F-09 : ce qu'on cree, on doit pouvoir
        // le corriger. Ne pas transformer en ROLE_ADMIN seul.
        'Exercice::Patch',
        'FusionExercice::Post',

        // --- catalogue des aliments : meme regle qu'Exercice::Patch
        'Aliment::Patch',

        // --- les comptes
        'Utilisateur::Get',          // ou soi-meme
        'Utilisateur::GetCollection',
        'Utilisateur::Post',
        'Utilisateur::Patch',        // ou soi-meme
        'ComptesController::lister',
        'ComptesController::activer',
        'ComptesController::supprimer',

        // --- les invitations, au PLURIEL. Au singulier elles sont publiques :
        // voir SANS_GARDE, et la barre oblique finale de security.yaml.
        'InvitationsController::lister',
        'InvitationsController::inviter',
        'InvitationsController::revoquer',

        // --- la carte de l'application
        'access_control ^/api/docs',
    ];

    // ---------------------------------------------------------------- 1

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function routesDeControleur(): iterable
    {
        foreach (self::controleurs() as $reflexion) {
            foreach ($reflexion->getMethods(\ReflectionMethod::IS_PUBLIC) as $methode) {
                if ($methode->getDeclaringClass()->getName() !== $reflexion->getName()) {
                    continue;
                }

                if ([] === $methode->getAttributes(Route::class)) {
                    continue;
                }

                $cle = $reflexion->getShortName() . '::' . $methode->getName();

                yield $cle => [$reflexion->getName(), $methode->getName()];
            }
        }
    }

    #[DataProvider('routesDeControleur')]
    public function testChaqueRouteDeControleurPorteUnGarde(string $classe, string $methode): void
    {
        $reflexion = new \ReflectionClass($classe);
        $cle = $reflexion->getShortName() . '::' . $methode;

        if (\array_key_exists($cle, self::SANS_GARDE)) {
            self::assertNotSame(
                '', \trim(self::SANS_GARDE[$cle]),
                "La derogation de {$cle} doit dire POURQUOI, pas juste exister.",
            );

            self::assertSame(
                [], self::rolesExiges($classe, $methode),
                "{$cle} figure dans SANS_GARDE mais porte pourtant un #[IsGranted]. "
                . 'Retire la derogation, elle ment.',
            );

            return;
        }

        self::assertNotSame(
            [], self::rolesExiges($classe, $methode),
            "{$cle} est une route d'API sans le moindre #[IsGranted], ni sur la methode "
            . "ni sur la classe. Elle ne tient qu'a la ligne « ^/api » d'access_control : "
            . "le jour ou un pare-feu plus permissif attrape son chemin — c'est deja arrive "
            . "trois fois dans security.yaml — elle s'ouvre sans un mot. Pose "
            . "#[IsGranted('ROLE_USER')] ou #[IsGranted('ROLE_ADMIN')], ou inscris-la dans "
            . 'SANS_GARDE en ecrivant ce qui la protege a la place.',
        );
    }

    // ---------------------------------------------------------------- 2

    /**
     * @return iterable<string, array{string, string, string}>
     */
    public static function ecrituresSurUnCatalogueCommun(): iterable
    {
        foreach (self::CATALOGUES_COMMUNS as $nom) {
            /* `toutesLesOperations` ET NON `expressionsDeSecurite`, ET C'EST
               TOUT LE POINT. La seconde ne rend que les operations qui ONT une
               expression non vide : une `new Delete()` posee sans aucun
               `security:` ne produisait donc AUCUN cas de test, et ce temoin
               — ecrit precisement pour attraper « le premier compte connecte
               modifie la reference de tous » — restait vert devant la porte la
               plus grande ouverte qui soit. Le test qui ne peut pas echouer,
               motif n. 4 ; relevee par la revue le 15 septembre 2026. */
            foreach (self::toutesLesOperations('App\\Entity\\' . $nom) as $operation => $expression) {
                if (!\in_array($operation, ['Patch', 'Put', 'Delete'], true)) {
                    continue;
                }

                yield "{$nom}::{$operation}" => [$nom, $operation, $expression];
            }
        }
    }

    /**
     * MODIFIER LE BIEN COMMUN N'EST PAS UN DROIT D'UTILISATEUR CONNECTE.
     *
     * Sur une entite filtree par le proprietaire, Doctrine a deja tranche : on
     * ne peut toucher que ses propres lignes. Sur un CATALOGUE COMMUN il n'y a
     * pas de filtre pour ca — la ligne est visible de tous, et si l'expression
     * de securite se contente de `is_granted('ROLE_USER')`, n'importe quel
     * compte renomme ou supprime la reference de tout le monde.
     *
     * La creation n'est pas couverte ici, et c'est delibere : elle est cadree
     * par le PROCESSEUR, pas par l'expression — `AlimentProcessor` et
     * `ExerciceProcessor` posent `creePar` sur un Post, ce qu'aucune lecture
     * d'attribut ne peut verifier. Voir leurs tests dedies.
     */
    #[DataProvider('ecrituresSurUnCatalogueCommun')]
    public function testUneEcritureSurUnCatalogueCommunExigeLAdminOuLAuteur(
        string $nom,
        string $operation,
        string $expression,
    ): void {
        self::assertNotSame(
            '', $expression,
            "{$nom}, operation {$operation} : AUCUNE expression `security:`. C'est un "
            . "catalogue COMMUN, sans FiltreProprietaire : cette operation est ouverte a "
            . 'tout compte connecte, et rien dans le code ne le dit.',
        );

        self::assertTrue(
            \str_contains($expression, 'ROLE_ADMIN') || \str_contains($expression, 'getCreePar'),
            "{$nom}, operation {$operation} : « {$expression} ». C'est un catalogue COMMUN — "
            . "aucun FiltreProprietaire ne restreint ses lignes a leur auteur. Une expression "
            . "qui ne nomme ni ROLE_ADMIN ni getCreePar() laisse le premier compte connecte "
            . 'modifier la reference de tous les autres.',
        );
    }

    // ---------------------------------------------------------------- 3

    /**
     * L'inventaire tenu a la main et l'inventaire reel doivent coincider.
     *
     * Dans LES DEUX SENS, et le second est le moins evident : une porte qu'on
     * rouvre disparait du code sans que rien ne proteste, parce qu'un test qui
     * ne verifie que « tout ce qui est ferme est inscrit » est content quand
     * plus rien n'est ferme.
     */
    public function testLaSurfaceDAdministrationEstCelleQuOnADecidee(): void
    {
        $reelle = self::surfaceReelle();
        $declaree = self::SURFACE;

        \sort($reelle);
        \sort($declaree);

        self::assertSame(
            $declaree, $reelle,
            "La surface d'administration reelle ne correspond plus a SURFACE. "
            . "Une porte a ete fermee sans etre inscrite, ou une porte inscrite a ete "
            . "ROUVERTE. Les deux demandent une decision, pas un ajustement de ce test.\n"
            . "  inscrit et absent du code : " . \implode(', ', \array_diff($declaree, $reelle) ?: ['—']) . "\n"
            . '  ferme dans le code et non inscrit : ' . \implode(', ', \array_diff($reelle, $declaree) ?: ['—']),
        );
    }

    // ---------------------------------------------------------------- outils

    /**
     * @return list<string>
     */
    private static function surfaceReelle(): array
    {
        $surface = [];

        foreach ([__DIR__ . '/../../src/Entity', __DIR__ . '/../../src/Dto'] as $dossier) {
            $espace = \str_contains($dossier, 'Entity') ? 'App\\Entity\\' : 'App\\Dto\\';

            foreach (\glob($dossier . '/*.php') ?: [] as $fichier) {
                $classe = $espace . \basename($fichier, '.php');

                if (!\class_exists($classe)) {
                    continue;
                }

                $court = self::nomExpose($classe);

                foreach (self::expressionsDeSecurite($classe) as $operation => $expression) {
                    if (\str_contains($expression, 'ROLE_ADMIN')) {
                        $surface[] = "{$court}::{$operation}";
                    }
                }
            }
        }

        foreach (self::controleurs() as $reflexion) {
            foreach ($reflexion->getMethods(\ReflectionMethod::IS_PUBLIC) as $methode) {
                if ($methode->getDeclaringClass()->getName() !== $reflexion->getName()
                    || [] === $methode->getAttributes(Route::class)) {
                    continue;
                }

                if (\in_array('ROLE_ADMIN', self::rolesExiges($reflexion->getName(), $methode->getName()), true)) {
                    $surface[] = $reflexion->getShortName() . '::' . $methode->getName();
                }
            }
        }

        /** @var array{security?: array{access_control?: list<array{path?: string, roles?: string|list<string>}>}} $config */
        $config = Yaml::parseFile(__DIR__ . '/../../config/packages/security.yaml');

        foreach ($config['security']['access_control'] ?? [] as $regle) {
            $roles = (array) ($regle['roles'] ?? []);

            if (\in_array('ROLE_ADMIN', $roles, true)) {
                $surface[] = 'access_control ' . ($regle['path'] ?? '?');
            }
        }

        return $surface;
    }

    /**
     * Le nom sous lequel l'API expose la ressource : `shortName` s'il est
     * donne — les DTO s'en servent — sinon le nom court de la classe.
     *
     * @param class-string $classe
     */
    private static function nomExpose(string $classe): string
    {
        foreach ((new \ReflectionClass($classe))->getAttributes(ApiResource::class) as $attribut) {
            $court = $attribut->getArguments()['shortName'] ?? null;

            if (\is_string($court) && '' !== $court) {
                return $court;
            }
        }

        return (new \ReflectionClass($classe))->getShortName();
    }

    /**
     * Les roles exiges par #[IsGranted], methode ET classe confondues.
     *
     * LES DEUX NIVEAUX, parce que le projet utilise les deux : ComptesController
     * porte son garde sur la classe, InvitationsController sur chaque methode.
     * Ne regarder qu'un niveau declarerait l'autre sans protection.
     *
     * @param class-string $classe
     *
     * @return list<string>
     */
    private static function rolesExiges(string $classe, string $methode): array
    {
        $reflexion = new \ReflectionClass($classe);

        $attributs = [
            ...$reflexion->getAttributes(IsGranted::class),
            ...$reflexion->getMethod($methode)->getAttributes(IsGranted::class),
        ];

        $roles = [];

        foreach ($attributs as $attribut) {
            $arguments = $attribut->getArguments();
            $role = $arguments[0] ?? $arguments['attribute'] ?? null;

            if (\is_string($role)) {
                $roles[] = $role;
            }
        }

        return $roles;
    }

    /**
     * @return list<\ReflectionClass<object>>
     */
    private static function controleurs(): array
    {
        $classes = [];

        foreach (\glob(__DIR__ . '/../../src/Controller/*.php') ?: [] as $fichier) {
            $classe = 'App\\Controller\\' . \basename($fichier, '.php');

            if (\class_exists($classe)) {
                $classes[] = new \ReflectionClass($classe);
            }
        }

        return $classes;
    }

    /**
     * TOUTES les operations declarees, avec leur `security:` ou '' si elle manque.
     *
     * La difference avec `expressionsDeSecurite` tient en un mot : celle-ci ne
     * filtre RIEN. C'est ce qu'il faut pour demander « cette porte est-elle
     * fermee ? », la question a laquelle une porte sans serrure doit repondre
     * « non » et non « quelle porte ? ».
     *
     * @param class-string $classe
     *
     * @return array<string, string>
     */
    private static function toutesLesOperations(string $classe): array
    {
        $operations = [];

        foreach ((new \ReflectionClass($classe))->getAttributes(ApiResource::class) as $attribut) {
            $arguments = $attribut->getArguments();

            foreach ($arguments['operations'] ?? [] as $operation) {
                if (!$operation instanceof Operation) {
                    continue;
                }

                $securite = $operation->getSecurity();
                $operations[(new \ReflectionClass($operation))->getShortName()]
                    = \is_string($securite) ? $securite : '';
            }
        }

        return $operations;
    }

    /**
     * Les expressions `security:` de chaque operation, indexees par operation.
     *
     * Meme lecture que ModeleExposeTest — deux copies, et c'est deja une de
     * trop ; la fusionner demanderait un outil partage entre les deux fichiers
     * de test, ce qui n'a pas ete tranche.
     *
     * @param class-string $classe
     *
     * @return array<string, string>
     */
    private static function expressionsDeSecurite(string $classe): array
    {
        $expressions = [];

        foreach ((new \ReflectionClass($classe))->getAttributes(ApiResource::class) as $attribut) {
            $arguments = $attribut->getArguments();

            foreach ($arguments['operations'] ?? [] as $operation) {
                if (!$operation instanceof Operation) {
                    continue;
                }

                $securite = $operation->getSecurity();

                if (\is_string($securite) && '' !== $securite) {
                    $expressions[(new \ReflectionClass($operation))->getShortName()] = $securite;
                }
            }
        }

        return $expressions;
    }
}
