'use strict';
/**
 * db.js — gemeinsame SQLite-Datenschicht (better-sqlite3) für
 *   - Cloud-Speicherstände  (Tabelle `saves`)
 *   - Ranglisten/ELO         (Tabelle `players`)
 *
 * Identität fürs Ranking = die anonyme Trainer-ID (TR-XXXX, gerätelokal, aus
 * dem `hello`). Schnellkampf zählt für die Wertung, private Räume nicht.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const START_ELO = 1000;
const K = 32;

module.exports.open = function open(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'saves.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS saves (code TEXT PRIMARY KEY, save_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      elo INTEGER NOT NULL DEFAULT ${START_ELO},
      wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS replays (
      id TEXT PRIMARY KEY, name0 TEXT, name1 TEXT, winner INTEGER, ts INTEGER NOT NULL, data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts (
      sub TEXT PRIMARY KEY, email TEXT, name TEXT NOT NULL, created_at INTEGER NOT NULL, last_login INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, sub TEXT NOT NULL, name TEXT NOT NULL, expires INTEGER NOT NULL);
  `);

  const sGet = db.prepare('SELECT save_json, updated_at FROM saves WHERE code = ?');
  const sPut = db.prepare(`INSERT INTO saves (code, save_json, updated_at) VALUES (?, ?, ?)
                           ON CONFLICT(code) DO UPDATE SET save_json = excluded.save_json, updated_at = excluded.updated_at`);
  const sCount = db.prepare('SELECT COUNT(*) AS n FROM saves');
  const pGet = db.prepare('SELECT id, name, elo, wins, losses FROM players WHERE id = ?');
  const pPut = db.prepare(`INSERT INTO players (id, name, elo, wins, losses, updated_at) VALUES (@id, @name, @elo, @wins, @losses, @u)
                           ON CONFLICT(id) DO UPDATE SET name = excluded.name, elo = excluded.elo, wins = excluded.wins, losses = excluded.losses, updated_at = excluded.updated_at`);
  const pTop = db.prepare('SELECT name, elo, wins, losses FROM players ORDER BY elo DESC, updated_at ASC LIMIT ?');
  const pAbove = db.prepare('SELECT COUNT(*) AS n FROM players WHERE elo > ?');
  const pCount = db.prepare('SELECT COUNT(*) AS n FROM players');

  const getOrNew = (id, name) => pGet.get(id) || { id, name: name || id, elo: START_ELO, wins: 0, losses: 0 };

  /** ELO beider Spieler nach Sieg/Niederlage aktualisieren. */
  function applyElo(winId, winName, loseId, loseName) {
    const now = Date.now();
    const w = getOrNew(winId, winName), l = getOrNew(loseId, loseName);
    const expW = 1 / (1 + Math.pow(10, (l.elo - w.elo) / 400));
    const wNew = Math.round(w.elo + K * (1 - expW));
    const lNew = Math.round(l.elo + K * (0 - (1 - expW)));
    pPut.run({ id: winId, name: w.name, elo: wNew, wins: w.wins + 1, losses: w.losses, u: now });
    pPut.run({ id: loseId, name: l.name, elo: lNew, wins: l.wins, losses: l.losses + 1, u: now });
    return { winner: { elo: wNew, delta: wNew - w.elo }, loser: { elo: lNew, delta: lNew - l.elo } };
  }

  const rPut = db.prepare('INSERT INTO replays (id, name0, name1, winner, ts, data_json) VALUES (?, ?, ?, ?, ?, ?)');
  const rPrune = db.prepare('DELETE FROM replays WHERE id NOT IN (SELECT id FROM replays ORDER BY ts DESC LIMIT 50)');
  const rList = db.prepare('SELECT id, name0, name1, winner, ts FROM replays ORDER BY ts DESC LIMIT ?');
  const rGet = db.prepare('SELECT data_json FROM replays WHERE id = ?');

  function saveReplay(rec) {
    rPut.run(rec.id, rec.name0, rec.name1, rec.winner, Date.now(), JSON.stringify(rec.data));
    rPrune.run();                                  // nur die letzten 50 behalten
  }

  // --- Accounts + Sessions (Google-Login) ---
  const aPut = db.prepare(`INSERT INTO accounts (sub, email, name, created_at, last_login) VALUES (@sub, @email, @name, @now, @now)
                           ON CONFLICT(sub) DO UPDATE SET email = excluded.email, name = excluded.name, last_login = excluded.last_login`);
  const sehPut = db.prepare('INSERT OR REPLACE INTO sessions (token, sub, name, expires) VALUES (?, ?, ?, ?)');
  const seGet = db.prepare('SELECT sub, name, expires FROM sessions WHERE token = ?');
  const seDel = db.prepare('DELETE FROM sessions WHERE token = ?');
  const SESSION_MS = 90 * 24 * 3600 * 1000;

  return {
    saveGet: c => sGet.get(c),
    savePut: (c, j, u) => sPut.run(c, j, u),
    saveCount: () => sCount.get().n,
    upsertAccount: ({ sub, email, name }) => aPut.run({ sub, email: email || null, name, now: Date.now() }),
    createSession: (token, sub, name) => sehPut.run(token, sub, name, Date.now() + SESSION_MS),
    getSession: token => { const s = seGet.get(token); if (!s) return null; if (s.expires < Date.now()) { seDel.run(token); return null; } return { sub: s.sub, name: s.name }; },
    deleteSession: token => seDel.run(token),
    applyElo,
    leaderboard: (n = 20) => pTop.all(n),
    rank: id => { const p = pGet.get(id); return p ? { name: p.name, elo: p.elo, wins: p.wins, losses: p.losses, rank: pAbove.get(p.elo).n + 1, total: pCount.get().n } : null; },
    saveReplay,
    listReplays: (n = 20) => rList.all(n),
    getReplay: id => { const r = rGet.get(id); return r ? JSON.parse(r.data_json) : null; },
  };
};
