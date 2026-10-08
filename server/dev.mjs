// Local dev server for the game: serves the static app and mints Reactor
// session tokens so the world-model room view can connect. Zero dependencies.
//
//   node server/dev.mjs          then open http://localhost:8777/app/stage/
//
// - REACTOR_API_KEY is read from .env.local (or the environment) and never
//   leaves this process; the browser only ever gets a short-lived JWT.
// - Listens on 127.0.0.1 only: /api/token spends your key, so it must not be
//   reachable from the network. Set HOST=0.0.0.0 to share it deliberately.
// - Serves only the folders the game needs, and never a dotfile.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8777);
const HOST = process.env.HOST || '127.0.0.1';
const MODELS = ['reactor/lingbot-world-2'];

// Only these are served. Everything else (including .env.local) is 404.
const ALLOWED = ['/app/', '/shared/', '/lib/', '/server/', '/public/', '/demo-live/rooms50/', '/corridor/', '/map.json'];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
};

function loadEnvLocal() {
  const p = join(ROOT, '.env.local');
  const out = {};
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const KEY = loadEnvLocal().REACTOR_API_KEY || process.env.REACTOR_API_KEY || '';

async function mintToken() {
  const r = await fetch('https://api.reactor.inc/tokens', {
    method: 'POST',
    headers: { 'Reactor-API-Key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expires_after: 3600,
      authorization_details: [{
        type: 'session',
        resources: { models: { match: MODELS } },
        constraints: { max_sessions: 5, max_session_duration_seconds: 3600 },
      }],
    }),
  });
  return { ok: r.ok, status: r.status, text: await r.text() };
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = decodeURIComponent(url.pathname);

  if (path === '/api/token') {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    if (!KEY) return send(res, 500, { error: 'REACTOR_API_KEY missing: add it to .env.local and restart' });
    try {
      const { ok, status, text } = await mintToken();
      if (!ok) return send(res, 502, { error: 'token exchange failed (' + status + ')' });
      const data = JSON.parse(text);
      return send(res, 200, { jwt: data.jwt, models: MODELS, expires_at: data.expires_at });
    } catch (e) {
      return send(res, 502, { error: 'token exchange failed: ' + e.message });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', 'text/plain');
  if (path === '/' || path === '/app') { res.writeHead(302, { location: '/app/' }); return res.end(); }
  if (path.split('/').some((seg) => seg.startsWith('.'))) return send(res, 404, 'not found', 'text/plain');
  if (!ALLOWED.some((a) => (a.endsWith('/') ? path.startsWith(a) : path === a))) return send(res, 404, 'not found', 'text/plain');

  let file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT + sep)) return send(res, 404, 'not found', 'text/plain');
  try {
    if ((await stat(file)).isDirectory()) {
      if (!path.endsWith('/')) { res.writeHead(301, { location: path + '/' + url.search }); return res.end(); }
      file = join(file, 'index.html');
    }
    const buf = await readFile(file);
    return send(res, 200, req.method === 'HEAD' ? '' : buf, MIME[extname(file).toLowerCase()] || 'application/octet-stream');
  } catch {
    return send(res, 404, 'not found', 'text/plain');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  The Two Thieves → http://localhost:${PORT}/app/stage/`);
  console.log(`  REACTOR_API_KEY: ${KEY ? 'loaded ✓ (live rooms will stream)' : 'MISSING ✗ (live rooms fall back to a still image)'}`);
  console.log('  Ctrl+C to stop. Live sessions bill per second while a thief is in a live room.\n');
});
