# Guide administrateur — Console d'administration
## Muller Automotive — DOC-A-31

---

## Accès

```
http://localhost:3003/admin.html
```

Le rôle **admin** donne accès à toutes les fonctionnalités, y compris **Configuration** et **Comptes** (masqués pour les opérateurs).

---

## Démarrage du serveur

### Option 1 — Double-clic
Double-cliquer sur **`demarrer.bat`** dans le dossier du projet.

### Option 2 — Terminal
```bash
cd C:\Users\MULLER\Desktop\CertificatConformite
node server.js
```

Le serveur démarre sur le port **3003**.

### Redémarrage après modification
Si le serveur ne répond plus ou a été modifié :
```powershell
# Trouver le PID du processus
netstat -ano | findstr :3003

# Tuer le processus (remplacer XXXX par le PID trouvé)
taskkill /PID XXXX /F

# Relancer
node server.js
```

---

## Configuration du serveur

Menu **⚙️ Configuration** — réservé aux administrateurs.

### Section Emails

| Champ | Description |
|-------|-------------|
| Email service qualité | Adresse en copie de toutes les attestations envoyées |
| Email expéditeur | Adresse depuis laquelle les emails sont envoyés |
| Mot de passe boîte mail | Mot de passe de la boîte expéditrice |
| Serveur SMTP | Hôte du serveur d'envoi (ex : `smtp.office365.com`) |
| Port SMTP | Port SMTP (ex : `587` pour TLS, `465` pour SSL) |

### Section Comportement

| Option | Description |
|--------|-------------|
| Validation automatique | Si activé : les attestations sont générées et envoyées automatiquement dès réception de la demande, sans passer par la validation manuelle |
| Copie au service qualité | Si activé : chaque attestation envoyée génère une copie à l'adresse "Email service qualité" |

### Section Modèles de mail

Personnaliser les emails envoyés aux centres :

| Champ | Utilisation |
|-------|-------------|
| Objet – Confirmation de demande | Sujet de l'email de confirmation envoyé après dépôt |
| Objet – Envoi attestations | Sujet de l'email accompagnant les PDF |
| Corps – Confirmation de demande | Texte de l'email de confirmation |
| Corps – Envoi attestations | Texte de l'email contenant les attestations |

Cliquer sur **Enregistrer la configuration** pour sauvegarder.

---

## Gestion des comptes

Menu **👤 Comptes** — réservé aux administrateurs.

### Créer un compte

Cliquer sur **+ Nouveau compte** et remplir :

| Champ | Description |
|-------|-------------|
| Login | Identifiant de connexion (unique) |
| Nom | Nom affiché dans la console |
| Mot de passe | Mot de passe de connexion |
| Rôle | `Opérateur` ou `Admin` |

**Rôle Opérateur** : accès tableau de bord, demandes, archives, upload Excel.
**Rôle Admin** : accès complet incluant Configuration et Comptes.

### Supprimer un compte

Dans la liste des comptes, cliquer sur **Supprimer** en face du compte concerné.

> Le compte `admin` ne peut pas être supprimé.

---

## Fonctionnement de la sélection automatique des feuilles

Le template DOC-A-31 contient 75 feuilles. Le serveur choisit automatiquement la bonne feuille selon les équipements de la demande.

### Feuilles VL

| Condition | Feuille sélectionnée |
|-----------|---------------------|
| Freinomètre 43800 | XG 2-6 |
| Freinomètre 43850 | XG 2-7 |
| Freinomètre 43350 (VL+), version ≥ 1.1.2.5 | XG VL+ 2-5 |
| Freinomètre 43350 (VL+), version 1.1.2.4 | XG VL+ 2-4 |
| Freinomètre 43350 (VL+), version ≤ 1.1.2.3 | XG VL+ 2-2 |
| Pupitre 49620 (UPG), version ≥ 1.1.2.5 | XG UPG 2-5 |
| Pupitre 49620 (UPG), version 1.1.2.4 | XG UPG 2-4 |
| Standard 43300, version ≥ 1.1.2.5 | XG 2-5 |
| Standard 43300, version 1.1.2.4 | XG 2-4 |
| Standard 43300, version ≤ 1.1.2.3 | XG 2 |
| Radio "Type chaîne" = FOG VL | FOG VL |
| Radio "Type chaîne" = FOG VL+ | FOG VL+ |

### Feuilles PL

| Condition | Feuille sélectionnée |
|-----------|---------------------|
| Version majeure ≥ 2 OU modèle BM/10000 | 10000MX PL 1-2 |
| Control room (52700CR) + frein 50500/55310 | XG PL 1-5 |
| Control room + frein 44700 | XG PL 1-4 |
| Frein 53500, version ≥ 1.1.0.6 | XG PL 4-1-1 |
| Frein 53500, version 1.1.0.5 | XG PL 4-1 |
| Frein 44750 | XG PL 5-1 |
| Frein 50500/55310, version ≥ 1.1.0.6 | XG PL 4-3-3 |
| Frein 50500/55310, version 1.1.0.5 | XG PL 4-3-2 |
| Frein 44700, version ≥ 1.1.0.6 | XG PL 4-2-3 |
| Frein 44700, version 1.1.0.5 | XG PL 4-2-2 |

### Feuilles Anti-pollution

