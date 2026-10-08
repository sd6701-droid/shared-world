# The Two Thieves

A two-player, competitive museum heist on one floor. Goggles and Cameras race
to grab three objects and get them out through an exit, while a scripted guard
patrols. The game host is the only source of truth; the world model
(Lingbot-World-2 via Reactor) only renders what each player sees inside a room.

- **Full spec:** [`CLAUDE.md`](./CLAUDE.md) (note: it still describes the older
  compass / lockdown / alarm round; the rules as built are in §4 below)
- **Who builds what:** [`tasks.md`](./tasks.md), flowcharts in [`plan/`](./plan/)
- **This file:** how to run it, how the repo is laid out, who owns what, and
  where the world model plugs in.

## 1. Run it

No build step, no npm install. Needs Node 18+ and, for live rooms,
`REACTOR_API_KEY` in `.env.local`.

```bash
cd shared-world
node server/dev.mjs                # or: npm run dev
# open http://localhost:8777/app/stage/
```

`server/dev.mjs` serves the game and mints Reactor session tokens at
`POST /api/token`, so the key never reaches the browser. It listens on
localhost only and never serves dotfiles. (`python3 -m http.server` still runs
the game, but live rooms then fall back to their still image.)

| Screen | URL | What it is |
|---|---|---|
| **Stage** | `/app/stage/` | Everything on one screen: the map on top, Thief 1's view bottom-left, Thief 2's view bottom-right. Runs the game and takes both keyboards. Start here. |
| Map | `/app/map/` | The audience floor plan on its own. **This tab runs the game**, so open it first and keep it open. Both keyboards work here. |
| Thief 1 | `/app/play/?role=goggles` | One player's screen: room view plus own minimap. |
| Thief 2 | `/app/play/?role=cameras` | Same, plus the guard on the minimap. |

The map and play tabs talk over a `BroadcastChannel`, so they must be in the
same browser profile until the Socket.IO server exists.

### Live rooms (world model)

Rooms listed in `app/play/liveRooms.js` stream Lingbot-World-2 when a thief
walks in; every other place shows its still image. Today only the **Gallery**
is live, seeded with `demo-live/rooms50/angle_05.jpg` (the tested room from
`./world.sh live`). Inside a live room the thief's movement keys drive the
camera (forward/back/strafe) while still moving their dot on the map. The
session closes when they leave, after 60 s idle, on restart and when the tab
closes. **Sessions bill per second while open.**

Tests: `node --test "server/__tests__/*.test.mjs"` (or `npm test`). They need Node 22+.

## 2. Five rules that keep everyone consistent

1. **Edit only what you own** (§5). If you need a change in someone else's
   file, ask them.
2. **The contract changes out loud.** `shared/types.js`, `shared/map.js` and
   `map.json` are the contract between tasks. Announce any change to them to
   the whole team **before** pushing, in a commit of its own.
3. **Rules live in one place:** `server/rules.js`. No page or helper decides a
   game outcome. Screens render the state they receive.
4. **Follow the import boundaries** (§6).
5. **Use the shared names** (§7): room ids, loot ids, event names, env vars.

## 3. Folder tree

Legend: **[A]**/**[B]**/**[C]**/**[D]** = owner, **T1**/**T2**/**T3**/**S** =
task from `tasks.md` (S = supporting lane). *(planned)* = not written yet.

