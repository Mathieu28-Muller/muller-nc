'use strict';
let currentUser = null;
let currentDemande = null;

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  setupLogin();
  setupNav();
  setupUpload();
  setupConfig();
  setupComptes();
  setupModal();
});

/* ──────────────────────────────────────────
   AUTH
────────────────────────────────────────── */
function setupLogin() {
  document.getElementById('btn-login').addEventListener('click', login);
  document.getElementById('login-pass').addEventListener('keypress', e => { if (e.key === 'Enter') login(); });
  document.getElementById('btn-logout').addEventListener('click', () => {
    currentUser = null;
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
  });
}

async function login() {
  const login = document.getElementById('login-user').value;
  const mdp = document.getElementById('login-pass').value;
  const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, mdp }) });
  if (!res.ok) { document.getElementById('login-error').classList.remove('hidden'); return; }
  document.getElementById('login-error').classList.add('hidden');
  currentUser = await res.json();
  document.getElementById('user-greeting').textContent = `Connecté : ${currentUser.nom} (${currentUser.role})`;

  // Masquer menu admin si opérateur
  if (currentUser.role !== 'admin') {
    document.getElementById('nav-config').style.display = 'none';
    document.getElementById('nav-comptes').style.display = 'none';
  }

  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  loadDashboard();
}

/* ──────────────────────────────────────────
   NAVIGATION
────────────────────────────────────────── */
function setupNav() {
  document.querySelectorAll('[data-page]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const page = link.dataset.page;
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('[data-page]').forEach(l => l.classList.remove('active'));
      document.getElementById(`page-${page}`).classList.add('active');
      link.classList.add('active');
      onPageEnter(page);
    });
  });
}

function onPageEnter(page) {
  if (page === 'dashboard') loadDashboard();
  else if (page === 'attente') loadDemandes('en_attente', 'tb-attente');
  else if (page === 'non-conforme') loadDemandes('non_conforme', 'tb-nc');
  else if (page === 'archives') searchArchives();
  else if (page === 'config') loadConfig();
  else if (page === 'comptes') loadComptes();
}

