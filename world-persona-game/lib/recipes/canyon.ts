import type { Recipe } from "./types";

// Priority 2. The setting of Reactor's own branching demo. The dragon is kept
// in the canyon (it comes OUT of the cave) because LingBot cannot move the
// player into a new location: the starting image anchors the place.

const STYLE =
  "Cinematic high-desert fantasy, warm late-afternoon light, red-orange sandstone and dusty haze, painterly realism, subtle 35mm film grain.";
const HERO = "one knight in dark steel armour and a long deep-blue cloak";
const GUIDE =
  "a weathered middle-aged desert guide with a short grey beard, a sand-coloured head wrap and a patched leather coat";

export const canyon: Recipe = {
  id: "canyon",
  priority: 2,
  title: "The Guide of the Red Canyon",
  logline: "A knight reaches a canyon at dusk. A blunt desert guide knows only one road stays open past nightfall.",
  fit: "Strong fit: the look of Reactor's branching demo, a simple outdoor close-up, and big events (a dragon, a dust storm) that stay in the canyon.",
  seed: 2202,

  heroImage: "/scenes/canyon-hero.jpg",
  personaImage: "/scenes/canyon-guide.jpg",
  heroImagePrompt: `Third-person rear view, 16:9 landscape. ${cap(HERO)} stands at the centre of the frame, seen from behind at medium distance, on a winding dirt road in a vast red-rock canyon. A dark cave mouth opens in the cliff to the left and a pale castle sits on a distant mesa. ${STYLE}`,
  personaImagePrompt: `Half-body portrait, 3:4, one person only, facing the camera, eye level. ${cap(GUIDE)}, standing beside a small campfire, warm firelight on his face, softly blurred red canyon wall behind him. ${STYLE}`,

  style: STYLE,
  world: {
    identity: `${cap(HERO)}. Preserve the same armour, cloak colour, build and complete silhouette.`,
    camera:
      "Stable third-person follow camera a few metres behind and slightly above the knight, looking forward down the road. Preserve camera height, distance, lens, horizon and full-body readability.",
    environment: `The same vast red-rock canyon: a winding dirt road, towering sandstone cliffs, a dark cave mouth in the left wall and a pale castle on a far mesa. ${STYLE}`,
    invariants:
      "Never add a second knight, change the armour or cloak, switch to first person, teleport out of the canyon, or move the cave, road or castle. Keep spatial continuity; weather and light may change only as events describe.",
  },
  stillPrompt:
    "The knight stands still on the road, the blue cloak stirring faintly in the dry wind, dust settling around the armoured boots.",
  movingPrompt:
    "The knight walks steadily forward along the dirt road, moving directly away from the camera, the blue cloak trailing behind and small puffs of dust rising with each step.",
  actions: [
    {
      key: "Digit1",
      label: "Draw sword",
      prompt:
        "The knight draws a long steel sword from the hip and holds it ready before lowering it back to their side.",
      movementOverride: "The knight stands in place on the road with the sword drawn and held ready.",
    },
    {
      key: "Digit2",
      label: "Raise shield",
      prompt: "The knight raises a round steel shield in front of their body, braces, then lowers it again.",
      movementOverride: "The knight braces in place behind the raised shield.",
    },
    {
      key: "Digit3",
      label: "Leap",
      prompt: "The knight leaps upward off the dusty road, cloak flaring, and lands back on both feet.",
      jump: true,
    },
  ],

  persona: {
    name: "The Guide",
    look: GUIDE,
    core:
      "You are a weathered desert guide who has lived in this red canyon for thirty years: blunt, dry-humoured and protective of travellers. Speak in one or two short sentences. Never describe events in the world yourself; only speak to the knight. Never break character.",
  },
  heroSubject: "the knight in dark steel armour and a long deep-blue cloak",
  placeSubject: "the red-rock canyon with a winding dirt road, a dark cave mouth and a pale castle on a distant mesa",

  startBeat: "campfire",
  beats: {
    campfire: {
      id: "campfire",
      title: "The campfire",
      spawnEvent: `Beside a small campfire at the cave mouth ahead, ${GUIDE} stands facing the knight, thin smoke curling up past him.`,
      brief:
        "A knight has stopped at your campfire by the cave mouth as nightfall comes. Offer exactly three paths: enter the cave, ride for the castle, or find another way along the cliffs. If they have not chosen, restate the choice.",
      greeting: "The cave or the castle, knight. Only one road stays open past nightfall.",
      branches: [
        {
          id: "cave",
          label: "Enter the cave",
          verb: "Draw sword",
          intent: "Go into the cave, fight, face what is inside.",
          keywords: ["cave", "enter", "inside", "fight", "sword", "dragon", "dark"],
          worldEvent:
            "A great red dragon is crawling out of the dark cave mouth onto the canyon road, smoke and glowing embers spilling around it as it lifts its head toward the knight.",
          personaAfter: "The knight chose the cave and the dragon is out. Warn them to keep their shield up.",
          vision: {
            action:
              "In <Subject 3>, a great red dragon crawls out of the cave mouth in smoke and embers as <Subject 1> draws a sword and <Subject 2> backs away from the campfire. Wide low-angle shot.",
            sound: "A deep rumbling growl, crackling embers, scraping claws on rock. No dialogue.",
          },
          next: { beat: "dragon" },
        },
        {
          id: "castle",
          label: "Ride for the castle",
          verb: "Ride on",
          intent: "Head for the castle, the town or the main road.",
          keywords: ["castle", "town", "ride", "road", "gate", "mesa"],
          worldEvent:
            "A towering wall of dust storm is rolling in across the canyon, wind whipping sand over the road as the distant castle gates swing open and torchlight spills out.",
          personaAfter: "The knight chose the castle. Tell them to ride fast before the storm closes the road.",
          vision: {
            action:
              "A towering dust storm rolls across <Subject 3> as <Subject 1> strides toward the far castle, whose gates swing open with torchlight; <Subject 2> shields his eyes by the fire. Wide shot.",
            sound: "Howling wind, hissing sand, a distant gate creaking open. No dialogue.",
          },
          next: { ending: "open-gates" },
        },
        {
          id: "ledge",
          label: "Find another way",
          verb: "Climb",
          intent: "Find another route, climb, sneak, avoid both cave and castle.",
          keywords: ["another", "other", "climb", "ledge", "around", "sneak", "cliff", "neither"],
          worldEvent:
            "The sun has dropped below the canyon rim and night has fallen, moonlight revealing a narrow hidden ledge path climbing along the cliff wall to the right.",
          personaAfter: "The knight chose another way. Tell them few find that path and fewer finish it.",
          vision: {
            action:
              "Night falls over <Subject 3>; moonlight reveals a narrow ledge up the cliff and <Subject 1> starts to climb while <Subject 2> watches from the glowing campfire below. Wide shot.",
            sound: "Crickets, a soft night wind, small stones falling. No dialogue.",
          },
          next: { ending: "hidden-path" },
        },
      ],
    },
    dragon: {
      id: "dragon",
      title: "The dragon",
      spawnEvent: `Crouched behind a large boulder at the roadside, ${GUIDE} faces the knight, embers drifting past him.`,
      brief:
        "The knight entered the cave and a great red dragon has crawled out onto the road. You are hiding behind a boulder. Offer exactly two paths: fight the dragon, or lower the sword and speak to it. Restate the choice if they hesitate.",
      greeting: "Well, you woke it. Fight it, or lower that sword and try talking. Quickly.",
      branches: [
        {
          id: "fight",
          label: "Fight the dragon",
          verb: "Attack",
          intent: "Fight, attack, strike, kill the dragon.",
          keywords: ["fight", "attack", "strike", "kill", "slay", "charge"],
          worldEvent:
            "The dragon is collapsing onto the canyon road in a great cloud of dust and embers, the light turning deep orange as the sun sets behind the mesa.",
          personaAfter: "The knight fought and won. Say, drily, that you will be telling this one for years.",
          vision: {
            action:
              "<Subject 1> charges the red dragon on the road in <Subject 3>; it rears and collapses in dust and embers at sunset as <Subject 2> rises from behind a boulder. Wide tracking shot.",
            sound: "A roar cut short, clashing steel, a heavy thud, settling dust.",
          },
          next: { ending: "dragonfall" },
        },
        {
          id: "parley",
          label: "Lower the sword",
          verb: "Speak",
          intent: "Lower the sword, talk, make peace, spare the dragon.",
          keywords: ["lower", "talk", "speak", "peace", "spare", "parley", "calm"],
          worldEvent:
            "The red dragon is bowing its great head low over the road, then spreading its wings and rising into the dusk sky toward the distant castle.",
          personaAfter: "The knight spared the dragon and it flew away. Admit you did not think that would work.",
          vision: {
            action:
              "<Subject 1> lowers the sword before the red dragon in <Subject 3>; it bows its head, spreads its wings and lifts into the dusk sky as <Subject 2> stares. Wide low-angle shot.",
            sound: "A low rumbling breath, beating wings, wind.",
          },
          next: { ending: "pact" },
        },
      ],
    },
  },
  endings: {
    "open-gates": {
      id: "open-gates",
      title: "The Open Gates",
      worldEvent: "The dust storm is passing and the castle gates stand open on the mesa, torchlight warm against the darkening sky.",
      cinematic: {
        action: "<Subject 1> walks through the settling dust of <Subject 3> toward the lit, open castle gates on the mesa. Slow wide pull-back.",
        sound: "Fading wind, distant bells, warm horns.",
      },
    },
    "hidden-path": {
      id: "hidden-path",
      title: "The Hidden Path",
      worldEvent: "Stars fill the night sky over the canyon and the ledge path glows faintly in the moonlight high on the cliff.",
      cinematic: {
        action: "<Subject 1> climbs high along the moonlit ledge above <Subject 3>, a tiny campfire glowing far below. Wide aerial shot.",
        sound: "Night wind, crickets, a soft solo guitar.",
      },
    },
    dragonfall: {
      id: "dragonfall",
      title: "Dragonfall",
      worldEvent: "The canyon lies quiet in deep orange sunset light, dust drifting slowly over the fallen dragon on the road.",
      cinematic: {
        action: "<Subject 1> stands over the fallen red dragon in <Subject 3> at sunset as <Subject 2> walks up beside them. Slow orbiting wide shot.",
        sound: "Quiet wind, settling dust, a low triumphant horn.",
      },
    },
    pact: {
      id: "pact",
      title: "The Dragon's Pact",
      worldEvent: "The dragon circles once high above the canyon in the dusk sky before gliding away toward the castle on the mesa.",
      cinematic: {
        action: "The red dragon glides over <Subject 3> toward the castle at dusk while <Subject 1> and <Subject 2> watch from the road. Wide shot.",
        sound: "Distant wingbeats, wind, rising strings.",
      },
    },
  },
};

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
