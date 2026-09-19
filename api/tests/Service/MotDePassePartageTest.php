<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\MotDePasse;
use PHPUnit\Framework\TestCase;

/**
 * LE VERROU ENTRE LES DEUX JUGES DU MOT DE PASSE.
 *
 * L'API REFUSE l'enregistrement, le front AFFICHE une jauge. Deux codes
 * repondent donc a la meme question — « ce mot de passe convient-il ? » — dans
 * deux langages. Chacun serait correctement teste de son cote, et c'est
 * exactement ce qui rendrait une divergence invisible : les deux suites
 * resteraient vertes en se contredisant, pendant que quelqu'un voit « solide »
 * en vert et se fait refuser a l'envoi.
 *
 * Ce fichier et son jumeau `front/src/calcul/motDePassePartage.test.ts` lisent
 * LE MEME fichier, `api/regles/motdepasse.json`. Le jour ou l'un des deux juges
 * change d'avis sans l'autre, une des deux suites tombe en nommant le cas.
 *
 * C'est le dispositif de `rendement.json`, repris tel quel — il avait ete
 * invente pour le constat 04#7, ou deux juges du rendement divergeaient en
 * silence.
 */
final class MotDePassePartageTest extends TestCase
{
    /** @return array<string, array{string, bool, list<string>, string}> */
    public static function casPartages(): array
    {
        $cas = [];

        foreach (self::regles()['cas'] as $c) {
            /* Le mot de passe sert de NOM au cas : quand un test tombe, PHPUnit
               affiche « "Poireau3Tiede" » et on sait tout de suite lequel. */
            $nom = '' === $c['mot_de_passe'] ? '(vide)' : (string) $c['mot_de_passe'];
            $cas[$nom] = [
                (string) $c['mot_de_passe'],
                (bool) $c['accepte'],
                \array_map('strval', (array) $c['manque']),
                (string) $c['pourquoi'],
            ];
        }

        return $cas;
    }

    /**
     * @param list<string> $manque
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('casPartages')]
    public function testChaqueCasPartageEstJugeCommeLaListeLeDit(
        string $motDePasse,
        bool $accepte,
        array $manque,
        string $pourquoi,
    ): void {
        self::assertSame(
            $accepte, MotDePasse::acceptable($motDePasse),
            \sprintf(
                "api/regles/motdepasse.json dit que ce mot de passe %s (%s), l'API dit le contraire",
                $accepte ? 'convient' : 'ne convient pas',
                $pourquoi,
            ),
        );

        self::assertSame(
            $manque, MotDePasse::manquements($motDePasse),
            'Et il faut nommer EXACTEMENT ce qui manque, dans l\'ordre de la liste : '
            . "c'est ce que l'ecran affiche, et une exigence oubliee fait recommencer.",
        );
    }

    /**
     * La borne elle-meme, des deux cotes.
     *
     * Un cas de table peut passer par hasard. On eprouve donc le bord en tant
     * que tel, avec un mot de passe qui satisfait TOUT LE RESTE : seule la
     * longueur decide.
     */
    public function testLaLongueurMinimaleEstCelleDeLaListe(): void
    {
        $mini = (int) self::regles()['longueur_minimale'];

        /* « Aa1! » puis autant de « x » qu'il faut : les quatre familles sont
           presentes des le quatrieme caractere, donc la longueur est la seule
           variable. */
        $juste = 'Aa1!' . \str_repeat('x', $mini - 4);
        $trop = 'Aa1!' . \str_repeat('x', $mini - 5);

        self::assertSame($mini, \mb_strlen($juste));
        self::assertTrue(MotDePasse::acceptable($juste), 'La borne elle-meme doit etre acceptee.');
        self::assertFalse(MotDePasse::acceptable($trop), 'Un caractere de moins, et c\'est refuse.');
    }

    public function testLesCodesDExigenceSontCeuxDeLaListe(): void
    {
        /* SANS CE TEST, UN CODE RENOMME PASSERAIT INAPERCU : les cas de la
           table nomment `manque` par ces codes, et l'ecran les traduit en
           phrases. Trois endroits, un seul vocabulaire. */
        $attendus = \array_map(
            static fn (array $e): string => (string) $e['code'],
            (array) self::regles()['exigences'],
        );

        self::assertSame(
            $attendus, MotDePasse::manquements(''),
            'Un mot de passe vide manque TOUT : c\'est la facon la plus simple '
            . 'de lire la liste complete des exigences, dans l\'ordre.',
        );
    }

