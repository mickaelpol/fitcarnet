<?php

declare(strict_types=1);

namespace App\Validator;

use App\Service\MotDePasse;
use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;
use Symfony\Component\Validator\Exception\UnexpectedTypeException;

/**
 * Applique `MotDePasse` a une propriete d'entite.
 *
 * NE JUGE RIEN LUI-MEME. Tout ce qu'il fait, c'est traduire une decision prise
 * ailleurs en violation Symfony. C'est la condition pour qu'il n'y ait qu'un
 * seul juge : le jour ou la regle change, elle change dans `MotDePasse` et ce
 * fichier ne bouge pas.
 *
 * `null` ET `''` NE SONT PAS JUGES ICI, ET C'EST DELIBERE. Une contrainte
 * Symfony ne doit pas doubler `NotBlank` : sur un `PATCH` qui ne touche pas au
 * mot de passe, `motDePasseClair` vaut `null` et il n'y a rien a valider.
 * « Un compte ne nait pas sans mot de passe » est une regle differente, et elle
 * a deja son gardien dans `UtilisateurProcessor` — avec sa propre date de
 * panne (constat F-06).
 */
final class MotDePasseSolideValidator extends ConstraintValidator
{
    public function validate(mixed $value, Constraint $constraint): void
    {
        if (!$constraint instanceof MotDePasseSolide) {
            throw new UnexpectedTypeException($constraint, MotDePasseSolide::class);
        }

        if (null === $value || '' === $value) {
            return;
        }

        if (!\is_string($value)) {
            throw new UnexpectedTypeException($value, 'string');
        }

        $pourquoi = MotDePasse::pourquoiRefuse($value);
        if (null === $pourquoi) {
            return;
        }

        $this->context->buildViolation($constraint->message)
            ->setParameter('{{ manque }}', $pourquoi)
            ->addViolation();
    }
}
