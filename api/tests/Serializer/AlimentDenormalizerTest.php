<?php

declare(strict_types=1);

namespace App\Tests\Serializer;

use ApiPlatform\Validator\Exception\ValidationException;
use App\Entity\Aliment;
use App\Serializer\AlimentDenormalizer;
use App\Service\VerdictAliment;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Serializer\Normalizer\DenormalizerInterface;
use Symfony\Component\Validator\ConstraintViolationListInterface;

/**
 * UN SEUL JUGE POUR UN ALIMENT SAISI, ET IL EST DEVANT LA DENORMALISATION.
 *
 * Palier « serveur autoritaire », 26 septembre 2026. `VerdictAliment` juge deja
 * une saisie pour `POST /api/verification/aliment`, au service de l'ecran. Rien
 * n'empechait pourtant un client d'ecrire directement `POST /api/aliments` avec
 * des valeurs que ce meme service aurait refusees : l'ecran ne peut allumer ou
 * eteindre un bouton, il ne peut pas fermer une porte. `AlimentDenormalizer`
 * ferme cette porte-la, en amont de toute hydratation Doctrine — refuser
 * APRES avoir cree l'objet serait deja trop tard pour un `PATCH` partiel.
 *
 * IL LIT AUSSI LES NOMBRES TELS QUE TAPES, virgule francaise comprise : la
 * meme regle que `VerdictAliment::pour()`, pour que le formulaire et l'API
 * directe disent tous deux « 12,5 » et non « 12 » ou une erreur de type.
 *
 * `PATCH` NE REJUGE PAS CE QUI ETAIT DEJA LA (regle de `motifDeLOrigine`,
 * deja portee par `VerdictAliment`) : l'origine transmise au juge est celle
 * LUE EN BASE via `object_to_populate`, jamais celle qu'un corps de requete
 * pourrait forger pour se faire passer pour l'existant.
 *
 * Modele de style : `AlimentProcessorTest` (createStub, jamais createMock).
 */
final class AlimentDenormalizerTest extends TestCase
{
    /** CA-9 : une macro en chaine avec virgule devient un float pour l'interne. */
    public function testUneMacroEnChaineAvecVirguleDevientUnFloatPourLInterne(): void
    {
        $recu = [];
        $denormaliseur = self::denormaliseur($recu);

        $denormaliseur->denormalize(self::rizSecSain(['prot100' => '12,5']), Aliment::class, 'json');

        self::assertSame(12.5, $recu['donnees']['prot100'] ?? null,
            'le denormaliseur interne doit recevoir un float, pas la chaine "12,5"');
    }

    /** CA-10 : une macro deja numerique traverse telle quelle. */
    public function testUneMacroDejaNumeriqueTraverseTelleQuelle(): void
    {
        $recu = [];
        $denormaliseur = self::denormaliseur($recu);

        $denormaliseur->denormalize(self::rizSecSain(['prot100' => 12.5]), Aliment::class, 'json');

        self::assertSame(12.5, $recu['donnees']['prot100'] ?? null);
    }

    /** CA-11 : deux pesees lues donnent un ratio effectif calcule, pas recopie. */
    public function testLeRatioEffectifVientDesDeuxPeseesQuandLesDeuxSontLues(): void
    {
        $recu = [];
        $denormaliseur = self::denormaliseur($recu);

        $denormaliseur->denormalize(
            self::rizSecSain(['peseeAvant' => '100', 'peseeApres' => '230', 'ratio' => '1']),
            Aliment::class,
            'json',
        );

        self::assertSame(2.3, $recu['donnees']['ratio'] ?? null,
            'deux pesees lues : le ratio effectif (230 / 100) remplace le ratio tape');
        self::assertSame(100.0, $recu['donnees']['peseeAvant'] ?? null);
        self::assertSame(230.0, $recu['donnees']['peseeApres'] ?? null);
    }

