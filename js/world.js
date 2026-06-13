'use strict';
/**
 * world.js — Multi-Map-Overworld mit begehbaren Innenräumen:
 *
 * Overworld:  KIEFERNDORF → ROUTE 1 → WALDDORF → ROUTE 2 → FELSGROTTE →
 *             STEINSTADT → ROUTE 3 → KUESTENDORF → SIEGESWEG → LIGA
 * Interiors:  2 Arenen (Arena-Trainer + Leiter), Liga-Gauntlet (Top 4 +
 *             Champion), Poké-Center (Heil-Tresen), Märkte (3 Stufen),
 *             Zuhause (Mama heilt).
 *
 * Dazu: Sicht-Trainer ("!" + Heranlaufen), Orden-Tore, legendäre
 * Statik-Begegnungen, Zonen-Encounter, Respawn am letzten Heilpunkt.
 *
 * Alle Tiles & Charakter-Sprites werden prozedural gezeichnet (keine externen
 * Assets) — das hält das Projekt komplett offline-fähig bis auf PokeAPI.
 */
const World = (() => {

  const TILE = 16;

  // Tile-IDs
  const T = {
    GRASS: 0, TALL: 1, PATH: 2, TREE: 3, WATER: 4, WALL: 5, ROOF: 6, DOOR: 7,
    WINDOW: 8, SIGN: 9, FENCE: 10, FLOWER: 11, CAVE: 12, ROCK: 13,
    FLOOR: 14, MAT: 15, COUNTER: 16, STATUE: 17, VOID: 255,
  };
  const SOLID = new Set([T.TREE, T.WATER, T.WALL, T.ROOF, T.WINDOW, T.SIGN, T.FENCE, T.ROCK, T.COUNTER, T.STATUE, T.VOID]);

  // ----------------------------------------------------------- GameMap ---
  class GameMap {
    constructor(id, w, h, indoor) {
      this.id = id; this.w = w; this.h = h; this.indoor = !!indoor;
      this.tiles = new Uint8Array(w * h);
      this.signs = {}; this.doors = {};      // doors: "x,y" -> Aktion (warp/…)
      this.counters = {};                    // "x,y" -> Tresen-Aktion (heal/mart)
      this.npcs = []; this.trainers = [];
      this.statics = []; this.gates = []; this.zones = [];
    }
    get(x, y) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this.indoor ? T.VOID : T.TREE;
      return this.tiles[y * this.w + x];
    }
    set(x, y, t) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.tiles[y * this.w + x] = t; }
    rect(x, y, w, h, t) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, t); }
    npcAt(x, y) { return this.npcs.find(n => n.x === x && n.y === y); }
    trainerAt(x, y) { return this.trainers.find(t => t.cx === x && t.cy === y); }
    staticAt(x, y) { return this.statics.find(s => s.x === x && s.y === y && staticActive(s)); }
    gateAt(x, y) { return this.gates.find(g => g.x === x && g.y === y && !g.open(Game.player)); }
    zoneAt(x, y) { return this.zones.find(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h); }
  }

  const MAPS = {};

  // ===================================================== OVERWORLD BAUEN ===
  function buildOverworld() {
    const m = new GameMap('overworld', 72, 60, false);
    const rect = m.rect.bind(m), set = m.set.bind(m);
    const house = (x, y, w, h, doorAction) => {
      rect(x, y, w, 2, T.ROOF);
      rect(x, y + 2, w, h - 2, T.WALL);
      const dx = x + Math.floor(w / 2), dy = y + h - 1;
      set(dx, dy, T.DOOR);
      set(x + 1, y + h - 1, T.WINDOW);
      set(x + w - 2, y + h - 1, T.WINDOW);
      m.doors[dx + ',' + dy] = doorAction;
      return { x: dx, y: dy };
    };

    rect(0, 0, 72, 60, T.GRASS);
    rect(0, 0, 72, 2, T.TREE); rect(0, 58, 72, 2, T.TREE);
    rect(0, 0, 2, 60, T.TREE); rect(70, 0, 2, 60, T.TREE);
    rect(22, 2, 2, 56, T.TREE);             // Trennwand West <-> Ost

    // ===== WEST-KORRIDOR =====
    rect(11, 2, 2, 56, T.PATH);

    // --- KIEFERNDORF ---
    rect(3, 45, 18, 1, T.FENCE); set(11, 45, T.PATH); set(12, 45, T.PATH);
    house(4, 47, 5, 4, { warp: 'home' });
    house(15, 47, 6, 4, { warp: 'center_kiefern' });
    set(13, 53, T.SIGN);
    m.signs['13,53'] = 'KIEFERNDORF - Wo dein Abenteuer beginnt!';
    rect(5, 53, 3, 2, T.FLOWER); rect(17, 53, 3, 2, T.FLOWER);

    // --- Route 1 ---
    rect(3, 36, 6, 5, T.TALL);
    rect(14, 28, 7, 5, T.TALL);
    rect(4, 17, 6, 5, T.TALL);
    rect(15, 13, 6, 4, T.TALL);
    rect(17, 21, 4, 3, T.WATER);
    set(5, 30, T.TREE); set(6, 30, T.TREE); set(16, 38, T.TREE);
    set(4, 24, T.TREE); set(18, 18, T.TREE); set(7, 12, T.TREE);
    set(13, 42, T.SIGN);
    m.signs['13,42'] = 'ROUTE 1 - Achtung: Wilde POKEMON im hohen Gras!';

    // --- WALDDORF ---
    rect(3, 11, 18, 1, T.FENCE); set(11, 11, T.PATH); set(12, 11, T.PATH);
    house(4, 3, 5, 4, { warp: 'mart_wald' });
    house(15, 3, 6, 4, { warp: 'center_wald' });
    rect(5, 8, 2, 2, T.FLOWER);
    rect(13, 8, 15, 2, T.PATH);             // Ost-Ausgang zur Route 2
    set(13, 8, T.SIGN);
    m.signs['13,8'] = 'WALDDORF - POKE-STATION rechts, MARKT links. Osten: ROUTE 2';

    // ===== ROUTE 2 =====
    rect(24, 14, 18, 1, T.TREE);
    rect(24, 8, 18, 2, T.PATH);
    rect(26, 3, 6, 4, T.TALL);
    rect(36, 3, 5, 4, T.TALL);
    rect(33, 11, 6, 3, T.TALL);
    rect(25, 11, 4, 3, T.TALL);
    set(26, 7, T.SIGN);
    m.signs['26,7'] = 'ROUTE 2 - Im Osten: Die FELSGROTTE!';

    // ===== FELSGROTTE =====
    rect(42, 2, 16, 16, T.ROCK);
    rect(42, 8, 6, 2, T.CAVE);
    rect(46, 4, 2, 6, T.CAVE);
    rect(46, 4, 8, 2, T.CAVE);
    rect(52, 4, 2, 10, T.CAVE);
    rect(46, 12, 8, 2, T.CAVE);
    rect(43, 12, 3, 2, T.CAVE);             // Nische (ARKTOS)
    rect(54, 12, 3, 3, T.CAVE);             // verborgene Kammer (MEWTU)
    rect(50, 14, 2, 4, T.CAVE);

    // ===== STEINSTADT =====
    rect(50, 18, 2, 3, T.PATH);
    rect(29, 20, 23, 2, T.PATH);
    rect(29, 22, 2, 8, T.PATH);
    rect(25, 29, 14, 2, T.PATH);
    house(24, 23, 5, 4, { warp: 'center_stein' });
    house(33, 23, 7, 6, { warp: 'arena1' });
    house(34, 30, 5, 4, { warp: 'mart_stein' });
    set(26, 27, T.PATH); set(26, 28, T.PATH);
    set(39, 29, T.SIGN);
    m.signs['39,29'] = 'STEINSTADT - ARENA von ROCKO (GESTEIN). MARKT im Sueden.';

    // --- Waldpfad (Nord) -> NEBELWALD / TEAM-SCHATTEN-Story ---
    set(31, 18, T.CAVE);
    m.doors['31,18'] = { warp: 'nebelwald', x: 13, y: 17, dir: 'up' };
    set(32, 19, T.SIGN);
    m.signs['32,19'] = 'WALDPFAD: Im NEBELWALD treibt TEAM SCHATTEN sein Unwesen!';

    // ===== ROUTE 3 =====
    rect(29, 31, 2, 12, T.PATH);
    rect(29, 42, 39, 2, T.PATH);
    rect(24, 34, 5, 4, T.TALL);
    rect(33, 35, 6, 4, T.TALL);
    rect(25, 40, 4, 2, T.TALL);
    rect(37, 38, 4, 3, T.TALL);
    rect(39, 33, 4, 3, T.WATER);
    set(28, 33, T.SIGN);
    m.signs['28,33'] = 'ROUTE 3 - KUESTENDORF im Suedosten!';

    // ===== KUESTENDORF =====
    rect(46, 52, 24, 6, T.WATER);
    rect(55, 44, 2, 6, T.PATH);
    rect(48, 48, 16, 2, T.PATH);
    house(48, 44, 5, 4, { warp: 'center_kueste' });
    house(59, 44, 6, 4, { warp: 'arena2' });
    house(65, 44, 4, 4, { warp: 'mart_kueste' });
    rect(47, 50, 4, 2, T.TALL);
    rect(60, 50, 4, 2, T.TALL);
    set(57, 50, T.SIGN);
    m.signs['57,50'] = 'KUESTENDORF - MISTYS ARENA (WASSER)';
    set(64, 49, T.SIGN);
    m.signs['64,49'] = 'Geruecht: MEW versteckt sich hinter der LIGA im Norden...';

    // --- Höhleneingang Osten -> ROUTE 4 / NATURPARK / DRACHENTAL ---
    rect(64, 48, 5, 1, T.PATH);
    set(69, 48, T.CAVE);
    m.doors['69,48'] = { warp: 'route4', x: 12, y: 15, dir: 'up' };
    set(68, 49, T.SIGN);
    m.signs['68,49'] = 'Hoehleneingang: Im Osten warten ROUTE 4 und der NATURPARK!';

    // ===== SIEGESWEG + LIGA =====
    rect(58, 18, 1, 19, T.TREE);            // Westwand
    rect(58, 36, 8, 1, T.TREE);             // Querwand westlich des Tors
    rect(68, 36, 2, 1, T.TREE);             // Querwand oestlich des Tors
    rect(66, 8, 2, 35, T.PATH);
    rect(61, 12, 4, 4, T.TALL);
    rect(61, 24, 4, 4, T.TALL);
    rect(68, 18, 2, 5, T.TALL);
    set(65, 37, T.SIGN);
    m.signs['65,37'] = 'SIEGESWEG - Zutritt nur mit 2 ORDEN!';
    house(62, 3, 8, 5, { warp: 'liga', need: 2, denied: 'POKEMON-LIGA: Nur Trainer mit 2 ORDEN duerfen eintreten!' });

    // Deko
    set(44, 25, T.TREE); set(54, 30, T.TREE); set(46, 36, T.TREE);
    set(57, 25, T.TREE); set(43, 31, T.TREE); set(59, 33, T.TREE);
    rect(53, 22, 2, 2, T.FLOWER); rect(45, 39, 2, 2, T.FLOWER);

    // --- Zonen & Encounter (nur Overworld) ---
    m.zones = [
      { name: 'KIEFERNDORF', x: 2, y: 45, w: 20, h: 13 },
      { name: 'WALDDORF',    x: 2, y: 2,  w: 20, h: 10 },
      { name: 'ROUTE 1',     x: 2, y: 12, w: 20, h: 33, lv: [2, 6], table: [
        [16, 28], [19, 28], [10, 14], [13, 14], [43, 9], [56, 4], [25, 3]] },
      { name: 'FELSGROTTE',  x: 42, y: 2, w: 16, h: 16, lv: [14, 19], cave: true, table: [
        [41, 30], [74, 24], [46, 14], [50, 10], [66, 8], [95, 6], [104, 4], [140, 2], [138, 2], [142, 1]] },
      { name: 'ROUTE 2',     x: 24, y: 2, w: 18, h: 13, lv: [10, 15], table: [
        [21, 22], [29, 14], [32, 14], [23, 12], [27, 10], [35, 8], [63, 7], [58, 5], [37, 4], [39, 4]] },
      { name: 'STEINSTADT',  x: 24, y: 18, w: 17, h: 13 },
      { name: 'SIEGESWEG',   x: 58, y: 2, w: 12, h: 36, lv: [28, 38], table: [
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

    // --- NPCs ---
    m.npcs = [
      { x: 7,  y: 51, text: 'Im hohen Gras lauern wilde POKEMON. Halte Baelle bereit!' },
      { x: 9,  y: 5,  text: 'Oestlich liegt ROUTE 2 - dahinter die FELSGROTTE und STEINSTADT!' },
      { x: 27, y: 29, text: 'ROCKOs GESTEIN-Pokemon fuerchten WASSER und PFLANZE!' },
      { x: 47, y: 48, text: 'MISTY setzt auf WASSER - ELEKTRO und PFLANZE helfen!' },
      { x: 65, y: 40, text: 'Hinter dem Tor liegt der SIEGESWEG zur POKEMON-LIGA!' },
    ];

    // --- Streckentrainer (mit Sichtweite: dir + range) ---
    m.trainers = [
      { id: 'bug1', x: 30, y: 7, dir: 'down', range: 2, shirt: '#a8b820', hair: '#383838', name: 'KAEFERSAMMLER KAI',
        intro: 'Meine Kaefer stechen zu!', defeat: 'Auweia, zerquetscht...',
        after: 'Kaefer entwickeln sich schneller als alle anderen!',
        team: [[10, 9], [13, 9], [12, 12]], reward: { money: 300, items: { ball: 2 } } },
      { id: 'kid1', x: 38, y: 10, dir: 'up', range: 2, shirt: '#4890e8', hair: '#c8a030', name: 'YOUNGSTER FINN',
        intro: 'Ich bin der Beste auf ROUTE 2!', defeat: 'Mist, verloren!',
        after: 'In der FELSGROTTE brauchst du WASSER- oder PFLANZEN-Attacken.',
        team: [[19, 10], [21, 11]], reward: { money: 250 } },
      { id: 'hiker1', x: 49, y: 4, dir: 'down', range: 1, shirt: '#886040', hair: '#583820', name: 'WANDERER BODO',
        intro: 'Meine Steine sind unzerbrechlich!', defeat: 'Zerbroeselt!',
        after: 'In einer Nische tief in der Grotte haust ein eisiger Vogel...',
        team: [[74, 15], [74, 16], [95, 17]], reward: { money: 500, items: { potion: 2 } } },
      { id: 'beauty1', x: 32, y: 37, dir: 'down', range: 2, shirt: '#e87890', hair: '#a06030', name: 'SCHOENHEIT LENA',
        intro: 'Meine Pokemon sind zauberhaft!', defeat: 'Wie unhoeflich!',
        after: 'KUESTENDORF liegt im Suedosten - folge dem Weg!',
        team: [[37, 18], [39, 18]], reward: { money: 600 } },
      { id: 'angler1', x: 40, y: 36, dir: 'left', range: 2, shirt: '#4890e8', hair: '#383838', name: 'ANGLER UDO',
        intro: 'KARPADOR ist staerker als sein Ruf!', defeat: 'Platsch...',
        after: 'Aus KARPADOR wird mit Geduld ein maechtiger GARADOS!',
        team: [[129, 15], [129, 17], [130, 21]], reward: { money: 600 } },
      { id: 'angler2', x: 53, y: 50, dir: 'right', range: 2, shirt: '#287888', hair: '#c8a030', name: 'ANGLER JENS',
        intro: 'Frisch vom Meer!', defeat: 'Ins Wasser gefallen!',
        after: 'Am Strand schwimmen seltene Pokemon - sogar LAPRAS!',
        team: [[72, 22], [98, 23]], reward: { money: 700, items: { potion: 1 } } },
      { id: 'vet1', x: 65, y: 18, dir: 'right', range: 1, shirt: '#806048', hair: '#888888', name: 'VETERAN ROLF',
        intro: 'Nur die Besten erreichen die LIGA!', defeat: 'Respekt!',
        after: 'In der LIGA warten die TOP 4 und der CHAMP. Sei vorbereitet!',
        team: [[111, 32], [59, 33]], reward: { money: 1200, items: { superpotion: 2 } } },
      { id: 'belt1', x: 68, y: 28, dir: 'left', range: 1, shirt: '#282828', hair: '#181818', name: 'SCHWARZGURT KOJI',
        intro: 'HIIIYA! Spuere meine Faeuste!', defeat: 'Eine ehrenvolle Niederlage.',
        after: 'Dein Team ist bereit fuer die LIGA!',
        team: [[67, 34], [106, 35], [107, 35]], reward: { money: 1200, items: { ball: 3 } } },
      // --- Zusatztrainer fuer mehr Gegner ---
      { id: 'r1c', x: 8, y: 33, dir: 'right', range: 3, shirt: '#4890e8', hair: '#c8a030', name: 'YOUNGSTER PAUL',
        intro: 'Mein RATTFRATZ beisst zu!', defeat: 'Voll daneben!',
        after: 'Viel Glueck auf ROUTE 1!',
        team: [[19, 4], [16, 5], [21, 5]], reward: { money: 150 } },
      { id: 'r3c', x: 32, y: 36, dir: 'left', range: 3, shirt: '#886040', hair: '#583820', name: 'WANDERER JONAS',
        intro: 'Bergauf, bergab - ich gewinne!', defeat: 'Abgerutscht...',
        after: 'KUESTENDORF liegt im Suedosten.',
        team: [[74, 18], [95, 19], [66, 20]], reward: { money: 700, items: { potion: 2 } } },
      { id: 'sw_c', x: 64, y: 20, dir: 'right', range: 3, shirt: '#282828', hair: '#181818', name: 'SCHWARZGURT REN',
        intro: 'Der Weg formt den Krieger!', defeat: 'Gut gekaempft!',
        after: 'Die LIGA ist zum Greifen nah!',
        team: [[107, 33], [68, 34], [57, 34]], reward: { money: 1300, items: { superpotion: 1 } } },
    ];

    // --- Legendäre (bleiben bis zum Fang; Mewtu erst nach Champion-Sieg) ---
    m.statics = [
      { key: 'arktos',  id: 144, level: 50, x: 43, y: 12 },
      { key: 'zapdos',  id: 145, level: 50, x: 40, y: 3 },
      { key: 'lavados', id: 146, level: 50, x: 69, y: 16 },
      { key: 'mewtu',   id: 150, level: 70, x: 56, y: 13, needs: 'champion' },
      { key: 'mew',     id: 151, level: 30, x: 68, y: 2 },
    ];

    // --- Tore ---
    m.gates = [
      { x: 66, y: 36, open: p => (p.badges || 0) >= 2, text: 'Waechter: Nur Trainer mit 2 ORDEN duerfen den SIEGESWEG betreten!' },
      { x: 67, y: 36, open: p => (p.badges || 0) >= 2, text: 'Waechter: Nur Trainer mit 2 ORDEN duerfen den SIEGESWEG betreten!' },
      { x: 54, y: 12, open: p => !!p.flags.champion, text: 'Eine mysterioese Kraft blockiert den Weg... (Besiege erst den CHAMP!)' },
      { x: 54, y: 13, open: p => !!p.flags.champion, text: 'Eine mysterioese Kraft blockiert den Weg... (Besiege erst den CHAMP!)' },
    ];

    MAPS.overworld = m;
  }

  // ===================================================== INTERIORS BAUEN ===
  // ASCII-Legende: #=Wand .=Boden m=Ausgangs-Matte c=Tresen s=Statue/Regal w=Wasser
  const CHARS = { '#': T.WALL, '.': T.FLOOR, 'm': T.MAT, 'c': T.COUNTER, 's': T.STATUE, 'w': T.WATER };

  /**
   * Interior aus ASCII bauen. outDoor = Tür-Tile auf der Overworld;
   * Matten warpen vor diese Tür (y+1). Der Overworld-Türeintrag zeigt
   * auf entry (über den Matten).
   */
  function buildInterior(id, layout, outDoor, opts = {}) {
    const h = layout.length, w = layout[0].length;
    const m = new GameMap(id, w, h, true);
    let mats = [];
    layout.forEach((row, y) => {
      for (let x = 0; x < w; x++) {
        const t = CHARS[row[x]] ?? T.FLOOR;
        m.set(x, y, t);
        if (t === T.MAT) mats.push([x, y]);
      }
    });
    // Matten -> raus vor die Tür
    for (const [x, y] of mats) {
      m.doors[x + ',' + y] = { warp: 'overworld', x: outDoor.x, y: outDoor.y + 1, dir: 'down' };
    }
    m.entry = { x: mats[0][0], y: mats[0][1] - 1, dir: 'up' };
    Object.assign(m, opts);   // npcs, trainers, counters, signs
    MAPS[id] = m;
    return m;
  }

  function buildInteriors() {
    // --- Poké-Center (Vorlage je Standort, Heil-Tresen) ---
    const centerLayout = [
      '##########',
      '#...J....#',
      '#.ccccc..#',
      '#........#',
      '#.s....s.#',
      '#........#',
      '#........#',
      '####mm####',
    ];
    const centers = [
      ['center_kiefern', { x: 18, y: 50 }, 'POKE-LABOR'],
      ['center_wald',    { x: 18, y: 6 },  'POKE-STATION'],
      ['center_stein',   { x: 26, y: 26 }, 'POKE-CENTER STEINSTADT'],
      ['center_kueste',  { x: 50, y: 47 }, 'POKE-CENTER KUESTENDORF'],
    ];
    for (const [id, door, label] of centers) {
      const c = buildInterior(id, centerLayout, door, {
        npcs: [{ x: 4, y: 1, deco: true, shirt: '#e87890', hair: '#e87890' }],
      });
      for (let x = 2; x <= 6; x++) c.counters[x + ',2'] = { kind: 'heal', label };
    }

    // --- Märkte (3 Stufen) ---
    const martLayout = [
      '##########',
      '#...K....#',
      '#.ccccc..#',
      '#........#',
      '#.ss..ss.#',
      '#........#',
      '#........#',
      '####mm####',
    ];
    const marts = [
      ['mart_wald',   { x: 6, y: 6 },   1],
      ['mart_stein',  { x: 36, y: 33 }, 2],
      ['mart_kueste', { x: 67, y: 47 }, 3],
    ];
    for (const [id, door, tier] of marts) {
      const mk = buildInterior(id, martLayout, door, {
        npcs: [{ x: 4, y: 1, deco: true, shirt: '#3878c8', hair: '#583820' }],
      });
      for (let x = 2; x <= 6; x++) mk.counters[x + ',2'] = { kind: 'mart', tier };
    }

    // --- Zuhause (Mama heilt) ---
    buildInterior('home', [
      '########',
      '#......#',
      '#.M..s.#',
      '#......#',
      '#......#',
      '#......#',
      '###mm###',
    ], { x: 6, y: 50 }, {
      npcs: [{ x: 2, y: 2, heal: true, shirt: '#c85878', hair: '#583820',
        text: 'MAMA: Ruh dich aus, Schatz! ... Dein Team ist wieder topfit!' }],
    });

    // --- Arena 1: ROCKO (Gestein) ---
    buildInterior('arena1', [
      '############',
      '#..........#',
      '#..........#',
      '#.ss....ss.#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#.ss....ss.#',
      '#..........#',
      '#..........#',
      '#####mm#####',
    ], { x: 36, y: 28 }, {
      signs: {},
      trainers: [
        { id: 'gym1a', x: 3, y: 6, dir: 'right', range: 3, shirt: '#b89868', hair: '#383838', name: 'SCHUELER JONAS',
          intro: 'Niemand kommt an ROCKO vorbei!', defeat: 'Du bist hart im Nehmen!',
          after: 'ROCKO wartet am Ende der Arena.',
          team: [[74, 14], [27, 15]], reward: { money: 400 } },
        { id: 'gym1b', x: 9, y: 5, dir: 'left', range: 3, shirt: '#b89868', hair: '#c8a030', name: 'WANDERER ULF',
          intro: 'Steinhart, mein Team!', defeat: 'Felsig war gestern...',
          after: 'Setze WASSER oder PFLANZE gegen ROCKO ein!',
          team: [[74, 15], [95, 15]], reward: { money: 450 } },
        { id: 'rocko', x: 5, y: 2, dir: 'down', range: 0, shirt: '#a86838', hair: '#583820', name: 'ARENALEITER ROCKO',
          smart: true, leader: true,
          intro: 'Ich bin ROCKO! Meine Felsen kennen kein Erbarmen!',
          defeat: 'Dein Wille ist haerter als Stein! Nimm den FELSORDEN!',
          after: 'Mit dem FELSORDEN beginnt deine Reise erst richtig.',
          team: [[74, 16], [95, 18]],
          reward: { money: 2200, items: { ball: 5, potion: 3 }, badge: 1, badgeName: 'FELSORDEN' },
          flag: 'arena_rocko' },
      ],
    });

    // --- Arena 2: MISTY (Wasser) ---
    buildInterior('arena2', [
      '############',
      '#..........#',
      '#..........#',
      '#.ww....ww.#',
      '#.ww....ww.#',
      '#..........#',
      '#.ww....ww.#',
      '#.ww....ww.#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#####mm#####',
    ], { x: 62, y: 47 }, {
      trainers: [
        { id: 'gym2a', x: 4, y: 5, dir: 'down', range: 3, shirt: '#5090e8', hair: '#c8a030', name: 'SCHWIMMERIN MIA',
          intro: 'Das Wasser ist mein Element!', defeat: 'Glub glub...',
          after: 'MISTYs STARMIE ist ihr Ass!',
          team: [[118, 20], [60, 21]], reward: { money: 500 } },
        { id: 'gym2b', x: 7, y: 8, dir: 'left', range: 3, shirt: '#5090e8', hair: '#383838', name: 'SCHWIMMER TIM',
          intro: 'Tauch unter!', defeat: 'Abgetaucht...',
          after: 'ELEKTRO-Attacken sind hier Gold wert.',
          team: [[72, 21], [86, 22]], reward: { money: 550 } },
        { id: 'misty', x: 5, y: 2, dir: 'down', range: 0, shirt: '#f8a030', hair: '#e87830', name: 'ARENALEITERIN MISTY',
          smart: true, leader: true,
          intro: 'Ich bin MISTY! Meine Wasser-Pokemon spuelen dich fort!',
          defeat: 'Du bist eine grosse Welle! Der QUELLORDEN gehoert dir!',
          after: 'Mit 2 ORDEN steht dir der SIEGESWEG offen!',
          team: [[120, 24], [121, 28]],
          reward: { money: 3500, items: { greatball: 5, superpotion: 3 }, badge: 2, badgeName: 'QUELLORDEN' },
          flag: 'arena_misty' },
      ],
    });

    // --- POKEMON-LIGA: Top 4 + Champion (Gauntlet) ---
    buildInterior('liga', [
      '##########',
      '#........#',
      '#........#',
      '#.s....s.#',
      '#........#',
      '####.#####',
      '#........#',
      '#.s....s.#',
      '#........#',
      '#........#',
      '####.#####',
      '#........#',
      '#.s....s.#',
      '#........#',
      '#........#',
      '####.#####',
      '#........#',
      '#.s....s.#',
      '#........#',
      '#........#',
      '####.#####',
      '#........#',
      '#.s....s.#',
      '#........#',
      '####mm####',
    ], { x: 66, y: 7 }, {
      trainers: [
        { id: 'top1', x: 4, y: 20, dir: 'down', range: 3, moveAfter: { x: 6, y: 18 },
          shirt: '#8858c8', hair: '#c84878', name: 'TOP 4 LORELEI', smart: true,
          intro: 'Willkommen bei den TOP 4! Mein Eis wird dich laehmen!',
          defeat: 'Eiskalt erwischt... Geh weiter.',
          after: 'BRUNO wartet hinter mir.',
          team: [[87, 52], [91, 51], [131, 54]], reward: { money: 4500 }, flag: 'top4_1' },
        { id: 'top2', x: 4, y: 15, dir: 'down', range: 3, moveAfter: { x: 6, y: 13 },
          shirt: '#b06830', hair: '#181818', name: 'TOP 4 BRUNO', smart: true,
          intro: 'HOOO! Meine Muskeln sind Stahl!', defeat: 'Beeindruckende Kraft!',
          after: 'AGATHE treibt ihr Unwesen im naechsten Raum.',
          team: [[95, 51], [68, 53], [106, 52]], reward: { money: 4500 }, flag: 'top4_2' },
        { id: 'top3', x: 4, y: 10, dir: 'down', range: 3, moveAfter: { x: 6, y: 8 },
          shirt: '#7048a8', hair: '#a8a8a8', name: 'TOP 4 AGATHE', smart: true,
          intro: 'Hihihi... Meine Geister fressen deine Traeume!',
          defeat: 'Du fuerchtest dich nicht? Bemerkenswert.',
          after: 'SIEGFRIED und seine Drachen sind dein letzter Test.',
          team: [[94, 53], [93, 52], [24, 54]], reward: { money: 4500 }, flag: 'top4_3' },
        { id: 'top4', x: 4, y: 5, dir: 'down', range: 3, moveAfter: { x: 6, y: 3 },
          shirt: '#383868', hair: '#c83828', name: 'TOP 4 SIEGFRIED', smart: true,
          intro: 'Drachen sind unbesiegbar! Beweise mir das Gegenteil!',
          defeat: 'Die Legenden... sie irren nie. Der CHAMP erwartet dich.',
          after: 'Der CHAMP wartet. Zeig ihm deine Staerke!',
          team: [[130, 53], [142, 54], [149, 56]], reward: { money: 5500 }, flag: 'top4_4' },
        { id: 'champ', x: 4, y: 2, dir: 'down', range: 2,
          shirt: '#c8a030', hair: '#a06838', name: 'CHAMP BLAU', smart: true,
          intro: 'Ich bin der CHAMPION! Niemand hat mich je besiegt!',
          defeat: 'Unmoeglich... Du bist der neue CHAMPION! GLUECKWUNSCH!',
          after: 'Du bist der CHAMP! Die LIGA verneigt sich vor dir.',
          team: [[18, 55], [65, 56], [112, 56], [59, 57], [9, 58], [149, 60]],
          reward: { money: 10000, items: { ultraball: 5, hyperpotion: 3 } },
          flag: 'champion',
          winMsg: 'GLUECKWUNSCH, CHAMP! In der FELSGROTTE regt sich etwas Mysterioeses...' },
      ],
    });
  }

  // ============================================ ZUSATZGEBIETE (NEU) BAUEN ===
  // Drei neue Outdoor-Maps, erreichbar ueber den Hoehleneingang in KUESTENDORF:
  //   ROUTE 4  ->  NATURPARK (Ranger heilt, alle 3 EVOLI-Formen wild)  ->
  //   DRACHENTAL (Endgame, hinter CHAMPION-Tor: Drachen & Co. auf hohem Level).
  // Warp-Kacheln sind begehbare CAVE-Tiles; Ziel-Koordinaten liegen jeweils
  // EINE Kachel neben der Rueckkehr-Kachel, damit kein Warp-Loop entsteht.
  function buildExtraMaps() {
    const outdoor = (id, w, h) => {
      const m = new GameMap(id, w, h, false);
      m.rect(0, 0, w, h, T.GRASS);
      m.rect(0, 0, w, 1, T.TREE); m.rect(0, h - 1, w, 1, T.TREE);
      m.rect(0, 0, 1, h, T.TREE); m.rect(w - 1, 0, 1, h, T.TREE);
      MAPS[id] = m;
      return m;
    };

    // --- ROUTE 4 (24x18) ---
    const r4 = outdoor('route4', 24, 18);
    r4.rect(11, 1, 2, 16, T.PATH);
    r4.rect(3, 3, 6, 4, T.TALL);
    r4.rect(15, 4, 6, 3, T.TALL);
    r4.rect(4, 10, 5, 4, T.TALL);
    r4.rect(15, 10, 5, 4, T.TALL);
    r4.set(9, 8, T.TREE); r4.set(14, 8, T.TREE);
    r4.rect(16, 14, 4, 2, T.WATER);
    r4.rect(4, 8, 2, 2, T.FLOWER);
    r4.set(13, 15, T.SIGN);
    r4.signs['13,15'] = 'ROUTE 4 - Im Norden liegt der NATURPARK!';
    r4.set(12, 16, T.CAVE); r4.doors['12,16'] = { warp: 'overworld', x: 68, y: 48, dir: 'down' };
    r4.set(12, 1, T.CAVE);  r4.doors['12,1']  = { warp: 'naturpark', x: 14, y: 19, dir: 'up' };
    r4.zones = [{ name: 'ROUTE 4', x: 1, y: 1, w: 22, h: 16, lv: [20, 26], table: [
      [16, 16], [19, 14], [43, 12], [48, 12], [69, 10], [60, 10], [35, 8], [54, 8],
      [58, 6], [37, 6], [123, 4], [127, 4], [133, 3]] }];
    r4.trainers = [
      { id: 'r4a', x: 7, y: 8, dir: 'down', range: 3, shirt: '#4890e8', hair: '#583820', name: 'PICKNICKER TOM',
        intro: 'Frische Luft, frische Kaempfe!', defeat: 'Naturgewalt!',
        after: 'Im NATURPARK tummeln sich seltene Arten!',
        team: [[16, 22], [48, 23], [43, 24]], reward: { money: 900 } },
      { id: 'r4b', x: 17, y: 12, dir: 'left', range: 3, shirt: '#e87890', hair: '#a06030', name: 'WANDERIN INA',
        intro: 'Der Weg ist das Ziel!', defeat: 'Durchmarschiert!',
        after: 'Hinter dem Park liegt das alte DRACHENTAL...',
        team: [[35, 23], [44, 24], [121, 25]], reward: { money: 950, items: { superpotion: 1 } } },
    ];

    // --- NATURPARK (28x22): Ranger heilt, alle drei EVOLI-Formen wild ---
    const np = outdoor('naturpark', 28, 22);
    np.rect(13, 1, 2, 20, T.PATH);
    np.rect(2, 10, 24, 2, T.PATH);
    np.rect(2, 2, 9, 7, T.TALL);
    np.rect(17, 2, 9, 7, T.TALL);
    np.rect(2, 13, 9, 7, T.TALL);
    np.rect(17, 13, 9, 7, T.TALL);
    np.set(6, 9, T.TREE); np.set(21, 9, T.TREE);
    np.rect(11, 5, 2, 2, T.FLOWER); np.rect(20, 18, 4, 2, T.WATER);
    np.set(12, 11, T.SIGN);
    np.signs['12,11'] = 'NATURPARK - Hier leben sogar alle EVOLI-Formen!';
    np.npcs = [{ x: 14, y: 11, heal: true, shirt: '#287848', hair: '#583820',
      text: 'RANGER: Willkommen im NATURPARK! ... Dein Team ist wieder topfit!' }];
    np.set(14, 20, T.CAVE); np.doors['14,20'] = { warp: 'route4', x: 12, y: 2, dir: 'down' };
    np.set(14, 1, T.CAVE);  np.doors['14,1']  = { warp: 'drachental', x: 11, y: 16, dir: 'up' };
    np.gates = [{ x: 14, y: 1, open: p => !!p.flags.champion,
      text: 'RANGER: Das DRACHENTAL oeffnet sich nur fuer den CHAMPION!' }];
    np.zones = [{ name: 'NATURPARK', x: 1, y: 1, w: 26, h: 20, lv: [16, 26], table: [
      [133, 10], [16, 9], [19, 9], [43, 8], [69, 8], [60, 8], [48, 8], [10, 6], [13, 6],
      [35, 6], [44, 6], [54, 6], [39, 5], [37, 5], [58, 5], [84, 5], [114, 4], [115, 4],
      [128, 4], [123, 3], [127, 3], [125, 3], [126, 3], [134, 2], [135, 2], [136, 2],
      [143, 1], [113, 1]] }];
    np.trainers = [
      { id: 'np1', x: 5, y: 5, dir: 'down', range: 3, shirt: '#a8b820', hair: '#383838', name: 'KAEFERSAMMLER BEN',
        intro: 'Meine Sammlung ist riesig!', defeat: 'Entwischt!',
        after: 'EVOLI kennt viele Entwicklungen!',
        team: [[12, 24], [15, 25], [127, 25]], reward: { money: 1000 } },
      { id: 'np2', x: 22, y: 5, dir: 'left', range: 3, shirt: '#e87890', hair: '#a06030', name: 'DAME ROSALIE',
        intro: 'Eleganz siegt immer!', defeat: 'Wie schade!',
        after: 'Im Park leben alle drei EVOLI-Formen nebeneinander.',
        team: [[134, 24], [26, 25]], reward: { money: 1100, items: { hyperpotion: 1 } } },
      { id: 'np3', x: 6, y: 16, dir: 'right', range: 3, shirt: '#806048', hair: '#888888', name: 'OEKOLOGE KARL',
        intro: 'Respektiere die Natur!', defeat: 'Beeindruckend!',
        after: 'Nur der CHAMP darf ins DRACHENTAL.',
        team: [[71, 25], [59, 26], [103, 26]], reward: { money: 1200 } },
      { id: 'np4', x: 21, y: 16, dir: 'up', range: 3, shirt: '#4890e8', hair: '#c8a030', name: 'SPORTLER MAX',
        intro: 'Sprint zum Sieg!', defeat: 'Aus der Puste!',
        after: 'Trainiere weiter, Champion in spe!',
        team: [[135, 25], [136, 25], [112, 27]], reward: { money: 1200, items: { superpotion: 2 } } },
    ];

    // --- DRACHENTAL (24x18): Endgame hinter dem CHAMPION-Tor ---
    const dt = outdoor('drachental', 24, 18);
    dt.rect(10, 1, 2, 16, T.PATH);
    dt.rect(3, 3, 6, 4, T.TALL);
    dt.rect(15, 3, 6, 4, T.TALL);
    dt.rect(4, 11, 6, 4, T.TALL);
    dt.rect(14, 11, 6, 4, T.TALL);
    dt.rect(15, 7, 6, 3, T.WATER);
    dt.set(8, 8, T.ROCK); dt.set(13, 9, T.ROCK); dt.set(6, 6, T.ROCK);
    dt.set(12, 15, T.SIGN);
    dt.signs['12,15'] = 'DRACHENTAL - Nur fuer wahre CHAMPIONS!';
    dt.set(11, 17, T.CAVE); dt.doors['11,17'] = { warp: 'naturpark', x: 14, y: 2, dir: 'down' };
    dt.zones = [{ name: 'DRACHENTAL', x: 1, y: 1, w: 22, h: 16, lv: [42, 55], table: [
      [147, 16], [148, 10], [116, 10], [42, 8], [59, 8], [142, 6], [130, 6], [112, 6],
      [6, 4], [9, 4], [3, 4], [149, 3]] }];
    dt.trainers = [
      { id: 'dt1', x: 6, y: 8, dir: 'down', range: 3, smart: true, shirt: '#383868', hair: '#c83828', name: 'DRACHENPROFI VEGA',
        intro: 'Drachen sind die Koenige der Luefte!', defeat: 'Wahrhaft majestaetisch!',
        after: 'Du bist des DRACHENTALS wuerdig.',
        team: [[148, 48], [142, 48], [149, 52]], reward: { money: 7000, items: { hyperpotion: 2 } } },
      { id: 'dt2', x: 16, y: 12, dir: 'left', range: 3, smart: true, shirt: '#c8a030', hair: '#a06838', name: 'ASS-TRAINER NOVA',
        intro: 'Nur die Staerksten ueberleben hier!', defeat: 'Du bist eine lebende Legende!',
        after: 'Niemand kommt dir gleich, CHAMPION!',
        team: [[9, 50], [6, 50], [112, 50], [130, 52]], reward: { money: 9000, items: { ultraball: 3 } } },
    ];
  }

  // ==================================== STORY-REGION: TEAM SCHATTEN (NEU) ===
  // Mini-Story, erreichbar ab STEINSTADT (Waldpfad nach Norden):
  //   NEBELWALD (Wild-Encounter, 2 Schatten-Rüpel, Rivale SILAS blockt den Pfad)
  //   -> SCHATTENVERSTECK (Innenraum: 2 Rüpel + BOSS NOX, Belohnung MEISTERBALL).
  // Reines Story-Side-Content; berührt weder Orden-Gating noch die LIGA.
  function buildStoryRegion() {
    const outdoor = (id, w, h) => {
      const m = new GameMap(id, w, h, false);
      m.rect(0, 0, w, h, T.GRASS);
      m.rect(0, 0, w, 1, T.TREE); m.rect(0, h - 1, w, 1, T.TREE);
      m.rect(0, 0, 1, h, T.TREE); m.rect(w - 1, 0, 1, h, T.TREE);
      MAPS[id] = m;
      return m;
    };

    // --- NEBELWALD (26x20) ---
    const nw = outdoor('nebelwald', 26, 20);
    nw.rect(13, 1, 1, 18, T.PATH);                 // schmaler 1-Kachel-Pfad (Rivale gated)
    nw.set(13, 18, T.CAVE); nw.doors['13,18'] = { warp: 'overworld', x: 31, y: 19, dir: 'down' };
    nw.set(13, 1, T.CAVE);  nw.doors['13,1']  = { warp: 'schattenversteck', dir: 'up' };
    nw.rect(3, 4, 5, 4, T.TALL);
    nw.rect(18, 3, 5, 4, T.TALL);
    nw.rect(3, 12, 5, 4, T.TALL);
    nw.rect(17, 12, 6, 4, T.TALL);
    nw.rect(15, 7, 4, 3, T.TALL);
    nw.set(10, 3, T.TREE); nw.set(16, 5, T.TREE); nw.set(9, 11, T.TREE);
    nw.set(20, 9, T.TREE); nw.set(11, 15, T.TREE); nw.set(8, 8, T.TREE);
    nw.rect(5, 9, 2, 1, T.FLOWER);
    nw.set(14, 16, T.SIGN);
    nw.signs['14,16'] = 'NEBELWALD - Dichter Nebel. TEAM SCHATTEN lauert voraus!';
    nw.npcs = [{ x: 12, y: 16, shirt: '#806048', hair: '#583820',
      text: 'Sei vorsichtig! TEAM SCHATTEN hat sich tiefer im Wald verschanzt.' }];
    nw.zones = [{ name: 'NEBELWALD', x: 1, y: 1, w: 24, h: 18, lv: [18, 24], table: [
      [41, 16], [46, 12], [48, 12], [69, 10], [92, 10], [43, 8], [123, 6], [16, 6],
      [102, 5], [114, 4], [108, 3], [137, 1]] }];
    nw.trainers = [
      { id: 'silas1', x: 13, y: 9, dir: 'down', range: 4, smart: true, moveAfter: { x: 12, y: 9 },
        shirt: '#583890', hair: '#382038', name: 'RIVALE SILAS',
        intro: 'Du auch hier? TEAM SCHATTEN gehoert MIR allein - aus dem Weg!',
        defeat: 'Tch! Du bist staerker geworden... Na gut, gehen wir gemeinsam rein.',
        after: 'Der BOSS steckt ganz hinten im Versteck. Pass auf dich auf!',
        team: [[58, 22], [64, 22], [123, 24]], reward: { money: 2000 }, flag: 'rival_silas1' },
      { id: 'grunt1', x: 16, y: 8, dir: 'left', range: 3, shirt: '#282838', hair: '#181818', name: 'SCHATTEN-RUEPEL',
        intro: 'Niemand stoert TEAM SCHATTEN!', defeat: 'Wie konnte das passieren...',
        after: 'Der BOSS wird dich erledigen!',
        team: [[41, 20], [109, 21]], reward: { money: 800 } },
      { id: 'grunt2', x: 16, y: 13, dir: 'left', range: 3, shirt: '#282838', hair: '#383838', name: 'SCHATTEN-RUEPEL',
        intro: 'Verschwinde, Goere!', defeat: 'Autsch!',
        after: 'Du kommst hier nicht so leicht durch!',
        team: [[88, 21], [42, 22]], reward: { money: 850 } },
    ];

    // --- SCHATTENVERSTECK (Innenraum) ---
    const hide = buildInterior('schattenversteck', [
      '############',
      '#..........#',
      '#..s....s..#',
      '#..........#',
      '#.s......s.#',
      '#..........#',
      '#.s......s.#',
      '#..........#',
      '#...ssss...#',
      '#..........#',
      '#..........#',
      '#####mm#####',
    ], { x: 0, y: 0 }, {
      npcs: [{ x: 9, y: 3, shirt: '#c0c0c0', hair: '#c8a030',
        text: 'WISSENSCHAFTLER: Du hast TEAM SCHATTEN gestoppt! Tausend Dank!' }],
      trainers: [
        { id: 'sgrunt3', x: 3, y: 7, dir: 'right', range: 3, shirt: '#282838', hair: '#181818', name: 'SCHATTEN-RUEPEL',
          intro: 'Der BOSS will nicht gestoert werden!', defeat: 'Unmoeglich!',
          after: 'Du wirst es bereuen...',
          team: [[89, 24], [42, 24]], reward: { money: 900 } },
        { id: 'sgrunt4', x: 8, y: 5, dir: 'left', range: 3, shirt: '#282838', hair: '#383838', name: 'SCHATTEN-RUEPEL',
          intro: 'Bis hierher und nicht weiter!', defeat: 'Argh!',
          after: 'Der BOSS ist unbesiegbar!',
          team: [[105, 24], [110, 25]], reward: { money: 950 } },
        { id: 'nox', x: 5, y: 2, dir: 'down', range: 0, smart: true, leader: true,
          shirt: '#481848', hair: '#7038a8', name: 'SCHATTEN-BOSS NOX',
          intro: 'Ich bin NOX, Anfuehrer von TEAM SCHATTEN! Knie nieder!',
          defeat: 'Unfassbar... Mein Team... besiegt. TEAM SCHATTEN loest sich auf!',
          after: 'TEAM SCHATTEN ist Geschichte. Die Region ist wieder sicher.',
          team: [[94, 30], [24, 30], [112, 31], [130, 32]],
          reward: { money: 6000, items: { masterball: 1 } },
          flag: 'team_schatten',
          winMsg: 'Im Versteck findest du einen seltenen MEISTERBALL! TEAM SCHATTEN ist besiegt!' },
      ],
    });
    // Ausgangs-Matten zurueck in den NEBELWALD (statt Overworld)
    for (const k in hide.doors) hide.doors[k] = { warp: 'nebelwald', x: 13, y: 2, dir: 'down' };
  }

  // -------------------------------------------------------- Begegnungen ---
  const GRASS_RATE = 0.12;
  const CAVE_RATE  = 0.08;

  function rollEncounter(zone) {
    const total = zone.table.reduce((s, e) => s + e[1], 0);
    let r = Math.random() * total;
    let pick = zone.table[0][0];
    for (const [id, w] of zone.table) { r -= w; if (r <= 0) { pick = id; break; } }
    const lvl = zone.lv[0] + Math.floor(Math.random() * (zone.lv[1] - zone.lv[0] + 1));
    return Battle.makeMon(pick, lvl);
  }

  const staticActive = s => !Game.player.flags['s_' + s.key] && (!s.needs || Game.player.flags[s.needs]);

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
  const charsetCache = {};
  function buildCharset(shirt, hair) {
    const key = shirt + hair;
    if (charsetCache[key]) return charsetCache[key];
    const pal = { O: '#181818', S: '#f8c890', H: hair, C: shirt, L: '#3048a0' };
    const out = {};
    for (const k in BODY) out[k] = buildSprite(BODY[k], pal);
    return (charsetCache[key] = out);
  }
  const PLAYER_SPRITES = buildCharset('#d03028', '#583820');
  const NPC_SPRITES    = buildCharset('#288848', '#c8a030');

  // Maps bauen + Sprites für alle Figuren vorbereiten
  buildOverworld();
  buildInteriors();
  buildExtraMaps();
  buildStoryRegion();
  for (const id in MAPS) {
    for (const tr of MAPS[id].trainers) tr.sprites = buildCharset(tr.shirt, tr.hair);
    for (const n of MAPS[id].npcs) n.sprites = n.shirt ? buildCharset(n.shirt, n.hair || '#583820') : NPC_SPRITES;
  }

  // ------------------------------------------------------- Tile-Renderer ---
  function drawTile(ctx, t, x, y, anim) {
    if (t === T.VOID) { ctx.fillStyle = '#181818'; ctx.fillRect(x, y, 16, 16); return; }
    // Untergrund (Outdoor-Gras)
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
      case T.FLOOR:
        ctx.fillStyle = '#e0d0b0'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = '#d0c0a0';
        ctx.fillRect(x, y, 16, 1); ctx.fillRect(x, y, 1, 16);
        ctx.fillRect(x + 8, y + 8, 1, 8); ctx.fillRect(x + 8, y + 8, 8, 1);
        break;
      case T.MAT:
        ctx.fillStyle = '#e0d0b0'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = '#487858'; ctx.fillRect(x + 1, y + 2, 14, 12);
        ctx.fillStyle = '#68a878'; ctx.fillRect(x + 3, y + 4, 10, 8);
        break;
      case T.COUNTER:
        ctx.fillStyle = '#e0d0b0'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = '#b04838'; ctx.fillRect(x, y + 4, 16, 12);
        ctx.fillStyle = '#f8f0e0'; ctx.fillRect(x, y + 4, 16, 3);
        ctx.fillStyle = '#883828'; ctx.fillRect(x, y + 14, 16, 2);
        break;
      case T.STATUE:
        ctx.fillStyle = '#e0d0b0'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = '#a8a8b0'; ctx.fillRect(x + 3, y + 2, 10, 12);
        ctx.fillStyle = '#888890'; ctx.fillRect(x + 3, y + 10, 10, 4);
        ctx.fillStyle = '#c8c8d0'; ctx.fillRect(x + 5, y + 4, 4, 4);
        ctx.fillStyle = '#181818'; ctx.fillRect(x + 2, y + 14, 12, 2);
        break;
    }
  }

  // -------------------------------------------------------- WorldScreen ---
  class WorldScreen {
    constructor() { this.reinit(); }

    /** Zustand aus Game.player aufbauen (auch nach Warp/Blackout). */
    reinit() {
      const p = Game.player;
      this.m = MAPS[p.map] || MAPS.overworld;
      p.map = this.m.id;
      this.x = p.x; this.y = p.y;
      this.dir = p.dir || 'up';
      this.moving = false;
      this.progress = 0;
      this.tx = this.x; this.ty = this.y;
      this.frame = 0;
      this.time = 0;
      this.msg = null;
      this.transition = 0;
      this.pendingBattle = null;
      this.engage = null;                   // Sicht-Trainer-Sequenz
      this.warpFade = 0;
      const z = this.m.zoneAt(this.x, this.y);
      this.zoneName = z ? z.name : null;
      this.banner = null;
      // Trainer-Laufzeitpositionen zurücksetzen (besiegt -> moveAfter)
      for (const t of this.m.trainers) {
        const beaten = Game.player.flags['t_' + t.id] || (t.flag && Game.player.flags[t.flag]);
        t.cx = beaten && t.moveAfter ? t.moveAfter.x : t.x;
        t.cy = beaten && t.moveAfter ? t.moveAfter.y : t.y;
        t.cdir = t.dir || 'down';
      }
    }

    trainerBeaten(t) { return !!(Game.player.flags['t_' + t.id] || (t.flag && Game.player.flags[t.flag])); }

    isBlocked(x, y) {
      if (SOLID.has(this.m.get(x, y))) return true;
      if (this.m.npcAt(x, y) || this.m.trainerAt(x, y) || this.m.staticAt(x, y)) return true;
      if (this.m.gateAt(x, y)) return true;
      return false;
    }

    tryMove(dir) {
      this.dir = dir;
      const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
      const nx = this.x + d[0], ny = this.y + d[1];
      const gate = this.m.gateAt(nx, ny);
      if (gate) { this.msg = gate.text; return; }
      if (this.isBlocked(nx, ny)) return;
      this.tx = nx; this.ty = ny;
      this.moving = true; this.progress = 0;
    }

    /** Warp in andere Map (Tür/Matte). */
    warp(target) {
      const p = Game.player;
      p.map = target.map || target.warp;
      const dest = MAPS[p.map];
      if (target.x !== undefined) { p.x = target.x; p.y = target.y; }
      else { p.x = dest.entry.x; p.y = dest.entry.y; }
      p.dir = target.dir || (dest.entry ? dest.entry.dir : 'down');
      this.reinit();
      this.warpFade = 350;
      Sound.warp && Sound.warp();
    }

    arrived() {
      this.x = this.tx; this.y = this.ty;
      Game.player.x = this.x; Game.player.y = this.y; Game.player.dir = this.dir;
      const t = this.m.get(this.x, this.y);

      // Gebiets-Banner (nur Overworld)
      const z = this.m.zoneAt(this.x, this.y);
      if (z && z.name !== this.zoneName) {
        this.zoneName = z.name;
        this.banner = { text: z.name, t: 1400 };
      }

      // Tür / Ausgangs-Matte / Höhleneingang -> Warp (jede registrierte Warp-Kachel)
      const door = this.m.doors[this.x + ',' + this.y];
      if (door) {
        if (door.need && (Game.player.badges || 0) < door.need) {
          this.msg = door.denied;
          return;
        }
        this.warp(door);
        return;
      }

      // Sicht-Trainer?
      const spotter = this.findSpotter();
      if (spotter) {
        this.engage = { t: spotter, phase: 'mark', timer: 650 };
        Sound.alert && Sound.alert();
        return;
      }

      // Zufallsbegegnung (hohes Gras / Höhlenboden)
      if (z && z.table) {
        const rate = t === T.TALL ? GRASS_RATE : (t === T.CAVE && z.cave ? CAVE_RATE : 0);
        if (rate > 0 && Math.random() < rate) {
          this.pendingBattle = { opts: rollEncounter(z), after: null };
          this.transition = 700;
        }
      }
    }

    /** Sieht mich ein unbesiegter Trainer? (gleiche Zeile/Spalte, freie Sicht) */
    findSpotter() {
      for (const tr of this.m.trainers) {
        if (!tr.range || this.trainerBeaten(tr)) continue;
        const dx = this.x - tr.cx, dy = this.y - tr.cy;
        let dir = null;
        if (dx === 0 && dy !== 0) dir = dy > 0 ? 'down' : 'up';
        if (dy === 0 && dx !== 0) dir = dx > 0 ? 'right' : 'left';
        if (!dir || dir !== tr.cdir) continue;
        const dist = Math.abs(dx + dy);
        if (dist > tr.range) continue;
        // freie Sichtlinie?
        const sx = Math.sign(dx), sy = Math.sign(dy);
        let clear = true;
        for (let i = 1; i < dist; i++) {
          const ix = tr.cx + sx * i, iy = tr.cy + sy * i;
          if (SOLID.has(this.m.get(ix, iy)) || this.m.npcAt(ix, iy) || this.m.trainerAt(ix, iy)) { clear = false; break; }
        }
        if (clear) return tr;
      }
      return null;
    }

    /** Trainerkampf vorbereiten (Team-Instanzen frisch erzeugen). */
    startTrainer(def) {
      const team = def.team.map(([id, lvl]) => Battle.makeMon(id, lvl));
      const flagKey = def.flag || 't_' + def.id;
      this.pendingBattle = {
        opts: { trainer: { name: def.name, intro: def.intro, defeat: def.defeat, team, reward: def.reward, smart: def.smart } },
        after: res => {
          if (res.result === 'win') {
            Game.player.flags[flagKey] = true;
            if (def.moveAfter) { def.cx = def.moveAfter.x; def.cy = def.moveAfter.y; }
            if (def.winMsg) this.msg = def.winMsg;
          }
        },
      };
      this.transition = 700;
    }

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

      // Tresen (Heilung / Markt)
      const counter = this.m.counters[fx + ',' + fy];
      if (counter) {
        if (counter.kind === 'heal') {
          for (const mn of Game.player.party) { mn.hp = mn.stats.hp; mn.status = null; }
          Game.player.respawn = { map: this.m.id, x: this.x, y: this.y };
          Game.save();
          Sound.heal && Sound.heal();
          this.msg = `${counter.label}: Dein Team wurde vollstaendig geheilt! Wir sehen uns wieder!`;
        } else if (counter.kind === 'mart') {
          Game.push(new UI.MartScreen(counter.tier));
        }
        return true;
      }

      const tr = this.m.trainerAt(fx, fy);
      if (tr) {
        tr.cdir = { up: 'down', down: 'up', left: 'right', right: 'left' }[this.dir]; // dreht sich zum Spieler
        if (this.trainerBeaten(tr)) this.msg = tr.after || 'Du bist stark!';
        else this.startTrainer(tr);
        return true;
      }
      const st = this.m.staticAt(fx, fy);
      if (st) { this.startStatic(st); return true; }
      const npc = this.m.npcAt(fx, fy);
      if (npc && !npc.deco) {
        if (npc.heal) {
          for (const mn of Game.player.party) { mn.hp = mn.stats.hp; mn.status = null; }
          Game.player.respawn = { map: this.m.id, x: this.x, y: this.y };
          Game.save();
          Sound.heal && Sound.heal();
        }
        this.msg = npc.text;
        return true;
      }
      if (this.m.get(fx, fy) === T.SIGN) { this.msg = this.m.signs[fx + ',' + fy] || '...'; return true; }
      const gate = this.m.gateAt(fx, fy);
      if (gate) { this.msg = gate.text; return true; }
      return false;
    }

    startBattle() {
      const pb = this.pendingBattle;
      this.pendingBattle = null;
      Game.push(new Battle.BattleScreen(pb.opts, res => {
        if (res.result === 'lose') {
          // Blackout: heilen + zurück zum letzten Heilpunkt
          for (const mn of Game.player.party) { mn.hp = mn.stats.hp; mn.status = null; }
          const r = Game.player.respawn || { map: 'overworld', x: 11, y: 54 };
          Game.player.map = r.map || 'overworld';
          Game.player.x = r.x; Game.player.y = r.y; Game.player.dir = 'down';
          this.reinit();
          this.msg = 'Du bist zum letzten Heilpunkt geeilt und hast dein Team geheilt.';
        }
        pb.after && pb.after(res);
        Game.save(); // Auto-Save nach jedem Kampf
      }));
    }

    update(dt) {
      this.time += dt;
      if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
      if (this.warpFade > 0) { this.warpFade -= dt; return; }

      if (this.transition > 0) {
        this.transition -= dt;
        if (this.transition <= 0) this.startBattle();
        return;
      }

      // Sicht-Trainer-Sequenz: "!" -> heranlaufen -> Kampf
      if (this.engage) {
        const e = this.engage;
        if (e.phase === 'mark') {
          e.timer -= dt;
          if (e.timer <= 0) { e.phase = 'walk'; e.prog = 0; }
          return;
        }
        // walk: ein Tile pro 180ms Richtung Spieler
        const t = e.t;
        const dx = Math.sign(this.x - t.cx), dy = Math.sign(this.y - t.cy);
        t.cdir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
        if (Math.abs(this.x - t.cx) + Math.abs(this.y - t.cy) <= 1) {
          // angekommen: Spieler dreht sich um, Kampf!
          this.dir = { right: 'left', left: 'right', down: 'up', up: 'down' }[t.cdir];
          this.engage = null;
          this.startTrainer(t);
          return;
        }
        e.prog = (e.prog || 0) + dt;
        if (e.prog >= 180) { e.prog = 0; t.cx += dx; t.cy += dy; }
        return;
      }

      if (this.msg) {
        if (Input.take('a') || Input.take('b')) this.msg = null;
        return;
      }

      if (this.moving) {
        this.progress += dt / 220;
        this.frame += dt;
        if (this.progress >= 1) { this.moving = false; this.progress = 0; this.arrived(); }
        return;
      }

      if (Input.take('a')) {
        if (!this.interact()) Game.push(new UI.PauseMenuScreen());
        return;
      }
      for (const dir of ['up', 'down', 'left', 'right']) {
        if (Input.down(dir)) { this.tryMove(dir); break; }
      }
    }

    draw(ctx) {
      const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[this.dir];
      const px = (this.x + (this.moving ? d[0] * this.progress : 0)) * TILE;
      const py = (this.y + (this.moving ? d[1] * this.progress : 0)) * TILE;

      // Kamera: klemmen; kleine Innenräume werden zentriert
      const mw = this.m.w * TILE, mh = this.m.h * TILE;
      const camX = mw <= 160 ? (mw - 160) / 2 : Math.max(0, Math.min(px - 72, mw - 160));
      const camY = mh <= 144 ? (mh - 144) / 2 : Math.max(0, Math.min(py - 64, mh - 144));
      const anim = Math.floor(this.time / 500);

      ctx.fillStyle = '#181818'; ctx.fillRect(0, 0, 160, 144);
      const x0 = Math.floor(camX / TILE), y0 = Math.floor(camY / TILE);
      for (let ty = y0; ty <= y0 + 9; ty++) {
        for (let tx = x0; tx <= x0 + 10; tx++) {
          drawTile(ctx, this.m.get(tx, ty), Math.round(tx * TILE - camX), Math.round(ty * TILE - camY), anim);
        }
      }

      const sx = wx => Math.round(wx * TILE - camX);
      const sy = wy => Math.round(wy * TILE - camY);
      const visible = (wx, wy) => wx >= x0 - 1 && wx <= x0 + 11 && wy >= y0 - 1 && wy <= y0 + 10;

      // Geschlossene Tore
      for (const g of this.m.gates) {
        if (!g.open(Game.player) && visible(g.x, g.y)) {
          const gx = sx(g.x), gy = sy(g.y);
          ctx.fillStyle = '#806048';
          ctx.fillRect(gx + 1, gy + 3, 3, 11); ctx.fillRect(gx + 12, gy + 3, 3, 11);
          ctx.fillRect(gx, gy + 5, 16, 2); ctx.fillRect(gx, gy + 10, 16, 2);
          ctx.fillStyle = '#f8d030'; ctx.fillRect(gx + 6, gy + 6, 4, 5);
        }
      }

      // NPCs
      for (const n of this.m.npcs) {
        if (visible(n.x, n.y)) ctx.drawImage(n.sprites.down0, sx(n.x), sy(n.y) - 2);
      }
      // Trainer (mit Blickrichtung)
      for (const tr of this.m.trainers) {
        if (!visible(tr.cx, tr.cy)) continue;
        ctx.drawImage(tr.sprites[tr.cdir + '0'], sx(tr.cx), sy(tr.cy) - 2);
        // "!"-Blase während der Entdeckung
        if (this.engage && this.engage.t === tr && this.engage.phase === 'mark') {
          UI.box(ctx, sx(tr.cx) + 2, sy(tr.cy) - 18, 13, 14);
          UI.text(ctx, '!', sx(tr.cx) + 6, sy(tr.cy) - 14, '#e03028');
        }
      }
      // Legendäre
      for (const st of this.m.statics) {
        if (!staticActive(st) || !visible(st.x, st.y)) continue;
        const sp = Data.byId(st.id);
        const img = Data.sprite(sp.front);
        if (img) ctx.drawImage(img, sx(st.x), sy(st.y) - 2, 16, 16);
        else {
          ctx.fillStyle = Data.TYPE_COLORS[sp.types[0]] || '#a8a878';
          ctx.beginPath(); ctx.arc(sx(st.x) + 8, sy(st.y) + 6, 6, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Spieler
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

      // Warp-Fade
      if (this.warpFade > 0) {
        ctx.globalAlpha = Math.min(1, this.warpFade / 250);
        ctx.fillStyle = '#181818'; ctx.fillRect(0, 0, 160, 144);
        ctx.globalAlpha = 1;
      }
      // Kampf-Überblendung (Flackern)
      if (this.transition > 0 && Math.floor(this.transition / 90) % 2 === 0) {
        ctx.fillStyle = '#181818'; ctx.fillRect(0, 0, 160, 144);
      }
    }
  }

  return {
    WorldScreen, TILE, START: { x: 11, y: 54 },
    _dbg: { MAPS, T, SOLID },
  };
})();
