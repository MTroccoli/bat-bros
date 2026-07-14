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
// Movement calmed down a touch so a quick tap doesn't shove Batman
// (or Robin) across a rooftop. Accel + top speed each drop ~11%,
// which keeps the wide 4-tile pit crossings still doable.
const MOVE_ACCEL = 0.62;
const MAX_SPEED = 3.9;
const AIR_ACCEL = 0.44;
const FRICTION = 0.78;
const JUMP_VELOCITY = -11.2;
const JUMP_CUT = 0.5;
const STOMP_BOUNCE = -8.5;
// Widened stomp margin: as long as Batman's feet are within 22 px of
// the enemy's top on the frame of contact it still counts as a
// landing. Makes rooftop dives feel more forgiving.
const STOMP_TOLERANCE = 22;
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

// --- Smoke bomb (Act 4 gadget) ---
// Deployed at the character's feet, spreads a circular cloud that
// CONFUSES enemies inside it: they slow down and take a single hit
// to kill. The heroes are immune (they can see through it and
// keep full control).
const SMOKE_MAX_AMMO = 5;            // matches the batarang for parity
const SMOKE_RADIUS = 90;             // px around the poof center
const SMOKE_DURATION_MS = 4500;      // cloud lifetime
const SMOKE_SPEED_MULT = 0.4;        // confused enemies move at 40 % speed
const SMOKE_THROW_COOLDOWN_MS = 350; // between smoke throws
const SMOKE_LOB_VX = 4.2;            // horizontal launch speed (arcs like a snowball)
const SMOKE_LOB_VY = -6.0;           // upward launch
const SMOKE_FLIGHT_MS = 550;         // arc time before it settles into a cloud
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

// --- Chase level (2-3) — portrait/vertical scroll ---
const CHASE_W = 480;
const CHASE_H = 720;
const CHASE_SCROLL_SPEED = 3.0;
const CHASE_BOAT_Y = 580;
const CHASE_JUMP_VEL = -9;
const CHASE_GRAVITY = 0.45;
const CHASE_TARGET_DIST = 9000;
const CHASE_INTRO_MS = 3500;
const CHASE_TF_APPEAR_INTERVAL = 3500;
const CHASE_TF_VISIBLE_MS = 3000;
const CHASE_GRENADE_SPEED = 3.5;
const CHASE_OBSTACLE_GAP = 140;
const CHASE_SPEED_TIERS = [0.25, 0.50, 0.75];
const CHASE_LANE_LEFT = 60;
const CHASE_LANE_RIGHT = 380;

// --- Two-Face boss (Act 2 boss, level 2-4) ---
const TWOFACE_HP = 5;
const TWOFACE_HIT_FLASH_MS = 900;
const TWOFACE_STUN_MS = 1500;                // stagger after Batman lands a hit
const TWOFACE_ROPE_CUT_INTERVAL = 6500;      // patrol time before he heads for the rope
const TWOFACE_ROPE_CUT_INTERVAL_RAGE = 3800; // once enraged (hp <= 2)
const TWOFACE_CUT_ANIMATION_MS = 1400;       // window to interrupt him at the rope
const TWOFACE_PATROL_SPEED = 1.2;
const TWOFACE_ADVANCE_SPEED = 2.0;           // walking toward the rope
const TWOFACE_RAGE_SPEED_MUL = 1.55;
const TWOFACE_THUG_SPAWN_INTERVAL = 6000;
const TWOFACE_THUG_SPAWN_INTERVAL_RAGE = 3400;
const TWOFACE_CAGE_MAX_CUTS = 3;             // 3 cuts and Robin drops into the drink

// coin-flip attack: after Batman's 2nd and 4th hits, Two-Face pulls out
// his coin. Heads = 3 bullets to jump over, tails = 1 thug + 1 bird
const TWOFACE_COIN_FLIP_MS = 1500;
const TWOFACE_BULLET_COUNT = 3;
const TWOFACE_BULLET_INTERVAL = 900;
const TWOFACE_BULLET_SPEED = 3.4;

