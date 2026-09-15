<?php

declare(strict_types=1);

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\Metadata\Post;
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
 * NI `creePar` NI `public` NE SONT ECRIVABLES : aucun des deux n'a de groupe de
 * denormalisation. Le client ne peut donc transmettre ni l'un ni l'autre, et la
 * confidentialite ne depend pas de ce qu'il envoie.
 *
 * CE COMMENTAIRE A DIT LE CONTRAIRE, ET C'ETAIT FAUX. Il annoncait « `public`
 * en revanche EST ecrivable, parce que le PATCH d'administration s'en sert pour
 * publier ». Verifie le 15 septembre 2026 : `public` n'a aucun `#[Groups]`.
 * CE MECANISME DE PUBLICATION N'EXISTE PAS. Un exercice cree depuis
 * l'application reste prive, et rien dans l'API ne peut le verser au catalogue
 * commun — il faudrait pour cela exposer `public` en ecriture, ce qui demande
 * d'abord de decider QUI a le droit de publier. Non tranche, donc non fait.
 *
 * `FiltreExercice` dit « public OU le mien » et sait donc lire un exercice
 * publie-mais-attribue. Cette troisieme possibilite est prevue par la lecture ;
 * elle n'a simplement aucun moyen de naitre aujourd'hui.
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
        /* L'OPERATION FAIT FOI, PAS L'ETAT DU CHAMP.
           Se fier a `null === getCreePar()` semble equivalent et ne l'est pas :
           un exercice du CATALOGUE COMMUN a precisement `creePar = NULL`. Le
           PATCH par lequel un administrateur renseigne une video se serait
           approprie l'exercice, et `public = false` l'aurait fait disparaitre
           du catalogue de tout le monde. C'est le constat M-01, deja survenu
           sur AlimentProcessor — le meme piege, a dix lignes de distance. */
        if ($data instanceof Exercice && $operation instanceof Post) {
            $utilisateur = $this->security->getUser();
            if ($utilisateur instanceof Utilisateur) {
                $data->setCreePar($utilisateur);
                $data->setPublic(false);
            }
        }

        return $this->persistProcessor->process($data, $operation, $uriVariables, $context);
    }
}
