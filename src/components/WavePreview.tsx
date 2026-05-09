import React from 'react';
import type { GameState } from '../game/types';
import { WAVE_DEFS, ENEMY_DEFS, MAX_WAVES } from '../game/constants';

interface WavePreviewProps {
  state: GameState;
  compact?: boolean;
}

export function WavePreview({ state: gameState, compact = false }: WavePreviewProps) {
  const nextWaveIdx = gameState.wave; // 0-indexed for WAVE_DEFS
  if (nextWaveIdx >= MAX_WAVES) return null;

  const nextWave = WAVE_DEFS[nextWaveIdx];
  const totalEnemies = nextWave.enemies.reduce((s, g) => s + g.count, 0);

  if (compact) {
    return (
      <div className="pointer-events-none rounded-xl border border-cyber-blue/20 bg-dark-900/90 px-3 py-2 shadow-2xl backdrop-blur-sm select-none">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-1.5 h-3 bg-cyber-purple rounded-full" style={{ boxShadow: '0 0 6px #7c3aed' }} />
            <span className="text-xs font-mono uppercase tracking-widest text-white/50">
              Wave {nextWaveIdx + 1}
            </span>
          </div>
          <span className="flex-shrink-0 font-mono text-xs font-bold text-yellow-300/80">◆ +{nextWave.goldBonus}</span>
        </div>

        <div className="mt-1.5 flex items-center gap-2 overflow-hidden">
          {nextWave.enemies.map((group, i) => {
            const def = ENEMY_DEFS[group.type];
            return (
              <div key={i} className="flex items-center gap-1.5 flex-shrink-0">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: def.color, boxShadow: `0 0 4px ${def.color}` }}
                />
                <span className="font-mono text-xs capitalize text-white/70">{group.type}</span>
                <span className="font-mono text-xs text-white/45">x{group.count}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-1 text-right font-mono text-xs font-bold text-white/50">{totalEnemies} total</div>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 border-t border-cyber-blue/20 px-4 py-2.5 flex items-center gap-6 select-none">
      <div className="flex items-center gap-2 min-w-[90px]">
        <div className="w-1.5 h-3 bg-cyber-purple rounded-full" style={{ boxShadow: '0 0 6px #7c3aed' }} />
        <span className="font-mono text-xs uppercase tracking-widest text-white/45">
          Next: Wave {nextWaveIdx + 1}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-1 overflow-x-auto">
        {nextWave.enemies.map((group, i) => {
          const def = ENEMY_DEFS[group.type];
          return (
            <div key={i} className="flex items-center gap-1.5 flex-shrink-0">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ background: def.color, boxShadow: `0 0 4px ${def.color}` }}
              />
              <span className="font-mono text-sm capitalize text-white/65">{group.type}</span>
              <span className="font-mono text-sm text-white/35">×{group.count}</span>
              {i < nextWave.enemies.length - 1 && (
                <span className="text-white/15 mx-1">·</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-white/40">Total:</span>
          <span className="font-mono text-sm font-bold text-white/75">{totalEnemies}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-yellow-400">◆</span>
          <span className="font-mono text-sm font-bold text-yellow-300/75">+{nextWave.goldBonus}</span>
        </div>
      </div>
    </div>
  );
}
