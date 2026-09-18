<?php

declare(strict_types=1);

namespace App\Tests;

use ApiPlatform\Metadata\Patch;
use ApiPlatform\State\ProcessorInterface;
use App\Controller\ComptesController;
use App\Entity\JetonRafraichissement;
use App\Entity\Utilisateur;
use App\Repository\Comptes;
use App\Service\JetonsRafraichissement;
use App\State\UtilisateurProcessor;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\EntityRepository;
use PHPUnit\Framework\TestCase;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Security\Core\Authentication\Token\Storage\TokenStorage;
use Symfony\Component\Security\Core\Authentication\Token\UsernamePasswordToken;
use Symfony\Component\Uid\Uuid;

/**
 * COUPER TOUTES LES SESSIONS D'UN COMPTE : UNE SEULE REGLE, UN SEUL ENDROIT.
 *
 * CE QUI A ETE TROUVE LE 17 SEPTEMBRE 2026. Deux endroits supprimaient des
 * lignes de `jeton_rafraichissement` a la main, en SQL, avec la meme intention
 * et sans rien partager :
 *
 *   ComptesController::activer     DELETE ... WHERE utilisateur_id = :id
 *   UtilisateurProcessor::process  DELETE ... WHERE utilisateur_id = :u
 *
 * pendant que `App\Service\JetonsRafraichissement` — le service qui cree,
 * reconnait et revoque les jetons, et qui porte deja `revoquer()`,
 * `revoquerPour()` et `purger()` — ne savait pas couper un compte entier.
 *
 * C'est le motif de defaut dominant du projet, et il ne s'agit pas de style :
 * les deux copies DIVERGEAIENT DEJA. Celle du controleur tourne dans la
 * transaction du blocage ; celle du processeur passe un objet `Uuid` la ou
 * l'autre passe une chaine. Une troisieme porte — la suppression de compte —
 * s'en remet, elle, a la cascade de la base. Trois chemins, trois facons.
 *
 * Le jour ou la revocation devra faire une chose de plus — inscrire une trace,
 * prevenir l'appareil, compter ce qu'elle coupe — elle la fera a un endroit, et
 * l'autre continuera comme avant. C'est exactement ce qui s'est produit entre
 * `POST /mon-frigo/stock` et son jumeau `POST /mon-frigo/inventaire` en
 * septembre 2026.
 *
 * CE FICHIER TIENT LES TROIS BOUTS : la regle dans le service, et les deux
 * appelants qui l'appellent VRAIMENT — un test par porte, sans quoi la
 * deduplication pourrait en debrancher une sans que rien ne rougisse.
 */
final class RevocationDeSessionTest extends TestCase
{
    /**
     * LA REGLE, DANS LE SERVICE QUI CONNAIT LES JETONS.
     */
    public function testRevoquerToutCoupeLesSessionsDuCompte(): void
    {
        $alice = new Utilisateur();
        $telephone = new JetonRafraichissement($alice, 'empreinte-telephone', new \DateTimeImmutable('+90 days'));
        $portable = new JetonRafraichissement($alice, 'empreinte-portable', new \DateTimeImmutable('+90 days'));

        $retires = [];
        (new JetonsRafraichissement(self::em([$telephone, $portable], $retires)))->revoquerTout($alice);

        self::assertSame([$telephone, $portable], $retires,
            'couper un compte coupe TOUTES ses sessions : un appareil oublie dehors '
            . 'continuerait a se prolonger seul tous les 90 jours');
    }

    /**
     * LE TEMOIN, ET IL EST LA REGLE 2 DU PROJET.
     *
     * Une revocation qui viderait la table entiere passerait le test precedent
     * les doigts dans le nez, et deconnecterait tout le monde a chaque
     * changement de mot de passe.
     */
    public function testRevoquerToutNeTouchePasAuxSessionsDesAutres(): void
    {
        $alice = new Utilisateur();
        $bob = new Utilisateur();
        $sienne = new JetonRafraichissement($alice, 'empreinte-alice', new \DateTimeImmutable('+90 days'));
        $autre = new JetonRafraichissement($bob, 'empreinte-bob', new \DateTimeImmutable('+90 days'));

        $retires = [];
        (new JetonsRafraichissement(self::em([$sienne, $autre], $retires)))->revoquerTout($alice);

        self::assertSame([$sienne], $retires,
            'la session de Bob ne regarde pas Alice : le proprietaire est dans la requete');
    }

    /**
     * PREMIERE PORTE : DESACTIVER UN COMPTE.
     *
     * Le jeton d'acces vit une heure, le jeton de rafraichissement 90 jours
     * glissants : sans cette coupure, un compte « bloque » se prolongerait tout
     * seul aussi longtemps qu'on le laisse, et le blocage n'aurait d'effet qu'a
     * la prochaine deconnexion volontaire. Personne ne se deconnecte
     * volontairement.
     */
    public function testDesactiverUnCompteCoupeSesSessions(): void
    {
        $cible = new Utilisateur();
        $jeton = new JetonRafraichissement($cible, 'empreinte', new \DateTimeImmutable('+90 days'));

        $retires = [];
        $reponse = self::comptes([$jeton], $retires)
            ->activer($cible->getId()->toRfc4122(), self::requete(['actif' => false]));

        self::assertSame(200, $reponse->getStatusCode());
        self::assertSame([$jeton], $retires,
            'bloquer un compte sans couper ses sessions ne bloque rien avant une heure, '
            . 'puis rien du tout');
    }

