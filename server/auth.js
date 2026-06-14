'use strict';
/**
 * auth.js — Google-Login (OAuth 2.0 Authorization-Code-Flow, Redirect).
 *
 *   GET /api/auth/google    -> 302 zu Googles Consent-Screen
 *   GET /api/auth/callback  -> Code gegen id_token tauschen (server-to-server,
 *                              mit Client-Secret), Account + Session anlegen,
 *                              zurück zum Spiel mit  #sess=<token>&name=<name>
 *   POST /api/auth/logout   -> { token } Session löschen
 *
 * Das id_token kommt direkt von Googles Token-Endpoint über TLS -> wir
 * dekodieren nur den Payload (kein Signatur-Check nötig, vgl. Google-Doku).
 * Sessions liegen in der DB (revozierbar); kein JWT-Lib nötig.
 */
const https = require('https');
const crypto = require('crypto');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_HOST = 'oauth2.googleapis.com', TOKEN_PATH = '/token';

module.exports = function createAuth(db, cfg) {
  const enabled = !!(cfg.clientId && cfg.clientSecret);
  const states = new Map();                 // state -> expiry (CSRF, kurzlebig)
  const site = cfg.siteUrl || 'https://pokemon.celox.io';
  const redirectUri = cfg.redirectUri || (site + '/api/auth/callback');

  function tokenExchange(code) {
    const body = new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString();
    return new Promise((res, rej) => {
      const req = https.request({ host: TOKEN_HOST, path: TOKEN_PATH, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, r => {
        let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
      });
      req.on('error', rej); req.write(body); req.end();
    });
  }
  const decodeJwt = jwt => { try { return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString()); } catch (e) { return null; } };

  function readBody(req) { return new Promise(res => { let b = ''; req.on('data', c => { b += c; if (b.length > 4000) req.destroy(); }); req.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res({}); } }); }); }

  /** Behandelt /api/auth/* — true, wenn erledigt. */
  async function handle(req, res, u) {
    if (!u.pathname.startsWith('/api/auth/')) return false;

    if (u.pathname === '/api/auth/google' && req.method === 'GET') {
      if (!enabled) { res.writeHead(302, { Location: site + '#autherr=disabled' }); res.end(); return true; }
      const state = crypto.randomBytes(12).toString('hex');
      const nonce = (u.searchParams.get('n') || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
      states.set(state, { exp: Date.now() + 300000, nonce });
      const url = AUTH_URL + '?' + new URLSearchParams({ client_id: cfg.clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state, access_type: 'online', prompt: 'select_account' });
      res.writeHead(302, { Location: url }); res.end(); return true;
    }

    if (u.pathname === '/api/auth/callback' && req.method === 'GET') {
      const code = u.searchParams.get('code'), state = u.searchParams.get('state');
      const st = states.get(state); states.delete(state);
      for (const [k, v] of states) if (v.exp < Date.now()) states.delete(k);
      if (!enabled || !code || !st || st.exp < Date.now()) { res.writeHead(302, { Location: site + '#autherr=1' }); res.end(); return true; }
      try {
        const tok = await tokenExchange(code);
        const claims = tok.id_token && decodeJwt(tok.id_token);
        if (!claims || !claims.sub) { res.writeHead(302, { Location: site + '#autherr=1' }); res.end(); return true; }
        const name = (claims.name || claims.email || 'TRAINER').slice(0, 16);
        db.upsertAccount({ sub: claims.sub, email: claims.email, name });
        const session = crypto.randomBytes(24).toString('base64url');
        db.createSession(session, claims.sub, name);
        res.writeHead(302, { Location: site + '#sess=' + session + '&name=' + encodeURIComponent(name) + '&n=' + encodeURIComponent(st.nonce || '') }); res.end();
      } catch (e) { res.writeHead(302, { Location: site + '#autherr=1' }); res.end(); }
      return true;
    }

    if (u.pathname === '/api/auth/logout' && req.method === 'POST') {
      const p = await readBody(req);
      if (p.token) db.deleteSession(String(p.token));
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return true;
    }
    return false;
  }

  return { enabled, handle };
};
