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
 *
 * MIS A JOUR LE 26 SEPTEMBRE 2026, feature `macros-editeur-vide-pas-zero`.
 * Trois changements de contrat :
 *  - une macro obligatoire VIDE (kcal100, prot100, gluc100, lip100) est
 *    desormais REFUSEE, avec le meme message que l'entite rendrait en 422
 *    (`Aliment::MACRO_ABSENTE`) — jusqu'ici on se taisait, et l'ecran
 *    promettait un bouton que le serveur refusait ensuite ;
 *  - les pesees (`peseeAvant`, `peseeApres`) sont lues ici : quand les deux
 *    sont presentes et lisibles, le rendement EFFECTIF vient d'elles, et le
 *    `ratio` envoye est ignore pour juger le sens de la cuisson ;
 *  - `ratioCandidat` en entree et `candidat` en sortie disparaissent : le
 *    bouton « utiliser ce resultat » de l'ecran se juge desormais avec
 *    `rendement`, la meme reponse que le reste de la fiche.
 */
final class VerdictAlimentTest extends TestCase
{
    /**
     * COPIE LITTERALE de `Aliment::MACRO_ABSENTE`, qui est `private` : y
     * referer directement declencherait une erreur fatale d'acces, laquelle
     * masquerait le vrai defaut que ces tests portent. Voir le rapport de la
     * fiche : il faudra sans doute rendre cette constante publique pour que
     * `VerdictAliment` puisse la reutiliser sans dupliquer le texte.
     */
    private const MACRO_ABSENTE = 'Valeur manquante : écris 0 si l’aliment n’en contient pas.';

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
           qu'afficher une phrase quelque part.

           ASSOUPLI LE 26 SEPTEMBRE 2026 : ce test verifiait `refus[0]`, une
           position. Depuis que les macros vides (ici prot100, gluc100,
           lip100, absentes) portent leur propre refus, l'ordre entre ce
           refus-la et celui du grain sec n'est pas un contrat — seul compte
           que kcal100 soit NOMME quelque part. */
        $v = self::rendu(['kcal100' => '130', 'categorie' => 'fec', 'ratio' => '2.26']);

        self::assertContains('kcal100', \array_column($v['refus'], 'champ'));
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

    public function testUN_NOMBRE_NEGATIF_EST_REFUSE_POUR_LA_BONNE_RAISON(): void
    {
        /* « -2 » EST parfaitement lisible : ce qui ne va pas, c'est le signe.
           Le serveur repondait pourtant « n'est pas un nombre lisible », et
           l'utilisateur cherchait une faute de frappe qui n'existait pas.
           Regle 7 du projet : un chiffre faux est pire qu'un refus, mais un
           refus doit dire la VRAIE raison. Releve le 21 septembre 2026. */
        $v = self::rendu(['kcal100' => '-2', 'categorie' => 'fec', 'ratio' => '1']);

        self::assertFalse($v['enregistrable']);

        /* AVEC L'ACCENT : c'est une phrase lue par quelqu'un, pas un
           commentaire PHP. La confusion entre les deux conventions a deja
           fait afficher « un feculent qui gonfle » a l'ecran. */
        $messages = \implode(' ', \array_column($v['refus'], 'message'));
        self::assertStringContainsString('négatif', $messages);
        self::assertStringNotContainsString('lisible', $messages,
            'le nombre est lisible : dire le contraire envoie chercher une '
            . 'faute de frappe inexistante');
    }

