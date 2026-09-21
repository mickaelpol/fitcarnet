<?php

declare(strict_types=1);

namespace App\Service;

/**
 * CE QUI EST DEJA PROMIS A UN AUTRE PLAN, ET CE QUI RESTE VRAIMENT.
 *
 * POURQUOI CETTE CLASSE EXISTE — palier B, 21 septembre 2026. Le front
 * calculait « stock moins promis » avec `dejaPromis` et `grammesDisponibles`,
 * a partir de deux reponses du serveur qu'il ne modifie pas : le frigo et les
 * plans enregistres. C'est exactement le cas ou le serveur peut rendre le
 * chiffre — la valeur n'est derivee d'AUCUN etat que l'ecran mute.
 *
 * LE BUG QU'ELLE CORRIGE, ET IL EST ANCIEN. Deux batch cooking d'affilee
 * comptaient deux fois le meme frigo : on compose lundi-mercredi, on
 * enregistre ; on compose jeudi-samedi, et le solveur repartait du stock
 * d'AVANT. Le premier plan avait beau vider les 800 g de poulet, le second
 * annoncait « objectifs atteints » sur du poulet qui n'existait plus — et
 * personne n'etait prevenu, puisque chaque plan etait juste tout seul.
 *
 * ELLE INTERPRETE `plan_repas.contenu`, dont `PlanRepas.php` dit que l'API le
 * « transporte sans l'interpreter ». Ce n'est plus tout a fait vrai depuis
 * `DeductionDuPlan`, qui lit la meme liste `consomme` pour deduire le stock
 * quand un plan est cuisine. Les deux lisent la MEME chose pour des raisons
 * opposees : l'une ce qui est deja parti, l'autre ce qui est encore reserve.
 */
final class StockPromis
{
    /**
     * LES GRAMMES RESERVES PAR LES PLANS PREVUS, par reference d'aliment.
     *
     * SEULS LES PLANS PREVUS RESERVENT. Un plan cuisine a deja fait baisser le
     * stock pour de vrai (`DeductionDuPlan`) : le compter encore le deduirait
     * deux fois — la meme erreur, prise par l'autre bout.
     *
     * UN PLAN VERSION 1 NE RESERVE RIEN plutot que d'inventer : il ne dit pas ce
     * qu'il consomme, et deviner a partir de ses noms d'aliments donnerait une
     * reservation FAUSSE, qu'on ne voit pas — pire qu'une reservation manquante,
     * qu'on voit.
     *
     * @param iterable<array{contenu?: mixed, cuisineLe?: ?string}> $plans
     *
     * @return array<string, float>
     */
    public static function parReference(iterable $plans): array
    {
        $promis = [];

        foreach ($plans as $plan) {
            if (self::estCuisine($plan['cuisineLe'] ?? null)) {
                continue;
            }

            $contenu = $plan['contenu'] ?? null;
            $consomme = \is_array($contenu) ? ($contenu['consomme'] ?? null) : null;

            if (!\is_array($consomme)) {
                continue;
            }

            foreach ($consomme as $ligne) {
                if (!\is_array($ligne) || !isset($ligne['reference'])) {
                    continue;
                }

                $reference = (string) $ligne['reference'];
                $promis[$reference] = ($promis[$reference] ?? 0.0) + (float) ($ligne['grammes'] ?? 0);
            }
        }

        return $promis;
    }

    /**
     * UN CHAMP ABSENT VAUT « PREVU », PAS « CUISINE » — bug du 13 aout 2026.
     *
     * Tant que le serveur n'avait pas vide son cache apres la migration, il ne
     * renvoyait pas `cuisineLe` du tout. Le front repondait alors « cuisine »
     * pour TOUS les plans : plus aucune reservation, et l'ecran affichait
     * « Cuisine le Invalid Date » sur un plan jamais cuisine.
     *
     * Le defaut va vers PREVU, et c'est le bon sens du risque : reserver un
     * stock qui ne l'etait pas se voit tout de suite et se corrige d'un appui ;
     * ne pas reserver laisse trois plans se partager le meme brocoli en
     * silence, et on le decouvre devant le bac.
     */
    private static function estCuisine(?string $cuisineLe): bool
    {
        return null !== $cuisineLe && '' !== $cuisineLe;
    }

    /**
     * CE QUI RESTE VRAIMENT, une fois les plans prevus servis.
     *
     * LE PLANCHER A ZERO COMPTE : un frigo negatif n'existe pas, et le solveur
     * le lirait comme une dette a rembourser sur les repas suivants.
     *
     * `null` EN ENTREE RESTE `null` EN SORTIE (regle 6 : vide n'est pas zero).
     * Un litre ou un pack n'ont pas de poids ; rendre « 0 g disponible » ferait
     * croire qu'il n'y en a plus, alors qu'on ne sait pas combien il y en a.
     */
    public static function disponible(?float $enGrammes, float $promis): ?float
    {
        if (null === $enGrammes) {
            return null;
        }

        return max(0.0, $enGrammes - $promis);
    }
}
