/**
 * ============================================================
 *  MIGRATE.JS — Migration JSON → PostgreSQL
 *  NC Muller Automotive
 *
 *  Usage :
 *    node migrate.js [--dry-run]   (--dry-run = lecture seule, aucune écriture)
 *
 *  Pré-requis :
 *    1. PostgreSQL installé et démarré
 *    2. Base créée : createdb nc_muller
 *    3. Schéma appliqué : psql -d nc_muller -f schema_postgresql.sql
 *    4. npm install pg (déjà dans package.json après ajout)
 *
 *  Variables d'environnement :
 *    PG_HOST     (défaut: localhost)
 *    PG_PORT     (défaut: 5432)
 *    PG_USER     (défaut: postgres)
 *    PG_PASSWORD (obligatoire)
 *    PG_DB       (défaut: nc_muller)
 * ============================================================
 */

'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');

// ── Fichiers source ───────────────────────────────────────────
const NC_FILE      = path.join(__dirname, 'nc-data.json');
const NC_USERS     = path.join(__dirname, 'nc-users.json');
const APP_USERS    = path.join(__dirname, 'users.json');
const NC_PARENT    = path.join(__dirname, 'nc-parent-groups.json');

// ── Connexion PostgreSQL ──────────────────────────────────────
const pool = new Pool({
    host:     process.env.PG_HOST     || 'localhost',
    port:     parseInt(process.env.PG_PORT || '5432'),
    user:     process.env.PG_USER     || 'postgres',
    password: process.env.PG_PASSWORD || '',
    database: process.env.PG_DB       || 'nc_muller',
});

// ── Compteurs ─────────────────────────────────────────────────
const stats = {
    nc_fiches:               { tentees: 0, inserees: 0, erreurs: 0 },
    nc_historique:           { tentees: 0, inserees: 0, erreurs: 0 },
    nc_actions:              { tentees: 0, inserees: 0, erreurs: 0 },
    nc_action_reponses:      { tentees: 0, inserees: 0, erreurs: 0 },
    nc_action_relances:      { tentees: 0, inserees: 0, erreurs: 0 },
    nc_action_historique:    { tentees: 0, inserees: 0, erreurs: 0 },
    nc_discussion:           { tentees: 0, inserees: 0, erreurs: 0 },
    nc_parent_journal:       { tentees: 0, inserees: 0, erreurs: 0 },
    nc_compteurs:            { tentees: 0, inserees: 0, erreurs: 0 },
    nc_users:                { tentees: 0, inserees: 0, erreurs: 0 },
    app_users:               { tentees: 0, inserees: 0, erreurs: 0 },
};

function log(msg)  { console.log(`[migrate] ${msg}`); }
function warn(msg) { console.warn(`[migrate] ⚠  ${msg}`); }
function err(msg)  { console.error(`[migrate] ✗  ${msg}`); }

function safeDate(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
}
function safeFloat(v) {
    if (v === null || v === undefined || v === '') return null;
    const f = parseFloat(v);
    return isNaN(f) ? null : f;
}
function safeInt(v) {
    if (v === null || v === undefined || v === '') return null;
    const i = parseInt(v);
    return isNaN(i) ? null : i;
}
function safeBool(v) {
    if (v === null || v === undefined) return false;
    return Boolean(v);
}

// ── Exécution SQL avec dry-run ────────────────────────────────
async function exec(client, sql, params, table) {
    stats[table].tentees++;
    if (DRY_RUN) { stats[table].inserees++; return; }
    try {
        await client.query(sql, params);
        stats[table].inserees++;
    } catch (e) {
        stats[table].erreurs++;
        err(`${table} — ${e.message.split('\n')[0]}`);
    }
}

