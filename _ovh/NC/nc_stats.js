// ============================================================
// MODULE NC STATS — COMPTAGE CORRECT PARENT / SATELLITES
// Élimine le double comptage tout en restant conforme ISO §9.1
// Muller Automotive — Mathieu Avet
// ============================================================
// PRINCIPE FONDAMENTAL :
//   NC réelles = NC standards + NC parents (satellites EXCLUS)
//   Coût NQ    = TOUS les enregistrements (vrai coût économique)
//   Efficacité = calculée sur les parents + standards (pas ×N)
//   Nouveaux KPI §10.3 : nb_systemiques, taux_groupement, satellites_moyen
// ============================================================

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // 1. FONCTIONS DE BASE
  // ─────────────────────────────────────────────────────────────

  const NcStats = {

    // ── Filtres fondamentaux ─────────────────────────────────

    // NC "réelles" pour les KPI = standards + parents, JAMAIS les satellites
    // ISO §9.1 : mesurer la performance sur les problèmes distincts
    nc_reelles(toutes) {
      return toutes.filter(n => !n.is_satellite);
    },

    // Satellites uniquement (pour calcul coût et volume rattaché)
    nc_satellites(toutes) {
      return toutes.filter(n => n.is_satellite === true);
    },

    // NC parents uniquement (NC systémiques)
    nc_parents(toutes) {
      return toutes.filter(n => n.is_parent === true);
    },

    // NC standards (ni parent, ni satellite)
    nc_standards(toutes) {
      return toutes.filter(n => !n.is_parent && !n.is_satellite);
    },

    // ── KPI PRINCIPAUX (exclus satellites) ──────────────────

    // Nombre de NC ouvertes — ISO §9.1
    nb_ouvertes(toutes) {
      return toutes.filter(n =>
        !n.is_satellite && n.statut !== 'close'
      ).length;
    },

    // Nombre de NC clôturées — ISO §9.1
    nb_closes(toutes) {
      return toutes.filter(n =>
        !n.is_satellite && n.statut === 'close'
      ).length;
    },

    // Nombre de NC en retard — ISO §10.2
    nb_en_retard(toutes) {
      const now = new Date();
      return toutes.filter(n =>
        !n.is_satellite &&
        n.statut !== 'close' &&
        n.echeance &&
        new Date(n.echeance) < now
      ).length;
    },

    // Délai moyen de clôture en jours — ISO §9.1
    // Les satellites n'ont pas de délai propre (délai = parent)
    delai_moyen(toutes) {
      const closes = toutes.filter(n =>
        !n.is_satellite &&
        n.statut === 'close' &&
        n.cloture_date && n.date
      );
      if (!closes.length) return 0;
      const total = closes.reduce((s, n) => {
        const j = (new Date(n.cloture_date) - new Date(n.date)) / 86400000;
        return s + Math.max(0, j);
      }, 0);
      return Math.round(total / closes.length);
    },

    // ── COÛT NON-QUALITÉ ─────────────────────────────────────
    // EXCEPTION : le coût inclut TOUS les enregistrements
    // Chaque satellite a son propre coût direct (rebut, retouche, SAV)
    // ISO §9.1 — mesure de la performance économique réelle

    cout_total(toutes) {
      return Math.round(
        toutes.reduce((s, n) => s + (parseFloat(n.cout_nq) || 0), 0)
      );
    },

    cout_par_perimetre(toutes) {
      return toutes.reduce((acc, n) => {
        const p = n.perimetre || 'Non renseigné';
        acc[p] = (acc[p] || 0) + (parseFloat(n.cout_nq) || 0);
        return acc;
      }, {});
    },

    // ── TAUX D'EFFICACITÉ CAPA ───────────────────────────────
    // Numérateur   : parents + standards clôturés sans réouverture
    // Dénominateur : parents + standards clôturés (total)
    // Les satellites ne contribuent ni au numérateur ni au dénominateur
    // ISO §10.2.1d / LNE-2

    taux_efficacite(toutes) {
      // Dénominateur : NC réelles clôturées
      const closes_reelles = toutes.filter(n =>
        !n.is_satellite && n.statut === 'close'
      );
      if (!closes_reelles.length) return 100;

      // Numérateur : clôturées sans réouverture
      const efficaces = closes_reelles.filter(n =>
        !n.reouverture_date
      ).length;

      return Math.round(efficaces / closes_reelles.length * 100);
    },

    // ── TAUX DE RÉCURRENCE ───────────────────────────────────
    // Une NC parent multi-périmètre = 1 occurrence systémique
    // NE PAS compter ses satellites comme autant de récidives
    // ISO §10.3

    taux_recurrence(toutes, mois = 6) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - mois);

      const recentes = this.nc_reelles(toutes).filter(n =>
        n.date && new Date(n.date) >= cutoff
      );

      // Grouper par famille (pour les NC réelles seulement)
      const parFamille = {};
      recentes.forEach(n => {
        const f = n.famille || n.type_cause || 'autre';
        parFamille[f] = (parFamille[f] || 0) + 1;
      });

      const recidivantes = Object.values(parFamille).filter(c => c >= 2).length;
      const total = Object.keys(parFamille).length;
      return total ? Math.round(recidivantes / total * 100) : 0;
    },

    // ── NOUVEAUX KPI §10.3 — NC SYSTÉMIQUES ─────────────────

    // Nombre de NC systémiques (groupes parents)
    nb_systemiques(toutes) {
      return this.nc_parents(toutes).length;
    },

    // Nombre moyen de satellites par groupe
    satellites_moyen(toutes) {
      const parents = this.nc_parents(toutes).filter(p =>
        p.satellites && p.satellites.length
      );
      if (!parents.length) return 0;
      return Math.round(
        parents.reduce((s, p) => s + p.satellites.length, 0) / parents.length
      );
    },

    // Taux de groupement = % de NC réelles qui sont des NC systémiques
    // Indicateur de maturité du SMQ — plus il est élevé, mieux le système
    // "voit" les problèmes systémiques plutôt que de les traiter isolément
    taux_groupement(toutes) {
      const reelles = this.nc_reelles(toutes).length;
      if (!reelles) return 0;
      return Math.round(this.nb_systemiques(toutes) / reelles * 100);
    },

    // Volume total de signalements rattachés
    volume_rattache(toutes) {
      return this.nc_satellites(toutes).length;
    },

    // ── KPI PAR PÉRIMÈTRE ────────────────────────────────────
    // Pour les NC parents : compter 1 fois avec périmètre = union satellites
    // ISO §9.1

    nb_par_perimetre(toutes) {
      const acc = {};
      this.nc_reelles(toutes).forEach(n => {
        // NC parent : peut couvrir plusieurs périmètres
        if (n.is_parent && Array.isArray(n.groupe_perimetre)) {
          // Compter 1 fois la NC parent mais l'attribuer à chaque périmètre
          // Pour les stats : incrémenter chaque périmètre de 1/N
          const share = 1 / n.groupe_perimetre.length;
          n.groupe_perimetre.forEach(p => {
            acc[p] = (acc[p] || 0) + share;
          });
        } else {
          const p = n.perimetre || 'Non renseigné';
          acc[p] = (acc[p] || 0) + 1;
        }
      });
      // Arrondir les fractions
      Object.keys(acc).forEach(k => { acc[k] = Math.round(acc[k] * 10) / 10; });
      return acc;
    },

    // ── KPI FOURNISSEUR ──────────────────────────────────────
    // 1 groupe NC fournisseur = 1 NC (même lot, même fournisseur)
    // ISO §8.4 — PPM fournisseur

    ppm_fournisseur(toutes, nb_pieces_livrees) {
      // Compter uniquement les NC réelles (pas satellites)
      const nc_fournisseur = this.nc_reelles(toutes).filter(n =>
        n.perimetre === 'Approvisionnement' ||
        n.perimetre === 'Fournisseur'
      ).length;
      if (!nb_pieces_livrees) return 0;
      return Math.round((nc_fournisseur / nb_pieces_livrees) * 1e6);
    },

    // ── RAPPORT COMPLET REVUE DE DIRECTION §9.3 ─────────────

    rapport_revue(toutes, periode_label) {
      const reelles = this.nc_reelles(toutes);
      return {
        // Méta
        periode: periode_label || 'Période en cours',
        total_enregistrements: toutes.length,
        dont_standards: this.nc_standards(toutes).length,
        dont_parents: this.nb_systemiques(toutes),
        dont_satellites: this.volume_rattache(toutes),

        // KPI principaux (sur NC réelles uniquement)
        nb_nc_reelles: reelles.length,
        nb_ouvertes: this.nb_ouvertes(toutes),
        nb_closes: this.nb_closes(toutes),
        nb_en_retard: this.nb_en_retard(toutes),
        delai_moyen_j: this.delai_moyen(toutes),

        // Coût (sur TOUS les enregistrements — coût économique réel)
        cout_total_eur: this.cout_total(toutes),
        cout_par_perimetre: this.cout_par_perimetre(toutes),

        // Qualité du traitement
        taux_efficacite_pct: this.taux_efficacite(toutes),
        taux_recurrence_pct: this.taux_recurrence(toutes),

        // NC systémiques — indicateurs §10.3
        nb_nc_systemiques: this.nb_systemiques(toutes),
        satellites_moyen: this.satellites_moyen(toutes),
        taux_groupement_pct: this.taux_groupement(toutes),
        volume_signalements_rattaches: this.volume_rattache(toutes),

        // Répartition (sur NC réelles)
        nb_par_perimetre: this.nb_par_perimetre(toutes),
      };
    },

    // ── AFFICHAGE DASHBOARD ──────────────────────────────────

    // Injecte les valeurs dans le tableau de bord existant
    // en cherchant les éléments par data-stat="..."
    injecterDashboard(toutes) {
      const r = this.rapport_revue(toutes);
      const map = {
        'nb-nc-reelles'      : r.nb_nc_reelles,
        'nb-ouvertes'        : r.nb_ouvertes,
        'nb-closes'          : r.nb_closes,
        'nb-en-retard'       : r.nb_en_retard,
        'delai-moyen'        : r.delai_moyen_j + 'j',
        'cout-total'         : r.cout_total_eur.toLocaleString('fr-FR') + ' €',
        'taux-efficacite'    : r.taux_efficacite_pct + '%',
        'taux-recurrence'    : r.taux_recurrence_pct + '%',
        'nb-systemiques'     : r.nb_nc_systemiques,
        'satellites-moyen'   : r.satellites_moyen,
        'taux-groupement'    : r.taux_groupement_pct + '%',
        'volume-rattache'    : r.volume_signalements_rattaches,
      };

      Object.entries(map).forEach(([key, val]) => {
        document.querySelectorAll(`[data-stat="${key}"]`).forEach(el => {
          el.textContent = val;
        });
      });

      // Alerte si nb_en_retard > 0
      const retardEl = document.querySelector('[data-stat="nb-en-retard"]');
      if (retardEl) {
        retardEl.style.color = r.nb_en_retard > 0 ? '#791F1F' : '#27500A';
      }

      // Alerte si taux_efficacite < 70
      const efEl = document.querySelector('[data-stat="taux-efficacite"]');
      if (efEl) {
        efEl.style.color = r.taux_efficacite_pct < 70 ? '#791F1F'
          : r.taux_efficacite_pct < 85 ? '#633806' : '#27500A';
      }

      console.log('[NC STATS] Dashboard injecté — rapport revue :', r);
      return r;
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 2. EXTENSION DU RAPPORT REVUE DE DIRECTION EXISTANT
  // ─────────────────────────────────────────────────────────────
  // Si window.NcParent existe, enrichir le rapport PDF (script 10)
  // avec les nouveaux KPI systémiques

  function enrichirRapportRevue() {
    if (!window.NcParent?.Store) return;

    const toutes = window.NcParent.Store.nc_get_all();
    const rapport = NcStats.rapport_revue(toutes);

    // Exposer pour que le script de génération PDF puisse les utiliser
    window._nc_rapport_revue = rapport;

    console.log('[NC STATS] Rapport revue enrichi :', rapport);
    return rapport;
  }

  // ─────────────────────────────────────────────────────────────
  // 3. MIGRATION DES STATS EXISTANTES
  // ─────────────────────────────────────────────────────────────
  // Si le tableau de bord existant utilise un COUNT(*) naïf,
  // cette fonction retourne un objet de correction à appliquer

  function diagnosticDoublons(toutes) {
    const ncReelles = NcStats.nc_reelles(toutes).length;
    const totalBrut = toutes.length;
    const satellites = NcStats.nc_satellites(toutes).length;
    const parents = NcStats.nb_systemiques(toutes);

    const gonflement = totalBrut - ncReelles;
    const pct = totalBrut ? Math.round(gonflement / totalBrut * 100) : 0;

    return {
      total_brut: totalBrut,
      nc_reelles: ncReelles,
      satellites_exclus: satellites,
      parents: parents,
      nc_standards: NcStats.nc_standards(toutes).length,
      gonflement_absolu: gonflement,
      gonflement_pct: pct,
      message: gonflement > 0
        ? `${gonflement} enregistrement(s) satellite(s) exclus du comptage principal (+${pct}% éliminé)`
        : 'Aucun doublon détecté — pas de NC parent dans le système',
      conforme_iso: true
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 4. API PUBLIQUE
  // ─────────────────────────────────────────────────────────────

  window.NcStats = {
    ...NcStats,
    enrichirRapportRevue,
    diagnosticDoublons,

    // Raccourci : recalcul complet depuis le Store
    recalculer() {
      if (!window.NcParent?.Store) {
        console.warn('[NC STATS] NcParent.Store non disponible');
        return null;
      }
      const toutes = window.NcParent.Store.nc_get_all();
      return this.injecterDashboard(toutes);
    },

    // Diagnostic rapide pour la console
    diagnostic() {
      if (!window.NcParent?.Store) return;
      const toutes = window.NcParent.Store.nc_get_all();
      const d = diagnosticDoublons(toutes);
      console.table(d);
      return d;
    }
  };

  // Auto-init si NcParent est déjà chargé
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(enrichirRapportRevue, 100);
    });
  } else {
    setTimeout(enrichirRapportRevue, 100);
  }

  console.log('[NC STATS] Module chargé ✓ — window.NcStats disponible');
  console.log('[NC STATS] Principe : NC réelles = standards + parents (satellites exclus du comptage)');

})();
