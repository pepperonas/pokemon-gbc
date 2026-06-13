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

  /**
   * Kuratierter Move-Pool pro Typ (Gen-1-Power/Accuracy) mit Lern-Level `l`
   * und optionalem Status-Nebeneffekt `fx: { s: psn|brn|par|frz, c: %Chance }`
   * (Gen-1-nahe Werte: Bodyslam 30% PAR, Lecker 30% PAR, Feuer 10% BRN …).
   * Abkürzungen: kein PP-System, "Nachtnebel" & "Drachenwut" (eigentlich
   * Fix-Schaden) sind hier als normale Power-Moves vereinfacht.
   */
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

  // ------------------------------------------------------------- Items ---
  // Katalog aller Items (Märkte, Kampf- und Beutel-Menü).
  const ITEMS = {
    ball:        { name: 'POKEBALL',   price: 200,  kind: 'ball', mult: 1 },
    greatball:   { name: 'SUPERBALL',  price: 600,  kind: 'ball', mult: 1.5 },
    ultraball:   { name: 'HYPERBALL',  price: 1200, kind: 'ball', mult: 2 },
    potion:      { name: 'TRANK',      price: 300,  kind: 'heal', amount: 20 },
    superpotion: { name: 'SUPERTRANK', price: 700,  kind: 'heal', amount: 50 },
    hyperpotion: { name: 'HYPERTRANK', price: 1500, kind: 'heal', amount: 200 },
    revive:      { name: 'BELEBER',    price: 1500, kind: 'revive' },
    fullheal:    { name: 'HEILER',     price: 600,  kind: 'cure' },
  };
  const ITEM_ORDER = ['ball', 'greatball', 'ultraball', 'potion', 'superpotion', 'hyperpotion', 'revive', 'fullheal'];
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
   * Typgerechtes Moveset (max. 4) für eine Spezies auf gegebenem Level:
   * Es zählen nur Attacken mit Lern-Level <= level; davon die stärksten.
   * Mono-Typ: 3 Typ-Moves + Tackle · Dual-Typ: je 2 Moves pro Typ.
   */
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
