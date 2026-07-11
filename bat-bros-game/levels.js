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
    width: 20, height: 32, groundY: 30,
    pits: [],
    // Ship's hold: single central ladder up the middle, catwalks every
    // 3 rows, cargo containers stacked in the corners of every catwalk
    // (as if resting on each deck), rest zones every 6 rows. Top of the
    // climb opens into the engine-room arena floor at row 6.
    platforms: [
      { x: 0, y: 6, w: 20 },                       // engine-room ARENA floor
                                                   // (spans full width so
                                                   // Batman can't fall off
                                                   // the sides during the
                                                   // Two-Face fight)
      { x: 4, y: 9, w: 12 },                       // catwalk 5 (narrow)
      { x: 3, y: 12, w: 4 }, { x: 13, y: 12, w: 4 }, // rest zone 2 + checkpoint
      { x: 2, y: 15, w: 16 },                      // catwalk 4 (wide)
      { x: 4, y: 18, w: 12 },                      // catwalk 3 (narrow — triple patrol)
      { x: 3, y: 21, w: 4 }, { x: 13, y: 21, w: 4 }, // rest zone 1
      { x: 4, y: 24, w: 12 },                      // catwalk 2 (narrow)
      { x: 2, y: 27, w: 16 },                      // catwalk 1 (wide)
    ],
    walls: [],
    // Cargo containers rest ON each catwalk (2 tiles tall, in the
    // corners), like real freight stacked on decks. Rest zones and the
    // arena stay clean.
    houses: [
      // catwalk 1 (wide row 27) — big corner stacks
      { x: 2,  w: 3, topRow: 25, baseRow: 27, style: 'container' },
      { x: 15, w: 3, topRow: 25, baseRow: 27, style: 'container' },
      // catwalk 2 (narrow row 24)
      { x: 4,  w: 3, topRow: 22, baseRow: 24, style: 'container' },
      { x: 13, w: 3, topRow: 22, baseRow: 24, style: 'container' },
      // catwalk 3 (narrow row 18)
      { x: 4,  w: 3, topRow: 16, baseRow: 18, style: 'container' },
      { x: 13, w: 3, topRow: 16, baseRow: 18, style: 'container' },
      // catwalk 4 (wide row 15)
      { x: 2,  w: 3, topRow: 13, baseRow: 15, style: 'container' },
      { x: 15, w: 3, topRow: 13, baseRow: 15, style: 'container' },
      // catwalk 5 (narrow row 9)
      { x: 4,  w: 3, topRow: 7,  baseRow: 9,  style: 'container' },
      { x: 13, w: 3, topRow: 7,  baseRow: 9,  style: 'container' },
    ],
    ladders: [
      { x: 9, topRow: 6, baseRow: 30 },
    ],
    swingPoints: [],
    coins: [
      [8, 26], [11, 26],
      [8, 20], [11, 20],
      [8, 14], [11, 14],
      [8, 8],  [11, 8],
    ],
    thugs: [
      // ground: 2 patrolling the ship's floor
      { x: 5,  y: 30, range: [2, 17] },
      { x: 14, y: 30, range: [2, 17] },
      // catwalk 1 wide (row 27): walkable middle cols 5-14
      { x: 6,  y: 27, range: [5, 14] },
      { x: 12, y: 27, range: [5, 14], helmet: true },
      // catwalk 2 narrow (row 24): walkable cols 7-12
      { x: 8,  y: 24, range: [7, 12] },
      { x: 11, y: 24, range: [7, 12], helmet: true },
      // catwalk 3 narrow (row 18): TRIPLE patrol
      { x: 7,  y: 18, range: [7, 12], helmet: true },
      { x: 10, y: 18, range: [7, 12] },
      { x: 12, y: 18, range: [7, 12] },
      // catwalk 4 wide (row 15): walkable cols 5-14
      { x: 6,  y: 15, range: [5, 14] },
      { x: 13, y: 15, range: [5, 14], helmet: true },
      // catwalk 5 narrow (row 9): final gauntlet
      { x: 8,  y: 9,  range: [7, 12], helmet: true },
      { x: 11, y: 9,  range: [7, 12], helmet: true },
    ],
    // birds sweep the ladder shaft in the CLEAR gaps between decks.
    // Rows 11 and 20 are the middle rows of each gap — the birds'
    // vertical bob (~10 px) still clears the catwalks above and below,
    // so they patrol the full width and actually cross the ladder.
    birds: [
      { x: 9, y: 11, range: [3, 16] },
      { x: 9, y: 20, range: [3, 16] },
    ],
    bats: [[14, 12]],   // checkpoint on rest zone 2
    twoface: {
      x: 14, hp: TWOFACE_HP, floorRow: 6,
      arenaMinX: 6, arenaMaxX: 18, triggerX: 5,
      ropeAnchorCol: 3,
      tankCol: 1, tankWidthCols: 4,
    },
    spawn: { x: 3, y: 28 },
  },
];

