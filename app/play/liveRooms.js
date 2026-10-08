// Places rendered live by the world model. Every other room shows its still
// image. Add a room here to make it live; nothing else changes. The corridor is
// switched on as a whole by LIVE_CORRIDOR: all its parts (corridor.js) share one
// session, and its seed image swaps as the thief moves between parts.
//
// The seed and scene prompt match demo-live/index.html (the tested setup); the
// prompt sent is `${scene}, ${lens}` where lens is the thief's (lenses.js).

export const LIVE_MODEL = 'reactor/lingbot-world-2';
export const SDK_URL = 'https://esm.sh/@reactor-team/js-sdk';

export const LIVE_ROOMS = {
  gallery: {
    seed: '/demo-live/rooms50/angle_05.jpg', // front view of the test room
    scene: 'a closed, windowless room with plain grey walls, a dark wooden floor, a ceiling light panel, and one wooden table with a small white vase in the center, no people',
  },
};

export const LIVE_CORRIDOR = true;
