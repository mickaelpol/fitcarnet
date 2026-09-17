<?php

declare(strict_types=1);

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Aliment;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;

/**
 * Enregistre un aliment et dit en toutes lettres qu'un nom est deja pris.
 *
 * La pose du proprietaire est celle de toute entite rattachee a un compte :
 * `ProprietaireProcessor`, depuis le jeton et jamais depuis le corps de la
 * requete. Ce processeur l'enveloppe et n'ajoute qu'une chose.
 *
 * L'unicite du nom par compte vit dans l'index fonctionnel
 * `aliment_nom_unique_par_compte`, que Doctrine ne sait pas verifier avant
 * l'insertion : il n'existe pas de contrainte d'entite equivalente. On
 * rattrape donc l'erreur SQL, aux deux operations, plutot que de laisser
 * remonter « SQLSTATE[23505] » a l'ecran.
 */
final readonly class AlimentProcessor implements ProcessorInterface
{
    public function __construct(
        #[Autowire(service: ProprietaireProcessor::class)]
        private ProcessorInterface $proprietaire,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): mixed
    {
        try {
            return $this->proprietaire->process($data, $operation, $uriVariables, $context);
        } catch (UniqueConstraintViolationException $e) {
            throw new UnprocessableEntityHttpException(\sprintf(
                'Tu as déjà un aliment nommé « %s ». Choisis un autre nom, '
                . 'ou corrige celui qui existe.',
                $data instanceof Aliment ? $data->getNom() : '?'), $e);
        }
    }
}
