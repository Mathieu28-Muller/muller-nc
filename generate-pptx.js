'use strict';
const PptxGenJS = require('pptxgenjs');
const prs = new PptxGenJS();

// Colors (no # prefix for pptxgenjs)
const R='C0392B', D='1A1A1A', W='FFFFFF', GY='666666';
const RECT='rect', OVAL='ellipse';

function tag(s, text, bgColor, textColor) {
  const w = Math.max(1.8, text.length * 0.11 + 0.6);
  s.addText(text, {
    x: (10-w)/2, y: 0.18, w, h: 0.28,
    fontSize:8, bold:true, color: textColor||W,
    fill:{color: bgColor||R}, align:'center', valign:'middle'
  });
}
function h2(s, text, color, ypos) {
  s.addText(text, {
    x:0.35, y: ypos||0.6, w:9.3, h:0.58,
    fontSize:23, bold:true, color: color||D, align:'center'
  });
}

// ─────────────────────────────────────────── SLIDE 1 : Couverture
{
  const s = prs.addSlide();
  s.background = {color: D};
  // Logo MA
  s.addShape(RECT, {x:3.82, y:0.52, w:0.65, h:0.44, fill:{color:R}, line:{color:R}});
  s.addText('MA', {x:3.82, y:0.52, w:0.65, h:0.44, fontSize:15, bold:true, color:W, align:'center', valign:'middle'});
  s.addText('Muller Automotive', {x:4.55, y:0.56, w:3.6, h:0.38, fontSize:12, color:'AAAAAA', valign:'middle'});
  // Titre
  s.addText('Système de Gestion\ndes Non-Conformités', {
    x:0.4, y:1.32, w:9.2, h:1.38,
    fontSize:36, bold:true, color:W, align:'center'
  });
  // Ligne rouge
  s.addShape(RECT, {x:4.4, y:2.82, w:1.2, h:0.08, fill:{color:R}, line:{color:R}});
  // Sous-titre
  s.addText('NC Manager · Qualité · ISO 9001:2015 · LNE', {
    x:0.4, y:3.08, w:9.2, h:0.38, fontSize:12, color:'AAAAAA', align:'center'
  });
  s.addText('Présentation CODIR — Mai 2026', {
    x:0.4, y:4.72, w:9.2, h:0.3, fontSize:10, color:'555555', align:'center'
  });
}

// ─────────────────────────────────────────── SLIDE 2 : Contexte
{
  const s = prs.addSlide();
  s.background = {color:W};
  tag(s,'CONTEXTE');
  h2(s,'Pourquoi une application dédiée ?');
  // Avant
  s.addShape(RECT, {x:0.25, y:1.32, w:4.45, h:4.0, fill:{color:'FFF5F5'}, line:{color:'FCD4D4', width:1}});
  s.addText('❌  Avant', {x:0.42, y:1.42, w:4, h:0.28, fontSize:9, bold:true, color:R});
  const avant=['Suivi des NC sur fichiers Excel dispersés','Aucune traçabilité des actions et délais','Risques élevés lors des audits ISO / LNE','Pas de notification automatique aux pilotes','Aucune statistique consolidée','Temps de réponse non mesurable'];
  avant.forEach((t,i)=> s.addText('●  '+t, {x:0.45, y:1.77+i*0.52, w:4.05, h:0.48, fontSize:10.5, color:'333333'}));
  // Après
  s.addShape(RECT, {x:5.3, y:1.32, w:4.45, h:4.0, fill:{color:'F0FBF6'}, line:{color:'A9DFBF', width:1}});
  s.addText('✅  Avec NC Manager', {x:5.48, y:1.42, w:4.05, h:0.28, fontSize:9, bold:true, color:'1E8449'});
  const apres=["Déclaration depuis n'importe quel poste ou mobile",'Traçabilité complète : qui, quoi, quand','Alertes email automatiques pilotes & direction','Tableaux de bord temps réel','Rapport de revue de direction en 1 clic','Conformité ISO 9001 §8.7, §10.2 documentée'];
  apres.forEach((t,i)=> s.addText('✓  '+t, {x:5.52, y:1.77+i*0.52, w:4.05, h:0.48, fontSize:10.5, color:'333333'}));
}

