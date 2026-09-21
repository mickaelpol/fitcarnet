<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\Aliment;
use App\Entity\Utilisateur;
use App\Repository\PlansPrevus;
use App\Service\AnomaliesAliment;
use App\Service\CoherenceNutritionnelle;
use App\Service\ControleDesMacros;
use App\Service\EcartDInventaire;
use App\Service\Frigo;
use App\Service\RendementPlausible;
use App\Service\FrigoBase;
use App\Service\FrigoGrocy;
use App\Service\InventaireLots;
use App\Service\StockPromis;
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
        /* AJOUTE AU PALIER B, le 21 septembre 2026 : le frigo ne dit plus
           seulement ce qu'il contient, il dit ce qui reste VRAIMENT une fois
           les plans prevus servis. Le front le calculait. */
        private readonly PlansPrevus $plansPrevus,
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
                'incomplets' => [],
                'anomalies' => [],
                'seuilEcartInventaire' => EcartDInventaire::SEUIL,
                'probleme' => $probleme,
            ]);
        }

        try {
            $tout = $this->frigo->lireTout($utilisateur);
        } catch (\RuntimeException $e) {
            // une panne de Grocy ne doit pas casser l'application : on rend
            // une liste vide et on explique, plutot qu'une erreur 500
            return $this->json([
                'source' => $this->frigo->source($utilisateur),
                'aliments' => [],
                'incomplets' => [],
                'anomalies' => [],
                'seuilEcartInventaire' => EcartDInventaire::SEUIL,
                'probleme' => $e->getMessage(),
            ]);
        }

        /* `incomplets` PART DANS LA MEME REPONSE, et c'est le point : ces
           produits sortent des cinq appels Grocy que `lire()` faisait deja.
           Les demander a part aurait coute deux appels de plus sur un serveur
           dont l'en-tete de `FrigoGrocy::lire()` rappelle qu'il fait la queue.

           Ils sont SEPARES des aliments parce qu'ils n'ont pas de macros :
           l'ecran les affiche, le calculateur ne les voit pas. */
        /* CHAQUE ALIMENT PORTE SON CONTROLE — 20 septembre 2026. Le detail
           d'une ligne du frigo le calculait encore lui-meme
           (`ligneFrigo.tsx`), c'est-a-dire que le front posait la meme
           question que le serveur, avec la meme phrase. Dernier juge du front
           sur cet ecran, releve par `revue-fitcarnet`.

           Il part avec l'aliment plutot que dans une liste a part : c'est la
           ligne qui l'affiche, et l'apparier apres coup demanderait une cle
           que le nom ne garantit pas. */
        /* CE QUI EST DEJA PROMIS A UN AUTRE PLAN — palier B, 21 septembre 2026.
           Le front lisait les plans et faisait la soustraction lui-meme
           (`dejaPromis`, `grammesDisponibles`). Les deux entrees venaient du
           serveur et il n'en modifiait aucune : c'est le cas ou le chiffre peut
           etre rendu, plutot que la regle transmise.

           SANS CETTE SOUSTRACTION, deux batch cooking d'affilee comptent deux
           fois le meme frigo : chacun juste tout seul, faux ensemble, et rien ne
           le dit. */
        $promis = StockPromis::parReference($this->plansPrevus->duCompte((string) $utilisateur->getId()));

        $aliments = \array_map(static function ($a) use ($promis): array {
            $t = $a->versTableau();
            $t['controle'] = ControleDesMacros::pour(
                (float) $t['kcal100'], (float) $t['prot100'], (float) $t['gluc100'],
                (float) $t['lip100'],
                null === $t['fibres100'] ? null : (float) $t['fibres100']);
            $t['grammesDisponibles'] = StockPromis::disponible(
                $a->stockEnGrammes(), $promis[(string) $t['reference']] ?? 0.0);

            return $t;
        }, $tout['aliments']);

        /* LES ANOMALIES PARTENT AVEC LE FRIGO, pas par une route a part — et
           c'est le meme argument que pour `incomplets` juste au-dessus : les
           donnees sont deja la, les redemander couterait un aller-retour pour
           rien.

           ELLES SONT CALCULEES ICI DEPUIS LE 20 SEPTEMBRE 2026. Le front les
           deduisait lui-meme (`verifierCatalogue`), c'est-a-dire qu'il portait
           quatorze regles metier que tout autre front aurait du reecrire. Le
           serveur les rend ; l'ecran affiche. */
        return $this->json([
            'source' => $this->frigo->source($utilisateur),
            'aliments' => $aliments,
            'incomplets' => $tout['incomplets'],
            'anomalies' => AnomaliesAliment::pourLeCatalogue(\array_map(
                static fn (array $a): array => [
                    'nom' => (string) $a['nom'],
                    'categorie' => (string) $a['categorie'],
                    'kcal100' => (float) $a['kcal100'],
                    'prot100' => (float) $a['prot100'],
                    'gluc100' => (float) $a['gluc100'],
                    'lip100' => (float) $a['lip100'],
                    'fibres100' => null === $a['fibres100'] ? null : (float) $a['fibres100'],
                    'ratio' => (float) $a['ratio'],
                ],
                $aliments)),
            /* LE SEUIL SOUS LEQUEL UNE PESEE N'EST PAS UN ECART — palier B,
               21 septembre 2026. Il etait ecrit dans `front/src/calcul/frigo.ts`,
               et il decide de ce qui part vers Grocy.

               LE NOMBRE, ET NON LE VERDICT : un inventaire se compare a chaque
               frappe sur jusqu'a cinq cents lignes, et le plan ecrit noir sur
               blanc qu'un aller-retour par case serait une REGRESSION. Motif de
               `GET /api/modes-de-travail` : le serveur transmet la regle, l'ecran
               fait une comparaison parametree.

               IL PART AVEC LES TROIS REPONSES, y compris celles qui rendent une
               liste vide : un frigo Grocy en panne laisse quand meme l'ecran
               afficher un inventaire deja saisi, et il lui faut le seuil. */
            'seuilEcartInventaire' => EcartDInventaire::SEUIL,
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

    /**
     * Fixe la quantite d'un aliment. Reserve aux comptes lisant la base.
     *
     * CET ALIMENT EST-IL LE MIEN ?
     *
     * `alimentId` vient du CORPS DE LA REQUETE. On ne verifiait que `> 0` :
     * la seule barriere restante etait la cle etrangere, qui acceptait
     * n'importe quel aliment existant — y compris celui d'un autre compte.
     * Depuis le 17 septembre 2026, la base le refuse aussi (cle composite
     * `stock_aliment_du_meme_compte_fkey`, migration 35) ; le controle ci-dessous
     * reste, pour repondre 404 plutot que de laisser tomber une erreur SQL.
     *
     * Ce n'etait pas une fuite : `FrigoBase::lire` filtre a la lecture, la
     * victime ne voit jamais cette ligne. C'etait pire a sa facon — un blocage
     * qu'elle ne peut pas defaire. Bob pose 1 g de stock sur l'aliment
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

        /* L'EMPLACEMENT VIENT AUSSI DU CORPS. Un identifiant inconnu atteignait
           la cle etrangere et la reponse etait un 500 avec le SQL, jusqu'au
           17 septembre 2026 (`EmplacementInconnuTest`). */
        $idEmplacement = isset($donnees['emplacementId']) ? (int) $donnees['emplacementId'] : null;
        if (null !== $idEmplacement && !$this->base->emplacementExiste($idEmplacement)) {
            return $this->json(['erreur' => 'Cet emplacement n’existe pas.'], 422);
        }

        $this->base->definirStock($utilisateur, $idAliment, $quantite, $idEmplacement);

        return $this->json(['ok' => true]);
    }

    /**
     * Ecrit les valeurs nutritionnelles d'un aliment du frigo.
     *
     * Reserve aux comptes lisant Grocy. Le pendant pour la table « aliment »
     * est /api/aliments, qui pose le proprietaire a la creation.
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

        /* LES CONTRÔLES D'ABORD, LA CRÉATION ENSUITE. Jusqu'au 17 septembre
           2026, une création posait le produit dans Grocy AVANT de vérifier
           catégorie, calories, ratio et macros : un corps incomplet recevait
           bien son 422, mais laissait un produit nu dans Grocy. Voir
           `ValeursGrocyObligatoiresTest`. */
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

        /* UNE MACRO ABSENTE N'EST PAS UN ZÉRO (règle 6). Jusqu'au 17 septembre
           2026, `?? 0` écrivait dans Grocy un zéro que personne n'avait donné ;
           c'est le jumeau de la correction faite le même jour sur
           `Aliment` (NotNull). Voir `ValeursGrocyObligatoiresTest`. */
        $macros = [];
        foreach (['prot100', 'gluc100', 'lip100'] as $cle) {
            $valeur = $donnees[$cle] ?? null;
            if (!\is_numeric($valeur) || (float) $valeur < 0) {
                return $this->json([
                    'erreur' => 'Protéines, glucides et lipides sont obligatoires : écris 0 si l’aliment n’en contient pas.',
                ], 422);
            }
            $macros[$cle] = (float) $valeur;
        }

        /* LA MEME COHERENCE QUE SUR L'ENTITE — pose le 20 septembre 2026,
           quelques heures apres le palier 1, et releve par le proprietaire du
           projet SUR SON PROPRE ECRAN.

           Le palier 1 avait mis la regle sur `Aliment`, via `Assert\Callback`.
           Mais un compte en `sourceFrigo = grocy` n'emprunte JAMAIS cette
           entite : il passe par ici. Les valeurs que l'API refusait en 422 une
           heure plus tot — 130 kcal pour un riz qui gonfle — sont donc entrees
           sans un mot, et l'ecran a meme affiche « Coherent ».

           C'est le motif dominant du projet, et pour la DEUXIEME fois sur ce
           controleur : le corollaire de la regle 2 dit « verifier sur CHAQUE
           chemin d'ecriture », apres la faille de septembre ou le controle
           etait present sur `/stock` et absent sur `/inventaire`.

           La regle n'est pas reecrite : c'est la meme fonction que l'entite
           appelle, donc le meme fichier de regles les verrouille tous les
           deux. AVANT la creation, comme les controles au-dessus : un refus ne
           doit pas laisser un produit nu dans Grocy. */
        $incoherence = CoherenceNutritionnelle::motifDeRefus(
            $categorie,
            $kcal100,
            $macros['prot100'],
            $macros['gluc100'],
            $macros['lip100'],
            self::nombreOuNull($donnees['fibres100'] ?? null),
            $ratio,
        );

        if (null !== $incoherence) {
            return $this->json(['erreur' => $incoherence], 422);
        }

        /* LE SENS DU RENDEMENT, SUR CE CHEMIN AUSSI — pose le 20 septembre
           2026, apres que `revue-fitcarnet` l'a releve. C'est la TROISIEME
           fois sur ce controleur, et le commentaire ci-dessus raconte deja les
           deux precedentes.

           Le chemin base le controle par l'entite
           (`Aliment::verifierLeSensDuRendement`). Ici, rien : un feculent a
           0,8 — une pesee a l'envers — entrait dans Grocy. Et rien ne le
           rattrapait, puisque la contrainte `aliment_ratio_sens` de la base ne
           s'applique pas a un produit qui n'y est pas.

           La regle n'est pas reecrite : c'est la meme fonction que l'entite
           appelle. */
        $sens = RendementPlausible::sens($categorie, $ratio);
        if (null !== $sens) {
            return $this->json(['erreur' => $sens], 422);
        }

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

        try {
            $this->grocy->enregistrerValeurs(
                $idProduit,
                categorie: $categorie,
                kcal100: $kcal100,
                prot100: $macros['prot100'],
                gluc100: $macros['gluc100'],
                lip100: $macros['lip100'],
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
           vise etait celui du demandeur. Bob posait 1 g sur l'aliment d'Alice,
           et Alice ne pouvait plus supprimer le sien.

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
