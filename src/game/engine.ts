import type { AttackPackageId, GameState, Tower, Enemy, Projectile, Particle, VisualEffect, Vec2, TowerType, Hero } from './types';
import {
  CELL_SIZE, GRID_COLS, GRID_ROWS, STARTING_GOLD, STARTING_LIVES, MAX_WAVES,
  TOWER_DEFS, ENEMY_DEFS, WAVE_DEFS, MAP_W, MAP_H, VIEWPORT_W, HERO_START, HERO_STATS,
  AI_ATTACK_INTERVAL_MS, ATTACK_PACKAGE_DEFS,
  CANNON_ARMOR_BREAK, CANNON_DEBUFF_CHANCE, CANNON_DEBUFF_DURATION, CANNON_EXPOSED_BONUS,
  FROST_FREEZE_CHANCE, FROST_FREEZE_MS, HERO_PROJECTILE, LASER_ACTIVE_MS, LASER_CYCLE_MS,
  isPlayerBuildableCell,
  ENEMY_TOWER_LOADOUT,
  AI_BUILD_GOLD_PER_SECOND, AI_BUILD_INTERVAL_MS, AI_MAX_TOWERS, AI_STARTING_BUILD_GOLD,
  MAX_OFFENSE_RESOURCE, OFFENSE_RESOURCE_PER_SECOND,
  SCORE_PER_REWARD, SELL_REFUND_RATE, TESLA_CHAIN_RANGE, UPGRADE_DAMAGE_MULTIPLIER,
  UPGRADE_FIRE_RATE_MULTIPLIER, UPGRADE_RANGE_MULTIPLIER, WAVE_HP_SCALE_PER_WAVE, STARTING_OFFENSE_RESOURCE,
} from './constants';
import { buildAttackPath, buildPath, buildPathGrid, distance, angleTo } from './pathfinding';

let nextId = 1;
const uid = () => `id_${nextId++}`;
const PLAYER_BASE_TARGET_ID = 'player_base';
const OPPONENT_BASE_TARGET_ID = 'opponent_base';
const PLAYER_TERRITORY_MAX_X = MAP_W / 3;
const OPPONENT_TERRITORY_MIN_X = (MAP_W * 2) / 3;
const OPPONENT_HERO_MIN_X = MAP_W / 3 + CELL_SIZE * 1.5;
const OPPONENT_HERO_START = {
  x: MAP_W - HERO_START.x,
  y: HERO_START.y,
};
const OPPONENT_HERO_PATROL_POINTS: Vec2[] = [
  { x: MAP_W / 3 + CELL_SIZE * 3, y: CELL_SIZE * 3.5 },
  { x: MAP_W / 3 + CELL_SIZE * 9, y: CELL_SIZE * 6.5 },
  { x: MAP_W / 3 + CELL_SIZE * 3, y: CELL_SIZE * 10.5 },
  { x: MAP_W / 3 + CELL_SIZE * 16, y: CELL_SIZE * 8.5 },
];
const HERO_STRUCTURE_OR_HERO_DAMAGE = 1;

function createTower(
  type: TowerType,
  gridX: number,
  gridY: number,
  owner: Tower['owner'],
  overrides: Partial<Pick<Tower, 'damage' | 'fireRate' | 'range' | 'level'>> = {}
): Tower {
  const def = TOWER_DEFS[type];
  return {
    id: uid(),
    owner,
    type,
    gridX,
    gridY,
    x: gridX * CELL_SIZE + CELL_SIZE / 2,
    y: gridY * CELL_SIZE + CELL_SIZE / 2,
    level: overrides.level ?? 1,
    damage: overrides.damage ?? def.damage,
    hp: def.hp,
    maxHp: def.hp,
    range: overrides.range ?? def.range * CELL_SIZE,
    fireRate: overrides.fireRate ?? def.fireRate,
    lastFired: 0,
    targetId: null,
    beamTargetId: null,
    laserCycleMs: 0,
    angle: 0,
    kills: 0,
  };
}

function createEnemyTowers(): Tower[] {
  return ENEMY_TOWER_LOADOUT.map(tower =>
    createTower(tower.type, tower.gridX, tower.gridY, 'opponent', {
      damage: tower.damage,
      fireRate: tower.fireRate,
      range: TOWER_DEFS[tower.type].range * CELL_SIZE,
    })
  );
}

function createHero(id: string, start: Vec2): Hero {
  return {
    id,
    x: start.x,
    y: start.y,
    targetX: start.x,
    targetY: start.y,
    speed: HERO_STATS.speed,
    damage: HERO_STATS.damage,
    range: HERO_STATS.range * CELL_SIZE,
    fireRate: HERO_STATS.fireRate,
    lastFired: 0,
    targetId: null,
    angle: 0,
    kills: 0,
    heroKills: 0,
    hp: HERO_STATS.maxHp,
    maxHp: HERO_STATS.maxHp,
    isAlive: true,
    respawnTimer: 0,
    respawnMs: HERO_STATS.respawnMs,
    healPerSecond: HERO_STATS.healPerSecond,
  };
}

export function createInitialState(): GameState {
  const path = buildPath();
  const attackPath = buildAttackPath();
  const grid = buildPathGrid(GRID_COLS, GRID_ROWS);
  const attackCooldowns = Object.fromEntries(
    (Object.keys(ATTACK_PACKAGE_DEFS) as AttackPackageId[]).map(id => [id, 0])
  ) as Record<AttackPackageId, number>;
  // Start camera showing the data center (left side of map)
  return {
    phase: 'menu',
    gameMode: null,
    wave: 0,
    maxWaves: MAX_WAVES,
    lives: STARTING_LIVES,
    maxLives: STARTING_LIVES,
    playerBaseHp: STARTING_LIVES,
    maxPlayerBaseHp: STARTING_LIVES,
    opponentBaseHp: STARTING_LIVES,
    maxOpponentBaseHp: STARTING_LIVES,
    offenseResource: STARTING_OFFENSE_RESOURCE,
    maxOffenseResource: MAX_OFFENSE_RESOURCE,
    attackCooldowns,
    aiAttackTimer: AI_ATTACK_INTERVAL_MS,
    aiBuildGold: AI_STARTING_BUILD_GOLD,
    aiBuildTimer: AI_BUILD_INTERVAL_MS,
    gold: STARTING_GOLD,
    score: 0,
    towers: createEnemyTowers(),
    hero: createHero('hero', HERO_START),
    opponentHero: createHero('opponent_hero', OPPONENT_HERO_START),
    enemies: [],
    projectiles: [],
    particles: [],
    effects: [],
    path,
    attackPath,
    grid,
    selectedTowerType: null,
    selectedTowerId: null,
    waveEnemiesLeft: 0,
    waveSpawned: 0,
    spawnTimer: 0,
    enemiesInWave: [],
    gameSpeed: 1,
    totalKills: 0,
    totalGoldEarned: STARTING_GOLD,
    cameraX: 0,
  };
}

