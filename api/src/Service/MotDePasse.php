<?php

declare(strict_types=1);

namespace App\Service;

/**
 * CE MOT DE PASSE CONVIENT-IL, ET SINON QU'EST-CE QUI LUI MANQUE.
 *
 * LE SEUL JUGE DE L'API. Trois portes creent ou changent un mot de passe —
 * l'acceptation d'une invitation, le `PATCH` d'un compte, la commande console —
 * et avant le 18 septembre 2026 elles portaient DEUX regles differentes :
 * `Assert\Length(min: 10)` sur l'entite, `Invitation::motDePasseAcceptable()`
 * ailleurs. Elles disaient la meme chose par accident, et rien ne les y
 * obligeait. Elles passent toutes par ici desormais.
 *
 * LE QUATRIEME JUGE EST DANS LE FRONT, et on ne peut pas l'y eviter : la jauge
 * doit repondre pendant la frappe, sans aller-retour reseau. Les deux sont donc
 * verrouilles sur `api/regles/motdepasse.json`, que leurs deux suites de tests
 * lisent — meme dispositif que `rendement.json`, invente pour le constat 04#7
 * ou deux juges divergeaient en silence.
 *
 * LA DECISION, TRANCHEE LE 18 SEPTEMBRE 2026 par le proprietaire du projet.
 * `Invitation` argumentait CONTRE les regles de composition : « ces regles
 * produisent Motdepasse1! — court, previsible, et note sur un papier ; la
 * longueur est la seule contrainte qui augmente vraiment le cout d'une
 * attaque ». Cet argument reste vrai, et c'est pourquoi la longueur minimale
 * passe de 10 a 12 EN MEME TEMPS que les quatre exigences arrivent : une
 * composition imposee reduit l'aleatoire disponible, la longueur le rend.
 *
 * ON NOMME TOUT CE QUI MANQUE, PAS LE PREMIER DEFAUT. Un ecran qui dit une
 * chose a la fois fait recommencer quatre fois — et c'est la meilleure facon
 * de faire choisir « Motdepasse1! » a quelqu'un d'excede.
 *
 * @see MotDePassePartageTest
 */
final class MotDePasse
{
    /**
     * Douze caracteres.
     *
     * C'ETAIT DIX, ET LE CHIFFRE A BOUGE AVEC LES EXIGENCES. Imposer quatre
     * familles retire du choix : sur dix caracteres contraints, il ne reste pas
     * grand-chose d'aleatoire. Douze rend ce qu'on vient de prendre, et coute
     * une syllabe.
     *
     * LES COMPTES EXISTANTS NE SONT PAS CONCERNES : cette regle vaut pour un
     * mot de passe qu'on CREE ou qu'on CHANGE. Personne ne se retrouve dehors
     * un matin. Ceux qui ne la respecteraient plus sont signales a l'ecran —
     * voir `Utilisateur::$motDePasseFaible`, pose a la connexion, seul moment
     * ou le mot de passe est en clair.
     */
    public const LONGUEUR_MINIMALE = 12;

    /**
     * Ce qui manque a ce mot de passe, dans l'ordre de la liste partagee.
     *
     * Vide veut dire « rien ne manque ». L'ordre est celui de
     * `api/regles/motdepasse.json`, et il compte : c'est celui dans lequel
     * l'ecran affiche la liste, et c'est celui que le test partage verifie.
     *
     * `\p{Ll}` ET `\p{Lu}` PLUTOT QUE `a-z` ET `A-Z` — avec le drapeau `u`.
     * « é » est une minuscule et « É » une majuscule ; les classes ASCII les
     * declareraient « speciales », et « Été3cetÉtéLà! » se verrait alors
     * refuser sa majuscule tout en obtenant un caractere special qu'il n'a pas.
     * Deux erreurs qui se compensent presque, ce qui est la pire espece.
     *
     * @return list<string>
     */
    public static function manquements(string $motDePasse): array
    {
        $manque = [];

        // Les CARACTERES, pas les octets : `strlen` declarerait « Été… » plus
        // long qu'il n'est, et laisserait donc passer plus court que la regle.
        if (\mb_strlen($motDePasse) < self::LONGUEUR_MINIMALE) {
            $manque[] = 'longueur';
        }
        if (1 !== \preg_match('/\p{Ll}/u', $motDePasse)) {
            $manque[] = 'minuscule';
        }
        if (1 !== \preg_match('/\p{Lu}/u', $motDePasse)) {
            $manque[] = 'majuscule';
        }
        if (1 !== \preg_match('/\p{Nd}/u', $motDePasse)) {
            $manque[] = 'chiffre';
        }
        /* NI LETTRE, NI CHIFFRE, NI ESPACE. L'espace est exclu expres : une
           phrase de passe en contient sans que ce soit un choix, et le compter
           ferait passer « mon chat dort » pour plus solide qu'il n'est. */
        if (1 !== \preg_match('/[^\p{L}\p{Nd}\s]/u', $motDePasse)) {
            $manque[] = 'special';
        }

        return $manque;
    }

    /** Rien ne manque. */
    public static function acceptable(string $motDePasse): bool
    {
        return [] === self::manquements($motDePasse);
    }

    /**
     * Ce qui manque, dit a la personne qui tape.
     *
     * UNE SEULE PHRASE, QUI ENUMERE. « Il manque une majuscule et un chiffre »
     * se lit d'un coup d'oeil ; quatre messages successifs font recommencer
     * quatre fois, et c'est ainsi qu'on obtient « Motdepasse1! ».
     *
     * Le front a sa propre traduction — il affiche une liste cochee pendant la
     * frappe, ce qu'un message d'erreur ne peut pas faire. Les deux disent la
     * meme chose parce qu'ils partent des memes codes.
     */
    public static function pourquoiRefuse(string $motDePasse): ?string
    {
        $manque = self::manquements($motDePasse);
        if ([] === $manque) {
            return null;
        }

        /* CES PHRASES S'AFFICHENT A L'ECRAN : elles portent leurs accents,
           contrairement aux commentaires de ce fichier. La convention du projet
           est la : commentaires PHP sans accents, textes destines a quelqu'un
           avec. « un caractere special » manquait les siens, et se serait lu
           tel quel sur l'ecran de creation de compte. */
        $dits = \array_map(static fn (string $code): string => match ($code) {
            'longueur' => \sprintf('%d caractères au minimum', self::LONGUEUR_MINIMALE),
            'minuscule' => 'une lettre minuscule',
            'majuscule' => 'une lettre majuscule',
            'chiffre' => 'un chiffre',
            'special' => 'un caractère spécial',
            default => $code,
        }, $manque);

        $dernier = \array_pop($dits);

        return 'Il manque ' . ([] === $dits ? $dernier : \implode(', ', $dits) . ' et ' . $dernier) . '.';
    }
}
