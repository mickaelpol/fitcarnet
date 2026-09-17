<?php

declare(strict_types=1);

namespace App\Tests\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use App\Entity\Stock;
use PHPUnit\Framework\TestCase;

/**
 * LE STOCK NE S'ÉCRIT QUE PAR `/api/mon-frigo`.
 *
 * `Stock` exposait aussi `POST`, `PATCH` et `DELETE /api/stocks`. Aucune
 * version du front ne les a jamais appelés — l'historique git ne montre qu'une
 * lecture, supprimée depuis —, et ils contournaient ce que `FrigoBase` vérifie
 * : l'emplacement, le compte qui lit Grocy, la ligne à zéro qui garde sa
 * place. Un doublon y répondait 500 (contrainte d'unicité). Relevé par
 * `revue-fitcarnet` le 17 septembre 2026 ; retirés le même jour. Une porte que
 * personne n'emprunte est une porte que personne ne surveille.
 */
final class StockEnLectureSeuleTest extends TestCase
{
    public function testLeStockNExposeQueDesLectures(): void
    {
        $operations = [];
        foreach ((new \ReflectionClass(Stock::class))->getAttributes(ApiResource::class) as $ressource) {
            foreach ($ressource->newInstance()->getOperations() ?? [] as $operation) {
                $operations[] = $operation::class;
            }
        }

        self::assertSame([GetCollection::class, Get::class], $operations,
            'une ecriture de stock passe par /api/mon-frigo, ou FrigoBase verifie ce que l\'API Platform ne sait pas');
    }
}
