// Script génération données de test NC — 2024 (20 clos) + 2025 (30, 2 déc. ouverts)
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'nc-data.json');
const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

const clients = [
  { nom:'Autovision', cp:'20987', ville:'Caen', pays:'France' },
  { nom:'Renault Trucks', cp:'69800', ville:'Saint-Priest', pays:'France' },
  { nom:'Groupe Bernard', cp:'01000', ville:'Bourg-en-Bresse', pays:'France' },
  { nom:'Toyota Strasbourg', cp:'67200', ville:'Strasbourg', pays:'France' },
  { nom:'BMW Bordeaux', cp:'33000', ville:'Bordeaux', pays:'France' },
  { nom:'Stellantis Sochaux', cp:'25600', ville:'Sochaux', pays:'France' },
  { nom:'Volkswagen Lyon', cp:'69000', ville:'Lyon', pays:'France' },
  { nom:'Mercedes Toulouse', cp:'31000', ville:'Toulouse', pays:'France' },
  { nom:'Audi Nantes', cp:'44000', ville:'Nantes', pays:'France' },
  { nom:'Ford Lille', cp:'59000', ville:'Lille', pays:'France' },
];

const familles = ['PUPITRE LCT','BANC D\'ESSAI','INTERFACE DIAGNOSTIC','VALISE TEST','SIMULATEUR RESEAU','STATION PROGRAMMATION'];
const pilotes = ['Eric Vernier','Julien Cortey','Estelle Gouache','François Barthélémy','Hervé Le Glaunec','Philippe Skrzypczak'];
const types = ['corrective','curative','preventive'];
const typesCause = ['BDD incomplète','Fournisseur','Qualité produit','Erreur référence saisie','Logistique - erreur envoi','Manque formation produit','ERP','Transporteur','Qualité production','Sous-traitance'];

const problemes = [
  'Écran tactile non fonctionnel à la mise en service',
  'Câblage inversé sur connecteur J3 — court-circuit détecté',
  'Logiciel embarqué version incompatible avec châssis client',
  'Boîtier fissuré lors du transport — emballage insuffisant',
  'Référence produit erronée sur bon de livraison',
  'Mise à jour firmware échouée — perte configuration usine',
  'Capteur température hors tolérance ±0.5°C',
  'Interface CAN bus non détectée par outil diagnostic',
  'Alimentation 24V instable — coupures aléatoires',
  'Étiquetage SAP non conforme — doublon de référence',
  'Connecteur RJ45 défaillant — perte liaison réseau',
  'Fusible principal soufflé à la première mise sous tension',
  'Code erreur E04 non documenté dans manuel utilisateur',
  'Retard livraison J+12 par rapport au délai contractuel',
  'Pièce de rechange non disponible en stock — rupture',
  'Erreur de programmation automate — séquence démarrage',
  'Condensation interne constatée — mauvais joint d\'étanchéité',
  'Rapport de test manquant dans le dossier de livraison',
  'Bouton arrêt urgence non conforme EN ISO 13850',
  'Fréquence parasites 50Hz sur mesure analogique',
];

const reparations = [
  'Remplacement de l\'écran tactile et test fonctionnel complet',
  'Recâblage du connecteur J3 — vérification isolation',
  'Mise à jour logiciel vers version compatible V3.2.1',
  'Reconditionnement emballage — ajout mousse anti-choc',
  'Correction bon de livraison — réexpédition dossier',
  'Restauration configuration depuis sauvegarde distante',
  'Étalonnage capteur — remplacement sonde',
  'Remplacement module CAN — test bench validé',
  'Stabilisation alimentation — ajout condensateur filtrage',
  'Correction référence SAP — purge doublon base',
  'Remplacement connecteur RJ45 — test continuité',
  'Diagnostic court-circuit — remplacement fusible et protection',
  'Mise à jour documentation technique — ajout code E04',
  'Analyse causes retard — plan corrective transporteur',
  'Commande pièce fournisseur — livraison express J+3',
  'Correction programme automate — recette complète',
  'Remplacement joint — test étanchéité IP65',
  'Complétion dossier — envoi rapport signé',
  'Remplacement bouton urgence conforme — re-certification',
  'Ajout filtre anti-parasite — remesure conforme',
];

const commentsCloture = [
  'Action corrective validée en production — diffusion procédure mise à jour',
  'Fournisseur notifié — plan d\'amélioration qualité reçu et validé',
  'Formation équipe réalisée — compétences validées par évaluation',
  'Procédure packaging mise à jour — applicable dès semaine suivante',
  'Processus documenté — audit interne programmé T+90j',
  'Mise à jour BDD effectuée — vérification systématique ajoutée au process',
  'Étalonnage périodique ajouté au plan de maintenance préventive',
  'Fiche technique mise à jour — disponible sur intranet qualité',
  'Stock sécurité révisé — seuil d\'alerte ajusté à 5 unités',
  'Revue fournisseur planifiée — indicateur livraison suivi mensuel',
];

