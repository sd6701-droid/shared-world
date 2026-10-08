// Minimal zero-dependency live-demo server for lingbot-world-2.
//   - keeps REACTOR_API_KEY server-side (never sent to the browser)
//   - POST /api/token  -> exchanges the key for a session-scoped JWT
//   - serves index.html and the seed image (../test-1.jpeg)
//
// Run:  node demo-live/server.mjs   then open http://localhost:5050
// Needs Node 18+ (global fetch). No npm install.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
// Token is scoped to both models so either demo page works with one key.
const MODELS = ['reactor/fast-h3', 'reactor/lingbot-world-2'];
const PORT = 5050;

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

const env = loadEnvLocal();
const KEY = env.REACTOR_API_KEY || process.env.REACTOR_API_KEY || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

async function mintToken() {
  const r = await fetch('https://api.reactor.inc/tokens', {
    method: 'POST',
    headers: { 'Reactor-API-Key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expires_after: 3600,
      authorization_details: [
        {
          type: 'session',
          resources: { models: { match: MODELS } },
          constraints: { max_sessions: 5, max_session_duration_seconds: 3600 },
        },
      ],
    }),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/token') {
      if (!KEY) {
        res.writeHead(500, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'REACTOR_API_KEY missing — add it to .env.local' }));
      }
      const { ok, status, text } = await mintToken();
      if (!ok) {
        res.writeHead(status, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'token exchange failed', status, body: text }));
      }
      const data = JSON.parse(text);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ jwt: data.jwt, models: MODELS, expires_at: data.expires_at }));
    }

    // static files
    const bare = req.url.split('?')[0];
    const path = bare === '/' ? '/index.html' : bare;
    // room reference images (test-1.jpeg, test-2.jpeg, ...) live at the repo root
    const isRoomImage = /^\/test-\d+\.(jpe?g|png)$/i.test(path)
      || /^\/corridor\/corridor_\d+\.jpe?g$/i.test(path);   // corridor agent's seed images
    const file = isRoomImage ? join(ROOT, path.slice(1)) : join(HERE, path);
    // keep reads inside known dirs
    if (!file.startsWith(HERE) && !isRoomImage) {
      res.writeHead(403); return res.end('forbidden');
    }
    const ext = path.slice(path.lastIndexOf('.'));
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found: ' + e.message);
  }
});

server.listen(PORT, () => {
  console.log(`\n  directed-scene demo → http://localhost:${PORT}/fasth3.html   (FastH3)`);
  console.log(`  navigate demo       → http://localhost:${PORT}/            (LingBot World 2)`);
  console.log(`  models: ${MODELS.join(', ')}`);
  console.log(`  REACTOR_API_KEY: ${KEY ? 'loaded ✓' : 'MISSING ✗  (add it to .env.local and restart)'}\n`);
});
