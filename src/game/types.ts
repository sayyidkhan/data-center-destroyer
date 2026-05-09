export type Vec2 = { x: number; y: number };

export type TowerType = 'cannon' | 'laser' | 'frost' | 'tesla' | 'missile';

export type EnemyType = 'grunt' | 'tank' | 'speeder' | 'boss' | 'swarm';

export type ProjectileType = 'bullet' | 'laser_beam' | 'frost_bolt' | 'lightning' | 'missile' | 'machine_round';

export type AttackPackageId = 'grunt_pack' | 'speeder_rush' | 'tank_push' | 'swarm_burst' | 'boss_signal';

export interface Tower {
  id: string;
  owner: 'player' | 'opponent';
  type: TowerType;
  gridX: number;
  gridY: number;
  x: number;
  y: number;
  level: number;
  damage: number;
  hp: number;
  maxHp: number;
  range: number;
  fireRate: number; // shots per second
  lastFired: number;
  targetId: string | null;
  beamTargetId: string | null;
  laserCycleMs: number;
  angle: number;
  kills: number;
}

export interface Hero {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  damage: number;
  range: number;
  fireRate: number;
  lastFired: number;
  targetId: string | null;
  angle: number;
  kills: number;
  heroKills: number;
  hp: number;
  maxHp: number;
  isAlive: boolean;
  respawnTimer: number;
  respawnMs: number;
  healPerSecond: number;
}

export interface Enemy {
  id: string;
  type: EnemyType;
  owner: 'player' | 'opponent';
  pathRole: 'attack' | 'defense';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  reward: number;
  armor: number;
  pathIndex: number;
  pathProgress: number; // 0..1 between current and next waypoint
  slowFactor: number;
  slowTimer: number;
  frozenTimer: number;
  armorBreakTimer: number;
  armorBreakAmount: number;
  exposedTimer: number;
  exposedMultiplier: number;
  isAlive: boolean;
  isBoss: boolean;
}

export interface Projectile {
  id: string;
  type: ProjectileType;
  x: number;
  y: number;
  targetId: string;
  speed: number;
  damage: number;
  towerId: string;
  splashRadius: number;
  color: string;
  size: number;
  slowAmount: number;
  slowDuration: number;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export type VisualEffect =
  | {
      id: string;
      type: 'frost_blast';
      x: number;
      y: number;
      radius: number;
      life: number;
      maxLife: number;
    }
  | {
      id: string;
      type: 'lightning_zap';
      points: Vec2[];
      life: number;
      maxLife: number;
    };

export interface GameState {
  phase: 'menu' | 'versus_intro' | 'playing' | 'paused' | 'wave_complete' | 'game_over' | 'victory';
  gameMode: 'single_player' | 'multi_player' | null;
  wave: number;
  maxWaves: number;
  lives: number;
  maxLives: number;
  playerBaseHp: number;
  maxPlayerBaseHp: number;
  opponentBaseHp: number;
  maxOpponentBaseHp: number;
  offenseResource: number;
  maxOffenseResource: number;
  attackCooldowns: Record<AttackPackageId, number>;
  aiAttackTimer: number;
  aiBuildGold: number;
  aiBuildTimer: number;
  gold: number;
  score: number;
  towers: Tower[];
  hero: Hero;
  opponentHero: Hero;
  enemies: Enemy[];
  projectiles: Projectile[];
  particles: Particle[];
  effects: VisualEffect[];
  path: Vec2[];
  attackPath: Vec2[];
  grid: CellType[][];
  selectedTowerType: TowerType | null;
  selectedTowerId: string | null;
  waveEnemiesLeft: number;
  waveSpawned: number;
  spawnTimer: number;
  enemiesInWave: EnemyConfig[];
  gameSpeed: number;
  totalKills: number;
  totalGoldEarned: number;
  cameraX: number;  // pixel offset into the full map (left edge of viewport)
}

export interface EnemyConfig {
  type: EnemyType;
  delay: number; // ms delay from wave start
}

export type CellType = 'empty' | 'path' | 'tower' | 'blocked';

export interface TowerDef {
  type: TowerType;
  name: string;
  cost: number;
  damage: number;
  hp: number;
  range: number;
  fireRate: number;
  color: string;
  accentColor: string;
  description: string;
  projectileType: ProjectileType;
  splashRadius: number;
  slowAmount: number;
  slowDuration: number;
  upgradeCost: number[];
}

export interface EnemyDef {
  type: EnemyType;
  hp: number;
  speed: number;
  reward: number;
  armor: number;
  color: string;
  size: number;
  isBoss: boolean;
}

export interface AttackPackageDef {
  id: AttackPackageId;
  name: string;
  description: string;
  cost: number;
  cooldownMs: number;
  travelMs: number;
  damage: number;
  payload: { type: EnemyType; count: number; interval: number }[];
}
