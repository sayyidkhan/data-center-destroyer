# Data Center Destroyer: Single-Player Project Vision

## Purpose

This document captures what the current single-player game is, how it plays, what systems already exist, and which assumptions are embedded in the codebase today. It is intended to be the baseline reference before designing multiplayer, so future decisions can distinguish between existing game identity and new networked features.

## High-Level Concept

Data Center Destroyer is a cyber-themed single-player tower defense game. The player defends a data center on the left side of a wide horizontal map while enemy waves enter from a spawn portal on the right and follow a fixed winding path into the facility intake bay.

The player wins by surviving all 15 waves. The player loses when enough enemies reach the data center and lives fall to zero.

The experience combines three defense layers:

- Strategic tower placement on a grid.
- Tower upgrades, sell decisions, and gold economy.
- Direct map control through a movable defense mecha that automatically fires at enemies in range.

## Current Player Experience

The game starts on a menu overlay with the title, theme framing, and quick instructions. Launching the game moves into a preparation state where the player can inspect the HUD, shop, tower briefing panel, and map before starting the first wave.

During play, the player:

- Selects one of five tower types from the bottom shop.
- Places towers on empty grid cells.
- Starts waves manually.
- Uses gold earned from kills and wave completion to build or upgrade defenses.
- Selects placed towers to inspect stats, upgrade them up to level 3, sell them, or deselect them.
- Clicks or right-clicks the map to move the defense mecha.
- Pans the wide map with edge scrolling, mouse wheel, arrow keys, or `A`/`D`.
- Pauses, changes simulation speed, restarts, or continues to the next wave.

The game is intentionally framed as an operations deck: the top HUD reports lives, gold, score, kills, current or incoming wave, enemy roster, spawn progress, wave bonus, pause control, and speed presets. The bottom footer contains the mecha status panel, tower shop, and tower inspector.

## Core Objective

Protect the data center for 15 waves.

Success means all enemies in wave 15 are defeated before lives reach zero. Failure means enemies leak through the path into the data center enough times to exhaust the starting 20 lives.

## Map And Camera

The map is a 42-column by 14-row grid. Each cell is 36 pixels. The visible viewport shows 32 columns at a time, so the player views a horizontal slice of a larger battlefield.

The data center is fixed near the left edge. The enemy spawn portal is near the top-right side of the full map. The path snakes through the map and ends with a straight run into the data center intake bay.

Only empty cells can receive towers. Path cells are blocked from placement. Built tower cells become occupied and can be freed again by selling the tower.

The camera is local UI state stored as `cameraX`. It has no gameplay meaning except changing what part of the map is visible.

## Game Phases

The current game state has these phases:

- `menu`: title screen and launch prompt.
- `wave_complete`: between-wave preparation state.
- `playing`: active simulation, spawning, movement, attacks, projectiles, and wave completion checks.
- `paused`: overlay state that freezes game simulation.
- `game_over`: loss screen after lives reach zero.
- `victory`: win screen after the final wave is cleared.

The active simulation only advances while the phase is `playing`.

## Resources And Scoring

The player starts with:

- 200 gold.
- 20 lives.
- 0 score.
- No towers.
- One defense mecha.

Gold is spent on tower placement and upgrades. Gold is earned from enemy kills and wave-clear bonuses. Score increases from enemy rewards and wave bonuses. The run also tracks total kills and total gold earned.

Selling a tower refunds 60% of its base cost plus 60% of any upgrade costs already invested.

## Towers

There are five tower types. Each has a cost, damage, range, fire rate, color identity, projectile or effect type, and upgrade costs for levels 2 and 3.

### Cannon

Role: debuff and priority target pressure.

The cannon fires bullets. On hit, it can apply one of two debuffs:

- Armor break: reduces effective armor for a short duration.
- Exposed: increases damage taken for a short duration.

The chance, duration, armor break amount, and exposed bonus improve with tower level.

### Laser

Role: rapid sustained damage.

The laser deals continuous damage during a beam cycle. It fires for 2 seconds, then cools down for 1 second. Its damage is applied directly over active beam time instead of using normal projectile travel.

### Frost

Role: crowd control.

The frost tower fires bolts that deal splash damage, apply an area slow, and have a 20% chance to freeze affected enemies for 1 second.

### Tesla

Role: chain damage.

