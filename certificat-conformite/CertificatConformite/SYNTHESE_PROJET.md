# SYNTHÈSE PROJET — Certificat de Conformité Muller Automotive
> Fichier de reprise rapide de session. Dernière mise à jour : 2026-04-13

---

## 1. LOCALISATION DU PROJET

```
C:\Users\MULLER\Desktop\CertificatConformite\
```

### Structure des fichiers principaux
```
CertificatConformite/
├── server.js                          ← Serveur Node.js/Express (port 3003) — TOUT le backend
├── demarrer.bat                       ← Double-clic pour lancer le serveur
├── package.json                       ← Dépendances npm
├── db.json                            ← Base de données demandes (JSON)
├── public/
│   ├── index.html                     ← Formulaire client (interface principale)
│   ├── admin.html                     ← Console administration
│   ├── js/client.js                   ← Logique frontend formulaire
│   ├── js/admin.js                    ← Logique frontend admin
│   └── css/style.css                  ← Styles
├── data/
│   ├── otclan_history.json            ← Historique cumulatif OTCLAN (ne jamais supprimer)
│   ├── suivi_otclan_vl_*.xlsx         ← Fichier OTCLAN VL (remplacé à chaque upload)
│   ├── suivi_otclan_pl_*.xlsx         ← Fichier OTCLAN PL
│   ├── suivi_otclan_cl_*.xlsx         ← Fichier OTCLAN CL
│   ├── Base_contrats.xlsx             ← Contrats équipements
│   ├── correspondance compte client - n° agrément.xlsx
│   └── 1 - DOC-A-31 V1  MODELE ATTESTATION DE CONFORMITE.xlsm  ← Template 75 feuilles
└── uploads/                           ← Fichiers temporaires upload
```

---

## 2. DÉMARRAGE DU SERVEUR

```bat
# Option 1 : Double-clic sur demarrer.bat
# Option 2 : Terminal dans le dossier
node server.js
```

- Interface client  : http://localhost:3003
- Console admin     : http://localhost:3003/admin.html

**Si le serveur ne répond plus après modification de server.js :**
```powershell
netstat -ano | findstr :3003          # trouver le PID
taskkill /PID XXXX /F                  # tuer le processus
node server.js                         # relancer
```
**Sous Git Bash :** `cmd //c "taskkill /F /PID XXXX && echo OK"`

---

## 3. FONCTIONNEMENT GÉNÉRAL

### But du projet
Générer automatiquement des **attestations de conformité DOC-A-31** (PDF) pour les centres de contrôle technique clients de Muller Automotive.

### Flux complet
1. L'utilisateur cherche un centre par agrément/nom/ville
2. Le serveur croise les données OTCLAN VL/PL/CL + Base_contrats + correspondances
3. Le formulaire se pré-remplit avec les équipements détectés
4. L'utilisateur coche les types d'attestation souhaités, vérifie/complète
5. La demande est envoyée → admin valide → le serveur remplit le template `.xlsm` → LibreOffice convertit en PDF → envoi email

---

## 4. LOGIQUE MÉTIER CRITIQUE

### 4.1 Identification des matériels — `categorizeTypemat(typemat, sn)`
- `$PRO HLT OPTICAL UNIT PTI L` = **Règle phare SMARTLYNX** → JAMAIS un opacimètre
- `AT605` = **Opacimètre ACTIGAS**
- `AT505` = **Analyseur de gaz ACTIGAS**
- `N-REGLEPHARE CCD TOUCH` = modèle **764-8**
- Ordre de test : SMARTLYNX/HLT en PREMIER, avant opacimètre

### 4.2 Certificat SK08 / SK18 — `isAgSK18(sn)`
Format SN analyseur de gaz = `NNN/AA` (ex: `164/17`, `101/18`, `045/22`)

