<?php

declare(strict_types=1);

namespace App\Tests;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Operation;
use App\Entity\Aliment;
use App\Entity\Exercice;
use App\Entity\ProprieteUtilisateur;
use PHPUnit\Framework\TestCase;

/**
 * L'INVENTAIRE DU MODELE — la seule chose qui empeche une fuite silencieuse.
 *
 * Toute l'isolation des donnees entre comptes tient a deux lignes de
 * services.yaml : FiltreProprietaire est branche en extension de requete, et il
 * ne restreint QUE les entites qui implementent ProprieteUtilisateur. Une
 * nouvelle entite exposee qui oublie l'interface n'echoue nulle part — elle
 * rend simplement les donnees de tout le monde a tout le monde, sans une
 * erreur, sans une ligne de journal.
 *
 * Ce test refuse ce silence. Il parcourt les entites reelles, pas une liste
 * tenue a la main, donc il voit celles qu'on ajoutera apres l'avoir oublie.
 *
 * Une entite peut legitimement sortir du filtrage — un referentiel commun n'a
 * pas de proprietaire. Elle doit alors figurer dans DEROGATIONS avec sa raison
 * ECRITE. Deroger devient un acte visible en revue, au lieu d'un oubli.
 */
final class ModeleExposeTest extends TestCase
{
    /**
     * Entites exposees qui n'implementent pas ProprieteUtilisateur, et pourquoi.
     *
     * Ajouter une ligne ici est une DECISION : elle dit « cette table n'a pas de
     * proprietaire, et voila ce qui la protege a la place ».
     */
    private const DEROGATIONS = [
        'Aliment' => 'Proprietaire FACULTATIF : les ~50 aliments de reference '
            . "n'appartiennent a personne. FiltreAliment applique la regle "
            . '« commun OU le mien » ; FiltreProprietaire ne saurait pas le faire.',

        'Emplacement' => 'Referentiel commun en lecture seule (GetCollection + Get). '
            . 'Aucune donnee personnelle : des noms de bacs et de placards.',

        'ModeCuisson' => 'Referentiel commun. Lecture ouverte a ROLE_USER, '
            . 'ecriture reservee a ROLE_ADMIN operation par operation.',

        'Utilisateur' => "L'entite EST le proprietaire, elle ne peut pas s'appartenir. "
            . 'Chaque operation porte son propre security: « object == user » '
            . 'ou ROLE_ADMIN.',

        // TRANCHE LE 14 SEPTEMBRE 2026 — constat E8. Ce commentaire disait
        // encore « decision en attente » le 15 : il mentait d'une journee.
        // `FiltreExercice` existe, `ExerciceProcessor` renseigne `creePar`,
        // et les colonnes ne sont plus inertes.
        //
        // La derogation reste, et c'est normal : `Exercice` n'implemente
        // toujours pas `ProprieteUtilisateur`, parce que la regle n'est pas
        // « le mien » mais « public OU le mien » — un exercice peut etre
        // publie ET attribue, ce que `FiltreProprietaire` ne sait pas dire.
        'Exercice' => 'Proprietaire FACULTATIF, comme Aliment, mais la regle porte sur '
            . '`public` et non sur l\'absence d\'auteur : FiltreExercice applique '
            . '« public OU le mien », ce qui autorise un exercice publie SANS effacer '
            . 'sa paternite. FiltreProprietaire ne saurait pas l\'exprimer.',
    ];

