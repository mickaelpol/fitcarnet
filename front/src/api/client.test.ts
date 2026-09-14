import assert from 'node:assert/strict';
import Module from 'node:module';
import { describe, it } from 'node:test';

/**
 * LE CLIENT HTTP, ET CE QU'IL NE DOIT PLUS JAMAIS CESSER DE FAIRE.
 *
 * Constat É10 de l'audit de septembre 2026 : « `front/src/api/client.ts`
 * (342 lignes) n'a aucun test : rejeu sur 401, distinction panne réseau /
 * refus serveur, corps non-JSON. **Tout est bien écrit, rien n'est
 * vérifié.** »
 *
 * Ce fichier ne corrige rien. Il verrouille. Chacune des propriétés ci-dessous
 * a été payée par une panne réelle, et chacune se casse en une ligne :
 *
 *   - un `uneSeuleFois` qu'on « simplifie » et dix requêtes réveillées en même
 *     temps lancent dix renouvellements concurrents, dont neuf jettent un jeton
 *     neuf ;
 *   - un `catch` qui remonte la panne réseau en refus serveur, et un tunnel de
 *     métro déconnecte l'utilisateur ;
 *   - un `JSON.parse` nu, et le 21 août 2026 l'application affiche
 *     « JSON Parse error: Unexpected character: < » parce que Caddy a répondu
 *     une page HTML pendant un redéploiement ;
 *   - un message d'erreur réseau qui ne nomme pas l'adresse, et on cherche une
 *     soirée un APK construit avec l'adresse du poste de développement.
 *
 * UN DÉFAUT CONNU EST CARACTÉRISÉ, PAS CORRIGÉ : voir « BUG CONNU (M7) » plus
 * bas. Le jour où il sera réparé, son test tombera — c'est le but.
 */

/* ------------------------------------------------------------------------ */
/* FAIRE ENTRER client.ts DANS node                                          */
/*                                                                            */
/* `client.ts` importe `react-native` et `expo-secure-store` : deux modules   */
/* que node ne sait pas charger. `require('react-native')` meurt sur          */
/* « SyntaxError: Unexpected token 'typeof' » (le paquet est écrit en Flow),  */
/* et `expo-secure-store` cherche un binaire natif absent. C'est très         */
/* exactement pour ça que `renouvellement.ts` avait été extrait du fichier :  */
/* il fallait bien pouvoir l'éprouver quelque part.                           */
/*                                                                            */
/* On ne déplace rien de plus. On remplace les deux modules d'appareil au     */
/* moment du chargement, et le reste de `client.ts` — le vrai — s'exécute.    */
/* Le remplacement doit être posé AVANT le `require('./client')` : d'où ce    */
/* `require` explicite, là où un `import` aurait été hissé en tête de fichier */
/* par le compilateur, donc avant les lignes qui suivent.                     */
/* ------------------------------------------------------------------------ */

/** L'adresse que le client croira interroger. Elle doit ressortir telle quelle
 *  dans le message de panne réseau : c'est toute la leçon du bug de l'APK. */
const ADRESSE = 'http://api.test/api';
process.env.EXPO_PUBLIC_API_URL = ADRESSE;

/** Le coffre du web est `localStorage`. On en pose un, en mémoire et
 *  inspectable : c'est lui qui prouvera que la fin de session efface bien les
 *  DEUX jetons, et pas seulement celui qu'on a en tête. */
const coffreDuNavigateur = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (cle: string): string | null => coffreDuNavigateur.get(cle) ?? null,
  setItem: (cle: string, valeur: string): void => { coffreDuNavigateur.set(cle, valeur); },
  removeItem: (cle: string): void => { coffreDuNavigateur.delete(cle); },
};

const jamais = (): never => {
  throw new Error('SecureStore ne doit pas servir : Platform.OS vaut « web » dans ces tests');
};

const doublures = new Map<string, unknown>([
  /* `Platform.OS === 'web'` fait passer le coffre par `localStorage`, et
     `emplacement()` rend `null` faute de `globalThis.location` : l'adresse
     vient donc de `EXPO_PUBLIC_API_URL`, comme sur l'application native. */
  ['react-native', { Platform: { OS: 'web' } }],
  ['expo-secure-store', {
    getItemAsync: jamais, setItemAsync: jamais, deleteItemAsync: jamais,
  }],
]);

