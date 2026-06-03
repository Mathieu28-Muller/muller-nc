'use strict';
const express = require('express');
const XLSX = require('xlsx');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const xlsxPopulate = require('xlsx-populate');
const { PDFDocument } = require('pdf-lib');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 3003;
const DATA_DIR = path.join(__dirname, 'data');
const ARCHIVES_DIR = path.join(__dirname, 'archives');
const IMAGES_DIR = path.join(__dirname, 'public', 'images');
const DB_PATH = path.join(__dirname, 'db.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DATA_DIR),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// ──────────────────── DB ────────────────────
function readDB() { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
function writeDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

// ──────────────────── EMAIL ────────────────────
function getTransporter() {
  const cfg = readDB().config;
  if (!cfg.mdpExpediteur) return null;
  return nodemailer.createTransport({
    host: cfg.smtpHost || 'smtp.gmail.com',
    port: parseInt(cfg.smtpPort) || 587,
    secure: false,
    auth: { user: cfg.emailExpediteur, pass: cfg.mdpExpediteur }
  });
}

async function sendMailNouvelledemande(demande) {
  const transporter = getTransporter();
  if (!transporter) { console.log('[email] Pas de mot de passe SMTP configuré — email ignoré'); return; }
  const cfg = readDB().config;
  const sections = (demande.sections || []).map(s => `  - ${s.type || '?'} ${s.sousType || ''}`).join('\n');
  await transporter.sendMail({
    from: `"Certificat de Conformité" <${cfg.emailExpediteur}>`,
    to: cfg.emailQualite,
    subject: `[Nouvelle demande] ${demande.nomCentre || 'Centre inconnu'} — agrément ${demande.agrement || '?'}`,
    text: `Une nouvelle demande d'attestation de conformité a été soumise.\n\nCentre : ${demande.nomCentre || ''}\nAgrément : ${demande.agrement || ''}\nAdresse : ${demande.adresse || ''} ${demande.cp || ''} ${demande.ville || ''}\nContact : ${demande.email || ''}\n\nSections demandées :\n${sections}\n\nConsultez la console admin pour valider cette demande.\n`
  });
  console.log(`[email] Notification nouvelle demande envoyée à ${cfg.emailQualite}`);
}

async function sendMailAttestation(demande, attestations) {
  const transporter = getTransporter();
  if (!transporter) { console.log('[email] Pas de mot de passe SMTP configuré — email ignoré'); return; }
  const cfg = readDB().config;
  const dest = demande.email;
  if (!dest) { console.log('[email] Pas d\'email de contact sur la demande — envoi ignoré'); return; }

  const attachments = attestations.map(att => {
    const filePath = path.join(ARCHIVES_DIR, `${att.numero}.pdf`);
    return fs.existsSync(filePath)
      ? { filename: `attestation_${att.numero}.pdf`, path: filePath, contentType: 'application/pdf' }
      : null;
  }).filter(Boolean);

  await transporter.sendMail({
    from: `"Service Qualité Muller Automotive" <${cfg.emailExpediteur}>`,
    to: dest,
    cc: cfg.copieService ? cfg.emailQualite : undefined,
    subject: cfg.objetMailAttestation || 'Vos attestations de conformité',
    text: cfg.corpsMailAttestation || 'Veuillez trouver ci-joint vos attestations de conformité.',
    attachments
  });
  console.log(`[email] Attestation(s) envoyée(s) à ${dest}`);
}

// ──────────────────── Numérotation ────────────────────
function genNumero() {
  const db = readDB();
  const today = new Date();
  const yy = String(today.getFullYear()).slice(2);
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const key = `${yy}${mm}${dd}`;
  const idx = db.compteur[key] || 0;
  db.compteur[key] = idx + 1;
  writeDB(db);
  function toLetters(n) {
    let s = '';
    do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
  }
  return `${key}${toLetters(idx)}`;
}

// ──────────────────── Chargement Excel ────────────────────

/** Catégorise un TYPEMAT de Base_contrats en équipement VL/PL/CL */
function categorizeTypemat(typemat, numserie) {
  const t = typemat.toLowerCase();
  const sn = String(numserie || '').trim();
  if (!sn) return null;

  // Pupitre PL (Bilanmatic XG PL) — AVANT le bloc VL pour éviter faux-positif 'pupitre commande'
  if (/pxg.{0,3}pl/.test(t) || /p.mpx.{0,4}pl/.test(t) ||
      t.includes('pupitre commande + opacimetre') || t.includes('pupitre pl')) {
    return { cat: 'PL', label: 'Pupitre', materielConcerne: 'Pupitre PL', modele: typemat, numSerie: sn };
  }
  // Pupitre VL (Bilanmatic XG VL)
  if (/pup.*(xg|secu).*vl/.test(t) || /pup xg/.test(t) || /pup.*xg\//.test(t) ||
      (t.includes('pupitre commande') && !t.includes('opacimetre')) ||
      t.includes('pupitre cr') || t.includes('pupitre control') || t.includes('pupitre bois')) {
    return { cat: 'VL', label: 'Pupitre', materielConcerne: 'Pupitre VL', modele: typemat, numSerie: sn };
  }
  // Freinage VL
  if (/frein.*4t/.test(t) || /frein.*vl/.test(t) || t.includes('frein tourisme') || (/frein/.test(t) && /4kw/.test(t) && !/20t/.test(t))) {
    return { cat: 'VL', label: 'Freinage', materielConcerne: 'Freinomètre VL', modele: typemat, numSerie: sn };
  }
  // Freinage PL — inclut FRMX20T, FR.*20T, banc 20t
  if (/frein.*20t/.test(t) || /frein.*pl/.test(t) || /chassis.*frein/.test(t) ||
      /fr.{0,4}20t/.test(t) || t.includes('banc de freinage 750') || t.includes('frein p ')) {
    return { cat: 'PL', label: 'Freinage', materielConcerne: 'Freinomètre PL', modele: typemat, numSerie: sn };
  }
  // Ripage / Plaque de ripage
  if (t.includes('ripage') || t.includes('pedometre') || t.includes('pédométre') || t.includes('plaque deport') || t.includes('plaque déport')) {
    return { cat: 'VL', label: 'Plaque de ripage', materielConcerne: 'Plaque de ripage', modele: typemat, numSerie: sn };
  }
  // Suspension / Banc de suspension
  if (t.includes('susp') || t.includes('eusama') || t.includes('banc de susp')) {
    return { cat: 'VL', label: 'Banc de suspension', materielConcerne: 'Banc de suspension', modele: typemat, numSerie: sn };
  }
  // SMARTLYNX / $PRO HLT Optical Unit = Règle phare (jamais un opacimètre)
  // "$PRO HLT OPTICAL UNIT PTI L" est un telemètre optique de réglage de phares SMARTLYNX
  if (t.includes('smartlynx') || t.includes('$pro hlt') || t.includes('hlt optical') ||
      (t.includes('optical unit') && !t.includes('at6')) ||
      t.includes('n-reglephare') || t.includes('reglephare')) {
    return { cat: 'VL', label: 'Réglophare', materielConcerne: 'Réglophare', modele: typemat, numSerie: sn };
  }
  // Règle phare / Réglophare
  if (t.includes('regle phare') || t.includes('reglophare') || /cap.*26/.test(t)) {
    return { cat: 'VL', label: 'Réglophare', materielConcerne: 'Réglophare', modele: typemat, numSerie: sn };
  }
  // Analyseur de gaz (pas les interfaces/connecteurs stargas qui sont du réseau, pas du mesure)
  if (t.includes('analyseur de gaz') || t.includes('analyseur gaz') || /analyseur.*gaz/.test(t) ||
      /\bat505\b/.test(t) || /\bat555\b/.test(t)) {
    return { cat: 'VL', label: 'Analyseur de gaz', materielConcerne: 'Analyseur de gaz', modele: typemat, numSerie: sn };
  }
  // Opacimètre (at605, ecoshield optical, smoke meter…) — PAS HLT/SMARTLYNX
  if (t.includes('opacimetre') || t.includes('opacimètre') || t.includes('opacimeter') ||
      /\bat605\b/.test(t) || t.includes('smoke meter') ||
      (t.includes('optical unit') && t.includes('at6'))) {
    return { cat: 'VL', label: 'Opacimètre', materielConcerne: 'Opacimètre', modele: typemat, numSerie: sn };
  }
  // OBD / Lecteur OBD
  if (t.includes('acti-obd') || t.includes('actiobd') || /controleur obd/.test(t) || /interface.*obd/.test(t) || t.includes('iobd') || /kit.*obd/.test(t)) {
    return { cat: 'VL', label: 'Lecteur OBD', materielConcerne: 'Lecteur OBD', modele: typemat, numSerie: sn };
  }
  // Sonomètre
  if (t.includes('sonometre') || t.includes('sonomètre')) {
    return { cat: 'CL', label: 'Sonomètre', materielConcerne: 'Sonomètre', modele: typemat, numSerie: sn };
  }
  // Céléromètre (banc célérométre, CEL.50…)
  if (t.includes('celerometre') || t.includes('céléromètre') || t.includes('celero') || t.includes('banc celerometre') || t.includes('cel.')) {
    return { cat: 'CL', label: 'Céléromètre', materielConcerne: 'Céléromètre', modele: typemat, numSerie: sn };
  }
  // Calibreur (pour Classe L : utilisé avec le céléromètre)
  if (t.includes('calibreur') || t.includes('calibrateur') || t.includes('pistolet') && t.includes('calibr')) {
    return { cat: 'CL', label: 'Calibreur', materielConcerne: 'Calibreur', modele: typemat, numSerie: sn };
  }
  // Décéléromètre
  if (t.includes('decelerom') || t.includes('autostop')) {
    const isMini = t.includes('mini');
    return { cat: 'VL', label: 'Décéléromètre', materielConcerne: isMini ? 'Décéléromètre Mini' : 'Décéléromètre Maxi', modele: typemat, numSerie: sn };
  }
  return null;
}

/**
 * Détermine si un analyseur de gaz ACTIGAS relève du certificat SK18 ou SK08.
 * Format SN : "NNN/YY" (ex: 164/17, 101/18, 192/18, 045/22)
 * SK08 : année < 18,  OU  (année = 18 ET numéro ≤ 100)
 * SK18 : (année = 18 ET numéro ≥ 101),  OU  année > 18
 */
function isAgSK18(sn) {
  const m = String(sn || '').match(/^(\d+)\/(\d{2})$/);
  if (!m) return false;
  const num  = parseInt(m[1], 10);
  const year = parseInt(m[2], 10);
  if (year < 18) return false;
  if (year > 18) return true;
  return num >= 101; // year = 18
}

// Chemin du fichier d'historique OTCLAN cumulatif
const OTCLAN_HISTORY_PATH = path.join(DATA_DIR, 'otclan_history.json');

/**
 * Charge l'historique OTCLAN cumulatif (JSON persisté sur disque).
 * Clé = "agrement|materielConcerne|numSerie"
 * Retourne { VL: {}, PL: {}, CL: {} }
 */
function loadOtclanHistory() {
  try {
    if (fs.existsSync(OTCLAN_HISTORY_PATH)) {
      return JSON.parse(fs.readFileSync(OTCLAN_HISTORY_PATH, 'utf8'));
    }
  } catch (e) { console.warn('Historique OTCLAN illisible, reconstruction:', e.message); }
  return { VL: {}, PL: {}, CL: {} };
}

/**
 * Fusionne les données fraîches (depuis Excel) dans l'historique.
 * Règles :
 *   - Nouvelle clé → ajout avec lastUpdated = today
 *   - Clé existante → mise à jour des champs modifiés (version, cert…) + lastUpdated
 *   - Clé absente du nouvel Excel → conservation sans modification (équip. hors ligne)
 * Sauvegarde l'historique mis à jour sur disque.
 */
function mergeIntoHistory(history, type, freshMats) {
  const today = new Date().toISOString().slice(0, 10);
  const bucket = history[type] || (history[type] = {});
  for (const mat of freshMats) {
    const key = `${mat.agrement}|${mat.materielConcerne}|${mat.numSerie}`;
    const existing = bucket[key];
    if (!existing) {
      bucket[key] = { ...mat, lastUpdated: today, firstSeen: today };
    } else {
      // Mettre à jour les champs qui ont changé (jamais effacer un champ renseigné par un vide)
      const updated = { ...existing, lastUpdated: today };
      if (mat.versionLog)      updated.versionLog      = mat.versionLog;
      if (mat.versionProtocole) updated.versionProtocole = mat.versionProtocole;
      if (mat.certOtclan)      updated.certOtclan      = mat.certOtclan;
      if (mat.certQualif)      updated.certQualif      = mat.certQualif;
      if (mat.modele)          updated.modele          = mat.modele;
      if (mat.marque)          updated.marque          = mat.marque;
      // Matériel concerné peut changer si OTCLAN corrige une classification
      updated.materielConcerne = mat.materielConcerne || existing.materielConcerne;
      bucket[key] = updated;
    }
  }
  return bucket;
}

function saveOtclanHistory(history) {
  try {
    fs.writeFileSync(OTCLAN_HISTORY_PATH, JSON.stringify(history, null, 2));
  } catch (e) { console.error('Erreur sauvegarde historique OTCLAN:', e.message); }
}

function loadExcelData() {
  const clients = {};         // key: compteClt
  const agrement2clt = {};    // key: agrément → compteClt (premier trouvé)
  const clt2agrement = {};    // key: compteClt → [agréments]
  const otclanData = { VL: [], PL: [], CL: [] };
  const cltEquipements = {};  // key: compteClt → [{...}]
  const agrEquipements = {};  // key: agrément  → [{...}]  (depuis correspondance)

  // 1. Base_contrats.xlsx
  try {
    const wb = XLSX.readFile(path.join(DATA_DIR, 'Base_contrats.xlsx'));
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[0]) continue;
      const clt = String(r[0]).trim();
      if (!clients[clt]) {
        clients[clt] = { compteClt: clt, numContrat: '', type: '', nom: '', adresse: '', cp: '', ville: '', tel: '', email: '', agrement: '' };
      }
      clients[clt].numContrat = r[1] || '';
      clients[clt].type = r[2] || '';
      if (!clients[clt].nom && r[3]) clients[clt].nom = String(r[3]).trim();
      if (!clients[clt].adresse && r[4]) clients[clt].adresse = String(r[4]).trim();
      if (!clients[clt].cp && r[5]) clients[clt].cp = String(r[5]).trim();
      if (!clients[clt].ville && r[6]) clients[clt].ville = String(r[6]).trim();
      if (!clients[clt].tel && r[7]) clients[clt].tel = String(r[7]).trim();

      // Collecter équipements (TYPEMAT r[11] + NUMSERIE r[12])
      const typemat = String(r[11] || '').trim();
      const numserie = String(r[12] || '').trim();
      if (typemat && numserie) {
        const eq = categorizeTypemat(typemat, numserie);
        if (eq) {
          if (!cltEquipements[clt]) cltEquipements[clt] = [];
          cltEquipements[clt].push(eq);
        }
      }
    }
  } catch (e) { console.error('Base_contrats:', e.message); }

  // 2. Correspondance compte client – N° agrément
  try {
    const wb = XLSX.readFile(path.join(DATA_DIR, 'correspondance compte client - n° agrément.xlsx'));
    // Lire toutes les feuilles
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r) continue;
        const agr = String(r[0] || '').trim();
        const clt = String(r[1] || '').trim();
        if (!agr || !clt) continue;

        // Créer client si inconnu
        if (!clients[clt]) {
          clients[clt] = {
            compteClt: clt, numContrat: '', type: '', agrement: agr,
            nom: String(r[2] || '').trim(),
            adresse: String(r[3] || '').trim(),
            cp: String(r[4] || '').trim(),
            ville: String(r[5] || '').trim(),
            tel: String(r[6] || '').trim(),
            email: ''
          };
        }

        // Lier agrément
        if (!clients[clt].agrement) clients[clt].agrement = agr;
        if (!agrement2clt[agr]) agrement2clt[agr] = clt;
        if (!clt2agrement[clt]) clt2agrement[clt] = [];
        if (!clt2agrement[clt].includes(agr)) clt2agrement[clt].push(agr);

        // Compléter nom/adresse si vide
        if (!clients[clt].nom && r[2]) clients[clt].nom = String(r[2]).trim();
        if (!clients[clt].adresse && r[3]) clients[clt].adresse = String(r[3]).trim();
        if (!clients[clt].cp && r[4]) clients[clt].cp = String(r[4]).trim();
        if (!clients[clt].ville && r[5]) clients[clt].ville = String(r[5]).trim();
        if (!clients[clt].tel && r[6]) clients[clt].tel = String(r[6]).trim();

        // Collecter équipements depuis correspondance (r[8]=Description article, r[9]=N° de série)
        // Uniquement si la ligne a un agrément valide (col 0 non vide = ligne équipement)
        if (agr) {
          const typemat = String(r[8] || '').trim();
          const numserie = String(r[9] || '').trim();
          if (typemat && numserie) {
            const eq = categorizeTypemat(typemat, numserie);
            if (eq) {
              // Indexé par agrément
              if (!agrEquipements[agr]) agrEquipements[agr] = [];
              const already = agrEquipements[agr].some(e => e.numSerie === eq.numSerie && e.materielConcerne === eq.materielConcerne);
              if (!already) agrEquipements[agr].push(eq);
              // Aussi par NUMCLT pour retrouver via compteClt
              if (clt) {
                if (!cltEquipements[clt]) cltEquipements[clt] = [];
                const alreadyClt = cltEquipements[clt].some(e => e.numSerie === eq.numSerie && e.materielConcerne === eq.materielConcerne);
                if (!alreadyClt) cltEquipements[clt].push(eq);
              }
            }
          }
        }
      }
    }
  } catch (e) { console.error('Correspondance:', e.message); }

  // 3. Suivi OTCLAN
  const otclanFiles = [
    { file: 'suivi_otclan_vl_30MAR2026_actiamuller.xlsx', type: 'VL' },
    { file: 'suivi_otclan_pl_30MAR2026_actiamuller.xlsx', type: 'PL' },
    { file: 'suivi_otclan_cl_30MAR2026_actiamuller.xlsx', type: 'CL' }
  ];

  for (const { file, type } of otclanFiles) {
    // Trouver le fichier (peut avoir une date différente)
    const dir = fs.readdirSync(DATA_DIR);
    const found = dir.find(f => f.startsWith(`suivi_otclan_${type.toLowerCase()}_`) && f.endsWith('.xlsx'))
                 || dir.find(f => f === file);
    if (!found) { console.warn(`OTCLAN ${type}: fichier non trouvé`); continue; }

    try {
      const wb = XLSX.readFile(path.join(DATA_DIR, found));
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // Trouver la ligne d'entête (contient "Agrément du centre")
      let headerIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i] && rows[i].some(c => String(c || '').includes('Agrément du centre'))) {
          headerIdx = i; break;
        }
      }
      if (headerIdx < 0) { console.warn(`OTCLAN ${type}: entête non trouvé`); continue; }

      const headers = rows[headerIdx].map(h => String(h || '').trim());

      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[0]) continue;
        const agr = String(r[0]).trim();
        const obj = {};
        headers.forEach((h, idx) => { if (h) obj[h] = r[idx]; });

        const mat = {
          agrement: agr,
          modele: String(obj['Type du matériel'] || '').trim(),
          numSerie: String(obj['N° de série du matériel'] || '').trim(),
          versionLog: String(obj['Version logicielle'] || '').trim(),
          versionProtocole: String(obj['Version protocole'] || obj['Version du protocole'] || '').trim(),
          materielConcerne: String(obj['Matériel concerné'] || '').trim(),
          certOtclan: String(obj['N° de certificat OTC-LAN'] || '').trim(),
          certQualif: String(obj["N° du certificat de qualification"] || '').trim(),
          marque: String(obj['Marque'] || '').trim()
        };
        if (!mat.agrement || !mat.numSerie) continue;

        // Correction de classification OTCLAN : $PRO HLT Optical Unit = Règle phare SMARTLYNX
        // (l'OTCLAN peut classer ces appareils comme "Opacimètre" par erreur)
        const modLow = mat.modele.toLowerCase();
        if (mat.materielConcerne === 'Opacimètre' &&
            (modLow.includes('hlt') || modLow.includes('smartlynx') ||
             (modLow.includes('optical unit') && !modLow.includes('at6')))) {
          mat.materielConcerne = 'Réglophare';
        }

        otclanData[type].push(mat);

        // Enrichir clients avec agrément
        const cltKey = agrement2clt[agr];
        if (cltKey && clients[cltKey] && !clients[cltKey].agrement) {
          clients[cltKey].agrement = agr;
        }
      }
    } catch (e) { console.error(`OTCLAN ${type}:`, e.message); }
  }

  // ── Historique cumulatif OTCLAN ──
  // Fusionner les nouvelles données Excel dans l'historique, puis utiliser l'historique
  // (garantit qu'un équipement absent du dernier fichier Excel n'est pas perdu)
  const history = loadOtclanHistory();
  for (const type of ['VL', 'PL', 'CL']) {
    mergeIntoHistory(history, type, otclanData[type]);
    // Remplacer otclanData par la vue historique complète (tableau de valeurs)
    otclanData[type] = Object.values(history[type] || {});
  }
  saveOtclanHistory(history);

  // Maps de croisement VL/PL ↔ CL :
  // 1. certOtclan → mats CL (méthode principale : même numéro de certificat entre VL et CL)
  const certOtclanToCLMats = {};
  for (const mat of otclanData.CL) {
    if (mat.certOtclan) {
      if (!certOtclanToCLMats[mat.certOtclan]) certOtclanToCLMats[mat.certOtclan] = [];
      certOtclanToCLMats[mat.certOtclan].push(mat);
    }
  }
  // 2. N° de série → mats CL (fallback : même SN physique dans VL et CL)
  const snToCLMats = {};
  for (const mat of otclanData.CL) {
    if (mat.numSerie) {
      if (!snToCLMats[mat.numSerie]) snToCLMats[mat.numSerie] = [];
      snToCLMats[mat.numSerie].push(mat);
    }
  }

  console.log(`Données chargées : ${Object.keys(clients).length} clients, OTCLAN VL:${otclanData.VL.length} PL:${otclanData.PL.length} CL:${otclanData.CL.length}, équip.contrats:${Object.keys(cltEquipements).length}, équip.agr:${Object.keys(agrEquipements).length}`);
  return { clients, agrement2clt, clt2agrement, otclanData, cltEquipements, agrEquipements, certOtclanToCLMats, snToCLMats };
}

