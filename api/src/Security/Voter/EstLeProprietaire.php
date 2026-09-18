<?php

declare(strict_types=1);

namespace App\Security\Voter;

use App\Entity\ProprieteUtilisateur;
use App\Entity\Utilisateur;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Authorization\Voter\Voter;

/**
 * « CETTE DONNEE EST-ELLE A MOI ? »
 *
 * POURQUOI CETTE CLASSE EXISTE
 *
 * La question etait recopiee a la main, et elle l'etait DEUX fois :
 * `$plan->getUtilisateur() !== $utilisateur` dans `PlansController`,
 * `$modele->getUtilisateur() !== $utilisateur` dans `OrdreModeleProcessor`.
 * Deux copies d'une meme decision. Le projet sait ou cela mene : la faille de
 * septembre 2026 venait d'un controle present sur un chemin d'ecriture et
 * absent sur son jumeau.
 *
 * La documentation Symfony 7.4 range cela sous « Use Voters to Implement
 * Fine-grained Security Restrictions ». Le ROLE se verifie tres bien par
 * `#[IsGranted('ROLE_USER')]` — inutile d'y toucher. Mais « cet objet-ci
 * est-il a moi » porte sur un objet, et c'est exactement ce qu'un voter fait.
 *
 * IL DECIDE, IL NE REPOND PAS
 *
 * Les appelants repondent **404**, le meme texte pour « n'existe pas » et pour
 * « ne t'appartient pas » : distinguer apprendrait a un inconnu quels
 * identifiants existent. Le voter dit oui ou non ; ce qu'on renvoie reste le
 * choix de l'appelant, et ce choix-la ne change pas.
 *
 * IL VAUT POUR TOUTE ENTITE MARQUEE
 *
 * `ProprieteUtilisateur` est deja l'interface que `FiltreProprietaire` lit pour
 * poser son `WHERE` sur les collections. Le voter s'appuie sur la meme marque :
 * une entite qui nait filtree nait aussi verifiable, sans qu'on ait a se
 * souvenir d'ecrire un troisieme controle quelque part.
 */
final class EstLeProprietaire extends Voter
{
    /** « C'est le mien. » */
    public const MIEN = 'MIEN';

    protected function supports(string $attribute, mixed $subject): bool
    {
        return self::MIEN === $attribute && $subject instanceof ProprieteUtilisateur;
    }

    protected function voteOnAttribute(string $attribute, mixed $subject, TokenInterface $token): bool
    {
        $moi = $token->getUser();
        \assert($subject instanceof ProprieteUtilisateur);

        if (!$moi instanceof Utilisateur) {
            return false;
        }

        $proprietaire = $subject->getUtilisateur();

        /* UNE DONNEE SANS PROPRIETAIRE N'EST A PERSONNE. L'interface autorise
           `null` — une entite en cours de construction, ou mal posee. Repondre
           « accorde » ferait d'un oubli une porte ouverte. */
        if (null === $proprietaire) {
            return false;
        }

        /* ON COMPARE LES IDENTIFIANTS, pas les instances. Les deux appelants
           comparaient les objets (`!==`), ce qui ne tient que tant que les deux
           viennent du meme gestionnaire d'entites. L'identifiant, lui, ne
           depend pas de qui a charge l'objet. */
        return $proprietaire->getId()->equals($moi->getId());
    }
}
