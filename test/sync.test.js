'use strict';
// HTTP-API (server/sync.js) über einen echten http-Server mit einer
// Datenschicht im Speicher — ohne SQLite, ohne Netzwerk nach draußen.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const createSync = require('../server/sync.js');

function memDb() {
  const saves = new Map(), sessions = new Map([['good', { sub: 'g1', name: 'ASH' }]]);
  return {
    saves,
    saveGet: c => saves.get(c),
    savePut: (c, j, u) => saves.set(c, { save_json: j, updated_at: u }),
    saveCount: () => saves.size,
    getSession: t => sessions.get(t) || null,
    leaderboard: () => [{ name: 'A', elo: 1016, wins: 1, losses: 0 }],
    rank: id => (id === 'TR-A' ? { name: 'A', elo: 1016, wins: 1, losses: 0, rank: 1, total: 1 } : null),
    listReplays: () => [],
    getReplay: () => null,
  };
}

async function start(t, db = memDb()) {
  const handle = createSync(db);
  const srv = http.createServer((req, res) => { if (!handle(req, res)) { res.writeHead(418); res.end(); } });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (p, opts = {}) => {
    const r = await fetch(base + p, opts);
    const text = await r.text();
    return { status: r.status, headers: r.headers, body: text ? JSON.parse(text) : null };
  };
  const post = (p, body, headers = {}) => call(p, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } });
  return { db, call, post };
}

const save = (caught, badges = 0) => JSON.stringify({ caught: Array.from({ length: caught }, (_, i) => i + 1), badges });

test('Nicht-API-Pfade werden nicht behandelt', async t => {
  const { call } = await start(t);
  assert.equal((await call('/index.html')).status, 418);
});

test('Speichern und Laden über den Code (Groß/Klein egal)', async t => {
  const { post, call } = await start(t);
  const r = await post('/api/save', { code: 'abc234', save: save(3) });
  assert.equal(r.status, 200);
  assert.ok(r.body.ok);
  const g = await call('/api/save?code=ABC234');
  assert.equal(g.status, 200);
  assert.equal(JSON.parse(g.body.save).caught.length, 3);
  assert.equal((await call('/api/save?code=ZZZZ22')).status, 404);
});

test('Code-Format wird geprüft (keine 0/1, genau 6 Zeichen)', async t => {
  const { post, call } = await start(t);
  for (const code of ['ABC12', 'ABC1234', 'ABC01Z', 'AB-234', '']) {
    assert.equal((await post('/api/save', { code, save: save(1) })).status, 400, code);
  }
  assert.equal((await call('/api/save?code=ABC10Z')).status, 400);
});

test('Ungültiger Stand wird abgewiesen', async t => {
  const { post } = await start(t);
  assert.equal((await post('/api/save', { code: 'ABC234', save: '{kaputt' })).status, 400);
  assert.equal((await post('/api/save', { code: 'ABC234', save: { caught: [] } })).status, 400, 'save muss String sein');
});

test('Fortschritts-Schutz: weniger Gefangene überschreibt nicht (außer force)', async t => {
  const { post, db } = await start(t);
  await post('/api/save', { code: 'ABC234', save: save(10, 2) });
  const r = await post('/api/save', { code: 'ABC234', save: save(1) });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'less-progress');
  assert.equal(r.body.incomingCaught, 1);
  assert.equal(r.body.existingCaught, 10);
  assert.equal(JSON.parse(db.saves.get('ABC234').save_json).caught.length, 10, 'Bestand unberührt');

  assert.equal((await post('/api/save', { code: 'ABC234', save: save(10, 1) })).status, 409, 'weniger Orden');
  assert.equal((await post('/api/save', { code: 'ABC234', save: save(10, 2) })).status, 200, 'gleich viel ist ok');
  assert.equal((await post('/api/save', { code: 'ABC234', save: save(11, 0) })).status, 200, 'mehr Gefangene schlägt Orden');
  assert.equal((await post('/api/save', { code: 'ABC234', save: save(0), force: true })).status, 200);
});

test('Globales Limit greift nur für neue Codes', async t => {
  const db = memDb();
  db.saveCount = () => 100000;
  const { post } = await start(t, db);
  assert.equal((await post('/api/save', { code: 'NEW234', save: save(1) })).status, 503);
  db.saves.set('OLD234', { save_json: save(1), updated_at: 1 });
  assert.equal((await post('/api/save', { code: 'OLD234', save: save(2) })).status, 200);
});

test('Konto-Speicherstand braucht eine gültige Sitzung', async t => {
  const { post, call, db } = await start(t);
  assert.equal((await call('/api/account/save')).status, 401);
  assert.equal((await call('/api/account/save', { headers: { Authorization: 'Bearer falsch' } })).status, 401);
  const auth = { Authorization: 'Bearer good' };
  assert.equal((await call('/api/account/save', { headers: auth })).status, 404);
  assert.equal((await post('/api/account/save', { save: save(5) }, auth)).status, 200);
  assert.ok(db.saves.has('acct:g1'), 'Schlüssel ist an das Konto gebunden');
  assert.equal((await post('/api/account/save', { save: save(2) }, auth)).status, 409);
});

test('Rang und Replay-IDs werden validiert', async t => {
  const { call } = await start(t);
  assert.equal((await call('/api/rank?id=TR-A')).status, 200);
  assert.equal((await call('/api/rank?id=TR-NOPE')).status, 404);
  assert.equal((await call('/api/rank?id=' + 'x'.repeat(13))).status, 400);
  assert.equal((await call('/api/rank?id=a%27b')).status, 400);
  assert.equal((await call('/api/replay?id=..%2Fetc')).status, 400);
  assert.equal((await call('/api/leaderboard')).body.top.length, 1);
});

test('CORS: nur erlaubte Origins werden gespiegelt', async t => {
  const { call } = await start(t);
  const ok = await call('/api/health', { headers: { Origin: 'https://pokemon.celox.io' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://pokemon.celox.io');
  const local = await call('/api/health', { headers: { Origin: 'http://localhost:8080' } });
  assert.equal(local.headers.get('access-control-allow-origin'), 'http://localhost:8080');
  for (const o of ['https://evil.example', 'https://pokemon.celox.io.evil.example', 'http://pokemon.celox.io']) {
    const r = await call('/api/health', { headers: { Origin: o } });
    assert.equal(r.headers.get('access-control-allow-origin'), null, o);
  }
});

test('Rate-Limit: ab der 41. Anfrage in 10 s ist Schluss', async t => {
  const { call } = await start(t);
  const codes = [];
  for (let i = 0; i < 42; i++) codes.push((await call('/api/health')).status);
  assert.ok(codes.slice(0, 40).every(c => c === 200));
  assert.equal(codes[40], 429);
});
