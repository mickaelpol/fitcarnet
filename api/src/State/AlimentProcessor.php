<?php

declare(strict_types=1);

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Aliment;
use Doctrine\DBAL\Exception\ForeignKeyConstraintViolationException;
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
 *
 * MEME TRAITEMENT POUR LE RATTACHEMENT CIQUAL, depuis le 20 septembre 2026.
 * Mesure ce jour-la : `POST /api/aliments` avec un `referenceCiqual` inconnu
 * rendait HTTP 500 — la cle etrangere `aliment_reference_ciqual_fkey` faisait
 * son travail, mais son echec remontait tel quel, et une violation SQL n'est
 * pas un message.
 *
 * POURQUOI ICI PLUTOT QU'EN CONTRAINTE D'ENTITE, et c'est une lecon du projet :
 * un validateur qui a besoin d'un service casse TOUS les tests de validation,
 * qui tournent sans noyau (skill `tests-api`). Essaye le 20 septembre, mesure :
 * 14 erreurs d'un coup. `MotDePasseSolideValidator` n'a aucune dependance, et
 * ce n'est pas un hasard. Ici, la base sait deja : il suffit de traduire ce
 * qu'elle dit.
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
        } catch (ForeignKeyConstraintViolationException $e) {
            /* La seule cle etrangere que le corps d'une requete puisse violer
               ici est le rattachement CIQUAL : `utilisateur_id` vient du jeton,
               jamais du client (`ProprietaireProcessor`). Le message peut donc
               nommer le vrai coupable au lieu de parler de contrainte. */
            throw new UnprocessableEntityHttpException(
                'Ce rattachement ne correspond à aucun aliment de référence. '
                . 'Choisis-en un dans la liste, ou laisse le champ vide.', $e);
        }
    }
}