export function commandHeroMove(state: GameState, x: number, y: number): GameState {
  if (!state.hero.isAlive) return state;
  const heroRadius = CELL_SIZE * 0.45;
  const targetX = Math.max(heroRadius, Math.min(MAP_W - heroRadius, x));
  const targetY = Math.max(heroRadius, Math.min(MAP_H - heroRadius, y));

  return {
    ...state,
    hero: {
      ...state.hero,
      targetX,
      targetY,
      angle: angleTo(state.hero, { x: targetX, y: targetY }),
    },
    selectedTowerId: null,
    selectedTowerType: null,
  };
}

export function placeTower(state: GameState, gridX: number, gridY: number, type: TowerType): GameState {
  const def = TOWER_DEFS[type];
  if (state.gold < def.cost) return state;
  if (gridX < 0 || gridX >= GRID_COLS || gridY < 0 || gridY >= GRID_ROWS) return state;
  if (!isPlayerBuildableCell(gridX)) return state;
  if (state.grid[gridY][gridX] !== 'empty') return state;

  const newGrid = state.grid.map(row => [...row]);
  newGrid[gridY][gridX] = 'tower';

  const tower = createTower(type, gridX, gridY, 'player');

  return {
    ...state,
    gold: state.gold - def.cost,
    towers: [...state.towers, tower],
    grid: newGrid,
    selectedTowerType: null,
  };
}

export function sellTower(state: GameState, towerId: string): GameState {
  const tower = state.towers.find(t => t.id === towerId);
  if (!tower || tower.owner !== 'player') return state;

  const def = TOWER_DEFS[tower.type];
  let sellValue = Math.floor(def.cost * SELL_REFUND_RATE);
  for (let i = 0; i < tower.level - 1; i++) {
    sellValue += Math.floor((def.upgradeCost[i] || 0) * SELL_REFUND_RATE);
  }

  const newGrid = state.grid.map(row => [...row]);
  newGrid[tower.gridY][tower.gridX] = 'empty';

  return {
    ...state,
    gold: state.gold + sellValue,
    towers: state.towers.filter(t => t.id !== towerId),
    grid: newGrid,
    selectedTowerId: null,
  };
}

export function upgradeTower(state: GameState, towerId: string): GameState {
  const tower = state.towers.find(t => t.id === towerId);
  if (!tower || tower.owner !== 'player' || tower.level >= 3) return state;

  const def = TOWER_DEFS[tower.type];
  const cost = def.upgradeCost[tower.level - 1];
  if (state.gold < cost) return state;

  const newTower: Tower = {
    ...tower,
    level: tower.level + 1,
    damage: Math.floor(tower.damage * UPGRADE_DAMAGE_MULTIPLIER),
    range: tower.range * UPGRADE_RANGE_MULTIPLIER,
    fireRate: tower.fireRate * UPGRADE_FIRE_RATE_MULTIPLIER,
  };

  return {
    ...state,
    gold: state.gold - cost,
    towers: state.towers.map(t => t.id === towerId ? newTower : t),
  };
}

export function deployAttackPackage(state: GameState, packageId: AttackPackageId): GameState {
  const def = ATTACK_PACKAGE_DEFS[packageId];
  if (!def) return state;
  if (state.phase === 'menu' || state.phase === 'versus_intro' || state.phase === 'game_over' || state.phase === 'victory') return state;
  if (state.offenseResource < def.cost) return state;
  if ((state.attackCooldowns[packageId] ?? 0) > 0) return state;

  return {
    ...state,
    offenseResource: state.offenseResource - def.cost,
    attackCooldowns: {
      ...state.attackCooldowns,
      [packageId]: def.cooldownMs,
    },
    enemies: [
      ...state.enemies,
      ...def.payload.flatMap(group =>
        Array.from({ length: group.count }, () => spawnEnemy(state, group.type, 'player'))
      ),
    ],
  };
}

export function startWave(state: GameState): GameState {
  if (state.phase !== 'playing' && state.phase !== 'wave_complete') return state;
  const waveIndex = state.wave;
  if (waveIndex >= MAX_WAVES) return state;

  const waveDef = WAVE_DEFS[waveIndex];
  const enemiesInWave = waveDef.enemies.flatMap(group =>
    Array.from({ length: group.count }, (_, i) => ({
      type: group.type,
      delay: i * group.interval,
    }))
  ).sort((a, b) => a.delay - b.delay);

  return {
    ...state,
    phase: 'playing',
    wave: waveIndex + 1,
    waveEnemiesLeft: enemiesInWave.length,
    waveSpawned: 0,
    spawnTimer: 0,
    enemiesInWave,
  };
}

function spawnEnemy(
  state: GameState,
  type: Parameters<typeof ENEMY_DEFS['grunt']['type'] extends infer T ? (t: T) => void : never>[0],
  owner: Enemy['owner'] = 'opponent'
): Enemy {
  const def = ENEMY_DEFS[type as keyof typeof ENEMY_DEFS];
  const waveScale = 1 + (state.wave - 1) * WAVE_HP_SCALE_PER_WAVE;
  const path = owner === 'player' ? state.attackPath : state.path;
  return {
    id: uid(),
    type: type as Enemy['type'],
    owner,
    pathRole: owner === 'player' ? 'attack' : 'defense',
    x: path[0].x,
    y: path[0].y,
    hp: Math.floor(def.hp * waveScale),
    maxHp: Math.floor(def.hp * waveScale),
    speed: def.speed,
    reward: def.reward,
    armor: def.armor,
    pathIndex: 0,
    pathProgress: 0,
    slowFactor: 1,
    slowTimer: 0,
    frozenTimer: 0,
    armorBreakTimer: 0,
    armorBreakAmount: 0,
    exposedTimer: 0,
    exposedMultiplier: 0,
    isAlive: true,
    isBoss: def.isBoss,
  };
}

export function tickGame(state: GameState, deltaMs: number): GameState {
  if (state.phase !== 'playing') return state;

  const dt = (deltaMs / 1000) * state.gameSpeed;
  const scaledMs = deltaMs * state.gameSpeed;
  let s = { ...state };

  s = tickPvpMeta(s, scaledMs);
  s = tickAiBuilder(s, scaledMs);

  // Spawn enemies
  s = tickSpawning(s, scaledMs);

  // Move enemies
  s = tickEnemies(s, dt);

  // Hero movement and machine-gun support fire
  s = tickHero(s, dt, scaledMs);
  s = tickOpponentHero(s, dt, scaledMs);

  // Tower targeting & firing
  s = tickTowers(s, scaledMs);

  // Move projectiles
  s = tickProjectiles(s, dt);

  // Update particles
  s = tickParticles(s, dt);

  // Update short-lived area effects
  s = tickEffects(s, dt);

  // Check wave complete
  if (s.waveSpawned >= s.enemiesInWave.length && s.enemies.length === 0 && s.phase === 'playing') {
    const waveDef = WAVE_DEFS[s.wave - 1];
    s = {
      ...s,
      phase: s.opponentBaseHp <= 0 ? 'victory' : s.wave >= MAX_WAVES ? 'victory' : 'wave_complete',
      gold: s.gold + waveDef.goldBonus,
      totalGoldEarned: s.totalGoldEarned + waveDef.goldBonus,
      score: s.score + waveDef.goldBonus * SCORE_PER_REWARD,
      projectiles: [],
      particles: [],
      effects: [],
    };
  }

  return s;
}

