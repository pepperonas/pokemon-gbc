'use strict';
/**
 * main.js — Game-Loop, Screen-Stack, Eingaben (Tastatur + Touch),
 * Speichern/Laden und Boot-Sequenz.
 */

// ----------------------------------------------------------------- Input ---
// Edge-getriggerte Eingaben: take(btn) konsumiert einen Tastendruck genau
// einmal pro Frame, down(btn) prüft Halten (für Laufen).
const Input = (() => {
  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
    z: 'a', Z: 'a', Enter: 'a',
    x: 'b', X: 'b', Escape: 'b',
  };
  const held = {};
  let queue = new Set();      // Presses seit letztem Frame
  let pressed = new Set();    // Presses dieses Frames

  window.addEventListener('keydown', e => {
    const btn = KEYMAP[e.key];
    if (!btn) return;
    e.preventDefault();
    if (!e.repeat) queue.add(btn);
    held[btn] = true;
  });
  window.addEventListener('keyup', e => {
    const btn = KEYMAP[e.key];
    if (btn) held[btn] = false;
  });

  return {
    beginFrame() { pressed = queue; queue = new Set(); },
    take(btn) { return pressed.delete(btn); },
    down(btn) { return !!held[btn]; },
    // Für Touch-Buttons:
    press(btn) { queue.add(btn); held[btn] = true; },
    release(btn) { held[btn] = false; },
  };
})();

// ------------------------------------------------------------------ Game ---
const SAVE_KEY = 'pkmn_save_v1';

const Game = {
  screens: [],
  player: null,
  _frameWaiters: [],

  push(s) { this.screens.push(s); },
  pop()   { this.screens.pop(); },
  /** Promise, das beim nächsten Frame auflöst (für Kampf-Koroutinen). */
  nextFrame() { return new Promise(r => this._frameWaiters.push(r)); },

  hasSave() { return !!localStorage.getItem(SAVE_KEY); },

  newPlayer() {
    return {
      party: [], box: [],
      items: { ball: 10, potion: 3 },       // Beutel (Schlüssel s. Data.ITEMS)
      money: 1500,
      badges: 0, flags: {},                 // Trainer-/Arena-/Champion-/Legendären-Flags
      seen: new Set(), caught: new Set(),
      map: 'overworld',
      x: World.START.x, y: World.START.y, dir: 'up',
      respawn: { map: 'overworld', x: World.START.x, y: World.START.y },
    };
  },

  startNewGame(starterId) {
    this.player = this.newPlayer();
    const starter = Battle.makeMon(starterId, 5);
    this.player.party.push(starter);
    this.player.seen.add(starterId);
    this.player.caught.add(starterId);
    this.screens = [new World.WorldScreen()];
    this.save();
  },

  save() {
    const p = this.player;
    if (!p) return;
    const packMon = m => ({ id: m.id, level: m.level, exp: m.exp, hp: m.hp, status: m.status || null });
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      party: p.party.map(packMon),
      box: p.box.map(packMon),
      items: p.items, money: p.money ?? 0,
      badges: p.badges ?? 0, flags: p.flags || {},
      seen: [...p.seen], caught: [...p.caught],
      map: p.map || 'overworld',
      x: p.x, y: p.y, dir: p.dir,
      respawn: p.respawn || { map: 'overworld', x: World.START.x, y: World.START.y },
    }));
  },

  /** Aktuellen Spielstand als JSON-String (für Cloud-Upload). */
  exportSave() { this.save(); return localStorage.getItem(SAVE_KEY); },

  /** Heruntergeladenen Spielstand übernehmen und ins Spiel springen. */
  loadSaveString(str) {
    localStorage.setItem(SAVE_KEY, str);
    this.continueGame();
  },

  continueGame() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      // Migration alter Spielstände: balls/potions -> items, Geld-Startkapital
      const items = s.items || { ball: s.balls ?? 10, potion: s.potions ?? 3 };
      const respawn = s.respawn || { x: World.START.x, y: World.START.y };
      if (!respawn.map) respawn.map = 'overworld';
      this.player = {
        party: s.party.map(Battle.restoreMon),
        box: (s.box || []).map(Battle.restoreMon),
        items,
        money: s.money ?? 1500,
        badges: s.badges ?? 0,
        flags: s.flags || {},
        seen: new Set(s.seen), caught: new Set(s.caught),
        map: s.map || 'overworld',
        x: s.x, y: s.y, dir: s.dir || 'up',
        respawn,
      };
      this.screens = [new World.WorldScreen()];
    } catch (e) {
      console.error('Spielstand defekt:', e);
      localStorage.removeItem(SAVE_KEY);
      this.screens = [new UI.TitleScreen()];
    }
  },
};

