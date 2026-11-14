'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const BC = require('../js/battle-core.js');
const { loadDex, seq } = require('./helpers');

const DEX = loadDex();
const TYPES = Object.keys(BC.CHART);
const sp = id => DEX[id];

// ------------------------------------------------------------ Typentabelle
test('Typentabelle: nur gültige Typen und nur 0 / 0,5 / 2 als Faktoren', () => {
  assert.equal(TYPES.length, 15, 'Gen 1 hat 15 Typen');
  for (const [atk, row] of Object.entries(BC.CHART)) {
    for (const [def, f] of Object.entries(row)) {
      assert.ok(TYPES.includes(def), `${atk} -> unbekannter Typ ${def}`);
      assert.ok([0, 0.5, 2].includes(f), `${atk} -> ${def} = ${f}`);
    }
  }
});

test('Typentabelle: Gen-1-Eigenheiten', () => {
  assert.equal(BC.effectiveness('ghost', ['psychic']), 0, 'Geist gegen Psycho = 0 (Gen-1-Bug)');
  assert.equal(BC.effectiveness('bug', ['poison']), 2);
  assert.equal(BC.effectiveness('poison', ['bug']), 2);
  assert.equal(BC.effectiveness('ice', ['fire']), 1, 'Eis gegen Feuer neutral');
  assert.equal(BC.effectiveness('normal', ['ghost']), 0);
  assert.equal(BC.effectiveness('ground', ['flying']), 0);
  assert.equal(BC.effectiveness('electric', ['ground']), 0);
});

test('effectiveness multipliziert über Doppeltypen', () => {
  assert.equal(BC.effectiveness('ice', ['dragon', 'flying']), 4);      // Dragoran
  assert.equal(BC.effectiveness('fire', ['water', 'dragon']), 0.25);
  assert.equal(BC.effectiveness('electric', ['water', 'ground']), 0, '0 schlägt jede 2');
  assert.equal(BC.effectiveness('normal', []), 1);
  assert.equal(BC.effectiveness('unbekannt', ['fire']), 1);
});

test('gen1Types: heutige Typen auf Gen 1 zurückführen', () => {
  assert.deepEqual(BC.gen1Types(['fairy']), ['normal']);
  assert.deepEqual(BC.gen1Types(['normal', 'fairy']), ['normal']);
  assert.deepEqual(BC.gen1Types(['electric', 'steel']), ['electric']);
  assert.deepEqual(BC.gen1Types(['psychic', 'fairy']), ['psychic']);
  assert.deepEqual(BC.gen1Types(['grass', 'poison']), ['grass', 'poison']);
  assert.deepEqual(BC.gen1Types([]), ['normal']);
  assert.deepEqual(BC.gen1Types(['constructor']), ['normal'], 'kein Prototyp-Treffer');
});

test('SPECIAL enthält nur Typen der Tabelle', () => {
  for (const t of BC.SPECIAL) assert.ok(TYPES.includes(t), t);
});

// ------------------------------------------------------------- Evolutionen
test('EVO: jede Stufe zeigt auf eine existierende Spezies, Level 1..100', () => {
  for (const [from, { to, l }] of Object.entries(BC.EVO)) {
    assert.ok(sp(+from), `Quelle ${from} fehlt im Pokédex`);
    assert.ok(sp(to), `Ziel ${to} fehlt im Pokédex`);
    assert.ok(Number.isInteger(l) && l >= 1 && l <= 100, `${from}: Level ${l}`);
    assert.ok(to > +from, `${from} -> ${to} geht rückwärts`);
  }
});

test('EVO: zweite Stufe einer Linie liegt über der ersten, keine Zyklen', () => {
  for (const [from, e] of Object.entries(BC.EVO)) {
    const next = BC.EVO[e.to];
    if (next) assert.ok(next.l > e.l, `${from}->${e.to} (L${e.l}) vor ${e.to}->${next.to} (L${next.l})`);
    const seen = new Set([+from]);
    let id = e.to;
    while (BC.EVO[id]) { assert.ok(!seen.has(id), `Zyklus bei ${id}`); seen.add(id); id = BC.EVO[id].to; }
  }
});

