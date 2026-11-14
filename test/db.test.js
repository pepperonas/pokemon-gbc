'use strict';
// Datenschicht (server/db.js) gegen eine echte SQLite-Datei im Temp-Ordner.
// Braucht die Server-Abhängigkeiten:  npm ci --prefix server
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { open } = require('../server/db.js');

function fresh(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkmn-db-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return open(dir);
}

test('applyElo: gleiche Stärke -> +16 / -16, Siege und Niederlagen gezählt', t => {
  const db = fresh(t);
  const r = db.applyElo('TR-A', 'ASH', 'TR-B', 'GARY');
  assert.deepEqual(r, { winner: { elo: 1016, delta: 16 }, loser: { elo: 984, delta: -16 } });
  assert.deepEqual(db.rank('TR-A'), { name: 'ASH', elo: 1016, wins: 1, losses: 0, rank: 1, total: 2 });
  assert.deepEqual(db.rank('TR-B'), { name: 'GARY', elo: 984, wins: 0, losses: 1, rank: 2, total: 2 });
});

test('applyElo: Nullsumme und Außenseiter-Sieg bringt mehr', t => {
  const db = fresh(t);
  for (let i = 0; i < 10; i++) db.applyElo('TR-A', 'A', 'TR-B', 'B');   // A wird stark
  const before = db.rank('TR-A').elo + db.rank('TR-B').elo;
  const upset = db.applyElo('TR-B', 'B', 'TR-A', 'A');
  const after = db.rank('TR-A').elo + db.rank('TR-B').elo;
  assert.ok(Math.abs(after - before) <= 1, 'ELO entsteht nicht aus dem Nichts');
  assert.ok(upset.winner.delta > 16, `Außenseiter +${upset.winner.delta}`);
  assert.equal(upset.winner.delta, -upset.loser.delta);
  for (let i = 0; i < 50; i++) db.applyElo('TR-A', 'A', 'TR-B', 'B');
  assert.ok(db.applyElo('TR-A', 'A', 'TR-B', 'B').winner.delta >= 0, 'Favoritensieg nie negativ');
});

test('leaderboard sortiert nach ELO, rank zählt Bessere', t => {
  const db = fresh(t);
  db.applyElo('TR-A', 'A', 'TR-B', 'B');
  db.applyElo('TR-A', 'A', 'TR-C', 'C');
  const top = db.leaderboard(10);
  assert.equal(top[0].name, 'A');
  for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].elo >= top[i].elo);
  assert.equal(db.leaderboard(1).length, 1);
  assert.equal(db.rank('TR-unbekannt'), null);
});

test('Speicherstände: Upsert überschreibt, Zähler zählt Codes', t => {
  const db = fresh(t);
  db.savePut('ABC234', '{"a":1}', 1);
  db.savePut('ABC234', '{"a":2}', 2);
  db.savePut('XYZ789', '{}', 3);
  assert.deepEqual(db.saveGet('ABC234'), { save_json: '{"a":2}', updated_at: 2 });
  assert.equal(db.saveCount(), 2);
  assert.equal(db.saveGet('NOPE22'), undefined);
});

test('Replays: nur die letzten 50 bleiben', t => {
  const db = fresh(t);
  for (let i = 0; i < 55; i++) db.saveReplay({ id: 'R' + i, name0: 'A', name1: 'B', winner: 0, data: { i } });
  assert.equal(db.listReplays(100).length, 50);
  assert.deepEqual(db.getReplay('R54'), { i: 54 });
  assert.equal(db.getReplay('nix'), null);
});

test('Sitzungen: abgelaufene werden verworfen und gelöscht', t => {
  const db = fresh(t);
  db.createSession('tok', 'sub-1', 'ASH');
  assert.deepEqual(db.getSession('tok'), { sub: 'sub-1', name: 'ASH' });
  const realNow = Date.now;
  t.after(() => { Date.now = realNow; });
  Date.now = () => realNow() + 91 * 24 * 3600 * 1000;    // 91 Tage später
  assert.equal(db.getSession('tok'), null);
  Date.now = realNow;
  assert.equal(db.getSession('tok'), null, 'Sitzung wurde gelöscht, nicht nur ausgeblendet');
  db.createSession('t2', 'sub-1', 'ASH');
  db.deleteSession('t2');
  assert.equal(db.getSession('t2'), null);
});
