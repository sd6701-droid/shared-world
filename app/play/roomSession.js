// The room view, and the ONLY file that talks to the Reactor SDK.
//
// Every place (a room, or a part of the corridor) shows its still image. Live
// places (liveRooms.js) also stream Lingbot-World-2: seed image +
// `${scene}, ${lens}` prompt, and the video replaces the still on its first frame.
//
// The video follows the MAP, not the keyboard: each step the game confirms
// (the thief's cell moved one cell) walks the camera for STEP_MS in the same
// direction, relative to the way the thief faces. A tap always moves the
// picture, a blocked move never does, and steps in a row join into one walk.
// Look keys only turn the camera, for as long as they are held. In the
// corridor the camera faces the way the thief last stepped: a corridor looks
// the same both ways, so walking down a hall is always forward.
//
// The corridor is one live session. Moving between its parts (corridor.js)
// shows the new part's still at once, then re-seeds the same session (reset ->
// set_image -> set_prompt -> start) instead of reconnecting.
//
// The session is disconnected on every way out (leaving, restart, idle, tab
// closed), because it bills per second while open. The game never depends on
// it: on any failure the still stays up and the map keeps running.

import { LIVE_MODEL, LIVE_ROOMS, LIVE_CORRIDOR, SDK_URL } from './liveRooms.js';
import { CORRIDOR_PLACES, CORRIDOR_SCENE, corridorPlace, corridorFacing } from './corridor.js';

const IDLE_MS = 60_000;          // close a live session after 60 s without input
const CONNECT_TRIES = 24;        // Reactor capacity is shared; a busy pool is retried
const CONNECT_WAIT_MS = 5_000;
const STEP_MS = 450;             // one map step walks the camera this long: at least one model chunk (~250 ms), and longer than the 300 ms between held steps so they join
const SETTLE_MS = 700;           // corridor: re-seed only once the thief stays in a part this long (walking through a 2-cell link takes ~600 ms)
const UPLOAD_TTL_MS = 14 * 60_000; // Reactor upload refs expire after 15 min
const REVEAL_FALLBACK_MS = 3_000; // after a re-seed, show the video even if no generation_started arrives
const ROTATION_SPEED_DEG = 15;   // look-key turn speed per latent frame; the model's default (5) barely turns

/** The corridor is a place too: it has its own image (public/rooms/corridor.png). */
export const CORRIDOR = 'corridor';
const CORRIDOR_INFO = { label: 'Corridor', prompt: 'Long museum corridor lined with framed paintings' };

/** Grid directions clockwise, and what each one means relative to the facing. */
const DIRS = ['N', 'E', 'S', 'W'];
const RELATIVE = ['forward', 'strafe_right', 'back', 'strafe_left'];
/** Look keys only turn the camera; the map has no camera angle. */
export const LOOK = { left: 'look_left', right: 'look_right', up: 'look_up', down: 'look_down' };

/** The place a thief is in: their room, else their part of the corridor (corridor.js). */
export function placeOf(map, player) {
  return player.room || corridorPlace(map, player.cell) || CORRIDOR;
}

/** The grid direction of a one-cell move from a to b, or null (no move, or a jump such as a catch). */
export function stepBetween(a, b) {
  if (!a || !b) return null;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  return dy < 0 ? 'N' : dy > 0 ? 'S' : dx > 0 ? 'E' : 'W';
}

/** Places that share one live session. */
const groupOf = (id) => (CORRIDOR_PLACES[id] ? 'corridor' : id);

/** { seed, scene } if this place streams live, else null. */
function liveConfig(id) {
  if (LIVE_ROOMS[id]) return LIVE_ROOMS[id];
  if (LIVE_CORRIDOR && CORRIDOR_PLACES[id]) return { seed: CORRIDOR_PLACES[id].image, scene: CORRIDOR_SCENE };
  return null;
}

// ---------------------------------------------------------------- shared by every view on the page

let sdkPromise = null;
function loadSdk() {
  sdkPromise ??= import(SDK_URL).catch((e) => { sdkPromise = null; throw e; });
  return sdkPromise;
}

