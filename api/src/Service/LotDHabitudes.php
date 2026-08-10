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
     * Plafond d'un envoi.
     *
     * Une semaine de quatre repas met en jeu une trentaine d'aliments
     * distincts au grand maximum. 200 laisse toute la marge voulue tout en
     * fermant la porte a un envoi qui ne serait plus un geste d'utilisateur.
     */
    public const MAX = 200;

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
        if (\count($habitudes) > self::MAX) {
            return self::refus(\sprintf(
                'Trop d\'habitudes d\'un coup : %d pour %d au maximum.',
                \count($habitudes), self::MAX));
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

        return new self($aEcrire, null);
    }

    private static function refus(string $motif): self
    {
        return new self([], $motif);
    }
}
