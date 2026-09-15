<?php

declare(strict_types=1);

namespace App\Tests\State;

use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Utilisateur;
use App\State\UtilisateurProcessor;
use Doctrine\DBAL\Connection;
use PHPUnit\Framework\TestCase;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * UN COMPTE SANS MOT DE PASSE EST UN COMPTE QUI N'EXISTE PAS VRAIMENT.
 *
 * CONSTAT F-06 DE L'AUDIT DU 7 SEPTEMBRE 2026.
 *
 * `Utilisateur::$motDePasseClair` ne portait que `Assert\Length(min: 10)`, et
 * `Assert\Length` LAISSE PASSER `null` : son validateur sort avant de mesurer
 * quoi que ce soit. C'est la raison d'etre de `NotBlank`, qui manquait.
 *
 * MESURE, PAS SUPPOSITION (Symfony 7.3, 15 septembre 2026) :
 * `Length(min: 10)` rend zero violation sur `null`, une sur `''`, une sur
 * `'court'`. La chaine vide est donc deja refusee ; c'est `null` — le champ
 * simplement absent du corps JSON — qui traverse.
 *
 * Consequence : `POST /api/utilisateurs {"email":…, "nom":…}` sans mot de
 * passe rendait 201. Le compte existait, il etait `actif`, il apparaissait
 * dans la liste d'administration — et sa colonne `mot_de_passe` restait `''`.
 * Personne ne pouvait s'y connecter : `password_verify` contre une chaine
 * vide echoue toujours. Rien, nulle part, ne disait pourquoi. Il aurait fallu
 * ouvrir la base pour comprendre que la personne n'avait jamais eu de mot de
 * passe a saisir.
 *
 * LES DEUX AUTRES PORTES ETAIENT DEJA GARDEES, et c'est ce qui rend celle-ci
 * remarquable. `InvitationsController::accepter` passe par
 * `Invitation::motDePasseAcceptable()`, et `CreerUtilisateurCommand` refuse
 * en dessous de dix caracteres. Trois chemins creent un compte, deux
 * verifiaient : le motif de defaut dominant de ce projet, une decision juste
 * appliquee a un endroit et oubliee a un autre.
 *
 * Le refus vit dans le processeur et non dans une contrainte de validation :
 * c'est le point de passage oblige des deux operations d'ecriture de la
 * ressource, et il porte deja le refus jumeau — celui du mot de passe actuel
 * manquant.
 */
final class UtilisateurProcessorTest extends TestCase
{
    public function testUnCompteCreeSansMotDePasseEstRefuse(): void
    {
        $nouveau = (new Utilisateur())->setEmail('sans@exemple.fr')->setNom('Sans mot de passe');

        $persistes = [];

        $this->expectException(UnprocessableEntityHttpException::class);

        try {
            self::processeur($persistes)->process($nouveau, new Post());
        } finally {
            self::assertSame([], $persistes,
                'un compte refuse ne doit pas atteindre la persistance');
        }
    }

    /**
     * SECONDE LIGNE, ET ELLE EST ASSUMEE COMME TELLE.
     *
     * Par la route HTTP, `''` n'arrive jamais jusqu'ici : `Assert\Length`
     * l'arrete d'abord, avec un 422 qui nomme le champ. Ce test ne decrit
     * donc pas un scenario reproductible depuis l'application — il verifie
     * que le dernier verrou tient si le premier saute.
     *
     * Pourquoi le garder : le traitement de la chaine vide par `Length` est
     * un detail d'implementation de Symfony, et il a DEJA change une fois —
     * l'option `allowEmptyString`, retiree en 5.0. Le processeur, lui, est le
     * point de passage oblige des deux operations d'ecriture. Un mot de passe
     * vide hache par bcrypt donnerait une empreinte parfaitement VALIDE :
     * pas une colonne vide qu'on remarque, un compte dont le mot de passe est
     * « rien ».
     */
    public function testUnCompteCreeAvecUnMotDePasseVideEstRefuseAussi(): void
    {
        $nouveau = (new Utilisateur())->setEmail('vide@exemple.fr')->setNom('Vide');
        $nouveau->setMotDePasseClair('');

        $persistes = [];

        $this->expectException(UnprocessableEntityHttpException::class);

        try {
            self::processeur($persistes)->process($nouveau, new Post());
        } finally {
            self::assertSame([], $persistes,
                'un compte refuse ne doit pas atteindre la persistance');
        }
    }

    /**
     * LE TEMOIN DE LA CREATION. Sans lui, un refus qui refuserait TOUT le
     * monde ressemblerait a une correction et laisserait le premier test au
     * vert.
     */
    public function testUnCompteCreeAvecUnMotDePasseEstToujoursAccepte(): void
    {
        $nouveau = (new Utilisateur())->setEmail('avec@exemple.fr')->setNom('Avec');
        $nouveau->setMotDePasseClair('un mot de passe assez long');

        $persistes = [];
        self::processeur($persistes)->process($nouveau, new Post());

        self::assertSame([$nouveau], $persistes,
            'un compte muni d\'un mot de passe doit etre cree');
        self::assertSame('hache:un mot de passe assez long', $nouveau->getPassword(),
            'le mot de passe doit etre hache, et c\'est le hachage qui est persiste');
        self::assertNull($nouveau->getMotDePasseClair(),
            'le mot de passe en clair ne doit jamais survivre au processeur');
    }

    /**
     * LE SECOND TEMOIN, ET IL COMPTE AUTANT QUE LE PREMIER.
     *
     * Un `PATCH` qui ne change que le nom n'envoie evidemment pas de mot de
     * passe. Un refus pose sans distinguer la creation de la modification
     * aurait rendu impossible le geste le plus courant de l'ecran de compte —
     * exactement le piege de M-01, ou un garde juste a la creation etait
     * applique partout ailleurs.
     */
    public function testModifierUnCompteExistantSansToucherAuMotDePasseResteAutorise(): void
    {
        $existant = (new Utilisateur())->setEmail('deja@exemple.fr')->setNom('Nouveau nom');
        $precedent = (new Utilisateur())->setEmail('deja@exemple.fr')->setNom('Ancien nom');

        $persistes = [];
        self::processeur($persistes)->process(
            $existant,
            new Patch(),
            [],
            ['previous_data' => $precedent],
        );

        self::assertSame([$existant], $persistes,
            'modifier son nom ne doit pas exiger un mot de passe');
    }

    /**
     * @param list<mixed> $persistes les objets reellement transmis a la persistance
     */
    private static function processeur(array &$persistes): UtilisateurProcessor
    {
        $persistance = self::createStub(ProcessorInterface::class);
        $persistance->method('process')->willReturnCallback(
            static function (mixed $donnee) use (&$persistes): mixed {
                $persistes[] = $donnee;

                return $donnee;
            });

        /* Un hachage lisible : le test verifie QUE le clair a ete hache, pas
           comment. Un vrai hacheur couterait un bcrypt par test sans rien
           prouver de plus. */
        $hacheur = self::createStub(UserPasswordHasherInterface::class);
        $hacheur->method('hashPassword')->willReturnCallback(
            static fn (mixed $u, string $clair): string => 'hache:'.$clair);

        return new UtilisateurProcessor(
            $persistance,
            $hacheur,
            self::createStub(Security::class),
            self::createStub(Connection::class),
        );
    }
}