    public function testUNE_CATEGORIE_INCONNUE_EST_REFUSEE_PAR_L_ECRAN_AUSSI(): void
    {
        /* L'ECRAN NE DOIT JAMAIS PROMETTRE CE QUE LE SERVEUR REFUSERA.
           Mesure le 21 septembre 2026 : `categorie: "zzz"` rendait
           `enregistrable: true`, bouton allume — et `POST /api/aliments`
           repondait 422 (`Assert\Choice` sur `Aliment::CATEGORIES`).

           Inatteignable par l'interface, qui choisit dans une liste. Mais le
           but de la refonte est qu'un AUTRE front obtienne la meme reponse :
           s'il faut deja connaitre les huit categories pour ne pas se faire
           refuser, le verdict ne suffit pas, et le front doit rejuger. */
        $v = self::rendu(['kcal100' => '350', 'prot100' => '7', 'gluc100' => '78',
            'lip100' => '0.6', 'categorie' => 'zzz', 'ratio' => '1']);

        self::assertFalse($v['enregistrable']);
        self::assertStringContainsString('catégorie',
            \implode(' ', \array_column($v['refus'], 'message')));
    }

    public function testLES_HUIT_CATEGORIES_REELLES_PASSENT(): void
    {
        /* LE TEMOIN. Sans lui, un garde trop strict refuserait tout et
           passerait le test ci-dessus en rendant l'application inutilisable.
           On lit la liste de l'entite plutot que de la recopier : une neuvieme
           categorie ajoutee la-bas doit passer ici sans qu'on y pense. */
        foreach (\App\Entity\Aliment::CATEGORIES as $categorie) {
            $v = self::rendu(['kcal100' => '350', 'prot100' => '7', 'gluc100' => '78',
                'lip100' => '0.6', 'categorie' => $categorie, 'ratio' => '1']);

            self::assertSame([], $v['refus'], 'la categorie ' . $categorie . ' doit passer');
        }
    }

