import React from 'react';
import type { GameState } from '../game/types';
import { formatCompactCount } from '../formatCompactCount';
import type { PerfStats } from '../hooks/useGameLoop';

interface HUDProps {
  state: GameState;
  perfStats: PerfStats;
  voice: {
    isListening: boolean;
    isSupported: boolean;
    liveTranscript: string;
    lastTranscript: string;
    lastError: string | null;
    startListening: () => void;
    stopListening: () => void;
  };
  onStartMatch: () => void;
  onPause: () => void;
  onSetSpeed: (speed: number) => void;
}

function MatchSide({ label, hp, maxHp, pct, heroLabel, heroAlive, heroHp, heroMaxHp, heroRespawnTimer, heroPct, tone }: {
  label: string;
  hp: number;
  maxHp: number;
  pct: number;
  heroLabel: string;
  heroAlive: boolean;
  heroHp: number;
  heroMaxHp: number;
  heroRespawnTimer: number;
  heroPct: number;
  tone: 'blue' | 'red';
}) {
  const color = tone === 'blue' ? '#00d4ff' : '#f87171';
  const heroColor = tone === 'blue' ? '#64ffda' : '#ff9aaa';
  const heroValue = heroAlive ? `${Math.ceil(heroHp)}/${heroMaxHp}` : `${Math.ceil(heroRespawnTimer / 1000)}s`;
  return (
    <div className="min-w-0 rounded-md bg-dark-900/35 px-2 py-1 font-mono ring-1 ring-white/[0.06]">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-bold uppercase leading-none tracking-wide">
        <span className={tone === 'blue' ? 'text-cyber-blue/75' : 'text-red-200/75'}>{label}</span>
        <span className="tabular-nums text-white/78">{hp}/{maxHp}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-dark-600">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className={tone === 'blue' ? 'shrink-0 text-[10px] font-bold uppercase leading-none tracking-wide text-cyber-green/65' : 'shrink-0 text-[10px] font-bold uppercase leading-none tracking-wide text-red-100/60'}>
          {heroLabel}
        </span>
        <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-dark-600">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.max(0, Math.min(100, heroPct))}%`, background: heroColor, boxShadow: `0 0 5px ${heroColor}` }}
          />
        </div>
        <span className={`shrink-0 text-[10px] font-bold leading-none tabular-nums ${heroAlive ? 'text-white/70' : 'text-yellow-200'}`}>
          {heroAlive ? heroValue : `R ${heroValue}`}
        </span>
      </div>
    </div>
  );
}

function PerfReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-5 border-b border-white/[0.06] py-1.5 last:border-b-0">
      <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-white/42">{label}</span>
      <span className="font-mono text-xs font-bold tabular-nums text-white/82">{value}</span>
    </div>
  );
}

