# Les sondes Playwright de la passe de contrôle

Des scripts **jetables**, écrits pendant les épreuves des 18 et 19 septembre
2026 pour répondre à une question précise sur l'application **qui tourne**.
Ils ne sont ni une suite de tests, ni maintenus : `npm test` les ignore, et
rien ne casse si l'un d'eux cesse de marcher.

Ils sont versionnés pour une seule raison : **ce sont eux qui ont vu ce que les
tests ne pouvaient pas voir.** Le 19 septembre, l'écran d'invitation ne rendait
plus rien du tout sur un lien valable — deux `useRef` posés après les retours
anticipés, donc des hooks conditionnels. `tsc` compilait, 680 tests étaient
verts, et le lien *expiré* s'affichait parfaitement. Seul un navigateur ouvrant
l'URL avec un **vrai** jeton pouvait le montrer.

*(Ils sont entrés dans le dépôt par un `git add presentation` trop large, dans
un commit qui ne les mentionnait pas. Plutôt que de réécrire l'historique, on
les garde et on dit ce qu'ils sont.)*

## Ce qu'il faut en retenir si on en réécrit un

**Écouter `pageerror`.** C'est la ligne qui a donné le diagnostic en une
seconde ; sans elle on ne lit qu'un `TimeoutError` sur `waitForSelector`, qui ne
dit pas pourquoi. Le motif est dans `commun.mjs`.

**Viser le bundle servi, pas le serveur de développement.** Les sondes tapent
`http://192.168.1.118:8080`, c'est-à-dire `api/front` — la copie que Caddy sert
vraiment. Un `dist` périmé s'y voit ; sur le serveur de développement, non.

**Créer sa donnée, puis la retirer.** Chaque sonde qui écrit crée son invitation
ou son compte jetable et le supprime. La règle de `donnees-de-test` vaut ici
comme ailleurs : jamais d'écriture sur une donnée qu'on n'a pas créée.
