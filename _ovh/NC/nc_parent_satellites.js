'use strict';
console.log('[NcParent] nc_parent_satellites.js v1 chargé — Module NC Parent-Satellites');

(function () {

  /* ══════════════════════════════════════════════════════════════════════════
     STORE — mémoire (remplacé par fetch API en production)
  ══════════════════════════════════════════════════════════════════════════ */
  const Store = {
    parentGroups: [],
    journal: [],
    notifications: [],           // { id, groupe_id, type, to_email, to_nom, message, emis_le, emis_par, lu_pilote, reponse, reponse_le, reponse_lu_admin }

    nextId() {
      const n = (this.parentGroups.length + 1).toString().padStart(5, '0');
      return `NC-P-${n}`;
    },
    nextNotifId() {
      return `NCP-N-${(this.notifications.length + 1).toString().padStart(4, '0')}`;
    },
    addGroup(g)    { this.parentGroups.push(g); return g; },
    getGroup(id)   { return this.parentGroups.find(g => g.id === id); },
    getGroups()    { return [...this.parentGroups]; },
    nc_get_all()   { return typeof allNC !== 'undefined' ? [...allNC] : []; },
    getSatellites(pid) {
      const g = this.getGroup(pid);
      if (!g) return [];
      const list = typeof allNC !== 'undefined' ? allNC : [];
      return g.satellites.map(id => list.find(n => n.numero === id)).filter(Boolean);
    },
    addJournal(e)  { this.journal.unshift({ ...e, timestamp: new Date().toISOString() }); },
    getJournal()   { return [...this.journal]; },
    addNotif(n) {
      const entry = { ...n, id: this.nextNotifId(), emis_le: new Date().toISOString(), lu_pilote: false, reponse: null, reponse_le: null, reponse_lu_admin: false };
      this.notifications.unshift(entry);
      return entry;
    },
    getNotifs(groupe_id) {
      return groupe_id
        ? this.notifications.filter(n => n.groupe_id === groupe_id)
        : [...this.notifications];
    },
    getUnread() {
      return this.notifications.filter(n => n.reponse && !n.reponse_lu_admin);
    },
    markAdminRead(id) {
      const n = this.notifications.find(n => n.id === id); if (n) n.reponse_lu_admin = true;
    },

    async load() {
      try {
        const hdrs = typeof authHdr === 'function' ? authHdr() : {};
        const r = await fetch('/api/nc/parent-groups', { headers: hdrs });
        if (r.ok) {
          const d = await r.json();
          this.parentGroups  = Array.isArray(d.groups)        ? d.groups        : [];
          this.notifications = Array.isArray(d.notifications) ? d.notifications : [];
          this.journal       = Array.isArray(d.journal)       ? d.journal       : [];
          // Appliquer flags is_satellite / parent_id sur allNC en mémoire
          const list = typeof allNC !== 'undefined' ? allNC : [];
          this.parentGroups.forEach(g => {
            g.satellites.forEach(id => {
              const nc = list.find(n => n.numero === id);
              if (nc) { nc.is_satellite=true; nc.parent_id=g.id; nc.parent_label=g.groupe_label; }
            });
            // Synchroniser is_parent sur allNC si la NC parent est déjà chargée
            const pnc = list.find(n => n.numero === g.id);
            if (pnc) { pnc.is_parent=true; pnc.satellites=g.satellites; pnc.groupe_label=g.groupe_label; }
          });
          console.log('[NcParent Store.load] OK —', this.parentGroups.length, 'groupes');
        }
      } catch(e) { console.error('[NcParent Store.load]', e.message); }
    },

    async save() {
      try {
        const hdrs = typeof authHdr === 'function' ? { ...authHdr(), 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
        const r = await fetch('/api/nc/parent-groups', {
          method: 'PUT', headers: hdrs,
          body: JSON.stringify({ groups: this.parentGroups, notifications: this.notifications, journal: this.journal })
        });
        if (!r.ok) console.error('[NcParent Store.save] HTTP', r.status);
      } catch(e) { console.error('[NcParent Store.save]', e.message); }
    }
  };

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
    assertAdmin() {
      if (!this.isAllowed()) throw new Error('Accès refusé — rôle admin requis (RG-01).');
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     BUSINESS
  ══════════════════════════════════════════════════════════════════════════ */
  const GRAV = { critique: 3, majeure: 2, mineure: 1 };

  const Business = {

    async creerGroupe({ label, nc_ids, motif, admin_email }) {
      Auth.assertAdmin();
      if (!label || !label.trim()) throw new Error('Le libellé du groupe est obligatoire.');
      if (!nc_ids || nc_ids.length < 2) throw new Error('Minimum 2 NC requises pour créer un groupe (RG-02).');

      // Vérification conflits (lecture depuis parentGroups en mémoire)
      const list = typeof allNC !== 'undefined' ? allNC : [];
      for (const id of nc_ids) {
        const clash = Store.parentGroups.find(g => g.satellites.includes(id) && g.statut !== 'close');
        if (clash) throw new Error(`NC ${id} est déjà satellite du groupe ${clash.id} (RG-04).`);
      }

      // Appel API — la NC parent est créée dans nc-data.json côté serveur
      const hdrs = typeof authHdr === 'function' ? { ...authHdr(), 'Content-Type':'application/json' } : { 'Content-Type':'application/json' };
      const r = await fetch('/api/nc/create-parent-group', {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ label, nc_ids, motif: motif||'' })
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'HTTP '+r.status); }
      const parentNC = await r.json();

      // Mettre à jour allNC en mémoire
      if (typeof allNC !== 'undefined') {
        allNC.unshift(parentNC);
        for (const id of nc_ids) {
          const nc = list.find(n => n.numero === id);
          if (nc) { nc.is_satellite=true; nc.parent_id=parentNC.numero; nc.parent_label=parentNC.groupe_label; }
        }
      }

      // Recharger le Store pour avoir les groupes à jour
      await Store.load();
      Business._notif(nc_ids, 'rattachement', parentNC.numero, parentNC.groupe_label);
      return parentNC;
    },

    ajouterSatellites({ parent_id, nc_ids, motif, admin_email }) {
      Auth.assertAdmin();
      const grp = Store.getGroup(parent_id);
      if (!grp) throw new Error(`Groupe ${parent_id} introuvable.`);
      if (grp.statut === 'close') throw new Error(`Le groupe ${parent_id} est clôturé.`);
      const list = typeof allNC !== 'undefined' ? allNC : [];
      const added = [];
      const now = new Date().toISOString();
      const by = admin_email || Auth.email();
      for (const id of nc_ids) {
        if (grp.satellites.includes(id)) continue;
        const clash = Store.parentGroups.find(g => g.satellites.includes(id) && g.statut !== 'close');
        if (clash) throw new Error(`NC ${id} est déjà satellite du groupe ${clash.id} (RG-04).`);
        grp.satellites.push(id);
        added.push(id);
        const nc = list.find(n => n.numero === id);
        if (nc) {
          nc.is_satellite = true; nc.parent_id = parent_id; nc.parent_label = grp.groupe_label;
          nc._statut_avant = nc.statut; nc.statut = 'rattachee';
          nc.rattachement_date = now; nc.rattachement_by = by; nc.rattachement_motif = motif || '';
          if (nc.perimetre) grp.groupe_perimetre = [...new Set([...grp.groupe_perimetre, nc.perimetre])];
          if ((GRAV[nc.gravite] || 0) > (GRAV[grp.gravite] || 0)) grp.gravite = nc.gravite;
        }
      }
      if (added.length) {
        Store.addJournal({ action: 'SATELLITES_AJOUTES', parent_id, nc_ids: added, by, motif });
        Business._notif(added, 'rattachement', parent_id, grp.groupe_label);
        Store.save();
      }
      return grp;
    },

    async detacherSatellite({ parent_id, nc_id, motif, admin_email }) {
      Auth.assertAdmin();
      const grp = Store.getGroup(parent_id);
      if (!grp) throw new Error(`Groupe ${parent_id} introuvable.`);
      if (!grp.satellites.includes(nc_id)) throw new Error(`NC ${nc_id} n'est pas dans le groupe ${parent_id}.`);
      const hdrs = typeof authHdr === 'function' ? { ...authHdr(), 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
      const resp = await fetch(`/api/nc/${parent_id}/satellites/${nc_id}`, {
        method: 'DELETE', headers: hdrs,
        body: JSON.stringify({ motif: motif || '' })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(()=>({error:'Erreur serveur'}));
        throw new Error(err.error || 'Détachement échoué');
      }
      const result = await resp.json();
      // Mise à jour mémoire locale
      grp.satellites = grp.satellites.filter(id => id !== nc_id);
      const list = typeof allNC !== 'undefined' ? allNC : [];
      const nc = list.find(n => n.numero === nc_id);
      if (nc) {
        nc.is_satellite = false; nc.parent_id = null; nc.parent_label = null;
        nc.statut = result.statut_restaure || nc._statut_avant || 'ouvert';
        nc.cloture_via_parent = null; delete nc._statut_avant; delete nc.statutAvantRattachement;
      }
      Store.addJournal({ action: 'SATELLITE_DETACHE', parent_id, nc_id, by: admin_email || Auth.email(), motif });
      return grp;
    },

    cloturerGroupe({ parent_id, preuve, commentaire, admin_email }) {
      Auth.assertAdmin();
      if (!preuve || preuve.trim().length < 30)
        throw new Error('Preuve d\'efficacité insuffisante (min. 30 car.) — ISO §10.2.1e / LNE bloquant.');
      const grp = Store.getGroup(parent_id);
      if (!grp) throw new Error(`Groupe ${parent_id} introuvable.`);
      if (grp.statut === 'close') throw new Error(`Le groupe ${parent_id} est déjà clôturé.`);
      const closedAt = new Date().toISOString();
      const by = admin_email || Auth.email();
      const list = typeof allNC !== 'undefined' ? allNC : [];
      for (const id of grp.satellites) {
        const nc = list.find(n => n.numero === id);
        if (nc) { nc.statut = 'clos'; nc.cloture_via_parent = parent_id; nc.clos_le = closedAt; }
      }
      grp.statut = 'close'; grp.preuve_efficacite = preuve.trim();
      grp.commentaire_cloture = commentaire || ''; grp.clos_le = closedAt; grp.clos_par = by;
      Store.addJournal({ action: 'GROUPE_CLOS', parent_id, satellites_clos: [...grp.satellites], by, preuve: preuve.substring(0, 100) });
      Business._notif(grp.satellites, 'cloture', parent_id, grp.groupe_label, preuve);
      Notif.envoyerPilote({ groupe_id: parent_id, type: 'GROUPE_CLOS', emis_par: by,
        message: `Le groupe ${parent_id} « ${grp.groupe_label} » a été clôturé. Preuve d'efficacité enregistrée. ${grp.satellites.length} NC satellites fermées en cascade.` });
      Store.save();
      return grp;
    },

    _notif(nc_ids, type, parent_id, parent_label, preuve) {
      const list = typeof allNC !== 'undefined' ? allNC : [];
      nc_ids.forEach(id => {
        const nc = list.find(n => n.numero === id);
        const dest = nc ? (nc.declarantEmail || nc.emailRedacteur || nc.createdBy || '') : '';
        const nom  = nc ? (nc.redacteur || nc.nomClient || id) : id;
        if (type === 'rattachement') {
          Notif.envoyerDeclarant({ groupe_id: parent_id, nc_id: id, to_email: dest, to_nom: nom,
            type: 'RATTACHEMENT',
            message: `Votre NC ${id} a été rattachée au groupe d'analyse ${parent_id} « ${parent_label} ». Elle sera traitée dans le cadre d'une analyse groupée. Vous serez notifié(e) lors de la clôture.` });
        } else {
          Notif.envoyerDeclarant({ groupe_id: parent_id, nc_id: id, to_email: dest, to_nom: nom,
            type: 'CLOTURE',
            message: `Votre NC ${id} a été clôturée via le groupe ${parent_id} « ${parent_label} ». ${preuve ? 'Preuve d\'efficacité : ' + preuve.slice(0, 80) + '…' : ''}` });
        }
      });
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     NOTIF — Gestion des notifications pilote ↔ admin
  ══════════════════════════════════════════════════════════════════════════ */
  const Notif = {

    // Admin → pilote du groupe
    envoyerPilote({ groupe_id, type, message, emis_par }) {
      const grp = Store.getGroup(groupe_id);
      if (!grp || !grp.pilote_email) return null;
      const n = Store.addNotif({
        groupe_id, type, direction: 'admin_vers_pilote',
        to_email: grp.pilote_email, to_nom: grp.pilote_nom || grp.pilote_email,
        message: message || '', emis_par: emis_par || Auth.email()
      });
      // Envoi email réel au pilote via SMTP serveur
      const _hdrs = typeof authHdr === 'function' ? { ...authHdr(), 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
      fetch('/api/nc/parent-groups/notify-email', {
        method: 'POST', headers: _hdrs,
        body: JSON.stringify({ to_email: grp.pilote_email, to_nom: grp.pilote_nom || grp.pilote_email,
          groupe_id, groupe_label: grp.groupe_label, type, message: message || '' })
      }).then(r => { if (!r.ok) console.warn('[NcParent·Email]', r.status); })
        .catch(e => console.warn('[NcParent·Email]', e.message));
      Store.addJournal({ action: 'NOTIF_PILOTE', parent_id: groupe_id, by: emis_par || Auth.email(), motif: `${type} → ${grp.pilote_email}` });
      return n;
    },

    // Admin → déclarant d'une NC satellite
    envoyerDeclarant({ groupe_id, nc_id, to_email, to_nom, type, message }) {
      const n = Store.addNotif({
        groupe_id, nc_id, type, direction: 'admin_vers_declarant',
        to_email, to_nom, message: message || '', emis_par: Auth.email()
      });
      console.log(`[NcParent·Notif] → déclarant ${to_email || to_nom} | NC ${nc_id} | ${type}`);
      return n;
    },

    // Pilote → admin (réponse)
    repondre({ notif_id, reponse }) {
      const n = Store.notifications.find(x => x.id === notif_id);
      if (!n) throw new Error('Notification introuvable.');
      if (!reponse || reponse.trim().length < 3) throw new Error('Réponse trop courte.');
      n.reponse = reponse.trim();
      n.reponse_le = new Date().toISOString();
      n.reponse_lu_admin = false;
      const grp = Store.getGroup(n.groupe_id);
      Store.addJournal({ action: 'REPONSE_PILOTE', parent_id: n.groupe_id, by: Auth.email(), motif: reponse.slice(0,80) });
      console.log(`[NcParent·Notif] Réponse pilote → admin | groupe ${n.groupe_id}`);
      return n;
    },

    // Admin marque une réponse comme lue
    marquerLu(notif_id) { Store.markAdminRead(notif_id); renderTab(); },

    // Stats pour bandeau d'alerte
    stats() {
      const notifs = Store.getNotifs();
      const unreadResponses = notifs.filter(n => n.reponse && !n.reponse_lu_admin).length;
      const groupsSansPilote = Store.getGroups().filter(g => g.statut !== 'close' && !g.pilote_email).length;
      const capaRetard = Store.getGroups().reduce((acc, g) => {
        if (g.statut === 'close') return acc;
        const retard = (g.actions||[]).filter(a => a.statut !== 'validee' && a.echeance && new Date(a.echeance) < new Date()).length;
        return acc + retard;
      }, 0);
      return { unreadResponses, groupsSansPilote, capaRetard };
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     CSS
  ══════════════════════════════════════════════════════════════════════════ */
  const CSS = `
#ncpa-ov{position:fixed;inset:0;background:rgba(0,0,0,.52);z-index:12000;display:flex;align-items:center;justify-content:center;padding:16px}
#ncpa-modal{background:#fff;border-radius:12px;width:100%;max-width:780px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.32)}
#ncpa-modal *{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}
.ncpa-hdr{background:#0c447c;color:#fff;padding:15px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.ncpa-hdr-t{font-size:14px;font-weight:700}.ncpa-hdr-s{font-size:11px;opacity:.7;margin-top:2px}
.ncpa-x{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;opacity:.7;line-height:1;padding:2px}.ncpa-x:hover{opacity:1}
.ncpa-tabs{display:flex;border-bottom:2px solid #e9ecef;flex-shrink:0;background:#f8f9fa}
.ncpa-tab{padding:10px 18px;font-size:12px;font-weight:600;border:none;background:none;cursor:pointer;color:#6c757d;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .15s}
.ncpa-tab.act{color:#0c447c;border-bottom-color:#0c447c;background:#fff}
.ncpa-body{flex:1;overflow-y:auto;padding:18px 20px}
.ncpa-ft{padding:12px 20px;border-top:1px solid #e9ecef;display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;background:#f8f9fa}
.ncpa-sec{font-size:10px;font-weight:700;text-transform:uppercase;color:#6c757d;letter-spacing:.05em;margin:14px 0 7px;padding-bottom:3px;border-bottom:1px solid #e9ecef}
.ncpa-row{display:flex;gap:12px;margin-bottom:12px}.ncpa-f{display:flex;flex-direction:column;gap:4px;flex:1}
.ncpa-lbl{font-size:11px;font-weight:700;color:#495057;text-transform:uppercase;letter-spacing:.03em}
.ncpa-in,.ncpa-sel,.ncpa-ta{padding:8px 10px;border:1.5px solid #dee2e6;border-radius:6px;font-size:13px;font-family:inherit;color:#212529;background:#fff;transition:border-color .15s}
.ncpa-in:focus,.ncpa-sel:focus,.ncpa-ta:focus{outline:none;border-color:#0c447c;box-shadow:0 0 0 2px rgba(12,68,124,.1)}
.ncpa-ta{resize:vertical;min-height:68px}
.ncpa-list{border:1px solid #dee2e6;border-radius:6px;max-height:200px;overflow-y:auto;background:#fff}
.ncpa-item{display:flex;align-items:center;gap:10px;padding:7px 12px;border-bottom:1px solid #f0f0f0;cursor:pointer;transition:background .1s;font-size:12px}
.ncpa-item:last-child{border-bottom:none}.ncpa-item:hover{background:#f8f9fa}
.ncpa-item.sel{background:#E6F1FB;border-left:3px solid #0c447c}.ncpa-item.dis{opacity:.4;cursor:not-allowed}
.ncpa-num{font-weight:700;font-size:12px;color:#0c447c;min-width:96px;font-family:monospace}
.ncpa-inf{flex:1;color:#495057}
.g-crit{background:#f8d7da;color:#721c24;font-size:10px;padding:1px 6px;border-radius:8px;font-weight:600}
.g-maj{background:#fff3cd;color:#664d03;font-size:10px;padding:1px 6px;border-radius:8px;font-weight:600}
.g-min{background:#d1e7dd;color:#0a3622;font-size:10px;padding:1px 6px;border-radius:8px;font-weight:600}
.ncpa-btn{padding:8px 16px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;transition:all .15s}
.ncpa-prim{background:#0c447c;color:#fff}.ncpa-prim:hover{background:#185FA5}
.ncpa-dang{background:#c0392b;color:#fff}.ncpa-dang:hover{background:#a93226}
.ncpa-sec{background:#f8f9fa;color:#495057;border:1px solid #dee2e6}.ncpa-sec:hover{background:#e9ecef}
.ncpa-al{padding:9px 14px;border-radius:6px;font-size:12px;margin-bottom:10px;line-height:1.5}
.al-warn{background:#FAEEDA;border:1px solid #F5BF7C;color:#633806}
.al-info{background:#E6F1FB;border:1px solid #85B7EB;color:#0c447c}
.al-dang{background:#FCEBEB;border:1px solid #E6A3A3;color:#791F1F}
.al-ok{background:#EAF3DE;border:1px solid #8FBB5A;color:#27500A}
.ncpa-grp{border:1px solid #dee2e6;border-radius:8px;padding:13px;margin-bottom:9px;background:#fff;transition:border-color .15s}
.ncpa-grp:hover{border-color:#0c447c}
.ncpa-grp-hdr{display:flex;align-items:center;gap:9px;margin-bottom:7px;flex-wrap:wrap}
.ncpa-grp-id{font-size:11px;font-weight:700;color:#0c447c;font-family:monospace}
.ncpa-grp-lbl{font-size:13px;font-weight:600;color:#212529;flex:1}
.ncpa-grp-meta{font-size:11px;color:#6c757d;display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.ncpa-chip{display:inline-block;font-size:11px;padding:1px 8px;background:#E6F1FB;color:#0c447c;border-radius:10px;margin:2px;border:1px solid #85B7EB;cursor:pointer}
.ncpa-chip:hover{background:#cfe2ff}
.ncpa-jrn{padding:7px 12px;border-left:3px solid #dee2e6;margin-bottom:5px;font-size:12px;color:#495057;line-height:1.5;border-radius:0 4px 4px 0}
.jrn-clos{border-left-color:#27500A;background:#f8fdf5}
.jrn-cree{border-left-color:#0c447c;background:#f5f9ff}
.jrn-det{border-left-color:#633806;background:#fffaf5}
.jrn-reo{border-left-color:#791F1F;background:#fff5f5}
.ncpa-srch{width:100%;padding:7px 10px;border:1.5px solid #dee2e6;border-radius:6px;font-size:12px;margin-bottom:9px}
.ncpa-srch:focus{outline:none;border-color:#0c447c}
.ncpa-cnt{font-size:11px;color:#6c757d;margin-left:6px}
.ncpa-bdg-parent{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;background:#E6F1FB;color:#0c447c;border:1px solid #85B7EB;cursor:pointer;white-space:nowrap;vertical-align:middle;margin-left:4px}
.ncpa-bdg-sat{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;background:#f0f0f0;color:#495057;border:1px solid #ccc;cursor:pointer;white-space:nowrap;vertical-align:middle;margin-left:4px}
.ncpa-bdg-sim{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;background:#FAEEDA;color:#633806;border:1px solid #F5BF7C;cursor:pointer;white-space:nowrap;vertical-align:middle;margin-left:4px}
.ncpa-sat-banner{background:#FFF3CD;border:1.5px solid #F5BF7C;color:#633806;padding:11px 16px;border-radius:8px;font-size:13px;margin-bottom:14px;line-height:1.5}
.ncpa-sat-banner strong{color:#7d4a00}
#modal-body.ncpa-sat-locked .btn-upd{pointer-events:none!important;opacity:.3!important;cursor:not-allowed!important}
#modal-body.ncpa-sat-locked .grav-btn{pointer-events:none!important;opacity:.3!important;cursor:not-allowed!important}
#modal-body.ncpa-sat-locked select:not(.ncpa-allow){pointer-events:none!important;opacity:.5!important}
#modal-body.ncpa-sat-locked input[type=text]:not(.ncpa-allow),#modal-body.ncpa-sat-locked textarea:not(.ncpa-allow){pointer-events:none!important;background:#f8f9fa!important;opacity:.6!important}
#ncpf-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:13000;display:flex;align-items:center;justify-content:center;padding:16px}
#ncpf-modal{background:#fff;border-radius:12px;width:100%;max-width:880px;max-height:95vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.3)}
#ncpf-modal *{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}
.pf-hdr{background:#0c447c;color:#fff;padding:14px 20px;display:flex;align-items:center;gap:10px;flex-shrink:0}
.pf-hdr-id{font-size:12px;font-weight:700;font-family:monospace;background:rgba(255,255,255,.15);padding:2px 8px;border-radius:5px}
.pf-hdr-lbl{flex:1;font-size:14px;font-weight:700}
.pf-hdr-x{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;opacity:.7;padding:2px;line-height:1}.pf-hdr-x:hover{opacity:1}
.pf-tabs{display:flex;border-bottom:2px solid #e9ecef;flex-shrink:0;background:#f8f9fa;overflow-x:auto}
.pf-tab{padding:9px 16px;font-size:12px;font-weight:600;border:none;background:none;cursor:pointer;color:#6c757d;border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:all .15s}
.pf-tab.act{color:#0c447c;border-bottom-color:#0c447c;background:#fff}
.pf-body{flex:1;overflow-y:auto;padding:18px 20px}
.pf-ft{padding:11px 20px;border-top:1px solid #e9ecef;display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;background:#f8f9fa}
.pf-sec{font-size:10px;font-weight:700;text-transform:uppercase;color:#6c757d;letter-spacing:.05em;margin:16px 0 8px;padding-bottom:3px;border-bottom:1px solid #e9ecef}
.pf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-bottom:14px}
.pf-field{display:flex;flex-direction:column;gap:3px}
.pf-lbl{font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:.03em}
.pf-val{font-size:13px;color:#212529}
.pf-inp{width:100%;padding:7px 10px;border:1.5px solid #dee2e6;border-radius:6px;font-size:13px;font-family:inherit;color:#212529;background:#fff}
.pf-inp:focus{outline:none;border-color:#0c447c}
.pf-ta{resize:vertical;min-height:60px;width:100%;padding:7px 10px;border:1.5px solid #dee2e6;border-radius:6px;font-size:13px;font-family:inherit;color:#212529;background:#fff}
.pf-ta:focus{outline:none;border-color:#0c447c}
.pf-row{display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap}
.pf-f{display:flex;flex-direction:column;gap:4px;flex:1;margin-bottom:9px}
.pf-lbl2{font-size:11px;font-weight:700;color:#495057;text-transform:uppercase;letter-spacing:.03em}
.pf-sat-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:3px 10px;background:#E6F1FB;border:1px solid #85B7EB;border-radius:10px;margin:2px;cursor:pointer;color:#0c447c;font-weight:600}
.pf-sat-chip:hover{background:#cfe2ff}
.pf-action-card{border:1px solid #dee2e6;border-radius:7px;padding:11px;margin-bottom:8px;background:#fff}
.pf-action-hdr{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}
.pf-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px}
.pf-al{padding:9px 14px;border-radius:6px;font-size:12px;margin-bottom:10px;line-height:1.5}
.pf-info{background:#E6F1FB;border:1px solid #85B7EB;color:#0c447c}
.pf-warn{background:#FAEEDA;border:1px solid #F5BF7C;color:#633806}
.pf-ok{background:#EAF3DE;border:1px solid #8FBB5A;color:#27500A}
.pf-btn{padding:7px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;transition:all .15s}
.pf-prim{background:#0c447c;color:#fff}.pf-prim:hover{background:#185FA5}
.pf-dang{background:#c0392b;color:#fff}.pf-dang:hover{background:#a93226}
.pf-sec2{background:#f8f9fa;color:#495057;border:1px solid #dee2e6}.pf-sec2:hover{background:#e9ecef}
.pf-save{background:#27500A;color:#fff}.pf-save:hover{background:#3a6e12}
`;

  /* ══════════════════════════════════════════════════════════════════════════
     UI — Modal
  ══════════════════════════════════════════════════════════════════════════ */
  let _view = 'creer', _sel = new Set(), _curGrp = null;

  function openModal(view, parentId) {
    if (!Auth.isAllowed()) return; // Silencieux — NcParent.open() gère le fallback chef produit
    _closeModal();
    _injectCSS();
    _view = view || 'creer'; _sel = new Set(); _curGrp = parentId || null;
    _mount();
  }

  function _closeModal() {
    const el = document.getElementById('ncpa-ov'); if (el) el.remove();
  }

  function _mount() {
    const ov = document.createElement('div');
    ov.id = 'ncpa-ov';
    ov.addEventListener('click', e => { if (e.target === ov) _closeModal(); });
    ov.innerHTML = `<div id="ncpa-modal">
      <div class="ncpa-hdr">
        <div><div class="ncpa-hdr-t">Gestion NC parent-satellites</div><div class="ncpa-hdr-s">ISO §10.2.2 · §10.3 — LNE-3 · LNE-4</div></div>
        <button class="ncpa-x" onclick="NcParent._close()">&#x2715;</button>
      </div>
      <div class="ncpa-tabs">
        <button class="ncpa-tab" data-v="creer" onclick="NcParent._tab('creer')">Créer un groupe</button>
        <button class="ncpa-tab" data-v="gerer" onclick="NcParent._tab('gerer')">Gérer les groupes</button>
        <button class="ncpa-tab" data-v="journal" onclick="NcParent._tab('journal')">Journal d'audit</button>
      </div>
      <div class="ncpa-body" id="ncpa-body"></div>
      <div class="ncpa-ft" id="ncpa-ft"></div>
    </div>`;
    document.body.appendChild(ov);
    _render();
  }

  function _tab(v) {
    _view = v; _sel = new Set();
    document.querySelectorAll('.ncpa-tab').forEach(t => t.classList.toggle('act', t.dataset.v === v));
    _render();
  }

  function _render() {
    const body = document.getElementById('ncpa-body'), ft = document.getElementById('ncpa-ft');
    if (!body) return;
    if (_view === 'creer') _vCreer(body, ft);
    else if (_view === 'gerer') _vGerer(body, ft);
    else _vJournal(body, ft);
  }

  /* ── Vue Créer ─────────────────────────────────────────────────────────── */
  function _vCreer(body, ft) {
    const list = typeof allNC !== 'undefined' ? allNC : [];
    const disp = list.filter(nc => !nc.is_satellite && nc.statut !== 'clos' && !nc.is_parent);
    body.innerHTML = `
      <div class="ncpa-al al-info">Sélectionnez ≥ 2 NC. Les satellites partagent une analyse unique et sont verrouillés jusqu'à la clôture du groupe.</div>
      <div class="ncpa-row">
        <div class="ncpa-f" style="flex:2"><label class="ncpa-lbl">Libellé du groupe *</label>
          <input class="ncpa-in" id="ncpa-lbl-in" type="text" placeholder="Ex : Défaut boîtier lot F24-09" maxlength="120"></div>
        <div class="ncpa-f"><label class="ncpa-lbl">Motif</label>
          <input class="ncpa-in" id="ncpa-motif-in" type="text" placeholder="Même symptôme, même lot…" maxlength="200"></div>
      </div>
      <div class="ncpa-sec">NC disponibles — cliquer pour sélectionner <span class="ncpa-cnt" id="ncpa-cnt">(0)</span></div>
      <input class="ncpa-srch" id="ncpa-srch" type="text" placeholder="Filtrer…" oninput="NcParent._filter()">
      <div class="ncpa-list" id="ncpa-nc-list">
        ${!disp.length ? '<div style="padding:18px;text-align:center;color:#aaa;font-size:13px">Aucune NC disponible</div>' :
          disp.map(nc => `<div class="ncpa-item" data-id="${nc.numero}" onclick="NcParent._toggle('${nc.numero}')">
            <span class="ncpa-num">${nc.numero}</span>
            <span class="ncpa-inf">${esc2(nc.nomClient||'—').slice(0,20)} — ${esc2(nc.probleme||'').slice(0,55)}…</span>
            <span class="${nc.gravite==='critique'?'g-crit':nc.gravite==='majeure'?'g-maj':'g-min'}">${nc.gravite||'—'}</span>
            <span style="font-size:10px;color:#aaa">${nc.perimetre||''}</span>
          </div>`).join('')}
      </div>`;
    ft.innerHTML = `<button class="ncpa-btn ncpa-sec" onclick="NcParent._close()">Annuler</button>
      <button class="ncpa-btn ncpa-prim" onclick="NcParent._doCreer()">Créer le groupe</button>`;
  }

  function _toggle(id) {
    if (_sel.has(id)) _sel.delete(id); else _sel.add(id);
    document.querySelectorAll('.ncpa-item').forEach(el =>
      el.classList.toggle('sel', _sel.has(el.dataset.id)));
    const c = document.getElementById('ncpa-cnt');
    if (c) c.textContent = `(${_sel.size} sélectionnée${_sel.size > 1 ? 's' : ''})`;
  }

  function _filter() {
    const q = (document.getElementById('ncpa-srch')?.value || '').toLowerCase();
    document.querySelectorAll('.ncpa-item').forEach(el =>
      el.style.display = !q || el.textContent.toLowerCase().includes(q) ? '' : 'none');
  }

  function _doCreer() {
    try {
      const grp = Business.creerGroupe({
        label: document.getElementById('ncpa-lbl-in')?.value || '',
        nc_ids: [..._sel],
        motif: document.getElementById('ncpa-motif-in')?.value || '',
        admin_email: Auth.email()
      });
      _ok(`Groupe <strong>${grp.id}</strong> créé avec ${grp.satellites.length} satellites.`);
      if (typeof loadNC === 'function') setTimeout(loadNC, 350);
      setTimeout(renderTab, 400);
      // Second pass badges : loadNC est async, forcer réinjection après qu'il soit terminé
      if (typeof renderTable === 'function') setTimeout(renderTable, 700);
    } catch (e) { _err(e.message); }
  }

  /* ── Vue Gérer ─────────────────────────────────────────────────────────── */
  function _vGerer(body, ft) {
    const groups = Store.getGroups();
    if (!groups.length) { body.innerHTML = '<div class="ncpa-al al-info">Aucun groupe créé.</div>'; ft.innerHTML = ''; return; }
    const open = groups.filter(g => g.statut !== 'close');
    const closed = groups.filter(g => g.statut === 'close');
    let h = '';
    if (open.length) { h += '<div class="ncpa-sec">Groupes en traitement</div>'; open.forEach(g => h += _grpCard(g)); }
    if (closed.length) { h += '<div class="ncpa-sec" style="margin-top:14px">Groupes clôturés</div>'; closed.forEach(g => h += _grpCard(g)); }
    body.innerHTML = h; ft.innerHTML = '';
  }

  function _grpCard(g) {
    const stBadge = g.statut === 'close'
      ? '<span style="background:#EAF3DE;color:#27500A;font-size:10px;padding:1px 8px;border-radius:10px;font-weight:600">Clôturé</span>'
      : g.statut === 'en_traitement_reouvert'
      ? '<span style="background:#FCEBEB;color:#791F1F;font-size:10px;padding:1px 8px;border-radius:10px;font-weight:600">Réouvert</span>'
      : '<span style="background:#E6F1FB;color:#0c447c;font-size:10px;padding:1px 8px;border-radius:10px;font-weight:600">En traitement</span>';
    const gravBadge = g.gravite ? `<span class="${g.gravite==='critique'?'g-crit':g.gravite==='majeure'?'g-maj':'g-min'}">${g.gravite}</span>` : '';
    const chips = g.satellites.map(id => `<span class="ncpa-chip">${id}</span>`).join('');
    const residuelBadge = g.est_residuel ? '<span style="background:#FAEEDA;color:#633806;font-size:10px;padding:1px 8px;border-radius:10px;font-weight:600;margin-left:4px">RÉSIDUEL §8.7</span>' : '';
    const actions = g.statut !== 'close' ? `
      <div style="margin-top:9px;display:flex;gap:7px;flex-wrap:wrap">
        <button class="ncpa-btn ncpa-sec" style="font-size:11px;padding:4px 10px" onclick="NcParent._vAjouter('${g.id}')">+ Ajouter NC</button>
        <button class="ncpa-btn ncpa-sec" style="font-size:11px;padding:4px 10px" onclick="NcParent._vDetacher('${g.id}')">Détacher NC</button>
        <button class="ncpa-btn ncpa-dang" style="font-size:11px;padding:4px 10px" onclick="NcParent._vCloture('${g.id}')">Clôturer le groupe</button>
      </div>` : `<div style="margin-top:6px;font-size:11px;color:#6c757d">Clôturé le ${fmtD(g.clos_le)} par ${g.clos_par||'—'}</div>`;
    return `<div class="ncpa-grp">
      <div class="ncpa-grp-hdr"><span class="ncpa-grp-id">${g.id}</span><span class="ncpa-grp-lbl">${esc2(g.groupe_label)}</span>${gravBadge}${stBadge}${residuelBadge}</div>
      <div class="ncpa-grp-meta">
        <span>${g.satellites.length} satellite${g.satellites.length>1?'s':''}</span>
        <span>Périmètres : ${g.groupe_perimetre.join(', ')||'—'}</span>
        <span>Créé le ${fmtD(g.groupe_created_at)} par ${g.groupe_created_by}</span>
      </div>
      <div>${chips}</div>${actions}
    </div>`;
  }

  function _vAjouter(pid) {
    _curGrp = pid; _sel = new Set();
    const grp = Store.getGroup(pid);
    const list = typeof allNC !== 'undefined' ? allNC : [];
    const disp = list.filter(nc => !nc.is_satellite && nc.statut !== 'clos' && !nc.is_parent && !grp.satellites.includes(nc.numero));
    const body = document.getElementById('ncpa-body'), ft = document.getElementById('ncpa-ft');
    body.innerHTML = `<div class="ncpa-al al-info">Ajout au groupe <strong>${pid}</strong> — ${esc2(grp.groupe_label)}</div>
      <div class="ncpa-f" style="margin-bottom:10px"><label class="ncpa-lbl">Motif</label>
        <input class="ncpa-in" id="ncpa-add-motif" type="text" placeholder="Même symptôme identifié tardivement…"></div>
      <div class="ncpa-list">
        ${disp.map(nc => `<div class="ncpa-item" data-id="${nc.numero}" onclick="NcParent._toggle('${nc.numero}')">
          <span class="ncpa-num">${nc.numero}</span>
          <span class="ncpa-inf">${esc2(nc.nomClient||'—').slice(0,20)} — ${esc2(nc.probleme||'').slice(0,55)}</span>
          <span class="${nc.gravite==='critique'?'g-crit':nc.gravite==='majeure'?'g-maj':'g-min'}">${nc.gravite||'—'}</span>
        </div>`).join('') || '<div style="padding:14px;text-align:center;color:#aaa">Aucune NC disponible</div>'}
      </div>`;
    ft.innerHTML = `<button class="ncpa-btn ncpa-sec" onclick="NcParent._tab('gerer')">← Retour</button>
      <button class="ncpa-btn ncpa-prim" onclick="NcParent._doAjouter()">Ajouter</button>`;
  }

  function _doAjouter() {
    try {
      Business.ajouterSatellites({ parent_id: _curGrp, nc_ids: [..._sel],
        motif: document.getElementById('ncpa-add-motif')?.value, admin_email: Auth.email() });
      _ok(`${_sel.size} NC ajoutée(s) au groupe ${_curGrp}.`);
      if (typeof loadNC === 'function') setTimeout(loadNC, 350);
      setTimeout(renderTab, 400);
    } catch (e) { _err(e.message); }
  }

  function _vDetacher(pid) {
    _curGrp = pid; _sel = new Set();
    const grp = Store.getGroup(pid);
    const list = typeof allNC !== 'undefined' ? allNC : [];
    const body = document.getElementById('ncpa-body'), ft = document.getElementById('ncpa-ft');
    body.innerHTML = `<div class="ncpa-al al-warn">Le détachement redonne le statut "en_traitement" à la NC. Opération tracée dans le journal.</div>
      <div class="ncpa-f" style="margin-bottom:10px"><label class="ncpa-lbl">Motif *</label>
        <textarea class="ncpa-ta" id="ncpa-det-motif" placeholder="Erreur de rattachement…"></textarea></div>
      <div class="ncpa-sec">Satellites actuels</div>
      <div class="ncpa-list">
        ${grp.satellites.map(id => {
          const nc = list.find(n => n.numero === id);
          return `<div class="ncpa-item" data-id="${id}" onclick="NcParent._toggle('${id}')">
            <span class="ncpa-num">${id}</span>
            <span class="ncpa-inf">${nc ? esc2(nc.nomClient||'—').slice(0,20)+' — '+esc2(nc.probleme||'').slice(0,45) : '—'}</span>
          </div>`;
        }).join('')}
      </div>`;
    ft.innerHTML = `<button class="ncpa-btn ncpa-sec" onclick="NcParent._tab('gerer')">← Retour</button>
      <button class="ncpa-btn ncpa-dang" onclick="NcParent._doDetacher()">Détacher</button>`;
  }

  async function _doDetacher() {
    const motif = document.getElementById('ncpa-det-motif')?.value || '';
    if (!motif.trim()) { _err('Le motif est obligatoire.'); return; }
    try {
      for (const id of _sel)
        await Business.detacherSatellite({ parent_id: _curGrp, nc_id: id, motif, admin_email: Auth.email() });
      _ok(`${_sel.size} NC détachée(s).`);
      if (typeof loadNC === 'function') setTimeout(loadNC, 350);
      setTimeout(renderTab, 400);
    } catch (e) { _err(e.message); }
  }

  function _vCloture(pid) {
    _curGrp = pid;
    const grp = Store.getGroup(pid);
    const list = typeof allNC !== 'undefined' ? allNC : [];
    let capaOuv = 0;
    grp.satellites.forEach(id => {
      const nc = list.find(n => n.numero === id);
      if (nc?.actions) capaOuv += nc.actions.filter(a => a.statut !== 'validee' && a.statut !== 'close').length;
    });
    const body = document.getElementById('ncpa-body'), ft = document.getElementById('ncpa-ft');
    body.innerHTML = `
      ${capaOuv > 0 ? `<div class="ncpa-al al-warn"><strong>Avertissement :</strong> ${capaOuv} action(s) CAPA non validée(s). La clôture reste possible — cet avertissement est tracé dans le journal.</div>` : ''}
      <div class="ncpa-al al-info">Clôture en cascade : <strong>${grp.satellites.length} NC</strong> seront clôturées simultanément. Chaque déclarant sera notifié.</div>
      <div style="margin-bottom:12px">${grp.satellites.map(id => `<span class="ncpa-chip">${id}</span>`).join('')}</div>
      <div class="ncpa-f" style="margin-bottom:10px">
        <label class="ncpa-lbl">Preuve d'efficacité * <span style="color:#c0392b">(ISO §10.2.1e — LNE bloquant)</span></label>
        <textarea class="ncpa-ta" id="ncpa-preuve" style="min-height:88px" placeholder="Ex : 0 récidive sur 3 mois (capture stats jointe), procédure mise à jour signée le XX/XX, résultat test conformité…"></textarea>
        <span style="font-size:11px;color:#c0392b">Minimum 30 caractères — une pièce jointe est recommandée.</span>
      </div>
      <div class="ncpa-f"><label class="ncpa-lbl">Commentaire</label>
        <textarea class="ncpa-ta" id="ncpa-comm" placeholder="Résumé de la résolution pour les déclarants…"></textarea>
      </div>`;
    ft.innerHTML = `<button class="ncpa-btn ncpa-sec" onclick="NcParent._tab('gerer')">← Retour</button>
      <button class="ncpa-btn ncpa-dang" onclick="NcParent._doCloture()">Clôturer le groupe en cascade</button>`;
  }

  function _doCloture() {
    const preuve = document.getElementById('ncpa-preuve')?.value || '';
    const comm = document.getElementById('ncpa-comm')?.value || '';
    try {
      Business.cloturerGroupe({ parent_id: _curGrp, preuve, commentaire: comm, admin_email: Auth.email() });
      _ok(`Groupe ${_curGrp} clôturé en cascade. Toutes les NC satellites sont fermées et les déclarants notifiés.`);
      if (typeof loadNC === 'function') setTimeout(loadNC, 350);
      setTimeout(renderTab, 400);
    } catch (e) { _err(e.message); }
  }

  /* ── Vue Journal ────────────────────────────────────────────────────────── */
  function _vJournal(body, ft) {
    const j = Store.getJournal();
    if (!j.length) { body.innerHTML = '<div class="ncpa-al al-info">Journal vide.</div>'; ft.innerHTML = ''; return; }
    const META = {
      GROUPE_CREE: ['Groupe créé','jrn-cree'], SATELLITES_AJOUTES: ['NC ajoutée(s)','jrn-cree'],
      SATELLITE_DETACHE: ['NC détachée','jrn-det'], GROUPE_CLOS: ['Groupe clôturé','jrn-clos'],
      GROUPE_REOUVERT_RECIDIVE: ['Groupe réouvert — récidive','jrn-reo'],
      GROUPE_RESIDUEL_CREE: ['Groupe résiduel créé','jrn-cree'],
      RATTACHEMENT_TARDIF: ['Rattachement tardif','jrn-det'],
      FENETRE_VEILLE_MODIFIEE: ['Fenêtre veille modifiée','jrn-cree']
    };
    body.innerHTML = j.map(e => {
      const [lbl, cls] = META[e.action] || [e.action, ''];
      return `<div class="ncpa-jrn ${cls}">
        <strong>${lbl}</strong>${e.parent_id ? ' — '+e.parent_id : ''}
        <span style="float:right;color:#aaa;font-size:10px">${fmtDT(e.timestamp)}</span><br>
        <span style="color:#6c757d">Par : ${e.by||'—'}</span>
        ${e.motif ? ' | '+esc2(String(e.motif).slice(0,80)) : ''}
        ${e.satellites ? `<br>Satellites : ${e.satellites.join(', ')}` : ''}
        ${e.nc_id ? ` | NC : ${e.nc_id}` : ''}
        ${e.nc_ids ? `<br>NC : ${e.nc_ids.join(', ')}` : ''}
        ${e.lne ? `<br><span style="color:#791F1F;font-size:10px">${e.lne}</span>` : ''}
      </div>`;
    }).join('');
    ft.innerHTML = '';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     BADGES — hook dans renderTable
  ══════════════════════════════════════════════════════════════════════════ */
  function _badgeHtml(nc) {
    if (!nc) return '';
    if (nc.is_parent) {
      const g = Store.getGroup(nc.numero);
      const n = g ? g.satellites.length : 0;
      return `<span class="ncpa-bdg-parent" onclick="event.stopPropagation();NcParent.open('${nc.numero}')" title="NC Parent — ${n} satellite(s)">&#9670; PARENT (${n})</span>`;
    }
    if (nc.is_satellite && nc.parent_id)
      return `<span class="ncpa-bdg-sat" onclick="event.stopPropagation();NcParent.open('${nc.parent_id}')" title="Rattachée à ${nc.parent_id}">&#8594; ${nc.parent_id}</span>`;
    if (nc._sim_alert)
      return `<span class="ncpa-bdg-sim" onclick="event.stopPropagation();window.NcParentAvance&&NcParentAvance.openTardive('${nc.numero}')" title="Similarité avec ${nc._sim_alert.parent_id}">&#9888; ${nc._sim_alert.score}%</span>`;
    return '';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════════════════════ */
  function esc2(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fmtD(iso) { return iso ? new Date(iso).toLocaleDateString('fr-FR') : '—'; }
  function fmtDT(iso) { return iso ? new Date(iso).toLocaleString('fr-FR') : '—'; }
  function _ok(msg) {
    const body = document.getElementById('ncpa-body');
    if (body) body.innerHTML = `<div class="ncpa-al al-ok" style="font-size:13px;padding:14px"><strong>Succès</strong><br>${msg}</div>`;
    const ft = document.getElementById('ncpa-ft');
    if (ft) ft.innerHTML = `<button class="ncpa-btn ncpa-sec" onclick="NcParent._tab('gerer')">Voir les groupes</button><button class="ncpa-btn ncpa-sec" onclick="NcParent._close()">Fermer</button>`;
  }
  function _err(msg) {
    let el = document.getElementById('ncpa-err'); if (el) el.remove();
    el = document.createElement('div'); el.id = 'ncpa-err';
    el.className = 'ncpa-al al-dang'; el.style.cssText = 'margin:0 0 10px';
    el.textContent = msg;
    const ft = document.getElementById('ncpa-ft');
    if (ft) ft.parentNode.insertBefore(el, ft);
  }
  function _injectCSS() {
    if (document.getElementById('ncpa-styles')) return;
    const s = document.createElement('style'); s.id = 'ncpa-styles'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     FAB ADMIN
  ══════════════════════════════════════════════════════════════════════════ */
  function _injectFab() {
    if (!Auth.isAllowed() || document.getElementById('ncpa-fab')) return;
    const btn = document.createElement('button');
    btn.id = 'ncpa-fab';
    btn.title = 'Regrouper des NC — Module Parent-Satellites';
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="5" cy="12" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><line x1="7" y1="11.5" x2="17" y2="7"/><line x1="7" y1="12.5" x2="17" y2="17"/></svg><span style="margin-left:6px;font-size:12px;font-weight:600">Regrouper NC</span>`;
    Object.assign(btn.style, { position:'fixed', bottom:'132px', right:'24px', zIndex:'9998',
      padding:'9px 14px', background:'#27500A', color:'#fff', border:'none',
      borderRadius:'24px', cursor:'pointer', display:'none', alignItems:'center',
      boxShadow:'0 2px 12px rgba(0,0,0,.2)', transition:'background .15s' });
    btn.addEventListener('mouseenter', () => btn.style.background = '#3a6e12');
    btn.addEventListener('mouseleave', () => btn.style.background = '#27500A');
    btn.addEventListener('click', () => openModal('creer'));
    document.body.appendChild(btn);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     INIT + patch renderTable
  ══════════════════════════════════════════════════════════════════════════ */
  function init() {
    _injectCSS();
    _injectFab();
    // Charger les groupes depuis le serveur (persistance cross-refresh)
    Store.load().then(() => {
      // Si allNC est déjà chargé (loadNC plus rapide), réappliquer les flags maintenant
      const list = typeof allNC !== 'undefined' ? allNC : [];
      if (list.length > 0) {
        Store.getGroups().forEach(g => g.satellites.forEach(id => {
          const nc = list.find(n => n.numero === id);
          if (nc) { nc.is_satellite = true; nc.parent_id = g.id; nc.parent_label = g.groupe_label; if (g.statut !== 'close') nc.statut = 'rattachee'; }
        }));
        // Forcer la réinjection des badges si la liste est déjà affichée
        if (typeof renderTable === 'function') setTimeout(renderTable, 0);
      }
      if (document.getElementById('ncpt-body')) renderTab();
    });
    if (typeof renderTable === 'function' && !renderTable._ncpaPatch) {
      const _orig = renderTable;
      window.renderTable = function () {
        _orig.apply(this, arguments);
        setTimeout(() => {
          const list = typeof allNC !== 'undefined' ? allNC : [];
          // Réappliquer les flags satellite depuis les groupes chargés (fix post-refresh)
          Store.getGroups().forEach(g => {
            g.satellites.forEach(id => {
              const nc = list.find(n => n.numero === id);
              if (nc) {
                nc.is_satellite = true;
                nc.parent_id = g.id;
                nc.parent_label = g.groupe_label;
                if (g.statut !== 'close') nc.statut = 'rattachee';
              }
            });
          });
          // Ajouter les badges dans la liste
          document.querySelectorAll('#nc-tbody tr.row-link').forEach(row => {
            const numEl = row.querySelector('[data-col="numero"] .nc-num');
            if (!numEl) return;
            const nc = list.find(n => n.numero === numEl.textContent.trim());
            if (!nc) return;
            const badge = _badgeHtml(nc);
            if (!badge || row.querySelector('.ncpa-bdg-parent,.ncpa-bdg-sat,.ncpa-bdg-sim')) return;
            const tmp = document.createElement('span'); tmp.innerHTML = badge;
            numEl.parentNode.appendChild(tmp.firstElementChild);
          });
        }, 80);
      };
      window.renderTable._ncpaPatch = true;
    }
  }

  /* ── Visibilité FABs selon onglet actif ──────────────────────────────── */
  function _onTabChange(tabName) {
    const fab = document.getElementById('ncpa-fab');
    if (fab) fab.style.display = tabName === 'liste' ? '' : 'none';
    if (window.NcParentAvance && NcParentAvance._onTabChange) NcParentAvance._onTabChange(tabName);
  }

  /* ── Ouvre la modal sur la bonne action depuis le tab ─────────────────── */
  function _openForAction(pid, action) {
    openModal('gerer', pid);
    setTimeout(() => {
      if      (action === 'ajouter')  _vAjouter(pid);
      else if (action === 'detacher') _vDetacher(pid);
      else if (action === 'cloture')  _vCloture(pid);
    }, 60);
  }

  /* ── Verrou satellite dans la fiche NC (patch window.openModal) ────────── */
  function _patchOpenModal() {
    if (typeof window.openModal !== 'function' || window.openModal._ncpaSatPatch) return;
    const _origOpen = window.openModal;
    window.openModal = async function (numero) {
      await _origOpen.apply(this, arguments);
      setTimeout(() => _applySatLock(numero), 120);
    };
    window.openModal._ncpaSatPatch = true;
  }

  function _applySatLock(numero) {
    const grp = Store.getGroups().find(g => g.statut !== 'close' && g.satellites.includes(numero));
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) return;
    // Toujours nettoyer un verrou précédent
    modalBody.classList.remove('ncpa-sat-locked');
    const old = modalBody.querySelector('.ncpa-sat-banner');
    if (old) old.remove();
    if (!grp) return;
    // Appliquer le verrou
    modalBody.classList.add('ncpa-sat-locked');
    const banner = document.createElement('div');
    banner.className = 'ncpa-sat-banner';
    banner.innerHTML = `<strong>NC satellite — groupe ${grp.id}</strong> « ${esc2(grp.groupe_label)} »<br>
      <span style="font-size:12px">Cette NC est verrouillée (RG-05 ISO §10.2.2). L'analyse de cause et la CAPA sont portées par le groupe parent.
      <span style="cursor:pointer;text-decoration:underline;font-weight:700;margin-left:6px" onclick="NcParent.open('${grp.id}')">→ Ouvrir le groupe</span></span>`;
    modalBody.insertBefore(banner, modalBody.firstChild);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // Patch openModal après que console.html ait fini de définir ses fonctions
  setTimeout(_patchOpenModal, 0);

  /* ══════════════════════════════════════════════════════════════════════════
     FICHE NC PARENT — modal de traitement (5P, Ishikawa, CAPA, Clôture)
  ══════════════════════════════════════════════════════════════════════════ */
  let _ficheGrpId = null;
  let _pilotesCache = [];
  let _ficheView  = 'ident';

  function openFiche(groupId) {
    const grp = Store.getGroup(groupId);
    if (!grp) { alert('Groupe introuvable.'); return; }
    _ficheGrpId = groupId; _ficheView = 'ident';
    _closeFiche(); _injectCSS();
    const ov = document.createElement('div'); ov.id = 'ncpf-ov';
    ov.addEventListener('click', e => { if (e.target === ov) _closeFiche(); });
    const stLabel = grp.statut === 'close' ? 'Clôturé' : grp.statut === 'en_traitement_reouvert' ? 'Réouvert' : 'En traitement';
    const gravCls = grp.gravite === 'critique' ? 'g-crit' : grp.gravite === 'majeure' ? 'g-maj' : 'g-min';
    const unread = Store.getNotifs(groupId).filter(n => n.reponse && !n.reponse_lu_admin).length;
    ov.innerHTML = `<div id="ncpf-modal">
      <div class="pf-hdr">
        <span class="pf-hdr-id">${grp.id}</span>
        <span class="pf-hdr-lbl">${esc2(grp.groupe_label)}</span>
        <span class="${gravCls}">${grp.gravite||'—'}</span>
        <span style="font-size:10px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.18);font-weight:600">${stLabel}</span>
        ${grp.pilote_nom ? `<span style="font-size:11px;opacity:.8">👤 ${esc2(grp.pilote_nom)}</span>` : '<span style="font-size:11px;color:#f5c842;font-weight:600">⚠ Sans pilote</span>'}
        <button class="pf-hdr-x" onclick="NcParent._closeFiche()">&#x2715;</button>
      </div>
      <div class="pf-tabs">
        <button class="pf-tab act" data-pv="ident"   onclick="NcParent._ficheTab('ident')">📋 Identification</button>
        <button class="pf-tab"     data-pv="analyse"  onclick="NcParent._ficheTab('analyse')">🔍 Analyse 5P</button>
        <button class="pf-tab"     data-pv="capa"     onclick="NcParent._ficheTab('capa')">⚡ CAPA</button>
        <button class="pf-tab"     data-pv="cloture"  onclick="NcParent._ficheTab('cloture')">✅ Clôture</button>
        <button class="pf-tab"     data-pv="messages" onclick="NcParent._ficheTab('messages')">📬 Messages${unread ? ` <span style="background:#c0392b;color:#fff;font-size:9px;padding:0 5px;border-radius:8px;font-weight:700">${unread}</span>` : ''}</button>
        <button class="pf-tab"     data-pv="journal"  onclick="NcParent._ficheTab('journal')">📜 Journal</button>
      </div>
      <div class="pf-body" id="ncpf-body"></div>
      <div class="pf-ft"  id="ncpf-ft"></div>
    </div>`;
    document.body.appendChild(ov);
    _renderFiche();
  }

  function _closeFiche() { const el = document.getElementById('ncpf-ov'); if (el) el.remove(); }

  function _ficheTab(view) {
    _ficheView = view;
    document.querySelectorAll('.pf-tab').forEach(t => t.classList.toggle('act', t.dataset.pv === view));
    _renderFiche();
  }

  function _renderFiche() {
    const grp = Store.getGroup(_ficheGrpId);
    const body = document.getElementById('ncpf-body');
    const ft   = document.getElementById('ncpf-ft');
    if (!grp || !body) return;
    if      (_ficheView === 'ident')    _ficheIdent(grp, body, ft);
    else if (_ficheView === 'analyse')  _ficheAnalyse(grp, body, ft);
    else if (_ficheView === 'capa')     _ficheCapa(grp, body, ft);
    else if (_ficheView === 'cloture')  _ficheCloture(grp, body, ft);
    else if (_ficheView === 'messages') _ficheMessages(grp, body, ft);
    else                                _ficheJournal(grp, body, ft);
    // Injecter les boutons ? d'aide sur les labels de la fiche NC parent
    setTimeout(() => { if (window.NCAide && NCAide.injectFicheButtons) NCAide.injectFicheButtons(); }, 60);
  }

  function _ficheIdent(grp, body, ft) {
    const list = typeof allNC !== 'undefined' ? allNC : [];
    const chips = grp.satellites.map(id => {
      const nc = list.find(n => n.numero === id);
      return `<span class="pf-sat-chip" onclick="NcParent._openSat('${id}')"
        title="${nc ? esc2((nc.probleme||'').slice(0,80)) : 'NC introuvable'}">${id}
        ${nc ? `<span style="font-size:9px;opacity:.65">${nc.gravite||''}</span>` : ''}</span>`;
    }).join('');
    const rows = grp.satellites.map(id => {
      const nc = list.find(n => n.numero === id);
      const gc = nc ? (nc.gravite==='critique'?'g-crit':nc.gravite==='majeure'?'g-maj':'g-min') : '';
      return `<div style="display:flex;align-items:baseline;gap:8px;padding:7px 0;border-bottom:1px solid #f5f5f5;font-size:12px">
        <span style="font-family:monospace;font-weight:700;color:#0c447c;min-width:90px;cursor:pointer"
          onclick="NcParent._openSat('${id}')">${id}</span>
        <span style="flex:1;color:#495057">${esc2(((nc&&(nc.probleme||nc.description))||'—').slice(0,90))}</span>
        ${nc ? `<span class="${gc}" style="flex-shrink:0">${nc.gravite||'—'}</span>` : ''}
        <span style="font-size:10px;color:#aaa;flex-shrink:0">${esc2((nc&&nc.perimetre)||'')}</span>
      </div>`;
    }).join('');
    body.innerHTML = `
      <div class="pf-grid">
        <div class="pf-field"><span class="pf-lbl">Identifiant</span><span class="pf-val" style="font-family:monospace;font-weight:700;color:#0c447c">${grp.id}</span></div>
        <div class="pf-field"><span class="pf-lbl">Gravité</span><span class="pf-val"><span class="${grp.gravite==='critique'?'g-crit':grp.gravite==='majeure'?'g-maj':'g-min'}">${grp.gravite||'—'}</span></span></div>
        <div class="pf-field"><span class="pf-lbl">Statut</span><span class="pf-val">${grp.statut==='close'?'<span style="color:#27500A;font-weight:600">Clôturé</span>':grp.statut==='en_traitement_reouvert'?'<span style="color:#791F1F;font-weight:600">Réouvert</span>':'<span style="color:#0c447c;font-weight:600">En traitement</span>'}</span></div>
        <div class="pf-field"><span class="pf-lbl">Satellites</span><span class="pf-val" style="font-weight:700">${grp.satellites.length} NC</span></div>
        <div class="pf-field"><span class="pf-lbl">Créé le</span><span class="pf-val">${fmtD(grp.groupe_created_at)}</span></div>
        <div class="pf-field"><span class="pf-lbl">Créé par</span><span class="pf-val">${esc2(grp.groupe_created_by||'—')}</span></div>
        <div class="pf-field"><span class="pf-lbl">Périmètres</span><span class="pf-val">${(grp.groupe_perimetre||[]).join(', ')||'—'}</span></div>
        ${grp.est_residuel?`<div class="pf-field"><span class="pf-lbl">Type</span><span class="pf-val" style="color:#633806;font-weight:600">RÉSIDUEL §8.7</span></div>`:''}
      </div>
      ${grp.groupe_motif?`<div class="pf-al pf-info"><strong>Motif :</strong> ${esc2(grp.groupe_motif)}</div>`:''}
      <div class="pf-sec">NC satellites (${grp.satellites.length}) — cliquer pour ouvrir la fiche</div>
      <div style="margin-bottom:10px;line-height:2">${chips}</div>
      ${rows}`;
    // Section pilote
    const isPilote = session && (session.email === grp.pilote_email || session.role === 'nc_admin');
    body.innerHTML += `
      <div class="pf-sec" style="margin-top:18px">Pilote du groupe — responsable analyse et CAPA</div>
      ${grp.pilote_email ? `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#EAF3DE;border:1px solid #8FBB5A;border-radius:8px;margin-bottom:10px">
          <span style="font-size:20px">👤</span>
          <div>
            <div style="font-weight:700;font-size:13px">${esc2(grp.pilote_nom||grp.pilote_email)}</div>
            <div style="font-size:11px;color:#27500A">${esc2(grp.pilote_email)}</div>
          </div>
          ${Auth.isAllowed() ? `<button class="pf-btn pf-sec2" style="margin-left:auto;font-size:11px;padding:4px 10px" onclick="NcParent._editPilote('${grp.id}')">Modifier</button>` : ''}
        </div>` : `
        <div class="pf-al pf-warn">⚠ Aucun pilote assigné. L'analyse de cause et les CAPA ne peuvent pas être suivies sans responsable désigné.
          ${Auth.isAllowed() ? `<button class="pf-btn pf-prim" style="margin-left:10px;font-size:11px;padding:4px 12px" onclick="NcParent._editPilote('${grp.id}')">Assigner un pilote</button>` : ''}
        </div>`}`;
    ft.innerHTML = `<button class="pf-btn pf-sec2" onclick="NcParent._closeFiche()">Fermer</button>
      <button class="pf-btn pf-prim" onclick="NcParent._ficheTab('analyse')">Analyse 5P →</button>`;
  }

  function _ficheAnalyse(grp, body, ft) {
    const a = grp.analyse_5p || {};
    const ishi = grp.ishikawa || {};
    const ro = grp.statut === 'close' ? 'readonly' : '';
    body.innerHTML = `
      <div class="pf-al pf-info">Analyse de cause commune à l'ensemble des satellites. La cause racine sera reprise dans les CAPA (ISO §10.2.1b-c).</div>
      <div class="pf-sec">Méthode 5 Pourquoi</div>
      ${['p1','p2','p3','p4','p5'].map((k,i) => `
        <div class="pf-f">
          <label class="pf-lbl2">Pourquoi ${i+1}</label>
          <input class="pf-inp" id="pf-5p-${k}" value="${esc2(a[k]||'')}" ${ro} placeholder="Pourquoi ${i+1}…">
        </div>`).join('')}
      <div class="pf-f" style="margin-top:4px">
        <label class="pf-lbl2" style="color:#c0392b">Cause racine identifiée *</label>
        <textarea class="pf-ta" id="pf-5p-cr" ${ro} placeholder="Cause racine — sera reprise dans la CAPA…">${esc2(a.cause_racine||'')}</textarea>
      </div>
      ${a.saisi_le ? `<div style="font-size:11px;color:#6c757d;margin:6px 0 14px">Dernière saisie : ${fmtDT(a.saisi_le)} par ${esc2(a.saisi_par||'—')}</div>` : ''}
      <div class="pf-sec" style="margin-top:18px">Diagramme Ishikawa (6M) — optionnel</div>
      ${[['materiau','Matière'],['methode','Méthode'],['milieu','Milieu / Environnement'],
         ['machine','Machine / Équipement'],['maindoeuvre','Main d\'œuvre'],['management','Management']].map(([k,l]) => `
        <div class="pf-f">
          <label class="pf-lbl2">${l}</label>
          <input class="pf-inp" id="pf-ishi-${k}" value="${esc2(ishi[k]||'')}" ${ro} placeholder="${l}…">
        </div>`).join('')}`;
    ft.innerHTML = grp.statut === 'close'
      ? `<button class="pf-btn pf-sec2" onclick="NcParent._closeFiche()">Fermer</button>`
      : `<button class="pf-btn pf-sec2" onclick="NcParent._ficheTab('ident')">← Retour</button>
         <button class="pf-btn pf-save" onclick="NcParent._saveAnalyse()">💾 Enregistrer l'analyse</button>
         <button class="pf-btn pf-prim" onclick="NcParent._saveAndGoTo('capa')">Enregistrer → CAPA</button>`;
  }

  function _saveAnalyse() {
    const grp = Store.getGroup(_ficheGrpId); if (!grp) return;
    grp.analyse_5p = {
      p1: document.getElementById('pf-5p-p1')?.value.trim()||'',
      p2: document.getElementById('pf-5p-p2')?.value.trim()||'',
      p3: document.getElementById('pf-5p-p3')?.value.trim()||'',
      p4: document.getElementById('pf-5p-p4')?.value.trim()||'',
      p5: document.getElementById('pf-5p-p5')?.value.trim()||'',
      cause_racine: document.getElementById('pf-5p-cr')?.value.trim()||'',
      saisi_le: new Date().toISOString(), saisi_par: Auth.email()
    };
    grp.ishikawa = {
      materiau:    document.getElementById('pf-ishi-materiau')?.value.trim()||'',
      methode:     document.getElementById('pf-ishi-methode')?.value.trim()||'',
      milieu:      document.getElementById('pf-ishi-milieu')?.value.trim()||'',
      machine:     document.getElementById('pf-ishi-machine')?.value.trim()||'',
      maindoeuvre: document.getElementById('pf-ishi-maindoeuvre')?.value.trim()||'',
      management:  document.getElementById('pf-ishi-management')?.value.trim()||''
    };
    Store.addJournal({ action: 'ANALYSE_ENREGISTREE', parent_id: _ficheGrpId, by: Auth.email() });
    Store.save();
  }

  function _saveAndGoTo(view) { _saveAnalyse(); _ficheTab(view); }

  function _ficheCapa(grp, body, ft) {
    const isClos = grp.statut === 'close';
    const actions = grp.actions || [];
    const SCOL = { ouvert:'#e67e22', en_cours:'#2980b9', validee:'#27ae60', close:'#95a5a6' };
    const SLBL = { ouvert:'Ouvert', en_cours:'En cours', validee:'Validée', close:'Clôturée' };
    const TYPE_LBL = { immediate:'Immédiate', curative:'Curative', corrective:'Corrective', preventive:'Préventive', amelioration:'Amélioration' };
    const TYPE_COL = { immediate:'#17a2b8', curative:'#3498db', corrective:'#e67e22', preventive:'#6f42c1', amelioration:'#27ae60' };
    const actCards = actions.length ? actions.map((a, i) => {
      const col = SCOL[a.statut]||'#888'; const lbl = SLBL[a.statut]||a.statut;
      const tCol = TYPE_COL[a.type]||'#7f8c8d'; const tLbl = TYPE_LBL[a.type]||a.type||'Corrective';
      const ech = a.echeance ? new Date(a.echeance) : null;
      const retard = ech && a.statut !== 'validee' && ech < new Date();
      return `<div class="pf-action-card" style="${retard?'border-color:#e74c3c;background:#fff8f8':''}">
        <div class="pf-action-hdr">
          <span style="font-size:10px;font-family:monospace;color:#888">#${i+1}</span>
          <span style="font-size:10px;padding:2px 7px;border-radius:4px;background:${tCol}22;color:${tCol};border:1px solid ${tCol}44;font-weight:700">${tLbl}</span>
          <span style="flex:1;font-size:13px;font-weight:600">${esc2(a.description)}</span>
          <span class="pf-badge" style="background:${col}22;color:${col};border:1px solid ${col}55">${lbl}</span>
        </div>
        <div style="font-size:11px;color:#6c757d;display:flex;gap:14px;flex-wrap:wrap;margin-top:4px">
          <span>Pilote : <strong style="color:#212529">${esc2(a.pilote_nom||a.pilote||'—')}</strong>${a.pilote_email?` <span style="color:#888">&lt;${esc2(a.pilote_email)}&gt;</span>`:''}</span>
          <span style="${retard?'color:#c0392b;font-weight:700':''}">Échéance : <strong>${ech?ech.toLocaleDateString('fr-FR'):'—'}</strong>${retard?' ⚠ RETARD':''}</span>
          ${a.validee_le?`<span style="color:#27500A">✓ Validée le ${new Date(a.validee_le).toLocaleDateString('fr-FR')} par ${esc2(a.validee_par||'?')}</span>`:''}
        </div>
        ${!isClos&&a.statut!=='validee'?`<div style="margin-top:8px;display:flex;gap:6px">
          ${a.statut==='ouvert'?`<button class="pf-btn pf-sec2" style="font-size:11px;padding:4px 10px" onclick="NcParent._ficheActStat('${a.id}','en_cours')">→ En cours</button>`:''}
          ${a.statut==='en_cours'?`<button class="pf-btn pf-save" style="font-size:11px;padding:4px 10px" onclick="NcParent._ficheActStat('${a.id}','validee')">✓ Valider</button>`:''}
          <button class="pf-btn pf-dang" style="font-size:11px;padding:4px 10px" onclick="NcParent._ficheActDel('${a.id}')">✕</button>
        </div>`:''}
      </div>`;
    }).join('') : `<div class="pf-al pf-info">Aucune action CAPA. Créez des actions correctives issues de la cause racine (ISO §10.2.1c).</div>`;
    const addForm = isClos ? '' : `
      <div class="pf-sec" style="margin-top:16px">Nouvelle action CAPA</div>
      <div class="pf-f"><label class="pf-lbl2">Description *</label>
        <textarea class="pf-ta" id="pf-act-desc" placeholder="Ex : Révision procédure contrôle lot, audit fournisseur…"></textarea></div>
      <div class="pf-row">
        <div class="pf-f"><label class="pf-lbl2">Type d'action</label>
          <select class="pf-inp" id="pf-act-type">
            <option value="immediate">Immédiate — Stopper le problème</option>
            <option value="curative">Curative — Corriger le produit/client</option>
            <option value="corrective">Corrective — Éliminer la cause racine</option>
            <option value="preventive">Préventive — Éviter la récurrence</option>
          </select></div>
        <div class="pf-f"><label class="pf-lbl2">Échéance</label>
          <input class="pf-inp" type="date" id="pf-act-ech"></div>
      </div>
      <div class="pf-f"><label class="pf-lbl2">Pilote de l'action</label>
        <select class="pf-inp" id="pf-act-pilote">
          <option value="">— Chargement des pilotes… —</option>
        </select></div>`;
    body.innerHTML = `<div class="pf-al pf-info">Actions correctives communes à tous les satellites — issues de la cause racine identifiée en onglet Analyse (ISO §10.2.1c).</div>
      ${actCards}${addForm}`;
    // Alimenter le select pilote depuis le cache ou depuis l'API
    if (!isClos) {
      const _populatePiloteSelect = (pilotes) => {
        _pilotesCache = pilotes;
        const sel = document.getElementById('pf-act-pilote'); if (!sel) return;
        sel.innerHTML = '<option value="">— Sélectionner un pilote —</option>' +
          pilotes.map(p => `<option value="${esc2(p.email||'')}|${esc2(p.name||p.email)}">${esc2(p.name||p.email)}${p.email?' &lt;'+esc2(p.email)+'&gt;':''}</option>`).join('') +
          '<option value="|__autre">✏ Saisie manuelle…</option>';
      };
      if (_pilotesCache.length) { _populatePiloteSelect(_pilotesCache); }
      else {
        const _h = typeof authHdr === 'function' ? authHdr() : {};
        fetch('/api/nc-auth/pilotes', { headers: _h }).then(r => r.ok ? r.json() : []).then(_populatePiloteSelect).catch(() => {
          const sel = document.getElementById('pf-act-pilote'); if (sel) sel.innerHTML = '<option value="">— Aucun pilote disponible —</option>';
        });
      }
    }
    ft.innerHTML = isClos
      ? `<button class="pf-btn pf-sec2" onclick="NcParent._closeFiche()">Fermer</button>`
      : `<button class="pf-btn pf-sec2" onclick="NcParent._ficheTab('analyse')">← Analyse</button>
         <button class="pf-btn pf-prim" onclick="NcParent._ficheAddAction()">+ Ajouter l'action</button>`;
  }

  function _ficheAddAction() {
    const grp = Store.getGroup(_ficheGrpId); if (!grp) return;
    const desc = document.getElementById('pf-act-desc')?.value.trim();
    if (!desc) { alert('Description obligatoire.'); return; }
    const type = document.getElementById('pf-act-type')?.value || 'corrective';
    const echeance = document.getElementById('pf-act-ech')?.value || null;
    // Lire pilote depuis le select
    const selVal = document.getElementById('pf-act-pilote')?.value || '';
    let pilote_email = '', pilote_nom = '';
    if (selVal && selVal !== '|__autre') {
      const parts = selVal.split('|');
      pilote_email = parts[0] || '';
      pilote_nom   = parts[1] || '';
    }
    if (!grp.actions) grp.actions = [];
    const newAct = {
      id: 'act-' + Date.now(), description: desc, type,
      pilote: pilote_nom, pilote_nom, pilote_email,
      echeance, statut: 'ouvert',
      cree_le: new Date().toISOString(), cree_par: Auth.email()
    };
    grp.actions.push(newAct);
    Store.addJournal({ action: 'CAPA_AJOUTEE', parent_id: _ficheGrpId, by: Auth.email(), motif: desc.slice(0,60) });
    // Email au pilote de l'action (si différent du pilote du groupe)
    if (pilote_email && pilote_email !== grp.pilote_email) {
      const _hd = typeof authHdr === 'function' ? { ...authHdr(), 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
      fetch('/api/nc/parent-groups/notify-email', {
        method: 'POST', headers: _hd,
        body: JSON.stringify({
          to_email: pilote_email, to_nom: pilote_nom || pilote_email,
          groupe_id: _ficheGrpId, groupe_label: grp.groupe_label, type: 'CAPA_ASSIGNEE',
          message: `Vous êtes désigné(e) pilote de l'action CAPA sur le groupe NC Parent ${_ficheGrpId} « ${grp.groupe_label} ».\n\nAction : ${desc}\nType : ${type}\n${echeance ? 'Échéance : ' + new Date(echeance).toLocaleDateString('fr-FR') : ''}`
        })
      }).catch(e => console.warn('[NcParent·Email·Action]', e.message));
    }
    // Notif au pilote du groupe aussi
    Notif.envoyerPilote({ groupe_id: _ficheGrpId, type: 'CAPA_ASSIGNEE', emis_par: Auth.email(),
      message: `Nouvelle action ${type} assignée : « ${desc.slice(0,100)} »${pilote_nom ? ' — Pilote : ' + pilote_nom : ''}${echeance ? ' — Échéance : ' + new Date(echeance).toLocaleDateString('fr-FR') : ''}.` });
    Store.save();
    _renderFiche();
  }

  function _ficheActStat(actId, newStat) {
    const grp = Store.getGroup(_ficheGrpId); if (!grp || !grp.actions) return;
    const act = grp.actions.find(a => a.id === actId); if (!act) return;
    act.statut = newStat;
    if (newStat === 'validee') { act.validee_le = new Date().toISOString(); act.validee_par = Auth.email(); }
    Store.addJournal({ action: 'CAPA_MAJ_STATUT', parent_id: _ficheGrpId, by: Auth.email(), motif: `${actId} → ${newStat}` });
    Store.save();
    _renderFiche();
  }

  function _ficheActDel(actId) {
    const grp = Store.getGroup(_ficheGrpId); if (!grp || !grp.actions) return;
    if (!confirm('Supprimer cette action CAPA ?')) return;
    grp.actions = grp.actions.filter(a => a.id !== actId);
    Store.save();
    _renderFiche();
  }

  function _editPilote(groupId) {
    const grp = Store.getGroup(groupId); if (!grp) return;
    const existingPanel = document.getElementById('ncpf-pilote-panel');
    if (existingPanel) existingPanel.remove();
    const panel = document.createElement('div');
    panel.id = 'ncpf-pilote-panel';
    panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:14000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Segoe UI,Arial,sans-serif';
    panel.innerHTML = `<div style="background:#fff;border-radius:10px;width:100%;max-width:440px;box-shadow:0 12px 40px rgba(0,0,0,.3);overflow:hidden">
      <div style="background:#0c447c;color:#fff;padding:14px 20px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:14px;font-weight:700">Assigner un pilote</div>
          <div style="font-size:11px;opacity:.75">${groupId} — ${esc2(grp.groupe_label)}</div>
        </div>
        <button onclick="document.getElementById('ncpf-pilote-panel').remove()" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;opacity:.7;line-height:1">&#x2715;</button>
      </div>
      <div style="padding:18px 20px">
        <div id="ncpf-pilote-list">
          <div style="font-size:12px;color:#aaa;padding:8px 0">Chargement de la liste des pilotes…</div>
        </div>
        <div style="border-top:1px solid #e9ecef;padding-top:14px;margin-top:14px">
          <div style="font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:.05em;margin-bottom:9px">Saisie manuelle (si non listé)</div>
          <div style="margin-bottom:7px">
            <label style="font-size:11px;font-weight:700;color:#495057;display:block;margin-bottom:3px">Nom</label>
            <input id="ncpf-pilote-nom" type="text" value="${esc2(grp.pilote_nom||'')}" placeholder="Prénom Nom"
              style="width:100%;padding:8px 10px;border:1.5px solid #dee2e6;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:inherit">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;color:#495057;display:block;margin-bottom:3px">Email</label>
            <input id="ncpf-pilote-email" type="email" value="${esc2(grp.pilote_email||'')}" placeholder="prenom.nom@mullerautomotive.fr"
              style="width:100%;padding:8px 10px;border:1.5px solid #dee2e6;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:inherit">
          </div>
        </div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid #e9ecef;display:flex;gap:8px;justify-content:flex-end;background:#f8f9fa">
        <button onclick="document.getElementById('ncpf-pilote-panel').remove()"
          style="padding:8px 16px;border-radius:6px;border:1px solid #dee2e6;background:#f8f9fa;cursor:pointer;font-size:12px;font-weight:600;color:#495057">Annuler</button>
        <button onclick="NcParent._savePilote('${groupId}')"
          style="padding:8px 16px;border-radius:6px;border:none;background:#0c447c;color:#fff;cursor:pointer;font-size:12px;font-weight:600">Assigner le pilote</button>
      </div>
    </div>`;
    document.body.appendChild(panel);
    // Charger la liste des pilotes depuis le serveur
    const _h = typeof authHdr === 'function' ? authHdr() : {};
    fetch('/api/nc-auth/pilotes', { headers: _h })
      .then(r => r.ok ? r.json() : [])
      .then(pilotes => {
        const listEl = document.getElementById('ncpf-pilote-list');
        if (!listEl) return;
        if (!pilotes.length) {
          listEl.innerHTML = '<div style="font-size:12px;color:#aaa;padding:6px 0">Aucun pilote configuré dans le système — utilisez la saisie manuelle.</div>';
          return;
        }
        listEl.innerHTML = `<div style="font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Pilotes disponibles</div>` +
          pilotes.map(p => `<div class="ncpf-pilote-choice" data-nom="${esc2(p.name||p.email)}" data-email="${esc2(p.email||'')}"
            onclick="NcParent._selectPilote('${esc2(p.name||p.email)}','${esc2(p.email||'')}',this)"
            style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1.5px solid #dee2e6;border-radius:7px;margin-bottom:6px;cursor:pointer;transition:border-color .15s">
            <span style="font-size:20px">👤</span>
            <div>
              <div style="font-weight:600;font-size:13px;color:#212529">${esc2(p.name||p.email)}</div>
              ${p.email ? `<div style="font-size:11px;color:#6c757d">${esc2(p.email)}</div>` : ''}
            </div>
          </div>`).join('');
        // Pré-sélectionner le pilote actuel si trouvé dans la liste
        if (grp.pilote_email) {
          const cur = pilotes.find(p => p.email === grp.pilote_email);
          if (cur) {
            const el = listEl.querySelector(`[data-email="${esc2(grp.pilote_email)}"]`);
            if (el) el.style.borderColor = '#0c447c';
          }
        }
      }).catch(() => {});
  }

  function _selectPilote(nom, email, el) {
    document.querySelectorAll('.ncpf-pilote-choice').forEach(e => e.style.borderColor = '#dee2e6');
    if (el) el.style.borderColor = '#0c447c';
    const nIn = document.getElementById('ncpf-pilote-nom');
    const eIn = document.getElementById('ncpf-pilote-email');
    if (nIn) nIn.value = nom;
    if (eIn) eIn.value = email;
  }

  function _savePilote(groupId) {
    const nom   = (document.getElementById('ncpf-pilote-nom')?.value || '').trim();
    const email = (document.getElementById('ncpf-pilote-email')?.value || '').trim();
    if (!nom && !email) { alert('Nom ou email requis.'); return; }
    const grp = Store.getGroup(groupId); if (!grp) return;
    const ancien = grp.pilote_email;
    grp.pilote_nom   = nom;
    grp.pilote_email = email;
    Store.addJournal({ action: 'PILOTE_ASSIGNE', parent_id: groupId, by: Auth.email(), motif: `${nom} <${email}>` });
    if (email && email !== ancien) {
      Notif.envoyerPilote({ groupe_id: groupId, type: 'AFFECTATION', emis_par: Auth.email(),
        message: `Vous êtes désigné(e) pilote du groupe ${groupId} « ${grp.groupe_label} » (${grp.satellites.length} NC satellites, gravité : ${grp.gravite}). Merci de prendre en charge l'analyse de cause et les actions correctives.` });
    }
    Store.save();
    document.getElementById('ncpf-pilote-panel')?.remove();
    _renderFiche(); renderTab();
  }

  function _ficheMessages(grp, body, ft) {
    const notifs  = Store.getNotifs(grp.id);
    const isAdmin = Auth.isAllowed();
    const isPilote = session && session.email === grp.pilote_email;
    const canReply = isPilote || isAdmin;

    const TLBL = {
      AFFECTATION:'Affectation pilote', RATTACHEMENT:'NC rattachée', CLOTURE:'Groupe clôturé',
      CAPA_ASSIGNEE:'Action CAPA assignée', RELANCE:'Relance admin', MESSAGE:'Message admin',
      GROUPE_CLOS:'Clôture groupe', NOTIF_PILOTE:'Notification pilote', REPONSE_PILOTE:'Réponse pilote'
    };
    const TCOL = {
      AFFECTATION:'#3C3489', RATTACHEMENT:'#0c447c', CLOTURE:'#27500A',
      CAPA_ASSIGNEE:'#633806', RELANCE:'#791F1F', MESSAGE:'#0c447c',
      GROUPE_CLOS:'#27500A', NOTIF_PILOTE:'#0c447c', REPONSE_PILOTE:'#27500A'
    };

    const notifCards = notifs.length ? notifs.map(n => {
      const col = TCOL[n.type] || '#555';
      const lbl = TLBL[n.type] || n.type;
      const hasReply = !!n.reponse;
      const unread   = hasReply && !n.reponse_lu_admin && isAdmin;
      return `<div style="border:1.5px solid ${unread ? '#c0392b' : '#e9ecef'};border-radius:8px;padding:12px;margin-bottom:10px;background:${unread ? '#FFF5F5' : '#fff'}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${col}18;color:${col};border:1px solid ${col}33">${lbl}</span>
          ${unread ? '<span style="font-size:10px;font-weight:700;color:#c0392b;background:#FCEBEB;padding:2px 7px;border-radius:8px">● Réponse non lue</span>' : ''}
          <span style="font-size:10px;color:#aaa;margin-left:auto">${fmtDT(n.emis_le)}</span>
        </div>
        <div style="font-size:12px;color:#212529;margin-bottom:4px">${esc2(n.message)}</div>
        <div style="font-size:11px;color:#6c757d">→ ${esc2(n.to_nom||n.to_email||'Pilote')}</div>
        ${hasReply ? `<div style="margin-top:9px;padding:9px 12px;background:#EAF3DE;border-left:3px solid #27500A;border-radius:4px">
          <div style="font-size:11px;font-weight:700;color:#27500A;margin-bottom:3px">Réponse pilote — ${fmtDT(n.reponse_le)}</div>
          <div style="font-size:12px;color:#212529">${esc2(n.reponse)}</div>
          ${isAdmin && unread ? `<button class="pf-btn pf-sec2" style="font-size:10px;padding:3px 8px;margin-top:6px" onclick="NcParent.Notif.marquerLu('${n.id}');NcParent.Store.save();NcParent._renderFiche()">✓ Marquer lue</button>` : ''}
        </div>` : ''}
        ${canReply && !hasReply && n.direction === 'admin_vers_pilote' && isPilote ? `
          <div style="margin-top:8px">
            <textarea class="pf-ta" id="reply-${n.id}" placeholder="Votre réponse…" style="min-height:50px"></textarea>
            <button class="pf-btn pf-save" style="font-size:11px;padding:4px 12px;margin-top:5px" onclick="NcParent._sendReply('${n.id}')">Répondre</button>
          </div>` : ''}
      </div>`;
    }).join('') : '<div class="pf-al pf-info">Aucun message pour ce groupe. Utilisez "Envoyer au pilote" pour initier une communication.</div>';

    body.innerHTML = `
      ${!grp.pilote_email ? '<div class="pf-al pf-warn">⚠ Aucun pilote assigné — les messages ne peuvent pas être envoyés. Assignez un pilote dans l\'onglet Identification.</div>' : ''}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:12px;font-weight:700;color:#495057">${notifs.length} message(s)</span>
        ${isAdmin && grp.pilote_email ? `<div style="display:flex;gap:6px">
          <button class="pf-btn pf-sec2" style="font-size:11px;padding:5px 12px" onclick="NcParent._toggleCompose()">+ Message libre</button>
          <button class="pf-btn" style="font-size:11px;padding:5px 12px;background:#791F1F;color:#fff" onclick="NcParent._sendRelance('${grp.id}')">📢 Relance pilote</button>
        </div>` : ''}
      </div>
      <div id="ncpf-compose" style="display:none;border:1.5px solid #0c447c;border-radius:8px;padding:12px;margin-bottom:14px;background:#f5f9ff">
        <div class="pf-f"><label class="pf-lbl2">Message au pilote (${esc2(grp.pilote_nom||grp.pilote_email||'—')})</label>
          <textarea class="pf-ta" id="ncpf-msg-txt" placeholder="Demande de mise à jour, point d'avancement, information complémentaire…"></textarea></div>
        <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px">
          <button class="pf-btn pf-sec2" style="font-size:11px" onclick="NcParent._toggleCompose()">Annuler</button>
          <button class="pf-btn pf-prim" style="font-size:11px" onclick="NcParent._sendMessage('${grp.id}')">Envoyer</button>
        </div>
      </div>
      ${notifCards}`;
    ft.innerHTML = `<button class="pf-btn pf-sec2" onclick="NcParent._closeFiche()">Fermer</button>`;
  }

  function _toggleCompose() {
    const el = document.getElementById('ncpf-compose');
    if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
  }

  function _sendMessage(groupId) {
    const txt = document.getElementById('ncpf-msg-txt')?.value.trim();
    if (!txt) { alert('Message vide.'); return; }
    Notif.envoyerPilote({ groupe_id: groupId, type: 'MESSAGE', message: txt, emis_par: Auth.email() });
    Store.save();
    _renderFiche(); renderTab();
  }

  function _sendRelance(groupId) {
    const grp = Store.getGroup(groupId); if (!grp) return;
    const capaOuv = (grp.actions||[]).filter(a => a.statut !== 'validee');
    const msg = capaOuv.length
      ? `RELANCE — Groupe ${groupId} « ${grp.groupe_label} » : ${capaOuv.length} action(s) CAPA en attente de validation.${capaOuv.some(a=>a.echeance&&new Date(a.echeance)<new Date()) ? ' ⚠ Des actions sont en retard.' : ''} Merci de mettre à jour les statuts.`
      : `RELANCE — Groupe ${groupId} « ${grp.groupe_label} » : Merci de confirmer l'avancement de l'analyse et des actions correctives.`;
    Notif.envoyerPilote({ groupe_id: groupId, type: 'RELANCE', message: msg, emis_par: Auth.email() });
    Store.save();
    _renderFiche(); renderTab();
  }

  function _sendReply(notifId) {
    const reponse = document.getElementById(`reply-${notifId}`)?.value.trim();
    try { Notif.repondre({ notif_id: notifId, reponse }); Store.save(); _renderFiche(); renderTab(); }
    catch (e) { alert(e.message); }
  }

  function _ficheCloture(grp, body, ft) {
    const isClos = grp.statut === 'close';
    const capaOuv = (grp.actions||[]).filter(a => a.statut !== 'validee').length;
    body.innerHTML = `
      ${isClos ? `<div class="pf-al pf-ok"><strong>Groupe clôturé</strong> le ${fmtD(grp.clos_le)} par ${esc2(grp.clos_par||'—')}.</div>` :
        capaOuv > 0 ? `<div class="pf-al pf-warn"><strong>${capaOuv} action(s) CAPA non validée(s).</strong> La clôture est possible mais sera tracée dans le journal.</div>` :
        `<div class="pf-al pf-info">Clôture en cascade : <strong>${grp.satellites.length} NC satellites</strong> seront clôturées simultanément.</div>`}
      ${grp._preuve_anterieure ? `<div class="pf-al pf-warn"><strong>Preuve LNE-2 précédente invalidée</strong> le ${fmtD(grp._preuve_anterieure.invalide_le)}<br>${esc2(grp._preuve_anterieure.raison||'')}</div>` : ''}
      <div class="pf-f"><label class="pf-lbl2">Preuve d'efficacité * <span style="color:#c0392b;font-size:10px">(ISO §10.2.1e — LNE bloquant — min. 30 car.)</span></label>
        <textarea class="pf-ta" id="pf-clos-preuve" style="min-height:90px" ${isClos?'readonly':''}
          placeholder="0 récidive sur 3 mois (stats jointes), procédure mise à jour signée le XX/XX, résultat test conformité lot…">${esc2(grp.preuve_efficacite||'')}</textarea>
      </div>
      <div class="pf-f"><label class="pf-lbl2">Commentaire de clôture</label>
        <textarea class="pf-ta" id="pf-clos-comm" ${isClos?'readonly':''}
          placeholder="Résumé pour les déclarants…">${esc2(grp.commentaire_cloture||'')}</textarea>
      </div>
      ${isClos ? `<div class="pf-sec">NC clôturées en cascade</div><div>${grp.satellites.map(id=>`<span class="ncpa-chip">${id}</span>`).join('')}</div>` : ''}`;
    ft.innerHTML = isClos
      ? `<button class="pf-btn pf-sec2" onclick="NcParent._closeFiche()">Fermer</button>`
      : `<button class="pf-btn pf-sec2" onclick="NcParent._ficheTab('capa')">← CAPA</button>
         <button class="pf-btn pf-dang" onclick="NcParent._ficheDoCloture()">Clôturer le groupe en cascade</button>`;
  }

  function _ficheDoCloture() {
    const preuve = document.getElementById('pf-clos-preuve')?.value||'';
    const comm   = document.getElementById('pf-clos-comm')?.value||'';
    try {
      Business.cloturerGroupe({ parent_id: _ficheGrpId, preuve, commentaire: comm, admin_email: Auth.email() });
      setTimeout(renderTab, 400);
      _renderFiche();
    } catch (e) { alert(e.message); }
  }

  function _ficheJournal(grp, body, ft) {
    const j = Store.getJournal().filter(e => e.parent_id === grp.id);
    const META = {
      GROUPE_CREE:['Groupe créé','#0c447c'], SATELLITES_AJOUTES:['NC ajoutée(s)','#0c447c'],
      SATELLITE_DETACHE:['NC détachée','#633806'], GROUPE_CLOS:['Groupe clôturé','#27500A'],
      GROUPE_REOUVERT_RECIDIVE:['Réouvert — récidive','#791F1F'],
      ANALYSE_ENREGISTREE:['Analyse 5P enregistrée','#3C3489'],
      CAPA_AJOUTEE:['Action CAPA créée','#3C3489'], CAPA_MAJ_STATUT:['Statut CAPA','#3C3489'],
      RATTACHEMENT_TARDIF:['Rattachement tardif','#633806']
    };
    body.innerHTML = !j.length
      ? `<div class="pf-al pf-info">Aucune entrée de journal pour ce groupe.</div>`
      : j.map(e => {
          const [lbl,col] = META[e.action]||[e.action,'#555'];
          return `<div style="padding:9px 12px;border-left:3px solid ${col};margin-bottom:6px;background:#fafafa;border-radius:0 5px 5px 0;font-size:12px;line-height:1.5">
            <strong style="color:${col}">${lbl}</strong>
            <span style="float:right;color:#aaa;font-size:10px">${fmtDT(e.timestamp)}</span><br>
            <span style="color:#6c757d">Par : ${e.by||'—'}</span>${e.motif?` — ${esc2(String(e.motif).slice(0,80))}`:''}
            ${e.satellites?`<br>Satellites : ${e.satellites.join(', ')}` : ''}
          </div>`;
        }).join('');
    ft.innerHTML = `<button class="pf-btn pf-sec2" onclick="NcParent._closeFiche()">Fermer</button>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ONGLET NC PARENTS — rendu inline dans #ncpt-body
  ══════════════════════════════════════════════════════════════════════════ */
  function renderTab() {
    const body = document.getElementById('ncpt-body');
    if (!body) return;

    const q = (document.getElementById('ncpt-srch')?.value || '').toLowerCase();
    const filtre = document.getElementById('ncpt-filtre-statut')?.value || 'tous';
    const list = typeof allNC !== 'undefined' ? allNC : [];

    let groups = Store.getGroups();
    if (filtre !== 'tous') groups = groups.filter(g => g.statut === filtre);
    if (q) groups = groups.filter(g =>
      g.id.toLowerCase().includes(q) ||
      g.groupe_label.toLowerCase().includes(q) ||
      g.satellites.some(id => id.toLowerCase().includes(q))
    );

    const open   = groups.filter(g => g.statut !== 'close');
    const closed = groups.filter(g => g.statut === 'close');

    // badges de comptage dans le header
    const bOpen  = document.getElementById('ncpt-badge-open');
    const bClose = document.getElementById('ncpt-badge-close');
    const allOpen  = Store.getGroups().filter(g => g.statut !== 'close').length;
    const allClose = Store.getGroups().filter(g => g.statut === 'close').length;
    if (bOpen)  bOpen.textContent  = `${allOpen} en traitement`;
    if (bClose) bClose.textContent = `${allClose} clôturé${allClose > 1 ? 's' : ''}`;

    // Bandeau d'alertes admin
    const st = Notif.stats();
    const alertBars = [];
    if (st.unreadResponses > 0)
      alertBars.push(`<span style="cursor:pointer;font-size:12px;font-weight:600;padding:5px 12px;background:#FCEBEB;color:#791F1F;border:1px solid #E6A3A3;border-radius:8px"
        onclick="NcParent._showUnread()">📬 ${st.unreadResponses} réponse${st.unreadResponses>1?'s':''} pilote non lue${st.unreadResponses>1?'s':''}</span>`);
    if (st.capaRetard > 0)
      alertBars.push(`<span style="font-size:12px;font-weight:600;padding:5px 12px;background:#FAEEDA;color:#633806;border:1px solid #F5BF7C;border-radius:8px">⚠ ${st.capaRetard} CAPA en retard</span>`);
    if (st.groupsSansPilote > 0)
      alertBars.push(`<span style="font-size:12px;font-weight:600;padding:5px 12px;background:#f5f5f5;color:#555;border:1px solid #ddd;border-radius:8px">👤 ${st.groupsSansPilote} groupe${st.groupsSansPilote>1?'s':''} sans pilote</span>`);
    const alertHtml = alertBars.length
      ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${alertBars.join('')}</div>` : '';

    if (!groups.length) {
      body.innerHTML = alertHtml + `<div style="text-align:center;padding:48px 20px;color:#aaa;font-size:14px">
        ${Store.getGroups().length === 0
          ? 'Aucun groupe NC parent créé. Utilisez <strong>+ Créer un groupe</strong> pour regrouper des NC similaires.'
          : 'Aucun groupe ne correspond aux filtres.'}
      </div>`;
      return;
    }

    let h = alertHtml;
    if (open.length) {
      h += `<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6c757d;letter-spacing:.05em;margin-bottom:10px">Groupes en traitement (${open.length})</div>`;
      open.forEach(g => { h += _tabCard(g, list); });
    }
    if (closed.length) {
      h += `<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6c757d;letter-spacing:.05em;margin:20px 0 10px">Groupes clôturés (${closed.length})</div>`;
      closed.forEach(g => { h += _tabCard(g, list); });
    }
    body.innerHTML = h;
  }

  function _tabCard(g, list) {
    const stStyle = g.statut === 'close'
      ? 'background:#EAF3DE;color:#27500A;border:1px solid #8FBB5A'
      : g.statut === 'en_traitement_reouvert'
      ? 'background:#FCEBEB;color:#791F1F;border:1px solid #E6A3A3'
      : 'background:#E6F1FB;color:#0c447c;border:1px solid #85B7EB';
    const stLabel = g.statut === 'close' ? 'Clôturé'
      : g.statut === 'en_traitement_reouvert' ? 'Réouvert'
      : 'En traitement';
    const gravCls = g.gravite === 'critique' ? 'g-crit' : g.gravite === 'majeure' ? 'g-maj' : 'g-min';
    const residuelBadge = g.est_residuel
      ? `<span style="font-size:10px;padding:1px 8px;border-radius:10px;background:#FAEEDA;color:#633806;border:1px solid #F5BF7C;font-weight:600">RÉSIDUEL §8.7</span>`
      : '';

    // Détail satellites : chip cliquable → ouvre la NC dans la liste
    const chips = g.satellites.map(id => {
      const nc = list.find(n => n.numero === id);
      const gravSat = nc ? (nc.gravite === 'critique' ? '#c0392b' : nc.gravite === 'majeure' ? '#d4862a' : '#27500A') : '#555';
      return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 9px;background:#f5f5f5;border:1px solid #ddd;border-radius:10px;margin:2px;cursor:pointer;color:${gravSat};font-weight:600"
        onclick="NcParent._openSat('${id}')" title="${nc ? esc2(nc.probleme||'') : ''}">${id}</span>`;
    }).join('');

    // Preuve si clôturé
    const preuveBlock = g.preuve_efficacite
      ? `<div style="margin-top:8px;padding:8px 11px;background:#EAF3DE;border-left:3px solid #27500A;border-radius:4px;font-size:12px;color:#27500A">
           <strong>Preuve d'efficacité :</strong> ${esc2(g.preuve_efficacite.slice(0, 160))}${g.preuve_efficacite.length > 160 ? '…' : ''}
         </div>` : '';

    // Actions
    let actions = '';
    if (g.statut !== 'close') {
      actions = `<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid #f0f0f0">
        <button class="ncpa-btn ncpa-sec" style="font-size:11px;padding:5px 12px" onclick="NcParent._openForAction('${g.id}','ajouter')">+ Ajouter NC</button>
        <button class="ncpa-btn ncpa-sec" style="font-size:11px;padding:5px 12px" onclick="NcParent._openForAction('${g.id}','detacher')">Détacher NC</button>
        <button class="ncpa-btn ncpa-dang" style="font-size:11px;padding:5px 12px" onclick="NcParent._openForAction('${g.id}','cloture')">Clôturer en cascade</button>
      </div>`;
    } else {
      actions = `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #f0f0f0;font-size:11px;color:#6c757d">
        Clôturé le ${fmtD(g.clos_le)} par ${esc2(g.clos_par || '—')}
        ${window.NcParentAvance ? `<button class="ncpa-btn ncpa-sec" style="font-size:11px;padding:4px 10px;margin-left:10px" onclick="NcParentAvance.openReouverture('${g.id}')">Réanalyser / Réouvrir</button>` : ''}
      </div>`;
    }

    return `<div class="ncpa-grp" style="margin-bottom:12px">
      <div class="ncpa-grp-hdr" style="cursor:pointer" onclick="NcParent.openFiche('${g.id}')" title="Ouvrir la fiche de traitement">
        <span class="ncpa-grp-id">${g.id}</span>
        <span class="ncpa-grp-lbl">${esc2(g.groupe_label)}</span>
        <span style="font-size:10px;color:#aaa;margin-left:auto">Ouvrir →</span>
        <span class="${gravCls}">${g.gravite || '—'}</span>
        <span style="font-size:10px;padding:1px 8px;border-radius:10px;font-weight:600;${stStyle}">${stLabel}</span>
        ${residuelBadge}
      </div>
      <div class="ncpa-grp-meta">
        <span><strong>${g.satellites.length}</strong> satellite${g.satellites.length > 1 ? 's' : ''}</span>
        <span>Périmètres : ${(g.groupe_perimetre || []).join(', ') || '—'}</span>
        <span>Créé le ${fmtD(g.groupe_created_at)} par ${esc2(g.groupe_created_by || '—')}</span>
        ${g.groupe_motif ? `<span style="color:#888;font-style:italic">${esc2(g.groupe_motif.slice(0, 80))}</span>` : ''}
      </div>
      <div style="margin-top:6px">${chips}</div>
      ${preuveBlock}
      ${actions}
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     API PUBLIQUE
  ══════════════════════════════════════════════════════════════════════════ */
  window.NcParent = {
    open(parentId) {
      if (!Auth.isAllowed()) {
        // Chef produit / lecteur : ouvrir la fiche NC standard en lecture
        if (parentId && typeof window.openModal === 'function') window.openModal(parentId);
        return;
      }
      openModal(parentId ? 'gerer' : 'creer', parentId);
    },
    creerGroupe      : o => Business.creerGroupe({ ...o, admin_email: o.admin_email || Auth.email() }),
    ajouterSatellites: o => Business.ajouterSatellites({ ...o, admin_email: o.admin_email || Auth.email() }),
    detacherSatellite: o => Business.detacherSatellite({ ...o, admin_email: o.admin_email || Auth.email() }),
    cloturerGroupe   : o => Business.cloturerGroupe({ ...o, admin_email: o.admin_email || Auth.email() }),
    getGroupes()     { return Store.getGroups(); },
    getSatellites(pid) { return Store.getSatellites(pid); },
    getJournal()     { return Store.getJournal(); },
    currentUser()    { return Auth.email(); },
    renderTab, openFiche,
    _onTabChange,
    Store, Business, Notif,
    _badgeHtml, _tab, _toggle, _filter, _close: _closeModal,
    _doCreer, _doAjouter, _doDetacher, _doCloture,
    _vAjouter, _vDetacher, _vCloture,
    _openForAction,
    _openModal() { _mount(); },
    _closeFiche,
    _ficheTab, _saveAnalyse, _saveAndGoTo,
    _ficheAddAction, _ficheActStat, _ficheActDel,
    _ficheDoCloture, _editPilote, _selectPilote, _savePilote,
    _toggleCompose, _sendMessage, _sendRelance, _sendReply,
    _renderFiche,
    _showUnread() {
      const unread = Store.getUnread();
      if (!unread.length) return;
      const first = unread[0];
      openFiche(first.groupe_id);
      setTimeout(() => _ficheTab('messages'), 100);
    },
    _openSat(id) {
      // Bascule vers l'onglet Liste et met en évidence la NC
      const btn = document.querySelector('.nav-tab[onclick*="liste"]');
      if (btn) { showTab('liste', btn); }
      setTimeout(() => {
        const row = document.querySelector(`#nc-tbody tr.row-link`);
        if (!row) return;
        document.querySelectorAll('#nc-tbody tr.row-link').forEach(r => {
          const numEl = r.querySelector('.nc-num');
          if (numEl && numEl.textContent.trim() === id) {
            r.scrollIntoView({ behavior: 'smooth', block: 'center' });
            r.style.outline = '2px solid #0c447c';
            setTimeout(() => r.style.outline = '', 2500);
          }
        });
      }, 200);
    }
  };

})();
