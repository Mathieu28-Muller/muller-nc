# Guide opérateur — Traitement des demandes d'attestation
## Muller Automotive — Console d'administration

---

## Accès

```
http://localhost:3003/admin.html
```

**Identifiants opérateur** : fournis par l'administrateur Muller Automotive.

> Les opérateurs ont accès aux demandes (tableau de bord, en attente, non-conformes, archives) et aux mises à jour de fichiers Excel. Les menus **Configuration** et **Comptes** sont réservés aux administrateurs.

---

## Connexion

1. Saisir le **login** et le **mot de passe** fournis
2. Cliquer sur **Connexion**
3. En cas d'erreur : "Identifiants incorrects" → vérifier la saisie ou contacter l'administrateur

---

## Tableau de bord

La page d'accueil affiche 4 compteurs :

| Compteur | Description |
|----------|-------------|
| En attente | Demandes reçues non encore traitées |
| Non conformes | Demandes renvoyées pour correction |
| Envoyées aujourd'hui | Attestations générées et envoyées dans la journée |
| Total archives | Nombre total d'attestations validées |

Le tableau "Dernières demandes" liste les 10 demandes les plus récentes avec leur statut.

---

## Demandes en attente

Menu **⏳ En attente** : liste toutes les demandes à traiter.

Pour chaque demande :
- **Date** de réception
- **Nom du centre**
- **Email** destinataire
- **Types** d'attestation demandés

### Actions disponibles

| Bouton | Action |
|--------|--------|
| **Voir** | Ouvre la fiche détaillée |
| **✓ Valider** | Génère les PDF directement (sans ouvrir la fiche) |
| **✗ NC** | Marque la demande comme non conforme |

---

## Traitement d'une demande — Fiche détaillée

Cliquer sur **Voir** pour ouvrir la fiche complète.

### Informations centre (éditables)

Les champs suivants peuvent être corrigés avant validation :
- Nom du centre, agrément, compte client
- Adresse, code postal, ville
- Téléphone, email

### Feuille de certificat par section

Pour chaque type d'attestation demandé, un bandeau indique **quelle feuille du modèle DOC-A-31 sera utilisée** :

| Bandeau | Signification |
|---------|---------------|
| Fond bleu — **auto** | Feuille sélectionnée automatiquement selon les équipements |
| Fond jaune — **modifiée** | Feuille forcée manuellement lors d'une session précédente |

Un menu déroulant permet de **changer la feuille** si la sélection automatique est incorrecte. La liste propose uniquement les feuilles compatibles avec le type de section concerné.

> Exemple : pour un CT VL, le menu proposera XG 2, XG 2-4, XG 2-5, XG 2-6, XG 2-7, XG VL+ 2-2/2-4/2-5, XG UPG 2-4/2-5, FOG VL, FOG VL+.

### Matériels (éditables)

Le tableau des matériels par section peut être corrigé :
- **Modèle** : référence commerciale
- **N° de série** : numéro de série physique
- **Version logiciel** : version firmware

### Boutons de la fiche

| Bouton | Action |
|--------|--------|
| **Fermer** | Ferme sans modifier ni valider |
| **✗ Non conforme** | Demande une raison et marque la demande NC |
| **✓ Valider et générer PDF** | Enregistre toutes les modifications et génère les attestations |

---

## Validation et génération des PDF

Cliquer sur **✓ Valider et générer PDF** (dans la fiche) ou **✓ Valider** (dans la liste).

Le serveur :
1. Enregistre les modifications éventuelles (champs client, matériels, feuille choisie)
2. Remplit le modèle Excel DOC-A-31 avec les données du centre et des équipements
3. Convertit chaque feuille en PDF via LibreOffice
4. Envoie les PDF par email au centre

Une fenêtre de confirmation apparaît avec des liens de téléchargement pour chaque PDF généré.

### Nombre de PDF générés

| Situation | Nombre de PDF |
|-----------|---------------|
| CT VL seul | 1 PDF |
| CT VL + CT PL | 2 PDF |
| Anti-pollution seule | 1 PDF |
| Classe L sono seul OU célero seul | 1 PDF |
| Classe L sono **ET** célero | 1 PDF combiné |
| Plusieurs types d'attestation | 1 PDF par type |

---

## Marquer une demande Non Conforme (NC)

Cliquer sur **✗ NC** (liste) ou **✗ Non conforme** (fiche), puis saisir la raison dans la fenêtre de saisie.

La demande passe en statut **Non conforme** avec la raison visible.

> Le centre doit alors soumettre une nouvelle demande corrigée, ou l'opérateur peut corriger directement depuis la fiche et revalider.

---

## Demandes non conformes

Menu **⚠️ Non conformes** : liste les demandes marquées NC.

Les mêmes actions sont disponibles : **Voir** pour corriger, **Valider** pour générer les PDF.

---

## Archives

Menu **📁 Archives** : toutes les attestations validées.

### Recherche
Saisir dans le champ de recherche : nom du centre, N° de série, numéro d'agrément, numéro d'attestation… puis cliquer sur **Rechercher**.

### Téléchargement
Dans la colonne Actions, cliquer sur le bouton **N° attestation** pour télécharger directement le PDF correspondant.

---

## Mise à jour des fichiers Excel OTCLAN

Menu **📤 Mise à jour Excel** : permet d'importer de nouveaux fichiers de données.

### Fichiers acceptés
- `suivi_otclan_vl_*.xlsx` — données équipements VL
- `suivi_otclan_pl_*.xlsx` — données équipements PL
- `suivi_otclan_cl_*.xlsx` — données équipements Classe L
- `Base_contrats.xlsx` — contrats équipements
- `correspondance compte client - n° agrément.xlsx` — correspondances comptes/agréments

### Procédure d'import
1. Glisser-déposer le ou les fichiers dans la zone prévue, **ou** cliquer sur la zone pour sélectionner les fichiers
2. Le statut d'import s'affiche pour chaque fichier :
   - ✅ **importé avec succès**
   - ❌ **erreur** (format incorrect ou fichier non reconnu)

> **Important** : l'historique OTCLAN (`otclan_history.json`) est **cumulatif**. Un upload ne supprime jamais les données passées — il enrichit l'historique. Les fichiers dans le dossier `/data/` sont remplacés, mais l'historique est conservé.

---

## Statuts des demandes

| Statut | Signification |
|--------|---------------|
| **En attente** | Reçue, en cours de traitement |
| **Non conforme** | Renvoyée pour correction |
| **Validée** | PDF générés et envoyés |

---

## Déconnexion

Cliquer sur **Déconnexion** en haut à droite. La session est effacée immédiatement.
