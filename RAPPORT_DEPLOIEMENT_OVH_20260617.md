# Rapport de Déploiement — Serveur OVH Muller Automotive
**Date initiale :** 17 juin 2026  
**Mise à jour :** 30 juin 2026  
**Réalisé par :** Mathieu Muller  
**Serveur :** ns3071457.ip-217-182-136.eu (OVH VPS)

---

## 1. Infrastructure Serveur

| Élément | Valeur |
|---------|--------|
| Hébergeur | OVH |
| IP | `217.182.136.194` |
| OS | Debian Linux |
| Port SSH | `7255` |
| Utilisateur système | `qualiform` |
| Domaine | `quali-form.mullerautomotive.fr` |
| URL production NC | `https://quali-form.mullerautomotive.fr/NC/` |

---

## 2. Stack Technique Installée

| Logiciel | Version | Rôle |
|----------|---------|------|
| Node.js | 20.20.2 LTS | Runtime serveur |
| npm | 10.8.2 | Gestionnaire de paquets |
| PM2 | — | Gestionnaire de process Node.js |
| PostgreSQL | 16 | Base de données |
| Nginx | — | Reverse proxy HTTP/HTTPS |
| Certbot / Let's Encrypt | — | Certificat SSL |
| UFW | — | Pare-feu |

---

## 3. Application Déployée

**Dossier racine :** `/opt/nc/`  
**Version applicative :** v5.3 (déployée le 30/06/2026)  
**Modules présents :**

| Module | Chemin | Statut |
|--------|--------|--------|
| Non-Conformités (NC) | `/opt/nc/NC/` | ✅ Production |
| Contrôle de Terrain (CT) | `/opt/nc/CT/` | ✅ En ligne |
| MRA | `/opt/nc/MRA/` | ✅ En ligne |
| Sensibilisation | `/opt/nc/SENSIBILISATION/` | ✅ En ligne |
| Base de cas | `/opt/nc/Base de cas/` | ✅ En ligne |
| Module BR | Non déployé sur OVH | ⏸ Prévu ultérieurement |
| Certificat de Conformité | Non déployé sur OVH | ⏸ Prévu ultérieurement |

**Serveur Node.js :**
- Fichier : `/opt/nc/server.js` — v5.3
- Port interne : `3001`
- Process PM2 : `formation-sav` (id 0)
- Config PM2 : `/opt/nc/ecosystem.config.js`

---

## 4. Base de Données PostgreSQL

| Élément | Valeur |
|---------|--------|
| Base | `nc_muller` |
| Utilisateur applicatif | `nc_user` |
| Host | `localhost:5432` |
| Config | `/opt/nc/.env` |

**Données en production au 30/06/2026 :**

| Table | Enregistrements |
|-------|----------------|
| nc_fiches | 30+ |
| nc_historique | ~80+ |
| nc_actions | ~30+ |
| nc_users | 80+ (2 admins · 16 pilotes · 6 codir · 56 lecteurs) |

**Correctif appliqué le 22/06/2026 :**  
Contrainte `nc_users_role_check` mise à jour pour inclure le rôle `nc_codir` :
```sql
ALTER TABLE nc_users DROP CONSTRAINT IF EXISTS nc_users_role_check;
ALTER TABLE nc_users ADD CONSTRAINT nc_users_role_check
  CHECK (role IN ('nc_admin','nc_chef_produit','nc_lecteur','nc_viewer','nc_codir'));
```

**Migration v5.2 / v5.3 — 30/06/2026 :**  
Ajout colonne `chef_produit` sur `nc_fiches` :
```sql
ALTER TABLE nc_fiches ADD COLUMN IF NOT EXISTS chef_produit TEXT;
```
Initialisation rétroactive via console NC → ⚙ Configuration → ⚡ Initialiser sur les NC existantes.

---

## 5. Variables d'environnement — `/opt/nc/.env`

| Variable | Valeur | Rôle |
|----------|--------|------|
| `DATA_SOURCE` | `postgres` | Source de données unique |
| `SITE_URL` | `https://quali-form.mullerautomotive.fr` | URL base pour emails |
| `BR_ENABLED` | `false` | Module BR désactivé sur OVH |
| `PG_HOST` | `localhost` | PostgreSQL local |
| `PG_USER` | `nc_user` | Utilisateur applicatif PG |
| `PG_DB` | `nc_muller` | Base de données |
| `NC_SMTP_HOST` | `ssl0.ovh.net` | Serveur mail OVH |
| `NC_SMTP_PORT` | `465` | Port SSL |
| `NC_SMTP_USER` | `noreply-nc@mullerautomotive.fr` | Compte émetteur |
| `JWT_SECRET` | *(voir SECRETS_DEPLOIEMENT_NC.txt)* | Clé JWT 64 chars |

> ⚠️ Ne jamais committer `.env` — credentials de production.

---

## 6. Nginx — Reverse Proxy

**Config :** `/etc/nginx/sites-available/quali-form`  
**Lien actif :** `/etc/nginx/sites-enabled/quali-form`  
**Sauvegarde PC :** `C:\formation\_ovh\nginx-quali-form.conf`

Nginx reçoit les requêtes HTTP/HTTPS sur les ports 80/443 et redirige vers `localhost:3001`. Headers transmis : `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`.

> ⚠️ **25/06/2026** — La config a été accidentellement vidée puis reconstituée via Certbot + script Python. En cas de problème Nginx, recharger `C:\formation\_ovh\nginx-quali-form.conf` via WinSCP vers `/etc/nginx/sites-available/quali-form` puis `sudo nginx -t && sudo systemctl reload nginx`.

