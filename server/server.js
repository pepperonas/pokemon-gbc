'use strict';
/**
 * server.js — Autoritativer WebSocket-Server für PvP-Kämpfe.
 *
 * Schiedsrichter-Prinzip: Clients senden nur ABSICHTEN (Zug/Wechsel). Der
 * Server baut die Teams selbst aus Spezies + Level (server/species.json),
 * berechnet Stats/Schaden/RNG mit der GETEILTEN Engine (battle-core.js) und
 * broadcastet identische Event-Listen. Manipulierte Client-Stats sind wirkungslos.
 *
 * P2: Legendären-Klausel (Schnellkampf), Zug-Timer im Request, Reconnect
 * (Grace-Period + Resume per Token). Protokoll: MULTIPLAYER_PLAN.md §4.
 */
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

let BC; try { BC = require('./battle-core.js'); } catch (e) { BC = require('../js/battle-core.js'); }
const SPECIES = require('./species.json');
const createSync = require('./sync.js');

const PORT = parseInt(process.env.PORT || '4250', 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const db = require('./db.js').open(DATA_DIR);   // Saves + Rangliste (SQLite)
const LEVEL_CAP = 50;
const MAX_TEAM = 6;
const TURN_TIMEOUT = 30000;    // ms pro Zug
const GRACE_MS = 25000;        // Reconnect-Frist nach Disconnect
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LEGENDARY = new Set([144, 145, 146, 150, 151]);   // Arktos/Zapdos/Lavados/Mewtu/Mew

const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };

let seedCounter = 1;
function nextSeed() { return (seedCounter = (seedCounter * 1103515245 + 12345) & 0x7fffffff); }
function roomCode() { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
function token() { let t = ''; for (let i = 0; i < 16; i++) t += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return t; }

// ------------------------------------------------------- Team-Validierung ---
/** Client-Team [{id,level}] -> {team} oder {error}. Server rechnet Stats neu. */
function buildTeam(raw, clause) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_TEAM) return { error: 'bad-team' };
  const team = [];
  for (const m of raw) {
    const id = m && (m.id | 0);
    if (!SPECIES[id]) return { error: 'bad-team' };
    if (clause && clause.noLegendary && LEGENDARY.has(id)) return { error: 'no-legendary' };
    const level = Math.max(1, Math.min(LEVEL_CAP, (m.level | 0) || LEVEL_CAP));
    team.push(BC.makeBattleMon(SPECIES[id], level));
  }
  return { team };
}

const publicMon = m => ({ id: m.id, level: m.level, maxHp: m.stats.hp, hp: m.hp, status: m.status });
const selfMon   = m => ({ id: m.id, level: m.level, maxHp: m.stats.hp, hp: m.hp, status: m.status,
                          moves: m.moves.map(mv => ({ name: mv.name, type: mv.type, power: mv.power, acc: mv.acc })) });
const aliveIdx  = team => team.map((m, i) => (m.hp > 0 ? i : -1)).filter(i => i >= 0);

const activeMatches = new Map();   // token -> { match, side } (für Reconnect)

// ------------------------------------------------------------------ Match ---
class Match {
  constructor(a, b, clause, ranked) {
    this.id = 'B' + nextSeed().toString(36);
    this.players = [a, b];
    this.teams = [null, null];
    this.state = null;
    this.clause = clause || {};
    this.ranked = !!ranked;
    this.seed = nextSeed();
    this.rng = BC.makeRng(this.seed);
    this.log = [];                       // Aktions-Log für Replays (Seed + log -> deterministisch)
    this.phase = 'team';                 // 'team' | 'choose' | 'forceswitch' | 'done'
    this.pending = [null, null];
    this.timer = null;
    this.tokens = [token(), token()];
    this.disconnected = [false, false];
    this.grace = [null, null];
    for (let s = 0; s < 2; s++) {
      const ws = this.players[s];
      ws.c.match = this; ws.c.side = s; ws.c.status = 'match';
      activeMatches.set(this.tokens[s], { match: this, side: s });
      send(ws, { t: 'matched', battleId: this.id, you: s, oppId: this.players[1 - s].c.id, token: this.tokens[s], clause: this.clause });
    }
  }

