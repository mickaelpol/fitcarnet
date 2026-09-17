<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Utilisateur;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;

/**
 * Lit les aliments et les stocks depuis la base fitcarnet.
 *
 * Un aliment appartient a un compte, et le frigo n'en montre que les siens :
 * sur des valeurs nutritionnelles, l'erreur d'un utilisateur fausserait
 * silencieusement la diete des autres.
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
                    a.lip_100, a.fibres_100, a.ratio,
                    a.pesee_avant, a.pesee_apres,
                    coalesce(sum(s.quantite), 0) AS quantite,
                    min(e.libelle)               AS emplacement
             FROM   aliment a
             LEFT   JOIN stock s
                    ON  s.aliment_id = a.id
                    AND s.utilisateur_id = :utilisateur
             LEFT   JOIN emplacement e ON e.id = s.emplacement_id
             WHERE  a.utilisateur_id = :utilisateur
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
            /* Il y avait ici une colonne `etat_reference`, lue puis
               transmise. Elle disait a quel etat se rapportaient les macros
               ci-dessus — et elle pouvait dire le contraire de ce que Grocy
               deduisait pour le meme aliment. Elle a ete supprimee de la
               base : les valeurs decrivent desormais toujours le produit tel
               qu'on le pese. */
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
    /**
     * CES ALIMENTS SONT-ILS LES MIENS ?
     *
     * LA REGLE N'EXISTE QU'ICI, ET C'EST TOUT L'INTERET. Elle vivait dans
     * `FrigoController`, devant une seule de ses routes ; sa jumelle
     * `POST /mon-frigo/inventaire` ecrivait le meme stock sans jamais la poser
     * — constat E-01 de l'audit du 7 septembre 2026. Une regle recopiee est
     * une regle qui finira par ne plus l'etre a un endroit.
     *
     * Posee en lot pour qu'un inventaire de cinq cents lignes tienne en une
     * requete.
     *
     * @param list<int> $idsAliments
     *
     * @return list<int> ceux qui sont accessibles, parmi les demandes
     */
    public function alimentsAccessibles(Utilisateur $utilisateur, array $idsAliments): array
    {
        if ([] === $idsAliments) {
            return [];
        }

        return \array_map('\intval', $this->cnx->fetchFirstColumn(
            'SELECT id FROM aliment
              WHERE id IN (:a) AND utilisateur_id = :u',
            ['a' => $idsAliments, 'u' => $utilisateur->getId()],
            ['a' => ArrayParameterType::INTEGER],
        ));
    }

    public function definirStock(
        Utilisateur $utilisateur,
        int $idAliment,
        float $quantite,
        ?int $idEmplacement = null,
    ): void {
        /* LA DERNIERE PORTE, ET ELLE EST FERMEE POUR LES TROIS APPELANTS.
         *
         * Cette methode ecrit du stock pour le compte de `POST /mon-frigo/stock`,
         * de l'inventaire differe et du bouton « J'ai cuisine ». Seule la
         * premiere posait la question de la propriete. Bob posait 1 g sur
         * l'aliment prive d'Alice par l'inventaire, et l'aliment d'Alice
         * devenait indelebile : `AlimentSuppressionProcessor` compte les lignes
         * de stock tous comptes confondus, et l'application ne lui offrait
         * aucun moyen de defaire ce blocage.
         *
         * Une exception, et non un retour silencieux : l'appelant qui n'a pas
         * verifie doit s'arreter. Le travailleur de fond, lui, l'attrape deja
         * et nomme la ligne en echec.
         */
        if ([] === $this->alimentsAccessibles($utilisateur, [$idAliment])) {
            throw new \RuntimeException('Cet aliment n’existe pas dans ton catalogue.');
        }

        // A defaut d'emplacement precise on garde CELUI DEJA CONNU, et le
        // premier defini seulement pour un aliment jamais range. Reprendre le
        // premier a chaque fois deplacerait dans le frigo un produit du placard
        // des qu'on corrige sa quantite.
        $emplacement = $idEmplacement
            ?? (int) ($this->cnx->fetchOne(
                'SELECT emplacement_id FROM stock
                 WHERE utilisateur_id = :u AND aliment_id = :a
                 ORDER BY maj_le DESC LIMIT 1',
                ['u' => $utilisateur->getId(), 'a' => $idAliment])
                ?: $this->cnx->fetchOne(
                    'SELECT id FROM emplacement ORDER BY ordre, id LIMIT 1'));

        // Une quantite nulle n'efface plus la ligne : elle la met a zero.
        // L'emplacement appartient a la ligne de stock, pas a l'aliment —
        // supprimer la ligne faisait oublier ou l'aliment se range, et le
        // renvoyait sous « Sans emplacement » au moment precis ou l'on veut
        // savoir ou le remettre apres l'avoir rachete.

        // DEUX ECRITURES, UNE SEULE TRANSACTION.
        //
        // Le DELETE puis l'INSERT etaient nus. Entre les deux, la ligne de
        // stock N'EXISTE PLUS : une coupure a cet instant — redemarrage du
        // conteneur au moment d'un deploiement, timeout PHP — ne laissait pas
        // une quantite fausse, elle faisait DISPARAITRE le stock et son
        // emplacement. 800 g au congelateur perdus sans une trace, alors qu'on
        // corrigeait simplement une quantite.
        //
        // La transaction rend les deux indissociables : ou l'aliment change
        // d'emplacement avec sa nouvelle quantite, ou rien ne bouge.
        $this->cnx->transactional(function () use ($utilisateur, $idAliment, $quantite, $emplacement): void {
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
        });
    }
}
