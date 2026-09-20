<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\VerdictAliment;
use PHPUnit\Framework\TestCase;

/**
 * LE VERDICT COMPLET D'UN ALIMENT, RENDU PAR LE SERVEUR.
 *
 * DECISION DU 20 SEPTEMBRE 2026 : « tout doit passer par le serveur car le
 * metier doit etre sur le serveur et puis c'est tout, comme ca je peux changer
 * le front quand bon me semble ».
 *
 * Jusqu'ici l'ecran fabriquait lui-meme ses messages — `controler()` dans
 * `nutrition.ts` — et le serveur ne portait que les refus. Deux ecritures, donc
 * un fichier de regles pour les tenir. Desormais le serveur rend TOUT :
 * les refus, les avertissements, et les phrases exactes. L'ecran affiche.
 *
 * CE QUI CHANGE POUR UN FUTUR FRONT : il n'a plus rien a reimplementer. Un
 * ecran en Vite, en Flutter ou en natif envoie ce qui est saisi et affiche ce
 * qui revient.
 *
 * IL LIT AUSSI LES NOMBRES TAPES. « 12,5 » est un nombre, « 4,2,1 » n'en est
 * pas un — et c'etait encore une regle du front (`saisieNombre.ts`). La virgule
 * francaise, les espaces, l'illisible : tout cela se decide ici.
 */
final class VerdictAlimentTest extends TestCase
{
    public function testLeRizSecEstCoherentEtEnregistrable(): void
    {
        $v = self::rendu(['kcal100' => '350', 'prot100' => '7', 'gluc100' => '78',
            'lip100' => '0.6', 'fibres100' => '1.4', 'categorie' => 'fec', 'ratio' => '2.26']);

        self::assertSame([], $v['refus']);
        self::assertTrue($v['enregistrable']);
        self::assertStringContainsString('cohérentes', $v['resume']);
    }

    public function testLeRizCuitEstRefuseAvecSaRaison(): void
    {
        $v = self::rendu(['kcal100' => '130', 'prot100' => '2.7', 'gluc100' => '28',
            'lip100' => '0.3', 'categorie' => 'fec', 'ratio' => '2.26']);

        self::assertFalse($v['enregistrable']);
        self::assertStringContainsString('grain sec', \implode(' ', \array_column($v['refus'], 'message')));
    }

    public function testLeRefusArriveDES_LES_CALORIES(): void
    {
        /* Demande le 20 septembre : « je souhaite que l'avertissement soit
           affiche direct des qu'on a renseigne les macros ». Les calories, la
           categorie et le rendement suffisent a savoir — on ne fait pas saisir
           trois champs de plus pour l'apprendre. */
        $v = self::rendu(['kcal100' => '130', 'categorie' => 'fec', 'ratio' => '2.26']);

        self::assertNotSame([], $v['refus']);
        self::assertStringContainsString('grain sec', \implode(' ', \array_column($v['refus'], 'message')));
    }

    public function testLeChampFautifEstNOMME(): void
    {
        /* L'ecran doit pouvoir souligner. Sans le champ, il ne peut
           qu'afficher une phrase quelque part. */
        $v = self::rendu(['kcal100' => '130', 'categorie' => 'fec', 'ratio' => '2.26']);

        self::assertSame('kcal100', $v['refus'][0]['champ']);
    }

    public function testUnEcartDeCaloriesAVERTIT_SANS_REFUSER(): void
    {
        /* 34 aliments reels de l'Anses ont un ecart legitime — les alcools,
           les polyols. On le DIT, on ne l'interdit pas. Arbitre le
           20 septembre, chiffres a l'appui. */
        $v = self::rendu(['kcal100' => '250', 'prot100' => '0', 'gluc100' => '0',
            'lip100' => '0', 'categorie' => 'autre', 'ratio' => '1']);

        self::assertSame([], $v['refus'], 'un ecart de calories ne se refuse pas');
        self::assertTrue($v['enregistrable']);
        self::assertNotSame([], $v['avertissements']);
    }

