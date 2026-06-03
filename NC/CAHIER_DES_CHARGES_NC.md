# CAHIER DES CHARGES FONCTIONNEL ET TECHNIQUE
## Système de Gestion des Non-Conformités — Muller Automotive
### Version 4.0 — 29/05/2026

---

## TABLE DES MATIÈRES

1. [Contexte et périmètre](#1-contexte-et-périmètre)
2. [Architecture technique globale](#2-architecture-technique-globale)
3. [Persistance des données](#3-persistance-des-données)
4. [Authentification et gestion des rôles](#4-authentification-et-gestion-des-rôles)
5. [Module 1 — Formulaire public de déclaration NC](#5-module-1--formulaire-public-de-déclaration-nc)
6. [Module 2 — Console d'administration NC](#6-module-2--console-dadministration-nc)
7. [Module 3 — NC Parent-Satellites](#7-module-3--nc-parent-satellites)
8. [Module 4 — Rattachement avancé et post-clôture](#8-module-4--rattachement-avancé-et-post-clôture)
9. [Module 5 — Droits pilote et tableau de bord](#9-module-5--droits-pilote-et-tableau-de-bord)
10. [Module 6 — Liste accordéon dépliable](#10-module-6--liste-accordéon-dépliable)
11. [Module 7 — Aide normative contextuelle](#11-module-7--aide-normative-contextuelle)
12. [Module 8 — Statistiques NC (nc_stats.js)](#12-module-8--statistiques-nc)
13. [Système de notifications email](#13-système-de-notifications-email)
14. [API REST — Routes complètes](#14-api-rest--routes-complètes)
15. [Règles de gestion (RG-XX)](#15-règles-de-gestion-rg-xx)
16. [Points de conformité ISO 9001:2015 / LNE](#16-points-de-conformité-iso-90012015--lne)
17. [Infrastructure et déploiement](#17-infrastructure-et-déploiement)
18. [Évolutions planifiées](#18-évolutions-planifiées)
19. [Glossaire](#19-glossaire)

---

## HISTORIQUE DES VERSIONS

| Version | Date | Auteur | Modifications |
|---|---|---|---|
| 1.0 | 01/05/2026 | Mathieu Avet | Création initiale — module NC de base |
| 2.0 | 09/05/2026 | Mathieu Avet | Phase 1 sécurité, dual-write PostgreSQL, NC parent-satellites |
| 3.0 | 07/05/2026 | Mathieu Avet | Double profil Pilote/Lecteur, présentation.html, capaLabel global |
| **4.0** | **29/05/2026** | **Mathieu Avet** | **Bascule DATA_SOURCE=postgres (source de vérité unique), schéma PG documenté, correction filtre "en retard réel" (ISO §10.2), nc_stats.js, planification Phase 4 + OVH** |

---

## 1. CONTEXTE ET PÉRIMÈTRE

### 1.1 Contexte métier

Muller Automotive déploie un système informatique de gestion des Non-Conformités (NC) conforme au référentiel **ISO 9001:2015** et aux exigences de l'organisme certificateur **LNE**. Le système couvre le cycle de vie complet d'une non-conformité : de sa déclaration terrain jusqu'à sa clôture avec preuve d'efficacité.

### 1.2 Objectifs principaux

| Objectif | Description |
|---|---|
| Traçabilité totale | Journal d'audit immuable — qui/quoi/quand sur chaque opération (§10.2.2) |
| Gestion multi-périmètre | NC croisées entre SAV, Production, Approvisionnement, Qualité |
| Analyse de cause unique | Regroupement de NC similaires sous un parent unique pour éviter les analyses redondantes |
| Droits différenciés | Admin qualité, chef produit/pilote, lecteur — principe de moindre privilège (§5.3) |
| Alertes délai | Détection automatique des NC sans analyse > 5j (mineure) / 48h (majeure) — LNE-5 |
| Conformité LNE | Cause racine systémique, preuve d'efficacité obligatoire, journal immuable |

### 1.3 Périmètre fonctionnel

Le système comprend **8 modules fonctionnels** interopérables :

- **Formulaire public** : déclaration NC sans compte (opérateurs, techniciens SAV)
- **Console admin** : gestion complète du cycle de vie NC
- **NC Parent-Satellites** : regroupement de NC similaires, analyse centralisée, clôture en cascade
- **Rattachement avancé** : algorithme de similarité, rattachement tardif, analyses post-clôture
- **Droits pilote** : réponse CAPA, tableau de bord personnel du chef produit/pilote
- **Liste accordéon** : navigation dépliable parent → satellites dans la liste
- **Aide normative** : références ISO/LNE contextuelles dans chaque formulaire
- **Statistiques NC** : comptage ISO §9.1 correct (exclusion satellites), KPI §10.3

---

## 2. ARCHITECTURE TECHNIQUE GLOBALE

### 2.1 Stack technique

| Composant | Technologie | Version | Notes |
|---|---|---|---|
| Serveur applicatif | Node.js + Express | v22+ | Port 3001 |
| Gestionnaire de processus | PM2 | — | Process `formation-sav` |
| Base de données | **PostgreSQL 16** | 16.x | Source de vérité unique depuis 25/05/2026 |
| Service Windows PG | postgresql-x64-16 | — | Démarrage automatique |
| Base de données PG | nc_muller | — | 12 tables, 3 vues |
| Reverse proxy | Nginx | 1.29.7+ | Port 80/443 → 3001 |
| CDN | Cloudflare | — | Headers no-store sur HTML |
| Authentification | JWT (JSON Web Token) | HS256 | localStorage côté client |
| Email | Nodemailer + SMTP Gmail | — | Port 587 STARTTLS |
| Upload fichiers | Multer | — | multipart/form-data, 200 Mo max |
| Frontend | HTML5 / CSS3 / JS vanilla | ES2020+ | Aucun framework |
| PDF côté client | jsPDF + html2canvas | CDN | Formulaire public |
| Hachage mot de passe | bcryptjs | — | Lazy migration depuis hash maison |

### 2.2 Structure des fichiers

```
C:\formation\
├── server.js                          ← Serveur Express — API complète (port 3001)
├── .env                               ← Variables d'environnement (DATA_SOURCE, PG_*, JWT_SECRET…)
├── schema_postgresql.sql              ← Schéma PG complet (12 tables, 3 vues) — idempotent
├── migrate.js                         ← Migration JSON → PG (idempotent, safe à relancer)
├── plan_controle.js                   ← Vérification JSON ↔ PG (8 sections) — outil diagnostic
├── nc-data.json                       ← ARCHIVE JSON — ne plus modifier (source = PostgreSQL)
├── nc-users.json                      ← Utilisateurs NC (rôles, hachages — sync PG)
├── nc-config.json                     ← Configuration dynamique (périmètres, sources, emails)
├── nc-parent-groups.json              ← Groupes NC parent-satellites (persistance cross-refresh)
├── ecosystem.config.js                ← Configuration PM2
└── NC/
    ├── index.html                     ← Formulaire public déclaration NC
    ├── login.html                     ← Page de connexion console
    ├── console.html                   ← Console d'administration (~4500+ lignes)
    ├── nc_parent_satellites.js        ← Module regroupement NC (~1600 lignes)
    ├── nc_parent_avance.js            ← Module rattachement avancé
    ├── nc_droits_pilote.js            ← Module droits chef produit / tableau de bord
    ├── nc_liste_accordeon.js          ← Module liste dépliable parent/satellites
    ├── nc_stats.js                    ← Module statistiques ISO §9.1 / §10.3
    ├── synoptique.html                ← Synoptique cycle de vie NC (documentation)
    ├── synoptique_nc_groupe.html      ← Documentation visuelle groupes parent 6 onglets
    ├── presentation.html              ← Notice d'utilisation (lien header badge 📖 Notice)
    ├── favicon.svg                    ← Icône
    ├── media/                         ← Médias uploadés (photos, PDF, vidéos)
    ├── PROMPT_MAINTENANCE_NC.txt      ← Guide de maintenance du module
    └── CAHIER_DES_CHARGES_NC.md      ← Ce document

D:\formation\                          ← Copie miroir synchronisée (robocopy)
D:\formation_backup_20260525_avant_postgres\  ← Backup 769 fichiers état 25/05/2026
```

### 2.3 Mode de persistance — DATA_SOURCE

Le serveur lit la variable `DATA_SOURCE` dans `.env` au démarrage :

| Valeur | Comportement | Statut |
|---|---|---|
| `json` | Tout depuis JSON (mode legacy) | Obsolète |
| `dual` | Écriture JSON + PG, lecture JSON | Mode transition — rollback rapide |
| `postgres` | **Tout depuis PostgreSQL** | **Mode actuel depuis 25/05/2026** |

**Mode postgres actuel** : toutes les lectures ET écritures passent par PG. `nc-data.json` est une archive historique — ne plus modifier manuellement.

**Procédure rollback rapide** (< 2 min) si problème PG :
1. `.env` → `DATA_SOURCE=dual`
2. `pm2 reload formation-sav --update-env`
3. Vérifier logs : `[pg] connecté (DATA_SOURCE=dual)`

### 2.4 Flux de données principal

```
Opérateur/Technicien
    │
    ▼ POST /api/nc
[Formulaire public index.html]
    │
    ▼ Email automatique (SMTP)
[Admin Qualité — console.html]
    │
    ├─► Analyse NC individuelle : 5P + Ishikawa + CAPA
    │       ▼
    │   [PostgreSQL nc_muller — source de vérité]
    │
    └─► Regroupement NC similaires [nc_parent_satellites.js]
            │
            ▼
        [NC Parent] → Analyse unique → CAPA → Clôture en cascade
            │
            ▼ Réponses actions
        [Chef Produit — nc_droits_pilote.js]
            │
            ▼ Email de réponse
        [Admin Qualité — validation finale]
```

### 2.5 Modèle de sécurité (Phase 1 active)

| Mesure | Détail | Statut |
|---|---|---|
| JWT HS256 | Secret via `JWT_SECRET` — token dans `localStorage` (clé `nc_token`) | ✅ actif |
| bcryptjs lazy migration | Détecte `$2b$/`$2a$` → bcrypt, sinon → hash legacy | ✅ actif |
| Rate limiting | 5 tentatives / 15 min / IP sur les 2 routes login | ✅ actif |
| Helmet | Headers XSS, clickjacking, MIME sniffing (CSP désactivé — Phase 4) | ✅ actif |
| JSON bloqués | `users.json`, `nc-users.json`, `nc-data.json`, `nc-config.json`, `nc-parent-groups.json`, `data.json` inaccessibles via URL | ✅ actif |
| dotenv | `.env` chargé au démarrage, jamais commité | ✅ actif |
| CORS | `*` actuellement — à restreindre domaine Cloudflare en Phase 4 | ⚠ Phase 4 |
| Helmet CSP | À activer en Phase 4 | ⚠ Phase 4 |
| trust proxy | `app.set('trust proxy',1)` — rate-limit par vraie IP client | ✅ actif (29/05/2026) |

---

## 3. PERSISTANCE DES DONNÉES

### 3.1 Architecture PostgreSQL — Base nc_muller

**Connexion** :
- Hôte : localhost (ou `PG_HOST`)
- Port : 5432 (ou `PG_PORT`)
- Base : `nc_muller`
- User : `postgres` / `PG_PASSWORD`

**12 tables, 3 vues** :

| Table | Rôle | Clé primaire |
|---|---|---|
| `app_users` | Utilisateurs application principale | `user_login` |
| `nc_users` | Utilisateurs NC (rôles, hachages) | `user_login` |
| `nc_compteurs` | Compteurs numérotation NC par année | `annee` |
| `nc_fiches` | Fiches NC (standards, parents, satellites) | `numero` |
| `nc_historique` | Journal cycle de vie NC | `id` BIGSERIAL |
| `nc_actions` | Actions CAPA | `id` TEXT (UUID Node) |
| `nc_action_historique` | Historique changements statut action | `id` BIGSERIAL |
| `nc_action_reponses` | Réponses des pilotes aux actions | `id` BIGSERIAL |
| `nc_action_relances` | Relances admin vers pilote | `id` BIGSERIAL |
| `nc_discussion` | Messages NC parent (admin ↔ pilote) | `id` BIGSERIAL |
| `nc_parent_journal` | Journal groupes parent (immuable) | `id` BIGSERIAL |
| `nc_parent_notifications` | Notifications NC parent | `id` BIGSERIAL |

**3 vues** :

| Vue | Rôle | Base ISO |
|---|---|---|
| `v_nc_reelles` | NC réelles = standards + parents (satellites exclus) | §9.1 |
| `v_kpi_perimetre` | KPI par périmètre (total, ouvertes, closes, délai moyen, coût) | §9.1 |
| `v_kpi_famille` | KPI par famille de produit | §9.1 |

### 3.2 Table nc_fiches — Champs complets

| Groupe | Colonnes clés |
|---|---|
| Identité | `numero` (PK), `created_at`, `updated_at` |
| Cycle de vie | `statut` (ouvert/en_cours/en_traitement/resolu/clos/non_pertinent/rattachee), `closed_at`, `clos_par`, `duree_total`, `duree_traitement`, `echeance_respectee` |
| Déclarant | `redacteur`, `email_redacteur`, `date_decouverte`, `decouvreur` |
| Périmètre | `perimetre`, `source_detection` |
| Produit | `no_commande`, `ref_produit`, `famille_produit`, `no_serie`, `version_prog`, `quantite_unites`, `sap_code` |
| Client | `nom_client`, `cp`, `ville`, `pays` |
| Contenu | `probleme`, `reparation`, `suggestion` |
| Médias | `media_files` JSONB, `media_files_traitement` JSONB |
| Qualification | `gravite`, `risque_impact` JSONB, `score_risque`, `cinq_pourquoi`, `cause_racine`, `ishikawa` JSONB, `type_cause`, `blocage_signale` |
| Traitement | `pilote`, `pilote_email`, `delai_action`, `cout` NUMERIC(10,2), `commentaire_cloture` |
| Relations | `is_parent` BOOLEAN, `is_satellite` BOOLEAN, `parent_id` FK, `satellites` TEXT[], `groupe_label`, `groupe_motif` |

### 3.3 Table nc_actions — Champs

| Colonne | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID généré côté Node (`ACT-YYYYMMDD-NNN-ncNumero`) |
| `nc_numero` | TEXT FK | Référence `nc_fiches.numero` ON DELETE CASCADE |
| `type` | TEXT | `immediate` / `curative` / `corrective` / `preventive` |
| `pilote` | TEXT | Nom du responsable (correspond à `nc_users.name`) |
| `echeance` | DATE | Date limite de réponse du pilote |
| `commentaire_action` | TEXT | Description de l'action attendue |
| `statut` | TEXT | `ouvert` / `en_cours` / `cloturé` |
| `date_pilote_reponse` | TIMESTAMPTZ | **Horodatage de la 1ère réponse du pilote** — utilisé pour déterminer le respect du délai |
| `echeance_respectee` | BOOLEAN | Calculé à la clôture |
| `created_at` / `created_by` | — | Traçabilité création |

**Règle "en retard réel" (ISO §10.2.1 — implémentée 29/05/2026)** :  
Une action est "en retard" **uniquement si** :
- `echeance < aujourd'hui`
- **ET** `date_pilote_reponse` est null OU `date_pilote_reponse > echeance`

Si `date_pilote_reponse <= echeance`, l'action est "**En attente de validation admin**", non imputable au pilote.

```javascript
// Filtre correct — console.html
const overdueActions = activeActions.filter(a =>
  a.echeance &&
  new Date(a.echeance) < now &&
  (!a.datePiloteReponse || new Date(a.datePiloteReponse) > new Date(a.echeance))
);
```

### 3.4 Synchronisation JSON ↔ PostgreSQL

`saveNC(data)` dans `server.js` :
1. Écrit atomiquement `nc-data.json` (via `atomicWriteSync`)
2. Si `pgPool` disponible → appelle `pgSyncFiche(nc)` pour chaque NC modifiée
3. `pgSyncFiche` : supprime et re-insère les tables nc_actions, nc_historique, nc_action_reponses, nc_action_relances, nc_action_historique

**Règle d'invariant** : Si un nouveau champ JSON est ajouté à une fiche NC, il **doit** être ajouté dans `pgSyncFiche()` ET dans `schema_postgresql.sql`.

### 3.5 Fichiers de persistance secondaires (JSON)

Ces fichiers sont lus directement depuis le disque — ils ne passent pas par PG pour l'instant :

| Fichier | Rôle | Modifiable |
|---|---|---|
| `nc-config.json` | Périmètres, sources, emails qualité, toggles notifications | Via API `/api/nc/config` |
| `nc-parent-groups.json` | Groupes parent-satellites et leurs journaux | Via API `/api/nc/parent-groups` |
| `nc-users.json` | Utilisateurs NC (sync PG au démarrage) | Via API `/api/nc-auth/users` |

### 3.6 Format du numéro NC

**Standard** : `AAMMJJ-NNNN` (ex. `260529-0009`)
- AA = 2 derniers chiffres de l'année
- MM = mois sur 2 chiffres
- JJ = jour sur 2 chiffres
- NNNN = compteur annuel sur 4 chiffres (remis à 0 le 1er janvier)

**Groupe parent** : `NC-P-NNNNN` (ex. `NC-P-00001`)
- Compteur indépendant dans `nc_compteurs.parent_valeur`

### 3.7 Outils de maintenance de la base

```bash
# Vérification complète JSON ↔ PG (8 sections) :
node plan_controle.js

# Resynchronisation complète JSON → PG (idempotent, safe à relancer) :
node migrate.js

# Backup manuel vers D:\ :
robocopy C:\formation D:\formation /MIR /XD node_modules /XF "*.log" "*.tmp"

# Service PostgreSQL :
net start "postgresql-x64-16"   # si arrêté
```

---

## 4. AUTHENTIFICATION ET GESTION DES RÔLES

### 4.1 Flux d'authentification

1. L'utilisateur accède à `/NC/login.html`
2. Saisit identifiant + mot de passe
3. `POST /api/nc-auth/login` → vérification hash bcrypt → génération JWT (scope `nc`)
4. JWT stocké dans `localStorage` (clé `nc_token`)
5. Toutes les requêtes API envoient `Authorization: Bearer <token>`
6. Le middleware `requireNCAuth` vérifie et décode le token
7. `req.ncUser` contient `{ user, name, email, role }`

### 4.2 Matrice des droits

| Action | nc_admin | nc_chef_produit (Pilote) | nc_chef_produit (Lecteur) | nc_lecteur |
|---|:---:|:---:|:---:|:---:|
| Voir la liste NC | Toutes NC | Ses NC uniquement¹ | Toutes NC² | Toutes NC |
| Ouvrir une fiche NC | ✅ | ✅ | ✅ | ✅ |
| Changer le statut NC | ✅ | ❌ | ❌ | ❌ |
| Assigner un pilote NC | ✅ | ❌ | ❌ | ❌ |
| Créer une action CAPA | ✅ | ❌ | ❌ | ❌ |
| Répondre à une action CAPA | ✅ | ✅ si assigné³ | ❌ | ❌ |
| Saisir analyse 5P + Ishikawa | ✅ | ❌ | ❌ | ❌ |
| Clôturer une NC | ✅ | ❌ | ❌ | ❌ |
| Créer un groupe parent | ✅ | ❌ | ❌ | ❌ |
| Ajouter des satellites | ✅ | ❌ | ❌ | ❌ |
| Voir tableau de bord personnel | ❌ | ✅ (Mes CAPA) | ✅ (KPI lecture) | ❌ |
| Basculer Pilote ↔ Lecteur | ❌ | ✅ (bouton ⇄) | ✅ (bouton ⇄) | ❌ |
| Accéder à la config | ✅ | ❌ | ❌ | ❌ |
| Exporter CSV | ✅ | ❌ | ❌ | ❌ |

¹ Filtre serveur : `nc.pilote === req.ncUser.name OR nc.actions.some(a => a.pilote === req.ncUser.name)`  
² Mode Lecteur : `GET /api/nc?viewAll=1` — filtre serveur désactivé ; JWT inchangé  
³ Condition : `a.pilote.toLowerCase() === session.name.toLowerCase()`

### 4.3 Routes d'authentification

| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/nc-auth/login` | — | Connexion → JWT |
| GET | `/api/nc-auth/users` | nc_admin | Liste des utilisateurs |
| GET | `/api/nc-auth/pilotes` | requireNCAuth | Liste des chefs produit |
| POST | `/api/nc-auth/users` | nc_admin | Créer utilisateur |
| PUT | `/api/nc-auth/users/:user` | nc_admin | Modifier utilisateur |
| PUT | `/api/nc-auth/users/:user/password` | requireNCAuth | Changer mot de passe |
| DELETE | `/api/nc-auth/users/:user` | nc_admin | Supprimer utilisateur |

### 4.4 Hachage des mots de passe — bcryptjs (Phase 1)

**Lazy migration bcrypt** : `verifyPass(plain, stored)` dans `server.js` :
```javascript
async function verifyPass(plain, stored) {
    if (stored.startsWith('$2b$') || stored.startsWith('$2a$')) {
        return bcrypt.compare(plain, stored);          // bcrypt
    }
    return hash(plain) === stored;                     // legacy — migré à la prochaine connexion
}
```

Au login réussi avec hash legacy → le hash est remplacé par un hash bcrypt (rounds=10) et sauvegardé automatiquement.

**⚠️ Pour production** : s'assurer que tous les utilisateurs se sont connectés au moins une fois après Phase 1 pour compléter la migration.

---

## 5. MODULE 1 — FORMULAIRE PUBLIC DE DÉCLARATION NC

**Fichier** : `C:\formation\NC\index.html`  
**URL** : `http://localhost:3001/NC/` ou `/NC/index.html`  
**Accès** : Sans authentification — tout opérateur ou technicien

### 5.1 Champs du formulaire

**Section Identification** :
| Champ | Type | Obligatoire | Description |
|---|---|:---:|---|
| Rédacteur | Texte | ✅ | Nom prénom de la personne qui déclare |
| Email rédacteur | Email | ✅ | Pour notification retour |
| Date de découverte | Date | ✅ | Date constatation NC |
| Découvreur | Texte | — | Si différent du rédacteur |
| Périmètre | Select | ✅ | Liste dynamique depuis `/api/nc/config/listes-publiques` |
| Source de détection | Select | ✅ | Idem liste dynamique |

**Section Produit** :
| Champ | Type | Obligatoire | Description |
|---|---|:---:|---|
| N° commande | Texte | — | Référence commande SAP |
| Référence produit | Texte | — | Référence article |
| Famille de produit | Select | ✅ | 31 familles (ANALYSEUR DE GAZ → SYSTÈME) — liste dynamique |
| N° de série | Texte | ✅ | SN produit (saisir NS si non sérialisé) |
| Version programme | Texte | — | Version logicielle si applicable |
| Quantité d'unités | Nombre | — | Nombre d'unités concernées |

**Section Client** :
| Champ | Type | Obligatoire | Description |
|---|---|:---:|---|
| Code SAP | Texte | ✅ | Code client SAP |
| Nom du client | Texte | — | Raison sociale |
| CP / Ville / Pays | Texte | — | Localisation |

**Section Problème** :
| Champ | Type | Obligatoire | Description |
|---|---|:---:|---|
| Description du problème | Textarea | ✅ | Caractérisation détaillée |
| Photos — Problème | Drop zone | — | JPEG, PNG, MP4, PDF — 200 Mo max/fichier |
| Réparation réalisée | Textarea | — | Action immédiate terrain |
| Suggestion | Textarea | — | Suggestion du déclarant |
| Photos — Traitement | Drop zone | — | Preuves d'action immédiate |

### 5.2 Listes dynamiques (chargées depuis l'API)

Toutes les listes dropdown sont chargées via `GET /api/nc/config/listes-publiques` au chargement de la page, avec un **fallback hardcodé** si l'API est indisponible :

- **31 familles produit** : ANALYSEUR DE GAZ, ANALYSEUR PARTICULES, BANC DE TEST, BOÎTIER BT…
- **7 périmètres** : Approvisionnement, Outillage, Production, Qualité, R&D/Bureau d'études, SAV, Ventes-Marketing
- **8 sources de détection**
- **27 types de cause**

### 5.3 Logique de soumission

1. Upload préalable des fichiers sur `/api/nc/upload-temp` (zone temporaire `NC/media/temp/`)
2. Génération PDF côté client (jsPDF + html2canvas) — encodé base64
3. `POST /api/nc` avec tous les champs + `mediaFiles[]` + `mediaFilesTraitement[]` + `pdfBase64`
4. Serveur : déplacement fichiers temp → `NC/media/{numero}/`
5. Attribution du numéro : format `AAMMJJ-NNNN`
6. Email automatique à `emailsQualite` avec CC au rédacteur (si email fourni)
7. Affichage écran de succès avec le numéro NC attribué

### 5.4 Consultation publique de suivi

`GET /api/nc/public/:numero` — sans authentification, données limitées :
- Numéro, date création, statut, nom client, référence produit
- Historique de statuts (sans les noms d'agents internes)

---

## 6. MODULE 2 — CONSOLE D'ADMINISTRATION NC

**Fichier** : `C:\formation\NC\console.html` (~4500+ lignes)  
**URL** : `http://localhost:3001/NC/console.html`  
**Accès** : Authentification obligatoire (tous rôles NC)

### 6.1 Structure de l'interface

**En-tête (header)** :
```
[Logo Muller Automotive]  [⚠ Console Non-Conformités]
[📖 Notice → /NC/presentation.html]   [v1 — 01/05/2026]   ← centré absolu
[id=hdr-user : Nom + badge rôle + ⇄ si nc_chef_produit]
[+ Nouvelle NC]  [← Accueil]  [Déconnexion]
```

L'interface est organisée en **5 onglets principaux** (`data-tab`) :

| Onglet | Nom | Contenu |
|---|---|---|
| `dashboard` | Tableau de bord | KPI globaux, alertes délai LNE-5, top pilotes, section perso Pilote |
| `liste` | Liste NC | Tableau filtrable + paginé, accordéon parent/satellites |
| `stats` | Statistiques | Graphiques, export CSV, KPI §10.3 |
| `config` | Configuration | Périmètres, sources, emails qualité, pilotes (admin) |
| `groupes` | Groupes NC | Gestion NC parent-satellites (admin uniquement) |

### 6.2 Tableau de bord — Onglet Dashboard

**KPI globaux** (cards en haut) :
- Total NC actives / En cours / Résolues / Clôturées / Non pertinentes
- Actions actives (ouvert + en cours)
- **Actions en retard** (filtre ISO §10.2.1 correct : `echeance dépassée ET pilote n'a pas répondu dans les délais`)
- Durée moyenne de traitement
- Taux de récurrence (familles avec ≥ 2 NC sur 6 mois)
- Coût total NC closes

**Définition "en retard" (ISO §10.2.1)** :  
Une action n'est comptée en retard **que si le pilote n'a pas répondu dans le délai imparti**. Si `datePiloteReponse <= echeance`, l'action est "En attente de validation admin" — elle n'est **pas** imputable au pilote et ne doit pas apparaître comme retard.

**Alertes LNE-5** :
- NC mineures sans analyse > 5 jours → badge orange
- NC majeures sans analyse > 48 heures → badge rouge

**Top pilotes** : Classement par nombre de CAPA actives et en retard réel.

**Section personnelle Pilote** (`id="dash-pilote-perso"`) :  
Visible uniquement en mode Pilote pour `nc_chef_produit`. Affiche les actions CAPA assignées avec bouton "Ouvrir" → `openModal(ncNumero)`.

### 6.3 Liste NC — Onglet Liste

**Colonnes du tableau** :
| Colonne | `data-col` | Description |
|---|---|---|
| N° NC | `numero` | Numéro cliquable + badges (parent/satellite/similarité) |
| Date | `createdAt` | Date de déclaration |
| Client | `nomClient` | Raison sociale |
| Famille | `familleProduit` | Famille produit |
| Périmètre | `perimetre` | SAV, Production, etc. |
| Source | `sourceDetection` | Contrôle, Retour client, etc. |
| Problème | `probleme` | Description tronquée à 70 caractères |
| Statut | `statut` | Badge coloré |
| Pilote | `pilote` | Pilote attribué + soulignement rouge si action en retard **réel** |
| Durée | `_duree` | Jours depuis création / durée totale si clos |
| Échéance | `_jours` | Badge J+/J- figé à la clôture, ou countdown si active |
| Gravité | `gravite` | Badge critique/majeure/mineure |

**Filtres disponibles** :
- Statut, Périmètre, Source de détection, Pilote, Gravité, Année, Date début/fin
- Recherche textuelle (numéro, client, référence, rédacteur, problème)
- Type NC (Toutes / Standards / NC Parents / Satellites)

### 6.4 Fiche NC — Modal renderModal()

Ouverture par clic sur une ligne du tableau → `window.openModal(numero)`.

**Structure** :
```
┌─────────────────────────────────────────────────────┐
│ En-tête : N° NC — Client — Statut — Gravité — Durée │
├─────────────────────────────────────────────────────┤
│ Section : Produit (famille, référence, N° série…)    │
├─────────────────────────────────────────────────────┤
│ Section : Client (SAP, nom, adresse)                 │
├─────────────────────────────────────────────────────┤
│ Section : Problème + photos + réparation             │
├─────────────────────────────────────────────────────┤
│ Section : Analyse causale (5P + Ishikawa SVG)        │
├─────────────────────────────────────────────────────┤
│ Section : Timeline chronologique                     │
│  Création | Statuts | Actions CAPA | Réponses pilote │
├─────────────────────────────────────────────────────┤
│ Section : Mise à jour (selon rôle et statut NC)      │
└─────────────────────────────────────────────────────┘
```

### 6.5 Cycle de vie des statuts NC

```
ouvert ──────────────────────► en_cours ──────────────► resolu ──────────► clos
   │                              │                        │
   └──────────────────────────────┴────────────────────────┴──► non_pertinent
                                  │
                                  └──► rattachee (si satellite d'un groupe parent)
```

**Transitions autorisées** (admin uniquement) :
| De | Vers | Conditions |
|---|---|---|
| ouvert | en_cours | Commentaire obligatoire |
| ouvert | non_pertinent | — |
| en_cours | resolu | Toutes actions CAPA clôturées |
| en_cours | non_pertinent | — |
| resolu | clos | Preuve d'efficacité ≥ 30 caractères |
| resolu | en_cours | Re-traitement nécessaire |
| clos | — | VERROUILLÉ définitivement |

**Transition automatique** : Quand toutes les actions d'une NC passent à `cloturé`, la NC passe automatiquement de `en_cours` à `resolu` (côté serveur, `checkAutoTransition()`).

### 6.6 Actions CAPA — Cycle de vie

**4 types d'action** :

| Type | Label | Description ISO |
|---|---|---|
| `immediate` | Immédiate | Correction pour stopper l'impact immédiat (§10.2.1a) |
| `curative` | Curative | Traitement du problème constaté |
| `corrective` | Corrective | Élimination de la cause racine (§10.2.1c) |
| `preventive` | Préventive | Prévention de l'apparition (§10.3) |

**Cycle de vie action** : `ouvert → en_cours → cloturé`

**3 types de réponses** (champ `type` dans `reponsesActions[]`) :

| Type | Icône | Couleur | Description |
|---|---|---|---|
| `reponse_pilote` | 💬 | vert | Réponse normale du pilote |
| `retour_admin` | ↩ | violet | Retour admin au pilote |
| `reponse_admin` | 🔒 | orange | Réponse forcée admin (`force:true`) si pilote absent |

**Badge cadenas** : Affiché sur une action quand `statut='en_cours'` et `datePiloteReponse` renseigné — signifie "répondu, en attente de validation admin".

### 6.7 Analyse causale — 5 Pourquoi + Ishikawa

**5 Pourquoi** :
- Champs P1 → P5, P5 surligné en rouge (cause racine — facteur systémique LNE-1)
- Sauvegarde : `PATCH /api/nc/:numero/meta` → `nc.cinqPourquoi`

**Ishikawa** :
- 6 branches : Matière, Méthode, Milieu, Machine, Main d'œuvre, Management
- Visualisation SVG générée dynamiquement (`renderIshikawaSVG(nc)`)
- Sauvegarde : `PATCH /api/nc/:numero/meta` → `nc.ishikawa`

### 6.8 Constantes globales console.html

Ces constantes sont **déclarées globalement** (après les `const SL`) et accessibles par tous les modules chargés :

```javascript
const SL           // labels statuts NC colorés
const capaLabel    // { immediate:'Immédiate', curative:'Curative', corrective:'Corrective', preventive:'Préventive' }
const ROLE_LABELS  // { nc_admin, nc_chef_produit:'Pilote', nc_lecteur, nc_viewer }
const COLS         // définition colonnes tableau liste NC
const PILOTES_LIST // liste des pilotes chargée depuis /api/nc-auth/pilotes
const ASTAT_COL    // couleurs statuts actions
```

---

## 7. MODULE 3 — NC PARENT-SATELLITES

**Fichier** : `C:\formation\NC\nc_parent_satellites.js` (~1600 lignes)  
**Exposé via** : `window.NcParent`

### 7.1 Concept métier

Quand plusieurs NC de périmètres différents présentent le même défaut, l'admin qualité les regroupe sous une **NC parent**. L'analyse (5P, Ishikawa, CAPA) est menée une seule fois sur la NC parent. La clôture est en cascade sur tous les satellites.

### 7.2 Règles de gestion du module

| ID | Règle |
|---|---|
| RG-01 | Seul `nc_admin` peut créer/modifier/clôturer un groupe |
| RG-02 | Minimum 2 NC requises pour créer un groupe |
| RG-03 | Libellé groupe non vide |
| RG-04 | Une NC ne peut appartenir qu'à un seul groupe ouvert à la fois |
| RG-05 | Les satellites sont verrouillés (statut `rattachee`) tant que le parent est ouvert |
| RG-06 | La clôture du parent déclenche automatiquement la clôture de tous les satellites |
| RG-07 | Aucun email au chef produit lors de la CRÉATION du groupe parent |
| RG-08 | Le journal d'audit du groupe est immuable (appends only) |

### 7.3 Numérotation NC parent

Format : `NC-P-NNNNN` (compteur indépendant dans `nc_compteurs.parent_valeur`).  
Exemple : `NC-P-00001`

### 7.4 Store — API publique window.NcParent

```javascript
window.NcParent = {
  Store: {
    parentGroups: [],
    load(),              // GET /api/nc/parent-groups
    save(),              // PUT /api/nc/parent-groups
    getGroup(id),
    getSatellites(parentId),
    nextId()             // génère NC-P-NNNNN
  },
  Business: {
    creerGroupe({ label, nc_ids, motif, admin_email }),
    ajouterSatellites({ parent_id, nc_ids, motif, admin_email }),
    detacherSatellite({ parent_id, nc_id, motif, admin_email }),
    cloturerGroupe({ parent_id, preuve, clos_par })
  }
}
```

### 7.5 Opérations métier principales

**creerGroupe** :
1. Validation (libellé non vide, ≥ 2 NC, RG-04)
2. Famille auto-héritée des satellites (400 si aucune famille)
3. Marquage satellites : `is_satellite=true`, `statut='rattachee'`, `parent_id=grp.id`, `_statut_avant` sauvegardé
4. Journal : `GROUPE_CREE`

**detacherSatellite** :
1. Restauration statut : `_statut_avant || 'en_cours'`
2. Réinitialisation flags `is_satellite=false`, `parent_id=null`
3. Journal : `SATELLITE_DETACHE`
4. Route API : `DELETE /api/nc/:parentNumero/satellites/:nc_id`

**cloturerGroupe** :
1. Vérification preuve d'efficacité non vide (LNE-2)
2. Clôture en cascade de tous les satellites
3. Notification email individuelle à chaque déclarant
4. Journal : `GROUPE_CLOS`

### 7.6 Badges dans la liste NC

| Type NC | Badge | Onclick |
|---|---|---|
| Parent | `◆ PARENT (N)` bleu | Admin : modal gestion ; Chef produit : fiche NC parent |
| Satellite | `→ NC-P-XXXXX` gris | Admin : modal gestion parent |
| Similarité | `⚠ 85%` ambre | Admin : modal rattachement tardif |

---

## 8. MODULE 4 — RATTACHEMENT AVANCÉ ET POST-CLÔTURE

**Fichier** : `C:\formation\NC\nc_parent_avance.js`  
**Exposé via** : `window.NcParentAvance`

### 8.1 Moteur de similarité (score /100)

| Critère | Points |
|---|:---:|
| Famille de produit identique | 35 |
| Famille partiellement commune (5 premiers caractères) | 15 |
| Référence produit identique | 25 |
| N° de lot identique | 20 |
| N° de lot similaire (4 premiers caractères) | 10 |
| Fournisseur identique | 15 |
| Type de cause identique | 10 |
| Même mois de création | 5 |
| **Seuil de déclenchement** | **≥ 60** |

### 8.2 Fenêtres de veille post-clôture

| Gravité | Fenêtre |
|---|---|
| Critique | 180 jours |
| Majeure | 90 jours |
| Mineure | 30 jours |

### 8.3 Scénarios

**Scénario A — Rattachement tardif** (groupe ouvert) :  
Badge `⚠ 85%` dans la liste → modal proposant le rattachement → `NcParent.ajouterSatellites()`

**Scénario B — NC post-clôture** (groupe fermé dans la fenêtre de veille) :  
Modal "Groupe similaire clôturé détecté" → choix : NC résiduelle OU réouverture du groupe

---

## 9. MODULE 5 — DROITS PILOTE ET DOUBLE PROFIL

**Fichier** : `C:\formation\NC\nc_droits_pilote.js`  
**Exposé via** : `window.NcDroits`

### 9.1 Double profil Pilote ↔ Lecteur

Le rôle `nc_chef_produit` dispose d'un double profil via le bouton `⇄` dans l'en-tête :

| Variable | Valeur mode Pilote | Valeur mode Lecteur |
|---|---|---|
| `_viewRole` | `nc_chef_produit` | `nc_lecteur` |
| `GET /api/nc` | Sans paramètre | `?viewAll=1` |
| Bannière (`id="mode-banner"`) | Fond vert "🎯 Mode Pilote" | Fond gris "👁 Mode Lecteur" |
| Section dashboard perso | Affichée | Masquée |

Le JWT est **inchangé** côté serveur — sécurité garantie.

### 9.2 Vérification des droits

```javascript
// peutRepondreAction — nc_droits_pilote.js
function peutRepondreAction(action, userEmail) {
  if (isAdmin()) return true;
  if (isChef() || isPilote()) {
    const resp = action.pilote_email || action.responsable_email || action.pilote || '';
    return resp.toLowerCase() === (userEmail || '').toLowerCase();
  }
  return false;
}
```

### 9.3 Fonctions clés (déclarées dans console.html)

| Fonction | Rôle |
|---|---|
| `renderHeader()` | Badge rôle + bouton ⇄ si `nc_chef_produit` |
| `renderModeBanner()` | Bannière verte (Pilote) ou grise (Lecteur) |
| `renderDashboardPilote()` | Section "Mes actions CAPA" (masquée en mode Lecteur) |
| `toggleViewRole()` | Bascule `_viewRole` + recharge `loadNC()` |

---

## 10. MODULE 6 — LISTE ACCORDÉON DÉPLIABLE

**Fichier** : `C:\formation\NC\nc_liste_accordeon.js`  
**Exposé via** : `window.NcListe`

### 10.1 Principe

Après chaque `renderTable`, enrichit les lignes :
- **NC parent** : badge `◆ PARENT [N▼]` cliquable, sous-info périmètres
- **NC satellite** : masquée par défaut, indentation visuelle

`NcListe.toggle(parentId)` : déplie/replie les satellites avec animation CSS.

### 10.2 Filtre par type

Select injecté dans la barre de filtres :
```
Toutes NC | Standards uniquement | NC Parents | Satellites
```

### 10.3 Patch renderTable (chaîne de patches)

Chaque module externe patche `window.renderTable` en conservant les patches précédents :
- `renderTable._ncpaPatch` — nc_parent_satellites
- `renderTable._ncdPatch` — nc_droits_pilote
- `renderTable._nclaP` — nc_liste_accordeon

---

## 11. MODULE 7 — AIDE NORMATIVE CONTEXTUELLE

**Intégré dans** : `console.html` (IIFE `NCAide`)  
**Exposé via** : `window.NCAide`

### 11.1 Comportement

Boutons `?` (16×16px, bleu) injectés à droite de chaque `<label>` dans la fiche NC.  
Clic → modal latérale glissante avec références §ISO + points LNE + code couleur.

`NCAide.openRef(code)` : navigation directe vers un §ISO depuis le synoptique.

### 11.2 Référentiels couverts

**ISO 9001:2015** : §5.3, §6.1, §8.5.2, §8.7, §10.2, §10.2.1a-e, §10.2.2, §10.3

**Points LNE critiques** :
| Code | Exigence |
|---|---|
| LNE-1 | Cause racine = facteur systémique actionnable (pas une catégorie) |
| LNE-2 | Preuve efficacité = pièce jointe + réponse responsable tracée |
| LNE-3 | Score de risque documenté |
| LNE-4 | Journal audit immuable — qui/quoi/quand |
| LNE-5 | Alerte délai analyse (5j mineure / 48h majeure) |

---

## 12. MODULE 8 — STATISTIQUES NC

**Fichier** : `C:\formation\NC\nc_stats.js`  
**Exposé via** : `window.NcStats`

### 12.1 Principe ISO §9.1 — Exclusion des satellites

```
NC réelles (KPI) = NC standards + NC parents (satellites EXCLUS)
Coût NQ          = TOUS les enregistrements (vrai coût économique)
Efficacité CAPA  = calculée sur parents + standards (pas ×N)
```

### 12.2 API publique

```javascript
window.NcStats = {
  nc_reelles(toutes),       // standards + parents, satellites exclus
  nc_satellites(toutes),    // satellites uniquement
  nc_parents(toutes),       // NC systémiques
  nc_standards(toutes),     // ni parent, ni satellite

  kpi_base(toutes),         // { total, ouvertes, encours, closes, taux_cloture }
  kpi_delais(toutes),       // { delai_moyen_j, taux_echeances, nc_en_retard[] }
  kpi_capa(toutes),         // { total_actions, en_retard, taux_respect, par_type }
  kpi_qualite(toutes),      // §10.3 : nb_systemiques, taux_groupement, satellites_moyen
  kpi_couts(toutes),        // cout_total, cout_moyen, par_perimetre
}
```

### 12.3 KPI §10.3 supplémentaires

| KPI | Formule |
|---|---|
| `nb_systemiques` | Nombre de NC parents actifs |
| `taux_groupement` | NC parents / NC réelles × 100 |
| `satellites_moyen` | Nombre moyen de satellites par parent |

---

## 13. SYSTÈME DE NOTIFICATIONS EMAIL

### 13.1 Configuration SMTP

| Paramètre | Valeur |
|---|---|
| Hôte | `smtp.gmail.com` |
| Port | 587 (STARTTLS) |
| Expéditeur | `formations.muller@gmail.com` |
| Destinataires qualité | `mavet@mullerautomotive.fr` + `emailsQualite[]` depuis `nc-config.json` |
| Mot de passe | `process.env.MAIL_PASS` — ne jamais coder en dur |

### 13.2 Emails déclenchés

| Événement | Route | Destinataires | Toggle |
|---|---|---|:---:|
| Création NC | `POST /api/nc` | Emails qualité + CC rédacteur | `creationNC` |
| Changement statut | `PUT /api/nc/:numero/status` | Emails qualité + rédacteur | `changementStatut` |
| Nouvelle action CAPA | `POST /api/nc/:numero/actions` | Pilote (via map PILOTES) | `nouvelleAction` |
| Réponse pilote | `POST /api/nc/action/:id/reponse-pilote` | Emails qualité | `reponsePilote` |
| Relance pilote | `POST /api/nc/action/:id/relance` | Pilote | toujours |
| Clôture NC | `PUT /api/nc/:numero/status` (clos) | Rédacteur | configurable |
| Clôture groupe parent | Business.cloturerGroupe() | Déclarants de chaque satellite | configurable |

### 13.3 Map pilotes → emails

Définie dans `server.js` → maintenir à jour si changement :
```javascript
const PILOTES = {
    'Anne-Sophie Costa':   'anne-sophie.costa@mullerautomotive.fr',
    'Emilie Legros':       'emilie.legros@mullerautomotive.fr',
    // ... liste complète dans server.js
};
```

---

## 14. API REST — ROUTES COMPLÈTES

### ⚠️ Règle invariante d'ordre des routes

Les routes spécifiques doivent être définies **AVANT** les wildcards dans `server.js` :
```javascript
app.get('/api/nc/version', ...)          // Spécifique
app.get('/api/nc/config', ...)           // Spécifique
app.get('/api/nc/parent-groups', ...)    // Spécifique — AVANT /:numero
app.get('/api/nc/stats/...', ...)        // Spécifique
app.get('/api/nc/:numero', ...)          // Wildcard — EN DERNIER
```

### 14.1 Routes publiques (sans authentification)

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/nc` | Créer une nouvelle déclaration NC |
| GET | `/api/nc/public/:numero` | Suivi public (données limitées) |
| GET | `/api/nc/config/listes-publiques` | Familles, périmètres, sources, types cause |
| POST | `/api/nc/upload-temp` | Upload fichier temporaire (multipart) |

### 14.2 Routes authentifiées (tous rôles NC)

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/nc` | Liste NC (filtrée selon rôle + `?viewAll=1`) |
| GET | `/api/nc/version` | mtime nc-data.json (polling léger) |
| GET | `/api/nc/config` | Configuration système |
| GET | `/api/nc/config/listes` | Périmètres + sources (auth) |
| GET | `/api/nc/parent-groups` | Groupes NC parent |
| GET | `/api/nc/stats/perimetre-source` | Stats agrégées |
| GET | `/api/nc/:numero` | Détail complet d'une NC |
| POST | `/api/nc/:numero/reponse-pilote` | Réponse legacy pilote (NC sans action) |
| POST | `/api/nc/action/:id/reponse-pilote` | Réponse pilote à une action CAPA |
| POST | `/api/nc/parent-groups/:groupId/action/:actionId/reponse-pilote` | Réponse pilote action groupe parent |

### 14.3 Routes admin NC (nc_admin uniquement)

| Méthode | Route | Description |
|---|---|---|
| PUT | `/api/nc/:numero/status` | Changer statut NC + champs qualité |
| PATCH | `/api/nc/:numero/meta` | Champs libres qualité (sans changement statut) |
| PUT | `/api/nc/parent-groups` | Sauvegarder groupes NC parent |
| PUT | `/api/nc/parent-groups` (body complet) | Mise à jour groupe (analyse 5P, CAPA, clôture) |
| POST | `/api/nc/parent-groups/notify-email` | Envoyer email via groupe parent |
| POST | `/api/nc/create-parent-group` | Créer un groupe NC parent |
| PUT | `/api/nc/add-satellite/:numero` | Ajouter une NC comme satellite |
| DELETE | `/api/nc/:parentNumero/satellites/:nc_id` | Détacher un satellite (restaure `_statut_avant`) |
| POST | `/api/nc/:numero/actions` | Créer une action CAPA |
| PUT | `/api/nc/action/:id/statut` | Changer statut action |
| PUT | `/api/nc/action/:id/echeance` | Modifier échéance action (tracé) |
| DELETE | `/api/nc/action/:id` | Supprimer une action |
| POST | `/api/nc/action/:id/relance` | Relancer le pilote par email |
| PUT | `/api/nc/config` | Sauvegarder configuration |
| POST | `/api/nc/config/perimetres` | Ajouter un périmètre |
| DELETE | `/api/nc/config/perimetres/:valeur` | Supprimer un périmètre |
| POST | `/api/nc/config/sources` | Ajouter une source |
| DELETE | `/api/nc/config/sources/:valeur` | Supprimer une source |
| POST | `/api/nc/config/test-email` | Tester configuration SMTP |
| GET | `/api/nc/export/csv` | Export CSV des NC |
| GET | `/api/nc/:numero/print` | Vue impression fiche NC |
| GET | `/api/nc/export/print-all` | Impression toutes NC |

### 14.4 Routes d'authentification

| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/nc-auth/login` | — | Connexion → JWT |
| GET | `/api/nc-auth/users` | nc_admin | Liste utilisateurs |
| GET | `/api/nc-auth/pilotes` | requireNCAuth | Liste pilotes |
| POST | `/api/nc-auth/users` | nc_admin | Créer utilisateur |
| PUT | `/api/nc-auth/users/:user` | nc_admin | Modifier utilisateur |
| PUT | `/api/nc-auth/users/:user/password` | requireNCAuth | Changer mot de passe |
| DELETE | `/api/nc-auth/users/:user` | nc_admin | Supprimer utilisateur |

---

## 15. RÈGLES DE GESTION (RG-XX)

### 15.1 Module NC de base

| ID | Règle |
|---|---|
| RG-B01 | NC clôturée = immuable — aucune modification statut |
| RG-B02 | Preuve d'efficacité ≥ 30 caractères — blocage clôture sinon |
| RG-B03 | Famille de produit obligatoire à la déclaration — rejet 400 |
| RG-B04 | Description du problème obligatoire — rejet 400 |
| RG-B05 | Transition automatique en_cours→resolu si toutes actions clôturées (côté serveur) |
| RG-B06 | `dureeTotal`, `dureeTraitement`, `echeanceRespectee` calculés à la clôture |
| RG-B07 | `date_pilote_reponse <= echeance` → action "en attente validation", **non comptée "en retard"** (ISO §10.2.1) |

### 15.2 Module NC Parent-Satellites

| ID | Règle |
|---|---|
| RG-01 | Admin uniquement pour créer/modifier/clôturer un groupe |
| RG-02 | Minimum 2 NC dans un groupe |
| RG-03 | Libellé groupe non vide |
| RG-04 | NC dans un seul groupe ouvert à la fois |
| RG-05 | Satellites verrouillés (statut rattachee) |
| RG-06 | Clôture cascade automatique |
| RG-07 | Pas d'email pilote à la création du groupe |
| RG-08 | Journal groupe immuable (appends only) |

### 15.3 Module Droits Pilote

| ID | Règle |
|---|---|
| RG-D01 | Chef produit ne voit que ses NC sur la liste (filtre serveur) |
| RG-D02 | Comparaison nom pilote insensible à la casse (`_piloteMatch`) |
| RG-D03 | `peutRepondreAction()` vérifié avant toute réponse (ISO §5.3) |
| RG-D04 | Serveur valide `nc_chef_produit` avant `/reponse-pilote` (HTTP 403 sinon) |
| RG-D05 | `?viewAll=1` contourne le filtre pilote seulement pour `nc_chef_produit` — JWT toujours vérifié |
| RG-D06 | `const capaLabel` déclaré globalement dans `console.html` — ReferenceError si local dans `renderModal` |

### 15.4 Module PostgreSQL

| ID | Règle |
|---|---|
| RG-PG01 | Tout nouveau champ JSON → ajouté dans `pgSyncFiche()` ET `schema_postgresql.sql` |
| RG-PG02 | Après modification `server.js` : `pm2 reload formation-sav --update-env` (--update-env obligatoire) |
| RG-PG03 | Journal d'audit immuable — ne jamais supprimer une entrée `nc_historique` ou `nc_parent_journal` |
| RG-PG04 | En cas de suspicion d'écart PG : relancer `node plan_controle.js` puis `node migrate.js` |

---

## 16. POINTS DE CONFORMITÉ ISO 9001:2015 / LNE

### 16.1 Couverture ISO 9001:2015

| Article | Exigence | Implémentation |
|---|---|---|
| §5.3 | Rôles, responsabilités, autorités | Système de rôles JWT (admin/chef produit/lecteur) |
| §6.1 | Risques et opportunités | Champs `scoreRisque`, `risqueImpact` |
| §8.5.2 | Identification et traçabilité | Numéro NC unique format AAMMJJ-NNNN |
| §8.7 | Maîtrise des éléments non conformes | Statuts + verrouillage clos |
| §10.2 | Non-conformité et action corrective | Cycle de vie complet NC + CAPA |
| §10.2.1a | Correction immédiate | Champ `reparation` formulaire public + action `immediate` |
| §10.2.1b | Analyse de cause | 5 Pourquoi + Ishikawa |
| §10.2.1c | Actions correctives/préventives | 4 types d'actions CAPA |
| §10.2.1e | Preuve d'efficacité | Champ obligatoire ≥ 30 car. + pièce jointe |
| §10.2.2 | Informations documentées | Journal audit immuable `nc_historique` + `nc_parent_journal` |
| §10.3 | Amélioration continue | Stats `nc_stats.js`, KPI taux groupement, export CSV |

### 16.2 Points LNE critiques

| Code | Exigence | Implémentation |
|---|---|---|
| LNE-1 | Cause racine = facteur systémique | P5 surligné rouge + aide contextuelle NCAide |
| LNE-2 | Preuve efficacité = PJ + réponse tracée | Upload médias + `reponsesActions[]` |
| LNE-3 | Score de risque documenté | `scoreRisque` + `risqueImpact` |
| LNE-4 | Journal audit immuable | `nc_historique` + `_journal[]` groupes — appends only |
| LNE-5 | Alerte délai analyse | Dashboard badge rouge/orange selon gravité et âge NC |

### 16.3 Champs de traçabilité obligatoires

Chaque modification produit une entrée dans `nc_historique` (PG) :
```json
{ "action": "NOM_ACTION", "nc_id": "260506-0012", "by": "admin@muller.fr", "ts": "2026-05-06T15:00:00.000Z" }
```

Actions journalisées :
`GROUPE_CREE`, `SATELLITE_AJOUTE`, `SATELLITE_DETACHE`, `GROUPE_CLOS`, `PILOTE_ATTRIBUE`, `ACTION_CREE`, `REPONSE_PILOTE`, `RELANCE_ENVOYEE`, `STATUT_CHANGE`, `ECHEANCE_MODIFIEE`, `ANALYSE_5P_SAUVEE`, `ISHIKAWA_SAUVE`

---

## 17. INFRASTRUCTURE ET DÉPLOIEMENT

### 17.1 Configuration PostgreSQL locale

| Paramètre | Valeur |
|---|---|
| Service Windows | `postgresql-x64-16` (démarrage automatique) |
| Base | `nc_muller` |
| Schéma | `public` |
| User | `postgres` |
| Mot de passe | `PG_PASSWORD` dans `.env` |
| Port | 5432 (ou `PG_PORT`) |

### 17.2 Variables d'environnement (`.env`)

| Variable | Description | Obligatoire |
|---|---|:---:|
| `DATA_SOURCE` | `postgres` / `dual` / `json` | ✅ |
| `PG_HOST` | Hôte PostgreSQL | ✅ |
| `PG_PORT` | Port PostgreSQL (défaut 5432) | — |
| `PG_USER` | Utilisateur PostgreSQL | ✅ |
| `PG_PASSWORD` | Mot de passe PostgreSQL | ✅ |
| `PG_DB` | Nom de la base | ✅ |
| `JWT_SECRET` | Clé 64 chars aléatoire — actif depuis 29/05/2026 | ✅ Actif |
| `MAIL_PASS` | Mot de passe SMTP Gmail | ✅ |
| `PORT` | Port d'écoute Node (défaut 3001) | — |

### 17.3 Démarrage et commandes PM2

```bash
# Démarrage initial
pm2 start ecosystem.config.js
pm2 save

# Rechargement après modification server.js (--update-env OBLIGATOIRE)
pm2 reload formation-sav --update-env

# Diagnostic
pm2 list
pm2 logs formation-sav --lines 20 --nostream
```

**Process PM2 en cours** :
| ID | Nom | Port | Rôle |
|---|---|---|---|
| 0 | lilinart-site | — | Site Lilin'ART |
| 1 | formation-sav | 3001 | Module NC (ce système) |
| 2 | certificat-conformite | — | Certificats de conformité |

### 17.4 Nginx — Proxy inverse

Nginx (port 80/443) → Node.js (port 3001) :
- `/NC/*` → `http://127.0.0.1:3001/NC/`
- `/api/nc/*` → `http://127.0.0.1:3001/api/nc/`

Configuration : `C:\tools\nginx-1.29.7\conf\`

### 17.5 Backup

**Backup automatique miroir** :
```bash
robocopy C:\formation D:\formation /MIR /XD node_modules /XF "*.log" "*.tmp"
```

**Backup de retour arrière disponible** :
`D:\formation_backup_20260525_avant_postgres\` — 769 fichiers, 702 Mo, état au 25/05/2026

**Restauration fichier unique** :
```bash
copy "D:\formation_backup_20260525_avant_postgres\server.js" "C:\formation\server.js"
```

**Restauration complète** :
```bash
robocopy D:\formation_backup_20260525_avant_postgres C:\formation /MIR /XD node_modules
```

### 17.6 Ordre de chargement des scripts dans console.html

```html
<script src="nc_parent_satellites.js"></script>   <!-- 1 — window.NcParent -->
<script src="nc_parent_avance.js"></script>        <!-- 2 — window.NcParentAvance -->
<script src="nc_droits_pilote.js"></script>        <!-- 3 — window.NcDroits -->
<script src="nc_liste_accordeon.js"></script>      <!-- 4 — window.NcListe -->
<script src="nc_stats.js"></script>                <!-- 5 — window.NcStats -->
```

### 17.7 Diagnostic rapide

```bash
# Vérifier que le serveur tourne
netstat -ano | findstr :3001      # → un seul PID attendu
pm2 list                          # → formation-sav online

# Vérifier la cohérence JSON ↔ PG
node plan_controle.js             # → 8 sections TOUT VERT

# Resynchroniser si écart détecté
node migrate.js
```

---

## 18. ÉVOLUTIONS PLANIFIÉES

### 18.1 Phase 3 — Surveillance production postgres (mai 2026)

**Statut : EN COURS**

- Surveiller `pm2 logs formation-sav` après chaque opération utilisateur
- Relancer `node plan_controle.js` si suspicion d'écart
- En cas d'anomalie : rollback dual (voir §2.3)

### 18.2 Phase 4 — Sécurité renforcée (fin mai / début juin 2026)

| Action | Détail technique | Priorité |
|---|---|---|
| `pg_dump` automatique | Tâche planifiée Windows — dump quotidien `nc_muller` vers `D:\backups\pg\` | Haute |
| CORS restrict | Remplacer `*` par le domaine Cloudflare dans `server.js` | Haute |
| Helmet CSP | Activer `contentSecurityPolicy` avec directives adaptées (sources CDN whitelist) | Moyenne |
| ~~trust proxy fix~~ | ✅ Fait le 29/05/2026 | — |

**Détail pg_dump** :
```bat
@echo off
set PGPASSWORD=<PG_PASSWORD>
set BACKUP_DIR=D:\backups\pg
set DATE_STR=%date:~6,4%-%date:~3,2%-%date:~0,2%
"C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U postgres -d nc_muller -F c -f "%BACKUP_DIR%\nc_muller_%DATE_STR%.dump"
```
À planifier via Tâche planifiée Windows, déclenchement quotidien à 2h.

### 18.3 Déploiement OVH (juin 2026)

Référence complète : `D:\formation\RAPPORT_TECHNIQUE_IT_NC.html`

| Étape | Action | Notes |
|---|---|---|
| Base de données | PostgreSQL OVH (Managed DB ou VPS dédié) | Adapter `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DB` dans `.env` |
| DATA_SOURCE | `postgres` en production OVH | Idem configuration locale actuelle |
| SMTP | Configurer `@mullerautomotive.fr` (Outlook/Exchange OVH) | Remplacer Gmail SMTP |
| JWT_SECRET | ✅ Clé 64 chars active depuis 29/05/2026 — voir `SECRETS_DEPLOIEMENT_NC.txt` | Fait |
| Fichiers sensibles | Supprimer `nc-data.json`, `nc-users.json` du dépôt OVH | Source = PG uniquement |
| Nginx | Reverse proxy + Let's Encrypt SSL | Configuration standard |
| PM2 | `pm2 startup` pour redémarrage automatique | |
| Sécurité | CORS restreint, Helmet CSP actif (trust proxy ✅ déjà fait) | Phase 4 préalable |

**JWT_SECRET — clé 64 chars aléatoire active depuis 29/05/2026** (sauvegardée dans `C:\Users\MULLER\Documents\SECRETS_DEPLOIEMENT_NC.txt`).

### 18.4 Évolutions fonctionnelles futures (backlog)

| Fonctionnalité | Valeur métier | Priorité |
|---|---|---|
| Tableau de bord KPI exportable (PDF/Excel) | Revue de direction §9.1.3 | Haute |
| Alertes email automatiques LNE-5 (délai analyse dépassé) | Actuellement seulement visuel | Haute |
| Validation IA de la cause racine (P5) | Aide LNE-1 | Moyenne |
| QR Code suivi public par NC | Traçabilité client | Moyenne |
| API webhook sortante (ERP SAP) | Intégration SI | Basse |
| Application mobile (PWA) | Terrain sans PC | Basse |

---

## 19. GLOSSAIRE

| Terme | Définition |
|---|---|
| NC | Non-Conformité — écart par rapport à une exigence |
| CAPA | Corrective and Preventive Action — actions correctives et préventives |
| NC Parent | NC regroupant plusieurs NC similaires de différents périmètres — analyse unique |
| NC Satellite | NC rattachée à une NC parent, statut verrouillé à `rattachee` |
| Pilote | Responsable désigné pour traiter les actions CAPA d'une NC |
| Chef produit | Rôle applicatif = pilote pouvant répondre à ses CAPA assignées + double profil |
| Périmètre | Service ou département où la NC a été découverte (SAV, Production, etc.) |
| Cause racine | Facteur systémique à l'origine de la NC (P5 du 5 Pourquoi) |
| Preuve d'efficacité | Document ou mesure démontrant que la CAPA a corrigé le problème |
| Journal d'audit | Trace chronologique immuable de toutes les opérations |
| Score de similarité | Score /100 évaluant la ressemblance entre deux NC |
| Fenêtre de veille | Durée après clôture pendant laquelle un groupe reste pertinent |
| DATA_SOURCE | Variable `.env` : `postgres` / `dual` / `json` — contrôle la source de vérité |
| pgSyncFiche() | Fonction `server.js` : synchronise une fiche NC complète vers PostgreSQL |
| plan_controle.js | Outil de vérification 8 sections JSON ↔ PG — ne modifie rien |
| migrate.js | Migration idempotente JSON → PG — safe à relancer |
| nc_muller | Base PostgreSQL 16 — 12 tables, 3 vues |
| En retard réel | Action dont `date_pilote_reponse` est null ET `echeance` dépassée (ISO §10.2.1) |
| En attente validation | Action dont le pilote a répondu dans les délais, en attente de validation admin |
| datePiloteReponse | Horodatage JSON (camelCase) de la 1ère réponse du pilote — `date_pilote_reponse` en PG |
| Lazy migration | Mise à jour progressive des hachages legacy → bcrypt au fil des connexions |
| PM2 | Gestionnaire de processus Node.js — process `formation-sav` port 3001 |
| PILOTES_LIST | Liste chargée depuis `/api/nc-auth/pilotes` — pilotes disponibles |
| RG-XX | Règle de gestion métier numérotée |
| LNE | Laboratoire National de métrologie et d'Essais — organisme certificateur |
| nc_stats.js | Module ISO §9.1 — comptage correct excluant satellites, KPI §10.3 |

---

*Document technique v4.0 — Muller Automotive NC System — 29/05/2026*

**Nouveautés v4.0** :
- Architecture PostgreSQL 16 comme source de vérité unique (`DATA_SOURCE=postgres` depuis 25/05/2026)
- Schéma PG complet documenté (12 tables, 3 vues, index, commentaires ISO)
- Correction filtre "en retard réel" ISO §10.2.1 (`datePiloteReponse` — 6 points dans `console.html`)
- Module `nc_stats.js` documenté (§9.1 exclusion satellites, KPI §10.3)
- Sécurité Phase 1 active (bcrypt lazy migration, rate limiting, helmet, dotenv)
- trust proxy ✅ et JWT_SECRET ✅ sécurisés (29/05/2026)
- Planification Phase 4 (pg_dump auto, CORS restrict, Helmet CSP)
- Planification déploiement OVH (juin 2026) — checklist complète
- Backlog fonctionnel (dashboard PDF, alertes email LNE-5, IA cause racine…)
- Procédures backup/rollback documentées

*À mettre à jour après toute évolution fonctionnelle majeure.*
