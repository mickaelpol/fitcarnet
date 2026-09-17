<?php

declare(strict_types=1);

namespace App\Tests\Entity;

use App\Entity\Aliment;
use App\Entity\Exercice;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Validator\Validation;
use Symfony\Component\Validator\Validator\ValidatorInterface;

/**
 * DES CHAMPS TEXTE OUVERTS EN ECRITURE : ILS DOIVENT AU MOINS ETRE BORNES.
 *
 * CONSTAT F-08 DE L'AUDIT DU 7 SEPTEMBRE 2026.
 *
 * `POST /api/aliments` est ouvert a `ROLE_USER`, et `POST /api/exercices` l'etait
 * aussi jusqu'au 15 septembre 2026 — il est reserve a l'administrateur depuis,
 * ce qui ne rend pas la borne inutile : un copier-coller rate reste possible.
 * Aucun des champs texte ecrits par ces deux routes n'avait de longueur
 * maximale : ce sont des colonnes `TEXT`, donc sans borne cote base non plus.
 * Un seul appel pouvait deposer plusieurs mega-octets dans `instructions` —
 * et le catalogue d'exercices est servi en UNE page de 1500 entrees a tout le
 * monde. Ce n'est pas une compromission, c'est une degradation de service :
 * l'ecran de tous devient inutilisable a cause de ce qu'un compte a ecrit.
 *
 * LE VRAI RISQUE DE CETTE CORRECTION N'EST PAS LE REFUS, C'EST LE FAUX REFUS.
 *
 * Un plafond trop bas rend INENREGISTRABLE une ligne qui existe deja : le
 * `PATCH` d'administration revalide l'objet entier, donc corriger une video
 * sur un exercice importe echouerait sur un champ que personne n'a touche, en
 * designant un champ sans rapport avec le geste. C'est pourquoi les plafonds
 * ont ete tires des donnees REELLES, mesurees le 15 septembre 2026 sur les
 * 1338 exercices importes :
 *
 *   nom 67 · nomFr 90 · instructions 975 · musclesSecondaires 56
 *   equipement 20 · muscleCible 21 · partieCorps 10 · formatPrescrit 18
 *
 * Chaque aliment appartenant a son compte, il n'y a pas de catalogue a
 * mesurer : le temoin des aliments est le plus long nom que le depot pose
 * lui-meme, « Skyr d'essai (compte ordinaire) » (31, `jeu-essai.sql`).
 *
 * Chaque plafond garde donc au moins un facteur deux de marge, et le second
 * temoin ci-dessous fige ces valeurs mesurees : si quelqu'un resserre un
 * plafond en dessous de ce que la base porte, le test tombe avant la
 * production.
 *
 * `Exercice::$videoUrl` A SES PROPRES TESTS, PLUS BAS : la chaine de `a`
 * repetes qui sert ici n'est pas une URL, et `Assert\Url` la refuserait pour
 * la mauvaise raison.
 */
final class BornesDesChampsTexteTest extends TestCase
{
    /**
     * Les plafonds attendus, et le pire cas reellement observe en base.
     *
     * @return iterable<string, array{class-string, string, int}>
     */
    public static function champsBornes(): iterable
    {
        yield 'exercice.nom' => [Exercice::class, 'nom', 150];
        yield 'exercice.nomFr' => [Exercice::class, 'nomFr', 150];
        yield 'exercice.formatPrescrit' => [Exercice::class, 'formatPrescrit', 100];
        yield 'exercice.partieCorps' => [Exercice::class, 'partieCorps', 100];
        yield 'exercice.equipement' => [Exercice::class, 'equipement', 100];
        yield 'exercice.muscleCible' => [Exercice::class, 'muscleCible', 100];
        yield 'exercice.musclesSecondaires' => [Exercice::class, 'musclesSecondaires', 255];
        yield 'exercice.instructions' => [Exercice::class, 'instructions', 4000];
        yield 'aliment.nom' => [Aliment::class, 'nom', 150];
        yield 'aliment.codeBarres' => [Aliment::class, 'codeBarres', 64];
    }

    /**
     * @param class-string $classe
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('champsBornes')]
    public function testUnChampTexteRefuseUnTexteDemesure(
        string $classe,
        string $champ,
        int $plafond,
    ): void {
        $violations = self::valider($classe, $champ, \str_repeat('a', $plafond + 1));

        self::assertGreaterThan(0, \count($violations), \sprintf(
            '%s::$%s accepte %d caracteres : le champ n\'a pas de plafond.',
            $classe, $champ, $plafond + 1,
        ));
    }

    /**
     * LE TEMOIN. Sans lui, un plafond de zero caractere passerait pour une
     * correction : tout serait refuse, le test ci-dessus resterait vert, et
     * l'application entiere serait morte.
     *
     * @param class-string $classe
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('champsBornes')]
    public function testUnChampTexteAccepteUnTexteDeTailleNormale(
        string $classe,
        string $champ,
        int $plafond,
    ): void {
        $violations = self::valider($classe, $champ, \str_repeat('a', $plafond));

        self::assertCount(0, $violations, \sprintf(
            '%s::$%s refuse %d caracteres, soit son propre plafond.',
            $classe, $champ, $plafond,
        ));
    }

    /**
     * LE SECOND TEMOIN, ET C'EST LUI QUI PROTEGE LA PRODUCTION.
     *
     * Le pire cas mesure en base, champ par champ, doit rester enregistrable.
     * Un plafond pose en dessous de ces valeurs ferait echouer le `PATCH`
     * d'administration sur un champ que personne n'a touche.
     *
     * @return iterable<string, array{class-string, string, int}>
     */
    public static function piresCasMesuresEnBase(): iterable
    {
        yield 'exercice.nom (67)' => [Exercice::class, 'nom', 67];
        yield 'exercice.nomFr (90)' => [Exercice::class, 'nomFr', 90];
        yield 'exercice.formatPrescrit (18)' => [Exercice::class, 'formatPrescrit', 18];
        yield 'exercice.partieCorps (10)' => [Exercice::class, 'partieCorps', 10];
        yield 'exercice.equipement (20)' => [Exercice::class, 'equipement', 20];
        yield 'exercice.muscleCible (21)' => [Exercice::class, 'muscleCible', 21];
        yield 'exercice.musclesSecondaires (56)' => [Exercice::class, 'musclesSecondaires', 56];
        yield 'exercice.instructions (975)' => [Exercice::class, 'instructions', 975];
        yield 'aliment.nom (31)' => [Aliment::class, 'nom', 31];
    }

