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
 * IL N'Y A PLUS DE JUGE DANS LE FRONT — 20 septembre 2026. Il y en avait un,
 * `front/src/calcul/motDePasse.ts`, parce que la jauge doit repondre pendant la
 * frappe sans aller-retour reseau ; les deux etaient tenus d'accord par
 * `api/regles/motdepasse.json`, lu par leurs deux suites.
 *
 * CE DISPOSITIF EST ABANDONNE, et le fichier avec : il GARDAIT la duplication
 * au lieu de la supprimer, et supposait qu'un futur front pense a le lire. La
 * jauge vient desormais de `POST /api/verification/mot-de-passe`, qui rend les
 * manquements, la force ET la phrase a afficher. Cette classe est la seule
 * ecriture de la regle, dans tout le depot.
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
 * @see MotDePasseTest
 * @see \App\Controller\VerificationController::motDePasse
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
     * Vide veut dire « rien ne manque ». L'ORDRE COMPTE : c'est celui dans
     * lequel l'ecran affiche la liste, et il est fige par `MotDePasseTest`.
     * Il etait autrefois fige par `api/regles/motdepasse.json`, supprime le
     * 20 septembre 2026 avec le juge du front.
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

    /**
     * LES QUATRE NIVEAUX DE LA JAUGE, du plus faible au plus solide.
     *
     * Portes depuis `front/src/calcul/motDePasse.ts` le 20 septembre 2026 :
     * « tout doit passer par le serveur car le metier doit etre sur le
     * serveur, comme ca je peux changer le front quand bon me semble ».
     *
     * LA JAUGE NE PEUT PAS CONTREDIRE LE VERROU, et c'est sa seule contrainte
     * serieuse. Beaucoup de sites affichent un « fort » vert sur un mot de
     * passe que leur propre serveur refuse ensuite. On s'interdit ca en
     * construisant la jauge SUR les exigences : tant qu'il en manque une, elle
     * ne peut pas depasser « moyen ». « bon » veut dire « il passera », et
     * rien d'autre.
     *
     * AU-DELA, C'EST LA LONGUEUR QUI PARLE, parce que c'est la seule chose qui
     * augmente vraiment le cout d'une attaque une fois les familles presentes.
     * Seize caracteres valent « solide » ; douze avec les quatre familles
     * valent « bon », ce qui est la verite : ca passe, ce n'est pas un exploit.
     *
     * ON NE PROMET PAS D'ENTROPIE. Un « 94 bits » affiche a l'ecran serait
     * faux — il supposerait un tirage au sort, alors que les gens tapent des
     * mots. Quatre paliers nommes disent ce qu'on sait, et rien de plus
     * (regle 7).
     */
    public static function force(string $motDePasse): string
    {
        if ('' === $motDePasse) {
            return 'vide';
        }

        $manque = \count(self::manquements($motDePasse));
        if ($manque >= 3) {
            return 'faible';
        }
        if ($manque >= 1) {
            return 'moyen';
        }

        /* LES CARACTERES, PAS LES OCTETS — meme piege que `manquements` :
           `strlen` declarerait « Été… » plus long qu'il n'est. */
        return \mb_strlen($motDePasse) >= self::LONGUEUR_MINIMALE + 4 ? 'solide' : 'bon';
    }

    /**
     * LES CINQ EXIGENCES, DANS L'ORDRE OU L'ECRAN LES AFFICHE, avec leur
     * libelle et si ce mot de passe les remplit.
     *
     * L'ECRAN NE PORTE PLUS LE CHIFFRE. Il traduisait « longueur » en « douze
     * caracteres » depuis sa propre constante : c'est exactement ainsi qu'un
     * ecran d'invitation a conseille « ni majuscule ni chiffre imposes » le
     * jour ou le serveur a commence a les exiger. Le serveur dit la phrase.
     *
     * ON LES REND TOUTES LES CINQ, remplies ou non — et pas seulement ce qui
     * manque. Une liste qui retrecit pendant qu'on tape fait bouger le reste
     * de l'ecran sous les doigts ; et voir la liste complete avant de
     * commencer, c'est savoir ou l'on va.
     *
     * @return list<array{cle: string, dit: string, remplie: bool}>
     */
    public static function exigences(string $motDePasse): array
    {
        $manque = self::manquements($motDePasse);
        $dit = [
            'longueur' => self::LONGUEUR_MINIMALE . ' caractères au minimum',
            'minuscule' => 'une lettre minuscule',
            'majuscule' => 'une lettre majuscule',
            'chiffre' => 'un chiffre',
            'special' => 'un caractère spécial',
        ];

        $out = [];
        foreach ($dit as $cle => $phrase) {
            $out[] = [
                'cle' => $cle,
                'dit' => $phrase,
                'remplie' => !\in_array($cle, $manque, true),
            ];
        }

        return $out;
    }

    /** Ce que la jauge affiche comme mot, a cote de la barre. */
    public static function motDeLaForce(string $force): string
    {
        return [
            'vide' => '',
            'faible' => 'Trop faible',
            'moyen' => 'Presque',
            'bon' => 'Bon',
            'solide' => 'Solide',
        ][$force] ?? '';
    }

    /** Rien ne manque. */
    public static function acceptable(string $motDePasse): bool
    {
        return [] === self::manquements($motDePasse);
    }

    /**
     * Ce qui manque, dit a la personne qui tape.
     *
     * UNE SEULE PHRASE, QUI ENUMERE. Quatre messages successifs font
     * recommencer quatre fois, et c'est ainsi qu'on obtient « Motdepasse1! ».
     *
     * ELLE ENONCE DES EXIGENCES, ELLE NE COMPTE PAS. La premiere ecriture
     * commencait par « Il manque », ce qui se lisait « il manque 12
     * caracteres » sur un mot de passe qui en a huit — alors qu'il n'en manque
     * que quatre. Regle 7 appliquee a un texte : ne rien promettre plutot que
     * promettre faux.
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

        return 'Ce mot de passe doit contenir '
            . ([] === $dits ? $dernier : \implode(', ', $dits) . ' et ' . $dernier) . '.';
    }
}
