// ALL game rules, as pure functions over GameState. No sockets, no timers,
// no Date.now(), no Math.random(): time comes in as `dt`. Every function
// mutates `state` and returns the events the host should send out.

import { ROLES, LABEL, EVENTS } from '../shared/types.js';
import { DIRS, same } from '../shared/map.js';

export const MOVE_COOLDOWN = 0.25; // s between accepted moves per player (4 moves/s)
export const GUARD_STEP = 1;       // guard advances one cell per second
export const CONE_LEN = 3;         // cells ahead the guard can see
export const PENALTY = 30;         // s frozen at start after a catch

const COLOR = { gold: '#e0b44c', muted: '#7f8aa3', text: '#d7deea', goggles: '#3ddc84', cameras: '#b8bec9' };
const banner = (to, text, color, secs = 3) => ({ name: EVENTS.BANNER, to, text, color, secs });

export function newGame(map) {
  const state = {
    phase: 'playing', clock: 0, winner: null,
    players: {}, loot: {},
    guard: { routeIndex: 0, cell: map.guardRoute[0], facing: 'E' },
    guardAcc: 0,
  };
  for (const role of ROLES) {
    state.players[role] = {
      cell: [...map.starts[role]], room: map.roomAt(map.starts[role]),
      penaltyUntil: 0, carrying: [], score: 0, lastMove: -Infinity,
    };
  }
  for (const l of map.loot) state.loot[l.id] = { state: 'placed', holder: null };
  faceNext(state.guard, map);
  return state;
}

export function introEvents(map) {
  return [banner('all', map.loot.length + ' objects to steal. Walk onto one to grab it, then reach an exit to bank it.', COLOR.gold, 8)];
}

/** Advance the clock. Call at ~10 Hz. */
export function tick(state, map, dt) {
  const events = [];
  if (state.phase !== 'playing') return events;
  state.clock += dt;
  state.guardAcc += dt;
  while (state.guardAcc >= GUARD_STEP) {
    state.guardAcc -= GUARD_STEP;
    stepGuard(state, map);
    checkCatches(state, map, events);
  }
  return events;
}

/** One requested step. The host calls this for every move message; the cooldown here is the rate limit. */
export function move(state, map, role, dir) {
  const events = [];
  if (state.phase !== 'playing' || !DIRS[dir]) return events;
  const p = state.players[role];
  if (state.clock < p.penaltyUntil || state.clock - p.lastMove < MOVE_COOLDOWN) return events;
  const next = [p.cell[0] + DIRS[dir][0], p.cell[1] + DIRS[dir][1]];
  if (!map.canStep(p.cell, next)) return events;

  p.cell = next;
  p.lastMove = state.clock;
  setRoom(p, role, map.roomAt(next), events);

  // touching an object picks it up
  for (const l of map.loot) {
    if (state.loot[l.id].state !== 'placed' || !same(l.cell, next)) continue;
    state.loot[l.id] = { state: 'carried', holder: role };
    p.carrying.push(l.id);
    events.push(banner('all', LABEL[role] + ' grabbed the ' + l.label.toLowerCase() + '.', COLOR[role]));
  }

  // reaching an exit banks whatever you carry
  if (p.carrying.length && map.exitCells.some((e) => same(e.cell, next))) {
    for (const id of p.carrying) state.loot[id] = { state: 'banked', holder: role };
    p.score += p.carrying.length;
    events.push(banner('all', LABEL[role] + ' got ' + p.carrying.length + ' object' + (p.carrying.length > 1 ? 's' : '') + ' out. Score ' + p.score + '.', COLOR[role]));
    p.carrying = [];
    if (map.loot.every((l) => state.loot[l.id].state === 'banked')) endGame(state, events);
    return events;
  }

  checkCatches(state, map, events);
  return events;
}

/** What a given role is allowed to see. Goggles never gets the guard; the map screen (role null) gets everything. */
export function viewFor(state, role) {
  if (role !== 'goggles') return state;
  const { guard, ...rest } = state;
  return rest;
}

export function coneOf(state, map) {
  return map.coneCells(state.guard.cell, state.guard.facing, CONE_LEN);
}

// ---------------------------------------------------------------- internals

function setRoom(p, role, room, events) {
  if (room === p.room) return;
  if (p.room) events.push({ name: EVENTS.ROOM_EXIT, role, room: p.room });
  if (room) events.push({ name: EVENTS.ROOM_ENTER, role, room });
  p.room = room;
}

function faceNext(guard, map) {
  const next = map.guardRoute[(guard.routeIndex + 1) % map.guardRoute.length];
  const dx = next[0] - guard.cell[0], dy = next[1] - guard.cell[1];
  guard.facing = dx > 0 ? 'E' : dx < 0 ? 'W' : dy > 0 ? 'S' : 'N';
}

function stepGuard(state, map) {
  const g = state.guard;
  g.routeIndex = (g.routeIndex + 1) % map.guardRoute.length;
  g.cell = map.guardRoute[g.routeIndex];
  faceNext(g, map);
}

function checkCatches(state, map, events) {
  const seen = [state.guard.cell, ...coneOf(state, map)];
  for (const role of ROLES) {
    const p = state.players[role];
    if (state.clock < p.penaltyUntil) continue;
    if (!seen.some((c) => same(c, p.cell))) continue;
    p.cell = [...map.starts[role]];
    p.penaltyUntil = state.clock + PENALTY;
    setRoom(p, role, map.roomAt(p.cell), events);
    let text = 'Guard caught ' + LABEL[role] + '. Back to start, ' + PENALTY + ' s penalty.';
    if (p.carrying.length) {
      for (const id of p.carrying) state.loot[id] = { state: 'placed', holder: null };
      text += ' The ' + p.carrying.map((id) => map.lootById[id].label.toLowerCase()).join(' and ') + ' went back.';
      p.carrying = [];
    }
    events.push(banner('all', text, COLOR.muted, 4));
  }
}

function endGame(state, events) {
  const [a, b] = ROLES.map((r) => state.players[r].score);
  state.phase = 'over';
  state.winner = a === b ? null : a > b ? ROLES[0] : ROLES[1];
  events.push({ name: EVENTS.GAME_OVER, winner: state.winner });
  events.push(banner('all',
    (state.winner ? LABEL[state.winner] + ' wins ' + Math.max(a, b) + '–' + Math.min(a, b) : 'Draw ' + a + '–' + b) + '. Press R to play again.',
    state.winner ? COLOR[state.winner] : COLOR.text, 600));
}
