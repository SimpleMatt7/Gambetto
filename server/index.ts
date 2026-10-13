import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { WebSocketServer } from 'ws';
import {
  checkPassword,
  checkUsername,
  createSession,
  destroySession,
  hashPassword,
  HttpError,
  parseCookies,
  rateLimit,
  SESSION_COOKIE,
  userFromRequest,
  verifyPassword,
} from './auth.ts';
import { all, one, run, type UserRow } from './db.ts';
import { adminCloseGame, createGame, forfeitGamesOf, forgetUser, joinGame, TIME_CONTROLS } from './games.ts';
import { getSettings, saveSettings } from './settings.ts';

const PORT = Number(process.env.PORT ?? 8787);
const DIST = resolve(process.env.DIST_DIR ?? 'dist');
// Dietro un reverse proxy (nginx o simili) l'indirizzo e il protocollo veri arrivano negli header X-Forwarded-*.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
// Sul sito pubblico (sempre in HTTPS) il cookie di sessione viaggia solo su connessioni cifrate.
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  user: UserRow | null;
  params: string[];
  body: Record<string, unknown>;
  ip: string;
}

type Handler = (ctx: Ctx) => unknown;

/** Indirizzo del visitatore. Dietro il proxy vale quello che il proxy stesso ha visto (X-Real-IP, o l'ultima
 *  voce di X-Forwarded-For): le voci precedenti le scrive il visitatore e potrebbero essere inventate. */
function clientIp(req: IncomingMessage) {
  if (TRUST_PROXY) {
    const real = String(req.headers['x-real-ip'] ?? '').trim();
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').pop()!.trim();
    if (real || forwarded) return real || forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}

const isHttps = (req: IncomingMessage) => TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https';

function setSessionCookie(ctx: Ctx, token: string, maxAge: number) {
  const secure = COOKIE_SECURE || isHttps(ctx.req) ? '; Secure' : '';
  ctx.res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

/** Le richieste che modificano dati devono arrivare dal sito stesso, non da pagine esterne. */
function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.method === 'GET' || req.method === 'DELETE') return {};
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Formato non supportato.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100_000) throw new HttpError(413, 'Richiesta troppo grande.');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new HttpError(400, 'Dati non validi.');
  }
}

const publicUser = (u: UserRow) => ({ id: u.id, username: u.username, role: u.role });

/** La parte delle impostazioni che serve all'app di tutti i visitatori. */
const publicConfig = () => {
  const { registration, online, notice, contact } = getSettings();
  return { registration, online, notice, contact };
};

function requireUser(ctx: Ctx): UserRow {
  if (!ctx.user) throw new HttpError(401, 'Devi accedere per continuare.');
  return ctx.user;
}

function requireAdmin(ctx: Ctx): UserRow {
  const user = requireUser(ctx);
  if (user.role !== 'admin') throw new HttpError(403, 'Riservato agli amministratori.');
  return user;
}

/** Tiene solo i dati di progresso che l'app conosce, entro limiti ragionevoli. */
function cleanProgress(body: Record<string, unknown>) {
  const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length <= 80))].slice(0, 300) : []);
  const stats: Record<string, { w: number; l: number; d: number }> = {};
  if (typeof body.stats === 'object' && body.stats !== null) {
    for (const [level, s] of Object.entries(body.stats as Record<string, Record<string, unknown>>).slice(0, 20)) {
      if (!/^\d{1,2}$/.test(level) || typeof s !== 'object' || s === null) continue;
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1_000_000, Math.floor(v))) : 0);
      stats[level] = { w: n(s.w), l: n(s.l), d: n(s.d) };
    }
  }
  return { lessons: list(body.lessons), lines: list(body.lines), stats };
}

const GAME_LIST = `
  SELECT g.id, g.status, g.result, g.reason, g.time_base, g.time_inc, g.created_at, g.updated_at, g.white_id, g.black_id,
         w.username AS white, b.username AS black,
         CASE WHEN g.moves = '' THEN 0 ELSE length(g.moves) - length(replace(g.moves, ' ', '')) + 1 END AS plies
  FROM games g LEFT JOIN users w ON w.id = g.white_id LEFT JOIN users b ON b.id = g.black_id`;

