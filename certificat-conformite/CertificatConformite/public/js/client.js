'use strict';
/* ── ÉTAT ── */
let clientData = null;
let searchTimeout = null;
// Valeurs originales pre-remplies depuis la BDD (pour détecter les changements)
// { fieldId: { value, agrement, materielConcerne, modele, idMod } }
const originalEquipValues = {};
let _pendingReplacement = null;

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  setupSearch();
  setupSaisieManuelle();
  setupDemandes();
  setupSubmit();
  setupChangeTracking();
  initCtForms();
});

/* ──────────────────────────────────────────
   RECHERCHE CLIENT
────────────────────────────────────────── */
function setupSearch() {
  const input = document.getElementById('search-input');
  const resultsList = document.getElementById('search-results');

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = input.value.trim();
    if (q.length < 2) { resultsList.classList.add('hidden'); return; }
    searchTimeout = setTimeout(() => fetchResults(q), 280);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-block')) resultsList.classList.add('hidden');
  });
}

async function fetchResults(q) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  renderResults(data);
}

function renderResults(results) {
  const list = document.getElementById('search-results');
  list.innerHTML = '';
  if (!results.length) {
    list.innerHTML = '<li style="color:#888;cursor:default">Aucun résultat trouvé</li>';
    list.classList.remove('hidden');
    return;
  }
  for (const r of results) {
    const li = document.createElement('li');
    const detail = [r.agrement, r.compteClt, r.ville].filter(Boolean).join(' · ');
    li.innerHTML = `<div class="res-nom">${r.nom || '(Nom inconnu)'}</div>
                    <div class="res-detail">${detail}</div>`;
    li.addEventListener('click', () => selectClient(r));
    list.appendChild(li);
  }
  list.classList.remove('hidden');
}

async function selectClient(r) {
  document.getElementById('search-results').classList.add('hidden');
  document.getElementById('search-input').value = r.nom || r.agrement || '';

  // Charger données complètes (inclut matériels OTCLAN)
  const id = r.compteClt || r.agrement || '';
  if (id) {
    const res = await fetch(`/api/client/${encodeURIComponent(id)}`);
    clientData = await res.json();
  } else {
    clientData = r;
  }

  prefillClient(clientData);
  renderEquipementsTable(clientData.equipements || {}, clientData.certGroups || []);
  prefillEquipements(clientData.equipements || {});
  autoSelectTypes(clientData.equipements || {}, clientData.certGroups || []);
  showClientForm();
}

/* ──────────────────────────────────────────
   SAISIE MANUELLE
────────────────────────────────────────── */
function setupSaisieManuelle() {
  document.getElementById('btn-saisie-manuelle').addEventListener('click', () => {
    clientData = {};
    clearClientForm();
    for (const k in originalEquipValues) delete originalEquipValues[k];
    initCtForms();
    // Masquer le panneau équipements pour la saisie manuelle
    document.getElementById('card-equipements')?.classList.add('hidden');
    const tbody = document.getElementById('eq-tbody');
    if (tbody) tbody.innerHTML = '';
    showClientForm();
  });
}

/* ──────────────────────────────────────────
   AFFICHER / PRÉ-REMPLIR FORMULAIRE CLIENT
────────────────────────────────────────── */
function showClientForm() {
  document.getElementById('form-client').classList.remove('hidden');
  document.getElementById('card-demandes').classList.remove('hidden');
  document.getElementById('submit-block').classList.remove('hidden');
}