The tesla tower instantly zaps a target and chains to nearby enemies. Chain hop count scales with tower level. Later hops deal reduced damage, but the effect can hit multiple enemies in one firing cycle.

### Missile

Role: heavy splash damage.

The missile tower has high damage, long range, slow fire rate, and splash radius. It is strongest against clustered enemies and high-health pressure.

## Tower Upgrades

All towers can reach level 3. Upgrading increases:

- Damage by 1.5x.
- Range by 1.15x.
- Fire rate by 1.2x.

Some special behavior also scales by level, such as cannon debuff strength and tesla chain count.

## Defense Mecha

The player controls a mobile defense mecha on the map. It is not built through the shop and does not cost resources.

The mecha has:

- Position and target position.
- Movement speed.
- Damage.
- Range.
- Fire rate.
- Current target.
- Facing angle.
- Lifetime kill count.

The player commands movement by clicking or right-clicking the map. The mecha moves toward the target point, rotates toward movement or combat targets, and automatically fires machine rounds at the enemy closest to the end of the path within range.

The mecha is currently a local single-player support unit. It has no health, collision, upgrade path, ownership model, cooldown abilities, or death state.

## Enemies

There are five enemy types.

### Grunt

Baseline enemy with moderate health, normal speed, and low reward.

### Speeder

Fast enemy with low health and higher reward than a grunt.

### Tank

Slow enemy with high health, armor, and larger reward.

### Swarm

Small low-health enemy with fast spawn pressure and low reward.

### Boss

Large high-health armored enemy with boss flag, large reward, and major pressure in late waves.

Enemy health scales by wave using a linear multiplier based on the current wave number.

## Waves

The game has 15 fixed waves. Each wave defines enemy groups, counts, spawn intervals, and a gold bonus for clearing the wave.

Wave difficulty ramps from basic grunt waves into mixed waves, swarm pressure, tanks, mini-bosses, multiple bosses, and a final wave containing bosses, tanks, and swarms.

Wave spawning is controlled by a sorted list of enemy spawn configs with delays measured from the wave start. The engine tracks how many enemies have spawned and marks a wave complete when all configured enemies have spawned and all active enemies are dead.

## Targeting Rules

Towers and the mecha target enemies in range using path progress priority. The selected target is the alive enemy closest to the end of the path among enemies within range.

This means defenses naturally focus on enemies most likely to leak rather than closest by distance or lowest health.

## Combat Rules

The simulation updates every animation frame while playing.

Each tick performs:

- Enemy spawning.
- Enemy movement and status timer updates.
- Mecha movement and firing.
- Tower targeting and firing.
- Projectile movement and impact handling.
- Particle updates.
- Short-lived visual effect updates.
- Wave completion or victory checks.

Damage uses armor mitigation. Effective armor is enemy armor minus any active armor break. Damage cannot fall below a minimum value. Exposed enemies take increased damage.

Status effects include:

- Slow factor and slow timer.
- Freeze timer.
- Armor break timer and amount.
- Exposed timer and multiplier.

Enemies that reach the path end are removed and reduce lives by one each. Enemies killed by towers or the mecha reward gold, score, kill count, and source-specific kill attribution.

## Rendering And Visual Identity

The game renders the battlefield on a `<canvas>` and uses React components for surrounding UI.

The visual style is cyber-defense: dark base colors, blue/cyan glows, terminal-like typography, animated paths, a detailed data center campus, spawn portal, projectile effects, particles, lightning, frost bursts, tower range previews, and a mobile mecha.

The menu uses a procedural canvas backdrop rather than a static image. The live battlefield renders:

- Grid cells and placement hover states.
- Path tiles and animated center line.
- Data center structure with animated server racks, cooling, power, bay doors, and antenna.
- Spawn portal.
- Towers and level badges.
- Defense mecha and target marker.
- Enemies and health/status visuals.
- Laser beams, projectiles, particles, and area effects.
- Build or selected tower range previews.

## UI Architecture

The React app owns the canvas, the game state ref, and user input handlers. `useGameLoop` advances the engine, renders the canvas, and periodically publishes a React snapshot so UI components can update without rerendering every frame.

Major UI surfaces:

