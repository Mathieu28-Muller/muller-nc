# Changelog — Module Non-Conformités

Toutes les modifications notables sont documentées dans ce fichier.  
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).  
Versionnage : `MAJEUR.MINEUR` — majeur = fonctionnalité structurante, mineur = évolution ou correctif.

---

## [Non publié] — v4.4 (prévu juin 2026)

### Ajouté
- Dépôt Git initialisé — branches `main` / `develop`, tags de version
- Documentation OpenAPI / Swagger de l'API REST
- Guide utilisateur illustré (nc_admin / nc_chef_produit)

### Modifié
- CORS restreint aux origines autorisées (suppression du wildcard `*`)
- Helmet CSP (Content Security Policy) activé
- `app.set('trust proxy', 1)` — correction ERR_ERL_UNEXPECTED_X_FORWARDED_FOR

### Infrastructure
- Déploiement VPS OVH — serveur dédié KS-1-S (Xeon D-2123IT, 32 Go RAM, 2×4 To RAID 1)
- OS Ubuntu 24.04 LTS
- PostgreSQL 16 en local sur le VPS

---

## [4.3] — 25/05/2026

### Modifié
- `DATA_SOURCE=postgres` activé en production — PostgreSQL devient la source de vérité unique
- Fichiers JSON (`nc-data.json`, `nc-users.json`) conservés en archive uniquement

### Sécurité
- Backup complet archivé avant bascule : `D:\formation_backup_20260525_avant_postgres\` (769 fichiers, 702 Mo)
- Procédure de rollback documentée (retour mode `dual` en < 2 min)

---

## [4.2] — 12/05/2026 → 25/05/2026

### Ajouté
- PostgreSQL 16 installé — service Windows `postgresql-x64-16` démarrage automatique
- Schéma `nc_muller` appliqué : 12 tables, 3 vues, index performance
- Script `migrate.js` — migration JSON → PostgreSQL, idempotent (clause `ON CONFLICT DO UPDATE`)
- Script `plan_controle.js` — vérification parité données en 8 sections

### Corrigé
- `pgSyncFiche()` — synchronisation complète NC + historique + actions + réponses
- Bug `nc_action_reponses` — réponses pilotes manquantes après migration
- NC `260521-0007` absente de PostgreSQL — réinjectée via `node migrate.js`
- Réponses NC `260511-0005` et `260511-0006` corrigées en base
- Statut satellite restauré correctement à la désattache d'une NC parent

---

## [4.1] — 09/05/2026

### Sécurité
- Mots de passe hashés avec `bcryptjs` — migration progressive (lazy migration à la connexion)
- Rate limiting activé : 5 tentatives de connexion maximum par 15 min par IP
- `helmet` activé — headers HTTP de sécurité (X-Frame-Options, HSTS, CSP partiel...)
- Blocage accès direct aux fichiers JSON de données (`nc-data.json`, `nc-users.json`)

---

## [4.0] — 03/05/2026

### Ajouté
- Formulaire public `NC/index.html` — champs dynamiques issus de `nc-config.json` (familles, types)
- Console de gestion `NC/console.html` consolidée — 4 onglets : Tableau de bord / Liste / Statistiques / Archives
- Onglet Archives — historique complet, filtres avancés, recherche plein texte
- `NC/synoptique.html` — documentation fonctionnelle intégrée, accessible depuis la console
- Retour satisfaction client à la clôture — champ confirmation
- Score risque et gravité visibles directement dans la liste NC
- Badge statut coloré dans la liste (ouvert / en cours / résolu / clos)
- Indicateur blocage signalé — alerte visuelle urgence dans la liste

### Modifié
- Interface console refactorisée — navigation par onglets au lieu de scroll
- Formulaire de déclaration — validation côté client renforcée

---

## [3.1] — 28/04/2026

### Ajouté
- **NC Parent / Satellites** — regroupement de NC liées sous une NC parent
  - Numérotation NC Parent : `NC-P-00001`, `NC-P-00002`...
  - Cascade clôture : ferme tous les satellites + email à chaque rédacteur satellite
  - Statut satellite restauré automatiquement à la désattache
  - Badge `→ NC-P-XXXXX` cliquable dans la liste NC
- Export CSV complet — 25 colonnes, encodage UTF-8 BOM (compatible Excel Windows)
- Rapport PDF direction — 3 pages (KPI, répartition, tableau NC closes)
- Conformité documentée ISO 9001:2015 §9.3 / §8.7 / §10.2.1 / §10.2.2
- Relances automatiques des pilotes en retard — email + journal
- Filtre liste NC : Toutes / Standards / Parents / Satellites

### Modifié
- Stats : coût des NC satellites exclu du total (évite le double comptage)

---

## [3.0] — 22/04/2026

### Ajouté
- **Score de risque** — cotation 4 axes (impact client, conformité, sécurité, récurrence), valeur 1–9
- **Analyse 5 Pourquoi** — 5 champs de cause racine enchaînés
- **Diagramme Ishikawa** — SVG généré automatiquement, 6 branches (Méthodes, Matière, Milieu, Machine, Main-d'œuvre, Management)
- Gravité NC — 3 niveaux : mineure / majeure / critique
- Blocage clôture NC Parent si cause racine (5P) ou Ishikawa non renseignés

---

## [2.1] — 15/04/2026

### Ajouté
- **Actions CAPA** (Correctives And Preventive Actions)
  - Création d'actions assignées à des pilotes nommés
  - Suivi des échéances — indicateur visuel retard
  - Réponses pilotes avec pièces jointes
- Relances automatiques des pilotes en retard
- Journal d'audit complet — chaque modification horodatée et attribuée

---

## [2.0] — 05/04/2026

### Ajouté
- **Workflow complet** — cycle de vie NC : `ouvert → en_cours → resolu → clos / non_pertinent`
- Notifications email automatiques :
  - Création NC → équipe qualité
  - Changement de statut → rédacteur
  - Clôture NC → qualité
- Champs obligatoires à la clôture : type de cause, coût (€), commentaire clôture, commentaire général
- Historique de chaque NC tracé (qui, quoi, quand)
- Configuration des destinataires email depuis la console (sans SSH)

---

## [1.1] — 25/03/2026

### Ajouté
- Authentification JWT — 3 rôles : `nc_admin` / `nc_chef_produit` / `nc_lecteur`
- Page de connexion dédiée (`NC/login.html`)
- Protection des routes API par token
- Sessions persistantes navigateur (localStorage)

---

## [1.0] — 15/03/2026 — Lancement

### Ajouté
- Premier formulaire de déclaration NC en ligne
- Stockage des données en fichiers JSON (`nc-data.json`)
- Interface d'administration basique
- Numérotation automatique au format `AAMMJJ-NNNN`
- Upload de pièces jointes (photos, PDF, vidéos)
- Serveur Node.js / Express exposé via Cloudflare Tunnel

---

*Propriétaire : Mathieu Avet — avet.mat@gmail.com*  
*Développé avec Claude Code (Anthropic) — abonnement personnel*
