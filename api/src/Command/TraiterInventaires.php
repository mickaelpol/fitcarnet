<?php

declare(strict_types=1);

namespace App\Command;

use App\Service\AppliqueInventaire;
use App\Service\InventaireLots;
use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Applique les inventaires deposes par l'application.
 *
 *   bin/console app:inventaire:traiter            vide la file, puis sort
 *   bin/console app:inventaire:traiter --boucle   reste et attend du travail
 *
 * LE MODE `--boucle` EST CELUI DU CONTENEUR `fitcarnet-taches`.
 *
 * Le mode sans boucle existe pour deux usages : le lancer a la main quand on
 * veut voir ce qui se passe, et le mettre au planificateur DSM comme filet —
 * si le conteneur des taches est arrete, les inventaires deposes ne sont pas
 * perdus, ils partent au prochain passage.
 *
 * POURQUOI PAS SYMFONY MESSENGER. Il ferait exactement ca, mieux, avec des
 * reprises et une file typee. Il faudrait aussi ajouter une dependance, une
 * table de messages, une configuration de transport et un vocabulaire complet
 * — pour UN type de tache, sur un NAS. Le jour ou il y en aura trois, ce
 * fichier sera la mauvaise reponse et il faudra basculer. Aujourd'hui il tient
 * en cent lignes qu'on relit d'un coup d'oeil.
 */
#[AsCommand(
    name: 'app:inventaire:traiter',
    description: 'Applique les inventaires en attente, une ligne a la fois.',
)]
final class TraiterInventaires extends Command
{
    /**
     * Temps d'attente entre deux coups d'oeil a la file, en secondes.
     *
     * Deux secondes : l'utilisateur vient de toucher « envoyer » et regarde
     * son ecran. Plus long se verrait ; plus court interrogerait PostgreSQL
     * quarante-trois mille fois par jour pour ne rien trouver.
     */
    private const ATTENTE = 2;

    /**
     * Toutes les N boucles a vide, on cherche les lots abandonnes.
     *
     * Pas a chaque tour : c'est un UPDATE, et il ne repare que le cas rare du
     * conteneur mort en plein travail. Une fois par minute suffit largement.
     *
     * A VIDE SEULEMENT, ET C'EST VOULU : un travailleur occupe ne fait pas le
     * menage. Celui qui a du temps libre est precisement celui qui pourra
     * reprendre le lot qu'il vient de liberer.
     */
    private const TOURS_AVANT_MENAGE = 30;

    public function __construct(
        private readonly InventaireLots $lots,
        private readonly AppliqueInventaire $applique,
        private readonly Connection $cnx,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('boucle', null, InputOption::VALUE_NONE,
            'Reste en vie et attend du travail, au lieu de sortir une fois la file vide.');
    }

    protected function execute(InputInterface $entree, OutputInterface $sortie): int
    {
        $ecran = new SymfonyStyle($entree, $sortie);
        $enBoucle = (bool) $entree->getOption('boucle');

        /* AU DEMARRAGE, ON REPREND CE QUI NE BOUGE PLUS.
         *
         * La meme regle pour tout le monde, et c'est le point. Une version
         * precedente distinguait le conteneur dedie — « il est seul, donc tout
         * lot en cours est le mien » — du mode ponctuel. Ce raisonnement etait
         * juste et devenait faux au moment precis ou l'on ajoutait un second
         * travailleur, c'est-a-dire au moment ou l'on en avait besoin.
         *
         * `vu_le` remplace la deduction par une observation : un lot dont la
         * derniere ligne date de plus de deux minutes n'a plus personne
         * derriere lui. Personne n'a besoin de savoir combien nous sommes. */
        $repris = $this->lots->reprendreLesAbandonnes();
        if ($repris > 0) {
            $ecran->warning(\sprintf('%d inventaire(s) abandonne(s) remis en attente.', $repris));
        }

        $aVide = 0;

        while (true) {
            try {
                $lot = $this->lots->prendre();
            } catch (\Throwable $e) {
                /* LA BASE PEUT DISPARAITRE SOUS NOS PIEDS — redemarrage de
                   PostgreSQL, mise a jour de la pile. En boucle, ce processus
                   doit y survivre : sortir en erreur ferait redemarrer le
                   conteneur sans fin, et une boucle de redemarrage se lit bien
                   moins bien qu'une ligne dans le journal.

                   `close()` force la reconnexion au tour suivant. Sans elle la
                   connexion morte resterait dans le pool et chaque tentative
                   echouerait pareil, indefiniment. */
                $ecran->writeln('<comment>base injoignable : ' . $e->getMessage() . '</comment>');
                $this->cnx->close();

                // LANCE A LA MAIN OU PAR LE PLANIFICATEUR, ON DIT NON.
                // Un code de sortie a zero sur une base injoignable ferait
                // passer la tache DSM pour reussie.
                if (!$enBoucle) {
                    return Command::FAILURE;
                }

                \sleep(self::ATTENTE);
                continue;
            }

            if (null !== $lot) {
                $aVide = 0;
                $ecran->writeln(\sprintf(
                    '<info>lot %d</info> — %d ligne(s), source %s',
                    $lot['id'], $lot['total'], $lot['source']));

                try {
                    $envoyees = $this->applique->traiter($lot);
                    $ecran->writeln(\sprintf('  %d ligne(s) envoyee(s)', $envoyees));
                } catch (\Throwable $e) {
                    /* UN LOT QUI EXPLOSE NE DOIT PAS EMPORTER LE TRAVAILLEUR.
                     *
                     * `AppliqueInventaire` rattrape deja l'echec d'une LIGNE.
                     * Ce qui arrive ici est d'une autre nature : la base a
                     * disparu au milieu, la memoire a manque, le compte est
                     * illisible. Sans ce filet, l'exception remonte, le
                     * processus meurt, Docker le relance, il reprend le meme
                     * lot et meurt pareil — une boucle de redemarrage qui
                     * bloque aussi tous les lots suivants.
                     *
                     * ON NE MARQUE PAS LE LOT « ECHOUE » : on ne sait pas si
                     * la cause est passagere. Il reste « en cours », son
                     * `vu_le` se fige, et il repart dans deux minutes — chez
                     * l'autre travailleur, avec un peu de chance. S'il echoue
                     * indefiniment, le journal le repete et ca se voit. */
                    $ecran->writeln('<comment>lot ' . $lot['id'] . ' interrompu : '
                        . $e->getMessage() . '</comment>');
                    $this->cnx->close();
                    \sleep(self::ATTENTE);
                }

                continue;   // il y en a peut-etre un autre derriere
            }

            if (!$enBoucle) {
                return Command::SUCCESS;
            }

            if (++$aVide >= self::TOURS_AVANT_MENAGE) {
                $aVide = 0;
                $this->lots->reprendreLesAbandonnes();
            }

            \sleep(self::ATTENTE);
        }
    }
}
