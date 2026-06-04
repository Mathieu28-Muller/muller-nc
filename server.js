/**
 * ============================================================
 *  SERVER.JS — API Muller Automotive
 *  Authentification centralisée Node.js / Express
 *
 *  ▶ Installation : npm install
 *  ▶ Démarrage    : node server.js
 *  ▶ Avec PM2     : pm2 start server.js --name muller-api
 *
 *  ⚠️  Avant de déployer en production :
 *      - Changer JWT_SECRET par une vraie clé secrète longue
 *      - Restreindre CORS à votre domaine Cloudflare
 *      - Mettre le serveur derrière HTTPS (ex. reverse proxy Nginx)
 * ============================================================
 */

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const jwt          = require('jsonwebtoken');
const fs           = require('fs');
const path         = require('path');
const multer       = require('multer');
const nodemailer   = require('nodemailer');
const http         = require('http');
const bcrypt       = require('bcryptjs');
const rateLimit    = require('express-rate-limit');
const helmet       = require('helmet');
const { Pool }     = require('pg');

const app = express();
app.set('trust proxy', 1);

// ── Configuration ─────────────────────────────────────────────
const PORT       = process.env.PORT       || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'muller-automotive-secret-2026-changez-moi!';
const USERS_FILE = path.join(__dirname, 'users.json');
const DATA_FILE  = path.join(__dirname, 'data.json');
const MEDIA_DIR  = path.join(__dirname, 'Base de cas', 'media');
const NC_FILE         = path.join(__dirname, 'nc-data.json');
const NC_MEDIA        = path.join(__dirname, 'NC', 'media');
const NC_USERS_FILE   = path.join(__dirname, 'nc-users.json');
const NC_CONFIG_FILE  = path.join(__dirname, 'nc-config.json');

// ── Version applicative Module NC ─────────────────────────────
const NC_APP_VERSION = '4.5';
const NC_VERSION_HISTORY = [
  {
    version: '1.0', date: '2026-03-15', label: 'Lancement',
    changes: [
      'Premier formulaire de déclaration NC en ligne',
      'Stockage des données en fichiers JSON',
      'Interface d\'administration basique',
      'Numérotation automatique AAMMJJ-NNNN'
    ]
  },
  {
    version: '1.1', date: '2026-03-25', label: 'Authentification',
    changes: [
      'Authentification JWT — 3 rôles (admin, pilote, lecteur)',
      'Page de connexion dédiée',
      'Protection des routes API par token',
      'Sessions persistantes navigateur'
    ]
  },
  {
    version: '2.0', date: '2026-04-05', label: 'Workflow complet',
    changes: [
      'Cycle de vie NC : ouvert → en_cours → résolu → clos',
      'Notifications email automatiques (création, changement statut, clôture)',
      'Champs obligatoires à la clôture (type cause, coût, commentaire)',
      'Historique de chaque NC tracé en base'
    ]
  },
  {
    version: '2.1', date: '2026-04-15', label: 'Actions CAPA',
    changes: [
      'Création d\'actions correctives et préventives (CAPA)',
      'Assignation à des pilotes nommés',
      'Suivi des échéances — alertes retard',
      'Relances automatiques des pilotes en retard'
    ]
  },
  {
    version: '3.0', date: '2026-04-22', label: 'Analyse qualité',
    changes: [
      'Score de risque 4 axes normalisé /9 : impact client (1-4), conformité (1-3), sécurité (1-3), récurrence (1-3)',
      'Analyse 5 Pourquoi (5 champs de cause racine enchaînés)',
      'Diagramme Ishikawa SVG généré automatiquement (6 branches)',
      'Gravité NC — 3 niveaux : mineure / majeure / critique'
    ]
  },
  {
    version: '3.1', date: '2026-04-28', label: 'Reporting & groupes',
    changes: [
      'NC parent / satellites — regroupement de NC liées',
      'Export CSV complet (25 colonnes, encodage UTF-8 BOM)',
      'Rapport PDF direction (ISO 9001:2015 §9.3 / §8.7 / §10.2)',
      'Retour satisfaction client à la clôture'
    ]
  },
  {
    version: '4.0', date: '2026-05-03', label: 'Version fonctionnelle complète',
    changes: [
      'Formulaire public dynamique (champs issus de la configuration)',
      'Console de gestion consolidée — onglets Tableau de bord / Liste / Stats / Archives',
      'Synoptique documentaire intégré accessible depuis la console',
      'Score risque et gravité visibles dans la liste NC'
    ]
  },
  {
    version: '4.1', date: '2026-05-09', label: 'Sécurité renforcée',
    changes: [
      'Mots de passe hashés avec bcrypt (migration progressive)',
      'Rate limiting — 5 tentatives de connexion maximum par 15 min par IP',
      'Helmet — headers HTTP de sécurité activés',
      'Blocage accès direct aux fichiers JSON de données'
    ]
  },
  {
    version: '4.2', date: '2026-05-25', label: 'Migration PostgreSQL',
    changes: [
      'Installation PostgreSQL 16 — schéma nc_muller (12 tables, 3 vues)',
      'Migration complète des données JSON vers PostgreSQL',
      'Script plan_controle.js — vérification de parité données (8 sections)',
      'Corrections pgSyncFiche, satellites, réponses pilotes'
    ]
  },
  {
    version: '4.3', date: '2026-05-25', label: 'PostgreSQL en production',
    changes: [
      'DATA_SOURCE=postgres — PostgreSQL source de vérité unique',
      'Fichiers JSON conservés en archive uniquement',
      'Backup complet archivé avant bascule (769 fichiers, 702 Mo)',
      'Rollback dual disponible en moins de 2 minutes'
    ]
  },
  {
    version: '4.4', date: '2026-06-03', label: 'Gestion mots de passe & rôles',
    changes: [
      'Nouveau rôle Codir — accès lecture complète (dashboard + stats + liste + archives)',
      'Rôle Lecteur allégé — liste des NC et archives uniquement',
      'Chef produit : mode Lecteur via toggle masque dashboard et statistiques',
      'Modal "Changer mon mot de passe" accessible depuis le header (tous rôles)',
      'Page "Mot de passe oublié" avec lien de réinitialisation par email (token 1h)',
      'Bouton admin "Envoyer identifiants" — MDP temporaire généré et envoyé par email',
      'Validation MDP renforcée : 8 caractères min, 1 majuscule, 1 chiffre (partout)',
      'Indicateur de force MDP en temps réel dans les formulaires',
      'Correction rate-limit : vérification ancien MDP via bcrypt serveur (plus via login)',
      'Tableau utilisateurs admin : colonnes à largeur fixe, toutes visibles'
    ]
  },
  {
    version: '4.5', date: '2026-06-04', label: 'Correctifs phase test pilotes',
    current: true,
    changes: [
      'Décodage JWT UTF-8 : noms avec accents (é, ç) s\'affichaient corrompus — fix decodeURIComponent',
      'Email ajouté dans le token JWT NC — débloque la réponse aux actions CAPA pour tous les pilotes',
      'Email obligatoire pour le rôle Pilote (nc_chef_produit) — création et modification'
    ]
  }
];
const NC_PARENT_FILE  = path.join(__dirname, 'nc-parent-groups.json');

// ── PostgreSQL — dual-write ────────────────────────────────────
const DATA_SOURCE = process.env.DATA_SOURCE || 'json'; // json | dual | postgres

let pgPool = null;
if (DATA_SOURCE !== 'json') {
    pgPool = new Pool({
        host:     process.env.PG_HOST     || 'localhost',
        port:     parseInt(process.env.PG_PORT || '5432'),
        user:     process.env.PG_USER     || 'postgres',
        password: process.env.PG_PASSWORD,
        database: process.env.PG_DB       || 'nc_muller',
    });
    pgPool.on('error', (err) => console.error('[pg] pool error:', err.message));
    pgPool.connect()
        .then(c => { c.release(); console.log(`[pg] connecté (DATA_SOURCE=${DATA_SOURCE})`); })
        .catch(e => console.error('[pg] connexion échouée:', e.message));
}

// Calcule les sets parent/satellite depuis nc-parent-groups.json
function pgComputeGroupSets(groups) {
    const parentSet = new Set();
    const satSet    = new Set();
    for (const g of groups.groups  || []) {
        if (g.parentId) parentSet.add(g.parentId);
        for (const s of g.satellites || []) satSet.add(s);
    }
    for (const j of groups.journal || []) {
        if (j.parent_id) parentSet.add(j.parent_id);
        for (const s of j.satellites || []) satSet.add(s);
    }
    for (const p of parentSet) satSet.delete(p); // un parent n'est pas satellite
    return { parentSet, satSet };
}

// Sync complète d'une fiche NC dans PG : nc_fiches + nc_historique + nc_actions
// parentSet / satSet : calculés depuis nc-parent-groups.json dans saveNC()
function pgSyncFiche(nc, parentSet, satSet) {
    if (!pgPool) return;
    const isParent    = (parentSet && parentSet.has(nc.numero)) || false;
    const isSatellite = (satSet    && satSet.has(nc.numero))    || false;

    pgPool.connect().then(async client => {
        try {
            await client.query('BEGIN');

            // ── 1. Upsert nc_fiches ──────────────────────────────
            await client.query(`
                INSERT INTO nc_fiches (
                    numero, created_at, updated_at, statut, closed_at, clos_par,
                    cloture_via_parent, duree_total, duree_traitement, reouverture_date,
                    echeance_respectee, redacteur, email_redacteur, date_decouverte,
                    decouvreur, perimetre, source_detection, no_commande, ref_produit,
                    famille_produit, no_serie, version_prog, quantite_unites, sap_code,
                    nom_client, cp, ville, pays, probleme, reparation, suggestion,
                    media_files, media_files_traitement, gravite, risque_impact,
                    score_risque, processus, cinq_pourquoi, cause_racine, ishikawa,
                    retour_client, blocage_signale, commentaire_qualite, type_cause,
                    pilote, pilote_email, pilote_nom, delai_action, type_action, cout,
                    commentaire_cloture, analyse_5p, preuve_efficacite,
                    is_parent, is_satellite, parent_id, parent_label, satellites,
                    groupe_label, groupe_motif, groupe_created_at, groupe_created_by,
                    groupe_perimetre, rattachement_date, rattachement_by
                ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                    $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,
                    $35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
                    $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62,$63,$64,$65
                )
                ON CONFLICT (numero) DO UPDATE SET
                    updated_at=EXCLUDED.updated_at, statut=EXCLUDED.statut,
                    closed_at=EXCLUDED.closed_at, clos_par=EXCLUDED.clos_par,
                    duree_total=EXCLUDED.duree_total, duree_traitement=EXCLUDED.duree_traitement,
                    echeance_respectee=EXCLUDED.echeance_respectee,
                    redacteur=EXCLUDED.redacteur, email_redacteur=EXCLUDED.email_redacteur,
                    perimetre=EXCLUDED.perimetre, famille_produit=EXCLUDED.famille_produit,
                    pilote=EXCLUDED.pilote, pilote_email=EXCLUDED.pilote_email,
                    pilote_nom=EXCLUDED.pilote_nom, delai_action=EXCLUDED.delai_action,
                    cout=EXCLUDED.cout, gravite=EXCLUDED.gravite,
                    risque_impact=EXCLUDED.risque_impact, score_risque=EXCLUDED.score_risque,
                    probleme=EXCLUDED.probleme, reparation=EXCLUDED.reparation,
                    suggestion=EXCLUDED.suggestion, cause_racine=EXCLUDED.cause_racine,
                    commentaire_cloture=EXCLUDED.commentaire_cloture,
                    blocage_signale=EXCLUDED.blocage_signale,
                    is_parent=EXCLUDED.is_parent, is_satellite=EXCLUDED.is_satellite,
                    parent_id=EXCLUDED.parent_id, satellites=EXCLUDED.satellites,
                    groupe_label=EXCLUDED.groupe_label, groupe_motif=EXCLUDED.groupe_motif,
                    media_files=EXCLUDED.media_files,
                    media_files_traitement=EXCLUDED.media_files_traitement
            `, [
                nc.numero, nc.createdAt||null, nc.updatedAt||null, nc.statut||'ouvert',
                nc.closedAt||null, nc.closPar||null, nc.clotureViaParent||null,
                nc.dureeTotal??null, nc.dureeTraitement??null, nc.reouvertureDate||null,
                nc.echeanceRespectee??null, nc.redacteur||null, nc.emailRedacteur||null,
                nc.dateDecouverte||null, nc.decouvreur||null, nc.perimetre||null,
                nc.sourceDetection||null, nc.noCommande||null, nc.refProduit||null,
                nc.familleProduit||null, nc.noSerie||null, nc.versionProg||null,
                nc.quantiteUnites??null, nc.sapCode||null,
                nc.nomClient||null, nc.cp||null, nc.ville||null, nc.pays||null,
                nc.probleme||null, nc.reparation||null, nc.suggestion||null,
                JSON.stringify(nc.mediaFiles||[]), JSON.stringify(nc.mediaFilesTraitement||[]),
                nc.gravite||null, nc.risqueImpact?JSON.stringify(nc.risqueImpact):null,
                nc.scoreRisque??null, nc.processus||null, nc.cinqPourquoi||null,
                nc.causeRacine||null, nc.ishikawa?JSON.stringify(nc.ishikawa):null,
                nc.retourClient||null, nc.blocageSignale||false,
                nc.commentaireQualite||null, nc.typeCause||null,
                nc.pilote||null, nc.piloteEmail||null, nc.piloteNom||null,
                nc.delaiAction||null, nc.typeAction||null,
                nc.cout??null, nc.commentaireCloture||null,
                nc.analyse5p?JSON.stringify(nc.analyse5p):null, nc.preuveEfficacite||null,
                isParent, isSatellite,
                nc.parentId||null, nc.parentLabel||null,
                nc.satellites?.length ? nc.satellites : null,
                nc.groupeLabel||null, nc.groupeMotif||null,
                nc.groupeCreatedAt||null, nc.groupeCreatedBy||null,
                nc.groupePerimetre?.length ? nc.groupePerimetre : null,
                nc.rattachementDate||null, nc.rattachementBy||null,
            ]);

            // ── 2. Resync nc_historique (delete + insert) ────────
            await client.query('DELETE FROM nc_historique WHERE nc_numero = $1', [nc.numero]);
            const historique = nc.historique || [];
            for (let i = 0; i < historique.length; i++) {
                const h = historique[i];
                await client.query(
                    'INSERT INTO nc_historique (nc_numero, date, statut, commentaire, par, ordre) VALUES ($1,$2,$3,$4,$5,$6)',
                    [nc.numero, h.date||null, h.statut||null, h.commentaire||null, h.par||null, i]
                );
            }

            // ── 3. Resync nc_actions (delete cascades action_historique, reponses, relances) ──
            await client.query('DELETE FROM nc_actions WHERE nc_numero = $1', [nc.numero]);
            for (const a of nc.actions || []) {
                await client.query(`
                    INSERT INTO nc_actions
                        (id, nc_numero, type, pilote, echeance, commentaire_action,
                         statut, date_pilote_reponse, echeance_respectee, created_at, created_by)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                `, [
                    a.id||null, nc.numero, a.type||'immediate',
                    a.pilote||null, a.echeance||null, a.commentaireAction||null,
                    a.statut||'ouvert', a.datePiloteReponse||null,
                    a.echeanceRespectee??null, a.createdAt||null, a.createdBy||null,
                ]);
                // Réponses de l'action
                for (const r of a.reponsesActions || []) {
                    await client.query(
                        'INSERT INTO nc_action_reponses (action_id, reponse, par, date) VALUES ($1,$2,$3,$4)',
                        [a.id, r.reponse||null, r.par||null, r.date||null]
                    );
                }
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            console.error('[pg] pgSyncFiche:', nc.numero, e.message);
        } finally {
            client.release();
        }
    }).catch(e => console.error('[pg] pgSyncFiche connect:', nc.numero, e.message));
}

// Upsert d'un utilisateur NC dans PostgreSQL (fire-and-forget)
function pgSyncNcUser(u) {
    if (!pgPool) return;
    pgPool.query(`
        INSERT INTO nc_users (user_login, pass_hash, role, name, email, created_at, last_login)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (user_login) DO UPDATE SET
            pass_hash=EXCLUDED.pass_hash, role=EXCLUDED.role,
            name=EXCLUDED.name, email=EXCLUDED.email, last_login=EXCLUDED.last_login
    `, [u.user, u.passHash, u.role||'nc_lecteur', u.name||u.user,
        u.email||null, u.createdAt||null, u.lastLogin||null])
    .catch(e => console.error('[pg] pgSyncNcUser:', u.user, e.message));
}

function loadNCConfig() {
    try { return JSON.parse(fs.readFileSync(NC_CONFIG_FILE,'utf8')); } catch { return {}; }
}
function saveNCConfig(c) { atomicWriteSync(NC_CONFIG_FILE, JSON.stringify(c,null,2)); }
function ncMailTo() {
    const cfg=loadNCConfig();
    const arr=cfg.emailsQualite||[];
    return arr.length?arr.join(','):EMAIL_CFG.to;
}
function ncMailEnabled(key) {
    const cfg=loadNCConfig();
    const n=cfg.notificationsEmail||{};
    return n[key]!==false; // true par défaut si non défini
}

// ── Configuration email ─────────────────────────────────────────
// Renseignez vos paramètres SMTP ici ou via variables d'environnement
const EMAIL_CFG = {
    host:   'smtp.gmail.com',
    port:   587,
    secure: false,   // STARTTLS
    user:   'formations.muller@gmail.com',
    pass:   process.env.MAIL_PASS || 'uawlibpfebvpwawu',
    from:   'Formation SAV Muller <formations.muller@gmail.com>',
    to:     'mavet@mullerautomotive.fr'
};

// Emails des pilotes NC — à mettre à jour si nécessaire
const PILOTES = {
    'Anne-Sophie Costa':   'anne-sophie.costa@mullerautomotive.fr',
    'Emilie Legros':       'emilie.legros@mullerautomotive.fr',
    'Eric Vernier':        'eric.vernier@mullerautomotive.fr',
    'Estelle Gouache':     'estelle.gouache@mullerautomotive.fr',
    'Fabrice Simon':       'fabrice.simon@mullerautomotive.fr',
    'François Barthélémy': 'francois.barthelemy@mullerautomotive.fr',
    'Hervé Le Glaunec':    'herve.leglaunec@mullerautomotive.fr',
    'Julien Cortey':       'julien.cortey@mullerautomotive.fr',
    'Lucas Percheron':     'lucas.percheron@mullerautomotive.fr',
    'Philippe Skrzypczak': 'philippe.skrzypczak@mullerautomotive.fr',
    'Thierry Leroy':       'thierry.leroy@mullerautomotive.fr',
};

// ── Middleware ─────────────────────────────────────────────────
app.use(cors({
    origin: '*'   // ← En production, remplacer '*' par votre domaine Cloudflare
                  //   ex : 'https://base-muller.pages.dev'
}));
// Headers sécurité HTTP (XSS, clickjacking, MIME sniffing…) — CSP désactivé car scripts inline
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20mb' }));

// HTML jamais mis en cache par Cloudflare ni le navigateur
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || !req.path.includes('.')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Surrogate-Control', 'no-store');
        res.set('CDN-Cache-Control', 'no-store');
        res.set('Cloudflare-CDN-Cache-Control', 'no-store');
    }
    next();
});

// ── Proxy — Certificat de Conformité (port 3003) ──────────────
app.use('/certificat-conformite', (req, res) => {
    const options = {
        hostname: '127.0.0.1',
        port: 3003,
        path: req.url || '/',
        method: req.method,
        headers: { ...req.headers, host: 'localhost:3003' }
    };
    const proxyReq = http.request(options, proxyRes => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });
    proxyReq.on('error', () => {
        if (!res.headersSent) res.status(502).send('Module certificat indisponible');
    });
    req.pipe(proxyReq, { end: true });
});