const routes: [string, RegExp, Handler][] = [
  [
    'POST',
    /^\/api\/register$/,
    (ctx) => {
      rateLimit(`register:${ctx.ip}`, 10, 3600_000);
      const username = checkUsername(ctx.body.username);
      const password = checkPassword(ctx.body.password);
      if (one('SELECT 1 FROM users WHERE username = ?', username)) throw new HttpError(409, 'Questo nome utente è già in uso.');
      // Il primo account creato su un'installazione nuova ne diventa l'amministratore.
      const first = !one('SELECT 1 FROM users LIMIT 1');
      if (!first && !getSettings().registration) throw new HttpError(403, 'Le registrazioni sono chiuse.');
      const now = Date.now();
      const { lastInsertRowid } = run(
        'INSERT INTO users (username, pass, role, created_at, last_seen) VALUES (?, ?, ?, ?, ?)',
        username,
        hashPassword(password),
        first ? 'admin' : 'user',
        now,
        now,
      );
      const session = createSession(Number(lastInsertRowid));
      setSessionCookie(ctx, session.token, session.maxAge);
      return { user: { id: Number(lastInsertRowid), username, role: first ? 'admin' : 'user' }, progress: {}, config: publicConfig() };
    },
  ],
  [
    'POST',
    /^\/api\/login$/,
    (ctx) => {
      const username = String(ctx.body.username ?? '');
      rateLimit(`login:${ctx.ip}`, 30, 600_000);
      rateLimit(`login:${username.toLowerCase()}`, 10, 600_000);
      const user = one<UserRow>('SELECT * FROM users WHERE username = ?', username);
      const ok = user && typeof ctx.body.password === 'string' && verifyPassword(ctx.body.password, user.pass);
      if (!user || !ok) throw new HttpError(401, 'Nome utente o password non corretti.');
      if (user.disabled) throw new HttpError(403, 'Questo account è stato disattivato.');
      run('UPDATE users SET last_seen = ? WHERE id = ?', Date.now(), user.id);
      const session = createSession(user.id);
      setSessionCookie(ctx, session.token, session.maxAge);
      return { user: publicUser(user), progress: JSON.parse(user.progress), config: publicConfig() };
    },
  ],
  [
    'POST',
    /^\/api\/logout$/,
    (ctx) => {
      const token = parseCookies(ctx.req.headers.cookie)[SESSION_COOKIE];
      if (token) destroySession(token);
      setSessionCookie(ctx, '', 0);
      return { ok: true };
    },
  ],
  [
    'GET',
    /^\/api\/me$/,
    (ctx) => (ctx.user ? { user: publicUser(ctx.user), progress: JSON.parse(ctx.user.progress), config: publicConfig() } : { user: null, config: publicConfig() }),
  ],
  [
    'PUT',
    /^\/api\/progress$/,
    (ctx) => {
      const user = requireUser(ctx);
      const progress = cleanProgress(ctx.body);
      run('UPDATE users SET progress = ?, last_seen = ? WHERE id = ?', JSON.stringify(progress), Date.now(), user.id);
      return { progress };
    },
  ],
  [
    'PUT',
    /^\/api\/password$/,
    (ctx) => {
      const user = requireUser(ctx);
      rateLimit(`password:${user.id}`, 10, 600_000);
      if (typeof ctx.body.current !== 'string' || !verifyPassword(ctx.body.current, user.pass)) throw new HttpError(401, 'La password attuale non è corretta.');
      run('UPDATE users SET pass = ? WHERE id = ?', hashPassword(checkPassword(ctx.body.password)), user.id);
      return { ok: true };
    },
  ],
  [
    'POST',
    /^\/api\/account\/delete$/,
    (ctx) => {
      const user = requireUser(ctx);
      rateLimit(`delete:${user.id}`, 10, 600_000);
      if (typeof ctx.body.password !== 'string' || !verifyPassword(ctx.body.password, user.pass)) throw new HttpError(401, 'La password non è corretta.');
      // Senza amministratori nessuno potrebbe più gestire il sito.
      if (user.role === 'admin' && !one("SELECT 1 FROM users WHERE role = 'admin' AND disabled = 0 AND id != ?", user.id)) {
        throw new HttpError(400, 'Sei l\'unico amministratore: nomina prima un altro admin dal pannello.');
      }
      forfeitGamesOf(user.id);
      run('DELETE FROM users WHERE id = ?', user.id);
      forgetUser(user.id);
      setSessionCookie(ctx, '', 0);
      return { ok: true };
    },
  ],
  [
    'POST',
    /^\/api\/games$/,
    (ctx) => {
      const user = requireUser(ctx);
      if (!getSettings().online && user.role !== 'admin') throw new HttpError(403, 'Le partite online sono momentaneamente sospese.');
      rateLimit(`games:${user.id}`, 30, 600_000);
      const time = TIME_CONTROLS[String(ctx.body.time ?? 'none')] ?? TIME_CONTROLS.none;
      const color = ctx.body.color === 'white' || ctx.body.color === 'black' ? ctx.body.color : Math.random() < 0.5 ? 'white' : 'black';
      return { id: createGame(color === 'white' ? user.id : null, color === 'black' ? user.id : null, time[0], time[1]) };
    },
  ],
  [
    'GET',
    /^\/api\/games$/,
    (ctx) => {
      const user = requireUser(ctx);
      return { games: all(`${GAME_LIST} WHERE g.white_id = ? OR g.black_id = ? ORDER BY g.updated_at DESC LIMIT 40`, user.id, user.id) };
    },
  ],

  // ── Amministrazione ──
  [
    'GET',
    /^\/api\/admin\/overview$/,
    (ctx) => {
      requireAdmin(ctx);
      return {
        users: all(
          `SELECT u.id, u.username, u.role, u.disabled, u.created_at, u.last_seen, u.progress,
                  (SELECT count(*) FROM games g WHERE g.white_id = u.id OR g.black_id = u.id) AS games
           FROM users u ORDER BY u.created_at DESC`,
        ),
        games: all(`${GAME_LIST} ORDER BY g.updated_at DESC LIMIT 300`),
        settings: getSettings(),
      };
    },
  ],
  [
    'PUT',
    /^\/api\/admin\/settings$/,
    (ctx) => {
      requireAdmin(ctx);
      return { settings: saveSettings(ctx.body) };
    },
  ],
  [
    'POST',
    /^\/api\/admin\/users$/,
    (ctx) => {
      requireAdmin(ctx);
      const username = checkUsername(ctx.body.username);
      const password = checkPassword(ctx.body.password);
      if (one('SELECT 1 FROM users WHERE username = ?', username)) throw new HttpError(409, 'Questo nome utente è già in uso.');
      const now = Date.now();
      run('INSERT INTO users (username, pass, role, created_at, last_seen) VALUES (?, ?, ?, ?, ?)', username, hashPassword(password), ctx.body.role === 'admin' ? 'admin' : 'user', now, now);
      return { ok: true };
    },
  ],
  [
    'PATCH',
    /^\/api\/admin\/users\/(\d+)$/,
    (ctx) => {
      const admin = requireAdmin(ctx);
      const id = Number(ctx.params[0]);
      const target = one<UserRow>('SELECT * FROM users WHERE id = ?', id);
      if (!target) throw new HttpError(404, 'Utente non trovato.');
      const { username, password, role, disabled } = ctx.body;
      // Un amministratore non può togliersi da solo i permessi né disattivarsi: resterebbe chiuso fuori.
      if (id === admin.id && ((role !== undefined && role !== 'admin') || disabled === true)) throw new HttpError(400, 'Non puoi rimuovere i permessi al tuo stesso account.');
      if (username !== undefined && username !== target.username) {
        const name = checkUsername(username);
        if (one('SELECT 1 FROM users WHERE username = ? AND id != ?', name, id)) throw new HttpError(409, 'Questo nome utente è già in uso.');
        run('UPDATE users SET username = ? WHERE id = ?', name, id);
      }
      if (password !== undefined) {
        run('UPDATE users SET pass = ? WHERE id = ?', hashPassword(checkPassword(password)), id);
        run('DELETE FROM sessions WHERE user_id = ?', id);
      }
      if (role === 'admin' || role === 'user') run('UPDATE users SET role = ? WHERE id = ?', role, id);
      if (typeof disabled === 'boolean') {
        run('UPDATE users SET disabled = ? WHERE id = ?', disabled ? 1 : 0, id);
        if (disabled) run('DELETE FROM sessions WHERE user_id = ?', id);
      }
      return { ok: true };
    },
  ],
  [
    'DELETE',
    /^\/api\/admin\/users\/(\d+)$/,
    (ctx) => {
      const admin = requireAdmin(ctx);
      const id = Number(ctx.params[0]);
      if (id === admin.id) throw new HttpError(400, 'Il tuo account si elimina dalla pagina del profilo.');
      forfeitGamesOf(id);
      if (!run('DELETE FROM users WHERE id = ?', id).changes) throw new HttpError(404, 'Utente non trovato.');
      forgetUser(id);
      return { ok: true };
    },
  ],
  [
    'PATCH',
    /^\/api\/admin\/games\/([a-z0-9]+)$/,
    (ctx) => {
      requireAdmin(ctx);
      if (!adminCloseGame(ctx.params[0], false)) throw new HttpError(404, 'Partita non trovata.');
      return { ok: true };
    },
  ],
  [
    'DELETE',
    /^\/api\/admin\/games\/([a-z0-9]+)$/,
    (ctx) => {
      requireAdmin(ctx);
      if (!adminCloseGame(ctx.params[0], true)) throw new HttpError(404, 'Partita non trovata.');
      return { ok: true };
    },
  ],
];

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function handleApi(req: IncomingMessage, res: ServerResponse, path: string) {
  try {
    if (req.method !== 'GET' && !sameOrigin(req)) throw new HttpError(403, 'Origine non consentita.');
    for (const [method, pattern, handler] of routes) {
      const match = req.method === method && pattern.exec(path);
      if (!match) continue;
      const ctx: Ctx = { req, res, user: userFromRequest(req), params: match.slice(1), body: await readBody(req), ip: clientIp(req) };
      return sendJson(res, 200, await handler(ctx));
    }
    throw new HttpError(404, 'Non trovato.');
  } catch (e) {
    if (e instanceof HttpError) return sendJson(res, e.status, { error: e.message });
    console.error(e);
    sendJson(res, 500, { error: 'Errore interno del server.' });
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
].join('; ');

// I file di testo e il motore si comprimono una volta sola e si tengono in memoria: sono pochi e non cambiano.
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest', '.wasm']);
const compressed = new Map<string, Buffer>();

function serveStatic(req: IncomingMessage, res: ServerResponse, path: string) {
  let file = normalize(join(DIST, decodeURIComponent(path)));
  if (!file.startsWith(DIST)) file = join(DIST, 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('App non compilata: esegui "npm run build".');
  }
  // I file in /assets hanno un'impronta nel nome e quelli del motore la versione: non cambiano mai.
  const immutable = path.startsWith('/assets/') || path.startsWith('/stockfish/');
  const headers: Record<string, string> = {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    Vary: 'Accept-Encoding',
  };
  if (COOKIE_SECURE) headers['Strict-Transport-Security'] = 'max-age=15552000';
  if (COMPRESSIBLE.has(extname(file)) && String(req.headers['accept-encoding'] ?? '').includes('gzip')) {
    let body = compressed.get(file);
    if (!body) compressed.set(file, (body = gzipSync(readFileSync(file))));
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': String(body.length) });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path.startsWith('/api/')) void handleApi(req, res, path);
  else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, path);
  else res.writeHead(405).end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const gameId = url.searchParams.get('game') ?? '';
  if (url.pathname !== '/ws' || !sameOrigin(req) || !/^[a-z0-9]{1,16}$/.test(gameId)) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
    if (!joinGame(gameId, ws, userFromRequest(req), getSettings().spectators)) {
      ws.send(JSON.stringify({ t: 'gone' }));
      ws.close();
    }
  });
});

// Un ping periodico tiene aperta la connessione attraverso i proxy e scopre chi si è disconnesso male.
const alive = new WeakSet<object>();
wss.on('connection', (ws) => {
  alive.add(ws);
  ws.on('pong', () => alive.add(ws));
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) ws.terminate();
    else {
      alive.delete(ws);
      ws.ping();
    }
  }
}, 30_000).unref();

server.listen(PORT, () => console.log(`Gambetto in ascolto su http://localhost:${PORT}`));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    for (const ws of wss.clients) ws.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
