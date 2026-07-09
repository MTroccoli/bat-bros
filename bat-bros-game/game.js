/* ============================================================
   BAT BROS — Motor del juego: input, física, rendering, UI.
   Constantes y niveles están en catalog.js y levels.js.
   ============================================================ */
// ---------------------------------------------------------------
// Input
// ---------------------------------------------------------------
const keys = { left: false, right: false, jump: false, shoot: false, down: false, up: false };

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
  // Batcave UI screens are driven straight from keydown so a quick tap is
  // never lost to frame timing (touch buttons go through handleCaveUIInput).
  const confirmCode = ['ArrowUp', 'KeyW', 'Space', 'KeyX', 'Enter'].includes(e.code);
  if (state === 'computer') {
    if (confirmCode) { state = 'choice'; e.preventDefault(); }
    return;
  }
  if (state === 'choice') {
    if (['ArrowLeft', 'KeyA'].includes(e.code)) level.cave.choiceSel = 0;
    else if (['ArrowRight', 'KeyD'].includes(e.code)) level.cave.choiceSel = 1;
    else if (confirmCode) chooseCaveWeapon();
    e.preventDefault();
    return;
  }
  if (state === 'levelselect') {
    const cv = level.cave;
    if (['ArrowLeft', 'KeyA'].includes(e.code)) cv.selLevel = Math.max(0, cv.selLevel - 1);
    else if (['ArrowRight', 'KeyD'].includes(e.code)) cv.selLevel = Math.min(cv.replayOptions.length - 1, cv.selLevel + 1);
    else if (confirmCode) chooseReplayLevel();
    e.preventDefault();
    return;
  }
  if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = true;
  if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = true;
  if (['ArrowUp', 'KeyW', 'Space'].includes(e.code)) { keys.jump = true; requestJump(); }
  // ArrowUp/W double as "climb up" next to a ladder; harmless elsewhere since
  // a queued jump is cleared the instant a ladder grab consumes it (see
  // tryGrabLadder), so it never causes a stray hop.
  if (['ArrowUp', 'KeyW'].includes(e.code)) keys.up = true;
  if (['KeyX', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { keys.shoot = true; requestShoot(); }
  if (['ArrowDown', 'KeyS'].includes(e.code)) keys.down = true;
  if (e.code === 'KeyR') restartGame();
  if (['Space', 'ArrowUp'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => {
  if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = false;
  if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = false;
  if (['ArrowUp', 'KeyW', 'Space'].includes(e.code)) keys.jump = false;
  if (['ArrowUp', 'KeyW'].includes(e.code)) keys.up = false;
  if (['KeyX', 'ShiftLeft', 'ShiftRight'].includes(e.code)) keys.shoot = false;
  if (['ArrowDown', 'KeyS'].includes(e.code)) keys.down = false;
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
// rope reel (batigarra): up contracts, down extends
bindButton('btn-up', () => keys.up = true, () => keys.up = false);
bindButton('btn-down', () => keys.down = true, () => keys.down = false);

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
  ammo: document.getElementById('hud-ammo'),
  ammoWrap: document.getElementById('hud-ammo-wrap'),
};
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMsg = document.getElementById('overlay-msg');
const overlayBtn = document.getElementById('overlay-btn');
// start-menu elements (name entry + new game / continue)
const menuName = document.getElementById('menu-name');
const menuChoice = document.getElementById('menu-choice');
const menuMessage = document.getElementById('menu-message');
const nameInput = document.getElementById('player-name');
const nameError = document.getElementById('name-error');
const btnNameOk = document.getElementById('btn-name-ok');
const menuGreet = document.getElementById('menu-greet');
const btnNew = document.getElementById('btn-new');
const btnContinue = document.getElementById('btn-continue');
const btnChangeName = document.getElementById('btn-change-name');
const btnShoot = document.getElementById('btn-shoot');
const btnUp = document.getElementById('btn-up');
const btnDown = document.getElementById('btn-down');

// Show/hide the on-screen fire button and set its icon for the active gadget.
// The up/down buttons are always visible for ladder climbing. The gadget is
// independent of health (small/big), so it never vanishes on a hit.
function updateWeaponButton() {
  if (!btnShoot) return;
  const garra = currentGadget === 'batigarra';
  btnShoot.style.display = currentGadget ? 'flex' : '';
  btnShoot.textContent = garra ? '🪝' : '🪃';
  if (hud.ammoWrap) {
    const show = currentGadget === 'batarang';
    hud.ammoWrap.style.display = show ? '' : 'none';
    if (show) hud.ammo.textContent = batarangAmmo;
  }
}
function updateAmmoHud() {
  if (hud.ammo && currentGadget === 'batarang') hud.ammo.textContent = batarangAmmo;
}

let state = 'start'; // start | cutscene | playing | computer | choice | levelcomplete | win | gameover
let playerName = '';       // set from the start menu
let startLevelIndex = 0;   // where startGame() begins (0 = new game, >0 = continue)
let savedMaxLevel = 0;     // furthest level this player has reached (for Continue)
let gameOverCount = 0;     // how many game overs this player has (shown on the Batcave computer)
let savedGadget = null;    // gadget earned in a previous run (restored on Continue)
let continueOffer = false; // game over at Bane: offer to spend coins to retry
let cutsceneStart = 0;
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
let allCoinsBonus = false;
let frameTime = 0;
let currentPowerState = 'small'; // HEALTH only: small | big — carries over between levels, resets on death
let currentGadget = null;        // null | 'batarang' | 'batigarra' — a permanent tool, kept through hits/levels
let batarangAmmo = BATARANG_MAX_AMMO;
let batarangs = [];
let grappleCooldownUntil = 0;
let shakeStart = 0;
let shakeUntil = 0;
let shakeDuration = 0;
let shakeMag = 0;
let impactFlashes = []; // Bane's landing shockwave: quick bright rings + ground debris
let dustParticles = [];

function newPlayer(spawn, powerState = 'small', gadget = null) {
  const size = SIZES[powerState];
  return {
    x: spawn.x, y: spawn.y, w: size.w, h: size.h,
    vx: 0, vy: 0, onGround: false, facing: 1, dead: false,
    powerState,   // HEALTH: 'small' | 'big'
    gadget,       // null | 'batarang' | 'batigarra' (persistent tool)
    swinging: false, swingAnchor: null, swingRadius: 0, swingAngle: 0, swingAngularVel: 0,
    swingMinR: null,
    climbing: false, // on a dock ladder
    walkDist: 0,
  };
}

// Health only (small <-> big). Never touches the gadget.
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

// Equip a permanent gadget (from the Batcave choice). Kept through hits and
// through replaying earlier levels; shown by the on-screen controls.
function setGadget(g) {
  player.gadget = g;
  currentGadget = g;
  updateWeaponButton();
  if (playerName) saveGadgetChoice(playerName, g);
}

function spawnBatarang() {
  if (player.gadget === 'batarang' && batarangAmmo <= 0) return;
  batarangs.push({
    x: player.facing > 0 ? player.x + player.w : player.x - 10,
    y: player.y + player.h * 0.4,
    vx: BATARANG_SPEED * player.facing,
    traveled: 0,
    phase: 'out',
    rot: 0,
    bornAt: performance.now(),
    alive: true,
    type: player.gadget,
  });
  if (player.gadget === 'batarang') { batarangAmmo--; updateAmmoHud(); }
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

    if (b.phase !== 'out') continue;

    for (const g of level.thugs) {
      if (!g.alive) continue;
      if (b.x + 8 > g.x && b.x - 8 < g.x + g.w && b.y + 8 > g.y && b.y - 8 < g.y + g.h) {
        if (g.helmet) {
          g.helmet = false;
        } else if (b.type !== 'batigarra') {
          g.alive = false;
          score += 100;
          hud.score.textContent = score;
        }
        b.phase = 'back';
        break;
      }
    }
    if (b.phase !== 'out') continue;
    if (b.type !== 'batigarra') {
      for (const bd of level.birds) {
        if (!bd.alive) continue;
        if (b.x + 8 > bd.x && b.x - 8 < bd.x + bd.w && b.y + 8 > bd.y && b.y - 8 < bd.y + bd.h) {
          bd.alive = false;
          score += 100;
          hud.score.textContent = score;
          b.phase = 'back';
          break;
        }
      }
    }
    const v = level.villain;
    if (b.type !== 'batigarra' && v && v.alive && Date.now() >= v.hitUntil &&
        b.x + 8 > v.x && b.x - 8 < v.x + v.w && b.y + 8 > v.y && b.y - 8 < v.y + v.h) {
      damageVillain();
    }
  }
  batarangs = batarangs.filter(b => b.alive);
}

// Dock ladders (Act 2): a vertical strip Batman can climb, entered by
// pressing up/down while overlapping it. Never touches the solid grid —
// off the ladder, that column is just open air (or solid ground/roof at
// its two ends, from the level's normal platform/wall placement).
function tryGrabLadder(now) {
  if (!level.ladders.length || !(keys.up || keys.down)) return;
  const cx = player.x + player.w / 2;
  const top = player.y, bottom = player.y + player.h;
  for (const l of level.ladders) {
    if (cx < l.x + 6 || cx >= l.x + TILE - 6) continue;
    if (bottom > l.top + 4 && top < l.bottom - 4) {
      player.climbing = true;
      player.vx = 0; player.vy = 0;
      player.x = l.x + TILE / 2 - player.w / 2;
      jumpBufferUntil = 0;
      return;
    }
    if (keys.down && player.onGround && bottom >= l.top - 4 && bottom <= l.top + 8) {
      player.climbing = true;
      player.y = l.top - player.h + 10;
      player.vx = 0; player.vy = 0;
      player.x = l.x + TILE / 2 - player.w / 2;
      jumpBufferUntil = 0;
      return;
    }
  }
}

function mountLadderExit(row) {
  player.onGround = true;
}

function updateClimb(dt, now) {
  const cx = player.x + player.w / 2;
  const l = level.ladders.find(ll => cx >= ll.x && cx < ll.x + TILE);
  if (!l) { player.climbing = false; return; }

  const climbDir = (keys.up && !keys.down) ? -1 : (keys.down && !keys.up) ? 1 : 0;
  if (climbDir) player.y += LADDER_SPEED * climbDir * dt;
  player.vx = 0; player.vy = 0;
  player.onGround = false;
  if (climbDir) player.walkDist = (player.walkDist || 0) + LADDER_SPEED * dt;

  // jump off sideways, same buffered-press feel as a normal jump
  if (now < jumpBufferUntil) {
    jumpBufferUntil = 0;
    player.climbing = false;
    player.vy = JUMP_VELOCITY * 0.7;
    player.vx = player.facing * MAX_SPEED * 0.8;
    return;
  }

  const feet = player.y + player.h;
  if (feet <= l.top) {
    player.y = l.top - player.h;
    player.climbing = false;
    mountLadderExit(Math.floor(l.top / TILE));
  } else if (feet >= l.bottom) {
    player.y = l.bottom - player.h;
    player.climbing = false;
    mountLadderExit(Math.floor(l.bottom / TILE));
  }
}

function tryAttachGrapple(now) {
  if (now < grappleCooldownUntil || !level.swingPoints.length) return;
  if (player.onGround || player.climbing) return;
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
    if (sp.manual) {
      // Bane's central hook: no auto-latch. Batman must be airborne and press
      // JUMP again to grab it (rising or falling both count once pressed).
      if (player.onGround || now >= jumpBufferUntil) continue;
      const d = Math.hypot(sp.x - cx, sp.y - cy);
      if (d < GRAPPLE_RANGE && sp.y < cy) {
        jumpBufferUntil = 0; // consume the press so it doesn't do anything else
        player.swinging = true;
        player.swingAnchor = sp;
        player.swingRadius = d;
        player.swingMinR = null;
        player.swingAngle = Math.atan2(cx - sp.x, cy - sp.y);
        const tang = player.vx * Math.cos(player.swingAngle) - player.vy * Math.sin(player.swingAngle);
        player.swingAngularVel = tang / d;
        return;
      }
      continue;
    }
    // Climb anchors (a rooftop right under them) have two guards: never
    // re-grab a player already standing on that roof, and only latch while
    // RISING — dropping down off a roof must never snag the rope. Anchors
    // hanging over pits have no nearby floor and always latch.
    const hasCloseFloor = sp.floorY - sp.y <= TILE * 4;
    if (hasCloseFloor) {
      if (player.y + player.h < sp.floorY + 6) continue;
      if (player.vy >= 0) continue;
    }
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
  const isGarra = player.gadget === 'batigarra' && !player.swingMinR;
  if (isGarra) {
    // The batigarra gives Batman full rope control instead of the automatic
    // reel: UP (or the grapple trigger) contracts the rope, DOWN extends it.
    if (keys.up || keys.shoot) player.swingRadius = Math.max(GARRA_MIN_RADIUS, player.swingRadius - GARRA_REEL_SPEED * dt);
    if (keys.down) player.swingRadius = Math.min(GRAPPLE_RANGE, player.swingRadius + GARRA_REEL_SPEED * dt);
    // pump: press the side you're swinging toward to speed up, the opposite
    // side to brake. (vx keeps the sign of angularVel throughout the arc.)
    let pumpDir = 0;
    if (keys.right && !keys.left) pumpDir = 1;
    else if (keys.left && !keys.right) pumpDir = -1;
    if (pumpDir !== 0) {
      const vel = player.swingAngularVel;
      const sameWay = vel === 0 || Math.sign(vel) === pumpDir;
      const gain = sameWay ? GARRA_PUMP : GARRA_PUMP * 1.6; // braking bites a little harder
      player.swingAngularVel += pumpDir * gain * dt;
    }
    // cap pumped speed: enough momentum for a full loop around the anchor,
    // but pumping longer doesn't keep spinning it up into a blur
    player.swingAngularVel = Math.max(-GARRA_MAX_ANGULAR_VEL, Math.min(GARRA_MAX_ANGULAR_VEL, player.swingAngularVel));
  } else {
    const reelFloor = player.swingMinR ?? 44;
    player.swingRadius = Math.max(reelFloor, player.swingRadius - (player.swingMinR ? 0 : 0.85) * dt);
  }
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

  // the batigarra never auto-releases: total control means Batman lets go
  // only when the player asks for it
  const releasedByJump = now < jumpBufferUntil;
  if (releasedByJump || (!isGarra && Math.abs(player.swingAngle) > SWING_RELEASE_ANGLE)) {
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
  player = newPlayer(level.spawn, currentPowerState, currentGadget);
  updateWeaponButton(); // keep the gadget's controls visible across levels
  snapCameraToPlayer();
  timeLeft = LEVEL_TIME;
  timeAccum = 0;
  batarangs = [];
  batarangAmmo = BATARANG_MAX_AMMO;
  grappleCooldownUntil = 0;
  dustParticles = [];
  impactFlashes = [];
  shakeUntil = 0;
  hud.level.textContent = level.name;
  // remember the furthest level this player has reached, for "Continuar"
  if (playerName) saveProgress(playerName, idx);
}

function startGame() {
  score = 0; coinsCollected = 0; lives = 3;
  currentPowerState = 'small';
  currentGadget = startLevelIndex > 0 ? savedGadget : null;
  // If continuing past the Batcave without a weapon, send back to pick one
  const caveIdx = LEVEL_SPECS.findIndex(s => s.cave);
  if (startLevelIndex > caveIdx && caveIdx >= 0 && !currentGadget) {
    startLevelIndex = caveIdx;
  }
  updateWeaponButton();
  continueOffer = false;
  hud.score.textContent = 0;
  hud.coins.textContent = 0;
  hud.lives.textContent = 3;
  loadLevel(startLevelIndex || 0);
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

// ---------------------------------------------------------------
// Player progress: stored in the DC Supabase project (table
// bitbros_players), with a localStorage mirror so the PWA still knows the
// last level when offline or if Supabase can't be reached.
// ---------------------------------------------------------------
const SUPA_URL = 'https://bpkvotdzbbvkmqkvfxzz.supabase.co';
const SUPA_KEY = 'sb_publishable_5UUXQvoXrV0X-K8-jZmCUQ_ypRb0aA3';
const SUPA_PLAYERS = SUPA_URL + '/rest/v1/bitbros_players';

function localKey(name) { return 'bitbros:' + name.trim().toLowerCase(); }

function localGet(name) {
  const v = parseInt(localStorage.getItem(localKey(name)), 10);
  return Number.isFinite(v) ? v : 0;
}

// Returns the furthest level index reached for this name (0 if new).
// Times out fast so the menu never hangs if Supabase is slow/unreachable.
async function loadProgress(name) {
  const local = localGet(name);
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(
      `${SUPA_PLAYERS}?name=eq.${encodeURIComponent(name.trim())}&select=last_level`,
      { headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }, signal: ctl.signal });
    clearTimeout(timer);
    if (r && r.ok) {
      const rows = await r.json();
      const remote = rows.length ? (rows[0].last_level | 0) : 0;
      return Math.max(remote, local);
    }
  } catch (e) { /* offline / blocked / timeout: fall back to local */ }
  return local;
}

// Persist the high-water mark (never lowers it) to both stores.
function saveProgress(name, level) {
  const best = Math.max(savedMaxLevel, level | 0);
  savedMaxLevel = best;
  try { localStorage.setItem(localKey(name), String(best)); } catch (e) {}
  try {
    fetch(`${SUPA_PLAYERS}?on_conflict=name`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ name: name.trim(), last_level: best, updated_at: new Date().toISOString() }),
    }).catch(() => {});
  } catch (e) {}
}

