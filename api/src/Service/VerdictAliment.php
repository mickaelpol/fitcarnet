<?php

declare(strict_types=1);

namespace App\Service;

/**
 * TOUT CE QUE L'ECRAN DOIT DIRE D'UN ALIMENT EN COURS DE SAISIE.
 *
 * DECISION DU 20 SEPTEMBRE 2026, par le proprietaire du projet : « tout doit
 * passer par le serveur car le metier doit etre sur le serveur et puis c'est
 * tout, comme ca je peux changer le front quand bon me semble ».
 *
 * Jusqu'ici l'ecran fabriquait ses propres messages — `controler()` dans
 * `nutrition.ts` — et le serveur ne portait que les refus. Deux ecritures de la
 * meme question, tenues par un fichier de regles. Ce service rend TOUT : les
 * refus, les avertissements, la phrase de resume et le droit d'enregistrer.
 *
 * L'ECRAN N'EVALUE PLUS RIEN. Il envoie ce qui est tape, il affiche ce qui
 * revient. Un front en Vite, en Flutter ou en natif n'a rien a reimplementer —
 * et rien a oublier de reimplementer, ce qui est le vrai sujet.
 *
 * IL LIT AUSSI LES NOMBRES TAPES, virgule francaise comprise. C'etait encore
 * une regle du front (`saisieNombre.ts`) : « 4,2,1 » se lisait 4,2 avec
 * `parseFloat`, et un stock invente partait en base.
 *
 * AUCUNE DEPENDANCE DE SERVICE : tout est statique, comme
 * `CoherenceNutritionnelle` dont il se sert. Les tests le montent sans
 * conteneur.
 */
final class VerdictAliment
{
    /**
     * Convention EUROPEENNE : fibres a 2 kcal/g, comptees a part (regle 4).
     * Les memes coefficients que `CoherenceNutritionnelle`, et pour cause :
     * c'est la seule somme d'Atwater du projet cote serveur.
     */
    private const KCAL_PROT = 4.0;
    private const KCAL_GLUC = 4.0;
    private const KCAL_LIP = 9.0;
    private const KCAL_FIBRES = 2.0;

    /** Ecart tolere entre les calories annoncees et ce que les macros donnent. */
    private const TOLERANCE = 0.08;

    /**
     * Sans fibres renseignees, on tolere beaucoup plus.
     *
     * Elles comptent 2 kcal/g et manquent a la somme : un aliment fibreux
     * paraitrait incoherent alors que ses valeurs sont justes.
     */
    private const TOLERANCE_SANS_FIBRES = 0.2;

    /** Au-dela, ce n'est plus un arrondi mais une valeur a reprendre. */
    private const ECART_FRANC = 0.3;

    /**
     * Le verdict complet.
     *
     * @param array<string, mixed> $saisie les champs TELS QUE TAPES
     *
     * @return array{refus: list<array{champ: string, message: string}>,
     *               avertissements: list<array{champ: string, message: string}>,
     *               resume: string, enregistrable: bool}
     */
    public static function pour(array $saisie): array
    {
        $refus = [];
        $avertissements = [];

        $categorie = \trim((string) ($saisie['categorie'] ?? ''));
        $lus = [];
        foreach (['kcal100', 'prot100', 'gluc100', 'lip100', 'fibres100', 'ratio'] as $champ) {
            $brut = $saisie[$champ] ?? null;
            $texte = null === $brut ? '' : \trim((string) $brut);

            if ('' === $texte) {
                $lus[$champ] = null;
                continue;
            }

            $valeur = self::nombreSaisi($texte);
            if (null === $valeur) {
                /* ON NOMME LE CHAMP ET ON S'ARRETE LA POUR LUI. Juger une
                   valeur qu'on n'a pas su lire reviendrait a inventer. */
                $refus[] = ['champ' => $champ, 'message' => \sprintf(
                    '« %s » n\'est pas un nombre lisible.', $texte)];
                $lus[$champ] = null;
                continue;
            }

            $lus[$champ] = $valeur;
        }

        $ratio = $lus['ratio'] ?? 1.0;

        /* LES REFUS DE COHERENCE, AVEC CE QU'ON A. Les calories, la categorie
           et le rendement suffisent a la regle du grain sec : on ne fait pas
           saisir trois champs de plus pour l'apprendre (demande du
           20 septembre 2026). Les macros absentes valent 0 pour ce calcul, et
           aucune autre regle ne peut se declencher a tort la-dessus — la
           matiere vaut alors 0 g et l'Atwater 0, sous le plancher du soupcon
           de kilojoules. */
        if (null !== ($lus['kcal100'] ?? null) && [] === $refus) {
            $motif = CoherenceNutritionnelle::motifDeRefus(
                $categorie,
                $lus['kcal100'],
                $lus['prot100'] ?? 0.0,
                $lus['gluc100'] ?? 0.0,
                $lus['lip100'] ?? 0.0,
                $lus['fibres100'] ?? null,
                $ratio,
            );

            if (null !== $motif) {
                $refus[] = ['champ' => 'kcal100', 'message' => $motif];
            }
        }

        $controle = self::controle($lus);
        if (null !== $controle['avertissement']) {
            $avertissements[] = ['champ' => 'kcal100', 'message' => $controle['avertissement']];
        }

        /* ENREGISTRABLE : aucun refus, ET les quatre valeurs obligatoires
           lisibles. Une absence n'est pas une faute — on ne la reproche pas —
           mais elle empeche d'enregistrer (regle 6). */
        $complet = null !== ($lus['kcal100'] ?? null) && ($lus['kcal100'] ?? 0.0) > 0
            && null !== ($lus['prot100'] ?? null)
            && null !== ($lus['gluc100'] ?? null)
            && null !== ($lus['lip100'] ?? null)
            && '' !== $categorie;

        return [
            'refus' => $refus,
            'avertissements' => $avertissements,
            'resume' => $controle['resume'],
            'enregistrable' => [] === $refus && $complet,
        ];
    }

