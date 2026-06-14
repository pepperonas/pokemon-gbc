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

  /** Kryptografisch zufälliger Index (CODE_CHARS.length = 32 teilt 256 -> kein Bias). */
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function randIdx(max) {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) { const a = new Uint8Array(1); crypto.getRandomValues(a); return a[0] % max; }
    return Math.floor(Math.random() * max);
  }
  function makeCode(len) { let c = ''; for (let i = 0; i < len; i++) c += CODE_CHARS[randIdx(CODE_CHARS.length)]; return c; }
  const randomCode = () => makeCode(4);

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
    let serverId = null;                 // vom Server zugewiesene Ranglisten-ID (Konto oder TR-)
    const listeners = new Set();
    const emit = m => listeners.forEach(fn => fn(m));
    const on = fn => { listeners.add(fn); return () => listeners.delete(fn); };
    const sendRaw = obj => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };

    function awaitMatched() {
      return new Promise((res, rej) => {
        const off = on(m => {
          if (m.t === 'matched') { off(); res({ matched: { you: m.you, oppId: m.oppId, battleId: m.battleId, token: m.token, clause: m.clause } }); }
          else if (m.t === 'error') { off(); rej(m.code || 'error'); }
          else if (m.t === '_closed') { off(); rej('closed'); }
        });
      });
    }

    /** Socket öffnen + Handler verdrahten; onWelcome(res) wird bei 'welcome' aufgerufen. */
    function openSocket(onWelcome, res, rej) {
      try { ws = new WebSocket(wsUrl()); } catch (e) { rej('error'); return; }
      const to = setTimeout(() => rej('timeout'), 6000);
      ws.onopen = () => sendRaw({ t: 'hello', id: trainerId(), name: accountName() || trainerId(), ver: CLIENT_VER, token: session() || undefined });
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch (_) { return; }
        if (m.t === 'welcome') { serverId = m.id; clearTimeout(to); onWelcome(); res('online'); return; }
        emit(m);
      };
      ws.onerror = () => { clearTimeout(to); rej('error'); };
      ws.onclose = () => emit({ t: '_closed' });
    }

    return {
      online: true,
      on, send: sendRaw,
      get serverId() { return serverId; },
      connect() { return new Promise((res, rej) => openSocket(() => {}, res, rej)); },
      resume(tok) { return new Promise((res, rej) => openSocket(() => sendRaw({ t: 'resume', token: tok }), res, rej)); },
      quickMatch() { sendRaw({ t: 'queue' }); return awaitMatched(); },
      tradeQuick() {
        sendRaw({ t: 'tqueue' });
        return new Promise((res, rej) => {
          const off = on(m => { if (m.t === 'tmatched') { off(); res({ you: m.you, oppId: m.oppId }); } else if (m.t === '_closed') { off(); rej('closed'); } });
        });
      },
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

  // --------------------------------------------------- Cloud-Sync (HTTP) ---
  // Anonymer 6-Zeichen-Sync-Code (geräteunabhängig); Spielstand-JSON wird
  // darunter in der Server-DB abgelegt. Zweites Gerät: gleichen Code -> Stand.
  function syncCode() {
    let c = localStorage.getItem('pkmn_synccode');
    if (!c || !/^[A-Z2-9]{6}$/.test(c)) { c = makeCode(6); localStorage.setItem('pkmn_synccode', c); }
    return c;
  }
  function apiBase() {
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '') return 'http://' + (h || 'localhost') + ':4250';
    return '';                      // same-origin via nginx /api
  }
  async function uploadSave(code, saveStr) {
    const r = await fetch(apiBase() + '/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, save: saveStr }) });
    if (!r.ok) throw ((await r.json().catch(() => ({}))).error || 'http');
    return r.json();                // { ok, updated_at }
  }
  async function downloadSave(code) {
    const r = await fetch(apiBase() + '/api/save?code=' + encodeURIComponent(code));
    if (r.status === 404) throw 'not-found';
    if (!r.ok) throw 'http';
    return r.json();                // { save, updated_at }
  }
  const syncEnabled = () => localStorage.getItem('pkmn_syncon') === '1';
  const setSyncEnabled = on => localStorage.setItem('pkmn_syncon', on ? '1' : '0');

  // -------------------------------------------------- Google-Login/Konto ---
  const session = () => localStorage.getItem('pkmn_session') || null;
  const accountName = () => localStorage.getItem('pkmn_account_name') || null;
  const isLoggedIn = () => !!session();
  // Login starten: one-time Nonce im Browser hinterlegen und mitschicken.
  // Beim Rücksprung wird #sess nur akzeptiert, wenn die Nonce zurückkommt
  // (verhindert Session-Fixation / Login-CSRF via untergeschobenem Link).
  function loginUrl() {
    const n = makeCode(8);
    try { localStorage.setItem('pkmn_oauth_pending', n); } catch (e) {}
    return apiBase() + '/api/auth/google?n=' + n;
  }
  function setSession(token, name) { localStorage.setItem('pkmn_session', token); localStorage.setItem('pkmn_account_name', name || 'TRAINER'); }
  async function logout() {
    const t = session();
    localStorage.removeItem('pkmn_session'); localStorage.removeItem('pkmn_account_name');
    if (t) try { await fetch(apiBase() + '/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) }); } catch (e) {}
  }
  async function accountUploadSave(saveStr) {
    const t = session(); if (!t) throw 'noauth';
    const r = await fetch(apiBase() + '/api/account/save', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t }, body: JSON.stringify({ save: saveStr }) });
    if (r.status === 401) throw 'auth'; if (!r.ok) throw 'http';
    return r.json();
  }
  async function accountDownloadSave() {
    const t = session(); if (!t) throw 'noauth';
    const r = await fetch(apiBase() + '/api/account/save', { headers: { 'Authorization': 'Bearer ' + t } });
    if (r.status === 404) return null; if (r.status === 401) throw 'auth'; if (!r.ok) throw 'http';
    return r.json();
  }

  // ---------------------------------------------------------- Rangliste ---
  async function fetchLeaderboard() {
    const r = await fetch(apiBase() + '/api/leaderboard');
    if (!r.ok) throw 'http';
    return r.json();               // { top: [{name,elo,wins,losses}] }
  }
  async function fetchRank(id) {
    const r = await fetch(apiBase() + '/api/rank?id=' + encodeURIComponent(id));
    if (r.status === 404) return null;
    if (!r.ok) throw 'http';
    return r.json();               // { name,elo,wins,losses,rank,total }
  }
  async function fetchReplays() {
    const r = await fetch(apiBase() + '/api/replays');
    if (!r.ok) throw 'http';
    return r.json();               // { list: [{id,name0,name1,winner,ts}] }
  }
  async function fetchReplay(id) {
    const r = await fetch(apiBase() + '/api/replay?id=' + encodeURIComponent(id));
    if (r.status === 404) return null;
    if (!r.ok) throw 'http';
    return r.json();               // { seed, teamA, teamB, log, name0, name1, winner }
  }

  return {
    available: hasWS,              // echter Server-Transport verfügbar
    trainerId, randomCode, makeTransport, CODE_CHARS, CLIENT_VER,
    pvpTeam: null,                 // optionales PvP-Team [{id,level}] (PvpTeamScreen)
    syncCode, uploadSave, downloadSave, syncEnabled, setSyncEnabled,
    fetchLeaderboard, fetchRank, fetchReplays, fetchReplay,
    session, accountName, isLoggedIn, loginUrl, setSession, logout, accountUploadSave, accountDownloadSave,
  };
})();
