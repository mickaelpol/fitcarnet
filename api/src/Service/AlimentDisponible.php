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
    public function __construct(
        public string $reference,
        public string $nom,
        public string $categorie,
        public float $kcal100,
        public float $prot100,
        public float $gluc100,
        public float $lip100,
        public ?float $fibres100,
        public float $ratio,
        public string $etatReference,
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
            'etatReference' => $this->etatReference,
            'stock' => $this->stock,
            'unite' => $this->unite,
            'grammesParUnite' => $this->grammesParUnite,
            'emplacement' => $this->emplacement,
            'peseeAvant' => $this->peseeAvant,
            'peseeApres' => $this->peseeApres,
        ];
    }
}
