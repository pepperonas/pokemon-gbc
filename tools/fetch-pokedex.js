'use strict';
/**
 * tools/fetch-pokedex.js — Einmaliger Generator: lädt alle 151 Gen-1-Pokémon
 * von der PokeAPI + die zugehörigen Sprites und bündelt sie INS PROJEKT, damit
 * das Spiel komplett offline läuft (auch wenn pokeapi.co / GitHub down sind).
 *
 * Erzeugt:
 *   js/pokedex.js          window.POKEDEX = [null, {…#001}, …, {…#151}]
 *   assets/sprites/<id>f.png  Front-Sprite (Gen-2-Crystal, sonst Default)
 *   assets/sprites/<id>b.png  Back-Sprite
 *
 * Die `slim()`-Logik ist 1:1 zu js/data.js gehalten, nur dass die Sprite-URLs
 * auf die lokal gespeicherten Pfade umgeschrieben werden.
 *
 * Aufruf:  node tools/fetch-pokedex.js   (benötigt Node 18+ mit global fetch)
 */
const fs = require('fs');
const path = require('path');

const COUNT = 151;
const API = 'https://pokeapi.co/api/v2/pokemon/';
const ROOT = path.resolve(__dirname, '..');
const SPRITE_DIR = path.join(ROOT, 'assets', 'sprites');

// Deutsche Namen — identisch zu js/data.js (Index = id - 1)
const GERMAN_NAMES = [
  'Bisasam','Bisaknosp','Bisaflor','Glumanda','Glutexo','Glurak','Schiggy','Schillok','Turtok','Raupy',
  'Safcon','Smettbo','Hornliu','Kokuna','Bibor','Taubsi','Tauboga','Tauboss','Rattfratz','Rattikarl',
  'Habitak','Ibitak','Rettan','Arbok','Pikachu','Raichu','Sandan','Sandamer','Nidoran W','Nidorina',
  'Nidoqueen','Nidoran M','Nidorino','Nidoking','Piepi','Pixi','Vulpix','Vulnona','Pummeluff','Knuddeluff',
  'Zubat','Golbat','Myrapla','Duflor','Giflor','Paras','Parasek','Bluzuk','Omot','Digda',
  'Digdri','Mauzi','Snobilikat','Enton','Entoron','Menki','Rasaff','Fukano','Arkani','Quapsel',
  'Quaputzi','Quappo','Abra','Kadabra','Simsala','Machollo','Maschock','Machomei','Knofensa','Ultrigaria',
  'Sarzenia','Tentacha','Tentoxa','Kleinstein','Georok','Geowaz','Ponita','Gallopa','Flegmon','Lahmus',
  'Magnetilo','Magneton','Porenta','Dodu','Dodri','Jurob','Jugong','Sleima','Sleimok','Muschas',
  'Austos','Nebulak','Alpollo','Gengar','Onix','Traumato','Hypno','Krabby','Kingler','Voltobal',
  'Lektrobal','Owei','Kokowei','Tragosso','Knogga','Kicklee','Nockchan','Schlurp','Smogon','Smogmog',
  'Rihorn','Rizeros','Chaneira','Tangela','Kangama','Seeper','Seemon','Goldini','Golking','Sterndu',
  'Starmie','Pantimos','Sichlor','Rossana','Elektek','Magmar','Pinsir','Tauros','Karpador','Garados',
  'Lapras','Ditto','Evoli','Aquana','Blitza','Flamara','Porygon','Amonitas','Amoroso','Kabuto',
  'Kabutops','Aerodactyl','Relaxo','Arktos','Zapdos','Lavados','Dratini','Dragonir','Dragoran','Mewtu',
  'Mew',
];

async function downloadSprite(url, destFile) {
  if (!url) return false;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Sprite HTTP ' + r.status + ' @ ' + url);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(destFile, buf);
  return true;
}

/** Wie js/data.js, aber Sprite-URLs werden auf lokale Pfade umgeschrieben. */
async function slim(j) {
  const stats = {};
  for (const s of j.stats) stats[s.stat.name] = s.base_stat;
  const g2 = (j.sprites.versions && j.sprites.versions['generation-ii'] &&
              j.sprites.versions['generation-ii'].crystal) || {};
  const frontUrl = g2.front_default || j.sprites.front_default;
  const backUrl  = g2.back_default  || j.sprites.back_default;

  const front = frontUrl ? `assets/sprites/${j.id}f.png` : null;
  const back  = backUrl  ? `assets/sprites/${j.id}b.png` : null;
  if (frontUrl) await downloadSprite(frontUrl, path.join(SPRITE_DIR, `${j.id}f.png`));
  if (backUrl)  await downloadSprite(backUrl,  path.join(SPRITE_DIR, `${j.id}b.png`));

  return {
    id: j.id,
    name: GERMAN_NAMES[j.id - 1] || j.name.toUpperCase(),
    types: j.types.map(t => t.type.name),
    base: {
      hp:  stats['hp'],             atk: stats['attack'],
      def: stats['defense'],        spa: stats['special-attack'],
      spd: stats['special-defense'], spe: stats['speed'],
    },
    baseExp: j.base_experience || 64,
    front, back,
  };
}

async function main() {
  fs.mkdirSync(SPRITE_DIR, { recursive: true });
  const out = new Array(COUNT + 1).fill(null);
  const queue = Array.from({ length: COUNT }, (_, i) => i + 1);
  let done = 0;

  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          const r = await fetch(API + id);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          out[id] = await slim(await r.json());
          ok = true;
        } catch (e) {
          process.stderr.write(`#${id} Versuch ${attempt + 1} fehlgeschlagen: ${e.message}\n`);
          await new Promise(res => setTimeout(res, 600 * (attempt + 1)));
        }
      }
      if (!ok) throw new Error('Pokémon #' + id + ' konnte nicht geladen werden.');
      done++;
      process.stdout.write(`\r${done}/${COUNT} geladen…`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  process.stdout.write('\n');

  const banner = '/* AUTO-GENERIERT von tools/fetch-pokedex.js — nicht von Hand bearbeiten. */\n';
  const js = banner + 'window.POKEDEX = ' + JSON.stringify(out) + ';\n';
  fs.writeFileSync(path.join(ROOT, 'js', 'pokedex.js'), js);
  console.log(`js/pokedex.js geschrieben (${(js.length / 1024).toFixed(1)} KB)`);
  const files = fs.readdirSync(SPRITE_DIR).filter(f => f.endsWith('.png'));
  console.log(`assets/sprites/: ${files.length} PNGs`);
}

main().catch(e => { console.error('\nFEHLER:', e); process.exit(1); });