// ─────────────────────────────────────────── SLIDE 3 : Chiffres
{
  const s = prs.addSlide();
  s.background = {color:D};
  s.addText('APPLICATION', {x:3.9, y:0.18, w:2.2, h:0.27, fontSize:8, bold:true, color:'CCCCCC', fill:{color:'333333'}, align:'center', valign:'middle'});
  h2(s,'Une solution intégrée, déployée en interne','FFFFFF',0.62);
  const cards=[
    {val:'100%', lbl:'Accessible réseau local\nsans installation client'},
    {val:'3',    lbl:"Niveaux d'accès\nAdmin · Pilote · Déclarant"},
    {val:'ISO',  lbl:'Conforme 9001:2015\n+ Points LNE couverts'},
    {val:'0 €',  lbl:'Licence externe\nHébergé sur nos serveurs'},
  ];
  cards.forEach((c,i)=>{
    const x=0.3+i*2.38;
    s.addShape(RECT, {x, y:1.45, w:2.2, h:3.7, fill:{color:'252525'}, line:{color:'383838', width:1}});
    s.addText(c.val, {x, y:1.9, w:2.2, h:1.0, fontSize:40, bold:true, color:R, align:'center', valign:'middle'});
    s.addText(c.lbl, {x, y:3.3, w:2.2, h:1.0, fontSize:9, color:'AAAAAA', align:'center', valign:'top'});
  });
}

// ─────────────────────────────────────────── SLIDE 4 : Workflow
{
  const s = prs.addSlide();
  s.background = {color:W};
  tag(s,'FONCTIONNEMENT');
  h2(s,"Cycle de vie d'une Non-Conformité");
  const steps=[
    {n:'1',label:'Déclaration',   sub:'Formulaire public\nou admin',color:'E67E22'},
    {n:'2',label:'En traitement', sub:'Pilote assigné\nDélai fixé',color:'2980B9'},
    {n:'3',label:'Résolu',        sub:'Actions CAPA\ndocumentées',color:'27AE60'},
    {n:'4',label:'Clôturé',       sub:'Preuve efficacité\narchivée',color:'7F8C8D'},
    {n:'5',label:'Revue',         sub:'Rapport CODIR\nautomatique',color:'8E44AD'},
  ];
  const sw=1.52, aw=0.35, total=steps.length*sw+(steps.length-1)*aw;
  const x0=(10-total)/2;
  steps.forEach((st,i)=>{
    const x=x0+i*(sw+aw);
    s.addShape(OVAL, {x:x+0.45, y:1.62, w:0.62, h:0.62, fill:{color:st.color}, line:{color:st.color}});
    s.addText(st.n, {x:x+0.45, y:1.62, w:0.62, h:0.62, fontSize:16, bold:true, color:W, align:'center', valign:'middle'});
    s.addText(st.label, {x, y:2.38, w:sw, h:0.3, fontSize:9, bold:true, color:'333333', align:'center'});
    s.addText(st.sub,   {x, y:2.72, w:sw, h:0.5, fontSize:8, color:'999999', align:'center'});
    if(i<steps.length-1) s.addText('→', {x:x+sw, y:1.72, w:aw, h:0.42, fontSize:18, color:'DDDDDD', align:'center'});
  });
  s.addText('À chaque étape : notification email automatique au pilote et à la direction qualité · horodatage et traçabilité complète', {
    x:0.4, y:3.85, w:9.2, h:0.5, fontSize:10, color:'999999', align:'center'
  });
}

