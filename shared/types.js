// The contract between the game host (server/) and every screen (app/).
// Change this file out loud: announce it to the team before pushing.

export const ROLES = ['goggles', 'cameras'];
export const LABEL = { goggles: 'Thief 1', cameras: 'Thief 2' };

// host -> clients
export const EVENTS = {
  BANNER: 'banner',       // { name, to: 'all' | role, text, color, secs }
  ROOM_ENTER: 'roomEnter', // { name, role, room }
  ROOM_EXIT: 'roomExit',   // { name, role, room }
  GAME_OVER: 'gameOver',   // { name, winner: role | null }
  RESTART: 'restart',      // { name }
};

// clients -> host
export const MESSAGES = {
  MOVE: 'move',       // { type, role, dir: 'N' | 'E' | 'S' | 'W' }
  LOADING: 'loading', // { type, role, loading: boolean }  the player's view is loading: guard can't catch them
  RESTART: 'restart', // { type }
};

/**
 * @typedef {'goggles' | 'cameras'} Role
 * @typedef {[number, number]} Cell  x, y from the top-left of the grid
 *
 * @typedef {Object} Player
 * @property {Cell} cell
 * @property {string | null} room      room id, or null in the corridor
 * @property {number} penaltyUntil     clock value until which the player is frozen at start
 * @property {string[]} carrying       loot ids
 * @property {number} score            loot banked at an exit
 * @property {number} lastMove         clock of the last accepted move
 * @property {boolean} loading         the player's view is loading (guard can't catch them)
 * @property {number} loadingSince     clock when `loading` last changed
 *
 * @typedef {Object} GameState
 * @property {'playing' | 'over'} phase
 * @property {number} clock                      seconds since start
 * @property {Role | null} winner
 * @property {Record<Role, Player>} players
 * @property {Record<string, {state: 'placed' | 'carried' | 'banked', holder: Role | null}>} loot
 * @property {{cell: Cell, routeIndex: number, facing: 'N' | 'E' | 'S' | 'W'}} [guard]  absent in Goggles' view
 */
