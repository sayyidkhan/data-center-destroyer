import type { GameState, Tower, Particle, VisualEffect, Vec2, Hero } from './types';
import { CELL_SIZE, GRID_COLS, GRID_ROWS, MAP_W, VIEWPORT_COLS, VIEWPORT_W, VIEWPORT_H, TOWER_DEFS, ENEMY_DEFS, LASER_ACTIVE_MS, isPlayerBuildableCell } from './constants';

const PLAYER_BASE_TARGET_ID = 'player_base';
const OPPONENT_BASE_TARGET_ID = 'opponent_base';

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  hoveredCell: { x: number; y: number } | null,
  time: number
) {
  ctx.save();
  ctx.clearRect(0, 0, VIEWPORT_W, VIEWPORT_H);

  if (state.phase === 'menu') {
    drawMenuBackdrop(ctx, time);
    ctx.restore();
    return;
  }

  // Background
  ctx.fillStyle = '#050810';
  ctx.fillRect(0, 0, VIEWPORT_W, VIEWPORT_H);

  // Translate by camera offset
  ctx.translate(-state.cameraX, 0);

  drawMapZones(ctx, state.cameraX);
  drawGrid(ctx, state, hoveredCell, state.cameraX, time);
  drawPath(ctx, state, time);
  drawDataCenter(ctx, state, time, 'player');
  drawDataCenter(ctx, state, time, 'opponent');
  drawSpawnPortal(ctx, state, time);
  drawTowers(ctx, state, time);
  drawHero(ctx, state.hero, time, 'player');
  if (state.opponentHero) drawHero(ctx, state.opponentHero, time, 'opponent');
  drawEnemies(ctx, state, time);
  drawLaserBeams(ctx, state, time);
  drawProjectiles(ctx, state, time);
  drawEffects(ctx, state.effects, time);
  drawParticles(ctx, state.particles, state.cameraX);
  drawRangePreview(ctx, state, hoveredCell, state.cameraX);

  ctx.restore();
}

/** Title screen only — crisp procedural backdrop instead of blurring the live map tiles. */
function drawMenuBackdrop(ctx: CanvasRenderingContext2D, time: number) {
  const w = VIEWPORT_W;
  const h = VIEWPORT_H;

  const base = ctx.createRadialGradient(w * 0.52, h * 0.22, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.95);
  base.addColorStop(0, '#122742');
  base.addColorStop(0.35, '#081426');
  base.addColorStop(1, '#03060e');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w * 0.5, h * 0.38, 0, w * 0.5, h * 0.42, w * 0.72);
  glow.addColorStop(0, 'rgba(0, 212, 255, 0.14)');
  glow.addColorStop(0.45, 'rgba(0, 132, 255, 0.04)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.strokeStyle = 'rgba(0, 212, 255, 0.045)';
  ctx.lineWidth = 1;
  const step = 24;
  for (let x = 0; x <= w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }

  ctx.translate(w / 2, h * 0.62);
  ctx.scale(1, 0.42);
  ctx.strokeStyle = 'rgba(0, 212, 255, 0.035)';
  const gw = w * 0.95;
  const gh = h * 0.85;
  for (let i = -6; i <= 6; i++) {
    const ox = (i * gw) / 14 + Math.sin(time * 0.6 + i * 0.4) * 6;
    ctx.beginPath();
    ctx.moveTo(ox - gw / 2, -gh / 2);
    ctx.lineTo(ox + gw / 2, gh / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox - gw / 2, gh / 2);
    ctx.lineTo(ox + gw / 2, -gh / 2);
    ctx.stroke();
  }
  ctx.restore();

  const shimmer = (Math.sin(time * 1.1) * 0.5 + 0.5) * 0.06 + 0.04;
  const beam = ctx.createLinearGradient(0, h * 0.28, w, h * 0.72);
  beam.addColorStop(0, 'rgba(0, 212, 255, 0)');
  beam.addColorStop(0.48, `rgba(94, 203, 255, ${shimmer})`);
  beam.addColorStop(1, 'rgba(0, 212, 255, 0)');
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, w, h);

  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.max(w, h) * 0.72);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 2, 8, 0.82)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

