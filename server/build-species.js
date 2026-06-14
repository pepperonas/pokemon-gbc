'use strict';
/**
 * build-species.js — Erzeugt server/species.json aus dem gebündelten Pokédex
 * (../js/pokedex.js). Der autoritative Server braucht nur Typen + Basiswerte
 * pro Spezies, um Stats/Schaden selbst zu berechnen (Anti-Cheat).
 *
 * Aufruf:  node server/build-species.js
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'pokedex.js'), 'utf8');
// pokedex.js ist:  /* banner */\n window.POKEDEX = <JSON-Array>;\n
const json = src.slice(src.indexOf('=') + 1, src.lastIndexOf(';')).trim();
const dex = JSON.parse(json);

const species = {};
for (const p of dex) {
  if (!p) continue;                       // Index 0 ist null
  species[p.id] = { id: p.id, name: p.name, types: p.types, base: p.base };
}

const out = path.resolve(__dirname, 'species.json');
fs.writeFileSync(out, JSON.stringify(species));
console.log(`species.json geschrieben: ${Object.keys(species).length} Spezies (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
