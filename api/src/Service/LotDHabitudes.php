<?php

declare(strict_types=1);

namespace App\Service;

/**
 * CE QU'UN ENVOI D'HABITUDES DOIT VALOIR AVANT DE TOUCHER LA BASE.
 *
 * POURQUOI CETTE CLASSE EXISTE
 *
 * Elle etait d'abord ecrite dans `CuissonsController`, et n'y etait pas
 * testable : il aurait fallu un noyau Symfony, une base et une session pour
 * verifier qu'un identifiant de mode inconnu rend bien un 422. Le seul
 * morceau qui puisse se tromper — la validation et le dedoublonnage — ne
 * depend pourtant de rien : un tableau entre, un tableau sort.
 *
 * Sorti d'ici, il se teste en une ligne. Ce qui reste dans le controleur ne
 * fait plus que lire l'utilisateur, appeler ceci, et ecrire.
 */
final class LotDHabitudes
{
    /**
     * Plafond des aliments DISTINCTS, apres dedoublonnage.
     *
     * Une semaine de quatre repas met en jeu une trentaine d'aliments
     * distincts au grand maximum. 200 laisse toute la marge voulue tout en
     * fermant la porte a un envoi qui ne serait plus un geste d'utilisateur.
     *
     * LE CHIFFRE N'A PAS BOUGE, SA CIBLE SI — le 25 septembre 2026. Il se
     * comparait au nombre de lignes RECUES, et ca tenait tant que l'ecran
     * n'envoyait que les ecarts. Depuis que le tri de l'inchange appartient a
     * la base, l'ecran envoie une ligne par couple (repas, aliment) du plan :
     * 200 serait devenu atteignable par un usage normal, c'est-a-dire un 422
     * sur un geste legitime. Compare aux distincts, il redevient ce que sa
     * raison dit compter.
     */
    public const MAX = 200;

    /**
     * Plafond de l'envoi BRUT, avant dedoublonnage.
     *
     * MESURE DU 25 SEPTEMBRE 2026, et elle ne dit pas ce qu'on attendait : il
     * n'existe AUCUN majorant dans le code. Ni les jours — le calendrier de
     * l'ecran est mensuel et laisse en cocher trente-et-un — ni les aliments
     * d'un repas, `Compose.ajouts` etant une liste libre bornee par le seul
     * frigo. Le pire cas theorique est 31 x 4 x (taille du frigo).
     *
     * Ce plafond est donc POSE, pas deduit :
     *   - plan de la semaine, 7 j x 4 repas x 10 aliments .....   280 lignes
     *   - mois entier coche, 31 j x 4 repas x 15 aliments ..... 1 860 lignes
     *   - PIRE CAS CONCEVABLE, 31 j x 4 repas x tout le frigo . 7 440 lignes
     *
     * IL A VALU 2000 PENDANT UNE DEMI-JOURNEE, ET C'ETAIT FAUX — releve en
     * revue le 25 septembre 2026, le jour meme. 2000 sortait de la deuxieme
     * ligne du tableau ci-dessus, « quinze aliments par repas », un chiffre
     * confortable et rien de plus. A dix-sept, le meme mois fait 2 108 lignes
     * pour une quarantaine d'aliments distincts : refuse en 422, et comme
     * l'echec d'ecriture des habitudes est SILENCIEUX par decision (voir
     * `retenirLesCuissons`), l'utilisateur perdait tout le lot sans un mot.
     * C'est exactement le defaut que la double borne venait corriger,
     * reintroduit par sa propre correction.
     *
     * La troisieme ligne, elle, n'est pas confortable : c'est le maximum que
     * le calendrier et le frigo permettent d'atteindre, avec le seul chiffre
     * mesure du depot sur un vrai plan — « sept jours sur 60 aliments »
     * (`usePlanCalcule.ts:34`). 10 000 la laisse passer avec de la marge et
     * ferme la porte a un corps qui ne vient plus de l'ecran.
     *
     * CE QU'ELLE PROTEGE, ET CE QU'ELLE NE PROTEGE PAS. Pas la memoire :
     * `json_decode` a deja tout materialise quand elle s'applique. Elle borne
     * la BOUCLE qui suit, et elle dit ce qu'est un geste. La taille du corps,
     * elle, se borne ailleurs — au serveur web.
     */
    public const MAX_LIGNES = 10000;

