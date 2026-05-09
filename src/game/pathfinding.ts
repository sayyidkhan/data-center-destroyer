import { ATTACK_PATH_WAYPOINTS, CELL_SIZE, PATH_WAYPOINTS } from './constants';
import type { Vec2, CellType } from './types';

function toWorldPath(waypoints: [number, number][]): Vec2[] {
  return waypoints.map(([col, row]) => ({
    x: col * CELL_SIZE + CELL_SIZE / 2,
    y: row * CELL_SIZE + CELL_SIZE / 2,
  }));
}

export function buildPath(): Vec2[] {
  return toWorldPath(PATH_WAYPOINTS);
}

export function buildAttackPath(): Vec2[] {
  return toWorldPath(ATTACK_PATH_WAYPOINTS);
}

export function buildPathGrid(cols: number, rows: number): CellType[][] {
  const grid: CellType[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 'empty' as CellType)
  );

  // Mark path cells
  for (const waypoints of [PATH_WAYPOINTS, ATTACK_PATH_WAYPOINTS]) {
    for (let i = 0; i < waypoints.length - 1; i++) {
      const [x1, y1] = waypoints[i];
      const [x2, y2] = waypoints[i + 1];
      if (x1 === x2) {
        // vertical segment
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        for (let r = minY; r <= maxY; r++) {
          if (r >= 0 && r < rows && x1 >= 0 && x1 < cols) {
            grid[r][x1] = 'path';
          }
        }
      } else {
        // horizontal segment
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        for (let c = minX; c <= maxX; c++) {
          if (y1 >= 0 && y1 < rows && c >= 0 && c < cols) {
            grid[y1][c] = 'path';
          }
        }
      }
    }
  }

  return grid;
}

export function distanceSq(a: Vec2, b: Vec2): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.sqrt(distanceSq(a, b));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function angleTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}
