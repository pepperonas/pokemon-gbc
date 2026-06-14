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

  return {
    CHART, SPECIAL, EVO, IV,
    effectiveness, calcStats, expFor,
    mulberry32, makeRng,
    damage, catchChance,
  };
});
