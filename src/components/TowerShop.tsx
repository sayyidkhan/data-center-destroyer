import React from 'react';
import type { AttackPackageId, GameState, TowerType } from '../game/types';
import { ATTACK_PACKAGE_DEFS, CELL_SIZE, SELL_REFUND_RATE, TOWER_DEFS } from '../game/constants';
import { InspectMiniStat } from './InspectMiniStat';
import { formatCompactCount } from '../formatCompactCount';

interface TowerShopProps {
  state: GameState;
  onSelectTower: (type: TowerType | null) => void;
  onUpgrade: (id: string) => void;
  onSell: (id: string) => void;
  onDeselect: () => void;
  onDeployAttack: (id: AttackPackageId) => void;
}

function getTowerTraitLines(type: TowerType, level = 1): string[] {
  switch (type) {
    case 'cannon': {
      const chance = [0, 35, 50, 65][level];
      const armorBreak = [0, 3, 6, 10][level];
      const exposed = [0, 15, 25, 40][level];
      const duration = [0, 3, 4, 5][level];
      return [
        `${chance}% chance to apply a debuff on hit.`,
        `Armor crack: -${armorBreak} armor for ${duration}s.`,
        `Expose: +${exposed}% damage taken for ${duration}s.`,
      ];
    }
    case 'frost':
      return ['Large AoE slow.', '20% chance to freeze for 1s before slowing.'];
    case 'laser':
      return ['Sustained beam DPS.', 'Fires for 2s, cools for 1s.'];
    case 'tesla':
      return [`Chain zap with ${level + 1} hops.`, 'Can bounce back if no fresh creep is nearby.'];
    case 'missile':
      return ['Heavy splash damage.', 'Slow fire rate, best against clustered creeps.'];
  }
}

export function TowerShopStrip({ state, onSelectTower }: Pick<TowerShopProps, 'state' | 'onSelectTower'>) {
  const selectedType = state.selectedTowerType;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border border-cyber-blue/20 bg-dark-900/70 p-3 select-none [scrollbar-width:thin]">
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-cyber-blue rounded-full shadow-cyber" />
            <span className="font-mono text-sm uppercase tracking-widest text-white/45">Tower Shop</span>
          </div>
          <span className="font-mono text-xs text-white/35">[1-5]</span>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-5 gap-2 [grid-template-rows:minmax(0,1fr)]">
          {(Object.keys(TOWER_DEFS) as TowerType[]).map(type => {
            const def = TOWER_DEFS[type];
            const isSelected = selectedType === type;
            const canAfford = state.gold >= def.cost;

            return (
              <button
                key={type}
                onClick={() => onSelectTower(isSelected ? null : type)}
                className={`relative flex h-full min-h-0 flex-col items-center justify-center gap-1.5 rounded-xl border p-2 transition-all duration-200 ${
                  isSelected
                    ? 'border-cyber-blue/80 bg-cyber-blue/15 shadow-cyber'
                    : canAfford
                      ? 'border-white/10 bg-dark-700 hover:border-white/30 hover:bg-dark-600'
                      : 'border-white/5 bg-dark-700 opacity-40 cursor-not-allowed'
                }`}
                disabled={!canAfford && !isSelected}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg border"
                  style={{
                    background: `${def.color}22`,
                    borderColor: `${def.accentColor}44`,
                    boxShadow: isSelected ? `0 0 12px ${def.accentColor}44` : 'none',
                  }}
                >
                  <TowerSvgIcon type={type} color={def.accentColor} />
                </div>

                <span className="font-mono text-sm font-bold text-white/90">{def.name}</span>
                <span className={`font-mono text-xs font-bold ${canAfford ? 'text-yellow-300' : 'text-red-400'}`}>
                  ◆ {formatCompactCount(def.cost)}
                </span>

                {isSelected && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-cyber-blue rounded-full shadow-cyber" />
                )}
              </button>
            );
          })}
        </div>
    </div>
  );
}