// ============================================================
// ACTO 3 — Mr. Freeze congela Gotham. Piso resbaladizo, enemigos
// congelados que arrancan lentísimos y se descongelan al primer hit.
// ============================================================
// 3-1 — icy street. Reads like a beefed-up 1-1: small pyramids
// for warm-up stomps, one wall that needs a grapple over the first
// pit, then a mid-height stepped rooftop for the helmet thugs, and
// a gable-house stair to finish. All heights within Batman's jump
// arc (max ~3.5 tiles) with grapple anchors placed like 1-1.
LEVEL_SPECS.push({
  name: '3-1',
  frozen: true,
  width: 84, height: 26, groundY: 24,
  pits: [[26, 28], [58, 61]],
  platforms: [
    // stepped rooftop 1 — climbable staircase (2-tile jumps)
    { x: 6, y: 22, w: 2 },
    { x: 8, y: 20, w: 4 },
    { x: 12, y: 22, w: 2 },
    // mid-height rooftop past the first pit (reached by swinging)
    { x: 36, y: 21, w: 5 },
    // stepped roof 2 — small pyramid Batman can hop up
    { x: 42, y: 22, w: 2 },
    { x: 44, y: 20, w: 3 },
    { x: 47, y: 22, w: 2 },
    // ledge past the second pit
    { x: 64, y: 21, w: 3 },
    // gable-house stair on the right
    { x: 72, y: 22, w: 2 },
    { x: 74, y: 20, w: 5 },
    { x: 79, y: 22, w: 2 },
  ],
  // Only one grapple-required wall (Act-1 vocabulary). Everything else
  // is stompable stairs.
  walls: [{ x: 30, w: 3, topRow: 18 }],
  houses: [
    { x: 74, w: 5, topRow: 17, baseRow: 20, style: 'gable' },
  ],
  // Anchor over the tall wall (like 1-1's [31,16]) plus two low
  // lamps that let Batman swing across the pits at a moderate height.
  swingPoints: [[31, 15], [54, 17], [67, 17]],
  coins: [
    [9, 19], [10, 19], [11, 19],
    [30, 17], [31, 17], [32, 17],
    [37, 20], [38, 20], [39, 20],
    [45, 19],
    [64, 20], [65, 20],
    [75, 19], [76, 19],
    [4, 23], [17, 23], [42, 23], [55, 23], [70, 23], [82, 23],
  ],
  thugs: [
    { x: 4, y: 24, range: [3, 6], frozen: true },
    { x: 15, y: 24, range: [13, 18], frozen: true },
    { x: 10, y: 20, range: [8, 11], frozen: true },
    { x: 22, y: 24, range: [20, 25], frozen: true },
    { x: 38, y: 21, range: [36, 40], helmet: true, frozen: true },
    { x: 45, y: 20, range: [44, 46], frozen: true },
    { x: 50, y: 24, range: [48, 55], helmet: true, frozen: true },
    { x: 64, y: 21, range: [64, 66], helmet: true, frozen: true },
    { x: 68, y: 24, range: [63, 71], frozen: true },
    { x: 76, y: 20, range: [74, 78], frozen: true },
    { x: 82, y: 24, range: [80, 83], frozen: true },
  ],
  // Snow cannons — anti-air upward shots. Placed on open street tiles
  // so Batman has to time his crossings around the puff of snowballs.
  snowCannons: [
    { x: 20, interval: 2600 },
    { x: 52, interval: 2200 },
  ],
  birds: [
    { x: 22, y: 20, range: [16, 28], frozen: true },
    { x: 50, y: 18, range: [44, 58], frozen: true },
    { x: 68, y: 20, range: [62, 74], frozen: true },
  ],
  bats: [[45, 19]],
  spawn: { x: 2, y: 22 },
});

