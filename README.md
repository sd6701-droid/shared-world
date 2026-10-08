# The Two Thieves

A two-player, competitive museum heist. Goggles and Cameras race to find a brass
compass and get it out before time runs out, while a scripted guard patrols the
floor. The game server is the only source of truth, and Lingbot-World-2 (via
Reactor) only renders what each player sees inside a room.

- **Full spec:** [`CLAUDE.md`](./CLAUDE.md)
- **Who builds what:** [`tasks.md`](./tasks.md), with flowcharts in [`plan/`](./plan/)
- **This file:** how the repo is laid out, who owns each folder, and the rules
  that keep four people's work consistent.

> **Status:** folder skeleton only. No code has been written yet. Folders are
> held in git with empty `.gitkeep` files; delete a folder's `.gitkeep` when its
> first real file lands.

---

## 1. Five rules that keep everyone consistent

1. **Edit only what you own.** Every folder and file below has one owner. If you
   need a change in someone else's file, ask them. Don't edit it yourself.
2. **The contract changes out loud.** `shared/types.ts`, `map.json` and
   `beats.json` are the contract between tasks. Announce any change to them to
   the whole team **before** pushing, then push it as its own small commit.
3. **Rules live in one place.** Every game rule is in `server/rules.ts`. No page,
   hook or component decides a game outcome. They render the `state` they
   receive.
4. **Follow the import boundaries** (§5). The server never imports from the app,
   the app never imports from the server, and both talk only through
   `shared/` and the socket.
5. **Use the shared names** (§6): the same room ids, event names, ports and env
   vars everywhere. Don't invent near-duplicates.

---

## 2. Folder tree

Legend: **[A]**/**[B]**/**[C]**/**[D]** = owner, **T1**/**T2**/**T3**/**S** =
task from `tasks.md` (S = supporting lane). Files marked *(planned)* don't exist
yet. Only the folders exist.

```
/                                   repo root (branch two-theives)
├── README.md                       this file                                   [D]  S
├── CLAUDE.md                       full build spec                             [D]  S
├── tasks.md                        the three tasks + supporting lane           [D]  S
├── plan/                           task flowcharts (images)                    [D]  S
│   ├── 1-map-and-rules.png
│   ├── 2-room-contents.png
│   └── 3-agent-view-rendering.png
│
├── map.json             (planned)  THE floor: grid, rooms, exits, guard route  [A]  T1  ← contract
├── beats.json           (planned)  tips, banners, guard lines                  [C]  T2  ← contract
├── .env.example                    every env var, no values                    [D]  S
├── .env.local           (ignored)  real keys; never committed                  —
├── .gitignore                                                                  [D]  S
├── package.json         (planned)  scripts: dev, test, gen:rooms               [D]  S
│
├── shared/                         the contract between server and app
│   ├── types.ts         (planned)  GameState, Role, event names + payloads     [A]  T1  ← contract
│   ├── map.ts           (planned)  load map.json, cell → room, walkable cell   [A]  T1
│   └── fixtures.ts      (planned)  fake state stream (roomEnter/Exit / 20 s)   [B]  T3
│
├── server/                         the game server: Node + Socket.IO, :3001
│   ├── index.ts         (planned)  socket wiring, 10 Hz tick, role filtering   [A]  T1
│   ├── bot.ts           (planned)  bot client that joins and moves             [A]  T1
│   ├── rules.ts         (planned)  ALL game rules, pure functions              [C]  T1
│   └── __tests__/
│       └── rules.test.ts (planned) unit tests for every rule                   [C]  T1
│
├── app/                            the Next.js app, :3000 (App Router)
│   ├── layout.tsx       (planned)  from the scaffold                           [D]  S
│   ├── page.tsx         (planned)  /  role picker + key-status banner          [D]  S
│   ├── map/                        /map  audience screen                       [A]  T1
│   │   ├── page.tsx     (planned)
│   │   └── _components/            map canvas, winner overlay
│   ├── play/                       /play?role=goggles|cameras                  [B]  T3
│   │   ├── page.tsx     (planned)
│   │   ├── lenses.ts    (planned)  the two lens prompts
│   │   ├── _components/            corridor canvas, room video, minimap
│   │   └── _hooks/                 useRoomSession (Lingbot), useControls (keys)
│   ├── settings/                   /settings  key form + test buttons          [D]  S
│   │   └── page.tsx     (planned)
│   └── api/
│       ├── token/route.ts    (planned)  mint Reactor JWT                       [D]  S
│       └── settings/route.ts (planned)  read/write keys                        [D]  S
│
├── components/                     UI used by more than one page
│   └── Banner.tsx       (planned)  3 s banner overlay (/map and /play)         [B]  T3
│
├── lib/                            client + server helpers used by >1 owner
│   ├── gameClient.ts    (planned)  ONE socket.io-client connection + useGameState  [A]  T1
│   ├── floorCanvas.ts   (planned)  draws the grid; used by /map and /play      [A]  T1
│   └── keys.ts          (planned)  server-only key store (.env.local + memory) [D]  S
│
├── public/
│   └── rooms/                      seed images (committed)                     [C]  T2
│       ├── lobby.png … dock.png   (planned) 6 rooms
│       └── archive-compass.png    (planned) compass variant
│
└── scripts/
    └── gen-rooms.ts     (planned)  Nano Banana seed-image generator            [C]  T2
```

