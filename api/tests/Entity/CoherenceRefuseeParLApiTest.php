<?php

declare(strict_types=1);

namespace App\Tests\Entity;

use App\Entity\Aliment;
use App\Entity\Cible;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Validator\Validation;
use Symfony\Component\Validator\Validator\ValidatorInterface;

/**
 * LA REGLE EST-ELLE VRAIMENT BRANCHEE SUR L'ENTITE ?
 *
 * `CoherencePartageTest` eprouve le SERVICE ; il resterait vert si personne
 * n'appelait jamais `CoherenceNutritionnelle` depuis `Aliment`. C'est le motif
 * dominant du projet — une decision juste, posee a un endroit et oubliee a
 * l'autre — et c'est exactement ce qui s'etait passe pour le rendement :
 * quatre endroits connaissaient la regle, le seul branche sur l'ECRITURE ne la
 * consultait pas.
 *
 * Ce test monte le validateur comme la documentation Symfony 7.4 le fait,
 * `Validation::createValidatorBuilder()->enableAttributeMapping()` — sans
 * noyau, sans conteneur, sans base. C'est possible parce que le service n'a
 * aucune dependance, et ce n'est pas un hasard.
 */
final class CoherenceRefuseeParLApiTest extends TestCase
{
    public function testLeRizSaisiCuitEstRefuseParLEntite(): void
    {
        /* LE CAS QUI A MOTIVE LE PALIER 1 : 130 kcal, ce sont les valeurs du
           riz CUIT. Le calcul resterait juste et ferait peser trois fois trop. */
        $motifs = self::motifsSurLesCalories(self::riz(kcal100: 130));

        self::assertNotEmpty($motifs, 'un feculent qui gonfle sous 300 kcal doit etre refuse');
        self::assertStringContainsString('grain sec', \implode(' ', $motifs),
            'le message doit dire POURQUOI, pas « valeur invalide »');
    }

    public function testLesKilojoulesSontRefusesParLEntite(): void
    {
        $motifs = self::motifsSurLesCalories(self::riz(kcal100: 1465));

        self::assertNotEmpty($motifs);
        self::assertStringContainsString('kilojoules', \implode(' ', $motifs));
    }

    public function testLeRizSecPasseParLEntite(): void
    {
        /* LE TEMOIN. Sans lui, une entite qui refuserait TOUT passerait les
           deux tests ci-dessus — et l'application deviendrait inutilisable
           sans qu'une seule suite ne bouge. */
        self::assertSame([], self::motifsSurLesCalories(self::riz(kcal100: 350)),
            'le riz sec a 350 kcal est la reference du projet (regle 3)');
    }

    public function testUnAlimentSansMacrosNEstPasDitIncoherent(): void
    {
        /* Regle 6 : une absence n'est pas une valeur fausse. C'est
           `Assert\NotNull` qui parle des macros manquantes, pas cette regle —
           et repondre « incoherent » a un champ vide melangerait « je ne sais
           pas » et « c'est faux ». */
        $a = (new Aliment())->setNom('En cours de saisie')->setCategorie('fec')->setRatio(2.26);

        /* `Assert\NotNull` parle, lui, et c'est son role — il pose sa violation
           sur le MEME champ. On verifie donc que la regle de coherence se tait,
           pas que le champ est muet. */
        $dits = \implode(' ', self::motifsSurLesCalories($a));

        self::assertStringNotContainsString('grain sec', $dits);
        self::assertStringNotContainsString('kilojoules', $dits);
        self::assertStringNotContainsString('nutriments', $dits);
        self::assertStringContainsString('Valeur manquante', $dits,
            'c\'est `NotNull` qui doit parler d\'une macro absente, pas la coherence');
    }

    public function testUneCibleEnKilojoulesEstRefuseeParLEntite(): void
    {
        $motifs = self::motifsSur(self::cible(kcal: 8493), 'kcal');

        self::assertNotEmpty($motifs);
        self::assertStringContainsString('kilojoules', \implode(' ', $motifs));
    }

    public function testUneCibleSeulementIncoherentePasseParLEntite(): void
    {
        /* LE TEMOIN QUI PROTEGE UN PARCOURS QUI MARCHE. L'ecran des objectifs
           affiche « l'app respecte les grammes ; les calories suivent » et
           laisse enregistrer : quelqu'un recopie un plan de coach qui ne tombe
           pas juste. Refuser ici rendrait le bouton definitivement inoperant,
           sous un ecran qui vient d'expliquer que ce n'est pas grave. */
        self::assertSame([], self::motifsSur(self::cible(kcal: 2100), 'kcal'),
            'une cible incoherente doit passer');
    }

    /**
     * ON NE REFUSE PAS CE QUI ETAIT DEJA LA — releve par le proprietaire du
     * projet le 20 septembre 2026, et c'est le faux refus qu'il redoutait.
     *
     * Un `PATCH` revalide l'objet ENTIER : un aliment incoherent deja en base
     * — migre avant que la regle existe — devenait impossible a RENOMMER,
     * refuse sur un champ que personne n'avait touche. L'utilisateur se
     * retrouvait avec une ligne qu'il ne pouvait ni corriger par petits pas,
     * ni meme renommer.
     *
     * La regle porte donc sur ce qu'on INTRODUIT, pas sur ce qu'on trouve.
     */
    public function testUneIncoherenceDEJA_EN_BASE_NEmpecheRienDAutre(): void
    {
        $a = self::riz(kcal100: 130);
        /* Comme Doctrine le fait au chargement : la ligne existait ainsi. */
        $a->memoriserLesValeursChargees();
        $a->setNom('Un nouveau nom');

        self::assertSame([], self::motifsSurLesCalories($a),
            'renommer un aliment deja incoherent ne doit pas etre refuse');
    }

