/* ============================================================
   BIT BROS — platformer de Gotham en Canvas 2D, sin dependencias.
   ============================================================ */

const TILE = 32;
const CANVAS_W = 800;
const CANVAS_H = 480;

const GRAVITY = 0.52;
const MAX_FALL = 15;
const MOVE_ACCEL = 0.7;
const MAX_SPEED = 4.4;
const AIR_ACCEL = 0.5;
const FRICTION = 0.78;
const JUMP_VELOCITY = -11.2; // tighter jump (~3.8 tiles of height) — the grapple swing carries the long gaps now
const JUMP_CUT = 0.5;
const STOMP_BOUNCE = -8.5;
const STOMP_TOLERANCE = 14;
const INVULN_TIME = 1500;
const LEVEL_TIME = 500; // climbing routes take longer than a straight run

const JUMP_BUFFER_MS = 140;   // a jump press is remembered briefly so a tap never gets lost to frame timing
const COYOTE_MS = 90;         // short grace window to jump after walking off a ledge
const SHOOT_COOLDOWN_MS = 500;
const BATARANG_SPEED = 7.5;
const BATARANG_RANGE = 130;
const BATARANG_LIFESPAN_MS = 3000;
const BAT_SCORE = 2000; // the bat now grows Batman AND grants the batarang in one pickup

const REQUIRED_DEFEAT_RATIO = 0.79; // must take down at least this share of a level's enemies to pass the flag
const HERO_MESSAGE_MS = 2800;
const HERO_QUOTE = 'UN HÉROE NO LE DA LA ESPALDA AL CRIMEN. SI NO COMBATÍS EL MAL, NO PODÉS SEGUIR ADELANTE.';

const GRAPPLE_RANGE = 170;       // how close to a lamppost anchor before Batman auto-latches on
const SWING_RELEASE_ANGLE = 1.15; // ~66° from vertical: natural release point at the top of the arc
const GRAPPLE_COOLDOWN_MS = 500;  // prevents instantly re-grabbing the same anchor after letting go
const TRAPEZE_LATCH_RANGE = 70;   // trapezes latch near their hanging BAR, not the ceiling anchor

// --- Act 1 boss: Bane in the abandoned warehouse ---
const CONTINUE_COST = 30;         // coins to re-enter the warehouse after a game over there
const BANE_BIG = { w: 92, h: 150 };
const BANE_GROW_MS = 1400;
const BANE_TELEGRAPH_MS = 1800;   // crouch warning before his shockwave jump
const BANE_HIT_FLASH_MS = 900;
const BANE_WAVE_SPEED = 5.0;      // shockwave ring expansion px/frame

const SIZES = {
  small: { w: 22, h: 30 },
  big: { w: 24, h: 40 },
  batarang: { w: 24, h: 40 },
};

