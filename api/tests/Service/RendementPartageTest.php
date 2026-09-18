<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\AlimentDisponible;
use App\Service\RendementPlausible;
use PHPUnit\Framework\TestCase;

/**
 * LE VERROU ENTRE LES DEUX JUGES DU RENDEMENT — constat 04#7.
 *
 * L'API et le front repondent tous les deux a « ce rendement est-il
 * possible ? », chacun dans son langage : `RendementPlausible::sens()` ici,
 * `rendementPossible()` la-bas. Chacun etait correctement teste de son cote —
 * et c'est exactement ce qui rendait une divergence invisible : les deux
 * suites restaient vertes en disant le contraire l'une de l'autre.
 *
 * Ce test et son jumeau `front/src/calcul/rendementPartage.test.ts` lisent LE
 * MEME fichier, `api/regles/rendement.json`. Le jour ou l'un des deux juges change
 * d'avis sans l'autre, une des deux suites tombe en nommant le cas.
 *
 * CE QUI EST VERROUILLE : l'IMPOSSIBLE. Les bandes plus douces du front
 * — « ce rendement est inhabituel » — restent au front : elles AFFICHENT un
 * doute, elles ne refusent rien. L'API, elle, decide quel rendement est retenu
 * (`AlimentDisponible`), et c'est pour cela que les deux doivent au moins
 * s'accorder sur ce qu'aucun des deux n'accepte.
 */
final class RendementPartageTest extends TestCase
{
    /** @return array<string, array{string, float, bool, string}> */
    public static function casPartages(): array
    {
        $regles = self::regles();
        $cas = [];

        foreach ($regles['cas'] as $c) {
            $nom = \sprintf('%s a %s', $c['categorie'], (string) $c['ratio']);
            $cas[$nom] = [(string) $c['categorie'], (float) $c['ratio'], (bool) $c['possible'], (string) $c['pourquoi']];
        }

        return $cas;
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('casPartages')]
    public function testChaqueCasPartageEstJugeCommeLaListeLeDit(
        string $categorie,
        float $ratio,
        bool $possible,
        string $pourquoi,
    ): void {
        $motif = RendementPlausible::sens($categorie, $ratio);

        self::assertSame(
            $possible, null === $motif,
            \sprintf(
                "api/regles/rendement.json dit que « %s a %s » %s (%s), l'API dit le contraire%s",
                $categorie,
                (string) $ratio,
                $possible ? 'est possible' : 'est impossible',
                $pourquoi,
                null === $motif ? '' : ' : ' . $motif,
            ),
        );
    }

    /**
     * Les bornes elles-memes, et pas seulement les cas.
     *
     * Un cas de table peut passer par hasard — une borne deplacee de 1,05 a 1,5
     * laisserait « prot a 1,2 » refuse si on avait oublie d'ecrire ce cas. On
     * verifie donc la borne en tant que telle, des deux cotes de son bord.
     */
    public function testLesBornesSontCellesDeLaListe(): void
    {
        $regles = self::regles();
        $maxi = (float) $regles['ratio_maximal_en_perdant'];
        $mini = (float) $regles['ratio_minimal_d_un_feculent'];

        foreach ($regles['categories_qui_perdent_de_l_eau'] as $categorie) {
            self::assertNull(RendementPlausible::sens((string) $categorie, $maxi),
                "{$categorie} : la borne haute doit etre acceptee");
            self::assertNotNull(RendementPlausible::sens((string) $categorie, $maxi + 0.01),
                "{$categorie} : juste au-dessus de la borne, c'est refuse");
        }

        self::assertNull(RendementPlausible::sens('fec', $mini));
        self::assertNotNull(RendementPlausible::sens('fec', $mini - 0.01));
    }

    /**
     * LE SEUIL DE MATIERE EST ECRIT DEUX FOIS — c'est l'autre moitie du constat.
     *
     * `100.5` vit dans `AlimentDisponible` ici et dans `plausibilite.ts`
     * la-bas. On ne peut pas le lire depuis PHP sans instancier tout un
     * aliment : on eprouve donc le comportement au bord, ce qui revient au
     * meme et resiste mieux a une refonte.
     */
    public function testLeSeuilDeMatiereEstCeluiDeLaListe(): void
    {
        $seuil = (float) self::regles()['matiere_maximale_pour_100g'];

        self::assertSame([], self::incoherencesPourMatiere($seuil),
            'la borne elle-meme ne doit pas etre signalee');

        $trop = self::incoherencesPourMatiere($seuil + 0.5);
        self::assertNotSame([], $trop,
            'au-dela du seuil, la matiere doit etre signalee');
    }

    /**
     * Les incoherences signalees pour une matiere totale donnee.
     *
     * `incoherences()` rend des PHRASES, pas des codes : c'est ce que l'ecran
     * affiche. On cherche donc celle qui parle de nutriments dans 100 g.
     *
     * @return list<string>
     */
    private static function incoherencesPourMatiere(float $matiere): array
    {
        /* Reparti sur les trois macros, fibres comprises dans les glucides :
           ce qui compte ici est leur SOMME, pas leur repartition. */
        $aliment = new AlimentDisponible(
            reference: 'base:1',
            nom: 'Temoin',
            categorie: 'autre',
            kcal100: 400.0,
            prot100: $matiere / 3,
            gluc100: $matiere / 3,
            lip100: $matiere / 3,
            fibres100: null,
            ratio: 1.0,
            stock: 100.0,
            grammesParUnite: 1.0,
        );

        return \array_values(\array_filter(
            $aliment->incoherences(),
            static fn (string $dit): bool => \str_contains($dit, 'dans 100 g de produit'),
        ));
    }

    /** @return array<string, mixed> */
    private static function regles(): array
    {
        $chemin = \dirname(__DIR__, 2) . '/regles/rendement.json';

        self::assertFileExists($chemin,
            'api/regles/rendement.json est la liste unique des bornes : sans elle, '
            . 'les deux juges du rendement peuvent diverger en silence.');

        /** @var array<string, mixed> */
        return (array) \json_decode((string) \file_get_contents($chemin), true, flags: \JSON_THROW_ON_ERROR);
    }
}
