<?php

declare(strict_types=1);

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Utilisateur;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/** Hache le mot de passe en clair avant persistance et ne le conserve jamais. */
final readonly class UtilisateurProcessor implements ProcessorInterface
{
    public function __construct(
        #[Autowire(service: 'api_platform.doctrine.orm.state.persist_processor')]
        private ProcessorInterface $persistProcessor,
        private UserPasswordHasherInterface $hasher,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): mixed
    {
        if ($data instanceof Utilisateur && null !== $data->getMotDePasseClair()) {
            $data->setPassword($this->hasher->hashPassword($data, $data->getMotDePasseClair()));
            $data->setMotDePasseClair(null);
        }

        return $this->persistProcessor->process($data, $operation, $uriVariables, $context);
    }
}