  other(side) { return this.players[1 - side]; }

  onTeam(side, raw) {
    if (this.phase !== 'team' || this.teams[side]) return;
    const r = buildTeam(raw, this.clause);
    if (r.error) { send(this.players[side], { t: 'error', code: r.error }); this.abort(side); return; }
    this.teams[side] = r.team;
    if (this.teams[0] && this.teams[1]) this.start();
  }

  abort(offender) {                      // ungültiges Team -> Match auflösen
    if (this.phase === 'done') return;
    send(this.other(offender), { t: 'cancelled', reason: 'opp-team' });
    this.cleanup('idle');
  }

  start() {
    this.state = BC.makeBattleState(this.teams[0], this.teams[1]);
    for (let s = 0; s < 2; s++) {
      send(this.players[s], { t: 'start', you: s, self: this.teams[s].map(selfMon), opp: this.teams[1 - s].map(publicMon) });
    }
    this.requestChoose();
  }

  requestChoose() {
    this.phase = 'choose';
    this.pending = [null, null];
    for (let s = 0; s < 2; s++) this.sendRequest(s);
    this.arm(() => {
      for (let s = 0; s < 2; s++) if (!this.pending[s]) this.pending[s] = { kind: 'move', move: 0 };
      this.resolve();
    });
  }

