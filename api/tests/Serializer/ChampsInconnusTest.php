<?php

declare(strict_types=1);

namespace App\Tests\Serializer;

use App\Entity\Aliment;
use App\Entity\Exercice;
use App\Entity\Modele;
use App\Entity\Seance;
use App\Serializer\ChampsInconnus;
use PHPUnit\Framework\TestCase;

/**
 * UN CHAMP QUI N'EXISTE PAS EST UNE ERREUR, PAS UN SILENCE.
 *
 * LA PANNE, LE 15 SEPTEMBRE 2026. En retirant `Modele::$partage` (constat F-05,
 * le partage de modele n'existe plus), on a constate qu'un client qui envoyait
 * encore `{"partage": true}` recevait 201. API Platform ignore ce qu'il ne
 * connait pas : rien n'etait stocke, et l'appelant repartait convaincu d'avoir
 * partage son modele. Un 201 qui n'a pas fait ce qu'on lui demandait ment.
 *
 * LE REMEDE EVIDENT A ETE ESSAYE ET RETIRE LE MEME JOUR.
 * `allow_extra_attributes: false` refuse tout attribut hors du groupe
 * d'ECRITURE — donc aussi `id`, `creeLe` et les `@id` imbriques. Or le front
 * renvoie l'objet qu'il a lu, par construction (voir `avecIdentifiantSeance`) :
 * modifier une seance repondait 400. Il n'y avait rien a « nettoyer » cote front
 * pour autant : API Platform recree de toute facon les blocs et les series a
 * chaque ecriture, `@id` ou pas — verifie le 15 septembre 2026, sans perte de
 * champ. (Ce commentaire affirmait d'abord que les `@id` evitaient cette
 * recreation. C'etait faux, et la revue l'a releve.)
 *
 * LA DISTINCTION QUI TIENT : « n'existe pas » contre « ne s'ecrit pas ».
 * `partage` n'est plus une propriete de `Modele` : refus. `id`, `creeLe`,
 * `avancement` en sont, simplement en lecture : toleres, et ignores comme
 * avant. Les cles JSON-LD (`@id`, `@type`, `@context`) aussi.
 *
 * Tests sur les VRAIES entites, lues par reflexion : aucune base, aucun noyau.
 * Un champ renomme dans une entite fait tomber le test concerne, pas un double.
 */
final class ChampsInconnusTest extends TestCase
{
    private ChampsInconnus $champs;

    protected function setUp(): void
    {
        $this->champs = new ChampsInconnus();
    }

    public function testLeChampRetireEstRefuse(): void
    {
        self::assertSame(['partage'], $this->champs->inconnus(Modele::class, [
            'nom' => 'Push A', 'type' => 'Push', 'partage' => true, 'exercices' => [],
        ]));
    }

    /**
     * LE TEMOIN QUI COMPTE : un modele relu tel que l'API le rend, renvoye tel
     * quel. C'est exactement ce que fait `modeleEnEcriture` cote front. S'il
     * tombe, l'ecran des modeles ne peut plus rien enregistrer.
     */
    public function testUnModeleRelUTelQuelPasse(): void
    {
        self::assertSame([], $this->champs->inconnus(Modele::class, [
            '@context' => '/api/contexts/Modele',
            '@id' => '/api/modeles/12',
            '@type' => 'Modele',
            'id' => 12,
            'nom' => 'Rond-point',
            'type' => 'Push',
            'creeLe' => '2026-09-15T15:34:29+00:00',
            'exercices' => [[
                '@id' => '/api/modele_exercices/50',
                '@type' => 'ModeleExercice',
                'id' => 50,
                'exercice' => '/api/exercices/1',
                'ordre' => 0,
                'mode' => 'charge',
                'notes' => null,
                'series' => [[
                    '@id' => '/api/modele_series/135',
                    '@type' => 'ModeleSerie',
                    'id' => 135,
                    'ordre' => 0,
                    'repsCible' => 10,
                    'poidsCible' => '40',
                    'secondesCible' => null,
                ]],
            ]],
        ]));
    }