// ── Pages HTML servies dynamiquement (sans ETag/Last-Modified pour Cloudflare) ──
const htmlPages = [
    ['/',                   'index.html'],
    ['/NC',                 path.join('NC', 'index.html')],
    ['/NC/',                path.join('NC', 'index.html')],
    ['/NC/index.html',      path.join('NC', 'index.html')],
    ['/NC/login.html',      path.join('NC', 'login.html')],
    ['/NC/console.html',    path.join('NC', 'console.html')],
    ['/Base de cas',        path.join('Base de cas', 'index.html')],
    ['/Base de cas/',       path.join('Base de cas', 'index.html')],
    ['/Base%20de%20cas',    path.join('Base de cas', 'index.html')],
    ['/Base%20de%20cas/',   path.join('Base de cas', 'index.html')],
    ['/Base de cas/admin.html',     path.join('Base de cas', 'admin.html')],
    ['/Base de cas/login.html',     path.join('Base de cas', 'login.html')],
    ['/MRA',                path.join('MRA', 'index.html')],
    ['/MRA/',               path.join('MRA', 'index.html')],
    ['/CT',                 path.join('CT', 'index.html')],
    ['/CT/',                path.join('CT', 'index.html')],
    ['/CT/CEL50',           path.join('CT', 'CEL50', 'index.html')],
    ['/CT/CEL50/',          path.join('CT', 'CEL50', 'index.html')],
    ['/CT/SLM50',           path.join('CT', 'SLM50', 'index.html')],
    ['/CT/SLM50/',          path.join('CT', 'SLM50', 'index.html')],
    ['/CT/SRV042',          path.join('CT', 'SRV042', 'index.html')],
    ['/CT/SRV042/',         path.join('CT', 'SRV042', 'index.html')],
    ['/MRA/CLIM',           path.join('MRA', 'CLIM', 'index.html')],
    ['/MRA/CLIM/',          path.join('MRA', 'CLIM', 'index.html')],
    ['/MRA/CLIM/BOUCLE',    path.join('MRA', 'CLIM', 'BOUCLE', 'index.html')],
    ['/MRA/CLIM/BOUCLE/',   path.join('MRA', 'CLIM', 'BOUCLE', 'index.html')],
    ['/MRA/CLIM/STATION',   path.join('MRA', 'CLIM', 'STATION', 'index.html')],
    ['/MRA/CLIM/STATION/',  path.join('MRA', 'CLIM', 'STATION', 'index.html')],
    ['/SENSIBILISATION',              path.join('SENSIBILISATION', 'index.html')],
    ['/SENSIBILISATION/',             path.join('SENSIBILISATION', 'index.html')],
    ['/SENSIBILISATION/HANDICAP',     path.join('SENSIBILISATION', 'HANDICAP', 'index.html')],
    ['/SENSIBILISATION/HANDICAP/',    path.join('SENSIBILISATION', 'HANDICAP', 'index.html')],
    ['/SENSIBILISATION/ELECTRIQUE',   path.join('SENSIBILISATION', 'ELECTRIQUE', 'index.html')],
    ['/SENSIBILISATION/ELECTRIQUE/',  path.join('SENSIBILISATION', 'ELECTRIQUE', 'index.html')],
];

function sendNoCache(res, filePath) {
    const content = fs.readFileSync(path.join(__dirname, filePath));
    res.writeHead(200, {
        'Content-Type':                  'text/html; charset=UTF-8',
        'Content-Length':                Buffer.byteLength(content),
        'Cache-Control':                 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma':                        'no-cache',
        'Expires':                       '0',
        'Surrogate-Control':             'no-store',
        'CDN-Cache-Control':             'no-store',
        'Cloudflare-CDN-Cache-Control':  'no-store',
        'X-Served-By':                   'formation-sav-C-formation'
    });
    res.end(content);
}

for (const [route, file] of htmlPages) {
    app.get(route, (req, res) => sendNoCache(res, file));
}

// Bloquer accès direct aux fichiers JSON de données sensibles via URL
const DATA_JSON_BLOCKED = new Set(['users.json','nc-users.json','nc-data.json','nc-config.json','nc-parent-groups.json','data.json']);
app.use((req, res, next) => {
    if (DATA_JSON_BLOCKED.has(path.basename(req.path))) return res.status(403).end();
    next();
});
app.use(express.static(__dirname));
app.use('/NC/media', express.static(NC_MEDIA));

// ── Multer — upload de fichiers ─────────────────────────────────
const storage = multer.diskStorage({
    destination(req, _file, cb) {
        const gamme   = req.query.gamme   || '';
        const machine = req.query.machine || '';
        if (!gamme || !machine) return cb(new Error('Paramètres gamme/machine manquants'));
        const dest = path.join(MEDIA_DIR, gamme, machine);
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename(_req, file, cb) {
        // busboy décode le Content-Disposition en Latin-1 ; le navigateur envoie en UTF-8
        // → reconvertir pour éviter le mojibake (Ã© au lieu de é)
        const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, name);
    }
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } }); // 200 Mo max

// ── Hash legacy (conservé pour vérification des anciens comptes) ─
function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    return h.toString(36);
}
// ── Bcrypt — nouveaux hash et vérification avec lazy migration ──
const BCRYPT_ROUNDS = 12;
function hashBcrypt(pass) { return bcrypt.hashSync(pass, BCRYPT_ROUNDS); }
function verifyPass(plain, stored) {
    if (stored.startsWith('$2b$') || stored.startsWith('$2a$')) return bcrypt.compareSync(plain, stored);
    return hash(plain) === stored; // fallback legacy → sera migré au prochain login
}
// Étape D — validation mot de passe (min 8 chars, 1 maj, 1 chiffre)
function validatePassword(pass) {
    if (!pass || pass.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
    if (!/[A-Z]/.test(pass))      return 'Le mot de passe doit contenir au moins une majuscule.';
    if (!/[0-9]/.test(pass))      return 'Le mot de passe doit contenir au moins un chiffre.';
    return null; // ok
}
// Étape C — tokens de réinitialisation MDP (en mémoire, TTL 1h)
const _resetTokens = new Map(); // token → { user, expires }
function genResetToken(userLogin) {
    const token = require('crypto').randomBytes(32).toString('hex');
    _resetTokens.set(token, { user: userLogin, expires: Date.now() + 3600_000 });
    return token;
}
function consumeResetToken(token) {
    const entry = _resetTokens.get(token);
    if (!entry || Date.now() > entry.expires) return null;
    _resetTokens.delete(token);
    return entry.user;
}

// ── Écriture atomique + queue par fichier ─────────────────────
// atomicWriteSync : écrit dans un .tmp puis renomme → crash-safe
// Si le serveur tombe pendant l'écriture, le fichier original est intact.
// La queue (_writeQueues) sérialise les écritures async pour OVH.
const _writeQueues = {};
function atomicWriteSync(filePath, content) {
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, filePath);
}
// Version async non-bloquante (pour futures routes async OVH)
function atomicWriteAsync(filePath, content) {
    if (!_writeQueues[filePath]) _writeQueues[filePath] = Promise.resolve();
    _writeQueues[filePath] = _writeQueues[filePath]
        .then(() => fs.promises.writeFile(filePath + '.tmp', content, 'utf8'))
        .then(() => fs.promises.rename(filePath + '.tmp', filePath))
        .catch(e => console.error('[atomicWrite]', filePath, e.message));
    return _writeQueues[filePath];
}

// ── Persistance données (baseDeDonnees + documentsPannes) ──────
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch(e) {
        console.error('Erreur lecture data.json :', e.message);
    }
    return { baseDeDonnees: {}, documentsPannes: {} };
}

function saveData(data) {
    atomicWriteSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Persistance utilisateurs ───────────────────────────────────
function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch(e) {
        console.error('Erreur lecture users.json :', e.message);
    }
    // Fichier absent → créer avec l'admin par défaut
    const defaults = [{
        user: 'admin',
        passHash: hash('muller2026'),
        role: 'admin',
        name: 'Administrateur',
        status: 'active',
        createdAt: new Date().toISOString()
    }];
    saveUsers(defaults);
    return defaults;
}

function saveUsers(users) {
    atomicWriteSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ── Middlewares d'authentification ─────────────────────────────
function requireAuth(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'Non authentifié' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Token invalide ou expiré' });
    }
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé — rôle admin requis' });
        next();
    });
}

function requireContributor(req, res, next) {
    requireAuth(req, res, () => {
        if (!['admin', 'contributor'].includes(req.user.role))
            return res.status(403).json({ error: 'Accès refusé — rôle contributeur ou admin requis' });
        next();
    });
}

// ══════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════

// GET /api/health — vérifier que le serveur tourne
app.get('/api/health', (req, res) => {
    res.json({ ok: true, time: new Date().toISOString(), users: loadUsers().length });
});