    public function testSANS_FIBRES_LE_CONTROLE_LE_DIT(): void
    {
        $v = self::rendu(['kcal100' => '165', 'prot100' => '31', 'gluc100' => '0',
            'lip100' => '3.6', 'categorie' => 'prot', 'ratio' => '1']);

        self::assertStringContainsString('approximatif', $v['resume']);
    }

    public function testUNE_SAISIE_ILLISIBLE_NE_DEVIENT_PAS_UN_NOMBRE(): void
    {
        /* « 4,2,1 » se lisait 4,2 avec `parseFloat` : un stock invente. La
           lecture des nombres tapes appartient desormais au serveur, virgule
           francaise comprise. */
        $v = self::rendu(['kcal100' => '4,2,1', 'categorie' => 'fec', 'ratio' => '2.26']);

        self::assertFalse($v['enregistrable']);
        self::assertStringContainsString('lisible', \implode(' ', \array_column($v['refus'], 'message')));
    }

    public function testLA_VIRGULE_FRANCAISE_EST_UN_NOMBRE(): void
    {
        /* LE TEMOIN. Sans lui, un serveur qui refuserait toute virgule
           passerait le test ci-dessus tout en rendant l'application
           inutilisable sur un clavier francais. */
        $v = self::rendu(['kcal100' => '350', 'prot100' => '7', 'gluc100' => '78',
            'lip100' => '0,6', 'fibres100' => '1,4', 'categorie' => 'fec', 'ratio' => '2,26']);

        self::assertSame([], $v['refus']);
        self::assertTrue($v['enregistrable']);
    }

    public function testUN_CHAMP_VIDE_N_EST_PAS_UN_ZERO(): void
    {
        /* Regle 6. Un aliment en cours de saisie n'est pas enregistrable, mais
           il n'est pas FAUX non plus : on ne lui reproche rien. */
        $v = self::rendu(['categorie' => 'fec', 'ratio' => '1']);

        self::assertFalse($v['enregistrable']);
        self::assertSame([], $v['refus'], 'une absence n\'est pas une erreur');
    }

    public function testON_NE_COMPARE_PAS_A_DES_MACROS_PAS_ENCORE_SAISIES(): void
    {
        /* RELEVE EN EPROUVANT LA ROUTE PAR HTTP, le 20 septembre 2026 : avec
           les seules calories, elle repondait « le calcul donne 0 calories
           contre 130 annoncees ». C'est vrai et c'est du bruit — on n'a rien a
           comparer tant que les trois macros ne sont pas la.

           Le refus, lui, continue de parler : la regle du grain sec n'a pas
           besoin des macros, et c'est justement ce qu'on voulait. */
        $v = self::rendu(['kcal100' => '130', 'categorie' => 'fec', 'ratio' => '2.26']);

        self::assertSame([], $v['avertissements'],
            'rien a comparer tant que les macros ne sont pas saisies');
        self::assertNotSame([], $v['refus'], 'le refus, lui, doit parler');
    }

    public function testMAIS_DES_QUE_LES_TROIS_MACROS_SONT_LA_ON_COMPARE(): void
    {
        /* LE TEMOIN : sans ce cas, se taire toujours passerait le test
           ci-dessus tout en supprimant l'avertissement pour de bon. */
        $v = self::rendu(['kcal100' => '250', 'prot100' => '0', 'gluc100' => '0',
            'lip100' => '0', 'categorie' => 'autre', 'ratio' => '1']);

        self::assertNotSame([], $v['avertissements']);
    }

    public function testLA_CONVERSION_DES_KILOJOULES_EST_PROPOSEE(): void
    {
        /* L'ecran offrait un bouton « convertir » dans une bande jaune. Cette
           refonte ne doit RIEN changer de visible : le serveur rend donc la
           valeur convertie, et l'ecran garde son bouton. */
        /* SOUS LE PLAFOND DE 900, sinon c'est l'autre detection qui repond —
           et c'est l'ordre du front, qu'on ne change pas. Macros a 158 kcal
           par Atwater, annoncees 661 : soit 4,184 fois. */
        $v = self::rendu(['kcal100' => '661', 'prot100' => '10', 'gluc100' => '25',
            'lip100' => '2', 'fibres100' => '0', 'categorie' => 'autre', 'ratio' => '1']);

        self::assertNotNull($v['conversion']);
        self::assertSame('rapport', $v['conversion']['motif']);
        self::assertEqualsWithDelta(158.0, $v['conversion']['converti'], 1.0);
    }

