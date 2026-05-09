import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import type { AttackPackageId, GameState, TowerType, GameAction } from './game/types';
import { commandHeroMove, createInitialState, deployAttackPackage, placeTower, sellTower, upgradeTower, startWave } from './game/engine';
import { applyAction } from './game/actions';
import { renderGame } from './game/renderer';
import { type PerfStats, useGameLoop } from './hooks/useGameLoop';
import { CELL_SIZE, GRID_COLS, VIEWPORT_COLS, VIEWPORT_W, VIEWPORT_H, CANVAS_W, CANVAS_H, RULER_W, RULER_H, MAP_W, HUD_SLOT_H, FOOTER_H, FOOTER_GRID_MIN_W, isPlayerBuildableCell } from './game/constants';
import { HUD } from './components/HUD';
import { TowerInspector, TowerShopStrip } from './components/TowerShop';
import { GameOverlay } from './components/GameOverlay';
import { InspectMiniStat } from './components/InspectMiniStat';
import { formatCompactCount } from './formatCompactCount';
import { MultiplayerLobby } from './components/MultiplayerLobby';
import { CountdownOverlay } from './components/CountdownOverlay';
import { api } from '../convex/_generated/api';

const MAX_CAM_X = MAP_W - VIEWPORT_W;
const PAN_ZONE = 60;   // px from edge that triggers auto-pan
const PAN_SPEED = 280; // px/s
const VIEWPORT_FIT_MARGIN = 28;

const CHROME_FRAME_STYLE = {
  boxShadow: '0 0 60px rgba(0,212,255,0.08), 0 20px 60px rgba(0,0,0,0.6)',
} as const;