function tickPvpMeta(state: GameState, elapsedMs: number): GameState {
  let s = {
    ...state,
    offenseResource: Math.min(
      state.maxOffenseResource,
      state.offenseResource + OFFENSE_RESOURCE_PER_SECOND * (elapsedMs / 1000)
    ),
    attackCooldowns: Object.fromEntries(
      (Object.entries(state.attackCooldowns) as [AttackPackageId, number][])
        .map(([id, ms]) => [id, Math.max(0, ms - elapsedMs)])
    ) as Record<AttackPackageId, number>,
    aiAttackTimer: state.aiAttackTimer - elapsedMs,
  };

  if (s.phase !== 'playing') return s;

  while (s.aiAttackTimer <= 0) {
    s = spawnAiAttack(s);
    s.aiAttackTimer += AI_ATTACK_INTERVAL_MS;
  }

  return s;
}

function spawnAiAttack(state: GameState): GameState {
  const attackIds: AttackPackageId[] =
    state.wave >= 10
      ? ['boss_signal', 'tank_push', 'swarm_burst', 'speeder_rush', 'grunt_pack']
      : state.wave >= 6
        ? ['tank_push', 'swarm_burst', 'speeder_rush', 'grunt_pack']
        : state.wave >= 3
          ? ['speeder_rush', 'swarm_burst', 'grunt_pack']
          : ['grunt_pack'];

  const attackId = attackIds[Math.floor(Math.random() * attackIds.length)];
  const attack = ATTACK_PACKAGE_DEFS[attackId];
  const newEnemies = attack.payload.flatMap(group =>
    Array.from({ length: group.count }, () => spawnEnemy(state, group.type, 'opponent'))
  );

  return {
    ...state,
    enemies: [...state.enemies, ...newEnemies],
  };
}

function towerTypeForAiBuild(state: GameState): TowerType | null {
  const plan: TowerType[] =
    state.wave >= 8
      ? ['missile', 'tesla', 'laser', 'frost', 'cannon']
      : state.wave >= 4
        ? ['tesla', 'laser', 'frost', 'cannon']
        : ['cannon', 'frost', 'laser'];

  return plan.find(type => TOWER_DEFS[type].cost <= state.aiBuildGold) ?? null;
}

function cellDistanceToPath(gridX: number, gridY: number, path: Vec2[]) {
  const x = gridX * CELL_SIZE + CELL_SIZE / 2;
  const y = gridY * CELL_SIZE + CELL_SIZE / 2;
  return Math.min(...path.map(point => distance({ x, y }, point)));
}

function findAiBuildCell(state: GameState): { gridX: number; gridY: number } | null {
  const occupied = new Set(state.towers.map(tower => `${tower.gridX},${tower.gridY}`));
  let best: { gridX: number; gridY: number; score: number } | null = null;

  for (let gridX = Math.floor(GRID_COLS / 3); gridX < GRID_COLS; gridX++) {
    for (let gridY = 0; gridY < GRID_ROWS; gridY++) {
      if (state.grid[gridY]?.[gridX] !== 'empty') continue;
      if (occupied.has(`${gridX},${gridY}`)) continue;

      const pathDistance = cellDistanceToPath(gridX, gridY, state.attackPath);
      if (pathDistance < CELL_SIZE * 1.15 || pathDistance > CELL_SIZE * 3.8) continue;

      const sidePressure = Math.abs(gridX - GRID_COLS * 0.72) * 3;
      const laneBias = Math.abs(gridY - GRID_ROWS * 0.5) * 7;
      const score = pathDistance + sidePressure + laneBias + Math.random() * CELL_SIZE;
      if (!best || score < best.score) best = { gridX, gridY, score };
    }
  }

  return best ? { gridX: best.gridX, gridY: best.gridY } : null;
}

function tickAiBuilder(state: GameState, elapsedMs: number): GameState {
  let aiBuildGold = (state.aiBuildGold ?? AI_STARTING_BUILD_GOLD) + AI_BUILD_GOLD_PER_SECOND * (elapsedMs / 1000);
  let aiBuildTimer = (state.aiBuildTimer ?? AI_BUILD_INTERVAL_MS) - elapsedMs;
  let towers = state.towers;
  let grid = state.grid;

  while (aiBuildTimer <= 0) {
    aiBuildTimer += AI_BUILD_INTERVAL_MS;
    if (towers.filter(tower => tower.owner === 'opponent').length >= AI_MAX_TOWERS) continue;

    const type = towerTypeForAiBuild({ ...state, aiBuildGold });
    const cell = type ? findAiBuildCell({ ...state, towers, grid }) : null;
    if (!type || !cell) continue;

    const def = TOWER_DEFS[type];
    aiBuildGold -= def.cost;
    grid = grid.map(row => [...row]);
    grid[cell.gridY][cell.gridX] = 'tower';
    towers = [...towers, createTower(type, cell.gridX, cell.gridY, 'opponent')];
    break;
  }

  return {
    ...state,
    aiBuildGold,
    aiBuildTimer,
    towers,
    grid,
  };
}

function tickSpawning(state: GameState, elapsedMs: number): GameState {
  if (state.waveSpawned >= state.enemiesInWave.length) return state;

  const newTimer = state.spawnTimer + elapsedMs;
  let spawned = state.waveSpawned;
  const newEnemies = [...state.enemies];

  while (spawned < state.enemiesInWave.length) {
    const cfg = state.enemiesInWave[spawned];
    if (cfg.delay <= newTimer) {
      newEnemies.push(spawnEnemy(state, cfg.type));
      spawned++;
    } else {
      break;
    }
  }

  return { ...state, spawnTimer: newTimer, waveSpawned: spawned, enemies: newEnemies };
}

function tickEnemies(state: GameState, dt: number): GameState {
  let playerDamage = 0;
  let opponentDamage = 0;
  const alive: Enemy[] = [];

  for (const enemy of state.enemies) {
    if (!enemy.isAlive) continue;

    let e = { ...enemy };

    if (e.frozenTimer > 0) {
      e.frozenTimer = Math.max(0, e.frozenTimer - dt * 1000);
      alive.push(e);
      continue;
    }

    if (e.slowTimer > 0) {
      e.slowTimer = Math.max(0, e.slowTimer - dt * 1000);
      if (e.slowTimer === 0) e.slowFactor = 1;
    }

    if (e.armorBreakTimer > 0) {
      e.armorBreakTimer = Math.max(0, e.armorBreakTimer - dt * 1000);
      if (e.armorBreakTimer === 0) e.armorBreakAmount = 0;
    }

    if (e.exposedTimer > 0) {
      e.exposedTimer = Math.max(0, e.exposedTimer - dt * 1000);
      if (e.exposedTimer === 0) e.exposedMultiplier = 0;
    }

    const speed = e.speed * e.slowFactor;
    let remaining = speed * dt;
    let pi = e.pathIndex;
    let pp = e.pathProgress;
    const path = e.owner === 'player' ? state.attackPath : state.path;

    while (remaining > 0 && pi < path.length - 1) {
      const from = path[pi];
      const to = path[pi + 1];
      const segLen = distance(from, to);
      const distLeft = segLen * (1 - pp);

      if (remaining >= distLeft) {
        remaining -= distLeft;
        pi++;
        pp = 0;
      } else {
        pp += remaining / segLen;
        remaining = 0;
      }
    }

    if (pi >= path.length - 1) {
      if (e.owner === 'player') opponentDamage += 1;
      else playerDamage += 1;
      continue;
    }

    const from = path[pi];
    const to = path[pi + 1];
    e.x = from.x + (to.x - from.x) * pp;
    e.y = from.y + (to.y - from.y) * pp;
    e.pathIndex = pi;
    e.pathProgress = pp;
    alive.push(e);
  }

  return {
    ...state,
    enemies: alive,
    lives: Math.max(0, state.lives - playerDamage),
    playerBaseHp: Math.max(0, state.playerBaseHp - playerDamage),
    opponentBaseHp: Math.max(0, state.opponentBaseHp - opponentDamage),
    phase: state.playerBaseHp - playerDamage <= 0
      ? 'game_over'
      : state.opponentBaseHp - opponentDamage <= 0
        ? 'victory'
        : state.phase,
  };
}

