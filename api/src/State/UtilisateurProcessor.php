<?php

declare(strict_types=1);

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Utilisateur;
use App\Service\JetonsRafraichissement;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Security\Core\Exception\AccessDeniedException;

/**
 * CE QUI SE PASSE QUAND ON CHANGE SON MOT DE PASSE OU SON ADRESSE.
 *
 * Trois gestes, et les deux derniers manquaient.
 *
 * 1. HACHER le mot de passe en clair, et ne jamais le conserver.
 *
 * 2. EXIGER LE MOT DE PASSE ACTUEL. Sans ca, un jeton vole pendant une heure
 *    — appareil partage, journal de proxy — suffisait a prendre le compte
 *    definitivement : un `PATCH` posait une nouvelle adresse ET un nouveau
 *    mot de passe, et le proprietaire ne pouvait plus se connecter avec les
 *    siens, puisque l'adresse avait change.
 *
 *    L'administrateur en est dispense quand il agit sur QUELQU'UN D'AUTRE :
 *    il ne connait pas le mot de passe des autres, et c'est precisement son
 *    role de pouvoir depanner. Sur son PROPRE compte, la regle s'applique.
 *
 * 3. REVOQUER LES SESSIONS. Changer son mot de passe parce qu'on soupconne un
 *    vol ne coupait rien : le jeton de rafraichissement vole continuait de
 *    produire des jetons d'acces neufs pendant un an, en se prolongeant a
 *    chaque usage. Un mot de passe change doit fermer les portes ouvertes —
 *    c'est la seule raison pour laquelle on le change en urgence.
 *
 *    Toutes les sessions tombent, y compris celle qui vient de faire le
 *    changement. C'est voulu : se reconnecter une fois est le prix, et c'est
 *    la preuve que le nouveau mot de passe fonctionne.
 *
 * ET UN QUATRIEME, A LA CREATION : REFUSER UN COMPTE SANS MOT DE PASSE.
 * Constat F-06, corrige le 15 septembre 2026 — voir le commentaire du garde
 * dans `process()`. Ce n'est pas un changement de mot de passe, c'est son
 * absence, et c'est pour cela que ca ne figurait dans aucun des trois gestes
 * ci-dessus.
 */