type Chargeur = (requete: string, parent: unknown, ...reste: unknown[]) => unknown;
const interne = Module as unknown as { _load: Chargeur };
const chargeurDeNode = interne._load;
interne._load = function charger(this: unknown, requete, parent, ...reste): unknown {
  return doublures.get(requete) ?? chargeurDeNode.call(this, requete, parent, ...reste);
};

const client = require('./client') as typeof import('./client');

const CLE_JETON = 'fitcarnet.jeton';
const CLE_RAFRAICHISSEMENT = 'fitcarnet.rafraichissement';

/* ------------------------------------------------------------------------ */
/* LA DOUBLURE DE `fetch`                                                     */
/*                                                                            */
/* Le projet n'embarque aucune bibliothèque de doublures, et n'en a pas       */
/* besoin ici : ce qu'on veut d'un faux `fetch` tient en deux choses — rendre */
/* la réponse qu'on décide, et NOTER ce qui est parti. Le journal est la      */
/* moitié utile : c'est lui qui prouve « un seul rafraîchissement pour dix    */
/* 401 » et « le rejeu présente bien le jeton neuf ».                         */
/* ------------------------------------------------------------------------ */

interface Appel {
  url: string;
  methode: string;
  entetes: Record<string, string>;
  corps: string | null;
}

type Repondeur = (appel: Appel) => Response | Promise<Response>;

/** Branche le faux `fetch` et rend le journal, qui se remplit au fil des appels. */
function brancherFetch(repondre: Repondeur): Appel[] {
  const journal: Appel[] = [];

  globalThis.fetch = ((cible: unknown, options?: {
    method?: string; headers?: Record<string, string>; body?: string;
  }): Promise<Response> => {
    const appel: Appel = {
      url: String(cible),
      methode: options?.method ?? 'GET',
      entetes: { ...options?.headers },
      corps: options?.body ?? null,
    };
    journal.push(appel);

    /* Un répondeur qui LÈVE doit rendre une promesse rejetée, pas une
       exception synchrone : hors ligne, le vrai `fetch` rejette. La différence
       n'est pas cosmétique — un `try` mal placé attraperait l'une et pas
       l'autre. */
    return (async (): Promise<Response> => repondre(appel))();
  }) as unknown as typeof fetch;

  return journal;
}

const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut });

/** Ce que rend un proxy inverse qui répond à la place du serveur. */
const pageHtml = (statut: number): Response => new Response(
  '<!DOCTYPE html><html><head><title>Erreur</title></head><body><h1>502 Bad Gateway</h1></body></html>',
  { status: statut, headers: { 'Content-Type': 'text/html' } });

const panneReseau = (): never => { throw new TypeError('Network request failed'); };

const estRafraichissement = (a: Appel): boolean => a.url.endsWith('/jeton/rafraichir');
const versChemin = (chemin: string) => (a: Appel): boolean => a.url === ADRESSE + chemin;

/** Laisse tourner la file des microtâches jusqu'à ce que plus rien ne bouge. */
async function calmer(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise((r) => { setImmediate(r); });
}

/** Remet une session ouverte et débranche l'écouteur de fin de session. */
async function sessionOuverte(jeton = 'jwt-vieux', rafraichissement = 'refresh-1'): Promise<void> {
  await client.definirJeton(jeton);
  await client.definirRafraichissement(rafraichissement);
  client.surSessionFinie(null);
}

/** `assert.rejects` veut un prédicat ; celui-ci lit l'ErreurApi sans l'ombre d'un `any`. */
function erreurApi(verifier: (e: InstanceType<typeof client.ErreurApi>) => void) {
  return (e: unknown): boolean => {
    assert.ok(e instanceof client.ErreurApi, `attendu une ErreurApi, reçu ${String(e)}`);
    verifier(e);

    return true;
  };
}

/* ======================================================================== */

