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
      { x: 32, y: 13, range: [32, 40] },
      { x: 36, y: 10, range: [34, 39] },
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
    bats: [[46, 19]],
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
    bats: [[39, 14]],
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
    // stepped rooftop 1 — climbable staircase (raised the row-22
    // steps to row 21 so big Batman can walk under them without
    // his head clipping the platform).
    { x: 6, y: 21, w: 2 },
    { x: 8, y: 20, w: 4 },
    { x: 12, y: 21, w: 2 },
    // mid-height rooftop past the first pit (reached by swinging)
    { x: 36, y: 21, w: 5 },
    // stepped roof 2 — small pyramid Batman can hop up
    { x: 42, y: 21, w: 2 },
    { x: 44, y: 20, w: 3 },
    { x: 47, y: 21, w: 2 },
    // ledge past the second pit
    { x: 64, y: 21, w: 3 },
    // final flat rooftop
    { x: 72, y: 21, w: 2 },
    { x: 74, y: 20, w: 5 },
    { x: 79, y: 21, w: 2 },
  ],
  // Only one grapple-required wall (Act-1 vocabulary). Everything else
  // is stompable stairs.
  walls: [{ x: 30, w: 3, topRow: 18 }],
  houses: [],
  // Only the tall-wall anchor (like 1-1's [31,16]) — the two low
  // lamps over the pits were dropped to keep 3-1 grounded in
  // Act-1 platforming.
  swingPoints: [[31, 15]],
  coins: [
    [9, 19], [10, 19], [11, 19],
    [30, 17], [31, 17], [32, 17],
    [37, 20], [38, 20], [39, 20],
    [45, 19],
    [64, 20], [65, 20],
    [75, 19], [76, 19],
    // ground-level coins between platforms; skip tile 42 because
    // the step at (42, 22) would trap it under a floor big Batman
    // can't reach.
    [4, 23], [17, 23], [55, 23], [70, 23], [82, 23],
  ],
  // Trimmed enemy count — the level was too crowded. Kept the
  // key encounters: opener, mid-street, one rooftop helmet, one
  // guard before the second pit, one post-pit helmet, one end.
  // First thug pushed away from the spawn (tile 2) per the general
  // "don't crowd the start" rule — the opener now waits at tile 10+.
  thugs: [
    { x: 12, y: 24, range: [10, 14], frozen: true },
    { x: 22, y: 24, range: [20, 25], frozen: true },
    { x: 38, y: 21, range: [36, 40], helmet: true, frozen: true },
    { x: 50, y: 24, range: [48, 55], helmet: true, frozen: true },
    { x: 64, y: 21, range: [64, 66], helmet: true, frozen: true },
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
    // First bird patrols only from the snow cannon (x=20) leftward,
    // so it doesn't overlap the airspace above the pit + swing point.
    { x: 18, y: 20, range: [14, 20], frozen: true },
    { x: 68, y: 20, range: [62, 74], frozen: true },
  ],
  bats: [[45, 19]],
  spawn: { x: 2, y: 22 },
});