  sendRequest(side) {
    if (this.phase === 'choose') {
      const sd = this.state.sides[side];
      send(this.players[side], { t: 'request', turn: this.state.turn + 1, kind: 'choose',
        deadline: TURN_TIMEOUT, options: { canSwitch: aliveIdx(sd.team).filter(i => i !== sd.active) } });
    } else if (this.phase === 'forceswitch' && this.state.pendingSwitch[side]) {
      send(this.players[side], { t: 'request', turn: this.state.turn, kind: 'forceswitch',
        deadline: TURN_TIMEOUT, options: { switchTo: aliveIdx(this.state.sides[side].team) } });
    }
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
    if (this.log.length < 300) this.log.push({ k: 't', a: this.pending.map(x => x.kind === 'switch' ? { kind: 'switch', to: x.to } : { kind: 'move', move: x.move }) });
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
      this.sendRequest(s);
    }
    this.arm(() => {
      for (let s = 0; s < 2; s++) if (this.pending[s] !== 'ok' && this.pending[s] == null) this.applySwitch(s, aliveIdx(this.state.sides[s].team)[0]);
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
    if (this.log.length < 300) this.log.push({ k: 's', side, to });
    const events = BC.applyForcedSwitch(this.state, side, to);
    this.broadcast({ t: 'turn', turn: this.state.turn, events });
    this.pending[side] = 'done';
  }

  finishForceSwitch() { this.disarm(); this.requestChoose(); }

  arm(fn) { this.disarm(); this.timer = setTimeout(fn, TURN_TIMEOUT); }
  disarm() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  broadcast(obj) { this.players.forEach(p => send(p, obj)); }

  // --- Reconnect ---------------------------------------------------------
  onLeave(side) {
    if (this.phase === 'done' || this.phase === 'team') { if (this.phase === 'team') this.cleanup('idle'); return; }
    if (this.disconnected[side]) return;
    this.disconnected[side] = true;
    send(this.other(side), { t: 'oppgone', grace: GRACE_MS });
    this.grace[side] = setTimeout(() => this.end(1 - side, 'disconnect'), GRACE_MS);
  }

  resume(ws, side) {
    if (this.phase === 'done') { send(ws, { t: 'error', code: 'no-match' }); return; }
    if (this.grace[side]) { clearTimeout(this.grace[side]); this.grace[side] = null; }
    this.disconnected[side] = false;
    this.players[side] = ws;
    ws.c.match = this; ws.c.side = side; ws.c.status = 'match';
    send(ws, { t: 'resync', you: side,
      self: this.teams[side].map(selfMon), opp: this.teams[1 - side].map(publicMon),
      aSelf: this.state.sides[side].active, aOpp: this.state.sides[1 - side].active, phase: this.phase });
    this.sendRequest(side);                       // ggf. offene Anfrage erneut
    send(this.other(side), { t: 'oppback' });
  }

  end(winnerSide, reason) {
    if (this.phase === 'done') return;
    let elo = null;                            // Wertung nur im Schnellkampf (ranked)
    if (this.ranked && (reason === 'ko' || reason === 'disconnect')) {
      const W = this.players[winnerSide].c, L = this.players[1 - winnerSide].c;
      try { elo = db.applyElo(W.id, W.name, L.id, L.name); } catch (e) {}
      if (this.log.length) try {
        const n0 = this.players[0].c.name, n1 = this.players[1].c.name;
        db.saveReplay({ id: 'R' + Date.now().toString(36) + nextSeed().toString(36).slice(-3), name0: n0, name1: n1, winner: winnerSide,
          data: { seed: this.seed, teamA: this.teams[0].map(m => ({ id: m.id, level: m.level })), teamB: this.teams[1].map(m => ({ id: m.id, level: m.level })), log: this.log, winner: winnerSide, name0: n0, name1: n1, ts: Date.now() } });
      } catch (e) {}
    }
    this.cleanup('idle', { winnerSide, reason, elo });
  }

  cleanup(status, endMsg) {
    this.phase = 'done'; this.disarm();
    this.grace.forEach(g => g && clearTimeout(g));
    this.tokens.forEach(t => activeMatches.delete(t));
    for (let s = 0; s < 2; s++) {
      if (endMsg) {
        const myElo = endMsg.elo ? (endMsg.winnerSide === s ? endMsg.elo.winner : endMsg.elo.loser) : null;
        send(this.players[s], { t: 'end', result: endMsg.winnerSide === s ? 'win' : 'lose', reason: endMsg.reason, elo: myElo });
      }
      const ws = this.players[s];
      if (ws && ws.c) { ws.c.match = null; ws.c.status = status; }
    }
  }
}

// ------------------------------------------------------------------ Trade ---
// Live-Tausch zwischen zwei Spielern: jeder bietet EIN Pokémon an, beide
// bestätigen, Server tauscht. Neues Angebot setzt Bestätigungen zurück.
function validTradeMon(m) {
  if (!m) return null;
  const id = m.id | 0;
  if (!SPECIES[id]) return null;
  return { id, level: Math.max(1, Math.min(100, m.level | 0)), exp: Math.max(0, m.exp | 0), hp: Math.max(0, m.hp | 0), status: typeof m.status === 'string' ? m.status : null };
}

class Trade {
  constructor(a, b) {
    this.players = [a, b]; this.offers = [null, null]; this.confirmed = [false, false]; this.done = false;
    for (let s = 0; s < 2; s++) { const ws = this.players[s]; ws.c.trade = this; ws.c.tside = s; ws.c.status = 'trade'; send(ws, { t: 'tmatched', you: s, oppId: this.players[1 - s].c.id }); }
  }
  other(s) { return this.players[1 - s]; }
  offer(side, mon) {
    if (this.done) return;
    const v = validTradeMon(mon);
    if (!v) { send(this.players[side], { t: 'error', code: 'bad-mon' }); return; }
    this.offers[side] = v; this.confirmed = [false, false];
    this.players.forEach(p => send(p, { t: 'toffer', side, mon: v }));
  }
  confirm(side) {
    if (this.done || !this.offers[0] || !this.offers[1]) return;
    this.confirmed[side] = true;
    send(this.other(side), { t: 'tconfirmed', side });
    if (this.confirmed[0] && this.confirmed[1]) {
      this.done = true;
      send(this.players[0], { t: 'tdone', received: this.offers[1] });
      send(this.players[1], { t: 'tdone', received: this.offers[0] });
      this.cleanup();
    }
  }
  cancel(side) { if (this.done) return; this.done = true; send(this.other(side), { t: 'tcancelled' }); this.cleanup(); }
  onLeave(side) { this.cancel(side); }
  cleanup() { this.players.forEach(p => { if (p.c) { p.c.trade = null; p.c.status = 'idle'; } }); }
}

// ------------------------------------------------------------ Matchmaking ---
const queue = [];
const rooms = new Map();
const tradeQueue = [];

function tryQuickTrade(ws) {
  const qi = tradeQueue.indexOf(ws); if (qi >= 0) tradeQueue.splice(qi, 1);
  while (tradeQueue.length) {
    const other = tradeQueue.shift();
    if (other.readyState === 1 && other !== ws) { new Trade(other, ws); return; }
  }
  tradeQueue.push(ws); ws.c.status = 'tqueue';
}

function leaveLobby(ws) {
  const qi = queue.indexOf(ws); if (qi >= 0) queue.splice(qi, 1);
  const ti = tradeQueue.indexOf(ws); if (ti >= 0) tradeQueue.splice(ti, 1);
  if (ws.c.roomCode && rooms.get(ws.c.roomCode) === ws) rooms.delete(ws.c.roomCode);
  ws.c.roomCode = null;
}

function tryQuickMatch(ws) {
  leaveLobby(ws);
  while (queue.length) {
    const other = queue.shift();
    if (other.readyState === 1 && other !== ws) { new Match(other, ws, { noLegendary: true }, true); return; }
  }
  queue.push(ws); ws.c.status = 'queue';
}

function createRoom(ws, opts) {
  leaveLobby(ws);
  let code; do { code = roomCode(); } while (rooms.has(code));
  const clause = { noLegendary: !!(opts && opts.noLegendary) };
  rooms.set(code, { ws, clause }); ws.c.roomCode = code; ws.c.status = 'host';
  send(ws, { t: 'room', code });
}

function joinRoom(ws, code) {
  code = String(code || '').toUpperCase();
  const room = rooms.get(code);
  if (!room || room.ws.readyState !== 1 || room.ws === ws) { send(ws, { t: 'error', code: 'no-room' }); return; }
  rooms.delete(code); room.ws.c.roomCode = null;
  new Match(room.ws, ws, room.clause, false);   // private Räume: casual (keine Wertung)
}

// --------------------------------------------------------------- Server ---
// Ein HTTP-Server für /api/* (Cloud-Sync) + WebSocket-Upgrade. Nur Loopback —
// Erreichbarkeit ausschliesslich über den nginx-Proxy.
const handleSync = createSync(db);
const httpServer = http.createServer((req, res) => {
  if (handleSync(req, res)) return;        // /api/* erledigt
  res.writeHead(426, { 'Content-Type': 'text/plain' }); res.end('Upgrade Required');
});
const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT, '127.0.0.1', () => console.log(`pkmn-battle-server lauscht auf 127.0.0.1:${PORT} (ws + /api)`));