describe('rejeu sur 401', () => {
  /**
   * LE TEST QUI COMPTE.
   *
   * Au retour dans l'application, une dizaine de requêtes repartent d'un coup
   * et se heurtent toutes au même JWT périmé. Sans le regroupement de
   * `uneSeuleFois`, chacune lance son propre `/jeton/rafraichir` : dix appels
   * pour un besoin, neuf jetons neufs jetés aussitôt — et, si le serveur fait
   * tourner le jeton de rafraîchissement, neuf chances de le révoquer sous les
   * pieds du dixième.
   *
   * On tient le rafraîchissement ouvert le temps de compter : à cet instant
   * précis, il doit y avoir DIX appels de données partis, UN rafraîchissement
   * en cours, et zéro rejeu.
   */
  it('dix 401 simultanés ne déclenchent qu\'un rafraîchissement, et rejouent les dix', async () => {
    await sessionOuverte();

    let ouvrirLeRobinet: () => void = () => {};
    const robinet = new Promise<void>((r) => { ouvrirLeRobinet = r; });

    const journal = brancherFetch(async (appel) => {
      if (estRafraichissement(appel)) {
        await robinet;

        return json({ token: 'jwt-neuf' });
      }

      return appel.entetes.Authorization === 'Bearer jwt-neuf'
        ? json({ ok: true })
        : json({ detail: 'Expired JWT Token' }, 401);
    });

    const dix = Array.from({ length: 10 }, () => client.api<{ ok: boolean }>('/seances'));

    await calmer();
    assert.equal(journal.filter(estRafraichissement).length, 1,
      'dix 401 simultanés doivent partager UN SEUL /jeton/rafraichir');
    assert.equal(journal.filter(versChemin('/seances')).length, 10,
      'aucun rejeu tant que le rafraîchissement n\'a pas rendu sa réponse');

    ouvrirLeRobinet();
    const resultats = await Promise.all(dix);

    assert.deepEqual(resultats, Array.from({ length: 10 }, () => ({ ok: true })),
      'les dix appelants doivent recevoir leurs données, pas une erreur');
    assert.equal(journal.filter(estRafraichissement).length, 1,
      'toujours un seul rafraîchissement une fois tout le monde rentré');

    const seances = journal.filter(versChemin('/seances'));
    assert.equal(seances.length, 20, 'dix appels d\'origine, dix rejeux');
    for (const rejeu of seances.slice(10)) {
      assert.equal(rejeu.entetes.Authorization, 'Bearer jwt-neuf',
        'le rejeu doit présenter le jeton NEUF, sinon il se reprend un 401');
    }
  });

  it('ne rejoue qu\'une fois : un second 401 remonte l\'erreur au lieu de boucler', async () => {
    await sessionOuverte();

    const journal = brancherFetch((appel) => (estRafraichissement(appel)
      ? json({ token: 'jwt-neuf' })
      : json({ detail: 'Expired JWT Token' }, 401)));

    await assert.rejects(client.api('/seances'), erreurApi((e) => {
      assert.equal(e.statut, 401);
      assert.equal(e.message, 'Expired JWT Token');
    }));

    assert.equal(journal.filter(versChemin('/seances')).length, 2,
      'un appel, un rejeu, et on s\'arrête : un rejeu en boucle martèlerait le serveur');
    assert.equal(journal.filter(estRafraichissement).length, 1);
  });

  it('un appel sansJeton ne déclenche aucun rafraîchissement', async () => {
    await sessionOuverte();

    const journal = brancherFetch(() => json({ message: 'Invalid credentials.' }, 401));

    await assert.rejects(
      client.api('/connexion', {
        methode: 'POST', corps: { email: 'a@b.c', motDePasse: 'x' }, sansJeton: true,
      }),
      /Invalid credentials/,
    );

    assert.equal(journal.length, 1,
      'un mot de passe faux n\'est pas une session expirée : rien à renouveler');
    assert.equal(journal[0]?.entetes.Authorization, undefined,
      'aucun Bearer ne doit partir sur un appel sansJeton');
  });

  it('le rejeu porte la même méthode et le même corps que l\'appel d\'origine', async () => {
    await sessionOuverte();

    const journal = brancherFetch((appel) => {
      if (estRafraichissement(appel)) return json({ token: 'jwt-neuf' });

      return appel.entetes.Authorization === 'Bearer jwt-neuf'
        ? json({ ok: true })
        : json({ detail: 'Expired JWT Token' }, 401);
    });

    await client.api('/cuissons/habituelle', { methode: 'PUT', corps: { aliment: 3, rendement: 2.4 } });

    const ecritures = journal.filter(versChemin('/cuissons/habituelle'));
    assert.equal(ecritures.length, 2);
    assert.equal(ecritures[1]?.methode, 'PUT', 'un rejeu en GET perdrait l\'écriture en silence');
    assert.equal(ecritures[1]?.corps, JSON.stringify({ aliment: 3, rendement: 2.4 }));
  });
});