export function TowerInspector({
  state,
  onUpgrade,
  onSell,
  onDeselect,
  onDeployAttack,
}: Pick<TowerShopProps, 'state' | 'onUpgrade' | 'onSell' | 'onDeselect' | 'onDeployAttack'>) {
  const selectedTower = state.towers.find(t => t.id === state.selectedTowerId);
  const selectedType = state.selectedTowerType;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden rounded-xl border border-cyber-blue/25 bg-dark-900/70 px-3 py-2.5 select-none [scrollbar-width:thin]">
      {selectedTower ? (
        <SelectedTowerPanel
          state={state}
          tower={selectedTower}
          onUpgrade={onUpgrade}
          onSell={onSell}
          onDeselect={onDeselect}
        />
      ) : selectedType ? (
        <SelectedBuildPanel type={selectedType} />
      ) : (
        <AttackShopPanel state={state} onDeployAttack={onDeployAttack} />
      )}
    </div>
  );
}

/** Same scaffold as SelectedBuildPanel; one scroll column — header through stats. */
function BriefingPlaceholder() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] pr-0.5">
        <div className="mb-2 flex shrink-0 gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-dark-700/70">
            <TowerBriefingGlyph />
          </div>
          <div className="min-w-0">
            <p className="truncate font-mono text-base font-bold leading-tight text-cyber-blue">Briefing</p>
            <p className="mt-0.5 font-mono text-sm leading-snug text-white/55">Pick a tower to preview</p>
          </div>
        </div>

        <p className="mb-2 font-mono text-sm leading-snug text-white/55">
          Select a tower in the shop or a built turret on the grid to inspect stats, traits, upgrades, or
          placement.
        </p>
        <div className="border-t border-white/10 pt-3">
          <p className="font-mono text-sm leading-snug text-white/45">
            ◇ Tower traits and perks list here.
          </p>
        </div>

        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="grid grid-cols-2 grid-rows-2 gap-1.5 [grid-template-rows:repeat(2,minmax(min-content,max-content))]">
            <InspectMiniStat label="Damage" value="—" muted />
            <InspectMiniStat label="Range" value="—" muted />
            <InspectMiniStat label="Rate" value="—" muted />
            <InspectMiniStat label="DPS" value="—" muted />
          </div>
        </div>
      </div>
    </div>
  );
}