let token = null; // { jwt, expiresAt }
async function getToken() {
  if (token && token.expiresAt - 60_000 > Date.now()) return token.jwt;
  const res = await fetch('/api/token', { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.jwt) {
    throw new Error(body.error || (res.status === 404 || res.status === 501
      ? 'no token server: run `node server/dev.mjs`'
      : 'token request failed (' + res.status + ')'));
  }
  token = { jwt: body.jwt, expiresAt: toMs(body.expires_at) ?? Date.now() + 50 * 60_000 };
  return token.jwt;
}
function toMs(v) {
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? null : t;
}

// ---------------------------------------------------------------- one view

/**
 * onLoading(true) fires when a view starts loading and onLoading(false) when it
 * is on screen (for a live room: the first video frame). The game uses it so
 * the guard can't catch a thief who can't see yet (capped in rules.js). The
 * corridor never reports loading: the guard patrols there.
 */
export function createRoomSession({ root, map, role, lens, onLoading = () => {} }) {
  let place = null;
  let generation = 0;      // bumps when the session group changes or the view closes; stale async work stops
  let loading = false;
  let shield = true;
  let idleTimer = null;
  let reactor = null;      // the open live session, if any (set while connecting too)
  let ready = false;       // the session accepted its first set_image / set_prompt / start
  let seeded = null;       // the seed image the live session is generating from
  let uploads = new Map(); // seed url -> { ref, at }, for the current session
  let syncing = null;      // the session being re-seeded, if any
  let started = false;     // the model said generation_started since the last reset
  let onStarted = null;
  let settleTimer = null;
  let idleClosed = false;  // live session closed for inactivity; the next input reopens it
  let held = new Set();    // held inputs; LOOK values turn the camera
  let facing = 'N';        // forward in the video, as a grid direction
  let motion = null;       // 'forward' | 'back' | 'strafe_left' | 'strafe_right' from the last confirmed step
  let motionTimer = null;
  let sent = { lon: null, lat: null, yaw: null, pitch: null };
  let els = {};

  function setLoading(value) {
    value = value && shield;
    if (value === loading) return;
    loading = value;
    onLoading(value);
  }

  /** cell: where the thief stands on entering; sets the camera's facing in a corridor part. */
  function enter(id, cell) {
    if (id === place) return;
    if (place && groupOf(id) === groupOf(place) && liveConfig(id)) { switchPart(id, cell); return; }

    exit({ stillLoading: true });
    place = id;
    const part = CORRIDOR_PLACES[id];
    shield = !part && id !== CORRIDOR;
    facing = part && cell ? corridorFacing(map, cell) : entryFacing(map, id);
    const gen = ++generation;
    setLoading(true);

    const live = liveConfig(id);
    const info = map.rooms[id] || part || CORRIDOR_INFO;
    const still = live ? live.seed : part ? part.image : seedImageUrl(map, id);
    root.innerHTML =
      '<img alt="" src="' + still + '">' +
      (live ? '<video autoplay playsinline muted hidden></video>' : '') +
      '<div class="name">' + escapeHtml(info.label) + '</div>' +
      '<div class="status"></div>';
    els = {
      img: root.querySelector('img'), video: root.querySelector('video'),
      name: root.querySelector('.name'), status: root.querySelector('.status'),
    };
    root.hidden = false;

    // A still-image place is "loaded" once its picture is up. A live place is
    // loaded on its first video frame (see startLive).
    let imageReady = false;
    const settleStill = () => { if (!live && gen === generation && imageReady) setLoading(false); };
    els.img.onload = () => { imageReady = true; settleStill(); };
    // the place's own image, else the shared default, else just the name on black
    els.img.onerror = () => {
      if (!els.img.dataset.fallback) { els.img.dataset.fallback = '1'; els.img.src = defaultImageUrl(); return; }
      els.img.hidden = true;
      imageReady = true;
      settleStill();
    };
    if (els.img.complete && els.img.naturalWidth) imageReady = true; // already cached

    if (live) {
      setStatus('connecting');
      startLive(gen);
    } else {
      setStatus('still image');
      settleStill();
    }
    touch();
  }

  /** Same live session, new part of the corridor: show its still now, re-seed once the thief settles. */
  function switchPart(id, cell) {
    place = id;
    const part = CORRIDOR_PLACES[id];
    facing = cell ? corridorFacing(map, cell) : facing;
    stopMotion();
    els.name.textContent = part.label;
    els.img.hidden = false;
    els.img.src = part.image;
    root.classList.add('switching'); // the still covers the video until the new view's frames arrive
    clearTimeout(settleTimer);
    if (!reactor) {
      // no session (closed for idle, or lost): moving into a new part reopens it
      idleClosed = false;
      setStatus('connecting');
      startLive(generation);
    } else {
      setStatus(ready ? 'switching view' : 'connecting');
      settleTimer = setTimeout(syncSeed, SETTLE_MS);
    }
    touch();
  }

  async function startLive(gen) {
    const stale = () => gen !== generation;
    let instance = null;
    try {
      const [{ Reactor }, jwt] = await Promise.all([loadSdk(), getToken()]);
      if (stale()) return;

      instance = new Reactor({ modelName: LIVE_MODEL });
      reactor = instance;
      ready = false;
      seeded = null;
      uploads = new Map();

      instance.on('trackReceived', (name, _track, stream) => {
        if (name !== 'main_video' || stale() || reactor !== instance) return;
        const v = els.video;
        v.srcObject = stream; // stays hidden until frames play, so the still never flashes black
        v.addEventListener('playing', () => {
          if (stale() || reactor !== instance) return;
          if (!syncing) reveal();
          setLoading(false);
        }, { once: true });
        v.play().catch(() => {});
      });

      instance.on('generation_started', () => {
        if (reactor !== instance) return;
        started = true;
        if (onStarted) onStarted();
      });

      instance.on('statusChanged', async (status) => {
        if (stale() || reactor !== instance) return;
        if (status === 'disconnected' && ready) { signalLost('session ended'); return; }
        if (status !== 'ready' || ready) { if (!ready) setStatus(status); return; }
        try {
          const cfg = liveConfig(place);
          setStatus('uploading view');
          const ref = await uploadSeed(instance, cfg.seed);
          if (stale() || reactor !== instance) return;
          await instance.sendCommand('set_image', { image: ref });
          await instance.sendCommand('set_prompt', { prompt: cfg.scene + ', ' + lens });
          await instance.sendCommand('set_rotation_speed_deg', { rotation_speed_deg: ROTATION_SPEED_DEG });
          await instance.sendCommand('start', {});
          if (stale() || reactor !== instance) return;
          seeded = cfg.seed;
          ready = true;
          setStatus('starting');
          sendMoves(true);
          syncSeed();              // the thief may have moved to another corridor part meanwhile
          preUpload(instance);     // the other corridor parts, so switching skips the upload
        } catch (e) {
          if (!stale() && reactor === instance) signalLost('command failed: ' + (e?.message || e));
        }
      });

      for (let attempt = 1; attempt <= CONNECT_TRIES; attempt++) {
        try {
          setStatus('connecting' + (attempt > 1 ? ' (try ' + attempt + '/' + CONNECT_TRIES + ')' : ''));
          await instance.connect(jwt);
          if (stale()) safeDisconnect(instance);
          return;
        } catch (e) {
          if (stale()) { safeDisconnect(instance); return; }
          const msg = String(e?.message || e);
          if (!/capacity|busy|429|rate.?limit/i.test(msg) || attempt === CONNECT_TRIES) throw e;
          setStatus('Reactor busy, retry in ' + CONNECT_WAIT_MS / 1000 + ' s (' + attempt + '/' + CONNECT_TRIES + ')');
          await new Promise((r) => setTimeout(r, CONNECT_WAIT_MS));
          if (stale()) { safeDisconnect(instance); return; }
        }
      }
    } catch (e) {
      if (instance && reactor !== instance) safeDisconnect(instance);
      if (!stale()) signalLost(e?.message || String(e));
    }
  }

  async function uploadSeed(instance, url) {
    const hit = uploads.get(url);
    if (hit && Date.now() - hit.at < UPLOAD_TTL_MS) return hit.ref;
    const ref = await instance.uploadFile(await fetchSeed(url));
    if (reactor === instance) uploads.set(url, { ref, at: Date.now() });
    return ref;
  }

  async function preUpload(instance) {
    if (!CORRIDOR_PLACES[place]) return;
    for (const id of Object.keys(CORRIDOR_PLACES)) {
      if (reactor !== instance) return;
      const cfg = liveConfig(id);
      if (cfg) await uploadSeed(instance, cfg.seed).catch(() => {});
    }
  }

  /** Re-seed the open session until it shows the current place's image. One run at a time per session. */
  async function syncSeed() {
    const instance = reactor;
    if (!instance || !ready || syncing === instance) return;
    const gen = generation;
    const current = () => reactor === instance && gen === generation;
    syncing = instance;
    let changed = false;
    try {
      for (let cfg = liveConfig(place); current() && cfg && cfg.seed !== seeded; cfg = liveConfig(place)) {
        setStatus('switching view');
        const ref = await uploadSeed(instance, cfg.seed);
        if (!current()) return;
        // ~0.5 s of the previous view keeps arriving after reset; the still covers it until generation_started
        started = false;
        await instance.sendCommand('reset', {});
        await instance.sendCommand('set_image', { image: ref });
        await instance.sendCommand('set_prompt', { prompt: cfg.scene + ', ' + lens });
        await instance.sendCommand('set_rotation_speed_deg', { rotation_speed_deg: ROTATION_SPEED_DEG });
        await instance.sendCommand('start', {});
        seeded = cfg.seed;
        changed = true;
        sent = { lon: null, lat: null, yaw: null, pitch: null }; // reset clears the controls; resend them
        if (!started) await new Promise((res) => { onStarted = res; setTimeout(res, REVEAL_FALLBACK_MS); });
        onStarted = null;
      }
      if (current()) reveal();
    } catch (e) {
      if (!current()) return;
      console.warn('[' + role + ' view] re-seed failed, reconnecting:', e?.message || e);
      stopLive();
      setStatus('connecting');
      startLive(generation);
    } finally {
      if (syncing === instance) syncing = null;
      if (current() && changed) sendMoves(true);
    }
  }

  /** Show the video over the still. */
  function reveal() {
    root.classList.remove('switching');
    if (els.video) els.video.hidden = false;
    setStatus('live');
  }

  /** The live view failed: keep the still, say so, and let the thief play on. */
  function signalLost(reason) {
    stopLive();
    if (els.video) els.video.hidden = true;
    root.classList.remove('switching');
    setStatus('signal lost', true);
    console.warn('[' + role + ' view' + (place ? ' · ' + place : '') + '] signal lost: ' + reason);
    setLoading(false);
  }

  /** Wake an idle view: any input resets the idle timer, and reopens a session closed for idle. */
  function wake() {
    touch();
    if (idleClosed && place && liveConfig(place)) {
      idleClosed = false;
      setStatus('connecting');
      startLive(generation);
    }
  }

  /**
   * A step the game confirmed: the thief moved one cell in this grid direction.
   * Walks the camera the same way for STEP_MS; the next step extends it.
   */
  function step(dir) {
    if (!place || !DIRS.includes(dir)) return;
    if (CORRIDOR_PLACES[place]) facing = dir;
    motion = RELATIVE[(DIRS.indexOf(dir) - DIRS.indexOf(facing) + 4) % 4];
    clearTimeout(motionTimer);
    motionTimer = setTimeout(stopMotion, STEP_MS);
    wake();
    sendMoves(false);
  }

  function stopMotion() {
    clearTimeout(motionTimer);
    motion = null;
    sendMoves(false);
  }

  /** Inputs currently held. LOOK values turn the camera while held; any input keeps the view awake. */
  function hold(inputs) {
    held = new Set(inputs);
    if (!place) return;
    if (held.size) wake();
    sendMoves(false);
  }

  function sendMoves(force) {
    if (!reactor || !ready || syncing) return;
    const lon = motion === 'forward' || motion === 'back' ? motion : 'idle';
    const lat = motion === 'strafe_left' || motion === 'strafe_right' ? motion : 'idle';
    const yaw = held.has(LOOK.left) ? 'left' : held.has(LOOK.right) ? 'right' : 'idle';
    const pitch = held.has(LOOK.up) ? 'up' : held.has(LOOK.down) ? 'down' : 'idle';
    const send = (cmd, args) => reactor.sendCommand(cmd, args).catch(() => {});
    if (force || lon !== sent.lon) send('set_move_longitudinal', { move_longitudinal: lon });
    if (force || lat !== sent.lat) send('set_move_lateral', { move_lateral: lat });
    if (force || yaw !== sent.yaw) send('set_look_horizontal', { look_horizontal: yaw });
    if (force || pitch !== sent.pitch) send('set_look_vertical', { look_vertical: pitch });
    sent = { lon, lat, yaw, pitch };
  }

  function exit({ stillLoading = false } = {}) {
    if (!stillLoading) setLoading(false);
    if (!place) return;
    place = null;
    generation++;
    idleClosed = false;
    clearTimeout(idleTimer);
    clearTimeout(settleTimer);
    clearTimeout(motionTimer);
    motion = null;
    stopLive();
    root.classList.remove('switching');
    root.innerHTML = '';
    root.hidden = true;
    els = {};
  }

  function stopLive() {
    const r = reactor;
    reactor = null;
    ready = false;
    seeded = null;
    syncing = null;
    uploads = new Map();
    sent = { lon: null, lat: null, yaw: null, pitch: null };
    if (els.video) els.video.srcObject = null;
    if (r) safeDisconnect(r);
  }

  function touch() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!place || !reactor) return;
      stopLive();
      idleClosed = true;
      els.video.hidden = true; // back to the still; moving reconnects
      root.classList.remove('switching');
      setStatus('idle · move to reconnect');
    }, IDLE_MS);
  }

  /** The status tag in the corner of the view: still image, connecting, live, signal lost. */
  function setStatus(text, warn = false) {
    root.dataset.status = text;
    if (els.status) {
      els.status.textContent = text;
      els.status.className = 'status' + (warn ? ' warn' : text === 'live' ? ' live' : '');
    }
    console.debug('[' + role + ' view' + (place ? ' · ' + place : '') + '] ' + text);
  }

  // every path out: tab closed, navigated away, reloaded
  window.addEventListener('pagehide', () => exit());

  return { enter, exit, hold, step, get room() { return place; }, get live() { return !!reactor && ready; } };
}

/** The grid direction of the step through this room's door, from outside to inside. North if unknown. */
function entryFacing(map, roomId) {
  const door = (map.doors || []).find((d) => d.room === roomId);
  if (!door) return 'N';
  const dx = door.cell[0] - door.outside[0], dy = door.cell[1] - door.outside[1];
  return dy < 0 ? 'N' : dy > 0 ? 'S' : dx > 0 ? 'E' : dx < 0 ? 'W' : 'N';
}

function safeDisconnect(r) {
  try { const p = r.disconnect(); if (p && p.catch) p.catch(() => {}); } catch {}
}

async function fetchSeed(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('seed image ' + url + ': ' + res.status);
  const blob = await res.blob();
  return new File([blob], url.split('/').pop(), { type: blob.type || 'image/jpeg' });
}

/** public/ is served at the site root by Next.js; under the dev servers it is ../../public/. */
export function seedImageUrl(map, roomId) {
  const base = location.pathname.includes('/app/') ? '../../public/rooms/' : '/rooms/';
  return base + roomId + '.png';
}

/** Shown in every room until that room has its own seed image. */
export function defaultImageUrl() {
  return seedImageUrl(null, 'default');
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
