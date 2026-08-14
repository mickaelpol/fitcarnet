<?php

declare(strict_types=1);

namespace App\Service;

use Psr\Log\LoggerInterface;
use Symfony\Contracts\HttpClient\Exception\ExceptionInterface;
use Symfony\Contracts\HttpClient\Exception\HttpExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Lit les aliments et les stocks depuis Grocy.
 *
 * Grocy ne stocke aucune valeur nutritionnelle nativement : elles vivent dans
 * des champs personnalises poses par le script ciqual_vers_grocy.py. Un produit
 * sans ces champs est ignore — mieux vaut l'absence qu'une valeur inventee, qui
 * fausserait un repas sans que rien ne le signale.
 */
final readonly class FrigoGrocy
{
    /** Sans l'un de ces champs, l'aliment ne peut PAS entrer dans un calcul. */
    private const CHAMPS = ['cat', 'kcal100', 'prot100', 'gluc100', 'lip100', 'ratio'];

    /**
     * Les fibres ne bloquent pas, mais leur absence n'est plus anodine.
     *
     * Un aliment sans fibres reste parfaitement utilisable tant que les
     * cibles sont en convention europeenne. Il devient faux des que la cible
     * est exprimee en glucides TOTAUX : l'application lit alors zero fibre,
     * vise trop haut, et rien ne le signale — le silence est le probleme.
     *
     * On le rapporte donc a part, sans jamais ecarter l'aliment du frigo.
     */
    private const CHAMPS_SOUHAITES = ['fibres100'];

    /**
     * Grocy refuse un inventaire qui annonce la quantite DEJA en stock.
     *
     * Ce n'est pas une erreur de notre cote, c'est un « c'etait deja fait ».
     * On le reconnait au texte parce que Grocy ne donne rien d'autre : meme
     * code 400 que pour un produit inexistant, meme forme de reponse. Le
     * message vient de `StockService::InventoryProduct` — verifie dans le
     * conteneur, pas suppose :
     *
     *     if ($newAmount == $productDetails->stock_amount + $containerWeight)
     *         throw new \Exception('The new amount cannot equal the current stock amount');
     *
     * SI UNE MONTEE DE VERSION DE GROCY CHANGE CE TEXTE, la consequence est
     * douce et visible : ces lignes redeviennent des echecs affiches. Pas de
     * perte de donnee, juste un message a corriger ici. C'est pour ca qu'on
     * ne garde que le fragment stable de la phrase, sans « The new amount »
     * ni ponctuation.
     */
    private const DEJA_A_JOUR = 'cannot equal the current stock amount';

    public function __construct(
        private HttpClientInterface $http,
        private LoggerInterface $journal,
        private string $url,
        private string $cle,
    ) {
    }

    public function estConfigure(): bool
    {
        return '' !== $this->url && '' !== $this->cle;
    }

    /** @return AlimentDisponible[] */
    public function lire(): array
    {
        if (!$this->estConfigure()) {
            throw new \RuntimeException(
                "Grocy n'est pas configuré : renseigne GROCY_URL et GROCY_API_KEY.");
        }

        /* CINQ APPELS, L'UN APRES L'AUTRE — ET C'EST VOLONTAIRE.
         *
         * On a essaye de les lancer ensemble : le temps de reponse est passe
         * de 6,25 s a 29 s, mesure en production. Grocy est une application
         * PHP servie par tres peu de processus ; cinq requetes simultanees ne
         * s'y executent pas en parallele, elles y font la queue tout en tenant
         * cinq connexions ouvertes de notre cote.
         *
         * Pire : chaque appel de cet ecran monopolise un des huit fils de
         * FrankenPHP pendant tout ce temps. Trois ouvertures du frigo
         * suffisaient a en bloquer six, et TOUT le reste de l'API ralentissait
         * — `/api/utilisateurs` est passe de 0,05 s a 3,3 s le meme jour.
         *
         * SI QUELQU'UN VEUT REESSAYER : mesurer d'abord Grocy seul, appel par
         * appel, puis en parallele. La reponse est dans son temps a lui, pas
         * dans la facon dont on l'appelle. */
        $produits = $this->appeler('/objects/products');
        $stocks = $this->appeler('/stock');
        $emplacements = $this->appeler('/objects/locations');
        $unites = $this->appeler('/objects/quantity_units');
        $conversions = $this->appeler('/objects/quantity_unit_conversions_resolved');

        $parUnite = [];
        $idGramme = null;
        foreach ($unites as $u) {
            $abrege = self::normaliserUnite((string) $u['name']);
            $parUnite[(int) $u['id']] = $abrege;
            if ('g' === $abrege) {
                $idGramme = (int) $u['id'];
            }
        }

        // produit => unite de depart => facteur vers le gramme
        $versGramme = [];
        foreach ($conversions as $c) {
            if (null === $idGramme || (int) ($c['to_qu_id'] ?? 0) !== $idGramme) {
                continue;
            }
            $versGramme[(int) ($c['product_id'] ?? 0)][(int) ($c['from_qu_id'] ?? 0)]
                = (float) ($c['factor'] ?? 0);
        }

        $parEmplacement = [];
        foreach ($emplacements as $e) {
            $parEmplacement[(int) $e['id']] = (string) $e['name'];
        }

        $quantites = [];
        foreach ($stocks as $s) {
            $quantites[(int) $s['product_id']] = (float) $s['amount'];
        }

        $aliments = [];
        $sansMacros = [];

        foreach ($produits as $produit) {
            $id = (int) $produit['id'];
            $uniteStock = (int) ($produit['qu_id_stock'] ?? 0);
            $champs = self::champsDe($produit);

            $manquants = \array_diff(self::CHAMPS, \array_keys(\array_filter(
                $champs, static fn ($v) => null !== $v && '' !== $v)));
            if ([] !== $manquants) {
                $sansMacros[] = $produit['name'];
                continue;
            }

            $categorie = (string) $champs['cat'];

            $aliments[] = new AlimentDisponible(
                reference: 'grocy:' . $id,
                nom: (string) $produit['name'],
                categorie: $categorie,
                kcal100: (float) $champs['kcal100'],
                prot100: (float) $champs['prot100'],
                gluc100: (float) $champs['gluc100'],
                lip100: (float) $champs['lip100'],
                fibres100: isset($champs['fibres100']) && '' !== $champs['fibres100']
                    ? (float) $champs['fibres100'] : null,
                ratio: (float) $champs['ratio'] ?: 1.0,
                /* Il n'y a plus d'etat de reference a decider ici, ni nulle
                   part ailleurs. Pour memoire, l'erreur qu'il fallait eviter
                   quand il existait : les feculents etaient apparies a leur
                   etat CUIT — « Riz blanc, cuit ». Les declarer crus faisait
                   lire les macros du riz cuit comme si elles valaient pour du
                   riz sec, et l'application annoncait 220 g a peser pour 73 g
                   de glucides quand 220 g de riz SEC en apportent 165. Plus du
                   double, sans un mot.

                   Les produits Grocy portent desormais les valeurs du produit
                   PESE — le riz sec a 350 kcal, pas le riz cuit a 99. La
                   conversion a ete faite une fois pour toutes par
                   `ciqual_vers_grocy.py --convertir-en-pese`. */
                stock: $quantites[$id] ?? 0.0,
                emplacement: $parEmplacement[(int) ($produit['location_id'] ?? 0)] ?? null,
                peseeAvant: isset($champs['pesee_avant']) && '' !== $champs['pesee_avant']
                    ? (float) $champs['pesee_avant'] : null,
                peseeApres: isset($champs['pesee_apres']) && '' !== $champs['pesee_apres']
                    ? (float) $champs['pesee_apres'] : null,
                unite: $parUnite[$uniteStock] ?? '?',
                grammesParUnite: $uniteStock === $idGramme
                    ? 1.0
                    : ($versGramme[$id][$uniteStock] ?? null),
            );
        }

        if ([] !== $sansMacros) {
            $this->journal->info('Produits Grocy sans valeurs nutritionnelles, ignorés.', [
                'nombre' => \count($sansMacros),
                'exemples' => \array_slice($sansMacros, 0, 5),
            ]);
        }

        \usort($aliments, static fn ($a, $b) => \strcasecmp($a->nom, $b->nom));

        return $aliments;
    }

    /** Les produits sans macros, pour que l'application puisse les signaler. */
    public function produitsIncomplets(): array
    {
        if (!$this->estConfigure()) {
            return [];
        }

        $incomplets = [];
        foreach ($this->appeler('/objects/products') as $produit) {
            $champs = self::champsDe($produit);
            $renseignes = \array_keys(\array_filter(
                $champs, static fn ($v) => null !== $v && '' !== $v));

            $manquants = \array_diff(self::CHAMPS, $renseignes);
            $souhaites = \array_diff(self::CHAMPS_SOUHAITES, $renseignes);

            if ([] === $manquants && [] === $souhaites) {
                continue;
            }

            $incomplets[] = [
                'reference' => 'grocy:' . $produit['id'],
                'nom' => (string) $produit['name'],
                'manquants' => \array_values($manquants),
                /* Distingues des precedents : l'aliment reste utilisable, mais
                   fausse une cible exprimee en glucides totaux. */
                'souhaites' => \array_values($souhaites),
            ];
        }

        return $incomplets;
    }

    /** Ecrit les valeurs nutritionnelles d'un produit. */
    /**
     * CREE un produit dans Grocy et rend son identifiant.
     *
     * Jusqu'ici l'application savait remplir les valeurs d'un produit, jamais
     * en creer un : il fallait ouvrir Grocy, ajouter le produit, revenir dans
     * l'app, saisir les macros. Deux outils pour un geste. Grocy reste le
     * maitre de l'inventaire — c'est lui qui sort la liste de courses — mais
     * rien n'oblige a passer par son interface pour y poser une ligne.
     *
     * TROIS CHOSES QUE GROCY EXIGE, ET QU'IL FAUT DEVINER PROPREMENT.
     *
     * Un produit ne peut exister sans emplacement ni unite. On ne les invente
     * pas : on lit ce qui est deja configure, et on refuse clairement si la
     * base Grocy n'a pas de quoi repondre. Un produit cree avec une unite au
     * hasard serait pire qu'un refus — les valeurs nutritionnelles sont pour
     * 100 g, et le calculateur ecarte silencieusement tout ce qui n'est pas
     * convertible en grammes.
     *
     * Le nom en double est refuse ici plutot que laisse a Grocy : lui accepte
     * deux produits homonymes sans broncher, et le frigo afficherait alors
     * deux lignes identiques dont une seule porte les macros.
     */
    public function creerProduit(string $nom): int
    {
        if (!$this->estConfigure()) {
            throw new \RuntimeException(
                "Grocy n'est pas configuré : renseigne GROCY_URL et GROCY_API_KEY.");
        }

        $nom = \trim($nom);
        if ('' === $nom) {
            throw new \RuntimeException('Le nom est obligatoire.');
        }

        $repere = self::repere($nom);
        foreach ($this->appeler('/objects/products') as $produit) {
            if (self::repere((string) ($produit['name'] ?? '')) === $repere) {
                throw new \RuntimeException(\sprintf(
                    '« %s » existe déjà dans Grocy. Ouvre-le pour corriger ses valeurs.',
                    (string) $produit['name']));
            }
        }

        $idGramme = null;
        foreach ($this->appeler('/objects/quantity_units') as $unite) {
            if ('g' === self::normaliserUnite((string) ($unite['name'] ?? ''))) {
                $idGramme = (int) $unite['id'];
                break;
            }
        }
        if (null === $idGramme) {
            throw new \RuntimeException(
                "Grocy n'a pas d'unité « gramme ». Crée-la dans Grocy avant "
                . 'd\'ajouter un aliment : les valeurs nutritionnelles sont '
                . 'pour 100 g, et le calculateur écarte tout ce qui ne se '
                . 'convertit pas en grammes.');
        }

        $emplacements = $this->appeler('/objects/locations');
        if ([] === $emplacements) {
            throw new \RuntimeException(
                "Grocy n'a aucun emplacement. Crée-en un (« Frigo », "
                . '« Placard »…) avant d\'ajouter un aliment.');
        }
        /* Le premier emplacement fait un defaut acceptable : le produit est
           visible tout de suite, et l'utilisateur le deplace dans Grocy si ce
           n'est pas le bon. Mieux vaut un rangement approximatif qu'un
           formulaire de plus a remplir pour ajouter du poulet. */
        $idEmplacement = (int) $emplacements[0]['id'];

        $cree = $this->appeler('/objects/products', 'POST', [
            'name' => $nom,
            'location_id' => $idEmplacement,
            'qu_id_purchase' => $idGramme,
            'qu_id_stock' => $idGramme,
        ]);

        $id = (int) ($cree['created_object_id'] ?? 0);
        if ($id <= 0) {
            throw new \RuntimeException(
                'Grocy a accepté la création sans rendre d\'identifiant. '
                . 'Vérifie dans Grocy si le produit existe avant de recommencer.');
        }

        return $id;
    }

    /** Un nom réduit à ce qui permet de reconnaître un doublon. */
    private static function repere(string $nom): string
    {
        $sansAccent = \strtr(\mb_strtolower(\trim($nom)),
            ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e',
             'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u',
             'û' => 'u', 'ü' => 'u', 'ç' => 'c']);

        return (string) \preg_replace('/[^a-z0-9]+/', ' ', $sansAccent);
    }

    /**
     * Les champs personnalises que cette classe ecrit, et leur libelle Grocy.
     *
     * Grocy REFUSE LE LOT ENTIER si une seule cle lui est inconnue, avec un
     * 400 laconique — « Field source_valeurs is not a valid userfield of the
     * given entity ». C'est deja arrive une fois en production, et ca a
     * coute une soiree. On ne compte donc plus sur un script tiers pour les
     * poser : la classe qui ecrit est celle qui s'assure qu'ils existent.
     */
    private const CHAMPS_ECRITS = [
        'cat' => ['Catégorie', 'text-single-line'],
        'kcal100' => ['kcal / 100 g', 'number-decimal'],
        'prot100' => ['Protéines / 100 g', 'number-decimal'],
        'gluc100' => ['Glucides / 100 g', 'number-decimal'],
        'lip100' => ['Lipides / 100 g', 'number-decimal'],
        'fibres100' => ['Fibres / 100 g', 'number-decimal'],
        'ratio' => ['Ratio cuit / cru', 'number-decimal'],
        'pesee_avant' => ['Poids avant cuisson (g)', 'number-decimal'],
        'pesee_apres' => ['Poids apres cuisson (g)', 'number-decimal'],
        'source_valeurs' => ['Source des valeurs', 'text-single-line'],
    ];

    /** Cree les champs personnalises absents. Rend ceux qui manquaient. */
    public function assurerLesChamps(): array
    {
        $existants = [];
        foreach ($this->appeler('/objects/userfields') as $champ) {
            if ('products' === ($champ['entity'] ?? '')) {
                $existants[] = (string) $champ['name'];
            }
        }

        $poses = [];
        foreach (self::CHAMPS_ECRITS as $nom => [$libelle, $type]) {
            if (\in_array($nom, $existants, true)) continue;
            $this->appeler('/objects/userfields', 'POST', [
                'entity' => 'products', 'name' => $nom, 'caption' => $libelle,
                'type' => $type, 'show_as_column_in_tables' => 0,
            ]);
            $poses[] = $nom;
        }

        return $poses;
    }

    public function enregistrer(int $idProduit, array $valeurs): void
    {
        $this->appeler('/userfields/products/' . $idProduit, 'PUT', $valeurs);
    }

    /**
     * Ecrit les valeurs nutritionnelles saisies dans l'application.
     *
     * Les cles posees ici sont exactement celles que relit champsDe() : en
     * changer une sans l'autre rendrait le produit invisible au calculateur,
     * puisqu'un champ manquant le fait ecarter.
     *
     * Une valeur absente est ecrite vide plutot qu'omise : Grocy conserve
     * l'ancienne valeur des cles non transmises, donc effacer une fibre
     * saisie par erreur serait impossible autrement.
     */
    public function enregistrerValeurs(
        int $idProduit,
        string $categorie,
        float $kcal100,
        float $prot100,
        float $gluc100,
        float $lip100,
        ?float $fibres100,
        float $ratio,
        ?float $peseeAvant,
        ?float $peseeApres,
    ): void {
        if (!$this->estConfigure()) {
            throw new \RuntimeException(
                "Grocy n'est pas configuré : renseigne GROCY_URL et GROCY_API_KEY.");
        }

        $this->assurerLesChamps();

        $this->enregistrer($idProduit, [
            'cat' => $categorie,
            'kcal100' => (string) $kcal100,
            'prot100' => (string) $prot100,
            'gluc100' => (string) $gluc100,
            'lip100' => (string) $lip100,
            'ratio' => (string) $ratio,
            'fibres100' => null !== $fibres100 ? (string) $fibres100 : '',
            'pesee_avant' => null !== $peseeAvant ? (string) $peseeAvant : '',
            'pesee_apres' => null !== $peseeApres ? (string) $peseeApres : '',
            /* Cette saisie vient de l'utilisateur, et elle le restera : le
               script d'import laisse desormais intact tout produit marque
               « moi ». Aucune table ne bat une etiquette lue sur la boite, et
               Ciqual ne couvre pas tout — il n'a pas de sardine au naturel,
               seulement du cru, du grille et cinq versions a l'huile.

               Sans cette marque, prendre le temps de recopier une etiquette
               ne servait a rien : le prochain import reprenait la main. */
            'source_valeurs' => 'moi',
        ]);
    }

    /**
     * Corrige le stock reel d'UN produit.
     *
     * UN SEUL PRODUIT PAR APPEL, ET C'EST TOUT L'INTERET DE CETTE SIGNATURE.
     *
     * La version precedente prenait un tableau et lancait tous les POST
     * ensemble, en croyant paralleliser. Grocy tourne avec CINQ ouvriers PHP
     * et une base SQLite, qui n'accepte qu'un ecrivain a la fois : rien
     * n'etait parallelise, tout faisait la queue derriere un verrou. Le
     * 14 aout 2026, PHP s'est arrete a 30 s au milieu d'un inventaire de
     * quarante lignes — et Grocy a continue d'appliquer ce qu'il avait deja
     * recu. Le frigo est reste a moitie corrige, sans que rien ne le dise.
     *
     * Une methode qui ne sait traiter qu'une ligne ne peut plus faire ca. La
     * duree totale et l'enchainement regardent l'appelant — en l'occurrence
     * `AppliqueInventaire`, qui tourne HORS d'une requete HTTP et n'a donc
     * aucune minuterie au-dessus de la tete.
     *
     * @return string|null le motif de l'echec, ou null si la ligne est passee
     */
    public function inventorierUn(int $idProduit, float $quantite): ?string
    {
        if (!$this->estConfigure()) {
            throw new \RuntimeException(
                "Grocy n'est pas configuré : renseigne GROCY_URL et GROCY_API_KEY.");
        }

        try {
            $this->http->request(
                'POST',
                \rtrim($this->url, '/') . '/api/stock/products/' . $idProduit . '/inventory',
                [
                    'headers' => [
                        'GROCY-API-KEY' => $this->cle,
                        'Accept' => 'application/json',
                    ],
                    'json' => ['new_amount' => $quantite],
                ],
            )->getContent();   // leve sur 4xx et 5xx
        } catch (ExceptionInterface $e) {
            /* ON LIT LE CORPS DE LA REPONSE, PAS LE MESSAGE DE L'EXCEPTION.
             *
             * Symfony redige le sien : « HTTP 400 returned for "..." ». Il
             * essaie bien d'y glisser l'erreur du serveur, mais en cherchant
             * des cles precises — `error`, `message`, `detail`, `title`. Grocy
             * repond `error_message`, qui n'en fait pas partie. Se fier au
             * message reviendrait donc a chercher un texte qui n'y est jamais.
             *
             * Le corps, lui, contient toujours ce que Grocy a voulu dire. */
            $corps = self::corpsDe($e);

            /* « DEJA A JOUR » N'EST PAS UN ECHEC, ET LE DIRE COUTE CHER.
             *
             * L'ecran n'envoie que les ecarts, mais sa vision du stock peut
             * dater — c'est exactement l'etat ou l'on se trouve apres un envoi
             * interrompu. Afficher ces lignes en rouge pousse a renvoyer
             * l'inventaire, et renvoyer est precisement le geste qui a
             * fabrique le desordre qu'on repare ici. */
            if (\str_contains($corps, self::DEJA_A_JOUR)
                || \str_contains($e->getMessage(), self::DEJA_A_JOUR)) {
                return null;
            }

            /* LE MOTIF PORTE LE TEXTE DE GROCY. Sans lui, l'ecran affichait
               « HTTP 400 returned for https://... » — un code et une adresse,
               rien sur ce qui a ete refuse ni pourquoi. */
            return '' === $corps ? $e->getMessage() : $e->getMessage() . ' — ' . $corps;
        }

        return null;
    }

    /**
     * Le corps de la reponse en erreur, court et sans exploser.
     *
     * Tronque a 200 caracteres : une erreur 500 de Grocy renvoie une page de
     * trace complete — trois kilo-octets vus le 14 aout 2026 — qui remplirait
     * la colonne `echecs` et l'ecran par-dessus le marche.
     */
    private static function corpsDe(ExceptionInterface $e): string
    {
        if (!$e instanceof HttpExceptionInterface) {
            return '';   // panne reseau : il n'y a pas eu de reponse
        }

        try {
            // `false` : ne relance pas l'exception qu'on est en train de traiter
            $corps = \trim($e->getResponse()->getContent(false));
        } catch (\Throwable) {
            return '';
        }

        return \mb_strlen($corps) > 200 ? \mb_substr($corps, 0, 200) . '…' : $corps;
    }

    /**
     * Abrege l'unite Grocy pour l'affichage.
     *
     * Le gramme devient « g », seule unite que le calculateur sait traiter :
     * les valeurs nutritionnelles sont pour 100 g. Les autres gardent leur nom
     * en clair — « Pieces », « Litres » — pour qu'on voie tout de suite que ce
     * produit n'entre pas dans un calcul de macros.
     */
    private static function normaliserUnite(string $nom): string
    {
        return match (\mb_strtolower($nom)) {
            'gramme', 'grammes', 'g' => 'g',
            'kilogramme', 'kilogrammes', 'kg' => 'kg',
            'litre', 'litres', 'l' => 'L',
            'millilitre', 'millilitres', 'ml' => 'mL',
            // Piece, Pack et le reste gardent leur nom en clair : les abreger
            // ferait croire a une unite de masse.
            default => $nom,
        };
    }

    /**
     * Les champs personnalises d'un produit, tels que /objects/products les
     * renvoie deja.
     *
     * Ils etaient auparavant relus un par un sur /userfields/products/{id} :
     * un appel HTTP par produit, soit 62 appels a 1,5 s pour 59 produits, bien
     * au-dela des 30 s de PHP. Grocy les inclut dans la liste, il suffit de les
     * y prendre.
     *
     * @param array<string, mixed> $produit
     *
     * @return array<string, mixed>
     */
    private static function champsDe(array $produit): array
    {
        $champs = $produit['userfields'] ?? null;

        return \is_array($champs) ? $champs : [];
    }

    private function appeler(string $chemin, string $methode = 'GET', ?array $corps = null): array
    {
        try {
            $options = ['headers' => [
                'GROCY-API-KEY' => $this->cle,
                'Accept' => 'application/json',
            ]];
            if (null !== $corps) {
                $options['json'] = $corps;
            }

            $reponse = $this->http->request($methode, \rtrim($this->url, '/') . '/api' . $chemin, $options);
            $contenu = $reponse->getContent();

            return '' === $contenu ? [] : (array) \json_decode($contenu, true, 512, \JSON_THROW_ON_ERROR);
        } catch (ExceptionInterface | \JsonException $e) {
            throw new \RuntimeException(
                \sprintf('Grocy est injoignable sur %s : %s', $chemin, $e->getMessage()), 0, $e);
        }
    }
}
