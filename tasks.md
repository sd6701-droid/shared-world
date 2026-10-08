# Tasks — The Two Thieves (pass 1)

Four people, four lanes. The full spec is in [`CLAUDE.md`](./CLAUDE.md).

## Handoffs at a glance

| When | Who → who | What |
|---|---|---|
| Minute 20 | A → everyone | `shared/types.ts` and `map.json` pushed; everyone pulls |
| Hour 1 | D → B | `/api/token` working |
| Hour 2 | C → A | `server/rules.ts` |
| Hour 2 | C → B | Seed images in `public/rooms/` |
| Hour 2 | D → everyone | One-command dev script |
| Hour 3 | A → B | Running socket |
| Hour 3 on | D → everyone | Checklist runs and honest bug reports; D stops writing features |
| Hourly | Everyone | Branches rebased on `main` |

---

## Person A: server core and map screen

**You own:** `server/index.ts`, `shared/types.ts`, `map.json`, `/map`.

**What you build:** the game server that holds the one true state, and the map
screen the audience watches.

- Socket.IO on port 3001, a 10 Hz tick.
- State broadcast with per-role filtering. Cameras' payload includes the
  guard's position and facing and Goggles' last corridor cell. Goggles'
  payload omits both.
- The map screen draws the floor plan from `map.json` on a canvas:
  - rooms, corridor, exits
  - two labeled dots
  - the guard dot with its three-cell cone
  - locked rooms hatched
  - the compass icon once found
  - the clock
  - a winner overlay

**Done looks like:** two browsers join as different roles, the map shows both
dots moving and the guard patrolling, and state changes from C's rules appear
on the map within one tick.

**First 20 minutes:** write `shared/types.ts` and `map.json` (20 × 12 grid,
6 rooms, 2 exits, 2 starts, guard route, compass room), push, and tell everyone
to pull. **These two files are the contract.** Announce any later change to
them out loud before pushing.

**You need:** C's `rules.ts` at hour 2. Until then, use a stub that only moves
dots.

**Others need from you:** `types.ts` and `map.json` by minute 20; a running
socket by hour 3 for B.

- [ ] `shared/types.ts` + `map.json` pushed (minute 20)
- [ ] Socket.IO server, 10 Hz tick, per-role filtered broadcast
- [ ] `/map` canvas: rooms, corridor, exits, dots, guard + cone, hatched locks, compass, clock, winner overlay
- [ ] Stub rules swapped for C's `rules.ts` (hour 2)
- [ ] Socket ready for B (hour 3)

---

## Person B: room view and model rendering

**You own:** `/play`, the Lingbot session hook, the corridor canvas, the
minimap, banners.

**What you build:** the player's screen.

- **Outside a room:** a top-down corridor view with the player's dot.
- **On `roomEnter`:**
  1. Fetch a JWT from `/api/token`.
  2. Open a Lingbot-World-2 session.
  3. Upload the room's seed image.
  4. Set the lens prompt.
  5. Start.
  6. Attach the stream full-screen behind a "door opening" overlay until the
     first frame.
- Forward WASD and mouse-look using **the exact command names from the schema
  page**.
- **On `roomExit`:** disconnect, tear down, return to the corridor.
- A 200 px minimap bottom-left. Goggles sees only its own dot; Cameras also
  sees the guard and its cone.
- One keyboard hook, so the map move and the room move never disagree.
- A 60 s idle timeout that closes a session with no input.
- On any session error: show the seed image as a still with "signal lost" and
  keep playing.

**Done looks like:** walking into a room opens a stream within 10 s and WASD
moves the view; leaving closes it and the Reactor dashboard shows zero open
sessions.

**Start with:** `shared/fixtures.ts`, a fake state stream that fires
`roomEnter`/`roomExit` every 20 s, so you can test the whole session lifecycle
before the server exists.

**You need:** D's `/api/token` by hour 1; A's socket by hour 3; C's seed images
by hour 2 (use any placeholder image before that).