let cachedData = null;
function getData() { if (!cachedData) cachedData = loadExcelData(); return cachedData; }
function reloadData() { cachedData = loadExcelData(); return cachedData; }

// Trouver les équipements OTCLAN pour un agrément donné
function getEquipementsForAgrement(agr, otclanData) {
  const eq = { VL: [], PL: [], CL: [] };
  for (const type of ['VL', 'PL', 'CL']) {
    for (const mat of otclanData[type]) {
      if (mat.agrement === agr) eq[type].push(mat);
    }
  }
  return eq;
}

// ──────────────────── API ────────────────────

app.post('/api/login', (req, res) => {
  const { login, mdp } = req.body;
  const db = readDB();
  const compte = db.comptes.find(c => c.login === login && c.mdp === mdp);
  if (!compte) return res.status(401).json({ error: 'Identifiants incorrects' });
  res.json({ ok: true, role: compte.role, nom: compte.nom, login: compte.login });
});

app.get('/api/search', (req, res) => {
  const raw = String(req.query.q || '').trim().toLowerCase();
  if (raw.length < 2) return res.json([]);
  // Support multi-mots : tous les mots doivent matcher (dans n'importe quel champ)
  const words = raw.split(/\s+/).filter(Boolean);
  const { clients, agrement2clt, otclanData } = getData();
  const results = [];
  const seen = new Set();

  // Chercher dans clients
  for (const [key, c] of Object.entries(clients)) {
    const nom    = String(c.nom || '').toLowerCase();
    const agr    = String(c.agrement || '').toLowerCase();
    const clt    = String(c.compteClt || '').toLowerCase();
    const ville  = String(c.ville || '').toLowerCase();
    const adresse = String(c.adresse || '').toLowerCase();
    const fields = [nom, agr, clt, ville, adresse];
    // Tous les mots de la recherche doivent être trouvés dans au moins un champ
    const matchAll = words.every(w => fields.some(f => f.includes(w)));
    if (matchAll) {
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ compteClt: c.compteClt, nom: c.nom, agrement: c.agrement, ville: c.ville, cp: c.cp, tel: c.tel, email: c.email });
      }
    }
    if (results.length >= 25) break;
  }

  // Chercher agréments OTCLAN non liés
  if (results.length < 25) {
    const seenAgr = new Set(results.map(r => r.agrement).filter(Boolean));
    for (const type of ['VL', 'PL', 'CL']) {
      for (const mat of otclanData[type]) {
        const agr = mat.agrement;
        if (!agr || seenAgr.has(agr)) continue;
        if (words.every(w => agr.toLowerCase().includes(w))) {
          seenAgr.add(agr);
          const cltKey = agrement2clt[agr];
          if (cltKey && clients[cltKey]) {
            if (!seen.has(cltKey)) {
              seen.add(cltKey);
              const c = clients[cltKey];
              results.push({ compteClt: c.compteClt, nom: c.nom, agrement: agr, ville: c.ville });
            }
          } else {
            results.push({ compteClt: '', nom: '', agrement: agr, ville: '' });
          }
        }
        if (results.length >= 25) break;
      }
      if (results.length >= 25) break;
    }
  }

  res.json(results.slice(0, 25));
});

