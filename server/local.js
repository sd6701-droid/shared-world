// In-browser stand-in for the Socket.IO game server. It runs the rules on a
// 10 Hz timer and talks to the other tabs over a BroadcastChannel using the
// same message shapes the real server will use (shared/types.js). When the
// Node + Socket.IO server lands, this file is replaced and rules.js is not.
//
// One difference from the real server: a BroadcastChannel reaches every tab,
// so the full state is sent and each client filters it with viewFor(). The
// real server filters per recipient before sending.

import { EVENTS, MESSAGES } from '../shared/types.js';
import { newGame, tick, move, introEvents } from './rules.js';

export class LocalHost {
  constructor(map, { channel = 'two-thieves', hz = 10 } = {}) {
    this.map = map;
    this.hz = hz;
    this.state = newGame(map);
    this.listeners = [];
    this.bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channel) : null;
    if (this.bc) this.bc.onmessage = (e) => this.receive(e.data);
  }

  start() {
    this.last = performance.now();
    this.timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min((now - this.last) / 1000, 0.5);
      this.last = now;
      this.emit(tick(this.state, this.map, dt));
      this.broadcastState();
    }, 1000 / this.hz);
    this.emit(introEvents(this.map));
  }

  stop() {
    clearInterval(this.timer);
    if (this.bc) this.bc.close();
  }

  /** Message from a client tab. */
  receive(msg) {
    if (msg.type === MESSAGES.MOVE) this.input(msg.role, msg.dir);
    else if (msg.type === MESSAGES.RESTART) this.restart();
  }

  /** Direct input (the host page's own keyboard). */
  input(role, dir) {
    this.emit(move(this.state, this.map, role, dir));
  }

  restart() {
    this.state = newGame(this.map);
    this.emit([{ name: EVENTS.RESTART }, ...introEvents(this.map)]);
    this.broadcastState();
  }

  onEvent(fn) {
    this.listeners.push(fn);
  }

  emit(events) {
    for (const ev of events) {
      for (const fn of this.listeners) fn(ev);
      if (this.bc) this.bc.postMessage({ type: 'event', event: ev });
    }
  }

  broadcastState() {
    if (this.bc) this.bc.postMessage({ type: 'state', state: this.state });
  }
}
