"""
Les greffons declares dans `app.json` sont-ils tous dans `package.json` ?

EAS reinstalle les dependances sur SA machine a partir de `package.json`. Un
module present dans ton `node_modules` mais absent de ce fichier passe les
tests chez toi et fait echouer le build chez eux — sur un « Unknown error » de
la phase « Read app config » qui ne nomme meme pas le coupable.

Rend la liste de ce qui manque, une ligne vide si tout va bien.
"""
import json

app = json.load(open('front/app.json', encoding='utf-8'))['expo']
deps = json.load(open('front/package.json', encoding='utf-8')).get('dependencies', {})

greffons = [g if isinstance(g, str) else g[0] for g in app.get('plugins', [])]

# On ne verifie que les modules `expo-*` : ce sont les seuls qu'EAS doive
# retrouver par lui-meme. Un greffon local ou tiers a ses propres regles.
print(' '.join(g for g in greffons if g.startswith('expo-') and g not in deps))