| Condition | Certificat |
|-----------|-----------|
| Année < 18 | SK08 |
| Année = 18 ET NNN ≤ 100 | SK08 |
| Année = 18 ET NNN ≥ 101 | SK18 |
| Année > 18 | SK18 |

**Pour ACTIGAS_OPA** (opacimètre seul sans AG) : SK08 ou SK18 détecté via la `versionLog` de l'OPA :
- `LAN2.xx` → feuille `OPA OBD C6 SK08`
- `LAN3.xx` → feuille `OPA OBD 6C SK18`

### 4.3 Sélection de la feuille xlsm — `getSheetName(section)`
Le template DOC-A-31 a **75 feuilles**. Sélection par type + sous-type + modèle/version.

#### VL — `selectVlSheet(section)`
| Condition | Feuille |
|-----------|---------|
| Frein 43800 | XG 2-6 |
| Frein 43850 | XG 2-7 |
| Frein 43350 (VL+), v1.1.2.5+ | XG VL+ 2-5 |
| Frein 43350 (VL+), v1.1.2.4 | XG VL+ 2-4 |
| Frein 43350 (VL+), v≤1.1.2.3 | XG VL+ 2-2 |
| Pupitre 49620 (UPG), v1.1.2.5+ | XG UPG 2-5 |
| Pupitre 49620 (UPG), v1.1.2.4 | XG UPG 2-4 |
| Standard 43300, v1.1.2.5+ | XG 2-5 |
| Standard 43300, v1.1.2.4 | XG 2-4 |
| Standard 43300, v≤1.1.2.3 | XG 2 |
| chaineType = 'FOG VL' | FOG VL |
| chaineType = 'FOG VL+' | FOG VL+ |

**IMPORTANT** : les feuilles FOG ne sont PAS dans l'OTCLAN Muller. Sélection uniquement via la radio "Type chaîne" dans le formulaire (saisie manuelle). Modèles FOG : `CLS.750CT-VL / CLS.750FR-ENS1` (VL) et `CLS.750CT-VL+ / CLS.750FR-ENS2` (VL+).

#### PL — `selectXgPlSheet(section)`
| Condition | Feuille |
|-----------|---------|
| Version majeure ≥ 2, ou modèle contient "50620"/"10000"/"bm" | 10000MX PL 1-2 |
| Control room (52700CR/+TS) + frein 50500/55310 | XG PL 1-5 |
| Control room + frein 44700 | XG PL 1-4 |
| Frein 53500, v1.1.0.6+ | XG PL 4-1-1 |
| Frein 53500, v1.1.0.5 | XG PL 4-1 |
| Frein 44750 | XG PL 5-1 |
| Frein 50500/55310, v1.1.0.6+ | XG PL 4-3-3 |
| Frein 50500/55310, v1.1.0.5 | XG PL 4-3-2 |
| Frein 44700, v1.1.0.6+ | XG PL 4-2-3 |
| Frein 44700, v1.1.0.5 | XG PL 4-2-2 |

**BM 10000 / 10000MX** : détecté par version 2.x.x.x OU code 50620 OU "bm"/"10000" dans le modèle.

#### Pollution
| sousType | Feuille |
|----------|---------|
| ECOSHIELD | ECOOPAOBD |
| ECOPOL | ECOPOL |
| ACTIGAS_OPA + OPA version LAN3 | OPA OBD 6C SK18 |
| ACTIGAS_OPA + OPA version LAN2 | OPA OBD C6 SK08 |
| ACTIGAS + AG SK18 | AG OPA OBD 6C SK18 |
| ACTIGAS + AG SK08 | AG OPA OBD C6 SK08 |

#### Classe L — `getSheetName(section)` avec certOtclan
Le **certOtclan du sonomètre** (suffixe 4 chiffres) détermine la feuille :