describe('panne réseau et refus serveur ne sont pas la même chose', () => {
  it('une panne réseau nomme l\'adresse qui a échoué', async () => {
    await sessionOuverte();

    const journal = brancherFetch(panneReseau);

    await assert.rejects(client.api('/seances'), erreurApi((e) => {
      assert.equal(e.statut, 0, 'zéro : le serveur n\'a rien répondu du tout');
      assert.ok(e.message.includes(ADRESSE),
        `le message doit NOMMER ${ADRESSE} — sinon on cherche une soirée un APK `
        + `construit avec la mauvaise adresse. Il dit : « ${e.message} »`);
      assert.ok(!/Network request failed/.test(e.message),
        'les six mots de fetch ne disent ni le serveur, ni la cause, ni quoi faire');
    }));

    assert.equal(journal.length, 1,
      'un statut 0 n\'est pas un 401 : aucun rafraîchissement ne doit partir');
  });

  it('un refus du serveur garde son code et son message, et ne parle pas d\'adresse', async () => {
    await sessionOuverte();

    brancherFetch(() => json({ detail: 'Cet aliment ne vous appartient pas.' }, 403));

    await assert.rejects(client.api('/aliments/9'), erreurApi((e) => {
      assert.equal(e.statut, 403);
      assert.equal(e.message, 'Cet aliment ne vous appartient pas.');
      assert.ok(!e.message.includes(ADRESSE),
        'confondre un refus avec une panne réseau ferait chercher le réseau au lieu du droit');
    }));
  });

  it('une panne réseau pendant le rafraîchissement ne déconnecte pas', async () => {
    await sessionOuverte();
    let sessionFinie = 0;
    client.surSessionFinie(() => { sessionFinie += 1; });

    brancherFetch((appel) => (estRafraichissement(appel)
      ? panneReseau()
      : json({ detail: 'Expired JWT Token' }, 401)));

    await assert.rejects(client.api('/moi'), /Expired JWT Token/);

    assert.equal(sessionFinie, 0,
      'un tunnel de métro n\'est pas une révocation : déconnecter y serait une punition');
    assert.equal(await client.lireRafraichissement(), 'refresh-1',
      'le jeton de rafraîchissement doit survivre à une coupure');
    client.surSessionFinie(null);
  });

  it('un 503 sur le rafraîchissement ne déconnecte pas non plus', async () => {
    await sessionOuverte();
    let sessionFinie = 0;
    client.surSessionFinie(() => { sessionFinie += 1; });

    brancherFetch((appel) => (estRafraichissement(appel)
      ? json({ detail: 'Service Unavailable' }, 503)
      : json({ detail: 'Expired JWT Token' }, 401)));

    await assert.rejects(client.api('/moi'), /Expired JWT Token/);

    assert.equal(sessionFinie, 0, 'un serveur en panne n\'est pas un serveur qui refuse');
    assert.equal(await client.lireRafraichissement(), 'refresh-1');
    client.surSessionFinie(null);
  });

  /**
   * LE SEUL CAS OÙ LA SESSION MEURT POUR DE BON — et il faut le DIRE.
   *
   * C'est ce signal que `app/_layout.tsx` attend pour vider le cache mémoire,
   * oublier le cache disque et renvoyer vers `/connexion` (troisième des trois
   * purges du front). Le jour où `client.ts` cesse de le lever, l'application
   * reste sur un écran protégé avec les données du compte précédent : c'est la
   * porte fermée de l'intérieur du constat É14.
   */
  it('un rafraîchissement refusé termine la session, vide le coffre et prévient l\'application', async () => {
    await sessionOuverte();

    let sessionFinie = 0;
    client.surSessionFinie(() => { sessionFinie += 1; });
    const vus: boolean[] = [];
    const desabonner = client.abonnerJeton((connecte) => { vus.push(connecte); });

    brancherFetch((appel) => (estRafraichissement(appel)
      ? json({ message: 'jeton révoqué' }, 401)
      : json({ detail: 'Expired JWT Token' }, 401)));

    try {
      await assert.rejects(client.api('/moi'), /Expired JWT Token/);

      assert.equal(sessionFinie, 1,
        'sans ce signal, personne ne vide le cache ni ne ramène à la connexion');
      assert.deepEqual(vus, [false], 'le portier doit apprendre que la session est tombée');
      assert.equal(coffreDuNavigateur.get(CLE_JETON), undefined,
        'un JWT mort laissé dans le coffre fait croire à l\'application qu\'elle est connectée');
      assert.equal(coffreDuNavigateur.get(CLE_RAFRAICHISSEMENT), undefined,
        'les DEUX jetons partent, pas seulement celui auquel on pense');
    } finally {
      desabonner();
      client.surSessionFinie(null);
    }
  });
});

