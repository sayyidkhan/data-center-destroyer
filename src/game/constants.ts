import type { AttackPackageDef, AttackPackageId, EnemyDef, EnemyType, TowerDef, TowerType } from './types';
import combatData from '../data/combat.json';
import economyData from '../data/economy.json';
import enemiesData from '../data/enemies.json';
import heroData from '../data/hero.json';
import mapData from '../data/map.json';
import pvpAttacksData from '../data/pvp-attacks.json';
import towersData from '../data/towers.json';
import wavesData from '../data/waves.json';

type HeroData = {
  start: { gridX: number; gridY: number };
  stats: {
    speed: number;
    damage: number;
    range: number;
    fireRate: number;
    maxHp: number;
    respawnMs: number;
    healPerSecond: number;
  };
  projectile: {
    speed: number;
    color: string;
    size: number;
  };
};

type EconomyData = {
  startingGold: number;
  startingLives: number;
  startingOffenseResource: number;
  maxOffenseResource: number;
  offenseResourcePerSecond: number;
  aiAttackIntervalMs: number;
  aiStartingBuildGold: number;
  aiBuildGoldPerSecond: number;
  aiBuildIntervalMs: number;
  aiMaxTowers: number;
  maxWaves: number;
  sellRefundRate: number;
  scorePerReward: number;
  waveHpScalePerWave: number;
};

type MapData = {
  cellSize: number;
  gridCols: number;
  gridRows: number;
  viewportCols: number;
  hudSlotHeight: number;
  footerHeight: number;
  footerGridMinWidth: number;
  pathWaypoints: [number, number][];
  attackPathWaypoints: [number, number][];
  enemyTowerLoadout: Array<{
    type: TowerType;
    gridX: number;
    gridY: number;
    damage: number;
    fireRate: number;
  }>;
};

type CombatData = {
  laser: {
    activeMs: number;
    cooldownMs: number;
  };
  frost: {
    freezeChance: number;
    freezeMs: number;
  };
  tesla: {
    chainRangeCells: number;
  };
  cannon: {
    debuffChanceByLevel: number[];
    debuffDurationByLevel: number[];
    armorBreakByLevel: number[];
    exposedBonusByLevel: number[];
  };
  upgrade: {
    damageMultiplier: number;
    rangeMultiplier: number;
    fireRateMultiplier: number;
  };
};

export interface WaveDef {
  enemies: { type: EnemyType; count: number; interval: number }[];
  goldBonus: number;
}

export const MAP_CONFIG = mapData as MapData;
export const ECONOMY_CONFIG = economyData as EconomyData;
export const HERO_CONFIG = heroData as HeroData;
export const COMBAT_CONFIG = combatData as CombatData;

export const CELL_SIZE = MAP_CONFIG.cellSize;
export const GRID_COLS = MAP_CONFIG.gridCols;
export const GRID_ROWS = MAP_CONFIG.gridRows;
export const VIEWPORT_COLS = MAP_CONFIG.viewportCols;
export const VIEWPORT_W = CELL_SIZE * VIEWPORT_COLS;
export const VIEWPORT_H = CELL_SIZE * GRID_ROWS;
export const MAP_W = CELL_SIZE * GRID_COLS;
export const MAP_H = CELL_SIZE * GRID_ROWS;
export const PLAYER_BUILD_MIN_COL = 0;
export const PLAYER_BUILD_MAX_COL = Math.floor((GRID_COLS * 2) / 3) - 1;
export const ENEMY_BUILD_MIN_COL = Math.floor(GRID_COLS / 3);
export const ENEMY_BUILD_MAX_COL = GRID_COLS - 1;
export const isPlayerBuildableCell = (gridX: number) =>
  gridX >= PLAYER_BUILD_MIN_COL && gridX <= PLAYER_BUILD_MAX_COL;
export const isEnemyBuildableCell = (gridX: number) =>
  gridX >= ENEMY_BUILD_MIN_COL && gridX <= ENEMY_BUILD_MAX_COL;

/** Fixed HUD strip height — room for readable labels + stats + controls. */
export const HUD_SLOT_H = MAP_CONFIG.hudSlotHeight;

/** Bottom shop / mecha panel height (fixed shell; menu uses empty placeholder). */
export const FOOTER_H = MAP_CONFIG.footerHeight;