// --- Earned gadget per player (so Continue restores it instead of sending
// the player back into Act 2 unarmed). Same merge-duplicates pattern as
// game_overs, via its own `gadget` column so a missing column degrades to
// localStorage-only without breaking the level save.
function localGadgetKey(name) { return 'bitbros:gadget:' + name.trim().toLowerCase(); }
function localGetGadget(name) {
  const v = localStorage.getItem(localGadgetKey(name));
  return v === 'batarang' || v === 'batigarra' ? v : null;
}

async function loadGadget(name) {
  const local = localGetGadget(name);
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(
      `${SUPA_PLAYERS}?name=eq.${encodeURIComponent(name.trim())}&select=gadget`,
      { headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }, signal: ctl.signal });
    clearTimeout(timer);
    if (r && r.ok) {
      const rows = await r.json();
      const remote = rows.length ? rows[0].gadget : null;
      return remote === 'batarang' || remote === 'batigarra' ? remote : local;
    }
  } catch (e) { /* column missing / offline: fall back to local */ }
  return local;
}

function saveGadgetChoice(name, gadget) {
  try { localStorage.setItem(localGadgetKey(name), gadget || ''); } catch (e) {}
  try {
    fetch(`${SUPA_PLAYERS}?on_conflict=name`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ name: name.trim(), gadget: gadget || null, updated_at: new Date().toISOString() }),
    }).catch(() => {});
  } catch (e) {}
}

// --- Game-over tally per player (shown only on the Batcave computer) ---
// Stored in the same bitbros_players row via a `game_overs` column. The
// column must exist in Supabase (see the SQL in ACT2_PLAN.md); if it isn't
// there yet this degrades to a localStorage-only count without breaking the
// level save, which is written in its own request.
function localGOKey(name) { return 'bitbros:go:' + name.trim().toLowerCase(); }
function localGetGO(name) {
  const v = parseInt(localStorage.getItem(localGOKey(name)), 10);
  return Number.isFinite(v) ? v : 0;
}

async function loadGameOvers(name) {
  const local = localGetGO(name);
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(
      `${SUPA_PLAYERS}?name=eq.${encodeURIComponent(name.trim())}&select=game_overs`,
      { headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }, signal: ctl.signal });
    clearTimeout(timer);
    if (r && r.ok) {
      const rows = await r.json();
      const remote = rows.length ? (rows[0].game_overs | 0) : 0;
      return Math.max(remote, local);
    }
  } catch (e) { /* column missing / offline: fall back to local */ }
  return local;
}

function saveGameOvers(name, count) {
  try { localStorage.setItem(localGOKey(name), String(count)); } catch (e) {}
  try {
    // separate upsert so a missing game_overs column never breaks last_level
    fetch(`${SUPA_PLAYERS}?on_conflict=name`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ name: name.trim(), game_overs: count | 0, updated_at: new Date().toISOString() }),
    }).catch(() => {});
  } catch (e) {}
}

// ---------------------------------------------------------------
// Start menu flow: name -> (new game | continue)
// ---------------------------------------------------------------
function showNameMenu() {
  showMenuSection('name');
  overlay.classList.remove('hidden');
  nameError.textContent = '';
  // prefill the last name used on this device for convenience
  const last = localStorage.getItem('bitbros:lastName');
  if (last && !nameInput.value) nameInput.value = last;
  setTimeout(() => nameInput.focus(), 50);
}

async function submitName() {
  const name = nameInput.value.trim();
  if (name.length < 2) { nameError.textContent = 'Ingresá un nombre (mínimo 2 letras).'; return; }
  playerName = name;
  localStorage.setItem('bitbros:lastName', name);
  btnNameOk.disabled = true;
  btnNameOk.textContent = 'CARGANDO…';
  [savedMaxLevel, gameOverCount, savedGadget] = await Promise.all([loadProgress(name), loadGameOvers(name), loadGadget(name)]);
  btnNameOk.disabled = false;
  btnNameOk.textContent = 'ACEPTAR';

  showChoiceMenu();
}

// Show the New game / Continue chooser, with the Continue button reflecting
// the furthest level reached. Reused by the name flow and by game over.
function showChoiceMenu(greet) {
  menuGreet.textContent = greet || (playerName ? `Hola, ${playerName}.` : '');
  const hasProgress = savedMaxLevel > 0;
  btnContinue.disabled = !hasProgress;
  if (hasProgress) {
    const lvl = Math.min(savedMaxLevel, LEVEL_SPECS.length - 1);
    btnContinue.textContent = `CONTINUAR — Nivel ${LEVEL_SPECS[lvl].name}`;
  } else {
    btnContinue.textContent = 'CONTINUAR (sin progreso)';
  }
  showMenuSection('choice');
  overlay.classList.remove('hidden');
  state = 'start';
}

btnNameOk.addEventListener('click', submitName);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitName(); } });
btnChangeName.addEventListener('click', () => showMenuSection('name'));

// New game: start from the top, showing the story intro first.
btnNew.addEventListener('click', () => {
  startLevelIndex = 0;
  showMenuSection('message'); // the intro instructions + JUGAR button
});

// Continue: jump straight into the furthest level reached.
btnContinue.addEventListener('click', () => {
  if (btnContinue.disabled) return;
  startLevelIndex = Math.min(savedMaxLevel, LEVEL_SPECS.length - 1);
  startGame();
});

