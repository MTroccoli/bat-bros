/* ============================================================
   BAT BROS — Catálogo: constantes, físicas, enemigos, mecánicas.
   Este archivo define las "reglas del juego" que buildLevel() y
   el motor de físicas consultan cada frame.
   ============================================================ */

// --- Tiles & canvas ---
const TILE = 32;
const CANVAS_W = 800;
const CANVAS_H = 480;

// --- Physics ---
const GRAVITY = 0.52;
const MAX_FALL = 15;
const MOVE_ACCEL = 0.7;
const MAX_SPEED = 4.4;
const AIR_ACCEL = 0.5;
const FRICTION = 0.78;
const JUMP_VELOCITY = -11.2;
const JUMP_CUT = 0.5;
const STOMP_BOUNCE = -8.5;
const STOMP_TOLERANCE = 14;
const INVULN_TIME = 1500;
const LEVEL_TIME = 500;

// --- Input timing ---
const JUMP_BUFFER_MS = 140;
const COYOTE_MS = 90;
const SHOOT_COOLDOWN_MS = 500;

// --- Batarang ---
const BATARANG_SPEED = 7.5;
const BATARANG_RANGE = 130;
const BATARANG_LIFESPAN_MS = 3000;
const BATARANG_MAX_AMMO = 5;
const BAT_SCORE = 2000;

// --- Progression ---
const REQUIRED_DEFEAT_RATIO = 0.79;
const HERO_MESSAGE_MS = 2800;
const HERO_QUOTE = 'UN HÉROE NO LE DA LA ESPALDA AL CRIMEN. SI NO COMBATÍS EL MAL, NO PODÉS SEGUIR ADELANTE.';

// --- Grapple / swing ---
const GRAPPLE_RANGE = 170;
const SWING_RELEASE_ANGLE = 1.15;
const GRAPPLE_COOLDOWN_MS = 500;
const TRAPEZE_LATCH_RANGE = 70;

// --- Bane (Act 1 boss) ---
const CONTINUE_COST = 30;
const BANE_BIG = { w: 92, h: 150 };
const BANE_GROW_MS = 1400;
const BANE_TELEGRAPH_MS = 1800;
const BANE_HIT_FLASH_MS = 900;
const BANE_WAVE_SPEED = 5.0;

// --- Player sizes (health states) ---
const SIZES = {
  small: { w: 22, h: 30 },
  big: { w: 24, h: 40 },
  batarang: { w: 24, h: 40 },
  batigarra: { w: 24, h: 40 },
};

// --- Baticueva ---
const CAVE_BAT_WAKE_RANGE = 150;
const CAVE_BAT_WAKE_MS = 350;
const CAVE_DROP_INTERVAL_MS = 1400;
const CAVE_COMPUTER_TRIGGER = 110;

// --- Batigarra rope control ---
const GARRA_REEL_SPEED = 1.6;
const GARRA_MIN_RADIUS = 44;
const GARRA_PUMP = 0.0009;
const GARRA_MAX_ANGULAR_VEL = 0.26; // caps pumped speed: enough for one full loop, not a blur

// --- Act 2: docks (wooden ladders + moving boats) ---
const LADDER_SPEED = 2.6;
const BOAT_THICK = 16; // raft body thickness below its top (walkable) surface

