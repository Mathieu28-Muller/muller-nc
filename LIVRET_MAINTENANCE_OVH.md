# Livret de Maintenance — Serveur OVH Muller Automotive
**Créé le :** 30 juin 2026  
**Serveur :** `ns3071457.ip-217-182-136.eu` — `quali-form.mullerautomotive.fr`  
**Connexion :** WinSCP / PuTTY — hôte `217.182.136.194` — port SSH `7255` — user `qualiform`

---

## Accès rapide PuTTY

```bash
# Statut général
pm2 status
pm2 logs formation-sav --lines 30 --nostream

# PostgreSQL
sudo -u postgres psql nc_muller -c "SELECT COUNT(*) FROM nc_fiches;"

# Espace disque
df -h

# Certificat SSL
sudo certbot certificates
```

---

## Routine Hebdomadaire

> Durée estimée : **5 minutes**

### 1. PM2 — process en ligne
```bash
pm2 status
```
✅ Attendu : `formation-sav` · status `online` · `↺ 0` (pas de crash)  
⚠️ Si crash : `pm2 logs formation-sav --lines 50 --nostream` puis `pm2 restart formation-sav`

### 2. Logs d'erreurs récents
```bash
pm2 logs formation-sav --lines 50 --nostream
```
✅ Attendu : aucune ligne `[ERROR]` ou `[pg] pool error`  
⚠️ Si erreur PG : vérifier que PostgreSQL tourne (`sudo systemctl status postgresql`)

### 3. Espace disque
```bash
df -h
```
✅ Attendu : partition `/` < 80% utilisée  
⚠️ Si > 80% : vérifier les logs PM2 (`/home/qualiform/.pm2/logs/`) et les backups anciens (`/opt/backups/`)

### 4. Sauvegardes automatiques présentes
```bash
ls -lh /opt/backups/ | tail -10
```
✅ Attendu : fichier `nc_muller_YYYYMMDD.sql.gz` daté d'hier (backup 02h00)  
⚠️ Si absent : vérifier le cron `crontab -l` et relancer manuellement :
```bash
sudo /opt/backups/backup.sh
```

---

## Routine Mensuelle

> Durée estimée : **15 minutes**

### 1. État PostgreSQL complet
```bash
sudo -u postgres psql nc_muller -c "
SELECT 
  (SELECT COUNT(*) FROM nc_fiches) AS nb_fiches,
  (SELECT COUNT(*) FROM nc_actions) AS nb_actions,
  (SELECT COUNT(*) FROM nc_users WHERE role != 'nc_viewer') AS nb_users,
  (SELECT COUNT(*) FROM br_resultats) AS nb_br_resultats,
  (SELECT COUNT(*) FROM br_emails_autorises WHERE actif=true) AS nb_br_autorises;
"
```

### 2. NC sans chef produit (après initialisation)
```bash
sudo -u postgres psql nc_muller -c "
SELECT COUNT(*) AS nc_sans_chef FROM nc_fiches WHERE chef_produit IS NULL OR chef_produit = '';
"
```
⚠️ Si > 0 : aller dans console NC → Configuration → ⚡ Initialiser sur les NC existantes

### 3. Certificat SSL — date d'expiration
```bash
sudo certbot certificates
```
✅ Attendu : `VALID: XX days` > 30 jours  
⚠️ Si < 30 jours : `sudo certbot renew --dry-run` puis `sudo certbot renew`

### 4. Nginx fonctionnel
```bash
sudo nginx -t && echo "OK"
curl -s -o /dev/null -w "%{http_code}" https://quali-form.mullerautomotive.fr/NC/login.html
```
✅ Attendu : `nginx: configuration file ... syntax is ok` + code HTTP `200`

