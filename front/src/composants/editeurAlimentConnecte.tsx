/**
 * L'éditeur d'aliment BRANCHÉ SUR L'API, pour les deux sources du frigo.
 *
 * `app/(onglets)/frigo.tsx` posait DEUX `<EditeurAliment>` côte à côte, l'un
 * pour les comptes lisant Grocy, l'autre pour ceux tenus en base. Les deux
 * recopiaient le même corps de requête à dix champs (D5 de l'audit de
 * septembre 2026) : une valeur nutritionnelle ajoutée dans l'un et oubliée
 * dans l'autre serait partie à l'API pour un compte sur deux, sans erreur ni
 * message — le genre de divergence qu'on ne découvre qu'en pesant.
 *
 * Fusionnés ici le 15 septembre 2026 (rang 9 du lot 6), sans changement de
 * comportement. Le geste est le même des deux côtés ; seule l'API diffère.
 *
 * LES MUTATIONS ARRIVENT EN PROPRIÉTÉS, ELLES NE SONT PAS APPELÉES ICI.
 * `useMutation` crée un état par point d'appel : les rappeler dans ce
 * composant donnerait des objets distincts de ceux de l'écran, qui lit leurs
 * erreurs dans son en-tête (`definir`, `poserQuantite`) et les remet à zéro
 * avant d'ouvrir la modale (`creer.reset()`, `majAliment.reset()`). L'écran
 * resterait muet sur un échec, et afficherait l'erreur de la fois d'avant.
 */

import { EditeurAliment, type AlimentSaisi } from './editeurAliment';
import type { AlimentDisponible } from '../api/types';
import type {
  useCreerAliment, useDefinirQuantiteGrocy, useDefinirStock,
  useEnregistrerAliment, useMajAliment,
} from '../api/hooks';

/** Un aliment du frigo tel que l'éditeur l'attend. */
const versSaisie = (a: AlimentDisponible): AlimentSaisi => ({
  nom: a.nom,
  categorie: a.categorie,
  kcal100: a.kcal100,
  prot100: a.prot100,
  gluc100: a.gluc100,
  lip100: a.lip100,
  fibres100: a.fibres100 ?? null,
  ratio: a.ratio,
  peseeAvant: a.peseeAvant ?? null,
  peseeApres: a.peseeApres ?? null,
});

