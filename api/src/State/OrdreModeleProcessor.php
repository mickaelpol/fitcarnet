<?php

declare(strict_types=1);

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Dto\OrdreModele;
use App\Entity\Modele;
use App\Entity\Seance;
use App\Security\Voter\EstLeProprietaire;
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

        /* Meme reponse que pour un modele inexistant, et meme regle de propriete
           que partout ailleurs : elle vit dans le voter, pas ici. */
        if (!$this->securite->isGranted(EstLeProprietaire::MIEN, $modele)) {
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

        /* ON DEMANDE A LA BASE CE QU'ON CHERCHE, PLUTOT QUE TOUT PUIS TRIER.
           Ici se trouvait `findBy(['utilisateur' => ...])` : TOUT l'historique
           de l'utilisateur charge en memoire, sans limite, pour n'en garder
           ensuite qu'une fraction. Puis, plus bas, `getExercices()` sur chacune
           — une requete de plus par seance, et une par bloc pour son exercice.
           Sur un compte de deux ans, un seul clic sur « appliquer l'ordre »
           declenchait plusieurs centaines de requetes.

           Le WHERE part donc en SQL, et les deux relations sont jointes d'un
           coup. Le comportement ne change pas d'un iota : meme condition,
           « issue de ce modele OU du meme type », a ceci pres qu'un modele
           sans type ne peut apparier que par filiation — ce que l'ancien code
           faisait deja, via son `null !== $modele->getType()`. */
        $requete = $this->em->createQueryBuilder()
            ->select('s', 'bloc', 'ref')
            ->from(Seance::class, 's')
            ->leftJoin('s.exercices', 'bloc')
            ->leftJoin('bloc.exercice', 'ref')
            ->where('s.utilisateur = :utilisateur')
            ->setParameter('utilisateur', $utilisateur);

        if (null === $modele->getType()) {
            $requete->andWhere('s.modele = :modele')
                    ->setParameter('modele', $modele);
        } else {
            $requete->andWhere('s.modele = :modele OR s.type = :type')
                    ->setParameter('modele', $modele)
                    ->setParameter('type', $modele->getType());
        }

        /** @var list<Seance> $concernees */
        $concernees = $requete->getQuery()->getResult();
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
