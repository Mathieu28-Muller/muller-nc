-- ============================================================
--  SCHÉMA POSTGRESQL — NC Muller Automotive
--  Généré le 09/05/2026 — Migration depuis stockage JSON plat
--
--  Usage :
--    psql -U postgres -d nc_muller -f schema_postgresql.sql
--
--  Principe dual-write :
--    Mode 'json'     → comportement actuel inchangé
--    Mode 'dual'     → écriture JSON + PG, lecture JSON (7 jours)
--    Mode 'postgres' → tout depuis PostgreSQL (bascule finale)
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "unaccent";   -- recherche sans accent (optionnel)

-- ── Suppression dans l'ordre inverse (re-run idempotent) ─────
DROP TABLE IF EXISTS nc_parent_notifications  CASCADE;
DROP TABLE IF EXISTS nc_parent_journal        CASCADE;
DROP TABLE IF EXISTS nc_action_relances       CASCADE;
DROP TABLE IF EXISTS nc_action_reponses       CASCADE;
DROP TABLE IF EXISTS nc_action_historique     CASCADE;
DROP TABLE IF EXISTS nc_actions               CASCADE;
DROP TABLE IF EXISTS nc_discussion            CASCADE;
DROP TABLE IF EXISTS nc_historique            CASCADE;
DROP TABLE IF EXISTS nc_fiches                CASCADE;
DROP TABLE IF EXISTS nc_compteurs             CASCADE;
DROP TABLE IF EXISTS nc_users                 CASCADE;
DROP TABLE IF EXISTS app_users                CASCADE;


-- ════════════════════════════════════════════════════════════
--  1. UTILISATEURS
-- ════════════════════════════════════════════════════════════

-- Utilisateurs application principale (users.json)
CREATE TABLE app_users (
    user_login   TEXT        PRIMARY KEY,
    pass_hash    TEXT        NOT NULL,
    role         TEXT        NOT NULL DEFAULT 'user'
                             CHECK (role IN ('admin','contributor','user')),
    name         TEXT        NOT NULL,
    company      TEXT,
    status       TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('active','pending','suspended')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login   TIMESTAMPTZ
);

-- Utilisateurs NC (nc-users.json)
CREATE TABLE nc_users (
    user_login   TEXT        PRIMARY KEY,
    pass_hash    TEXT        NOT NULL,
    role         TEXT        NOT NULL DEFAULT 'nc_lecteur'
                             CHECK (role IN ('nc_admin','nc_chef_produit','nc_lecteur','nc_viewer')),
    name         TEXT        NOT NULL,
    email        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login   TIMESTAMPTZ
);


-- ════════════════════════════════════════════════════════════
--  2. COMPTEURS NUMÉROTATION NC
-- ════════════════════════════════════════════════════════════

CREATE TABLE nc_compteurs (
    annee        INTEGER PRIMARY KEY,
    valeur       INTEGER NOT NULL DEFAULT 0,
    parent_valeur INTEGER NOT NULL DEFAULT 0   -- compteur NC-P-XXXXX
);


-- ════════════════════════════════════════════════════════════
--  3. FICHES NC
-- ════════════════════════════════════════════════════════════

CREATE TABLE nc_fiches (

    -- ── Identité ─────────────────────────────────────────────
    numero              TEXT        PRIMARY KEY,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ,

    -- ── Cycle de vie ─────────────────────────────────────────
    statut              TEXT        NOT NULL DEFAULT 'ouvert'
                                    CHECK (statut IN (
                                        'ouvert','en_cours','en_traitement',
                                        'resolu','clos','non_pertinent','rattachee'
                                    )),
    closed_at           TIMESTAMPTZ,
    clos_par            TEXT,
    cloture_via_parent  TEXT,       -- numéro NC parent qui a clôturé
    duree_total         INTEGER,    -- jours création → clôture
    duree_traitement    INTEGER,    -- jours en_cours → clôture
    reouverture_date    TIMESTAMPTZ,-- pour taux_efficacite (§10.2)
    echeance_respectee  BOOLEAN,

    -- ── Déclarant ────────────────────────────────────────────
    redacteur           TEXT,
    email_redacteur     TEXT,
    date_decouverte     DATE,
    decouvreur          TEXT,

    -- ── Localisation / périmètre ─────────────────────────────
    perimetre           TEXT,
    source_detection    TEXT,

    -- ── Produit / commande ───────────────────────────────────
    no_commande         TEXT,
    ref_produit         TEXT,
    famille_produit     TEXT,
    no_serie            TEXT,
    version_prog        TEXT,
    quantite_unites     INTEGER,
    sap_code            TEXT,

    -- ── Client ───────────────────────────────────────────────
    nom_client          TEXT,
    cp                  TEXT,
    ville               TEXT,
    pays                TEXT,

    -- ── Contenu NC ───────────────────────────────────────────
    probleme            TEXT,
    reparation          TEXT,
    suggestion          TEXT,

    -- ── Médias ───────────────────────────────────────────────
    media_files             JSONB   NOT NULL DEFAULT '[]',
    media_files_traitement  JSONB   NOT NULL DEFAULT '[]',

    -- ── Qualification qualité ────────────────────────────────
    gravite             TEXT        CHECK (gravite IN ('critique','majeure','mineure') OR gravite IS NULL),
    risque_impact       JSONB,      -- {impact_client, conformite, securite, recurrence}
    score_risque        INTEGER,
    processus           TEXT,
    cinq_pourquoi       TEXT,
    cause_racine        TEXT,
    ishikawa            JSONB,
    retour_client       TEXT,
    blocage_signale     BOOLEAN     DEFAULT FALSE,
    commentaire_qualite TEXT,
    type_cause          TEXT,

    -- ── Traitement ───────────────────────────────────────────
    pilote              TEXT,
    pilote_email        TEXT,
    pilote_nom          TEXT,
    delai_action        TIMESTAMPTZ,
    type_action         TEXT,
    cout                NUMERIC(10,2),
    commentaire_cloture TEXT,

    -- ── Analyse CAPA (NC parent) ─────────────────────────────
    analyse_5p          JSONB,
    preuve_efficacite   TEXT,

    -- ── Relations parent / satellite ─────────────────────────
    is_parent           BOOLEAN     NOT NULL DEFAULT FALSE,
    is_satellite        BOOLEAN     NOT NULL DEFAULT FALSE,
    parent_id           TEXT        REFERENCES nc_fiches(numero) ON DELETE SET NULL,
    parent_label        TEXT,
    satellites          TEXT[],     -- dénormalisation intentionnelle pour perf lecture
    groupe_label        TEXT,
    groupe_motif        TEXT,
    groupe_created_at   TIMESTAMPTZ,
    groupe_created_by   TEXT,
    groupe_perimetre    TEXT[],
    rattachement_date   TIMESTAMPTZ,
    rattachement_by     TEXT
);