| Configuration | cert 0223 | cert 0225/inconnu | cert 0226 | cert 0227 |
|--------------|-----------|-------------------|-----------|-----------|
| Céléromètre seul | — | 0231SEUL | — | — |
| Céléro à distance | — | CELERODISTANCE | — | — |
| Sonomètre seul (LAN4) | 0223LAN5 | 0225SONO | 0226LAN5 | 0227LAN5 |
| Sonomètre seul (LAN5) | 0223LAN5 | 0225LAN5 | 0226LAN5 | 0227LAN5 |
| **Sono + Célero combinés** | 0223CELERO | 0225SONOCELERO | 0226CELERO | 0227CELERO |

**IMPORTANT** : si **sono ET célero** sont tous deux cochés → **une seule section** `sousType: 'SONOCELERO'` → **un seul PDF**. Ne jamais créer deux sections séparées.

#### Autres
| Type | Feuille |
|------|---------|
| reglophare, SMARTLYNX | RPH 5 |
| reglophare, 764-8 | RPH 4-1 |
| reglophare, RPH 6 | RPH 6 (⚠️ critères à préciser) |
| decelero, MAXI | DECELERO MAXI |
| decelero, MINI | DECELERO MINI+ |
| paj | PAJ |

### 4.4 Cellules des feuilles template (vérifiées sur xlsm)

#### VL (toutes variantes XG + FOG)
| Cellule | Contenu |
|---------|---------|
| F21 | N° série pupitre (absent OTCLAN → vide) |
| G21 | Texte fixe ", version logiciel " |
| H21 | Version numérique X.X.X.X **extraite** de versionLog OTCLAN |
| G23 | N° série freinomètre |
| G24 | N° série suspension |
| G25 | N° série ripage (si présent) |
| F16 | N° attestation |
| J18/J19 | Nom / Adresse |
| J21/J22 | CP / Ville (standard) |
| J20/J21 | CP / Ville pour : XG 2-6, 2-7, VL+ 2-2, 2-4 |

**ATTENTION** : écrire uniquement la partie numérique de la version (ex: `1.1.2.5` depuis `1.1.2.5 LAN2.00`). Ne pas écrire la chaîne complète.

#### PL Control Room (XG PL 1-4, 1-5)
G21=SN pupitre, H21=version numérique, F23=SN frein

#### PL standard (XG PL 4-x, 5-1)
F21=SN pupitre, G21=texte avec version (remplacer la version), F23=SN frein

#### 10000MX PL 1-2
H21=SN pupitre, I21=texte fixe version (ne pas écraser), F23=SN frein

#### PL layout client
J20=CP, J21=ville pour : XG PL 4-2-2

#### Pollution ACTIGAS (AG OPA OBD C6 SK08 / 6C SK18)
I20=SN AG, H21=SN OPA, F22=SN OBD | G16=N° | J21/J22=CP/Ville

#### Pollution ACTIGAS_OPA (OPA OBD C6 SK08 / 6C SK18)
H20=SN OPA, F21=SN OBD | G16=N° | J20/J21=CP/Ville pour SK18

#### Classe L 0225SONOCELERO
G20=SN sono, G21=SN calibreur, G22=SN célero | G16=N° | J20/J21=CP/Ville

### 4.5 fillClientInfo — layout CP/Ville
**J20=CP, J21=Ville** (non-standard) pour :
- XG 2-6, XG 2-7, XG VL+ 2-2, XG VL+ 2-4, XG PL 4-2-2
- OPA OBD 6C SK18, AG OBD 4-3
- 0225SONOCELERO, 0231SEUL, CELERODISTANCE, 0223SEUL, 0223CELERO, 0223LAN5

**J21=CP, J22=Ville** (standard) pour toutes les autres feuilles.

### 4.6 Version logicielle dans les attestations
- OTCLAN retourne `versionLog` = ex: `1.1.2.5 LAN2.00`
- Dans le template, écrire **uniquement** `1.1.2.5` (regex `\d+\.\d+\.\d+\.\d+`)
- Les feuilles ont une version hardcodée différente (ex: XG 2-5 a `1.1.2.6`) → **toujours écraser** avec la version OTCLAN

