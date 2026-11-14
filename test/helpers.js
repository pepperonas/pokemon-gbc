'use strict';
// Gemeinsame Test-Helfer: Pokédex aus js/pokedex.js lesen (ohne `window`)
// und Kampf-Mons ohne Zufall bauen.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadDex() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'pokedex.js'), 'utf8');
  return JSON.parse(src.slice(src.indexOf('=') + 1, src.lastIndexOf(';')).trim());
}

/** RNG, die eine feste Liste abspielt (und danach den letzten Wert wiederholt). */
function seq(...vals) {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
}

module.exports = { ROOT, loadDex, seq };