-- Index principaux (performance requêtes fréquentes)
CREATE INDEX idx_nc_fiches_statut        ON nc_fiches (statut);
CREATE INDEX idx_nc_fiches_created_at    ON nc_fiches (created_at DESC);
CREATE INDEX idx_nc_fiches_famille       ON nc_fiches (famille_produit);
CREATE INDEX idx_nc_fiches_perimetre     ON nc_fiches (perimetre);
CREATE INDEX idx_nc_fiches_is_satellite  ON nc_fiches (is_satellite) WHERE is_satellite = TRUE;
CREATE INDEX idx_nc_fiches_is_parent     ON nc_fiches (is_parent)    WHERE is_parent    = TRUE;
CREATE INDEX idx_nc_fiches_parent_id     ON nc_fiches (parent_id)    WHERE parent_id IS NOT NULL;
CREATE INDEX idx_nc_fiches_annee         ON nc_fiches (date(created_at));


-- ════════════════════════════════════════════════════════════
--  4. HISTORIQUE NC
-- ════════════════════════════════════════════════════════════

CREATE TABLE nc_historique (
    id          BIGSERIAL   PRIMARY KEY,
    nc_numero   TEXT        NOT NULL REFERENCES nc_fiches(numero) ON DELETE CASCADE,
    date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    statut      TEXT,
    commentaire TEXT,
    par         TEXT,
    ordre       INTEGER     NOT NULL DEFAULT 0   -- conserve l'ordre d'insertion
);

CREATE INDEX idx_nc_historique_nc ON nc_historique (nc_numero, ordre);


-- ════════════════════════════════════════════════════════════
--  5. ACTIONS CAPA
-- ════════════════════════════════════════════════════════════

CREATE TABLE nc_actions (
    id                  TEXT        PRIMARY KEY,   -- UUID généré côté Node
    nc_numero           TEXT        NOT NULL REFERENCES nc_fiches(numero) ON DELETE CASCADE,
    type                TEXT        NOT NULL
                                    CHECK (type IN ('immediate','curative','corrective','preventive')),
    pilote              TEXT,
    echeance            DATE,
    commentaire_action  TEXT,
    statut              TEXT        NOT NULL DEFAULT 'ouvert'
                                    CHECK (statut IN ('ouvert','en_cours','cloturé')),
    date_pilote_reponse TIMESTAMPTZ,
    echeance_respectee  BOOLEAN,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          TEXT
);

CREATE INDEX idx_nc_actions_nc     ON nc_actions (nc_numero);
CREATE INDEX idx_nc_actions_statut ON nc_actions (statut);
CREATE INDEX idx_nc_actions_pilote ON nc_actions (pilote);

-- Historique des changements de statut d'une action
CREATE TABLE nc_action_historique (
    id          BIGSERIAL   PRIMARY KEY,
    action_id   TEXT        NOT NULL REFERENCES nc_actions(id) ON DELETE CASCADE,
    date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    statut      TEXT        NOT NULL,
    par         TEXT
);

CREATE INDEX idx_nc_action_hist_action ON nc_action_historique (action_id);

