<?php

declare(strict_types=1);

namespace App\Service;

/**
 * LE SEUL LECTEUR D'UN NOMBRE SAISI, COTE SERVEUR — 26 septembre 2026.
 *
 * Il vivait en methode privee de `VerdictAliment`, si bien que l'ecriture
 * (`POST /api/aliments`, `POST /api/mon-frigo/stock`, les routes Grocy) lisait
 * ses nombres autrement : `(float) "12,5"` vaut 12, SANS UN MOT, et
 * `(float) "4,2,1"` vaut 4. L'ecran jugeait « 12,5 », l'ecriture enregistrait
 * 12 — deux lecteurs, deux reponses (feature `macros-editeur-vide-pas-zero`).
 *
 * LA VIRGULE FRANCAISE EST UN SEPARATEUR DECIMAL, et « 4,2,1 » n'est pas un
 * nombre. Un espace ne fait pas un millier non plus : on ne devine pas.
 *
 * LES NEGATIFS SE LISENT : « -2 » est un nombre lisible. Le juger est un autre
 * geste, qui appartient a l'appelant (`VerdictAliment::refusDuSigne`).
 *
 * UN NOMBRE JSON SE LIT AUSSI : un client peut envoyer `12.5` ou `"12,5"`, les
 * deux passent par ici (CA-10).
 */
final class NombreSaisi
{
    /** « Je ne sais pas » : rien, ou que des espaces. Jamais zero (regle 6). */
    public static function estVide(mixed $brut): bool
    {
        return null === $brut || (\is_string($brut) && '' === \trim($brut));
    }

    /**
     * Le nombre designe, ou `null` pour le vide ET pour l'illisible.
     *
     * Un booleen ou un tableau n'est pas un nombre : `(float) true` vaudrait 1.
     */
    public static function lire(mixed $brut): ?float
    {
        if (\is_int($brut) || \is_float($brut)) {
            return \is_finite((float) $brut) ? (float) $brut : null;
        }

        if (!\is_string($brut)) {
            return null;
        }

        $normalise = \str_replace(',', '.', \trim($brut));

        return 1 === \preg_match('/^-?\d+(\.\d+)?$/', $normalise)
            ? (float) $normalise
            : null;
    }
}
