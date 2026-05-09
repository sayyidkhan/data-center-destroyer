import React from 'react';
import type { GameState } from '../game/types';
import { formatCompactCount } from '../formatCompactCount';

interface GameOverlayProps {
  state: GameState;
  menuStage: 'launch' | 'pick_mode' | 'mp_lobby';
  onContinueToModeSelect: () => void;
  onBackToLaunch: () => void;
  onStart: () => void;
  onVersusIntroComplete: () => void;
  onRestart: () => void;
  onResume: () => void;
  onMultiplayerStart?: () => void;
  room?: any;
  playerRole?: 'host' | 'guest' | null;
  onReady?: () => void;
}

export function GameOverlay({
  state,
  menuStage,
  onContinueToModeSelect,
  onBackToLaunch,
  onStart,
  onVersusIntroComplete,
  onRestart,
  onResume,
  onMultiplayerStart,
  room,
  playerRole,
  onReady,
}: GameOverlayProps) {
  if (state.phase === 'playing' || state.phase === 'wave_complete') return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {state.phase === 'menu' && (
        <div
          className="pointer-events-auto absolute inset-0 flex items-center justify-center p-4"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MenuScreen
            stage={menuStage}
            onContinueToModeSelect={onContinueToModeSelect}
            onBackToLaunch={onBackToLaunch}
            onStart={onStart}
            onMultiplayerStart={onMultiplayerStart}
            room={room}
            playerRole={playerRole}
            onReady={onReady}
          />
        </div>
      )}
      {state.phase === 'versus_intro' && (
        <VersusIntroScreen state={state} onComplete={onVersusIntroComplete} />
      )}
      {state.phase === 'paused' && (
        <PauseScreen state={state} onResume={onResume} onRestart={onRestart} />
      )}
      {state.phase === 'game_over' && (
        <GameOverScreen state={state} onRestart={onRestart} />
      )}
      {state.phase === 'victory' && (
        <VictoryScreen state={state} onRestart={onRestart} />
      )}
    </div>
  );
}

