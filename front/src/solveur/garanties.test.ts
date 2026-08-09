import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type AuMieux, type Repas, type Role,
  MODELE, REPAS, ajusterAuStock, composer, resoudreAuMieux, roleDe, rolesDuRepas,
} from './composer';
import { CIBLES_PLAN, type Frigo, frigoAleatoire } from './frigos.test-data';
import { calculer as calculerBrut } from './solveur';
import type { Aliment, Cibles, Macros, Quantite } from './types';

/**
 * CE QUE LE CALCULATEUR NE FERA JAMAIS.
 *
 * Les autres fichiers de test vérifient des cas : « avec du saumon et du riz,
 * il doit sortir tant ». Utile, mais un cas ne couvre que lui-même, et une
 * diète se suit tous les jours avec un frigo qui change tous les jours.
 *
 * Ici, on ne vérifie aucun cas. On vérifie des PROPRIÉTÉS — des phrases qui
 * doivent rester vraies quels que soient les aliments, les stocks, le repas,
 * le nombre de convives et la convention glucidique. Chacune est une façon
 * dont le calculateur pourrait envoyer quelqu'un manger de travers :
 *
 *   1. annoncer des macros qui ne correspondent pas aux grammes affichés ;
 *   2. demander de peser plus que ce qu'il y a dans le frigo ;
 *   3. donner deux colonnes cru/cuit incohérentes entre elles ;
 *   4. se tromper sans le dire ;
 *   5. dire « c'est bon » alors que ça ne l'est pas ;
 *   6. changer d'avis entre deux affichages identiques ;
 *   7. défaire un choix que l'utilisateur a verrouillé.
 *
 * Mille scénarios tirés au sort les passent toutes, à chaque exécution, avec
 * la même graine — quand une tombe, le message la donne et le cas se rejoue.
 */

/* ------------------------------------------------------- les scénarios */

const NOMBRE_DE_FRIGOS = 250;

interface Scenario {
  nom: string;
  graine: number;
  repas: Repas;
  portions: number;
  glucidesTotaux: boolean;
  frigo: Frigo;
  cibles: Cibles;
  depart: ReturnType<typeof composer>;
  sortie: AuMieux;
}

const construire = (): Scenario[] => {
  const liste: Scenario[] = [];

  for (let graine = 1; graine <= NOMBRE_DE_FRIGOS; graine += 1) {
    const frigo = frigoAleatoire(graine);
    if (frigo.aliments.length === 0) continue;

    for (const repas of REPAS) {
      const portions = 1 + (graine % 3);
      const glucidesTotaux = graine % 2 === 0;
      const par = CIBLES_PLAN[repas];
      const cibles: Cibles = {
        kcal: par.kcal * portions, prot: par.prot * portions,
        gluc: par.gluc * portions, lip: par.lip * portions,
      };

      const depart = composer(frigo.aliments, portions, new Set(), repas);
      const sortie = resoudreAuMieux(
        { variables: depart.variables, fixes: depart.fixes },
        cibles, frigo.stockDe, frigo.aliments, new Set(), glucidesTotaux,
      );

      liste.push({
        nom: `graine ${graine} · ${repas} · ${portions} pers.`
          + (glucidesTotaux ? ' · glucides totaux' : ''),
        graine, repas, portions, glucidesTotaux, frigo, cibles, depart, sortie,
      });
    }
  }

  return liste;
};

/* Construits UNE fois : mille appels au solveur, pas mille par invariant. */
const SCENARIOS = construire();

/** Parcourt tous les scénarios et rassemble les manquements avant d'échouer. */
const pourTous = (
  phrase: string,
  verifier: (s: Scenario) => string | null,
): void => {
  const fautes: string[] = [];
  for (const s of SCENARIOS) {
    let faute: string | null = null;
    try {
      faute = verifier(s);
    } catch (e) {
      faute = `exception : ${(e as Error).message}`;
    }
    if (faute !== null) fautes.push(`  ${s.nom} — ${faute}`);
  }

  assert.equal(
    fautes.length, 0,
    `${phrase}\n${fautes.length} scénario(s) sur ${SCENARIOS.length} :\n`
      + `${fautes.slice(0, 12).join('\n')}`
      + (fautes.length > 12 ? `\n  … et ${fautes.length - 12} autres` : ''),
  );
};

/* ------------------------------------------------------------ outillage */

/**
 * La quantité d'un aliment ramenée à son état de référence, LUE SUR
 * L'AFFICHAGE — pas reprise du calcul interne. C'est tout l'intérêt : on
 * refait le chemin depuis ce que l'utilisateur a sous les yeux.
 */
const referenceAffichee = (q: Quantite): number =>
  (q.aliment.etatReference === 'cru' ? q.aCuire : q.assiette);