test('EVO: Legendäre und Endstufen entwickeln sich nicht', () => {
  for (const id of [3, 6, 9, 144, 145, 146, 149, 150, 151]) assert.equal(BC.EVO[id], undefined, String(id));
});

// --------------------------------------------------------- Stats und EXP
test('calcStats: Formel mit IV 8 an einem Hand-Beispiel', () => {
  // Pikachu (hp 35, atk 55, def 40/30?, …) — Werte direkt aus dem Pokédex.
  const s = BC.calcStats({ hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 }, 50);
  assert.deepEqual(s, {
    hp: Math.floor((35 + 8) * 100 / 100) + 50 + 10,   // 103
    atk: 63 + 5, def: 48 + 5, spa: 58 + 5, spd: 58 + 5, spe: 98 + 5,
  });
});

test('calcStats: wächst monoton mit dem Level', () => {
  const base = sp(6).base;
  let prev = BC.calcStats(base, 1);
  for (let l = 2; l <= 100; l++) {
    const cur = BC.calcStats(base, l);
    for (const k of Object.keys(cur)) assert.ok(cur[k] >= prev[k], `${k} sinkt bei L${l}`);
    prev = cur;
  }
});

test('expFor ist Level³ und streng steigend', () => {
  assert.equal(BC.expFor(1), 1);
  assert.equal(BC.expFor(50), 125000);
  for (let l = 1; l < 100; l++) assert.ok(BC.expFor(l + 1) > BC.expFor(l));
});

// ------------------------------------------------------------------- RNG
test('makeRng: gleicher Seed -> gleiche Folge, Werte in [0,1)', () => {
  const a = BC.makeRng(1234), b = BC.makeRng(1234), c = BC.makeRng(1235);
  const xa = Array.from({ length: 1000 }, a), xb = Array.from({ length: 1000 }, b);
  assert.deepEqual(xa, xb);
  assert.notDeepEqual(xa.slice(0, 10), Array.from({ length: 10 }, c));
  for (const x of xa) assert.ok(x >= 0 && x < 1, String(x));
});

test('makeRng: grob gleichverteilt', () => {
  const r = BC.makeRng(42);
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 20000; i++) buckets[Math.floor(r() * 10)]++;
  for (const n of buckets) assert.ok(n > 1700 && n < 2300, `Eimer ${n}`);
});

test('makeRng: bitgleich auf jeder Plattform (feste Folgen)', () => {
  // Pinnt die exakte mulberry32-Folge: ändert sie sich, laufen Server und
  // Clients auseinander und gespeicherte Replays spielen falsch ab.
  const raw = seed => { const r = BC.makeRng(seed); return Array.from({ length: 4 }, () => Math.floor(r() * 4294967296)); };
  assert.deepEqual(raw(0), [1144304738, 1416247, 958946056, 627933444]);
  assert.deepEqual(raw(1), [2693262067, 11749833, 2265367787, 4213581821]);
  assert.deepEqual(raw(123456789), [1107202814, 4169434471, 3372958138, 885470128]);
});

// ---------------------------------------------------------------- Schaden
const mon = (id, level, extra = {}) => ({ ...BC.makeBattleMon(sp(id), level), ...extra });

test('damage: Typ-Immunität ergibt 0 Schaden', () => {
  const a = mon(25, 50), d = mon(50, 50);   // Pikachu gegen Digda
  const r = BC.damage(a, d, { type: 'electric', power: 95 }, seq(0.99, 0.5));
  assert.equal(r.typeEff, 0);
  assert.equal(r.dmg, 0);
});

test('damage: mindestens 1 Schaden, wenn nicht immun', () => {
  const a = mon(10, 1), d = mon(95, 100);   // Raupy L1 gegen Onix L100
  const r = BC.damage(a, d, { type: 'normal', power: 10 }, seq(0.99, 0));
  assert.ok(r.typeEff > 0);
  assert.equal(r.dmg, 1);
});