// ════════════════════════════════════════════════════════════
//  1. UTILISATEURS NC
// ════════════════════════════════════════════════════════════
async function migrateNCUsers(client) {
    log('Migration nc_users…');
    const users = JSON.parse(fs.readFileSync(NC_USERS, 'utf8'));
    for (const u of users) {
        await exec(client, `
            INSERT INTO nc_users (user_login, pass_hash, role, name, email, created_at, last_login)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (user_login) DO UPDATE SET
                pass_hash  = EXCLUDED.pass_hash,
                role       = EXCLUDED.role,
                name       = EXCLUDED.name,
                email      = EXCLUDED.email,
                last_login = EXCLUDED.last_login
        `, [
            u.user,
            u.passHash,
            ['nc_admin','nc_chef_produit','nc_lecteur','nc_viewer'].includes(u.role) ? u.role : 'nc_lecteur',
            u.name || u.user,
            u.email || null,
            safeDate(u.createdAt) || new Date().toISOString(),
            safeDate(u.lastLogin)
        ], 'nc_users');
    }
    log(`nc_users : ${users.length} entrées`);
}

// ════════════════════════════════════════════════════════════
//  2. UTILISATEURS APPLICATION
// ════════════════════════════════════════════════════════════
async function migrateAppUsers(client) {
    log('Migration app_users…');
    const users = JSON.parse(fs.readFileSync(APP_USERS, 'utf8'));
    for (const u of users) {
        await exec(client, `
            INSERT INTO app_users (user_login, pass_hash, role, name, company, status, created_at, last_login)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (user_login) DO UPDATE SET
                pass_hash  = EXCLUDED.pass_hash,
                role       = EXCLUDED.role,
                name       = EXCLUDED.name,
                company    = EXCLUDED.company,
                status     = EXCLUDED.status,
                last_login = EXCLUDED.last_login
        `, [
            u.user,
            u.passHash,
            ['admin','contributor','user'].includes(u.role) ? u.role : 'user',
            u.name || u.user,
            u.company || null,
            ['active','pending','suspended'].includes(u.status) ? u.status : 'active',
            safeDate(u.createdAt) || new Date().toISOString(),
            safeDate(u.lastLogin)
        ], 'app_users');
    }
    log(`app_users : ${users.length} entrées`);
}

// ════════════════════════════════════════════════════════════
//  3. COMPTEURS NC
// ════════════════════════════════════════════════════════════
async function migrateCompteurs(client, ncData) {
    log('Migration nc_compteurs…');
    const counter = ncData.counter || {};
    const parentCounter = safeInt(ncData.parentCounter) || 0;

    for (const [annee, valeur] of Object.entries(counter)) {
        await exec(client, `
            INSERT INTO nc_compteurs (annee, valeur, parent_valeur)
            VALUES ($1,$2,$3)
            ON CONFLICT (annee) DO UPDATE SET
                valeur        = EXCLUDED.valeur,
                parent_valeur = EXCLUDED.parent_valeur
        `, [parseInt(annee), valeur, parseInt(annee) === new Date().getFullYear() ? parentCounter : 0],
        'nc_compteurs');
    }
    log(`nc_compteurs : ${Object.keys(counter).length} années`);
}