const commentsGeneraux = [
  'NC traitée dans les délais. Merci pour votre réactivité.',
  'Dossier clôturé. Actions préventives mises en place pour éviter la récurrence.',
  'Conformité rétablie. Client informé de la résolution.',
  'Traitement terminé. Rapport qualité transmis au service concerné.',
  'NC clôturée après validation terrain. Aucune récurrence constatée.',
  'Résolution confirmée. Fiche REX diffusée en interne.',
  'Action corrective efficace. Suivi à 3 mois programmé.',
  'Clôture approuvée. Documentation mise à jour en conséquence.',
];

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function addDays(date, d) { const r = new Date(date); r.setDate(r.getDate() + d); return r; }
function iso(d) { return new Date(d).toISOString(); }
function dateStr(d) { return new Date(d).toISOString().slice(0, 10); }
function padN(n, len) { return String(n).padStart(len, '0'); }

function makeNumero(date, counter) {
  const d = new Date(date);
  const yy = String(d.getFullYear()).slice(2);
  const mm = padN(d.getMonth() + 1, 2);
  const dd = padN(d.getDate(), 2);
  return `${yy}${mm}${dd}-${padN(counter, 4)}`;
}

function makeNC({ date, counter, statut, delaiJours, clotureLag, respect }) {
  const createdAt = new Date(date);
  createdAt.setHours(rndInt(8, 17), rndInt(0, 59), rndInt(0, 59));
  const client = rnd(clients);
  const famille = rnd(familles);
  const pilote = rnd(pilotes);
  const numero = makeNumero(createdAt, counter);
  const prob = rnd(problemes);
  const rep = rnd(reparations);

  const delaiAction = dateStr(addDays(createdAt, delaiJours || rndInt(15, 45)));
  const traitementDate = addDays(createdAt, rndInt(2, 5));
  const resolDate = addDays(traitementDate, rndInt(5, delaiJours - 5 > 5 ? delaiJours - 5 : 8));

  // closedAt: respect=true → avant délai, false → après
  let closedAt = null;
  let dureeTotal = null;
  let dureeTraitement = null;
  let echeanceRespectee = undefined;

  if (statut === 'clos') {
    const lag = clotureLag !== undefined ? clotureLag : (respect ? -rndInt(1, 7) : rndInt(1, 15));
    const delaiDate = new Date(delaiAction);
    closedAt = addDays(delaiDate, lag);
    if (closedAt < resolDate) closedAt = addDays(resolDate, rndInt(1, 3));
    dureeTotal = Math.round((closedAt - createdAt) / 86400000);
    dureeTraitement = Math.round((closedAt - traitementDate) / 86400000);
    echeanceRespectee = (new Date(closedAt).setHours(0,0,0,0) - new Date(delaiAction).setHours(0,0,0,0)) / 86400000 <= 0;
  }

  const historique = [
    { date: iso(createdAt), statut: 'ouvert', commentaire: 'Déclaration créée', par: 'Mat' },
    { date: iso(traitementDate), statut: 'en_cours', commentaire: 'Action corrective assignée au pilote', par: 'Admin' },
  ];
  if (statut === 'clos') {
    historique.push({ date: iso(resolDate), statut: 'resolu', commentaire: 'Toutes les actions sont terminées — passage automatique en attente de validation', par: 'Admin' });
    historique.push({ date: iso(closedAt), statut: 'clos', commentaire: rnd(commentsGeneraux), par: 'Admin' });
  }

  const actionDate = addDays(traitementDate, 1);
  const repDate1 = addDays(actionDate, rndInt(3, 8));
  const repDate2 = statut === 'clos' ? addDays(repDate1, rndInt(2, 5)) : null;

  const action = {
    id: `ACT-${String(createdAt.getFullYear())}${padN(createdAt.getMonth()+1,2)}${padN(createdAt.getDate(),2)}-001-${numero}`,
    ncNumero: numero,
    type: rnd(types),
    pilote,
    echeance: delaiAction,
    commentaireAction: rep,
    statut: statut === 'clos' ? 'cloturé' : 'en_cours',
    historiqueStatut: [
      { date: iso(actionDate), statut: 'ouvert', par: 'Admin' },
      { date: iso(repDate1), statut: 'en_cours', par: pilote, commentaire: 'Première réponse reçue' },
    ],
    reponsesActions: [
      { date: iso(repDate1), reponse: rep, par: pilote, type: 'reponse_pilote', fichiers: [] },
    ],
    jDiffFige: undefined,
  };

  if (statut === 'clos' && repDate2) {
    action.historiqueStatut.push({ date: iso(repDate2), statut: 'cloturé', par: 'Admin', commentaire: '' });
    action.reponsesActions.push({ date: iso(repDate2), reponse: rnd(commentsGeneraux), par: 'Admin', type: 'retour_admin', fichiers: [] });
  }

  // Remove undefined jDiffFige
  delete action.jDiffFige;

  const nc = {
    numero,
    createdAt: iso(createdAt),
    statut,
    redacteur: 'Admin',
    emailRedacteur: 'admin@mullerautomotive.fr',
    dateDecouverte: dateStr(createdAt),
    decouvreur: rnd(['Admin','Mat','Service technique','Bureau méthodes']),
    noCommande: `CMD-${rndInt(10000,99999)}`,
    refProduit: famille.split(' ')[0]+'-'+rndInt(100,999),
    familleProduit: famille,
    noSerie: String(rndInt(1000,9999)),
    versionProg: `${rndInt(1,3)}.${rndInt(0,9)}.${rndInt(0,9)}`,
    sapCode: `C${rnd(['fra','ger','esp'])}${rndInt(10000,99999)}`,
    nomClient: client.nom,
    cp: client.cp,
    ville: client.ville,
    pays: client.pays,
    probleme: prob,
    reparation: rep,
    suggestion: '',
    mediaFiles: [],
    mediaFilesTraitement: [],
    historique,
    actions: [action],
    reponsesPilote: [],
    delaiAction,
  };

  if (statut === 'clos') {
    nc.closedAt = iso(closedAt);
    nc.dureeTotal = dureeTotal;
    nc.dureeTraitement = dureeTraitement;
    nc.echeanceRespectee = echeanceRespectee;
    nc.typeCause = rnd(typesCause);
    nc.cout = rndInt(0, 3) === 0 ? 0 : rndInt(50, 4500);
    nc.commentaireCloture = rnd(commentsCloture);
  }

  return nc;
}