test('damage: Volltreffer verdoppelt, Zufallsband 85–100 %', () => {
  const a = mon(6, 50), d = mon(9, 50), move = { type: 'normal', power: 80 };
  const lo = BC.damage(a, d, move, seq(0.99, 0)).dmg;           // kein Crit, 85 %
  const hi = BC.damage(a, d, move, seq(0.99, 0.9999)).dmg;      // kein Crit, ~100 %
  const crit = BC.damage(a, d, move, seq(0, 0.9999));
  assert.ok(crit.crit);
  assert.ok(lo < hi);
  assert.ok(Math.abs(lo / hi - 0.85) < 0.03, `${lo}/${hi}`);
  assert.ok(crit.dmg >= hi * 2 - 2 && crit.dmg <= hi * 2 + 2, `${crit.dmg} vs ${hi}`);
});

test('damage: STAB = 1,5 und Spezial nutzt SpA/SpV', () => {
  const a = mon(6, 50), d = mon(143, 50);   // Glurak gegen Relaxo
  const fire = BC.damage(a, d, { type: 'fire', power: 90 }, seq(0.99, 0.9999)).dmg;
  // Gleiche Rechnung ohne STAB: Glurak ohne Feuertyp.
  const noStab = BC.damage({ ...a, species: { ...a.species, types: ['flying'] } }, d,
    { type: 'fire', power: 90 }, seq(0.99, 0.9999)).dmg;
  assert.ok(Math.abs(fire / noStab - 1.5) < 0.05, `${fire}/${noStab}`);
  // Spezial: höhere SpV senkt den Feuerschaden, Def bleibt egal.
  const tanky = { ...d, stats: { ...d.stats, spd: d.stats.spd * 2 } };
  const armored = { ...d, stats: { ...d.stats, def: d.stats.def * 2 } };
  assert.ok(BC.damage(a, tanky, { type: 'fire', power: 90 }, seq(0.99, 0.9999)).dmg < fire);
  assert.equal(BC.damage(a, armored, { type: 'fire', power: 90 }, seq(0.99, 0.9999)).dmg, fire);
});

test('damage: Verbrennung halbiert nur physischen Angriff', () => {
  const a = mon(68, 50), d = mon(143, 50), move = { type: 'fighting', power: 80 };
  const r = seq(0.99, 0.9999);
  const normal = BC.damage(a, d, move, r).dmg;
  const burnt = BC.damage({ ...a, status: 'brn' }, d, move, seq(0.99, 0.9999)).dmg;
  assert.ok(burnt < normal * 0.6, `${burnt} vs ${normal}`);
  const special = { type: 'psychic', power: 80 };
  assert.equal(BC.damage({ ...a, status: 'brn' }, d, special, seq(0.99, 0.9999)).dmg,
    BC.damage(a, d, special, seq(0.99, 0.9999)).dmg);
});

// ------------------------------------------------------------- Fangchance
test('catchChance: geklemmt auf 10–95 % und steigt mit sinkenden HP', () => {
  const m = mon(150, 70);
  const full = BC.catchChance({ ...m, hp: m.stats.hp });
  const low = BC.catchChance({ ...m, hp: 1 });
  assert.equal(full, 0.25);                          // (1/3)*0,75
  assert.ok(low > full);
  assert.equal(BC.catchChance({ ...m, hp: 1 }, 255), 0.95);
  assert.equal(BC.catchChance({ ...m, hp: m.stats.hp }, 0), 0.1);
  for (let hp = m.stats.hp; hp > 0; hp -= 7) {
    const c = BC.catchChance({ ...m, hp });
    assert.ok(c >= 0.1 && c <= 0.95);
  }
});

test('catchChance: Status-Bonus, Eis stärker', () => {
  const m = mon(16, 10);
  const base = BC.catchChance(m);
  assert.ok(Math.abs(BC.catchChance({ ...m, status: 'par' }) - (base + 0.1)) < 1e-9);
  assert.ok(Math.abs(BC.catchChance({ ...m, status: 'frz' }) - (base + 0.2)) < 1e-9);
});