function findBestTarget(
  source: Pick<Tower, 'x' | 'y' | 'range'> | Pick<Hero, 'x' | 'y' | 'range'>,
  enemies: Enemy[],
  targetOwner: Enemy['owner'] = 'opponent'
): Enemy | null {
  let best: Enemy | null = null;
  let bestProgress = -1;

  for (const enemy of enemies) {
    if (!enemy.isAlive || enemy.owner !== targetOwner) continue;
    const dist = distance(source, enemy);
    if (dist <= source.range) {
      const prog = enemy.pathIndex + enemy.pathProgress;
      if (prog > bestProgress) {
        bestProgress = prog;
        best = enemy;
      }
    }
  }

  return best;
}

function heroIsInPlayerTerritory(hero: Hero) {
  return hero.x <= PLAYER_TERRITORY_MAX_X;
}

function heroIsInOpponentTerritory(hero: Hero) {
  return hero.x >= OPPONENT_TERRITORY_MIN_X;
}

function normalizeHero(hero: Hero | undefined, id = 'hero', start = HERO_START): Hero {
  const base = hero ?? createHero(id, start);
  return {
    ...base,
    hp: base.hp ?? HERO_STATS.maxHp,
    maxHp: base.maxHp ?? HERO_STATS.maxHp,
    heroKills: base.heroKills ?? 0,
    isAlive: base.isAlive ?? true,
    respawnTimer: base.respawnTimer ?? 0,
    respawnMs: base.respawnMs ?? HERO_STATS.respawnMs,
    healPerSecond: base.healPerSecond ?? HERO_STATS.healPerSecond,
  };
}

function respawnHero(hero: Hero, start: Vec2): Hero {
  return {
    ...hero,
    x: start.x,
    y: start.y,
    targetX: start.x,
    targetY: start.y,
    hp: hero.maxHp,
    isAlive: true,
    respawnTimer: 0,
    targetId: null,
    lastFired: 0,
    angle: 0,
  };
}

function baseTargetPoint(state: GameState, base: 'player' | 'opponent'): Vec2 {
  const path = base === 'player' ? state.path : state.attackPath;
  return path[path.length - 1] ?? (base === 'player' ? HERO_START : OPPONENT_HERO_START);
}

function dataCenterRect(state: GameState, base: 'player' | 'opponent') {
  const target = baseTargetPoint(state, base);
  const w = CELL_SIZE * 3;
  const h = CELL_SIZE * 9.5;
  const x = base === 'player' ? 0 : MAP_W - w;
  const y = target.y - h / 2;
  return { x, y, w, h };
}

function nearestPointOnRect(point: Vec2, rect: { x: number; y: number; w: number; h: number }): Vec2 {
  return {
    x: Math.max(rect.x, Math.min(rect.x + rect.w, point.x)),
    y: Math.max(rect.y, Math.min(rect.y + rect.h, point.y)),
  };
}

function dataCenterTargetPoint(state: GameState, base: 'player' | 'opponent', source: Vec2): Vec2 {
  return nearestPointOnRect(source, dataCenterRect(state, base));
}

function findNearestTowerTarget(source: Hero, towers: Tower[], owner: Tower['owner']): Tower | null {
  let best: Tower | null = null;
  let bestDist = Infinity;

  for (const tower of towers) {
    if (tower.owner !== owner || tower.hp <= 0) continue;
    const dist = distance(source, tower);
    if (dist <= source.range && dist < bestDist) {
      best = tower;
      bestDist = dist;
    }
  }

  return best;
}

function queueHeroProjectile(projectiles: Projectile[], hero: Hero, targetId: string, color: string) {
  projectiles.push({
    id: uid(),
    type: 'machine_round',
    x: hero.x,
    y: hero.y,
    targetId,
    speed: HERO_PROJECTILE.speed,
    damage: hero.damage,
    towerId: hero.id,
    splashRadius: 0,
    color,
    size: HERO_PROJECTILE.size,
    slowAmount: 0,
    slowDuration: 0,
  });
}

function tickHero(state: GameState, dt: number, deltaMs: number): GameState {
  let hero = normalizeHero(state.hero, 'hero', HERO_START);
  const newProjectiles = [...state.projectiles];

  if (!hero.isAlive) {
    const respawnTimer = Math.max(0, hero.respawnTimer - deltaMs);
    return {
      ...state,
      hero: respawnTimer > 0
        ? { ...hero, respawnTimer, targetId: null, lastFired: 0 }
        : respawnHero(hero, HERO_START),
    };
  }

  if (heroIsInPlayerTerritory(hero) && hero.hp < hero.maxHp) {
    hero = { ...hero, hp: Math.min(hero.maxHp, hero.hp + hero.healPerSecond * dt) };
  }

  const moveDist = distance(hero, { x: hero.targetX, y: hero.targetY });
  if (moveDist > 1) {
    const step = Math.min(moveDist, hero.speed * dt);
    const moveAngle = Math.atan2(hero.targetY - hero.y, hero.targetX - hero.x);
    hero = {
      ...hero,
      x: hero.x + Math.cos(moveAngle) * step,
      y: hero.y + Math.sin(moveAngle) * step,
      angle: moveAngle,
    };
  }

  const opponentHero = normalizeHero(state.opponentHero, 'opponent_hero', OPPONENT_HERO_START);
  const canTargetOpponentHero = opponentHero.isAlive && distance(hero, opponentHero) <= hero.range;
  const towerTarget = findNearestTowerTarget(hero, state.towers, 'opponent');
  const bestEnemy = findBestTarget(hero, state.enemies, 'opponent');
  const opponentBase = dataCenterTargetPoint(state, 'opponent', hero);
  const canTargetOpponentBase = state.opponentBaseHp > 0 && distance(hero, opponentBase) <= hero.range;
  const target = canTargetOpponentHero
    ? { id: opponentHero.id, point: opponentHero }
    : towerTarget
      ? { id: towerTarget.id, point: towerTarget }
    : bestEnemy
      ? { id: bestEnemy.id, point: bestEnemy }
      : canTargetOpponentBase
        ? { id: OPPONENT_BASE_TARGET_ID, point: opponentBase }
        : null;
  const lastFired = hero.lastFired + deltaMs;
  const interval = 1000 / hero.fireRate;

  if (target) {
    hero = { ...hero, targetId: target.id, angle: angleTo(hero, target.point) };

    if (lastFired >= interval) {
      queueHeroProjectile(newProjectiles, hero, target.id, HERO_PROJECTILE.color);
      hero = { ...hero, lastFired: 0 };
    } else {
      hero = { ...hero, lastFired };
    }
  } else {
    hero = { ...hero, targetId: null, lastFired };
  }

  return {
    ...state,
    hero,
    projectiles: newProjectiles,
  };
}

