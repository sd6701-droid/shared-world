# Story recipes

Three branching storylines for the game: a hero explores a world generated
live by **LingBot-World-2**, keeps meeting one persona played by
**Vidu-S2-Avatar**, and every choice changes the world live. **H3 Reference
Turbo Realtime** previews each choice and renders the ending. The recipes live
in `lib/recipes/` and this file is generated from them.

## The rules every recipe follows, and why

| Rule | Model constraint behind it |
| --- | --- |
| **One place per story.** Consequences are weather, light, time of day and new figures in the same location; never "the hero walks into a new place". | LingBot-World-2 starts from one image, ignores new images until a full reset, and periodically refreshes its context back toward that image. Asking it to change location fights the model. |
| **Every consequence is one present-tense sentence about the environment.** | LingBot takes changes as prompt swaps on the next chunk. Reactor's starter guidance: event clauses describe the world, not the hero, so they never contradict the base prompt. |
| **The world contract leads every prompt** (immutable subject, camera, environment, continuity rules). | The pattern from Reactor's World Model Arcade for keeping the hero, camera and landmarks stable over a long session. |
| **One persona per story, one portrait, reused every beat.** She reappears in a new spot each beat but is the same avatar. | Vidu-S2-Avatar builds an avatar from one image of one person, half or full body, facing the camera. The avatar is cached for 90 days, so later runs start faster. |
| **The persona is always front-facing in a small, well-lit spot** (shrine steps, a campfire, a doorway, behind a boulder). | That is the avatar's best case, and the spawn sentence in the world matches the portrait. |
| **Short beats.** Each conversation is one decision; the call ends when the player walks on. | Vidu S2's published stability test covers 10–90 seconds; staying inside it keeps the face steady. A connected session also bills while idle. |
| **Fixed branches, two or three per beat; the persona improvises the words.** | Every consequence is then a prompt already tuned for LingBot, and its preview can render before the player decides. The persona's own LLM keeps the dialogue fresh within the branch. |
| **Previews reference the hero, the persona and the live world.** | H3 Reference takes up to nine reference images and keeps the subjects in them on-model, which a single starting frame cannot. |
| **Endings chain from the chosen preview.** | `continue_from_clip_id` carries motion, camera and audio over, so the ending flows out of the vision the player chose. |

## Storylines we rejected, and why

- **A crowded market or a battle.** Many moving figures are where generated
  worlds drift, and the avatar is one character from one photo, so no group
  dialogue.
- **A neon city.** It looks good, but traffic and crowds add clutter; the
  lighthouse gives the same drama in an empty place.
- **A talking creature as the persona.** The avatar needs a portrait of one
  person; a creature face is unproven.
- **Any story that travels** (into the cave, into the castle, onto a ship). The
  world cannot move to a new location, so those beats bring the event to the
  player instead: the dragon comes out of the cave.

## How a play-through runs

1. **Explore.** Walk forward (W) for about 12 chunks, or press E.
2. **Encounter.** The beat's spawn sentence puts the persona into the world;
   her call starts with the story so far and her greeting; three seconds later
   a frame of the live world is sent to H3 Reference with the hero and persona
   images to render one preview per branch.
3. **Choose.** Click a choice, type, or speak. Typed and spoken words reach the
   persona so she answers in character; the director commits a branch only when
   the player has clearly chosen.
4. **The world reacts.** The branch's sentence joins the world prompt, the
   persona is told the outcome and says one line, and the chosen preview plays.
5. **Next beat or ending.** Walk on to reach the next beat, or the ending's
   world sentence and 10-second cinematic play.

Controls: `W A S D` move, arrows look, `1-3` held actions, `E` approach the
persona, `P` return the world to its first frame (the story's consequences are
kept in the prompt).

## 1. The Oracle of the Sunken Temple

*A wanderer carries an old bronze key into drowned ruins. The Oracle who sleeps the river asks what it should become.*

**Why it fits:** Best fit: one seated persona in steady light, and every consequence is water, weather, night or a new figure in the same ruins.

**Persona:** The Oracle, an old woman oracle with long white hair, pale grey hooded robes and a thin silver circlet.

**Held actions:** 1 Raise staff · 2 Kneel · 3 Leap

**Story graph:**

