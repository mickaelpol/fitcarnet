<?php

declare(strict_types=1);

namespace App\Tests\Entity;

use App\Entity\Exercice;
use App\Entity\Seance;
use App\Entity\SeanceExercice;
use App\Entity\Serie;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * CHAQUE SERIE DIT COMBIEN ELLE COMPTE — et c'est ce qui fait disparaitre le
 * dernier double juge du projet.
 *
 * LE PROBLEME. « 7 series faites sur 12 » etait calcule DEUX fois :
 * `Seance::getAvancement()` pour la liste, `avancementDe()` dans le front pour
 * l'ecran d'une seance. La regle — « un exercice chrono ne compte que pour UNE
 * serie, il n'a qu'un temps total » — vivait des deux cotes, tenue par
 * `api/regles/avancement.json`.
 *
 * CE QUI EMPECHAIT DE SIMPLEMENT LIRE LE CHAMP DU SERVEUR : cocher une serie
 * doit bouger le compteur IMMEDIATEMENT, sans aller-retour, hors ligne
 * compris. Lire `seance.avancement` aurait fige le compteur jusqu'au retour de
 * la requete — et l'application ne serait plus « exactement la meme ».
 *
 * LA SORTIE. Le serveur donne a chaque serie son POIDS dans le decompte : 1,
 * ou 0 pour les lignes d'un chrono au-dela de la premiere. L'ecran ne fait
 * plus qu'une ADDITION sur des donnees fournies — ce qui n'est pas une regle
 * metier, c'est de l'arithmetique. La regle du chrono ne vit plus que sur le
 * serveur, et le compteur reste instantane.
 */
final class PoidsDansLAvancementTest extends TestCase
{
    public function testUneSerieOrdinairePeseUN(): void
    {
        $seance = self::seance('charge', [true, false, true]);

        self::assertSame([1, 1, 1], self::poids($seance));
    }

    public function testSEULE_LA_PREMIERE_LIGNE_D_UN_CHRONO_PESE(): void
    {
        /* Un « for time » n'a qu'un temps total : ses lignes supplementaires
           ne sont pas des series a faire. */
        $seance = self::seance('chrono', [true, false, false]);

        self::assertSame([1, 0, 0], self::poids($seance));
    }

    public function testLE_MODE_DU_CATALOGUE_S_APPLIQUE_SANS_MODE_SUR_LA_LIGNE(): void
    {
        $seance = self::seance(null, [true, false, false], modeDefaut: 'chrono');

        self::assertSame([1, 0, 0], self::poids($seance));
    }

    public function testLE_MODE_DE_LA_LIGNE_L_EMPORTE(): void
    {
        /* Faire un exercice chrono a la charge un jour donne est un choix, et
           il doit etre respecte. */
        $seance = self::seance('charge', [true, true, false], modeDefaut: 'chrono');

        self::assertSame([1, 1, 1], self::poids($seance));
    }

    public function testSANS_MODE_NULLE_PART_TOUT_COMPTE(): void
    {
        /* Le repli est « charge », donc le decompte complet : mieux vaut
           annoncer trop a faire que trop peu. */
        $seance = self::seance(null, [true, false], modeDefaut: null);

        self::assertSame([1, 1], self::poids($seance));
    }

    /**
     * LE VERROU QUI REMPLACE LE FICHIER DE REGLES : l'ecran additionne les
     * poids, le serveur rend `avancement`, et les deux doivent coincider. Si
     * elles cessaient, le compteur de la liste et celui de l'ecran diraient
     * deux choses differentes — exactement ce que le double juge produisait.
     *
     * LES NOMBRES SONT ECRITS ICI, ET C'EST LE POINT. La premiere version de ce
     * test additionnait `getPoidsDansLAvancement()` a la main et comparait le
     * resultat a `getAvancement()` — c'est-a-dire qu'elle reecrivait la boucle
     * qu'elle pretendait garder. Elle passait au vert avec les deux methodes
     * rendant zero partout : `0 === 0`. Motif 4 du projet, releve le
     * 21 septembre 2026. Avec des litteraux, une regle qui change fait tomber
     * le cas en le nommant.
     *
     * @param list<int>                      $poidsAttendus
     * @param array{faites: int, total: int} $avancementAttendu
     */
    #[DataProvider('formesDeSeance')]
    public function testLA_SOMME_DES_POIDS_EST_EXACTEMENT_L_AVANCEMENT(
        Seance $seance,
        array $poidsAttendus,
        array $avancementAttendu,
    ): void {
        self::assertSame($poidsAttendus, self::poids($seance),
            'le poids de chaque serie, tel que l\'ecran le recoit');

        self::assertSame($avancementAttendu, $seance->getAvancement(),
            'l\'avancement rendu par le serveur pour la liste des seances');

        /* Et la propriete elle-meme, maintenant qu'aucun des deux cotes ne peut
           etre vide sans faire tomber une assertion ci-dessus. */
        $faites = 0;
        foreach ($seance->getExercices() as $bloc) {
            foreach ($bloc->getSeries() as $serie) {
                $faites += $serie->isFaite() ? $serie->getPoidsDansLAvancement() : 0;
            }
        }

        self::assertSame(\array_sum($poidsAttendus), $avancementAttendu['total']);
        self::assertSame($faites, $avancementAttendu['faites']);
    }

