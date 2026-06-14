'use strict';
/**
 * test-replay.js — Ranked-Match spielen, Replay vom Server holen und lokal mit
 * battle-core deterministisch NACHRECHNEN. Die nachgerechneten Events müssen
 * bitgleich zu den Live-Events sein (genau das macht der Client-Replay-Player).
 */
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
let BC; try { BC = require('./battle-core.js'); } catch (e) { BC = require('../js/battle-core.js'); }
const SPECIES = require('./species.json');
const PORT = 4404, URL = `ws://127.0.0.1:${PORT}`;
const srv = spawn('node', [__dirname + '/server.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: '/tmp/pkmn-test-replay' } });
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = p => new Promise((res, rej) => http.get(`http://127.0.0.1:${PORT}${p}`, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res(JSON.parse(b))); }).on('error', rej));

function client(name, team) {
  const ws = new WebSocket(URL); const log = { end: null, events: [] };
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', id: name })));
  ws.on('message', b => {
    const m = JSON.parse(b);
    if (m.t === 'welcome') ws.send(JSON.stringify({ t: 'queue' }));
    else if (m.t === 'matched') ws.send(JSON.stringify({ t: 'team', mons: team }));
    else if (m.t === 'request') ws.send(JSON.stringify({ t: 'action', turn: m.turn, kind: m.kind === 'forceswitch' ? 'switch' : 'move', data: m.kind === 'forceswitch' ? m.options.switchTo[0] : 0 }));
    else if (m.t === 'turn') log.events.push(...m.events);
    else if (m.t === 'end') log.end = m;
  });
  return { ws, log };
}

(async () => {
  await sleep(500);
  const A = client('TR-REPA', [{ id: 6, level: 50 }, { id: 9, level: 50 }]);
  const B = client('TR-REPB', [{ id: 3, level: 50 }, { id: 25, level: 50 }]);
  await new Promise(r => { const t = setInterval(() => { if (A.log.end && B.log.end) { clearInterval(t); r(); } }, 50); setTimeout(r, 9000); });

  const liveEvents = JSON.stringify(A.log.events);

  const list = await getJson('/api/replays');
  const rep = list.list.length ? await getJson('/api/replay?id=' + list.list[0].id) : null;

  // Lokale deterministische Nachrechnung (wie ReplayScreen)
  let recomputed = '[]';
  if (rep) {
    const teamA = rep.teamA.map(t => BC.makeBattleMon(SPECIES[t.id], t.level));
    const teamB = rep.teamB.map(t => BC.makeBattleMon(SPECIES[t.id], t.level));
    const rng = BC.makeRng(rep.seed), state = BC.makeBattleState(teamA, teamB), ev = [];
    for (const step of rep.log) {
      if (step.k === 't') ev.push(...BC.resolveTurn(state, step.a, rng).events);
      else if (step.k === 's') ev.push(...BC.applyForcedSwitch(state, step.side, step.to));
      if (state.winner != null) break;
    }
    recomputed = JSON.stringify(ev);
  }

  const out = {
    replaySaved: !!rep, listHasEntry: list.list.length >= 1,
    eventsMatch: rep && recomputed === liveEvents,
    liveLen: A.log.events.length, recomputedLen: rep ? JSON.parse(recomputed).length : 0,
  };
  console.log(JSON.stringify(out, null, 2));
  A.ws.close(); B.ws.close(); srv.kill('SIGTERM');
  setTimeout(() => process.exit(out.replaySaved && out.eventsMatch ? 0 : 1), 100);
})().catch(e => { console.error(e); srv.kill('SIGTERM'); process.exit(1); });