app.get('/api/client/:id', (req, res) => {
  const id = decodeURIComponent(req.params.id);
  const { clients, agrement2clt, clt2agrement, otclanData, cltEquipements, agrEquipements, certOtclanToCLMats, snToCLMats } = getData();

  let client = clients[id];
  if (!client) {
    const cltKey = agrement2clt[id];
    if (cltKey) client = clients[cltKey];
  }
  if (!client) {
    client = { agrement: id, nom: '', compteClt: '', adresse: '', cp: '', ville: '', tel: '', email: '' };
  }

  // Récupérer tous les agréments liés à ce client
  const agrs = [];
  if (client.agrement) agrs.push(client.agrement);
  const extras = clt2agrement[client.compteClt] || [];
  for (const a of extras) { if (!agrs.includes(a)) agrs.push(a); }

  // Equipements OTCLAN (par agrément)
  const equipements = { VL: [], PL: [], CL: [] };
  for (const agr of agrs) {
    const eq = getEquipementsForAgrement(agr, otclanData);
    for (const type of ['VL', 'PL', 'CL']) {
      for (const mat of eq[type]) {
        const exists = equipements[type].some(m => m.materielConcerne === mat.materielConcerne && m.numSerie === mat.numSerie);
        if (!exists) equipements[type].push(mat);
      }
    }
  }

  // Merger les équipements des contrats (Base_contrats + correspondance)
  // Règle : correspondance/Base_contrats → SN physique fiable ; OTCLAN → version logicielle
  // → Si même type déjà présent via OTCLAN : SN du contrat + version OTCLAN conservée
  // → Sinon : ajouter l'entrée contrat
  const normMC = s => String(s || '').trim().toLowerCase();

  // Collecter tous les équipements contrats : par NUMCLT ET par chaque agrément lié
  const allContratEqs = [];
  const seenContratKeys = new Set();
  const addContratEq = (eq) => {
    const key = `${eq.cat}|${eq.materielConcerne}|${eq.numSerie}`;
    if (!seenContratKeys.has(key)) { seenContratKeys.add(key); allContratEqs.push(eq); }
  };
  for (const eq of (cltEquipements[client.compteClt] || [])) addContratEq(eq);
  for (const agr of agrs) {
    for (const eq of (agrEquipements[agr] || [])) addContratEq(eq);
  }

  for (const eq of allContratEqs) {
    const cat = eq.cat;
    if (!equipements[cat]) continue;
    const existIdx = equipements[cat].findIndex(m => normMC(m.materielConcerne) === normMC(eq.materielConcerne));
    if (existIdx >= 0) {
      const existing = equipements[cat][existIdx];
      // Préférer le SN du contrat (plus fiable physiquement)
      // Préférer le modèle le plus descriptif : si l'entrée contrat a un modèle meilleur, l'utiliser
      // Préférer la version OTCLAN (jamais écraser une version par vide)
      equipements[cat][existIdx] = {
        ...existing,
        numSerie: eq.numSerie || existing.numSerie,
        modele: eq.modele || existing.modele,
        versionLog: existing.versionLog || eq.versionLog || ''
      };
    } else {
      equipements[cat].push({ ...eq, source: 'contrats' });
    }
  }

  // ── Croisement VL/PL → CL via N° de série ──
  // Les agréments CL (L-type) ne sont PAS dans la correspondance ni dans Base_contrats.
  // Seuls les équipements POLLUTION (AG, OPA, OBD) sont physiquement partagés entre un
  // centre CT (VL/PL) et son agrément CL : l'analyseur AT505, l'opacimètre AT605, le
  // lecteur OBD sont référencés dans les deux fichiers OTCLAN avec le MÊME N° de série.
  // → On n'utilise QUE ces types pour le croisement, afin d'éviter les faux positifs
  //   (SN simples comme 146, 771, 381 qui coïncident avec des céléromètres d'autres centres).
  const POLLUTION_LINK_TYPES = ['analyseur', 'gaz', 'opaci', 'obd', 'lecteur'];
  const linkedCLAgrements = new Set();
  for (const type of ['VL', 'PL']) {
    for (const mat of equipements[type]) {
      const mc = (mat.materielConcerne || '').toLowerCase();
      // Filtrage strict : seuls les équipements pollution peuvent être partagés CT↔CL
      if (!POLLUTION_LINK_TYPES.some(k => mc.includes(k))) continue;
      if (mat.numSerie && snToCLMats[mat.numSerie]) {
        for (const clMat of snToCLMats[mat.numSerie]) {
          linkedCLAgrements.add(clMat.agrement);
        }
      }
    }
  }

  // Charger tous les équipements des agréments CL liés (Sonomètre, Céléromètre, Calibreur…)
  const addedCLKeys = new Set(equipements.CL.map(m => `${m.numSerie}|${m.materielConcerne}`));
  for (const clAgr of linkedCLAgrements) {
    for (const mat of otclanData.CL) {
      if (mat.agrement !== clAgr) continue;
      const key = `${mat.numSerie}|${mat.materielConcerne}`;
      if (addedCLKeys.has(key)) {
        // Enrichir l'entrée existante (ex : contrats) avec certOtclan OTCLAN
        const idx = equipements.CL.findIndex(m => m.numSerie === mat.numSerie && m.materielConcerne === mat.materielConcerne);
        if (idx >= 0 && mat.certOtclan && !equipements.CL[idx].certOtclan) {
          equipements.CL[idx] = { ...equipements.CL[idx], certOtclan: mat.certOtclan, certQualif: mat.certQualif || '', versionLog: equipements.CL[idx].versionLog || mat.versionLog || '', versionProtocole: mat.versionProtocole || '', clAgrement: clAgr };
        }
      } else {
        addedCLKeys.add(key);
        equipements.CL.push({ ...mat, source: 'otclan-cl', clAgrement: clAgr });
      }
    }
  }

  // ── Groupes de certificats (pour détection combinée pollution + CL) ──
  const certGroupsMap = {};
  for (const type of ['VL', 'PL', 'CL']) {
    for (const mat of equipements[type]) {
      if (!mat.certOtclan) continue;
      if (!certGroupsMap[mat.certOtclan]) {
        certGroupsMap[mat.certOtclan] = {
          certOtclan: mat.certOtclan,
          certQualif: mat.certQualif || '',
          versionProtocole: mat.versionProtocole || '',
          materiels: []
        };
      }
      certGroupsMap[mat.certOtclan].materiels.push({ ...mat, equipType: type });
    }
  }
  const certGroups = Object.values(certGroupsMap);

  res.json({ ...client, equipements, certGroups });
});

