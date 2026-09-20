<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\Aliment;
use App\Entity\Utilisateur;
use App\Repository\AlimentsReference;
use App\Service\Frigo;
use App\Service\FrigoBase;
use App\Service\MigrationGrocy;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Validator\Validator\ValidatorInterface;

/**
 * Quitter Grocy, un produit a la fois.
 *
 * But donne par le proprietaire du projet le 20 septembre 2026 : « migrer de
 * Grocy vers la base de donnees de l'application car je ne veux plus utiliser
 * Grocy ». Le rattachement au catalogue CIQUAL se fait dans le meme geste — une
 * pierre deux coups, et c'est le seul moment ou quelqu'un regarde ses soixante
 * aliments un par un.
 *
 * ON NE SUPPRIME RIEN DANS GROCY, JAMAIS. Cette classe LIT Grocy et ECRIT dans
 * la base. Grocy reste intact : la personne verifie, tourne sur la base le
 * temps qu'elle veut, et c'est elle qui l'eteint. Une migration qui detruit sa
 * source n'a pas de marche arriere.
 *
 * ET ELLE SE REJOUE. Chaque produit se migre independamment ; recommencer un
 * produit deja migre le MET A JOUR au lieu d'en creer un second. Soixante-deux
 * aliments ne se font pas en une fois sans interruption.
 */
#[Route('/api')]
final class MigrationGrocyController extends AbstractController
{
    public function __construct(
        private readonly Frigo $frigo,
        private readonly FrigoBase $base,
        private readonly AlimentsReference $catalogue,
        private readonly EntityManagerInterface $em,
        private readonly Connection $cnx,
        private readonly ValidatorInterface $validateur,
    ) {
    }

    /**
     * Ce qu'il reste a migrer, et ce qui est deja passe.
     *
     * L'ETAT VIENT DU SERVEUR, PAS DE L'ECRAN. Une migration de soixante
     * aliments s'interrompt : on ferme l'onglet, le telephone se verrouille.
     * Un compteur tenu en memoire repartirait de zero et ferait tout
     * recommencer.
     */
    #[Route('/migration-grocy', methods: ['GET'])]
    #[IsGranted('IS_AUTHENTICATED_FULLY')]
    public function etat(): JsonResponse
    {
        $utilisateur = $this->utilisateur();

        if ('grocy' !== $this->frigo->source($utilisateur)) {
            return $this->json([
                'source' => 'base',
                'aRattacher' => [],
                'dejaEnBase' => [],
                'emplacements' => $this->emplacements(),
                'probleme' => 'Ton frigo est déjà tenu dans la base : il n’y a rien à migrer.',
            ]);
        }

        try {
            $tout = $this->frigo->lireTout($utilisateur);
        } catch (\RuntimeException $e) {
            return $this->json([
                'source' => 'grocy', 'aRattacher' => [], 'dejaEnBase' => [],
                'emplacements' => $this->emplacements(), 'probleme' => $e->getMessage(),
            ]);
        }

        /* LES INCOMPLETS VIENNENT AVEC LES AUTRES, et c'est le point : ce sont
           eux qui demandent le plus de travail — leurs valeurs n'existent nulle
           part, il faut lire le paquet. Les cacher ici les laisserait derriere
           au moment ou on eteint Grocy. */
        $aRattacher = [];
        foreach ($tout['aliments'] as $a) {
            $aRattacher[] = $a->versTableau() + ['valeursConnues' => true];
        }
        foreach ($tout['incomplets'] as $i) {
            $aRattacher[] = $i + ['valeursConnues' => false];
        }

        return $this->json([
            'source' => 'grocy',
            'aRattacher' => $aRattacher,
            'dejaEnBase' => $this->nomsDejaEnBase($utilisateur),
            'emplacements' => $this->emplacements(),
            'probleme' => null,
        ]);
    }

