import { NextResponse } from "next/server";

// One session-scoped JWT for all three models this game drives. The browser
// never sees REACTOR_API_KEY; the token can only create sessions for these
// models and act on the sessions it created itself.
const MODELS = [
  "reactor/lingbot-world-2",
  "reactor/vidu-s2-avatar",
  "reactor/h3-reference-to-video-turbo-realtime",
];

// Three sessions per play-through, plus room for reconnects.
const MAX_SESSIONS = 15;
const TOKEN_LIFETIME_SECONDS = 60 * 60;

export async function GET() {
  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "REACTOR_API_KEY is not set on the server" },
      { status: 500 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_REACTOR_API_URL || "https://api.reactor.inc";

  const res = await fetch(`${baseUrl}/tokens`, {
    method: "POST",
    headers: { "Reactor-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: TOKEN_LIFETIME_SECONDS,
      authorization_details: [
        {
          type: "session",
          resources: { models: { match: MODELS } },
          constraints: { max_sessions: MAX_SESSIONS },
        },
      ],
    }),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `Reactor /tokens returned ${res.status}: ${await res.text()}` },
      { status: 502 },
    );
  }

  const { jwt, expires_at } = (await res.json()) as { jwt: string; expires_at: number };
  return NextResponse.json(
    { jwt, expires_at },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