**Others need from you:** nothing until integration.

- [ ] `shared/fixtures.ts` fake state stream
- [ ] Corridor canvas view
- [ ] Lingbot session hook: JWT → connect → upload → prompt → start → attach
- [ ] WASD + mouse-look forwarded with schema command names
- [ ] Teardown on `roomExit`; 60 s idle timeout
- [ ] "Signal lost" fallback on session error
- [ ] Minimap (role-filtered) and banners
- [ ] Single keyboard hook
- [ ] Switched from fixtures to A's socket (hour 3)

---

## Person C: rules and content

**You own:** `server/rules.ts`, its tests, `scripts/gen-rooms.ts`,
`public/rooms/`, `beats.json`.

**What you build:** two independent things.

**1. The rules** as pure functions over `GameState`, with unit tests:

- movement and locked rooms
- guard patrol, one cell per second
- the vision cone and the catch (teleport to start, 30 s penalty)
- search succeeds only in the compass room after 5 s present
- the 180 s lock of the two rooms nearest the compass
- the 90 s alarm on pickup
- steal-back when both players are in one room
- win on exit, loss at zero

**2. The art:** a script that calls the Gemini image API (model name from
`GEMINI_IMAGE_MODEL`, **never hard-coded**) with one shared style prompt and
generates `public/rooms/<room>.png` for six rooms plus `archive-compass.png`
with a brass compass on a lit pedestal. Expect several iterations per room until
they read as the same museum. Check each image in both lenses.

**Also the text:** the two half-tips, the three banners, six guard lines.

**Done looks like:** `pnpm test` passes on the rules; seven images are committed
and look like one building; A can import `rules.ts` without changing its
interface.

**You need:** `map.json` by minute 20; a Gemini key from D.

**Others need from you:** images by hour 2 for B; `rules.ts` by hour 2 for A.

- [ ] `server/rules.ts` with all rules above
- [ ] Unit tests; `pnpm test` passes
- [ ] `scripts/gen-rooms.ts` (reads `GEMINI_IMAGE_MODEL`)
- [ ] 7 images committed, consistent, checked in both lenses
- [ ] `beats.json`: 2 half-tips, 3 banners, 6 guard lines

---

## Person D: keys, auth, integration and the demo

**You own:** `/settings`, `/api/settings`, `/api/token`, `.env` handling, the
`pnpm dev` script, README, the acceptance checklist, rehearsals, the pitch.

**What you build, in order:**

1. **The JWT route first**, because B is blocked without it. Exchange
   `REACTOR_API_KEY` for a session-scoped token via
   `POST https://api.reactor.inc/tokens`; return only the JWT and model slug.
2. **The settings page:**
   - two fields with set/not-set chips showing the last four characters
   - "Test Reactor key" (mints a JWT) and "Test Gemini key" (one 256 px image)
   - values stored server-side in memory and appended to a git-ignored
     `.env.local`
   - a red banner on `/map` when a key is missing
3. **The dev script** that starts both processes with one command.
4. **From hour 3 you stop writing features:**
   - run the checklist against everyone's branches
   - watch the Reactor dashboard for sessions that never closed
   - time a full round
   - run two rehearsals with people who haven't seen the game

**You present.**

**Done looks like:** a fresh clone runs with one command after visiting
`/settings`; the checklist passes; a stranger can play a round in under
8 minutes with you narrating.

**You need:** the Reactor and Gemini keys; everyone's branches rebased on `main`
hourly.

**Others need from you:** `/api/token` by hour 1; the dev script by hour 2;
honest bug reports from hour 3 on.

- [ ] `/api/token` (hour 1)
- [ ] `/settings` + `/api/settings` + `.env.local` (git-ignored)
- [ ] Red missing-key banner on `/map`
- [ ] `pnpm dev` starts both processes (hour 2)
- [ ] README
- [ ] Checklist run on all branches; dashboard watched for leaked sessions
- [ ] Full round timed; two rehearsals done
- [ ] Pitch
