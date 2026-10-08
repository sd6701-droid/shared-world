// One player's screen: /play/?role=goggles or ?role=cameras.
// The view shows an image of wherever the player is (a room or the corridor)
// through roomSession.js, which is where the world model plugs in. The minimap
// shows what this role is allowed to see (viewFor in server/rules.js).

import { loadMap } from '../../shared/map.js';
import { ROLES, LABEL } from '../../shared/types.js';
import { connect } from '../../lib/gameClient.js';
import { drawFloor, COLOR } from '../../lib/floorCanvas.js';
import { createRoomSession, CORRIDOR } from './roomSession.js';
import { LENSES } from './lenses.js';

const params = new URLSearchParams(location.search);
const role = ROLES.includes(params.get('role')) ? params.get('role') : 'goggles';
document.body.classList.add('lens-' + role);
document.getElementById('who').textContent = LABEL[role].toUpperCase();
document.getElementById('who').style.color = COLOR[role];

const KEYS = { w: 'N', a: 'W', s: 'S', d: 'E', ArrowUp: 'N', ArrowLeft: 'W', ArrowDown: 'S', ArrowRight: 'E' };
const MINI_CELL = 10;
const map = await loadMap('../../map.json');

const minimap = document.getElementById('minimap');
const miniCtx = minimap.getContext('2d');
minimap.width = map.width * MINI_CELL;
minimap.height = map.height * MINI_CELL;

const session = createRoomSession({
  root: document.getElementById('room'), map, role, lens: LENSES[role],
  onLoading: (loading) => client.loading(loading), // client is created below; this only fires once the game is running
});

let state = null;
let lastStateAt = 0;
const banners = [];
const client = connect({
  role,
  onState: (s) => { state = s; lastStateAt = performance.now(); },
  onEvent: (ev) => {
    if (ev.name === 'banner') banners.push({ ...ev, until: performance.now() / 1000 + ev.secs });
    if (ev.name === 'restart') banners.length = 0;
  },
});

// keyboard: this role only. WASD and arrows both work (each player has their own laptop later).
const held = new Set();
const normKey = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
window.addEventListener('keydown', (e) => {
  const k = normKey(e);
  if (k.startsWith('Arrow') || k === ' ') e.preventDefault();
  if (e.repeat) return;
  if (k === 'r') { client.restart(); return; }
  if (!KEYS[k]) return;
  held.add(k);
  client.move(KEYS[k]);
  session.hold(heldDirs());
});
// the room view gets the set of held directions: it drives the live camera until release
const heldDirs = () => [...new Set(Object.keys(KEYS).filter((k) => held.has(k)).map((k) => KEYS[k]))];
window.addEventListener('keyup', (e) => { held.delete(normKey(e)); session.hold(heldDirs()); });
window.addEventListener('blur', () => { held.clear(); session.hold([]); });
setInterval(() => {
  const dir = heldDirs()[0];
  if (dir) client.move(dir);
}, 50);

let lastScore = '', lastBanners = '';
function frame() {
  const waiting = !state || performance.now() - lastStateAt > 2000;
  document.getElementById('waiting').hidden = !waiting;
  if (state) {
    const me = state.players[role];

    // driven by the state, so a late-opened tab catches up
    const place = me.room || CORRIDOR;
    if (place !== session.room) { session.enter(place); session.hold(heldDirs()); }

    drawFloor(miniCtx, map, state, { cell: MINI_CELL, roles: [role], showRoute: false });

    const t = Math.floor(state.clock);
    document.getElementById('clock').textContent =
      String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
    const score = 'Score ' + me.score + (me.carrying.length ? ' <small>+' + me.carrying.length + ' carrying</small>' : '') +
      (state.clock < me.penaltyUntil ? ' <span style="color:' + COLOR.alarm + '">penalty ' + Math.ceil(me.penaltyUntil - state.clock) + ' s</span>' : '') +
      (me.loading ? ' <small>loading · safe from guard</small>' : '');
    if (score !== lastScore) { document.getElementById('score').innerHTML = score; lastScore = score; }

    const over = document.getElementById('over');
    over.hidden = state.phase !== 'over';
    if (state.phase === 'over') {
      const [a, b] = ROLES.map((r) => state.players[r].score);
      over.style.color = state.winner ? COLOR[state.winner] : COLOR.text;
      over.innerHTML = (state.winner ? (state.winner === role ? 'YOU WIN ' : LABEL[state.winner].toUpperCase() + ' WINS ') + Math.max(a, b) + '–' + Math.min(a, b) : 'DRAW ' + a + '–' + b) +
        '<small>Press R to play again</small>';
    }
  }

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