/* ──────────────────────────────────────────
   DASHBOARD
────────────────────────────────────────── */
async function loadDashboard() {
  const [attente, nc, archives, stats, all] = await Promise.all([
    fetch('/api/demandes?status=en_attente').then(r => r.json()),
    fetch('/api/demandes?status=non_conforme').then(r => r.json()),
    fetch('/api/archives').then(r => r.json()),
    fetch('/api/stats').then(r => r.json()),
    fetch('/api/demandes').then(r => r.json())
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const envoyeeAujourdhui = archives.filter(d => d.envoyeeAt && d.envoyeeAt.startsWith(today));

  document.getElementById('stat-attente').textContent = attente.length;
  document.getElementById('stat-nc').textContent = nc.length;
  document.getElementById('stat-envoyee').textContent = envoyeeAujourdhui.length;
  document.getElementById('stat-total').textContent = archives.length;
  document.getElementById('stat-certs-total').textContent = stats.total || 0;

  // Ventilation par année
  const anneeBody = document.getElementById('stats-annee-body');
  if (anneeBody) {
    const years = Object.keys(stats.byYear || {}).sort((a, b) => b - a);
    if (!years.length) {
      anneeBody.innerHTML = '<span style="color:#888;font-size:13px;padding:8px 0;">Aucun certificat généré</span>';
    } else {
      anneeBody.innerHTML = years.map(y => `
        <div style="background:var(--bleu-clair);border:1px solid #c0d3ef;border-radius:8px;padding:10px 18px;text-align:center;min-width:90px;">
          <div style="font-size:22px;font-weight:800;color:var(--bleu);">${stats.byYear[y]}</div>
          <div style="font-size:12px;color:#555;margin-top:2px;">${y}</div>
        </div>`).join('');
    }
  }

  renderTable('tb-recent', all.slice(0, 10), 'dashboard');
}

/* ──────────────────────────────────────────
   LISTES DEMANDES
────────────────────────────────────────── */
async function loadDemandes(status, tbId) {
  const data = await fetch(`/api/demandes?status=${status}`).then(r => r.json());
  renderTable(tbId, data, status);
}

function renderTable(tbId, rows, mode) {
  const tb = document.getElementById(tbId);
  if (!tb) return;
  tb.innerHTML = '';
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#888;padding:20px;">Aucune demande</td></tr>`;
    return;
  }
  for (const d of rows) {
    const tr = document.createElement('tr');
    const date = new Date(d.createdAt).toLocaleString('fr-FR');
    const types = (d.sections || []).map(s => labelType(s.type, s.sousType)).join(', ');
    const badge = badgeStatut(d.status);

    if (mode === 'non_conforme') {
      tr.innerHTML = `<td>${date}</td><td>${d.nomCentre || ''}</td><td>${d.email || ''}</td>
        <td style="font-size:12px;color:var(--rouge)">${d.raisonNC || ''}</td>
        <td class="actions">
          <button class="btn-secondary" style="font-size:11px;padding:5px 10px;" onclick="openDemande('${d.id}')">Voir</button>
          <button class="btn-primary" style="font-size:11px;padding:5px 10px;" onclick="validerDemande('${d.id}')">Valider</button>
        </td>`;
    } else if (mode === 'en_attente') {
      tr.innerHTML = `<td>${date}</td><td>${d.nomCentre || ''}</td><td>${d.email || ''}</td>
        <td style="font-size:12px">${types}</td>
        <td class="actions">
          <button class="btn-secondary" style="font-size:11px;padding:5px 10px;" onclick="openDemande('${d.id}')">Voir</button>
          <button class="btn-success" style="font-size:11px;padding:5px 10px;" onclick="validerDemande('${d.id}')">✓ Valider</button>
          <button class="btn-danger" style="font-size:11px;padding:5px 10px;" onclick="marquerNC('${d.id}')">✗ NC</button>
        </td>`;
    } else if (mode === 'archives') {
      const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('fr-FR') : '—';
      const fmtDateHeure = iso => iso ? new Date(iso).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
      const numeros = (d.attestations || []).map(a => a.numero).join(', ') || d.numero || '—';
      tr.innerHTML = `
        <td style="font-family:monospace;font-size:12px;">${numeros}</td>
        <td style="font-size:12px;">${fmtDate(d.createdAt)}</td>
        <td style="font-size:12px;">${fmtDate(d.valideeAt)}</td>
        <td style="font-size:12px;">${fmtDateHeure(d.envoyeeAt)}</td>
        <td>${d.nomCentre || ''}</td>
        <td style="font-size:12px">${types}</td>
        <td>${badge}</td>
        <td class="actions">
          <button class="btn-secondary" style="font-size:11px;padding:5px 10px;" onclick="openDemande('${d.id}')">Voir</button>
          ${(d.attestations||[]).map(a=>`<a class="btn-primary" style="font-size:11px;padding:5px 10px;text-decoration:none;margin-left:3px;" href="${a.pdfUrl}" download>${a.numero}</a>`).join('')}
          ${(!d.attestations && d.numero) ? `<a class="btn-primary" style="font-size:11px;padding:5px 10px;text-decoration:none;" href="/api/archives/${d.numero}.pdf" download>${d.numero}</a>` : ''}
        </td>`;
    } else {
      // dashboard
      tr.innerHTML = `<td>${date}</td><td>${d.nomCentre || ''}</td><td>${d.agrement || ''}</td>
        <td style="font-size:12px">${types}</td><td>${badge}</td>
        <td class="actions">
          <button class="btn-secondary" style="font-size:11px;padding:5px 10px;" onclick="openDemande('${d.id}')">Voir</button>
          ${(d.attestations||[]).map(a=>`<a class="btn-primary" style="font-size:11px;padding:5px 10px;text-decoration:none;margin-left:3px;" href="${a.pdfUrl}" download>${a.numero}</a>`).join('')}
          ${(!d.attestations && d.numero) ? `<a class="btn-primary" style="font-size:11px;padding:5px 10px;text-decoration:none;" href="/api/archives/${d.numero}.pdf" download>${d.numero}</a>` : ''}
        </td>`;
    }
    tb.appendChild(tr);
  }
}

function labelType(type, sous) {
  const m = { ct:'CT', reglophare:'Règle phare', pollution:'Anti-pollution', classeL:'Classe L', decelero:'Décéléromètre', paj:'PAJ' };
  return `${m[type] || type}${sous ? ' '+sous : ''}`;
}

function badgeStatut(s) {
  const map = {
    en_attente: '<span class="badge badge-attente">En attente</span>',
    validee: '<span class="badge badge-validee">Validée</span>',
    envoyee: '<span class="badge badge-envoyee">Envoyée</span>',
    non_conforme: '<span class="badge badge-nc">Non conforme</span>'
  };
  return map[s] || s;
}

/* ──────────────────────────────────────────
   ACTIONS SUR DEMANDES
────────────────────────────────────────── */
async function validerDemande(id) {
  if (!confirm('Valider et générer les attestations PDF ?')) return;
  const res = await fetch(`/api/demandes/${id}/valider`, { method: 'POST' });
  const data = await res.json();
  if (data.ok) {
    const attestations = data.attestations || [{ numero: data.numero, pdfUrl: `/api/archives/${data.numero}.pdf` }];
    showValidationResult(attestations);
    loadDashboard();
    loadDemandes('en_attente', 'tb-attente');
  } else {
    alert('Erreur : ' + data.error);
  }
}

function showValidationResult(attestations) {
  // Afficher une boîte de résultat avec liens de téléchargement pour chaque PDF
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  const box = document.createElement('div');
  box.style.cssText = 'background:white;border-radius:12px;padding:28px 32px;max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.2);';
  let html = `<h3 style="margin:0 0 16px;color:var(--bleu);">✓ Attestation(s) générée(s)</h3>`;
  html += `<p style="font-size:13px;color:#555;margin-bottom:16px;">${attestations.length} PDF créé(s) :</p>`;
  html += `<div style="display:flex;flex-direction:column;gap:10px;">`;
  for (const att of attestations) {
    html += `<a href="${att.pdfUrl}" download style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f0f4ff;border:1.5px solid var(--bleu);border-radius:8px;text-decoration:none;color:var(--bleu);font-weight:600;font-size:13px;">
      <span style="font-size:20px;">📄</span>
      <span>N° ${att.numero}.pdf</span>
      <span style="margin-left:auto;opacity:.6;font-size:11px;">Télécharger</span>
    </a>`;
  }
  html += `</div><div style="margin-top:20px;text-align:right;"><button style="padding:8px 22px;background:var(--bleu);color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;" onclick="this.closest('div[style]').remove()">Fermer</button></div>`;
  box.innerHTML = html;
  overlay.appendChild(box);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function marquerNC(id) {
  const raison = prompt('Raison de la non-conformité :');
  if (raison === null) return;
  await fetch(`/api/demandes/${id}/non-conforme`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raison }) });
  loadDemandes('en_attente', 'tb-attente');
  loadDashboard();
}


