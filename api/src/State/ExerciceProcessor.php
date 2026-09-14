<?php

declare(strict_types=1);

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Exercice;
use App\Entity\Utilisateur;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * Un exercice ajoute depuis l'application appartient a son auteur, et lui
 * reste prive tant qu'un administrateur ne l'a pas publie.
 *
 * POURQUOI (constat E8 / F-04, 7 septembre 2026)
 *
 * `Exercice::setCreePar()` n'avait aucun appelant : la colonne restait NULL
 * pour tout le monde, le catalogue etait entierement commun, et l'ecran
 * affichait pourtant « ★ exercice personnel ». Un nom d'exercice peut etre
 * personnel — « Reeducation epaule Dr X » — et l'etiquette le promettait sans
 * le tenir. C'est ici que la promesse devient vraie.
 *
 * `creePar` n'est dans aucun groupe de denormalisation : le client ne peut pas
 * le transmettre, il vient du jeton. `public` en revanche EST ecrivable, parce
 * que le PATCH d'administration s'en sert pour publier — on l'ecrase donc a la
 * creation, sans quoi la confidentialite dependrait de ce que le client envoie.
 *
 * PUBLIER SANS EFFACER L'AUTEUR. Sur un PATCH, l'exercice arrive charge depuis
 * la base avec son `creePar` : le garde `null ===` fait que rien n'est touche,
 * et le `public: true` de l'administrateur passe. Le catalogue commun
 * s'enrichit, la paternite reste.
 */
final readonly class ExerciceProcessor implements ProcessorInterface
{
    public function __construct(
        #[Autowire(service: 'api_platform.doctrine.orm.state.persist_processor')]
        private ProcessorInterface $persistProcessor,
        private Security $security,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): mixed
    {
        if ($data instanceof Exercice && null === $data->getCreePar()) {
            $utilisateur = $this->security->getUser();
            if ($utilisateur instanceof Utilisateur) {
                $data->setCreePar($utilisateur);
                $data->setPublic(false);
            }
        }

        return $this->persistProcessor->process($data, $operation, $uriVariables, $context);
    }
}
