// Flattens a recipe + live game state into the one prose string
// LingBot-World-2 sees, using the World Model Arcade's contract pattern:
// the immutable subject / camera / environment / continuity rules lead EVERY
// prompt, then the movement layer, held actions, the persona and the story's
// consequences.

import type { QuickAction, Recipe } from "./recipes";

export interface WorldPromptState {
  moving: boolean;
  held: QuickAction[];
  /** The current beat's persona placement, while the persona is in the world. */
  personaSpawn: string | null;
  /** Consequences committed by the player's choices, oldest first. */
  events: string[];
}

export function serializeWorldContract(r: Recipe): string {
  return [
    `IMMUTABLE SUBJECT CONTRACT: ${r.world.identity}`,
    `IMMUTABLE CAMERA CONTRACT: ${r.world.camera}`,
    `IMMUTABLE ENVIRONMENT CONTRACT: ${r.world.environment}`,
    `NON-NEGOTIABLE CONTINUITY RULES: ${r.world.invariants}`,
  ].join(" ");
}

export function composeWorldPrompt(r: Recipe, s: WorldPromptState): string {
  const override = s.held.map((a) => a.movementOverride).find(Boolean);
  return [
    serializeWorldContract(r),
    override ?? (s.moving ? r.movingPrompt : r.stillPrompt),
    ...s.held.map((a) => a.prompt),
    s.personaSpawn ?? "",
    // The two most recent consequences: older ones are already in the picture,
    // and a shorter prompt keeps the stream steady.
    ...s.events.slice(-2),
  ]
    .filter(Boolean)
    .join(" ");
}
