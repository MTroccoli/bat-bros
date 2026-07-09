/* ============================================================
   BAT BROS — Definiciones de niveles (LEVEL_SPECS).
   Cada entrada describe la geometría, enemigos, monedas y puntos
   de agarre de un nivel. buildLevel() (en catalog.js) convierte
   estos specs en grillas de colisión y listas de entidades.
   ============================================================ */

const LEVEL_SPECS = [
  {
    name: '1-1',
    width: 80, height: 26, groundY: 24,
    pits: [[18, 20], [46, 52]],
    platforms: [
      { x: 8, y: 21, w: 3 },
      { x: 38, y: 21, w: 3 },
      { x: 66, y: 21, w: 3 },
    ],
    walls: [{ x: 30, w: 3, topRow: 18 }],
    houses: [{ x: 54, w: 6, topRow: 21, baseRow: 24, style: 'brownstone' }],
    swingPoints: [[31, 16], [49, 16]],
    coins: [
      [9, 20], [39, 20], [67, 20],
      [30, 17], [31, 17], [32, 17],
      [56, 20], [57, 20],
      [14, 23], [24, 23], [43, 23], [72, 23],
    ],
    thugs: [
      { x: 12, y: 24, range: [10, 16] },
      { x: 24, y: 24, range: [22, 29] },
      { x: 30, y: 18, range: [30, 32] },
      { x: 40, y: 24, range: [36, 44] },
      { x: 56, y: 21, range: [54, 59] },
      { x: 62, y: 24, range: [61, 66] },
    ],
    birds: [
      { x: 22, y: 21, range: [20, 27] },
      { x: 47, y: 20, range: [45, 53] },
    ],
    bats: [[39, 21]],
    spawn: { x: 2, y: 22 },
  },
  {
    name: '1-2',
    width: 96, height: 30, groundY: 28,
    pits: [[12, 13], [70, 76]],
    platforms: [
      { x: 6, y: 25, w: 3 },
      { x: 60, y: 25, w: 3 },
      { x: 80, y: 25, w: 3 },
    ],
    walls: [
      { x: 24, w: 4, topRow: 22 },
      { x: 28, w: 4, topRow: 19 },
      { x: 32, w: 9, topRow: 13 },
      { x: 41, w: 4, topRow: 16 },
      { x: 45, w: 4, topRow: 19 },
      { x: 49, w: 4, topRow: 22 },
      { x: 86, w: 3, topRow: 22 },
    ],
    houses: [{ x: 34, w: 6, topRow: 10, baseRow: 13, style: 'terrace' }],
    swingPoints: [[25, 20], [33, 11], [50, 20], [73, 20], [87, 20]],
    coins: [
      [25, 21],
      [33, 12], [35, 9], [37, 9], [40, 12],
      [61, 24], [81, 24], [87, 21],
      [5, 27], [18, 27], [55, 27], [66, 27],
    ],
    thugs: [
      { x: 6, y: 28, range: [3, 10] },
      { x: 16, y: 28, range: [14, 22] },
      { x: 32, y: 13, range: [31, 34] },
      { x: 36, y: 10, range: [34, 40] },
      { x: 45, y: 19, range: [43, 48] },
      { x: 56, y: 28, range: [54, 59] },
      { x: 64, y: 28, range: [62, 68] },
      { x: 80, y: 28, range: [78, 84] },
      { x: 91, y: 28, range: [90, 95] },
    ],
    birds: [
      { x: 30, y: 17, range: [26, 36] },
      { x: 66, y: 24, range: [63, 69] },
    ],
    bats: [[7, 25]],
    spawn: { x: 2, y: 26 },
  },
  {
    name: '1-3',
    width: 70, height: 34, groundY: 32,
    pits: [[14, 16], [24, 26]],
    platforms: [
      { x: 8, y: 29, w: 3 },
      { x: 20, y: 29, w: 3 },
    ],
    walls: [
      { x: 30, w: 4, topRow: 26 },
      { x: 34, w: 4, topRow: 20 },
      { x: 38, w: 10, topRow: 14 },
      { x: 48, w: 8, topRow: 16 },
      { x: 56, w: 8, topRow: 10 },
      { x: 64, w: 3, topRow: 13 },
      { x: 67, w: 3, topRow: 16 },
    ],
    houses: [{ x: 40, w: 6, topRow: 11, baseRow: 14, style: 'brownstone' }],
    swingPoints: [[31, 24], [35, 18], [39, 12], [57, 8]],
    coins: [
      [9, 28], [21, 28],
      [31, 25], [35, 19],
      [39, 13], [42, 10], [43, 10], [46, 13],
      [50, 15], [52, 15],
      [60, 9],
      [5, 31], [19, 31],
    ],
    thugs: [
      { x: 5, y: 32, range: [3, 9] },
      { x: 18, y: 32, range: [17, 23] },
      { x: 28, y: 32, range: [27, 29] },
      { x: 35, y: 20, range: [34, 37] },
      { x: 42, y: 11, range: [40, 45] },
      { x: 50, y: 16, range: [48, 55] },
    ],
    birds: [
      { x: 10, y: 26, range: [6, 13] },
      { x: 50, y: 13, range: [48, 54] },
    ],
    bats: [[21, 29], [39, 14]],
    spawn: { x: 2, y: 30 },
  },
  {
    name: '1-4',
    indoor: true,
    width: 34, height: 15, groundY: 13,
    pits: [],
    platforms: [
      { x: 10, w: 2, y: 6 },
      { x: 21, w: 2, y: 6 },
    ],
    walls: [],
    swingPoints: [[11, 4], [16, 2, null, true], [22, 4]],
    coins: [],
    thugs: [],
    birds: [],
    bats: [],
    bane: { x: 15, hp: 5 },
    spawn: { x: 2, y: 11 },
  },
  {
    name: 'CUEVA',
    cave: {
      entrance: 1,
      computer: 40,
      penny: 57,
      trex: 65,
      door: 73,
      plateauRow: 9,
      batTiles: [5, 9, 14, 19, 22, 35, 48, 55, 68],
      dropTiles: [5, 11, 18, 23, 30, 37, 44, 49, 55, 61, 67, 72],
    },
    width: 76, height: 15, groundY: 13,
    pits: [],
    platforms: [],
    walls: [
      { x: 24, w: 4, topRow: 11 },
      { x: 28, w: 48, topRow: 9 },
    ],
    houses: [],
    swingPoints: [[44, 3], [50, 3]],
    coins: [],
    thugs: [],
    birds: [],
    bats: [],
    spawn: { x: 2, y: 11 },
  },
  {
    name: '2-1',
    dock: true,
    width: 96, height: 20, groundY: 17,
    pits: [[16, 21], [52, 71]],
    platforms: [],
    walls: [
      { x: 30, w: 5, topRow: 11 },
    ],
    ladders: [
      { x: 29, topRow: 11, baseRow: 17 },
      { x: 35, topRow: 11, baseRow: 17 },
    ],
    houses: [],
    swingPoints: [
      [17, 11],
      [54, 11], [67, 11],
    ],
    // a raft drifts across the middle of the wide gap between the two
    // hooks — no fixed rest stop anymore, land on it mid-swing or time a
    // hop onto it while it passes
    boats: [
      { x: 58, y: 17, w: 3, range: [53, 66], speed: 2.3 },
    ],
    coins: [
      [4, 15], [9, 15], [13, 15],
      [24, 15], [28, 15],
      [31, 10], [33, 10],
      [38, 15], [42, 15], [48, 15],
      [54, 14], [61, 15], [67, 14],
      [73, 15], [77, 15], [81, 15], [87, 15], [91, 15],
    ],
    thugs: [
      { x: 8, y: 17, range: [6, 13], helmet: true },
      { x: 24, y: 17, range: [22, 29] },
      { x: 32, y: 11, range: [31, 34], helmet: true },
      { x: 42, y: 17, range: [38, 48] },
      { x: 49, y: 17, range: [46, 51], helmet: true },
      { x: 76, y: 17, range: [73, 81] },
      { x: 86, y: 17, range: [83, 93], helmet: true },
    ],
    birds: [
      { x: 45, y: 13, range: [40, 50] },
      { x: 78, y: 14, range: [72, 90] },
    ],
    bats: [[60, 14]],
    spawn: { x: 2, y: 15 },
  },
  {
    name: '2-2',
    dock: true,
    width: 112, height: 24, groundY: 21,
    pits: [[48, 70], [88, 100]],
    platforms: [],
    walls: [
      { x: 14, w: 4, topRow: 15 },
      { x: 22, w: 4, topRow: 15 },
      { x: 30, w: 4, topRow: 13 },
      { x: 38, w: 4, topRow: 13 },
      { x: 44, w: 2, topRow: 17 },
      { x: 47, w: 2, topRow: 13 },
      { x: 72, w: 5, topRow: 15 },
      { x: 102, w: 4, topRow: 15 },
    ],
    ladders: [
      { x: 13, topRow: 15, baseRow: 21 },
      { x: 18, topRow: 15, baseRow: 21 },
      { x: 26, topRow: 15, baseRow: 21 },
      { x: 29, topRow: 13, baseRow: 21 },
      { x: 37, topRow: 13, baseRow: 21 },
      { x: 42, topRow: 13, baseRow: 21 },
      { x: 46, topRow: 13, baseRow: 21 },
      { x: 71, topRow: 15, baseRow: 21 },
      { x: 77, topRow: 15, baseRow: 21 },
      { x: 101, topRow: 15, baseRow: 21 },
    ],
    houses: [],
    cranes: [
      { towerX: 47, armY: 3, armEndX: 58, ropeLen: 11, cargoW: 3, speed: 0.0012, amplitude: 0.45 },
    ],
    boats: [
      { x: 92, y: 21, w: 3, range: [89, 99], speed: 2.0 },
    ],
    swingPoints: [
      [67, 9],
      [89, 13], [99, 13],
    ],
    coins: [
      [4, 19], [8, 19], [12, 19],
      [17, 14], [25, 14],
      [33, 12], [41, 12],
      [74, 14], [78, 19], [82, 19],
      [92, 18], [96, 18],
      [103, 14], [108, 19],
    ],
    thugs: [
      { x: 6, y: 21, range: [3, 12] },
      { x: 11, y: 21, range: [9, 13], helmet: true },
      { x: 19, y: 21, range: [18, 21] },
      { x: 16, y: 15, range: [13, 18], helmet: true },
      { x: 35, y: 21, range: [34, 37], helmet: true },
      { x: 32, y: 13, range: [29, 33] },
      { x: 74, y: 15, range: [71, 77] },
      { x: 80, y: 21, range: [78, 84], helmet: true },
      { x: 103, y: 15, range: [101, 105] },
      { x: 108, y: 21, range: [106, 111], helmet: true },
    ],
    birds: [
      { x: 28, y: 11, range: [26, 36] },
      { x: 58, y: 11, range: [50, 66] },
      { x: 95, y: 14, range: [88, 100] },
    ],
    bats: [[45, 17]],
    spawn: { x: 2, y: 19 },
  },
  {
    name: '2-3',
    chase: true,
    dock: true,
    width: 25, height: 15, groundY: 13,
    pits: [],
    platforms: [],
    walls: [],
    houses: [],
    swingPoints: [],
    coins: [],
    thugs: [],
    birds: [],
    bats: [],
    spawn: { x: 3, y: 10 },
  },
  {
    name: '2-4',
    indoor: true,
    dock: true,
    width: 20, height: 32, groundY: 30,
    pits: [],
    // Single vertical ladder up the center. Catwalks every 3 rows (the
    // minimum that fits big Batman) with thugs crossing the shaft; only
    // two rest zones on the whole climb. From a rest zone you can drop
    // onto the catwalk below to stomp its (helmetless) thug.
    platforms: [
      { x: 2, y: 27, w: 16 },                      // catwalk 1
      { x: 2, y: 24, w: 16 },                      // catwalk 2 (stompable from rest 1)
      { x: 3, y: 21, w: 4 }, { x: 13, y: 21, w: 4 }, // rest zone 1
      { x: 2, y: 18, w: 16 },                      // catwalk 3 (double patrol)
      { x: 2, y: 15, w: 16 },                      // catwalk 4 (stompable from rest 2)
      { x: 3, y: 12, w: 4 }, { x: 13, y: 12, w: 4 }, // rest zone 2 + checkpoint
      { x: 2, y: 9, w: 16 },                       // catwalk 5 (final gauntlet)
      { x: 1, y: 6, w: 18 },                       // engine-room arena
    ],
    walls: [],
    houses: [],
    ladders: [
      { x: 9, topRow: 6, baseRow: 30 },  // THE ladder — one shaft, bottom to top
    ],
    swingPoints: [],
    coins: [
      [5, 26], [14, 23],
      [4, 20], [15, 20],
      [4, 11], [15, 11],
    ],
    // thugs cross the ladder shaft on every catwalk; helmets can't be
    // stomped (dodge them or batarang), helmetless ones under a rest zone
    // are the "clean up after the hard passage" reward
    thugs: [
      { x: 5, y: 30, range: [2, 18] },                    // ground
      { x: 12, y: 27, range: [2, 18], helmet: true },     // catwalk 1
      { x: 4, y: 24, range: [2, 18] },                    // catwalk 2
      { x: 14, y: 24, range: [2, 18] },                   // catwalk 2 (opposite phase)
      { x: 4, y: 18, range: [2, 18], helmet: true },      // catwalk 3
      { x: 14, y: 18, range: [2, 18] },                   // catwalk 3
      { x: 5, y: 15, range: [2, 18] },                    // catwalk 4
      { x: 4, y: 9, range: [2, 18], helmet: true },       // catwalk 5
      { x: 14, y: 9, range: [2, 18], helmet: true },      // catwalk 5
    ],
    // birds sweep through the open bands between platforms, right across
    // the ladder shaft — one more thing to time
    birds: [
      { x: 14, y: 20, range: [2, 17] },
      { x: 5, y: 11, range: [2, 17] },
    ],
    bats: [[15, 12]],   // checkpoint on rest zone 2
    twoface: { x: 14, hp: TWOFACE_HP, floorRow: 6, arenaMinX: 7, arenaMaxX: 18, triggerX: 6, robinX: 2 },
    spawn: { x: 2, y: 28 },
  },
];

const BOSS_LEVEL_INDEX = LEVEL_SPECS.findIndex(s => s.bane);