function MenuScreen({
  stage,
  onContinueToModeSelect,
  onBackToLaunch,
  onStart,
  onMultiplayerStart,
  room,
  playerRole,
  onReady,
}: {
  stage: 'launch' | 'pick_mode' | 'mp_lobby';
  onContinueToModeSelect: () => void;
  onBackToLaunch: () => void;
  onStart: () => void;
  onMultiplayerStart?: () => void;
  room?: any;
  playerRole?: 'host' | 'guest' | null;
  onReady?: () => void;
}) {
  return (
    <div
      className={`relative pointer-events-auto flex flex-col items-center text-center ${
        stage === 'pick_mode' ? 'gap-4 px-5 pb-5 pt-2 sm:px-8' : 'gap-6 p-8'
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-dark-900/40 via-dark-900/70 to-dark-900/90" />

      <div
        className={`relative z-10 flex w-full max-w-2xl flex-col items-center ${
          stage === 'launch' ? 'gap-6' : 'gap-4'
        }`}
      >
        {stage === 'launch' ? (
          <div className="flex flex-col items-center gap-2">
            <div className="mb-1 flex items-center gap-2">
              <div className="h-px w-8 bg-cyber-blue/60" />
              <span className="font-mono text-xs uppercase tracking-widest text-cyber-blue/60">2026 Edition</span>
              <div className="h-px w-8 bg-cyber-blue/60" />
            </div>
            <h1
              className="text-6xl font-black uppercase tracking-tight text-white"
              style={{
                fontFamily: 'Orbitron, sans-serif',
                textShadow: '0 0 40px rgba(0,212,255,0.6), 0 0 80px rgba(0,212,255,0.2)',
              }}
            >
              DATA CENTER
            </h1>
            <h1
              className="text-6xl font-black uppercase tracking-tight"
              style={{
                fontFamily: 'Orbitron, sans-serif',
                color: '#00d4ff',
                textShadow: '0 0 40px rgba(0,212,255,0.8), 0 0 80px rgba(0,212,255,0.4)',
              }}
            >
              DESTROYER
            </h1>
          </div>
        ) : null}

        {stage === 'launch' ? (
          <>
            <p className="max-w-md font-mono text-base leading-relaxed text-white/45">
              Tower defense, mecha ops, and a contested lane to the enemy core. Boot the operations deck when you are ready.
            </p>
            <button
              type="button"
              onClick={onContinueToModeSelect}
              className="group relative overflow-hidden rounded-2xl border border-cyber-green/45 bg-cyber-green/[0.12] px-14 py-5 font-mono text-xl font-black uppercase tracking-[0.2em] text-cyber-green transition-all hover:scale-[1.02] hover:border-cyber-green/70 hover:bg-cyber-green/[0.18] active:scale-[0.98]"
              style={{ boxShadow: '0 0 36px rgba(0,255,136,0.22), 0 8px 28px rgba(0,0,0,0.45)' }}
            >
              <span className="relative z-10 drop-shadow-[0_0_12px_rgba(0,255,136,0.45)]">Launch</span>
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </button>
            <p className="font-mono text-xs text-white/30">Press [Space] or [Enter] to continue</p>
          </>
        ) : (
          <>
            <p
              className="font-mono text-sm font-black uppercase tracking-[0.22em] text-cyber-blue/75 sm:text-base"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              Select deployment
            </p>
            <p className="max-w-md font-mono text-sm leading-relaxed text-white/45 sm:text-base">
              Choose Local for an offline run against the AI defense kernel: quick uplink reel, then you’re live—place towers,
              click-move your mecha, and send waves until one core goes dark.
            </p>

            <div className="grid w-full max-w-xl grid-cols-2 gap-4">
              <button
                type="button"
                onClick={onStart}
                className="group flex min-h-36 flex-col items-start justify-between rounded-2xl border border-cyber-blue/45 bg-cyber-blue/[0.12] p-5 text-left transition-all hover:scale-[1.02] hover:bg-cyber-blue/[0.18] active:scale-[0.98]"
                style={{ boxShadow: '0 0 30px rgba(0,212,255,0.16), 0 4px 20px rgba(0,0,0,0.3)' }}
              >
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-cyber-blue/75">Local Mode</span>
                <span className="font-mono text-2xl font-black uppercase tracking-wide text-white">Single Player</span>
                <span className="font-mono text-xs leading-relaxed text-white/50">
                  Fight the AI, control start/pause/speed, build defenses, and attack the enemy data center.
                </span>
              </button>

              <button
                type="button"
                onClick={onMultiplayerStart}
                className="group flex min-h-36 flex-col items-start justify-between rounded-2xl border border-fuchsia-400/35 bg-fuchsia-400/[0.08] p-5 text-left transition-all hover:scale-[1.02] hover:bg-fuchsia-400/[0.14] active:scale-[0.98]"
                style={{ boxShadow: '0 0 30px rgba(232,121,249,0.14), 0 4px 20px rgba(0,0,0,0.3)' }}
              >
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-fuchsia-300/80">Online Mode</span>
                <span className="font-mono text-2xl font-black uppercase tracking-wide text-white">Multiplayer</span>
                <span className="font-mono text-xs leading-relaxed text-white/55">
                  PvP against a real opponent. Deterministic lockstep with Convex backend.
                </span>
              </button>
            </div>

            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={onBackToLaunch}
                className="min-h-11 rounded-xl bg-dark-800/90 px-6 py-2.5 font-mono text-sm font-bold uppercase tracking-[0.18em] text-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all hover:bg-dark-700/95 hover:text-cyber-blue/95 active:scale-[0.98] sm:min-h-12 sm:px-8 sm:text-base"
              >
                ← Back
              </button>
              <p className="font-mono text-xs text-white/30">Press [Space] to choose Single Player · [Esc] back</p>
            </div>
          </>
        )}

        {stage === 'mp_lobby' && room && playerRole && (
          <div className="flex w-full flex-col items-center gap-5">
            <p
              className="font-mono text-sm font-black uppercase tracking-[0.22em] text-fuchsia-300/80 sm:text-base"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              Match Room
            </p>
            <div className="flex flex-col items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-widest text-white/40">Room Code</span>
              <span className="rounded-xl border border-fuchsia-400/25 bg-fuchsia-400/10 px-6 py-2 font-mono text-2xl font-black tracking-[0.15em] text-fuchsia-300">
                {room.code}
              </span>
            </div>
            <div className="flex items-center gap-4 font-mono text-sm text-white/60">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyber-green" />
                Host
              </span>
              <span className="text-white/20">vs</span>
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${room.guestId ? 'bg-cyber-green' : 'bg-white/20'}`} />
                Guest
              </span>
            </div>
            <button
              type="button"
              onClick={onReady}
              disabled={room.hostReady && playerRole === 'host' || room.guestReady && playerRole === 'guest'}
              className="group relative overflow-hidden rounded-2xl border border-cyber-green/45 bg-cyber-green/[0.12] px-12 py-4 font-mono text-lg font-black uppercase tracking-[0.15em] text-cyber-green transition-all hover:scale-[1.02] hover:bg-cyber-green/[0.18] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ boxShadow: '0 0 30px rgba(0,255,136,0.18)' }}
            >
              {room.hostReady && playerRole === 'host' ? 'Waiting...' : room.guestReady && playerRole === 'guest' ? 'Waiting...' : 'Ready'}
            </button>
            <button
              type="button"
              onClick={onBackToLaunch}
              className="rounded-xl bg-dark-800/90 px-6 py-2.5 font-mono text-sm font-bold uppercase tracking-[0.18em] text-white/55 transition-all hover:bg-dark-700/95 hover:text-red-300"
            >
              Leave Room
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const VERSUS_MAIN_MS = 6200;
const VERSUS_EXIT_MS = 780;

function fakeLoadPercent(elapsedMs: number, mainMs: number): number {
  const sprintStart = mainMs - 280;
  if (elapsedMs >= sprintStart) {
    const sprintT = Math.min(1, (elapsedMs - sprintStart) / (mainMs - sprintStart));
    return 94 + sprintT * 6;
  }
  const t = Math.min(1, elapsedMs / sprintStart);
  const eased = 1 - (1 - t) ** 2.45;
  return eased * 94;
}

function VersusIntroScreen({ state, onComplete }: { state: GameState; onComplete: () => void }) {
  const doneRef = React.useRef(false);
  const exitingRef = React.useRef(false);
  const startRef = React.useRef(performance.now());
  const barFillRef = React.useRef<HTMLDivElement>(null);
  const pctTextRef = React.useRef<HTMLSpanElement>(null);

  const [exiting, setExiting] = React.useState(false);

  const finish = React.useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  }, [onComplete]);

  const triggerExit = React.useCallback(() => {
    if (doneRef.current || exitingRef.current) return;
    exitingRef.current = true;
    if (barFillRef.current) barFillRef.current.style.width = '100%';
    if (pctTextRef.current) pctTextRef.current.textContent = '100%';
    setExiting(true);
  }, []);

  React.useEffect(() => {
    if (!exiting) return;
    const id = window.setTimeout(finish, VERSUS_EXIT_MS);
    return () => clearTimeout(id);
  }, [exiting, finish]);

  React.useEffect(() => {
    startRef.current = performance.now();
    let rafId = 0;
    const loop = (now: number) => {
      if (doneRef.current) return;
      if (exitingRef.current) return;

      const elapsed = now - startRef.current;
      if (elapsed >= VERSUS_MAIN_MS) {
        triggerExit();
        return;
      }

      const pct = fakeLoadPercent(elapsed, VERSUS_MAIN_MS);
      if (barFillRef.current) barFillRef.current.style.width = `${pct}%`;
      if (pctTextRef.current) pctTextRef.current.textContent = `${Math.round(pct)}%`;

      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [triggerExit]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        triggerExit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [triggerExit]);

  const svgUid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const mechGradId = `versus-mech-${svgUid}`;
  const aiGradId = `versus-ai-${svgUid}`;
  const mp = state.gameMode === 'multi_player';
  const leftName = mp ? 'YOU' : 'GRIDRUNNER';
  const rightName = mp ? 'RIVAL' : 'NEURAL HOST';
  const leftBadge = mp ? 'OPERATOR' : 'DROP LEAD';
  const rightBadge = mp ? 'CONTENDER' : 'AI KERNEL';

  return (
    <>
      <style>{`
        @keyframes versus-shine {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(120%);
          }
        }
      `}</style>
      <div
        className={`pointer-events-auto absolute inset-0 z-30 flex flex-col overflow-hidden bg-gradient-to-b from-[#1a0d2e] via-[#0d0718] to-[#050810] transition-[opacity,transform,filter] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity,transform,filter] ${
          exiting ? 'opacity-0 pointer-events-none scale-[1.04] blur-[10px]' : 'opacity-100 scale-100 blur-0'
        }`}
        style={{ transitionDuration: `${VERSUS_EXIT_MS}ms` }}
      >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_38%,rgba(124,58,237,0.22),transparent_55%)]" />

      <div className="relative flex min-h-0 flex-1 flex-row">
        {/* Left — player / cyan */}
        <div className="relative flex min-w-0 flex-1 flex-col justify-end overflow-hidden border-r border-fuchsia-500/25 bg-gradient-to-br from-cyan-950/50 via-[#06091c]/95 to-dark-900 pb-5 pl-5 pr-4 pt-16 sm:pb-8 sm:pl-8">
          <div className="pointer-events-none absolute -left-[18%] bottom-[8%] h-[120%] w-[85%] rounded-full bg-cyan-400/15 blur-[80px]" />
          <div className="pointer-events-none absolute left-[12%] top-[18%] h-36 w-36 rounded-full border border-cyan-400/25 shadow-[0_0_40px_rgba(34,211,238,0.35)] sm:h-44 sm:w-44 animate-pulse" />

          <div className="relative mb-6 flex flex-1 items-center justify-center sm:mb-10">
            <svg
              className="relative z-[1] h-[min(52vw,240px)] w-auto drop-shadow-[0_0_24px_rgba(34,211,238,0.35)]"
              viewBox="0 0 200 220"
              fill="none"
              aria-hidden
            >
              <defs>
                <linearGradient id={mechGradId} x1="40" y1="0" x2="160" y2="220" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#22d3ee" />
                  <stop offset="1" stopColor="#6366f1" />
                </linearGradient>
              </defs>
              <ellipse cx="100" cy="200" rx="70" ry="12" fill="rgba(34,211,238,0.12)" />
              <path
                d="M100 28 L140 52 L138 98 L152 108 L148 142 L130 152 L130 188 L70 188 L70 152 L52 142 L48 108 L62 98 L60 52 Z"
                stroke={`url(#${mechGradId})`}
                strokeWidth="3"
                fill="rgba(6,12,28,0.85)"
              />
              <circle cx="100" cy="72" r="10" fill="#22d3ee" opacity="0.9" />
              <path d="M62 98 H38 V118 H58" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" />
              <path d="M138 98 H162 V118 H142" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" />
              <path d="M88 118 H112 V158 H88 Z" fill="rgba(34,211,238,0.15)" stroke="#22d3ee" strokeWidth="2" />
            </svg>
          </div>

          <div className="relative z-[2] space-y-2">
            <span className="inline-block rounded-md bg-fuchsia-500/90 px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider text-white shadow-[0_0_12px_rgba(217,70,239,0.45)]">
              {leftBadge}
            </span>
            <h2
              className="-skew-x-6 text-3xl font-black uppercase tracking-tight text-white drop-shadow-[0_0_20px_rgba(34,211,238,0.45)] sm:text-4xl"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              {leftName}
            </h2>
            <div className="flex items-center gap-2 font-mono text-[11px] text-white/45">
              <span className="flex h-7 w-7 items-center justify-center rounded border border-cyan-400/35 bg-dark-900/80 text-cyan-300">
                ◇
              </span>
              <span className="truncate">Defense uplink · Channel A</span>
            </div>
          </div>
        </div>

        {/* Right — opponent / magenta */}
        <div className="relative flex min-w-0 flex-1 flex-col justify-end overflow-hidden bg-gradient-to-bl from-fuchsia-950/40 via-[#120818]/95 to-dark-900 pb-5 pl-4 pr-5 pt-16 sm:pb-8 sm:pr-8">
          <div className="pointer-events-none absolute -right-[14%] bottom-[10%] h-[115%] w-[78%] rounded-full bg-fuchsia-500/18 blur-[76px]" />
          <div className="pointer-events-none absolute right-[14%] top-[20%] h-32 w-32 rounded-full bg-lime-400/20 blur-2xl sm:h-40 sm:w-40 animate-pulse" />

          <div className="relative mb-6 flex flex-1 items-center justify-center sm:mb-10">
            <svg
              className="relative z-[1] h-[min(52vw,240px)] w-auto drop-shadow-[0_0_28px_rgba(217,70,239,0.45)]"
              viewBox="0 0 200 220"
              fill="none"
              aria-hidden
            >
              <defs>
                <linearGradient id={aiGradId} x1="160" y1="0" x2="40" y2="220" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#e879f9" />
                  <stop offset="1" stopColor="#a855f7" />
                </linearGradient>
              </defs>
              <ellipse cx="100" cy="200" rx="72" ry="12" fill="rgba(232,121,249,0.12)" />
              <path
                d="M100 24 L168 88 L155 130 L168 150 L152 192 L48 192 L32 150 L45 130 L32 88 Z"
                stroke={`url(#${aiGradId})`}
                strokeWidth="3"
                fill="rgba(18,8,28,0.88)"
              />
              <circle cx="100" cy="92" r="22" stroke="#86efac" strokeWidth="2.5" fill="rgba(34,197,94,0.12)" />
              <circle cx="100" cy="92" r="8" fill="#86efac" opacity="0.95" />
              <path d="M48 118 L32 108 M152 118 L168 108" stroke="#e879f9" strokeWidth="3" strokeLinecap="round" />
              <path d="M72 168 H128" stroke="#a855f7" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </div>

          <div className="relative z-[2] space-y-2 text-right">
            <span className="inline-block rounded-md bg-lime-400/90 px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider text-dark-900 shadow-[0_0_14px_rgba(163,230,53,0.5)]">
              {rightBadge}
            </span>
            <h2
              className="-skew-x-6 text-3xl font-black uppercase tracking-tight text-white drop-shadow-[0_0_22px_rgba(232,121,249,0.5)] sm:text-4xl"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              {rightName}
            </h2>
            <div className="flex items-center justify-end gap-2 font-mono text-[11px] text-white/45">
              <span className="truncate">{mp ? 'Guest circuit · Channel B' : 'Synthetic wavemind'}</span>
              <span className="flex h-7 w-7 items-center justify-center rounded border border-fuchsia-400/35 bg-dark-900/80 text-fuchsia-300">
                ⬡
              </span>
            </div>
          </div>
        </div>

        {/* VS */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[5] -translate-x-1/2 -translate-y-1/2">
          <div
            className="-skew-x-12 rounded-lg border border-white/15 bg-dark-900/75 px-5 py-3 shadow-[0_0_40px_rgba(124,58,237,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm sm:px-8 sm:py-4"
            style={{ fontFamily: 'Orbitron, sans-serif' }}
          >
            <span className="block text-center text-4xl font-black tracking-widest text-white drop-shadow-[0_0_24px_rgba(168,85,247,0.55)] sm:text-6xl">
              VS
            </span>
          </div>
        </div>
      </div>

      <div className="relative z-[6] shrink-0 border-t border-white/[0.06] bg-black/45 px-4 py-3 backdrop-blur-[2px]">
        <div className="mx-auto w-full max-w-lg space-y-2">
          <div className="flex items-end justify-between gap-3 font-mono">
            <div className="min-w-0 space-y-0.5">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/40">Grid sync</p>
              <p className="truncate text-[11px] text-cyan-300/70">Handshake · pathing lattice · threat buffers</p>
            </div>
            <span
              ref={pctTextRef}
              className="shrink-0 text-lg font-black tabular-nums text-cyber-blue drop-shadow-[0_0_12px_rgba(0,212,255,0.35)] sm:text-xl"
            >
              0%
            </span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-dark-800 ring-1 ring-white/[0.09]">
            <div
              ref={barFillRef}
              className="relative h-full w-0 rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.35)] transition-[width] duration-100 ease-out"
            />
            <div
              className="pointer-events-none absolute inset-y-0 left-0 w-full opacity-35"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 45%, transparent 70%)',
                animation: 'versus-shine 1.6s ease-in-out infinite',
              }}
            />
          </div>
        </div>
        <p className="mt-2.5 text-center font-mono text-[10px] uppercase tracking-[0.35em] text-white/30">
          Deploying to battlefield · [Space] skip
        </p>
      </div>
      </div>
    </>
  );
}

