// A recipe is one complete, branching storyline: a hero walking through one
// LingBot-World-2 world, meeting ONE persona (Vidu-S2-Avatar) several times,
// with every choice changing the world live and previewed by
// H3 Reference Turbo Realtime.
//
// The shape encodes the model constraints:
//  - The world's starting image is fixed for the whole run, and LingBot's
//    context refresh pulls back toward it. So consequences are weather, light,
//    time of day and new figures in the SAME place, never a new location.
//  - The world contract (identity / camera / environment / invariants) is sent
//    verbatim in every prompt, the pattern from Reactor's World Model Arcade.
//  - One persona per recipe, built once from one portrait, reused every beat.
//  - Previews get three references: the hero image, the persona portrait and
//    a live frame of the world, so both characters stay on-model.

export interface WorldContract {
  /** The hero: what must never change about them. */
  identity: string;
  camera: string;
  environment: string;
  invariants: string;
}

/** A held action key (1-3), like the arcade's face buttons. */
export interface QuickAction {
  key: "Digit1" | "Digit2" | "Digit3";
  label: string;
  /** A complete visible action AND its return to the stable pose. */
  prompt: string;
  /** Replaces the movement layer while held (in-place actions). */
  movementOverride?: string;
  /** A short vertical hop on LingBot's camera-pose channel. */
  jump?: boolean;
}

export type Next = { beat: string } | { ending: string };

export interface Branch {
  id: string;
  label: string;
  verb: string;
  /** What the choice means, for the director. */
  intent: string;
  /** Whole words for the keyword fallback. */
  keywords: string[];
  /** One present-tense sentence about the ENVIRONMENT, added to the world. */
  worldEvent: string;
  /** Told to the persona after the choice (via updateCall). */
  personaAfter: string;
  /** Preview clip: what happens, using <Subject 1> hero, <Subject 2> persona, <Subject 3> place. */
  vision: { action: string; sound: string };
  next: Next;
}

export interface Beat {
  id: string;
  title: string;
  /** Where and how the persona appears in the world this beat. */
  spawnEvent: string;
  /** What the persona knows and offers in this beat (added to her persona). */
  brief: string;
  /** Her first spoken line, <= 200 characters. */
  greeting: string;
  branches: Branch[];
}

export interface Ending {
  id: string;
  title: string;
  worldEvent: string;
  /** Closing cinematic, same subject conventions as Branch.vision. */
  cinematic: { action: string; sound: string };
}

export interface Recipe {
  id: string;
  priority: number;
  title: string;
  logline: string;
  /** Why this storyline suits the models (shown on the start screen). */
  fit: string;
  seed: number;

  heroImage: string;
  personaImage: string;
  heroImagePrompt: string;
  personaImagePrompt: string;

  style: string;
  world: WorldContract;
  stillPrompt: string;
  movingPrompt: string;
  actions: QuickAction[];

  persona: {
    name: string;
    /** Appearance, reused verbatim in spawn events and preview prompts. */
    look: string;
    /** Who she is across the whole story. */
    core: string;
  };
  /** The hero and the place, as preview subjects. */
  heroSubject: string;
  placeSubject: string;

  startBeat: string;
  beats: Record<string, Beat>;
  endings: Record<string, Ending>;
}
