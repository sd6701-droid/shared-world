import type { Recipe } from "./types";

// Priority 1. The strongest fit for all three models: one calm, seated persona
// in candlelight; every consequence is rain, water, night, lanterns or a new
// figure in the same ruins.

const STYLE =
  "Cinematic fantasy realism, soft volumetric dusk light, muted moss-green and stone-grey palette with warm candle accents, light ground fog, subtle 35mm film grain.";
const HERO =
  "one lone wanderer in a weathered charcoal hooded cloak with a brown leather satchel and a short wooden staff";
const ORACLE =
  "an old woman oracle with long white hair, pale grey hooded robes and a thin silver circlet";

export const temple: Recipe = {
  id: "temple",
  priority: 1,
  title: "The Oracle of the Sunken Temple",
  logline: "A wanderer carries an old bronze key into drowned ruins. The Oracle who sleeps the river asks what it should become.",
  fit: "Best fit: one seated persona in steady light, and every consequence is water, weather, night or a new figure in the same ruins.",
  seed: 1101,

  heroImage: "/scenes/temple-hero.jpg",
  personaImage: "/scenes/temple-oracle.jpg",
  heroImagePrompt: `Third-person rear view, 16:9 landscape. ${cap(HERO)} stands at the centre of the frame, seen from behind at medium distance, at the entrance of the moss-covered ruins of a sunken stone temple at dusk. Broken columns, ivy-choked archways and a dry stone canal lead toward a small candlelit shrine in the distance. ${STYLE}`,
  personaImagePrompt: `Half-body portrait, 3:4, one person only, facing the camera, eye level. ${cap(ORACLE)}, calm and watchful, seated beside flickering candles on old stone steps, warm candlelight from below, softly blurred temple stones behind her. ${STYLE}`,

  style: STYLE,
  world: {
    identity: `${cap(HERO)}. Preserve the same cloak colour, hood, satchel, staff, build and complete silhouette.`,
    camera:
      "Stable third-person follow camera a few metres behind and slightly above the wanderer, looking forward along the path. Preserve camera height, distance, lens, horizon and full-body readability.",
    environment: `The same moss-covered ruins of a sunken stone temple: broken columns, ivy-choked archways, a stone canal and a small candlelit shrine ahead, low fog between the stones. ${STYLE}`,
    invariants:
      "Never add a second wanderer, change the cloak or staff, switch to first person, teleport to a different place, or relocate the shrine, canal or columns. Keep spatial continuity; weather and light may change only as events describe.",
  },
  stillPrompt:
    "The wanderer stands still on the flagstones, cloak hanging in the calm air, staff resting on the stones, fog curling gently around their boots.",
  movingPrompt:
    "The wanderer walks steadily forward along the stone path, moving directly away from the camera, cloak swaying with each step and the staff tapping the worn flagstones.",
  actions: [
    {
      key: "Digit1",
      label: "Raise staff",
      prompt:
        "The wanderer raises the wooden staff overhead and its tip glows with a soft blue light that pulses once across the nearby stones, then lowers it back to their side.",
      movementOverride: "The wanderer stands in place, both hands on the raised staff, cloak stirring.",
    },
    {
      key: "Digit2",
      label: "Kneel",
      prompt:
        "The wanderer kneels on one knee and presses a palm to the old flagstones, then rises back to standing.",
      movementOverride: "The wanderer kneels in place on the same flagstones, then rises again.",
    },
    {
      key: "Digit3",
      label: "Leap",
      prompt:
        "The wanderer leaps lightly upward off the flagstones, cloak flaring, and lands back on both feet.",
      jump: true,
    },
  ],

  persona: {
    name: "The Oracle",
    look: ORACLE,
    core:
      "You are the Oracle of the Sunken Temple, an ancient, calm woman who put the river to sleep centuries ago. You speak softly and mysteriously, in one or two short sentences. You never describe events in the world yourself; you only speak to the wanderer. Never break character.",
  },
  heroSubject: "the wanderer in the charcoal hooded cloak with a satchel and a wooden staff",
  placeSubject: "the moss-covered sunken temple ruins with broken columns, a stone canal and a candlelit shrine",

  startBeat: "shrine",
  beats: {
    shrine: {
      id: "shrine",
      title: "The shrine",
      spawnEvent: `On the shrine steps ahead, ${ORACLE} sits beside the flickering candles, facing the wanderer, lit warm from below.`,
      brief:
        "The wanderer has just reached your shrine at dusk carrying the old bronze key. Offer exactly three paths: wake the river, let it sleep and take the lantern road north, or ask who sent them. If they have not chosen, gently restate the choice.",
      greeting: "You carry the old key, wanderer. Will you wake the river, or let it sleep?",
      branches: [
        {
          id: "wake",
          label: "Wake the river",
          verb: "Cast",
          intent: "Wake the river, flood the canal, use the key or cast a spell.",
          keywords: ["wake", "river", "water", "flood", "spell", "cast", "awaken", "key", "yes"],
          worldEvent:
            "Heavy rain is falling across the ruins and water is rushing back into the stone canal, filling it to the brim as a weathered stone bridge rises slowly out of the water ahead.",
          personaAfter: "The wanderer chose to wake the river. Tell them to cross the bridge before the water forgets them.",
          vision: {
            action:
              "<Subject 1> raises the staff beside the dry canal in <Subject 3> while <Subject 2> watches from the shrine steps; heavy rain begins, water floods the canal and a stone bridge slowly rises from it. The camera holds a wide shot.",
            sound: "Building rain, rushing water, a deep grinding of stone. No dialogue.",
          },
          next: { beat: "bridge" },
        },
        {
          id: "sleep",
          label: "Let it sleep",
          verb: "Walk away",
          intent: "Decline, leave the river asleep, walk away or take the lantern road north.",
          keywords: ["sleep", "leave", "no", "walk", "away", "refuse", "north", "lantern"],
          worldEvent:
            "Night is falling over the ruins as rows of small paper lanterns flicker to life one by one, lighting a narrow path that winds north between the broken columns.",
          personaAfter: "The wanderer chose to let the river sleep. Tell them the lanterns will show them the long way.",
          vision: {
            action:
              "Night falls over <Subject 3>; rows of paper lanterns light one by one along a path winding north as <Subject 1> turns away from <Subject 2> and walks toward them. Slow push-in from behind.",
            sound: "Night wind, soft crackle of lantern flames, distant water. No dialogue.",
          },
          next: { beat: "lanterns" },
        },
        {
          id: "who",
          label: "Ask who sent her",
          verb: "Question",
          intent: "Ask who sent the oracle, who is watching, or why the wanderer is here.",
          keywords: ["who", "sent", "why", "watching", "follow", "stranger"],
          worldEvent:
            "On the ridge above the ruins a tall cloaked figure stands in silhouette against the rising moon, perfectly still, watching the shrine.",
          personaAfter: "The wanderer asked who sent you. Tell them to ask the one on the ridge, who has followed them since the coast.",
          vision: {
            action:
              "<Subject 2> lifts her gaze past <Subject 1> toward a tall cloaked silhouette on the ridge above <Subject 3>, the moon rising behind it. Low-angle wide shot.",
            sound: "A low wind and one distant bell. No dialogue.",
          },
          next: { ending: "watcher" },
        },
      ],
    },
    bridge: {
      id: "bridge",
      title: "The risen bridge",
      spawnEvent: `At the far end of the risen stone bridge, ${ORACLE} stands in the rain facing the wanderer, holding a single candle cupped in her hands.`,
      brief:
        "The river is awake and the wanderer has crossed your bridge. Beneath the water the drowned city is stirring. Offer exactly two paths: open the sunken gate with the key, or give the key back to you so the river can rest. Restate the choice if they hesitate.",
      greeting: "The river remembers you now. Open the sunken gate, or give the key back to me?",
      branches: [
        {
          id: "gate",
          label: "Open the sunken gate",
          verb: "Use key",
          intent: "Open the gate, use the key, raise the city.",
          keywords: ["open", "gate", "use", "key", "city", "raise"],
          worldEvent:
            "Beyond the bridge the water is churning as the stone towers of a drowned city rise slowly from the river, warm lights glowing in their windows through the rain.",
          personaAfter: "The wanderer opened the gate. Say the city has waited a thousand years for them, then fall silent.",
          vision: {
            action:
              "<Subject 1> turns the bronze key in a stone lock at the bridge's end in <Subject 3>; behind <Subject 2>, the towers of a drowned city rise from the river with glowing windows. Wide crane shot.",
            sound: "Rain, churning water, deep rumbling stone, a rising choir hum. No dialogue.",
          },
          next: { ending: "drowned-city" },
        },
        {
          id: "return",
          label: "Give back the key",
          verb: "Return",
          intent: "Give the key back, let the river rest, refuse the city.",
          keywords: ["give", "back", "return", "rest", "refuse", "her", "keep"],
          worldEvent:
            "The rain is easing over the ruins and the first gold light of sunrise is breaking through the clouds, the river running calm and clear beneath the bridge.",
          personaAfter: "The wanderer gave you the key. Thank them quietly and tell them they are free to go, then fall silent.",
          vision: {
            action:
              "<Subject 1> places the bronze key in the hands of <Subject 2> on the bridge in <Subject 3> as the rain stops and sunrise breaks through the clouds. Gentle close two-shot.",
            sound: "Fading rain, calm flowing water, early birdsong. No dialogue.",
          },
          next: { ending: "keeper" },
        },
      ],
    },
    lanterns: {
      id: "lanterns",
      title: "The lantern road",
      spawnEvent: `Beside the last lantern on the north path, ${ORACLE} sits on a low stone wall facing the wanderer, lit by the lantern's warm glow.`,
      brief:
        "The wanderer chose to let the river sleep and followed your lanterns north at night. Offer exactly two paths: follow the lanterns out of the ruins toward dawn, or put the lanterns out and keep watch over the temple with you. Restate the choice if they hesitate.",
      greeting: "Most who take this road never look back. Follow the lanterns out, or put them out and stay?",
      branches: [
        {
          id: "follow",
          label: "Follow the lanterns",
          verb: "Walk on",
          intent: "Leave, follow the lanterns, go toward dawn.",
          keywords: ["follow", "go", "leave", "dawn", "on", "out", "road"],
          worldEvent:
            "Dawn is breaking pale and gold over the hills beyond the ruins, the lanterns fading one by one as the path ahead fills with soft morning light.",
          personaAfter: "The wanderer is leaving. Wish them a long road in one sentence, then fall silent.",
          vision: {
            action:
              "<Subject 1> walks away along the lantern path out of <Subject 3> as dawn breaks gold over the hills; <Subject 2> watches from her stone wall. Slow wide pull-back.",
            sound: "Morning wind, birdsong rising, footsteps on stone. No dialogue.",
          },
          next: { ending: "long-road" },
        },
        {
          id: "douse",
          label: "Put out the lanterns",
          verb: "Stay",
          intent: "Stay, put out the lanterns, keep watch, guard the temple.",
          keywords: ["put", "out", "stay", "watch", "guard", "dark", "remain"],
          worldEvent:
            "The lanterns are going dark one by one and the night sky is filling with stars as thick fog rolls in over the silent ruins.",
          personaAfter: "The wanderer chose to stay and keep watch with you. Welcome them as the temple's new keeper, then fall silent.",
          vision: {
            action:
              "<Subject 1> and <Subject 2> sit side by side on the stone wall in <Subject 3> as the lanterns go dark and stars fill the sky above the fog. Static wide shot.",
            sound: "Soft hiss of flames going out, night insects, deep quiet. No dialogue.",
          },
          next: { ending: "dark-watch" },
        },
      ],
    },
  },
  endings: {
    watcher: {
      id: "watcher",
      title: "The Watcher on the Ridge",
      worldEvent: "The cloaked figure on the ridge raises one hand toward the wanderer as the moon climbs higher and fog swallows the ruins below.",
      cinematic: {
        action: "<Subject 1> looks up at the cloaked figure on the moonlit ridge above <Subject 3>, which raises one hand in greeting as fog rolls in. Slow push-in.",
        sound: "Wind, a distant bell, rising strings.",
      },
    },
    "drowned-city": {
      id: "drowned-city",
      title: "The Drowned City Rises",
      worldEvent: "The drowned city stands fully risen beyond the river, its towers glowing gold against the storm clouds.",
      cinematic: {
        action: "Wide aerial shot over <Subject 3> as the risen city glows gold beyond the river and <Subject 1> crosses toward it while <Subject 2> watches.",
        sound: "Rain easing, a rising choir, distant bells.",
      },
    },
    keeper: {
      id: "keeper",
      title: "The Quiet River",
      worldEvent: "Morning light fills the ruins and the calm river runs clear and silver past the shrine.",
      cinematic: {
        action: "<Subject 2> holds the key to the morning light by the calm river in <Subject 3> as <Subject 1> walks away. Gentle wide shot.",
        sound: "Birdsong, flowing water, soft strings.",
      },
    },
    "long-road": {
      id: "long-road",
      title: "The Long Road",
      worldEvent: "Full morning light spreads across the hills beyond the ruins and the path runs on toward the horizon.",
      cinematic: {
        action: "<Subject 1> walks out of <Subject 3> into gold morning hills, small against the horizon. Slow aerial pull-back.",
        sound: "Morning wind, birdsong, a warm solo flute.",
      },
    },
    "dark-watch": {
      id: "dark-watch",
      title: "The Dark Watch",
      worldEvent: "Stars wheel slowly over the dark ruins as the fog settles thick and still around the shrine.",
      cinematic: {
        action: "<Subject 1> and <Subject 2> keep watch on the shrine steps in <Subject 3> under a sky full of slowly wheeling stars. Static wide shot.",
        sound: "Deep night quiet, a low drone, one soft bell.",
      },
    },
  },
};

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
