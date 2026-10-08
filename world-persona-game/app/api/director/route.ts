import { NextResponse } from "next/server";
import { matchByKeywords, type DirectorResult } from "@/lib/director";
import { beatOf, recipeById } from "@/lib/recipes";

// Maps the player's words to one branch id of the current beat (or null)
// with Gemini. Without GEMINI_API_KEY it falls back to keyword matching, so
// the game still works with no LLM at all.

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function POST(req: Request) {
  const { recipeId, beatId, text, transcript } = (await req.json()) as {
    recipeId: string;
    beatId: string;
    text: string;
    transcript?: string[];
  };
  const recipe = recipeById(recipeId);
  const beat = beatOf(recipe, beatId);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !text?.trim()) return NextResponse.json(matchByKeywords(beat, text ?? ""));

  const branches = beat.branches.map((b) => `- "${b.id}": ${b.label}. ${b.intent}`).join("\n");
  const prompt = [
    `You are the director of an interactive story, "${recipe.title}", at the beat "${beat.title}".`,
    `${recipe.persona.name} has offered the player these choices:`,
    branches,
    "",
    "Recent conversation:",
    ...(transcript ?? []).map((l) => `  ${l}`),
    "",
    `The player just said: "${text}"`,
    "",
    "Decide whether the player has clearly committed to exactly one choice.",
    'Answer with JSON only: {"branchId": "<one of the ids>" or null, "reason": "<short reason>"}.',
    "Use null when the player is still asking questions, is undecided, or says something unrelated.",
  ].join("\n");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(raw) as { branchId?: string | null; reason?: string };
    const valid = beat.branches.some((b) => b.id === parsed.branchId);
    const result: DirectorResult = {
      branchId: valid ? (parsed.branchId as string) : null,
      reason: parsed.reason ?? "",
      via: "llm",
    };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(matchByKeywords(beat, text));
  }
}
