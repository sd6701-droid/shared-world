// The director turns what the player said or typed into ONE of the current
// beat's branches (or null = keep talking). Limiting it to pre-written
// branches is deliberate: every consequence is then a prompt already tuned for
// LingBot, and its preview is already rendering before the player decides.

import type { Beat } from "./recipes";

export interface DirectorResult {
  branchId: string | null;
  reason: string;
  via: "llm" | "keywords";
}

/** Whole-word keyword match. Works with no API key; also the LLM fallback. */
export function matchByKeywords(beat: Beat, text: string): DirectorResult {
  const words = new Set(text.toLowerCase().match(/[a-z']+/g) ?? []);
  let best: { id: string; score: number } | null = null;
  for (const b of beat.branches) {
    const score = b.keywords.reduce((n, k) => (words.has(k) ? n + 1 : n), 0);
    if (score > 0 && (!best || score > best.score)) best = { id: b.id, score };
  }
  return best
    ? { branchId: best.id, reason: "keyword match", via: "keywords" }
    : { branchId: null, reason: "no branch matched", via: "keywords" };
}

/** Client call: the server's LLM route first, keywords if it is unavailable. */
export async function resolveChoice(recipeId: string, beat: Beat, text: string, transcript: string[]): Promise<DirectorResult> {
  try {
    const res = await fetch("/api/director", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId, beatId: beat.id, text, transcript: transcript.slice(-6) }),
    });
    if (res.ok) return (await res.json()) as DirectorResult;
  } catch {}
  return matchByKeywords(beat, text);
}