- `HUD`: resources, wave preview, live wave info, pause, and speed controls.
- `GameOverlay`: menu, pause, game over, and victory overlays.
- `TowerShopStrip`: tower purchase buttons and hotkey hints.
- `TowerInspector`: selected tower, selected build preview, or briefing placeholder.
- `HeroStatus`: mecha status and stats.

The UI currently assumes one local player and one authoritative local game state.

## Input Model

Current controls:

- Click empty grid cell with a tower selected: place tower.
- Click placed tower: select tower.
- Click map with no tower placement action: move the mecha.
- Right-click map: move the mecha.
- Mouse near viewport edge: pan camera left or right.
- Mouse wheel: horizontal camera pan.
- `1` through `5`: select tower type.
- `Space` or `Enter`: start from menu or begin next wave.
- `P`: pause or resume.
- `Escape`: clear tower selection.
- `ArrowLeft`, `ArrowRight`, `A`, `D`: pan camera.

The input model is immediate and local. There is no command queue, replay log, rollback model, server validation, or ownership boundary.

## Current Technical Shape

The project is a Vite React TypeScript app.

Important files:

- `src/App.tsx`: top-level app state, canvas event handling, keyboard input, camera handling, layout shell, and action dispatch.
- `src/hooks/useGameLoop.ts`: `requestAnimationFrame` loop, engine tick, canvas render, and React snapshot update.
- `src/game/engine.ts`: state creation, tower placement, selling, upgrading, wave start, enemy spawning, movement, targeting, combat, projectiles, particles, effects, win/loss checks.
- `src/game/constants.ts`: map dimensions, path waypoints, starting resources, hero stats, tower definitions, enemy definitions, and wave definitions.
- `src/game/types.ts`: core game state and entity types.
- `src/game/pathfinding.ts`: path construction, path grid construction, geometry helpers.
- `src/game/renderer.ts`: canvas rendering for the battlefield and menu backdrop.
- `src/components/*`: HUD, overlays, tower shop, inspector, wave preview, and stat display.

## Single-Player Assumptions To Preserve Or Revisit

The current implementation makes several assumptions that are fine for single-player but important for multiplayer planning:

- The browser is authoritative over all game state.
- Game state is mutable through a local React ref.
- Randomness is used directly in combat effects and particles.
- Entity IDs are generated from a module-level incrementing counter.
- Timing depends on `requestAnimationFrame`, local delta time, and local speed settings.
- Pausing and speed changes affect the only simulation.
- All input is trusted and applied immediately.
- There is exactly one player, one gold pool, one life total, one mecha, one tower ownership domain, and one camera.
- Rendering-only effects and gameplay state live in the same state object.
- Camera state is stored alongside gameplay state.
- The mecha has no ownership, health, collision, or respawn rules.

These assumptions should be treated as design decisions to revisit before adding real-time multiplayer.

## Current Strengths

The single-player version already has a clear and playable loop:

- A complete win/loss arc.
- Multiple enemy types and tower roles.
- Economy pressure through build, upgrade, and sell choices.
- Strong visual feedback for attacks and statuses.
- A wide map that creates spatial planning.
- A direct-control mecha that differentiates the game from pure tower defense.
- Centralized gameplay definitions in constants.
- A mostly pure engine surface for major actions like placing, selling, upgrading, starting waves, and ticking simulation.

## Current Gaps

Known gaps from a project-vision perspective:

- No persistence, run history, profile, save/load, or settings storage.
- No tutorial flow beyond quick menu instructions.
- No audio system.
- No formal test coverage for engine behavior.
- No deterministic random seed for replays or synchronized simulation.
- No separation between authoritative game state, local-only UI state, and cosmetic-only effects.
- No multiplayer concepts such as players, rooms, ownership, synchronization, chat, ready states, latency handling, or server authority.

## Multiplayer-Relevant Baseline

Before adding multiplayer, the current single-player game should be understood as a complete local simulation. A multiplayer design can build from this baseline in several directions:

- Cooperative defense with shared lives, shared or split gold, and multiple player-controlled mechas.
- Competitive defense where players send enemies, race wave clears, or defend separate data centers.
- Asynchronous challenge runs using seeds, leaderboards, and replayable command logs.
- Spectator or co-pilot mode where one player places towers and another controls the mecha.

The single-player identity worth preserving is: defend a cyber facility through tower strategy plus active mecha intervention across a wide map under escalating wave pressure.
