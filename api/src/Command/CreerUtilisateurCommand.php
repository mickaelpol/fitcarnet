<?php

declare(strict_types=1);

namespace App\Command;

use App\Entity\Utilisateur;
use App\Service\MotDePasse;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Creation d'un compte en ligne de commande (le premier admin, notamment).
 *   php bin/console fitcarnet:creer-utilisateur mickael@exemple.fr "Mickael" --admin --grocy
 */
#[AsCommand(name: 'fitcarnet:creer-utilisateur', description: 'Cree un compte utilisateur')]
final class CreerUtilisateurCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly UserPasswordHasherInterface $hasher,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addArgument('email', InputArgument::REQUIRED)
            ->addArgument('nom', InputArgument::REQUIRED)
            ->addOption('mot-de-passe', 'p', InputOption::VALUE_REQUIRED, 'Sinon demande de maniere masquee')
            ->addOption('admin', null, InputOption::VALUE_NONE, 'Donne le role ROLE_ADMIN')
            ->addOption('grocy', null, InputOption::VALUE_NONE, 'Les ingredients viennent de Grocy');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $email = (string) $input->getArgument('email');
        $motDePasse = $input->getOption('mot-de-passe')
            ?: $io->askHidden(\sprintf(
                'Mot de passe (%d caracteres minimum, une minuscule, une majuscule, un chiffre, un caractere special)',
                MotDePasse::LONGUEUR_MINIMALE,
            ));

        /* LA MEME REGLE QUE LES DEUX AUTRES PORTES, ET LUE AU MEME ENDROIT.
           C'etait `mb_strlen($motDePasse) < 10` ecrit ici a la main : la
           troisieme copie d'une regle qui en avait deja deux. Le 18 septembre
           2026 elles sont toutes passees par `App\Service\MotDePasse`. */
        if (null === $motDePasse || !MotDePasse::acceptable($motDePasse)) {
            $io->error(MotDePasse::pourquoiRefuse((string) $motDePasse) ?? 'Mot de passe refuse.');

            return Command::FAILURE;
        }

        $depot = $this->em->getRepository(Utilisateur::class);
        if (null !== $depot->findOneBy(['email' => $email])) {
            $io->error(sprintf('Le compte « %s » existe deja.', $email));

            return Command::FAILURE;
        }

        $utilisateur = (new Utilisateur())
            ->setEmail($email)
            ->setNom((string) $input->getArgument('nom'))
            ->setRoles($input->getOption('admin') ? ['ROLE_ADMIN'] : ['ROLE_USER'])
            ->setSourceFrigo($input->getOption('grocy') ? 'grocy' : 'base');

        $utilisateur->setPassword($this->hasher->hashPassword($utilisateur, $motDePasse));

        $this->em->persist($utilisateur);
        $this->em->flush();

        $io->success(sprintf(
            'Compte cree : %s (%s, frigo : %s)',
            $email,
            implode(', ', $utilisateur->getRoles()),
            $utilisateur->getSourceFrigo(),
        ));

        return Command::SUCCESS;
    }
}
