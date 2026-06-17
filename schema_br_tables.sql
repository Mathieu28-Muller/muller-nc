-- Tables PostgreSQL pour le module BR (Rappel Sécurité Basse Tension)
-- À exécuter sur OVH : sudo -u postgres psql nc_muller < schema_br_tables.sql

CREATE TABLE IF NOT EXISTS br_emails_autorises (
    id         SERIAL PRIMARY KEY,
    email      VARCHAR(255) UNIQUE NOT NULL,
    nom        VARCHAR(255) DEFAULT '',
    prenom     VARCHAR(255) DEFAULT '',
    service    VARCHAR(255) DEFAULT '',
    actif      BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS br_resultats (
    id         SERIAL PRIMARY KEY,
    nom        VARCHAR(255),
    prenom     VARCHAR(255),
    email      VARCHAR(255) NOT NULL,
    score      INTEGER,
    score_pct  INTEGER,
    verdict    VARCHAR(50),
    reponses   TEXT,
    duree_sec  INTEGER,
    ip         VARCHAR(60),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Droits pour l'utilisateur applicatif nc_user
GRANT ALL PRIVILEGES ON TABLE br_emails_autorises TO nc_user;
GRANT ALL PRIVILEGES ON TABLE br_resultats TO nc_user;
GRANT USAGE, SELECT ON SEQUENCE br_emails_autorises_id_seq TO nc_user;
GRANT USAGE, SELECT ON SEQUENCE br_resultats_id_seq TO nc_user;

\echo 'Tables BR creees avec succes.'
