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
      this.items = ['TEAM', 'BEUTEL', 'POKEDEX', 'BOX', 'SPEICHERN', 'ZURUECK'];
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
          case 'SPEICHERN': Game.save(); this.toast = 1200; break;
          case 'ZURUECK':   Game.pop(); break;
        }
      }
    }
    draw(ctx) {
      const p = Game.player;
      box(ctx, 58, 2, 98, 116);
      this.items.forEach((it, i) => {
        text(ctx, it, 78, 9 + i * 11);
        if (i === this.index) text(ctx, '>', 68, 9 + i * 11);
      });
      // Statuszeilen: Geld + Orden
      ctx.fillStyle = INK; ctx.fillRect(66, 78, 82, 1);
      text(ctx, `$${p.money || 0}`, 68, 86);
      text(ctx, `ORDEN ${p.badges || 0}/2`, 68, 100);
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

  return {
    text, textWrapped, box, hpBar, drawSilhouette, drawMonDetail,
    LoadingScreen, TitleScreen, StarterScreen, PauseMenuScreen,
    TeamScreen, BoxScreen, DexScreen, ItemScreen, MartScreen,
  };
})();