const macrosAffichees = (quantites: Quantite[], glucidesTotaux: boolean): Macros =>
  quantites.reduce<Macros>((acc, q) => {
    const g = referenceAffichee(q);
    const gluc = q.aliment.gluc100 + (glucidesTotaux ? (q.aliment.fibres100 ?? 0) : 0);

    return {
      kcal: acc.kcal + (q.aliment.kcal100 * g) / 100,
      prot: acc.prot + (q.aliment.prot100 * g) / 100,
      gluc: acc.gluc + (gluc * g) / 100,
      lip: acc.lip + (q.aliment.lip100 * g) / 100,
    };
  }, { kcal: 0, prot: 0, gluc: 0, lip: 0 });

const TOLERANCE = { prot: 1.5, gluc: 2.5, lip: 1.2 };

/** Un seul aliment ajustable, pour isoler l'effet du rendement. */
const calculerPour = (cibles: Cibles, glucide: Aliment) =>
  calculerBrut(cibles, { glucide }, [], {});

const fini = (v: number): boolean => Number.isFinite(v);

/* ======================================================================= */

describe('Les nombres affichés sont les vrais', () => {
  it('les macros annoncées sont celles des grammes du tableau', () => {
    pourTous(
      "L'en-tête annonce autre chose que ce que pèsent les lignes.",
      (s) => {
        const refait = macrosAffichees(s.sortie.resultat.quantites, s.glucidesTotaux);
        const dit = s.sortie.resultat.macros;
        for (const cle of ['kcal', 'prot', 'gluc', 'lip'] as const) {
          if (Math.abs(refait[cle] - dit[cle]) > 0.01) {
            return `${cle} : le tableau donne ${refait[cle].toFixed(2)}, `
              + `l'en-tête annonce ${dit[cle].toFixed(2)}`;
          }
        }

        return null;
      },
    );
  });

  it('les écarts sont bien macros moins cibles', () => {
    pourTous('Un écart affiché ne correspond pas à la différence réelle.', (s) => {
      const { macros, cibles, ecarts } = s.sortie.resultat;
      for (const cle of ['kcal', 'prot', 'gluc', 'lip'] as const) {
        if (Math.abs(ecarts[cle] - (macros[cle] - cibles[cle])) > 1e-6) {
          return `${cle} : écart annoncé ${ecarts[cle].toFixed(2)}, `
            + `réel ${(macros[cle] - cibles[cle]).toFixed(2)}`;
        }
      }

      return null;
    });
  });

  it('aucune quantité négative, infinie ou illisible', () => {
    pourTous('Une quantité impossible est proposée.', (s) => {
      for (const q of s.sortie.resultat.quantites) {
        if (!fini(q.aCuire) || !fini(q.assiette)) {
          return `${q.aliment.nom} : à cuire ${q.aCuire}, assiette ${q.assiette}`;
        }
        if (q.aCuire < 0 || q.assiette < 0) {
          return `${q.aliment.nom} : quantité négative`;
        }
      }
      for (const cle of ['kcal', 'prot', 'gluc', 'lip'] as const) {
        if (!fini(s.sortie.resultat.macros[cle])) return `macro ${cle} illisible`;
      }

      return null;
    });
  });

  it('aucun message ne laisse échapper un NaN ou un undefined', () => {
    pourTous('Un message affiché contient une valeur non calculée.', (s) => {
      for (const d of s.sortie.resultat.diagnostics) {
        if (/NaN|undefined|Infinity|\[object/.test(d.message)) {
          return `${d.code} : « ${d.message} »`;
        }
        if (d.message.trim() === '') return `${d.code} : message vide`;
      }

      return null;
    });
  });
});

describe('Les deux pesées disent la même chose', () => {
  it('« à cuire » et « cuit » restent liés par le ratio de l\'aliment', () => {
    pourTous(
      'Les colonnes cru et cuit ne décrivent pas la même quantité de nourriture.',
      (s) => {
        for (const q of s.sortie.resultat.quantites) {
          const r = q.aliment.ratio > 0 ? q.aliment.ratio : 1;
          const attendu = q.aCuire * r;
          if (Math.abs(q.assiette - attendu) > 1e-6 * Math.max(1, attendu)) {
            return `${q.aliment.nom} : ${q.aCuire.toFixed(1)} g à cuire × ${r} `
              + `= ${attendu.toFixed(1)}, mais l'assiette annonce ${q.assiette.toFixed(1)}`;
          }
        }

        return null;
      },
    );
  });

  it('un aliment qui sort du four ne pèse jamais zéro alors qu\'on en pèse', () => {
    pourTous("Une ligne affiche une quantité d'un côté et rien de l'autre.", (s) => {
      for (const q of s.sortie.resultat.quantites) {
        if ((q.aCuire > 0) !== (q.assiette > 0)) {
          return `${q.aliment.nom} : à cuire ${q.aCuire}, assiette ${q.assiette}`;
        }
      }

      return null;
    });
  });

  it('le même aliment n\'apparaît jamais deux fois', () => {
    pourTous('Un aliment est compté deux fois dans le même repas.', (s) => {
      const vus = new Set<Aliment['id']>();
      for (const q of s.sortie.resultat.quantites) {
        if (vus.has(q.aliment.id)) return `${q.aliment.nom} apparaît deux fois`;
        vus.add(q.aliment.id);
      }

      return null;
    });
  });
});

describe('Le frigo a le dernier mot', () => {
  it('aucune quantité ne dépasse ce qu\'il reste, ajustable ou imposée', () => {
    pourTous(
      'Le calculateur demande de peser une quantité qui n\'existe pas.',
      (s) => {
        for (const q of s.sortie.resultat.quantites) {
          const dispo = s.frigo.stockDe(q.aliment);
          /* Un demi-gramme de marge : au-delà, c'est la balance qui parle,
             pas l'arrondi d'affichage. */
          if (q.aCuire > dispo + 0.5) {
            return `${q.aliment.nom} : ${q.aCuire.toFixed(1)} g demandés, `
              + `${dispo.toFixed(1)} g en stock`;
          }
        }

        return null;
      },
    );
  });

  it('un aliment absent du frigo n\'est jamais proposé', () => {
    pourTous('Un aliment qui n\'est pas dans le frigo apparaît au menu.', (s) => {
      for (const q of s.sortie.resultat.quantites) {
        if (q.aCuire <= 0) continue;
        if (!s.frigo.aliments.some((a) => a.id === q.aliment.id)) {
          return `${q.aliment.nom} n'est pas dans ce frigo`;
        }
      }

      return null;
    });
  });

  it('un plafonnement est toujours annoncé', () => {
    pourTous(
      'Une quantité a été rabotée par le stock sans que rien ne le dise.',
      (s) => {
        for (const pl of s.sortie.plafonnes) {
          const dispo = s.frigo.stockDe(pl.aliment);
          if (Math.abs(pl.grammes - dispo) > 0.5) {
            return `${pl.aliment.nom} : plafond annoncé ${pl.grammes}, stock ${dispo}`;
          }
        }

        return null;
      },
    );
  });
});

describe('Il ne se trompe jamais en silence', () => {
  it('« objectifs atteints » veut dire atteints sur les trois macros', () => {
    pourTous('Un repas est déclaré bon alors qu\'il rate une cible.', (s) => {
      const { ok, ecarts } = s.sortie.resultat;
      const dansLaCible = Math.abs(ecarts.prot) <= TOLERANCE.prot
        && Math.abs(ecarts.gluc) <= TOLERANCE.gluc
        && Math.abs(ecarts.lip) <= TOLERANCE.lip;

      if (ok !== dansLaCible) {
        return `ok = ${ok} mais écarts P ${ecarts.prot.toFixed(1)} / `
          + `G ${ecarts.gluc.toFixed(1)} / L ${ecarts.lip.toFixed(1)}`;
      }

      return null;
    });
  });

  it('un repas qui rate sa cible le dit', () => {
    pourTous('Un repas hors cible ne porte aucun message.', (s) => {
      if (s.sortie.resultat.ok) return null;
      const parlants = s.sortie.resultat.diagnostics.filter(
        (d) => d.gravite !== 'info');

      return parlants.length > 0 ? null : 'aucun avertissement ni blocage';
    });
  });

  it('un repas juste ne crie pas au loup', () => {
    pourTous('Un repas dans la cible affiche pourtant un blocage.', (s) => {
      if (!s.sortie.resultat.ok) return null;
      const bloquants = s.sortie.resultat.diagnostics.filter(
        (d) => d.gravite === 'blocage');

      return bloquants.length === 0
        ? null
        : `blocage « ${bloquants[0]!.code} » sur un repas pourtant juste`;
    });
  });

  it('un rôle réclamé par le repas et absent du frigo est signalé', () => {
    pourTous('Un rôle manquant n\'est pas rapporté.', (s) => {
      const attendus = ['proteine', 'glucide', 'lipide'] as const;
      for (const cle of attendus) {
        const present = s.depart.variables[cle] !== undefined;
        const annonce = s.depart.manquants.includes(cle);
        if (present === annonce) {
          return `${cle} : présent = ${present}, annoncé manquant = ${annonce}`;
        }
      }

      return null;
    });
  });
});

describe('Deux fois la même question, deux fois la même réponse', () => {
  it('recomposer un repas identique donne exactement le même repas', () => {
    pourTous('Le calculateur change d\'avis sans raison.', (s) => {
      const bis = resoudreAuMieux(
        { variables: s.depart.variables, fixes: s.depart.fixes },
        s.cibles, s.frigo.stockDe, s.frigo.aliments, new Set(), s.glucidesTotaux,
      );

      const ligne = (r: AuMieux): string => r.resultat.quantites
        .map((q) => `${q.aliment.id}:${q.aCuire.toFixed(3)}/${q.assiette.toFixed(3)}`)
        .join('|');

      if (ligne(bis) !== ligne(s.sortie)) {
        return `1re fois ${ligne(s.sortie)}\n      2e fois ${ligne(bis)}`;
      }
      if (bis.resultat.ok !== s.sortie.resultat.ok) return 'verdict différent';

      return null;
    });
  });

  it('l\'aliment nommé par le plan est choisi où qu\'il soit rangé', () => {
    pourTous('Ranger son frigo autrement change le menu du plan.', (s) => {
      /* Même contenu, ordre inversé. Là où le modèle NOMME un aliment — les
         flocons d'avoine à 16 h, les œufs le matin — le choix ne doit rien
         devoir à l'ordre de la liste. Ailleurs, prendre le premier venu est
         un choix légitime, et l'inverser en est un autre. */
      const inverse = [...s.frigo.aliments].reverse();
      const c = composer(inverse, s.portions, new Set(), s.repas);

      const sansAccent = (v: string): string =>
        v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

      const cles = ['proteine', 'glucide', 'lipide'] as const;
      for (const cle of cles) {
        const role: Role = MODELE[s.repas][cle];
        const voulu = MODELE[s.repas].preferes?.[role];
        if (voulu === undefined) continue;

        /* La préférence ne s'applique que si l'aliment nommé est là. */
        const present = s.frigo.aliments.some(
          (a) => roleDe(a) === role && sansAccent(a.nom).includes(sansAccent(voulu)));
        if (!present) continue;

        const a = s.depart.variables[cle];
        const b = c.variables[cle];
        if (a?.id !== b?.id) {
          return `${cle} (${voulu}) : ${a?.nom} d'un côté, ${b?.nom} de l'autre`;
        }
      }

      return null;
    });
  });
});

describe('Ce que l\'utilisateur décide reste décidé', () => {
  it('un rôle verrouillé n\'est jamais échangé dans son dos', () => {
    const fautes: string[] = [];

    for (const s of SCENARIOS) {
      for (const cle of ['proteine', 'lipide'] as const) {
        const choisi = s.depart.variables[cle];
        if (choisi === undefined) continue;

        const verrouille = resoudreAuMieux(
          { variables: s.depart.variables, fixes: s.depart.fixes },
          s.cibles, s.frigo.stockDe, s.frigo.aliments,
          new Set<Role>([cle]), s.glucidesTotaux,
        );

        const echange = verrouille.echanges.find((e) => e.role === cle);
        if (echange !== undefined) {
          fautes.push(`  ${s.nom} — ${cle} verrouillé sur ${choisi.nom}, `
            + `remplacé par ${echange.mis.nom}`);
        }
      }
    }

    assert.equal(fautes.length, 0,
      `Un aliment choisi par l'utilisateur a été remplacé.\n${fautes.slice(0, 10).join('\n')}`);
  });

  it('une quantité imposée disponible est servie exactement', () => {
    pourTous('Une quantité imposée n\'est pas respectée.', (s) => {
      for (const f of s.depart.fixes) {
        /* Sans `unite`, la quantité s'entend dans l'état de référence de
           l'aliment : ce qu'on SERT pour un légume, ce qu'on PÈSE pour une
           viande. C'est cette valeur-là qui doit se retrouver telle quelle. */
        const attendu = f.grammes;
        const dispo = s.frigo.stockDe(f.aliment);

        /* Le frigo peut la raboter — un autre invariant s'en charge. */
        const aCuireVoulu = f.aliment.etatReference === 'cru'
          ? attendu : attendu / (f.aliment.ratio > 0 ? f.aliment.ratio : 1);
        if (aCuireVoulu > dispo + 0.5) continue;

        /* L'huile peut cesser d'être une quantité figée pour porter les
           lipides : c'est un comportement voulu, annoncé par un échange. */
        const devenueVariable = Object.values(s.sortie.variables).some(
          (a) => a.id === f.aliment.id);
        if (devenueVariable) continue;

        /* Un aliment promu variable puis rabattu sur son stock : la quantité
           n'est plus celle du plan, mais le plafonnement l'annonce. */
        const annonce = s.sortie.plafonnes.some((pl) => pl.aliment.id === f.aliment.id);
        if (annonce) continue;

        const q = s.sortie.resultat.quantites.find((x) => x.aliment.id === f.aliment.id);
        if (q === undefined) return `${f.aliment.nom} imposé à ${attendu} g a disparu`;

        const servi = referenceAffichee(q);
        if (Math.abs(servi - attendu) > 0.5) {
          return `${f.aliment.nom} : imposé à ${attendu} g, servi ${servi.toFixed(1)} g`;
        }
      }

      return null;
    });
  });
});

describe('Chercher mieux ne fait jamais pire', () => {
  it('le repas retenu vaut au moins la première tentative', () => {
    pourTous('Le calculateur a retenu une solution moins bonne.', (s) => {
      const base = ajusterAuStock(
        { variables: s.depart.variables, fixes: s.depart.fixes },
        s.cibles, s.frigo.stockDe, s.frigo.aliments, s.glucidesTotaux,
      );

      const note = (r: typeof base.resultat): number =>
        r.diagnostics.filter((d) => d.gravite === 'blocage').length * 1000
        + Math.abs(r.ecarts.prot) / 2 + Math.abs(r.ecarts.gluc) / 4
        + Math.abs(r.ecarts.lip);

      if (note(s.sortie.resultat) > note(base.resultat) + 1e-9) {
        return `retenu ${note(s.sortie.resultat).toFixed(2)}, `
          + `départ ${note(base.resultat).toFixed(2)}`;
      }

      return null;
    });
  });

  it('un échange annoncé a bien eu lieu', () => {
    pourTous('Un échange est annoncé mais l\'aliment n\'est pas au menu.', (s) => {
      for (const e of s.sortie.echanges) {
        const present = s.sortie.resultat.quantites.some(
          (q) => q.aliment.id === e.mis.id);
        const retireEncore = Object.values(s.sortie.variables).some(
          (a) => a.id === e.retire.id);
        if (!present) return `${e.mis.nom} annoncé mis, absent du repas`;
        if (retireEncore) return `${e.retire.nom} annoncé retiré, toujours variable`;
      }

      return null;
    });
  });
});

describe('La convention glucidique ne se retourne pas contre lui', () => {
  it('compter les fibres dans la cible ne fait jamais servir PLUS de féculents', () => {
    const fautes: string[] = [];

    for (const s of SCENARIOS) {
      if (s.glucidesTotaux) continue;
      const avec = resoudreAuMieux(
        { variables: s.depart.variables, fixes: s.depart.fixes },
        s.cibles, s.frigo.stockDe, s.frigo.aliments, new Set(), true,
      );

      const glucide = s.depart.variables.glucide;
      if (glucide === undefined) continue;

      /* Comparable seulement si les deux repas sont composés des MÊMES
         aliments : quand le calculateur change de laitage d'un côté, les
         grammes de féculent ne sont plus comparables — c'est le laitage qui
         a bougé, pas la convention. */
      const memeRepas = (['proteine', 'glucide', 'lipide'] as const).every(
        (cle) => avec.variables[cle]?.id === s.sortie.variables[cle]?.id)
        && avec.fixes.length === s.sortie.fixes.length
        && avec.fixes.every((f, i) => f.aliment.id === s.sortie.fixes[i]?.aliment.id
          && Math.abs(f.grammes - s.sortie.fixes[i]!.grammes) < 1e-9);
      if (!memeRepas) continue;
      if (s.sortie.variables.glucide?.id !== glucide.id) continue;

      const q = (r: typeof avec): number =>
        r.resultat.quantites.find((x) => x.aliment.id === glucide.id)?.aCuire ?? 0;

      if (q(avec) > q(s.sortie) + 0.5) {
        fautes.push(`  ${s.nom} — ${glucide.nom} : `
          + `${q(s.sortie).toFixed(1)} g en européen, ${q(avec).toFixed(1)} g en totaux`);
      }
    }

    assert.equal(fautes.length, 0,
      'Compter les fibres dans la cible devrait en retirer, pas en ajouter.\n'
        + fautes.slice(0, 10).join('\n'));
  });

  it('les fibres n\'entrent jamais dans les protéines ni les lipides', () => {
    pourTous('Une macro autre que les glucides dépend de la convention.', (s) => {
      const autre = resoudreAuMieux(
        { variables: s.depart.variables, fixes: s.depart.fixes },
        s.cibles, s.frigo.stockDe, s.frigo.aliments, new Set(), !s.glucidesTotaux,
      );

      /* Les grammes changent, donc les macros aussi. Ce qu'on vérifie, c'est
         que le CALCUL des protéines et lipides d'une quantité donnée ignore
         les fibres : à quantités égales, mêmes protéines. */
      const ident = (r: AuMieux): string => r.resultat.quantites
        .map((q) => q.aliment.id).sort().join('|');
      if (ident(autre) !== ident(s.sortie)) return null;

      const memeGrammes = autre.resultat.quantites.every((q) => {
        const b = s.sortie.resultat.quantites.find((x) => x.aliment.id === q.aliment.id);

        return b !== undefined && Math.abs(b.aCuire - q.aCuire) < 1e-9;
      });
      if (!memeGrammes) return null;

      if (Math.abs(autre.resultat.macros.prot - s.sortie.resultat.macros.prot) > 1e-9) {
        return 'les protéines changent avec la convention glucidique';
      }
      if (Math.abs(autre.resultat.macros.lip - s.sortie.resultat.macros.lip) > 1e-9) {
        return 'les lipides changent avec la convention glucidique';
      }

      return null;
    });
  });
});

describe('Le repas ressemble à un repas', () => {
  it('aucune quantité aberrante n\'est servie sans un mot', () => {
    pourTous(
      'Une quantité démesurée est proposée comme si de rien n\'était.',
      (s) => {
        if (!s.sortie.resultat.ok) return null;

        for (const q of s.sortie.resultat.quantites) {
          const role = roleDe(q.aliment);
          /* Plafonds larges, par personne, mesurés DANS L'ASSIETTE : c'est
             la portion servie qui se mange, pas le poids à la balance. C'est
             aussi la seule formulation qui attrape la panne qu'on a connue —
             500 g de riz SEC font 1,5 kg dans l'assiette, et sautent aux
             yeux, là où « 500 g » tout court peut être une portion de
             pommes de terre parfaitement normale. */
          const max: Record<string, number> = {
            proteine: 500, laitage: 900, glucide: 600, fruit: 500,
            lipide: 120, huile: 60, legume: 800,
          };
          const plafond = (max[role ?? ''] ?? 1000) * s.portions;
          if (q.assiette > plafond) {
            return `${q.aliment.nom} : ${q.assiette.toFixed(0)} g dans l'assiette `
              + `pour ${s.portions} pers., et le repas est déclaré juste`;
          }
        }

        return null;
      },
    );
  });

  it('un repas déclaré juste tient dans une fourchette de calories crédible', () => {
    pourTous('Les calories servies sont très loin de la cible annoncée.', (s) => {
      if (!s.sortie.resultat.ok) return null;
      const { macros, cibles } = s.sortie.resultat;
      /* Les kcal découlent des macros ; si les trois macros sont dans la
         cible, l'énergie ne peut pas dériver de plus de ~40 kcal. Au-delà,
         c'est que les données d'un aliment mentent. */
      const attendu = 4 * macros.prot + 4 * macros.gluc + 9 * macros.lip;
      if (Math.abs(macros.kcal - attendu) > 0.12 * Math.max(1, attendu)) {
        return `${macros.kcal.toFixed(0)} kcal annoncées, `
          + `${attendu.toFixed(0)} d'après les macros (cible ${cibles.kcal.toFixed(0)})`;
      }

      return null;
    });
  });
});

describe('Le rendement ne change PAS ce qu\'il faut peser', () => {
  /**
   * La découverte du 9 août, et la seule consigne qui compte à la cuisine.
   *
   * Quand les macros CUITES sont dérivées des macros SÈCHES en divisant par
   * le rendement — c'est ce que fait `ciqual_vers_grocy.py`, par conservation
   * de l'énergie — le rendement se simplifie dans le calcul du poids à peser :
   *
   *     à cuire = cible / (gluc_cuit/100) / ratio
   *             = cible / ((gluc_sec/ratio)/100) / ratio
   *             = cible × 100 / gluc_sec
   *
   * Autrement dit : **la colonne « à cuire » est exacte même si le rendement
   * est faux.** Seule la colonne « cuit » en dépend.
   *
   * Conséquence pratique, et elle est contre-intuitive : il faut peser le
   * féculent SEC. Peser le poids cuit affiché quand le rendement est faux
   * fait manger jusqu'à deux fois moins de glucides que prévu.
   */
  const SEC = { kcal: 350, prot: 7.12, gluc: 75, lip: 1.58 };

  const rizSelonLeRendement = (ratio: number): Aliment => ({
    id: 'riz', nom: 'Riz', categorie: 'fec',
    kcal100: SEC.kcal / ratio, prot100: SEC.prot / ratio,
    gluc100: SEC.gluc / ratio, lip100: SEC.lip / ratio,
    fibres100: 0, ratio, etatReference: 'cuit',
  });

  it('le poids à peser est le même à 2.26, à 3 et à 4.68', () => {
    const cibles: Cibles = { kcal: 400, prot: 8, gluc: 60, lip: 2 };
    const peser = (ratio: number): number => {
      const r = calculerPour(cibles, rizSelonLeRendement(ratio));

      return r.quantites[0]!.aCuire;
    };

    const a = peser(2.26);
    for (const ratio of [1.87, 2.5, 3, 3.7, 4.68]) {
      assert.ok(
        Math.abs(peser(ratio) - a) < 1,
        `à ${ratio} il faudrait peser ${peser(ratio).toFixed(1)} g, `
          + `à 2.26 ${a.toFixed(1)} g — le rendement ne doit rien y changer`,
      );
    }
  });

  it('mais le poids dans l\'assiette, lui, change du simple au double', () => {
    const cibles: Cibles = { kcal: 400, prot: 8, gluc: 60, lip: 2 };
    const servi = (ratio: number): number =>
      calculerPour(cibles, rizSelonLeRendement(ratio)).quantites[0]!.assiette;

    assert.ok(servi(4.68) > 2 * servi(2.26),
      'un rendement double doit doubler le poids servi');
  });

  it('et les glucides réellement mangés sont ceux du SEC pesé', () => {
    const cibles: Cibles = { kcal: 400, prot: 8, gluc: 60, lip: 2 };
    for (const ratio of [1.87, 2.26, 3, 4.68]) {
      const q = calculerPour(cibles, rizSelonLeRendement(ratio)).quantites[0]!;
      const reels = (q.aCuire * SEC.gluc) / 100;
      assert.ok(Math.abs(reels - cibles.gluc) < 1,
        `à ${ratio} : ${reels.toFixed(1)} g de glucides pesés pour ${cibles.gluc} visés`);
    }
  });
});

describe('Une assiette, une personne, ses macros', () => {
  /**
   * LE CONTRAT, tel qu'il a été formulé : « je ne veux pas me retrouver avec
   * une assiette d'aliments cuits qui au final ne respecte pas les macros du
   * repas ».
   *
   * Les trois colonnes de l'écran disent trois choses différentes :
   *
   *   cru      ce qu'on pose sur la balance AVANT de cuisiner, pour tout le
   *            monde — c'est le seul geste que l'utilisateur fait ;
   *   cuit     ce qui sortira de la casserole, pour tout le monde ;
   *   1 pers.  ce qu'on sert dans UNE assiette.
   *
   * Ce qui est verrouillé ici : le contenu d'UNE assiette porte exactement
   * les macros réglées pour ce repas dans le compte. Pas le total du plat
   * divisé mentalement — l'assiette elle-même, reconstruite depuis les
   * grammes affichés.
   *
   * La cuisson ne détruit ni protéine, ni glucide, ni lipide : elle ne
   * déplace que de l'eau. Compter sur le poids pesé et manger le poids cuit
   * revient donc au même — à condition que l'état de référence de chaque
   * aliment soit le bon, ce que les invariants précédents garantissent.
   */
  it('ce qui est dans une assiette porte les macros du compte', () => {
    pourTous(
      'Une assiette ne respecte pas les macros réglées pour ce repas.',
      (s) => {
        if (!s.sortie.resultat.ok) return null;

        /* Reconstruit depuis l'AFFICHAGE, divisé par le nombre de convives —
           exactement la colonne « 1 pers. » que l'utilisateur lit. */
        const assiette = macrosAffichees(
          s.sortie.resultat.quantites.map((q) => ({
            ...q,
            aCuire: q.aCuire / s.portions,
            assiette: q.assiette / s.portions,
          })),
          s.glucidesTotaux,
        );

        const par = CIBLES_PLAN[s.repas];
        const marges = {
          prot: TOLERANCE.prot / s.portions,
          gluc: TOLERANCE.gluc / s.portions,
          lip: TOLERANCE.lip / s.portions,
        };

        for (const cle of ['prot', 'gluc', 'lip'] as const) {
          const ecart = assiette[cle] - par[cle];
          if (Math.abs(ecart) > marges[cle] + 1e-9) {
            return `${cle} : l'assiette porte ${assiette[cle].toFixed(1)} g `
              + `pour une cible de ${par[cle]} g (écart ${ecart.toFixed(2)})`;
          }
        }

        return null;
      },
    );
  });

  it('cuisiner pour trois ne déplace pas l\'assiette de celui qui suit la diète', () => {
    /* Le nombre de convives multiplie les quantités, pas les macros d'une
       assiette.
     *
     * On n'exige PAS deux résultats identiques au gramme près : les pas
     * d'arrondi du solveur portent sur le plat entier, donc 5 g de féculent
     * pèsent 5 g dans une assiette seule et 1,7 g dans chacune de trois. Ce
     * qui est vérifié, c'est que les deux assiettes restent chacune dans la
     * tolérance de la MÊME cible — l'écart entre elles ne peut alors pas
     * dépasser la somme des deux marges.
     *
     * Et seulement quand les deux repas tombent juste : comparer une solution
     * réussie à une solution que l'application signale déjà comme ratée ne
     * dirait rien. */
    const fautes: string[] = [];

    for (let graine = 1; graine <= 60; graine += 1) {
      const frigo = frigoAleatoire(graine);
      if (frigo.aliments.length === 0) continue;

      for (const repas of REPAS) {
        const par = CIBLES_PLAN[repas];
        const pour = (portions: number) => {
          const cibles: Cibles = {
            kcal: par.kcal * portions, prot: par.prot * portions,
            gluc: par.gluc * portions, lip: par.lip * portions,
          };
          const depart = composer(frigo.aliments, portions, new Set(), repas);
          const sortie = resoudreAuMieux(
            { variables: depart.variables, fixes: depart.fixes },
            cibles, () => Number.POSITIVE_INFINITY, frigo.aliments, new Set(), false);

          return {
            ok: sortie.resultat.ok,
            assiette: macrosAffichees(
              sortie.resultat.quantites.map((q) => ({
                ...q, aCuire: q.aCuire / portions, assiette: q.assiette / portions,
              })), false),
          };
        };

        const un = pour(1);
        const trois = pour(3);
        if (!un.ok || !trois.ok) continue;

        for (const cle of ['prot', 'gluc', 'lip'] as const) {
          // marge de l'un (tol / 1) + marge de l'autre (tol / 3)
          const bord = TOLERANCE[cle] * (1 + 1 / 3);
          if (Math.abs(un.assiette[cle] - trois.assiette[cle]) > bord + 1e-9) {
            fautes.push(`  graine ${graine} · ${repas} — ${cle} : `
              + `${un.assiette[cle].toFixed(1)} g seul, `
              + `${trois.assiette[cle].toFixed(1)} g à trois `
              + `(écart admis ${bord.toFixed(2)})`);
          }
        }
      }
    }

    assert.equal(fautes.length, 0,
      `L'assiette change selon le nombre de convives.\n${fautes.slice(0, 10).join('\n')}`);
  });
});

describe('On ne signale que ce qui manque vraiment', () => {
  /**
   * Un message d'absence doit porter sur un rôle que le repas RÉCLAME.
   *
   * Le déjeuner a longtemps annoncé « Aucun laitage utilisable dans ton
   * frigo » et « Aucun fruit utilisable » — deux rôles que son modèle ne
   * demande pas. Puis, l'huile ayant été ajoutée sans condition à la liste,
   * le petit-déjeuner s'est mis à dire « Aucune huile utilisable » alors
   * qu'il y en avait une au frigo : ce repas n'en sert simplement pas.
   *
   * Un message faux coûte plus cher qu'un message absent : il fait douter de
   * tous les autres.
   */
  it('un repas ne réclame que les rôles de son modèle', () => {
    for (const repas of REPAS) {
      const m = MODELE[repas];
      const attendus = new Set<Role>([
        m.proteine, m.glucide, m.lipide, ...m.imposes.map((i) => i.role)]);

      assert.deepEqual(
        [...rolesDuRepas(repas)].sort(), [...attendus].sort(),
        `${repas} réclame autre chose que ce que son modèle décrit`);
    }
  });

  it('le matin et la collation ne réclament pas d\'huile', () => {
    /* Le cas vu à l'écran : de l'huile d'avocat au frigo, et « Aucune huile
       utilisable » au petit-déjeuner. */
    assert.ok(!rolesDuRepas('R1').has('huile'), 'matin');
    assert.ok(!rolesDuRepas('R3').has('huile'), '16 h');
  });

  it('le déjeuner et le dîner, eux, en réclament', () => {
    assert.ok(rolesDuRepas('R2').has('huile'));
    assert.ok(rolesDuRepas('R4').has('huile'));
    assert.ok(rolesDuRepas('R2').has('legume'));
  });

  it('le déjeuner ne réclame ni laitage ni fruit', () => {
    assert.ok(!rolesDuRepas('R2').has('laitage'));
    assert.ok(!rolesDuRepas('R2').has('fruit'));
  });

  it('chaque rôle réclamé et absent du frigo est bien rapporté', () => {
    pourTous('Un rôle réclamé manque sans être signalé.', (s) => {
      for (const role of rolesDuRepas(s.repas)) {
        const servi = Object.values(s.depart.variables).some(
          (a) => roleDe(a) === role)
          || Object.keys(s.depart.imposes).includes(role);
        const enStock = s.frigo.aliments.some(
          (a) => roleDe(a) === role && s.frigo.stockDe(a) > 0);
        if (!servi && enStock && role !== 'huile') {
          return `${role} : présent au frigo mais absent du repas`;
        }
      }

      return null;
    });
  });
});

describe('La batterie couvre vraiment quelque chose', () => {
  it('les scénarios sont assez nombreux et assez variés', () => {
    assert.ok(SCENARIOS.length > 800, `seulement ${SCENARIOS.length} scénarios`);

    const justes = SCENARIOS.filter((s) => s.sortie.resultat.ok).length;
    const rates = SCENARIOS.length - justes;

    /* Un jeu où tout tombe juste ne teste pas la gestion de l'échec ; un jeu
       où rien ne tombe juste ne teste pas le calcul. Il faut les deux. */
    assert.ok(justes > 100, `seulement ${justes} repas réussis : trop peu`);
    assert.ok(rates > 100, `seulement ${rates} repas ratés : trop peu`);

    const avecPlafond = SCENARIOS.filter((s) => s.sortie.plafonnes.length > 0).length;
    assert.ok(avecPlafond > 50, `seulement ${avecPlafond} plafonnements par le stock`);

    const avecEchange = SCENARIOS.filter((s) => s.sortie.echanges.length > 0).length;
    assert.ok(avecEchange > 20, `seulement ${avecEchange} échanges automatiques`);
  });
});