/* ──────────────────────────────────────────
   MODAL DÉTAIL
────────────────────────────────────────── */
function setupModal() {
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
}

async function openDemande(id) {
  const all = await fetch('/api/demandes').then(r => r.json());
  currentDemande = all.find(d => d.id === id);
  if (!currentDemande) return;

  const d = currentDemande;
  const isEditable = (d.status === 'en_attente' || d.status === 'non_conforme');

  // ── Calculer les feuilles prévisionnelles via le serveur
  let sheetPreviews = [];
  try {
    sheetPreviews = await fetch('/api/preview-sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: d.sections || [] })
    }).then(r => r.json());
  } catch(e) { /* en cas d'erreur réseau, on continue sans preview */ }

  // ── Infos centre (éditables si en attente)
  let html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">`;
  const clientFields = [
    ['nomCentre','Nom du centre'], ['agrement','Agrément'], ['compteClt','Compte client'],
    ['adresse','Adresse'], ['cp','CP'], ['ville','Ville'], ['telephone','Téléphone'], ['email','Email']
  ];
  for (const [key, label] of clientFields) {
    html += `<div>
      <div style="font-size:11px;color:#888;margin-bottom:2px;">${label}</div>
      ${isEditable
        ? `<input type="text" id="edit-${key}" value="${(d[key]||'').replace(/"/g,'&quot;')}" style="width:100%;padding:5px 8px;border:1.5px solid var(--gris-bd);border-radius:5px;font-size:12px;box-sizing:border-box;">`
        : `<div style="font-size:13px;font-weight:600;">${d[key] || '—'}</div>`
      }
    </div>`;
  }
  html += `</div>`;

  if (d.raisonNC) html += `<div style="background:#fff3f3;border:1px solid var(--rouge);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:var(--rouge);">⚠️ Non-conformité : ${d.raisonNC}</div>`;

  // ── Sections (matériels éditables + sélecteur feuille)
  for (const [si, s] of (d.sections || []).entries()) {
    const preview    = sheetPreviews[si] || { computed: '', alternatives: [] };
    const sheetLabel = preview.computed || '—';
    const isOverridden = !!s.sheetOverride;

    // Sélecteur de feuille (toujours visible pour demandes éditables, lecture seule sinon)
    let sheetSelector = '';
    if (isEditable && preview.alternatives.length > 1) {
      const opts = preview.alternatives.map(a =>
        `<option value="${a}" ${a === preview.computed ? 'selected' : ''}>${a}</option>`
      ).join('');
      sheetSelector = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 10px;background:${isOverridden?'#fff8e1':'#f0f4ff'};border:1.5px solid ${isOverridden?'#f0a000':'var(--bleu)'};border-radius:6px;">
          <span style="font-size:11px;font-weight:700;color:#555;white-space:nowrap;">Feuille certificat :</span>
          <select class="sheet-override-sel" data-si="${si}"
            style="flex:1;padding:4px 8px;border:1px solid var(--gris-bd);border-radius:5px;font-size:12px;font-weight:600;color:var(--bleu);background:white;cursor:pointer;">
            ${opts}
          </select>
          ${isOverridden ? '<span style="font-size:10px;color:#f0a000;font-weight:700;">modifiée</span>' : '<span style="font-size:10px;color:#888;">auto</span>'}
        </div>`;
    } else {
      // Lecture seule ou une seule option
      const overrideBadge = isOverridden ? ' <span style="font-size:10px;background:#fff8e1;border:1px solid #f0a000;color:#b07000;padding:1px 5px;border-radius:3px;">modifiée</span>' : '';
      sheetSelector = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:5px 10px;background:#f0f4ff;border:1px solid #c8d8f8;border-radius:6px;">
          <span style="font-size:11px;color:#555;">Feuille :</span>
          <span style="font-size:12px;font-weight:700;color:var(--bleu);">${sheetLabel}</span>${overrideBadge}
        </div>`;
    }

    html += `<div class="section-mat" style="margin-bottom:14px;">
      <h4 style="margin:0 0 6px;font-size:13px;color:var(--bleu);">${labelType(s.type, s.sousType)}</h4>
      ${sheetSelector}
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
      <thead><tr style="background:var(--bleu);color:white;">
        <th style="padding:5px 8px;text-align:left;width:22%">Matériel</th>
        <th style="padding:5px 8px;text-align:left;">Modèle</th>
        <th style="padding:5px 8px;text-align:left;">N° Série</th>
        <th style="padding:5px 8px;text-align:left;">Version</th>
      </tr></thead><tbody>`;
    for (const [mi, m] of (s.materiels || []).entries()) {
      if (isEditable) {
        const inp = (f, val) => `<input type="text" class="mat-edit" data-si="${si}" data-mi="${mi}" data-f="${f}" value="${(val||'').replace(/"/g,'&quot;')}" style="width:100%;padding:4px 6px;border:1px solid var(--gris-bd);border-radius:4px;font-size:11px;box-sizing:border-box;">`;
        html += `<tr style="border-bottom:1px solid #eee;">
          <td style="padding:5px 8px;font-weight:600;white-space:nowrap;">${m.label||''}</td>
          <td style="padding:3px 6px;">${inp('modele', m.modele)}</td>
          <td style="padding:3px 6px;">${inp('numSerie', m.numSerie)}</td>
          <td style="padding:3px 6px;">${inp('versionLog', m.versionLog)}</td>
        </tr>`;
      } else {
        html += `<tr style="border-bottom:1px solid #eee;">
          <td style="padding:5px 8px;font-weight:600;">${m.label||''}</td>
          <td style="padding:5px 8px;color:#333;">${m.modele||'—'}</td>
          <td style="padding:5px 8px;font-family:monospace;">${m.numSerie||'—'}</td>
          <td style="padding:5px 8px;color:#555;">${m.versionLog||'—'}</td>
        </tr>`;
      }
    }
    html += '</tbody></table></div>';
  }

  document.getElementById('modal-content').innerHTML = html;

  // ── Boutons footer
  const footer = document.getElementById('modal-footer');
  footer.innerHTML = `<button class="btn-secondary" onclick="closeModal()">Fermer</button>`;

  if (isEditable) {
    footer.innerHTML += `<button class="btn-danger" style="margin-left:8px;" onclick="marquerNCAvecRaison('${d.id}')">✗ Non conforme</button>`;
    footer.innerHTML += `<button class="btn-success" style="margin-left:8px;" onclick="validerAvecEdition('${d.id}')">✓ Valider et générer PDF</button>`;
  }

  if (d.attestations && d.attestations.length > 0) {
    for (const att of d.attestations) {
      footer.innerHTML += `<a class="btn-primary" style="font-size:12px;padding:7px 12px;margin-left:4px;" href="${att.pdfUrl}" download>📄 ${att.numero}</a>`;
    }
  } else if (d.numero) {
    footer.innerHTML += `<a class="btn-primary" style="margin-left:8px;" href="/api/archives/${d.numero}.pdf" download>📄 ${d.numero}</a>`;
  }

  document.getElementById('modal-overlay').classList.remove('hidden');
}

