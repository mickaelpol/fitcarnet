<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Utilisateur;
use Doctrine\DBAL\Connection;

/**
 * Lit les aliments et les stocks depuis la base fitcarnet.
 *
 * Deux origines cohabitent, comme pour les exercices :
 *   - les aliments COMMUNS, verifies, disponibles pour tous ;
 *   - ceux que l'utilisateur a crees, qui lui restent PRIVES.
 *
 * Ce cloisonnement est volontaire : sur des valeurs nutritionnelles, l'erreur
 * d'un utilisateur fausserait silencieusement la diete des autres.
 */
final readonly class FrigoBase
{
    public function __construct(private Connection $cnx)
    {
    }

    /** @return AlimentDisponible[] */
    public function lire(Utilisateur $utilisateur): array
    {
        $lignes = $this->cnx->fetchAllAssociative(
            // un aliment peut occuper plusieurs emplacements : on additionne
            // les quantités et on retient l'emplacement principal
            'SELECT a.id, a.nom, a.categorie, a.kcal_100, a.prot_100, a.gluc_100,
                    a.lip_100, a.fibres_100, a.ratio, a.etat_reference,
                    a.pesee_avant, a.pesee_apres,
                    coalesce(sum(s.quantite), 0) AS quantite,
                    min(e.libelle)               AS emplacement
             FROM   aliment a
             LEFT   JOIN stock s
                    ON  s.aliment_id = a.id
                    AND s.utilisateur_id = :utilisateur
             LEFT   JOIN emplacement e ON e.id = s.emplacement_id
             -- UNIQUEMENT ses aliments. Les 50 de reference restent lisibles
             -- par /api/aliments, ou ils servent de point de depart a une
             -- creation, mais ils n encombrent pas le frigo : on y verrait
             -- des aliments qu on n a jamais mis, et creer sa propre version
             -- d un commun donnerait deux lignes pour la meme chose.
             WHERE  a.cree_par = :utilisateur
             GROUP  BY a.id
             ORDER  BY a.nom',
            ['utilisateur' => $utilisateur->getId()],
        );

        return \array_map(static fn (array $l) => new AlimentDisponible(
            reference: 'base:' . $l['id'],
            nom: (string) $l['nom'],
            categorie: (string) $l['categorie'],
            kcal100: (float) $l['kcal_100'],
            prot100: (float) $l['prot_100'],
            gluc100: (float) $l['gluc_100'],
            lip100: (float) $l['lip_100'],
            fibres100: null !== $l['fibres_100'] ? (float) $l['fibres_100'] : null,
            ratio: (float) $l['ratio'] ?: 1.0,
            etatReference: (string) $l['etat_reference'],
            stock: (float) $l['quantite'],
            emplacement: null !== $l['emplacement'] ? (string) $l['emplacement'] : null,
            peseeAvant: null !== $l['pesee_avant'] ? (float) $l['pesee_avant'] : null,
            peseeApres: null !== $l['pesee_apres'] ? (float) $l['pesee_apres'] : null,
            // la colonne stock.quantite est en grammes, par construction du schema
            unite: 'g',
            grammesParUnite: 1.0,
        ), $lignes);
    }

    /** Fixe la quantite d'un aliment dans le frigo de l'utilisateur. */
    public function definirStock(
        Utilisateur $utilisateur,
        int $idAliment,
        float $quantite,
        ?int $idEmplacement = null,
    ): void {
        // sans emplacement precise, on prend le premier defini
        $emplacement = $idEmplacement ?? (int) $this->cnx->fetchOne(
            'SELECT id FROM emplacement ORDER BY ordre, id LIMIT 1');

        if ($quantite <= 0) {
            $this->cnx->executeStatement(
                'DELETE FROM stock WHERE utilisateur_id = :u AND aliment_id = :a',
                ['u' => $utilisateur->getId(), 'a' => $idAliment]);

            return;
        }

        // la contrainte porte sur (utilisateur, aliment, emplacement) :
        // deplacer un aliment d'un emplacement a l'autre effacerait l'ancien
        $this->cnx->executeStatement(
            'DELETE FROM stock
             WHERE utilisateur_id = :u AND aliment_id = :a AND emplacement_id <> :e',
            ['u' => $utilisateur->getId(), 'a' => $idAliment, 'e' => $emplacement]);

        $this->cnx->executeStatement(
            'INSERT INTO stock (utilisateur_id, aliment_id, emplacement_id, quantite, maj_le)
             VALUES (:u, :a, :e, :q, now())
             ON CONFLICT (utilisateur_id, aliment_id, emplacement_id) DO UPDATE
                SET quantite = EXCLUDED.quantite, maj_le = now()',
            ['u' => $utilisateur->getId(), 'a' => $idAliment,
             'e' => $emplacement, 'q' => $quantite]);
    }
}