    public function testLE_ZERO_RESTE_ACCEPTE(): void
    {
        /* LE TEMOIN du cas ci-dessus. Un garde ecrit `<= 0` refuserait le zero,
           et « zero gramme de lipides » est une reponse parfaitement valide —
           regle 6 du projet : vide n'est pas zero, mais zero est un chiffre. */
        $v = self::rendu(['kcal100' => '350', 'prot100' => '7', 'gluc100' => '78',
            'lip100' => '0', 'categorie' => 'fec', 'ratio' => '2.26']);

        self::assertSame([], $v['refus']);
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
        /* REECRIT LE 26 SEPTEMBRE 2026 (feature `macros-editeur-vide-pas-zero`) :
           ce test disait jusqu'ici `refus === []`, et ce n'est plus vrai. Une
           macro obligatoire vide n'est plus une absence muette : le serveur la
           refuse desormais EXPLICITEMENT, avec le meme conseil que l'entite
           rendrait en 422 — sans quoi l'ecran allumait un bouton que le
           serveur aurait ensuite refuse (le meme jumeau oublie que la
           categorie inconnue, plus haut). Garder l'ancienne assertion aurait
           fige la mauvaise regle : la fiche la contredit a la lettre. */
        $v = self::rendu(['categorie' => 'fec', 'ratio' => '1']);

        self::assertFalse($v['enregistrable']);
        self::assertCount(4, $v['refus'], 'les quatre macros obligatoires sont vides');
        foreach (['kcal100', 'prot100', 'gluc100', 'lip100'] as $champ) {
            self::assertContains(['champ' => $champ, 'message' => self::MACRO_ABSENTE], $v['refus']);
        }
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
        /* DEUX REFUS PARLENT ICI, et c'est juste : `AnomaliesAliment` dit
           « un feculent absorbe de l'eau » sur les valeurs, et
           `RendementPlausible` refuse l'ECRITURE de ce rendement. On verifie
           que le champ `ratio` est bien nomme — l'ecran doit pouvoir le
           souligner — sans exiger qu'il parle en premier. */
        self::assertContains('ratio', \array_column($v['refus'], 'champ'),
            'le rendement doit etre nomme comme champ fautif');
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

    public function testON_PEUT_RENOMMER_UN_ALIMENT_DEJA_INCOHERENT(): void
    {
        /* RELEVE PAR `revue-pile` LE 20 SEPTEMBRE 2026, et c'est une
           REGRESSION que j'avais introduite le jour meme.
           
           L'entite laisse passer un `PATCH` sur un aliment deja incoherent en
           base — migre avant que la regle existe — pour qu'on puisse au moins
           le renommer. La route de verdict, elle, ne recevait que les champs
           TAPES : elle n'avait aucun moyen de savoir « ce qui etait deja la »,
           repondait `enregistrable: false`, et l'ecran eteignait le bouton.
           
           Le serveur autorisait donc l'ecriture que l'ecran interdisait. Le
           jumeau oublie, entre deux portes du MEME serveur.
           
           LA SAISIE PORTE DESORMAIS SON ORIGINE. Pas d'identifiant, pas de
           lecture en base : l'ecran dit « voila ce qui etait stocke, voila ce
           que je tape ». La route n'a toujours rien a lire, et la regle 2 n'a
           pas de nouveau chemin a garder. Un client qui mentirait sur son
           origine n'obtiendrait qu'un bouton allume, puis un 422 — l'entite
           reste la seule vraie porte. */
        $incoherent = ['categorie' => 'fec', 'kcal100' => '130', 'prot100' => '2.7',
            'gluc100' => '28', 'lip100' => '0.3', 'ratio' => '2.26'];

        self::assertFalse(VerdictAliment::pour($incoherent)['enregistrable'],
            'une CREATION incoherente reste refusee');

        $avecOrigine = $incoherent + ['origine' => $incoherent];

        self::assertTrue(VerdictAliment::pour($avecOrigine)['enregistrable'],
            'la meme fiche, deja en base ainsi, doit pouvoir etre renommee');
        self::assertSame([], VerdictAliment::pour($avecOrigine)['refus'],
            'et sans reproche : on ne l\'a pas aggravee');
    }

    public function testMAIS_AGGRAVER_RESTE_REFUSE(): void
    {
        /* LE TEMOIN. Sans lui, porter son origine deviendrait un permis de
           tout ecrire — il suffirait d'envoyer n'importe quoi en origine. */
        $origine = ['categorie' => 'fec', 'kcal100' => '130', 'prot100' => '2.7',
            'gluc100' => '28', 'lip100' => '0.3', 'ratio' => '2.26'];

        /* Meme fiche, mais on ajoute une matiere impossible : motif NOUVEAU. */
        $pire = ['categorie' => 'fec', 'kcal100' => '130', 'prot100' => '60',
            'gluc100' => '60', 'lip100' => '0.3', 'ratio' => '2.26',
            'origine' => $origine];

        self::assertFalse(VerdictAliment::pour($pire)['enregistrable']);
        self::assertNotSame([], VerdictAliment::pour($pire)['refus']);
    }

    public function testCORRIGER_RESTE_POSSIBLE(): void
    {
        /* Le cas le plus important des trois : la correction doit passer,
           sinon la regle enfermerait les lignes qu'elle denonce. */
        $origine = ['categorie' => 'fec', 'kcal100' => '130', 'prot100' => '2.7',
            'gluc100' => '28', 'lip100' => '0.3', 'ratio' => '2.26'];

        $corrige = ['categorie' => 'fec', 'kcal100' => '350', 'prot100' => '7',
            'gluc100' => '78', 'lip100' => '0.6', 'ratio' => '2.26',
            'origine' => $origine];

        self::assertTrue(VerdictAliment::pour($corrige)['enregistrable']);
    }

    // ------------------------------------------- macros obligatoires vides

    public function testMacroObligatoireVideEstRefuseeSurSonChamp(): void
    {
        // CA-1
        $v = self::rendu(['kcal100' => '350', 'prot100' => '', 'gluc100' => '78',
            'lip100' => '0,6', 'categorie' => 'fec', 'ratio' => '2,26']);

        self::assertSame([['champ' => 'prot100', 'message' => self::MACRO_ABSENTE]], $v['refus']);
        self::assertFalse($v['enregistrable']);
    }

    public function testLE_TEMOIN_UNE_PROTEINE_SAISIE_NE_SE_FAIT_PAS_REPROCHER(): void
    {
        // CA-1 (témoin)
        $v = self::rendu(['kcal100' => '350', 'prot100' => '7', 'gluc100' => '78',
            'lip100' => '0,6', 'categorie' => 'fec', 'ratio' => '2,26']);

        self::assertNotContains('prot100', \array_column($v['refus'], 'champ'));
    }

    public function testProt100NullDonneLeMemeRefusQueVide(): void
    {
        // CA-R2
        $avecVide = self::rendu(['kcal100' => '350', 'prot100' => '', 'gluc100' => '78',
            'lip100' => '0,6', 'categorie' => 'fec', 'ratio' => '2,26']);
        $avecNull = self::rendu(['kcal100' => '350', 'prot100' => null, 'gluc100' => '78',
            'lip100' => '0,6', 'categorie' => 'fec', 'ratio' => '2,26']);

        self::assertSame($avecVide['refus'], $avecNull['refus']);
        self::assertSame([['champ' => 'prot100', 'message' => self::MACRO_ABSENTE]], $avecNull['refus']);
    }

    public function testUnNombreAVirgulesMultiplesEstRefuseAvecSonMessage(): void
    {
        // CA-4
        $v = self::rendu(['prot100' => '4,2,1', 'categorie' => 'fec', 'ratio' => '1']);

        self::assertContains(
            ['champ' => 'prot100', 'message' => '« 4,2,1 » n\'est pas un nombre lisible.'],
            $v['refus']);
    }

    public function testLE_TEMOIN_UN_NOMBRE_A_UNE_SEULE_VIRGULE_EST_LISIBLE(): void
    {
        // CA-4 (témoin)
        $v = self::rendu(['kcal100' => '350', 'prot100' => '4,2', 'gluc100' => '78',
            'lip100' => '0,6', 'categorie' => 'fec', 'ratio' => '2,26']);

        self::assertNotContains('prot100', \array_column($v['refus'], 'champ'));
    }

    // ------------------------------------------------------------ rendement

    public function testLeRendementSeCalculeDepuisLesDeuxPesees(): void
    {
        // CA-7
        $v = self::rendu(['peseeAvant' => '100', 'peseeApres' => '230',
            'ratio' => '1', 'categorie' => 'fec']);

        self::assertArrayHasKey('rendement', $v);
        self::assertEqualsWithDelta(2.3, $v['rendement']['valeur'], 0.001);
        self::assertSame('100 g avant cuisson donnent 230 g une fois cuits.',
            $v['rendement']['explication']);
        self::assertSame('mesuré : 100 g avant cuisson → 230 g après',
            $v['rendement']['provenance']);
    }

    public function testLE_TEMOIN_SANS_PESEES_LE_RENDEMENT_VIENT_DU_RATIO_SAISI(): void
    {
        // CA-7 (témoin)
        $v = self::rendu(['ratio' => '2,26', 'categorie' => 'fec']);

        self::assertArrayHasKey('rendement', $v);
        self::assertEqualsWithDelta(2.26, $v['rendement']['valeur'], 0.001);
        self::assertNull($v['rendement']['provenance']);
    }

    public function testUnePeseeSeuleEstRefuseeSurLAutre(): void
    {
        // CA-7
        $avecAvantSeul = self::rendu(['peseeAvant' => '100', 'categorie' => 'fec', 'ratio' => '1']);
        self::assertContains(
            ['champ' => 'peseeApres', 'message' => 'Il manque la pesée après cuisson.'],
            $avecAvantSeul['refus']);

        $avecApresSeul = self::rendu(['peseeApres' => '230', 'categorie' => 'fec', 'ratio' => '1']);
        self::assertContains(
            ['champ' => 'peseeAvant', 'message' => 'Il manque la pesée avant cuisson.'],
            $avecApresSeul['refus']);
    }

    public function testUnePeseeIllisibleEstRefuseeSurSonChamp(): void
    {
        // CA-7
        $v = self::rendu(['peseeAvant' => 'abc', 'peseeApres' => '230',
            'categorie' => 'fec', 'ratio' => '1']);

        self::assertContains('peseeAvant', \array_column($v['refus'], 'champ'));
    }

    public function testUnePeseeNulleOuNegativeEstRefuseeSurSonChamp(): void
    {
        // CA-7
        $nulle = self::rendu(['peseeAvant' => '0', 'peseeApres' => '230',
            'categorie' => 'fec', 'ratio' => '1']);
        self::assertContains('peseeAvant', \array_column($nulle['refus'], 'champ'));

        $negative = self::rendu(['peseeAvant' => '-5', 'peseeApres' => '230',
            'categorie' => 'fec', 'ratio' => '1']);
        self::assertContains('peseeAvant', \array_column($negative['refus'], 'champ'));
    }

    public function testDesPeseesInverseesSurUnFeculentSontRefusees(): void
    {
        // CA-7
        $v = self::rendu(['peseeAvant' => '230', 'peseeApres' => '100',
            'categorie' => 'fec', 'ratio' => '1']);

        self::assertContains('ratio', \array_column($v['refus'], 'champ'));
    }

    public function testLeRatioSaisiEstIgnoreQuandDesPeseesSontPresentes(): void
    {
        // CA-7
        $v = self::rendu(['peseeAvant' => '100', 'peseeApres' => '230',
            'ratio' => '0,5', 'categorie' => 'fec']);

        self::assertNotContains('ratio', \array_column($v['refus'], 'champ'),
            'le ratio effectif (2,3, mesure) doit etre juge, pas le 0,5 saisi');
    }

    public function testLE_TEMOIN_SANS_PESEES_LE_RATIO_SAISI_EST_BIEN_JUGE(): void
    {
        // CA-7 (témoin)
        $v = self::rendu(['ratio' => '0,5', 'categorie' => 'fec']);

        self::assertContains('ratio', \array_column($v['refus'], 'champ'));
    }

    // --------------------------------------------------------------- quantite

    public function testUneQuantiteIllisibleEstRefusee(): void
    {
        $v = self::rendu(['categorie' => 'fec', 'ratio' => '1', 'quantite' => 'abc']);

        self::assertContains('quantite', \array_column($v['refus'], 'champ'));
    }

    public function testLE_TEMOIN_UNE_QUANTITE_VIDE_N_EST_PAS_REFUSEE(): void
    {
        $v = self::rendu(['categorie' => 'fec', 'ratio' => '1', 'quantite' => '']);

        self::assertNotContains('quantite', \array_column($v['refus'], 'champ'));
    }

    public function testUneQuantiteNegativeEstRefusee(): void
    {
        $v = self::rendu(['categorie' => 'fec', 'ratio' => '1', 'quantite' => '-3']);

        self::assertContains('quantite', \array_column($v['refus'], 'champ'));
    }

    // -------------------------------------------------- disparition du candidat

    public function testLaCleCandidatNExistePlusEnSortie(): void
    {
        /* `ratioCandidat` en entree et `candidat` en sortie sont retires :
           le bouton « utiliser ce resultat » de l'ecran se juge desormais
           avec `rendement`, la meme reponse que le reste de la fiche. */
        $v = self::rendu(['kcal100' => '350', 'prot100' => '7', 'gluc100' => '78',
            'lip100' => '0,6', 'categorie' => 'fec', 'ratio' => '2,26']);

        self::assertFalse(\array_key_exists('candidat', $v));
    }

    // ----------------------------------------------------------------- outils

    /**
     * @param array<string, string> $saisie
     *
     * @return array{refus: list<array{champ: string, message: string}>,
     *               avertissements: list<array{champ: string, message: string}>,
     *               resume: string, verdict: string, enregistrable: bool,
     *               conversion: array{saisi: float, converti: float, motif: string}|null,
     *               rendement: array{valeur: float|null, explication: string|null,
     *                                provenance: string|null}}
     */
    private static function rendu(array $saisie): array
    {
        return VerdictAliment::pour($saisie);
    }
}
