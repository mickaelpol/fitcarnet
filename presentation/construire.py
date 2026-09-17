#!/usr/bin/env python3
"""
Construit le support de présentation de fitcarnet.

POURQUOI UN GÉNÉRATEUR ET PAS UN HTML ÉCRIT À LA MAIN.

Les captures sont embarquées en base64 : le fichier produit est autonome, il
s'ouvre depuis une clé USB ou une pièce jointe, sans dossier d'images à côté.
Personne ne veut découvrir en réunion que les visuels sont restés sur l'autre
machine. Écrire ce base64 à la main serait absurde ; on le génère.

  python3 presentation/construire.py
"""
import base64
import pathlib
import re

RACINE = pathlib.Path(__file__).parent
CAPTURES = RACINE / "captures"

# TES IMAGES PASSENT AVANT LES CAPTURES AUTOMATIQUES.
#
# Les captures de `capturer.mjs` sont prises sur le web, en 1440 × 900 : l'app
# mobile y paraît étirée, et certaines ne montrent pas l'écran dont la slide
# parle. Le propriétaire veut pouvoir poser les siennes — des captures de son
# téléphone, ou des images tirées de son tournage.
#
# Elles ne vont PAS dans `captures/` : ce dossier est ignoré par git et
# réécrit à chaque `preparer-demonstration.sh`, l'image posée à la main y
# serait écrasée sans un mot. Elles vont dans `images/`, qui est versionné —
# c'est aussi ce qui les fait arriver sur l'autre PC. Même nom que
# l'emplacement, sans se soucier de l'extension.
IMAGES = RACINE / "images"
TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}

# Ce que chaque slide a réellement embarqué, pour le rapport de fin.
EMPLACEMENTS: list[tuple[str, str, str]] = []


def trouver(nom: str) -> tuple[pathlib.Path | None, str]:
    base = pathlib.Path(nom).stem
    for extension in TYPES:
        chemin = IMAGES / (base + extension)
        if chemin.exists():
            return chemin, "images/ (toi)"
    chemin = CAPTURES / nom
    if chemin.exists():
        return chemin, "captures/ (automatique)"
    return None, "MANQUANTE"


def image(nom: str) -> str:
    """Encode l'image en data URI. Rend une chaîne vide si elle manque —
    une slide sans visuel vaut mieux qu'une présentation qui ne s'ouvre pas."""
    chemin, _ = trouver(nom)
    if chemin is None:
        return ""
    type_mime = TYPES.get(chemin.suffix.lower(), "image/jpeg")
    return f"data:{type_mime};base64," + base64.b64encode(chemin.read_bytes()).decode()


# --------------------------------------------------------------------------
#  Les slides. Chaque entrée : (acte, titre, corps HTML).
#  L'acte pilote la couleur du bandeau et le fil conducteur en pied de page.
# --------------------------------------------------------------------------
def visuel(nom: str, legende: str = "") -> str:
    EMPLACEMENTS.append((pathlib.Path(nom).stem, legende, trouver(nom)[1]))
    src = image(nom)
    if not src:
        return f'<p class="manque">[capture manquante : {nom}]</p>'
    leg = f'<figcaption>{legende}</figcaption>' if legende else ""
    return f'<figure><img src="{src}" alt="{legende or nom}">{leg}</figure>'