---

## 3. What each folder is for

### Root data files: `map.json`, `beats.json`

Data, not code. Both the server and the app read them, so they are part of the
contract.

- **`map.json`** (A): the 20 × 12 grid, 6 rooms, doors, 2 exits, 2 start cells,
  the guard route, and `compassRoom`. Also each room's seed-image prompt, which
  `scripts/gen-rooms.ts` reads. Shape: `CLAUDE.md` §6.
- **`beats.json`** (C): every line of game text. That's the two half-tips, the
  three banners (leak, lockdown, alarm) and six guard lines. Code refers to text
  by key and never hard-codes the sentence, so C can rewrite copy without
  touching anyone's code.

### `shared/`: the contract

The only folder **both** `server/` and `app/` may import from. Keep it small and
free of side effects (no sockets, no timers, no React, no Node-only APIs) so it
works in both places.

- **`types.ts`** (A): `GameState`, `Role`, cell and direction types, and the
  **socket event names and payload types** for both directions. If an event isn't
  declared here, it doesn't exist.
- **`map.ts`** (A): reads `map.json` and answers grid questions: which room is
  this cell in, is it walkable, where are the exits. The server, the map screen
  and the minimap all use it, so they can never disagree about the floor.
- **`fixtures.ts`** (B): a fake state stream that emits `roomEnter`/`roomExit`
  every 20 s, shaped exactly like the real one. B builds Task 3 against it before
  the server exists, and anyone can use it for UI work later.

### `server/`: the game server (Task 1)

A plain Node process (Socket.IO on port 3001). Not part of Next.js.

- **`index.ts`** (A): accepts connections, handles `join`/`move`/`search`/`grab`,
  runs the 10 Hz tick, and sends each recipient its **role-filtered** state.
  It calls into `rules.ts` and has no rule logic of its own.
- **`bot.ts`** (A): a scripted client that joins and walks around, so the server
  and map screen can be tested without two humans.
- **`rules.ts`** (C): every rule as a pure function over `GameState`: movement,
  locks, guard patrol, vision cone, catch, search, lockdown, alarm, steal-back,
  win/lose. Pure means no sockets, no `setInterval`, no `Date.now()` and no
  `Math.random()`; time comes in as an argument. Until it lands, A uses a stub
  with the **same exported function signatures**.
- **`__tests__/rules.test.ts`** (C): one test (or more) per rule, driving the
  functions directly with a fake clock. `pnpm test` runs these.

### `app/`: the Next.js app

One folder per route. Each route's private pieces sit next to it in
underscore folders (`_components/`, `_hooks/`), which Next.js doesn't turn into
routes. Owners rarely touch the same folder, so merge conflicts stay rare.

- **`/` → `page.tsx`** (D): role picker (Goggles, Cameras, Map) and the
  key-status banner linking to `/settings`.
- **`/map` → `map/`** (A): the audience screen. Floor plan, both dots, guard dot
  with cone, hatched locked rooms, compass icon, clock, winner overlay, and the
  red missing-key banner.