### 4.7 CL cross-linking (agrément Classe L invisible)
Les agréments CL (L-type) n'apparaissent pas dans la correspondance. Lien via **numéros de série partagés des équipements pollution** (analyseur, opacimètre, OBD — pas les équipements mécaniques).

### 4.8 Sonomètre lié à la pollution (`certGroups`)
Si un sonomètre partage son `certOtclan` avec un AG/OPA/OBD → il est inclus dans l'attestation pollution combinée → **ne pas cocher Classe L séparément**.

---

## 5. HISTORIQUE OTCLAN — `data/otclan_history.json`

### Règle fondamentale
**On n'efface JAMAIS une entrée** (matériel peut être hors ligne).

### Clé d'entrée
```
"agrement|materielConcerne|numSerie"
```

### Remplacement de matériel
Si le client change un N° de série → popup de confirmation → `POST /api/equipement/replace-sn`

---

## 6. API ENDPOINTS

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/search?q=` | Recherche clients |
| GET | `/api/client/:id` | Données complètes + équipements + certGroups |
| POST | `/api/demandes` | Soumettre une demande d'attestation |
| POST | `/api/demandes/:id/valider` | Valider et générer les PDFs |
| PUT | `/api/demandes/:id` | Modifier une demande (matériels + sheetOverride) |
| POST | `/api/preview-sheets` | Calculer les feuilles prévues + alternatives |
| POST | `/api/upload-excel` | Upload nouveaux fichiers OTCLAN/contrats |
| POST | `/api/equipement/replace-sn` | Remplacement N° de série dans l'historique |
| GET | `/api/config` | Configuration serveur |
| GET | `/admin.html` | Console administration |

### Body `/api/preview-sheets`
```json
{ "sections": [ { "type": "ct", "sousType": "VL", "materiels": [...] } ] }
```
Retourne `[{ "computed": "XG 2-5", "alternatives": ["XG 2", "XG 2-4", "XG 2-5", ...] }]`

### `sheetOverride` dans une section
Si `section.sheetOverride` est défini, il est utilisé à la place de `getSheetName(section)` lors de la génération PDF.

---

## 7. FORMULAIRE CLIENT (index.html / client.js)

### Blocs de demande
| ID bloc | Type | Champs |
|---------|------|--------|
| block-ct | CT VL/PL | pupitre, freinage, ripage, suspension (VL) / pupitre, freinage (PL) |
| block-rph | Règle phare | type: SMARTLYNX ou 764-8 |
| block-pol | Anti-pollution | type: ACTIGAS/ACTIGAS_OPA/ECOSHIELD/ECOPOL |
| block-cl | Classe L | céléromètre (+ certOtclan) / sonomètre + calibreur (+ certOtclan) |
| block-dec | Décéléromètre | type: Autostop Maxi/Mini |
| block-paj | PAJ | centrale hydraulique + châssis |

### Sélecteur chaîne FOG (CT VL uniquement)
Dans chaque ligne VL, radio "Type chaîne" : **XG Standard** (défaut) / **FOG VL** / **FOG VL+**. Ces matériels ne sont pas dans l'OTCLAN → saisie manuelle obligatoire.

### Classe L — règle SONOCELERO
- **Sono seul** → section `sousType: 'SONOMETRE'` → 1 PDF
- **Célero seul** → section `sousType: 'CELEROMETRE'` → 1 PDF
- **Sono + Célero** → section `sousType: 'SONOCELERO'` → **1 seul PDF combiné**

Le `certOtclan` du sonomètre détermine la feuille combinée. Le `certOtclanCel` (céléromètre) est stocké en complément.

### Suivi des changements de N° de série
- `originalEquipValues` stocke les SN pré-remplis depuis la BDD
- Modification → popup de confirmation → appel API `replace-sn`

---

## 8. CONSOLE ADMIN (admin.html / admin.js)

### Fonctionnalités
- Tableau de bord + statistiques
- Demandes en attente : voir détail, valider, marquer NC
- Modal de détail : édition client + matériels + **sélecteur de feuille par section**

### Sélecteur de feuille (section par section)
Chaque section affiche la feuille qui sera générée (calculée par le serveur via `/api/preview-sheets`).
- **Bandeau bleu + "auto"** : feuille calculée automatiquement
- **Bandeau jaune + "modifiée"** : feuille forcée manuellement
- Menu déroulant avec **uniquement les feuilles compatibles** avec le type de section
- L'override est sauvegardé dans `section.sheetOverride` et persisté en base

---

## 9. STRUCTURE DES 75 FEUILLES DU TEMPLATE

### Feuilles actives (générées par le système)
**VL** : XG 2, XG 2-4, XG 2-5, XG 2-6, XG 2-7, XG VL+ 2-2, XG VL+ 2-4, XG VL+ 2-5, XG UPG 2-4, XG UPG 2-5, FOG VL, FOG VL+

**PL** : XG PL 1-4, XG PL 1-5, XG PL 4-1, XG PL 4-1-1, XG PL 4-2-2, XG PL 4-2-3, XG PL 4-3-2, XG PL 4-3-3, XG PL 5-1, 10000MX PL 1-2

**Pollution** : ECOOPAOBD, ECOPOL, OPA OBD C6 SK08, OPA OBD 6C SK18, AG OPA OBD C6 SK08, AG OPA OBD 6C SK18

**Classe L** : 0231SEUL, CELERODISTANCE, 0225SONO, 0225LAN5, 0225SONOCELERO, 0223SEUL, 0223LAN5, 0223CELERO, 0226LAN5, 0226CELERO, 0227LAN5, 0227CELERO

**Autres** : RPH 4-1, RPH 5, RPH 6, DECELERO MAXI, DECELERO MINI+, PAJ

### Feuilles legacy (existantes dans le template, non générées automatiquement)
FOG AG OPA, FOG OPA OBD — pour pollution FOG (équipements hors OTCLAN Muller)

0212, 0213FULL, 0213POL+OBD, 0212POL+OBD, 0212GAZSONO, 0212ASOBD, 0213ASOBD, OTC219, 0214SONO, 0226, 0227, 223ECO, 223ECOSONO, A02, AG OPA 204, AG OPA MOTO, AG OBD 4-2, AG OBD 4-3, OPA OBD 3-9, OPA OBD 4-3, AG OPA OBD 3-4, AG OPA OBD 3-9, XG PL 4-3-1

---

## 10. DÉPENDANCES npm

```json
{
  "express": "^5.2.1",
  "xlsx": "^0.18.5",
  "xlsx-populate": "^1.21.0",
  "multer": "^2.1.1",
  "nodemailer": "^8.0.5",
  "cors": "^2.8.6",
  "pdf-lib": "^1.17.1",
  "pdfkit": "^0.18.0"
}
```

**LibreOffice** doit être installé sur le PC pour la conversion xlsm → PDF.

---

## 11. POINTS D'ATTENTION / PIÈGES CONNUS

1. **HLT / SMARTLYNX** : OTCLAN classe parfois `$PRO HLT OPTICAL UNIT PTI L` en opacimètre. Post-processing dans `loadExcelData()` le reclassifie en réglophare.

2. **CL agréments** : Les centres CL ont deux agréments distincts (VL et L-type). Le L-type n'est jamais dans la correspondance. Cross-linking via SNs des équipements **pollution seulement** (pas mécaniques).

3. **Version logicielle** : OTCLAN retourne `1.1.2.5 LAN2.00`. N'écrire en H21 que `1.1.2.5`. La version hardcodée dans le template (ex: `1.1.2.6` dans XG 2-5) doit être **toujours écrasée** par la version OTCLAN réelle.

4. **N° de série pupitre VL** : Le pupitre VL n'est pas dans l'OTCLAN. F21 sera vide dans l'attestation. Normal.

5. **SONOCELERO** : sono + célero ensemble = 1 seule section, 1 seul PDF. Ne jamais créer deux sections séparées.

6. **sheetOverride** : si présent dans une section, il est utilisé à la place du calcul automatique. Persiste dans db.json.

7. **FOG VL/VL+** : pas dans l'OTCLAN Muller. Saisie manuelle uniquement via la radio "Type chaîne" dans le formulaire. Modèles : CLS.750CT-VL/CLS.750FR-ENS1 (VL), CLS.750CT-VL+/CLS.750FR-ENS2 (VL+).

8. **BM 10000 / 10000MX** : détecté par version majeure ≥ 2, ou "50620"/"10000"/"bm" dans le modèle → feuille `10000MX PL 1-2`.

9. **SK08 limite** : Exactement `101/18` = SK18 (≥ 101). `100/18` = SK08.

10. **Processus Node.js** : Après modification de server.js, tuer l'ancien processus AVANT de relancer.

11. **Upload OTCLAN** : Les nouveaux fichiers remplacent les anciens dans `/data/` MAIS l'historique `otclan_history.json` est cumulatif.

---

## 12. FONCTIONNALITÉS RÉALISÉES (état au 2026-04-13)

- [x] Recherche client multi-critères (agrément, compte, nom, ville)
- [x] Chargement données OTCLAN VL / PL / CL
- [x] Cross-linking CL via SNs pollution uniquement
- [x] Tableau équipements détectés (étape 2 du formulaire)
- [x] Auto-sélection des types d'attestation
- [x] Badge SK08 / SK18 par ligne pollution (multi-lignes)
- [x] Sonomètre lié à pollution (certGroups) → ne pas cocher Classe L séparément
- [x] Historique OTCLAN cumulatif (jamais de suppression)
- [x] Popup confirmation remplacement N° de série
- [x] API replace-sn (supprime ancien, crée nouveau)
- [x] Reclassification $PRO HLT = Réglophare (jamais Opacimètre)
- [x] AT605 = Opacimètre ACTIGAS, AT505 = Analyseur de gaz
- [x] N-REGLEPHARE CCD TOUCH = modèle 764-8
- [x] Génération PDF via LibreOffice + envoi email
- [x] Console administration (upload fichiers, suivi demandes)
- [x] Correction N° de série = XXX : handler générique pour toutes variantes VL/PL
- [x] Correction version logicielle : extraction partie numérique uniquement (1.1.2.5 LAN2.00 → 1.1.2.5)
- [x] Analyse complète des 75 feuilles : cellules, layout CP/Ville, N° attestation
- [x] Correction fillClientInfo j20j21Sheets pour XG 2-6/2-7, VL+ 2-2/2-4, PL 4-2-2, OPA SK18
- [x] Sélection OPA OBD 6C SK18 selon version LAN3 de l'opacimètre
- [x] Support FOG VL / FOG VL+ (saisie manuelle, radio dans formulaire CT VL)
- [x] Détection BM 10000 / 10000MX par version 2.x ou nom modèle
- [x] Modal admin : feuille prévisionnelle + menu déroulant de remplacement par section
- [x] SONOCELERO : sono + célero cochés ensemble → 1 seul PDF combiné

---

## 13. EN SUSPENS / PROCHAINES SESSIONS

- [ ] **RPH 6** : troisième feuille réglophare (UTAC N°17/ESV/07841-1 + 22/LAN/ECE/0188). Quand utiliser RPH 6 vs RPH 5 ?
- [ ] Détection automatique remplacement SN dans l'historique (nouveau fichier OTCLAN : même agrément+matériel, ancien SN absent, nouveau SN présent)
- [ ] Affichage de l'historique des remplacements dans la console admin
- [ ] Validation email avant soumission
- [ ] Prévisualisation de l'attestation avant envoi
