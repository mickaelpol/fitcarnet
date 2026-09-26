<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Aliment;

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
     * Plafond physique pour 100 g : rien n'est plus dense que la matiere
     * grasse pure, a 9 kcal par gramme. Au-dela, la valeur saisie ne peut pas
     * etre des calories.
     */
    private const KCAL_MAX_100G = 900.0;

    /** 1 kcal = 4,184 kJ. Facteur du reglement INCO. */
    private const KJ_PAR_KCAL = 4.184;

    /** Le rapport doit serrer 4,184 de pres pour qu'on PROPOSE une conversion. */
    private const TOLERANCE_RAPPORT = 0.10;

    /**
     * Le verdict complet.
     *
     * @param array<string, mixed> $saisie les champs TELS QUE TAPES
     *
     * @return array{refus: list<array{champ: string, message: string}>,
     *               avertissements: list<array{champ: string, message: string}>,
     *               resume: string, verdict: string, enregistrable: bool,
     *               conversion: array{saisi: float, converti: float, motif: string}|null,
     *               rendement: array{valeur: float|null, explication: string|null, provenance: string|null}}
     */
    public static function pour(array $saisie): array
    {
        $avertissements = [];

        $categorie = \trim((string) ($saisie['categorie'] ?? ''));

        /* UNE CATEGORIE QUE LA BASE REFUSERA N'EST PAS ENREGISTRABLE, et
           l'ecran doit le savoir AVANT d'allumer son bouton — 21 septembre
           2026. `categorie: "zzz"` rendait `enregistrable: true` pendant que
           `POST /api/aliments` repondait 422 (`Assert\Choice`). Inatteignable
           par l'interface, qui choisit dans une liste ; mais le but de la
           refonte est qu'un AUTRE front obtienne la meme reponse sans avoir a
           connaitre les huit valeurs.

           LA LISTE EST CELLE DE L'ENTITE, pas une copie : une neuvieme
           categorie ajoutee la-bas passe ici sans qu'on y pense. */
        $refus = [];
        if ('' !== $categorie && !\in_array($categorie, Aliment::CATEGORIES, true)) {
            $refus[] = ['champ' => 'categorie', 'message' => \sprintf(
                '« %s » n\'est pas une catégorie connue.', $categorie)];
        }

        $lus = [];
        foreach (['kcal100', 'prot100', 'gluc100', 'lip100', 'fibres100', 'ratio',
            'peseeAvant', 'peseeApres', 'quantite'] as $champ) {
            $brut = $saisie[$champ] ?? null;

            if (NombreSaisi::estVide($brut)) {
                $lus[$champ] = null;
                continue;
            }

            /* LE LECTEUR EST CELUI DE L'ECRITURE, et c'est tout l'objet du
               26 septembre 2026 : `NombreSaisi` lit aussi `POST /api/aliments`
               et `POST /api/mon-frigo/stock`. Un texte ou un nombre JSON. */
            $valeur = NombreSaisi::lire($brut);
            if (null === $valeur) {
                /* ON NOMME LE CHAMP ET ON S'ARRETE LA POUR LUI. Juger une
                   valeur qu'on n'a pas su lire reviendrait a inventer. */
                $refus[] = ['champ' => $champ, 'message' => \sprintf(
                    '« %s » n\'est pas un nombre lisible.', \is_scalar($brut) ? \trim((string) $brut) : '?')];
                $lus[$champ] = null;
                continue;
            }

            /* LU, MAIS PAS FORCEMENT ACCEPTABLE. Le signe se juge apres la
               lecture, et il se dit avec ses propres mots. */
            $signe = self::refusDuSigne($champ, $valeur);
            if (null !== $signe) {
                $refus[] = $signe;
                $lus[$champ] = null;
                continue;
            }

            $lus[$champ] = $valeur;
        }

        /* JUSQU'ICI, SEULS L'ILLISIBLE ET LE NEGATIF. La coherence plus bas se
           juge des que les calories sont lues et que rien n'est illisible :
           une macro MANQUANTE n'empeche pas de dire « un grain sec en fait au
           moins 300 » (demande du 20 septembre 2026). */
        $illisible = [] !== $refus;

        /* UNE MACRO OBLIGATOIRE VIDE SE REFUSE SUR SON CHAMP — 26 septembre
           2026. Elle etait une absence muette : l'ecran redigeait lui-meme
           « Renseigne les quatre valeurs », et l'entite refusait avec SON
           message (`Aliment::MACRO_ABSENTE`). Un seul juge desormais, et une
           seule phrase : celle de l'entite. Vide n'est jamais zero (regle 6). */
        foreach (['kcal100', 'prot100', 'gluc100', 'lip100'] as $champ) {
            if (NombreSaisi::estVide($saisie[$champ] ?? null)) {
                $refus[] = ['champ' => $champ, 'message' => Aliment::MACRO_ABSENTE];
            }
        }
        if (0.0 === ($lus['kcal100'] ?? null)) {
            $refus[] = ['champ' => 'kcal100', 'message' =>
                'Un aliment à 0 kcal disparaîtrait du calcul des repas : recopie les calories de l’emballage.'];
        }
        if ('' === $categorie) {
            $refus[] = ['champ' => 'categorie', 'message' => 'Choisis une catégorie.'];
        }

        /* LES PESEES : le serveur calcule le rendement, l'ecran ne l'envoie
           plus (CA-7, CA-11). Deux pesees lues font le ratio, et le `ratio`
           envoye a cote est ignore — il ne peut pas contredire la mesure. */
        foreach (['peseeAvant' => 'peseeApres', 'peseeApres' => 'peseeAvant'] as $champ => $autre) {
            if (null !== ($lus[$champ] ?? null) && $lus[$champ] <= 0.0) {
                $refus[] = ['champ' => $champ, 'message' => 'Une pesée vaut plus de 0 g.'];
                $lus[$champ] = null;
            }
            if (!NombreSaisi::estVide($saisie[$champ] ?? null) && NombreSaisi::estVide($saisie[$autre] ?? null)) {
                $refus[] = ['champ' => $autre, 'message' => 'peseeAvant' === $autre
                    ? 'Il manque la pesée avant cuisson.' : 'Il manque la pesée après cuisson.'];
            }
        }
        $mesure = RendementExplique::depuisPesees($lus['peseeAvant'] ?? null, $lus['peseeApres'] ?? null);
        if (null !== $mesure) {
            $lus['ratio'] = $mesure;
        }

        $ratio = $lus['ratio'] ?? 1.0;

        /* LES REFUS DE COHERENCE, AVEC CE QU'ON A. Les calories, la categorie
           et le rendement suffisent a la regle du grain sec : on ne fait pas
           saisir trois champs de plus pour l'apprendre (demande du
           20 septembre 2026). Les macros absentes valent 0 pour ce calcul, et
           aucune autre regle ne peut se declencher a tort la-dessus — la
           matiere vaut alors 0 g et l'Atwater 0, sous le plancher du soupcon
           de kilojoules. */
        if (null !== ($lus['kcal100'] ?? null) && !$illisible) {
            /* LES PHRASES VIENNENT D'`AnomaliesAliment`, ET C'EST TOUT
               L'INTERET — corrige le 20 septembre 2026, apres que
               `revue-fitcarnet` a mesure la regression.

               J'avais branche l'ecran sur `CoherenceNutritionnelle`, dont les
               messages sont ecrits SANS ACCENTS : c'est la convention des
               commentaires PHP de ce projet, jamais celle des phrases lues par
               quelqu'un. L'ecran s'est donc mis a afficher « un feculent qui
               gonfle » et « les valeurs decrivent le produit tel qu'on le
               PESE ». Il a perdu en meme temps le nom de l'aliment en prefixe
               et, surtout, LA CORRECTION CHIFFREE — « Multiplie tout par le
               rendement : 294 kcal, 63,3 g de glucides… » — qui etait l'aide
               la plus utile de cet ecran, et que la regle 7 reclame.

               `AnomaliesAliment` porte les phrases d'origine, accents compris,
               et `AnomaliesPortageTest` prouve qu'elles sont identiques a celles
               d'avant la refonte, sur 4 409 cas. */
            $motif = self::motifLisible(
                (string) ($saisie['nom'] ?? ''),
                $categorie,
                $lus['kcal100'],
                $lus['prot100'] ?? 0.0,
                $lus['gluc100'] ?? 0.0,
                $lus['lip100'] ?? 0.0,
                $lus['fibres100'] ?? null,
                $ratio,
            );

            /* ON NE REPROCHE PAS CE QUI ETAIT DEJA LA. L'entite fait pareil
               (`Aliment::memoriserLesValeursChargees`) : un aliment incoherent
               deja en base — migre avant que la regle existe — doit pouvoir
               etre renomme. Sans cette exemption, le serveur AUTORISAIT
               l'ecriture que l'ecran interdisait : le jumeau oublie entre deux
               portes du meme serveur. Releve par `revue-pile` le 20 septembre
               2026, le jour meme ou je l'avais introduit.

               L'ORIGINE EST DECLAREE PAR L'APPELANT, elle ne se lit pas en
               base : cette route n'a rien a lire, et la regle 2 n'a donc pas de
               nouveau chemin a garder. Un client qui mentirait n'obtiendrait
               qu'un bouton allume, puis un 422 — l'entite reste la seule vraie
               porte. */
            if (null !== $motif && $motif !== self::motifDeLOrigine($saisie)) {
                $refus[] = ['champ' => 'kcal100', 'message' => $motif];
            }
        }

        /* LE SENS DU RENDEMENT EST JUGE ICI AUSSI. Il l'etait par l'ecran
           (`rendementPossible`) ET par l'entite (`verifierLeSensDuRendement`) :
           deux ecritures, tenues par `api/regles/rendement.json`. L'ecran cesse
           de juger, le fichier n'aura plus rien a verrouiller.

           La regle n'est pas reecrite : c'est la meme fonction que l'entite
           appelle. Une viande ne grossit pas en cuisant, un feculent ne
           retrecit pas — une pesee a l'envers inverse les deux colonnes de
           l'ecran, et ca ne se rattrape pas. */
        if (null !== ($lus['ratio'] ?? null) && '' !== $categorie) {
            $sens = RendementPlausible::sens($categorie, $ratio);
            if (null !== $sens) {
                $refus[] = ['champ' => 'ratio', 'message' => $sens];
            }
        }

        /* LE CONTROLE VIT DANS SON PROPRE SERVICE depuis le 20 septembre
           2026 : deux ecrans posent la meme question, et le detail d'une ligne
           du frigo la calculait encore lui-meme. */
        $controle = ControleDesMacros::pour(
            $lus['kcal100'] ?? null, $lus['prot100'] ?? null,
            $lus['gluc100'] ?? null, $lus['lip100'] ?? null, $lus['fibres100'] ?? null);
        if (null !== $controle['avertissement']) {
            $avertissements[] = ['champ' => 'kcal100', 'message' => $controle['avertissement']];
        }

        /* ENREGISTRABLE : aucun refus, ET les quatre valeurs obligatoires
           lisibles. Une absence n'est pas une faute — on ne la reproche pas —
           mais elle empeche d'enregistrer (regle 6). */
        $kcal = $lus['kcal100'] ?? null;
        $complet = null !== $kcal && $kcal > 0.0
            && null !== ($lus['prot100'] ?? null)
            && null !== ($lus['gluc100'] ?? null)
            && null !== ($lus['lip100'] ?? null)
            && '' !== $categorie;

        return [
            'refus' => $refus,
            'avertissements' => $avertissements,
            'resume' => $controle['resume'],
            /* LA COULEUR DU BANDEAU EST UNE DECISION, PAS UN STYLE : elle dit
               si les valeurs se tiennent. L'ecran la traduit en teinte, il ne
               la decide plus. */
            'verdict' => $controle['verdict'],
            'conversion' => self::conversionProposee($lus),
            /* LE RENDEMENT, CALCULE ET DIT PAR LE SERVEUR — 26 septembre 2026.
               L'ecran affichait `expliquerRatio` et `provenanceRatio`, qu'il
               calculait lui-meme depuis des pesees qu'il lisait lui-meme. Il
               affiche desormais ceci, et « inconnu » s'il n'a pas de reponse.
               Le « candidat » juge a part a disparu avec : la pesee tapee EST
               la saisie. */
            'rendement' => [
                'valeur' => $lus['ratio'] ?? null,
                'explication' => null === ($lus['ratio'] ?? null) ? null : RendementExplique::explication($lus['ratio']),
                'provenance' => null === $mesure ? null
                    : RendementExplique::provenance($lus['peseeAvant'], $lus['peseeApres']),
            ],
            /* `incoherent` EMPECHE D'ENREGISTRER, comme avant la refonte.
               L'ancien `valide` de l'ecran portait `controle.verdict !==
               'incoherent'` ; je l'avais laisse tomber, et un aliment a 100 kcal
               pour 50 g de proteines s'enregistrait sous un bandeau rouge qui
               disait « une valeur semble erronee ». Mesure par
               `revue-fitcarnet` le 20 septembre 2026. */
            /* ET L'EXEMPTION D'ORIGINE VAUT ICI AUSSI — 26 septembre 2026.
               Elle ne couvrait que `motifLisible` : un aliment herite hors
               d'Atwater (100 kcal pour 50 g de proteines) ne se RENOMMAIT plus,
               des que l'ecriture est passee par ce verdict. Meme regle que
               l'entite : on ne reproche pas ce qu'on trouve, on reproche ce
               qu'on introduit — donc seulement si les valeurs ont bouge.
               Releve par `revue-fitcarnet`. */
            'enregistrable' => [] === $refus && $complet
                && ('incoherent' !== $controle['verdict'] || self::macrosDeLOrigine($saisie, $lus)),
        ];
    }

    /**
     * Les cinq valeurs nutritionnelles sont-elles CELLES DE L'ORIGINE ?
     *
     * Faux sans origine (une creation n'a rien d'herite), et faux des qu'une
     * seule a change : l'exemption couvre ce qu'on a trouve, jamais ce qu'on
     * ecrit de neuf.
     *
     * @param array<string, mixed>       $saisie
     * @param array<string, float|null>  $lus
     */
    private static function macrosDeLOrigine(array $saisie, array $lus): bool
    {
        $origine = $saisie['origine'] ?? null;
        if (!\is_array($origine)) {
            return false;
        }

        foreach (['kcal100', 'prot100', 'gluc100', 'lip100', 'fibres100'] as $champ) {
            if (NombreSaisi::lire($origine[$champ] ?? null) !== ($lus[$champ] ?? null)) {
                return false;
            }
        }

        return true;
    }

    /**
     * LA PHRASE QUE L'UTILISATEUR LIRA, ou `null` si la fiche se tient.
     *
     * Elle vient d'`AnomaliesAliment`, dont `AnomaliesPortageTest` prouve
     * qu'elle est identique, au caractere pres, a celle d'avant la refonte.
     * `CoherenceNutritionnelle` repond a la meme question mais SANS ACCENTS :
     * c'est la convention des commentaires PHP de ce projet, jamais celle des
     * phrases lues par quelqu'un.
     */
    private static function motifLisible(
        string $nom,
        string $categorie,
        float $kcal100,
        float $prot100,
        float $gluc100,
        float $lip100,
        ?float $fibres100,
        float $ratio,
    ): ?string {
        foreach (AnomaliesAliment::pour($nom, $categorie, $kcal100, $prot100,
            $gluc100, $lip100, $fibres100, $ratio) as $anomalie) {
            if ('blocage' === $anomalie['gravite']) {
                return $anomalie['message'];
            }
        }

        return null;
    }

    /**
     * Le motif que cette fiche portait DEJA, ou `null`.
     *
     * Meme motif inchange = rien n'a ete aggrave. Motif DIFFERENT = c'est
     * nouveau, et une ligne abimee n'est pas un permis de tout ecrire.
     *
     * @param array<string, mixed> $saisie
     */
    private static function motifDeLOrigine(array $saisie): ?string
    {
        $origine = $saisie['origine'] ?? null;
        if (!\is_array($origine)) {
            return null;
        }

        $lu = static function (string $champ) use ($origine): ?float {
            return NombreSaisi::lire($origine[$champ] ?? null);
        };

        $kcal = $lu('kcal100');
        if (null === $kcal) {
            return null;
        }

        return self::motifLisible(
            (string) ($saisie['nom'] ?? ''),
            \trim((string) ($origine['categorie'] ?? '')),
            $kcal,
            $lu('prot100') ?? 0.0,
            $lu('gluc100') ?? 0.0,
            $lu('lip100') ?? 0.0,
            $lu('fibres100'),
            $lu('ratio') ?? 1.0,
        );
    }

    /**
     * PROPOSER de convertir des kilojoules en calories.
     *
     * A NE PAS CONFONDRE AVEC LE REFUS. `CoherenceNutritionnelle` REFUSE quand
     * il n'y a plus de doute ; ceci PROPOSE un correctif quand il y en a un.
     * Les deux peuvent parler en meme temps, et c'est le comportement d'avant
     * le 20 septembre 2026 — l'ecran affichait la bande jaune avec son bouton
     * « convertir », et cette refonte ne doit RIEN changer de visible.
     *
     * DEUX DETECTIONS COMPLEMENTAIRES, et aucune n'est infaillible :
     *  - le PLAFOND fonctionne sans macros saisies, mais rate les aliments peu
     *    caloriques : 50 kcal en kJ font 209, ce qui reste plausible ;
     *  - le RAPPORT aux macros attrape n'importe quel niveau, mais exige
     *    qu'elles soient renseignees.
     *
     * @param array<string, float|null> $lus
     *
     * @return array{saisi: float, converti: float, motif: string}|null
     */
    private static function conversionProposee(array $lus): ?array
    {
        $kcal = $lus['kcal100'] ?? null;
        if (null === $kcal || $kcal <= 0.0) {
            return null;
        }

        $converti = \round($kcal / self::KJ_PAR_KCAL, 1);

        if ($kcal > self::KCAL_MAX_100G) {
            return ['saisi' => $kcal, 'converti' => $converti, 'motif' => 'plafond'];
        }

        $calculees = Atwater::kcal($lus['prot100'] ?? 0.0, $lus['gluc100'] ?? 0.0,
            $lus['lip100'] ?? 0.0, $lus['fibres100'] ?? null);

        if ($calculees <= 0.0) {
            return null;
        }

        $ecart = \abs($kcal / $calculees - self::KJ_PAR_KCAL) / self::KJ_PAR_KCAL;

        return $ecart <= self::TOLERANCE_RAPPORT
            ? ['saisi' => $kcal, 'converti' => $converti, 'motif' => 'rapport']
            : null;
    }

    /* `nombreSaisi()` VIVAIT ICI, en methode privee. Il est devenu
       `NombreSaisi::lire` le 26 septembre 2026, pour que l'ECRITURE lise comme
       l'ecran : `(float) "12,5"` y valait 12. Ses deux lecons restent vraies
       et sont ecrites la-bas — « 4,2,1 » n'est pas un nombre (15 septembre),
       « -2 » est lisible et le signe se juge a part (21 septembre). */

    /**
     * Le refus qu'appelle un nombre negatif, ou `null` s'il n'y a rien a dire.
     *
     * LE ZERO PASSE : « zero gramme de lipides » est une reponse, pas une
     * absence de reponse (regle 6). Un garde ecrit `<= 0` interdirait de
     * saisir un aliment sans lipides.
     */
    private static function refusDuSigne(string $champ, float $valeur): ?array
    {
        return $valeur < 0.0
            ? ['champ' => $champ, 'message' => \sprintf(
                'Une valeur négative n\'a pas de sens ici : « %s » est un nombre, mais il est négatif.',
                self::texteDuNombre($valeur))]
            : null;
    }

    /** Le nombre tel qu'on le remontre a celui qui l'a tape : virgule comprise. */
    private static function texteDuNombre(float $valeur): string
    {
        return \str_replace('.', ',', (string) $valeur);
    }
}
