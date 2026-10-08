// Rule tests. No sockets, no timers: the functions are driven directly.
// Run with `node --test server/__tests__/` (or `pnpm test`).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { indexMap, same } from '../../shared/map.js';
import { newGame, tick, move, viewFor, coneOf, MOVE_COOLDOWN, PENALTY } from '../rules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = indexMap(JSON.parse(fs.readFileSync(path.join(root, 'map.json'), 'utf8')));
const loot = map.lootById;
const names = (events) => events.map((e) => e.name);

test('guard: a full lap returns to the start, every step adjacent, cone never empty', () => {
  const s = newGame(map);
  let prev = s.guard.cell;
  for (let i = 0; i < map.guardRoute.length; i++) {
    tick(s, map, 1);
    const c = s.guard.cell;
    assert.equal(Math.abs(prev[0] - c[0]) + Math.abs(prev[1] - c[1]), 1);
    assert.ok(coneOf(s, map).length >= 1);
    prev = c;
  }
  assert.ok(same(s.guard.cell, map.guardRoute[0]));
});

test('walls block, doors allow, corridor is open, bounds are checked', () => {
  assert.equal(map.canStep([1, 3], [1, 4]), false);
  assert.equal(map.canStep([3, 3], [3, 4]), true);
  assert.equal(map.canStep([1, 4], [2, 4]), true);
  assert.equal(map.canStep([0, 0], [-1, 0]), false);
});

test('move: rate limited to one step per cooldown', () => {
  const s = newGame(map);
  move(s, map, 'goggles', 'S');
  assert.ok(same(s.players.goggles.cell, [1, 2]));
  move(s, map, 'goggles', 'S');
  assert.ok(same(s.players.goggles.cell, [1, 2]), 'second move inside the cooldown is dropped');
  tick(s, map, MOVE_COOLDOWN);
  move(s, map, 'goggles', 'S');
  assert.ok(same(s.players.goggles.cell, [1, 3]));
});

test('move: leaving and entering rooms emits roomExit / roomEnter', () => {
  const s = newGame(map);
  tick(s, map, 10); // walk the guard away from the Lobby door first
  s.players.goggles.cell = [3, 3]; // Lobby door cell
  const out = move(s, map, 'goggles', 'S');
  assert.deepEqual(names(out), ['roomExit']);
  assert.equal(s.players.goggles.room, null);
  tick(s, map, MOVE_COOLDOWN);
  const back = move(s, map, 'goggles', 'N');
  assert.deepEqual(names(back), ['roomEnter']);
  assert.equal(back[0].room, 'lobby');
});

test('loot: stepping onto an object picks it up, once, and only for one player', () => {
  const s = newGame(map);
  const p = loot.painting.cell;
  s.players.goggles.cell = [p[0], p[1] + 1];
  s.players.goggles.room = 'gallery';
  const ev = move(s, map, 'goggles', 'N');
  assert.ok(s.players.goggles.carrying.includes('painting'));
  assert.deepEqual(s.loot.painting, { state: 'carried', holder: 'goggles' });
  assert.ok(ev.some((e) => e.name === 'banner'));
  tick(s, map, MOVE_COOLDOWN); move(s, map, 'goggles', 'S');
  tick(s, map, MOVE_COOLDOWN); move(s, map, 'goggles', 'N');
  assert.equal(s.players.goggles.carrying.length, 1);
  s.players.cameras.cell = [p[0], p[1] + 1];
  s.players.cameras.room = 'gallery';
  move(s, map, 'cameras', 'N');
  assert.equal(s.players.cameras.carrying.length, 0);
});

test('catch: back to start, penalty, frozen, loot returns to its room', () => {
  const s = newGame(map);
  s.players.goggles.cell = coneOf(s, map)[0];
  s.players.goggles.room = null;
  s.players.goggles.carrying = ['compass'];
  s.loot.compass = { state: 'carried', holder: 'goggles' };
  const ev = tick(s, map, 1); // guard steps; the player is standing in the new cone? force a check instead:
  // make sure a check happens with the player in the cone right now
  s.players.goggles.cell = coneOf(s, map)[0];
  s.players.goggles.penaltyUntil = 0;
  const ev2 = tick(s, map, 1);
  const all = [...ev, ...ev2];
  assert.ok(same(s.players.goggles.cell, map.starts.goggles));
  assert.ok(s.players.goggles.penaltyUntil > s.clock);
  assert.ok(s.players.goggles.penaltyUntil - s.clock <= PENALTY);
  assert.deepEqual(s.players.goggles.carrying, []);
  assert.equal(s.loot.compass.state, 'placed');
  assert.ok(all.some((e) => e.name === 'roomEnter' && e.room === 'lobby'), 'teleport home re-enters the Lobby');
  const before = s.players.goggles.cell;
  move(s, map, 'goggles', 'S');
  assert.ok(same(s.players.goggles.cell, before), 'penalised player cannot move');
});

test('bank: an exit scores carried loot, the game continues until all three are banked', () => {
  const s = newGame(map);
  const b = map.exits.B.cell;
  s.players.cameras.cell = [b[0] - 1, b[1]];
  s.players.cameras.room = 'dock';
  s.players.cameras.carrying = ['compass', 'amphora'];
  s.loot.compass = { state: 'carried', holder: 'cameras' };
  s.loot.amphora = { state: 'carried', holder: 'cameras' };
  move(s, map, 'cameras', 'E');
  assert.equal(s.players.cameras.score, 2);
  assert.deepEqual(s.players.cameras.carrying, []);
  assert.equal(s.loot.compass.state, 'banked');
  assert.equal(s.phase, 'playing');
  tick(s, map, MOVE_COOLDOWN); move(s, map, 'cameras', 'W');
  tick(s, map, MOVE_COOLDOWN); move(s, map, 'cameras', 'E');
  assert.equal(s.players.cameras.score, 2, 'empty-handed exit scores nothing');

  const a = map.exits.A.cell;
  s.players.goggles.cell = [a[0] + 1, a[1]];
  s.players.goggles.room = 'lobby';
  s.players.goggles.carrying = ['painting'];
  s.loot.painting = { state: 'carried', holder: 'goggles' };
  const ev = move(s, map, 'goggles', 'W');
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 'cameras');
  assert.ok(ev.some((e) => e.name === 'gameOver' && e.winner === 'cameras'));
  tick(s, map, 1);
  move(s, map, 'cameras', 'W');
  assert.ok(same(s.players.cameras.cell, b), 'no moves after game over');
});

test('viewFor: Goggles never sees the guard, Cameras and the map do', () => {
  const s = newGame(map);
  assert.equal(viewFor(s, 'goggles').guard, undefined);
  assert.ok(viewFor(s, 'cameras').guard);
  assert.ok(viewFor(s, null).guard);
});

test('map: three objects in three different non-exit rooms, each inside its room', () => {
  assert.equal(map.loot.length, 3);
  assert.equal(new Set(map.loot.map((l) => l.room)).size, 3);
  const exitRooms = new Set(Object.values(map.exits).map((e) => e.room));
  for (const l of map.loot) {
    assert.equal(map.roomAt(l.cell), l.room);
    assert.ok(!exitRooms.has(l.room));
  }
});