// ---------------------------------------------------------------
// Level builder: programmatic spec -> tile grid + entity lists
// ---------------------------------------------------------------
function buildLevel(spec) {
  const { width, height, groundY, pits = [], platforms = [], walls = [], coins = [],
          thugs = [], birds = [], bats = [], swingPoints = [], houses = [],
          flag, spawn, name, indoor = false, bane = null } = spec;

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

  // Rooftop walls: solid floor-to-topRow columns, too tall to jump over —
  // the only way across is the swing point placed above them.
  for (const w of walls) {
    for (let y = w.topRow; y < groundY; y++) {
      for (let i = 0; i < w.w; i++) solid[y][w.x + i] = true;
    }
  }

  // Gabled-roof houses: a stepped pyramid of solid columns (1-tile steps,
  // hoppable without the grapple) rising to a 2-tile flat ridge at topRow.
  // baseRow is the surface the house sits on (street or a plaza rooftop).
  for (const hs of houses) {
    for (let i = 0; i < hs.w; i++) {
      const colTop = hs.topRow + Math.max(0, (hs.w / 2 - 1) - Math.min(i, hs.w - 1 - i));
      for (let y = colTop; y < hs.baseRow; y++) solid[y][hs.x + i] = true;
    }
  }

  return {
    name,
    width, height, groundY, indoor,
    solid,
    walls: walls.map(w => ({ x: w.x, w: w.w, topRow: w.topRow })),
    houses: houses.map(hs => ({
      x: hs.x, w: hs.w, topRow: hs.topRow, baseRow: hs.baseRow,
      eaveRow: hs.topRow + hs.w / 2 - 1,
    })),
    bane: bane ? {
      x: bane.x * TILE, y: groundY * TILE - 44,
      w: 30, h: 44,           // small until he presses the venom button
      state: 'idle',          // idle | growing | fight | telegraph | jumping
      hp: bane.hp ?? 5, maxHp: bane.hp ?? 5,
      vx: 1.3, vy: 0,
      alive: true,
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
    swingPoints: swingPoints.map(([x, row, minR]) => {
      // the lamppost pole is drawn down to the first solid surface below the
      // anchor (a rooftop or the street), not blindly to ground level
      let floorTy = height;
      for (let ty = row; ty < height; ty++) {
        if (solid[ty][x]) { floorTy = ty; break; }
      }
      // minR set => a trapeze: fixed rope length, latched near its bar
      return { x: x * TILE + 16, y: row * TILE, floorY: floorTy * TILE, minR: minR ?? null };
    }),
    villain: spec.villain ? {
      x: spec.villain.x * TILE, y: spec.villain.y * TILE - 42,
      w: 30, h: 42,
      minX: spec.villain.range[0] * TILE, maxX: spec.villain.range[1] * TILE,
      vx: 1.4, alive: true, hp: spec.villain.hp ?? 3, hitUntil: 0,
    } : null,
    flag: (() => {
      // plant the flag on whatever surface is under it — a rooftop or the street
      let baseTy = groundY;
      for (let ty = flag.y; ty < height; ty++) {
        if (solid[ty][flag.x]) { baseTy = ty; break; }
      }
      return { x: flag.x * TILE + TILE / 2, y: baseTy * TILE, topY: flag.y * TILE };
    })(),
    spawn: { x: spawn.x * TILE, y: spawn.y * TILE },
    pixelWidth: width * TILE,
    pixelHeight: height * TILE,
  };
}

// Vertical-city levels. Reachability rules the layouts follow everywhere:
//  - a jump climbs at most 3 tiles, so any roof ≤3 above the current surface
//    is jumpable and anything taller needs the grapple;
//  - the proven grapple-climb template: roof sits 6 tiles above the surface
//    you launch from, the lamppost anchor hangs 2 tiles above the roof at
//    wall.x+1 — a mid-jump latch (~120 px from apex) always connects;
//  - buildings rise from the street, so the ground corridor is BLOCKED and
//    the only way forward is up and over the rooftops, Batman-style.
const LEVEL_SPECS = [
  {
    // Streets + first rooftops: teaches the grapple climb and the pit swing.
    name: '1-1',
    width: 80, height: 26, groundY: 24,
    pits: [[18, 20], [46, 52]],
    platforms: [
      { x: 8, y: 21, w: 3 },
      { x: 38, y: 21, w: 3 },
      { x: 66, y: 21, w: 3 },
    ],
    // One building blocks the street — climb it with the lamppost above.
    walls: [{ x: 30, w: 3, topRow: 18 }],
    // A gabled-roof house sits on the street further on: hop up its stepped
    // roof (1-tile steps) and over the ridge, where a thug patrols.
    houses: [{ x: 54, w: 6, topRow: 20, baseRow: 24 }],
    swingPoints: [[31, 16], [49, 16]],
    coins: [
      [9, 20], [39, 20], [67, 20],
      [30, 17], [31, 17], [32, 17],
      [56, 19], [57, 19],
      [14, 23], [24, 23], [43, 23], [72, 23],
    ],
    thugs: [
      { x: 12, y: 24, range: [10, 16] },
      { x: 24, y: 24, range: [22, 29] },
      { x: 30, y: 18, range: [30, 32] },
      { x: 40, y: 24, range: [36, 44] },
      { x: 56, y: 20, range: [56, 57] },
      { x: 62, y: 24, range: [61, 66] },
    ],
    birds: [
      { x: 22, y: 21, range: [20, 27] },
      { x: 47, y: 20, range: [45, 53] },
    ],
    bats: [[39, 21]],
    flag: { x: 75, y: 14 },
    spawn: { x: 2, y: 22 },
  },
  {
    // The ascent: a staircase of buildings climbs to a high plaza and back
    // down, then a wide pit swing and a final rooftop where the flag waits.
    name: '1-2',
    width: 96, height: 30, groundY: 28,
    pits: [[12, 13], [70, 76]],
    platforms: [
      { x: 6, y: 25, w: 3 },
      { x: 60, y: 25, w: 3 },
      { x: 80, y: 25, w: 3 },
    ],
    walls: [
      { x: 24, w: 4, topRow: 22 },  // grapple climb from the street
      { x: 28, w: 4, topRow: 19 },  // +3: jumpable step
      { x: 32, w: 9, topRow: 13 },  // grapple climb to the high plaza
      { x: 41, w: 4, topRow: 16 },  // descending steps on the far side
      { x: 45, w: 4, topRow: 19 },
      { x: 49, w: 4, topRow: 22 },
      { x: 86, w: 3, topRow: 22 },  // final rooftop with the exit
    ],
    // A gabled-roof house crowns the high plaza — cross it over the ridge.
    houses: [{ x: 34, w: 6, topRow: 10, baseRow: 13 }],
    swingPoints: [[25, 20], [33, 11], [73, 20], [87, 20]],
    coins: [
      [25, 21],
      [33, 12], [35, 9], [37, 9], [40, 12],
      [61, 24], [81, 24], [87, 21],
      [5, 27], [18, 27], [55, 27], [66, 27],
    ],
    thugs: [
      { x: 6, y: 28, range: [3, 10] },
      { x: 16, y: 28, range: [14, 22] },
      { x: 32, y: 13, range: [32, 33] },
      { x: 36, y: 10, range: [36, 37] },
      { x: 45, y: 19, range: [45, 48] },
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
    flag: { x: 87, y: 17 },
    spawn: { x: 2, y: 26 },
  },
  {
    // The summit: four towers stacked ever higher, with a gabled house on
    // the high plaza; the exit waits on the top roof, and the trail leads
    // down to Bane's warehouse...
    name: '1-3',
    width: 70, height: 34, groundY: 32,
    pits: [[14, 16], [24, 26]],
    platforms: [
      { x: 8, y: 29, w: 3 },
      { x: 20, y: 29, w: 3 },
    ],
    walls: [
      { x: 30, w: 4, topRow: 26 },   // tower 1: grapple from the street
      { x: 34, w: 4, topRow: 20 },   // tower 2: grapple from tower 1's roof
      { x: 38, w: 10, topRow: 14 },  // tower 3: the high plaza
      { x: 48, w: 8, topRow: 16 },   // step down, contiguous walk-off
      { x: 56, w: 8, topRow: 10 },   // tower 4: the summit — the exit
    ],
    houses: [{ x: 40, w: 6, topRow: 11, baseRow: 14 }],
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
      { x: 42, y: 11, range: [42, 43] },
      { x: 50, y: 16, range: [48, 55] },
    ],
    birds: [
      { x: 10, y: 26, range: [6, 13] },
      { x: 50, y: 13, range: [48, 54] },
    ],
    bats: [[21, 29], [39, 14]],
    flag: { x: 62, y: 4 },
    spawn: { x: 2, y: 30 },
  },
  {
    // Act 1 finale: Bane's abandoned warehouse. A closed arena — when Bane
    // spots Batman he slams the venom button and grows huge. Two trapezes
    // hang from the rafters at head height: swing into his head 5 times
    // (he speeds up on the 3rd hit). His telegraphed jump sends a shockwave
    // along the floor that only misses you if you're airborne or swinging.
    name: '1-4',
    indoor: true,
    width: 34, height: 15, groundY: 13,
    pits: [],
    platforms: [],
    walls: [],
    swingPoints: [[12, 2, 210], [21, 2, 210]],
    coins: [],
    thugs: [],
    birds: [],
    bats: [],
    bane: { x: 26, hp: 5 },
    flag: { x: 33, y: 1 }, // unreachable; the level completes when Bane falls
    spawn: { x: 2, y: 11 },
  },
];
const BOSS_LEVEL_INDEX = LEVEL_SPECS.length - 1;

// ---------------------------------------------------------------
// Input
// ---------------------------------------------------------------
const keys = { left: false, right: false, jump: false, shoot: false };

// Jump/shoot presses are buffered by timestamp (not sampled per-frame), so a
// quick tap always registers even if it happens to fall between two frames.
let jumpBufferUntil = 0;
let shootBufferUntil = 0;
let coyoteUntil = 0;
let lastShotAt = -Infinity;

function requestJump() { jumpBufferUntil = performance.now() + JUMP_BUFFER_MS; }
function requestShoot() { shootBufferUntil = performance.now() + JUMP_BUFFER_MS; }

window.addEventListener('keydown', e => {
  if (state === 'cutscene' && ['ArrowUp', 'KeyW', 'Space', 'Enter'].includes(e.code)) {
    startGame();
    e.preventDefault();
    return;
  }
  if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = true;
  if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = true;
  if (['ArrowUp', 'KeyW', 'Space'].includes(e.code)) { keys.jump = true; requestJump(); }
  if (['KeyX', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { keys.shoot = true; requestShoot(); }
  if (e.code === 'KeyR') restartGame();
  if (['Space', 'ArrowUp'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => {
  if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = false;
  if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = false;
  if (['ArrowUp', 'KeyW', 'Space'].includes(e.code)) keys.jump = false;
  if (['KeyX', 'ShiftLeft', 'ShiftRight'].includes(e.code)) keys.shoot = false;
});

// Pointer Events unify touch/mouse/pen with a single listener set and, via
// setPointerCapture, keep tracking the press even if the finger slides off
// the button.
function bindButton(id, onDown, onUp) {
  const el = document.getElementById(id);
  const down = e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); onDown(); };
  const up = e => { e.preventDefault(); onUp(); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
bindButton('btn-left', () => keys.left = true, () => keys.left = false);
bindButton('btn-right', () => keys.right = true, () => keys.right = false);
bindButton('btn-jump', () => { keys.jump = true; requestJump(); }, () => keys.jump = false);
bindButton('btn-shoot', () => { keys.shoot = true; requestShoot(); }, () => keys.shoot = false);

// Mobile browsers (iOS Safari especially) ignore user-scalable=no and can
// pinch- or double-tap-zoom the page mid-game, leaving it stuck zoomed in
// and unplayable. Block the gesture events and the double-tap heuristic.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, e => e.preventDefault());
}
let lastTouchEndAt = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTouchEndAt < 350) e.preventDefault(); // swallow the double-tap zoom
  lastTouchEndAt = now;
}, { passive: false });

// ---------------------------------------------------------------
// Game state
// ---------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const hud = {
  score: document.getElementById('hud-score'),
  coins: document.getElementById('hud-coins'),
  lives: document.getElementById('hud-lives'),
  level: document.getElementById('hud-level'),
  time: document.getElementById('hud-time'),
};
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMsg = document.getElementById('overlay-msg');
const overlayBtn = document.getElementById('overlay-btn');

let state = 'start'; // start | cutscene | playing | levelcomplete | win | gameover
let continueOffer = false; // game over at Bane: offer to spend coins to retry
let levelIndex = 0;
let level = null;
let player = null;
let camera = { x: 0, y: 0 };
let score = 0;
let coinsCollected = 0;
let lives = 3;
let timeLeft = LEVEL_TIME;
let timeAccum = 0;
let invulnUntil = 0;
let stateTimer = 0;
let heroMessageUntil = 0;
let frameTime = 0;
let currentPowerState = 'small'; // small | big | batarang — carries over between levels, resets on death
let batarangs = [];
let grappleCooldownUntil = 0;

function newPlayer(spawn, powerState = 'small') {
  const size = SIZES[powerState];
  return {
    x: spawn.x, y: spawn.y, w: size.w, h: size.h,
    vx: 0, vy: 0, onGround: false, facing: 1, dead: false,
    powerState,
    swinging: false, swingAnchor: null, swingRadius: 0, swingAngle: 0, swingAngularVel: 0,
    swingMinR: null,
    walkDist: 0,
  };
}

function setPowerState(newState) {
  if (player.powerState === newState) return;
  const oldH = player.h;
  const size = SIZES[newState];
  player.w = size.w;
  player.h = size.h;
  player.y += oldH - size.h; // keep feet planted when growing/shrinking
  player.powerState = newState;
  currentPowerState = newState;
}

function spawnBatarang() {
  batarangs.push({
    x: player.facing > 0 ? player.x + player.w : player.x - 10,
    y: player.y + player.h * 0.4,
    vx: BATARANG_SPEED * player.facing,
    traveled: 0,
    phase: 'out',
    rot: 0,
    bornAt: performance.now(),
    alive: true,
  });
}

function updateBatarangs(dt) {
  for (const b of batarangs) {
    if (!b.alive) continue;
    b.rot += 0.4 * dt;

    if (performance.now() - b.bornAt > BATARANG_LIFESPAN_MS) { b.alive = false; continue; }

    if (b.phase === 'out') {
      const step = b.vx * dt;
      b.x += step;
      b.traveled += Math.abs(step);
      const leadTx = Math.floor((b.x + (b.vx > 0 ? 8 : -8)) / TILE);
      if (b.traveled >= BATARANG_RANGE || isSolidTile(leadTx, Math.floor(b.y / TILE))) {
        b.phase = 'back';
      }
    } else {
      const dx = (player.x + player.w / 2) - b.x;
      const dy = (player.y + player.h / 2) - b.y;
      const d = Math.hypot(dx, dy) || 1;
      b.x += (dx / d) * BATARANG_SPEED * dt;
      b.y += (dy / d) * BATARANG_SPEED * dt;
      if (d < 20) { b.alive = false; continue; }
    }

    if (b.y > level.pixelHeight + 60) { b.alive = false; continue; }

    for (const g of level.thugs) {
      if (!g.alive) continue;
      if (b.x + 8 > g.x && b.x - 8 < g.x + g.w && b.y + 8 > g.y && b.y - 8 < g.y + g.h) {
        g.alive = false;
        score += 100;
        hud.score.textContent = score;
        break;
      }
    }
    for (const bd of level.birds) {
      if (!bd.alive) continue;
      if (b.x + 8 > bd.x && b.x - 8 < bd.x + bd.w && b.y + 8 > bd.y && b.y - 8 < bd.y + bd.h) {
        bd.alive = false;
        score += 100;
        hud.score.textContent = score;
        break;
      }
    }
    const v = level.villain;
    if (v && v.alive && Date.now() >= v.hitUntil &&
        b.x + 8 > v.x && b.x - 8 < v.x + v.w && b.y + 8 > v.y && b.y - 8 < v.y + v.h) {
      damageVillain();
    }
  }
  batarangs = batarangs.filter(b => b.alive);
}

function tryAttachGrapple(now) {
  if (now < grappleCooldownUntil || !level.swingPoints.length) return;
  const cx = player.x + player.w / 2, cy = player.y + player.h / 2;
  for (const sp of level.swingPoints) {
    if (sp.minR) {
      // trapeze: fixed rope length, grabbed by jumping near its hanging bar
      const barY = sp.y + sp.minR;
      if (Math.hypot(sp.x - cx, barY - cy) < TRAPEZE_LATCH_RANGE && sp.y < cy) {
        player.swinging = true;
        player.swingAnchor = sp;
        player.swingRadius = sp.minR;
        player.swingMinR = sp.minR;
        player.swingAngle = Math.atan2(cx - sp.x, cy - sp.y);
        const tang = player.vx * Math.cos(player.swingAngle) - player.vy * Math.sin(player.swingAngle);
        player.swingAngularVel = tang / sp.minR;
        return;
      }
      continue;
    }
    // Anchors with a rooftop right under them (climb anchors) must not
    // re-grab a player already standing on that roof — otherwise hopping
    // along the rooftop under its own lamppost yo-yos forever. Anchors
    // hanging over pits have no nearby floor and always latch.
    const hasCloseFloor = sp.floorY - sp.y <= TILE * 4;
    if (hasCloseFloor && player.y + player.h < sp.floorY + 6) continue;
    const dist = Math.hypot(sp.x - cx, sp.y - cy);
    if (dist < GRAPPLE_RANGE && sp.y < cy) {
      player.swinging = true;
      player.swingAnchor = sp;
      player.swingRadius = dist;
      player.swingMinR = null;
      player.swingAngle = Math.atan2(cx - sp.x, cy - sp.y);
      const tangential = player.vx * Math.cos(player.swingAngle) - player.vy * Math.sin(player.swingAngle);
      player.swingAngularVel = tangential / dist;
      return;
    }
  }
}

function updateSwing(dt, now) {
  const a = player.swingAnchor;
  // Batman reels the rope in while swinging: the radius shrinks toward the
  // anchor, converting momentum into height. The floor of 44px leaves his
  // feet just above a rooftop that sits 2 tiles below its lamppost, so a
  // release near the top of the reel lands ON the roof instead of under it.
  // Trapezes (swingMinR set) keep their fixed rope length instead.
  const reelFloor = player.swingMinR ?? 44;
  player.swingRadius = Math.max(reelFloor, player.swingRadius - (player.swingMinR ? 0 : 0.85) * dt);
  const r = player.swingRadius;
  const angAccel = -(GRAVITY / r) * Math.sin(player.swingAngle);
  player.swingAngularVel += angAccel * dt;
  player.swingAngle += player.swingAngularVel * dt;

  const cx = a.x + r * Math.sin(player.swingAngle);
  const cy = a.y + r * Math.cos(player.swingAngle);
  player.x = cx - player.w / 2;
  player.y = cy - player.h / 2;
  player.vx = player.swingAngularVel * r * Math.cos(player.swingAngle);
  player.vy = -player.swingAngularVel * r * Math.sin(player.swingAngle);
  if (Math.abs(player.vx) > 0.5) player.facing = player.vx > 0 ? 1 : -1;
  player.onGround = false;

  const releasedByJump = now < jumpBufferUntil;
  if (releasedByJump || Math.abs(player.swingAngle) > SWING_RELEASE_ANGLE) {
    player.swinging = false;
    player.swingAnchor = null;
    grappleCooldownUntil = now + GRAPPLE_COOLDOWN_MS;
    if (releasedByJump) { player.vy -= 3; jumpBufferUntil = 0; }
    // A release can leave the feet a few px inside a rooftop (the swing
    // ignores tiles). Snap up onto the surface — otherwise the horizontal
    // collision pass would eject Batman sideways across the whole building.
    for (const { ty } of rectTiles(player.x, player.y, player.w, player.h)) {
      const pen = player.y + player.h - ty * TILE;
      if (pen > 0 && pen <= 14) {
        player.y = ty * TILE - player.h;
        player.vy = Math.min(player.vy, 0);
        player.onGround = true;
        break;
      }
    }
  }
}

function cameraTargets() {
  const tx = player.x + player.w / 2 - CANVAS_W / 2;
  const ty = player.y + player.h / 2 - CANVAS_H * 0.55;
  return {
    x: Math.max(0, Math.min(tx, Math.max(0, level.pixelWidth - CANVAS_W))),
    y: Math.max(0, Math.min(ty, Math.max(0, level.pixelHeight - CANVAS_H))),
  };
}

function snapCameraToPlayer() {
  const t = cameraTargets();
  camera.x = t.x;
  camera.y = t.y;
}

function loadLevel(idx) {
  levelIndex = idx;
  level = buildLevel(LEVEL_SPECS[idx]);
  player = newPlayer(level.spawn, currentPowerState);
  snapCameraToPlayer();
  timeLeft = LEVEL_TIME;
  timeAccum = 0;
  batarangs = [];
  grappleCooldownUntil = 0;
  hud.level.textContent = level.name;
}

function startGame() {
  score = 0; coinsCollected = 0; lives = 3;
  currentPowerState = 'small';
  continueOffer = false;
  hud.score.textContent = 0;
  hud.coins.textContent = 0;
  hud.lives.textContent = 3;
  loadLevel(0);
  state = 'playing';
  overlay.classList.add('hidden');
}

// Spend coins to jump straight back into the warehouse after falling to Bane.
function continueAtBoss() {
  continueOffer = false;
  coinsCollected = Math.max(0, coinsCollected - CONTINUE_COST);
  hud.coins.textContent = coinsCollected;
  lives = 3;
  hud.lives.textContent = 3;
  loadLevel(BOSS_LEVEL_INDEX);
  state = 'playing';
  overlay.classList.add('hidden');
}

function restartGame() {
  if (state === 'start') return;
  startGame();
}

overlayBtn.addEventListener('click', () => {
  if (continueOffer) { continueAtBoss(); return; }
  if (state === 'start') {
    // the story first: Dos Caras kidnapping Robin
    overlay.classList.add('hidden');
    state = 'cutscene';
    return;
  }
  if (state === 'gameover' || state === 'win') startGame();
});

// any tap/keypress skips the intro scene
canvas.addEventListener('pointerdown', () => {
  if (state === 'cutscene') startGame();
});

// ---------------------------------------------------------------
// Collision helpers
// ---------------------------------------------------------------
function isSolidTile(tx, ty) {
  if (ty < 0) return false;
  if (ty >= level.height) return false; // below the map: open pit, falling here should kill the player
  if (tx < 0 || tx >= level.width) return true; // treat OOB sides as solid walls
  return level.solid[ty][tx];
}

function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function rectTiles(x, y, w, h) {
  const tiles = [];
  const tx0 = Math.floor(x / TILE), tx1 = Math.floor((x + w - 1) / TILE);
  const ty0 = Math.floor(y / TILE), ty1 = Math.floor((y + h - 1) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isSolidTile(tx, ty)) tiles.push({ tx, ty });
    }
  }
  return tiles;
}

