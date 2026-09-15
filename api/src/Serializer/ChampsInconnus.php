<?php

declare(strict_types=1);

namespace App\Serializer;

use Doctrine\ORM\Mapping\ManyToMany;
use Doctrine\ORM\Mapping\ManyToOne;
use Doctrine\ORM\Mapping\OneToMany;
use Doctrine\ORM\Mapping\OneToOne;

/**
 * LES CHAMPS D'UN CORPS DE REQUETE QUI N'EXISTENT PAS DANS LA RESSOURCE VISEE.
 *
 * Ne ressert qu'une question : « ce nom designe-t-il quelque chose ? ». Pas
 * « s'ecrit-il ? » — c'est la distinction dont tout depend, et le 15 septembre
 * 2026 l'a montre a nos depens :
 *
 *  - `allow_extra_attributes: false` repond a « s'ecrit-il ? ». Il refuse donc
 *    `id`, `creeLe` et les `@id` imbriques que le front renvoie avec l'objet
 *    qu'il a lu : modifier une seance repondait 400. Retire le jour meme.
 *  - Ce controle repond a « existe-t-il ? ». `partage`, retire de `Modele`
 *    (F-05), n'existe plus : refus. `id` existe, en lecture : tolere — et
 *    ignore par API Platform, exactement comme avant.
 *
 * CE QUI COMPTE COMME EXISTANT :
 *  - toute propriete de la classe ou de ses parents, quel que soit son groupe ;
 *  - tout accesseur public `getX` / `isX` / `hasX` — une valeur CALCULEE
 *    (`Seance::getAvancement()`) revient avec l'objet lu sans avoir de colonne ;
 *  - toute cle JSON-LD (`@id`, `@type`, `@context`).
 *
 * ON DESCEND DANS LES RELATIONS ECRITES EN OBJETS (un modele porte ses blocs,
 * un bloc ses series), en suivant le `targetEntity` de l'attribut Doctrine lu
 * par reflexion. Une relation ecrite par IRI est une chaine : rien a explorer.
 *
 * Aucune base, aucun noyau, aucun etat : ce qui le rend testable sur les
 * vraies entites. Voir `tests/Serializer/ChampsInconnusTest.php`.
 */
final class ChampsInconnus
{
    /** @var array<class-string, array<string, true>> */
    private array $nomsConnus = [];

    /**
     * @param class-string         $classe
     * @param array<mixed, mixed>  $corps
     *
     * @return list<string> les chemins des champs inconnus, `exercices[0].series[1].charge`
     */
    public function inconnus(string $classe, array $corps, string $chemin = ''): array
    {
        if (array_is_list($corps)) {
            return [];
        }

        $connus = $this->nomsConnus($classe);
        $trouves = [];

        foreach ($corps as $cle => $valeur) {
            $cle = (string) $cle;

            if (str_starts_with($cle, '@')) {
                continue;
            }

            $ici = '' === $chemin ? $cle : $chemin . '.' . $cle;

            if (!isset($connus[$cle])) {
                $trouves[] = $ici;

                continue;
            }

            if (!\is_array($valeur)) {
                continue;
            }

            $cible = self::cibleDeLaRelation($classe, $cle);

            if (null === $cible) {
                continue;
            }

            if (!array_is_list($valeur)) {
                array_push($trouves, ...$this->inconnus($cible, $valeur, $ici));

                continue;
            }

            foreach ($valeur as $rang => $element) {
                if (\is_array($element)) {
                    array_push($trouves, ...$this->inconnus($cible, $element, "{$ici}[{$rang}]"));
                }
            }
        }

        return $trouves;
    }

    /**
     * @param class-string $classe
     *
     * @return array<string, true>
     */
    private function nomsConnus(string $classe): array
    {
        if (isset($this->nomsConnus[$classe])) {
            return $this->nomsConnus[$classe];
        }

        $noms = [];

        for ($r = new \ReflectionClass($classe); false !== $r; $r = $r->getParentClass()) {
            foreach ($r->getProperties() as $propriete) {
                $noms[$propriete->getName()] = true;
            }
        }

        foreach ((new \ReflectionClass($classe))->getMethods(\ReflectionMethod::IS_PUBLIC) as $methode) {
            if ($methode->isStatic() || 0 !== $methode->getNumberOfRequiredParameters()) {
                continue;
            }

            if (1 === preg_match('/^(?:get|is|has)([A-Z]\w*)$/', $methode->getName(), $m)) {
                $noms[lcfirst($m[1])] = true;
            }
        }

        return $this->nomsConnus[$classe] = $noms;
    }

    /**
     * La classe visee par une relation Doctrine, ou null si ce n'en est pas une.
     *
     * @param class-string $classe
     *
     * @return class-string|null
     */
    private static function cibleDeLaRelation(string $classe, string $propriete): ?string
    {
        for ($r = new \ReflectionClass($classe); false !== $r; $r = $r->getParentClass()) {
            if (!$r->hasProperty($propriete)) {
                continue;
            }

            foreach ($r->getProperty($propriete)->getAttributes() as $attribut) {
                if (!\in_array($attribut->getName(), [OneToMany::class, ManyToOne::class, OneToOne::class, ManyToMany::class], true)) {
                    continue;
                }

                $cible = $attribut->getArguments()['targetEntity'] ?? null;

                return \is_string($cible) && class_exists($cible) ? $cible : null;
            }

            return null;
        }

        return null;
    }
}