### 5. Token GitHub — vérifier expiration
Aller sur : `https://github.com/settings/tokens`  
✅ Attendu : token `muller-nc` valide (date d'expiration > 30 jours)  
⚠️ GitHub envoie un email d'alerte 7 jours avant expiration — renouveler dès réception

### 6. Nettoyage backups anciens (> 7 jours)
```bash
ls -lh /opt/backups/
# Les fichiers > 7 jours sont normalement supprimés automatiquement par le script backup.sh
# Vérifier qu'il n'y a pas d'accumulation anormale
```

### 7. Rapatriement backup vers PC (optionnel)
Via WinSCP : se connecter → `/opt/backups/` → copier le dernier `.sql.gz` vers `D:\backups_ovh\`

---

## Routine Annuelle

> À faire chaque année ou lors d'une alerte

### Token GitHub
- Email de rappel reçu 7 jours avant expiration
- Renouveler sur `https://github.com/settings/tokens/4606982412/regenerate`
- Mettre à jour le remote local :
```bash
git -C C:/formation remote set-url origin https://NOUVEAU_TOKEN@github.com/Mathieu28-Muller/muller-nc.git
```

### Certificat Let's Encrypt
- Renouvellement automatique via cron Certbot
- Vérifier que le cron est actif : `sudo crontab -l | grep certbot`
- Si absent, l'ajouter : `sudo crontab -e` → `0 3 * * * certbot renew --quiet`

### Mise à jour Node.js (si besoin)
```bash
node -v   # version actuelle
# Ne mettre à jour que si une faille de sécurité critique est signalée
# Toujours tester en local avant OVH
```

---

## Procédure de Mise à Jour Applicative

> À chaque nouvelle version (v5.x → v5.y)

### Ordre des opérations
1. **Tester en local** — `http://localhost:8080/NC/` — valider les modifications
2. **Migrations SQL éventuelles** (via PuTTY, en premier) :
   ```bash
   sudo -u postgres psql nc_muller -c "ALTER TABLE nc_fiches ADD COLUMN IF NOT EXISTS nouveau_champ TEXT;"
   ```
3. **Copier les fichiers** via WinSCP (dans l'ordre, `server.js` en dernier)
4. **Redémarrer** :
   ```bash
   pm2 restart formation-sav
   ```
5. **Vérifier** :
   ```bash
   pm2 status
   pm2 logs formation-sav --lines 10 --nostream
   curl -s -o /dev/null -w "%{http_code}" https://quali-form.mullerautomotive.fr/NC/login.html
   ```
6. **Vérifier la version** dans la console NC → historique versions

> ⚠️ `NC/index.html` — ne PAS déployer la version locale tant que le questionnaire de pré-qualification n'est pas validé.

---

## Procédure de Rollback d'urgence

> Si une mise à jour casse la production (< 5 minutes)

```bash
# 1. Vérifier les logs
pm2 logs formation-sav --lines 30 --nostream

# 2. Si erreur PostgreSQL (colonne manquante, etc.)
# Revenir à l'ancien server.js via WinSCP (récupérer depuis GitHub)
git -C C:/formation show HEAD~1:server.js > C:/tmp/server_old.js
# Copier C:/tmp/server_old.js vers /opt/nc/server.js via WinSCP
# puis :
pm2 restart formation-sav

# 3. Si erreur de config PostgreSQL
sudo -u postgres psql nc_muller -c "\d nc_fiches"  # vérifier schéma
```

---

## Contacts et Références

| Élément | Valeur |
|---------|--------|
| Support technique | avet.mat@gmail.com |
| Secrets déploiement | `C:\Users\MULLER\Documents\SECRETS_DEPLOIEMENT_NC.txt` |
| Rapport déploiement | `C:\formation\RAPPORT_DEPLOIEMENT_OVH_20260617.md` |
| Prompt maintenance | `C:\formation\NC\PROMPT_MAINTENANCE_NC.txt` |
| GitHub | `https://github.com/Mathieu28-Muller/muller-nc` |
| Console NC | `https://quali-form.mullerautomotive.fr/NC/console.html` |

---

## Checklist Post-Déploiement v5.3 (30/06/2026) ✅

- [x] `ALTER TABLE nc_fiches ADD COLUMN IF NOT EXISTS chef_produit TEXT;`
- [x] `nc-config.json` copié (chefsProduit + famillesToChef)
- [x] `console.html` v5.3 copié
- [x] `nc_liste_accordeon.js` copié
- [x] `guide-utilisateur.html` copié
- [x] `presentation.html` copié
- [x] `synoptique.html` copié
- [x] `server.js` v5.3 copié
- [x] `pm2 restart formation-sav` exécuté
- [ ] ⚡ Initialiser sur les NC existantes — à faire depuis la console admin
