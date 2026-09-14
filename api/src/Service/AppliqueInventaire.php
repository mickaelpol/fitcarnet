<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Utilisateur;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\Persistence\ManagerRegistry;
use Psr\Log\LoggerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Applique un lot d'inventaire, une ligne apres l'autre.
 *
 * TOUT L'INTERET EST DANS « APRES L'AUTRE ».
 *
 * Grocy tourne avec cinq ouvriers PHP et une base SQLite, qui n'admet qu'un
 * ecrivain a la fois. Envoyer quarante corrections ensemble ne les traite pas
 * ensemble : elles font la queue, et l'une d'elles finit par mourir sur un
 * verrou. On mesure, on constate, on envoie a la file.
 *
 * Ce service ne tourne JAMAIS dans une requete HTTP. C'est ce qui lui permet
 * de prendre une minute sans que personne n'attende, et c'est la seule raison
 * pour laquelle la lenteur de Grocy devient supportable.
 */
final readonly class AppliqueInventaire
{
    public function __construct(
        private FrigoGrocy $grocy,
        private FrigoBase $base,
        private InventaireLots $lots,
        /* LE REGISTRE, PAS LE GESTIONNAIRE D'ENTITES DIRECTEMENT.
         *
         * Un `EntityManagerInterface` injecte une fois pour toutes convient a
         * une requete HTTP, qui dure quelques millisecondes et meurt. Ce
         * service-ci tourne dans un processus qui vit des SEMAINES, et un
         * gestionnaire Doctrine qui rencontre une exception se FERME
         * definitivement. Tous les lots suivants echoueraient alors sur
         * « The EntityManager is closed », indefiniment, sans que le conteneur
         * ne meure — un travailleur zombie, qui tourne et ne fait plus rien.
         *
         * Le registre sait en rouvrir un. C'est la seule raison de sa
         * presence ici. */
        private ManagerRegistry $doctrine,
        private LoggerInterface $journal,
    ) {
    }

    /**
     * `utilisateur_id` est une CHAINE : la colonne est un UUID, et `utilisateur()`
     * fait `Uuid::fromString` dessus. Le type disait `int` — faux depuis
     * toujours, releve par PHPStan le 14 septembre 2026 en ecrivant le test de
     * M-03. Personne ne s'en apercevait : le code convertit en `(string)` juste
     * avant, ce qui rattrapait l'erreur de declaration sans la corriger.
     *
     * @param array{id: int, utilisateur_id: string, source: string, lignes: string, total: int, traites: int, jeton: string} $lot
     *
     * @return int nombre de lignes envoyees en tout
     */
    public function traiter(array $lot): int
    {
        $id = $lot['id'];
        $jeton = $lot['jeton'];

        /** @var list<array{reference: string, quantite: float|int|string}> $lignes */
        $lignes = (array) \json_decode($lot['lignes'], true, 512, \JSON_THROW_ON_ERROR);

        $utilisateur = $this->utilisateur((string) $lot['utilisateur_id']);
        if (null === $utilisateur) {
            // Le compte a ete supprime entre le depot et le traitement. Rien a
            // appliquer, et surtout rien a reessayer indefiniment.
            $this->lots->echouer($id, 'Le compte n’existe plus.', $jeton);

            return 0;
        }

        /* ON REPREND OU ON S'ETAIT ARRETE.
         *
         * `traites` vaut zero pour un lot neuf, et le rang atteint pour un lot
         * repris apres l'arret du conteneur. Renvoyer les lignes deja faites
         * ne serait pas faux — Grocy repondrait « deja a jour » — mais ce
         * serait payer une a deux secondes chacune pour rien. */
        $faits = $lot['traites'];
        $echecs = [];

        foreach (\array_slice($lignes, $faits) as $ligne) {
            $reference = (string) $ligne['reference'];
            $quantite = (float) $ligne['quantite'];

            $motif = $this->appliquerUne($utilisateur, $lot['source'], $reference, $quantite);
            if (null !== $motif) {
                /* UN ECHEC N'ARRETE PAS LES AUTRES. Mieux vaut corriger
                   trente-huit produits et nommer les deux qui ont resiste que
                   de tout abandonner apres un inventaire compte a la main. */
                $echecs[] = ['reference' => $reference, 'motif' => $motif];
                $this->journal->warning('inventaire : {reference} refuse — {motif}',
                    ['reference' => $reference, 'motif' => $motif]);
            }

            ++$faits;

            /* SI LE LOT A CHANGE DE MAINS, ON S'ARRETE ICI (constat E6).
               `avancer` rend faux quand la base n'a touche aucune ligne : le
               jeton n'est plus le notre, donc `reprendreLesAbandonnes` a rendu
               le lot pendant qu'on travaillait — un Grocy qui a mis plus de
               deux minutes sur une ligne suffit. Continuer reviendrait a
               ecraser l'avancement de notre remplacant, puis a clore le lot a
               sa place avec NOTRE liste d'echecs. Mieux vaut deux fois la meme
               ligne envoyee qu'un lot clos sur des chiffres faux. */
            if (!$this->lots->avancer($id, $faits, $jeton)) {
                $this->journal->warning(
                    'inventaire : lot {lot} repris par un autre travailleur, on s\'arrete',
                    ['lot' => $id, 'faites' => $faits]);

                return $faits - $lot['traites'];
            }
        }

        $this->lots->terminer($id, $faits, $echecs, $jeton);

        /* ON VIDE LE GESTIONNAIRE ENTRE DEUX LOTS.
         *
         * Doctrine garde en memoire toute entite qu'il a chargee, pour la
         * duree du processus. Sur une requete HTTP c'est un cache utile qui
         * disparait a la reponse. Ici, rien ne disparait jamais : au bout de
         * quelques milliers de lots, le conteneur se fait tuer pour depassement
         * memoire — au milieu d'un inventaire, evidemment, jamais au repos.
         *
         * Vider ici plutot qu'au debut du lot suivant : ce qui a servi ne sert
         * plus, et on ne laisse pas trainer une reference le temps d'une
         * attente qui peut durer des heures. */
        $this->doctrine->getManager()->clear();

        return $faits - $lot['traites'];
    }

    /**
     * Le compte, recharge proprement meme si Doctrine s'est ferme avant.
     *
     * `Uuid::fromString` PLUTOT QUE LA CHAINE BRUTE : `find()` accepte souvent
     * l'une comme l'autre, la conversion etant faite par le type Doctrine.
     * « Souvent » ne se verifie qu'a l'execution, et pas dans le cas qui nous
     * interesse — celui ou l'on repare quelque chose a distance.
     *
     * ON NE RATTRAPE RIEN ICI, ET C'EST DELIBERE. Un `null` doit vouloir dire
     * UNE seule chose : ce compte n'existe pas. Si on avalait aussi les pannes
     * de base, l'appelant marquerait le lot « le compte n'existe plus » — un
     * message faux, et un inventaire perdu pour une coupure de trois secondes.
     * Une panne remonte donc, et le lot reste en cours jusqu'a sa reprise.
     */
    private function utilisateur(string $identifiant): ?Utilisateur
    {
        $em = $this->doctrine->getManager();

        if ($em instanceof EntityManagerInterface && !$em->isOpen()) {
            $this->journal->warning('inventaire : gestionnaire Doctrine ferme, on le rouvre');
            $this->doctrine->resetManager();
            $em = $this->doctrine->getManager();
        }

        $utilisateur = $em->find(Utilisateur::class, Uuid::fromString($identifiant));

        return $utilisateur instanceof Utilisateur ? $utilisateur : null;
    }

    /** @return string|null le motif de l'echec, ou null si la ligne est passee */
    private function appliquerUne(
        Utilisateur $utilisateur,
        string $source,
        string $reference,
        float $quantite,
    ): ?string {
        $prefixe = 'grocy' === $source ? 'grocy:' : 'base:';

        if (!\str_starts_with($reference, $prefixe)) {
            return 'Référence étrangère à cette source : ' . $reference;
        }

        $identifiant = (int) \substr($reference, \strlen($prefixe));
        if ($identifiant <= 0) {
            return 'Référence illisible : ' . $reference;
        }

        try {
            if ('grocy' === $source) {
                return $this->grocy->inventorierUn($identifiant, $quantite);
            }

            $this->base->definirStock($utilisateur, $identifiant, $quantite);

            return null;
        } catch (\Throwable $e) {
            /* ON ATTRAPE TOUT, ET C'EST DELIBERE ICI ALORS QUE C'EST UNE
               MAUVAISE HABITUDE AILLEURS. Ce code tourne dans une boucle sans
               personne devant : une exception non rattrapee tuerait le
               travailleur et laisserait le lot « en cours » pour dix minutes.
               La ligne echoue, elle est nommee, on continue.

               CE QU'ON DIT, ET CE QU'ON GARDE (constat M-03, 14 septembre
               2026). C'etait `$e->getMessage()` qui repartait tel quel : pour
               une exception DBAL, la requete SQL complete, les noms de tables
               et de contraintes, parfois les parametres — la carte interne de
               la base, offerte a tout compte authentifie. Le detail va
               desormais au journal, ou il sert a quelqu'un ; le client apprend
               que la ligne n'est pas passee, ce qui est tout ce qu'il peut en
               faire. Taire n'est pas perdre : sans le `error` ci-dessous, on
               aurait echange une fuite contre un angle mort. */
            $this->journal->error('inventaire : {reference} a echoue — {erreur}', [
                'reference' => $reference,
                'erreur' => $e->getMessage(),
                'exception' => $e,
            ]);

            return 'Cette ligne n’a pas pu être appliquée.';
        }
    }
}
