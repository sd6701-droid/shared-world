import type { AgentConfig } from './types';

// Cameras — thief. CCTV lens. Minimap also shows the guard + cone and Goggles'
// last corridor cell (§7 rule 7, §8). This asymmetry is the competitive edge.
export const cameras: AgentConfig = {
  id: 'cameras',
  label: 'Thief 2',
  color: '#b0b0b0', // grey
  rendered: true,
  mobile: true,
  model: 'reactor/lingbot-world-2',
  lens: 'security camera footage, black and white, grainy, high corner angle, slight fisheye, timestamp overlay style, first person',
  minimap: {
    seesGuard: true,
    seesOtherThiefTrail: true,
  },
};
