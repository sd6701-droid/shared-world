# Agent registry

The list of participants on the floor and **how each one is rendered**. This is
Task 3 (agent view rendering) and is **client-side only** — rendering concerns,
not rules. Authoritative position, movement, catches and win/lose live in the
server (`server/`) and the map (`map.json`); never duplicate them here.

## Pass 1 agents

| Agent | Kind | Rendered view | Mobile | Minimap sees guard |
|---|---|---|---|---|
| `goggles` | thief | Lingbot-World-2, green night-vision lens | yes | no |
| `cameras` | thief | Lingbot-World-2, B&W CCTV lens | yes | yes (+ Goggles' trail) |
| `police` | NPC | none (stationary dot) | no | — |

## Rendering pipeline (for `rendered: true` agents)

```
Nano Banana seed image (public/rooms/<room>.png, pre-generated)
      → Lingbot-World-2 session (seed image + agent.lens prompt)
      → that agent's first-person world-model view
```

Police has no seed image and no session in pass 1.

## Adding / promoting an agent

- **One new file** (`lib/agents/<id>.ts`) exporting an `AgentConfig`, plus one
  line in `index.ts`. The play screen reads the registry, so nothing else changes.
- **To promote police to a rendered agent:** flip `rendered`/`mobile` to `true`,
  set `model` + a `lens` prompt, add its seed image(s), and give the server a
  patrol route in `map.json`. See the comment in `police.ts`.

## Rule

An agent config describes only what the screen draws. If you find yourself
wanting to put a game rule here (a catch, a win condition, who holds the
compass), it belongs in the server instead.