    /** Au-dela, ce n'est plus un nom d'aliment. */
    public const NOM_MAX = 200;

    /**
     * @param array<string, int|null> $aEcrire cle normalisee => mode, ou null
     * @param string|null             $erreur  le motif du refus, s'il y en a un
     */
    private function __construct(
        public readonly array $aEcrire,
        public readonly ?string $erreur,
    ) {
    }

    public function estValide(): bool
    {
        return null === $this->erreur;
    }

    /**
     * Lit un envoi et le ramene a ce qu'il faut ecrire.
     *
     * @param mixed     $habitudes ce qui est arrive dans le corps de la requete
     * @param list<int> $modesConnus les identifiants qui existent vraiment
     */
    public static function depuis(mixed $habitudes, array $modesConnus): self
    {
        if (!\is_array($habitudes)) {
            return self::refus('Aucune habitude à enregistrer.');
        }
        if ([] === $habitudes) {
            /* Un lot vide n'est PAS une erreur : l'ecran peut n'avoir rien de
               nouveau a dire, et c'est meme le cas le plus frequent — une
               semaine sans changement. Refuser obligerait l'ecran a savoir
               s'il a quelque chose a dire avant de le dire. */
            return new self([], null);
        }
        /* LA PREMIERE DES DEUX BORNES, et elle porte sur le BRUT : il faut
           refuser un corps demesure AVANT de le parcourir, sans quoi le
           dedoublonnage travaillerait sur ce qu'on cherche justement a ne pas
           accepter. */
        if (\count($habitudes) > self::MAX_LIGNES) {
            return self::refus(\sprintf(
                'Trop de lignes d\'un coup : %d pour %d au maximum.',
                \count($habitudes), self::MAX_LIGNES));
        }

        /* On DEDOUBLONNE avant d'ecrire. PostgreSQL refuse un ON CONFLICT dont
           le lot contient deux fois la meme cle (« command cannot affect row a
           second time ») : deux lignes pour « riz basmati » dans le meme envoi
           feraient echouer tout le lot. La derniere gagne, comme si les deux
           etaient parties l'une apres l'autre. */
        $aEcrire = [];

        foreach ($habitudes as $h) {
            if (!\is_array($h)) {
                return self::refus('Habitude illisible.');
            }

            $aliment = \trim((string) ($h['aliment'] ?? ''));

            if ('' === $aliment) {
                return self::refus('Aliment non précisé.');
            }
            if (\mb_strlen($aliment) > self::NOM_MAX) {
                return self::refus('Nom d\'aliment trop long : ' . $aliment);
            }

            /* Distinguer « mode absent » de « mode: null » : le premier n'a
               rien a faire dans un envoi, le second veut dire « se mange tel
               quel ». `array_key_exists` et non `isset`, qui les confond. */
            if (!\array_key_exists('mode', $h)) {
                return self::refus('Cuisson non précisée pour ' . $aliment);
            }

            $mode = null === $h['mode'] ? null : (int) $h['mode'];

            /* Sans cette verification, un identifiant inconnu partirait en
               base et reviendrait en violation de cle etrangere, c'est-a-dire
               en 500 — une panne de serveur pour dire « ce mode n'existe
               pas ». */
            if (null !== $mode && !\in_array($mode, $modesConnus, true)) {
                return self::refus('Mode de cuisson inconnu : ' . $mode);
            }

            $aEcrire[$aliment] = $mode;
        }

        /* LA SECONDE BORNE, et c'est ici qu'elle a un sens : apres le
           dedoublonnage, `$aEcrire` compte les aliments distincts, donc les
           lignes qui partiront vraiment en base. Un plan de sept jours qui
           nomme trente fois le meme riz fait trente lignes et un aliment. */
        if (\count($aEcrire) > self::MAX) {
            return self::refus(\sprintf(
                'Trop d\'habitudes d\'un coup : %d pour %d au maximum.',
                \count($aEcrire), self::MAX));
        }

        return new self($aEcrire, null);
    }

    private static function refus(string $motif): self
    {
        return new self([], $motif);
    }
}