function PauseScreen({ state, onResume, onRestart }: { state: GameState; onResume: () => void; onRestart: () => void }) {
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-5">
      <div className="absolute inset-0 bg-dark-900/60 backdrop-blur-sm" />
      <div className="relative z-10 flex flex-col items-center gap-5 bg-dark-800/90 border border-cyber-blue/30 rounded-3xl p-8 shadow-cyber">
        <h2 className="text-2xl font-black text-white uppercase tracking-wider" style={{ fontFamily: 'Orbitron, sans-serif' }}>Paused</h2>
        <div className="flex flex-col gap-2 text-center">
          <StatLine label="Mode" value={state.gameMode === 'single_player' ? 'Single Player' : 'Match'} />
          <StatLine label="Score" value={formatCompactCount(state.score)} />
          <StatLine label="Kills" value={formatCompactCount(state.totalKills)} />
          <StatLine label="Gold Earned" value={formatCompactCount(state.totalGoldEarned)} />
        </div>
        <div className="flex gap-3">
          <button onClick={onResume} className="px-6 py-2.5 bg-cyber-blue/20 border border-cyber-blue/60 rounded-xl text-cyber-blue font-bold font-mono text-sm hover:bg-cyber-blue/30 transition-all">
            ▶ Resume
          </button>
          <button onClick={onRestart} className="px-6 py-2.5 bg-dark-700 border border-white/20 rounded-xl text-white/60 font-mono text-sm hover:text-white/80 transition-all">
            ↺ Restart
          </button>
        </div>
      </div>
    </div>
  );
}

