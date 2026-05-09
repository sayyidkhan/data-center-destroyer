# Game Data Files

This folder contains gameplay metadata that was moved out of TypeScript code so the client, AI opponent, and future backend can read the same canonical game rules.

The JSON files should stay data-only. Do not add comments inside JSON. Document intent here instead.

## Source Files And Generated Bundle

The split JSON files are the authoring source because they are easier to review and edit by domain.

`game-data.generated.json` is the generated sync bundle. It contains all gameplay metadata in one file, plus:

- `schema`: identifies the bundle format.
- `version`: identifies the game data version.
- `contentHash`: SHA-256 hash of the version and source data.
- `sources`: lists the source files used to build the bundle.
- `data`: contains the merged map, economy, hero, tower, enemy, wave, combat, and PvP attack data.

Do not edit `game-data.generated.json` manually. Edit the source JSON files, then run:

```sh
npm run generate:game-data
```

This also runs automatically before:

- `npm run dev`
- `npm run build`
- `npm run start`

## `pvp-attacks.json`

Defines attack packages used by the local PvP proof of concept.

Used for:

- Attack package names.
- Offensive resource costs.
- Cooldowns.
- Travel/combat tuning for attack packages.
- Base damage reference for future balancing.
- Enemy payloads that spawn player-owned units on the visible attack road.

Backend relevance:

- A server can validate attack purchases, cooldowns, payloads, and damage.
- The same payload metadata spawns real units in the local PvP POC and can later be validated by an authoritative server.

## `map.json`

Defines the physical battlefield layout and UI shell dimensions.

Used for:

- Cell size.
- Grid width and height.
- Visible viewport width in grid columns.
- HUD/footer layout heights.
- Defensive path waypoints that opponent units follow toward the player base.
- Attack path waypoints that player-deployed units follow toward the opponent base.
- Enemy-side AI tower loadout for the local PvP proof of concept.

Backend relevance:

- A server simulation needs the same grid and path to validate tower placement, enemy movement, leaks, and replay state.
- Clients can compare a metadata version/hash to make sure everyone is using the same map.

## `economy.json`

Defines run-level economy and progression tuning.

Used for:

- Starting gold.
- Starting lives.
- Maximum wave count.
- AI builder starting budget, passive build income, build interval, and tower cap.
- Tower sell refund rate.
- Score gained per enemy reward.
- Enemy HP scaling per wave.

Backend relevance:

- A server can validate purchases, sells, score changes, wave rewards, and enemy scaling from the same source.
- PvP can extend this with base HP, passive income, offensive resource generation, and repair costs.

## `hero.json`

Defines the player-controlled defense mecha defaults.

Used for:

- Starting grid position.
- Movement speed.
- Damage.
- Range.
- Fire rate.
- Health, respawn timing, and territory healing rate.
- Machine-round projectile visuals and speed.

Backend relevance:

- A future server can validate hero movement bounds, attack rate, attack range, and projectile behavior.
- PvP can extend this with mecha ownership, abilities, cooldowns, respawn rules, or per-player loadouts.

## `towers.json`

Defines buildable tower metadata.

Used for:

- Tower names.
- Costs.
- Base damage.
- Tower HP.
- Range.
- Fire rate.
- Visual colors.
- Descriptions.
- Projectile type.
- Splash radius.
- Slow amount and duration.
- Upgrade costs.

Backend relevance:

- A server can validate tower placement cost, upgrade cost, combat stats, and projectile behavior.
- Balance changes can happen by editing data instead of engine code.

## `enemies.json`

Defines enemy unit metadata.

Used for:

- Health.
- Speed.
- Reward.
- Armor.
- Visual color.
- Render size.
- Boss flag.

Backend relevance:

- A server can spawn, scale, move, damage, and reward enemies using the same canonical stats.
- PvP attack packages can reference these enemy types directly.

## `waves.json`

Defines the current single-player wave script.

Used for:

- Enemy groups per wave.
- Enemy counts.
- Spawn interval per group.
- Wave-clear gold bonus.

Backend relevance:

- A server or replay system can reproduce the same wave schedule.
- PvP may not use this exact file directly, but it is still useful for AI scripts, challenge modes, or asynchronous leaderboard runs.

## `combat.json`

Defines combat tuning that used to be hardcoded in the engine.

Used for:

- Laser active/cooldown timing.
- Frost freeze chance and duration.
- Tesla chain range.
- Cannon debuff chance, duration, armor break, and exposed bonus by tower level.
- Generic tower upgrade multipliers.

Backend relevance:

- A server simulation can validate damage timing, status effects, debuff scaling, and upgrade stat changes.
- Keeping combat tuning in data makes it easier to share one ruleset between local play, AI, and networked matches.

## Data Flow

`src/game/constants.ts` imports these JSON files and exposes typed constants to the rest of the app. This keeps the current code stable while creating a future-friendly data boundary.

Current flow:

```text
src/data/*.json
  -> src/game/constants.ts
  -> engine, renderer, UI components
```

Future backend flow:

```text
src/data/game-data.generated.json or shared metadata package
  -> server simulation
  -> client metadata version/hash check
  -> client rendering/UI
```

## Refactor Rule

When adding new gameplay rules, prefer putting tunable values here if they may affect balance, sync, AI behavior, replay behavior, or server validation.

Keep pure implementation details in TypeScript.
