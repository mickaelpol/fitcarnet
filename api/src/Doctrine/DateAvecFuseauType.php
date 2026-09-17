<?php

declare(strict_types=1);

namespace App\Doctrine;

use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\DBAL\Types\DateTimeTzImmutableType;
use Doctrine\DBAL\Types\Exception\InvalidFormat;

/**
 * `datetimetz_immutable`, tel que ce projet en a besoin — déclaré à sa place
 * dans `config/packages/doctrine.yaml`.
 *
 * L'ÉCRITURE EST CELLE DE DBAL : l'heure part avec son décalage
 * (« 2026-09-17 11:25:10+0200 »), et PostgreSQL enregistre le bon instant
 * quelle que soit la zone de sa session. C'est tout l'objet du changement du
 * 17 septembre 2026 : les entités déclaraient `datetime_immutable`, l'heure de
 * Paris partait sans fuseau, et la base, en UTC, la datait de deux heures plus
 * tard.
 *
 * LA LECTURE AJOUTE UN REPLI. Celle de DBAL 4 n'accepte que le format exact
 * `Y-m-d H:i:sO` ; or une valeur posée par la base elle-même — `DEFAULT now()`,
 * `maj_le = now()` — revient avec des microsecondes, « 09:25:21.155309+00 ».
 * Sans repli, chacune de ces lignes lèverait `InvalidFormat` à la lecture.
 * Le repli est celui que DBAL applique déjà à `datetime_immutable` : le
 * constructeur, qui lit microsecondes et décalage.
 *
 * `DatesAvecFuseauTest` éprouve les trois formes que PostgreSQL rend.
 */
final class DateAvecFuseauType extends DateTimeTzImmutableType
{
    public function convertToPHPValue(mixed $value, AbstractPlatform $platform): ?\DateTimeImmutable
    {
        if (!\is_string($value)) {
            return parent::convertToPHPValue($value, $platform);
        }

        $exacte = \DateTimeImmutable::createFromFormat($platform->getDateTimeTzFormatString(), $value);
        if (false !== $exacte) {
            return $exacte;
        }

        try {
            return new \DateTimeImmutable($value);
        } catch (\Exception $e) {
            throw InvalidFormat::new($value, self::class, $platform->getDateTimeTzFormatString(), $e);
        }
    }
}
