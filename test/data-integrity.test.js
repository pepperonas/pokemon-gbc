'use strict';
// Querbezüge zwischen den Datenquellen: Pokédex (Client), species.json
// (Server) und Beschriftungen in js/data.js. Laufen sie auseinander, rechnen
// Client und autoritativer Server mit verschiedenen Typen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const BC = require('../js/battle-core.js');
const { ROOT, loadDex } = require('./helpers');

const DEX = loadDex();
const SPECIES = require('../server/species.json');
const DATA_SRC = fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8');

function keysOf(name) {
  const m = DATA_SRC.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\};`));
  assert.ok(m, `${name} nicht gefunden`);
  return [...m[1].matchAll(/(\w+):/g)].map(x => x[1]);
}

test('Pokédex: 151 Einträge, Index = ID, Basiswerte vollständig', () => {
  assert.equal(DEX.length, 152);
  assert.equal(DEX[0], null);
  for (let id = 1; id <= 151; id++) {
    assert.equal(DEX[id].id, id);
    for (const k of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) {
      assert.ok(Number.isInteger(DEX[id].base[k]) && DEX[id].base[k] > 0, `#${id} ${k}`);
    }
  }
});

test('Pokédex: nur Gen-1-Typen (keine Fee, kein Stahl)', () => {
  for (let id = 1; id <= 151; id++) {
    assert.deepEqual(DEX[id].types, BC.gen1Types(DEX[id].types), `#${id} ${DEX[id].types}`);
  }
});

test('species.json (Server) stimmt mit dem Pokédex (Client) überein', () => {
  assert.equal(Object.keys(SPECIES).length, 151);
  for (let id = 1; id <= 151; id++) {
    assert.deepEqual(SPECIES[id].types, DEX[id].types, `#${id} Typen`);
    assert.deepEqual(SPECIES[id].base, DEX[id].base, `#${id} Basiswerte`);
  }
});

test('Jeder Typ hat Beschriftung und Farbe in js/data.js', () => {
  const de = keysOf('TYPE_DE'), col = keysOf('TYPE_COLORS');
  for (const t of Object.keys(BC.CHART)) {
    assert.ok(de.includes(t), `TYPE_DE fehlt ${t}`);
    assert.ok(col.includes(t), `TYPE_COLORS fehlt ${t}`);
  }
});
