<?php

declare(strict_types=1);

namespace App\Service;

use Psr\Log\LoggerInterface;
use Symfony\Contracts\HttpClient\Exception\ExceptionInterface;
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
    private const CHAMPS = ['cat', 'kcal100', 'prot100', 'gluc100', 'lip100', 'ratio'];

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

        $produits = $this->appeler('/objects/products');
        $stocks = $this->appeler('/stock');
        $emplacements = $this->appeler('/objects/locations');

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
                etatReference: \in_array($categorie, ['prot', 'fec'], true) ? 'cru' : 'cuit',
                stock: $quantites[$id] ?? 0.0,
                emplacement: $parEmplacement[(int) ($produit['location_id'] ?? 0)] ?? null,
                peseeAvant: isset($champs['pesee_avant']) && '' !== $champs['pesee_avant']
                    ? (float) $champs['pesee_avant'] : null,
                peseeApres: isset($champs['pesee_apres']) && '' !== $champs['pesee_apres']
                    ? (float) $champs['pesee_apres'] : null,
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
            $manquants = \array_diff(self::CHAMPS, \array_keys(\array_filter(
                $champs, static fn ($v) => null !== $v && '' !== $v)));
            if ([] !== $manquants) {
                $incomplets[] = [
                    'reference' => 'grocy:' . $produit['id'],
                    'nom' => (string) $produit['name'],
                    'manquants' => \array_values($manquants),
                ];
            }
        }

        return $incomplets;
    }

    /** Ecrit les valeurs nutritionnelles d'un produit. */
    public function enregistrer(int $idProduit, array $valeurs): void
    {
        $this->appeler('/userfields/products/' . $idProduit, 'PUT', $valeurs);
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
