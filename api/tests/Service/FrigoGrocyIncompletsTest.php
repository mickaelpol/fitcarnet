<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\FrigoGrocy;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

/**
 * UN PRODUIT GROCY NE DISPARAIT PLUS PARCE QU'IL LUI MANQUE SES MACROS.
 *
 * Releve par le proprietaire du projet le 19 septembre 2026, sur son frigo
 * reel : « pourquoi les flageolet rouge n'apparaissent toujours pas dans mon
 * frigo ? […] je veux que TOUS mes aliments apparaissent dans mon frigo ».
 *
 * `lire()` ecartait purement ces produits (`$manquants` -> `continue`), en se
 * contentant d'une ligne de journal. Consequence : le produit etait invisible
 * dans la liste, ET `creerProduit()` refusait de le recreer puisqu'il existait
 * deja. L'application refusait a la fois de le montrer et de le creer.
 *
 * `lireTout()` les rend desormais A PART, avec ce qu'il faut pour les afficher
 * dans la meme liste : stock, emplacement, unite, et ce qui leur manque.
 *
 * POURQUOI A PART ET NON MELANGES. Un produit sans `kcal100` n'a pas de
 * kcal100 : lui en inventer une — zero, par exemple — serait un chiffre faux
 * dans une application de nutrition (regles 6 et 7). `AlimentDisponible` garde
 * donc ses valeurs obligatoires, et le calculateur ne peut PAS voir ces
 * produits, meme par accident. L'ecran, lui, les affiche et dit ce qui manque.
 *
 * ET SANS UN SEUL APPEL GROCY DE PLUS : `lire()` demandait deja les produits,
 * le stock, les emplacements, les unites et les conversions. Les incomplets
 * sortent des memes cinq reponses. L'en-tete de `lire()` explique pourquoi ces
 * cinq appels sont sequentiels et ce que couterait d'en ajouter.
 */
final class FrigoGrocyIncompletsTest extends TestCase
{
    public function testUnProduitSansMacrosEstRenduAPartAvecSonStock(): void
    {
        $tout = self::grocy()->lireTout();

        self::assertCount(1, $tout['aliments'], 'seul le produit complet est utilisable');
        self::assertSame('Riz basmati', $tout['aliments'][0]->nom);

        self::assertCount(1, $tout['incomplets'],
            'le produit sans macros doit etre RENDU, pas jete');

        $flageolet = $tout['incomplets'][0];
        self::assertSame('Flageolet rouge', $flageolet['nom']);
        self::assertSame('grocy:7', $flageolet['reference']);
        self::assertSame(0.0, $flageolet['stock'],
            'un stock a zero est une information, pas une raison de cacher la ligne');
        self::assertSame('Placard', $flageolet['emplacement'],
            'sans emplacement, la ligne ne peut pas se ranger dans la bonne section');
        self::assertSame('g', $flageolet['unite']);
    }

    /**
     * CE QUI MANQUE EST NOMME, dans l'ordre de la liste de reference.
     *
     * Sans ces noms, l'ecran ne peut dire que « il manque quelque chose » —
     * et la personne doit ouvrir Grocy pour deviner quoi.
     */
    public function testCeQuiManqueEstNomme(): void
    {
        $manquants = self::grocy()->lireTout()['incomplets'][0]['manquants'];

        self::assertSame(['kcal100', 'prot100', 'gluc100', 'lip100'], \array_values($manquants));
    }

    /**
     * LE TEMOIN. Un `lireTout()` qui rangerait TOUT dans `incomplets` passerait
     * les deux tests ci-dessus tout en vidant le calculateur.
     */
    public function testUnProduitCompletNEstJamaisRangeParmiLesIncomplets(): void
    {
        $tout = self::grocy()->lireTout();

        foreach ($tout['incomplets'] as $i) {
            self::assertNotSame('Riz basmati', $i['nom'],
                'un produit complet doit rester un aliment utilisable');
        }

        self::assertSame(350.0, $tout['aliments'][0]->kcal100);
        self::assertSame(1500.0, $tout['aliments'][0]->stock);
    }

    /** `lire()` garde son contrat : les aliments utilisables, et eux seuls. */
    public function testLireNeRendToujoursQueLesAlimentsUtilisables(): void
    {
        $aliments = self::grocy()->lire();

        self::assertCount(1, $aliments);
        self::assertSame('Riz basmati', $aliments[0]->nom);
    }

    // ---------------------------------------------------------------- outils

    private static function grocy(): FrigoGrocy
    {
        $client = new MockHttpClient(
            static function (string $methode, string $url): MockResponse {
                $chemin = \str_replace('/api', '', (string) (\parse_url($url, \PHP_URL_PATH) ?? ''));

                return new MockResponse(\json_encode(match ($chemin) {
                    '/objects/products' => [
                        [
                            'id' => 4, 'name' => 'Riz basmati', 'location_id' => 3,
                            'qu_id_stock' => 2,
                            'userfields' => [
                                'cat' => 'fec', 'kcal100' => '350', 'prot100' => '7',
                                'gluc100' => '78', 'lip100' => '0.6', 'ratio' => '2.26',
                                'fibres100' => '1.4',
                            ],
                        ],
                        [
                            /* Le cas reel : la categorie et le rendement sont la,
                               les macros non. Il existe dans Grocy, il a un
                               emplacement, et il n'apparaissait nulle part. */
                            'id' => 7, 'name' => 'Flageolet rouge', 'location_id' => 3,
                            'qu_id_stock' => 2,
                            'userfields' => ['cat' => 'fec', 'ratio' => '2.1'],
                        ],
                    ],
                    '/stock' => [['product_id' => 4, 'amount' => 1500]],
                    '/objects/locations' => [['id' => 3, 'name' => 'Placard']],
                    '/objects/quantity_units' => [['id' => 2, 'name' => 'g']],
                    '/objects/quantity_unit_conversions_resolved' => [],
                    default => [],
                }));
            });

        return new FrigoGrocy($client, new NullLogger(), 'https://grocy.test', 'cle');
    }
}
