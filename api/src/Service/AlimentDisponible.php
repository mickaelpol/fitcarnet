<?php

declare(strict_types=1);

namespace App\Service;

/**
 * Un aliment prêt pour le solveur, quelle que soit sa provenance.
 *
 * C'est la forme unique que voient l'application et le calculateur. Derriere,
 * les valeurs viennent soit de Grocy (compte administrateur), soit de la table
 * « aliment » (comptes ordinaires) — mais rien de cette difference ne remonte.
 */
final readonly class AlimentDisponible
{
    /**
     * LE RENDEMENT RETENU — la pesee de l'utilisateur d'abord, toujours.
     *
     * Quand quelqu'un s'est donne la peine de peser son aliment cru, de le
     * cuire, de l'egoutter et de le repeser, ce chiffre-la vaut mieux que
     * n'importe quelle moyenne nationale : il porte SA cuisson, SON eau, SON
     * temps de feu. Le laisser ecraser par un import serait lui dire que sa
     * balance ne compte pas.
     *
     * C'etait pourtant le cas : le rendement etait une simple colonne, et le
     * script Ciqual la reecrivait a chaque passage. Le derivant ici, aucune
     * source ne peut plus le faire — la mesure gagne a la lecture, quoi qu'il
     * y ait eu d'ecrit.
     *
     * Seule exception, et elle ne se discute pas : une mesure a CONTRESENS.
     * Une viande qui grossit en cuisant, un feculent qui retrecit — les deux
     * pesees ont ete interverties. On garde alors la valeur de la table, et
     * `incoherences()` le dit en clair.
     *
     * A noter depuis la refonte : ce rendement n'entre dans AUCUNE macro. Les
     * valeurs decrivent le produit tel qu'on le pese, et la cuisson n'ajoute
     * que de l'eau. Se tromper de rendement ne fausse donc plus que le poids
     * annonce dans l'assiette — plus jamais ce qu'il faut poser sur la
     * balance.
     */
    public float $ratio;

    /** D'ou vient le rendement retenu : 'mesure' ou 'table'. */
    public string $provenanceRatio;

    public function __construct(
        public string $reference,
        public string $nom,
        public string $categorie,
        public float $kcal100,
        public float $prot100,
        public float $gluc100,
        public float $lip100,
        public ?float $fibres100,
        float $ratio,
        /** quantite en stock, exprimee dans l'unite ci-dessous */
        public float $stock,
        public ?string $emplacement = null,
        public ?float $peseeAvant = null,
        public ?float $peseeApres = null,
        /**
         * Unite du stock, telle qu'elle est tenue a la source.
         *
         * Elle n'est pas decorative. Les valeurs nutritionnelles sont donnees
         * pour 100 g et le solveur raisonne en grammes : un produit tenu en
         * pieces ou en litres ne peut pas y entrer sans poids unitaire. On
         * transporte donc l'unite au lieu de supposer le gramme, et on la
         * signale plutot que de convertir a l'aveugle.
         */
        public string $unite = 'g',
        /**
         * Combien de grammes vaut UNE unite de stock.
         *
         * 1 pour un produit tenu au gramme, 1000 au kilogramme, 55 pour un oeuf
         * dont la conversion « 1 piece = 55 g » est declaree dans Grocy.
         *
         * NULL quand la conversion n'existe pas — un litre de lait ou un pack
         * n'ont pas de poids connu. Le calculateur doit alors ecarter l'aliment
         * au lieu de supposer un chiffre : une densite inventee fausserait la
         * diete sans que rien ne le signale.
         */
        public ?float $grammesParUnite = 1.0,
    ) {
        $mesure = self::rendementMesure($peseeAvant, $peseeApres);
        $retenu = null !== $mesure
            && null === RendementPlausible::sens($categorie, $mesure);

        $this->ratio = $retenu ? $mesure : ($ratio > 0 ? $ratio : 1.0);
        $this->provenanceRatio = $retenu ? 'mesure' : 'table';
    }

    /** Le rendement que disent deux pesees, ou NULL s'il n'y en a pas. */
    private static function rendementMesure(?float $avant, ?float $apres): ?float
    {
        if (null === $avant || null === $apres || $avant <= 0 || $apres <= 0) {
            return null;
        }

        return \round($apres / $avant, 3);
    }

    /** L'utilisateur a-t-il pese cet aliment lui-meme ? */
    public function mesureParLUtilisateur(): bool
    {
        return 'mesure' === $this->provenanceRatio;
    }

    /**
     * Ce qui, dans cet aliment, rendrait un repas faux — a dire, jamais a taire.
     *
     * Une valeur nutritionnelle n'est pas invalide au sens d'un formulaire :
     * elle est physiquement impossible, ou elle ne l'est pas. On ne refuse
     * donc pas l'aliment — il est peut-etre le seul du frigo — mais on ne
     * laisse pas non plus le calculateur batir dessus sans un mot.
     *
     * @return string[]
     */
    public function incoherences(): array
    {
        $dits = [];

        $sens = RendementPlausible::sens($this->categorie, $this->ratio);
        if (null !== $sens) {
            $dits[] = $sens;
        }

        /* Une pesee ecartee doit se dire. Quelqu'un a pris sa balance, note
           deux chiffres, et l'application ne s'en sert pas : le taire serait
           lui laisser croire que sa mesure a ete prise en compte. */
        $mesure = self::rendementMesure($this->peseeAvant, $this->peseeApres);
        if (null !== $mesure && !$this->mesureParLUtilisateur()) {
            $dits[] = \sprintf(
                'ta pesee (%.0f g -> %.0f g, soit %.2f) n\'a pas ete retenue : %s '
                . 'Le rendement %.2f de la table est utilise a la place.',
                $this->peseeAvant, $this->peseeApres, $mesure,
                RendementPlausible::sens($this->categorie, $mesure) ?? '',
                $this->ratio);
        }

        $matiere = $this->prot100 + $this->gluc100 + $this->lip100 + ($this->fibres100 ?? 0);
        if ($matiere > 100.5) {
            $dits[] = \sprintf(
                '%.1f g de nutriments dans 100 g de produit : les glucides '
                . 'viennent probablement d\'une table americaine, ou les fibres '
                . 'sont comptees deux fois.', $matiere);
        }

        return $dits;
    }

    /** Le stock est-il convertible en grammes, donc utilisable par le solveur ? */
    public function exploitable(): bool
    {
        return null !== $this->grammesParUnite && $this->grammesParUnite > 0;
    }

    /** Le stock ramene au gramme, ou NULL si la conversion est inconnue. */
    public function stockEnGrammes(): ?float
    {
        return $this->exploitable() ? $this->stock * (float) $this->grammesParUnite : null;
    }

    public function versTableau(): array
    {
        return [
            'reference' => $this->reference,
            'nom' => $this->nom,
            'categorie' => $this->categorie,
            'kcal100' => $this->kcal100,
            'prot100' => $this->prot100,
            'gluc100' => $this->gluc100,
            'lip100' => $this->lip100,
            'fibres100' => $this->fibres100,
            'ratio' => $this->ratio,
            'provenanceRatio' => $this->provenanceRatio,
            'stock' => $this->stock,
            'unite' => $this->unite,
            'grammesParUnite' => $this->grammesParUnite,
            'emplacement' => $this->emplacement,
            'peseeAvant' => $this->peseeAvant,
            'peseeApres' => $this->peseeApres,
        ];
    }
}
