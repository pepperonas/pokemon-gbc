'use strict';
/** test-trade.js — Live-Tausch: beide bieten, bestätigen, Server tauscht. */
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 4403, URL = `ws://127.0.0.1:${PORT}`;
const srv = spawn('node', [__dirname + '/server.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: '/tmp/pkmn-test-trade' } });
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function conn(name, offerMon) {
  const ws = new WebSocket(URL); const log = { offers: [], confirmed: [], done: null, you: null };
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', id: name })));
  ws.on('message', b => {
    const m = JSON.parse(b);
    if (m.t === 'welcome') ws.send(JSON.stringify({ t: 'tqueue' }));
    else if (m.t === 'tmatched') { log.you = m.you; ws.send(JSON.stringify({ t: 'toffer', mon: offerMon })); }
    else if (m.t === 'toffer') { log.offers.push(m); }
    else if (m.t === 'tconfirmed') log.confirmed.push(m.side);
    else if (m.t === 'tdone') log.done = m.received;
  });
  // sobald beide Angebote da sind, bestätigen
  ws._maybeConfirm = () => { if (log.offers.length >= 2 && !ws._c) { ws._c = true; ws.send(JSON.stringify({ t: 'tconfirm' })); } };
  return { ws, log };
}

(async () => {
  await sleep(500);
  const A = conn('TR-AAAA', { id: 64, level: 30, exp: 27000, hp: 50, status: null });   // Kadabra -> Trade-Evo
  const B = conn('TR-BBBB', { id: 7, level: 20, exp: 8000, hp: 40, status: null });      // Schiggy
  // pollen + bestätigen, sobald beide Angebote vorliegen
  const iv = setInterval(() => { A.ws._maybeConfirm(); B.ws._maybeConfirm(); }, 40);
  await new Promise(r => { const t = setInterval(() => { if (A.log.done && B.log.done) { clearInterval(t); r(); } }, 50); setTimeout(r, 6000); });
  clearInterval(iv);

  const out = {
    bothDone: !!A.log.done && !!B.log.done,
    aReceivedB: A.log.done && A.log.done.id === 7 && A.log.done.level === 20,     // A bekommt Schiggy
    bReceivedA: B.log.done && B.log.done.id === 64 && B.log.done.level === 30,    // B bekommt Kadabra (Evo erst clientseitig)
    sidesOk: A.log.you === 0 && B.log.you === 1,
  };
  console.log(JSON.stringify(out));
  A.ws.close(); B.ws.close(); srv.kill('SIGTERM');
  setTimeout(() => process.exit(Object.values(out).every(Boolean) ? 0 : 1), 100);
})().catch(e => { console.error(e); srv.kill('SIGTERM'); process.exit(1); });