function tickOpponentHero(state: GameState, dt: number, deltaMs: number): GameState {
  let opponentHero = normalizeHero(state.opponentHero, 'opponent_hero', OPPONENT_HERO_START);
  const newProjectiles = [...state.projectiles];

  if (!opponentHero.isAlive) {
    const respawnTimer = Math.max(0, opponentHero.respawnTimer - deltaMs);
    return {
      ...state,
      opponentHero: respawnTimer > 0
        ? { ...opponentHero, respawnTimer, targetId: null, lastFired: 0 }
        : respawnHero(opponentHero, OPPONENT_HERO_START),
    };
  }

  if (heroIsInOpponentTerritory(opponentHero) && opponentHero.hp < opponentHero.maxHp) {
    opponentHero = {
      ...opponentHero,
      hp: Math.min(opponentHero.maxHp, opponentHero.hp + opponentHero.healPerSecond * dt),
    };
  }

  const playerHero = normalizeHero(state.hero, 'hero', HERO_START);
  const bestEnemy = findBestTarget(opponentHero, state.enemies, 'player');
  const playerHeroInOpponentSide = playerHero.x >= OPPONENT_HERO_MIN_X;
  const lowHp = opponentHero.hp / opponentHero.maxHp <= 0.35;
  const patrolPhase = Math.max(0, AI_ATTACK_INTERVAL_MS - state.aiAttackTimer);
  let patrolIndex = Math.floor((patrolPhase / 2200) % OPPONENT_HERO_PATROL_POINTS.length);
  let patrolPoint = OPPONENT_HERO_PATROL_POINTS[patrolIndex];
  if (distance(opponentHero, patrolPoint) < CELL_SIZE * 0.8) {
    patrolIndex = (patrolIndex + 1) % OPPONENT_HERO_PATROL_POINTS.length;
    patrolPoint = OPPONENT_HERO_PATROL_POINTS[patrolIndex];
  }
  const interceptTarget = lowHp ? null : bestEnemy ?? (playerHero.isAlive && playerHeroInOpponentSide ? playerHero : null);
  const desiredPoint = lowHp
    ? OPPONENT_HERO_START
    : interceptTarget
      ? interceptTarget
      : patrolPoint;
  const desiredDistance = lowHp ? CELL_SIZE * 0.4 : interceptTarget ? CELL_SIZE * 1.15 : CELL_SIZE * 0.45;
  const targetDistance = distance(opponentHero, desiredPoint);

  if (targetDistance > desiredDistance) {
    const speedMultiplier = lowHp ? 1.2 : interceptTarget ? 1.15 : 0.95;
    const step = Math.min(targetDistance - desiredDistance, opponentHero.speed * speedMultiplier * dt);
    const moveAngle = Math.atan2(desiredPoint.y - opponentHero.y, desiredPoint.x - opponentHero.x);
    const radius = CELL_SIZE * 0.45;
    opponentHero = {
      ...opponentHero,
      x: Math.max(OPPONENT_HERO_MIN_X, Math.min(MAP_W - radius, opponentHero.x + Math.cos(moveAngle) * step)),
      y: Math.max(radius, Math.min(MAP_H - radius, opponentHero.y + Math.sin(moveAngle) * step)),
      targetX: desiredPoint.x,
      targetY: desiredPoint.y,
      angle: moveAngle,
    };
  }

  const canTargetPlayerHero = playerHero.isAlive && distance(opponentHero, playerHero) <= opponentHero.range;
  const towerTarget = findNearestTowerTarget(opponentHero, state.towers, 'player');
  const playerBase = dataCenterTargetPoint(state, 'player', opponentHero);
  const canTargetPlayerBase = state.playerBaseHp > 0 && distance(opponentHero, playerBase) <= opponentHero.range;
  const target = canTargetPlayerHero
    ? { id: playerHero.id, point: playerHero }
    : towerTarget
      ? { id: towerTarget.id, point: towerTarget }
    : bestEnemy
      ? { id: bestEnemy.id, point: bestEnemy }
      : canTargetPlayerBase
        ? { id: PLAYER_BASE_TARGET_ID, point: playerBase }
        : null;
  const lastFired = opponentHero.lastFired + deltaMs;
  const interval = 1000 / opponentHero.fireRate;

  if (target) {
    opponentHero = { ...opponentHero, targetId: target.id, angle: angleTo(opponentHero, target.point) };

    if (lastFired >= interval) {
      queueHeroProjectile(newProjectiles, opponentHero, target.id, '#ff8a9a');
      opponentHero = { ...opponentHero, lastFired: 0 };
    } else {
      opponentHero = { ...opponentHero, lastFired };
    }
  } else {
    opponentHero = { ...opponentHero, targetId: null, lastFired };
  }

  return {
    ...state,
    opponentHero,
    projectiles: newProjectiles,
  };
}

function activeLaserMsDuring(prevCycleMs: number, elapsedMs: number): number {
  let cursor = prevCycleMs % LASER_CYCLE_MS;
  let remaining = elapsedMs;
  let activeMs = 0;

  while (remaining > 0) {
    const phaseEnd = cursor < LASER_ACTIVE_MS ? LASER_ACTIVE_MS : LASER_CYCLE_MS;
    const segmentMs = Math.min(remaining, phaseEnd - cursor);
    if (cursor < LASER_ACTIVE_MS) activeMs += segmentMs;
    remaining -= segmentMs;
    cursor = (cursor + segmentMs) % LASER_CYCLE_MS;
  }

  return activeMs;
}

function spawnDeathParticles(enemy: Enemy): Particle[] {
  const particles: Particle[] = [];

  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12;
    const spd = 80 + Math.random() * 120;
    particles.push({
      id: uid(),
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: 0.6 + Math.random() * 0.4,
      maxLife: 0.6 + Math.random() * 0.4,
      color: enemy.isBoss ? '#ff6600' : '#ff4444',
      size: enemy.isBoss ? 6 : 3,
    });
  }

  return particles;
}

function nearestChainEnemy(from: Vec2, enemies: Enemy[], excludeId?: string): Enemy | null {
  let best: Enemy | null = null;
  let bestDist = Infinity;

  for (const enemy of enemies) {
    if (!enemy.isAlive || enemy.id === excludeId) continue;
    const dist = distance(from, enemy);
    if (dist <= TESLA_CHAIN_RANGE && dist < bestDist) {
      bestDist = dist;
      best = enemy;
    }
  }

  return best;
}

function calculateDamage(rawDamage: number, enemy: Enemy, minimum = 1): number {
  const effectiveArmor = Math.max(0, (enemy.armor || 0) - enemy.armorBreakAmount);
  const armoredDamage = Math.max(minimum, rawDamage - effectiveArmor);
  return Math.max(minimum, armoredDamage * (1 + enemy.exposedMultiplier));
}

