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
     * Quatre-vingt-dix jours ne veulent pas dire « la session dure trois
     * mois » : elle dure tant que l'application sert — l'echeance est
     * repoussee d'autant a chaque rafraichissement — et se termine sur un clic
     * « Se deconnecter ». Ce delai n'existe que pour qu'un telephone abandonne
     * cesse un jour d'etre une porte ouverte.
     *
     * C'ETAIT UN AN, ET C'ETAIT TROP (constat M-02, corrige le 14 septembre
     * 2026). Le jeton n'est jamais remplace : un exemplaire copie — sauvegarde
     * de telephone, appareil revendu — ouvrait un acces d'un an, indetectable,
     * puisque rien ne trahit un second usage et qu'aucun ecran ne liste les
     * sessions. Trois mois glissants ne changent rien pour qui se sert de
     * l'application, et divisent la fenetre par quatre pour qui l'a oubliee.
     *
     * CE QUI MANQUE ENCORE : la visibilite. Pouvoir constater et couper UNE
     * session precise — `GET /api/mes-sessions`, `DELETE /api/mes-sessions/{id}`
     * — reste la vraie reponse au constat. La table porte deja tout sauf
     * « vu le ». Les revocations existantes sont toutes « tout ou rien ».
     */
    public const DUREE = '+90 days';

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