---

## 7. SSL / HTTPS

- **Certificat :** Let's Encrypt (via Certbot)
- **Domaine :** `quali-form.mullerautomotive.fr`
- **Renouvellement :** Automatique (cron Certbot)
- **Config :** `/etc/letsencrypt/renewal/quali-form.mullerautomotive.fr.conf`

---

## 8. Pare-feu UFW

| Port | Protocole | Règle | Usage |
|------|-----------|-------|-------|
| 7255 | TCP | ALLOW | SSH |
| 80 | TCP | ALLOW | HTTP |
| 443 | TCP | ALLOW | HTTPS |
| 3001 | — | (non exposé) | Node.js — accès local uniquement |

---

## 9. Démarrage Automatique

- **Service systemd :** `pm2-qualiform.service`
- **Au redémarrage :** PM2 démarre automatiquement et relance `formation-sav`
- **PM2 dump :** `/home/qualiform/.pm2/dump.pm2`

---

## 10. Sauvegardes Automatiques

- **Script :** `/opt/backups/backup.sh`
- **Planification :** Tous les jours à **02h00** (cron OVH)
- **Destination :** `/opt/backups/nc_muller_AAAAMMJJ.sql.gz`
- **Rétention :** 7 jours

**Rapatriement vers PC Windows (manuel ou planifié) :**
- Script WinSCP : `C:\formation\backup_ovh.bat`
- Destination PC : `D:\backups_ovh\`
- Pour planifier : Gestionnaire des tâches Windows → `C:\formation\backup_ovh.bat` à 03h00

---

## 11. Workflow de Mise à Jour

```bash
# 1. Sur le PC : modifier → tester → transférer via WinSCP
# 2. Sur OVH via SSH :
pm2 reload formation-sav --update-env
pm2 logs formation-sav --lines 20 --nostream
```

**Fichiers à toujours inclure dans le transfert WinSCP :**
- `server.js` — API principale (**en dernier, déclenche le redémarrage**)
- `nc-config.json` — configuration NC (familles, chefs produit, mapping)
- `NC/console.html` — interface admin
- `NC/nc_liste_accordeon.js` — accordéon liste NC
- `NC/guide-utilisateur.html`, `NC/presentation.html`, `NC/synoptique.html` — documentation

> ⚠️ `NC/index.html` — **ne PAS déployer la version locale** (contient le questionnaire de pré-qualification en développement). Laisser la version OVH en place jusqu'au déploiement officiel.

**Tests locaux :** utiliser `C:\formation\_ovh\NC\` (servi sur `http://localhost:8080/NC/`)

---

## 12. Bascule NC — 22/06/2026

Le module NC a basculé de `formation-sav.fr` vers `quali-form.mullerautomotive.fr`.

**Sur `formation-sav.fr` (PC Windows) :**
- Les pages `NC/login.html`, `NC/index.html`, `NC/console.html` affichent désormais un message invitant les utilisateurs à se connecter sur le nouveau lien.
- Le module BR reste actif sur `formation-sav.fr` jusqu'au déploiement sur OVH.

**Comptes utilisateurs NC :**
- 80 comptes actifs — gestion via console NC → onglet Utilisateurs
- MDP temporaire premier accès : `Lecteur2026` (mustChangePass activé)

---

## 13. Récupération des Sauvegardes

Via WinSCP depuis le PC :
```
Hôte : 217.182.136.194 / Port : 7255
Dossier : /opt/backups/
```

Restauration si besoin :
```bash
gunzip -c nc_muller_DATE.sql.gz | psql -U nc_user -d nc_muller
```

---

## 14. Commandes de Diagnostic OVH

```bash
pm2 status                                    # état du process
pm2 logs formation-sav --lines 20 --nostream  # logs récents
pm2 reload formation-sav --update-env         # redémarrer + recharger .env

# PostgreSQL
sudo -u postgres psql nc_muller -c "SELECT COUNT(*) FROM nc_fiches;"
gunzip -c /opt/backups/nc_muller_DATE.sql.gz | psql -U nc_user -d nc_muller
```

---

## 15. État Global

| Composant | Statut |
|-----------|--------|
| HTTPS | ✅ Actif — Let's Encrypt |
| PostgreSQL | ✅ Production — DATA_SOURCE=postgres |
| PM2 | ✅ `formation-sav` online |
| SMTP | ✅ `noreply-nc@mullerautomotive.fr` — ssl0.ovh.net:465 |
| Sauvegardes auto | ✅ pg_dump 02h00 / 7 jours rétention |
| Module NC | ✅ v5.3 — 30+ fiches — 80+ utilisateurs — chef_produit actif |
| Module BR | ⏸ PC uniquement — déploiement OVH prévu |
| Certificat Conformité | ⏸ PC uniquement — déploiement OVH prévu |
| Upload fichiers | ✅ 200 Mo max — client_max_body_size dans nginx.conf |
| Rate limiting | ✅ Par compte — 5 mauvais MDP → verrou 15 min |

**`https://quali-form.mullerautomotive.fr/NC/` — EN PRODUCTION depuis le 22/06/2026**

---

*Contact support technique : avet.mat@gmail.com*  
*Secrets déploiement : `C:\Users\MULLER\Documents\SECRETS_DEPLOIEMENT_NC.txt`*
