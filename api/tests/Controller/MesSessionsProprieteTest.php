<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Controller\MesSessionsController;
use App\Entity\JetonRafraichissement;
use App\Entity\Utilisateur;
use App\Service\JetonsRafraichissement;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\EntityRepository;
use PHPUnit\Framework\TestCase;
use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Security\Core\Authentication\Token\Storage\TokenStorage;
use Symfony\Component\Security\Core\Authentication\Token\UsernamePasswordToken;
use Symfony\Component\Uid\Uuid;

/**
 * ON NE VOIT ET ON NE COUPE QUE SES PROPRES SESSIONS.
 *
 * CONSTAT M-02 DE L'AUDIT DU 7 SEPTEMBRE 2026, SECOND VOLET.
 *
 * Le premier volet — 14 septembre 2026 — a ramene la duree du jeton de
 * rafraichissement d'un an a 90 jours glissants. L'audit disait deja que ce
 * n'etait pas le vrai probleme : « Ce qui manque n'est pas la rotation, c'est
 * la VISIBILITE — rien ne permet de constater ni de couper une session
 * precise. » Les trois leviers de revocation qui existaient — deconnexion,
 * changement de mot de passe, desactivation du compte — sont tous « tout ou
 * rien », et supposent qu'on soupconne deja quelque chose.
 *
 * `GET /api/mes-sessions` et `DELETE /api/mes-sessions/{id}` comblent ce trou.
 * Mais une route qui liste des sessions est, par construction, une route qui
 * peut en lister d'autres que les siennes : c'est la regle 2 du projet, et le
 * corollaire de la faille E1 du 8 septembre 2026 s'applique mot pour mot —
 * `DELETE` recoit un identifiant du client, donc `DELETE` verifie la propriete.
 *
 * CE QUE CE TEST PEUT ECHOUER. Le depot en memoire ci-dessous ne connait pas
 * la regle : il applique betement les criteres qu'on lui donne, comme le ferait
 * Doctrine. Retirer `'utilisateur' => ...` du `findOneBy` de
 * `JetonsRafraichissement::revoquerPour()` suffit donc a rendre la session de
 * Bob a Alice, et le test tombe. Verifie en le faisant.
 *
 * L'EMPREINTE NE SORT PAS. Le jeton n'est stocke qu'en SHA-256 justement pour
 * qu'une fuite de la base n'ouvre aucune session ; une route qui la rendrait au
 * client defairait cette precaution d'un coup. Un temoin le verifie sur le
 * corps rendu, pas sur la lecture du code.
 */
final class MesSessionsProprieteTest extends TestCase
{
    public function testLaListeNeRendQueMesSessions(): void
    {
        $alice = new Utilisateur();
        $bob = new Utilisateur();

        $sienne = new JetonRafraichissement($alice, 'empreinte-alice', new \DateTimeImmutable('+90 days'));
        $autre = new JetonRafraichissement($bob, 'empreinte-bob', new \DateTimeImmutable('+90 days'));

        $reponse = self::controleur([$sienne, $autre], $alice)->lister();

        self::assertSame(200, $reponse->getStatusCode());
        self::assertSame(
            [$sienne->getId()->toRfc4122()],
            \array_column(self::corps($reponse), 'id'),
            'la liste doit porter ma session, et elle seule'
        );
    }

    /**
     * LE TEMOIN DU PRECEDENT. Un filtre trop large ne rendrait rien du tout et
     * laisserait le premier test au vert : « aucune session » satisfait aussi
     * bien « pas celles des autres ».
     */
    public function testLaListeRendBienMesSessionsAMoi(): void
    {
        $alice = new Utilisateur();
        $premiere = new JetonRafraichissement($alice, 'empreinte-1', new \DateTimeImmutable('+90 days'));
        $seconde = new JetonRafraichissement($alice, 'empreinte-2', new \DateTimeImmutable('+90 days'));

        $reponse = self::controleur([$premiere, $seconde], $alice)->lister();

        $ids = \array_column(self::corps($reponse), 'id');
        \sort($ids);
        $attendus = [$premiere->getId()->toRfc4122(), $seconde->getId()->toRfc4122()];
        \sort($attendus);

        self::assertSame($attendus, $ids, 'mes deux sessions doivent apparaitre');
    }

    /**
     * L'ecran doit pouvoir dire « ouverte le », « expire le » et « vue le ».
     * L'empreinte, elle, ne doit apparaitre nulle part — ni sous ce nom, ni
     * sous un autre : on compare le corps entier, pas la liste des cles.
     */
    public function testLaListeNeLivreJamaisLEmpreinte(): void
    {
        $alice = new Utilisateur();
        $jeton = new JetonRafraichissement($alice, 'empreinte-tres-reconnaissable', new \DateTimeImmutable('+90 days'));

        $reponse = self::controleur([$jeton], $alice)->lister();

        self::assertStringNotContainsString('empreinte-tres-reconnaissable', (string) $reponse->getContent(),
            'rendre l\'empreinte defait la raison meme de ne stocker que le SHA-256');

        $ligne = self::corps($reponse)[0];
        self::assertSame(['id', 'creeLe', 'expireLe', 'vuLe'], \array_keys($ligne),
            'la ligne ne porte que ce que l\'ecran affiche');
    }