// 3-2 — SKYLINE CONGELADO. Torres altas del centro de Gotham
// bajo el hielo (misma familia que 1-3: paredes escalonadas que
// crecen hacia el pico y bajan del otro lado, mucho grapple).
// Batman salta de techo en techo entre spires; el suelo tiene
// pits + cañones, así que quedarse abajo es peligroso.
LEVEL_SPECS.push({
  name: '3-2',
  frozen: true,
  width: 96, height: 30, groundY: 28,
  pits: [[16, 20], [56, 60]],
  platforms: [
    // ledge on the way up to the first tower cluster
    { x: 8, y: 25, w: 3 },
    // small stepping stone between the two skylines (mid-air ledge
    // reachable from the tower right before the 2nd pit)
    { x: 42, y: 20, w: 3 },
    // final ledge before landing zone
    { x: 74, y: 24, w: 3 },
  ],
  // Skyline: two clusters of buildings, each stepped up to a spire.
  // Cluster 1 peaks at row 14 (a smaller spike), cluster 2 peaks at
  // row 10 (the tallest tower, lowered from the old row 8 so Robin's
  // double-jump chain can actually reach it).
  walls: [
    // Cluster 1 — 3-tile staircase to the peak (24 → 21 → 18 → 15) so
    // Batman can climb it without a double jump.
    { x: 22, w: 3, topRow: 24 },
    { x: 25, w: 2, topRow: 21 },
    { x: 27, w: 1, topRow: 18 },
    { x: 28, w: 4, topRow: 15 },
    { x: 32, w: 3, topRow: 18 },
    // Cluster 2 — a clean 3-tile staircase up to the tallest spire
    // (22 → 19 → 16 → 13 → 10) so BATMAN (no double jump) climbs it solo,
    // then a symmetric drop down the far side.
    { x: 46, w: 3, topRow: 22 },
    { x: 49, w: 2, topRow: 19 },
    { x: 51, w: 2, topRow: 16 },
    { x: 53, w: 1, topRow: 13 },
    { x: 54, w: 4, topRow: 10 },   // TALLEST spire
    { x: 58, w: 3, topRow: 16 },
    { x: 62, w: 3, topRow: 22 },
    // Terminal building — lowered to a 3-tile hop so Batman can climb over
    // it to the exit without a grapple anchor he can't reach.
    { x: 82, w: 4, topRow: 25 },
  ],
  // Ladders removed — they used to sit INSIDE their wall columns,
  // which the wall's solid tiles blocked, so neither character
  // could actually climb them. Robin now double-jumps up the
  // packed cluster-2 staircase; Batman uses the grapple below.
  ladders: [],
  houses: [],
  // Grapples to the peaks — each cluster spire gets one so Batman
  // (batigarra) can chain up. The tallest anchor sits over the
  // cluster-2 spire and is reachable from wall x=49 (row 16).
  swingPoints: [
    [24, 22],   // helps clear the pit and reach the first cluster
    [30, 12],   // spire 1 top (row 14 spire, anchor 2 rows above)
    [46, 20],   // between clusters
    [56, 8],    // TALLEST spire grapple — reachable from wall x=49
    [78, 18],   // final descent
  ],
  coins: [
    [4, 27], [6, 27], [14, 27],
    [9, 24], [10, 24],
    [23, 23], [26, 20], [29, 14], [30, 14],
    [40, 26], [42, 19], [43, 19],
    [47, 21], [50, 18], [52, 15],
    [54, 9], [55, 9], [56, 9],   // sitting on the tallest spire
    [58, 15], [62, 21],
    [75, 23], [83, 24],
    [90, 27], [92, 27],
  ],
  thugs: [
    // Opener pushed away from spawn (tile 2) per the general rule
    { x: 12, y: 28, range: [10, 14], frozen: true },
    { x: 26, y: 21, range: [25, 26], helmet: true, frozen: true },
    // (the helmet thug that used to sit on the first tower top is now a
    //  flying enemy — see birds below)
    { x: 40, y: 28, range: [38, 44], frozen: true },
    { x: 50, y: 19, range: [49, 50], frozen: true },
    { x: 55, y: 10, range: [54, 57], helmet: true, frozen: true },
    { x: 58, y: 16, range: [58, 60], frozen: true },
    { x: 84, y: 25, range: [82, 85], frozen: true },
    // (removed the final ground thug that walked over the ice
    //  patch near the exit — the user reads that surface as water)
  ],
  snowCannons: [
    { x: 36, interval: 2600 },
    { x: 68, interval: 2400 },
  ],
  birds: [
    // flying enemy guarding the first tower top (replaces the helmet thug)
    { x: 29, y: 12, range: [26, 33], frozen: true },
    { x: 36, y: 14, range: [30, 44], frozen: true },
    { x: 72, y: 18, range: [64, 80], frozen: true },
  ],
  // Bat power-up on the tallest spire — reaching it is the
  // checkpoint for the second half of the skyline.
  bats: [[55, 9]],
  spawn: { x: 2, y: 26 },
});