// 3-2 — mixed Act-1/Act-2 climb up frozen dock rooftops. Warm-up
// pyramid, a tall building with a grapple over, a big gable-house
// stepped roof (Act-1 vocabulary), and one Robin-friendly chain of
// small platforms at the end. Every height sits within Batman's
// jump arc from an adjacent step.
LEVEL_SPECS.push({
  name: '3-2',
  frozen: true,
  width: 96, height: 30, groundY: 28,
  pits: [[14, 16], [72, 76]],
  platforms: [
    { x: 6, y: 26, w: 3 },
    // warm-up pyramid before the first pit
    { x: 8, y: 26, w: 2 },
    { x: 10, y: 24, w: 3 },
    // stepped rooftop past pit #1 — pushed right so big Batman has
    // room to squeeze between the first snow cannon (x=18) and the
    // first step. Was x=20/22/26; now x=22/24/28.
    { x: 22, y: 25, w: 2 },
    { x: 24, y: 23, w: 4 },
    { x: 28, y: 25, w: 2 },
    // twin-gable stepped roof (mid-air)
    { x: 42, y: 25, w: 2 },
    { x: 44, y: 23, w: 3 },
    { x: 47, y: 21, w: 3 },
    { x: 50, y: 23, w: 3 },
    { x: 53, y: 25, w: 2 },
    // ledge before the last pit
    { x: 62, y: 25, w: 3 },
    // Robin double-jump chain (Batman can also climb via ladder wall
    // at x=80, but the small platforms let Robin show off)
    { x: 80, y: 25, w: 2 },
    { x: 84, y: 23, w: 2 },
    { x: 88, y: 21, w: 3 },
  ],
  // One grapple-required tall wall (like 1-2's stepped skyline).
  walls: [{ x: 32, w: 3, topRow: 20 }],
  ladders: [
    // ladders let Robin climb the tall wall without the grapple
    { x: 32, topRow: 20, baseRow: 28 },
    { x: 34, topRow: 20, baseRow: 28 },
  ],
  houses: [
    { x: 88, w: 3, topRow: 18, baseRow: 21, style: 'brownstone' },
  ],
  // Grapple over the tall wall + one swing to make the twin-gable
  // roof reachable from below.
  swingPoints: [[33, 17], [46, 18], [66, 18]],
  coins: [
    [5, 27], [18, 27], [56, 27], [68, 27],
    [10, 23], [24, 22],
    [45, 22], [47, 20], [48, 20], [50, 22],
    [62, 24], [63, 24],
    [80, 24], [84, 22], [88, 20],
    [30, 19], [31, 19], [32, 19],
  ],
  thugs: [
    { x: 6, y: 28, range: [3, 10], frozen: true },
    { x: 24, y: 23, range: [24, 27], helmet: true, frozen: true },
    { x: 26, y: 28, range: [22, 30], frozen: true },
    { x: 38, y: 28, range: [36, 42], frozen: true },
    { x: 47, y: 21, range: [47, 49], helmet: true, frozen: true },
    { x: 56, y: 28, range: [54, 62], frozen: true },
    { x: 65, y: 28, range: [62, 71], frozen: true },
    { x: 80, y: 25, range: [80, 81], helmet: true, frozen: true },
    { x: 89, y: 18, range: [88, 90], helmet: true, frozen: true },
    { x: 92, y: 28, range: [90, 95], frozen: true },
  ],
  snowCannons: [
    { x: 18, interval: 2400 },
    { x: 58, interval: 2600 },
  ],
  birds: [
    { x: 30, y: 22, range: [26, 36], frozen: true },
    { x: 66, y: 20, range: [60, 72], frozen: true },
  ],
  bats: [[47, 20]],
  spawn: { x: 2, y: 26 },
});

// 3-3 — frozen docks. Wooden pier is skipped (kept indoor-ish feel);
// gable roofs plus a stack of thugs to stomp/batarang.
LEVEL_SPECS.push({
  name: '3-3',
  frozen: true,
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
  ],
  houses: [
    { x: 48, w: 6, topRow: 26, baseRow: 32, style: 'gable' },
    { x: 58, w: 6, topRow: 24, baseRow: 32, style: 'gable' },
  ],
  swingPoints: [[31, 24], [35, 18], [39, 12]],
  coins: [
    [9, 28], [21, 28],
    [31, 25], [35, 19], [39, 13],
    [50, 25], [60, 23],
    [5, 31], [19, 31],
  ],
  thugs: [
    { x: 5, y: 32, range: [3, 9], frozen: true },
    { x: 18, y: 32, range: [17, 23], frozen: true },
    { x: 28, y: 32, range: [27, 29], helmet: true, frozen: true },
    { x: 35, y: 20, range: [34, 37], frozen: true },
    { x: 42, y: 14, range: [40, 47], helmet: true, frozen: true },
    { x: 50, y: 26, range: [48, 53], frozen: true },
    { x: 60, y: 24, range: [58, 63], frozen: true },
  ],
  snowCannons: [
    { x: 12, interval: 2500 },
    { x: 22, interval: 2900 },
    { x: 52, interval: 2300 },
  ],
  birds: [
    { x: 20, y: 24, range: [15, 28], frozen: true },
    { x: 50, y: 18, range: [45, 55], frozen: true },
  ],
  bats: [],
  spawn: { x: 2, y: 30 },
});

const BOSS_LEVEL_INDEX = LEVEL_SPECS.findIndex(s => s.bane);
