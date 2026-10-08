import type { AgentConfig } from './types';

// Police — NPC. Pass 1: STATIONARY dot on the map, no generated view.
//
// To promote police to a full rendered agent later (its own Nano Banana seed
// image + Lingbot-World-2 view, like the thieves):
//   1. set `rendered: true`, `mobile: true`
//   2. set `model` and a `lens` prompt (e.g. a clear "guard flashlight" look)
//   3. add a seed image for its room(s) in public/rooms/
//   4. give the server a police patrol route in map.json (A's lane)
// Nothing else in the registry or the play screen needs to change.
export const police: AgentConfig = {
  id: 'police',
  label: 'Police',
  color: '#ffd400', // yellow
  rendered: false,
  mobile: false,
  model: null,
  lens: null,
  minimap: {
    seesGuard: false,
    seesOtherThiefTrail: false,
  },
};
