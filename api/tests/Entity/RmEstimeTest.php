<?php

declare(strict_types=1);

namespace App\Tests\Entity;

use App\Entity\SeanceExercice;
use App\Entity\Serie;
use PHPUnit\Framework\TestCase;

/**
 * LE 1RM QUE L'API ANNONCE DOIT ETRE CELUI QUE L'APPLICATION AFFICHE.
 *
 * `SeanceExercice::getRmEstime()` est une SIXIEME ecriture de la formule
 * d'Epley — la sixieme, apres les trois copies divergentes du front reduites a
 * une seule en septembre 2026 (`front/src/calcul/performance.ts`, module de
 * reference, regle 5). Relevee le 16 septembre 2026 pendant la redaction des
 * fiches de fonctionnalite.
 *
 * ELLE N'AVAIT AUCUN DES DEUX GARDE-FOUS :
 *
 *  - le PLAFOND de 15 repetitions. Au-dela on mesure l'endurance, pas la force :
 *    93 repetitions a 32 kg donnaient 131 kg, soit davantage qu'une serie de 7 a
 *    35 kg. C'est ce chiffre-la que l'API annoncait comme « maximum ».
 *  - la SERIE D'UNE REPETITION prise telle quelle. Le maximum EST la charge
 *    soulevee ; Epley y ajouterait 3,3 % inventes.
 *
 * Le front ne lit pas ce champ (il recalcule par `performance.ts`), donc aucun
 * chiffre faux ne s'affichait. Mais `rmEstime` est expose dans le groupe
 * `seance:lire` : tout autre lecteur de l'API obtenait un autre 1RM pour les
 * memes series. Regle 7 — un chiffre faux est pire qu'un refus.
 *
 * POURQUOI ALIGNER PLUTOT QUE SUPPRIMER. Le champ voyage deja dans le cache
 * persiste des telephones ; le retirer ferait renvoyer un champ devenu inconnu,
 * que `RefuserLesChampsInconnus` refuserait en 400 a la premiere modification
 * d'une seance. On garde le champ, on corrige le chiffre.
 */
final class RmEstimeTest extends TestCase
{
    private static function serie(?int $reps, float|string|null $poids): Serie
    {
        return (new Serie())->setReps($reps)->setPoids($poids);
    }

    /** @param list<Serie> $series */
    private static function exercice(array $series): SeanceExercice
    {
        $e = new SeanceExercice();
        foreach ($series as $s) {
            $e->addSery($s);
        }

        return $e;
    }

    /** Le temoin : sans lui, un calcul qui rendrait toujours null passerait pour une correction. */
    public function testLeCasCourantSuitEpley(): void
    {
        self::assertSame(53.3, self::exercice([self::serie(10, '40')])->getRmEstime());
    }

    public function testUneSerieTropLongueNeDevientPasUnRecord(): void
    {
        $e = self::exercice([self::serie(93, '32'), self::serie(7, '35')]);

        self::assertSame(43.2, $e->getRmEstime(),
            '93 repetitions a 32 kg donnaient 131 kg : on mesurait l\'endurance et on l\'appelait un maximum');
    }

    public function testUneSerieDUneRepetitionVautLaChargeSoulevee(): void
    {
        self::assertSame(100.0, self::exercice([self::serie(1, '100')])->getRmEstime(),
            'Epley ajouterait 3,3 % a une charge qu\'on a deja soulevee une fois : elle EST le maximum');
    }

    public function testSansSerieExploitableRienNEstAnnonce(): void
    {
        self::assertNull(self::exercice([self::serie(16, '50')])->getRmEstime());
        self::assertNull(self::exercice([self::serie(null, '50'), self::serie(8, null)])->getRmEstime());
    }
}
