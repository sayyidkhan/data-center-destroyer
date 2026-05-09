# Data Center Destroyer: Multiplayer Project Vision

## Purpose

This document captures the multiplayer direction before implementation begins. The immediate target is a PvP proof of concept where the opponent is controlled by AI. Real networked multiplayer should come later, after the PvP rules and simulation structure feel solid locally.

## Core PvP Concept

Data Center Destroyer multiplayer should keep the current tower defense identity, but add an offensive job for each player.

Every match gives each player two responsibilities:

- Defend their own data center by placing, upgrading, and selling towers.
- Deploy enemy troops to damage the opponent's data center.

The objective changes from surviving fixed single-player waves to destroying the opponent's data center before they destroy yours.

## Match Objective

Each player has a data center with health points.

The player wins when the opponent's data center HP reaches zero. The player loses when their own data center HP reaches zero.

The UI should always show:

- Player base HP.
- Opponent base HP.
- Opponent health bar.
- Current offensive resource or attack budget.
- Current defensive economy.

## POC Direction

The first multiplayer prototype should not be networked. It should be local player versus AI.

This proves the match loop without introducing server architecture, latency, synchronization, room state, matchmaking, or reconnection complexity.

For the POC:

- The player controls their own defense and attack decisions.
- The opponent is an AI-controlled side.
- Both sides use the same tower, enemy, economy, and map metadata.
- The player can send enemy troops to the AI side.
- The AI can send enemy troops to the player side.
- Base HP replaces or evolves the current single-player lives concept.

## PvP Core Loop

The intended loop:

1. Player earns defensive and offensive resources over time, through kills, or through wave pressure.
2. Player spends defensive resources on towers and upgrades.
3. Player spends offensive resources to deploy troop packages against the opponent.
4. Deployed troops spawn on the opponent's board and follow the path toward the opponent data center.
5. Each side's defense attempts to stop incoming troops.
6. Leaked troops damage the target data center.
7. The match ends when one data center reaches zero HP.

## Economy Recommendation

For the POC, split the economy into at least two resources:

- `gold`: defensive resource for towers, upgrades, and possibly repairs.
- `threat`, `energy`, or `attackPower`: offensive resource for deploying enemy troops.

This is safer than one shared currency because it prevents early prototypes from collapsing into one dominant behavior. With one currency, players may either turtle forever or spend everything on attacks and lose immediately.

The split can be revisited later if a single-resource game feels better.

## Attack Shop

PvP should introduce an attack shop alongside the existing tower shop.

Initial attack packages:

- Grunt Pack: cheap baseline pressure.
- Speeder Rush: fast leak threat.
- Tank Push: expensive armored pressure.
- Swarm Burst: many weak enemies to overload splash or targeting.
- Boss Signal: late-game high-cost pressure.

Each package should eventually have:

- Cost.
- Cooldown.
- Enemy payload.
- Unlock timing.
- Scaling behavior.
- Spawn delay or cadence.

## AI Opponent POC

The first AI should be simple and scripted.

Minimum useful behavior:

- Builds towers at predefined good cells.
- Upgrades towers when affordable.
- Sends attack packages on a timer.
- Escalates troop choice as match time increases.
- Reacts lightly to player pressure, such as prioritizing upgrades if its HP is low.

The AI does not need advanced planning for the first POC. Its job is to create pressure and validate the PvP loop.

## Match State Direction

The current single-player game has one `GameState`. PvP needs a match-level state with two mirrored sides.

Conceptual shape:

```ts
interface MatchState {
  phase: 'menu' | 'playing' | 'paused' | 'game_over';
  elapsedMs: number;
  winner: 'player' | 'opponent' | null;
  sides: {
    player: PlayerSideState;
    opponent: PlayerSideState;
  };
}
```

Each side should own its battlefield and economy:

