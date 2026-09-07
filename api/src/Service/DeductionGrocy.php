<?php

declare(strict_types=1);

namespace App\Service;

/**
 * Deduit d'un frigo Grocy ce qu'un plan cuisine a consomme.
 *
 * UNE LIGNE A LA FOIS, ET CE N'EST PAS UN DETAIL D'ECRITURE.
 *
 * Il a existe un `FrigoGrocy::inventorier(array)` qui poussait tout le lot.
 * Le 14 aout 2026, PHP s'est arrete a 30 s au milieu de quarante lignes
 * pendant que Grocy continuait d'appliquer ce qu'il avait deja recu : frigo a
 * moitie corrige, et personne pour le dire. La methode a ete supprimee, et ne
 * doit pas revenir : une signature qui prend un lot entier laisse croire qu'il
 * part d'un bloc, alors que Grocy tourne avec une base SQLite a un seul
 * ecrivain et met les appels en file de toute facon.
 *
 * Le commit qui l'a supprimee a mis a jour deux appelants sur trois.
 * PlansController est reste avec l'ancien appel : le bouton « J'ai cuisine »
 * rendait un 500 et ne deduisait rien, sans qu'aucun test ne le voie. D'ou
 * cette classe — la boucle est ecrite ou elle s'eprouve, pas dans un
 * controleur qui demande un noyau et une base pour etre teste.
 *
 * @see \App\Tests\Service\DeductionGrocyTest
 */
final readonly class DeductionGrocy
{
    public function __construct(private FrigoGrocy $grocy)
    {
    }

    /**
     * @param array<int|string, float> $quantites nouvelle quantite, par identifiant de produit Grocy
     *
     * @return array<int|string, string> motifs des lignes non appliquees, memes cles que $quantites
     *
     * @throws \RuntimeException si Grocy n'est pas configure — le controleur
     *                           s'en sert pour rendre la liste de rattrapage
     */
    public function appliquer(array $quantites): array
    {
        $echecs = [];

        foreach ($quantites as $identifiant => $quantite) {
            /* Une ligne refusee est NOMMEE, pas avalee, et n'interrompt pas
               les suivantes : neuf deductions reussies ne sont pas annulees
               parce que la dixieme echoue. Meme regle que la branche « frigo
               base » du meme controleur. */
            $motif = $this->grocy->inventorierUn((int) $identifiant, $quantite);

            if (null !== $motif) {
                $echecs[$identifiant] = $motif;
            }
        }

        return $echecs;
    }
}