function moveAndCollide(p, dt) {
  // Horizontal
  p.x += p.vx * dt;
  for (const { tx, ty } of rectTiles(p.x, p.y, p.w, p.h)) {
    const tileLeft = tx * TILE, tileRight = tileLeft + TILE;
    if (p.vx > 0) p.x = tileLeft - p.w;
    else if (p.vx < 0) p.x = tileRight;
    p.vx = 0;
  }
  if (p.x < 0) { p.x = 0; p.vx = 0; }

  // Vertical
  p.y += p.vy * dt;
  p.onGround = false;
  for (const { tx, ty } of rectTiles(p.x, p.y, p.w, p.h)) {
    const tileTop = ty * TILE, tileBottom = tileTop + TILE;
    if (p.vy > 0) { p.y = tileTop - p.h; p.onGround = true; }
    else if (p.vy < 0) { p.y = tileBottom; }
    p.vy = 0;
  }
}

// ---------------------------------------------------------------
// Update
// ---------------------------------------------------------------
function killPlayer() {
  // No invulnerability gate here: falling/timeout must always kill instantly.
  // Enemy-contact damage is already gated by hurtPlayer()'s own invuln check
  // before it ever reaches this function.
  lives--;
  hud.lives.textContent = Math.max(lives, 0);
  if (lives <= 0) {
    state = 'gameover';
    // Falling to Bane doesn't reset the whole game: spend coins to walk
    // straight back into the warehouse instead.
    if (levelIndex === BOSS_LEVEL_INDEX && coinsCollected >= CONTINUE_COST) {
      continueOffer = true;
      showOverlay('CAÍSTE EN EL GALPÓN',
        `Bane sigue ahí. Usá ${CONTINUE_COST} de tus ${coinsCollected} monedas para volver a enfrentarlo sin perder tu progreso (o presioná R para reiniciar desde cero).`,
        `USAR ${CONTINUE_COST} MONEDAS`);
      return;
    }
    showOverlay('GAME OVER', `Puntaje final: ${score}. Presioná R o el botón para reintentar.`, 'REINTENTAR');
    return;
  }
  currentPowerState = 'small';
  player = newPlayer(level.spawn, 'small');
  snapCameraToPlayer();
  timeLeft = LEVEL_TIME;
  invulnUntil = Date.now() + INVULN_TIME;
  // reset the boss fight positions (Bane keeps the damage already dealt)
  if (level.bane && level.bane.alive) {
    const bn = level.bane;
    bn.x = 26 * TILE;
    bn.vy = 0;
    bn.y = level.groundY * TILE - bn.h;
    if (bn.state !== 'idle') { bn.state = 'fight'; bn.waveAt = performance.now() + 4000; }
    level.waves.length = 0;
  }
}

function damageVillain() {
  const v = level.villain;
  if (!v || !v.alive || Date.now() < v.hitUntil) return;
  v.hp--;
  v.hitUntil = Date.now() + 500;
  if (v.hp <= 0) {
    v.alive = false;
    score += 5000;
  } else {
    score += 200;
  }
  hud.score.textContent = score;
}

function hurtPlayer() {
  if (Date.now() < invulnUntil) return;
  if (player.powerState !== 'small') {
    setPowerState(player.powerState === 'batarang' ? 'big' : 'small');
    invulnUntil = Date.now() + INVULN_TIME;
    return;
  }
  killPlayer();
}

function levelEnemyTotals() {
  const total = level.thugs.length + level.birds.length + (level.villain ? 1 : 0);
  const defeated = level.thugs.filter(g => !g.alive).length +
    level.birds.filter(b => !b.alive).length +
    (level.villain && !level.villain.alive ? 1 : 0);
  return { total, defeated };
}

function completeLevel() {
  state = 'levelcomplete';
  stateTimer = 1400;
  score += Math.floor(timeLeft) * 5;
}

function showOverlay(title, msg, btnLabel) {
  overlayTitle.textContent = title;
  overlayMsg.textContent = msg;
  overlayBtn.textContent = btnLabel;
  overlay.classList.remove('hidden');
}

// ---------------------------------------------------------------
// Bane (Act 1 boss)
// ---------------------------------------------------------------
function baneHeadBox(bn) {
  return { x: bn.x + bn.w / 2 - 24, y: bn.y - 6, w: 48, h: 44 };
}

function updateBane(dt, now) {
  const bn = level.bane;
  const floorY = level.groundY * TILE;

  if (!bn.alive) {
    if (bn.deadAt && now - bn.deadAt > 1500 && state === 'playing') completeLevel();
    return;
  }

  if (bn.state === 'idle') {
    // Bane spots Batman and slams the venom button
    if (player.x > 6 * TILE) {
      bn.state = 'growing';
      bn.growStart = now;
    }
  } else if (bn.state === 'growing') {
    const t = Math.min(1, (now - bn.growStart) / BANE_GROW_MS);
    bn.w = 30 + (BANE_BIG.w - 30) * t;
    bn.h = 44 + (BANE_BIG.h - 44) * t;
    bn.y = floorY - bn.h; // feet stay planted while he grows
    if (t >= 1) {
      bn.state = 'fight';
      bn.waveAt = now + 5000;
    }
  } else if (bn.state === 'fight') {
    const speed = bn.hp <= 2 ? 2.3 : 1.3; // 3rd hit taken -> he gets faster
    bn.x += bn.vx * speed * dt;
    if (bn.x < bn.minX) { bn.x = bn.minX; bn.vx = Math.abs(bn.vx); }
    if (bn.x + bn.w > bn.maxX) { bn.x = bn.maxX - bn.w; bn.vx = -Math.abs(bn.vx); }
    if (now > bn.waveAt) {
      bn.state = 'telegraph';
      bn.teleStart = now;
    }
  } else if (bn.state === 'telegraph') {
    // crouched, shaking: the couple of seconds of warning before the jump
    if (now - bn.teleStart > BANE_TELEGRAPH_MS) {
      bn.state = 'jumping';
      bn.vy = -13;
    }
  } else if (bn.state === 'jumping') {
    bn.vy += GRAVITY * dt;
    bn.y += bn.vy * dt;
    if (bn.y + bn.h >= floorY) {
      bn.y = floorY - bn.h;
      bn.vy = 0;
      bn.state = 'fight';
      bn.waveAt = now + (bn.hp <= 2 ? 4200 : 6200);
      level.waves.push({ x: bn.x + bn.w / 2, r: 26, hit: false });
    }
  }

  // shockwaves race along the floor; only grounded players get hit
  for (const wv of level.waves) {
    wv.r += BANE_WAVE_SPEED * dt;
    if (player.onGround && !player.swinging) {
      const d = Math.abs((player.x + player.w / 2) - wv.x);
      if (Math.abs(d - wv.r) < 26) hurtPlayer();
    }
  }
  level.waves = level.waves.filter(wv => wv.r < level.pixelWidth);
  if (state !== 'playing') return;

  // hits: Batman swinging into Bane's head — 5 and he's done
  if (bn.state !== 'idle' && bn.state !== 'growing') {
    const head = baneHeadBox(bn);
    if (player.swinging && now > bn.hitUntil && aabbOverlap(player, head)) {
      bn.hp--;
      bn.hitUntil = now + BANE_HIT_FLASH_MS;
      player.swingAngularVel *= -0.7; // the blow rebounds the swing
      score += 400;
      hud.score.textContent = score;
      if (bn.hp <= 0) {
        bn.alive = false;
        bn.deadAt = now;
        score += 5000;
        hud.score.textContent = score;
        return;
      }
    }
    // body contact on the ground hurts Batman (the swing is the safe spot)
    if (!player.swinging && Date.now() >= invulnUntil && aabbOverlap(player, bn)) {
      hurtPlayer();
    }
  }
}