- **`/play` → `play/`** (B): the player screen.
  - `_components/`: the corridor canvas, the full-screen room video with the
    "door opening" and "signal lost" overlays, and the 200 px minimap.
  - `_hooks/useRoomSession.ts`: the **only** file that imports the Reactor SDK.
    Opens a Lingbot-World-2 session on `roomEnter` and closes it on `roomExit`,
    on idle timeout, on error and on unload.
  - `_hooks/useControls.ts`: the **single** keyboard hook. One keypress becomes
    the socket `move` **and** the room-session move, so the two never disagree.
  - `lenses.ts`: the Goggles and Cameras lens prompts.
- **`/settings` → `settings/`** (D): the key form, set/not-set chips, and the two
  test buttons.
- **`api/token/`** (D): exchanges `REACTOR_API_KEY` for a session JWT. Returns
  the JWT and model slug only.
- **`api/settings/`** (D): reads and writes keys through `lib/keys.ts`. Never
  returns a full key, only set/not-set and the last four characters.

### `components/`: shared UI

UI that more than one page uses. It starts with only `Banner.tsx` (B), the 3 s
colored overlay that both `/play` and `/map` show. If something is used by one
page only, keep it in that page's `_components/`.

### `lib/`: shared helpers

- **`gameClient.ts`** (A): the one place that creates the `socket.io-client`
  connection and exposes the latest `state`. Both `/map` and `/play` use it.
  Reads `NEXT_PUBLIC_GAME_SERVER_URL`.
- **`floorCanvas.ts`** (A): draws the grid from `shared/map.ts` onto a canvas.
  The map screen, the corridor view and the minimap all use it, so the floor
  looks and is oriented the same everywhere.
- **`keys.ts`** (D): **server-only.** Holds the keys in memory, writes
  `.env.local`. Only `app/api/*` may import it. Never import it from a client
  component or a page.

### `public/rooms/`: seed images (Task 2)

Seven committed PNGs, generated by `scripts/gen-rooms.ts` and reviewed in both
lenses. File names must match the room ids in `map.json` exactly (§6).

### `scripts/`: one-off tools

- **`gen-rooms.ts`** (C): reads rooms from `map.json`, calls the Gemini image API
  with the model from `GEMINI_IMAGE_MODEL`, and writes to `public/rooms/`. Skips
  existing images unless `--force` is passed. Run with `pnpm gen:rooms`.

### `plan/`: planning images

The three task flowcharts referenced from `tasks.md`. Docs only. Nothing
imports them.

---

## 4. Ownership

| Owner | Task | Owns |
|---|---|---|
| **A** | T1 Map and rules (server lane) | `map.json`, `shared/types.ts`, `shared/map.ts`, `server/index.ts`, `server/bot.ts`, `app/map/`, `lib/gameClient.ts`, `lib/floorCanvas.ts` |
| **B** | T3 Agent view rendering | `shared/fixtures.ts`, `app/play/`, `components/Banner.tsx` |
| **C** | T1 rules lane + T2 Room contents | `server/rules.ts`, `server/__tests__/`, `beats.json`, `scripts/gen-rooms.ts`, `public/rooms/` |
| **D** | Supporting lane | root config (`package.json`, `.gitignore`, `.env.example`, scaffold files), `app/layout.tsx`, `app/page.tsx`, `app/settings/`, `app/api/`, `lib/keys.ts`, docs (`README.md`, `CLAUDE.md`, `tasks.md`, `plan/`) |

New file? Put it in a folder you own. If it belongs in someone else's folder,
ask them first.

---

## 5. Import boundaries

```
             map.json   beats.json
                 │          │
                 ▼          ▼
              ┌──────────────────┐
              │     shared/      │  types, map helpers, fixtures
              └───┬──────────┬───┘
                  │          │
        ┌─────────▼───┐  ┌───▼──────────────────────────┐
        │  server/    │  │  app/  components/  lib/      │
        │  index.ts ──┼──┼─► (socket only, no imports)   │
        │  rules.ts   │  │                               │
        └─────────────┘  └───────────────────────────────┘
```

