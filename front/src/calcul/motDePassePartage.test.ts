import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  EXIGENCES, LONGUEUR_MINIMALE, acceptable, force, manquements, type Exigence,
} from './motDePasse';

/**
 * LE VERROU ENTRE LES DEUX JUGES DU MOT DE PASSE.
 *
 * L'API REFUSE l'enregistrement, ce module AFFICHE une jauge. Deux codes
 * répondent à la même question dans deux langages, et chacun serait
 * correctement testé de son côté — ce qui est exactement ce qui rendrait une
 * divergence invisible : les deux suites resteraient vertes en se
 * contredisant, pendant que quelqu'un voit « Solide » en vert et se fait
 * refuser à l'envoi.
 *
 * Ce fichier et son jumeau `api/tests/Service/MotDePassePartageTest.php`
 * lisent LE MÊME fichier, `api/regles/motdepasse.json`.
 *
 * CE QUI EST VERROUILLÉ : le REFUS, et ce qui manque. La jauge, elle, reste au
 * front — elle affiche une nuance, elle ne décide rien. Mais elle est éprouvée
 * plus bas sur un point qui compte : **elle ne peut pas dire « ça passe » de
 * quelque chose que l'API refuse**.
 */

interface CasPartage {
  mot_de_passe: string;
  accepte: boolean;
  manque: Exigence[];
  pourquoi: string;
}

interface Regles {
  longueur_minimale: number;
  exigences: { code: Exigence; dit: string; pourquoi: string }[];
  cas: CasPartage[];
}

/* Depuis `front/`, là où `npm test` s'exécute. La liste vit sous `api/` parce
   que le conteneur de l'API ne monte que ce dossier — et parce que c'est
   l'API qui décide ce qu'elle accepte. */
const CHEMIN = path.resolve(process.cwd(), '../api/regles/motdepasse.json');

const regles = JSON.parse(readFileSync(CHEMIN, 'utf-8')) as Regles;

test('chaque cas de la liste partagée est jugé comme elle le dit', () => {
  for (const cas of regles.cas) {
    assert.equal(
      acceptable(cas.mot_de_passe), cas.accepte,
      `api/regles/motdepasse.json dit que « ${cas.mot_de_passe} » `
      + `${cas.accepte ? 'convient' : 'ne convient pas'} (${cas.pourquoi}), `
      + 'le front dit le contraire',
    );

    assert.deepEqual(
      manquements(cas.mot_de_passe), cas.manque,
      `« ${cas.mot_de_passe} » : le front ne nomme pas les mêmes manques que la liste`,
    );
  }
});

test('la longueur minimale est celle de la liste', () => {
  assert.equal(LONGUEUR_MINIMALE, regles.longueur_minimale,
    'Le front et l\'API doivent compter la même longueur minimale.');

  /* Un cas de table peut passer par hasard. On éprouve donc la borne
     elle-même, avec un mot de passe qui satisfait TOUT LE RESTE : seule la
     longueur décide. */
  const juste = `Aa1!${'x'.repeat(LONGUEUR_MINIMALE - 4)}`;
  const trop = `Aa1!${'x'.repeat(LONGUEUR_MINIMALE - 5)}`;

  assert.equal(juste.length, LONGUEUR_MINIMALE);
  assert.equal(acceptable(juste), true, 'la borne elle-même doit être acceptée');
  assert.equal(acceptable(trop), false, 'un caractère de moins, et c\'est refusé');
});

test('les codes d\'exigence sont ceux de la liste, dans le même ordre', () => {
  /* Sans ce test, un code renommé passerait inaperçu : les cas de la table
     nomment `manque` par ces codes, et l'écran les traduit en phrases. Trois
     endroits, un seul vocabulaire. */
  assert.deepEqual([...EXIGENCES], regles.exigences.map((e) => e.code));

  assert.deepEqual(manquements(''), [...EXIGENCES],
    'un mot de passe vide manque tout : c\'est la façon la plus simple de lire '
    + 'la liste complète, dans l\'ordre');
});

/* ------------------------------------------------------------------ la jauge
 *
 * Elle reste au front — mais elle ne doit JAMAIS encourager un mot de passe
 * que l'API refusera. C'est le défaut qu'on voit sur beaucoup de sites : un
 * « fort » vert, puis un refus à l'envoi.
 * ------------------------------------------------------------------------- */

test('la jauge ne dit jamais « ça passe » de ce que l\'API refuse', () => {
  for (const cas of regles.cas) {
    const niveau = force(cas.mot_de_passe);
    const encourage = niveau === 'bon' || niveau === 'solide';

    assert.equal(
      encourage, cas.accepte,
      `« ${cas.mot_de_passe} » : la jauge dit « ${niveau} » alors que l'API `
      + `${cas.accepte ? 'accepte' : 'refuse'}. Une jauge qui encourage un mot de `
      + 'passe refusé fait taper trois fois, puis choisir « Motdepasse1! ».',
    );
  }
});

test('la jauge distingue « ça passe » de « c\'est solide »', () => {
  /* Douze caractères avec les quatre familles, c'est vrai que ça passe — et ce
     n'est pas un exploit. Dire « Solide » là-dessus serait un compliment que
     le chiffre ne mérite pas (règle 7 : on n'affiche pas mieux que ce qu'on
     sait). Au-delà, c'est la LONGUEUR qui parle, seule chose qui augmente
     vraiment le coût d'une attaque une fois les familles présentes. */
  assert.equal(force('Kx7#mLp2vQ9z'), 'bon');
  assert.equal(force('Mon-Chat-Dort-9!'), 'solide');
  assert.equal(force(''), 'vide');
  assert.equal(force('motdepasse'), 'faible');
  assert.equal(force('Poireau3Tiede'), 'moyen', 'il ne manque qu\'une chose : on est « presque »');
});
