<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Utilisateur;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * LES INVITATIONS EN BASE.
 *
 * POURQUOI UN DEPOT
 *
 * `InvitationsController` portait neuf requetes. La documentation Symfony 7.4
 * place le SQL brut dans `src/Repository/` : le controleur lit la requete,
 * appelle, repond. Ici la separation rend surtout lisible ce qui, autrement, se
 * perd entre deux validations : ce qu'on cherche par EMPREINTE, ce qu'on
 * remplace, et ce qui doit tenir dans une seule transaction.
 *
 * LE JETON N'EST NULLE PART DANS CE FICHIER
 *
 * Le lien n'existe qu'une fois, dans la reponse a sa creation. La base n'en
 * garde que l'empreinte, et aucune lecture ne la ressort : c'est ce qui fait
 * qu'une fuite de base ne donne aucun lien utilisable.
 */
final readonly class Invitations
{
    /** Une liste d'ecran se borne : personne ne lit la millieme invitation. */
    private const LIMITE = 100;

    public function __construct(
        private Connection $cnx,
        private EntityManagerInterface $em,
    ) {
    }

    /**
     * Les invitations, la plus recente d'abord — acceptees et perimees comprises.
     *
     * Une liste qui ne montrerait que les invitations vivantes laisserait
     * l'administrateur se demander s'il a deja invite quelqu'un, reinviter, et
     * se retrouver avec deux liens en circulation.
     *
     * @return list<array<string, mixed>>
     */
    public function recentes(): array
    {
        return $this->cnx->fetchAllAssociative(
            'SELECT i.id, i.email, i.cree_le, i.expire_le, i.accepte_le,
                    u.nom AS nom_invite
               FROM invitation i
          LEFT JOIN utilisateur u ON u.id = i.utilisateur_id
           ORDER BY i.cree_le DESC
              LIMIT '.self::LIMITE,
        );
    }

    /**
     * Le nom du compte qui porte deja cette adresse, s'il existe.
     *
     * Inviter quelqu'un qui a deja un compte ne creerait rien, et le lien
     * echouerait au dernier moment — apres que l'administrateur l'a transmis.
     */
    public function nomDuCompte(string $email): ?string
    {
        $nom = $this->cnx->fetchOne(
            'SELECT nom FROM utilisateur WHERE lower(email) = :e', ['e' => $email]);

        return false === $nom ? null : (string) $nom;
    }

    /**
     * Une nouvelle invitation, qui REMPLACE celle qui attendait.
     *
     * C'est le geste qu'on fait quand le lien est perdu. L'ancien meurt a
     * l'instant ou le nouveau nait, dans la meme transaction : deux liens
     * vivants pour une meme adresse, c'est un lien de trop.
     *
     * La suppression ne vise que les invitations EN ATTENTE — une invitation
     * acceptee porte la trace de qui a invite qui.
     */
    public function remplacer(
        string $email,
        string $empreinte,
        Uuid|string|null $invitePar,
        \DateTimeImmutable $cree,
        \DateTimeImmutable $expire,
    ): void {
        $this->cnx->transactional(function () use ($email, $empreinte, $invitePar, $cree, $expire): void {
            $this->cnx->executeStatement(
                'DELETE FROM invitation WHERE lower(email) = :e AND accepte_le IS NULL',
                ['e' => $email],
            );
            $this->cnx->executeStatement(
                'INSERT INTO invitation (email, jeton_empreinte, invite_par, cree_le, expire_le)
                 VALUES (:e, :h, :par, :cree, :expire)',
                [
                    'e' => $email,
                    'h' => $empreinte,
                    'par' => $invitePar instanceof Uuid ? $invitePar->toRfc4122() : $invitePar,
                    'cree' => $cree->format('Y-m-d H:i:sP'),
                    'expire' => $expire->format('Y-m-d H:i:sP'),
                ],
            );
        });
    }

    /**
     * Annule une invitation en attente, et rend combien de lignes sont parties.
     *
     * Zero veut dire « elle n'existe pas, ou elle a deja ete acceptee » : une
     * invitation acceptee ne se revoque pas, elle a servi.
     */
    public function revoquer(int $id): int
    {
        return $this->cnx->executeStatement(
            'DELETE FROM invitation WHERE id = :id AND accepte_le IS NULL',
            ['id' => $id],
        );
    }

    /**
     * L'invitation derriere cette empreinte, sans juger de sa validite.
     *
     * ON CHERCHE PAR EMPREINTE, jamais par jeton : le jeton en clair n'est
     * nulle part dans la base. La validite — perimee, deja acceptee — se decide
     * dans `App\Service\Invitation`, qui s'eprouve sans base.
     *
     * @return array<string, mixed>|null
     */
    public function parEmpreinte(string $empreinte): ?array
    {
        $ligne = $this->cnx->fetchAssociative(
            'SELECT id, email, expire_le, accepte_le
               FROM invitation
              WHERE jeton_empreinte = :h',
            ['h' => $empreinte],
        );

        return false === $ligne ? null : $ligne;
    }

    /** Un compte existe-t-il deja pour cette adresse ? */
    public function compteExiste(string $email): bool
    {
        return false !== $this->cnx->fetchOne(
            'SELECT 1 FROM utilisateur WHERE lower(email) = :e', ['e' => $email]);
    }

    /**
     * Cree le compte ET consomme l'invitation — ou ne fait rien du tout.
     *
     * LES DEUX SONT UN SEUL FAIT. Separes, une coupure au mauvais moment
     * laisse soit un compte sans trace, soit un lien deja utilise qui ne mene a
     * rien — et dans les deux cas quelqu'un attend devant un ecran.
     *
     * `accepte_le IS NULL` dans la clause : si deux envois arrivent ensemble, le
     * second ne marque rien, la levee fait tomber sa transaction, et le compte
     * n'est cree qu'une fois.
     *
     * @throws \RuntimeException si l'invitation a ete consommee entre-temps
     */
    public function creerLeCompteEtConsommer(Utilisateur $nouveau, int $invitation): void
    {
        $this->em->wrapInTransaction(function () use ($nouveau, $invitation): void {
            $this->em->persist($nouveau);
            $this->em->flush();

            $marquees = $this->cnx->executeStatement(
                'UPDATE invitation
                    SET accepte_le = now(), utilisateur_id = :u
                  WHERE id = :id AND accepte_le IS NULL',
                ['u' => $nouveau->getId()->toRfc4122(), 'id' => $invitation],
            );

            if (0 === $marquees) {
                throw new \RuntimeException('Invitation consommée entre-temps.');
            }
        });
    }
}