```
/                                   repo root (branch two-theives)
├── README.md, CLAUDE.md, tasks.md, plan/    docs                           [D]  S
├── package.json                    "type": "module", dev + test scripts    [D]  S
├── map.json                        THE floor: grid, rooms, doors, exits,
│                                   starts, loot, guard route, prompts      [A]  T1  ← contract
├── .env.example                    every env var, no values                [D]  S
├── .gitignore                      blocks .env.local                       [D]  S
│
├── shared/                         the contract: both server/ and app/ import it
│   ├── types.js                    ROLES, event + message names, GameState typedef   [A] T1 ← contract
│   ├── map.js                      loadMap / indexMap: rooms, doors, canStep, coneCells  [A] T1
│   └── fixtures.js      (planned)  fake state stream for UI work           [B]  T3
│
├── server/                         the game host
│   ├── rules.js                    ALL rules, pure functions, return events        [C]  T1
│   ├── local.js                    in-browser host: 10 Hz tick + BroadcastChannel  [A]  T1
│   ├── dev.mjs                     dev server: static files + /api/token (reads the key)  [D] S
│   ├── index.ts         (planned)  the real Node + Socket.IO server (replaces local.js)  [A] T1
│   └── __tests__/rules.test.mjs    node:test suite for every rule          [C]  T1
│
├── lib/                            helpers used by more than one screen
│   ├── gameClient.js               the ONE connection to the host (onState / onEvent / move)  [A] T1
│   ├── floorCanvas.js              draws the floor + state; map, corridor and minimap  [A] T1
│   └── keys.js          (planned)  server-only key store                   [D]  S
│
├── app/                            the screens (static pages now, Next.js routes later)
│   ├── index.html                  /          screen picker                [D]  S
│   ├── styles.css                  shared styles                           [D]  S
│   ├── stage/index.html + stage.js /stage     map + both views on one screen, hosts the game  [A] T1
│   ├── map/index.html + map.js     /map       audience map, hosts the game [A]  T1
│   ├── play/index.html + play.js   /play      one player's screen          [B]  T3
│   ├── play/roomSession.js         room view + live Lingbot sessions (§8)  [B]  T3
│   ├── play/liveRooms.js           which rooms stream live, seed + scene   [B]  T3
│   ├── play/lenses.js              the two lens prompts                    [B]  T3
│   ├── settings/        (planned)  /settings  key form + test buttons      [D]  S
│   └── api/token, api/settings (planned)  Reactor JWT, key storage         [D]  S
│
├── public/rooms/                   seed images, one per room (none yet)    [C]  T2
└── scripts/gen-rooms.ts (planned)  Nano Banana seed-image generator        [C]  T2
```

## 4. The game as built

- 20 × 12 grid, 6 rooms around a corridor loop, a door per room, exits in
  the Lobby (A) and the Loading Dock (B), starts next to each exit.
- **Three objects** (`map.json` → `loot`): oil painting (Gallery), brass
  compass (Archive), Greek amphora (Antiquities). Walk onto one to pick it
  up; you can carry several.
- **Exits bank** what you carry: +1 per object. Keep playing.
- **Game over** when all three are banked; higher score wins (3 objects, so
  no draws).
- **Guard** walks the corridor loop slowly, one cell every 3 s (2 min a lap),
  with a 3-cell vision cone. Caught = back to start, 3 s frozen, carried loot
  returns to its room.
- **Loading shield:** while a thief's view is loading (entering a room or the
  corridor; later, until the world-model stream shows its first frame) the
  guard can't catch them. The screen reports it with a `loading` message;
  the shield lasts at most 10 s so a stuck or closed tab can't hide forever.
- Moves are one cell, rate-limited to 4/s per player, between areas only
  through doors.
- **One thief per room:** you can't walk into a room the other thief is in;
  you're stopped at the door and told why. (Being sent home after a catch is
  exempt, since the other thief may be banking in your start room.)
- **Room view:** every room shows `public/rooms/default.png` until it has its
  own `public/rooms/<roomId>.png`.
- **Role filtering** (`viewFor`): Goggles' state has no guard; Cameras and
  the map see everything.

## 5. Ownership

| Owner | Task | Owns |
|---|---|---|
| **A** | T1 map + host | `map.json`, `shared/types.js`, `shared/map.js`, `server/local.js` → `server/index.ts`, `app/map/`, `lib/gameClient.js`, `lib/floorCanvas.js` |
| **B** | T3 player screen + world model | `shared/fixtures.js`, `app/play/` (incl. `roomSession.js`, `lenses.js`) |
| **C** | T1 rules + T2 content | `server/rules.js`, `server/__tests__/`, `scripts/gen-rooms.ts`, `public/rooms/`, loot prompts in `map.json` |
| **D** | Supporting lane | `package.json`, `.gitignore`, `.env.example`, `app/index.html`, `app/styles.css`, `app/settings/`, `app/api/`, `lib/keys.js`, docs |

