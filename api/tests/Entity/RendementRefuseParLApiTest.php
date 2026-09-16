<?php

declare(strict_types=1);

namespace App\Tests\Entity;

use App\Entity\Aliment;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Validator\Validation;
use Symfony\Component\Validator\Validator\ValidatorInterface;

/**
 * UN RENDEMENT A CONTRESENS DOIT ETRE REFUSE PAR L'API, PAS PAR LA BASE.
 *
 * LA PANNE, MESUREE LE 16 SEPTEMBRE 2026 SUR L'APPLICATION QUI TOURNE.
 * `POST /api/aliments` avec un feculent a 0,8 repondait :
 *
 *   HTTP 500
 *   detail: An exception occurred while executing a query: SQLSTATE[23514]:
 *     Check violation: 7 ERROR: new row for relation "aliment" violates check
 *     constraint "aliment_ratio_sens"
 *   DETAIL: Failing row contains (65, Feculent verification A, fec, 350.00,
 *     …, 2869f386-…, 2026-09-16 22:40:50+00)
 *
 * Deux defauts dans une seule reponse : le message n'apprend rien a
 * l'utilisateur, et la ligne brute expose l'UUID du proprietaire.
 *
 * CE QUI A ETE CORRIGE CE JOUR-LA NE SUFFISAIT PAS. `rendementPossible`
 * (`front/src/calcul/plausibilite.ts`) grise le bouton d'enregistrement : plus
 * personne ne provoque ce 500 DEPUIS L'APPLICATION. Mais le serveur seul n'a
 * rien gagne — curl, un autre client, une version d'application en retard le
 * declenchent encore. C'est l'agent de verification bout en bout qui l'a
 * releve, en repondant franchement a la question posee.
 *
 * LA REGLE EXISTAIT DEJA, ET PERSONNE NE L'APPELAIT SUR CE CHEMIN.
 * `App\Service\RendementPlausible::sens` porte exactement la regle de la
 * contrainte `aliment_ratio_sens` — mais son seul appelant etait
 * `AlimentDisponible`, c'est-a-dire la LECTURE du frigo. `Aliment::$ratio`, lui,
 * ne portait qu'un `Assert\Positive`.
 *
 * Quatre porteurs de la meme regle, et le seul branche sur l'ecriture ne la
 * consultait pas : le motif dominant du projet, une decision juste appliquee a
 * un endroit et oubliee a l'autre.
 *
 * Validateur monte a la main : ni noyau, ni base. `Aliment` ne porte aucune
 * contrainte de CLASSE reclamant Doctrine (contrairement a `Exercice` et son
 * `UniqueEntity`), donc `validate()` peut etre appele en entier — ce qu'il faut
 * ici, un `Assert\Callback` etant justement une contrainte de classe.
 */
final class RendementRefuseParLApiTest extends TestCase
{
    /**
     * Les violations portees par le rendement, et elles seules : un aliment de
     * test minimal declenche aussi les contraintes des autres champs, qui ne
     * nous regardent pas.
     *
     * @return list<string>
     */
    private static function motifsSurLeRendement(string $categorie, float $ratio): array
    {
        $a = (new Aliment())
            ->setNom('Aliment de test')
            ->setCategorie($categorie)
            ->setKcal100(350)
            ->setProt100(7)
            ->setGluc100(77)
            ->setLip100(1)
            ->setRatio($ratio);

        $motifs = [];
        foreach (self::validateur()->validate($a) as $violation) {
            if ('ratio' === $violation->getPropertyPath()) {
                $motifs[] = (string) $violation->getMessage();
            }
        }

        return $motifs;
    }

    private static function validateur(): ValidatorInterface
    {
        return Validation::createValidatorBuilder()
            ->enableAttributeMapping()
            ->getValidator();
    }

    public function testUnFeculentQuiRetrecitEstRefuseParLEntite(): void
    {
        $motifs = self::motifsSurLeRendement('fec', 0.8);

        self::assertNotEmpty($motifs,
            'un feculent a 0,8 atteint la contrainte de la base et rend un 500 : '
            .'l\'entite doit le refuser avant, avec une phrase lisible');
        self::assertStringContainsString('feculent', \implode(' ', $motifs),
            'le message doit dire POURQUOI, pas « SQLSTATE[23514] »');
    }

    public function testUneProteineQuiGonfleEstRefuseeParLEntite(): void
    {
        self::assertNotEmpty(self::motifsSurLeRendement('prot', 1.5),
            'une viande ne gagne pas de poids en cuisant : meme regle que la base');
    }

    public function testUnLegumeQuiGonfleEstRefuseParLEntite(): void
    {
        self::assertNotEmpty(self::motifsSurLeRendement('leg', 1.5),
            'un legume perd son eau : la base le refuse, l\'API doit le refuser aussi');
    }

    public function testUnRendementNulEstRefuse(): void
    {
        self::assertNotEmpty(self::motifsSurLeRendement('fec', 0.0));
    }

    /**
     * LES TEMOINS, ET ILS SONT LA RAISON D'ETRE DE CE FICHIER.
     *
     * Sans eux, une contrainte qui refuserait TOUT passerait pour une
     * correction : les quatre tests ci-dessus resteraient verts et plus
     * personne ne pourrait enregistrer un aliment.
     *
     * L'epinard a 0,32 est une VRAIE mesure — 500 g crus, 160 g cuits — que
     * l'ancien garde du front refusait a tort. Le riz a 4,68 est celle d'un riz
     * tres hydrate, relevee le 8 aout 2026.
     */
    public function testLesMesuresReellesRestentAcceptees(): void
    {
        self::assertSame([], self::motifsSurLeRendement('leg', 0.32),
            'epinard 500 g crus -> 160 g cuits : une mesure, pas une faute');
        self::assertSame([], self::motifsSurLeRendement('fec', 2.26),
            'le riz blanc du catalogue');
        self::assertSame([], self::motifsSurLeRendement('fec', 4.68),
            'un riz tres hydrate, mesure le 8 aout 2026');
        self::assertSame([], self::motifsSurLeRendement('prot', 0.53),
            'une truite tres cuite');
        self::assertSame([], self::motifsSurLeRendement('leg', 1.0),
            'un legume qui ne bouge pas');
    }
}