    /**
     * LES LIBELLES AFFICHES SONT CEUX DE LA LISTE PARTAGEE.
     *
     * Le champ `dit` avait l'air d'etre la source des textes d'ecran et ne
     * l'etait pas : aucune des deux suites ne le lisait, et les deux juges en
     * avaient deja derive. Releve en revue le 19 septembre 2026 — c'est la
     * forme douce du commentaire qui ment, une donnee qui se presente comme la
     * reference et que personne ne verifie.
     *
     * Ce que ca protege : l'ecran coche « une lettre majuscule » pendant que
     * le serveur refuse en disant autre chose, et la personne ne comprend pas
     * ce qu'on lui demande.
     */
    public function testLesLibellesAffichesSontCeuxDeLaListe(): void
    {
        foreach ((array) self::regles()['exigences'] as $exigence) {
            $code = (string) $exigence['code'];
            $dit = (string) $exigence['dit'];

            /* On n'atteint pas la table de traduction directement — elle est
               privee, et c'est bien. On passe par la phrase, qui est ce que la
               personne lit vraiment : un mot de passe a qui il ne manque QUE
               cette exigence-la doit la nommer mot pour mot. */
            $presque = self::motDePasseAuquelIlNeManqueQue($code);

            self::assertSame(
                [$code], MotDePasse::manquements($presque),
                \sprintf('Le temoin « %s » devait ne manquer que « %s ».', $presque, $code),
            );
            self::assertStringContainsString(
                $dit, (string) MotDePasse::pourquoiRefuse($presque),
                \sprintf(
                    'api/regles/motdepasse.json dit « %s » pour « %s » ; la phrase de l\'API ne le reprend pas.',
                    $dit, $code,
                ),
            );
        }
    }

    /**
     * « IL MANQUE 12 CARACTERES AU MINIMUM » SE LIT COMME « TAPES-EN 12 DE PLUS ».
     *
     * Releve le 19 septembre 2026 en relisant l'ecran : sur « Poireau3 », il
     * manque quatre caracteres, pas douze — mais la phrase enumere des
     * EXIGENCES, pas des quantites manquantes, et « il manque » leur donne le
     * sens d'un decompte. Quelqu'un qui tape quatre caracteres de plus et se
     * fait refuser une deuxieme fois ne cherche pas l'erreur dans la phrase :
     * il cherche un autre mot de passe, plus court, puis abandonne.
     *
     * C'est la regle 7 sur un texte plutot que sur un chiffre : mieux vaut ne
     * rien promettre que promettre faux.
     */
    public function testLaPhraseDeRefusEnonceUneExigenceEtNePrometPasUnDecompte(): void
    {
        $phrase = (string) MotDePasse::pourquoiRefuse('Poireau3');

        self::assertStringNotContainsString('Il manque', $phrase,
            'Cette tournure fait lire les exigences comme un nombre de caracteres a ajouter.');
        self::assertStringContainsString('12 caractères au minimum', $phrase);
        self::assertStringContainsString('un caractère spécial', $phrase);
    }

    /** Un mot de passe conforme, sauf sur l'exigence demandee. */
    private static function motDePasseAuquelIlNeManqueQue(string $code): string
    {
        return match ($code) {
            'longueur' => 'Ab1!x',
            'minuscule' => 'ABCDEF123456!',
            'majuscule' => 'abcdef123456!',
            'chiffre' => 'Abcdefghijk!',
            'special' => 'Abcdef1234567',
            default => '',
        };
    }

    /** @return array<string, mixed> */
    private static function regles(): array
    {
        $chemin = \dirname(__DIR__, 2) . '/regles/motdepasse.json';

        self::assertFileExists($chemin,
            'api/regles/motdepasse.json est la liste unique des regles : sans elle, '
            . 'les deux juges du mot de passe peuvent diverger en silence.');

        /** @var array<string, mixed> */
        return (array) \json_decode((string) \file_get_contents($chemin), true, flags: \JSON_THROW_ON_ERROR);
    }
}
