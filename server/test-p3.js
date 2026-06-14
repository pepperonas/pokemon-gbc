'use strict';
/**
 * test-p3.js — Ranked-Match (Schnellkampf) -> ELO-Update + Rangliste/Rank-API.
 * Exit 0 = grün.
 */
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const PORT = 4402, URL = `ws://127.0.0.1:${PORT}`;
const srv = spawn('node', [__dirname + '/server.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: '/tmp/pkmn-test-p3' } });
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = path => new Promise((res, rej) => http.get(`http://127.0.0.1:${PORT}${path}`, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res({ status: r.statusCode, body: JSON.parse(b) }); } catch (e) { rej(e); } }); }).on('error', rej));

function client(name, team) {
  const ws = new WebSocket(URL); const log = { end: null, you: null };
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', id: name })));
  ws.on('message', b => {
    const m = JSON.parse(b);
    if (m.t === 'welcome') ws.send(JSON.stringify({ t: 'queue' }));
    else if (m.t === 'matched') { log.you = m.you; ws.send(JSON.stringify({ t: 'team', mons: team })); }
    else if (m.t === 'request') ws.send(JSON.stringify({ t: 'action', turn: m.turn, kind: m.kind === 'forceswitch' ? 'switch' : 'move', data: m.kind === 'forceswitch' ? m.options.switchTo[0] : 0 }));
    else if (m.t === 'end') log.end = m;
  });
  return { ws, log };
}

(async () => {
  await sleep(500);
  const A = client('TR-AAAA', [{ id: 6, level: 50 }, { id: 9, level: 50 }]);   // Glurak/Turtok
  const B = client('TR-BBBB', [{ id: 3, level: 50 }, { id: 25, level: 50 }]);   // Bisaflor/Pikachu
  await new Promise(r => { const iv = setInterval(() => { if (A.log.end && B.log.end) { clearInterval(iv); r(); } }, 50); setTimeout(r, 9000); });

  const win = A.log.end.result === 'win' ? A : B, lose = win === A ? B : A;
  const eloOk = win.log.end.elo && lose.log.end.elo && win.log.end.elo.delta > 0 && lose.log.end.elo.delta < 0;

  const lb = await getJson('/api/leaderboard');
  const rk = await getJson('/api/rank?id=TR-AAAA');
  const lbOk = lb.status === 200 && lb.body.top.length === 2 && lb.body.top[0].elo > lb.body.top[1].elo;
  const rankOk = rk.status === 200 && rk.body.total === 2 && rk.body.rank >= 1;

  console.log(JSON.stringify({
    bothEnded: !!A.log.end && !!B.log.end, eloOk, lbOk, rankOk,
    winnerElo: win.log.end.elo, loserElo: lose.log.end.elo, leaderboard: lb.body.top,
  }, null, 2));
  A.ws.close(); B.ws.close(); srv.kill('SIGTERM');
  setTimeout(() => process.exit(eloOk && lbOk && rankOk ? 0 : 1), 100);
})().catch(e => { console.error(e); srv.kill('SIGTERM'); process.exit(1); });
