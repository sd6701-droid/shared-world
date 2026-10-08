import type { Recipe } from "./types";

// Priority 3. Chosen over a neon city (crowds and traffic make generated
// worlds messy): an empty natural headland where every consequence is weather,
// fog, lightning, a beacon or ship lights, and the persona stands in a lit
// doorway facing the camera.

const STYLE =
  "Cinematic coastal drama, stormy blue-grey dusk light with warm lamp glow, wind-flattened grass, sea spray, painterly realism, subtle 35mm film grain.";
const HERO = "one young sailor in a yellow oilskin coat and a dark wool cap";
const KEEPER =
  "an elderly lighthouse keeper with a white beard, a navy wool coat and a brass-buttoned cap, holding a storm lantern";

export const lighthouse: Recipe = {
  id: "lighthouse",
  priority: 3,
  title: "The Keeper of the Storm Light",
  logline: "A sailor climbs a headland in a rising storm. The old keeper must decide, with them, who the light is for tonight.",
  fit: "Good fit: an empty natural place, a persona in a lit doorway, and consequences that are all weather and light. Riskier than the first two only because storms are busy to render.",
  seed: 3303,

  heroImage: "/scenes/lighthouse-hero.jpg",
  personaImage: "/scenes/lighthouse-keeper.jpg",
  heroImagePrompt: `Third-person rear view, 16:9 landscape. ${cap(HERO)} stands at the centre of the frame, seen from behind at medium distance, on a narrow path across a rocky coastal headland at dusk, leading to a white stone lighthouse with a dark lamp room. Grey sea crashing on rocks below. ${STYLE}`,
  personaImagePrompt: `Half-body portrait, 3:4, one person only, facing the camera, eye level. ${cap(KEEPER)}, standing in the open doorway of a stone lighthouse, warm lamplight on his face, softly blurred stormy dusk behind him. ${STYLE}`,

  style: STYLE,
  world: {
    identity: `${cap(HERO)}. Preserve the same yellow coat, cap, build and complete silhouette.`,
    camera:
      "Stable third-person follow camera a few metres behind and slightly above the sailor, looking along the headland path. Preserve camera height, distance, lens, horizon and full-body readability.",
    environment: `The same rocky coastal headland: a narrow grassy path, a white stone lighthouse ahead, grey sea breaking on the rocks below. ${STYLE}`,
    invariants:
      "Never add a second sailor, change the yellow coat, switch to first person, teleport off the headland, or move the lighthouse, path or cliffs. Keep spatial continuity; weather and light may change only as events describe.",
  },
  stillPrompt:
    "The sailor stands still on the path, coat flapping in the wind, grass flattened around their boots.",
  movingPrompt:
    "The sailor walks steadily forward along the headland path toward the lighthouse, moving directly away from the camera, leaning into the wind.",
  actions: [
    {
      key: "Digit1",
      label: "Raise lantern",
      prompt: "The sailor lifts a small hand lantern high so its warm light swings across the grass, then lowers it again.",
      movementOverride: "The sailor stands in place holding a small lantern high in the wind.",
    },
    {
      key: "Digit2",
      label: "Brace",
      prompt: "The sailor crouches and braces against a gust of wind, coat whipping, then straightens up again.",
      movementOverride: "The sailor crouches low in place, bracing against the gale.",
    },
    {
      key: "Digit3",
      label: "Hop rocks",
      prompt: "The sailor hops lightly up onto a low rock and back down onto the path.",
      jump: true,
    },
  ],

  persona: {
    name: "The Keeper",
    look: KEEPER,
    core:
      "You are the old keeper of the storm light, gruff but kind, who has kept this lighthouse for fifty years. Speak in one or two short sentences, raising your voice over the wind. Never describe events in the world yourself; only speak to the sailor. Never break character.",
  },
  heroSubject: "the young sailor in a yellow oilskin coat and a dark wool cap",
  placeSubject: "the rocky coastal headland with a narrow path, a white stone lighthouse and grey sea below",

  startBeat: "door",
  beats: {
    door: {
      id: "door",
      title: "The lighthouse door",
      spawnEvent: `In the open doorway of the lighthouse ahead, ${KEEPER} stands facing the sailor, warm lamplight spilling out around him.`,
      brief:
        "A sailor has climbed to your lighthouse as a storm rises. The great lamp is dark. Offer exactly three paths: light the beacon, wait out the storm inside, or ask about the ship that was lost here last winter. If they have not chosen, restate the choice.",
      greeting: "Storm's coming fast, sailor. Light the beacon, wait it out, or ask me about the lost ship?",
      branches: [
        {
          id: "light",
          label: "Light the beacon",
          verb: "Light",
          intent: "Light the beacon, turn on the lighthouse lamp, help ships.",
          keywords: ["light", "beacon", "lamp", "fire", "help", "ship", "ships"],
          worldEvent:
            "The great lamp at the top of the lighthouse is blazing to life, its bright beam sweeping out across the dark storm clouds and the heaving sea.",
          personaAfter: "The sailor lit the beacon. Tell them a ship is out there and needs the light.",
          vision: {
            action:
              "The lamp at the top of the lighthouse in <Subject 3> blazes on and its beam sweeps the storm as <Subject 1> looks up and <Subject 2> raises his lantern in the doorway. Low-angle wide shot.",
            sound: "Roaring wind, crashing waves, a deep mechanical hum. No dialogue.",
          },
          next: { beat: "beacon" },
        },
        {
          id: "wait",
          label: "Wait out the storm",
          verb: "Shelter",
          intent: "Wait, shelter inside, stay safe, do nothing.",
          keywords: ["wait", "shelter", "inside", "stay", "safe", "rest"],
          worldEvent:
            "Thick white fog is rolling up over the headland and swallowing the sea as a deep foghorn sounds from somewhere far out on the water.",
          personaAfter: "The sailor chose to wait out the storm. Say the sea will decide tonight, not us.",
          vision: {
            action:
              "Thick fog rolls over <Subject 3>, swallowing the sea, as <Subject 1> steps into the lighthouse doorway beside <Subject 2>. Wide static shot.",
            sound: "Muffled waves, a distant foghorn. No dialogue.",
          },
          next: { ending: "fog-bound" },
        },
        {
          id: "ship",
          label: "Ask about the lost ship",
          verb: "Question",
          intent: "Ask about the lost ship, the wreck, last winter.",
          keywords: ["lost", "wreck", "winter", "ask", "what", "happened", "who"],
          worldEvent:
            "Down on the black rocks below the headland the broken mast of a wrecked ship is showing through the waves, lit by a flash of lightning.",
          personaAfter: "The sailor asked about the lost ship. Tell them the wreck still lies on the rocks below, and something of it washes up on stormy nights.",
          vision: {
            action:
              "Lightning lights the black rocks below <Subject 3>, revealing a wrecked ship's broken mast, as <Subject 1> and <Subject 2> look down from the cliff edge. Wide shot.",
            sound: "Thunder, crashing surf, creaking timber. No dialogue.",
          },
          next: { beat: "wreck" },
        },
      ],
    },
    beacon: {
      id: "beacon",
      title: "The beacon",
      spawnEvent: `At the foot of the blazing lighthouse, ${KEEPER} stands facing the sailor, lantern raised against the wind.`,
      brief:
        "The beacon is lit and a ship's lights are out in the storm. Offer exactly two paths: signal the ship toward the safe harbour, or turn the light away from the rocks and let the ship find its own way. Restate the choice if they hesitate.",
      greeting: "There she is, out in the dark. Signal her in, or turn the light away?",
      branches: [
        {
          id: "signal",
          label: "Signal the ship",
          verb: "Signal",
          intent: "Signal the ship, guide it in, save the crew.",
          keywords: ["signal", "guide", "save", "harbour", "harbor", "in", "help"],
          worldEvent:
            "A ship's lights are turning safely toward the harbour as the storm begins to ease and the clouds break open over the sea.",
          personaAfter: "The sailor guided the ship in. Tell them, gruffly, they would make a decent keeper.",
          vision: {
            action:
              "The beam from the lighthouse in <Subject 3> guides a small ship's lights safely toward harbour as the storm clouds break; <Subject 1> and <Subject 2> watch. Wide shot.",
            sound: "Easing wind, a ship's horn, calmer waves. No dialogue.",
          },
          next: { ending: "safe-harbour" },
        },
        {
          id: "away",
          label: "Turn the light away",
          verb: "Turn away",
          intent: "Turn the light away, refuse to guide them, let them find their own way.",
          keywords: ["turn", "away", "refuse", "dark", "own", "no"],
          worldEvent:
            "The beam is swinging away from the sea and the ship's lights are vanishing behind the rocks as lightning splits the sky.",
          personaAfter: "The sailor turned the light away. Say quietly that the sea remembers, then fall silent.",
          vision: {
            action:
              "The lighthouse beam swings away over <Subject 3> and a ship's lights vanish behind the rocks under splitting lightning, as <Subject 2> lowers his lantern beside <Subject 1>. Wide shot.",
            sound: "Thunder, roaring sea, then silence. No dialogue.",
          },
          next: { ending: "dark-sea" },
        },
      ],
    },
    wreck: {
      id: "wreck",
      title: "The wreck",
      spawnEvent: `On a flat rock above the tideline, ${KEEPER} stands facing the sailor, storm lantern swinging in his hand.`,
      brief:
        "The sailor asked about the lost ship and you led them down toward the wreck. Offer exactly two paths: search the rocks for what washed up, or go back up to the lighthouse before the tide turns. Restate the choice if they hesitate.",
      greeting: "Tide's turning soon. Search the rocks for what she left, or back up the cliff with me?",
      branches: [
        {
          id: "search",
          label: "Search the rocks",
          verb: "Search",
          intent: "Search the rocks, look for wreckage, find what washed up.",
          keywords: ["search", "look", "find", "rocks", "wreckage", "explore"],
          worldEvent:
            "The tide is pulling back from the rocks and revealing a sealed glass bottle wedged between the stones, glinting in a flash of lightning.",
          personaAfter: "The sailor found a sealed bottle with a map inside. Say that bottle was meant for them, not you.",
          vision: {
            action:
              "<Subject 1> kneels on the wet rocks of <Subject 3> and lifts a sealed glass bottle holding a rolled map, as <Subject 2> holds his lantern close. Close two-shot.",
            sound: "Receding surf, dripping water, distant thunder. No dialogue.",
          },
          next: { ending: "bottle-map" },
        },
        {
          id: "back",
          label: "Go back up",
          verb: "Retreat",
          intent: "Go back, return to the lighthouse, leave the wreck.",
          keywords: ["back", "return", "up", "leave", "lighthouse", "go"],
          worldEvent:
            "Thick white fog is rolling up over the headland and swallowing the sea as a deep foghorn sounds from somewhere far out on the water.",
          personaAfter: "The sailor chose to go back up. Say some wrecks are better left to the sea.",
          vision: {
            action:
              "<Subject 1> and <Subject 2> climb back up the headland path of <Subject 3> as fog swallows the wreck below. Wide shot from above.",
            sound: "Muffled waves, a distant foghorn. No dialogue.",
          },
          next: { ending: "fog-bound" },
        },
      ],
    },
  },
  endings: {
    "fog-bound": {
      id: "fog-bound",
      title: "Fog Bound",
      worldEvent: "The headland lies silent in deep white fog, only the faint glow of the lighthouse doorway showing through.",
      cinematic: {
        action: "Fog drifts over <Subject 3>; the lighthouse doorway glows faintly where <Subject 1> and <Subject 2> sit inside by the lamp. Slow push-in.",
        sound: "Muffled sea, a distant foghorn, a quiet piano.",
      },
    },
    "safe-harbour": {
      id: "safe-harbour",
      title: "Safe Harbour",
      worldEvent: "Dawn is breaking calm and pink over the sea, a small ship anchored safely in the harbour below the headland.",
      cinematic: {
        action: "Dawn over <Subject 3>: a small ship rests safely in harbour below as <Subject 1> and <Subject 2> stand at the cliff edge. Wide aerial shot.",
        sound: "Gentle waves, gulls, warm strings.",
      },
    },
    "dark-sea": {
      id: "dark-sea",
      title: "The Dark Sea",
      worldEvent: "The storm rages on over an empty black sea, the lighthouse beam turned inland toward the hills.",
      cinematic: {
        action: "The lighthouse beam sweeps inland over <Subject 3> while the empty sea churns black below; <Subject 1> stands alone on the path. Slow wide shot.",
        sound: "Thunder, roaring sea, a low drone.",
      },
    },
    "bottle-map": {
      id: "bottle-map",
      title: "The Bottle Map",
      worldEvent: "The storm is clearing and moonlight is spreading silver across the calm sea beyond the rocks.",
      cinematic: {
        action: "Under clearing moonlight on the rocks of <Subject 3>, <Subject 1> unrolls an old map from the bottle while <Subject 2> holds the lantern. Close two-shot.",
        sound: "Calm waves, paper rustling, a hopeful flute.",
      },
    },
  },
};

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
