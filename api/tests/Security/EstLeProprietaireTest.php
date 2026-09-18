<?php

declare(strict_types=1);

namespace App\Tests\Security;

use App\Entity\Modele;
use App\Entity\PlanRepas;
use App\Entity\Utilisateur;
use App\Security\Voter\EstLeProprietaire;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Security\Core\Authentication\Token\UsernamePasswordToken;
use Symfony\Component\Security\Core\Authorization\Voter\VoterInterface;

/**
 * « CETTE DONNEE EST-ELLE A MOI ? », POSE UNE SEULE FOIS.
 *
 * POURQUOI UN VOTER
 *
 * La question etait recopiee a la main : `$plan->getUtilisateur() !== $utilisateur`
 * dans `PlansController`, `$modele->getUtilisateur() !== $utilisateur` dans
 * `OrdreModeleProcessor`. Deux copies d'une meme decision, et le projet sait ou
 * cela mene — la faille de septembre 2026 venait d'un controle present sur un
 * chemin d'ecriture et absent sur son jumeau.
 *
 * La documentation Symfony 7.4 le dit sous le titre « Use Voters to Implement
 * Fine-grained Security Restrictions » : le role se verifie par
 * `#[IsGranted('ROLE_…')]`, mais « cet objet-ci est-il a moi » est exactement ce
 * qu'un voter porte.
 *
 * CE QUE CE VOTER NE CHANGE PAS
 *
 * La REPONSE. Les deux appelants repondent 404 — le meme texte pour « n'existe
 * pas » et pour « ne t'appartient pas ». Un 403 apprendrait a un inconnu que
 * l'identifiant existe. Le voter decide ; l'appelant choisit quoi dire.
 */
final class EstLeProprietaireTest extends TestCase
{
    public function testMonPropreObjetPasse(): void
    {
        $moi = new Utilisateur();
        $plan = (new PlanRepas())->setUtilisateur($moi);

        self::assertSame(VoterInterface::ACCESS_GRANTED, self::vote($moi, $plan));
    }

    public function testCeluiDUnAutreCompteEstRefuse(): void
    {
        $moi = new Utilisateur();
        $plan = (new PlanRepas())->setUtilisateur(new Utilisateur());

        self::assertSame(VoterInterface::ACCESS_DENIED, self::vote($moi, $plan));
    }

    /**
     * UNE DONNEE SANS PROPRIETAIRE N'EST A PERSONNE.
     *
     * L'interface autorise `null` — une entite en cours de construction, ou
     * mal posee. Repondre « accorde » ferait d'un oubli une porte ouverte.
     */
    public function testUneDonneeSansProprietaireEstRefusee(): void
    {
        self::assertSame(VoterInterface::ACCESS_DENIED, self::vote(new Utilisateur(), new PlanRepas()));
    }

    /** La regle vaut pour toute entite marquee, pas seulement les plans. */
    public function testLaRegleVautPourToutesLesEntitesMarquees(): void
    {
        $moi = new Utilisateur();

        self::assertSame(VoterInterface::ACCESS_GRANTED,
            self::vote($moi, (new Modele())->setUtilisateur($moi)));
        self::assertSame(VoterInterface::ACCESS_DENIED,
            self::vote($moi, (new Modele())->setUtilisateur(new Utilisateur())));
    }

    /**
     * IL NE SE PRONONCE PAS SUR CE QUI NE LE REGARDE PAS.
     *
     * Un voter qui repondrait sur tout deciderait a la place des autres : sur
     * un attribut de role, ou sur un objet qui n'appartient a personne, il doit
     * s'abstenir et laisser le reste de la chaine decider.
     */
    public function testIlSAbstientSurUnAutreAttributOuUnAutreObjet(): void
    {
        $moi = new Utilisateur();
        $plan = (new PlanRepas())->setUtilisateur($moi);

        self::assertSame(VoterInterface::ACCESS_ABSTAIN, self::vote($moi, $plan, 'ROLE_ADMIN'));
        self::assertSame(VoterInterface::ACCESS_ABSTAIN, self::vote($moi, new \stdClass()));
        self::assertSame(VoterInterface::ACCESS_ABSTAIN, self::vote($moi, null));
    }

    /** Personne de connecte : rien n'est a personne. */
    public function testSansUtilisateurConnecteRienNePasse(): void
    {
        $plan = (new PlanRepas())->setUtilisateur(new Utilisateur());
        $jeton = new UsernamePasswordToken(new EnPassant(), 'principal');

        self::assertSame(
            VoterInterface::ACCESS_DENIED,
            (new EstLeProprietaire())->vote($jeton, $plan, [EstLeProprietaire::MIEN]));
    }

    private static function vote(
        Utilisateur $moi,
        mixed $sujet,
        string $attribut = EstLeProprietaire::MIEN,
    ): int {
        $jeton = new UsernamePasswordToken($moi, 'principal', $moi->getRoles());

        return (new EstLeProprietaire())->vote($jeton, $sujet, [$attribut]);
    }
}

/** Un utilisateur qui n'est pas le notre : le voter ne doit rien lui accorder. */
final class EnPassant implements \Symfony\Component\Security\Core\User\UserInterface
{
    public function getRoles(): array
    {
        return ['ROLE_USER'];
    }

    public function eraseCredentials(): void
    {
    }

    public function getUserIdentifier(): string
    {
        return 'en-passant@test.local';
    }
}