| From | May import | Must NOT import |
|---|---|---|
| `server/rules.ts` | `shared/`, `map.json`, `beats.json` | `socket.io`, anything in `app/`, `lib/`, `components/` |
| `server/index.ts`, `server/bot.ts` | `server/rules.ts`, `shared/`, JSON files, `socket.io` | `app/`, `lib/`, `components/` |
| `app/`, `components/` | `shared/`, `lib/`, `components/`, JSON files | `server/` |
| `app/api/*` | `lib/keys.ts`, `shared/` | `server/` |
| client components and pages | everything above **except** `lib/keys.ts` | `lib/keys.ts`, `server/` |
| `shared/` | JSON files only | everything else |

Two extra limits:
- **The Reactor SDK** is imported in exactly one file:
  `app/play/_hooks/useRoomSession.ts`.
- **API keys** are read from the environment in exactly one file:
  `lib/keys.ts`.

---

## 6. Shared names

Use these exact strings everywhere: code, file names, `map.json`, tests.

### Roles

`goggles`, `cameras` (lowercase). Map dot colors: Goggles **green**, Cameras
**grey**, guard **yellow**.

### Room ids → seed images

| Room id | Label | Image |
|---|---|---|
| `lobby` | Lobby (Exit A) | `public/rooms/lobby.png` |
| `maritime` | Maritime Hall | `public/rooms/maritime.png` |
| `antiquities` | Antiquities | `public/rooms/antiquities.png` |
| `archive` | Archive (compass room) | `public/rooms/archive.png`, `public/rooms/archive-compass.png` |
| `gallery` | Gallery | `public/rooms/gallery.png` |
| `dock` | Loading Dock (Exit B) | `public/rooms/dock.png` |

### Socket events (declared in `shared/types.ts`)

| Direction | Event |
|---|---|
| client → server | `join`, `move`, `search`, `grab` |
| server → client | `state`, `banner`, `roomEnter`, `roomExit`, `gameOver` |

### Ports and URLs

| What | Where |
|---|---|
| Next.js app | `http://localhost:3000` |
| Game server | `http://localhost:3001` (on the day: the host laptop's LAN IP) |
| Reactor tokens | `POST https://api.reactor.inc/tokens` (server-side only) |

### Environment variables (listed in `.env.example`)

| Variable | Used by | Notes |
|---|---|---|
| `REACTOR_API_KEY` | `lib/keys.ts` → `app/api/token` | Never sent to the browser |
| `GEMINI_API_KEY` | `lib/keys.ts`, `scripts/gen-rooms.ts` | Never sent to the browser |
| `GEMINI_IMAGE_MODEL` | `scripts/gen-rooms.ts` | Never hard-code the model id |
| `NEXT_PUBLIC_GAME_SERVER_URL` | `lib/gameClient.ts` | Default `http://localhost:3001` |

### Commands (D wires these into `package.json`)

| Command | Does |
|---|---|
| `pnpm dev` | Starts the Next.js app **and** the game server with one command |
| `pnpm test` | Runs `server/__tests__/` |
| `pnpm gen:rooms` | Runs `scripts/gen-rooms.ts` |

Use **pnpm** only. Don't commit a `package-lock.json` or `yarn.lock`.

---

## 7. Branches and workflow

- **`two-theives`** is the integration branch for this project. (The `main`
  branch is the older Shared World demo.) Where `tasks.md` says `main`, read
  `two-theives`.
- Each person works on a short-lived branch off `two-theives`:

  | Branch | Who |
  |---|---|
  | `t1/server` | A |
  | `t1/rules` | C |
  | `t2/content` | C |
  | `t3/play` | B |
  | `s/keys-and-demo` | D |

- **Rebase on `two-theives` every hour**, and merge back as soon as your piece
  works, rather than at the end.
- **Contract changes** (`shared/types.ts`, `map.json`, `beats.json`): announce
  them, then push them in a commit of their own so others can pull just that.
- **Never commit** `.env.local` or any key. `.gitignore` already blocks it. Check
  `git status` before every commit anyway.

---

## 8. Scaffolding (D, first step)

The Next.js app is generated with:

```bash
npx create-reactor-app two-thieves --model=lingbot-world-2
```

That creates its own `two-thieves/` folder. Generate it somewhere temporary and
move its contents into this repo root, so the scaffold's `package.json`,
config files and `app/` merge into the skeleton above. Keep this README's
layout. If the scaffold puts the app under `src/` (`src/app/`, `src/lib/`), move
it to the root layout above, or update this README and tell everyone before
anyone writes code. The layout must be decided **once**, before work starts.
