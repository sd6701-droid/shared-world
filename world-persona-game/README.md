# World + persona

A branching-story game for the Google x Reactor hackathon. A hero walks
through a world generated live, keeps meeting one persona who talks back, and
every choice changes the world on screen. Built on Reactor's own examples:

| Role | Model | Pattern taken from |
| --- | --- | --- |
| The world | `reactor/lingbot-world-2` | cookbook `examples/world-model-arcade` |
| The persona | `reactor/vidu-s2-avatar` | starter `templates/vidu-s2-avatar` |
| Previews and endings | `reactor/h3-reference-to-video-turbo-realtime` | starter `templates/h3-reference-turbo-realtime` |
| The director | Gemini, or a keyword fallback | — |

**The three storylines, their story graphs, the rules they follow and the image
prompts are in [RECIPES.md](./RECIPES.md).**

## Run it

```bash
cp .env.example .env.local      # REACTOR_API_KEY required, GEMINI_API_KEY optional
npm install
# generate the two images for the story you will play (see RECIPES.md)
# and save them in public/scenes/
npm run dev                     # http://localhost:3000
```

Pick a story, press **Start**, walk forward with **W** (or press **E**), and the
persona appears. Click a choice, type, or tick the microphone option and speak.
Walk on to reach the next beat. Press **Stop** when done: connected sessions
bill even when idle. Untick previews on the start screen to run with two
sessions instead of three.

Controls: `W A S D` move · arrows look · `1-3` held actions · `E` approach ·
`P` return the world to its first frame.

## What each part does

- **World (LingBot-World-2).** Starts from the story's hero image with a small
  attention window for stability. Every prompt opens with the story's world
  contract (who the hero is, the camera, the place, what must never change),
  then the still/moving layer, any held action, the persona's spawn sentence,
  and the two latest consequences. A coherence score compares the live frame
  with the first frame every three chunks; it is diagnostic only, and `P`
  restarts from the first frame while keeping the story's consequences.
- **Persona (Vidu-S2-Avatar).** One avatar per story from one portrait, cached
  for 90 days. Each beat starts a fresh call whose persona prompt carries the
  story so far and that beat's choices; she answers typed text (`say`) or the
  microphone with her own voice and replies. After a choice she is told the
  outcome and says one closing line.
- **Previews (H3 Reference Turbo Realtime).** When the persona appears, one
  5-second preview per choice is queued with three references (hero image,
  persona portrait, a frame of the live world) and the six-section prompt from
  Reactor's starter. The chosen one plays; the ending cinematic continues from
  it and plays on its own.
- **Director.** Gemini decides whether the player has clearly committed to one
  of the beat's choices; otherwise whole-word keywords decide.

## Files

```
lib/recipes/            the three storylines (types.ts documents the shape)
lib/prompt.ts           world-contract prompt composition
lib/consistency.ts      frame-signature coherence score (from the arcade)
lib/engine/world.ts     LingBot-World-2: start, keys, actions, jump, audit, first frame
lib/engine/persona.ts   Vidu-S2-Avatar: avatar cache, calls, say, update
lib/engine/futures.ts   H3 Reference: references, six-section prompts, previews, endings
lib/director.ts         keyword matcher + client call
app/api/director        Gemini branch picker
app/api/reactor/token   one scoped JWT for all three models
components/Game.tsx     the story loop and the screen
```

Add a story: copy a file in `lib/recipes/`, register it in
`lib/recipes/index.ts`, add its two images. Follow the rules table at the top
of RECIPES.md.

## Check early

- Your promo credits allow three sessions at once (or untick previews).
- The persona call goes live a few seconds after the encounter starts.
- Previews arrive before the player chooses; if not, the chosen one plays when
  ready (click it), or turn previews off.
- `GEMINI_MODEL` defaults to `gemini-2.5-flash`; set it to a model your key has.
