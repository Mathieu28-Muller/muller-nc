-- ============================================================
--  RESTAURATION MODULE BR — données exportées + ODS whitelist
--  Généré le 26/06/2026 — à exécuter sur OVH :
--    sudo -u postgres psql nc_muller < restore_br_data.sql
-- ============================================================

-- S'assurer que les tables existent
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

GRANT ALL PRIVILEGES ON TABLE br_emails_autorises TO nc_user;
GRANT ALL PRIVILEGES ON TABLE br_resultats TO nc_user;
GRANT USAGE, SELECT ON SEQUENCE br_emails_autorises_id_seq TO nc_user;
GRANT USAGE, SELECT ON SEQUENCE br_resultats_id_seq TO nc_user;

-- ============================================================
--  1. LISTE BLANCHE COMPLÈTE (57 personnes — source ODS)
--     Emails corrigés :
--       - Bury: dbury@mullerautomotiv.fr → dbury@mullerautomotive.fr
--       - Noel: fnoël@ → fnoel@
--       - Peillon/Dufour: emails retrouvés via ODS
-- ============================================================

INSERT INTO br_emails_autorises (email, nom, prenom, actif) VALUES
('garekiom@mullerautomotive.fr',        'Arekiom',         'Gislain',    true),
('mbaroudi@mullerautomotive.fr',        'Baroudi',         'Mehdi',      true),
('fbarthelemy@mullerautomotive.fr',     'Barthelemy',      'François',   true),
('sbessou@mullerautomotive.fr',         'BESSOU',          'Stéphane',   true),
('mboudaroua@mullerautomotive.fr',      'Boudaroua',       'Mohamed',    true),
('dboussour@mullerautomotive.fr',       'Boussour',        'David',      true),
('rboutron@mullerautomotive.fr',        'BOUTRON',         'Richard',    true),
('dbury@mullerautomotive.fr',           'Bury',            'Dominique',  true),
('tcarvalho@mullerautomotive.fr',       'CARVALHO',        'Thibaut',    true),
('dcoasne@mullerautomotive.fr',         'Coasne',          'David',      true),
('dcolin@mullerautomotive.fr',          'Colin',           'Didier',     true),
('jcortey@mullerautomotive.fr',         'Cortey',          'Julien',     true),
('pdaviaud@mullerautomotive.fr',        'Daviaud',         'Philippe',   true),
('dcheck@mullerautomotive.fr',          'Davoud',          'Check',      true),
('jdufour@mullerautomotive.fr',         'Dufour',          'Jérémy',     true),
('pdufrene@mullerautomotive.fr',        'Dufrene',         'Patrice',    true),
('mgilles@mullerautomotive.fr',         'Gilles',          'Maugan',     true),
('egouin@mullerautomotive.fr',          'Gouin',           'Emmanuel',   true),
('sguihard@mullerautomotive.fr',        'Guihard',         'Stéphane',   true),
('rguyomard--llorca@mullerautomotive.fr','GUYOMARD-LLORCA','Raphaël',    true),
('fhallier@mullerautomotive.fr',        'Hallier',         'Franck',     true),
('jlhay@mullerautomotive.fr',           'Hay',             'Jean-Luc',   true),
('jhilaire@mullerautomotive.fr',        'Hilaire',         'Julien',     true),
('imohamad@mullerautomotive.fr',        'Ismail',          'Mohamad',    true),
('mjolly@mullerautomotive.fr',          'Jolly',           'Mickael',    true),
('sjoseph@mullerautomotive.fr',         'Joseph',          'Stéphane',   true),
('jlapeyre@mullerautomotive.fr',        'Julien',          'Lapeyre',    true),
('rleleu@mullerautomotive.fr',          'LELEU',           'Remy',       true),
('tleroy@mullerautomotive.fr',          'Leroy',           'Thierry',    true),
('bmaguin@mullerautomotive.fr',         'Maguin',          'Bernard',    true),
('emauclair@mullerautomotive.fr',       'Mauclair',        'Emmanuel',   true),
('mgalland@mullerautomotive.fr',        'Michel',          'Galland',    true),
('mderraz@mullerautomotive.fr',         'Mohamed',         'Derraz',     true),
('fnoel@mullerautomotive.fr',           'Noel',            'Frédéric',   true),
('souarab@mullerautomotive.fr',         'Ouarab',          'Samir',      true),
('speillon@mullerautomotive.fr',        'Peillon',         'Stéphane',   true),
('lpercheron@mullerautomotive.fr',      'Percheron',       'Lucas',      true),
('nperrier@mullerautomotive.fr',        'PERRIER',         'Nicolas',    true),
('apinson@mullerautomotive.fr',         'Pinson',          'Arnaud',     true),
('cpires@mullerautomotive.fr',          'Pires',           'Carlos',     true),
('spujo@mullerautomotive.fr',           'Pujo',            'Sébastien',  true),
('hrenoult@mullerautomotive.fr',        'Renoult',         'Hubert',     true),
('hugorenoult@mullerautomotive.fr',     'Renoult',         'Hugo',       true),
('lribeiro@mullerautomotive.fr',        'Ribeiro',         'Luis',       true),
('priberolle@mullerautomotive.fr',      'Riberolle',       'Philippe',   true),
('croy@mullerautomotive.fr',            'Roy',             'Carole',     true),
('pschincariol@mullerautomotive.fr',    'Schincariol',     'Philippe',   true),
('sdaulard@mullerautomotive.fr',        'Serge',           'Daulard',    true),
('fsimon@mullerautomotive.fr',          'Simon',           'Fabrice',    true),
('pskrzypczak@mullerautomotive.fr',     'SKRZYPCZAK',      'Philippe',   true),
('asorin@mullerautomotive.fr',          'SORIN',           'Anthony',    true),
('sbernier@mullerautomotive.fr',        'Stéphane',        'Bernier',    true),
('sfendorf@mullerautomotive.fr',        'Stéphane',        'Fendorf',    true),
('fsudano@mullerautomotive.fr',         'Sudano',          'Fabien',     true),
('ctasseau@mullerautomotive.fr',        'TASSEAU',         'Christophe', true),
('wjean@mullerautomotive.fr',           'William',         'Jean',       true),
('yzajac@mullerautomotive.fr',          'Yves',            'Zajac',      true)
ON CONFLICT (email) DO NOTHING;

