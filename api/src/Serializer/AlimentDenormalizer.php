<?php

declare(strict_types=1);

namespace App\Serializer;

use ApiPlatform\Validator\Exception\ValidationException;
use App\Entity\Aliment;
use App\Service\NombreSaisi;
use App\Service\VerdictAliment;
use Symfony\Component\Serializer\Normalizer\DenormalizerAwareInterface;
use Symfony\Component\Serializer\Normalizer\DenormalizerAwareTrait;
use Symfony\Component\Serializer\Normalizer\DenormalizerInterface;
use Symfony\Component\Validator\ConstraintViolation;
use Symfony\Component\Validator\ConstraintViolationList;

/**
 * L'ECRITURE D'UN ALIMENT N'A QU'UN JUGE — 26 septembre 2026.
 *
 * Il y en avait deux. L'ecran demandait son verdict a `VerdictAliment`
 * (`POST /api/verification/aliment`) ; `POST /api/aliments` appliquait les
 * contraintes de l'entite, qui ne sont pas les memes. L'ecran pouvait donc dire
 * « enregistrable » de ce que l'ecriture refuserait. Et il convertissait
 * lui-meme « 12,5 » en nombre, calculait lui-meme le rendement depuis ses
 * pesees, et envoyait le resultat — que l'API croyait.
 *
 * DESORMAIS LE CORPS EST LA SAISIE, TELLE QUE TAPEE (texte ou nombre JSON), et
 * ce denormaliseur la fait juger par `VerdictAliment` AVANT toute
 * denormalisation. Refusee : 422, avec EXACTEMENT les refus du verdict, champ
 * par champ. Acceptee : la suite recoit les valeurs LUES PAR LE SERVEUR — le
 * ratio effectif compris, calcule depuis les pesees quand il y en a deux
 * (CA-11). Les contraintes de l'entite restent derriere, en filet.
 *
 * SUR UN PATCH, L'ORIGINE EST LUE EN BASE. `object_to_populate` est l'aliment
 * tel que `FiltreProprietaire` l'a charge — donc un aliment du compte, et un
 * PATCH sur celui d'autrui a deja rendu 404 avant d'arriver ici (CA-R5). Un
 * aliment incoherent herite d'avant la regle se renomme sans toucher a ses
 * valeurs (CA-13) ; une cle `origine` venue du corps est IGNOREE (CA-R4), sans
 * quoi un client declarerait lui-meme ce qu'il a le droit d'aggraver.
 *
 * UN DENORMALISEUR ET NON UN PROCESSEUR : la validation d'API Platform passe
 * entre les deux, et elle aurait juge « 12,5 » avant qu'on l'ait lu.
 */
final class AlimentDenormalizer implements DenormalizerInterface, DenormalizerAwareInterface
{
    use DenormalizerAwareTrait;

    /** Pose sur le contexte transmis a la suite : on ne se juge pas deux fois. */
    public const DEJA_LU = 'fitcarnet_aliment_deja_lu';

    private const NOMBRES = ['kcal100', 'prot100', 'gluc100', 'lip100', 'fibres100',
        'ratio', 'peseeAvant', 'peseeApres'];

    /** @param array<string, mixed> $context */
    public function supportsDenormalization(mixed $data, string $type, ?string $format = null, array $context = []): bool
    {
        return Aliment::class === $type && \is_array($data) && !isset($context[self::DEJA_LU]);
    }

    /** @return array<string, bool> */
    public function getSupportedTypes(?string $format): array
    {
        return [Aliment::class => false];
    }

    /** @param array<string, mixed> $context */
    public function denormalize(mixed $data, string $type, ?string $format = null, array $context = []): mixed
    {
        /** @var array<string, mixed> $corps */
        $corps = (array) $data;
        unset($corps['origine']);

        $enBase = ($context['object_to_populate'] ?? null) instanceof Aliment
            ? $context['object_to_populate'] : null;

        $saisie = null === $enBase ? $corps : $corps + self::valeurs($enBase);
        if (null !== $enBase) {
            $saisie['origine'] = self::valeurs($enBase);
        }

        $verdict = VerdictAliment::pour($saisie);
        if (!$verdict['enregistrable']) {
            throw new ValidationException(self::violations($verdict));
        }

        $donnees = $corps;
        foreach (self::NOMBRES as $champ) {
            if (\array_key_exists($champ, $saisie)) {
                $donnees[$champ] = NombreSaisi::lire($saisie[$champ]);
            }
        }
        /* LE RATIO EST CELUI QUE LE SERVEUR A RETENU, pas celui qu'on lui a
           envoye : deux pesees lues le fixent (CA-11). */
        if (null !== $verdict['rendement']['valeur']) {
            $donnees['ratio'] = $verdict['rendement']['valeur'];
        } else {
            unset($donnees['ratio']);
        }

        return $this->denormalizer->denormalize($donnees, $type, $format, $context + [self::DEJA_LU => true]);
    }

    /**
     * L'aliment en base, sous la forme d'une saisie.
     *
     * @return array<string, mixed>
     */
    private static function valeurs(Aliment $a): array
    {
        return [
            'nom' => $a->getNom(),
            'categorie' => $a->getCategorie(),
            'kcal100' => $a->getKcal100(),
            'prot100' => $a->getProt100(),
            'gluc100' => $a->getGluc100(),
            'lip100' => $a->getLip100(),
            'fibres100' => $a->getFibres100(),
            'ratio' => $a->getRatio(),
            'peseeAvant' => $a->getPeseeAvant(),
            'peseeApres' => $a->getPeseeApres(),
        ];
    }

    /**
     * Les refus du verdict, tels quels. `enregistrable: false` sans refus ne
     * devrait pas arriver ; si c'est le cas, on refuse quand meme en le disant,
     * plutot que d'ecrire ce que l'ecran aurait refuse.
     *
     * @param array{refus: list<array{champ: string, message: string}>, resume: string} $verdict
     */
    private static function violations(array $verdict): ConstraintViolationList
    {
        $refus = [] !== $verdict['refus'] ? $verdict['refus']
            : [['champ' => 'kcal100', 'message' => '' !== $verdict['resume']
                ? $verdict['resume'] : 'Ces valeurs ne peuvent pas être enregistrées.']];

        $liste = new ConstraintViolationList();
        foreach ($refus as $r) {
            $liste->add(new ConstraintViolation($r['message'], $r['message'], [], null, $r['champ'], null));
        }

        return $liste;
    }
}