async function validerAvecEdition(id) {
  // Récupérer les modifications des champs client
  const clientUpdates = {};
  for (const key of ['nomCentre','agrement','compteClt','adresse','cp','ville','telephone','email']) {
    const el = document.getElementById(`edit-${key}`);
    if (el) clientUpdates[key] = el.value;
  }

  // Récupérer les modifications des matériels
  const sections = JSON.parse(JSON.stringify(currentDemande.sections || []));
  document.querySelectorAll('.mat-edit').forEach(inp => {
    const si = parseInt(inp.dataset.si);
    const mi = parseInt(inp.dataset.mi);
    const f  = inp.dataset.f;
    if (sections[si] && sections[si].materiels[mi]) {
      sections[si].materiels[mi][f] = inp.value;
    }
  });

  // Récupérer les overrides de feuille sélectionnés dans les menus déroulants
  // Appel preview-sheets pour connaître la valeur auto de chaque section
  let previews = [];
  try {
    previews = await fetch('/api/preview-sheets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections })
    }).then(r => r.json());
  } catch(e) {}

  document.querySelectorAll('.sheet-override-sel').forEach(sel => {
    const si      = parseInt(sel.dataset.si);
    const chosen  = sel.value;
    const autoVal = previews[si]?.computed || '';
    // Stocker l'override seulement si différent de la valeur auto
    if (sections[si]) {
      sections[si].sheetOverride = (chosen !== autoVal) ? chosen : undefined;
    }
  });

  // Mettre à jour la demande avec les données éditées
  await fetch(`/api/demandes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...clientUpdates, sections })
  });

  closeModal();
  await validerDemande(id);
}

async function marquerNCAvecRaison(id) {
  const raison = prompt('Raison de la non-conformité :');
  if (raison === null) return;
  await fetch(`/api/demandes/${id}/non-conforme`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raison })
  });
  closeModal();
  loadDemandes('en_attente', 'tb-attente');
  loadDashboard();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

/* ──────────────────────────────────────────
   ARCHIVES
────────────────────────────────────────── */
async function searchArchives() {
  const q = (document.getElementById('search-archives')?.value || '').trim();
  const url = q ? `/api/archives?q=${encodeURIComponent(q)}` : '/api/archives';
  const data = await fetch(url).then(r => r.json());
  renderTable('tb-archives', data, 'archives');
}

/* ──────────────────────────────────────────
   UPLOAD
────────────────────────────────────────── */
function setupUpload() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('upload-input');

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => uploadFiles(input.files));

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    uploadFiles(e.dataTransfer.files);
  });
}

async function uploadFiles(files) {
  const list = document.getElementById('upload-list');
  for (const file of files) {
    const li = document.createElement('li');
    li.textContent = `${file.name} – envoi…`;
    list.appendChild(li);
    const fd = new FormData();
    fd.append('fichier', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      li.className = data.ok ? 'ok' : 'err';
      li.textContent = `${file.name} – ${data.ok ? 'importé avec succès' : 'erreur'}`;
    } catch {
      li.className = 'err';
      li.textContent = `${file.name} – erreur réseau`;
    }
  }
}

/* ──────────────────────────────────────────
   CONFIG
────────────────────────────────────────── */
async function loadConfig() {
  const cfg = await fetch('/api/config').then(r => r.json());
  Object.entries(cfg).forEach(([k, v]) => {
    const el = document.getElementById(`cfg-${k}`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v || '';
  });
}

function setupConfig() {
  document.getElementById('btn-save-config')?.addEventListener('click', async () => {
    const cfg = {};
    document.querySelectorAll('[id^="cfg-"]').forEach(el => {
      const k = el.id.replace('cfg-', '');
      cfg[k] = el.type === 'checkbox' ? el.checked : el.value;
    });
    await fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
    alert('Configuration enregistrée.');
  });
}

/* ──────────────────────────────────────────
   COMPTES
────────────────────────────────────────── */
async function loadComptes() {
  const data = await fetch('/api/comptes').then(r => r.json());
  const tb = document.getElementById('tb-comptes');
  tb.innerHTML = '';
  for (const c of data) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${c.login}</td><td>${c.nom}</td><td>${c.role}</td>
      <td><button class="btn-danger" style="font-size:11px;padding:5px 10px;" onclick="deleteCompte('${c.login}')">Supprimer</button></td>`;
    tb.appendChild(tr);
  }
}

async function deleteCompte(login) {
  if (login === 'admin') { alert('Impossible de supprimer le compte admin.'); return; }
  if (!confirm(`Supprimer le compte ${login} ?`)) return;
  await fetch(`/api/comptes/${login}`, { method: 'DELETE' });
  loadComptes();
}

function setupComptes() {
  document.getElementById('btn-add-compte')?.addEventListener('click', () => {
    document.getElementById('modal-compte-overlay').classList.remove('hidden');
  });
  document.getElementById('btn-annuler-compte')?.addEventListener('click', () => {
    document.getElementById('modal-compte-overlay').classList.add('hidden');
  });
  document.getElementById('btn-creer-compte')?.addEventListener('click', async () => {
    const payload = {
      login: document.getElementById('nc-login').value.trim(),
      nom: document.getElementById('nc-nom').value.trim(),
      mdp: document.getElementById('nc-mdp').value,
      role: document.getElementById('nc-role').value
    };
    if (!payload.login || !payload.mdp) { alert('Login et mot de passe obligatoires.'); return; }
    const res = await fetch('/api/comptes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.ok) { document.getElementById('modal-compte-overlay').classList.add('hidden'); loadComptes(); }
    else alert(data.error);
  });
}
