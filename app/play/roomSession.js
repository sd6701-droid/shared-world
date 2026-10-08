// The room view, and the ONLY file that talks to the Reactor SDK.
//
// Every place (room or corridor) shows its still image. Rooms listed in
// liveRooms.js also open a Lingbot-World-2 session on entry: seed image +
// `${scene}, ${lens}` prompt, then the video replaces the still on its first
// frame. The same held keys that move the thief on the map drive the camera,
// relative to the way the thief walked in; look keys turn it. Disconnected on
// every way out (leaving the room, restart, idle, tab closed), because it
// bills per second while open. Commands and the connect/retry flow follow
// demo-live/index.html, the tested setup.
//
// The view shows only the picture (or live video) and the room name. The game
// never depends on it: on any failure the still stays up and the map keeps running.

import { LIVE_MODEL, LIVE_ROOMS, SDK_URL } from './liveRooms.js';
import { CORRIDOR_PLACES, corridorPlace, corridorFacing } from './corridor.js';

const IDLE_MS = 60_000;        // close a live session after 60 s without input
const CONNECT_TRIES = 24;      // Reactor capacity is shared; a busy pool is retried
const CONNECT_WAIT_MS = 5_000;

/** Grid directions clockwise, and what each one means relative to the facing. */
const DIRS = ['N', 'E', 'S', 'W'];
const RELATIVE = ['forward', 'strafe_right', 'back', 'strafe_left'];
/** Look keys only turn the camera; the map has no camera angle. */
export const LOOK = { left: 'look_left', right: 'look_right', up: 'look_up', down: 'look_down' };

/** The corridor is a place too: it has its own image (public/rooms/corridor.png). */
export const CORRIDOR = 'corridor';

/** The place a thief is in: their room, else their part of the corridor (corridor.js). */
export function placeOf(map, player) {
  return player.room || corridorPlace(map, player.cell) || CORRIDOR;
}
const CORRIDOR_INFO = { label: 'Corridor', prompt: 'Long museum corridor lined with framed paintings' };

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
 * the guard can't catch a thief who can't see yet (capped in rules.js).
 */
