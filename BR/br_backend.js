/**
 * br_backend.js — Module Rappel Sécurité BR (Basse Tension)
 * Intégré dans server.js via : const brRouter = require('./BR/br_backend');
 *                              app.use(brRouter);
 */
'use strict';
const express  = require('express');
const path     = require('path');
const bcrypt   = require('bcryptjs');  // bcryptjs — déjà dans les deps
const jwt      = require('jsonwebtoken');
const { Pool } = require('pg');
const router   = express.Router();

// ── Pool PostgreSQL (même config que server.js) ─────────────
const pool = new Pool({
    host:     process.env.PG_HOST     || 'localhost',
    port:     parseInt(process.env.PG_PORT || '5432'),
    user:     process.env.PG_USER     || 'postgres',
    password: process.env.PG_PASSWORD || '',
    database: process.env.PG_DB       || 'nc_muller',
});
pool.on('error', e => console.error('[BR] PG pool error:', e.message));

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// ── Auth admin (réutilise le JWT NC admin) ──────────────────
function requireBRAdmin(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const p = jwt.verify(token, JWT_SECRET);
        if (p.scope !== 'nc' || p.role !== 'nc_admin')
            return res.status(403).json({ error: 'Accès réservé aux administrateurs NC' });
        req.brAdmin = p;
        next();
    } catch { res.status(401).json({ error: 'Token invalide ou expiré' }); }
}

// ── Servir les fichiers statiques du dossier BR ─────────────
router.use('/BR', express.static(path.join(__dirname)));

// ══════════════════════════════════════════════════════════════
//  PUBLIC — Vérification email dans la liste blanche
// ══════════════════════════════════════════════════════════════
router.post('/api/br/check-email', async (req, res) => {
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ authorized: false, error: 'Email requis' });
    try {
        const { rows } = await pool.query(
            'SELECT nom, prenom FROM br_emails_autorises WHERE LOWER(email)=$1 AND actif=true',
            [email]
        );
        if (!rows.length) return res.json({ authorized: false });
        res.json({ authorized: true, nom: rows[0].nom, prenom: rows[0].prenom });
    } catch (e) {
        console.error('[BR] check-email:', e.message);
        res.status(500).json({ authorized: false, error: 'Erreur serveur' });
    }
});

