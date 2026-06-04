# Module Non-Conformités — Muller Automotive

Application web de gestion des non-conformités (NC) conforme ISO 9001:2015.  
Développée par **Mathieu Avet** avec [Claude Code](https://claude.ai/code) (Anthropic).

---

## Accès

| Environnement | URL | Usage |
|---|---|---|
| Développement | `https://formation-sav.fr/NC/` | Tests, évolutions |
| Production (cible) | `https://espace-client.muller-automotive.fr/NC/` | Utilisateurs finaux |

---

## Stack technique

| Composant | Technologie |
|---|---|
| Back-end | Node.js v20 LTS + Express 4.x |
| Base de données | PostgreSQL 16 (`DATA_SOURCE=postgres`) |
| Authentification | JWT + bcrypt |
| Front-end | HTML5 / CSS3 / JavaScript vanilla |
| Serveur web | Nginx (reverse proxy) |
| Process manager | PM2 |
| OS production | Ubuntu 24.04 LTS (VPS OVH) |

---

## Installation (développement)

```bash
# 1. Installer les dépendances
npm install

# 2. Créer le fichier d'environnement
cp .env.example .env
# Renseigner les variables (voir section Variables d'environnement)

# 3. Appliquer le schéma PostgreSQL
psql -U <user> -d nc_muller -f schema_postgresql.sql

# 4. Migrer les données JSON → PostgreSQL (première fois uniquement)
node migrate.js --dry-run   # vérification sans écriture
node migrate.js             # migration réelle

# 5. Vérifier la parité des données
node plan_controle.js       # doit afficher TOUT VERT ✅

# 6. Démarrer le serveur
pm2 start ecosystem.config.js
# ou en développement direct :
node server.js
```

---

## Variables d'environnement (`.env`)

```env
# Serveur
PORT=3001

# Source de données — "postgres" (production) ou "dual" (rollback)
DATA_SOURCE=postgres

# PostgreSQL
PG_HOST=localhost
PG_PORT=5432
PG_USER=<utilisateur>
PG_PASSWORD=<mot_de_passe>
PG_DB=nc_muller

# JWT — générer avec : node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<cle_aleatoire_64_caracteres>

# SMTP
SMTP_HOST=<hote_smtp>
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=qualite@mullerautomotive.fr
SMTP_PASS=<mot_de_passe_smtp>
```

> ⚠️ Ne jamais committer le fichier `.env` — il contient les credentials de production.

---

## Structure des fichiers

```
C:\formation\          (dev)   /opt/nc/          (production OVH)
├── server.js                  ← API Express — toutes les routes NC (~1 800 lignes)
├── package.json               ← dépendances npm
├── ecosystem.config.js        ← configuration PM2 + variables d'environnement
├── .env                       ← credentials (confidentiel — ne pas committer)
├── schema_postgresql.sql      ← schéma PG complet (12 tables, 3 vues)
├── migrate.js                 ← migration JSON → PostgreSQL (idempotent)
├── plan_controle.js           ← vérification parité données (8 sections)
├── nc-config.json             ← configuration métier (familles, causes, emails)
├── nc-data.json               ← archive JSON (ne plus modifier — source = PG)
├── nc-users.json              ← archive JSON (ne plus modifier — source = PG)
└── NC/
    ├── index.html             ← formulaire déclaration publique (sans auth)
    ├── console.html           ← interface admin/pilote (JWT requis)
    ├── login.html             ← page de connexion
    ├── synoptique.html        ← documentation fonctionnelle intégrée
    ├── favicon.svg            ← icône onglet navigateur
    ├── nc_parent_satellites.js
    ├── nc_parent_avance.js
    ├── nc_droits_pilote.js
    ├── nc_liste_accordeon.js
    ├── nc_stats.js
    └── media/                 ← pièces jointes (photos, PDF, vidéos)
```

---

## Rôles utilisateurs

| Rôle | Droits |
|---|---|
| `nc_admin` | Accès total — création, qualification, analyse, clôture, configuration, export |
| `nc_chef_produit` | Réponse aux actions CAPA assignées + lecture de toutes les NC |
| `nc_lecteur` | Consultation seule — toutes NC, statistiques, archives |

---

## Cycle de vie d'une NC

```
ouvert  →  en_cours  →  resolu  →  clos
                                ↘  non_pertinent
```

Format numéro NC : `AAMMJJ-NNNN` (ex. `260503-0001`) — remis à zéro chaque 1er janvier.

---

## Principales routes API

| Méthode | Route | Description | Auth |
|---|---|---|---|
| `GET` | `/api/health` | Statut serveur + version | — |
| `GET` | `/api/nc/appversion` | Version applicative + historique | — |
| `POST` | `/api/nc-auth/login` | Connexion JWT | — |
| `POST` | `/api/nc` | Créer une NC | — |
| `GET` | `/api/nc` | Lister les NC | JWT |
| `GET` | `/api/nc/:num` | Détail d'une NC | JWT |
| `PATCH` | `/api/nc/:num/statut` | Changer le statut | JWT |
| `PATCH` | `/api/nc/:num/meta` | Gravité / score risque | admin |
| `POST` | `/api/nc/:num/actions` | Créer une action CAPA | JWT |
| `POST` | `/api/nc/:num/cloture` | Clôturer une NC | admin |
| `POST` | `/api/nc/export-csv` | Export CSV complet | admin |
| `POST` | `/api/upload` | Upload pièce jointe | JWT |

---

## Commandes utiles (PM2)

```bash
pm2 status                          # état des processus
pm2 logs formation-sav --lines 50   # logs en temps réel
pm2 restart formation-sav           # redémarrer (dev Windows)
pm2 restart muller-nc               # redémarrer (prod OVH)
pm2 restart muller-nc --update-env  # redémarrer + recharger .env

node plan_controle.js               # vérifier intégrité données PostgreSQL
```

---

## Rollback PostgreSQL → JSON (< 2 min)

```bash
# 1. Éditer .env
DATA_SOURCE=postgres  →  DATA_SOURCE=dual

# 2. Recharger
pm2 restart muller-nc --update-env
```

Backup complet disponible : `D:\formation_backup_20260525_avant_postgres\` (769 fichiers, 702 Mo).

---

## Dépendances npm

| Package | Usage | Licence |
|---|---|---|
| `express` | Serveur HTTP / API REST | MIT |
| `pg` | Client PostgreSQL | MIT |
| `bcryptjs` | Hachage mots de passe | MIT |
| `jsonwebtoken` | Authentification JWT | MIT |
| `helmet` | Headers sécurité HTTP | MIT |
| `express-rate-limit` | Protection brute-force | MIT |
| `multer` | Upload fichiers | MIT |
| `nodemailer` | Envoi emails SMTP | MIT |
| `dotenv` | Variables d'environnement | MIT |

---

## Sauvegarde

```bash
# Synchroniser C: → D: (dev Windows)
robocopy C:\formation D:\formation /MIR /XD node_modules /XF "*.log" "*.tmp"

# Dump PostgreSQL (prod OVH — cron 02h00)
pg_dump -U <user> -h <host> nc_muller | gzip > /opt/backups/pg-nc-$(date +%Y%m%d).sql.gz
```

---

## Conformité ISO 9001:2015

| Clause | Couverture |
|---|---|
| §8.7 | Maîtrise des éléments de sortie non conformes |
| §10.2.1 / §10.2.2 | Actions correctives — causes, CAPA, efficacité |
| §9.3 | Revue de direction — export CSV / rapport PDF |
| §10.3 | Amélioration continue — KPI récurrence, alerte systémique |

---

*Propriétaire : Mathieu Avet — avet.mat@gmail.com*  
*Développé avec Claude Code (Anthropic) — abonnement personnel*  
*Version actuelle : v4.5 — voir [CHANGELOG.md](CHANGELOG.md)*
