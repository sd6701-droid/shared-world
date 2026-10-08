// The corridor, split into places by the map grid, so each part gets its own
// image (corridor/corridor_N.jpg) and, for the long halls, its own live
// world-model session (see liveRooms.js).
//
//   corridor-north / corridor-south  the long horizontal halls (corners included)
//   corridor-west  / corridor-east   the short vertical links between them
//
// Worked out from map.json's grid, so a map edit moves the parts with it.

export const CORRIDOR_PLACES = {
  'corridor-north': { label: 'North corridor', image: '/corridor/corridor_1.jpg' },
  'corridor-south': { label: 'South corridor', image: '/corridor/corridor_4.jpg' },
  'corridor-west':  { label: 'West corridor',  image: '/corridor/corridor_3.jpg' },
  'corridor-east':  { label: 'East corridor',  image: '/corridor/corridor_2.jpg' },
};

/** The scene prompt for the corridor images; matches demo-live/index.html (the tested setup). */
export const CORRIDOR_SCENE = 'a long, narrow indoor corridor with plain dark grey walls, closed dark doors set into both walls, a row of square light panels along the ceiling, and a dark wooden floor with small tan markers, no windows, no people, the doors stay closed';

const HALL_MIN = 3; // a horizontal run of at least this many corridor cells is a hall

const isCorridor = (map, x, y) => map.grid[y]?.[x] === '.';

/** The run of corridor cells through [x, y] along one axis: [from, to], inclusive. */
function run(map, x, y, dx, dy) {
  let a = 0, b = 0;
  while (isCorridor(map, x - (a + 1) * dx, y - (a + 1) * dy)) a++;
  while (isCorridor(map, x + (b + 1) * dx, y + (b + 1) * dy)) b++;
  return dx ? [x - a, x + b] : [y - a, y + b];
}

/** Which corridor place a cell is in, or null if the cell is not corridor. */
export function corridorPlace(map, [x, y]) {
  if (!isCorridor(map, x, y)) return null;
  const [x0, x1] = run(map, x, y, 1, 0);
  if (x1 - x0 + 1 >= HALL_MIN) return y < map.height / 2 ? 'corridor-north' : 'corridor-south';
  return x < map.width / 2 ? 'corridor-west' : 'corridor-east';
}

/**
 * Which way the camera faces on entering a corridor place at this cell: down
 * the hall (or link) toward its far end, so the long view in the image is ahead.
 */
export function corridorFacing(map, [x, y]) {
  if (!isCorridor(map, x, y)) return 'N';
  const [x0, x1] = run(map, x, y, 1, 0);
  if (x1 - x0 + 1 >= HALL_MIN) return x - x0 <= x1 - x ? 'E' : 'W';
  const [y0, y1] = run(map, x, y, 0, 1);
  return y - y0 <= y1 - y ? 'S' : 'N';
}
