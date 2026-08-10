<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\Aliment;
use App\Entity\Utilisateur;
use App\Service\Frigo;
use App\Service\FrigoBase;
use App\Service\FrigoGrocy;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Le frigo, quelle que soit sa provenance.
 *
 * Un seul endpoint pour l'application : elle ignore que l'administrateur lit
 * son stock dans Grocy et les autres dans la base. Le solveur recoit la meme
 * forme dans les deux cas.
 */
#[Route('/api')]
#[IsGranted('ROLE_USER')]
final class FrigoController extends AbstractController
{
    /**
     * Plafond d'un envoi d'inventaire.
     *
     * Grocy repond en 1,5 s par appel et le client HTTP en mene 6 de front :
     * 60 lignes tiennent en une quinzaine de secondes, sous les 30 s de PHP.
     * Au-dela, l'ecran doit envoyer en deux fois plutot que de mourir a
     * mi-parcours en laissant un stock a moitie corrige.
     */
    private const INVENTAIRE_MAX = 60;

    public function __construct(
        private readonly Frigo $frigo,
        private readonly FrigoBase $base,
        private readonly FrigoGrocy $grocy,
    ) {
    }

    #[Route('/mon-frigo', methods: ['GET'])]
    public function lire(): JsonResponse
    {
        $utilisateur = $this->utilisateur();

        $probleme = $this->frigo->diagnostic($utilisateur);
        if (null !== $probleme) {
            return $this->json([
                'source' => $this->frigo->source($utilisateur),
                'aliments' => [],
                'probleme' => $probleme,
            ]);
        }

        try {
            $aliments = $this->frigo->lire($utilisateur);
        } catch (\RuntimeException $e) {
            // une panne de Grocy ne doit pas casser l'application : on rend
            // une liste vide et on explique, plutot qu'une erreur 500
            return $this->json([
                'source' => $this->frigo->source($utilisateur),
                'aliments' => [],
                'probleme' => $e->getMessage(),
            ]);
        }

        return $this->json([
            'source' => $this->frigo->source($utilisateur),
            'aliments' => \array_map(
                static fn ($a) => $a->versTableau(), $aliments),
            'probleme' => null,
        ]);
    }

    /** Produits Grocy sans valeurs nutritionnelles : invisibles au calculateur. */
    #[Route('/mon-frigo/incomplets', methods: ['GET'])]
    public function incomplets(): JsonResponse
    {
        if ('grocy' !== $this->frigo->source($this->utilisateur())) {
            return $this->json(['produits' => []]);
        }

        return $this->json(['produits' => $this->grocy->produitsIncomplets()]);
    }

    /** Fixe la quantite d'un aliment. Reserve aux comptes lisant la base. */
    #[Route('/mon-frigo/stock', methods: ['POST'])]
    public function definirStock(Request $requete): JsonResponse
    {
        $utilisateur = $this->utilisateur();

        if ('base' !== $this->frigo->source($utilisateur)) {
            return $this->json([
                'erreur' => 'Tes quantités se modifient dans Grocy, pas ici.',
            ], 409);
        }

        $donnees = (array) \json_decode($requete->getContent(), true);
        $idAliment = (int) ($donnees['alimentId'] ?? 0);
        $quantite = (float) ($donnees['quantite'] ?? 0);

        if ($idAliment <= 0) {
            return $this->json(['erreur' => 'Aliment non précisé.'], 422);
        }
        if ($quantite < 0) {
            return $this->json(['erreur' => 'Une quantité ne peut pas être négative.'], 422);
        }

        $this->base->definirStock(
            $utilisateur, $idAliment, $quantite,
            isset($donnees['emplacementId']) ? (int) $donnees['emplacementId'] : null);

        return $this->json(['ok' => true]);
    }