    public function testMAIS_ON_REFUSE_CE_QUI_AGGRAVE(): void
    {
        /* LE TEMOIN QUI EMPECHE DE TOUT LAISSER PASSER. Charge coherent, puis
           rendu incoherent : c'est exactement le geste du proprietaire du
           projet — il renseigne le rendement apres avoir cuisine. */
        $a = self::riz(kcal100: 130)->setRatio(1.0);
        $a->memoriserLesValeursChargees();
        $a->setRatio(2.26);

        self::assertNotEmpty(self::motifsSurLesCalories($a),
            'introduire une incoherence doit rester refuse');
    }

    public function testUNE_AUTRE_INCOHERENCE_EST_REFUSEE_AUSSI(): void
    {
        /* Deja incoherent par le grain sec, on ajoute une matiere impossible :
           c'est un motif NOUVEAU, il doit parler. Sans ce cas, une ligne
           abimee deviendrait un permis de tout ecrire. */
        $a = self::riz(kcal100: 130);
        $a->memoriserLesValeursChargees();
        $a->setProt100(60)->setGluc100(60);

        self::assertNotEmpty(self::motifsSurLesCalories($a),
            'un motif different doit etre refuse, meme sur une ligne deja abimee');
    }

    public function testUNE_CREATION_INCOHERENTE_RESTE_REFUSEE(): void
    {
        /* Sans valeurs chargees, il n'y a pas de « deja la » : tout est
           nouveau. C'est le cas d'une creation. */
        self::assertNotEmpty(self::motifsSurLesCalories(self::riz(kcal100: 130)));
    }

    /**
     * LE SEUL MECANISME DE CE DEPOT QUE DOCTRINE PEUT IGNORER EN SILENCE.
     *
     * RELEVE PAR `revue-pile` LE 20 SEPTEMBRE 2026, et c'est le motif 4 : les
     * quatre tests ci-dessus appellent `memoriserLesValeursChargees()` A LA
     * MAIN. Aucun ne fait charger un `Aliment` par Doctrine. Ils resteraient
     * donc VERTS si le rappel cessait de se declencher.
     *
     * Or la documentation Doctrine est explicite : « Using `#[PostLoad]`
     * without this marker attribute will make Doctrine ignore the callbacks. »
     * Le marqueur est sur la classe, et `Aliment` est la SEULE entite du
     * projet a le porter — donc la seule que quelqu'un puisse retirer en
     * refactorant sans que rien d'autre ne tombe.
     *
     * Ce qui arriverait alors : `$motifDejaLa` vaudrait toujours `null`, et
     * tout `PATCH` sur un aliment deja incoherent serait refuse — exactement
     * le faux refus qu'on vient de corriger.
     *
     * Ce test ne demande ni base ni conteneur : il lit les attributs.
     */
    public function testLeRappelDeChargementEstBIEN_DECLARE(): void
    {
        $classe = new \ReflectionClass(Aliment::class);

        self::assertNotSame([], $classe->getAttributes(\Doctrine\ORM\Mapping\HasLifecycleCallbacks::class),
            'sans `#[ORM\HasLifecycleCallbacks]` sur la CLASSE, Doctrine ignore '
            . 'le rappel — et il l\'ignore en silence');

        $methode = $classe->getMethod('memoriserLesValeursChargees');

        self::assertNotSame([], $methode->getAttributes(\Doctrine\ORM\Mapping\PostLoad::class),
            'et sans `#[ORM\PostLoad]` sur la methode, elle n\'est jamais appelee');
    }

    // ----------------------------------------------------------------- outils

    private static function riz(float $kcal100): Aliment
    {
        return (new Aliment())
            ->setNom('Riz de test')
            ->setCategorie('fec')
            ->setKcal100($kcal100)
            ->setProt100(7)
            ->setGluc100(78)
            ->setLip100(0.6)
            ->setFibres100(1.4)
            ->setRatio(2.26);
    }

    /**
     * Grammes constants : seules les calories changent d'un cas a l'autre.
     *
     * 150 / 200 / 70 font 2 030 kcal par Atwater. C'est ce chiffre qui rend
     * les deux cas comparables : 2 100 est une cible ordinaire, 8 493 est
     * exactement 2 030 x 4,184.
     */
    private static function cible(float $kcal): Cible
    {
        return (new Cible())
            ->setRepas('R2')
            ->setKcal($kcal)
            ->setProt(150)
            ->setGluc(200)
            ->setLip(70);
    }

    /** @return list<string> */
    private static function motifsSurLesCalories(Aliment $a): array
    {
        return self::motifsSur($a, 'kcal100');
    }

    /** @return list<string> */
    private static function motifsSur(object $entite, string $champ): array
    {
        $validateur = Validation::createValidatorBuilder()
            ->enableAttributeMapping()
            ->getValidator();

        $motifs = [];
        foreach (self::valide($validateur, $entite) as $violation) {
            if ($champ === $violation->getPropertyPath()) {
                $motifs[] = (string) $violation->getMessage();
            }
        }

        return $motifs;
    }

    /** @return iterable<\Symfony\Component\Validator\ConstraintViolationInterface> */
    private static function valide(ValidatorInterface $validateur, object $entite): iterable
    {
        return $validateur->validate($entite);
    }
}