// ══════════════════════════════════════════════════════════════
//  PUBLIC — Enregistrer un résultat de module
// ══════════════════════════════════════════════════════════════
router.post('/api/br/resultat', async (req, res) => {
    const { nom, prenom, email, score, score_pct, verdict, reponses, duree_sec } = req.body || {};
    if (!email || score === undefined)
        return res.status(400).json({ error: 'Email et score obligatoires' });
    try {
        const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').substring(0, 60);
        const { rows } = await pool.query(
            `INSERT INTO br_resultats (nom, prenom, email, score, score_pct, verdict, reponses, duree_sec, ip)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, created_at`,
            [nom, prenom, email, score, score_pct, verdict,
             JSON.stringify(reponses || []), duree_sec || null, ip]
        );
        res.json({ ok: true, id: rows[0].id, created_at: rows[0].created_at });
    } catch (e) {
        console.error('[BR] resultat:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════
//  ADMIN — Statistiques globales
// ══════════════════════════════════════════════════════════════
router.get('/api/br/stats', requireBRAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                COUNT(*)                                              AS total,
                COUNT(*) FILTER (WHERE score_pct >= 70)              AS valides,
                COUNT(*) FILTER (WHERE score_pct >= 50 AND score_pct < 70) AS moyens,
                COUNT(*) FILTER (WHERE score_pct < 50)               AS echecs,
                ROUND(AVG(score_pct))                                AS moy_pct,
                MAX(created_at)                                      AS derniere_passation
            FROM br_resultats
        `);
        const wl = await pool.query('SELECT COUNT(*) FROM br_emails_autorises WHERE actif=true');
        res.json({ ...rows[0], autorises: parseInt(wl.rows[0].count) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  ADMIN — Liste des résultats
// ══════════════════════════════════════════════════════════════
router.get('/api/br/resultats', requireBRAdmin, async (req, res) => {
    const page    = Math.max(1, parseInt(req.query.page) || 1);
    const limit   = Math.min(100, parseInt(req.query.limit) || 50);
    const offset  = (page - 1) * limit;
    const search  = req.query.search  ? `%${req.query.search}%` : null;
    const verdict = req.query.verdict || null;
    try {
        let where = 'WHERE 1=1'; const params = [];
        if (search) { params.push(search); where += ` AND (nom ILIKE $${params.length} OR prenom ILIKE $${params.length} OR email ILIKE $${params.length})`; }
        if (verdict) { params.push(verdict); where += ` AND verdict = $${params.length}`; }
        const countRes = await pool.query(`SELECT COUNT(*) FROM br_resultats ${where}`, params);
        params.push(limit, offset);
        const dataRes  = await pool.query(
            `SELECT id,nom,prenom,email,score,score_pct,verdict,duree_sec,created_at
             FROM br_resultats ${where} ORDER BY created_at DESC
             LIMIT $${params.length-1} OFFSET $${params.length}`, params);
        res.json({ total: parseInt(countRes.rows[0].count), page, limit, rows: dataRes.rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  ADMIN — Détail d'un résultat
// ══════════════════════════════════════════════════════════════
router.get('/api/br/resultats/:id', requireBRAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM br_resultats WHERE id=$1', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Non trouvé' });
        res.json(rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  ADMIN — Liste blanche (whitelist)
// ══════════════════════════════════════════════════════════════
// Liste blanche avec statut de complétion
router.get('/api/br/whitelist', requireBRAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT w.*,
                COUNT(r.id)            AS nb_passations,
                MAX(r.score_pct)       AS meilleur_score,
                MAX(r.created_at)      AS derniere_passation,
                MAX(r.verdict)         AS dernier_verdict
            FROM br_emails_autorises w
            LEFT JOIN br_resultats r ON LOWER(r.email) = LOWER(w.email)
            GROUP BY w.id
            ORDER BY w.nom, w.prenom
        `);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/br/whitelist', requireBRAdmin, async (req, res) => {
    const { email, nom, prenom, service } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email requis' });
    try {
        const { rows } = await pool.query(
            `INSERT INTO br_emails_autorises (email,nom,prenom,service)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (email) DO UPDATE SET nom=$2,prenom=$3,service=$4,actif=true
             RETURNING *`,
            [email.toLowerCase().trim(), nom||'', prenom||'', service||'']
        );
        res.json({ ok: true, entry: rows[0] });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/api/br/whitelist/:id', requireBRAdmin, async (req, res) => {
    const { actif } = req.body || {};
    try {
        await pool.query('UPDATE br_emails_autorises SET actif=$1 WHERE id=$2', [actif, req.params.id]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/br/whitelist/:id', requireBRAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM br_emails_autorises WHERE id=$1', [req.params.id]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  ADMIN — Vérifier le token (pour console.html)
// ══════════════════════════════════════════════════════════════
router.get('/api/br/me', requireBRAdmin, (req, res) => {
    res.json({ ok: true, name: req.brAdmin.name, role: req.brAdmin.role });
});

// ══════════════════════════════════════════════════════════════
//  ADMIN — Envoyer relance par email aux personnes sélectionnées
// ══════════════════════════════════════════════════════════════
router.post('/api/br/relance', requireBRAdmin, async (req, res) => {
    const { ids, message } = req.body || {};
    if (!ids?.length) return res.status(400).json({ error: 'Aucune personne sélectionnée' });
    try {
        const nodemailer = require('nodemailer');
        const tr = nodemailer.createTransport({
            host:   process.env.NC_SMTP_HOST   || 'ssl0.ovh.net',
            port:   parseInt(process.env.NC_SMTP_PORT || '465'),
            secure: process.env.NC_SMTP_SECURE !== 'false',
            auth: { user: process.env.NC_SMTP_USER, pass: process.env.NC_SMTP_PASS }
        });
        const from = process.env.NC_SMTP_FROM || process.env.NC_SMTP_USER;
        const { rows } = await pool.query(
            'SELECT id,email,nom,prenom FROM br_emails_autorises WHERE id = ANY($1) AND actif=true',
            [ids]
        );
        const lienModule = process.env.BR_URL || 'https://formation-sav.fr/BR/';
        let sent = 0, errors = [];
        for (const p of rows) {
            const prenom = p.prenom || '';
            const textePerso = message?.trim() || '';
            try {
                await tr.sendMail({
                    from, to: p.email,
                    subject: '[Formation Muller] Rappel — Module Sécurité Électrique BR',
                    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
<div style="background:#1a0e00;border-bottom:3px solid #f5a623;padding:18px 24px">
  <h2 style="color:#f5a623;margin:0;font-size:1rem">⚡ Rappel — Module Sécurité Électrique BR</h2>
  <p style="color:#888;margin:4px 0 0;font-size:0.82rem">Muller Automotive — Pôle Formation</p>
</div>
<div style="padding:22px 24px;border:1px solid #eee;border-top:none">
  <p style="font-size:0.9rem">Bonjour <strong>${prenom}</strong>,</p>
  ${textePerso ? `<div style="background:#fff8e1;border-left:4px solid #f5a623;padding:10px 14px;margin:12px 0;font-size:0.88rem;border-radius:0 6px 6px 0">${textePerso.replace(/\n/g,'<br>')}</div>` : ''}
  <p style="font-size:0.9rem">Nous vous invitons à compléter le <strong>module de rappel sécurité électrique</strong> (habilitation BR) en cliquant sur le lien ci-dessous :</p>
  <p style="margin:20px 0;text-align:center">
    <a href="${lienModule}" style="background:#f5a623;color:#1a0e00;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:0.95rem">Accéder au module →</a>
  </p>
  <p style="font-size:0.8rem;color:#888">Durée estimée : 20 à 30 minutes. Votre identifiant d'accès est votre adresse email professionnelle.</p>
</div>
<div style="background:#f5f5f5;padding:8px 24px;font-size:0.72rem;color:#aaa">Muller Automotive — Service Formation</div>
</div>`
                });
                sent++;
            } catch(e2) { errors.push(p.email + ' : ' + e2.message); }
        }
        res.json({ ok: true, sent, total: rows.length, errors });
    } catch (e) {
        console.error('[BR] relance:', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
module.exports.brPool = pool;