/* ──────────────────────────────────────────
   TABLEAU DES ÉQUIPEMENTS DÉTECTÉS
────────────────────────────────────────── */
function renderEquipementsTable(eq, certGroups) {
  const tbody   = document.getElementById('eq-tbody');
  const card    = document.getElementById('card-equipements');
  const empty   = document.getElementById('eq-empty');
  const table   = document.getElementById('eq-table');
  const countEl = document.getElementById('eq-count');
  if (!tbody || !card) return;

  tbody.innerHTML = '';

  const all = [
    ...(eq.VL || []).map(m => ({ ...m, catLabel: 'VL' })),
    ...(eq.PL || []).map(m => ({ ...m, catLabel: 'PL' })),
    ...(eq.CL || []).map(m => ({ ...m, catLabel: 'CL' }))
  ];

  if (!all.length) {
    empty?.classList.remove('hidden');
    table?.classList.add('hidden');
    countEl && (countEl.textContent = '(aucun équipement trouvé)');
  } else {
    empty?.classList.add('hidden');
    table?.classList.remove('hidden');
    countEl && (countEl.textContent = `— ${all.length} équipement${all.length > 1 ? 's' : ''} trouvé${all.length > 1 ? 's' : ''}`);

    for (const m of all) {
      const tr = document.createElement('tr');
      const ver = esc(m.versionLog || '');
      const verProt = m.versionProtocole ? `<small>/${esc(m.versionProtocole)}</small>` : '';
      const src = m.source === 'otclan-cl' ? '<span class="eq-source-otclan" title="Agrément CL lié via OTCLAN">CL-OTCLAN</span>'
                : m.source === 'contrats'  ? '<span class="eq-source-contrat" title="Contrat/Correspondance">Contrat</span>'
                : '<span class="eq-source-otclan" title="OTCLAN">OTCLAN</span>';
      tr.innerHTML = `
        <td><span class="cat-badge cat-${esc(m.catLabel)}">${esc(m.catLabel)}</span></td>
        <td>${esc(m.materielConcerne)}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(m.modele)}">${esc(m.modele)}</td>
        <td><strong>${esc(m.numSerie)}</strong></td>
        <td class="ver-cell">${ver}${verProt}</td>
        <td class="cert-num">${esc(m.certOtclan || '')}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  card.classList.remove('hidden');
}

let eqPanelOpen = true;
function toggleEqPanel() {
  const panel = document.getElementById('eq-panel');
  const icon  = document.getElementById('eq-toggle-icon');
  if (!panel) return;
  eqPanelOpen = !eqPanelOpen;
  panel.style.display = eqPanelOpen ? '' : 'none';
  if (icon) icon.textContent = eqPanelOpen ? '▼ réduire' : '▶ afficher';
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function prefillClient(c) {
  setValue('agrement', c.agrement);
  setValue('compteClt', c.compteClt);
  setValue('nomCentre', c.nom);
  setValue('adresse', c.adresse);
  setValue('cp', c.cp);
  setValue('ville', c.ville);
  setValue('telephone', c.tel);
  setValue('email', c.email);
}

function clearClientForm() {
  ['agrement','compteClt','nomCentre','adresse','cp','ville','telephone','email'].forEach(id => setValue(id, ''));
}

/* ──────────────────────────────────────────
   LIGNES CT MULTIPLES (lignes parallèles VL/PL)
────────────────────────────────────────── */
const CT_LINE_DEF = {
  vl: [
    { key: 'pup',   label: 'Pupitre',    req: true  },
    { key: 'frein', label: 'Freinage',   req: true  },
    { key: 'rip',   label: 'Ripage',     req: false },
    { key: 'susp',  label: 'Suspension', req: false }
  ],
  pl: [
    { key: 'pup',   label: 'Pupitre',    req: true },
    { key: 'frein', label: 'Freinage',   req: true }
  ]
};
const ctLineCounters = { vl: 0, pl: 0, pol: 0, rph: 0 };

function initCtForms() {
  for (const k of ['vl', 'pl', 'pol', 'rph']) ctLineCounters[k] = 0;
  ['vl-lines-container', 'pl-lines-container', 'pol-lines-container', 'rph-lines-container']
    .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  addCtLine('vl');
  addCtLine('pl');
  addPolLine();
  addRphLine();
}

function addCtLine(type, prefillData) {
  const idx = ctLineCounters[type]++;
  const container = document.getElementById(`${type}-lines-container`);
  if (!container) return;
  const defs = CT_LINE_DEF[type];

  const lineEl = document.createElement('div');
  lineEl.className = 'ct-line-group';
  lineEl.id = `${type}-line-${idx}`;
  lineEl.dataset.idx = idx;

  const rows = defs.map(d => {
    const v = prefillData?.[d.key] || {};
    return `<tr>
      <td class="mat-label">${d.label}</td>
      <td><input type="text" id="${type}-${idx}-${d.key}-mod" value="${esc(v.modele||'')}"></td>
      <td><input type="text" id="${type}-${idx}-${d.key}-sn"  value="${esc(v.numSerie||'')}"></td>
      <td><input type="text" id="${type}-${idx}-${d.key}-ver" value="${esc(v.versionLog||'')}"></td>
    </tr>`;
  }).join('');

  const totalLines = container.querySelectorAll('.ct-line-group').length;

  // Sélecteur de chaîne FOG (saisie manuelle uniquement) — affiché seulement pour VL
  const fogSelector = type === 'vl' ? `
    <div class="chaine-type-row" style="margin:4px 0 6px;font-size:0.88em;color:#555">
      <span style="font-weight:600;margin-right:8px">Type chaîne :</span>
      <label class="radio-label"><input type="radio" name="vl-${idx}-chaine" value="" checked> XG Standard</label>
      <label class="radio-label"><input type="radio" name="vl-${idx}-chaine" value="FOG VL"> FOG VL</label>
      <label class="radio-label"><input type="radio" name="vl-${idx}-chaine" value="FOG VL+"> FOG VL+</label>
    </div>` : '';

  lineEl.innerHTML = `
    <div class="ct-line-header">
      <span class="ct-line-num">${type.toUpperCase()} – Ligne ${totalLines + 1}</span>
      <button type="button" class="btn-remove-line" onclick="removeCtLine('${type}',${idx})" style="display:none">× Supprimer cette ligne</button>
    </div>
    ${fogSelector}
    <table class="mat-input-table">
      <thead><tr><th>Matériel</th><th>Modèle</th><th>N° de série</th><th>Version logiciel</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  container.appendChild(lineEl);
  refreshRemoveButtons(`${type}-lines-container`);

  // Tracker les SNs pré-remplis
  if (prefillData) {
    for (const d of defs) {
      const v = prefillData[d.key];
      if (v && v.numSerie) {
        const idSn = `${type}-${idx}-${d.key}-sn`;
        const idMod = `${type}-${idx}-${d.key}-mod`;
        originalEquipValues[idSn] = {
          value: v.numSerie.trim(),
          agrement: (clientData && clientData.agrement) || '',
          materielConcerne: v.materielConcerne || '',
          modele: v.modele || '',
          idMod
        };
      }
    }
  }
}

function removeCtLine(type, idx) {
  document.getElementById(`${type}-line-${idx}`)?.remove();
  const container = document.getElementById(`${type}-lines-container`);
  container?.querySelectorAll('.ct-line-group').forEach((el, pos) => {
    const n = el.querySelector('.ct-line-num');
    if (n) n.textContent = `${type.toUpperCase()} – Ligne ${pos + 1}`;
  });
  refreshRemoveButtons(`${type}-lines-container`);
}

function getCtLineGroups(type) {
  return Array.from(document.querySelectorAll(`#${type}-lines-container .ct-line-group`));
}

/** Met à jour la visibilité du bouton Supprimer : visible si > 1 ligne, caché sinon */
function refreshRemoveButtons(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const lines = container.querySelectorAll('.ct-line-group');
  lines.forEach(el => {
    const btn = el.querySelector('.btn-remove-line');
    if (btn) btn.style.display = lines.length > 1 ? '' : 'none';
  });
}

/* ── LIGNES POLLUTION MULTIPLES ── */
function addPolLine(prefill) {
  const idx = ctLineCounters.pol++;
  const container = document.getElementById('pol-lines-container');
  if (!container) return;
  const polType = document.querySelector('input[name="pol-type"]:checked')?.value || '';
  const agHidden = (polType === 'ACTIGAS' || polType === 'ECOPOL') ? '' : ' hidden';

  const total = container.querySelectorAll('.ct-line-group').length;
  const v = prefill || {};
  const lineEl = document.createElement('div');
  lineEl.className = 'ct-line-group';
  lineEl.id = `pol-line-${idx}`;
  lineEl.dataset.idx = idx;
  // Calcul badge SK pour cette ligne à la création
  const agSnPrefill = v.ag?.numSerie || '';
  const skBadgeHtml = agSnPrefill
    ? `<span id="pol-${idx}-sk-badge" class="sk-badge sk-${isAgSK18Client(agSnPrefill) ? '18' : '08'}" style="margin-left:8px">${isAgSK18Client(agSnPrefill) ? 'SK18' : 'SK08'}</span>`
    : `<span id="pol-${idx}-sk-badge" class="sk-badge" style="display:none"></span>`;

  lineEl.innerHTML = `
    <div class="ct-line-header">
      <span class="ct-line-num">Ligne ${total + 1}</span>
      ${skBadgeHtml}
      <button type="button" class="btn-remove-line" onclick="removePolLine(${idx})" style="display:none">× Supprimer</button>
    </div>
    <table class="mat-input-table">
      <thead><tr><th>Matériel</th><th>Modèle</th><th>N° de série</th><th>Version logiciel</th></tr></thead>
      <tbody>
        <tr id="pol-${idx}-row-ag" class="${agHidden}">
          <td class="mat-label">Analyseur de gaz</td>
          <td><input type="text" id="pol-${idx}-ag-mod"  value="${esc(v.ag?.modele||'')}"></td>
          <td><input type="text" id="pol-${idx}-ag-sn"   value="${esc(v.ag?.numSerie||'')}"></td>
          <td><input type="text" id="pol-${idx}-ag-ver"  value="${esc(v.ag?.versionLog||'')}"></td>
        </tr>
        <tr>
          <td class="mat-label">Opacimètre</td>
          <td><input type="text" id="pol-${idx}-opa-mod" value="${esc(v.opa?.modele||'')}"></td>
          <td><input type="text" id="pol-${idx}-opa-sn"  value="${esc(v.opa?.numSerie||'')}"></td>
          <td><input type="text" id="pol-${idx}-opa-ver" value="${esc(v.opa?.versionLog||'')}"></td>
        </tr>
        <tr>
          <td class="mat-label">OBD</td>
          <td><input type="text" id="pol-${idx}-obd-mod" value="${esc(v.obd?.modele||'')}"></td>
          <td><input type="text" id="pol-${idx}-obd-sn"  value="${esc(v.obd?.numSerie||'')}"></td>
          <td><input type="text" id="pol-${idx}-obd-ver" value="${esc(v.obd?.versionLog||'')}"></td>
        </tr>
      </tbody>
    </table>`;
  container.appendChild(lineEl);
  refreshRemoveButtons('pol-lines-container');

  // Mettre à jour le badge SK quand l'utilisateur saisit/modifie le N° AG
  const agSnInput = document.getElementById(`pol-${idx}-ag-sn`);
  if (agSnInput) {
    agSnInput.addEventListener('input', () => {
      const badge = document.getElementById(`pol-${idx}-sk-badge`);
      if (!badge) return;
      const sn = agSnInput.value.trim();
      if (!sn) { badge.style.display = 'none'; return; }
      const sk18 = isAgSK18Client(sn);
      badge.textContent = sk18 ? 'SK18' : 'SK08';
      badge.className = 'sk-badge sk-' + (sk18 ? '18' : '08');
      badge.style.display = 'inline-block';
    });
  }

  // Tracker les SNs pré-remplis
  const trackPol = (key, mat) => {
    if (mat?.numSerie) {
      const idSn = `pol-${idx}-${key}-sn`;
      originalEquipValues[idSn] = {
        value: mat.numSerie.trim(), agrement: (clientData?.agrement)||'',
        materielConcerne: mat.materielConcerne||'', modele: mat.modele||'',
        idMod: `pol-${idx}-${key}-mod`
      };
    }
  };
  trackPol('ag', v.ag); trackPol('opa', v.opa); trackPol('obd', v.obd);
}

function removePolLine(idx) {
  document.getElementById(`pol-line-${idx}`)?.remove();
  document.querySelectorAll('#pol-lines-container .ct-line-group').forEach((el, pos) => {
    const n = el.querySelector('.ct-line-num'); if (n) n.textContent = `Ligne ${pos + 1}`;
  });
  refreshRemoveButtons('pol-lines-container');
}

function getPolLineGroups() {
  return Array.from(document.querySelectorAll('#pol-lines-container .ct-line-group'));
}

/* ── LIGNES RÈGLE PHARE MULTIPLES ── */
function addRphLine(prefill) {
  const idx = ctLineCounters.rph++;
  const container = document.getElementById('rph-lines-container');
  if (!container) return;
  const mod = (prefill?.modele || '').toLowerCase();
  const is7648 = mod.includes('764-8') || mod.includes('7648') ||
                 mod.includes('ccd touch') || mod.includes('n-reglephare');
  const slxChk = is7648 ? '' : 'checked';
  const t48Chk = is7648 ? 'checked' : '';

  const total = container.querySelectorAll('.ct-line-group').length;
  const v = prefill || {};
  const lineEl = document.createElement('div');
  lineEl.className = 'ct-line-group';
  lineEl.id = `rph-line-${idx}`;
  lineEl.dataset.idx = idx;
  lineEl.innerHTML = `
    <div class="ct-line-header">
      <span class="ct-line-num">Réglophare ${total + 1}</span>
      <button type="button" class="btn-remove-line" onclick="removeRphLine(${idx})" style="display:none">× Supprimer</button>
    </div>
    <div class="radio-group" style="padding:8px 12px 4px">
      <label class="radio-label"><input type="radio" name="rph-${idx}-type" value="SMARTLYNX" ${slxChk}> SMARTLYNX</label>
      <label class="radio-label"><input type="radio" name="rph-${idx}-type" value="764-8" ${t48Chk}> 764-8</label>
    </div>
    <table class="mat-input-table">
      <thead><tr><th>Matériel</th><th>Modèle</th><th>N° de série</th><th>Version logiciel</th></tr></thead>
      <tbody>
        <tr>
          <td class="mat-label">Règle phare</td>
          <td><input type="text" id="rph-${idx}-mod" value="${esc(v.modele||'')}"></td>
          <td><input type="text" id="rph-${idx}-sn"  value="${esc(v.numSerie||'')}"></td>
          <td><input type="text" id="rph-${idx}-ver" value="${esc(v.versionLog||'')}"></td>
        </tr>
      </tbody>
    </table>`;
  container.appendChild(lineEl);
  refreshRemoveButtons('rph-lines-container');

  if (v.numSerie) {
    const idSn = `rph-${idx}-sn`;
    originalEquipValues[idSn] = {
      value: v.numSerie.trim(), agrement: (clientData?.agrement)||'',
      materielConcerne: v.materielConcerne||'', modele: v.modele||'',
      idMod: `rph-${idx}-mod`
    };
  }
}

function removeRphLine(idx) {
  document.getElementById(`rph-line-${idx}`)?.remove();
  document.querySelectorAll('#rph-lines-container .ct-line-group').forEach((el, pos) => {
    const n = el.querySelector('.ct-line-num'); if (n) n.textContent = `Réglophare ${pos + 1}`;
  });
  refreshRemoveButtons('rph-lines-container');
}

function getRphLineGroups() {
  return Array.from(document.querySelectorAll('#rph-lines-container .ct-line-group'));
}

/* ──────────────────────────────────────────
   PRÉ-REMPLISSAGE ÉQUIPEMENTS
────────────────────────────────────────── */
function prefillEquipements(eq) {
  // Réinitialiser le suivi et les formulaires CT
  for (const k in originalEquipValues) delete originalEquipValues[k];
  ctLineCounters.vl = 0;
  ctLineCounters.pl = 0;
  const vlC = document.getElementById('vl-lines-container');
  const plC = document.getElementById('pl-lines-container');
  if (vlC) vlC.innerHTML = '';
  if (plC) plC.innerHTML = '';

  // Helper pour les champs statiques (pol, rph, dec, cl)
  function trackSN(idSn, idMod, mat) {
    if (mat && mat.numSerie) {
      originalEquipValues[idSn] = {
        value: mat.numSerie.trim(),
        agrement: (clientData && clientData.agrement) || '',
        materielConcerne: mat.materielConcerne || '',
        modele: mat.modele || '',
        idMod
      };
    }
  }
  function fill(idMod, idSn, idVer, mat) {
    setValue(idMod, mat.modele);
    setValue(idSn, mat.numSerie);
    setIfFilled(idVer, mat.versionLog);
    trackSN(idSn, idMod, mat);
  }
  function fillIfEmpty(idMod, idSn, idVer, mat) {
    if (getValue(idSn)) { setIfFilled(idVer, mat.versionLog); }
    else { fill(idMod, idSn, idVer, mat); }
  }

  // ── CT VL : lignes parallèles (1 freinomètre = 1 ligne) ──
  const vlMats  = eq.VL || [];
  const vlFreins = vlMats.filter(m => m.materielConcerne.toLowerCase().includes('frein'));
  const vlPups   = vlMats.filter(m => m.materielConcerne.toLowerCase().includes('pupitre'));
  const vlRips   = vlMats.filter(m => m.materielConcerne.toLowerCase().includes('ripage') || m.materielConcerne.toLowerCase().includes('plaque'));
  const vlSusps  = vlMats.filter(m => m.materielConcerne.toLowerCase().includes('suspension') || m.materielConcerne.toLowerCase().includes('eusama') || m.materielConcerne.toLowerCase().includes('banc de s'));

  const nVlLines = Math.max(1, vlFreins.length);
  for (let i = 0; i < nVlLines; i++) {
    addCtLine('vl', {
      pup:   vlPups[i]   ? { modele: vlPups[i].modele,   numSerie: vlPups[i].numSerie,   versionLog: vlPups[i].versionLog,   materielConcerne: vlPups[i].materielConcerne   } : null,
      frein: vlFreins[i] ? { modele: vlFreins[i].modele, numSerie: vlFreins[i].numSerie, versionLog: vlFreins[i].versionLog, materielConcerne: vlFreins[i].materielConcerne } : null,
      rip:   vlRips[i]   ? { modele: vlRips[i].modele,   numSerie: vlRips[i].numSerie,   versionLog: vlRips[i].versionLog,   materielConcerne: vlRips[i].materielConcerne   } : null,
      susp:  vlSusps[i]  ? { modele: vlSusps[i].modele,  numSerie: vlSusps[i].numSerie,  versionLog: vlSusps[i].versionLog,  materielConcerne: vlSusps[i].materielConcerne  } : null
    });
  }

  // ── CT PL : lignes parallèles ──
  const plMats   = eq.PL || [];
  const plFreins = plMats.filter(m => m.materielConcerne.toLowerCase().includes('frein'));
  const plPups   = plMats.filter(m => m.materielConcerne.toLowerCase().includes('pupitre'));

  const nPlLines = Math.max(1, plFreins.length);
  for (let i = 0; i < nPlLines; i++) {
    addCtLine('pl', {
      pup:   plPups[i]   ? { modele: plPups[i].modele,   numSerie: plPups[i].numSerie,   versionLog: plPups[i].versionLog,   materielConcerne: plPups[i].materielConcerne   } : null,
      frein: plFreins[i] ? { modele: plFreins[i].modele, numSerie: plFreins[i].numSerie, versionLog: plFreins[i].versionLog, materielConcerne: plFreins[i].materielConcerne } : null
    });
  }

  // ── Lignes pollution dynamiques (1 OPA = 1 ligne) ──
  ctLineCounters.pol = 0;
  document.getElementById('pol-lines-container').innerHTML = '';
  const allEq = [...vlMats, ...plMats, ...(eq.CL||[])];
  const polOPAs = allEq.filter(m => m.materielConcerne.toLowerCase().includes('opaci'));
  const polAGs  = allEq.filter(m => m.materielConcerne.toLowerCase().includes('analyseur') || m.materielConcerne.toLowerCase().includes('gaz'));
  const polOBDs = allEq.filter(m => m.materielConcerne.toLowerCase().includes('obd') || m.materielConcerne.toLowerCase().includes('lecteur'));
  const nPolLines = Math.max(1, polOPAs.length);
  for (let i = 0; i < nPolLines; i++) {
    addPolLine({ ag: polAGs[i]||null, opa: polOPAs[i]||null, obd: polOBDs[i]||null });
  }

  // ── Lignes règle phare dynamiques (1 réglophare = 1 ligne) ──
  ctLineCounters.rph = 0;
  document.getElementById('rph-lines-container').innerHTML = '';
  const isRphMC = mc => mc.includes('phare') || mc.includes('réglophare') || mc.includes('reglophare') || mc.includes('règle');
  const rphMats = [...vlMats, ...plMats].filter(m => isRphMC(m.materielConcerne.toLowerCase()));
  const nRphLines = Math.max(1, rphMats.length);
  for (let i = 0; i < nRphLines; i++) {
    addRphLine(rphMats[i] || null);
  }

  // ── Décéléromètre (statique, 1 par centre) ──
  const decMat = [...vlMats, ...plMats].find(m => {
    const mc = m.materielConcerne.toLowerCase();
    return mc.includes('decel') || mc.includes('décél') || mc.includes('autostop');
  });
  if (decMat) { fill('dec-mod', 'dec-sn', 'dec-ver', decMat); }

  // ── CL (Classe L : céléromètre, calibreur, sonomètre) ──
  // Le calibreur appartient UNIQUEMENT au sonomètre, jamais au céléromètre
  for (const mat of (eq.CL || [])) {
    const mc = mat.materielConcerne.toLowerCase();
    if (mc.includes('celer') || mc.includes('célér') || mc.includes('celér')) {
      fill('cl-cel-mod', 'cl-cel-sn', 'cl-cel-ver', mat);
      if (mat.certOtclan) { const f = document.getElementById('cl-cel-cert'); if (f) f.value = mat.certOtclan; }
    } else if (mc.includes('calibr')) {
      fill('cl-son-cal-mod', 'cl-son-cal-sn', 'cl-son-cal-ver', mat);
    } else if (mc.includes('sono')) {
      fill('cl-son-mod', 'cl-son-sn', 'cl-son-ver', mat);
      if (mat.certOtclan) { const f = document.getElementById('cl-son-cert'); if (f) f.value = mat.certOtclan; }
    }
  }
}

/* ──────────────────────────────────────────
   AUTO-SÉLECTION DES TYPES D'ATTESTATION
────────────────────────────────────────── */
function autoSelectTypes(eq, certGroups) {
  const vlMats = eq.VL || [];
  const plMats = eq.PL || [];
  const clMats = eq.CL || [];

  const hasMC = (list, ...keywords) =>
    list.some(m => keywords.some(k => m.materielConcerne.toLowerCase().includes(k)));
  const hasModele = (list, ...keywords) =>
    list.some(m => keywords.some(k => String(m.modele || '').toLowerCase().includes(k)));

  // ── CT (contrôle technique) — VL et PL indépendants ──
  const hasFreinVL = hasMC(vlMats, 'frein');
  const hasFreinPL = hasMC(plMats, 'frein');
  if (hasFreinVL || hasFreinPL) {
    checkBlock('block-ct');
    const cbVL = document.getElementById('ct-type-vl');
    const cbPL = document.getElementById('ct-type-pl');
    if (hasFreinVL && cbVL) { cbVL.checked = true; document.getElementById('ct-vl-form')?.classList.remove('hidden'); }
    if (hasFreinPL && cbPL) { cbPL.checked = true; document.getElementById('ct-pl-form')?.classList.remove('hidden'); }
  }

  // ── Règle phare (le type est sélectionné par ligne dans addRphLine via le modèle) ──
  const isRphMC = mc => mc.includes('phare') || mc.includes('réglophare') || mc.includes('reglophare') || mc.includes('règle');
  if ([...vlMats, ...plMats].some(m => isRphMC(m.materielConcerne.toLowerCase()))) {
    checkBlock('block-rph');
    // Le type par ligne a déjà été auto-sélectionné lors du prefill (dans addRphLine)
  }

  // ── Anti-pollution ──
  const allMats = [...vlMats, ...plMats, ...clMats];
  const hasAG  = hasMC(allMats, 'analyseur', 'gaz');
  const hasOpa = hasMC(allMats, 'opaci');
  const hasOBD = hasMC(allMats, 'obd', 'lecteur');
  const hasEcoshield = hasModele(allMats, 'ecoshield') || hasMC(allMats, 'ecoshield');
  if (hasAG || hasOpa || hasOBD) {
    checkBlock('block-pol');
    let polType;
    if (hasEcoshield) {
      polType = hasAG ? 'ECOPOL' : 'ECOSHIELD';
    } else {
      polType = hasAG ? 'ACTIGAS' : 'ACTIGAS_OPA'; // ACTIGAS sans AG = OPA+OBD seul
    }
    selectRadio('pol-type', polType);
    // Mettre à jour la visibilité des lignes AG dans toutes les lignes pollution
    document.querySelectorAll('[id$="-row-ag"]').forEach(row =>
      row.classList.toggle('hidden', polType !== 'ACTIGAS' && polType !== 'ECOPOL'));
    // Les badges SK08/SK18 sont affichés par ligne dans addPolLine (via prefillEquipements)
  }

  // ── Classe L ──
  const hasCelero = hasMC(clMats, 'celer', 'célér');
  const hasSono   = hasMC(clMats, 'sono');
  // Un sonomètre "lié pollution" (même certOtclan que l'AG) est inclus dans le certificat
  // pollution combiné → il n'est PAS listé séparément en Classe L seul
  const sonoLinkedToPol = (certGroups || []).some(g => {
    const mats = g.materiels || [];
    const hasSonoInGroup = mats.some(m => m.materielConcerne && m.materielConcerne.toLowerCase().includes('sono'));
    const hasPolInGroup  = mats.some(m => {
      const mc = (m.materielConcerne || '').toLowerCase();
      return mc.includes('analyseur') || mc.includes('gaz') || mc.includes('opaci') || mc.includes('obd');
    });
    return hasSonoInGroup && hasPolInGroup;
  });
  if (hasCelero || (hasSono && !sonoLinkedToPol)) {
    checkBlock('block-cl');
    if (hasCelero) {
      const cb = document.getElementById('cl-celero');
      if (cb) { cb.checked = true; document.getElementById('cl-celero-form')?.classList.remove('hidden'); }
    }
    if (hasSono && !sonoLinkedToPol) {
      const cb = document.getElementById('cl-sono');
      if (cb) { cb.checked = true; document.getElementById('cl-sono-form')?.classList.remove('hidden'); }
    }
  }

  // ── Décéléromètre ──
  const decMat = vlMats.find(m => m.materielConcerne.toLowerCase().includes('decel') || m.materielConcerne.toLowerCase().includes('décél') || m.materielConcerne.toLowerCase().includes('autostop'));
  if (decMat) {
    checkBlock('block-dec');
    const isMini = String(decMat.modele || '').toLowerCase().includes('mini') ||
                   String(decMat.modele || '').toLowerCase().includes('autostop mini');
    selectRadio('dec-type', isMini ? 'Autostop Mini' : 'Autostop Maxi');
  }
}

/** Coche la checkbox demande-toggle d'un bloc et affiche la section cible */
function checkBlock(blockId) {
  const block = document.getElementById(blockId);
  if (!block) return;
  const cb = block.querySelector('.demande-toggle');
  if (!cb || cb.checked) return;
  cb.checked = true;
  const target = document.getElementById(cb.dataset.target);
  if (target) target.classList.remove('hidden');
}

/** Sélectionne un radio par name+value */
function selectRadio(name, value) {
  const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
}

/* ──────────────────────────────────────────
   DEMANDES : toggle sections + radios
────────────────────────────────────────── */
function setupDemandes() {
  // Toggle sections on checkbox
  document.querySelectorAll('.demande-toggle').forEach(cb => {
    cb.addEventListener('change', () => {
      const target = document.getElementById(cb.dataset.target);
      target.classList.toggle('hidden', !cb.checked);
    });
  });

  // CT type checkboxes (VL et PL indépendants — un centre peut avoir les deux)
  document.getElementById('ct-type-vl')?.addEventListener('change', e => {
    document.getElementById('ct-vl-form')?.classList.toggle('hidden', !e.target.checked);
  });
  document.getElementById('ct-type-pl')?.addEventListener('change', e => {
    document.getElementById('ct-pl-form')?.classList.toggle('hidden', !e.target.checked);
  });

  // Anti-pollution : afficher/masquer la ligne AG dans TOUTES les lignes pollution
  document.querySelectorAll('input[name="pol-type"]').forEach(r => {
    r.addEventListener('change', () => {
      const val = document.querySelector('input[name="pol-type"]:checked')?.value || '';
      const hasAG = (val === 'ACTIGAS' || val === 'ECOPOL');
      document.querySelectorAll('[id$="-row-ag"]').forEach(row => row.classList.toggle('hidden', !hasAG));
    });
  });

  // Classe L checkboxes
  document.getElementById('cl-celero').addEventListener('change', e => {
    document.getElementById('cl-celero-form').classList.toggle('hidden', !e.target.checked);
  });
  document.getElementById('cl-sono').addEventListener('change', e => {
    document.getElementById('cl-sono-form').classList.toggle('hidden', !e.target.checked);
  });
}

/* ──────────────────────────────────────────
   COLLECTE ET SOUMISSION
────────────────────────────────────────── */
function setupSubmit() {
  document.getElementById('btn-submit').addEventListener('click', submitDemande);
}

/* ── Helpers validation visuelle ── */
function clearErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
}

function markError(elOrId) {
  const el = (typeof elOrId === 'string') ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  el.classList.add('field-error');
  const clear = () => el.classList.remove('field-error');
  el.addEventListener('input',  clear, { once: true });
  el.addEventListener('change', clear, { once: true });
  el.addEventListener('click',  clear, { once: true });
}

async function submitDemande() {
  clearErrors();
  let firstError = null;

  function err(elOrId) {
    const el = (typeof elOrId === 'string') ? document.getElementById(elOrId) : elOrId;
    if (!el) return;
    markError(el);
    if (!firstError) firstError = el;
  }

  // ── PHASE 1 : TOUTES LES VALIDATIONS ──────────────────────────

  // Infos centre
  if (!getValue('nomCentre')) err('nomCentre');
  if (!getValue('email'))     err('email');
  if (!document.getElementById('confirm-client')?.checked)
    err(document.getElementById('confirm-client')?.closest('.confirm-row'));

  // Au moins un bloc coché
  const anyBlock = ['block-ct','block-rph','block-pol','block-cl','block-dec','block-paj']
    .some(id => blockChecked(id));
  if (!anyBlock) err(document.getElementById('card-demandes')?.querySelector('.card-header'));

  // CT
  if (blockChecked('block-ct')) {
    const doVL = document.getElementById('ct-type-vl')?.checked;
    const doPL = document.getElementById('ct-type-pl')?.checked;
    if (!doVL && !doPL) err(document.querySelector('#ct-detail .checkbox-group'));
    if (!document.getElementById('confirm-ct')?.checked)
      err(document.getElementById('confirm-ct')?.closest('.confirm-row'));
    if (doVL) {
      for (const lineEl of getCtLineGroups('vl')) {
        const idx = parseInt(lineEl.dataset.idx);
        if (!getValue(`vl-${idx}-pup-sn`))   err(`vl-${idx}-pup-sn`);
        if (!getValue(`vl-${idx}-frein-sn`)) err(`vl-${idx}-frein-sn`);
      }
    }
    if (doPL) {
      for (const lineEl of getCtLineGroups('pl')) {
        const idx = parseInt(lineEl.dataset.idx);
        if (!getValue(`pl-${idx}-pup-sn`))   err(`pl-${idx}-pup-sn`);
        if (!getValue(`pl-${idx}-frein-sn`)) err(`pl-${idx}-frein-sn`);
      }
    }
  }

  // Règle phare
  if (blockChecked('block-rph')) {
    if (!document.getElementById('confirm-rph')?.checked)
      err(document.getElementById('confirm-rph')?.closest('.confirm-row'));
    for (const group of getRphLineGroups()) {
      const idx = parseInt(group.dataset.idx);
      if (!document.querySelector(`input[name="rph-${idx}-type"]:checked`))
        err(group.querySelector('.radio-group'));
      if (!getValue(`rph-${idx}-sn`)) err(`rph-${idx}-sn`);
    }
  }

  // Anti-pollution
  if (blockChecked('block-pol')) {
    const polType = document.querySelector('input[name="pol-type"]:checked')?.value;
    if (!polType) err(document.querySelector('#pol-detail .radio-group'));
    if (!document.getElementById('confirm-pol')?.checked)
      err(document.getElementById('confirm-pol')?.closest('.confirm-row'));
    for (const group of getPolLineGroups()) {
      const idx = parseInt(group.dataset.idx);
      if (!getValue(`pol-${idx}-opa-sn`)) err(`pol-${idx}-opa-sn`);
      if (!getValue(`pol-${idx}-obd-sn`)) err(`pol-${idx}-obd-sn`);
      if ((polType === 'ACTIGAS' || polType === 'ECOPOL') && !getValue(`pol-${idx}-ag-sn`))
        err(`pol-${idx}-ag-sn`);
    }
  }

  // Classe L
  if (blockChecked('block-cl')) {
    const hasCelero = document.getElementById('cl-celero').checked;
    const hasSono   = document.getElementById('cl-sono').checked;
    if (!hasCelero && !hasSono) err(document.querySelector('#cl-detail .checkbox-group'));
    if (hasCelero && !getValue('cl-cel-sn'))     err('cl-cel-sn');
    if (hasSono   && !getValue('cl-son-sn'))     err('cl-son-sn');
    if (hasSono   && !getValue('cl-son-cal-sn')) err('cl-son-cal-sn');
    if (!document.getElementById('confirm-cl')?.checked)
      err(document.getElementById('confirm-cl')?.closest('.confirm-row'));
  }

  // Décéléromètre
  if (blockChecked('block-dec')) {
    if (!document.querySelector('input[name="dec-type"]:checked'))
      err(document.querySelector('#dec-detail .radio-group'));
    if (!getValue('dec-sn')) err('dec-sn');
    if (!document.getElementById('confirm-dec')?.checked)
      err(document.getElementById('confirm-dec')?.closest('.confirm-row'));
  }

  // PAJ
  if (blockChecked('block-paj')) {
    if (!getValue('paj-ch-sn')) err('paj-ch-sn');
    if (!getValue('paj-cp-sn')) err('paj-cp-sn');
    if (!document.getElementById('confirm-paj')?.checked)
      err(document.getElementById('confirm-paj')?.closest('.confirm-row'));
  }

  // Si au moins une erreur → scroll vers la première et arrêt
  if (firstError) {
    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // ── PHASE 2 : CONSTRUCTION DES SECTIONS (toutes les valeurs sont valides) ──

  const sections = [];

  // CT
  if (blockChecked('block-ct')) {
    const doVL = document.getElementById('ct-type-vl')?.checked;
    const doPL = document.getElementById('ct-type-pl')?.checked;
    if (doVL) {
      for (const lineEl of getCtLineGroups('vl')) {
        const idx = parseInt(lineEl.dataset.idx);
        const chaineType = document.querySelector(`input[name="vl-${idx}-chaine"]:checked`)?.value || '';
        sections.push({ type: 'ct', sousType: 'VL', chaineType, materiels: [
          { label: 'Pupitre',    modele: getValue(`vl-${idx}-pup-mod`),  numSerie: getValue(`vl-${idx}-pup-sn`),   versionLog: getValue(`vl-${idx}-pup-ver`) },
          { label: 'Freinage',   modele: getValue(`vl-${idx}-frein-mod`),numSerie: getValue(`vl-${idx}-frein-sn`), versionLog: getValue(`vl-${idx}-frein-ver`) },
          { label: 'Ripage',     modele: getValue(`vl-${idx}-rip-mod`),  numSerie: getValue(`vl-${idx}-rip-sn`),   versionLog: getValue(`vl-${idx}-rip-ver`) },
          { label: 'Suspension', modele: getValue(`vl-${idx}-susp-mod`), numSerie: getValue(`vl-${idx}-susp-sn`),  versionLog: getValue(`vl-${idx}-susp-ver`) }
        ]});
      }
    }
    if (doPL) {
      for (const lineEl of getCtLineGroups('pl')) {
        const idx = parseInt(lineEl.dataset.idx);
        sections.push({ type: 'ct', sousType: 'PL', materiels: [
          { label: 'Pupitre',  modele: getValue(`pl-${idx}-pup-mod`),  numSerie: getValue(`pl-${idx}-pup-sn`),   versionLog: getValue(`pl-${idx}-pup-ver`) },
          { label: 'Freinage', modele: getValue(`pl-${idx}-frein-mod`),numSerie: getValue(`pl-${idx}-frein-sn`), versionLog: getValue(`pl-${idx}-frein-ver`) }
        ]});
      }
    }
  }

  // Règle phare
  if (blockChecked('block-rph')) {
    for (const group of getRphLineGroups()) {
      const idx  = parseInt(group.dataset.idx);
      const type = document.querySelector(`input[name="rph-${idx}-type"]:checked`)?.value;
      sections.push({ type: 'reglophare', sousType: type, materiels: [
        { label: 'Règle phare', modele: getValue(`rph-${idx}-mod`), numSerie: getValue(`rph-${idx}-sn`), versionLog: getValue(`rph-${idx}-ver`) }
      ]});
    }
  }

  // Anti-pollution
  if (blockChecked('block-pol')) {
    const polType = document.querySelector('input[name="pol-type"]:checked')?.value;
    for (const group of getPolLineGroups()) {
      const idx = parseInt(group.dataset.idx);
      sections.push({ type: 'pollution', sousType: polType, materiels: [
        { label: 'Analyseur de gaz', modele: getValue(`pol-${idx}-ag-mod`),  numSerie: getValue(`pol-${idx}-ag-sn`),  versionLog: getValue(`pol-${idx}-ag-ver`) },
        { label: 'Opacimètre',       modele: getValue(`pol-${idx}-opa-mod`), numSerie: getValue(`pol-${idx}-opa-sn`), versionLog: getValue(`pol-${idx}-opa-ver`) },
        { label: 'OBD',              modele: getValue(`pol-${idx}-obd-mod`), numSerie: getValue(`pol-${idx}-obd-sn`), versionLog: getValue(`pol-${idx}-obd-ver`) }
      ]});
    }
  }

  // Classe L
  if (blockChecked('block-cl')) {
    const hasCelero = document.getElementById('cl-celero').checked;
    const hasSono   = document.getElementById('cl-sono').checked;
    if (hasCelero && hasSono) {
      const sonoPollution = document.querySelector('input[name="sono-pol-type"]:checked')?.value || '';
      sections.push({ type: 'classeL', sousType: 'SONOCELERO',
        certOtclan:    getValue('cl-son-cert'),
        certOtclanCel: getValue('cl-cel-cert'),
        versionLog:    getValue('cl-son-ver'),
        sonoPollution,
        materiels: [
          { label: 'Sonomètre',   modele: getValue('cl-son-mod'),     numSerie: getValue('cl-son-sn'),     versionLog: getValue('cl-son-ver') },
          { label: 'Calibreur',   modele: getValue('cl-son-cal-mod'), numSerie: getValue('cl-son-cal-sn'), versionLog: getValue('cl-son-cal-ver') },
          { label: 'Célérométre', modele: getValue('cl-cel-mod'),     numSerie: getValue('cl-cel-sn'),     versionLog: getValue('cl-cel-ver') }
        ]
      });
    } else if (hasCelero) {
      sections.push({ type: 'classeL', sousType: 'CELEROMETRE',
        certOtclan: getValue('cl-cel-cert'),
        versionLog:  getValue('cl-cel-ver'),
        materiels: [
          { label: 'Célérométre', modele: getValue('cl-cel-mod'), numSerie: getValue('cl-cel-sn'), versionLog: getValue('cl-cel-ver') }
        ]
      });
    } else if (hasSono) {
      const sonoPollution = document.querySelector('input[name="sono-pol-type"]:checked')?.value || '';
      sections.push({ type: 'classeL', sousType: 'SONOMETRE',
        certOtclan:    getValue('cl-son-cert'),
        versionLog:    getValue('cl-son-ver'),
        sonoPollution,
        materiels: [
          { label: 'Sonomètre',  modele: getValue('cl-son-mod'),     numSerie: getValue('cl-son-sn'),     versionLog: getValue('cl-son-ver') },
          { label: 'Calibreur',  modele: getValue('cl-son-cal-mod'), numSerie: getValue('cl-son-cal-sn'), versionLog: getValue('cl-son-cal-ver') }
        ]
      });
    }
  }

  // Décéléromètre
  if (blockChecked('block-dec')) {
    const type = document.querySelector('input[name="dec-type"]:checked')?.value;
    sections.push({ type: 'decelero', sousType: type, materiels: [
      { label: 'Décéléromètre', modele: getValue('dec-mod'), numSerie: getValue('dec-sn'), versionLog: getValue('dec-ver') }
    ]});
  }

  // PAJ
  if (blockChecked('block-paj')) {
    sections.push({ type: 'paj', sousType: '', materiels: [
      { label: 'Centrale Hydraulique', modele: getValue('paj-ch-mod'), numSerie: getValue('paj-ch-sn'), marque: getValue('paj-ch-marque') },
      { label: 'Châssis PAJ',          modele: getValue('paj-cp-mod'), numSerie: getValue('paj-cp-sn'), marque: getValue('paj-cp-marque') }
    ]});
  }

  // ── PHASE 3 : ENVOI ───────────────────────────────────────────

  const payload = {
    agrement: getValue('agrement'),
    compteClt: getValue('compteClt'),
    nomCentre: getValue('nomCentre'),
    adresse: getValue('adresse'),
    cp: getValue('cp'),
    ville: getValue('ville'),
    telephone: getValue('telephone'),
    email: getValue('email'),
    sections
  };

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.textContent = 'Envoi en cours…';

  try {
    const res = await fetch('/api/demandes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok) {
      showConfirmation(payload, sections.length);
    } else {
      alert('Erreur lors de l\'envoi. Veuillez réessayer.');
      btn.disabled = false;
      btn.textContent = 'Soumettre ma demande d\'attestation';
    }
  } catch {
    alert('Erreur réseau. Vérifiez votre connexion.');
    btn.disabled = false;
    btn.textContent = 'Soumettre ma demande d\'attestation';
  }
}

function showConfirmation(payload, nbAttestations) {
  document.getElementById('card-client').classList.add('hidden');
  document.getElementById('card-demandes').classList.add('hidden');
  document.getElementById('submit-block').classList.add('hidden');
  const panel = document.getElementById('confirmation-panel');
  panel.classList.remove('hidden');
  document.getElementById('confirm-text').innerHTML =
    `Votre demande de <strong>${nbAttestations} attestation${nbAttestations > 1 ? 's' : ''}</strong> a bien été envoyée au service qualité.<br>
     Vous recevrez une confirmation à l'adresse <strong>${payload.email}</strong>.<br><br>
     <em>Le service qualité Muller Automotive vous remercie.</em>`;
}

/* ── Helpers ── */
function getValue(id) { return (document.getElementById(id)?.value || '').trim(); }
function setValue(id, val) { const el = document.getElementById(id); if (el) el.value = val || ''; }
/** Écrit val dans le champ uniquement si val est non vide (ne jamais écraser une bonne valeur par vide) */
function setIfFilled(id, val) { if (val) setValue(id, val); }

// Vérifie si la checkbox "demande-toggle" d'un bloc est cochée
function blockChecked(blockId) {
  const cb = document.querySelector(`#${blockId} .demande-toggle`);
  return cb ? cb.checked : false;
}

/* ──────────────────────────────────────────
   SUIVI MODIFICATIONS N° DE SÉRIE (remplacement matériel)
────────────────────────────────────────── */
function setupChangeTracking() {
  // Délégation d'événements sur card-demandes — couvre les champs statiques ET
  // les champs CT créés dynamiquement (lignes parallèles ajoutées après DOM ready)
  const card = document.getElementById('card-demandes');
  if (!card) return;
  card.addEventListener('change', function(e) {
    const field = e.target;
    if (field.tagName !== 'INPUT') return;
    if (!field.id || !field.id.endsWith('-sn')) return;
    const orig = originalEquipValues[field.id];
    if (!orig) return;
    const newSN = field.value.trim();
    if (!newSN || newSN === orig.value) return;
    const idMod  = orig.idMod || field.id.replace(/-sn$/, '-mod');
    const newMod = (document.getElementById(idMod)?.value || '').trim();
    showReplacementModal(field.id, idMod, orig, newSN, newMod);
  });
}

function showReplacementModal(idSn, idMod, orig, newSN, newMod) {
  _pendingReplacement = { idSn, idMod, orig, newSN, newMod };
  const modal = document.getElementById('modal-replace-sn');
  if (!modal) {
    // Fallback navigateur
    if (confirm(`Changer le N° de série ?\n${orig.value}  →  ${newSN}\n\nCette modification sera enregistrée dans la base de données.`)) {
      confirmReplacement();
    } else {
      cancelReplacement();
    }
    return;
  }
  document.getElementById('modal-replace-old').textContent = orig.value;
  document.getElementById('modal-replace-new').textContent = newSN;
  modal.classList.remove('hidden');
}

async function confirmReplacement() {
  if (!_pendingReplacement) return;
  const { idSn, idMod, orig, newSN, newMod } = _pendingReplacement;
  _pendingReplacement = null;
  document.getElementById('modal-replace-sn')?.classList.add('hidden');

  if (!orig.agrement || !orig.materielConcerne) {
    // Pas de contexte BDD — juste mettre à jour le suivi local
    originalEquipValues[idSn] = { ...orig, value: newSN, modele: newMod || orig.modele };
    return;
  }

  try {
    const res = await fetch('/api/equipement/replace-sn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agrement: orig.agrement,
        materielConcerne: orig.materielConcerne,
        oldSN: orig.value,
        newSN,
        newModele: newMod || undefined
      })
    });
    const data = await res.json();
    if (data.ok) {
      // Mettre à jour le suivi local avec le nouveau SN
      originalEquipValues[idSn] = { ...orig, value: newSN, modele: newMod || orig.modele };
    }
  } catch (e) {
    console.error('Erreur replace-sn :', e);
  }
}

function cancelReplacement() {
  if (!_pendingReplacement) return;
  const { idSn, orig } = _pendingReplacement;
  _pendingReplacement = null;
  // Restaurer l'ancienne valeur
  setValue(idSn, orig.value);
  document.getElementById('modal-replace-sn')?.classList.add('hidden');
}

/**
 * Détermine si un analyseur de gaz relève du certificat SK18 (sinon SK08).
 * Format SN : "NNN/YY"  ex: "164/17" → SK08,  "192/18" → SK08,  "101/18" → SK18,  "045/22" → SK18
 */
function isAgSK18Client(sn) {
  const m = String(sn || '').match(/^(\d+)\/(\d{2})$/);
  if (!m) return false;
  const num = parseInt(m[1], 10), year = parseInt(m[2], 10);
  if (year < 18) return false;
  if (year > 18) return true;
  return num >= 101;
}
