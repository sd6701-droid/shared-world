import { canyon } from "./canyon";
import { lighthouse } from "./lighthouse";
import { temple } from "./temple";
import type { Beat, Branch, Ending, Recipe } from "./types";

export * from "./types";

/** In priority order: the first is the default and the best fit. */
export const RECIPES: Recipe[] = [temple, canyon, lighthouse].sort((a, b) => a.priority - b.priority);

export function recipeById(id: string): Recipe {
  return RECIPES.find((r) => r.id === id) ?? RECIPES[0];
}

export function beatOf(recipe: Recipe, beatId: string): Beat {
  return recipe.beats[beatId] ?? recipe.beats[recipe.startBeat];
}

export function endingOf(recipe: Recipe, id: string): Ending | undefined {
  return recipe.endings[id];
}

/** The persona's prompt for one beat: who she is + what she knows now + the story so far. */
export function personaPromptFor(recipe: Recipe, beat: Beat, history: string[], after?: Branch): string {
  return [
    recipe.persona.core,
    history.length ? `What has happened so far: ${history.join(" Then ")}.` : "",
    beat.brief,
    after ? `${after.personaAfter} Keep it to one sentence, then fall silent.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Every branch id is unique within its beat and every `next` points somewhere real. */
export function validateRecipe(recipe: Recipe): string[] {
  const problems: string[] = [];
  if (!recipe.beats[recipe.startBeat]) problems.push(`${recipe.id}: startBeat "${recipe.startBeat}" is missing`);
  for (const beat of Object.values(recipe.beats)) {
    if (beat.greeting.length > 200) problems.push(`${recipe.id}/${beat.id}: greeting over 200 characters`);
    for (const b of beat.branches) {
      if ("beat" in b.next && !recipe.beats[b.next.beat]) problems.push(`${recipe.id}/${beat.id}/${b.id}: unknown beat ${b.next.beat}`);
      if ("ending" in b.next && !recipe.endings[b.next.ending]) problems.push(`${recipe.id}/${beat.id}/${b.id}: unknown ending ${b.next.ending}`);
    }
  }
  return problems;
}
