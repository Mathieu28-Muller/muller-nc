// nc_liste_accordeon.js — v1.0 — Muller Automotive
// Module : liste NC dépliante avec accordéon parent / satellites
// Compatible avec badges nc_parent_satellites.js
'use strict';

(function () {

  /* ══════════════════════════════════════════════════════════════════
     CSS — accordéon, badges, filtre type
  ══════════════════════════════════════════════════════════════════ */
  const CSS = `
    #ncla-f-type{padding:7px 11px;border:1.5px solid #dee2e6;border-radius:6px;font-size:13px;background:#fff;margin-right:6px;cursor:pointer}
    tr[data-nc-type="parent"] td{background:#F0F6FF !important}
    tr[data-nc-type="parent"]:hover td{background:#E6F1FB !important}
    tr[data-nc-type="satellite"] td{background:#fafbff !important}
    tr[data-nc-type="satellite"] td:first-child{padding-left:28px !important;border-left:3px solid #85B7EB !important}
    tr[data-nc-type="satellite"]:hover td{background:#f0f6ff !important}
    tr.ncla-sat-row{display:none}
    tr.ncla-sat-row.ncla-open{display:table-row}
    tr.ncla-virt-parent-row{cursor:pointer}
    tr.ncla-virt-parent-row:hover td{filter:brightness(0.97)}
    .ncla-bdg-p{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:1px 8px;border-radius:10px;background:#E6F1FB;color:#0c447c;border:1px solid #85B7EB;cursor:pointer;white-space:nowrap;vertical-align:middle;margin-left:5px;user-select:none}
    .ncla-bdg-p:hover{background:#cfe2ff}
    .ncla-bdg-sat{display:inline-flex;align-items:center;font-size:10px;font-weight:600;padding:1px 7px;border-radius:10px;background:#f0f0f0;color:#6c757d;border:1px solid #ccc;white-space:nowrap;vertical-align:middle;margin-left:5px}
    .ncla-sub{display:block;font-size:10px;color:#6c757d;margin-top:1px;font-weight:400}
    @keyframes ncla-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:translateY(0)}}
    tr.ncla-sat-row.ncla-open{animation:ncla-in .15s ease}
    .chip-rattachee{background:#f0f0f0;color:#6c757d;border:1px solid #ccc;font-size:10px;padding:1px 7px;border-radius:8px;font-weight:600}
  `;

  let _open   = new Set();    // IDs de groupes dépliés
  let _filter = 'toutes';
  let _ready  = false;

  function _css() {
    if (document.getElementById('ncla-styles')) return;
    const s = document.createElement('style'); s.id = 'ncla-styles'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════════════
     FILTRE TYPE — injecte un <select> dans la barre de filtres
  ══════════════════════════════════════════════════════════════════ */
  function _injectFiltre() {
    if (document.getElementById('ncla-f-type')) return;
    // Chercher la barre de filtres (avant le tableau)
    const bar = document.querySelector('#f-statut')?.parentElement
             || document.querySelector('.filter-bar')
             || document.querySelector('select[id^="f-"]')?.parentElement;
    if (!bar) return;
    const sel = document.createElement('select');
    sel.id = 'ncla-f-type';
    sel.title = 'Filtrer par type NC';
    sel.innerHTML = `
      <option value="toutes">Toutes NC</option>
      <option value="standards">Standards uniquement</option>
      <option value="parents">NC Parents</option>
      <option value="satellites">Satellites</option>`;
    sel.addEventListener('change', () => filter(sel.value));
    bar.prepend(sel);
  }

  /* ══════════════════════════════════════════════════════════════════
     TOGGLE ACCORDÉON
  ══════════════════════════════════════════════════════════════════ */
  function toggle(parentId) {
    const wasOpen = _open.has(parentId);
    if (wasOpen) {
      _open.delete(parentId);
      document.querySelectorAll(`tr.ncla-sat-row[data-parent-id="${parentId}"]`)
        .forEach(r => r.classList.remove('ncla-open'));
    } else {
      _open.add(parentId);
      _ensureSatRows(parentId, () => {
        document.querySelectorAll(`tr.ncla-sat-row[data-parent-id="${parentId}"]`)
          .forEach(r => { r.classList.add('ncla-open'); r.style.display = ''; });
      });
    }
    _updateBadge(parentId, !wasOpen);
  }

  function _updateBadge(parentId, isNowOpen) {
    const bdg = document.querySelector(`.ncla-bdg-p[data-pid="${parentId}"]`);
    if (!bdg) return;
    const n = _satCount(parentId);
    bdg.innerHTML = `&#9670; PARENT <span style="margin-left:3px">[${n}${isNowOpen ? '&#9650;' : '&#9660;'}]</span>`;
    bdg.title = isNowOpen ? 'Réduire les satellites' : 'Déplier les satellites';
  }

  function _satCount(parentId) {
    const g = _getGroup(parentId);
    return g ? g.satellites.length : '?';
  }

  function _getGroup(id) {
    // Chercher d'abord dans allNC (NC parent = vraie NC persistée)
    const list = typeof allNC !== 'undefined' ? allNC : [];
    const ncParent = list.find(n => n.numero === id && n.is_parent);
    if (ncParent) return { id: ncParent.numero, satellites: ncParent.satellites||[], groupe_label: ncParent.groupe_label||'' };
    // Fallback Store legacy
    return window.NcParent?.Store?.parentGroups?.find(g => g.id === id) || null;
  }

  /* ══════════════════════════════════════════════════════════════════
     INJECTION DES LIGNES SATELLITES
  ══════════════════════════════════════════════════════════════════ */
  function _ensureSatRows(parentId, cb) {
    // Déjà injectées ?
    if (document.querySelector(`tr.ncla-sat-row[data-parent-id="${parentId}"]`)) { cb(); return; }

    // Source des satellite IDs
    const g = _getGroup(parentId);
    const satIds = g ? g.satellites : (typeof allNC!=='undefined'?allNC:[])
      .filter(n => n.is_satellite && n.parent_id === parentId).map(n => n.numero);

    _insertSatRows(parentId, satIds);
    cb();
  }

  function _insertSatRows(parentId, satIds) {
    // Trouver la ligne parent
    const parentRow = document.querySelector(
      `tr.row-link[data-group-id="${parentId}"], tr[data-nc-type="parent"][data-group-id="${parentId}"]`
    );
    if (!parentRow) return;
    const list = typeof allNC !== 'undefined' ? allNC : [];
    let after = parentRow;

    satIds.forEach(id => {
      // Ne pas injecter si la vraie ligne NC satellite est déjà visible dans le tableau
      if (document.querySelector(`tr.row-link[data-nc-id="${id}"]`)) return;
      if (document.querySelector(`tr.ncla-sat-row[data-parent-id="${parentId}"][data-nc-id="${id}"]`)) return;
      const nc  = list.find(n => n.numero === id);
      const tr  = document.createElement('tr');
      tr.className = 'ncla-sat-row row-link';
      tr.setAttribute('data-nc-type', 'satellite');
      tr.setAttribute('data-parent-id', parentId);
      tr.setAttribute('data-nc-id', id);
      tr.title = `Satellite de ${parentId} — cliquer pour ouvrir`;
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => { if (typeof openModal==='function') openModal(id); });

      if (nc) {
        const dateFr = nc.createdAt ? new Date(nc.createdAt).toLocaleDateString('fr-FR') : '—';
        tr.innerHTML = `
          <td data-col="numero" style="padding-left:28px">
            <span class="nc-num" style="color:#0c447c">&#8627; ${id}</span>
            <span class="ncla-bdg-sat" title="NC satellite de ${parentId}">satellite</span>
          </td>
          <td data-col="createdAt">${dateFr}</td>
          <td data-col="nomClient" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(nc.nomClient||'—').substring(0,18)}</td>
          <td data-col="familleProduit" style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(nc.familleProduit||'—').substring(0,16)}</td>
          <td data-col="probleme" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(nc.description||'—').substring(0,55)}</td>
          <td data-col="statut"><span class="chip-rattachee">rattachée</span></td>
          <td data-col="pilote" style="font-size:11px">${nc.pilote||'—'}</td>
          <td data-col="_duree">${nc._duree!=null?nc._duree+'j':'—'}</td>
          <td data-col="_jours">—</td>`;
      } else {
        tr.innerHTML = `<td data-col="numero" style="padding-left:28px"><span class="nc-num">&#8627; ${id}</span></td>
          <td colspan="8" style="color:#adb5bd;font-size:12px;font-style:italic">NC non disponible dans la vue courante</td>`;
      }
      after.insertAdjacentElement('afterend', tr);
      after = tr;
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     FILTRE TYPE
  ══════════════════════════════════════════════════════════════════ */
  function filter(type) {
    _filter = type;
    const sel = document.getElementById('ncla-f-type');
    if (sel) sel.value = type;

    const list   = typeof allNC !== 'undefined' ? allNC : [];
    const groups = window.NcParent?.Store?.parentGroups || [];

    document.querySelectorAll('#nc-tbody tr.row-link').forEach(row => {
      let t = row.getAttribute('data-nc-type') || 'standard';

      // Fallback: si l'attribut n'est pas encore posé par _enrichRows (race condition 110ms),
      // on déduit le type directement depuis allNC et parentGroups
      if (t === 'standard' && (type === 'parents' || type === 'satellites')) {
        const numEl = row.querySelector('[data-col="numero"] .nc-num');
        if (numEl) {
          const num = numEl.textContent.trim();
          // Détection via parentGroups (persisté) — fiable même avant _enrichRows
          if (groups.find(g => g.id === num)) {
            t = 'parent';
          } else if (groups.some(g => g.satellites?.includes(num))) {
            t = 'satellite';
          } else {
            // Fallback flags en mémoire si déjà enrichis
            const nc = list.find(n => n.numero === num);
            if (nc?.is_satellite && nc.parent_id) t = 'satellite';
            else if (nc?.is_parent)               t = 'parent';
          }
        }
      }

      let show = true;
      if      (type === 'standards')  show = t === 'standard';
      else if (type === 'parents')    show = t === 'parent';
      else if (type === 'satellites') show = t === 'satellite';
      row.style.display = show ? '' : 'none';
    });
    // Satellites injectées dynamiquement
    if (type !== 'satellites') {
      document.querySelectorAll('tr.ncla-sat-row').forEach(r => { r.style.display = 'none'; r.classList.remove('ncla-open'); });
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     ENRICHISSEMENT DES LIGNES après renderTable
  ══════════════════════════════════════════════════════════════════ */
  function _enrichRows() {
    const list   = typeof allNC !== 'undefined' ? allNC : [];
    const groups = window.NcParent?.Store?.parentGroups || [];

    // Supprimer les lignes injectées précédemment
    document.querySelectorAll('tr.ncla-sat-row').forEach(r => r.remove());
    document.querySelectorAll('tr.ncla-virt-parent-row').forEach(r => r.remove());

    document.querySelectorAll('#nc-tbody tr.row-link').forEach(row => {
      const numEl = row.querySelector('[data-col="numero"] .nc-num');
      if (!numEl) return;
      const num = numEl.textContent.trim();
      const nc  = list.find(n => n.numero === num);
      if (!nc) return;

      // ─── NC Satellite ────────────────────────────────────────────
      if (nc.is_satellite && nc.parent_id) {
        row.setAttribute('data-nc-type', 'satellite');
        row.setAttribute('data-parent-id', nc.parent_id);
        row.setAttribute('data-nc-id', num);
        row.style.display = ''; // Toujours visible dans la liste
        if (!row.querySelector('.ncla-bdg-sat')) {
          const bdg = document.createElement('span');
          bdg.className = 'ncla-bdg-sat'; bdg.title = `Satellite de ${nc.parent_id}`;
          bdg.textContent = 'satellite';
          numEl.after(bdg);
        }
        return;
      }

      // ─── NC Parent ───────────────────────────────────────────────
      const g = groups.find(gr => gr.id === num);
      if (nc.is_parent || g) {
        const grp  = g || { satellites: nc.satellites||[], groupe_label: nc.groupe_label||'' };
        const sats = nc.satellites || grp.satellites || [];
        const n    = sats.length;
        const perims = [...new Set(sats.map(id => {
          const s = list.find(x => x.numero === id);
          return s?.perimetre || '';
        }).filter(Boolean))].join(' + ') || '—';

        row.setAttribute('data-nc-type', 'parent');
        row.setAttribute('data-group-id', num);

        // Remplacer le badge existant par le badge accordéon cliquable
        const existing = row.querySelector('.ncpa-bdg-parent');
        const isOpen   = _open.has(num);
        const bdg      = document.createElement('span');
        bdg.className  = 'ncla-bdg-p';
        bdg.setAttribute('data-pid', num);
        bdg.title = `Groupe NC parent — ${n} satellite(s). Cliquer pour déplier.`;
        bdg.innerHTML = `&#9670; PARENT <span style="margin-left:3px">[${n}${isOpen?'&#9650;':'&#9660;'}]</span>`;
        bdg.addEventListener('click', e => { e.stopPropagation(); toggle(num); });
        if (existing) existing.replaceWith(bdg);
        else numEl.parentNode.appendChild(bdg);

        // Sous-info permanente : [N satellites · Périmètres]
        let sub = numEl.parentNode.querySelector('.ncla-sub');
        if (!sub) { sub = document.createElement('span'); sub.className = 'ncla-sub'; numEl.parentNode.appendChild(sub); }
        sub.textContent = `${n} satellite${n>1?'s':''} · ${perims}`;

        // Réouvrir si était déplié
        if (isOpen) _ensureSatRows(num, () => {
          document.querySelectorAll(`tr.ncla-sat-row[data-parent-id="${num}"]`)
            .forEach(r => { r.classList.add('ncla-open'); r.style.display = ''; });
        });
        return;
      }

      // ─── NC Standard ─────────────────────────────────────────────
      row.setAttribute('data-nc-type', 'standard');
    });

    // Les NC parent sont maintenant de vraies NC dans allNC — pas de lignes virtuelles nécessaires.

    // Réappliquer le filtre courant
    if (_filter !== 'toutes') filter(_filter);
  }

  /* ══════════════════════════════════════════════════════════════════
     PATCH renderTable
  ══════════════════════════════════════════════════════════════════ */
  function _patchRenderTable() {
    if (typeof renderTable !== 'function' || renderTable._nclaP) return;
    const _orig = renderTable;
    window.renderTable = function() {
      _orig.apply(this, arguments);
      setTimeout(_enrichRows, 110);
    };
    window.renderTable._nclaP = true;
    // Propager les patches existants
    if (_orig._ncpaPatch) window.renderTable._ncpaPatch = true;
    if (_orig._ncdPatch)  window.renderTable._ncdPatch  = true;
  }

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */
  function init() {
    if (_ready) return;
    _ready = true;
    _css();
    _injectFiltre();
    _patchRenderTable();
    // Premier enrichissement si allNC déjà chargé
    if (typeof allNC !== 'undefined' && allNC.length > 0) setTimeout(_enrichRows, 130);
  }

  /* ══════════════════════════════════════════════════════════════════
     API PUBLIQUE — window.NcListe
  ══════════════════════════════════════════════════════════════════ */
  window.NcListe = { init, toggle, filter };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
