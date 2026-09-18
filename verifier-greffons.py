"""
Ce que le code utilise est-il declare dans `package.json` ?

EAS reinstalle les dependances sur SA machine a partir de `package.json`. Un
module present dans ton `node_modules` mais absent de ce fichier passe les
tests chez toi et fait echouer le build chez eux — sur un « Unknown error » de
la phase « Read app config » qui ne nomme meme pas le coupable.

DEUX SENS, ET LE SECOND A ETE AJOUTE APRES COUP.

  1. Les greffons declares dans `app.json` sont-ils dans `package.json` ?
  2. Les modules IMPORTES par le code le sont-ils ?

Le second manquait, et c'est par la que le defaut est passe : constat M9 de
l'audit, `@react-navigation/native-stack` importe par `enTete.tsx` sans etre
declare nulle part. Il ne vivait dans `node_modules` que par transitivite
d'expo-router. Un `import type` s'efface a la compilation, donc Metro ne le
cherchait pas — mais `tsc --noEmit` tombe des que le rangement des
dependances change, et rien ne prevenait avant.

Rend la liste de ce qui manque, une ligne vide si tout va bien.
"""
import json
import pathlib
import re

RACINE = pathlib.Path(__file__).parent
FRONT = RACINE / 'front'

app = json.loads((FRONT / 'app.json').read_text(encoding='utf-8'))['expo']
paquet = json.loads((FRONT / 'package.json').read_text(encoding='utf-8'))
deps = {**paquet.get('dependencies', {}), **paquet.get('devDependencies', {})}

# --- 1. les greffons d'app.json -----------------------------------------
greffons = [g if isinstance(g, str) else g[0] for g in app.get('plugins', [])]

# On ne verifie que les modules `expo-*` : ce sont les seuls qu'EAS doive
# retrouver par lui-meme. Un greffon local ou tiers a ses propres regles.
manquants = {g for g in greffons if g.startswith('expo-') and g not in deps}

# --- 2. les modules importes par le code --------------------------------
IMPORT = re.compile(r"""(?:from|import)\s+['"]([^'"]+)['"]""")

# `react-native` et consorts arrivent par expo, mais ils sont declares : ce
# sont les autres qu'on cherche. On ignore ce qui ne se resout pas dans
# `node_modules` : chemins relatifs, alias `@/` du tsconfig, et modules Node.
def interne(module: str) -> bool:
    return module.startswith(('.', '@/', 'node:'))


def nom_du_paquet(module: str) -> str:
    morceaux = module.split('/')
    # « @react-navigation/native-stack » tient en deux morceaux, « expo-audio »
    # en un seul ; un sous-chemin (« expo-router/entry ») ne compte pas.
    return '/'.join(morceaux[:2]) if module.startswith('@') else morceaux[0]


for fichier in [*FRONT.glob('src/**/*.ts'), *FRONT.glob('src/**/*.tsx'),
                *FRONT.glob('app/**/*.ts'), *FRONT.glob('app/**/*.tsx')]:
    for module in IMPORT.findall(fichier.read_text(encoding='utf-8')):
        if not interne(module):
            paquet_vise = nom_du_paquet(module)
            if paquet_vise not in deps:
                manquants.add(paquet_vise)

print(' '.join(sorted(manquants)))
