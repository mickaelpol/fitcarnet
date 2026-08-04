<?php

declare(strict_types=1);

namespace App\Entity;

/**
 * Marque une entite qui appartient a un utilisateur.
 * Sert au filtrage automatique des collections et a l'affectation du proprietaire.
 */
interface ProprieteUtilisateur
{
    public function getUtilisateur(): ?Utilisateur;

    public function setUtilisateur(?Utilisateur $utilisateur): self;
}
