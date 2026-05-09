import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import type { AttackPackageId, GameState, TowerType } from './game/types';
import { commandHeroMove, createInitialState, deployAttackPackage, placeTower, sellTower, upgradeTower, startWave } from './game/engine';
import { renderGame } from './game/renderer';
import { type PerfStats, useGameLoop } from './hooks/useGameLoop';
import { CELL_SIZE, GRID_COLS, VIEWPORT_COLS, VIEWPORT_W, VIEWPORT_H, MAP_W, HUD_SLOT_H, FOOTER_H, FOOTER_GRID_MIN_W, isPlayerBuildableCell } from './game/constants';
import { HUD } from './components/HUD';
import { TowerInspector, TowerShopStrip } from './components/TowerShop';
import { GameOverlay } from './components/GameOverlay';
import { InspectMiniStat } from './components/InspectMiniStat';
import { formatCompactCount } from './formatCompactCount';

const MAX_CAM_X = MAP_W - VIEWPORT_W;
const PAN_ZONE = 60;   // px from edge that triggers auto-pan
const PAN_SPEED = 280; // px/s
const VIEWPORT_FIT_MARGIN = 28;

const CHROME_FRAME_STYLE = {
  boxShadow: '0 0 60px rgba(0,212,255,0.08), 0 20px 60px rgba(0,0,0,0.6)',
} as const;