app.post('/api/demandes', async (req, res) => {
  const db = readDB();
  const demande = { id: Date.now().toString(), createdAt: new Date().toISOString(), status: 'en_attente', ...req.body };
  db.demandes.push(demande);
  writeDB(db);
  res.json({ ok: true, id: demande.id });
  sendMailNouvelledemande(demande).catch(e => console.error('[email] Erreur notification:', e.message));
});

/** Retourne les feuilles alternatives disponibles pour un type de section donné */
function getAlternatives(section) {
  const type = section.type;
  const st   = String(section.sousType || '').toUpperCase();

  if (type === 'ct' && st === 'VL') {
    return [
      'XG 2', 'XG 2-4', 'XG 2-5', 'XG 2-6', 'XG 2-7',
      'XG VL+ 2-2', 'XG VL+ 2-4', 'XG VL+ 2-5',
      'XG UPG 2-4', 'XG UPG 2-5',
      'FOG VL', 'FOG VL+'
    ];
  }
  if (type === 'ct' && st === 'PL') {
    return [
      'XG PL 1-4', 'XG PL 1-5',
      'XG PL 4-1', 'XG PL 4-1-1',
      'XG PL 4-2-2', 'XG PL 4-2-3',
      'XG PL 4-3-2', 'XG PL 4-3-3',
      'XG PL 5-1', '10000MX PL 1-2'
    ];
  }
  if (type === 'reglophare') return ['RPH 4-1', 'RPH 5', 'RPH 6'];
  if (type === 'pollution') {
    if (st === 'ACTIGAS')     return ['AG OPA OBD C6 SK08', 'AG OPA OBD 6C SK18'];
    if (st === 'ACTIGAS_OPA') return ['OPA OBD C6 SK08', 'OPA OBD 6C SK18'];
    if (st === 'ECOSHIELD')   return ['ECOOPAOBD'];
    if (st === 'ECOPOL')      return ['ECOPOL'];
    // fallback : toutes les feuilles pollution actives
    return ['AG OPA OBD C6 SK08','AG OPA OBD 6C SK18','OPA OBD C6 SK08','OPA OBD 6C SK18','ECOOPAOBD','ECOPOL'];
  }
  if (type === 'classeL') {
    const hasSono   = st.includes('SONO');
    const hasCelero = st.includes('CELERO') || st.includes('CELER');
    if (hasCelero && !hasSono) return ['0231SEUL', 'CELERODISTANCE'];
    // Sonomètre seul : toutes les variantes selon le certOtclan et la version (LAN4=SONO, LAN5=LAN5)
    if (!hasCelero && hasSono) return [
      '0225SONO','0225LAN5',           // cert 0225 LAN4 / LAN5
      '0226LAN5','0227LAN5','0223LAN5' // certs combinés pollution+sono
    ];
    // Sonomètre + céléromètre
    if (hasCelero && hasSono)  return [
      '0225SONOCELERO',
      '0223CELERO','0226CELERO','0227CELERO'
    ];
    return ['0231SEUL','CELERODISTANCE','0225SONO','0225LAN5','0225SONOCELERO'];
  }
  if (type === 'decelero') return ['DECELERO MAXI', 'DECELERO MINI+'];
  if (type === 'paj')      return ['PAJ'];
  return [];
}

/** Endpoint : calcule la feuille prévue et les alternatives pour chaque section */
app.post('/api/preview-sheets', (req, res) => {
  const sections = req.body.sections || [];
  const result = sections.map(s => {
    const computed    = s.sheetOverride || getSheetName(s) || '';
    const alts        = getAlternatives(s);
    // S'assurer que la feuille calculée est dans la liste
    const alternatives = alts.includes(computed) ? alts : (computed ? [computed, ...alts] : alts);
    return { computed, alternatives };
  });
  res.json(result);
});

