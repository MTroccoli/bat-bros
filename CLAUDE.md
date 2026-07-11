# Bat Bros — Game Architecture Guide

A Batman platformer built in pure Canvas 2D with custom physics, no external game engines. 60fps deterministic gameplay verified through monkeypatched clock testing.

## Project Overview

**Bat Bros** is a vertical-city rooftop platformer featuring Batman traversing Gotham's streets and buildings, defeating thugs and birds, collecting coins, and facing off against the supervillain Bane in an indoor boss arena.

- **Engine**: Canvas 2D, custom physics (no Phaser, Kaboom, or similar)
- **Architecture**: Three-file split — `catalog.js` (constants + level builder), `levels.js` (LEVEL_SPECS data), `game.js` (engine ~3800 lines) + styling + HTML markup
- **Physics**: Custom gravity, friction, pendulum swing mechanics, stomp bounce detection
- **Levels**: 6 programmatically generated levels (Acts 1-2 + Batcave) defined in `levels.js`
- **Testing**: Deterministic bots using monkeypatched `performance.now()` and `Date.now()`
- **Offline**: Progressive Web App (PWA) with service worker for offline play

---

## Development Workflow (Important)

**All development work must be committed directly to the `main` branch.** Do not create feature branches or use designated development branches. This ensures changes are immediately visible in the production codebase and eliminates the need for pull request reviews.

When making changes:
1. Modify files locally
2. Test thoroughly (run `npm test` if tests exist, or test manually in browser)
3. Commit directly to `main`: `git add <files> && git commit -m "message"`
4. Push to origin: `git push origin main`

This workflow keeps the game in a constantly deployable state and maintains a clean linear history.

---

## Game Rules & Story Progression (SOURCE OF TRUTH)

**Every change to the game should respect this section. If a rule
here doesn't match the code, the code is wrong — fix the code, not the
doc.**

### Acts and lives
- **Act 1** (levels `1-*`) — 3 starting lives. Set when loading `1-1`.
- **Act 2** (levels `2-*`) — 4 starting lives. Set when loading `2-1`.
- **Act 3** (levels `3-*`) — 5 starting lives. Set when loading `3-1`.
- Lives never go DOWN at an act boundary — the bump is a floor
  (`if (lives < target) lives = target`), so a player who hoarded
  lives keeps them. Implemented in `loadLevel` via `actStart` map.

### Power-up bats are checkpoints (GENERAL RULE, all acts)
- Every bat power-up (`level.bats` entry) IS a checkpoint. Picking
  one up sets `level.checkpoint = { x: bat.x, y: bat.y }`, so the
  next `hurtPlayer` / `killPlayer` respawn falls through to that
  spot instead of the level's `spawn`. This applies to Act 1, Act 2
  AND Act 3 — do not gate it on `level.name.startsWith('2-')`.
- The upgrade side-effects still stand: `setPowerState('big')`,
  `batarangAmmo = BATARANG_MAX_AMMO`, `score += BAT_SCORE`.

### Story arcs, bosses and interstitials
- Act 1 boss: **Bane** in a warehouse (level `1-4`, indoor).
- Between Act 1 and Act 2: **Baticueva** (level `CUEVA`). Player picks
  batarang OR batigarra at the Batcomputer.
- Act 2 boss: **Two-Face** on a cargo ship (level `2-4`, indoor).
  Robin is caged over a water tank; boss cuts the rope. Batman must
  intercept 3 cuts and land 5 stomps/batarangs to win.
- After Two-Face: **rescue cutscene** (state `rescue`, ~9 s) →
  auto-loads CUEVA with `postTwoFaceReturn = true` (persisted via
  `saveAct2Beaten` → localStorage `bitbros:act2beaten`).
- Post-2-4 Batcave: Alfred is placed on the plateau, `!` above his
  head. On approach → `alfredDialog` state (4 pages). After dialog,
  the Batcomputer opens.
- Post-2-4 choice: pick the WEAPON Batman didn't take in Act 1, OR
  an ARMOR upgrade (`armored = true`, spawn always big).
- Act 3 exit from CUEVA jumps to `3-1` (NOT the next LEVEL_SPECS index,
  because CUEVA is stored between Acts 1 and 2 in the array).
