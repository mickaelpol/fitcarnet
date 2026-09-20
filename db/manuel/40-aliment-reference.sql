-- ---------------------------------------------------------------------
--  La table de reference CIQUAL
--
--  Premier pas du chantier « quitter Grocy » (20 septembre 2026). Elle porte
--  les 3 484 aliments publies par l'Anses, et sert a RATTACHER un aliment cree
--  par quelqu'un — jamais a remplir ses valeurs. Voir le commentaire complet
--  dans `db/01-schema.sql` et `docs/plan-serveur-autoritaire.md`, palier 4.
--
--  IDEMPOTENTE : rejouee a chaque demarrage par entrypoint-prod.sh.
--  Le CONTENU est charge a part, par `db/03-ciqual.sql`.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS aliment_reference (
    -- Le code Anses (« 20535 »), stable d'une edition a l'autre : c'est LUI
    -- qu'un aliment reference, jamais le nom.
    code            TEXT PRIMARY KEY,
    nom             TEXT NOT NULL,
    groupe_code     TEXT NOT NULL,
    groupe          TEXT NOT NULL,
    -- LE SOUS-GROUPE EST CE QUI PORTERA LES ASSOCIATIONS CULINAIRES (palier 4
    -- de `docs/plan-serveur-autoritaire.md`). 65 valeurs pour 3 484 aliments,
    -- comptees le 20 septembre 2026 et non estimees :
    -- c'est ce qui rend la connaissance finie et relisable, la ou enumerer les
    -- paires d'aliments en ferait dix millions.
    sousgroupe_code TEXT NOT NULL,
    sousgroupe      TEXT NOT NULL,
    -- Pour 100 g du produit TEL QU'ON LE PESE (regle 3). L'energie vient de la
    -- colonne « Reglement UE N° 1169/2011 », qui compte les fibres a 2 kcal/g
    -- (regle 4) — pas de « N x facteur Jones », qui se trompe de convention.
    kcal100         NUMERIC(8, 2),
    prot100         NUMERIC(8, 2),
    gluc100         NUMERIC(8, 2),
    lip100          NUMERIC(8, 2),
    fibres100       NUMERIC(8, 2)
);

-- La recherche du selecteur « ca ressemble a… » se fait sur le nom, sans
-- accents ni casse : `unaccent` n'est pas installe, on indexe donc le nom
-- en minuscules et on laisse le front retirer les accents comme il le fait
-- deja (`front/src/calcul/texte.ts`).
CREATE INDEX IF NOT EXISTS aliment_reference_par_nom ON aliment_reference (lower(nom));
CREATE INDEX IF NOT EXISTS aliment_reference_par_sousgroupe ON aliment_reference (sousgroupe_code);
