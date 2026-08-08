<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\JetonRafraichissement;
use App\Entity\Utilisateur;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Cree, reconnait et revoque les jetons de rafraichissement.
 *
 * Un seul endroit connait le secret et sa duree — le controleur ne fait
 * qu'appeler ces trois gestes.
 */
final class JetonsRafraichissement
{
    /**
     * Duree de vie, repoussee a chaque usage.
     *
     * Un an ne veut pas dire « la session dure un an » : elle dure tant que
     * l'application sert, et se termine sur un clic « Se deconnecter ». Ce
     * delai n'existe que pour qu'un telephone abandonne cesse un jour d'etre
     * une porte ouverte.
     */
    public const DUREE = '+1 year';

    /**
     * 32 octets tires au sort, soit 256 bits.
     *
     * A ce niveau, deviner un jeton n'est pas un risque a modeliser : c'est
     * le meme ordre de grandeur qu'une cle AES-256.
     */
    private const OCTETS = 32;

    public function __construct(private readonly EntityManagerInterface $em)
    {
    }

    /** Le jeton EN CLAIR, retourne une seule fois : la base n'en garde que l'empreinte. */
    public function creer(Utilisateur $utilisateur): string
    {
        $clair = bin2hex(random_bytes(self::OCTETS));

        $this->em->persist(new JetonRafraichissement(
            $utilisateur,
            self::empreinte($clair),
            new \DateTimeImmutable(self::DUREE),
        ));
        $this->em->flush();

        return $clair;
    }

    /**
     * Le compte derriere ce jeton, ou null s'il ne vaut rien.
     *
     * Le jeton n'est PAS remplace a chaque usage. La rotation detecterait un
     * vol, mais au prix d'une deconnexion definitive chaque fois qu'une
     * reponse se perd entre le serveur et le telephone — coupure de reseau,
     * application tuee au mauvais moment. Sur une application qui promet de
     * ne deconnecter que sur demande, ce compromis-la se paie trop cher.
     */
    public function utilisateurPour(string $clair): ?Utilisateur
    {
        $jeton = $this->em->getRepository(JetonRafraichissement::class)
            ->findOneBy(['empreinte' => self::empreinte($clair)]);

        if ($jeton === null) {
            return null;
        }

        if ($jeton->estExpire()) {
            $this->em->remove($jeton);
            $this->em->flush();

            return null;
        }

        $jeton->prolonger(new \DateTimeImmutable(self::DUREE));
        $this->em->flush();

        return $jeton->getUtilisateur();
    }

    /** La deconnexion. Revoquer un jeton inconnu n'est pas une erreur. */
    public function revoquer(string $clair): void
    {
        $jeton = $this->em->getRepository(JetonRafraichissement::class)
            ->findOneBy(['empreinte' => self::empreinte($clair)]);

        if ($jeton === null) {
            return;
        }

        $this->em->remove($jeton);
        $this->em->flush();
    }

    /**
     * Balaie les jetons perimes.
     *
     * Appele au passage lors d'un rafraichissement : la table reste petite
     * sans qu'aucune tache planifiee n'ait a exister. Une session par
     * connexion, ca ne se compte pas en milliers.
     */
    public function purger(): void
    {
        $this->em->createQuery(
            'DELETE FROM ' . JetonRafraichissement::class . ' j WHERE j.expireLe <= :maintenant'
        )->setParameter('maintenant', new \DateTimeImmutable())->execute();
    }

    private static function empreinte(string $clair): string
    {
        return hash('sha256', $clair);
    }
}