```
[The shrine] The Oracle: "You carry the old key, wanderer. Will you wake the river, or let it sleep?"
  -> Wake the river: Heavy rain is falling across the ruins and water is rushing back into the stone canal, filling it to the brim as a weathered stone bridge rises slowly out of the water ahead.
    [The risen bridge] The Oracle: "The river remembers you now. Open the sunken gate, or give the key back to me?"
      -> Open the sunken gate: Beyond the bridge the water is churning as the stone towers of a drowned city rise slowly from the river, warm lights glowing in their windows through the rain.
           ENDING "The Drowned City Rises": The drowned city stands fully risen beyond the river, its towers glowing gold against the storm clouds.
      -> Give back the key: The rain is easing over the ruins and the first gold light of sunrise is breaking through the clouds, the river running calm and clear beneath the bridge.
           ENDING "The Quiet River": Morning light fills the ruins and the calm river runs clear and silver past the shrine.
  -> Let it sleep: Night is falling over the ruins as rows of small paper lanterns flicker to life one by one, lighting a narrow path that winds north between the broken columns.
    [The lantern road] The Oracle: "Most who take this road never look back. Follow the lanterns out, or put them out and stay?"
      -> Follow the lanterns: Dawn is breaking pale and gold over the hills beyond the ruins, the lanterns fading one by one as the path ahead fills with soft morning light.
           ENDING "The Long Road": Full morning light spreads across the hills beyond the ruins and the path runs on toward the horizon.
      -> Put out the lanterns: The lanterns are going dark one by one and the night sky is filling with stars as thick fog rolls in over the silent ruins.
           ENDING "The Dark Watch": Stars wheel slowly over the dark ruins as the fog settles thick and still around the shrine.
  -> Ask who sent her: On the ridge above the ruins a tall cloaked figure stands in silhouette against the rising moon, perfectly still, watching the shrine.
       ENDING "The Watcher on the Ridge": The cloaked figure on the ridge raises one hand toward the wanderer as the moon climbs higher and fog swallows the ruins below.
```

**Images to generate** (save under `public/`):

