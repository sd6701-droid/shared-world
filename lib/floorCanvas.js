// Draws the floor from map.json plus a (possibly role-filtered) GameState.
// Used by the map screen, the corridor view and the minimap, so the floor is
// drawn and oriented the same everywhere. Pass a small `cell` for a minimap:
// text and decorations drop out below 24 px.

import { ROLES, LABEL } from '../shared/types.js';
import { DIRS } from '../shared/map.js';
import { CONE_LEN } from '../server/rules.js';

export const COLOR = {
  void: '#090c14', corridor: '#2b3550', room: '#1d2536', wall: '#9aa6bf', door: '#e0b44c',
  grid: 'rgba(255,255,255,0.05)', text: '#d7deea', muted: '#7f8aa3',
  goggles: '#3ddc84', cameras: '#b8bec9', guard: '#f5c518', alarm: '#ff4d4f', gold: '#e0b44c',
};
export const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} map       indexed map (shared/map.js)
 * @param {object|null} state GameState, possibly without `guard`
 * @param {object} [opts]    { cell, roles, showLoot, showRoute }
 */
export function drawFloor(ctx, map, state, opts = {}) {
  const C = opts.cell ?? 44;
  const roles = opts.roles ?? ROLES;
  const showLoot = opts.showLoot ?? true;
  const showRoute = opts.showRoute ?? true;
  const big = C >= 24;
  const W = map.width, H = map.height;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = map.grid[y][x];
      ctx.fillStyle = ch === '#' ? COLOR.void : ch === '.' ? COLOR.corridor : COLOR.room;
      ctx.fillRect(x * C, y * C, C, C);
    }
  }

  if (big) {
    ctx.strokeStyle = COLOR.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x++) { ctx.moveTo(x * C + 0.5, 0); ctx.lineTo(x * C + 0.5, H * C); }
    for (let y = 0; y <= H; y++) { ctx.moveTo(0, y * C + 0.5); ctx.lineTo(W * C, y * C + 0.5); }
    ctx.stroke();
  }

  if (showRoute && state?.guard) {
    ctx.fillStyle = 'rgba(245,197,24,0.25)';
    const s = Math.max(2, C * 0.07);
    for (const c of map.guardRoute) ctx.fillRect(c[0] * C + C / 2 - s / 2, c[1] * C + C / 2 - s / 2, s, s);
  }

  ctx.lineWidth = Math.max(1, C * 0.07);
  ctx.strokeStyle = COLOR.wall;
  const inset = ctx.lineWidth / 2;
  for (const b of Object.values(map.roomBox)) {
    ctx.strokeRect(b.x0 * C + inset, b.y0 * C + inset, (b.x1 - b.x0 + 1) * C - 2 * inset, (b.y1 - b.y0 + 1) * C - 2 * inset);
  }

  ctx.lineWidth = Math.max(2, C * 0.11);
  ctx.strokeStyle = COLOR.door;
  for (const d of map.doors) {
    const dx = d.outside[0] - d.cell[0], dy = d.outside[1] - d.cell[1];
    const cx = (d.cell[0] + 0.5 + dx * 0.5) * C, cy = (d.cell[1] + 0.5 + dy * 0.5) * C;
    const g = C * 0.18;
    ctx.beginPath();
    if (dy !== 0) { ctx.moveTo(cx - C / 2 + g, cy); ctx.lineTo(cx + C / 2 - g, cy); }
    else { ctx.moveTo(cx, cy - C / 2 + g); ctx.lineTo(cx, cy + C / 2 - g); }
    ctx.stroke();
  }

  if (big) {
    ctx.font = '600 ' + Math.round(C * 0.3) + 'px ' + FONT;
    ctx.fillStyle = COLOR.text;
    for (const [id, b] of Object.entries(map.roomBox)) {
      ctx.fillText(map.rooms[id].label.toUpperCase(), ((b.x0 + b.x1 + 1) / 2) * C, b.y0 * C + C * 0.36);
    }
  }

  ctx.lineWidth = Math.max(2, C * 0.14);
  ctx.strokeStyle = COLOR.goggles;
  ctx.font = '700 ' + Math.round(C * 0.23) + 'px ' + FONT;
  for (const e of map.exitCells) {
    const [x, y] = e.cell, px = x * C, py = y * C, m = C * 0.14, o = ctx.lineWidth / 2;
    ctx.beginPath();
    if (x === 0) { ctx.moveTo(px + o, py + m); ctx.lineTo(px + o, py + C - m); }
    else if (x === W - 1) { ctx.moveTo(px + C - o, py + m); ctx.lineTo(px + C - o, py + C - m); }
    else if (y === 0) { ctx.moveTo(px + m, py + o); ctx.lineTo(px + C - m, py + o); }
    else { ctx.moveTo(px + m, py + C - o); ctx.lineTo(px + C - m, py + C - o); }
    ctx.stroke();
    if (big) { ctx.fillStyle = COLOR.goggles; ctx.fillText('EXIT ' + e.name, px + C / 2, py + C / 2); }
  }

  if (big) {
    for (const role of roles) {
      const [x, y] = map.starts[role];
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLOR[role];
      ctx.beginPath();
      ctx.arc(x * C + C / 2, y * C + C / 2, C * 0.23, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (!state) { ctx.restore(); return; }

  if (showLoot) {
    for (const l of map.loot) {
      if (state.loot[l.id].state !== 'placed') continue;
      const x = l.cell[0] * C + C / 2, y = l.cell[1] * C + C / 2;
      if (big) {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, C / 2);
        glow.addColorStop(0, 'rgba(224,180,76,0.45)');
        glow.addColorStop(1, 'rgba(224,180,76,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - C / 2, y - C / 2, C, C);
      }
      drawLoot(ctx, l.id, x, y, C * 0.25);
      if (big) {
        ctx.fillStyle = COLOR.gold;
        ctx.font = '600 ' + Math.round(C * 0.2) + 'px ' + FONT;
        ctx.fillText(l.label.toUpperCase(), x, y + C * 0.43);
      }
    }
  }

  if (state.guard) {
    const g = state.guard, d = DIRS[g.facing], cone = map.coneCells(g.cell, g.facing, CONE_LEN);
    const gx = g.cell[0] * C + C / 2, gy = g.cell[1] * C + C / 2;
    ctx.fillStyle = 'rgba(245,197,24,0.18)';
    for (const c of cone) ctx.fillRect(c[0] * C + 1, c[1] * C + 1, C - 2, C - 2);
    if (cone.length) {
      const last = cone[cone.length - 1];
      const tx = (last[0] + 0.5 + d[0] * 0.5) * C, ty = (last[1] + 0.5 + d[1] * 0.5) * C;
      const px = -d[1] * (C / 2 - 2), py = d[0] * (C / 2 - 2);
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(tx + px, ty + py);
      ctx.lineTo(tx - px, ty - py);
      ctx.closePath();
      ctx.fillStyle = 'rgba(245,197,24,0.2)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(245,197,24,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    drawDot(ctx, gx, gy, C * 0.25, COLOR.guard, '#2a2200');
    if (big) {
      ctx.fillStyle = COLOR.guard;
      ctx.font = '700 ' + Math.round(C * 0.25) + 'px ' + FONT;
      ctx.fillText('GUARD', gx, gy - C * 0.45);
    }
  }

  for (const role of roles) {
    const p = state.players[role];
    if (!p) continue;
    const x = p.cell[0] * C + C / 2, y = p.cell[1] * C + C / 2;
    if (big) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, C * 0.6);
      glow.addColorStop(0, COLOR[role] + '88');
      glow.addColorStop(1, COLOR[role] + '00');
      ctx.fillStyle = glow;
      ctx.fillRect(x - C * 0.6, y - C * 0.6, C * 1.2, C * 1.2);
    }
    drawDot(ctx, x, y, C * 0.25, COLOR[role], COLOR.void);
    if (!big) continue;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR[role];
    ctx.font = '700 ' + Math.round(C * 0.27) + 'px ' + FONT;
    ctx.fillText(LABEL[role].toUpperCase(), x + C * 0.39, y);
    p.carrying.forEach((id, i) => drawLoot(ctx, id, x - C * 0.27 - i * C * 0.36, y - C * 0.34, C * 0.16));
    const penalty = Math.ceil(p.penaltyUntil - state.clock);
    if (penalty > 0) {
      ctx.fillStyle = COLOR.alarm;
      ctx.font = '700 ' + Math.round(C * 0.25) + 'px ' + FONT;
      ctx.fillText('penalty ' + penalty + ' s', x + C * 0.39, y + C * 0.32);
    }
    ctx.textAlign = 'center';
  }

  ctx.restore();
}

export function drawDot(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.27);
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

/** One small glyph per loot id; anything unknown gets a gold diamond. */
export function drawLoot(ctx, id, x, y, r) {
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.strokeStyle = COLOR.gold;
  ctx.fillStyle = COLOR.gold;
  if (id === 'painting') {
    ctx.fillStyle = '#1f5f8b';
    ctx.fillRect(x - r, y - r * 0.8, r * 2, r * 1.6);
    ctx.strokeRect(x - r, y - r * 0.8, r * 2, r * 1.6);
    ctx.fillStyle = COLOR.gold;
    ctx.beginPath();
    ctx.arc(x + r * 0.35, y - r * 0.3, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === 'compass') {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.void;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLOR.gold;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.7);
    ctx.lineTo(x + r * 0.3, y);
    ctx.lineTo(x, y + r * 0.7);
    ctx.lineTo(x - r * 0.3, y);
    ctx.closePath();
    ctx.fill();
  } else if (id === 'amphora') {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.35, y - r);
    ctx.lineTo(x + r * 0.35, y - r);
    ctx.lineTo(x + r * 0.3, y - r * 0.5);
    ctx.quadraticCurveTo(x + r * 1.1, y, x + r * 0.3, y + r);
    ctx.lineTo(x - r * 0.3, y + r);
    ctx.quadraticCurveTo(x - r * 1.1, y, x - r * 0.3, y - r * 0.5);
    ctx.closePath();
    ctx.fillStyle = '#b5532c';
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.6, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.6, y);
    ctx.closePath();
    ctx.fill();
  }
}