type MenuStage = 'launch' | 'pick_mode' | 'mp_lobby';

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

  // ---- Multiplayer state ----
  const [roomId, setRoomId] = useState<string | null>(null);
  const roomIdRef = useRef<string | null>(null);
  roomIdRef.current = roomId;
  const [playerRole, setPlayerRole] = useState<'host' | 'guest' | null>(null);
  const playerRoleRef = useRef<'host' | 'guest' | null>(null);
  playerRoleRef.current = playerRole;
  const pendingActionsRef = useRef<GameAction[]>([]);
  const preTickRef = useRef<((state: GameState) => GameState) | undefined>(undefined);
  const [playerId] = useState(() => `player_${Math.random().toString(36).slice(2, 9)}`);
  const tickCounterRef = useRef(0);

  const sendAction = useMutation(api.rooms.sendAction as any);
  const setReady = useMutation(api.rooms.setReady as any);
  const heartbeat = useMutation(api.rooms.heartbeat as any);
  const leaveRoom = useMutation(api.rooms.leaveRoom as any);

  const room = useQuery(
    api.rooms.getRoom as any,
    roomId ? { roomId } : 'skip'
  );

  const opponentActions = useQuery(
    api.rooms.getActions as any,
    roomId ? { roomId, afterTick: tickCounterRef.current - 120 } : 'skip'
  );

  // Apply pending actions before each tick
  useEffect(() => {
    preTickRef.current = (state: GameState) => {
      let s = state;
      const actions = pendingActionsRef.current;
      pendingActionsRef.current = [];
      for (const action of actions) {
        s = applyAction(s, action);
      }
      return s;
    };
  }, []);

  const renderFn = useCallback((ctx: CanvasRenderingContext2D, state: GameState, time: number) => {
    renderGame(ctx, state, hoveredCellRef.current, time);
  }, []);

  const { start, stop } = useGameLoop(stateRef, setThrottledSnapshot, canvasRef, renderFn, setPerfStats, preTickRef);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  // Process opponent actions
  useEffect(() => {
    if (!opponentActions || opponentActions.length === 0) return;
    const myRole = playerRoleRef.current;
    if (!myRole) return;

    for (const action of opponentActions) {
      if (action.player === myRole) continue; // skip my own actions
      pendingActionsRef.current.push({
        type: action.type,
        tick: action.tick,
        ...action.payload,
      } as GameAction);
    }
  }, [opponentActions]);

  // Heartbeat
  useEffect(() => {
    if (!roomId) return;
    const id = setInterval(() => {
      if (roomIdRef.current) {
        heartbeat({ roomId: roomIdRef.current, playerId }).catch(() => {});
      }
    }, 5000);
    return () => clearInterval(id);
  }, [roomId, heartbeat, playerId]);

  // Watch room state for ready → countdown transition
  useEffect(() => {
    if (!room || !playerRole) return;
    console.log('[MP] room status:', room.status, 'phase:', snapshot.phase, 'hostReady:', room.hostReady, 'guestReady:', room.guestReady);
    if (room.status === 'playing' && snapshot.phase === 'menu') {
      // Both ready — start countdown
      console.log('[MP] Both ready! Starting countdown...');
      stateRef.current = {
        ...stateRef.current,
        phase: 'countdown',
        gameMode: 'multi_player',
      };
      setSnapshot({ ...stateRef.current });
    }
    if (room.status === 'ended' && snapshot.phase !== 'menu' && snapshot.phase !== 'game_over' && snapshot.phase !== 'victory') {
      // Opponent disconnected
      stateRef.current = { ...stateRef.current, phase: 'game_over' };
      setSnapshot({ ...stateRef.current });
    }
  }, [room, playerRole, snapshot.phase]);

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
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const viewX = (e.clientX - rect.left) * scaleX - RULER_W;
    const viewY = (e.clientY - rect.top) * scaleY - RULER_H;
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

  // ---- Send multiplayer action ----
  const sendGameAction = useCallback((action: GameAction) => {
    if (stateRef.current.gameMode !== 'multi_player') return;
    const rid = roomIdRef.current;
    if (!rid) return;
    tickCounterRef.current++;
    sendAction({
      roomId: rid,
      playerId,
      tick: tickCounterRef.current,
      type: action.type,
      payload: action,
    }).catch(() => {});
  }, [sendAction, playerId]);

  // ---- Canvas Events ----

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getWorldCell(e);
    const point = getWorldPoint(e);
    const state = stateRef.current;

    if (state.selectedTowerType && state.grid[y]?.[x] === 'empty' && isPlayerBuildableCell(x)) {
      stateRef.current = placeTower(state, x, y, state.selectedTowerType);
      setSnapshot({ ...stateRef.current });
      sendGameAction({ type: 'PLACE_TOWER', tick: tickCounterRef.current, gridX: x, gridY: y, towerType: state.selectedTowerType });
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
    sendGameAction({ type: 'MOVE_HERO', tick: tickCounterRef.current, targetX: point.x, targetY: point.y });
  }, [getWorldCell, getWorldPoint, sendGameAction]);

  const handleCanvasContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const point = getWorldPoint(e);
    stateRef.current = commandHeroMove(stateRef.current, point.x, point.y);
    setSnapshot({ ...stateRef.current });
    sendGameAction({ type: 'MOVE_HERO', tick: tickCounterRef.current, targetX: point.x, targetY: point.y });
  }, [getWorldPoint, sendGameAction]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getWorldCell(e);
    hoveredCellRef.current = { x, y };

    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const localX = canvasX - RULER_W;
    if (localX < PAN_ZONE) mousePanRef.current = -1;
    else if (localX > VIEWPORT_W - PAN_ZONE) mousePanRef.current = 1;
    else mousePanRef.current = 0;

    // Send cursor position in multiplayer
    if (stateRef.current.gameMode === 'multi_player') {
      const worldPoint = getWorldPoint(e);
      sendGameAction({ type: 'CURSOR_MOVE', tick: tickCounterRef.current, x: worldPoint.x, y: worldPoint.y });
    }
  }, [getWorldCell, getWorldPoint, sendGameAction]);

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
    sendGameAction({ type: 'UPGRADE_TOWER', tick: tickCounterRef.current, towerId: id });
  }, [sendGameAction]);

  const handleSell = useCallback((id: string) => {
    stateRef.current = sellTower(stateRef.current, id);
    setSnapshot({ ...stateRef.current });
    sendGameAction({ type: 'SELL_TOWER', tick: tickCounterRef.current, towerId: id });
  }, [sendGameAction]);

  const handleDeployAttack = useCallback((id: AttackPackageId) => {
    stateRef.current = deployAttackPackage(stateRef.current, id);
    setSnapshot({ ...stateRef.current });
    sendGameAction({ type: 'DEPLOY_ATTACK', tick: tickCounterRef.current, packageId: id });
  }, [sendGameAction]);

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
      sendGameAction({ type: 'START_WAVE', tick: tickCounterRef.current });
    }
  }, [sendGameAction]);

  const handleVersusIntroComplete = useCallback(() => {
    if (stateRef.current.phase !== 'versus_intro') return;
    if (stateRef.current.gameMode === 'multi_player') {
      stateRef.current = { ...stateRef.current, phase: 'countdown' };
    } else {
      stateRef.current = { ...stateRef.current, phase: 'wave_complete' };
    }
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
    sendGameAction({ type: 'SET_SPEED', tick: tickCounterRef.current, speed });
  }, [sendGameAction]);

  const handleStart = useCallback(() => {
    stateRef.current = { ...stateRef.current, gameMode: 'single_player', phase: 'versus_intro' };
    setSnapshot({ ...stateRef.current });
  }, []);

  const handleRestart = useCallback(() => {
    stateRef.current = { ...createInitialState(), gameMode: 'single_player', phase: 'wave_complete' };
    setSnapshot({ ...stateRef.current });
  }, []);

  const handleMultiplayerStart = useCallback(() => {
    setMenuStage('mp_lobby');
  }, []);

  const handleJoinRoom = useCallback((rid: string, role: 'host' | 'guest', seed: number) => {
    setRoomId(rid);
    setPlayerRole(role);
    stateRef.current = createInitialState(seed, role);
    setSnapshot({ ...stateRef.current });
  }, []);

  const handleBackFromLobby = useCallback(() => {
    if (roomId) {
      leaveRoom({ roomId, playerId }).catch(() => {});
      setRoomId(null);
      setPlayerRole(null);
    }
    setMenuStage('pick_mode');
  }, [roomId, leaveRoom, playerId]);

  const handleReady = useCallback(async () => {
    if (!roomId || !playerRole) return;
    try {
      await setReady({ roomId, playerId, ready: true });
    } catch (err: any) {
      console.error('setReady failed:', err.message || err);
      alert('Ready failed: ' + (err.message || 'Unknown error'));
    }
  }, [roomId, playerRole, playerId, setReady]);

  const handleCountdownComplete = useCallback(() => {
    stateRef.current = { ...stateRef.current, phase: 'wave_complete' };
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
          else if (menuStageRef.current === 'pick_mode') handleStart();
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
        if (state.phase === 'menu' && menuStageRef.current === 'mp_lobby') {
          e.preventDefault();
          handleBackFromLobby();
          return;
        }
        stateRef.current = { ...stateRef.current, selectedTowerType: null, selectedTowerId: null };
        setSnapshot({ ...stateRef.current });
      }
      if (state.phase !== 'versus_intro' && state.phase !== 'countdown') {
        if (e.key === 'ArrowRight' || e.key === 'd') {
          stateRef.current = { ...stateRef.current, cameraX: Math.min(MAX_CAM_X, stateRef.current.cameraX + CELL_SIZE * 3) };
          setSnapshot({ ...stateRef.current });
        }
        if (e.key === 'ArrowLeft' || e.key === 'a') {
          stateRef.current = { ...stateRef.current, cameraX: Math.max(0, stateRef.current.cameraX - CELL_SIZE * 3) };
          setSnapshot({ ...stateRef.current });
        }
      }
      if (TOWER_KEYS[e.key] && state.phase !== 'game_over' && state.phase !== 'victory' && state.phase !== 'versus_intro' && state.phase !== 'countdown') {
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
  }, [handleStart, handleStartMatch, handlePause, handleBackFromLobby]);

  const isGameActive = snapshot.phase !== 'menu' && snapshot.phase !== 'versus_intro' && snapshot.phase !== 'countdown';

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
            width: CANVAS_W,
            maxWidth: CANVAS_W,
            transform: fitScale !== 1 ? `scale(${fitScale})` : undefined,
            transformOrigin: 'top left',
          }}
        >
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

        <div
          className="relative z-10 flex shrink-0 items-stretch"
          style={{ height: CANVAS_H + FOOTER_H }}
          onClick={handleOutsideSelectionClick}
        >
          <div className="relative flex shrink-0 flex-col" style={{ width: CANVAS_W }}>
            <div className="relative shrink-0 overflow-hidden" style={{ width: CANVAS_W, height: CANVAS_H }}>
              <canvas
                ref={canvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
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
                onMultiplayerStart={handleMultiplayerStart}
                room={room}
                playerRole={playerRole}
                onReady={handleReady}
              />
              {snapshot.phase === 'countdown' && (
                <CountdownOverlay
                  hostName={room?.hostId?.slice(0, 8) ?? 'Host'}
                  guestName={room?.guestId?.slice(0, 8) ?? 'Guest'}
                  onComplete={handleCountdownComplete}
                />
              )}
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

      {menuStage === 'mp_lobby' && snapshot.phase === 'menu' && (
        <MultiplayerLobby onBack={handleBackFromLobby} onJoined={handleJoinRoom} onReady={handleReady} playerId={playerId} />
      )}
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