// 3-3 — MUELLES CONGELADOS. Motivo puerto: galpones bajos,
// grúas con contenedores oscilando sobre el agua helada, dos
// balsas atrapadas en el hielo que van y vienen por las brechas.
// Reutiliza el vocabulario de 2-2 (dock + boats + cranes) pero
// congelado y con cañones alineados al pier.
LEVEL_SPECS.push({
  name: '3-3',
  frozen: true,
  dock: true,
  width: 108, height: 22, groundY: 19,
  // Water gaps between pier sections — the boats sail these.
  pits: [[30, 46], [72, 90]],
  platforms: [
    // Small crate stack on the opening pier — raised to row 16 so
    // big Batman can walk under it (row 17 only left 2 tiles of
    // clearance with h=40, and thugs/Batman clipped the ceiling).
    { x: 10, y: 16, w: 2 },
    // Pier landing between the two water gaps — same treatment.
    { x: 62, y: 16, w: 3 },
  ],
  // Warehouses along the pier: short at the start, taller at the
  // container yard mid-level, and one last shed at the end. The
  // end warehouse used to be topRow: 12 (7 tiles tall) which
  // trapped Batman in the last third — you couldn't backtrack
  // without killing every roof thug. Lowered to topRow: 15 so a
  // simple jump from ground level puts him back on top even if
  // the goons are alive.
  walls: [
    { x: 16, w: 3, topRow: 15 },   // first warehouse
    { x: 24, w: 3, topRow: 13 },   // taller warehouse
    { x: 50, w: 4, topRow: 14 },   // container yard building
    { x: 66, w: 3, topRow: 15 },   // pre-water shed
    { x: 96, w: 4, topRow: 15 },   // end warehouse (was 12)
  ],
  ladders: [
    { x: 15, topRow: 15, baseRow: 19 },
    { x: 23, topRow: 13, baseRow: 19 },
    { x: 27, topRow: 13, baseRow: 19 },
    { x: 49, topRow: 14, baseRow: 19 },
    { x: 65, topRow: 15, baseRow: 19 },
    { x: 95, topRow: 15, baseRow: 19 },
  ],
  houses: [],
  // Two clearly different crossing challenges. The FIRST water gap
  // is a crane crossing (Batman times a stomp on the swinging
  // container, no raft below). The SECOND water gap is a raft
  // crossing (drifting boat back-and-forth, no crane above). This
  // separates the mechanics so each obstacle reads on its own.
  cranes: [
    { towerX: 27, armY: 3, armEndX: 38, ropeLen: 10, cargoW: 3, speed: 0.0013, amplitude: 0.42, phase: 0 },
  ],
  boats: [
    { x: 78, y: 19, w: 3, range: [73, 88], speed: 2.4, dir: -1 },
  ],
  swingPoints: [
    // Anchor before pit #1 in case the crane cargo is on the wrong side
    [28, 11],
    // Anchor mid-crossing for pit #1
    [42, 10],
    // Anchor before pit #2
    [70, 10],
    // Anchor across the final water gap
    [88, 9],
  ],
  coins: [
    [4, 18], [7, 18], [12, 18],
    [17, 14], [24, 12], [25, 12],
    [51, 13], [52, 13],
    [63, 15],
    [79, 18], [82, 18],   // sit on boat #2
    [97, 14], [100, 18], [104, 18],
  ],
  thugs: [
    // Opener with a 10-tile buffer from spawn (tile 2)
    { x: 12, y: 19, range: [10, 14], frozen: true },
    // Rooftop patrols: each range now reaches the ladder-top tile
    // so a player can't just wait for the goon to walk to the
    // wrong side and slip past.
    { x: 18, y: 15, range: [15, 18], helmet: true, frozen: true },
    { x: 25, y: 13, range: [23, 27], frozen: true },
    { x: 52, y: 14, range: [49, 53], helmet: true, frozen: true },
    { x: 63, y: 19, range: [60, 66], frozen: true },
    { x: 68, y: 15, range: [65, 68], helmet: true, frozen: true },
    // (removed a ground thug at range [90,94] that patrolled INTO
    //  the water pit [72,90] — its left bounce landed on tile 90
    //  which is the last water tile.)
    { x: 97, y: 15, range: [95, 99], helmet: true, frozen: true },
    { x: 103, y: 19, range: [100, 107], frozen: true },
  ],
  snowCannons: [
    // Cannon at the start of the pier
    { x: 6, interval: 2800 },
    // Cannon at the container yard entrance
    { x: 56, interval: 2500 },
  ],
  birds: [
    { x: 38, y: 10, range: [30, 46], frozen: true },
    { x: 80, y: 8, range: [72, 90], frozen: true },
  ],
  // Checkpoint bat on the mid-level pier — reaching it is the
  // waypoint that saves Batman before the second crane crossing.
  bats: [[62, 16]],
  spawn: { x: 2, y: 17 },
});

