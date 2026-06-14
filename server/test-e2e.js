'use strict';
/**
 * test-e2e.js — Headless-Integrationstest: startet den Server, verbindet zwei
 * echte WebSocket-Clients, spielt per Schnellkampf einen vollen PvP-Match und
 * prüft: beide sehen identische Turn-Events, genau ein Sieger, sauberes Ende.
 *
 * Aufruf:  node server/test-e2e.js   (Exit 0 = grün)
 */
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 4399;
const URL = `ws://127.0.0.1:${PORT}`;
const TEAM_A = [{ id: 6, level: 50 }, { id: 9, level: 50 }];   // Glurak, Turtok
const TEAM_B = [{ id: 3, level: 50 }, { id: 25, level: 50 }];  // Bisaflor, Pikachu

const srv = spawn('node', [__dirname + '/server.js'], { env: { ...process.env, PORT: String(PORT) } });
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));

function client(name, team) {
  const ws = new WebSocket(URL);
  const log = { turns: [], end: null, you: null, self: null };
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', id: name, ver: 1 })));
  ws.on('message', (buf) => {
    const m = JSON.parse(buf);
    if (m.t === 'welcome') ws.send(JSON.stringify({ t: 'queue' }));
    else if (m.t === 'matched') { log.you = m.you; ws.send(JSON.stringify({ t: 'team', mons: team })); }
    else if (m.t === 'start') { log.self = m.self; }
    else if (m.t === 'turn') log.turns.push(m.events);
    else if (m.t === 'request') {
      if (m.kind === 'choose') ws.send(JSON.stringify({ t: 'action', turn: m.turn, kind: 'move', data: 0 }));
      else if (m.kind === 'forceswitch') ws.send(JSON.stringify({ t: 'action', turn: m.turn, kind: 'switch', data: m.options.switchTo[0] }));
    } else if (m.t === 'end') { log.end = m; }
  });
  return { ws, log };
}

function flat(turns) { return JSON.stringify(turns.flat()); }

setTimeout(() => {
  const A = client('TR-AAAA', TEAM_A);
  const B = client('TR-BBBB', TEAM_B);

  const finish = () => {
    const a = A.log, b = B.log;
    const checks = {
      bothEnded: !!a.end && !!b.end,
      oneWinner: a.end && b.end && ((a.end.result === 'win' && b.end.result === 'lose') || (a.end.result === 'lose' && b.end.result === 'win')),
      identicalEvents: flat(a.turns) === flat(b.turns),
      sidesAssigned: a.you === 0 && b.you === 1,
      selfTeamsSent: Array.isArray(a.self) && a.self[0].moves.length > 0,
      sawDamage: a.turns.flat().some(e => e.e === 'damage'),
      sawWin: a.turns.flat().some(e => e.e === 'win'),
    };
    const pass = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({ checks, result: a.end && a.end.result, turns: a.turns.length }, null, 2));
    A.ws.close(); B.ws.close(); srv.kill('SIGTERM');
    setTimeout(() => process.exit(pass ? 0 : 1), 100);
  };

  // Auf Ende beider warten (oder Timeout)
  const iv = setInterval(() => { if (A.log.end && B.log.end) { clearInterval(iv); finish(); } }, 50);
  setTimeout(() => { clearInterval(iv); console.error('TIMEOUT'); finish(); }, 8000);
}, 600);
