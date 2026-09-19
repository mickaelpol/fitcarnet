<?php

declare(strict_types=1);

namespace App\Tests\State;

use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Utilisateur;
use App\Service\JetonsRafraichissement;
use App\State\UtilisateurProcessor;
use Doctrine\ORM\EntityManagerInterface;
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
     * CE COMMENTAIRE A DIT LE CONTRAIRE DE LA REALITE, ET LE JOUR OU IL EST
     * DEVENU FAUX, PERSONNE N'EST VENU LE RELIRE. Il affirmait : « par la
     * route HTTP, `''` n'arrive jamais jusqu'ici : `Assert\Length` l'arrete
     * d'abord […] ce test ne decrit donc pas un scenario reproductible depuis
     * l'application ».
     *
     * `Assert\Length` a ete retire le 18 septembre 2026 au profit de
     * `MotDePasseSolide`, dont le validateur sort explicitement sur `''`
     * (`MotDePasseSolideValidator.php:35-37`). Le premier verrou avait donc
     * saute, et le scenario est devenu parfaitement reproductible : un
     * `PATCH {"motDePasseClair": ""}` rendait 200, rehachait la chaine vide et
     * MURAIT le compte — l'ancien mot de passe en 401, le vide en 401 aussi.
     *
     * Le processeur est le point de passage oblige des deux operations
     * d'ecriture, et c'est pour ca qu'on le garde. Un mot de passe vide hache
     * par bcrypt donne une empreinte parfaitement VALIDE : pas une colonne
     * vide qu'on remarque, un compte dont le mot de passe est « rien ».
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
     * exactement le motif 2 de `revue-de-code`, ou un garde juste a la creation etait
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
     * LE CAS QUI MANQUAIT — ET C'ETAIT LE PLUS GRAVE DES QUATRE.
     *
     * Les quatre tests au-dessus couvrent `Post`+`null`, `Post`+`''`,
     * `Post`+valable et `Patch`+`null`. Aucun ne passait `Patch` avec `''`.
     * Consequence mesuree le 19 septembre 2026 : remettre l'ancienne condition
     * `if ($creation && $seraitVide)` laissait les QUATRE au vert, alors que le
     * defaut qu'elle a produit murait un compte pour de bon.
     *
     * Le correctif le plus lourd de la journee etait le seul sans test. C'est
     * le motif 4 : ce qui n'est pas eprouve n'est pas garde.
     *
     * LA DISTINCTION QUI COMPTE : sur un `PATCH`, `null` veut dire « je ne
     * touche pas au mot de passe » et doit passer (test precedent) ; `''` veut
     * dire « efface-le », ce que personne ne peut vouloir. Les deux se
     * ressemblent apres deserialisation, et c'est tout le piege.
     *
     * ON VERIFIE LE MESSAGE, PAS SEULEMENT LA CLASSE — et ce n'est pas du
     * zele. La premiere ecriture de ce test n'attendait que
     * `UnprocessableEntityHttpException`, et elle passait AUSSI avec l'ancienne
     * condition : le `PATCH` tombait alors deux lignes plus bas sur « Indique
     * ton mot de passe actuel », qui leve la MEME classe. Un test vert pour la
     * mauvaise raison — exactement ce qu'il etait cense empecher. Mesure en
     * remettant l'ancienne condition : `OK (5 tests)`.
     */
    public function testUnPatchQuiEnvoieUnMotDePasseVideEstRefuse(): void
    {
        $existant = (new Utilisateur())->setEmail('deja@exemple.fr')->setNom('Deja');
        $existant->setMotDePasseClair('');
        $precedent = (new Utilisateur())->setEmail('deja@exemple.fr')->setNom('Deja');

        $persistes = [];

        try {
            self::processeur($persistes)->process(
                $existant,
                new Patch(),
                [],
                ['previous_data' => $precedent],
            );
            self::fail('Un mot de passe vide envoye expres doit etre refuse.');
        } catch (UnprocessableEntityHttpException $e) {
            self::assertStringContainsString(
                'Donne un mot de passe a ce compte', $e->getMessage(),
                'Le refus doit venir du garde du mot de passe vide, et non du '
                . 'controle du mot de passe actuel qui leve la meme classe deux '
                . 'lignes plus bas.',
            );
        } finally {
            self::assertSame([], $persistes,
                'un mot de passe vide ne doit jamais atteindre la persistance, '
                . 'ni a la creation ni a la modification');
        }
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
            /* Le VRAI service, autour d'un EntityManager double : aucun de ces
               tests ne change de mot de passe sur un compte existant, donc
               aucun ne coupe de session. Ce qui se passe quand on en change,
               c'est `RevocationDeSessionTest` qui le tient. */
            new JetonsRafraichissement(self::createStub(EntityManagerInterface::class)),
        );
    }
}