    /**
     * @return iterable<string, array{string}>
     */
    public static function entitesExposees(): iterable
    {
        foreach (glob(__DIR__ . '/../src/Entity/*.php') ?: [] as $fichier) {
            $nom = basename($fichier, '.php');
            $classe = 'App\\Entity\\' . $nom;

            if (!class_exists($classe)) {
                continue;   // interfaces et traits du dossier
            }

            $reflexion = new \ReflectionClass($classe);
            $attributs = $reflexion->getAttributes(ApiResource::class);

            if ([] === $attributs) {
                continue;   // entite interne, jamais servie par l'API
            }

            foreach ($attributs as $attribut) {
                $arguments = $attribut->getArguments();

                // `operations` absent = toutes les operations par defaut.
                // C'est le cas le PLUS expose, surtout pas un cas a ignorer.
                $operations = $arguments['operations'] ?? null;

                if (is_array($operations) && [] === $operations) {
                    continue;   // operations: [] — sous-ressource jamais servie
                }

                yield $nom => [$nom];

                break;
            }
        }
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('entitesExposees')]
    public function testUneEntiteExposeeEstFiltreeOuDerogeExplicitement(string $nom): void
    {
        $classe = 'App\\Entity\\' . $nom;

        if (array_key_exists($nom, self::DEROGATIONS)) {
            self::assertNotSame(
                '', trim(self::DEROGATIONS[$nom]),
                "La derogation de {$nom} doit dire POURQUOI, pas juste exister.",
            );

            return;
        }

        self::assertTrue(
            (new \ReflectionClass($classe))->implementsInterface(ProprieteUtilisateur::class),
            "{$nom} est exposee par l'API sans implementer ProprieteUtilisateur : "
            . "FiltreProprietaire ne la restreindra pas et TOUS LES COMPTES VERRONT "
            . "LES DONNEES DE TOUS. Implemente l'interface, ou ajoute {$nom} aux "
            . 'DEROGATIONS de ce test en ecrivant ce qui protege cette table a la place.',
        );
    }

    /**
     * UNE EXPRESSION DE SECURITE NE DOIT RIEN PROMETTRE QUE LE FILTRE INTERDIT.
     *
     * CONSTAT F-05 DE L'AUDIT DU 7 SEPTEMBRE 2026.
     *
     * `Modele` portait `security: "object.getUtilisateur() == user or
     * object.isPartage()"`. L'intention se comprend : un modele marque
     * « partage » serait lisible par les autres comptes. Elle n'a jamais pu
     * fonctionner — `FiltreProprietaire` pose `WHERE utilisateur = :moi` dans
     * la requete, donc AVANT que l'expression ne soit evaluee. L'objet n'est
     * jamais trouve, la reponse est 404, et l'expression n'est jamais atteinte.
     *
     * Ce n'est pas un trou : c'est la fermeture qui gagne. Mais c'est une
     * fonctionnalite morte doublee d'un mensonge, et un mensonge de ce genre
     * finit recopie la ou il ferait effet — c'est le motif de defaut dominant
     * de ce projet, dans l'autre sens.
     *
     * LA REGLE FIGEE ICI : sur une entite filtree par le proprietaire, la
     * seule chose qu'une expression de securite peut demander a l'objet est
     * `getUtilisateur()`. Tout autre `object.<methode>()` designe une
     * condition que la requete SQL a deja tranchee.
     *
     * Ce test parcourt les entites reelles : il verra celle qu'on ajoutera
     * apres l'avoir oublie.
     */
    /**
     * Les seules entites concernees : celles que FiltreProprietaire restreint.
     * Filtrer ici plutot que dans le test evite une branche « sans objet » qui
     * ne peut pas echouer — l'audit en avait trouve douze.
     *
     * @return iterable<string, array{string}>
     */
    public static function entitesFiltreesParLeProprietaire(): iterable
    {
        foreach (self::entitesExposees() as [$nom]) {
            if ((new \ReflectionClass('App\\Entity\\' . $nom))
                ->implementsInterface(ProprieteUtilisateur::class)) {
                yield $nom => [$nom];
            }
        }
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('entitesFiltreesParLeProprietaire')]
    public function testAucuneExpressionDeSecuriteNePrometCeQueLeFiltreInterdit(string $nom): void
    {
        $classe = 'App\\Entity\\' . $nom;

        self::assertNotSame([], self::expressionsDeSecurite($classe),
            "{$nom} est filtree par le proprietaire mais ne porte AUCUNE expression "
            . 'de securite : la defense en profondeur du projet en demande deux.');

        foreach (self::expressionsDeSecurite($classe) as $operation => $expression) {
            \preg_match_all('/object\.(\w+)\s*\(/', $expression, $trouves);

            foreach ($trouves[1] as $methode) {
                self::assertSame(
                    'getUtilisateur', $methode,
                    "{$nom}, operation {$operation} : l'expression de securite interroge "
                    . "object.{$methode}(), mais FiltreProprietaire pose "
                    . '« WHERE utilisateur = :moi » AVANT qu\'elle ne soit evaluee. '
                    . "L'objet n'est jamais trouve : la condition est morte et la reponse "
                    . 'est 404. Retire la clause, ou sors cette entite du filtre — '
                    . "expression complete : « {$expression} »",
                );
            }
        }
    }

