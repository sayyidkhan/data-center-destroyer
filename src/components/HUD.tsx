import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { VoicePhase } from '../hooks/useVoiceController';
import type { GameState } from '../game/types';
import { formatCompactCount } from '../formatCompactCount';
import type { PerfStats } from '../hooks/useGameLoop';

export interface BattleLogEntry {
  id: number;
  text: string;
  createdAt?: number;
  tone?: 'normal' | 'info' | 'success' | 'warning' | 'danger';
}

interface HUDProps {
  state: GameState;
  perfStats: PerfStats;
  voice: {
    isListening: boolean;
    isSupported: boolean;
    liveTranscript: string;
    lastTranscript: string;
    lastError: string | null;
    audioLevel: number;
    voicePhase: VoicePhase;
    startListening: () => void;
    stopListening: () => void;
  };
  playerBattleLog: BattleLogEntry[];
  opponentBattleLog: BattleLogEntry[];
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

// Phase config — colours and labels for each voice state
const PHASE_CONFIG: Record<VoicePhase, { color: string; glow: string; label: string; barColor: string }> = {
  idle:       { color: '#60a5fa', glow: 'rgba(96,165,250,0.3)',   label: 'TAP TO SPEAK',  barColor: '#60a5fa' },
  listening:  { color: '#00d4ff', glow: 'rgba(0,212,255,0.35)',   label: 'READY',         barColor: '#00d4ff' },
  hearing:    { color: '#00ff88', glow: 'rgba(0,255,136,0.5)',    label: 'HEARING',       barColor: '#00ff88' },
  processing: { color: '#f59e0b', glow: 'rgba(245,158,11,0.45)', label: 'PROCESSING…',   barColor: '#f59e0b' },
  done:       { color: '#00ff88', glow: 'rgba(0,255,136,0.6)',    label: 'GOT IT',        barColor: '#00ff88' },
};

const NUM_BARS = 7;

function VoicePanel({ voice }: { voice: HUDProps['voice'] }) {
  const phase = voice.isListening ? voice.voicePhase : 'idle';
  const cfg = PHASE_CONFIG[phase];
  const level = voice.audioLevel;

  const tickRef = useRef(0);
  const [bars, setBars] = useState<number[]>(Array(NUM_BARS).fill(0.15));

  useEffect(() => {
    let raf = 0;
    const animate = (t: number) => {
      tickRef.current = t;
      setBars(prev => prev.map((_, i) => {
        if (phase === 'hearing') {
          const jitter = Math.sin(t * 0.012 + i * 1.3) * 0.18;
          return Math.max(0.08, Math.min(1, level + jitter));
        }
        if (phase === 'processing') {
          const wave = Math.abs(Math.sin(t * 0.004 + i * 0.7));
          return 0.2 + wave * 0.6;
        }
        if (phase === 'listening') {
          const pulse = Math.abs(Math.sin(t * 0.0018 + i * 0.9)) * 0.25;
          return 0.08 + pulse;
        }
        if (phase === 'done') return 1;
        return 0.06;
      }));
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [phase, level]);

  const transcript = voice.liveTranscript || voice.lastTranscript;
  const title = voice.lastError ? voice.lastError : transcript ? `Heard: ${transcript}` : 'Click to start voice control';

  return (
    <div className="relative h-full shrink-0">
      <button
        type="button"
        onClick={voice.isListening ? voice.stopListening : voice.startListening}
        disabled={!voice.isSupported}
        title={title}
        aria-label={voice.isListening ? 'Stop voice control' : 'Start voice control'}
        style={{
          borderColor: voice.isListening ? cfg.color + '99' : undefined,
          boxShadow: voice.isListening ? `0 0 16px ${cfg.glow}, inset 0 0 12px ${cfg.glow}` : undefined,
          background: voice.isListening ? `linear-gradient(180deg, ${cfg.color}12 0%, ${cfg.color}06 100%)` : undefined,
        }}
        className={`relative flex h-full min-h-[4rem] w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border transition-all duration-300 focus-visible:outline-none active:scale-95 overflow-hidden ${
          voice.isListening
            ? 'border-transparent'
            : voice.isSupported
              ? 'border-cyber-blue/25 bg-dark-900/55 text-cyber-blue hover:border-cyber-blue/45 hover:bg-dark-700/80'
              : 'cursor-not-allowed border-white/10 bg-dark-900/45 text-white/25'
        }`}
      >
        {/* Animated waveform bars */}
        <div className="flex items-end gap-[2px]" style={{ height: 22 }}>
          {bars.map((h, i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: `${Math.round(h * 22)}px`,
                background: voice.isListening ? cfg.barColor : '#ffffff33',
                borderRadius: 2,
                transition: phase === 'done' ? 'height 80ms ease-out' : 'height 60ms ease-out',
                boxShadow: voice.isListening && h > 0.4 ? `0 0 4px ${cfg.barColor}` : undefined,
              }}
            />
          ))}
        </div>

        {/* Phase label */}
        <span
          style={{ color: voice.isListening ? cfg.color : undefined, fontSize: 8 }}
          className={`font-mono font-black uppercase leading-none tracking-wider transition-colors duration-300 ${
            voice.isListening ? '' : 'text-white/25'
          }`}
        >
          {voice.isListening ? cfg.label : voice.isSupported ? 'VOICE' : 'N/A'}
        </span>

        {/* Status dot */}
        <span
          style={{
            background: voice.isListening ? cfg.color : undefined,
            boxShadow: voice.isListening ? `0 0 6px ${cfg.color}` : undefined,
          }}
          className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full transition-all duration-300 ${
            !voice.isListening ? (voice.isSupported ? 'bg-white/20' : 'bg-red-400/60') : ''
          } ${phase === 'hearing' ? 'animate-ping' : ''}`}
        />

        {/* Processing spinner ring */}
        {phase === 'processing' && (
          <div
            className="pointer-events-none absolute inset-0 rounded-lg"
            style={{
              background: `conic-gradient(${cfg.color}55 0deg, transparent 200deg)`,
              animation: 'spin 0.9s linear infinite',
            }}
          />
        )}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ChatLogLine({ entry, align = 'left' }: { entry: BattleLogEntry; align?: 'left' | 'right' }) {
  const toneClass =
    entry.tone === 'success'
      ? 'border-cyber-green/25 bg-cyber-green/[0.08] text-cyber-green'
      : entry.tone === 'warning'
        ? 'border-yellow-300/20 bg-yellow-300/[0.07] text-yellow-200'
        : entry.tone === 'danger'
          ? 'border-red-300/25 bg-red-400/[0.08] text-red-200'
          : entry.tone === 'info'
            ? 'border-cyber-blue/22 bg-cyber-blue/[0.07] text-cyber-blue'
            : 'border-white/[0.08] bg-dark-700/55 text-white/68';

  const timestamp = typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
    ? entry.createdAt
    : Date.now();
  const time = new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className={`flex ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-full rounded-md border px-2 py-1 font-mono leading-tight ${toneClass}`}>
        <div className={`mb-0.5 text-[9px] font-black leading-none text-white/32 ${align === 'right' ? 'text-right' : 'text-left'}`}>
          {time}
        </div>
        <div className="text-[11px] font-bold leading-tight">
          {entry.text}
        </div>
      </div>
    </div>
  );
}

function ChatLogOverlay({
  title,
  entries,
  tone,
  align,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: {
  title: string;
  entries: BattleLogEntry[];
  tone: 'player' | 'opponent';
  align: 'left' | 'right';
  anchorRect: DOMRect;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const isPlayer = tone === 'player';
  const OVERLAY_W = 420;

  // Position: sit just below the anchor panel, aligned to its left or right edge
  const top = anchorRect.bottom + 8; // 8px gap below the panel
  const left = isPlayer
    ? anchorRect.left
    : Math.max(0, anchorRect.right - OVERLAY_W);

  const toneClassFor = (t: BattleLogEntry['tone']) =>
    t === 'success' ? 'border-cyber-green/30 bg-cyber-green/[0.09] text-cyber-green' :
    t === 'warning'  ? 'border-yellow-300/25 bg-yellow-300/[0.08] text-yellow-200' :
    t === 'danger'   ? 'border-red-300/30 bg-red-400/[0.09] text-red-200' :
    t === 'info'     ? 'border-cyber-blue/25 bg-cyber-blue/[0.08] text-cyber-blue' :
                       'border-white/10 bg-dark-700/60 text-white/75';

  return createPortal(
    <div
      style={{ position: 'fixed', top, left, width: OVERLAY_W, zIndex: 9999 }}
      className={`flex flex-col gap-2 rounded-xl border p-4 shadow-[0_24px_60px_rgba(0,0,0,0.75),0_0_30px_rgba(0,0,0,0.5)] backdrop-blur-md ${
        isPlayer ? 'border-cyber-blue/30 bg-dark-900/97' : 'border-red-300/25 bg-dark-900/97'
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Overlay header */}
      <div className={`flex items-center justify-between border-b pb-2 ${isPlayer ? 'border-cyber-blue/15' : 'border-red-300/15'}`}>
        <span className={`font-mono text-xs font-black uppercase tracking-[0.18em] ${isPlayer ? 'text-cyber-blue' : 'text-red-300'}`}>
          {title}
        </span>
        <span className="font-mono text-[10px] text-white/35">{entries.length} entries</span>
      </div>

      {/* Scrollable log */}
      <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-width:thin]">
        {entries.length === 0 ? (
          <p className="py-6 text-center font-mono text-xs text-white/25">No messages yet</p>
        ) : (
          entries.map(entry => {
            const ts = typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now();
            const time = new Date(ts).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return (
              <div key={entry.id} className={`flex ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-full rounded-lg border px-3 py-1.5 font-mono ${toneClassFor(entry.tone)}`}>
                  <div className={`mb-0.5 text-[9px] font-black leading-none text-white/30 ${align === 'right' ? 'text-right' : 'text-left'}`}>
                    {time}
                  </div>
                  <div className="text-xs font-bold leading-snug">{entry.text}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>,
    document.body,
  );
}

function ChatLogPanel({
  title,
  entries,
  liveEntry,
  tone,
  align = 'left',
  active = false,
}: {
  title: string;
  entries: BattleLogEntry[];
  liveEntry?: BattleLogEntry | null;
  tone: 'player' | 'opponent';
  align?: 'left' | 'right';
  active?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayer = tone === 'player';

  const visibleEntries = [
    ...(liveEntry ? [liveEntry] : []),
    ...entries,
  ].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || b.id - a.id);

  const show = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (sectionRef.current) setAnchorRect(sectionRef.current.getBoundingClientRect());
    setExpanded(true);
  }, []);

  const hide = useCallback(() => {
    hideTimerRef.current = setTimeout(() => setExpanded(false), 150);
  }, []);

  // Keep anchorRect fresh while overlay is open (handles window resize / scroll)
  useEffect(() => {
    if (!expanded) return;
    const update = () => {
      if (sectionRef.current) setAnchorRect(sectionRef.current.getBoundingClientRect());
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [expanded]);

  return (
    <section
      ref={sectionRef}
      className={`relative flex min-h-0 min-w-0 flex-col gap-1 rounded-lg border px-3 py-2 ${
        isPlayer ? 'border-cyber-blue/15 bg-dark-900/35' : 'border-red-300/15 bg-red-500/[0.055]'
      }`}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {/* Header */}
      <div className="flex cursor-default items-center justify-between gap-2">
        <span className={`font-mono text-[10px] font-black uppercase leading-none tracking-[0.18em] ${
          isPlayer ? 'text-cyber-blue/70' : 'text-red-200/70'
        }`}>
          {title}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[8px] text-white/20">↓ hover</span>
          <span className={`h-1.5 w-1.5 rounded-full ${
            active
              ? isPlayer
                ? 'bg-cyber-green shadow-[0_0_8px_rgba(0,255,136,0.7)]'
                : 'bg-red-300 shadow-[0_0_8px_rgba(248,113,113,0.65)]'
              : 'bg-white/20'
          }`} />
        </div>
      </div>

      {/* Compact in-panel log */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-width:thin]">
        {visibleEntries.map(entry => (
          <ChatLogLine key={entry.id} entry={entry} align={align} />
        ))}
      </div>

      {/* Portal overlay */}
      {expanded && anchorRect && (
        <ChatLogOverlay
          title={title}
          entries={visibleEntries}
          tone={tone}
          align={align}
          anchorRect={anchorRect}
          onMouseEnter={show}
          onMouseLeave={hide}
        />
      )}
    </section>
  );
}

function BattleLogsPanel({
  state,
  voice,
  playerBattleLog,
  opponentBattleLog,
}: {
  state: GameState;
  voice: HUDProps['voice'];
  playerBattleLog: BattleLogEntry[];
  opponentBattleLog: BattleLogEntry[];
}) {
  const liveTranscript = voice.lastError
    ? { id: -2, text: `Voice error: ${voice.lastError}`, createdAt: Date.now(), tone: 'danger' as const }
    : voice.liveTranscript
      ? { id: -1, text: `Hearing: "${voice.liveTranscript}"`, createdAt: Date.now(), tone: 'info' as const }
      : null;

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 overflow-hidden px-1">
      <ChatLogPanel
        title="User Comms"
        entries={playerBattleLog}
        liveEntry={liveTranscript}
        tone="player"
        active={voice.isListening}
      />
      <div className="flex min-h-0 items-stretch">
        <VoicePanel voice={voice} />
      </div>
      <ChatLogPanel
        title="Opponent Comms"
        entries={opponentBattleLog}
        tone="opponent"
        align="right"
        active={state.phase === 'playing'}
      />
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

export function HUD({ state, perfStats, voice, playerBattleLog, opponentBattleLog, onStartMatch, onPause, onSetSpeed }: HUDProps) {
  const [showPerfStats, setShowPerfStats] = React.useState(false);
  const livesPct = (state.playerBaseHp / state.maxPlayerBaseHp) * 100;
  const livesColor = livesPct > 60 ? '#00ff88' : livesPct > 30 ? '#ffcc00' : '#ff4444';
  const controlsEnabled = state.gameMode !== 'multi_player';
  const speedControlEnabled = controlsEnabled;
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
      {/* Left — compact stats */}
      <div className="grid min-h-0 min-w-0 max-h-full w-full grid-cols-2 gap-1.5 self-center overflow-hidden border-r border-white/[0.07] pr-2">
        <CompactStat label="Gold" value={formatCompactCount(state.gold)} tone="text-yellow-300" prefix="◆" />
        <CompactStat label="HP" value={`${state.playerBaseHp}/${state.maxPlayerBaseHp}`} tone={livesColor === '#ff4444' ? 'text-red-300' : livesColor === '#ffcc00' ? 'text-yellow-300' : 'text-cyber-green'} />
        <CompactStat label="Kills" value={formatCompactCount(state.totalKills)} tone="text-cyber-purple" />
        <CompactStat label="Score" value={formatCompactCount(state.score)} tone="text-cyber-blue" />
      </div>

      <BattleLogsPanel
        state={state}
        voice={voice}
        playerBattleLog={playerBattleLog}
        opponentBattleLog={opponentBattleLog}
      />

      {/* Right — speed + perf toggle + action button */}
      <div className="relative flex min-h-0 min-w-0 max-h-full flex-col items-end justify-center gap-1.5 self-center overflow-visible border-l border-white/[0.07] pl-3">
        {/* Row 1: speed strip + perf button */}
        <div className="flex items-center gap-2">
          {speedControlEnabled ? (
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

        {/* Row 2: action button (Start / Pause / Resume) — visible in all modes */}
        {showStartMatchBtn ? (
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

        {state.phase === 'playing' ? (
          <button
            type="button"
            onClick={onPause}
            className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-dark-700/80 px-3 font-mono text-xs font-bold text-white/70 ring-1 ring-white/10 transition-all hover:bg-dark-600 hover:text-white focus-visible:outline-none"
          >
            <span aria-hidden className="text-[10px]">⏸</span>
            PAUSE
          </button>
        ) : null}

        {state.phase === 'paused' ? (
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
