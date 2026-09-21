<?php

declare(strict_types=1);

namespace App\OpenApi;

use ApiPlatform\OpenApi\Factory\OpenApiFactoryInterface;
use ApiPlatform\OpenApi\Model\Operation;
use ApiPlatform\OpenApi\Model\PathItem;
use ApiPlatform\OpenApi\Model\RequestBody;
use ApiPlatform\OpenApi\Model\Response;
use ApiPlatform\OpenApi\OpenApi;
use App\Service\ModesDeTravail;
use Symfony\Component\DependencyInjection\Attribute\AsDecorator;
use Symfony\Component\DependencyInjection\Attribute\AutowireDecorated;

/**
 * LES CINQ ROUTES DU METIER SERVI A L'ECRAN, DANS LE CONTRAT DE L'API.
 *
 * POURQUOI CA COMPTE ICI PLUS QU'AILLEURS. La refonte des 20 et 21 septembre
 * 2026 a deplace le metier vers le serveur pour une raison precise, dans les
 * mots du proprietaire : « comme ca je peux changer le front quand bon me
 * semble ». Un front ecrit demain dans une autre technologie doit donc
 * DECOUVRIR ces routes — or elles sont des controleurs Symfony ordinaires, et
 * API Platform ne documente que ses propres ressources. Elles etaient
 * invisibles dans `/api/docs` : le metier avait bien quitte le front, mais son
 * mode d'emploi n'existait nulle part.
 *
 * LA TROISIEME A ETE OUBLIEE LE JOUR DE SA CREATION — `GET /api/modes-de-travail`,
 * releve par `revue-pile` le 21 septembre 2026. Cet en-tete disait « LES DEUX »
 * et la liste en portait deux : le jumeau oublie, applique au contrat. C'etait
 * la pire des trois a manquer — un front ecrit demain decouvrait comment juger
 * un aliment et un mot de passe, mais PAS la regle du chrono, la seule sans
 * laquelle son compteur « 7 sur 12 » est faux.
 *
 * LE MEME PROCEDE QUE LE BUNDLE JWT, qui fait exactement cela pour
 * `/api/connexion` — seule route hors API Platform a figurer dans le contrat
 * avant aujourd'hui. On se decore derriere lui : les deux ajouts coexistent.
 *
 * CE QUI N'EST TOUJOURS PAS DOCUMENTE : la famille `/api/mon-frigo/*`, elle
 * aussi ecrite en controleurs. Constat pose le 21 septembre 2026, non corrige —
 * le dire vaut mieux que laisser croire que le contrat est complet.
 */