    public function testLE_PLAFOND_MARCHE_SANS_MACROS(): void
    {
        /* Rien n'est plus dense que la matiere grasse pure : 9 kcal/g. Cette
           detection-la fonctionne avant meme que les macros soient saisies. */
        $v = self::rendu(['kcal100' => '1465', 'categorie' => 'autre', 'ratio' => '1']);

        self::assertNotNull($v['conversion']);
        self::assertSame('plafond', $v['conversion']['motif']);
    }

    public function testLE_TEMOIN_UNE_HUILE_NE_DECLENCHE_RIEN(): void
    {
        /* 900 kcal pour 100 g d'huile est exact, et ses macros le confirment.
           Sans ce cas, une proposition permanente passerait les deux tests
           ci-dessus en criant sur chaque aliment juste. */
        $v = self::rendu(['kcal100' => '900', 'prot100' => '0', 'gluc100' => '0',
            'lip100' => '100', 'categorie' => 'huile', 'ratio' => '1']);

        self::assertNull($v['conversion']);
    }

    public function testLE_VERDICT_NOMME_LA_COULEUR_DU_BANDEAU(): void
    {
        /* La teinte est une DECISION — « ces valeurs se tiennent-elles ? » —
           pas un style. L'ecran la traduit, il ne la decide plus. */
        self::assertSame('coherent', self::rendu(['kcal100' => '350', 'prot100' => '7',
            'gluc100' => '78', 'lip100' => '0.6', 'fibres100' => '1.4',
            'categorie' => 'fec', 'ratio' => '2.26'])['verdict']);

        self::assertSame('indecidable', self::rendu(['categorie' => 'fec'])['verdict']);

        self::assertSame('incoherent', self::rendu(['kcal100' => '100', 'prot100' => '50',
            'gluc100' => '0', 'lip100' => '0', 'fibres100' => '0',
            'categorie' => 'prot', 'ratio' => '1'])['verdict']);
    }

    public function testLE_SENS_DU_RENDEMENT_EST_JUGE_PAR_LE_SERVEUR(): void
    {
        /* Un feculent qui RETRECIT en cuisant : une pesee a l'envers. L'ecran
           le jugeait lui-meme (`rendementPossible`), l'entite aussi — deux
           ecritures tenues par `rendement.json`. L'ecran cesse de juger. */
        $v = self::rendu(['kcal100' => '350', 'prot100' => '7', 'gluc100' => '78',
            'lip100' => '0.6', 'fibres100' => '1.4', 'categorie' => 'fec', 'ratio' => '0.8']);

        self::assertFalse($v['enregistrable']);
        self::assertSame('ratio', $v['refus'][0]['champ'],
            'le champ fautif est le rendement, pas les calories');
    }

    public function testLE_TEMOIN_UN_RENDEMENT_NORMAL_PASSE(): void
    {
        /* Sans ce cas, refuser tout rendement passerait le test ci-dessus en
           rendant l'application inutilisable. L'epinard perd de l'eau : 0,32
           est une vraie mesure, et elle doit entrer. */
        $v = self::rendu(['kcal100' => '35', 'prot100' => '2.8', 'gluc100' => '3.6',
            'lip100' => '0.4', 'fibres100' => '2.6', 'categorie' => 'leg', 'ratio' => '0.32']);

        self::assertSame([], $v['refus']);
        self::assertTrue($v['enregistrable']);
    }

    // ----------------------------------------------------------------- outils

    /**
     * @param array<string, string> $saisie
     *
     * @return array{refus: list<array{champ: string, message: string}>,
     *               avertissements: list<array{champ: string, message: string}>,
     *               resume: string, verdict: string, enregistrable: bool,
     *               conversion: array{saisi: float, converti: float, motif: string}|null,
     *               candidat: array{acceptable: bool, motif: string|null}|null}
     */
    private static function rendu(array $saisie): array
    {
        return VerdictAliment::pour($saisie);
    }
}
