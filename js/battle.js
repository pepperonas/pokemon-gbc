'use strict';
/**
 * battle.js — Gen-1-Kampfsystem: Typentabelle, Schadensformel, Stats, EXP,
 * Statuseffekte (GIF/BRN/PAR/EIS), Fangen (3 Ball-Stufen), Evolutionen,
 * Attacken-Lernen, Preisgeld sowie der komplette rundenbasierte
 * Kampfbildschirm (wilde Kämpfe UND Trainerkämpfe mit smarter Leiter-KI).
 *
 * Der Kampfablauf ist als async-Koroutine implementiert (run()): jede
 * Animation/Texteingabe wartet via Game.nextFrame() auf den Game-Loop.
 */
const Battle = (() => {

  // ---------------------------------------------------------------- Typen ---
  // Vollständige Gen-1-Typentabelle (inkl. Quirks: Käfer/Gift gegenseitig 2x,
  // Geist gegen Psycho = 0, Eis gegen Feuer neutral).
  const CHART = {
    normal:   { rock: .5, ghost: 0 },
    fire:     { fire: .5, water: .5, grass: 2, ice: 2, bug: 2, rock: .5, dragon: .5 },
    water:    { fire: 2, water: .5, grass: .5, ground: 2, rock: 2, dragon: .5 },
    electric: { water: 2, electric: .5, grass: .5, ground: 0, flying: 2, dragon: .5 },
    grass:    { fire: .5, water: 2, grass: .5, poison: .5, ground: 2, flying: .5, bug: .5, rock: 2, dragon: .5 },
    ice:      { water: .5, grass: 2, ice: .5, ground: 2, flying: 2, dragon: 2 },
    fighting: { normal: 2, ice: 2, poison: .5, flying: .5, psychic: .5, bug: .5, rock: 2, ghost: 0 },
    poison:   { grass: 2, poison: .5, ground: .5, bug: 2, rock: .5, ghost: .5 },
    ground:   { fire: 2, electric: 2, grass: .5, poison: 2, flying: 0, bug: .5, rock: 2 },
    flying:   { electric: .5, grass: 2, fighting: 2, bug: 2, rock: .5 },
    psychic:  { fighting: 2, poison: 2, psychic: .5 },
    bug:      { fire: .5, grass: 2, fighting: .5, poison: 2, flying: .5, psychic: 2, ghost: .5 },
    rock:     { fire: 2, ice: 2, fighting: .5, ground: .5, flying: 2, bug: 2 },
    ghost:    { normal: 0, psychic: 0, ghost: 2 },
    dragon:   { dragon: 2 },
  };
  // In Gen 1 nutzen diese Typen den Spezial-Wert (hier: SpA vs. SpV)
  const SPECIAL = new Set(['fire', 'water', 'grass', 'electric', 'ice', 'psychic', 'dragon']);

  function effectiveness(moveType, defTypes) {
    let m = 1;
    for (const t of defTypes) {
      const row = CHART[moveType];
      if (row && row[t] !== undefined) m *= row[t];
    }
    return m;
  }

  // ----------------------------------------------------------- Evolutionen ---
  // Alle Gen-1-Evolutionslinien. Level-Evolutionen mit Original-Leveln;
  // Stein-/Tausch-Evolutionen sind auf passende Level gemappt (Abkürzung:
  // es gibt keine Items/Tausch — kommentiert, damit später erweiterbar).
  const EVO = {
    1:   { to: 2,   l: 16 }, 2:   { to: 3,   l: 32 },   // Bisasam-Linie
    4:   { to: 5,   l: 16 }, 5:   { to: 6,   l: 36 },   // Glumanda-Linie
    7:   { to: 8,   l: 16 }, 8:   { to: 9,   l: 36 },   // Schiggy-Linie
    10:  { to: 11,  l: 7 },  11:  { to: 12,  l: 10 },   // Raupy
    13:  { to: 14,  l: 7 },  14:  { to: 15,  l: 10 },   // Hornliu
    16:  { to: 17,  l: 18 }, 17:  { to: 18,  l: 36 },   // Taubsi
    19:  { to: 20,  l: 20 },                            // Rattfratz
    21:  { to: 22,  l: 20 },                            // Habitak
    23:  { to: 24,  l: 22 },                            // Rettan
    25:  { to: 26,  l: 28 },                            // Pikachu (Donnerstein -> L28)
    27:  { to: 28,  l: 22 },                            // Sandan
    29:  { to: 30,  l: 16 }, 30:  { to: 31,  l: 36 },   // Nidoran W (Mondstein -> L36)
    32:  { to: 33,  l: 16 }, 33:  { to: 34,  l: 36 },   // Nidoran M (Mondstein -> L36)
    35:  { to: 36,  l: 28 },                            // Piepi (Mondstein -> L28)
    37:  { to: 38,  l: 30 },                            // Vulpix (Feuerstein -> L30)
    39:  { to: 40,  l: 28 },                            // Pummeluff (Mondstein -> L28)
    41:  { to: 42,  l: 22 },                            // Zubat
    43:  { to: 44,  l: 21 }, 44:  { to: 45,  l: 36 },   // Myrapla (Blattstein -> L36)
    46:  { to: 47,  l: 24 },                            // Paras
    48:  { to: 49,  l: 31 },                            // Bluzuk
    50:  { to: 51,  l: 26 },                            // Digda
    52:  { to: 53,  l: 28 },                            // Mauzi
    54:  { to: 55,  l: 33 },                            // Enton
    56:  { to: 57,  l: 28 },                            // Menki
    58:  { to: 59,  l: 30 },                            // Fukano (Feuerstein -> L30)
    60:  { to: 61,  l: 25 }, 61:  { to: 62,  l: 36 },   // Quapsel (Wasserstein -> L36)
    63:  { to: 64,  l: 16 }, 64:  { to: 65,  l: 36 },   // Abra (Tausch -> L36)
    66:  { to: 67,  l: 28 }, 67:  { to: 68,  l: 40 },   // Machollo (Tausch -> L40)
    69:  { to: 70,  l: 21 }, 70:  { to: 71,  l: 36 },   // Knofensa (Blattstein -> L36)
    72:  { to: 73,  l: 30 },                            // Tentacha
    74:  { to: 75,  l: 25 }, 75:  { to: 76,  l: 40 },   // Kleinstein (Tausch -> L40)
    77:  { to: 78,  l: 40 },                            // Ponita
    79:  { to: 80,  l: 37 },                            // Flegmon
    81:  { to: 82,  l: 30 },                            // Magnetilo
    84:  { to: 85,  l: 31 },                            // Dodu
    86:  { to: 87,  l: 34 },                            // Jurob
    88:  { to: 89,  l: 38 },                            // Sleima
    90:  { to: 91,  l: 36 },                            // Muschas (Wasserstein -> L36)
    92:  { to: 93,  l: 25 }, 93:  { to: 94,  l: 40 },   // Nebulak (Tausch -> L40)
    96:  { to: 97,  l: 26 },                            // Traumato
    98:  { to: 99,  l: 28 },                            // Krabby
    100: { to: 101, l: 30 },                            // Voltobal
    102: { to: 103, l: 36 },                            // Owei (Blattstein -> L36)
    104: { to: 105, l: 28 },                            // Tragosso
    109: { to: 110, l: 35 },                            // Smogon
    111: { to: 112, l: 42 },                            // Rihorn
    116: { to: 117, l: 32 },                            // Seeper
    118: { to: 119, l: 33 },                            // Goldini
    120: { to: 121, l: 36 },                            // Sterndu (Wasserstein -> L36)
    129: { to: 130, l: 20 },                            // Karpador
    133: { to: 134, l: 25 },                            // Evoli: Zufalls-Zweig, s. checkEvolution
    138: { to: 139, l: 40 },                            // Amonitas
    140: { to: 141, l: 40 },                            // Kabuto
    147: { to: 148, l: 30 }, 148: { to: 149, l: 55 },   // Dratini
  };

  // ---------------------------------------------------------- Stats & EXP ---
  // Gen-1-Statformel mit festen IVs (8) und EV=0 — nachvollziehbar & simpel.
  const IV = 8;
  function calcStats(base, level) {
    const f = b => Math.floor((b + IV) * 2 * level / 100);
    return {
      hp:  f(base.hp) + level + 10,
      atk: f(base.atk) + 5, def: f(base.def) + 5,
      spa: f(base.spa) + 5, spd: f(base.spd) + 5,
      spe: f(base.spe) + 5,
    };
  }

  // EXP-Kurve "Medium Fast": benötigte Gesamt-EXP = Level³
  const expFor = level => level * level * level;

  /** Kampffähige Instanz einer Spezies erzeugen. */
  function makeMon(id, level) {
    const sp = Data.byId(id);
    const stats = calcStats(sp.base, level);
    return {
      id, level,
      exp: expFor(level),
      moves: Data.movesFor(sp, level),
      stats,
      hp: stats.hp,
      status: null,                          // psn | brn | par | frz
      get species() { return Data.byId(this.id); },
      get name() { return Data.byId(this.id).name; },
    };
  }

  /** Mon aus Speicherstand wiederherstellen (Stats/Moves werden neu berechnet). */
  function restoreMon(saved) {
    const m = makeMon(saved.id, saved.level);
    m.exp = saved.exp;
    m.hp = Math.min(saved.hp, m.stats.hp);
    m.status = saved.status || null;
    return m;
  }

  /**
   * Gen-1-Schadensformel (lt. Spezifikation):
   * dmg = floor(floor(floor((2L/5+2)*Power*Atk/Def)/50)+2) * STAB * TYP * rnd(0.85..1)
   * Verbrennung halbiert den physischen Angriff (Gen 1).
   * Abkürzung: Volltreffer = simple 2x-Chance (Basis-Speed/512) statt Gen-1-Crit-Mechanik.
   */
  function damage(attacker, defender, move) {
    const special = SPECIAL.has(move.type);
    let atk = special ? attacker.stats.spa : attacker.stats.atk;
    if (!special && attacker.status === 'brn') atk = Math.max(1, Math.floor(atk / 2));
    const def = special ? defender.stats.spd : defender.stats.def;
    const stab = attacker.species.types.includes(move.type) ? 1.5 : 1;
    const typeEff = effectiveness(move.type, defender.species.types);
    const crit = Math.random() < attacker.species.base.spe / 512;

    let dmg = Math.floor(Math.floor(Math.floor(
      (2 * attacker.level / 5 + 2) * move.power * atk / def) / 50) + 2);
    if (crit) dmg *= 2;
    dmg = Math.floor(dmg * stab * typeEff * (0.85 + Math.random() * 0.15));
    if (typeEff > 0 && dmg < 1) dmg = 1;
    return { dmg, typeEff, crit };
  }

  /**
   * Vereinfachte Fangformel: je weniger Rest-HP, desto höher die Chance.
   * Ball-Stufen multiplizieren; Statusprobleme geben einen Bonus
   * (EIS +20%, sonst +10%) — Gen-1-Geist, ohne speziesabh. Catch-Rate.
   */
  function catchChance(mon, ballMult = 1) {
    const base = (3 * mon.stats.hp - 2 * mon.hp) / (3 * mon.stats.hp);
    let c = base * 0.75 * ballMult;
    if (mon.status === 'frz') c += 0.2;
    else if (mon.status) c += 0.1;
    return Math.min(0.95, Math.max(0.1, c));
  }

  // ----------------------------------------------------- Status-Meldungen ---
  const STATUS_MSG = {
    psn: 'wurde vergiftet!', brn: 'erleidet Verbrennungen!',
    par: 'ist paralysiert! Es ist eventuell unfaehig anzugreifen!',
    frz: 'erstarrt zu Eis!',
  };
  // Typ-Immunitäten gegen Status (Gen-1-nah)
  const STATUS_IMMUNE = { psn: 'poison', brn: 'fire', frz: 'ice' };

  // ------------------------------------------------------- Kampfbildschirm ---
  const P = { // Palette des Kampfbildschirms
    bg: '#f8f8f8', text: '#181818', box: '#f8f8f8', border: '#181818',
    platform: '#b0d8a0',
  };

  class BattleScreen {
    /**
     * @param opts   wildes Mon direkt ODER { wild: mon } ODER
     *               { trainer: { name, intro, defeat, team, reward, smart } }
     * @param onEnd  Callback({result}) — 'win'|'lose'|'run'|'catch'
     */
    constructor(opts, onEnd) {
      if (opts && opts.stats) opts = { wild: opts };  // rückwärtskompatibel
      this.trainer = opts.trainer || null;
      this.enemyTeam = this.trainer ? this.trainer.team : [opts.wild];
      this.enemyIndex = 0;
      this.enemy = this.enemyTeam[0];
      this.onEnd = onEnd;
      this.player = Game.player.party.find(m => m.hp > 0);
      this.dispEnemyHp = this.enemy.hp;   // animierte Anzeige-HP
      this.dispPlayerHp = this.player.hp;
      this.msg = '';                      // aktuelle Textbox-Zeilen
      this.msgChars = 0;                  // Typewriter-Fortschritt
      this.menu = null;                   // { items, index, cols }
      this.flashEnemy = 0; this.flashPlayer = 0;
      this.ball = null;                   // Wurf-Animation { x, y, shake }
      this.hideEnemy = false;
      this.partyList = null;              // Team-Auswahl im Kampf
      this.done = false;
      this.time = 0;
      Game.player.seen.add(this.enemy.id);
      this.run().catch(e => { console.error(e); this.finish('run'); });
    }

    // --- Koroutinen-Helfer -------------------------------------------------
    async say(text, { wait = true } = {}) {
      this.msg = text; this.msgChars = 0;
      while (this.msgChars < text.length) {
        this.msgChars += Input.take('a') || Input.down('a') ? 4 : 1;
        await Game.nextFrame();
      }
      if (wait) {
        let t = 0;
        while (t < 12) { t++; await Game.nextFrame(); }
        while (!Input.take('a') && !Input.take('b')) await Game.nextFrame();
      }
    }

    async choose(items, { cols = 2, cancel = true, start = 0, kind = 'list' } = {}) {
      this.menu = { items, index: start, cols, kind };
      try {
        while (true) {
          await Game.nextFrame();
          const m = this.menu;
          const rows = Math.ceil(items.length / cols);
          let r = Math.floor(m.index / cols), c = m.index % cols;
          if (Input.take('up'))    r = (r + rows - 1) % rows;
          if (Input.take('down'))  r = (r + 1) % rows;
          if (Input.take('left'))  c = (c + cols - 1) % cols;
          if (Input.take('right')) c = (c + 1) % cols;
          const ni = Math.min(items.length - 1, r * cols + c);
          if (ni !== m.index) Sound.cursor();
          m.index = ni;
          if (Input.take('a')) { Sound.confirm(); return m.index; }
          if (cancel && Input.take('b')) return -1;
        }
      } finally { this.menu = null; }
    }

    /**
     * Team-Auswahl. mode 'alive' (Wechsel) oder 'fainted' (Beleber).
     * Liefert Index oder -1.
     */
    async chooseParty(allowCancel, mode = 'alive') {
      this.partyList = { index: 0 };
      try {
        while (true) {
          await Game.nextFrame();
          const n = Game.player.party.length;
          if (Input.take('up'))   this.partyList.index = (this.partyList.index + n - 1) % n;
          if (Input.take('down')) this.partyList.index = (this.partyList.index + 1) % n;
          if (Input.take('a')) {
            const mon = Game.player.party[this.partyList.index];
            if (mode === 'alive') {
              if (mon === this.player || mon.hp <= 0) continue;
            } else {
              if (mon.hp > 0) continue;
            }
            return this.partyList.index;
          }
          if (allowCancel && Input.take('b')) return -1;
        }
      } finally { this.partyList = null; }
    }

    async drainHp(side, target) {
      const key = side === 'enemy' ? 'dispEnemyHp' : 'dispPlayerHp';
      const speed = Math.max(1, Math.floor(Math.abs(this[key] - target) / 30));
      while (this[key] !== target) {
        this[key] += this[key] > target ? -speed : speed;
        if (Math.abs(this[key] - target) < speed) this[key] = target;
        await Game.nextFrame();
      }
    }

    async pause(frames) { for (let i = 0; i < frames; i++) await Game.nextFrame(); }

    // --- Kampfablauf ---------------------------------------------------------
    async run() {
      if (this.trainer) {
        await this.say(`${this.trainer.name} will kaempfen!`);
        if (this.trainer.intro) await this.say(this.trainer.intro);
        await this.say(`${this.trainer.name} schickt ${this.enemy.name}!`, { wait: false });
      } else {
        await this.say(`Ein wildes ${this.enemy.name} erscheint!`);
      }
      await this.say(`Los, ${this.player.name}!`, { wait: false });
      await this.pause(20);

      let escapeTries = 0;
      while (!this.done) {
        this.msg = 'Aktion?'; this.msgChars = 999;
        const action = await this.choose(['KAMPF', 'PKMN', 'ITEM', 'FLUCHT'], { cancel: false, kind: 'main', cols: 1 });

        if (action === 0) {                                    // --- KAMPF
          const mi = await this.choose(this.player.moves.map(m => m.name.toUpperCase()), { cols: 1 });
          if (mi < 0) continue;
          await this.fightTurn(this.player.moves[mi]);

        } else if (action === 1) {                             // --- WECHSEL
          const pi = await this.chooseParty(true);
          if (pi < 0) continue;
          await this.say(`Zurück, ${this.player.name}!`, { wait: false });
          this.player = Game.player.party[pi];
          this.dispPlayerHp = this.player.hp;
          await this.say(`Los, ${this.player.name}!`, { wait: false });
          await this.pause(15);
          await this.actEnemy();                               // Gegner darf angreifen

        } else if (action === 2) {                             // --- ITEM
          if (!await this.useItem()) continue;
          if (this.done) return;

        } else {                                               // --- FLUCHT
          if (this.trainer) {
            await this.say('Aus Trainerkaempfen kann man nicht fliehen!');
            continue;
          }
          escapeTries++;
          const ps = this.effSpe(this.player), es = this.effSpe(this.enemy);
          const ok = ps >= es || Math.random() < (ps * 128 / es + 30 * escapeTries) / 256;
          if (ok) { await this.say('Du bist entkommen!'); this.finish('run'); return; }
          await this.say('Flucht gescheitert!');
          await this.actEnemy();
        }
        if (this.done) return;
        if (await this.checkPlayerFaint()) return;
      }
    }

    // --- Items ---------------------------------------------------------------
    /** ITEM-Untermenü aus dem Beutel. Liefert false, wenn abgebrochen. */
    async useItem() {
      const pl = Game.player;
      const avail = Data.ITEM_ORDER.filter(k => (pl.items[k] || 0) > 0);
      if (!avail.length) { await this.say('Dein Beutel ist leer! Kaufe Items im MARKT.'); return false; }
      const ii = await this.choose(avail.map(k => `${Data.ITEMS[k].name} x${pl.items[k]}`), { cols: 1 });
      if (ii < 0) return false;
      const key = avail[ii], it = Data.ITEMS[key];

      if (it.kind === 'ball') {
        if (this.trainer) { await this.say('Man klaut keine Pokemon von Trainern!'); return false; }
        pl.items[key]--;
        if (await this.throwBall(it)) return true;
        await this.actEnemy();
        return true;
      }
      if (it.kind === 'heal') {
        if (this.player.hp >= this.player.stats.hp) { await this.say(`${this.player.name} hat volle KP!`); return false; }
        pl.items[key]--;
        const heal = Math.min(it.amount, this.player.stats.hp - this.player.hp);
        this.player.hp += heal;
        Sound.heal();
        await this.say(`${this.player.name} wird um ${heal} KP geheilt!`, { wait: false });
        await this.drainHp('player', this.player.hp);
        await this.pause(10);
        await this.actEnemy();
        return true;
      }
      if (it.kind === 'revive') {
        if (!pl.party.some(m => m.hp <= 0)) { await this.say('Niemand ist kampfunfaehig!'); return false; }
        this.msg = 'Wen wiederbeleben?'; this.msgChars = 999;
        const idx = await this.chooseParty(true, 'fainted');
        if (idx < 0) return false;
        pl.items[key]--;
        const mon = pl.party[idx];
        mon.hp = Math.floor(mon.stats.hp / 2);
        mon.status = null;
        Sound.heal();
        await this.say(`${mon.name} wurde wiederbelebt!`);
        await this.actEnemy();
        return true;
      }
      if (it.kind === 'cure') {
        if (!this.player.status) { await this.say(`${this.player.name} hat keine Statusprobleme!`); return false; }
        pl.items[key]--;
        this.player.status = null;
        Sound.heal();
        await this.say(`${this.player.name} ist wieder gesund!`);
        await this.actEnemy();
        return true;
      }
      return false;
    }

    // --- Status-Mechanik -------------------------------------------------------
    effSpe(mon) { return mon.status === 'par' ? Math.floor(mon.stats.spe / 4) : mon.stats.spe; }

    /** Darf das Mon angreifen? (PAR 25% Ausfall, EIS bis 20%-Auftau-Chance) */
    async canMove(mon) {
      if (mon.status === 'frz') {
        if (Math.random() < 0.2) {
          mon.status = null;
          await this.say(`${mon.name} ist aufgetaut!`);
          return true;
        }
        await this.say(`${mon.name} ist zu Eis erstarrt!`);
        return false;
      }
      if (mon.status === 'par' && Math.random() < 0.25) {
        await this.say(`${mon.name} ist paralysiert! Es kann sich nicht bewegen!`);
        return false;
      }
      return true;
    }

    /** Gift-/Brand-Schaden nach der eigenen Aktion (Gen 1: 1/16 max KP). */
    async afterAction(mon) {
      if (this.done || mon.hp <= 0) return;
      if (mon.status !== 'psn' && mon.status !== 'brn') return;
      const dmg = Math.max(1, Math.floor(mon.stats.hp / 16));
      await this.say(`${mon.name} leidet unter ${mon.status === 'psn' ? 'dem Gift' : 'der Verbrennung'}!`, { wait: false });
      mon.hp = Math.max(0, mon.hp - dmg);
      await this.drainHp(mon === this.player ? 'player' : 'enemy', mon.hp);
      await this.pause(8);
    }

    // --- Rundenablauf ----------------------------------------------------------
    /** Beide greifen an, Reihenfolge nach (effektiver) Initiative. */
    async fightTurn(playerMove) {
      const ps = this.effSpe(this.player), es = this.effSpe(this.enemy);
      const playerFirst = ps > es || (ps === es && Math.random() < 0.5);
      const order = playerFirst ? ['p', 'e'] : ['e', 'p'];
      for (const side of order) {
        if (this.done) return;
        if (side === 'p') {
          if (this.player.hp <= 0) continue;
          if (await this.canMove(this.player)) {
            await this.useMove(this.player, this.enemy, playerMove, 'enemy');
          }
          await this.afterAction(this.player);
          if (this.enemy.hp <= 0) { await this.enemyFainted(); return; }
        } else {
          if (this.enemy.hp <= 0) continue;
          await this.actEnemy();
          if (this.done || this.player.hp <= 0) return;   // K.O.-Check macht run()
        }
      }
    }

    /** Gegner-KI: Leiter/Top 4 wählen effektivste Attacke, sonst Zufall. */
    pickEnemyMove() {
      const moves = this.enemy.moves;
      if (this.trainer && this.trainer.smart && Math.random() > 0.15) {
        let best = moves[0], bs = -1;
        for (const mv of moves) {
          const eff = effectiveness(mv.type, this.player.species.types);
          const stab = this.enemy.species.types.includes(mv.type) ? 1.5 : 1;
          const score = mv.power * eff * stab * (mv.acc / 100);
          if (score > bs) { bs = score; best = mv; }
        }
        return best;
      }
      return moves[Math.floor(Math.random() * moves.length)];
    }

    /** Eine komplette Gegner-Aktion (inkl. Status-Checks + Restschaden). */
    async actEnemy() {
      if (this.done || this.enemy.hp <= 0) return;
      if (await this.canMove(this.enemy)) {
        await this.useMove(this.enemy, this.player, this.pickEnemyMove(), 'player');
      }
      await this.afterAction(this.enemy);
      if (this.enemy.hp <= 0) await this.enemyFainted();   // Gift-Selbst-K.O.
    }

    async useMove(attacker, defender, move, defSide) {
      await this.say(`${attacker.name} setzt ${move.name.toUpperCase()} ein!`, { wait: false });
      await this.pause(10);
      if (Math.random() * 100 >= move.acc) {
        await this.say('Die Attacke ging daneben!');
        return;
      }
      const { dmg, typeEff, crit } = damage(attacker, defender, move);
      if (typeEff === 0) { await this.say(`Es hat keine Wirkung auf ${defender.name}!`); return; }

      if (defSide === 'enemy') this.flashEnemy = 18; else this.flashPlayer = 18;
      Sound.hit(typeEff);
      await this.pause(20);
      defender.hp = Math.max(0, defender.hp - dmg);
      await this.drainHp(defSide, defender.hp);
      if (crit) await this.say('Ein Volltreffer!');
      if (typeEff > 1) await this.say('Das ist sehr effektiv!');
      else if (typeEff < 1) await this.say('Das ist nicht sehr effektiv...');

      // Feuer taut Gefrorene auf
      if (move.type === 'fire' && defender.status === 'frz') {
        defender.status = null;
        await this.say(`${defender.name} ist aufgetaut!`);
      }
      // Status-Nebeneffekt
      if (move.fx && defender.hp > 0 && !defender.status) {
        const immuneType = STATUS_IMMUNE[move.fx.s];
        const immune = immuneType && defender.species.types.includes(immuneType);
        if (!immune && Math.random() * 100 < move.fx.c) {
          defender.status = move.fx.s;
          await this.say(`${defender.name} ${STATUS_MSG[move.fx.s]}`);
        }
      }
    }

    async enemyFainted() {
      if (this.done) return;
      Sound.faint();
      await this.say(`${this.trainer ? '' : 'Wildes '}${this.enemy.name} wurde besiegt!`);
      // Gen-1-nahe EXP: baseExp * Gegnerlevel / 7 (Trainerkampf: x1.5)
      const mult = this.trainer ? 1.5 : 1;
      const exp = Math.floor(this.enemy.species.baseExp * this.enemy.level * mult / 7);
      await this.say(`${this.player.name} erhält ${exp} EXP!`);
      await this.applyExp(this.player, exp);

      // Trainer schickt sein nächstes Pokémon
      if (this.trainer && this.enemyIndex < this.enemyTeam.length - 1) {
        this.enemyIndex++;
        this.enemy = this.enemyTeam[this.enemyIndex];
        Game.player.seen.add(this.enemy.id);
        this.dispEnemyHp = this.enemy.hp;
        this.flashEnemy = 0;
        await this.say(`${this.trainer.name} schickt ${this.enemy.name}!`, { wait: false });
        await this.pause(20);
        return;                                  // Kampf geht weiter
      }

      if (this.trainer) {
        await this.say(`${this.trainer.name} wurde besiegt!`);
        if (this.trainer.defeat) await this.say(this.trainer.defeat);
        const r = this.trainer.reward;
        if (r) {
          if (r.money) {
            Game.player.money = (Game.player.money || 0) + r.money;
            await this.say(`Du gewinnst $${r.money} Preisgeld!`);
          }
          if (r.items) {
            for (const key in r.items) {
              Game.player.items[key] = (Game.player.items[key] || 0) + r.items[key];
              await this.say(`Du erhältst ${r.items[key]}x ${Data.ITEMS[key].name}!`);
            }
          }
          if (r.badge) {
            Game.player.badges = Math.max(Game.player.badges || 0, r.badge);
            Sound.badge();
            await this.say(`Du erhältst den ${r.badgeName || 'ORDEN'}!`);
          }
        }
      }
      this.finish('win');
    }

    async applyExp(mon, exp) {
      mon.exp += exp;
      while (mon.level < 100 && mon.exp >= expFor(mon.level + 1)) {
        mon.level++;
        const old = mon.stats;
        mon.stats = calcStats(mon.species.base, mon.level);
        mon.hp = Math.min(mon.stats.hp, mon.hp + (mon.stats.hp - old.hp)); // HP-Zuwachs heilt mit
        if (mon === this.player) this.dispPlayerHp = mon.hp;
        Sound.levelup();
        await this.say(`${mon.name} erreicht Level ${mon.level}!`);
        await this.learnMoves(mon);
      }
      await this.checkEvolution(mon);
    }

    /** Moveset an neues Level anpassen; neue Attacken werden angekündigt. */
    async learnMoves(mon) {
      const fresh = Data.movesFor(mon.species, mon.level);
      const known = new Set(mon.moves.map(m => m.name));
      for (const mv of fresh) {
        if (!known.has(mv.name)) await this.say(`${mon.name} erlernt ${mv.name.toUpperCase()}!`);
      }
      mon.moves = fresh;
    }

    /**
     * Evolution prüfen (auch mehrstufig, falls das Level mehrere Schwellen
     * übersprungen hat). Wird nach jedem EXP-Gewinn aufgerufen — so entwickeln
     * sich auch Mons aus alten Spielständen beim nächsten Sieg.
     */
    async checkEvolution(mon) {
      while (true) {
        const evo = EVO[mon.id];
        if (!evo || mon.level < evo.l) return;
        // Evoli (Abkürzung): kein Stein-Item -> zufälliger Zweig Aquana/Blitza/Flamara
        const target = mon.id === 133 ? 134 + Math.floor(Math.random() * 3) : evo.to;
        const oldName = mon.name;
        Data.sprite(Data.byId(target).front);    // Sprite vorwärmen
        Data.sprite(Data.byId(target).back);
        await this.say(`Nanu? ${oldName} entwickelt sich!`);
        for (let i = 0; i < 4; i++) { this.flashPlayer = 10; await this.pause(12); }
        mon.id = target;
        const old = mon.stats;
        mon.stats = calcStats(mon.species.base, mon.level);
        mon.hp = Math.min(mon.stats.hp, mon.hp + Math.max(0, mon.stats.hp - old.hp));
        mon.moves = Data.movesFor(mon.species, mon.level);
        if (mon === this.player) this.dispPlayerHp = mon.hp;
        Game.player.seen.add(target);
        Game.player.caught.add(target);
        Sound.levelup();
        await this.say(`${oldName} hat sich zu ${mon.name} entwickelt!`);
      }
    }

    async checkPlayerFaint() {
      if (this.player.hp > 0) return false;
      Sound.faint();
      await this.say(`${this.player.name} wurde besiegt!`);
      const alive = Game.player.party.some(m => m.hp > 0);
      if (!alive) {
        await this.say('Alle Pokémon sind besiegt! Du eilst zurueck...');
        this.finish('lose');
        return true;
      }
      this.msg = 'Welches Pokémon soll kämpfen?'; this.msgChars = 999;
      const pi = await this.chooseParty(false);
      this.player = Game.player.party[pi];
      this.dispPlayerHp = this.player.hp;
      await this.say(`Los, ${this.player.name}!`, { wait: false });
      await this.pause(15);
      return false;
    }

    async throwBall(item) {
      await this.say(`Du wirfst einen ${item.name}!`, { wait: false });
      this.ball = { x: 30, y: 90, shake: 0 };
      for (let t = 0; t <= 20; t++) {
        this.ball.x = 30 + (118 - 30) * t / 20;
        this.ball.y = 90 - Math.sin(t / 20 * Math.PI) * 60 - t / 20 * 55;
        await Game.nextFrame();
      }
      this.hideEnemy = true;
      this.ball.x = 118; this.ball.y = 44;
      const caught = item.guaranteed || Math.random() < catchChance(this.enemy, item.mult);
      const shakes = caught ? 3 : 1 + Math.floor(Math.random() * 2);
      for (let s = 0; s < shakes; s++) {
        await this.pause(18);
        for (let t = 0; t < 16; t++) { this.ball.shake = Math.sin(t / 16 * Math.PI * 2) * 3; await Game.nextFrame(); }
        this.ball.shake = 0;
      }
      await this.pause(15);
      if (!caught) {
        this.hideEnemy = false; this.ball = null;
        await this.say(`Mist! ${this.enemy.name} hat sich befreit!`);
        return false;
      }
      Sound.catch();
      await this.say(`Super! ${this.enemy.name} wurde gefangen!`);
      Game.player.caught.add(this.enemy.id);
      Game.player.seen.add(this.enemy.id);
      if (Game.player.party.length < 6) {
        Game.player.party.push(this.enemy);
        await this.say(`${this.enemy.name} kommt ins Team!`);
      } else {
        Game.player.box.push(this.enemy);
        await this.say(`${this.enemy.name} kommt in die BOX!`);
      }
      this.finish('catch');
      return true;
    }

    finish(result) {
      if (this.done) return;
      this.done = true;
      Game.pop();
      this.onEnd && this.onEnd({ result });
    }

    // --- Frame-Update + Rendering -------------------------------------------
    update(dt) {
      this.time += dt;
      if (this.flashEnemy > 0) this.flashEnemy--;
      if (this.flashPlayer > 0) this.flashPlayer--;
    }

    drawMonSprite(ctx, mon, url, x, y, hidden, flash) {
      if (hidden) return;
      if (flash > 0 && Math.floor(flash / 3) % 2 === 0) return; // Blinken
      const img = Data.sprite(url);
      if (img) ctx.drawImage(img, x, y, 56, 56);
      else Data.drawPlaceholder(ctx, mon.species, x, y, 56);
    }

    drawStatus(ctx, mon, x, y) {
      if (!mon.status) return;
      ctx.fillStyle = Data.STATUS_COLORS[mon.status];
      ctx.fillRect(x - 1, y - 1, 26, 9);
      UI.text(ctx, Data.STATUS_DE[mon.status], x, y, '#f8f8f8');
    }

    draw(ctx) {
      ctx.fillStyle = P.bg; ctx.fillRect(0, 0, 160, 144);

      // Plattformen
      ctx.fillStyle = P.platform;
      ctx.beginPath(); ctx.ellipse(126, 62, 30, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(36, 96, 32, 7, 0, 0, Math.PI * 2); ctx.fill();

      // Sprites
      this.drawMonSprite(ctx, this.enemy, this.enemy.species.front, 98, 10, this.hideEnemy, this.flashEnemy);
      this.drawMonSprite(ctx, this.player, this.player.species.back, 8, 44, false, this.flashPlayer);

      // Pokéball-Animation
      if (this.ball) {
        const bx = this.ball.x + (this.ball.shake || 0), by = this.ball.y;
        ctx.fillStyle = '#e03028'; ctx.beginPath(); ctx.arc(bx, by, 5, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#f8f8f8'; ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI); ctx.fill();
        ctx.strokeStyle = '#181818'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx - 5, by); ctx.lineTo(bx + 5, by); ctx.stroke();
      }

      // Gegner-Infobox (oben links)
      UI.box(ctx, 2, 2, 92, 34);
      UI.text(ctx, this.enemy.name.toUpperCase(), 6, 7);
      UI.text(ctx, ':L' + this.enemy.level, 52, 16);
      this.drawStatus(ctx, this.enemy, 10, 17);
      UI.hpBar(ctx, 10, 26, 76, this.dispEnemyHp, this.enemy.stats.hp);
      // Trainerkampf: verbleibende Team-Bälle des Gegners
      if (this.trainer) {
        for (let i = 0; i < this.enemyTeam.length; i++) {
          ctx.fillStyle = i >= this.enemyIndex ? '#e03028' : '#b0b0b0';
          ctx.fillRect(96 + i * 6, 4, 4, 4);
        }
      }

      // Spieler-Infobox (unten rechts)
      UI.box(ctx, 64, 56, 94, 40);
      UI.text(ctx, this.player.name.toUpperCase(), 68, 60);
      UI.text(ctx, ':L' + this.player.level, 116, 69);
      this.drawStatus(ctx, this.player, 72, 70);
      UI.hpBar(ctx, 72, 80, 78, this.dispPlayerHp, this.player.stats.hp);
      UI.text(ctx, `${this.dispPlayerHp}/${this.player.stats.hp}`, 88, 87);

      // Textbox
      UI.box(ctx, 0, 96, 160, 48);
      if (this.menu && this.menu.kind === 'main') {
        UI.box(ctx, 64, 96, 96, 48);
        this.menu.items.forEach((it, i) => {
          const y = 102 + i * 10;
          UI.text(ctx, it, 86, y);
          if (i === this.menu.index) UI.text(ctx, '>', 76, y);
        });
        UI.textWrapped(ctx, this.msg, 6, 108, 7);
      } else if (this.menu) {
        // Attacken-/Item-Liste (scrollt bei mehr als 4 Einträgen)
        const items = this.menu.items;
        const scroll = Math.max(0, Math.min(this.menu.index - 2, items.length - 4));
        items.slice(scroll, scroll + 4).forEach((it, i) => {
          const y = 104 + i * 10;
          UI.text(ctx, it, 18, y);
          if (scroll + i === this.menu.index) UI.text(ctx, '>', 8, y);
        });
        if (scroll > 0) UI.text(ctx, '^', 150, 102);
        if (scroll + 4 < items.length) UI.text(ctx, 'v', 150, 136);
      } else {
        UI.textWrapped(ctx, this.msg.slice(0, this.msgChars), 6, 108, 18);
        if (this.msgChars >= this.msg.length && this.msg && Math.floor(this.time / 400) % 2 === 0) {
          UI.text(ctx, 'v', 148, 134); // Weiter-Pfeil
        }
      }

      // Team-Auswahl als Overlay
      if (this.partyList) {
        UI.box(ctx, 8, 8, 144, 100);
        UI.text(ctx, 'TEAM', 16, 16);
        Game.player.party.forEach((m, i) => {
          const y = 28 + i * 13;
          UI.text(ctx, m.name.toUpperCase(), 28, y);
          UI.text(ctx, `${m.hp <= 0 ? 'K.O.' : 'L' + m.level}`, 118, y);
          if (i === this.partyList.index) UI.text(ctx, '>', 18, y);
        });
      }
    }
  }

  return { CHART, SPECIAL, EVO, effectiveness, calcStats, expFor, makeMon, restoreMon, damage, catchChance, BattleScreen };
})();
