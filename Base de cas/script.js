// Données chargées dynamiquement depuis /api/data
let baseDeDonnees = {};
let documentsPannes = {};

/* ── Ancien bloc conservé en commentaire (ne plus modifier manuellement) ──
const baseDeDonnees_BACKUP = {
    "CT": {
        "GAMME XG": ["XG_VL", "XG_PL","Sécurité_PL"],
        "GAMME ACTIGAS": ["ACTIGAS","ACTIGAS_AT505", "ACTIGAS_AT605", "ACTIGAS_EOBD"],
        "GAMME ECOSHIELD": ["ECOSHIELD","ECOSHIELD_ECOGAS100", "ECOSHIELD_ECOOPA100", "ECOSHIELD_ECOOBD100"],
        "RÈGLE PHARE": ["764-8", "SMARTLYNX"],
        "SONOMÈTRE & CÉLÉROMÈTRE": ["SLM50", "CEL50"]
    },
    "MRA": {
        "DÉMONTE PNEU": ["4888", "MDP126", "MDP"],
        "ÉQUILIBREUSE": ["EQ126", "EQ"],
        "GÉOMÉTRIE": ["8668", "GTR628", "XPERT_II"],
        "CLIMATISATION": ["ECK_NEXT", "ECK_FLAG", "ECK_TWIN"],
        "PONT ÉLÉVATEUR": ["Argos", "Quadra", "Satellite"]
    }
};

── fin du backup */

let gammeSelectionnee = "CT";
const getParam = (name) => new URLSearchParams(window.location.search).get(name);

// ============================================================
// --- SYSTÈME DE POPUP MODAL ---
// ============================================================

