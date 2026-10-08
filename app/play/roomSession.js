// The room view, and the ONLY file that talks to the Reactor SDK.
//
// Every place (room or corridor) shows its still image. Rooms listed in
// liveRooms.js also open a Lingbot-World-2 session on entry: seed image +
// `${scene}, ${lens}` prompt, then the video replaces the still on its first
// frame. Held movement keys drive the camera. The session is disconnected on
// every way out (leaving the room, restart, idle, tab closed), because it
// bills per second while open. Commands and the connect/retry flow follow
// demo-live/index.html, the tested setup.
//
// The game never depends on this: on any failure the still stays up with a
// "signal lost" notice, and the map keeps running.

import { LIVE_MODEL, LIVE_ROOMS, SDK_URL } from './liveRooms.js';

const IDLE_MS = 60_000;        // close a live session after 60 s without input
const DOOR_MS = 600;           // "door opening" overlay for still-image rooms
const CONNECT_TRIES = 24;      // Reactor capacity is shared; a busy pool is retried
const CONNECT_WAIT_MS = 5_000;

/** The corridor is a place too: it has its own image (public/rooms/corridor.png). */
export const CORRIDOR = 'corridor';
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
  let idleTimer = null;
  let doorTimer = null;
  let reactor = null;      // the open live session, if any
  let ready = false;       // the session accepted set_image / set_prompt / start
  let idleClosed = false;  // live session closed for inactivity; the next input reopens it
  let held = new Set();    // directions currently held: 'N' | 'E' | 'S' | 'W'
  let sent = { lon: null, lat: null };
  let els = {};

  function setLoading(value) {
    if (value === loading) return;
    loading = value;
    onLoading(value);
  }

  function enter(id) {
    if (id === room) return;
    exit({ stillLoading: true });
    room = id;
    const gen = ++generation;
    setLoading(true);

    const live = LIVE_ROOMS[id];
    const info = map.rooms[id] || CORRIDOR_INFO;
    const still = live ? live.seed : seedImageUrl(map, id);
    root.innerHTML =
      '<img alt="" src="' + still + '">' +
      (live ? '<video autoplay playsinline muted hidden></video>' : '') +
      '<div class="card" hidden><b>' + info.label.toUpperCase() + '</b><p>' + info.prompt + '</p>' +
      '<p>No image at <code>' + still + '</code> or <code>' + defaultImageUrl() + '</code>.</p></div>' +
      '<div class="tag"></div>' +
      '<div class="overlay' + (id === CORRIDOR ? ' hidden' : '') + '">DOOR OPENING…</div>';
    els = {
      img: root.querySelector('img'), video: root.querySelector('video'),
      card: root.querySelector('.card'), tag: root.querySelector('.tag'), overlay: root.querySelector('.overlay'),
    };
    root.hidden = false;

    // A still-image place is "loaded" once the picture is up and the door overlay
    // is gone. A live room is loaded on its first video frame (see startLive).
    let imageReady = false;
    let doorDone = id === CORRIDOR;
    const settleStill = () => { if (!live && gen === generation && imageReady && doorDone) setLoading(false); };
    els.img.onload = () => { imageReady = true; settleStill(); };
    // the place's own image, else the shared default, else a text card
    els.img.onerror = () => {
      if (!els.img.dataset.fallback) { els.img.dataset.fallback = '1'; els.img.src = defaultImageUrl(); return; }
      els.img.hidden = true;
      els.card.hidden = false;
      imageReady = true;
      settleStill();
    };
    if (els.img.complete && els.img.naturalWidth) imageReady = true; // already cached

    if (live) {
      setTag('LIVE · LINGBOT-WORLD-2 · connecting');
      startLive(gen);
    } else {
      setTag('STATIC IMAGE');
      if (!doorDone) {
        doorTimer = setTimeout(() => { els.overlay.classList.add('hidden'); doorDone = true; settleStill(); }, DOOR_MS);
      }
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
          els.overlay.classList.add('hidden');
          setTag('LIVE · LINGBOT-WORLD-2');
          setLoading(false);
        }, { once: true });
        v.play().catch(() => {});
      });

      instance.on('statusChanged', async (status) => {
        if (stale() || reactor !== instance) return;
        if (status === 'disconnected' && ready) { signalLost('session ended'); return; }
        if (status !== 'ready') { setTag('LIVE · LINGBOT-WORLD-2 · ' + status); return; }
        try {
          setTag('LIVE · LINGBOT-WORLD-2 · uploading seed');
          const ref = await instance.uploadFile(seed);
          if (stale()) return;
          await instance.sendCommand('set_image', { image: ref });
          await instance.sendCommand('set_prompt', { prompt: cfg.scene + ', ' + lens });
          await instance.sendCommand('start', {});
          if (stale()) return;
          ready = true;
          setTag('LIVE · LINGBOT-WORLD-2 · starting');
          sendMoves(true);
        } catch (e) {
          if (!stale()) signalLost('command failed: ' + (e?.message || e));
        }
      });

      for (let attempt = 1; attempt <= CONNECT_TRIES; attempt++) {
        try {
          setTag('LIVE · LINGBOT-WORLD-2 · connecting' + (attempt > 1 ? ' (try ' + attempt + '/' + CONNECT_TRIES + ')' : ''));
          await instance.connect(jwt);
          if (stale()) safeDisconnect(instance);
          return;
        } catch (e) {
          if (stale()) { safeDisconnect(instance); return; }
          const msg = String(e?.message || e);
          if (!/capacity|busy|429|rate.?limit/i.test(msg) || attempt === CONNECT_TRIES) throw e;
          setTag('LIVE · Reactor busy, retrying in ' + CONNECT_WAIT_MS / 1000 + ' s (try ' + attempt + '/' + CONNECT_TRIES + ')');
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
    if (els.overlay) {
      els.overlay.textContent = 'SIGNAL LOST';
      els.overlay.classList.remove('hidden');
      els.overlay.classList.add('soft');
    }
    setTag('LIVE · signal lost: ' + reason);
    setLoading(false);
  }

  /** Directions currently held for this thief. Drives the live camera; any input resets the idle timer. */
  function hold(dirs) {
    held = new Set(dirs);
    if (!room) return;
    if (held.size) {
      touch();
      if (idleClosed && LIVE_ROOMS[room]) {
        idleClosed = false;
        els.overlay.textContent = 'RECONNECTING…';
        els.overlay.classList.remove('soft');
        startLive(generation);
      }
    }
    sendMoves(false);
  }

  function sendMoves(force) {
    if (!reactor || !ready) return;
    const lon = held.has('N') ? 'forward' : held.has('S') ? 'back' : 'idle';
    const lat = held.has('W') ? 'strafe_left' : held.has('E') ? 'strafe_right' : 'idle';
    if (force || lon !== sent.lon) reactor.sendCommand('set_move_longitudinal', { move_longitudinal: lon }).catch(() => {});
    if (force || lat !== sent.lat) reactor.sendCommand('set_move_lateral', { move_lateral: lat }).catch(() => {});
    sent = { lon, lat };
  }

  function exit({ stillLoading = false } = {}) {
    if (!stillLoading) setLoading(false);
    if (!room) return;
    room = null;
    generation++;
    idleClosed = false;
    clearTimeout(idleTimer);
    clearTimeout(doorTimer);
    stopLive();
    root.innerHTML = '';
    root.hidden = true;
    els = {};
  }

  function stopLive() {
    const r = reactor;
    reactor = null;
    ready = false;
    sent = { lon: null, lat: null };
    if (els.video) els.video.srcObject = null;
    if (r) safeDisconnect(r);
  }

  function touch() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!room || !els.overlay) return;
      if (reactor) {
        stopLive();
        idleClosed = true;
        els.video.hidden = true;
        setTag('LIVE · idle, session closed');
      }
      els.overlay.textContent = LIVE_ROOMS[room] ? 'IDLE · MOVE TO RECONNECT' : 'IDLE';
      els.overlay.classList.remove('hidden');
      els.overlay.classList.add('soft');
    }, IDLE_MS);
  }

  function setTag(text) {
    if (els.tag) els.tag.textContent = role.toUpperCase() + ' LENS · ' + text;
  }

  // every path out: tab closed, navigated away, reloaded
  window.addEventListener('pagehide', () => exit());

  return { enter, exit, hold, get room() { return room; }, get live() { return !!reactor; } };
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
