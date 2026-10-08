// map.json helpers. Pure: no DOM, no timers, so the host, the map screen and
// the minimap all answer grid questions the same way.

export const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const key = (c) => c[0] + ',' + c[1];
export const same = (a, b) => a[0] === b[0] && a[1] === b[1];

export async function loadMap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('map.json: ' + res.status + ' ' + res.statusText);
  return indexMap(await res.json());
}

/** Adds lookups and movement rules to the raw map.json object. */
export function indexMap(raw) {
  const roomOfChar = {};
  const roomBox = {};
  for (const [id, r] of Object.entries(raw.rooms)) roomOfChar[r.char] = id;
  for (let y = 0; y < raw.height; y++) {
    for (let x = 0; x < raw.width; x++) {
      const id = roomOfChar[raw.grid[y][x]];
      if (!id) continue;
      const b = roomBox[id] || (roomBox[id] = { x0: x, y0: y, x1: x, y1: y });
      b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y);
      b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
    }
  }
  const doorPairs = new Set();
  for (const d of raw.doors) {
    doorPairs.add(key(d.cell) + '>' + key(d.outside));
    doorPairs.add(key(d.outside) + '>' + key(d.cell));
  }
  const exitCells = Object.entries(raw.exits).map(([name, e]) => ({ name, cell: e.cell }));
  const lootById = Object.fromEntries(raw.loot.map((l) => [l.id, l]));

  const charAt = (c) => raw.grid[c[1]][c[0]];
  const roomAt = (c) => roomOfChar[charAt(c)] || null;

  function canStep(from, to) {
    if (to[0] < 0 || to[1] < 0 || to[0] >= raw.width || to[1] >= raw.height) return false;
    const a = charAt(from), b = charAt(to);
    if (b === '#') return false;
    if (a === b) return true;                         // same room, or corridor to corridor
    return doorPairs.has(key(from) + '>' + key(to));  // between areas only through a door
  }

  /** Cells the guard sees: up to `len` ahead, stopped by walls, not by doors. */
  function coneCells(cell, facing, len) {
    const d = DIRS[facing];
    const out = [];
    let cur = cell;
    for (let i = 0; i < len; i++) {
      const next = [cur[0] + d[0], cur[1] + d[1]];
      if (!canStep(cur, next)) break;
      out.push(next);
      cur = next;
    }
    return out;
  }

  return { ...raw, roomOfChar, roomBox, doorPairs, exitCells, lootById, charAt, roomAt, canStep, coneCells };
}
