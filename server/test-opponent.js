'use strict';
/**
 * test-opponent.js — Auto-Gegner für den Browser-Integrationstest: verbindet
 * sich zum lokalen Server, geht in den Schnellkampf und spielt simpel
 * (immer erste Attacke, bei K.O. erstes lebendes Mon). Beendet sich nach 'end'.
 *
 * Aufruf:  node server/test-opponent.js [port]
 */
const WebSocket = require('ws');
const PORT = process.argv[2] || 4250;
const TEAM = [{ id: 9, level: 50 }, { id: 26, level: 50 }];   // Turtok, Raichu

const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', id: 'TR-BOT0', ver: 7 })));
ws.on('message', (buf) => {
  const m = JSON.parse(buf);
  if (m.t === 'welcome') ws.send(JSON.stringify({ t: 'queue' }));
  else if (m.t === 'matched') ws.send(JSON.stringify({ t: 'team', mons: TEAM }));
  else if (m.t === 'request') {
    if (m.kind === 'choose') ws.send(JSON.stringify({ t: 'action', turn: m.turn, kind: 'move', data: 0 }));
    else ws.send(JSON.stringify({ t: 'action', turn: m.turn, kind: 'switch', data: m.options.switchTo[0] }));
  } else if (m.t === 'end') { console.log('OPPONENT_END:' + m.result); ws.close(); setTimeout(() => process.exit(0), 50); }
});
ws.on('error', e => { console.error('opp error', e.message); process.exit(1); });
setTimeout(() => { console.error('opp timeout'); process.exit(2); }, 15000);