final readonly class UtilisateurProcessor implements ProcessorInterface
{
    public function __construct(
        #[Autowire(service: 'api_platform.doctrine.orm.state.persist_processor')]
        private ProcessorInterface $persistProcessor,
        private UserPasswordHasherInterface $hasher,
        private Security $securite,
        private JetonsRafraichissement $jetons,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): mixed
    {
        if (!$data instanceof Utilisateur) {
            return $this->persistProcessor->process($data, $operation, $uriVariables, $context);
        }

        /* `previous_data` est l'objet tel qu'il etait AVANT la requete. Absent
           a la creation — c'est ainsi qu'on distingue les deux cas sans se
           fier au nom de l'operation. */
        $precedent = $context['previous_data'] ?? null;
        $creation = !$precedent instanceof Utilisateur;

        $changeMotDePasse = null !== $data->getMotDePasseClair();
        $changeAdresse = !$creation && $precedent->getEmail() !== $data->getEmail();

        /* UN COMPTE NE NAIT PAS SANS MOT DE PASSE (constat F-06).
           `motDePasseClair` ne portait alors que `Assert\Length(min: 10)`, et
           `Length` rend zero violation sur `null` — mesure le 15 septembre
           2026, pas suppose. (Il porte `MotDePasseSolide` depuis le
           18 septembre, qui laisse `null` passer pour la meme raison : une
           contrainte ne doit pas doubler `NotBlank`. Le garde ci-dessous reste
           donc indispensable.) Un `POST /api/utilisateurs` sans le champ rendait donc 201 :
           le compte existait, il etait actif, il apparaissait dans la liste
           d'administration, et sa colonne `mot_de_passe` restait ''. Personne
           ne pouvait s'y connecter, et rien nulle part ne disait pourquoi.
           Les deux autres portes qui creent un compte gardaient deja cette
           regle — `InvitationsController::accepter` via
           `Invitation::motDePasseAcceptable()`, et `CreerUtilisateurCommand`.
           Trois chemins, deux verifiaient. */
        /* PLUS DE `$creation &&`, ET C'ETAIT UN TROU BEANT — 19 septembre 2026.
         *
         * Ce garde ne couvrait que la NAISSANCE d'un compte. Sur un `PATCH`,
         * `{"motDePasseClair": ""}` passait : la contrainte `MotDePasseSolide`
         * sort sans rien dire sur `''` (« une contrainte ne double pas
         * `NotBlank` »), et plus rien derriere. Mesure par HTTP :
         *
         *     PATCH {"motDePasseClair": ""}   -> 200
         *     hash en base                    -> change
         *     mot_de_passe_faible             -> false  (!)
         *     connexion, ancien mot de passe  -> 401
         *     connexion, mot de passe vide    -> 401
         *
         * Le compte devenait MUET, definitivement, et le drapeau declarait
         * conforme le pire mot de passe possible. Sans commande de
         * reinitialisation, un administrateur unique se serait enferme dehors.
         *
         * D'OU VIENT LA REGRESSION. `Assert\Length(min: 10)` refusait `''` —
         * longueur 0 < 10. Son remplacement par `MotDePasseSolide`, le
         * 18 septembre, a retire cette premiere ligne de defense ; la seconde
         * etait la, mais trop etroite. Le commentaire du test qui garde ce cas
         * avait PREDIT la panne : « le traitement de la chaine vide par
         * `Length` est un detail d'implementation de Symfony, et il a DEJA
         * change une fois ». Il avait raison, et la seconde ligne n'a pas
         * suffi parce qu'elle regardait `$creation`.
         *
         * Le garde dit « ce compte doit avoir un mot de passe », pas « ce
         * compte nait ». Les deux autres portes, elles, refusaient deja `''` :
         * `Invitation::motDePasseAcceptable('')` et `MotDePasse::acceptable('')`
         * rendent faux. Trois chemins, deux verifiaient. Encore.
         *
         * DEUX CAS, ET PAS UN — la premiere ecriture de ce garde elargi les
         * confondait, et `testUnCompteCreeSansMotDePasseEstRefuse` l'a
         * attrape aussitot :
         *
         *   A LA CREATION, `null` ET `''` sont refuses : un compte doit naitre
         *   avec un mot de passe (constat F-06). C'est ce que faisait la
         *   version d'avant, et il ne faut surtout pas le perdre.
         *
         *   A LA MODIFICATION, `null` veut dire « je ne touche pas au mot de
         *   passe » et doit passer — c'est le cas de tous les `PATCH` qui
         *   changent autre chose. Seul un `''` ENVOYE EXPRES est refuse.
         *
         * D'ou la condition en deux temps : le mot de passe resultant serait
         * vide, ET (on cree, OU le client a explicitement envoye la chaine
         * vide). */
        $seraitVide = '' === (string) $data->getMotDePasseClair();
        /* « LE CHAMP A ETE ENVOYE », et rien de plus. Ce booleen s'est appele
           `$videEnvoyeExpres` : il ne mesure pas ca. Combine a `$seraitVide`,
           il donne « vide envoye expres » ; seul, il dit seulement que le
           client a nomme le champ. Un nom qui promet plus que ce qu'il mesure
           ralentit la relecture suivante — releve le 19 septembre 2026. */
        $champEnvoye = null !== $data->getMotDePasseClair();

        if ($seraitVide && ($creation || $champEnvoye)) {
            throw new UnprocessableEntityHttpException(
                'Donne un mot de passe a ce compte : sans lui, personne ne pourra s\'y connecter.'
            );
        }

        if (!$creation && ($changeMotDePasse || $changeAdresse)) {
            $this->verifierLIdentite($precedent, $data->getMotDePasseActuel());
        }

        if ($changeMotDePasse) {
            $data->setPassword($this->hasher->hashPassword($data, (string) $data->getMotDePasseClair()));
            /* LE DRAPEAU TOMBE ICI, ET C'EST LE SEUL ENDROIT QUI PEUT LE FAIRE
               EN DEHORS DE LA CONNEXION.
               Le mot de passe neuf vient de passer la validation
               (`MotDePasseSolide` sur l'entite) : il respecte donc les regles,
               par construction. Ne pas l'ecrire ici laisserait l'avertissement
               a l'ecran jusqu'a la prochaine connexion — c'est-a-dire juste
               apres avoir fait ce qu'on demandait, ce qui est la meilleure
               facon de faire croire que le changement n'a pas pris. */
            $data->setMotDePasseFaible(false);
        }
        $data->setMotDePasseClair(null);
        $data->setMotDePasseActuel(null);

        $resultat = $this->persistProcessor->process($data, $operation, $uriVariables, $context);

        if ($changeMotDePasse && !$creation) {
            /* APRES la persistance, jamais avant : revoquer les sessions d'un
               changement qui echouerait ensuite deconnecterait quelqu'un pour
               rien.

               LA COUPURE ELLE-MEME VIT DANS `JetonsRafraichissement`. Elle
               etait ecrite ici en SQL, et une seconde fois dans
               `ComptesController::activer` : meme intention, deux copies, et
               deja deux facons de nommer le compte. Rassemblees le
               17 septembre 2026. */
            $this->jetons->revoquerTout($data);
        }

        return $resultat;
    }

    /**
     * Le demandeur est-il en droit de faire ce changement ?
     *
     * ON COMPARE AVEC L'ANCIEN HACHAGE, celui de `$precedent` — l'objet tel
     * qu'il etait avant la requete. Comparer avec `$data`, deja modifie par
     * la deserialisation, validerait le nouveau mot de passe contre lui-meme.
     */
    private function verifierLIdentite(Utilisateur $precedent, ?string $motDePasseActuel): void
    {
        $moi = $this->securite->getUser();

        if ($this->securite->isGranted('ROLE_ADMIN')
            && $moi instanceof Utilisateur
            && !$moi->getId()->equals($precedent->getId())) {
            return;
        }

        if (null === $motDePasseActuel || '' === $motDePasseActuel) {
            throw new UnprocessableEntityHttpException(
                'Indique ton mot de passe actuel pour changer ton mot de passe ou ton adresse.'
            );
        }

        if (!$this->hasher->isPasswordValid($precedent, $motDePasseActuel)) {
            throw new AccessDeniedException('Mot de passe actuel incorrect.');
        }
    }
}