type MenuStage = 'launch' | 'pick_mode';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(createInitialState());
  const [snapshot, setSnapshot] = useState<GameState>(stateRef.current);
  const [menuStage, setMenuStage] = useState<MenuStage>('launch');
  const menuStageRef = useRef<MenuStage>('launch');
  menuStageRef.current = menuStage;
  const [perfStats, setPerfStats] = useState<PerfStats>({
    fps: 60,
    frameMs: 16.7,
    updateMs: 0,
    renderMs: 0,
    objects: 0,
    memoryMb: null,
  });
  const hoveredCellRef = useRef<{ x: number; y: number } | null>(null);

  // Camera pan via mouse edge proximity
  const mousePanRef = useRef(0); // -1 left, 0 none, 1 right

  // Throttle React re-renders
  const lastSnapshotRef = useRef(0);
  const setThrottledSnapshot = useCallback((s: GameState) => {
    const now = performance.now();
    if (now - lastSnapshotRef.current > 50) {
      lastSnapshotRef.current = now;
      setSnapshot({ ...s });
    }
  }, []);

  const renderFn = useCallback((ctx: CanvasRenderingContext2D, state: GameState, time: number) => {
    renderGame(ctx, state, hoveredCellRef.current, time);
  }, []);

  const { start, stop } = useGameLoop(stateRef, setThrottledSnapshot, canvasRef, renderFn, setPerfStats);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  const prevPhaseRef = useRef<GameState['phase'] | undefined>(undefined);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = snapshot.phase;
    if (snapshot.phase === 'menu' && prev !== undefined && prev !== 'menu') {
      setMenuStage('launch');
    }
  }, [snapshot.phase]);

  // Edge-pan ticker — runs separately from game loop
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
      last = t;
      const dir = mousePanRef.current;
      if (dir !== 0) {
        const state = stateRef.current;
        const newCamX = Math.max(0, Math.min(MAX_CAM_X, state.cameraX + dir * PAN_SPEED * dt));
        if (newCamX !== state.cameraX) {
          stateRef.current = { ...state, cameraX: newCamX };
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Mouse wheel scroll
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      const state = stateRef.current;
      const newCamX = Math.max(0, Math.min(MAX_CAM_X, state.cameraX + delta * 1.2));
      if (newCamX !== state.cameraX) {
        stateRef.current = { ...state, cameraX: newCamX };
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // ---- Helpers ----

  const getWorldPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = VIEWPORT_W / rect.width;
    const scaleY = VIEWPORT_H / rect.height;
    const viewX = (e.clientX - rect.left) * scaleX;
    const viewY = (e.clientY - rect.top) * scaleY;
    return {
      x: viewX + stateRef.current.cameraX,
      y: viewY,
    };
  }, []);

  const getWorldCell = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getWorldPoint(e);
    return {
      x: Math.floor(point.x / CELL_SIZE),
      y: Math.floor(point.y / CELL_SIZE),
    };
  }, [getWorldPoint]);

  // ---- Canvas Events ----

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getWorldCell(e);
    const point = getWorldPoint(e);
    const state = stateRef.current;

    if (state.selectedTowerType && state.grid[y]?.[x] === 'empty' && isPlayerBuildableCell(x)) {
      stateRef.current = placeTower(state, x, y, state.selectedTowerType);
      setSnapshot({ ...stateRef.current });
      return;
    }

    const tower = state.towers.find(t => t.owner === 'player' && t.gridX === x && t.gridY === y);
    if (tower) {
      stateRef.current = { ...stateRef.current, selectedTowerId: tower.id, selectedTowerType: null };
      setSnapshot({ ...stateRef.current });
      return;
    }

    stateRef.current = commandHeroMove(stateRef.current, point.x, point.y);
    setSnapshot({ ...stateRef.current });
  }, [getWorldCell, getWorldPoint]);

  const handleCanvasContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const point = getWorldPoint(e);
    stateRef.current = commandHeroMove(stateRef.current, point.x, point.y);
    setSnapshot({ ...stateRef.current });
  }, [getWorldPoint]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getWorldCell(e);
    hoveredCellRef.current = { x, y };

    // Edge pan
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = VIEWPORT_W / rect.width;
    const localX = (e.clientX - rect.left) * scaleX;
    if (localX < PAN_ZONE) mousePanRef.current = -1;
    else if (localX > VIEWPORT_W - PAN_ZONE) mousePanRef.current = 1;
    else mousePanRef.current = 0;
  }, [getWorldCell]);

  const handleMouseLeave = useCallback(() => {
    hoveredCellRef.current = null;
    mousePanRef.current = 0;
  }, []);

  // ---- Game actions ----

  const handleSelectTower = useCallback((type: TowerType | null) => {
    stateRef.current = { ...stateRef.current, selectedTowerType: type, selectedTowerId: null };
    setSnapshot({ ...stateRef.current });
  }, []);

  const handleUpgrade = useCallback((id: string) => {
    stateRef.current = upgradeTower(stateRef.current, id);
    setSnapshot({ ...stateRef.current });
  }, []);

  const handleSell = useCallback((id: string) => {
    stateRef.current = sellTower(stateRef.current, id);
    setSnapshot({ ...stateRef.current });
  }, []);

  const handleDeployAttack = useCallback((id: AttackPackageId) => {
    stateRef.current = deployAttackPackage(stateRef.current, id);
    setSnapshot({ ...stateRef.current });
  }, []);

  const handleDeselect = useCallback(() => {
    stateRef.current = { ...stateRef.current, selectedTowerId: null, selectedTowerType: null };
    setSnapshot({ ...stateRef.current });
  }, []);

  const handleOutsideSelectionClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const state = stateRef.current;
    if (!state.selectedTowerType && !state.selectedTowerId) return;

    const target = e.target as HTMLElement;
    if (target.closest('button, canvas')) return;

    handleDeselect();
  }, [handleDeselect]);

  const handleStartMatch = useCallback(() => {
    const cur = stateRef.current;
    if (cur.phase === 'menu' || cur.phase === 'wave_complete' || cur.phase === 'playing') {
      stateRef.current = startWave({ ...cur, phase: cur.phase === 'menu' ? 'wave_complete' : cur.phase });
      setSnapshot({ ...stateRef.current });
    }
  }, []);

  const handleVersusIntroComplete = useCallback(() => {
    if (stateRef.current.phase !== 'versus_intro') return;
    stateRef.current = { ...stateRef.current, phase: 'wave_complete' };
    setSnapshot({ ...stateRef.current });
  }, []);

  const handlePause = useCallback(() => {
    const cur = stateRef.current.phase;
    stateRef.current = { ...stateRef.current, phase: cur === 'playing' ? 'paused' : 'playing' };
    setSnapshot({ ...stateRef.current });
  }, []);

  const handleSetSpeed = useCallback((speed: number) => {
    stateRef.current = { ...stateRef.current, gameSpeed: speed };
    setSnapshot({ ...stateRef.current });
  }, []);

  const handleStart = useCallback(() => {
    stateRef.current = { ...stateRef.current, gameMode: 'single_player', phase: 'versus_intro' };
    setSnapshot({ ...stateRef.current });
  }, []);

  const handleRestart = useCallback(() => {
    stateRef.current = { ...createInitialState(), gameMode: 'single_player', phase: 'wave_complete' };
    setSnapshot({ ...stateRef.current });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const TOWER_KEYS: Record<string, TowerType> = {
      '1': 'cannon', '2': 'laser', '3': 'frost', '4': 'tesla', '5': 'missile',
    };
    const onKey = (e: KeyboardEvent) => {
      const state = stateRef.current;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (state.phase === 'menu') {
          if (menuStageRef.current === 'launch') setMenuStage('pick_mode');
          else handleStart();
        } else if (state.phase === 'wave_complete') handleStartMatch();
      }
      if (e.key === 'p' || e.key === 'P') {
        if (state.phase === 'playing' || state.phase === 'paused') handlePause();
      }
      if (e.key === 'Escape') {
        if (state.phase === 'menu' && menuStageRef.current === 'pick_mode') {
          e.preventDefault();
          setMenuStage('launch');
          return;
        }
        stateRef.current = { ...stateRef.current, selectedTowerType: null, selectedTowerId: null };
        setSnapshot({ ...stateRef.current });
      }
      // Arrow key / A/D pan (disabled during matchup reel)
      if (state.phase !== 'versus_intro') {
        if (e.key === 'ArrowRight' || e.key === 'd') {
          stateRef.current = { ...stateRef.current, cameraX: Math.min(MAX_CAM_X, stateRef.current.cameraX + CELL_SIZE * 3) };
          setSnapshot({ ...stateRef.current });
        }
        if (e.key === 'ArrowLeft' || e.key === 'a') {
          stateRef.current = { ...stateRef.current, cameraX: Math.max(0, stateRef.current.cameraX - CELL_SIZE * 3) };
          setSnapshot({ ...stateRef.current });
        }
      }
      if (TOWER_KEYS[e.key] && state.phase !== 'game_over' && state.phase !== 'victory' && state.phase !== 'versus_intro') {
        const type = TOWER_KEYS[e.key];
        stateRef.current = {
          ...stateRef.current,
          selectedTowerType: stateRef.current.selectedTowerType === type ? null : type,
          selectedTowerId: null,
        };
        setSnapshot({ ...stateRef.current });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleStart, handleStartMatch, handlePause]);

  const isGameActive = snapshot.phase !== 'menu' && snapshot.phase !== 'versus_intro';

  const gameChromeRef = useRef<HTMLDivElement>(null);
  const [chromeFit, setChromeFit] = useState<{ scale: number; boxW: number; boxH: number }>({
    scale: 1,
    boxW: 0,
    boxH: 0,
  });

  useLayoutEffect(() => {
    const el = gameChromeRef.current;
    if (!el) return;

    const vv = typeof window !== 'undefined' ? window.visualViewport : null;

    const measure = () => {
      const w = Math.max(el.offsetWidth, Math.ceil(el.scrollWidth));
      const h = Math.max(el.offsetHeight, Math.ceil(el.scrollHeight));
      if (w <= 0 || h <= 0) return;

      const availW = (vv?.width ?? window.innerWidth) - VIEWPORT_FIT_MARGIN * 2;
      const availH = (vv?.height ?? window.innerHeight) - VIEWPORT_FIT_MARGIN * 2;

      const scale = Math.min(1, availW / w, availH / h);
      setChromeFit({ scale, boxW: w, boxH: h });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
    };
  }, []);

  // Mini-map scroll indicator
  const camPct = snapshot.cameraX / MAX_CAM_X;

  const fitScale = chromeFit.scale;
  const fitOuterStyle =
    chromeFit.boxW > 0 && chromeFit.boxH > 0
      ? {
          width: chromeFit.boxW * fitScale,
          height: chromeFit.boxH * fitScale,
        }
      : undefined;

  return (
    <div
      className="w-screen h-screen flex items-center justify-center overflow-hidden min-h-[100dvh]"
      style={{ background: 'radial-gradient(ellipse at 50% 30%, #0a1220 0%, #050810 100%)' }}
    >
      <div
        className="flex-shrink-0 overflow-hidden rounded-2xl border border-cyber-blue/20 bg-dark-900"
        style={{ ...(fitOuterStyle ?? {}), ...CHROME_FRAME_STYLE }}
      >
        <div
          ref={gameChromeRef}
          className={`flex w-full shrink-0 flex-col overflow-hidden ${isGameActive ? 'bg-dark-800' : 'bg-dark-900'}`}
          style={{
            width: VIEWPORT_W,
            maxWidth: VIEWPORT_W,
            transform: fitScale !== 1 ? `scale(${fitScale})` : undefined,
            transformOrigin: 'top left',
          }}
        >
        {/* Same fixed shell on menu & in-game so scale-to-fit and footprint match */}
        <div
          className={`relative z-30 flex shrink-0 flex-col ${
            !isGameActive ? 'border-b border-cyber-blue/20' : ''
          } ${isGameActive ? 'overflow-visible bg-dark-800' : 'overflow-hidden bg-dark-900'}`}
          style={{ height: HUD_SLOT_H }}
        >
          {isGameActive ? (
            <HUD
              state={snapshot}
              perfStats={perfStats}
              onStartMatch={handleStartMatch}
              onPause={handlePause}
              onSetSpeed={handleSetSpeed}
            />
          ) : (
            <MenuChromeTop />
          )}
        </div>

        {/* Main: canvas + shop — shrink-0 so flex parents never squash fixed canvas height */}
        <div
          className="relative z-10 flex shrink-0 items-stretch"
          style={{ height: VIEWPORT_H + FOOTER_H }}
          onClick={handleOutsideSelectionClick}
        >
          <div className="relative flex shrink-0 flex-col" style={{ width: VIEWPORT_W }}>
            {/* Isolate overlays to the grid only — inset-0 must not include the footer row */}
            <div className="relative shrink-0 overflow-hidden" style={{ width: VIEWPORT_W, height: VIEWPORT_H }}>
              <canvas
                ref={canvasRef}
                width={VIEWPORT_W}
                height={VIEWPORT_H}
                onClick={handleCanvasClick}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onContextMenu={handleCanvasContextMenu}
                className="block"
                style={{ cursor: snapshot.selectedTowerType ? 'crosshair' : 'default' }}
              />
              <GameOverlay
                state={snapshot}
                menuStage={menuStage}
                onContinueToModeSelect={() => setMenuStage('pick_mode')}
                onBackToLaunch={() => setMenuStage('launch')}
                onStart={handleStart}
                onVersusIntroComplete={handleVersusIntroComplete}
                onRestart={handleRestart}
                onResume={handlePause}
              />
            </div>



            <div
              className={`relative z-10 shrink-0 overflow-x-auto overflow-y-hidden p-3 [scrollbar-width:thin] ${
                !isGameActive ? 'border-t border-cyber-blue/20' : ''
              } ${isGameActive ? 'bg-dark-800' : 'bg-dark-900'}`}
              style={{ height: FOOTER_H }}
            >
              {isGameActive ? (
                <div
                  className="grid h-full min-h-0 min-w-0 w-full grid-cols-[1fr_2fr_1fr] gap-3"
                  style={{ minWidth: FOOTER_GRID_MIN_W }}
                >
                  <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                    <HeroStatus state={snapshot} />
                  </div>
                  <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                    <TowerShopStrip state={snapshot} onSelectTower={handleSelectTower} />
                  </div>
                  <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                    <TowerInspector
                      state={snapshot}
                      onUpgrade={handleUpgrade}
                      onSell={handleSell}
                      onDeselect={handleDeselect}
                      onDeployAttack={handleDeployAttack}
                    />
                  </div>
                </div>
              ) : (
                <MenuChromeFooter />
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

function MenuChromeTop() {
  return (
    <div className="relative flex h-full min-h-0 flex-col justify-center gap-2 px-5 select-none">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(-60deg, transparent, transparent 11px, rgba(0,212,255,0.045) 11px, rgba(0,212,255,0.045) 12px)',
        }}
      />
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-[0.22em] text-cyber-blue/55">
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyber-green shadow-[0_0_8px_rgba(100,255,218,0.55)]" />
          Facility standby
        </span>
        <span className="hidden text-white/35 sm:inline">Defense grid offline · awaiting deployment order</span>
      </div>
      <div className="relative flex flex-wrap gap-2">
        {['Uplink idle', 'Threat net quiet', 'Tower fabric cold'].map((label) => (
          <span
            key={label}
            className="rounded-md border border-cyber-blue/15 bg-dark-800/80 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white/40"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function MenuChromeFooter() {
  return (
    <div className="relative flex h-full min-h-0 flex-col justify-center gap-3 px-5 py-2 select-none">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(0,212,255,0.04) 0%, transparent 42%), radial-gradient(ellipse 90% 120% at 50% 0%, rgba(0,132,255,0.07), transparent 55%)',
        }}
      />
      <p className="relative text-center font-mono text-xs uppercase tracking-[0.28em] text-cyber-blue/45">
        Operations deck
      </p>
      <p className="relative text-center font-mono text-sm leading-relaxed text-white/38">
        Tower roster, mecha telemetry, and wave controls appear here after launch.
      </p>
      <div className="relative mx-auto flex flex-wrap justify-center gap-2">
        {['Cannon', 'Laser', 'Frost', 'Tesla', 'Missile'].map((name) => (
          <span
            key={name}
            className="rounded-lg border border-white/[0.06] bg-dark-800/60 px-3 py-1.5 font-mono text-[11px] text-white/28"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

function HeroStatus({ state }: { state: GameState }) {
  const hero = state.hero;
  const dps = Math.round(hero.damage * hero.fireRate);
  const rangeCells = (hero.range / CELL_SIZE).toFixed(1);
  const heroMaxHp = hero.maxHp || 10;
  const heroHp = Math.max(0, Math.min(heroMaxHp, hero.hp ?? heroMaxHp));
  const respawnTimer = Math.max(0, hero.respawnTimer ?? 0);
  const hpPct = (heroHp / heroMaxHp) * 100;
  const controlHint =
    'Left-click: move mecha · Right-click: path · Shoots creeps automatically in weapon range';

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col gap-2 overflow-hidden rounded-xl border border-cyber-blue/25 bg-dark-900/70 px-3 py-2.5 select-none"
      title={controlHint}
    >
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] pr-0.5">
        <div className="mb-2 flex shrink-0 gap-2.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-cyber-blue/35 bg-cyber-blue/10">
            <svg width="28" height="28" viewBox="0 0 22 22" fill="none">
              <rect x="6" y="5" width="10" height="10" rx="2" fill="#1b3656" stroke="#5ecbff" strokeWidth="1.4" />
              <circle cx="12" cy="9" r="1.8" fill="#64ffda" />
              <path d="M16 10 H20" stroke="#f6c453" strokeWidth="2" strokeLinecap="round" />
              <path d="M8 15 L6 19 M14 15 L16 19" stroke="#5ecbff" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-base font-bold leading-tight text-cyber-blue">Defense Mecha</p>
            <p className="mt-0.5 font-mono text-sm leading-snug text-white/55">
              {!hero.isAlive
                ? `Respawning in ${Math.ceil(respawnTimer / 1000)}s.`
                : hero.targetId ? 'Engaging a creep.' : 'Awaiting orders — click the map.'}
            </p>
          </div>
        </div>

        <div className="mb-2">
          <div className="mb-1 flex items-center justify-between font-mono text-xs text-white/55">
            <span>HP</span>
            <span className="tabular-nums text-white/80">{Math.ceil(heroHp)}/{heroMaxHp}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${hero.isAlive ? 'bg-cyber-green' : 'bg-red-300'}`}
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </div>

        <div className="border-t border-white/10 pt-3">
          <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-mono">
            <span
              className={`rounded px-2 py-0.5 text-sm font-bold uppercase tracking-wide ${
                hero.targetId ? 'bg-cyber-green/14 text-cyber-green' : 'bg-white/[0.07] text-white/45'
              }`}
            >
              {!hero.isAlive ? 'Down' : hero.targetId ? 'Live' : 'Idle'}
            </span>
            <span className="text-sm text-white/55">
              DPS{' '}
              <span className="font-bold tabular-nums text-cyber-blue">{formatCompactCount(dps)}</span>
            </span>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono">
          <div
            className="rounded-md bg-dark-700/60 px-2 py-1 ring-1 ring-white/10"
            title={`Lifetime kills for this run: ${hero.kills}`}
          >
            <p className="text-[10px] uppercase tracking-wide text-white/40">Kills</p>
            <p className="text-sm font-bold tabular-nums text-white/85">{formatCompactCount(hero.kills)}</p>
          </div>
          <div
            className="rounded-md bg-red-500/10 px-2 py-1 ring-1 ring-red-300/20"
            title={`Enemy hero takedowns for this run: ${hero.heroKills ?? 0}`}
          >
            <p className="text-[10px] uppercase tracking-wide text-red-100/45">Hero Kills</p>
            <p className="text-sm font-bold tabular-nums text-red-100">{formatCompactCount(hero.heroKills ?? 0)}</p>
          </div>
        </div>

        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="grid grid-cols-2 grid-rows-2 gap-1.5 [grid-template-rows:repeat(2,minmax(min-content,max-content))]">
            <InspectMiniStat label="Damage" value={hero.damage} />
            <InspectMiniStat label="Range" value={`${rangeCells}c`} />
            <InspectMiniStat label="Rate" value={`${hero.fireRate.toFixed(1)}/s`} />
            <InspectMiniStat label="Speed" value={hero.speed} />
          </div>
        </div>
      </div>
    </div>
  );
}