-- Réponses des pilotes aux actions
CREATE TABLE nc_action_reponses (
    id          BIGSERIAL   PRIMARY KEY,
    action_id   TEXT        NOT NULL REFERENCES nc_actions(id) ON DELETE CASCADE,
    reponse     TEXT,
    par         TEXT,
    date        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nc_action_rep_action ON nc_action_reponses (action_id);

-- Relances
CREATE TABLE nc_action_relances (
    id          BIGSERIAL   PRIMARY KEY,
    action_id   TEXT        NOT NULL REFERENCES nc_actions(id) ON DELETE CASCADE,
    date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    par         TEXT
);

CREATE INDEX idx_nc_action_rel_action ON nc_action_relances (action_id);


-- ════════════════════════════════════════════════════════════
--  6. DISCUSSION (NC parent)
-- ════════════════════════════════════════════════════════════

CREATE TABLE nc_discussion (
    id          BIGSERIAL   PRIMARY KEY,
    nc_numero   TEXT        NOT NULL REFERENCES nc_fiches(numero) ON DELETE CASCADE,
    date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    message     TEXT,
    par         TEXT,
    par_email   TEXT
);

CREATE INDEX idx_nc_discussion_nc ON nc_discussion (nc_numero);


-- ════════════════════════════════════════════════════════════
--  7. JOURNAL GROUPES PARENTS (nc-parent-groups.json)
-- ════════════════════════════════════════════════════════════

CREATE TABLE nc_parent_journal (
    id          BIGSERIAL   PRIMARY KEY,
    action      TEXT        NOT NULL,   -- 'GROUPE_CREE', 'SATELLITE_AJOUTE', 'SATELLITE_DETACHE', 'GROUPE_CLOS'
    parent_id   TEXT,
    satellites  TEXT[],
    by_user     TEXT,
    motif       TEXT,
    label       TEXT,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nc_parent_journal_parent ON nc_parent_journal (parent_id);
CREATE INDEX idx_nc_parent_journal_ts     ON nc_parent_journal (timestamp DESC);


-- ════════════════════════════════════════════════════════════
--  8. NOTIFICATIONS NC PARENT
-- ════════════════════════════════════════════════════════════

CREATE TABLE nc_parent_notifications (
    id          BIGSERIAL   PRIMARY KEY,
    type        TEXT,
    parent_id   TEXT,
    nc_id       TEXT,
    by_user     TEXT,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lu          BOOLEAN     NOT NULL DEFAULT FALSE
);


-- ════════════════════════════════════════════════════════════
--  9. VUES UTILITAIRES (remplacent les calculs JSON)
-- ════════════════════════════════════════════════════════════

-- Vue ISO §9.1 : NC réelles (standards + parents, satellites exclus)
CREATE VIEW v_nc_reelles AS
    SELECT * FROM nc_fiches WHERE is_satellite = FALSE;

-- Vue KPI par périmètre (pour dashboard)
CREATE VIEW v_kpi_perimetre AS
    SELECT
        perimetre,
        COUNT(*)                                        AS total,
        COUNT(*) FILTER (WHERE statut = 'ouvert')      AS nb_ouvertes,
        COUNT(*) FILTER (WHERE statut = 'clos')        AS nb_closes,
        ROUND(AVG(duree_total))                        AS delai_moyen_j,
        SUM(cout)                                      AS cout_total
    FROM nc_fiches
    WHERE is_satellite = FALSE
    GROUP BY perimetre;

-- Vue KPI par famille de produit
CREATE VIEW v_kpi_famille AS
    SELECT
        famille_produit,
        COUNT(*)                                        AS total,
        COUNT(*) FILTER (WHERE statut = 'clos')        AS nb_closes,
        ROUND(AVG(duree_total))                        AS delai_moyen_j
    FROM nc_fiches
    WHERE is_satellite = FALSE
    GROUP BY famille_produit;


-- ════════════════════════════════════════════════════════════
--  10. COMMENTAIRES MIGRATION
-- ════════════════════════════════════════════════════════════

COMMENT ON TABLE nc_fiches               IS 'Fiches NC — standards, parents et satellites. ISO §8.7 / §10.2';
COMMENT ON TABLE nc_historique           IS 'Journal de cycle de vie de chaque NC. ISO §10.2.2 / LNE-4';
COMMENT ON TABLE nc_actions              IS 'Actions CAPA (immédiate, curative, corrective, préventive). ISO §10.2';
COMMENT ON TABLE nc_action_reponses      IS 'Réponses des pilotes aux actions. ISO §10.2.1';
COMMENT ON TABLE nc_parent_journal       IS 'Journal immuable des groupes NC parent. ISO §10.3 / LNE-4';
COMMENT ON COLUMN nc_fiches.is_satellite IS 'TRUE = NC rattachée à un parent, exclue du comptage ISO §9.1';
COMMENT ON COLUMN nc_fiches.is_parent    IS 'TRUE = NC systémique regroupant plusieurs occurrences';
COMMENT ON COLUMN nc_fiches.cout         IS 'Coût non-qualité — tous enregistrements inclus (coût économique réel)';
COMMENT ON VIEW   v_nc_reelles           IS 'NC réelles = standards + parents (satellites exclus) — base des KPI ISO §9.1';