function applyCannonDebuff(enemy: Enemy, towerLevel: number): 'armor_break' | 'exposed' | null {
  if (Math.random() >= CANNON_DEBUFF_CHANCE[towerLevel]) return null;

  const duration = CANNON_DEBUFF_DURATION[towerLevel];
  if (Math.random() < 0.5) {
    enemy.armorBreakAmount = Math.max(enemy.armorBreakAmount, CANNON_ARMOR_BREAK[towerLevel]);
    enemy.armorBreakTimer = Math.max(enemy.armorBreakTimer, duration);
    return 'armor_break';
  }

  enemy.exposedMultiplier = Math.max(enemy.exposedMultiplier, CANNON_EXPOSED_BONUS[towerLevel]);
  enemy.exposedTimer = Math.max(enemy.exposedTimer, duration);
  return 'exposed';
}

function tickTowers(state: GameState, deltaMs: number): GameState {
  const newProjectiles = [...state.projectiles];
  const enemies = state.enemies.map(e => ({ ...e }));
  const newParticles = [...state.particles];
  const newEffects = [...state.effects];
  let gold = state.gold;
  let score = state.score;
  let kills = state.totalKills;
  let totalGoldEarned = state.totalGoldEarned;

  const towers = state.towers.map(tower => {
    if (tower.owner === 'opponent') {
      const hero = state.hero;
      const canTargetHero = hero.isAlive && distance(tower, hero) <= tower.range;
      const lastFired = tower.lastFired + deltaMs;
      const interval = 1000 / tower.fireRate;

      if (!canTargetHero) {
        return {
          ...tower,
          targetId: null,
          beamTargetId: null,
          lastFired,
          angle: hero.isAlive ? angleTo(tower, hero) : tower.angle,
        };
      }

      if (lastFired < interval) {
        return {
          ...tower,
          targetId: hero.id,
          beamTargetId: null,
          lastFired,
          angle: angleTo(tower, hero),
        };
      }

      const def = TOWER_DEFS[tower.type];
      newProjectiles.push({
        id: uid(),
        type: def.projectileType === 'missile' ? 'bullet' : def.projectileType,
        x: tower.x,
        y: tower.y,
        targetId: hero.id,
        speed: def.projectileType === 'laser_beam' ? 620 : 360,
        damage: tower.damage,
        towerId: tower.id,
        splashRadius: 0,
        color: '#ff8a9a',
        size: def.projectileType === 'laser_beam' ? 4 : 3.5,
        slowAmount: 0,
        slowDuration: 0,
      });

      return {
        ...tower,
        targetId: hero.id,
        beamTargetId: null,
        lastFired: 0,
        angle: angleTo(tower, hero),
      };
    }

    const opponentHero = normalizeHero(state.opponentHero, 'opponent_hero', OPPONENT_HERO_START);
    const canTargetOpponentHero = opponentHero.isAlive && distance(tower, opponentHero) <= tower.range;
    if (canTargetOpponentHero) {
      const interval = 1000 / tower.fireRate;
      const lastFired = tower.lastFired + deltaMs;
      const def = TOWER_DEFS[tower.type];

      if (lastFired < interval) {
        return {
          ...tower,
          targetId: opponentHero.id,
          beamTargetId: null,
          lastFired,
          angle: angleTo(tower, opponentHero),
        };
      }

      newProjectiles.push({
        id: uid(),
        type: def.projectileType,
        x: tower.x,
        y: tower.y,
        targetId: opponentHero.id,
        speed: def.projectileType === 'laser_beam' ? 600 : def.projectileType === 'lightning' ? 800 : 350,
        damage: HERO_STRUCTURE_OR_HERO_DAMAGE,
        towerId: tower.id,
        splashRadius: 0,
        color: def.accentColor,
        size: def.projectileType === 'missile' ? 7 : def.projectileType === 'bullet' ? 4 : 3,
        slowAmount: 0,
        slowDuration: 0,
      });

      return {
        ...tower,
        targetId: opponentHero.id,
        beamTargetId: null,
        lastFired: 0,
        angle: angleTo(tower, opponentHero),
      };
    }

    if (tower.type === 'laser') {
      const prevCycleMs = tower.laserCycleMs ?? 0;
      const nextCycleMs = (prevCycleMs + deltaMs) % LASER_CYCLE_MS;
      const activeMs = activeLaserMsDuring(prevCycleMs, deltaMs);
      const best = findBestTarget(tower, enemies);
      const isFiring = activeMs > 0 && best !== null;

      if (isFiring && best) {
        const enemy = enemies.find(e => e.id === best.id);
        if (enemy?.isAlive) {
          const rawDamage = tower.damage * tower.fireRate * (activeMs / 1000);
          enemy.hp -= calculateDamage(rawDamage, enemy, activeMs / 1000);

          if (enemy.hp <= 0) {
            enemy.isAlive = false;
            gold += enemy.reward;
            totalGoldEarned += enemy.reward;
            score += enemy.reward * SCORE_PER_REWARD;
            kills++;

            for (let i = 0; i < 12; i++) {
              const angle = (Math.PI * 2 * i) / 12;
              const spd = 80 + Math.random() * 120;
              newParticles.push({
                id: uid(),
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                life: 0.6 + Math.random() * 0.4,
                maxLife: 0.6 + Math.random() * 0.4,
                color: enemy.isBoss ? '#ff6600' : '#ff4444',
                size: enemy.isBoss ? 6 : 3,
              });
            }

            return {
              ...tower,
              targetId: enemy.id,
              beamTargetId: enemy.id,
              laserCycleMs: nextCycleMs,
              angle: angleTo(tower, enemy),
              kills: tower.kills + 1,
            };
          }
        }
      }

      return {
        ...tower,
        targetId: best?.id ?? null,
        beamTargetId: isFiring ? best?.id ?? null : null,
        laserCycleMs: nextCycleMs,
        angle: best ? angleTo(tower, best) : tower.angle,
      };
    }

    const interval = 1000 / tower.fireRate;
    if (deltaMs + tower.lastFired < interval) {
      // Track target angle even if not firing
      const target = enemies.find(e => e.id === tower.targetId)
        ?? (tower.targetId === opponentHero.id && opponentHero.isAlive ? opponentHero : undefined);
      if (target) {
        return { ...tower, lastFired: tower.lastFired + deltaMs, angle: angleTo(tower, target) };
      }
      return { ...tower, beamTargetId: null, lastFired: tower.lastFired + deltaMs };
    }

    // Find target: enemy closest to end of path in range
    const best = findBestTarget(tower, enemies);

    if (!best) return { ...tower, targetId: null, beamTargetId: null, lastFired: tower.lastFired + deltaMs };

    const def = TOWER_DEFS[tower.type];
    if (tower.type === 'tesla') {
      const hops = tower.level + 1;
      const points: Vec2[] = [{ x: tower.x, y: tower.y }];
      let current: Vec2 = best;
      let currentTarget: Enemy | null = best;
      let towerKills = 0;

      for (let hop = 0; hop < hops && currentTarget; hop++) {
        const damageScale = Math.max(0.55, 1 - hop * 0.15);
        const dmg = calculateDamage(Math.round(tower.damage * damageScale), currentTarget);
        currentTarget.hp -= dmg;
        points.push({ x: currentTarget.x, y: currentTarget.y });

        for (let i = 0; i < 5; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 70 + Math.random() * 130;
          newParticles.push({
            id: uid(),
            x: currentTarget.x,
            y: currentTarget.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.22 + Math.random() * 0.18,
            maxLife: 0.22 + Math.random() * 0.18,
            color: i % 2 === 0 ? '#fff59d' : '#ffee58',
            size: 1.5 + Math.random() * 2.5,
          });
        }

        if (currentTarget.hp <= 0 && currentTarget.isAlive) {
          currentTarget.isAlive = false;
          gold += currentTarget.reward;
          totalGoldEarned += currentTarget.reward;
          score += currentTarget.reward * SCORE_PER_REWARD;
          kills++;
          towerKills++;
          newParticles.push(...spawnDeathParticles(currentTarget));
        }

        current = currentTarget;
        currentTarget = nearestChainEnemy(current, enemies, currentTarget.id) ?? nearestChainEnemy(current, enemies);
      }

      if (points.length > 1) {
        newEffects.push({
          id: uid(),
          type: 'lightning_zap',
          points,
          life: 0.24,
          maxLife: 0.24,
        });
      }

      return {
        ...tower,
        targetId: best.id,
        beamTargetId: null,
        lastFired: 0,
        angle: angleTo(tower, best),
        kills: tower.kills + towerKills,
      };
    }

    const proj: Projectile = {
      id: uid(),
      type: def.projectileType,
      x: tower.x,
      y: tower.y,
      targetId: best.id,
      speed: def.projectileType === 'laser_beam' ? 600 : def.projectileType === 'lightning' ? 800 : 350,
      damage: tower.damage,
      towerId: tower.id,
      splashRadius: def.splashRadius * CELL_SIZE,
      color: def.accentColor,
      size: def.projectileType === 'missile' ? 7 : def.projectileType === 'bullet' ? 4 : 3,
      slowAmount: def.slowAmount,
      slowDuration: def.slowDuration,
    };
    newProjectiles.push(proj);

    return {
      ...tower,
      targetId: best.id,
      beamTargetId: null,
      lastFired: 0,
      angle: angleTo(tower, best),
    };
  });

  return {
    ...state,
    towers,
    enemies: enemies.filter(e => e.isAlive),
    projectiles: newProjectiles,
    particles: newParticles,
    effects: newEffects,
    gold,
    score,
    totalKills: kills,
    totalGoldEarned,
  };
}

