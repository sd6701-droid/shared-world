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

No build step, no dependencies. Everything is plain ES modules served
statically.

```bash
cd shared-world
python3 -m http.server 8777        # or: pnpm dev
# open http://localhost:8777/app/
```

| Screen | URL | What it is |
|---|---|---|
| **Stage** | `/app/stage/` | Everything on one screen: the map on top, Goggles' view bottom-left, Cameras' view bottom-right. Runs the game and takes both keyboards. Start here. |
| Map | `/app/map/` | The audience floor plan. **This tab runs the game**, so open it first and keep it open. Both keyboards work here (Goggles WASD, Cameras arrows), so one laptop is enough to play. |
| Goggles | `/app/play/?role=goggles` | Player 1's screen: corridor view, room view, own minimap. WASD or arrows. |
| Cameras | `/app/play/?role=cameras` | Player 2's screen: same, plus the guard on the minimap. |

The three tabs talk over a `BroadcastChannel`, so they must be in the same
browser profile. That stands in for the Socket.IO server until it exists; each
player will then get their own laptop.

Tests: `node --test "server/__tests__/*.test.mjs"` (or `pnpm test`). They need Node 22+.

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
│   ├── map/index.html + map.js     /map       audience map, hosts the game [A]  T1
│   ├── play/index.html + play.js   /play      one player's screen          [B]  T3
│   ├── play/roomSession.js         the world-model seam (see §8)           [B]  T3
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
- **Guard** walks the corridor loop one cell per second with a 3-cell vision
  cone. Caught = back to start, 30 s frozen, carried loot returns to its room.
- Moves are one cell, rate-limited to 4/s per player, between areas only
  through doors.
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
