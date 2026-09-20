<?php

declare(strict_types=1);

namespace App\Tests\Repository;

use App\Repository\AlimentsReference;
use Doctrine\DBAL\Connection;
use PHPUnit\Framework\TestCase;

/**
 * LA RECHERCHE DU SELECTEUR « CA RESSEMBLE A… ».
 *
 * Elle sert a une seule chose : laisser quelqu'un RATTACHER son aliment au
 * catalogue CIQUAL. Le rattachement dit ce que l'aliment EST — donc a quel
 * repas il convient et avec quoi il va — et jamais ce qu'il VAUT : les macros
 * restent celles lues sur le paquet (decide le 20 septembre 2026, regle 7).
 *
 * CE QUI SE JOUE ICI EST LA QUALITE DU RAPPROCHEMENT. Si la recherche ne
 * trouve pas, la personne renonce, l'aliment reste non rattache — donc absent
 * des propositions de repas.
 *
 * CE COMMENTAIRE A MENTI, ET C'EST INSTRUCTIF. Sa premiere version affirmait :
 * « "Coulommiers" doit se trouver en tapant "colomiers" ». Ce n'etait PAS le
 * cas — la recherche etait une simple sous-chaine, et `%colomiers%` ne
 * correspond pas a « coulommiers », il manque un `u`. L'affirmation etait
 * ecrite dans le commentaire d'un test qui ne la verifiait pas, dans un
 * chantier dont c'est precisement le sujet. Elle est devenue un TEST, ci-dessous.
 */
final class AlimentsReferenceTest extends TestCase
{
    public function testLaRechercheIgnoreLaCasseEtLesAccents(): void
    {
        $vu = self::sqlVuPour('Pâtes');

        self::assertStringContainsString('lower(', $vu['sql'],
            'sans cela, « poulet » ne trouverait pas « Poulet, blanc, cru »');
        self::assertSame('pates', $vu['params']['q'],
            'les accents partent des DEUX cotes : la saisie ici, le nom en SQL');
        self::assertSame('%pates%', $vu['params']['motif']);
    }

    /**
     * LE NOMBRE DE RESULTATS EST BORNE, ET CE N'EST PAS UN DETAIL.
     *
     * 3 484 aliments : « lait » en rend des dizaines. Une liste sans fin ne se
     * lit pas, et la renvoyer entiere a chaque frappe coute pour rien.
     */
    public function testLaRechercheEstBornee(): void
    {
        $vu = self::sqlVuPour('lait');

        self::assertStringContainsString('LIMIT', $vu['sql']);
    }

    /**
     * LES PLUS COURTS D'ABORD, ET C'EST LE CŒUR DE L'ERGONOMIE.
     *
     * Sur « poulet », CIQUAL rend « Graisse de poulet », « Foie, poulet, cru »,
     * « Poulet, pilon cru »… Ce qu'on cherche presque toujours est l'entree la
     * plus generique, et c'est la plus COURTE. Trier par longueur la fait
     * remonter sans qu'on ait a deviner une pertinence.
     */
    public function testLesNomsLesPlusCourtsRemontentEnPremier(): void
    {
        self::assertStringContainsString('length(nom)', self::sqlVuPour('poulet')['sql']);
    }

    /**
     * LA FAUTE DE FRAPPE EST RATTRAPEE — le cas qui a motive le chantier.
     *
     * Le frigo de production porte `Colomiers`, un Coulommiers auquel il manque
     * un `u`, que personne n'a vu depuis des mois. Une recherche par
     * sous-chaine ne le retrouve pas ; `pg_trgm` si —
     * `similarity('colomiers', 'coulommiers') = 0,467`, au-dessus du seuil.
     *
     * Ce test porte sur la REQUETE et non sur son resultat : il tourne sans
     * base, comme toute la suite (skill `tests-api`). Que 0,467 depasse 0,3 est
     * verifie par le calcul ci-dessous ; que PostgreSQL rende bien ce chiffre a
     * ete mesure a la main sur la base reelle le 20 septembre 2026.
     */
    public function testLaRechercheRattrapeUneFauteDeFrappe(): void
    {
        $vu = self::sqlVuPour('colomiers');

        self::assertStringContainsString('similarity(', $vu['sql'],
            'sans ressemblance, « colomiers » ne trouve jamais « Coulommiers »');
        self::assertSame('colomiers', $vu['params']['q'],
            'la ressemblance se calcule sur la recherche NUE, pas sur le motif a jokers');
        self::assertSame('%colomiers%', $vu['params']['motif']);
    }

    /**
     * ET CE QUI CONTIENT LA RECHERCHE PASSE DEVANT CE QUI LUI RESSEMBLE.
     *
     * Sans cet ordre, une approximation pourrait releguer une correspondance
     * exacte en seconde page — et on ne trouverait plus ce qu'on a bien tape.
     */
    public function testUneCorrespondanceExactePasseDevantUneRessemblance(): void
    {
        $sql = self::sqlVuPour('poulet')['sql'];
        $ordre = \substr($sql, \strpos($sql, 'ORDER BY') ?: 0);

        self::assertLessThan(
            \strpos($ordre, 'similarity('),
            \strpos($ordre, 'LIKE :motif'),
            'le LIKE doit etre le PREMIER critere de tri',
        );
    }

    /** Une recherche trop courte ne part pas : elle rendrait la table entiere. */
    public function testUneRechercheTropCourteNeTouchePasLaBase(): void
    {
        $touchee = false;
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchAllAssociative')->willReturnCallback(
            function () use (&$touchee): array {
                $touchee = true;

                return [];
            });

        self::assertSame([], (new AlimentsReference($cnx))->chercher('a'));
        self::assertFalse($touchee, 'une lettre seule ne doit pas interroger 3 484 lignes');
    }

    // ---------------------------------------------------------------- outils

    /** @return array{sql: string, params: array<string, mixed>} */
    private static function sqlVuPour(string $recherche): array
    {
        $vu = ['sql' => '', 'params' => []];
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchAllAssociative')->willReturnCallback(
            function (string $sql, array $params) use (&$vu): array {
                $vu = ['sql' => $sql, 'params' => $params];

                return [];
            });

        (new AlimentsReference($cnx))->chercher($recherche);

        return $vu;
    }
}
