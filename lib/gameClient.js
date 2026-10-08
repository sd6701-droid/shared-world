// The one place a screen connects to the game host. Today that is the
// BroadcastChannel from server/local.js; later it is a socket.io-client
// connection to the Node server. Screens only ever see onState / onEvent.

import { MESSAGES } from '../shared/types.js';
import { viewFor } from '../server/rules.js';

export function connect({ role = null, channel = 'two-thieves', onState, onEvent }) {
  const bc = new BroadcastChannel(channel);
  bc.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'state') {
      if (onState) onState(viewFor(m.state, role));
    } else if (m.type === 'event') {
      const ev = m.event;
      if (ev.to && ev.to !== 'all' && ev.to !== role) return;
      if (onEvent) onEvent(ev);
    }
  };
  return {
    move: (dir) => bc.postMessage({ type: MESSAGES.MOVE, role, dir }),
    restart: () => bc.postMessage({ type: MESSAGES.RESTART }),
    close: () => bc.close(),
  };
}
