'use strict';
/**
 * ============================================================
 *  COMPARE.JS — Vérification parité JSON ↔ PostgreSQL
 *  NC Muller Automotive
 *
 *  Usage :
 *    node compare.js            → rapport complet
 *    node compare.js --verbose  → détail fiche par fiche
 *    node compare.js --fix      → resynchronise les fiches manquantes dans PG
 *
 *  Lancer quotidiennement pendant la période dual-write (jusqu'au 16/05/2026)
 * ============================================================
 */

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const VERBOSE = process.argv.includes('--verbose');
const FIX     = process.argv.includes('--fix');

const NC_FILE     = path.join(__dirname, 'nc-data.json');
const USERS_FILE  = path.join(__dirname, 'nc-users.json');
const PARENT_FILE = path.join(__dirname, 'nc-parent-groups.json');

// ── Couleurs terminal ─────────────────────────────────────────
const G = s => `\x1b[32m${s}\x1b[0m`;
const R = s => `\x1b[31m${s}\x1b[0m`;
const Y = s => `\x1b[33m${s}\x1b[0m`;
const B = s => `\x1b[36m${s}\x1b[0m`;
const W = s => `\x1b[1m${s}\x1b[0m`;

const OK   = G('✅');
const FAIL = R('❌');
const WARN = Y('⚠ ');

// ── Pool PostgreSQL ───────────────────────────────────────────
const pool = new Pool({
    host:     process.env.PG_HOST     || 'localhost',
    port:     parseInt(process.env.PG_PORT || '5432'),
    user:     process.env.PG_USER     || 'postgres',
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DB       || 'nc_muller',
});

// ── Helpers ───────────────────────────────────────────────────
function chk(label, jsonVal, pgVal, opts = {}) {
    const ok = jsonVal === pgVal;
    const warn = opts.warn && !ok;
    const status = ok ? OK : (warn ? WARN : FAIL);
    const jStr = String(jsonVal).padEnd(6);
    const pStr = String(pgVal).padEnd(6);
    const note = ok ? '' : (warn ? Y(`  (attendu — flags calculés en mémoire)`) : R(`  ← ÉCART : ${Math.abs(jsonVal - pgVal)}`));
    console.log(`  ${status}  ${label.padEnd(30)} JSON ${jStr}  PG ${pStr}${note}`);
    return ok || !!opts.warn;
}

// ── Calcul parents/satellites depuis nc-parent-groups.json ────
function computeGroupFlags(groups) {
    const parents    = new Set();
    const satellites = new Set();
    // Groupes actifs
    for (const g of groups.groups || []) {
        if (g.parentId) parents.add(g.parentId);
        for (const s of g.satellites || []) satellites.add(s);
    }
    // Complément via journal (NC-P-* sont toujours parents)
    for (const j of groups.journal || []) {
        if (j.parent_id) parents.add(j.parent_id);
        for (const s of j.satellites || []) satellites.add(s);
    }
    // Un satellite ne peut pas aussi être parent dans le comptage
    for (const p of parents) satellites.delete(p);
    return { parents, satellites };
}

