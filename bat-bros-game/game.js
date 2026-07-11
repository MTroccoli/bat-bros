/* ============================================================
   BAT BROS — Motor del juego: input, física, rendering, UI.
   Constantes y niveles están en catalog.js y levels.js.
   ============================================================ */
// ---------------------------------------------------------------
// Input
// ---------------------------------------------------------------
const keys = { left: false, right: false, jump: false, shoot: false, grapple: false, down: false, up: false };

// Jump/shoot presses are buffered by timestamp (not sampled per-frame), so a
// quick tap always registers even if it happens to fall between two frames.
let jumpBufferUntil = 0;
let shootBufferUntil = 0;
let grappleBufferUntil = 0;
let coyoteUntil = 0;
let lastShotAt = -Infinity;
let lastGrappleShotAt = -Infinity;

function requestJump() { jumpBufferUntil = performance.now() + JUMP_BUFFER_MS; }
function requestShoot() { shootBufferUntil = performance.now() + JUMP_BUFFER_MS; }
function requestGrapple() { grappleBufferUntil = performance.now() + JUMP_BUFFER_MS; }

// Act 3 co-op: hot-swap Batman <-> Robin. The one you leave becomes the
// companion that trails behind; the one you pick up gets the controls,
// with Robin's forced batarang loadout and double-jump ability.
function switchCharacter() {
  if (!companion) return;
  const swap = companion;
  companion = {
    x: player.x, y: player.y,
    vx: player.vx, vy: player.vy,
    w: player.w, h: player.h,
    facing: player.facing,
    onGround: player.onGround,
    powerState: player.powerState,
    gadget: player.gadget,
    // Freeze status stays with whoever was hit — hitting Batman with a
    // snowball freezes ONLY Batman; swapping in Robin doesn't share it,
    // and swapping back to Batman restores whatever was left of his timer.
    frozenUntil: player.frozenUntil || 0,
    isCompanion: true,
    isRobin: activeChar === 'batman' ? false : true, // now this one is the one you left
    jumpsUsed: 0, walkPhase: 0,
  };
  player = {
    x: swap.x, y: swap.y,
    vx: swap.vx, vy: swap.vy,
    w: swap.w, h: swap.h,
    facing: swap.facing, dead: false,
    onGround: swap.onGround,
    powerState: swap.powerState,
    gadget: swap.gadget,
    frozenUntil: swap.frozenUntil || 0,
    swinging: false, swingAnchor: null, swingRadius: 0, swingAngle: 0, swingAngularVel: 0,
    swingMinR: null,
    climbing: false,
    walkDist: swap.walkPhase || 0,
    jumpsUsed: 0,
  };
  activeChar = activeChar === 'batman' ? 'robin' : 'batman';
  // Robin's only tool is the batarang — regardless of what Batman was
  // holding, force it on when Robin takes over. Batman keeps whatever
  // he last chose (batarang / batigarra / armor).
  if (activeChar === 'robin') player.gadget = 'batarang';
  // Robin and Batman are always the SAME visible size — tied to the
  // armor pick. Without this, Robin's h could stay at the small (30)
  // he was born with while Batman was big (40), and he'd look shrunk.
  const size = SIZES[armored ? 'big' : 'small'];
  const oldH = player.h;
  player.w = size.w; player.h = size.h;
  player.powerState = armored ? 'big' : 'small';
  companion.w = size.w; companion.h = size.h;
  companion.powerState = armored ? 'big' : 'small';
  // Keep feet on the same tile after a resize (h change would sink them)
  player.y += oldH - size.h;
  currentGadget = player.gadget;
  currentPowerState = player.powerState;
  updateWeaponButton();
}

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
    if (confirmCode) {
      // Post-2-4 fresh visit: news first, then expediente, then choice.
      // Hub visits from Act 3+ skip straight to the expediente.
      state = postTwoFaceReturn ? 'freezeExpediente' : 'choice';
      e.preventDefault();
    }
    return;
  }
  if (state === 'freezeExpediente') {
    if (confirmCode) { state = 'choice'; e.preventDefault(); }
    return;
  }
  if (state === 'choice') {
    const cv = level.cave;
    const step = cv.pickStep || 'slot';
    if (step === 'slot') {
      // All slots are pickable — filled ones can be modified.
      if (['ArrowLeft', 'KeyA'].includes(e.code)) cv.slotSel = Math.max(0, cv.slotSel - 1);
      else if (['ArrowRight', 'KeyD'].includes(e.code)) cv.slotSel = Math.min(BELT_SLOTS - 1, cv.slotSel + 1);
      if (confirmCode) chooseCaveWeapon();
    } else {
      const opts = accessoriesForSubMenu(cv.editingKind);
      if (['ArrowLeft', 'KeyA'].includes(e.code)) cv.weaponSel = Math.max(0, cv.weaponSel - 1);
      else if (['ArrowRight', 'KeyD'].includes(e.code)) cv.weaponSel = Math.min(opts.length - 1, cv.weaponSel + 1);
      if (confirmCode) chooseCaveWeapon();
    }
    e.preventDefault();
    return;
  }
  if (state === 'levelselect') {
    const cv = level.cave;
    const opts = (cv.selStep || 'act') === 'act' ? levelSelectActs() : levelSelectLevels(cv.selAct || 1);
    if (['ArrowLeft', 'KeyA'].includes(e.code)) cv.selLevel = Math.max(0, cv.selLevel - 1);
    else if (['ArrowRight', 'KeyD'].includes(e.code)) cv.selLevel = Math.min(opts.length - 1, cv.selLevel + 1);
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
  if (['KeyZ', 'KeyC'].includes(e.code)) { keys.grapple = true; requestGrapple(); }
  if (['ArrowDown', 'KeyS'].includes(e.code)) keys.down = true;
  if (e.code === 'KeyR') restartGame();
  // co-op character swap (Act 3+)
  if ((e.code === 'KeyT' || e.code === 'KeyQ') && state === 'playing') { switchCharacter(); e.preventDefault(); }
  if (['Space', 'ArrowUp'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => {
  if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = false;
  if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = false;
  if (['ArrowUp', 'KeyW', 'Space'].includes(e.code)) keys.jump = false;
  if (['ArrowUp', 'KeyW'].includes(e.code)) keys.up = false;
  if (['KeyX', 'ShiftLeft', 'ShiftRight'].includes(e.code)) keys.shoot = false;
  if (['KeyZ', 'KeyC'].includes(e.code)) keys.grapple = false;
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
if (document.getElementById('btn-grapple')) {
  bindButton('btn-grapple', () => { keys.grapple = true; requestGrapple(); }, () => keys.grapple = false);
}
// rope reel (batigarra): up contracts, down extends
bindButton('btn-up', () => keys.up = true, () => keys.up = false);
bindButton('btn-down', () => keys.down = true, () => keys.down = false);

// Warp back to the Batcave from any Act 3 level. Visible only from
// Act 3 onward; wired to loadLevel(CUEVA).
const caveBtnEl = document.getElementById('btn-cave');
if (caveBtnEl) {
  caveBtnEl.addEventListener('click', (e) => {
    e.preventDefault();
    if (state !== 'playing') return;
    const caveIdx = LEVEL_SPECS.findIndex(s => s.cave);
    if (caveIdx >= 0) {
      // Returning to the Batcave from Act 3+ is a HUB visit, not a
      // fresh Act-2 rescue: the player is always Batman, Robin walks
      // in beside him, Alfred stays silent, and the Batcomputer opens
      // straight into the highest-act expediente (skip the news).
      caveHubReturn = true;
      // force Batman back into the driver's seat
      if (activeChar === 'robin' && companion) switchCharacter();
      loadLevel(caveIdx);
      state = 'playing';
    }
  });
}
const swapBtnEl = document.getElementById('btn-swap');
if (swapBtnEl) {
  swapBtnEl.addEventListener('click', (e) => {
    e.preventDefault();
    if (state !== 'playing') return;
    switchCharacter();
    updateCaveButtonVisibility();
  });
}
function updateCaveButtonVisibility() {
  if (!caveBtnEl) return;
  const show = level && level.name && level.name.startsWith('3-');
  caveBtnEl.style.display = show ? 'block' : 'none';
  if (swapBtnEl) {
    swapBtnEl.style.display = show ? 'block' : 'none';
    swapBtnEl.textContent = activeChar === 'batman' ? '⇄ ROBIN' : '⇄ BATMAN';
  }
}

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
  const hasBatarang = playerCanUse('batarang');
  const hasGarra = playerCanUse('batigarra');
  // Batarang throw button (🪃) — visible whenever the batarang is in
  // the active character's inventory.
  btnShoot.style.display = hasBatarang ? 'flex' : 'none';
  btnShoot.textContent = '🪃';
  // Grapple fire button (🪝) — visible only when Batman owns the
  // batigarra; Robin never carries it.
  const btnGrapple = document.getElementById('btn-grapple');
  if (btnGrapple) {
    btnGrapple.style.display = hasGarra ? 'flex' : 'none';
    btnGrapple.textContent = '🪝';
  }
  // The ▲/▼ d-pad arrows are used for BOTH the batigarra rope reel AND
  // climbing dock ladders (Act 2+) — hide only in Act 1, where neither
  // applies. From the first Batcave visit onwards they stay visible so
  // players like Franco can climb the pier ladders without needing the
  // grapple gadget.
  const needsArrows = hasGarra
    || (level && level.ladders && level.ladders.length > 0)
    || postTwoFaceReturn
    || !!currentGadget;
  const btnUp = document.getElementById('btn-up');
  const btnDown = document.getElementById('btn-down');
  if (btnUp) btnUp.style.display = needsArrows ? '' : 'none';
  if (btnDown) btnDown.style.display = needsArrows ? '' : 'none';
  if (hud.ammoWrap) {
    hud.ammoWrap.style.display = hasBatarang ? '' : 'none';
    if (hasBatarang) hud.ammo.textContent = batarangAmmo;
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
let currentGadget = null;        // deprecated but kept for backward compat: mirrors the FIRST owned tool
// New multi-slot inventory. Batman can stack tools (Act 3 has 2 slots),
// so choosing the batigarra after the batarang keeps BOTH — the choice
// screen ACCUMULATES, it never replaces. Robin ignores this and always
// carries the batarang.
let ownedGadgets = { batarang: false, batigarra: false };
let armored = false;             // Act 2 armor upgrade: every spawn starts as 'big' (takes one extra hit)
let postTwoFaceReturn = false;   // routed back to the Batcave after 2-4; unlocks the Act 2 choice screen
let caveHubReturn = false;       // player warped to the Batcave via the ⌂ button from Act 3+ (silent Alfred, skip news)
let lastPlayedLevel = 0;         // remembered so Batcave door returns Batman to whichever level he was actually on
// Persist "beat Two-Face" so Continue from a fresh page reload also
// lands the news feed instead of the Two-Face expediente.
function saveAct2Beaten() {
  try { localStorage.setItem('bitbros:act2beaten', '1'); } catch (e) {}
}
function loadAct2Beaten() {
  try { return localStorage.getItem('bitbros:act2beaten') === '1'; } catch (e) { return false; }
}
let rescueStart = 0;             // performance.now() when the 2-4 rescue cutscene began
let alfredStart = 0;             // performance.now() when Alfred's news cutscene began

// Act 3 co-op: Batman and Robin play together. The active one gets user
// input; the other is stored here and follows behind as a companion.
// Robin's only tool is the batarang, plus a double-jump-with-somersault.
let activeChar = 'batman';       // 'batman' | 'robin'
let companion = null;            // { x, y, vx, vy, facing, w, h, powerState, gadget, isCompanion, walkPhase }
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
// Add a gadget to the arsenal (never replace). Robin's kit stays as
// batarang-only regardless of Batman's inventory. The most recently
// added tool becomes the "active" one for legacy checks that still
// read player.gadget.
function setGadget(g) {
  if (g === 'batarang' || g === 'batigarra') ownedGadgets[g] = true;
  if (player) player.gadget = g;
  currentGadget = g;
  updateWeaponButton();
  if (playerName) {
    saveGadgetChoice(playerName, g);
    saveBeltState(playerName);
  }
}
function playerCanUse(gadget) {
  if (activeChar === 'robin') return gadget === 'batarang';
  return !!ownedGadgets[gadget];
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
          if (g.frozen) {
            g.frozen = false;
            g.vx = (g.vx < 0 ? -1 : 1) * 1.2;
            score += 50;
          } else {
            g.alive = false;
            score += 100;
          }
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
          if (bd.frozen) {
            bd.frozen = false;
            bd.vx = (bd.vx < 0 ? -1 : 1) * 1.7;
            score += 50;
          } else {
            bd.alive = false;
            score += 100;
          }
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
  // Robin has no grappling hook — he reaches high spots via double
  // jump instead. Grapple points on-screen still exist for Batman.
  if (activeChar === 'robin') return;
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
    if (player.vy >= 0) continue;
    const hasCloseFloor = sp.floorY - sp.y <= TILE * 4;
    if (hasCloseFloor) {
      if (player.y + player.h < sp.floorY + 6) continue;
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
  // Batigarra CONTROL is tied to ownership, not `player.gadget` — the
  // last-fired weapon flips gadget between batarang / batigarra, but any
  // Batman who owns the batigarra should get its enhanced swing feel.
  const isGarra = ownedGadgets.batigarra && activeChar === 'batman' && !player.swingMinR;
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
  let ty = player.y + player.h / 2 - CANVAS_H * 0.55;
  let allowNegativeY = false;
  // Two-Face arena: pin the arena floor to the bottom of the viewport so
  // the fight feels like a tall engine-room hall with a high ceiling
  // overhead. Kicks in once the fight is actually live.
  if (level.twoface && level.twoface.alive && level.twoface.state !== 'idle') {
    const floorPx = level.twoface.floorRow * TILE;
    ty = floorPx + 32 - CANVAS_H;
    allowNegativeY = true;
  }
  return {
    x: Math.max(0, Math.min(tx, Math.max(0, level.pixelWidth - CANVAS_W))),
    y: allowNegativeY
      ? Math.min(ty, Math.max(0, level.pixelHeight - CANVAS_H))
      : Math.max(0, Math.min(ty, Math.max(0, level.pixelHeight - CANVAS_H))),
  };
}

function snapCameraToPlayer() {
  const t = cameraTargets();
  camera.x = t.x;
  camera.y = t.y;
}

function loadLevel(idx) {
  if (level && level.chase) exitChaseMode();
  levelIndex = idx;
  level = buildLevel(LEVEL_SPECS[idx]);
  // Remember the last real level so a Batcave return can walk Batman
  // back to where he actually was (any non-cave level counts).
  if (!level.cave) lastPlayedLevel = idx;
  // Armor upgrade: force every fresh level spawn back up to big
  if (armored) currentPowerState = 'big';
  player = newPlayer(level.spawn, currentPowerState, currentGadget);
  // Per-act starting lives. Only bumps on the FIRST level of each act
  // (1-1, 2-1, 3-1) so the tally is a floor at act boundaries, not a
  // reset that erases earlier progress inside the act.
  const actStart = { '1-1': 3, '2-1': 4, '3-1': 5 };
  const bump = actStart[level.name];
  if (bump && lives < bump) {
    lives = bump;
    hud.lives.textContent = bump;
  }
  // Act 3 also introduces the co-op mechanic: Robin walks in beside
  // Batman, and either can be swapped in as the controlled character.
  // The companion persists across Batcave HUB visits so switching Batman
  // <-> Robin never "loses" the other one.
  const isAct3 = level.name && level.name.startsWith('3-');
  const isCaveHub = level.cave && postTwoFaceReturn;
  if (isAct3 || isCaveHub) {
    // Every Act-3 level starts with BATMAN in the driver's seat so
    // his weapon choice (batarang / batigarra) sticks. Player object
    // was built above as Batman-shaped with currentGadget; force
    // activeChar and Robin the companion to match.
    activeChar = 'batman';
    // Robin always matches Batman's current size — armored Batman is
    // big (h=40) so Robin is big too. Without armor both are small.
    const buddy = SIZES[armored ? 'big' : 'small'];
    if (!companion) {
      companion = {
        x: player.x - 34, y: player.y,
        w: buddy.w, h: buddy.h,
        vx: 0, vy: 0, facing: 1,
        onGround: true,
        powerState: armored ? 'big' : 'small',
        gadget: 'batarang',
        isCompanion: true,
        isRobin: true, // activeChar is now batman, so companion is robin
        jumpsUsed: 0,
        walkPhase: 0,
      };
    } else {
      companion.x = player.x - 34;
      companion.y = player.y;
      companion.onGround = true;
      // Match Batman's size on every level load — otherwise a swap
      // history from before the armor pick would leave Robin small.
      companion.w = buddy.w;
      companion.h = buddy.h;
      companion.powerState = armored ? 'big' : 'small';
      // Batman is active this level, so companion is Robin — force
      // the flag and his gadget so the swap history can't leak a
      // stale batigarra onto him.
      companion.isRobin = true;
      companion.gadget = 'batarang';
    }
  } else {
    companion = null;
  }
  // Act 2 Batcave return: Batman walks in with Robin at his side, and
  // Alfred is waiting halfway to the batcomputer with the news.
  // On a Batcave HUB visit (Act 3+ ⌂ button), Alfred is silent and the
  // Batcomputer skips the news, going straight to the current-act
  // expediente.
  if (level.cave && postTwoFaceReturn) {
    const cv = level.cave;
    cv.act2Return = true;
    cv.alfred = {
      x: cv.computerX - 220,
      y: cv.plateauY - 66, // shoes rest exactly on the plateau top
      triggered: caveHubReturn, // already talked to on later visits
      dialogPage: 0,
    };
    cv.companion = {
      x: player.x - 34,
      y: player.y,
      facing: 1,
      walkPhase: 0,
    };
    cv.tvOn = false;
    // widen the level-select carousel so Batman can replay Act 2 levels
    // from the entrance door — not just Act 1
    cv.replayOptions = [
      ...LEVEL_SPECS.map((s, i) => ({ i, name: s.name }))
        .filter(o => /^1-/.test(o.name) || /^2-/.test(o.name)),
      { i: -1, name: 'SEGUIR' },
    ];
  }
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
  if (level.chase) {
    enterChaseMode();
    const ch = level.chase;
    player.x = ch.batBoatX + 30;
    player.y = ch.batBoatY - 16 - player.h;
    player.onGround = true;
    camera.x = 0; camera.y = 0;
  } else {
    document.getElementById('hud').style.display = '';
  }
  // remember the furthest level this player has reached, for "Continuar"
  if (playerName) saveProgress(playerName, idx);
  updateCaveButtonVisibility();
}

function startGame() {
  score = 0; coinsCollected = 0; lives = 3;
  armored = false;
  caveHubReturn = false;
  ownedGadgets = { batarang: false, batigarra: false };
  postTwoFaceReturn = loadAct2Beaten();
  currentPowerState = 'small';
  currentGadget = startLevelIndex > 0 ? savedGadget : null;
  if (currentGadget) ownedGadgets[currentGadget] = true;
  // Continue: rehydrate the FULL belt from localStorage so Batman
  // walks in with both accessories he had last time, not just the
  // gadget stored in Supabase's single-item column.
  if (startLevelIndex > 0 && playerName) {
    const belt = loadBeltState(playerName);
    if (belt) {
      ownedGadgets.batarang = belt.batarang;
      ownedGadgets.batigarra = belt.batigarra;
      armored = belt.armored;
      if (armored) currentPowerState = 'big';
    }
  }
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

// --- Full belt state per player: BOTH weapons + armor persist in
// localStorage so a returning player keeps everything they equipped
// last session, not just the last-picked gadget. Supabase only knows
// the "current" gadget column, so we don't try to push here (the two
// booleans are cheap to keep on the device).
function localBeltKey(name) { return 'bitbros:belt:' + name.trim().toLowerCase(); }
function saveBeltState(name) {
  if (!name) return;
  try {
    localStorage.setItem(localBeltKey(name), JSON.stringify({
      batarang: !!ownedGadgets.batarang,
      batigarra: !!ownedGadgets.batigarra,
      armored: !!armored,
    }));
  } catch (e) {}
}
function loadBeltState(name) {
  if (!name) return null;
  try {
    const raw = localStorage.getItem(localBeltKey(name));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return {
      batarang: !!obj.batarang,
      batigarra: !!obj.batigarra,
      armored: !!obj.armored,
    };
  } catch (e) { return null; }
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
  // Dev shortcut: the tester account "Troco" always starts Continue on
  // level 3-1 so the full Act-3 loop is one click away. We FORCE
  // savedMaxLevel to 3-1 (not Math.max) even if Supabase already stored
  // a later level, and push the reset back to Supabase + localStorage
  // so the next load lands on 3-1 too.
  if (name.trim().toLowerCase() === 'troco') {
    const idx31 = LEVEL_SPECS.findIndex(s => s.name === '3-1');
    if (idx31 >= 0) {
      savedMaxLevel = idx31;
      try { localStorage.setItem(localKey(name), String(idx31)); } catch (e) {}
      try {
        fetch(`${SUPA_PLAYERS}?on_conflict=name`, {
          method: 'POST',
          headers: {
            apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({ name: name.trim(), last_level: idx31, updated_at: new Date().toISOString() }),
        }).catch(() => {});
      } catch (e) {}
    }
    savedGadget = savedGadget || 'batarang';
    try { localStorage.setItem('bitbros:act2beaten', '1'); } catch (e) {}
  }
  // Restore the full belt state persisted last session (both weapons
  // + armor). If nothing is stored, keep the current defaults — first
  // Batcave visit will fill them in.
  const belt = loadBeltState(name);
  if (belt) {
    ownedGadgets.batarang = belt.batarang;
    ownedGadgets.batigarra = belt.batigarra;
    armored = belt.armored;
  }
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
  // Solid tiles first — the classic wall bounce.
  if (rectHitsSolid(e.x, e.y, e.w, e.h)) {
    if (e.vx > 0) {
      const tx = Math.floor((e.x + e.w - 1) / TILE);
      e.x = tx * TILE - e.w;
      e.vx = -Math.abs(e.vx);
    } else {
      const tx = Math.floor(e.x / TILE);
      e.x = (tx + 1) * TILE;
      e.vx = Math.abs(e.vx);
    }
    return;
  }
  // GENERAL RULE: snow cannons (Act 3) also block patrols. Thugs and
  // birds should stop AT the cannon, not walk through it, so the
  // cannon acts as an invisible wall for the AABB test.
  const cannons = level.snowCannons || [];
  for (const c of cannons) {
    if (!c.alive) continue;
    if (aabbOverlap(e, c)) {
      if (e.vx > 0) { e.x = c.x - e.w; e.vx = -Math.abs(e.vx); }
      else          { e.x = c.x + c.w; e.vx = Math.abs(e.vx); }
      return;
    }
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

// Act-3 hazard. A chunky ice cannon fires a BURST of upward snowballs
// on a cadence (3 pops ~450 ms apart in a left / center / right fan,
// then a long pause). The balls arc up, fall with gravity, and freeze
// Batman on contact for FREEZE_MS. The cannon itself is
// indestructible — walking onto its muzzle from above is an ice trap
// that also freezes Batman.
const SNOWBALL_SIZE = 20;
const SNOWBALL_LAUNCH = -11.0;
const SNOW_BURST_GAP_MS = 450;
const FREEZE_MS = 4000;
// The 3-ball fan: which way each shot leans. Index 0 goes left, 1 up,
// 2 right — with a matching horizontal push so the balls spread out
// across the sky instead of overlapping each other.
const SNOW_BURST_VX = [-2.4, 0, 2.4];
function updateSnowCannons(dt, now) {
  const cannons = level.snowCannons || [];
  level.snowballs = level.snowballs || [];
  for (const c of cannons) {
    if (!c.alive) continue;
    // First shot lands ~1 s after the level starts so a fresh spawn
    // doesn't eat a snowball before Batman can even see the cannon.
    if (!c.nextFireAt) c.nextFireAt = now + 1000;
    const burstTotal = c.burstCount || SNOW_BURST_VX.length;
    if (now >= c.nextFireAt) {
      // Fire one ball of the burst; each ball leans a different
      // direction so they fan out (left → center → right).
      const bi = c.burstIndex || 0;
      const vx = SNOW_BURST_VX[bi % SNOW_BURST_VX.length];
      level.snowballs.push({
        x: c.x + c.w / 2 - SNOWBALL_SIZE / 2, y: c.y - SNOWBALL_SIZE,
        w: SNOWBALL_SIZE, h: SNOWBALL_SIZE,
        vx, vy: SNOWBALL_LAUNCH,
        rot: 0, alive: true, born: now,
      });
      c.burstIndex = bi + 1;
      if (c.burstIndex >= burstTotal) {
        c.burstIndex = 0;
        c.nextFireAt = now + c.fireInterval;
      } else {
        c.nextFireAt = now + SNOW_BURST_GAP_MS;
      }
    }
    // Ice trap: touching any face of the cannon freezes Batman. The
    // top face used to be a stomp — now it's the meanest freeze zone.
    const invuln = (player.invulnUntil || 0) > now;
    if (!invuln && !player.swinging &&
        aabbOverlap({ x: player.x, y: player.y, w: player.w, h: player.h }, c)) {
      player.frozenUntil = now + FREEZE_MS;
      player.vx *= 0.3;
      // Give a tiny upward bump if he landed on top so he doesn't get
      // stuck INSIDE the muzzle — freeze-then-fall, not freeze-then-glitch.
      if (player.vy > 0 && player.y + player.h - c.y < STOMP_TOLERANCE) {
        player.vy = -3;
      }
    }
  }
  // Snowballs
  const invuln = (player.invulnUntil || 0) > now;
  const balls = level.snowballs;
  for (const b of balls) {
    if (!b.alive) continue;
    b.vy += GRAVITY * dt;
    if (b.vy > MAX_FALL) b.vy = MAX_FALL;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot = (b.rot || 0) + 0.2 * dt;
    if (b.y > (level.pixelHeight || level.height * TILE) + 60) { b.alive = false; continue; }
    // Batarangs shatter snowballs mid-flight (batman's counter-play)
    for (const g of batarangs) {
      if (!g.alive) continue;
      if (Math.hypot((g.x - b.x), (g.y - b.y)) < 26) { b.alive = false; break; }
    }
    if (!b.alive) continue;
    // Enemy hit tests come BEFORE the solid-tile check so a ball that
    // clips a ground-level thug on its way down still freezes him
    // before the tile eats it. One ball, one enemy.
    for (const g of level.thugs) {
      if (!g.alive || g.frozen) continue;
      if (aabbOverlap(b, g)) {
        g.frozen = true;
        g.vx = Math.sign(g.vx || 1) * 0.35; // match the level-frozen thug speed
        b.alive = false;
        break;
      }
    }
    if (!b.alive) continue;
    for (const bd of level.birds) {
      if (!bd.alive || bd.frozen) continue;
      if (aabbOverlap(b, bd)) {
        bd.frozen = true;
        bd.vx = Math.sign(bd.vx || 1) * 0.5;
        b.alive = false;
        break;
      }
    }
    if (!b.alive) continue;
    // Hit test against the player (skip during i-frames from a hurt)
    if (!invuln && !player.swinging && aabbOverlap(b, { x: player.x, y: player.y, w: player.w, h: player.h })) {
      player.frozenUntil = now + FREEZE_MS;
      player.vx *= 0.3;
      b.alive = false;
      continue;
    }
    // Finally: bury the ball in a solid tile so it doesn't punch through
    // rooftops after the enemy/player passes.
    if (rectHitsSolid(b.x, b.y, b.w, b.h)) { b.alive = false; continue; }
  }
  // Prune every so often so the array doesn't bloat during long levels
  if (balls.length > 60) level.snowballs = balls.filter(b => b.alive);
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
    // Keep chase-mode (portrait canvas + chase-active body class) on
    // during game-over so the overlay menu stays in the same one-hand
    // portrait framing. exitChaseMode fires on the next loadLevel when
    // the player restarts.
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
  // Armor upgrade (unlocked in the Act 2 Batcave) makes every respawn
  // start big, so Batman always has one extra hit before he can die.
  currentPowerState = armored ? 'big' : 'small';
  // Boss fights already in progress: keep Batman in the arena so the
  // fight stays fluid — no punishing trek back to the level start. For
  // Two-Face we drop him at the ladder top on the arena floor; for
  // Bane, on the warehouse floor near his entrance.
  let respawn = level.checkpoint || level.spawn;
  const tfEngaged = level.twoface && level.twoface.alive && level.twoface.state !== 'idle';
  const baneEngaged = level.bane && level.bane.alive && level.bane.state !== 'idle';
  if (tfEngaged) {
    const l = level.ladders?.[0];
    if (l) respawn = { x: l.x, y: l.top - TILE * 2 };
  } else if (baneEngaged) {
    respawn = { x: 3 * TILE, y: (level.groundY - 2) * TILE };
  }
  player = newPlayer(respawn, 'small', currentGadget);
  if (currentGadget === 'batarang') { batarangAmmo = BATARANG_MAX_AMMO; updateAmmoHud(); }
  if (level.chase) {
    const ch = level.chase;
    player.x = ch.batBoatX + 30;
    player.y = ch.batBoatY - 16 - player.h;
    player.onGround = true;
    ch.obstacles = ch.obstacles.filter(ob => Math.abs(ob.y - ch.batBoatY) > 100);
    ch.grenades = [];
    invulnUntil = Date.now() + INVULN_TIME;
    return;
  }
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
  if (level.twoface && level.twoface.alive) {
    const tf = level.twoface;
    tf.x = tf.homeX;
    tf.y = tf.floorRow * TILE - tf.h;
    // re-arm to idle so the fight (and the rope) resets for the next
    // climb — otherwise Two-Face would keep hacking at the cage while
    // Batman respawns at the checkpoint far below with no way to help
    tf.state = 'idle';
    tf.hitUntil = 0;
    tf.stunUntil = 0;
    tf.cutTimer = 0;
    tf.cutStart = 0;
    tf.nextThugAt = 0;
    tf._robinDropAt = 0;
    tf.coinFlipAt = 0;
    tf.coinResult = null;
    tf.bullets = [];
    tf.bulletsFired = 0;
    if (tf.cage) {
      tf.cage.cutsCount = 0;
      tf.cage.y = tf.cage.initialY;
      tf.cage.falling = false;
      tf.cage.splashed = false;
      tf.cage.fallVy = 0;
      tf.cage.shakeUntil = 0;
    }
    if (tf.water) tf.water.ripples = [];
    if (tf.robin) {
      tf.robin.hitUntil = 0;
      tf.robin.drowned = false;
    }
    level.thugs = level.thugs.filter(g => !g.bossSpawn);
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
  // Boss fights (Two-Face / Bane): the fight is a self-contained
  // encounter, so a hit only drains a life — Batman stays right where
  // he is with a brief knockback + invuln. If lives hit 0, it's a real
  // game over. Falls and timeouts still call killPlayer() directly and
  // bypass this branch.
  const tfEngaged = level.twoface && level.twoface.alive && level.twoface.state !== 'idle';
  const baneEngaged = level.bane && level.bane.alive && level.bane.state !== 'idle';
  if (tfEngaged || baneEngaged) {
    lives--;
    hud.lives.textContent = Math.max(lives, 0);
    if (lives <= 0) {
      state = 'gameover';
      gameOverCount++;
      if (playerName) saveGameOvers(playerName, gameOverCount);
      if (levelIndex === BOSS_LEVEL_INDEX && coinsCollected >= CONTINUE_COST) {
        continueOffer = true;
        showOverlay('CAÍSTE EN EL GALPÓN',
          `Bane sigue ahí. Usá ${CONTINUE_COST} de tus ${coinsCollected} monedas para volver a enfrentarlo sin perder tu progreso (o presioná R para reiniciar desde cero).`,
          `USAR ${CONTINUE_COST} MONEDAS`);
        return;
      }
      showChoiceMenu(`GAME OVER — Puntaje: ${score}. Elegí cómo seguir, ${playerName || 'héroe'}.`);
      return;
    }
    invulnUntil = Date.now() + INVULN_TIME;
    // Armor upgrade: the very next hit puts the suit right back on
    if (armored && player.powerState === 'small') setPowerState('big');
    // small knockback away from the boss so Batman doesn't immediately
    // eat a second hit standing inside the enemy
    const boss = level.twoface?.alive ? level.twoface : level.bane;
    if (boss) {
      const bossCx = boss.x + boss.w / 2;
      const dir = (player.x + player.w / 2) < bossCx ? -1 : 1;
      player.vx = dir * 3;
      player.vy = -4;
      player.onGround = false;
    }
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
  // 2-4: the Two-Face fight ends with a hand-crafted rescue cutscene
  // that hands off to the Batcave for the Act 2 choice screen.
  if (level.twoface) {
    state = 'rescue';
    rescueStart = performance.now();
    score += Math.floor(timeLeft) * 5;
    return;
  }
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

// Robin took one hit too many: instant mission failure, regardless of
// how many lives Batman still has.
function robinKilled() {
  state = 'gameover';
  gameOverCount++;
  if (playerName) saveGameOvers(playerName, gameOverCount);
  showChoiceMenu(`ROBIN CAYÓ AL TANQUE — la misión falló. Puntaje: ${score}. Elegí cómo seguir, ${playerName || 'héroe'}.`);
}

// ---------------------------------------------------------------
// Two-Face fight (level 2-4)
//
// Robin dangles in a cage over a water tank on the arena's left side.
// Two-Face patrols the right side; every few seconds he advances on the
// rope and starts a CUT_ANIMATION_MS-long hack. Batman must land a hit
// during the cut (or before the walk finishes) to stagger him. If he
// finishes the cut, the cage drops one notch — three cuts and Robin
// plunges into the tank. Batman needs 5 stomps/batarangs to win. As
// Two-Face's HP falls he speeds up, spawns thugs faster, and goes for
// the rope more often.
// ---------------------------------------------------------------
function updateTwoFace(dt, now) {
  const tf = level.twoface;
  if (!tf.alive) {
    if (tf.deadAt && now - tf.deadAt > 1800 && state === 'playing') completeLevel();
    return;
  }

  const cage = tf.cage;
  const water = tf.water;
  const rb = tf.robin;
  const enraged = tf.hp <= 2;

  // === Cage falling animation (post 3rd cut) — runs regardless of tf state
  if (cage.falling) {
    cage.fallVy += 0.55 * dt;
    cage.y += cage.fallVy * dt;
    if (!cage.splashed && cage.y + cage.h >= water.top) {
      cage.splashed = true;
      cage.y = water.top - cage.h + 4;
      cage.fallVy = 0;
      rb.drowned = true;
      // ripples on impact
      for (let i = 0; i < 6; i++) {
        water.ripples.push({ x: water.x + water.w * (0.3 + i * 0.08), r: 4, born: now });
      }
      triggerScreenShake(now, 6, 320);
      // give the splash a beat before the "you lost" screen
      tf._robinDropAt = now;
    }
  }
  if (tf._robinDropAt && now - tf._robinDropAt > 700) {
    robinKilled();
    return;
  }
  // keep the ripples alive whether or not the cage fell — Two-Face's cuts
  // also drip water when the cage shakes
  for (const r of water.ripples) r.r += 0.6 * dt;
  water.ripples = water.ripples.filter(r => r.r < 60);

  // sync Robin's sprite to the cage
  rb.x = cage.x + (cage.w - rb.w) / 2;
  rb.y = cage.y + 8;

  if (tf.state === 'idle') {
    const onArenaFloor = (player.y + player.h) <= (tf.floorRow + 1) * TILE;
    if (player.x > tf.triggerX && onArenaFloor) {
      tf.state = 'patrol';
      tf.cutTimer = now + TWOFACE_ROPE_CUT_INTERVAL;
      tf.vx = -Math.abs(TWOFACE_PATROL_SPEED);
    }
    return;
  }

  // === stunned: brief pause after Batman lands a hit
  if (tf.state === 'stunned') {
    if (now >= tf.stunUntil) {
      tf.state = 'patrol';
      // hits push back the rope timer so Batman gets a breather
      tf.cutTimer = now + (enraged ? TWOFACE_ROPE_CUT_INTERVAL_RAGE : TWOFACE_ROPE_CUT_INTERVAL);
      tf.vx = tf.x < (tf.minX + tf.maxX) / 2 ? Math.abs(TWOFACE_PATROL_SPEED) : -Math.abs(TWOFACE_PATROL_SPEED);
    }
    // still processes hits below
  }

  const rageMul = enraged ? TWOFACE_RAGE_SPEED_MUL : 1;

  if (tf.state === 'patrol') {
    tf.x += tf.vx * rageMul * dt;
    if (tf.x < tf.minX) { tf.x = tf.minX; tf.vx = Math.abs(tf.vx); }
    if (tf.x + tf.w > tf.maxX) { tf.x = tf.maxX - tf.w; tf.vx = -Math.abs(tf.vx); }
    tf.facing = tf.vx > 0 ? 1 : -1;

    if (now >= tf.cutTimer) {
      tf.state = 'advancing';
      tf.facing = -1;
    }
  }

  if (tf.state === 'advancing') {
    // walk toward the rope at increased speed
    const targetX = tf.ropeCutX;
    tf.vx = -Math.abs(TWOFACE_ADVANCE_SPEED);
    tf.x += tf.vx * rageMul * dt;
    tf.facing = -1;
    if (tf.x <= targetX) {
      tf.x = targetX;
      tf.state = 'cutting';
      tf.cutStart = now;
    }
  }

  if (tf.state === 'cutting') {
    // shake the cage while he hacks — visual telegraph + a beat of "hurry!"
    cage.shakeUntil = now + 80;
    if (now - tf.cutStart >= TWOFACE_CUT_ANIMATION_MS) {
      // finished a cut: cage drops, back to patrol
      cage.cutsCount++;
      if (cage.cutsCount >= TWOFACE_CAGE_MAX_CUTS) {
        cage.falling = true;
        cage.fallStart = now;
      } else {
        cage.y = cage.initialY + cage.dropPerCut * cage.cutsCount;
      }
      // ripples in the tank as debris hits the water below the swing
      water.ripples.push({ x: water.x + water.w * 0.5, r: 4, born: now });
      tf.state = 'patrol';
      tf.cutTimer = now + (enraged ? TWOFACE_ROPE_CUT_INTERVAL_RAGE : TWOFACE_ROPE_CUT_INTERVAL);
      tf.vx = Math.abs(TWOFACE_PATROL_SPEED);
    }
  }

  // === special-attack bullets: 3 slow-moving coins-turned-projectiles that
  // arc across the arena. Batman jumps over each one.
  for (const b of tf.bullets) {
    if (!b.alive) continue;
    b.x += b.vx * dt;
    if (b.x < TILE || b.x > level.pixelWidth - TILE) { b.alive = false; continue; }
    if (aabbOverlap(player, { x: b.x - 8, y: b.y - 8, w: 16, h: 16 })) {
      b.alive = false;
      hurtPlayer();
      if (state !== 'playing') return;
    }
  }
  tf.bullets = tf.bullets.filter(b => b.alive);

  // === Batman's hits on Two-Face
  const takeHit = (source) => {
    if (now < tf.hitUntil || tf.state === 'stunned' || tf.state === 'coin_flip' || tf.state === 'shooting') return;
    tf.hp--;
    tf.hitUntil = now + TWOFACE_HIT_FLASH_MS;
    score += 400;
    hud.score.textContent = score;
    triggerScreenShake(now, 3, 180);
    if (tf.hp <= 0) {
      tf.alive = false;
      tf.deadAt = now;
      score += 5000;
      hud.score.textContent = score;
      if (source === 'stomp') player.vy = STOMP_BOUNCE;
      return;
    }
    // hit counter: hp goes 5→4→3→2→1. Coin flip on hits 1, 3, 4 (only
    // the 2nd hit just stuns him). On coin hits Two-Face either fires 3
    // bullets or drops a thug + a bird pair.
    const hitsSoFar = tf.maxHp - tf.hp;
    if (hitsSoFar === 1 || hitsSoFar === 3 || hitsSoFar === 4) {
      tf.state = 'coin_flip';
      tf.coinFlipAt = now;
      tf.coinAngle = 0;
      tf.coinResult = null;
      tf.bulletsFired = 0;
    } else {
      tf.stunUntil = now + TWOFACE_STUN_MS;
      tf.state = 'stunned';
    }
    if (source === 'stomp') player.vy = STOMP_BOUNCE;
  };

  // === coin_flip: animate the coin, then commit to bullets or thugs
  if (tf.state === 'coin_flip') {
    tf.coinAngle += 0.32 * dt;
    if (now - tf.coinFlipAt >= TWOFACE_COIN_FLIP_MS) {
      tf.coinResult = Math.random() < 0.5 ? 'bullets' : 'thugs';
      if (tf.coinResult === 'bullets') {
        tf.state = 'shooting';
        tf.bulletsFired = 0;
        tf.nextBulletAt = now;
      } else {
        // 1 thug from Two-Face's side, 1 bird from above
        level.thugs.push({
          x: tf.maxX - TILE, y: tf.floorRow * TILE - 26, w: 24, h: 26,
          minX: tf.minX, maxX: tf.maxX,
          vx: -1.6, alive: true, helmet: false, bossSpawn: true,
        });
        level.birds.push({
          x: tf.maxX - TILE * 2, y: tf.floorRow * TILE - 90,
          baseY: tf.floorRow * TILE - 90,
          w: 26, h: 20,
          minX: tf.minX, maxX: tf.maxX,
          vx: -2.0, alive: true, bossSpawn: true,
        });
        tf.state = 'patrol';
        tf.cutTimer = now + (enraged ? TWOFACE_ROPE_CUT_INTERVAL_RAGE : TWOFACE_ROPE_CUT_INTERVAL);
        tf.vx = -Math.abs(TWOFACE_PATROL_SPEED);
      }
    }
  }

  // === shooting: fire 3 bullets at a slow tempo so each can be jumped
  if (tf.state === 'shooting') {
    if (tf.bulletsFired < TWOFACE_BULLET_COUNT && now >= tf.nextBulletAt) {
      // fire toward Batman
      const dir = (player.x + player.w / 2) < (tf.x + tf.w / 2) ? -1 : 1;
      tf.bullets.push({
        x: tf.x + tf.w / 2, y: tf.y + tf.h * 0.4,
        vx: dir * TWOFACE_BULLET_SPEED,
        alive: true, born: now,
      });
      tf.bulletsFired++;
      tf.nextBulletAt = now + TWOFACE_BULLET_INTERVAL;
      tf.facing = dir;
    }
    if (tf.bulletsFired >= TWOFACE_BULLET_COUNT && now >= tf.nextBulletAt + 500) {
      tf.state = 'patrol';
      tf.cutTimer = now + (enraged ? TWOFACE_ROPE_CUT_INTERVAL_RAGE : TWOFACE_ROPE_CUT_INTERVAL);
      tf.vx = tf.x < (tf.minX + tf.maxX) / 2 ? Math.abs(TWOFACE_PATROL_SPEED) : -Math.abs(TWOFACE_PATROL_SPEED);
    }
  }

  // stomp: allowed in every non-idle state so intercepting a cut is possible
  const stomped = !player.swinging && player.vy > 1 &&
    aabbOverlap(player, { x: tf.x, y: tf.y, w: tf.w, h: 14 }) &&
    (player.y + player.h - tf.y) < STOMP_TOLERANCE;
  if (stomped) takeHit('stomp');
  // body contact hurts Batman only when Two-Face is upright and moving
  if (!player.swinging && tf.state !== 'stunned' && tf.state !== 'cutting' &&
      now >= tf.hitUntil && Date.now() >= invulnUntil &&
      aabbOverlap(player, tf)) {
    hurtPlayer();
  }

  // batarang hits (allowed against a cutting Two-Face — that's the whole point)
  for (const b of batarangs) {
    if (b.phase !== 'out' || !tf.alive) continue;
    if (b.x + 8 > tf.x && b.x - 8 < tf.x + tf.w && b.y + 8 > tf.y && b.y - 8 < tf.y + tf.h) {
      if (now >= tf.hitUntil && tf.state !== 'stunned') {
        takeHit('batarang');
        b.phase = 'back';
      }
    }
  }
}

// ---------------------------------------------------------------
// Mr. Freeze fight (level 3-4)
//
// You don't kill Freeze — you break his machine. He's frozen inside the
// reactor core, invulnerable and unreachable. The reactor vents through 3
// cooling valves; every FREEZE_VENT_INTERVAL one valve OPENS (glows) for a
// window and Freeze fires his cold gun. Dive-stomp the exposed valve to JAM
// it (temp rises). Jam all three -> the core overheats, the ice melts and
// Freeze drops. Arena ice cannons + his cold-gun bursts reuse the snowball
// system (freeze-on-contact, batarang-shatterable).
// ---------------------------------------------------------------
function spawnFreezeColdGun(now) {
  const mf = level.mrfreeze;
  const ox = mf.coreX, oy = mf.coreY - 6;
  const sign = (player.x + player.w / 2) >= ox ? 1 : -1;
  const jammed = mf.valves.filter(v => v.jammed).length;
  const speed = 5.5 + jammed * 0.9;               // angrier as the core heats up
  const lean = [-0.5, 0, 0.5][mf.beamIdx % 3];    // 3-shot fan biased at Batman
  level.snowballs = level.snowballs || [];
  level.snowballs.push({
    x: ox - SNOWBALL_SIZE / 2, y: oy - SNOWBALL_SIZE / 2,
    w: SNOWBALL_SIZE, h: SNOWBALL_SIZE,
    vx: sign * speed + lean * 2.2, vy: -3 + lean * 1.6,
    rot: 0, alive: true, born: now,
  });
  mf.beamIdx++;
}

function updateMrFreeze(dt, now) {
  const mf = level.mrfreeze;

  // Overload -> melt -> the level completes
  if (mf.state === 'overload') {
    if (mf.deadAt && now - mf.deadAt > FREEZE_MELT_MS && state === 'playing') completeLevel();
    return;
  }

  // Freeze wakes up once Batman steps into the arena
  if (mf.state === 'idle') {
    if (player.x > 4 * TILE) {
      mf.state = 'fight';
      mf.nextVentAt = now + 1200;
    }
    return;
  }

  // open a valve to vent + charge the cold gun
  if (mf.exposedIdx < 0 && now >= mf.nextVentAt) {
    const free = mf.valves.map((v, i) => i).filter(i => !mf.valves[i].jammed);
    if (free.length) {
      mf.exposedIdx = free[Math.floor(Math.random() * free.length)];
      mf.exposedUntil = now + FREEZE_VENT_WINDOW;
      mf.beamUntil = now + FREEZE_VENT_WINDOW;
      mf.nextBeamAt = now + FREEZE_BEAM_TELEGRAPH; // telegraph before the first shot
      mf.beamIdx = 0;
    }
  }
  // valve re-seals if the window closes without a jam
  if (mf.exposedIdx >= 0 && now >= mf.exposedUntil) {
    mf.exposedIdx = -1;
    mf.nextVentAt = now + FREEZE_VENT_INTERVAL;
    mf.beamUntil = 0;
  }
  // cold-gun burst during the vent
  if (mf.beamUntil > now && now >= mf.nextBeamAt) {
    spawnFreezeColdGun(now);
    mf.nextBeamAt = now + FREEZE_BEAM_GAP;
  }

  // dive-stomp the exposed valve to jam it
  if (mf.exposedIdx >= 0) {
    const v = mf.valves[mf.exposedIdx];
    const diving = !player.swinging && player.vy > 1.5 &&
      aabbOverlap(player, { x: v.x, y: v.y, w: v.w, h: v.h }) &&
      (player.y + player.h - v.y) < 24;
    if (diving && now > v.hitUntil) {
      v.jammed = true;
      v.hitUntil = now + FREEZE_HIT_FLASH_MS;
      mf.exposedIdx = -1;
      mf.beamUntil = 0;
      player.vy = STOMP_BOUNCE;
      const jammed = mf.valves.filter(x => x.jammed).length;
      mf.temp = jammed / mf.maxValves;
      mf.nextVentAt = now + Math.max(1400, FREEZE_VENT_INTERVAL - jammed * 500);
      score += 600; hud.score.textContent = score;
      triggerScreenShake(now, 5, 200);
      if (mf.valves.every(x => x.jammed)) {
        mf.state = 'overload';
        mf.deadAt = now;
        mf.meltStart = now;
        score += 6000; hud.score.textContent = score;
        triggerScreenShake(now, 9, 700);
      }
    }
  }
}

function updatePlaying(dt) {
  const now = performance.now();

  if (level.chase) { updateChase(dt, now); return; }

  // Batcave: standing by the batcomputer and pressing JUMP opens it. The
  // first time shows Two-Face's file then the weapon choice; afterwards it
  // jumps straight to the choice so the weapon can be swapped after testing.
  // Handled before the jump/movement code so the press opens the PC instead
  // of making Batman hop.
  if (level.cave) {
    const cv = level.cave;
    // Act 2 return: Robin walks in with Batman and follows him around
    // the cave. He runs his own tiny physics loop so he never mirrors
    // Batman's jumps — instead, when the tile ahead is higher than the
    // one under his feet he arcs UP with a normal jump velocity, like
    // Batman would, and gravity pulls him back down onto the step.
    if (cv.act2Return && cv.companion) {
      const comp = cv.companion;
      const targetX = player.x - player.facing * 34;
      const dx = targetX - comp.x;
      const speedCap = 3.6;
      const step = Math.max(-speedCap, Math.min(speedCap, dx * 0.12)) * dt;
      const nextX = comp.x + step;
      // find the tile top under Robin's new center x
      const findFloorY = (worldX) => {
        const tx = Math.max(0, Math.min(level.width - 1, Math.floor(worldX / TILE)));
        for (let ty = 0; ty < level.height; ty++) {
          if (level.solid[ty][tx]) return ty * TILE;
        }
        return level.groundY * TILE;
      };
      comp.x = nextX;
      const cxCenter = nextX + 12;
      const floorHere = findFloorY(cxCenter);
      // vertical physics: gravity + optional step-up hop
      comp.vy = (comp.vy || 0) + 0.5 * dt;
      comp.y += comp.vy * dt;
      const feetY = comp.y + player.h;
      // resolve landing
      if (feetY >= floorHere) {
        comp.y = floorHere - player.h;
        comp.vy = 0;
        comp.onGround = true;
        // upcoming step trigger: if the floor at his forward foot is
        // higher (smaller y) than the floor under him, kick a small jump
        const aheadX = cxCenter + (comp.facing || 1) * 18;
        const floorAhead = findFloorY(aheadX);
        if (floorAhead < floorHere - 2 && Math.abs(step) > 0.3) {
          comp.vy = -6.5; // enough to clear a one-tile step
          comp.onGround = false;
        }
      } else {
        comp.onGround = false;
      }
      if (Math.abs(step) > 0.4) comp.walkPhase += Math.abs(step) * 0.06;
      comp.facing = dx > 0 ? 1 : (dx < 0 ? -1 : comp.facing);
    }
    if (cv.act2Return && cv.alfred && !cv.alfred.triggered) {
      const dx = Math.abs(player.x + player.w / 2 - cv.alfred.x);
      if (dx < 60) {
        cv.alfred.triggered = true;
        cv.alfred.dialogPage = 0;
        player.vx = 0;
        state = 'alfredDialog';
        return;
      }
    }
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
      // Belt UI: cursor starts on the first empty slot (or slot 0 if
      // everything is already equipped). Batman's belt has 2 generic
      // accessory positions; `pickStep` alternates between slot
      // selection and the accessory sub-menu inside 'choice'. Filled
      // slots are pickable too (the player can swap them).
      cv.pickStep = 'slot';
      const empties = emptyBeltSlots();
      cv.slotSel = empties[0] ?? 0;
      cv.weaponSel = 0;
      cv.editingKind = null;
      // Hub visits from Act 3+ open straight into the current-act
      // expediente (Mr. Freeze). Fresh post-2-4 visits still start with
      // the news feed. Act 1 always shows the Two-Face expediente.
      state = caveHubReturn ? 'freezeExpediente' : 'computer';
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
      cv.selStep = 'act';   // always start at the Act picker
      cv.selAct = 1;
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
    const iced = (player.frozenUntil || 0) > now;
    const accelMul = iced ? 0.4 : 1;
    const speedCap = iced ? MAX_SPEED * 0.45 : MAX_SPEED;
    const accel = (player.onGround ? MOVE_ACCEL : AIR_ACCEL) * accelMul;
    if (keys.left && !keys.right) {
      player.vx -= accel * dt;
      player.facing = -1;
    } else if (keys.right && !keys.left) {
      player.vx += accel * dt;
      player.facing = 1;
    } else if (player.onGround) {
      // frozen levels: slippery ice — Batman keeps sliding after letting
      // go but not so much that he's uncontrollable
      player.vx *= level.frozen ? 0.93 : FRICTION;
      if (Math.abs(player.vx) < 0.05) player.vx = 0;
    }
    player.vx = Math.max(-speedCap, Math.min(speedCap, player.vx));

    // walk-cycle distance: only advances while actually moving on the ground,
    // so the legs animate in step with real travel instead of just sliding
    if (player.onGround) player.walkDist = (player.walkDist || 0) + Math.abs(player.vx) * dt;

    // jump: buffered press + coyote time, so a tap always registers even if it
    // lands a frame or two before touching ground / after leaving a ledge.
    // A snow-cannon hit freezes Batman for 5 s: no jumps until it thaws.
    const frozenNow = (player.frozenUntil || 0) > now;
    if (player.onGround) { coyoteUntil = now + COYOTE_MS; player.jumpsUsed = 0; }
    if (!frozenNow && now < jumpBufferUntil && now < coyoteUntil) {
      player.vy = JUMP_VELOCITY;
      player.onGround = false;
      player.jumpsUsed = 1;
      jumpBufferUntil = 0;
      coyoteUntil = 0;
    } else if (!frozenNow && activeChar === 'robin' && now < jumpBufferUntil &&
               !player.onGround && (player.jumpsUsed || 0) < 2) {
      // Robin's aerial double jump — a little weaker than the first, plus a
      // 400 ms somersault animation window the renderer draws through
      player.vy = JUMP_VELOCITY * 0.92;
      player.jumpsUsed = 2;
      player.somersaultUntil = now + 400;
      jumpBufferUntil = 0;
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
  updateSnowCannons(dt, now);
  // Act 3 co-op companion — follows behind the active character
  if (companion) {
    const targetX = player.x - player.facing * 40;
    const dx = targetX - companion.x;
    const speedCap = 4.0;
    const step = Math.max(-speedCap, Math.min(speedCap, dx * 0.12)) * dt;
    companion.x += step;
    companion.y = player.y; // ride the same platform
    if (Math.abs(step) > 0.4) companion.walkPhase += Math.abs(step) * 0.06;
    companion.facing = dx > 0 ? 1 : (dx < 0 ? -1 : companion.facing);
    companion.onGround = player.onGround;
  }

  // Two independent fire buttons so a player who owns both tools can
  // use each one from its own key: X = batarang throw, Z = batigarra
  // grapple. The batigarra never fires mid-swing (that press is
  // already consumed by the rope release). Frozen characters (any
  // active char hit by a snowball / cannon) can't throw either.
  const frozenLocked = (player.frozenUntil || 0) > now;
  if (!frozenLocked && now < shootBufferUntil && playerCanUse('batarang') && now - lastShotAt > SHOOT_COOLDOWN_MS) {
    player.gadget = 'batarang';
    spawnBatarang();
    lastShotAt = now;
    shootBufferUntil = 0;
  }
  if (!frozenLocked && now < grappleBufferUntil && playerCanUse('batigarra') && !player.swinging &&
      now - lastGrappleShotAt > SHOOT_COOLDOWN_MS) {
    player.gadget = 'batigarra';
    spawnBatarang();
    lastGrappleShotAt = now;
    grappleBufferUntil = 0;
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
      // GENERAL RULE: every bat power-up is a checkpoint, in every
      // act. Respawn falls through to this spot on the next hit.
      level.checkpoint = { x: bat.x, y: bat.y };
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
      // Land vertically to count as a stomp. A helmet normally blocks
      // the killing stomp — but a FROZEN enemy always thaws first
      // (Batman lands on the snow cap, not the spikes), so the helmet
      // gate only matters for warm enemies.
      const landing = player.vy > 0 && (player.y + player.h - g.y) < STOMP_TOLERANCE;
      if (landing && g.frozen) {
        g.frozen = false;
        g.vx = (g.vx < 0 ? -1 : 1) * 1.2;
        player.vy = STOMP_BOUNCE;
        score += 50;
        hud.score.textContent = score;
      } else if (landing && !g.helmet) {
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
        if (b.frozen) {
          b.frozen = false;
          b.vx = (b.vx < 0 ? -1 : 1) * 1.7;
          player.vy = STOMP_BOUNCE;
          score += 75;
          hud.score.textContent = score;
        } else {
          b.alive = false;
          player.vy = STOMP_BOUNCE;
          score += 150;
          hud.score.textContent = score;
        }
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
    if (state !== 'playing') return;
  }

  // Two-Face boss fight (carguero)
  if (level.twoface) {
    updateTwoFace(dt, now);
    if (state !== 'playing') return;
  }

  // Mr. Freeze boss fight (cryo-reactor)
  if (level.mrfreeze) {
    updateMrFreeze(dt, now);
    if (state !== 'playing') return;
  }

  // Batcave: ambient bats/drips, and the exit door only lets Batman through
  // once a weapon was chosen (the batcomputer itself is opened on jump, up top)
  if (level.cave) {
    const cv = level.cave;
    updateCaveAmbience(dt, now);
    // exit the cave when Batman reaches the door — Act 1 requires a
    // weapon pick; Act 2 also accepts the armor upgrade; Act 3+ hub
    // visits let Batman leave freely (he already has his arsenal).
    const equipped = cv.weaponChosen || (postTwoFaceReturn && armored) ||
                     caveHubReturn || ownedGadgets.batarang || ownedGadgets.batigarra;
    if (equipped && player.x + player.w >= cv.doorX - 4) {
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

// ---------------------------------------------------------------
// Chase mode (level 2-3): portrait vertical-scroll boat pursuit
// ---------------------------------------------------------------
function enterChaseMode() {
  canvas.width = CHASE_W;
  canvas.height = CHASE_H;
  document.getElementById('hud').style.display = 'none';
  document.getElementById('game-wrap').classList.add('chase-mode');
  document.body.classList.add('chase-active');
  // Rearrange touch controls: ◀ far left, JUMP center, ▶ far right
  const area = document.getElementById('canvas-area');
  const btnL = document.getElementById('btn-left');
  const btnR = document.getElementById('btn-right');
  const btnJ = document.getElementById('btn-jump');
  if (btnL && btnR && btnJ) {
    const wrap = document.createElement('div');
    wrap.id = 'chase-controls';
    wrap.className = 'float-controls';
    wrap.appendChild(btnL);
    wrap.appendChild(btnJ);
    wrap.appendChild(btnR);
    area.appendChild(wrap);
  }
}
function exitChaseMode() {
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  document.getElementById('hud').style.display = '';
  document.getElementById('game-wrap').classList.remove('chase-mode');
  document.body.classList.remove('chase-active');
  // Restore touch controls to original layout
  const wrap = document.getElementById('chase-controls');
  if (wrap) {
    const btnL = document.getElementById('btn-left');
    const btnR = document.getElementById('btn-right');
    const btnJ = document.getElementById('btn-jump');
    const dpadMid = document.querySelector('.dpad-mid');
    const ctrlRight = document.getElementById('controls-right');
    if (dpadMid) { dpadMid.appendChild(btnL); dpadMid.appendChild(btnR); }
    if (ctrlRight) ctrlRight.appendChild(btnJ);
    wrap.remove();
  }
}

function updateChase(dt, now) {
  const ch = level.chase;
  if (ch.finished) return;

  if (ch.introTimer > 0) {
    ch.introTimer -= dt * (1000 / 60);
    return;
  }

  // speed tiers: +20% at 25%, +40% at 50%, +60% at 75%
  const pct = ch.dist / CHASE_TARGET_DIST;
  if (ch.speedTier < CHASE_SPEED_TIERS.length && pct >= CHASE_SPEED_TIERS[ch.speedTier]) {
    ch.speedTier++;
    ch.speedMul = 1 + ch.speedTier * 0.2;
    const taunts = ['¡MÁS RÁPIDO, BATS!', '¡NO VAS A ALCANZARME!', '¡ROBIN ES MÍO!'];
    ch.taunt = { text: taunts[ch.speedTier - 1], until: now + 2200 };
  }
  if (ch.taunt && now >= ch.taunt.until) ch.taunt = null;

  const speed = CHASE_SCROLL_SPEED * ch.speedMul;
  ch.scrollY += speed * dt;
  ch.dist += speed * dt;

  // player movement: left/right to steer the boat
  const accel = 0.7;
  if (keys.left && !keys.right) { player.vx -= accel * dt; player.facing = -1; }
  else if (keys.right && !keys.left) { player.vx += accel * dt; player.facing = 1; }
  else player.vx *= 0.85;
  player.vx = Math.max(-4, Math.min(4, player.vx));

  ch.batBoatX += player.vx * dt;
  ch.batBoatX = Math.max(10, Math.min(CHASE_W - 100, ch.batBoatX));
  player.x = ch.batBoatX + 30;

  // jump (dodge upward — also clears full barriers)
  if (player.onGround && now < jumpBufferUntil) {
    jumpBufferUntil = 0;
    player.vy = CHASE_JUMP_VEL;
    player.onGround = false;
  }
  if (!player.onGround) {
    player.vy += CHASE_GRAVITY * dt;
    player.y += player.vy * dt;
    const deckY = ch.batBoatY - 16;
    if (player.y + player.h >= deckY) {
      player.y = deckY - player.h;
      player.vy = 0;
      player.onGround = true;
    }
  } else {
    player.y = ch.batBoatY - 16 - player.h;
  }

  // spawn obstacles from above — barriers get extra spacing so consecutive
  // jump traps don't overlap in the air (unfair at high speed)
  const lastWasBarrier = ch.lastObstacleType === 'full_barrier' || ch.lastObstacleType === 'half_barrier';
  const gap = (CHASE_OBSTACLE_GAP / ch.speedMul) * (lastWasBarrier ? 1.8 : 1);
  if (ch.scrollY - ch.lastObstacleAt > gap) {
    ch.lastObstacleAt = ch.scrollY;
    const laneX = CHASE_LANE_LEFT + Math.random() * (CHASE_LANE_RIGHT - CHASE_LANE_LEFT);
    // if the last spawn was a barrier, next must be a small obstacle so the
    // player has time to land and re-orient before the next jump
    let kind = Math.random();
    if (lastWasBarrier) kind = Math.random() * 0.60;
    let type;
    if (kind < 0.25) {
      ch.obstacles.push({ type: 'buoy', x: laneX, y: -30, w: 22, h: 22, hit: false });
      type = 'buoy';
    } else if (kind < 0.45) {
      const w = 40 + Math.random() * 30;
      ch.obstacles.push({ type: 'wood', x: laneX - w / 2, y: -20, w, h: 12, hit: false });
      type = 'wood';
    } else if (kind < 0.60) {
      ch.obstacles.push({ type: 'barrel', x: laneX, y: -30, w: 24, h: 24, hit: false });
      type = 'barrel';
    } else if (kind < 0.80) {
      // half-barrier: wooden fence with a gap on one side
      const gapSide = Math.random() < 0.5 ? 'left' : 'right';
      const bw = CHASE_W - CHASE_LANE_LEFT * 2;
      const halfW = bw * 0.55;
      const bx = gapSide === 'left' ? CHASE_LANE_LEFT + bw - halfW : CHASE_LANE_LEFT;
      ch.obstacles.push({ type: 'half_barrier', x: bx, y: -20, w: halfW, h: 14, hit: false, gapSide });
      type = 'half_barrier';
    } else {
      // full barrier: must jump over
      ch.obstacles.push({ type: 'full_barrier', x: CHASE_LANE_LEFT - 10, y: -20, w: CHASE_LANE_RIGHT - CHASE_LANE_LEFT + 50, h: 14, hit: false });
      type = 'full_barrier';
    }
    ch.lastObstacleType = type;
  }

  for (const ob of ch.obstacles) ob.y += speed * dt;
  ch.obstacles = ch.obstacles.filter(ob => ob.y < CHASE_H + 40);

  // Two-Face's boat appears at the top
  const tf = ch.tfBoat;
  if (!tf.visible && now >= tf.showAt) {
    tf.visible = true;
    tf.y = -100;
    tf.targetY = 40;
    tf.hideAt = now + CHASE_TF_VISIBLE_MS;
    tf.grenadesThrown = 0;
  }
  if (tf.visible) {
    tf.y += (tf.targetY - tf.y) * 0.04 * dt;
    const maxGrenades = 1 + ch.speedTier;
    if (tf.grenadesThrown < maxGrenades && tf.y > 20) {
      if (tf.grenadesThrown === 0 || now >= tf.nextGrenadeAt) {
        tf.grenadesThrown++;
        tf.nextGrenadeAt = now + 600;
        const aimX = ch.batBoatX + 45 + (Math.random() - 0.5) * 60;
        ch.grenades.push({
          x: CHASE_W / 2 + (Math.random() - 0.5) * 40, y: tf.y + 80,
          vx: (aimX - CHASE_W / 2) * 0.02,
          vy: CHASE_GRENADE_SPEED * ch.speedMul,
          alive: true, bornAt: now,
        });
      }
    }
    if (now >= tf.hideAt) {
      tf.y -= 3 * dt;
      if (tf.y < -140) {
        tf.visible = false;
        tf.showAt = now + CHASE_TF_APPEAR_INTERVAL / ch.speedMul;
      }
    }
  }

  // grenades fall downward
  for (const g of ch.grenades) {
    if (!g.alive) continue;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    if (g.y >= CHASE_H - 40) {
      g.alive = false;
      ch.explosions.push({ x: g.x, y: g.y, born: now });
      ch.splashes.push({ x: g.x, y: g.y, born: now });
    }
  }
  ch.grenades = ch.grenades.filter(g => g.alive);

  // explosion collision
  for (const ex of ch.explosions) {
    const age = now - ex.born;
    if (age < 300) {
      const r = 35 + age * 0.12;
      const dx = (player.x + player.w / 2) - ex.x;
      const dy = (player.y + player.h / 2) - ex.y;
      if (dx * dx + dy * dy < r * r && Date.now() >= invulnUntil) {
        hurtPlayer();
        if (state !== 'playing') return;
      }
    }
  }
  ch.explosions = ch.explosions.filter(ex => now - ex.born < 600);
  ch.splashes = ch.splashes.filter(sp => now - sp.born < 500);

  // obstacle collision — barriers only hit the boat hull, jump clears them
  const boatHitbox = { x: ch.batBoatX, y: ch.batBoatY - 14, w: 90, h: 28 };
  for (const ob of ch.obstacles) {
    if (ob.hit) continue;
    if (ob.type === 'full_barrier' || ob.type === 'half_barrier') {
      if (!player.onGround) continue;
    }
    if (boatHitbox.x + boatHitbox.w > ob.x && boatHitbox.x < ob.x + ob.w &&
        boatHitbox.y + boatHitbox.h > ob.y && boatHitbox.y < ob.y + ob.h) {
      ob.hit = true;
      if (Date.now() >= invulnUntil) {
        hurtPlayer();
        if (state !== 'playing') return;
      }
    }
  }

  if (ch.dist >= CHASE_TARGET_DIST) {
    ch.finished = true;
    completeLevel();
  }
}

function renderChase(t) {
  const ch = level.chase;
  const CW = CHASE_W, CH = CHASE_H;

  // full-screen water
  const wg = ctx.createLinearGradient(0, 0, 0, CH);
  wg.addColorStop(0, '#051520');
  wg.addColorStop(0.3, '#0a2740');
  wg.addColorStop(1, '#082030');
  ctx.fillStyle = wg;
  ctx.fillRect(0, 0, CW, CH);

  // animated wave pattern (vertical scroll)
  ctx.strokeStyle = 'rgba(127,212,255,0.12)';
  ctx.lineWidth = 1;
  for (let row = 0; row < Math.ceil(CH / 28) + 1; row++) {
    const baseY = (row * 28 + ch.scrollY * 0.8) % (CH + 28) - 14;
    ctx.beginPath();
    for (let x = 0; x <= CW; x += 10) {
      const yy = baseY + Math.sin((x + t / 40 + row * 50) / 35) * 3;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  // foam/current lines
  ctx.strokeStyle = 'rgba(180,220,255,0.08)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const lx = hash01(i * 13.7) * CW;
    const ly = (hash01(i * 7.3) * CH + ch.scrollY * 1.2) % (CH + 80) - 40;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + (hash01(i * 3.1) - 0.5) * 20, ly + 40);
    ctx.stroke();
  }

  // skyline at top (distant, fading)
  const skyH = 80;
  const skyGrad = ctx.createLinearGradient(0, 0, 0, skyH);
  skyGrad.addColorStop(0, 'rgba(10,15,30,0.9)');
  skyGrad.addColorStop(1, 'rgba(10,15,30,0)');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CW, skyH);
  const skyOff = ch.scrollY * 0.05;
  for (let i = 0; i < 12; i++) {
    const bx = (i * 42 - skyOff) % (CW + 42) - 21;
    const bh = 20 + hash01(i * 5.3) * 50;
    ctx.fillStyle = `rgba(15,20,35,${0.5 + hash01(i * 2.1) * 0.4})`;
    ctx.fillRect(bx, skyH - bh, 36, bh);
  }

  // moon (top-right)
  ctx.fillStyle = '#eceadb';
  ctx.beginPath(); ctx.arc(CW - 60, 40, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#051520';
  ctx.beginPath(); ctx.arc(CW - 52, 35, 16, 0, Math.PI * 2); ctx.fill();

  // obstacles
  for (const ob of ch.obstacles) {
    if (ob.type === 'buoy') {
      const bob = Math.sin(t / 300 + ob.x * 0.1) * 2;
      ctx.fillStyle = '#cc3333';
      ctx.beginPath();
      ctx.arc(ob.x + 11, ob.y + 11 + bob, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(ob.x + 7, ob.y + 5 + bob, 8, 4);
      ctx.fillStyle = '#888';
      ctx.fillRect(ob.x + 10, ob.y - 4 + bob, 2, 10);
    } else if (ob.type === 'wood') {
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
      ctx.strokeStyle = '#3a2a0e';
      ctx.lineWidth = 1;
      ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);
      for (let lx = 10; lx < ob.w - 4; lx += 14) {
        ctx.beginPath();
        ctx.moveTo(ob.x + lx, ob.y);
        ctx.lineTo(ob.x + lx, ob.y + ob.h);
        ctx.stroke();
      }
    } else if (ob.type === 'half_barrier') {
      ctx.fillStyle = '#6a4a2a';
      ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
      ctx.strokeStyle = '#4a3018';
      ctx.lineWidth = 2;
      ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);
      for (let px = 8; px < ob.w; px += 16) {
        ctx.fillStyle = '#503a1a';
        ctx.fillRect(ob.x + px, ob.y - 4, 4, ob.h + 4);
      }
      // arrow pointing to the open side
      const arrowX = ob.gapSide === 'left' ? ob.x - 16 : ob.x + ob.w + 6;
      ctx.fillStyle = '#29d985';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ob.gapSide === 'left' ? '◀' : '▶', arrowX, ob.y + 12);
    } else if (ob.type === 'full_barrier') {
      ctx.fillStyle = '#7a4a2a';
      ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
      ctx.strokeStyle = '#5a3018';
      ctx.lineWidth = 2;
      ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);
      for (let px = 12; px < ob.w; px += 18) {
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(ob.x + px, ob.y - 5, 5, ob.h + 5);
      }
      // warning: must jump
      ctx.fillStyle = '#ff5e5e';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⤒ SALTÁ', ob.x + ob.w / 2, ob.y - 6);
    } else {
      ctx.fillStyle = '#555';
      ctx.beginPath();
      ctx.arc(ob.x + 12, ob.y + 12, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ob.x + 12, ob.y + 12, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#c9382a';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TNT', ob.x + 12, ob.y + 15);
    }
  }

  // Two-Face's boat (top, facing down)
  const tf = ch.tfBoat;
  if (tf.visible) {
    const tfBob = Math.sin(t / 280) * 2;
    drawChaseTFBoatVertical(CW / 2 - 40, tf.y + tfBob, t);
  }

  // grenades
  const now = performance.now();
  for (const gr of ch.grenades) {
    if (!gr.alive) continue;
    const rot = (now - gr.bornAt) * 0.01;
    ctx.save();
    ctx.translate(gr.x, gr.y);
    ctx.rotate(rot);
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff6633';
    ctx.beginPath();
    ctx.arc(0, -7, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // explosions
  for (const ex of ch.explosions) {
    const age = now - ex.born;
    const r = 12 + age * 0.15;
    const alpha = Math.max(0, 1 - age / 600);
    ctx.fillStyle = `rgba(255,120,30,${alpha * 0.6})`;
    ctx.beginPath(); ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,220,80,${alpha * 0.4})`;
    ctx.beginPath(); ctx.arc(ex.x, ex.y, r * 0.5, 0, Math.PI * 2); ctx.fill();
  }

  // splashes
  for (const sp of ch.splashes) {
    const age = now - sp.born;
    const alpha = Math.max(0, 1 - age / 500);
    ctx.strokeStyle = `rgba(180,220,255,${alpha * 0.5})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const dist = 10 + age * 0.06;
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(sp.x + Math.cos(ang) * dist, sp.y + Math.sin(ang) * dist);
      ctx.stroke();
    }
  }

  // bat-boat (bottom)
  const boatBob = Math.sin(t / 220) * 2;
  drawChaseBatBoatVertical(ch.batBoatX, ch.batBoatY + boatBob, t);

  // player standing on bat-boat
  if (Date.now() >= invulnUntil || Math.floor(Date.now() / 100) % 2 !== 0) {
    const px = player.x, py = player.y + boatBob;
    ctx.save();
    ctx.translate(px + player.w / 2, py);
    const w = player.w, h = player.h;
    ctx.translate(-w / 2, 0);
    // cape
    ctx.fillStyle = '#0d0f18';
    ctx.beginPath();
    ctx.moveTo(-2, 10); ctx.lineTo(-6, h - 2); ctx.lineTo(w + 6, h - 2); ctx.lineTo(w + 2, 10);
    ctx.closePath(); ctx.fill();
    // cowl
    ctx.fillStyle = '#131722';
    ctx.beginPath();
    ctx.moveTo(3, 10); ctx.lineTo(0, 0); ctx.lineTo(5, 4);
    ctx.lineTo(w / 2, -2); ctx.lineTo(w - 5, 4); ctx.lineTo(w, 0); ctx.lineTo(w - 3, 10);
    ctx.closePath(); ctx.fill();
    // face
    ctx.fillStyle = '#e8b88a';
    ctx.fillRect(5, 10, w - 10, 7);
    // eyes
    ctx.fillStyle = '#fff';
    ctx.fillRect(7, 12, 4, 2.5);
    ctx.fillRect(w - 11, 12, 4, 2.5);
    // suit
    ctx.fillStyle = '#1a1d2e';
    ctx.fillRect(3, 17, w - 6, h - 23);
    // belt
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(4, h - 12, w - 8, 3);
    // legs
    ctx.fillStyle = '#131722';
    ctx.fillRect(5, h - 9, 5, 9);
    ctx.fillRect(w - 10, h - 9, 5, 9);
    ctx.restore();
  }

  // wake behind bat-boat
  ctx.strokeStyle = 'rgba(180,220,255,0.2)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const wy = ch.batBoatY + 22 + i * 14 + boatBob;
    const spread = 8 + i * 12;
    ctx.beginPath();
    ctx.moveTo(ch.batBoatX + 45 - spread, wy);
    ctx.quadraticCurveTo(ch.batBoatX + 45, wy + 5, ch.batBoatX + 45 + spread, wy);
    ctx.stroke();
  }

  // --- HUD overlay ---
  // progress bar (vertical, left side)
  const pct = Math.min(1, ch.dist / CHASE_TARGET_DIST);
  const barX = 12, barY = 80, barH = CH - 160;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(barX, barY, 8, barH);
  ctx.fillStyle = '#29d985';
  const fillH = barH * pct;
  ctx.fillRect(barX, barY + barH - fillH, 8, fillH);
  ctx.strokeStyle = '#8fa3d9';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, 8, barH);
  // bat icon at progress position
  ctx.fillStyle = '#ffd166';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('🦇', barX + 4, barY + barH - fillH - 6);
  // percentage
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`${Math.round(pct * 100)}%`, barX + 4, barY + barH + 14);

  // lives + level (top)
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 0, CW, 28);
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`❤ ${lives}`, 10, 18);
  ctx.textAlign = 'right';
  ctx.fillText(`${level.name}`, CW - 10, 18);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#dbe4ff';
  ctx.fillText('PERSECUCIÓN', CW / 2, 18);

  // Two-Face taunt on speed increase
  if (ch.taunt) {
    const age = now - (ch.taunt.until - 2200);
    const alpha = age < 300 ? age / 300 : age > 1800 ? Math.max(0, 1 - (age - 1800) / 400) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(40,10,50,0.75)';
    ctx.fillRect(CW / 2 - 140, 60, 280, 36);
    ctx.strokeStyle = '#8e3140';
    ctx.lineWidth = 2;
    ctx.strokeRect(CW / 2 - 140, 60, 280, 36);
    ctx.fillStyle = '#ff5e5e';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ch.taunt.text, CW / 2, 83);
    ctx.restore();
  }

  // intro overlay
  if (ch.introTimer > 0) renderChaseIntro(t, ch);

  // level complete
  if (state === 'levelcomplete') {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('¡PERSECUCIÓN', CW / 2, CH / 2 - 20);
    ctx.fillText('COMPLETADA!', CW / 2, CH / 2 + 12);
    ctx.fillStyle = '#29d985';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('Robin ha sido rescatado', CW / 2, CH / 2 + 44);
  }
}

function renderChaseIntro(t, ch) {
  const CW = CHASE_W, CH = CHASE_H;
  const alpha = Math.min(1, ch.introTimer / 500);
  ctx.fillStyle = `rgba(0,0,0,${0.75 * alpha})`;
  ctx.fillRect(0, 0, CW, CH);

  // Two-Face's boat at center with Robin
  const introPhase = (CHASE_INTRO_MS - ch.introTimer) / CHASE_INTRO_MS;
  const tfY = CH * 0.3 - introPhase * 120;
  drawChaseTFBoatVertical(CW / 2 - 40, tfY, t);
  drawRobinSprite(CW / 2 - 2, tfY - 28, 0.55, true, Math.sin(t / 200) * 0.08);

  ctx.fillStyle = 'rgba(8,10,20,0.92)';
  ctx.fillRect(30, CH - 160, CW - 60, 130);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, CH - 160, CW - 60, 130);

  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ACTO 2 — LA PERSECUCIÓN', CW / 2, CH - 136);

  ctx.fillStyle = '#dbe4ff';
  ctx.font = '11px monospace';
  ctx.fillText('¡Dos Caras se lleva a Robin', CW / 2, CH - 110);
  ctx.fillText('en su lancha!', CW / 2, CH - 95);
  ctx.fillText('Esquivá los obstáculos y las', CW / 2, CH - 72);
  ctx.fillText('granadas para alcanzarlo.', CW / 2, CH - 57);

  if (Math.floor(t / 500) % 2 === 0 && ch.introTimer < CHASE_INTRO_MS - 500) {
    ctx.fillStyle = '#29d985';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('PREPARATE...', CW / 2, CH - 38);
  }
}

// Bat-boat seen from above — bow points up (forward)
function drawChaseBatBoatVertical(x, y, t) {
  ctx.save();
  ctx.translate(x, y);
  // hull silhouette
  ctx.fillStyle = '#1a1d2e';
  ctx.beginPath();
  ctx.moveTo(45, -18);  // bow tip
  ctx.lineTo(80, 6);
  ctx.lineTo(85, 14);
  ctx.lineTo(80, 22);   // stern right
  ctx.lineTo(10, 22);   // stern left
  ctx.lineTo(5, 14);
  ctx.lineTo(10, 6);
  ctx.closePath();
  ctx.fill();
  // deck
  ctx.fillStyle = '#242a3e';
  ctx.fillRect(14, 2, 62, 16);
  // cockpit
  ctx.fillStyle = 'rgba(100,180,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(35, 0); ctx.lineTo(55, 0); ctx.lineTo(52, 6); ctx.lineTo(38, 6);
  ctx.closePath();
  ctx.fill();
  // bat fins (sides)
  ctx.fillStyle = '#131722';
  ctx.beginPath();
  ctx.moveTo(6, 10); ctx.lineTo(-4, 16); ctx.lineTo(10, 18);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(84, 10); ctx.lineTo(94, 16); ctx.lineTo(80, 18);
  ctx.closePath();
  ctx.fill();
  // bat-symbol on deck
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(38, 10); ctx.lineTo(41, 7); ctx.lineTo(45, 9);
  ctx.lineTo(49, 7); ctx.lineTo(52, 10);
  ctx.lineTo(50, 13); ctx.lineTo(45, 11); ctx.lineTo(40, 13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Two-Face's boat from above — bow points up, hull is purple/dark
function drawChaseTFBoatVertical(x, y, t) {
  ctx.save();
  ctx.translate(x, y);
  // hull
  ctx.fillStyle = '#2a1a3a';
  ctx.beginPath();
  ctx.moveTo(40, -14);  // bow
  ctx.lineTo(74, 6);
  ctx.lineTo(78, 16);
  ctx.lineTo(72, 26);   // stern right
  ctx.lineTo(8, 26);    // stern left
  ctx.lineTo(2, 16);
  ctx.lineTo(6, 6);
  ctx.closePath();
  ctx.fill();
  // deck
  ctx.fillStyle = '#3a2a4a';
  ctx.fillRect(12, 2, 56, 20);
  // half-face logo
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(40, 12, 6, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(40, 12, 6, Math.PI / 2, -Math.PI / 2);
  ctx.fill();
  // Two-Face sprite (small, standing on deck)
  ctx.save();
  ctx.translate(50, 0);
  ctx.scale(0.4, 0.4);
  // simplified TF body
  ctx.fillStyle = '#242f4d';
  ctx.fillRect(-6, 0, 6, 16);
  ctx.fillStyle = '#5a2d8c';
  ctx.fillRect(0, 0, 6, 16);
  ctx.fillStyle = '#e8b88a';
  ctx.fillRect(-5, -8, 5, 8);
  ctx.fillStyle = '#8e3140';
  ctx.fillRect(0, -8, 5, 8);
  ctx.restore();
  // engine exhaust
  if (Math.floor(t / 100) % 2 === 0) {
    ctx.fillStyle = 'rgba(200,200,200,0.15)';
    ctx.beginPath();
    ctx.arc(40, 30, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function update(dt) {
  if (state === 'playing') {
    updatePlaying(dt);
  } else if (state === 'levelcomplete') {
    stateTimer -= dt * (1000 / 60);
    if (stateTimer <= 0) {
      // Exiting the Batcave through the right-hand door: on a HUB
      // visit (Act 3+ ⌂ button) return Batman to whichever level he was
      // actually playing. On a FRESH post-2-4 arrival — the first time
      // — kick off Act 3 with 3-1. Falls through to level+1 otherwise
      // (Act 1 -> Act 2 flow).
      if (level && level.cave && postTwoFaceReturn) {
        if (caveHubReturn && lastPlayedLevel && !LEVEL_SPECS[lastPlayedLevel].cave) {
          caveHubReturn = false;
          loadLevel(lastPlayedLevel);
          state = 'playing';
          return;
        }
        const idx31 = LEVEL_SPECS.findIndex(s => s.name === '3-1');
        if (idx31 >= 0) {
          loadLevel(idx31);
          state = 'playing';
          return;
        }
      }
      if (levelIndex + 1 < LEVEL_SPECS.length) {
        loadLevel(levelIndex + 1);
        state = 'playing';
      } else if (level.mrfreeze) {
        state = 'win';
        showOverlay('EL NÚCLEO ESTALLÓ',
          `Batman no combatió a Mr. Freeze: reventó su reactor. El núcleo se sobrecalentó, el hielo se derritió y Victor Fries cayó, vencido y a salvo. Entre los restos, un detalle fuera de lugar: un paraguas violeta y un monóculo. Freeze no actuaba solo... alguien le pagaba. Puntaje: ${score} con ${coinsCollected} monedas. El ACTO 4 continúa...`,
          'VOLVER AL MENÚ');
      } else {
        state = 'win';
        const arma = currentGadget === 'batigarra' ? 'batigarra' : 'batarang';
        showOverlay('¡ROBIN RESCATADO!',
          `Batman abordó el carguero de Dos Caras, lo derrotó cara a cara y liberó a Robin. Con la ${arma} en mano, limpió los muelles de Gotham. Puntaje: ${score} con ${coinsCollected} monedas. La historia continúa en el ACTO 3...`,
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

function drawCargueroBackground(t) {
  // dark steel hull interior
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, '#0e1520');
  g.addColorStop(0.5, '#1a2535');
  g.addColorStop(1, '#0c1018');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const par = camera.x * 0.4;

  // riveted metal panels
  ctx.strokeStyle = 'rgba(80,120,160,0.15)';
  ctx.lineWidth = 1;
  const off = -(par % 64);
  for (let x = off - 64; x < CANVAS_W + 64; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
    for (let y = 20; y < CANVAS_H; y += 64) {
      ctx.fillStyle = 'rgba(100,140,180,0.12)';
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 32, y + 32, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // horizontal girders (deck lines)
  ctx.fillStyle = '#2a3a50';
  ctx.fillRect(0, 7 * TILE - camera.y - 4, CANVAS_W, 8);
  ctx.fillRect(0, 11 * TILE - camera.y - 4, CANVAS_W, 8);
  ctx.fillRect(0, 15 * TILE - camera.y - 4, CANVAS_W, 8);

  // portholes with water-light glow
  const pOff = -(par % 260);
  for (let i = -1; i < 5; i++) {
    const px = pOff + i * 260 + 130;
    const py = 4 * TILE - camera.y;
    ctx.strokeStyle = '#3a5570';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(px, py, 20, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#1a3550';
    ctx.beginPath(); ctx.arc(px, py, 17, 0, Math.PI * 2); ctx.fill();
    const flick = 0.5 + 0.3 * Math.sin(t / 500 + i * 1.7);
    const lg = ctx.createRadialGradient(px, py, 2, px, py, 50);
    lg.addColorStop(0, `rgba(100,180,220,${0.15 * flick})`);
    lg.addColorStop(1, 'rgba(100,180,220,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(px, py, 50, 0, Math.PI * 2); ctx.fill();
  }

  // cargo containers in background
  const cOff = -(par * 0.6 % 200);
  const containerColors = ['#8b3a3a', '#3a5c3a', '#3a3a6b', '#6b5a2a'];
  for (let i = 0; i < 5; i++) {
    const cx = cOff + i * 200 + 50;
    const cy = level.groundY * TILE - camera.y - 30 - (i % 2) * 25;
    ctx.fillStyle = containerColors[i % containerColors.length];
    ctx.globalAlpha = 0.25;
    ctx.fillRect(cx, cy, 60, 25);
    ctx.globalAlpha = 1;
  }

  // --- engine room: the high-ceilinged machine hall the top-deck arena
  // sits in. World-anchored, so it only scrolls into view near the top ---
  if (camera.y < 10 * TILE) {
    // ceiling pipes running the full width, with flange joints
    for (const [wy, pr, col] of [[24, 5, '#3d4c60'], [46, 4, '#4a4436']]) {
      const py = wy - camera.y;
      ctx.fillStyle = col;
      ctx.fillRect(0, py - pr, CANVAS_W, pr * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(0, py - pr, CANVAS_W, 2);
      const fOff = -(camera.x % 130);
      ctx.fillStyle = '#222a36';
      for (let x = fOff; x < CANVAS_W + 20; x += 130) {
        ctx.fillRect(x, py - pr - 2, 8, pr * 2 + 4);
      }
    }

    // hanging chains, swaying slightly
    for (const cxw of [4.2 * TILE, 6.6 * TILE]) {
      const sway = Math.sin(t / 640 + cxw) * 3;
      const cx0 = cxw - camera.x;
      ctx.strokeStyle = '#4a5468';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx0, 50 - camera.y);
      ctx.quadraticCurveTo(cx0 + sway, 96 - camera.y, cx0 + sway, 128 - camera.y);
      ctx.stroke();
      ctx.fillStyle = '#5a6478';
      ctx.beginPath(); ctx.arc(cx0 + sway, 132 - camera.y, 5, 0, Math.PI * 2); ctx.fill();
    }

    // port-side boiler tank (behind Robin's post)
    const tx2 = 1.0 * TILE - camera.x, ty2 = 3.0 * TILE - camera.y;
    const tw2 = 2.8 * TILE, th2 = 3 * TILE;
    ctx.fillStyle = '#2a3648';
    ctx.beginPath();
    ctx.ellipse(tx2 + tw2 / 2, ty2, tw2 / 2, 13, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(tx2, ty2, tw2, th2);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 3; i++) {
      const by2 = ty2 + th2 * (i / 3);
      ctx.beginPath(); ctx.moveTo(tx2, by2); ctx.lineTo(tx2 + tw2, by2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120,160,200,0.14)';
    ctx.fillRect(tx2 + 8, ty2, 7, th2);

    // main diesel block behind the starboard half, with working pistons
    const bx = 11 * TILE - camera.x, by = 2.6 * TILE - camera.y;
    const bw2 = 7.5 * TILE, bh2 = (6 - 2.6) * TILE;
    ctx.fillStyle = '#232e3d';
    ctx.fillRect(bx, by, bw2, bh2);
    ctx.fillStyle = '#2c3a4d';
    ctx.fillRect(bx, by, bw2, 8);
    for (let i = 0; i < 4; i++) {
      const cx2 = bx + 26 + i * (bw2 - 52) / 3;
      const stroke = Math.sin(t / 260 + i * 1.6) * 6;
      ctx.fillStyle = '#5a6a80';
      ctx.fillRect(cx2 - 3, by - 28 + stroke, 6, 16);
      ctx.fillStyle = '#39485e';
      ctx.fillRect(cx2 - 10, by - 16, 20, 16);
    }
    // pressure gauges with wandering needles
    for (let i = 0; i < 2; i++) {
      const gx = bx + bw2 * (0.28 + i * 0.44), gy = by + bh2 * 0.5;
      ctx.fillStyle = '#d8d2c2';
      ctx.beginPath(); ctx.arc(gx, gy, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a222e'; ctx.lineWidth = 2; ctx.stroke();
      const ang = -Math.PI * 0.75 + (Math.sin(t / (520 + i * 210)) * 0.5 + 0.5) * Math.PI * 0.9;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + Math.cos(ang) * 8, gy + Math.sin(ang) * 8);
      ctx.strokeStyle = '#c03a2a'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // blinking indicator lights along the block's base
    for (let i = 0; i < 5; i++) {
      const on = Math.sin(t / 340 + i * 2.3) > 0;
      ctx.fillStyle = on ? '#3adf6a' : '#1c4a2a';
      ctx.beginPath(); ctx.arc(bx + 20 + i * 34, by + bh2 - 10, 3, 0, Math.PI * 2); ctx.fill();
    }
    // steam venting off the cylinder heads
    const puff = (t / 1100) % 1;
    ctx.fillStyle = 'rgba(220,230,240,0.10)';
    ctx.beginPath();
    ctx.ellipse(bx + 40 + puff * 22, by - 40 - puff * 26, 9 + puff * 8, 5 + puff * 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bx + bw2 - 50 - puff * 18, by - 46 - puff * 30, 11 + puff * 9, 6 + puff * 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Boss arena ceiling: when the fight camera pushes camera.y negative,
  // world y < 0 becomes the tall dark hall above the engine room. Fill
  // it with a dark base then hang crane rails, girders, chains, pipes
  // and warning lamps so it doesn't read as an empty black void.
  if (camera.y < 0) {
    // dark base fill up to y=0
    const ceilBottom = -camera.y;
    const cg = ctx.createLinearGradient(0, 0, 0, ceilBottom);
    cg.addColorStop(0, '#05070d');
    cg.addColorStop(1, '#101828');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, CANVAS_W, ceilBottom);
    drawArenaCeiling(t, ceilBottom);
  } else {
    // normal narrow ceiling strip drawn on top of the climb
    ctx.fillStyle = '#0a0f18';
    ctx.fillRect(0, 0, CANVAS_W, Math.max(0, 2 * TILE - camera.y - 48));
  }
}

// Overhead structure hanging in the tall boss-arena hall: three riveted
// I-beams, a crane rail, dangling chains + hooks, pipe runs, blinking
// lamps. Drawn only when camera.y is negative (fight camera engaged).
function drawArenaCeiling(t, ceilBottom) {
  const off = -(camera.x * 0.35);

  // ceiling plate seams — thin vertical panel divisions on the deckhead
  ctx.strokeStyle = 'rgba(70,100,140,0.14)';
  ctx.lineWidth = 1;
  for (let x = off - 96; x < CANVAS_W + 96; x += 96) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ceilBottom); ctx.stroke();
  }

  // three I-beam girders spanning the full width
  const beams = [
    { screenY: Math.max(24, ceilBottom * 0.18), h: 14, col: '#3d4c60' },
    { screenY: Math.max(48, ceilBottom * 0.36), h: 12, col: '#354458' },
    { screenY: Math.max(80, ceilBottom * 0.58), h: 12, col: '#2f3d50' },
  ];
  for (const b of beams) {
    if (b.screenY > ceilBottom - 8) continue;
    ctx.fillStyle = b.col;
    ctx.fillRect(0, b.screenY, CANVAS_W, b.h);
    // top / bottom flange highlights
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, b.screenY, CANVAS_W, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, b.screenY + b.h - 2, CANVAS_W, 2);
    // rivets
    ctx.fillStyle = '#0f1420';
    const rOff = -(camera.x % 40);
    for (let x = rOff; x < CANVAS_W + 20; x += 40) {
      ctx.beginPath(); ctx.arc(x, b.screenY + b.h / 2, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  // overhead crane rail with a wandering hook
  const railY = beams[0].screenY - 10;
  if (railY > 6) {
    ctx.fillStyle = '#c9902a';
    ctx.fillRect(0, railY, CANVAS_W, 4);
    ctx.fillStyle = '#8a5f18';
    ctx.fillRect(0, railY + 4, CANVAS_W, 2);
    // trolley
    const trolleyX = (CANVAS_W * 0.5) + Math.sin(t / 2400) * (CANVAS_W * 0.35);
    ctx.fillStyle = '#242c3a';
    ctx.fillRect(trolleyX - 22, railY + 4, 44, 10);
    ctx.fillStyle = '#f6d743';
    ctx.fillRect(trolleyX - 20, railY + 5, 40, 3);
    // hook chain
    ctx.strokeStyle = '#6a5238';
    ctx.lineWidth = 2;
    const hookLen = 90 + Math.sin(t / 900) * 12;
    const hookY = railY + 14 + hookLen;
    ctx.beginPath(); ctx.moveTo(trolleyX, railY + 14); ctx.lineTo(trolleyX, hookY); ctx.stroke();
    ctx.fillStyle = '#8a6a42';
    ctx.beginPath(); ctx.arc(trolleyX, hookY, 5, 0, Math.PI * 2); ctx.fill();
  }

  // horizontal pipe run between beam 1 and beam 2
  const pipeY = (beams[0].screenY + beams[1].screenY) / 2;
  if (pipeY > 12 && pipeY < ceilBottom - 4) {
    ctx.fillStyle = '#4a4436';
    ctx.fillRect(0, pipeY - 3, CANVAS_W, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(0, pipeY - 3, CANVAS_W, 2);
    // flanges every 130px
    const fOff = -(camera.x % 130);
    ctx.fillStyle = '#221e14';
    for (let x = fOff; x < CANVAS_W + 20; x += 130) {
      ctx.fillRect(x, pipeY - 5, 8, 10);
    }
  }

  // dangling chains between the girders
  for (const seed of [0.15, 0.35, 0.6, 0.82]) {
    const cx = (seed * CANVAS_W) + Math.sin(t / (900 + seed * 500)) * 3;
    const c0 = beams[0].screenY + 12;
    const c1 = beams[2].screenY + 12;
    if (c1 < c0) continue;
    ctx.strokeStyle = '#4a5468';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // draw the chain as a series of short segments
    let px = cx, py = c0;
    for (let s = 0; s < 12; s++) {
      const ny = c0 + ((c1 - c0) * (s + 1)) / 12;
      const nx = cx + Math.sin(t / 700 + s * 0.7) * 1.4;
      ctx.moveTo(px, py); ctx.lineTo(nx, ny);
      px = nx; py = ny;
    }
    ctx.stroke();
    // hook at bottom
    ctx.fillStyle = '#5a6478';
    ctx.beginPath(); ctx.arc(px, py + 2, 3, 0, Math.PI * 2); ctx.fill();
  }

  // warning lamps between girder 2 and girder 3
  const lampY = (beams[1].screenY + beams[2].screenY) / 2 + 4;
  if (lampY > 8 && lampY < ceilBottom - 8) {
    for (let i = 0; i < 4; i++) {
      const lx = (i + 0.5) * CANVAS_W / 4;
      const on = Math.sin(t / 320 + i * 1.7) > 0;
      // conduit
      ctx.strokeStyle = '#2a2f3a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(lx, beams[1].screenY + 12); ctx.lineTo(lx, lampY - 4); ctx.stroke();
      // shade
      ctx.fillStyle = '#333a48';
      ctx.beginPath();
      ctx.moveTo(lx - 8, lampY - 4); ctx.lineTo(lx + 8, lampY - 4);
      ctx.lineTo(lx + 5, lampY + 4); ctx.lineTo(lx - 5, lampY + 4);
      ctx.closePath(); ctx.fill();
      // bulb
      ctx.fillStyle = on ? '#ffdb6a' : '#4a3f22';
      ctx.beginPath(); ctx.arc(lx, lampY + 2, 3, 0, Math.PI * 2); ctx.fill();
      // glow
      if (on) {
        const g = ctx.createRadialGradient(lx, lampY + 2, 1, lx, lampY + 2, 40);
        g.addColorStop(0, 'rgba(255,220,120,0.25)');
        g.addColorStop(1, 'rgba(255,220,120,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(lx, lampY + 2, 40, 0, Math.PI * 2); ctx.fill();
      }
    }
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

  // Alfred waits between the entrance and the batcomputer with the news
  if (cv.act2Return && cv.alfred) {
    const ax = cv.alfred.x - camera.x - 12;
    const ay = cv.alfred.y - camera.y;
    drawAlfredSprite(ax, ay, 1.0);
    // "!" prompt over his head until he's talked
    if (!cv.alfred.triggered) {
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('!', ax + 12, ay - 6 + Math.sin(t / 260) * 2);
      ctx.textAlign = 'left';
    }
  }

  // Robin follows Batman around — the actual sprite draw is a few
  // lines further down, after drawCaveComputer, so he doesn't hide
  // behind the Batcomputer as he walks by.
  if (false && cv.companion) {
    /* moved below */
  }

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

  // Robin walks in beside Batman — drawn AFTER the batcomputer so he
  // never disappears behind it. Scaled to Batman's height so he never
  // looks like he's levitating higher.
  if (cv.act2Return && cv.companion) {
    const rx = cv.companion.x - camera.x;
    const ry = cv.companion.y - camera.y;
    const s = player.h / 55;
    const bob = Math.sin(cv.companion.walkPhase) * 1.5;
    const wp = cv.companion.walkPhase;
    const strideL = Math.sin(wp) * 3;
    const strideR = Math.sin(wp + Math.PI) * 3;
    const liftL = Math.max(0, Math.sin(wp)) * 2;
    const liftR = Math.max(0, Math.sin(wp + Math.PI)) * 2;
    ctx.save();
    if (cv.companion.facing < 0) {
      ctx.translate(rx + 12, ry - bob);
      ctx.scale(-1, 1);
      ctx.translate(-12, 0);
    } else {
      ctx.translate(rx - 12, ry - bob);
    }
    drawRobinSprite(0, 0, s, false, 0);
    // walk-cycle legs overlay so his feet visibly move
    ctx.fillStyle = '#1e8449';
    ctx.fillRect(6 * s + strideL, (42 - liftL) * s, 6 * s, 12 * s);
    ctx.fillRect(14 * s + strideR, (42 - liftR) * s, 6 * s, 12 * s);
    ctx.fillStyle = '#146034';
    ctx.fillRect(5 * s + strideL, (52 - liftL) * s, 8 * s, 4 * s);
    ctx.fillRect(13 * s + strideR, (52 - liftR) * s, 8 * s, 4 * s);
    ctx.restore();
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

// Penguin mug-shot for the Batcomputer expediente. Top hat, monocle,
// long pointy nose, purple bowtie, umbrella tucked over the shoulder.
// Same 150 x 170 canvas as drawTwoFacePortrait so the expediente
// layout doesn't need to change.
function drawPenguinPortrait(ctx) {
  // Backplate — dark curtain of the Iceberg Lounge with purple accent
  ctx.fillStyle = '#181420'; ctx.fillRect(0, 20, 150, 150);
  ctx.fillStyle = '#241a30'; ctx.fillRect(0, 20, 150, 10);
  ctx.fillStyle = 'rgba(90,40,120,0.35)';
  for (let i = 0; i < 4; i++) ctx.fillRect(6 + i * 40, 26, 4, 138);

  // Tuxedo — black jacket with tails, wider at the shoulders
  ctx.fillStyle = '#0e0e14';
  ctx.beginPath();
  ctx.moveTo(20, 170); ctx.lineTo(28, 118); ctx.lineTo(60, 108);
  ctx.lineTo(90, 108); ctx.lineTo(122, 118); ctx.lineTo(130, 170);
  ctx.closePath();
  ctx.fill();
  // Lapels — lighter satin
  ctx.fillStyle = '#1e1e28';
  ctx.beginPath();
  ctx.moveTo(60, 108); ctx.lineTo(50, 128); ctx.lineTo(68, 128);
  ctx.lineTo(75, 118); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(90, 108); ctx.lineTo(100, 128); ctx.lineTo(82, 128);
  ctx.lineTo(75, 118); ctx.closePath(); ctx.fill();

  // White shirt showing between the lapels
  ctx.fillStyle = '#e8e8e8';
  ctx.beginPath();
  ctx.moveTo(68, 120); ctx.lineTo(75, 138); ctx.lineTo(82, 120);
  ctx.closePath(); ctx.fill();

  // Purple bowtie
  ctx.fillStyle = '#7a4cb2';
  ctx.beginPath();
  ctx.moveTo(60, 110); ctx.lineTo(75, 118); ctx.lineTo(90, 110);
  ctx.lineTo(88, 126); ctx.lineTo(75, 120); ctx.lineTo(62, 126);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5a3488';
  ctx.beginPath();
  ctx.arc(75, 118, 2.5, 0, Math.PI * 2); ctx.fill();

  // Head — pale chubby oval
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath();
  ctx.ellipse(75, 70, 34, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  // Chubby double chin
  ctx.beginPath();
  ctx.ellipse(75, 100, 28, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Fringe of stringy black hair under the hat brim
  ctx.fillStyle = '#0e0e14';
  ctx.beginPath();
  ctx.moveTo(42, 48); ctx.lineTo(46, 68); ctx.lineTo(50, 50); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(108, 48); ctx.lineTo(104, 68); ctx.lineTo(100, 50); ctx.closePath(); ctx.fill();

  // Top hat — black crown + gray band + wide brim
  ctx.fillStyle = '#0e0e14';
  ctx.fillRect(38, 8, 74, 32);
  ctx.fillStyle = '#4a4a5a';
  ctx.fillRect(38, 32, 74, 4);
  ctx.fillStyle = '#1a1a24';
  ctx.beginPath();
  ctx.ellipse(75, 42, 46, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Hat sheen
  ctx.fillStyle = '#2a2a34';
  ctx.fillRect(44, 12, 6, 22);

  // Long pointy nose — red/orange, beak-like
  ctx.fillStyle = '#c95a3a';
  ctx.beginPath();
  ctx.moveTo(72, 68); ctx.lineTo(56, 86); ctx.lineTo(74, 82); ctx.closePath();
  ctx.fill();
  // Nose highlight
  ctx.fillStyle = '#e07a52';
  ctx.beginPath();
  ctx.moveTo(72, 68); ctx.lineTo(64, 78); ctx.lineTo(73, 76); ctx.closePath();
  ctx.fill();

  // Eyes — small mean eyes
  ctx.fillStyle = '#0a0a10';
  ctx.beginPath(); ctx.arc(62, 64, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(88, 64, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(60.5, 62, 1.5, 1.5);
  ctx.fillRect(86.5, 62, 1.5, 1.5);

  // Monocle around the right eye + chain
  ctx.strokeStyle = '#b8b090';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(88, 64, 10, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(88, 64, 8, Math.PI * 1.1, Math.PI * 1.55); ctx.stroke();
  ctx.strokeStyle = '#b8b090';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(98, 64); ctx.quadraticCurveTo(104, 78, 112, 90); ctx.stroke();

  // Cigarette holder — thin black stick with a yellow ember
  ctx.fillStyle = '#0a0a10';
  ctx.fillRect(78, 90, 22, 2);
  ctx.fillStyle = '#f6d743';
  ctx.fillRect(98, 89, 4, 3);
  // Smoke wisp
  ctx.strokeStyle = 'rgba(220,220,240,0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(103, 88); ctx.quadraticCurveTo(108, 78, 108, 68); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(105, 74); ctx.quadraticCurveTo(112, 68, 114, 60); ctx.stroke();

  // Snarl of a tiny mouth under the nose
  ctx.strokeStyle = '#7a2a1a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(66, 92); ctx.lineTo(78, 90); ctx.stroke();

  // Umbrella — tucked over left shoulder, pointed spike + purple canopy
  // Canopy
  ctx.fillStyle = '#3d1f5c';
  ctx.beginPath();
  ctx.moveTo(28, 130); ctx.lineTo(4, 146); ctx.lineTo(4, 156); ctx.lineTo(26, 148);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7a4cb2';
  ctx.beginPath();
  ctx.moveTo(28, 130); ctx.lineTo(12, 142); ctx.lineTo(18, 146); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#a97fd8';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(28 - i * 4, 132);
    ctx.lineTo(10 - i * 3, 148);
    ctx.stroke();
  }
  // Sharpened spike tip
  ctx.fillStyle = '#c9dff0';
  ctx.beginPath();
  ctx.moveTo(4, 148); ctx.lineTo(-6, 152); ctx.lineTo(4, 156);
  ctx.closePath(); ctx.fill();
  // Handle (crook)
  ctx.strokeStyle = '#0e0e14';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(28, 130); ctx.quadraticCurveTo(38, 138, 34, 152);
  ctx.stroke();
  ctx.strokeStyle = '#3a3a44';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(29, 131); ctx.quadraticCurveTo(37, 138, 33, 151);
  ctx.stroke();

}

// Mr. Freeze mug-shot — the visible face of the Act-3 attack. He is
// the executor; the mecenas (Penguin) is the Act-4 reveal. Chrome
// dome, blue-tinted skin, orange cryo goggles, ridged neck coupling,
// chest cryo canister. Same 150 x 170 canvas as drawTwoFacePortrait
// so the expediente layout doesn't need to change.
function drawFreezePortrait(ctx) {
  // suit/backplate
  ctx.fillStyle = '#4a5b78'; ctx.fillRect(0, 20, 150, 150);
  ctx.fillStyle = '#2c3a52'; ctx.fillRect(0, 20, 150, 10);
  // shoulder pauldrons
  ctx.fillStyle = '#38495f';
  ctx.beginPath();
  ctx.moveTo(4, 128); ctx.lineTo(28, 96); ctx.lineTo(62, 108); ctx.lineTo(62, 170); ctx.lineTo(4, 170); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(146, 128); ctx.lineTo(122, 96); ctx.lineTo(88, 108); ctx.lineTo(88, 170); ctx.lineTo(146, 170); ctx.closePath(); ctx.fill();
  // pale ice-blue face
  ctx.fillStyle = '#c9dff0'; ctx.fillRect(38, 22, 74, 82);
  ctx.beginPath();
  ctx.moveTo(38, 90); ctx.lineTo(38, 104); ctx.quadraticCurveTo(75, 118, 112, 104); ctx.lineTo(112, 90); ctx.closePath();
  ctx.fill();
  // chrome dome + rivets
  ctx.fillStyle = '#dbe4f0';
  ctx.beginPath();
  ctx.ellipse(75, 24, 40, 24, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,110,140,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(38, 24); ctx.lineTo(112, 24); ctx.stroke();
  ctx.fillStyle = '#8a99ac';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.arc(46 + i * 14, 20, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  // frost patches
  ctx.strokeStyle = 'rgba(240,250,255,0.75)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const cxp = 42 + hash01(i * 3.1) * 66, cyp = 40 + hash01(i * 5.7) * 50;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const ang = k * Math.PI / 3;
      ctx.moveTo(cxp, cyp);
      ctx.lineTo(cxp + Math.cos(ang) * 4, cyp + Math.sin(ang) * 4);
    }
    ctx.stroke();
  }
  // cryo goggles
  ctx.fillStyle = '#0e1420'; ctx.fillRect(34, 52, 84, 16);
  ctx.fillStyle = '#ff6b1a'; ctx.fillRect(40, 55, 30, 10);
  ctx.fillStyle = '#ff6b1a'; ctx.fillRect(80, 55, 30, 10);
  ctx.fillStyle = '#ffd166'; ctx.fillRect(48, 57, 12, 6);
  ctx.fillStyle = '#ffd166'; ctx.fillRect(88, 57, 12, 6);
  // stern mouth
  ctx.fillStyle = '#4a637a'; ctx.fillRect(58, 92, 34, 4);
  // life-support neck ring with tubes
  ctx.fillStyle = '#8a99ac'; ctx.fillRect(52, 100, 46, 12);
  ctx.strokeStyle = '#1a222e'; ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(52 + i * 7.5, 100); ctx.lineTo(52 + i * 7.5, 112); ctx.stroke(); }
  // chest cryo canister with frost
  ctx.fillStyle = '#243244'; ctx.fillRect(56, 120, 38, 44);
  ctx.fillStyle = '#3a4c68'; ctx.fillRect(56, 120, 38, 6);
  ctx.fillStyle = '#7fb5c8'; ctx.fillRect(60, 130, 30, 24);
  ctx.strokeStyle = 'rgba(220,240,255,0.65)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(60, 132 + i * 6);
    ctx.lineTo(90, 132 + i * 6);
    ctx.stroke();
  }
  ctx.fillStyle = '#ff5e5e';
  ctx.beginPath(); ctx.arc(75, 152, 3, 0, Math.PI * 2); ctx.fill();
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

  const tx = x + 118;
  ctx.textAlign = 'left';
  if (postTwoFaceReturn) {
    // Post-2-4: the desktop switches to the current villain — Mr.
    // Freeze — the visible face of the freeze. A "MECENAS: ?"
    // tag plants the mystery: someone is bankrolling him. (Act 4
    // will reveal it's Cobblepot.)
    ctx.save();
    ctx.translate(x + 16, y + 16); ctx.scale(0.6, 0.6);
    drawFreezePortrait(ctx);
    ctx.restore();
    ctx.fillStyle = '#7fd4ff'; ctx.font = 'bold 10px monospace'; ctx.fillText('VICTOR FRIES', tx, y + 30);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#ff5e5e'; ctx.fillText('ALIAS: Mr. FREEZE', tx, y + 46);
    ctx.fillStyle = '#ffd166'; ctx.fillText('GOTHAM: -40°C', tx, y + 62);
    ctx.fillStyle = '#29d985'; ctx.fillText('IR A: CENTRO', tx, y + 78);
    ctx.fillStyle = '#7fb5c8'; ctx.fillRect(tx, y + 92, 62, 16);
    ctx.fillStyle = '#0b2438'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
    ctx.fillText('CONGELADO', tx + 31, y + 103);
    // Mystery hint — the mecenas the Batcomputer can't yet identify.
    // Drawn as a blinking dotted line under the main file so the
    // player sees the plot thread from the first cave visit.
    ctx.textAlign = 'left';
    const nowMs = performance.now();
    const blinkMe = Math.floor(nowMs / 500) % 2 === 0;
    ctx.fillStyle = blinkMe ? '#c95a3a' : '#7a2f22';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('MECENAS: ???', tx, y + 122);
    ctx.font = '7px monospace';
    ctx.fillStyle = '#a97fd8';
    ctx.fillText('rastro púrpura — investigar', tx, y + 132);
    return;
  }
  // Pre-2-4: Two-Face wanted file
  ctx.save();
  ctx.translate(x + 16, y + 16); ctx.scale(0.6, 0.6);
  drawTwoFacePortrait(ctx);
  ctx.restore();
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
// Batcave computer overlay. Two flows:
// - Act 1 return: title reads TWO-FACE, portrait + expediente lines
// - Act 2 return: title reads NOTICIAS EN VIVO, the news feed fills the
//   whole screen. A second confirmation opens drawFreezeExpedienteScreen
//   with the Mr. Freeze mug-shot + info.
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
  const title = postTwoFaceReturn
    ? 'BATCOMPUTADORA — NOTICIAS EN VIVO — GCN'
    : 'BATCOMPUTADORA — EXPEDIENTE: TWO-FACE';
  ctx.fillText(title, x + 18, y + 25);

  if (postTwoFaceReturn) {
    // === Full-panel frozen-Gotham news feed ===
    drawFrozenNewsFeed(x + 20, y + 44, w - 40, h - 90, now);
    const blink = Math.floor(now / 400) % 2 === 0;
    ctx.fillStyle = '#ffd166'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    if (blink) ctx.fillText('▶ SALTO / DISPARAR PARA VER EL EXPEDIENTE', CANVAS_W / 2, y + h - 18);
    ctx.textAlign = 'left';
    return;
  }
  // === Act 1 flow: Two-Face portrait + info column ===
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

  const boxX = x + 190, boxY = y + 232, boxW = w - 230, boxH = 68;
  ctx.strokeStyle = 'rgba(127,212,255,0.45)'; ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  ctx.fillStyle = '#7fd4ff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
  ctx.fillText('REGISTRO BATCOMPUTADORA', boxX + 10, boxY + 16);
  ctx.fillStyle = '#e8f0fb'; ctx.font = '12px monospace';
  ctx.fillText(`VIGILANTE: ${(playerName || '—').toUpperCase()}`, boxX + 10, boxY + 34);
  ctx.fillStyle = '#ff5e5e'; ctx.textAlign = 'right';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(`GAME OVERS: ${gameOverCount}`, boxX + boxW - 10, boxY + 30);
  ctx.fillStyle = '#29d985'; ctx.textAlign = 'left'; ctx.font = '11px monospace';
  ctx.fillText(`ACTO 2 ACTIVO · VIDAS: ${lives} · +1 VIDA POR EQUIPARSE`, boxX + 10, boxY + 54);
  ctx.textAlign = 'left';

  const blink = Math.floor(now / 400) % 2 === 0;
  ctx.fillStyle = '#ffd166'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
  if (blink) ctx.fillText('▶ SALTO / DISPARAR PARA CONTINUAR', CANVAS_W / 2, y + h - 18);
}

// Big frozen-Gotham news feed used inside the Batcomputer overlay.
function drawFrozenNewsFeed(sx, sy, sw, sh, now) {
  const sg = ctx.createLinearGradient(0, sy, 0, sy + sh);
  sg.addColorStop(0, '#0d1830');
  sg.addColorStop(0.6, '#264a6a');
  sg.addColorStop(1, '#7fb5c8');
  ctx.fillStyle = sg;
  ctx.fillRect(sx, sy, sw, sh);
  // snowy skyline of Gotham
  const base = sy + sh - 60;
  for (let i = 0; i < 12; i++) {
    const bx = sx + 6 + i * ((sw - 12) / 12);
    const bw = ((sw - 12) / 12) - 3;
    const bh = 40 + hash01(i * 2.3) * 110;
    ctx.fillStyle = '#0f1728';
    ctx.fillRect(bx, base - bh, bw, bh);
    // lit / iced windows
    for (let wy = 0; wy < 4; wy++) {
      for (let wx = 0; wx < 2; wx++) {
        const on = (i + wy + wx) % 3 === 0;
        ctx.fillStyle = on ? '#b8dbef' : '#1a2436';
        ctx.fillRect(bx + 4 + wx * (bw - 10), base - bh + 18 + wy * 24, 6, 10);
      }
    }
    // snow cap
    ctx.fillStyle = '#f0f4ff';
    ctx.fillRect(bx - 2, base - bh - 5, bw + 4, 6);
    // hanging icicle
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(180,220,240,0.85)';
      ctx.beginPath();
      ctx.moveTo(bx + bw - 6, base - bh);
      ctx.lineTo(bx + bw - 3, base - bh + 22);
      ctx.lineTo(bx + bw + 1, base - bh);
      ctx.closePath(); ctx.fill();
    }
  }
  // frozen ground with cracked ice patterns
  ctx.fillStyle = '#c5dcea';
  ctx.fillRect(sx, base, sw, sy + sh - base - 28);
  ctx.strokeStyle = 'rgba(80,110,140,0.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const cx = sx + hash01(i * 7.1) * sw;
    const cy = base + 8 + hash01(i * 4.3) * 24;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 28 + hash01(i * 9) * 40, cy + 6);
    ctx.stroke();
  }
  // falling snow
  for (let i = 0; i < 60; i++) {
    const fx = sx + ((hash01(i * 11.3) * sw + now * 0.04) % sw);
    const fy = sy + ((hash01(i * 4.7) * sh + now * 0.06) % sh);
    ctx.fillStyle = `rgba(240,248,255,${0.35 + 0.5 * hash01(i * 3.9)})`;
    ctx.fillRect(fx, fy, 2, 2);
  }
  // red crawler, clipped to its bar
  const barH = 26, barY = sy + sh - barH;
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(sx, barY, sw, barH);
  ctx.save();
  ctx.beginPath(); ctx.rect(sx, barY, sw, barH); ctx.clip();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'left';
  const crawl = 'ALERTA — GOTHAM CONGELADA — Mr. FREEZE avanza sobre la ciudad a -40°C — POLICÍA COLAPSADA — ¿Quién financia al hombre-hielo? — ';
  const gw = 9, cyc = crawl.length * gw;
  const off = (now / 30) % cyc;
  ctx.fillText(crawl + crawl, sx + 8 - off, barY + 18);
  ctx.restore();
  // GCN LIVE bug
  ctx.fillStyle = '#f6d743';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('GCN LIVE', sx + sw - 12, sy + 24);
  ctx.fillStyle = Math.sin(now / 300) > 0 ? '#ff5e5e' : '#4a1616';
  ctx.beginPath(); ctx.arc(sx + sw - 8, sy + 12, 4, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'left';
  // outline
  ctx.strokeStyle = 'rgba(127,212,255,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx, sy, sw, sh);
}

// State 'freezeExpediente' — kept for internal compatibility; now
// renders the Penguin mug-shot + info page shown
// AFTER the news screen when Batman opens the Batcomputer post-2-4.
function drawFreezeExpedienteScreen(now) {
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
  ctx.fillText('BATCOMPUTADORA — EXPEDIENTE: Mr. FREEZE', x + 18, y + 25);

  // Mr. Freeze portrait — the executor
  ctx.save();
  ctx.translate(x + 30, y + 54); ctx.scale(0.86, 0.86);
  drawFreezePortrait(ctx);
  ctx.restore();

  const lines = [
    ['> IDENTIDAD: DR. VICTOR FRIES — CIENTÍFICO', '#bfe3ff'],
    ['> ALIAS: Mr. FREEZE — TRAJE CRIOGÉNICO', '#bfe3ff'],
    ['> M.O.: CAÑÓN QUE CONGELA TODO A -40°C', '#ff5e5e'],
    ['> DEBILIDAD: NECESITA FRÍO PARA VIVIR', '#bfe3ff'],
    ['> MECENAS: ??? — hilo púrpura, investigando', '#c95a3a'],
    ['> COMPAÑERO: ROBIN — DÚO EN GOTHAM', '#ffd166'],
    ['► RUTA: BATICUEVA → CENTRO · ACTO 3', '#29d985'],
  ];
  ctx.font = '12px monospace'; ctx.textAlign = 'left';
  lines.forEach(([txt, col], i) => { ctx.fillStyle = col; ctx.fillText(txt, x + 190, y + 66 + i * 26); });

  const boxX = x + 190, boxY = y + 232, boxW = w - 230, boxH = 68;
  ctx.strokeStyle = 'rgba(127,212,255,0.45)'; ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  ctx.fillStyle = '#7fd4ff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
  ctx.fillText('REGISTRO BATCOMPUTADORA', boxX + 10, boxY + 16);
  ctx.fillStyle = '#e8f0fb'; ctx.font = '12px monospace';
  ctx.fillText(`VIGILANTE: ${(playerName || '—').toUpperCase()}`, boxX + 10, boxY + 34);
  ctx.fillStyle = '#ff5e5e'; ctx.textAlign = 'right';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(`GAME OVERS: ${gameOverCount}`, boxX + boxW - 10, boxY + 30);
  ctx.fillStyle = '#29d985'; ctx.textAlign = 'left'; ctx.font = '11px monospace';
  ctx.fillText(`ACTO 3 · VIDAS: ${lives} · DÚO OPERATIVO`, boxX + 10, boxY + 54);
  ctx.textAlign = 'left';

  const blink = Math.floor(now / 400) % 2 === 0;
  ctx.fillStyle = '#ffd166'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
  if (blink) ctx.fillText('▶ SALTO / DISPARAR PARA ELEGIR EQUIPO', CANVAS_W / 2, y + h - 18);
}

// full-screen weapon-choice panel (state 'choice')
// Batman's belt is TWO generic accessory slots. Each slot holds one
// item picked from the sub-menu (batarang / batigarra / armor). Slot
// contents are derived from ownership in canonical display order so
// the cursor / painter don't have to store their own state.
const BELT_SLOTS = 2;

function beltContents() {
  const out = [];
  if (ownedGadgets.batarang) out.push('batarang');
  if (ownedGadgets.batigarra) out.push('batigarra');
  if (armored) out.push('armor');
  return out.slice(0, BELT_SLOTS);
}

// Slot indices [0..BELT_SLOTS-1] whose position is still empty. With
// 2 slots this is just the tail of beltContents().
function emptyBeltSlots() {
  const filled = beltContents().length;
  const out = [];
  for (let i = filled; i < BELT_SLOTS; i++) out.push(i);
  return out;
}

// All accessories Batman doesn't own yet — used as the sub-menu list
// after he picks an empty slot. Order matches the belt priority so the
// on-screen icons line up left-to-right consistently.
function availableAccessories() {
  const out = [];
  if (!ownedGadgets.batarang) out.push('batarang');
  if (!ownedGadgets.batigarra) out.push('batigarra');
  if (!armored) out.push('armor');
  return out;
}

// When the player is MODIFYING a filled slot, the accessory currently
// in that slot is offered as a pick too (letting them cancel by
// choosing it again). Used by the accessory sub-menu — see
// chooseCaveWeapon's `editingKind` handoff.
function accessoriesForSubMenu(editingKind) {
  const out = availableAccessories();
  if (editingKind && !out.includes(editingKind)) out.unshift(editingKind);
  return out;
}

// Legacy alias kept so any callers still asking "which weapons?" keep
// working. Weapons are the subset of accessories that aren't armor.
function availableWeapons() {
  return availableAccessories().filter(a => a !== 'armor');
}

function accessoryIcon(kind) {
  return kind === 'batarang' ? '🪃'
       : kind === 'batigarra' ? '🪝'
       : '🛡';
}
function accessoryLabel(kind) {
  return kind === 'batarang' ? 'BATARANG'
       : kind === 'batigarra' ? 'BATIGARRA'
       : 'ARMADURA';
}
function accessoryColor(kind) {
  return kind === 'batarang' ? '#ffe066'
       : kind === 'batigarra' ? '#7fd4ff'
       : '#c95a3a';
}

// Draw one belt slot. `kind` is the item name for a filled slot, or
// null for an empty one. `state` is 'filled' | 'empty-avail'. Cursor
// highlight is drawn on top when selected.
function drawBeltSlot(x, y, w, h, kind, selected) {
  const filled = !!kind;
  ctx.save();
  ctx.fillStyle = filled ? '#0e1420' : 'rgba(20,25,45,0.6)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = selected ? '#ffd166'
    : filled ? '#3a4664' : 'rgba(127,150,200,0.35)';
  ctx.lineWidth = selected ? 3 : 2;
  ctx.strokeRect(x, y, w, h);
  if (selected) { ctx.shadowColor = 'rgba(255,209,102,0.55)'; ctx.shadowBlur = 14; ctx.strokeRect(x, y, w, h); }
  ctx.restore();

  const cx = x + w / 2, cy = y + h / 2 - 6;

  if (!filled) {
    // Empty placeholder: dashed silhouette + question mark
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 2;
    ctx.strokeRect(-36, -26, 72, 52);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('?', 0, 14);
    ctx.restore();
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SLOT VACÍO', cx, y + h - 26);
    ctx.font = '10px monospace';
    ctx.fillText('pulsá para cargar', cx, y + h - 10);
    return;
  }

  const c = accessoryColor(kind);
  ctx.save();
  ctx.translate(cx, cy);
  if (kind === 'batarang') {
    ctx.fillStyle = c;
    ctx.rotate(-0.3);
    ctx.beginPath();
    ctx.moveTo(-32, 0); ctx.quadraticCurveTo(-14, -14, -4, -10); ctx.lineTo(-3, -16);
    ctx.lineTo(-1, -10); ctx.lineTo(1, -10); ctx.lineTo(3, -16); ctx.lineTo(4, -10);
    ctx.quadraticCurveTo(14, -14, 32, 0); ctx.quadraticCurveTo(18, -1, 11, 6);
    ctx.quadraticCurveTo(5, 1, 0, 7); ctx.quadraticCurveTo(-5, 1, -11, 6);
    ctx.quadraticCurveTo(-18, -1, -32, 0); ctx.closePath(); ctx.fill();
  } else if (kind === 'batigarra') {
    ctx.fillStyle = '#6b7280'; ctx.fillRect(-24, -6, 32, 12);
    ctx.fillStyle = '#171920'; ctx.fillRect(-16, 6, 10, 18);
    ctx.strokeStyle = '#c9cdd6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.quadraticCurveTo(30, -18, 46, -30); ctx.stroke();
    ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(46, -36); ctx.lineTo(46, -24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(46, -35); ctx.quadraticCurveTo(38, -33, 40, -26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(46, -35); ctx.quadraticCurveTo(54, -33, 52, -26); ctx.stroke();
    ctx.lineCap = 'butt';
  } else {
    // armor
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(-30, -24); ctx.lineTo(30, -24); ctx.lineTo(27, 20);
    ctx.lineTo(0, 32); ctx.lineTo(-27, 20); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7a2f22';
    ctx.fillRect(-24, -10, 48, 3); ctx.fillRect(-24, -2, 48, 3); ctx.fillRect(-24, 6, 48, 3);
    ctx.fillStyle = '#131722';
    ctx.beginPath();
    ctx.moveTo(-16, -16); ctx.lineTo(-5, -6); ctx.lineTo(-2, -11); ctx.lineTo(0, -6);
    ctx.lineTo(2, -11); ctx.lineTo(5, -6); ctx.lineTo(16, -16);
    ctx.lineTo(8, -3); ctx.lineTo(0, -1); ctx.lineTo(-8, -3);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = c; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
  ctx.fillText(accessoryLabel(kind), cx, y + h - 26);
  ctx.fillStyle = '#9bffcf'; ctx.font = 'bold 10px monospace';
  ctx.fillText('EQUIPADO', cx, y + h - 10);
}

// The accessory picker sub-screen. Same rich cards as the old two-card
// choice: icon + name + 3 description lines, plus a highlight ring on
// the selected one. Only unowned accessories are shown.
const ACCESSORY_LINES = {
  batarang: ['Arma arrojadiza', 'Derriba enemigos a distancia', 'NO controla el balanceo'],
  batigarra: ['Herramienta de movilidad', 'Control total del balanceo', 'NO mata enemigos'],
  armor:    ['Mejora la resistencia', 'Batman arranca siempre grande', 'Aguanta un golpe extra'],
};

function drawAccessoryCard(kind, x, y, selected) {
  const W = 240, H = 260;
  ctx.save();
  if (selected) { ctx.shadowColor = 'rgba(255,209,102,0.55)'; ctx.shadowBlur = 16; }
  ctx.fillStyle = '#0e1420'; ctx.fillRect(x, y, W, H);
  ctx.restore();
  ctx.strokeStyle = selected ? '#ffd166' : '#3a4664'; ctx.lineWidth = selected ? 3 : 2;
  ctx.strokeRect(x, y, W, H);
  // icon at the top of the card
  ctx.save();
  ctx.translate(x + W / 2, y + 92);
  const c = accessoryColor(kind);
  if (kind === 'batarang') {
    ctx.fillStyle = c;
    ctx.rotate(-0.3);
    ctx.beginPath();
    ctx.moveTo(-40, 0); ctx.quadraticCurveTo(-18, -17, -5, -12); ctx.lineTo(-4, -19);
    ctx.lineTo(-1, -12); ctx.lineTo(1, -12); ctx.lineTo(4, -19); ctx.lineTo(5, -12);
    ctx.quadraticCurveTo(18, -17, 40, 0); ctx.quadraticCurveTo(22, -1, 14, 7);
    ctx.quadraticCurveTo(6, 1, 0, 9); ctx.quadraticCurveTo(-6, 1, -14, 7);
    ctx.quadraticCurveTo(-22, -1, -40, 0); ctx.closePath(); ctx.fill();
  } else if (kind === 'batigarra') {
    ctx.fillStyle = '#6b7280'; ctx.fillRect(-30, -8, 40, 16);
    ctx.fillStyle = '#171920'; ctx.fillRect(-20, 8, 12, 22);
    ctx.strokeStyle = '#c9cdd6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.quadraticCurveTo(40, -26, 60, -40); ctx.stroke();
    ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(60, -48); ctx.lineTo(60, -32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(60, -47); ctx.quadraticCurveTo(48, -45, 50, -34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(60, -47); ctx.quadraticCurveTo(72, -45, 70, -34); ctx.stroke();
    ctx.lineCap = 'butt';
  } else {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(-38, -30); ctx.lineTo(38, -30); ctx.lineTo(34, 26);
    ctx.lineTo(0, 40); ctx.lineTo(-34, 26); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7a2f22';
    ctx.fillRect(-30, -12, 60, 4);
    ctx.fillRect(-30, -2, 60, 4);
    ctx.fillRect(-30, 8, 60, 4);
    ctx.fillStyle = '#131722';
    ctx.beginPath();
    ctx.moveTo(-20, -20); ctx.lineTo(-6, -8); ctx.lineTo(-2, -14); ctx.lineTo(0, -8);
    ctx.lineTo(2, -14); ctx.lineTo(6, -8); ctx.lineTo(20, -20);
    ctx.lineTo(10, -4); ctx.lineTo(0, -2); ctx.lineTo(-10, -4);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = c; ctx.font = 'bold 17px monospace'; ctx.textAlign = 'center';
  ctx.fillText(accessoryIcon(kind) + ' ' + accessoryLabel(kind), x + W / 2, y + 168);
  ctx.fillStyle = '#bfd0ea'; ctx.font = '11px monospace';
  (ACCESSORY_LINES[kind] || []).forEach((line, j) => {
    ctx.fillText(line, x + W / 2, y + 196 + j * 17);
  });
}

function drawAccessoryPickerScreen(cv) {
  ctx.fillStyle = 'rgba(2,4,10,0.9)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#ffd166'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`SLOT ${cv.slotSel + 1} — elegí un accesorio`, CANVAS_W / 2, 48);
  ctx.fillStyle = '#9fb4d8'; ctx.font = '12px monospace';
  ctx.fillText(cv.editingKind
    ? 'Elegir otro accesorio DESEQUIPA el actual.'
    : 'Cada accesorio se equipa una sola vez.', CANVAS_W / 2, 72);

  const opts = accessoriesForSubMenu(cv.editingKind);
  const W = 240, gap = 20;
  const totalW = opts.length * W + (opts.length - 1) * gap;
  const startX = (CANVAS_W - totalW) / 2;
  const cardY = 96;
  opts.forEach((kind, k) => {
    drawAccessoryCard(kind, startX + k * (W + gap), cardY, cv.weaponSel === k);
    // Small badge on the card for the accessory currently in the slot
    // so the player knows re-picking it cancels the swap.
    if (kind === cv.editingKind) {
      ctx.fillStyle = 'rgba(20,25,45,0.85)';
      ctx.fillRect(startX + k * (W + gap) + 12, cardY + 12, 88, 20);
      ctx.strokeStyle = '#9bffcf'; ctx.lineWidth = 1;
      ctx.strokeRect(startX + k * (W + gap) + 12, cardY + 12, 88, 20);
      ctx.fillStyle = '#9bffcf'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('ACTUAL', startX + k * (W + gap) + 56, cardY + 26);
    }
  });

  ctx.fillStyle = '#9fb4d8'; ctx.font = '13px monospace'; ctx.textAlign = 'center';
  ctx.fillText('◄ ►  cambiar accesorio      SALTO  cargar en el slot', CANVAS_W / 2, 420);
}

function drawChoiceScreen(now) {
  const cv = level.cave;
  const step = cv.pickStep || 'slot';

  // Accessory sub-menu takes over the whole screen so the descriptions
  // read cleanly. The belt only shows during the slot-selection step.
  if (step === 'accessory') { drawAccessoryPickerScreen(cv); return; }

  ctx.fillStyle = 'rgba(2,4,10,0.82)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#ffd166'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
  ctx.fillText('CINTURÓN DE BATMAN', CANVAS_W / 2, 44);

  const empties = emptyBeltSlots();
  const contents = beltContents();

  // Belt row: BELT_SLOTS cards side-by-side. Slot i is filled if
  // contents[i] exists, empty (and pickable) otherwise.
  const slotW = 220, slotH = 220, gap = 32;
  const totalW = slotW * BELT_SLOTS + gap * (BELT_SLOTS - 1);
  const startX = (CANVAS_W - totalW) / 2;
  const slotY = 90;

  for (let i = 0; i < BELT_SLOTS; i++) {
    const x = startX + i * (slotW + gap);
    const kind = contents[i] || null;
    const selected = cv.slotSel === i;
    drawBeltSlot(x, slotY, slotW, slotH, kind, selected);
  }

  // Hint line at the bottom
  ctx.fillStyle = '#9fb4d8'; ctx.font = '13px monospace'; ctx.textAlign = 'center';
  ctx.fillText('◄ ►  elegir slot      SALTO  modificar', CANVAS_W / 2, 360);
  ctx.fillStyle = '#8fa3d9'; ctx.font = '11px monospace';
  ctx.fillText('Podés cambiar cualquier slot equipado.', CANVAS_W / 2, 380);
}

// Two-step belt pick. Step 1 selects ANY belt slot (empty or filled);
// step 2 shows the accessories that could go into it — every unowned
// item plus the one currently there (so the player can also cancel by
// re-picking it). If only one candidate exists the sub-menu is skipped.
function chooseCaveWeapon() {
  const cv = level.cave;
  const step = cv.pickStep || 'slot';

  if (step === 'slot') {
    // Clamp the cursor to a valid slot; ALL slots are pickable now so
    // empty ones aren't the only choice.
    if (cv.slotSel < 0 || cv.slotSel >= BELT_SLOTS) cv.slotSel = 0;
    // Remember what's currently in the slot so the sub-menu can offer
    // it back and the "cancel" case is a no-op.
    const contents = beltContents();
    cv.editingKind = contents[cv.slotSel] || null;
    const opts = accessoriesForSubMenu(cv.editingKind);
    if (opts.length === 0) {
      // Nothing to pick and nothing here — just close so Batman can leave.
      cv.weaponChosen = cv.weaponChosen || currentGadget || 'batarang';
      state = 'playing';
      return;
    }
    if (opts.length === 1) {
      // Only one candidate: skip the sub-menu (this is the common flow
      // when there's nothing new to swap in either).
      applyAccessoryToSlot(opts[0]);
    } else {
      cv.pickStep = 'accessory';
      cv.weaponSel = Math.max(0, opts.indexOf(cv.editingKind));
      return;
    }
  } else {
    const opts = accessoriesForSubMenu(cv.editingKind);
    if (!opts.length) { cv.pickStep = 'slot'; return; }
    const pick = opts[cv.weaponSel] || opts[0];
    applyAccessoryToSlot(pick);
  }

  if (player.powerState === 'small') setPowerState('big');
  lives++;
  hud.lives.textContent = lives;
  state = 'playing';
}

// Load an accessory (batarang / batigarra / armor) into the currently
// selected belt slot. If the slot was already holding a DIFFERENT
// accessory (cv.editingKind), that one is unequipped first — this is
// the swap path when the player modifies a filled slot. Armor toggles
// a passive body upgrade; weapons route through setGadget so both fire
// buttons stay in sync.
function applyAccessoryToSlot(kind) {
  const cv = level.cave;
  const previous = cv.editingKind || null;
  cv.editingKind = null;
  if (previous && previous !== kind) {
    if (previous === 'armor') armored = false;
    else if (previous === 'batarang') ownedGadgets.batarang = false;
    else if (previous === 'batigarra') ownedGadgets.batigarra = false;
    // If Batman was actively using the tool we just removed, fall back
    // to whatever else he still owns so the on-screen controls sync.
    if (previous !== 'armor' && currentGadget === previous) {
      const fallback = ownedGadgets.batarang ? 'batarang'
                     : ownedGadgets.batigarra ? 'batigarra'
                     : null;
      currentGadget = fallback;
      if (player) player.gadget = fallback;
    }
  }
  cv.weaponChosen = kind;
  if (kind === 'armor') {
    armored = true;
  } else {
    setGadget(kind);
  }
  updateWeaponButton();
  // Persist the whole belt after any pick or swap so the next
  // Continue restores every accessory instead of just the last one.
  if (playerName) saveBeltState(playerName);
}

// Legacy alias — the sub-menu used to be called the "weapon" step so
// keep a shim for any lingering call sites.
function applyWeaponToSlot(kind) { applyAccessoryToSlot(kind); }

// full-screen "replay an Act 1 level" menu (state 'levelselect')
// Two-step level select: first pick an Act, then pick the level inside
// that Act. Prevents the whole grid of Act 1 + Act 2 levels from
// spilling off screen once Two-Face is beaten.
function levelSelectActs() {
  const cv = level.cave;
  const acts = [{ id: 1, name: 'ACTO 1', c: '#ffe066' }];
  if (postTwoFaceReturn) acts.push({ id: 2, name: 'ACTO 2', c: '#7fd4ff' });
  // Act 3 shows up once the player has actually made it to the frozen
  // city (a Batcave hub visit is proof of that).
  if (caveHubReturn) acts.push({ id: 3, name: 'ACTO 3', c: '#c9dff0' });
  acts.push({ id: -1, name: 'SEGUIR', c: '#29d985' });
  return acts;
}
function levelSelectLevels(actId) {
  const re = new RegExp('^' + actId + '-');
  const lvls = LEVEL_SPECS.map((s, i) => ({ i, name: s.name }))
    .filter(o => re.test(o.name));
  lvls.push({ i: -2, name: 'VOLVER' }); // back to act picker
  return lvls;
}
function drawLevelSelectScreen(now) {
  const cv = level.cave;
  cv.selStep = cv.selStep || 'act';
  cv.selAct = cv.selAct || 1;
  const opts = cv.selStep === 'act'
    ? levelSelectActs()
    : levelSelectLevels(cv.selAct);

  ctx.fillStyle = 'rgba(2,4,10,0.85)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#ffd166'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
  const heading = cv.selStep === 'act' ? 'REPETIR NIVEL — ELEGÍ EL ACTO' : `ACTO ${cv.selAct} — ELEGÍ EL NIVEL`;
  ctx.fillText(heading, CANVAS_W / 2, 78);
  ctx.fillStyle = '#9fb4d8'; ctx.font = '12px monospace';
  const subtitle = cv.selStep === 'act'
    ? 'Presioná SALTO para confirmar (SEGUIR se queda en la baticueva)'
    : 'SALTO para jugar el nivel (VOLVER para elegir otro acto)';
  ctx.fillText(subtitle, CANVAS_W / 2, 104);

  const n = opts.length;
  const cw = Math.min(120, (CANVAS_W - 80) / Math.max(1, n) - 18);
  const gap = 18;
  const totalW = n * cw + (n - 1) * gap;
  const x0 = (CANVAS_W - totalW) / 2;
  const cy = 200, ch = 120;
  opts.forEach((o, i) => {
    const cx = x0 + i * (cw + gap);
    const sel = cv.selLevel === i;
    const special = o.i < 0; // SEGUIR or VOLVER
    const isBack = o.i === -2;
    const isResume = o.i === -1;
    ctx.save();
    if (sel) { ctx.shadowColor = 'rgba(255,209,102,0.55)'; ctx.shadowBlur = 16; }
    ctx.fillStyle = isResume ? '#101b16' : isBack ? '#1a1e2a' : '#0e1420';
    ctx.fillRect(cx, cy, cw, ch);
    ctx.restore();
    ctx.strokeStyle = sel ? '#ffd166' : '#3a4664'; ctx.lineWidth = sel ? 3 : 2;
    ctx.strokeRect(cx, cy, cw, ch);
    ctx.fillStyle = isResume ? '#29d985' : isBack ? '#9fb4d8' : (o.c || '#7fd4ff');
    ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
    ctx.fillText(isResume ? '↩' : isBack ? '←' : '▶', cx + cw / 2, cy + 52);
    ctx.fillStyle = isResume ? '#29d985' : isBack ? '#9fb4d8' : (o.c || '#e8f0fb');
    ctx.font = 'bold 18px monospace';
    ctx.fillText(o.name, cx + cw / 2, cy + 90);
  });

  ctx.fillStyle = '#9fb4d8'; ctx.font = '13px monospace'; ctx.textAlign = 'center';
  ctx.fillText('◄ ►  elegir      SALTO  confirmar', CANVAS_W / 2, cy + ch + 46);
}

function chooseReplayLevel() {
  const cv = level.cave;
  cv.selStep = cv.selStep || 'act';
  const opts = cv.selStep === 'act'
    ? levelSelectActs()
    : levelSelectLevels(cv.selAct);
  const opt = opts[cv.selLevel];
  if (!opt) return;
  if (cv.selStep === 'act') {
    if (opt.id === -1) {
      // SEGUIR — stay in the batcave
      cv.selStep = 'act';
      cv.selLevel = 0;
      state = 'playing';
      return;
    }
    // step into the level picker for the chosen act
    cv.selAct = opt.id;
    cv.selStep = 'level';
    cv.selLevel = 0;
    return;
  }
  // level picker
  if (opt.i === -2) {
    // VOLVER — back to the act picker
    cv.selStep = 'act';
    cv.selLevel = 0;
    return;
  }
  if (opt.i >= 0) loadLevel(opt.i);
  state = 'playing';
}

// Touch path only: the jump/shoot buttons buffer a press; arrows are held.
function handleCaveUIInput(now) {
  const cv = level.cave;
  const confirm = now < jumpBufferUntil || now < shootBufferUntil;
  if (state === 'computer') {
    if (confirm) {
      jumpBufferUntil = 0; shootBufferUntil = 0;
      state = postTwoFaceReturn ? 'freezeExpediente' : 'choice';
    }
  } else if (state === 'freezeExpediente') {
    if (confirm) { jumpBufferUntil = 0; shootBufferUntil = 0; state = 'choice'; }
  } else if (state === 'choice') {
    const step = cv.pickStep || 'slot';
    if (step === 'slot') {
      if (keys.left && !keys.right && !cv._navHeld) { cv.slotSel = Math.max(0, cv.slotSel - 1); cv._navHeld = true; }
      else if (keys.right && !keys.left && !cv._navHeld) { cv.slotSel = Math.min(BELT_SLOTS - 1, cv.slotSel + 1); cv._navHeld = true; }
      else if (!keys.left && !keys.right) cv._navHeld = false;
    } else {
      const opts = accessoriesForSubMenu(cv.editingKind);
      if (keys.left && !keys.right && !cv._navHeld) { cv.weaponSel = Math.max(0, cv.weaponSel - 1); cv._navHeld = true; }
      else if (keys.right && !keys.left && !cv._navHeld) { cv.weaponSel = Math.min(opts.length - 1, cv.weaponSel + 1); cv._navHeld = true; }
      else if (!keys.left && !keys.right) cv._navHeld = false;
    }
    if (confirm) { jumpBufferUntil = 0; shootBufferUntil = 0; chooseCaveWeapon(); }
  } else if (state === 'levelselect') {
    const opts = (cv.selStep || 'act') === 'act' ? levelSelectActs() : levelSelectLevels(cv.selAct || 1);
    if (keys.left && !keys.right && !cv._navHeld) { cv.selLevel = Math.max(0, cv.selLevel - 1); cv._navHeld = true; }
    else if (keys.right && !keys.left && !cv._navHeld) { cv.selLevel = Math.min(opts.length - 1, cv.selLevel + 1); cv._navHeld = true; }
    else if (!keys.left && !keys.right) cv._navHeld = false;
    if (confirm) { jumpBufferUntil = 0; shootBufferUntil = 0; chooseReplayLevel(); }
  }
}

function drawBackground(t) {
  if (level.cave) { drawCaveBackground(t); return; }
  if (level.twoface) { drawCargueroBackground(t); return; }
  if (level.mrfreeze) { drawFreezeArenaBackground(t); return; }
  if (level.indoor) { drawWarehouseBackground(t); return; }
  const alt = levelAltitude();
  // vertical parallax: the whole skyline sinks as Batman climbs above it
  const skySink = (level.pixelHeight - CANVAS_H - camera.y) * 0.22;

  // sky gets deeper and clearer with altitude — frozen levels swap to a
  // pale blue-white blizzard sky instead of Gotham's usual purple night
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  if (level.frozen) {
    g.addColorStop(0, '#152a48');
    g.addColorStop(0.55, '#3a6a90');
    g.addColorStop(1, '#7fb5c8');
  } else {
    g.addColorStop(0, mixColor([8, 11, 28], [2, 3, 12], alt));
    g.addColorStop(0.55, mixColor([18, 23, 54], [9, 12, 34], alt));
    g.addColorStop(1, mixColor([35, 42, 77], [19, 24, 56], alt));
  }
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

function tileInsideHouse(tx, ty) {
  // A tile counts as "inside a house" only if it falls in that specific
  // house's rectangle. Iterating on tx alone misidentifies stacked
  // containers at the same columns and made drawTiles skip drawing solid
  // tiles that were still there (catwalks, arena floor) — so Batman
  // walked on invisible surfaces. Check topRow..baseRow-1 too.
  for (const hs of level.houses) {
    if (tx >= hs.x && tx < hs.x + hs.w && ty >= hs.topRow && ty < hs.baseRow) return true;
  }
  return false;
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
      if (tileInsideHouse(tx, ty)) continue;
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

      // Ship's hold (2-4 arena + climb): render as riveted steel deck
      // plates so the floors read as real decks, not just dark tiles.
      const shipInterior = level.twoface != null;
      if (shipInterior) {
        const exposedTop = ty === 0 || !level.solid[ty - 1][tx];
        // steel body with a warmer diesel-lit tone
        ctx.fillStyle = '#3a4658';
        ctx.fillRect(px, py, TILE, TILE);
        // subtle diagonal panel wear
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 4, py + TILE - 4); ctx.lineTo(px + TILE - 4, py + 4);
        ctx.stroke();
        // rivets in the corners
        ctx.fillStyle = '#151b26';
        for (const [rx, ry] of [[4, 4], [TILE - 4, 4], [4, TILE - 4], [TILE - 4, TILE - 4]]) {
          ctx.beginPath(); ctx.arc(px + rx, py + ry, 1.4, 0, Math.PI * 2); ctx.fill();
        }
        if (exposedTop) {
          // painted safety edge on walkable surfaces
          ctx.fillStyle = '#6b7484';
          ctx.fillRect(px, py, TILE, 5);
          ctx.fillStyle = '#f6d743';
          ctx.fillRect(px, py + 3, TILE, 2);
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.fillRect(px, py + 5, TILE, 1);
        }
        // panel seam between tiles
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
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
        // Frozen levels: a snow cap on every walkable ledge so the whole
        // city looks buried and Batman visibly walks on ice.
        if (level.frozen) {
          ctx.fillStyle = '#eaf3ff';
          ctx.beginPath();
          ctx.moveTo(px - 1, py + 5);
          ctx.quadraticCurveTo(px + TILE * 0.25, py - 3, px + TILE * 0.5, py + 2);
          ctx.quadraticCurveTo(px + TILE * 0.75, py - 4, px + TILE + 1, py + 4);
          ctx.lineTo(px + TILE + 1, py + 6);
          ctx.lineTo(px - 1, py + 6);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(160,200,230,0.6)';
          ctx.fillRect(px, py + 6, TILE, 1);
          // occasional icicle
          if (hash01(tx * 2.3 + ty * 7.1) > 0.72) {
            ctx.fillStyle = 'rgba(200,220,240,0.85)';
            const ix = px + hash01(tx * 3.7) * (TILE - 4) + 2;
            const il = 6 + hash01(tx * 5.1) * 10;
            ctx.beginPath();
            ctx.moveTo(ix - 2, py + TILE);
            ctx.lineTo(ix + 2, py + TILE);
            ctx.lineTo(ix, py + TILE + il);
            ctx.closePath(); ctx.fill();
          }
        }
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
  if (level.mrfreeze) return; // the reactor block is painted by drawMrFreeze()
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

    if (hs.style === 'container') {
      drawCargoContainer(hs, x0, wpx, roofY, baseY);
      continue;
    }

    drawHouseFacade(hs, x0, wpx, roofY, baseY);
    if (hs.style === 'gable') drawGableRoof(hs, t, x0, wpx, roofY);
    else if (hs.style === 'terrace') drawTerraceRoof(hs, t, x0, wpx, roofY);
    else drawBrownstoneRoof(hs, t, x0, wpx, roofY);
  }
}

// Frozen-Gotham gable roof: a sharp icy triangular pyramid on top of
// the house. The collision top-row stays FLAT (the walkable ridge is
// still the house's topRow tile), but the visible peak reads as too
// slippery to grip. Long icicles hang from each eave.
function drawGableRoof(hs, t, x0, wpx, roofY) {
  const peakH = 44;
  // pale blue slate roof planes
  ctx.fillStyle = '#3a4c68';
  ctx.beginPath();
  ctx.moveTo(x0 - 4, roofY + 4);
  ctx.lineTo(x0 + wpx / 2, roofY - peakH);
  ctx.lineTo(x0 + wpx + 4, roofY + 4);
  ctx.closePath();
  ctx.fill();
  // horizontal shingle bands so the pyramid has depth
  ctx.strokeStyle = 'rgba(20,30,50,0.55)';
  ctx.lineWidth = 1;
  for (let k = 1; k < 5; k++) {
    const p = k / 5;
    const yy = roofY + 4 - (roofY + 4 - (roofY - peakH)) * p;
    const spanL = x0 - 4 + (x0 + wpx / 2 - (x0 - 4)) * p;
    const spanR = x0 + wpx + 4 - (x0 + wpx + 4 - (x0 + wpx / 2)) * p;
    ctx.beginPath(); ctx.moveTo(spanL, yy); ctx.lineTo(spanR, yy); ctx.stroke();
  }
  // thick snowy cap over both slopes — the "cueste subir" surface
  ctx.fillStyle = '#eaf3ff';
  ctx.beginPath();
  ctx.moveTo(x0 - 6, roofY + 6);
  ctx.lineTo(x0 + wpx / 2, roofY - peakH - 4);
  ctx.lineTo(x0 + wpx + 6, roofY + 6);
  ctx.lineTo(x0 + wpx + 6, roofY + 2);
  ctx.lineTo(x0 + wpx / 2, roofY - peakH);
  ctx.lineTo(x0 - 6, roofY + 2);
  ctx.closePath();
  ctx.fill();
  // frost glint highlight along the ridge
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0 + wpx * 0.25, roofY - peakH / 2);
  ctx.lineTo(x0 + wpx * 0.55, roofY - peakH * 0.85);
  ctx.stroke();
  // hanging icicles under each eave
  ctx.fillStyle = 'rgba(200,220,240,0.9)';
  const icicles = Math.max(2, Math.floor(wpx / 32));
  for (let k = 0; k < icicles; k++) {
    const ix = x0 - 2 + (k + 0.5) * ((wpx + 4) / icicles);
    const il = 10 + hash01(hs.x * 3 + k * 7) * 16;
    ctx.beginPath();
    ctx.moveTo(ix - 3, roofY + 4);
    ctx.lineTo(ix + 3, roofY + 4);
    ctx.lineTo(ix, roofY + 4 + il);
    ctx.closePath();
    ctx.fill();
  }
}

function drawCargoContainer(hs, x0, wpx, roofY, baseY) {
  // pick a stable color per container from its seed
  const palette = [
    ['#a83a2a', '#7a281c', '#c85040'], // rusty red
    ['#2a5f6b', '#1a4451', '#3a7d8a'], // teal blue
    ['#7a5a1e', '#5a4218', '#9c7c2f'], // mustard
    ['#3a5a2a', '#294520', '#4f7538'], // forest green
    ['#4a3a5a', '#33284a', '#5e4b74'], // faded purple
  ];
  const p = palette[Math.floor(hash01(hs.x * 3 + hs.topRow * 7) * palette.length)];
  const hpx = baseY - roofY;

  // body
  ctx.fillStyle = p[0];
  ctx.fillRect(x0, roofY, wpx, hpx);

  // corrugated vertical ribs
  ctx.strokeStyle = p[1];
  ctx.lineWidth = 1;
  for (let x = x0 + 6; x < x0 + wpx; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, roofY + 6);
    ctx.lineTo(x, baseY - 4);
    ctx.stroke();
  }
  // subtle highlight ribs
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let x = x0 + 3; x < x0 + wpx; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, roofY + 6);
    ctx.lineTo(x, baseY - 4);
    ctx.stroke();
  }

  // top rail (walkable surface highlight)
  ctx.fillStyle = p[2];
  ctx.fillRect(x0, roofY, wpx, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x0, roofY + 5, wpx, 1);

  // bottom rail
  ctx.fillStyle = p[1];
  ctx.fillRect(x0, baseY - 4, wpx, 4);

  // corner brackets (steel castings)
  ctx.fillStyle = '#222';
  ctx.fillRect(x0, roofY, 8, 8);
  ctx.fillRect(x0 + wpx - 8, roofY, 8, 8);
  ctx.fillRect(x0, baseY - 8, 8, 8);
  ctx.fillRect(x0 + wpx - 8, baseY - 8, 8, 8);

  // container ID marking — a small yellow rectangle with faux serial
  if (wpx > 100) {
    const idx = x0 + wpx * 0.55;
    const idy = roofY + hpx * 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(idx, idy, 60, 14);
    ctx.fillStyle = '#e8d060';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    const seed = Math.floor(hash01(hs.x + hs.topRow * 13) * 9000 + 1000);
    ctx.fillText(`GCU ${seed}`, idx + 4, idy + 10);
  }

  // doors on the front (right side of container) — two vertical panels
  const doorX = x0 + wpx - 40;
  if (wpx > 60) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(doorX, roofY + 8);
    ctx.lineTo(doorX, baseY - 6);
    ctx.stroke();
    // door handle bars
    ctx.strokeStyle = p[1];
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      const dx = doorX + 8 + i * 14;
      ctx.beginPath();
      ctx.moveTo(dx, roofY + 10);
      ctx.lineTo(dx, baseY - 8);
      ctx.stroke();
    }
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

    // frozen thug: no ice cube — instead a heavier snow cap on his hood
    // + a cool blue tint over the sprite. Draw the tint AFTER the body
    // in an overlay pass at the bottom of this block.
    // (blue tint drawn below after the body sprite)

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

    // Frozen thug overlay: bluish tint over the whole body + a puff of
    // snow piled on his head. Draws AFTER the body so it stays on top.
    if (g.frozen) {
      ctx.fillStyle = 'rgba(120,180,220,0.4)';
      ctx.fillRect(px, gy, g.w, g.h);
      // snow on his head (or on the helmet if there is one)
      const domeTop = gy - (g.helmet ? 12 : 2);
      ctx.fillStyle = '#f0f4ff';
      ctx.beginPath();
      ctx.moveTo(px - 1, domeTop + 6);
      ctx.quadraticCurveTo(px + g.w * 0.35, domeTop - 4, px + g.w * 0.55, domeTop + 2);
      ctx.quadraticCurveTo(px + g.w * 0.75, domeTop - 5, px + g.w + 1, domeTop + 5);
      ctx.lineTo(px + g.w + 1, domeTop + 8);
      ctx.lineTo(px - 1, domeTop + 8);
      ctx.closePath();
      ctx.fill();
      // a couple of snow flecks on his shoulders
      ctx.fillStyle = 'rgba(240,248,255,0.85)';
      ctx.fillRect(px + 2, gy + 10, 3, 2);
      ctx.fillRect(px + g.w - 5, gy + 12, 3, 2);
    }
  }
}

function drawBirds(t) {
  for (const b of level.birds) {
    if (!b.alive) continue;
    const px = b.x - camera.x;
    if (px < -40 || px > CANVAS_W + 40) continue;
    // frozen birds barely flap — cut the wing beat down when iced
    const flap = Math.sin(t / (b.frozen ? 260 : 90) + b.x) * (b.frozen ? 3 : 9);
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

    // Frozen bird: no ice-cube box — a bluish tint that traces the
    // bird's own silhouette + a rounded snow cap sitting on his back,
    // matching the way frozen thugs look on the ground.
    if (b.frozen) {
      ctx.fillStyle = 'rgba(120,180,220,0.45)';
      ctx.beginPath();
      ctx.moveTo(px + b.w / 2, cy);
      ctx.lineTo(px - 8, cy - flap - 2);
      ctx.lineTo(px + b.w * 0.32, cy + 3);
      ctx.lineTo(px + b.w / 2, cy);
      ctx.lineTo(px + b.w + 8, cy - flap - 2);
      ctx.lineTo(px + b.w * 0.68, cy + 3);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(px + b.w / 2, cy, b.w * 0.32, b.h * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      // rounded snow cap on his back
      ctx.fillStyle = '#f0f4ff';
      ctx.beginPath();
      ctx.moveTo(px + b.w * 0.15, cy - 4);
      ctx.quadraticCurveTo(px + b.w * 0.4, cy - 10, px + b.w * 0.5, cy - 5);
      ctx.quadraticCurveTo(px + b.w * 0.65, cy - 11, px + b.w * 0.85, cy - 4);
      ctx.lineTo(px + b.w * 0.85, cy - 1);
      ctx.lineTo(px + b.w * 0.15, cy - 1);
      ctx.closePath();
      ctx.fill();
      // little snow fleck on his tail
      ctx.fillStyle = 'rgba(240,248,255,0.85)';
      ctx.fillRect(px + b.w * 0.35, cy - 2, 2, 2);
      ctx.fillRect(px + b.w * 0.6, cy - 2, 2, 2);
    }
  }
}

function drawCompanion(t) {
  if (!companion) return;
  const cx = companion.x - camera.x;
  const cy = companion.y - camera.y;
  const s = player.h / 55; // Robin scaled to Batman's height, so no levitating
  const bob = companion.onGround ? Math.sin(companion.walkPhase) * 1.5 : 0;
  if (companion.isRobin) {
    // trailing Robin — his intro sprite scaled to match Batman + walk-cycle
    // leg overlay so his feet visibly move as he catches up
    const flipX = companion.facing < 0;
    ctx.save();
    if (flipX) { ctx.translate(cx + 12, cy - bob); ctx.scale(-1, 1); ctx.translate(-12, 0); }
    else { ctx.translate(cx - 12, cy - bob); }
    drawRobinSprite(0, 0, s, false, 0);
    const wp = companion.walkPhase;
    const strideL = Math.sin(wp) * 3;
    const strideR = Math.sin(wp + Math.PI) * 3;
    const liftL = Math.max(0, Math.sin(wp)) * 2;
    const liftR = Math.max(0, Math.sin(wp + Math.PI)) * 2;
    ctx.fillStyle = '#1e8449';
    ctx.fillRect(6 * s + strideL, (42 - liftL) * s, 6 * s, 12 * s);
    ctx.fillRect(14 * s + strideR, (42 - liftR) * s, 6 * s, 12 * s);
    ctx.fillStyle = '#146034';
    ctx.fillRect(5 * s + strideL, (52 - liftL) * s, 8 * s, 4 * s);
    ctx.fillRect(13 * s + strideR, (52 - liftR) * s, 8 * s, 4 * s);
    ctx.restore();
  } else {
    // trailing Batman — a small silhouette matching Batman's height
    const bh = player.h;
    ctx.fillStyle = '#131722';
    ctx.fillRect(cx - 1, cy + 4, 22, bh - 4);
    ctx.fillStyle = '#f0d6b0';
    ctx.fillRect(cx + 3, cy + 6, 14, 6);
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(cx + 5, cy + bh * 0.5, 12, 3);
  }
  // marker so it's clear which one is idle
  ctx.fillStyle = 'rgba(255,209,102,0.85)';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(companion.isRobin ? 'R' : 'B', cx + 10, cy - 4);
  ctx.textAlign = 'left';
}

function drawPlayerRobin(t) {
  if (Date.now() < invulnUntil && Math.floor(Date.now() / 100) % 2 === 0) return;
  const px = player.x - camera.x;
  const py = player.y - camera.y;
  const flipX = player.facing < 0;
  // somersault rotation for Robin's double jump
  const somer = player.somersaultUntil && performance.now() < player.somersaultUntil
    ? (performance.now() - (player.somersaultUntil - 400)) / 400 : 0;
  ctx.save();
  ctx.translate(px + player.w / 2, py + player.h / 2);
  if (somer > 0) ctx.rotate(somer * Math.PI * 2);
  if (flipX) ctx.scale(-1, 1);
  ctx.translate(-12, -player.h / 2);
  drawRobinSprite(0, 0, player.h / 55, false, 0);
  ctx.restore();

  drawFrozenOverlay(px, py, player.w, player.h);
}

// Shared: draw the icy wash + countdown bar over an active player.
// Both Batman and Robin call this after their sprite render so the
// player can SEE that a snowball hit them.
function drawFrozenOverlay(px, py, w, h) {
  const now = performance.now();
  if ((player.frozenUntil || 0) <= now) return;
  ctx.save();
  ctx.fillStyle = 'rgba(140,200,240,0.45)';
  ctx.fillRect(px - 2, py - 2, w + 4, h + 4);
  ctx.strokeStyle = 'rgba(230,245,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px - 2, py - 2, w + 4, h + 4);
  ctx.fillStyle = '#e6f6ff';
  ctx.fillRect(px + 2, py + 3, 3, 3);
  ctx.fillRect(px + w - 5, py + 8, 3, 3);
  ctx.fillRect(px + 4, py + h - 8, 3, 3);
  ctx.fillRect(px + w - 7, py + h - 5, 3, 3);
  const left = (player.frozenUntil - now) / FREEZE_MS;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(px - 2, py - 10, w + 4, 5);
  ctx.fillStyle = '#7fd4ff';
  ctx.fillRect(px - 1, py - 9, (w + 2) * Math.max(0, Math.min(1, left)), 3);
  ctx.restore();
}

function drawPlayer() {
  if (activeChar === 'robin') { drawPlayerRobin(performance.now()); return; }
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

  // Shared frozen wash so Robin and Batman both show it — see
  // drawFrozenOverlay above drawPlayerRobin.
  drawFrozenOverlay(player.x - camera.x, player.y - camera.y, w, h);
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

// Chunky ice-cannon: a thick metal barrel poking out of a heavy iron
// base, painted arctic blue with frozen frost creeping up the sides.
// Muzzle points straight up. Impossible to stomp — the top of the barrel
// glows white while a burst charges.
function drawSnowCannons(t) {
  const cannons = level.snowCannons || [];
  const now = performance.now();
  for (const c of cannons) {
    if (!c.alive) continue;
    const px = c.x - camera.x, py = c.y - camera.y;
    if (px < -c.w - 8 || px > CANVAS_W + 8) continue;
    const midX = px + c.w / 2;
    // Iron base
    ctx.fillStyle = '#1e2a3f';
    ctx.beginPath();
    ctx.moveTo(px - 4, py + c.h);
    ctx.lineTo(px + c.w + 4, py + c.h);
    ctx.lineTo(px + c.w - 4, py + c.h - 18);
    ctx.lineTo(px + 4, py + c.h - 18);
    ctx.closePath();
    ctx.fill();
    // Base plate rivets
    ctx.fillStyle = '#6787ac';
    ctx.fillRect(px + 2, py + c.h - 5, 3, 3);
    ctx.fillRect(px + c.w - 5, py + c.h - 5, 3, 3);
    // Cannon body (main housing)
    ctx.fillStyle = '#2a3a52';
    ctx.fillRect(px + 4, py + 18, c.w - 8, c.h - 34);
    ctx.fillStyle = '#3a5478';
    ctx.fillRect(px + 5, py + 20, 4, c.h - 40);
    // Frost creeping up the housing
    ctx.fillStyle = 'rgba(210,235,255,0.55)';
    ctx.fillRect(px + 4, py + c.h - 22, c.w - 8, 3);
    ctx.fillRect(px + 4, py + c.h - 17, 8, 2);
    ctx.fillRect(px + c.w - 12, py + c.h - 17, 8, 2);
    // Barrel — big, cylindrical, extends above the housing
    ctx.fillStyle = '#39516d';
    ctx.fillRect(midX - 10, py, 20, 22);
    // Barrel highlight (left-side sheen)
    ctx.fillStyle = '#7aa5c7';
    ctx.fillRect(midX - 9, py, 3, 22);
    // Muzzle rim — thick lip
    ctx.fillStyle = '#c9dff0';
    ctx.fillRect(midX - 13, py - 4, 26, 6);
    ctx.fillStyle = '#8faec6';
    ctx.fillRect(midX - 13, py + 1, 26, 1);
    // Muzzle bore (dark circle deep inside)
    ctx.fillStyle = '#0d1725';
    ctx.beginPath();
    ctx.ellipse(midX, py, 8, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Snow cap sitting on top of the muzzle
    ctx.fillStyle = '#f2f7fb';
    ctx.beginPath();
    ctx.arc(midX, py - 3, 10, Math.PI, 0);
    ctx.fill();
    // Glow when charging (last 350 ms before firing OR mid-burst)
    const timeToFire = c.nextFireAt ? c.nextFireAt - now : 9999;
    const midBurst = (c.burstIndex || 0) > 0;
    if ((timeToFire < 350 && timeToFire > 0) || midBurst) {
      const pulse = 0.5 + 0.4 * Math.sin(now / 60);
      ctx.fillStyle = `rgba(180,220,255,${pulse})`;
      ctx.beginPath();
      ctx.arc(midX, py - 2, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e6f6ff';
      ctx.beginPath();
      ctx.arc(midX, py - 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// White snowball with a subtle rotation ring. Tiny trail of icy sparks
// behind it so it reads at speed against the sky. Snowballs are big
// enough that Batman actually has to dodge.
function drawSnowballs(t) {
  const balls = level.snowballs || [];
  for (const b of balls) {
    if (!b.alive) continue;
    const cx = b.x + b.w / 2 - camera.x, cy = b.y + b.h / 2 - camera.y;
    if (cx < -30 || cx > CANVAS_W + 30) continue;
    const r = b.w / 2;
    // trail
    ctx.fillStyle = 'rgba(200,225,240,0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy - Math.sign(b.vy) * 9, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy - Math.sign(b.vy) * 16, 3, 0, Math.PI * 2);
    ctx.fill();
    // ball
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // shading crescent (bottom-right)
    ctx.fillStyle = '#dceaf5';
    ctx.beginPath();
    ctx.arc(cx + 2, cy + 2, r - 1, -Math.PI * 0.15, Math.PI * 0.9);
    ctx.fill();
    ctx.strokeStyle = '#8faec6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // ice sparkle
    ctx.fillStyle = '#7fd4ff';
    ctx.fillRect(cx - 2, cy - r + 2, 3, 3);
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
// Mr. Freeze reactor rendering
// ---------------------------------------------------------------
function drawFreezeArenaBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, '#0a1626'); g.addColorStop(0.6, '#0e2036'); g.addColorStop(1, '#08131f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // gothic pointed arches along the back wall
  ctx.fillStyle = 'rgba(40,70,110,0.22)';
  const archW = 120;
  for (let i = 0; i <= CANVAS_W / archW + 1; i++) {
    const ax = i * archW + 20;
    ctx.beginPath();
    ctx.moveTo(ax, CANVAS_H); ctx.lineTo(ax, 190);
    ctx.quadraticCurveTo(ax + archW / 2, 60, ax + archW - 24, 190);
    ctx.lineTo(ax + archW - 24, CANVAS_H); ctx.closePath(); ctx.fill();
  }
  // frozen mist near the floor
  ctx.fillStyle = 'rgba(150,200,240,0.06)';
  ctx.fillRect(0, CANVAS_H - 120, CANVAS_W, 120);
  // ceiling frost + hanging icicles
  ctx.fillStyle = 'rgba(150,200,240,0.15)'; ctx.fillRect(0, 0, CANVAS_W, 10);
  ctx.fillStyle = 'rgba(180,220,255,0.32)';
  for (let i = 0; i < CANVAS_W; i += 44) {
    const h = 10 + hash01(i * 1.7) * 26;
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 8, 0); ctx.lineTo(i + 4, h); ctx.closePath(); ctx.fill();
  }
}

function drawMrFreeze(t) {
  const mf = level.mrfreeze;
  if (!mf) return;
  const now = performance.now();
  const melting = mf.state === 'overload';
  const meltT = melting ? Math.min(1, (now - mf.meltStart) / FREEZE_MELT_MS) : 0;
  const heat = melting ? 1 : mf.temp;               // 0 = frozen blue, 1 = overheated

  const x0 = mf.reactorX - camera.x;
  const y0 = mf.reactorY - camera.y;                // reactor top face
  const w = mf.reactorW, h = mf.reactorH;
  const cx = mf.coreX - camera.x, cy = mf.coreY - camera.y;

  // --- reactor housing: iron + ice ---
  const bg = ctx.createLinearGradient(x0, y0, x0, y0 + h);
  bg.addColorStop(0, '#2a3d55'); bg.addColorStop(1, '#131f2b');
  ctx.fillStyle = bg; ctx.fillRect(x0, y0, w, h);
  // iron ribs
  ctx.strokeStyle = 'rgba(8,14,20,0.7)'; ctx.lineWidth = 3;
  for (let gx = x0 + 22; gx < x0 + w; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, y0); ctx.lineTo(gx, y0 + h); ctx.stroke(); }
  // ice sheath (recedes as the core melts)
  ctx.fillStyle = `rgba(150,210,240,${0.30 - meltT * 0.26})`;
  ctx.fillRect(x0, y0, w, h);
  // top parapet (the walkable face) + gothic spikes
  ctx.fillStyle = '#3a4f68'; ctx.fillRect(x0, y0, w, 6);
  ctx.fillStyle = '#516986'; ctx.fillRect(x0, y0, w, 2);
  ctx.fillStyle = '#22303f';
  for (let sx = x0 + 8; sx < x0 + w - 6; sx += 30) {
    ctx.beginPath(); ctx.moveTo(sx, y0); ctx.lineTo(sx + 10, y0); ctx.lineTo(sx + 5, y0 - 12); ctx.closePath(); ctx.fill();
  }

  // --- core chamber with Freeze frozen inside ---
  const coreR = 40;
  const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, coreR * 2);
  const gc = melting ? `rgba(255,140,60,${0.5})` : `rgba(90,180,255,${0.45 + heat * 0.2})`;
  glow.addColorStop(0, gc); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, coreR * 2, 0, Math.PI * 2); ctx.fill();
  // chamber ring
  ctx.fillStyle = melting ? '#3a2418' : '#123049';
  ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = melting ? '#c8703a' : '#2f6f9f'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.stroke();
  // Freeze silhouette inside the core: domed helmet + goggle glow
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, coreR - 5, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#cfe6f2';
  ctx.beginPath(); ctx.arc(cx, cy + 10, 22, Math.PI, 0); ctx.fill();          // shoulders
  ctx.beginPath(); ctx.arc(cx, cy - 4, 14, 0, Math.PI * 2); ctx.fill();       // helmet dome
  ctx.fillStyle = melting ? '#ff5a3a' : '#37e0ff';                            // goggles
  ctx.fillRect(cx - 9, cy - 6, 6, 5); ctx.fillRect(cx + 3, cy - 6, 6, 5);
  if (melting) {                                                              // sagging as he melts
    ctx.fillStyle = 'rgba(120,180,210,0.5)';
    ctx.fillRect(cx - 20, cy + meltT * 14, 40, 10);
  }
  ctx.restore();
  // frost crust on the chamber that cracks off while melting
  if (meltT < 0.7) {
    ctx.strokeStyle = `rgba(200,235,255,${0.5 - meltT * 0.5})`; ctx.lineWidth = 2;
    for (let a = 0; a < 5; a++) {
      const ang = a * 1.3 + 0.3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * (coreR - 8), cy + Math.sin(ang) * (coreR - 8));
      ctx.lineTo(cx + Math.cos(ang + 0.4) * coreR, cy + Math.sin(ang + 0.4) * coreR);
      ctx.stroke();
    }
  }

  // --- cooling valves on the top face ---
  mf.valves.forEach((v, i) => {
    const vx = v.cx - camera.x, vy = v.y - camera.y + v.h;    // base sits on the top face
    const exposed = i === mf.exposedIdx && !v.jammed;
    // valve stack (pipe rising from the reactor top)
    ctx.fillStyle = v.jammed ? '#243444' : '#33506a';
    ctx.fillRect(vx - 12, vy - v.h, 24, v.h);
    ctx.fillStyle = v.jammed ? '#1a2836' : '#41627f';
    ctx.fillRect(vx - 15, vy - v.h - 6, 30, 8);              // cap flange
    if (v.jammed) {
      // sealed + frosted over, a red "jammed" bolt
      ctx.fillStyle = 'rgba(200,235,255,0.5)';
      ctx.fillRect(vx - 15, vy - v.h - 6, 30, 4);
      ctx.fillStyle = '#ff5a5a';
      ctx.beginPath(); ctx.arc(vx, vy - v.h + 2, 4, 0, Math.PI * 2); ctx.fill();
    } else if (exposed) {
      // venting: pulsing orange glow + steam + a dive chevron above
      const pulse = 0.55 + 0.45 * Math.sin(now / 120);
      const eg = ctx.createRadialGradient(vx, vy - v.h, 2, vx, vy - v.h, 30);
      eg.addColorStop(0, `rgba(255,180,90,${pulse})`); eg.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(vx, vy - v.h, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,210,120,${pulse})`;
      ctx.fillRect(vx - 8, vy - v.h - 2, 16, 6);
      // steam plume
      ctx.fillStyle = 'rgba(220,240,255,0.35)';
      for (let s = 0; s < 3; s++) {
        const sy = vy - v.h - 10 - ((now / 6 + s * 40) % 60);
        ctx.beginPath(); ctx.arc(vx + Math.sin(now / 200 + s) * 6, sy, 5 + s, 0, Math.PI * 2); ctx.fill();
      }
      // dive chevron
      ctx.fillStyle = `rgba(255,209,102,${pulse})`;
      const chy = vy - v.h - 30 - Math.sin(now / 200) * 3;
      ctx.beginPath(); ctx.moveTo(vx - 9, chy); ctx.lineTo(vx + 9, chy); ctx.lineTo(vx, chy + 11); ctx.closePath(); ctx.fill();
    } else {
      // closed, cold cap
      ctx.fillStyle = '#7fd0ec';
      ctx.beginPath(); ctx.arc(vx, vy - v.h + 1, 3, 0, Math.PI * 2); ctx.fill();
    }
  });

  // --- cold-gun muzzle flash while venting ---
  if (mf.beamUntil > now) {
    const mg = ctx.createRadialGradient(cx, cy, 2, cx, cy, 22);
    mg.addColorStop(0, 'rgba(160,230,255,0.7)'); mg.addColorStop(1, 'rgba(160,230,255,0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(cx, cy - 6, 22, 0, Math.PI * 2); ctx.fill();
  }

  // --- melt: steam gushes and the core cracks open ---
  if (melting) {
    ctx.fillStyle = 'rgba(240,250,255,0.4)';
    for (let s = 0; s < 8; s++) {
      const sy = cy - ((now / 4 + s * 30) % 140);
      ctx.beginPath(); ctx.arc(cx + Math.sin(now / 150 + s) * 26, sy, 8 + s, 0, Math.PI * 2); ctx.fill();
    }
  }

  // --- TEMP gauge (top-center HUD) ---
  const gw = 220, gx = (CANVAS_W - gw) / 2, gy = 30;
  ctx.fillStyle = 'rgba(8,16,26,0.8)'; ctx.fillRect(gx - 4, gy - 4, gw + 8, 24);
  ctx.strokeStyle = '#3a5470'; ctx.lineWidth = 2; ctx.strokeRect(gx - 4, gy - 4, gw + 8, 24);
  const tg = ctx.createLinearGradient(gx, 0, gx + gw, 0);
  tg.addColorStop(0, '#4aa8ff'); tg.addColorStop(0.5, '#c8d64a'); tg.addColorStop(1, '#ff5a3a');
  ctx.fillStyle = '#10202e'; ctx.fillRect(gx, gy, gw, 16);
  ctx.fillStyle = tg; ctx.fillRect(gx, gy, gw * (melting ? 1 : mf.temp), 16);
  // valve ticks
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  for (let i = 1; i < mf.maxValves; i++) { const tx = gx + gw * (i / mf.maxValves); ctx.beginPath(); ctx.moveTo(tx, gy); ctx.lineTo(tx, gy + 16); ctx.stroke(); }
  ctx.fillStyle = '#cfe0ff'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`NÚCLEO — ${mf.valves.filter(v => v.jammed).length}/${mf.maxValves} VÁLVULAS TRABADAS`, CANVAS_W / 2, gy + 34);
  ctx.textAlign = 'left';
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

// Robin, roped to a steel post beside the engine room's port boiler.
// His hearts float overhead: they are the mission's real health bar.
// Water tank + splash ripples on the arena's left side
function drawWaterTank(w, t) {
  const x0 = w.x - camera.x, top = w.top - camera.y;
  const floor = w.floorY - camera.y;
  const wpx = w.w, hpx = floor - top;

  // steel tank body
  ctx.fillStyle = '#2a3648';
  ctx.fillRect(x0, top, wpx, hpx);
  ctx.strokeStyle = '#0d1420';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, top, wpx, hpx);
  // rivets
  ctx.fillStyle = '#0d1420';
  for (const rx of [x0 + 4, x0 + wpx - 4]) {
    for (let y = top + 6; y < floor - 4; y += 12) {
      ctx.beginPath(); ctx.arc(rx, y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  // water surface with animated waves
  const waveOff = Math.sin(t / 320) * 2;
  ctx.fillStyle = '#1a4c78';
  ctx.fillRect(x0 + 3, top + 2, wpx - 6, hpx - 4);
  ctx.fillStyle = 'rgba(120,180,220,0.35)';
  ctx.beginPath();
  ctx.moveTo(x0 + 3, top + 5 + waveOff);
  for (let i = 0; i <= wpx; i += 6) {
    ctx.lineTo(x0 + 3 + i, top + 5 + Math.sin(t / 260 + i * 0.3) * 2);
  }
  ctx.lineTo(x0 + wpx - 3, top + 12);
  ctx.lineTo(x0 + 3, top + 12);
  ctx.closePath();
  ctx.fill();
  // ripple rings
  for (const r of w.ripples) {
    const age = r.r / 60;
    ctx.strokeStyle = `rgba(200,230,255,${0.5 * (1 - age)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(r.x - camera.x, top + 6, r.r, r.r * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // "H2O" label / danger stripe
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(x0 + 6, floor - 12, wpx - 12, 6);
  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('¡PELIGRO!', x0 + wpx / 2, floor - 4);
  ctx.textAlign = 'left';
}

// The rope, the cage, and Robin sprite inside it. Rope segments show
// which cuts are already through.
function drawRobinCage(tf, t) {
  const cage = tf.cage;
  const rb = tf.robin;
  const anchorX = tf.ropeAnchorX - camera.x;
  const anchorY = tf.ropeAnchorY - camera.y;
  const cageX = cage.x - camera.x;
  const cageY = cage.y - camera.y;
  const cw = cage.w, ch = cage.h;
  const shakeX = performance.now() < cage.shakeUntil ? Math.sin(performance.now() / 30) * 2 : 0;

  // ceiling mounting bracket
  ctx.fillStyle = '#2a323d';
  ctx.fillRect(anchorX - 12, anchorY, 24, 6);
  ctx.fillStyle = '#3a4451';
  ctx.fillRect(anchorX - 3, anchorY + 4, 6, 4);

  // the rope: three visible segments. Cut segments are drawn frayed.
  const cageTopY = cageY + shakeX * 0;
  const segCount = 3;
  const segH = (cageTopY - (anchorY + 8)) / segCount;
  for (let i = 0; i < segCount; i++) {
    const y0 = anchorY + 8 + i * segH;
    const y1 = y0 + segH;
    const cut = i < cage.cutsCount;
    ctx.strokeStyle = cut ? '#7a5030' : '#b98a55';
    ctx.lineWidth = cut ? 1 : 3;
    ctx.beginPath(); ctx.moveTo(anchorX, y0); ctx.lineTo(anchorX + shakeX * (i / 3), y1); ctx.stroke();
    if (cut) {
      // fray marks near the top of the cut segment
      ctx.strokeStyle = '#5a3a20';
      ctx.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(anchorX - 3, y0 + 1 + k * 2);
        ctx.lineTo(anchorX + 3, y0 + 2 + k * 2);
        ctx.stroke();
      }
    }
  }
  // hook connecting rope to cage
  ctx.fillStyle = '#6a5238';
  ctx.beginPath();
  ctx.arc(cageX + cw / 2 + shakeX, cageTopY - 2, 4, 0, Math.PI * 2);
  ctx.fill();

  // the cage: iron frame + vertical bars
  const gx = cageX + shakeX;
  ctx.strokeStyle = '#2a2f38';
  ctx.lineWidth = 3;
  ctx.strokeRect(gx, cageY, cw, ch);
  ctx.fillStyle = '#1a1e26';
  ctx.fillRect(gx, cageY, cw, 4);        // top bar
  ctx.fillRect(gx, cageY + ch - 4, cw, 4); // bottom bar
  ctx.strokeStyle = '#3a4250';
  ctx.lineWidth = 1.5;
  for (let bx = 6; bx < cw - 2; bx += 6) {
    ctx.beginPath(); ctx.moveTo(gx + bx, cageY + 4); ctx.lineTo(gx + bx, cageY + ch - 4); ctx.stroke();
  }

  // Robin sprite from the intro cutscene, scaled to fit the cage
  if (!rb.drowned) {
    const scale = ch / 60;
    drawRobinSprite(gx + (cw - 24 * scale) / 2, cageY + 4, scale, true, Math.sin(t / 260) * 0.06);
  }

  // hearts + cut counter above the cage
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f1c40f';
  ctx.fillText(`SOGA ${3 - cage.cutsCount}/3`, gx + cw / 2, cageY - 6);
  ctx.textAlign = 'left';
}

function drawTwoFace(t) {
  const tf = level.twoface;
  if (!tf) return;

  // Scene decorations — water first, then rope + cage. Two-Face body
  // last so he passes in front of everything as he patrols by.
  drawWaterTank(tf.water, t);
  drawRobinCage(tf, t);

  const px = tf.x - camera.x;
  const py = tf.y - camera.y;
  const bw = tf.w, bh = tf.h;

  if (!tf.alive) {
    // KO'd flat on the arena floor, split navy/purple suit + two-tone
    // face visible — same silhouette Bane gets when he goes down
    const floorY = tf.floorRow * TILE - camera.y;
    const cx = px + bw / 2;
    // legs sprawled
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.ellipse(cx - 18, floorY - 6, 18, 8, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3d2a5e';
    ctx.beginPath();
    ctx.ellipse(cx + 18, floorY - 6, 18, 8, -0.15, 0, Math.PI * 2);
    ctx.fill();
    // torso — two-tone jacket
    ctx.fillStyle = '#242f4d';
    ctx.beginPath();
    ctx.ellipse(cx - 10, floorY - 16, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a2d8c';
    ctx.beginPath();
    ctx.ellipse(cx + 10, floorY - 16, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    // white shirt strip
    ctx.fillStyle = '#e8e0d0';
    ctx.fillRect(cx - 4, floorY - 26, 8, 18);
    // head — pale left, purple/scarred right — laid sideways
    ctx.fillStyle = '#f0d6b0';
    ctx.beginPath();
    ctx.arc(cx - 22, floorY - 22, 11, Math.PI * 0.5, Math.PI * 1.5);
    ctx.fill();
    ctx.fillStyle = '#6a3a6a';
    ctx.beginPath();
    ctx.arc(cx - 22, floorY - 22, 11, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.fill();
    // knocked-out X eyes
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 28, floorY - 25); ctx.lineTo(cx - 24, floorY - 21);
    ctx.moveTo(cx - 28, floorY - 21); ctx.lineTo(cx - 24, floorY - 25);
    ctx.stroke();
    ctx.strokeStyle = '#1a0a1a';
    ctx.beginPath();
    ctx.moveTo(cx - 20, floorY - 25); ctx.lineTo(cx - 16, floorY - 21);
    ctx.moveTo(cx - 20, floorY - 21); ctx.lineTo(cx - 16, floorY - 25);
    ctx.stroke();
    // the trademark coin resting next to him
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.ellipse(cx + 30, floorY - 5, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#b8860b';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('$', cx + 30, floorY - 3);
    ctx.textAlign = 'left';
    return;
  }

  const flashing = performance.now() < tf.hitUntil && Math.floor(performance.now() / 90) % 2 === 0;
  if (!flashing) {
    // Use the intro sprite so his look stays consistent with the cutscene.
    // drawTwoFaceSprite is drawn at ~30×78 relative to the top-left, so
    // shift down by (h - 78) to sit his feet on tf.y + tf.h.
    const bob = tf.state === 'cutting' ? Math.abs(Math.sin(performance.now() / 90)) * 4
             : (tf.state === 'advancing' ? Math.abs(Math.sin(performance.now() / 140)) * 2
             : 0);
    drawTwoFaceSprite(px, py + bh - 78, 1.0, -bob);

    // stunned: dizzy stars
    if (tf.state === 'stunned') {
      ctx.fillStyle = '#f6d743';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) {
        const ang = performance.now() / 260 + i * (Math.PI * 2 / 3);
        ctx.fillText('★', px + bw / 2 + Math.cos(ang) * 14, py - 4 + Math.sin(ang) * 6);
      }
      ctx.textAlign = 'left';
    }

    // cutting: knife swipes
    if (tf.state === 'cutting') {
      ctx.strokeStyle = '#e8e8ee';
      ctx.lineWidth = 2;
      const swipe = (performance.now() % 260) / 260;
      const bladeX = px - 12 + swipe * 20;
      ctx.beginPath();
      ctx.moveTo(bladeX, py + 6);
      ctx.lineTo(bladeX - 10, py + 22);
      ctx.stroke();
    }

    // coin_flip animation — the same trademark two-headed coin, spinning
    // above his head; the visible face determines what attack comes next
    if (tf.state === 'coin_flip') {
      const coinY = py - 30 - Math.abs(Math.sin(tf.coinAngle)) * 34;
      const scaleX = Math.cos(tf.coinAngle * 3);
      ctx.save();
      ctx.translate(px + bw / 2, coinY);
      ctx.scale(scaleX, 1);
      ctx.fillStyle = '#ffd700';
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (Math.abs(scaleX) > 0.3) {
        ctx.fillStyle = '#b8860b';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('$', 0, 3);
      }
      ctx.restore();
    }

    // shooting: muzzle flash telegraph on his hand each time a bullet is
    // about to leave
    if (tf.state === 'shooting') {
      const armAng = tf.facing > 0 ? 0 : Math.PI;
      const hx = px + bw / 2 + Math.cos(armAng) * (bw * 0.6);
      const hy = py + bh * 0.35;
      ctx.strokeStyle = '#c9a53a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px + bw / 2, py + bh * 0.32);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      const flash = Math.sin(performance.now() / 60) > 0.5;
      if (flash) {
        ctx.fillStyle = '#ffdb6a';
        ctx.beginPath();
        ctx.arc(hx + tf.facing * 4, hy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // bullets in flight — brass slugs (drawn regardless of Two-Face's state
  // so they keep flying through his stun animations)
  for (const b of tf.bullets) {
    if (!b.alive) continue;
    const bx = b.x - camera.x, by = b.y - camera.y;
    ctx.fillStyle = '#d4a027';
    ctx.beginPath();
    ctx.ellipse(bx, by, 6, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a5a10';
    ctx.lineWidth = 1;
    ctx.stroke();
    // motion streak
    ctx.strokeStyle = 'rgba(255,220,120,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - Math.sign(b.vx) * 14, by);
    ctx.stroke();
  }

  // HP pips above his head. drawTwoFaceSprite draws the sprite from
  // (px, py + bh - 78) so the top of his head sits at py - 34; place
  // the pips a bit higher than that so they read as a hover marker.
  if (tf.state !== 'idle' && tf.alive) {
    const cx = px + bw / 2;
    for (let i = 0; i < tf.maxHp; i++) {
      ctx.fillStyle = i < tf.hp ? '#ff5e5e' : 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(cx - (tf.maxHp - 1) * 6 + i * 12, py - 48, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Continuous snowfall for Act 3 frozen levels. Parallaxes with the
// camera so flakes feel anchored to the world, not the screen.
function drawSnowfall(t) {
  const par = camera.x * 0.3;
  ctx.fillStyle = 'rgba(240,248,255,0.75)';
  for (let i = 0; i < 90; i++) {
    const seed = i * 3.1;
    const x = ((hash01(seed) * CANVAS_W + t * 0.05 - par * 0.4) % (CANVAS_W + 40) + CANVAS_W + 40) % (CANVAS_W + 40) - 20;
    const y = ((hash01(seed + 1.7) * CANVAS_H + t * (0.08 + hash01(seed + 4) * 0.06)) % CANVAS_H);
    const sway = Math.sin(t / 260 + i) * 4;
    const sz = 1.5 + hash01(seed + 5) * 1.5;
    ctx.globalAlpha = 0.4 + 0.5 * hash01(seed + 7);
    ctx.fillRect(x + sway, y, sz, sz);
  }
  ctx.globalAlpha = 1;
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

// ---------------------------------------------------------------
// End-of-2-4 rescue cutscene: Batman batigarras the cage rope, the cage
// lowers gently onto the arena floor and Robin steps out. Drawn as an
// overlay on top of the still-rendered arena.
// ---------------------------------------------------------------
function drawRescueScene(now) {
  const t = now - rescueStart;
  ctx.fillStyle = 'rgba(2,4,10,0.55)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const boxW = 620, boxH = 96;
  const boxX = (CANVAS_W - boxW) / 2, boxY = CANVAS_H - boxH - 22;
  ctx.fillStyle = 'rgba(6,8,16,0.94)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('¡DOS CARAS DERROTADO!', CANVAS_W / 2, boxY + 30);

  ctx.fillStyle = '#dbe4ff';
  ctx.font = '13px monospace';
  let line1, line2;
  if (t < 3000) {
    line1 = 'Batman corta la última soga con la Batigarra...';
    line2 = 'y baja la jaula suavemente hasta el piso.';
  } else if (t < 6000) {
    line1 = 'Robin: —Justo a tiempo. Sabía que vendrías.';
    line2 = 'Batman: —Nunca solo, compañero.';
  } else {
    line1 = 'Vuelven a la BATICUEVA a preparar el próximo golpe.';
    line2 = '';
  }
  ctx.fillText(line1, CANVAS_W / 2, boxY + 56);
  if (line2) ctx.fillText(line2, CANVAS_W / 2, boxY + 76);
  ctx.textAlign = 'left';

  // top-of-screen title
  ctx.fillStyle = '#f6d743';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ROBIN A SALVO', CANVAS_W / 2, 60);
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------
// Alfred + TV cutscene played on entry to the Batcave after 2-4. A
// television projects a frozen Gotham (Mr. Freeze foreshadowing) while
// Alfred asks Batman and Robin if they've seen the news.
// ---------------------------------------------------------------
function drawAlfredNewsScene(now) {
  const t = now - alfredStart;
  ctx.fillStyle = 'rgba(2,4,10,0.72)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // TV screen — big frozen Gotham skyline with drifting snow
  const tvX = 90, tvY = 60, tvW = CANVAS_W - 180, tvH = 240;
  ctx.fillStyle = '#2a2f3a';
  ctx.fillRect(tvX - 12, tvY - 12, tvW + 24, tvH + 40);
  ctx.fillStyle = '#101623';
  ctx.fillRect(tvX, tvY, tvW, tvH);

  // frozen sky gradient
  const sg = ctx.createLinearGradient(0, tvY, 0, tvY + tvH);
  sg.addColorStop(0, '#0d1830');
  sg.addColorStop(0.6, '#264a6a');
  sg.addColorStop(1, '#7fb5c8');
  ctx.fillStyle = sg;
  ctx.fillRect(tvX + 4, tvY + 4, tvW - 8, tvH - 8);

  // frost pattern in corners
  ctx.strokeStyle = 'rgba(230,240,255,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const cx = tvX + 4 + hash01(i * 3.1) * (tvW - 8);
    const cy = tvY + 4 + hash01(i * 5.7) * 40;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const ang = k * Math.PI / 3;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * 6, cy + Math.sin(ang) * 6);
    }
    ctx.stroke();
  }

  // Gotham skyline covered in snow
  const skylineBase = tvY + tvH - 60;
  for (let i = 0; i < 9; i++) {
    const bx = tvX + 10 + i * ((tvW - 20) / 9);
    const bw = ((tvW - 20) / 9) - 6;
    const bh = 60 + hash01(i * 2.3) * 90;
    ctx.fillStyle = '#0f1728';
    ctx.fillRect(bx, skylineBase - bh, bw, bh);
    // snow cap on the roof
    ctx.fillStyle = '#f0f4ff';
    ctx.fillRect(bx - 2, skylineBase - bh - 4, bw + 4, 6);
    // icy windows
    for (let wy = 0; wy < 3; wy++) {
      for (let wx = 0; wx < 2; wx++) {
        const on = (i + wy + wx) % 3 === 0;
        ctx.fillStyle = on ? '#b8dbef' : '#1a2436';
        ctx.fillRect(bx + 6 + wx * (bw - 14), skylineBase - bh + 12 + wy * 22, 8, 10);
      }
    }
    // giant icicle hanging from the roof edge
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(180,220,240,0.85)';
      ctx.beginPath();
      ctx.moveTo(bx + bw - 8, skylineBase - bh);
      ctx.lineTo(bx + bw - 4, skylineBase - bh + 22);
      ctx.lineTo(bx + bw, skylineBase - bh);
      ctx.closePath();
      ctx.fill();
    }
  }

  // frozen ground with cracked ice patterns
  ctx.fillStyle = '#c5dcea';
  ctx.fillRect(tvX + 4, skylineBase, tvW - 8, tvY + tvH - skylineBase - 4);
  ctx.strokeStyle = 'rgba(80,110,140,0.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const sx = tvX + hash01(i * 7.1) * tvW;
    const sy = skylineBase + 10 + hash01(i * 4.3) * 40;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 30 + hash01(i * 9) * 40, sy + 6);
    ctx.stroke();
  }

  // falling snow
  for (let i = 0; i < 40; i++) {
    const fx = tvX + ((hash01(i * 11.3) * tvW + t * 0.04) % tvW);
    const fy = tvY + ((hash01(i * 4.7) * tvH + t * 0.06) % tvH);
    ctx.fillStyle = `rgba(240,248,255,${0.35 + 0.5 * hash01(i * 3.9)})`;
    ctx.fillRect(fx, fy, 2, 2);
  }

  // NEWS crawl at the bottom of the TV screen — the scrolling text is
  // clipped to the red bar so it never spills onto the TV bezel
  const barX = tvX + 4, barY = tvY + tvH - 26, barW = tvW - 8, barH = 22;
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(barX, barY, barW, barH);
  ctx.clip();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  const crawl = 'ALERTA — GOTHAM CONGELADA — Mr. FREEZE avanza sobre la ciudad — temperatura -40°C — ¿quién le paga? — ';
  const glyphW = 8;
  const cycleW = crawl.length * glyphW;
  const offset = (t / 30) % cycleW;
  ctx.fillText(crawl + crawl, barX + 6 - offset, barY + barH - 6);
  ctx.restore();

  // TV frame + power light + station bug
  ctx.fillStyle = '#f6d743';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('GCN LIVE', tvX + tvW - 12, tvY + 20);
  ctx.textAlign = 'left';
  ctx.fillStyle = Math.sin(t / 300) > 0 ? '#ff5e5e' : '#4a1616';
  ctx.beginPath();
  ctx.arc(tvX + tvW + 6, tvY + tvH + 14, 3, 0, Math.PI * 2);
  ctx.fill();

  // Alfred + Batman + Robin standing under the TV
  const ay = tvY + tvH + 60;
  drawAlfredSprite(CANVAS_W / 2 - 80, ay, 1.05);
  // Batman silhouette (simplified)
  ctx.fillStyle = '#131722';
  ctx.fillRect(CANVAS_W / 2 + 20, ay - 6, 22, 60);
  ctx.fillStyle = '#f0d6b0';
  ctx.fillRect(CANVAS_W / 2 + 24, ay - 4, 14, 8);
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(CANVAS_W / 2 + 26, ay + 8, 10, 4);
  // Robin silhouette
  drawRobinSprite(CANVAS_W / 2 + 60, ay - 8, 0.85, false, 0);

  // dialogue box
  const boxW = 620, boxH = 60;
  const boxX = (CANVAS_W - boxW) / 2, boxY2 = CANVAS_H - boxH - 12;
  ctx.fillStyle = 'rgba(6,8,16,0.94)';
  ctx.fillRect(boxX, boxY2, boxW, boxH);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY2, boxW, boxH);
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ALFRED', CANVAS_W / 2, boxY2 + 22);
  ctx.fillStyle = '#dbe4ff';
  ctx.font = '12px monospace';
  const line = t < 3200
    ? '—¿Han visto las noticias, señores?'
    : '—Gotham se congela. Freeze es la cara — pero alguien lo mueve.';
  ctx.fillText(line, CANVAS_W / 2, boxY2 + 46);
  ctx.textAlign = 'left';
}

// In-world dialog with Alfred by the batcave. Batman + Robin + Alfred
// keep rendering behind (drawn by drawCaveProps). Advance with a tap.
function drawAlfredDialog(now) {
  const cv = level.cave;
  const page = cv && cv.alfred ? cv.alfred.dialogPage : 0;
  const lines = [
    ['ALFRED', '—¿Han visto las noticias, señores?'],
    ['ALFRED', '—Gotham amaneció bajo un manto de hielo.'],
    ['ALFRED', '—Mr. Freeze salió del Arkham y congela lo que toca.'],
    ['ALFRED', '—Pero algo no cierra. Freeze no busca dinero, busca a Nora.'],
    ['ALFRED', '—Alguien le paga con promesas... y con paraguas.'],
    ['ALFRED', '—A la Batcomputadora — averigüemos quién mueve los hilos.'],
  ];
  const [who, text] = lines[Math.min(page, lines.length - 1)];

  ctx.fillStyle = 'rgba(2,4,10,0.35)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const boxW = 660, boxH = 84;
  const boxX = (CANVAS_W - boxW) / 2, boxY = CANVAS_H - boxH - 18;
  ctx.fillStyle = 'rgba(6,8,16,0.94)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(who, boxX + 18, boxY + 26);
  ctx.fillStyle = '#dbe4ff';
  ctx.font = '13px monospace';
  ctx.fillText(text, boxX + 18, boxY + 50);

  ctx.fillStyle = '#9fb4d8';
  ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  const arrow = Math.sin(now / 260) > 0 ? '▼' : '▽';
  ctx.fillText(`SALTO — continuar  ${arrow}`, boxX + boxW - 18, boxY + boxH - 12);
  ctx.textAlign = 'left';
}

function drawAlfredSprite(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // legs (butler tux pants)
  ctx.fillStyle = '#1a1e28';
  ctx.fillRect(4, 42, 8, 22);
  ctx.fillRect(14, 42, 8, 22);
  // shoes
  ctx.fillStyle = '#080a12';
  ctx.fillRect(2, 62, 10, 4);
  ctx.fillRect(14, 62, 10, 4);
  // tux jacket
  ctx.fillStyle = '#101422';
  ctx.fillRect(2, 18, 22, 26);
  // white shirt + bow tie
  ctx.fillStyle = '#f0f4fa';
  ctx.fillRect(10, 20, 6, 22);
  ctx.fillStyle = '#8c1f2c';
  ctx.beginPath();
  ctx.moveTo(11, 22); ctx.lineTo(13, 24); ctx.lineTo(11, 26);
  ctx.moveTo(15, 22); ctx.lineTo(13, 24); ctx.lineTo(15, 26);
  ctx.closePath();
  ctx.fill();
  // head — pale skin, grey hair, moustache
  ctx.fillStyle = '#f0d6b0';
  ctx.fillRect(6, 2, 14, 16);
  ctx.fillStyle = '#c9cdd6';
  ctx.fillRect(5, 0, 16, 5);
  ctx.fillRect(4, 4, 4, 6);
  ctx.fillRect(18, 4, 4, 6);
  // eyes
  ctx.fillStyle = '#111';
  ctx.fillRect(9, 8, 2, 2);
  ctx.fillRect(15, 8, 2, 2);
  // moustache
  ctx.fillStyle = '#c9cdd6';
  ctx.fillRect(9, 13, 8, 2);
  ctx.restore();
}
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
  if (level.chase) { renderChase(t); return; }

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
  if (level.mrfreeze) drawMrFreeze(t);
  drawSnowCannons(t);
  drawSnowballs(t);
  drawVillain();
  drawBane(t);
  drawTwoFace(t);
  drawShockwaves();
  drawImpactEffects(t);
  // Act 3 co-op: only the active character is on screen. The other one
  // is stored in `companion` and only comes back when you hit switch.
  drawPlayer();
  if (level.frozen) drawSnowfall(t);
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
  } else if (state === 'rescue') {
    render(now);
    drawRescueScene(now);
    // 9 s so each pair of lines can be read comfortably, or tap to skip
    const skip = now < jumpBufferUntil || now < shootBufferUntil;
    if (now - rescueStart > 9000 || skip) {
      jumpBufferUntil = 0; shootBufferUntil = 0;
      postTwoFaceReturn = true;
      saveAct2Beaten();
      // fresh post-2-4 arrival: news first, then expediente
      caveHubReturn = false;
      const caveIdx = LEVEL_SPECS.findIndex(s => s.cave);
      loadLevel(caveIdx);
      // Batman + Robin walk into the cave normally — Alfred is waiting
      // in-world between them and the batcomputer; no overlay cutscene.
      state = 'playing';
    }
  } else if (state === 'alfredDialog') {
    render(now);
    drawAlfredDialog(now);
    // tap to advance to the next line, or wrap back to gameplay
    if (now < jumpBufferUntil || now < shootBufferUntil) {
      jumpBufferUntil = 0; shootBufferUntil = 0;
      const cv = level.cave;
      cv.alfred.dialogPage++;
      if (cv.alfred.dialogPage >= 6) {
        cv.tvOn = true;
        state = 'playing';
      }
    }
  } else if (state === 'computer' || state === 'freezeExpediente' || state === 'choice' || state === 'levelselect') {
    // Batcave UI: the frozen scene stays behind the expediente / choice /
    // replay panel
    render(now);
    if (state === 'computer') drawExpedienteScreen(now);
    else if (state === 'freezeExpediente') drawFreezeExpedienteScreen(now);
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