// --------------------------------------------------------------- Movesets
test('movesFor: höchstens 4 Attacken, nur bis zum Level gelernte', () => {
  for (let id = 1; id <= 151; id++) {
    for (const level of [1, 10, 22, 50]) {
      const ms = BC.movesFor(sp(id), level);
      assert.ok(ms.length >= 1 && ms.length <= 4, `${id}@${level}: ${ms.length}`);
      for (const m of ms) {
        const def = (BC.MOVE_POOL[m.type] || []).find(p => p.n === m.name);
        assert.ok(def, `${m.name} nicht im Pool ${m.type}`);
        assert.ok(def.l <= level, `${m.name} (L${def.l}) bei L${level}`);
      }
      assert.equal(new Set(ms.map(m => m.name)).size, ms.length, `Doppelte Attacke bei ${id}`);
    }
  }
});

test('MOVE_POOL deckt alle Typen ab, Werte plausibel', () => {
  for (const t of TYPES) assert.ok(BC.MOVE_POOL[t], `kein Pool für ${t}`);
  for (const pool of Object.values(BC.MOVE_POOL)) for (const m of pool) {
    assert.ok(m.p > 0 && m.a > 0 && m.a <= 100, m.n);
    if (m.fx) assert.ok(['par', 'brn', 'frz', 'psn'].includes(m.fx.s) && m.fx.c > 0 && m.fx.c <= 100, m.n);
  }
});

test('Pokédex: alle Spezies haben nur bekannte Typen', () => {
  for (let id = 1; id <= 151; id++) {
    assert.ok(sp(id), `#${id} fehlt`);
    for (const t of sp(id).types) assert.ok(TYPES.includes(t), `#${id}: ${t}`);
  }
});

// ------------------------------------------------------------- resolveTurn
function battle(teamA, teamB) {
  return BC.makeBattleState(teamA.map(([id, l]) => BC.makeBattleMon(sp(id), l)),
    teamB.map(([id, l]) => BC.makeBattleMon(sp(id), l)));
}

function playOut(seed, actionsFor = () => [{ kind: 'move', move: 0 }, { kind: 'move', move: 0 }]) {
  const st = battle([[6, 50], [9, 50]], [[3, 50], [25, 50]]);
  const rng = BC.makeRng(seed);
  const log = [];
  for (let i = 0; i < 300 && st.winner == null; i++) {
    log.push(BC.resolveTurn(st, actionsFor(st), rng).events);
    for (let s = 0; s < 2; s++) if (st.pendingSwitch[s]) {
      const to = st.sides[s].team.findIndex(m => m.hp > 0);
      log.push(BC.applyForcedSwitch(st, s, to));
    }
  }
  return { st, log };
}

test('resolveTurn: deterministisch bei gleichem Seed', () => {
  const a = playOut(7), b = playOut(7);
  assert.deepEqual(a.log, b.log);
  assert.notEqual(a.st.winner, null, 'Kampf endet');
  assert.notDeepEqual(playOut(8).log, a.log);
});

test('resolveTurn: genau ein Sieger, Verlierer komplett K.O.', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { st, log } = playOut(seed);
    assert.ok(st.winner === 0 || st.winner === 1, `Seed ${seed}`);
    const loser = st.sides[1 - st.winner].team;
    assert.ok(loser.every(m => m.hp === 0), `Seed ${seed}: Verlierer lebt noch`);
    assert.ok(st.sides[st.winner].team.some(m => m.hp > 0));
    assert.equal(log.flat().filter(e => e.e === 'win').length, 1);
    for (const m of [...st.sides[0].team, ...st.sides[1].team]) assert.ok(m.hp >= 0 && m.hp <= m.stats.hp);
  }
});