async function main() {
    // ── Chargement JSON ───────────────────────────────────────
    let ncData, ncUsers, ncParent;
    try {
        ncData   = JSON.parse(fs.readFileSync(NC_FILE,     'utf8'));
        ncUsers  = JSON.parse(fs.readFileSync(USERS_FILE,  'utf8'));
        ncParent = JSON.parse(fs.readFileSync(PARENT_FILE, 'utf8'));
    } catch (e) {
        console.error(R('Erreur lecture JSON :'), e.message);
        process.exit(1);
    }

    const declarations  = ncData.declarations || [];
    const jsonNumerosSet = new Set(declarations.map(nc => nc.numero));
    const { parents: jsonParentsSet, satellites: jsonSatsSet } = computeGroupFlags(ncParent);

    // ── Connexion PG ──────────────────────────────────────────
    let client;
    try {
        client = await pool.connect();
    } catch (e) {
        console.error(R('Connexion PostgreSQL échouée :'), e.message);
        process.exit(1);
    }

    const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
    console.log('\n' + W('═'.repeat(58)));
    console.log(W('  COMPARAISON JSON ↔ POSTGRESQL — NC Muller Automotive'));
    console.log(`  ${B(now)}`);
    console.log(W('═'.repeat(58)) + '\n');

    let allOk = true;

    // ── 1. Comptages globaux (requêtes séquentielles) ─────────
    console.log(W('1. Comptages globaux'));

    const pgTotal    = parseInt((await client.query('SELECT COUNT(*) AS c FROM nc_fiches')).rows[0].c);
    const pgUsers    = parseInt((await client.query('SELECT COUNT(*) AS c FROM nc_users')).rows[0].c);
    const pgParents  = parseInt((await client.query('SELECT COUNT(*) AS c FROM nc_fiches WHERE is_parent = TRUE')).rows[0].c);
    const pgSats     = parseInt((await client.query('SELECT COUNT(*) AS c FROM nc_fiches WHERE is_satellite = TRUE')).rows[0].c);
    const pgHisto    = parseInt((await client.query('SELECT COUNT(*) AS c FROM nc_historique')).rows[0].c);
    const pgActions  = parseInt((await client.query('SELECT COUNT(*) AS c FROM nc_actions')).rows[0].c);

    const jsonTotal   = declarations.length;
    const jsonUsers   = ncUsers.length;
    const jsonParents = jsonParentsSet.size;
    const jsonSats    = jsonSatsSet.size;
    const jsonHisto   = declarations.reduce((s, nc) => s + (nc.historique?.length || 0), 0);
    const jsonActions = declarations.reduce((s, nc) => s + (nc.actions?.length || 0), 0);

    allOk &= chk('nc_fiches (total)',        jsonTotal,   pgTotal);
    allOk &= chk('nc_users',                 jsonUsers,   pgUsers);
    allOk &= chk('  dont parents',           jsonParents, pgParents);
    allOk &= chk('  dont satellites',        jsonSats,    pgSats);
    allOk &= chk('nc_historique (entrées)',  jsonHisto,   pgHisto);
    allOk &= chk('nc_actions',               jsonActions, pgActions);

    // ── 2. Numéros NC — présence croisée ─────────────────────
    console.log('\n' + W('2. Numéros NC — présence croisée'));
    const pgNumerosSet = new Set(
        (await client.query('SELECT numero FROM nc_fiches')).rows.map(r => r.numero)
    );

    const missingInPG   = [...jsonNumerosSet].filter(n => !pgNumerosSet.has(n));
    const missingInJSON = [...pgNumerosSet].filter(n => !jsonNumerosSet.has(n));

    if (missingInPG.length === 0 && missingInJSON.length === 0) {
        console.log(`  ${OK}  Tous les numéros NC présents dans les deux sources`);
    } else {
        if (missingInPG.length > 0) {
            allOk = false;
            console.log(`  ${FAIL}  En JSON mais ABSENT de PG (${missingInPG.length}) :`);
            missingInPG.forEach(n => console.log(`       ${R(n)}`));
        }
        if (missingInJSON.length > 0) {
            allOk = false;
            console.log(`  ${FAIL}  En PG mais ABSENT du JSON (${missingInJSON.length}) :`);
            missingInJSON.forEach(n => console.log(`       ${R(n)}`));
        }
    }

    // ── 3. Cohérence des statuts ──────────────────────────────
    console.log('\n' + W('3. Cohérence des statuts'));
    const pgStatuts = Object.fromEntries(
        (await client.query('SELECT numero, statut FROM nc_fiches')).rows.map(r => [r.numero, r.statut])
    );

    const statutDesync = [];
    for (const nc of declarations) {
        const jsonStatut = nc.statut || nc.status || 'ouvert';
        const pgStatut   = pgStatuts[nc.numero];
        if (pgStatut !== undefined && pgStatut !== jsonStatut) {
            statutDesync.push({ numero: nc.numero, json: jsonStatut, pg: pgStatut });
        }
    }

    if (statutDesync.length === 0) {
        console.log(`  ${OK}  Statuts cohérents sur toutes les fiches`);
    } else {
        allOk = false;
        statutDesync.forEach(d =>
            console.log(`  ${FAIL}  ${R(d.numero)}  JSON: ${d.json}  →  PG: ${d.pg}`)
        );
    }

    // ── 4. Flags parent/satellite ─────────────────────────────
    console.log('\n' + W('4. Flags parent / satellite (depuis nc-parent-groups.json)'));
    const pgFlagRows = (await client.query(
        'SELECT numero, is_parent, is_satellite FROM nc_fiches'
    )).rows;
    const pgFlags = Object.fromEntries(pgFlagRows.map(r => [r.numero, r]));

    let flagsOk = true;
    for (const num of jsonNumerosSet) {
        const shouldBeParent = jsonParentsSet.has(num);
        const shouldBeSat    = jsonSatsSet.has(num);
        const pg = pgFlags[num];
        if (!pg) continue;
        if (pg.is_parent !== shouldBeParent || pg.is_satellite !== shouldBeSat) {
            flagsOk = false;
            console.log(`  ${FAIL}  ${num}  attendu parent=${shouldBeParent} sat=${shouldBeSat}  PG=${pg.is_parent}/${pg.is_satellite}`);
        }
    }
    if (flagsOk) console.log(`  ${OK}  Flags parent/satellite cohérents`);
    allOk &= flagsOk;

    // ── 5. Dernières fiches créées ────────────────────────────
    console.log('\n' + W('5. Dernières fiches (5 plus récentes)'));
    const recentes = (await client.query(
        'SELECT numero, statut, is_parent, is_satellite, updated_at, created_at FROM nc_fiches ORDER BY created_at DESC LIMIT 5'
    )).rows;

    if (recentes.length === 0) {
        console.log(`  ${WARN} Aucune fiche en PG`);
    } else {
        recentes.forEach(r => {
            const inJSON = jsonNumerosSet.has(r.numero) ? G('JSON ✓') : R('JSON ✗');
            const type   = r.is_parent ? ' [PARENT]' : r.is_satellite ? ' [SAT]   ' : '         ';
            const date   = new Date(r.created_at).toLocaleDateString('fr-FR');
            console.log(`  · ${B(r.numero)}${type}  ${r.statut.padEnd(14)}  créée ${date}  ${inJSON}`);
        });
    }

    // ── 6. Verbose — détail par fiche ─────────────────────────
    if (VERBOSE) {
        console.log('\n' + W('6. Détail des compteurs par fiche'));
        const pgH = Object.fromEntries(
            (await client.query('SELECT nc_numero, COUNT(*) AS c FROM nc_historique GROUP BY nc_numero')).rows
            .map(r => [r.nc_numero, parseInt(r.c)])
        );
        const pgA = Object.fromEntries(
            (await client.query('SELECT nc_numero, COUNT(*) AS c FROM nc_actions GROUP BY nc_numero')).rows
            .map(r => [r.nc_numero, parseInt(r.c)])
        );
        for (const nc of declarations) {
            const jH = nc.historique?.length || 0;
            const jA = nc.actions?.length    || 0;
            const pH = pgH[nc.numero]        || 0;
            const pA = pgA[nc.numero]        || 0;
            const s  = (jH === pH && jA === pA) ? OK : FAIL;
            console.log(`  ${s}  ${nc.numero.padEnd(16)}  historique ${jH}→${pH}  actions ${jA}→${pA}`);
        }
    }

    // ── 7. Fix — resync des fiches manquantes dans PG ─────────
    if (FIX && missingInPG.length > 0) {
        console.log('\n' + W('7. Resynchronisation (--fix)'));
        for (const nc of declarations.filter(nc => missingInPG.includes(nc.numero))) {
            try {
                await client.query(`
                    INSERT INTO nc_fiches (numero, created_at, statut, is_parent, is_satellite,
                        redacteur, pilote, probleme, perimetre, famille_produit,
                        media_files, media_files_traitement)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                    ON CONFLICT (numero) DO NOTHING
                `, [
                    nc.numero, nc.createdAt||null, nc.statut||'ouvert',
                    jsonParentsSet.has(nc.numero), jsonSatsSet.has(nc.numero),
                    nc.redacteur||null, nc.pilote||null, nc.probleme||null,
                    nc.perimetre||null, nc.familleProduit||null,
                    JSON.stringify(nc.mediaFiles||[]),
                    JSON.stringify(nc.mediaFilesTraitement||[]),
                ]);
                console.log(`  ${OK}  ${nc.numero} resynchronisée`);
            } catch (e) {
                console.log(`  ${FAIL}  ${nc.numero} — ${e.message}`);
            }
        }
        console.log(Y(`\n  Pour une resync complète : node migrate.js`));
    }

    // ── Résumé ────────────────────────────────────────────────
    console.log('\n' + W('═'.repeat(58)));
    if (allOk) {
        console.log(G('  RÉSULTAT : PARITÉ JSON/PG CONFIRMÉE — dual-write sain ✅'));
    } else {
        console.log(R('  RÉSULTAT : ÉCARTS DÉTECTÉS — voir détails ci-dessus'));
        console.log(Y('  Resync partielle : node compare.js --fix'));
        console.log(Y('  Resync complète  : node migrate.js'));
    }
    console.log(W('═'.repeat(58)) + '\n');

    client.release();
    await pool.end();
    process.exit(allOk ? 0 : 1);
}

main().catch(e => {
    console.error(R('Erreur inattendue :'), e.message);
    process.exit(1);
});
