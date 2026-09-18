<?php

declare(strict_types=1);

namespace App\Command;

use App\Repository\Invitations;
use App\Service\Invitation;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * FAIRE LE MENAGE DANS LES INVITATIONS — constat 02#17.
 *
 * Rien ne purgeait cette table. Trois choses s'y accumulaient :
 *
 *   - les invitations ACCEPTEES, qui disaient « cette personne a bien cree
 *     son compte » — vrai le lendemain, sans interet un mois plus tard, ou la
 *     liste des comptes le dit mieux et a jour ;
 *   - les invitations PERIMEES, liens morts qu'on garde le temps de se dire
 *     « ah oui, il faut reinviter » ;
 *   - et surtout les ORPHELINES : supprimer un compte met
 *     `invitation.utilisateur_id` a NULL (`ON DELETE SET NULL`), la ligne
 *     reste « acceptee » mais sans nom, pour toujours. Reinviter cette adresse
 *     — ce qui marche, l'index unique ne couvre que les invitations en attente
 *     — affichait alors DEUX lignes pour la meme personne, dont une qui ne
 *     designait plus personne.
 *
 * CE QUI N'EST PAS PURGE, ET C'EST LE POINT : une invitation VIVANTE. Son lien
 * est dehors, chez quelqu'un. La purger serait le tuer sans le dire a
 * personne — ni a l'administrateur qui l'a envoye, ni a la personne qui
 * l'ouvrira.
 *
 * LES REVOQUEES NE SONT PAS DANS CETTE LISTE parce qu'elles n'existent deja
 * plus : `Invitations::revoquer()` supprime la ligne au lieu de la marquer.
 * Il n'y a pas de troisieme etat a balayer.
 *
 * LA REGLE N'EST PAS ICI. Elle est dans `Invitation::aPurger()`, ou elle
 * s'eprouve sans base ni conteneur. Cette commande lit, demande, supprime et
 * raconte. Ecrire la condition en SQL aurait fait deux juges de la meme
 * question, et le second aurait ete celui qu'aucun test ne regarde.
 *
 *   bin/console app:invitations:purger              purge pour de bon
 *   bin/console app:invitations:purger --simuler    dit ce qu'il ferait
 *   bin/console app:invitations:purger --jours=90   retention plus longue
 *
 * `--jours` NE TOUCHE PAS AUX ORPHELINES : une invitation dont le compte a ete
 * supprime ne designe plus personne, quelle que soit la duree demandee.
 *
 * ELLE TOURNE TOUTE SEULE au demarrage de `fitcarnet-app`
 * (`docker/entrypoint-prod.sh`) : c'est le seul rendez-vous periodique que
 * cette pile possede sans ajouter ni planificateur ni conteneur. Une purge qui
 * passe a chaque deploiement suffit largement pour une retention de trente
 * jours — et si la pile ne redemarre pas de trois mois, la seule consequence
 * est une ligne de plus a l'ecran.
 */
#[AsCommand(
    name: 'app:invitations:purger',
    description: 'Supprime les invitations acceptees, perimees ou orphelines qui ont fait leur temps.',
)]
final class PurgerInvitations extends Command
{
    public function __construct(
        private readonly Invitations $invitations,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('jours', null, InputOption::VALUE_REQUIRED,
            'Retention, en jours, avant qu\'une invitation morte ne soit supprimee.',
            (string) Invitation::RETENTION_JOURS);

        $this->addOption('simuler', null, InputOption::VALUE_NONE,
            'Dit ce qui partirait, et ne supprime rien.');
    }