    /**
     * Migre UN produit : cree l'aliment en base et pose son stock.
     *
     * UN PRODUIT A LA FOIS, ET C'EST DELIBERE. Un geste unique sur soixante-deux
     * produits echouerait en entier sur le cinquante-quatrieme, et personne ne
     * saurait ou il en est. Ici, chaque ligne repond pour elle.
     */
    #[Route('/migration-grocy/aliment', methods: ['POST'])]
    #[IsGranted('IS_AUTHENTICATED_FULLY')]
    public function migrer(Request $requete): JsonResponse
    {
        $utilisateur = $this->utilisateur();
        $corps = (array) \json_decode((string) $requete->getContent(), true);

        $nom = \trim((string) ($corps['nom'] ?? ''));
        if ('' === $nom) {
            return $this->refus('Aliment non précisé.');
        }

        $reference = (string) ($corps['referenceCiqual'] ?? '');
        if ('' !== $reference && !$this->catalogue->existe($reference)) {
            return $this->refus('Ce rattachement ne correspond à aucun aliment de référence.');
        }

        /* DEJA MIGRE ? ON MET A JOUR. La migration se fait en plusieurs fois,
           et rejouer une ligne ne doit pas creer un doublon — l'index unique
           `aliment_nom_unique_par_compte` le refuserait d'ailleurs, avec un
           message qui parlerait de nom deja pris au lieu de migration. */
        $aliment = $this->em->getRepository(Aliment::class)->findOneBy([
            'utilisateur' => $utilisateur, 'nom' => $nom,
        ]) ?? (new Aliment())->setUtilisateur($utilisateur);

        $aliment
            ->setNom($nom)
            ->setCategorie((string) ($corps['categorie'] ?? 'autre'))
            ->setKcal100(self::nombre($corps['kcal100'] ?? null))
            ->setProt100(self::nombre($corps['prot100'] ?? null))
            ->setGluc100(self::nombre($corps['gluc100'] ?? null))
            ->setLip100(self::nombre($corps['lip100'] ?? null))
            ->setFibres100(self::nombre($corps['fibres100'] ?? null))
            ->setRatio(self::nombre($corps['ratio'] ?? null) ?? 1.0)
            ->setPeseeAvant(self::nombre($corps['peseeAvant'] ?? null))
            ->setPeseeApres(self::nombre($corps['peseeApres'] ?? null))
            ->setReferenceCiqual('' === $reference ? null : $reference);

        /* LA VALIDATION EST CELLE DE TOUT LE MONDE. Ce chemin n'echappe pas aux
           macros obligatoires ni au sens du rendement : un produit Grocy sans
           valeurs ne rentre pas en base en douce parce qu'il vient d'ailleurs. */
        $fautes = $this->validateur->validate($aliment);
        if (\count($fautes) > 0) {
            return $this->refus((string) $fautes->get(0)->getMessage());
        }

        $this->em->persist($aliment);
        $this->em->flush();

        $stock = self::nombre($corps['stock'] ?? null) ?? 0.0;
        $this->base->definirStock(
            $utilisateur, $aliment->getId(), $stock,
            $this->idEmplacement((string) ($corps['emplacement'] ?? '')));

        return $this->json([
            'reference' => 'base:' . $aliment->getId(),
            'nom' => $aliment->getNom(),
            'stock' => $stock,
        ], Response::HTTP_CREATED);
    }

    /**
     * Bascule le frigo sur la base.
     *
     * GROCY N'EST PAS TOUCHE. On change la SOURCE que l'application lit, rien
     * d'autre : tout y reste, et revenir en arriere est un second appel.
     */
    #[Route('/migration-grocy/terminer', methods: ['POST'])]
    #[IsGranted('IS_AUTHENTICATED_FULLY')]
    public function terminer(): JsonResponse
    {
        $utilisateur = $this->utilisateur();
        $utilisateur->setSourceFrigo('base');
        $this->em->flush();

        return $this->json(['source' => 'base']);
    }

    // ----------------------------------------------------------------- outils

    /** @return list<string> */
    private function emplacements(): array
    {
        /** @var list<string> */
        return $this->cnx->fetchFirstColumn(
            'SELECT libelle FROM emplacement ORDER BY ordre, id');
    }

    /** @return list<string> les noms deja presents dans le catalogue du compte */
    private function nomsDejaEnBase(Utilisateur $utilisateur): array
    {
        /** @var list<string> */
        return $this->cnx->fetchFirstColumn(
            'SELECT nom FROM aliment WHERE utilisateur_id = :u',
            ['u' => $utilisateur->getId()]);
    }

    private function idEmplacement(string $grocy): ?int
    {
        $libelle = MigrationGrocy::emplacementEquivalent($grocy, $this->emplacements());
        $id = $this->cnx->fetchOne(
            'SELECT id FROM emplacement WHERE libelle = :l', ['l' => $libelle]);

        return false === $id ? null : (int) $id;
    }

    /** VIDE N'EST PAS ZERO (regle 6) : une valeur absente reste absente. */
    private static function nombre(mixed $v): ?float
    {
        return \is_numeric($v) ? (float) $v : null;
    }

    private function refus(string $message): JsonResponse
    {
        return $this->json(['erreur' => $message], Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    private function utilisateur(): Utilisateur
    {
        $u = $this->getUser();
        if (!$u instanceof Utilisateur) {
            throw $this->createAccessDeniedException();
        }

        return $u;
    }
}
