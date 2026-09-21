<?php

declare(strict_types=1);

namespace App\Repository;

use Doctrine\DBAL\Connection;

/**
 * LES PLANS ENCORE PREVUS D'UN COMPTE — palier B, 21 septembre 2026.
 *
 * Ce depot existe pour une seule question : « qu'est-ce qui est deja promis a un
 * autre plan ? ». `GET /api/mon-frigo` s'en sert pour rendre
 * `grammesDisponibles`, calcule jusqu'ici par le front.
 *
 * `cuisine_le IS NULL` EST LA MOITIE DU SUJET. Un plan cuisine a deja fait
 * baisser le stock pour de vrai (`DeductionDuPlan`) : le compter encore le
 * deduirait deux fois. Le schema le dit deja en toutes lettres
 * (`db/01-schema.sql`, colonne `cuisine_le`).
 *
 * EN SQL ET NON EN PHP, exprès : la condition est un filtre, pas une regle
 * metier. La regle — « seuls les plans prevus reservent » — vit dans
 * `StockPromis`, qui sait aussi la lire sur des plans venus d'ailleurs.
 */
final readonly class PlansPrevus
{
    public function __construct(private Connection $cnx)
    {
    }

    /**
     * @return list<array{contenu: array<string, mixed>, cuisineLe: null}>
     */
    public function duCompte(string $utilisateur): array
    {
        $lignes = $this->cnx->fetchAllAssociative(
            'SELECT contenu FROM plan_repas
              WHERE utilisateur_id = :u AND cuisine_le IS NULL',
            ['u' => $utilisateur],
        );

        $plans = [];

        foreach ($lignes as $ligne) {
            $contenu = \json_decode((string) $ligne['contenu'], true);

            /* UN CONTENU ILLISIBLE EST ECARTE, PAS PROPAGE. `contenu` est un
               JSONB ecrit par le front ; une ligne indechiffrable ferait tomber
               tout l'ecran du frigo, alors qu'une reservation manquante ne
               coute qu'une composition a refaire. */
            if (!\is_array($contenu)) {
                continue;
            }

            $plans[] = ['contenu' => $contenu, 'cuisineLe' => null];
        }

        return $plans;
    }
}
