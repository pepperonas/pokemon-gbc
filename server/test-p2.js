'use strict';
/**
 * test-p2.js — Integrationstests für P2: Legendären-Klausel (Schnellkampf) und
 * Reconnect (Disconnect mitten im Kampf -> Resume per Token -> Resync -> Ende).
 * Exit 0 = alle grün.
 */
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 4401, URL = `ws://127.0.0.1:${PORT}`;
const srv = spawn('node', [__dirname + '/server.js'], { env: { ...process.env, PORT: String(PORT) } });
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = o => JSON.stringify(o);

function conn() {
  const ws = new WebSocket(URL); const inbox = []; const waiters = [];
  ws.on('message', b => { const m = JSON.parse(b); inbox.push(m); const w = waiters.find(w => w.pred(m)); if (w) { waiters.splice(waiters.indexOf(w), 1); w.res(m); } });
  ws.until = pred => new Promise(res => { const hit = inbox.find(pred); if (hit) return res(hit); waiters.push({ pred, res }); });
  ws.sendj = o => ws.send(J(o));
  return ws;
}

async function testLegendary() {
  const L = conn(), N = conn();
  await new Promise(r => L.on('open', r)); await new Promise(r => N.on('open', r));
  L.sendj({ t: 'hello', id: 'TR-LEG' }); N.sendj({ t: 'hello', id: 'TR-NRM' });
  await L.until(m => m.t === 'welcome'); await N.until(m => m.t === 'welcome');
  L.sendj({ t: 'queue' }); await sleep(60); N.sendj({ t: 'queue' });
  await L.until(m => m.t === 'matched'); await N.until(m => m.t === 'matched');
  L.sendj({ t: 'team', mons: [{ id: 150, level: 50 }] });          // Mewtu -> verboten
  N.sendj({ t: 'team', mons: [{ id: 1, level: 50 }] });
  const err = await L.until(m => m.t === 'error');
  const can = await N.until(m => m.t === 'cancelled');
  L.close(); N.close();
  return err.code === 'no-legendary' && can.reason === 'opp-team';
}

async function testReconnect() {
  let A = conn(); const B = conn();
  await new Promise(r => A.on('open', r)); await new Promise(r => B.on('open', r));
  A.sendj({ t: 'hello', id: 'TR-RCA' }); B.sendj({ t: 'hello', id: 'TR-RCB' });
  await A.until(m => m.t === 'welcome'); await B.until(m => m.t === 'welcome');
  A.sendj({ t: 'queue' }); await sleep(60); B.sendj({ t: 'queue' });
  const mA = await A.until(m => m.t === 'matched'); await B.until(m => m.t === 'matched');
  const token = mA.token;
  A.sendj({ t: 'team', mons: [{ id: 6, level: 50 }, { id: 9, level: 50 }] });
  B.sendj({ t: 'team', mons: [{ id: 3, level: 50 }, { id: 25, level: 50 }] });
  await A.until(m => m.t === 'start'); await B.until(m => m.t === 'start');
  // Eine Runde spielen
  const r1 = await A.until(m => m.t === 'request'); await B.until(m => m.t === 'request');
  A.sendj({ t: 'action', turn: r1.turn, kind: 'move', data: 0 });
  B.sendj({ t: 'action', turn: r1.turn, kind: 'move', data: 0 });
  await A.until(m => m.t === 'turn');
  // A hart trennen -> B muss 'oppgone' sehen
  A.terminate();
  const gone = await B.until(m => m.t === 'oppgone');
  // A neu verbinden + resume
  A = conn(); await new Promise(r => A.on('open', r));
  A.sendj({ t: 'hello', id: 'TR-RCA' }); await A.until(m => m.t === 'welcome');
  A.sendj({ t: 'resume', token });
  const rs = await A.until(m => m.t === 'resync');
  const back = await B.until(m => m.t === 'oppback');
  // Match fertig spielen (beide simpel)
  const play = (ws) => ws.on('message', b => { const m = JSON.parse(b); if (m.t === 'request') ws.sendj({ t: 'action', turn: m.turn, kind: m.kind === 'forceswitch' ? 'switch' : 'move', data: m.kind === 'forceswitch' ? m.options.switchTo[0] : 0 }); });
  play(A); play(B);
  // resync enthält evtl. schon eine offene Anfrage -> beantworten
  if (rs) { /* play() greift ab nächster request */ }
  const endA = await A.until(m => m.t === 'end'); const endB = await B.until(m => m.t === 'end');
  A.close(); B.close();
  return gone.grace > 0 && rs.you === mA.you && back.t === 'oppback'
    && ((endA.result === 'win' && endB.result === 'lose') || (endA.result === 'lose' && endB.result === 'win'));
}

(async () => {
  await sleep(500);
  let leg = false, rec = false;
  try { leg = await testLegendary(); } catch (e) { console.error('legendary throw', e); }
  try { rec = await testReconnect(); } catch (e) { console.error('reconnect throw', e); }
  console.log(J({ legendaryClause: leg, reconnect: rec }));
  srv.kill('SIGTERM');
  setTimeout(() => process.exit(leg && rec ? 0 : 1), 100);
})();
