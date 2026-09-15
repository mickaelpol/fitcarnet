import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poidsDeLaLigne } from './poidsServi';
import { cleDeCuisson, repartition } from './fournees';
import { MODES, RIZ, pour, repas } from './cuisson.test-data';

/* Le riz des fixtures double à la cuisson : `assiette` vaut deux fois
   `aCuire`. Les deux colonnes ne peuvent donc pas se confondre par accident
   dans une attente. */
const RIZ_100 = { aCuire: 100, assiette: 200 };

test('« sans cuisson » sert le poids PESÉ, pas le poids gonflé par le rendement', () => {
  const l = poidsDeLaLigne(RIZ_100, null, 1);

  assert.deepEqual(l, { aPeser: 100, servi: 100, parPersonne: 100 },
    'un aliment marqué « tel quel » ne gonfle pas : il est servi tel qu’on le pèse');
});

test('un mode de cuisson choisi sert bien le poids du plat', () => {
  assert.deepEqual(poidsDeLaLigne(RIZ_100, MODES[0]!, 1),
    { aPeser: 100, servi: 200, parPersonne: 200 });
});

test('« à choisir » ne répond pas à la place de l’utilisateur', () => {
  /* Règle 6 : une clé absente veut dire « personne n’a décidé ». Traiter
     l’indécision comme un « sans cuisson » serait inventer une réponse — et
     `sansCuisson` réclame déjà ce choix à l’écran. C’est l’arbitrage retenu
     dans `repartition`, à l’identique. */
  assert.deepEqual(poidsDeLaLigne(RIZ_100, 'a choisir', 1),
    { aPeser: 100, servi: 200, parPersonne: 200 });
});

test('la portion se prend sur le poids servi, quel qu’il soit', () => {
  assert.equal(poidsDeLaLigne(RIZ_100, null, 4)?.parPersonne, 25);
  assert.equal(poidsDeLaLigne(RIZ_100, MODES[0]!, 4)?.parPersonne, 50);
});

test('zéro convive ne donne pas « Infinity » par personne', () => {
  /* `repartition` écrit `Math.max(1, r.convives)` ; ce module écrivait
     `servi / portions`. À zéro convive la carte annonçait donc `Infinity` g
     quand la boîte annonçait le poids entier — deux réponses pour le même
     aliment du même repas, ce que ce module existe précisément pour empêcher.
     Relevé par la revue le 15 septembre 2026 ; ce témoin est écrit APRÈS coup
     et a été vu échouer en remettant `servi / portions`. */
  assert.equal(poidsDeLaLigne(RIZ_100, null, 0)?.parPersonne, 100);
  assert.equal(poidsDeLaLigne(RIZ_100, MODES[0]!, 0)?.parPersonne, 200);
});

test('rien de servi s’écrit « — » et jamais zéro', () => {
  assert.equal(poidsDeLaLigne(undefined, null, 1), undefined);
  assert.equal(poidsDeLaLigne(undefined, MODES[0]!, 1), undefined);
});

/**
 * LE TÉMOIN QUI TIENT LES DEUX ÉCRANS ENSEMBLE.
 *
 * F2 n'était pas une formule fausse : c'était la MÊME question posée à deux
 * endroits et répondue une seule fois. `repartition` disait 100 g dans la
 * boîte, `carteRepas` 300 g dans l'assiette, pour le même riz du même repas.
 *
 * Ce test refuse la divergence sans rien recopier : il fait répondre les deux
 * et compare. Changer l'arbitrage d'un seul côté le fait tomber.
 */
test('la carte du repas et la boîte du batch annoncent le même poids', () => {
  /* LES TROIS ÉTATS DE CUISSON ET TROIS COMPTES DE CONVIVES, dont ZÉRO.
     La boucle n'en couvrait d'abord que deux — « sans cuisson » et un mode
     choisi — sur un seul repas à un convive. Elle ne pouvait donc voir ni
     l'indécision, qui est un état à part entière (règle 6), ni la divergence
     du diviseur à zéro convive. Élargie sur signalement de la revue, le
     15 septembre 2026. */
  for (const convives of [0, 1, 3]) {
    const r = pour(convives, repas('2|R3', { aliment: RIZ, aCuire: 100 }));
    const q = r.quantites[0]!;

    for (const [nom, choix, vu] of [
      ['sans cuisson', null, null],
      ['cuit à la vapeur', MODES[0]!.id, MODES[0]!],
      /* `undefined` côté `repartition` = clé absente de la table ;
         `'a choisir'` est le nom que l'écran donne au même état. */
      ['à choisir', undefined, 'a choisir'],
    ] as const) {
      const cuissons = choix === undefined ? {} : { [cleDeCuisson(r.cle, RIZ)]: choix };
      const [boite] = repartition([r], cuissons);
      const portion = [...boite!.cuits, ...boite!.crus][0]!;
      const ou = `${nom}, ${convives} convive(s)`;

      assert.equal(poidsDeLaLigne(q, vu, r.convives)?.servi, portion.assiette,
        `${ou} : la carte et la boîte doivent annoncer le même poids servi`);
      assert.equal(poidsDeLaLigne(q, vu, r.convives)?.parPersonne, portion.parPersonne,
        `${ou} : la carte et la boîte doivent annoncer la même portion`);
    }
  }
});
