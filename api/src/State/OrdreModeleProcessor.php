<?php

declare(strict_types=1);

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Dto\OrdreModele;
use App\Entity\Modele;
use App\Entity\Seance;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Reordonne les seances d'apres l'ordre d'un modele.
 *
 * Appariement en deux temps : les seances explicitement issues de ce modele,
 * puis — pour les seances importees, qui n'ont aucun lien — celles du meme
 * type. Un exercice absent du modele est repousse a la fin, dans son ordre
 * d'origine : on ne perd jamais rien.
 */
final readonly class OrdreModeleProcessor implements ProcessorInterface
{
    public function __construct(
        private EntityManagerInterface $em,
        private Security $securite,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): OrdreModele
    {
        \assert($data instanceof OrdreModele);

        $id = (int) ($uriVariables['id'] ?? 0);
        $modele = $this->em->getRepository(Modele::class)->find($id);
        if (null === $modele) {
            throw new NotFoundHttpException('Modèle introuvable.');
        }

        $utilisateur = $this->securite->getUser();
        if ($modele->getUtilisateur() !== $utilisateur) {
            throw new NotFoundHttpException('Modèle introuvable.');
        }

        // rang de chaque exercice, tel que le modele le definit
        $rangs = [];
        foreach ($modele->getExercices() as $me) {
            $exercice = $me->getExercice();
            if (null !== $exercice) {
                $rangs[$exercice->getId()] = $me->getOrdre();
            }
        }

        if ([] === $rangs) {
            $data->message = 'Ce modèle ne contient aucun exercice.';

            return $data;
        }

        $seances = $this->em->getRepository(Seance::class)->findBy([
            'utilisateur' => $utilisateur,
        ]);

        $concernees = [];
        foreach ($seances as $seance) {
            $issueDuModele = $seance->getModele()?->getId() === $modele->getId();
            $memeType = null !== $modele->getType() && $seance->getType() === $modele->getType();
            if ($issueDuModele || $memeType) {
                $concernees[] = $seance;
            }
        }
        $data->seancesConcernees = \count($concernees);

        if (!$data->appliquer) {
            $data->message = \sprintf(
                '%d séance(s) suivraient ce nouvel ordre.', \count($concernees),
            );

            return $data;
        }

        $modifiees = 0;
        foreach ($concernees as $seance) {
            $blocs = $seance->getExercices()->toArray();

            // les exercices connus du modele prennent son rang ;
            // les autres passent apres, dans leur ordre actuel
            \usort($blocs, static function ($a, $b) use ($rangs) {
                $ra = $rangs[$a->getExercice()?->getId()] ?? \PHP_INT_MAX;
                $rb = $rangs[$b->getExercice()?->getId()] ?? \PHP_INT_MAX;

                return $ra <=> $rb ?: $a->getOrdre() <=> $b->getOrdre();
            });

            $change = false;
            foreach ($blocs as $position => $bloc) {
                if ($bloc->getOrdre() !== $position) {
                    $bloc->setOrdre($position);
                    $change = true;
                }
            }
            if ($change) {
                ++$modifiees;
            }
        }

        $this->em->flush();

        $data->seancesModifiees = $modifiees;
        $data->message = 0 === $modifiees
            ? 'Tes séances suivaient déjà cet ordre.'
            : \sprintf('%d séance(s) réorganisée(s).', $modifiees);

        return $data;
    }
}
