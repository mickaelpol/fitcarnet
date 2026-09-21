<?php

declare(strict_types=1);

namespace App\Service;

/**
 * A PARTIR DE QUAND UNE PESEE DIFFERE VRAIMENT DU STOCK — palier B, 21 septembre 2026.
 *
 * `front/src/calcul/frigo.ts` portait ce nombre en dur, avec sa raison : en
 * deca, la difference vient de l'ARRONDI D'AFFICHAGE, pas de la balance —
 * l'envoyer ferait un mouvement de stock pour rien.
 *
 * POURQUOI LE SERVEUR ENVOIE LE NOMBRE ET NON LE VERDICT. Un inventaire se
 * compare a chaque frappe, sur jusqu'a cinq cents lignes : demander le verdict
 * ferait un aller-retour PAR TOUCHE, et `docs/plan-serveur-autoritaire.md`
 * ecrit noir sur blanc qu'appliquer cette ligne-la serait une REGRESSION.
 *
 * C'est donc le motif de `ModesDeTravail`, repris tel quel : le serveur
 * transmet LA REGLE, indexee sur ce que le client possede deja — ici le stock
 * theorique et ce qui vient d'etre tape. L'ecran fait une comparaison
 * parametree ; il ne choisit pas le seuil.
 *
 * CE QUI RESTE LEGITIMEMENT A L'ECRAN, et qui n'est pas cette regle : lire un
 * nombre tape (`saisieNombre.ts`, la virgule), et distinguer un champ VIDE
 * — « pas encore compte » — d'un zero (regle 6). Confondre les deux viderait
 * le frigo de tout ce qu'on n'a pas eu le temps de peser.
 */
final class EcartDInventaire
{
    /**
     * Sous cet ecart, on ne bouge pas le stock.
     *
     * Le chiffre vient de l'affichage : le frigo montre les quantites
     * arrondies, et une difference au millieme ne peut venir que de la, jamais
     * d'une balance de cuisine.
     */
    public const float SEUIL = 0.001;
}