    /**
     * Les expressions `security:` de chaque operation, indexees par operation.
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

            if (\is_string($arguments['security'] ?? null)) {
                $expressions['<ressource>'] = $arguments['security'];
            }

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

    /**
     * CE QU'ON CREE, ON DOIT POUVOIR LE CORRIGER.
     *
     * CONSTAT F-09, tranche le 15 septembre 2026.
     *
     * E8 a rendu les exercices personnels vraiment prives : `public = false`,
     * et `FiltreExercice` les rend introuvables pour tout autre compte --
     * l'ADMINISTRATEUR COMPRIS, puisqu'un filtre Doctrine ne connait pas les
     * roles. Le `Patch` etant reserve a ROLE_ADMIN, l'engrenage etait complet :
     * l'auteur voyait son exercice mal orthographie sans pouvoir le modifier,
     * l'administrateur avait le droit mais recevait un 404. PERSONNE ne pouvait
     * le corriger, et la ligne restait telle quelle jusqu'a un UPDATE en SQL.
     *
     * C'est le prix d'une bonne correction mal terminee : E8 a ferme une
     * promesse mensongere et ouvert un blocage, faute d'avoir regarde le
     * chemin d'ECRITURE en meme temps que celui de lecture.
     *
     * La regle retenue est celle d'`Aliment`, qui vit ainsi depuis toujours --
     * pas un motif invente pour l'occasion.
     */
    public function testUnAuteurPeutCorrigerCeQuIlACree(): void
    {
        foreach ([Aliment::class, Exercice::class] as $classe) {
            $nom = (new \ReflectionClass($classe))->getShortName();
            $expressions = self::expressionsDeSecurite($classe);
            $patch = $expressions['Patch'] ?? null;

            self::assertNotNull($patch, "{$nom} : aucune regle de securite sur le Patch.");
            self::assertStringContainsString(
                'object.getCreePar() == user', $patch,
                "{$nom} : l'auteur d'une donnee doit pouvoir la corriger. Sans cela, "
                . 'un catalogue filtre la rend inmodifiable par tout le monde -- son '
                . "auteur n'a pas le droit, et l'administrateur ne la voit plus.");
        }
    }

    /**
     * Une liste blanche qu'on ne nettoie pas finit par autoriser ce que plus
     * personne n'a decide d'autoriser. Une entite renommee, supprimee, ou
     * devenue conforme doit sortir d'ici.
     */
    public function testAucuneDerogationObsolete(): void
    {
        $exposees = [];
        foreach (self::entitesExposees() as [$nom]) {
            $exposees[] = $nom;
        }

        foreach (array_keys(self::DEROGATIONS) as $nom) {
            self::assertContains(
                $nom, $exposees,
                "La derogation {$nom} ne correspond plus a aucune entite exposee "
                . '(renommee, supprimee, ou passee en operations: []). Retire-la.',
            );

            self::assertFalse(
                (new \ReflectionClass('App\\Entity\\' . $nom))
                    ->implementsInterface(ProprieteUtilisateur::class),
                "{$nom} implemente maintenant ProprieteUtilisateur : elle est filtree "
                . 'comme les autres. Retire sa derogation, elle ne protege plus rien.',
            );
        }
    }
}
