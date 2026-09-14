<?php

declare(strict_types=1);

namespace App\Tests\Security;

use App\Entity\Utilisateur;
use App\Security\CompteActif;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Security\Core\Exception\CustomUserMessageAccountStatusException;
use Symfony\Component\Security\Core\User\UserInterface;

/**
 * UN COMPTE DESACTIVE NE DOIT PAS PASSER.
 *
 * CONSTAT C3 DE L'AUDIT DU 7 SEPTEMBRE 2026, QUATRIEME VOLET.
 *
 * La classe raconte elle-meme sa panne d'origine : la colonne `actif` a
 * existe des le premier jour sans que personne ne la lise, un administrateur
 * pouvait « bloquer » un compte et le voir continuer a se connecter. Une case
 * a cocher qui ne fait rien est pire qu'une case absente.
 *
 * Le controleur a ete ecrit pour fermer ce trou, mais rien ne verifiait qu'il
 * le fermait vraiment. Symfony l'appelle a chaque authentification : s'il
 * cessait de lever, la regression serait aussi silencieuse que la panne
 * d'origine — et se decouvrirait le jour ou l'on compte dessus.
 */
final class CompteActifTest extends TestCase
{
    public function testUnCompteDesactiveEstRefuse(): void
    {
        $bloque = (new Utilisateur())->setActif(false);

        $this->expectException(CustomUserMessageAccountStatusException::class);

        (new CompteActif())->checkPreAuth($bloque);
    }

    /**
     * Le temoin, sans lequel un controleur qui refuserait TOUT LE MONDE
     * ressemblerait a une protection correcte.
     */
    public function testUnCompteActifPasse(): void
    {
        $ordinaire = (new Utilisateur())->setActif(true);

        (new CompteActif())->checkPreAuth($ordinaire);

        $this->addToAssertionCount(1);   // ne pas lever EST le resultat attendu
    }

    /**
     * Les pare-feux `session`, `invitation` et `etat` vivent hors du pare-feu
     * JWT et peuvent porter un autre type d'utilisateur. Le controleur doit
     * les laisser passer plutot que d'echouer sur un `isActif()` absent.
     */
    public function testUnUtilisateurDUnAutreTypeNeFaitPasEchouerLeControle(): void
    {
        (new CompteActif())->checkPreAuth(self::createStub(UserInterface::class));

        $this->addToAssertionCount(1);
    }

    /**
     * Tout se decide avant le mot de passe — voir le commentaire de la classe :
     * c'est un hachage epargne, et aucune difference de temps de reponse entre
     * un compte bloque avec le bon mot de passe et un autre avec le mauvais.
     */
    public function testRienNeSeDecideApresLAuthentification(): void
    {
        (new CompteActif())->checkPostAuth((new Utilisateur())->setActif(false));

        $this->addToAssertionCount(1);
    }
}
