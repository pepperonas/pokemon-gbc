'use strict';
/**
 * battle-core.js — Reine, isomorphe Gen-1-Kampflogik (Browser UND Node).
 *
 * Eine Quelle der Wahrheit für den Solo-Kampf (js/battle.js) und den künftigen
 * autoritativen PvP-Server (siehe MULTIPLAYER_PLAN.md). Enthält bewusst KEIN
 * DOM, KEIN Rendering und KEINE Abhängigkeit zu Data/UI — nur Mathe.
 *
 * Determinismus (Phase P0): Jede Zufallsentscheidung läuft über eine injizierte
 * RNG `rng() -> [0,1)`. Mit `makeRng(seed)` (mulberry32) rechnen Server und
 * beide Clients bitgleich. Wird keine RNG übergeben, fällt der Solo-Modus auf
 * `Math.random` zurück (Verhalten unverändert zu vorher).
 *
 * Einbindung: im Browser als globales `BattleCore`, in Node via require().
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod; // Node/Server
  root.BattleCore = mod;                                                      // Browser-Global
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

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
  // Stein-/Tausch-Evolutionen sind auf passende Level gemappt.
  const EVO = {
    1:   { to: 2,   l: 16 }, 2:   { to: 3,   l: 32 },
    4:   { to: 5,   l: 16 }, 5:   { to: 6,   l: 36 },
    7:   { to: 8,   l: 16 }, 8:   { to: 9,   l: 36 },
    10:  { to: 11,  l: 7 },  11:  { to: 12,  l: 10 },
    13:  { to: 14,  l: 7 },  14:  { to: 15,  l: 10 },
    16:  { to: 17,  l: 18 }, 17:  { to: 18,  l: 36 },
    19:  { to: 20,  l: 20 },
    21:  { to: 22,  l: 20 },
    23:  { to: 24,  l: 22 },
    25:  { to: 26,  l: 28 },
    27:  { to: 28,  l: 22 },
    29:  { to: 30,  l: 16 }, 30:  { to: 31,  l: 36 },
    32:  { to: 33,  l: 16 }, 33:  { to: 34,  l: 36 },
    35:  { to: 36,  l: 28 },
    37:  { to: 38,  l: 30 },
    39:  { to: 40,  l: 28 },
    41:  { to: 42,  l: 22 },
    43:  { to: 44,  l: 21 }, 44:  { to: 45,  l: 36 },
    46:  { to: 47,  l: 24 },
    48:  { to: 49,  l: 31 },
    50:  { to: 51,  l: 26 },
    52:  { to: 53,  l: 28 },
    54:  { to: 55,  l: 33 },
    56:  { to: 57,  l: 28 },
    58:  { to: 59,  l: 30 },
    60:  { to: 61,  l: 25 }, 61:  { to: 62,  l: 36 },
    63:  { to: 64,  l: 16 }, 64:  { to: 65,  l: 36 },
    66:  { to: 67,  l: 28 }, 67:  { to: 68,  l: 40 },
    69:  { to: 70,  l: 21 }, 70:  { to: 71,  l: 36 },
    72:  { to: 73,  l: 30 },
    74:  { to: 75,  l: 25 }, 75:  { to: 76,  l: 40 },
    77:  { to: 78,  l: 40 },
    79:  { to: 80,  l: 37 },
    81:  { to: 82,  l: 30 },
    84:  { to: 85,  l: 31 },
    86:  { to: 87,  l: 34 },
    88:  { to: 89,  l: 38 },
    90:  { to: 91,  l: 36 },
    92:  { to: 93,  l: 25 }, 93:  { to: 94,  l: 40 },
    96:  { to: 97,  l: 26 },
    98:  { to: 99,  l: 28 },
    100: { to: 101, l: 30 },
    102: { to: 103, l: 36 },
    104: { to: 105, l: 28 },
    109: { to: 110, l: 35 },
    111: { to: 112, l: 42 },
    116: { to: 117, l: 32 },
    118: { to: 119, l: 33 },
    120: { to: 121, l: 36 },
    129: { to: 130, l: 20 },
    133: { to: 134, l: 25 },          // Evoli: Zufalls-Zweig, s. checkEvolution
    138: { to: 139, l: 40 },
    140: { to: 141, l: 40 },
    147: { to: 148, l: 30 }, 148: { to: 149, l: 55 },
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

  // -------------------------------------------------------- Seedbare RNG ---
  // mulberry32: schneller, deterministischer 32-Bit-PRNG. Gleicher Seed ->
  // identische Sequenz auf Server und beiden Clients.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const makeRng = seed => mulberry32(seed);

  /**
   * Gen-1-Schadensformel:
   * dmg = floor(floor(floor((2L/5+2)*Power*Atk/Def)/50)+2) * STAB * TYP * rnd(0.85..1)
   * Verbrennung halbiert den physischen Angriff (Gen 1).
   * Volltreffer = vereinfachte 2x-Chance (Basis-Speed/512).
   * @param rng injizierte Zufallsquelle () -> [0,1); Default Math.random (Solo).
   */
  function damage(attacker, defender, move, rng = Math.random) {
    const special = SPECIAL.has(move.type);
    let atk = special ? attacker.stats.spa : attacker.stats.atk;
    if (!special && attacker.status === 'brn') atk = Math.max(1, Math.floor(atk / 2));
    const def = special ? defender.stats.spd : defender.stats.def;
    const stab = attacker.species.types.includes(move.type) ? 1.5 : 1;
    const typeEff = effectiveness(move.type, defender.species.types);
    const crit = rng() < attacker.species.base.spe / 512;

    let dmg = Math.floor(Math.floor(Math.floor(
      (2 * attacker.level / 5 + 2) * move.power * atk / def) / 50) + 2);
    if (crit) dmg *= 2;
    dmg = Math.floor(dmg * stab * typeEff * (0.85 + rng() * 0.15));
    if (typeEff > 0 && dmg < 1) dmg = 1;
    return { dmg, typeEff, crit };
  }

  /**
   * Vereinfachte Fangchance: je weniger Rest-HP, desto höher. Ball-Stufen
   * multiplizieren; Statusprobleme geben Bonus (EIS +20%, sonst +10%).
   * Rein deterministisch — der eigentliche Wurf-Roll passiert beim Aufrufer.
   */
  function catchChance(mon, ballMult = 1) {
    const base = (3 * mon.stats.hp - 2 * mon.hp) / (3 * mon.stats.hp);
    let c = base * 0.75 * ballMult;
    if (mon.status === 'frz') c += 0.2;
    else if (mon.status) c += 0.1;
    return Math.min(0.95, Math.max(0.1, c));
  }

  // ------------------------------------------------------- Attacken-Pool ---
  // Kuratierter Move-Pool pro Typ (Gen-1-Power/Accuracy) mit Lern-Level `l`
  // und optionalem Status-Nebeneffekt `fx: { s, c }`. Eine Quelle der Wahrheit
  // für Solo (Data.movesFor delegiert hierher) UND den PvP-Server.
  const MOVE_POOL = {
    normal:   [{ n: 'Tackle', p: 35, a: 95, l: 1 }, { n: 'Kratzer', p: 40, a: 100, l: 10 }, { n: 'Bodyslam', p: 85, a: 100, l: 22, fx: { s: 'par', c: 30 } }, { n: 'Hyperstrahl', p: 150, a: 90, l: 35 }],
    fire:     [{ n: 'Glut', p: 40, a: 100, l: 1, fx: { s: 'brn', c: 10 } }, { n: 'Feuerzahn', p: 65, a: 95, l: 10, fx: { s: 'brn', c: 10 } }, { n: 'Flammenwurf', p: 95, a: 100, l: 22, fx: { s: 'brn', c: 10 } }, { n: 'Feuersturm', p: 120, a: 85, l: 35, fx: { s: 'brn', c: 10 } }],
    water:    [{ n: 'Aquaknarre', p: 40, a: 100, l: 1 }, { n: 'Blubbstrahl', p: 65, a: 100, l: 10 }, { n: 'Surfer', p: 95, a: 100, l: 22 }, { n: 'Hydropumpe', p: 120, a: 80, l: 35 }],
    grass:    [{ n: 'Rankenhieb', p: 35, a: 100, l: 1 }, { n: 'Rasierblatt', p: 55, a: 95, l: 10 }, { n: 'Blattgewirbel', p: 80, a: 100, l: 22 }, { n: 'Solarstrahl', p: 120, a: 100, l: 35 }],
    electric: [{ n: 'Donnerschock', p: 40, a: 100, l: 1, fx: { s: 'par', c: 10 } }, { n: 'Funkensprung', p: 65, a: 100, l: 10, fx: { s: 'par', c: 30 } }, { n: 'Donnerblitz', p: 95, a: 100, l: 22, fx: { s: 'par', c: 10 } }, { n: 'Donner', p: 120, a: 70, l: 35, fx: { s: 'par', c: 10 } }],
    ice:      [{ n: 'Eisschauer', p: 40, a: 100, l: 1, fx: { s: 'frz', c: 10 } }, { n: 'Aurorastrahl', p: 65, a: 100, l: 10 }, { n: 'Eisstrahl', p: 95, a: 100, l: 22, fx: { s: 'frz', c: 10 } }, { n: 'Blizzard', p: 120, a: 90, l: 35, fx: { s: 'frz', c: 10 } }],
    fighting: [{ n: 'Fusstritt', p: 50, a: 90, l: 1 }, { n: 'Karateschlag', p: 50, a: 100, l: 10 }, { n: 'Ueberroller', p: 80, a: 80, l: 22 }, { n: 'Hochkick', p: 85, a: 90, l: 35 }],
    poison:   [{ n: 'Giftstachel', p: 15, a: 100, l: 1, fx: { s: 'psn', c: 30 } }, { n: 'Saeure', p: 40, a: 100, l: 10 }, { n: 'Schlamm', p: 65, a: 100, l: 22, fx: { s: 'psn', c: 40 } }, { n: 'Giftschock', p: 90, a: 100, l: 35, fx: { s: 'psn', c: 40 } }],
    ground:   [{ n: 'Sandgrab', p: 35, a: 90, l: 1 }, { n: 'Knochenkeule', p: 65, a: 85, l: 10 }, { n: 'Schaufler', p: 100, a: 100, l: 22 }, { n: 'Erdbeben', p: 100, a: 100, l: 35 }],
    flying:   [{ n: 'Windstoss', p: 40, a: 100, l: 1 }, { n: 'Fluegelschlag', p: 60, a: 100, l: 10 }, { n: 'Bohrschnabel', p: 80, a: 100, l: 22 }, { n: 'Himmelsfeger', p: 140, a: 90, l: 35 }],
    psychic:  [{ n: 'Konfusion', p: 50, a: 100, l: 1 }, { n: 'Psystrahl', p: 65, a: 100, l: 10 }, { n: 'Psychokinese', p: 90, a: 100, l: 22 }, { n: 'Traumfresser', p: 100, a: 100, l: 35 }],
    bug:      [{ n: 'Duonadel', p: 25, a: 100, l: 1, fx: { s: 'psn', c: 20 } }, { n: 'Kaeferbiss', p: 60, a: 100, l: 10 }, { n: 'Anfallspin', p: 75, a: 95, l: 22 }, { n: 'Megasauger', p: 80, a: 100, l: 35 }],
    rock:     [{ n: 'Steinwurf', p: 50, a: 65, l: 1 }, { n: 'Steinhagel', p: 75, a: 90, l: 10 }, { n: 'Felsbrecher', p: 90, a: 90, l: 22 }, { n: 'Steinkante', p: 100, a: 80, l: 35 }],
    ghost:    [{ n: 'Lecker', p: 20, a: 100, l: 1, fx: { s: 'par', c: 30 } }, { n: 'Nachtnebel', p: 60, a: 100, l: 10 }, { n: 'Schattenstoss', p: 80, a: 100, l: 22 }, { n: 'Spuksturm', p: 95, a: 95, l: 35 }],
    dragon:   [{ n: 'Drachenwut', p: 50, a: 100, l: 1 }, { n: 'Drachenatem', p: 60, a: 100, l: 10, fx: { s: 'par', c: 30 } }, { n: 'Drachenstoss', p: 85, a: 95, l: 22 }, { n: 'Drachenpuls', p: 100, a: 100, l: 35 }],
  };

  /** Typgerechtes Moveset (max. 4) für eine Spezies auf gegebenem Level. */
  function movesFor(species, level = 50) {
    const moves = [];
    const perType = species.types.length > 1 ? 2 : 3;
    for (const t of species.types) {
      const pool = (MOVE_POOL[t] || MOVE_POOL.normal).filter(m => m.l <= level);
      for (const m of pool.slice(-perType)) {
        moves.push({ name: m.n, type: t, power: m.p, acc: m.a, fx: m.fx });
      }
    }
    if (moves.length < 4 && !moves.some(m => m.type === 'normal')) {
      moves.push({ name: 'Tackle', type: 'normal', power: 35, acc: 95 });
    }
    return moves.slice(0, 4);
  }

  // ====================================== PvP-Turn-Resolver (autoritativ) ===
  // Reiner, deterministischer Rundenrechner für 2-Spieler-Kämpfe. Erzeugt eine
  // Event-Liste, die Server und beide Clients identisch abspielen. Aktionen:
  //   { kind:'move', move:<idx> }  ·  { kind:'switch', to:<idx> }
  // (Items sind in PvP v1 bewusst nicht vorgesehen — wie klassische Link-Kämpfe.)
  const STATUS_IMMUNE = { psn: 'poison', brn: 'fire', frz: 'ice' };
  const effSpe = mon => mon.status === 'par' ? Math.floor(mon.stats.spe / 4) : mon.stats.spe;
  const activeOf = (st, s) => st.sides[s].team[st.sides[s].active];

  /** Kampf-Mon aus Spezies-Daten + Level erzeugen (Server-Autorität). */
  function makeBattleMon(species, level) {
    const stats = calcStats(species.base, level);
    return {
      id: species.id, level, stats, hp: stats.hp, status: null,
      species: { types: species.types.slice(), base: species.base },
      moves: movesFor(species, level),
    };
  }

  function makeBattleState(teamA, teamB) {
    return {
      sides: [{ team: teamA, active: 0 }, { team: teamB, active: 0 }],
      turn: 0, winner: null, pendingSwitch: [false, false],
    };
  }

  function doMove(state, atkSide, moveIdx, rng, events) {
    const att = activeOf(state, atkSide), def = activeOf(state, 1 - atkSide);
    if (att.hp <= 0) return;
    if (att.status === 'frz') {
      if (rng() < 0.2) { att.status = null; events.push({ e: 'thaw', side: atkSide }); }
      else { events.push({ e: 'frozen', side: atkSide }); return; }
    }
    if (att.status === 'par' && rng() < 0.25) { events.push({ e: 'fullpar', side: atkSide }); return; }
    const move = att.moves[moveIdx] || att.moves[0];
    events.push({ e: 'move', side: atkSide, move: move.name });
    if (rng() * 100 >= move.acc) { events.push({ e: 'miss', side: atkSide }); return; }
    const { dmg, typeEff, crit } = damage(att, def, move, rng);
    if (typeEff === 0) { events.push({ e: 'immune', side: 1 - atkSide }); return; }
    def.hp = Math.max(0, def.hp - dmg);
    events.push({ e: 'damage', side: 1 - atkSide, to: def.hp, dmg, eff: typeEff, crit });
    if (move.type === 'fire' && def.status === 'frz') { def.status = null; events.push({ e: 'thaw', side: 1 - atkSide }); }
    if (move.fx && def.hp > 0 && !def.status) {
      const immT = STATUS_IMMUNE[move.fx.s];
      const immune = immT && def.species.types.includes(immT);
      if (!immune && rng() * 100 < move.fx.c) { def.status = move.fx.s; events.push({ e: 'status', side: 1 - atkSide, status: move.fx.s }); }
    }
    if (def.hp <= 0) events.push({ e: 'faint', side: 1 - atkSide });
  }

  function checkFaintWin(state, events) {
    for (let s = 0; s < 2; s++) {
      const sd = state.sides[s];
      if (sd.team[sd.active].hp > 0) continue;
      if (sd.team.some(m => m.hp > 0)) {
        if (!state.pendingSwitch[s]) { state.pendingSwitch[s] = true; events.push({ e: 'forceswitch', side: s }); }
      } else if (state.winner == null) {
        state.winner = 1 - s; events.push({ e: 'win', side: 1 - s });
      }
    }
  }

  /** Erzwungenen Wechsel (nach K.O.) anwenden; liefert die Switch-Events. */
  function applyForcedSwitch(state, side, toIndex) {
    const sd = state.sides[side];
    sd.active = toIndex;
    state.pendingSwitch[side] = false;
    const mon = sd.team[toIndex];
    return [{ e: 'switch', side, mon: toIndex, id: mon.id, hp: mon.hp, maxHp: mon.stats.hp, status: mon.status, level: mon.level }];
  }

  /**
   * Eine Runde auflösen. actions = [a0, a1]. Reihenfolge: Wechsel zuerst
   * (Seite 0 dann 1), dann Angriffe nach effektiver Initiative (Gleichstand
   * per RNG), dann Gift-/Brand-Restschaden. Mutiert `state`, gibt { events }.
   */
  function resolveTurn(state, actions, rng) {
    const events = [];
    state.turn++;
    for (let s = 0; s < 2; s++) {
      if (actions[s] && actions[s].kind === 'switch') {
        const to = actions[s].to;
        state.sides[s].active = to;
        const mon = state.sides[s].team[to];
        events.push({ e: 'switch', side: s, mon: to, id: mon.id, hp: mon.hp, maxHp: mon.stats.hp, status: mon.status, level: mon.level });
      }
    }
    const movers = [0, 1].filter(s => actions[s] && actions[s].kind === 'move');
    movers.sort((a, b) => {
      const sa = effSpe(activeOf(state, a)), sb = effSpe(activeOf(state, b));
      if (sa !== sb) return sb - sa;
      return rng() < 0.5 ? -1 : 1;
    });
    for (const s of movers) {
      if (state.winner != null) break;
      doMove(state, s, actions[s].move, rng, events);
      checkFaintWin(state, events);
      if (state.winner != null) return { events };
    }
    for (let s = 0; s < 2; s++) {
      const m = activeOf(state, s);
      if (m.hp > 0 && (m.status === 'psn' || m.status === 'brn')) {
        const d = Math.max(1, Math.floor(m.stats.hp / 16));
        m.hp = Math.max(0, m.hp - d);
        events.push({ e: 'statusdmg', side: s, to: m.hp, status: m.status });
      }
    }
    checkFaintWin(state, events);
    return { events };
  }

  return {
    CHART, SPECIAL, EVO, IV, MOVE_POOL,
    effectiveness, calcStats, expFor, movesFor,
    mulberry32, makeRng,
    damage, catchChance,
    makeBattleMon, makeBattleState, resolveTurn, applyForcedSwitch, effSpe,
  };
});
