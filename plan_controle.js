'use strict';
require('dotenv').config();

const fs   = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.PG_HOST     || 'localhost',
    port:     parseInt(process.env.PG_PORT || '5432'),
    user:     process.env.PG_USER     || 'postgres',
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DB       || 'nc_muller',
});

const G = s => `\x1b[32m${s}\x1b[0m`;
const R = s => `\x1b[31m${s}\x1b[0m`;
const Y = s => `\x1b[33m${s}\x1b[0m`;
const B = s => `\x1b[36m${s}\x1b[0m`;
const W = s => `\x1b[1m${s}\x1b[0m`;
const OK   = G('✅');
const FAIL = R('❌');
const WARN = Y('⚠ ');

(async () => {
    const client = await pool.connect();
    const ncData  = JSON.parse(fs.readFileSync('C:/formation/nc-data.json',  'utf8'));
    const ncUsers = JSON.parse(fs.readFileSync('C:/formation/nc-users.json', 'utf8'));
    const decls   = ncData.declarations || [];

    console.log('\n' + W('═'.repeat(64)));
    console.log(W('  PLAN DE CONTRÔLE COMPLET — JSON ↔ POSTGRESQL'));
    console.log(W('  ' + new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })));
    console.log(W('═'.repeat(64)));

    let globalOk = true;

    // ── A. UTILISATEURS ──────────────────────────────────────────
    console.log('\n' + W('A. UTILISATEURS (nc_users)'));
    const pgUsersRows = (await client.query(
        'SELECT email, name, role, user_login, created_at, last_login FROM nc_users ORDER BY email'
    )).rows;
    // Clé de comparaison : user_login (unique, stable même sans email)
    const pgUserMap = Object.fromEntries(pgUsersRows.map(u => [u.user_login, u]));
    let usersOk = true;

    for (const u of ncUsers) {
        const pg = pgUserMap[u.user];
        if (!pg) {
            console.log(`  ${FAIL} ABSENT PG login="${u.user}" email=${u.email||'—'}`);
            usersOk = false; continue;
        }
        const issues = [];
        if (pg.name !== u.name) issues.push(`name JSON="${u.name}" PG="${pg.name}"`);
        if (pg.role !== u.role) issues.push(`role JSON=${u.role} PG=${pg.role}`);
        const emailOk = (pg.email||null) === (u.email||null);
        if (!emailOk) issues.push(`email JSON="${u.email||''}" PG="${pg.email||''}"`);
        if (issues.length) {
            console.log(`  ${WARN} login=${u.user} (${u.email||'sans email'}) — ${issues.join(' | ')}`);
            usersOk = false;
        }
    }
    for (const pu of pgUsersRows) {
        if (!ncUsers.find(u => u.user === pu.user_login)) {
            console.log(`  ${WARN} En PG mais absent du JSON : login="${pu.user_login}" email=${pu.email||'null'}`);
            usersOk = false;
        }
    }
    if (usersOk) {
        console.log(`  ${OK}  ${ncUsers.length} utilisateurs — email / nom / role / actif cohérents`);
    }
    globalOk = globalOk && usersOk;

    // Nouveaux utilisateurs (depuis 09/05)
    const since = new Date('2026-05-09T00:00:00Z');
    const pgNew = pgUsersRows.filter(u => u.created_at && new Date(u.created_at) > since);

    const jsonNew = ncUsers.filter(u => u.createdAt && new Date(u.createdAt) > since);
    console.log(`\n  ${B('Nouveaux utilisateurs depuis 09/05 —')} JSON: ${jsonNew.length}  PG: ${pgNew.length}`);
    if (pgNew.length === 0 && jsonNew.length === 0) {
        console.log(`  ${WARN} Aucun nouvel utilisateur`);
    } else {
        pgNew.forEach(u => console.log(
            `  ${OK}  ${u.email.padEnd(35)} ${u.role.padEnd(22)} créé le ${new Date(u.created_at).toLocaleDateString('fr-FR')}`
        ));
        // JSON présents mais absents PG (lookup par user_login)
        for (const u of jsonNew) {
            if (!pgUserMap[u.user]) console.log(`  ${FAIL} JSON sans PG : login=${u.user} email=${u.email||'—'}`);
        }
    }

    // ── B. CHAMPS CRITIQUES NC ────────────────────────────────────
    console.log('\n' + W('B. CHAMPS CRITIQUES PAR FICHE NC'));
    const pgFiches = (await client.query(`
        SELECT numero, statut, famille_produit, perimetre, gravite, source_detection,
               is_parent, is_satellite, parent_id, redacteur, updated_at
        FROM nc_fiches ORDER BY created_at DESC
    `)).rows;
    const pgMap = Object.fromEntries(pgFiches.map(r => [r.numero, r]));
    let fichesOk = true;

    for (const nc of decls) {
        const pg = pgMap[nc.numero];
        if (!pg) {
            console.log(`  ${FAIL} ABSENT PG : ${nc.numero}`);
            fichesOk = false; continue;
        }
        const issues = [];
        const statut = nc.statut || 'ouvert';
        if (pg.statut !== statut)
            issues.push(`statut JSON=${statut} PG=${pg.statut}`);
        if ((pg.famille_produit || null) !== (nc.familleProduit || null))
            issues.push(`famille JSON="${nc.familleProduit||''}" PG="${pg.famille_produit||''}"`);
        if ((pg.perimetre || null) !== (nc.perimetre || null))
            issues.push('perimetre diff');
        if (pg.is_parent !== (!!nc.is_parent))
            issues.push(`is_parent JSON=${!!nc.is_parent} PG=${pg.is_parent}`);
        if (pg.is_satellite !== (!!nc.is_satellite))
            issues.push(`is_satellite JSON=${!!nc.is_satellite} PG=${pg.is_satellite}`);

        const tag = nc.is_parent ? ' [PARENT]' : nc.is_satellite ? ' [SAT]   ' : '         ';
        if (issues.length) {
            console.log(`  ${FAIL} ${nc.numero}${tag} — ${issues.join(' | ')}`);
            fichesOk = false;
        } else {
            console.log(`  ${OK}  ${B(nc.numero.padEnd(16))}${tag}  statut=${statut.padEnd(10)}  famille=${(nc.familleProduit || '—').padEnd(16)}`);
        }
    }
    globalOk = globalOk && fichesOk;

    // ── C. HISTORIQUE DÉTAILLÉ PAR FICHE ─────────────────────────
    console.log('\n' + W('C. HISTORIQUE (entrées par fiche)'));
    const pgHist = (await client.query(
        'SELECT nc_numero, COUNT(*) c FROM nc_historique GROUP BY nc_numero'
    )).rows;
    const pgHistMap = Object.fromEntries(pgHist.map(r => [r.nc_numero, parseInt(r.c)]));
    let histOk = true;
    for (const nc of decls) {
        const jH = (nc.historique || []).length;
        const pH = pgHistMap[nc.numero] || 0;
        if (jH !== pH) {
            console.log(`  ${FAIL} ${nc.numero}  JSON=${jH}  PG=${pH}  écart=${Math.abs(jH - pH)}`);
            histOk = false;
        } else {
            console.log(`  ${OK}  ${nc.numero.padEnd(16)}  ${jH} entrée(s)`);
        }
    }
    const totalH = decls.reduce((s, nc) => s + (nc.historique || []).length, 0);
    if (histOk) console.log(`\n  ${OK}  Total : ${totalH} entrées historique — 100% cohérentes`);
    globalOk = globalOk && histOk;

    // ── D. ACTIONS ET RÉPONSES ────────────────────────────────────
    console.log('\n' + W('D. ACTIONS ET RÉPONSES'));
    const pgActRows = (await client.query(
        'SELECT nc_numero, COUNT(*) c FROM nc_actions GROUP BY nc_numero'
    )).rows;
    const pgActMap = Object.fromEntries(pgActRows.map(r => [r.nc_numero, parseInt(r.c)]));
    const pgRepRows = (await client.query(`
        SELECT a.nc_numero, COUNT(r.id) c
        FROM nc_actions a
        LEFT JOIN nc_action_reponses r ON r.action_id = a.id
        GROUP BY a.nc_numero
    `)).rows;
    const pgRepMap = Object.fromEntries(pgRepRows.map(r => [r.nc_numero, parseInt(r.c)]));
    let actOk = true;
    for (const nc of decls) {
        const jA = (nc.actions || []).length;
        const pA = pgActMap[nc.numero] || 0;
        const jR = (nc.actions || []).reduce((s, a) => s + (a.reponsesActions || []).length, 0);
        const pR = pgRepMap[nc.numero] || 0;
        if (jA !== pA || jR !== pR) {
            console.log(`  ${FAIL} ${nc.numero}  actions JSON=${jA} PG=${pA}  réponses JSON=${jR} PG=${pR}`);
            actOk = false;
        } else if (jA > 0) {
            console.log(`  ${OK}  ${nc.numero.padEnd(16)}  ${jA} action(s)  ${jR} réponse(s)`);
        }
    }
    const totalA = decls.reduce((s, nc) => s + (nc.actions || []).length, 0);
    const totalR = decls.reduce((s, nc) => s + (nc.actions || []).reduce((s2, a) => s2 + (a.reponsesActions || []).length, 0), 0);
    if (actOk) console.log(`\n  ${OK}  Total : ${totalA} actions, ${totalR} réponses — 100% cohérents`);
    globalOk = globalOk && actOk;

    // ── E. INTÉGRITÉ SATELLITES ───────────────────────────────────
    console.log('\n' + W('E. INTÉGRITÉ SATELLITES'));
    const sats = decls.filter(nc => nc.is_satellite);
    let satOk = true;
    for (const sat of sats) {
        const issues = [];
        if (sat.statut !== 'rattachee')      issues.push(`statut=${sat.statut} (attendu rattachee)`);
        if (!sat._statut_avant && !sat.statutAvantRattachement) issues.push('_statut_avant absent — retour impossible');
        if (!sat.parent_id)                  issues.push('parent_id absent');
        const parent = decls.find(nc => nc.numero === sat.parent_id);
        if (!parent)                         issues.push(`NC parent ${sat.parent_id} introuvable`);
        else if (!(parent.satellites || []).includes(sat.numero)) issues.push('non listée dans parent.satellites');
        const statutRestaure = sat._statut_avant || sat.statutAvantRattachement || '—';
        if (issues.length) {
            console.log(`  ${FAIL} ${sat.numero} — ${issues.join(' | ')}`);
            satOk = false;
        } else {
            console.log(`  ${OK}  ${B(sat.numero.padEnd(16))}  → ${sat.parent_id}  retour_vers=${statutRestaure}  famille=${sat.familleProduit||'—'}`);
        }
    }
    if (sats.length === 0) console.log(`  ${WARN} Aucun satellite détecté`);
    globalOk = globalOk && satOk;

    // ── F. NC PARENTS — COHÉRENCE ─────────────────────────────────
    console.log('\n' + W('F. NC PARENTS — COHÉRENCE'));
    const parents = decls.filter(nc => nc.is_parent);
    let parOk = true;
    for (const p of parents) {
        const issues = [];
        if (!p.familleProduit)          issues.push('famille vide');
        if (!(p.satellites || []).length) issues.push('aucun satellite');
        for (const sid of p.satellites || []) {
            if (!decls.find(nc => nc.numero === sid)) issues.push(`satellite ${sid} introuvable`);
        }
        if (issues.length) {
            console.log(`  ${FAIL} ${p.numero} — ${issues.join(' | ')}`);
            parOk = false;
        } else {
            console.log(`  ${OK}  ${B(p.numero)}  famille=${p.familleProduit}  satellites=[${p.satellites.join(', ')}]`);
        }
    }
    if (parents.length === 0) console.log(`  ${WARN} Aucun groupe parent`);
    globalOk = globalOk && parOk;

    // ── G. NC CRÉÉES VIA SITE (depuis 09/05) ─────────────────────
    console.log('\n' + W('G. NC CRÉÉES VIA FORMULAIRE SITE (depuis 09/05/2026)'));
    const sinceNC = new Date('2026-05-09T00:00:00Z');
    const newNC = decls.filter(nc => nc.createdAt && new Date(nc.createdAt) > sinceNC && !nc.is_parent);
    if (newNC.length === 0) {
        console.log(`  ${WARN} Aucune NC créée via le formulaire depuis le 09/05`);
    } else {
        for (const nc of newNC) {
            const pg = pgMap[nc.numero];
            const inPG = pg ? G('PG ✓') : R('PG ✗');
            console.log(`  ${OK}  ${B(nc.numero.padEnd(16))}  ${(nc.familleProduit||'—').padEnd(16)}  ${(nc.statut||'?').padEnd(12)}  ${inPG}`);
        }
    }

    // ── H. NOUVELLES NC DANS PG NON PRÉSENTES EN JSON ────────────
    console.log('\n' + W('H. NC EN PG SANS ÉQUIVALENT JSON'));
    const jsonNums = new Set(decls.map(nc => nc.numero));
    const pgOrphans = pgFiches.filter(r => !jsonNums.has(r.numero));
    if (pgOrphans.length === 0) {
        console.log(`  ${OK}  Aucun orphelin PG — toutes les fiches PG ont un équivalent JSON`);
    } else {
        pgOrphans.forEach(r => console.log(`  ${FAIL} ${r.numero} en PG mais absent JSON`));
        globalOk = false;
    }

    // ── RÉSUMÉ FINAL ──────────────────────────────────────────────
    console.log('\n' + W('═'.repeat(64)));
    if (globalOk) {
        console.log(G('  BILAN : TOUT VERT ✅'));
        console.log(G('  Système cohérent — prêt pour la bascule DATA_SOURCE=postgres'));
    } else {
        console.log(R('  BILAN : ÉCARTS DÉTECTÉS — corriger avant la bascule'));
    }
    console.log(W('═'.repeat(64)) + '\n');

    client.release();
    await pool.end();
})().catch(e => { console.error(R('Erreur : ') + e.message); process.exit(1); });