- Act 3 boss: **Mr. Freeze** (Victor Fries). The visible face of the
  attack — he's the one on Alfred's TV, on the Batcomputer expediente,
  and behind the boss battle in the frozen city. The existing
  `snowCannons`, frozen thugs and icy physics are his tech.
- **STORY TWIST (planted in Act 3, revealed in Act 4)**: Freeze isn't
  the mastermind. He was hired. The Alfred cave dialog seeds it (page
  4-5: "Freeze no busca dinero, busca a Nora. Alguien le paga con
  promesas... y con paraguas."), the Batcomputer file adds a
  `MECENAS: ???` line in a red-orange blinking tag, the news crawl
  asks "¿quién le paga?", and the desktop file card shows a purple
  scent trail — all pointing at Cobblepot without naming him yet.
- Act 4 boss: **El Pingüino** (Oswald Cobblepot). Not implemented
  yet. After Freeze falls at end-of-Act-3, a cutscene should reveal
  a purple umbrella + monocle at the crime scene → Batcomputer
  swaps to the Penguin expediente (skin already exists,
  `drawPenguinPortrait`). Act 4 plays out inside the Iceberg
  Lounge — see "Penguin fight" section below.

### Penguin fight — planned mechanics (level `4-4`, indoor Iceberg Lounge)
Arena: gilded ballroom of the Iceberg Lounge with mirrored columns,
a checkered dance floor with icy patches (slippery physics), and two
side plateaus. 5 HP. Attacks refuse to overlap; only the current
phase's moveset is active.

- **Phase 1 (HP 5–4) — Umbrella gunslinger**
  - Waddles left/right at half Bane's speed along the ground.
  - Every ~1.8 s fires a 3-shot spread from the umbrella (short-range
    horizontal projectiles that arc slightly, purple with a spark).
  - Every ~4 s lobs a "bomb-egg" (arced projectile that explodes on
    impact, ground-only shockwave 40 px).
  - Damaged by a dive-stomp from above (`player.vy > 0` and feet
    within `STOMP_TOLERANCE` of his top). Umbrella spread cannot be
    stomped mid-flight.

- **Phase 2 (HP 3–2) — Helicopter umbrella**
  - Opens the umbrella and lifts to ceiling level. Glides left/right
    at ~1.7 px/frame.
  - Every ~2.5 s drops a **waddling penguin minion** (16×18 sprite,
    walks toward Batman on the ground, explodes after 3 s with a
    small radial shockwave). Batman clears them with a stomp,
    batarang, or by putting distance between them before the fuse.
  - Damaged by a batarang while he's mid-glide, OR by dive-stomping
    when he descends briefly (~1 s every 6 s) to reload.

- **Phase 3 (HP 1) — Umbrella-blade rage**
  - Deploys a bladed umbrella-spike and spins across the arena for
    ~3 s (invulnerable, moves at ~4.5 px/frame). Contact damages.
  - After the spin, he's dizzy for ~1 s (staggered, no attacks).
    Batman lands the killing dive-stomp during the stagger window.
  - If Batman doesn't finish in the stagger, the spin repeats until
    someone lands the hit or Batman falls.

- **Minions (bomb-penguins)**: small (16×18) waddling sprites — thin
  black body, white belly, small orange feet, bomb strapped to the
  back with a lit sparky wick. Speed 1.4 px/frame. Fuse 3 s, explosion
  radius 40 px, one-hit kill on any character in the radius. Stompable,
  batarangable, and shattered by a snowball from a friendly cannon (yes
  — Batman can bait one of Penguin's own snowballs into a minion).

- **Skin (portrait): drawPenguinPortrait**. Body sprite for the
  boss level should follow Bane's proportions — pear-shaped 32×46,
  black tuxedo, white shirt triangle, purple bowtie, long red nose,
  monocle, top hat, umbrella held either as a shotgun (phase 1),
  helicopter blade (phase 2), or bladed spike (phase 3).

### Co-op (Act 3)
- Batman + Robin co-exist. Only ONE is on screen at a time
  (`drawCompanion` is NOT called during Act 3 gameplay — only the
  active `player` renders).
- Q / T on keyboard OR the `⇄ ROBIN / ⇄ BATMAN` button (top-left of
  canvas, `#btn-swap`) hot-swap between them.
- The one you swap OUT becomes `companion`; the one you swap IN
  becomes `player`. Companion is invisible; state is preserved.

### Robin's kit
- **ALWAYS carries the batarang.** Never batigarra. `switchCharacter`
  enforces this with `if (activeChar === 'robin') player.gadget = 'batarang';`
- **Aerial double jump** with a somersault animation. First jump uses
  `JUMP_VELOCITY`, second (mid-air) uses `JUMP_VELOCITY * 0.92`. Both
  reset when he touches the ground. Batman does NOT have double jump.

### Batman's kit
- Whatever he picked in Act 1 (batarang OR batigarra) — kept forever.
- If armored (Act 2 choice), spawns big every level, boss respawn,
  and post-hit re-suit. `armored = true` flag.
- Batigarra: grapple + rope reel with ⬆⬇. Batarang: single throw.

### Weapon-specific controls (`updateWeaponButton`)
- **Batarang** equipped: fire button shows 🪃, ⬆⬇ HIDDEN.
- **Batigarra** equipped: fire button shows 🪝, ⬆⬇ SHOWN (rope reel).
- Called on every `setGadget` and `switchCharacter`.

### Batcave (`CUEVA` level) — the hub
- The Batcave is a HUB that Batman returns to between acts and freely
  during Act 3+.
- Two entry modes:
  1. **Fresh post-2-4 arrival** (via rescue cutscene) —
     `caveHubReturn = false`. Alfred talks (news), Batcomputer opens
     with the news feed first, THEN the Mr. Freeze expediente, THEN
     the choice screen.
  2. **Hub visit** (via the `⌂ BATICUEVA` button in Act 3+) —
     `caveHubReturn = true`. Batman is forced back into control (Robin
     becomes companion). Alfred stays silent (`triggered = true` from
     the start). Batcomputer opens straight into the current-act
     expediente (Mr. Freeze), NO news feed re-play.
- `postTwoFaceReturn` is set by the rescue cutscene AND is auto-
  restored on Continue from `bitbros:act2beaten` in localStorage.
- Batcave level-select carousel (accessed via the entrance door):
  - Pre-Act 2 (`postTwoFaceReturn = false`): Act 1 levels only.
  - Post-Act 2: Act 1 AND Act 2 levels.
  - "SEGUIR" option always closes the menu and resumes the Batcave.
- The Batcomputer expediente content is the LORE of the max act
  reached:
  - Highest act reached is 1: **Two-Face** expediente (preview of
    the next boss).
  - Highest act reached is 2 or 3: **Mr. Freeze** expediente.

### Boss-fight rules (Bane & Two-Face)
- Batman losing a life during an ACTIVE boss fight does NOT respawn
  him. `hurtPlayer` decrements lives, gives invuln + a small
  knockback, and if armored, re-suits him. Boss keeps its HP,
  cage-cut count, etc. Only if lives hit 0 is it a real Game Over.
- Falls / timeouts still call `killPlayer` directly and bypass this
  branch.

### Frozen enemies (Act 3)
- Any level with `frozen: true` in its spec (and any thug/bird with
  `frozen: true`) uses these rules:
  - Frozen enemies move at ~30 % of normal speed (`vx: 0.35` for
    thugs, `0.5` for birds vs normal `1.2 / 1.7`).
  - First stomp / batarang hit **thaws** the enemy (`frozen = false`,
    speed restored to normal, +50 score, +5 coins etc.).
  - Second hit KILLS as usual.
  - Visual: cool blue tint (`rgba(120,180,220,0.4)`) over the sprite
    + snow cap on head/back. NO ice-cube encasement.
- Slippery physics: friction on a `frozen` level is `0.93` (vs
  normal `0.78 = FRICTION`). Batman keeps sliding but stays in
  control.

### Level layout — GENERAL RULES
- **Don't crowd the spawn**: no thug, bird or hazard within ~7 tiles
  of the level's `spawn.x`. Players need a beat to orient before the
  first fight. When trimming, the first thug range should start at
  tile `spawn.x + 7` or later.
- **Snow cannons block enemy patrols**: `patrolWallBounce` treats a
  living `snowCannon` as an invisible wall (AABB overlap → reverse
  vx). Thugs and birds should NOT walk / fly through cannons — they
  turn around at the cannon face.
- **Only necessary grapples**: keep swing points that are the ONLY
  way to cross a pit / wall / gap. Decorative grapples over stepped
  roofs or walls with ladders should be dropped so each anchor
  carries meaning.

### Character sprite alignment
- Robin (companion or active) is scaled by `player.h / 55` so his
  feet line up with Batman's exactly. NEVER draw him with a fixed
  scale.
- In cave, Robin runs his OWN tiny physics loop (gravity + step-up
  jump `vy = -6.5` when the tile ahead is higher). He does NOT
  mirror `player.y`.
- Alfred stands with feet ON the plateau (`y = plateauY - 66` for
  the 66 px-tall sprite). Never above or below.

---

## File Structure

### Core Game Files

#### `bat-bros-game/catalog.js` (~200 lines)
Game rules and constants:
- **All constants**: TILE, GRAVITY, JUMP_VELOCITY, GRAPPLE_RANGE, SIZES, etc.
- **`hash01(n)`**: Deterministic sin-based hash used by level builder and rendering
- **`buildLevel(spec)`**: Converts LEVEL_SPECS definitions into collision grids and entity lists
- **`buildCaveState()`**: Batcave-specific state (stalactites, ambient bats, drip columns)

#### `bat-bros-game/levels.js` (~220 lines)
Level data only:
- **`LEVEL_SPECS` array**: Declarative level definitions (geometry, enemies, coins, swing points)
- **`BOSS_LEVEL_INDEX`**: Index of the Bane boss level

#### `bat-bros-game/game.js` (~3800 lines)
Game engine (runtime logic):
- **`updatePlaying(dt)`**: Main game loop; handles input, physics, collision, enemy AI, player animation
- **`render()`**: Canvas drawing pipeline for terrain, entities, HUD, overlays
- **Swing/grapple system** (tryAttachGrapple, updateSwinging): Rope mechanics with ascent-only latch behavior
- **Boss system** (drawBane, updateBane): Bane state machine, shockwave generation, attack telegraph
- **Input handling** (handleKeyDown/Up, touchStart/End): Keyboard + touch control dispatch
- **Supabase persistence**: Player progress, gadget choice, game overs
- **Batcave UI**: Expediente screen, weapon choice, level select

#### `bat-bros-game/index.html`
- Canvas element and HUD container
- Overlay system (intro, game over, level complete)
- Touch control buttons (left/right movement, shoot, jump)
- Manifest link for PWA

#### `bat-bros-game/style.css`
- Canvas styling and responsive layout
- Touch control floating buttons (70px and 84px circles as of latest update)
- Overlay box styling with intro text and start button
- Landscape/portrait orientation handling
- HUD styling (lives, coins, level display)

#### `bat-bros-game/sw.js`
Service worker implementing a **network-first cache strategy**:
- Install: cache all assets (index.html, style.css, game.js, manifest, icons)
- Fetch: try network first, cache fallback
- Activate: clean up old caches
- Enables offline play once assets are cached

#### `bat-bros-game/manifest.json`
PWA manifest: app name, icons, display mode, theme colors

---

## Level Creation Guide

Levels are defined in the `LEVEL_SPECS` array as objects. Here's a template:

```javascript
{
  name: '1-X',
  width: 80,        // grid width (in tiles)
  height: 26,       // grid height (in tiles)
  groundY: 24,      // tile row where street level begins (solid below this)
  
  pits: [
    [18, 20],       // pit from tile x=18 to x=20 (ground is NOT solid here)
  ],
  
  platforms: [
    { x: 8, y: 21, w: 3 },  // a small rooftop platform at (8,21) width 3
  ],
  
  walls: [
    { x: 30, w: 3, topRow: 18 }  // tall building wall: x=30, width=3, roof at row 18
  ],
  
  houses: [
    { x: 54, w: 6, topRow: 20, baseRow: 24 }  // gabled-roof house: sits from row 20 to 24, roof ridge at row 20
  ],
  
  swingPoints: [
    [31, 14],       // lamppost anchor at (x=31, row=14) — reachable mid-jump
    [49, 16],
  ],
  
  coins: [
    [9, 20], [39, 20],  // coin positions for collectibles
  ],
  
  thugs: [
    { x: 30, y: 18, range: [30, 32] }  // thug at x=30, patrol range x=30 to x=32
  ],
  
  birds: [
    { x: 47, y: 20, range: [45, 53] }  // flying enemy
  ],
  
  bats: [
    [39, 21]  // power-up bat to unlock batarang
  ],
  
  spawn: { x: 2, y: 22 },  // player starting position
}
```

### Collision Geometry Rules

- **Ground**: All tiles at or below `groundY` are solid (walkable street level)
- **Pits**: Ranges where ground is NOT solid (must jump or swing across)
- **Platforms**: Isolated rooftops above ground (1-3 tiles, hoppable with jump)
- **Walls**: Tall vertical obstacles (must use grapple swing to clear)
- **Houses**: Gabled-roof pyramids with a flat ridge top (1-tile steps up, hoppable)
- **Swing points**: Lamppost anchors; Batman auto-latches within `GRAPPLE_RANGE` (170px) if swinging upward

### Layout Principles

The vertical-city design follows these rules for reachability:

1. **Jump height**: ~3 tiles max (player jumps ~3.8 tile-heights)
2. **Rooftop spacing**: Roofs ≤3 tiles apart are hoppable
3. **Wall climbing**: Walls 6 tiles tall are designed to be grapple-climbed with a swing anchor positioned 2 tiles above the roof
4. **Swing point formula**: Place anchor at `x = wall.x + 1`, `y = topRow - 2` for reliable mid-jump latch

---

## Physics System

### Core Constants
```javascript
GRAVITY = 0.52           // pixels/frame² (strong gravity for snappy feel)
MAX_FALL = 15            // terminal velocity in pixels/frame
JUMP_VELOCITY = -11.2    // initial upward velocity (tight 3.8-tile jump)
FRICTION = 0.78          // ground friction multiplier
MOVE_ACCEL = 0.7         // acceleration while running
MAX_SPEED = 4.4          // max horizontal speed in pixels/frame
JUMP_BUFFER_MS = 140     // grace window to store a jump press
COYOTE_MS = 90           // grace window to jump after walking off edge
```

### Collision Detection

**Tile-based grid collision**:
- `level.solid[tileY][tileX]` is a boolean grid
- Player rect tested against solid tiles each frame
- Sliding: if blocked, player pushed out via binary search in `tryMove()`

**Stomp detection**:
- Downward velocity + player bottom overlapping enemy top within `STOMP_TOLERANCE` (14px)
- Bounces with `STOMP_BOUNCE` velocity (-8.5 px/frame = upward bounce)
- Grants i-frames to prevent repeated hits

### Swing/Grapple Mechanics

**Latch behavior** (`tryAttachGrapple`):
1. Player within `GRAPPLE_RANGE` (170px) of a swing anchor
2. Player is moving UPWARD (`player.vy < 0`) — ascent-only to prevent accidental re-engagement on descent
3. If anchor has `minR` (trapeze), must be closer than `TRAPEZE_LATCH_RANGE` (70px)
4. Once latched: store anchor position, initialize swing with physics

**Swing physics** (`updateSwinging`):
- Treat Batman as a pendulum: angle θ and radius r from anchor
- Angular acceleration: `τ = -sin(θ) × gravity / radius`
- Velocity: `dθ/dt` accumulates angular acceleration
- Release: happens automatically when angle exceeds `SWING_RELEASE_ANGLE` (1.15 rad, ~66°)
- Can be interrupted by player jump request

**Rope interaction**:
- Lamposts connect to first solid tile below the anchor (visual pole drawn to roof or street)
- Trapezes have fixed rope length (`minR`), latch near the bar not the ceiling

---

## Input System

### Keyboard Controls
```
A / Arrow Left    : Move left
D / Arrow Right   : Move right
W / Arrow Up      : Jump (or held for jump buffer)
Space / Shift     : Jump (alternative)
S / Arrow Down    : Jump release (for swing abort)
E / Z             : Shoot (batarang, Act 2+)
```

### Touch Controls
- **Left controls**: D-pad circles for left/right movement
- **Right controls**: Red circle for jump, blue circle for shoot (Act 2)
- Buttons enlarge on mobile landscape (70px standard, 84px jump button)
- Hidden on mouse/desktop devices via CSS media query

### Input Dispatch
- `handleKeyDown/Up(e)` processes keyboard
- `handleTouchStart/End(e)` processes touch
- Events stored in global `keys` object: `{ left, right, jump, shoot }`
- Main loop reads `keys.*` and calls `requestJump()` / `requestShoot()` as needed

---

## Game States

```
'menu'            : Overlay showing intro/instructions, waiting for player to click
'playing'         : Active gameplay, physics running
'levelcomplete'   : Level cleared, waiting for next level or game over check
'dead'            : Player defeated, waiting to continue (if coins) or game over
'gameover'        : Final game over, show score and restart option
```

Transitions controlled by `state` variable and overlay visibility.

---

## Enemy Systems

### Thugs (Street-Level Crooks)
- **Spawn**: Ground level or rooftops
- **AI**: Patrol range [minX, maxX], flip direction at boundaries
- **Speed**: ~1.2 px/frame
- **Death**: Stomped by player (bounce) or shot by batarang

### Birds (Flying Patrols)
- **Spawn**: Mid-air above ground
- **AI**: Patrol range with horizontal flying, bob up/down slightly
- **Speed**: ~1.7 px/frame
- **Death**: Stomped or shot

### Bane (Act 1 Boss)
**State machine**:
- `idle`: Standing still (small sprite, 30×44px)
- `growing`: Pressed venom button, expanding over `BANE_GROW_MS` to big form (92×150px)
- `fight`: Full-size, patrolling and launching attacks
- `telegraph`: Crouch animation before shockwave jump (duration `BANE_TELEGRAPH_MS`)
- `jumping`: In the air after jump, lands and generates a shockwave ring

**Attack cycle**:
1. Crouches (telegraph) for 1.8s
2. Leaps upward, travels arc across arena
3. On landing, spawns shockwave ring (expanding circle, `WAVE_SPEED` = 5px/frame)
4. Shockwave damages player if at floor level (excludes perched players)

**Damage**:
- Player dive: touch top of Bane's head while falling (`player.vy > 0` and player.y + player.h < bane.y)
- Decrements `bane.hp`; triggers hit flash animation
- Death at `hp <= 0`

---

## Deterministic Testing

The game supports a **monkeypatched fake clock** for frame-stepping tests:

```javascript
// In test setup:
let simMs = 0;
const dateBase = Date.now();
performance.now = () => simMs;
Date.now = () => dateBase + simMs;

// Each game frame:
simMs += 1000 / 60;  // increment by ~16.67ms
updatePlaying(1);    // advance game by 1 frame
```

This ensures all real-time constants (jump buffer, grapple cooldown, invuln frames) behave exactly as at 60fps, regardless of test execution speed.

**Test files**:
- `test_traversal.js`: Bot attempting each level segment with varied jump cadence to verify reachability
- `test_v2_features.js`: Feature verification (no-rope-latch descent, coin bonuses, Bane arena, etc.)

Run with:
```bash
npm test
```

Tests launch Playwright, navigate to `http://localhost:8810/index.html`, and execute the test script in-page.

---

## Rendering Pipeline

### Draw Order
1. **Background**: Solid blue sky color
2. **Terrain**: Tile grid (dark gray for solid, sky blue for empty)
3. **Enemies**: Thugs, birds (simple sprite rectangles, colored by state)
4. **Coins**: Yellow circles
5. **Bats** (power-ups): Bat sprite outline
6. **Bane** (boss): Large sprite with limbs, face, and venom highlights
7. **Player**: Batman sprite with direction, animation frame, rope (if swinging)
8. **Gargoyles** (indoor): Silhouettes on perch platforms
9. **Overlays**: HUD (top), dialogs (center)

### Sprite System
- No image assets; all shapes drawn via Canvas 2D primitives (rect, circle, lines)
- Sprite state encoded in constants: `SIZES`, `player.facing`, `player.onGround`, `player.swinging`
- Animation frames selected based on player action: idle, walking, jumping, swinging, falling

### HUD Display
- **Top left**: Level name
- **Top center**: Lives count
- **Top right**: Coins collected / Total coins in level
- Updates each frame by reading game state

---

## Extending the Game

### Adding a New Level

1. **Create a LEVEL_SPECS entry** in `levels.js`
2. **Define geometry**: width, height, groundY, pits, platforms, walls, houses
3. **Place swing anchors**: Use the 6-tile-height formula for wall climbs
4. **Spawn enemies**: thugs, birds, bats with patrol ranges
5. **Add coins**: scattered for collectible paths
6. **Set spawn point**: starting position for the level
7. **Test reachability**: Ensure each area is jump/swing reachable

### Adding a New Enemy Type

1. **In `buildLevel()`**: Add a new entity category to the `spec` parameter
2. **Initialize in entity list**: Map positions and state (speed, health, etc.)
3. **In `updatePlaying()`**: Add an update function for the enemy type (movement, AI, collision)
4. **In `render()`**: Draw the enemy sprite
5. **Add to stomp/shot logic**: Define how player defeats it

### Adding a Power-Up or Item

1. **Spawn definition**: Add to level spec (coins array, bats array, etc.)
2. **Collision detection**: In `updatePlaying()`, check player overlap
3. **Effect**: Modify player state or level state when picked up
4. **Visual feedback**: Draw item in render(), play collection sound if desired

### Modifying Physics

All physics constants are in `catalog.js`. Adjusting them changes:
- Jump height: `JUMP_VELOCITY`
- Fall speed: `GRAVITY`, `MAX_FALL`
- Movement: `MOVE_ACCEL`, `MAX_SPEED`, `FRICTION`
- Grapple: `GRAPPLE_RANGE`, `SWING_RELEASE_ANGLE`

### Adding Sounds/Music

Currently: No audio. To add:
1. Create `Audio` elements in HTML
2. In event handlers (damage, coin, jump), call `.play()`
3. Consider muting on mobile until first user interaction (browser autoplay policy)

---

## File Manifest

```
bat-bros-game/
  ├── catalog.js           # Constants, physics values, buildLevel(), hash01()
  ├── levels.js            # LEVEL_SPECS array + BOSS_LEVEL_INDEX
  ├── game.js              # Game engine: input, physics, rendering, UI
  ├── index.html           # Canvas, controls, overlay markup
  ├── style.css            # Styling, touch control layout, responsive design
  ├── sw.js                # Service worker (offline support)
  ├── manifest.json        # PWA metadata
  ├── icon-192.png         # App icon (192×192)
  ├── icon-512.png         # App icon (512×512)
  └── README.md            # Game intro (optional)

tests/
  ├── test_traversal.js    # Bot testing level reachability
  └── test_v2_features.js  # Feature verification (bosses, items, mechanics)

CLAUDE.md                   # This file
```

---

## Development Workflow

### Local Setup
```bash
# Install dependencies
npm install

# Run dev server
npm run serve      # or similar — check package.json

# Open in browser
http://localhost:8810/index.html
```

### Testing
```bash
# Run deterministic tests
npm test
```

### Deploying
1. Ensure no console errors in dev
2. Run tests to verify mechanics
3. Commit changes to version control
4. Service worker cache version increments automatically (CACHE_NAME in sw.js)
5. Push to hosting platform (GitHub Pages, Netlify, etc.)

---

## Known Limitations & Future Work

- **No audio**: Add via HTML Audio API when wanted
- **No mobile rotation handling**: Explicitly ask for landscape (CSS media query active)
- **No particle effects**: Could add via canvas drawing in render loop
- **No leaderboard/save system**: Local storage integration optional
- **No Act 2+ content**: Framework supports enemy variety, more levels, new mechanics (batarang, etc.)

---

## Performance Notes

- **Canvas 2D**: Sufficient for this sprite-based platformer; no WebGL needed
- **Physics**: 60fps on modern devices; frame timing tested via monkeypatched clock
- **Asset size**: No images; all logic + styling < 50KB (no dependencies)
- **Offline**: Service worker caches entire game for offline play once visited

---

## Credits & Context

Built as a Batman-themed platformer learning project. Custom physics engine demonstrates:
- Tile-based collision detection
- Pendulum swing mechanics
- State machine design (boss AI)
- PWA offline capability
- Deterministic testing for reproducible gameplay

Happy extending!