function tickProjectiles(state: GameState, dt: number): GameState {
  const hits: { targetKind: 'enemy' | 'hero' | 'tower' | 'base'; targetId: string; towerId: string; towerType: Tower['type'] | null; towerLevel: number; projectileType: Projectile['type']; damage: number; slow: number; slowDur: number; splashRadius: number; x: number; y: number }[] = [];
  const surviving: Projectile[] = [];
  const newParticles = [...state.particles];
  const newEffects = [...state.effects];

  for (const proj of state.projectiles) {
    const enemyTarget = state.enemies.find(e => e.id === proj.targetId);
    const towerTarget = state.towers.find(tower => tower.id === proj.targetId && tower.hp > 0);
    const baseTarget =
      proj.targetId === PLAYER_BASE_TARGET_ID
        ? dataCenterTargetPoint(state, 'player', proj)
        : proj.targetId === OPPONENT_BASE_TARGET_ID
          ? dataCenterTargetPoint(state, 'opponent', proj)
          : null;
    const targetKind: 'enemy' | 'hero' | 'tower' | 'base' | null = enemyTarget
      ? 'enemy'
      : towerTarget
        ? 'tower'
      : (proj.targetId === state.hero.id && state.hero.isAlive)
        || (proj.targetId === state.opponentHero?.id && state.opponentHero?.isAlive)
          ? 'hero'
          : baseTarget ? 'base' : null;
    if (!targetKind) continue;
    const target = enemyTarget ?? towerTarget ?? baseTarget ?? (proj.targetId === state.opponentHero?.id ? state.opponentHero : state.hero);

    const dist = distance(proj, target);
    const moveAmount = proj.speed * dt;

    if (dist <= moveAmount + 4) {
      const sourceTower = state.towers.find(t => t.id === proj.towerId);
      // Hit!
      hits.push({
        targetKind,
        targetId: proj.targetId,
        towerId: proj.towerId,
        towerType: sourceTower?.type ?? null,
        towerLevel: sourceTower?.level ?? 1,
        projectileType: proj.type,
        damage: proj.damage,
        slow: proj.slowAmount,
        slowDur: proj.slowDuration,
        splashRadius: proj.splashRadius,
        x: target.x,
        y: target.y,
      });

      // Spawn hit particles
      const isFrost = proj.type === 'frost_bolt';
      const isMachineRound = proj.type === 'machine_round';
      const particleCount = isFrost ? 26 : isMachineRound ? 3 : 6;
      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.35;
        const speed = isFrost ? 70 + Math.random() * 170 : 60 + Math.random() * 80;
        const color = isFrost
          ? ['#e0f7fa', '#b2ebf2', '#80deea', '#ffffff'][i % 4]
          : isMachineRound ? HERO_PROJECTILE.color : proj.color;
        newParticles.push({
          id: uid(),
          x: target.x,
          y: target.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: isFrost ? 0.55 + Math.random() * 0.35 : 0.4 + Math.random() * 0.3,
          maxLife: isFrost ? 0.55 + Math.random() * 0.35 : 0.4 + Math.random() * 0.3,
          color,
          size: isFrost ? 1.5 + Math.random() * 4 : 2 + Math.random() * 3,
        });
      }

      if (isFrost) {
        newEffects.push({
          id: uid(),
          type: 'frost_blast',
          x: target.x,
          y: target.y,
          radius: Math.max(proj.splashRadius, CELL_SIZE * 1.3),
          life: 0.55,
          maxLife: 0.55,
        });
      }
    } else {
      // Move toward target
      const angle = Math.atan2(target.y - proj.y, target.x - proj.x);
      surviving.push({
        ...proj,
        x: proj.x + Math.cos(angle) * moveAmount,
        y: proj.y + Math.sin(angle) * moveAmount,
      });
    }
  }

  // Apply damage
  let enemies = state.enemies.map(e => ({ ...e }));
  let towers = state.towers.map(t => ({ ...t }));
  let grid = state.grid;
  let hero = normalizeHero(state.hero, 'hero', HERO_START);
  let opponentHero = normalizeHero(state.opponentHero, 'opponent_hero', OPPONENT_HERO_START);
  let gold = state.gold;
  let score = state.score;
  let kills = state.totalKills;
  let totalGoldEarned = state.totalGoldEarned;
  let playerBaseHp = state.playerBaseHp;
  let opponentBaseHp = state.opponentBaseHp;
  let phase = state.phase;

  for (const hit of hits) {
    if (hit.targetKind === 'tower') {
      const tower = towers.find(t => t.id === hit.targetId);
      if (!tower || tower.hp <= 0) continue;

      tower.hp = Math.max(0, tower.hp - HERO_STRUCTURE_OR_HERO_DAMAGE);
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6;
        const speed = 35 + Math.random() * 70;
        newParticles.push({
          id: uid(),
          x: tower.x,
          y: tower.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.3 + Math.random() * 0.2,
          maxLife: 0.3 + Math.random() * 0.2,
          color: tower.owner === 'opponent' ? '#ff8a9a' : '#5ecbff',
          size: 2 + Math.random() * 2,
        });
      }

      if (tower.hp <= 0) {
        grid = grid.map(row => [...row]);
        grid[tower.gridY][tower.gridX] = 'empty';
        if (hit.towerId === hero.id) hero = { ...hero, kills: hero.kills + 1 };
        else if (hit.towerId === opponentHero.id) opponentHero = { ...opponentHero, kills: opponentHero.kills + 1 };
      }
      continue;
    }

    if (hit.targetKind === 'base') {
      const damage = hit.towerId === hero.id || hit.towerId === opponentHero.id
        ? HERO_STRUCTURE_OR_HERO_DAMAGE
        : hit.damage;
      if (hit.targetId === PLAYER_BASE_TARGET_ID) {
        playerBaseHp = Math.max(0, playerBaseHp - damage);
        if (playerBaseHp <= 0) phase = 'game_over';
      } else {
        opponentBaseHp = Math.max(0, opponentBaseHp - damage);
        if (opponentBaseHp <= 0) phase = 'victory';
      }

      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        const speed = 35 + Math.random() * 65;
        newParticles.push({
          id: uid(),
          x: hit.x,
          y: hit.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.35 + Math.random() * 0.25,
          maxLife: 0.35 + Math.random() * 0.25,
          color: hit.targetId === PLAYER_BASE_TARGET_ID ? '#5ecbff' : '#ff8a9a',
          size: 2 + Math.random() * 3,
        });
      }
      continue;
    }

    if (hit.targetKind === 'hero') {
      const isOpponentHeroHit = hit.targetId === opponentHero.id;
      const targetHero = isOpponentHeroHit ? opponentHero : hero;
      if (!targetHero.isAlive) continue;

      const damage = HERO_STRUCTURE_OR_HERO_DAMAGE;
      const nextHp = Math.max(0, targetHero.hp - damage);
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6;
        const speed = 45 + Math.random() * 75;
        newParticles.push({
          id: uid(),
          x: targetHero.x,
          y: targetHero.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.35 + Math.random() * 0.2,
          maxLife: 0.35 + Math.random() * 0.2,
          color: '#ff8a9a',
          size: 2 + Math.random() * 2,
        });
      }

      const nextHero = nextHp > 0
        ? { ...targetHero, hp: nextHp }
        : {
            ...targetHero,
            hp: 0,
            isAlive: false,
            respawnTimer: targetHero.respawnMs,
            targetId: null,
            targetX: isOpponentHeroHit ? OPPONENT_HERO_START.x : HERO_START.x,
            targetY: isOpponentHeroHit ? OPPONENT_HERO_START.y : HERO_START.y,
          };

      if (nextHp <= 0) {
        if (hit.towerId === hero.id) hero = { ...hero, heroKills: hero.heroKills + 1 };
        else if (hit.towerId === opponentHero.id) opponentHero = { ...opponentHero, heroKills: opponentHero.heroKills + 1 };
      }

      if (isOpponentHeroHit) opponentHero = nextHero;
      else hero = nextHero;
      continue;
    }

    const targets = hit.splashRadius > 0
      ? enemies.filter(e => distance({ x: hit.x, y: hit.y }, e) <= hit.splashRadius)
      : enemies.filter(e => e.id === hit.targetId);

    for (const e of targets) {
      const dmg = calculateDamage(hit.damage, e);
      e.hp -= dmg;

      if (hit.towerType === 'cannon') {
        const debuff = applyCannonDebuff(e, hit.towerLevel);
        if (debuff) {
          const color = debuff === 'armor_break' ? '#ffab40' : '#64b5f6';
          for (let i = 0; i < 7; i++) {
            const angle = (Math.PI * 2 * i) / 7;
            const speed = 45 + Math.random() * 80;
            newParticles.push({
              id: uid(),
              x: e.x,
              y: e.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 0.28 + Math.random() * 0.18,
              maxLife: 0.28 + Math.random() * 0.18,
              color,
              size: 1.5 + Math.random() * 2.5,
            });
          }
        }
      }

      if (hit.slow > 0) {
        e.slowFactor = Math.min(e.slowFactor, 1 - hit.slow);
        e.slowTimer = hit.slowDur;

        if (hit.projectileType === 'frost_bolt' && Math.random() < FROST_FREEZE_CHANCE) {
          e.frozenTimer = Math.max(e.frozenTimer, FROST_FREEZE_MS);
        }
      }

      if (e.hp <= 0) {
        e.isAlive = false;
        if (e.owner === 'opponent') {
          gold += e.reward;
          totalGoldEarned += e.reward;
          score += e.reward * SCORE_PER_REWARD;
          kills++;
        }

        // Death explosion
        for (let i = 0; i < 12; i++) {
          const angle = (Math.PI * 2 * i) / 12;
          const spd = 80 + Math.random() * 120;
          newParticles.push({
            id: uid(),
            x: e.x,
            y: e.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            life: 0.6 + Math.random() * 0.4,
            maxLife: 0.6 + Math.random() * 0.4,
            color: e.isBoss ? '#ff6600' : '#ff4444',
            size: e.isBoss ? 6 : 3,
          });
        }

        // Credit kill to the source that landed the projectile.
        const towerIdx = towers.findIndex(t => t.id === hit.towerId);
        if (towerIdx >= 0) towers[towerIdx] = { ...towers[towerIdx], kills: towers[towerIdx].kills + 1 };
        else if (hit.towerId === hero.id) hero = { ...hero, kills: hero.kills + 1 };
        else if (hit.towerId === opponentHero.id) opponentHero = { ...opponentHero, kills: opponentHero.kills + 1 };
      }
    }
  }

  return {
    ...state,
    enemies: enemies.filter(e => e.isAlive),
    projectiles: surviving,
    particles: newParticles,
    effects: newEffects,
    gold,
    score,
    totalKills: kills,
    totalGoldEarned,
    towers: towers.filter(tower => tower.hp > 0),
    grid,
    hero,
    opponentHero,
    playerBaseHp,
    opponentBaseHp,
    lives: playerBaseHp,
    phase,
  };
}

function tickParticles(state: GameState, dt: number): GameState {
  const alive = state.particles
    .map(p => ({
      ...p,
      x: p.x + p.vx * dt,
      y: p.y + p.vy * dt,
      vx: p.vx * 0.9,
      vy: p.vy * 0.9,
      life: p.life - dt,
    }))
    .filter(p => p.life > 0);

  return { ...state, particles: alive };
}

function tickEffects(state: GameState, dt: number): GameState {
  const effects = state.effects
    .map(effect => ({
      ...effect,
      life: effect.life - dt,
    }))
    .filter(effect => effect.life > 0);

  return { ...state, effects };
}
