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

  /**
   * Mock-Transport ohne Server: simuliert eine kurze Verbindungs- und
   * Suchphase und meldet dann ehrlich „kein Gegner" (no-opponent), weil
   * der Online-Dienst noch nicht live ist. So bleibt die Lobby ohne
   * Sackgasse im echten Look erlebbar.
   */
  function MockTransport() {
    let cancelled = false;
    return {
      online: false,
      async connect() { await sleep(500); return 'online'; },
      async quickMatch(onTick) {
        cancelled = false;
        for (let i = 0; i < 24 && !cancelled; i++) { onTick && onTick(i); await sleep(120); }
        if (cancelled) throw 'cancelled';
        throw 'no-opponent';
      },
      async createRoom() { await sleep(400); return { code: randomCode() }; },
      async waitForJoin(code, onTick) {
        cancelled = false;
        for (let i = 0; i < 24 && !cancelled; i++) { onTick && onTick(i); await sleep(120); }
        if (cancelled) throw 'cancelled';
        throw 'no-opponent';
      },
      async joinRoom(code, onTick) {
        cancelled = false;
        for (let i = 0; i < 16 && !cancelled; i++) { onTick && onTick(i); await sleep(120); }
        if (cancelled) throw 'cancelled';
        throw 'no-room';
      },
      cancel() { cancelled = true; },
    };
  }

  // Aktuelle Auswahl: Mock (kein Backend). Phase P1 ersetzt dies durch den
  // WebSocketTransport (wss://pokemon.celox.io/ws, siehe MULTIPLAYER_PLAN.md).
  function makeTransport() { return MockTransport(); }

  return {
    available: false,              // true, sobald der reale Server angebunden ist
    trainerId, randomCode, makeTransport, CODE_CHARS,
  };
})();
