import type { AgentConfig } from './types';

// Goggles — thief. Night-vision lens. Minimap shows only its own dot (§8).
export const goggles: AgentConfig = {
  id: 'goggles',
  label: 'Thief 1',
  color: '#3ddc84', // green
  rendered: true,
  mobile: true,
  model: 'reactor/lingbot-world-2',
  lens: 'night-vision goggles view, monochrome green, bright center, dark vignette edges, slight grain, first person',
  minimap: {
    seesGuard: false,
    seesOtherThiefTrail: false,
  },
};
