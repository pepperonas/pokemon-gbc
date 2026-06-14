'use strict';
/**
 * sync.js — Cloud-Speicherstand-Sync (anonym, ohne PII).
 *
 * Ein Spielstand ist ein kleiner JSON-String, abgelegt unter einem
 * geräteunabhängigen Sync-Code (6 Zeichen). Auf einem zweiten Gerät denselben
 * Code eingeben -> Stand ziehen. localStorage bleibt die lokale Wahrheit; die
 * Cloud ist Sync/Backup darüber. Konflikt = Last-Write-Wins per updated_at.
 *
 * Speicher: SQLite (better-sqlite3). Endpunkte (JSON, same-origin via nginx):
 *   GET  /api/save?code=XXXXXX        -> { save, updated_at } | 404
 *   POST /api/save  {code, save}      -> { ok, updated_at }
 *   GET  /api/health                  -> { ok, saves }
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const CODE_RE = /^[A-Z2-9]{6}$/;
const MAX_SAVE = 200000;        // 200 KB Obergrenze pro Stand

module.exports = function createSync(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'saves.db'));
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS saves (code TEXT PRIMARY KEY, save_json TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  const qGet = db.prepare('SELECT save_json, updated_at FROM saves WHERE code = ?');
  const qPut = db.prepare(`INSERT INTO saves (code, save_json, updated_at) VALUES (?, ?, ?)
                           ON CONFLICT(code) DO UPDATE SET save_json = excluded.save_json, updated_at = excluded.updated_at`);
  const qCount = db.prepare('SELECT COUNT(*) AS n FROM saves');

  // einfaches Rate-Limit pro IP (Schreibschutz gegen Missbrauch)
  const hits = new Map();
  function rateOk(ip) {
    const now = Date.now(), w = hits.get(ip) || { t: now, n: 0 };
    if (now - w.t > 10000) { w.t = now; w.n = 0; }
    w.n++; hits.set(ip, w);
    return w.n <= 30;          // max 30 Requests / 10 s / IP
  }

  const CORS = {
    'Access-Control-Allow-Origin': '*',          // same-origin in Prod; * erlaubt lokale Dev/Selbst-Hosting
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', ...CORS }); res.end(JSON.stringify(obj)); };

  /** Liefert true, wenn die Anfrage hier behandelt wurde. */
  return function handleHttp(req, res) {
    let u; try { u = new URL(req.url, 'http://x'); } catch (e) { return false; }
    if (!u.pathname.startsWith('/api/')) return false;
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return true; }
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (!rateOk(ip)) { json(res, 429, { error: 'rate' }); return true; }

    if (u.pathname === '/api/health' && req.method === 'GET') {
      json(res, 200, { ok: true, saves: qCount.get().n }); return true;
    }
    if (u.pathname === '/api/save' && req.method === 'GET') {
      const code = (u.searchParams.get('code') || '').toUpperCase();
      if (!CODE_RE.test(code)) { json(res, 400, { error: 'bad-code' }); return true; }
      const row = qGet.get(code);
      if (!row) { json(res, 404, { error: 'not-found' }); return true; }
      json(res, 200, { save: row.save_json, updated_at: row.updated_at }); return true;
    }
    if (u.pathname === '/api/save' && req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > MAX_SAVE) req.destroy(); });
      req.on('end', () => {
        let p; try { p = JSON.parse(body); } catch (e) { return json(res, 400, { error: 'bad-json' }); }
        const code = String(p.code || '').toUpperCase();
        if (!CODE_RE.test(code)) return json(res, 400, { error: 'bad-code' });
        if (typeof p.save !== 'string' || p.save.length > MAX_SAVE) return json(res, 400, { error: 'bad-save' });
        try { JSON.parse(p.save); } catch (e) { return json(res, 400, { error: 'bad-save' }); }
        const updated_at = Date.now();
        qPut.run(code, p.save, updated_at);
        json(res, 200, { ok: true, updated_at });
      });
      return true;
    }
    json(res, 404, { error: 'not-found' });
    return true;
  };
};
