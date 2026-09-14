<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Entity\JetonRafraichissement;
use App\Entity\Utilisateur;
use App\Service\JetonsRafraichissement;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\EntityRepository;
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
 * SECOND VOLET, 15 septembre 2026 : la VISIBILITE, qui etait la vraie reponse
 * au constat. `GET /api/mes-sessions` et `DELETE /api/mes-sessions/{id}`
 * existent desormais — l'isolation entre comptes de ces deux routes est
 * eprouvee par `MesSessionsProprieteTest`. Ce qui manquait a la table, et que
 * les temoins ci-dessous figent, c'est « vu le » : une liste de sessions
 * qui n'affiche pas la derniere utilisation ne permet pas de reconnaitre celle
 * qu'on ne reconnait pas.
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

        $jeton->prolonger(new \DateTimeImmutable(JetonsRafraichissement::DUREE),
            new \DateTimeImmutable());

        self::assertEcheanceDansQuatreVingtDixJours($jeton->getExpireLe(),
            'se servir de l\'application doit repousser l\'echeance, pas la laisser courir');
    }

    /**
     * NAITRE EST UN USAGE. Une session vient d'etre ouverte par une connexion :
     * dire « jamais utilisee » de celle-la serait faux, et un ecran qui affiche
     * une date fausse est pire qu'un ecran qui n'en affiche pas (regle 7).
     *
     * `vu_le` reste neanmoins NULLABLE : les lignes anterieures a la migration
     * 32 n'ont pas de derniere utilisation connue, et « je ne sais pas » ne se
     * remplace pas par une valeur plausible (regle 6). C'est la seule facon
     * qu'a cette colonne d'etre vide.
     */
    public function testUneSessionNeuveEstVueALInstantOuElleNait(): void
    {
        $jeton = self::jetonCree();

        self::assertEquals($jeton->getCreeLe(), $jeton->getVuLe(),
            'une session qu\'on vient d\'ouvrir a servi a l\'instant meme');
    }

    /**
     * SANS CE TEMOIN, LA LISTE DES SESSIONS MENTIRAIT PAR OMISSION.
     *
     * L'echeance seule ne distingue rien : elle est repoussee de 90 jours a
     * chaque usage, donc deux sessions utilisees a un mois d'intervalle
     * affichent la meme chose a un mois pres. Ce qui permet de reconnaitre
     * l'appareil qu'on ne reconnait pas, c'est « vu le » — et il faut donc
     * qu'un usage l'inscrive vraiment.
     */
    public function testChaqueUsageInscritLeMomentDeCetUsage(): void
    {
        $jeton = new JetonRafraichissement(new Utilisateur(), 'empreinte',
            new \DateTimeImmutable('+2 days'));

        /* Un instant EXPLICITE, et volontairement loin de maintenant : compare
           a `new \DateTimeImmutable()`, ce temoin passerait meme si `prolonger`
           n'ecrivait rien, puisque le constructeur vient de poser l'heure. */
        $usage = new \DateTimeImmutable('2026-09-15 08:30:00');
        $jeton->prolonger(new \DateTimeImmutable(JetonsRafraichissement::DUREE), $usage);

        self::assertEquals($usage, $jeton->getVuLe(),
            'un rafraichissement doit inscrire le moment ou il a eu lieu');
    }

    /**
     * LE VRAI CHEMIN, celui qu'emprunte un rafraichissement reel.
     *
     * Les deux temoins precedents appellent `prolonger()` a la main. Le seul
     * appelant de production, lui, est `utilisateurPour()` — et c'est lui qui
     * derive l'echeance de l'instant d'usage. Sans ce temoin, la ligne qui fait
     * les deux d'un coup n'etait couverte par rien : on aurait pu inscrire une
     * derniere utilisation sans repousser l'echeance, ou l'inverse.
     */
    public function testUnRafraichissementReelRepousseEtInscritEnMemeTemps(): void
    {
        $utilisateur = new Utilisateur();
        $jeton = new JetonRafraichissement($utilisateur, \hash('sha256', 'secret'),
            new \DateTimeImmutable('+2 days'));

        $depot = self::createStub(EntityRepository::class);
        $depot->method('findOneBy')->willReturn($jeton);
        $em = self::createStub(EntityManagerInterface::class);
        $em->method('getRepository')->willReturn($depot);

        $avant = new \DateTimeImmutable();
        $rendu = (new JetonsRafraichissement($em))->utilisateurPour('secret');

        self::assertSame($utilisateur, $rendu, 'le jeton valide doit rendre son compte');
        self::assertEcheanceDansQuatreVingtDixJours($jeton->getExpireLe(),
            'un rafraichissement reel doit repousser l\'echeance');
        self::assertGreaterThanOrEqual($avant, $jeton->getVuLe(),
            'et inscrire le moment de cet usage, pas celui de la creation');
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