    /**
     * LE TEMOIN DE CETTE PORTE : REACTIVER NE COUPE RIEN.
     *
     * Rendre l'acces a quelqu'un en le deconnectant serait absurde, et un
     * appel unique a la revocation — pose au mauvais endroit du controleur —
     * ferait exactement cela.
     */
    public function testReactiverUnCompteNeCoupeAucuneSession(): void
    {
        $cible = new Utilisateur();
        $jeton = new JetonRafraichissement($cible, 'empreinte', new \DateTimeImmutable('+90 days'));

        $retires = [];
        $reponse = self::comptes([$jeton], $retires)
            ->activer($cible->getId()->toRfc4122(), self::requete(['actif' => true]));

        self::assertSame(200, $reponse->getStatusCode());
        self::assertSame([], $retires, 'on ne deconnecte pas quelqu\'un a qui on rend l\'acces');
    }

    /**
     * SECONDE PORTE : CHANGER SON MOT DE PASSE.
     *
     * On change son mot de passe en urgence parce qu'on soupconne un vol. Si
     * les sessions ouvertes survivent, le geste ne sert a rien : le jeton vole
     * continue de produire des jetons d'acces neufs et se reprolonge a chaque
     * usage.
     */
    public function testChangerDeMotDePasseCoupeLesSessions(): void
    {
        $retires = [];
        $persistes = [];

        $precedent = (new Utilisateur())->setEmail('alice@exemple.fr')->setNom('Alice');
        $alice = (new Utilisateur())->setEmail('alice@exemple.fr')->setNom('Alice');
        $alice->setMotDePasseClair('un mot de passe tout neuf');
        $alice->setMotDePasseActuel('l\'ancien mot de passe');

        $jeton = new JetonRafraichissement($alice, 'empreinte', new \DateTimeImmutable('+90 days'));

        self::processeur([$jeton], $retires, $persistes)
            ->process($alice, new Patch(), [], ['previous_data' => $precedent]);

        self::assertSame([$alice], $persistes, 'le changement doit bien avoir ete enregistre');
        self::assertSame([$jeton], $retires,
            'un mot de passe change doit fermer les portes ouvertes — c\'est la seule '
            . 'raison pour laquelle on le change en urgence');
    }

    /**
     * LE TEMOIN DE CETTE PORTE : renommer son compte ne deconnecte personne.
     */
    public function testChangerSonNomNeCoupeAucuneSession(): void
    {
        $retires = [];
        $persistes = [];

        $precedent = (new Utilisateur())->setEmail('alice@exemple.fr')->setNom('Ancien nom');
        $alice = (new Utilisateur())->setEmail('alice@exemple.fr')->setNom('Nouveau nom');

        $jeton = new JetonRafraichissement($alice, 'empreinte', new \DateTimeImmutable('+90 days'));

        self::processeur([$jeton], $retires, $persistes)
            ->process($alice, new Patch(), [], ['previous_data' => $precedent]);

        self::assertSame([], $retires, 'changer de nom n\'est pas un incident de securite');
    }

    /**
     * L'INVENTAIRE, ET C'EST LUI QUI EMPECHE LA TROISIEME COPIE.
     *
     * Les deux tests d'appelants ci-dessus prouvent que les deux portes
     * connues coupent bien les sessions — ils resteraient verts si une
     * TROISIEME les recopiait en SQL demain. Ce test-la refuse le nom de la
     * table partout ailleurs que dans l'entite qui la declare : passer par le
     * service devient le seul chemin possible, et deroger devient un acte
     * visible en revue.
     */
    public function testLeNomDeLaTableNEstEcritQueDansSonEntite(): void
    {
        $fautifs = [];

        foreach (self::fichiersSource() as $fichier) {
            if (\str_contains((string) \file_get_contents($fichier), 'jeton_rafraichissement')
                && !\str_ends_with($fichier, 'Entity/JetonRafraichissement.php')) {
                $fautifs[] = \substr($fichier, \strlen(\dirname(__DIR__)) + 1);
            }
        }

        self::assertSame([], $fautifs,
            'couper des sessions en SQL a la main, c\'est une regle de plus a oublier '
            . 'quand elle changera : passer par JetonsRafraichissement');
    }

    // ------------------------------------------------------------------ outils

    /** @return list<string> */
    private static function fichiersSource(): array
    {
        $fichiers = [];
        $dossier = new \RecursiveDirectoryIterator(__DIR__ . '/../src', \FilesystemIterator::SKIP_DOTS);

        foreach (new \RecursiveIteratorIterator($dossier) as $fichier) {
            \assert($fichier instanceof \SplFileInfo);

            if ('php' === $fichier->getExtension()) {
                $fichiers[] = $fichier->getPathname();
            }
        }

        \sort($fichiers);

        return $fichiers;
    }

