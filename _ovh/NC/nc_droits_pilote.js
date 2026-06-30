// nc_droits_pilote.js — v1.0 — Muller Automotive
// Module : droits chef produit / pilote — affichage, tableau de bord, réponse CAPA
// ISO §5.3 (rôles) · §10.2.1c (actions) · §10.2.2 (traçabilité)
'use strict';

(function () {

  /* ══════════════════════════════════════════════════════════════════
     RÔLES — alignés sur session.role du système
  ══════════════════════════════════════════════════════════════════ */
  function _role()  { return (typeof session !== 'undefined' && session?.role)  || 'nc_lecteur'; }
  function _email() { return (typeof session !== 'undefined' && session?.email) || ''; }
  function _name()  { return (typeof session !== 'undefined' && session?.name)  || ''; }

  function isAdmin()  { return _role() === 'nc_admin'; }
  function isChef()   { return _role() === 'nc_chef_produit'; }
  function isPilote() { return _role() === 'nc_pilote_attribue'; }

  // ISO §5.3 — Principe de moindre privilège
  function peutRepondreAction(action, userEmail) {
    if (isAdmin()) return true;
    if (isChef() || isPilote()) {
      const resp = action.pilote_email || action.responsable_email || action.pilote || '';
      return resp.toLowerCase() === (userEmail || '').toLowerCase();
    }
    return false;
  }

  /* ══════════════════════════════════════════════════════════════════
     JOURNAL — ISO §10.2.2 — traçabilité immuable
  ══════════════════════════════════════════════════════════════════ */
  function _journal(entry) {
    if (window.NcParent?.Store?.addJournal) {
      NcParent.Store.addJournal({ ts: new Date().toISOString(), ...entry });
    } else {
      console.info('[NcDroits journal]', entry);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     CSS — Tableau de bord & formulaire réponse
  ══════════════════════════════════════════════════════════════════ */
  const CSS = `
    #ncd-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:14000;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}
    #ncd-modal{background:#fff;border-radius:12px;width:100%;max-width:900px;max-height:calc(100vh - 40px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.3)}
    #ncd-modal *{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}
    .ncd-hdr{background:#0c447c;color:#fff;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
    .ncd-hdr-t{font-size:15px;font-weight:700}
    .ncd-x{background:none;border:none;color:rgba(255,255,255,.7);font-size:20px;cursor:pointer;padding:2px 8px;border-radius:4px;line-height:1}
    .ncd-x:hover{background:rgba(255,255,255,.15)}
    .ncd-body{padding:20px;overflow-y:auto;flex:1}
    .ncd-kpi-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:12px;margin-bottom:20px}
    .ncd-kpi{background:#f8f9fa;border:1px solid #dee2e6;border-radius:8px;padding:12px 14px;text-align:center}
    .ncd-kpi-val{font-size:26px;font-weight:700;color:#0c447c}
    .ncd-kpi-lbl{font-size:11px;color:#6c757d;margin-top:3px}
    .ncd-kpi.warn .ncd-kpi-val{color:#791F1F}
    .ncd-kpi.amber .ncd-kpi-val{color:#633806}
    .ncd-sec{font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:.05em;margin:18px 0 10px;padding-bottom:6px;border-bottom:1px solid #e9ecef}
    .ncd-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px}
    .ncd-tbl th{background:#f0f6ff;color:#0c447c;padding:8px 10px;text-align:left;font-weight:600;font-size:11px;border-bottom:2px solid #85B7EB}
    .ncd-tbl td{padding:7px 10px;border-bottom:1px solid #f0f0f0;vertical-align:middle}
    .ncd-tbl tr:hover td{background:#f8fbff;cursor:pointer}
    .ncd-pill{display:inline-block;font-size:10px;font-weight:700;padding:1px 8px;border-radius:8px}
    .np-ret{background:#FCEBEB;color:#791F1F;border:1px solid #F09595}
    .np-oc{background:#E6F1FB;color:#0c447c;border:1px solid #85B7EB}
    .np-ok{background:#EAF3DE;color:#27500A;border:1px solid #97C459}
    .np-att{background:#FAEEDA;color:#633806;border:1px solid #EF9F27}
    .ncd-empty{text-align:center;padding:28px;color:#adb5bd;font-size:13px}
    /* Réponse CAPA */
    #ncd-rep-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:15000;display:flex;align-items:center;justify-content:center;padding:20px}
    #ncd-rep-modal{background:#fff;border-radius:12px;width:100%;max-width:580px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.3)}
    #ncd-rep-modal *{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}
    .nrd-hdr{background:#0c447c;color:#fff;padding:13px 18px;display:flex;align-items:center;justify-content:space-between;border-radius:12px 12px 0 0}
    .nrd-body{padding:18px}
    .nrd-f{margin-bottom:14px}
    .nrd-lbl{font-size:11px;font-weight:700;color:#495057;text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px}
    .nrd-ta{width:100%;padding:8px 10px;border:1.5px solid #dee2e6;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;min-height:88px}
    .nrd-ta:focus,.nrd-sel:focus{border-color:#0c447c;outline:none}
    .nrd-sel{width:100%;padding:8px 10px;border:1.5px solid #dee2e6;border-radius:6px;font-size:13px;font-family:inherit;background:#fff}
    .nrd-ft{display:flex;gap:10px;justify-content:flex-end;padding:12px 18px;border-top:1px solid #e9ecef}
    .nrd-btn-p{padding:8px 20px;background:#0c447c;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer}
    .nrd-btn-s{padding:8px 20px;background:#f0f0f0;color:#495057;border:none;border-radius:6px;font-size:13px;cursor:pointer}
    .nrd-info{background:#E6F1FB;border:1px solid #85B7EB;border-radius:6px;padding:10px 13px;font-size:12px;color:#0c447c;margin-bottom:14px}
    .nrd-err{background:#FCEBEB;border:1px solid #F09595;border-radius:6px;padding:8px 12px;font-size:12px;color:#791F1F;margin-bottom:10px;display:none}
    /* Badge pilote liste */
    .ncd-plt-badge{font-size:11px;font-weight:600;color:#0c447c}
    .ncd-plt-none{font-size:11px;color:#adb5bd}
    /* Bouton header */
    #ncd-db-btn{padding:6px 13px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:6px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;margin-left:10px}
    #ncd-db-btn:hover{background:rgba(255,255,255,.25)}
  `;

  function _injectCSS() {
    if (document.getElementById('ncd-styles')) return;
    const s = document.createElement('style'); s.id = 'ncd-styles'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════════════
     CORRECTION A — Affichage pilote attribué
  ══════════════════════════════════════════════════════════════════ */
  function _piloteBadgeHtml(nc) {
    if (!nc?.pilote) return '<span class="ncd-plt-none">Non attribué</span>';
    const col = nc.statut === 'clos' ? '#27500A' : '#0c447c';
    const bg  = nc.statut === 'clos' ? '#EAF3DE' : '#E6F1FB';
    const brd = nc.statut === 'clos' ? '#97C459' : '#85B7EB';
    return `<span style="background:${bg};color:${col};font-size:11px;padding:2px 10px;border-radius:10px;font-weight:700;border:1px solid ${brd}" title="Pilote attribué">&#128101; ${nc.pilote}</span>`;
  }

  function injectPiloteInModal(nc) {
    const body = document.getElementById('modal-body');
    if (!body || !nc || body.querySelector('.ncd-pilote-bloc')) return;
    const div = document.createElement('div');
    div.className = 'ncd-pilote-bloc';
    div.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:9px 14px;background:#f8f9fa;border-radius:8px;border:1px solid #dee2e6;font-size:13px';
    div.innerHTML = `<span style="color:#6c757d;font-weight:600;font-size:12px">Pilote attribué :</span> ${_piloteBadgeHtml(nc)}`;
    const anchor = body.querySelector('.modal-section, h3, .form-row, div') || body.firstElementChild;
    if (anchor) body.insertBefore(div, anchor);
    else body.prepend(div);
  }

  function injectPiloteBadgesInList() {
    const list = typeof allNC !== 'undefined' ? allNC : [];
    document.querySelectorAll('#nc-tbody tr.row-link').forEach(row => {
      const numEl = row.querySelector('[data-col="numero"] .nc-num');
      if (!numEl) return;
      const nc = list.find(n => n.numero === numEl.textContent.trim());
      if (!nc) return;
      const cell = row.querySelector('[data-col="pilote"]');
      if (!cell || cell.querySelector('.ncd-plt-badge,.ncd-plt-none')) return;
      if (!nc.pilote) {
        if (!cell.textContent.trim() || cell.textContent.trim() === '—')
          cell.innerHTML = '<span class="ncd-plt-none">Non attribué</span>';
        return;
      }
      const span = document.createElement('span');
      span.className = 'ncd-plt-badge';
      span.textContent = nc.pilote;
      cell.innerHTML = ''; cell.appendChild(span);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     CORRECTION B — Tableau de bord chef produit / pilote
  ══════════════════════════════════════════════════════════════════ */
  function openDashboard() {
    _injectCSS();
    if (document.getElementById('ncd-ov')) return;
    const myEmail = _email(), myName = _name();
    const ncList  = typeof allNC !== 'undefined' ? allNC : [];

    const mesNC = ncList.filter(nc => {
      const p = (nc.pilote || nc.piloteAttribue || '').toLowerCase();
      return p === myEmail.toLowerCase() || p === myName.toLowerCase();
    });

    const mesCapas = [];
    ncList.forEach(nc => (nc.actions || []).forEach(a => {
      const resp = (a.pilote_email || a.responsable_email || a.pilote || '').toLowerCase();
      if (resp === myEmail.toLowerCase()) mesCapas.push({ ...a, _nc: nc.numero, _nc_d: nc.description });
    }));

    const now    = new Date();
    const retard = mesCapas.filter(a => a.echeance && new Date(a.echeance) < now && a.statut !== 'cloturé');
    const valider= mesNC.filter(nc => (nc.actions||[]).some(a => a.statut === 'realisee' && !a.preuve_efficacite));
    const delais = mesNC.filter(n => n._duree != null).map(n => n._duree);
    const delMoy = delais.length ? Math.round(delais.reduce((s,d) => s+d,0)/delais.length) : null;
    const echOk  = mesCapas.filter(a => a.echeance && new Date(a.echeance) >= now).length;
    const txEch  = mesCapas.filter(a=>a.echeance).length ? Math.round(100*echOk/mesCapas.filter(a=>a.echeance).length) : null;

    const ov = document.createElement('div'); ov.id = 'ncd-ov';
    ov.innerHTML = `<div id="ncd-modal">
      <div class="ncd-hdr">
        <span class="ncd-hdr-t">&#128101; Mon tableau de bord — ${myName||myEmail}</span>
        <button class="ncd-x" onclick="NcDroits.closeDashboard()">&#10005;</button>
      </div>
      <div class="ncd-body">
        <div class="ncd-kpi-row">
          <div class="ncd-kpi"><div class="ncd-kpi-val">${mesNC.length}</div><div class="ncd-kpi-lbl">Mes NC</div></div>
          <div class="ncd-kpi"><div class="ncd-kpi-val">${mesCapas.length}</div><div class="ncd-kpi-lbl">Mes actions CAPA</div></div>
          <div class="ncd-kpi ${retard.length?'warn':''}"><div class="ncd-kpi-val">${retard.length}</div><div class="ncd-kpi-lbl">En retard &#9888;</div></div>
          <div class="ncd-kpi ${valider.length?'amber':''}"><div class="ncd-kpi-val">${valider.length}</div><div class="ncd-kpi-lbl">À valider</div></div>
          <div class="ncd-kpi"><div class="ncd-kpi-val">${delMoy!=null?delMoy+'j':'—'}</div><div class="ncd-kpi-lbl">Délai moyen</div></div>
          <div class="ncd-kpi ${txEch!=null&&txEch<70?'warn':''}"><div class="ncd-kpi-val">${txEch!=null?txEch+'%':'—'}</div><div class="ncd-kpi-lbl">Respect échéances</div></div>
        </div>

        <div class="ncd-sec">Mes NC (pilote attribué)</div>
        ${mesNC.length===0?'<div class="ncd-empty">Aucune NC assignée à votre compte.</div>':`
        <table class="ncd-tbl"><thead><tr><th>Numéro</th><th>Description</th><th>Gravité</th><th>Statut</th><th>Durée</th></tr></thead><tbody>
          ${mesNC.map(nc=>`<tr onclick="openModal&&openModal('${nc.numero}');NcDroits.closeDashboard()">
            <td style="font-family:monospace;font-weight:700;color:#0c447c;white-space:nowrap">${nc.numero}</td>
            <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(nc.description||'—').substring(0,60)}</td>
            <td><span class="${nc.gravite==='critique'?'g-crit':nc.gravite==='majeure'?'g-maj':'g-min'}">${nc.gravite||'—'}</span></td>
            <td>${typeof pillHtml==='function'?pillHtml(nc.statut||nc.status):(nc.statut||'—')}</td>
            <td>${nc._duree!=null?nc._duree+'j':'—'}</td>
          </tr>`).join('')}
        </tbody></table>`}

        <div class="ncd-sec">Mes actions CAPA assignées</div>
        ${mesCapas.length===0?'<div class="ncd-empty">Aucune action CAPA assignée.</div>':`
        <table class="ncd-tbl"><thead><tr><th>NC</th><th>Description</th><th>Type</th><th>Statut</th><th>Échéance</th><th></th></tr></thead><tbody>
          ${mesCapas.map(a=>{
            const ret=a.echeance&&new Date(a.echeance)<now&&a.statut!=='cloturé';
            const ech=a.echeance?new Date(a.echeance).toLocaleDateString('fr-FR'):'—';
            const pc=a.statut==='cloturé'?'np-ok':a.statut==='realisee'?'np-att':a.statut==='en_cours'?'np-oc':'np-att';
            return`<tr>
              <td style="font-family:monospace;font-weight:700;color:#0c447c;white-space:nowrap">${a._nc}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(a.description||'—').substring(0,50)}</td>
              <td><span class="ncd-pill np-oc">${a.type||'—'}</span></td>
              <td><span class="ncd-pill ${pc}">${(a.statut||'non_commencé').replace(/_/g,' ')}</span></td>
              <td style="color:${ret?'#791F1F':'inherit'};font-weight:${ret?700:400}">${ech}${ret?' ⚠':''}</td>
              <td><button onclick="NcDroits.repondreAction({nc_numero:'${a._nc}',capa_id:'${a.id||''}'})" style="font-size:11px;padding:3px 9px;background:#0c447c;color:#fff;border:none;border-radius:5px;cursor:pointer">Répondre</button></td>
            </tr>`;
          }).join('')}
        </tbody></table>`}
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if(e.target===ov) closeDashboard(); });
    document.addEventListener('keydown', _kbDb);
  }

  function closeDashboard() {
    document.getElementById('ncd-ov')?.remove();
    document.removeEventListener('keydown', _kbDb);
  }
  function _kbDb(e) { if(e.key==='Escape') closeDashboard(); }

  /* ══════════════════════════════════════════════════════════════════
     CORRECTION C — Répondre à une action CAPA
     ISO §10.2.1c — Actions correctives · ISO §10.2.2 — Traçabilité
  ══════════════════════════════════════════════════════════════════ */
  function repondreAction(opts) {
    const myEmail = _email();
    const ncList  = typeof allNC !== 'undefined' ? allNC : [];
    const nc      = ncList.find(n => n.numero === opts.nc_numero);
    if (!nc) { alert('NC introuvable : ' + opts.nc_numero); return; }
    const action  = (nc.actions||[]).find(a => a.id === opts.capa_id) || (nc.actions||[])[0];
    if (!action)  { alert('Action CAPA introuvable.'); return; }

    // ISO §5.3 — vérification droit avant affichage du formulaire de modification
    if (!peutRepondreAction(action, myEmail)) {
      alert('Accès refusé — vous n\'êtes pas le responsable de cette action (ISO §5.3).');
      return;
    }

    _injectCSS();
    document.getElementById('ncd-rep-ov')?.remove();
    const statuts = ['non_commencé','en_cours','realisee'];
    const cur = action.reponse_statut_action || action.statut || 'non_commencé';

    const ov = document.createElement('div'); ov.id = 'ncd-rep-ov';
    ov.innerHTML = `<div id="ncd-rep-modal">
      <div class="nrd-hdr">
        <span style="font-size:14px;font-weight:700">Répondre à une action CAPA</span>
        <button onclick="NcDroits.closeRepondre()" style="background:none;border:none;color:rgba(255,255,255,.7);font-size:20px;cursor:pointer;line-height:1">&#10005;</button>
      </div>
      <div class="nrd-body">
        <div class="nrd-info">
          <strong>NC ${nc.numero}</strong> — ${(nc.description||'').substring(0,60)}<br>
          Action : <em>${(action.description||'—').substring(0,80)}</em><br>
          <span style="font-size:11px;opacity:.8">ISO §10.2.1c — votre réponse sera tracée dans le journal d'audit (§10.2.2)</span>
        </div>
        <div id="nrd-err" class="nrd-err"></div>
        <div class="nrd-f">
          <div class="nrd-lbl">Statut de l'action *</div>
          <select class="nrd-sel" id="nrd-statut">
            ${statuts.map(s=>`<option value="${s}" ${cur===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}
          </select>
        </div>
        <div class="nrd-f">
          <div class="nrd-lbl">Avancement / Réponse *</div>
          <textarea class="nrd-ta" id="nrd-texte" placeholder="Décrivez les actions menées, les résultats obtenus, les prochaines étapes…">${action.reponse_responsable||''}</textarea>
        </div>
        <div class="nrd-f">
          <div class="nrd-lbl">Référence preuve (N° doc, URL, chemin)</div>
          <input class="nrd-sel" type="text" id="nrd-preuve" placeholder="Ex : Procédure P-042 v2, rapport audit 2026-05-06…" value="${action.reponse_preuve||''}">
        </div>
      </div>
      <div class="nrd-ft">
        <button class="nrd-btn-s" onclick="NcDroits.closeRepondre()">Annuler</button>
        <button class="nrd-btn-p" onclick="NcDroits._submit('${nc.numero}','${action.id||''}')">&#128190; Enregistrer ma réponse</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('keydown', e => { if(e.key==='Escape') closeRepondre(); });
  }

  function _submit(ncNumero, capaId) {
    const texte  = document.getElementById('nrd-texte')?.value.trim();
    const statut = document.getElementById('nrd-statut')?.value;
    const preuve = document.getElementById('nrd-preuve')?.value.trim();
    const errEl  = document.getElementById('nrd-err');
    if (!texte) { errEl.textContent='Le champ "Avancement / Réponse" est obligatoire.'; errEl.style.display='block'; return; }

    const myEmail = _email();
    const ncList  = typeof allNC !== 'undefined' ? allNC : [];
    const nc      = ncList.find(n => n.numero === ncNumero);
    if (!nc) return;
    const action  = (nc.actions||[]).find(a => a.id === capaId);
    if (!action) return;

    // ISO §5.3 — double vérification côté client
    if (!peutRepondreAction(action, myEmail)) { errEl.textContent='Accès refusé — ISO §5.3.'; errEl.style.display='block'; return; }

    // ISO §10.2.1c — enregistrement de la réponse
    action.reponse_responsable   = texte;
    action.reponse_date          = new Date().toISOString();
    action.reponse_preuve        = preuve;
    action.reponse_statut_action = statut;
    if (statut !== 'non_commencé') action.statut = statut;

    // ISO §10.2.2 — journal immuable
    _journal({ action:'CAPA_REPONSE_SAISIE', nc_id:ncNumero, capa_id:capaId,
      responsable:myEmail, statut_action:statut, by:myEmail });

    const hdrs = typeof authHdr==='function' ? authHdr() : {'Content-Type':'application/json'};
    fetch(`/api/nc/${encodeURIComponent(ncNumero)}`, {
      method:'PUT', headers:hdrs, body:JSON.stringify({ actions: nc.actions })
    }).then(r => {
      if (!r.ok) throw new Error('HTTP '+r.status);
      closeRepondre();
      if (typeof loadNC==='function') loadNC();
    }).catch(e => { errEl.textContent='Erreur sauvegarde : '+e.message; errEl.style.display='block'; });
  }

  function closeRepondre() { document.getElementById('ncd-rep-ov')?.remove(); }

  /* ══════════════════════════════════════════════════════════════════
     ASSIGNER UN PILOTE — ISO §5.3
  ══════════════════════════════════════════════════════════════════ */
  function assignerPilote(opts) {
    // ISO §5.3 — seul l'admin peut attribuer un pilote
    if (!isAdmin()) throw new Error('Accès refusé — rôle nc_admin requis (ISO §5.3).');
    const nc = (typeof allNC!=='undefined'?allNC:[]).find(n=>n.numero===opts.nc_numero);
    if (!nc) throw new Error('NC introuvable : '+opts.nc_numero);
    const ancien = nc.pilote;
    nc.pilote = opts.pilote_nom || opts.pilote_email;
    _journal({ action:'PILOTE_ATTRIBUE', nc_id:opts.nc_numero, pilote_email:opts.pilote_email, attribue_par:_email() });
    if (ancien) _journal({ action:'PILOTE_RETIRE', nc_id:opts.nc_numero, ancien_pilote:ancien, retire_par:_email(), motif:'Réattribution' });
  }

  /* ══════════════════════════════════════════════════════════════════
     PATCH renderTable — injecte badges pilote après chaque rendu
  ══════════════════════════════════════════════════════════════════ */
  function _patchRenderTable() {
    if (typeof renderTable!=='function' || renderTable._ncdPatch) return;
    const _orig = renderTable;
    window.renderTable = function() {
      _orig.apply(this, arguments);
      setTimeout(injectPiloteBadgesInList, 90);
    };
    window.renderTable._ncdPatch = true;
    // Propager les patches existants
    if (_orig._ncpaPatch) window.renderTable._ncpaPatch = true;
  }

  /* ══════════════════════════════════════════════════════════════════
     INIT — bouton tableau de bord dans le header pour chef produit
  ══════════════════════════════════════════════════════════════════ */
  function init() {
    _injectCSS();
  }

  /* ══════════════════════════════════════════════════════════════════
     API PUBLIQUE — window.NcDroits
  ══════════════════════════════════════════════════════════════════ */
  window.NcDroits = {
    openDashboard, closeDashboard,
    repondreAction, closeRepondre, _submit,
    assignerPilote,
    injectModal: injectPiloteInModal,
    isAdmin, isChef, isPilote,
    peutRepondreAction
  };

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(_patchRenderTable, 0);

})();