    /** @return iterable<string, array{Seance, list<int>, array{faites: int, total: int}}> */
    public static function formesDeSeance(): iterable
    {
        $melange = new Seance();
        $melange->addExercice(self::exercice('chrono', [true, false, false, false]));
        $melange->addExercice(self::exercice('charge', [true, true, false]));

        yield 'un chrono entame et un exercice a la charge' => [
            $melange, [1, 0, 0, 0, 1, 1, 1], ['faites' => 3, 'total' => 4],
        ];

        /* LE CAS QUI DEPARTAGE « la premiere serie decide » de « n'importe
           laquelle decide ». L'ancien front faisait `series.slice(0, 1)` : une
           deuxieme ligne cochee ne rattrape PAS une premiere qui ne l'est
           pas. Mesure sur la vraie route le 21 septembre 2026, avec les lignes
           ecrites a l'envers en base : 0 sur 1. */
        yield 'un chrono dont seule la deuxieme ligne est cochee' => [
            self::seance('chrono', [false, true]), [1, 0], ['faites' => 0, 'total' => 1],
        ];

        yield 'un chrono entierement fait' => [
            self::seance('chrono', [true, true]), [1, 0], ['faites' => 1, 'total' => 1],
        ];

        /* Une seance sans la moindre ligne rend 0 sur 0, et non une division
           par zero ni un « 1 sur 1 » invente. */
        yield 'un bloc encore vide' => [
            self::seance('chrono', []), [], ['faites' => 0, 'total' => 0],
        ];
    }

    public function testUNE_SERIE_SANS_BLOC_PESE_UN(): void
    {
        /* Le repli du `null` : une serie detachee — construite en memoire, pas
           encore rattachee — ne peut pas savoir si son bloc est un chrono. Elle
           compte donc pour une, comme le repli « charge » ailleurs : mieux vaut
           annoncer trop a faire que trop peu.
           Sans ce cas, remplacer le `null ===` par un `?->` silencieux rendrait
           zero et ne ferait tomber aucun autre test. */
        $serie = (new Serie())->setOrdre(0)->setFaite(true);

        self::assertNull($serie->getSeanceExercice());
        self::assertSame(1, $serie->getPoidsDansLAvancement());
    }

    public function testUNE_NOUVELLE_SERIE_PESE_UN_SUR_UN_BLOC_ORDINAIRE(): void
    {
        /* L'ecran garde un etat local : une serie qu'on vient d'ajouter n'a pas
           encore de poids rendu par le serveur, et le compteur doit pourtant
           bouger tout de suite. Sans ce champ, l'ecran devrait DEDUIRE — donc
           reecrire la regle du chrono. */
        $bloc = self::exercice('charge', [true, false]);

        self::assertSame(1, $bloc->getPoidsDUneNouvelleSerie());
    }

    public function testMAIS_ZERO_SUR_UN_CHRONO_QUI_A_DEJA_SA_SERIE(): void
    {
        $bloc = self::exercice('chrono', [true]);

        self::assertSame(0, $bloc->getPoidsDUneNouvelleSerie());
    }

    public function testET_UN_SUR_UN_CHRONO_ENCORE_VIDE(): void
    {
        /* LE TEMOIN : la toute premiere ligne d'un chrono compte, elle. Sans ce
           cas, rendre toujours zero sur un chrono passerait le test ci-dessus
           et ferait afficher « 0 sur 0 » sur un for time qu'on vient de poser. */
        $bloc = self::exercice('chrono', []);

        self::assertSame(1, $bloc->getPoidsDUneNouvelleSerie());
    }

    // ----------------------------------------------------------------- outils

    /** @param list<bool> $faites */
    private static function seance(?string $mode, array $faites, ?string $modeDefaut = 'charge'): Seance
    {
        $seance = new Seance();
        $seance->addExercice(self::exercice($mode, $faites, $modeDefaut));

        return $seance;
    }

    /** @param list<bool> $faites */
    private static function exercice(?string $mode, array $faites, ?string $modeDefaut = 'charge'): SeanceExercice
    {
        $bloc = (new SeanceExercice())->setOrdre(0)->setMode($mode);

        if (null !== $modeDefaut) {
            $bloc->setExercice((new Exercice())->setModeDefaut($modeDefaut));
        }

        foreach ($faites as $ordre => $fait) {
            $bloc->addSery((new Serie())->setOrdre($ordre)->setFaite($fait));
        }

        return $bloc;
    }

    /** @return list<int> */
    private static function poids(Seance $seance): array
    {
        $out = [];
        foreach ($seance->getExercices() as $bloc) {
            foreach ($bloc->getSeries() as $serie) {
                $out[] = $serie->getPoidsDansLAvancement();
            }
        }

        return $out;
    }
}
