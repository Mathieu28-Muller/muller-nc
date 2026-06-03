'use strict';
const XlsxPopulate = require('./node_modules/xlsx-populate');
const path = require('path');

// ─── Données des 75 feuilles ───────────────────────────────────────────────

const feuilles = [
  // ── VL ACTIVES (12) ──────────────────────────────────────────────────────
  {
    cat: 'VL', ssCat: 'Standard', nom: 'XG 2', statut: 'Active',
    equipement: 'Freinomètre VL standard 43300',
    condition: 'Frein 43300 + version ≤ 1.1.2.3 (ou version inconnue)',
    modeleFrein: '43300', modelePoste: 'Standard', versionLog: '≤ 1.1.2.3',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'F21=SN pupitre, G23=SN frein, G24=SN susp, G25=SN ripage',
    notes: 'Feuille de base VL, version logicielle la plus ancienne'
  },
  {
    cat: 'VL', ssCat: 'Standard', nom: 'XG 2-4', statut: 'Active',
    equipement: 'Freinomètre VL standard 43300',
    condition: 'Frein 43300 + version = 1.1.2.4',
    modeleFrein: '43300', modelePoste: 'Standard', versionLog: '1.1.2.4',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'F21=SN pupitre, G23=SN frein, G24=SN susp, G25=SN ripage',
    notes: ''
  },
  {
    cat: 'VL', ssCat: 'Standard', nom: 'XG 2-5', statut: 'Active',
    equipement: 'Freinomètre VL standard 43300',
    condition: 'Frein 43300 + version ≥ 1.1.2.5 (version actuelle standard)',
    modeleFrein: '43300', modelePoste: 'Standard', versionLog: '≥ 1.1.2.5',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'F21=SN pupitre, G23=SN frein, G24=SN susp, G25=SN ripage',
    notes: 'Feuille la plus courante pour les VL standard actuels'
  },
  {
    cat: 'VL', ssCat: 'Standard', nom: 'XG 2-6', statut: 'Active',
    equipement: 'Freinomètre VL 43800',
    condition: 'Frein 43800 (quel que soit la version)',
    modeleFrein: '43800', modelePoste: 'Standard', versionLog: 'Toutes',
    cellNum: 'F16', cellCPVille: 'J20/J21',
    cellules: 'F21=SN pupitre, G23=SN frein, G24=SN susp, G25=SN ripage',
    notes: 'Layout CP/Ville NON standard : J20=CP, J21=Ville'
  },
  {
    cat: 'VL', ssCat: 'Standard', nom: 'XG 2-7', statut: 'Active',
    equipement: 'Freinomètre VL 43850',
    condition: 'Frein 43850 (quel que soit la version)',
    modeleFrein: '43850', modelePoste: 'Standard', versionLog: 'Toutes',
    cellNum: 'F16', cellCPVille: 'J20/J21',
    cellules: 'F21=SN pupitre, G23=SN frein, G24=SN susp, G25=SN ripage',
    notes: 'Layout CP/Ville NON standard : J20=CP, J21=Ville'
  },
  {
    cat: 'VL', ssCat: 'VL+', nom: 'XG VL+ 2-2', statut: 'Active',
    equipement: 'Freinomètre VL+ 43350',
    condition: 'Frein 43350 (VL+) + version ≤ 1.1.2.3',
    modeleFrein: '43350', modelePoste: 'Standard', versionLog: '≤ 1.1.2.3',
    cellNum: 'F16', cellCPVille: 'J20/J21',
    cellules: 'F21=SN pupitre, G23=SN frein, G24=SN susp, G25=SN ripage',
    notes: 'VL+ = chaîne spéciale ; layout CP/Ville NON standard : J20=CP, J21=Ville'
  },
  {
    cat: 'VL', ssCat: 'VL+', nom: 'XG VL+ 2-4', statut: 'Active',
    equipement: 'Freinomètre VL+ 43350',
    condition: 'Frein 43350 (VL+) + version = 1.1.2.4',
    modeleFrein: '43350', modelePoste: 'Standard', versionLog: '1.1.2.4',
    cellNum: 'F16', cellCPVille: 'J20/J21',
    cellules: 'F21=SN pupitre, G23=SN frein, G24=SN susp, G25=SN ripage',
    notes: 'Layout CP/Ville NON standard : J20=CP, J21=Ville'
  },
  {
    cat: 'VL', ssCat: 'VL+', nom: 'XG VL+ 2-5', statut: 'Active',
    equipement: 'Freinomètre VL+ 43350',
    condition: 'Frein 43350 (VL+) + version ≥ 1.1.2.5',
    modeleFrein: '43350', modelePoste: 'Standard', versionLog: '≥ 1.1.2.5',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'F21=SN pupitre, G23=SN frein, G24=SN susp, G25=SN ripage',
    notes: ''
  },
  {
    cat: 'VL', ssCat: 'UPG', nom: 'XG UPG 2-4', statut: 'Active',
    equipement: 'Pupitre UPG 49620',
    condition: 'Pupitre 49620 (UPG) + version = 1.1.2.4',
    modeleFrein: 'Standard', modelePoste: '49620 UPG', versionLog: '1.1.2.4',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'F21=SN pupitre, G23=SN frein, G24=SN susp, G25=SN ripage',
    notes: 'UPG = poste de pilotage déporté'
  },
  {
    cat: 'VL', ssCat: 'UPG', nom: 'XG UPG 2-5', statut: 'Active',
    equipement: 'Pupitre UPG 49620',
    condition: 'Pupitre 49620 (UPG) + version ≥ 1.1.2.5',
    modeleFrein: 'Standard', modelePoste: '49620 UPG', versionLog: '≥ 1.1.2.5',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'F21=SN pupitre, G23=SN frein, G24=SN susp, G25=SN ripage',
    notes: 'UPG = poste de pilotage déporté'
  },
  {
    cat: 'VL', ssCat: 'FOG', nom: 'FOG VL', statut: 'Active',
    equipement: 'Chaîne FOG VL (CLS.750CT-VL / CLS.750FR-ENS1)',
    condition: 'Radio "Type chaîne" sélectionné sur FOG VL dans le formulaire',
    modeleFrein: 'CLS.750FR-ENS1', modelePoste: 'CLS.750CT-VL', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'F21=SN pupitre, G23=SN frein, G24=SN susp',
    notes: 'Matériel non dans OTCLAN Muller — saisie manuelle obligatoire'
  },
  {
    cat: 'VL', ssCat: 'FOG', nom: 'FOG VL+', statut: 'Active',
    equipement: 'Chaîne FOG VL+ (CLS.750CT-VL+ / CLS.750FR-ENS2)',
    condition: 'Radio "Type chaîne" sélectionné sur FOG VL+ dans le formulaire',
    modeleFrein: 'CLS.750FR-ENS2', modelePoste: 'CLS.750CT-VL+', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'F21=SN pupitre, G23=SN frein, G24=SN susp',
    notes: 'Matériel non dans OTCLAN Muller — saisie manuelle obligatoire'
  },

  // ── PL ACTIVES (10) ──────────────────────────────────────────────────────
  {
    cat: 'PL', ssCat: 'Control Room', nom: 'XG PL 1-4', statut: 'Active',
    equipement: 'Chaîne PL Control Room + frein 44700',
    condition: 'Poste 52700CR (ou +TS) + freinomètre 44700',
    modeleFrein: '44700', modelePoste: '52700CR / 52700CR+TS', versionLog: 'Toutes',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'G21=SN pupitre, H21=version numérique, F23=SN frein',
    notes: 'Control room = salle de contrôle séparée'
  },
  {
    cat: 'PL', ssCat: 'Control Room', nom: 'XG PL 1-5', statut: 'Active',
    equipement: 'Chaîne PL Control Room + frein 50500 ou 55310',
    condition: 'Poste 52700CR (ou +TS) + freinomètre 50500 ou 55310',
    modeleFrein: '50500 / 55310', modelePoste: '52700CR / 52700CR+TS', versionLog: 'Toutes',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'G21=SN pupitre, H21=version numérique, F23=SN frein',
    notes: ''
  },
  {
    cat: 'PL', ssCat: 'Standard', nom: 'XG PL 4-1', statut: 'Active',
    equipement: 'Freinomètre PL 53500',
    condition: 'Frein 53500 + version = 1.1.0.5',
    modeleFrein: '53500', modelePoste: 'Standard', versionLog: '1.1.0.5',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'F21=SN pupitre, G21=texte version, F23=SN frein',
    notes: ''
  },
  {
    cat: 'PL', ssCat: 'Standard', nom: 'XG PL 4-1-1', statut: 'Active',
    equipement: 'Freinomètre PL 53500',
    condition: 'Frein 53500 + version ≥ 1.1.0.6',
    modeleFrein: '53500', modelePoste: 'Standard', versionLog: '≥ 1.1.0.6',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'F21=SN pupitre, G21=texte version, F23=SN frein',
    notes: ''
  },
  {
    cat: 'PL', ssCat: 'Standard', nom: 'XG PL 4-2-2', statut: 'Active',
    equipement: 'Freinomètre PL 44700',
    condition: 'Frein 44700 + version = 1.1.0.5 (sans control room)',
    modeleFrein: '44700', modelePoste: 'Standard', versionLog: '1.1.0.5',
    cellNum: 'F16', cellCPVille: 'J20/J21',
    cellules: 'F21=SN pupitre, G21=texte version, F23=SN frein',
    notes: 'Layout CP/Ville NON standard : J20=CP, J21=Ville'
  },
  {
    cat: 'PL', ssCat: 'Standard', nom: 'XG PL 4-2-3', statut: 'Active',
    equipement: 'Freinomètre PL 44700',
    condition: 'Frein 44700 + version ≥ 1.1.0.6 (sans control room)',
    modeleFrein: '44700', modelePoste: 'Standard', versionLog: '≥ 1.1.0.6',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'F21=SN pupitre, G21=texte version, F23=SN frein',
    notes: ''
  },
  {
    cat: 'PL', ssCat: 'Standard', nom: 'XG PL 4-3-2', statut: 'Active',
    equipement: 'Freinomètre PL 50500 ou 55310',
    condition: 'Frein 50500 ou 55310 + version = 1.1.0.5 (sans control room)',
    modeleFrein: '50500 / 55310', modelePoste: 'Standard', versionLog: '1.1.0.5',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'F21=SN pupitre, G21=texte version, F23=SN frein',
    notes: ''
  },
  {
    cat: 'PL', ssCat: 'Standard', nom: 'XG PL 4-3-3', statut: 'Active',
    equipement: 'Freinomètre PL 50500 ou 55310',
    condition: 'Frein 50500 ou 55310 + version ≥ 1.1.0.6 (sans control room)',
    modeleFrein: '50500 / 55310', modelePoste: 'Standard', versionLog: '≥ 1.1.0.6',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'F21=SN pupitre, G21=texte version, F23=SN frein',
    notes: ''
  },
  {
    cat: 'PL', ssCat: 'Standard', nom: 'XG PL 5-1', statut: 'Active',
    equipement: 'Freinomètre PL 44750',
    condition: 'Frein 44750 (quel que soit la version)',
    modeleFrein: '44750', modelePoste: 'Standard', versionLog: 'Toutes',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'F21=SN pupitre, G21=texte version, F23=SN frein',
    notes: ''
  },
  {
    cat: 'PL', ssCat: 'BM 10000', nom: '10000MX PL 1-2', statut: 'Active',
    equipement: 'Chaîne BM 10000 / 10000MX',
    condition: 'Version logicielle ≥ 2.x.x.x OU modèle contient "50620" / "10000" / "bm"',
    modeleFrein: '50620 / BM', modelePoste: 'BM 10000MX', versionLog: '≥ 2.x.x.x',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'H21=SN pupitre, I21=texte fixe version (ne pas écraser), F23=SN frein',
    notes: 'ATTENTION : cellule H21 pour SN (pas F21), et I21 ne doit pas être écrasée'
  },

  // ── POLLUTION ACTIVES (6) ─────────────────────────────────────────────────
  {
    cat: 'Pollution', ssCat: 'ECOSHIELD', nom: 'ECOOPAOBD', statut: 'Active',
    equipement: 'Système ECOSHIELD (OPA + OBD intégrés)',
    condition: 'sousType = ECOSHIELD',
    modeleFrein: 'N/A', modelePoste: 'N/A', versionLog: 'N/A',
    cellNum: 'G16', cellCPVille: 'J21/J22',
    cellules: 'I20=SN AG, H21=SN OPA, F22=SN OBD',
    notes: ''
  },
  {
    cat: 'Pollution', ssCat: 'ECOPOL', nom: 'ECOPOL', statut: 'Active',
    equipement: 'Système ECOPOL',
    condition: 'sousType = ECOPOL',
    modeleFrein: 'N/A', modelePoste: 'N/A', versionLog: 'N/A',
    cellNum: 'G16', cellCPVille: 'J21/J22',
    cellules: 'I20=SN AG, H21=SN OPA, F22=SN OBD',
    notes: ''
  },
  {
    cat: 'Pollution', ssCat: 'ACTIGAS_OPA', nom: 'OPA OBD C6 SK08', statut: 'Active',
    equipement: 'Opacimètre seul ACTIGAS (AT605) sans analyseur de gaz',
    condition: 'sousType = ACTIGAS_OPA + version OPA commence par LAN2.xx',
    modeleFrein: 'N/A', modelePoste: 'AT605 (opacimètre)', versionLog: 'LAN2.xx',
    cellNum: 'G16', cellCPVille: 'J21/J22',
    cellules: 'H20=SN OPA, F21=SN OBD',
    notes: 'SK08 = version ancienne. AT605 = opacimètre. AT505 = analyseur de gaz'
  },
  {
    cat: 'Pollution', ssCat: 'ACTIGAS_OPA', nom: 'OPA OBD 6C SK18', statut: 'Active',
    equipement: 'Opacimètre seul ACTIGAS (AT605) sans analyseur de gaz',
    condition: 'sousType = ACTIGAS_OPA + version OPA commence par LAN3.xx',
    modeleFrein: 'N/A', modelePoste: 'AT605 (opacimètre)', versionLog: 'LAN3.xx',
    cellNum: 'G16', cellCPVille: 'J20/J21',
    cellules: 'H20=SN OPA, F21=SN OBD',
    notes: 'SK18 = version récente. Layout CP/Ville NON standard : J20=CP, J21=Ville'
  },
  {
    cat: 'Pollution', ssCat: 'ACTIGAS', nom: 'AG OPA OBD C6 SK08', statut: 'Active',
    equipement: 'ACTIGAS complet : analyseur de gaz (AT505) + opacimètre (AT605) + OBD',
    condition: 'sousType = ACTIGAS + N° série AG format NNN/AA avec AA < 18, ou AA=18 et NNN ≤ 100',
    modeleFrein: 'N/A', modelePoste: 'AT505 + AT605 + OBD', versionLog: 'N/A',
    cellNum: 'G16', cellCPVille: 'J21/J22',
    cellules: 'I20=SN AG, H21=SN OPA, F22=SN OBD',
    notes: 'SK08 : année < 18, ou année=18 et numéro ≤ 100 (ex: 100/18 → SK08, 101/18 → SK18)'
  },
  {
    cat: 'Pollution', ssCat: 'ACTIGAS', nom: 'AG OPA OBD 6C SK18', statut: 'Active',
    equipement: 'ACTIGAS complet : analyseur de gaz (AT505) + opacimètre (AT605) + OBD',
    condition: 'sousType = ACTIGAS + N° série AG format NNN/AA avec AA > 18, ou AA=18 et NNN ≥ 101',
    modeleFrein: 'N/A', modelePoste: 'AT505 + AT605 + OBD', versionLog: 'N/A',
    cellNum: 'G16', cellCPVille: 'J21/J22',
    cellules: 'I20=SN AG, H21=SN OPA, F22=SN OBD',
    notes: 'SK18 : année > 18, ou année=18 et numéro ≥ 101'
  },

  // ── CLASSE L ACTIVES (12) ─────────────────────────────────────────────────
  {
    cat: 'Classe L', ssCat: 'Céléromètre', nom: '0231SEUL', statut: 'Active',
    equipement: 'Céléromètre seul',
    condition: 'Célero seul (sans sono) + certOtclan = 0225 ou inconnu',
    modeleFrein: 'N/A', modelePoste: 'Céléromètre', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J20/J21',
    cellules: 'Spécifique Classe L',
    notes: 'Layout CP/Ville NON standard : J20=CP, J21=Ville'
  },
  {
    cat: 'Classe L', ssCat: 'Céléromètre', nom: 'CELERODISTANCE', statut: 'Active',
    equipement: 'Céléromètre à distance',
    condition: 'Célero à distance + certOtclan = 0225 ou inconnu',
    modeleFrein: 'N/A', modelePoste: 'Céléromètre déporté', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J20/J21',
    cellules: 'Spécifique Classe L',
    notes: 'Layout CP/Ville NON standard : J20=CP, J21=Ville'
  },
  {
    cat: 'Classe L', ssCat: 'Sonomètre cert 0225', nom: '0225SONO', statut: 'Active',
    equipement: 'Sonomètre seul (version LAN4)',
    condition: 'Sono seul + certOtclan = 0225 ou inconnu + version LAN4',
    modeleFrein: 'N/A', modelePoste: 'Sonomètre', versionLog: 'LAN4',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'G20=SN sono, G21=SN calibreur',
    notes: ''
  },
  {
    cat: 'Classe L', ssCat: 'Sonomètre cert 0225', nom: '0225LAN5', statut: 'Active',
    equipement: 'Sonomètre seul (version LAN5)',
    condition: 'Sono seul + certOtclan = 0225 ou inconnu + version LAN5',
    modeleFrein: 'N/A', modelePoste: 'Sonomètre', versionLog: 'LAN5',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'G20=SN sono, G21=SN calibreur',
    notes: ''
  },
  {
    cat: 'Classe L', ssCat: 'Sonomètre cert 0225', nom: '0225SONOCELERO', statut: 'Active',
    equipement: 'Sonomètre + Céléromètre combinés',
    condition: 'Sono ET célero cochés ensemble + certOtclan = 0225 ou inconnu',
    modeleFrein: 'N/A', modelePoste: 'Sono + Célero', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J20/J21',
    cellules: 'G20=SN sono, G21=SN calibreur, G22=SN célero',
    notes: 'RÈGLE CRITIQUE : sono+célero = 1 seul PDF combiné, jamais 2 sections séparées. Layout CP/Ville NON standard : J20=CP, J21=Ville'
  },
  {
    cat: 'Classe L', ssCat: 'Sonomètre cert 0223', nom: '0223LAN5', statut: 'Active',
    equipement: 'Sonomètre seul (cert 0223, LAN4 ou LAN5)',
    condition: 'Sono seul + certOtclan = 0223 (LAN4 ou LAN5)',
    modeleFrein: 'N/A', modelePoste: 'Sonomètre', versionLog: 'LAN4 ou LAN5',
    cellNum: 'F16', cellCPVille: 'J20/J21',
    cellules: 'G20=SN sono, G21=SN calibreur',
    notes: 'Layout CP/Ville NON standard : J20=CP, J21=Ville'
  },
  {
    cat: 'Classe L', ssCat: 'Sonomètre cert 0223', nom: '0223SEUL', statut: 'Active',
    equipement: 'Sonomètre seul cert 0223 (variante)',
    condition: 'Sono seul + certOtclan = 0223 (cas particulier)',
    modeleFrein: 'N/A', modelePoste: 'Sonomètre', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J20/J21',
    cellules: 'G20=SN sono, G21=SN calibreur',
    notes: 'Layout CP/Ville NON standard : J20=CP, J21=Ville'
  },
  {
    cat: 'Classe L', ssCat: 'Sonomètre cert 0223', nom: '0223CELERO', statut: 'Active',
    equipement: 'Sonomètre + Céléromètre combinés (cert 0223)',
    condition: 'Sono ET célero + certOtclan = 0223',
    modeleFrein: 'N/A', modelePoste: 'Sono + Célero', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J20/J21',
    cellules: 'G20=SN sono, G21=SN calibreur, G22=SN célero',
    notes: 'Layout CP/Ville NON standard : J20=CP, J21=Ville'
  },
  {
    cat: 'Classe L', ssCat: 'Sonomètre cert 0226', nom: '0226LAN5', statut: 'Active',
    equipement: 'Sonomètre seul (cert 0226)',
    condition: 'Sono seul + certOtclan = 0226',
    modeleFrein: 'N/A', modelePoste: 'Sonomètre', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'G20=SN sono, G21=SN calibreur',
    notes: ''
  },
  {
    cat: 'Classe L', ssCat: 'Sonomètre cert 0226', nom: '0226CELERO', statut: 'Active',
    equipement: 'Sonomètre + Céléromètre combinés (cert 0226)',
    condition: 'Sono ET célero + certOtclan = 0226',
    modeleFrein: 'N/A', modelePoste: 'Sono + Célero', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'G20=SN sono, G21=SN calibreur, G22=SN célero',
    notes: ''
  },
  {
    cat: 'Classe L', ssCat: 'Sonomètre cert 0227', nom: '0227LAN5', statut: 'Active',
    equipement: 'Sonomètre seul (cert 0227)',
    condition: 'Sono seul + certOtclan = 0227',
    modeleFrein: 'N/A', modelePoste: 'Sonomètre', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'G20=SN sono, G21=SN calibreur',
    notes: ''
  },
  {
    cat: 'Classe L', ssCat: 'Sonomètre cert 0227', nom: '0227CELERO', statut: 'Active',
    equipement: 'Sonomètre + Céléromètre combinés (cert 0227)',
    condition: 'Sono ET célero + certOtclan = 0227',
    modeleFrein: 'N/A', modelePoste: 'Sono + Célero', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'G20=SN sono, G21=SN calibreur, G22=SN célero',
    notes: ''
  },

  // ── AUTRES ACTIVES (6) ──────────────────────────────────────────────────
  {
    cat: 'Autres', ssCat: 'Réglophare', nom: 'RPH 4-1', statut: 'Active',
    equipement: 'Réglophare modèle 764-8 (N-REGLEPHARE CCD TOUCH)',
    condition: 'type = reglophare + modèle identifié comme 764-8 (N-REGLEPHARE CCD TOUCH)',
    modeleFrein: 'N/A', modelePoste: '764-8', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'Spécifique réglophare',
    notes: 'Reconnu via code "N-REGLEPHARE CCD TOUCH" dans OTCLAN'
  },
  {
    cat: 'Autres', ssCat: 'Réglophare', nom: 'RPH 5', statut: 'Active',
    equipement: 'Réglophare SMARTLYNX ($PRO HLT OPTICAL UNIT PTI L)',
    condition: 'type = reglophare + modèle identifié comme SMARTLYNX',
    modeleFrein: 'N/A', modelePoste: 'SMARTLYNX / HLT', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'Spécifique réglophare',
    notes: 'CRITIQUE : "$PRO HLT OPTICAL UNIT PTI L" = toujours réglophare, JAMAIS opacimètre'
  },
  {
    cat: 'Autres', ssCat: 'Réglophare', nom: 'RPH 6', statut: 'Active',
    equipement: 'Réglophare 3e génération',
    condition: 'type = reglophare + critères à préciser (UTAC N°17/ESV/07841-1 + 22/LAN/ECE/0188)',
    modeleFrein: 'N/A', modelePoste: 'RPH 6', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'Spécifique réglophare',
    notes: '⚠️ EN SUSPENS : conditions de sélection RPH 6 vs RPH 5 pas encore définies'
  },
  {
    cat: 'Autres', ssCat: 'Décéléromètre', nom: 'DECELERO MAXI', statut: 'Active',
    equipement: 'Décéléromètre Autostop Maxi',
    condition: 'type = decelero + sous-type = MAXI',
    modeleFrein: 'N/A', modelePoste: 'Autostop Maxi', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'Spécifique décéléromètre',
    notes: ''
  },
  {
    cat: 'Autres', ssCat: 'Décéléromètre', nom: 'DECELERO MINI+', statut: 'Active',
    equipement: 'Décéléromètre Autostop Mini+',
    condition: 'type = decelero + sous-type = MINI',
    modeleFrein: 'N/A', modelePoste: 'Autostop Mini+', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'Spécifique décéléromètre',
    notes: ''
  },
  {
    cat: 'Autres', ssCat: 'PAJ', nom: 'PAJ', statut: 'Active',
    equipement: 'Centrale hydraulique PAJ + châssis',
    condition: 'type = paj',
    modeleFrein: 'N/A', modelePoste: 'Centrale hydraulique', versionLog: 'N/A',
    cellNum: 'F16', cellCPVille: 'J21/J22',
    cellules: 'Spécifique PAJ',
    notes: ''
  },

  // ── FEUILLES LEGACY (29) ─────────────────────────────────────────────────
  {
    cat: 'Legacy', ssCat: 'FOG Pollution', nom: 'FOG AG OPA', statut: 'Legacy',
    equipement: 'Pollution sur chaîne FOG (AG + OPA)',
    condition: 'Non générée automatiquement — saisie manuelle admin uniquement',
    modeleFrein: 'N/A', modelePoste: 'FOG + AG + OPA', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A',
    notes: 'Équipements hors OTCLAN Muller'
  },
  {
    cat: 'Legacy', ssCat: 'FOG Pollution', nom: 'FOG OPA OBD', statut: 'Legacy',
    equipement: 'Pollution sur chaîne FOG (OPA + OBD)',
    condition: 'Non générée automatiquement — saisie manuelle admin uniquement',
    modeleFrein: 'N/A', modelePoste: 'FOG + OPA + OBD', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A',
    notes: 'Équipements hors OTCLAN Muller'
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Classe L', nom: '0212', statut: 'Legacy',
    equipement: 'Ancienne version Classe L cert 0212',
    condition: 'Non utilisée — remplacée par versions récentes',
    modeleFrein: 'N/A', modelePoste: 'Ancien sonomètre', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Classe L', nom: '0213FULL', statut: 'Legacy',
    equipement: 'Ancienne Classe L cert 0213 complète',
    condition: 'Non utilisée — remplacée',
    modeleFrein: 'N/A', modelePoste: 'Ancien sonomètre', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Classe L', nom: '0213POL+OBD', statut: 'Legacy',
    equipement: 'Ancienne Classe L cert 0213 + pollution + OBD',
    condition: 'Non utilisée — remplacée',
    modeleFrein: 'N/A', modelePoste: 'Ancien', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Classe L', nom: '0212POL+OBD', statut: 'Legacy',
    equipement: 'Ancienne Classe L cert 0212 + pollution + OBD',
    condition: 'Non utilisée — remplacée',
    modeleFrein: 'N/A', modelePoste: 'Ancien', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Classe L', nom: '0212GAZSONO', statut: 'Legacy',
    equipement: 'Ancienne Classe L cert 0212 + gaz + sono',
    condition: 'Non utilisée — remplacée',
    modeleFrein: 'N/A', modelePoste: 'Ancien', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Classe L', nom: '0212ASOBD', statut: 'Legacy',
    equipement: 'Ancienne Classe L cert 0212 + AS + OBD',
    condition: 'Non utilisée — remplacée',
    modeleFrein: 'N/A', modelePoste: 'Ancien', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Classe L', nom: '0213ASOBD', statut: 'Legacy',
    equipement: 'Ancienne Classe L cert 0213 + AS + OBD',
    condition: 'Non utilisée — remplacée',
    modeleFrein: 'N/A', modelePoste: 'Ancien', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Classe L', nom: 'OTC219', statut: 'Legacy',
    equipement: 'Ancienne version OTC 219',
    condition: 'Non utilisée — remplacée',
    modeleFrein: 'N/A', modelePoste: 'Ancien', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Classe L', nom: '0214SONO', statut: 'Legacy',
    equipement: 'Ancienne Classe L cert 0214 + sono',
    condition: 'Non utilisée — remplacée',
    modeleFrein: 'N/A', modelePoste: 'Ancien', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Classe L', nom: '0226', statut: 'Legacy',
    equipement: 'Ancienne version cert 0226 (avant séparation LAN5/CELERO)',
    condition: 'Non utilisée — remplacée par 0226LAN5 et 0226CELERO',
    modeleFrein: 'N/A', modelePoste: 'Ancien', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Classe L', nom: '0227', statut: 'Legacy',
    equipement: 'Ancienne version cert 0227 (avant séparation LAN5/CELERO)',
    condition: 'Non utilisée — remplacée par 0227LAN5 et 0227CELERO',
    modeleFrein: 'N/A', modelePoste: 'Ancien', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Classe L', nom: '223ECO', statut: 'Legacy',
    equipement: 'Ancienne Classe L cert 223 + ECO',
    condition: 'Non utilisée — remplacée',
    modeleFrein: 'N/A', modelePoste: 'Ancien', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Classe L', nom: '223ECOSONO', statut: 'Legacy',
    equipement: 'Ancienne Classe L cert 223 + ECO + sono',
    condition: 'Non utilisée — remplacée',
    modeleFrein: 'N/A', modelePoste: 'Ancien', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Classe L', nom: 'A02', statut: 'Legacy',
    equipement: 'Ancienne version générique A02',
    condition: 'Non utilisée — remplacée',
    modeleFrein: 'N/A', modelePoste: 'Ancien', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Pollution', nom: 'AG OPA 204', statut: 'Legacy',
    equipement: 'Ancienne pollution AG + OPA cert 204',
    condition: 'Non utilisée — remplacée par AG OPA OBD C6/6C',
    modeleFrein: 'N/A', modelePoste: 'Ancien AG+OPA', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Pollution', nom: 'AG OPA MOTO', statut: 'Legacy',
    equipement: 'Pollution AG + OPA pour motos',
    condition: 'Non utilisée — non applicable aux CT standards',
    modeleFrein: 'N/A', modelePoste: 'AG+OPA moto', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Pollution', nom: 'AG OBD 4-2', statut: 'Legacy',
    equipement: 'Ancienne pollution AG + OBD version 4-2',
    condition: 'Non utilisée — remplacée',
    modeleFrein: 'N/A', modelePoste: 'Ancien AG+OBD', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Pollution', nom: 'AG OBD 4-3', statut: 'Legacy',
    equipement: 'Ancienne pollution AG + OBD version 4-3',
    condition: 'Non utilisée — remplacée',
    modeleFrein: 'N/A', modelePoste: 'Ancien AG+OBD', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: '⚠️ Layout CP/Ville NON standard selon doc (J20/J21) — à vérifier si réactivée'
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Pollution', nom: 'OPA OBD 3-9', statut: 'Legacy',
    equipement: 'Ancienne pollution OPA + OBD version 3-9',
    condition: 'Non utilisée — remplacée par OPA OBD C6/6C',
    modeleFrein: 'N/A', modelePoste: 'Ancien OPA+OBD', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Pollution', nom: 'OPA OBD 4-3', statut: 'Legacy',
    equipement: 'Ancienne pollution OPA + OBD version 4-3',
    condition: 'Non utilisée — remplacée',
    modeleFrein: 'N/A', modelePoste: 'Ancien OPA+OBD', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Pollution', nom: 'AG OPA OBD 3-4', statut: 'Legacy',
    equipement: 'Ancienne pollution AG + OPA + OBD version 3-4',
    condition: 'Non utilisée — remplacée par AG OPA OBD C6/6C',
    modeleFrein: 'N/A', modelePoste: 'Ancien AG+OPA+OBD', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne Pollution', nom: 'AG OPA OBD 3-9', statut: 'Legacy',
    equipement: 'Ancienne pollution AG + OPA + OBD version 3-9',
    condition: 'Non utilisée — remplacée par AG OPA OBD C6/6C',
    modeleFrein: 'N/A', modelePoste: 'Ancien AG+OPA+OBD', versionLog: 'N/A',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: ''
  },
  {
    cat: 'Legacy', ssCat: 'Ancienne PL', nom: 'XG PL 4-3-1', statut: 'Legacy',
    equipement: 'Chaîne PL frein 50500/55310 (version intermédiaire)',
    condition: 'Non utilisée — remplacée par XG PL 4-3-2 (v1.1.0.5) et XG PL 4-3-3 (v≥1.1.0.6)',
    modeleFrein: '50500 / 55310', modelePoste: 'Standard', versionLog: 'Ancienne',
    cellNum: 'N/A', cellCPVille: 'N/A', cellules: 'N/A', notes: 'Scindée en 4-3-2 et 4-3-3 lors de la mise à jour firmware'
  },
];

