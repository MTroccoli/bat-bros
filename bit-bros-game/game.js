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
const LEVEL_TIME = 400;

const JUMP_BUFFER_MS = 140;   // a jump press is remembered briefly so a tap never gets lost to frame timing
const COYOTE_MS = 90;         // short grace window to jump after walking off a ledge
const SHOOT_COOLDOWN_MS = 500;
const BATARANG_SPEED = 7.5;
const BATARANG_RANGE = 130;
const BATARANG_LIFESPAN_MS = 3000;
const BAT_SCORE = 2000; // the bat now grows Batman AND grants the batarang in one pickup

const GRAPPLE_RANGE = 170;       // how close to a lamppost anchor before Batman auto-latches on
const SWING_RELEASE_ANGLE = 1.15; // ~66° from vertical: natural release point at the top of the arc
const GRAPPLE_COOLDOWN_MS = 500;  // prevents instantly re-grabbing the same anchor after letting go

const SIZES = {
  small: { w: 22, h: 30 },
  big: { w: 24, h: 40 },
  batarang: { w: 24, h: 40 },
};

// ---------------------------------------------------------------
// Level builder: programmatic spec -> tile grid + entity lists
// ---------------------------------------------------------------
function buildLevel(spec) {
  const { width, height, groundY, pits = [], platforms = [], coins = [],
          thugs = [], birds = [], bats = [], swingPoints = [],
          flag, spawn, name } = spec;

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

  return {
    name,
    width, height, groundY,
    solid,
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
    swingPoints: swingPoints.map(([x, row]) => ({ x: x * TILE + 16, y: row * TILE })),
    villain: spec.villain ? {
      x: spec.villain.x * TILE, y: spec.villain.y * TILE - 42,
      w: 30, h: 42,
      minX: spec.villain.range[0] * TILE, maxX: spec.villain.range[1] * TILE,
      vx: 1.4, alive: true, hp: spec.villain.hp ?? 3, hitUntil: 0,
    } : null,
    flag: { x: flag.x * TILE + TILE / 2, y: (groundY) * TILE, topY: flag.y * TILE },
    spawn: { x: spawn.x * TILE, y: spawn.y * TILE },
    pixelWidth: width * TILE,
    pixelHeight: height * TILE,
  };
}

