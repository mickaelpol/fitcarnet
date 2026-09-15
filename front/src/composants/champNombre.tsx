import { useEffect, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { nombreSaisi, texteDuNombre } from '@/calcul/saisieNombre';
import { Champ } from './base';

/**
 * UN CHAMP DE NOMBRE QUI GARDE CE QU'ON TAPE.
 *
 * LA PANNE, PROUVÉE LE 15 SEPTEMBRE 2026 SUR ÉMULATEUR ANDROID : les frappes
 * « 4 », « 2 », « , », « 5 » dans le poids d'une série affichaient « 4 », « 42 »,
 * « 42 », « 425 », et la base enregistrait 425 kg. Le champ était piloté par le
 * NOMBRE : « 42, » se lisait 42, se réécrivait « 42 », la virgule disparaissait
 * sous les doigts. Quatre champs étaient construits ainsi.
 *
 * LE TEXTE EST LA SOURCE DE L'AFFICHAGE, LE NOMBRE CELLE DES DONNÉES. Le champ
 * garde localement ce qui a été tapé et remonte le nombre qu'il désigne
 * (`nombreSaisi`). Il ne remplace son texte que lorsque la valeur reçue ne
 * correspond PLUS à ce texte — c'est-à-dire quand elle a changé de l'extérieur :
 * cocher une série vide la remplit avec l'objectif, et ça doit se voir. « 42, »
 * et 42 se correspondent : on n'y touche pas.
 *
 * UNE SAISIE ILLISIBLE RESTE À L'ÉCRAN, BORDÉE DE ROUGE, et remonte `null`.
 * L'effacer cacherait l'erreur ; la lire zéro écrirait un chiffre faux (règles 6
 * et 7).
 *
 * Voir `champNombre.test-rendu.tsx`, qui tape pour de vrai.
 */
export function ChampNombre({
  valeur, onChange, entier, placeholder, unite, etiquette, style,
}: {
  valeur: number | null;
  onChange: (n: number | null) => void;
  /** des répétitions : un décimal y est illisible, pas arrondi */
  entier?: boolean;
  placeholder?: string;
  unite?: string;
  etiquette?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [texte, setTexte] = useState(() => texteDuNombre(valeur));

  useEffect(() => {
    setTexte((courant) => (nombreSaisi(courant, { entier }) === valeur
      ? courant
      : texteDuNombre(valeur)));
  }, [valeur, entier]);

  const illisible = texte.trim() !== '' && nombreSaisi(texte, { entier }) === null;

  return (
    <Champ
      valeur={texte}
      onChange={(v) => {
        setTexte(v);
        onChange(nombreSaisi(v, { entier }));
      }}
      placeholder={placeholder}
      unite={unite}
      etiquette={etiquette}
      style={style}
      numerique
      illisible={illisible}
    />
  );
}