// ── Rate limiter commun aux deux routes de login ───────────────
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: { result: 'invalid', error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ── POST /api/login ────────────────────────────────────────────
app.post('/api/login', loginLimiter, (req, res) => {
    const { user, pass } = req.body || {};
    if (!user || !pass) return res.status(400).json({ result: 'invalid' });

    const users = loadUsers();
    const found = users.find(u => u.user.toLowerCase() === user.toLowerCase());
    if (!found || !verifyPass(pass, found.passHash)) return res.json({ result: 'invalid' });
    if (found.status === 'pending') return res.json({ result: 'pending' });

    const roleResult = found.role === 'admin' ? 'ok_admin'
                     : found.role === 'contributor' ? 'ok_contributor'
                     : 'ok_user';

    // Vérification accès Base de cas pour les rôles 'user'
    // Si modules est défini ET ne contient pas BASE_CAS → accès refusé
    if (found.role === 'user' && Array.isArray(found.modules) && !found.modules.includes('BASE_CAS')) {
        return res.json({ result: 'no_module_access', error: 'Accès à la Base de cas non autorisé. Contactez un administrateur.' });
    }

    // Lazy migration hash → bcrypt si nécessaire (transparent pour l'utilisateur)
    if (!found.passHash.startsWith('$2b$') && !found.passHash.startsWith('$2a$')) {
        found.passHash = hashBcrypt(pass);
    }
    found.lastLogin = new Date().toISOString();
    saveUsers(users);

    const token = jwt.sign(
        { user: found.user, role: found.role, name: found.name || found.user },
        JWT_SECRET,
        { expiresIn: '8h' }
    );

    res.json({ result: roleResult, token, name: found.name || found.user, role: found.role });
});

// ── POST /api/register — demande d'accès ──────────────────────
app.post('/api/register', (req, res) => {
    const { name, user, pass } = req.body || {};
    if (!name || !user || !pass) return res.status(400).json({ result: 'invalid' });
    if (pass.length < 4) return res.status(400).json({ result: 'invalid', error: 'Mot de passe trop court' });

    const users = loadUsers();
    if (users.find(u => u.user.toLowerCase() === user.toLowerCase()))
        return res.json({ result: 'existe' });

    const { company } = req.body || {};
    users.push({
        user, passHash: hashBcrypt(pass), role: 'user', name, company: company || '',
        status: 'pending', createdAt: new Date().toISOString()
    });
    saveUsers(users);
    res.json({ result: 'ok' });
});

// ── GET /api/users — liste (admin) ────────────────────────────
app.get('/api/users', requireAdmin, (req, res) => {
    const users = loadUsers().map(({ passHash, ...u }) => u); // masquer le hash
    res.json(users);
});

// ── POST /api/users — créer un compte (admin) ─────────────────
app.post('/api/users', requireAdmin, (req, res) => {
    const { name, user, pass, role, company } = req.body || {};
    if (!name || !user || !pass) return res.status(400).json({ result: 'invalid' });
    if (pass.length < 4) return res.status(400).json({ result: 'invalid', error: 'Mot de passe trop court' });

    const users = loadUsers();
    if (users.find(u => u.user.toLowerCase() === user.toLowerCase()))
        return res.json({ result: 'existe' });

    users.push({
        user, passHash: hashBcrypt(pass),
        role: ['admin', 'contributor', 'user'].includes(role) ? role : 'user',
        name, company: company || '', status: 'active', createdAt: new Date().toISOString()
    });
    saveUsers(users);
    res.json({ result: 'ok' });
});

// ── PUT /api/users/:user/validate — activer un compte (admin) ─
app.put('/api/users/:user/validate', requireAdmin, (req, res) => {
    const users = loadUsers();
    const u = users.find(u => u.user === req.params.user);
    if (!u) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    u.status = 'active';
    saveUsers(users);
    res.json({ ok: true });
});

// ── PUT /api/users/:user/role — changer le rôle (admin) ───────
app.put('/api/users/:user/role', requireAdmin, (req, res) => {
    const { role } = req.body || {};
    if (!['admin', 'contributor', 'user'].includes(role))
        return res.status(400).json({ error: 'Rôle invalide (admin, contributor ou user)' });
    if (req.params.user === req.user.user)
        return res.status(400).json({ error: 'Impossible de changer votre propre rôle' });

    const users = loadUsers();
    const u = users.find(u => u.user === req.params.user);
    if (!u) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    u.role = role;
    saveUsers(users);
    res.json({ ok: true });
});

// ── GET /api/formation-access — vérifier accès module Formation ─
app.get('/api/formation-access', requireAuth, (req, res) => {
    const { module } = req.query;
    const users = loadUsers();
    const user = users.find(u => u.user === req.user.user);
    if (!user) return res.status(404).json({ ok: false, error: 'Utilisateur non trouvé' });

    // Admin et contributeur ont accès à tout
    if (['admin', 'contributor'].includes(user.role)) {
        return res.json({ ok: true, name: user.name || user.user, role: user.role, modules: ['CT', 'MRA', 'SENSIBILISATION'] });
    }

    const modules = user.modules || [];
    if (!module || modules.includes(module)) {
        return res.json({ ok: true, name: user.name || user.user, role: user.role, modules });
    }
    return res.status(403).json({ ok: false, error: 'Accès refusé à ce module', name: user.name || user.user, modules });
});

// ── PUT /api/users/:user/modules — mettre à jour modules autorisés (admin) ─
app.put('/api/users/:user/modules', requireAdmin, (req, res) => {
    const { modules } = req.body || {};
    if (!Array.isArray(modules)) return res.status(400).json({ error: 'modules doit être un tableau' });
    const VALID = ['BASE_CAS', 'CT', 'MRA', 'SENSIBILISATION'];
    const filtered = modules.filter(m => VALID.includes(m));
    const users = loadUsers();
    const user = users.find(u => u.user === req.params.user);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    user.modules = filtered;
    saveUsers(users);
    res.json({ ok: true, modules: filtered });
});

// ── PUT /api/users/:user/password — changer MDP (admin ou soi)─
app.put('/api/users/:user/password', requireAuth, (req, res) => {
    // Un utilisateur peut changer son propre MDP ; un admin peut changer n'importe quel MDP
    if (req.user.role !== 'admin' && req.user.user !== req.params.user)
        return res.status(403).json({ error: 'Accès refusé' });

    const { pass } = req.body || {};
    if (!pass || pass.length < 4)
        return res.status(400).json({ error: 'Mot de passe trop court (min. 4 caractères)' });

    const users = loadUsers();
    const u = users.find(u => u.user === req.params.user);
    if (!u) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    u.passHash = hashBcrypt(pass);
    saveUsers(users);
    res.json({ ok: true });
});

// ── DELETE /api/users/:user — supprimer (admin) ───────────────
app.delete('/api/users/:user', requireAdmin, (req, res) => {
    if (req.params.user === req.user.user)
        return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' });

    const users = loadUsers();
    if (!users.find(u => u.user === req.params.user))
        return res.status(404).json({ error: 'Utilisateur non trouvé' });

    saveUsers(users.filter(u => u.user !== req.params.user));
    res.json({ ok: true });
});

// ── POST /api/send-sensibilisation — envoi résultats formation sensibilisation ──
app.post('/api/send-sensibilisation', async (req, res) => {
    const { prenom, nom, email, societe, module: mod, score, total, pct, date, preScore } = req.body || {};
    if (!prenom || !nom || !mod) return res.status(400).json({ error: 'Données manquantes' });

    const transporter = nodemailer.createTransport({
        host: EMAIL_CFG.host, port: EMAIL_CFG.port, secure: EMAIL_CFG.secure,
        auth: { user: EMAIL_CFG.user, pass: EMAIL_CFG.pass }
    });

    const statut = pct >= 70 ? '✅ VALIDÉ' : '❌ NON VALIDÉ';
    const statutColor = pct >= 70 ? '#059669' : '#dc2626';

    try {
        await transporter.sendMail({
            from: EMAIL_CFG.from,
            to: 'formation@mullerautomotive.fr',
            ...(email ? { cc: email } : {}),
            subject: `[Sensibilisation] ${mod} — ${prenom} ${nom} — ${pct}%`,
            html: `<div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">
<div style="background:#1e3a8a;padding:18px 24px">
  <h2 style="color:#fff;margin:0;font-size:1.1rem">🎓 Résultats Sensibilisation — ${mod}</h2>
  <p style="color:#93c5fd;margin:4px 0 0;font-size:.85rem">${date}</p>
</div>
<div style="padding:20px;border:1px solid #eee;border-top:none">
<table style="width:100%;border-collapse:collapse;font-size:.88rem">
<tr style="background:#f8f9fa"><td style="padding:8px 10px;color:#888;width:40%">Participant</td><td style="padding:8px 10px"><strong>${prenom} ${nom}</strong></td></tr>
<tr><td style="padding:8px 10px;color:#888">Email</td><td style="padding:8px 10px">${email || '—'}</td></tr>
<tr style="background:#f8f9fa"><td style="padding:8px 10px;color:#888">Société / Service</td><td style="padding:8px 10px">${societe || '—'}</td></tr>
<tr><td style="padding:8px 10px;color:#888">Module suivi</td><td style="padding:8px 10px"><strong>${mod}</strong></td></tr>
<tr style="background:#f8f9fa"><td style="padding:8px 10px;color:#888">Score questionnaire initial</td><td style="padding:8px 10px">${preScore !== undefined ? preScore + ' / 5' : '—'}</td></tr>
<tr><td style="padding:8px 10px;color:#888">Score quiz final</td><td style="padding:8px 10px"><strong>${score} / ${total} (${pct}%)</strong></td></tr>
<tr style="background:#f8f9fa"><td style="padding:8px 10px;color:#888">Statut</td><td style="padding:8px 10px"><strong style="color:${statutColor}">${statut}</strong></td></tr>
<tr><td style="padding:8px 10px;color:#888">Date</td><td style="padding:8px 10px">${date}</td></tr>
</table>
</div>
<div style="background:#f5f5f5;padding:10px 24px;font-size:.75rem;color:#aaa">Envoi automatique — formation-sav.fr/SENSIBILISATION/</div>
</div>`,
        });
        res.json({ ok: true });
    } catch (err) {
        console.error('[sensibilisation email]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/data — lecture baseDeDonnees + documentsPannes ────
app.get('/api/data', (req, res) => {
    res.json(loadData());
});

// ── PUT /api/data — sauvegarde baseDeDonnees + documentsPannes ─
app.put('/api/data', requireContributor, (req, res) => {
    const { baseDeDonnees, documentsPannes } = req.body || {};
    if (!baseDeDonnees || !documentsPannes)
        return res.status(400).json({ error: 'Corps invalide' });
    saveData({ baseDeDonnees, documentsPannes });
    res.json({ ok: true });
});

// ── POST /api/upload — upload d'un fichier média (contributeur+) ─
app.post('/api/upload', requireContributor, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    res.json({ ok: true, filename: req.file.filename });
});

// ── DELETE /api/media — suppression physique d'un fichier média (contributeur+) ─
app.delete('/api/media', requireContributor, (req, res) => {
    const { gamme, machine, file } = req.query;
    if (!gamme || !machine || !file)
        return res.status(400).json({ error: 'Paramètres gamme/machine/file manquants' });

    // Sécurité : interdire les traversées de répertoire (../)
    if ([gamme, machine, file].some(p => p.includes('..') || p.includes('/') || p.includes('\\')))
        return res.status(400).json({ error: 'Paramètre invalide' });

    const filePath = path.join(MEDIA_DIR, gamme, machine, file);
    if (!fs.existsSync(filePath))
        return res.status(404).json({ error: 'Fichier introuvable' });

    fs.unlinkSync(filePath);
    res.json({ ok: true });
});

// ── POST /api/send-diplome — envoi certificat GEO par email ─────
app.post('/api/send-diplome', async (req, res) => {
    const { pdfBase64, filename, nom, prenom, score } = req.body || {};
    if (!pdfBase64 || !nom || !prenom)
        return res.status(400).json({ error: 'Données manquantes (pdfBase64, nom, prenom)' });

    const transporter = nodemailer.createTransport({
        host:   EMAIL_CFG.host,
        port:   EMAIL_CFG.port,
        secure: EMAIL_CFG.secure,
        auth:   { user: EMAIL_CFG.user, pass: EMAIL_CFG.pass }
    });

    const date = new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

    try {
        await transporter.sendMail({
            from:    EMAIL_CFG.from,
            to:      EMAIL_CFG.to,
            subject: `[GEO] Certificat — ${prenom} ${nom.toUpperCase()} — ${date}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">
                  <div style="background:#c0392b;padding:20px 28px">
                    <h2 style="color:#fff;margin:0;font-size:1.1rem">🎓 Nouveau certificat Formation Géométrie</h2>
                  </div>
                  <div style="padding:24px 28px">
                    <p>Le technicien <strong>${prenom} ${nom.toUpperCase()}</strong> vient de compléter le module <strong>Formation Géométrie MRA</strong>.</p>
                    ${score ? `<p>Score obtenu : <strong>${score}</strong></p>` : ''}
                    <p>Date : ${date}</p>
                    <p style="color:#555">Le certificat est joint à cet email en pièce jointe PDF.</p>
                  </div>
                  <div style="background:#f5f5f5;padding:12px 28px;font-size:0.78rem;color:#aaa">
                    Envoi automatique — formation-sav.fr
                  </div>
                </div>`,
            attachments: [{
                filename:    filename || `Certificat_GEO_${prenom}_${nom}.pdf`,
                content:     Buffer.from(pdfBase64, 'base64'),
                contentType: 'application/pdf'
            }]
        });
        console.log(`[email] Certificat envoyé : ${prenom} ${nom}`);
        res.json({ ok: true });
    } catch (err) {
        console.error('[email] Erreur :', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
//  NON-CONFORMITÉS — AUTH SÉPARÉE
// ══════════════════════════════════════════════════════════════

function loadNCUsers() {
    try { if (fs.existsSync(NC_USERS_FILE)) return JSON.parse(fs.readFileSync(NC_USERS_FILE,'utf8')); }
    catch(e) { console.error('nc-users.json:', e.message); }
    const defaults = [{
        user: 'nc-admin', passHash: hash('muller-nc-2026'),
        role: 'nc_admin', name: 'Admin NC',
        createdAt: new Date().toISOString()
    }];
    atomicWriteSync(NC_USERS_FILE, JSON.stringify(defaults,null,2));
    return defaults;
}
function saveNCUsers(u) {
    atomicWriteSync(NC_USERS_FILE, JSON.stringify(u,null,2));
    if (pgPool) u.forEach(usr => pgSyncNcUser(usr));
}

function requireNCAuth(req, res, next) {
    const token = (req.headers.authorization||'').replace('Bearer ','').trim();
    if (!token) return res.status(401).json({ error:'Non authentifié NC' });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.scope !== 'nc') return res.status(401).json({ error:'Token NC invalide' });
        req.ncUser = payload;
        next();
    } catch { res.status(401).json({ error:'Token invalide ou expiré' }); }
}
function requireNCAdmin(req, res, next) {
    requireNCAuth(req, res, () => {
        if (req.ncUser.role !== 'nc_admin')
            return res.status(403).json({ error:'Accès refusé — rôle nc_admin requis' });
        next();
    });
}

// POST /api/nc-auth/login
app.post('/api/nc-auth/login', loginLimiter, (req,res) => {
    const { user, pass } = req.body||{};
    if (!user||!pass) return res.json({ result:'invalid' });
    const users = loadNCUsers();
    const found = users.find(u => u.user.toLowerCase()===user.toLowerCase());
    if (!found || !verifyPass(pass, found.passHash)) return res.json({ result:'invalid' });
    // Lazy migration hash → bcrypt si nécessaire
    if (!found.passHash.startsWith('$2b$') && !found.passHash.startsWith('$2a$')) {
        found.passHash = hashBcrypt(pass);
    }
    const token = jwt.sign(
        { user:found.user, role:found.role, name:found.name, email:found.email||'', scope:'nc' },
        JWT_SECRET, { expiresIn:'8h' }
    );
    found.lastLogin = new Date().toISOString();
    saveNCUsers(users);
    res.json({ result:'ok', token, name:found.name, role:found.role });
});

// GET /api/nc-auth/users — liste (nc_admin)
app.get('/api/nc-auth/users', requireNCAdmin, (req,res) => {
    res.json(loadNCUsers().map(({passHash,...u})=>u));
});

// GET /api/nc-auth/pilotes — liste des chefs produit (tous les rôles NC)
app.get('/api/nc-auth/pilotes', requireNCAuth, (req,res) => {
    const pilotes = loadNCUsers()
        .filter(u => u.role === 'nc_chef_produit')
        .map(u => ({ name: u.name, email: u.email||'' }));
    res.json(pilotes);
});

// POST /api/nc-auth/users — créer utilisateur NC (nc_admin)
app.post('/api/nc-auth/users', requireNCAdmin, (req,res) => {
    const { name, user, pass, role, email } = req.body||{};
    if (!name||!user||!pass) return res.status(400).json({ result:'invalid' });
    const passErr = validatePassword(pass);
    if (passErr) return res.status(400).json({ result:'invalid', error: passErr });
    if (role === 'nc_chef_produit' && !email?.trim())
        return res.status(400).json({ result:'invalid', error:'L\'email est obligatoire pour le rôle Pilote.' });
    const users = loadNCUsers();
    if (users.find(u=>u.user.toLowerCase()===user.toLowerCase()))
        return res.json({ result:'existe' });
    const validRoles = ['nc_admin','nc_chef_produit','nc_lecteur','nc_viewer','nc_codir'];
    users.push({ user, passHash:hashBcrypt(pass),
        role: validRoles.includes(role) ? role : 'nc_lecteur',
        name, email: email||'', createdAt:new Date().toISOString() });
    saveNCUsers(users);
    res.json({ result:'ok' });
});

// PUT /api/nc-auth/users/:user — modifier infos utilisateur (nc_admin)
app.put('/api/nc-auth/users/:user', requireNCAdmin, (req,res) => {
    const { name, email, role } = req.body||{};
    const users = loadNCUsers();
    const u = users.find(u=>u.user===req.params.user);
    if (!u) return res.status(404).json({ error:'Utilisateur non trouvé' });
    const targetRole = role || u.role;
    if (targetRole === 'nc_chef_produit') {
        const targetEmail = email !== undefined ? (email||'').trim() : u.email;
        if (!targetEmail) return res.status(400).json({ error:'L\'email est obligatoire pour le rôle Pilote.' });
    }
    if (name?.trim())  u.name  = name.trim();
    if (email !== undefined) u.email = (email||'').trim();
    if (role && ['nc_admin','nc_chef_produit','nc_lecteur','nc_codir'].includes(role)) u.role = role;
    saveNCUsers(users);
    res.json({ ok:true, user:{ user:u.user, name:u.name, email:u.email, role:u.role } });
});

// PUT /api/nc-auth/users/:user/password — changer MDP (nc_admin ou soi-même)
app.put('/api/nc-auth/users/:user/password', requireNCAuth, (req,res) => {
    const isSelf  = req.ncUser.user === req.params.user;
    const isAdmin = req.ncUser.role === 'nc_admin';
    if (!isSelf && !isAdmin) return res.status(403).json({ error:'Accès refusé' });
    const { pass, currentPass } = req.body||{};
    const passErr = validatePassword(pass);
    if (passErr) return res.status(400).json({ error: passErr });
    const users = loadNCUsers();
    const u = users.find(u=>u.user===req.params.user);
    if (!u) return res.status(404).json({ error:'Utilisateur non trouvé' });
    // Vérification ancien MDP côté serveur (bcrypt) — sans passer par la route login rate-limitée
    if (isSelf && !isAdmin) {
        if (!currentPass) return res.status(400).json({ error:'Mot de passe actuel requis.' });
        if (!verifyPass(currentPass, u.passHash)) return res.status(403).json({ error:'Mot de passe actuel incorrect.' });
    }
    u.passHash = hashBcrypt(pass);
    u.mustChangePass = false;
    saveNCUsers(users);
    res.json({ ok:true });
});

// DELETE /api/nc-auth/users/:user (nc_admin)
app.delete('/api/nc-auth/users/:user', requireNCAdmin, (req,res) => {
    if (req.params.user===req.ncUser.user)
        return res.status(400).json({ error:'Impossible de supprimer votre propre compte' });
    const users = loadNCUsers();
    if (!users.find(u=>u.user===req.params.user))
        return res.status(404).json({ error:'Utilisateur non trouvé' });
    saveNCUsers(users.filter(u=>u.user!==req.params.user));
    res.json({ ok:true });
});

// POST /api/nc-auth/users/:user/send-credentials — envoi identifiants par email (nc_admin)
// Étape A : génère un MDP temporaire, met à jour le hash, envoie email à l'utilisateur
app.post('/api/nc-auth/users/:user/send-credentials', requireNCAdmin, async (req,res) => {
    const users = loadNCUsers();
    const u = users.find(u=>u.user===req.params.user);
    if (!u) return res.status(404).json({ error:'Utilisateur non trouvé' });
    if (!u.email) return res.status(400).json({ error:'Cet utilisateur n\'a pas d\'adresse email renseignée.' });
    // MDP temporaire : 12 chars, maj + chiffre garantis
    const chars = 'abcdefghjkmnpqrstuvwxyz';
    const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    const digits = '23456789';
    let tmp = upper[Math.floor(Math.random()*upper.length)]
            + digits[Math.floor(Math.random()*digits.length)]
            + digits[Math.floor(Math.random()*digits.length)];
    for (let i=0; i<9; i++) tmp += chars[Math.floor(Math.random()*chars.length)];
    tmp = tmp.split('').sort(()=>Math.random()-.5).join('');
    u.passHash = hashBcrypt(tmp);
    u.mustChangePass = true;
    saveNCUsers(users);
    try {
        const tr = nodemailer.createTransport({ host:EMAIL_CFG.host, port:EMAIL_CFG.port, secure:EMAIL_CFG.secure, auth:{ user:EMAIL_CFG.user, pass:EMAIL_CFG.pass } });
        await tr.sendMail({
            from: EMAIL_CFG.from,
            to:   u.email,
            subject: '[NC Muller] Vos identifiants de connexion',
            html: `<div style="font-family:Arial,sans-serif;max-width:480px">
<h2 style="color:#c0392b">Console Non-Conformités — Muller Automotive</h2>
<p>Bonjour <strong>${u.name}</strong>,</p>
<p>Voici vos identifiants de connexion :</p>
<table style="border-collapse:collapse;margin:16px 0">
  <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:700">Identifiant</td><td style="padding:6px 12px;font-family:monospace">${u.user}</td></tr>
  <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:700">Mot de passe temporaire</td><td style="padding:6px 12px;font-family:monospace;font-size:1.1em;color:#c0392b">${tmp}</td></tr>
</table>
<p>Connectez-vous ici : <a href="https://formation-sav.fr/NC/login.html">https://formation-sav.fr/NC/login.html</a></p>
<p style="color:#888;font-size:0.85em">Ce mot de passe est temporaire. Vous serez invité à le modifier lors de votre prochaine connexion.</p>
</div>`
        });
        res.json({ ok:true });
    } catch(e) {
        res.status(500).json({ error:'Email non envoyé : ' + e.message });
    }
});

// POST /api/nc-auth/forgot-password — demande reset MDP (public, sans auth)
// Étape C : envoie un lien de réinitialisation par email
app.post('/api/nc-auth/forgot-password', async (req,res) => {
    const { user } = req.body||{};
    const users = loadNCUsers();
    const u = users.find(u=>u.user.toLowerCase()===(user||'').toLowerCase());
    // Réponse identique qu'on trouve ou non (sécurité : ne pas révéler l'existence du compte)
    if (!u || !u.email) return res.json({ ok:true });
    const token = genResetToken(u.user);
    const link = `https://formation-sav.fr/NC/reset-password.html?token=${token}`;
    try {
        const tr = nodemailer.createTransport({ host:EMAIL_CFG.host, port:EMAIL_CFG.port, secure:EMAIL_CFG.secure, auth:{ user:EMAIL_CFG.user, pass:EMAIL_CFG.pass } });
        await tr.sendMail({
            from: EMAIL_CFG.from,
            to:   u.email,
            subject: '[NC Muller] Réinitialisation de votre mot de passe',
            html: `<div style="font-family:Arial,sans-serif;max-width:480px">
<h2 style="color:#c0392b">Réinitialisation de mot de passe</h2>
<p>Bonjour <strong>${u.name}</strong>,</p>
<p>Cliquez sur le lien ci-dessous pour définir un nouveau mot de passe :</p>
<p style="margin:20px 0"><a href="${link}" style="background:#c0392b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700">Réinitialiser mon mot de passe</a></p>
<p style="color:#888;font-size:0.85em">Ce lien est valable <strong>1 heure</strong>. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
</div>`
        });
    } catch(e) { console.error('forgot-password email error:', e.message); }
    res.json({ ok:true });
});

// POST /api/nc-auth/reset-password — appliquer le nouveau MDP via token (public)
// Étape C
app.post('/api/nc-auth/reset-password', (req,res) => {
    const { token, pass } = req.body||{};
    const passErr = validatePassword(pass);
    if (passErr) return res.status(400).json({ error: passErr });
    const userLogin = consumeResetToken(token);
    if (!userLogin) return res.status(400).json({ error:'Lien invalide ou expiré. Faites une nouvelle demande.' });
    const users = loadNCUsers();
    const u = users.find(u=>u.user===userLogin);
    if (!u) return res.status(404).json({ error:'Utilisateur introuvable.' });
    u.passHash = hashBcrypt(pass);
    u.mustChangePass = false;
    saveNCUsers(users);
    res.json({ ok:true });
});

// ══════════════════════════════════════════════════════════════
//  NON-CONFORMITÉS — DONNÉES
// ══════════════════════════════════════════════════════════════
function loadNC() {
    try { if (fs.existsSync(NC_FILE)) return JSON.parse(fs.readFileSync(NC_FILE,'utf8')); }
    catch(e) { console.error('nc-data.json:', e.message); }
    return { counter: {}, declarations: [] };
}
function saveNC(d) {
    atomicWriteSync(NC_FILE, JSON.stringify(d,null,2));
    if (pgPool) {
        const { parentSet, satSet } = pgComputeGroupSets(loadNCParent());
        (d.declarations||[]).forEach(nc => pgSyncFiche(nc, parentSet, satSet));
    }
}

// ── Helpers Actions ───────────────────────────────────────────────
function findActionInData(data, actionId) {
    for (const nc of data.declarations||[]) {
        const idx = (nc.actions||[]).findIndex(a=>a.id===actionId);
        if (idx !== -1) return { nc, action: nc.actions[idx], idx };
    }
    return null;
}
function checkAutoTransition(nc, actorName) {
    const actions = nc.actions||[];
    if (!actions.length || nc.statut !== 'en_cours') return false;
    if (!actions.every(a=>a.statut==='cloturé')) return false;
    const now = new Date();
    nc.statut = 'resolu';
    nc.updatedAt = now.toISOString();
    if (!nc.historique) nc.historique = [];
    nc.historique.push({ date:now.toISOString(), statut:'resolu',
        commentaire:'Toutes les actions sont terminées — passage automatique en attente de validation',
        par: actorName||'Système' });
    return true;
}

const uploadTempNC = multer({
    storage: multer.diskStorage({
        destination(req,file,cb){ fs.mkdirSync(path.join(NC_MEDIA,'temp'),{recursive:true}); cb(null,path.join(NC_MEDIA,'temp')); },
        filename(req,file,cb){ cb(null, Date.now()+'-'+file.originalname.replace(/[^\w.\-]/g,'_')); }
    }),
    limits:{ fileSize: 200*1024*1024 }
});

// POST /api/nc/upload-temp — upload média temporaire
app.post('/api/nc/upload-temp', uploadTempNC.single('file'), (req,res) => {
    if(!req.file) return res.status(400).json({error:'Pas de fichier'});
    res.json({ fileId: req.file.filename, originalName: req.file.originalname,
               url: `/NC/media/temp/${req.file.filename}`, size: req.file.size });
});

// POST /api/nc — créer une NC
app.post('/api/nc', async (req,res) => {
    const { redacteur,emailRedacteur,dateDecouverte,decouvreur,perimetre,sourceDetection,noCommande,refProduit,familleProduit,noSerie,versionProg,
            quantiteUnites,
            sapCode,nomClient,cp,ville,pays,probleme,reparation,suggestion,
            mediaFiles,mediaFilesTraitement,pdfBase64 } = req.body||{};
    if (!probleme) return res.status(400).json({error:'Champ problème obligatoire'});
    if (!familleProduit) return res.status(400).json({error:'Famille de produit obligatoire'});
    if (!sapCode?.trim()) return res.status(400).json({error:'Code SAP client obligatoire'});
    if (!noSerie?.trim()) return res.status(400).json({error:'Numéro de série obligatoire (saisir NS si non sérialisé)'});

    const data = loadNC();
    const now  = new Date();
    const yr   = String(now.getFullYear());
    const yy   = yr.slice(2);
    const mm   = String(now.getMonth()+1).padStart(2,'0');
    const dd   = String(now.getDate()).padStart(2,'0');
    if (!data.counter[yr]) data.counter[yr] = 0;
    data.counter[yr]++;
    const numero = `${yy}${mm}${dd}-${String(data.counter[yr]).padStart(4,'0')}`;

    // Déplacer les fichiers temp vers le dossier NC
    const ncDir = path.join(NC_MEDIA, numero);
    fs.mkdirSync(ncDir,{recursive:true});

    function moveFiles(fileList) {
        const saved=[], attachments=[];
        for (const f of (fileList||[])) {
            const src = path.join(NC_MEDIA,'temp',f.fileId);
            if (fs.existsSync(src)) {
                const dst = path.join(ncDir, f.fileId);
                fs.renameSync(src, dst);
                saved.push({ fileId:f.fileId, name:f.originalName||f.fileId, url:`/NC/media/${numero}/${f.fileId}` });
                const stat = fs.statSync(dst);
                if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(f.fileId) || stat.size < 8*1024*1024)
                    attachments.push({ filename: f.originalName||f.fileId, path: dst });
            }
        }
        return { saved, attachments };
    }

    const prob = moveFiles(mediaFiles);
    const trt  = moveFiles(mediaFilesTraitement);
    const emailAttachments = [...prob.attachments, ...trt.attachments];

    const nc = { numero, createdAt:now.toISOString(), statut:'ouvert',
        redacteur:redacteur||'', emailRedacteur:emailRedacteur||'',
        dateDecouverte:dateDecouverte||'', decouvreur:decouvreur||'',
        perimetre:perimetre||'', sourceDetection:sourceDetection||'',
        noCommande:noCommande||'',
        refProduit:refProduit||'', familleProduit:familleProduit||'', noSerie:noSerie||'', versionProg:versionProg||'',
        quantiteUnites:quantiteUnites||null,
        sapCode:sapCode||'', nomClient:nomClient||'', cp:cp||'', ville:ville||'', pays:pays||'',
        probleme:probleme||'',
        reparation:reparation||'', suggestion:suggestion||'',
        mediaFiles:prob.saved, mediaFilesTraitement:trt.saved,
        historique:[{date:now.toISOString(),statut:'ouvert',commentaire:'Déclaration créée',par:redacteur||'Anonyme'}]
    };
    data.declarations.unshift(nc);
    saveNC(data);

    // Email
    if (pdfBase64) emailAttachments.unshift({filename:`NC_${numero}.pdf`,content:Buffer.from(pdfBase64,'base64'),contentType:'application/pdf'});
    if (ncMailEnabled('creationNC')) try {
        const tr = nodemailer.createTransport({host:EMAIL_CFG.host,port:EMAIL_CFG.port,secure:EMAIL_CFG.secure,auth:{user:EMAIL_CFG.user,pass:EMAIL_CFG.pass}});
        const dateStr = now.toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
        const totalMedias = prob.saved.length + trt.saved.length;
        const ccList = emailRedacteur ? emailRedacteur : undefined;
        await tr.sendMail({
            from:EMAIL_CFG.from, to:ncMailTo(), ...(ccList ? {cc: ccList} : {}),
            subject:`[NC ${numero}] ${nomClient||'?'} — ${refProduit||''}`,
            html:`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto">
<div style="background:#c0392b;padding:18px 24px"><h2 style="color:#fff;margin:0;font-size:1.1rem">🔴 Non-Conformité N° ${numero}</h2><p style="color:#ffaaaa;margin:4px 0 0;font-size:0.85rem">${dateStr}</p></div>
<div style="padding:20px;border:1px solid #eee;border-top:none">
<table style="width:100%;border-collapse:collapse;font-size:0.88rem">
<tr style="background:#fafafa"><td style="padding:7px 10px;color:#888;width:38%">Rédacteur</td><td style="padding:7px 10px">${redacteur||'—'}${emailRedacteur?' &lt;'+emailRedacteur+'&gt;':''}</td></tr>
<tr><td style="padding:7px 10px;color:#888">Périmètre</td><td style="padding:7px 10px"><strong>${perimetre||'—'}</strong></td></tr>
<tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">Source détection</td><td style="padding:7px 10px">${sourceDetection||'—'}</td></tr>
<tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">Date découverte</td><td style="padding:7px 10px">${dateDecouverte||'—'}</td></tr>
<tr><td style="padding:7px 10px;color:#888">Client</td><td style="padding:7px 10px"><strong>${nomClient||'—'}</strong>${ville?' — '+ville:''}</td></tr>
<tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">Réf. produit</td><td style="padding:7px 10px">${refProduit||'—'}</td></tr>
<tr><td style="padding:7px 10px;color:#888">Famille de produit</td><td style="padding:7px 10px">${familleProduit||'—'}</td></tr>
<tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">N° série</td><td style="padding:7px 10px">${noSerie||'—'}</td></tr>
<tr><td style="padding:7px 10px;color:#888">N° Commande</td><td style="padding:7px 10px">${noCommande||'—'}</td></tr>
${quantiteUnites?`<tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">Quantité d'unités</td><td style="padding:7px 10px"><strong>${quantiteUnites}</strong></td></tr>`:''}
<tr><td colspan="2" style="padding:10px;background:#fff5f5;border-top:2px solid #f5c6c6"><strong style="color:#c00">Caractérisation du problème :</strong><br><div style="margin-top:6px">${(probleme||'').replace(/\n/g,'<br>')}</div></td></tr>
${reparation?`<tr><td style="padding:7px 10px;color:#888">Réparation</td><td style="padding:7px 10px">${(reparation).replace(/\n/g,'<br>')}</td></tr>`:''}
${suggestion?`<tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">Suggestion</td><td style="padding:7px 10px">${suggestion}</td></tr>`:''}
${totalMedias?`<tr><td style="padding:7px 10px;color:#888">Pièces jointes</td><td style="padding:7px 10px">${prob.saved.length} photo(s) problème + ${trt.saved.length} photo(s) traitement</td></tr>`:''}
</table></div>
<div style="background:#f5f5f5;padding:10px 24px;font-size:0.75rem;color:#aaa">Envoi automatique — formation-sav.fr/NC/</div></div>`,
            attachments: emailAttachments
        });
        console.log(`[NC] ${numero} créée et email envoyé${ccList?' (CC: '+ccList+')':''}`);
    } catch(err) { console.error('[NC email]', err.message); }

    res.json({ ok:true, numero });
});

// GET /api/nc/version — mtime du fichier nc-data.json (polling léger)
app.get('/api/nc/version', requireNCAuth, (req,res) => {
    try {
        const mtime = fs.statSync(NC_FILE).mtime.toISOString();
        res.json({ mtime });
    } catch { res.json({ mtime: null }); }
});

// GET /api/nc/appversion — version applicative + historique (public)
app.get('/api/nc/appversion', (req,res) => {
    res.json({ version: NC_APP_VERSION, history: NC_VERSION_HISTORY });
});

// GET /api/nc — liste (auth)
app.get('/api/nc', requireNCAuth, (req,res) => {
    const { statut, search, from, to, perimetre, sourceDetection } = req.query;
    let list = (loadNC().declarations||[]);
    // Chef produit : ne voit que ses NC assignées — sauf en mode vue Lecteur (viewAll=1)
    if (req.ncUser.role === 'nc_chef_produit' && req.query.viewAll !== '1') {
        list = list.filter(n => n.pilote === req.ncUser.name ||
            (n.actions||[]).some(a => a.pilote === req.ncUser.name));
    }
    if (statut && statut!=='tous') list = list.filter(n=>(n.statut||n.status)===statut);
    if (search) { const s=search.toLowerCase(); list=list.filter(n=>[n.numero,n.nomClient,n.refProduit,n.redacteur,n.probleme].join(' ').toLowerCase().includes(s)); }
    if (from) list = list.filter(n=>n.createdAt>=from);
    if (to)   list = list.filter(n=>n.createdAt<=to+'T23:59:59');
    if (perimetre)       list = list.filter(n=>n.perimetre===perimetre);
    if (sourceDetection) list = list.filter(n=>n.sourceDetection===sourceDetection);
    res.json(list);
});

// GET /api/nc/public/:numero — suivi public (sans auth) — données limitées
app.get('/api/nc/public/:numero', (req,res) => {
    const nc = (loadNC().declarations||[]).find(d=>d.numero===req.params.numero);
    if (!nc) return res.status(404).json({error:'NC non trouvée'});
    // Retourner uniquement les infos de suivi, pas les données internes
    res.json({
        numero:     nc.numero,
        createdAt:  nc.createdAt,
        statut:     nc.statut || nc.status || 'ouvert',
        nomClient:  nc.nomClient || '',
        refProduit: nc.refProduit || '',
        historique: (nc.historique||[]).map(h=>({
            date:        h.date,
            statut:      h.statut,
            commentaire: h.commentaire || ''
            // on n'expose pas h.par (nom de l'agent interne)
        }))
    });
});

// GET /api/nc/config — lire la configuration (tous les rôles authentifiés)
app.get('/api/nc/config', requireNCAuth, (req,res) => {
    res.json(loadNCConfig());
});

// PUT /api/nc/config — sauvegarder la configuration (admin uniquement)
app.put('/api/nc/config', requireNCAuth, (req,res) => {
    if (req.ncUser.role !== 'nc_admin')
        return res.status(403).json({ error:'Accès refusé' });
    const { emailsQualite, famillesProduit, typesCause, notificationsEmail } = req.body||{};
    const cfg = loadNCConfig();
    if (Array.isArray(emailsQualite))    cfg.emailsQualite    = emailsQualite.map(e=>e.trim()).filter(Boolean);
    if (Array.isArray(famillesProduit))  cfg.famillesProduit  = famillesProduit.map(f=>f.trim()).filter(Boolean).sort();
    if (Array.isArray(typesCause))       cfg.typesCause       = typesCause.map(t=>t.trim()).filter(Boolean).sort();
    if (notificationsEmail && typeof notificationsEmail==='object') cfg.notificationsEmail = notificationsEmail;
    saveNCConfig(cfg);
    res.json({ ok:true, config:cfg });
});

// GET /api/nc/config/listes-publiques — périmètres + sources + familles + types cause (sans auth, pour le formulaire public)
app.get('/api/nc/config/listes-publiques', (req,res) => {
    const cfg = loadNCConfig();
    res.json({
        perimetres:      cfg.perimetres||[],
        sourcesDetection:cfg.sourcesDetection||[],
        famillesProduit: cfg.famillesProduit||[],
        typesCause:      cfg.typesCause||[]
    });
});

// GET /api/nc/config/listes — périmètres + sources (authentifié)
app.get('/api/nc/config/listes', requireNCAuth, (req,res) => {
    const cfg = loadNCConfig();
    res.json({ perimetres: cfg.perimetres||[], sourcesDetection: cfg.sourcesDetection||[] });
});

// POST /api/nc/config/perimetres — ajouter un périmètre (admin)
app.post('/api/nc/config/perimetres', requireNCAuth, (req,res) => {
    if (req.ncUser.role !== 'nc_admin') return res.status(403).json({error:'Accès refusé'});
    const { valeur } = req.body||{};
    if (!valeur?.trim()) return res.status(400).json({error:'Valeur manquante'});
    const cfg = loadNCConfig();
    const v = valeur.trim();
    if (!cfg.perimetres) cfg.perimetres = [];
    if (!cfg.perimetres.includes(v)) { cfg.perimetres.push(v); cfg.perimetres.sort((a,b)=>a.localeCompare(b,'fr')); }
    saveNCConfig(cfg);
    res.json({ ok:true, perimetres:cfg.perimetres });
});

// DELETE /api/nc/config/perimetres/:valeur — supprimer un périmètre (admin)
app.delete('/api/nc/config/perimetres/:valeur', requireNCAuth, (req,res) => {
    if (req.ncUser.role !== 'nc_admin') return res.status(403).json({error:'Accès refusé'});
    const cfg = loadNCConfig();
    cfg.perimetres = (cfg.perimetres||[]).filter(p=>p!==decodeURIComponent(req.params.valeur));
    saveNCConfig(cfg);
    res.json({ ok:true, perimetres:cfg.perimetres });
});

// POST /api/nc/config/sources — ajouter une source de détection (admin)
app.post('/api/nc/config/sources', requireNCAuth, (req,res) => {
    if (req.ncUser.role !== 'nc_admin') return res.status(403).json({error:'Accès refusé'});
    const { valeur } = req.body||{};
    if (!valeur?.trim()) return res.status(400).json({error:'Valeur manquante'});
    const cfg = loadNCConfig();
    const v = valeur.trim();
    if (!cfg.sourcesDetection) cfg.sourcesDetection = [];
    if (!cfg.sourcesDetection.includes(v)) { cfg.sourcesDetection.push(v); cfg.sourcesDetection.sort((a,b)=>a.localeCompare(b,'fr')); }
    saveNCConfig(cfg);
    res.json({ ok:true, sourcesDetection:cfg.sourcesDetection });
});

// DELETE /api/nc/config/sources/:valeur — supprimer une source (admin)
app.delete('/api/nc/config/sources/:valeur', requireNCAuth, (req,res) => {
    if (req.ncUser.role !== 'nc_admin') return res.status(403).json({error:'Accès refusé'});
    const cfg = loadNCConfig();
    cfg.sourcesDetection = (cfg.sourcesDetection||[]).filter(s=>s!==decodeURIComponent(req.params.valeur));
    saveNCConfig(cfg);
    res.json({ ok:true, sourcesDetection:cfg.sourcesDetection });
});

// POST /api/nc/config/test-email — envoi d'un email de test SMTP (admin)
app.post('/api/nc/config/test-email', requireNCAdmin, async (req, res) => {
    const cfg = loadNCConfig();
    const to = (cfg.emailsQualite||[]).filter(Boolean).join(', ') || EMAIL_CFG.user;
    if (!to) return res.status(400).json({ ok:false, error:'Aucun email destinataire configuré' });
    try {
        const tr = nodemailer.createTransport({ host:EMAIL_CFG.host, port:EMAIL_CFG.port, secure:EMAIL_CFG.secure, auth:{ user:EMAIL_CFG.user, pass:EMAIL_CFG.pass } });
        await tr.sendMail({
            from:`"Muller Automotive NC" <${EMAIL_CFG.user}>`,
            to,
            subject:'[TEST SMTP] Vérification configuration email NC',
            html:`<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
                <h2 style="color:#c0392b">✅ Test SMTP réussi</h2>
                <p>Cet email confirme que la configuration SMTP de votre système NC fonctionne correctement.</p>
                <table style="border-collapse:collapse;width:100%;font-size:0.85rem">
                  <tr><td style="padding:6px 10px;background:#f5f5f5;color:#888">Serveur SMTP</td><td style="padding:6px 10px">${EMAIL_CFG.host}:${EMAIL_CFG.port}</td></tr>
                  <tr><td style="padding:6px 10px;background:#f5f5f5;color:#888">Expéditeur</td><td style="padding:6px 10px">${EMAIL_CFG.user}</td></tr>
                  <tr><td style="padding:6px 10px;background:#f5f5f5;color:#888">Destinataire(s)</td><td style="padding:6px 10px">${to}</td></tr>
                  <tr><td style="padding:6px 10px;background:#f5f5f5;color:#888">Date du test</td><td style="padding:6px 10px">${new Date().toLocaleString('fr-FR')}</td></tr>
                </table>
                <p style="margin-top:16px;color:#888;font-size:0.75rem">Envoi automatique depuis la console NC — Muller Automotive</p>
            </div>`
        });
        res.json({ ok:true, to });
    } catch(e) {
        res.json({ ok:false, error: e.message });
    }
});

// GET /api/nc/stats/perimetre-source — stats agrégées par périmètre et source (auth)
app.get('/api/nc/stats/perimetre-source', requireNCAuth, (req,res) => {
    const annee = parseInt(req.query.annee) || new Date().getFullYear();
    const list = (loadNC().declarations||[]).filter(n=>new Date(n.createdAt).getFullYear()===annee);
    const byP={}, byS={};
    list.forEach(nc=>{
        const p=nc.perimetre||'(non renseigné)';
        const s=nc.sourceDetection||'(non renseigné)';
        const stat=nc.statut||'ouvert';
        const duree=nc.dureeTotal??nc._duree??null;
        if(!byP[p]) byP[p]={perimetre:p,total:0,en_cours:0,resolu:0,clos:0,durees:[]};
        byP[p].total++;
        if(stat==='en_cours') byP[p].en_cours++;
        if(stat==='resolu')   byP[p].resolu++;
        if(stat==='clos'){byP[p].clos++; if(duree!=null)byP[p].durees.push(duree);}
        if(!byS[s]) byS[s]={source:s,total:0,clos:0,durees:[]};
        byS[s].total++;
        if(stat==='clos'){byS[s].clos++; if(duree!=null)byS[s].durees.push(duree);}
    });
    const calc=(r,k)=>{const d=r.durees;const m=d.length?Math.round(d.reduce((a,b)=>a+b,0)/d.length):null;const o={...r,moyJ:m};delete o.durees;return o;};
    res.json({
        parPerimetre: Object.values(byP).sort((a,b)=>b.total-a.total).map(r=>calc(r)),
        parSource:    Object.values(byS).sort((a,b)=>b.total-a.total).map(r=>calc(r))
    });
});

// PATCH /api/nc/:numero/meta — champs libres (gravite, risque, 5pourquoi, etc.) — pas de lock clos
app.patch('/api/nc/:numero/meta', requireNCAuth, (req,res) => {
    if (req.ncUser.role !== 'nc_admin')
        return res.status(403).json({ error:'Réservé aux administrateurs' });
    const ALLOWED = ['gravite','risqueImpact','scoreRisque','processus','cinqPourquoi','causeRacine','ishikawa','retourClient','blocageSignale'];
    const data = loadNC();
    const nc = data.declarations.find(d=>d.numero===req.params.numero);
    if (!nc) return res.status(404).json({error:'NC non trouvée'});
    const body = req.body||{};
    ALLOWED.forEach(k => { if (k in body) nc[k] = body[k]; });
    nc.updatedAt = new Date().toISOString();
    saveNC(data);
    res.json(nc);
});

// POST /api/nc/create-parent-group — créer une NC Parent (stockée dans nc-data.json)
app.post('/api/nc/create-parent-group', requireNCAuth, async (req, res) => {
    if (req.ncUser.role !== 'nc_admin') return res.status(403).json({ error:'Admin requis' });
    const { label, nc_ids, motif, perimetre, gravite, processus, familleProduit } = req.body||{};
    if (!label?.trim()) return res.status(400).json({ error:'Libellé obligatoire' });
    if (!Array.isArray(nc_ids)||nc_ids.length<2) return res.status(400).json({ error:'Minimum 2 NC requises' });
    const data = loadNC(); const decls = data.declarations||[];
    for (const id of nc_ids) {
        const clash = decls.find(d=>d.is_parent && d.statut!=='clos' && (d.satellites||[]).includes(id));
        if (clash) return res.status(409).json({ error:`NC ${id} déjà satellite du groupe ${clash.numero}` });
    }
    if (!data.parentCounter) data.parentCounter=0;
    data.parentCounter++;
    const numero = `NC-P-${String(data.parentCounter).padStart(5,'0')}`;
    const now = new Date();
    const by = req.ncUser.name||req.ncUser.user||'admin';
    const GRAV = { critique:3, majeure:2, mineure:1 };
    let maxGrav = gravite||'mineure';
    const perims = new Set(perimetre?[perimetre]:[]);
    const familles = new Set();
    for (const id of nc_ids) {
        const nc = decls.find(d=>d.numero===id);
        if (nc) {
            if ((GRAV[nc.gravite]||0)>(GRAV[maxGrav]||0)) maxGrav=nc.gravite;
            if (nc.perimetre) perims.add(nc.perimetre);
            if (nc.familleProduit) familles.add(nc.familleProduit);
        }
    }
    // Famille héritée des satellites (obligatoire)
    const familleCalculee = familleProduit?.trim() || [...familles].join(', ');
    if (!familleCalculee) return res.status(400).json({ error:'Famille produit introuvable — renseignez d\'abord la famille sur les NC sélectionnées' });
    const parentNC = {
        numero, is_parent:true, satellites:[...nc_ids],
        createdAt:now.toISOString(), statut:'ouvert',
        redacteur:by, emailRedacteur:req.ncUser.email||'',
        gravite:maxGrav, perimetre:[...perims].join(', ')||'',
        processus:processus||'', familleProduit:familleCalculee,
        groupe_label:label.trim(), groupe_motif:motif||'',
        groupe_created_at:now.toISOString(), groupe_created_by:by,
        probleme:motif||label.trim(),
        actions:[], discussion:[],
        historique:[{ date:now.toISOString(), statut:'en_traitement', commentaire:`NC Parent créée — ${nc_ids.length} NC satellites rattachées. Motif : ${motif||label.trim()}`, par:by }],
        analyse_5p:null, ishikawa:null, pilote_email:'', pilote_nom:''
    };
    for (const id of nc_ids) {
        const nc = decls.find(d=>d.numero===id);
        if (nc) {
            nc._statut_avant = nc.statut; nc.statutAvantRattachement = nc.statut;
            nc.statut = 'rattachee';
            nc.is_satellite=true; nc.parent_id=numero; nc.parent_label=label.trim();
            nc.rattachement_date=now.toISOString(); nc.rattachement_by=by;
            if (!nc.historique) nc.historique=[];
            nc.historique.push({ date:now.toISOString(), statut:'rattachee', commentaire:`Rattachée au groupe parent ${numero} — "${label.trim()}"`, par:by });
        }
    }
    data.declarations.unshift(parentNC);
    saveNC(data);
    try {
        const pgData=loadNCParent(); if (!pgData.journal) pgData.journal=[];
        pgData.journal.unshift({ action:'GROUPE_CREE', parent_id:numero, satellites:nc_ids, by, motif, label:label.trim(), timestamp:now.toISOString() });
        saveNCParent(pgData);
    } catch(e) {}
    console.log(`[NC Parent] Créée : ${numero} — ${nc_ids.length} satellites`);
    res.json(parentNC);
});

// PUT /api/nc/:numero/add-satellite — rattachement tardif d'une satellite à un groupe parent
app.put('/api/nc/add-satellite/:numero', requireNCAuth, (req, res) => {
    if (req.ncUser.role !== 'nc_admin') return res.status(403).json({ error:'Admin requis' });
    const { nc_id, motif } = req.body||{};
    if (!nc_id) return res.status(400).json({ error:'nc_id requis' });
    const data = loadNC(); const decls = data.declarations||[];
    const parent = decls.find(d=>d.numero===req.params.numero && d.is_parent);
    if (!parent) return res.status(404).json({ error:'NC Parent non trouvée' });
    if (parent.statut==='clos') return res.status(403).json({ error:'NC Parent clôturée' });
    const clash = decls.find(d=>d.is_parent && d.statut!=='clos' && (d.satellites||[]).includes(nc_id));
    if (clash) return res.status(409).json({ error:`NC ${nc_id} déjà satellite du groupe ${clash.numero}` });
    if (!parent.satellites) parent.satellites=[];
    if (!parent.satellites.includes(nc_id)) {
        parent.satellites.push(nc_id);
        const sat = decls.find(d=>d.numero===nc_id);
        if (sat) {
            sat._statut_avant = sat.statut; sat.statutAvantRattachement = sat.statut;
            sat.statut = 'rattachee';
            sat.is_satellite=true; sat.parent_id=req.params.numero; sat.parent_label=parent.groupe_label||'';
            if (!sat.historique) sat.historique=[];
            sat.historique.push({ date:new Date().toISOString(), statut:'rattachee', commentaire:`Rattachée en tardif au groupe parent ${req.params.numero}`, par:req.ncUser.name||'Admin' });
        }
    }
    saveNC(data);
    res.json(parent);
});

// DELETE /api/nc/:parentNumero/satellites/:nc_id — détachement d'une NC satellite (restaure le statut d'avant rattachement)
app.delete('/api/nc/:parentNumero/satellites/:nc_id', requireNCAuth, (req, res) => {
    if (req.ncUser.role !== 'nc_admin') return res.status(403).json({ error:'Admin requis' });
    const { motif } = req.body||{};
    const data = loadNC(); const decls = data.declarations||[];
    const parent = decls.find(d=>d.numero===req.params.parentNumero && d.is_parent);
    if (!parent) return res.status(404).json({ error:'NC Parent non trouvée' });
    const nc_id = req.params.nc_id;
    if (!(parent.satellites||[]).includes(nc_id)) return res.status(404).json({ error:`NC ${nc_id} non satellite de ${req.params.parentNumero}` });
    const sat = decls.find(d=>d.numero===nc_id);
    if (!sat) return res.status(404).json({ error:'NC satellite non trouvée' });
    const by = req.ncUser.name||req.ncUser.user||'admin';
    const now = new Date().toISOString();
    // Retirer de la liste satellites du parent
    parent.satellites = parent.satellites.filter(id=>id!==nc_id);
    if (!parent.historique) parent.historique=[];
    parent.historique.push({ date:now, statut:parent.statut, commentaire:`NC ${nc_id} détachée du groupe${motif?' — '+motif:''}`, par:by });
    // Restaurer le statut d'avant rattachement
    const statutRestaure = sat.statutAvantRattachement || sat._statut_avant || 'ouvert';
    sat.statut = statutRestaure;
    sat.is_satellite = false; delete sat.parent_id; delete sat.parent_label;
    delete sat.statutAvantRattachement; delete sat._statut_avant;
    if (!sat.historique) sat.historique=[];
    sat.historique.push({ date:now, statut:statutRestaure, commentaire:`Détachée du groupe parent ${req.params.parentNumero}${motif?' — '+motif:''}`, par:by });
    saveNC(data);
    // Journal nc-parent-groups.json (traçabilité ISO §10.2.2)
    try {
        const pgData=loadNCParent(); if (!pgData.journal) pgData.journal=[];
        pgData.journal.unshift({ action:'SATELLITE_DETACHE', parent_id:req.params.parentNumero, nc_id, by, motif:motif||'', timestamp:now });
        saveNCParent(pgData);
    } catch(e){}
    console.log(`[NC Parent] NC ${nc_id} détachée de ${req.params.parentNumero} — statut restauré : ${statutRestaure}`);
    res.json({ ok:true, statut_restaure:statutRestaure });
});

// GET /api/nc/parent-groups — compat backward : retourne groupes depuis nc-data.json + journal/notifs
app.get('/api/nc/parent-groups', requireNCAuth, (req, res) => {
    const pgData = loadNCParent();
    const ncData = loadNC();
    const parents = (ncData.declarations||[]).filter(d=>d.is_parent);
    // Construire la structure attendue par nc_parent_satellites.js
    const groups = parents.map(p => ({
        id: p.numero, is_parent:true, satellites:p.satellites||[],
        groupe_label:p.groupe_label||'', groupe_perimetre:p.perimetre?(p.perimetre.split(',').map(s=>s.trim()).filter(Boolean)):[],
        gravite:p.gravite||'mineure', statut:p.statut==='clos'?'close':p.statut==='en_cours'?'en_traitement':p.statut,
        groupe_created_at:p.groupe_created_at||p.createdAt, groupe_created_by:p.groupe_created_by||p.redacteur,
        groupe_motif:p.groupe_motif||p.probleme||'',
        pilote_email:p.pilote_email||'', pilote_nom:p.pilote_nom||'',
        actions:p.actions||[], analyse_5p:p.analyse_5p||null, ishikawa:p.ishikawa||null,
        clos_le:p.closedAt||null, clos_par:p.clos_par||null, preuve_efficacite:p.preuve_efficacite||null
    }));
    res.json({ groups, notifications:pgData.notifications||[], journal:pgData.journal||[] });
});

// GET /api/nc/:numero — détail complet (auth NC)
app.get('/api/nc/:numero', requireNCAuth, (req,res) => {
    let nc = (loadNC().declarations||[]).find(d=>d.numero===req.params.numero);
    // Fallback pour NC Parent pas encore migrées (NC-P-XXXXX dans nc-parent-groups.json)
    if (!nc && /^NC-P-/i.test(req.params.numero)) {
        const g = (loadNCParent().groups||[]).find(gr=>gr.id===req.params.numero);
        if (g) nc = {
            numero:g.id, is_parent:true, satellites:g.satellites||[],
            createdAt:g.groupe_created_at||new Date().toISOString(),
            statut:g.statut==='close'?'clos': g.statut==='en_traitement'?'en_cours':'ouvert',
            redacteur:g.groupe_created_by||'Admin', emailRedacteur:g.pilote_email||'',
            gravite:g.gravite||'mineure', perimetre:(g.groupe_perimetre||[]).join(', ')||'',
            processus:'', familleProduit:'',
            groupe_label:g.groupe_label||'', groupe_motif:g.groupe_motif||'',
            groupe_created_at:g.groupe_created_at||'', groupe_created_by:g.groupe_created_by||'Admin',
            probleme:g.groupe_motif||g.groupe_label||'',
            actions:g.actions||[], discussion:[], historique:[],
            analyse_5p:g.analyse_5p||null, ishikawa:g.ishikawa||null,
            pilote_email:g.pilote_email||'', pilote_nom:g.pilote_nom||''
        };
    }
    if (!nc) return res.status(404).json({error:'NC non trouvée'});
    res.json(nc);
});

// PUT /api/nc/:numero/status — changer statut (nc_admin uniquement)
app.put('/api/nc/:numero/status', requireNCAuth, async (req,res) => {
    if (req.ncUser.role !== 'nc_admin')
        return res.status(403).json({ error:'Seul un administrateur peut modifier le statut' });
    const body = req.body||{};
    const { statut, commentaire, pilote, delaiAction, typeAction, typeCause, cout, commentaireCloture, familleProduit, perimetre, sourceDetection } = body;
    const data = loadNC();
    const nc = data.declarations.find(d=>d.numero===req.params.numero);
    if (!nc) return res.status(404).json({error:'NC non trouvée'});

    // Champs qualité — sauvegardés sans verrou clos (pas de changement de statut)
    const META_FIELDS = ['gravite','risqueImpact','scoreRisque','processus','cinqPourquoi','causeRacine','ishikawa','retourClient','blocageSignale'];
    if (!statut) {
        META_FIELDS.forEach(k => { if (k in body) nc[k] = body[k]; });
        nc.updatedAt = new Date().toISOString();
        saveNC(data);
        return res.json(nc);
    }

    // Verrou clos — aucune modification de statut possible
    if (nc.statut === 'clos')
        return res.status(403).json({ error:'NC clôturée — aucune modification possible' });

    const now = new Date();
    nc.statut    = statut;
    nc.updatedAt = now.toISOString();
    if (pilote         !== undefined) nc.pilote         = pilote         || '';
    if (delaiAction    !== undefined) nc.delaiAction    = delaiAction    || '';
    if (typeAction     !== undefined) nc.typeAction     = typeAction     || '';
    if (familleProduit    !== undefined) nc.familleProduit    = familleProduit    || '';
    if (perimetre         !== undefined) nc.perimetre         = perimetre         || '';
    if (sourceDetection   !== undefined) nc.sourceDetection   = sourceDetection   || '';
    if (typeCause          !== undefined) nc.typeCause          = typeCause          || '';
    if (cout               !== undefined) nc.cout               = cout !== '' && cout != null ? parseFloat(cout) : null;
    if (commentaireCloture !== undefined) nc.commentaireCloture = commentaireCloture || '';
    if (!nc.historique) nc.historique = [];
    nc.historique.push({
        date: now.toISOString(), statut, commentaire: commentaire||'',
        par: req.ncUser.name||req.ncUser.user,
        ...(pilote     ? { pilote }      : {}),
        ...(delaiAction ? { delaiAction } : {})
    });

    // ── Enregistrement durées à la clôture ──────────────────────
    if (statut === 'clos') {
        nc.closedAt    = now.toISOString();
        nc.dureeTotal  = Math.max(0, Math.round((now - new Date(nc.createdAt)) / 86400000));
        const enCoursEntry = nc.historique.find(h => h.statut === 'en_cours');
        nc.dureeTraitement = enCoursEntry
            ? Math.max(0, Math.round((now - new Date(enCoursEntry.date)) / 86400000))
            : null;
        if (nc.delaiAction) {
            const deadline = new Date(nc.delaiAction);
            deadline.setHours(23, 59, 59, 999);
            nc.echeanceRespectee = now <= deadline;
        } else {
            nc.echeanceRespectee = null;
        }
    }

    saveNC(data);

    // ── Cascade clôture si NC Parent ────────────────────────────
    if (statut === 'clos' && nc.is_parent && (nc.satellites||[]).length) {
        const by2 = req.ncUser.name||req.ncUser.user||'admin';
        const satsClos = [];
        for (const satId of nc.satellites) {
            const sat = data.declarations.find(d=>d.numero===satId);
            if (!sat || sat.statut==='clos') continue;
            sat.statut='clos'; sat.closedAt=now.toISOString();
            sat.cloture_via_parent=nc.numero;
            sat.dureeTotal=Math.max(0,Math.round((now-new Date(sat.createdAt))/86400000));
            if (!sat.historique) sat.historique=[];
            sat.historique.push({ date:now.toISOString(), statut:'clos', commentaire:`Clôturée en cascade via NC Parent ${nc.numero} — ${nc.groupe_label||''}`, par:by2 });
            satsClos.push(sat);
        }
        if (satsClos.length) saveNC(data);
        for (const sat of satsClos) {
            if (!sat.emailRedacteur || !ncMailEnabled('changementStatut')) continue;
            try {
                const tr3=nodemailer.createTransport({host:EMAIL_CFG.host,port:EMAIL_CFG.port,secure:EMAIL_CFG.secure,auth:{user:EMAIL_CFG.user,pass:EMAIL_CFG.pass}});
                await tr3.sendMail({ from:EMAIL_CFG.from, to:sat.emailRedacteur,
                    subject:`[NC ${sat.numero}] Clôturée — Traitement groupe parent ${nc.numero}`,
                    html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><div style="background:#0c447c;padding:18px 24px;border-bottom:3px solid #27ae60"><h2 style="color:#fff;margin:0;font-size:1rem">✅ Votre NC ${sat.numero} est clôturée</h2><p style="color:#b8d9f0;margin:5px 0 0;font-size:0.82rem">Via le groupe d'analyse NC Parent ${nc.numero}</p></div><div style="padding:20px 24px;border:1px solid #eee;border-top:none"><p style="font-size:0.9rem">Bonjour <strong>${sat.redacteur||''}</strong>,</p><p style="font-size:0.9rem">Votre non-conformité <strong>${sat.numero}</strong> a été clôturée dans le cadre du groupe d'analyse <strong>${nc.numero} — ${nc.groupe_label||''}</strong>.</p>${commentaire?`<div style="background:#f4f8fd;border-left:4px solid #0c447c;padding:10px 14px;margin:12px 0;font-size:0.88rem">${commentaire.replace(/\n/g,'<br>')}</div>`:''}<p style="font-size:0.78rem;color:#888;margin-top:16px">Muller Automotive — Service Qualité NC</p></div></div>`
                });
            } catch(e2) { console.error('[cascade close email]', e2.message); }
        }
    }

    // ── Email au pilote assigné ──────────────────────────────────
    const effectivePilote = pilote || nc.pilote;
    const effectiveDelai  = delaiAction || nc.delaiAction;
    if (statut === 'en_cours' && effectivePilote) {
        const piloteUser  = loadNCUsers().find(u => u.name === effectivePilote);
        const piloteEmail = piloteUser?.email || PILOTES[effectivePilote];
    if (piloteEmail && ncMailEnabled('creationAction')) {
        const dateStr  = now.toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
        const delaiStr = effectiveDelai ? new Date(effectiveDelai).toLocaleDateString('fr-FR') : '—';
        try {
            const ccQualite = ncMailEnabled('creationAction_qualite') ? ncMailTo() : null;
            const tr = nodemailer.createTransport({host:EMAIL_CFG.host,port:EMAIL_CFG.port,secure:EMAIL_CFG.secure,auth:{user:EMAIL_CFG.user,pass:EMAIL_CFG.pass}});
            await tr.sendMail({
                from: EMAIL_CFG.from,
                to:   piloteEmail,
                ...(ccQualite ? { cc: ccQualite } : {}),
                subject: `[NC ${nc.numero}] Action requise — Délai : ${delaiStr} — ${nc.nomClient||'?'}`,
                html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto">
<div style="background:#2980b9;padding:18px 24px;border-bottom:3px solid #1a6fa0">
  <h2 style="color:#fff;margin:0;font-size:1.05rem">📋 Action requise — Non-Conformité N° ${nc.numero}</h2>
  <p style="color:#b8d9f0;margin:5px 0 0;font-size:0.82rem">Vous êtes désigné(e) pilote de cette action — ${dateStr}</p>
</div>
<div style="padding:20px 24px;border:1px solid #eee;border-top:none">
  <p style="font-size:0.9rem;margin-bottom:16px">Bonjour <strong>${effectivePilote}</strong>,</p>
  <p style="font-size:0.9rem;margin-bottom:16px">Vous avez été désigné(e) pilote de l'action corrective pour la non-conformité suivante :</p>
  <table style="width:100%;border-collapse:collapse;font-size:0.88rem;margin-bottom:16px">
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888;width:38%">N° NC</td><td style="padding:7px 10px;font-weight:700;font-family:monospace">${nc.numero}</td></tr>
    <tr><td style="padding:7px 10px;color:#888">Client</td><td style="padding:7px 10px"><strong>${nc.nomClient||'—'}</strong>${nc.ville?' — '+nc.ville:''}</td></tr>
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">Réf. produit</td><td style="padding:7px 10px">${nc.refProduit||'—'}</td></tr>
    <tr><td style="padding:7px 10px;color:#888">Famille de produit</td><td style="padding:7px 10px">${nc.familleProduit||'—'}</td></tr>
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">N° série</td><td style="padding:7px 10px">${nc.noSerie||'—'}</td></tr>
    <tr><td colspan="2" style="padding:10px;background:#fff5f5;border-top:2px solid #f5c6c6"><strong style="color:#c00">Problème constaté :</strong><br><div style="margin-top:6px">${(nc.probleme||'').replace(/\n/g,'<br>')}</div></td></tr>
    ${commentaire?`<tr><td style="padding:7px 10px;color:#555">Action attendue</td><td style="padding:7px 10px">${commentaire.replace(/\n/g,'<br>')}</td></tr>`:''}
    <tr style="background:#fff3cd"><td style="padding:10px;color:#856404"><strong>🗓 Délai de résolution</strong></td><td style="padding:10px;font-weight:700;font-size:1.05rem;color:#856404">${delaiStr}</td></tr>
  </table>
  <p style="font-size:0.78rem;color:#888">Suivi et mise à jour : <a href="https://formation-sav.fr/NC/console.html">Console NC Muller</a></p>
</div>
<div style="background:#f5f5f5;padding:10px 24px;font-size:0.72rem;color:#aaa">Envoi automatique — Muller Automotive, formation-sav.fr/NC/</div>
</div>`
            });
            console.log(`[NC pilote] Email envoyé à ${piloteEmail} (${effectivePilote}) pour ${nc.numero}`);
        } catch(err) {
            console.error('[NC pilote email]', err.message);
        }
    } // end if piloteEmail
    } // end if en_cours && pilote

    // ── Email de notification au rédacteur ──────────────────────
    if (nc.emailRedacteur) {
        const SLBL = { ouvert:'Réceptionné', en_cours:'En traitement', resolu:'En attente validation', clos:'Clos' };
        const statutLabel = SLBL[statut] || statut;
        const dateStr = now.toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
        const timeStr = now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});

        const colorMap = { ouvert:'#e67e22', en_cours:'#2980b9', resolu:'#27ae60', clos:'#7f8c8d' };
        const couleur = colorMap[statut] || '#555';

        // Construire l'historique complet pour l'email
        const histLines = (nc.historique||[]).map(h =>
            `<tr style="background:${nc.historique.indexOf(h)%2?'#fff':'#f9f9f9'}">
              <td style="padding:6px 10px;color:#888;font-size:0.82rem">${new Date(h.date).toLocaleString('fr-FR')}</td>
              <td style="padding:6px 10px;font-weight:600;color:${colorMap[h.statut]||'#555'};font-size:0.82rem">${SLBL[h.statut]||h.statut}</td>
              <td style="padding:6px 10px;font-size:0.82rem;font-style:italic;color:#555">${h.commentaire||'—'}</td>
            </tr>`
        ).join('');

        if (ncMailEnabled('changementStatut')) try {
            const ccQualiteStatut = ncMailEnabled('changementStatut_qualite') ? ncMailTo() : null;
            const tr = nodemailer.createTransport({host:EMAIL_CFG.host,port:EMAIL_CFG.port,secure:EMAIL_CFG.secure,auth:{user:EMAIL_CFG.user,pass:EMAIL_CFG.pass}});
            await tr.sendMail({
                from: EMAIL_CFG.from,
                to:   nc.emailRedacteur,
                ...(ccQualiteStatut ? { cc: ccQualiteStatut } : {}),
                subject: `[NC ${nc.numero}] Mise à jour : ${statutLabel}`,
                html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
<div style="background:#1a1a1a;padding:18px 24px;border-bottom:3px solid ${couleur}">
  <h2 style="color:#fff;margin:0;font-size:1.05rem">Mise à jour de votre non-conformité</h2>
  <p style="color:#aaa;margin:5px 0 0;font-size:0.82rem">N° ${nc.numero} — ${dateStr} à ${timeStr}</p>
</div>
<div style="padding:20px 24px;border:1px solid #eee;border-top:none">
  <p style="margin-bottom:16px;font-size:0.9rem">Bonjour <strong>${nc.redacteur||''}
</strong>,</p>
  <p style="margin-bottom:16px;font-size:0.9rem">Le statut de votre déclaration a été mis à jour :</p>
  <div style="background:${couleur}18;border-left:4px solid ${couleur};padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:20px">
    <span style="font-size:1rem;font-weight:700;color:${couleur}">${statutLabel}</span>
    ${commentaire ? `<p style="margin:8px 0 0;color:#444;font-size:0.88rem">${commentaire.replace(/\n/g,'<br>')}</p>` : ''}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:0.82rem;margin-bottom:20px">
    <thead><tr style="background:#2b2b2b;color:#fff">
      <th style="padding:8px 10px;text-align:left">Date</th>
      <th style="padding:8px 10px;text-align:left">Statut</th>
      <th style="padding:8px 10px;text-align:left">Commentaire</th>
    </tr></thead>
    <tbody>${histLines}</tbody>
  </table>
  <p style="font-size:0.78rem;color:#888">
    Vous pouvez consulter l'évolution complète de votre NC sur le formulaire de déclaration.<br>
    Référence machine : <strong>${nc.refProduit||'—'}</strong> — Client : <strong>${nc.nomClient||'—'}</strong>
  </p>
</div>
<div style="background:#f5f5f5;padding:10px 24px;font-size:0.72rem;color:#aaa">
  Envoi automatique — Muller Automotive, formation-sav.fr/NC/
</div></div>`
            });
            console.log(`[NC status] Email envoyé à ${nc.emailRedacteur} pour ${nc.numero} (${statutLabel})`);
        } catch(err) {
            console.error('[NC status email]', err.message);
        }
    }

    // ── Email clôture → service qualité ────────────────────────
    if ((statut === 'clos' || statut === 'non_pertinent') && ncMailEnabled('cloture')) {
        const SLBL2 = { clos:'Clos', non_pertinent:'Non pertinent' };
        const colorMap2 = { clos:'#7f8c8d', non_pertinent:'#8e44ad' };
        const couleur2 = colorMap2[statut] || '#555';
        const dateStr2 = now.toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
        try {
            const tr = nodemailer.createTransport({host:EMAIL_CFG.host,port:EMAIL_CFG.port,secure:EMAIL_CFG.secure,auth:{user:EMAIL_CFG.user,pass:EMAIL_CFG.pass}});
            await tr.sendMail({
                from: EMAIL_CFG.from,
                to:   ncMailTo(),
                subject: `[NC ${nc.numero}] Clôturée — ${SLBL2[statut]||statut} — ${nc.nomClient||'?'}`,
                html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
<div style="background:#2b2b2b;padding:18px 24px;border-bottom:3px solid ${couleur2}">
  <h2 style="color:#fff;margin:0;font-size:1.05rem">✅ Non-conformité clôturée — N° ${nc.numero}</h2>
  <p style="color:#aaa;margin:5px 0 0;font-size:0.82rem">${dateStr2} — Par ${req.ncUser.name||req.ncUser.user}</p>
</div>
<div style="padding:20px 24px;border:1px solid #eee;border-top:none">
  <table style="width:100%;border-collapse:collapse;font-size:0.88rem;margin-bottom:16px">
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888;width:35%">N° NC</td><td style="padding:7px 10px;font-weight:700;font-family:monospace">${nc.numero}</td></tr>
    <tr><td style="padding:7px 10px;color:#888">Statut final</td><td style="padding:7px 10px"><strong style="color:${couleur2}">${SLBL2[statut]||statut}</strong></td></tr>
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">Client</td><td style="padding:7px 10px">${nc.nomClient||'—'}${nc.ville?' — '+nc.ville:''}</td></tr>
    <tr><td style="padding:7px 10px;color:#888">Réf. produit</td><td style="padding:7px 10px">${nc.refProduit||'—'}</td></tr>
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">Famille</td><td style="padding:7px 10px">${nc.familleProduit||'—'}</td></tr>
    <tr><td style="padding:7px 10px;color:#888">Type de cause</td><td style="padding:7px 10px">${nc.typeCause||'—'}</td></tr>
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">Durée totale</td><td style="padding:7px 10px">${nc.dureeTotal!=null?nc.dureeTotal+' j':'—'}</td></tr>
    ${nc.commentaireCloture?`<tr><td style="padding:7px 10px;color:#888">Commentaire</td><td style="padding:7px 10px;font-style:italic">${nc.commentaireCloture.replace(/\n/g,'<br>')}</td></tr>`:''}
  </table>
  <p style="font-size:0.78rem;color:#888">Suivi : <a href="https://formation-sav.fr/NC/console.html">Console NC Muller</a></p>
</div>
<div style="background:#f5f5f5;padding:10px 24px;font-size:0.72rem;color:#aaa">Envoi automatique — Muller Automotive, formation-sav.fr/NC/</div></div>`
            });
            console.log(`[NC cloture] Email envoyé à ${ncMailTo()} pour ${nc.numero}`);
        } catch(err) {
            console.error('[NC cloture email]', err.message);
        }
    }

    res.json(nc);
});

// POST /api/nc/:numero/reponse-pilote — réponse du chef produit assigné
app.post('/api/nc/:numero/reponse-pilote', requireNCAuth, (req,res) => {
    if (!['nc_admin','nc_chef_produit'].includes(req.ncUser.role))
        return res.status(403).json({ error:'Accès refusé' });
    const { reponse } = req.body||{};
    if (!reponse || !reponse.trim())
        return res.status(400).json({ error:'Réponse vide' });
    const data = loadNC();
    const nc = data.declarations.find(d=>d.numero===req.params.numero);
    if (!nc) return res.status(404).json({ error:'NC non trouvée' });
    if (nc.statut === 'clos')
        return res.status(403).json({ error:'NC clôturée — aucune réponse possible' });
    // Chef produit : uniquement ses NC ou actions assignées
    if (req.ncUser.role === 'nc_chef_produit') {
        const hasAction = (nc.actions||[]).some(a=>a.pilote===req.ncUser.name);
        if (nc.pilote !== req.ncUser.name && !hasAction)
            return res.status(403).json({ error:'NC non assignée à votre compte' });
    }
    if (!nc.reponsesPilote) nc.reponsesPilote = [];
    nc.reponsesPilote.push({
        date: new Date().toISOString(),
        reponse: reponse.trim(),
        par: req.ncUser.name||req.ncUser.user
    });
    nc.updatedAt = new Date().toISOString();
    saveNC(data);
    res.json(nc);
});

// ══════════════════════════════════════════════════════════════
//  ACTIONS NC
// ══════════════════════════════════════════════════════════════

// POST /api/nc/:numero/actions — créer une action (nc_admin)
app.post('/api/nc/:numero/actions', requireNCAuth, async (req,res) => {
    if (req.ncUser.role !== 'nc_admin')
        return res.status(403).json({ error:'Seul un administrateur peut créer une action' });
    const { type, pilote, echeance, commentaireAction } = req.body||{};
    if (!pilote?.trim()) return res.status(400).json({ error:'Pilote requis' });
    const data = loadNC();
    const nc = data.declarations.find(d=>d.numero===req.params.numero);
    if (!nc) return res.status(404).json({ error:'NC non trouvée' });
    if (['clos','non_pertinent'].includes(nc.statut))
        return res.status(400).json({ error:'Impossible d\'ajouter une action à une NC clôturée' });

    if (!nc.actions) nc.actions = [];
    const now = new Date();
    const seq = String(nc.actions.length + 1).padStart(3,'0');
    const actionId = `ACT-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${seq}-${nc.numero}`;

    const action = {
        id: actionId,
        ncNumero: nc.numero,
        type: ['immediate','curative','corrective','preventive'].includes(type) ? type : 'corrective',
        pilote: pilote.trim(),
        echeance: echeance||'',
        commentaireAction: commentaireAction||'',
        statut: 'ouvert',
        historiqueStatut: [{ date:now.toISOString(), statut:'ouvert', par:req.ncUser.name||req.ncUser.user }],
        reponsesActions: [],
        datePiloteReponse: null,
        echeanceRespectee: null,
        createdAt: now.toISOString(),
        createdBy: req.ncUser.name||req.ncUser.user,
        relances: []
    };
    nc.actions.push(action);
    nc.updatedAt = now.toISOString();
    saveNC(data);

    // Email au pilote
    const piloteUser = loadNCUsers().find(u=>u.name===pilote.trim());
    const piloteEmail = piloteUser?.email || PILOTES[pilote.trim()];
    if (piloteEmail && ncMailEnabled('creationAction')) {
        const delaiStr = echeance ? new Date(echeance).toLocaleDateString('fr-FR') : '—';
        const typeLabel = type==='immediate'?'Immédiate':type==='curative'?'Curative':type==='preventive'?'Préventive':'Corrective';
        const ccQualiteAction = ncMailEnabled('creationAction_qualite') ? ncMailTo() : null;
        try {
            const tr = nodemailer.createTransport({host:EMAIL_CFG.host,port:EMAIL_CFG.port,secure:EMAIL_CFG.secure,auth:{user:EMAIL_CFG.user,pass:EMAIL_CFG.pass}});
            await tr.sendMail({
                from:EMAIL_CFG.from, to:piloteEmail, ...(ccQualiteAction?{cc:ccQualiteAction}:{}),
                subject:`[NC ${nc.numero}] Nouvelle action ${typeLabel} — Délai : ${delaiStr} — ${nc.nomClient||'?'}`,
                html:`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto">
<div style="background:#2980b9;padding:18px 24px;border-bottom:3px solid #1a6fa0">
  <h2 style="color:#fff;margin:0;font-size:1.05rem">📋 Nouvelle action — NC N° ${nc.numero}</h2>
  <p style="color:#b8d9f0;margin:5px 0 0;font-size:0.82rem">Action ${typeLabel} — ${now.toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})}</p>
</div>
<div style="padding:20px 24px;border:1px solid #eee;border-top:none">
  <p style="font-size:0.9rem;margin-bottom:16px">Bonjour <strong>${pilote.trim()}</strong>,</p>
  <p style="font-size:0.9rem;margin-bottom:16px">Une nouvelle action vous a été assignée :</p>
  <table style="width:100%;border-collapse:collapse;font-size:0.88rem;margin-bottom:16px">
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888;width:38%">NC N°</td><td style="padding:7px 10px;font-weight:700;font-family:monospace">${nc.numero}</td></tr>
    <tr><td style="padding:7px 10px;color:#888">Client</td><td style="padding:7px 10px"><strong>${nc.nomClient||'—'}</strong>${nc.ville?' — '+nc.ville:''}</td></tr>
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">Réf. produit</td><td style="padding:7px 10px">${nc.refProduit||'—'}</td></tr>
    <tr><td style="padding:7px 10px;color:#888">Type d'action</td><td style="padding:7px 10px"><strong>${typeLabel}</strong></td></tr>
    <tr style="background:#fafafa"><td colspan="2" style="padding:10px;background:#fff5f5;border-top:2px solid #f5c6c6"><strong style="color:#c00">Problème :</strong><br><div style="margin-top:6px">${(nc.probleme||'').replace(/\n/g,'<br>')}</div></td></tr>
    ${commentaireAction?`<tr><td style="padding:7px 10px;color:#555">Action attendue</td><td style="padding:7px 10px">${commentaireAction.replace(/\n/g,'<br>')}</td></tr>`:''}
    <tr style="background:#fff3cd"><td style="padding:10px;color:#856404"><strong>🗓 Délai</strong></td><td style="padding:10px;font-weight:700;font-size:1.05rem;color:#856404">${delaiStr}</td></tr>
  </table>
  <p style="font-size:0.78rem;color:#888">Accès : <a href="https://formation-sav.fr/NC/console.html">Console NC Muller</a></p>
</div>
<div style="background:#f5f5f5;padding:10px 24px;font-size:0.72rem;color:#aaa">Envoi automatique — Muller Automotive</div>
</div>`
            });
            console.log(`[NC action] Email envoyé à ${piloteEmail} (${pilote.trim()}) — ${nc.numero}`);
        } catch(err) { console.error('[NC action email]', err.message); }
    }

    res.json(nc);
});

// GET /api/nc/:numero/actions — liste des actions (auth NC)
app.get('/api/nc/:numero/actions', requireNCAuth, (req,res) => {
    const data = loadNC();
    const nc = data.declarations.find(d=>d.numero===req.params.numero);
    if (!nc) return res.status(404).json({ error:'NC non trouvée' });
    res.json(nc.actions||[]);
});

// PUT /api/nc/action/:id/statut — changer statut d'une action
app.put('/api/nc/action/:id/statut', requireNCAuth, (req,res) => {
    const { statut, commentaire } = req.body||{};
    if (!['ouvert','en_cours','cloturé'].includes(statut))
        return res.status(400).json({ error:'Statut invalide' });
    const data = loadNC();
    const found = findActionInData(data, req.params.id);
    if (!found) return res.status(404).json({ error:'Action non trouvée' });
    const { nc, action } = found;
    // Droits : admin ou pilote de cette action
    if (req.ncUser.role !== 'nc_admin' && action.pilote !== req.ncUser.name)
        return res.status(403).json({ error:'Accès refusé' });
    const now = new Date();
    action.statut = statut;
    if (!action.historiqueStatut) action.historiqueStatut = [];
    action.historiqueStatut.push({ date:now.toISOString(), statut,
        par:req.ncUser.name||req.ncUser.user, commentaire:commentaire||'' });
    if (statut === 'cloturé' && action.echeance) {
        const deadline = new Date(action.echeance); deadline.setHours(23,59,59,999);
        action.echeanceRespectee = now <= deadline;
    }
    nc.updatedAt = now.toISOString();
    checkAutoTransition(nc, req.ncUser.name||req.ncUser.user);
    saveNC(data);
    res.json(nc);
});

// PUT /api/nc/action/:id/echeance — modifier l'échéance d'une action
app.put('/api/nc/action/:id/echeance', requireNCAuth, (req,res) => {
    if (req.ncUser.role !== 'nc_admin')
        return res.status(403).json({ error:'Réservé à l\'administrateur' });
    const { echeance } = req.body||{};
    if (!echeance) return res.status(400).json({ error:'Date requise' });
    const data = loadNC();
    const found = findActionInData(data, req.params.id);
    if (!found) return res.status(404).json({ error:'Action non trouvée' });
    const { nc, action } = found;
    if (action.statut === 'cloturé')
        return res.status(400).json({ error:'Action déjà clôturée' });
    const now = new Date();
    const ancienne = action.echeance || null;
    action.echeance = echeance;
    // Décongeler le J+/J- : l'ancienne valeur figée ne correspond plus à la nouvelle échéance
    delete action.jDiffFige;
    if (!action.historiqueStatut) action.historiqueStatut = [];
    action.historiqueStatut.push({
        date: now.toISOString(),
        statut: 'echeance_modifiee',
        ancienneEcheance: ancienne,
        nouvelleEcheance: echeance,
        par: req.ncUser.name || req.ncUser.user
    });
    nc.updatedAt = now.toISOString();
    saveNC(data);
    res.json(nc);
});

// POST /api/nc/action/:id/reponse-pilote — réponse du pilote
app.post('/api/nc/action/:id/reponse-pilote', requireNCAuth, async (req,res) => {
  try {
    if (!['nc_admin','nc_chef_produit'].includes(req.ncUser.role))
        return res.status(403).json({ error:'Accès refusé' });
    const { reponse, mediaFiles } = req.body||{};
    if (!reponse?.trim() && !(mediaFiles?.length))
        return res.status(400).json({ error:'Réponse ou fichier requis' });
    const data = loadNC();
    const found = findActionInData(data, req.params.id);
    if (!found) return res.status(404).json({ error:'Action non trouvée' });
    const { nc, action } = found;
    if (req.ncUser.role !== 'nc_admin' && action.pilote !== req.ncUser.name)
        return res.status(403).json({ error:'Cette action ne vous est pas assignée' });

    // Distinguer : retour_admin (msg au pilote), reponse_admin (force absence), reponse_pilote
    const isForceAdmin  = req.ncUser.role === 'nc_admin' && req.body.force === true;
    const isAdminRetour = req.ncUser.role === 'nc_admin' && !isForceAdmin;

    const actionDir = path.join(NC_MEDIA, nc.numero, 'actions', action.id);
    fs.mkdirSync(actionDir, {recursive:true});
    const savedFiles = [];
    for (const f of (mediaFiles||[])) {
        const src = path.join(NC_MEDIA,'temp',f.fileId);
        if (fs.existsSync(src)) {
            const dst = path.join(actionDir, f.fileId);
            fs.renameSync(src, dst);
            savedFiles.push({ fileId:f.fileId, name:f.originalName||f.fileId,
                url:`/NC/media/${nc.numero}/actions/${action.id}/${f.fileId}` });
        }
    }

    const now = new Date();
    if (!action.reponsesActions) action.reponsesActions = [];
    const isFirstReponse = action.reponsesActions.length === 0;
    action.reponsesActions.push({
        date:    now.toISOString(),
        reponse: (reponse||'').trim(),
        par:     req.ncUser.name||req.ncUser.user,
        type:    isAdminRetour ? 'retour_admin' : (isForceAdmin ? 'reponse_admin' : 'reponse_pilote'),
        fichiers: savedFiles
    });

    if (isAdminRetour) {
        // Retour admin → décongeler le compteur J+/J-, remettre en ouvert
        delete action.jDiffFige;
        if (action.statut === 'en_cours') {
            action.statut = 'ouvert';
            if (!action.historiqueStatut) action.historiqueStatut = [];
            action.historiqueStatut.push({ date:now.toISOString(), statut:'ouvert',
                par:req.ncUser.name||req.ncUser.user, commentaire:'Retour admin — à compléter' });
        }
    } else if (isForceAdmin) {
        // Réponse forcée admin (pilote absent) → comportement identique à réponse pilote
        action.datePiloteReponse = now.toISOString();
        if (action.echeance && action.jDiffFige === undefined) {
            const ech = new Date(action.echeance); ech.setHours(0,0,0,0);
            const ref = new Date(now);              ref.setHours(0,0,0,0);
            action.jDiffFige = Math.round((ech - ref) / 86400000);
        }
        if (['ouvert','en_attente'].includes(action.statut)) {
            action.statut = 'en_cours';
            if (!action.historiqueStatut) action.historiqueStatut = [];
            action.historiqueStatut.push({ date:now.toISOString(), statut:'en_cours',
                par:req.ncUser.name||req.ncUser.user, commentaire:'Réponse admin — en lieu du pilote absent' });
        }
    } else {
        // Réponse pilote → geler J+/J- dès que jDiffFige est absent
        action.datePiloteReponse = now.toISOString();
        if (action.echeance && action.jDiffFige === undefined) {
            const ech = new Date(action.echeance); ech.setHours(0,0,0,0);
            const ref = new Date(now);              ref.setHours(0,0,0,0);
            action.jDiffFige = Math.round((ech - ref) / 86400000);
        }
        if (action.statut === 'ouvert') {
            action.statut = 'en_cours';
            if (!action.historiqueStatut) action.historiqueStatut = [];
            action.historiqueStatut.push({ date:now.toISOString(), statut:'en_cours',
                par:req.ncUser.name||req.ncUser.user, commentaire:'Première réponse reçue' });
        }
    }

    nc.updatedAt = now.toISOString();
    saveNC(data);
    res.json(nc);

    // ── Emails post-sauvegarde ───────────────────────────────────────────────
    const TYPE_LBL = { immediate:'Immédiate', curative:'Curative', preventive:'Préventive', corrective:'Corrective' };
    const typeLabel = TYPE_LBL[action.type] || action.type || 'Corrective';
    const dateStr   = now.toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
    const delaiStr  = action.echeance ? new Date(action.echeance).toLocaleDateString('fr-FR') : '—';

    if (isForceAdmin) {
        // Réponse forcée admin — pas d'email au pilote absent, journalisation console uniquement
        console.log(`[NC force-admin] Réponse admin forcée enregistrée pour action ${action.id} (${nc.numero}) par ${req.ncUser.name||req.ncUser.user}`);
    } else if (isAdminRetour) {
        // Email au pilote : retour admin, action à compléter
        const piloteUser  = loadNCUsers().find(u=>u.name===action.pilote);
        const piloteEmail = piloteUser?.email || PILOTES[action.pilote];
        if (piloteEmail && ncMailEnabled('creationAction')) {
            try {
                const tr = nodemailer.createTransport({host:EMAIL_CFG.host,port:EMAIL_CFG.port,secure:EMAIL_CFG.secure,auth:{user:EMAIL_CFG.user,pass:EMAIL_CFG.pass}});
                await tr.sendMail({
                    from: EMAIL_CFG.from,
                    to:   piloteEmail,
                    cc:   ncMailEnabled('creationAction_qualite') ? ncMailTo() : undefined,
                    subject: `[NC ${nc.numero}] Retour — Action ${typeLabel} à compléter — ${nc.nomClient||'?'}`,
                    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto">
<div style="background:#8e44ad;padding:18px 24px;border-bottom:3px solid #6c3483">
  <h2 style="color:#fff;margin:0;font-size:1.05rem">↩ Retour sur votre action — NC N° ${nc.numero}</h2>
  <p style="color:#d7bde2;margin:5px 0 0;font-size:0.82rem">Action ${typeLabel} — ${dateStr}</p>
</div>
<div style="padding:20px 24px;border:1px solid #eee;border-top:none">
  <p style="font-size:0.9rem;margin-bottom:12px">Bonjour <strong>${action.pilote}</strong>,</p>
  <p style="font-size:0.9rem;margin-bottom:16px">Un retour a été effectué sur votre action corrective. Des compléments sont attendus.</p>
  <table style="width:100%;border-collapse:collapse;font-size:0.88rem;margin-bottom:16px">
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888;width:38%">NC N°</td><td style="padding:7px 10px;font-weight:700;font-family:monospace">${nc.numero}</td></tr>
    <tr><td style="padding:7px 10px;color:#888">Client</td><td style="padding:7px 10px"><strong>${nc.nomClient||'—'}</strong>${nc.ville?' — '+nc.ville:''}</td></tr>
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">Type d'action</td><td style="padding:7px 10px">${typeLabel}</td></tr>
    <tr><td style="padding:7px 10px;color:#888">Délai initial</td><td style="padding:7px 10px;font-weight:700;color:#856404">${delaiStr}</td></tr>
    ${reponse?`<tr style="background:#fdf2ff"><td style="padding:10px;color:#6c3483" colspan="2"><strong>Commentaire :</strong><br><div style="margin-top:6px">${reponse.replace(/\n/g,'<br>')}</div></td></tr>`:''}
  </table>
  <p style="font-size:0.78rem;color:#888">Merci de compléter votre réponse sur la <a href="https://formation-sav.fr/NC/console.html">console NC</a>.</p>
</div>
<div style="background:#f5f5f5;padding:10px 24px;font-size:0.72rem;color:#aaa">Envoi automatique — Muller Automotive, formation-sav.fr/NC/</div></div>`
                });
                console.log(`[NC retour-admin] Email envoyé à ${piloteEmail} pour action ${action.id} (${nc.numero})`);
            } catch(err) { console.error('[NC retour-admin email]', err.message); }
        }
    } else {
        // Email à qualité : réponse pilote reçue
        if (ncMailEnabled('changementStatut')) {
            try {
                const tr = nodemailer.createTransport({host:EMAIL_CFG.host,port:EMAIL_CFG.port,secure:EMAIL_CFG.secure,auth:{user:EMAIL_CFG.user,pass:EMAIL_CFG.pass}});
                const jDiffTxt = action.jDiffFige !== undefined
                    ? (action.jDiffFige >= 0 ? `J-${action.jDiffFige}` : `J+${Math.abs(action.jDiffFige)}`)
                    : '—';
                await tr.sendMail({
                    from:    EMAIL_CFG.from,
                    to:      ncMailTo(),
                    subject: `[NC ${nc.numero}] Réponse pilote — ${action.pilote} — ${typeLabel} — ${nc.nomClient||'?'}`,
                    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto">
<div style="background:#27ae60;padding:18px 24px;border-bottom:3px solid #1e8449">
  <h2 style="color:#fff;margin:0;font-size:1.05rem">✅ Réponse reçue — NC N° ${nc.numero}</h2>
  <p style="color:#a9dfbf;margin:5px 0 0;font-size:0.82rem">Action ${typeLabel} — Pilote : ${action.pilote} — ${dateStr}</p>
</div>
<div style="padding:20px 24px;border:1px solid #eee;border-top:none">
  <p style="font-size:0.9rem;margin-bottom:12px">Le pilote <strong>${action.pilote}</strong> a soumis une réponse à son action corrective.</p>
  <table style="width:100%;border-collapse:collapse;font-size:0.88rem;margin-bottom:16px">
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888;width:38%">NC N°</td><td style="padding:7px 10px;font-weight:700;font-family:monospace">${nc.numero}</td></tr>
    <tr><td style="padding:7px 10px;color:#888">Client</td><td style="padding:7px 10px"><strong>${nc.nomClient||'—'}</strong>${nc.ville?' — '+nc.ville:''}</td></tr>
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">Réf. produit</td><td style="padding:7px 10px">${nc.refProduit||'—'}</td></tr>
    <tr><td style="padding:7px 10px;color:#888">Type d'action</td><td style="padding:7px 10px">${typeLabel}</td></tr>
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">Délai / J+J-</td><td style="padding:7px 10px">${delaiStr} — <strong>${jDiffTxt}</strong> à la réponse</td></tr>
    ${reponse?`<tr style="background:#eafaf1"><td style="padding:10px;color:#1e8449" colspan="2"><strong>Réponse du pilote :</strong><br><div style="margin-top:6px">${reponse.replace(/\n/g,'<br>')}</div></td></tr>`:''}
  </table>
  <p style="font-size:0.78rem;color:#888">Consulter la NC sur la <a href="https://formation-sav.fr/NC/console.html">console NC</a>.</p>
</div>
<div style="background:#f5f5f5;padding:10px 24px;font-size:0.72rem;color:#aaa">Envoi automatique — Muller Automotive, formation-sav.fr/NC/</div></div>`
                });
                console.log(`[NC rep-pilote] Email envoyé à ${ncMailTo()} pour action ${action.id} (${nc.numero})`);
            } catch(err) { console.error('[NC rep-pilote email]', err.message); }
        }
    }
  } catch(err) {
    console.error('[reponse-pilote]', err.message);
    res.status(500).json({ error:'Erreur serveur : '+err.message });
  }
});

// POST /api/nc/action/:id/relance — relancer le pilote par email
app.post('/api/nc/action/:id/relance', requireNCAuth, async (req,res) => {
    if (req.ncUser.role !== 'nc_admin')
        return res.status(403).json({ error:'Seul un administrateur peut relancer' });
    const { commentaire } = req.body||{};
    const data = loadNC();
    const found = findActionInData(data, req.params.id);
    if (!found) return res.status(404).json({ error:'Action non trouvée' });
    const { nc, action } = found;
    const piloteUser = loadNCUsers().find(u=>u.name===action.pilote);
    const piloteEmail = piloteUser?.email || PILOTES[action.pilote];
    if (!piloteEmail) return res.status(400).json({ error:'Email pilote inconnu' });

    const now = new Date();
    if (!action.relances) action.relances = [];
    action.relances.push({ date:now.toISOString(), par:req.ncUser.name||req.ncUser.user, commentaire:commentaire||'' });
    saveNC(data);

    const delaiStr = action.echeance ? new Date(action.echeance).toLocaleDateString('fr-FR') : '—';
    const typeLabel = action.type==='immediate'?'Immédiate':action.type==='curative'?'Curative':action.type==='preventive'?'Préventive':'Corrective';
    if (!ncMailEnabled('relancePilote')) return res.json({ ok:true, message:'Relance enregistrée (email désactivé)' });
    const ccQualiteRelance = ncMailEnabled('relancePilote_qualite') ? ncMailTo() : null;
    try {
        const tr = nodemailer.createTransport({host:EMAIL_CFG.host,port:EMAIL_CFG.port,secure:EMAIL_CFG.secure,auth:{user:EMAIL_CFG.user,pass:EMAIL_CFG.pass}});
        await tr.sendMail({
            from:EMAIL_CFG.from, to:piloteEmail, ...(ccQualiteRelance?{cc:ccQualiteRelance}:{}),
            subject:`[NC ${nc.numero}] 🔔 Relance — Action ${typeLabel} — Délai : ${delaiStr}`,
            html:`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto">
<div style="background:#e67e22;padding:18px 24px;border-bottom:3px solid #d35400">
  <h2 style="color:#fff;margin:0;font-size:1.05rem">🔔 Relance — NC N° ${nc.numero}</h2>
  <p style="color:#fde5c0;margin:5px 0 0;font-size:0.82rem">Action ${typeLabel} — Délai : ${delaiStr}</p>
</div>
<div style="padding:20px 24px;border:1px solid #eee;border-top:none">
  <p>Bonjour <strong>${action.pilote}</strong>,</p>
  <p>Nous vous relançons concernant l'action assignée sur la NC suivante :</p>
  <table style="width:100%;border-collapse:collapse;font-size:0.88rem;margin-bottom:16px">
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888;width:38%">NC N°</td><td style="padding:7px 10px;font-weight:700;font-family:monospace">${nc.numero}</td></tr>
    <tr><td style="padding:7px 10px;color:#888">Client</td><td style="padding:7px 10px"><strong>${nc.nomClient||'—'}</strong></td></tr>
    <tr style="background:#fafafa"><td style="padding:7px 10px;color:#888">Action attendue</td><td style="padding:7px 10px">${action.commentaireAction||'—'}</td></tr>
    <tr style="background:#fff3cd"><td style="padding:10px;color:#856404"><strong>🗓 Délai</strong></td><td style="padding:10px;font-weight:700;color:#856404">${delaiStr}</td></tr>
    ${commentaire?`<tr><td style="padding:7px 10px;color:#555">Message</td><td style="padding:7px 10px">${commentaire}</td></tr>`:''}
  </table>
  <p style="font-size:0.78rem;color:#888">Accès : <a href="https://formation-sav.fr/NC/console.html">Console NC Muller</a></p>
</div>
<div style="background:#f5f5f5;padding:10px 24px;font-size:0.72rem;color:#aaa">Envoi automatique — Muller Automotive</div>
</div>`
        });
        console.log(`[NC relance] Email envoyé à ${piloteEmail} (${action.pilote}) — ${nc.numero}`);
    } catch(err) { console.error('[NC relance email]', err.message); }

    res.json({ ok:true, relances: action.relances });
});

// DELETE /api/nc/action/:id — supprimer une action (nc_admin)
app.delete('/api/nc/action/:id', requireNCAuth, (req,res) => {
    if (req.ncUser.role !== 'nc_admin')
        return res.status(403).json({ error:'Accès refusé' });
    const data = loadNC();
    const found = findActionInData(data, req.params.id);
    if (!found) return res.status(404).json({ error:'Action non trouvée' });
    const { nc } = found;
    nc.actions = nc.actions.filter(a=>a.id!==req.params.id);
    nc.updatedAt = new Date().toISOString();
    saveNC(data);
    res.json(nc);
});

// GET /api/nc/config — lire la configuration (tous les rôles authentifiés)

// GET /api/nc/export/csv — export CSV (nc_admin uniquement)
app.get('/api/nc/export/csv', requireNCAuth, (req,res) => {
    if (req.ncUser.role !== 'nc_admin')
        return res.status(403).json({ error:'Accès refusé — export réservé aux administrateurs' });
    const { statut, famille, machine, search, from, to, year } = req.query;
    let rows = loadNC().declarations||[];
    if (year)    rows = rows.filter(r=>new Date(r.createdAt||0).getFullYear()===parseInt(year));
    if (statut)  rows = rows.filter(r=>(r.statut||r.status||'ouvert')===statut);
    if (famille) rows = rows.filter(r=>(r.familleProduit||'')===famille);
    if (machine) rows = rows.filter(r=>(r.refProduit||'')===machine);
    if (search)  { const s=search.toLowerCase(); rows=rows.filter(r=>[r.numero,r.nomClient,r.familleProduit,r.refProduit,r.redacteur,r.probleme,r.pilote].join(' ').toLowerCase().includes(s)); }
    if (from)    rows = rows.filter(r=>(r.createdAt||'')>=from);
    if (to)      rows = rows.filter(r=>(r.createdAt||'')<=to+'T23:59:59');

    const SLBL  = { ouvert:'Réceptionné', en_cours:'En traitement', resolu:'En attente validation', clos:'Clos' };
    const fmtDT = iso => iso ? new Date(iso).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
    const fmtD  = iso => iso ? new Date(iso).toLocaleDateString('fr-FR') : '';
    const q     = v  => `"${String(v||'').replace(/"/g,'""')}"`;

    const headers = [
        // ── Identification ──────────────────────────────────────
        'N° NC',
        'Date création',
        'Statut final',
        'Nb transitions',
        // ── Client / Produit ────────────────────────────────────
        'Client',
        'Code postal',
        'Ville',
        'Pays',
        'N° Commande',
        'Famille de produit',
        'Réf. produit',
        'N° série',
        'Version logiciel',
        'Quantité d\'unités',
        // ── Déclaration ─────────────────────────────────────────
        'Rédacteur',
        'Email rédacteur',
        'Date découverte',
        'Problème constaté',
        // ── Traitement ──────────────────────────────────────────
        'Pilote NC',
        'Date 1ère attribution pilote',
        'Délai action prévu',
        'Type d\'action',
        'Traitement / Réparation',
        // ── Clôture — Usage interne Qualité ─────────────────────
        'Type de cause',
        'Coût NC (€)',
        'Commentaire clôture (interne)',
        'Date clôture finale',
        // ── Analyse qualité (v4) ─────────────────────────────────
        'Gravité',
        'Score risque (/9)',
        '5P — Pourquoi 1',
        '5P — Pourquoi 2',
        '5P — Pourquoi 3',
        '5P — Pourquoi 4',
        '5P — Cause racine (P5)',
        'Ishikawa — Matière / Composants',
        'Ishikawa — Méthode / Procédure',
        'Ishikawa — Milieu / Environnement',
        'Ishikawa — Machine / Équipement',
        "Ishikawa — Main d'œuvre",
        'Ishikawa — Management / Processus',
        'Retour client — Date notification',
        'Retour client — Moyen',
        'Retour client — Satisfaction',
        // ── Métriques & Respect échéance ────────────────────────
        'Durée totale (j) création→clôture',
        'Durée traitement (j) en trt.→clôture',
        'Respect échéance',
        'Écart échéance (J±)',
        // ── Historique complet (toutes transitions) ──────────────
        'Historique complet'
    ];

    const lines = rows.map(r => {
        const hist = r.historique || r.history || [];

        // Première occurrence de chaque statut (pour les colonnes KPI)
        const firstByStatut = {};
        hist.forEach(h => { if (!firstByStatut[h.statut]) firstByStatut[h.statut] = h; });

        const statutFinal = SLBL[r.statut||r.status||'ouvert'] || r.statut || '';

        // Écart échéance
        let ecartEcheance = '';
        let echeanceLabel = '';
        if (r.closedAt && r.delaiAction) {
            const closedDay = new Date(r.closedAt); closedDay.setHours(0,0,0,0);
            const delaiDay  = new Date(r.delaiAction); delaiDay.setHours(0,0,0,0);
            const delta = Math.round((closedDay - delaiDay) / 86400000);
            ecartEcheance = delta <= 0 ? `J${delta}` : `J+${delta}`;
            echeanceLabel = delta <= 0 ? 'Oui' : 'Non';
        } else if (r.echeanceRespectee === true)  { echeanceLabel = 'Oui'; }
          else if (r.echeanceRespectee === false) { echeanceLabel = 'Non'; }

        // Historique complet — toutes les transitions dans l'ordre chronologique
        const histLines = hist.map((h, idx) => {
            const label = SLBL[h.statut] || h.statut || '?';
            const dateStr = h.date ? new Date(h.date).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
            const par = h.par ? ` (par ${h.par})` : '';
            const piloteInfo = h.pilote ? ` | Pilote: ${h.pilote}` : '';
            const delaiInfo  = h.delaiAction ? ` | Délai: ${new Date(h.delaiAction).toLocaleDateString('fr-FR')}` : '';
            const comment = h.commentaire ? ` — "${h.commentaire}"` : '';
            return `[${idx+1}] ${dateStr} → ${label}${piloteInfo}${delaiInfo}${comment}${par}`;
        }).join(' || ');

        return [
            // Identification
            r.numero,
            fmtD(r.createdAt),
            statutFinal,
            hist.length,
            // Client / Produit
            q(r.nomClient),
            q(r.cp),
            q(r.ville),
            q(r.pays),
            q(r.noCommande),
            q(r.familleProduit),
            q(r.refProduit),
            q(r.noSerie),
            q(r.versionProg),
            r.quantiteUnites!=null ? r.quantiteUnites : '',
            // Déclaration
            q(r.redacteur),
            q(r.emailRedacteur),
            r.dateDecouverte ? fmtD(r.dateDecouverte) : '',
            q(r.probleme),
            // Traitement
            q(r.pilote),
            fmtDT(firstByStatut['en_cours']?.date),
            r.delaiAction ? fmtD(r.delaiAction) : '',
            q(r.typeAction),
            q(r.reparation),
            // Clôture interne
            q(r.typeCause),
            r.cout != null && r.cout !== '' ? String(parseFloat(r.cout).toFixed(2)).replace('.',',') : '',
            q(r.commentaireCloture),
            r.closedAt ? fmtD(r.closedAt) : (firstByStatut['clos']?.date ? fmtD(firstByStatut['clos'].date) : ''),
            // Analyse qualité (v4)
            r.gravite||'',
            r.scoreRisque!=null ? r.scoreRisque : '',
            q((r.cinqPourquoi||{}).p1||''),
            q((r.cinqPourquoi||{}).p2||''),
            q((r.cinqPourquoi||{}).p3||''),
            q((r.cinqPourquoi||{}).p4||''),
            q((r.cinqPourquoi||{}).p5||r.causeRacine||''),
            q((r.ishikawa||{}).materiau||''),
            q((r.ishikawa||{}).methode||''),
            q((r.ishikawa||{}).milieu||''),
            q((r.ishikawa||{}).machine||''),
            q((r.ishikawa||{}).maindoeuvre||''),
            q((r.ishikawa||{}).management||''),
            (r.retourClient||{}).dateNotification ? fmtD((r.retourClient||{}).dateNotification) : '',
            q((r.retourClient||{}).moyen||''),
            q((r.retourClient||{}).satisfaction||''),
            // Métriques
            r.dureeTotal      != null ? r.dureeTotal      : '',
            r.dureeTraitement != null ? r.dureeTraitement : '',
            echeanceLabel,
            ecartEcheance,
            // Historique complet
            q(histLines)
        ].join(';');
    });

    res.setHeader('Content-Type', 'text/csv;charset=utf-8');
    const csvFilename = year ? `nc-${year}.csv` : 'non-conformites.csv';
    res.setHeader('Content-Disposition', `attachment;filename=${csvFilename}`);
    res.send('\uFEFF' + headers.join(';') + '\r\n' + lines.join('\r\n'));
});

// ══════════════════════════════════════════════════════════════
//  IMPRESSION / PDF
// ══════════════════════════════════════════════════════════════

function imgBase64(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const ext = path.extname(filePath).slice(1).toLowerCase();
        if (!['jpg','jpeg','png','gif','webp'].includes(ext)) return null;
        const mime = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp'}[ext];
        return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
    } catch { return null; }
}
function eh(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function pd(iso){ return iso?new Date(iso).toLocaleDateString('fr-FR'):'—'; }
function pdt(iso){ return iso?new Date(iso).toLocaleString('fr-FR'):'—'; }

const PRINT_CSS = `
@page{size:A4;margin:12mm 12mm 16mm 12mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#1a1a1a;background:#fff}
.no-print{background:#2c3e50;padding:10px 20px;display:flex;gap:10px;align-items:center;position:sticky;top:0;z-index:100}
.no-print button{padding:7px 18px;border:none;border-radius:5px;cursor:pointer;font-size:10pt;font-weight:600}
.btn-p{background:#27ae60;color:#fff}.btn-c{background:#888;color:#fff}
@media print{.no-print{display:none}body{font-size:9.5pt}}
.nc-page{padding:8px 10px}
.pheader{display:flex;align-items:flex-start;justify-content:space-between;padding:8px 0 7px;border-bottom:2.5px solid #2c3e50;margin-bottom:10px}
.pheader h1{font-size:15pt;font-weight:800;color:#2c3e50}
.sbadge{display:inline-block;padding:4px 13px;border-radius:12px;font-weight:700;font-size:10pt;color:#fff}
.psec{margin-bottom:11px;break-inside:avoid}
.psec-title{font-size:8.5pt;font-weight:800;color:#2c3e50;text-transform:uppercase;letter-spacing:.8px;border-bottom:1.5px solid #2c3e50;padding-bottom:3px;margin-bottom:7px}
.fgrid{display:grid;grid-template-columns:1fr 1fr;gap:3px 20px}
.pf{display:flex;gap:6px;padding:2px 0;align-items:baseline}
.pl{font-size:8pt;color:#777;white-space:nowrap;min-width:95px}
.pv{font-size:9.5pt;font-weight:600;color:#222}
.ptext{font-size:9.5pt;color:#333;white-space:pre-wrap;background:#fafafa;border:1px solid #eee;border-radius:4px;padding:7px 9px;line-height:1.5}
.tl-table{width:100%;border-collapse:collapse}
.tl-dot{width:10px;height:10px;border-radius:50%;margin-top:3px}
.tl-cell{padding:5px 0;border-bottom:1px solid #f2f2f2;vertical-align:top}
.act-table{width:100%;border-collapse:collapse;font-size:9pt}
.act-table th{padding:5px 8px;border:1px solid #ddd;background:#f5f5f5;text-align:left;font-weight:700}
.act-table td{padding:5px 8px;border:1px solid #ddd}
.page-break{page-break-after:always}
.qual-box{border:1.5px solid #c9a8e8;border-radius:6px;padding:10px 14px;background:#faf7ff}
`;

const SLP={ouvert:'Réceptionné',en_cours:'En traitement',resolu:'En attente validation',clos:'Clos',non_pertinent:'Non pertinent'};
const ALP={ouvert:'Ouvert',en_cours:'En cours','cloturé':'Clôturé',en_attente:'Ouvert',termine:'Clôturé'};
const TLP={immediate:'Immédiate',curative:'Curative',corrective:'Corrective',preventive:'Préventive'};
const SC={ouvert:'#e67e22',en_cours:'#2980b9',resolu:'#d4ac0d',clos:'#27ae60',non_pertinent:'#95a5a6'};
const AC={'ouvert':'#e67e22','en_cours':'#2980b9','cloturé':'#27ae60','en_attente':'#e67e22','termine':'#27ae60'};

function mediasBlock(files, baseDir) {
    if (!files||!files.length) return '';
    const items = files.map(f=>{
        const ext=(f.fileId||f.name||'').split('.').pop().toLowerCase();
        if(['jpg','jpeg','png','gif','webp'].includes(ext)){
            const b64=imgBase64(path.join(baseDir,f.fileId));
            if(b64) return `<div style="display:inline-block;margin:4px;vertical-align:top;text-align:center">
              <img src="${b64}" style="max-width:175px;max-height:175px;border:1px solid #ddd;border-radius:4px;object-fit:cover;display:block">
              <div style="font-size:7.5pt;color:#888;margin-top:2px;max-width:175px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${eh(f.name)}</div>
            </div>`;
        }
        const extU=ext.toUpperCase().substring(0,4);
        const bg=ext==='pdf'?'#e74c3c':['doc','docx'].includes(ext)?'#2980b9':'#7f8c8d';
        return `<div style="display:inline-flex;align-items:center;gap:6px;margin:4px;padding:6px 10px;background:#f8f8f8;border:1px solid #ddd;border-radius:4px;vertical-align:middle">
          <span style="background:${bg};color:#fff;font-size:8pt;font-weight:700;padding:2px 6px;border-radius:3px">${extU}</span>
          <span style="font-size:9pt;color:#333">${eh(f.name)}</span>
        </div>`;
    }).join('');
    return `<div style="margin-top:6px">${items}</div>`;
}

function tlRow(col, icon, label, date, sub){
    return `<tr>
      <td style="width:16px;padding:5px 7px 5px 0;vertical-align:top"><div class="tl-dot" style="background:${col}"></div></td>
      <td class="tl-cell">
        <span style="font-weight:700;color:${col}">${icon} ${label}</span>
        <span style="color:#999;font-size:8.5pt"> — ${pdt(date)}</span>
        ${sub?`<div style="margin-top:3px;font-size:9pt;color:#555">${sub}</div>`:''}
      </td>
    </tr>`;
}

function ncBodyHtml(nc, showQualite){
    const s=nc.statut||'ouvert';
    const sC=SC[s]||'#888';

    // Timeline unifiée
    const tl=[];
    (nc.historique||[]).forEach(h=>tl.push({_t:'statut',date:h.date,statut:h.statut,par:h.par,commentaire:h.commentaire}));
    (nc.reponsesPilote||[]).forEach(r=>tl.push({_t:'rep_leg',date:r.date,par:r.par,reponse:r.reponse}));
    (nc.actions||[]).forEach(a=>{
        tl.push({_t:'act_create',date:a.createdAt,a});
        (a.historiqueStatut||[]).slice(1).forEach(h=>tl.push({_t:'act_stat',date:h.date,a,statut:h.statut,par:h.par,commentaire:h.commentaire}));
        (a.reponsesActions||[]).forEach(r=>tl.push({_t:'act_rep',date:r.date,a,par:r.par,reponse:r.reponse,fichiers:r.fichiers}));
        (a.relances||[]).forEach(r=>tl.push({_t:'act_relance',date:r.date||r.sentAt,a,par:r.par||r.sentBy,commentaire:r.commentaire||r.message}));
    });
    tl.sort((x,y)=>new Date(x.date||0)-new Date(y.date||0));

    const tlHtml=tl.map(ev=>{
        if(ev._t==='statut'){
            const c=SC[ev.statut]||'#888';
            return tlRow(c,'●',SLP[ev.statut]||ev.statut,ev.date,
                [ev.par?`par ${eh(ev.par)}`:'',ev.commentaire?eh(ev.commentaire):''].filter(Boolean).join(' — '));
        }
        if(ev._t==='rep_leg') return tlRow('#1e8449','💬',`Réponse — ${eh(ev.par||'?')}`,ev.date,ev.reponse?eh(ev.reponse):'');
        if(ev._t==='act_create'){
            const a=ev.a;
            return tlRow(AC[a.statut]||'#888','►',`Action ${eh(TLP[a.type]||a.type)} — Pilote : ${eh(a.pilote)}`,ev.date,
                [a.commentaireAction?eh(a.commentaireAction):'',a.echeance?`Échéance : ${pd(a.echeance)}`:''].filter(Boolean).join(' — '));
        }
        if(ev._t==='act_stat'){
            const a=ev.a;
            return tlRow(AC[ev.statut]||'#888','▸',`[${eh(a.pilote)}] → ${eh(ALP[ev.statut]||ev.statut)}`,ev.date,
                [ev.par?`par ${eh(ev.par)}`:'',ev.commentaire?eh(ev.commentaire):''].filter(Boolean).join(' — '));
        }
        if(ev._t==='act_rep'){
            const a=ev.a;
            const aDir=path.join(NC_MEDIA,nc.numero,'actions',a.id);
            return tlRow('#1e8449','💬',`Réponse — ${eh(ev.par||'?')}`,ev.date,
                `${ev.reponse?eh(ev.reponse):''}${mediasBlock(ev.fichiers||[],aDir)}`);
        }
        if(ev._t==='act_relance'){
            const a=ev.a;
            return tlRow('#e67e22','📢',`Relance — ${eh(a.pilote)}`,ev.date,
                [ev.par?`par ${eh(ev.par)}`:'',ev.commentaire?eh(ev.commentaire):''].filter(Boolean).join(' — '));
        }
        return '';
    }).join('');

    // Table actions
    const actions=nc.actions||[];
    const actTableHtml=actions.length?`
    <div class="psec">
      <div class="psec-title">Suivi des actions</div>
      <table class="act-table">
        <thead><tr><th>Type</th><th>Pilote</th><th>Échéance</th><th>Statut</th><th>Respect</th></tr></thead>
        <tbody>${actions.map(a=>{
            const lbl=ALP[a.statut]||a.statut;
            const closed=a.statut==='cloturé'||a.statut==='termine';
            let echeRes='—';
            if(a.echeance&&closed) echeRes=a.echeanceRespectee===true?'✓ Respectée':a.echeanceRespectee===false?'✗ Dépassée':'—';
            else if(a.echeance&&!closed){const diff=Math.round((new Date(a.echeance)-new Date())/86400000);echeRes=diff>=0?`J+${diff}`:`J${diff}`;}
            return `<tr><td>${eh(TLP[a.type]||a.type)}</td><td>${eh(a.pilote)}</td><td>${pd(a.echeance)}</td>
              <td style="color:${AC[a.statut]||'#888'};font-weight:700">${lbl}</td><td>${echeRes}</td></tr>`;
        }).join('')}</tbody>
      </table>
    </div>`:'';

    const pf=(l,v)=>v?`<div class="pf"><span class="pl">${l}</span><span class="pv">${eh(v)}</span></div>`:'';

    return `<div class="nc-page">
  <div class="pheader">
    <div>
      <div style="font-size:7.5pt;font-weight:700;color:#999;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Muller Automotive — Non-Conformité</div>
      <h1>${eh(nc.numero)}</h1>
      <div style="font-size:9pt;color:#666;margin-top:3px">${pdt(nc.createdAt)}</div>
    </div>
    <div style="text-align:right">
      <div class="sbadge" style="background:${sC}">${SLP[s]||s}</div>
      ${nc.closedAt?`<div style="font-size:8pt;color:#888;margin-top:5px">Clôturée le ${pd(nc.closedAt)}</div>`:''}
      ${nc.familleProduit?`<div style="font-size:9pt;font-weight:600;margin-top:5px;color:#555">${eh(nc.familleProduit)}</div>`:''}
    </div>
  </div>

  <div class="psec"><div class="psec-title">Identification</div>
    <div class="fgrid">
      ${pf('Rédacteur',nc.redacteur)}${pf('Email',nc.emailRedacteur)}
      ${pf('Périmètre',nc.perimetre)}${pf('Source détection',nc.sourceDetection)}
      ${pf('Date découverte',pd(nc.dateDecouverte))}
    </div>
  </div>

  <div class="psec"><div class="psec-title">Client</div>
    <div class="fgrid">
      ${pf('Code SAP',nc.sapCode)}${pf('Nom client',nc.nomClient)}
      ${pf('CP',nc.cp)}${pf('Ville',nc.ville)}${pf('Pays',nc.pays)}
    </div>
  </div>

  <div class="psec"><div class="psec-title">Produit / Machine</div>
    <div class="fgrid">
      ${pf('Référence',nc.refProduit)}${pf('N° série',nc.noSerie)}
      ${pf('Version programme',nc.versionProg)}${pf('N° commande',nc.noCommande)}
      ${pf('Famille produit',nc.familleProduit)}
    </div>
  </div>

  <div class="psec"><div class="psec-title">Problème déclaré</div>
    ${nc.probleme?`<div class="ptext">${eh(nc.probleme)}</div>`:'<em style="color:#bbb;font-size:9pt">Non renseigné</em>'}
    ${mediasBlock(nc.mediaFiles||[],path.join(NC_MEDIA,nc.numero))}
  </div>

  ${(nc.reparation||nc.suggestion||(nc.mediaFilesTraitement||[]).length)?`
  <div class="psec"><div class="psec-title">Traitement déclarant</div>
    ${pf('Réparation',nc.reparation)}${pf('Suggestion',nc.suggestion)}
    ${mediasBlock(nc.mediaFilesTraitement||[],path.join(NC_MEDIA,nc.numero))}
  </div>`:''}

  ${actTableHtml}

  <div class="psec"><div class="psec-title">Fil de discussion</div>
    <table class="tl-table">
      <tbody>
        ${tlRow('#2c3e50','●','Déclaration créée',nc.createdAt,nc.redacteur?`par ${eh(nc.redacteur)}`:'')}
        ${tlHtml}
      </tbody>
    </table>
  </div>

  ${showQualite&&(nc.typeCause||nc.cout!=null&&nc.cout!==''||nc.commentaireCloture||nc.gravite||nc.scoreRisque!=null||nc.processus)?`
  <div class="psec qual-box">
    <div class="psec-title" style="color:#7d3c98;border-color:#c9a8e8">Usage interne Qualité</div>
    <div class="fgrid">
      ${pf('Type de cause',nc.typeCause)}
      ${nc.cout!=null&&nc.cout!==''?`<div class="pf"><span class="pl">Coût NC</span><span class="pv">${eh(String(nc.cout))} €</span></div>`:''}
      ${nc.gravite?`<div class="pf"><span class="pl">Gravité</span><span class="pv" style="color:${nc.gravite==='critique'?'#c0392b':nc.gravite==='majeure'?'#d35400':'#27ae60'};text-transform:uppercase;font-weight:800">${eh(nc.gravite)}</span></div>`:''}
      ${nc.scoreRisque!=null?`<div class="pf"><span class="pl">Score risque</span><span class="pv" style="color:${nc.scoreRisque>6?'#c0392b':nc.scoreRisque>3?'#d35400':'#27ae60'}">${nc.scoreRisque}/9 — ${nc.scoreRisque>6?'Élevé':nc.scoreRisque>3?'Modéré':'Faible'}</span></div>`:''}
      ${nc.processus?`<div class="pf" style="grid-column:1/-1"><span class="pl">Processus ISO concerné</span><span class="pv">${eh(nc.processus)}</span></div>`:''}
    </div>
    ${nc.commentaireCloture?`<div style="margin-top:7px"><div class="pl" style="margin-bottom:3px">Commentaire qualité</div><div class="ptext">${eh(nc.commentaireCloture)}</div></div>`:''}
  </div>`:''}

  ${showQualite&&nc.cinqPourquoi&&Object.values(nc.cinqPourquoi).some(v=>v)?`
  <div class="psec" style="break-inside:avoid">
    <div class="psec-title" style="color:#1a6fa0;border-color:#2980b9">Analyse 5 Pourquoi</div>
    <table style="width:100%;border-collapse:collapse;font-size:9pt">
      ${[['p1','Pourquoi 1'],['p2','Pourquoi 2'],['p3','Pourquoi 3'],['p4','Pourquoi 4'],['p5','Cause racine (P5)']].filter(([k])=>(nc.cinqPourquoi||{})[k]).map(([k,lbl],i)=>`
      <tr style="${i%2===0?'background:#f8f9fa':''}">
        <td style="padding:5px 8px;font-weight:700;color:${k==='p5'?'#c0392b':'#1a6fa0'};width:130px;border-bottom:1px solid #eee">${lbl}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee">${eh((nc.cinqPourquoi||{})[k])}</td>
      </tr>`).join('')}
    </table>
  </div>`:''}

  ${showQualite&&nc.ishikawa&&Object.values(nc.ishikawa).some(v=>v)?`
  <div class="psec" style="break-inside:avoid">
    <div class="psec-title" style="color:#6f42c1;border-color:#c9a8e8">Diagramme Ishikawa — 6M</div>
    <table style="width:100%;border-collapse:collapse;font-size:9pt">
      ${[['materiau','🔩 Matière / Composants'],['methode','📋 Méthode / Procédure'],['milieu','🌡 Milieu / Environnement'],['machine','⚙ Machine / Équipement'],['maindoeuvre',"👤 Main d'œuvre"],['management','📊 Management']].filter(([k])=>(nc.ishikawa||{})[k]).map(([k,lbl],i)=>`
      <tr style="${i%2===0?'background:#faf7ff':''}">
        <td style="padding:5px 8px;font-weight:700;color:#6f42c1;width:165px;border-bottom:1px solid #ede7f6">${lbl}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #ede7f6">${eh((nc.ishikawa||{})[k])}</td>
      </tr>`).join('')}
    </table>
  </div>`:''}

  ${showQualite&&nc.retourClient&&(nc.retourClient.satisfaction||nc.retourClient.dateNotification||nc.retourClient.message)?`
  <div class="psec" style="break-inside:avoid">
    <div class="psec-title" style="color:#0d47a1;border-color:#2196f3">Retour client</div>
    <div class="fgrid">
      ${nc.retourClient.satisfaction?`<div class="pf"><span class="pl">Satisfaction</span><span class="pv" style="color:${nc.retourClient.satisfaction==='OK'?'#27ae60':nc.retourClient.satisfaction==='Contesté'?'#c0392b':'#e67e22'}">${eh(nc.retourClient.satisfaction)}</span></div>`:''}
      ${nc.retourClient.dateNotification?`<div class="pf"><span class="pl">Notifié le</span><span class="pv">${pd(nc.retourClient.dateNotification)}</span></div>`:''}
      ${nc.retourClient.moyen?`<div class="pf"><span class="pl">Moyen</span><span class="pv">${eh(nc.retourClient.moyen)}</span></div>`:''}
    </div>
    ${nc.retourClient.message?`<div style="margin-top:6px"><div class="pl" style="margin-bottom:3px">Message transmis</div><div class="ptext">${eh(nc.retourClient.message)}</div></div>`:''}
  </div>`:''}

</div>`;
}

function requirePrintToken(req,res){
    const token=req.query.token||(req.headers.authorization||'').replace('Bearer ','').trim();
    if(!token){res.status(401).send('<h2>Non authentifié</h2>');return null;}
    try{
        const p=jwt.verify(token,JWT_SECRET);
        if(p.scope!=='nc'){res.status(401).send('<h2>Token invalide</h2>');return null;}
        return p;
    }catch{res.status(401).send('<h2>Token invalide ou expiré</h2>');return null;}
}

// GET /api/nc/:numero/print — fiche NC imprimable (HTML→PDF via navigateur)
app.get('/api/nc/:numero/print',(req,res)=>{
    const user=requirePrintToken(req,res); if(!user)return;
    const nc=(loadNC().declarations||[]).find(d=>d.numero===req.params.numero);
    if(!nc)return res.status(404).send('<h2>NC non trouvée</h2>');
    const body=ncBodyHtml(nc,user.role==='nc_admin');
    res.setHeader('Content-Type','text/html;charset=utf-8');
    res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>NC ${eh(nc.numero)}</title><style>${PRINT_CSS}</style></head>
<body>
<div class="no-print">
  <button class="btn-p" onclick="window.print()">🖨 Imprimer / Sauvegarder PDF</button>
  <button class="btn-c" onclick="window.close()">✕ Fermer</button>
  <span style="color:#aaa;font-size:8.5pt;margin-left:12px">Choisir "Enregistrer en PDF" dans la boîte d'impression du navigateur</span>
</div>
${body}
</body></html>`);
});

// GET /api/nc/export/print-all — archive toutes NC en une page imprimable (admin)
app.get('/api/nc/export/print-all',(req,res)=>{
    const user=requirePrintToken(req,res); if(!user)return;
    if(user.role!=='nc_admin')return res.status(403).send('<h2>Accès refusé — admin uniquement</h2>');
    const ncs=(loadNC().declarations||[]);
    const pages=ncs.map((nc,i)=>{
        const body=ncBodyHtml(nc,true);
        return i<ncs.length-1?`<div class="page-break">${body}</div>`:body;
    }).join('');
    res.setHeader('Content-Type','text/html;charset=utf-8');
    res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Archive NC — Muller Automotive</title><style>${PRINT_CSS}</style></head>
<body>
<div class="no-print">
  <button class="btn-p" onclick="window.print()">🖨 Imprimer tout — ${ncs.length} NC</button>
  <button class="btn-c" onclick="window.close()">✕ Fermer</button>
  <span style="color:#aaa;font-size:8.5pt;margin-left:12px">Archive complète ${ncs.length} NC — Muller Automotive</span>
</div>
${pages}
</body></html>`);
});

// ══════════════════════════════════════════════════════════════
//  NC PARENT-SATELLITES — PERSISTENCE + EMAIL
// ══════════════════════════════════════════════════════════════

function loadNCParent() {
    try { if (fs.existsSync(NC_PARENT_FILE)) return JSON.parse(fs.readFileSync(NC_PARENT_FILE,'utf8')); }
    catch(e) { console.error('nc-parent-groups.json:', e.message); }
    return { groups: [], notifications: [], journal: [] };
}
function saveNCParent(d) { atomicWriteSync(NC_PARENT_FILE, JSON.stringify(d, null, 2)); }

// Migration nc-parent-groups.json → nc-data.json (exécutée au démarrage une seule fois)
function migrateParentGroups() {
    try {
        const pgData = loadNCParent();
        if (!pgData.groups?.length) return;
        const ncData = loadNC();
        const existingIds = new Set((ncData.declarations||[]).filter(d=>d.is_parent).map(d=>d.numero));
        let migrated = 0;
        for (const g of pgData.groups) {
            if (existingIds.has(g.id)) continue;
            const parentNC = {
                numero: g.id, is_parent: true, satellites: g.satellites||[],
                createdAt: g.groupe_created_at||new Date().toISOString(),
                statut: g.statut==='close'?'clos': g.statut==='en_traitement'?'en_cours':'ouvert',
                redacteur: g.groupe_created_by||'Admin', emailRedacteur: g.pilote_email||'',
                gravite: g.gravite||'mineure',
                perimetre: (g.groupe_perimetre||[]).join(', ')||'',
                processus: '', familleProduit: '',
                groupe_label: g.groupe_label||'', groupe_motif: g.groupe_motif||'',
                groupe_created_at: g.groupe_created_at||new Date().toISOString(),
                groupe_created_by: g.groupe_created_by||'Admin',
                probleme: g.groupe_motif||g.groupe_label||'',
                actions: (g.actions||[]).map(a=>({...a})), discussion: [],
                historique: [{ date:g.groupe_created_at||new Date().toISOString(), statut:'en_traitement', commentaire:`NC Parent migrée — groupe ${g.id}`, par:g.groupe_created_by||'Admin' }],
                analyse_5p: g.analyse_5p||null, ishikawa: g.ishikawa||null,
                pilote_email: g.pilote_email||'', pilote_nom: g.pilote_nom||''
            };
            if (g.statut==='close') { parentNC.closedAt=g.clos_le||''; parentNC.preuve_efficacite=g.preuve_efficacite||''; }
            for (const satId of (g.satellites||[])) {
                const sat = (ncData.declarations||[]).find(d=>d.numero===satId);
                if (sat) { sat.is_satellite=true; sat.parent_id=g.id; sat.parent_label=g.groupe_label||''; }
            }
            ncData.declarations.unshift(parentNC);
            migrated++;
        }
        if (migrated>0) {
            if (!ncData.parentCounter) ncData.parentCounter=0;
            saveNC(ncData);
            console.log(`[Migration] ${migrated} groupe(s) NC parent migrés vers nc-data.json`);
        }
    } catch(e) { console.error('[migrateParentGroups]', e.message); }
}

// POST /api/nc/parent-groups/:groupId/action/:actionId/reponse-pilote
// Permet au chef produit (pilote assigné) de répondre à une CAPA du groupe parent depuis la fiche satellite
app.post('/api/nc/parent-groups/:groupId/action/:actionId/reponse-pilote', requireNCAuth, async (req, res) => {
  try {
    if (!['nc_admin','nc_chef_produit'].includes(req.ncUser.role))
        return res.status(403).json({ error:'Accès refusé' });
    const { reponse, mediaFiles } = req.body || {};
    if (!reponse?.trim() && !(mediaFiles?.length))
        return res.status(400).json({ error:'Réponse ou fichier requis' });

    const d = loadNCParent();
    const grp = (d.groups||[]).find(g => g.id === req.params.groupId);
    if (!grp) return res.status(404).json({ error:'Groupe non trouvé' });
    const action = (grp.actions||[]).find(a => a.id === req.params.actionId);
    if (!action) return res.status(404).json({ error:'Action non trouvée dans le groupe' });

    // ISO §5.3 — le chef produit ne peut répondre qu'à ses propres actions
    if (req.ncUser.role !== 'nc_admin') {
        const resp = (action.pilote_email || action.pilote || '').toLowerCase();
        const user = (req.ncUser.email || req.ncUser.name || '').toLowerCase();
        if (resp !== user) return res.status(403).json({ error:'Cette action ne vous est pas assignée (ISO §5.3)' });
    }

    // Médias attachés
    const actionDir = path.join(NC_MEDIA, grp.id, 'actions', action.id);
    fs.mkdirSync(actionDir, { recursive: true });
    const savedFiles = [];
    for (const f of (mediaFiles||[])) {
        const src = path.join(NC_MEDIA, 'temp', f.fileId);
        if (fs.existsSync(src)) {
            const dst = path.join(actionDir, f.fileId);
            fs.renameSync(src, dst);
            savedFiles.push({ fileId:f.fileId, name:f.originalName||f.fileId,
                url:`/NC/media/${grp.id}/actions/${action.id}/${f.fileId}` });
        }
    }

    const now = new Date().toISOString();
    const isForceAdminGrp  = req.ncUser.role === 'nc_admin' && req.body.force === true;
    const isAdminRetourGrp = req.ncUser.role === 'nc_admin' && !isForceAdminGrp;
    if (!action.reponsesActions) action.reponsesActions = [];
    action.reponsesActions.push({
        date: now, par: req.ncUser.name||req.ncUser.user,
        reponse: (reponse||'').trim(),
        type: isAdminRetourGrp ? 'retour_admin' : (isForceAdminGrp ? 'reponse_admin' : 'reponse_pilote'),
        fichiers: savedFiles
    });
    if (isForceAdminGrp && ['ouvert','en_attente'].includes(action.statut)) action.statut = 'en_cours';
    if (!isAdminRetourGrp && !isForceAdminGrp && action.statut === 'ouvert') action.statut = 'en_cours';

    // Journal ISO §10.2.2
    if (!d.journal) d.journal = [];
    d.journal.unshift({ action:'CAPA_REPONSE', parent_id:grp.id,
        action_id:action.id, by:req.ncUser.name||req.ncUser.user, timestamp:now });

    saveNCParent(d);
    res.json({ ok:true, action });
  } catch(err) {
    console.error('[parent-group/reponse-pilote]', err.message);
    res.status(500).json({ error:'Erreur serveur : '+err.message });
  }
});

// PUT /api/nc/parent-groups — sauvegarder tout l'état (admin + chef produit)
app.put('/api/nc/parent-groups', requireNCAuth, (req, res) => {
    const { groups, notifications, journal } = req.body || {};
    if (!Array.isArray(groups)) return res.status(400).json({ error: 'groups[] requis' });
    saveNCParent({ groups: groups || [], notifications: notifications || [], journal: journal || [] });
    res.json({ ok: true, saved: (groups||[]).length });
});

// POST /api/nc/parent-groups/notify-email — envoi email réel au pilote
app.post('/api/nc/parent-groups/notify-email', requireNCAuth, async (req, res) => {
    if (req.ncUser.role !== 'nc_admin') return res.status(403).json({ error: 'Admin uniquement' });
    const { to_email, to_nom, groupe_id, groupe_label, type, message } = req.body || {};
    if (!to_email || !message) return res.status(400).json({ error: 'to_email et message requis' });

    const TYPE_SUBJ = {
        AFFECTATION: 'Affectation — pilote NC parent',
        CAPA_ASSIGNEE: 'Nouvelle action CAPA assignée',
        RELANCE: 'Relance — action requise',
        MESSAGE: 'Message du responsable qualité',
        GROUPE_CLOS: 'Groupe NC parent clôturé',
        RATTACHEMENT: 'NC rattachée à un groupe parent',
        CLOTURE: 'Clôture de votre NC via groupe parent'
    };
    const sujet = `[NC Muller] ${TYPE_SUBJ[type] || type} — ${groupe_id || ''}`;
    const gravBg = { critique: '#c0392b', majeure: '#e67e22', mineure: '#27ae60' };

    try {
        const tr = nodemailer.createTransport({ host: EMAIL_CFG.host, port: EMAIL_CFG.port, secure: EMAIL_CFG.secure, auth: { user: EMAIL_CFG.user, pass: EMAIL_CFG.pass } });
        await tr.sendMail({
            from: EMAIL_CFG.from,
            to:   to_email,
            cc:   ncMailTo(),
            subject: sujet,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #dee2e6;border-radius:8px;overflow:hidden">
              <div style="background:#0c447c;padding:18px 24px">
                <h2 style="color:#fff;margin:0;font-size:1rem">🔗 NC Parent-Satellites — ${TYPE_SUBJ[type]||type}</h2>
                <p style="color:#b8d9f0;margin:5px 0 0;font-size:0.82rem">${groupe_id} — ${groupe_label||''}</p>
              </div>
              <div style="padding:22px 24px">
                <p style="font-size:0.9rem;margin-bottom:8px">Bonjour <strong>${to_nom||to_email}</strong>,</p>
                <div style="background:#f4f8fd;border-left:4px solid #0c447c;padding:12px 16px;border-radius:4px;font-size:0.88rem;line-height:1.6">${message.replace(/\n/g,'<br>')}</div>
                <p style="margin-top:16px;font-size:0.82rem;color:#888">Accès console : <a href="https://formation-sav.fr/NC/console.html" style="color:#0c447c">formation-sav.fr/NC/console.html</a> → onglet <strong>NC Parents</strong></p>
              </div>
              <div style="background:#f8f9fa;padding:10px 24px;font-size:0.72rem;color:#aaa;text-align:center">
                Notification automatique — Muller Automotive · Service Qualité NC
              </div>
            </div>`
        });
        console.log(`[NC Parent email] → ${to_email} | ${type} | ${groupe_id}`);
        res.json({ ok: true });
    } catch (err) {
        console.error('[NC Parent email]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── Démarrage ──────────────────────────────────────────────────
// ── Nettoyage automatique des fichiers temp NC ───────────────────────────────
const TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 heures

function cleanTempNC() {
    const tempDir = path.join(NC_MEDIA, 'temp');
    if (!fs.existsSync(tempDir)) return;
    const now = Date.now();
    let deleted = 0;
    try {
        for (const file of fs.readdirSync(tempDir)) {
            const filePath = path.join(tempDir, file);
            try {
                const { mtimeMs } = fs.statSync(filePath);
                if (now - mtimeMs > TEMP_MAX_AGE_MS) {
                    fs.unlinkSync(filePath);
                    deleted++;
                }
            } catch {}
        }
        if (deleted > 0) console.log(`[NC temp] ${deleted} fichier(s) temporaire(s) supprimé(s) (> 24h)`);
    } catch(e) {
        console.error('[NC temp] Erreur nettoyage :', e.message);
    }
}

app.listen(PORT, () => {
    console.log('');
    console.log('✅  API Muller Automotive démarrée');
    console.log(`    → http://localhost:${PORT}/api/health`);
    console.log('');
    console.log('   Identifiants par défaut :');
    console.log('   Utilisateur : admin');
    console.log('   Mot de passe : muller2026');
    console.log('');
    console.log('   ⚠️  Changez JWT_SECRET en production !');
    console.log('');
    // Migration groupes NC parent → nc-data.json (une seule fois)
    migrateParentGroups();
    // Nettoyage immédiat au démarrage puis toutes les heures
    cleanTempNC();
    setInterval(cleanTempNC, 60 * 60 * 1000);
});