function GameOverScreen({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  const baseDestroyed = state.playerBaseHp <= 0;
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-5">
      <div className="absolute inset-0 bg-dark-900/75 backdrop-blur-sm" />
      <div className="relative z-10 flex flex-col items-center gap-5 bg-dark-800/95 border border-red-500/40 rounded-3xl p-8" style={{ boxShadow: '0 0 40px rgba(255,68,68,0.2)' }}>
        <div className="text-5xl">💀</div>
        <h2 className="text-3xl font-black text-red-400 uppercase tracking-wider" style={{ fontFamily: 'Orbitron, sans-serif', textShadow: '0 0 20px rgba(255,68,68,0.5)' }}>
          Game Over
        </h2>
        <p className="text-white/50 text-sm font-mono">
          {baseDestroyed ? 'Your data center was destroyed.' : 'The defense line collapsed.'}
        </p>
        <div className="flex flex-col gap-2 text-center">
          <StatLine label="Mode" value={state.gameMode === 'single_player' ? 'Single Player' : 'Match'} />
          <StatLine label="Base HP" value={`${state.playerBaseHp} / ${state.maxPlayerBaseHp}`} />
          <StatLine label="Enemy Core" value={`${state.opponentBaseHp} / ${state.maxOpponentBaseHp}`} />
          <StatLine label="Final Score" value={formatCompactCount(state.score)} />
          <StatLine label="Total Kills" value={formatCompactCount(state.totalKills)} />
          <StatLine label="Towers Built" value={state.towers.filter(tower => tower.owner === 'player').length} />
        </div>
        <button
          onClick={onRestart}
          className="px-8 py-3 font-bold rounded-xl font-mono uppercase tracking-widest text-dark-900 transition-all hover:scale-105"
          style={{ background: 'linear-gradient(135deg, #ff4444, #cc0000)', boxShadow: '0 0 20px rgba(255,68,68,0.3)' }}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

function VictoryScreen({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  const opponentDestroyed = state.opponentBaseHp <= 0;
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-5">
      <div className="absolute inset-0 bg-dark-900/70 backdrop-blur-sm" />
      <div className="relative z-10 flex flex-col items-center gap-5 bg-dark-800/95 border border-yellow-400/40 rounded-3xl p-8" style={{ boxShadow: '0 0 60px rgba(255,204,0,0.2)' }}>
        <div className="text-5xl animate-bounce">🏆</div>
        <h2 className="text-3xl font-black uppercase tracking-wider" style={{ fontFamily: 'Orbitron, sans-serif', color: '#ffcc00', textShadow: '0 0 30px rgba(255,204,0,0.6)' }}>
          Victory!
        </h2>
        <p className="text-white/50 text-sm font-mono">
          {opponentDestroyed ? 'Opponent data center destroyed!' : 'Match won.'}
        </p>
        <div className="flex flex-col gap-2 text-center">
          <StatLine label="Base HP" value={`${state.playerBaseHp} / ${state.maxPlayerBaseHp}`} />
          <StatLine label="Enemy Core" value={`${state.opponentBaseHp} / ${state.maxOpponentBaseHp}`} />
          <StatLine label="Final Score" value={formatCompactCount(state.score)} />
          <StatLine label="Total Kills" value={formatCompactCount(state.totalKills)} />
          <StatLine label="Gold Earned" value={formatCompactCount(state.totalGoldEarned)} />
        </div>
        <button
          onClick={onRestart}
          className="px-8 py-3 font-bold rounded-xl font-mono uppercase tracking-widest text-dark-900 transition-all hover:scale-105"
          style={{ background: 'linear-gradient(135deg, #ffcc00, #ff9900)', boxShadow: '0 0 30px rgba(255,204,0,0.4)' }}
        >
          Play Again
        </button>
      </div>
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-8">
      <span className="text-sm text-white/45 font-mono">{label}</span>
      <span className="text-base font-bold text-white font-mono">{value}</span>
    </div>
  );
}
