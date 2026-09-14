<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Utilisateur;
use Doctrine\DBAL\Connection;
use Symfony\Component\Uid\Uuid;

/**
 * La file d'attente des inventaires.
 *
 * EN SQL DIRECT ET NON EN ENTITE DOCTRINE, VOLONTAIREMENT.
 *
 * Cette table est lue et ecrite par deux processus a la fois : le conteneur
 * qui repond aux requetes y depose, celui des taches y pioche. Ce qui compte
 * ici est le verrou — `FOR UPDATE SKIP LOCKED` — et il se raisonne mieux
 * ecrit en clair qu'a travers un gestionnaire d'entites dont le cache de
 * premier niveau n'a rien a faire dans cette histoire.
 *
 * Elle n'a par ailleurs aucune vie applicative : personne ne la parcourt,
 * personne ne la relie a autre chose. Une entite serait du vocabulaire pour
 * rien.
 */
final readonly class InventaireLots
{
    /**
     * Sans signe de vie depuis ce delai, un lot est considere abandonne.
     *
     * C'EST UN SILENCE, PAS UNE ANCIENNETE, ET LA NUANCE EST TOUTE LA REGLE.
     *
     * La premiere version comptait a partir du DEBUT du lot : au bout de dix
     * minutes, on le reprenait. Il fallait donc un delai plus long que le plus
     * long inventaire imaginable, sinon on reprenait un lot qui travaillait
     * encore. Dix minutes d'attente pour recuperer d'un simple redemarrage.
     *
     * `vu_le` est touche a CHAQUE ligne envoyee. Deux minutes de silence, avec
     * des lignes qui partent toutes les une a deux secondes, ne peuvent plus
     * vouloir dire « c'est long » : ca veut dire « il n'y a plus personne ».
     *
     * ET CA NE SUPPOSE RIEN SUR LE NOMBRE DE TRAVAILLEURS. C'est ce qui permet
     * d'en lancer deux sans que le second vole le lot du premier.
     *
     * Si le delai se revelait trop court — un Grocy qui met deux minutes sur
     * une seule ligne — la consequence est benigne : le lot repart de
     * `traites`, et les lignes deja passees se font repondre « deja a jour ».
     * On perd du temps, jamais une donnee.
     */
    private const SILENCE_MAXIMAL = '2 minutes';

    public function __construct(private Connection $cnx)
    {
    }

    /**
     * Depose un inventaire. Rend l'identifiant du lot.
     *
     * @param list<array{reference: string, quantite: float}> $lignes
     *
     * @throws \RuntimeException si un inventaire tourne deja pour ce compte
     */
    public function deposer(Utilisateur $utilisateur, string $source, array $lignes): int
    {
        try {
            return (int) $this->cnx->fetchOne(
                /* `CAST(:l AS jsonb)` ET NON `:l::jsonb` : DBAL analyse la
                   requete pour y trouver ses parametres nommes, et le `::` de
                   PostgreSQL ressemble a s'y meprendre au debut d'un nom. La
                   forme longue ne prete a aucune confusion.

                   La conversion est explicite parce que l'implicite depend du
                   mode de preparation de PDO : un parametre envoye comme texte
                   TYPE ne se convertit pas tout seul en jsonb. Ca marcherait
                   probablement. « Probablement » n'est pas une reponse pour du
                   code qui tourne sur un NAS a minuit. */
                'INSERT INTO inventaire_lot (utilisateur_id, source, lignes, total)
                      VALUES (:u, :s, CAST(:l AS jsonb), :t)
                   RETURNING id',
                [
                    'u' => $utilisateur->getId(),
                    's' => $source,
                    'l' => \json_encode($lignes, \JSON_THROW_ON_ERROR),
                    't' => \count($lignes),
                ],
            );
        } catch (\Doctrine\DBAL\Exception\UniqueConstraintViolationException) {
            /* L'INDEX UNIQUE PARTIEL A PARLE, ET C'EST LUI QU'ON ECOUTE.
             *
             * On aurait pu lire la table avant d'ecrire — et se faire doubler
             * entre la lecture et l'ecriture par le second appui sur le
             * bouton, qui est exactement le cas qu'on veut couvrir. */
            throw new \RuntimeException(
                'Un inventaire est déjà en cours pour ce compte. Attends qu’il finisse.');
        }
    }

    /**
     * Prend un lot a faire et le marque « en cours », de facon exclusive.
     *
     * `SKIP LOCKED` : si deux travailleurs tournaient un jour, ils ne se
     * disputeraient pas le meme lot — le second passe au suivant au lieu
     * d'attendre. Aujourd'hui il n'y en a qu'un ; le jour ou il y en aura
     * deux, rien a changer.
     *
     * @return array{id: int, utilisateur_id: string, source: string, lignes: string, total: int, traites: int, jeton: string}|null
     */
    public function prendre(): ?array
    {
        return $this->cnx->transactional(function (Connection $cnx): ?array {
            $lot = $cnx->fetchAssociative(
                "SELECT id, utilisateur_id, source, lignes, total, traites
                   FROM inventaire_lot
                  WHERE statut = 'en_attente'
                  ORDER BY cree_le
                  LIMIT 1
                    FOR UPDATE SKIP LOCKED");

            if (false === $lot) {
                return null;
            }

            /* LE JETON DE CE TRAVAILLEUR-CI (constat E6, 14 septembre 2026).
               Le verrou `FOR UPDATE SKIP LOCKED` ci-dessus ne dure que le temps
               de la prise. Passe cet instant, plus rien ne distinguerait deux
               travailleurs sur le meme lot : celui-ci sera presente a chaque
               ecriture, et la base refusera celles de l'ancien si le lot a
               change de mains entre-temps. */
            $jeton = Uuid::v4()->toRfc4122();

            $cnx->executeStatement(
                "UPDATE inventaire_lot
                    SET statut = 'en_cours', commence_le = now(), vu_le = now(),
                        jeton = CAST(:jeton AS uuid)
                  WHERE id = :id",
                ['id' => $lot['id'], 'jeton' => $jeton]);

            $lot['jeton'] = $jeton;

            /** @var array{id: int, utilisateur_id: string, source: string, lignes: string, total: int, traites: int, jeton: string} $lot */
            return $lot;
        });
    }

    /**
     * Note qu'une ligne de plus est partie.
     *
     * APPELE APRES CHAQUE LIGNE, PAS A LA FIN. C'est ce qui separe « le
     * serveur a plante, on ne sait pas ou » de « il s'est arrete a la
     * vingt-troisieme ». Une ecriture par ligne sur une table minuscule et
     * indexee coute quelques dixiemes de milliseconde, contre une a deux
     * secondes d'attente Grocy juste avant : le cout est dans le bruit.
     */
    public function avancer(int $id, int $traites, string $jeton): bool
    {
        return 1 === $this->cnx->executeStatement(
            'UPDATE inventaire_lot SET traites = :n, vu_le = now()
              WHERE id = :id AND jeton = :jeton',
            ['n' => $traites, 'id' => $id, 'jeton' => $jeton]);
    }

    /**
     * @param list<array{reference: string, motif: string}> $echecs
     */
    public function terminer(int $id, int $traites, array $echecs, string $jeton): bool
    {
        return 1 === $this->cnx->executeStatement(
            "UPDATE inventaire_lot
                SET statut = 'termine', traites = :n, echecs = CAST(:e AS jsonb), fini_le = now()
              WHERE id = :id AND jeton = :jeton",
            [
                'n' => $traites,
                'e' => \json_encode($echecs, \JSON_THROW_ON_ERROR),
                'id' => $id,
                'jeton' => $jeton,
            ]);
    }

    /**
     * Le lot n'a pas pu etre traite du tout — Grocy injoignable, par exemple.
     *
     * DISTINCT DE `terminer` AVEC DES ECHECS : ici on n'a rien envoye et le
     * motif vaut pour tout le lot. Melanger les deux ferait afficher
     * quarante lignes en rouge pour une seule panne.
     */
    public function echouer(int $id, string $motif, string $jeton): bool
    {
        return 1 === $this->cnx->executeStatement(
            "UPDATE inventaire_lot
                SET statut = 'echoue',
                    echecs = CAST(:e AS jsonb),
                    fini_le = now()
              WHERE id = :id AND jeton = :jeton",
            [
                'e' => \json_encode([['reference' => '', 'motif' => $motif]], \JSON_THROW_ON_ERROR),
                'id' => $id,
                'jeton' => $jeton,
            ]);
    }

    /**
     * Remet en attente les lots que plus personne ne traite.
     *
     * « PLUS PERSONNE » SE LIT SUR `vu_le`, PAS SUR UN RAISONNEMENT.
     * On ne compte pas les travailleurs, on ne suppose pas lequel tourne : un
     * lot dont la derniere ligne est partie il y a plus de deux minutes n'a
     * plus personne derriere lui. Vrai avec un travailleur, vrai avec dix.
     *
     * Le travail deja fait n'est pas refait : `traites` est conserve, et
     * `AppliqueInventaire` reprend a cet index. Une ligne peut au pire etre
     * renvoyee une fois — Grocy repondra « deja a jour », ce qu'on sait lire,
     * et `definirStock` pose une quantite absolue, donc la rejouer ne change
     * rien.
     *
     * @return int nombre de lots repris
     */
    public function reprendreLesAbandonnes(): int
    {
        return (int) $this->cnx->executeStatement(
            "UPDATE inventaire_lot
                SET statut = 'en_attente', commence_le = NULL, jeton = NULL
              WHERE statut = 'en_cours'
                AND COALESCE(vu_le, commence_le) < now() - INTERVAL '" . self::SILENCE_MAXIMAL . "'");
    }

    /**
     * Le dernier inventaire de cet utilisateur, quel que soit son etat.
     *
     * @return array{id: int, statut: string, total: int, traites: int, echecs: list<array{reference: string, motif: string}>, finiLe: ?string}|null
     */
    public function dernier(Utilisateur $utilisateur): ?array
    {
        /* LA DATE SORT EN ISO 8601 UTC, FORMATEE PAR POSTGRESQL.
           Son format natif — « 2026-08-14 12:03:44.12+02 » — se lit avec une
           espace au lieu d'un T, ce que `Date.parse` du navigateur n'est pas
           tenu d'accepter et que Safari refuse. L'ecran s'en sert pour decider
           si un resultat est encore frais : une date illisible y vaut NaN, et
           NaN ne se compare a rien. */
        $lot = $this->cnx->fetchAssociative(
            'SELECT id, statut, total, traites, echecs,
                    to_char(fini_le AT TIME ZONE \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS"Z"\') AS fini_le
               FROM inventaire_lot
              WHERE utilisateur_id = :u
              ORDER BY id DESC
              LIMIT 1',
            ['u' => $utilisateur->getId()]);

        if (false === $lot) {
            return null;
        }

        return [
            'id' => (int) $lot['id'],
            'statut' => (string) $lot['statut'],
            'total' => (int) $lot['total'],
            'traites' => (int) $lot['traites'],
            'echecs' => (array) \json_decode((string) $lot['echecs'], true, 512, \JSON_THROW_ON_ERROR),
            'finiLe' => $lot['fini_le'] ?? null,
        ];
    }
}