function CompactStat({ label, value, tone, prefix }: { label: string; value: string; tone: string; prefix?: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1 rounded-md bg-dark-900/45 px-2.5 py-1.5 ring-1 ring-white/[0.06]">
      <span className="truncate font-mono text-[10px] font-bold uppercase leading-none tracking-wide text-white/42">
        {label}
      </span>
      <span className={`whitespace-nowrap font-mono text-base font-black leading-none tabular-nums ${tone}`}>
        {prefix ? <span className="mr-0.5 opacity-80">{prefix}</span> : null}
        {value}
      </span>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 14.5a3 3 0 0 0 3-3v-5a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M19 10.5a7 7 0 0 1-14 0M12 17.5V21M9 21h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function VoicePanel({ voice }: { voice: HUDProps['voice'] }) {
  const transcript = voice.liveTranscript || voice.lastTranscript;
  const showCaption = voice.isListening || !!voice.liveTranscript || !!voice.lastError;
  const title = voice.lastError
    ? voice.lastError
    : transcript
      ? `Heard: ${transcript}`
      : 'Say: build cannon at 4 6, hero move to 8 5, hero right, start wave';

  return (
    <div className="relative h-full shrink-0">
      <button
        type="button"
        onClick={voice.isListening ? voice.stopListening : voice.startListening}
        disabled={!voice.isSupported}
        title={title}
        aria-label={voice.isListening ? 'Stop voice control' : 'Start voice control'}
        className={`relative flex h-full min-h-[4rem] w-12 shrink-0 items-center justify-center rounded-lg border transition-all focus-visible:outline-none active:scale-95 ${
          voice.isListening
            ? 'border-cyber-green/70 bg-cyber-green text-dark-900 shadow-[0_0_14px_rgba(0,255,136,0.42)]'
            : voice.isSupported
              ? 'border-cyber-blue/25 bg-dark-900/55 text-cyber-blue hover:border-cyber-blue/45 hover:bg-dark-700/80'
              : 'cursor-not-allowed border-white/10 bg-dark-900/45 text-white/25'
        }`}
      >
        <MicIcon />
        <span
          className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${
            !voice.isSupported ? 'bg-red-300/70' : voice.isListening ? 'bg-cyber-green' : 'bg-white/25'
          }`}
        />
      </button>

      {showCaption ? (
        <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-lg border border-cyber-blue/25 bg-dark-900/95 px-3 py-2 shadow-[0_14px_32px_rgba(0,0,0,0.45),0_0_18px_rgba(0,212,255,0.1)]">
          <p className="mb-1 font-mono text-[10px] font-black uppercase leading-none tracking-[0.18em] text-cyber-blue/60">
            Heard
          </p>
          <p className={`truncate font-mono text-xs font-bold leading-snug ${voice.lastError ? 'text-red-300' : voice.liveTranscript ? 'text-white/82' : 'text-white/55'}`}>
            {voice.lastError ?? transcript ?? 'Listening...'}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function MatchStatusPanel({ state }: { state: GameState }) {
  const livesPct = (state.playerBaseHp / state.maxPlayerBaseHp) * 100;
  const opponentPct = (state.opponentBaseHp / state.maxOpponentBaseHp) * 100;
  const heroPct = (state.hero.hp / state.hero.maxHp) * 100;
  const opponentHeroPct = (state.opponentHero.hp / state.opponentHero.maxHp) * 100;
  const playerTowerCount = state.towers.filter(tower => tower.owner === 'player').length;
  const opponentTowerCount = state.towers.filter(tower => tower.owner === 'opponent').length;
  const playerAttackers = state.enemies.filter(enemy => enemy.owner === 'player').length;
  const opponentAttackers = state.enemies.filter(enemy => enemy.owner === 'opponent').length;

  return (
    <div
      className="box-border flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-1 overflow-hidden rounded-xl border border-solid border-cyber-green/35 bg-cyber-green/[0.08] px-2.5 py-1.5 shadow-[0_8px_26px_rgba(0,0,0,0.35),0_0_14px_rgba(0,255,136,0.08)] sm:px-3"
      style={{ backgroundClip: 'padding-box' }}
    >
      <div className="flex min-h-0 w-full min-w-0 max-w-full flex-nowrap items-center justify-between gap-x-2 border-b border-solid border-white/[0.09] pb-1 sm:gap-x-3">
        <div className="flex min-h-0 min-w-0 flex-1 items-center gap-x-2 overflow-hidden">
          <span
            className={`h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5 ${
              state.phase === 'playing' ? 'animate-pulse bg-cyber-green' : 'bg-cyber-green/75'
            }`}
          />
          <span className="min-w-0 truncate font-mono text-xs font-black uppercase leading-none tracking-wide text-cyber-green sm:text-sm">
            {state.phase === 'paused'
              ? 'PVP · PAUSED'
              : state.phase === 'playing'
                ? 'PVP · LIVE'
                : state.phase === 'wave_complete' || state.phase === 'menu'
                  ? 'PVP · READY'
                  : state.phase === 'victory'
                    ? 'PVP · VICTORY'
                    : state.phase === 'game_over'
                      ? 'PVP · DEFEAT'
                      : 'Ready'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-right font-mono text-[11px] tabular-nums text-white/65">
          <span>Units {playerAttackers}/{opponentAttackers}</span>
          <span>Towers {playerTowerCount}/{opponentTowerCount}</span>
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <MatchSide
          label="Your Core"
          hp={state.playerBaseHp}
          maxHp={state.maxPlayerBaseHp}
          pct={livesPct}
          heroLabel="Hero"
          heroAlive={state.hero.isAlive}
          heroHp={state.hero.hp}
          heroMaxHp={state.hero.maxHp}
          heroRespawnTimer={state.hero.respawnTimer}
          heroPct={heroPct}
          tone="blue"
        />
        <div className="font-mono text-xs font-black tracking-wide text-white/40">VS</div>
        <MatchSide
          label="Enemy Core"
          hp={state.opponentBaseHp}
          maxHp={state.maxOpponentBaseHp}
          pct={opponentPct}
          heroLabel="Hero"
          heroAlive={state.opponentHero.isAlive}
          heroHp={state.opponentHero.hp}
          heroMaxHp={state.opponentHero.maxHp}
          heroRespawnTimer={state.opponentHero.respawnTimer}
          heroPct={opponentHeroPct}
          tone="red"
        />
      </div>
    </div>
  );
}

export function HUD({ state, perfStats, voice, onStartMatch, onPause, onSetSpeed }: HUDProps) {
  const [showPerfStats, setShowPerfStats] = React.useState(false);
  const livesPct = (state.playerBaseHp / state.maxPlayerBaseHp) * 100;
  const livesColor = livesPct > 60 ? '#00ff88' : livesPct > 30 ? '#ffcc00' : '#ff4444';
  const opponentPct = (state.opponentBaseHp / state.maxOpponentBaseHp) * 100;
  const heroPct = (state.hero.hp / state.hero.maxHp) * 100;
  const opponentHeroPct = (state.opponentHero.hp / state.opponentHero.maxHp) * 100;
  const playerTowerCount = state.towers.filter(tower => tower.owner === 'player').length;
  const opponentTowerCount = state.towers.filter(tower => tower.owner === 'opponent').length;
  const playerAttackers = state.enemies.filter(enemy => enemy.owner === 'player').length;
  const opponentAttackers = state.enemies.filter(enemy => enemy.owner === 'opponent').length;
  const controlsEnabled = state.gameMode !== 'multi_player';
  const fpsTone =
    perfStats.fps >= 55
      ? 'text-cyber-green'
      : perfStats.fps >= 45
        ? 'text-yellow-300'
        : 'text-red-300';

  const fpsLedStyle =
    perfStats.fps >= 55
      ? { backgroundColor: '#00ff88', boxShadow: '0 0 8px rgba(0,255,136,0.75)' }
      : perfStats.fps >= 45
        ? { backgroundColor: '#fde047', boxShadow: '0 0 8px rgba(253,224,71,0.65)' }
        : { backgroundColor: '#fca5a5', boxShadow: '0 0 8px rgba(252,165,165,0.65)' };

  const showStartMatchBtn = state.phase === 'wave_complete';
  const startMatchActionLabel = 'Start match';
  const startMatchHoverHint = 'Start PvP match simulation';

  const speedPresetButtons = [0.5, 1, 2, 3].map((speed, i) => (
    <button
      key={speed}
      type="button"
      onClick={() => onSetSpeed(speed)}
      className={`flex h-7 w-10 items-center justify-center font-mono text-xs font-bold tabular-nums transition-all focus-visible:outline-none active:scale-95 ${
        i === 0 ? 'rounded-l-md' : i === 3 ? 'rounded-r-md' : ''
      } ${
        state.gameSpeed === speed
          ? 'bg-cyber-blue text-dark-900 shadow-[0_0_10px_rgba(0,212,255,0.4)] z-[1]'
          : 'bg-dark-700/80 text-white/45 hover:bg-dark-600 hover:text-white/80'
      }`}
    >
      {speed === 0.5 ? '.5×' : `${speed}×`}
    </button>
  ));

  return (
    <div className="relative grid h-full min-h-0 min-w-0 w-full grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] items-center gap-x-3 overflow-visible bg-dark-800 px-3 py-3 select-none">
      {/* Left — compact stats + voice controls */}
      <div className="grid min-h-0 min-w-0 max-h-full w-full grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2 self-center overflow-hidden border-r border-white/[0.07] pr-2">
        <div className="grid min-h-0 min-w-0 grid-cols-2 gap-1.5">
          <CompactStat label="Gold" value={formatCompactCount(state.gold)} tone="text-yellow-300" prefix="◆" />
          <CompactStat label="HP" value={`${state.playerBaseHp}/${state.maxPlayerBaseHp}`} tone={livesColor === '#ff4444' ? 'text-red-300' : livesColor === '#ffcc00' ? 'text-yellow-300' : 'text-cyber-green'} />
          <CompactStat label="Kills" value={formatCompactCount(state.totalKills)} tone="text-cyber-purple" />
          <CompactStat label="Score" value={formatCompactCount(state.score)} tone="text-cyber-blue" />
        </div>
        <VoicePanel voice={voice} />
      </div>

      {/* Center intentionally blank for now */}
      <div className="min-h-0 min-w-0" />

      {/* Right — speed + perf toggle + action button */}
      <div className="relative flex min-h-0 min-w-0 max-h-full flex-col items-end justify-center gap-1.5 self-center overflow-visible border-l border-white/[0.07] pl-3">
        {/* Row 1: speed strip + perf button */}
        <div className="flex items-center gap-2">
          {controlsEnabled ? (
            <div className="flex overflow-hidden rounded-md ring-1 ring-white/10">
              {speedPresetButtons}
            </div>
          ) : null}

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowPerfStats((v) => !v)}
              aria-expanded={showPerfStats}
              aria-label="Toggle performance stats"
              title="Performance stats"
              className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 font-mono text-xs font-bold transition-all focus-visible:outline-none ${
                showPerfStats
                  ? 'bg-cyber-blue/20 text-cyber-blue ring-1 ring-cyber-blue/40'
                  : 'bg-dark-700/80 text-white/45 hover:text-white/75'
              }`}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={fpsLedStyle} aria-hidden />
              <span>PERF</span>
              <span className={fpsTone}>{Math.round(perfStats.fps)}</span>
            </button>

            {showPerfStats ? (
              <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-cyber-blue/25 bg-dark-900/95 px-3 py-2 shadow-[0_18px_40px_rgba(0,0,0,0.5),0_0_24px_rgba(0,212,255,0.1)] backdrop-blur">
                <div className="mb-1.5 flex items-center justify-between border-b border-cyber-blue/15 pb-1.5">
                  <span className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-cyber-blue/70">Perf</span>
                  <span className={`font-mono text-xs font-black tabular-nums ${fpsTone}`}>
                    {Math.round(perfStats.fps)} FPS
                  </span>
                </div>
                <PerfReadout label="Frame" value={`${perfStats.frameMs.toFixed(1)}ms`} />
                <PerfReadout label="Update" value={`${perfStats.updateMs.toFixed(1)}ms`} />
                <PerfReadout label="Render" value={`${perfStats.renderMs.toFixed(1)}ms`} />
                <PerfReadout label="Objects" value={formatCompactCount(perfStats.objects)} />
                <PerfReadout label="Memory" value={perfStats.memoryMb === null ? 'n/a' : `${perfStats.memoryMb.toFixed(0)}MB`} />
              </div>
            ) : null}
          </div>
        </div>

        {/* Row 2: action button (Start / Pause / Resume) */}
        {controlsEnabled && showStartMatchBtn ? (
          <button
            type="button"
            onClick={onStartMatch}
            title={startMatchHoverHint}
            aria-label={`${startMatchActionLabel}. Primary control to begin the match.`}
            className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-cyber-green px-3 font-mono text-xs font-black text-dark-900 shadow-[0_0_14px_rgba(0,255,136,0.35)] transition-all motion-safe:animate-pulse hover:animate-none hover:shadow-[0_0_22px_rgba(0,255,136,0.55)] active:scale-95 focus-visible:outline-none"
          >
            <span aria-hidden className="text-[10px]">▶</span>
            START
          </button>
        ) : null}

        {controlsEnabled && state.phase === 'playing' ? (
          <button
            type="button"
            onClick={onPause}
            className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-dark-700/80 px-3 font-mono text-xs font-bold text-white/70 ring-1 ring-white/10 transition-all hover:bg-dark-600 hover:text-white focus-visible:outline-none"
          >
            <span aria-hidden className="text-[10px]">⏸</span>
            PAUSE
          </button>
        ) : null}

        {controlsEnabled && state.phase === 'paused' ? (
          <button
            type="button"
            onClick={onPause}
            className="flex h-7 w-full animate-pulse items-center justify-center gap-1.5 rounded-md bg-cyber-blue/15 px-3 font-mono text-xs font-bold text-cyber-blue ring-1 ring-cyber-blue/35 transition-all hover:animate-none hover:bg-cyber-blue/25 focus-visible:outline-none"
          >
            <span aria-hidden className="text-[10px]">▶</span>
            RESUME
          </button>
        ) : null}

      </div>
    </div>
  );
}
