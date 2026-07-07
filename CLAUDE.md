# Bit Bros — Game Architecture Guide

A Batman platformer built in pure Canvas 2D with custom physics, no external game engines. 60fps deterministic gameplay verified through monkeypatched clock testing.

## Project Overview

**Bit Bros** is a vertical-city rooftop platformer featuring Batman traversing Gotham's streets and buildings, defeating thugs and birds, collecting coins, and facing off against the supervillain Bane in an indoor boss arena.

- **Engine**: Canvas 2D, custom physics (no Phaser, Kaboom, or similar)
- **Architecture**: Single-file game logic (game.js ~2700 lines) + styling + HTML markup
- **Physics**: Custom gravity, friction, pendulum swing mechanics, stomp bounce detection
- **Levels**: 4 programmatically generated levels (Act 1) defined in `LEVEL_SPECS` array
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

## File Structure

### Core Game Files

#### `bit-bros-game/game.js` (~2700 lines)
The heart of the game. Contains:
- **Constants** (lines 1-50): gravity, jump velocity, move speed, grapple range, etc.
- **`buildLevel(spec)`** (lines 56-150): Converts LEVEL_SPECS definitions into collision grids and entity lists
- **`LEVEL_SPECS` array** (lines 160-462): Declarative level definitions (width, height, platforms, walls, houses, swingPoints, enemies, coins)
- **`updatePlaying(dt)`**: Main game loop; handles input, physics, collision, enemy AI, player animation
- **`render()`**: Canvas drawing pipeline for terrain, entities, HUD, overlays
- **Swing/grapple system** (tryAttachGrapple, updateSwinging): Rope mechanics with ascent-only latch behavior
- **Boss system** (drawBane, updateBane): Bane state machine, shockwave generation, attack telegraph
- **Input handling** (handleKeyDown/Up, touchStart/End): Keyboard + touch control dispatch

#### `bit-bros-game/index.html`
- Canvas element and HUD container
- Overlay system (intro, game over, level complete)
- Touch control buttons (left/right movement, shoot, jump)
- Manifest link for PWA

#### `bit-bros-game/style.css`
- Canvas styling and responsive layout
- Touch control floating buttons (70px and 84px circles as of latest update)
- Overlay box styling with intro text and start button
- Landscape/portrait orientation handling
- HUD styling (lives, coins, level display)

#### `bit-bros-game/sw.js`
Service worker implementing a **network-first cache strategy**:
- Install: cache all assets (index.html, style.css, game.js, manifest, icons)
- Fetch: try network first, cache fallback
- Activate: clean up old caches
- Enables offline play once assets are cached

#### `bit-bros-game/manifest.json`
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

1. **Create a LEVEL_SPECS entry** in `game.js` (around line 160)
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

All physics constants are at the top of `game.js` (lines 1-50). Adjusting them changes:
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
bit-bros-game/
  ├── game.js              # Main game logic, physics, levels
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