function drawHero(ctx: CanvasRenderingContext2D, hero: Hero, time: number, side: 'player' | 'opponent') {
  const walk = Math.sin(time * 12) * 1.5;
  const heroMaxHp = hero.maxHp || 10;
  const heroHp = Math.max(0, Math.min(heroMaxHp, hero.hp ?? heroMaxHp));
  const respawnMs = hero.respawnMs || 10000;
  const respawnTimer = Math.max(0, hero.respawnTimer ?? 0);
  const isOpponent = side === 'opponent';
  const primary = isOpponent ? '#ff5c78' : '#00d4ff';
  const bright = isOpponent ? '#ffccd5' : '#5ecbff';
  const chassis = isOpponent ? '#3a1724' : '#12243a';
  const inner = isOpponent ? '#5a2332' : '#1b3656';
  const core = isOpponent ? '#ffdf7a' : '#64ffda';
  const muzzle = isOpponent ? '#ff9aaa' : '#f6c453';

  if (!hero.isAlive) {
    const pct = 1 - respawnTimer / respawnMs;
    ctx.save();
    ctx.translate(hero.targetX, hero.targetY);
    ctx.strokeStyle = isOpponent ? 'rgba(255, 92, 120, 0.45)' : 'rgba(100, 255, 218, 0.45)';
    ctx.fillStyle = isOpponent ? 'rgba(255, 92, 120, 0.08)' : 'rgba(100, 255, 218, 0.08)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 13 + Math.sin(time * 5) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = isOpponent ? '#ff5c78' : '#64ffda';
    ctx.beginPath();
    ctx.arc(0, 0, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (!isOpponent) {
    ctx.save();
    ctx.translate(hero.targetX, hero.targetY);
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.5)';
    ctx.fillStyle = 'rgba(0, 212, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, 10 + Math.sin(time * 5) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  const hpPct = Math.max(0, Math.min(1, heroHp / heroMaxHp));
  ctx.save();
  ctx.translate(hero.x, hero.y);
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(-15, -24, 30, 4);
  ctx.fillStyle = hpPct > 0.5 ? (isOpponent ? '#ff9aaa' : '#64ffda') : hpPct > 0.25 ? '#ffcc00' : '#ff5c78';
  ctx.fillRect(-15, -24, 30 * hpPct, 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-15.5, -24.5, 31, 5);
  ctx.restore();

  ctx.save();
  ctx.translate(hero.x, hero.y);
  ctx.rotate(hero.angle);

  ctx.shadowColor = primary;
  ctx.shadowBlur = hero.targetId ? 18 : 8;

  // Mobile defense mecha chassis.
  ctx.fillStyle = chassis;
  ctx.strokeStyle = bright;
  ctx.lineWidth = 1.4;
  roundedRect(ctx, -11, -11, 22, 22, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = inner;
  roundedRect(ctx, -7, -7, 14, 14, 3);
  ctx.fill();

  ctx.fillStyle = core;
  ctx.shadowColor = core;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(3, -3, 2.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = primary;
  ctx.shadowBlur = hero.targetId ? 12 : 4;
  ctx.strokeStyle = bright;
  ctx.lineWidth = 3;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-4, side * 9);
    ctx.lineTo(-9 + walk * side, side * 15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(7, side * 8);
    ctx.lineTo(12 - walk * side, side * 14);
    ctx.stroke();
  }

  // Front-mounted machine gun.
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#263b52';
  roundedRect(ctx, 8, -5, 7, 10, 2);
  ctx.fill();
  ctx.fillStyle = '#d8f3ff';
  roundedRect(ctx, 13, -2, 14, 4, 2);
  ctx.fill();
  if (hero.targetId) {
    ctx.fillStyle = isOpponent
      ? `rgba(255, 154, 170, ${0.6 + Math.sin(time * 40) * 0.25})`
      : `rgba(246, 196, 83, ${0.6 + Math.sin(time * 40) * 0.25})`;
    ctx.shadowColor = muzzle;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(29, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  if (!isOpponent) {
    ctx.save();
    ctx.translate(hero.x, hero.y);
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, hero.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function isWorldRectVisible(x: number, w: number, cameraX: number, padding = 0) {
  return x + w >= cameraX - padding && x <= cameraX + VIEWPORT_W + padding;
}

function drawMapZones(ctx: CanvasRenderingContext2D, cameraX: number) {
  const third = MAP_W / 3;
  const zones = [
    {
      x: 0,
      w: third,
      label: 'YOUR SIDE',
      fill: 'rgba(0, 148, 255, 0.075)',
      edge: 'rgba(0, 212, 255, 0.3)',
      text: 'rgba(94, 203, 255, 0.4)',
    },
    {
      x: third,
      w: third,
      label: 'CONTESTED MIDDLE',
      fill: 'rgba(255, 204, 0, 0.06)',
      edge: 'rgba(255, 204, 0, 0.26)',
      text: 'rgba(255, 220, 120, 0.36)',
    },
    {
      x: third * 2,
      w: MAP_W - third * 2,
      label: 'OPPONENT SIDE',
      fill: 'rgba(255, 60, 100, 0.08)',
      edge: 'rgba(255, 92, 120, 0.32)',
      text: 'rgba(255, 150, 165, 0.42)',
    },
  ];

  ctx.save();
  for (const zone of zones) {
    if (!isWorldRectVisible(zone.x, zone.w, cameraX)) continue;

    const visibleX = Math.max(zone.x, cameraX);
    const visibleR = Math.min(zone.x + zone.w, cameraX + VIEWPORT_W);
    const visibleW = Math.max(0, visibleR - visibleX);

    ctx.fillStyle = zone.fill;
    ctx.fillRect(visibleX, 0, visibleW, VIEWPORT_H);

    const grad = ctx.createLinearGradient(visibleX, 0, visibleX + visibleW, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.018)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = grad;
    ctx.fillRect(visibleX, 0, visibleW, VIEWPORT_H);

    if (zone.x + zone.w > cameraX && zone.x + zone.w < cameraX + VIEWPORT_W) {
      ctx.strokeStyle = zone.edge;
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      ctx.moveTo(zone.x + zone.w, 0);
      ctx.lineTo(zone.x + zone.w, VIEWPORT_H);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.font = 'bold 12px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = zone.text;
    const labelX = Math.max(visibleX + 72, Math.min(zone.x + zone.w / 2, visibleX + visibleW - 72));
    ctx.fillText(zone.label, labelX, 10);

    ctx.fillStyle = 'rgba(255,255,255,0.022)';
    const firstStripe = zone.x + 18 + Math.max(0, Math.floor((visibleX - zone.x - 18) / 72)) * 72;
    for (let x = firstStripe; x < visibleR; x += 72) {
      ctx.fillRect(x, 0, 1, VIEWPORT_H);
    }
  }
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, state: GameState, hoveredCell: { x: number; y: number } | null, cameraX: number, time: number) {
  // Only draw cols visible in viewport
  const startCol = Math.floor(cameraX / CELL_SIZE);
  const endCol = Math.min(startCol + VIEWPORT_COLS + 1, GRID_COLS);

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = startCol; col < endCol; col++) {
      const cell = state.grid[row]?.[col];
      if (cell === 'path') continue;

      const x = col * CELL_SIZE;
      const y = row * CELL_SIZE;

      const isHovered = hoveredCell && hoveredCell.x === col && hoveredCell.y === row;
      const canPlace = cell === 'empty' && state.selectedTowerType !== null && isPlayerBuildableCell(col);

      if (isHovered && canPlace) {
        ctx.fillStyle = 'rgba(0, 212, 255, 0.12)';
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      } else if (isHovered && state.selectedTowerType && cell === 'empty' && !isPlayerBuildableCell(col)) {
        ctx.fillStyle = 'rgba(255, 68, 68, 0.08)';
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      } else if (isHovered) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      }

      ctx.strokeStyle = 'rgba(0, 212, 255, 0.07)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 0.5, y + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
    }
  }
}

function drawPath(ctx: CanvasRenderingContext2D, state: GameState, time: number) {
  // Draw path tiles
  const startCol = Math.max(0, Math.floor(state.cameraX / CELL_SIZE));
  const endCol = Math.min(GRID_COLS, startCol + VIEWPORT_COLS + 2);
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = startCol; col < endCol; col++) {
      if (state.grid[row][col] === 'path') {
        const x = col * CELL_SIZE;
        const y = row * CELL_SIZE;
        ctx.fillStyle = '#0a1628';
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        ctx.fillStyle = '#0f2040';
        ctx.fillRect(x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8);
      }
    }
  }

  drawPathLine(ctx, state.path, 'rgba(0, 212, 255, 0.2)', time);
  drawPathLine(ctx, state.attackPath, 'rgba(255, 92, 120, 0.32)', time);
}

function drawPathLine(ctx: CanvasRenderingContext2D, path: Vec2[], color: string, time: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 8]);
  ctx.lineDashOffset = -(time * 40 % 12);
  ctx.beginPath();
  if (path.length > 0) {
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

function drawDataCenter(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  time: number,
  side: 'player' | 'opponent'
) {
  const S = CELL_SIZE;
  const isOpponent = side === 'opponent';
  const pathEnd = isOpponent ? state.attackPath[state.attackPath.length - 1] : state.path[state.path.length - 1];
  const pulse  = Math.sin(time * 2.1) * 0.18 + 0.82;
  const pulse2 = Math.sin(time * 1.4 + 1.2) * 0.18 + 0.82;

  // ─── Layout anchors ────────────────────────────────────────────────────────
  // Player base is fixed flush to the left edge so PvP reads as left vs right.
  const campusW  = S * 3.0;
  const campusH  = S * 9.5;
  const campusL  = isOpponent ? MAP_W - campusW : 0;
  const campusR  = campusL + campusW;
  const campusT  = pathEnd.y - campusH / 2;
  const isVisible = isWorldRectVisible(campusL - 18, campusW + 36, state.cameraX, S * 2);
  if (!isVisible) return;

  const theme = isOpponent
    ? {
        primary: '#ff5c78',
        primaryRgb: '255,92,120',
        bright: '#ffccd5',
        soft: '#ff9aaa',
        accent: '#ff8a5c',
        accentRgb: '255,138,92',
        success: '#ffdf7a',
        successRgb: '255,223,122',
      }
    : {
        primary: '#00d4ff',
        primaryRgb: '0,212,255',
        bright: '#6bdcff',
        soft: '#80deea',
        accent: '#29b6f6',
        accentRgb: '41,182,246',
        success: '#64ffda',
        successRgb: '100,255,218',
      };

  ctx.save();

  // ─── Outer campus glow — two-layer: soft wide + tight bright ──────────────
  ctx.shadowColor = theme.primary;
  ctx.shadowBlur  = 40 * pulse;
  ctx.fillStyle   = `rgba(${theme.primaryRgb},0.05)`;
  roundedRect(ctx, campusL - 14, campusT - 14, campusW + 28, campusH + 28, 12);
  ctx.fill();
  ctx.shadowBlur  = 12 * pulse;
  ctx.fillStyle   = `rgba(${theme.primaryRgb},0.04)`;
  roundedRect(ctx, campusL - 5, campusT - 5, campusW + 10, campusH + 10, 8);
  ctx.fill();
  ctx.shadowBlur = 0;

  // ─── Perimeter fence — animated marching-ants dash ────────────────────────
  ctx.strokeStyle = `rgba(${theme.primaryRgb},${0.35 + 0.15 * pulse})`;
  ctx.lineWidth   = 1;
  ctx.setLineDash([5, 4]);
  ctx.lineDashOffset = -(time * 8) % 9;
  roundedRect(ctx, campusL - 6, campusT - 6, campusW + 12, campusH + 12, 8);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  // ─── Helper: draw a server-rack panel ──────────────────────────────────────
  const drawRackPanel = (px: number, py: number, pw: number, ph: number, rows: number, cols: number) => {
    // chassis
    ctx.fillStyle   = '#0b1520';
    ctx.strokeStyle = `rgba(${theme.primaryRgb},0.45)`;
    ctx.lineWidth   = 1;
    roundedRect(ctx, px, py, pw, ph, 3);
    ctx.fill();
    ctx.stroke();
    // slot rows
    const slotH = (ph - 6) / rows;
    for (let r = 0; r < rows; r++) {
      const sy = py + 3 + r * slotH;
      ctx.fillStyle = '#060d16';
      ctx.fillRect(px + 3, sy + 1, pw - 6, slotH - 2);
      // LED dots per slot
      for (let c = 0; c < cols; c++) {
        const active = (r * cols + c + Math.floor(time * 0.7)) % (rows * cols) < Math.ceil(rows * cols * 0.65);
        ctx.fillStyle   = active ? ((r + c) % 3 === 0 ? theme.success : theme.bright) : '#1a2a3a';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur  = active ? 5 * pulse : 0;
        const dx = px + 5 + c * ((pw - 10) / (cols - 1 || 1));
        ctx.beginPath();
        ctx.arc(dx, sy + slotH / 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  };

  // ─── BUILDING A — Main server hall (top half of campus) ────────────────────
  const hallW = campusW - 6;
  const hallH = S * 4.2;
  const hallX = campusL + 3;
  const hallY = campusT + 3;

  ctx.fillStyle   = '#08111e';
  ctx.strokeStyle = theme.bright;
  ctx.lineWidth   = 1.5;
  roundedRect(ctx, hallX, hallY, hallW, hallH, 5);
  ctx.fill();
  ctx.stroke();

  // Roof stripe
  ctx.fillStyle = '#0d1b2a';
  ctx.fillRect(hallX, hallY, hallW, S * 0.28);
  ctx.strokeStyle = `rgba(${theme.primaryRgb},0.4)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hallX, hallY + S * 0.28);
  ctx.lineTo(hallX + hallW, hallY + S * 0.28);
  ctx.stroke();

  // Label stripe  "DATA CENTER" — bigger, brighter, double-glow
  ctx.textAlign   = 'center';
  ctx.font        = `bold ${Math.round(S * 0.29)}px monospace`;
  ctx.shadowColor = theme.primary;
  ctx.shadowBlur  = 18 * pulse;
  ctx.fillStyle   = `rgba(${theme.primaryRgb},${0.55 + 0.2 * pulse})`;
  ctx.fillText(isOpponent ? 'ENEMY CORE' : 'DATA CENTER', hallX + hallW / 2, hallY + S * 0.26);
  ctx.shadowBlur  = 6;
  ctx.fillStyle   = 'rgba(255,255,255,0.82)';
  ctx.fillText(isOpponent ? 'ENEMY CORE' : 'DATA CENTER', hallX + hallW / 2, hallY + S * 0.26);
  ctx.shadowBlur  = 0;

  // Thin animated network-traffic bar under the label
  const trafficW  = hallW - 12;
  const trafficY  = hallY + S * 0.34;
  ctx.fillStyle   = `rgba(${theme.primaryRgb},0.08)`;
  ctx.fillRect(hallX + 6, trafficY, trafficW, 3);
  const trafficFill = ((time * 0.4) % 1) * trafficW;
  const tGrad = ctx.createLinearGradient(hallX + 6, 0, hallX + 6 + trafficW, 0);
  tGrad.addColorStop(0,   `rgba(${theme.primaryRgb},0)`);
  tGrad.addColorStop(Math.max(0, trafficFill / trafficW - 0.15), `rgba(${theme.primaryRgb},0)`);
  tGrad.addColorStop(trafficFill / trafficW, `rgba(${theme.primaryRgb},0.9)`);
  tGrad.addColorStop(Math.min(1, trafficFill / trafficW + 0.15), `rgba(${theme.primaryRgb},0)`);
  tGrad.addColorStop(1,   `rgba(${theme.primaryRgb},0)`);
  ctx.fillStyle = tGrad;
  ctx.fillRect(hallX + 6, trafficY, trafficW, 3);

  // Three rack panels inside hall
  const rackW = (hallW - 16) / 3 - 4;
  const rackH = hallH - S * 0.52 - 8;
  for (let i = 0; i < 3; i++) {
    drawRackPanel(hallX + 6 + i * (rackW + 4), hallY + S * 0.42, rackW, rackH, 8, 5);
  }

  // Animated scan-line sweeping across rack area
  const scanX = hallX + 6 + ((time * 0.35) % 1) * (hallW - 12);
  const scanGrad = ctx.createLinearGradient(scanX - 10, 0, scanX + 10, 0);
  scanGrad.addColorStop(0,   `rgba(${theme.primaryRgb},0)`);
  scanGrad.addColorStop(0.5, `rgba(${theme.primaryRgb},${0.18 * pulse})`);
  scanGrad.addColorStop(1,   `rgba(${theme.primaryRgb},0)`);
  ctx.fillStyle = scanGrad;
  ctx.fillRect(scanX - 10, hallY + S * 0.42, 20, rackH);

  // Rooftop HVAC units — animated spinning fans
  for (let i = 0; i < 4; i++) {
    const hx = hallX + 6 + i * (hallW - 12) / 3.5;
    const hcx = hx + S * 0.24;
    const hcy = hallY - S * 0.21;
    ctx.fillStyle   = '#111f2e';
    ctx.strokeStyle = `rgba(${theme.primaryRgb},0.5)`;
    ctx.lineWidth   = 1;
    roundedRect(ctx, hx, hallY - S * 0.38, S * 0.48, S * 0.35, 2);
    ctx.fill();
    ctx.stroke();
    // spinning fan blades
    const fanAngle = time * 3.5 + i * 0.8;
    ctx.strokeStyle = `rgba(${theme.primaryRgb},${0.55 * pulse})`;
    ctx.lineWidth   = 1;
    for (let blade = 0; blade < 4; blade++) {
      const a = fanAngle + blade * (Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(hcx, hcy);
      ctx.lineTo(hcx + Math.cos(a) * S * 0.11, hcy + Math.sin(a) * S * 0.11);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(${theme.primaryRgb},${0.25 * pulse})`;
    ctx.beginPath();
    ctx.arc(hcx, hcy, S * 0.12, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ─── BUILDING B — Cooling / UPS tower (bottom section, left half) ──────────
  const coolW = hallW * 0.52;
  const coolH = S * 3.4;
  const coolX = campusL + 3;
  const coolY = hallY + hallH + S * 0.3;

  ctx.fillStyle   = '#060f1c';
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth   = 1.5;
  roundedRect(ctx, coolX, coolY, coolW, coolH, 5);
  ctx.fill();
  ctx.stroke();

  // Label
  ctx.fillStyle = `rgba(${theme.accentRgb},0.7)`;
  ctx.font      = `bold ${Math.round(S * 0.16)}px monospace`;
  ctx.textAlign = 'center';
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur  = 6 * pulse2;
  ctx.fillText('COOLING', coolX + coolW / 2, coolY + S * 0.22);
  ctx.shadowBlur = 0;

  // Cooling towers — vertical cylinders with blinking indicators
  for (let i = 0; i < 3; i++) {
    const tx = coolX + 10 + i * (coolW - 20) / 2;
    const ty = coolY + S * 0.35;
    const tw = (coolW - 28) / 3;
    const th = coolH - S * 0.55;
    ctx.fillStyle   = '#0a1828';
    ctx.strokeStyle = `rgba(${theme.accentRgb},${0.45 + 0.25 * pulse2})`;
    ctx.lineWidth   = 1;
    roundedRect(ctx, tx, ty, tw, th, 3);
    ctx.fill();
    ctx.stroke();

    // Animated fill level bar inside each tower (capacity indicator)
    const fillPct  = 0.55 + Math.sin(time * 0.7 + i * 1.1) * 0.25;
    const fillH    = (th - 6) * fillPct;
    const fillGrad = ctx.createLinearGradient(tx, ty + th - 3 - fillH, tx, ty + th - 3);
    fillGrad.addColorStop(0,   `rgba(${theme.accentRgb},${0.12 * pulse2})`);
    fillGrad.addColorStop(1,   `rgba(${theme.accentRgb},${0.45 * pulse2})`);
    ctx.fillStyle = fillGrad;
    ctx.fillRect(tx + 3, ty + th - 3 - fillH, tw - 6, fillH);

    // Fill level "waterline" bright edge
    ctx.strokeStyle = `rgba(${theme.primaryRgb},${0.7 * pulse2})`;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(tx + 3, ty + th - 3 - fillH);
    ctx.lineTo(tx + tw - 3, ty + th - 3 - fillH);
    ctx.stroke();

    // Status LED at top of each tower — blinks independently
    const ledOn = Math.sin(time * (2.2 + i * 0.9) + i * 1.7) > 0.2;
    ctx.fillStyle   = ledOn ? theme.accent : '#0d2030';
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur  = ledOn ? 9 * pulse2 : 0;
    ctx.beginPath();
    ctx.arc(tx + tw / 2, ty + 6, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Steam rings rising from top
    for (let r = 0; r < 3; r++) {
      const alpha = ((time * 0.6 + i * 0.4 + r * 0.33) % 1);
      ctx.strokeStyle = `rgba(${theme.primaryRgb},${(1 - alpha) * 0.4 * pulse2})`;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.arc(tx + tw / 2, ty + th * 0.22 - alpha * S * 0.5, tw * 0.28 + alpha * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ─── BUILDING C — Power / generator block (bottom section, right half) ─────
  const genW = hallW - coolW - 6;
  const genH = coolH;
  const genX = coolX + coolW + 6;
  const genY = coolY;

  ctx.fillStyle   = '#080f1a';
  ctx.strokeStyle = '#ffcc00';
  ctx.lineWidth   = 1.5;
  roundedRect(ctx, genX, genY, genW, genH, 5);
  ctx.fill();
  ctx.stroke();

  // Label
  ctx.fillStyle = 'rgba(255,204,0,0.75)';
  ctx.font      = `bold ${Math.round(S * 0.16)}px monospace`;
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ffcc00';
  ctx.shadowBlur  = 6 * pulse;
  ctx.fillText('POWER', genX + genW / 2, genY + S * 0.22);
  ctx.shadowBlur = 0;

  // Generator units
  for (let i = 0; i < 2; i++) {
    const gx = genX + 6 + i * (genW / 2 - 4);
    const gy = genY + S * 0.35;
    const gw = genW / 2 - 10;
    const gh = genH - S * 0.55;
    ctx.fillStyle   = '#0c1822';
    ctx.strokeStyle = 'rgba(255,204,0,0.5)';
    ctx.lineWidth   = 1;
    roundedRect(ctx, gx, gy, gw, gh, 3);
    ctx.fill();
    ctx.stroke();
    // status LED
    const on = Math.sin(time * 3.1 + i * 1.5) > 0;
    ctx.fillStyle   = on ? '#ffcc00' : '#3a2a00';
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur  = on ? 8 * pulse : 0;
    ctx.beginPath();
    ctx.arc(gx + gw / 2, gy + gh * 0.35, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // waveform lines
    ctx.strokeStyle = `rgba(255,204,0,${0.35 * pulse})`;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    for (let p = 0; p < gw - 10; p += 2) {
      const wy = gy + gh * 0.62 + Math.sin((p / (gw - 10)) * Math.PI * 4 + time * 4 + i) * 4;
      p === 0 ? ctx.moveTo(gx + 5 + p, wy) : ctx.lineTo(gx + 5 + p, wy);
    }
    ctx.stroke();
  }

  // ─── LOADING BAY — faces the battlefield, centred on the active lane ───────
  const bayW  = S * 0.7;
  const bayH  = S * 1.1;
  const bayX  = isOpponent ? campusL : campusR - bayW;
  const bayY  = pathEnd.y - bayH / 2;

  // Bay recess in main body
  ctx.fillStyle   = '#030810';
  ctx.strokeStyle = theme.bright;
  ctx.lineWidth   = 1.5;
  roundedRect(ctx, bayX, bayY, bayW, bayH, 4);
  ctx.fill();
  ctx.stroke();

  // Animated glow inside bay
  ctx.shadowColor = theme.primary;
  ctx.shadowBlur  = 18 * pulse;
  ctx.fillStyle   = `rgba(${theme.primaryRgb},${0.12 + 0.1 * pulse})`;
  roundedRect(ctx, bayX + 4, bayY + 4, bayW - 8, bayH - 8, 3);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Horizontal scan bars in bay
  ctx.strokeStyle = `rgba(${theme.primaryRgb},0.6)`;
  ctx.lineWidth   = 1;
  for (let b = 1; b <= 4; b++) {
    const by = bayY + b * (bayH / 5);
    ctx.beginPath();
    ctx.moveTo(bayX + 6, by);
    ctx.lineTo(bayX + bayW - 6, by);
    ctx.stroke();
  }

  // Animated sliding door panels (two halves that part when "active")
  const doorOpen = (Math.sin(time * 1.2) * 0.5 + 0.5);  // 0 = closed, 1 = fully open
  const doorGap  = (bayH * 0.44) * doorOpen;
  const midY     = bayY + bayH / 2;

  const drawDoorPanel = (px: number, py: number, pw: number, ph: number, scanDir: 1 | -1) => {
    if (ph <= 0) return;
    // body
    ctx.fillStyle   = '#0a1826';
    ctx.strokeStyle = `rgba(${theme.primaryRgb},${0.45 + 0.25 * pulse})`;
    ctx.lineWidth   = 1;
    roundedRect(ctx, px, py, pw, ph, 2);
    ctx.fill();
    ctx.stroke();
    // horizontal scan line sweeping up or down
    const scanProgress = (time * 0.9 * scanDir + (scanDir === -1 ? 1 : 0)) % 1;
    const scanY = py + scanProgress * ph;
    const sGrad = ctx.createLinearGradient(px, scanY - 6, px, scanY + 6);
    sGrad.addColorStop(0,   `rgba(${theme.primaryRgb},0)`);
    sGrad.addColorStop(0.5, `rgba(${theme.primaryRgb},${0.55 * pulse})`);
    sGrad.addColorStop(1,   `rgba(${theme.primaryRgb},0)`);
    ctx.fillStyle = sGrad;
    ctx.fillRect(px + 2, Math.max(py, scanY - 6), pw - 4, 12);
    // two status LEDs on panel
    for (let led = 0; led < 2; led++) {
      const ledOn = Math.sin(time * (2.8 + led * 1.3) + led * 2.1) > 0;
      ctx.fillStyle   = ledOn ? theme.primary : '#0d2030';
      ctx.shadowColor = theme.primary;
      ctx.shadowBlur  = ledOn ? 7 * pulse : 0;
      ctx.beginPath();
      ctx.arc(px + pw * (0.3 + led * 0.4), py + ph * 0.75, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  };

  const topPanelH   = bayH / 2 - 4 - doorGap / 2;
  const botPanelH   = bayH / 2 - 4 - doorGap / 2;
  drawDoorPanel(bayX + 4, bayY + 4,          bayW - 8, topPanelH, 1);
  drawDoorPanel(bayX + 4, midY + doorGap / 2, bayW - 8, botPanelH, -1);

  // Bay warning chevrons on top & bottom
  ctx.fillStyle = `rgba(255,204,0,${0.55 * pulse})`;
  ctx.font      = `bold ${Math.round(S * 0.22)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('▲', bayX + bayW / 2, bayY + S * 0.22);
  ctx.fillText('▼', bayX + bayW / 2, bayY + bayH - S * 0.04);

  // Intake beam — wider, multi-layer glow when door is open
  const beamAlpha2 = doorOpen * (Math.sin(time * 5) * 0.2 + 0.6);
  const beamStartX = isOpponent ? bayX : bayX + bayW;
  const beamEndX = isOpponent ? bayX - S * 1.5 : bayX + bayW + S * 1.5;
  const bGrad2 = ctx.createLinearGradient(beamStartX, pathEnd.y, beamEndX, pathEnd.y);
  bGrad2.addColorStop(0,   `rgba(${theme.primaryRgb},${beamAlpha2 * 0.8})`);
  bGrad2.addColorStop(0.4, `rgba(${theme.primaryRgb},${beamAlpha2 * 0.35})`);
  bGrad2.addColorStop(1,   `rgba(${theme.primaryRgb},0)`);
  ctx.shadowColor = theme.primary;
  ctx.shadowBlur  = 10 * beamAlpha2;
  ctx.fillStyle   = bGrad2;
  ctx.fillRect(isOpponent ? bayX - S * 1.5 : bayX + bayW, pathEnd.y - 5, S * 1.5, 10);
  ctx.shadowBlur  = 0;

  // ─── Antenna / comms mast on rooftop ────────────────────────────────────────
  const antX = campusL + campusW * 0.72;
  const antBase = campusT - 2;
  ctx.strokeStyle = theme.bright;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(antX, antBase);
  ctx.lineTo(antX, antBase - S * 0.9);
  ctx.stroke();
  // cross-arms
  ctx.lineWidth = 1;
  for (let arm = 0; arm < 3; arm++) {
    const ay = antBase - S * (0.3 + arm * 0.22);
    const aw = S * (0.28 - arm * 0.06);
    ctx.strokeStyle = `rgba(${theme.primaryRgb},${0.6 - arm * 0.15})`;
    ctx.beginPath();
    ctx.moveTo(antX - aw, ay);
    ctx.lineTo(antX + aw, ay);
    ctx.stroke();
  }
  // beacon
  ctx.fillStyle   = `rgba(${theme.successRgb},${pulse})`;
  ctx.shadowColor = theme.success;
  ctx.shadowBlur  = 10 * pulse;
  ctx.beginPath();
  ctx.arc(antX, antBase - S * 0.9, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.textAlign = 'left';
  ctx.restore();
}

function drawSpawnPortal(ctx: CanvasRenderingContext2D, state: GameState, time: number) {
  drawPortal(ctx, state.path[0], time, '#ff4444', 'SPAWN');
  drawPortal(ctx, state.attackPath[0], time + 0.6, '#ff5c78', 'LAUNCH');
}

function drawPortal(ctx: CanvasRenderingContext2D, point: Vec2 | undefined, time: number, color: string, label: string) {
  if (!point) return;
  const pulse = Math.sin(time * 4) * 0.3 + 0.7;

  ctx.save();
  ctx.translate(point.x, point.y);

  // Outer ring
  ctx.strokeStyle = color;
  ctx.globalAlpha = pulse;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16 * pulse;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Inner fill
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 14);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(80, 0, 0, 0)');
  ctx.globalAlpha = 0.7 * pulse;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Rotating rune marks
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.65 * pulse;
  ctx.lineWidth = 1;
  ctx.shadowBlur = 0;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + time * 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
    ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 17);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.shadowBlur = 0;

  ctx.fillStyle = color;
  ctx.font = 'bold 8px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label, 0, 20);

  ctx.restore();
}

function drawTowers(ctx: CanvasRenderingContext2D, state: GameState, time: number) {
  for (const tower of state.towers) {
    if (!isWorldRectVisible(tower.x - tower.range, tower.range * 2, state.cameraX, CELL_SIZE)) continue;
    const def = TOWER_DEFS[tower.type];
    const isSelected = state.selectedTowerId === tower.id;
    const isOpponentTower = tower.owner === 'opponent';
    const towerColor = isOpponentTower ? tintColor(def.color, '#ff5c78', 0.5) : def.color;
    const towerAccent = isOpponentTower ? '#ff9aaa' : def.accentColor;
    const x = tower.x;
    const y = tower.y;

    ctx.save();
    ctx.translate(x, y);

    if (isSelected) {
      ctx.shadowColor = towerAccent;
      ctx.shadowBlur = 20;
    }

    ctx.fillStyle = isOpponentTower ? '#2a1520' : '#1a2240';
    ctx.strokeStyle = isSelected ? towerAccent : towerColor;
    ctx.lineWidth = isSelected ? 2 : 1.5;
    roundedRect(ctx, -CELL_SIZE / 2 + 4, -CELL_SIZE / 2 + 4, CELL_SIZE - 8, CELL_SIZE - 8, 4);
    ctx.fill();
    ctx.stroke();

    ctx.rotate(tower.angle + Math.PI / 2);
    drawTowerShape(ctx, tower.type, towerColor, towerAccent, tower.level, time);
    ctx.restore();

    // Level badge — only shown when level > 1
    if (tower.level > 1) {
      ctx.save();
      ctx.translate(x, y);
      const label = `${tower.level}`;
      const bw = 20;
      const bh = 20;
      const bx = CELL_SIZE / 2 - bw - 1;
      const by = -CELL_SIZE / 2 + 1;
      // background pill
      ctx.fillStyle = towerAccent;
      ctx.shadowColor = towerAccent;
      ctx.shadowBlur = 10;
      roundedRect(ctx, bx, by, bw, bh, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
      // number
      ctx.fillStyle = '#050a12';
      ctx.font = `bold 12px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + bw / 2, by + bh / 2 + 0.5);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }

    const hpPct = Math.max(0, Math.min(1, (tower.hp ?? tower.maxHp) / (tower.maxHp || 3)));
    if (hpPct < 1 || tower.owner === 'opponent') {
      ctx.save();
      ctx.translate(x, y);
      const barW = CELL_SIZE - 10;
      const barH = 3;
      const barY = -CELL_SIZE / 2 + 2;
      ctx.fillStyle = 'rgba(0,0,0,0.68)';
      ctx.fillRect(-barW / 2, barY, barW, barH);
      ctx.fillStyle = hpPct > 0.5 ? '#64ffda' : hpPct > 0.25 ? '#ffcc00' : '#ff5c78';
      ctx.fillRect(-barW / 2, barY, barW * hpPct, barH);
      ctx.restore();
    }
  }
}

function drawTowerShape(ctx: CanvasRenderingContext2D, type: Tower['type'], color: string, accent: string, level: number, time: number) {
  const scale = 0.9 + (level - 1) * 0.08;
  ctx.scale(scale, scale);

  switch (type) {
    case 'cannon': {
      ctx.fillStyle = color;
      ctx.fillRect(-3, -18, 6, 22);
      ctx.fillStyle = accent;
      ctx.fillRect(-2, -20, 4, 6);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }
    case 'laser': {
      ctx.fillStyle = color;
      ctx.fillRect(-2, -20, 4, 24);
      ctx.fillStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 8;
      ctx.fillRect(-1, -22, 2, 4);
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      hexagon(ctx, 0, 0, 8);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }
    case 'frost': {
      ctx.fillStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 10;
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 2);
        ctx.fillRect(-1, -20, 2, 12);
        ctx.restore();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }
    case 'tesla': {
      const flicker = Math.sin(time * 20) * 0.3 + 0.7;
      ctx.fillStyle = color;
      ctx.fillRect(-3, -18, 6, 20);
      ctx.fillStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 12 * flicker;
      ctx.globalAlpha = flicker;
      ctx.beginPath();
      ctx.arc(0, -18, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      diamondShape(ctx, 0, 0, 9);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }
    case 'missile': {
      ctx.fillStyle = color;
      ctx.fillRect(-5, -16, 10, 18);
      ctx.fillStyle = accent;
      ctx.fillRect(-3, -20, 6, 10);
      ctx.fillStyle = '#ff7043';
      ctx.beginPath();
      ctx.moveTo(-3, -20);
      ctx.lineTo(3, -20);
      ctx.lineTo(0, -26);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = color;
      roundedRect(ctx, -9, -5, 18, 10, 3);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }
  }
}

function drawEnemies(ctx: CanvasRenderingContext2D, state: GameState, time: number) {
  for (const enemy of state.enemies) {
    if (!isWorldRectVisible(enemy.x - 28, 56, state.cameraX, CELL_SIZE)) continue;
    const def = ENEMY_DEFS[enemy.type];
    const x = enemy.x;
    const y = enemy.y;
    const r = def.size;

    ctx.save();
    ctx.translate(x, y);

    const ownedByPlayer = enemy.owner === 'player';
    if (enemy.isBoss) {
      const pulse = Math.sin(time * 3) * 0.2 + 1;
      ctx.shadowColor = ownedByPlayer ? '#ff6b7d' : def.color;
      ctx.shadowBlur = 20 * pulse;
    }

    ctx.fillStyle = ownedByPlayer ? tintColor(def.color, '#ff6b7d', 0.45) : def.color;
    ctx.strokeStyle = ownedByPlayer ? '#ffd1dc' : '#fff';
    ctx.lineWidth = 1;

    if (enemy.type === 'tank') {
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeRect(-r, -r, r * 2, r * 2);
    } else if (enemy.type === 'swarm') {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI * 2) / 6;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (enemy.type === 'boss') {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ff9900';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,100,0,0.4)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.shadowBlur = 0;

    if (ownedByPlayer) {
      ctx.strokeStyle = 'rgba(255, 107, 125, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffccd5';
      ctx.beginPath();
      ctx.moveTo(r + 7, 0);
      ctx.lineTo(r + 1, -4);
      ctx.lineTo(r + 1, 4);
      ctx.closePath();
      ctx.fill();
    }

    if (enemy.frozenTimer > 0) {
      ctx.strokeStyle = 'rgba(178, 235, 242, 0.95)';
      ctx.shadowColor = '#80deea';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#80deea';
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    } else if (enemy.slowFactor < 1) {
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (enemy.armorBreakTimer > 0 || enemy.exposedTimer > 0) {
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 3]);

      if (enemy.armorBreakTimer > 0) {
        ctx.strokeStyle = 'rgba(255, 171, 64, 0.8)';
        ctx.beginPath();
        ctx.arc(0, 0, r + 7, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (enemy.exposedTimer > 0) {
        ctx.strokeStyle = 'rgba(100, 181, 246, 0.8)';
        ctx.beginPath();
        ctx.arc(0, 0, r + 10, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.setLineDash([]);
    }

    const hpPct = enemy.hp / enemy.maxHp;
    const barW = r * 2 + 4;
    const barH = 3;
    const barY = -r - 7;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-barW / 2, barY, barW, barH);
    const hpColor = hpPct > 0.5 ? '#00ff88' : hpPct > 0.25 ? '#ffcc00' : '#ff4444';
    ctx.fillStyle = hpColor;
    ctx.fillRect(-barW / 2, barY, barW * hpPct, barH);

    ctx.restore();
  }
}

function tintColor(hex: string, tint: string, amount: number) {
  const parse = (value: string) => {
    const raw = value.replace('#', '');
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  };
  const a = parse(hex);
  const b = parse(tint);
  const mix = (from: number, to: number) => Math.round(from + (to - from) * amount);
  return `rgb(${mix(a.r, b.r)}, ${mix(a.g, b.g)}, ${mix(a.b, b.b)})`;
}

function drawProjectiles(ctx: CanvasRenderingContext2D, state: GameState, time: number) {
  for (const proj of state.projectiles) {
    if (!isWorldRectVisible(proj.x - 24, 48, state.cameraX, CELL_SIZE)) continue;
    const playerBaseTarget = nearestPointOnDataCenter(state, 'player', proj);
    const opponentBaseTarget = nearestPointOnDataCenter(state, 'opponent', proj);
    const target =
      state.enemies.find(e => e.id === proj.targetId)
      ?? state.towers.find(tower => tower.id === proj.targetId)
      ?? (proj.targetId === state.hero.id ? state.hero : undefined)
      ?? (proj.targetId === state.opponentHero?.id ? state.opponentHero : undefined)
      ?? (proj.targetId === PLAYER_BASE_TARGET_ID ? playerBaseTarget : undefined)
      ?? (proj.targetId === OPPONENT_BASE_TARGET_ID ? opponentBaseTarget : undefined);
    const angle = target ? Math.atan2(target.y - proj.y, target.x - proj.x) : 0;

    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.shadowColor = proj.color;
    ctx.shadowBlur = 8;

    switch (proj.type) {
      case 'bullet':
      case 'laser_beam':
        ctx.fillStyle = proj.color;
        ctx.shadowBlur = proj.type === 'laser_beam' ? 12 : 8;
        ctx.beginPath();
        ctx.arc(0, 0, proj.size, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'frost_bolt':
        ctx.fillStyle = '#80deea';
        ctx.shadowColor = '#80deea';
        ctx.beginPath();
        ctx.arc(0, 0, proj.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#b2ebf2';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          ctx.save();
          ctx.rotate((i * Math.PI) / 2 + time * 3);
          ctx.beginPath();
          ctx.moveTo(0, -proj.size);
          ctx.lineTo(0, -proj.size - 4);
          ctx.stroke();
          ctx.restore();
        }
        break;
      case 'lightning':
        ctx.strokeStyle = proj.color;
        ctx.shadowColor = proj.color;
        ctx.shadowBlur = 15;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-proj.size * 1.5, -proj.size * 1.5);
        ctx.lineTo(proj.size * 0.5, 0);
        ctx.lineTo(-proj.size * 0.5, proj.size * 0.5);
        ctx.lineTo(proj.size * 1.5, proj.size * 1.5);
        ctx.stroke();
        break;
      case 'missile':
        ctx.fillStyle = proj.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(0, 0, proj.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 100, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(0, 0, proj.size * 1.6, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'machine_round':
        ctx.rotate(angle);
        ctx.shadowColor = proj.color;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = proj.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-7, 0);
        ctx.lineTo(8, 0);
        ctx.stroke();
        ctx.fillStyle = proj.color === '#ff8a9a' ? '#ffd1dc' : '#fff4ba';
        ctx.beginPath();
        ctx.arc(9, 0, 2.2, 0, Math.PI * 2);
        ctx.fill();
        break;
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function nearestPointOnDataCenter(state: GameState, side: 'player' | 'opponent', point: Vec2): Vec2 {
  const pathEnd =
    side === 'opponent'
      ? state.attackPath[state.attackPath.length - 1]
      : state.path[state.path.length - 1];
  const w = CELL_SIZE * 3;
  const h = CELL_SIZE * 9.5;
  const x = side === 'opponent' ? MAP_W - w : 0;
  const y = pathEnd.y - h / 2;

  return {
    x: Math.max(x, Math.min(x + w, point.x)),
    y: Math.max(y, Math.min(y + h, point.y)),
  };
}

function drawLaserBeams(ctx: CanvasRenderingContext2D, state: GameState, time: number) {
  for (const tower of state.towers) {
    if (tower.type !== 'laser' || !tower.beamTargetId) continue;

    const target = state.enemies.find(e => e.id === tower.beamTargetId);
    if (!target) continue;
    const minX = Math.min(tower.x, target.x);
    const maxX = Math.max(tower.x, target.x);
    if (!isWorldRectVisible(minX, maxX - minX, state.cameraX, CELL_SIZE)) continue;

    const def = TOWER_DEFS[tower.type];
    const cycleMs = tower.laserCycleMs ?? 0;
    if (cycleMs >= LASER_ACTIVE_MS) continue;

    const rampIn = Math.min(1, cycleMs / 320);
    const rampOut = Math.min(1, (LASER_ACTIVE_MS - cycleMs) / 320);
    const ease = (t: number) => t * t * (3 - 2 * t);
    const intensity = ease(Math.max(0, Math.min(rampIn, rampOut)));
    const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
    const startX = tower.x + Math.cos(angle) * 18;
    const startY = tower.y + Math.sin(angle) * 18;
    const endX = target.x;
    const endY = target.y;
    const pulse = 0.82 + Math.sin(time * 34 + tower.gridX) * 0.18;
    const flicker = 0.75 + Math.sin(time * 76 + tower.gridY) * 0.25;

    ctx.save();
    ctx.globalAlpha = intensity;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = def.color;
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 24 * pulse;
    ctx.lineWidth = 12 + tower.level * 2;
    ctx.globalAlpha = intensity * 0.18;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.globalAlpha = intensity * 0.45;
    ctx.strokeStyle = def.accentColor;
    ctx.shadowBlur = 18 * pulse;
    ctx.lineWidth = 6 + tower.level;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.globalAlpha = intensity * (0.82 + flicker * 0.18);
    ctx.strokeStyle = '#f5d5ff';
    ctx.shadowColor = '#f5d5ff';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2.2 + tower.level * 0.35;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.globalAlpha = intensity * 0.55;
    ctx.fillStyle = '#f5d5ff';
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(endX, endY, 5 + Math.sin(time * 22) * 1.5, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 3; i++) {
      const travel = (time * 2.4 + i / 3) % 1;
      const sparkX = startX + (endX - startX) * travel;
      const sparkY = startY + (endY - startY) * travel;
      ctx.globalAlpha = intensity * (1 - travel) * 0.65;
      ctx.beginPath();
      ctx.arc(sparkX, sparkY, 1.5 + tower.level * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, effects: VisualEffect[], time: number) {
  for (const effect of effects) {
    if (effect.type === 'lightning_zap') {
      const fade = effect.life / effect.maxLife;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let i = 0; i < effect.points.length - 1; i++) {
        const from = effect.points[i];
        const to = effect.points[i + 1];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const segments = Math.max(3, Math.ceil(len / 22));
        const jagged: Vec2[] = [from];

        for (let step = 1; step < segments; step++) {
          const t = step / segments;
          const wobble = (Math.random() - 0.5) * 18;
          jagged.push({
            x: from.x + dx * t + nx * wobble,
            y: from.y + dy * t + ny * wobble,
          });
        }
        jagged.push(to);

        ctx.globalAlpha = fade * (0.36 - i * 0.04);
        ctx.strokeStyle = '#fff59d';
        ctx.shadowColor = '#ffee58';
        ctx.shadowBlur = 24;
        ctx.lineWidth = 9;
        ctx.beginPath();
        jagged.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();

        ctx.globalAlpha = fade * (0.76 - i * 0.08);
        ctx.strokeStyle = '#ffee58';
        ctx.shadowBlur = 16;
        ctx.lineWidth = 4;
        ctx.beginPath();
        jagged.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();

        ctx.globalAlpha = fade;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        jagged.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();

        ctx.globalAlpha = fade * 0.75;
        ctx.fillStyle = '#fffde7';
        ctx.shadowColor = '#ffee58';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(to.x, to.y, 5 - i * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      continue;
    }

    if (effect.type !== 'frost_blast') continue;

    const progress = 1 - effect.life / effect.maxLife;
    const fade = effect.life / effect.maxLife;
    const eased = 1 - Math.pow(1 - progress, 3);
    const radius = effect.radius * eased;

    ctx.save();
    ctx.translate(effect.x, effect.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const haze = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    haze.addColorStop(0, `rgba(224, 247, 250, ${0.24 * fade})`);
    haze.addColorStop(0.48, `rgba(128, 222, 234, ${0.12 * fade})`);
    haze.addColorStop(1, 'rgba(128, 222, 234, 0)');
    ctx.fillStyle = haze;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(178, 235, 242, ${0.86 * fade})`;
    ctx.shadowColor = '#80deea';
    ctx.shadowBlur = 18 * fade;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 * fade})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = -time * 42;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12 + time * 0.6;
      const inner = radius * 0.24;
      const outer = radius * (0.54 + 0.08 * Math.sin(time * 8 + i));
      ctx.strokeStyle = `rgba(224, 247, 250, ${0.42 * fade})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], cameraX: number) {
  for (const p of particles) {
    if (!isWorldRectVisible(p.x - 12, 24, cameraX, CELL_SIZE)) continue;
    const alpha = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.shadowBlur = 0;
}

function drawRangePreview(ctx: CanvasRenderingContext2D, state: GameState, hoveredCell: { x: number; y: number } | null, cameraX: number) {
  if (state.selectedTowerId) {
    const tower = state.towers.find(t => t.id === state.selectedTowerId);
    if (tower) {
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.4)';
      ctx.fillStyle = 'rgba(0, 212, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (hoveredCell && state.selectedTowerType) {
    const def = TOWER_DEFS[state.selectedTowerType];
    const cx = hoveredCell.x * CELL_SIZE + CELL_SIZE / 2;
    const cy = hoveredCell.y * CELL_SIZE + CELL_SIZE / 2;
    const range = def.range * CELL_SIZE;
    const canPlace = state.grid[hoveredCell.y]?.[hoveredCell.x] === 'empty' && isPlayerBuildableCell(hoveredCell.x);

    ctx.strokeStyle = canPlace ? 'rgba(0, 255, 136, 0.5)' : 'rgba(255, 68, 68, 0.5)';
    ctx.fillStyle = canPlace ? 'rgba(0, 255, 136, 0.06)' : 'rgba(255, 68, 68, 0.06)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = def.color;
    roundedRect(ctx, cx - CELL_SIZE / 2 + 4, cy - CELL_SIZE / 2 + 4, CELL_SIZE - 8, CELL_SIZE - 8, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ---- Shape helpers ----
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function hexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}

function diamondShape(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
}
