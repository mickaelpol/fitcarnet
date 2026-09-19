<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Utilisateur;

/**
 * Aiguillage : d'ou viennent les aliments de cet utilisateur ?
 *
 * L'application ne connait que ce service. Elle ignore que l'administrateur
 * lit son stock dans Grocy et les autres dans la base : le solveur recoit la
 * meme forme dans les deux cas, et un seul ecran suffit.
 */
final readonly class Frigo
{
    public function __construct(
        private FrigoGrocy $grocy,
        private FrigoBase $base,
    ) {
    }

    /** @return AlimentDisponible[] */
    public function lire(Utilisateur $utilisateur): array
    {
        return $this->lireTout($utilisateur)['aliments'];
    }

    /**
     * TOUT le frigo, y compris ce qui n'est pas utilisable.
     *
     * Seul Grocy peut rendre des produits incomplets : la base, elle, impose
     * ses valeurs a l'ecriture (`Aliment`, contraintes `NotNull`), donc un
     * aliment sans macros n'y existe pas. Sa liste d'incomplets est vide, et
     * c'est un fait, pas un oubli.
     *
     * @return array{aliments: list<AlimentDisponible>, incomplets: list<array<string, mixed>>}
     */
    public function lireTout(Utilisateur $utilisateur): array
    {
        if ('grocy' === $utilisateur->getSourceFrigo()) {
            return $this->grocy->lireTout();
        }

        return ['aliments' => \array_values($this->base->lire($utilisateur)), 'incomplets' => []];
    }

    public function source(Utilisateur $utilisateur): string
    {
        return 'grocy' === $utilisateur->getSourceFrigo() ? 'grocy' : 'base';
    }

    /** Le frigo est-il utilisable ? Sinon, pourquoi. */
    public function diagnostic(Utilisateur $utilisateur): ?string
    {
        if ('grocy' !== $utilisateur->getSourceFrigo()) {
            return null;
        }
        if (!$this->grocy->estConfigure()) {
            return "Grocy n'est pas configuré côté serveur : "
                 . 'renseigne GROCY_URL et GROCY_API_KEY.';
        }

        return null;
    }
}
