'use strict';
/**
 * server.js — Autoritativer WebSocket-Server für PvP-Kämpfe.
 *
 * Schiedsrichter-Prinzip: Clients senden nur ABSICHTEN (Zug/Wechsel). Der
 * Server baut die Teams selbst aus Spezies + Level (server/species.json),
 * berechnet Stats/Schaden/RNG mit der GETEILTEN Engine (battle-core.js) und
 * broadcastet identische Event-Listen. Manipulierte Client-Stats sind wirkungslos.
 *
 * Protokoll: siehe MULTIPLAYER_PLAN.md §4. Port via $PORT (Default 4250).
 */
const { WebSocketServer } = require('ws');

// Geteilte Engine + Spezies-Tabelle (Deploy kopiert battle-core.js daneben).
let BC; try { BC = require('./battle-core.js'); } catch (e) { BC = require('../js/battle-core.js'); }
const SPECIES = require('./species.json');

const PORT = parseInt(process.env.PORT || '4250', 10);
const LEVEL_CAP = 50;          // „Flat-50"-Regelwerk: faire Kämpfe (Plan §5)
const MAX_TEAM = 6;
const TURN_TIMEOUT = 30000;    // ms pro Zug, sonst Auto-Aktion
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };

let seedCounter = 1;           // deterministischer Seed pro Match (kein Math.random nötig)
function nextSeed() { return (seedCounter = (seedCounter * 1103515245 + 12345) & 0x7fffffff); }
function roomCode() { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }

// ------------------------------------------------------- Team-Validierung ---
/** Client-Team [{id,level}] -> autoritative Kampf-Mons (Server rechnet neu). */
function buildTeam(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_TEAM) return null;
  const team = [];
  for (const m of raw) {
    const id = m && (m.id | 0);
    if (!SPECIES[id]) return null;
    const level = Math.max(1, Math.min(LEVEL_CAP, (m.level | 0) || LEVEL_CAP));
    team.push(BC.makeBattleMon(SPECIES[id], level));
  }
  return team;
}

const publicMon = m => ({ id: m.id, level: m.level, maxHp: m.stats.hp, hp: m.hp, status: m.status });
const selfMon   = m => ({ id: m.id, level: m.level, maxHp: m.stats.hp, hp: m.hp, status: m.status,
                          moves: m.moves.map(mv => ({ name: mv.name, type: mv.type, power: mv.power, acc: mv.acc })) });
const aliveIdx  = team => team.map((m, i) => (m.hp > 0 ? i : -1)).filter(i => i >= 0);

// ------------------------------------------------------------------ Match ---
class Match {
  constructor(a, b) {
    this.id = 'B' + nextSeed().toString(36);
    this.players = [a, b];
    this.teams = [null, null];
    this.state = null;
    this.rng = BC.makeRng(nextSeed());
    this.phase = 'team';                 // 'team' | 'choose' | 'forceswitch' | 'done'
    this.pending = [null, null];
    this.timer = null;
    a.c.match = b.c.match = this;
    a.c.side = 0; b.c.side = 0 + 1;
    a.c.status = b.c.status = 'match';
    send(a, { t: 'matched', battleId: this.id, you: 0, oppId: b.c.id });
    send(b, { t: 'matched', battleId: this.id, you: 1, oppId: a.c.id });
  }

  other(side) { return this.players[1 - side]; }

  onTeam(side, raw) {
    if (this.phase !== 'team' || this.teams[side]) return;
    const team = buildTeam(raw);
    if (!team) { send(this.players[side], { t: 'error', code: 'bad-team' }); return; }
    this.teams[side] = team;
    if (this.teams[0] && this.teams[1]) this.start();
  }

  start() {
    this.state = BC.makeBattleState(this.teams[0], this.teams[1]);
    for (let s = 0; s < 2; s++) {
      send(this.players[s], {
        t: 'start', you: s,
        self: this.teams[s].map(selfMon),
        opp:  this.teams[1 - s].map(publicMon),
      });
    }
    this.requestChoose();
  }

  requestChoose() {
    this.phase = 'choose';
    this.pending = [null, null];
    for (let s = 0; s < 2; s++) {
      const sd = this.state.sides[s];
      send(this.players[s], { t: 'request', turn: this.state.turn + 1, kind: 'choose',
        options: { canSwitch: aliveIdx(sd.team).filter(i => i !== sd.active) } });
    }
    this.arm(() => {                       // Timeout -> fehlende Aktion = Move 0
      for (let s = 0; s < 2; s++) if (!this.pending[s]) this.pending[s] = { kind: 'move', move: 0 };
      this.resolve();
    });
  }

  onAction(side, msg) {
    if (this.phase !== 'choose' || this.pending[side]) return;
    const sd = this.state.sides[side];
    let act = null;
    if (msg.kind === 'move') {
      const idx = msg.data | 0;
      if (idx >= 0 && idx < sd.team[sd.active].moves.length) act = { kind: 'move', move: idx };
    } else if (msg.kind === 'switch') {
      const to = msg.data | 0;
      if (to !== sd.active && sd.team[to] && sd.team[to].hp > 0) act = { kind: 'switch', to };
    }
    if (!act) act = { kind: 'move', move: 0 };
    this.pending[side] = act;
    if (this.pending[0] && this.pending[1]) this.resolve();
  }

  resolve() {
    this.disarm();
    const { events } = BC.resolveTurn(this.state, this.pending, this.rng);
    this.broadcast({ t: 'turn', turn: this.state.turn, events });
    if (this.state.winner != null) return this.end(this.state.winner, 'ko');
    if (this.state.pendingSwitch[0] || this.state.pendingSwitch[1]) return this.requestForceSwitch();
    this.requestChoose();
  }