## 6. Import boundaries

| From | May import | Must NOT import |
|---|---|---|
| `server/rules.js` | `shared/` | anything in `app/`, `lib/`, the DOM, timers |
| `server/local.js` / `index.ts` | `server/rules.js`, `shared/` | `app/`, `lib/` |
| `app/*`, `lib/*` | `shared/`, `lib/`, `server/rules.js` (read-only: `viewFor`, constants) | `server/local.js` except from `app/map/` |
| `shared/` | nothing | everything |

Two hard limits:
- **The Reactor SDK** is imported in exactly one file: `app/play/roomSession.js`.
- **API keys** are read in exactly one file: `lib/keys.js` (server-side only).

## 7. Shared names

- Roles: `goggles`, `cameras`. Map colors: green, grey; guard yellow.
- Room ids: `lobby`, `gallery`, `maritime`, `antiquities`, `archive`, `dock`.
  Seed images: `public/rooms/<roomId>.png`.
- Loot ids: `painting`, `compass`, `amphora` (each has a `prompt` for its
  seed-image variant).
- Events host → client: `banner`, `roomEnter`, `roomExit`, `gameOver`,
  `restart`. Messages client → host: `move`, `restart`. Declared in
  `shared/types.js`.
- Ports: app 3000 (Next.js, later), game server 3001 (later), static dev 8777.
- Env vars (`.env.example`): `REACTOR_API_KEY`, `GEMINI_API_KEY`,
  `GEMINI_IMAGE_MODEL`, `NEXT_PUBLIC_GAME_SERVER_URL`.

## 8. Where the world model plugs in

`app/play/roomSession.js` is the whole seam. `play.js` calls:

| Call | When | Today | With Lingbot-World-2 |
|---|---|---|---|
| `enter(roomId)` | the player's `room` changes to a room | shows `public/rooms/<room>.png` (or a card with the room prompt) behind a "door opening" overlay, lens as a CSS filter | fetch a JWT, connect, upload the seed image, `set_image`, `set_prompt` (lens), `start`, attach `main_video` |
| `input(dir)` | every move key while in a room | resets the idle timer | forward WASD / look with the schema's command names |
| `exit()` | the room becomes `null`, restart, tab hidden/closed | clears the view | `disconnect()`; must run on every path (sessions bill per second) |
| idle 60 s | no input | shows "idle" | close the session, keep the still |

Each `TODO(reactor)` in that file is one step of CLAUDE.md §9. Read
`docs.reactor.inc/model-api-reference/lingbot-world-2/schema.md` before writing
any of it; never guess command names. Keys never reach the browser: the JWT
comes from `app/api/token` (planned, D).

## 9. What replaces what, later

| Now | Later | Carries over unchanged |
|---|---|---|
| `server/local.js` (BroadcastChannel, in the map tab) | `server/index.ts` (Node + Socket.IO, port 3001) | `server/rules.js`, `shared/` |
| `lib/gameClient.js` on BroadcastChannel | same API on `socket.io-client` | every screen |
| static `app/*.html` | Next.js routes (`page.tsx`) from `create-reactor-app` | `lib/floorCanvas.js`, `roomSession.js` logic |
| `python3 -m http.server` | `pnpm dev` starting both processes | tests |

## 10. Branches and workflow

- `two-theives` is the integration branch (`main` is the older Shared World demo).
- One short-lived branch per person (`t1/server`, `t1/rules`, `t2/content`,
  `t3/play`, `s/keys-and-demo`); rebase on `two-theives` hourly; merge as soon
  as a piece works.
- Contract changes: announce, then push in their own commit.
- Never commit `.env.local` or any key.
