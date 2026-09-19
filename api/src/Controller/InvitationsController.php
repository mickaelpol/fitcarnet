<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\Utilisateur;
use App\Repository\Invitations;
use App\Service\Invitation;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * INVITER QUELQU'UN.
 *
 * L'administrateur saisit une adresse. L'application rend un lien. Il le
 * transmet comme il veut. La personne suit le lien et choisit elle-meme son
 * nom et son mot de passe.
 *
 * POURQUOI PAS CREER LE COMPTE DIRECTEMENT
 *
 * Parce qu'il faudrait alors inventer un mot de passe, le transmettre par un
 * canal quelconque, et esperer qu'il soit change. Trois occasions de fuite
 * pour un secret qui ne nous appartient pas. Ici le mot de passe n'existe
 * qu'au moment ou son proprietaire le tape ; personne d'autre ne l'a jamais
 * vu, et il n'y a rien a « faire changer plus tard ».
 *
 * POURQUOI PAS UN ENVOI PAR COURRIEL
 *
 * Il faudrait un serveur SMTP, sa configuration, et accepter qu'un message
 * sur trois parte en indesirables sans que personne ne l'apprenne. Un envoi
 * rate est une panne muette : l'admin croit avoir invite, la personne n'a
 * rien recu, et les deux attendent. Un lien affiche a l'ecran, on VOIT qu'on
 * l'a copie.
 *
 * DEUX PREFIXES, ET CE N'EST PAS UN DETAIL
 *
 *   /api/invitations   au pluriel, reserve a l'administrateur
 *   /api/invitation/…  au singulier, PUBLIC, car ouvert par quelqu'un qui
 *                      n'a pas encore de compte — c'est tout l'objet
 *
 * Le pare-feu de `security.yaml` distingue les deux sur cette seule barre
 * oblique. `^/api/invitation/` ne peut pas attraper `/api/invitations` : le
 * caractere suivant y est un « s », pas une barre.
 */
final class InvitationsController extends AbstractController
{
    public function __construct(
        private readonly Invitations $invitations,
        private readonly UserPasswordHasherInterface $hacheur,
        /**
         * L'adresse publique du site. On la prend dans la CONFIGURATION, et
         * surtout pas dans la requete en cours : derriere un proxy inverse,
         * `$request->getSchemeAndHttpHost()` rend ce que le proxy a bien voulu
         * transmettre. Un en-tete oublie fabriquerait des liens vers
         * `http://localhost`, que l'admin copierait sans les relire.
         *
         * C'est la meme variable que Symfony utilise pour ses URL absolues :
         * un seul endroit dit ou vit ce site.
         */
        #[Autowire('%env(DEFAULT_URI)%')]
        private readonly string $basePublique,
    ) {
    }

    // =================================================================
    //  Cote administrateur
    // =================================================================

    /**
     * Les invitations, la plus recente d'abord.
     *
     * On rend AUSSI celles qui sont acceptees ou perimees. Une liste qui ne
     * montrerait que les invitations vivantes laisserait l'admin se demander
     * s'il a deja invite quelqu'un — et reinviter, et se retrouver avec deux
     * liens en circulation.
     *
     * LE JETON N'EST PAS DANS CETTE REPONSE, ET IL NE PEUT PAS Y ETRE. La
     * base n'en garde que l'empreinte : le lien n'existe qu'une fois, dans la
     * reponse a sa creation. S'il est perdu, on en refait un.
     */
    #[Route('/api/invitations', methods: ['GET'])]
    #[IsGranted('ROLE_ADMIN')]
    public function lister(): JsonResponse
    {
        $lignes = $this->invitations->recentes();

        $maintenant = new \DateTimeImmutable();

        return $this->json([
            'invitations' => \array_map(function (array $l) use ($maintenant): array {
                $expire = new \DateTimeImmutable((string) $l['expire_le']);
                $accepte = null === $l['accepte_le'] ? null : new \DateTimeImmutable((string) $l['accepte_le']);

                return [
                    'id' => (int) $l['id'],
                    'email' => (string) $l['email'],
                    'creeLe' => (new \DateTimeImmutable((string) $l['cree_le']))->format(\DATE_ATOM),
                    'expireLe' => $expire->format(\DATE_ATOM),
                    'accepteLe' => $accepte?->format(\DATE_ATOM),
                    'nomInvite' => null === $l['nom_invite'] ? null : (string) $l['nom_invite'],
                    'statut' => match (true) {
                        null !== $accepte => 'acceptee',
                        Invitation::estValable($expire, null, $maintenant) => 'en_attente',
                        default => 'perimee',
                    },
                ];
            }, $lignes),
        ]);
    }

