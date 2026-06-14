'use strict';
/**
 * net.js — Netzwerk-/Online-Schicht für PvP-Kämpfe.
 *
 * STATUS: Vorschau. Es gibt noch KEIN Backend — der reale autoritative
 * WebSocket-Server ist in MULTIPLAYER_PLAN.md spezifiziert. Diese Datei
 * stellt bereits die Transport-Abstraktion + eine Mock-Implementierung
 * bereit, damit die Lobby im offiziellen Look spielbar/vorführbar ist.
 *
 * Sobald der Server steht (Phase P1), wird `makeTransport()` einfach von
 * MockTransport auf WebSocketTransport umgestellt — die Lobby-Screens in
 * ui.js bleiben unverändert (sie sprechen nur dieses Interface an).
 *
 * Transport-Interface (alles Promise-basiert, Timeouts werfen 'timeout'):
 *   connect()                  -> 'online'
 *   quickMatch(onTick)         -> { opponent } | wirft 'no-opponent'
 *   createRoom()               -> { code }
 *   waitForJoin(code, onTick)  -> { opponent } | wirft 'no-opponent'
 *   joinRoom(code, onTick)     -> { opponent } | wirft 'no-room'
 *   cancel()                   -> bricht laufende Suche ab
 */
const Net = (() => {
  const ID_KEY = 'pkmn_netid';

  /** Stabile, anonyme Trainer-ID pro Gerät (z. B. "TR-7F3A"). */
  function trainerId() {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = 'TR-' + Math.random().toString(16).slice(2, 6).toUpperCase();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  }

  /** Zufälliger 4-stelliger Raum-Code (Ziffern + Großbuchstaben ohne 0/O/1/I). */
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function randomCode() {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return c;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const CLIENT_VER = 7;

  /** wss-Endpunkt: lokal ws://host:4250, sonst wss://<host>/ws (nginx-Proxy). */
  function wsUrl() {
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '') return `ws://${h || 'localhost'}:4250`;
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }

  /**
   * Echter Transport: spricht den autoritativen Server (MULTIPLAYER_PLAN.md).
   * Lobby-Methoden liefern bei Match `{ matched:{you,oppId,battleId} }`; danach
   * fahren `send()`/`on()` das Kampf-Protokoll. Eine Verbindung pro Lobby-Sitzung.
   */
  function WebSocketTransport() {
    let ws = null;
    const listeners = new Set();
    const emit = m => listeners.forEach(fn => fn(m));
    const on = fn => { listeners.add(fn); return () => listeners.delete(fn); };
    const sendRaw = obj => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };

    function awaitMatched() {
      return new Promise((res, rej) => {
        const off = on(m => {
          if (m.t === 'matched') { off(); res({ matched: { you: m.you, oppId: m.oppId, battleId: m.battleId } }); }
          else if (m.t === 'error') { off(); rej(m.code || 'error'); }
          else if (m.t === '_closed') { off(); rej('closed'); }
        });
      });
    }

    return {
      online: true,
      on, send: sendRaw,
      connect() {
        return new Promise((res, rej) => {
          try { ws = new WebSocket(wsUrl()); } catch (e) { rej('error'); return; }
          const to = setTimeout(() => rej('timeout'), 6000);
          ws.onopen = () => sendRaw({ t: 'hello', id: trainerId(), ver: CLIENT_VER });
          ws.onmessage = e => {
            let m; try { m = JSON.parse(e.data); } catch (_) { return; }
            if (m.t === 'welcome') { clearTimeout(to); res('online'); }
            emit(m);
          };
          ws.onerror = () => { clearTimeout(to); rej('error'); };
          ws.onclose = () => emit({ t: '_closed' });
        });
      },
      quickMatch() { sendRaw({ t: 'queue' }); return awaitMatched(); },
      createRoom() {
        return new Promise((res, rej) => {
          const off = on(m => { if (m.t === 'room') { off(); res({ code: m.code }); } else if (m.t === '_closed') { off(); rej('closed'); } });
          sendRaw({ t: 'create' });
        });
      },
      waitForJoin() { return awaitMatched(); },                 // Host wartet nach createRoom
      joinRoom(code) { sendRaw({ t: 'join', code }); return awaitMatched(); },
      cancel() { sendRaw({ t: 'cancel' }); },
      close() { if (ws) try { ws.close(); } catch (e) {} },
    };
  }

  /**
   * Mock-Transport (Fallback ohne Server): kurze Such-Animation, dann ehrlich
   * „kein Gegner". Wird genutzt, falls `WebSocket` fehlt.
   */
  function MockTransport() {
    let cancelled = false;
    const search = async (onTick, n, reason) => {
      cancelled = false;
      for (let i = 0; i < n && !cancelled; i++) { onTick && onTick(i); await sleep(120); }
      throw cancelled ? 'cancelled' : reason;
    };
    return {
      online: false, on: () => (() => {}), send() {},
      async connect() { await sleep(400); return 'online'; },
      quickMatch(onTick) { return search(onTick, 24, 'no-opponent'); },
      async createRoom() { await sleep(300); return { code: randomCode() }; },
      waitForJoin(onTick) { return search(onTick, 24, 'no-opponent'); },
      joinRoom(code, onTick) { return search(onTick, 16, 'no-room'); },
      cancel() { cancelled = true; },
      close() {},
    };
  }

  const hasWS = typeof WebSocket !== 'undefined';
  function makeTransport() { return hasWS ? WebSocketTransport() : MockTransport(); }

  return {
    available: hasWS,              // echter Server-Transport verfügbar
    trainerId, randomCode, makeTransport, CODE_CHARS, CLIENT_VER,
  };
})();