test('resolveTurn: schnelleres Mon greift zuerst an', () => {
  const st = battle([[143, 50]], [[101, 50]]);     // Relaxo (langsam) vs Lektrobal (schnell)
  const { events } = BC.resolveTurn(st, [{ kind: 'move', move: 0 }, { kind: 'move', move: 0 }], BC.makeRng(3));
  const first = events.find(e => e.e === 'move' || e.e === 'fullpar' || e.e === 'frozen');
  assert.equal(first.side, 1);
});

test('resolveTurn: Paralyse viertelt die Initiative', () => {
  const m = BC.makeBattleMon(sp(101), 50);
  assert.equal(BC.effSpe(m), m.stats.spe);
  assert.equal(BC.effSpe({ ...m, status: 'par' }), Math.floor(m.stats.spe / 4));
});

test('resolveTurn: Wechsel kommt vor dem Angriff', () => {
  const st = battle([[6, 50], [9, 50]], [[3, 50]]);
  const { events } = BC.resolveTurn(st, [{ kind: 'switch', to: 1 }, { kind: 'move', move: 0 }], BC.makeRng(5));
  assert.equal(events[0].e, 'switch');
  assert.equal(st.sides[0].active, 1);
  const dmg = events.find(e => e.e === 'damage' && e.side === 0);
  if (dmg) assert.equal(dmg.to, st.sides[0].team[1].hp, 'Schaden trifft den eingewechselten');
  assert.equal(st.sides[0].team[0].hp, st.sides[0].team[0].stats.hp, 'ausgewechselter bleibt unberührt');
});

test('resolveTurn: Gift zieht 1/16 KP am Rundenende', () => {
  const st = battle([[143, 50]], [[143, 50]]);
  const a = st.sides[0].team[0];
  a.status = 'psn';
  // Beide Attacken verfehlen sicher (Genauigkeit 50, Wurf 99,9), danach Giftschaden.
  for (const sd of st.sides) sd.team[0].moves = [{ name: 'X', type: 'normal', power: 40, acc: 50 }];
  const { events } = BC.resolveTurn(st, [{ kind: 'move', move: 0 }, { kind: 'move', move: 0 }], seq(0.5, 0.999));
  const sd = events.find(e => e.e === 'statusdmg');
  assert.ok(sd);
  assert.equal(sd.side, 0);
  assert.equal(a.hp, a.stats.hp - Math.floor(a.stats.hp / 16));
});

test('resolveTurn: Feuertyp kann nicht verbrannt werden', () => {
  for (let seed = 0; seed < 200; seed++) {
    const st = battle([[58, 50]], [[6, 50]]);     // Fukano greift Glurak an
    st.sides[0].team[0].moves = [{ name: 'Glut', type: 'fire', power: 40, acc: 100, fx: { s: 'brn', c: 100 } }];
    BC.resolveTurn(st, [{ kind: 'move', move: 0 }, null], BC.makeRng(seed));
    assert.notEqual(st.sides[1].team[0].status, 'brn', `Seed ${seed}`);
  }
});

test('resolveTurn: Feuerattacke taut einen eingefrorenen Gegner auf', () => {
  const st = battle([[6, 50]], [[143, 50]]);
  st.sides[1].team[0].status = 'frz';
  const { events } = BC.resolveTurn(st, [{ kind: 'move', move: 0 }, null], seq(0.5, 0, 0.99, 0.5, 0.99));
  const mv = st.sides[0].team[0].moves[0];
  assert.equal(mv.type, 'fire');
  assert.ok(events.some(e => e.e === 'thaw' && e.side === 1));
  assert.equal(st.sides[1].team[0].status, null);
});

test('applyForcedSwitch setzt aktiven Slot und löscht die Wechselpflicht', () => {
  const st = battle([[6, 50], [9, 50]], [[3, 50]]);
  st.pendingSwitch[0] = true;
  const ev = BC.applyForcedSwitch(st, 0, 1);
  assert.equal(st.sides[0].active, 1);
  assert.equal(st.pendingSwitch[0], false);
  assert.equal(ev[0].id, 9);
  assert.equal(ev[0].maxHp, st.sides[0].team[1].stats.hp);
});