overlayBtn.addEventListener('click', () => {
  if (continueOffer) { continueAtBoss(); return; }
  if (state === 'start') {
    // the story first: Dos Caras kidnapping Robin
    overlay.classList.add('hidden');
    state = 'cutscene';
    cutsceneStart = performance.now();
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

function rectHitsSolid(x, y, w, h) {
  const tx0 = Math.floor(x / TILE), tx1 = Math.floor((x + w - 1) / TILE);
  const ty0 = Math.floor(y / TILE), ty1 = Math.floor((y + h - 1) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isSolidTile(tx, ty)) return true;
    }
  }
  return false;
}

// Keep a patrolling enemy from phasing through a building: if its body has
// walked into a solid facade, push it back out to the tile edge and reverse.
// Correctly-placed patrols never touch a wall, so this only ever fires on a
// range that would otherwise clip a building.
function patrolWallBounce(e) {
  if (!rectHitsSolid(e.x, e.y, e.w, e.h)) return;
  if (e.vx > 0) {
    const tx = Math.floor((e.x + e.w - 1) / TILE);
    e.x = tx * TILE - e.w;
    e.vx = -Math.abs(e.vx);
  } else {
    const tx = Math.floor(e.x / TILE);
    e.x = (tx + 1) * TILE;
    e.vx = Math.abs(e.vx);
  }
}

// Moving rafts (docks): patrol back and forth like a bird, then let a
// falling player land on top same as solid ground. Walking (or swinging)
// off the raft's footprint just resumes the fall — there's no ledge grab.
function updateBoats(dt) {
  for (const boat of level.boats) {
    boat.x += boat.vx * dt;
    if (boat.x < boat.minX) { boat.x = boat.minX; boat.vx = Math.abs(boat.vx); }
    if (boat.x + boat.w > boat.maxX) { boat.x = boat.maxX - boat.w; boat.vx = -Math.abs(boat.vx); }
  }
  if (player.swinging || player.climbing) return;
  for (const boat of level.boats) {
    const overlapX = player.x + player.w > boat.x && player.x < boat.x + boat.w;
    const feet = player.y + player.h;
    if (overlapX && player.vy >= 0 && feet >= boat.y - 2 && feet <= boat.y + 16) {
      player.x += boat.vx * dt;
      player.y = boat.y - player.h;
      player.vy = 0;
      player.onGround = true;
    }
  }
}

function updateCranes(dt, now) {
  for (const crane of level.cranes) {
    crane.prevCargoX = crane.cargoX;
    crane.angle = Math.sin(now * crane.speed) * crane.amplitude;
    crane.cargoX = crane.anchorX + Math.sin(crane.angle) * crane.ropeLen - crane.cargoW / 2;
    crane.cargoY = crane.anchorY + Math.cos(crane.angle) * crane.ropeLen;
    for (const cc of crane.craneCoins) {
      cc.x = crane.cargoX + cc.craneLocalX;
      cc.y = crane.cargoY - 16;
    }
  }
  if (player.swinging || player.climbing) return;
  for (const crane of level.cranes) {
    const overlapX = player.x + player.w > crane.cargoX && player.x < crane.cargoX + crane.cargoW;
    const feet = player.y + player.h;
    if (overlapX && player.vy >= 0 && feet >= crane.cargoY - 2 && feet <= crane.cargoY + 16) {
      player.x += (crane.cargoX - crane.prevCargoX);
      player.y = crane.cargoY - player.h;
      player.vy = 0;
      player.onGround = true;
    }
  }
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
    // record the game over for this player (shown on the Batcave computer)
    gameOverCount++;
    if (playerName) saveGameOvers(playerName, gameOverCount);
    // Falling to Bane doesn't reset the whole game: spend coins to walk
    // straight back into the warehouse instead.
    if (levelIndex === BOSS_LEVEL_INDEX && coinsCollected >= CONTINUE_COST) {
      continueOffer = true;
      showOverlay('CAÍSTE EN EL GALPÓN',
        `Bane sigue ahí. Usá ${CONTINUE_COST} de tus ${coinsCollected} monedas para volver a enfrentarlo sin perder tu progreso (o presioná R para reiniciar desde cero).`,
        `USAR ${CONTINUE_COST} MONEDAS`);
      return;
    }
    // back to the menu: pick a new game or continue at the last level reached
    showChoiceMenu(`GAME OVER — Puntaje: ${score}. Elegí cómo seguir, ${playerName || 'héroe'}.`);
    return;
  }
  currentPowerState = 'small';
  player = newPlayer(level.spawn, 'small', currentGadget); // keep the gadget on respawn
  snapCameraToPlayer();
  timeLeft = LEVEL_TIME;
  invulnUntil = Date.now() + INVULN_TIME;
  // reset the boss fight positions (Bane keeps the damage already dealt)
  if (level.bane && level.bane.alive) {
    const bn = level.bane;
    bn.x = bn.homeX;
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
  // a hit only knocks down HEALTH (big -> small -> dead). The gadget is a
  // permanent tool, so it's never lost to a hit.
  if (player.powerState === 'big') {
    setPowerState('small');
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
  // collecting every coin in the level earns an extra life
  allCoinsBonus = level.coins.length > 0 && level.coins.every(c => c.taken);
  if (allCoinsBonus) {
    lives++;
    hud.lives.textContent = lives;
    stateTimer = 2200; // linger so the bonus line can be read
  }
}

// Toggle which of the three overlay screens is visible (name / choice /
// message). The message screen is what showOverlay drives for the intro,
// game-over and win states.
function showMenuSection(which) {
  menuName.classList.toggle('hidden', which !== 'name');
  menuChoice.classList.toggle('hidden', which !== 'choice');
  menuMessage.classList.toggle('hidden', which !== 'message');
}

function showOverlay(title, msg, btnLabel) {
  overlayTitle.textContent = title;
  overlayMsg.textContent = msg;
  overlayBtn.textContent = btnLabel;
  showMenuSection('message');
  overlay.classList.remove('hidden');
}

function triggerScreenShake(now, mag, durationMs) {
  shakeStart = now;
  shakeUntil = now + durationMs;
  shakeDuration = durationMs;
  shakeMag = mag;
}

function currentShakeOffset(now) {
  if (now >= shakeUntil) return { x: 0, y: 0 };
  const p = 1 - (now - shakeStart) / shakeDuration; // 1 -> 0 over the shake's life
  const m = shakeMag * p;
  return { x: (Math.random() * 2 - 1) * m, y: (Math.random() * 2 - 1) * m };
}

function spawnLandingImpact(now, x, y) {
  impactFlashes.push({ x, y, born: now });
  const n = 14;
  for (let i = 0; i < n; i++) {
    const ang = Math.PI + (i / (n - 1)) * Math.PI; // fan out along the ground, upward-ish
    const speed = 2.5 + Math.random() * 3.5;
    dustParticles.push({
      x, y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - 1.5,
      life: 400 + Math.random() * 300,
      born: now,
      size: 3 + Math.random() * 4,
    });
  }
}

function updateImpactEffects(dt, now) {
  for (const p of dustParticles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 0.25 * dt;
  }
  dustParticles = dustParticles.filter(p => now - p.born < p.life);
  impactFlashes = impactFlashes.filter(f => now - f.born < 350);
}

// ---------------------------------------------------------------
// Bane (Act 1 boss)
// ---------------------------------------------------------------
function baneHeadBox(bn) {
  return { x: bn.x + bn.w / 2 - 24, y: bn.y - 6, w: 48, h: 44 };
}

// True while Bane's body overlaps (or nearly overlaps) a gargoyle column —
// he must never launch his shockwave jump from directly under a perch.
function baneUnderGargoyle(bn) {
  const cx = bn.x + bn.w / 2;
  return level.perches.some(p => {
    const gcx = (p.x + p.w / 2) * TILE;
    return Math.abs(cx - gcx) < (p.w * TILE) / 2 + bn.w / 2 + 10;
  });
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
    // erratic stalking: random direction flips + occasional lunges toward
    // Batman, so he no longer just paces wall to wall
    if (now > bn.nextTurnAt) {
      const towardPlayer = (player.x + player.w / 2) < (bn.x + bn.w / 2) ? -1 : 1;
      bn.vx = (Math.random() < 0.55 ? towardPlayer : (Math.random() < 0.5 ? -1 : 1)) *
              (0.8 + Math.random() * 0.9);
      bn.nextTurnAt = now + 400 + Math.random() * 1100;
    }
    bn.x += bn.vx * speed * dt;
    bn.walkPhase += Math.abs(bn.vx * speed) * dt;
    if (bn.x < bn.minX) { bn.x = bn.minX; bn.vx = Math.abs(bn.vx); }
    if (bn.x + bn.w > bn.maxX) { bn.x = bn.maxX - bn.w; bn.vx = -Math.abs(bn.vx); }
    if (Math.abs(bn.vx) > 0.1) bn.facing = bn.vx > 0 ? 1 : -1;
    // only leap once he's clear of a gargoyle column — never jump under a perch
    if (now > bn.waveAt) {
      if (baneUnderGargoyle(bn)) {
        bn.waveAt = now + 250; // keep stalking, try again shortly
      } else {
        bn.state = 'telegraph';
        bn.teleStart = now;
      }
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
      triggerScreenShake(now, 7, 260);
      spawnLandingImpact(now, bn.x + bn.w / 2, floorY);
    }
  }

  updateImpactEffects(dt, now);

  // shockwaves race along the floor; only players standing at street level
  // get hit — a gargoyle perch or a jump clears them
  for (const wv of level.waves) {
    wv.r += BANE_WAVE_SPEED * dt;
    const atFloor = player.y + player.h > (level.groundY * TILE) - 4;
    if (player.onGround && atFloor && !player.swinging) {
      const d = Math.abs((player.x + player.w / 2) - wv.x);
      if (Math.abs(d - wv.r) < 26) hurtPlayer();
    }
  }
  level.waves = level.waves.filter(wv => wv.r < level.pixelWidth);
  if (state !== 'playing') return;

  // hits: dive from a gargoyle perch onto Bane's head — 5 and he's done
  if (bn.state !== 'idle' && bn.state !== 'growing') {
    const head = baneHeadBox(bn);
    const stompingHead = !player.swinging && player.vy > 1.5 &&
      aabbOverlap(player, head) && (player.y + player.h - head.y) < 22;
    if (stompingHead && now > bn.hitUntil) {
      bn.hp--;
      bn.hitUntil = now + BANE_HIT_FLASH_MS;
      player.vy = STOMP_BOUNCE; // bounce off the blow, back toward a perch
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
    // body contact hurts Batman, except while Bane reels from a head hit
    if (!player.swinging && now >= bn.hitUntil &&
        Date.now() >= invulnUntil && aabbOverlap(player, bn)) {
      hurtPlayer();
    }
  }
}

function updatePlaying(dt) {
  const now = performance.now();

  // Batcave: standing by the batcomputer and pressing JUMP opens it. The
  // first time shows Two-Face's file then the weapon choice; afterwards it
  // jumps straight to the choice so the weapon can be swapped after testing.
  // Handled before the jump/movement code so the press opens the PC instead
  // of making Batman hop.
  if (level.cave) {
    const cv = level.cave;
    // no onGround gate: the player rests exactly on a tile boundary here, so
    // onGround flickers frame to frame — proximity alone is the trigger, and
    // this runs before the jump code so the press opens the PC, not a hop
    cv.nearPC = !player.swinging &&
      Math.abs(player.x + player.w / 2 - cv.computerX) < CAVE_COMPUTER_TRIGGER;
    if (cv.nearPC && now < jumpBufferUntil) {
      jumpBufferUntil = 0;
      player.vx = 0;
      cv.openedAt = now;
      cv.computerDone = true;
      // always show the expediente first (it carries the player's game-over
      // record); pressing jump there moves on to the weapon choice
      cv.choiceSel = cv.weaponChosen === 'batigarra' ? 1 : 0;
      state = 'computer';
      return;
    }
    // returning to the entrance door opens a "replay an Act 1 level" menu.
    // Gated on leftStart so it doesn't fire on spawn (Batman starts right by it).
    if (!cv.leftStart && player.x > cv.entranceX + 4 * TILE) cv.leftStart = true;
    cv.nearEntrance = cv.leftStart && !player.swinging &&
      (player.x + player.w / 2) < cv.entranceX + 1.6 * TILE;
    if (cv.nearEntrance && now < jumpBufferUntil) {
      jumpBufferUntil = 0;
      player.vx = 0;
      cv.selLevel = 0;
      state = 'levelselect';
      return;
    }
  }

  if (player.swinging) {
    updateSwing(dt, now);
  } else if (player.climbing) {
    updateClimb(dt, now);
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
    tryGrabLadder(now);
  }

  updateBoats(dt);
  updateCranes(dt, now);

  // batarang / batigarra throw (the batigarra's trigger doubles as the rope
  // reel while swinging, so it never fires mid-swing)
  const canShoot = player.gadget === 'batarang' ||
    (player.gadget === 'batigarra' && !player.swinging);
  if (now < shootBufferUntil && canShoot && now - lastShotAt > SHOOT_COOLDOWN_MS) {
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

  for (const bat of level.bats) {
    if (bat.taken) continue;
    if (aabbOverlap(player, bat)) {
      bat.taken = true;
      setPowerState('big');
      if (player.gadget === 'batarang') { batarangAmmo = BATARANG_MAX_AMMO; updateAmmoHud(); }
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
    patrolWallBounce(g);

    if (aabbOverlap(player, g)) {
      // a spiked helmet blocks the stomp entirely — knock it off first
      // (batarang or batigarra) before diving on his head is safe
      const stomped = !g.helmet && player.vy > 0 && (player.y + player.h - g.y) < STOMP_TOLERANCE;
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
    patrolWallBounce(b);

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
    patrolWallBounce(v);

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

  // Batcave: ambient bats/drips, and the exit door only lets Batman through
  // once a weapon was chosen (the batcomputer itself is opened on jump, up top)
  if (level.cave) {
    const cv = level.cave;
    updateCaveAmbience(dt, now);
    if (cv.weaponChosen && player.x + player.w >= cv.doorX - 4) {
      completeLevel();
      return;
    }
  } else if (!level.indoor && player.x + player.w >= level.pixelWidth - 6) {
    // level exit: simply reach the right edge of the map (outdoor levels;
    // the warehouse ends when Bane falls)
    const { total, defeated } = levelEnemyTotals();
    const ratio = total === 0 ? 1 : defeated / total;
    if (ratio >= REQUIRED_DEFEAT_RATIO) {
      completeLevel();
      return;
    }
    heroMessageUntil = Date.now() + HERO_MESSAGE_MS;
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
        const arma = currentGadget === 'batigarra' ? 'batigarra' : 'batarang';
        showOverlay('MUELLES CONQUISTADOS',
          `Con la ${arma} en mano, Batman limpió los muelles de Gotham. Two-Face no puede esconderse para siempre... la historia continúa en el ACTO 3. Puntaje: ${score} con ${coinsCollected} monedas.`,
          'JUGAR DE NUEVO');
      }
    }
  }
}

// ---------------------------------------------------------------
// Render (hash01 is in catalog.js)
// ---------------------------------------------------------------
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

// ---------------------------------------------------------------
// Baticueva: ambience update + the whole cave scene (background,
// trophies, batcomputer, exit door) and the two UI screens.
// ---------------------------------------------------------------
function updateCaveAmbience(dt, now) {
  const cv = level.cave;
  const pcx = player.x + player.w / 2;

  for (const b of cv.ambientBats) {
    if (b.state === 'sleep') {
      if (Math.abs(pcx - b.x0) < CAVE_BAT_WAKE_RANGE) { b.state = 'wake'; b.wakeAt = now; }
    } else if (b.state === 'wake') {
      if (now - b.wakeAt > CAVE_BAT_WAKE_MS) b.state = 'fly';
    } else {
      b.x += b.vx * dt;
      // patrol a stretch of ceiling, turning at the caves edges
      if (b.x < b.x0 - 130) b.vx = Math.abs(b.vx);
      if (b.x > b.x0 + 130) b.vx = -Math.abs(b.vx);
      b.y = b.baseY + 22 + Math.sin(now / 260 + b.seed) * 16;
      if (b.x < 20) b.vx = Math.abs(b.vx);
      if (b.x > level.pixelWidth - 20) b.vx = -Math.abs(b.vx);
    }
  }

  for (const dc of cv.dropCols) {
    if (now - dc.lastAt > dc.interval) {
      dc.lastAt = now;
      dc.drops.push({ y: dc.tipY, vy: 0 });
    }
    for (const d of dc.drops) { d.vy += 0.5 * dt; d.y += d.vy * dt; }
    dc.drops = dc.drops.filter(d => {
      if (d.y >= dc.floorY) { dc.ripples.push({ born: now, r: 2 }); return false; }
      return true;
    });
    for (const rp of dc.ripples) rp.r += 0.5 * dt;
    dc.ripples = dc.ripples.filter(rp => now - rp.born < 700);
  }
}

function drawCaveBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, '#070b16');
  g.addColorStop(0.5, '#101830');
  g.addColorStop(1, '#0a0f1e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // parallax rock blobs
  const par = camera.x * 0.4;
  for (let i = 0; i < 26; i++) {
    const bx = (hash01(i * 3 + 1) * (level.pixelWidth) - par);
    const wrapped = ((bx % level.pixelWidth) + level.pixelWidth) % level.pixelWidth;
    const by = 70 + hash01(i * 7 + 2) * 320;
    const br = 45 + hash01(i * 5 + 3) * 95;
    ctx.fillStyle = 'rgba(28,36,62,0.5)';
    ctx.beginPath();
    ctx.ellipse(wrapped, by, br, br * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // light shaft over the batcomputer
  const cx = level.cave.computerX - camera.x;
  ctx.fillStyle = 'rgba(80,160,255,0.05)';
  ctx.beginPath();
  ctx.moveTo(cx - 70, 0); ctx.lineTo(cx + 70, 0);
  ctx.lineTo(cx + 120, CANVAS_H); ctx.lineTo(cx - 120, CANVAS_H);
  ctx.closePath(); ctx.fill();

  // ceiling band + stalactites
  ctx.fillStyle = '#1b2338';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 40);
  for (let x = 0; x <= CANVAS_W; x += 36) {
    ctx.lineTo(x + 18, 28 + hash01((x + camera.x) + 5) * 20);
  }
  ctx.lineTo(CANVAS_W, 40); ctx.lineTo(CANVAS_W, 0);
  ctx.closePath(); ctx.fill();

  for (const s of level.cave.stalactites) {
    const sx = s.x - camera.x;
    if (sx < -30 || sx > CANVAS_W + 30) continue;
    const grad = ctx.createLinearGradient(sx, 36, sx, 36 + s.len);
    grad.addColorStop(0, '#202840');
    grad.addColorStop(1, '#131a2e');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(sx - s.w / 2, 36);
    ctx.quadraticCurveTo(sx - s.w * 0.2, 36 + s.len * 0.55, sx, 36 + s.len);
    ctx.quadraticCurveTo(sx + s.w * 0.2, 36 + s.len * 0.55, sx + s.w / 2, 36);
    ctx.closePath(); ctx.fill();
  }
}

// props drawn after the terrain: entrance arch, dripping water, trophies,
// the batcomputer, the exit door and the ambient bats
function drawCaveProps(t) {
  const cv = level.cave;
  const cy = (wy) => wy - camera.y;

  // entrance arch at the far left, on the ground
  const ex = cv.entranceX - camera.x;
  if (ex > -60 && ex < CANVAS_W + 20) {
    const gy = level.groundY * TILE - camera.y;
    ctx.fillStyle = '#02040c';
    ctx.beginPath();
    ctx.moveTo(ex - 18, gy);
    ctx.lineTo(ex - 18, gy - 70);
    ctx.quadraticCurveTo(ex, gy - 100, ex + 18, gy - 70);
    ctx.lineTo(ex + 18, gy);
    ctx.closePath(); ctx.fill();
    // "press JUMP to replay a level" prompt when Batman returns to the mouth
    if (cv.nearEntrance && state === 'playing') {
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▲ SALTÁ: repetir nivel', ex, gy - 112 + Math.sin(t / 250) * 3);
    }
  }

  // dripping water columns + puddle ripples
  for (const dc of cv.dropCols) {
    const dx = dc.x - camera.x;
    if (dx < -20 || dx > CANVAS_W + 20) continue;
    ctx.fillStyle = '#9fe0ff';
    for (const d of dc.drops) ctx.fillRect(dx - 1.5, cy(d.y), 3, 8);
    ctx.strokeStyle = 'rgba(127,212,255,0.4)';
    ctx.lineWidth = 1;
    for (const rp of dc.ripples) {
      ctx.globalAlpha = Math.max(0, 1 - (t - rp.born) / 700);
      ctx.beginPath();
      ctx.ellipse(dx, cy(dc.floorY) - 2, rp.r, rp.r * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // giant penny + T-Rex, standing on the plateau
  drawCavePenny(cv.pennyX - camera.x, cy(cv.plateauY) - 58, 1);
  drawCaveTrex(cv.trexX - camera.x, cy(cv.plateauY) + 2, 0.72, true);

  // the batcomputer
  drawCaveComputer(cv.computerX - camera.x, cy(cv.plateauY));

  // "press JUMP" prompt while Batman stands by the computer
  if (cv.nearPC && (state === 'playing')) {
    const promptX = cv.computerX - camera.x;
    const promptY = cy(cv.plateauY) - 172 + Math.sin(t / 250) * 3;
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(cv.weaponChosen ? '▲ SALTÁ: cambiar arma' : '▲ SALTÁ: Batcomputadora', promptX, promptY);
  }

  // exit door, hard right on the plateau
  const dx = cv.doorX - camera.x;
  const gy2 = cv.plateauY - camera.y;
  ctx.fillStyle = '#02040c';
  ctx.beginPath();
  ctx.moveTo(dx - 22, gy2);
  ctx.lineTo(dx - 22, gy2 - 78);
  ctx.quadraticCurveTo(dx, gy2 - 110, dx + 22, gy2 - 78);
  ctx.lineTo(dx + 22, gy2);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = cv.weaponChosen ? 'rgba(255,209,102,0.85)' : 'rgba(127,150,200,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // a small bat glyph marks the way out once armed
  if (cv.weaponChosen) {
    ctx.fillStyle = 'rgba(255,209,102,0.9)';
    const bx = dx, by = gy2 - 92, s = 9;
    ctx.beginPath();
    ctx.moveTo(bx - s, by); ctx.lineTo(bx - s * 0.25, by - s * 0.6); ctx.lineTo(bx, by);
    ctx.lineTo(bx + s * 0.25, by - s * 0.6); ctx.lineTo(bx + s, by); ctx.lineTo(bx, by + s * 0.6);
    ctx.closePath(); ctx.fill();
  }

  // ambient bats near the ceiling
  for (const b of cv.ambientBats) {
    const bx = b.x - camera.x;
    if (bx < -20 || bx > CANVAS_W + 20) continue;
    const by = cy(b.y);
    if (b.state === 'fly') {
      // flying emblem silhouette
      ctx.fillStyle = '#0c0d10';
      const s = 9;
      ctx.beginPath();
      ctx.moveTo(bx - s, by); ctx.lineTo(bx - s * 0.25, by - s * 0.6); ctx.lineTo(bx, by);
      ctx.lineTo(bx + s * 0.25, by - s * 0.6); ctx.lineTo(bx + s, by); ctx.lineTo(bx, by + s * 0.6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(bx - 2.5, by - 1, 1.6, 1.6);
      ctx.fillRect(bx + 1, by - 1, 1.6, 1.6);
    } else {
      // hanging upside-down, folded wings; eyes open once awake
      ctx.fillStyle = '#0c0d10';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx - 7, by + 10, bx - 3, by + 20);
      ctx.lineTo(bx - 4, by + 25); ctx.lineTo(bx - 1, by + 22);
      ctx.lineTo(bx + 1, by + 22); ctx.lineTo(bx + 4, by + 25);
      ctx.lineTo(bx + 3, by + 20);
      ctx.quadraticCurveTo(bx + 7, by + 10, bx, by);
      ctx.closePath(); ctx.fill();
      if (b.state === 'wake') {
        ctx.fillStyle = '#ff3b30';
        ctx.fillRect(bx - 3, by + 18, 2, 2);
        ctx.fillRect(bx + 1, by + 18, 2, 2);
      }
    }
  }
}

function drawCavePenny(cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(2, 60, 60, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(-0.1);
  ctx.fillStyle = '#8f6a1e';
  ctx.beginPath(); ctx.ellipse(0, 0, 56, 60, 0, 0, Math.PI * 2); ctx.fill();
  const pg = ctx.createRadialGradient(-16, -20, 6, 0, 0, 62);
  pg.addColorStop(0, '#ffe096'); pg.addColorStop(0.55, '#ffd166'); pg.addColorStop(1, '#c9962e');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.ellipse(0, 0, 50, 54, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, 43, 47, 0, 0, Math.PI * 2); ctx.stroke();
  // embossed profile bust
  ctx.fillStyle = '#c9962e';
  ctx.beginPath();
  ctx.moveTo(-5, -30); ctx.quadraticCurveTo(13, -30, 14, -12);
  ctx.quadraticCurveTo(14, 6, 9, 11); ctx.lineTo(14, 27);
  ctx.quadraticCurveTo(-2, 32, -14, 27); ctx.lineTo(-11, 9);
  ctx.quadraticCurveTo(-20, 7, -16, 0); ctx.lineTo(-21, -4);
  ctx.lineTo(-16, -9); ctx.quadraticCurveTo(-21, -23, -5, -30);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8f6a1e';
  ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
  ctx.fillText('ONE CENT', 0, 42);
  ctx.restore();
}

function drawCaveTrex(gx, gy, s, flip) {
  ctx.save();
  ctx.translate(gx, gy);
  ctx.scale(s * (flip ? -1 : 1), s);
  const G1 = '#2c6e49', G2 = '#1f5136', G3 = '#173d29';
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(0, 0, 100, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = G2;
  ctx.beginPath();
  ctx.moveTo(8, -118); ctx.quadraticCurveTo(-75, -112, -122, -62);
  ctx.quadraticCurveTo(-70, -80, -2, -72); ctx.closePath(); ctx.fill();
  ctx.fillStyle = G3;
  ctx.beginPath(); ctx.ellipse(12, -66, 22, 30, 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(14, -46, 15, 42); ctx.fillRect(6, -8, 36, 8);
  ctx.fillStyle = G1;
  ctx.beginPath(); ctx.ellipse(30, -100, 54, 37, -0.22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(52, -128); ctx.quadraticCurveTo(72, -162, 82, -186);
  ctx.lineTo(112, -172); ctx.quadraticCurveTo(92, -140, 78, -112); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(76, -196); ctx.quadraticCurveTo(96, -210, 122, -204);
  ctx.lineTo(158, -190); ctx.lineTo(156, -176); ctx.lineTo(84, -170); ctx.closePath(); ctx.fill();
  ctx.fillStyle = G2;
  ctx.beginPath();
  ctx.moveTo(88, -166); ctx.lineTo(150, -142); ctx.lineTo(140, -132); ctx.lineTo(84, -156); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8e6df';
  for (let i = 0; i < 5; i++) {
    const tx = 106 + i * 11;
    ctx.beginPath(); ctx.moveTo(tx, -178); ctx.lineTo(tx + 4, -178); ctx.lineTo(tx + 2, -170); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#f1c40f'; ctx.fillRect(92, -194, 4, 4);
  ctx.strokeStyle = G2; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(64, -104); ctx.lineTo(78, -92); ctx.lineTo(74, -84); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = G1;
  ctx.beginPath(); ctx.ellipse(38, -62, 25, 33, 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(40, -42, 17, 40); ctx.fillRect(32, -8, 42, 9);
  ctx.beginPath(); ctx.moveTo(74, -8); ctx.lineTo(86, -4); ctx.lineTo(74, 1); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// split Two-Face portrait in a 150×170 box at the current origin
function drawTwoFacePortrait(ctx) {
  ctx.fillStyle = '#e8b88a'; ctx.fillRect(0, 20, 75, 95);
  ctx.fillStyle = '#5a2d8c'; ctx.fillRect(75, 20, 75, 95);
  ctx.fillStyle = '#241f1a'; ctx.fillRect(0, 6, 75, 18);
  ctx.fillStyle = '#1a1510';
  ctx.beginPath();
  ctx.moveTo(75, 24); ctx.lineTo(75, 2); ctx.lineTo(88, 14); ctx.lineTo(99, 0);
  ctx.lineTo(111, 13); ctx.lineTo(123, 2); ctx.lineTo(136, 12); ctx.lineTo(150, 3);
  ctx.lineTo(150, 24); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3d1c66'; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(86 + i * 18, 30); ctx.lineTo(96 + i * 18, 108); ctx.stroke(); }
  ctx.fillStyle = '#241f1a'; ctx.fillRect(26, 47, 20, 4);
  ctx.fillStyle = '#fff'; ctx.fillRect(29, 55, 15, 8);
  ctx.fillStyle = '#0c0d10'; ctx.fillRect(35, 57, 4, 4);
  ctx.fillStyle = '#f1c40f'; ctx.fillRect(100, 50, 21, 13);
  ctx.fillStyle = '#0c0d10'; ctx.fillRect(108, 54, 5, 5);
  ctx.fillStyle = '#c9995f'; ctx.fillRect(62, 80, 11, 5);
  ctx.fillStyle = '#a3703f'; ctx.fillRect(36, 98, 32, 3);
  ctx.fillStyle = '#e8e6df'; ctx.fillRect(80, 92, 46, 14);
  ctx.strokeStyle = '#191512'; ctx.lineWidth = 1.5; ctx.strokeRect(80, 92, 46, 14);
  for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(80 + i * 9.2, 92); ctx.lineTo(80 + i * 9.2, 106); ctx.stroke(); }
  ctx.fillStyle = '#e8b88a'; ctx.fillRect(55, 115, 20, 13);
  ctx.fillStyle = '#5a2d8c'; ctx.fillRect(75, 115, 20, 13);
  ctx.fillStyle = '#16181e'; ctx.fillRect(0, 128, 75, 42);
  ctx.fillStyle = '#e8e6df'; ctx.fillRect(75, 128, 75, 42);
  ctx.fillStyle = '#7a1f2b'; ctx.fillRect(69, 130, 6, 24);
  ctx.fillStyle = '#2E7FD9'; ctx.fillRect(75, 130, 6, 24);
  ctx.strokeStyle = 'rgba(127,212,255,0.9)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(75, 0); ctx.lineTo(75, 170); ctx.stroke();
}

function drawCaveComputer(cx, plateauScreenY) {
  const scrW = 230, scrH = 138;
  const x = cx - scrW / 2, y = plateauScreenY - scrH - 18;
  // stand + desk
  ctx.fillStyle = '#161b26';
  ctx.fillRect(cx - 11, y + scrH, 22, 18);
  ctx.fillStyle = '#14181f';
  ctx.fillRect(cx - 96, plateauScreenY - 10, 192, 10);
  const btnCols = ['#7fd4ff', '#29d985', '#ffd166', '#ff5e5e'];
  for (let i = 0; i < 12; i++) { ctx.fillStyle = btnCols[i % 4]; ctx.fillRect(cx - 84 + i * 14, plateauScreenY - 8, 5, 3); }
  // screen frame
  ctx.save();
  ctx.shadowColor = 'rgba(80,180,255,0.8)'; ctx.shadowBlur = 16;
  ctx.fillStyle = '#202737'; ctx.fillRect(x, y, scrW, scrH);
  ctx.restore();
  ctx.fillStyle = '#0b2438'; ctx.fillRect(x + 6, y + 6, scrW - 12, scrH - 12);
  // Two-Face + mini file
  ctx.save();
  ctx.translate(x + 16, y + 16); ctx.scale(0.6, 0.6);
  drawTwoFacePortrait(ctx);
  ctx.restore();
  const tx = x + 118;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7fd4ff'; ctx.font = 'bold 10px monospace'; ctx.fillText('HARVEY DENT', tx, y + 30);
  ctx.font = '9px monospace';
  ctx.fillStyle = '#ff5e5e'; ctx.fillText('ALIAS: TWO-FACE', tx, y + 46);
  ctx.fillStyle = '#ffd166'; ctx.fillText('REHÉN: ROBIN', tx, y + 62);
  ctx.fillStyle = '#29d985'; ctx.fillText('IR A: MUELLES', tx, y + 78);
  ctx.fillStyle = '#ff5e5e'; ctx.fillRect(tx, y + 92, 62, 16);
  ctx.fillStyle = '#0b2438'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
  ctx.fillText('SE BUSCA', tx + 31, y + 103);
  ctx.textAlign = 'left';
}

// full-screen expediente panel (state 'computer')
function drawExpedienteScreen(now) {
  ctx.fillStyle = 'rgba(2,4,10,0.72)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const x = 40, y = 40, w = CANVAS_W - 80, h = CANVAS_H - 80;
  ctx.save();
  ctx.shadowColor = 'rgba(80,180,255,0.5)'; ctx.shadowBlur = 20;
  ctx.fillStyle = '#232a3a'; ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.fillStyle = '#061826'; ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
  ctx.fillStyle = '#0a2438'; ctx.fillRect(x + 8, y + 8, w - 16, 24);
  ctx.fillStyle = '#7fd4ff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left';
  ctx.fillText('BATCOMPUTADORA — EXPEDIENTE: TWO-FACE', x + 18, y + 25);

  ctx.save();
  ctx.translate(x + 30, y + 54); ctx.scale(0.86, 0.86);
  drawTwoFacePortrait(ctx);
  ctx.restore();

  const lines = [
    ['> IDENTIDAD: HARVEY DENT, EX-FISCAL', '#bfe3ff'],
    ['> ALIAS: TWO-FACE — CICATRIZ DE ÁCIDO', '#bfe3ff'],
    ['> M.O.: DECIDE CADA CRIMEN CON UNA MONEDA', '#ff5e5e'],
    ['> EVIDENCIA: LA MONEDA QUEMADA ES SU FIRMA', '#bfe3ff'],
    ['> REHÉN: ROBIN — SECTOR PUERTO', '#ffd166'],
    ['► RUTA: BATICUEVA → MUELLES · ACTO 2', '#29d985'],
  ];
  ctx.font = '12px monospace'; ctx.textAlign = 'left';
  lines.forEach(([txt, col], i) => { ctx.fillStyle = col; ctx.fillText(txt, x + 190, y + 66 + i * 26); });

  // Batcomputer's private record on the vigilante using it — the game-over
  // tally is only ever shown here, on this screen.
  const boxX = x + 190, boxY = y + 232, boxW = w - 230, boxH = 44;
  ctx.strokeStyle = 'rgba(127,212,255,0.45)'; ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  ctx.fillStyle = '#7fd4ff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
  ctx.fillText('REGISTRO BATCOMPUTADORA', boxX + 10, boxY + 16);
  ctx.fillStyle = '#e8f0fb'; ctx.font = '12px monospace';
  ctx.fillText(`VIGILANTE: ${(playerName || '—').toUpperCase()}`, boxX + 10, boxY + 34);
  ctx.fillStyle = '#ff5e5e'; ctx.textAlign = 'right';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(`GAME OVERS: ${gameOverCount}`, boxX + boxW - 10, boxY + 30);
  ctx.textAlign = 'left';

  const blink = Math.floor(now / 400) % 2 === 0;
  ctx.fillStyle = '#ffd166'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
  if (blink) ctx.fillText('▶ SALTO / DISPARAR PARA CONTINUAR', CANVAS_W / 2, y + h - 18);
}

// full-screen weapon-choice panel (state 'choice')
function drawChoiceScreen(now) {
  const cv = level.cave;
  ctx.fillStyle = 'rgba(2,4,10,0.82)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#ffd166'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
  ctx.fillText('NUEVO EQUIPO DISPONIBLE', CANVAS_W / 2, 60);
  ctx.fillStyle = '#9fb4d8'; ctx.font = '12px monospace';
  ctx.fillText('La Batcomputadora fabricó dos herramientas — elegí', CANVAS_W / 2, 84);

  const cards = [
    { x: 96, title: '1. BATARANG', c: '#ffe066', lines: ['Arma arrojadiza', 'Derriba enemigos a distancia', 'NO controla el balanceo'] },
    { x: 424, title: '2. BATIGARRA', c: '#7fd4ff', lines: ['Herramienta de movilidad', 'Control total del balanceo', 'NO mata enemigos'] },
  ];
  cards.forEach((card, i) => {
    const sel = cv.choiceSel === i;
    ctx.save();
    if (sel) { ctx.shadowColor = 'rgba(255,209,102,0.55)'; ctx.shadowBlur = 16; }
    ctx.fillStyle = '#0e1420'; ctx.fillRect(card.x, 108, 280, 250);
    ctx.restore();
    ctx.strokeStyle = sel ? '#ffd166' : '#3a4664'; ctx.lineWidth = sel ? 3 : 2;
    ctx.strokeRect(card.x, 108, 280, 250);
    // icon
    ctx.save();
    ctx.translate(card.x + 140, 180);
    if (i === 0) {
      ctx.fillStyle = card.c;
      ctx.rotate(-0.3);
      ctx.beginPath();
      ctx.moveTo(-40, 0); ctx.quadraticCurveTo(-18, -17, -5, -12); ctx.lineTo(-4, -19);
      ctx.lineTo(-1, -12); ctx.lineTo(1, -12); ctx.lineTo(4, -19); ctx.lineTo(5, -12);
      ctx.quadraticCurveTo(18, -17, 40, 0); ctx.quadraticCurveTo(22, -1, 14, 7);
      ctx.quadraticCurveTo(6, 1, 0, 9); ctx.quadraticCurveTo(-6, 1, -14, 7);
      ctx.quadraticCurveTo(-22, -1, -40, 0); ctx.closePath(); ctx.fill();
    } else {
      // grapple gun + hook + rope
      ctx.fillStyle = '#6b7280'; ctx.fillRect(-30, -8, 40, 16);
      ctx.fillStyle = '#171920'; ctx.fillRect(-20, 8, 12, 22);
      ctx.strokeStyle = '#c9cdd6'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.quadraticCurveTo(40, -26, 60, -40); ctx.stroke();
      ctx.strokeStyle = card.c; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(60, -48); ctx.lineTo(60, -32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(60, -47); ctx.quadraticCurveTo(48, -45, 50, -34); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(60, -47); ctx.quadraticCurveTo(72, -45, 70, -34); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    ctx.restore();
    ctx.fillStyle = card.c; ctx.font = 'bold 17px monospace'; ctx.textAlign = 'center';
    ctx.fillText(card.title, card.x + 140, 268);
    ctx.fillStyle = '#bfd0ea'; ctx.font = '11px monospace';
    card.lines.forEach((l, j) => ctx.fillText(l, card.x + 140, 292 + j * 17));
  });

  ctx.fillStyle = '#9fb4d8'; ctx.font = '13px monospace'; ctx.textAlign = 'center';
  ctx.fillText('◄ ►  elegir      SALTO  confirmar', CANVAS_W / 2, 392);
}

function chooseCaveWeapon() {
  const cv = level.cave;
  cv.weaponChosen = cv.choiceSel === 1 ? 'batigarra' : 'batarang';
  setGadget(cv.weaponChosen);       // permanent tool, independent of health
  if (player.powerState === 'small') setPowerState('big'); // suit up
  state = 'playing';
}

// full-screen "replay an Act 1 level" menu (state 'levelselect')
function drawLevelSelectScreen(now) {
  const cv = level.cave;
  const opts = cv.replayOptions;
  ctx.fillStyle = 'rgba(2,4,10,0.85)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#ffd166'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
  ctx.fillText('REPETIR NIVEL — ACTO 1', CANVAS_W / 2, 78);
  ctx.fillStyle = '#9fb4d8'; ctx.font = '12px monospace';
  ctx.fillText('Elegí un nivel para volver a jugarlo (o SEGUIR para quedarte)', CANVAS_W / 2, 104);

  const n = opts.length;
  const cw = 120, gap = 18;
  const totalW = n * cw + (n - 1) * gap;
  const x0 = (CANVAS_W - totalW) / 2;
  const cy = 200, ch = 120;
  opts.forEach((o, i) => {
    const cx = x0 + i * (cw + gap);
    const sel = cv.selLevel === i;
    const resume = o.i < 0;
    ctx.save();
    if (sel) { ctx.shadowColor = 'rgba(255,209,102,0.55)'; ctx.shadowBlur = 16; }
    ctx.fillStyle = resume ? '#101b16' : '#0e1420';
    ctx.fillRect(cx, cy, cw, ch);
    ctx.restore();
    ctx.strokeStyle = sel ? '#ffd166' : '#3a4664'; ctx.lineWidth = sel ? 3 : 2;
    ctx.strokeRect(cx, cy, cw, ch);
    // little bat glyph / arrow marker
    ctx.fillStyle = resume ? '#29d985' : '#7fd4ff';
    ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
    ctx.fillText(resume ? '↩' : '▶', cx + cw / 2, cy + 52);
    ctx.fillStyle = resume ? '#29d985' : '#e8f0fb';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(o.name, cx + cw / 2, cy + 90);
  });

  ctx.fillStyle = '#9fb4d8'; ctx.font = '13px monospace'; ctx.textAlign = 'center';
  ctx.fillText('◄ ►  elegir      SALTO  confirmar', CANVAS_W / 2, cy + ch + 46);
}

function chooseReplayLevel() {
  const cv = level.cave;
  const opt = cv.replayOptions[cv.selLevel];
  if (opt && opt.i >= 0) loadLevel(opt.i); // jump into the chosen Act 1 level
  state = 'playing'; // SEGUIR (i < 0) just resumes the cave
}

// Touch path only: the jump/shoot buttons buffer a press; arrows are held.
function handleCaveUIInput(now) {
  const cv = level.cave;
  const confirm = now < jumpBufferUntil || now < shootBufferUntil;
  if (state === 'computer') {
    if (confirm) { jumpBufferUntil = 0; shootBufferUntil = 0; state = 'choice'; }
  } else if (state === 'choice') {
    if (keys.left && !keys.right) cv.choiceSel = 0;
    if (keys.right && !keys.left) cv.choiceSel = 1;
    if (confirm) { jumpBufferUntil = 0; shootBufferUntil = 0; chooseCaveWeapon(); }
  } else if (state === 'levelselect') {
    if (keys.left && !keys.right && !cv._navHeld) { cv.selLevel = Math.max(0, cv.selLevel - 1); cv._navHeld = true; }
    else if (keys.right && !keys.left && !cv._navHeld) { cv.selLevel = Math.min(cv.replayOptions.length - 1, cv.selLevel + 1); cv._navHeld = true; }
    else if (!keys.left && !keys.right) cv._navHeld = false;
    if (confirm) { jumpBufferUntil = 0; shootBufferUntil = 0; chooseReplayLevel(); }
  }
}

function drawBackground(t) {
  if (level.cave) { drawCaveBackground(t); return; }
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
  if (level.cave) return; // no street litter inside the Batcave
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
      // grapple towers paint their own brick facade + roof in drawWalls();
      // in the cave, "walls" are plain rock terraces drawn right here
      if (!level.cave && ty < level.groundY && wallAt(tx)) continue;

      // docks: a wooden pier walkway over the harbour instead of solid
      // street tiles — the top row is the plank walkway, everything below
      // is a thin support pylon with the harbour water visible through the
      // gaps (drawDockWater paints that band behind everything)
      if (level.dock && ty >= level.groundY) {
        const isTop = ty === level.groundY;
        if (isTop) {
          ctx.fillStyle = '#8a6a42';
          ctx.fillRect(px, py, TILE, 10);
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px, py + 10); ctx.lineTo(px + TILE, py + 10); ctx.stroke();
          if (hash01(tx * 3.3) > 0.5) {
            ctx.strokeStyle = 'rgba(0,0,0,0.22)';
            ctx.beginPath(); ctx.moveTo(px + TILE / 2, py + 1); ctx.lineTo(px + TILE / 2, py + 9); ctx.stroke();
          }
          ctx.fillStyle = '#5c4326';
          ctx.fillRect(px + 6, py + 10, TILE - 12, TILE - 10);
        } else {
          ctx.fillStyle = '#4a3620';
          ctx.fillRect(px + TILE * 0.35, py, TILE * 0.3, TILE);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        continue;
      }

      const topCol = level.cave ? '#4a5578' : '#565c6b';
      const bodyCol = level.cave ? '#1c2440' : '#282c36';
      const exposedTop = ty === 0 || !level.solid[ty - 1][tx];
      if (exposedTop) {
        ctx.fillStyle = topCol;
        ctx.fillRect(px, py, TILE, 7);
        ctx.fillStyle = bodyCol;
        ctx.fillRect(px, py + 7, TILE, TILE - 7);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.strokeRect(px + 4, py + 2, TILE - 8, 2);
      } else {
        ctx.fillStyle = bodyCol;
        ctx.fillRect(px, py, TILE, TILE);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    }
  }
}

// Grapple towers, drawn as full brick apartment buildings: warm brick
// facade, corner pilasters, a grid of lit/dark windows, and a flat gravel
// roof with a water tank + antenna. The collision shape is unchanged (a
// solid block topRow..ground); this is purely the look. Batman walks along
// the roof at topRow, in front of the rooftop props.
// Docks: the harbour water, drawn behind the terrain. A shallow band runs
// the FULL level width so the pier reads as standing over the sea from the
// very first step, not just at the pit gaps; the pits themselves get a
// full-depth fill (falling in still kills exactly like any other pit).
function drawWaterBand(x0, x1, waterTop, t, h) {
  if (x1 < -20 || x0 > CANVAS_W + 20 || waterTop > CANVAS_H) return;
  ctx.fillStyle = '#0a2740';
  ctx.fillRect(x0, waterTop, x1 - x0, h);
  ctx.strokeStyle = 'rgba(127,212,255,0.18)';
  ctx.lineWidth = 1;
  const rippleRows = Math.max(1, Math.floor(h / 12));
  for (let i = 0; i < rippleRows; i++) {
    const yy = waterTop + 8 + i * 12;
    if (yy > waterTop + h) break;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 16) {
      const wy = yy + Math.sin((x + t / 40 + i * 30) / 40) * 2;
      if (x === x0) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(180,220,255,0.22)';
  ctx.fillRect(x0, waterTop, x1 - x0, 3);
}

function drawDockWater(t) {
  if (!level.dock) return;
  const waterTop = level.groundY * TILE - camera.y;
  if (waterTop > CANVAS_H) return;
  drawWaterBand(-camera.x, level.pixelWidth - camera.x, waterTop, t, 40);
  for (const [a, b] of level.pits) {
    const x0 = a * TILE - camera.x, x1 = (b + 1) * TILE - camera.x;
    drawWaterBand(x0, x1, waterTop, t, CANVAS_H - waterTop);
  }
}

// Moving raft: a small wooden deck that drifts back and forth across the
// water gap. Batman must time a landing on it — walking off its edge (or
// missing) drops straight into the pit below, same as any other water fall.
function drawBoats(t) {
  for (const boat of level.boats) {
    const x0 = boat.x - camera.x, y0 = boat.y - camera.y;
    if (x0 + boat.w < -20 || x0 > CANVAS_W + 20) continue;
    const bob = Math.sin(t / 260 + boat.x * 0.01) * 1.5;
    const by = y0 + bob;
    const bowDir = boat.vx > 0 ? 1 : -1;
    const bowX = bowDir > 0 ? x0 + boat.w : x0;
    const sternX = bowDir > 0 ? x0 : x0 + boat.w;
    ctx.fillStyle = '#4a3518';
    ctx.beginPath();
    ctx.moveTo(sternX - bowDir * 4, by + boat.h);
    ctx.lineTo(sternX, by);
    ctx.lineTo(bowX, by);
    ctx.lineTo(bowX + bowDir * 18, by + boat.h * 0.35);
    ctx.lineTo(bowX + bowDir * 6, by + boat.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6b4f2e';
    ctx.fillRect(x0, by, boat.w, 3);
    ctx.strokeStyle = '#3a2a12'; ctx.lineWidth = 1;
    ctx.strokeRect(x0, by, boat.w, boat.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
    for (let px = 12; px < boat.w - 4; px += 16) {
      ctx.beginPath(); ctx.moveTo(x0 + px, by + 3); ctx.lineTo(x0 + px, by + boat.h - 1); ctx.stroke();
    }
    const cabinX = bowDir > 0 ? x0 + 4 : x0 + boat.w - 22;
    ctx.fillStyle = '#5a4020';
    ctx.fillRect(cabinX, by - 8, 18, 8);
    ctx.fillStyle = '#3a2a12';
    ctx.fillRect(cabinX, by - 9, 18, 2);
    ctx.fillStyle = 'rgba(180,220,255,0.4)';
    ctx.fillRect(cabinX + 4, by - 6, 4, 3);
    ctx.fillRect(cabinX + 10, by - 6, 4, 3);
    const railX1 = bowDir > 0 ? x0 + 24 : x0;
    const railX2 = bowDir > 0 ? x0 + boat.w - 2 : x0 + boat.w - 26;
    ctx.strokeStyle = '#6b5030'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(railX1, by - 4); ctx.lineTo(railX2, by - 4); ctx.stroke();
    for (let rx = railX1; rx <= railX2; rx += 10) {
      ctx.beginPath(); ctx.moveTo(rx, by); ctx.lineTo(rx, by - 4); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(180,220,255,0.3)'; ctx.lineWidth = 1;
    const wakeX = bowX + bowDir * 16;
    for (let i = 0; i < 3; i++) {
      const wy = by + boat.h * 0.35 + i * 4;
      ctx.beginPath(); ctx.moveTo(wakeX, wy); ctx.lineTo(wakeX + bowDir * (10 - i * 3), wy + 2); ctx.stroke();
    }
  }
}

function drawCranes() {
  const palette = ['#8b4a3a', '#4a6a8b', '#5a6a3a', '#7a5a3a'];
  for (const crane of level.cranes) {
    const tx = crane.towerX - camera.x;
    const ay = crane.armY - camera.y;
    const groundPx = level.groundY * TILE - camera.y;
    const tw = 20;

    ctx.fillStyle = '#555';
    ctx.fillRect(tx - tw / 2, ay, tw, groundPx - ay);
    ctx.strokeStyle = '#666'; ctx.lineWidth = 1;
    for (let y = ay + 15; y < groundPx; y += 30) {
      ctx.beginPath(); ctx.moveTo(tx - tw / 2, y); ctx.lineTo(tx + tw / 2, y + 25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx + tw / 2, y); ctx.lineTo(tx - tw / 2, y + 25); ctx.stroke();
    }

    const armEnd = crane.anchorX - camera.x;
    ctx.fillStyle = '#666';
    ctx.fillRect(Math.min(tx, armEnd) - 4, ay - 6, Math.abs(armEnd - tx) + 8, 12);
    const cwDir = armEnd > tx ? -1 : 1;
    ctx.fillStyle = '#444';
    ctx.fillRect(tx + cwDir * 20, ay - 4, 30, 18);
    ctx.strokeStyle = '#777'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tx, ay - 14); ctx.lineTo(armEnd, ay); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx, ay - 14); ctx.lineTo(tx + cwDir * 40, ay + 2); ctx.stroke();
    ctx.fillStyle = '#777';
    ctx.beginPath(); ctx.moveTo(tx - 4, ay - 6); ctx.lineTo(tx, ay - 20); ctx.lineTo(tx + 4, ay - 6); ctx.fill();

    const cx = crane.cargoX - camera.x, cy = crane.cargoY - camera.y;
    ctx.strokeStyle = '#888'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(armEnd, ay); ctx.lineTo(cx + crane.cargoW / 2, cy); ctx.stroke();

    const col = palette[Math.floor(hash01(crane.towerX * 3.1) * palette.length)];
    ctx.fillStyle = col;
    ctx.fillRect(cx, cy, crane.cargoW, crane.cargoH);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    ctx.strokeRect(cx + 0.5, cy + 0.5, crane.cargoW - 1, crane.cargoH - 1);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(cx + 2, cy + 2, crane.cargoW - 4, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(cx + 2, cy + crane.cargoH - 6, crane.cargoW - 4, 4);
    ctx.fillStyle = '#1a1c22';
    ctx.fillRect(cx, cy, 5, 5); ctx.fillRect(cx + crane.cargoW - 5, cy, 5, 5);
    ctx.fillRect(cx, cy + crane.cargoH - 5, 5, 5); ctx.fillRect(cx + crane.cargoW - 5, cy + crane.cargoH - 5, 5, 5);
  }
}

function drawLadders() {
  if (!level.ladders.length) return;
  for (const l of level.ladders) {
    const x0 = l.x - camera.x;
    if (x0 < -40 || x0 > CANVAS_W + 40) continue;
    const y0 = l.top - camera.y, y1 = l.bottom - camera.y;
    if (y1 < -20 || y0 > CANVAS_H + 20) continue;
    const railL = x0 + 5, railR = x0 + TILE - 5;
    ctx.strokeStyle = '#8a6a42'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(railL, y0); ctx.lineTo(railL, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(railR, y0); ctx.lineTo(railR, y1); ctx.stroke();
    ctx.strokeStyle = '#6b4f2e'; ctx.lineWidth = 3;
    for (let y = y0 + 6; y < y1; y += 10) {
      ctx.beginPath(); ctx.moveTo(railL, y); ctx.lineTo(railR, y); ctx.stroke();
    }
    ctx.fillStyle = '#6a6e78';
    ctx.fillRect(x0 - 4, y0 - 2, TILE + 8, 6);
    ctx.fillStyle = '#8a8e98';
    ctx.fillRect(x0 - 4, y0 - 2, TILE + 8, 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
    for (let gx = x0 - 2; gx < x0 + TILE + 4; gx += 5) {
      ctx.beginPath(); ctx.moveTo(gx, y0 - 1); ctx.lineTo(gx, y0 + 3); ctx.stroke();
    }
  }
}

// Docks: shipping-container towers instead of brick apartment buildings.
// Same solid collision as any other wall — this is purely the look.
function drawContainerTower(w, x0, wpx, roofY, groundPx) {
  const bandH = TILE * 2;
  const palette = ['#8b4a3a', '#4a6a8b', '#5a6a3a', '#7a5a3a', '#3a5a6a', '#6a4a5a'];
  let y = roofY, band = 0;
  while (y < groundPx - 1) {
    const h = Math.min(bandH, groundPx - y);
    const col = palette[Math.floor(hash01(w.x * 3.1 + band * 11) * palette.length)];
    ctx.fillStyle = col;
    ctx.fillRect(x0, y, wpx, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y + 0.5, wpx - 1, h - 1);
    // top highlight + bottom shadow
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x0 + 2, y + 2, wpx - 4, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x0 + 2, y + h - 6, wpx - 4, 4);
    // corrugation lines
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    for (let cx = x0 + 8; cx < x0 + wpx - 4; cx += 18) {
      ctx.beginPath(); ctx.moveTo(cx, y + 6); ctx.lineTo(cx, y + h - 6); ctx.stroke();
    }
    // shipping label
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x0 + wpx * 0.3, y + h * 0.3, wpx * 0.4, h * 0.15);
    // corner castings
    ctx.fillStyle = '#1a1c22';
    ctx.fillRect(x0, y, 5, 5); ctx.fillRect(x0 + wpx - 5, y, 5, 5);
    ctx.fillRect(x0, y + h - 5, 5, 5); ctx.fillRect(x0 + wpx - 5, y + h - 5, 5, 5);
    y += bandH; band++;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x0, roofY, wpx, 3);
}

function drawWalls(t) {
  if (level.cave) return; // cave terraces are plain rock, painted in drawTiles()
  const groundPx = level.groundY * TILE - camera.y;
  for (const w of level.walls) {
    const x0 = w.x * TILE - camera.x;
    const wpx = w.w * TILE;
    if (x0 + wpx < -40 || x0 > CANVAS_W + 40) continue;
    const roofY = w.topRow * TILE - camera.y;
    const H = groundPx - roofY;

    if (level.dock) { drawContainerTower(w, x0, wpx, roofY, groundPx); continue; }

    // brick facade
    ctx.fillStyle = '#5a4238';
    ctx.fillRect(x0, roofY, wpx, H);
    // mortar banding
    ctx.strokeStyle = 'rgba(0,0,0,0.20)';
    ctx.lineWidth = 1;
    for (let y = roofY + 8; y < groundPx; y += 8) {
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + wpx, y); ctx.stroke();
    }
    // corner pilasters give the silhouette defined edges
    ctx.fillStyle = '#4a352c';
    ctx.fillRect(x0, roofY, 5, H);
    ctx.fillRect(x0 + wpx - 5, roofY, 5, H);

    // window grid: one window per tile column, a couple of rows per storey.
    // Lit/dark chosen deterministically per building so it never flickers.
    const cols = w.w;
    for (let c = 0; c < cols; c++) {
      const wx = x0 + c * TILE + 8;
      for (let wy = roofY + TILE * 0.5; wy + 18 < groundPx; wy += TILE) {
        const row = Math.round((wy - roofY) / TILE);
        const lit = hash01(w.x * 3.1 + row * 7 + c * 13) > 0.42;
        if (lit) { ctx.fillStyle = 'rgba(255,207,107,0.14)'; ctx.fillRect(wx - 3, wy - 3, TILE - 10, 24); }
        ctx.fillStyle = lit ? '#ffcf6b' : '#1c2438';
        ctx.fillRect(wx, wy, TILE - 16, 18);
        ctx.strokeStyle = '#2a1f18'; ctx.lineWidth = 2;
        ctx.strokeRect(wx, wy, TILE - 16, 18);
        ctx.fillStyle = '#3a2b22'; ctx.fillRect(wx - 2, wy + 18, TILE - 12, 3);
      }
    }

    // flat gravel roof surface (what Batman actually stands on) + parapet lip
    ctx.fillStyle = '#6b7280'; ctx.fillRect(x0, roofY, wpx, 9);
    ctx.fillStyle = '#8b90a0'; ctx.fillRect(x0, roofY, wpx, 3);
    ctx.fillStyle = '#4b5160'; ctx.fillRect(x0, roofY + 9, wpx, 3);

    // rooftop props above the roofline: a water tank, plus a thin antenna
    const cx = x0 + wpx / 2;
    const tkx = cx - 12;
    ctx.fillStyle = '#4a4036'; ctx.fillRect(tkx, roofY - 22, 24, 20);
    ctx.fillStyle = '#2e281f'; ctx.fillRect(tkx, roofY - 22, 24, 4);
    ctx.strokeStyle = '#22262e'; ctx.lineWidth = 2;
    ctx.strokeRect(tkx + 4, roofY - 2, 4, 4); ctx.strokeRect(tkx + 16, roofY - 2, 4, 4);
    ctx.strokeStyle = '#5a606c'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0 + wpx - 12, roofY); ctx.lineTo(x0 + wpx - 12, roofY - 24); ctx.stroke();
    ctx.fillStyle = '#ff5e5e';
    ctx.beginPath(); ctx.arc(x0 + wpx - 12, roofY - 24, 2.5, 0, Math.PI * 2); ctx.fill();
  }
}

// Houses: flat, fully-reliable walkable roof (same collision as a wall) —
// the "house-ness" is purely decorative so it never fights the physics.
// Two alternating facades, picked per-house via hs.style:
//   'brownstone' — stone cornice ledge + a small triangular pediment prop
//   'terrace'    — tar-paper roof stripes + a roof-access shed
function drawHouseFacade(hs, x0, wpx, roofY, baseY) {
  ctx.fillStyle = '#4a3a30';
  ctx.fillRect(x0, roofY, wpx, baseY - roofY);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  for (let y = roofY + 11 + 8; y < baseY; y += 11) {
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + wpx, y); ctx.stroke();
  }
}

function drawBrownstoneRoof(hs, t, x0, wpx, roofY) {
  // arched lit windows on the facade
  for (let k = 0; k < 2; k++) {
    const wx = x0 + wpx * (0.22 + k * 0.45);
    const wy = roofY + 16;
    ctx.fillStyle = hash01(hs.x + k * 7) > 0.35 ? '#ffcf6b' : '#1c2438';
    ctx.beginPath();
    ctx.moveTo(wx, wy + 18); ctx.lineTo(wx, wy + 7);
    ctx.arc(wx + 6.5, wy + 7, 6.5, Math.PI, 0);
    ctx.lineTo(wx + 13, wy + 18);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#241f1a'; ctx.stroke();
  }

  // flat walkable gravel roof
  ctx.fillStyle = '#6b7280';
  ctx.fillRect(x0, roofY, wpx, 9);
  ctx.fillStyle = '#8b90a0';
  ctx.fillRect(x0, roofY, wpx, 3);

  // stone cornice ledge overhanging the facade, with dentil molding
  ctx.fillStyle = '#8a7a68';
  ctx.fillRect(x0 - 6, roofY + 6, wpx + 12, 6);
  ctx.fillStyle = '#5f5346';
  ctx.fillRect(x0 - 6, roofY + 12, wpx + 12, 3);
  ctx.fillStyle = '#463c34';
  for (let i = 0; i < wpx + 12; i += 10) ctx.fillRect(x0 - 6 + i, roofY + 15, 5, 4);

  // centered triangular pediment ornament — purely decorative, sits on
  // the flat roof, doesn't extend the walkable area. Warm stone tones
  // (matching the cornice) instead of blue-gray, which used to blend
  // straight into the night sky and become nearly invisible.
  const cxm = x0 + wpx / 2;
  ctx.fillStyle = '#8a7a68';
  ctx.beginPath();
  ctx.moveTo(cxm - 26, roofY);
  ctx.lineTo(cxm + 26, roofY);
  ctx.lineTo(cxm, roofY - 20);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#463c34'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#ffcf6b';
  ctx.beginPath(); ctx.arc(cxm, roofY - 8, 3.5, 0, Math.PI * 2); ctx.fill();

  // chimney beside the pediment with drifting smoke
  const chx = x0 + wpx * 0.75;
  drawChimney(chx, roofY, t, hs.x);
}

function drawTerraceRoof(hs, t, x0, wpx, roofY) {
  // rectangular lit windows on the facade
  for (let k = 0; k < 2; k++) {
    const wx = x0 + wpx * (0.22 + k * 0.45);
    ctx.fillStyle = hash01(hs.x + k * 7) > 0.35 ? '#ffcf6b' : '#1c2438';
    ctx.fillRect(wx, roofY + 9, 13, 16);
    ctx.strokeStyle = '#241f1a';
    ctx.strokeRect(wx, roofY + 9, 13, 16);
  }

  // flat tar-paper roof: alternating stripes read as a distinct rooftop
  // material from a tower's plain gravel cap
  const rh = 11;
  for (let i = 0; i < wpx; i += 16) {
    ctx.fillStyle = (i / 16) % 2 === 0 ? '#5a4a3c' : '#6b584a';
    ctx.fillRect(x0 + i, roofY, Math.min(16, wpx - i), rh);
  }
  ctx.fillStyle = '#8b7a68';
  ctx.fillRect(x0, roofY, wpx, 2.5);
  ctx.fillStyle = '#3a3128';
  ctx.fillRect(x0 - 4, roofY - 4, wpx + 8, 5);

  // roof-access shed: a small door-fronted box that reads as "you're on
  // top of a house", not just a generic platform
  const shedX = x0 + wpx * 0.15;
  ctx.fillStyle = '#463c34';
  ctx.fillRect(shedX, roofY - 22, 26, 22);
  ctx.fillStyle = '#241f1a';
  ctx.fillRect(shedX + 9, roofY - 14, 8, 14);
  ctx.fillStyle = '#6b7280';
  ctx.fillRect(shedX, roofY - 24, 26, 3);

  // chimney with drifting smoke
  const chx = x0 + wpx * 0.7;
  drawChimney(chx, roofY, t, hs.x);
}

function drawChimney(chx, roofY, t, seed) {
  ctx.fillStyle = '#3a3128';
  ctx.fillRect(chx, roofY - 20, 13, 20);
  ctx.fillStyle = '#241f1a';
  ctx.fillRect(chx - 2, roofY - 24, 17, 5);
  ctx.fillStyle = 'rgba(200,210,235,0.13)';
  const puff = (t / 900 + seed) % 1;
  ctx.beginPath(); ctx.ellipse(chx + 8 + puff * 8, roofY - 34 - puff * 14, 8 + puff * 5, 5 + puff * 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(chx + 14 + puff * 12, roofY - 48 - puff * 18, 10 + puff * 6, 6 + puff * 3, 0, 0, Math.PI * 2); ctx.fill();
}

function drawHouses(t) {
  for (const hs of level.houses) {
    const x0 = hs.x * TILE - camera.x;
    const wpx = hs.w * TILE;
    if (x0 + wpx < -40 || x0 > CANVAS_W + 40) continue;
    const roofY = hs.topRow * TILE - camera.y;
    const baseY = hs.baseRow * TILE - camera.y;

    drawHouseFacade(hs, x0, wpx, roofY, baseY);
    if (hs.style === 'terrace') drawTerraceRoof(hs, t, x0, wpx, roofY);
    else drawBrownstoneRoof(hs, t, x0, wpx, roofY);
  }
}

function drawSwingPoints(t) {
  for (const sp of level.swingPoints) {
    if (sp.minR) continue; // trapezes have their own rendering
    const px = sp.x - camera.x;
    if (px < -30 || px > CANVAS_W + 30) continue;
    const ay = sp.y - camera.y;
    if (level.indoor || level.cave) {
      // warehouse / cave: a glowing grapple hook chained to the roof.
      // A manual (press-to-latch) hook glows cyan and pulses harder to read
      // as "press JUMP here".
      const manual = sp.manual;
      const core = manual ? '150,230,255' : '255,224,150';
      const ring = manual ? '#8fe0ff' : '#ffe096';
      ctx.strokeStyle = level.cave ? '#2a3350' : '#4a4136';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, 40 - camera.y);
      ctx.lineTo(px, ay);
      ctx.stroke();
      ctx.fillStyle = level.cave ? '#1b2338' : '#2f2721';
      ctx.fillRect(px - 9, 36 - camera.y, 18, 6);
      const hookGlow = 0.6 + 0.4 * Math.abs(Math.sin(t / (manual ? 300 : 500) + sp.x));
      const rad = manual ? 26 : 22;
      const hg = ctx.createRadialGradient(px, ay, 2, px, ay, rad);
      hg.addColorStop(0, `rgba(${core},${(manual ? 0.85 : 0.7) * hookGlow})`);
      hg.addColorStop(1, `rgba(${core},0)`);
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(px, ay, rad, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = ring;
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(px, ay + 4, 6, -0.3, Math.PI + 0.5); ctx.stroke();
      // tiny "jump to grab" hint above the manual hook
      if (manual) {
        ctx.fillStyle = `rgba(143,224,255,${0.55 + 0.35 * hookGlow})`;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SALTÁ', px, ay - 16);
      }
      continue;
    }
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

    // Act 2: a spiked steel helmet over the hood — can't be stomped until a
    // weapon hit knocks it off
    if (g.helmet) {
      const hcx = px + g.w / 2, dome = gy + 2;
      ctx.fillStyle = '#8a929c';
      ctx.beginPath(); ctx.arc(hcx, dome, g.w / 2 - 1, Math.PI, 0); ctx.fill();
      ctx.fillRect(px + 2, dome - 1, g.w - 4, 4);
      ctx.fillStyle = '#6b737f';
      ctx.fillRect(px + 2, dome + 2, g.w - 4, 1.5);
      ctx.fillStyle = '#c9cdd6';
      const top = dome - (g.w / 2 - 1);
      for (const sx of [-6, 0, 6]) {
        ctx.beginPath();
        ctx.moveTo(hcx + sx - 2.5, top + 1);
        ctx.lineTo(hcx + sx, top - 9);
        ctx.lineTo(hcx + sx + 2.5, top + 1);
        ctx.closePath(); ctx.fill();
      }
    }
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

function drawPlayer() {
  if (Date.now() < invulnUntil && Math.floor(Date.now() / 100) % 2 === 0) return;
  const px = player.x - camera.x;
  const w = player.w, h = player.h;
  const cowlH = 10, faceH = 8, shoesH = 6;
  const bodyTop = cowlH + faceH - 1;
  const suitH = h - bodyTop;
  const accent = player.gadget ? '#ffe066' : '#ffd166';

  if (player.climbing) {
    drawPlayerClimbing(px, w, h, cowlH, faceH, bodyTop, suitH, shoesH);
    return;
  }

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

function drawPlayerClimbing(px, w, h, cowlH, faceH, bodyTop, suitH, shoesH) {
  const climbPhase = (player.walkDist || 0) / 8;
  const armA = Math.sin(climbPhase) * 6;
  const armB = Math.sin(climbPhase + Math.PI) * 6;
  const legA = Math.sin(climbPhase) * 3;
  const legB = Math.sin(climbPhase + Math.PI) * 3;

  ctx.save();
  ctx.translate(px + w / 2, player.y - camera.y);
  ctx.translate(-w / 2, 0);

  ctx.shadowColor = 'rgba(150,185,230,0.85)';
  ctx.shadowBlur = 7;

  // suit (seen from behind — cape covers it)
  ctx.fillStyle = '#3a3f4d';
  ctx.fillRect(0, bodyTop, w, suitH);

  // cape draped over the back, fully covering the torso
  ctx.fillStyle = '#1c1f28';
  ctx.beginPath();
  ctx.moveTo(1, cowlH - 1);
  ctx.lineTo(-2, h * 0.65);
  ctx.lineTo(w * 0.15, h - 2);
  ctx.lineTo(w * 0.85, h - 2);
  ctx.lineTo(w + 2, h * 0.65);
  ctx.lineTo(w - 1, cowlH - 1);
  ctx.closePath();
  ctx.fill();

  // cowl back (no face, just dark cowl shape with ears)
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
  ctx.fillRect(2, cowlH, w - 4, faceH);

  // utility belt
  ctx.fillStyle = '#171920';
  ctx.fillRect(2, bodyTop + suitH * 0.45, w - 4, 4);

  // arms reaching up alternately
  ctx.fillStyle = '#171920';
  ctx.fillRect(-4, bodyTop - 2 + armA, 5, 10);
  ctx.fillRect(w - 1, bodyTop - 2 + armB, 5, 10);

  // boots (slight vertical offset for climbing motion)
  ctx.fillStyle = '#0c0d10';
  ctx.fillRect(2, h - shoesH + legA, 7, shoesH);
  ctx.fillRect(w - 9, h - shoesH + legB, 7, shoesH);

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
    if (b.type === 'batigarra') {
      // grappling hook: a gold three-tine claw instead of a spinning blade
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(0, -7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(-8, -4, -7, 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(8, -4, 7, 4); ctx.stroke();
      ctx.lineCap = 'butt';
    } else {
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
    }
    ctx.restore();
  }
}

// Front-facing stone gargoyles: Batman's perches in the boss arena. The
// platform tile is the statue's flat head-top; below it glares a fanged
// demon face with horns and folded wings, on a brick pillar.
function drawGargoyles() {
  for (const p of level.perches) {
    const x0 = p.x * TILE - camera.x;
    const wpx = p.w * TILE;
    if (x0 + wpx < -60 || x0 > CANVAS_W + 60) continue;
    const topY = p.y * TILE - camera.y;
    const floorY = level.groundY * TILE - camera.y;
    const cx = x0 + wpx / 2;
    const stone = '#6e7889', dark = '#525b6b', hi = '#8f9ab2';

    // brick pillar
    ctx.fillStyle = '#463c34';
    ctx.fillRect(cx - 17, topY + 86, 34, floorY - topY - 86);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let y = topY + 96; y < floorY; y += 12) {
      ctx.beginPath(); ctx.moveTo(cx - 17, y); ctx.lineTo(cx + 17, y); ctx.stroke();
    }
    // pedestal cap
    ctx.fillStyle = '#39404e';
    ctx.beginPath();
    ctx.moveTo(x0 - 4, topY + 86);
    ctx.lineTo(x0 + wpx + 4, topY + 86);
    ctx.lineTo(x0 + wpx - 10, topY + 74);
    ctx.lineTo(x0 + 10, topY + 74);
    ctx.closePath(); ctx.fill();

    // folded wings flaring at the sides
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(x0 + 4, topY + 16);
    ctx.lineTo(x0 - 16, topY - 2);
    ctx.lineTo(x0 - 8, topY + 44);
    ctx.lineTo(x0 + 6, topY + 56);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x0 + wpx - 4, topY + 16);
    ctx.lineTo(x0 + wpx + 16, topY - 2);
    ctx.lineTo(x0 + wpx + 8, topY + 44);
    ctx.lineTo(x0 + wpx - 6, topY + 56);
    ctx.closePath(); ctx.fill();

    // head block (the face) under the standing ledge
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.roundRect(x0 + 2, topY + 8, wpx - 4, 68, 10);
    ctx.fill();
    // horns at the ledge corners
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(x0 + 4, topY + 12); ctx.lineTo(x0 - 2, topY - 12); ctx.lineTo(x0 + 16, topY + 6);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x0 + wpx - 4, topY + 12); ctx.lineTo(x0 + wpx + 2, topY - 12); ctx.lineTo(x0 + wpx - 16, topY + 6);
    ctx.closePath(); ctx.fill();
    // standing ledge (the platform surface)
    ctx.fillStyle = hi;
    ctx.fillRect(x0 - 2, topY, wpx + 4, 5);
    ctx.fillStyle = dark;
    ctx.fillRect(x0 - 2, topY + 5, wpx + 4, 3);

    // heavy brow + glowing amber eyes
    ctx.fillStyle = dark;
    ctx.fillRect(x0 + 8, topY + 18, wpx - 16, 7);
    ctx.save();
    ctx.fillStyle = '#ffb347';
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = 7;
    ctx.beginPath(); ctx.arc(cx - 14, topY + 30, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 14, topY + 30, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // snout
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(cx - 6, topY + 36); ctx.lineTo(cx + 6, topY + 36); ctx.lineTo(cx, topY + 46);
    ctx.closePath(); ctx.fill();

    // snarling mouth with fangs
    ctx.fillStyle = '#23262e';
    ctx.beginPath();
    ctx.roundRect(cx - 20, topY + 50, 40, 18, 5);
    ctx.fill();
    ctx.fillStyle = '#e8e4dc';
    // upper fangs
    ctx.beginPath();
    ctx.moveTo(cx - 15, topY + 50); ctx.lineTo(cx - 9, topY + 50); ctx.lineTo(cx - 12, topY + 61);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 9, topY + 50); ctx.lineTo(cx + 15, topY + 50); ctx.lineTo(cx + 12, topY + 61);
    ctx.closePath(); ctx.fill();
    // lower fangs
    ctx.beginPath();
    ctx.moveTo(cx - 5, topY + 68); ctx.lineTo(cx + 1, topY + 68); ctx.lineTo(cx - 2, topY + 58);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 4, topY + 68); ctx.lineTo(cx + 10, topY + 68); ctx.lineTo(cx + 7, topY + 58);
    ctx.closePath(); ctx.fill();
    // clawed feet gripping the pedestal
    ctx.fillStyle = dark;
    ctx.fillRect(x0 + 8, topY + 74, 10, 8);
    ctx.fillRect(x0 + wpx - 18, topY + 74, 10, 8);
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
    ctx.fillStyle = '#c9a17a';
    ctx.beginPath();
    ctx.ellipse(px + bn.w / 2, floorY - 16, bn.w * 0.55, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16181e';
    ctx.fillRect(px + bn.w * 0.22, floorY - 26, bn.w * 0.56, 14);
    ctx.fillStyle = '#ded9cf';
    ctx.beginPath();
    ctx.ellipse(px + bn.w * 0.12, floorY - 18, 14, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#101216';
    ctx.fillRect(px + bn.w * 0.12 - 12, floorY - 21, 24, 6);
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
    ctx.fillStyle = `rgba(255,120,80,${0.18 + 0.12 * Math.sin(t / 90)})`;
    ctx.beginPath();
    ctx.ellipse(px + bw / 2, floorY, bw * 1.1, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(shakeX, 0);

  const cx = px + bw / 2;
  const scale = bh / BANE_BIG.h;
  const skin = '#c9a17a', skinShade = '#a67f5c', skinHi = '#e0bd94';

  // legs: dark cargo pants + knee pads + boots. While he stalks (fight),
  // the two legs stride out of phase and the trailing boot lifts, so his
  // feet visibly move as he walks.
  const walking = bn.state === 'fight';
  const ph = bn.walkPhase * 0.05;
  const strideL = walking ? Math.sin(ph) * bw * 0.06 : 0;
  const strideR = walking ? Math.sin(ph + Math.PI) * bw * 0.06 : 0;
  const liftL = walking ? Math.max(0, Math.sin(ph)) * bh * 0.05 : 0;
  const liftR = walking ? Math.max(0, Math.sin(ph + Math.PI)) * bh * 0.05 : 0;
  ctx.fillStyle = '#23262e';
  ctx.fillRect(px + bw * 0.10 + strideL, py + bh * 0.60 - liftL, bw * 0.34, bh * 0.40);
  ctx.fillRect(px + bw * 0.56 + strideR, py + bh * 0.60 - liftR, bw * 0.34, bh * 0.40);
  ctx.fillStyle = '#33373f';
  ctx.fillRect(px + bw * 0.10 + strideL, py + bh * 0.74 - liftL, bw * 0.34, bh * 0.07);
  ctx.fillRect(px + bw * 0.56 + strideR, py + bh * 0.74 - liftR, bw * 0.34, bh * 0.07);
  ctx.fillStyle = '#101216';
  ctx.fillRect(px + bw * 0.06 + strideL, py + bh * 0.94 - liftL, bw * 0.40, bh * 0.06);
  ctx.fillRect(px + bw * 0.54 + strideR, py + bh * 0.94 - liftR, bw * 0.40, bh * 0.06);

  // torso: tan chest, shaded pecs, black tank top, belt
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(px + bw * 0.06, py + bh * 0.62);
  ctx.lineTo(px + bw * 0.02, py + bh * 0.24);
  ctx.quadraticCurveTo(px + bw * 0.04, py + bh * 0.12, px + bw * 0.22, py + bh * 0.10);
  ctx.lineTo(px + bw * 0.78, py + bh * 0.10);
  ctx.quadraticCurveTo(px + bw * 0.96, py + bh * 0.12, px + bw * 0.98, py + bh * 0.24);
  ctx.lineTo(px + bw * 0.94, py + bh * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = skinShade;
  ctx.fillRect(cx - bw * 0.03, py + bh * 0.14, bw * 0.06, bh * 0.20);
  ctx.beginPath();
  ctx.ellipse(px + bw * 0.30, py + bh * 0.28, bw * 0.14, bh * 0.03, 0, 0, Math.PI); ctx.fill();
  ctx.beginPath();
  ctx.ellipse(px + bw * 0.70, py + bh * 0.28, bw * 0.14, bh * 0.03, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#16181e';
  ctx.beginPath();
  ctx.moveTo(px + bw * 0.08, py + bh * 0.62);
  ctx.lineTo(px + bw * 0.12, py + bh * 0.36);
  ctx.lineTo(px + bw * 0.88, py + bh * 0.36);
  ctx.lineTo(px + bw * 0.92, py + bh * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#242832';
  ctx.fillRect(px + bw * 0.12, py + bh * 0.36, bw * 0.76, bh * 0.03);
  ctx.fillStyle = '#16181e';
  ctx.fillRect(px + bw * 0.19, py + bh * 0.10, bw * 0.09, bh * 0.28);
  ctx.fillRect(px + bw * 0.72, py + bh * 0.10, bw * 0.09, bh * 0.28);
  ctx.fillStyle = '#3a2d20';
  ctx.fillRect(px + bw * 0.08, py + bh * 0.58, bw * 0.84, bh * 0.05);
  ctx.fillStyle = '#c9a83c';
  ctx.fillRect(cx - bw * 0.06, py + bh * 0.572, bw * 0.12, bh * 0.062);

  // arms: deltoid + biceps shading + wrapped fists
  for (const side of [-1, 1]) {
    const ax = cx + side * bw * 0.56;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(ax, py + bh * 0.22, bw * 0.16, bh * 0.10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(ax + side * bw * 0.02, py + bh * 0.40, bw * 0.12, bh * 0.15, side * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skinHi;
    ctx.beginPath();
    ctx.ellipse(ax - side * bw * 0.04, py + bh * 0.19, bw * 0.06, bh * 0.03, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skinShade;
    ctx.beginPath();
    ctx.ellipse(ax + side * bw * 0.03, py + bh * 0.50, bw * 0.09, bh * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(ax + side * bw * 0.04, py + bh * 0.58, bw * 0.09, bh * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2e323c';
    ctx.beginPath();
    ctx.arc(ax + side * bw * 0.05, py + bh * 0.68, Math.max(6, bw * 0.10), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#454b58';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ax + side * bw * 0.05, py + bh * 0.68, Math.max(4, bw * 0.06), 0.4, 2.6); ctx.stroke();
  }

  // venom tank on the shoulder + double tube into the head
  ctx.fillStyle = '#1f4d33';
  ctx.fillRect(px + bw * 0.80, py + bh * 0.00, bw * 0.15, bh * 0.15);
  ctx.fillStyle = '#39c26a';
  ctx.fillRect(px + bw * 0.82, py + bh * 0.02, bw * 0.11, bh * 0.05);
  ctx.strokeStyle = '#39c26a';
  ctx.lineWidth = Math.max(3, bh * 0.03);
  ctx.beginPath();
  ctx.moveTo(px + bw * 0.87, py + bh * 0.04);
  ctx.quadraticCurveTo(cx + bw * 0.42, py - bh * 0.10, cx + bw * 0.13, py - bh * 0.05);
  ctx.stroke();
  ctx.strokeStyle = '#2b9150';
  ctx.lineWidth = Math.max(2, bh * 0.018);
  ctx.beginPath();
  ctx.moveTo(px + bw * 0.85, py + bh * 0.08);
  ctx.quadraticCurveTo(cx + bw * 0.40, py - bh * 0.03, cx + bw * 0.15, py - bh * 0.005);
  ctx.stroke();

  // head: luchador mask, black band + center ridge, stitches, grille
  const hw = bw * 0.46, hh = bh * 0.30;
  const hx = cx - hw / 2, hy = py - hh * 0.42;
  ctx.fillStyle = '#ded9cf';
  ctx.beginPath();
  ctx.roundRect(hx, hy, hw, hh, hw * 0.22);
  ctx.fill();
  ctx.fillStyle = '#c6c0b2';
  ctx.beginPath();
  ctx.roundRect(hx + hw * 0.72, hy, hw * 0.28, hh, hw * 0.2);
  ctx.fill();
  ctx.fillStyle = '#101216';
  ctx.fillRect(hx, hy + hh * 0.30, hw, hh * 0.25);
  ctx.fillRect(cx - hw * 0.07, hy, hw * 0.14, hh);
  ctx.strokeStyle = '#8d8778';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const sy = hy + hh * (0.10 + i * 0.07);
    ctx.beginPath(); ctx.moveTo(cx - hw * 0.07, sy); ctx.lineTo(cx - hw * 0.16, sy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + hw * 0.07, sy); ctx.lineTo(cx + hw * 0.16, sy); ctx.stroke();
  }
  ctx.save();
  ctx.fillStyle = '#ff3b30';
  ctx.shadowColor = '#ff3b30';
  ctx.shadowBlur = 7;
  ctx.fillRect(hx + hw * 0.16, hy + hh * 0.36, hw * 0.16, hh * 0.11);
  ctx.fillRect(hx + hw * 0.68, hy + hh * 0.36, hw * 0.16, hh * 0.11);
  ctx.restore();
  ctx.fillStyle = '#3c414d';
  ctx.beginPath();
  ctx.roundRect(cx - hw * 0.30, hy + hh * 0.62, hw * 0.60, hh * 0.32, 4);
  ctx.fill();
  ctx.strokeStyle = '#14161c';
  ctx.lineWidth = 2;
  for (let i = 1; i < 5; i++) {
    const gx = cx - hw * 0.30 + hw * 0.60 * (i / 5);
    ctx.beginPath(); ctx.moveTo(gx, hy + hh * 0.64); ctx.lineTo(gx, hy + hh * 0.92); ctx.stroke();
  }
  ctx.fillStyle = '#6a7280';
  ctx.beginPath(); ctx.arc(cx - hw * 0.26, hy + hh * 0.66, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + hw * 0.26, hy + hh * 0.66, 2, 0, Math.PI * 2); ctx.fill();

  // HP pips over his head (5 head dives to win)
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

// Bane's landing: a quick bright burst at the impact point plus flying
// debris, layered on top of the slower-moving shockwave rings.
function drawImpactEffects(now) {
  for (const f of impactFlashes) {
    const age = (now - f.born) / 350;
    if (age >= 1) continue;
    const px = f.x - camera.x, py = f.y - camera.y;
    const r = 10 + age * 60;
    ctx.strokeStyle = `rgba(255,230,180,${0.8 * (1 - age)})`;
    ctx.lineWidth = 5 * (1 - age) + 1;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - age)})`;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(0, 14 * (1 - age)), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const p of dustParticles) {
    const age = (now - p.born) / p.life;
    if (age >= 1) continue;
    const px = p.x - camera.x, py = p.y - camera.y;
    ctx.fillStyle = `rgba(120,110,100,${0.6 * (1 - age)})`;
    ctx.beginPath();
    ctx.arc(px, py, p.size * (1 - age * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------
// Intro cutscene (animated): Dos Caras throws a tied-up Robin into his
// van and speeds off into the night while Batman gives chase.
// ---------------------------------------------------------------

// Robin, classic costume: red tunic with the R badge, yellow cape,
// green sleeves/gloves/trunks/boots, domino mask, spiky hair.
function drawRobinSprite(x, y, s, tied, wiggle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(wiggle);
  ctx.scale(s, s);
  ctx.fillStyle = '#f1c40f';
  ctx.beginPath();
  ctx.moveTo(4, 12); ctx.lineTo(-8, 34); ctx.lineTo(2, 44); ctx.lineTo(8, 16);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d4a90c';
  ctx.beginPath();
  ctx.moveTo(20, 12); ctx.lineTo(30, 32); ctx.lineTo(22, 42); ctx.lineTo(17, 16);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1e8449';
  ctx.fillRect(5, 42, 6, 12);
  ctx.fillRect(13, 42, 6, 12);
  ctx.fillStyle = '#146034';
  ctx.fillRect(4, 50, 8, 5);
  ctx.fillRect(12, 50, 8, 5);
  ctx.fillStyle = '#1e8449';
  ctx.fillRect(4, 37, 16, 6);
  ctx.fillStyle = '#cb2d20';
  ctx.fillRect(3, 16, 18, 22);
  ctx.fillStyle = '#a32118';
  ctx.fillRect(16, 16, 5, 22);
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(12, 18); ctx.lineTo(12, 30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(9, 20); ctx.lineTo(15, 22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(9, 24); ctx.lineTo(15, 26); ctx.stroke();
  ctx.fillStyle = '#f6d743';
  ctx.beginPath(); ctx.arc(7.5, 20.5, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = 'bold 5px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('R', 7.5, 22.5);
  ctx.fillStyle = '#1e8449';
  ctx.fillRect(-1, 16, 6, 8);
  ctx.fillRect(19, 16, 6, 8);
  ctx.fillStyle = '#e8b88a';
  ctx.fillRect(0, 24, 4.5, 8);
  ctx.fillRect(19.5, 24, 4.5, 8);
  ctx.fillStyle = '#146034';
  ctx.fillRect(-0.5, 31, 5.5, 5);
  ctx.fillRect(19, 31, 5.5, 5);
  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(3, 36, 18, 3);
  ctx.fillStyle = '#e8b88a';
  ctx.fillRect(4, 0, 16, 17);
  ctx.fillStyle = '#16181e';
  ctx.beginPath();
  ctx.moveTo(2, 4); ctx.lineTo(5, -3); ctx.lineTo(9, 1); ctx.lineTo(13, -4);
  ctx.lineTo(16, 1); ctx.lineTo(20, -2); ctx.lineTo(22, 4);
  ctx.lineTo(22, 6); ctx.lineTo(2, 6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0c0d10';
  ctx.beginPath();
  ctx.moveTo(3, 7); ctx.lineTo(21, 7); ctx.lineTo(20, 12); ctx.lineTo(13.5, 11);
  ctx.lineTo(12, 9.5); ctx.lineTo(10.5, 11); ctx.lineTo(4, 12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(6, 8.5, 3.6, 2.2);
  ctx.fillRect(14.5, 8.5, 3.6, 2.2);
  if (tied) {
    ctx.strokeStyle = '#d9d3c5';
    ctx.lineWidth = 2.2;
    for (const yy of [19, 24, 29, 34]) {
      ctx.beginPath(); ctx.moveTo(2, yy); ctx.lineTo(22, yy + 1.5); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(2, 19); ctx.lineTo(4, 34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(22, 20); ctx.lineTo(20, 35); ctx.stroke();
  }
  ctx.restore();
}

// Two-Face: split navy/purple suit, half-burned face, coin in hand.
function drawTwoFaceSprite(x, y, s, bob = 0) {
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(s, s);
  ctx.fillStyle = '#1d2333';
  ctx.fillRect(4, 56, 10, 18);
  ctx.fillStyle = '#3d2a5e';
  ctx.fillRect(16, 56, 10, 18);
  ctx.fillStyle = '#0c0e16';
  ctx.fillRect(2, 72, 12, 5);
  ctx.fillRect(16, 72, 12, 5);
  ctx.fillStyle = '#242f4d';
  ctx.fillRect(2, 26, 13, 32);
  ctx.fillStyle = '#5a2d8c';
  ctx.fillRect(15, 26, 13, 32);
  ctx.fillStyle = '#161d33';
  ctx.beginPath(); ctx.moveTo(6, 26); ctx.lineTo(13, 26); ctx.lineTo(10, 38); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3d1e63';
  ctx.beginPath(); ctx.moveTo(24, 26); ctx.lineTo(17, 26); ctx.lineTo(20, 38); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8e6df';
  ctx.beginPath(); ctx.moveTo(13, 26); ctx.lineTo(17, 26); ctx.lineTo(16, 40); ctx.lineTo(14, 40); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8c1f2c';
  ctx.fillRect(13.6, 27, 2.8, 10);
  ctx.fillStyle = '#242f4d';
  ctx.fillRect(-3, 27, 6, 22);
  ctx.fillStyle = '#5a2d8c';
  ctx.fillRect(27, 27, 6, 22);
  ctx.fillStyle = '#e8b88a';
  ctx.fillRect(-2.5, 49, 5, 6);
  ctx.fillStyle = '#b5f26d';
  ctx.fillRect(27.5, 49, 5, 6);
  ctx.fillStyle = '#e8b88a';
  ctx.fillRect(4, 2, 11, 22);
  ctx.fillStyle = '#8e3140';
  ctx.fillRect(15, 2, 11, 22);
  ctx.fillStyle = '#6d2433';
  ctx.fillRect(15, 4, 4, 5);
  ctx.fillRect(20, 10, 5, 4);
  ctx.fillRect(16, 16, 4, 4);
  ctx.fillStyle = '#a84a56';
  ctx.fillRect(22, 3, 4, 5);
  ctx.fillRect(16, 11, 3, 3);
  ctx.fillStyle = '#2c2415';
  ctx.fillRect(3, -2, 12, 6);
  ctx.fillStyle = '#141824';
  ctx.beginPath();
  ctx.moveTo(15, -2); ctx.lineTo(19, -4); ctx.lineTo(21, -1); ctx.lineTo(24, -4); ctx.lineTo(27, 0);
  ctx.lineTo(27, 4); ctx.lineTo(15, 4);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(7, 10, 4, 2.6);
  ctx.fillStyle = '#20232f';
  ctx.fillRect(8.4, 10.4, 1.6, 1.8);
  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath(); ctx.arc(20.5, 11, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#20232f';
  ctx.beginPath(); ctx.arc(20.9, 11, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5e3d2c';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(7, 19); ctx.lineTo(13, 19); ctx.stroke();
  ctx.fillStyle = '#e8e6df';
  ctx.fillRect(15.5, 17.5, 8, 3);
  ctx.strokeStyle = '#6d2433';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(16.5 + i * 2, 17.5); ctx.lineTo(16.5 + i * 2, 20.5); ctx.stroke();
  }
  ctx.fillStyle = '#d8d8d0';
  ctx.beginPath(); ctx.arc(0, 47, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8f8f86';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-2.4, 45); ctx.lineTo(2.4, 49); ctx.stroke();
  ctx.restore();
}

// The gang's van, rear at the left: split-circle tag, animated wheels.
function drawVanSprite(x, groundYpx, doorT, moving, t) {
  ctx.save();
  ctx.translate(x, groundYpx);
  ctx.fillStyle = '#23283c';
  ctx.fillRect(0, -62, 120, 62);
  ctx.fillStyle = '#181c2c';
  ctx.fillRect(120, -50, 34, 50);
  ctx.fillStyle = '#3d4b66';
  ctx.fillRect(126, -46, 20, 18);
  ctx.fillStyle = '#e8e6df';
  ctx.beginPath(); ctx.arc(60, -32, 14, Math.PI / 2, Math.PI * 1.5); ctx.fill();
  ctx.fillStyle = '#5a2d8c';
  ctx.beginPath(); ctx.arc(60, -32, 14, -Math.PI / 2, Math.PI / 2); ctx.fill();
  for (const wx of [26, 128]) {
    ctx.fillStyle = '#0c0f1a';
    ctx.beginPath(); ctx.arc(wx, 0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#454d5c';
    ctx.beginPath(); ctx.arc(wx, 0, 5, 0, Math.PI * 2); ctx.fill();
    if (moving) {
      const spin = t / 60;
      ctx.strokeStyle = 'rgba(160,170,190,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(wx, 0, 9, spin, spin + 1.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(wx, 0, 9, spin + Math.PI, spin + Math.PI + 1.4); ctx.stroke();
    }
  }
  // rear doors: doorT 0 = wide open, 1 = shut
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, -58, 30, 56); // cargo hold
  const swing = (1 - doorT) * 16;
  ctx.fillStyle = '#101423';
  ctx.fillRect(-swing, -60, Math.max(4, 16 - swing), 58);
  if (doorT >= 1) {
    ctx.strokeStyle = '#0c0f1a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(8, -58); ctx.lineTo(8, -4); ctx.stroke();
  }
  if (moving) {
    ctx.strokeStyle = 'rgba(200,210,235,0.5)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-20 - i * 14, -46 + i * 16);
      ctx.lineTo(-46 - i * 14, -46 + i * 16);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(180,180,190,0.25)';
    const puff = (t / 300) % 1;
    ctx.beginPath(); ctx.ellipse(-14 - puff * 12, -6 - puff * 4, 9 + puff * 5, 6 + puff * 3, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// timeline phases (ms since the cutscene started)
const CUT_DRAG_END = 3200;   // Two-Face drags Robin to the van
const CUT_DOOR_END = 5200;   // Robin thrown in, doors shut
const CUT_DRIVE_END = 9200;  // the van speeds away, Batman leaps after it
const CUT_TOTAL = 10000;

function drawIntroScene(t, ct) {
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, '#060812');
  g.addColorStop(0.7, '#10142c');
  g.addColorStop(1, '#1a2038');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(220,230,255,${0.2 + 0.5 * hash01(i * 1.7)})`;
    ctx.fillRect(hash01(i * 7.31) * CANVAS_W, hash01(i * 3.77) * 150, 2, 2);
  }
  ctx.fillStyle = '#eceadb';
  ctx.beginPath(); ctx.arc(640, 70, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#060812';
  ctx.beginPath(); ctx.arc(652, 63, 26, 0, Math.PI * 2); ctx.fill();

  const groundYpx = 330;

  // rooftop, left — Batman's perch
  ctx.fillStyle = '#0c0f1e';
  ctx.fillRect(0, 160, 190, CANVAS_H - 160);
  ctx.fillStyle = '#161b30';
  ctx.fillRect(0, 160, 190, 8);

  // street + lamp
  ctx.fillStyle = '#20232f';
  ctx.fillRect(190, groundYpx, CANVAS_W - 190, CANVAS_H - groundYpx);
  ctx.fillStyle = '#161923';
  ctx.fillRect(190, groundYpx, CANVAS_W - 190, 6);
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

  const clamp01 = v => Math.max(0, Math.min(1, v));
  const dragT = clamp01(ct / CUT_DRAG_END);
  const doorT = clamp01((ct - CUT_DRAG_END - 600) / 900);
  const driveT = clamp01((ct - CUT_DOOR_END) / (CUT_DRIVE_END - CUT_DOOR_END));

  // van waits, then accelerates off to the right
  const vanX = 560 + Math.pow(driveT, 1.7) * 420;
  drawVanSprite(vanX, groundYpx, doorT, driveT > 0.01, t);

  if (ct < CUT_DRAG_END + 600) {
    // phase 1: dragging tied Robin toward the van
    const tfx = 320 + dragT * 160;
    const bob = Math.abs(Math.sin(t / 160)) * (dragT < 1 ? 2.2 : 0);
    drawTwoFaceSprite(tfx, groundYpx - 78, 1.0, -bob);
    const wiggle = Math.sin(t / 130) * 0.10;
    drawRobinSprite(tfx + 42, groundYpx - 58, 1.0, true, 0.14 + wiggle);
    // grip arm
    ctx.strokeStyle = '#5a2d8c';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(tfx + 30, groundYpx - 44); ctx.lineTo(tfx + 48, groundYpx - 36);
    ctx.stroke();
    if (Math.floor(t / 400) % 2 === 0) {
      ctx.fillStyle = '#dbe4ff';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('¡BATMAN!', tfx + 56, groundYpx - 96);
    }
  } else if (ct < CUT_DOOR_END) {
    // phase 2: Robin lands inside the hold, Two-Face slams the door and
    // hustles around to the cab
    const inT = clamp01((ct - CUT_DRAG_END - 200) / 500);
    if (doorT < 0.85) {
      drawRobinSprite(vanX + 8, groundYpx - 56 + inT * 4, 0.72 - inT * 0.06, true, 0.3 - inT * 0.3);
    }
    const tfx = 500 + clamp01((ct - CUT_DRAG_END - 500) / 900) * 130;
    const bob = Math.abs(Math.sin(t / 120)) * 2.4;
    drawTwoFaceSprite(tfx, groundYpx - 78, 1.0, -bob);
  }

  // Batman: crouched watch -> leaps across the gap after the van
  const leapT = clamp01((ct - (CUT_DOOR_END + 300)) / 1000);
  const bx = 120 + leapT * 260;
  const by = 118 - Math.sin(leapT * Math.PI) * 90 + leapT * 172;
  ctx.save();
  ctx.translate(bx, by);
  ctx.shadowColor = 'rgba(150,185,230,0.7)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#131722';
  ctx.beginPath();
  if (leapT > 0 && leapT < 1) {
    // spread cape glide
    ctx.moveTo(-6, 34);
    ctx.lineTo(-30, 4); ctx.lineTo(-10, 12); ctx.lineTo(-2, -2);
    ctx.lineTo(6, -14); ctx.lineTo(10, -6); ctx.lineTo(16, -14); ctx.lineTo(20, -2);
    ctx.lineTo(40, 8); ctx.lineTo(26, 22); ctx.lineTo(18, 38);
  } else {
    ctx.moveTo(0, 42);
    ctx.lineTo(4, 20); ctx.lineTo(0, 12); ctx.lineTo(6, 0); ctx.lineTo(10, 8);
    ctx.lineTo(18, 8); ctx.lineTo(22, 0); ctx.lineTo(28, 12);
    ctx.lineTo(26, 24); ctx.lineTo(40, 34); ctx.lineTo(34, 42);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(9, leapT > 0 && leapT < 1 ? -6 : 14, 5, 2.5);
  ctx.fillRect(17, leapT > 0 && leapT < 1 ? -6 : 14, 5, 2.5);
  ctx.restore();

  // story panel
  ctx.fillStyle = 'rgba(6,8,16,0.92)';
  ctx.fillRect(40, 386, CANVAS_W - 80, 84);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 386, CANVAS_W - 80, 84);
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
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

  // fade out at the end
  if (ct > CUT_DRIVE_END) {
    ctx.fillStyle = `rgba(0,0,0,${clamp01((ct - CUT_DRIVE_END) / (CUT_TOTAL - CUT_DRIVE_END))})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
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
  // Bane's landing gives the whole view a brief jolt; restored at the end
  // of the frame so it never leaks into the persistent camera position.
  const origCamX = camera.x, origCamY = camera.y;
  const shake = currentShakeOffset(t);
  camera.x += shake.x;
  camera.y += shake.y;

  drawBackground(t);
  drawDockWater(t);
  drawBoats(t);
  drawCranes();
  drawSwingPoints(t);
  drawTiles();
  if (level.cave) drawCaveProps(t);
  drawWalls(t);
  drawLadders();
  drawGargoyles();
  drawHouses(t);
  drawTrash(t);
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
  drawImpactEffects(t);
  drawPlayer();
  drawHeroMessage();

  camera.x = origCamX;
  camera.y = origCamY;

  if (state === 'levelcomplete') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`NIVEL ${level.name} COMPLETADO`, CANVAS_W / 2, CANVAS_H / 2);
    if (allCoinsBonus) {
      ctx.fillStyle = '#29d985';
      ctx.font = 'bold 20px monospace';
      ctx.fillText('¡TODAS LAS MONEDAS! +1 VIDA', CANVAS_W / 2, CANVAS_H / 2 + 40);
    }
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
  } else if (state === 'computer' || state === 'choice' || state === 'levelselect') {
    // Batcave UI: the frozen scene stays behind the expediente / choice /
    // replay panel
    render(now);
    if (state === 'computer') drawExpedienteScreen(now);
    else if (state === 'choice') drawChoiceScreen(now);
    else drawLevelSelectScreen(now);
    handleCaveUIInput(now);
  } else if (state === 'cutscene') {
    const ct = now - cutsceneStart;
    if (ct > CUT_TOTAL) startGame();
    else drawIntroScene(now, ct);
  }
  requestAnimationFrame(loop);
}

showNameMenu();
requestAnimationFrame(loop);