function AttackShopPanel({
  state,
  onDeployAttack,
}: {
  state: GameState;
  onDeployAttack: (id: AttackPackageId) => void;
}) {
  const attackIds = Object.keys(ATTACK_PACKAGE_DEFS) as AttackPackageId[];
  const playerAttackers = state.enemies.filter(enemy => enemy.owner === 'player').length;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-base font-bold leading-tight text-red-300">Attack Ops</p>
          <p className="mt-0.5 font-mono text-xs leading-snug text-white/45">
            Threat {formatCompactCount(Math.floor(state.offenseResource))}/{formatCompactCount(state.maxOffenseResource)}
          </p>
        </div>
        <span className="rounded bg-red-500/10 px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wide text-red-300 ring-1 ring-red-400/25">
          PvP
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pr-0.5">
        <div className="grid grid-cols-1 gap-1.5">
          {attackIds.map(id => {
            const def = ATTACK_PACKAGE_DEFS[id];
            const cooldownMs = state.attackCooldowns[id] ?? 0;
            const canAfford = state.offenseResource >= def.cost;
            const disabled = cooldownMs > 0 || !canAfford || state.phase === 'game_over' || state.phase === 'victory';
            const cooldownLabel = cooldownMs > 0 ? `${Math.ceil(cooldownMs / 1000)}s` : null;

            return (
              <button
                key={id}
                type="button"
                onClick={() => onDeployAttack(id)}
                disabled={disabled}
                title={def.description}
                className="flex min-h-[2.625rem] items-center justify-between gap-2 rounded-lg border border-red-400/20 bg-red-500/[0.08] px-2.5 py-1.5 text-left font-mono transition-colors hover:border-red-300/40 hover:bg-red-500/[0.14] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-white/85">{def.name}</span>
                  <span className="block truncate text-[10px] text-white/38">
                    DMG {def.damage} · {Math.round(def.travelMs / 1000)}s
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs font-bold text-red-200">
                  {cooldownLabel ?? `◆ ${formatCompactCount(def.cost)}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 pt-2">
        <div className="flex items-center justify-between gap-2 font-mono text-xs">
          <span className="text-white/40">Opponent HP</span>
          <span className="font-bold tabular-nums text-red-300">
            {state.opponentBaseHp}/{state.maxOpponentBaseHp}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-dark-600">
          <div
            className="h-full rounded-full bg-red-400 transition-all"
            style={{ width: `${(state.opponentBaseHp / state.maxOpponentBaseHp) * 100}%` }}
          />
        </div>
        <p className="mt-1.5 truncate font-mono text-[10px] text-white/35">
          {playerAttackers > 0 ? `${playerAttackers} friendly units advancing.` : 'Deploy units onto the upper road.'}
        </p>
      </div>
    </div>
  );
}

function TowerBriefingGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-cyber-blue/45" aria-hidden>
      <rect x="2.5" y="2.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.25" opacity="0.9" />
      <path d="M6 7h6M6 9.5h4M6 12h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

function SelectedBuildPanel({ type }: { type: TowerType }) {
  const def = TOWER_DEFS[type];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] pr-0.5">
        <div className="mb-2 flex shrink-0 gap-2.5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
            style={{ background: `${def.color}22`, borderColor: `${def.accentColor}55` }}
          >
            <TowerSvgIcon type={type} color={def.accentColor} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-mono text-base font-bold leading-tight text-white">{def.name}</p>
            <p className="mt-0.5 font-mono text-sm leading-snug text-white/55">Click grid to place</p>
          </div>
        </div>

        <p className="mb-2 font-mono text-sm leading-snug text-white/55">{def.description}</p>
        <div className="border-t border-white/10 pt-3">
          <TraitList lines={getTowerTraitLines(type)} noTopRule />
        </div>

        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="grid grid-cols-2 grid-rows-2 gap-1.5 [grid-template-rows:repeat(2,minmax(min-content,max-content))]">
            <InspectMiniStat label="Damage" value={def.damage} />
            <InspectMiniStat label="Range" value={`${def.range.toFixed(1)}c`} />
            <InspectMiniStat label="Rate" value={`${def.fireRate}/s`} />
            <InspectMiniStat label="DPS" value={formatCompactCount(Math.round(def.damage * def.fireRate))} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectedTowerPanel({ state, tower, onUpgrade, onSell, onDeselect }: {
  state: GameState;
  tower: GameState['towers'][number];
  onUpgrade: (id: string) => void;
  onSell: (id: string) => void;
  onDeselect: () => void;
}) {
  const def = TOWER_DEFS[tower.type];
  const upgradeCost = def.upgradeCost[tower.level - 1];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      {/* Header fixed — Footer height is capped; pinning stats avoids a ~0-height scroll viewport. */}
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
            style={{ background: `${def.color}33`, borderColor: `${def.accentColor}66` }}
          >
            <TowerSvgIcon type={tower.type} color={def.accentColor} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-mono text-base font-bold leading-tight text-white">{def.name}</p>
            <div className="mt-0.5 flex gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-2 w-2 rounded-full border"
                  style={{
                    background: i < tower.level ? def.accentColor : 'transparent',
                    borderColor: def.accentColor,
                    boxShadow: i < tower.level ? `0 0 4px ${def.accentColor}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <span
          className="shrink-0 rounded bg-dark-700/70 px-2 py-0.5 font-mono text-sm font-bold tabular-nums text-white/80 ring-1 ring-white/10"
          title={`Kills: ${tower.kills}`}
        >
          Kills {formatCompactCount(tower.kills)}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] pr-0.5">
        {/* Description */}
        {def.description && (
          <p className="mb-2 font-mono text-xs leading-snug text-white/70">
            {def.description}
          </p>
        )}

        {/* Trait lines */}
        <div className="mb-2.5 space-y-1">
          {getTowerTraitLines(tower.type, tower.level).map(line => (
            <p key={line} className="font-mono text-xs leading-snug text-white/50">
              ◇ {line}
            </p>
          ))}
        </div>

        {/* Stats */}
        <div className="border-t border-white/10 pt-2">
          <div className="grid grid-cols-2 grid-rows-2 gap-1.5 [grid-template-rows:repeat(2,minmax(min-content,max-content))]">
            <InspectMiniStat label="Damage" value={tower.damage} />
            <InspectMiniStat label="Range" value={`${(tower.range / CELL_SIZE).toFixed(1)}c`} />
            <InspectMiniStat label="Rate" value={`${tower.fireRate.toFixed(1)}/s`} />
            <InspectMiniStat label="DPS" value={formatCompactCount(Math.round(tower.damage * tower.fireRate))} />
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-1.5 border-t border-white/10 pt-2">
        <div className="grid grid-cols-2 gap-1.5">
          {tower.level < 3 ? (
            <button
              onClick={() => onUpgrade(tower.id)}
              disabled={state.gold < upgradeCost}
              className="flex min-h-[2.5rem] items-center justify-between rounded-xl border border-cyber-blue/50 bg-cyber-blue/15 px-2.5 py-1.5 font-mono text-xs font-bold text-cyber-blue transition-all hover:bg-cyber-blue/25 hover:shadow-cyber disabled:cursor-not-allowed disabled:opacity-30"
            >
              <span>Lv.{tower.level + 1}</span>
              <span className="text-yellow-300">◆ {formatCompactCount(upgradeCost)}</span>
            </button>
          ) : (
            <div className="flex min-h-[2.5rem] items-center justify-center rounded-xl border border-cyber-green/30 bg-cyber-green/10 px-2 font-mono text-xs font-bold uppercase tracking-wider text-cyber-green">
              Max lvl
            </div>
          )}
          <button
            onClick={() => onSell(tower.id)}
            className="flex min-h-[2.5rem] items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 font-mono text-xs text-red-400 transition-all hover:border-red-500/50 hover:bg-red-500/20"
          >
            <span>Sell</span>
            <span className="text-yellow-300">◆ {formatCompactCount(Math.floor(def.cost * SELL_REFUND_RATE))}</span>
          </button>
        </div>
        <button
          onClick={onDeselect}
          className="w-full rounded-xl border border-white/10 px-3 py-1.5 font-mono text-xs text-white/50 transition-all hover:border-white/20 hover:text-white/70"
        >
          Deselect
        </button>
      </div>
    </div>
  );
}

function TraitList({ lines, noTopRule }: { lines: string[]; noTopRule?: boolean }) {
  return (
    <div className={`space-y-1.5 ${noTopRule ? '' : 'border-t border-white/10 pt-3'}`}>
      {lines.slice(0, 3).map(line => (
        <p key={line} className="font-mono text-sm leading-snug text-white/55">
          {line}
        </p>
      ))}
    </div>
  );
}

function TowerSvgIcon({ type, color }: { type: TowerType; color: string }) {
  const icons: Record<TowerType, React.ReactNode> = {
    cannon: (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="11" r="5" fill={color} opacity="0.8" />
        <rect x="7.5" y="1" width="3" height="10" rx="1.5" fill={color} />
      </svg>
    ),
    laser: (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
        <polygon points="9,1 12,7 9,5 6,7" fill={color} />
        <rect x="8" y="5" width="2" height="12" rx="1" fill={color} opacity="0.7" />
        <circle cx="9" cy="17" r="2" fill={color} opacity="0.5" />
      </svg>
    ),
    frost: (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
        <line x1="9" y1="1" x2="9" y2="17" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <line x1="1" y1="9" x2="17" y2="9" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <line x1="3" y1="3" x2="15" y2="15" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <line x1="15" y1="3" x2="3" y2="15" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <circle cx="9" cy="9" r="2.5" fill={color} />
      </svg>
    ),
    tesla: (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
        <polygon points="9,1 13,9 10,9 11,17 5,8 9,8" fill={color} />
      </svg>
    ),
    missile: (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
        <polygon points="9,1 11,5 11,13 9,15 7,13 7,5" fill={color} opacity="0.9" />
        <polygon points="7,5 4,9 7,9" fill={color} opacity="0.6" />
        <polygon points="11,5 14,9 11,9" fill={color} opacity="0.6" />
        <rect x="8" y="13" width="2" height="4" rx="1" fill="#ff7043" />
      </svg>
    ),
  };
  return <>{icons[type]}</>;
}