-- ============================================================
--  2. RÉSULTATS (52 passations — source export CSV)
--     Corrections :
--       - Peillon Stéphane : email → speillon@mullerautomotive.fr
--       - Dufour Jérémy    : email → jdufour@mullerautomotive.fr
-- ============================================================

INSERT INTO br_resultats (nom, prenom, email, score, score_pct, verdict, reponses, duree_sec, ip, created_at) VALUES
('Peillon',    'Stéphane',  'speillon@mullerautomotive.fr',   11, 100, 'Validation acquise',          '[]', NULL, '', '2026-06-26 00:00:00+02'),
('Dufour',     'Jérémy',    'jdufour@mullerautomotive.fr',    9,  82,  'Validation acquise',          '[]', NULL, '', '2026-06-26 00:00:00+02'),
('Coasne',     'David',     'dcoasne@mullerautomotive.fr',    6,  55,  'Action corrective requise',   '[]', 1047, '', '2026-06-25 13:01:00+02'),
('Michel',     'Galland',   'mgalland@mullerautomotive.fr',   10, 91,  'Validation acquise',          '[]', 2032, '', '2026-06-25 11:02:00+02'),
('Gouin',      'Emmanuel',  'egouin@mullerautomotive.fr',     11, 100, 'Validation acquise',          '[]', 1874, '', '2026-06-23 17:13:00+02'),
('SKRZYPCZAK', 'Philippe',  'pskrzypczak@mullerautomotive.fr',10, 91,  'Validation acquise',          '[]', 2121, '', '2026-06-22 18:44:00+02'),
('Ribeiro',    'Luis',      'lribeiro@mullerautomotive.fr',   10, 91,  'Validation acquise',          '[]', 1983, '', '2026-06-22 16:50:00+02'),
('Renoult',    'Hubert',    'hrenoult@mullerautomotive.fr',   11, 100, 'Validation acquise',          '[]', 990,  '', '2026-06-22 16:50:00+02'),
('Stéphane',   'Fendorf',   'sfendorf@mullerautomotive.fr',   11, 100, 'Validation acquise',          '[]', 1565, '', '2026-06-22 16:48:00+02'),
('Renoult',    'Hubert',    'hrenoult@mullerautomotive.fr',   7,  64,  'Action corrective requise',   '[]', 1234, '', '2026-06-22 16:31:00+02'),
('TASSEAU',    'Christophe','ctasseau@mullerautomotive.fr',   10, 91,  'Validation acquise',          '[]', 1614, '', '2026-06-22 14:24:00+02'),
('Mohamed',    'Derraz',    'mderraz@mullerautomotive.fr',    11, 100, 'Validation acquise',          '[]', 1504, '', '2026-06-22 11:24:00+02'),
('Simon',      'Fabrice',   'fsimon@mullerautomotive.fr',     11, 100, 'Validation acquise',          '[]', 1221, '', '2026-06-22 10:46:00+02'),
('Joseph',     'Stéphane',  'sjoseph@mullerautomotive.fr',    11, 100, 'Validation acquise',          '[]', 1125, '', '2026-06-22 10:38:00+02'),
('Renoult',    'Hugo',      'hugorenoult@mullerautomotive.fr',10, 91,  'Validation acquise',          '[]', 1205, '', '2026-06-22 10:13:00+02'),
('LELEU',      'Remy',      'rleleu@mullerautomotive.fr',     11, 100, 'Validation acquise',          '[]', 1146, '', '2026-06-21 22:13:00+02'),
('Schincariol','Philippe',  'pschincariol@mullerautomotive.fr',11,100, 'Validation acquise',          '[]', 1245, '', '2026-06-19 18:33:00+02'),
('Hilaire',    'Julien',    'jhilaire@mullerautomotive.fr',   11, 100, 'Validation acquise',          '[]', 2300, '', '2026-06-19 10:53:00+02'),
('Davoud',     'Check',     'dcheck@mullerautomotive.fr',     10, 91,  'Validation acquise',          '[]', 965,  '', '2026-06-19 09:32:00+02'),
('Ismail',     'Mohamad',   'imohamad@mullerautomotive.fr',   11, 100, 'Validation acquise',          '[]', 886,  '', '2026-06-19 09:14:00+02'),
('Mauclair',   'Emmanuel',  'emauclair@mullerautomotive.fr',  11, 100, 'Validation acquise',          '[]', 1266, '', '2026-06-19 07:40:00+02'),
('Dufrene',    'Patrice',   'pdufrene@mullerautomotive.fr',   11, 100, 'Validation acquise',          '[]', 1044, '', '2026-06-18 18:22:00+02'),
('Pires',      'Carlos',    'cpires@mullerautomotive.fr',     8,  73,  'Validation acquise',          '[]', 1158, '', '2026-06-18 17:26:00+02'),
('SORIN',      'Anthony',   'asorin@mullerautomotive.fr',     10, 91,  'Validation acquise',          '[]', 2362, '', '2026-06-18 16:20:00+02'),
('Arekiom',    'Gislain',   'garekiom@mullerautomotive.fr',   10, 91,  'Validation acquise',          '[]', 1323, '', '2026-06-18 14:32:00+02'),
('Hay',        'Jean-Luc',  'jlhay@mullerautomotive.fr',      9,  82,  'Validation acquise',          '[]', 1159, '', '2026-06-18 13:16:00+02'),
('Daviaud',    'Philippe',  'pdaviaud@mullerautomotive.fr',   10, 91,  'Validation acquise',          '[]', 1504, '', '2026-06-18 12:49:00+02'),
('Julien',     'Lapeyre',   'jlapeyre@mullerautomotive.fr',   11, 100, 'Validation acquise',          '[]', 1997, '', '2026-06-18 11:31:00+02'),
('Pujo',       'Sébastien', 'spujo@mullerautomotive.fr',      11, 100, 'Validation acquise',          '[]', 877,  '', '2026-06-18 11:29:00+02'),
('Jean',       'William',   'wjean@mullerautomotive.fr',      10, 91,  'Validation acquise',          '[]', 1353, '', '2026-06-18 11:18:00+02'),
('Noel',       'Frédéric',  'fnoel@mullerautomotive.fr',      10, 91,  'Validation acquise',          '[]', 1379, '', '2026-06-18 11:17:00+02'),
('Boudaroua',  'Mohamed',   'mboudaroua@mullerautomotive.fr', 9,  82,  'Validation acquise',          '[]', 1074, '', '2026-06-18 11:15:00+02'),
('Riberolle',  'Philippe',  'priberolle@mullerautomotive.fr', 8,  73,  'Validation acquise',          '[]', 900,  '', '2026-06-18 10:35:00+02'),
('BOUTRON',    'Richard',   'rboutron@mullerautomotive.fr',   8,  73,  'Validation acquise',          '[]', 1305, '', '2026-06-17 15:32:00+02'),
('Roy',        'Carole',    'croy@mullerautomotive.fr',       10, 91,  'Validation acquise',          '[]', 1637, '', '2026-06-17 14:41:00+02'),
('BESSOU',     'Stéphane',  'sbessou@mullerautomotive.fr',    11, 100, 'Validation acquise',          '[]', 2468, '', '2026-06-17 12:39:00+02'),
('Stéphane',   'Bernier',   'sbernier@mullerautomotive.fr',   9,  82,  'Validation acquise',          '[]', 1642, '', '2026-06-17 08:29:00+02'),
('Boussour',   'David',     'dboussour@mullerautomotive.fr',  9,  82,  'Validation acquise',          '[]', 895,  '', '2026-06-16 21:39:00+02'),
('Cortey',     'Julien',    'jcortey@mullerautomotive.fr',    8,  73,  'Validation acquise',          '[]', 1919, '', '2026-06-16 19:32:00+02'),
('Pinson',     'Arnaud',    'apinson@mullerautomotive.fr',    10, 91,  'Validation acquise',          '[]', 2348, '', '2026-06-16 16:49:00+02'),
('Colin',      'Didier',    'dcolin@mullerautomotive.fr',     11, 100, 'Validation acquise',          '[]', 1244, '', '2026-06-16 16:39:00+02'),
('CARVALHO',   'Thibaut',   'tcarvalho@mullerautomotive.fr',  11, 100, 'Validation acquise',          '[]', 947,  '', '2026-06-16 16:38:00+02'),
('Jolly',      'Mickael',   'mjolly@mullerautomotive.fr',     9,  82,  'Validation acquise',          '[]', 1071, '', '2026-06-16 16:35:00+02'),
('Bury',       'Dominique', 'dbury@mullerautomotive.fr',      11, 100, 'Validation acquise',          '[]', 1039, '', '2026-06-16 10:05:00+02'),
('Hallier',    'Franck',    'fhallier@mullerautomotive.fr',   11, 100, 'Validation acquise',          '[]', 1365, '', '2026-06-16 09:58:00+02'),
('Percheron',  'Lucas',     'lpercheron@mullerautomotive.fr', 11, 100, 'Validation acquise',          '[]', 926,  '', '2026-06-16 09:33:00+02'),
('Leroy',      'Thierry',   'tleroy@mullerautomotive.fr',     8,  73,  'Validation acquise',          '[]', 1639, '', '2026-06-15 21:23:00+02'),
('Ouarab',     'Samir',     'souarab@mullerautomotive.fr',    11, 100, 'Validation acquise',          '[]', 3115, '', '2026-06-15 18:12:00+02'),
('Yves',       'Zajac',     'yzajac@mullerautomotive.fr',     8,  73,  'Validation acquise',          '[]', 1367, '', '2026-06-15 17:42:00+02'),
('Barthelemy', 'François',  'fbarthelemy@mullerautomotive.fr',11, 100, 'Validation acquise',          '[]', 1148, '', '2026-06-15 16:27:00+02'),
('Guihard',    'Stéphane',  'sguihard@mullerautomotive.fr',   9,  82,  'Validation acquise',          '[]', 1260, '', '2026-06-15 16:07:00+02'),
('Avet',       'Mathieu',   'mavet@mullerautomotive.fr',      11, 100, 'Validation acquise',          '[]', 987,  '', '2026-06-14 18:52:00+02')
;

-- ============================================================
--  VÉRIFICATION
-- ============================================================
\echo ''
\echo '--- Restauration BR terminée ---'
SELECT 'br_resultats'        AS table, COUNT(*) AS lignes FROM br_resultats
UNION ALL
SELECT 'br_emails_autorises' AS table, COUNT(*) AS lignes FROM br_emails_autorises;

\echo ''
\echo '--- Personnes N ayant PAS encore fait le module ---'
SELECT w.prenom, w.nom, w.email
FROM br_emails_autorises w
WHERE NOT EXISTS (
    SELECT 1 FROM br_resultats r
    WHERE LOWER(r.email) = LOWER(w.email)
      AND r.score_pct >= 70
)
ORDER BY w.nom, w.prenom;