function updatePlaying(dt) {
  const now = performance.now();

  if (player.swinging) {
    updateSwing(dt, now);
  } else {
    // horizontal input
    const accel = player.onGround ? MOVE_ACCEL : AIR_ACCEL;
    if (keys.left && !keys.right) {
      player.vx -= accel * dt;
      player.facing = -1;
    } else if (keys.right && !keys.left) {
      player.vx += accel * dt;
      player.facing = 1;
    } else if (player.onGround) {
      player.vx *= FRICTION;
      if (Math.abs(player.vx) < 0.05) player.vx = 0;
    }
    player.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, player.vx));

    // walk-cycle distance: only advances while actually moving on the ground,
    // so the legs animate in step with real travel instead of just sliding
    if (player.onGround) player.walkDist = (player.walkDist || 0) + Math.abs(player.vx) * dt;

    // jump: buffered press + coyote time, so a tap always registers even if it
    // lands a frame or two before touching ground / after leaving a ledge
    if (player.onGround) coyoteUntil = now + COYOTE_MS;
    if (now < jumpBufferUntil && now < coyoteUntil) {
      player.vy = JUMP_VELOCITY;
      player.onGround = false;
      jumpBufferUntil = 0;
      coyoteUntil = 0;
    }
    if (!keys.jump && player.vy < JUMP_VELOCITY * JUMP_CUT) {
      player.vy = JUMP_VELOCITY * JUMP_CUT;
    }

    // gravity
    player.vy += GRAVITY * dt;
    if (player.vy > MAX_FALL) player.vy = MAX_FALL;

    moveAndCollide(player, dt);

    if (!player.onGround) tryAttachGrapple(now);
  }

  // batarang throw (works whether swinging or not)
  if (now < shootBufferUntil && player.powerState === 'batarang' && now - lastShotAt > SHOOT_COOLDOWN_MS) {
    spawnBatarang();
    lastShotAt = now;
    shootBufferUntil = 0;
  }

  // fell into a pit
  if (player.y > level.pixelHeight + 60) {
    killPlayer();
    return;
  }

  // coins
  for (const c of level.coins) {
    if (c.taken) continue;
    const dx = (player.x + player.w / 2) - c.x;
    const dy = (player.y + player.h / 2) - c.y;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
      c.taken = true;
      coinsCollected++;
      score += 100;
      hud.coins.textContent = coinsCollected;
      hud.score.textContent = score;
    }
  }

  // bats: in Act 1 the emblem only makes Batman stronger (an extra hit).
  // The batarang returns as an upgrade in Act 2.
  for (const bat of level.bats) {
    if (bat.taken) continue;
    if (aabbOverlap(player, bat)) {
      bat.taken = true;
      setPowerState('big');
      score += BAT_SCORE;
      hud.score.textContent = score;
    }
  }

  updateBatarangs(dt);

  // thugs
  for (const g of level.thugs) {
    if (!g.alive) continue;
    g.x += g.vx * dt;
    if (g.x < g.minX) { g.x = g.minX; g.vx = Math.abs(g.vx); }
    if (g.x + g.w > g.maxX) { g.x = g.maxX - g.w; g.vx = -Math.abs(g.vx); }

    if (aabbOverlap(player, g)) {
      const stomped = player.vy > 0 && (player.y + player.h - g.y) < STOMP_TOLERANCE;
      if (stomped) {
        g.alive = false;
        player.vy = STOMP_BOUNCE;
        score += 100;
        hud.score.textContent = score;
      } else {
        hurtPlayer();
        return;
      }
    }
  }

  // birds
  for (const b of level.birds) {
    if (!b.alive) continue;
    b.x += b.vx * dt;
    if (b.x < b.minX) { b.x = b.minX; b.vx = Math.abs(b.vx); }
    if (b.x + b.w > b.maxX) { b.x = b.maxX - b.w; b.vx = -Math.abs(b.vx); }
    b.y = b.baseY + Math.sin(now / 300 + b.x * 0.04) * 10;

    if (aabbOverlap(player, b)) {
      const stomped = player.vy > 0 && (player.y + player.h - b.y) < STOMP_TOLERANCE;
      if (stomped) {
        b.alive = false;
        player.vy = STOMP_BOUNCE;
        score += 150;
        hud.score.textContent = score;
      } else {
        hurtPlayer();
        return;
      }
    }
  }

  // villain (boss)
  if (level.villain && level.villain.alive) {
    const v = level.villain;
    v.x += v.vx * dt;
    if (v.x < v.minX) { v.x = v.minX; v.vx = Math.abs(v.vx); }
    if (v.x + v.w > v.maxX) { v.x = v.maxX - v.w; v.vx = -Math.abs(v.vx); }

    if (aabbOverlap(player, v)) {
      const stomped = player.vy > 0 && (player.y + player.h - v.y) < STOMP_TOLERANCE;
      if (stomped) {
        player.vy = STOMP_BOUNCE;
        damageVillain();
      } else {
        hurtPlayer();
        return;
      }
    }
  }

  // Bane boss fight (warehouse arena)
  if (level.bane) {
    updateBane(dt, now);
    if (state !== 'playing') return; // a shockwave/contact may have ended the run
  }

  // level exit door (outdoor levels; the warehouse ends when Bane falls)
  if (!level.indoor) {
    const dxf = (player.x + player.w / 2) - level.flag.x;
    if (Math.abs(dxf) < 18 && player.y + player.h > level.flag.topY) {
      const { total, defeated } = levelEnemyTotals();
      const ratio = total === 0 ? 1 : defeated / total;
      if (ratio >= REQUIRED_DEFEAT_RATIO) {
        completeLevel();
        return;
      }
      heroMessageUntil = Date.now() + HERO_MESSAGE_MS;
    }
  }

  // timer
  timeAccum += dt / 60;
  if (timeAccum >= 1) {
    timeAccum = 0;
    timeLeft--;
    hud.time.textContent = Math.max(timeLeft, 0);
    if (timeLeft <= 0) { killPlayer(); return; }
  }

  // camera: horizontal follows directly; vertical eases in so rooftop hops
  // and swings don't jerk the view around
  const targets = cameraTargets();
  camera.x = targets.x;
  camera.y += (targets.y - camera.y) * Math.min(1, 0.12 * dt);
}

function update(dt) {
  if (state === 'playing') {
    updatePlaying(dt);
  } else if (state === 'levelcomplete') {
    stateTimer -= dt * (1000 / 60);
    if (stateTimer <= 0) {
      if (levelIndex + 1 < LEVEL_SPECS.length) {
        loadLevel(levelIndex + 1);
        state = 'playing';
      } else {
        state = 'win';
        showOverlay('FIN DEL ACTO 1',
          `Bane cayó. Entre sus cosas, Batman encuentra una moneda quemada de dos caras: la pista que buscaba. Robin sigue secuestrado... la historia continúa en el ACTO 2. Puntaje: ${score} con ${coinsCollected} monedas.`,
          'JUGAR DE NUEVO');
      }
    }
  }
}