// 3-4 — MR. FREEZE: LA MÁQUINA. Sala gótica toda congelada (piso
// resbaladizo). Freeze NO está dentro de la máquina: es un personaje que
// DEAMBULA por el piso y dispara su pistola de frío cada tanto; es
// invulnerable. En el fondo, un órgano gótico criogénico (decorativo)
// alimenta 3 COLUMNAS DE CONTROL con un botón arriba de cada una. Cada
// botón arranca ENCERRADO EN HIELO: el 1er golpe rompe el hielo, el 2do lo
// activa. Vale golpearlos con PISOTÓN (caer sobre la columna) o con el arma
// a DISTANCIA (batarang/batigarra). Los 3 activados -> la máquina se
// sobrecarga y Freeze se derrite.
//
// Las 3 consolas de control (cols 8, 15, 22) son NO sólidas (como la cabeza
// de Bane): el botón es un hitbox flotante a altura de salto Y de disparo,
// así funciona tanto el pisotón (caés sobre la consola) como el arma a
// distancia (le tirás el batarang/batigarra). El piso queda libre a lo ancho
// para que Freeze deambule sin trabarse.
LEVEL_SPECS.push({
  name: '3-4',
  indoor: true,
  frozen: true,
  width: 30, height: 15, groundY: 13,
  pits: [],
  walls: [],
  platforms: [],
  swingPoints: [],
  coins: [],
  thugs: [],
  birds: [],
  bats: [],
  // ice cannons BETWEEN the control consoles (cols 8/15/22): one in each gap
  snowCannons: [
    { x: 11, y: 13, interval: 3200 },
    { x: 18, y: 13, interval: 3200 },
  ],
  mrfreeze: {
    buttonCols: [8, 15, 22],   // center column of each control console
    buttonTopRow: 11,          // console top (2 tiles above the floor)
    freeze: { x: 6, range: [2, 27] },   // Mr. Freeze wanders this floor range
  },
  spawn: { x: 2, y: 11 },
});

// ==============================================================
// ACT 4 — LAS CLOACAS DEL PINGÜINO
// El rastro que dejó Freeze lleva bajo tierra. Batman y Robin
// bajan a las alcantarillas de Gotham con las bombas de humo que
// Alfred les entregó al salir del reactor. La escenografía cambia
// completamente: bóvedas de ladrillo mojado, canales de agua
// verdosa, ratas y esbirros que Cobblepot manda emerger del agua.
// ==============================================================

// 4-1 — ALCANTARILLAS INICIALES. Corredor angosto de cloaca:
// masa de hormigón GRIS arriba (techo, filas 0-9) y abajo (piso,
// filas 13-14), dejando sólo 3 filas de corredor. Apenas hay lugar
// para saltar. En dos puntos el techo BAJA a ras (tubería) y hay
// que gatear (agachado, sin salto). Gotas de ácido verde caen del
// techo y hacen daño; rejillas y bocas de tormenta decoran.
LEVEL_SPECS.push({
  name: '4-1',
  sewer: true,
  // Piso ALTO (masa gruesa filas 11-14) + techo BAJO (masa filas
  // 0-8). El corredor jugable son sólo 2 filas (9-10): se camina
  // pero apenas se puede saltar. En las tuberías el techo baja a
  // fila 9 → queda una única ranura (fila 10) para gatear.
  width: 76, height: 15, groundY: 11,
  ceilingRow: 8,
  pits: [],
  platforms: [],
  walls: [],
  ladders: [],
  houses: [],
  pipes: [
    // Tubería 1 — el techo baja 8 tiles: gateo obligado.
    { x: 16, w: 8 },
    // Tubería 2 — más larga (12 tiles) con una rata patrullando
    // adentro. Gotas de ácido caen dentro de ella.
    { x: 46, w: 12 },
  ],
  // Gotas de ácido verde: caen del techo en estas columnas y
  // hacen daño al tocarte.
  drips: [
    { x: 11, interval: 1600 },
    { x: 30, interval: 1400 },
    { x: 40, interval: 1500 },
    { x: 51, interval: 1300 },   // dentro de la tubería 2
    { x: 56, interval: 1700 },   // dentro de la tubería 2
    { x: 68, interval: 1500 },
  ],
  // Rejillas de desagüe en el piso (decoración).
  drains: [8, 26, 38, 63, 72],
  // Rendijas de calle en el techo con un rayo de luz.
  grates: [10, 40, 70],
  swingPoints: [],
  coins: [
    [4, 10], [7, 10], [13, 10],
    [18, 10], [20, 10], [22, 10],        // dentro de la tubería 1
    [27, 10], [33, 10], [37, 10],        // zona de descanso 1 (ratas)
    [49, 10], [52, 10], [55, 10],        // dentro de la tubería 2
    [61, 10], [65, 10], [70, 10], [74, 10],   // salida
  ],
  thugs: [
    // Un thug al comienzo, en el corredor abierto.
    { x: 9, y: 11, range: [6, 13] },
  ],
  rats: [
    // Zona de descanso 1 (entre las dos tuberías): 3 ratas.
    { x: 27, y: 11, range: [25, 34] },
    { x: 32, y: 11, range: [27, 36], dir: -1 },
    { x: 40, y: 11, range: [36, 44] },
    // UNA RATA DENTRO de la tubería 2 — te la cruzás gateando.
    { x: 52, y: 11, range: [47, 57] },
    // Zona de descanso 2 (después de la tubería 2): 2 más.
    { x: 64, y: 11, range: [60, 70] },
    { x: 71, y: 11, range: [66, 75], dir: -1 },
  ],
  divers: [],
  birds: [],
  bats: [[42, 10]],   // checkpoint entre la zona de ratas y la tubería 2
  spawn: { x: 2, y: 9 },
});