app.get('/api/demandes', (req, res) => {
  const db = readDB();
  const { status } = req.query;
  let list = db.demandes;
  if (status) list = list.filter(d => d.status === status);
  res.json(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

app.post('/api/demandes/:id/valider', async (req, res) => {
  const db = readDB();
  const idx = db.demandes.findIndex(d => d.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Non trouvé' });
  const demande = db.demandes[idx];

  const allSections = demande.sections || [];
  if (!allSections.length) return res.status(400).json({ error: 'Aucune section' });

  // Filtrer les sections à traiter selon la sélection de l'admin
  // sectionIndexes = tableau des indices à valider (absent = toutes)
  const selectedIndexes = Array.isArray(req.body.sectionIndexes)
    ? req.body.sectionIndexes.map(Number)
    : allSections.map((_, i) => i);

  // Sections déjà attestées (ne pas régénérer)
  const existingAttestations = demande.attestations || [];
  const alreadyDone = new Set(existingAttestations.map(a => a.sectionIndex));

  // Sections à générer = sélectionnées ET pas encore attestées
  const toGenerate = selectedIndexes.filter(i => !alreadyDone.has(i));

  if (!toGenerate.length) {
    // Tout est déjà généré pour ces sections — retourner l'existant
    return res.json({ ok: true, attestations: existingAttestations, numero: existingAttestations[0]?.numero, nouvelles: [] });
  }

  try {
    const nouvelles = [];

    for (const i of toGenerate) {
      const section = allSections[i];
      if (!section) continue;
      const numero = genNumero();
      const pdfPath = path.join(ARCHIVES_DIR, `${numero}.pdf`);
      await generateOnePDF(demande, section, numero, pdfPath);
      nouvelles.push({ numero, pdfUrl: `/certificat-conformite/api/archives/${numero}.pdf`, sectionIndex: i });
    }

    const toutesAttestations = [...existingAttestations, ...nouvelles];

    // Re-lire db après génération (genNumero() a pu modifier le compteur)
    const db2 = readDB();
    const idx2 = db2.demandes.findIndex(d => d.id === req.params.id);
    if (idx2 >= 0) {
      db2.demandes[idx2].status       = 'validee';
      db2.demandes[idx2].attestations = toutesAttestations;
      db2.demandes[idx2].numero       = toutesAttestations[0].numero; // compat
      if (!db2.demandes[idx2].valideeAt) db2.demandes[idx2].valideeAt = new Date().toISOString();
      db2.demandes[idx2].envoyeeAt    = new Date().toISOString();
      writeDB(db2);
    }

    res.json({ ok: true, attestations: toutesAttestations, numero: toutesAttestations[0].numero, nouvelles });
    sendMailAttestation(demande, nouvelles).catch(e => console.error('[email] Erreur envoi attestation:', e.message));
  } catch (e) {
    console.error('PDF error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/demandes/:id/non-conforme', (req, res) => {
  const db = readDB();
  const idx = db.demandes.findIndex(d => d.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Non trouvé' });
  db.demandes[idx].status = 'non_conforme';
  db.demandes[idx].raisonNC = req.body.raison || '';
  writeDB(db);
  res.json({ ok: true });
});

app.put('/api/demandes/:id', (req, res) => {
  const db = readDB();
  const idx = db.demandes.findIndex(d => d.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Non trouvé' });
  db.demandes[idx] = { ...db.demandes[idx], ...req.body };
  writeDB(db);
  res.json({ ok: true });
});

app.get('/api/archives/:filename', (req, res) => {
  const file = path.join(ARCHIVES_DIR, req.params.filename);
  if (!fs.existsSync(file)) return res.status(404).send('Non trouvé');
  res.download(file);
});

app.get('/api/archives', (req, res) => {
  const db = readDB();
  const q = String(req.query.q || '').toLowerCase();
  let list = db.demandes.filter(d => d.numero);
  if (q) {
    list = list.filter(d => {
      return [d.nomCentre, d.numero, d.agrement, d.compteClt].some(v => String(v || '').toLowerCase().includes(q));
    });
  }
  res.json(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

app.get('/api/stats', (req, res) => {
  const db = readDB();
  const validated = db.demandes.filter(d => d.status === 'validee' && d.valideeAt);
  // Total de certificats (chaque demande peut contenir plusieurs sections = plusieurs PDFs)
  const totalCerts = validated.reduce((sum, d) => sum + ((d.attestations || []).length || 1), 0);
  // Ventilation par année
  const byYear = {};
  for (const d of validated) {
    const year = d.valideeAt.slice(0, 4);
    const nb   = (d.attestations || []).length || 1;
    byYear[year] = (byYear[year] || 0) + nb;
  }
  res.json({ total: totalCerts, byYear });
});

app.post('/api/upload', upload.single('fichier'), (req, res) => {
  reloadData();
  res.json({ ok: true, fichier: req.file.originalname });
});

/**
 * Confirme le remplacement d'un matériel : ancien SN → nouveau SN
 * Met à jour l'historique OTCLAN (supprime l'ancien, crée le nouveau)
 * Appelé depuis le formulaire quand l'utilisateur confirme un changement de N° de série
 */
app.post('/api/equipement/replace-sn', (req, res) => {
  const { agrement, materielConcerne, oldSN, newSN, newModele } = req.body;
  if (!agrement || !materielConcerne || !oldSN || !newSN) {
    return res.status(400).json({ error: 'Paramètres requis : agrement, materielConcerne, oldSN, newSN' });
  }
  if (oldSN.trim() === newSN.trim()) {
    return res.json({ ok: true, changed: false, message: 'Aucun changement de N° de série' });
  }

  const history = loadOtclanHistory();
  const today   = new Date().toISOString().slice(0, 10);
  let found = false;

  for (const type of ['VL', 'PL', 'CL']) {
    const bucket = history[type] || {};
    const oldKey = `${agrement}|${materielConcerne}|${oldSN.trim()}`;
    if (bucket[oldKey]) {
      const entry = { ...bucket[oldKey] };
      const newKey = `${agrement}|${materielConcerne}|${newSN.trim()}`;
      // Créer la nouvelle entrée avec le nouveau SN
      bucket[newKey] = {
        ...entry,
        numSerie:    newSN.trim(),
        modele:      newModele ? newModele.trim() : entry.modele,
        lastUpdated: today,
        replacedFrom: oldSN.trim()  // traçabilité
      };
      // Supprimer l'ancienne entrée (remplacement confirmé par l'utilisateur)
      delete bucket[oldKey];
      history[type] = bucket;
      found = true;
      console.log(`[remplacement] ${agrement} ${materielConcerne}: ${oldSN} → ${newSN}`);
      break;
    }
  }

  if (found) {
    saveOtclanHistory(history);
    cachedData = null; // forcer rechargement
  }

  res.json({ ok: true, found, message: found ? `Matériel mis à jour : ${oldSN} → ${newSN}` : 'Entrée non trouvée dans l\'historique (formulaire mis à jour)' });
});

// Scinde une section SONOCELERO (index si) en deux sections distinctes : SONOMETRE + CELEROMETRE
app.post('/api/demandes/:id/scinder-cl', (req, res) => {
  const { sectionIndex } = req.body;
  const db = readDB();
  const idx = db.demandes.findIndex(d => d.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Non trouvé' });
  const demande = db.demandes[idx];
  const si = parseInt(sectionIndex);
  const section = (demande.sections || [])[si];
  if (!section || section.sousType !== 'SONOCELERO') {
    return res.status(400).json({ error: 'Section introuvable ou déjà scindée' });
  }

  const mats = section.materiels || [];
  const sono    = mats.filter(m => ['sonomètre','calibreur'].includes((m.label||'').toLowerCase()));
  const celero  = mats.filter(m => (m.label||'').toLowerCase().includes('cél'));

  const secSono = {
    type: 'classeL', sousType: 'SONOMETRE',
    certOtclan:  section.certOtclan  || '',
    versionLog:  section.versionLog  || '',
    sonoPollution: section.sonoPollution || '',
    materiels: sono
  };
  const secCel = {
    type: 'classeL', sousType: 'CELEROMETRE',
    certOtclan: section.certOtclanCel || section.certOtclan || '',
    versionLog: celero[0]?.versionLog || '',
    materiels: celero
  };

  // Remplacer la section unique par les deux nouvelles
  const newSections = [...demande.sections];
  newSections.splice(si, 1, secSono, secCel);
  db.demandes[idx].sections = newSections;

  // Retirer les attestations liées à cette section (à régénérer)
  const oldAtts = (db.demandes[idx].attestations || []).filter(a => a.sectionIndex !== si);
  // Recalculer les sectionIndex des attestations existantes (les sections après si ont +1)
  db.demandes[idx].attestations = oldAtts.map(a => ({
    ...a,
    sectionIndex: a.sectionIndex > si ? a.sectionIndex + 1 : a.sectionIndex
  }));

  if (db.demandes[idx].status === 'validee' && !db.demandes[idx].attestations.length) {
    db.demandes[idx].status = 'en_attente';
  }

  writeDB(db);
  res.json({ ok: true, sections: db.demandes[idx].sections });
});

app.get('/api/config', (req, res) => res.json(readDB().config));
app.put('/api/config', (req, res) => {
  const db = readDB();
  db.config = { ...db.config, ...req.body };
  writeDB(db);
  res.json({ ok: true });
});

app.get('/api/comptes', (req, res) => res.json(readDB().comptes.map(c => ({ login: c.login, role: c.role, nom: c.nom }))));
app.post('/api/comptes', (req, res) => {
  const db = readDB();
  if (db.comptes.find(c => c.login === req.body.login)) return res.status(400).json({ error: 'Login déjà utilisé' });
  db.comptes.push(req.body);
  writeDB(db);
  res.json({ ok: true });
});
app.delete('/api/comptes/:login', (req, res) => {
  const db = readDB();
  db.comptes = db.comptes.filter(c => c.login !== req.params.login);
  writeDB(db);
  res.json({ ok: true });
});

// ──────────────────── GÉNÉRATION PDF – DOC-A-31 via xlsx-populate + LibreOffice ────────────────────
const XLSM_PATH = path.join(DATA_DIR, '1 - DOC-A-31 V1  MODELE ATTESTATION DE CONFORMITE.xlsm');
const SOFFICE   = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';

/** Génère un seul PDF pour une section donnée (1 section = 1 fichier = 1 numéro d'attestation) */
async function generateOnePDF(demande, section, numero, outputPath) {
  // Si classeL combiné avec pollution (sonoPollution renseigné), enrichir les matériels
  // avec ceux de la section pollution de la même demande (AG, OPA, OBD)
  if (section.type === 'classeL' && section.sonoPollution) {
    const polSection = (demande.sections || []).find(s => s.type === 'pollution');
    if (polSection && polSection.materiels?.length) {
      const existingLabels = new Set((section.materiels || []).map(m => (m.label || '').toLowerCase()));
      const merged = [...(section.materiels || [])];
      for (const mat of polSection.materiels) {
        if (!existingLabels.has((mat.label || '').toLowerCase())) {
          merged.push(mat);
        }
      }
      section = { ...section, materiels: merged };
    }
  }

  // sheetOverride permet à l'admin de forcer une feuille précise via le menu déroulant
  const sheetName = section.sheetOverride || getSheetName(section);
  if (!sheetName) throw new Error(`Type de section inconnu : ${section.type}/${section.sousType}`);

  const wb = await xlsxPopulate.fromFileAsync(XLSM_PATH);
  const sheet = wb.sheet(sheetName);
  if (!sheet) throw new Error(`Feuille non trouvée dans le modèle : ${sheetName}`);

  // 1. Infos client (remplace les VLOOKUP par des valeurs brutes)
  fillClientInfo(sheet, sheetName, demande);

  // 2. N° attestation
  fillNumero(sheet, sheetName, numero);

  // 3. N/Réf (C13 = agrément ou compteClt)
  sheet.cell('C13').value(demande.agrement || demande.compteClt || '');

  // 4. Numéros de série des matériels
  fillEquipements(sheet, sheetName, section);

  // 5. Supprimer toutes les autres feuilles → PDF 1 page
  for (const s of wb.sheets()) {
    if (s.name() !== sheetName) {
      try { wb.deleteSheet(s.name()); } catch (_) {}
    }
  }

  // 6. Sauvegarder en XLSX temporaire
  const tempXlsx = path.join(ARCHIVES_DIR, `_tmp_${numero}.xlsx`);
  await wb.toFileAsync(tempXlsx);

  // 7. Convertir en PDF via LibreOffice
  const result = spawnSync('powershell.exe', [
    '-Command',
    `& '${SOFFICE}' --headless --convert-to pdf --outdir '${ARCHIVES_DIR}' '${tempXlsx}'`
  ], { timeout: 90000 });

  try { fs.unlinkSync(tempXlsx); } catch (_) {}

  if (result.status !== 0) {
    const errMsg = result.stderr ? result.stderr.toString() : 'inconnu';
    throw new Error(`LibreOffice a échoué (code ${result.status}) : ${errMsg}`);
  }

  const tempPdf = path.join(ARCHIVES_DIR, `_tmp_${numero}.pdf`);
  if (!fs.existsSync(tempPdf)) throw new Error(`PDF temporaire introuvable : ${tempPdf}`);
  fs.renameSync(tempPdf, outputPath);
}

// ──────────────────── Helpers génération ────────────────────

/**
 * Sélectionne la feuille XG VL selon le modèle du frein et la version logicielle.
 * Source : "Liste modèles attestations" du DOC-A-31
 *   Frein 43300 → XG standard  : XG 2 / XG 2-4 / XG 2-5
 *   Frein 43350 → XG VL+       : XG VL+ 2-2 / 2-4 / 2-5
 *   Frein 43800 → XG 2-6 (modèle récent, v1.1.2.5)
 *   Frein 43850 → XG 2-7 (modèle récent, v1.1.2.5)
 *   Pupitre 49620 (UPG) → XG UPG 2-4 / 2-5
 */
function selectVlSheet(section) {
  const mats = section.materiels || [];

  const freinMod = String(mats.find(m => m.label.toLowerCase().includes('frein'))?.modele || '').toLowerCase();
  const pupMod   = String(mats.find(m => m.label.toLowerCase().includes('pupitre'))?.modele || '').toLowerCase();

  // Version logicielle : prendre la première version renseignée parmi frein/ripage/suspension
  const ver = mats.find(m => m.versionLog)?.versionLog || '';
  // Extraire la partie numérique : "1.1.2.5 LAN2.00" → "1.1.2.5"
  const verNum = (ver.match(/[\d]+\.[\d]+\.[\d]+\.[\d]+/) || [''])[0];
  const verMinor = parseInt((verNum.match(/\d+\.(\d+)\.\d+\.\d+/) || ['','0'])[1]); // ex: 2 dans 1.1.2.5
  const verPatch = parseInt((verNum.match(/\d+\.\d+\.\d+\.(\d+)/) || ['','0'])[1]); // ex: 5 dans 1.1.2.5

  // Extraire le code 5 chiffres du modèle frein (43300, 43350, 43800, 43850, 49620…)
  const freinCode = (freinMod.match(/\b(4[0-9]{4})\b/) || ['',''])[1];

  // ── FOG VL (ancienne chaîne, saisie manuelle uniquement — pas dans OTCLAN) ──
  // Modèles FOG VL  : CLS.750CT-VL  / CLS.750FR-ENS1  (UTAC FR 15-115/A + 15/LAN/ECE/0104)
  // Modèles FOG VL+ : CLS.750CT-VL+ / CLS.750FR-ENS2 (UTAC FR 16-119/A + 16/LAN/ECE/0145)
  // Ces matériels ne sont pas dans l'OTCLAN Muller → sélection via radio "chaineType" dans le formulaire
  if (section.chaineType === 'FOG VL+') return 'FOG VL+';
  if (section.chaineType === 'FOG VL')  return 'FOG VL';

  // Famille frein XG
  const isVlPlus = freinCode === '43350' || freinMod.includes('43350') || freinMod.includes('vl+');
  const isUpg    = freinCode === '49620' || pupMod.includes('49620') || pupMod.includes('upg');
  const is43800  = freinCode === '43800' || freinMod.includes('43800');
  const is43850  = freinCode === '43850' || freinMod.includes('43850');

  if (is43800)  return 'XG 2-6';
  if (is43850)  return 'XG 2-7';

  // Sélection par version (≥ 1.1.2.5 → slot -5, 1.1.2.4 → slot -4, sinon -2/-3)
  const v5plus = verNum && (verPatch >= 5);
  const v4     = verNum && verPatch === 4;

  if (isVlPlus) {
    if (v5plus) return 'XG VL+ 2-5';
    if (v4)     return 'XG VL+ 2-4';
    return 'XG VL+ 2-2'; // v1.1.2.3 ou inconnu
  }
  if (isUpg) {
    if (v5plus) return 'XG UPG 2-5';
    return 'XG UPG 2-4'; // v1.1.2.4 ou inconnu
  }
  // Standard 43300
  if (v5plus) return 'XG 2-5';
  if (v4)     return 'XG 2-4';
  return 'XG 2'; // v1.1.2.3 ou inconnu → feuille de base
}

/**
 * Sélectionne la bonne variante XG PL selon le modèle pupitre/frein et la version.
 * Source : "Liste modèles attestations" du DOC-A-31
 *   CR 52700 + 44700 → XG PL 1-4
 *   CR 52700 + 50500 → XG PL 1-5
 *   Standard 55310/53500 + frein :
 *     53500 : v1.1.0.5→4-1,  v1.1.0.6→4-1-1
 *     44700 : v1.1.0.5→4-2-2, v1.1.0.6→4-2-3
 *     50500 : v1.1.0.5→4-3-2, v1.1.0.6→4-3-3
 *     44750 : v1.1.0.6→5-1
 *   10000MX (50620) + 44700/50500 → 10000MX PL 1-2
 */
function selectXgPlSheet(section) {
  const mats = section.materiels || [];
  const pupMod   = String(mats.find(m => m.label.toLowerCase().includes('pupitre'))?.modele || '').toLowerCase();
  const freinMod = String(mats.find(m => m.label.toLowerCase().includes('frein'))?.modele || '').toLowerCase();

  // "control room" = PXG PL+TS ou PUPITRE COMMANDE (code article AM52700CR)
  const isControlRoom = pupMod.includes('+ts') || pupMod.includes('control') ||
                        pupMod.includes('pupitre commande') || pupMod.includes('52700cr');

  // 10000MX PL / BM 10000 / 10000MUX (pupitre 50620 ou nom commercial ou version 2.x)
  // Template liste : "10000MUX PL" → feuille 10000MX PL 1-2, version 2.3.4.2 LAN1.02
  // Les chaînes XG PL sont toutes en 1.1.0.x → version majeure 2 = 10000MX/BM 10000 sans ambiguïté
  const verMajor = verNum ? parseInt(verNum.split('.')[0]) : 0;
  const is10000mx = pupMod.includes('50620') || freinMod.includes('50620') ||
                    pupMod.includes('10000')  || freinMod.includes('10000') ||
                    pupMod.includes('bm')     ||
                    verMajor >= 2;

  // Frein : code 5 chiffres
  const freinCode = (freinMod.match(/\b(44700|50500|44750|53500|55310|50620)\b/) || ['',''])[1];

  // Version logicielle PL
  const ver = mats.find(m => m.versionLog)?.versionLog || '';
  const verNum = (ver.match(/[\d]+\.[\d]+\.[\d]+\.[\d]+/) || [''])[0];
  const verPatch = parseInt((verNum.match(/\d+\.\d+\.\d+\.(\d+)/) || ['','0'])[1]);
  const is106 = verPatch >= 6;

  if (is10000mx) return '10000MX PL 1-2';

  if (isControlRoom) {
    if (freinCode === '50500' || freinCode === '55310') return 'XG PL 1-5';
    return 'XG PL 1-4'; // 44700 ou générique
  }

  // Standard
  if (freinCode === '53500') return is106 ? 'XG PL 4-1-1' : 'XG PL 4-1';
  if (freinCode === '44750') return 'XG PL 5-1';
  if (freinCode === '50500' || freinCode === '55310') return is106 ? 'XG PL 4-3-3' : 'XG PL 4-3-2';
  // 44700 ou générique
  return is106 ? 'XG PL 4-2-3' : 'XG PL 4-2-2';
}

/** Retourne le nom exact de la feuille Excel selon le type de section */
function getSheetName(section) {
  const type = section.type;
  const st   = String(section.sousType || '').toUpperCase();

  if (type === 'ct') {
    if (st === 'VL') return selectVlSheet(section); // VL : sélection par modèle frein + version
    return selectXgPlSheet(section);                // PL : sélection par modèle + version
  }
  if (type === 'reglophare') return st === '764-8' ? 'RPH 4-1' : 'RPH 5';
  if (type === 'pollution') {
    if (st === 'ECOSHIELD')   return 'ECOOPAOBD';
    if (st === 'ECOPOL')      return 'ECOPOL';
    if (st === 'ACTIGAS_OPA') {
      // SK08 ou SK18 selon la version OTCLAN de l'OPA (LAN2 = SK08, LAN3 = SK18)
      const opaMat = (section.materiels || []).find(m =>
        (m.label || '').toLowerCase().includes('opaci'));
      const opaVer = String(opaMat?.versionLog || '');
      return opaVer.includes('LAN3') ? 'OPA OBD 6C SK18' : 'OPA OBD C6 SK08';
    }
    // ACTIGAS avec AG : SK08 ou SK18 selon le N° de série de l'analyseur de gaz
    // SK08 : NNN/09…/17 ou NNN/18 avec NNN ≤ 100
    // SK18 : NNN/18 avec NNN ≥ 101, ou NNN/19 et supérieur
    const agMat = (section.materiels || []).find(m =>
      (m.label || '').toLowerCase().includes('analyseur') ||
      (m.label || '').toLowerCase().includes('gaz') ||
      (m.label || '').toLowerCase().includes('ag')
    );
    const sk18 = agMat ? isAgSK18(agMat.numSerie) : false;
    return sk18 ? 'AG OPA OBD 6C SK18' : 'AG OPA OBD C6 SK08';
  }
  if (type === 'classeL') {
    const hasSono   = st.includes('SONO');
    const hasCelero = st.includes('CELERO') || st.includes('CELER');
    const isLAN5    = String(section.versionLog || '').includes('LAN5');

    // Extraire le suffixe 4 chiffres du certOtclan (ex: "25/LAN/ECE/0231" → "0231")
    const certOtclan = String(section.certOtclan || '');
    const certMatch  = certOtclan.match(/(\d{4})$/);
    const cert       = certMatch ? certMatch[1] : '';

    if (hasCelero && !hasSono) {
      // Céléromètre seul
      if (cert === '0223') return '0223SEUL';
      if (cert === 'DIST' || section.sonoPollution === 'DISTANCE') return 'CELERODISTANCE';
      return '0231SEUL'; // default (cert 0231 ou inconnu)
    }
    if (!hasCelero && hasSono) {
      // Sonomètre seul
      if (cert === '0223') return '0223LAN5';
      if (cert === '0226') return '0226LAN5';
      if (cert === '0227') return '0227LAN5';
      // Cert 0225 ou inconnu : LAN5 ou ancienne version selon versionLog
      return isLAN5 ? '0225LAN5' : '0225SONO';
    }
    if (hasCelero && hasSono) {
      // Sonomètre + céléromètre combinés
      if (cert === '0223') return '0223CELERO';
      if (cert === '0226') return '0226CELERO';
      if (cert === '0227') return '0227CELERO';
      return '0225SONOCELERO'; // cert 0225 ou inconnu
    }
    return '0231SEUL'; // fallback
  }
  if (type === 'decelero')   return st.includes('MINI') ? 'DECELERO MINI+' : 'DECELERO MAXI';
  if (type === 'paj')        return 'PAJ';
  return null;
}

/** Remplace les VLOOKUP clients (J18/J19/J21/J22 ou J18/J19/J20/J21) par des valeurs brutes */
function fillClientInfo(sheet, sheetName, demande) {
  const nom     = demande.nomCentre || '';
  const adresse = demande.adresse   || '';
  const cpRaw   = String(demande.cp || '').trim();
  const cp      = /^0+$/.test(cpRaw) ? '' : cpRaw; // ignorer CP "0" ou "00000"
  const ville   = demande.ville     || '';

  sheet.cell('J18').value(nom);
  sheet.cell('J19').value(adresse);

  // Feuilles avec CP en J20 et ville en J21 (VLOOKUP col4=J20, col5=J21)
  // Vérifié sur le template : XG 2-6, 2-7, VL+ 2-2, 2-4, PL 4-2-2 et plusieurs Classe L / pollution
  const j20j21Sheets = [
    // Classe L
    '0225SONOCELERO', '0231SEUL', 'CELERODISTANCE',
    '0223SEUL', '0223CELERO', '0223LAN5',
    // VL variantes récentes (frein 43800/43850 et VL+ ancien)
    'XG 2-6', 'XG 2-7', 'XG VL+ 2-2', 'XG VL+ 2-4',
    // PL variante 4-2-2 (VLOOKUP confirmé col4=J20, col5=J21)
    'XG PL 4-2-2',
    // Pollution SK18 / AG OBD
    'OPA OBD 6C SK18', 'AG OBD 4-3'
  ];
  if (j20j21Sheets.includes(sheetName)) {
    sheet.cell('J20').value(cp);
    sheet.cell('J21').value(ville);
  } else {
    sheet.cell('J21').value(cp);
    sheet.cell('J22').value(ville);
  }
}

/** Remplit la cellule du numéro d'attestation (F16 ou G16 selon la feuille) */
function fillNumero(sheet, sheetName, numero) {
  const g16Sheets = [
    // Pollution ACTIGAS / ECOSHIELD (G16)
    'AG OPA OBD C6 SK08', 'AG OPA OBD 6C SK18', 'ECOOPAOBD', 'ECOPOL',
    'OPA OBD C6 SK08', 'OPA OBD 6C SK18',
    'OPA OBD 3-9', 'OPA OBD 4-3',
    'AG OPA OBD 3-4', 'AG OPA OBD 3-9',
    'AG OBD 4-2', 'AG OBD 4-3', 'AG OPA 204', 'AG OPA MOTO',
    'FOG AG OPA', 'FOG OPA OBD',
    // Classe L (G16)
    '0225SONOCELERO', '0231SEUL', 'CELERODISTANCE',
    '0223SEUL', '0223CELERO', '0223LAN5',
    '0225LAN5', '0225SONO',
    '0226CELERO', '0226LAN5',
    '0227CELERO', '0227LAN5',
  ];
  if (g16Sheets.includes(sheetName)) {
    sheet.cell('G16').value(numero);
  } else {
    sheet.cell('F16').value(numero);
  }
}

/** Remplit les numéros de série des matériels selon la feuille */
function fillEquipements(sheet, sheetName, section) {
  const mats = section.materiels || [];

  const getSN = (...labels) => {
    for (const label of labels) {
      const m = mats.find(m => m.label && m.label.toLowerCase().includes(label.toLowerCase()));
      if (m && m.numSerie) return m.numSerie;
    }
    return '';
  };
  const getVer = (...labels) => {
    for (const label of labels) {
      const m = mats.find(m => m.label && m.label.toLowerCase().includes(label.toLowerCase()));
      if (m && m.versionLog) return m.versionLog;
    }
    return '';
  };
  const getMarque = (...labels) => {
    for (const label of labels) {
      const m = mats.find(m => m.label && m.label.toLowerCase().includes(label.toLowerCase()));
      if (m && m.marque) return m.marque;
    }
    return '';
  };

  if (/^XG (?!PL)/.test(sheetName) || sheetName === 'FOG VL' || sheetName === 'FOG VL+') {
    // Toutes variantes VL : XG 2/2-4/2-5/2-6/2-7, XG VL+ 2-x, XG UPG 2-x, FOG VL, FOG VL+
    // Structure commune : F21=SN pupitre, G21=texte fixe ", version logiciel ",
    //                     H21=version logicielle, G23=SN frein, G24=SN suspension (G25 ripage non affiché)
    const pupSN   = getSN('pupitre');
    const freinSN = getSN('freinage', 'frein');
    const suspSN  = getSN('suspension', 'susp', 'banc');
    const ripSN   = getSN('ripage', 'plaque');

    // F21 : SN pupitre (souvent absent de l'OTCLAN — on écrit quand même pour effacer le XXX template)
    sheet.cell('F21').value(pupSN);

    // H21 : version logicielle — extraire uniquement la partie numérique X.X.X.X
    const verFull = getVer('freinage', 'frein') || getVer('ripage', 'plaque') || getVer('suspension', 'banc') || getVer('pupitre');
    const verNum  = (verFull.match(/\d+\.\d+\.\d+\.\d+/) || [''])[0];
    if (verNum) sheet.cell('H21').value(verNum);

    if (freinSN) sheet.cell('G23').value(freinSN);
    if (suspSN)  sheet.cell('G24').value(suspSN);
    // G25 (ripage) volontairement non rempli — ne pas afficher dans l'attestation VL

  } else if (sheetName === 'XG PL 1-4' || sheetName === 'XG PL 1-5') {
    // "control room" : SN pupitre en G21, version chaîne PL en H21, frein en F23
    sheet.cell('G21').value(getSN('pupitre'));
    const verFull = getVer('pupitre') || getVer('freinage', 'frein');
    const verNum  = (verFull.match(/\d+\.\d+\.\d+\.\d+/) || [''])[0];
    if (verNum) sheet.cell('H21').value(verNum);
    sheet.cell('F23').value(getSN('freinage', 'frein'));
  } else if (/^XG PL \d/.test(sheetName)) {
    // Variantes standard PL (4-x, 5-x) : SN pupitre en F21, version dans texte G21, frein en F23
    sheet.cell('F21').value(getSN('pupitre'));
    const verFull = getVer('pupitre') || getVer('freinage', 'frein');
    const verNum  = (verFull.match(/\d+\.\d+\.\d+\.\d+/) || [''])[0];
    if (verNum) {
      const g21 = sheet.cell('G21');
      const txt = g21.value();
      if (typeof txt === 'string') {
        // Remplacer la version figée dans le texte : ", version logiciel X.X.X.X, équipée :"
        g21.value(txt.replace(/\d+[\d.]+\d/, verNum));
      } else {
        // RichText (ex. XG PL 4-3-1) : reconstruire
        g21.value(', version logiciel ' + verNum + ', équipée :');
      }
    }
    sheet.cell('F23').value(getSN('freinage', 'frein'));
  } else if (sheetName === '10000MX PL 1-2') {
    // 10000MX PL : SN pupitre en H21, SN frein en F23 (version hardcodée dans I21 → ne pas écraser)
    sheet.cell('H21').value(getSN('pupitre'));
    sheet.cell('F23').value(getSN('freinage', 'frein'));
  } else if (sheetName === 'RPH 4-1') {
    sheet.cell('F21').value(getSN('règle', 'regle', 'phare'));
  } else if (sheetName === 'RPH 5' || sheetName === 'RPH 6') {
    sheet.cell('G21').value(getSN('règle', 'regle', 'phare'));
  } else if (['OPA OBD C6 SK08','OPA OBD 6C SK18','OPA OBD 3-9','OPA OBD 4-3'].includes(sheetName)) {
    // ACTIGAS_OPA (opacimètre + OBD, sans analyseur de gaz) : H20=SN OPA, F21=SN OBD
    sheet.cell('H20').value(getSN('opaci'));
    sheet.cell('F21').value(getSN('obd'));
  } else if (sheetName === 'AG OPA OBD C6 SK08' || sheetName === 'AG OPA OBD 6C SK18') {
    sheet.cell('I20').value(getSN('analyseur', 'gaz', 'ag'));
    sheet.cell('H21').value(getSN('opaci'));
    sheet.cell('F22').value(getSN('obd'));
  } else if (sheetName === 'ECOOPAOBD') {
    sheet.cell('H21').value(getSN('opaci'));
    sheet.cell('F22').value(getSN('obd'));
  } else if (sheetName === 'ECOPOL') {
    // ECOSHIELD complet : AG en I20, OPA en H21, OBD en F22
    sheet.cell('I20').value(getSN('analyseur', 'gaz', 'ag'));
    sheet.cell('H21').value(getSN('opaci'));
    sheet.cell('F22').value(getSN('obd'));
  } else if (sheetName === '0225SONOCELERO') {
    // Sonomètre cert 0225 + céléromètre cert 0231 (même attestation)
    sheet.cell('G20').value(getSN('sono'));
    sheet.cell('G21').value(getSN('calibr'));
    sheet.cell('G22').value(getSN('celer', 'célér', 'celér'));
  } else if (sheetName === '0225SONO' || sheetName === '0225LAN5') {
    // Sonomètre seul (cert 0225) — LAN4 ou LAN5
    sheet.cell('G20').value(getSN('sono'));
    sheet.cell('G21').value(getSN('calibr'));
  } else if (sheetName === '0231SEUL') {
    // Céléromètre seul (cert 0231)
    sheet.cell('G20').value(getSN('celer', 'célér', 'celér'));
  } else if (sheetName === 'CELERODISTANCE') {
    // Céléromètre installé à distance
    sheet.cell('G20').value(getSN('celer', 'célér', 'celér'));
  } else if (sheetName === '0223SEUL') {
    // ECOSHIELD seul (cert 0223, sans sonomètre ni céléromètre)
    sheet.cell('I20').value(getSN('analyseur', 'gaz', 'ag'));
    sheet.cell('H21').value(getSN('opaci'));
    sheet.cell('F22').value(getSN('obd'));
  } else if (sheetName === '0223LAN5') {
    // ECOSHIELD + sonomètre (cert 0223, sans céléromètre)
    sheet.cell('I20').value(getSN('analyseur', 'gaz', 'ag'));
    sheet.cell('H21').value(getSN('opaci'));
    sheet.cell('F22').value(getSN('obd'));
    sheet.cell('G23').value(getSN('sono'));
    sheet.cell('G24').value(getSN('calibr'));
  } else if (sheetName === '0223CELERO') {
    // ECOSHIELD + sonomètre + céléromètre (cert 0223 complet)
    sheet.cell('I20').value(getSN('analyseur', 'gaz', 'ag'));
    sheet.cell('H21').value(getSN('opaci'));
    sheet.cell('F22').value(getSN('obd'));
    sheet.cell('G23').value(getSN('sono'));
    sheet.cell('G24').value(getSN('calibr'));
    sheet.cell('H25').value(getSN('celer', 'célér', 'celér'));
  } else if (sheetName === '0226LAN5') {
    // ACTIGAS SK18 + sonomètre (cert 0226, sans céléromètre)
    sheet.cell('I20').value(getSN('analyseur', 'gaz', 'ag'));
    sheet.cell('H21').value(getSN('opaci'));
    sheet.cell('F22').value(getSN('obd'));
    sheet.cell('G23').value(getSN('sono'));
    sheet.cell('G24').value(getSN('calibr'));
  } else if (sheetName === '0226CELERO') {
    // ACTIGAS SK18 + sonomètre + céléromètre (cert 0226 complet)
    sheet.cell('I20').value(getSN('analyseur', 'gaz', 'ag'));
    sheet.cell('H21').value(getSN('opaci'));
    sheet.cell('F22').value(getSN('obd'));
    sheet.cell('G23').value(getSN('sono'));
    sheet.cell('G24').value(getSN('calibr'));
    sheet.cell('H25').value(getSN('celer', 'célér', 'celér'));
  } else if (sheetName === '0227LAN5') {
    // ACTIGAS SK08 + sonomètre (cert 0227, sans céléromètre)
    sheet.cell('I20').value(getSN('analyseur', 'gaz', 'ag'));
    sheet.cell('H21').value(getSN('opaci'));
    sheet.cell('F22').value(getSN('obd'));
    sheet.cell('G23').value(getSN('sono'));
    sheet.cell('G24').value(getSN('calibr'));
  } else if (sheetName === '0227CELERO') {
    // ACTIGAS SK08 + sonomètre + céléromètre (cert 0227 complet)
    sheet.cell('I20').value(getSN('analyseur', 'gaz', 'ag'));
    sheet.cell('H21').value(getSN('opaci'));
    sheet.cell('F22').value(getSN('obd'));
    sheet.cell('G23').value(getSN('sono'));
    sheet.cell('G24').value(getSN('calibr'));
    sheet.cell('H25').value(getSN('celer', 'célér', 'celér'));
  } else if (sheetName === 'DECELERO MAXI' || sheetName === 'DECELERO MINI+') {
    sheet.cell('I21').value(getSN('décel', 'decel'));
  } else if (sheetName === 'PAJ') {
    sheet.cell('D24').value(getMarque('centrale', 'hydraul'));
    sheet.cell('G24').value(getMarque('châssis', 'chassis'));
    sheet.cell('D28').value(getSN('centrale', 'hydraul'));
    sheet.cell('G28').value(getSN('châssis', 'chassis'));
  }
}

// ──────────────────── Start ────────────────────
app.listen(PORT, () => {
  console.log(`\n✓ Serveur démarré : http://localhost:${PORT}`);
  console.log(`  Console admin   : http://localhost:${PORT}/admin.html\n`);
  getData();
});