wss.on('connection', (ws) => {
  ws.c = { id: null, ver: null, name: null, status: 'idle', match: null, side: 0, roomCode: null, trade: null, tside: 0 };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (buf) => {
    let msg; try { msg = JSON.parse(buf); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    const m = ws.c.match;
    switch (msg.t) {
      case 'hello':  ws.c.id = String(msg.id || '?').slice(0, 12); ws.c.name = String(msg.name || ws.c.id).slice(0, 12); ws.c.ver = msg.ver; send(ws, { t: 'welcome', id: ws.c.id }); break;
      case 'queue':  if (!m) tryQuickMatch(ws); break;
      case 'create': if (!m) createRoom(ws, msg); break;
      case 'join':   if (!m) joinRoom(ws, msg.code); break;
      case 'cancel': leaveLobby(ws); ws.c.status = 'idle'; break;
      case 'tqueue':  if (!ws.c.match && !ws.c.trade) tryQuickTrade(ws); break;
      case 'toffer':  if (ws.c.trade) ws.c.trade.offer(ws.c.tside, msg.mon); break;
      case 'tconfirm':if (ws.c.trade) ws.c.trade.confirm(ws.c.tside); break;
      case 'tcancel': if (ws.c.trade) ws.c.trade.cancel(ws.c.tside); else { leaveLobby(ws); ws.c.status = 'idle'; } break;
      case 'resume': {
        const e = activeMatches.get(String(msg.token || ''));
        if (e && !m) e.match.resume(ws, e.side); else send(ws, { t: 'error', code: 'no-match' });
        break;
      }
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
    if (ws.c.trade) ws.c.trade.onLeave(ws.c.tside);
  });
  ws.on('error', () => {});
});

setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false; ws.ping();
  });
}, 20000).unref();

process.on('SIGTERM', () => wss.close(() => process.exit(0)));
