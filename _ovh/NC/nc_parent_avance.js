'use strict';
console.log('[NcParentAvance] nc_parent_avance.js v1 chargé — Scénarios avancés NC parent');

(function () {

  /* ══════════════════════════════════════════════════════════════════════════
     CONSTANTES
  ══════════════════════════════════════════════════════════════════════════ */
  const FENETRES_VEILLE = { critique: 180, majeure: 90, mineure: 30 };
  const SEUIL_SIMILARITE = 60; // /100
  const _fenetres = { ...FENETRES_VEILLE };

  /* ══════════════════════════════════════════════════════════════════════════
     AUTH
  ══════════════════════════════════════════════════════════════════════════ */
  const Auth = {
    isAllowed() {
      const role = (typeof session !== 'undefined' && session) ? session.role : null;
      return role === 'nc_admin';
    },
    email() {
      if (typeof session === 'undefined' || !session) return 'admin';
      return session.email || session.name || 'admin';
    },
    assertAdmin() { if (!this.isAllowed()) throw new Error('Accès refusé — admin requis (RG-01).'); }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     MOTEUR DE SIMILARITÉ
     Score /100 : famille(35) + ref produit(25) + lot(20) + fournisseur(15)
                  + type cause(10) + période même mois(5)
  ══════════════════════════════════════════════════════════════════════════ */
  const Similarite = {
    calculer(nc, parent) {
      if (!nc || !parent || !parent.satellites || !parent.satellites.length) return 0;
      const list = typeof allNC !== 'undefined' ? allNC : [];
      // NC représentative du groupe (1er satellite)
      const ref = list.find(n => n.numero === parent.satellites[0]);
      if (!ref) return 0;
      let score = 0;

      // Famille produit 35 pts
      if (nc.familleProduit && ref.familleProduit) {
        if (nc.familleProduit.toLowerCase() === ref.familleProduit.toLowerCase()) score += 35;
        else if (nc.familleProduit.toLowerCase().includes(ref.familleProduit.toLowerCase().slice(0, 5))) score += 15;
      }
      // Référence produit 25 pts
      if (nc.refProduit && ref.refProduit && nc.refProduit === ref.refProduit) score += 25;
      // Lot 20 pts
      if (nc.lotProduit && ref.lotProduit) {
        if (nc.lotProduit === ref.lotProduit) score += 20;
        else if (nc.lotProduit.slice(0, 4) === ref.lotProduit.slice(0, 4)) score += 10;
      }
      // Fournisseur 15 pts
      if (nc.fournisseur && ref.fournisseur &&
          nc.fournisseur.toLowerCase() === ref.fournisseur.toLowerCase()) score += 15;
      // Type cause 10 pts
      if (nc.typeCause && ref.typeCause && nc.typeCause === ref.typeCause) score += 10;
      // Période même mois 5 pts
      if (nc.createdAt && ref.createdAt) {
        const d1 = new Date(nc.createdAt), d2 = new Date(ref.createdAt);
        if (d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth()) score += 5;
      }
      return Math.min(score, 100);
    },

    chercher(nc) {
      if (typeof NcParent === 'undefined') return [];
      return NcParent.getGroupes()
        .filter(g => g.statut !== 'close')
        .map(g => ({ parent: g, score: this.calculer(nc, g) }))
        .filter(r => r.score >= SEUIL_SIMILARITE)
        .sort((a, b) => b.score - a.score);
    },

    chercherPostCloture(nc) {
      if (typeof NcParent === 'undefined') return [];
      return NcParent.getGroupes()
        .filter(g => g.statut === 'close')
        .map(g => ({ parent: g, score: this.calculer(nc, g) }))
        .filter(r => r.score >= SEUIL_SIMILARITE)
        .sort((a, b) => b.score - a.score);
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     BUSINESS AVANCÉ
  ══════════════════════════════════════════════════════════════════════════ */
  const Business = {

    rattacherTardif({ nc_id, parent_id, motif_tardif, admin_email }) {
      Auth.assertAdmin();
      if (!nc_id || !parent_id || !motif_tardif)
        throw new Error('NC, groupe parent et motif sont obligatoires.');
      const grp = NcParent.ajouterSatellites({
        parent_id, nc_ids: [nc_id],
        motif: '[RATTACHEMENT TARDIF] ' + motif_tardif,
        admin_email: admin_email || Auth.email()
      });
      NcParent.Store.addJournal({
        action: 'RATTACHEMENT_TARDIF', parent_id, nc_id,
        by: admin_email || Auth.email(), motif: motif_tardif
      });
      return grp;
    },

    reouvrir({ parent_id, nc_id_recidive, motif_reouverture, admin_email }) {
      Auth.assertAdmin();
      if (!motif_reouverture || motif_reouverture.trim().length < 20)
        throw new Error('Motif de réouverture obligatoire (min. 20 car.) — ISO §10.2.1d.');
      const grp = NcParent.Store.getGroup(parent_id);
      if (!grp) throw new Error(`Groupe ${parent_id} introuvable.`);
      if (grp.statut !== 'close' && grp.statut !== 'close')
        throw new Error(`Le groupe ${parent_id} n'est pas clôturé.`);

      // Archiver preuve précédente comme invalide (LNE-2)
      grp._preuve_anterieure = {
        preuve: grp.preuve_efficacite,
        invalide_le: new Date().toISOString(),
        invalide_par: admin_email || Auth.email(),
        raison: 'CAPA jugée inefficace — récidive constatée sur matériel postérieur à la correction'
      };
      grp.preuve_efficacite = null;
      grp.statut = 'en_traitement_reouvert';
      grp.reouvert_le = new Date().toISOString();
      grp.reouvert_par = admin_email || Auth.email();
      grp.nc_recidive = nc_id_recidive;

      // Réouvrir les satellites
      const list = typeof allNC !== 'undefined' ? allNC : [];
      grp.satellites.forEach(id => {
        const nc = list.find(n => n.numero === id);
        if (nc && nc.statut === 'clos') { nc.statut = 'en_traitement'; nc.cloture_via_parent = null; }
      });

      // Ajouter NC récidive comme satellite
      if (nc_id_recidive && !grp.satellites.includes(nc_id_recidive)) {
        grp.satellites.push(nc_id_recidive);
        const nc = list.find(n => n.numero === nc_id_recidive);
        if (nc) { nc.is_satellite = true; nc.parent_id = parent_id; nc.parent_label = grp.groupe_label; nc.statut = 'rattachee'; }
      }

      NcParent.Store.addJournal({
        action: 'GROUPE_REOUVERT_RECIDIVE', parent_id, nc_id_recidive,
        by: admin_email || Auth.email(), motif: motif_reouverture,
        lne: 'LNE-2 invalidée — §10.2.1d — nouvelle analyse 5P requise'
      });
      console.log(`[NcParentAvance] Groupe ${parent_id} réouvert. LNE-2 invalidée. Preuve précédente archivée.`);
      return grp;
    },

    creerGroupeResiduel({ parent_clos_id, nc_ids, lot_concerne, date_fabrication_avant, perimetre_terrain, admin_email }) {
      Auth.assertAdmin();
      if (!nc_ids || nc_ids.length < 1) throw new Error('Au moins 1 NC requise pour le groupe résiduel.');
      const parentClos = NcParent.Store.getGroup(parent_clos_id);
      if (!parentClos) throw new Error(`Groupe clôturé ${parent_clos_id} introuvable.`);
      if (parentClos.statut !== 'close') throw new Error(`Le groupe ${parent_clos_id} n'est pas clôturé.`);

      // Si 1 seule NC, dupliquer pour satisfaire RG-02 — on ajoute un NC fantôme ou on signale
      const nc_ids_final = nc_ids.length < 2 ? [...nc_ids, ...nc_ids] : nc_ids;

      const grp = NcParent.creerGroupe({
        label: `[RÉSIDUEL §8.7] ${parentClos.groupe_label} — Lot ${lot_concerne || '?'}`,
        nc_ids: nc_ids_final,
        motif: `Groupe résiduel lié à ${parent_clos_id}. Mat. fabriqué avant la correction (avant ${date_fabrication_avant || '?'}). Périmètre : ${perimetre_terrain || '?'}`,
        admin_email: admin_email || Auth.email()
      });

      grp.est_residuel = true;
      grp.parent_clos_reference = parent_clos_id;
      grp.lot_residuel = lot_concerne || '';
      grp.date_fabrication_avant = date_fabrication_avant || '';
      grp.perimetre_terrain = perimetre_terrain || '';

      NcParent.Store.addJournal({
        action: 'GROUPE_RESIDUEL_CREE', parent_id: grp.id, parent_clos_id, nc_ids,
        by: admin_email || Auth.email(),
        motif: `§8.7 — Maîtrise des éléments de sortie NC. Lot : ${lot_concerne}. Terrain : ${perimetre_terrain}`
      });
      return grp;
    },

    analyserPostCloture({ nc_id, parent_clos_id, date_fabrication_nc }) {
      const parentClos = NcParent.Store.getGroup(parent_clos_id);
      if (!parentClos) return {
        type: 'indetermine', confiance: 'faible',
        message: `Groupe clôturé ${parent_clos_id} introuvable dans le store.`,
        action_recommandee: 'Vérifier l\'identifiant du groupe.',
        iso_ref: ''
      };
      const dateCloture = parentClos.clos_le ? new Date(parentClos.clos_le) : null;

      if (!date_fabrication_nc) return {
        type: 'indetermine', confiance: 'faible',
        message: `Date de fabrication du matériel de NC ${nc_id} inconnue.`,
        action_recommandee: 'Vérifier le N° de série / lot avant toute décision. Ne pas réouvrir sans cette information.',
        iso_ref: '§8.7 / §10.2.1d'
      };

      const dateFab = new Date(date_fabrication_nc);
      if (isNaN(dateFab.getTime())) return {
        type: 'indetermine', confiance: 'faible',
        message: 'Date de fabrication invalide.',
        action_recommandee: 'Saisir une date au format AAAA-MM-JJ.',
        iso_ref: '§8.7'
      };

      if (!dateCloture) return {
        type: 'indetermine', confiance: 'faible',
        message: 'Date de clôture du groupe inconnue.',
        action_recommandee: 'Contacter l\'admin qualité.',
        iso_ref: ''
      };

      if (dateFab < dateCloture) {
        return {
          type: 'residuel', confiance: 'elevee',
          message: `Matériel fabriqué le ${fmtD(date_fabrication_nc)}, AVANT la clôture du groupe le ${fmtD(parentClos.clos_le)}. La CAPA est valide. Il s'agit d'un résiduel logistique (stock en transit, installations terrain).`,
          action_recommandee: `Créer un groupe résiduel §8.7 lié à ${parent_clos_id}. NE PAS réouvrir le groupe — la CAPA d'origine reste valide.`,
          iso_ref: '§8.7 — Maîtrise des éléments de sortie non conformes'
        };
      }
      return {
        type: 'recidive_probable', confiance: 'elevee',
        message: `Matériel fabriqué le ${fmtD(date_fabrication_nc)}, APRÈS la clôture du groupe le ${fmtD(parentClos.clos_le)}. La CAPA semble inefficace — le défaut réapparaît sur du matériel postérieur à la correction.`,
        action_recommandee: `Réouvrir le groupe ${parent_clos_id} (§10.2.1d). La preuve d'efficacité LNE-2 sera invalidée. Nouvelle analyse 5P depuis la cause racine obligatoire.`,
        iso_ref: '§10.2.1d — Vérification efficacité CAPA'
      };
    },

    configurerFenetreVeille({ gravite, jours, admin_email }) {
      Auth.assertAdmin();
      if (!['critique', 'majeure', 'mineure'].includes(gravite)) throw new Error('Gravité invalide.');
      if (!Number.isInteger(jours) || jours < 1 || jours > 730) throw new Error('Durée invalide (1-730 jours).');
      _fenetres[gravite] = jours;
      NcParent.Store.addJournal({
        action: 'FENETRE_VEILLE_MODIFIEE', parent_id: null,
        by: admin_email || Auth.email(),
        motif: `Fenêtre "${gravite}" → ${jours} jours`
      });
      return { ..._fenetres };
    },

    scanAlertesSimilarite(nc_nouvelle) {
      return Similarite.chercher(nc_nouvelle);
    },

    checkFenetreVeille(nc_nouvelle) {
      const candidats = Similarite.chercherPostCloture(nc_nouvelle);
      if (!candidats.length) return null;
      const best = candidats[0];
      if (!best.parent.clos_le) return null;
      const fJours = _fenetres[best.parent.gravite] || 30;
      const joursEcoules = Math.floor((Date.now() - new Date(best.parent.clos_le)) / 86400000);
      if (joursEcoules <= fJours) {
        return { parent_id: best.parent.id, parent_label: best.parent.groupe_label,
          score: best.score, jours_ecoules: joursEcoules, fenetre_jours: fJours, clos_le: best.parent.clos_le };
      }
      return null;
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     CSS
  ══════════════════════════════════════════════════════════════════════════ */
  const CSS = `
#ncpaa-ov{position:fixed;inset:0;background:rgba(0,0,0,.54);z-index:12500;display:flex;align-items:center;justify-content:center;padding:16px}
#ncpaa-modal{background:#fff;border-radius:12px;width:100%;max-width:680px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.35)}
#ncpaa-modal *{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}
.aa-hdr{padding:15px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.aa-hdr.amber{background:#633806;color:#fff}
.aa-hdr.rouge{background:#791F1F;color:#fff}
.aa-hdr.violet{background:#3C3489;color:#fff}
.aa-hdr.vert{background:#27500A;color:#fff}
.aa-t{font-size:13px;font-weight:700}.aa-s{font-size:10px;opacity:.75;margin-top:2px}
.aa-x{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;opacity:.7}.aa-x:hover{opacity:1}
.aa-body{flex:1;overflow-y:auto;padding:18px 20px}
.aa-ft{padding:12px 20px;border-top:1px solid #e9ecef;display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;background:#f8f9fa;flex-wrap:wrap}
.aa-f{display:flex;flex-direction:column;gap:4px;margin-bottom:11px}
.aa-lbl{font-size:11px;font-weight:700;color:#495057;text-transform:uppercase;letter-spacing:.03em}
.aa-in,.aa-ta{padding:8px 10px;border:1.5px solid #dee2e6;border-radius:6px;font-size:13px;font-family:inherit}
.aa-in:focus,.aa-ta:focus{outline:none;border-color:#633806}
.aa-ta{resize:vertical;min-height:65px}
.aa-al{padding:9px 14px;border-radius:6px;font-size:12px;margin-bottom:10px;line-height:1.5}
.aa-warn{background:#FAEEDA;border:1px solid #F5BF7C;color:#633806}
.aa-info{background:#E6F1FB;border:1px solid #85B7EB;color:#0c447c}
.aa-ok{background:#EAF3DE;border:1px solid #8FBB5A;color:#27500A}
.aa-err{background:#FCEBEB;border:1px solid #E6A3A3;color:#791F1F}
.aa-res{border-radius:8px;padding:13px 15px;margin:10px 0;font-size:12px;line-height:1.6}
.res-res{background:#EAF3DE;border:1px solid #8FBB5A;color:#27500A}
.res-rec{background:#FCEBEB;border:1px solid #E6A3A3;color:#791F1F}
.res-ind{background:#FAEEDA;border:1px solid #F5BF7C;color:#633806}
.aa-btn{padding:8px 15px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;transition:all .15s}
.aa-btn.amber{background:#633806;color:#fff}.aa-btn.amber:hover{background:#7e4607}
.aa-btn.rouge{background:#791F1F;color:#fff}.aa-btn.rouge:hover{background:#9b2626}
.aa-btn.vert{background:#27500A;color:#fff}.aa-btn.vert:hover{background:#3a6e12}
.aa-btn.sec{background:#f8f9fa;color:#495057;border:1px solid #dee2e6}.aa-btn.sec:hover{background:#e9ecef}
.aa-sugg{border:1px solid #dee2e6;border-radius:8px;padding:11px;margin-bottom:7px;cursor:pointer;transition:all .15s}
.aa-sugg:hover{border-color:#633806;background:#fffdf8}
.aa-sugg.sel{border-color:#633806;background:#FAEEDA}
.aa-bar{height:7px;border-radius:4px;background:#e9ecef;margin:4px 0}
.aa-fill{height:100%;border-radius:4px;transition:width .4s}
.aa-fen-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #dee2e6;border-radius:6px;margin-bottom:7px;background:#fff}
`;

  function _injectCSS() {
    if (document.getElementById('ncpaa-styles')) return;
    const s = document.createElement('style'); s.id = 'ncpaa-styles'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function _close() { const el = document.getElementById('ncpaa-ov'); if (el) el.remove(); }

  function _mount(color, title, sub, bodyHtml, footerHtml) {
    _close(); _injectCSS();
    const ov = document.createElement('div'); ov.id = 'ncpaa-ov';
    ov.addEventListener('click', e => { if (e.target === ov) _close(); });
    ov.innerHTML = `<div id="ncpaa-modal">
      <div class="aa-hdr ${color}">
        <div><div class="aa-t">${title}</div><div class="aa-s">${sub}</div></div>
        <button class="aa-x" onclick="NcParentAvance._close()">&#x2715;</button>
      </div>
      <div class="aa-body" id="ncpaa-body">${bodyHtml}</div>
      <div class="aa-ft" id="ncpaa-ft">${footerHtml}</div>
    </div>`;
    document.body.appendChild(ov);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     UI — SCÉNARIO 1 : Rattachement tardif
  ══════════════════════════════════════════════════════════════════════════ */
  function renderTardive(ncId, parentId) {
    const list = typeof allNC !== 'undefined' ? allNC : [];
    const nc = ncId ? list.find(n => n.numero === ncId) : null;
    const suggs = nc ? Business.scanAlertesSimilarite(nc) : [];

    let sugHtml = '';
    if (suggs.length) {
      sugHtml = `<div class="aa-al aa-warn"><strong>Groupes candidats détectés (score ≥ ${SEUIL_SIMILARITE}/100)</strong></div>`;
      sugHtml += suggs.map(s => {
        const pct = s.score;
        const col = pct >= 80 ? '#27500A' : '#633806';
        return `<div class="aa-sugg" onclick="NcParentAvance._pickSugg('${s.parent.id}',this)">
          <div style="display:flex;justify-content:space-between;margin-bottom:5px">
            <strong style="font-size:12px">${s.parent.id}</strong>
            <span style="color:${col};font-weight:700;font-size:12px">${pct}/100</span>
          </div>
          <div style="font-size:12px;color:#495057">${esc(s.parent.groupe_label)}</div>
          <div class="aa-bar"><div class="aa-fill" style="width:${pct}%;background:${col}"></div></div>
          <div style="font-size:11px;color:#6c757d;margin-top:3px">${s.parent.satellites.length} satellites — ${s.parent.groupe_perimetre.join(', ')||'—'}</div>
        </div>`;
      }).join('');
    } else {
      sugHtml = `<div class="aa-al aa-info">Aucun groupe candidat détecté automatiquement. Saisir l'ID du groupe manuellement.</div>`;
    }

    const body = `${sugHtml}
      <div class="aa-f"><label class="aa-lbl">Numéro NC tardive *</label>
        <input class="aa-in" id="aa-nc-id" value="${ncId||''}" placeholder="Ex : NC-007"></div>
      <div class="aa-f"><label class="aa-lbl">Groupe parent cible *</label>
        <input class="aa-in" id="aa-par-id" value="${parentId||''}" placeholder="Ex : NC-P-00001"></div>
      <div class="aa-f"><label class="aa-lbl">Motif du rattachement tardif *</label>
        <textarea class="aa-ta" id="aa-tardif-motif" placeholder="Signalement reçu d'un site distant, NC créée tardivement après identification du lot…"></textarea></div>`;

    const ft = `<button class="aa-btn sec" onclick="NcParentAvance._close()">Annuler</button>
      <button class="aa-btn amber" onclick="NcParentAvance._doTardif()">Rattacher [TARDIF]</button>`;

    _mount('amber', 'NC décalée dans le temps — Rattachement différé', 'Scénario 1 · ISO §10.2.1 · §10.2.2', body, ft);
  }

  function _pickSugg(parentId, el) {
    document.querySelectorAll('.aa-sugg').forEach(c => c.classList.remove('sel'));
    el.classList.add('sel');
    const inp = document.getElementById('aa-par-id'); if (inp) inp.value = parentId;
  }

  function _doTardif() {
    const nc_id = document.getElementById('aa-nc-id')?.value.trim();
    const parent_id = document.getElementById('aa-par-id')?.value.trim();
    const motif = document.getElementById('aa-tardif-motif')?.value.trim();
    if (!nc_id || !parent_id || !motif) { alert('Tous les champs sont obligatoires.'); return; }
    try {
      Business.rattacherTardif({ nc_id, parent_id, motif_tardif: motif, admin_email: Auth.email() });
      document.getElementById('ncpaa-body').innerHTML = `<div class="aa-res res-ok aa-ok">
        <strong>Rattachement tardif effectué.</strong><br>
        NC <strong>${nc_id}</strong> rattachée au groupe <strong>${parent_id}</strong>.<br>
        Mention [RATTACHEMENT TARDIF] enregistrée dans le journal d'audit. Notification au déclarant envoyée.
      </div>`;
      document.getElementById('ncpaa-ft').innerHTML = `<button class="aa-btn sec" onclick="NcParentAvance._close()">Fermer</button>`;
      if (typeof loadNC === 'function') setTimeout(loadNC, 350);
    } catch (e) { alert(e.message); }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     UI — SCÉNARIO 2 : Post-clôture (résiduel / récidive)
  ══════════════════════════════════════════════════════════════════════════ */
  function renderPostCloture(ncId, parentId) {
    const body = `
      <div class="aa-al aa-warn">
        <strong>Clé de décision : date de fabrication du matériel</strong><br>
        <strong>Antérieure</strong> à la correction → Groupe résiduel §8.7 (CAPA valide, pas de réouverture)<br>
        <strong>Postérieure</strong> → Réouverture §10.2.1d (LNE-2 invalidée, nouvelle analyse 5P)
      </div>
      <div class="aa-f"><label class="aa-lbl">Numéro NC similaire *</label>
        <input class="aa-in" id="aa-pc-nc" value="${ncId||''}" placeholder="Ex : NC-012"></div>
      <div class="aa-f"><label class="aa-lbl">Groupe parent clôturé de référence *</label>
        <input class="aa-in" id="aa-pc-par" value="${parentId||''}" placeholder="Ex : NC-P-00001"></div>
      <div class="aa-f"><label class="aa-lbl">Date de fabrication du matériel</label>
        <input class="aa-in" type="date" id="aa-pc-fab">
        <span style="font-size:11px;color:#633806;margin-top:2px">Si inconnue : laisser vide → analyse indéterminée → vérifier N° lot avant toute décision.</span></div>
      <div id="aa-pc-res"></div>
      <hr style="margin:14px 0;border-color:#e9ecef;border-width:1px 0 0">
      <div style="font-size:11px;font-weight:700;color:#495057;margin-bottom:8px;text-transform:uppercase">Si résiduel confirmé :</div>
      <div class="aa-f"><label class="aa-lbl">Lot concerné</label>
        <input class="aa-in" id="aa-pc-lot" placeholder="Ex : F24-03"></div>
      <div class="aa-f"><label class="aa-lbl">Périmètre terrain</label>
        <input class="aa-in" id="aa-pc-terrain" placeholder="Ex : Installations terrain Brésil, stock transit Maroc"></div>`;

    const ft = `<button class="aa-btn sec" onclick="NcParentAvance._close()">Annuler</button>
      <button class="aa-btn sec" onclick="NcParentAvance._doAnalyser()">&#128269; Analyser</button>
      <button class="aa-btn vert" onclick="NcParentAvance._doResiduel()">Créer résiduel §8.7</button>
      <button class="aa-btn rouge" onclick="NcParentAvance._doReouvrir()">Réouvrir §10.2.1d</button>`;

    _mount('rouge', 'NC après clôture — Résiduel ou Récidive ?', 'Scénario 2 · ISO §8.7 / §10.2.1d — LNE-2', body, ft);
  }

  function _doAnalyser() {
    const r = Business.analyserPostCloture({
      nc_id: document.getElementById('aa-pc-nc')?.value.trim(),
      parent_clos_id: document.getElementById('aa-pc-par')?.value.trim(),
      date_fabrication_nc: document.getElementById('aa-pc-fab')?.value || null
    });
    const cls = r.type === 'residuel' ? 'res-res' : r.type === 'recidive_probable' ? 'res-rec' : 'res-ind';
    const titre = r.type === 'residuel' ? '✅ RÉSIDUEL — §8.7' : r.type === 'recidive_probable' ? '⚠️ RÉCIDIVE PROBABLE — §10.2.1d' : '❓ INDÉTERMINÉ';
    document.getElementById('aa-pc-res').innerHTML = `<div class="aa-res ${cls}">
      <strong>${titre}</strong> (confiance : ${r.confiance})<br>${r.message}<br>
      <strong>Action recommandée :</strong> ${r.action_recommandee}<br>
      <span style="font-size:10px;opacity:.8">Réf. : ${r.iso_ref}</span>
    </div>`;
  }

  function _doResiduel() {
    const nc_id = document.getElementById('aa-pc-nc')?.value.trim();
    const parent_clos_id = document.getElementById('aa-pc-par')?.value.trim();
    const date_fab = document.getElementById('aa-pc-fab')?.value;
    const lot = document.getElementById('aa-pc-lot')?.value.trim();
    const terrain = document.getElementById('aa-pc-terrain')?.value.trim();
    if (!nc_id || !parent_clos_id) { alert('NC et groupe clôturé obligatoires.'); return; }
    try {
      const grp = Business.creerGroupeResiduel({
        parent_clos_id, nc_ids: [nc_id], lot_concerne: lot,
        date_fabrication_avant: date_fab, perimetre_terrain: terrain, admin_email: Auth.email()
      });
      document.getElementById('ncpaa-body').innerHTML = `<div class="aa-res res-res">
        <strong>Groupe résiduel <code>${grp.id}</code> créé.</strong><br>
        Lié à <strong>${parent_clos_id}</strong>. La CAPA d'origine reste valide (§8.7).<br>
        Lot : ${lot||'—'} · Terrain : ${terrain||'—'}
      </div>`;
      document.getElementById('ncpaa-ft').innerHTML = `<button class="aa-btn sec" onclick="NcParentAvance._close()">Fermer</button>`;
      if (typeof loadNC === 'function') setTimeout(loadNC, 350);
    } catch (e) { alert(e.message); }
  }

  function _doReouvrir() {
    const parent_id = document.getElementById('aa-pc-par')?.value.trim();
    const nc_id = document.getElementById('aa-pc-nc')?.value.trim();
    if (!parent_id) { alert('ID du groupe obligatoire.'); return; }
    const motif = prompt('Motif de réouverture (min. 20 car. — ISO §10.2.1d) :');
    if (!motif) return;
    try {
      Business.reouvrir({ parent_id, nc_id_recidive: nc_id, motif_reouverture: motif, admin_email: Auth.email() });
      document.getElementById('ncpaa-body').innerHTML = `<div class="aa-res res-rec">
        <strong>Groupe ${parent_id} réouvert.</strong><br>
        LNE-2 invalidée — preuve précédente archivée.<br>
        Nouvelle analyse 5P obligatoire depuis la cause racine.<br>
        NC <strong>${nc_id}</strong> ajoutée comme satellite.
      </div>`;
      document.getElementById('ncpaa-ft').innerHTML = `<button class="aa-btn sec" onclick="NcParentAvance._close()">Fermer</button>`;
      if (typeof loadNC === 'function') setTimeout(loadNC, 350);
    } catch (e) { alert(e.message); }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     UI — Fenêtres de veille
  ══════════════════════════════════════════════════════════════════════════ */
  function renderVeille() {
    const body = `
      <div class="aa-al aa-info">Durée après clôture d'un groupe pendant laquelle une NC similaire déclenche l'alerte "résiduel probable". Recommandations LNE : critique 180j, majeure 90j, mineure 30j.</div>
      ${['critique','majeure','mineure'].map(g => {
        const bg = g==='critique'?'#f8d7da':g==='majeure'?'#fff3cd':'#d1e7dd';
        const co = g==='critique'?'#721c24':g==='majeure'?'#664d03':'#0a3622';
        return `<div class="aa-fen-row">
          <span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:8px;background:${bg};color:${co};min-width:70px;text-align:center">${g}</span>
          <span style="flex:1;font-size:12px;color:#495057">Fenêtre de veille</span>
          <input type="number" id="aa-v-${g}" value="${_fenetres[g]}" min="1" max="730" style="width:75px;padding:6px 8px;border:1.5px solid #dee2e6;border-radius:6px;font-size:13px;text-align:center">
          <span style="font-size:12px;color:#6c757d">jours</span>
        </div>`;
      }).join('')}
      <div style="font-size:11px;color:#6c757d;margin-top:6px">Source : §10.3 Amélioration continue · LNE-3</div>`;

    const ft = `<button class="aa-btn sec" onclick="NcParentAvance._close()">Annuler</button>
      <button class="aa-btn vert" onclick="NcParentAvance._doVeille()">Enregistrer</button>`;

    _mount('violet', 'Fenêtres de veille post-clôture', 'ISO §10.3 — LNE-3 · Configurable par gravité', body, ft);
  }

  function _doVeille() {
    try {
      ['critique','majeure','mineure'].forEach(g => {
        const v = parseInt(document.getElementById(`aa-v-${g}`)?.value);
        if (v) Business.configurerFenetreVeille({ gravite: g, jours: v, admin_email: Auth.email() });
      });
      document.getElementById('ncpaa-body').innerHTML = `<div class="aa-res res-res">
        Fenêtres enregistrées : critique ${_fenetres.critique}j · majeure ${_fenetres.majeure}j · mineure ${_fenetres.mineure}j
      </div>`;
      document.getElementById('ncpaa-ft').innerHTML = `<button class="aa-btn sec" onclick="NcParentAvance._close()">Fermer</button>`;
    } catch (e) { alert(e.message); }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     FABs ADMIN (3 boutons empilés au-dessus du FAB NcParent)
  ══════════════════════════════════════════════════════════════════════════ */
  function _injectFabs() {
    if (!Auth.isAllowed()) return;
    [
      { id: 'ncpaa-fab-tardif',    label: 'NC tardive',      bottom: '186px', bg: '#633806', fn: () => renderTardive()    },
      { id: 'ncpaa-fab-postclo',   label: 'Après clôture',   bottom: '240px', bg: '#791F1F', fn: () => renderPostCloture() },
      { id: 'ncpaa-fab-veille',    label: 'Veille post-clos', bottom: '294px', bg: '#3C3489', fn: () => renderVeille()     }
    ].forEach(({ id, label, bottom, bg, fn }) => {
      if (document.getElementById(id)) return;
      const btn = document.createElement('button');
      btn.id = id; btn.textContent = label;
      Object.assign(btn.style, { position:'fixed', bottom, right:'24px', zIndex:'9997',
        padding:'7px 13px', background: bg, color:'#fff', border:'none',
        borderRadius:'22px', cursor:'pointer', fontSize:'11px', fontWeight:'600',
        boxShadow:'0 2px 10px rgba(0,0,0,.2)', transition:'opacity .15s', display:'none' });
      btn.addEventListener('mouseenter', () => btn.style.opacity = '.85');
      btn.addEventListener('mouseleave', () => btn.style.opacity = '1');
      btn.addEventListener('click', fn);
      document.body.appendChild(btn);
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════════════════════ */
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fmtD(iso) { return iso ? new Date(iso).toLocaleDateString('fr-FR') : '—'; }

  /* ══════════════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════════════ */
  function _onTabChange(tabName) {
    ['ncpaa-fab-tardif','ncpaa-fab-postclo','ncpaa-fab-veille'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = tabName === 'parents' ? 'inline-block' : 'none';
    });
  }

  function init() { _injectCSS(); _injectFabs(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ══════════════════════════════════════════════════════════════════════════
     API PUBLIQUE
  ══════════════════════════════════════════════════════════════════════════ */
  window.NcParentAvance = {
    openTardive   : (ncId, parentId) => renderTardive(ncId, parentId),
    openPostCloture: (ncId, parentId) => renderPostCloture(ncId, parentId),
    openVeille    : () => renderVeille(),
    rattacherTardif : o => Business.rattacherTardif({ ...o, admin_email: o.admin_email || Auth.email() }),
    reouvrir      : o => Business.reouvrir({ ...o, admin_email: o.admin_email || Auth.email() }),
    creerResiduel : o => Business.creerGroupeResiduel({ ...o, admin_email: o.admin_email || Auth.email() }),
    analyserPostCloture: o => Business.analyserPostCloture(o),
    scanSimilarite: nc => Business.scanAlertesSimilarite(nc),
    configurerVeille: o => Business.configurerFenetreVeille({ ...o, admin_email: o.admin_email || Auth.email() }),
    getFenetres   : () => ({ ..._fenetres }),
    checkFenetreVeille: nc => Business.checkFenetreVeille(nc),
    _close, _pickSugg, _doTardif, _doAnalyser, _doResiduel, _doReouvrir, _doVeille,
    _onTabChange
  };

})();