// ─────────────────────────────────────────── SLIDES 5 & 6 : Grilles fonctions
function slideFeatures(title, tagText, feats) {
  const s = prs.addSlide();
  s.background = {color:W};
  tag(s, tagText);
  h2(s, title);
  const cols=3, cw=2.92, ch=1.85, gx=0.18, gy=0.18;
  const x0=(10-cols*cw-(cols-1)*gx)/2, y0=1.35;
  feats.forEach((f,i)=>{
    const col=i%cols, row=Math.floor(i/cols);
    const x=x0+col*(cw+gx), y=y0+row*(ch+gy);
    s.addShape(RECT, {x, y, w:cw, h:ch, fill:{color:'F8F9FA'}, line:{color:'E8E8E8', width:1}});
    s.addText(f.icon, {x, y:y+0.08, w:cw, h:0.48, fontSize:24, align:'center'});
    s.addText(f.title, {x:x+0.12, y:y+0.58, w:cw-0.24, h:0.32, fontSize:10, bold:true, color:D});
    s.addText(f.desc,  {x:x+0.12, y:y+0.92, w:cw-0.24, h:0.86, fontSize:9, color:GY});
  });
  return s;
}

slideFeatures('Formulaire public — accessible à tous','DÉCLARATION',[
  {icon:'🌐',title:'Sans compte, sans installation',     desc:"Accessible depuis n'importe quel navigateur sur le réseau. Techniciens, clients, fournisseurs."},
  {icon:'📝',title:'Saisie guidée pas à pas',             desc:'Aide contextuelle sur chaque champ, menus déroulants configurables, exemples intégrés.'},
  {icon:'📸',title:'Photos & vidéos jointes',             desc:'Dépôt de pièces jointes directement depuis le formulaire — photos, vidéos, documents PDF.'},
  {icon:'🔢',title:'Numéro de suivi immédiat',            desc:'Numéro NC généré automatiquement et envoyé par email au déclarant à la soumission.'},
  {icon:'🔍',title:'Suivi en temps réel',                 desc:"Le déclarant peut consulter l'avancement de sa NC à tout moment avec son numéro."},
  {icon:'❓',title:'Aide intégrée novices',               desc:'Bouton "Aide formulaire" avec explications simples pour les déclarants non formés.'},
]);

slideFeatures('Console administrateur — pilotage complet','ADMINISTRATION',[
  {icon:'📊',title:'Tableau de bord temps réel',       desc:'Compteurs par statut, graphiques mensuels, alertes retard, statistiques par périmètre.'},
  {icon:'🔎',title:'Filtres & tri avancés',             desc:'Recherche par NC, filtre par statut, pilote, année, source. Colonnes personnalisables.'},
  {icon:'👥',title:'Gestion des utilisateurs',          desc:'Création de comptes pilotes, chefs produit, admins. Notifications email ciblées par rôle.'},
  {icon:'⚡',title:'Gravité & score de risque',         desc:"Cotation sur 4 axes (impact client, conformité, sécurité, récurrence). Score 1-9 automatique."},
  {icon:'🔬',title:'Analyse 5 Pourquoi & Ishikawa',    desc:"Outils d'analyse causale intégrés directement dans la fiche NC. Cause racine tracée."},
  {icon:'📋',title:'Actions CAPA complètes',            desc:"3 types d'actions (immédiate, corrective, préventive) avec responsable, délai et preuve."},
]);

// ─────────────────────────────────────────── SLIDE 7 : KPI
{
  const s = prs.addSlide();
  s.background = {color:W};
  tag(s,'PILOTAGE QUALITÉ');
  h2(s,'Indicateurs qualité & rapport de direction');
  const kpis=[
    'Taux de récurrence — alerte si même défaut > 2× en 6 mois',
    "Taux d'efficacité CAPA — % NC clôturées sans réouverture · cible ≥ 85 %",
    'Coût de non-qualité (€) — rebut, retouche, SAV · cumulé par an',
    'Délai moyen de traitement — par statut, par pilote, par périmètre',
    'Respect des échéances — actions en retard signalées en rouge',
    'Pareto causes — familles les plus fréquentes identifiées automatiquement',
  ];
  kpis.forEach((t,i)=> s.addText('●  '+t, {x:0.4, y:1.42+i*0.55, w:5.0, h:0.5, fontSize:10.5, color:'333333'}));
  // Encart rapport
  s.addShape(RECT, {x:5.8, y:1.32, w:3.85, h:3.9, fill:{color:'F8F9FA'}, line:{color:'E0E0E0', width:1}});
  s.addText('📋  Rapport revue de direction', {x:5.95, y:1.44, w:3.55, h:0.32, fontSize:9, bold:true, color:R});
  const rapport=["Généré en 1 clic depuis l'onglet Archives","Toutes les NC de l'année synthétisées",'KPI consolidés prêts pour le CODIR','Imprimable ou exportable PDF','Preuve documentée §9.3 ISO 9001'];
  rapport.forEach((t,i)=> s.addText('✓  '+t, {x:5.95, y:1.88+i*0.58, w:3.55, h:0.5, fontSize:10.5, color:'333333'}));
}

