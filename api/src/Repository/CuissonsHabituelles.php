<?php

declare(strict_types=1);

namespace App\Repository;

use Doctrine\DBAL\Connection;

/**
 * LES CUISSONS HABITUELLES D'UN COMPTE, EN BASE.
 *
 * POURQUOI UN DEPOT, ET PAS LE CONTROLEUR
 *
 * Ce SQL vivait dans `CuissonsController`. Le 18 septembre 2026, le
 * proprietaire l'y a trouve en relisant le code, et il a raison : la
 * documentation Symfony 7.4 montre du SQL brut dans un DEPOT — `src/Repository/`,
 * `$conn->executeQuery(...)` — jamais dans un controleur, dont le role tient en
 * trois gestes : lire la requete, appeler, repondre. Un controleur qui parle
 * SQL ne se teste qu'en levant le noyau, et sa regle metier se recopie au
 * premier autre appelant.
 *
 * POURQUOI DU SQL ET NON L'ORM — la raison n'a pas change en changeant de place.
 *
 * `ON CONFLICT DO UPDATE` fait en un aller-retour ce que l'ORM ferait en deux
 * (chercher, puis creer ou modifier), et surtout il le fait SANS FENETRE : entre
 * le « chercher » et le « creer » de l'ORM, un second envoi passerait et le
 * premier finirait sur une violation d'unicite. C'est l'endroit ou la base sait
 * dire quelque chose que Doctrine ne dit pas.
 *
 * L'IDENTIFIANT ARRIVE EN CHAINE
 *
 * Et pas en objet `Uuid`. L'ancien code passait l'objet a DBAL, qui s'en
 * sortait par la conversion `Stringable` de PDO — une dependance implicite que
 * personne n'avait verifiee. L'appelant convertit, le depot recoit une chaine.
 */
final readonly class CuissonsHabituelles
{
    public function __construct(private Connection $cnx)
    {
    }

    /**
     * Ce que ce compte a deja decide.
     *
     * TROIS ETATS, DONT LE TROISIEME EST UNE ABSENCE. Un entier dit « cuit
     * ainsi » ; `null` dit « se mange sans cuisson », et c'est une REPONSE ;
     * l'absence de ligne dit « jamais decide », et l'ecran demandera. Rendre
     * `null` pour un aliment jamais rencontre effacerait la distinction.
     *
     * @return list<array{aliment: string, mode: int|null}>
     */
    public function lire(string $utilisateur): array
    {
        $lignes = $this->cnx->fetchAllAssociative(
            'SELECT aliment, mode_cuisson_id FROM cuisson_habituelle
              WHERE utilisateur_id = :u
              ORDER BY aliment',
            ['u' => $utilisateur],
        );

        return \array_map(static fn (array $l): array => [
            'aliment' => (string) $l['aliment'],
            'mode' => null === $l['mode_cuisson_id'] ? null : (int) $l['mode_cuisson_id'],
        ], $lignes);
    }

    /**
     * Les modes de cuisson existants, lus UNE fois.
     *
     * C'est la seule chose que la validation d'un lot ne puisse pas savoir
     * toute seule : elle refuse un mode inconnu, encore faut-il lui dire
     * lesquels le sont.
     *
     * @return list<int>
     */
    public function modesConnus(): array
    {
        return \array_map(
            static fn ($v): int => (int) $v,
            $this->cnx->fetchFirstColumn('SELECT id FROM mode_cuisson'),
        );
    }

    /**
     * Enregistre, ou remplace, des habitudes — et rend combien ont REELLEMENT change.
     *
     * UNE SEULE TRANSACTION POUR TOUT LE LOT. « Les douze autres se mangent
     * sans cuisson » est UN geste de l'utilisateur : douze appels le feraient
     * reussir a moitie, sept habitudes ecrites et cinq perdues dans une
     * coupure, sans aucun moyen de savoir lesquelles.
     *
     * C'EST ICI QUE SE FAIT LE TRI DE L'INCHANGE, ET NULLE PART AILLEURS.
     *
     * Jusqu'au 25 septembre 2026, l'ecran comparait lui-meme ce qu'il venait de
     * decider a ce qu'il croyait deja enregistre, et n'envoyait que les ecarts
     * (`habitudesAEcrire`, front). C'etait le cinquieme double juge du projet :
     * la meme regle, « la derniere decision gagne, et l'inchange ne s'ecrit
     * pas », tenue dans deux langages. Et elle avait deja un defaut mesure —
     * requete en pause, `mesCuissons.data` valait `undefined`, l'ecran croyait
     * ne rien connaitre et reecrivait TOUT le plan, une trentaine de `maj_le`
     * repousses sans raison.
     *
     * Desormais l'ecran envoie ce qu'il affiche, sans juger, et la clause
     * `WHERE ... IS DISTINCT FROM` tranche. `IS DISTINCT FROM` et non `<>` :
     * il traite `NULL` comme une valeur, ce dont la regle 6 a besoin — « se
     * mange sans cuisson » est une REPONSE, et repasser du mode 2 a `null`
     * doit s'ecrire. Quand la condition est fausse, PostgreSQL ne touche pas
     * la ligne : `maj_le` ne bouge pas, et l'instruction rend 0.
     *
     * D'OU LA SOMME, et non `count($aEcrire)`. L'ancien retour disait ce qu'on
     * avait DEMANDE, pas ce qui avait change — un compteur qui ne pouvait
     * jamais dire zero, donc qui ne disait rien.
     *
     * @param array<string, int|null> $aEcrire cle deja normalisee par l'ecran
     */
    public function remplacer(string $utilisateur, array $aEcrire): int
    {
        if ([] === $aEcrire) {
            return 0;
        }

        /* TOUJOURS LE MEME ORDRE, ET C'EST UN GARDE-FOU CONTRE L'INTERBLOCAGE.
           `ON CONFLICT DO UPDATE` verrouille la ligne en conflit meme quand sa
           clause `WHERE` est fausse — meme quand il n'ecrit rien. Depuis que
           le lot porte une ligne par aliment du plan et part a chaque passage
           a « Cuisiner », deux envois concurrents du meme compte qui nomment
           les aliments dans un ordre different s'attendraient l'un l'autre :
           `40P01`, et un echec que l'ecran tait par decision.

           Trier ne coute rien : apres `LotDHabitudes::depuis`, chaque aliment
           n'a plus qu'une ligne et l'ordre ne porte plus aucune semantique.
           Releve en revue le 25 septembre 2026. */
        \ksort($aEcrire);

        $changees = 0;

        $this->cnx->transactional(
            function (Connection $cnx) use ($aEcrire, $utilisateur, &$changees): void {
                foreach ($aEcrire as $aliment => $mode) {
                    $changees += (int) $cnx->executeStatement(
                        'INSERT INTO cuisson_habituelle (utilisateur_id, aliment, mode_cuisson_id, maj_le)
                         VALUES (:u, :a, :m, now())
                         ON CONFLICT (utilisateur_id, aliment)
                         DO UPDATE SET mode_cuisson_id = EXCLUDED.mode_cuisson_id, maj_le = now()
                         WHERE cuisson_habituelle.mode_cuisson_id IS DISTINCT FROM EXCLUDED.mode_cuisson_id',
                        ['u' => $utilisateur, 'a' => (string) $aliment, 'm' => $mode],
                    );
                }
            });

        return $changees;
    }
}
