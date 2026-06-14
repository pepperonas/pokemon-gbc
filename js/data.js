'use strict';
/**
 * data.js — Bereitstellen der 151 Gen-1-Pokémon (offline-fähig).
 *
 * - Standard: gebündelter Pokédex aus js/pokedex.js (window.POKEDEX) inkl.
 *   lokaler Sprite-Pfade (assets/sprites/<id>f.png / <id>b.png). Damit läuft
 *   das Spiel komplett ohne Netzwerk — auch wenn pokeapi.co / GitHub down sind.
 *   Das Bundle wird per `node tools/fetch-pokedex.js` neu generiert.
 * - Fallback (falls Bundle fehlt): localStorage-Cache einer früheren Online-
 *   Erstladung, sonst Live-Abfrage der PokeAPI (Sprites dann per Remote-URL).
 * - Sprites werden zur Laufzeit lazy als Image geladen (kein Base64-Cache).
 * - Deutsche Namen sind hart kodiert (erspart 151 zusätzliche species-Requests).
 * - Movesets: kuratierter, typgerechter Move-Pool (Gen-1-Werte, kleine
 *   Abkürzungen sind kommentiert) statt 151 weiterer API-Abfragen.
 */
const Data = (() => {

  const CACHE_KEY = 'pkmn_data_v1';
  const COUNT     = 151;
  const API       = 'https://pokeapi.co/api/v2/pokemon/';

  // Deutsche Namen für #001–#151 (Index = id - 1)
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

  // Typ-Übersetzung & Farbe (für Platzhalter-Sprites + Pokédex)
  const TYPE_DE = {
    normal: 'NORMAL', fire: 'FEUER', water: 'WASSER', grass: 'PFLANZE',
    electric: 'ELEKTRO', ice: 'EIS', fighting: 'KAMPF', poison: 'GIFT',
    ground: 'BODEN', flying: 'FLUG', psychic: 'PSYCHO', bug: 'KAEFER',
    rock: 'GESTEIN', ghost: 'GEIST', dragon: 'DRACHE',
  };
  const TYPE_COLORS = {
    normal: '#a8a878', fire: '#f08030', water: '#6890f0', grass: '#78c850',
    electric: '#f8d030', ice: '#98d8d8', fighting: '#c03028', poison: '#a040a0',
    ground: '#e0c068', flying: '#a890f0', psychic: '#f85888', bug: '#a8b820',
    rock: '#b8a038', ghost: '#705898', dragon: '#7038f8',
  };

  // (Move-Pool & movesFor leben jetzt in js/battle-core.js — eine Quelle der
  //  Wahrheit für Solo UND den PvP-Server. Data.movesFor delegiert dorthin.)

  // ------------------------------------------------------------- Items ---
  // Katalog aller Items (Märkte, Kampf- und Beutel-Menü).
  const ITEMS = {
    ball:        { name: 'POKEBALL',   price: 200,  kind: 'ball', mult: 1 },
    greatball:   { name: 'SUPERBALL',  price: 600,  kind: 'ball', mult: 1.5 },
    ultraball:   { name: 'HYPERBALL',  price: 1200, kind: 'ball', mult: 2 },
    masterball:  { name: 'MEISTERBALL', price: 0,   kind: 'ball', mult: 255, guaranteed: true },
    potion:      { name: 'TRANK',      price: 300,  kind: 'heal', amount: 20 },
    superpotion: { name: 'SUPERTRANK', price: 700,  kind: 'heal', amount: 50 },
    hyperpotion: { name: 'HYPERTRANK', price: 1500, kind: 'heal', amount: 200 },
    revive:      { name: 'BELEBER',    price: 1500, kind: 'revive' },
    fullheal:    { name: 'HEILER',     price: 600,  kind: 'cure' },
  };
  const ITEM_ORDER = ['masterball', 'ball', 'greatball', 'ultraball', 'potion', 'superpotion', 'hyperpotion', 'revive', 'fullheal'];
  // Sortiment je Markt-Stufe
  const MART_TIERS = {
    1: ['ball', 'potion'],
    2: ['ball', 'greatball', 'potion', 'superpotion', 'revive'],
    3: ['ball', 'greatball', 'ultraball', 'potion', 'superpotion', 'hyperpotion', 'revive', 'fullheal'],
  };
  // Status-Kürzel für Anzeigen
  const STATUS_DE = { psn: 'GIF', brn: 'BRN', par: 'PAR', frz: 'EIS' };
  const STATUS_COLORS = { psn: '#a040a0', brn: '#f08030', par: '#f8b800', frz: '#5090e8' };

  let pokemon = [];          // 1-basiert: pokemon[1] = Bisasam …
  const imgCache = {};       // url -> { img, ok }

  /** API-Antwort auf das Nötigste eindampfen (klein genug für localStorage). */
  function slim(j) {
    const stats = {};
    for (const s of j.stats) stats[s.stat.name] = s.base_stat;
    // GBC-Look: bevorzugt Gen-2-Crystal-Sprites (56x56, farbig), sonst Default.
    const g2 = (j.sprites.versions && j.sprites.versions['generation-ii'] &&
                j.sprites.versions['generation-ii'].crystal) || {};
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
      front: g2.front_default || j.sprites.front_default,
      back:  g2.back_default  || j.sprites.back_default,
    };
  }

  /**
   * Alle 151 laden — Priorität:
   *   1. Gebündelter Pokédex (js/pokedex.js → window.POKEDEX) inkl. lokaler
   *      Sprite-Pfade: voll offline-fähig, kein Netzwerk nötig.
   *   2. localStorage-Cache (frühere Online-Erstladung, alte Spielstände).
   *   3. Fallback: PokeAPI live abfragen (8 parallele Worker + Fortschritt).
   */
  async function load(onProgress) {
    // 1) Gebündelte Daten — bevorzugt (auch wenn die API down ist)
    if (typeof window !== 'undefined' && Array.isArray(window.POKEDEX) && window.POKEDEX[COUNT]) {
      pokemon = window.POKEDEX;
      onProgress(1);
      return;
    }
    // 2) localStorage-Cache
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const arr = JSON.parse(cached);
        if (Array.isArray(arr) && arr[COUNT]) { pokemon = arr; onProgress(1); return; }
      }
    } catch (e) { /* defekter Cache -> neu laden */ }

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
            out[id] = slim(await r.json());
            ok = true;
          } catch (e) {
            await new Promise(res => setTimeout(res, 500 * (attempt + 1)));
          }
        }
        if (!ok) throw new Error('Pokémon #' + id + ' konnte nicht geladen werden.');
        done++;
        onProgress(done / COUNT);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    pokemon = out;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(out)); }
    catch (e) { console.warn('Cache konnte nicht gespeichert werden:', e); }
  }

  /**
   * Typgerechtes Moveset (max. 4) — delegiert an BattleCore.movesFor
   * (eine Quelle der Wahrheit für Solo UND den PvP-Server).
   */
  function movesFor(species, level = 50) {
    return BattleCore.movesFor(species, level);
  }

  /**
   * Alte GB/GBC-Sprites haben einen opak-weißen Hintergrund. Flood-Fill von
   * allen Randpixeln entfernt nur den zusammenhängenden Hintergrund —
   * Weiß IM Sprite (z. B. Bauch) bleibt erhalten.
   */
  function makeTransparent(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    try {
      const d = g.getImageData(0, 0, c.width, c.height);
      const { data, width: w, height: h } = d;
      const isBg = i => data[i + 3] > 0 && data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235;
      const stack = [];
      for (let x = 0; x < w; x++) { stack.push(x, x + (h - 1) * w); }
      for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
      const seen = new Uint8Array(w * h);
      while (stack.length) {
        const p = stack.pop();
        if (seen[p]) continue;
        seen[p] = 1;
        if (!isBg(p * 4)) continue;
        data[p * 4 + 3] = 0;
        const x = p % w, y = (p / w) | 0;
        if (x > 0) stack.push(p - 1);
        if (x < w - 1) stack.push(p + 1);
        if (y > 0) stack.push(p - w);
        if (y < h - 1) stack.push(p + w);
      }
      g.putImageData(d, 0, 0);
      return c;
    } catch (e) { return img; } // CORS-Fallback: Original verwenden
  }

  /** Sprite-Image holen (lazy). Liefert null, solange nicht geladen. */
  function sprite(url) {
    if (!url) return null;
    let entry = imgCache[url];
    if (!entry) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      entry = imgCache[url] = { img, ok: false };
      img.onload = () => { entry.img = makeTransparent(img); entry.ok = true; };
      img.src = url;
    }
    return entry.ok ? entry.img : null;
  }

  /** Platzhalter, falls ein Sprite fehlt/noch lädt: Kreis in Primärtyp-Farbe. */
  function drawPlaceholder(ctx, species, x, y, size) {
    ctx.fillStyle = TYPE_COLORS[species.types[0]] || '#a8a878';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#202020';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('?', x + size / 2, y + size / 2 + 3);
    ctx.textAlign = 'left';
  }

  return {
    load, movesFor, sprite, drawPlaceholder,
    TYPE_DE, TYPE_COLORS, COUNT,
    ITEMS, ITEM_ORDER, MART_TIERS, STATUS_DE, STATUS_COLORS,
    get pokemon() { return pokemon; },
    byId(id) { return pokemon[id]; },
  };
})();
