'use strict';
/**
 * sync.js — HTTP-API (JSON) auf der gemeinsamen Datenschicht (db.js):
 *   GET  /api/save?code=XXXXXX     -> { save, updated_at } | 404
 *   POST /api/save  {code, save}   -> { ok, updated_at }
 *   GET  /api/leaderboard          -> { top: [{name,elo,wins,losses}] }
 *   GET  /api/rank?id=TR-XXXX      -> { name,elo,wins,losses,rank,total } | 404
 *   GET  /api/health               -> { ok, saves }
 *
 * Cloud-Speicherstand-Sync ist anonym (6-Zeichen-Code), Last-Write-Wins. Daten
 * sind nicht sensibel (Spielstand); der Code ist ein Bearer-Secret („wer den
 * Code kennt, darf lesen/überschreiben" — bewusst, fürs Gerät-zu-Gerät-Teilen).
 */
const CODE_RE = /^[A-Z2-9]{6}$/;
const ID_RE = /^[\w-]{1,12}$/;
const MAX_SAVE = 200000;          // 200 KB pro Stand
const MAX_SAVES = 100000;         // globales Limit gegen Storage-Exhaustion

// Fortschritts-Schutz: ein Stand mit WENIGER Fortschritt darf einen besseren
// nicht still überschreiben. Maßstab: Anzahl gefangener Pokémon (monoton
// steigend), dann Orden. So kann ein neues/leeres Spiel keinen vollen
// Spielstand wegsynchronisieren.
const caughtCount = s => (s && Array.isArray(s.caught)) ? s.caught.length : 0;
function lessProgress(inc, exJson) {
  let ex; try { ex = JSON.parse(exJson); } catch (e) { return false; }
  const ci = caughtCount(inc), ce = caughtCount(ex);
  if (ci !== ce) return ci < ce;
  return (inc.badges || 0) < (ex.badges || 0);
}
const ALLOW_ORIGIN = /^https:\/\/pokemon\.celox\.io$|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

module.exports = function createSync(db) {
  // Rate-Limit mit Eviction + harter Map-Obergrenze (kein unbegrenztes Wachstum).
  const hits = new Map();
  function rateOk(ip) {
    const now = Date.now();
    if (hits.size > 5000) for (const [k, w] of hits) if (now - w.t > 10000) hits.delete(k);
    if (hits.size > 20000) return false;     // Notbremse bei Flut
    const w = hits.get(ip) || { t: now, n: 0 };
    if (now - w.t > 10000) { w.t = now; w.n = 0; }
    w.n++; hits.set(ip, w);
    return w.n <= 40;
  }

  // CORS: nur erlaubte Origins spiegeln (Prod + localhost). Sonst keine
  // CORS-Header -> Cross-Origin-Schreibzugriff Dritter scheitert; same-origin
  // (Prod via nginx) funktioniert ohnehin ohne CORS.
  function corsFor(origin) {
    const h = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Vary': 'Origin' };
    if (origin && ALLOW_ORIGIN.test(origin)) h['Access-Control-Allow-Origin'] = origin;
    return h;
  }

  return function handleHttp(req, res) {
    let u; try { u = new URL(req.url, 'http://x'); } catch (e) { return false; }
    if (!u.pathname.startsWith('/api/')) return false;
    const cors = corsFor(req.headers.origin);
    const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify(obj)); };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return true; }
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (!rateOk(ip)) { json(429, { error: 'rate' }); return true; }

    if (u.pathname === '/api/health' && req.method === 'GET') { json(200, { ok: true, saves: db.saveCount() }); return true; }
    if (u.pathname === '/api/leaderboard' && req.method === 'GET') { json(200, { top: db.leaderboard(20) }); return true; }
    if (u.pathname === '/api/replays' && req.method === 'GET') { json(200, { list: db.listReplays(20) }); return true; }
    if (u.pathname === '/api/replay' && req.method === 'GET') {
      const id = String(u.searchParams.get('id') || '');
      if (!/^[A-Za-z0-9]{1,16}$/.test(id)) { json(400, { error: 'bad-id' }); return true; }
      const r = db.getReplay(id);
      json(r ? 200 : 404, r || { error: 'not-found' }); return true;
    }
    if (u.pathname === '/api/rank' && req.method === 'GET') {
      const id = String(u.searchParams.get('id') || '');
      if (!ID_RE.test(id)) { json(400, { error: 'bad-id' }); return true; }
      const r = db.rank(id);
      json(r ? 200 : 404, r || { error: 'not-found' }); return true;
    }
    // Kontogebundener Speicherstand (Bearer-Session) — kein Code nötig.
    if (u.pathname === '/api/account/save') {
      const ah = req.headers.authorization || '';
      const sess = ah.startsWith('Bearer ') ? db.getSession(ah.slice(7)) : null;
      if (!sess) { json(401, { error: 'auth' }); return true; }
      const key = 'acct:' + sess.sub;
      if (req.method === 'GET') { const row = db.saveGet(key); json(row ? 200 : 404, row ? { save: row.save_json, updated_at: row.updated_at } : { error: 'not-found' }); return true; }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', c => { body += c; if (body.length > MAX_SAVE) req.destroy(); });
        req.on('end', () => {
          let p; try { p = JSON.parse(body); } catch (e) { return json(400, { error: 'bad-json' }); }
          if (typeof p.save !== 'string' || p.save.length > MAX_SAVE) return json(400, { error: 'bad-save' });
          let obj; try { obj = JSON.parse(p.save); } catch (e) { return json(400, { error: 'bad-save' }); }
          const existing = db.saveGet(key);
          if (existing && !p.force && lessProgress(obj, existing.save_json))
            return json(409, { error: 'less-progress', incomingCaught: caughtCount(obj), existingCaught: caughtCount(JSON.parse(existing.save_json)), updated_at: existing.updated_at });
          const updated_at = Date.now();
          db.savePut(key, p.save, updated_at);
          json(200, { ok: true, updated_at });
        });
        return true;
      }
      json(405, { error: 'method' }); return true;
    }

    if (u.pathname === '/api/save' && req.method === 'GET') {
      const code = (u.searchParams.get('code') || '').toUpperCase();
      if (!CODE_RE.test(code)) { json(400, { error: 'bad-code' }); return true; }
      const row = db.saveGet(code);
      json(row ? 200 : 404, row ? { save: row.save_json, updated_at: row.updated_at } : { error: 'not-found' }); return true;
    }
    if (u.pathname === '/api/save' && req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > MAX_SAVE) req.destroy(); });
      req.on('end', () => {
        let p; try { p = JSON.parse(body); } catch (e) { return json(400, { error: 'bad-json' }); }
        const code = String(p.code || '').toUpperCase();
        if (!CODE_RE.test(code)) return json(400, { error: 'bad-code' });
        if (typeof p.save !== 'string' || p.save.length > MAX_SAVE) return json(400, { error: 'bad-save' });
        let obj; try { obj = JSON.parse(p.save); } catch (e) { return json(400, { error: 'bad-save' }); }
        const existing = db.saveGet(code);
        if (!existing && db.saveCount() >= MAX_SAVES) return json(503, { error: 'full' });   // globales Cap
        if (existing && !p.force && lessProgress(obj, existing.save_json))
          return json(409, { error: 'less-progress', incomingCaught: caughtCount(obj), existingCaught: caughtCount(JSON.parse(existing.save_json)), updated_at: existing.updated_at });
        const updated_at = Date.now();
        db.savePut(code, p.save, updated_at);
        json(200, { ok: true, updated_at });
      });
      return true;
    }
    json(404, { error: 'not-found' });
    return true;
  };
};