// ─── Nettoyer les anciennes données de test avant de re-générer ─────
data.declarations = data.declarations.filter(n => n.numero.startsWith('26'));
data.counter['2024'] = 0;
data.counter['2025'] = 0;

// ─── Générer 2024 : 20 NCs, toutes closes ─────────────────

const nc2024 = [];
// ~2 par mois, réparties sur l'année avec certaines en fin d'année
const dates2024 = [
  '2024-01-09','2024-01-23',
  '2024-02-07','2024-02-20',
  '2024-03-05','2024-03-19',
  '2024-04-03','2024-04-17',
  '2024-05-08','2024-05-22',
  '2024-06-04','2024-06-18',
  '2024-07-02','2024-07-16',
  '2024-08-06','2024-08-20',
  '2024-09-03','2024-09-17',
  '2024-10-08','2024-10-22',
];

// Mix respect/non-respect : 13 respectées, 7 non
const respectArr = [true,true,true,false,true,true,false,true,true,false,true,true,false,true,true,false,true,true,true,false];

dates2024.forEach((d, i) => {
  data.counter['2024']++;
  const delai = rndInt(20, 50);
  nc2024.push(makeNC({
    date: d,
    counter: data.counter['2024'],
    statut: 'clos',
    delaiJours: delai,
    respect: respectArr[i],
  }));
});

// ─── Générer 2025 : 31 NCs, 2-3/mois, 2 déc. ouvertes ────

const nc2025 = [];
const dates2025 = [
  // Jan : 3
  '2025-01-08','2025-01-16','2025-01-27',
  // Fév : 2
  '2025-02-05','2025-02-19',
  // Mar : 3
  '2025-03-04','2025-03-12','2025-03-25',
  // Avr : 2
  '2025-04-03','2025-04-22',
  // Mai : 3
  '2025-05-06','2025-05-15','2025-05-28',
  // Juin : 2
  '2025-06-04','2025-06-18',
  // Juil : 3
  '2025-07-02','2025-07-10','2025-07-24',
  // Aoû : 2
  '2025-08-05','2025-08-19',
  // Sep : 3
  '2025-09-03','2025-09-11','2025-09-23',
  // Oct : 2
  '2025-10-07','2025-10-21',
  // Nov : 3
  '2025-11-04','2025-11-13','2025-11-25',
  // Déc : 3 dont 2 restent ouvertes
  '2025-12-03','2025-12-12','2025-12-22',
];

const respectArr25 = [
  true,false,true,  // jan
  true,true,        // fev
  false,true,true,  // mar
  true,false,       // avr
  true,true,false,  // mai
  true,true,        // jun
  false,true,true,  // jul
  true,false,       // aou
  true,true,true,   // sep
  false,true,       // oct
  true,true,false,  // nov
  true,false,false, // dec — les 2 dernières seront ouvertes
];

dates2025.forEach((d, i) => {
  data.counter['2025']++;
  const isDecOuvert = i >= 29; // 2 dernières dates déc (index 29 et 30 = 12 et 22 déc)
  const statut = isDecOuvert ? 'en_cours' : 'clos';
  nc2025.push(makeNC({
    date: d,
    counter: data.counter['2025'],
    statut,
    delaiJours: rndInt(20, 45),
    respect: respectArr25[i],
  }));
});

// Injecter dans data.declarations (avant les NCs 2026)
const existing2026 = data.declarations.filter(n => n.numero.startsWith('26'));
data.declarations = [...nc2024, ...nc2025, ...existing2026];

fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
console.log(`✓ ${nc2024.length} NC 2024 générées (toutes closes)`);
console.log(`✓ ${nc2025.length} NC 2025 générées (${nc2025.filter(n=>n.statut!=='clos').length} ouvertes en décembre)`);
console.log(`  Counter 2024: ${data.counter['2024']}, Counter 2025: ${data.counter['2025']}, Counter 2026: ${data.counter['2026']}`);