SLIDES = [
    # ---------------------------------------------------------------- ouverture
    ("titre", "fitcarnet", """
      <p class="accroche">Nutrition et musculation, dans une seule application.</p>
      <p class="sous">Suivi des repas composés à partir du frigo réel · carnet de séances ·
         web et Android · hébergement personnel</p>
      <p class="meta">Présentation produit et technique</p>
    """),

    # ================================================================== ACTE 1
    ("produit", "Le problème", """
      <div class="deux">
        <div>
          <h3>Ce que font les gens aujourd'hui</h3>
          <ul>
            <li>Une application pour compter les calories</li>
            <li>Une autre pour le carnet de musculation</li>
            <li>Un tableur pour les courses et le batch cooking</li>
            <li>Et de la mémoire pour relier les trois</li>
          </ul>
        </div>
        <div>
          <h3>Ce qui casse</h3>
          <ul>
            <li>Les quantités saisies ne correspondent à <em>rien de ce qu'on a</em> dans le frigo</li>
            <li>Le poids cru et le poids cuit sont confondus, les calculs sont faux</li>
            <li>Personne ne tient un tableur pendant six mois</li>
          </ul>
        </div>
      </div>
      <p class="chute">Le suivi s'arrête, non par manque de volonté, mais parce que la saisie coûte
         plus que ce qu'elle rapporte.</p>
    """),

    ("produit", "La réponse", """
      <p class="accroche">Partir du frigo, pas d'un catalogue.</p>
      <div class="trois">
        <div class="carte">
          <h3>Un frigo qui sait</h3>
          <p>Ce qu'on a, en grammes, par emplacement. Un inventaire se saisit en écarts,
             pas en tout ressaisissant.</p>
        </div>
        <div class="carte">
          <h3>Un calculateur qui compose</h3>
          <p>Il part des cibles du jour et de ce qui est réellement disponible.
             Il donne les grammes à peser, avant cuisson.</p>
        </div>
        <div class="carte">
          <h3>Un carnet qui mesure</h3>
          <p>Séries, charges, temps de repos. La progression se lit, elle ne se devine pas.</p>
        </div>
      </div>
    """),

    ("produit", "Le frigo", f"""
      {visuel('04-frigo-stock.jpg', "Le stock, regroupé par emplacement, avec ses valeurs pour 100 g")}
      <p class="chute">« <strong>poids cru</strong> » sous la quantité : les valeurs décrivent le produit
         tel qu'on le pèse. C'est une règle du projet, et elle est visible à l'écran.</p>
    """),

    ("produit", "L'inventaire, en écarts", f"""
      {visuel('05-frigo-inventaire.jpg', "On ne corrige que ce qui a bougé")}
      <p class="chute">Une ligne absente n'est pas un zéro : elle n'a pas été comptée, et son stock ne bouge pas.
         Un inventaire de trente aliments prend le temps d'en corriger trois.</p>
    """),

    ("produit", "L'inventaire part en tâche de fond", f"""
      <div class="deux">
        <div>{visuel('12-inventaire-envoye.jpg', "« Tu peux quitter l'écran, ça continue tout seul »")}</div>
        <div>{visuel('13-inventaire-applique.jpg', "« Inventaire appliqué » : le stock a bougé, sans rien ressaisir")}</div>
      </div>
      <p class="chute">L'écran rend la main immédiatement. Le traitement suit, ligne par ligne,
         et son avancement reste consultable même après avoir fermé l'application.</p>
    """),

    ("produit", "Le calculateur", f"""
      {visuel('07-repas-compose.jpg', "Quatre repas composés à partir du frigo, sur les cibles du jour")}
      <p class="chute">« On pèse AVANT cuisson : la cuisson n'ajoute que de l'eau, jamais de calories. »
         L'application explique ses chiffres au lieu de les asséner.</p>
    """),

    ("produit", "Ce que le calcul donne", f"""
      {visuel('09-repas-macros.jpg', "Chaque repas avec ses macros réelles, et l'écart à la cible en couleur")}
      <p class="chute">Quand le frigo ne permet pas d'atteindre la cible, l'écart est <em>montré</em>,
         pas lissé. Un chiffre faux serait pire qu'un refus de répondre.</p>
    """),

    ("produit", "Quand les données sont douteuses, il le dit", f"""
      {visuel('06-repas-cibles.jpg', "Avant le calcul : les aliments dont les fibres sont inconnues, nommés un par un")}
      <p class="chute">Une fibre inconnue compte pour zéro, et fausse une cible en glucides totaux de
         17 % sur un pain complet : l'application le dit, et nomme les aliments. Une valeur physiquement
         impossible — un grain sec à 83 kcal — est signalée en rouge. Elle le dit <em>avant</em> de cuisiner.</p>
    """),

    ("produit", "Le batch cooking", f"""
      {visuel('11-batch-cooking.jpg', "Les fournées pesées sec, puis les boîtes : ce qu'on y met, et ce qu'on se sert")}
      <p class="chute">Deux colonnes distinctes — la boîte pour tout le monde, la portion pour soi.
         C'est la différence entre cuisiner pour la semaine et savoir ce qu'on mange.</p>
    """),

    ("produit", "Le carnet de séances", f"""
      {visuel('18-seance-detail-1rm.jpg', "Séance en cours : séries prescrites, charges, minuteur, et 1RM estimé")}
      <p class="chute">Le <strong>1RM estimé</strong> se recalcule à chaque saisie, et l'écart depuis la
         séance précédente s'affiche à côté. Neuf semaines de données derrière ce chiffre.</p>
    """),

    ("produit", "Les objectifs, repas par repas", f"""
      {visuel('03-objectifs.jpg', "Une cible par moment de repas — Matin, Midi, 16 h, Soir")}
      <p class="chute">Pas un total pour la journée : une cible par repas. C'est ce qui permet de composer
         un petit-déjeuner qui ne ressemble pas à un dîner. La case « <strong>glucides fibres comprises</strong> »
         porte la convention européenne — 2 kcal par gramme, comptées à part.</p>
    """),

    ("produit", "Les programmes", f"""
      {visuel('15-modeles-liste.jpg', "Les programmes d'où partent les séances")}
      <p class="chute">Les séries prescrites d'un programme pré-remplissent la séance. Le mode de travail
         s'y choisit — et il commande ce qu'on prescrit : des secondes en « Tenue », des kilos en « Charge ».</p>
    """),

    # LA CARTE DES FONCTIONNALITÉS — AJOUTÉE LE 17 SEPTEMBRE 2026.
    #
    # Les 28 slides racontaient bien le produit, mais un client qui demandait
    # « et sinon, qu'est-ce que ça fait ? » n'avait aucune réponse d'ensemble :
    # il fallait ouvrir `features.md` et ses ~288 lignes. Ces deux slides
    # donnent la carte au bon niveau. Le détail vit dans `demonstration.md`.
    ("produit", "Tout ce que l'application sait faire · 1", """
      <div class="deux">
        <div>
          <h3>Entrer, et rester</h3>
          <p>Invitation par lien à usage unique, révocable · aucune inscription libre ·
             session d'une heure renouvelée par un jeton révocable · compte désactivé bloqué
             à la requête suivante.</p>
          <h3>Le frigo</h3>
          <p>Stock par emplacement · recherche sans accents · chaque compte saisit ses
             aliments, valeurs de l'étiquette · contrôle de cohérence bloquant et
             détection des kilojoules · rendement cru/cuit mesurable · source Grocy en option.</p>
          <h3>L'inventaire</h3>
          <p>Saisie <em>en écarts</em> · un champ vide n'est pas un zéro · dépôt en lot appliqué
             en tâche de fond, reprise exacte après coupure, échecs nommés ligne par ligne.</p>
        </div>
        <div>
          <h3>Les repas</h3>
          <p>Une cible par repas · plusieurs jours, plusieurs convives · composition sous contrainte
             du stock réel · les grammes <em>à peser, avant cuisson</em> · remplacer, verrouiller,
             déclarer un reste · avertissements chiffrés sur les données douteuses.</p>
          <h3>Cuisiner, puis ranger</h3>
          <p>Fournées groupées par façon de cuire (on pèse sec) · boîtes en cuit · liste de courses ·
             plans enregistrés, figés, en toutes lettres · « J'ai cuisiné » décrémente le frigo.</p>
        </div>
      </div>
    """),

    ("produit", "Tout ce que l'application sait faire · 2", """
      <div class="deux">
        <div>
          <h3>Les séances</h3>
          <p>Trois modes — charge, tenue, chrono · saisie et cochage des séries · pré-remplissage
             par la dernière fois · notes · réordonnancement · sauvegarde automatique ·
             passage en modèle.</p>
          <h3>Ce que l'application déduit</h3>
          <p>1RM par la formule d'Epley, <strong>avec ses deux garde-fous</strong> · écart depuis
             la dernière fois · courbe de progression · table des paliers (zone 70 à 90 %) ·
             calculateur de charge · records antérieurs.</p>
          <h3>Minuter</h3>
          <p>Repos aux paliers 1:00 / 1:30 / 2:00 / 3:00, son, vibration, notification système,
             survie au changement d'écran · chronomètre d'effort tenu par série.</p>
        </div>
        <div>
          <h3>Le catalogue</h3>
          <p>~1 338 exercices · recherche français/anglais sans accents · quinze vignettes de
             muscles · fiche détaillée avec vidéo · <em>aucune suppression possible</em>,
             pour ne pas effacer d'historique.</p>
          <h3>L'administration</h3>
          <p>Catalogue d'exercices · fusion de deux exercices avec report de l'historique ·
             façons de cuire · comptes et invitations — et le refus de se bloquer soi-même
             ou de bloquer le dernier administrateur.</p>
          <h3>Ce qui tient sans se voir</h3>
          <p>Isolation stricte entre comptes · cache relu au démarrage à froid · tolérance
             au hors-ligne · anti-N+1 · documentation de l'API fermée.</p>
        </div>
      </div>
    """),

    # ================================================================== ACTE 2
    ("technique", "L'architecture", """
      <div class="pile">
        <div class="etage"><span class="tag">Mobile &amp; web</span>
          <strong>Expo SDK 54 · React Native</strong>
          <em>un seul code TypeScript pour le web et Android — 18 210 lignes, 18 écrans</em></div>
        <div class="etage"><span class="tag">API</span>
          <strong>Symfony 7.4 · API Platform 4 · PHP 8.3</strong>
          <em>7 441 lignes, 8 contrôleurs, 27 routes, 18 entités</em></div>
        <div class="etage"><span class="tag">Données</span>
          <strong>PostgreSQL 16</strong>
          <em>20 tables, 4 436 lignes de SQL versionné, migrations idempotentes</em></div>
        <div class="etage"><span class="tag">Exécution</span>
          <strong>Docker · FrankenPHP · Caddy · NAS Synology</strong>
          <em>hébergement personnel, pas de compte tiers, pas de mesure d'audience</em></div>
      </div>
    """),

    ("technique", "Un seul code, trois cibles", """
      <div class="trois">
        <div class="carte"><h3>Web</h3><p>Build statique servi par Caddy.
          Versionné dans le dépôt pour que le déploiement soit un <em>copier</em>, pas un <em>construire</em>.</p></div>
        <div class="carte"><h3>Android</h3><p>Build EAS, distribué en interne.
          Le code natif ne change que rarement.</p></div>
        <div class="carte"><h3>Mises à jour</h3><p><code>eas update</code> pousse le JavaScript
          sur les téléphones au démarrage suivant, sans passer par un magasin.</p></div>
      </div>
      <p class="chute">Le solveur, les calculs nutritionnels et les formules de performance sont écrits
         <strong>une fois</strong>, en TypeScript pur, et servent les trois cibles.</p>
    """),

    ("technique", "L'isolation des données", """
      <p class="accroche">Multi-comptes : une donnée qui fuit d'un compte à l'autre est la faute la plus grave possible.</p>
      <div class="pile">
        <div class="etage"><span class="tag">1</span><strong>ProprieteUtilisateur</strong>
          <em>interface de marquage : une entité qui l'implémente est filtrée</em></div>
        <div class="etage"><span class="tag">2</span><strong>FiltreProprietaire</strong>
          <em>extension Doctrine, priorité 100 : pose le WHERE, sur toutes les requêtes</em></div>
        <div class="etage"><span class="tag">3</span><strong>ChargementComplet</strong>
          <em>priorité 50 : ajoute les jointures anti-N+1 par-dessus le filtre</em></div>
        <div class="etage"><span class="tag">4</span><strong>ModeleExposeTest</strong>
          <em>un test refuse toute entité exposée non conforme : l'oubli est impossible</em></div>
      </div>
      <p class="chute">Une seule exception, documentée : le catalogue d'exercices est
         <em>commun à tous</em> — la règle devient « public OU le mien ».</p>
    """),

    ("technique", "Le solveur de repas", """
      <div class="deux">
        <div>
          <h3>Le problème</h3>
          <p>Trouver les grammes de chaque aliment disponible pour atteindre quatre cibles
             — calories, protéines, glucides, lipides — sous contrainte de stock.</p>
          <p>C'est un système linéaire. Il est résolu par <strong>élimination de Gauss avec
             pivot partiel</strong>, pas par tâtonnement.</p>
        </div>
        <div>
          <h3>Ce qui est garanti</h3>
          <ul>
            <li>Aucune quantité négative</li>
            <li>Arrondi appliqué <em>avant</em> le calcul des macros affichées</li>
            <li>Un résultat même sans marge de manœuvre, avec l'écart annoncé</li>
            <li>Un aliment négligeable (&lt; 8 g) est signalé, pas dissimulé</li>
          </ul>
        </div>
      </div>
      <p class="chute">Domaine pur, sans dépendance à React ni au réseau : il se teste seul.</p>
    """),

    ("technique", "Pourquoi l'inventaire est asynchrone", """
      <p class="accroche">Un soir, l'envoi d'un inventaire est mort à mi-parcours.</p>
      <div class="deux">
        <div>
          <h3>Ce qui s'est passé</h3>
          <p>L'application poussait les quarante corrections en parallèle. Le service de stock en
             face tourne avec cinq processus et une base qui n'accepte qu'un écrivain :
             rien n'était parallélisé, tout faisait la queue. PHP s'est arrêté à 30 secondes,
             le frigo à moitié corrigé, et personne pour le dire.</p>
        </div>
        <div>
          <h3>La conception qui en découle</h3>
          <p>La requête <strong>valide, écrit une ligne, et rend la main</strong>. Un travailleur de fond
             applique, une ligne après l'autre, sans minuterie. L'écran suit l'avancement.</p>
          <p>Une requête HTTP a une durée maximale ; un inventaire n'en a pas.
             Les faire coïncider était une erreur de conception, pas un réglage.</p>
        </div>
      </div>
    """),

    ("technique", "Le déploiement", """
      <div class="pile">
        <div class="etage"><span class="tag">API + base</span><strong>NAS Synology, Docker Compose</strong>
          <em>migrations rejouées à chaque démarrage — donc idempotentes, sans exception</em></div>
        <div class="etage"><span class="tag">Web</span><strong>Caddy sert le build statique</strong>
          <em>HTTPS, en-têtes de sécurité, pas de dépendance externe</em></div>
        <div class="etage"><span class="tag">Mobile</span><strong>EAS Update</strong>
          <em>le JavaScript arrive sur les téléphones au démarrage suivant</em></div>
        <div class="etage"><span class="tag">Sauvegarde</span><strong>Tâche planifiée quotidienne</strong>
          <em>« une sauvegarde qu'on n'a jamais essayé de relire n'est pas une sauvegarde »</em></div>
      </div>
    """),

    # ================================================================== ACTE 3
    ("qualite", "Ce qui garantit que ça marche", """
      <div class="chiffres">
        <div><strong>939</strong><span>tests automatisés</span></div>
        <div><strong>6 769</strong><span>lignes de test</span></div>
        <div><strong>26 %</strong><span>du code est du test</span></div>
        <div><strong>120</strong><span>commits en 5 semaines</span></div>
      </div>
      <p class="chute">632 tests côté front (<code>node:test</code>, dont 32 de rendu), 307 côté API
         (PHPUnit), comptés le 17 septembre 2026 : quelques secondes pour l'ensemble. Une suite
         qu'on n'attend pas est une suite qu'on lance.</p>
    """),

    ("qualite", "Le TDD, sans exception", """
      <p class="accroche">Le test est écrit d'abord, et on le regarde échouer.</p>
      <div class="deux">
        <div>
          <h3>Pourquoi cette rigueur</h3>
          <p>Un test écrit après le code passe du premier coup — ce qui ne prouve rien.
             Il vérifie les cas dont on se souvient, pas ceux qu'on aurait découverts.</p>
          <p>Deux fois, un test a réussi immédiatement : on a <strong>remis le code fautif</strong>
             pour vérifier qu'il tombait.</p>
        </div>
        <div>
          <h3>Ce que ça a rattrapé</h3>
          <p>L'audit a trouvé <strong>douze vérifications qui ne pouvaient pas échouer</strong> —
             des tests qui rassuraient sans rien garantir.</p>
          <p>Chaque correction du chantier en cours a son test, écrit et vu rouge avant le correctif.</p>
        </div>
      </div>
    """),

    ("qualite", "L'audit du code", """
      <p class="accroche">79 constats, chacun reproduit avant d'être corrigé.</p>
      <div class="chiffres">
        <div><strong>3</strong><span>critiques</span></div>
        <div><strong>14</strong><span>élevés</span></div>
        <div><strong>9 lots</strong><span>tous clos</span></div>
        <div><strong>0</strong><span>constat effacé sans preuve</span></div>
      </div>
      <p class="chute">Garde-fous automatiques, pannes réelles, chiffres faux montrés à l'utilisateur,
         puis sécurité et isolation. Le plan est écrit, l'avancement est daté, et ce qui reste
         est nommé — y compris ce qui attend un arbitrage produit.</p>
    """),

    ("qualite", "Un exemple, en entier", """
      <p class="accroche">Constat É1 — l'inventaire différé écrivait du stock sans vérifier à qui appartenait l'aliment.</p>
      <div class="deux">
        <div>
          <h3>Le défaut</h3>
          <p>Une route vérifiait la propriété de l'aliment. Sa jumelle, qui écrit le même stock par
             un autre chemin, ne l'avait jamais reçue.</p>
          <p>Conséquence : un compte pouvait poser 1 g sur l'aliment d'un autre compte, qui ne pouvait
             alors plus le supprimer. Pas une fuite — un blocage impossible à défaire.</p>
        </div>
        <div>
          <h3>La correction</h3>
          <p>Deux tests écrits et vus échouer. Puis la règle descendue au <strong>point de passage
             obligé de l'écriture</strong> : les trois chemins sont couverts d'un coup, au lieu d'un seul.</p>
          <p>Le refus ne nomme pas la ligne fautive — distinguer « n'existe pas » de « n'est pas à toi »
             offrirait l'énumération des identifiants.</p>
        </div>
      </div>
    """),

    ("qualite", "Les sept règles non négociables", """
      <ol class="regles">
        <li>Toute évolution du schéma s'écrit <strong>deux fois</strong> : schéma initial et migration</li>
        <li>Toute entité exposée en API est <strong>filtrée par propriétaire</strong></li>
        <li>Les valeurs nutritionnelles décrivent le produit <strong>tel qu'on le pèse</strong></li>
        <li>Convention <strong>européenne</strong> des fibres : 2 kcal/g, comptées à part</li>
        <li>Aucune formule métier recopiée — <strong>un seul module</strong> fait foi</li>
        <li>Vide ≠ zéro : un champ vide dit « je ne sais pas »</li>
        <li>Un chiffre faux est pire qu'un refus de répondre</li>
      </ol>
      <p class="chute">Chacune a été enfreinte au moins une fois, et l'audit en a mesuré le coût.
         Ce ne sont pas des préférences de style.</p>
    """),

    ("qualite", "Les garde-fous qui tournent tout seuls", """
      <div class="trois">
        <div class="carte"><h3>À l'écriture</h3><p>Un contrôle de typage se déclenche à chaque
          modification du front ; l'analyse statique PHP à chaque modification de l'API.
          L'erreur remonte en secondes, pas au commit.</p></div>
        <div class="carte"><h3>À l'installation</h3><p>Un script compare le schéma d'une base neuve
          à celui d'une base migrée et exige un écart nul. Un autre rejoue les migrations dans l'ordre.</p></div>
        <div class="carte"><h3>Au démarrage</h3><p>Les migrations sont rejouées à chaque
          lancement du conteneur : elles doivent donc être rejouables sans dégât, par construction.</p></div>
      </div>
    """),

    # ================================================================== ACTE 4
    ("ia", "Comment ce projet est développé", """
      <p class="accroche">Assisté par IA, avec des garde-fous écrits pour ce projet précis.</p>
      <div class="deux">
        <div>
          <h3>L'outil</h3>
          <p><strong>Claude Code</strong> en terminal, sur une seule arborescence.
             Le dépôt porte lui-même ses règles : un fichier d'instructions que l'assistant lit
             à chaque session, et qui contient les sept règles, l'architecture et les pièges connus.</p>
        </div>
        <div>
          <h3>Le principe</h3>
          <p>L'IA ne décide pas des règles : elle les applique. Le TDD, l'interdiction de recopier une
             formule, l'obligation de coller la sortie des tests plutôt que d'affirmer —
             tout cela est écrit dans le dépôt, versionné, et opposable.</p>
        </div>
      </div>
    """),

    ("ia", "Des compétences écrites pour ce projet", """
      <p class="accroche">Six « skills » que personne d'autre ne pouvait écrire.</p>
      <div class="grille-skills">
        <div><strong>isolation-donnees</strong><span>la règle de cloisonnement, ses trois pièces,
          et l'obligation de vérifier chaque chemin d'écriture</span></div>
        <div><strong>tests-api</strong><span>le motif de test du projet : services scellés instanciés
          pour de vrai autour d'une connexion doublée</span></div>
        <div><strong>front-fitcarnet</strong><span>les modules de référence et l'interdiction d'en
          recopier les formules</span></div>
        <div><strong>nutrition-fitcarnet</strong><span>fibres à 2 kcal/g, poids cru, vide ≠ zéro</span></div>
        <div><strong>schema-base</strong><span>double écriture du schéma, idempotence, ordre des migrations</span></div>
        <div><strong>postgres</strong><span>index, plans de requête, maintenance</span></div>
      </div>
      <p class="chute">Dix compétences génériques ont été <em>supprimées</em> : elles
         décrivaient une architecture que le code n'a pas. Un outillage qui ment coûte plus qu'il ne rapporte.</p>
    """),

    ("ia", "Un graphe de connaissances du code", """
      <div class="chiffres">
        <div><strong>2 532</strong><span>nœuds</span></div>
        <div><strong>5 383</strong><span>relations</span></div>
        <div><strong>159</strong><span>communautés</span></div>
        <div><strong>266</strong><span>fichiers indexés</span></div>
      </div>
      <p class="chute">Le code, la documentation et l'audit sont indexés ensemble : on demande
         « où est le contrôle de propriété ? » et on obtient le sous-graphe, pas une recherche
         textuelle. Deux points d'arrêt forcent l'assistant à consulter le graphe avant de fouiller
         les fichiers — ce qui coûte moins et trompe moins.</p>
    """),

    ("ia", "Ce que ça change, concrètement", """
      <div class="deux">
        <div>
          <h3>Ce qui est gagné</h3>
          <ul>
            <li>26 000 lignes et 468 tests en cinq semaines, à une personne</li>
            <li>Un audit de 79 constats mené jusqu'au bout, avec scénarios reproduits</li>
            <li>Une documentation qui reste vraie, parce qu'elle est vérifiée à chaque session</li>
          </ul>
        </div>
        <div>
          <h3>Ce qui ne change pas</h3>
          <ul>
            <li>Les décisions produit restent humaines — et sont notées comme telles</li>
            <li>Rien n'est déclaré terminé sans la sortie des tests à l'appui</li>
            <li>Une correction et une refonte ne partagent jamais un commit</li>
          </ul>
        </div>
      </div>
      <p class="chute">La suite : des agents de relecture spécialisés — isolation des données,
         conventions nutritionnelles — déclenchés avant chaque livraison.</p>
    """),

    # CE QU'ON NE PROMET PAS — AJOUTÉE LE 17 SEPTEMBRE 2026.
    #
    # Cette liste vivait dans `demo-30-minutes.md`, sous « ce qu'on ne montre
    # pas ». Elle n'était sur aucune slide, donc elle ne sortait que si le
    # présentateur y pensait — et c'est précisément le moment où l'on promet
    # sans le vouloir. Le partage de modèle a été promis ainsi, à un champ qui
    # ne faisait rien.
    ("qualite", "Ce qui n'existe pas, et qu'on ne promet donc pas", """
      <p class="accroche">Dire ce qui manque est ce qui rend crédible le reste.</p>
      <div class="deux">
        <div>
          <h3>Absent de l'application</h3>
          <ul>
            <li><strong>Le partage d'un modèle</strong> — le champ ne faisait rien ;
                il a été retiré</li>
            <li><strong>Créer un exercice</strong> — réservé à l'API, sans aucun écran</li>
            <li><strong>Changer son mot de passe ou son adresse</strong> — la règle est complète
                côté serveur, aucun écran ne l'appelle</li>
            <li><strong>Voir et couper ses sessions</strong> — même chose</li>
          </ul>
        </div>
        <div>
          <h3>Non démontrable ici</h3>
          <ul>
            <li>La <strong>source Grocy</strong>, sans instance configurée</li>
            <li>Les <strong>notifications téléphone fermé</strong> — absentes d'Expo Go
                depuis le SDK 53, il faut l'APK</li>
          </ul>
          <h3>Et en propre</h3>
          <ul>
            <li>Pas de date de mise en production ouverte</li>
            <li>Pas de support, pas de reprise de données</li>
            <li>Taillé pour un usage personnel, multi-comptes par invitation —
                c'est un choix, pas une limite technique</li>
          </ul>
        </div>
      </div>
    """),

    ("titre", "Démonstration", """
      <p class="accroche">Huit parcours, filmés dans l'application, sans montage des écrans.</p>
      <p class="sous">Le stock du frigo et le détail d'un aliment · un inventaire à trois écarts,
         appliqué en tâche de fond · les cibles par repas · la composition automatique ·
         le batch cooking · une séance, la saisie d'une série et le 1RM qui se recalcule ·
         les programmes</p>
      <p class="meta">Les données couvrent neuf semaines d'usage : 23 séances, 123 séries,
         8 aliments, 2 plans de repas. La vidéo est muette : elle se commente en direct,
         et chaque parcours est un chapitre — on peut y revenir pendant les questions.</p>
    """),
]