export function EditeurAlimentConnecte({
  source, creation, edite, quantite,
  onQuantiteChange, onFermer, onCreationEnvoyee, onEditionFaite,
  creer, majAliment, definir, enregistrer, poserQuantite,
}: {
  /** qui tient la fiche : Grocy pour l'administrateur, la base pour les autres */
  source?: 'grocy' | 'base';
  /**
   * Vrai quand l'écran ouvre une CRÉATION.
   *
   * UN BOOLÉEN, ET NON PLUS UN ALIMENT DE DÉPART, DEPUIS LE 17 SEPTEMBRE 2026.
   * L'écran passait `ALIMENT_VIDE`, dont chaque valeur vaut zéro : l'éditeur,
   * qui ne laisse ses champs vides que s'il ne reçoit aucun aliment, ouvrait
   * donc une création avec les quatre macros écrites « 0 », et un oubli
   * partait en base comme une valeur (règle 6). Ce qu'on transmet est une
   * intention ; l'éditeur ne reçoit alors aucun aliment.
   */
  creation: boolean;
  /** aliment dont on corrige les valeurs ; `null` hors correction */
  edite: AlimentDisponible | null;
  quantite: string;
  onQuantiteChange: (v: string) => void;
  onFermer: () => void;
  /** la création est partie : l'écran referme la création et vide la quantité */
  onCreationEnvoyee: () => void;
  /** la correction est enregistrée : l'écran vide `edite` */
  onEditionFaite: () => void;
  creer: ReturnType<typeof useCreerAliment>;
  majAliment: ReturnType<typeof useMajAliment>;
  definir: ReturnType<typeof useDefinirStock>;
  enregistrer: ReturnType<typeof useEnregistrerAliment>;
  poserQuantite: ReturnType<typeof useDefinirQuantiteGrocy>;
}) {
  const surGrocy = source === 'grocy';

  /** La quantité tapée, ou zéro. Voir plus bas pourquoi zéro s'envoie quand même. */
  const quantiteSaisie = () => {
    const q = parseFloat(quantite.replace(',', '.'));

    return Number.isNaN(q) ? 0 : q;
  };

  return (
    <EditeurAliment
      visible={(surGrocy || source === 'base') && (creation || edite !== null)}
      titre={creation ? 'Nouvel aliment' : (edite?.nom ?? 'Aliment')}
      aliment={!creation && edite !== null ? versSaisie(edite) : undefined}
      enCours={surGrocy
        ? enregistrer.isPending || poserQuantite.isPending
        : creer.isPending || majAliment.isPending || definir.isPending}
      erreur={surGrocy
        ? enregistrer.error?.message ?? null
        : (creer.error ?? majAliment.error)?.message ?? null}
      /* Côté Grocy, le nom ne se saisit qu'à la création : ensuite Grocy en est
         maître, et le changer ici ferait diverger les deux outils. */
      nomModifiable={surGrocy ? creation : true}
      // la quantité ne se saisit qu'à la création : ailleurs elle se corrige
      // dans l'inventaire, seul endroit où elle s'écrit
      quantite={creation ? quantite : undefined}
      onQuantiteChange={creation ? onQuantiteChange : undefined}
      onFermer={onFermer}
      onEnregistrer={(v) => {
        /* LE CORPS EST ÉCRIT UNE FOIS, ET C'EST TOUT L'INTÉRÊT DE CE MODULE.
           Les deux éditeurs le recopiaient chacun de leur côté. */
        const corps = {
          nom: v.nom.trim(),
          categorie: v.categorie,
          kcal100: v.kcal100,
          prot100: v.prot100,
          gluc100: v.gluc100,
          lip100: v.lip100,
          fibres100: v.fibres100,
          ratio: v.ratio,
          peseeAvant: v.peseeAvant ?? null,
          peseeApres: v.peseeApres ?? null,
        };

        if (surGrocy) {
          if (!creation && edite === null) return;

          enregistrer.mutate({
            /* Vide = création : l'API pose le produit dans Grocy avant
               d'écrire ses valeurs. */
            reference: edite?.reference ?? '',
            ...corps,
          }, {
            onSuccess: (rendu) => {
              if (!creation) { onEditionFaite(); return; }

              const q = quantiteSaisie();
              onCreationEnvoyee();

              /* La quantité passe par l'INVENTAIRE, pas par `/mon-frigo/stock`
                 qui est réservé aux comptes tenus en base et répond 409 ici.

                 Ce n'est pas qu'une question de route : côté Grocy, poser une
                 quantité EST un inventaire — on déclare le poids réellement
                 présent, Grocy en déduit l'écart. C'est exactement ce qu'on
                 veut à la création : le produit passe de « inconnu » à « j'en
                 ai tant ».

                 On l'envoie même à zéro. C'est cet appel qui crée la ligne de
                 stock, donc qui rattache le produit à un emplacement — sans
                 lui il resterait sous « Sans emplacement », tout en bas. */
              poserQuantite.mutate({ reference: rendu.reference, quantite: q });
            },
          });

          return;
        }

        if (creation) {
          creer.mutate(corps, {
            onSuccess: (cree) => {
              const q = quantiteSaisie();
              onCreationEnvoyee();

              // On pose la quantité MÊME à zéro : c'est cet appel qui crée
              // la ligne de stock, donc qui rattache l'aliment à un
              // emplacement. Sans lui il resterait sous « Sans emplacement »,
              // tout en bas, jusqu'au premier inventaire.
              definir.mutate({ alimentId: cree.id, quantite: q });
            },
          });

          return;
        }

        if (edite === null) return;

        majAliment.mutate(
          { id: Number(edite.reference.split(':')[1]), ...corps },
          { onSuccess: () => onEditionFaite() },
        );
      }}
    />
  );
}
