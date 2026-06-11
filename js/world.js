'use strict';
/**
 * world.js — Tile-basierte Overworld mit kompletter Spielwelt:
 *
 *   KIEFERNDORF (Start) → ROUTE 1 → WALDDORF → ROUTE 2 → FELSGROTTE →
 *   STEINSTADT (Arena 1: ROCKO) → ROUTE 3 → KUESTENDORF (Arena 2: MISTY) →
 *   SIEGESWEG (Tor: 2 Orden) → POKEMON-LIGA (Champion)
 *
 * Dazu: Trainerkämpfe, Orden-Tore, legendäre Statik-Begegnungen
 * (Arktos/Zapdos/Lavados/Mewtu/Mew), Zonen-Encountertabellen mit festen
 * Level-Bereichen, Heilhäuser mit Respawn-Punkt.
 *
 * Alle Tiles & Charakter-Sprites werden prozedural gezeichnet (keine externen
 * Assets) — das hält das Projekt komplett offline-fähig bis auf PokeAPI.
 */
const World = (() => {

  const TILE = 16;
  const W = 72, H = 60;          // Kartengröße in Tiles

  // Tile-IDs
  const T = { GRASS: 0, TALL: 1, PATH: 2, TREE: 3, WATER: 4, WALL: 5, ROOF: 6, DOOR: 7, WINDOW: 8, SIGN: 9, FENCE: 10, FLOWER: 11, CAVE: 12, ROCK: 13 };
  const SOLID = new Set([T.TREE, T.WATER, T.WALL, T.ROOF, T.WINDOW, T.SIGN, T.FENCE, T.ROCK]);

  const map = new Uint8Array(W * H);
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T.TREE : map[y * W + x];
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) map[y * W + x] = t; };
  const rect = (x, y, w, h, t) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, t); };

  // Schilder & Türen (keyed "x,y")
  const signs = {};
  const doors = {};

  /** Haus platzieren: 2 Reihen Dach, Wände, Tür unten mittig, 2 Fenster. */
  function house(x, y, w, h, doorAction) {
    rect(x, y, w, 2, T.ROOF);
    rect(x, y + 2, w, h - 2, T.WALL);
    const dx = x + Math.floor(w / 2), dy = y + h - 1;
    set(dx, dy, T.DOOR);
    set(x + 1, y + h - 1, T.WINDOW);
    set(x + w - 2, y + h - 1, T.WINDOW);
    doors[dx + ',' + dy] = doorAction;
  }

  // --------------------------------------------------------- Karte bauen ---
  function buildMap() {
    rect(0, 0, W, H, T.GRASS);
    // Außenrand (2 Tiles Bäume)
    rect(0, 0, W, 2, T.TREE); rect(0, H - 2, W, 2, T.TREE);
    rect(0, 0, 2, H, T.TREE); rect(W - 2, 0, 2, H, T.TREE);
    // Trennwand West-Korridor <-> Ostwelt (Durchgang nur über Walddorf)
    rect(22, 2, 2, H - 4, T.TREE);

    // ===== WEST-KORRIDOR (identisch zu v1 — alte Spielstände bleiben gültig) =====
    rect(11, 2, 2, H - 4, T.PATH);          // Hauptweg Nord-Süd

    // --- Startdorf KIEFERNDORF (Süden) ---
    rect(3, 45, 18, 1, T.FENCE); set(11, 45, T.PATH); set(12, 45, T.PATH);
    house(4, 47, 5, 4, { kind: 'home' });
    house(15, 47, 6, 4, { kind: 'heal', label: 'POKE-LABOR' });
    set(13, 53, T.SIGN);
    signs['13,53'] = 'KIEFERNDORF - Wo dein Abenteuer beginnt!';
    rect(5, 53, 3, 2, T.FLOWER); rect(17, 53, 3, 2, T.FLOWER);

    // --- Route 1 (Mitte) ---
    rect(3, 36, 6, 5, T.TALL);
    rect(14, 28, 7, 5, T.TALL);
    rect(4, 17, 6, 5, T.TALL);
    rect(15, 13, 6, 4, T.TALL);
    rect(17, 21, 4, 3, T.WATER);            // kleiner Teich
    set(5, 30, T.TREE); set(6, 30, T.TREE); set(16, 38, T.TREE);
    set(4, 24, T.TREE); set(18, 18, T.TREE); set(7, 12, T.TREE);
    set(13, 42, T.SIGN);
    signs['13,42'] = 'ROUTE 1 - Achtung: Wilde POKEMON im hohen Gras!';

    // --- WALDDORF (Norden) ---
    rect(3, 11, 18, 1, T.FENCE); set(11, 11, T.PATH); set(12, 11, T.PATH);
    house(4, 3, 5, 4, { kind: 'msg', text: 'Im Osten fuehrt ein Weg zur ROUTE 2!' });
    house(15, 3, 6, 4, { kind: 'heal', label: 'POKE-STATION' });
    rect(5, 8, 2, 2, T.FLOWER);
    // Ost-Ausgang Richtung Route 2 (durchbricht die Trennwand)
    rect(13, 8, 15, 2, T.PATH);
    set(13, 8, T.SIGN);
    signs['13,8'] = 'WALDDORF - Heilung im Haus rechts! Osten: ROUTE 2';

    // ===== ROUTE 2 (Osten von Walddorf) =====
    rect(24, 14, 18, 1, T.TREE);            // Südwand der Route
    rect(24, 8, 18, 2, T.PATH);             // Hauptweg Ost-West
    rect(26, 3, 6, 4, T.TALL);
    rect(36, 3, 5, 4, T.TALL);
    rect(33, 11, 6, 3, T.TALL);
    rect(25, 11, 4, 3, T.TALL);
    set(26, 7, T.SIGN);
    signs['26,7'] = 'ROUTE 2 - Im Osten: Die FELSGROTTE!';

    // ===== FELSGROTTE (Höhle) =====
    rect(42, 2, 16, 16, T.ROCK);
    rect(42, 8, 6, 2, T.CAVE);              // Eingang West
    rect(46, 4, 2, 6, T.CAVE);              // Gang nach Norden
    rect(46, 4, 8, 2, T.CAVE);              // Gang nach Osten
    rect(52, 4, 2, 10, T.CAVE);             // Gang nach Sueden
    rect(46, 12, 8, 2, T.CAVE);             // unterer Quergang
    rect(43, 12, 3, 2, T.CAVE);             // Nische (ARKTOS)
    rect(54, 12, 3, 3, T.CAVE);             // verborgene Kammer (MEWTU)
    rect(50, 14, 2, 4, T.CAVE);             // Suedausgang

    // ===== STEINSTADT (Arena 1) =====
    rect(50, 18, 2, 3, T.PATH);             // Weg vom Grotten-Suedausgang
    rect(29, 20, 23, 2, T.PATH);            // Hauptweg nach Westen
    rect(29, 22, 2, 8, T.PATH);             // Weg ins Dorf
    rect(25, 29, 14, 2, T.PATH);            // Dorfplatz
    house(24, 23, 5, 4, { kind: 'heal', label: 'POKE-CENTER' });
    house(33, 23, 7, 6, { kind: 'arena', key: 'rocko' });
    set(26, 27, T.PATH); set(26, 28, T.PATH);
    set(39, 29, T.SIGN);
    signs['39,29'] = 'STEINSTADT - ARENA von ROCKO (GESTEIN)';

    // ===== ROUTE 3 (Sueden von Steinstadt) =====
    rect(29, 31, 2, 12, T.PATH);            // Weg nach Sueden
    rect(29, 42, 39, 2, T.PATH);            // langer Weg nach Osten
    rect(24, 34, 5, 4, T.TALL);
    rect(33, 35, 6, 4, T.TALL);
    rect(25, 40, 4, 2, T.TALL);
    rect(37, 38, 4, 3, T.TALL);
    rect(39, 33, 4, 3, T.WATER);            // Teich
    set(28, 33, T.SIGN);
    signs['28,33'] = 'ROUTE 3 - KUESTENDORF im Suedosten!';

    // ===== KUESTENDORF (Arena 2) =====
    rect(46, 52, 24, 6, T.WATER);           // Meer im Sueden
    rect(55, 44, 2, 6, T.PATH);             // Weg vom Hauptweg ins Dorf
    rect(48, 48, 16, 2, T.PATH);            // Strandpromenade
    house(48, 44, 5, 4, { kind: 'heal', label: 'POKE-CENTER' });
    house(59, 44, 6, 4, { kind: 'arena', key: 'misty' });
    rect(47, 50, 4, 2, T.TALL);             // Strandgras
    rect(60, 50, 4, 2, T.TALL);
    set(57, 50, T.SIGN);
    signs['57,50'] = 'KUESTENDORF - MISTYS ARENA (WASSER)';
    set(64, 49, T.SIGN);
    signs['64,49'] = 'Geruecht: MEW versteckt sich hinter der LIGA im Norden...';

    // ===== SIEGESWEG + POKEMON-LIGA =====
    // Abgrenzung: Zutritt NUR durch das Orden-Tor bei (66/67,36)
    rect(58, 18, 1, 19, T.TREE);            // Westwand (Norden deckt die Grotte ab)
    rect(58, 36, 8, 1, T.TREE);             // Querwand westlich des Tors
    rect(68, 36, 2, 1, T.TREE);             // Querwand oestlich des Tors
    rect(66, 8, 2, 35, T.PATH);             // langer Weg nach Norden
    rect(61, 12, 4, 4, T.TALL);
    rect(61, 24, 4, 4, T.TALL);
    rect(68, 18, 2, 5, T.TALL);
    set(65, 37, T.SIGN);
    signs['65,37'] = 'SIEGESWEG - Zutritt nur mit 2 ORDEN!';
    house(62, 3, 8, 5, { kind: 'liga' });   // LIGA-Gebäude, Tuer bei (66,7)

    // Deko zwischen den Gebieten
    set(44, 25, T.TREE); set(54, 30, T.TREE); set(46, 36, T.TREE);
    set(57, 25, T.TREE); set(43, 31, T.TREE); set(59, 33, T.TREE);
    rect(53, 22, 2, 2, T.FLOWER); rect(45, 39, 2, 2, T.FLOWER);
  }
  buildMap();

  // ------------------------------------------------ Zonen & Begegnungen ---
  // Jede Zone: Name (Banner), optional Encountertabelle + Levelbereich.
  // Tabellen decken zusammen mit Evolutionen + Statics alle 151 Spezies ab.
  // (Bewusste Abweichung: Starter tauchen ultra-selten wild auf, damit der
  // Pokedex komplettierbar ist — kommentiert.)
  const ZONES = [
    { name: 'KIEFERNDORF', x: 2, y: 45, w: 20, h: 13 },
    { name: 'WALDDORF',    x: 2, y: 2,  w: 20, h: 10 },
    { name: 'ROUTE 1',     x: 2, y: 12, w: 20, h: 33, lv: [2, 6], table: [
      [16, 28], [19, 28], [10, 14], [13, 14], [43, 9], [56, 4], [25, 3]] },
    { name: 'FELSGROTTE',  x: 42, y: 2, w: 16, h: 16, lv: [14, 19], cave: true, table: [
      [41, 30], [74, 24], [46, 14], [50, 10], [66, 8], [95, 6], [104, 4], [140, 2], [138, 2], [142, 1]] },
    { name: 'ROUTE 2',     x: 24, y: 2, w: 18, h: 13, lv: [10, 15], table: [
      [21, 22], [29, 14], [32, 14], [23, 12], [27, 10], [35, 8], [63, 7], [58, 5], [37, 4], [39, 4]] },
    { name: 'STEINSTADT',  x: 24, y: 18, w: 17, h: 13 },
    { name: 'SIEGESWEG',   x: 58, y: 2, w: 12, h: 36, lv: [26, 34], table: [
      [128, 12], [111, 12], [84, 10], [83, 10], [107, 8], [106, 8], [114, 8], [77, 6], [115, 6],
      [123, 4], [127, 4], [125, 4], [126, 4], [108, 3], [124, 3], [122, 3], [147, 3], [137, 2],
      [113, 1], [143, 1], [4, 1]] },     // Glumanda wild (selten) fuer den Pokedex
    { name: 'KUESTENDORF', x: 46, y: 38, w: 24, h: 20, lv: [21, 27], table: [
      [72, 20], [98, 16], [129, 14], [118, 10], [116, 10], [90, 8], [86, 6], [79, 6], [92, 4],
      [131, 1], [7, 1]] },               // Schiggy wild (selten)
    { name: 'ROUTE 3',     x: 24, y: 31, w: 22, h: 17, lv: [17, 23], table: [
      [69, 16], [60, 14], [52, 12], [54, 12], [48, 8], [120, 8], [81, 8], [100, 6], [102, 5],
      [88, 5], [109, 5], [96, 4], [133, 3], [132, 2], [1, 1]] },  // Bisasam wild (selten)
  ];
  const zoneAt = (x, y) => ZONES.find(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h);

  const GRASS_RATE = 0.12;   // Chance pro Schritt im hohen Gras
  const CAVE_RATE  = 0.08;   // Chance pro Schritt auf Höhlenboden

  function rollEncounter(zone) {
    const total = zone.table.reduce((s, e) => s + e[1], 0);
    let r = Math.random() * total;
    let pick = zone.table[0][0];
    for (const [id, w] of zone.table) { r -= w; if (r <= 0) { pick = id; break; } }
    const lvl = zone.lv[0] + Math.floor(Math.random() * (zone.lv[1] - zone.lv[0] + 1));
    return Battle.makeMon(pick, lvl);
  }

  // ------------------------------------------------- Charakter-Sprites ---
  // 16x16-Pixelmaps: '.'=transparent O=Outline S=Haut H=Haar C=Shirt L=Hose
  const BODY = {
    down0: [
      '................', '....OOOOOOOO....', '...OHHHHHHHHO...', '..OHHHHHHHHHHO..',
      '..OHHSSSSSSHHO..', '..OSSSSSSSSSSO..', '..OSSOSSSSOSSO..', '..OSSSSSSSSSSO..',
      '...OSSSSSSSSO...', '..OCCCCCCCCCCO..', '.OCSCCCCCCCCSCO.', '.OCSCCCCCCCCSCO.',
      '..OCCCCCCCCCCO..', '...OLLLOOLLLO...', '...OLLO..OLLO...', '...OOO....OOO...'],
    down1: [
      '................', '....OOOOOOOO....', '...OHHHHHHHHO...', '..OHHHHHHHHHHO..',
      '..OHHSSSSSSHHO..', '..OSSSSSSSSSSO..', '..OSSOSSSSOSSO..', '..OSSSSSSSSSSO..',
      '...OSSSSSSSSO...', '..OCCCCCCCCCCO..', '.OCSCCCCCCCCSCO.', '.OCSCCCCCCCCSCO.',
      '..OCCCCCCCCCCO..', '..OLLLO..OLLLO..', '..OLO......OLO..', '..OO........OO..'],
    up0: [
      '................', '....OOOOOOOO....', '...OHHHHHHHHO...', '..OHHHHHHHHHHO..',
      '..OHHHHHHHHHHO..', '..OHHHHHHHHHHO..', '..OHHHHHHHHHHO..', '..OHHHHHHHHHHO..',
      '...OHHHHHHHHO...', '..OCCCCCCCCCCO..', '.OCSCCCCCCCCSCO.', '.OCSCCCCCCCCSCO.',
      '..OCCCCCCCCCCO..', '...OLLLOOLLLO...', '...OLLO..OLLO...', '...OOO....OOO...'],
    up1: [
      '................', '....OOOOOOOO....', '...OHHHHHHHHO...', '..OHHHHHHHHHHO..',
      '..OHHHHHHHHHHO..', '..OHHHHHHHHHHO..', '..OHHHHHHHHHHO..', '..OHHHHHHHHHHO..',
      '...OHHHHHHHHO...', '..OCCCCCCCCCCO..', '.OCSCCCCCCCCSCO.', '.OCSCCCCCCCCSCO.',
      '..OCCCCCCCCCCO..', '..OLLLO..OLLLO..', '..OLO......OLO..', '..OO........OO..'],
    right0: [
      '................', '....OOOOOOOO....', '...OHHHHHHHHO...', '..OHHHHHHHHHHO..',
      '..OHHHHSSSSSO...', '..OHHSSSSSSSSO..', '..OHHSSSSOSSSO..', '..OHHSSSSSSSSO..',
      '...OSSSSSSSSO...', '..OCCCCCCCCCCO..', '..OCCCCCCCSSCO..', '..OCCCCCCCSSCO..',
      '..OCCCCCCCCCCO..', '....OLLLLLLO....', '....OLLOOLLO....', '....OOO..OOO....'],
    right1: [
      '................', '....OOOOOOOO....', '...OHHHHHHHHO...', '..OHHHHHHHHHHO..',
      '..OHHHHSSSSSO...', '..OHHSSSSSSSSO..', '..OHHSSSSOSSSO..', '..OHHSSSSSSSSO..',
      '...OSSSSSSSSO...', '..OCCCCCCCCCCO..', '..OCCCCCCCSSCO..', '..OCCCCCCCSSCO..',
      '..OCCCCCCCCCCO..', '...OLLLLLLO.....', '...OLO...OLLO...', '...OO.....OOO...'],
  };
  BODY.left0 = BODY.right0.map(r => r.split('').reverse().join(''));
  BODY.left1 = BODY.right1.map(r => r.split('').reverse().join(''));

  /** Pixelmap in Offscreen-Canvas rendern (einmalig). */
  function buildSprite(rows, pal) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    rows.forEach((row, y) => {
      for (let x = 0; x < 16; x++) {
        const col = pal[row[x]];
        if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
      }
    });
    return c;
  }
  function buildCharset(shirt, hair) {
    const pal = { O: '#181818', S: '#f8c890', H: hair, C: shirt, L: '#3048a0' };
    const out = {};
    for (const k in BODY) out[k] = buildSprite(BODY[k], pal);
    return out;
  }
  const PLAYER_SPRITES = buildCharset('#d03028', '#583820');
  const NPC_SPRITES    = buildCharset('#288848', '#c8a030');

  // NPCs: Position + Dialog (blockieren das Tile)
  const NPCS = [
    { x: 7,  y: 51, text: 'Im hohen Gras lauern wilde POKEMON. Halte Baelle bereit!' },
    { x: 9,  y: 5,  text: 'Oestlich liegt ROUTE 2 - dahinter die FELSGROTTE und STEINSTADT!' },
    { x: 27, y: 29, text: 'ROCKOs GESTEIN-Pokemon fuerchten WASSER und PFLANZE!' },
    { x: 47, y: 48, text: 'MISTY setzt auf WASSER - ELEKTRO und PFLANZE helfen!' },
    { x: 65, y: 40, text: 'Hinter dem Tor liegt der SIEGESWEG zur POKEMON-LIGA!' },
  ];
  const npcAt = (x, y) => NPCS.find(n => n.x === x && n.y === y);

  // ------------------------------------------------------------ Trainer ---
  // Trainer blockieren ihr Tile, kaempfen einmalig (Flag in player.flags)
  // und geben danach einen Hinweis. Teams: [SpeziesId, Level].
  const TRAINERS = [
    { id: 'bug1', x: 30, y: 7, shirt: '#a8b820', hair: '#383838', name: 'KAEFERSAMMLER KAI',
      intro: 'Meine Kaefer stechen zu!', defeat: 'Auweia, zerquetscht...',
      after: 'Kaefer entwickeln sich schneller als alle anderen!',
      team: [[10, 9], [13, 9], [12, 12]], reward: { balls: 3 } },
    { id: 'kid1', x: 38, y: 10, shirt: '#4890e8', hair: '#c8a030', name: 'YOUNGSTER FINN',
      intro: 'Ich bin der Beste auf ROUTE 2!', defeat: 'Mist, verloren!',
      after: 'In der FELSGROTTE brauchst du WASSER- oder PFLANZEN-Attacken.',
      team: [[19, 10], [21, 11]], reward: { balls: 2 } },
    { id: 'hiker1', x: 49, y: 4, shirt: '#886040', hair: '#583820', name: 'WANDERER BODO',
      intro: 'Meine Steine sind unzerbrechlich!', defeat: 'Zerbroeselt!',
      after: 'In einer Nische tief in der Grotte haust ein eisiger Vogel...',
      team: [[74, 15], [74, 16], [95, 17]], reward: { potions: 2 } },
    { id: 'beauty1', x: 32, y: 37, shirt: '#e87890', hair: '#a06030', name: 'SCHOENHEIT LENA',
      intro: 'Meine Pokemon sind zauberhaft!', defeat: 'Wie unhoeflich!',
      after: 'KUESTENDORF liegt im Suedosten - folge dem Weg!',
      team: [[37, 18], [39, 18]], reward: { balls: 3 } },
    { id: 'angler1', x: 40, y: 36, shirt: '#4890e8', hair: '#383838', name: 'ANGLER UDO',
      intro: 'KARPADOR ist staerker als sein Ruf!', defeat: 'Platsch...',
      after: 'Aus KARPADOR wird mit Geduld ein maechtiger GARADOS!',
      team: [[129, 15], [129, 17], [130, 21]], reward: { balls: 3 } },
    { id: 'angler2', x: 53, y: 50, shirt: '#287888', hair: '#c8a030', name: 'ANGLER JENS',
      intro: 'Frisch vom Meer!', defeat: 'Ins Wasser gefallen!',
      after: 'Am Strand schwimmen seltene Pokemon - sogar LAPRAS!',
      team: [[72, 22], [98, 23]], reward: { potions: 2 } },
    { id: 'vet1', x: 65, y: 18, shirt: '#806048', hair: '#888888', name: 'VETERAN ROLF',
      intro: 'Nur die Besten erreichen die LIGA!', defeat: 'Respekt!',
      after: 'Der CHAMP wartet am Ende des Weges. Sei vorbereitet!',
      team: [[111, 30], [59, 31]], reward: { potions: 3 } },
    { id: 'belt1', x: 68, y: 28, shirt: '#282828', hair: '#181818', name: 'SCHWARZGURT KOJI',
      intro: 'HIIIYA! Spuere meine Faeuste!', defeat: 'Eine ehrenvolle Niederlage.',
      after: 'Dein Team ist bereit fuer die LIGA!',
      team: [[67, 30], [106, 31], [107, 31]], reward: { balls: 5 } },
  ];
  for (const tr of TRAINERS) tr.sprites = buildCharset(tr.shirt, tr.hair);
  const trainerAt = (x, y) => TRAINERS.find(t => t.x === x && t.y === y);

  // Arenaleiter (per Arena-Tuer) und Champion (LIGA-Tuer)
  const ARENAS = {
    rocko: { name: 'ARENALEITER ROCKO', intro: 'Meine Felsen kennen kein Erbarmen!',
      defeat: 'Dein Wille ist haerter als Stein!', team: [[74, 16], [95, 18]],
      reward: { balls: 5, potions: 3, badge: 1, badgeName: 'FELSORDEN' } },
    misty: { name: 'ARENALEITERIN MISTY', intro: 'Meine Wasser-Pokemon spuelen dich fort!',
      defeat: 'Du bist eine grosse Welle!', team: [[120, 24], [121, 28]],
      reward: { balls: 5, potions: 3, badge: 2, badgeName: 'QUELLORDEN' } },
  };
  const CHAMPION = { name: 'CHAMP SIEGFRIED',
    intro: 'Ich bin der Champion der POKEMON-LIGA! Zeig mir deine Staerke!',
    defeat: 'Unglaublich! Du bist wuerdig. Die LIGA gehoert dir!',
    team: [[18, 38], [130, 40], [65, 41], [112, 41], [149, 44]],
    reward: { balls: 10, potions: 5 } };

  // ------------------------------------------- Legendäre Statik-Begegnungen ---
  // Bleiben stehen, bis sie GEFANGEN wurden (K.O./Flucht: erneut versuchbar).
  // Mewtu erscheint erst nach dem Champion-Sieg.
  const STATICS = [
    { key: 'arktos',  id: 144, level: 50, x: 43, y: 12 },
    { key: 'zapdos',  id: 145, level: 50, x: 40, y: 3 },
    { key: 'lavados', id: 146, level: 50, x: 69, y: 16 },
    { key: 'mewtu',   id: 150, level: 70, x: 56, y: 13, needs: 'champion' },
    { key: 'mew',     id: 151, level: 30, x: 68, y: 2 },
  ];
  const staticActive = s => !Game.player.flags['s_' + s.key] && (!s.needs || Game.player.flags[s.needs]);
  const staticAt = (x, y) => STATICS.find(s => s.x === x && s.y === y && staticActive(s));

  // Tore: blockieren, bis Bedingung erfüllt ist
  const GATES = [
    { x: 66, y: 36, open: p => (p.badges || 0) >= 2, text: 'Waechter: Nur Trainer mit 2 ORDEN duerfen den SIEGESWEG betreten!' },
    { x: 67, y: 36, open: p => (p.badges || 0) >= 2, text: 'Waechter: Nur Trainer mit 2 ORDEN duerfen den SIEGESWEG betreten!' },
    { x: 54, y: 12, open: p => !!p.flags.champion, text: 'Eine mysterioese Kraft blockiert den Weg... (Besiege erst den CHAMP!)' },
    { x: 54, y: 13, open: p => !!p.flags.champion, text: 'Eine mysterioese Kraft blockiert den Weg... (Besiege erst den CHAMP!)' },
  ];
  const gateAt = (x, y) => GATES.find(g => g.x === x && g.y === y && !g.open(Game.player));

  // ------------------------------------------------------- Tile-Renderer ---
  function drawTile(ctx, t, x, y, anim) {
    // Untergrund
    ctx.fillStyle = '#88c878'; ctx.fillRect(x, y, 16, 16);
    ctx.fillStyle = '#78b868';
    ctx.fillRect(x + 3, y + 5, 2, 2); ctx.fillRect(x + 11, y + 11, 2, 2);

    switch (t) {
      case T.TALL:
        ctx.fillStyle = '#309850';
        for (let i = 0; i < 4; i++) {
          const tx = x + 1 + i * 4;
          ctx.fillRect(tx, y + 6, 2, 9);
          ctx.fillRect(tx + 1, y + 3, 1, 4);
        }
        ctx.fillStyle = '#207840';
        ctx.fillRect(x + 3, y + 9, 1, 6); ctx.fillRect(x + 11, y + 8, 1, 7);
        break;
      case T.PATH:
        ctx.fillStyle = '#e8d8a0'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = '#d0b878';
        ctx.fillRect(x + 4, y + 4, 2, 2); ctx.fillRect(x + 10, y + 10, 2, 2);
        break;
      case T.TREE:
        ctx.fillStyle = '#885030'; ctx.fillRect(x + 6, y + 10, 4, 6);
        ctx.fillStyle = '#287840';
        ctx.fillRect(x + 2, y + 4, 12, 8);
        ctx.fillRect(x + 4, y + 1, 8, 4);
        ctx.fillStyle = '#389858';
        ctx.fillRect(x + 4, y + 2, 4, 2); ctx.fillRect(x + 3, y + 6, 3, 3);
        break;
      case T.WATER: {
        ctx.fillStyle = '#5090e8'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = '#80b8f8';
        const off = anim % 2 === 0 ? 0 : 2;
        ctx.fillRect(x + 2 + off, y + 4, 5, 1); ctx.fillRect(x + 8 - off, y + 11, 5, 1);
        break;
      }
      case T.WALL:
        ctx.fillStyle = '#e8d8b8'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = '#c8b090';
        ctx.fillRect(x, y + 5, 16, 1); ctx.fillRect(x, y + 11, 16, 1);
        ctx.fillRect(x + 8, y, 1, 5); ctx.fillRect(x + 4, y + 6, 1, 5); ctx.fillRect(x + 12, y + 6, 1, 5);
        break;
      case T.ROOF:
        ctx.fillStyle = '#d04848'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = '#a83030';
        ctx.fillRect(x, y + 4, 16, 1); ctx.fillRect(x, y + 9, 16, 1); ctx.fillRect(x, y + 14, 16, 1);
        break;
      case T.DOOR:
        ctx.fillStyle = '#e8d8b8'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = '#583018'; ctx.fillRect(x + 3, y + 2, 10, 14);
        ctx.fillStyle = '#f8d030'; ctx.fillRect(x + 10, y + 9, 2, 2);
        break;
      case T.WINDOW:
        ctx.fillStyle = '#e8d8b8'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = '#181818'; ctx.fillRect(x + 3, y + 3, 10, 8);
        ctx.fillStyle = '#88c0e8'; ctx.fillRect(x + 4, y + 4, 8, 6);
        break;
      case T.SIGN:
        ctx.fillStyle = '#885030'; ctx.fillRect(x + 7, y + 8, 2, 7);
        ctx.fillStyle = '#c8a868'; ctx.fillRect(x + 2, y + 2, 12, 7);
        ctx.fillStyle = '#181818';
        ctx.fillRect(x + 4, y + 4, 8, 1); ctx.fillRect(x + 4, y + 6, 6, 1);
        break;
      case T.FENCE:
        ctx.fillStyle = '#c8a868';
        ctx.fillRect(x + 2, y + 4, 3, 10); ctx.fillRect(x + 10, y + 4, 3, 10);
        ctx.fillRect(x, y + 6, 16, 2);
        break;
      case T.FLOWER: {
        const c = anim % 2 === 0 ? '#e03028' : '#f8d030';
        ctx.fillStyle = c;
        ctx.fillRect(x + 3, y + 3, 3, 3); ctx.fillRect(x + 10, y + 9, 3, 3);
        ctx.fillStyle = '#f8f8f8';
        ctx.fillRect(x + 4, y + 4, 1, 1); ctx.fillRect(x + 11, y + 10, 1, 1);
        break;
      }
      case T.CAVE:
        ctx.fillStyle = '#6a5a50'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = '#5a4c42';
        ctx.fillRect(x + 2, y + 3, 3, 2); ctx.fillRect(x + 10, y + 8, 3, 2);
        ctx.fillRect(x + 5, y + 12, 2, 2);
        break;
      case T.ROCK:
        ctx.fillStyle = '#3a322c'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = '#4c423a';
        ctx.fillRect(x + 1, y + 1, 6, 6); ctx.fillRect(x + 9, y + 3, 6, 5);
        ctx.fillRect(x + 3, y + 9, 5, 5); ctx.fillRect(x + 10, y + 10, 5, 4);
        ctx.fillStyle = '#28221d';
        ctx.fillRect(x, y + 15, 16, 1); ctx.fillRect(x + 15, y, 1, 16);
        break;
    }
  }

  // -------------------------------------------------------- WorldScreen ---
  class WorldScreen {
    constructor() {
      const p = Game.player;
      this.x = p.x; this.y = p.y;          // Tile-Position
      this.dir = p.dir || 'up';
      this.moving = false;
      this.progress = 0;                    // 0..1 zwischen Tiles
      this.tx = this.x; this.ty = this.y;   // Ziel-Tile
      this.frame = 0;
      this.time = 0;
      this.msg = null;                      // aktive Textbox
      this.transition = 0;                  // Kampf-Überblendung
      this.pendingBattle = null;            // { opts, after }
      this.banner = null;                   // Gebiets-Banner { text, t }
      const z = zoneAt(this.x, this.y);
      this.zoneName = z ? z.name : null;
    }

    isBlocked(x, y) {
      if (SOLID.has(get(x, y))) return true;
      if (npcAt(x, y) || trainerAt(x, y) || staticAt(x, y)) return true;
      if (gateAt(x, y)) return true;
      return false;
    }

    tryMove(dir) {
      this.dir = dir;
      const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
      const nx = this.x + d[0], ny = this.y + d[1];
      const gate = gateAt(nx, ny);
      if (gate) { this.msg = gate.text; return; }
      if (this.isBlocked(nx, ny)) return;
      this.tx = nx; this.ty = ny;
      this.moving = true; this.progress = 0;
    }

    /** Wird beim Erreichen eines Tiles aufgerufen (Tür/Gras-Checks). */
    arrived() {
      this.x = this.tx; this.y = this.ty;
      Game.player.x = this.x; Game.player.y = this.y; Game.player.dir = this.dir;
      const t = get(this.x, this.y);

      // Gebiets-Banner bei Zonenwechsel
      const z = zoneAt(this.x, this.y);
      if (z && z.name !== this.zoneName) {
        this.zoneName = z.name;
        this.banner = { text: z.name, t: 1400 };
      }

      const door = doors[this.x + ',' + this.y];
      if (t === T.DOOR && door) {
        if (door.kind === 'heal') {
          for (const m of Game.player.party) m.hp = m.stats.hp;
          Game.player.balls = Math.max(Game.player.balls, 10);
          Game.player.potions = Math.max(Game.player.potions || 0, 5);
          Game.player.respawn = { x: this.x, y: this.y };   // neuer Respawn-Punkt
          Game.save();
          this.msg = `${door.label}: Team geheilt! Baelle (${Game.player.balls}) und Traenke (${Game.player.potions}) aufgefuellt.`;
        } else if (door.kind === 'home') {
          this.msg = 'Dein Zuhause. Aber das Abenteuer wartet draussen!';
        } else if (door.kind === 'arena') {
          this.enterArena(door.key);
        } else if (door.kind === 'liga') {
          this.enterLiga();
        } else this.msg = door.text;
        return;
      }

      // Zufallsbegegnung (hohes Gras / Höhlenboden)
      if (z && z.table) {
        const rate = t === T.TALL ? GRASS_RATE : (t === T.CAVE && z.cave ? CAVE_RATE : 0);
        if (rate > 0 && Math.random() < rate) {
          this.pendingBattle = { opts: rollEncounter(z), after: null };
          this.transition = 700;   // ms Flacker-Überblendung
        }
      }
    }

    enterArena(key) {
      const a = ARENAS[key];
      if (Game.player.flags['arena_' + key]) {
        this.msg = `${a.name} wurde bereits besiegt! Dein ${a.reward.badgeName} glaenzt.`;
        return;
      }
      this.startTrainer(a, 'arena_' + key);
    }

    enterLiga() {
      if ((Game.player.badges || 0) < 2) {
        this.msg = 'POKEMON-LIGA: Nur Trainer mit 2 ORDEN duerfen eintreten!';
        return;
      }
      if (Game.player.flags.champion) {
        this.msg = 'Du bist der CHAMP! Die LIGA verneigt sich vor dir.';
        return;
      }
      this.startTrainer(CHAMPION, 'champion', () => {
        this.msg = 'GLUECKWUNSCH! Du bist der neue CHAMP! In der FELSGROTTE regt sich etwas Mysterioeses...';
      });
    }

    /** Trainerkampf vorbereiten (Team-Instanzen frisch erzeugen). */
    startTrainer(def, flagKey, onWin) {
      const team = def.team.map(([id, lvl]) => Battle.makeMon(id, lvl));
      this.pendingBattle = {
        opts: { trainer: { name: def.name, intro: def.intro, defeat: def.defeat, team, reward: def.reward } },
        after: res => {
          if (res.result === 'win') {
            Game.player.flags[flagKey] = true;
            onWin && onWin();
          }
        },
      };
      this.transition = 700;
    }

    /** Statik-Begegnung (Legendäre): Flag nur beim Fangen. */
    startStatic(st) {
      this.pendingBattle = {
        opts: Battle.makeMon(st.id, st.level),
        after: res => {
          if (res.result === 'catch') Game.player.flags['s_' + st.key] = true;
        },
      };
      this.transition = 700;
    }

    interact() {
      const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[this.dir];
      const fx = this.x + d[0], fy = this.y + d[1];
      const tr = trainerAt(fx, fy);
      if (tr) {
        if (Game.player.flags['t_' + tr.id]) this.msg = tr.after || 'Du bist stark!';
        else this.startTrainer(tr, 't_' + tr.id);
        return true;
      }
      const st = staticAt(fx, fy);
      if (st) { this.startStatic(st); return true; }
      const npc = npcAt(fx, fy);
      if (npc) { this.msg = npc.text; return true; }
      if (get(fx, fy) === T.SIGN) { this.msg = signs[fx + ',' + fy] || '...'; return true; }
      const gate = gateAt(fx, fy);
      if (gate) { this.msg = gate.text; return true; }
      return false;
    }

    startBattle() {
      const pb = this.pendingBattle;
      this.pendingBattle = null;
      Game.push(new Battle.BattleScreen(pb.opts, res => {
        if (res.result === 'lose') {
          // Blackout: heilen + zurück zum letzten Heilpunkt
          for (const m of Game.player.party) m.hp = m.stats.hp;
          const r = Game.player.respawn || { x: 11, y: 54 };
          this.x = this.tx = Game.player.x = r.x;
          this.y = this.ty = Game.player.y = r.y;
          this.dir = 'down';
          this.msg = 'Du bist zum letzten Heilpunkt geeilt und hast dein Team geheilt.';
        }
        pb.after && pb.after(res);
        Game.save(); // Auto-Save nach jedem Kampf
      }));
    }

    update(dt) {
      this.time += dt;
      if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;

      if (this.transition > 0) {            // Kampf-Überblendung läuft
        this.transition -= dt;
        if (this.transition <= 0) this.startBattle();
        return;
      }
      if (this.msg) {                        // Textbox offen
        if (Input.take('a') || Input.take('b')) this.msg = null;
        return;
      }

      if (this.moving) {
        this.progress += dt / 220;           // ~220ms pro Tile
        this.frame += dt;
        if (this.progress >= 1) { this.moving = false; this.progress = 0; this.arrived(); }
        return;
      }

      // Eingaben (stehend)
      if (Input.take('a')) {
        if (!this.interact()) Game.push(new UI.PauseMenuScreen());
        return;
      }
      for (const dir of ['up', 'down', 'left', 'right']) {
        if (Input.down(dir)) { this.tryMove(dir); break; }
      }
    }

    draw(ctx) {
      // Pixel-Position des Spielers (interpoliert)
      const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[this.dir];
      const px = (this.x + (this.moving ? d[0] * this.progress : 0)) * TILE;
      const py = (this.y + (this.moving ? d[1] * this.progress : 0)) * TILE;

      // Kamera zentrieren + an Kartenränder klemmen
      const camX = Math.max(0, Math.min(px - 72, W * TILE - 160));
      const camY = Math.max(0, Math.min(py - 64, H * TILE - 144));
      const anim = Math.floor(this.time / 500);

      const x0 = Math.floor(camX / TILE), y0 = Math.floor(camY / TILE);
      for (let ty = y0; ty <= y0 + 9; ty++) {
        for (let tx = x0; tx <= x0 + 10; tx++) {
          drawTile(ctx, get(tx, ty), Math.round(tx * TILE - camX), Math.round(ty * TILE - camY), anim);
        }
      }

      const sx = wx => Math.round(wx * TILE - camX);
      const sy = wy => Math.round(wy * TILE - camY);
      const visible = (wx, wy) => wx >= x0 - 1 && wx <= x0 + 11 && wy >= y0 - 1 && wy <= y0 + 10;

      // Geschlossene Tore (Barriere über dem Weg)
      for (const g of GATES) {
        if (!g.open(Game.player) && visible(g.x, g.y)) {
          const gx = sx(g.x), gy = sy(g.y);
          ctx.fillStyle = '#806048';
          ctx.fillRect(gx + 1, gy + 3, 3, 11); ctx.fillRect(gx + 12, gy + 3, 3, 11);
          ctx.fillRect(gx, gy + 5, 16, 2); ctx.fillRect(gx, gy + 10, 16, 2);
          ctx.fillStyle = '#f8d030'; ctx.fillRect(gx + 6, gy + 6, 4, 5);
        }
      }

      // NPCs
      for (const n of NPCS) {
        if (visible(n.x, n.y)) ctx.drawImage(NPC_SPRITES.down0, sx(n.x), sy(n.y) - 2);
      }
      // Trainer
      for (const tr of TRAINERS) {
        if (visible(tr.x, tr.y)) ctx.drawImage(tr.sprites.down0, sx(tr.x), sy(tr.y) - 2);
      }
      // Legendäre (als kleines Overworld-Sprite)
      for (const st of STATICS) {
        if (!staticActive(st) || !visible(st.x, st.y)) continue;
        const sp = Data.byId(st.id);
        const img = Data.sprite(sp.front);
        if (img) ctx.drawImage(img, sx(st.x), sy(st.y) - 2, 16, 16);
        else {
          ctx.fillStyle = Data.TYPE_COLORS[sp.types[0]] || '#a8a878';
          ctx.beginPath(); ctx.arc(sx(st.x) + 8, sy(st.y) + 6, 6, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Spieler (Lauf-Animation: 2 Frames)
      const walking = this.moving && Math.floor(this.frame / 130) % 2 === 1;
      const spr = PLAYER_SPRITES[this.dir + (walking ? '1' : '0')];
      ctx.drawImage(spr, Math.round(px - camX), Math.round(py - camY - 2));

      // Gebiets-Banner
      if (this.banner) {
        const w = this.banner.text.length * 8 + 16;
        UI.box(ctx, Math.floor((160 - w) / 2), 2, w, 16);
        UI.text(ctx, this.banner.text, Math.floor((160 - w) / 2) + 8, 7);
      }

      // Textbox
      if (this.msg) {
        UI.box(ctx, 0, 96, 160, 48);
        UI.textWrapped(ctx, this.msg, 6, 104, 18);
      }

      // Kampf-Überblendung (Flackern)
      if (this.transition > 0 && Math.floor(this.transition / 90) % 2 === 0) {
        ctx.fillStyle = '#181818'; ctx.fillRect(0, 0, 160, 144);
      }
    }
  }

  return {
    WorldScreen, TILE, START: { x: 11, y: 54 },
    // Debug-/Test-Zugriff (Konnektivitäts-Checks)
    _dbg: { get, W, H, T, SOLID, doors, signs, TRAINERS, STATICS, GATES, NPCS, ZONES },
  };
})();
