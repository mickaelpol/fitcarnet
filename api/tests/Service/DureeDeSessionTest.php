<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Entity\JetonRafraichissement;
use App\Entity\Utilisateur;
use App\Service\JetonsRafraichissement;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\TestCase;

/**
 * COMBIEN DE TEMPS UN TELEPHONE OUBLIE RESTE-T-IL UNE PORTE OUVERTE.
 *
 * CONSTAT M-02 DE L'AUDIT DU 7 SEPTEMBRE 2026.
 *
 * Le jeton de rafraichissement est tire sur 256 bits et n'est stocke qu'en
 * SHA-256 : sur ce point rien a redire. Mais son echeance etait repoussee
 * d'UN AN a chaque utilisation, et il n'est jamais remplace. Un jeton copie
 * — sauvegarde de telephone, appareil revendu, journal de proxy — ouvrait
 * donc un acces permanent et indetectable : le porteur legitime ne dispose
 * d'aucun ecran listant ses sessions, et rien ne trahit un second usage.
 *
 * Les leviers de revocation existent et fonctionnent (deconnexion, changement
 * de mot de passe, desactivation du compte) mais sont tous « tout ou rien »,
 * et supposent qu'on soupconne quelque chose.
 *
 * Decision du 14 septembre 2026 : 90 jours glissants. Une session reellement
 * active ne le sent jamais — l'echeance est repoussee a chaque usage — tandis
 * qu'un appareil oublie cesse d'etre une porte trois mois plus tard au lieu
 * de douze.
 *
 * CE QUE CELA NE REGLE PAS, et qui reste ouvert : la VISIBILITE. Rien ne
 * permet encore de constater ni de couper une session precise. La route
 * `GET /api/mes-sessions` + `DELETE /api/mes-sessions/{id}` reste la vraie
 * reponse au constat ; la table porte deja tout sauf « vu le ».
 */
final class DureeDeSessionTest extends TestCase
{
    /**
     * Un an etait trop long, et la valeur seule ne dit pas pourquoi. Ce
     * temoin porte la raison : sans lui, un retour a `+1 year` passerait
     * inapercu.
     */
    public function testUneSessionNouvelleExpireDansQuatreVingtDixJours(): void
    {
        $jeton = self::jetonCree();

        self::assertEcheanceDansQuatreVingtDixJours($jeton->getExpireLe(),
            'un appareil oublie doit cesser d\'etre une porte au bout de trois mois');
    }

    /**
     * L'echeance est GLISSANTE : c'est ce qui rend les 90 jours indolores.
     * Sans cette prolongation, la duree deviendrait une deconnexion forcee
     * tous les trois mois, y compris pour qui utilise l'application chaque
     * jour — et le remede serait pire que le mal.
     */
    public function testChaqueUsageRepousseLEcheanceDAutant(): void
    {
        $jeton = new JetonRafraichissement(new Utilisateur(), 'empreinte',
            new \DateTimeImmutable('+2 days'));

        $jeton->prolonger(new \DateTimeImmutable(JetonsRafraichissement::DUREE));

        self::assertEcheanceDansQuatreVingtDixJours($jeton->getExpireLe(),
            'se servir de l\'application doit repousser l\'echeance, pas la laisser courir');
    }

    /**
     * On compare des horodatages, et non un nombre de jours : `diff()->days`
     * tronque, et rend 89 pour une echeance a 89 j 23 h 59 m 59 s — le temps
     * ecoule entre la creation du jeton et la mesure suffit a la faire mentir.
     */
    private static function assertEcheanceDansQuatreVingtDixJours(
        \DateTimeImmutable $echeance, string $message): void
    {
        $attendu = (new \DateTimeImmutable('+90 days'))->getTimestamp();

        self::assertEqualsWithDelta($attendu, $echeance->getTimestamp(), 5, $message);
    }

    private static function jetonCree(): JetonRafraichissement
    {
        $persistes = [];

        $em = self::createStub(EntityManagerInterface::class);
        $em->method('persist')->willReturnCallback(
            static function (object $entite) use (&$persistes): void {
                $persistes[] = $entite;
            });

        (new JetonsRafraichissement($em))->creer(new Utilisateur());

        self::assertInstanceOf(JetonRafraichissement::class, $persistes[0] ?? null,
            'creer() doit persister un jeton');

        return $persistes[0];
    }
}
