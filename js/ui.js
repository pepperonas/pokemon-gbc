'use strict';
/**
 * ui.js — Zeichen-Helfer (Textbox, HP-Balken, Menüs) und alle Nicht-Kampf-
 * Screens: Loading, Titel, Starter-Auswahl, Pausenmenü, Team, Box, Pokédex.
 *
 * Jeder Screen ist ein Objekt mit update(dt) / draw(ctx); Game verwaltet
 * einen Screen-Stack (nur der oberste wird geupdatet, alle werden gezeichnet).
 */
const UI = (() => {

  const FONT = '8px "Press Start 2P", monospace';
  const INK = '#181818';
  const PAPER = '#f8f8f8';
  const CREAM = '#f8f0d8';

  function text(ctx, str, x, y, color = INK) {
    ctx.font = FONT;
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  /** Text mit Umbruch nach maxChars Zeichen (lange Wörter werden hart getrennt). */
  function textWrapped(ctx, str, x, y, maxChars, lineH = 10) {
    const lines = [];
    let line = '';
    for (const word of String(str).split(' ')) {
      let w = word;
      while (w.length > maxChars) { // überlange Wörter hart umbrechen
        if (line) { lines.push(line); line = ''; }
        lines.push(w.slice(0, maxChars));
        w = w.slice(maxChars);
      }
      if ((line + (line ? ' ' : '') + w).length <= maxChars) {
        line += (line ? ' ' : '') + w;
      } else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => text(ctx, l, x, y + i * lineH));
  }

  /** Klassische GB-Box: weiße Fläche mit Doppelrahmen. */
  function box(ctx, x, y, w, h) {
    ctx.fillStyle = PAPER; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
  }

  function hpBar(ctx, x, y, w, hp, maxHp) {
    text(ctx, 'KP', x - 2, y - 1);
    const bx = x + 16, bw = w - 18;
    ctx.fillStyle = INK; ctx.fillRect(bx - 1, y - 1, bw + 2, 6);
    ctx.fillStyle = '#585858'; ctx.fillRect(bx, y, bw, 4);
    const ratio = Math.max(0, hp / maxHp);
    ctx.fillStyle = ratio > 0.5 ? '#30b850' : ratio > 0.2 ? '#f8b800' : '#e03028';
    ctx.fillRect(bx, y, Math.round(bw * ratio), 4);
  }

  /** Sprite als schwarze Silhouette (für ungefangene Pokédex-Einträge). */
  const silCanvas = document.createElement('canvas');
  silCanvas.width = silCanvas.height = 96;
  function drawSilhouette(ctx, img, x, y, size) {
    const c = silCanvas.getContext('2d');
    c.clearRect(0, 0, 96, 96);
    c.drawImage(img, 0, 0, 96, 96);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#383838'; c.fillRect(0, 0, 96, 96);
    c.globalCompositeOperation = 'source-over';
    ctx.drawImage(silCanvas, x, y, size, size);
  }

  // ------------------------------------------------------------- Loading ---
  class LoadingScreen {
    constructor() { this.progress = 0; this.error = null; }
    update() {}
    draw(ctx) {
      ctx.fillStyle = '#283050'; ctx.fillRect(0, 0, 160, 144);
      text(ctx, 'POKEMON', 52, 40, '#f8d030');
      text(ctx, 'GBC EDITION', 36, 54, '#f8f8f8');
      if (this.error) {
        textWrapped(ctx, this.error, 8, 80, 18);
        return;
      }
      text(ctx, 'Lade Pokedex...', 20, 80, '#a8b8d8');
      ctx.fillStyle = '#181818'; ctx.fillRect(19, 95, 122, 10);
      ctx.fillStyle = '#30b850'; ctx.fillRect(20, 96, Math.round(120 * this.progress), 8);
      text(ctx, Math.round(this.progress * 100) + '%', 66, 110, '#a8b8d8');
    }
  }

  // --------------------------------------------------------------- Titel ---
  class TitleScreen {
    constructor() { this.t = 0; this.menu = null; this.index = 0; }
    update(dt) {
      this.t += dt;
      if (this.menu) {
        const n = this.menu.length;
        if (Input.take('up'))   this.index = (this.index + n - 1) % n;
        if (Input.take('down')) this.index = (this.index + 1) % n;
        if (Input.take('a')) {
          if (this.menu[this.index] === 'FORTSETZEN') Game.continueGame();
          else Game.push(new StarterScreen());
        }
        if (Input.take('b')) this.menu = null;
        return;
      }
      if (Input.take('a')) {
        if (Game.hasSave()) { this.menu = ['FORTSETZEN', 'NEUES SPIEL']; this.index = 0; }
        else Game.push(new StarterScreen());
      }
    }
    draw(ctx) {
      ctx.fillStyle = '#283050'; ctx.fillRect(0, 0, 160, 144);
      // "Logo"
      ctx.fillStyle = '#e03028'; ctx.fillRect(24, 24, 112, 30);
      ctx.strokeStyle = '#f8d030'; ctx.lineWidth = 2; ctx.strokeRect(25, 25, 110, 28);
      text(ctx, 'POKEMON', 52, 32, '#f8d030');
      text(ctx, 'GBC EDITION', 36, 60, '#f8f8f8');
      if (this.menu) {
        box(ctx, 36, 80, 88, 36);
        this.menu.forEach((it, i) => {
          text(ctx, it, 56, 89 + i * 12);
          if (i === this.index) text(ctx, '>', 46, 89 + i * 12);
        });
      } else if (Math.floor(this.t / 600) % 2 === 0) {
        text(ctx, 'DRUECKE A', 44, 96, '#f8f8f8');
      }
      text(ctx, '© 2026 M. Pfeffer', 12, 130, '#68789a');
    }
  }

  // ------------------------------------------------------- Starter-Wahl ---
  const STARTERS = [1, 4, 7]; // Bisasam, Glumanda, Schiggy
  class StarterScreen {
    constructor() { this.index = 1; this.confirm = false; this.confIndex = 0; }
    update() {
      if (this.confirm) {
        if (Input.take('up') || Input.take('down')) this.confIndex = 1 - this.confIndex;
        if (Input.take('a')) {
          if (this.confIndex === 0) Game.startNewGame(STARTERS[this.index]);
          else this.confirm = false;
        }
        if (Input.take('b')) this.confirm = false;
        return;
      }
      if (Input.take('left'))  this.index = (this.index + 2) % 3;
      if (Input.take('right')) this.index = (this.index + 1) % 3;
      if (Input.take('a')) { this.confirm = true; this.confIndex = 0; }
    }
    draw(ctx) {
      ctx.fillStyle = CREAM; ctx.fillRect(0, 0, 160, 144);
      text(ctx, 'PROF. EICHE:', 8, 8);
      text(ctx, 'Waehle deinen', 8, 20);
      text(ctx, 'Partner!', 8, 30);
      STARTERS.forEach((id, i) => {
        const sp = Data.byId(id);
        const x = 6 + i * 51;
        if (i === this.index) {
          ctx.fillStyle = '#f8d030'; ctx.fillRect(x - 2, 46, 50, 56);
          text(ctx, 'v', x + 19, 36); // Cursor über dem gewählten Starter
        }
        const img = Data.sprite(sp.front);
        if (img) ctx.drawImage(img, x - 3, 48, 52, 52);
        else Data.drawPlaceholder(ctx, sp, x - 3, 48, 52);
      });
      const sel = Data.byId(STARTERS[this.index]);
      if (this.confirm) {
        box(ctx, 0, 112, 160, 32);
        text(ctx, sel.name.toUpperCase() + ', richtig?', 6, 118);
        text(ctx, this.confIndex === 0 ? '>JA   NEIN' : ' JA  >NEIN', 6, 130);
      } else {
        box(ctx, 0, 112, 160, 32);
        text(ctx, sel.name.toUpperCase(), 6, 118);
        text(ctx, Data.TYPE_DE[sel.types[0]] + (sel.types[1] ? '/' + Data.TYPE_DE[sel.types[1]] : ''), 6, 130);
      }
    }
  }

  // ------------------------------------------------------- Pausenmenü ---
  class PauseMenuScreen {
    constructor() {
      this.items = ['TEAM', 'BEUTEL', 'POKEDEX', 'BOX', 'ONLINE', 'CLOUD', 'KONTO', 'SPEICHERN', 'ZURUECK'];
      this.index = 0; this.toast = 0;
    }
    update(dt) {
      if (this.toast > 0) { this.toast -= dt; return; }
      const n = this.items.length;
      if (Input.take('up'))   { this.index = (this.index + n - 1) % n; Sound.cursor(); }
      if (Input.take('down')) { this.index = (this.index + 1) % n; Sound.cursor(); }
      if (Input.take('b')) { Game.pop(); return; }
      if (Input.take('a')) {
        Sound.confirm();
        switch (this.items[this.index]) {
          case 'TEAM':      Game.push(new TeamScreen()); break;
          case 'BEUTEL':    Game.push(new ItemScreen()); break;
          case 'POKEDEX':   Game.push(new DexScreen()); break;
          case 'BOX':       Game.push(new BoxScreen()); break;
          case 'ONLINE':    Game.push(new OnlineScreen()); break;
          case 'CLOUD':     Game.push(new CloudScreen()); break;
          case 'KONTO':     Game.push(new KontoScreen()); break;
          case 'SPEICHERN': Game.save(); this.toast = 1200; break;
          case 'ZURUECK':   Game.pop(); break;
        }
      }
    }
    draw(ctx) {
      const p = Game.player;
      box(ctx, 58, 2, 98, 116);
      this.items.forEach((it, i) => {
        text(ctx, it, 78, 6 + i * 9);
        if (i === this.index) text(ctx, '>', 68, 6 + i * 9);
      });
      // Statuszeilen: Geld + Orden
      ctx.fillStyle = INK; ctx.fillRect(66, 88, 82, 1);
      text(ctx, `$${p.money || 0}`, 68, 93);
      text(ctx, `ORDEN ${p.badges || 0}/2`, 68, 105);
      if (this.toast > 0) {
        box(ctx, 16, 120, 128, 24);
        text(ctx, 'Gespeichert!', 36, 128);
      }
    }
  }

  // ------------------------------------------------------ Beutel (Items) ---
  class ItemScreen {
    constructor() { this.index = 0; this.pick = null; this.note = null; }
    list() { return Data.ITEM_ORDER.filter(k => (Game.player.items[k] || 0) > 0); }
    flash(t) { this.note = { text: t, t: 1100 }; }

    /** Item auf ein Team-Mitglied anwenden. Liefert true bei Erfolg. */
    apply(mon, key) {
      const it = Data.ITEMS[key];
      if (it.kind === 'heal') {
        if (mon.hp <= 0) { this.flash(`${mon.name} ist K.O.! Nutze BELEBER.`); return false; }
        if (mon.hp >= mon.stats.hp) { this.flash(`${mon.name} hat volle KP!`); return false; }
        mon.hp = Math.min(mon.stats.hp, mon.hp + it.amount);
        Game.player.items[key]--;
        Sound.heal();
        this.flash(`${mon.name} wurde geheilt!`);
        return true;
      }
      if (it.kind === 'revive') {
        if (mon.hp > 0) { this.flash(`${mon.name} ist nicht K.O.!`); return false; }
        mon.hp = Math.floor(mon.stats.hp / 2);
        mon.status = null;
        Game.player.items[key]--;
        Sound.heal();
        this.flash(`${mon.name} wurde wiederbelebt!`);
        return true;
      }
      if (it.kind === 'cure') {
        if (!mon.status) { this.flash(`${mon.name} ist gesund!`); return false; }
        mon.status = null;
        Game.player.items[key]--;
        Sound.heal();
        this.flash(`${mon.name} ist wieder gesund!`);
        return true;
      }
      return false;
    }

    update(dt) {
      if (this.note && (this.note.t -= dt) <= 0) this.note = null;
      const items = this.list();
      if (this.pick) {                       // Team-Mitglied wählen
        const n = Game.player.party.length;
        if (Input.take('up'))   { this.pick.index = (this.pick.index + n - 1) % n; Sound.cursor(); }
        if (Input.take('down')) { this.pick.index = (this.pick.index + 1) % n; Sound.cursor(); }
        if (Input.take('b')) { this.pick = null; return; }
        if (Input.take('a')) {
          if (this.apply(Game.player.party[this.pick.index], this.pick.key)) this.pick = null;
        }
        return;
      }
      if (Input.take('b')) { Game.pop(); return; }
      if (!items.length) { if (Input.take('a')) Game.pop(); return; }
      this.index = Math.min(this.index, items.length - 1);
      const n = items.length;
      if (Input.take('up'))   { this.index = (this.index + n - 1) % n; Sound.cursor(); }
      if (Input.take('down')) { this.index = (this.index + 1) % n; Sound.cursor(); }
      if (Input.take('a')) {
        const key = items[this.index];
        if (Data.ITEMS[key].kind === 'ball') this.flash('Baelle sind nur im Kampf nutzbar!');
        else { Sound.confirm(); this.pick = { key, index: 0 }; }
      }
    }

    draw(ctx) {
      ctx.fillStyle = CREAM; ctx.fillRect(0, 0, 160, 144);
      text(ctx, 'BEUTEL', 8, 6);
      text(ctx, `$${Game.player.money || 0}`, 104, 6);
      const items = this.list();
      if (!items.length) { text(ctx, 'Der Beutel ist leer.', 12, 64); }
      const scroll = Math.max(0, Math.min(this.index - 4, items.length - 8));
      items.slice(scroll, scroll + 8).forEach((k, i) => {
        const gi = scroll + i, y = 22 + i * 13;
        if (gi === this.index) text(ctx, '>', 2, y);
        text(ctx, Data.ITEMS[k].name, 12, y);
        text(ctx, 'x' + Game.player.items[k], 124, y);
      });
      if (this.pick) {
        box(ctx, 8, 8, 144, 100);
        text(ctx, Data.ITEMS[this.pick.key].name + ' auf wen?', 16, 16);
        Game.player.party.forEach((m, i) => {
          const y = 30 + i * 12;
          if (i === this.pick.index) text(ctx, '>', 18, y);
          text(ctx, m.name.toUpperCase(), 28, y);
          text(ctx, m.hp <= 0 ? 'K.O.' : `${m.hp}/${m.stats.hp}`, 104, y);
        });
      }
      if (this.note) {
        box(ctx, 4, 116, 152, 26);
        textWrapped(ctx, this.note.text, 10, 124, 18);
      }
    }
  }

  // -------------------------------------------------------------- Markt ---
  class MartScreen {
    constructor(tier) {
      this.goods = Data.MART_TIERS[tier] || Data.MART_TIERS[1];
      this.index = 0; this.note = null;
    }
    flash(t) { this.note = { text: t, t: 1000 }; }
    update(dt) {
      if (this.note && (this.note.t -= dt) <= 0) this.note = null;
      const n = this.goods.length + 1;       // + ZURUECK
      if (Input.take('up'))   { this.index = (this.index + n - 1) % n; Sound.cursor(); }
      if (Input.take('down')) { this.index = (this.index + 1) % n; Sound.cursor(); }
      if (Input.take('b')) { Game.pop(); return; }
      if (Input.take('a')) {
        if (this.index === this.goods.length) { Game.pop(); return; }
        const key = this.goods[this.index], it = Data.ITEMS[key];
        if ((Game.player.money || 0) < it.price) { this.flash('Zu wenig Geld!'); return; }
        Game.player.money -= it.price;
        Game.player.items[key] = (Game.player.items[key] || 0) + 1;
        Sound.confirm();
        this.flash(`${it.name} gekauft!`);
      }
    }
    draw(ctx) {
      ctx.fillStyle = CREAM; ctx.fillRect(0, 0, 160, 144);
      text(ctx, 'MARKT', 8, 6);
      text(ctx, `$${Game.player.money || 0}`, 100, 6);
      this.goods.forEach((k, i) => {
        const y = 22 + i * 12, it = Data.ITEMS[k];
        if (i === this.index) text(ctx, '>', 2, y);
        text(ctx, it.name, 12, y);
        text(ctx, '$' + it.price, 112, y);
      });
      const yb = 22 + this.goods.length * 12;
      if (this.index === this.goods.length) text(ctx, '>', 2, yb);
      text(ctx, 'ZURUECK', 12, yb);
      if (this.note) {
        box(ctx, 4, 116, 152, 26);
        textWrapped(ctx, this.note.text, 10, 124, 18);
      }
    }
  }

  // ------------------------------------------------------------- Team ---
  class TeamScreen {
    constructor() { this.index = 0; this.sub = null; this.subIndex = 0; this.swapFrom = -1; this.detail = null; }
    update() {
      const party = Game.player.party;
      if (this.detail) { if (Input.take('a') || Input.take('b')) this.detail = null; return; }
      if (this.sub) {
        const n = this.sub.length;
        if (Input.take('up'))   this.subIndex = (this.subIndex + n - 1) % n;
        if (Input.take('down')) this.subIndex = (this.subIndex + 1) % n;
        if (Input.take('b')) { this.sub = null; return; }
        if (Input.take('a')) {
          const choice = this.sub[this.subIndex];
          this.sub = null;
          if (choice === 'STATUS') this.detail = party[this.index];
          else if (choice === 'TAUSCHEN') this.swapFrom = this.index;
          else if (choice === 'ZUR BOX' && party.length > 1) {
            Game.player.box.push(party.splice(this.index, 1)[0]);
            this.index = Math.min(this.index, party.length - 1);
          }
        }
        return;
      }
      const n = party.length;
      if (Input.take('up'))   this.index = (this.index + n - 1) % n;
      if (Input.take('down')) this.index = (this.index + 1) % n;
      if (Input.take('b')) {
        if (this.swapFrom >= 0) this.swapFrom = -1; else Game.pop();
        return;
      }
      if (Input.take('a')) {
        if (this.swapFrom >= 0) { // Tausch abschließen
          const t = party[this.swapFrom];
          party[this.swapFrom] = party[this.index];
          party[this.index] = t;
          this.swapFrom = -1;
        } else {
          this.sub = ['STATUS', 'TAUSCHEN', 'ZUR BOX', 'ZURUECK'];
          this.subIndex = 0;
        }
      }
    }
    draw(ctx) {
      ctx.fillStyle = CREAM; ctx.fillRect(0, 0, 160, 144);
      if (this.detail) { drawMonDetail(ctx, this.detail); return; }
      text(ctx, this.swapFrom >= 0 ? 'TAUSCHEN MIT?' : 'TEAM', 8, 6);
      Game.player.party.forEach((m, i) => {
        const y = 20 + i * 20;
        if (i === this.swapFrom) text(ctx, '*', 2, y);
        if (i === this.index) text(ctx, '>', 2, y);
        text(ctx, m.name.toUpperCase(), 12, y);
        if (m.status) text(ctx, Data.STATUS_DE[m.status], 116, y, Data.STATUS_COLORS[m.status]);
        else text(ctx, 'L' + m.level, 116, y);
        hpBar(ctx, 14, y + 10, 100, m.hp, m.stats.hp);
        text(ctx, `${m.hp}/${m.stats.hp}`, 118, y + 8);
      });
      if (this.sub) {
        box(ctx, 76, 84, 80, 56);
        this.sub.forEach((it, i) => {
          text(ctx, it, 92, 92 + i * 12);
          if (i === this.subIndex) text(ctx, '>', 84, 92 + i * 12);
        });
      }
    }
  }

  /** Detailansicht eines eigenen Pokémon (Status). */
  function drawMonDetail(ctx, m) {
    ctx.fillStyle = CREAM; ctx.fillRect(0, 0, 160, 144);
    const img = Data.sprite(m.species.front);
    if (img) ctx.drawImage(img, 4, 4, 56, 56);
    else Data.drawPlaceholder(ctx, m.species, 4, 4, 56);
    text(ctx, m.name.toUpperCase(), 64, 8);
    text(ctx, ':L' + m.level, 64, 18);
    if (m.status) text(ctx, Data.STATUS_DE[m.status], 110, 18, Data.STATUS_COLORS[m.status]);
    text(ctx, m.species.types.map(t => Data.TYPE_DE[t]).join('/'), 64, 28);
    text(ctx, `KP ${m.hp}/${m.stats.hp}`, 64, 40);
    text(ctx, `EXP ${m.exp}`, 64, 50);
    const s = m.stats;
    text(ctx, `ANG ${s.atk}  VER ${s.def}`, 6, 64);
    text(ctx, `SPA ${s.spa}  SPV ${s.spd}`, 6, 74);
    text(ctx, `INIT ${s.spe}`, 6, 84);
    text(ctx, 'ATTACKEN:', 6, 98);
    m.moves.forEach((mv, i) => text(ctx, mv.name.toUpperCase().slice(0, 12) + ' ' + mv.power, 6, 108 + i * 9));
  }

  // -------------------------------------------------------------- Box ---
  class BoxScreen {
    constructor() { this.index = 0; this.scroll = 0; }
    update() {
      const box_ = Game.player.box;
      if (Input.take('b')) { Game.pop(); return; }
      if (!box_.length) { if (Input.take('a')) Game.pop(); return; }
      const n = box_.length;
      if (Input.take('up'))   this.index = (this.index + n - 1) % n;
      if (Input.take('down')) this.index = (this.index + 1) % n;
      this.scroll = Math.max(0, Math.min(this.index - 4, n - 9));
      if (Input.take('a')) {
        if (Game.player.party.length < 6) {
          Game.player.party.push(box_.splice(this.index, 1)[0]);
          this.index = Math.max(0, Math.min(this.index, box_.length - 1));
        }
      }
    }
    draw(ctx) {
      ctx.fillStyle = CREAM; ctx.fillRect(0, 0, 160, 144);
      text(ctx, `BOX (${Game.player.box.length})`, 8, 6);
      text(ctx, Game.player.party.length < 6 ? 'A: Ins Team' : 'Team voll!', 76, 6);
      if (!Game.player.box.length) { text(ctx, 'Die Box ist leer.', 14, 64); return; }
      Game.player.box.slice(this.scroll, this.scroll + 9).forEach((m, i) => {
        const gi = this.scroll + i, y = 22 + i * 13;
        if (gi === this.index) text(ctx, '>', 2, y);
        text(ctx, m.name.toUpperCase(), 12, y);
        text(ctx, 'L' + m.level, 124, y);
      });
    }
  }

  // ----------------------------------------------------------- Pokédex ---
  class DexScreen {
    constructor() { this.index = 0; this.scroll = 0; this.detail = null; }
    update() {
      if (this.detail) { if (Input.take('a') || Input.take('b')) this.detail = null; return; }
      if (Input.take('b')) { Game.pop(); return; }
      const n = Data.COUNT;
      if (Input.take('up'))    this.index = (this.index + n - 1) % n;
      if (Input.take('down'))  this.index = (this.index + 1) % n;
      if (Input.take('left'))  this.index = Math.max(0, this.index - 9);
      if (Input.take('right')) this.index = Math.min(n - 1, this.index + 9);
      this.scroll = Math.max(0, Math.min(this.index - 4, n - 9));
      if (Input.take('a')) {
        const id = this.index + 1;
        if (Game.player.seen.has(id) || Game.player.caught.has(id)) this.detail = id;
      }
    }
    draw(ctx) {
      ctx.fillStyle = CREAM; ctx.fillRect(0, 0, 160, 144);
      if (this.detail) { this.drawDetail(ctx, this.detail); return; }
      text(ctx, `POKEDEX  ${Game.player.caught.size}/151`, 8, 6);
      for (let i = 0; i < 9; i++) {
        const gi = this.scroll + i;
        if (gi >= Data.COUNT) break;
        const id = gi + 1, y = 22 + i * 13;
        const caught = Game.player.caught.has(id), seen = Game.player.seen.has(id);
        if (gi === this.index) text(ctx, '>', 2, y);
        text(ctx, String(id).padStart(3, '0'), 12, y, caught ? INK : '#787878');
        text(ctx, caught || seen ? Data.byId(id).name.toUpperCase() : '----------', 44, y,
             caught ? INK : '#787878');
        if (caught) text(ctx, 'o', 148, y, '#e03028'); // Pokéball-Marker
      }
    }
    drawDetail(ctx, id) {
      const sp = Data.byId(id);
      const caught = Game.player.caught.has(id);
      box(ctx, 0, 0, 160, 144);
      const img = Data.sprite(sp.front);
      if (img) {
        if (caught) ctx.drawImage(img, 8, 8, 56, 56);
        else drawSilhouette(ctx, img, 8, 8, 56); // nur gesehen: Silhouette
      } else Data.drawPlaceholder(ctx, sp, 8, 8, 56);
      text(ctx, 'No.' + String(id).padStart(3, '0'), 72, 12);
      text(ctx, caught ? sp.name.toUpperCase() : '???', 72, 24);
      if (caught) {
        text(ctx, sp.types.map(t => Data.TYPE_DE[t]).join('/'), 72, 36);
        const b = sp.base;
        text(ctx, 'BASISWERTE:', 8, 72);
        text(ctx, `KP   ${String(b.hp).padStart(3)}  ANG  ${String(b.atk).padStart(3)}`, 8, 86);
        text(ctx, `VER  ${String(b.def).padStart(3)}  SPA  ${String(b.spa).padStart(3)}`, 8, 98);
        text(ctx, `SPV  ${String(b.spd).padStart(3)}  INIT ${String(b.spe).padStart(3)}`, 8, 110);
      } else {
        text(ctx, 'Noch nicht', 72, 48);
        text(ctx, 'gefangen!', 72, 58);
      }
      text(ctx, 'A/B: Zurueck', 8, 130, '#787878');
    }
  }

  // --------------------------------------------------- Online / Lobby ---
  // Kleiner GBC-Pokéball für Lade-/Such-Animationen (rotierender Glanzpunkt).
  function spinBall(ctx, cx, cy, r, t) {
    ctx.fillStyle = '#e03028'; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.fill();
    ctx.fillStyle = PAPER;    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
    const a = t / 250;       // rotierender Glanzpunkt um den Ball
    ctx.fillStyle = '#f8d030';
    ctx.fillRect(Math.round(cx + Math.cos(a) * (r + 3)) - 1, Math.round(cy + Math.sin(a) * (r + 3)) - 1, 2, 2);
  }
  const dots = t => '.'.repeat(1 + Math.floor(t / 350) % 3);

  /** Einstiegs-Lobby: Schnellkampf / Raum erstellen / Code eingeben. */
  class OnlineScreen {
    constructor() {
      this.items = ['SCHNELLKAMPF', 'RAUM OEFFNEN', 'CODE EINGEBEN', 'MEIN TEAM', 'RANGLISTE', 'TAUSCH', 'REPLAYS', 'ZURUECK'];
      this.index = 0; this.t = 0; this.myRank = null;
      this.transport = Net.makeTransport();
      this.status = 'connecting';
      this.busy = false;
      this.transport.connect()
        .then(() => { this.status = 'online'; Net.fetchRank(this.transport.serverId || Net.trainerId()).then(r => { this.myRank = r; }).catch(() => {}); })
        .catch(() => { this.status = 'offline'; });
    }
    update(dt) {
      this.t += dt;
      if (this.busy) return;                  // während createRoom() kurz gesperrt
      const n = this.items.length;
      if (Input.take('up'))   { this.index = (this.index + n - 1) % n; Sound.cursor(); }
      if (Input.take('down')) { this.index = (this.index + 1) % n; Sound.cursor(); }
      if (Input.take('b')) { this.leave(); return; }
      if (Input.take('a')) {
        const choice = this.items[this.index];
        if (choice === 'ZURUECK') { Sound.confirm(); this.leave(); return; }
        if (this.status !== 'online') { Sound.cursor(); return; }  // erst verbinden
        Sound.confirm();
        switch (choice) {
          case 'SCHNELLKAMPF':   Game.push(new OnlineSearchScreen(this.transport, 'quick')); break;
          case 'RAUM OEFFNEN':
            this.busy = true;
            this.transport.createRoom().then(({ code }) => {
              this.busy = false;
              Game.push(new OnlineSearchScreen(this.transport, 'host', code));
            }).catch(() => { this.busy = false; });
            break;
          case 'CODE EINGEBEN':  Game.push(new OnlineCodeScreen(this.transport)); break;
          case 'MEIN TEAM':      Game.push(new PvpTeamScreen()); break;
          case 'RANGLISTE':      Game.push(new LeaderboardScreen()); break;
          case 'TAUSCH':         Game.push(new OnlineSearchScreen(this.transport, 'trade')); break;
          case 'REPLAYS':        Game.push(new ReplayListScreen()); break;
        }
      }
    }
    leave() { try { this.transport.close(); } catch (e) {} Game.pop(); }
    draw(ctx) {
      ctx.fillStyle = '#283050'; ctx.fillRect(0, 0, 160, 144);
      // Kopf
      ctx.fillStyle = '#e03028'; ctx.fillRect(20, 4, 120, 20);
      ctx.strokeStyle = '#f8d030'; ctx.lineWidth = 2; ctx.strokeRect(21, 5, 118, 18);
      text(ctx, 'ONLINE', 56, 9, '#f8d030');
      // Status / ID / ELO
      const stCol = this.status === 'online' ? '#30b850' : this.status === 'offline' ? '#e03028' : '#f8b800';
      ctx.fillStyle = stCol; ctx.fillRect(10, 30, 6, 6);
      const stTxt = this.status === 'online' ? 'VERBUNDEN' : this.status === 'offline' ? 'OFFLINE' : 'VERBINDE' + dots(this.t);
      text(ctx, stTxt, 20, 29, '#a8b8d8');
      text(ctx, Net.isLoggedIn() ? String(Net.accountName() || '').toUpperCase().slice(0, 9) : ('ID ' + Net.trainerId()), 84, 29, Net.isLoggedIn() ? '#88c0f8' : '#a8b8d8');
      text(ctx, this.myRank ? ('ELO ' + this.myRank.elo + '  #' + this.myRank.rank + '/' + this.myRank.total) : 'ELO: noch unranked', 20, 40, '#f8d030');
      // Menü (8 Einträge)
      box(ctx, 12, 48, 136, 90);
      this.items.forEach((it, i) => {
        const y = 53 + i * 10;
        text(ctx, it, 34, y);
        if (i === this.index) text(ctx, '>', 22, y);
      });
      if (this.busy) text(ctx, 'Erstelle Raum' + dots(this.t), 90, 55, '#68789a');
    }
  }

  /**
   * Such-/Warte-Screen für alle drei Modi:
   *   'quick' Schnellkampf · 'host' Raum (Code anzeigen) · 'join' Code beitreten.
   * Da noch kein Backend live ist, endet die Suche höflich im „bald"-Hinweis —
   * der Übergang in den echten PvP-Kampf ist als TODO markiert (Phase P1).
   */
  class OnlineSearchScreen {
    constructor(transport, mode, code = null) {
      this.tp = transport; this.mode = mode; this.code = code;
      this.t = 0; this.phase = 'search';      // 'search' | 'notice'
      this.notice = '';
      const onTick = () => {};
      const done = r => this.onMatched(r.matched);
      const fail = reason => {
        if (reason === 'cancelled') return;   // per B abgebrochen -> Screen schon weg
        this.phase = 'notice';
        this.notice =
          reason === 'no-room'  ? 'Kein Raum mit diesem CODE gefunden.' :
          reason === 'no-opponent' ? 'Der ONLINE-DIENST startet bald! Aktuell ist kein Gegner erreichbar.' :
          (reason === 'closed' || reason === 'timeout' || reason === 'error')
            ? 'Verbindung zum Server fehlgeschlagen. Versuch es spaeter erneut!'
            : 'Kein Gegner gefunden. Versuch es spaeter erneut!';
        Sound.cursor();
      };
      if (mode === 'quick')      transport.quickMatch(onTick).then(done).catch(fail);
      else if (mode === 'host')  transport.waitForJoin(code, onTick).then(done).catch(fail);
      else if (mode === 'trade') transport.tradeQuick().then(r => this.onMatchedTrade(r)).catch(fail);
      else                       transport.joinRoom(code, onTick).then(done).catch(fail);
    }
    onMatched(matched) {
      if (this._matched) return;
      this._matched = true;
      Sound.confirm();
      Game.pop();                                       // Such-Screen schließen
      Game.push(new OnlineBattleScreen(this.tp, matched));
    }
    onMatchedTrade(m) {
      if (this._matched) return;
      this._matched = true;
      Sound.confirm();
      Game.pop();
      Game.push(new TradeScreen(this.tp, m));
    }
    update(dt) {
      this.t += dt;
      if (this.phase === 'notice') {
        if (Input.take('a') || Input.take('b')) { Game.pop(); }
        return;
      }
      if (Input.take('b')) { this.tp.cancel(); Game.pop(); }
    }
    draw(ctx) {
      ctx.fillStyle = '#283050'; ctx.fillRect(0, 0, 160, 144);
      if (this.phase === 'notice') {
        spinBall(ctx, 80, 40, 12, 0);
        box(ctx, 8, 64, 144, 56);
        textWrapped(ctx, this.notice, 16, 74, 16);
        text(ctx, 'A: OK', 16, 108, '#68789a');
        return;
      }
      spinBall(ctx, 80, 44, 13, this.t);
      const head = this.mode === 'host' ? 'WARTE AUF GEGNER' : this.mode === 'trade' ? 'SUCHE TAUSCH' : 'SUCHE GEGNER';
      text(ctx, head + dots(this.t), 28, 72, '#f8f8f8');
      if (this.code) {
        box(ctx, 40, 86, 80, 24);
        text(ctx, 'CODE ' + this.code, 52, 94, '#f8d030');
      }
      text(ctx, 'B: Abbrechen', 36, 124, '#68789a');
    }
  }

  /** GBC-Code-Eingabe: 4 Slots, hoch/runter ändert Zeichen, A bestätigt. */
  class OnlineCodeScreen {
    constructor(transport) {
      this.tp = transport;
      this.chars = Net.CODE_CHARS;
      this.slots = [0, 0, 0, 0];
      this.pos = 0; this.t = 0;
    }
    update(dt) {
      this.t += dt;
      if (Input.take('b')) { Game.pop(); return; }
      if (Input.take('left'))  { this.pos = (this.pos + 3) % 4; Sound.cursor(); }
      if (Input.take('right')) { this.pos = (this.pos + 1) % 4; Sound.cursor(); }
      const n = this.chars.length;
      if (Input.take('up'))    { this.slots[this.pos] = (this.slots[this.pos] + 1) % n; Sound.cursor(); }
      if (Input.take('down'))  { this.slots[this.pos] = (this.slots[this.pos] + n - 1) % n; Sound.cursor(); }
      if (Input.take('a')) {
        Sound.confirm();
        const code = this.slots.map(i => this.chars[i]).join('');
        Game.pop();                                  // Code-Screen schließen
        Game.push(new OnlineSearchScreen(this.tp, 'join', code));
      }
    }
    draw(ctx) {
      ctx.fillStyle = '#283050'; ctx.fillRect(0, 0, 160, 144);
      text(ctx, 'CODE EINGEBEN', 28, 18, '#f8d030');
      for (let i = 0; i < 4; i++) {
        const x = 30 + i * 26;
        box(ctx, x, 56, 20, 24);
        text(ctx, this.chars[this.slots[i]], x + 6, 64, i === this.pos ? '#e03028' : INK);
        if (i === this.pos) {
          text(ctx, '^', x + 6, 46, '#f8f8f8');
          text(ctx, 'v', x + 6, 82, '#f8f8f8');
        }
      }
      text(ctx, 'A: Beitreten', 36, 108, '#a8b8d8');
      text(ctx, 'B: Zurueck', 36, 120, '#68789a');
    }
  }

  /**
   * Online-PvP-Kampf: rendert den serverautoritativen Kampf im offiziellen
   * Kampf-Look und spielt die vom Server gelieferte Event-Liste animiert ab.
   * Der Client trifft nur Entscheidungen (Attacke/Wechsel) — gerechnet wird
   * ausschliesslich serverseitig (battle-core.js). Siehe MULTIPLAYER_PLAN.md.
   */
  /** PvP-Team zusammenstellen: bis zu 6 aus Party + Box (-> Net.pvpTeam). */
  class PvpTeamScreen {
    constructor() {
      this.all = Game.player.party.concat(Game.player.box);
      this.chosen = [];                       // Indizes in Auswahl-Reihenfolge
      const cur = Net.pvpTeam, used = new Set();
      if (cur && cur.length) {
        for (const e of cur) {
          const i = this.all.findIndex((m, idx) => !used.has(idx) && m.id === e.id && m.level === e.level);
          if (i >= 0 && this.chosen.length < 6) { this.chosen.push(i); used.add(i); }
        }
      }
      if (!this.chosen.length) for (let i = 0; i < Game.player.party.length && this.chosen.length < 6; i++) this.chosen.push(i);
      this.index = 0; this.scroll = 0; this.note = null;
    }
    flash(t) { this.note = { text: t, t: 1000 }; }
    update(dt) {
      if (this.note && (this.note.t -= dt) <= 0) this.note = null;
      const n = this.all.length;
      if (!n) { if (Input.take('a') || Input.take('b')) Game.pop(); return; }
      if (Input.take('up'))   { this.index = (this.index + n - 1) % n; Sound.cursor(); }
      if (Input.take('down')) { this.index = (this.index + 1) % n; Sound.cursor(); }
      this.scroll = Math.max(0, Math.min(this.index - 4, n - 8));
      if (Input.take('a')) {
        const pos = this.chosen.indexOf(this.index);
        if (pos >= 0) { this.chosen.splice(pos, 1); Sound.cursor(); }
        else if (this.chosen.length < 6) { this.chosen.push(this.index); Sound.confirm(); }
        else this.flash('Maximal 6 POKEMON!');
      }
      if (Input.take('b')) {
        Net.pvpTeam = this.chosen.length ? this.chosen.map(i => ({ id: this.all[i].id, level: this.all[i].level })) : null;
        Game.pop();
      }
    }
    draw(ctx) {
      ctx.fillStyle = CREAM; ctx.fillRect(0, 0, 160, 144);
      text(ctx, 'PvP-TEAM ' + this.chosen.length + '/6', 6, 6);
      if (!this.all.length) { text(ctx, 'Kein POKEMON!', 12, 64); return; }
      this.all.slice(this.scroll, this.scroll + 8).forEach((m, i) => {
        const gi = this.scroll + i, y = 20 + i * 13;
        if (gi === this.index) text(ctx, '>', 2, y);
        const pos = this.chosen.indexOf(gi);
        text(ctx, pos >= 0 ? String(pos + 1) : '-', 10, y, pos >= 0 ? '#e03028' : '#a0a0a0');
        text(ctx, Data.byId(m.id).name.toUpperCase(), 22, y);
        text(ctx, 'L' + m.level, 130, y);
      });
      if (this.note) { box(ctx, 4, 116, 152, 26); textWrapped(ctx, this.note.text, 10, 124, 18); }
      else text(ctx, 'A: waehlen   B: fertig', 8, 132, '#787878');
    }
  }

  const STATUS_WORD = { psn: 'wurde vergiftet!', brn: 'erleidet Verbrennungen!', par: 'ist paralysiert!', frz: 'erstarrt zu Eis!' };
  class OnlineBattleScreen {
    constructor(transport, matched) {
      this.tp = transport; this.me = matched.you;
      this.token = matched.token; this.clause = matched.clause || {};
      this.self = null; this.opp = null;          // [{id,level,maxHp,hp,status,moves?}]
      this.aSelf = 0; this.aOpp = 0;
      this.dispSelfHp = 0; this.dispOppHp = 0;
      this.queue = []; this.cur = null;           // Event-Animation
      this.request = null; this.menu = null;
      this.endInfo = null; this.ended = null;
      this.waiting = false; this.msg = 'Synchronisiere...';
      this.flashSelf = 0; this.flashOpp = 0; this.time = 0;
      this.reconnecting = false; this.resumeTries = 0; this.oppGone = false; this.turnEndsAt = 0;
      this.off = transport.on(m => this.onMsg(m));
      const team = (Net.pvpTeam && Net.pvpTeam.length) ? Net.pvpTeam : Game.player.party.map(m => ({ id: m.id, level: m.level }));
      transport.send({ t: 'team', mons: team });
    }

    onMsg(m) {
      if (m.t === 'start' || m.t === 'resync') {
        this.self = m.self; this.opp = m.opp;
        this.aSelf = m.aSelf || 0; this.aOpp = m.aOpp || 0;
        this.dispSelfHp = this.self[this.aSelf].hp; this.dispOppHp = this.opp[this.aOpp].hp;
        this.queue = []; this.cur = null; this.menu = null; this.request = null;
        this.reconnecting = false; this.waiting = false;
        this.msg = m.t === 'resync' ? 'Wieder verbunden!' : 'Der Kampf beginnt!';
        Data.sprite(Data.byId(this.self[this.aSelf].id).back); Data.sprite(Data.byId(this.opp[this.aOpp].id).front);
      } else if (m.t === 'turn') { this.waiting = false; for (const e of m.events) this.queue.push(e); }
      else if (m.t === 'request') { this.request = m; }
      else if (m.t === 'end') { this.endInfo = m; }
      else if (m.t === 'oppgone') { this.oppGone = true; }
      else if (m.t === 'oppback') { this.oppGone = false; }
      else if (m.t === 'cancelled') { this.endInfo = { result: 'cancelled', reason: m.reason }; }
      else if (m.t === 'error') { this.endInfo = m.code === 'no-match' ? { result: 'lose', reason: 'closed' } : { result: 'cancelled', reason: m.code }; }
      else if (m.t === '_closed') { this.handleClose(); }
    }

    handleClose() {
      if (this.ended || this.endInfo) return;
      if (!this.token || this.reconnecting || this.resumeTries >= 3) {
        this.endInfo = { result: 'lose', reason: 'closed' }; return;
      }
      this.reconnecting = true; this.resumeTries++; this.menu = null;
      this.msg = 'Verbindung verloren - neu verbinden...';
      this.tp.resume(this.token).catch(() => { this.reconnecting = false; this.handleClose(); });
    }

    nameOf(side, idx) { const arr = side === this.me ? this.self : this.opp; return Data.byId(arr[idx].id).name.toUpperCase(); }
    activeIdx(side) { return side === this.me ? this.aSelf : this.aOpp; }

    beginEvent(e) {
      const ev = { t: 700 };
      const mine = e.side === this.me;
      switch (e.e) {
        case 'switch': {
          const arr = mine ? this.self : this.opp;
          arr[e.mon].hp = e.hp; arr[e.mon].status = e.status;
          if (mine) { this.aSelf = e.mon; this.dispSelfHp = e.hp; Data.sprite(Data.byId(arr[e.mon].id).back); }
          else { this.aOpp = e.mon; this.dispOppHp = e.hp; Data.sprite(Data.byId(arr[e.mon].id).front); }
          this.msg = (mine ? 'Los, ' : 'Gegner schickt ') + this.nameOf(e.side, e.mon) + '!'; ev.t = 800; break;
        }
        case 'move': this.msg = this.nameOf(e.side, this.activeIdx(e.side)) + ' setzt ' + e.move.toUpperCase() + ' ein!'; ev.t = 650; break;
        case 'miss': this.msg = 'Die Attacke ging daneben!'; break;
        case 'immune': this.msg = 'Es hat keine Wirkung auf ' + this.nameOf(e.side, this.activeIdx(e.side)) + '!'; break;
        case 'damage': {
          (mine ? this.self[this.aSelf] : this.opp[this.aOpp]).hp = e.to;
          if (mine) { this.flashSelf = 18; ev.hpKey = 'dispSelfHp'; } else { this.flashOpp = 18; ev.hpKey = 'dispOppHp'; }
          ev.hpTarget = e.to; ev.t = 350;
          this.msg = e.crit ? 'Ein Volltreffer!' : e.eff > 1 ? 'Das ist sehr effektiv!' : e.eff < 1 ? 'Nicht sehr effektiv...' : '';
          Sound.hit && Sound.hit(e.eff); break;
        }
        case 'status': {
          (mine ? this.self[this.aSelf] : this.opp[this.aOpp]).status = e.status;
          this.msg = this.nameOf(e.side, this.activeIdx(e.side)) + ' ' + (STATUS_WORD[e.status] || 'leidet!'); break;
        }
        case 'statusdmg': {
          (mine ? this.self[this.aSelf] : this.opp[this.aOpp]).hp = e.to;
          ev.hpKey = mine ? 'dispSelfHp' : 'dispOppHp'; ev.hpTarget = e.to; ev.t = 350;
          this.msg = this.nameOf(e.side, this.activeIdx(e.side)) + ' leidet unter dem Status!'; break;
        }
        case 'thaw': (mine ? this.self[this.aSelf] : this.opp[this.aOpp]).status = null; this.msg = this.nameOf(e.side, this.activeIdx(e.side)) + ' ist aufgetaut!'; break;
        case 'frozen': this.msg = this.nameOf(e.side, this.activeIdx(e.side)) + ' ist gefroren!'; break;
        case 'fullpar': this.msg = this.nameOf(e.side, this.activeIdx(e.side)) + ' ist paralysiert!'; break;
        case 'faint': (mine ? this.self[this.aSelf] : this.opp[this.aOpp]).hp = 0; this.msg = this.nameOf(e.side, this.activeIdx(e.side)) + ' wurde besiegt!'; ev.t = 900; Sound.faint && Sound.faint(); break;
        default: ev.t = 1;       // forceswitch/win: nur Steuer-Events
      }
      return ev;
    }

    armTimer() { this.turnEndsAt = this.time + ((this.request && this.request.deadline) || 30000); }
    openMain() { this.armTimer(); this.menu = { mode: 'main', index: 0 }; this.msg = 'Was soll ' + this.nameOf(this.me, this.aSelf) + ' tun?'; }
    openMove() { this.menu = { mode: 'move', index: 0, items: this.self[this.aSelf].moves.map(m => m.name.toUpperCase()) }; }
    openSwitch() { this.menu = { mode: 'switch', index: this.aSelf }; }
    openForce() { this.armTimer(); this.menu = { mode: 'force', index: this.request.options.switchTo[0] }; this.msg = this.nameOf(this.me, this.aSelf) + ' wurde besiegt! Naechstes POKEMON?'; }

    sendAction(kind, data) {
      this.tp.send({ t: 'action', turn: this.request.turn, kind, data });
      this.request = null; this.menu = null; this.waiting = true; this.msg = 'Warte auf Gegner...';
    }

    updateMenu() {
      const mu = this.menu;
      if (mu.mode === 'main') {
        if (Input.take('up') || Input.take('down')) { mu.index = 1 - mu.index; Sound.cursor(); }
        if (Input.take('a')) { Sound.confirm(); mu.index === 0 ? this.openMove() : this.openSwitch(); }
        return;
      }
      const n = mu.mode === 'move' ? mu.items.length : this.self.length;
      if (Input.take('up')) { mu.index = (mu.index + n - 1) % n; Sound.cursor(); }
      if (Input.take('down')) { mu.index = (mu.index + 1) % n; Sound.cursor(); }
      if (mu.mode !== 'force' && Input.take('b')) { this.openMain(); return; }
      if (Input.take('a')) {
        if (mu.mode === 'move') { Sound.confirm(); this.sendAction('move', mu.index); return; }
        const mon = this.self[mu.index];
        if (mon.hp <= 0) { Sound.cursor(); return; }
        if (mu.mode === 'switch' && mu.index === this.aSelf) { Sound.cursor(); return; }
        Sound.confirm(); this.sendAction('switch', mu.index);
      }
    }

    update(dt) {
      this.time += dt;
      if (this.flashSelf > 0) this.flashSelf--;
      if (this.flashOpp > 0) this.flashOpp--;
      if (this.ended) { if (Input.take('a') || Input.take('b')) { if (this.off) this.off(); Game.pop(); } return; }
      if (this.menu) { this.updateMenu(); return; }
      if (this.cur) {
        const e = this.cur;
        if (e.hpKey) {
          if (this[e.hpKey] !== e.hpTarget) {
            const step = Math.max(1, Math.floor(Math.abs(this[e.hpKey] - e.hpTarget) / 12));
            this[e.hpKey] = this[e.hpKey] > e.hpTarget ? Math.max(e.hpTarget, this[e.hpKey] - step) : Math.min(e.hpTarget, this[e.hpKey] + step);
          }
          e.t -= dt;
          if (this[e.hpKey] === e.hpTarget && e.t <= 0) this.cur = null;
        } else { e.t -= dt; if (e.t <= 0 || Input.take('a')) this.cur = null; }
        return;
      }
      if (this.queue.length) { this.cur = this.beginEvent(this.queue.shift()); return; }
      if (this.endInfo) {
        this.ended = this.endInfo;
        const r = this.endInfo;
        this.msg = r.result === 'win'
          ? (r.reason === 'disconnect' ? 'Gegner getrennt - du GEWINNST!' : 'Du hast GEWONNEN!')
          : r.result === 'cancelled'
            ? (r.reason === 'no-legendary' ? 'Legendaere sind im Schnellkampf nicht erlaubt!'
              : r.reason === 'bad-team' ? 'Ungueltiges Team!'
              : r.reason === 'opp-team' ? 'Gegner hatte ein ungueltiges Team.' : 'Match abgebrochen.')
            : (r.reason && r.reason !== 'ko' ? 'Verbindung verloren...' : 'Du hast VERLOREN...');
        Sound.badge && r.result === 'win' && Sound.badge();
        return;
      }
      if (this.reconnecting) return;                       // wartet auf resync
      if (this.request) { this.request.kind === 'forceswitch' ? this.openForce() : this.openMain(); return; }
      if (this.oppGone) { this.msg = 'Gegner getrennt - warte auf Reconnect...'; return; }
      if (this.waiting) this.msg = 'Warte auf Gegner...';
    }

    drawSprite(ctx, sp, url, x, y, flash) {
      if (flash > 0 && Math.floor(flash / 3) % 2 === 0) return;
      const img = Data.sprite(url);
      if (img) ctx.drawImage(img, x, y, 56, 56); else Data.drawPlaceholder(ctx, sp, x, y, 56);
    }
    drawStatus(ctx, status, x, y) {
      if (!status) return;
      ctx.fillStyle = Data.STATUS_COLORS[status]; ctx.fillRect(x - 1, y - 1, 26, 9);
      text(ctx, Data.STATUS_DE[status], x, y, '#f8f8f8');
    }
    aliveBalls(ctx, team, x, y) {
      for (let i = 0; i < team.length; i++) { ctx.fillStyle = team[i].hp > 0 ? '#e03028' : '#b0b0b0'; ctx.fillRect(x + i * 6, y, 4, 4); }
    }

    draw(ctx) {
      ctx.fillStyle = '#f8f8f8'; ctx.fillRect(0, 0, 160, 144);
      if (!this.self) { box(ctx, 0, 96, 160, 48); textWrapped(ctx, this.msg, 6, 108, 18); return; }
      ctx.fillStyle = '#b0d8a0';
      ctx.beginPath(); ctx.ellipse(126, 62, 30, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(36, 96, 32, 7, 0, 0, Math.PI * 2); ctx.fill();
      const sm = this.self[this.aSelf], om = this.opp[this.aOpp];
      const sSp = Data.byId(sm.id), oSp = Data.byId(om.id);
      this.drawSprite(ctx, oSp, oSp.front, 98, 10, this.flashOpp);
      this.drawSprite(ctx, sSp, sSp.back, 8, 44, this.flashSelf);
      // Gegner-Box
      box(ctx, 2, 2, 92, 34);
      text(ctx, oSp.name.toUpperCase(), 6, 7);
      text(ctx, ':L' + om.level, 52, 16);
      this.drawStatus(ctx, om.status, 10, 17);
      hpBar(ctx, 10, 26, 76, this.dispOppHp, om.maxHp);
      this.aliveBalls(ctx, this.opp, 70, 4);
      // Eigene Box
      box(ctx, 64, 56, 94, 40);
      text(ctx, sSp.name.toUpperCase(), 68, 60);
      text(ctx, ':L' + sm.level, 116, 69);
      this.drawStatus(ctx, sm.status, 72, 70);
      hpBar(ctx, 72, 80, 78, this.dispSelfHp, sm.maxHp);
      text(ctx, this.dispSelfHp + '/' + sm.maxHp, 88, 87);
      this.aliveBalls(ctx, this.self, 68, 56);
      // Online-Marker
      text(ctx, 'ONLINE', 100, 48, '#3878c8');
      // Textbox / Menü
      box(ctx, 0, 96, 160, 48);
      if (this.menu && !this.ended) {                       // Zug-Timer
        const rem = Math.max(0, Math.ceil((this.turnEndsAt - this.time) / 1000));
        text(ctx, rem + 's', 4, 98, rem <= 5 ? '#e03028' : '#a0a0a0');
      }
      if (this.menu && this.menu.mode === 'main') {
        box(ctx, 64, 96, 96, 48);
        ['KAMPF', 'PKMN'].forEach((it, i) => { const y = 108 + i * 12; text(ctx, it, 86, y); if (i === this.menu.index) text(ctx, '>', 76, y); });
        textWrapped(ctx, this.msg, 6, 104, 7);
      } else if (this.menu && this.menu.mode === 'move') {
        this.menu.items.forEach((it, i) => { const y = 104 + i * 10; text(ctx, it, 18, y); if (i === this.menu.index) text(ctx, '>', 8, y); });
      } else if (this.menu) {           // switch / force
        text(ctx, this.menu.mode === 'force' ? 'WECHSLE ZU:' : 'WECHSELN:', 6, 100);
        this.self.forEach((m, i) => {
          const y = 110 + i * 9; if (y > 140) return;
          if (i === this.menu.index) text(ctx, '>', 4, y);
          text(ctx, Data.byId(m.id).name.toUpperCase(), 12, y, m.hp > 0 ? INK : '#a85850');
          text(ctx, m.hp <= 0 ? 'K.O.' : 'L' + m.level, 120, y);
        });
      } else {
        textWrapped(ctx, this.msg, 6, this.ended && this.ended.elo ? 104 : 108, 18);
        if (this.ended && this.ended.elo) {
          const e = this.ended.elo;
          text(ctx, 'ELO ' + e.elo + ' (' + (e.delta >= 0 ? '+' : '') + e.delta + ')', 6, 124, e.delta >= 0 ? '#30b850' : '#e03028');
        }
        if (this.ended) text(ctx, 'A: OK', 132, 134, '#787878');
      }
    }
  }

  // ----------------------------------------------------- Cloud-Sync UI ---
  /** Spielstand in die Cloud hoch-/herunterladen (anonymer Sync-Code). */
  class CloudScreen {
    constructor() { this.items = ['HOCHLADEN', 'AUTO-SYNC', 'LADEN', 'ZURUECK']; this.index = 0; this.note = null; this.busy = false; }
    flash(t) { this.note = { text: t, t: 1600 }; }
    update(dt) {
      if (this.note && (this.note.t -= dt) <= 0) this.note = null;
      if (this.busy) return;
      const n = this.items.length;
      if (Input.take('up'))   { this.index = (this.index + n - 1) % n; Sound.cursor(); }
      if (Input.take('down')) { this.index = (this.index + 1) % n; Sound.cursor(); }
      if (Input.take('b')) { Game.pop(); return; }
      if (Input.take('a')) {
        const c = this.items[this.index];
        if (c === 'ZURUECK') { Game.pop(); return; }
        Sound.confirm();
        if (c === 'AUTO-SYNC') { Net.setSyncEnabled(!Net.syncEnabled()); this.flash('Auto-Sync ' + (Net.syncEnabled() ? 'AN' : 'AUS')); }
        else if (c === 'HOCHLADEN') {
          this.busy = true; this.flash('Lade hoch...');
          Net.uploadSave(Net.syncCode(), Game.exportSave())
            .then(() => { this.busy = false; this.flash('Hochgeladen unter ' + Net.syncCode() + '!'); })
            .catch(() => { this.busy = false; this.flash('Server nicht erreichbar.'); });
        } else if (c === 'LADEN') { Game.push(new CloudLoadScreen()); }
      }
    }
    draw(ctx) {
      ctx.fillStyle = CREAM; ctx.fillRect(0, 0, 160, 144);
      text(ctx, 'CLOUD-SYNC', 8, 8);
      text(ctx, 'DEIN CODE:', 8, 26, '#585858');
      text(ctx, Net.syncCode(), 92, 26, '#e03028');
      this.items.forEach((it, i) => {
        const y = 46 + i * 13;
        if (i === this.index) text(ctx, '>', 8, y);
        text(ctx, it === 'AUTO-SYNC' ? 'AUTO-SYNC: ' + (Net.syncEnabled() ? 'AN' : 'AUS') : it, 20, y);
      });
      text(ctx, 'Code notieren!', 8, 102, '#787878');
      text(ctx, '2.Geraet: LADEN', 8, 111, '#787878');
      if (this.note) { box(ctx, 4, 120, 152, 22); textWrapped(ctx, this.note.text, 10, 127, 18); }
    }
  }

  /** 6-Zeichen-Code eingeben, Stand ziehen, nach Bestätigung übernehmen. */
  class CloudLoadScreen {
    constructor() { this.chars = Net.CODE_CHARS; this.slots = [0, 0, 0, 0, 0, 0]; this.pos = 0; this.phase = 'input'; this.note = null; this.data = null; this.confYes = true; }
    flash(t) { this.note = { text: t, t: 1600 }; }
    code() { return this.slots.map(i => this.chars[i]).join(''); }
    update(dt) {
      if (this.note && (this.note.t -= dt) <= 0) this.note = null;
      if (this.phase === 'loading') return;
      if (this.phase === 'confirm') {
        if (Input.take('up') || Input.take('down')) { this.confYes = !this.confYes; Sound.cursor(); }
        if (Input.take('a')) { Sound.confirm(); if (this.confYes) Game.loadSaveString(this.data.save); else this.phase = 'input'; }
        if (Input.take('b')) this.phase = 'input';
        return;
      }
      if (Input.take('b')) { Game.pop(); return; }
      if (Input.take('left'))  { this.pos = (this.pos + 5) % 6; Sound.cursor(); }
      if (Input.take('right')) { this.pos = (this.pos + 1) % 6; Sound.cursor(); }
      const n = this.chars.length;
      if (Input.take('up'))   { this.slots[this.pos] = (this.slots[this.pos] + 1) % n; Sound.cursor(); }
      if (Input.take('down')) { this.slots[this.pos] = (this.slots[this.pos] + n - 1) % n; Sound.cursor(); }
      if (Input.take('a')) {
        Sound.confirm(); this.phase = 'loading'; this.flash('Lade...');
        Net.downloadSave(this.code())
          .then(d => { this.data = d; this.confYes = true; this.phase = 'confirm'; })
          .catch(e => { this.phase = 'input'; this.flash(e === 'not-found' ? 'Kein Stand zu diesem Code.' : 'Server nicht erreichbar.'); });
      }
    }
    draw(ctx) {
      ctx.fillStyle = CREAM; ctx.fillRect(0, 0, 160, 144);
      text(ctx, 'STAND LADEN', 8, 10);
      for (let i = 0; i < 6; i++) {
        const x = 8 + i * 25; box(ctx, x, 40, 20, 22);
        text(ctx, this.chars[this.slots[i]], x + 6, 47, i === this.pos ? '#e03028' : INK);
        if (i === this.pos && this.phase === 'input') { text(ctx, '^', x + 6, 32); text(ctx, 'v', x + 6, 64); }
      }
      if (this.phase === 'confirm' && this.data) {
        box(ctx, 8, 74, 144, 54);
        const d = new Date(this.data.updated_at), p2 = x => String(x).padStart(2, '0');
        text(ctx, 'Gefunden! Stand vom', 14, 80);
        text(ctx, p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + '. ' + p2(d.getHours()) + ':' + p2(d.getMinutes()), 14, 92);
        text(ctx, 'Lokal ersetzen?', 14, 105);
        text(ctx, this.confYes ? '>JA   NEIN' : ' JA  >NEIN', 14, 117);
      } else {
        text(ctx, 'A: Laden   B: Zurueck', 8, 110, '#787878');
        if (this.note) { box(ctx, 4, 120, 152, 22); textWrapped(ctx, this.note.text, 10, 127, 18); }
      }
    }
  }

  /**
   * Direkt nach dem Login: lokalen Stand und Konto-Stand abgleichen.
   *   Konto leer + lokal vorhanden -> lokal ins Konto übernehmen (Migration)
   *   kein lokaler Stand          -> Konto-Stand laden (neues Gerät)
   *   beide vorhanden & verschieden -> Auswahl (kein Datenverlust)
   */
  class LoginSyncScreen {
    constructor() {
      this.phase = 'sync'; this.msg = 'Synchronisiere Konto...'; this.t = 0; this.remote = null; this.confYes = true;
      Net.accountDownloadSave().then(remote => {
        const local = Game.readRawSave();
        if (!remote) {
          if (local) { Net.accountUploadSave(local).catch(() => {}); this.finish('Dein Spielstand wurde in dein Konto uebernommen!'); }
          else this.finish(null);
        } else if (!local) { Game.writeRawSave(remote.save); this.finish('Konto-Spielstand geladen!'); }
        else if (remote.save === local) this.finish(null);
        else { this.remote = remote; this.phase = 'conflict'; }
      }).catch(() => this.finish(null));
    }
    finish(msg) { if (msg) { this.msg = msg; this.phase = 'msg'; } else this.toTitle(); }
    toTitle() { Game.screens = [new TitleScreen()]; }
    update(dt) {
      this.t += dt;
      if (this.phase === 'sync') return;
      if (this.phase === 'conflict') {
        if (Input.take('up') || Input.take('down')) { this.confYes = !this.confYes; Sound.cursor(); }
        if (Input.take('a')) {
          Sound.confirm();
          if (this.confYes) Net.accountUploadSave(Game.readRawSave()).catch(() => {});   // lokal behalten -> hochladen
          else Game.writeRawSave(this.remote.save);                                       // Konto laden
          this.toTitle();
        }
        return;
      }
      if (this.phase === 'msg' && (Input.take('a') || Input.take('b'))) this.toTitle();
    }
    draw(ctx) {
      ctx.fillStyle = '#283050'; ctx.fillRect(0, 0, 160, 144);
      text(ctx, 'KONTO-SYNC', 8, 8, '#f8d030');
      if (this.phase === 'conflict') {
        const d = new Date(this.remote.updated_at), p2 = x => String(x).padStart(2, '0');
        textWrapped(ctx, 'Lokaler UND Konto-Stand vorhanden:', 8, 24, 18);
        text(ctx, 'Konto: ' + p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + '. ' + p2(d.getHours()) + ':' + p2(d.getMinutes()), 8, 56, '#a8b8d8');
        text(ctx, (this.confYes ? '>' : ' ') + 'LOKAL behalten', 8, 78, '#f8f8f8');
        text(ctx, (this.confYes ? ' ' : '>') + 'KONTO laden', 8, 90, '#f8f8f8');
        text(ctx, 'LOKAL = dein jetziger Stand', 8, 112, '#68789a');
      } else {
        text(ctx, this.phase === 'sync' ? ('Synchronisiere' + dots(this.t)) : this.msg, 8, 50, '#a8b8d8');
        if (this.phase === 'msg') text(ctx, 'A: Weiter', 8, 122, '#68789a');
      }
    }
  }

  /** Google-Konto: anmelden (Rangliste-Identität + Konto-Sync) / abmelden. */
  class KontoScreen {
    constructor() { this.note = null; this.index = 0; this.phase = 'menu'; this.data = null; this.confYes = true; this.rebuild(); }
    rebuild() { this.items = Net.isLoggedIn() ? ['STAND HOCHLADEN', 'STAND LADEN', 'ABMELDEN', 'ZURUECK'] : ['MIT GOOGLE ANMELDEN', 'ZURUECK']; this.index = Math.min(this.index, this.items.length - 1); }
    flash(t) { this.note = { text: t, t: 1600 }; }
    update(dt) {
      if (this.note && (this.note.t -= dt) <= 0) this.note = null;
      if (this.phase === 'busy') return;
      if (this.phase === 'confirm') {
        if (Input.take('up') || Input.take('down')) { this.confYes = !this.confYes; Sound.cursor(); }
        if (Input.take('a')) { Sound.confirm(); if (this.confYes) Game.loadSaveString(this.data.save); else this.phase = 'menu'; }
        if (Input.take('b')) this.phase = 'menu';
        return;
      }
      const n = this.items.length;
      if (Input.take('up'))   { this.index = (this.index + n - 1) % n; Sound.cursor(); }
      if (Input.take('down')) { this.index = (this.index + 1) % n; Sound.cursor(); }
      if (Input.take('b')) { Game.pop(); return; }
      if (Input.take('a')) {
        const c = this.items[this.index];
        if (c === 'ZURUECK') { Game.pop(); return; }
        Sound.confirm();
        if (c === 'MIT GOOGLE ANMELDEN') { location.href = Net.loginUrl(); }
        else if (c === 'STAND HOCHLADEN') {
          this.phase = 'busy'; this.flash('Lade hoch...');
          Net.accountUploadSave(Game.exportSave()).then(() => { this.phase = 'menu'; this.flash('In dein Konto gesichert!'); })
            .catch(e => { this.phase = 'menu'; this.flash(e === 'auth' ? 'Sitzung abgelaufen - neu anmelden.' : 'Server nicht erreichbar.'); });
        } else if (c === 'STAND LADEN') {
          this.phase = 'busy'; this.flash('Lade...');
          Net.accountDownloadSave().then(d => { if (d) { this.data = d; this.confYes = true; this.phase = 'confirm'; } else { this.phase = 'menu'; this.flash('Kein Konto-Stand vorhanden.'); } })
            .catch(e => { this.phase = 'menu'; this.flash(e === 'auth' ? 'Sitzung abgelaufen.' : 'Server nicht erreichbar.'); });
        } else if (c === 'ABMELDEN') { Net.logout().finally(() => { this.rebuild(); this.flash('Abgemeldet.'); }); }
      }
    }
    draw(ctx) {
      ctx.fillStyle = CREAM; ctx.fillRect(0, 0, 160, 144);
      text(ctx, 'KONTO', 8, 8);
      if (Net.isLoggedIn()) { text(ctx, 'Angemeldet als:', 8, 24, '#585858'); text(ctx, String(Net.accountName() || '').toUpperCase().slice(0, 14), 8, 34, '#3878c8'); }
      else { text(ctx, 'Nicht angemeldet.', 8, 26, '#585858'); text(ctx, 'Login = Rangliste +', 8, 40, '#787878'); text(ctx, 'Konto-Sync (kein Code).', 8, 50, '#787878'); }
      if (this.phase === 'confirm' && this.data) {
        box(ctx, 8, 60, 144, 54);
        const d = new Date(this.data.updated_at), p2 = x => String(x).padStart(2, '0');
        text(ctx, 'Konto-Stand vom', 14, 66);
        text(ctx, p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + '. ' + p2(d.getHours()) + ':' + p2(d.getMinutes()), 14, 78);
        text(ctx, 'Lokal ersetzen?', 14, 91);
        text(ctx, this.confYes ? '>JA   NEIN' : ' JA  >NEIN', 14, 103);
      } else {
        this.items.forEach((it, i) => { const y = 66 + i * 12; if (i === this.index) text(ctx, '>', 8, y); text(ctx, it, 20, y); });
      }
      if (this.note) { box(ctx, 4, 118, 152, 24); textWrapped(ctx, this.note.text, 10, 126, 18); }
    }
  }

  /** Rangliste (Top 10 nach ELO) — vom Server geladen. */
  class LeaderboardScreen {
    constructor() { this.rows = null; this.err = false; this.t = 0; Net.fetchLeaderboard().then(d => { this.rows = d.top; }).catch(() => { this.err = true; }); }
    update(dt) { this.t += dt; if (Input.take('a') || Input.take('b')) Game.pop(); }
    draw(ctx) {
      ctx.fillStyle = '#283050'; ctx.fillRect(0, 0, 160, 144);
      text(ctx, 'RANGLISTE', 8, 8, '#f8d030');
      if (this.err) { text(ctx, 'Server nicht', 8, 40, '#e03028'); text(ctx, 'erreichbar.', 8, 52, '#e03028'); }
      else if (!this.rows) { text(ctx, 'Lade' + dots(this.t), 8, 40, '#a8b8d8'); }
      else if (!this.rows.length) { text(ctx, 'Noch keine Eintraege.', 8, 40, '#a8b8d8'); }
      else this.rows.slice(0, 10).forEach((r, i) => {
        const y = 22 + i * 11;
        text(ctx, String(i + 1).padStart(2), 6, y, i < 3 ? '#f8d030' : '#a8b8d8');
        text(ctx, String(r.name).toUpperCase().slice(0, 8), 28, y, '#f8f8f8');
        text(ctx, String(r.elo), 100, y, '#30b850');
        text(ctx, r.wins + '-' + r.losses, 128, y, '#88a0c8');
      });
      text(ctx, 'A/B: Zurueck', 8, 134, '#68789a');
    }
  }

  /** Live-Tausch: ein Pokémon anbieten, beide bestätigen, Server tauscht. */
  const TRADE_EVO = { 64: 65, 67: 68, 75: 76, 93: 94 };   // Kadabra/Maschock/Georok/Alpollo
  class TradeScreen {
    constructor(transport, matched) {
      this.tp = transport; this.me = matched.you;
      this.all = Game.player.party.concat(Game.player.box);
      this.index = 0; this.scroll = 0;
      this.phase = 'pick';                 // 'pick' | 'review' | 'done' | 'cancelled'
      this.myOffer = null; this.myOfferRef = null; this.oppOffer = null;
      this.myConfirmed = false; this.oppConfirmed = false;
      this.received = null; this.note = null; this.t = 0;
      this.msg = 'Waehle dein Angebot.';
      this.off = transport.on(m => this.onMsg(m));
    }
    onMsg(m) {
      if (m.t === 'toffer') {
        if (m.side === this.me) this.myOffer = m.mon;
        else { this.oppOffer = m.mon; Data.sprite(Data.byId(m.mon.id).front); }
        this.myConfirmed = false; this.oppConfirmed = false;
        if (this.myOffer && this.oppOffer) this.msg = 'Tauschen? A: BESTAETIGEN';
      } else if (m.t === 'tconfirmed') { if (m.side !== this.me) this.oppConfirmed = true; }
      else if (m.t === 'tdone') this.applyTrade(m.received);
      else if (m.t === 'tcancelled') { this.phase = 'cancelled'; this.msg = 'Tausch abgebrochen.'; }
      else if (m.t === 'error' && m.code === 'bad-mon') this.note = { text: 'Ungueltiges Pokemon.', t: 1200 };
      else if (m.t === '_closed') { if (this.phase !== 'done') { this.phase = 'cancelled'; this.msg = 'Verbindung verloren.'; } }
    }
    applyTrade(received) {
      this.phase = 'done';
      const p = Game.player;
      let i = p.party.indexOf(this.myOfferRef);
      if (i >= 0) p.party.splice(i, 1); else { i = p.box.indexOf(this.myOfferRef); if (i >= 0) p.box.splice(i, 1); }
      const mon = Battle.restoreMon(received);
      let evoMsg = '';
      if (TRADE_EVO[mon.id]) {
        const old = Data.byId(mon.id).name;
        mon.id = TRADE_EVO[mon.id];
        mon.stats = Battle.calcStats(mon.species.base, mon.level);
        mon.moves = Data.movesFor(mon.species, mon.level);
        mon.hp = Math.min(mon.hp, mon.stats.hp);
        evoMsg = ' ' + old + ' entwickelt sich zu ' + mon.name + '!';
      }
      if (p.party.length < 6) p.party.push(mon); else p.box.push(mon);
      p.seen.add(mon.id); p.caught.add(mon.id);
      Game.save();
      if (Net.syncEnabled()) Net.uploadSave(Net.syncCode(), Game.exportSave()).catch(() => {});
      Sound.levelup && Sound.levelup();
      this.received = mon;
      this.msg = 'Du erhaeltst ' + mon.name.toUpperCase() + '!' + evoMsg;
    }
    update(dt) {
      this.t += dt;
      if (this.note && (this.note.t -= dt) <= 0) this.note = null;
      if (this.phase === 'done' || this.phase === 'cancelled') {
        if (Input.take('a') || Input.take('b')) { if (this.off) this.off(); Game.pop(); }
        return;
      }
      const leave = () => { this.tp.send({ t: 'tcancel' }); if (this.off) this.off(); Game.pop(); };
      if (this.phase === 'pick') {
        const n = this.all.length;
        if (!n) { this.msg = 'Keine Pokemon zum Tauschen!'; if (Input.take('b')) leave(); return; }
        if (Input.take('up'))   { this.index = (this.index + n - 1) % n; Sound.cursor(); }
        if (Input.take('down')) { this.index = (this.index + 1) % n; Sound.cursor(); }
        this.scroll = Math.max(0, Math.min(this.index - 3, n - 4));
        if (Input.take('b')) { leave(); return; }
        if (Input.take('a')) {
          const mon = this.all[this.index]; this.myOfferRef = mon;
          this.tp.send({ t: 'toffer', mon: { id: mon.id, level: mon.level, exp: mon.exp, hp: mon.hp, status: mon.status || null } });
          Sound.confirm(); this.phase = 'review'; this.msg = 'Angebot gesendet. Warte...';
        }
        return;
      }
      // review
      if (Input.take('b')) { leave(); return; }
      if (Input.take('a') && this.myOffer && this.oppOffer && !this.myConfirmed) {
        this.myConfirmed = true; this.tp.send({ t: 'tconfirm' }); Sound.confirm(); this.msg = 'Bestaetigt. Warte auf Partner...';
      }
    }
    panel(ctx, x, label, offer, confirmed) {
      box(ctx, x, 16, 72, 76);
      text(ctx, label, x + 6, 20, '#585858');
      if (offer) {
        const sp = Data.byId(offer.id), img = Data.sprite(sp.front);
        if (img) ctx.drawImage(img, x + 12, 30, 48, 48); else Data.drawPlaceholder(ctx, sp, x + 12, 30, 48);
        text(ctx, sp.name.toUpperCase().slice(0, 9), x + 4, 80, INK);
        text(ctx, 'L' + offer.level, x + 4, 88, '#585858');
        if (confirmed) text(ctx, 'OK', x + 54, 20, '#30b850');
      } else { text(ctx, '...', x + 30, 50, '#a0a0a0'); }
    }
    draw(ctx) {
      ctx.fillStyle = CREAM; ctx.fillRect(0, 0, 160, 144);
      text(ctx, 'TAUSCH', 6, 6);
      this.panel(ctx, 4, 'DU BIETEST', this.myOffer, this.myConfirmed);
      this.panel(ctx, 84, 'PARTNER', this.oppOffer, this.oppConfirmed);
      box(ctx, 0, 96, 160, 48);
      if (this.phase === 'pick' && this.all.length) {
        this.all.slice(this.scroll, this.scroll + 4).forEach((m, i) => {
          const gi = this.scroll + i, y = 102 + i * 10;
          if (gi === this.index) text(ctx, '>', 6, y);
          text(ctx, Data.byId(m.id).name.toUpperCase(), 16, y);
          text(ctx, 'L' + m.level, 124, y);
        });
      } else {
        textWrapped(ctx, this.msg, 6, 104, 18);
        if (this.phase === 'done' || this.phase === 'cancelled') text(ctx, 'A: OK', 132, 134, '#787878');
      }
      if (this.note) { box(ctx, 4, 116, 152, 24); textWrapped(ctx, this.note.text, 10, 124, 18); }
    }
  }

  /** Liste der letzten Ranglisten-Kämpfe (Replays). */
  class ReplayListScreen {
    constructor() { this.list = null; this.err = false; this.index = 0; this.t = 0; this.loading = false; Net.fetchReplays().then(d => { this.list = d.list; }).catch(() => { this.err = true; }); }
    update(dt) {
      this.t += dt;
      if (this.loading) return;
      if (Input.take('b')) { Game.pop(); return; }
      if (!this.list || !this.list.length) return;
      const n = this.list.length;
      if (Input.take('up'))   { this.index = (this.index + n - 1) % n; Sound.cursor(); }
      if (Input.take('down')) { this.index = (this.index + 1) % n; Sound.cursor(); }
      if (Input.take('a')) {
        this.loading = true; Sound.confirm();
        Net.fetchReplay(this.list[this.index].id)
          .then(d => { this.loading = false; if (d) { Game.pop(); Game.push(new ReplayScreen(d)); } })
          .catch(() => { this.loading = false; });
      }
    }
    draw(ctx) {
      ctx.fillStyle = '#283050'; ctx.fillRect(0, 0, 160, 144);
      text(ctx, 'REPLAYS', 8, 8, '#f8d030');
      if (this.err) text(ctx, 'Server nicht erreichbar.', 8, 40, '#e03028');
      else if (!this.list) text(ctx, 'Lade' + dots(this.t), 8, 40, '#a8b8d8');
      else if (!this.list.length) text(ctx, 'Noch keine Replays.', 8, 40, '#a8b8d8');
      else this.list.slice(0, 10).forEach((r, i) => {
        const y = 22 + i * 11;
        if (i === this.index) text(ctx, '>', 4, y);
        text(ctx, String(r.name0 || 'P1').slice(0, 6), 14, y, r.winner === 0 ? '#f8d030' : '#a8b8d8');
        text(ctx, 'vs', 70, y, '#88a0c8');
        text(ctx, String(r.name1 || 'P2').slice(0, 6), 90, y, r.winner === 1 ? '#f8d030' : '#a8b8d8');
      });
      text(ctx, this.loading ? 'Lade Replay...' : 'A: Ansehen   B: Zurueck', 8, 134, '#68789a');
    }
  }

  /**
   * Replay-Wiedergabe: rechnet den Kampf aus Seed + Aktions-Log deterministisch
   * mit BattleCore lokal nach und treibt damit den normalen Kampf-Screen.
   */
  class ReplayScreen {
    constructor(data) {
      const BC = BattleCore;
      const teamA = data.teamA.map(t => BC.makeBattleMon(Data.byId(t.id), t.level));
      const teamB = data.teamB.map(t => BC.makeBattleMon(Data.byId(t.id), t.level));
      const selfArr = teamA.map(m => ({ id: m.id, level: m.level, maxHp: m.stats.hp, hp: m.stats.hp, status: null, moves: m.moves.map(mv => ({ name: mv.name, type: mv.type, power: mv.power, acc: mv.acc })) }));
      const oppArr = teamB.map(m => ({ id: m.id, level: m.level, maxHp: m.stats.hp, hp: m.stats.hp, status: null }));
      const rng = BC.makeRng(data.seed), state = BC.makeBattleState(teamA, teamB), events = [];
      for (const step of data.log) {
        if (step.k === 't') events.push(...BC.resolveTurn(state, step.a, rng).events);
        else if (step.k === 's') events.push(...BC.applyForcedSwitch(state, step.side, step.to));
        if (state.winner != null) break;
      }
      this.names = (data.name0 || 'P1') + ' vs ' + (data.name1 || 'P2');
      this.inner = new OnlineBattleScreen({ on: () => (() => {}), send: () => {} }, { you: 0, token: null });
      this.inner.onMsg({ t: 'start', you: 0, self: selfArr, opp: oppArr });
      for (const e of events) this.inner.queue.push(e);
      this.endMsg = { t: 'end', result: state.winner === 0 ? 'win' : 'lose', reason: 'ko' };
      this.endSent = false;
    }
    update(dt) {
      if (!this.endSent && !this.inner.cur && !this.inner.queue.length && !this.inner.ended) { this.inner.onMsg(this.endMsg); this.endSent = true; }
      this.inner.update(dt);
    }
    draw(ctx) {
      this.inner.draw(ctx);
      ctx.fillStyle = '#e03028'; ctx.fillRect(2, 2, 40, 10);
      text(ctx, 'REPLAY', 4, 4, '#f8f8f8');
    }
  }

  return {
    text, textWrapped, box, hpBar, drawSilhouette, drawMonDetail,
    LoadingScreen, TitleScreen, StarterScreen, PauseMenuScreen,
    TeamScreen, BoxScreen, DexScreen, ItemScreen, MartScreen,
    OnlineScreen, OnlineSearchScreen, OnlineCodeScreen, OnlineBattleScreen, PvpTeamScreen,
    CloudScreen, CloudLoadScreen, LeaderboardScreen, TradeScreen, ReplayListScreen, ReplayScreen, KontoScreen, LoginSyncScreen,
  };
})();