// ════════════════════════════════════════════════════════════
//  4. FICHES NC + HISTORIQUE + ACTIONS
// ════════════════════════════════════════════════════════════
async function migrateFiche(client, nc) {
    // ── Fiche principale ─────────────────────────────────────
    const STATUTS_VALIDES = ['ouvert','en_cours','en_traitement','resolu','clos','non_pertinent','rattachee'];
    const statut = STATUTS_VALIDES.includes(nc.statut) ? nc.statut : 'ouvert';
    const GRAVITES = ['critique','majeure','mineure'];

    await exec(client, `
        INSERT INTO nc_fiches (
            numero, created_at, updated_at, statut,
            closed_at, clos_par, cloture_via_parent, duree_total, duree_traitement,
            reouverture_date, echeance_respectee,
            redacteur, email_redacteur, date_decouverte, decouvreur,
            perimetre, source_detection,
            no_commande, ref_produit, famille_produit, no_serie, version_prog,
            quantite_unites, sap_code,
            nom_client, cp, ville, pays,
            probleme, reparation, suggestion,
            media_files, media_files_traitement,
            gravite, risque_impact, score_risque, processus,
            cinq_pourquoi, cause_racine, ishikawa,
            retour_client, blocage_signale, commentaire_qualite, type_cause,
            pilote, pilote_email, pilote_nom, delai_action, type_action,
            cout, commentaire_cloture, analyse_5p, preuve_efficacite,
            is_parent, is_satellite,
            parent_id, parent_label, satellites,
            groupe_label, groupe_motif, groupe_created_at, groupe_created_by,
            groupe_perimetre, rattachement_date, rattachement_by
        ) VALUES (
            $1,$2,$3,$4,
            $5,$6,$7,$8,$9,
            $10,$11,
            $12,$13,$14,$15,
            $16,$17,
            $18,$19,$20,$21,$22,
            $23,$24,
            $25,$26,$27,$28,
            $29,$30,$31,
            $32,$33,
            $34,$35,$36,$37,
            $38,$39,$40,
            $41,$42,$43,$44,
            $45,$46,$47,$48,$49,
            $50,$51,$52,$53,
            $54,$55,
            $56,$57,$58,
            $59,$60,$61,$62,
            $63,$64,$65
        )
        ON CONFLICT (numero) DO UPDATE SET
            updated_at            = EXCLUDED.updated_at,
            statut                = EXCLUDED.statut,
            closed_at             = EXCLUDED.closed_at,
            clos_par              = EXCLUDED.clos_par,
            cloture_via_parent    = EXCLUDED.cloture_via_parent,
            duree_total           = EXCLUDED.duree_total,
            duree_traitement      = EXCLUDED.duree_traitement,
            reouverture_date      = EXCLUDED.reouverture_date,
            echeance_respectee    = EXCLUDED.echeance_respectee,
            gravite               = EXCLUDED.gravite,
            score_risque          = EXCLUDED.score_risque,
            pilote                = EXCLUDED.pilote,
            pilote_email          = EXCLUDED.pilote_email,
            cout                  = EXCLUDED.cout,
            satellites            = EXCLUDED.satellites,
            is_parent             = EXCLUDED.is_parent,
            is_satellite          = EXCLUDED.is_satellite,
            parent_id             = EXCLUDED.parent_id,
            parent_label          = EXCLUDED.parent_label,
            famille_produit       = EXCLUDED.famille_produit,
            perimetre             = EXCLUDED.perimetre,
            source_detection      = EXCLUDED.source_detection,
            redacteur             = EXCLUDED.redacteur,
            probleme              = EXCLUDED.probleme,
            groupe_label          = EXCLUDED.groupe_label,
            groupe_motif          = EXCLUDED.groupe_motif
    `, [
        nc.numero,                                          // $1
        safeDate(nc.createdAt),                            // $2
        safeDate(nc.updatedAt),                            // $3
        statut,                                             // $4
        safeDate(nc.closedAt),                             // $5
        nc.clos_par || null,                               // $6
        nc.cloture_via_parent || null,                     // $7
        safeInt(nc.dureeTotal),                            // $8
        safeInt(nc.dureeTraitement),                       // $9
        safeDate(nc.reouverture_date),                     // $10
        nc.echeanceRespectee != null ? Boolean(nc.echeanceRespectee) : null, // $11
        nc.redacteur || null,                              // $12
        nc.emailRedacteur || null,                         // $13
        nc.dateDecouverte || null,                         // $14
        nc.decouvreur || null,                             // $15
        nc.perimetre || null,                              // $16
        nc.sourceDetection || null,                        // $17
        nc.noCommande || null,                             // $18
        nc.refProduit || null,                             // $19
        nc.familleProduit || null,                         // $20
        nc.noSerie || null,                                // $21
        nc.versionProg || null,                            // $22
        safeInt(nc.quantiteUnites),                        // $23
        nc.sapCode || null,                                // $24
        nc.nomClient || null,                              // $25
        nc.cp || null,                                     // $26
        nc.ville || null,                                  // $27
        nc.pays || null,                                   // $28
        nc.probleme || null,                               // $29
        nc.reparation || null,                             // $30
        nc.suggestion || null,                             // $31
        JSON.stringify(Array.isArray(nc.mediaFiles) ? nc.mediaFiles : []),            // $32
        JSON.stringify(Array.isArray(nc.mediaFilesTraitement) ? nc.mediaFilesTraitement : []), // $33
        GRAVITES.includes(nc.gravite) ? nc.gravite : null, // $34
        nc.risqueImpact ? JSON.stringify(nc.risqueImpact) : null,  // $35
        safeInt(nc.scoreRisque),                           // $36
        nc.processus || null,                              // $37
        nc.cinqPourquoi || null,                           // $38
        nc.causeRacine || null,                            // $39
        nc.ishikawa ? JSON.stringify(nc.ishikawa) : null,  // $40
        nc.retourClient || null,                           // $41
        safeBool(nc.blocageSignale),                       // $42
        nc.commentaireQualite || null,                     // $43
        nc.typeCause || null,                              // $44
        nc.pilote || null,                                 // $45
        nc.pilote_email || null,                           // $46
        nc.pilote_nom || null,                             // $47
        safeDate(nc.delaiAction),                          // $48
        nc.typeAction || null,                             // $49
        safeFloat(nc.cout),                                // $50
        nc.commentaireCloture || null,                     // $51
        nc.analyse_5p ? JSON.stringify(nc.analyse_5p) : null, // $52
        nc.preuve_efficacite || null,                      // $53
        safeBool(nc.is_parent),                            // $54
        safeBool(nc.is_satellite),                         // $55
        nc.parent_id || null,                              // $56
        nc.parent_label || null,                           // $57
        Array.isArray(nc.satellites) ? nc.satellites : null, // $58
        nc.groupe_label || null,                           // $59
        nc.groupe_motif || null,                           // $60
        safeDate(nc.groupe_created_at),                    // $61
        nc.groupe_created_by || null,                      // $62
        Array.isArray(nc.groupe_perimetre) ? nc.groupe_perimetre
            : (nc.perimetre ? [nc.perimetre] : null),      // $63
        safeDate(nc.rattachement_date),                    // $64
        nc.rattachement_by || null                         // $65
    ], 'nc_fiches');

    // ── Historique ───────────────────────────────────────────
    const historique = Array.isArray(nc.historique) ? nc.historique : [];
    for (let i = 0; i < historique.length; i++) {
        const h = historique[i];
        await exec(client, `
            INSERT INTO nc_historique (nc_numero, date, statut, commentaire, par, ordre)
            VALUES ($1,$2,$3,$4,$5,$6)
        `, [nc.numero, safeDate(h.date), h.statut || null, h.commentaire || null, h.par || null, i],
        'nc_historique');
    }

    // ── Discussion ───────────────────────────────────────────
    const discussion = Array.isArray(nc.discussion) ? nc.discussion : [];
    for (const d of discussion) {
        await exec(client, `
            INSERT INTO nc_discussion (nc_numero, date, message, par, par_email)
            VALUES ($1,$2,$3,$4,$5)
        `, [nc.numero, safeDate(d.date), d.message || null, d.par || null, d.par_email || null],
        'nc_discussion');
    }

    // ── Actions CAPA ─────────────────────────────────────────
    const actions = Array.isArray(nc.actions) ? nc.actions : [];
    for (const a of actions) {
        if (!a.id) { warn(`Action sans id dans NC ${nc.numero} — ignorée`); continue; }

        await exec(client, `
            INSERT INTO nc_actions (
                id, nc_numero, type, pilote, echeance,
                commentaire_action, statut,
                date_pilote_reponse, echeance_respectee,
                created_at, created_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (id) DO NOTHING
        `, [
            a.id, nc.numero,
            ['immediate','curative','corrective','preventive'].includes(a.type) ? a.type : 'curative',
            a.pilote || null,
            a.echeance || null,
            a.commentaireAction || null,
            ['ouvert','en_cours','cloturé'].includes(a.statut) ? a.statut : 'ouvert',
            safeDate(a.datePiloteReponse),
            a.echeanceRespectee != null ? Boolean(a.echeanceRespectee) : null,
            safeDate(a.createdAt) || new Date().toISOString(),
            a.createdBy || null
        ], 'nc_actions');

        // Historique statut de l'action
        const histStatut = Array.isArray(a.historiqueStatut) ? a.historiqueStatut : [];
        for (const hs of histStatut) {
            await exec(client, `
                INSERT INTO nc_action_historique (action_id, date, statut, par)
                VALUES ($1,$2,$3,$4)
            `, [a.id, safeDate(hs.date), hs.statut || null, hs.par || null],
            'nc_action_historique');
        }

        // Réponses pilotes
        const reponses = Array.isArray(a.reponsesActions) ? a.reponsesActions : [];
        for (const r of reponses) {
            await exec(client, `
                INSERT INTO nc_action_reponses (action_id, reponse, par, date)
                VALUES ($1,$2,$3,$4)
            `, [a.id, r.reponse || null, r.par || null, safeDate(r.date)],
            'nc_action_reponses');
        }

        // Relances
        const relances = Array.isArray(a.relances) ? a.relances : [];
        for (const rel of relances) {
            await exec(client, `
                INSERT INTO nc_action_relances (action_id, date, par)
                VALUES ($1,$2,$3)
            `, [a.id, safeDate(rel.date), rel.par || null],
            'nc_action_relances');
        }
    }
}