| Matériel / Condition | Feuille sélectionnée |
|---------------------|---------------------|
| ACTIGAS + SK18 | AG OPA OBD 6C SK18 |
| ACTIGAS + SK08 | AG OPA OBD C6 SK08 |
| ACTIGAS_OPA + version LAN3 | OPA OBD 6C SK18 |
| ACTIGAS_OPA + version LAN2 | OPA OBD C6 SK08 |
| ECOSHIELD | ECOOPAOBD |
| ECOPOL | ECOPOL |

**Règle SK08/SK18** (numéro de série analyseur de gaz `NNN/AA`) :

| Condition | Certificat |
|-----------|-----------|
| AA < 18 | SK08 |
| AA = 18 ET NNN ≤ 100 | SK08 |
| AA = 18 ET NNN ≥ 101 | SK18 |
| AA > 18 | SK18 |

### Feuilles Classe L (certOtclan du sonomètre)

| Configuration | cert 0223 | cert 0225/inconnu | cert 0226 | cert 0227 |
|--------------|-----------|-------------------|-----------|-----------|
| Céléromètre seul | — | 0231SEUL | — | — |
| Céléromètre à distance | — | CELERODISTANCE | — | — |
| Sonomètre seul | 0223LAN5 | 0225SONO / 0225LAN5 | 0226LAN5 | 0227LAN5 |
| Sono + Célero combinés | 0223CELERO | 0225SONOCELERO | 0226CELERO | 0227CELERO |

---

## Forcer une feuille manuellement (override)

Dans la fiche détaillée d'une demande **En attente** ou **Non conforme** :

1. Chaque section affiche sa feuille calculée automatiquement (bandeau bleu — **auto**)
2. Le menu déroulant liste les feuilles compatibles avec ce type de section
3. Sélectionner une autre feuille → le bandeau passe en jaune (**modifiée**)
4. Cliquer sur **✓ Valider et générer PDF**

L'override est sauvegardé en base. Les prochaines générations pour cette demande utiliseront la feuille forcée.

---

## Structure de la base de données

Le fichier **`db.json`** stocke toutes les demandes. Chaque demande contient :

```json
{
  "id": "uuid-unique",
  "status": "en_attente | validee | non_conforme",
  "createdAt": "2026-04-13T10:00:00.000Z",
  "valideeAt": "2026-04-13T10:05:00.000Z",
  "nomCentre": "CT EXEMPLE",
  "agrement": "A-075-XXXXX-01",
  "email": "centre@exemple.fr",
  "sections": [
    {
      "type": "ct",
      "sousType": "VL",
      "sheetOverride": "XG 2-5",
      "materiels": [...]
    }
  ],
  "attestations": [
    { "numero": "AT-2026-001", "pdfUrl": "/api/archives/AT-2026-001.pdf" }
  ]
}
```

> **Ne jamais modifier `db.json` manuellement** sauf en cas de corruption avérée. Utiliser toujours la console d'administration.

---

## Historique OTCLAN

Le fichier **`data/otclan_history.json`** est le cœur des données équipements.

**Règle fondamentale : ne jamais supprimer ce fichier.**

- Clé : `"agrement|materielConcerne|numSerie"`
- Toute entrée est conservée indéfiniment (un équipement peut être hors ligne mais rester en historique)
- Chaque upload OTCLAN **enrichit** l'historique sans écraser les anciennes entrées

### Remplacement de N° de série
Quand un client modifie un N° de série dans le formulaire, une confirmation est demandée. Si confirmée :
- L'entrée avec l'ancien SN est archivée
- Une nouvelle entrée est créée avec le nouveau SN

---

## Dépannage

### Le serveur ne répond pas

```powershell
netstat -ano | findstr :3003
taskkill /PID XXXX /F
node server.js
```

### LibreOffice n'est pas trouvé (erreur génération PDF)

Vérifier que LibreOffice est installé sur le PC. Le serveur cherche LibreOffice dans les chemins standard Windows. Si installé dans un chemin personnalisé, contacter le développeur pour mettre à jour le chemin dans `server.js`.

### Email non reçu après validation

1. Vérifier la configuration SMTP dans **⚙️ Configuration**
2. Vérifier que le mot de passe de la boîte expéditrice est correct
3. Vérifier que le port SMTP est correct (587 pour TLS, 465 pour SSL)
4. Consulter les logs du serveur dans le terminal

### Données OTCLAN non mises à jour après upload

1. Vérifier que le fichier porte le bon nom (ex : `suivi_otclan_vl_2026.xlsx`)
2. Vérifier le statut d'import dans la liste (vert = succès, rouge = erreur)
3. Rafraîchir la page et refaire une recherche client

---

## Fichiers du projet

```
CertificatConformite/
├── server.js                 ← Backend Node.js (port 3003)
├── demarrer.bat              ← Lancement rapide
├── db.json                   ← Base de données demandes
├── public/
│   ├── index.html            ← Formulaire client
│   ├── admin.html            ← Console administration
│   ├── js/client.js          ← Logique formulaire
│   ├── js/admin.js           ← Logique console admin
│   └── css/style.css         ← Styles
├── data/
│   ├── otclan_history.json   ← Historique cumulatif (NE PAS SUPPRIMER)
│   ├── suivi_otclan_vl_*.xlsx
│   ├── suivi_otclan_pl_*.xlsx
│   ├── suivi_otclan_cl_*.xlsx
│   ├── Base_contrats.xlsx
│   ├── correspondance compte client - n° agrément.xlsx
│   └── 1 - DOC-A-31 V1  MODELE ATTESTATION DE CONFORMITE.xlsm
└── uploads/                  ← Fichiers temporaires
```
