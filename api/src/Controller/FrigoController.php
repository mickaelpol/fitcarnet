<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\Aliment;
use App\Entity\Utilisateur;
use App\Service\Frigo;
use App\Service\FrigoBase;
use App\Service\FrigoGrocy;
use App\Service\InventaireLots;
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
     * CE CHIFFRE NE PROTEGE PLUS D'UNE MINUTERIE, ET SON ANCIENNE
     * JUSTIFICATION ETAIT FAUSSE. Elle disait : « Grocy repond en 1,5 s par
     * appel et le client HTTP en mene 6 de front, donc 60 lignes tiennent sous
     * les 30 s de PHP ». Le calcul etait juste, l'hypothese dessous ne l'etait
     * pas : Grocy tourne avec CINQ ouvriers PHP et une base SQLite qui
     * n'accepte qu'un ecrivain. Il n'en menait jamais 6 de front. Personne
     * n'avait mesure — et le 14 aout 2026 l'envoi est mort a mi-parcours.
     *
     * Depuis, l'application est faite en tache de fond : la duree n'est plus
     * une contrainte. Ce plafond ne sert donc qu'a une chose, refuser
     * l'absurde — un client qui poste dix mille lignes remplirait la table
     * avant qu'on s'en apercoive. Il est large exprès : il ne doit jamais
     * gener un inventaire reel.
     */
    private const INVENTAIRE_MAX = 500;

    public function __construct(
        private readonly Frigo $frigo,
        private readonly FrigoBase $base,
        private readonly FrigoGrocy $grocy,
        private readonly InventaireLots $lots,
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
    /**
     * CET ALIMENT EST-IL LE MIEN, OU CELUI DE TOUT LE MONDE ?
     *
     * `alimentId` vient du CORPS DE LA REQUETE. On ne verifiait que `> 0` :
     * la seule barriere restante etait la cle etrangere, qui accepte
     * n'importe quel aliment existant — y compris l'aliment PRIVE d'un autre
     * compte.
     *
     * Ce n'etait pas une fuite : `FrigoBase::lire` filtre a la lecture, la
     * victime ne voit jamais cette ligne. C'etait pire a sa facon — un blocage
     * qu'elle ne peut pas defaire. Bob pose 1 g de stock sur l'aliment prive
     * d'Alice ; Alice essaie de supprimer son aliment et recoit « il est
     * encore dans un frigo, mets sa quantite a zero » — une quantite qui
     * n'est pas dans son frigo a elle. Son aliment devient indelebile.
     *
     * Effet secondaire supprime au passage : la difference entre 200 et 500
     * permettait d'enumerer les identifiants d'aliments existants.
     */
    private function alimentAccessible(Utilisateur $utilisateur, int $idAliment): bool
    {
        return [] !== $this->base->alimentsAccessibles($utilisateur, [$idAliment]);
    }

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
        /* MEME REPONSE POUR « n'existe pas » ET « ne t'appartient pas ».
           Distinguer les deux dirait a un inconnu quels identifiants
           existent. */
        if (!$this->alimentAccessible($utilisateur, $idAliment)) {
            return $this->json(['erreur' => 'Cet aliment n’existe pas dans ton catalogue.'], 404);
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
     * Pose la quantite d'UN produit Grocy, tout de suite.
     *
     * POURQUOI CE CHEMIN N'EST PAS CELUI DE L'INVENTAIRE.
     *
     * Les deux passaient par la meme route, et c'est ce qui a produit le
     * message le plus trompeur de l'application : un inventaire qui echouait
     * affichait « L'aliment a bien ete cree, mais sa quantite n'a pas pu etre
     * posee » — a quelqu'un qui n'avait rien cree. Le texte etait ecrit pour
     * la creation, la route servait aussi a autre chose.
     *
     * Ils n'ont d'ailleurs pas les memes contraintes. UN appel Grocy prend une
     * a deux secondes : ca tient sans probleme dans une requete, et repondre
     * tout de suite est ici la bonne reponse — l'utilisateur regarde la fiche
     * qu'il vient de remplir. Passer par la file lui vaudrait un « en cours »
     * pour une seconde d'attente, et un 409 s'il cree un aliment pendant qu'un
     * inventaire tourne.
     *
     * Cote Grocy, poser une quantite EST un inventaire : on declare le poids
     * present, Grocy en deduit l'ecart. C'est exactement ce qu'on veut a la
     * creation — le produit passe de « inconnu » a « j'en ai tant ».
     */
    #[Route('/mon-frigo/quantite', methods: ['POST'])]
    public function definirQuantiteGrocy(Request $requete): JsonResponse
    {
        if ('grocy' !== $this->frigo->source($this->utilisateur())) {
            return $this->json([
                'erreur' => 'Tes quantités se modifient dans la base, pas ici.',
            ], 409);
        }

        $donnees = (array) \json_decode($requete->getContent(), true);
        $reference = (string) ($donnees['reference'] ?? '');
        $quantite = (float) ($donnees['quantite'] ?? -1);

        if (!\str_starts_with($reference, 'grocy:')) {
            return $this->json(['erreur' => 'Référence inattendue : ' . $reference], 422);
        }

        $idProduit = (int) \substr($reference, \strlen('grocy:'));
        if ($idProduit <= 0 || $quantite < 0) {
            return $this->json(['erreur' => 'Ligne invalide : ' . $reference], 422);
        }

        try {
            $motif = $this->grocy->inventorierUn($idProduit, $quantite);
        } catch (\RuntimeException $e) {
            return $this->json(['erreur' => $e->getMessage()], 502);
        }

        if (null !== $motif) {
            return $this->json(['erreur' => $motif], 502);
        }

        return $this->json(['ok' => true]);
    }

    /**
     * DEPOSE un inventaire. Ne l'applique pas.
     *
     * CETTE REQUETE NE TOUCHE PLUS A GROCY, ET C'EST TOUT LE CORRECTIF.
     *
     * Avant, elle poussait les lignes elle-meme. Le 14 aout 2026, PHP s'est
     * arrete a 30 s au milieu d'un inventaire de quarante lignes pendant que
     * Grocy continuait a appliquer ce qu'il avait deja recu : frigo a moitie
     * corrige, et personne pour le dire. Une requete HTTP a une duree
     * maximale ; un inventaire n'en a pas. Les faire coincider etait une
     * erreur de conception, pas un reglage a ajuster.
     *
     * La requete valide, ecrit une ligne, et rend la main. `fitcarnet-taches`
     * applique — une ligne apres l'autre, sans minuterie. L'ecran suit
     * l'avancement sur /mon-frigo/inventaire/dernier.
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
                    'Inventaire trop gros : %d lignes pour %d au maximum.',
                    \count($lignes), self::INVENTAIRE_MAX),
            ], 422);
        }

        /* ON DEDOUBLONNE PAR REFERENCE. Deux lignes sur le meme produit
           feraient partir deux corrections : la seconde annoncerait la
           quantite que la premiere vient de poser, et Grocy la refuserait.
           Un tableau associatif dit cette regle une fois pour toutes. */
        $parReference = [];
        foreach ($lignes as $ligne) {
            $ligne = (array) $ligne;
            $reference = (string) ($ligne['reference'] ?? '');

            if (!\str_starts_with($reference, $prefixe)) {
                return $this->json([
                    'erreur' => 'Référence étrangère à ton frigo : ' . $reference,
                ], 422);
            }

            $identifiant = (int) \substr($reference, \strlen($prefixe));
            $quantite = (float) ($ligne['quantite'] ?? -1);

            if ($identifiant <= 0 || $quantite < 0) {
                return $this->json(['erreur' => 'Ligne invalide : ' . $reference], 422);
            }

            $parReference[$reference] = ['reference' => $reference, 'quantite' => $quantite];
        }

        /* LE MEME CONTROLE QUE SUR /mon-frigo/stock, QUI MANQUAIT ICI.
           Constat E-01 de l'audit du 7 septembre 2026 : cette route ecrit du
           stock par un autre chemin, et ne demandait a personne si l'aliment
           vise etait commun ou celui du demandeur. Bob posait 1 g sur l'aliment
           prive d'Alice, et Alice ne pouvait plus supprimer le sien.

           Au DEPOT, pas a l'application : le lot part en tache de fond, et un
           refus rendu une heure plus tard n'a plus personne devant l'ecran.

           Seule la source `base` est concernee — une reference `grocy:` designe
           un produit de Grocy, que la table `aliment` ne connait pas. */
        if ('base' === $source) {
            $demandes = \array_map(
                static fn (string $reference): int => (int) \substr($reference, \strlen($prefixe)),
                \array_keys($parReference));

            if (\count($this->base->alimentsAccessibles($utilisateur, $demandes)) !== \count($demandes)) {
                /* MEME REPONSE QUE POUR « n'existe pas », ET SANS DIRE LEQUEL.
                   Nommer la ligne fautive rendrait l'enumeration des
                   identifiants d'aliments confortable. */
                return $this->json([
                    'erreur' => 'Un aliment de cet inventaire n’existe pas dans ton catalogue.',
                ], 404);
            }
        }

        try {
            $id = $this->lots->deposer($utilisateur, $source, \array_values($parReference));
        } catch (\RuntimeException $e) {
            // 409 et non 422 : la demande est valide, c'est le moment qui ne
            // l'est pas. Un inventaire tourne deja pour ce compte.
            return $this->json(['erreur' => $e->getMessage()], 409);
        }

        return $this->json([
            'id' => $id,
            'total' => \count($parReference),
        ], 202);
    }

    /**
     * Ou en est le dernier inventaire de ce compte.
     *
     * INTERROGEABLE APRES COUP, ET PAS SEULEMENT PENDANT. L'ecran peut avoir
     * ete ferme, le telephone verrouille, l'application redemarree : le
     * resultat doit rester lisible quand on revient. C'est la difference entre
     * un envoi dont on connait le sort et un envoi dont on l'a rate.
     */
    #[Route('/mon-frigo/inventaire/dernier', methods: ['GET'])]
    public function dernierInventaire(): JsonResponse
    {
        return $this->json($this->lots->dernier($this->utilisateur()) ?? ['statut' => 'aucun']);
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
