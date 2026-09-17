<?php

declare(strict_types=1);

namespace App\Tests\EventListener;

use PHPUnit\Framework\TestCase;
use Psr\Log\AbstractLogger;
use Psr\Log\LogLevel;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\EventListener\ErrorListener;
use Symfony\Component\HttpKernel\HttpKernelInterface;
use Symfony\Component\Serializer\Exception\NotNormalizableValueException;
use Symfony\Component\Serializer\Exception\UnexpectedValueException;
use Symfony\Component\Yaml\Yaml;

/**
 * UN CORPS D'ÉCRITURE MAL FORMÉ N'EST PAS UNE PANNE, ET LE JOURNAL DOIT LE DIRE.
 *
 * API Platform répond 400 à toute exception du sérialiseur (sa table
 * `exception_to_status`). Mais c'est l'écouteur de Symfony qui les journalise,
 * et pour lui une exception qui n'est pas une `HttpException` est
 * `critical`. Mesuré le 17 septembre 2026 par `verification-bout-en-bout` :
 * chaque refus — un IRI d'aliment étranger, un `null` à la place d'un nombre —
 * écrivait une ligne `[critical]`, et une surveillance sur ce niveau aurait
 * sonné pour chaque faute de frappe d'un client.
 *
 * `framework.exceptions` leur donne `warning` : visibles, puisqu'une erreur de
 * normalisation côté serveur sortirait AUSSI en 400, mais pas en alerte. Les
 * vraies pannes restent `critical` — le témoin le vérifie.
 */
final class JournalDesRefusTest extends TestCase
{
    public function testUnIriIntrouvableNEstPasJournaliseEnCritique(): void
    {
        self::assertSame(LogLevel::WARNING,
            self::niveauPour(new UnexpectedValueException('Item not found for "/api/aliments/121".')));
    }

    public function testUnNombreIllisibleNEstPasJournaliseEnCritique(): void
    {
        self::assertSame(LogLevel::WARNING,
            self::niveauPour(NotNormalizableValueException::createForUnexpectedDataType(
                'lip100', null, ['float'])));
    }

    /** LE TÉMOIN : une panne réelle reste une alerte. */
    public function testUnePanneResteCritique(): void
    {
        self::assertSame(LogLevel::CRITICAL, self::niveauPour(new \RuntimeException('base injoignable')));
    }

    private static function niveauPour(\Throwable $exception): string
    {
        $journal = new class extends AbstractLogger {
            /** @var list<string> */
            public array $niveaux = [];

            public function log($level, string|\Stringable $message, array $context = []): void
            {
                $this->niveaux[] = (string) $level;
            }
        };

        $ecouteur = new ErrorListener('controleur', $journal, false, self::correspondances());
        $ecouteur->logKernelException(new ExceptionEvent(
            self::createStub(HttpKernelInterface::class),
            Request::create('/api/stocks', 'POST'),
            HttpKernelInterface::MAIN_REQUEST,
            $exception,
        ));

        self::assertCount(1, $journal->niveaux);

        return $journal->niveaux[0];
    }

    /**
     * `framework.exceptions` tel que le projet le déclare, complété des valeurs
     * par défaut que FrameworkBundle pose à la compilation.
     *
     * @return array<class-string, array{log_level: ?string, status_code: ?int, log_channel: ?string}>
     */
    private static function correspondances(): array
    {
        $config = Yaml::parseFile(__DIR__ . '/../../config/packages/framework.yaml');

        return \array_map(
            static fn (array $c): array => $c + ['log_level' => null, 'status_code' => null, 'log_channel' => null],
            $config['framework']['exceptions'] ?? [],
        );
    }
}
