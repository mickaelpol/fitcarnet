<?php

declare(strict_types=1);

namespace App\Security;

use App\Entity\Utilisateur;
use Symfony\Component\Security\Core\Exception\CustomUserMessageAccountStatusException;
use Symfony\Component\Security\Core\User\UserCheckerInterface;
use Symfony\Component\Security\Core\User\UserInterface;

/**
 * UN COMPTE DESACTIVE NE PASSE PAS.
 *
 * POURQUOI CETTE CLASSE EXISTE
 *
 * La colonne `actif` existait depuis le premier jour du projet, et personne
 * ne la lisait. Un administrateur pouvait donc « bloquer » un compte, voir
 * l'ecran le confirmer, et la personne continuait a se connecter comme si de
 * rien n'etait. C'est le pire genre de panne : elle ne se signale nulle part,
 * et on ne s'en apercoit que le jour ou l'on comptait dessus.
 *
 * Une case a cocher qui ne fait rien est pire qu'une case absente. Absente,
 * on cherche un autre moyen ; presente, on croit le probleme regle.
 *
 * OU CA S'APPLIQUE
 *
 * Symfony appelle ce controleur a CHAQUE authentification : a la connexion
 * par mot de passe, et a chaque requete portant un jeton JWT. Un compte
 * desactive pendant qu'il est connecte perd donc l'acces a la requete
 * suivante — pas a l'expiration de son jeton une heure plus tard.
 *
 * Le rafraichissement de session, lui, passe hors pare-feu (voir
 * `security.yaml`) : `SessionController` fait la meme verification a la main.
 * Sans elle, un jeton de rafraichissement valide rouvrirait indefiniment la
 * session d'un compte bloque.
 *
 * CE QUE LE MESSAGE DIT, ET CE QU'IL NE DIT PAS
 *
 * Il dit que le compte est desactive, sans expliquer pourquoi ni par qui.
 * La personne concernee doit savoir a quoi s'en tenir — sinon elle croit a
 * une panne et reessaie vingt fois — mais le detail se regle entre humains,
 * pas dans une reponse HTTP.
 */
final class CompteActif implements UserCheckerInterface
{
    /**
     * Avant de verifier le mot de passe.
     *
     * ON REFUSE ICI, ET PAS APRES. Un compte desactive doit etre ecarte avant
     * meme qu'on regarde son mot de passe : c'est un calcul de hachage
     * epargne, et surtout aucune difference de temps de reponse entre un
     * compte bloque avec le bon mot de passe et un compte bloque avec le
     * mauvais.
     */
    public function checkPreAuth(UserInterface $user): void
    {
        if ($user instanceof Utilisateur && !$user->isActif()) {
            throw new CustomUserMessageAccountStatusException(
                'Ce compte est désactivé. Demande à l’administrateur de le réactiver.'
            );
        }
    }

    public function checkPostAuth(UserInterface $user): void
    {
        // Rien : tout ce qui compte se decide avant.
    }
}