- `public/scenes/temple-hero.jpg` (16:9, the world's starting image)

  > Third-person rear view, 16:9 landscape. One lone wanderer in a weathered charcoal hooded cloak with a brown leather satchel and a short wooden staff stands at the centre of the frame, seen from behind at medium distance, at the entrance of the moss-covered ruins of a sunken stone temple at dusk. Broken columns, ivy-choked archways and a dry stone canal lead toward a small candlelit shrine in the distance. Cinematic fantasy realism, soft volumetric dusk light, muted moss-green and stone-grey palette with warm candle accents, light ground fog, subtle 35mm film grain.

- `public/scenes/temple-oracle.jpg` (3:4, the persona portrait)

  > Half-body portrait, 3:4, one person only, facing the camera, eye level. An old woman oracle with long white hair, pale grey hooded robes and a thin silver circlet, calm and watchful, seated beside flickering candles on old stone steps, warm candlelight from below, softly blurred temple stones behind her. Cinematic fantasy realism, soft volumetric dusk light, muted moss-green and stone-grey palette with warm candle accents, light ground fog, subtle 35mm film grain.

## 2. The Guide of the Red Canyon

*A knight reaches a canyon at dusk. A blunt desert guide knows only one road stays open past nightfall.*

**Why it fits:** Strong fit: the look of Reactor's branching demo, a simple outdoor close-up, and big events (a dragon, a dust storm) that stay in the canyon.

**Persona:** The Guide, a weathered middle-aged desert guide with a short grey beard, a sand-coloured head wrap and a patched leather coat.

**Held actions:** 1 Draw sword · 2 Raise shield · 3 Leap

**Story graph:**

```
[The campfire] The Guide: "The cave or the castle, knight. Only one road stays open past nightfall."
  -> Enter the cave: A great red dragon is crawling out of the dark cave mouth onto the canyon road, smoke and glowing embers spilling around it as it lifts its head toward the knight.
    [The dragon] The Guide: "Well, you woke it. Fight it, or lower that sword and try talking. Quickly."
      -> Fight the dragon: The dragon is collapsing onto the canyon road in a great cloud of dust and embers, the light turning deep orange as the sun sets behind the mesa.
           ENDING "Dragonfall": The canyon lies quiet in deep orange sunset light, dust drifting slowly over the fallen dragon on the road.
      -> Lower the sword: The red dragon is bowing its great head low over the road, then spreading its wings and rising into the dusk sky toward the distant castle.
           ENDING "The Dragon's Pact": The dragon circles once high above the canyon in the dusk sky before gliding away toward the castle on the mesa.
  -> Ride for the castle: A towering wall of dust storm is rolling in across the canyon, wind whipping sand over the road as the distant castle gates swing open and torchlight spills out.
       ENDING "The Open Gates": The dust storm is passing and the castle gates stand open on the mesa, torchlight warm against the darkening sky.
  -> Find another way: The sun has dropped below the canyon rim and night has fallen, moonlight revealing a narrow hidden ledge path climbing along the cliff wall to the right.
       ENDING "The Hidden Path": Stars fill the night sky over the canyon and the ledge path glows faintly in the moonlight high on the cliff.
```

**Images to generate** (save under `public/`):

- `public/scenes/canyon-hero.jpg` (16:9, the world's starting image)

  > Third-person rear view, 16:9 landscape. One knight in dark steel armour and a long deep-blue cloak stands at the centre of the frame, seen from behind at medium distance, on a winding dirt road in a vast red-rock canyon. A dark cave mouth opens in the cliff to the left and a pale castle sits on a distant mesa. Cinematic high-desert fantasy, warm late-afternoon light, red-orange sandstone and dusty haze, painterly realism, subtle 35mm film grain.

- `public/scenes/canyon-guide.jpg` (3:4, the persona portrait)

  > Half-body portrait, 3:4, one person only, facing the camera, eye level. A weathered middle-aged desert guide with a short grey beard, a sand-coloured head wrap and a patched leather coat, standing beside a small campfire, warm firelight on his face, softly blurred red canyon wall behind him. Cinematic high-desert fantasy, warm late-afternoon light, red-orange sandstone and dusty haze, painterly realism, subtle 35mm film grain.

## 3. The Keeper of the Storm Light

*A sailor climbs a headland in a rising storm. The old keeper must decide, with them, who the light is for tonight.*

**Why it fits:** Good fit: an empty natural place, a persona in a lit doorway, and consequences that are all weather and light. Riskier than the first two only because storms are busy to render.

**Persona:** The Keeper, an elderly lighthouse keeper with a white beard, a navy wool coat and a brass-buttoned cap, holding a storm lantern.

**Held actions:** 1 Raise lantern · 2 Brace · 3 Hop rocks

**Story graph:**

```
[The lighthouse door] The Keeper: "Storm's coming fast, sailor. Light the beacon, wait it out, or ask me about the lost ship?"
  -> Light the beacon: The great lamp at the top of the lighthouse is blazing to life, its bright beam sweeping out across the dark storm clouds and the heaving sea.
    [The beacon] The Keeper: "There she is, out in the dark. Signal her in, or turn the light away?"
      -> Signal the ship: A ship's lights are turning safely toward the harbour as the storm begins to ease and the clouds break open over the sea.
           ENDING "Safe Harbour": Dawn is breaking calm and pink over the sea, a small ship anchored safely in the harbour below the headland.
      -> Turn the light away: The beam is swinging away from the sea and the ship's lights are vanishing behind the rocks as lightning splits the sky.
           ENDING "The Dark Sea": The storm rages on over an empty black sea, the lighthouse beam turned inland toward the hills.
  -> Wait out the storm: Thick white fog is rolling up over the headland and swallowing the sea as a deep foghorn sounds from somewhere far out on the water.
       ENDING "Fog Bound": The headland lies silent in deep white fog, only the faint glow of the lighthouse doorway showing through.
  -> Ask about the lost ship: Down on the black rocks below the headland the broken mast of a wrecked ship is showing through the waves, lit by a flash of lightning.
    [The wreck] The Keeper: "Tide's turning soon. Search the rocks for what she left, or back up the cliff with me?"
      -> Search the rocks: The tide is pulling back from the rocks and revealing a sealed glass bottle wedged between the stones, glinting in a flash of lightning.
           ENDING "The Bottle Map": The storm is clearing and moonlight is spreading silver across the calm sea beyond the rocks.
      -> Go back up: Thick white fog is rolling up over the headland and swallowing the sea as a deep foghorn sounds from somewhere far out on the water.
           ENDING "Fog Bound": The headland lies silent in deep white fog, only the faint glow of the lighthouse doorway showing through.
```

**Images to generate** (save under `public/`):

- `public/scenes/lighthouse-hero.jpg` (16:9, the world's starting image)

  > Third-person rear view, 16:9 landscape. One young sailor in a yellow oilskin coat and a dark wool cap stands at the centre of the frame, seen from behind at medium distance, on a narrow path across a rocky coastal headland at dusk, leading to a white stone lighthouse with a dark lamp room. Grey sea crashing on rocks below. Cinematic coastal drama, stormy blue-grey dusk light with warm lamp glow, wind-flattened grass, sea spray, painterly realism, subtle 35mm film grain.

- `public/scenes/lighthouse-keeper.jpg` (3:4, the persona portrait)

  > Half-body portrait, 3:4, one person only, facing the camera, eye level. An elderly lighthouse keeper with a white beard, a navy wool coat and a brass-buttoned cap, holding a storm lantern, standing in the open doorway of a stone lighthouse, warm lamplight on his face, softly blurred stormy dusk behind him. Cinematic coastal drama, stormy blue-grey dusk light with warm lamp glow, wind-flattened grass, sea spray, painterly realism, subtle 35mm film grain.