    /**
     * Ecrit les valeurs nutritionnelles d'un aliment du frigo.
     *
     * Reserve aux comptes lisant Grocy. Le pendant pour la table « aliment »
     * passera par /api/aliments, qui pose deja proprietaire et confidentialite.
     */
    #[Route('/mon-frigo/aliment', methods: ['POST'])]
    public function enregistrerAliment(Request $requete): JsonResponse
    {
        $utilisateur = $this->utilisateur();

        if ('grocy' !== $this->frigo->source($utilisateur)) {
            return $this->json([
                'erreur' => 'Tes aliments se modifient dans la base, pas ici.',
            ], 409);
        }

        $donnees = (array) \json_decode($requete->getContent(), true);
        $reference = (string) ($donnees['reference'] ?? '');

        /* Sans reference, c'est une CREATION : le produit n'existe pas encore
           dans Grocy et on l'y pose avant d'ecrire ses valeurs.

           Les deux gestes tiennent dans le meme appel a dessein. Les separer
           laisserait, au moindre echec entre les deux, un produit nu dans
           Grocy — sans categorie ni calories, donc invisible au calculateur
           et impossible a distinguer d'un oubli. Ici l'echec de l'ecriture
           remonte tel quel : le produit reste, mais l'utilisateur voit le
           message et le rouvre pour le completer. */
        $creation = '' === $reference;

        if ($creation) {
            try {
                $idProduit = $this->grocy->creerProduit((string) ($donnees['nom'] ?? ''));
            } catch (\RuntimeException $e) {
                return $this->json(['erreur' => $e->getMessage()], 422);
            }
        } else {
            if (!\str_starts_with($reference, 'grocy:')) {
                return $this->json(['erreur' => 'Référence inattendue : ' . $reference], 422);
            }

            $idProduit = (int) \substr($reference, \strlen('grocy:'));
            if ($idProduit <= 0) {
                return $this->json(['erreur' => 'Produit non précisé.'], 422);
            }
        }

        $categorie = (string) ($donnees['categorie'] ?? '');
        if (!\in_array($categorie, Aliment::CATEGORIES, true)) {
            return $this->json(['erreur' => 'Catégorie inconnue : ' . $categorie], 422);
        }

        // Les calories fondent tout le calcul : un zero ferait disparaitre
        // l'aliment du solveur sans que rien ne le signale.
        $kcal100 = (float) ($donnees['kcal100'] ?? 0);
        if ($kcal100 <= 0) {
            return $this->json(['erreur' => 'Les calories sont obligatoires.'], 422);
        }

        $ratio = (float) ($donnees['ratio'] ?? 1);
        if ($ratio <= 0) {
            return $this->json(['erreur' => 'Le ratio doit être positif.'], 422);
        }

        try {
            $this->grocy->enregistrerValeurs(
                $idProduit,
                categorie: $categorie,
                kcal100: $kcal100,
                prot100: (float) ($donnees['prot100'] ?? 0),
                gluc100: (float) ($donnees['gluc100'] ?? 0),
                lip100: (float) ($donnees['lip100'] ?? 0),
                fibres100: self::nombreOuNull($donnees['fibres100'] ?? null),
                ratio: $ratio,
                peseeAvant: self::nombreOuNull($donnees['peseeAvant'] ?? null),
                peseeApres: self::nombreOuNull($donnees['peseeApres'] ?? null),
            );
        } catch (\RuntimeException $e) {
            return $this->json(['erreur' => $e->getMessage()], 502);
        }

        /* La reference est rendue pour que l'ecran puisse enchainer sur la
           quantite : c'est cet appel-la qui rattache le produit a un
           emplacement, sans quoi il resterait sous « Sans emplacement ». */
        return $this->json(['ok' => true, 'reference' => 'grocy:' . $idProduit]);
    }

    /**
     * Applique un inventaire : le poids reellement compte remplace le
     * theorique, pour les seules lignes envoyees.
     *
     * L'ecran n'envoie que les ecarts, et seulement au clic. Une ligne absente
     * n'est pas un zero : elle n'a pas ete comptee, et son stock ne bouge pas.
     */
    #[Route('/mon-frigo/inventaire', methods: ['POST'])]
    public function inventorier(Request $requete): JsonResponse
    {
        $utilisateur = $this->utilisateur();
        $source = $this->frigo->source($utilisateur);
        $prefixe = 'grocy' === $source ? 'grocy:' : 'base:';

        $donnees = (array) \json_decode($requete->getContent(), true);
        $lignes = $donnees['lignes'] ?? null;

        if (!\is_array($lignes) || [] === $lignes) {
            return $this->json(['erreur' => 'Aucune ligne à envoyer.'], 422);
        }
        if (\count($lignes) > self::INVENTAIRE_MAX) {
            return $this->json([
                'erreur' => \sprintf(
                    'Inventaire trop gros : %d lignes pour %d au maximum. Envoie-le en deux fois.',
                    \count($lignes), self::INVENTAIRE_MAX),
            ], 422);
        }

        $quantites = [];
        foreach ($lignes as $ligne) {
            $ligne = (array) $ligne;
            $reference = (string) ($ligne['reference'] ?? '');

            if (!\str_starts_with($reference, $prefixe)) {
                return $this->json([
                    'erreur' => 'Référence étrangère à ton frigo : ' . $reference,
                ], 422);
            }

            $idAliment = (int) \substr($reference, \strlen($prefixe));
            $quantite = (float) ($ligne['quantite'] ?? -1);

            if ($idAliment <= 0 || $quantite < 0) {
                return $this->json(['erreur' => 'Ligne invalide : ' . $reference], 422);
            }

            $quantites[$idAliment] = $quantite;
        }

        if ('grocy' === $source) {
            try {
                $echecs = $this->grocy->inventorier($quantites);
            } catch (\RuntimeException $e) {
                return $this->json(['erreur' => $e->getMessage()], 502);
            }
        } else {
            $echecs = [];
            foreach ($quantites as $idAliment => $quantite) {
                $this->base->definirStock($utilisateur, $idAliment, $quantite);
            }
        }

        $detail = [];
        foreach ($echecs as $idAliment => $motif) {
            $detail[] = ['reference' => $prefixe . $idAliment, 'motif' => $motif];
        }

        return $this->json([
            'corriges' => \count($quantites) - \count($echecs),
            'echecs' => $detail,
        ]);
    }

    private static function nombreOuNull(mixed $valeur): ?float
    {
        return null === $valeur || '' === $valeur ? null : (float) $valeur;
    }

    private function utilisateur(): Utilisateur
    {
        $utilisateur = $this->getUser();
        \assert($utilisateur instanceof Utilisateur);

        return $utilisateur;
    }
}