    /**
     * Les calories annoncees collent-elles a ce que les macros donnent ?
     *
     * ON AVERTIT, ON NE REFUSE PAS, et c'est mesure : 34 des 3 006 entrees
     * CIQUAL exploitables ont un ecart legitime — les alcools, dont les
     * 7 kcal/g n'entrent dans aucune macro, et les confiseries aux polyols,
     * comptes 2,4 et non 4. Les refuser serait accuser quelqu'un d'une faute
     * qu'il n'a pas commise.
     *
     * @param array<string, float|null> $lus
     *
     * @return array{resume: string, avertissement: string|null}
     */
    private static function controle(array $lus): array
    {
        $kcal = $lus['kcal100'] ?? null;
        $fibresConnues = null !== ($lus['fibres100'] ?? null);

        $calculees = self::KCAL_PROT * ($lus['prot100'] ?? 0.0)
            + self::KCAL_GLUC * ($lus['gluc100'] ?? 0.0)
            + self::KCAL_LIP * ($lus['lip100'] ?? 0.0)
            + self::KCAL_FIBRES * ($lus['fibres100'] ?? 0.0);

        if (null === $kcal || $kcal <= 0.0) {
            return [
                'resume' => \sprintf('Ces macros représentent %d calories.', (int) \round($calculees)),
                'avertissement' => null,
            ];
        }

        /* RIEN A COMPARER TANT QUE LES TROIS MACROS NE SONT PAS LA — releve en
           eprouvant la route par HTTP le 20 septembre 2026. Avec les seules
           calories, elle repondait « le calcul donne 0 calories contre 130
           annoncees » : c'est vrai, et c'est du bruit pendant la frappe.

           Le REFUS, lui, continue de parler : la regle du grain sec n'a pas
           besoin des macros, et c'est justement ce qu'on voulait. */
        $macrosCompletes = null !== ($lus['prot100'] ?? null)
            && null !== ($lus['gluc100'] ?? null)
            && null !== ($lus['lip100'] ?? null);

        if (!$macrosCompletes) {
            return [
                'resume' => 'Renseigne les protéines, les glucides et les lipides '
                    . 'pour que le contrôle soit possible.',
                'avertissement' => null,
            ];
        }

        $ecart = ($calculees - $kcal) / $kcal;
        $seuil = $fibresConnues ? self::TOLERANCE : self::TOLERANCE_SANS_FIBRES;

        if (\abs($ecart) <= $seuil) {
            return [
                'resume' => $fibresConnues
                    ? 'Les valeurs sont cohérentes entre elles.'
                    : 'Cohérent, mais sans les fibres le contrôle reste approximatif.',
                'avertissement' => null,
            ];
        }

        /* Sans fibres renseignees, un ecart NEGATIF est normal sur un aliment
           qui en contient : les calories annoncees incluent leur apport, pas
           le calcul. Inutile d'alarmer sur ce cas-la. */
        if (!$fibresConnues && $ecart < 0.0) {
            $dit = \sprintf(
                'Le calcul donne %d calories contre %d annoncées. C\'est normal si '
                . 'l\'aliment contient des fibres — renseigne-les pour lever le doute.',
                (int) \round($calculees), (int) \round($kcal));

            return ['resume' => $dit, 'avertissement' => $dit];
        }

        $dit = \sprintf(
            'Le calcul donne %d calories contre %d annoncées, soit %s%d %%. %s',
            (int) \round($calculees),
            (int) \round($kcal),
            $ecart > 0.0 ? '+' : '',
            (int) \round($ecart * 100),
            \abs($ecart) > self::ECART_FRANC
                ? 'Vérifie tes saisies : une valeur semble erronée.'
                : 'Vérifie les glucides — les sucres en font partie, ils ne s\'ajoutent pas.',
        );

        return ['resume' => $dit, 'avertissement' => $dit];
    }

    /**
     * Lire un nombre TEL QU'IL A ETE TAPE.
     *
     * LA VIRGULE FRANCAISE EST UN SEPARATEUR DECIMAL, et « 4,2,1 » n'est pas
     * un nombre. `parseFloat` le lisait 4,2 sans broncher, et une pesee qui
     * n'existe pas partait en base — releve le 15 septembre 2026. Un espace
     * ne fait pas un millier non plus : on ne devine pas.
     */
    private static function nombreSaisi(string $texte): ?float
    {
        $normalise = \str_replace(',', '.', $texte);

        if (1 !== \preg_match('/^-?\d+(\.\d+)?$/', $normalise)) {
            return null;
        }

        $valeur = (float) $normalise;

        return $valeur < 0.0 ? null : $valeur;
    }
}
