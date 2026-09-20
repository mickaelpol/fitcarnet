<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\CoherenceNutritionnelle;
use PHPUnit\Framework\TestCase;

/**
 * LE VERROU ENTRE LES DEUX JUGES DE LA COHERENCE — palier 1, 20 septembre 2026.
 *
 * Jusqu'ici, le front seul jugeait : `plausibilite.ts` refusait 90 kcal pour un
 * riz qui en fait 350, et l'API l'acceptait sans un mot. Poser la regle cote
 * serveur, c'est l'ecrire une DEUXIEME fois — on ne fait pas semblant que non.
 *
 * Ce test et son jumeau `front/src/calcul/coherencePartage.test.ts` lisent LE
 * MEME fichier, `api/regles/coherence.json`.
 *
 * CE QUI EST VERROUILLE : LE REFUS, et lui seul. Les avertissements du front
 * — « ce chiffre est inhabituel » — affichent un doute sans rien empecher, et
 * restent la-bas.
 */
final class CoherencePartageTest extends TestCase
{
    /** @return array<string, array{array<string, mixed>, bool, string}> */
    public static function casPartages(): array
    {
        $cas = [];

        /** @var list<array<string, mixed>> $liste */
        $liste = self::regles()['cas'];
        foreach ($liste as $c) {
            $cas[(string) $c['nom']] = [$c, (bool) $c['refuse'], (string) $c['pourquoi']];
        }

        return $cas;
    }

    /**
     * @param array<string, mixed> $aliment
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('casPartages')]
    public function testChaqueCasPartageEstJugeCommeLaListeLeDit(
        array $aliment,
        bool $refuse,
        string $pourquoi,
    ): void {
        $motif = CoherenceNutritionnelle::motifDeRefus(
            (string) $aliment['categorie'],
            (float) $aliment['kcal100'],
            (float) $aliment['prot100'],
            (float) $aliment['gluc100'],
            (float) $aliment['lip100'],
            null === $aliment['fibres100'] ? null : (float) $aliment['fibres100'],
            (float) $aliment['ratio'],
        );

        self::assertSame(
            $refuse, null !== $motif,
            \sprintf(
                "api/regles/coherence.json dit que cet aliment %s (%s), l'API dit le contraire%s",
                $refuse ? 'est refuse' : 'passe',
                $pourquoi,
                null === $motif ? '' : ' : ' . $motif,
            ),
        );
    }

    /**
     * Les bornes elles-memes, et pas seulement les cas.
     *
     * Un cas de table peut passer par hasard : deplacer la borne de 100,5 a 150
     * laisserait « 110 g de nutriments » refuse si on avait oublie d'ecrire ce
     * cas-la. On eprouve donc chaque borne des DEUX cotes de son bord.
     */
    public function testLesBornesSontCellesDeLaListe(): void
    {
        $regles = self::regles();
        $maxi = (float) $regles['matiere_maximale_pour_100g'];

        /* La matiere se repartit sur les glucides seuls : le reste a zero pour
           que rien d'autre ne puisse declencher un refus. */
        self::assertNull(self::motif(kcal100: 4 * $maxi, gluc100: $maxi),
            'la borne de matiere elle-meme doit etre acceptee');
        self::assertNotNull(self::motif(kcal100: 4 * ($maxi + 0.1), gluc100: $maxi + 0.1),
            'juste au-dessus de la borne, c\'est refuse');

        $mini = (float) $regles['grain_sec_kcal_minimum'];
        $gonfle = (float) $regles['grain_sec_ratio_qui_gonfle'];

        self::assertNull(self::motif('fec', $mini, gluc100: $mini / 4, ratio: $gonfle + 0.1),
            'la borne du grain sec elle-meme doit etre acceptee');
        self::assertNotNull(self::motif('fec', $mini - 1, gluc100: ($mini - 1) / 4, ratio: $gonfle + 0.1),
            'juste en dessous, c\'est refuse');

        self::assertNull(self::motif('fec', $mini - 1, gluc100: ($mini - 1) / 4, ratio: $gonfle),
            'AU ratio qui gonfle, la borne ne s\'applique pas encore');
    }

    /**
     * LE FACTEUR KILOJOULE EST CELUI DE LA LISTE.
     *
     * Et le temoin qui compte : on ne refuse pas sur les kcal seules. Une huile
     * fait vraiment 900 kcal aux 100 g.
     */
    public function testLeSoupconDeKilojoulesEstCeluiDeLaListe(): void
    {
        $facteur = (float) self::regles()['facteur_kilojoule'];

        /* 100 g de glucides purs : 400 kcal par Atwater. */
        self::assertNotNull(self::motif(kcal100: 400 * $facteur, gluc100: 100),
            'des kcal exactement au facteur kilojoule doivent etre refusees');

        self::assertNull(self::motif(kcal100: 400, gluc100: 100),
            'les memes kcal en kcal passent');

        self::assertNull(self::motif('huile', kcal100: 900, lip100: 100),
            'une huile fait vraiment 900 kcal : un plafond sur les kcal seules '
            . 'les refuserait toutes');
    }

