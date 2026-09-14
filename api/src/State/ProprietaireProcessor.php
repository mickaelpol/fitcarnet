<?php

declare(strict_types=1);

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\Metadata\Post;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\ProprieteUtilisateur;
use App\Entity\Utilisateur;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * Affecte automatiquement l'utilisateur connecte comme proprietaire.
 * Le client n'a jamais a transmettre son identite : elle vient du jeton.
 */
final readonly class ProprietaireProcessor implements ProcessorInterface
{
    public function __construct(
        #[Autowire(service: 'api_platform.doctrine.orm.state.persist_processor')]
        private ProcessorInterface $persistProcessor,
        private Security $security,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): mixed
    {
        /* L'OPERATION FAIT FOI, PAS L'ETAT DU CHAMP.
           Ici le garde `null === getUtilisateur()` ne cachait AUCUN bug : la
           colonne est NOT NULL, une entite rechargee a toujours son
           proprietaire. Il est aligne malgre tout, parce que le meme motif a
           mordu deux fois a cote (M-01 sur AlimentProcessor, puis sur
           ExerciceProcessor le jour de sa naissance) et que la lecon de
           l'audit est celle-la : une decision juste appliquee a un endroit et
           oubliee a un autre. Trois processeurs, une seule regle. */
        if ($data instanceof ProprieteUtilisateur && $operation instanceof Post) {
            $utilisateur = $this->security->getUser();
            if ($utilisateur instanceof Utilisateur) {
                $data->setUtilisateur($utilisateur);
            }
        }

        return $this->persistProcessor->process($data, $operation, $uriVariables, $context);
    }
}