// --- Mr. Freeze (Act 3 boss) ---
// The fight is about BREAKING THE MACHINE, not killing Freeze. He's frozen
// inside a gothic cryo-reactor and is invulnerable. Each button needs
// FREEZE_BUTTON_HITS dive-stomps / batarangs to break down (iced → orange
// → RED → active). When all buttons activate the core overheats and
// Freeze falls.
const FREEZE_HIT_FLASH_MS = 600;     // button flash after a hit (crack or activate)
const FREEZE_MELT_MS = 2400;         // overload -> melt animation before the level completes
const FREEZE_BUTTON_HITS = 3;        // stomps required per button (crack → red → active)
// Mr. Freeze wanders the arena floor and keeps firing his cold gun. The
// gun was a short-range popgun before; it now travels straight (no
// gravity) and reaches farther so mid-arena positions aren't safe.
const FREEZE_PATROL_SPEED = 1.25;    // floor wander speed
// Shots are diagonally upward now (see mf.gunAngle in updateMrFreeze),
// so the player has clear breathing room on the floor between salvos.
// The old cadence (1400 → 650 ms) felt like a stun-lock. Bumped by
// ~60% so a well-timed dive between shots is realistic.
const FREEZE_SHOT_INTERVAL = 2400;   // ms between cold-gun shots (0 buttons active)
const FREEZE_SHOT_INTERVAL_MIN = 1200;// fastest cadence once buttons start going down
const FREEZE_SHOT_PAUSE = 420;       // he plants his feet to aim this long before a shot
const FREEZE_MUZZLE_MS = 180;        // muzzle-flash duration per shot
const FREEZE_BEAM_SPEED = 11;        // straight-line projectile speed (was ~7)
const FREEZE_BEAM_LIFESPAN_MS = 2200;// how long a beam flies before dying off-screen
const FREEZE_GUN_UP_ANGLE = Math.PI / 4; // 45° above horizontal, direction of shots
// Falling ceiling stalactites. In addition to the columns over each
// button they now also drop from between the buttons and both extremes
// of the arena, so there's nowhere to just stand and wait.
const FREEZE_STAL_INTERVAL = 2000;   // ms between drops at 0 progress
const FREEZE_STAL_MIN = 550;         // fastest drop cadence once fully heated
const FREEZE_STAL_WARN_MS = 650;     // it shakes at the ceiling this long before dropping
const FREEZE_STAL_SPEED = 12;        // terminal fall speed
// Two boss-only goons patrol over the buttons and push Batman off his
// dive line.
const FREEZE_BIRD_SPEED = 1.6;

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
          boats = [], cranes = [], snowCannons = [], rats = [], divers = [],
          crouchTunnels = [],
          spawn, name, indoor = false, dock = false, frozen = false, sewer = false,
          bane = null, cave = null, twoface = null, mrfreeze = null } = spec;

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

  // Crouch tunnels: a low ceiling strip forces the player to crouch
  // to pass. Each entry paints one row of solid tiles at ceilRow so
  // the normal collision grid stops a standing character; a crouched
  // character (h ~= 22) squeezes through the remaining gap.
  for (const c of crouchTunnels) {
    for (let i = 0; i < c.w; i++) {
      solid[c.ceilRow][c.x + i] = true;
    }
  }

  const builtCranes = cranes.map(c => ({
    towerX: c.towerX * TILE,
    armY: c.armY * TILE,
    anchorX: c.armEndX * TILE,
    anchorY: c.armY * TILE,
    ropeLen: c.ropeLen * TILE,
    cargoW: c.cargoW * TILE,
    cargoH: TILE * 2,
    speed: c.speed,
    amplitude: c.amplitude,
    // Explicit phase offset so two cranes on the same map don't
    // start in phase and appear to be moving on the same beat.
    phase: c.phase || 0,
    angle: 0,
    cargoX: c.armEndX * TILE - (c.cargoW * TILE) / 2,
    cargoY: c.armY * TILE + c.ropeLen * TILE,
    prevCargoX: c.armEndX * TILE - (c.cargoW * TILE) / 2,
    craneCoins: [],
  }));

  const builtCoins = coins.map(([x, y]) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, taken: false }));
  for (const crane of builtCranes) {
    const n = Math.max(1, Math.floor(crane.cargoW / TILE));
    for (let i = 0; i < n; i++) {
      const localX = (i + 0.5) * (crane.cargoW / n);
      const coin = { x: crane.cargoX + localX, y: crane.cargoY - 16, taken: false, craneLocalX: localX, craneRef: crane };
      crane.craneCoins.push(coin);
      builtCoins.push(coin);
    }
  }

  return {
    name,
    width, height, groundY, indoor, dock, frozen, sewer,
    solid,
    crouchTunnels: crouchTunnels.map(c => ({ x: c.x, w: c.w, ceilRow: c.ceilRow })),
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
    coins: builtCoins,
    thugs: thugs.map(g => ({
      x: g.x * TILE, y: g.y * TILE - 26,
      w: 24, h: 26,
      minX: g.range[0] * TILE, maxX: g.range[1] * TILE,
      vx: g.frozen ? 0.35 : 1.2, alive: true,
      helmet: !!g.helmet,
      frozen: !!g.frozen,   // moves at 30% speed until Batman lands the 1st hit
    })),
    birds: birds.map(b => ({
      x: b.x * TILE, y: b.y * TILE, baseY: b.y * TILE,
      w: 26, h: 20,
      minX: b.range[0] * TILE, maxX: b.range[1] * TILE,
      vx: b.frozen ? 0.5 : 1.7, alive: true,
      frozen: !!b.frozen,
    })),
    bats: bats.map(([x, row]) => ({
      x: x * TILE, y: row * TILE - 22, w: 24, h: 20, taken: false,
    })),
    // moving rafts (docks): a patrolling platform Batman must time a landing
    // on instead of a fixed rest stop — same range/bounce pattern as birds
    boats: boats.map(b => ({
      x: b.x * TILE, y: b.y * TILE, w: (b.w || 4) * TILE, h: BOAT_THICK,
      minX: b.range[0] * TILE, maxX: b.range[1] * TILE,
      // dir defaults to +1 (moving right); set to -1 for a raft that
      // starts pointing at the opposite edge so parallel boats don't
      // ride the same beat.
      vx: (b.speed ?? 1.0) * (b.dir ?? 1),
    })),
    cranes: builtCranes,
    // Act-3 cold-city hazard: a chunky snow cannon on the ground that
    // fires a burst of 3 snowballs straight up every fireInterval ms.
    // Any of them clipping Batman freezes him for ~5 s (slow move, no
    // jump). Indestructible: standing on top of the muzzle also
    // freezes him — it's an ice trap, not a mushroom.
    snowCannons: snowCannons.map(c => ({
      x: c.x * TILE, y: (c.y ?? groundY) * TILE - 50,
      w: 42, h: 50,
      fireInterval: c.interval ?? 3200,
      burstCount: c.burst ?? 3,
      burstIndex: 0,
      nextFireAt: 0,
      alive: true,
    })),
    snowballs: [],
    // Sewer critters (Act 4). Rats scurry along the ground at 2× thug
    // speed; they can't be helmet-blocked. Bigger silhouette (26×18)
    // so the pointed snout + big ears actually read at gameplay
    // distance. Confuse them with smoke = 1-hit kill.
    rats: rats.map(r => ({
      x: r.x * TILE, y: r.y * TILE - 18,
      w: 26, h: 18,
      minX: r.range[0] * TILE, maxX: r.range[1] * TILE,
      vx: 2.4 * (r.dir ?? 1), alive: true,
    })),
    // Penguin-divers pop out of a water pit at a fixed interval,
    // arc up N tiles, then fall back into the water. Stompable in
    // the air; contact damages Batman otherwise.
    divers: divers.map(d => ({
      x: d.x * TILE + TILE / 2 - 12, y: (d.y ?? groundY) * TILE,
      w: 24, h: 26,
      restY: (d.y ?? groundY) * TILE + 6,     // where they hide (below water)
      vy: 0,
      state: 'wait',                            // wait | jumping | falling
      nextJumpAt: 0,
      interval: d.interval ?? 2200,
      jumpHeight: d.height ?? 5,               // in tiles
      alive: true,
      facing: d.dir ?? 1,
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
    twoface: twoface ? (() => {
      const floorRow = twoface.floorRow ?? 11;
      const floorY = floorRow * TILE;
      // rope anchor hangs from row 0 (ceiling); cage sits above a raised
      // water tank on the arena floor. Each rope cut lowers the cage; on
      // the 3rd cut it falls straight into the water and Robin drowns.
      const ropeAnchorX = (twoface.ropeAnchorCol ?? 3) * TILE + TILE / 2;
      const cageW = TILE * 1.6;   // 51px
      const cageH = TILE * 1.3;   // 42px
      const waterTopY = floorY - TILE * 1.5;      // tank rises 1.5 tiles above floor
      const tankLeftPx = (twoface.tankCol ?? 1) * TILE;
      const tankWidthPx = (twoface.tankWidthCols ?? 4) * TILE;
      const cageInitialY = TILE * 1.2;            // near the ceiling
      const cageBottomAtWater = waterTopY - 6;    // where the cage lands after 3 cuts
      const dropPerCut = (cageBottomAtWater - (cageInitialY + cageH)) / TWOFACE_CAGE_MAX_CUTS;
      // Two-Face runs to just RIGHT of the rope to hack at it
      const ropeCutX = ropeAnchorX + 16;
      return {
        x: twoface.x * TILE, homeX: twoface.x * TILE,
        floorRow, y: floorY - 44,
        w: 30, h: 44,
        hp: twoface.hp ?? TWOFACE_HP, maxHp: twoface.hp ?? TWOFACE_HP,
        vx: 1.2, alive: true, facing: -1,
        state: 'idle',
        hitUntil: 0, deadAt: 0, stunUntil: 0,
        cutTimer: 0,     // performance.now() time to start advancing
        cutStart: 0,     // when the cutting animation began
        nextThugAt: 0,   // when to spawn the next distraction thug
        coinFlipAt: 0,   // start of the special-attack coin animation
        coinAngle: 0,
        coinResult: null,
        bullets: [],     // { x, y, vx, alive } — jump-over projectiles
        bulletsFired: 0,
        nextBulletAt: 0,
        minX: (twoface.arenaMinX ?? 26) * TILE,
        maxX: (twoface.arenaMaxX ?? width - 3) * TILE,
        triggerX: (twoface.triggerX ?? 28) * TILE,
        ropeAnchorX,
        ropeAnchorY: 0,
        ropeCutX,
        // the cage + water tank state
        cage: {
          x: ropeAnchorX - cageW / 2, y: cageInitialY,
          w: cageW, h: cageH,
          initialY: cageInitialY,
          dropPerCut,
          bottomAtWater: cageBottomAtWater,
          cutsCount: 0,
          shakeUntil: 0,
          falling: false, fallStart: 0, fallVy: 0,
          splashed: false,
        },
        water: {
          x: tankLeftPx, y: waterTopY,
          w: tankWidthPx, top: waterTopY,
          floorY,
          ripples: [],
        },
        // Robin tied inside the cage — his sprite renders inside it. He
        // has no hearts anymore: he drowns instantly if the cage falls in
        // the tank, which is what the 3 rope cuts count toward.
        robin: {
          x: ropeAnchorX - 11, y: cageInitialY + 6,
          w: 22, h: 34,
          hitUntil: 0,
          drowned: false,
        },
      };
    })() : null,
    // Mr. Freeze fight. Freeze is a WANDERING character (invulnerable) who
    // fires his cold gun. The target is the MACHINE: 3 control-column buttons,
    // each ice-shielded (1st hit cracks the ice, 2nd activates). Activate all
    // three -> the machine overloads and Freeze melts.
    mrfreeze: mrfreeze ? (() => {
      const btnCols = mrfreeze.buttonCols || [8, 15, 22];
      const topRow = mrfreeze.buttonTopRow ?? 10;
      const topY = topRow * TILE;
      const bw = 58, colBottom = groundY * TILE;
      // Each button carries a `hits` counter (0..FREEZE_BUTTON_HITS).
      //   0 → iced (cyan shell)
      //   1 → cracked orange
      //   2 → RED (about to blow)
      //   FREEZE_BUTTON_HITS → active (machine core is done)
      const buttons = btnCols.map(c => ({
        cx: c * TILE,                        // column center (px)
        topY,                                // dive lands here
        x: c * TILE - bw / 2, y: topY - 10,  // hitbox: from just above the top
        w: bw, h: (colBottom - topY) + 10,   // ...down the column (so a ranged shot connects too)
        hits: 0, active: false, hitUntil: 0,
      }));
      const fr = mrfreeze.freeze?.range ?? [2, width - 3];
      const fh = 62;
      // Ceiling stalactite spawn columns — the buttons themselves PLUS a
      // pair of extras between each button and both extremes of the room.
      // Prevents Batman from standing safely off to a side while he waits
      // for a specific button to expose.
      const stalCols = [];
      stalCols.push(2 * TILE, 4 * TILE);                  // left extremes
      for (let i = 0; i < btnCols.length; i++) {
        stalCols.push(btnCols[i] * TILE);                 // right on the button
        if (i < btnCols.length - 1) {
          const mid = (btnCols[i] + btnCols[i + 1]) / 2;
          stalCols.push(mid * TILE);                       // between the next button
        }
      }
      stalCols.push((width - 4) * TILE, (width - 2) * TILE); // right extremes
      // Two flying boss goons patrolling above the buttons.
      const birdY = (topRow - 2) * TILE;
      const birds = mrfreeze.birds || [
        { x: btnCols[0] * TILE, y: birdY, w: 26, h: 20,
          minX: (btnCols[0] - 2) * TILE, maxX: (btnCols[btnCols.length - 1] + 2) * TILE,
          vx: FREEZE_BIRD_SPEED, alive: true, frozen: false },
        { x: btnCols[btnCols.length - 1] * TILE, y: birdY + TILE, w: 26, h: 20,
          minX: (btnCols[0] - 2) * TILE, maxX: (btnCols[btnCols.length - 1] + 2) * TILE,
          vx: -FREEZE_BIRD_SPEED, alive: true, frozen: false },
      ];
      return {
        buttons, maxButtons: buttons.length, activeCount: 0, temp: 0,
        hitsPerButton: FREEZE_BUTTON_HITS,
        state: 'idle',                       // idle | fight | overload | dead
        deadAt: 0, meltStart: 0,
        // Mr. Freeze, the wandering character
        fw: 40, fh,
        fx: (mrfreeze.freeze?.x ?? 6) * TILE, fy: groundY * TILE - fh,
        fvx: FREEZE_PATROL_SPEED, facing: 1, walkPhase: 0,
        fminX: fr[0] * TILE, fmaxX: (fr[1] + 1) * TILE,
        nextShotAt: 0, muzzleUntil: 0, aimUntil: 0, gunAngle: -0.15,
        // falling ceiling stalactites — buttons + gaps + extremes
        stalCols,
        stalDrops: [], nextStalAt: 0,
        // patrol goons — same shape as regular birds so the batarang loop
        // can hit them via the merged pool in game.js
        birds,
        // Compact cryo-reactor on the back wall. Smaller than the old
        // gothic organ (was 1..7 TILE = 6 tiles tall) so it doesn't
        // dominate the arena and reads clearly as ONE machine — a
        // central cylindrical core with cooling coils and pipes going
        // down to each button.
        organTopY: 2 * TILE, organBotY: 5 * TILE,
      };
    })() : null,
    // gargoyle perches are only meaningful in the Bane warehouse fight
    perches: (indoor && bane) ? platforms.map(p => ({ x: p.x, w: p.w, y: p.y })) : [],
    cave: cave ? buildCaveState(cave, width, height, groundY, solid) : null,
    chase: spec.chase ? buildChaseState() : null,
    spawn: { x: spawn.x * TILE, y: spawn.y * TILE },
    pixelWidth: width * TILE,
    pixelHeight: height * TILE,
  };
}

function buildChaseState() {
  return {
    scrollY: 0,
    dist: 0,
    speedMul: 1,
    speedTier: 0,
    taunt: null,
    introTimer: CHASE_INTRO_MS,
    obstacles: [],
    grenades: [],
    explosions: [],
    splashes: [],
    tfBoat: { visible: false, y: -120, showAt: CHASE_INTRO_MS + 2000, hideAt: 0, grenadesThrown: 0 },
    lastObstacleAt: 0,
    finished: false,
    batBoatX: CHASE_W / 2 - 45,
    batBoatY: CHASE_BOAT_Y,
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
