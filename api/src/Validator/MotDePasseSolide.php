<?php

declare(strict_types=1);

namespace App\Validator;

use Symfony\Component\Validator\Constraint;

/**
 * La contrainte de mot de passe du projet, posee sur l'entite.
 *
 * POURQUOI UNE CONTRAINTE ET PAS UN `Assert\Regex` : parce que la regle n'est
 * pas une expression, c'est une LISTE — et qu'elle doit dire tout ce qui
 * manque, pas s'arreter au premier defaut. Un `Regex` rendrait « invalide »
 * sans jamais dire pourquoi.
 *
 * ET PAS NON PLUS UN CONTROLE DANS LE PROCESSEUR : API Platform valide
 * l'entite AVANT de la passer au processeur, et rend un 422 avec le chemin du
 * champ fautif. Le front sait deja lire cette forme-la ; un refus jete depuis
 * le processeur serait une seconde forme d'erreur pour la meme faute.
 *
 * @see \App\Service\MotDePasse
 */
#[\Attribute(\Attribute::TARGET_PROPERTY)]
final class MotDePasseSolide extends Constraint
{
    /**
     * Le message porte `{{ manque }}`, remplace par la phrase de
     * `MotDePasse::pourquoiRefuse()`. On ne le compose pas ici : la phrase est
     * la meme que celle des deux autres portes, et elle vit avec la regle.
     */
    public string $message = '{{ manque }}';
}