    /** Un champ inconnu cache dans une serie se nomme par son chemin complet. */
    public function testUnChampInconnuImbriqueEstRefuseAvecSonChemin(): void
    {
        self::assertSame(['exercices[0].series[1].charge'], $this->champs->inconnus(Modele::class, [
            'nom' => 'Push A',
            'exercices' => [[
                'exercice' => '/api/exercices/1',
                'series' => [
                    ['ordre' => 0, 'repsCible' => 10],
                    ['ordre' => 1, 'charge' => 40],
                ],
            ]],
        ]));
    }

    /**
     * Une propriete CALCULEE, exposee par un accesseur sans colonne : elle
     * revient avec l'objet lu, elle doit passer. `Seance::getAvancement()`,
     * `Exercice::getNomAffiche()`.
     *
     * L'EXEMPLE IMBRIQUE ETAIT `SeanceExercice::getRmEstime()`, retire le
     * 19 septembre 2026 — il portait une seconde ecriture d'Epley que personne
     * ne lisait. Ce test est tombe le jour du retrait, et c'est exactement ce
     * qu'on lui demande : une propriete calculee qui disparait devient un champ
     * INCONNU, donc un 400 sur toute ecriture qui la renvoie. Ici le front ne
     * la renvoyait plus non plus, mais le prochain retrait ne sera peut-etre
     * pas aussi propre.
     */
    public function testUneProprieteCalculeeRevenueDeLaLecturePasse(): void
    {
        self::assertSame([], $this->champs->inconnus(Seance::class, [
            'date' => '2026-09-15',
            'avancement' => ['faites' => 0, 'prevues' => 0],
            'exercices' => [[
                'exercice' => '/api/exercices/1',
                'series' => [],
            ]],
        ]));
        self::assertSame([], $this->champs->inconnus(Exercice::class, ['nomAffiche' => 'Développé couché']));
    }

    /**
     * ET LE TEMOIN DU TEST PRECEDENT : un champ qui n'existe VRAIMENT pas,
     * imbrique au meme endroit, doit bien etre nomme. Sans lui, le test
     * ci-dessus passerait aussi le jour ou `inconnus()` cesserait de descendre
     * dans `exercices[]` — il ne rendrait plus rien, jamais.
     */
    public function testUnChampCalculeDisparuEstBienSignale(): void
    {
        self::assertSame(['exercices[0].rmEstime'], $this->champs->inconnus(Seance::class, [
            'date' => '2026-09-15',
            'exercices' => [[
                'exercice' => '/api/exercices/1',
                'rmEstime' => 52.5,
                'series' => [],
            ]],
        ]));
    }

    /** Une relation ecrite par IRI est une chaine : on ne descend pas dedans. */
    public function testUneRelationParIriNEstPasExploree(): void
    {
        self::assertSame([], $this->champs->inconnus(Seance::class, [
            'modele' => '/api/modeles/3',
            'exercices' => [],
        ]));
    }

    /**
     * Le temoin de l'inverse sur une autre entite : sans lui, un controle qui
     * ne saurait lire que `Modele` passerait pour general.
     */
    public function testUnChampInconnuSurUnAlimentEstRefuse(): void
    {
        self::assertSame(['glucides'], $this->champs->inconnus(Aliment::class, [
            'nom' => 'Riz', 'kcal100' => '350', 'glucides' => '77',
        ]));
    }

    /**
     * Un corps LISTE n'est pas un objet : ses cles sont des rangs, pas des champs.
     *
     * La premiere version passait `[]` — qui ne boucle sur rien, avec ou sans la
     * garde `array_is_list`, donc un test qui ne pouvait pas echouer. Une liste
     * NON VIDE, elle, ferait rapporter le champ « 0 » sans la garde.
     */
    public function testUnCorpsListeNEstPasLuCommeDesChamps(): void
    {
        self::assertSame([], $this->champs->inconnus(Modele::class, [['partage' => true]]));
    }
}