// ─────────────────────────────────────────── SLIDE 8 : ISO
{
  const s = prs.addSlide();
  s.background = {color:W};
  tag(s,'CONFORMITÉ');
  h2(s,'Couverture ISO 9001:2015 & LNE');
  const items=[
    {code:'§ 8.7',   lne:false, title:'Maîtrise des NC',           desc:'Identification, traçabilité, décision documentée'},
    {code:'§ 10.2.1',lne:false, title:'Actions correctives',        desc:"5 Pourquoi, CAPA 3 types, preuve d'efficacité"},
    {code:'§ 10.2.2',lne:false, title:'Informations documentées',   desc:'Journal immuable, horodatage, archivage complet'},
    {code:'§ 9.3',   lne:false, title:'Revue de direction',         desc:'Rapport automatique avec tous les indicateurs requis'},
    {code:'§ 6.1',   lne:false, title:'Gestion des risques',        desc:'Score de risque sur 4 axes, alerte direction ≥ 7/9'},
    {code:'LNE-1/2', lne:true,  title:'Points LNE bloquants',       desc:'Cause racine démontrée, preuve efficacité tangible'},
    {code:'§ 9.1',   lne:false, title:'Surveillance & mesure',      desc:'KPI récurrence, délai, coût qualité, efficacité CAPA'},
    {code:'§ 8.2',   lne:false, title:'Communication client',       desc:'Retour client tracé, satisfaction confirmée à la clôture'},
  ];
  const cols=2, cw=4.35, ch=0.68, gx=0.3, gy=0.1;
  const x0=(10-cols*cw-(cols-1)*gx)/2, y0=1.35;
  items.forEach((it,i)=>{
    const col=i%cols, row=Math.floor(i/cols);
    const x=x0+col*(cw+gx), y=y0+row*(ch+gy);
    s.addShape(RECT, {x, y, w:cw, h:ch, fill:{color:'F8F9FA'}, line:{color:'E8E8E8', width:1}});
    s.addText('✓', {x:x+0.1, y:y+0.1, w:0.3, h:0.48, fontSize:14, color:'27AE60', bold:true, valign:'middle'});
    s.addText(it.code, {x:x+0.46, y:y+0.1, w:0.88, h:0.26, fontSize:8, bold:true, color:it.lne?'0A3622':'0C447C', fill:{color:it.lne?'D1E7DD':'E8F0FB'}, align:'center', valign:'middle'});
    s.addText(it.title, {x:x+1.44, y:y+0.06, w:cw-1.55, h:0.3, fontSize:10, bold:true, color:D});
    s.addText(it.desc,  {x:x+1.44, y:y+0.36, w:cw-1.55, h:0.28, fontSize:8.5, color:GY});
  });
}