// ════════════════════════════════════════════════════════════
//  5. JOURNAL GROUPES PARENTS
// ════════════════════════════════════════════════════════════
async function migrateParentJournal(client) {
    log('Migration nc_parent_journal…');
    let pgData;
    try { pgData = JSON.parse(fs.readFileSync(NC_PARENT, 'utf8')); }
    catch { warn('nc-parent-groups.json absent ou illisible — journal ignoré'); return; }

    const journal = Array.isArray(pgData.journal) ? pgData.journal : [];
    for (const j of journal) {
        await exec(client, `
            INSERT INTO nc_parent_journal (action, parent_id, satellites, by_user, motif, label, timestamp)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [
            j.action || 'GROUPE_CREE',
            j.parent_id || null,
            Array.isArray(j.satellites) ? j.satellites : null,
            j.by || null,
            j.motif || null,
            j.label || null,
            safeDate(j.timestamp) || new Date().toISOString()
        ], 'nc_parent_journal');
    }
    log(`nc_parent_journal : ${journal.length} entrées`);
}

// ════════════════════════════════════════════════════════════
//  VÉRIFICATION FINALE — comptages JSON vs PostgreSQL
// ════════════════════════════════════════════════════════════
async function verifierComptages(client, ncData) {
    log('');
    log('══════════════════════════════════════════');
    log('  VÉRIFICATION DES COMPTAGES');
    log('══════════════════════════════════════════');

    const declarations = ncData.declarations || [];
    const jsonCount = declarations.length;
    const pgResult  = await client.query('SELECT COUNT(*) FROM nc_fiches');
    const pgCount   = parseInt(pgResult.rows[0].count);

    log(`  nc_fiches  JSON : ${jsonCount}`);
    log(`  nc_fiches  PG   : ${pgCount}`);

    if (jsonCount === pgCount) {
        log('  ✅ Comptage identique — migration validée');
    } else {
        err(`  Écart détecté : ${Math.abs(jsonCount - pgCount)} fiche(s) manquante(s)`);
    }

    // Vérification satellites
    const jsonSat  = declarations.filter(d => d.is_satellite).length;
    const pgSatRes = await client.query('SELECT COUNT(*) FROM nc_fiches WHERE is_satellite = TRUE');
    const pgSat    = parseInt(pgSatRes.rows[0].count);
    log(`  Satellites JSON : ${jsonSat} / PG : ${pgSat} ${jsonSat === pgSat ? '✅' : '⚠ ÉCART'}`);

    // Vérification parents
    const jsonPar  = declarations.filter(d => d.is_parent).length;
    const pgParRes = await client.query('SELECT COUNT(*) FROM nc_fiches WHERE is_parent = TRUE');
    const pgPar    = parseInt(pgParRes.rows[0].count);
    log(`  Parents    JSON : ${jsonPar} / PG : ${pgPar} ${jsonPar === pgPar ? '✅' : '⚠ ÉCART'}`);

    // Utilisateurs NC
    const ncUsersJson = JSON.parse(fs.readFileSync(NC_USERS, 'utf8')).length;
    const ncUsersPg   = parseInt((await client.query('SELECT COUNT(*) FROM nc_users')).rows[0].count);
    log(`  nc_users   JSON : ${ncUsersJson} / PG : ${ncUsersPg} ${ncUsersJson === ncUsersPg ? '✅' : '⚠ ÉCART'}`);
}

// ════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════
async function main() {
    log('');
    log('══════════════════════════════════════════');
    log('  MIGRATION NC MULLER → POSTGRESQL');
    log(DRY_RUN ? '  MODE : DRY-RUN (aucune écriture)' : '  MODE : ÉCRITURE RÉELLE');
    log('══════════════════════════════════════════');
    log('');

    // Vérification fichiers source
    for (const f of [NC_FILE, NC_USERS, APP_USERS, NC_PARENT]) {
        if (!fs.existsSync(f)) { err(`Fichier source absent : ${f}`); process.exit(1); }
    }

    const ncData = JSON.parse(fs.readFileSync(NC_FILE, 'utf8'));
    const declarations = ncData.declarations || [];

    log(`Sources chargées : ${declarations.length} fiches NC, prêtes à migrer`);
    log('');

    const client = await pool.connect();
    try {
        if (!DRY_RUN) await client.query('BEGIN');

        // Purge des tables BIGSERIAL (pas de clé naturelle → doublons si re-run sans DELETE)
        if (!DRY_RUN) {
            await client.query('DELETE FROM nc_parent_notifications');
            await client.query('DELETE FROM nc_parent_journal');
            await client.query('DELETE FROM nc_action_relances');
            await client.query('DELETE FROM nc_action_reponses');
            await client.query('DELETE FROM nc_action_historique');
            await client.query('DELETE FROM nc_actions');
            await client.query('DELETE FROM nc_discussion');
            await client.query('DELETE FROM nc_historique');
        }

        await migrateNCUsers(client);
        await migrateAppUsers(client);
        await migrateCompteurs(client, ncData);

        log(`Migration des fiches NC (${declarations.length})…`);
        for (const nc of declarations) {
            await migrateFiche(client, nc);
        }

        await migrateParentJournal(client);

        if (!DRY_RUN) {
            await client.query('COMMIT');
            log('');
            log('✅ Transaction commitée');
            await verifierComptages(client, ncData);
        }

    } catch (e) {
        if (!DRY_RUN) await client.query('ROLLBACK');
        err(`Erreur fatale — rollback effectué : ${e.message}`);
        process.exit(1);
    } finally {
        client.release();
    }

    // Rapport final
    log('');
    log('══════════════════════════════════════════');
    log('  RAPPORT MIGRATION');
    log('══════════════════════════════════════════');
    for (const [table, s] of Object.entries(stats)) {
        if (s.tentees === 0) continue;
        const ok = s.erreurs === 0 ? '✅' : '⚠';
        log(`  ${ok} ${table.padEnd(25)} ${s.inserees}/${s.tentees} insérées${s.erreurs > 0 ? ` — ${s.erreurs} erreur(s)` : ''}`);
    }
    log('');

    if (DRY_RUN) {
        log('DRY-RUN terminé — aucune donnée modifiée.');
        log('Relancez sans --dry-run pour la migration réelle.');
    } else {
        log('Migration terminée.');
        log('');
        log('Prochaines étapes :');
        log('  1. Vérifier les comptages ci-dessus');
        log('  2. Activer DATA_SOURCE=dual dans .env (dual-write 7 jours)');
        log('  3. Comparer quotidiennement JSON vs PG avec : node compare.js');
        log('  4. Bascule finale : DATA_SOURCE=postgres dans .env');
    }

    await pool.end();
}

main().catch(e => { err(e.message); process.exit(1); });
