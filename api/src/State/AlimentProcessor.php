<?php

declare(strict_types=1);

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Aliment;
use App\Entity\Utilisateur;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;

/**
 * Un aliment cree depuis l'application appartient a son auteur et lui reste prive.
 *
 * Decision arretee : les aliments de reference sont communs et verifies, ceux
 * qu'un utilisateur saisit ne sortent pas de chez lui. Sur des valeurs
 * nutritionnelles, l'erreur de l'un ne doit pas fausser la diete des autres.
 *
 * Le client ne transmet ni « creePar » ni « public » : les deux viennent du
 * jeton, jamais du corps de la requete, sinon la regle serait contournable.
 */
final readonly class AlimentProcessor implements ProcessorInterface
{
    public function __construct(
        #[Autowire(service: 'api_platform.doctrine.orm.state.persist_processor')]
        private ProcessorInterface $persistProcessor,
        private Security $security,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): mixed
    {
        if ($data instanceof Aliment && null === $data->getCreePar()) {
            $utilisateur = $this->security->getUser();
            if ($utilisateur instanceof Utilisateur) {
                $data->setCreePar($utilisateur);
                $data->setPublic(false);
            }
        }

        try {
            return $this->persistProcessor->process($data, $operation, $uriVariables, $context);
        } catch (UniqueConstraintViolationException $e) {
            // L'unicite par proprietaire vit dans deux index partiels, que
            // Doctrine ne sait pas verifier avant l'insertion : il n'existe pas
            // de contrainte d'entite equivalente. On rattrape donc l'erreur SQL
            // plutot que de laisser remonter « SQLSTATE[23505] » a l'ecran.
            throw new UnprocessableEntityHttpException(\sprintf(
                'Tu as déjà un aliment nommé « %s ». Choisis un autre nom, '
                . 'ou corrige celui qui existe.',
                $data instanceof Aliment ? $data->getNom() : '?'), $e);
        }
    }
}