// ─────────────────────────────────────────── SLIDE 9 : Avantages
{
  const s = prs.addSlide();
  s.background = {color:W};
  tag(s,'BÉNÉFICES');
  h2(s,'Ce que ça change concrètement');
  const avs=[
    {icon:'⏱️',title:'Gain de temps administratif',       desc:'Plus de fichiers Excel à consolider. Toutes les NC centralisées, filtrables et exportables en temps réel.'},
    {icon:'🔔',title:'Zéro NC oubliée',                   desc:"Alertes email automatiques au pilote dès affectation, et à la direction si dépassement d'échéance."},
    {icon:'🏆',title:'Audit ISO serein',                   desc:'Toutes les preuves documentées : historique immuable, causes racines, actions et efficacité.'},
    {icon:'💻',title:'Zéro dépendance externe',            desc:"Hébergé sur nos serveurs, données 100 % locales. Aucun abonnement cloud, aucune donnée partagée."},
    {icon:'📱',title:'Accessible partout sur le réseau',   desc:'Depuis un PC, une tablette ou un smartphone sur le réseau interne. Aucune installation requise.'},
    {icon:'📈',title:'Amélioration continue mesurée',      desc:"Taux de récurrence, efficacité CAPA, coût qualité — la preuve chiffrée que le système s'améliore."},
  ];
  const cols=2, cw=4.35, ch=1.35, gx=0.3, gy=0.18;
  const x0=(10-cols*cw-(cols-1)*gx)/2, y0=1.35;
  avs.forEach((a,i)=>{
    const col=i%cols, row=Math.floor(i/cols);
    const x=x0+col*(cw+gx), y=y0+row*(ch+gy);
    s.addShape(RECT, {x, y, w:cw, h:ch, fill:{color:W}, line:{color:'E0E0E0', width:1}});
    s.addText(a.icon, {x:x+0.1, y:y+(ch-0.52)/2, w:0.6, h:0.52, fontSize:24, valign:'middle'});
    s.addText(a.title, {x:x+0.82, y:y+0.16, w:cw-1.0, h:0.32, fontSize:10, bold:true, color:D});
    s.addText(a.desc,  {x:x+0.82, y:y+0.5,  w:cw-1.0, h:0.8,  fontSize:9,  color:GY});
  });
}

// ─────────────────────────────────────────── SLIDE 10 : Hébergement
{
  const s = prs.addSlide();
  s.background = {color:W};
  tag(s,'INFRASTRUCTURE');
  h2(s,'Hébergement — Cloud OVH vs NAS Interne');

  // OVH (vert)
  s.addShape(RECT, {x:0.25, y:1.32, w:4.45, h:3.85, fill:{color:'F0FBF6'}, line:{color:'A9DFBF', width:1}});
  s.addText('✅  Cloud OVH — Solution actuelle', {x:0.42, y:1.42, w:4.1, h:0.28, fontSize:9, bold:true, color:'1E8449'});
  s.addText('~80 – 135 €/an HT', {x:0.42, y:1.76, w:4.1, h:0.42, fontSize:18, bold:true, color:'1E8449', align:'center'});
  const ovh=[
    '✓  URL HTTPS directe — accessible partout',
    '✓  Accès clients & partenaires sans VPN',
    '✓  0 € acquisition — aucun matériel',
    '✓  Certificat SSL automatique inclus',
    '✓  Datacenter France · RGPD ✓',
    '✓  SLA 99,9 % — matériel géré OVH',
  ];
  ovh.forEach((t,i)=> s.addText(t, {x:0.42, y:2.24+i*0.48, w:4.12, h:0.44, fontSize:10, color:'1E8449'}));

  // NAS (orange)
  s.addShape(RECT, {x:5.3, y:1.32, w:4.45, h:3.85, fill:{color:'FFF8F0'}, line:{color:'F5CBA7', width:1}});
  s.addText('NAS Interne', {x:5.48, y:1.42, w:4.1, h:0.28, fontSize:9, bold:true, color:'D35400'});
  s.addText('~700 – 1 100 € 1re année', {x:5.48, y:1.76, w:4.1, h:0.42, fontSize:16, bold:true, color:'D35400', align:'center'});
  const nas=[
    '✗  Accès externe : VPN ou IP fixe requis',
    '✗  Acquisition NAS + disques (350–500 €)',
    '✗  Panne = intervention physique sur site',
    '✗  Mise en service 4–8 h (réseau)',
    '✓  Données 100 % sur site',
    '→  Récurrent : ~150–280 €/an HT',
  ];
  nas.forEach((t,i)=> {
    const col = t.startsWith('✗') ? 'C0392B' : t.startsWith('✓') ? '27AE60' : '888888';
    s.addText(t, {x:5.52, y:2.24+i*0.48, w:4.12, h:0.44, fontSize:10, color:col});
  });

  // Recommandation
  s.addShape(RECT, {x:0.25, y:5.22, w:9.5, h:0.28, fill:{color:'D5F5E3'}, line:{color:'A9DFBF', width:1}});
  s.addText('Recommandation : OVH Cloud — coût total inférieur sur 3 ans, accès URL direct pour clients, zéro matériel à maintenir.', {
    x:0.4, y:5.22, w:9.2, h:0.28, fontSize:8.5, color:'1E5C35', valign:'middle'
  });
}