describe('le corps n\'est pas supposé être du JSON', () => {
  it('une page HTML de Caddy devient un message actionnable', async () => {
    await sessionOuverte();
    brancherFetch(() => pageHtml(502));

    await assert.rejects(client.api('/seances'), erreurApi((e) => {
      assert.equal(e.statut, 502, 'le code HTTP du proxy doit être conservé');
      assert.ok(e.message.includes('502'), 'le code doit rester lisible dans le message');
      assert.ok(/réessaie/i.test(e.message), 'le message doit dire quoi faire');
      assert.ok(!/JSON|Unexpected|SyntaxError|</.test(e.message),
        '« JSON Parse error: Unexpected character: < » — 21 août 2026 — ne doit plus '
        + `jamais remonter jusqu'à l'écran. Reçu : « ${e.message} »`);
    }));
  });

  it('un 200 illisible est une erreur, pas des données', async () => {
    await sessionOuverte();
    brancherFetch(() => pageHtml(200));

    await assert.rejects(client.api('/seances'), erreurApi((e) => {
      assert.equal(e.statut, 200, 'le code est bon, le corps ne l\'est pas : c\'est un fait, pas une exception');
      assert.ok(/réessaie/i.test(e.message));
    }));
  });

  it('un 204 rend null sans rien tenter de lire', async () => {
    await sessionOuverte();
    brancherFetch(() => new Response(null, { status: 204 }));

    assert.equal(await client.api<null>('/seances/3', { methode: 'DELETE' }), null);
  });

  it('un corps vide sur 200 rend null plutôt que de casser', async () => {
    await sessionOuverte();
    brancherFetch(() => new Response('', { status: 200 }));

    assert.equal(await client.api<null>('/ping'), null);
  });
});

