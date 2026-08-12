<?php

declare(strict_types=1);

namespace App\Service;

/**
 * CE QUI EST VRAI D'UNE INVITATION, INDEPENDAMMENT DE LA BASE ET DU RESEAU.
 *
 * Tout ce que fait cette classe est calculable a partir de ses arguments :
 * fabriquer un jeton, en calculer l'empreinte, decider si une invitation est
 * encore valable, dire si un mot de passe convient. Aucune dependance, donc
 * des tests qui ne montent ni base ni conteneur — et qui verifient les seules
 * regles qui protegent reellement quelque chose.
 *
 * LE CONTROLEUR, LUI, N'A PLUS QU'A LIRE ET ECRIRE.
 */
final class Invitation
{
    /** Sept jours. Assez pour une personne en vacances, trop peu pour qu'on l'oublie. */
    public const DUREE_JOURS = 7;

    /** Le minimum du projet, celui de la commande console et de l'entite. */
    public const LONGUEUR_MOT_DE_PASSE = 10;

    /**
     * Fabrique un jeton d'invitation.
     *
     * 32 OCTETS TIRES AU SORT PAR LE SYSTEME, et pas `uniqid()`, `rand()` ni
     * un hachage de l'adresse. Un jeton devinable est un compte offert : il
     * n'y a rien d'autre entre un inconnu et la creation d'un utilisateur.
     * `random_bytes` echoue bruyamment plutot que de rendre du hasard faible,
     * ce qui est exactement ce qu'on veut ici.
     *
     * Encode en base64 « URL » sans remplissage : le jeton voyage dans un
     * chemin d'URL, ou `+`, `/` et `=` seraient reecrits en route.
     */
    public static function nouveauJeton(): string
    {
        return \rtrim(\strtr(\base64_encode(\random_bytes(32)), '+/', '-_'), '=');
    }

    /**
     * L'empreinte que la base conserve.
     *
     * On ne stocke jamais le jeton lui-meme. Une sauvegarde qui fuite ne donne
     * alors aucun compte : personne ne remonte d'un SHA-256 au lien d'origine.
     * C'est la meme raison qui fait qu'on ne stocke pas les mots de passe.
     *
     * SHA-256 nu et pas bcrypt, contrairement a un mot de passe : un jeton de
     * 256 bits tire au sort n'a pas besoin d'etre ralenti pour resister a une
     * attaque par dictionnaire — il n'y a pas de dictionnaire. Et cette
     * fonction est appelee a chaque ouverture du lien.
     */
    public static function empreinte(string $jeton): string
    {
        return \hash('sha256', $jeton);
    }

    /**
     * L'adresse, telle qu'on la compare.
     *
     * Deux personnes qui ecrivent « Jean@Exemple.fr » et « jean@exemple.fr »
     * parlent du meme compte. On abaisse la casse et on coupe les espaces
     * — le copier-coller depuis un carnet d'adresses en traine presque
     * toujours un.
     *
     * On ne va pas plus loin : retirer les points d'un Gmail ou ce qui suit
     * un « + » serait deviner les regles d'un fournisseur particulier, et se
     * tromper le jour ou elles changent.
     */
    public static function adresseNormalisee(string $email): string
    {
        return \mb_strtolower(\trim($email));
    }

    /** Une adresse a laquelle on peut raisonnablement envoyer un lien. */
    public static function adresseValide(string $email): bool
    {
        $e = self::adresseNormalisee($email);

        return '' !== $e
            && \mb_strlen($e) <= 180
            && false !== \filter_var($e, \FILTER_VALIDATE_EMAIL)
            && !self::domaineImpossible($e);
    }

    /**
     * Le domaine peut-il, en principe, recevoir du courrier ?
     *
     * `filter_var` verifie la FORME. Il accepte donc `jean@gmial.com`,
     * `jean@localhost`, `jean@exemple.invalid` — toutes syntaxiquement
     * parfaites, aucune joignable. Une invitation envoyee la n'arrive nulle
     * part, et personne ne l'apprend : l'admin croit avoir invite, la personne
     * n'a rien recu, et les deux attendent.
     *
     * ON REJETTE CE QU'ON SAIT IMPOSSIBLE, PAS CE QU'ON SOUPCONNE.
     *
     *  - un domaine sans point ne peut pas exister sur Internet ;
     *  - les domaines reserves par la norme (RFC 2606 et RFC 6761) ne
     *    recoivent jamais de courrier, par definition.
     *
     * On ne fait PAS de resolution DNS ici : une panne de reseau, un serveur
     * DNS lent ou un domaine en cours de propagation refuseraient une adresse
     * parfaitement valable, et cette fonction doit rester testable sans
     * reseau. La verification DNS existe — voir `domaineAccepteDuCourrier` —
     * mais elle CONSEILLE, elle ne bloque pas.
     */
    private static function domaineImpossible(string $email): bool
    {
        $domaine = \mb_strtolower(\substr(\strrchr($email, '@') ?: '', 1));

        if ('' === $domaine || !\str_contains($domaine, '.')) {
            return true;
        }

        // RFC 2606 et RFC 6761 : reserves, jamais routables.
        foreach (['.test', '.example', '.invalid', '.localhost', '.local'] as $suffixe) {
            if (\str_ends_with($domaine, $suffixe)) {
                return true;
            }
        }

        return \in_array($domaine, ['example.com', 'example.net', 'example.org'], true);
    }