// ─── Couleurs par catégorie ───────────────────────────────────────────────
const COLORS = {
  header:    'C00000', // rouge Muller
  VL:        'FFF2CC', // jaune clair
  PL:        'DDEBF7', // bleu clair
  Pollution: 'E2EFDA', // vert clair
  'Classe L':'FCE4D6', // orange clair
  Autres:    'EAD1DC', // rose clair
  Legacy:    'D9D9D9', // gris
};

const COLNAMES = [
  'N°', 'Nom feuille', 'Catégorie', 'Sous-catégorie', 'Statut',
  'Équipement concerné', 'Condition de sélection automatique',
  'Modèle freinomètre / poste', 'Version logicielle OTCLAN',
  'Cellule N° attestation', 'Layout CP / Ville', 'Cellules équipements',
  'Notes / Points d\'attention'
];

const WIDTHS = [5, 22, 12, 18, 9, 32, 50, 24, 18, 14, 12, 35, 45];

async function main() {
  const wb = await XlsxPopulate.fromBlankAsync();
  const ws = wb.sheet(0).name('75 Feuilles DOC-A-31');

  // ── En-tête ──
  COLNAMES.forEach((h, i) => {
    const cell = ws.cell(1, i + 1);
    cell.value(h)
      .style({
        bold: true,
        fontSize: 10,
        fontColor: 'FFFFFF',
        fill: COLORS.header,
        horizontalAlignment: 'center',
        verticalAlignment: 'center',
        wrapText: true,
        border: { top: true, bottom: true, left: true, right: true }
      });
  });

  // ── Données ──
  let row = 2;
  let n = 1;
  let currentCat = '';

  for (const f of feuilles) {
    const bg = COLORS[f.cat] || 'FFFFFF';
    const data = [
      n, f.nom, f.cat, f.ssCat, f.statut,
      f.equipement, f.condition,
      f.modeleFrein !== f.modelePoste ? `Frein: ${f.modeleFrein} / Poste: ${f.modelePoste}` : f.modeleFrein,
      f.versionLog, f.cellNum, f.cellCPVille, f.cellules, f.notes
    ];

    data.forEach((val, i) => {
      const cell = ws.cell(row, i + 1);
      cell.value(val === 'N/A' ? '' : val)
        .style({
          fontSize: 9,
          fill: bg,
          verticalAlignment: 'top',
          wrapText: true,
          border: { top: true, bottom: true, left: true, right: true }
        });

      // Colonne N° : centré et gras
      if (i === 0) cell.style({ horizontalAlignment: 'center', bold: true });
      // Colonne Statut : centré
      if (i === 4) cell.style({ horizontalAlignment: 'center' });
      // Legacy en gris foncé
      if (f.statut === 'Legacy') cell.style({ fontColor: '666666' });
      // Active en couleur normale
    });

    // (séparation visuelle gérée par les couleurs de fond)
    currentCat = f.cat;
    row++;
    n++;
  }

  // ── Largeurs colonnes ──
  WIDTHS.forEach((w, i) => {
    ws.column(i + 1).width(w);
  });

  // ── Hauteur en-tête ──
  ws.row(1).height(36);

  // ── Figer la première ligne ──
  ws.freezePanes(0, 1);

  // ── Filtre automatique ──
  ws.range(ws.cell(1, 1), ws.cell(row - 1, COLNAMES.length)).autoFilter();

  // ── Onglet 2 : Résumé règles métier ──────────────────────────────────────
  const ws2 = wb.addSheet('Règles métier');

  const regles = [
    ['RÈGLE', 'DÉTAIL'],
    ['SK08 / SK18 analyseur de gaz',
     'Format SN = NNN/AA. SK08 si AA<18 ou (AA=18 et NNN≤100). SK18 si AA>18 ou (AA=18 et NNN≥101). Exemple : 100/18→SK08, 101/18→SK18'],
    ['SMARTLYNX / HLT — réglophare',
     '"$PRO HLT OPTICAL UNIT PTI L" = TOUJOURS réglophare (RPH 5). JAMAIS un opacimètre. Test prioritaire dans le code.'],
    ['AT605 vs AT505',
     'AT605 = opacimètre (ACTIGAS_OPA). AT505 = analyseur de gaz (ACTIGAS complet).'],
    ['SONOCELERO — 1 seul PDF',
     'Si sono ET célero sont tous deux cochés → 1 seule section sousType=SONOCELERO → 1 seul PDF. Ne JAMAIS créer 2 sections séparées.'],
    ['Version logicielle OTCLAN',
     'OTCLAN retourne "1.1.2.5 LAN2.00". N\'écrire que "1.1.2.5" (regex \\d+\\.\\d+\\.\\d+\\.\\d+). La version hardcodée dans le template est TOUJOURS écrasée.'],
    ['SN pupitre VL',
     'Le pupitre VL n\'est PAS dans l\'OTCLAN. Cellule F21 sera vide dans l\'attestation. C\'est normal.'],
    ['FOG VL / FOG VL+',
     'Matériels hors OTCLAN Muller. Sélection via radio "Type chaîne" dans le formulaire. Modèles : CLS.750CT-VL/CLS.750FR-ENS1 (VL), CLS.750CT-VL+/CLS.750FR-ENS2 (VL+).'],
    ['BM 10000 / 10000MX',
     'Détecté si version majeure ≥ 2, ou modèle contient "50620"/"10000"/"bm". ATTENTION : H21=SN pupitre (pas F21), ne pas écraser I21.'],
    ['CL agréments (cross-linking)',
     'Les centres CL ont 2 agréments (VL et L-type). Le L-type n\'est pas dans la correspondance. Lien via N° de série des équipements POLLUTION uniquement (pas mécaniques).'],
    ['Layout CP / Ville NON standard',
     'Feuilles avec J20=CP, J21=Ville (au lieu de J21/J22) : XG 2-6, XG 2-7, XG VL+ 2-2, XG VL+ 2-4, XG PL 4-2-2, OPA OBD 6C SK18, AG OBD 4-3, 0225SONOCELERO, 0231SEUL, CELERODISTANCE, 0223SEUL, 0223CELERO, 0223LAN5.'],
    ['N° attestation G16 vs F16',
     'Feuilles avec N° en G16 (au lieu de F16) : toutes les feuilles pollution ACTIGAS, ECOSHIELD, ECOPOL.'],
    ['sheetOverride admin',
     'L\'admin peut forcer une feuille via menu déroulant. Override sauvegardé dans db.json → section.sheetOverride. Si présent, il prend la place du calcul automatique.'],
    ['Historique OTCLAN',
     'otclan_history.json : ne JAMAIS supprimer d\'entrée. Clé = "agrement|materielConcerne|numSerie". Upload enrichit sans écraser.'],
    ['RPH 6 (en suspens)',
     'Troisième feuille réglophare. Conditions de sélection RPH 6 vs RPH 5 pas encore définies (UTAC N°17/ESV/07841-1 + 22/LAN/ECE/0188). À implémenter lors d\'une prochaine session.'],
  ];

  regles.forEach(([titre, detail], i) => {
    const isHeader = i === 0;
    const bgR = isHeader ? COLORS.header : (i % 2 === 0 ? 'F2F2F2' : 'FFFFFF');
    const fcR = isHeader ? 'FFFFFF' : '000000';
    [ws2.cell(i + 1, 1), ws2.cell(i + 1, 2)].forEach((c, ci) => {
      c.value(ci === 0 ? titre : detail)
        .style({
          fontSize: 9,
          bold: isHeader,
          fill: bgR,
          fontColor: fcR,
          wrapText: true,
          verticalAlignment: 'top',
          border: { top: true, bottom: true, left: true, right: true }
        });
    });
  });
  ws2.column(1).width(32);
  ws2.column(2).width(80);
  ws2.freezePanes(0, 1);
  // Hauteurs
  ws2.row(1).height(20);
  for (let i = 2; i <= regles.length; i++) ws2.row(i).height(40);

  const outPath = path.join(__dirname, '75_feuilles_DOC-A-31.xlsx');
  await wb.toFileAsync(outPath);
  console.log('✅ Fichier généré :', outPath);
  console.log('   Feuilles actives  :', feuilles.filter(f => f.statut === 'Active').length);
  console.log('   Feuilles legacy   :', feuilles.filter(f => f.statut === 'Legacy').length);
  console.log('   Total             :', feuilles.length);
}

main().catch(console.error);
