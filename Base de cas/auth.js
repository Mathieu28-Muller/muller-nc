/**
 * AUTH.JS — Muller Automotive
 * Authentification centralisée via API + JWT
 * JWT stocké en localStorage → partagé entre tous les onglets
 * getSession() / protegerPage() restent synchrones (décodage local du JWT)
 * login / register / gestion users → async (fetch vers /api/)
 */
const AUTH = (() => {

    const TOKEN_KEY = 'ma_jwt';

    /* ── Décoder le JWT côté client ── */
    function decodeJWT(token) {
        try {
            const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(atob(b64));
            if (payload.exp && Date.now() / 1000 > payload.exp) {
                localStorage.removeItem(TOKEN_KEY);
                return null;
            }
            return payload; // { user, role, name, iat, exp }
        } catch { return null; }
    }

    function getToken() { return localStorage.getItem(TOKEN_KEY); }

    function authHeaders() {
        const t = getToken();
        return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
    }

    /* ══════════════════════════════
       SYNCHRONES (lecture JWT local)
    ══════════════════════════════ */

    function getSession() {
        const token = getToken();
        if (!token) return null;
        return decodeJWT(token);
    }

    function protegerPage(role = 'any') {
        const session = getSession();
        if (!session) { window.location.href = 'login.html'; return null; }
        if (role === 'admin' && session.role !== 'admin') { window.location.href = 'index.html'; return null; }
        if (role === 'contributor' && !['admin','contributor'].includes(session.role)) { window.location.href = 'index.html'; return null; }
        return session;
    }

    function deconnecter() {
        localStorage.removeItem(TOKEN_KEY);
        window.location.href = 'login.html';
    }

    /* ══════════════════════════════
       ASYNCHRONES (appels API)
    ══════════════════════════════ */

    async function login(user, pass) {
        const res  = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, pass }) });
        const data = await res.json();
        if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
        return data.result; // 'ok_admin' | 'ok_user' | 'pending' | 'invalid'
    }

    async function register(name, user, pass, company) {
        const res  = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, user, pass, company }) });
        const data = await res.json();
        return data.result; // 'ok' | 'existe' | 'error'
    }

    async function listerUsers() {
        try {
            const res = await fetch('/api/users', { headers: authHeaders() });
            if (!res.ok) return [];
            return res.json();
        } catch { return []; }
    }

    async function validerUser(user) {
        await fetch(`/api/users/${encodeURIComponent(user)}/validate`, { method: 'PUT', headers: authHeaders() });
    }

    async function supprimerUser(user) {
        await fetch(`/api/users/${encodeURIComponent(user)}`, { method: 'DELETE', headers: authHeaders() });
    }

    async function changerRole(user, role) {
        await fetch(`/api/users/${encodeURIComponent(user)}/role`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ role }) });
    }

    async function changerMotDePasse(user, pass) {
        await fetch(`/api/users/${encodeURIComponent(user)}/password`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ pass }) });
    }

    async function creerUtilisateur(name, user, pass, role, company) {
        const res  = await fetch('/api/users', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name, user, pass, role, company }) });
        const data = await res.json();
        return data.result; // 'ok' | 'existe' | 'error'
    }

    /* ── API publique ── */
    return {
        login, register,
        listerUsers, validerUser, supprimerUser, changerRole, changerMotDePasse, creerUtilisateur,
        getSession, deconnecter, protegerPage
    };

})();