    public function testCouperLaSessionDUnAutreEstRefuse(): void
    {
        $alice = new Utilisateur();
        $bob = new Utilisateur();

        $celleDeBob = new JetonRafraichissement($bob, 'empreinte-bob', new \DateTimeImmutable('+90 days'));
        $retires = [];

        $controleur = self::controleur([$celleDeBob], $alice, $retires);
        $reponse = $controleur->couper($celleDeBob->getId()->toRfc4122());

        self::assertSame(404, $reponse->getStatusCode(),
            'meme reponse que pour un identifiant inexistant : distinguer les deux dirait a Alice quelles sessions existent');
        self::assertSame([], $retires,
            'la session de Bob doit rester ouverte : Alice ne peut pas le deconnecter');
    }

    /**
     * LE TEMOIN, et il n'est pas decoratif : un controle qui refuse tout le
     * monde ressemble a une correction et laisse le test precedent au vert.
     */
    public function testCouperMaPropreSessionPasse(): void
    {
        $alice = new Utilisateur();
        $sienne = new JetonRafraichissement($alice, 'empreinte-alice', new \DateTimeImmutable('+90 days'));
        $retires = [];

        $controleur = self::controleur([$sienne], $alice, $retires);
        $reponse = $controleur->couper($sienne->getId()->toRfc4122());

        self::assertSame(204, $reponse->getStatusCode(), 'je dois pouvoir couper ma propre session');
        self::assertSame([$sienne], $retires, 'et la ligne doit reellement disparaitre de la base');
    }

    /**
     * Un identifiant qui n'est meme pas un UUID ne doit pas se distinguer d'un
     * UUID inconnu : sinon la forme de la reponse renseigne sur ce qui existe.
     */
    public function testUnIdentifiantMalformeRepondCommeUnInconnu(): void
    {
        $alice = new Utilisateur();

        $reponse = self::controleur([], $alice)->couper('pas-un-uuid');

        self::assertSame(404, $reponse->getStatusCode());
    }

    // ------------------------------------------------------------------ outils

    /** @return array<int, array<string, mixed>> */
    private static function corps(JsonResponse $reponse): array
    {
        /** @var array<int, array<string, mixed>> $decode */
        $decode = \json_decode((string) $reponse->getContent(), true, 512, \JSON_THROW_ON_ERROR);

        return $decode;
    }

    /**
     * Le controleur monte avec son VRAI service, autour d'un depot en memoire.
     *
     * `JetonsRafraichissement` ne depend que de l'EntityManager : on teste donc
     * le cablage reel, pas une doublure du service. Le depot, lui, applique les
     * criteres recus sans rien y ajouter — c'est ce qui rend le test capable
     * d'echouer si la requete cesse d'etre bornee au proprietaire.
     *
     * @param list<JetonRafraichissement>  $enBase
     * @param list<JetonRafraichissement>  $retires ce que `remove()` a vu passer
     */
    private static function controleur(
        array $enBase,
        Utilisateur $connecte,
        array &$retires = [],
    ): MesSessionsController {
        $depot = self::createStub(EntityRepository::class);
        $depot->method('findBy')->willReturnCallback(
            /** @param array<string, mixed> $criteres */
            static fn (array $criteres): array => \array_values(\array_filter(
                $enBase,
                static fn (JetonRafraichissement $j): bool => self::correspond($j, $criteres),
            )));
        $depot->method('findOneBy')->willReturnCallback(
            /** @param array<string, mixed> $criteres */
            static function (array $criteres) use ($enBase): ?JetonRafraichissement {
                foreach ($enBase as $jeton) {
                    if (self::correspond($jeton, $criteres)) {
                        return $jeton;
                    }
                }

                return null;
            });

        $em = self::createStub(EntityManagerInterface::class);
        $em->method('getRepository')->willReturn($depot);
        $em->method('remove')->willReturnCallback(
            static function (object $entite) use (&$retires): void {
                \assert($entite instanceof JetonRafraichissement);
                $retires[] = $entite;
            });

        $controleur = new MesSessionsController(new JetonsRafraichissement($em));

        $stockage = new TokenStorage();
        $stockage->setToken(new UsernamePasswordToken($connecte, 'principal', $connecte->getRoles()));
        $conteneur = new Container();
        $conteneur->set('security.token_storage', $stockage);
        $controleur->setContainer($conteneur);

        return $controleur;
    }

    /**
     * Ce que ferait Doctrine, et rien de plus.
     *
     * Un critere inconnu leve : si un jour la recherche se fait par empreinte,
     * on veut l'apprendre par un echec bruyant et non par un test qui passe.
     *
     * @param array<string, mixed> $criteres
     */
    private static function correspond(JetonRafraichissement $jeton, array $criteres): bool
    {
        foreach ($criteres as $champ => $attendu) {
            $valeur = match ($champ) {
                'id' => $jeton->getId(),
                'utilisateur' => $jeton->getUtilisateur(),
                default => throw new \LogicException("Critere inconnu dans le test : {$champ}"),
            };

            $egaux = $valeur instanceof Uuid && $attendu instanceof Uuid
                ? $valeur->equals($attendu)
                : $valeur === $attendu;

            if (!$egaux) {
                return false;
            }
        }

        return true;
    }
}