#[AsDecorator('api_platform.openapi.factory')]
final readonly class VerificationDansOpenApi implements OpenApiFactoryInterface
{
    public function __construct(
        #[AutowireDecorated] private OpenApiFactoryInterface $interne,
    ) {
    }

    /** @param array<string, mixed> $contexte */
    public function __invoke(array $contexte = []): OpenApi
    {
        $openApi = ($this->interne)($contexte);
        $chemins = $openApi->getPaths();

        $chemins->addPath('/api/verification/aliment', new PathItem(post: new Operation(
            operationId: 'verifierAliment',
            tags: ['Vérification'],
            summary: 'Le verdict d\'un aliment en cours de saisie.',
            description: <<<'TXT'
                Rend TOUT ce que l'écran doit afficher : les refus, les
                avertissements, la phrase de résumé, la couleur du bandeau, la
                conversion kilojoules proposée, et si la fiche est enregistrable.

                AUCUN CHAMP N'EST OBLIGATOIRE : le serveur répond avec ce qu'il a.
                L'écran appelle dès la première frappe, avec un anti-rebond — un
                appel par PAUSE de frappe, pas par caractère.

                LES NOMBRES SONT ENVOYÉS TELS QU'ILS SONT TAPÉS, en texte : la
                virgule française est un séparateur décimal, et « 4,2,1 » n'est
                pas un nombre. Un champ vide veut dire « je ne sais pas », un
                « 0 » veut dire zéro — ne jamais substituer l'un à l'autre.
                TXT,
            requestBody: new RequestBody(
                description: 'La saisie en cours, champs en texte.',
                content: new \ArrayObject(['application/json' => [
                    'schema' => self::schemaSaisie(),
                    'example' => [
                        'nom' => 'Riz basmati', 'categorie' => 'fec',
                        'kcal100' => '350', 'prot100' => '7', 'gluc100' => '78',
                        'lip100' => '0,6', 'fibres100' => '1,4', 'ratio' => '2,26',
                    ],
                ]]),
            ),
            responses: [
                /* DES OBJETS `Response`, PAS DES TABLEAUX. Les deux produisent
                   le meme JSON — mesure le 21 septembre 2026 — mais la
                   signature attend `array<Reference|Response>`, et PHPStan le
                   dit. Un contrat respecte a l'execution seulement est un
                   contrat qui cassera a la prochaine montee de version. */
                '200' => new Response(
                    'Le verdict. Un 200 ne veut PAS dire « accepté » : lire `enregistrable`.',
                    new \ArrayObject(['application/json' => ['schema' => self::schemaVerdict()]]),
                ),
                '401' => new Response('Route authentifiée : elle répond sur des règles métier.'),
            ],
        )));

        $chemins->addPath('/api/verification/cible', new PathItem(post: new Operation(
            operationId: 'verifierCible',
            tags: ['Vérification'],
            summary: 'L\'écart entre les calories annoncées et ce que les grammes peuvent donner.',
            description: <<<'TXT'
                ELLE AVERTIT, ELLE NE REFUSE PAS. C'est la différence avec la
                validation d'une cible à l'écriture, qui ne refuse qu'une erreur
                d'unité (des kilojoules pris pour des calories). Ici, quelqu'un
                recopie un plan de coach qui ne tombe pas juste : on le lui dit,
                et on le laisse enregistrer.

                EN GLUCIDES TOTAUX (convention nord-américaine, fibres comprises
                dans les glucides), les mêmes grammes couvrent un INTERVALLE de
                calories — de 2 kcal/g pour les fibres à 4 kcal/g sans aucune
                fibre. Une cible qui tombe dedans est atteignable, et la réponse
                est alors muette.

                AUCUN CHAMP N'EST OBLIGATOIRE : l'écran appelle dès la première
                frappe, et ce qui manque vaut zéro gramme.
                TXT,
            requestBody: new RequestBody(
                content: new \ArrayObject(['application/json' => [
                    'schema' => [
                        'type' => 'object',
                        'properties' => [
                            'kcal' => ['type' => 'number', 'description' => 'Les calories annoncées.'],
                            'prot' => ['type' => 'number', 'description' => 'Grammes de protéines.'],
                            'gluc' => ['type' => 'number', 'description' => 'Grammes de glucides.'],
                            'lip' => ['type' => 'number', 'description' => 'Grammes de lipides.'],
                            'glucidesTotaux' => [
                                'type' => 'boolean',
                                'description' => 'Les glucides annoncés comprennent-ils les fibres.',
                            ],
                        ],
                    ],
                    'example' => ['kcal' => 710, 'prot' => 40, 'gluc' => 100, 'lip' => 20,
                        'glucidesTotaux' => false],
                ]]),
            ),
            responses: [
                '200' => new Response(
                    'La phrase à afficher telle quelle, ou `null` quand il n\'y a rien à dire.',
                    new \ArrayObject(['application/json' => ['schema' => [
                        'type' => 'object',
                        'properties' => [
                            'avertissement' => [
                                'type' => 'string',
                                'nullable' => true,
                                'example' => 'Tes grammes représentent 740 calories, pas 710. '
                                    . 'L\'app respecte les grammes ; les calories suivent.',
                            ],
                        ],
                        'required' => ['avertissement'],
                    ]]]),
                ),
                '401' => new Response('Route authentifiée : elle répond sur des règles métier.'),
            ],
        )));

        $chemins->addPath('/api/verification/plan-coach', new PathItem(post: new Operation(
            operationId: 'convertirPlanCoach',
            tags: ['Vérification'],
            summary: 'Un plan de coach américain, converti en convention européenne.',
            description: <<<'TXT'
                LES PLANS AMÉRICAINS COMPTENT LES FIBRES DANS LES GLUCIDES
                (MyFitnessPal, USDA, la plupart des coachs anglophones).
                L'application les compte à part, à 2 kcal/g. Recopier un plan
                sans le convertir laisse donc les glucides trop hauts.

                LES GRAMMES D'ABORD, LES CALORIES ENSUITE — et sur ces grammes-là,
                arrondis au dixième. Ce qui est affiché est ce qui sera pesé.

                `avertissement` signale des fibres sous-estimées, c'est-à-dire un
                champ que le plan n'a pas rempli plutôt qu'une valeur. Il
                n'interdit rien : rien n'est déduit des fibres déclarées par le
                plan, le calculateur retranche celles des aliments, qui sont
                connues.

                ON NE DEVINE PAS LA CONVENTION, ON LA DEMANDE. Une détection
                automatique a été tentée et retirée : les calories d'un plan
                viennent des étiquettes, pas d'un calcul, et la comparaison ne
                mesurait que du bruit.
                TXT,
            requestBody: new RequestBody(
                content: new \ArrayObject(['application/json' => [
                    'schema' => [
                        'type' => 'object',
                        'properties' => [
                            'kcal' => ['type' => 'number', 'description' => 'Les calories que le plan annonce.'],
                            'prot' => ['type' => 'number'],
                            'gluc' => ['type' => 'number', 'description' => 'Glucides TOTAUX, fibres comprises.'],
                            'lip' => ['type' => 'number'],
                            'fibres' => ['type' => 'number', 'description' => 'Les fibres que le plan déclare.'],
                        ],
                    ],
                    'example' => ['kcal' => 578.6, 'prot' => 26.8, 'gluc' => 64.7,
                        'lip' => 25.9, 'fibres' => 3.5],
                ]]),
            ),
            responses: [
                '200' => new Response(
                    'La cible en convention européenne, et la phrase à afficher s\'il y en a une.',
                    new \ArrayObject(['application/json' => ['schema' => [
                        'type' => 'object',
                        'properties' => [
                            'cible' => [
                                'type' => 'object',
                                'properties' => [
                                    'prot' => ['type' => 'number'],
                                    'gluc' => ['type' => 'number', 'description' => 'Fibres retranchées.'],
                                    'lip' => ['type' => 'number'],
                                    'fibres' => ['type' => 'number', 'description' => 'Ce qui a été retranché.'],
                                    'kcal' => ['type' => 'number', 'description' => 'Recalculées sur les grammes rendus.'],
                                    'kcalAnnoncees' => ['type' => 'number', 'description' => 'Ce que le plan disait.'],
                                ],
                            ],
                            'avertissement' => ['type' => 'string', 'nullable' => true],
                        ],
                        'required' => ['cible', 'avertissement'],
                    ]]]),
                ),
                '401' => new Response('Route authentifiée : elle répond sur des règles métier.'),
            ],
        )));

        $chemins->addPath('/api/verification/mot-de-passe', new PathItem(post: new Operation(
            operationId: 'verifierMotDePasse',
            tags: ['Vérification'],
            summary: 'La jauge d\'un mot de passe en cours de frappe.',
            description: <<<'TXT'
                PUBLIQUE, ET IL LE FAUT : l'écran d'invitation juge la force d'un
                mot de passe alors que personne n'a encore de compte.

                ELLE NE JOURNALISE RIEN ET NE STOCKE RIEN. Le mot de passe passe
                par le corps d'un POST, sur le même canal chiffré que l'envoi du
                formulaire — qui le transmet de toute façon.

                BORNÉE À 120 APPELS PAR MINUTE ET PAR ADRESSE IP, parce que toute
                route ouverte doit l'être. La limite est large exprès : elle part
                à chaque pause de frappe, et un garde-fou qui gêne l'usage normal
                finit désactivé.
                TXT,
            requestBody: new RequestBody(
                content: new \ArrayObject(['application/json' => [
                    'schema' => [
                        'type' => 'object',
                        'properties' => ['motDePasse' => ['type' => 'string']],
                        'required' => ['motDePasse'],
                    ],
                    'example' => ['motDePasse' => 'un mot de passe en cours de frappe'],
                ]]),
            ),
            responses: [
                '200' => new Response(
                    'La jauge, les manquements, et la phrase à afficher.',
                    new \ArrayObject(['application/json' => ['schema' => self::schemaJauge()]]),
                ),
                '429' => new Response(
                    'Trop d\'appels depuis cette adresse. `Retry-After` dit quand réessayer.',
                    new \ArrayObject(['application/json' => ['schema' => [
                        'type' => 'object',
                        'properties' => [
                            'dit' => ['type' => 'string'],
                            'reessayerDansSecondes' => ['type' => 'integer'],
                        ],
                    ]]]),
                ),
            ],
        )));

        $chemins->addPath('/api/modes-de-travail', new PathItem(get: new Operation(
            operationId: 'modesDeTravail',
            tags: ['Vérification'],
            summary: 'Combien de séries comptent, selon la façon dont on travaille.',
            description: <<<'TXT'
                LA RÈGLE DU CHRONO, ET RIEN D'AUTRE. Un exercice « for time » n'a
                qu'un temps total : ses lignes supplémentaires notent le détail,
                ce ne sont pas des séries à faire. Les autres modes comptent
                toutes les leurs.

                POURQUOI UN ÉCRAN A BESOIN DE LA RÈGLE, et pas seulement du
                résultat. `seance.avancement` donne déjà le compte, mais l'écran
                d'une séance est autoritaire sur son état local : on y ajoute un
                exercice, on supprime une ligne, on bascule un mode, et le
                compteur doit suivre le geste SANS aller-retour réseau, hors
                ligne compris.

                NE PAS SERVIR UN POIDS PAR SÉRIE À LA PLACE. Essayé le
                21 septembre 2026, et faux : un poids par ligne est dérivé du
                mode et du rang, les deux choses que l'écran modifie seul.
                Ajouter un exercice « for time » affichait 0/3 là où le serveur
                dirait 0/1. Une donnée indexée sur le MODE, elle, survit au geste.

                ELLE NE CHANGE QU'AVEC UNE VERSION DU SERVEUR : la demander une
                fois par session suffit.
                TXT,
            responses: [
                '200' => new Response(
                    'Le catalogue des façons de travailler.',
                    new \ArrayObject(['application/json' => [
                        'schema' => [
                            'type' => 'array',
                            'items' => [
                                'type' => 'object',
                                'properties' => [
                                    'cle' => ['type' => 'string', 'enum' => ModesDeTravail::cles()],
                                    'seriesQuiComptent' => [
                                        'type' => 'integer', 'nullable' => true, 'minimum' => 1,
                                        'description' => 'Combien de séries comptent. `null` veut dire « toutes ».',
                                    ],
                                ],
                                'required' => ['cle', 'seriesQuiComptent'],
                            ],
                        ],
                        'example' => ModesDeTravail::catalogue(),
                    ]]),
                ),
                '401' => new Response('Route authentifiée.'),
            ],
        )));

        return $openApi->withPaths($chemins);
    }

    // ---------------------------------------------------------------- schemas

    /** @return array<string, mixed> */
    private static function schemaSaisie(): array
    {
        $texte = ['type' => 'string', 'description' => 'Tel que tapé. Vide = « je ne sais pas ».'];

        return [
            'type' => 'object',
            'properties' => [
                'nom' => ['type' => 'string'],
                'categorie' => [
                    'type' => 'string',
                    'description' => 'fec, prot, leg, fruit, mg, sucre, boisson, autre.',
                ],
                'kcal100' => $texte, 'prot100' => $texte, 'gluc100' => $texte,
                'lip100' => $texte, 'fibres100' => $texte,
                'ratio' => ['type' => 'string', 'description' => 'Rendement cru/cuit. 1 = pas de cuisson.'],
                'ratioCandidat' => ['type' => 'string', 'description' => 'Le rendement issu de deux pesées en cours.'],
                'origine' => [
                    'type' => 'object',
                    'description' => 'Ce que la fiche portait DÉJÀ, sur une correction. '
                        . 'Le serveur ne le lit pas en base : l\'écran le déclare. Sans lui, '
                        . 'un aliment incohérent déjà enregistré ne pourrait plus être renommé.',
                ],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private static function schemaVerdict(): array
    {
        $griefs = [
            'type' => 'array',
            'items' => [
                'type' => 'object',
                'properties' => [
                    'champ' => ['type' => 'string', 'description' => 'Pour que l\'écran puisse souligner.'],
                    'message' => ['type' => 'string'],
                ],
            ],
        ];

        return [
            'type' => 'object',
            'properties' => [
                'refus' => $griefs,
                'avertissements' => $griefs,
                'resume' => ['type' => 'string', 'description' => 'La phrase du bandeau, telle que le serveur la formule.'],
                'verdict' => [
                    'type' => 'string',
                    'enum' => ['coherent', 'ecart', 'incoherent', 'indecidable'],
                    'description' => 'La teinte du bandeau est une DÉCISION du serveur, pas un style du front.',
                ],
                'conversion' => [
                    'type' => 'object', 'nullable' => true,
                    'description' => 'Une conversion kJ vers kcal à PROPOSER. À ne pas confondre avec un refus.',
                    'properties' => [
                        'saisi' => ['type' => 'number'],
                        'converti' => ['type' => 'number'],
                        'motif' => ['type' => 'string', 'enum' => ['plafond', 'rapport']],
                    ],
                ],
                'candidat' => [
                    'type' => 'object', 'nullable' => true,
                    'description' => 'Le rendement qu\'on vient de mesurer, jugé à part.',
                    'properties' => [
                        'acceptable' => ['type' => 'boolean'],
                        'motif' => ['type' => 'string', 'nullable' => true],
                    ],
                ],
                'enregistrable' => [
                    'type' => 'boolean',
                    'description' => 'La seule réponse à « puis-je enregistrer ». Le serveur refusera aussi à l\'écriture.',
                ],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private static function schemaJauge(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'manquements' => [
                    'type' => 'array', 'items' => ['type' => 'string'],
                    'description' => 'Les clés de ce qui manque : longueur, majuscule, chiffre…',
                ],
                'exigences' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'cle' => ['type' => 'string'],
                            'texte' => ['type' => 'string'],
                            'remplie' => ['type' => 'boolean'],
                        ],
                    ],
                ],
                'dit' => [
                    'type' => 'string',
                    'description' => 'LA PHRASE, pas seulement les clés — l\'écran n\'a plus à traduire '
                        . '« longueur » en « douze caractères », et ne peut donc plus se tromper de chiffre.',
                ],
                'acceptable' => ['type' => 'boolean'],
                'force' => ['type' => 'integer', 'description' => 'De 0 à 4.'],
                'motDeLaForce' => ['type' => 'string', 'description' => 'Le mot affiché sous la jauge.'],
            ],
        ];
    }
}