/** Min width for footer `1fr 2fr 1fr` grid (hero | shop | briefing) before horizontal scroll. */
export const FOOTER_GRID_MIN_W = MAP_CONFIG.footerGridMinWidth;

// Legacy aliases kept for compatibility
export const CANVAS_WIDTH = VIEWPORT_W;
export const CANVAS_HEIGHT = VIEWPORT_H;

export const STARTING_GOLD = ECONOMY_CONFIG.startingGold;
export const STARTING_LIVES = ECONOMY_CONFIG.startingLives;
export const STARTING_OFFENSE_RESOURCE = ECONOMY_CONFIG.startingOffenseResource;
export const MAX_OFFENSE_RESOURCE = ECONOMY_CONFIG.maxOffenseResource;
export const OFFENSE_RESOURCE_PER_SECOND = ECONOMY_CONFIG.offenseResourcePerSecond;
export const AI_ATTACK_INTERVAL_MS = ECONOMY_CONFIG.aiAttackIntervalMs;
export const AI_STARTING_BUILD_GOLD = ECONOMY_CONFIG.aiStartingBuildGold;
export const AI_BUILD_GOLD_PER_SECOND = ECONOMY_CONFIG.aiBuildGoldPerSecond;
export const AI_BUILD_INTERVAL_MS = ECONOMY_CONFIG.aiBuildIntervalMs;
export const AI_MAX_TOWERS = ECONOMY_CONFIG.aiMaxTowers;
export const MAX_WAVES = ECONOMY_CONFIG.maxWaves;
export const SELL_REFUND_RATE = ECONOMY_CONFIG.sellRefundRate;
export const SCORE_PER_REWARD = ECONOMY_CONFIG.scorePerReward;
export const WAVE_HP_SCALE_PER_WAVE = ECONOMY_CONFIG.waveHpScalePerWave;

export const HERO_START = {
  x: CELL_SIZE * HERO_CONFIG.start.gridX,
  y: CELL_SIZE * HERO_CONFIG.start.gridY,
};

export const HERO_STATS = HERO_CONFIG.stats;
export const HERO_PROJECTILE = HERO_CONFIG.projectile;
export const ENEMY_TOWER_LOADOUT = MAP_CONFIG.enemyTowerLoadout;

// Data center is flush to the LEFT edge, rotated sideways with intake bay facing RIGHT.
// Path snakes then ends with a long straight horizontal run at row 7 into the bay.
export const PATH_WAYPOINTS = MAP_CONFIG.pathWaypoints;
export const ATTACK_PATH_WAYPOINTS = MAP_CONFIG.attackPathWaypoints;

export const TOWER_DEFS = towersData as Record<TowerType, TowerDef>;
export const ENEMY_DEFS = enemiesData as Record<EnemyType, EnemyDef>;
export const WAVE_DEFS = wavesData as WaveDef[];
export const ATTACK_PACKAGE_DEFS = pvpAttacksData as Record<AttackPackageId, AttackPackageDef>;

export const LASER_ACTIVE_MS = COMBAT_CONFIG.laser.activeMs;
export const LASER_COOLDOWN_MS = COMBAT_CONFIG.laser.cooldownMs;
export const LASER_CYCLE_MS = LASER_ACTIVE_MS + LASER_COOLDOWN_MS;
export const FROST_FREEZE_CHANCE = COMBAT_CONFIG.frost.freezeChance;
export const FROST_FREEZE_MS = COMBAT_CONFIG.frost.freezeMs;
export const TESLA_CHAIN_RANGE = COMBAT_CONFIG.tesla.chainRangeCells * CELL_SIZE;
export const CANNON_DEBUFF_CHANCE = COMBAT_CONFIG.cannon.debuffChanceByLevel;
export const CANNON_DEBUFF_DURATION = COMBAT_CONFIG.cannon.debuffDurationByLevel;
export const CANNON_ARMOR_BREAK = COMBAT_CONFIG.cannon.armorBreakByLevel;
export const CANNON_EXPOSED_BONUS = COMBAT_CONFIG.cannon.exposedBonusByLevel;
export const UPGRADE_DAMAGE_MULTIPLIER = COMBAT_CONFIG.upgrade.damageMultiplier;
export const UPGRADE_RANGE_MULTIPLIER = COMBAT_CONFIG.upgrade.rangeMultiplier;
export const UPGRADE_FIRE_RATE_MULTIPLIER = COMBAT_CONFIG.upgrade.fireRateMultiplier;