// ─────────────────────────────────────────── SLIDE 11 : Démo
{
  const s = prs.addSlide();
  s.background = {color:D};
  s.addText('DÉMONSTRATION LIVE', {x:3.3, y:0.18, w:3.4, h:0.28, fontSize:8, bold:true, color:'CCCCCC', fill:{color:'333333'}, align:'center', valign:'middle'});
  s.addText("Accédez à l'application", {x:0.4, y:0.6, w:9.2, h:0.52, fontSize:24, bold:true, color:W, align:'center'});
  s.addText('Cliquez pour ouvrir directement dans le navigateur', {x:0.4, y:1.16, w:9.2, h:0.35, fontSize:11, color:'AAAAAA', align:'center'});
  const links=[
    {icon:'📝', label:'Formulaire de déclaration publique',      url:'https://formation-sav.fr/NC/'},
    {icon:'🖥', label:'Console administrateur — tableau de bord', url:'https://formation-sav.fr/NC/console.html'},
    {icon:'🔐', label:'Connexion administrateur / pilote',        url:'https://formation-sav.fr/NC/login.html'},
  ];
  links.forEach((lk,i)=>{
    const y=1.68+i*1.2;
    s.addShape(RECT, {x:1.9, y, w:6.2, h:1.02, fill:{color:'252525'}, line:{color:'444444', width:1}});
    s.addText(lk.icon, {x:2.05, y:y+0.22, w:0.62, h:0.58, fontSize:26, valign:'middle'});
    s.addText(lk.label,{x:2.8,  y:y+0.08, w:5.0, h:0.3, fontSize:9, color:'AAAAAA'});
    s.addText(lk.url,  {x:2.8,  y:y+0.44, w:5.0, h:0.36, fontSize:11, bold:true, color:W, hyperlink:{url:lk.url}});
    s.addText('→', {x:7.7, y:y+0.31, w:0.3, h:0.4, fontSize:16, color:'555555', align:'center'});
  });
}

// ─────────────────────────────────────────── SLIDE 12 : Questions
{
  const s = prs.addSlide();
  s.background = {color:R};
  s.addText('💬', {x:0.4, y:0.85, w:9.2, h:0.9, fontSize:46, align:'center', valign:'middle'});
  s.addText('Questions ?', {x:0.4, y:1.88, w:9.2, h:0.85, fontSize:42, bold:true, color:W, align:'center'});
  s.addShape(RECT, {x:4.38, y:2.88, w:1.24, h:0.08, fill:{color:'FFFFFF'}, line:{color:'FFFFFF'}});
  s.addText('NC Manager — développé en interne pour Muller Automotive\nConformité ISO 9001:2015 · LNE · Données 100 % locales', {
    x:0.4, y:3.12, w:9.2, h:0.82, fontSize:12, color:W, align:'center'
  });
  s.addText('Pour toute question : contacter le service Qualité', {
    x:0.4, y:4.18, w:9.2, h:0.35, fontSize:10, color:'FFCCCC', align:'center'
  });
}

// ─────────────────────────────────────────── Export
prs.writeFile({fileName:'C:\\formation\\presentation-codir-nc.pptx'})
  .then(()=>{ console.log('OK: C:\\formation\\presentation-codir-nc.pptx'); })
  .catch(e=>{ console.error('ERREUR:', e.message); });