  requestForceSwitch() {
    this.phase = 'forceswitch';
    this.pending = [null, null];
    for (let s = 0; s < 2; s++) {
      if (!this.state.pendingSwitch[s]) { this.pending[s] = 'ok'; continue; }
      send(this.players[s], { t: 'request', turn: this.state.turn, kind: 'forceswitch',
        options: { switchTo: aliveIdx(this.state.sides[s].team) } });
    }
    this.arm(() => {                       // Timeout -> erstes lebendes Mon
      for (let s = 0; s < 2; s++) if (this.pending[s] !== 'ok' && this.pending[s] == null) {
        const to = aliveIdx(this.state.sides[s].team)[0];
        this.applySwitch(s, to);
      }
      this.finishForceSwitch();
    });
  }

  onForceSwitch(side, msg) {
    if (this.phase !== 'forceswitch' || !this.state.pendingSwitch[side] || this.pending[side] != null) return;
    const to = msg.data | 0;
    const ok = this.state.sides[side].team[to] && this.state.sides[side].team[to].hp > 0;
    this.applySwitch(side, ok ? to : aliveIdx(this.state.sides[side].team)[0]);
    if ((this.pending[0] != null) && (this.pending[1] != null)) this.finishForceSwitch();
  }

  applySwitch(side, to) {
    const events = BC.applyForcedSwitch(this.state, side, to);
    this.broadcast({ t: 'turn', turn: this.state.turn, events });
    this.pending[side] = 'done';
  }

  finishForceSwitch() {
    this.disarm();
    this.requestChoose();
  }

  arm(fn) { this.disarm(); this.timer = setTimeout(fn, TURN_TIMEOUT); }
  disarm() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }

  broadcast(obj) { this.players.forEach(p => send(p, obj)); }

  end(winnerSide, reason) {
    if (this.phase === 'done') return;
    this.phase = 'done'; this.disarm();
    for (let s = 0; s < 2; s++) {
      send(this.players[s], { t: 'end', result: winnerSide === s ? 'win' : 'lose', reason });
      if (this.players[s].c) { this.players[s].c.match = null; this.players[s].c.status = 'idle'; }
    }
  }

  onLeave(side) {                          // Disconnect/Abbruch mitten im Kampf
    if (this.phase === 'done') return;
    this.end(1 - side, 'disconnect');
  }
}

// ------------------------------------------------------------ Matchmaking ---
const queue = [];                 // wartende Clients (Schnellkampf)
const rooms = new Map();          // code -> wartender Host

function leaveLobby(ws) {
  const qi = queue.indexOf(ws); if (qi >= 0) queue.splice(qi, 1);
  if (ws.c.roomCode && rooms.get(ws.c.roomCode) === ws) rooms.delete(ws.c.roomCode);
  ws.c.roomCode = null;
}

function tryQuickMatch(ws) {
  leaveLobby(ws);
  while (queue.length) {
    const other = queue.shift();
    if (other.readyState === 1 && other !== ws) { new Match(other, ws); return; }
  }
  queue.push(ws); ws.c.status = 'queue';
}

function createRoom(ws) {
  leaveLobby(ws);
  let code; do { code = roomCode(); } while (rooms.has(code));
  rooms.set(code, ws); ws.c.roomCode = code; ws.c.status = 'host';
  send(ws, { t: 'room', code });
}

function joinRoom(ws, code) {
  code = String(code || '').toUpperCase();
  const host = rooms.get(code);
  if (!host || host.readyState !== 1 || host === ws) { send(ws, { t: 'error', code: 'no-room' }); return; }
  rooms.delete(code); host.c.roomCode = null;
  new Match(host, ws);
}

// --------------------------------------------------------------- Server ---
// Nur Loopback — Erreichbarkeit ausschliesslich über den nginx-wss-Proxy.
const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });
wss.on('listening', () => console.log(`pkmn-battle-server lauscht auf 127.0.0.1:${PORT}`));

wss.on('connection', (ws) => {
  ws.c = { id: null, ver: null, status: 'idle', match: null, side: 0, roomCode: null };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (buf) => {
    let msg; try { msg = JSON.parse(buf); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    const m = ws.c.match;
    switch (msg.t) {
      case 'hello':  ws.c.id = String(msg.id || '?').slice(0, 12); ws.c.ver = msg.ver; send(ws, { t: 'welcome', id: ws.c.id }); break;
      case 'queue':  if (!m) tryQuickMatch(ws); break;
      case 'create': if (!m) createRoom(ws); break;
      case 'join':   if (!m) joinRoom(ws, msg.code); break;
      case 'cancel': leaveLobby(ws); ws.c.status = 'idle'; break;
      case 'team':   if (m) m.onTeam(ws.c.side, msg.mons); break;
      case 'action':
        if (m) { if (m.phase === 'choose') m.onAction(ws.c.side, msg); else if (m.phase === 'forceswitch') m.onForceSwitch(ws.c.side, msg); }
        break;
      case 'ping':   send(ws, { t: 'pong' }); break;
    }
  });

  ws.on('close', () => {
    leaveLobby(ws);
    if (ws.c.match) ws.c.match.onLeave(ws.c.side);
  });
  ws.on('error', () => {});
});

// Heartbeat: tote Sockets erkennen/aufräumen
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false; ws.ping();
  });
}, 20000).unref();

process.on('SIGTERM', () => wss.close(() => process.exit(0)));