    protected function execute(InputInterface $entree, OutputInterface $sortie): int
    {
        $ecran = new SymfonyStyle($entree, $sortie);
        $simuler = (bool) $entree->getOption('simuler');

        $jours = \filter_var((string) $entree->getOption('jours'), \FILTER_VALIDATE_INT);
        if (false === $jours || $jours < 1) {
            /* PAS DE VALEUR PAR DEFAUT SILENCIEUSE SUR UNE SUPPRESSION.
               `--jours=abc` valant 0 purgerait tout, y compris l'invitation
               acceptee il y a cinq minutes. Regle 6, et regle 7 : on refuse. */
            $ecran->error('--jours attend un nombre entier de jours, au moins 1.');

            return Command::INVALID;
        }

        $maintenant = new \DateTimeImmutable();

        /* LE PRESENT, RECULE DE CE QU'IL FAUT POUR QUE LA REGLE VOIE LE BON
           DELAI. `Invitation::aPurger()` compte en `RETENTION_JOURS` — une
           constante, pas un argument, parce que c'est la valeur du projet et
           qu'elle doit etre la meme partout. L'option `--jours` sert a
           enqueter ou a rattraper un cas particulier a la main : on la traduit
           en decalant l'instant, ce qui ne demande a la regle aucune variante
           et ne cree donc aucun second chemin a tester. */
        $decalage = $jours - Invitation::RETENTION_JOURS;
        $reference = 0 === $decalage
            ? $maintenant
            : $maintenant->modify(($decalage > 0 ? '-' : '+') . \abs($decalage) . ' days');

        $aPurger = [];
        $raisons = ['orphelines' => 0, 'acceptees' => 0, 'perimees' => 0];

        foreach ($this->invitations->aExaminerPourPurge() as $ligne) {
            $accepte = null === $ligne['accepte_le']
                ? null
                : new \DateTimeImmutable((string) $ligne['accepte_le']);
            $compteVivant = (bool) $ligne['compte_vivant'];

            if (!Invitation::aPurger(
                new \DateTimeImmutable((string) $ligne['expire_le']),
                $accepte,
                $compteVivant,
                $reference,
            )) {
                continue;
            }

            $aPurger[] = (int) $ligne['id'];
            $raisons[match (true) {
                null !== $accepte && !$compteVivant => 'orphelines',
                null !== $accepte => 'acceptees',
                default => 'perimees',
            }] += 1;

            $ecran->writeln(\sprintf(
                '  %s <comment>%s</comment> — %s',
                $simuler ? 'partirait :' : 'supprimee :',
                (string) $ligne['email'],
                match (true) {
                    null !== $accepte && !$compteVivant => 'acceptee, mais son compte a ete supprime',
                    null !== $accepte => 'acceptee le ' . $accepte->format('d/m/Y'),
                    default => 'perimee le ' . (new \DateTimeImmutable((string) $ligne['expire_le']))->format('d/m/Y'),
                },
            ));
        }

        if ([] === $aPurger) {
            $ecran->writeln('<info>Rien a purger.</info>');

            return Command::SUCCESS;
        }

        if ($simuler) {
            $ecran->note(\sprintf('%d invitation(s) partiraient. Rien n\'a ete supprime.', \count($aPurger)));

            return Command::SUCCESS;
        }

        /* ON ANNONCE CE QUI EST REELLEMENT PARTI, pas ce qu'on avait demande.
           Une ligne peut avoir disparu entre la lecture et la suppression —
           un administrateur qui revoque au meme instant, par exemple. Dire
           « 4 supprimees » quand 3 le sont, c'est le genre de chiffre faux
           qu'on croit sur parole des mois plus tard. */
        $parties = $this->invitations->supprimerParIds($aPurger);

        /* « RETENTION : N JOURS » NE VAUT PAS POUR LES ORPHELINES, et l'annoncer
           sans le dire etait un chiffre faux — releve en revue le 18 septembre
           2026. `--jours=365`, lance par quelqu'un qui veut justement ne rien
           perdre, supprime quand meme une invitation dont le compte vient
           d'etre supprime : elle ne designe plus personne, il n'y a rien a
           laisser refroidir. C'est voulu ; ce qui ne l'etait pas, c'est de
           l'annoncer sous une duree qui ne s'y applique pas. */
        $ecran->success(\sprintf(
            '%d invitation(s) purgee(s) : %d acceptee(s) et %d perimee(s) de plus de %d jours%s.',
            $parties, $raisons['acceptees'], $raisons['perimees'], $jours,
            0 === $raisons['orphelines']
                ? ''
                : \sprintf(', plus %d orpheline(s) — sans delai, leur compte n\'existe plus',
                    $raisons['orphelines']),
        ));

        return Command::SUCCESS;
    }
}