```ts
interface PlayerSideState {
  baseHp: number;
  maxBaseHp: number;
  gold: number;
  offenseResource: number;
  towers: Tower[];
  hero: Hero;
  enemies: Enemy[];
  projectiles: Projectile[];
  particles: Particle[];
  effects: VisualEffect[];
}
```

Camera, hover state, selected tower, selected attack package, and local UI state should not be part of authoritative match simulation state.

## Data Externalization Before Multiplayer

Before building PvP or networked multiplayer, move dynamic gameplay metadata out of TypeScript constants and into JSON data files. This will make syncing easier because clients, AI simulations, and eventual servers can load the same canonical definitions instead of relying on hardcoded local constants.

Good candidates for JSON-backed metadata:

- Tower definitions: cost, damage, range, fire rate, descriptions, projectile type, splash radius, slow values, upgrade costs, colors, and trait scaling.
- Enemy definitions: health, speed, reward, armor, size, boss flag, and visual colors.
- Wave definitions: enemy groups, counts, intervals, and clear bonuses.
- Map definitions: grid dimensions, cell size, viewport settings, path waypoints, spawn location, and base/intake location.
- Hero/mecha defaults: starting position, movement speed, damage, range, fire rate, and future ability metadata.
- Economy tuning: starting gold, starting lives or base HP, score multipliers, sell refund rate, passive income, and offense resource rules.
- PvP attack shop definitions: troop package costs, cooldowns, spawn payloads, scaling rules, and unlock timing.

Recommended structure:

- `src/data/towers.json`
- `src/data/enemies.json`
- `src/data/waves.json`
- `src/data/map.json`
- `src/data/economy.json`
- `src/data/hero.json`
- `src/data/pvp-attacks.json`

The first implementation should keep the engine behavior unchanged. TypeScript can import these JSON files, validate or normalize them once at startup, and continue exposing typed constants to the rest of the game. That keeps the refactor low-risk while creating a clearer boundary between simulation code and gameplay tuning.

This also creates a better path for multiplayer later:

- Both players can verify they are using the same metadata version.
- AI and player simulations can share one data source.
- A future server can become authoritative over match rules.
- Balance changes can happen without rewriting engine logic.
- Replay or sync systems can include a metadata version hash.

## Implementation Milestones

Recommended order:

1. Move dynamic gameplay metadata into JSON without changing behavior.
2. Add base HP as a concept separate from current lives, even if single-player still maps lives to base damage.
3. Add opponent HP display and health bar to the HUD.
4. Add offensive resource generation.
5. Add an attack shop UI.
6. Let the player deploy enemy packages against an AI side.
7. Add simple AI defense behavior.
8. Add simple AI attack behavior.
9. Split the simulation into `MatchState` with player and opponent side states.
10. Add local PvP win/loss conditions.
11. Only after the local PvP POC is fun, design real networked multiplayer.

## Networking Later

Real multiplayer should wait until the local PvP match model is proven.

When networking begins, the preferred long-term direction is server-authoritative simulation or server-authoritative command validation. The current local simulation can inform the server model, but should not be trusted as-is for competitive multiplayer.

The game should eventually define:

- Player IDs and side ownership.
- Command messages for tower placement, upgrades, sells, hero movement, and attack deployment.
- Metadata version hashes.
- Match start and ready states.
- Server tick or command timeline.
- Reconnect and resync behavior.
- Anti-cheat boundaries.
- Spectator or replay model.

## Open Design Questions

- Should players share the exact same map or defend mirrored boards?
- Should the player see the opponent's full board, only base HP, or partial scouting information?
- Should offensive resource be passive, kill-based, leak-based, or generated by dedicated economy towers?
- Should troop packages be instant purchases, queued waves, or card-like cooldowns?
- Should the mecha stay only defensive, or can it invade, buff attacks, or trigger abilities?
- Should PvP matches have fixed duration pressure, sudden death, or endless scaling?
- Should AI use the exact same rules as the player or have simpler hidden logic for the POC?