# --------------------------------------------------------------------------
FIL = {
    "titre": ("", "#e8b84b"),
    "produit": ("Le produit", "#e8b84b"),
    "technique": ("L'architecture", "#6fa8dc"),
    "qualite": ("Les garanties", "#7fc99a"),
    "ia": ("L'outillage", "#c39bd3"),
}

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f1114;color:#e9e6e0;overflow:hidden;
     font:16px/1.58 "IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
.slide{position:absolute;inset:0;display:none;flex-direction:column;padding:2.4rem 4.5rem 3.2rem;
       animation:entre .28s ease;overflow-y:auto}
.slide.on{display:flex}
@keyframes entre{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
h1{font-family:Archivo,system-ui,sans-serif;font-size:2.2rem;font-weight:800;
   letter-spacing:-.025em;margin-bottom:1.2rem;line-height:1.12;text-wrap:balance}
.slide[data-acte="titre"]{justify-content:center;align-items:flex-start;text-align:left}
.slide[data-acte="titre"] h1{font-size:4.4rem;letter-spacing:-.035em;margin-bottom:.6rem}
h3{font-family:Archivo,system-ui,sans-serif;font-size:.92rem;font-weight:600;
   text-transform:uppercase;letter-spacing:.11em;color:#9aa0a8;margin-bottom:.7rem}
p{margin-bottom:.9rem}
.accroche{font-size:1.35rem;line-height:1.35;color:#fff;margin-bottom:1.1rem;max-width:58ch}
.sous{font-size:1.15rem;color:#b9bec6;max-width:62ch}
.meta{font-size:.92rem;color:#71767e;margin-top:1.6rem}
.chute{margin-top:auto;padding-top:1.1rem;border-top:1px solid #262a31;color:#b9bec6;font-size:1rem;max-width:92ch}
ul,ol{margin:0 0 .8rem 1.15rem}li{margin-bottom:.45rem}
em{color:#cfd3d9;font-style:italic}
strong{color:#fff}
code{background:#1b1f25;padding:.1em .35em;border-radius:3px;font-size:.9em}
.deux{display:grid;grid-template-columns:1fr 1fr;gap:2.6rem;align-items:start}
.trois{display:grid;grid-template-columns:repeat(3,1fr);gap:1.4rem}
.carte{background:#161a20;border:1px solid #242931;border-radius:9px;padding:1.2rem 1.3rem}
.carte h3{color:#e8b84b}
figure{margin:0;flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0}
figure img{display:block;margin:0 auto;width:auto;height:auto;max-width:100%;max-height:62vh;
           object-fit:contain;border-radius:7px;border:1px solid #242931}
figcaption{margin-top:.7rem;font-size:.9rem;color:#8b9098;text-align:center}
.deux figure img{max-height:52vh}
.pile{display:flex;flex-direction:column;gap:.5rem}
.etage{background:#161a20;border-left:3px solid var(--c);border-radius:0 7px 7px 0;padding:.6rem 1.15rem;
       display:grid;grid-template-columns:130px 1fr;gap:1.1rem;align-items:baseline}
.etage .tag{font-size:.76rem;text-transform:uppercase;letter-spacing:.09em;color:#8b9098}
.etage strong{display:block;font-size:1.08rem}
.etage em{display:block;color:#9aa0a8;font-size:.93rem;font-style:normal;margin-top:.15rem;
          grid-column:2}
.chiffres{display:grid;grid-template-columns:repeat(4,1fr);gap:1.4rem;margin:1.2rem 0 1.6rem}
.chiffres div{text-align:center;background:#161a20;border:1px solid #242931;border-radius:9px;padding:1.1rem .8rem}
.chiffres strong{display:block;font-family:Archivo,system-ui,sans-serif;font-weight:800;
                 font-size:2.6rem;color:var(--c);line-height:1;font-variant-numeric:tabular-nums}
.chiffres span{display:block;margin-top:.5rem;font-size:.9rem;color:#9aa0a8}
.regles{font-size:1.08rem;columns:1}
.regles li{margin-bottom:.6rem}
.grille-skills{display:grid;grid-template-columns:1fr 1fr;gap:.8rem 2rem}
.grille-skills div{border-left:2px solid #2b3038;padding-left:.9rem}
.grille-skills strong{display:block;color:#e8b84b;font-size:1rem}
.grille-skills span{color:#9aa0a8;font-size:.93rem}
.manque{color:#c0392b;font-style:italic}
.bandeau{position:fixed;top:0;left:0;right:0;height:3px;background:var(--c);opacity:.85}
.pied{position:fixed;bottom:1.1rem;left:4.5rem;right:4.5rem;display:flex;justify-content:space-between;
      font-size:.82rem;color:#5f646c;letter-spacing:.04em}
.pied .acte{color:var(--c);opacity:.8}
@media print{.slide{display:flex;position:relative;page-break-after:always;height:100vh}}
"""

JS = """
const slides=[...document.querySelectorAll('.slide')];
let i=0;
function montre(n){
  i=Math.max(0,Math.min(slides.length-1,n));
  slides.forEach((s,k)=>s.classList.toggle('on',k===i));
  const a=slides[i].dataset.acte, c=getComputedStyle(slides[i]).getPropertyValue('--c');
  document.documentElement.style.setProperty('--c',c);
  document.getElementById('acte').textContent=slides[i].dataset.fil||'';
  document.getElementById('num').textContent=(i+1)+' / '+slides.length;
  location.hash=i+1;
}
document.addEventListener('keydown',e=>{
  if(['ArrowRight','PageDown',' ','Enter'].includes(e.key)){e.preventDefault();montre(i+1)}
  if(['ArrowLeft','PageUp','Backspace'].includes(e.key)){e.preventDefault();montre(i-1)}
  if(e.key==='Home')montre(0);
  if(e.key==='End')montre(slides.length-1);
  if(e.key==='f'||e.key==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}
});
document.addEventListener('click',e=>{if(!e.target.closest('a'))montre(i+(e.clientX>innerWidth/2?1:-1))});
montre(parseInt(location.hash.slice(1))-1||0);
"""


def construire() -> str:
    html = [
        # LE CHARSET D'ABORD. Servi en file:// ou par un serveur qui ne dit rien,
        # un HTML sans cette ligne s'affiche « composÃ©s » : vu en relecture le
        # 9 septembre 2026, sur la slide de titre.
        '<meta charset="utf-8">',
        '<link rel="preconnect" href="https://fonts.googleapis.com">'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
        'family=Archivo:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&display=swap">',
        "<title>fitcarnet</title>",
        f"<style>:root{{--c:#e8b84b}}{CSS}</style>",
        '<div class="bandeau"></div>',
    ]
    for acte, titre, corps in SLIDES:
        fil, couleur = FIL[acte]
        titre_html = "" if acte == "titre" and titre == "fitcarnet" else f"<h1>{titre}</h1>"
        if acte == "titre":
            titre_html = f"<h1>{titre}</h1>"
        html.append(
            f'<section class="slide" data-acte="{acte}" data-fil="{fil}" '
            f'style="--c:{couleur}">{titre_html}{corps}</section>'
        )
    html.append('<div class="pied"><span class="acte" id="acte"></span>'
                '<span>fitcarnet</span><span id="num"></span></div>')
    html.append(f"<script>{JS}</script>")
    return "\n".join(html)


sortie = RACINE / "fitcarnet-presentation.html"
sortie.write_text(construire(), encoding="utf-8")
taille = sortie.stat().st_size
print(f"{sortie.name} — {len(SLIDES)} slides, {taille // 1024} Ko")

# D'OÙ VIENT CHAQUE IMAGE. EMPLACEMENTS est rempli par visuel(), appelé quand
# les f-strings de SLIDES sont évaluées — au chargement du module. L'ancien
# contrôle ne regardait que captures/ : il aurait déclaré manquante une image
# posée dans images/.
print("images des slides (pour remplacer : presentation/images/<nom>.png) :")
for nom, legende, origine in EMPLACEMENTS:
    print(f"  {nom:<24} {origine:<24} {legende[:46]}")
if any(origine == "MANQUANTE" for _, _, origine in EMPLACEMENTS):
    print("images manquantes :", ", ".join(n for n, _, o in EMPLACEMENTS if o == "MANQUANTE"))