const LEVEL_SPECS = [
  {
    name: '1-1',
    width: 70, height: 15, groundY: 13,
    // Pit 2 is widened well past jump range — swing across on the streetlamp.
    pits: [[18, 20], [40, 46]],
    // Platforms sit 3 tiles above the ground (clearing a running player's
    // head, safely within the jump's ~3.8-tile max height) and are spaced
    // with clear runway on both sides so a jump never clips a neighboring
    // pit or platform mid-arc.
    platforms: [
      { x: 8, y: 10, w: 3 },
      { x: 30, y: 10, w: 3 },
      { x: 55, y: 10, w: 3 },
    ],
    swingPoints: [[43, 5]],
    coins: [
      [9, 9], [10, 9],
      [56, 9], [57, 9],
      [14, 12], [24, 12], [36, 12], [48, 12], [62, 12],
    ],
    thugs: [
      { x: 12, y: 13, range: [10, 17] },
      { x: 25, y: 13, range: [23, 39] },
      { x: 49, y: 13, range: [47, 53] },
      { x: 58, y: 13, range: [55, 66] },
    ],
    birds: [
      { x: 20, y: 10, range: [17, 27] },
    ],
    bats: [[31, 10]],
    flag: { x: 66, y: 3 },
    spawn: { x: 2, y: 11 },
  },
  {
    name: '1-2',
    width: 100, height: 15, groundY: 13,
    pits: [[10, 11], [24, 26], [38, 39], [55, 58], [70, 71], [86, 93]],
    // Platforms sit 3 tiles above the ground (clearing a running player's
    // head, safely within the jump's ~3.8-tile max height) and are spaced
    // with clear runway on both sides so a jump never clips a neighboring
    // pit or platform mid-arc.
    platforms: [
      { x: 16, y: 10, w: 3 },
      { x: 46, y: 10, w: 3 },
      { x: 63, y: 10, w: 3 },
    ],
    // A gap too wide to jump (8 tiles) — the only way across is to leap up
    // toward the streetlamp and swing, Batman-style.
    swingPoints: [[89, 6]],
    coins: [
      [17, 9],
      [47, 9],
      [64, 9], [65, 9],
      [3, 12], [20, 12], [33, 12], [52, 12], [67, 12], [79, 12], [96, 12],
    ],
    thugs: [
      { x: 6, y: 13, range: [3, 9] },
      { x: 16, y: 13, range: [13, 22] },
      { x: 30, y: 13, range: [28, 36] },
      { x: 44, y: 13, range: [41, 53] },
      { x: 62, y: 13, range: [60, 68] },
      { x: 78, y: 13, range: [74, 83] },
      { x: 96, y: 13, range: [94, 99] },
    ],
    birds: [
      { x: 23, y: 10, range: [21, 29] },
      { x: 88, y: 10, range: [84, 96] },
    ],
    bats: [[47, 10]],
    flag: { x: 97, y: 3 },
    spawn: { x: 2, y: 11 },
  },
  {
    name: '1-3',
    width: 108, height: 15, groundY: 13,
    // The final stretch is widened into a long gap guarding the villain and
    // flag — a streetlamp swing carries Batman across it.
    pits: [[9, 10], [20, 22], [33, 34], [44, 47], [58, 60], [72, 74], [88, 95]],
    // Platforms sit 3 tiles above the ground (clearing a running player's
    // head, safely within the jump's ~3.8-tile max height) and are spaced
    // with clear runway on both sides so a jump never clips a neighboring
    // pit or platform mid-arc.
    platforms: [
      { x: 15, y: 10, w: 3 },
      { x: 27, y: 10, w: 3 },
      { x: 38, y: 10, w: 3 },
      { x: 52, y: 10, w: 3 },
      { x: 65, y: 10, w: 3 },
      { x: 80, y: 10, w: 4 },
    ],
    swingPoints: [[91, 6]],
    coins: [
      [16, 9],
      [28, 9],
      [39, 9],
      [53, 9], [54, 9],
      [66, 9],
      [81, 9], [82, 9],
      [5, 12], [24, 12], [42, 12], [56, 12], [70, 12], [85, 12],
    ],
    thugs: [
      { x: 6, y: 13, range: [3, 8] },
      { x: 16, y: 13, range: [13, 19] },
      { x: 27, y: 13, range: [24, 31] },
      { x: 39, y: 13, range: [36, 42] },
      { x: 53, y: 13, range: [49, 56] },
      { x: 65, y: 13, range: [62, 70] },
      { x: 80, y: 13, range: [76, 86] },
    ],
    birds: [
      { x: 19, y: 10, range: [17, 25] },
      { x: 57, y: 10, range: [55, 63] },
    ],
    bats: [[28, 10]],
    villain: { x: 98, y: 13, range: [97, 103], hp: 3 },
    flag: { x: 102, y: 3 },
    spawn: { x: 2, y: 11 },
  },
];

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

let state = 'start'; // start | playing | levelcomplete | win | gameover
let levelIndex = 0;
let level = null;
let player = null;
let camera = { x: 0 };
let score = 0;
let coinsCollected = 0;
let lives = 3;
let timeLeft = LEVEL_TIME;
let timeAccum = 0;
let invulnUntil = 0;
let stateTimer = 0;
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
    const dist = Math.hypot(sp.x - cx, sp.y - cy);
    if (dist < GRAPPLE_RANGE && sp.y < cy) {
      player.swinging = true;
      player.swingAnchor = sp;
      player.swingRadius = dist;
      player.swingAngle = Math.atan2(cx - sp.x, cy - sp.y);
      const tangential = player.vx * Math.cos(player.swingAngle) - player.vy * Math.sin(player.swingAngle);
      player.swingAngularVel = tangential / dist;
      return;
    }
  }
}