    /**
     * Ce domaine declare-t-il un serveur de courrier ?
     *
     * TOUCHE AU RESEAU, DONC NE BLOQUE JAMAIS. Un DNS lent, une coupure, un
     * domaine achete il y a dix minutes : chacun ferait refuser une adresse
     * juste. On s'en sert pour AVERTIR l'administrateur — « es-tu sur de
     * gmial.com ? » — pas pour l'empecher d'inviter.
     *
     * Un enregistrement A suffit : la norme autorise a livrer du courrier a
     * l'adresse du domaine quand aucun MX n'est declare.
     *
     * @return bool|null `null` quand on n'a pas pu savoir
     */
    public static function domaineAccepteDuCourrier(string $email, int $secondes = 3): ?bool
    {
        $domaine = \mb_strtolower(\substr(\strrchr(self::adresseNormalisee($email), '@') ?: '', 1));
        if ('' === $domaine) {
            return false;
        }

        $avant = \ini_get('default_socket_timeout');
        \ini_set('default_socket_timeout', (string) $secondes);
        try {
            if (\checkdnsrr($domaine, 'MX')) {
                return true;
            }

            return \checkdnsrr($domaine, 'A') ? true : false;
        } catch (\Throwable) {
            return null;
        } finally {
            \ini_set('default_socket_timeout', (string) $avant);
        }
    }

    /**
     * Cette invitation ouvre-t-elle encore quelque chose ?
     *
     * TROIS RAISONS DE REFUSER, ET UNE SEULE REPONSE.
     *
     * Jeton inconnu, invitation deja acceptee, invitation perimee : la reponse
     * envoyee dehors est la meme dans les trois cas. Distinguer « ce lien a
     * deja servi » de « ce lien n'existe pas » apprendrait a un inconnu qu'un
     * jeton donne a existe — et surtout, la personne invitee n'a rien a faire
     * de la nuance : dans les trois cas elle doit redemander un lien.
     *
     * @param string|null             $accepteLe  horodatage d'acceptation, ou null
     */
    public static function estValable(
        ?\DateTimeImmutable $expireLe,
        ?\DateTimeImmutable $accepteLe,
        \DateTimeImmutable $maintenant,
    ): bool {
        if (null === $expireLe) {
            return false;
        }
        if (null !== $accepteLe) {
            return false;
        }

        // STRICTEMENT SUPERIEUR : une invitation expire A la seconde annoncee,
        // pas une seconde apres. La difference n'a aucune importance pratique
        // et toute l'importance quand on relit le code six mois plus tard.
        return $expireLe > $maintenant;
    }

    /** La date de peremption d'une invitation creee maintenant. */
    public static function expiration(\DateTimeImmutable $maintenant): \DateTimeImmutable
    {
        return $maintenant->modify('+' . self::DUREE_JOURS . ' days');
    }

    /**
     * Ce mot de passe convient-il ?
     *
     * ON COMPTE LES CARACTERES, PAS LES OCTETS. « Été » fait trois caracteres
     * et six octets ; `strlen` accepterait donc un mot de passe deux fois plus
     * court que la regle affichee, pour peu qu'il soit accentue.
     *
     * Et on ne demande NI majuscule, NI chiffre, NI caractere special. Ces
     * regles produisent « Motdepasse1! » — court, previsible, et note sur un
     * papier. La longueur est la seule contrainte qui augmente vraiment le
     * cout d'une attaque.
     */
    public static function motDePasseAcceptable(string $motDePasse): bool
    {
        return \mb_strlen($motDePasse) >= self::LONGUEUR_MOT_DE_PASSE;
    }

    /** Le nom affiche, borne et debarrasse de ses espaces inutiles. */
    public static function nomAcceptable(string $nom): bool
    {
        $n = \trim($nom);

        return '' !== $n && \mb_strlen($n) <= 80;
    }

    /**
     * Le lien a copier, tel qu'on le donne a l'administrateur.
     *
     * La base publique arrive de la configuration : c'est le seul endroit du
     * projet qui connait le domaine, et il ne doit pas etre devine a partir
     * de la requete en cours — un proxy mal configure fabriquerait alors des
     * liens vers une adresse interne, que personne d'autre ne peut ouvrir.
     */
    public static function lien(string $basePublique, string $jeton): string
    {
        return \rtrim($basePublique, '/') . '/invitation/' . $jeton;
    }
}