    /**
     * Invite une adresse, et rend le lien.
     *
     * UNE NOUVELLE INVITATION REMPLACE CELLE QUI ATTENDAIT.
     *
     * C'est le geste qu'on fait quand on a perdu le lien, ou quand la
     * personne dit ne pas l'avoir recu. Refuser au motif qu'une invitation
     * existe deja obligerait a la revoquer d'abord — deux gestes pour une
     * intention — et laisserait de toute facon l'ancien lien valide si on
     * oubliait. Ici l'ancien meurt a l'instant ou le nouveau nait.
     */
    #[Route('/api/invitations', methods: ['POST'])]
    #[IsGranted('ROLE_ADMIN')]
    public function inviter(Request $requete): JsonResponse
    {
        $corps = $this->corps($requete);
        $email = Invitation::adresseNormalisee((string) ($corps['email'] ?? ''));

        if (!Invitation::adresseValide($email)) {
            return $this->refus('Cette adresse ne ressemble pas à une adresse électronique.');
        }

        // Un compte existe deja : l'inviter ne creerait rien, et le lien
        // echouerait au dernier moment — apres que l'admin l'a transmis.
        $deja = $this->invitations->nomDuCompte($email);
        if (null !== $deja) {
            return $this->refus(\sprintf('« %s » a déjà un compte (%s).', $email, $deja));
        }

        $jeton = Invitation::nouveauJeton();
        $maintenant = new \DateTimeImmutable();
        $expire = Invitation::expiration($maintenant);

        $this->invitations->remplacer(
            $email,
            Invitation::empreinte($jeton),
            $this->getUser() instanceof Utilisateur ? $this->getUser()->getId() : null,
            $maintenant,
            $expire,
        );

        return $this->json([
            'email' => $email,
            // LA SEULE FOIS OU CE LIEN EXISTE. Il n'est nulle part ailleurs,
            // et il ne sera pas relisible : la base n'en a que l'empreinte.
            'lien' => Invitation::lien($this->basePublique, $jeton),
            'expireLe' => $expire->format(\DATE_ATOM),
            'dureeJours' => Invitation::DUREE_JOURS,
        ], Response::HTTP_CREATED);
    }

    /**
     * Annule une invitation en attente.
     *
     * On SUPPRIME la ligne au lieu de la marquer annulee. Une invitation en
     * attente ne raconte rien qu'on veuille garder ; et laisser la ligne
     * imposerait de tenir compte d'un troisieme etat partout ailleurs.
     *
     * Les invitations ACCEPTEES, elles, ne se suppriment pas ici : elles
     * portent la trace de qui a invite qui.
     */
    #[Route('/api/invitations/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ADMIN')]
    public function revoquer(int $id): JsonResponse
    {
        $supprimees = $this->invitations->revoquer($id);

        if (0 === $supprimees) {
            return $this->refus(
                "Rien à révoquer : cette invitation n'existe pas, ou elle a déjà été acceptée.",
                Response::HTTP_NOT_FOUND,
            );
        }

        return $this->json(['revoquee' => true]);
    }

    // =================================================================
    //  Cote invite — PUBLIC
    // =================================================================

    /**
     * Ce lien ouvre-t-il encore quelque chose ?
     *
     * L'ecran d'acceptation appelle ceci au chargement, pour afficher
     * l'adresse concernee et ne pas laisser quelqu'un remplir un formulaire
     * qui sera refuse a l'envoi.
     *
     * TROIS RAISONS DE REFUSER, UNE SEULE REPONSE : jeton inconnu, deja
     * utilise, ou perime donnent le meme 404 et le meme texte. Distinguer
     * apprendrait a un inconnu qu'un jeton donne a existe — et la personne
     * invitee n'a que faire de la nuance : dans les trois cas, elle doit
     * redemander un lien.
     */
    #[Route('/api/invitation/{jeton}', methods: ['GET'], requirements: ['jeton' => '[A-Za-z0-9_-]{20,100}'])]
    public function verifier(string $jeton): JsonResponse
    {
        $ligne = $this->invitationVivante($jeton);

        if (null === $ligne) {
            return $this->lienMort();
        }

        return $this->json([
            // On rend l'adresse pour que l'ecran l'affiche : la personne doit
            // voir POUR QUI est ce lien avant de choisir un mot de passe.
            'email' => (string) $ligne['email'],
            'expireLe' => (new \DateTimeImmutable((string) $ligne['expire_le']))->format(\DATE_ATOM),
        ]);
    }