// ---------------------------------------------------------------
// Render
// ---------------------------------------------------------------
function hash01(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function drawSkylineRow(offset, baseline, buildingW, maxH, seed, withWindows, t, buildingColor) {
  const count = Math.ceil(CANVAS_W / buildingW) + 3;
  const startIdx = Math.floor(offset / buildingW) - 1;
  for (let i = startIdx; i < startIdx + count; i++) {
    const bx = i * buildingW - offset;
    const h = 70 + hash01(i * seed) * maxH;
    const by = baseline - h;
    ctx.fillStyle = buildingColor; // windows below reassign fillStyle, so reset it each building
    ctx.fillRect(bx, by, buildingW - 4, h + 200);
    // rooftop antenna on some buildings
    if (hash01(i * seed + 5) > 0.7) {
      ctx.fillRect(bx + buildingW * 0.4, by - 14, 2, 14);
    }
    if (withWindows) {
      const cols = Math.max(1, Math.floor((buildingW - 8) / 9));
      const rows = Math.max(1, Math.floor((h - 10) / 14));
      for (let cx = 0; cx < cols; cx++) {
        for (let ry = 0; ry < rows; ry++) {
          const seedN = i * 97 + cx * 13 + ry * 7;
          if (hash01(seedN) < 0.45) continue; // this window is dark
          const flicker = Math.sin(t / 500 + seedN * 3.1) > -0.75; // occasional blink
          if (!flicker) continue;
          ctx.fillStyle = hash01(seedN + 1) > 0.85 ? '#7ad7ff' : '#ffcf6b';
          ctx.fillRect(bx + 4 + cx * 9, by + 8 + ry * 14, 4, 6);
        }
      }
    }
  }
}

// 0 at street level, 1 at the top of the level — drives the changing
// ambience as Batman climbs: darker/clearer sky, stars, skyline sinking below.
function levelAltitude() {
  const range = level.pixelHeight - CANVAS_H;
  if (range <= 0) return 0;
  return 1 - camera.y / range;
}

function mixChannel(a, b, t) { return Math.round(a + (b - a) * t); }
function mixColor(a, b, t) {
  return `rgb(${mixChannel(a[0], b[0], t)},${mixChannel(a[1], b[1], t)},${mixChannel(a[2], b[2], t)})`;
}

// Abandoned warehouse interior for the Bane fight: corrugated walls,
// roof trusses, hanging lamps and moonlight through broken windows.
function drawWarehouseBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, '#141210');
  g.addColorStop(0.7, '#221d18');
  g.addColorStop(1, '#191512');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const par = camera.x * 0.5;

  // corrugated wall lines
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  const off = -(par % 18);
  for (let x = off; x < CANVAS_W; x += 18) {
    ctx.beginPath(); ctx.moveTo(x, 60); ctx.lineTo(x, level.groundY * TILE); ctx.stroke();
  }
  // horizontal girders
  ctx.fillStyle = '#2b241d';
  ctx.fillRect(0, 170, CANVAS_W, 10);
  ctx.fillRect(0, 300, CANVAS_W, 10);

  // broken windows + moonlight shafts
  const wOff = -(par % 300);
  for (let i = -1; i < 4; i++) {
    const wx = wOff + i * 300 + 80;
    ctx.fillStyle = '#3d4b66';
    ctx.fillRect(wx, 84, 70, 44);
    ctx.strokeStyle = '#191512';
    ctx.lineWidth = 3;
    ctx.strokeRect(wx, 84, 70, 44);
    ctx.beginPath(); ctx.moveTo(wx + 35, 84); ctx.lineTo(wx + 35, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wx, 106); ctx.lineTo(wx + 70, 106); ctx.stroke();
    ctx.fillStyle = '#191512';
    ctx.beginPath();
    ctx.moveTo(wx + 38, 86); ctx.lineTo(wx + 52, 86); ctx.lineTo(wx + 40, 104);
    ctx.closePath(); ctx.fill();
    const shaft = ctx.createLinearGradient(wx, 84, wx - 40, level.groundY * TILE);
    shaft.addColorStop(0, 'rgba(160,190,235,0.09)');
    shaft.addColorStop(1, 'rgba(160,190,235,0)');
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.moveTo(wx, 84); ctx.lineTo(wx + 70, 84);
    ctx.lineTo(wx + 30, level.groundY * TILE); ctx.lineTo(wx - 60, level.groundY * TILE);
    ctx.closePath(); ctx.fill();
  }

  // ceiling truss
  ctx.fillStyle = '#191512';
  ctx.fillRect(0, 0, CANVAS_W, 30);
  ctx.strokeStyle = '#2f2721';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, 36); ctx.lineTo(CANVAS_W, 36); ctx.stroke();
  const tOff = -(par % 90);
  for (let x = tOff - 90; x < CANVAS_W; x += 90) {
    ctx.beginPath(); ctx.moveTo(x, 36); ctx.lineTo(x + 45, 6); ctx.lineTo(x + 90, 36); ctx.stroke();
  }

  // hanging lamps with warm pools of light
  const lOff = -(par % 380);
  for (let i = -1; i < 4; i++) {
    const lx = lOff + i * 380 + 200;
    ctx.strokeStyle = '#0d0b09';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(lx, 38); ctx.lineTo(lx, 72); ctx.stroke();
    ctx.fillStyle = '#3a3128';
    ctx.beginPath();
    ctx.moveTo(lx - 14, 72); ctx.lineTo(lx + 14, 72); ctx.lineTo(lx + 8, 60); ctx.lineTo(lx - 8, 60);
    ctx.closePath(); ctx.fill();
    const flick = 0.8 + 0.2 * Math.sin(t / 300 + i * 2.1);
    const lg = ctx.createRadialGradient(lx, 78, 4, lx, 78, 85);
    lg.addColorStop(0, `rgba(255,214,130,${0.45 * flick})`);
    lg.addColorStop(1, 'rgba(255,214,130,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(lx, 78, 85, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath(); ctx.arc(lx, 76, 5, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBackground(t) {
  if (level.indoor) { drawWarehouseBackground(t); return; }
  const alt = levelAltitude();
  // vertical parallax: the whole skyline sinks as Batman climbs above it
  const skySink = (level.pixelHeight - CANVAS_H - camera.y) * 0.22;

  // sky gets deeper and clearer with altitude
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, mixColor([8, 11, 28], [2, 3, 12], alt));
  g.addColorStop(0.55, mixColor([18, 23, 54], [9, 12, 34], alt));
  g.addColorStop(1, mixColor([35, 42, 77], [19, 24, 56], alt));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // stars fade in as the city noise drops away below
  if (alt > 0.05) {
    for (let i = 0; i < 70; i++) {
      const sx = hash01(i * 7.31) * CANVAS_W;
      const sy = hash01(i * 3.77) * CANVAS_H * 0.75;
      const twinkle = 0.5 + 0.5 * Math.sin(t / 700 + i * 2.3);
      ctx.fillStyle = `rgba(220,230,255,${((0.25 + 0.55 * hash01(i * 1.7)) * alt * twinkle).toFixed(3)})`;
      ctx.fillRect(sx, sy, 2, 2);
    }
  }

  // moon
  ctx.fillStyle = '#eceadb';
  ctx.beginPath();
  ctx.arc(660, 75, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = mixColor([18, 23, 54], [9, 12, 34], alt);
  ctx.beginPath();
  ctx.arc(674, 66, 32, 0, Math.PI * 2);
  ctx.fill();

  // thin drifting clouds — they slide below Batman as he gains altitude
  ctx.fillStyle = 'rgba(200,210,235,0.12)';
  const cloudP = camera.x * 0.08;
  for (let i = -1; i < 4; i++) {
    const cx = i * 260 - (cloudP % 260);
    ctx.beginPath();
    ctx.ellipse(cx, 110 + skySink * 0.5, 90, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // far skyline (slow parallax, no windows, flat silhouette)
  drawSkylineRow(camera.x * 0.15, 300 + skySink, 46, 140, 0.9, false, t, '#161a35');

  drawBatSignal(t, skySink * 0.6);

  // near skyline (faster parallax, lit flickering windows)
  drawSkylineRow(camera.x * 0.35, 340 + skySink * 1.35, 34, 190, 1.7, true, t, '#0c0f22');
}

function drawBatSignal(t, sink = 0) {
  const sx = 240 - camera.x * 0.05; // barely moves — reads as a distant searchlight
  const beamTopY = 130 + sink, beamBottomY = 300 + sink;
  const flicker = 0.85 + 0.15 * Math.sin(t / 900);

  ctx.save();
  const beamGrad = ctx.createLinearGradient(0, beamBottomY, 0, beamTopY);
  beamGrad.addColorStop(0, `rgba(255,224,150,${0.16 * flicker})`);
  beamGrad.addColorStop(1, 'rgba(255,224,150,0)');
  ctx.fillStyle = beamGrad;
  ctx.beginPath();
  ctx.moveTo(sx - 10, beamBottomY);
  ctx.lineTo(sx - 55, beamTopY);
  ctx.lineTo(sx + 55, beamTopY);
  ctx.lineTo(sx + 10, beamBottomY);
  ctx.closePath();
  ctx.fill();

  const glowGrad = ctx.createRadialGradient(sx, beamTopY, 4, sx, beamTopY, 60);
  glowGrad.addColorStop(0, `rgba(255,224,150,${0.5 * flicker})`);
  glowGrad.addColorStop(1, 'rgba(255,224,150,0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(sx, beamTopY, 60, 0, Math.PI * 2);
  ctx.fill();

  // bat emblem silhouette, projected in the beam like the classic bat-signal
  ctx.fillStyle = `rgba(25,18,10,${0.8 * flicker})`;
  const cx = sx, cy = beamTopY;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx - 5, cy - 12);
  ctx.lineTo(cx - 3, cy - 5);
  ctx.lineTo(cx - 26, cy - 15);
  ctx.lineTo(cx - 15, cy - 2);
  ctx.lineTo(cx - 28, cy + 5);
  ctx.lineTo(cx - 10, cy + 5);
  ctx.lineTo(cx - 7, cy + 13);
  ctx.lineTo(cx, cy + 6);
  ctx.lineTo(cx + 7, cy + 13);
  ctx.lineTo(cx + 10, cy + 5);
  ctx.lineTo(cx + 28, cy + 5);
  ctx.lineTo(cx + 15, cy - 2);
  ctx.lineTo(cx + 26, cy - 15);
  ctx.lineTo(cx + 3, cy - 5);
  ctx.lineTo(cx + 5, cy - 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTrash(t) {
  for (let tx = Math.max(0, Math.floor(camera.x / TILE) - 1); tx <= Math.ceil((camera.x + CANVAS_W) / TILE); tx++) {
    if (tx < 0 || tx >= level.width || !level.solid[level.groundY][tx]) continue;
    const r = hash01(tx * 3.7);
    if (r > 0.62) continue; // most tiles are clean
    const px = tx * TILE - camera.x;
    const py = level.groundY * TILE - camera.y;
    if (r < 0.22) {
      // crumpled can
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(px + 12, py - 9, 7, 9);
      ctx.fillStyle = '#4b5160';
      ctx.fillRect(px + 12, py - 9, 7, 2);
    } else if (r < 0.42) {
      // paper scrap
      ctx.fillStyle = '#cfd0c9';
      ctx.save();
      ctx.translate(px + 10, py - 4);
      ctx.rotate(hash01(tx * 9.1) - 0.5);
      ctx.fillRect(-6, -5, 11, 8);
      ctx.restore();
    } else {
      // newspaper page
      ctx.fillStyle = '#b9bcb2';
      ctx.fillRect(px + 6, py - 3, 16, 5);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 6, py - 3, 16, 5);
    }
  }
}

function wallAt(tx) {
  for (const w of level.walls) {
    if (tx >= w.x && tx < w.x + w.w) return w;
  }
  return null;
}

function houseAt(tx) {
  for (const hs of level.houses) {
    if (tx >= hs.x && tx < hs.x + hs.w) return hs;
  }
  return null;
}

function drawTiles() {
  const tx0 = Math.floor(camera.x / TILE);
  const tx1 = Math.ceil((camera.x + CANVAS_W) / TILE);
  const ty0 = Math.max(0, Math.floor(camera.y / TILE));
  const ty1 = Math.min(level.height - 1, Math.ceil((camera.y + CANVAS_H) / TILE));
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = Math.max(0, tx0); tx <= Math.min(level.width - 1, tx1); tx++) {
      if (!level.solid[ty][tx]) continue;
      const px = tx * TILE - camera.x, py = ty * TILE - camera.y;
      // gabled houses paint their own roof + facade in drawHouses()
      const hs = houseAt(tx);
      if (hs && ty < hs.baseRow) continue;
      const wall = ty < level.groundY ? wallAt(tx) : null;

      if (wall) {
        if (ty === wall.topRow) {
          // rooftop cap: gravel surface + a parapet ledge lip along the edge
          ctx.fillStyle = '#6b7280';
          ctx.fillRect(px, py, TILE, 9);
          ctx.fillStyle = '#4b5160';
          ctx.fillRect(px, py + 9, TILE, TILE - 9);
          ctx.fillStyle = '#8b90a0';
          ctx.fillRect(px, py, TILE, 3);
        } else {
          // building facade below the roofline: brick-like banding
          ctx.fillStyle = '#463c34';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px, py + 11); ctx.lineTo(px + TILE, py + 11);
          ctx.moveTo(px, py + 22); ctx.lineTo(px + TILE, py + 22);
          const jointX = px + (ty % 2 === 0 ? 16 : 0);
          ctx.moveTo(jointX, py); ctx.lineTo(jointX, py + TILE);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        continue;
      }

      const exposedTop = ty === 0 || !level.solid[ty - 1][tx];
      if (exposedTop) {
        ctx.fillStyle = '#565c6b';
        ctx.fillRect(px, py, TILE, 7);
        ctx.fillStyle = '#282c36';
        ctx.fillRect(px, py + 7, TILE, TILE - 7);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.strokeRect(px + 4, py + 2, TILE - 8, 2);
      } else {
        ctx.fillStyle = '#282c36';
        ctx.fillRect(px, py, TILE, TILE);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    }
  }
}

function drawRooftopProps() {
  for (const w of level.walls) {
    const cx = (w.x + w.w / 2) * TILE - camera.x;
    const topY = w.topRow * TILE - camera.y;
    if (cx < -30 || cx > CANVAS_W + 30) continue;
    // small AC unit / vent box sitting on the rooftop
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(cx - 10, topY - 12, 20, 12);
    ctx.fillStyle = '#22262e';
    ctx.fillRect(cx - 10, topY - 12, 20, 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 10.5, topY - 12.5, 20, 12);
    // a thin antenna pipe
    ctx.strokeStyle = '#5a606c';
    ctx.beginPath();
    ctx.moveTo(cx + 14, topY - 12);
    ctx.lineTo(cx + 14, topY - 30);
    ctx.stroke();
  }
}

// Gabled ("2 aguas") houses: brick facade, stepped shingled roof slopes
// meeting at a flat ridge, attic window, chimney with drifting smoke.
function drawHouses(t) {
  for (const hs of level.houses) {
    const x0 = hs.x * TILE - camera.x;
    const wpx = hs.w * TILE;
    if (x0 + wpx < -40 || x0 > CANVAS_W + 40) continue;
    const eaveY = (hs.eaveRow + 1) * TILE - camera.y;
    const baseY = hs.baseRow * TILE - camera.y;

    // brick facade
    ctx.fillStyle = '#4a3a30';
    ctx.fillRect(x0, eaveY, wpx, baseY - eaveY);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let y = eaveY + 11; y < baseY; y += 11) {
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + wpx, y); ctx.stroke();
    }
    // lit windows on the facade
    if (baseY - eaveY >= 30) {
      for (let k = 0; k < 2; k++) {
        const wx = x0 + wpx * (0.22 + k * 0.45);
        ctx.fillStyle = hash01(hs.x + k * 7) > 0.35 ? '#ffcf6b' : '#1c2438';
        ctx.fillRect(wx, eaveY + 9, 13, 16);
        ctx.strokeStyle = '#241f1a';
        ctx.strokeRect(wx, eaveY + 9, 13, 16);
      }
    }

    // stepped roof columns with shingle rows; a diagonal bevel at each step
    // corner turns the tile staircase into a readable two-slope roofline
    for (let i = 0; i < hs.w; i++) {
      const colTop = hs.topRow + Math.max(0, (hs.w / 2 - 1) - Math.min(i, hs.w - 1 - i));
      const cx0 = (hs.x + i) * TILE - camera.x;
      const cy0 = colTop * TILE - camera.y;
      const chh = eaveY - cy0;
      if (chh <= 0) continue;
      ctx.fillStyle = '#39415c';
      ctx.fillRect(cx0, cy0, TILE, chh);
      ctx.strokeStyle = 'rgba(20,25,44,0.55)';
      ctx.lineWidth = 1.5;
      for (let sy = cy0 + 8; sy < eaveY; sy += 8) {
        ctx.beginPath(); ctx.moveTo(cx0 + 1, sy); ctx.lineTo(cx0 + TILE - 1, sy); ctx.stroke();
      }
      // slope highlight along the top of each step
      ctx.fillStyle = '#99a3c0';
      ctx.fillRect(cx0, cy0, TILE, 2.5);
      // corner bevels pointing up toward the ridge
      const onLeftSlope = i < hs.w / 2 - 1;
      const onRightSlope = i > hs.w / 2;
      ctx.fillStyle = '#39415c';
      if (onLeftSlope) {
        ctx.beginPath();
        ctx.moveTo(cx0 + TILE - 13, cy0);
        ctx.lineTo(cx0 + TILE, cy0);
        ctx.lineTo(cx0 + TILE, cy0 - 13);
        ctx.closePath(); ctx.fill();
      } else if (onRightSlope) {
        ctx.beginPath();
        ctx.moveTo(cx0, cy0 - 13);
        ctx.lineTo(cx0, cy0);
        ctx.lineTo(cx0 + 13, cy0);
        ctx.closePath(); ctx.fill();
      }
    }
    // eave fascia
    ctx.fillStyle = '#22263a';
    ctx.fillRect(x0 - 6, eaveY - 4, wpx + 12, 5);

    // attic window in the gable, just under the ridge
    const cxm = x0 + wpx / 2;
    const atticY = (hs.topRow + 1) * TILE - camera.y + 6;
    ctx.fillStyle = '#ffcf6b';
    ctx.beginPath(); ctx.arc(cxm, atticY, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#181b28';
    ctx.lineWidth = 2;
    ctx.stroke();

    // chimney on the right slope with smoke
    const chCol = hs.w - 2;
    const chTop = (hs.topRow + 1) * TILE - camera.y;
    const chx = (hs.x + chCol) * TILE - camera.x + 10;
    ctx.fillStyle = '#3a3128';
    ctx.fillRect(chx, chTop - 20, 13, 20);
    ctx.fillStyle = '#241f1a';
    ctx.fillRect(chx - 2, chTop - 24, 17, 5);
    ctx.fillStyle = 'rgba(200,210,235,0.13)';
    const puff = (t / 900 + hs.x) % 1;
    ctx.beginPath(); ctx.ellipse(chx + 8 + puff * 8, chTop - 34 - puff * 14, 8 + puff * 5, 5 + puff * 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(chx + 14 + puff * 12, chTop - 48 - puff * 18, 10 + puff * 6, 6 + puff * 3, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawSwingPoints(t) {
  for (const sp of level.swingPoints) {
    if (sp.minR) continue; // trapezes have their own rendering
    const px = sp.x - camera.x;
    if (px < -30 || px > CANVAS_W + 30) continue;
    const ay = sp.y - camera.y;
    const poleBottom = sp.floorY - camera.y;
    ctx.strokeStyle = '#3a3f4b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(px, ay);
    ctx.lineTo(px, poleBottom);
    ctx.stroke();
    // lamp arm
    ctx.beginPath();
    ctx.moveTo(px, ay);
    ctx.lineTo(px + 22, ay + 10);
    ctx.stroke();
    // glowing lamp head
    const glow = 0.6 + 0.4 * Math.abs(Math.sin(t / 500 + sp.x));
    const grad = ctx.createRadialGradient(px + 22, ay + 10, 2, px + 22, ay + 10, 22);
    grad.addColorStop(0, `rgba(255,224,150,${0.8 * glow})`);
    grad.addColorStop(1, 'rgba(255,224,150,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px + 22, ay + 10, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe096';
    ctx.beginPath();
    ctx.arc(px + 22, ay + 10, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSwingRope() {
  if (!player.swinging) return;
  const a = player.swingAnchor;
  const px = a.x - camera.x;
  const hx = player.x + player.w / 2 - camera.x;
  const hy = player.y + player.h * 0.2 - camera.y;
  ctx.strokeStyle = '#c9cdd6';
  ctx.lineWidth = 2;
  if (a.minR) {
    // trapeze: two ropes down to the bar in Batman's hands
    ctx.beginPath();
    ctx.moveTo(px - 12, a.y - camera.y);
    ctx.lineTo(hx - 10, hy);
    ctx.moveTo(px + 12, a.y - camera.y);
    ctx.lineTo(hx + 10, hy);
    ctx.stroke();
    ctx.fillStyle = '#8a6a42';
    ctx.fillRect(hx - 15, hy - 2, 30, 5);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(px, a.y - camera.y);
  ctx.lineTo(hx, hy);
  ctx.stroke();
}

// Idle trapezes hanging from the warehouse rafters, swaying gently.
function drawTrapezes(t) {
  for (const sp of level.swingPoints) {
    if (!sp.minR) continue;
    if (player.swinging && player.swingAnchor === sp) continue;
    const ax = sp.x - camera.x;
    if (ax < -60 || ax > CANVAS_W + 60) continue;
    const ay = sp.y - camera.y;
    const sway = Math.sin(t / 800 + sp.x) * 5;
    const barX = ax + sway;
    const barY = ay + sp.minR;
    // ceiling mount
    ctx.fillStyle = '#2f2721';
    ctx.fillRect(ax - 16, ay - 6, 32, 7);
    ctx.strokeStyle = '#c9cdd6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(ax - 12, ay);
    ctx.lineTo(barX - 13, barY);
    ctx.moveTo(ax + 12, ay);
    ctx.lineTo(barX + 13, barY);
    ctx.stroke();
    // wooden bar
    ctx.fillStyle = '#8a6a42';
    ctx.fillRect(barX - 19, barY, 38, 6);
    ctx.strokeStyle = '#241f1a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX - 19, barY, 38, 6);
  }
}

function drawCoins(t) {
  for (const c of level.coins) {
    if (c.taken) continue;
    const px = c.x - camera.x;
    if (px < -20 || px > CANVAS_W + 20) continue;
    const scale = 0.7 + 0.3 * Math.abs(Math.sin(t / 220 + c.x));
    ctx.save();
    ctx.translate(px, c.y - camera.y);
    ctx.scale(scale, 1);
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd166';
    ctx.fill();
    ctx.strokeStyle = '#c9922c';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

function drawThugs() {
  for (const g of level.thugs) {
    if (!g.alive) continue;
    const px = g.x - camera.x;
    if (px < -40 || px > CANVAS_W + 40) continue;
    const gy = g.y - camera.y;

    ctx.fillStyle = '#15171c';
    ctx.fillRect(px + 4, gy + g.h - 7, 6, 7);
    ctx.fillRect(px + g.w - 10, gy + g.h - 7, 6, 7);

    ctx.fillStyle = '#3d4250';
    ctx.fillRect(px + 2, gy + 9, g.w - 4, g.h - 16);

    ctx.fillStyle = '#2a2e38';
    ctx.beginPath();
    ctx.arc(px + g.w / 2, gy + 9, g.w / 2 - 1, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(px + 2, gy + 7, g.w - 4, 5);

    ctx.fillStyle = '#0e0f13';
    ctx.beginPath();
    ctx.ellipse(px + g.w / 2, gy + 10, g.w * 0.24, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffd166';
    ctx.fillRect(px + g.w * 0.32, gy + 9, 2.5, 2.5);
    ctx.fillRect(px + g.w * 0.62, gy + 9, 2.5, 2.5);
  }
}

function drawBirds(t) {
  for (const b of level.birds) {
    if (!b.alive) continue;
    const px = b.x - camera.x;
    if (px < -40 || px > CANVAS_W + 40) continue;
    const flap = Math.sin(t / 90 + b.x) * 9;
    const cy = b.y + b.h / 2 - camera.y;

    ctx.save();
    ctx.shadowColor = 'rgba(160,190,230,0.9)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#6b7182';
    ctx.beginPath();
    ctx.moveTo(px + b.w / 2, cy);
    ctx.lineTo(px - 6, cy - flap);
    ctx.lineTo(px + b.w * 0.35, cy + 3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px + b.w / 2, cy);
    ctx.lineTo(px + b.w + 6, cy - flap);
    ctx.lineTo(px + b.w * 0.65, cy + 3);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(px + b.w / 2, cy, b.w * 0.28, b.h * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#ff5e5e';
    ctx.beginPath();
    ctx.arc(px + b.w * 0.62, cy - 2, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Level exit: a rooftop access door with a glowing bat-emblem sign — no
// more flagpoles. The trigger area is the same as before.
function drawExit(t) {
  if (level.indoor) return;
  const px = level.flag.x - camera.x;
  if (px < -60 || px > CANVAS_W + 60) return;
  const baseY = level.flag.y - camera.y;
  const doorW = 30, doorH = 42;

  // warm glow spilling out
  const glow = 0.7 + 0.3 * Math.sin(t / 400);
  const grad = ctx.createRadialGradient(px, baseY - doorH / 2, 6, px, baseY - doorH / 2, 55);
  grad.addColorStop(0, `rgba(255,209,102,${0.30 * glow})`);
  grad.addColorStop(1, 'rgba(255,209,102,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(px, baseY - doorH / 2, 55, 0, Math.PI * 2); ctx.fill();

  // doorway housing
  ctx.fillStyle = '#242c40';
  ctx.fillRect(px - doorW / 2 - 5, baseY - doorH - 8, doorW + 10, doorH + 8);
  ctx.fillStyle = '#12151f';
  ctx.fillRect(px - doorW / 2, baseY - doorH, doorW, doorH);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 2;
  ctx.strokeRect(px - doorW / 2, baseY - doorH, doorW, doorH);
  // door handle
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(px + doorW / 2 - 7, baseY - doorH / 2, 3, 6);

  // small glowing bat emblem above the door
  const ey = baseY - doorH - 18;
  ctx.fillStyle = `rgba(255,224,150,${0.85 * glow})`;
  ctx.beginPath(); ctx.arc(px, ey, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#12151f';
  ctx.beginPath();
  ctx.moveTo(px, ey - 2);
  ctx.lineTo(px - 3, ey - 5); ctx.lineTo(px - 2, ey - 2); ctx.lineTo(px - 8, ey - 4);
  ctx.lineTo(px - 4, ey + 1); ctx.lineTo(px - 3, ey + 4); ctx.lineTo(px, ey + 2);
  ctx.lineTo(px + 3, ey + 4); ctx.lineTo(px + 4, ey + 1); ctx.lineTo(px + 8, ey - 4);
  ctx.lineTo(px + 2, ey - 2); ctx.lineTo(px + 3, ey - 5);
  ctx.closePath();
  ctx.fill();
}

function drawPlayer() {
  if (Date.now() < invulnUntil && Math.floor(Date.now() / 100) % 2 === 0) return;
  const px = player.x - camera.x;
  const w = player.w, h = player.h;
  const cowlH = 10, faceH = 8, shoesH = 6;
  const bodyTop = cowlH + faceH - 1;
  const suitH = h - bodyTop;
  const accent = player.powerState === 'batarang' ? '#ffe066' : '#ffd166';

  // walk-cycle: driven by distance travelled (not time), so the legs and a
  // little body bob animate only while actually moving on the ground —
  // holding still or flying through the air doesn't "walk in place".
  const moving = player.onGround && Math.abs(player.vx) > 0.3;
  const walkPhase = moving ? (player.walkDist || 0) / 6 : 0;
  const bodyBob = moving ? Math.abs(Math.sin(walkPhase)) * 1.4 : 0;
  const strideA = moving ? Math.sin(walkPhase) * 4 : 0;
  const liftA = moving ? Math.max(0, Math.sin(walkPhase)) * 2 : 0;
  const strideB = moving ? Math.sin(walkPhase + Math.PI) * 4 : 0;
  const liftB = moving ? Math.max(0, Math.sin(walkPhase + Math.PI)) * 2 : 0;

  ctx.save();
  ctx.translate(px + w / 2, player.y - camera.y);
  ctx.scale(player.facing, 1);
  ctx.translate(-w / 2, -bodyBob);

  // soft rim-light halo so the dark suit reads clearly against the night sky
  ctx.shadowColor = 'rgba(150,185,230,0.85)';
  ctx.shadowBlur = 7;

  // cape trailing behind (opposite the facing direction; flares out while swinging)
  const flare = player.swinging ? 0.35 : 0;
  ctx.fillStyle = '#1c1f28';
  ctx.beginPath();
  ctx.moveTo(w * 0.3, cowlH - 2);
  ctx.lineTo(-w * (0.6 + flare), h * (0.55 - flare * 0.3));
  ctx.lineTo(-w * 0.2, h);
  ctx.lineTo(w * 0.55, bodyTop + 2);
  ctx.closePath();
  ctx.fill();

  // cowl with pointed ears
  ctx.fillStyle = '#2e3446';
  ctx.beginPath();
  ctx.moveTo(2, cowlH);
  ctx.lineTo(0, -6);
  ctx.lineTo(w * 0.3, cowlH * 0.4);
  ctx.lineTo(w * 0.7, cowlH * 0.4);
  ctx.lineTo(w, -6);
  ctx.lineTo(w - 2, cowlH);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(0, cowlH * 0.5, w, cowlH * 0.6);

  // jaw / face under the cowl
  ctx.fillStyle = '#e8b88a';
  ctx.fillRect(3, cowlH, w - 6, faceH);

  // white eye slits
  ctx.fillStyle = '#fff';
  ctx.fillRect(w * 0.55, cowlH + 2, 5, 2.5);
  ctx.fillRect(w * 0.2, cowlH + 2, 5, 2.5);

  // suit
  ctx.fillStyle = '#3a3f4d';
  ctx.fillRect(0, bodyTop, w, suitH);

  // utility belt
  ctx.fillStyle = '#171920';
  ctx.fillRect(0, bodyTop + suitH * 0.45, w, 4);

  // chest emblem
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(w / 2, bodyTop + 6, w * 0.28, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0c0d10';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 4, bodyTop + 6);
  ctx.lineTo(w / 2 - 1, bodyTop + 3.5);
  ctx.lineTo(w / 2, bodyTop + 6);
  ctx.lineTo(w / 2 + 1, bodyTop + 3.5);
  ctx.lineTo(w / 2 + 4, bodyTop + 6);
  ctx.lineTo(w / 2, bodyTop + 8.5);
  ctx.closePath();
  ctx.fill();

  // gloves
  ctx.fillStyle = '#171920';
  ctx.fillRect(-3, bodyTop + 1, 5, 8);
  ctx.fillRect(w - 2, bodyTop + 1, 5, 8);

  // boots (stride swing + lift while walking)
  ctx.fillStyle = '#0c0d10';
  ctx.fillRect(1 + strideA, h - shoesH - liftA, 8, shoesH);
  ctx.fillRect(w - 9 + strideB, h - shoesH - liftB, 8, shoesH);

  ctx.restore();
}

function drawVillain() {
  const v = level.villain;
  if (!v || !v.alive) return;
  const px = v.x - camera.x;
  if (px < -50 || px > CANVAS_W + 50) return;
  if (Date.now() < v.hitUntil && Math.floor(Date.now() / 80) % 2 === 0) return;
  const vy = v.y - camera.y;

  ctx.fillStyle = '#3ddc5c';
  ctx.beginPath();
  ctx.moveTo(px - 4, vy + 6); ctx.lineTo(px + 2, vy - 6); ctx.lineTo(px + 6, vy + 4);
  ctx.lineTo(px + v.w * 0.35, vy - 10); ctx.lineTo(px + v.w * 0.5, vy + 2);
  ctx.lineTo(px + v.w * 0.65, vy - 10); ctx.lineTo(px + v.w - 6, vy + 4);
  ctx.lineTo(px + v.w - 2, vy - 6); ctx.lineTo(px + v.w + 4, vy + 6);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f4f0ea';
  ctx.fillRect(px + 4, vy + 4, v.w - 8, 14);

  ctx.strokeStyle = '#c0244a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(px + 6, vy + 13);
  ctx.quadraticCurveTo(px + v.w / 2, vy + 20, px + v.w - 6, vy + 13);
  ctx.stroke();

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(px + v.w * 0.28, vy + 9, 3, 4);
  ctx.fillRect(px + v.w * 0.65, vy + 9, 3, 4);

  ctx.fillStyle = '#5a2d8c';
  ctx.fillRect(px, vy + 18, v.w, v.h - 24);

  ctx.fillStyle = '#f2a53d';
  ctx.beginPath();
  ctx.moveTo(px + v.w / 2, vy + 18);
  ctx.lineTo(px + v.w / 2 - 6, vy + 24);
  ctx.lineTo(px + v.w / 2 + 6, vy + 24);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(px + 1, vy + v.h - 6, 9, 6);
  ctx.fillRect(px + v.w - 10, vy + v.h - 6, 9, 6);

  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < v.hp ? '#ff5e5e' : 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(px + v.w / 2 - 12 + i * 12, vy - 16, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBats(t) {
  for (const bat of level.bats) {
    if (bat.taken) continue;
    const px = bat.x - camera.x;
    if (px < -40 || px > CANVAS_W + 40) continue;
    const bob = Math.sin(t / 300 + bat.x) * 2;
    const cx = px + bat.w / 2, cy = bat.y + bat.h / 2 + bob - camera.y;
    const glow = 0.6 + 0.3 * Math.sin(t / 260 + bat.x);

    // small spotlight glow behind it, echoing the bat-signal
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 26);
    grad.addColorStop(0, `rgba(255,224,150,${0.5 * glow})`);
    grad.addColorStop(1, 'rgba(255,224,150,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();

    // Batman emblem silhouette, not a literal flying bat
    ctx.fillStyle = '#0c0d10';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 3);
    ctx.lineTo(cx - 3, cy - 7);
    ctx.lineTo(cx - 2, cy - 3);
    ctx.lineTo(cx - 15, cy - 9);
    ctx.lineTo(cx - 9, cy - 1);
    ctx.lineTo(cx - 16, cy + 3);
    ctx.lineTo(cx - 6, cy + 3);
    ctx.lineTo(cx - 4, cy + 8);
    ctx.lineTo(cx, cy + 4);
    ctx.lineTo(cx + 4, cy + 8);
    ctx.lineTo(cx + 6, cy + 3);
    ctx.lineTo(cx + 16, cy + 3);
    ctx.lineTo(cx + 9, cy - 1);
    ctx.lineTo(cx + 15, cy - 9);
    ctx.lineTo(cx + 2, cy - 3);
    ctx.lineTo(cx + 3, cy - 7);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBatarangs() {
  for (const b of batarangs) {
    const px = b.x - camera.x;
    ctx.save();
    ctx.translate(px, b.y - camera.y);
    ctx.rotate(b.rot);
    ctx.fillStyle = '#c9cdd6';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(3, 0);
    ctx.lineTo(8, 3);
    ctx.lineTo(0, 1);
    ctx.lineTo(-8, 3);
    ctx.lineTo(-3, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------
// Bane rendering
// ---------------------------------------------------------------
function drawBane(t) {
  const bn = level.bane;
  if (!bn) return;
  const floorY = level.groundY * TILE - camera.y;

  if (!bn.alive) {
    // knocked out flat on the warehouse floor
    const px = bn.x - camera.x;
    ctx.fillStyle = '#4a525f';
    ctx.beginPath();
    ctx.ellipse(px + bn.w / 2, floorY - 16, bn.w * 0.55, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e4dc';
    ctx.beginPath();
    ctx.ellipse(px + bn.w * 0.15, floorY - 18, 14, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#15171c';
    ctx.fillRect(px + bn.w * 0.15 - 12, floorY - 21, 24, 6);
    return;
  }

  const flashing = performance.now() < bn.hitUntil && Math.floor(performance.now() / 90) % 2 === 0;
  if (flashing) return;

  const px = bn.x - camera.x;
  let py = bn.y - camera.y;
  let bw = bn.w, bh = bn.h;

  // telegraph: crouch + tremble before the shockwave jump
  let shakeX = 0;
  if (bn.state === 'telegraph') {
    shakeX = Math.sin(t / 30) * 2.5;
    py += bh * 0.12;
    bh *= 0.88;
    // danger glow on the floor under him
    ctx.fillStyle = `rgba(255,120,80,${0.18 + 0.12 * Math.sin(t / 90)})`;
    ctx.beginPath();
    ctx.ellipse(px + bw / 2, floorY, bw * 1.1, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(shakeX, 0);

  const cx = px + bw / 2;
  const scale = bh / BANE_BIG.h; // proportions shared by small & grown Bane

  // legs / pants
  ctx.fillStyle = '#20242c';
  ctx.fillRect(px + bw * 0.12, py + bh * 0.62, bw * 0.76, bh * 0.38);
  // torso
  ctx.fillStyle = '#5b6470';
  ctx.beginPath();
  ctx.moveTo(px + bw * 0.10, py + bh * 0.66);
  ctx.lineTo(px + bw * 0.02, py + bh * 0.26);
  ctx.quadraticCurveTo(px - bw * 0.08, py + bh * 0.12, px + bw * 0.2, py + bh * 0.10);
  ctx.lineTo(px + bw * 0.8, py + bh * 0.10);
  ctx.quadraticCurveTo(px + bw * 1.08, py + bh * 0.12, px + bw * 0.98, py + bh * 0.26);
  ctx.lineTo(px + bw * 0.90, py + bh * 0.66);
  ctx.closePath();
  ctx.fill();
  // arms
  ctx.fillStyle = '#6b7482';
  ctx.beginPath();
  ctx.ellipse(px - bw * 0.08, py + bh * 0.42, bw * 0.16, bh * 0.28, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(px + bw * 1.08, py + bh * 0.42, bw * 0.16, bh * 0.28, -0.25, 0, Math.PI * 2);
  ctx.fill();
  // fists
  ctx.fillStyle = '#20242c';
  ctx.beginPath(); ctx.arc(px - bw * 0.12, py + bh * 0.68, 11 * scale + 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(px + bw * 1.12, py + bh * 0.68, 11 * scale + 4, 0, Math.PI * 2); ctx.fill();
  // chest harness
  ctx.strokeStyle = '#171a20';
  ctx.lineWidth = Math.max(3, 6 * scale);
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.28, py + bh * 0.14); ctx.lineTo(cx + bw * 0.12, py + bh * 0.5);
  ctx.moveTo(cx + bw * 0.28, py + bh * 0.14); ctx.lineTo(cx - bw * 0.12, py + bh * 0.5);
  ctx.stroke();

  // head with the luchador mask
  const headW = bw * 0.46, headH = bh * 0.30;
  const hx = cx - headW / 2, hy = py - headH * 0.28;
  ctx.fillStyle = '#e8e4dc';
  ctx.beginPath();
  ctx.roundRect(hx, hy, headW, headH, 6);
  ctx.fill();
  // black stripes
  ctx.fillStyle = '#15171c';
  ctx.fillRect(hx, hy + headH * 0.34, headW, headH * 0.2);
  ctx.fillRect(cx - headW * 0.09, hy, headW * 0.18, headH);
  // red eyes
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(hx + headW * 0.16, hy + headH * 0.38, headW * 0.17, headH * 0.12);
  ctx.fillRect(hx + headW * 0.67, hy + headH * 0.38, headW * 0.17, headH * 0.12);
  // mouth grille
  ctx.fillStyle = '#454b57';
  ctx.fillRect(cx - headW * 0.26, hy + headH * 0.68, headW * 0.52, headH * 0.24);
  ctx.strokeStyle = '#15171c';
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    const gx = cx - headW * 0.26 + headW * 0.52 * (i / 4);
    ctx.beginPath(); ctx.moveTo(gx, hy + headH * 0.68); ctx.lineTo(gx, hy + headH * 0.92); ctx.stroke();
  }
  // venom tube + wrist button (green)
  ctx.strokeStyle = '#39c26a';
  ctx.lineWidth = Math.max(2.5, 4 * scale);
  ctx.beginPath();
  ctx.moveTo(cx + headW * 0.5, hy + headH * 0.55);
  ctx.quadraticCurveTo(cx + bw * 0.55, hy + headH * 0.6, px + bw * 0.95, py + bh * 0.35);
  ctx.stroke();
  ctx.fillStyle = '#2b3038';
  ctx.fillRect(px + bw * 1.02, py + bh * 0.56, 18 * scale + 6, 9 * scale + 4);
  ctx.fillStyle = '#39c26a';
  ctx.beginPath();
  ctx.arc(px + bw * 1.02 + (18 * scale + 6) / 2, py + bh * 0.56 + (9 * scale + 4) / 2, 3.5 * scale + 1.5, 0, Math.PI * 2);
  ctx.fill();

  // HP pips over his head (5 head hits to win)
  if (bn.state !== 'idle') {
    for (let i = 0; i < bn.maxHp; i++) {
      ctx.fillStyle = i < bn.hp ? '#ff5e5e' : 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(cx - (bn.maxHp - 1) * 6 + i * 12, hy - 14, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawShockwaves() {
  const floorY = level.groundY * TILE - camera.y;
  for (const wv of level.waves) {
    const px = wv.x - camera.x;
    const fade = Math.max(0, 1 - wv.r / 700);
    ctx.strokeStyle = `rgba(255,120,80,${0.65 * fade})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(px, floorY, wv.r, 9 + wv.r * 0.05, 0, Math.PI, 0);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,190,120,${0.4 * fade})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(px, floorY, Math.max(4, wv.r - 22), 7 + wv.r * 0.04, 0, Math.PI, 0);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------
// Intro cutscene: Dos Caras drags a tied-up Robin away into the night
// ---------------------------------------------------------------
function drawIntroScene(t) {
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, '#060812');
  g.addColorStop(0.7, '#10142c');
  g.addColorStop(1, '#1a2038');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // stars + moon
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(220,230,255,${0.2 + 0.5 * hash01(i * 1.7)})`;
    ctx.fillRect(hash01(i * 7.31) * CANVAS_W, hash01(i * 3.77) * 150, 2, 2);
  }
  ctx.fillStyle = '#eceadb';
  ctx.beginPath(); ctx.arc(640, 70, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#060812';
  ctx.beginPath(); ctx.arc(652, 63, 26, 0, Math.PI * 2); ctx.fill();

  const groundYpx = 330;

  // Batman watching from a rooftop, left
  ctx.fillStyle = '#0c0f1e';
  ctx.fillRect(0, 160, 190, CANVAS_H - 160);
  ctx.fillStyle = '#161b30';
  ctx.fillRect(0, 160, 190, 8);
  ctx.save();
  ctx.translate(120, 118);
  ctx.shadowColor = 'rgba(150,185,230,0.7)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#131722';
  ctx.beginPath(); // crouched silhouette with cape
  ctx.moveTo(0, 42);
  ctx.lineTo(4, 20); ctx.lineTo(0, 12); ctx.lineTo(6, 0); ctx.lineTo(10, 8);
  ctx.lineTo(18, 8); ctx.lineTo(22, 0); ctx.lineTo(28, 12);
  ctx.lineTo(26, 24); ctx.lineTo(40, 34); ctx.lineTo(34, 42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(9, 14, 5, 2.5);
  ctx.fillRect(17, 14, 5, 2.5);
  ctx.restore();

  // getaway van, right — rear doors open
  ctx.fillStyle = '#23283c';
  ctx.fillRect(600, groundYpx - 74, 160, 74);
  ctx.fillStyle = '#181c2c';
  ctx.fillRect(600, groundYpx - 74, 44, 74);
  ctx.fillStyle = '#0c0f1a';
  ctx.beginPath(); ctx.arc(640, groundYpx, 15, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(730, groundYpx, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#101423';
  ctx.fillRect(586, groundYpx - 70, 14, 70); // open rear door
  ctx.fillStyle = '#05070d';
  ctx.fillRect(600, groundYpx - 68, 26, 62); // dark cargo hold

  // street
  ctx.fillStyle = '#20232f';
  ctx.fillRect(190, groundYpx, CANVAS_W - 190, CANVAS_H - groundYpx);
  ctx.fillStyle = '#161923';
  ctx.fillRect(190, groundYpx, CANVAS_W - 190, 6);

  // streetlamp lighting the kidnapping
  ctx.strokeStyle = '#3a3f4b';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(390, groundYpx); ctx.lineTo(390, 150); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(390, 150); ctx.lineTo(420, 162); ctx.stroke();
  const lg = ctx.createRadialGradient(420, 165, 5, 420, 165, 130);
  lg.addColorStop(0, 'rgba(255,224,150,0.45)');
  lg.addColorStop(1, 'rgba(255,224,150,0)');
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.arc(420, 165, 130, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe096';
  ctx.beginPath(); ctx.arc(420, 164, 6, 0, Math.PI * 2); ctx.fill();

  // --- Dos Caras dragging Robin toward the van ---
  const dx = 470, dy = groundYpx - 78;
  // split suit: dark half / purple half
  ctx.fillStyle = '#2a2e38';
  ctx.fillRect(dx, dy + 26, 17, 52);
  ctx.fillStyle = '#5a2d8c';
  ctx.fillRect(dx + 17, dy + 26, 17, 52);
  // split face
  ctx.fillStyle = '#e8b88a';
  ctx.fillRect(dx + 3, dy, 14, 24);
  ctx.fillStyle = '#a2303c'; // burned half
  ctx.fillRect(dx + 17, dy, 14, 24);
  ctx.fillStyle = '#141824'; // hair
  ctx.fillRect(dx + 1, dy - 5, 32, 8);
  ctx.fillStyle = '#fff';
  ctx.fillRect(dx + 7, dy + 8, 4, 3);
  ctx.fillStyle = '#ffdd55'; // wild eye on the scarred side
  ctx.fillRect(dx + 22, dy + 8, 5, 4);
  ctx.fillStyle = '#701f28';
  ctx.fillRect(dx + 17, dy + 16, 14, 2.5); // scarred grin
  ctx.fillStyle = '#10131c';
  ctx.fillRect(dx + 2, dy + 78, 12, 8);
  ctx.fillRect(dx + 20, dy + 78, 12, 8);
  // his arm gripping Robin
  ctx.strokeStyle = '#5a2d8c';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(dx + 31, dy + 34); ctx.lineTo(dx + 62, dy + 46); ctx.stroke();

  // Robin: tied with rope, being dragged
  const rx = 530, ry = groundYpx - 60;
  ctx.save();
  ctx.translate(rx, ry);
  ctx.rotate(0.15);
  ctx.fillStyle = '#c0392b'; // tunic
  ctx.fillRect(0, 14, 24, 26);
  ctx.fillStyle = '#f1c40f'; // small cape
  ctx.beginPath();
  ctx.moveTo(22, 16); ctx.lineTo(36, 34); ctx.lineTo(24, 40); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8b88a'; // face
  ctx.fillRect(4, -6, 16, 20);
  ctx.fillStyle = '#141824'; // hair
  ctx.fillRect(2, -10, 20, 7);
  ctx.fillStyle = '#0c0d10'; // domino mask
  ctx.fillRect(4, 0, 16, 5);
  ctx.fillStyle = '#fff';
  ctx.fillRect(6, 1, 4, 3);
  ctx.fillRect(14, 1, 4, 3);
  ctx.fillStyle = '#1e8449'; // legs
  ctx.fillRect(2, 40, 9, 14);
  ctx.fillRect(13, 40, 9, 14);
  // ropes around the torso
  ctx.strokeStyle = '#cfd0c9';
  ctx.lineWidth = 3;
  for (const yy of [18, 25, 32]) {
    ctx.beginPath(); ctx.moveTo(-1, yy); ctx.lineTo(25, yy); ctx.stroke();
  }
  ctx.restore();
  // help cry
  ctx.fillStyle = '#dbe4ff';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('¡BATMAN!', rx + 14, ry - 26);

  // story panel
  ctx.fillStyle = 'rgba(6,8,16,0.92)';
  ctx.fillRect(40, 386, CANVAS_W - 80, 84);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 386, CANVAS_W - 80, 84);
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 15px monospace';
  ctx.fillText('ACTO 1 — LA PISTA', CANVAS_W / 2, 408);
  ctx.fillStyle = '#dbe4ff';
  ctx.font = '12px monospace';
  ctx.fillText('Dos Caras secuestró a Robin y desapareció en la noche.', CANVAS_W / 2, 428);
  ctx.fillText('Seguí su rastro por los techos hasta el galpón de Bane, su matón.', CANVAS_W / 2, 444);
  if (Math.floor(t / 500) % 2 === 0) {
    ctx.fillStyle = '#29d985';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('TOCÁ LA PANTALLA O SALTÁ PARA EMPEZAR', CANVAS_W / 2, 462);
  }
}

function drawHeroMessage() {
  if (Date.now() >= heroMessageUntil) return;
  const { total, defeated } = levelEnemyTotals();
  const pct = total === 0 ? 100 : Math.round((defeated / total) * 100);
  const need = Math.round(REQUIRED_DEFEAT_RATIO * 100);
  // Only fades on the way out: standing at the flag keeps re-arming
  // heroMessageUntil every frame, which would keep a fade-in stuck near 0
  // forever, so the banner must show at full opacity immediately instead.
  const remaining = heroMessageUntil - Date.now();
  const fadeOut = Math.min(1, remaining / 300);

  ctx.save();
  ctx.globalAlpha = fadeOut;
  ctx.fillStyle = 'rgba(8,10,20,0.88)';
  ctx.fillRect(50, 56, CANVAS_W - 100, 78);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 2;
  ctx.strokeRect(50, 56, CANVAS_W - 100, 78);

  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('UN HÉROE NO LE DA LA ESPALDA AL CRIMEN.', CANVAS_W / 2, 82);
  ctx.fillText('SI NO COMBATÍS EL MAL, NO PODÉS SEGUIR ADELANTE.', CANVAS_W / 2, 102);

  ctx.fillStyle = '#8fa3d9';
  ctx.font = '11px monospace';
  ctx.fillText(`Derrotaste ${defeated}/${total} enemigos (${pct}%) · necesitás ${need}%`, CANVAS_W / 2, 122);
  ctx.restore();
}

function render(t) {
  drawBackground(t);
  drawSwingPoints(t);
  drawTiles();
  drawHouses(t);
  drawRooftopProps();
  drawTrash(t);
  drawExit(t);
  drawCoins(t);
  drawBats(t);
  drawBatarangs();
  drawTrapezes(t);
  drawSwingRope();
  drawThugs();
  drawBirds(t);
  drawVillain();
  drawBane(t);
  drawShockwaves();
  drawPlayer();
  drawHeroMessage();

  if (state === 'levelcomplete') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`NIVEL ${level.name} COMPLETADO`, CANVAS_W / 2, CANVAS_H / 2);
  }
}

// ---------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------
let lastTime = performance.now();
function loop(now) {
  let dt = (now - lastTime) / (1000 / 60);
  dt = Math.max(0.001, Math.min(dt, 2));
  lastTime = now;
  frameTime = now;

  if (state === 'playing' || state === 'levelcomplete') {
    update(dt);
    render(now);
  } else if (state === 'cutscene') {
    drawIntroScene(now);
  }
  requestAnimationFrame(loop);
}

showOverlay('BIT BROS — ACTO 1', 'Dos Caras secuestró a Robin. La única pista lleva al galpón de Bane, al otro lado de los techos de Gotham. Saltá cerca de un poste de luz para engancharte con la cuerda, trepá casas y edificios, pisá ladrones y esquivá pájaros. El emblema de Batman te hace más fuerte. Al final del camino, Bane te espera en su galpón.', 'JUGAR');
requestAnimationFrame(loop);
