import { useRef, useCallback, useEffect } from 'react';
import type { GameState } from '../game/types';
import { tickGame } from '../game/engine';

export interface PerfStats {
  fps: number;
  frameMs: number;
  updateMs: number;
  renderMs: number;
  objects: number;
  memoryMb: number | null;
}

export function useGameLoop(
  stateRef: React.MutableRefObject<GameState>,
  setStateSnapshot: (s: GameState) => void,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  renderFn: (ctx: CanvasRenderingContext2D, state: GameState, time: number) => void,
  setPerfStats?: (stats: PerfStats) => void
) {
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const lastPerfPublishRef = useRef<number>(0);
  const smoothedFpsRef = useRef<number>(60);
  const smoothedFrameMsRef = useRef<number>(16.7);
  const smoothedUpdateMsRef = useRef<number>(0);
  const smoothedRenderMsRef = useRef<number>(0);

  const loop = useCallback((timestamp: number) => {
    const delta = lastTimeRef.current ? Math.min(timestamp - lastTimeRef.current, 50) : 16;
    const frameMs = lastTimeRef.current ? timestamp - lastTimeRef.current : 16;
    lastTimeRef.current = timestamp;
    timeRef.current += delta / 1000;

    // Advance game logic
    const updateStart = performance.now();
    const newState = tickGame(stateRef.current, delta);
    const updateMs = performance.now() - updateStart;
    stateRef.current = newState;

    // Render
    const renderStart = performance.now();
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) renderFn(ctx, newState, timeRef.current);
    }
    const renderMs = performance.now() - renderStart;

    if (setPerfStats) {
      const alpha = 0.12;
      const instantFps = frameMs > 0 ? 1000 / frameMs : 0;
      smoothedFpsRef.current = smoothedFpsRef.current * (1 - alpha) + instantFps * alpha;
      smoothedFrameMsRef.current = smoothedFrameMsRef.current * (1 - alpha) + frameMs * alpha;
      smoothedUpdateMsRef.current = smoothedUpdateMsRef.current * (1 - alpha) + updateMs * alpha;
      smoothedRenderMsRef.current = smoothedRenderMsRef.current * (1 - alpha) + renderMs * alpha;

      if (timestamp - lastPerfPublishRef.current > 250) {
        lastPerfPublishRef.current = timestamp;
        const maybeMemory = performance as Performance & {
          memory?: { usedJSHeapSize: number };
        };
        setPerfStats({
          fps: smoothedFpsRef.current,
          frameMs: smoothedFrameMsRef.current,
          updateMs: smoothedUpdateMsRef.current,
          renderMs: smoothedRenderMsRef.current,
          objects:
            newState.enemies.length +
            newState.towers.length +
            newState.projectiles.length +
            newState.particles.length +
            newState.effects.length,
          memoryMb: maybeMemory.memory ? maybeMemory.memory.usedJSHeapSize / 1024 / 1024 : null,
        });
      }
    }

    // Update React state (throttled to avoid excessive re-renders)
    setStateSnapshot(newState);

    rafRef.current = requestAnimationFrame(loop);
  }, [renderFn, setStateSnapshot, stateRef, canvasRef, setPerfStats]);

  const start = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return { start, stop, time: timeRef };
}
