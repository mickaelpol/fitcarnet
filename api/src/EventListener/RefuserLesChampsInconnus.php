<?php

declare(strict_types=1);

namespace App\EventListener;

use App\Serializer\ChampsInconnus;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * REFUSER UN CORPS QUI NOMME UN CHAMP INEXISTANT — sur toute ressource API Platform.
 *
 * 15 septembre 2026. Apres le retrait de `Modele::$partage` (F-05), un POST
 * portant encore `"partage": true` recevait 201 : API Platform ignore ce qu'il
 * ne connait pas. L'appelant croyait avoir partage son modele ; rien ne l'etait.
 * Un succes qui n'a pas fait ce qu'on lui demandait ment plus qu'une erreur.
 *
 * ICI ET PAS SUR `Modele`. Poser la regle sur la seule ressource concernee,
 * c'est le motif de defaut dominant du projet : une decision juste appliquee a
 * un endroit et oubliee aux autres. Toute ressource, presente ou future, est
 * couverte des qu'elle porte `_api_resource_class` — pose par le chargeur de
 * routes d'API Platform. Les controleurs maison (`/mon-frigo/...`) ne le
 * portent pas : ils lisent leur corps eux-memes, champ par champ.
 *
 * APRES LE PARE-FEU (priorite 8) : un anonyme recoit 401 avant d'apprendre
 * quoi que ce soit du modele. Les noms de champs, eux, sont publics — la
 * documentation de l'API les liste.
 *
 * Pourquoi « inexistant » et pas « non inscriptible » : voir `ChampsInconnus`.
 */
#[AsEventListener(event: KernelEvents::REQUEST, priority: 0)]
final readonly class RefuserLesChampsInconnus
{
    public function __construct(private ChampsInconnus $champs)
    {
    }

    public function __invoke(RequestEvent $evenement): void
    {
        $requete = $evenement->getRequest();

        if (!$evenement->isMainRequest()
            || !\in_array($requete->getMethod(), ['POST', 'PUT', 'PATCH'], true)) {
            return;
        }

        $classe = $requete->attributes->get('_api_resource_class');

        if (!\is_string($classe) || !class_exists($classe)) {
            return;
        }

        $corps = json_decode($requete->getContent(), true);

        /* Un corps illisible n'est pas notre affaire : API Platform le refuse
           deja, avec un message sur la syntaxe. On ne double pas l'erreur. */
        if (!\is_array($corps)) {
            return;
        }

        $inconnus = $this->champs->inconnus($classe, $corps);

        if ([] === $inconnus) {
            return;
        }

        throw new BadRequestHttpException(\sprintf(
            'Champ(s) inconnu(s) : %s. Ils ne correspondent a rien dans cette ressource et ne seraient pas enregistres.',
            implode(', ', $inconnus),
        ));
    }
}