// 4-2 — LA RAMPA. Tobogán de cloaca con rampas DIAGONALES reales
// (pendiente lisa, no escalones) y un techo bajo paralelo que forma
// un TUBO inclinado. Bajás una rampa RESBALADIZA patinando sin
// frenar y esquivando ratas que recorren la diagonal; descansás en
// una poza; y trepás una rampa mientras pingüinos se deslizan hacia
// vos y hay que saltarlos. Gotas de ácido caen del techo del tubo.
LEVEL_SPECS.push({
  name: '4-2',
  sewer: true,
  width: 76, height: 20, groundY: 18,
  pits: [],
  // Rampas diagonales. ceil:3 = techo del tubo 3 tiles por encima
  // de la pendiente (bajo, pero deja saltar para esquivar). La
  // bajada es slide:true = patina.
  ramps: [
    { x: 0,  w: 10, fromRow: 5,  toRow: 5,  ceil: 3 },               // meseta inicial
    { x: 10, w: 20, fromRow: 5,  toRow: 15, slide: true, ceil: 3 },  // BAJADA resbaladiza ↘
    { x: 30, w: 12, fromRow: 15, toRow: 15, ceil: 3 },               // poza / descanso
    { x: 42, w: 20, fromRow: 15, toRow: 5,  ceil: 3 },               // SUBIDA (se controla) ↗
    { x: 62, w: 14, fromRow: 5,  toRow: 5,  ceil: 3 },               // meseta final / salida
  ],
  platforms: [],
  walls: [],
  ladders: [],
  houses: [],
  pipes: [],
  // Pingüinos deslizantes: nacen arriba de la rampa de subida y
  // bajan por la diagonal hacia el jugador. UN SOLO emisor con una
  // única frecuencia constante → todos bajan al mismo ritmo, bien
  // espaciados y sincronizados (no aleatorio). Se saltan o se pisan.
  // No cuentan para el 80%.
  sliders: [
    { x: 60, dir: -1, interval: 2400, minX: 42, maxX: 62 },
  ],
  // Gotas de ácido tóxico saliendo de bocas de tubería en el techo
  // del tubo (dripCeilY sigue el techo diagonal). Pocas y espaciadas.
  drips: [
    { x: 18, interval: 1800 },   // sobre la bajada
    { x: 36, interval: 1900 },   // sobre la poza
    { x: 52, interval: 1800 },   // sobre la subida
  ],
  drains: [5, 36, 68],
  // Rendijas de calle en el techo que dejan pasar un rayo de luz.
  grates: [8, 36, 66],
  swingPoints: [],
  // Monedas SIEMPRE 1 tile por encima de la superficie diagonal
  // (alcanzables, nunca enterradas).
  coins: [
    [4, 4], [7, 4],
    [14, 6], [18, 8], [22, 10], [26, 12],   // bajando la diagonal
    [34, 14], [38, 14],                       // poza
    [46, 12], [50, 10], [54, 8], [58, 6],    // subiendo la diagonal
    [66, 4], [70, 4], [74, 4],               // salida
  ],
  // Sin thug inicial (se quitó a pedido). El nivel es de esquivar.
  thugs: [],
  rats: [
    // Obstáculos que RECORREN la diagonal de bajada (y se snappean
    // a la pendiente en updateRats).
    { x: 16, y: 8, range: [13, 19] },
    { x: 24, y: 12, range: [21, 28] },
    // Poza: patrullan la zona de descanso plana.
    { x: 34, y: 15, range: [31, 40] },
    { x: 39, y: 15, range: [35, 41], dir: -1 },
    // Meseta final.
    { x: 70, y: 5, range: [64, 75] },
  ],
  divers: [],
  birds: [],
  bats: [[36, 14]],   // checkpoint en la poza
  spawn: { x: 3, y: 4 },
});

const BOSS_LEVEL_INDEX = LEVEL_SPECS.findIndex(s => s.bane);
