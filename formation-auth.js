/**
 * formation-auth.js — Protection des modules Formation CT / MRA / Sensibilisation
 * Utilise le même système d'authentification que la Base de cas (JWT localStorage 'ma_jwt')
 * Usage : ajouter en bas de chaque page protégée :
 *   <script src="/formation-auth.js"></script>
 *   <script>FA.init('CT');</script>  // CT | MRA | SENSIBILISATION
 */

(function () {
    const FA = window.FA = {

        MODULE: null,

        LABELS: {
            CT: 'Formation CT',
            MRA: 'Formation MRA',
            SENSIBILISATION: 'Sensibilisation'
        },

        ICONS: { CT: '🔧', MRA: '🚗', SENSIBILISATION: '📚' },

        // ── CSS injecté une seule fois ──────────────────────────────
        _injectCSS() {
            if (document.getElementById('fa-style')) return;
            const s = document.createElement('style');
            s.id = 'fa-style';
            s.textContent = `
#fa-gate{position:fixed;inset:0;background:#0a0a0a;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:'Segoe UI',Arial,sans-serif;}
#fa-gate *{box-sizing:border-box;}
.fa-box{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:40px 36px;width:100%;max-width:420px;box-shadow:0 24px 64px rgba(0,0,0,.7);}
.fa-logo{text-align:center;margin-bottom:24px;}
.fa-logo img{height:44px;object-fit:contain;}
.fa-title{font-family:'Segoe UI',Arial,sans-serif;font-size:1.5rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#f0f0f0;text-align:center;margin-bottom:4px;}
.fa-module{font-size:.75rem;letter-spacing:3px;text-transform:uppercase;color:#cd121d;text-align:center;margin-bottom:28px;}
.fa-field{margin-bottom:16px;}
.fa-label{display:block;font-size:.72rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#777;margin-bottom:6px;}
.fa-input{width:100%;padding:11px 14px;background:#111;border:1.5px solid #2a2a2a;border-radius:6px;color:#f0f0f0;font-size:.95rem;outline:none;transition:border-color .2s;}
.fa-input:focus{border-color:#cd121d;}
.fa-btn{width:100%;padding:12px;background:#cd121d;color:#fff;border:none;border-radius:6px;font-size:.95rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;margin-top:6px;transition:background .2s;}
.fa-btn:hover{background:#a00000;}
.fa-err{color:#ff6b6b;font-size:.83rem;margin-top:8px;text-align:center;min-height:20px;}
.fa-denied{text-align:center;}
.fa-denied .fa-denied-icon{font-size:3rem;margin-bottom:12px;}
.fa-denied h3{color:#f0f0f0;font-size:1.2rem;margin-bottom:8px;}
.fa-denied p{color:#777;font-size:.88rem;line-height:1.6;margin-bottom:20px;}
.fa-modules-list{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:20px;}
.fa-mod-tag{background:#1e1e1e;border:1px solid #333;border-radius:20px;padding:5px 14px;font-size:.78rem;color:#aaa;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px;transition:border-color .2s;}
.fa-mod-tag:hover{border-color:#cd121d;color:#f0f0f0;}
.fa-logout-link{color:#555;font-size:.78rem;cursor:pointer;display:block;text-align:center;margin-top:16px;transition:color .2s;}
.fa-logout-link:hover{color:#cd121d;}
.fa-spinner{text-align:center;color:#555;padding:40px 0;font-size:.9rem;}
            `;
            document.head.appendChild(s);
        },

        // ── Crée l'overlay ──────────────────────────────────────────
        _createGate() {
            if (document.getElementById('fa-gate')) return;
            const d = document.createElement('div');
            d.id = 'fa-gate';
            d.innerHTML = `<div class="fa-box" id="fa-box">
                <div class="fa-logo"><img src="https://www.mullerautomotive.fr/wp-content/uploads/2025/01/logo-Muller-automotive-full-1.png" alt="Muller"></div>
                <div class="fa-title">${this.ICONS[this.MODULE] || '🔒'} Accès sécurisé</div>
                <div class="fa-module">${this.LABELS[this.MODULE] || this.MODULE}</div>
                <div id="fa-content-inner"><div class="fa-spinner">Vérification en cours…</div></div>
            </div>`;
            document.body.appendChild(d);
        },

        // ── Affiche le formulaire de connexion ──────────────────────
        _showLogin(msg) {
            document.getElementById('fa-content-inner').innerHTML = `
                <form onsubmit="FA.login(event)">
                    <div class="fa-field">
                        <label class="fa-label">Identifiant</label>
                        <input class="fa-input" type="text" id="fa-user" autocomplete="username" autofocus placeholder="votre identifiant">
                    </div>
                    <div class="fa-field">
                        <label class="fa-label">Mot de passe</label>
                        <input class="fa-input" type="password" id="fa-pass" autocomplete="current-password" placeholder="••••••">
                    </div>
                    <button class="fa-btn" type="submit">Connexion →</button>
                    <div class="fa-err" id="fa-err">${msg || ''}</div>
                </form>
            `;
        },

        // ── Accès refusé — liste des modules autorisés ──────────────
        _showForbidden(name, modules) {
            const allowed = (modules || []).map(m =>
                `<a class="fa-mod-tag" href="/${m}/">${this.ICONS[m] || ''} ${this.LABELS[m] || m}</a>`
            ).join('');
            document.getElementById('fa-content-inner').innerHTML = `
                <div class="fa-denied">
                    <div class="fa-denied-icon">🔒</div>
                    <h3>Accès non autorisé</h3>
                    <p>Bonjour <strong style="color:#f0f0f0">${name}</strong>,<br>
                    vous n'avez pas accès au module <strong style="color:#cd121d">${this.LABELS[this.MODULE]}</strong>.<br>
                    Contactez un administrateur pour obtenir l'accès.</p>
                    ${allowed ? `<p style="color:#555;font-size:.8rem;margin-bottom:8px;">Vos modules autorisés :</p><div class="fa-modules-list">${allowed}</div>` : ''}
                    <a class="fa-logout-link" onclick="FA.logout()">← Se déconnecter</a>
                </div>
            `;
        },

        // ── Cache l'overlay — affiche le contenu ────────────────────
        _unlock(name) {
            const gate = document.getElementById('fa-gate');
            if (gate) gate.style.display = 'none';
            // Injecter le bouton de déconnexion dans le header si présent
            const hdr = document.querySelector('header, .site-header, .top-bar');
            if (hdr && name && !document.getElementById('fa-hdr-user')) {
                const wrap = document.createElement('div');
                wrap.id = 'fa-hdr-user';
                wrap.style.cssText = 'margin-left:auto;display:flex;align-items:center;gap:10px;font-size:.75rem;color:#888;';
                wrap.innerHTML = `<span style="color:#aaa">${name}</span> <button onclick="FA.logout()" style="background:none;border:1px solid #444;color:#888;padding:4px 10px;border-radius:4px;font-size:.72rem;cursor:pointer;letter-spacing:1px;text-transform:uppercase;" onmouseover="this.style.borderColor='#cd121d';this.style.color='#cd121d'" onmouseout="this.style.borderColor='#444';this.style.color='#888'">Déconnexion</button>`;
                hdr.appendChild(wrap);
            }
        },

        // ── Vérification principale ──────────────────────────────────
        async init(module) {
            this.MODULE = module;
            this._injectCSS();
            this._createGate();

            const token = localStorage.getItem('ma_jwt');
            if (!token) { this._showLogin(); return; }

            try {
                const r = await fetch(`/api/formation-access?module=${module}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (r.ok) {
                    const d = await r.json();
                    this._unlock(d.name);
                } else if (r.status === 403) {
                    const d = await r.json().catch(() => ({}));
                    this._showForbidden(d.name || '', d.modules || []);
                } else {
                    localStorage.removeItem('ma_jwt');
                    this._showLogin();
                }
            } catch {
                this._showLogin('Serveur inaccessible. Réessayez.');
            }
        },

        // ── Login ────────────────────────────────────────────────────
        async login(e) {
            e.preventDefault();
            const user = document.getElementById('fa-user').value.trim();
            const pass = document.getElementById('fa-pass').value;
            const errEl = document.getElementById('fa-err');
            if (!user || !pass) { errEl.textContent = 'Remplissez les deux champs.'; return; }
            errEl.textContent = '';
            try {
                const r = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user, pass })
                });
                const d = await r.json();
                if (d.result && d.result.startsWith('ok')) {
                    localStorage.setItem('ma_jwt', d.token);
                    this.init(this.MODULE);
                } else if (d.result === 'pending') {
                    errEl.textContent = 'Compte en attente de validation.';
                } else {
                    errEl.textContent = 'Identifiant ou mot de passe incorrect.';
                }
            } catch {
                errEl.textContent = 'Erreur de connexion. Réessayez.';
            }
        },

        // ── Déconnexion ──────────────────────────────────────────────
        logout() {
            localStorage.removeItem('ma_jwt');
            location.reload();
        }
    };
})();