function updateSwing(dt, now) {
  const a = player.swingAnchor;
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
  }
}

function loadLevel(idx) {
  levelIndex = idx;
  level = buildLevel(LEVEL_SPECS[idx]);
  player = newPlayer(level.spawn, currentPowerState);
  camera.x = 0;
  timeLeft = LEVEL_TIME;
  timeAccum = 0;
  batarangs = [];
  grappleCooldownUntil = 0;
  hud.level.textContent = level.name;
}

function startGame() {
  score = 0; coinsCollected = 0; lives = 3;
  currentPowerState = 'small';
  loadLevel(0);
  state = 'playing';
  overlay.classList.add('hidden');
}

function restartGame() {
  if (state === 'start') return;
  startGame();
}

overlayBtn.addEventListener('click', () => {
  if (state === 'start' || state === 'gameover' || state === 'win') startGame();
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
    showOverlay('GAME OVER', `Puntaje final: ${score}. Presioná R o el botón para reintentar.`, 'REINTENTAR');
    return;
  }
  currentPowerState = 'small';
  player = newPlayer(level.spawn, 'small');
  timeLeft = LEVEL_TIME;
  invulnUntil = Date.now() + INVULN_TIME;
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

  // bats (grow + batarang power, all in one pickup)
  for (const bat of level.bats) {
    if (bat.taken) continue;
    if (aabbOverlap(player, bat)) {
      bat.taken = true;
      setPowerState('batarang');
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

  // flag
  const dxf = (player.x + player.w / 2) - level.flag.x;
  if (Math.abs(dxf) < 18 && player.y + player.h > level.flag.topY) {
    completeLevel();
    return;
  }

  // timer
  timeAccum += dt / 60;
  if (timeAccum >= 1) {
    timeAccum = 0;
    timeLeft--;
    hud.time.textContent = Math.max(timeLeft, 0);
    if (timeLeft <= 0) { killPlayer(); return; }
  }

  // camera
  const target = player.x + player.w / 2 - CANVAS_W / 2;
  camera.x = Math.max(0, Math.min(target, Math.max(0, level.pixelWidth - CANVAS_W)));
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
        showOverlay('¡GANASTE!', `Completaste todos los niveles. Puntaje final: ${score} con ${coinsCollected} monedas.`, 'JUGAR DE NUEVO');
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

function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, '#080b1c');
  g.addColorStop(0.55, '#121736');
  g.addColorStop(1, '#232a4d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // moon
  ctx.fillStyle = '#eceadb';
  ctx.beginPath();
  ctx.arc(660, 75, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#121736';
  ctx.beginPath();
  ctx.arc(674, 66, 32, 0, Math.PI * 2);
  ctx.fill();

  // thin drifting clouds in front of the moon
  ctx.fillStyle = 'rgba(200,210,235,0.12)';
  const cloudP = camera.x * 0.08;
  for (let i = -1; i < 4; i++) {
    const cx = i * 260 - (cloudP % 260);
    ctx.beginPath();
    ctx.ellipse(cx, 110, 90, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // far skyline (slow parallax, no windows, flat silhouette)
  drawSkylineRow(camera.x * 0.15, 300, 46, 140, 0.9, false, t, '#161a35');

  drawBatSignal(t);

  // near skyline (faster parallax, lit flickering windows)
  drawSkylineRow(camera.x * 0.35, 340, 34, 190, 1.7, true, t, '#0c0f22');
}

function drawBatSignal(t) {
  const sx = 240 - camera.x * 0.05; // barely moves — reads as a distant searchlight
  const beamTopY = 130, beamBottomY = 300;
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
    const py = level.groundY * TILE;
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

function drawTiles() {
  const tx0 = Math.floor(camera.x / TILE);
  const tx1 = Math.ceil((camera.x + CANVAS_W) / TILE);
  for (let ty = 0; ty < level.height; ty++) {
    for (let tx = Math.max(0, tx0); tx <= Math.min(level.width - 1, tx1); tx++) {
      if (!level.solid[ty][tx]) continue;
      const px = tx * TILE - camera.x, py = ty * TILE;
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

function drawSwingPoints(t) {
  for (const sp of level.swingPoints) {
    const px = sp.x - camera.x;
    if (px < -30 || px > CANVAS_W + 30) continue;
    const poleBottom = level.groundY * TILE;
    ctx.strokeStyle = '#3a3f4b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(px, sp.y);
    ctx.lineTo(px, poleBottom);
    ctx.stroke();
    // lamp arm
    ctx.beginPath();
    ctx.moveTo(px, sp.y);
    ctx.lineTo(px + 22, sp.y + 10);
    ctx.stroke();
    // glowing lamp head
    const glow = 0.6 + 0.4 * Math.abs(Math.sin(t / 500 + sp.x));
    const grad = ctx.createRadialGradient(px + 22, sp.y + 10, 2, px + 22, sp.y + 10, 22);
    grad.addColorStop(0, `rgba(255,224,150,${0.8 * glow})`);
    grad.addColorStop(1, 'rgba(255,224,150,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px + 22, sp.y + 10, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe096';
    ctx.beginPath();
    ctx.arc(px + 22, sp.y + 10, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSwingRope() {
  if (!player.swinging) return;
  const a = player.swingAnchor;
  const px = a.x - camera.x;
  ctx.strokeStyle = '#c9cdd6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, a.y);
  ctx.lineTo(player.x + player.w / 2 - camera.x, player.y + player.h * 0.2);
  ctx.stroke();
}

function drawCoins(t) {
  for (const c of level.coins) {
    if (c.taken) continue;
    const px = c.x - camera.x;
    if (px < -20 || px > CANVAS_W + 20) continue;
    const scale = 0.7 + 0.3 * Math.abs(Math.sin(t / 220 + c.x));
    ctx.save();
    ctx.translate(px, c.y);
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

    ctx.fillStyle = '#15171c';
    ctx.fillRect(px + 4, g.y + g.h - 7, 6, 7);
    ctx.fillRect(px + g.w - 10, g.y + g.h - 7, 6, 7);

    ctx.fillStyle = '#3d4250';
    ctx.fillRect(px + 2, g.y + 9, g.w - 4, g.h - 16);

    ctx.fillStyle = '#2a2e38';
    ctx.beginPath();
    ctx.arc(px + g.w / 2, g.y + 9, g.w / 2 - 1, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(px + 2, g.y + 7, g.w - 4, 5);

    ctx.fillStyle = '#0e0f13';
    ctx.beginPath();
    ctx.ellipse(px + g.w / 2, g.y + 10, g.w * 0.24, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffd166';
    ctx.fillRect(px + g.w * 0.32, g.y + 9, 2.5, 2.5);
    ctx.fillRect(px + g.w * 0.62, g.y + 9, 2.5, 2.5);
  }
}

function drawBirds(t) {
  for (const b of level.birds) {
    if (!b.alive) continue;
    const px = b.x - camera.x;
    if (px < -40 || px > CANVAS_W + 40) continue;
    const flap = Math.sin(t / 90 + b.x) * 9;
    const cy = b.y + b.h / 2;

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

function drawFlag() {
  const px = level.flag.x - camera.x;
  ctx.strokeStyle = '#c7c7c7';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(px, level.flag.topY);
  ctx.lineTo(px, level.flag.y + TILE);
  ctx.stroke();
  ctx.fillStyle = '#29d985';
  ctx.beginPath();
  ctx.moveTo(px, level.flag.topY + 6);
  ctx.lineTo(px + 26, level.flag.topY + 16);
  ctx.lineTo(px, level.flag.topY + 26);
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

  ctx.save();
  ctx.translate(px + w / 2, player.y);
  ctx.scale(player.facing, 1);
  ctx.translate(-w / 2, 0);

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

  // boots
  ctx.fillStyle = '#0c0d10';
  ctx.fillRect(1, h - shoesH, 8, shoesH);
  ctx.fillRect(w - 9, h - shoesH, 8, shoesH);

  ctx.restore();
}

function drawVillain() {
  const v = level.villain;
  if (!v || !v.alive) return;
  const px = v.x - camera.x;
  if (px < -50 || px > CANVAS_W + 50) return;
  if (Date.now() < v.hitUntil && Math.floor(Date.now() / 80) % 2 === 0) return;

  ctx.fillStyle = '#3ddc5c';
  ctx.beginPath();
  ctx.moveTo(px - 4, v.y + 6); ctx.lineTo(px + 2, v.y - 6); ctx.lineTo(px + 6, v.y + 4);
  ctx.lineTo(px + v.w * 0.35, v.y - 10); ctx.lineTo(px + v.w * 0.5, v.y + 2);
  ctx.lineTo(px + v.w * 0.65, v.y - 10); ctx.lineTo(px + v.w - 6, v.y + 4);
  ctx.lineTo(px + v.w - 2, v.y - 6); ctx.lineTo(px + v.w + 4, v.y + 6);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f4f0ea';
  ctx.fillRect(px + 4, v.y + 4, v.w - 8, 14);

  ctx.strokeStyle = '#c0244a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(px + 6, v.y + 13);
  ctx.quadraticCurveTo(px + v.w / 2, v.y + 20, px + v.w - 6, v.y + 13);
  ctx.stroke();

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(px + v.w * 0.28, v.y + 9, 3, 4);
  ctx.fillRect(px + v.w * 0.65, v.y + 9, 3, 4);

  ctx.fillStyle = '#5a2d8c';
  ctx.fillRect(px, v.y + 18, v.w, v.h - 24);

  ctx.fillStyle = '#f2a53d';
  ctx.beginPath();
  ctx.moveTo(px + v.w / 2, v.y + 18);
  ctx.lineTo(px + v.w / 2 - 6, v.y + 24);
  ctx.lineTo(px + v.w / 2 + 6, v.y + 24);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(px + 1, v.y + v.h - 6, 9, 6);
  ctx.fillRect(px + v.w - 10, v.y + v.h - 6, 9, 6);

  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < v.hp ? '#ff5e5e' : 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(px + v.w / 2 - 12 + i * 12, v.y - 16, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBats(t) {
  for (const bat of level.bats) {
    if (bat.taken) continue;
    const px = bat.x - camera.x;
    if (px < -40 || px > CANVAS_W + 40) continue;
    const bob = Math.sin(t / 300 + bat.x) * 2;
    const cx = px + bat.w / 2, cy = bat.y + bat.h / 2 + bob;
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
    ctx.translate(px, b.y);
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

function render(t) {
  drawBackground(t);
  drawSwingPoints(t);
  drawTiles();
  drawTrash(t);
  drawCoins(t);
  drawBats(t);
  drawBatarangs();
  drawSwingRope();
  drawThugs();
  drawBirds(t);
  drawVillain();
  drawFlag();
  drawPlayer();

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
  }
  requestAnimationFrame(loop);
}

showOverlay('BIT BROS', 'Gotham de noche: corré por los techos y callejones, pisá a los ladrones y esquivá a los pájaros. Agarrá el emblema de Batman para crecer y tirar batarangs. Saltá cerca de un poste de luz para engancharte y balancearte por los huecos más anchos. Al final del último nivel te espera un villano con sonrisa siniestra.', 'JUGAR');
requestAnimationFrame(loop);
