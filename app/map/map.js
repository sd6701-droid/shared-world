// The audience map. This tab also hosts the game (server/local.js) until the
// Node server exists, and accepts both players' keyboards for single-laptop play.

import { loadMap } from '../../shared/map.js';
import { ROLES, LABEL, EVENTS } from '../../shared/types.js';
import { LocalHost } from '../../server/local.js';
import { drawFloor, COLOR, FONT } from '../../lib/floorCanvas.js';

const CELL = 44;
const KEYS = {
  goggles: { w: 'N', a: 'W', s: 'S', d: 'E' },
  cameras: { ArrowUp: 'N', ArrowLeft: 'W', ArrowDown: 'S', ArrowRight: 'E' },
};

const canvas = document.getElementById('floor');
const ctx = canvas.getContext('2d');
let map;
try {
  map = await loadMap('../../map.json');
} catch (err) {
  document.getElementById('error').textContent =
    'Could not load map.json (' + err.message + '). Serve the repo root: `python3 -m http.server 8777`, then open http://localhost:8777/app/map/';
  throw err;
}
canvas.width = map.width * CELL;
canvas.height = map.height * CELL;

const host = new LocalHost(map);
const banners = [];
host.onEvent((ev) => {
  if (ev.name === EVENTS.BANNER) banners.push({ ...ev, until: performance.now() / 1000 + ev.secs });
  if (ev.name === EVENTS.RESTART) banners.length = 0;
});
host.start();

// keyboard: both roles on this keyboard; the host rate-limits moves
const held = new Set();
const normKey = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
window.addEventListener('keydown', (e) => {
  const k = normKey(e);
  if (k.startsWith('Arrow') || k === ' ') e.preventDefault();
  if (e.repeat) return;
  if (k === 'r') { host.restart(); return; }
  held.add(k);
  for (const role of ROLES) if (KEYS[role][k]) host.input(role, KEYS[role][k]); // first step is instant
});
window.addEventListener('keyup', (e) => held.delete(normKey(e)));
window.addEventListener('blur', () => held.clear());
setInterval(() => {
  for (const role of ROLES) {
    const hit = Object.entries(KEYS[role]).find(([k]) => held.has(k));
    if (hit) host.input(role, hit[1]);
  }
}, 50);

// render
let lastScore = '', lastBanners = '';
function frame() {
  const state = host.state;
  drawFloor(ctx, map, state, { cell: CELL });

  if (state.phase === 'over') {
    const [a, b] = ROLES.map((r) => state.players[r].score);
    ctx.fillStyle = 'rgba(9,12,20,0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = state.winner ? COLOR[state.winner] : COLOR.text;
    ctx.font = '700 36px ' + FONT;
    ctx.fillText(state.winner ? LABEL[state.winner].toUpperCase() + ' WINS ' + Math.max(a, b) + '–' + Math.min(a, b) : 'DRAW ' + a + '–' + b, canvas.width / 2, canvas.height / 2 - 12);
    ctx.fillStyle = COLOR.text;
    ctx.font = '500 16px ' + FONT;
    ctx.fillText('Press R to play again', canvas.width / 2, canvas.height / 2 + 22);
  }

  const t = Math.floor(state.clock);
  document.getElementById('clock').textContent =
    String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');

  const score = ROLES.map((r) => {
    const p = state.players[r];
    return '<span style="color:' + COLOR[r] + '">' + LABEL[r] + ' ' + p.score +
      (p.carrying.length ? ' <small>+' + p.carrying.length + ' carrying</small>' : '') + '</span>';
  }).join('<span class="sep">·</span>');
  if (score !== lastScore) { document.getElementById('score').innerHTML = score; lastScore = score; }

  const now = performance.now() / 1000;
  while (banners.length && banners[0].until <= now) banners.shift();
  const html = banners.slice(-3).map((b) =>
    '<div class="banner" style="color:' + b.color + ';border-color:' + b.color + '">' + escapeHtml(b.text) + '</div>').join('');
  if (html !== lastBanners) { document.getElementById('banners').innerHTML = html; lastBanners = html; }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