describe('le message montré vient du serveur', () => {
  const cas: { nom: string; corps: unknown; statut: number; attendu: string }[] = [
    { nom: 'le detail d\'API Platform', corps: { detail: 'Ce champ est obligatoire.' }, statut: 422, attendu: 'Ce champ est obligatoire.' },
    { nom: 'hydra:description à défaut', corps: { 'hydra:description': 'aliment: valeur invalide' }, statut: 422, attendu: 'aliment: valeur invalide' },
    { nom: 'message à défaut', corps: { message: 'Trop de tentatives.' }, statut: 429, attendu: 'Trop de tentatives.' },
    { nom: 'un repli lisible quand le serveur ne dit rien', corps: { foo: 1 }, statut: 500, attendu: 'Erreur 500' },
  ];

  for (const { nom, corps, statut, attendu } of cas) {
    it(`prend ${nom}`, async () => {
      await sessionOuverte();
      brancherFetch(() => json(corps, statut));

      await assert.rejects(client.api('/x'), erreurApi((e) => {
        assert.equal(e.statut, statut);
        assert.equal(e.message, attendu,
          'un « [object Object] » à l\'écran ne dit rien à personne');
      }));
    });
  }

  it('detail passe avant hydra:description et message', async () => {
    await sessionOuverte();
    brancherFetch(() => json({
      detail: 'le plus précis', 'hydra:description': 'le moyen', message: 'le vague',
    }, 400));

    await assert.rejects(client.api('/x'), erreurApi((e) => {
      assert.equal(e.message, 'le plus précis');
    }));
  });

  /**
   * BUG CONNU — constat M7 de l'audit (MOYENNE · CONFIRMÉ · non corrigé).
   *
   * Le repli d'un 401 sans message est « Identifiants incorrects. » QUEL QUE
   * SOIT le chemin appelé. Correct sur `/connexion` ; faux partout ailleurs :
   * un 401 sur `/mon-frigo` veut dire « session expirée », jamais « mot de
   * passe faux ». L'utilisateur cherche une faute de frappe dans un mot de
   * passe qu'il n'a pas tapé.
   *
   * Ce test NE CORRIGE RIEN : il fige le comportement actuel pour que la
   * correction (faire dépendre le repli de `options.sansJeton`) soit un
   * changement VOULU ET VISIBLE. Le jour où elle arrive, ce test tombe : il
   * faut alors changer la valeur attendue, pas le code.
   */
  it('BUG CONNU (M7) : un 401 de données sans message dit « Identifiants incorrects. »', async () => {
    await sessionOuverte();

    /* Le serveur de session est en panne (500) : pas de renouvellement, pas de
       déconnexion — le 401 d'origine remonte tel quel jusqu'à l'écran. */
    brancherFetch((appel) => (estRafraichissement(appel)
      ? json({ detail: 'panne' }, 500)
      : json({}, 401)));

    await assert.rejects(client.api('/mon-frigo'), erreurApi((e) => {
      assert.equal(e.message, 'Identifiants incorrects.',
        'M7 corrigé ? Très bien : mettre à jour ce test, et retirer « BUG CONNU »');
    }));
  });
});

describe('ce que le client annonce au serveur', () => {
  it('un PATCH s\'annonce en merge-patch, un POST en ld+json, un GET n\'annonce rien', async () => {
    await sessionOuverte();
    const journal = brancherFetch(() => json({ ok: true }));

    await client.api('/aliments/1', { methode: 'PATCH', corps: { nom: 'riz' } });
    await client.api('/aliments', { methode: 'POST', corps: { nom: 'riz' } });
    await client.api('/aliments');

    assert.equal(journal[0]?.entetes['Content-Type'], 'application/merge-patch+json',
      'API Platform refuse un PATCH annoncé autrement');
    assert.equal(journal[1]?.entetes['Content-Type'], 'application/ld+json');
    assert.equal(journal[2]?.entetes['Content-Type'], undefined,
      'un GET sans corps n\'a aucun type de contenu à déclarer');
    for (const appel of journal) {
      assert.equal(appel.entetes.Accept, 'application/ld+json');
      assert.equal(appel.entetes.Authorization, 'Bearer jwt-vieux');
    }
  });

  it('adresseApi() dit l\'adresse réellement interrogée', async () => {
    await sessionOuverte();
    const journal = brancherFetch(() => json({ ok: true }));
    await client.api('/moi');

    assert.equal(client.adresseApi(), ADRESSE);
    assert.equal(journal[0]?.url, `${ADRESSE}/moi`,
      'l\'adresse affichée doit être celle qui part vraiment sur le réseau');
  });
});

describe('membres', () => {
  it('rend un tableau vide plutôt que de casser sur une collection absente', () => {
    assert.deepEqual(client.membres<number>(null), []);
    assert.deepEqual(client.membres<number>({}), []);
    assert.deepEqual(client.membres<number>({ member: [1, 2] }), [1, 2]);
  });
});