    /**
     * CA-12 : UN SEUL JUGE. Les violations levees par le denormaliseur sont
     * EXACTEMENT celles de `VerdictAliment::pour($saisie)['refus']`, ni plus
     * ni moins — aucune coherence n'est rejugee ici avec des mots a soi.
     *
     * « complete saine » et « riz cuit incoherent » sont, l'une pour l'autre,
     * le TEMOIN : sans les deux, un denormaliseur qui refuserait
     * systematiquement — ou qui laisserait toujours passer — resterait vert.
     *
     * Le cas « prot vide » est particulier et n'entre PAS dans l'egalite
     * stricte : `VerdictAliment` ne le compte pas comme un refus (une absence
     * n'est pas une faute, regle 6), et pourtant `enregistrable` est bien
     * `false`. Ce cas-la est couvert precisement par
     * `testUneMacroObligatoireVideRefuseSansAppelerLInterne` (CA-R1) ; il
     * reste ici pour prouver qu'il bloque bien l'ecriture, sans lui imposer
     * une liste de violations qu'il ne peut pas avoir.
     *
     * @param array<string, mixed> $saisie
     */
    #[DataProvider('saisiesAJuger')]
    public function testLesViolationsSontExactementCellesDuVerdict(array $saisie): void
    {
        $verdict = VerdictAliment::pour($saisie);

        $recu = [];
        $denormaliseur = self::denormaliseur($recu);

        $exception = null;
        try {
            $denormaliseur->denormalize($saisie, Aliment::class, 'json');
        } catch (ValidationException $e) {
            $exception = $e;
        }

        if ($verdict['enregistrable']) {
            self::assertNull($exception, 'une saisie enregistrable ne doit pas etre refusee');
            self::assertNotSame([], $recu, "l'interne doit avoir ete appele");

            return;
        }

        self::assertInstanceOf(ValidationException::class, $exception,
            'une saisie non enregistrable doit lever une ValidationException');
        self::assertSame([], $recu, "l'interne ne doit pas etre appele quand la saisie est refusee");

        if ([] !== $verdict['refus']) {
            self::assertSame(
                $verdict['refus'],
                self::couples($exception->getConstraintViolationList()),
                'le denormaliseur ne doit pas rejuger : il reprend le verdict tel quel',
            );
        }
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function saisiesAJuger(): iterable
    {
        yield 'complete saine' => [self::rizSecSain()];
        yield 'prot vide' => [self::rizSecSain(['prot100' => ''])];
        yield "prot illisible '4,2,1'" => [self::rizSecSain(['prot100' => '4,2,1'])];
        yield 'riz cuit incoherent (herite sans origine)' => [[
            'nom' => 'Riz', 'categorie' => 'fec', 'kcal100' => '130',
            'prot100' => '2,7', 'gluc100' => '28', 'lip100' => '0,3', 'ratio' => '2,26',
        ]];
    }

    /**
     * CA-13 : un aliment incoherent HERITE (migre avant la regle) se renomme
     * sans que ses valeurs d'origine soient rejugees — la meme exemption que
     * `Aliment::memoriserLesValeursChargees` / `motifDeLOrigine`, appliquee
     * ici a un `PATCH` denormalise.
     */
    public function testUnAlimentIncoherentHeriteSeRenommeSansRejugerSesValeurs(): void
    {
        $recu = [];
        $denormaliseur = self::denormaliseur($recu);
        $enBase = self::alimentIncoherentHerite();

        $exception = null;
        try {
            $denormaliseur->denormalize(['nom' => 'Riz renommé'], Aliment::class, 'json',
                ['object_to_populate' => $enBase]);
        } catch (ValidationException $e) {
            $exception = $e;
        }

        self::assertNull($exception,
            'renommer un aliment herite ne doit pas rejuger des valeurs que personne n\'a touchees');
        self::assertSame('Riz renommé', $recu['donnees']['nom'] ?? null,
            "l'interne doit avoir ete appele, avec le nouveau nom");
    }

    /**
     * CA-13, SECONDE MOITIE — relevee par `revue-fitcarnet` le 26 septembre
     * 2026. La fixture ci-dessus n'est incoherente qu'au sens
     * d'`AnomaliesAliment` (le riz cuit) ; celle-ci l'est au sens de
     * `ControleDesMacros` — 100 kcal pour 50 g de proteines, Atwater a 200,
     * +100 %. Ce verdict `incoherent` bloquait `enregistrable` SANS exempter
     * l'origine : renommer l'aliment rendait 422 sur `kcal100`, un champ que
     * personne n'avait touche. Avant la feature, ce PATCH ne passait que par
     * l'entite, qui ne juge pas l'ecart d'Atwater.
     */
    public function testUnAlimentHeriteIncoherentAuSensDAtwaterSeRenommeAussi(): void
    {
        $recu = [];
        $denormaliseur = self::denormaliseur($recu);

        $exception = null;
        try {
            $denormaliseur->denormalize(['nom' => 'Blanc renommé'], Aliment::class, 'json',
                ['object_to_populate' => self::alimentHeriteHorsAtwater()]);
        } catch (ValidationException $e) {
            $exception = $e;
        }

        self::assertNull($exception,
            "renommer un aliment herite hors d'Atwater ne doit pas rejuger ses valeurs");
        self::assertSame('Blanc renommé', $recu['donnees']['nom'] ?? null);
    }

    /**
     * L'EXEMPTION N'EST PAS UN PERMIS : toucher a une valeur de ce meme
     * aliment, en restant hors d'Atwater, est refuse comme sur une creation.
     */
    public function testUnAlimentHeriteHorsAtwaterNeSeModifiePasEnRestantIncoherent(): void
    {
        $recu = [];
        $denormaliseur = self::denormaliseur($recu);

        $exception = null;
        try {
            $denormaliseur->denormalize(['kcal100' => '101'], Aliment::class, 'json',
                ['object_to_populate' => self::alimentHeriteHorsAtwater()]);
        } catch (ValidationException $e) {
            $exception = $e;
        }

        self::assertInstanceOf(ValidationException::class, $exception);
        self::assertSame([], $recu, "l'interne ne doit pas etre appele");
    }

    /**
     * CA-R1 : une macro obligatoire vide refuse sans appeler l'interne.
     *
     * PARTICULARITE : `VerdictAliment::pour()` ne compte PAS l'absence comme
     * un refus (regle 6, « vide n'est pas une faute »), et son `refus` reste
     * donc vide ici. Le denormaliseur doit pourtant s'arreter, puisque
     * `enregistrable` est `false` : sans ce garde, un `POST /api/aliments`
     * sans proteines atteindrait l'entite avec un `prot100` a `null`, et la
     * seule chose qui l'aurait refuse serait alors la validation ORDINAIRE de
     * Doctrine — jamais appelee ici, puisque l'interne n'est pas sollicite.
     */
    public function testUneMacroObligatoireVideRefuseSansAppelerLInterne(): void
    {
        $recu = [];
        $denormaliseur = self::denormaliseur($recu);

        $exception = null;
        try {
            $denormaliseur->denormalize(self::rizSecSain(['prot100' => '']), Aliment::class, 'json');
        } catch (ValidationException $e) {
            $exception = $e;
        }

        self::assertInstanceOf(ValidationException::class, $exception);
        $couples = self::couples($exception->getConstraintViolationList());
        self::assertNotSame([], $couples, 'une macro manquante doit porter au moins une violation');
        self::assertSame('prot100', $couples[0]['champ'] ?? null);
        self::assertSame([], $recu, "l'interne ne doit pas etre appele");
    }

    /** CA-R2 : une macro obligatoire a `null` refuse comme une macro vide. */
    public function testUneMacroObligatoireANullRefuseCommeVide(): void
    {
        $recu = [];
        $denormaliseur = self::denormaliseur($recu);

        $exception = null;
        try {
            $denormaliseur->denormalize(self::rizSecSain(['prot100' => null]), Aliment::class, 'json');
        } catch (ValidationException $e) {
            $exception = $e;
        }

        self::assertInstanceOf(ValidationException::class, $exception);
        $couples = self::couples($exception->getConstraintViolationList());
        self::assertNotSame([], $couples);
        self::assertSame('prot100', $couples[0]['champ'] ?? null);
        self::assertSame([], $recu);
    }

    /** CA-R3 : une macro illisible refuse avec le message meme de VerdictAliment. */
    public function testUneMacroIllisibleRefuseAvecLeMessageDuVerdict(): void
    {
        $saisie = self::rizSecSain(['prot100' => 'abc']);
        $verdict = VerdictAliment::pour($saisie);

        $recu = [];
        $denormaliseur = self::denormaliseur($recu);

        $exception = null;
        try {
            $denormaliseur->denormalize($saisie, Aliment::class, 'json');
        } catch (ValidationException $e) {
            $exception = $e;
        }

        self::assertInstanceOf(ValidationException::class, $exception);
        self::assertSame($verdict['refus'], self::couples($exception->getConstraintViolationList()));
        self::assertSame([], $recu);
    }

    /**
     * CA-R4 : L'ORIGINE VIENT DE LA BASE, JAMAIS DU CORPS DE LA REQUETE.
     *
     * Le corps forge une cle `origine` egale a ses PROPRES nouvelles valeurs
     * incoherentes, pour tenter de se faire passer pour l'existant et
     * echapper au jugement (comme le ferait un aliment veritablement herite,
     * CA-13). L'aliment REELLEMENT en base porte d'autres valeurs
     * (kcal100 = 130) : c'est CELLES-LA que le denormaliseur doit transmettre
     * a `VerdictAliment::pour()` sous la cle `origine`, pas celles du corps.
     */
    public function testLOrigineForgeeDansLeCorpsEstIgnoree(): void
    {
        $recu = [];
        $denormaliseur = self::denormaliseur($recu);
        $enBase = self::alimentIncoherentHerite(); // kcal100 reel = 130

        $origineForgee = [
            'kcal100' => '120', 'prot100' => '2,7', 'gluc100' => '28',
            'lip100' => '0,3', 'ratio' => '2,26', 'categorie' => 'fec',
        ];
        $corps = [
            'kcal100' => '120', 'prot100' => '2,7', 'gluc100' => '28',
            'lip100' => '0,3', 'ratio' => '2,26',
            'origine' => $origineForgee,
        ];

        $exception = null;
        try {
            $denormaliseur->denormalize($corps, Aliment::class, 'json', ['object_to_populate' => $enBase]);
        } catch (ValidationException $e) {
            $exception = $e;
        }

        self::assertInstanceOf(ValidationException::class, $exception,
            "l'origine forgee dans le corps ne doit pas couvrir une nouvelle valeur incoherente");
        self::assertSame([], $recu, "l'interne ne doit pas etre appele");
    }

    /** @param array<string, mixed> $ecarts remplacent ou completent le riz sec */
    private static function rizSecSain(array $ecarts = []): array
    {
        return $ecarts + [
            'nom' => 'Riz',
            'categorie' => 'fec',
            'kcal100' => '350',
            'prot100' => '7',
            'gluc100' => '78',
            'lip100' => '0,6',
            'ratio' => '2,26',
        ];
    }

    /**
     * L'aliment EN BASE, incoherent depuis avant la regle — meme jeu de
     * valeurs que `ValeursGrocyObligatoiresTest::incoherences()['du riz saisi
     * CUIT']`. `memoriserLesValeursChargees()` imite le `#[ORM\PostLoad]` qui
     * se declenche vraiment quand Doctrine hydrate une ligne existante.
     */
    private static function alimentIncoherentHerite(): Aliment
    {
        $aliment = (new Aliment())
            ->setNom('Riz')
            ->setCategorie('fec')
            ->setKcal100(130)
            ->setProt100(2.7)
            ->setGluc100(28)
            ->setLip100(0.3)
            ->setRatio(2.26);
        $aliment->memoriserLesValeursChargees();

        return $aliment;
    }

    /** 100 kcal pour 50 g de proteines : Atwater a 202, `ControleDesMacros` dit `incoherent`. */
    private static function alimentHeriteHorsAtwater(): Aliment
    {
        $aliment = (new Aliment())
            ->setNom('Blanc')
            ->setCategorie('prot')
            ->setKcal100(100)
            ->setProt100(50)
            ->setGluc100(0)
            ->setLip100(0)
            ->setFibres100(1)
            ->setRatio(1);
        $aliment->memoriserLesValeursChargees();

        return $aliment;
    }

    /**
     * @param array{donnees?: mixed, type?: string, format?: string|null, context?: array<string, mixed>} $recu
     *                                                                                                      ce que l'interne a recu au dernier appel, ou `[]` s'il n'a pas ete appele
     */
    private static function denormaliseur(array &$recu): AlimentDenormalizer
    {
        $interne = self::createStub(DenormalizerInterface::class);
        $interne->method('denormalize')->willReturnCallback(
            static function (mixed $donnees, string $type, ?string $format = null, array $context = []) use (&$recu): mixed {
                $recu = ['donnees' => $donnees, 'type' => $type, 'format' => $format, 'context' => $context];

                return new Aliment();
            });

        $denormaliseur = new AlimentDenormalizer();
        $denormaliseur->setDenormalizer($interne);

        return $denormaliseur;
    }

    /**
     * @return list<array{champ: string, message: string}>
     */
    private static function couples(ConstraintViolationListInterface $violations): array
    {
        $couples = [];
        foreach ($violations as $violation) {
            $couples[] = ['champ' => $violation->getPropertyPath(), 'message' => (string) $violation->getMessage()];
        }

        return $couples;
    }
}
