<?php

declare(strict_types=1);

namespace App\Controller;

use App\Service\VerdictAliment;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * CE QUE L'ECRAN DOIT DIRE, DEMANDE AU SERVEUR.
 *
 * DECISION DU 20 SEPTEMBRE 2026 : « tout doit passer par le serveur car le
 * metier doit etre sur le serveur et puis c'est tout, comme ca je peux changer
 * le front quand bon me semble ».
 *
 * Cette route ne lit rien et n'ecrit rien. Elle repond a une seule question :
 * « voila ce qui est tape — qu'est-ce que j'affiche, et puis-je enregistrer ? »
 *
 * POURQUOI UNE ROUTE ET NON UN FICHIER DE REGLES. Un fichier de regles est un
 * contrat : il suppose qu'un futur front pense a le lire. Une route ne le
 * suppose pas — un ecran qui ne l'appelle pas n'affiche rien, et ca se voit
 * tout de suite. C'est la difference entre une duplication gardee et une
 * duplication supprimee.
 *
 * ELLE EST APPELEE PENDANT LA SAISIE, avec anti-rebond cote ecran : un appel
 * par PAUSE de frappe, pas par caractere. L'ecran garde le dernier verdict en
 * attendant le suivant, si bien que rien ne clignote.
 *
 * HORS LIGNE, IL N'Y A PAS DE VERDICT, et c'est assume : le mode hors ligne du
 * projet est « lecture, ecritures en file, aucun calcul nouveau ». Une saisie
 * faite hors ligne part en file et se fait juger au moment ou elle passe.
 */
#[Route('/api')]
final class VerificationController extends AbstractController
{
    /**
     * Le verdict d'un aliment en cours de saisie.
     *
     * AUTHENTIFIEE, bien qu'elle ne touche a aucune donnee : elle repond sur
     * des regles metier, et rien n'oblige a les offrir a qui n'a pas de compte.
     *
     * AUCUN CHAMP N'EST OBLIGATOIRE : c'est tout l'interet. L'ecran appelle des
     * la premiere frappe, et le serveur dit ce qu'il peut dire avec ce qu'il a.
     */
    #[Route('/verification/aliment', methods: ['POST'])]
    #[IsGranted('IS_AUTHENTICATED_FULLY')]
    public function aliment(Request $requete): JsonResponse
    {
        /** @var array<string, mixed> $saisie */
        $saisie = (array) \json_decode((string) $requete->getContent(), true);

        return $this->json(VerdictAliment::pour($saisie));
    }
}