// ------------------------------------------------------------- Game-Loop ---
(() => {
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  let last = 0;
  let lastAutoSave = 0;          // Wall-Clock-Marke des letzten Auto-Saves
  const AUTOSAVE_MS = 60000;     // jede Minute still speichern (ohne Hinweis)

  function loop(now) {
    const dt = Math.min(50, now - last); // dt klemmen (Tab-Wechsel etc.)
    last = now;

    // Stilles Auto-Save jede Minute (nur sobald ein Spiel laeuft, kein Toast)
    if (Game.player && now - lastAutoSave >= AUTOSAVE_MS) {
      lastAutoSave = now;
      Game.save();
      // Optionaler stiller Cloud-Sync (wenn aktiviert)
      if (Net.syncEnabled()) Net.uploadSave(Net.syncCode(), localStorage.getItem(SAVE_KEY)).catch(() => {});
    }

    Input.beginFrame();
    const top = Game.screens[Game.screens.length - 1];
    if (top) top.update(dt);

    // Kampf-Koroutinen einen Schritt weiterlaufen lassen
    const waiters = Game._frameWaiters;
    Game._frameWaiters = [];
    for (const w of waiters) w();

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#181818';
    ctx.fillRect(0, 0, 160, 144);
    for (const s of Game.screens) s.draw(ctx); // Stack von unten nach oben

    requestAnimationFrame(loop);
  }

  // Pixel-perfektes Hochskalieren (ganzzahlig, wenn möglich)
  function resize() {
    const wrap = document.getElementById('screen-wrap');
    const availW = wrap.clientWidth, availH = wrap.clientHeight;
    let scale = Math.min(availW / 160, availH / 144);
    if (scale >= 1) scale = Math.floor(scale);
    canvas.style.width = (160 * scale) + 'px';
    canvas.style.height = (144 * scale) + 'px';
  }
  window.addEventListener('resize', resize);

  // Touch-Steuerung: Pointer-Events, kein Scroll/Zoom-Delay
  function bindTouch() {
    document.querySelectorAll('[data-btn]').forEach(el => {
      const btn = el.dataset.btn;
      const start = e => { e.preventDefault(); el.classList.add('active'); Input.press(btn); };
      const end   = e => { e.preventDefault(); el.classList.remove('active'); Input.release(btn); };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('pointerleave', end);
      el.addEventListener('contextmenu', e => e.preventDefault());
    });
    if ('ontouchstart' in window) document.body.classList.add('touch');
  }

  // ---------------------------------------------------------------- Boot ---
  window.addEventListener('load', async () => {
    bindTouch();
    resize();

    const loading = new UI.LoadingScreen();
    Game.screens = [loading];
    requestAnimationFrame(t => { last = t; lastAutoSave = t; requestAnimationFrame(loop); });

    // Pixel-Font laden (Fallback: monospace), dann Pokémon-Daten
    try { await document.fonts.load('8px "Press Start 2P"'); } catch (e) { /* egal */ }
    try {
      await Data.load(p => { loading.progress = p; });
      // Starter-Sprites vorwärmen
      [1, 4, 7].forEach(id => Data.sprite(Data.byId(id).front));
      Game.screens = [new UI.TitleScreen()];
    } catch (e) {
      console.error(e);
      loading.error = 'Laden fehlgeschlagen! Beim 1. Start wird Internet benoetigt. Bitte neu laden.';
    }
  });
})();
