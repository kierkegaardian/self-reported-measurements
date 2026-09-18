import { credentials, measurements, verifier, equal, InputError } from './security.ts';
interface Env { DB: D1Database; ASSETS: Fetcher; WRITES: RateLimit }
interface SecretRow { id: string; salt: string; verifier: string }
const PUBLIC = 'id, handle, length, girth, unit, createdAt';
function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new InputError('JSON required.');
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('Body required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4096) { await reader.cancel(); throw new InputError('Request too large.'); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  let data: unknown;
  try { data = JSON.parse(new TextDecoder().decode(buffer)); } catch { throw new InputError('Invalid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new InputError('Invalid request.');
  return data as Record<string, unknown>;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (url.pathname === '/api/entries' && request.method === 'GET') {
        const q = url.searchParams.get('q') || '';
        if (q && !/^[A-Za-z0-9_]{1,15}$/.test(q)) throw new InputError('Invalid search handle.');
        const offset = Number(url.searchParams.get('offset') || 0);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new InputError('Invalid page.');
        const results = await env.DB.prepare(`SELECT ${PUBLIC} FROM entries WHERE instr(lower(handle), lower(?)) > 0 ORDER BY createdAt DESC, id DESC LIMIT 101 OFFSET ?`).bind(q, offset).all();
        return json({ entries: results.results.slice(0, 100), more: results.results.length > 100 });
      }
      if (!['/api/entries', '/api/retract'].includes(url.pathname) || request.method !== 'POST') return json({ error: 'Not found.' }, 404);
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return json({ error: 'Origin not allowed.' }, 403);
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      if (!(await env.WRITES.limit({ key: ip })).success) return json({ error: 'Too many attempts. Try again in a minute.' }, 429);
      const body = await bodyOf(request);
      const { handle } = credentials(body);
      if (url.pathname === '/api/retract') {
        const passphrase = body.passphrase;
        if (typeof passphrase !== 'string' || !/^[a-f0-9]{64}$/.test(passphrase)) throw new InputError('Enter the 64-character removal code.');
        const row = await env.DB.prepare('SELECT id, salt, verifier FROM entries WHERE handle = ?').bind(handle).first<SecretRow>();
        const hashed = await verifier(passphrase, row?.salt || 'missing-entry-dummy-salt');
        if (!row || !equal(hashed, row.verifier)) return json({ error: 'Handle and passphrase do not match.' }, 403);
        await env.DB.prepare('DELETE FROM entries WHERE id = ? AND verifier = ?').bind(row.id, row.verifier).run();
        return json({ ok: true });
      }
      const values = measurements(body);
      const salt = crypto.randomUUID();
      const removalCode = body.removalCode;
      if (typeof removalCode !== "string" || !/^[a-f0-9]{64}$/.test(removalCode)) throw new InputError("A generated removal code is required.");
      const hash = await verifier(removalCode, salt);
      const result = await env.DB.prepare('INSERT INTO entries (id, handle, length, girth, unit, createdAt, salt, verifier) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(handle) DO NOTHING')
        .bind(crypto.randomUUID(), handle, values.length, values.girth, values.unit, new Date().toISOString(), salt, hash).run();
      if (!result.meta.changes) return json({ error: 'That handle already has an entry. Retract it first.' }, 409);
      return json({ ok: true, removalCode }, 201);
    } catch (error) {
      if (error instanceof InputError) return json({ error: error.message }, 400);
      return json({ error: 'The directory is temporarily unavailable. Please try again later.' }, 503);
    }
  }
};
