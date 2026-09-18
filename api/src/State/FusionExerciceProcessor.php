<?php

declare(strict_types=1);

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Dto\FusionExercice;
use App\Entity\Exercice;
use Doctrine\DBAL\Connection;
use Psr\Log\LoggerInterface;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;

/**
 * Fusionne deux exercices : l'ancien est remplace par le nouveau PARTOUT
 * (modeles et seances passees), puis supprime.
 *
 * Pourquoi une operation dediee plutot qu'une suppression : le schema
 * interdit de supprimer un exercice referencé par une seance (ON DELETE
 * RESTRICT), et c'est voulu — sinon on effacerait l'historique et les 1RM.
 * La fusion transfere l'historique au lieu de le perdre.
 *
 * Le tout dans une transaction : en cas d'echec, rien n'a bougé.
 */
final readonly class FusionExerciceProcessor implements ProcessorInterface
{
    public function __construct(
        private EntityManagerInterface $em,
        private Connection $cnx,
        private LoggerInterface $journal,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): FusionExercice
    {
        \assert($data instanceof FusionExercice);

        $depot = $this->em->getRepository(Exercice::class);
        $ancien = $depot->find($data->ancienId);
        $nouveau = $depot->find($data->nouveauId);

        if (null === $ancien || null === $nouveau) {
            throw new NotFoundHttpException('Exercice introuvable.');
        }
        if ($ancien->getId() === $nouveau->getId()) {
            throw new UnprocessableEntityHttpException('Les deux exercices sont identiques.');
        }

        /* `wrapInTransaction` ET NON `beginTransaction`/`commit`/`rollBack` —
           aligne le 18 septembre 2026 sur les six autres transactions du
           depot, apres confrontation a la documentation Doctrine.
           DEUX RAISONS, ET LA PREMIERE COMPTE VRAIMENT. Ce bloc melange DBAL
           (les `UPDATE`) et ORM (`flush()` sur `$nouveau`) : apres un
           `rollBack()` manuel, la base est revenue en arriere mais
           l'EntityManager garde en memoire les `setFormatPrescrit()` et
           `setVideoUrl()` poses juste avant. `wrapInTransaction` FERME
           l'EntityManager en cas d'echec ; le code manuel non. En requete HTTP
           l'effet pratique est nul — le processus meurt —, mais c'est
           precisement la raison pour laquelle Doctrine recommande la forme a
           fermeture, et on ne garde pas une exception a la regle pour un
           argument qui tient a la duree de vie d'un processus.
           SECONDE RAISON : si l'exception venait du `commit()` lui-meme, le
           `rollBack()` du `catch` portait sur une transaction deja inactive et
           levait une seconde exception qui masquait la premiere. */
        try {
            [$seances, $modeles] = $this->em->wrapInTransaction(function () use ($ancien, $nouveau): array {
                $seances = $this->cnx->executeStatement(
                    'UPDATE seance_exercice SET exercice_id = :nouveau WHERE exercice_id = :ancien',
                    ['nouveau' => $nouveau->getId(), 'ancien' => $ancien->getId()],
                );
                $modeles = $this->cnx->executeStatement(
                    'UPDATE modele_exercice SET exercice_id = :nouveau WHERE exercice_id = :ancien',
                    ['nouveau' => $nouveau->getId(), 'ancien' => $ancien->getId()],
                );

                // Ce qui n'existait que chez l'ancien est repris : mieux vaut
                // conserver un format prescrit ou une vidéo que les perdre.
                if (null === $nouveau->getFormatPrescrit() && null !== $ancien->getFormatPrescrit()) {
                    $nouveau->setFormatPrescrit($ancien->getFormatPrescrit());
                }
                if (null === $nouveau->getVideoUrl() && null !== $ancien->getVideoUrl()) {
                    $nouveau->setVideoUrl($ancien->getVideoUrl());
                }
                if (null === $nouveau->getNomFr() && 'perso' === $ancien->getSource()) {
                    $nouveau->setNomFr($ancien->getNom());
                }
                $this->em->flush();

                $this->cnx->executeStatement(
                    'DELETE FROM exercice WHERE id = :id',
                    ['id' => $ancien->getId()],
                );

                return [$seances, $modeles];
            });

            $data->seancesModifiees = $seances;
            $data->modelesModifies = $modeles;
            $data->message = \sprintf(
                '« %s » a été remplacé par « %s » dans %d séance(s) et %d modèle(s), puis supprimé.',
                $ancien->getNom(), $nouveau->getNomAffiche(), $seances, $modeles,
            );

            return $data;
        } catch (\Throwable $e) {

            /* Meme regle qu'ailleurs, meme si cette route est reservee a
               ROLE_ADMIN : un administrateur n'a pas besoin du SQL a l'ecran
               pour comprendre qu'une fusion a echoue, et le journal le lui
               donne mieux (constat M-03, 14 septembre 2026). */
            $this->journal->error('fusion d\'exercices echouee — {erreur}', [
                'erreur' => $e->getMessage(),
                'exception' => $e,
            ]);

            throw new UnprocessableEntityHttpException(
                'Fusion impossible. Le détail est dans le journal du serveur.', $e,
            );
        }
    }
}