    /**
     * @param class-string $classe
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('piresCasMesuresEnBase')]
    public function testCeQueLaBasePorteDejaResteEnregistrable(
        string $classe,
        string $champ,
        int $mesure,
    ): void {
        $violations = self::valider($classe, $champ, \str_repeat('a', $mesure));

        self::assertCount(0, $violations, \sprintf(
            '%s::$%s refuse %d caracteres, longueur pourtant DEJA presente en base '
            .'le 15 septembre 2026 : le PATCH d\'administration echouerait dessus.',
            $classe, $champ, $mesure,
        ));
    }

    /**
     * L'ADRESSE DE VIDEO, TRAITEE A PART — ELLE A DEUX BORNES, PAS UNE.
     *
     * 1. UNE LONGUEUR. `Assert\Url` la bornait deja, mais par accident et non
     *    par regle : mesure du 15 septembre 2026, une URL structurellement
     *    valide passe a 1 017 caracteres et echoue a 10 017 — PCRE abandonne
     *    son motif, ce n'est pas une decision. Une borne accidentelle change
     *    a la prochaine montee de version, sans que rien ne le dise.
     *
     * 2. UN DOMAINE DE PREMIER NIVEAU. `Assert\Url` sans `requireTld`
     *    acceptait `https://serveur-interne/x`. Le champ sert a poser un lien
     *    YouTube de demonstration, affiche a tout le monde : une adresse sans
     *    TLD n'y a pas de sens.
     *
     * ET C'EST AUSSI CE QUI DEBLOQUE LA SUITE. Ne pas passer `requireTld`
     * declenche depuis Symfony 7.1 une depreciation, et `phpunit.dist.xml`
     * porte `failOnDeprecation="true"` : des qu'un test valide `Exercice`,
     * TOUTE la suite sort en erreur — la metadonnee de la classe instancie
     * chaque contrainte, y compris celle-ci, meme quand on valide un autre
     * champ. Le choix est donc pose explicitement plutot que subi.
     *
     * Sans risque sur l'existant : au 15 septembre 2026, aucune des 1338
     * lignes du catalogue ne porte d'adresse de video (colonne entierement
     * NULL). Personne ne peut donc etre bloque par ce resserrement.
     */
    public function testUneAdresseDeVideoSansDomaineDePremierNiveauEstRefusee(): void
    {
        $violations = self::valider(Exercice::class, 'videoUrl', 'https://serveur-interne/demo');

        self::assertGreaterThan(0, \count($violations),
            'une adresse sans TLD n\'a pas de sens pour un lien de demonstration public');
    }

    public function testUneAdresseDeVideoDemesureeEstRefusee(): void
    {
        $trop = 'https://youtu.be/'.\str_repeat('a', 501 - 17);

        self::assertSame(501, \strlen($trop), 'le cas de test doit bien depasser le plafond de 1');
        self::assertGreaterThan(0, \count(self::valider(Exercice::class, 'videoUrl', $trop)),
            'Exercice::$videoUrl accepte 501 caracteres : le champ n\'a pas de plafond');
    }

    /**
     * LE TEMOIN : une vraie adresse YouTube, et une adresse valide de la
     * longueur exacte du plafond, doivent passer.
     */
    public function testUneAdresseDeVideoNormaleResteAcceptee(): void
    {
        self::assertCount(0, self::valider(Exercice::class, 'videoUrl', 'https://youtu.be/dQw4w9WgXcQ'),
            'un lien YouTube ordinaire doit passer');

        $pile = 'https://youtu.be/'.\str_repeat('a', 500 - 17);
        self::assertCount(0, self::valider(Exercice::class, 'videoUrl', $pile),
            'une adresse valide de la longueur exacte du plafond doit passer');
    }

    /**
     * Le validateur est monte a la main : pas de noyau, pas de base. Il lit
     * les attributs de l'entite reelle, donc le test porte sur ce que
     * l'application valide vraiment et non sur une copie des contraintes.
     *
     * `validateProperty` et non `validate` : la validation de classe entiere
     * declencherait `UniqueEntity` sur `Exercice`, qui reclame une connexion
     * Doctrine. On ne veut ici que les contraintes du champ.
     *
     * @param class-string $classe
     */
    private static function valider(string $classe, string $champ, string $valeur): \Countable
    {
        $objet = new $classe();
        $objet->{'set'.\ucfirst($champ)}($valeur);

        return self::validateur()->validateProperty($objet, $champ);
    }

    private static function validateur(): ValidatorInterface
    {
        return Validation::createValidatorBuilder()
            ->enableAttributeMapping()
            ->getValidator();
    }
}