    /**
     * Cree le compte.
     *
     * L'ADRESSE NE VIENT PAS DU FORMULAIRE, ELLE VIENT DE L'INVITATION.
     * Accepter une adresse envoyee par le client ferait de n'importe quel
     * lien un droit de creer n'importe quel compte — y compris avec l'adresse
     * de quelqu'un d'autre.
     *
     * TOUT EN UNE TRANSACTION. Le compte cree et l'invitation consommee sont
     * un seul fait. Separes, une coupure au mauvais moment laisserait soit un
     * compte sans trace, soit un lien deja utilise qui ne mene a rien —
     * et dans les deux cas quelqu'un attend devant un ecran.
     */
    #[Route('/api/invitation/{jeton}', methods: ['POST'], requirements: ['jeton' => '[A-Za-z0-9_-]{20,100}'])]
    public function accepter(string $jeton, Request $requete): JsonResponse
    {
        $ligne = $this->invitationVivante($jeton);

        if (null === $ligne) {
            return $this->lienMort();
        }

        $corps = $this->corps($requete);
        $nom = \trim((string) ($corps['nom'] ?? ''));
        $motDePasse = (string) ($corps['motDePasse'] ?? '');

        if (!Invitation::nomAcceptable($nom)) {
            return $this->refus('Indique un nom, de 80 caractères au plus.');
        }
        /* ON DIT TOUT CE QUI MANQUE, PAS SEULEMENT « trop court ». La personne
           est en train de creer son compte : lui repondre « au moins 12
           caracteres » alors qu'il manque aussi un chiffre la fait recommencer
           deux fois. Le texte vient de `MotDePasse`, comme partout ailleurs. */
        $pourquoi = Invitation::pourquoiMotDePasseRefuse($motDePasse);
        if (null !== $pourquoi) {
            return $this->refus($pourquoi);
        }

        $email = (string) $ligne['email'];

        // Course possible : deux comptes crees en meme temps sur la meme
        // adresse. L'index unique de `utilisateur` trancherait de toute
        // facon, mais avec une erreur 500 illisible.
        if ($this->invitations->compteExiste($email)) {
            return $this->refus('Un compte existe déjà pour cette adresse. Connecte-toi.', Response::HTTP_CONFLICT);
        }

        $utilisateur = new Utilisateur();
        $utilisateur->setEmail($email);
        $utilisateur->setNom($nom);
        $utilisateur->setPassword($this->hacheur->hashPassword($utilisateur, $motDePasse));
        // ROLE_USER et frigo « base » : `grocy` reste a l'administrateur, qui
        // est le seul dont le frigo vit dans Grocy.
        $utilisateur->setRoles(['ROLE_USER']);
        $utilisateur->setSourceFrigo('base');
        $utilisateur->setActif(true);

        /* Le compte cree et l'invitation consommee sont UN SEUL FAIT : le
           depot les tient dans une transaction, et leve si le lien a ete
           consomme entre-temps.

           ET ON ATTRAPE CETTE LEVEE — releve le 19 septembre 2026, avant
           l'APK. Elle ne l'etait pas, et le `@throws` du depot annoncait un
           contrat que personne n'honorait. Un double appui sur « Creer mon
           compte », ou un rejeu de requete par le navigateur, suffisait : le
           second appel voyait l'invitation deja consommee, levait, et la
           personne recevait une 500 AVEC TRACE — sur le premier ecran de sa
           vie dans l'application.

           Pire : `wrapInTransaction` FERME l'EntityManager quand la fermeture
           leve (documentation Doctrine ORM). Rien ne se corrompt, la
           transaction retombe proprement — mais l'exception remonte jusqu'au
           noyau.

           LA COURSE JUMELLE, QUARANTE LIGNES PLUS HAUT, REPONDAIT DEJA
           PROPREMENT : `compteExiste()` rend un 409 avec, en commentaire,
           « l'index unique trancherait de toute facon, mais avec une erreur
           500 illisible ». Le risque etait nomme ; une porte sur deux etait
           fermee. */
        try {
            $this->invitations->creerLeCompteEtConsommer($utilisateur, (int) $ligne['id']);
        } catch (\RuntimeException) {
            return $this->refus(
                "Ce lien vient d'être utilisé. Si ce n'était pas toi, demande une nouvelle invitation.",
                Response::HTTP_CONFLICT,
            );
        }

        return $this->json([
            'cree' => true,
            'email' => $email,
            'nom' => $nom,
        ], Response::HTTP_CREATED);
    }

    // =================================================================
    //  Outils
    // =================================================================

    /**
     * L'invitation derriere ce jeton, si elle vaut encore quelque chose.
     *
     * On cherche par EMPREINTE : le jeton en clair n'est nulle part dans la
     * base, donc une lecture de la base ne donne aucun lien utilisable.
     */
    private function invitationVivante(string $jeton): ?array
    {
        $ligne = $this->invitations->parEmpreinte(Invitation::empreinte($jeton));

        if (null === $ligne) {
            return null;
        }

        $valable = Invitation::estValable(
            new \DateTimeImmutable((string) $ligne['expire_le']),
            null === $ligne['accepte_le'] ? null : new \DateTimeImmutable((string) $ligne['accepte_le']),
            new \DateTimeImmutable(),
        );

        return $valable ? $ligne : null;
    }

    private function corps(Request $requete): array
    {
        $donnees = \json_decode($requete->getContent(), true);

        return \is_array($donnees) ? $donnees : [];
    }

    private function refus(string $message, int $statut = Response::HTTP_UNPROCESSABLE_ENTITY): JsonResponse
    {
        return $this->json(['erreur' => $message], $statut);
    }

    private function lienMort(): JsonResponse
    {
        return $this->json([
            'erreur' => "Ce lien n'est plus valable. Demande une nouvelle invitation.",
        ], Response::HTTP_NOT_FOUND);
    }
}
