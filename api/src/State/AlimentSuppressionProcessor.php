<?php

declare(strict_types=1);

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Aliment;
use Doctrine\DBAL\Connection;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

/**
 * Refuse de supprimer un aliment encore present dans un frigo.
 *
 * La base l'interdit deja : stock.aliment_id reference aliment en RESTRICT.
 * Mais elle repondrait par une violation de contrainte, donc une 500 et un
 * message illisible. On verifie avant, pour dire ce qui bloque et quoi faire.
 *
 * Le stock est interroge en SQL direct plutot que par une association Doctrine :
 * « Stock » est une ProprieteUtilisateur, donc soumise a FiltreProprietaire, qui
 * masquerait les lignes des autres comptes. Or ce sont precisement celles-la
 * qu'il faut voir pour savoir si la suppression est sure.
 */
final readonly class AlimentSuppressionProcessor implements ProcessorInterface
{
    public function __construct(
        #[Autowire(service: 'api_platform.doctrine.orm.state.remove_processor')]
        private ProcessorInterface $removeProcessor,
        private Connection $cnx,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): mixed
    {
        if ($data instanceof Aliment && null !== $data->getId()) {
            // Seules les quantites NON NULLES bloquent. Une ligne a zero ne
            // dit plus « il en reste », seulement « il se range ici » : elle
            // survit a l'epuisement pour ne pas perdre l'emplacement.
            $restant = (int) $this->cnx->fetchOne(
                'SELECT count(*) FROM stock WHERE aliment_id = :aliment AND quantite > 0',
                ['aliment' => $data->getId()],
            );

            if ($restant > 0) {
                throw new ConflictHttpException(\sprintf(
                    'Cet aliment est encore dans un frigo (%d ligne%s de stock). '
                    . 'Mets sa quantité à zéro avant de le supprimer.',
                    $restant, $restant > 1 ? 's' : ''));
            }

            // Les lignes a zero restent referencees par une cle etrangere en
            // RESTRICT : sans ce menage, PostgreSQL refuserait la suppression.
            $this->cnx->executeStatement(
                'DELETE FROM stock WHERE aliment_id = :aliment',
                ['aliment' => $data->getId()],
            );
        }

        return $this->removeProcessor->process($data, $operation, $uriVariables, $context);
    }
}
