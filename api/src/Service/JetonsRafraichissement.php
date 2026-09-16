<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\JetonRafraichissement;
use App\Entity\Utilisateur;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

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
     * SECOND VOLET, 15 SEPTEMBRE 2026 : la visibilite, qui etait la vraie
     * reponse au constat. `MesSessionsController` liste et coupe UNE session
     * precise, par `pour()` et `revoquerPour()` ci-dessous ; la colonne
     * « vu le » a ete ajoutee a la table (migration 32) et `prolonger()`
     * l'ecrit. Les trois revocations d'avant — deconnexion, changement de mot
     * de passe, desactivation du compte — restent « tout ou rien », mais elles
     * ne sont plus les seules.
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

        // Un SEUL appel a l'horloge : l'echeance est derivee de l'instant qu'on
        // inscrit comme derniere utilisation, faute de quoi les deux dates
        // seraient prises a deux microsecondes d'ecart pour rien.
        $maintenant = new \DateTimeImmutable();
        $jeton->prolonger($maintenant->modify(self::DUREE), $maintenant);
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
     * COUPER TOUTES LES SESSIONS D'UN COMPTE.
     *
     * Les deux revocations « tout ou rien » qui restent passent par ici :
     * changer son mot de passe (`UtilisateurProcessor`) et desactiver un compte
     * (`ComptesController::activer`). La troisieme porte, la suppression d'un
     * compte, s'en remet a la cascade de la base — et c'est la bonne reponse
     * pour elle : la ligne `utilisateur` disparait.
     *
     * ELLES ECRIVAIENT CHACUNE SON PROPRE `DELETE` JUSQU'AU 17 SEPTEMBRE 2026.
     * Deux copies, la meme intention, aucun partage — et elles divergeaient
     * deja : l'une passait un `Uuid`, l'autre une chaine. C'est le motif de
     * defaut dominant du projet, celui qui a coute la faille de septembre 2026
     * entre `POST /mon-frigo/stock` et son jumeau `/mon-frigo/inventaire` : une
     * decision juste, appliquee a un endroit et oubliee a l'autre. Le jour ou
     * couper une session devra faire une chose de plus — inscrire une trace,
     * prevenir l'appareil — elle se fera ici, pour les deux.
     *
     * ON CHARGE LES LIGNES AU LIEU D'UN `DELETE` EN MASSE, comme `revoquer()`
     * et `revoquerPour()` a cote : une session par appareil, ca ne se compte
     * pas en milliers, et l'unite de travail reste d'accord avec la base.
     *
     * Le compte accepte les trois formes que les appelants ont sous la main :
     * l'entite, son identifiant, ou la chaine lue dans l'URL.
     */
    public function revoquerTout(Utilisateur|Uuid|string $compte): void
    {
        $proprietaire = match (true) {
            $compte instanceof Utilisateur => $compte->getId(),
            $compte instanceof Uuid => $compte,
            default => Uuid::fromString($compte),
        };

        $jetons = $this->em->getRepository(JetonRafraichissement::class)
            ->findBy(['utilisateur' => $proprietaire]);

        foreach ($jetons as $jeton) {
            $this->em->remove($jeton);
        }

        $this->em->flush();
    }

    /**
     * Les sessions ouvertes d'un compte, pour l'ecran qui les liste.
     *
     * @return list<JetonRafraichissement>
     */
    public function pour(Utilisateur $utilisateur): array
    {
        return $this->em->getRepository(JetonRafraichissement::class)
            ->findBy(['utilisateur' => $utilisateur], ['creeLe' => 'DESC']);
    }

    /**
     * Couper UNE session, la sienne. Rend false si elle n'existe pas ou n'est
     * pas a lui — l'appelant ne doit pas pouvoir distinguer les deux cas.
     *
     * LE PROPRIETAIRE EST DANS LA REQUETE, PAS DANS UN `if` QUI SUIT.
     *
     * Regle 2 du projet, et corollaire de la faille E1 du 8 septembre 2026 :
     * l'identifiant vient du client, donc la propriete se verifie ici, au point
     * de passage oblige de l'ecriture, et non dans le controleur. Un controle
     * pose apres la lecture est un controle qu'un second appelant oubliera —
     * c'est exactement ce qui s'etait produit entre `/mon-frigo/stock` et son
     * jumeau `/mon-frigo/inventaire`. Retirer `'utilisateur'` de ce tableau
     * suffirait a laisser n'importe qui deconnecter n'importe qui.
     */
    public function revoquerPour(Utilisateur $utilisateur, Uuid $id): bool
    {
        $jeton = $this->em->getRepository(JetonRafraichissement::class)
            ->findOneBy(['id' => $id, 'utilisateur' => $utilisateur]);

        if ($jeton === null) {
            return false;
        }

        $this->em->remove($jeton);
        $this->em->flush();

        return true;
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
