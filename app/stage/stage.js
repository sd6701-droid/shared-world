// One-screen layout: the audience map on top, and below it one view per
// player, rendered from the same game state. This tab hosts the game and
// takes both keyboards. Each player's view is the same room-view seam the
// world model plugs into (app/play/roomSession.js).

import { loadMap } from '../../shared/map.js';
import { ROLES, LABEL, EVENTS } from '../../shared/types.js';
import { LocalHost } from '../../server/local.js';
import { viewFor } from '../../server/rules.js';
import { drawFloor, COLOR, FONT } from '../../lib/floorCanvas.js';
import { createRoomSession, placeOf, stepBetween, LOOK } from '../play/roomSession.js';
import { LENSES } from '../play/lenses.js';
import { CORRIDOR_PLACES } from '../play/corridor.js';

const CORRIDOR_LABEL = Object.fromEntries(Object.entries(CORRIDOR_PLACES).map(([id, p]) => [id, p.label]));

const MAP_CELL = 44;
const KEYS = {
  goggles: { w: 'N', a: 'W', s: 'S', d: 'E' },
  cameras: { ArrowUp: 'N', ArrowLeft: 'W', ArrowDown: 'S', ArrowRight: 'E' },
};
// look keys turn the live camera only; they never move the thief on the map
const LOOK_KEYS = {
  goggles: { q: LOOK.left, e: LOOK.right, t: LOOK.up, g: LOOK.down },
  cameras: { ',': LOOK.left, '.': LOOK.right, ';': LOOK.up, '/': LOOK.down },
};
const isGameKey = (k) => Object.values(KEYS).some((m) => k in m) || Object.values(LOOK_KEYS).some((m) => k in m);

let map;
try {
  map = await loadMap('../../map.json');
} catch (err) {
  document.getElementById('error').textContent =
    'Could not load map.json (' + err.message + '). Serve the repo root: `python3 -m http.server 8777`, then open http://localhost:8777/app/stage/';
  throw err;
}

const floor = document.getElementById('floor');
const floorCtx = floor.getContext('2d');
floor.width = map.width * MAP_CELL;
floor.height = map.height * MAP_CELL;

const panels = {};
for (const role of ROLES) {
  panels[role] = {
    info: document.getElementById('info-' + role),
    session: createRoomSession({
      root: document.getElementById('room-' + role), map, role, lens: LENSES[role],
      onLoading: (loading) => host.setLoading(role, loading),
    }),
  };
}

const host = new LocalHost(map);
const banners = [];
host.onEvent((ev) => {
  if (ev.name === EVENTS.BANNER) banners.push({ ...ev, until: performance.now() / 1000 + ev.secs });
  if (ev.name === EVENTS.RESTART) banners.length = 0;
});
host.start();

// keyboard: both roles. A move key moves the thief one cell on the map (the host
// rate-limits repeats and refuses walls). The live camera follows the steps the
// map accepts (see frame()), not the key. A look key only turns the live camera,
// for as long as it is held.
const held = new Set();
const normKey = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
const heldDirs = (role) => Object.entries(KEYS[role]).filter(([k]) => held.has(k)).map(([, dir]) => dir);
const heldLooks = (role) => Object.entries(LOOK_KEYS[role]).filter(([k]) => held.has(k)).map(([, look]) => look);
const heldInputs = (role) => [...heldDirs(role), ...heldLooks(role)];
const syncHeld = () => { for (const role of ROLES) panels[role].session.hold(heldInputs(role)); };
window.addEventListener('keydown', (e) => {
  const k = normKey(e);
  if (k.startsWith('Arrow') || k === ' ' || isGameKey(k)) e.preventDefault();
  if (e.repeat) return;
  if (k === 'r') { host.restart(); return; }
  held.add(k);
  for (const role of ROLES) if (KEYS[role][k]) host.input(role, KEYS[role][k]);
  syncHeld();
});
window.addEventListener('keyup', (e) => { held.delete(normKey(e)); syncHeld(); });
window.addEventListener('blur', () => { held.clear(); syncHeld(); });
setInterval(() => {
  for (const role of ROLES) {
    const dir = heldDirs(role)[0];
    if (dir) host.input(role, dir);
  }
}, 50);

let lastScore = '', lastBanners = '';
const lastInfo = {};
function frame() {
  const state = host.state;

  // top: the map, everything visible
  drawFloor(floorCtx, map, state, { cell: MAP_CELL });
  if (state.phase === 'over') {
    const [a, b] = ROLES.map((r) => state.players[r].score);
    floorCtx.fillStyle = 'rgba(9,12,20,0.75)';
    floorCtx.fillRect(0, 0, floor.width, floor.height);
    floorCtx.textAlign = 'center';
    floorCtx.textBaseline = 'middle';
    floorCtx.fillStyle = state.winner ? COLOR[state.winner] : COLOR.text;
    floorCtx.font = '700 36px ' + FONT;
    floorCtx.fillText(state.winner ? LABEL[state.winner].toUpperCase() + ' WINS ' + Math.max(a, b) + '–' + Math.min(a, b) : 'DRAW ' + a + '–' + b, floor.width / 2, floor.height / 2 - 12);
    floorCtx.fillStyle = COLOR.text;
    floorCtx.font = '500 16px ' + FONT;
    floorCtx.fillText('Press R to play again', floor.width / 2, floor.height / 2 + 22);
  }

  // bottom: one view per player, from that player's filtered state
  for (const role of ROLES) {
    const panel = panels[role];
    const view = viewFor(state, role);
    const me = view.players[role];
    const place = placeOf(map, me); // every place has an image; the corridor is split into halls and links
    const moved = stepBetween(panel.cell, me.cell); // a step the game accepted, never a key the map refused
    panel.cell = [...me.cell];
    if (place !== panel.session.room) { panel.session.enter(place, me.cell); panel.session.hold(heldInputs(role)); }
    else if (moved) panel.session.step(moved); // the video walks the same step as the dot

    const info = (me.room ? map.rooms[me.room].label : CORRIDOR_LABEL[place] || 'Corridor') +
      (me.carrying.length ? ' · carrying ' + me.carrying.map((id) => map.lootById[id].label.toLowerCase()).join(', ') : '') +
      (state.clock < me.penaltyUntil ? ' · <span style="color:' + COLOR.alarm + '">penalty ' + Math.ceil(me.penaltyUntil - state.clock) + ' s</span>' : '') +
      (me.loading ? ' · loading, safe from guard' : '');
    if (info !== lastInfo[role]) { panel.info.innerHTML = info; lastInfo[role] = info; }
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
