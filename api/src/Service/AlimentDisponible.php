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
        /** quantite en stock, dans l'unite de reference */
        public float $stock,
        public ?string $emplacement = null,
        public ?float $peseeAvant = null,
        public ?float $peseeApres = null,
    ) {
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
            'emplacement' => $this->emplacement,
            'peseeAvant' => $this->peseeAvant,
            'peseeApres' => $this->peseeApres,
        ];
    }
}
