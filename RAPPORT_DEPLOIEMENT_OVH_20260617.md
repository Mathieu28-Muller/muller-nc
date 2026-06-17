# Rapport de Déploiement — Serveur OVH Muller Automotive
**Date :** 17 juin 2026  
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
| URL production | `https://quali-form.mullerautomotive.fr` |

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
**Modules présents :**

| Module | Chemin |
|--------|--------|
| Non-Conformités (NC) | `/opt/nc/NC/` |
| Contrôle de Terrain (CT) | `/opt/nc/CT/` |
| MRA | `/opt/nc/MRA/` |
| Sensibilisation | `/opt/nc/SENSIBILISATION/` |
| Base de cas | `/opt/nc/Base de cas/` |

**Serveur Node.js :**
- Fichier : `/opt/nc/server.js`
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

**Données migrées le 17/06/2026 :**

| Table | Enregistrements |
|-------|----------------|
| nc_fiches | 19 |
| nc_historique | 52 |
| nc_actions | 22 |
| nc_action_reponses | 28 |
| nc_action_relances | 1 |
| nc_action_historique | 42 |
| nc_users | 21 |
| app_users | 12 |

Migration validée ✅ — comptages JSON = PostgreSQL sur tous les tableaux.

---

## 5. Nginx — Reverse Proxy

**Config :** `/etc/nginx/sites-available/quali-form`  
**Lien actif :** `/etc/nginx/sites-enabled/quali-form`

Nginx reçoit les requêtes HTTP/HTTPS sur le port 80/443 et les redirige vers `localhost:3001` (Node.js). Headers proxy transmis : `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`.

---

## 6. SSL / HTTPS

- **Certificat :** Let's Encrypt (via Certbot)
- **Domaine couvert :** `quali-form.mullerautomotive.fr`
- **Renouvellement :** Automatique (cron Certbot)
- **Config stockée :** `/etc/letsencrypt/renewal/quali-form.mullerautomotive.fr.conf`

---

## 7. Pare-feu UFW

| Port | Protocole | Règle | Usage |
|------|-----------|-------|-------|
| 7255 | TCP | ALLOW | SSH |
| 80 | TCP | ALLOW | HTTP |
| 443 | TCP | ALLOW | HTTPS |
| 3001 | — | (non exposé) | Node.js — accès local uniquement |

---

## 8. Démarrage Automatique

- **Service systemd :** `pm2-qualiform.service`
- **Comportement :** Au redémarrage du serveur, PM2 démarre automatiquement et relance `formation-sav`
- **PM2 dump sauvegardé :** `/home/qualiform/.pm2/dump.pm2`

---

## 9. Sauvegardes Automatiques

- **Script :** `/opt/backups/backup.sh`
- **Planification :** Tous les jours à **02h00** (cron)
- **Destination :** `/opt/backups/nc_muller_AAAAMMJJ.sql.gz`
- **Rétention :** 7 jours (les fichiers plus anciens sont supprimés automatiquement)
- **Test effectué :** `test_backup.sql.gz` (22 Ko) ✅

---

## 10. Workflow de Mise à Jour

Pour déployer une modification sur le serveur :

```bash
# 1. Sur le PC : modifier -> tester -> git push
# 2. Sur OVH via SSH :
cd /opt/nc && git pull origin master && pm2 reload formation-sav --update-env
```

---

## 11. Récupération des Sauvegardes

Via WinSCP ou SCP depuis le PC :
```
Hôte : 217.182.136.194 / Port : 7255
Dossier : /opt/backups/
```

Restauration locale si besoin :
```bash
gunzip -c nc_muller_DATE.sql.gz | psql -U postgres -d nc_muller
```

---

## 12. Étape Restante

| # | Tâche | Statut |
|---|-------|--------|
| 15 | Couper le tunnel Cloudflare sur le PC (formation-sav.fr) | A faire après validation complète |

---

**Etat global : PRODUCTION**  
`https://quali-form.mullerautomotive.fr/NC/` opérationnel avec HTTPS, PostgreSQL, PM2 et sauvegardes automatiques.
