// Memoized JWT resolver shared by all three model sessions.
//
// Load-bearing (per Reactor's starters): a session may only be operated by
// the exact token that created it, so the token is cached here in module
// scope until shortly before expiry — never left to the browser HTTP cache.

const REFRESH_SKEW_MS = 60_000;
let cached: { jwt: string; expiresAtMs: number } | null = null;
let inflight: Promise<string> | null = null;

export async function fetchToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAtMs - REFRESH_SKEW_MS) return cached.jwt;
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetch("/api/reactor/token", { cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Token route returned ${res.status}`);
    }
    const { jwt, expires_at } = (await res.json()) as { jwt: string; expires_at: number };
    cached = { jwt, expiresAtMs: expires_at * 1000 };
    return jwt;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