export function createRoomSession({ root, map, role, lens, onLoading = () => {} }) {
  let room = null;
  let generation = 0;      // bumps on every enter/exit; stale async work checks it and stops
  let loading = false;
  let shield = true;       // a loading view protects the thief from the guard; not in the corridor, where it patrols
  let idleTimer = null;
  let reactor = null;      // the open live session, if any
  let ready = false;       // the session accepted set_image / set_prompt / start
  let idleClosed = false;  // live session closed for inactivity; the next input reopens it
  let held = new Set();    // held inputs: 'N' | 'E' | 'S' | 'W' and LOOK values
  let facing = 'N';        // the way the thief walked in; forward in the video
  let sent = { lon: null, lat: null, yaw: null, pitch: null };
  let els = {};

  function setLoading(value) {
    value = value && shield;
    if (value === loading) return;
    loading = value;
    onLoading(value);
  }

  /** cell: where the thief stands on entering; sets the camera's facing in a corridor place. */
  function enter(id, cell) {
    if (id === room) return;
    exit({ stillLoading: true });
    room = id;
    const hall = CORRIDOR_PLACES[id];
    shield = !hall && id !== CORRIDOR;
    facing = hall && cell ? corridorFacing(map, cell) : entryFacing(map, id);
    const gen = ++generation;
    setLoading(true);

    const live = LIVE_ROOMS[id];
    const info = map.rooms[id] || hall || CORRIDOR_INFO;
    const still = live ? live.seed : hall ? hall.image : seedImageUrl(map, id);
    root.innerHTML =
      '<img alt="" src="' + still + '">' +
      (live ? '<video autoplay playsinline muted hidden></video>' : '') +
      '<div class="name">' + escapeHtml(info.label) + '</div>';
    els = {
      img: root.querySelector('img'), video: root.querySelector('video'),
      name: root.querySelector('.name'),
    };
    root.hidden = false;

    // A still-image place is "loaded" once its picture is up. A live room is
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
      setStatus('live · connecting');
      startLive(gen);
    } else {
      setStatus('static image');
      settleStill();
    }
    touch();
  }

  async function startLive(gen) {
    const cfg = LIVE_ROOMS[room];
    const stale = () => gen !== generation;
    let instance = null;
    try {
      const [{ Reactor }, jwt, seed] = await Promise.all([loadSdk(), getToken(), fetchSeed(cfg.seed)]);
      if (stale()) return;

      instance = new Reactor({ modelName: LIVE_MODEL });
      reactor = instance;
      ready = false;

      instance.on('trackReceived', (name, _track, stream) => {
        if (name !== 'main_video' || stale() || reactor !== instance) return;
        const v = els.video;
        v.srcObject = stream;
        v.hidden = false;
        v.addEventListener('playing', () => {
          if (stale()) return;
          setStatus('live');
          setLoading(false);
        }, { once: true });
        v.play().catch(() => {});
      });

      instance.on('statusChanged', async (status) => {
        if (stale() || reactor !== instance) return;
        if (status === 'disconnected' && ready) { signalLost('session ended'); return; }
        if (status !== 'ready') { setStatus('live · ' + status); return; }
        try {
          setStatus('live · uploading seed');
          const ref = await instance.uploadFile(seed);
          if (stale()) return;
          await instance.sendCommand('set_image', { image: ref });
          await instance.sendCommand('set_prompt', { prompt: cfg.scene + ', ' + lens });
          await instance.sendCommand('start', {});
          if (stale()) return;
          ready = true;
          setStatus('live · starting');
          sendMoves(true);
        } catch (e) {
          if (!stale()) signalLost('command failed: ' + (e?.message || e));
        }
      });

      for (let attempt = 1; attempt <= CONNECT_TRIES; attempt++) {
        try {
          setStatus('live · connecting' + (attempt > 1 ? ' (try ' + attempt + '/' + CONNECT_TRIES + ')' : ''));
          await instance.connect(jwt);
          if (stale()) safeDisconnect(instance);
          return;
        } catch (e) {
          if (stale()) { safeDisconnect(instance); return; }
          const msg = String(e?.message || e);
          if (!/capacity|busy|429|rate.?limit/i.test(msg) || attempt === CONNECT_TRIES) throw e;
          setStatus('live · Reactor busy, retrying in ' + CONNECT_WAIT_MS / 1000 + ' s (try ' + attempt + '/' + CONNECT_TRIES + ')');
          await new Promise((r) => setTimeout(r, CONNECT_WAIT_MS));
          if (stale()) { safeDisconnect(instance); return; }
        }
      }
    } catch (e) {
      if (instance && reactor !== instance) safeDisconnect(instance);
      if (!stale()) signalLost(e?.message || String(e));
    }
  }

  /** The live view failed: keep the still, say so, and let the thief play on. */
  function signalLost(reason) {
    stopLive();
    if (els.video) els.video.hidden = true;
    setStatus('signal lost: ' + reason, true);
    setLoading(false);
  }

  /**
   * Inputs currently held for this thief: grid directions (the same ones sent to
   * the map) and LOOK values. Drives the live camera; any input resets the idle timer.
   */
  function hold(inputs) {
    held = new Set(inputs);
    if (!room) return;
    if (held.size) {
      touch();
      if (idleClosed && LIVE_ROOMS[room]) {
        idleClosed = false;
        setStatus('reconnecting');
        startLive(generation);
      }
    }
    sendMoves(false);
  }

  function sendMoves(force) {
    if (!reactor || !ready) return;
    // a grid direction becomes forward / back / strafe relative to the way the thief walked in
    const rel = new Set(DIRS.filter((d) => held.has(d))
      .map((d) => RELATIVE[(DIRS.indexOf(d) - DIRS.indexOf(facing) + 4) % 4]));
    const lon = rel.has('forward') ? 'forward' : rel.has('back') ? 'back' : 'idle';
    const lat = rel.has('strafe_left') ? 'strafe_left' : rel.has('strafe_right') ? 'strafe_right' : 'idle';
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
    if (!room) return;
    room = null;
    generation++;
    idleClosed = false;
    clearTimeout(idleTimer);
    stopLive();
    root.innerHTML = '';
    root.hidden = true;
    els = {};
  }

  function stopLive() {
    const r = reactor;
    reactor = null;
    ready = false;
    sent = { lon: null, lat: null, yaw: null, pitch: null };
    if (els.video) els.video.srcObject = null;
    if (r) safeDisconnect(r);
  }

  function touch() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!room || !reactor) return;
      stopLive();
      idleClosed = true;
      els.video.hidden = true; // back to the still; moving reconnects
      setStatus('idle, session closed');
    }, IDLE_MS);
  }

  // Status never appears on screen (the view is only the picture and the room
  // name). It is on the element as data-status and in the console for debugging.
  function setStatus(text, warn = false) {
    root.dataset.status = text;
    console[warn ? 'warn' : 'debug']('[' + role + ' view' + (room ? ' · ' + room : '') + '] ' + text);
  }

  // every path out: tab closed, navigated away, reloaded
  window.addEventListener('pagehide', () => exit());

  return { enter, exit, hold, get room() { return room; }, get live() { return !!reactor; } };
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

