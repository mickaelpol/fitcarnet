<?php

declare(strict_types=1);

namespace App\Service;

/**
 * CE QUE « J'AI CUISINE » RETIRE DU FRIGO, LIGNE PAR LIGNE.
 *
 * POURQUOI CE CALCUL EST A PART
 *
 * C'est le seul endroit du projet qui ECRIT dans le stock de quelqu'un sans
 * qu'il ait tape le chiffre lui-meme. Une erreur ici ne se voit pas a
 * l'ecran : elle se voit devant un bac vide, une semaine plus tard. Il fallait
 * pouvoir l'eprouver sans base, sans noyau et sans Grocy — d'ou une classe
 * pure, ou entrent un plan et un frigo, et d'ou sortent des quantites.
 *
 * TROIS PIEGES, ET CHACUN A SON TEST
 *
 * 1. **Le frigo compte en UNITES, le plan en GRAMMES.** Un pot de skyr n'est
 *    pas 400 g, c'est « 1 » avec 400 g par unite. Retirer 200 g, c'est poser
 *    le stock a 0,5 — pas a 200.
 * 2. **Un stock ne descend jamais sous zero.** Un frigo negatif n'existe pas,
 *    et le solveur le lirait comme une dette a rembourser sur les repas
 *    suivants.
 * 3. **Ce qu'on ne sait pas calculer, on ne l'invente pas.** Un aliment sorti
 *    du frigo, ou dont le poids par unite est inconnu, est RENDU dans
 *    `ignores` pour etre corrige a la main. Retirer « a peu pres » serait pire
 *    que ne rien retirer : le stock deviendrait faux sans que personne ne le
 *    sache.
 *
 * Et les grammes lus sont ceux de la BALANCE — poids pese, avant cuisson.
 * L'eau que la cuisson ajoute n'est jamais sortie du frigo ; deduire le poids
 * cuit ferait disparaitre trois fois trop de riz.
 */
final class DeductionDuPlan
{
    /**
     * @param array<int, float>                        $quantites   identifiant source => nouveau stock, en unites
     * @param list<array{nom: string, motif: string}>  $ignores     ce qui n'a pas pu etre deduit, et pourquoi
     */
    private function __construct(
        public readonly array $quantites,
        public readonly array $ignores,
    ) {
    }

    /**
     * @param mixed                     $consomme  la liste `consomme` de l'instantane
     * @param array<string, AlimentDisponible> $frigo indexe par reference
     */
    public static function calculer(mixed $consomme, array $frigo): self
    {
        $quantites = [];
        $ignores = [];

        if (!\is_array($consomme)) {
            return new self([], []);
        }

        /* ON ADDITIONNE D'ABORD, ON CALCULE ENSUITE — constat 04#14.
           Chaque ligne recalculait le restant depuis le stock INITIAL : 300 g
           puis 200 g pris sur 1 000 g laissaient 800 g au frigo au lieu de 500,
           et 300 g de riz qui n'existaient plus restaient inscrits. La seconde
           ligne ecrasait simplement la premiere.

           Le front agrege deja par aliment, le defaut ne se voyait donc pas —
           mais il reposait entierement sur le front, et le test qui aurait du
           l'attraper ici enterinait le contraire.

           Une seule ecriture par produit, aussi : Grocy enregistrerait deux
           inventaires successifs comme deux mouvements. */
        $grammesParReference = [];
        $noms = [];

        foreach ($consomme as $ligne) {
            if (!\is_array($ligne)) {
                continue;
            }

            $reference = (string) ($ligne['reference'] ?? '');
            $grammes = (float) ($ligne['grammes'] ?? 0);

            /* Zero gramme n'est pas une deduction : ecrire quand meme
               reposerait le stock a sa valeur actuelle, ce qui n'est pas
               anodin sur Grocy — c'est une operation d'inventaire, elle
               laisse une trace et une date. */
            if ($grammes <= 0) {
                continue;
            }

            /* Le nom de la PREMIERE ligne : c'est celui qui sera lu dans
               « plus dans ton frigo », et deux lignes du meme aliment portent
               le meme nom de toute facon. */
            $noms[$reference] ??= (string) ($ligne['nom'] ?? $reference);
            $grammesParReference[$reference] = ($grammesParReference[$reference] ?? 0.0) + $grammes;
        }

        foreach ($grammesParReference as $reference => $grammes) {
            $reference = (string) $reference;
            $nom = $noms[$reference];
            $aliment = $frigo[$reference] ?? null;

            if (null === $aliment) {
                $ignores[] = ['nom' => $nom, 'motif' => 'plus dans ton frigo'];
                continue;
            }
            if (!$aliment->exploitable()) {
                $ignores[] = ['nom' => $nom, 'motif' => 'poids par unité inconnu'];
                continue;
            }

            $parUnite = (float) $aliment->grammesParUnite;
            $restant = \max(0.0, ($aliment->stockEnGrammes() ?? 0.0) - $grammes);

            $quantites[self::identifiantSource($reference)] = \round($restant / $parUnite, 3);
        }

        return new self($quantites, $ignores);
    }

    /**
     * « grocy:12 » et « base:5 » portent l'identifiant 12 ou 5 dans leur
     * source. C'est celui que les deux services d'ecriture attendent — ni l'un
     * ni l'autre ne connait le prefixe, qui n'existe que pour distinguer les
     * deux mondes cote application.
     */
    public static function identifiantSource(string $reference): int
    {
        $separateur = \strpos($reference, ':');

        return (int) (false === $separateur
            ? $reference
            : \substr($reference, $separateur + 1));
    }
}
