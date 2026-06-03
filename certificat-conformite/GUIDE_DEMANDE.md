# Guide utilisateur — Formulaire de demande d'attestation
## Muller Automotive — DOC-A-31

---

## Accès

Ouvrir un navigateur et saisir l'adresse :
```
http://localhost:3003
```

---

## Étape 1 — Trouver le centre de contrôle technique

### Recherche automatique
Dans le champ de recherche en haut de la page, saisir au moins 2 caractères parmi :
- Le **nom du centre**
- Le **numéro d'agrément** (ex : `A-075-XXXXX-01`)
- Le **numéro de compte client** (ex : `c188100000`)
- La **ville**

Les résultats apparaissent en liste déroulante. Cliquer sur le centre souhaité pour le sélectionner.

> Le système charge automatiquement les données OTCLAN (historique des équipements et versions logiciel) et pré-remplit le formulaire.

### Saisie manuelle
Si le centre ne figure pas dans la base, cliquer sur **"Saisie manuelle"**. Les champs restent vides et doivent être remplis à la main.

---

## Étape 2 — Vérifier les informations du centre

Une fois le centre sélectionné, les champs suivants sont pré-remplis :

| Champ | Description |
|-------|-------------|
| Agrément | Numéro d'agrément préfectoral |
| Compte client | Référence interne Muller |
| Nom du centre | Raison sociale |
| Adresse | Adresse postale complète |
| CP / Ville | Code postal et commune |
| Téléphone | Numéro de contact |
| Email | Adresse de destination des attestations |

**Vérifier et corriger si nécessaire** avant de continuer.

---

## Étape 3 — Tableau des équipements détectés

Le système affiche automatiquement tous les équipements connus pour ce centre (source : fichiers OTCLAN VL, PL, CL) :

| Colonne | Description |
|---------|-------------|
| Catégorie | VL / PL / CL |
| Matériel | Type d'équipement (Freinomètre, Opacimètre, etc.) |
| Modèle | Référence commerciale |
| N° de série | Numéro de série actuel |
| Version logiciel | Version issue de l'OTCLAN |
| N° cert. OTCLAN | Référence interne OTCLAN |

> Ce tableau est informatif. Il peut être réduit en cliquant sur "▼ réduire".

---

## Étape 4 — Sélectionner les attestations à générer

Cocher les blocs correspondant aux équipements à attester :

---

### Contrôle technique (CT)

Cocher **CT** puis sélectionner les sous-types :

#### VL (Véhicules Légers)
Pour chaque chaîne VL détectée, une ligne est créée avec :
- **Pupitre** : modèle / N° de série / version
- **Freinage** : modèle / N° de série / version
- **Ripage** : modèle / N° de série (facultatif)
- **Suspension** : modèle / N° de série (facultatif)

**Type de chaîne** : choisir parmi :
- `XG Standard` (par défaut, données pré-remplies depuis OTCLAN)
- `FOG VL` — chaîne FOG classique *(saisie manuelle obligatoire)*
- `FOG VL+` — chaîne FOG renforcée *(saisie manuelle obligatoire)*

> Les équipements FOG ne figurent pas dans l'OTCLAN Muller. Tous les champs doivent être saisis manuellement.

Bouton **"+ Ajouter une ligne VL"** si plusieurs chaînes VL sont présentes sur le site.

#### PL (Poids Lourds)
Même principe que VL, avec :
- **Pupitre** : modèle / N° de série / version
- **Freinage** : modèle / N° de série / version

---

### Règle phare (RPH)

Pour chaque réglophare détecté, une ligne est créée. Sélectionner le modèle :
- `SMARTLYNX` — réglophare optique (défaut si non identifié comme 764-8)
- `764-8` — modèle N-REGLEPHARE CCD TOUCH (sélectionné automatiquement si détecté)

---

### Anti-pollution

Sélectionner le type de matériel :

| Type | Équipements inclus |
|------|--------------------|
| ACTIGAS | Analyseur de gaz + Opacimètre + OBD |
| ACTIGAS_OPA | Opacimètre + OBD uniquement (sans analyseur de gaz) |
| ECOSHIELD | Système ECOSHIELD complet |
| ECOPOL | Analyseur de gaz ECOPOL |

Un badge **SK08** ou **SK18** s'affiche automatiquement à côté de chaque ligne en fonction du numéro de série de l'analyseur de gaz (format `NNN/AA`).

> **Règle SK08/SK18** : si l'année (AA) > 18 → SK18. Si AA = 18 et NNN ≥ 101 → SK18. Sinon → SK08.

---

### Classe L (bruit / vitesse)

Cocher les équipements présents :

#### Céléromètre
- Modèle / N° de série / version
- N° de certification OTCLAN (`certOtclan`)

#### Sonomètre
- Sonomètre : modèle / N° de série / version / N° cert. OTCLAN
- Calibreur : modèle / N° de série / version

**Règle combinée sono + célero** : si les deux sont cochés, **un seul certificat combiné** sera généré (non deux séparés).

> Si le sonomètre partage son numéro de certification avec un équipement anti-pollution, il est inclus dans le certificat pollution et n'a pas besoin d'être coché séparément en Classe L.

---

### Décéléromètre

Sélectionner le type :
- `Autostop Maxi`
- `Autostop Mini`

Saisir : modèle / N° de série / version.

---

### PAJ (Pont Arrière Jumelé)

Saisir les informations de la centrale hydraulique et du châssis.

---

## Changement de numéro de série

Si un numéro de série est modifié par rapport aux données OTCLAN :

1. Une fenêtre de confirmation apparaît
2. Choisir entre :
   - **Confirmer le remplacement** → l'ancien SN est archivé, le nouveau est enregistré
   - **Annuler** → le champ revient à la valeur d'origine

---

## Étape 5 — Envoyer la demande

Cliquer sur **"Envoyer la demande"** en bas de page.

La demande est transmise au service qualité Muller Automotive pour validation.

> Un email de confirmation vous est envoyé à l'adresse renseignée dans le formulaire.

---

## Après l'envoi

- La demande passe en statut **"En attente"** dans la console d'administration
- Après validation par l'opérateur, les attestations PDF sont générées et envoyées par email
- En cas de non-conformité, vous serez notifié avec la raison indiquée

---

## Questions fréquentes

**Le centre n'apparaît pas dans la recherche ?**
Utiliser la saisie manuelle. Contacter le service qualité si le centre doit être ajouté à la base.

**Dois-je remplir tous les champs de chaque équipement ?**
Le modèle et le N° de série sont obligatoires pour les équipements principaux (pupitre VL, freinomètre). Les autres champs (ripage, suspension) sont facultatifs.

**La version logiciel est déjà pré-remplie, dois-je la modifier ?**
Non, sauf si vous disposez d'une version plus récente. Le système utilise la dernière version connue dans l'OTCLAN.