// ---------------------------------------------------------------
// Deterministic hash: sin-based, returns 0..1
// ---------------------------------------------------------------
function hash01(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// ---------------------------------------------------------------
// Level builder: programmatic spec -> tile grid + entity lists
// ---------------------------------------------------------------
function buildLevel(spec) {
  const { width, height, groundY, pits = [], platforms = [], walls = [], coins = [],
          thugs = [], birds = [], bats = [], swingPoints = [], houses = [], ladders = [],
          boats = [], cranes = [], spawn, name, indoor = false, dock = false, bane = null, cave = null } = spec;

  const solid = Array.from({ length: height }, () => new Array(width).fill(false));

  for (let y = groundY; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inPit = pits.some(([a, b]) => x >= a && x <= b);
      if (!inPit) solid[y][x] = true;
    }
  }

  for (const p of platforms) {
    for (let i = 0; i < p.w; i++) solid[p.y][p.x + i] = true;
  }

  for (const w of walls) {
    for (let y = w.topRow; y < groundY; y++) {
      for (let i = 0; i < w.w; i++) solid[y][w.x + i] = true;
    }
  }

  for (const hs of houses) {
    for (let y = hs.topRow; y < hs.baseRow; y++) {
      for (let i = 0; i < hs.w; i++) solid[y][hs.x + i] = true;
    }
  }

  for (const l of ladders) {
    solid[l.topRow][l.x] = true;
  }

  return {
    name,
    width, height, groundY, indoor, dock,
    solid,
    pits,
    ladders: ladders.map(l => ({ x: l.x * TILE, top: l.topRow * TILE, bottom: l.baseRow * TILE })),
    walls: walls.map(w => ({ x: w.x, w: w.w, topRow: w.topRow })),
    houses: houses.map(hs => ({
      x: hs.x, w: hs.w, topRow: hs.topRow, baseRow: hs.baseRow,
      style: hs.style || 'brownstone',
    })),
    bane: bane ? {
      x: bane.x * TILE, homeX: bane.x * TILE, y: groundY * TILE - 44,
      w: 30, h: 44,
      state: 'idle',
      hp: bane.hp ?? 5, maxHp: bane.hp ?? 5,
      vx: 1.3, vy: 0,
      alive: true,
      walkPhase: 0, nextTurnAt: 0,
      growStart: 0, teleStart: 0, waveAt: 0, hitUntil: 0, deadAt: 0,
      minX: 3 * TILE, maxX: (width - 4) * TILE,
    } : null,
    waves: [],
    coins: coins.map(([x, y]) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, taken: false })),
    thugs: thugs.map(g => ({
      x: g.x * TILE, y: g.y * TILE - 26,
      w: 24, h: 26,
      minX: g.range[0] * TILE, maxX: g.range[1] * TILE,
      vx: 1.2, alive: true,
      helmet: !!g.helmet,
    })),
    birds: birds.map(b => ({
      x: b.x * TILE, y: b.y * TILE, baseY: b.y * TILE,
      w: 26, h: 20,
      minX: b.range[0] * TILE, maxX: b.range[1] * TILE,
      vx: 1.7, alive: true,
    })),
    bats: bats.map(([x, row]) => ({
      x: x * TILE, y: row * TILE - 22, w: 24, h: 20, taken: false,
    })),
    // moving rafts (docks): a patrolling platform Batman must time a landing
    // on instead of a fixed rest stop — same range/bounce pattern as birds
    boats: boats.map(b => ({
      x: b.x * TILE, y: b.y * TILE, w: (b.w || 4) * TILE, h: BOAT_THICK,
      minX: b.range[0] * TILE, maxX: b.range[1] * TILE,
      vx: b.speed ?? 1.0,
    })),
    cranes: cranes.map(c => ({
      towerX: c.towerX * TILE,
      armY: c.armY * TILE,
      anchorX: c.armEndX * TILE,
      anchorY: c.armY * TILE,
      ropeLen: c.ropeLen * TILE,
      cargoW: c.cargoW * TILE,
      cargoH: TILE * 2,
      speed: c.speed,
      amplitude: c.amplitude,
      angle: 0,
      cargoX: c.armEndX * TILE - (c.cargoW * TILE) / 2,
      cargoY: c.armY * TILE + c.ropeLen * TILE,
      prevCargoX: c.armEndX * TILE - (c.cargoW * TILE) / 2,
    })),
    swingPoints: swingPoints.map(([x, row, minR, manual]) => {
      let floorTy = height;
      for (let ty = row; ty < height; ty++) {
        if (solid[ty][x]) { floorTy = ty; break; }
      }
      return { x: x * TILE + 16, y: row * TILE, floorY: floorTy * TILE, minR: minR ?? null, manual: !!manual };
    }),
    villain: spec.villain ? {
      x: spec.villain.x * TILE, y: spec.villain.y * TILE - 42,
      w: 30, h: 42,
      minX: spec.villain.range[0] * TILE, maxX: spec.villain.range[1] * TILE,
      vx: 1.4, alive: true, hp: spec.villain.hp ?? 3, hitUntil: 0,
    } : null,
    perches: indoor ? platforms.map(p => ({ x: p.x, w: p.w, y: p.y })) : [],
    cave: cave ? buildCaveState(cave, width, height, groundY, solid) : null,
    spawn: { x: spawn.x * TILE, y: spawn.y * TILE },
    pixelWidth: width * TILE,
    pixelHeight: height * TILE,
  };
}

function buildCaveState(cave, width, height, groundY, solid) {
  const floorBelow = (txx) => {
    const tx = Math.max(0, Math.min(width - 1, txx));
    for (let ty = 2; ty < height; ty++) {
      if (solid[ty][tx]) return ty * TILE;
    }
    return groundY * TILE;
  };
  const stalactites = [];
  for (let x = 40; x < width * TILE; x += 78) {
    const overPlateau = floorBelow(Math.floor(x / TILE)) < groundY * TILE;
    const len = overPlateau ? 22 + hash01(x) * 22 : 36 + hash01(x) * 66;
    stalactites.push({ x, len, w: 12 + hash01(x * 2) * 16 });
  }
  return {
    entranceX: cave.entrance * TILE,
    computerX: cave.computer * TILE,
    pennyX: cave.penny * TILE,
    trexX: cave.trex * TILE,
    doorX: cave.door * TILE,
    plateauY: cave.plateauRow * TILE,
    computerDone: false,
    weaponChosen: null,
    choiceSel: 0,
    openedAt: 0,
    leftStart: false,
    nearEntrance: false,
    selLevel: 0,
    replayOptions: [
      ...LEVEL_SPECS.map((s, i) => ({ i, name: s.name }))
        .filter(o => /^1-/.test(o.name)),
      { i: -1, name: 'SEGUIR' },
    ],
    stalactites,
    ambientBats: (cave.batTiles || []).map((tx, i) => ({
      x0: tx * TILE, x: tx * TILE, y: 42, baseY: 42,
      state: 'sleep',
      wakeAt: 0, vx: hash01(i * 7) > 0.5 ? 2 : -2, seed: i,
    })),
    dropCols: (cave.dropTiles || []).map((tx, i) => {
      const interval = CAVE_DROP_INTERVAL_MS * (0.65 + hash01(i * 29) * 1.1);
      return {
        x: tx * TILE + 12, tipY: 60, floorY: floorBelow(tx),
        interval, lastAt: -hash01(i * 13) * interval,
        drops: [], ripples: [],
      };
    }),
  };
}