    /**
     * LE TEMOIN : la liste eprouve vraiment ses trois regles.
     *
     * Sans ce controle, quelqu'un pourrait vider `cas` de ses refus et le test
     * par donnees resterait vert en ne garantissant plus rien — motif 4 du
     * projet, le test qui ne peut pas echouer.
     */
    public function testLaListePorteDesRefusETDesAcceptations(): void
    {
        /** @var list<array<string, mixed>> $cas */
        $cas = self::regles()['cas'];

        $refuses = \array_filter($cas, static fn (array $c): bool => true === $c['refuse']);
        $passes = \array_filter($cas, static fn (array $c): bool => false === $c['refuse']);

        self::assertGreaterThanOrEqual(3, \count($refuses),
            'la liste doit porter au moins un refus par regle : matiere, grain sec, kilojoules');
        self::assertGreaterThanOrEqual(3, \count($passes),
            'et autant de temoins, sans quoi un refus systematique passerait');
    }

    /** @return array<string, array{array<string, mixed>, bool, string}> */
    public static function casDeCibles(): array
    {
        $cas = [];

        /** @var list<array<string, mixed>> $liste */
        $liste = self::regles()['cas_cibles'];
        foreach ($liste as $c) {
            $cas[(string) $c['nom']] = [$c, (bool) $c['refuse'], (string) $c['pourquoi']];
        }

        return $cas;
    }

    /**
     * @param array<string, mixed> $cible
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('casDeCibles')]
    public function testChaqueCibleEstJugeeCommeLaListeLeDit(
        array $cible,
        bool $refuse,
        string $pourquoi,
    ): void {
        $motif = CoherenceNutritionnelle::motifDeRefusDUneCible(
            (float) $cible['kcal'],
            (float) $cible['prot'],
            (float) $cible['gluc'],
            (float) $cible['lip'],
        );

        self::assertSame(
            $refuse, null !== $motif,
            \sprintf(
                "api/regles/coherence.json dit que cette cible %s (%s), l'API dit le contraire%s",
                $refuse ? 'est refusee' : 'passe',
                $pourquoi,
                null === $motif ? '' : ' : ' . $motif,
            ),
        );
    }

    /**
     * LE TEMOIN QUI PROTEGE UN PARCOURS QUI MARCHE.
     *
     * Une cible seulement INCOHERENTE doit passer. L'ecran le dit deja — « l'app
     * respecte les grammes ; les calories suivent » — et laisse enregistrer. Si
     * quelqu'un durcit un jour cette regle, ce test tombe et rappelle pourquoi.
     */
    public function testUneCibleSeulementIncoherenteNEstPasRefusee(): void
    {
        /* 100 g de proteines, 100 de glucides, 50 de lipides = 1250 kcal.
           La cible en annonce 2100 : c'est faux arithmetiquement, et pourtant
           c'est une saisie legitime. */
        self::assertNull(
            CoherenceNutritionnelle::motifDeRefusDUneCible(2100.0, 100.0, 100.0, 50.0),
            'une cible incoherente doit passer : refuser casserait la recopie '
            . "d'un plan de coach, que l'ecran autorise explicitement");
    }

    // ----------------------------------------------------------------- outils

    private static function motif(
        string $categorie = 'autre',
        float $kcal100 = 0.0,
        float $prot100 = 0.0,
        float $gluc100 = 0.0,
        float $lip100 = 0.0,
        ?float $fibres100 = null,
        float $ratio = 1.0,
    ): ?string {
        return CoherenceNutritionnelle::motifDeRefus(
            $categorie, $kcal100, $prot100, $gluc100, $lip100, $fibres100, $ratio);
    }

    /** @return array<string, mixed> */
    private static function regles(): array
    {
        $chemin = \dirname(__DIR__, 2) . '/regles/coherence.json';

        self::assertFileExists($chemin,
            'api/regles/coherence.json est la liste unique des refus : sans elle, '
            . 'les deux juges de la coherence peuvent diverger en silence.');

        /** @var array<string, mixed> */
        return (array) \json_decode((string) \file_get_contents($chemin), true, flags: \JSON_THROW_ON_ERROR);
    }
}