function creerModal() {
    // Évite de créer plusieurs fois le modal
    if (document.getElementById("modal-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "modal-overlay";
    overlay.innerHTML = `
        <div id="modal-container">
            <div id="modal-header">
                <span id="modal-title"></span>
                <button id="modal-close" title="Fermer">✕</button>
            </div>
            <div id="modal-body">
                <iframe id="modal-iframe" src="" frameborder="0" allowfullscreen></iframe>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Fermeture via le bouton ✕
    document.getElementById("modal-close").onclick = fermerModal;

    // Fermeture en cliquant sur le fond grisé (hors de la fenêtre)
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) fermerModal();
    });

    // Fermeture avec la touche Echap
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") fermerModal();
    });

    // Injection du style CSS du modal
    const style = document.createElement("style");
    style.textContent = `
        #modal-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.75);
            z-index: 9999;
            justify-content: center;
            align-items: center;
            padding: 20px;
            box-sizing: border-box;
        }
        #modal-overlay.actif {
            display: flex;
        }
        #modal-container {
            background: #fff;
            border-radius: 8px;
            width: 95vw;
            max-width: 1100px;
            height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            overflow: hidden;
        }
        #modal-header {
            background: #2b2b2b;
            color: white;
            padding: 12px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-shrink: 0;
        }
        #modal-title {
            font-weight: bold;
            font-size: 1rem;
            font-family: 'Segoe UI', Arial, sans-serif;
        }
        #modal-close {
            background: #c00000;
            color: white;
            border: none;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            font-size: 1rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        #modal-close:hover {
            background: #900000;
        }
        #modal-body {
            flex: 1;
            overflow: hidden;
        }
        #modal-iframe {
            width: 100%;
            height: 100%;
            border: none;
            display: block;
        }
        @media (max-width: 600px) {
            #modal-container {
                width: 100vw;
                height: 100vh;
                border-radius: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

function ouvrirModal(url, titre) {
    creerModal();
    document.getElementById("modal-title").innerText = titre;
    document.getElementById("modal-iframe").src = url;
    document.getElementById("modal-overlay").classList.add("actif");
    document.body.style.overflow = "hidden"; // Bloque le scroll de la page
}

function fermerModal() {
    const overlay = document.getElementById("modal-overlay");
    if (overlay) {
        overlay.classList.remove("actif");
        document.getElementById("modal-iframe").src = ""; // Stoppe la lecture vidéo / PDF
        document.body.style.overflow = ""; // Réactive le scroll
    }
}

// ============================================================
// --- FONCTION DE NAVIGATION ---
// ============================================================

window.filtrerGamme = (gamme) => {
    if (document.getElementById("machines")) {
        gammeSelectionnee = gamme;
        document.getElementById('btn-CT').className = (gamme === 'CT') ? 'btn-cat active' : 'btn-cat';
        document.getElementById('btn-MRA').className = (gamme === 'MRA') ? 'btn-cat active' : 'btn-cat';
        render();
    } else {
        window.location.href = `../index.html?gamme=${gamme}`;
    }
};

// ============================================================
// --- AFFICHAGE ACCUEIL ---
// ============================================================

const render = (filter = "") => {
    const container = document.getElementById("machines");
    if(!container) return;
    container.innerHTML = ""; 
    const searchTerm = filter.toLowerCase().trim();
    const categoriesAffichees = baseDeDonnees[gammeSelectionnee] || {};

    for (const [nomCat, listeMachines] of Object.entries(categoriesAffichees)) {
        const machinesFiltrees = listeMachines.filter(m => {
            const matchNom = m.toLowerCase().includes(searchTerm);
            const pannes = documentsPannes[m] || [];
            return matchNom || pannes.some(p => p.name.toLowerCase().includes(searchTerm));
        });

        if (machinesFiltrees.length > 0) {
            const section = document.createElement("div");
            section.className = "category-section";
            section.innerHTML = `<h2 class="category-header">${nomCat}</h2>`;
            const grid = document.createElement("div");
            grid.className = "grid";

            machinesFiltrees.forEach(m => {
                const card = document.createElement("div");
                card.className = "card";
                const pannes = documentsPannes[m] || [];
                const panneTrouvee = searchTerm !== "" ? pannes.find(p => p.name.toLowerCase().includes(searchTerm)) : null;

                card.innerHTML = `<h3>${m.replaceAll("_", " ")}</h3>`;
                if(panneTrouvee) {
                    const info = document.createElement("div");
                    info.className = "resultat-recherche";
                    info.innerText = `Trouvé: ${panneTrouvee.name}`;
                    card.appendChild(info);
                }
                
                card.onclick = () => window.location.href = `machine/index.html?machine=${m}&gamme=${gammeSelectionnee}`;
                grid.appendChild(card);
            });
            section.appendChild(grid);
            container.appendChild(section);
        }
    }
};

// ============================================================
// --- AFFICHAGE PAGE DÉTAIL ---
// ============================================================

const chargerPageDetail = () => {
    const filesContainer = document.getElementById("files");
    if (!filesContainer) return;

    const m = getParam("machine");
    const gamme = getParam("gamme") || "CT";
    const searchInput = document.getElementById("search-detail");

    if (m) {
        document.getElementById("machineTitle").innerText = m.replaceAll("_", " ");
        const fichiers = documentsPannes[m] || [];

        const afficherFichiers = (filter = "") => {
            filesContainer.innerHTML = "";
            const term = filter.toLowerCase();
            const filtres = fichiers.filter(f => f.name.toLowerCase().includes(term));

            if (filtres.length === 0) {
                filesContainer.innerHTML = "<p>Aucun document trouvé.</p>";
            } else {
                filtres.forEach(f => {
                    const card = document.createElement("div");
                    card.className = "card";
                    
                    // Gestion des icônes selon l'extension
                    let icon = "📄"; // Par défaut PDF
                    if (f.file.endsWith('.mp4')) icon = "🎥";
                    if (f.file.endsWith('.html')) icon = "🌐";
                    
                    card.innerHTML = `<b>${icon} ${f.name}</b>`;
                    
                    // Ouvre le fichier dans un popup modal au lieu d'un nouvel onglet
                    const urlFichier = `../media/${gamme}/${m}/${encodeURIComponent(f.file)}`;
                    card.onclick = () => ouvrirModal(urlFichier, f.name);
                    
                    filesContainer.appendChild(card);
                });
            }
        };

        afficherFichiers();
        if(searchInput) searchInput.addEventListener("input", (e) => afficherFichiers(e.target.value));
    }
};

// ============================================================
// --- INIT ---
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
    // Chargement des données depuis l'API
    try {
        const res  = await fetch('/api/data');
        const data = await res.json();
        baseDeDonnees   = data.baseDeDonnees;
        documentsPannes = data.documentsPannes;
    } catch { console.error('Impossible de charger les données depuis /api/data'); }

    const gammeUrl = getParam("gamme");
    if (gammeUrl) gammeSelectionnee = gammeUrl;

    creerModal();
    render();
    chargerPageDetail();

    const s = document.getElementById("search");
    if(s) s.addEventListener("input", (e) => render(e.target.value));
});
