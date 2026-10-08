// Places rendered live by the world model: rooms, and the two long corridor
// halls (corridor.js). Every other place shows its still image. Add a place
// here to make it live; nothing else changes.
//
// The seed and scene prompt match demo-live/index.html (the tested setup); the
// prompt sent is `${scene}, ${lens}` where lens is the thief's (lenses.js).

import { CORRIDOR_PLACES, CORRIDOR_SCENE } from './corridor.js';

export const LIVE_MODEL = 'reactor/lingbot-world-2';
export const SDK_URL = 'https://esm.sh/@reactor-team/js-sdk';

export const LIVE_ROOMS = {
  gallery: {
    seed: '/demo-live/rooms50/angle_05.jpg', // front view of the test room
    scene: 'a closed, windowless room with plain grey walls, a dark wooden floor, a ceiling light panel, and one wooden table with a small white vase in the center, no people',
  },
  // the short west/east links stay still images: a thief crosses them in under a second
  'corridor-north': { seed: CORRIDOR_PLACES['corridor-north'].image, scene: CORRIDOR_SCENE },
  'corridor-south': { seed: CORRIDOR_PLACES['corridor-south'].image, scene: CORRIDOR_SCENE },
};
