<?php

declare(strict_types=1);

namespace App\Tests;

use ApiPlatform\Metadata\ApiResource;
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

        // A TRANCHER — constat E8 de l'audit de septembre 2026.
        // Exercice porte les colonnes `public` et `cree_par`, mais rien ne les
        // renseigne ni ne les lit : le catalogue est commun dans les faits,
        // pendant que l'ecran affiche « ★ exercice personnel ». Deux colonnes
        // qui promettent une confidentialite que personne n'applique.
        // Deux issues : un FiltreExercice sur le modele de FiltreAliment, ou la
        // suppression des colonnes et de l'etiquette. Tant que ce n'est pas
        // tranche, la derogation dit au moins la verite.
        'Exercice' => 'Catalogue commun partage entre tous les comptes. '
            . 'Les colonnes public/cree_par sont inertes — decision en attente.',
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