    /**
     * Le VRAI service autour d'un depot en memoire — meme motif que
     * `MesSessionsProprieteTest` : le depot applique betement les criteres
     * recus, comme le ferait Doctrine, donc le test tombe si la requete cesse
     * d'etre bornee au proprietaire.
     *
     * @param list<JetonRafraichissement> $enBase
     * @param list<JetonRafraichissement> $retires ce que `remove()` a vu passer
     */
    private static function em(array $enBase, array &$retires): EntityManagerInterface
    {
        $depot = self::createStub(EntityRepository::class);
        $depot->method('findBy')->willReturnCallback(
            /** @param array<string, mixed> $criteres */
            static fn (array $criteres): array => \array_values(\array_filter(
                $enBase,
                static fn (JetonRafraichissement $j): bool => self::correspond($j, $criteres),
            )));

        $em = self::createStub(EntityManagerInterface::class);
        $em->method('getRepository')->willReturn($depot);
        $em->method('remove')->willReturnCallback(
            static function (object $entite) use (&$retires): void {
                \assert($entite instanceof JetonRafraichissement);
                $retires[] = $entite;
            });

        return $em;
    }

    /** @param array<string, mixed> $criteres */
    private static function correspond(JetonRafraichissement $jeton, array $criteres): bool
    {
        foreach ($criteres as $champ => $attendu) {
            if ('utilisateur' !== $champ) {
                throw new \LogicException("Critere inconnu dans le test : {$champ}");
            }

            $proprietaire = $jeton->getUtilisateur()->getId();

            $egaux = match (true) {
                $attendu instanceof Utilisateur => $attendu->getId()->equals($proprietaire),
                $attendu instanceof Uuid => $attendu->equals($proprietaire),
                default => (string) $attendu === $proprietaire->toRfc4122(),
            };

            if (!$egaux) {
                return false;
            }
        }

        return true;
    }

    /**
     * Le controleur d'administration, monte avec son vrai service.
     *
     * @param list<JetonRafraichissement> $enBase
     * @param list<JetonRafraichissement> $retires
     */
    private static function comptes(array $enBase, array &$retires): ComptesController
    {
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchAssociative')->willReturnCallback(
            /** @param array<string, mixed> $params */
            static fn (string $sql, array $params = []): array => [
                'id' => (string) ($params['id'] ?? ''),
                'email' => 'cible@exemple.fr',
                'nom' => 'Cible',
                'roles' => 'ROLE_USER',
                'actif' => true,
            ]);
        // Deux administrateurs actifs : `ProtectionDuCompte` n'a aucune raison
        // de refuser, et le test porte donc bien sur les sessions.
        $cnx->method('fetchOne')->willReturn(2);
        // Sans cela, la transaction ne ferait RIEN et le test passerait au vert
        // pour une mauvaise raison.
        $cnx->method('transactional')->willReturnCallback(
            static fn (callable $travail): mixed => $travail());

        $administrateur = (new Utilisateur())->setRoles(['ROLE_ADMIN']);

        /* Le SQL et la transaction vivent dans le depot depuis le 18 septembre
           2026. Le test monte donc le depot autour de la meme Connection
           doublee : ce qu'il surveille — la revocation part, ou ne part pas —
           ne change pas de place. */
        $controleur = new ComptesController(new Comptes(
            $cnx, new JetonsRafraichissement(self::em($enBase, $retires))));
        $controleur->setContainer(self::conteneur($administrateur));

        return $controleur;
    }

    /**
     * @param list<JetonRafraichissement> $enBase
     * @param list<JetonRafraichissement> $retires
     * @param list<mixed>                 $persistes
     */
    private static function processeur(array $enBase, array &$retires, array &$persistes): UtilisateurProcessor
    {
        $persistance = self::createStub(ProcessorInterface::class);
        $persistance->method('process')->willReturnCallback(
            static function (mixed $donnee) use (&$persistes): mixed {
                $persistes[] = $donnee;

                return $donnee;
            });

        $hacheur = self::createStub(UserPasswordHasherInterface::class);
        $hacheur->method('hashPassword')->willReturnCallback(
            static fn (mixed $u, string $clair): string => 'hache:' . $clair);
        $hacheur->method('isPasswordValid')->willReturn(true);

        return new UtilisateurProcessor(
            $persistance,
            $hacheur,
            self::createStub(Security::class),
            new JetonsRafraichissement(self::em($enBase, $retires)),
        );
    }

    /** @param array<string, mixed> $corps */
    private static function requete(array $corps): Request
    {
        return new Request([], [], [], [], [], [], (string) \json_encode($corps));
    }

    private static function conteneur(Utilisateur $connecte): Container
    {
        $stockage = new TokenStorage();
        $stockage->setToken(new UsernamePasswordToken($connecte, 'principal', $connecte->getRoles()));

        $conteneur = new Container();
        $conteneur->set('security.token_storage', $stockage);

        return $conteneur;
    }
}
