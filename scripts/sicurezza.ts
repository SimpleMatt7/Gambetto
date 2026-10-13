// Prova a comportarsi da utente malintenzionato contro un server avviato apposta, con un database usa e getta.
// Uso: node scripts/sicurezza.ts
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const PORT = 8797;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), 'gambetto-sicurezza-'));
const PASSWORD = `prova-${Math.random().toString(36).slice(2)}-${Date.now()}`;

let server: ChildProcess | null = null;
let failures = 0;
let checks = 0;

function start(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
      env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, TRUST_PROXY: '', COOKIE_SECURE: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server = child;
    child.stdout!.on('data', (d) => String(d).includes('in ascolto') && resolve());
    child.stderr!.on('data', () => {});
    child.on('exit', () => {
      if (server === child) server = null;
    });
    setTimeout(() => reject(new Error('il server non parte')), 15_000).unref();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function check(name: string, ok: boolean, detail = '') {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

/** Dopo un attacco il server deve essere ancora in piedi; se è caduto lo si riavvia per le prove successive. */
async function survives(name: string) {
  await sleep(250);
  const up = server !== null && (await fetch(`${BASE}/api/me`).then((r) => r.ok, () => false));
  check(`il server regge: ${name}`, up, 'il server si è spento');
  if (!up) await start();
}

interface Account {
  name: string;
  cookie: string;
  id: number;
}

async function api(method: string, path: string, body?: unknown, who?: Account | null, headers: Record<string, string> = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(who ? { Cookie: who.cookie } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' };
}

async function register(name: string, extra: Record<string, unknown> = {}): Promise<Account> {
  const r = await api('POST', '/api/register', { username: name, password: PASSWORD, ...extra });
  if (r.status !== 200) throw new Error(`registrazione di ${name}: ${r.status} ${JSON.stringify(r.data)}`);
  return { name, cookie: r.cookie, id: r.data.user.id };
}

function raw(path: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port: PORT, path, method: 'GET', headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', () => resolve(0));
    req.end();
  });
}

interface Client {
  ws: WebSocket;
  state: () => Record<string, any> | null;
  closed: () => boolean;
}

function connect(gameId: string, who: Account | null, cookie?: string): Promise<Client> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?game=${gameId}`, { headers: who || cookie ? { Cookie: cookie ?? who!.cookie } : {} });
    let last: Record<string, any> | null = null;
    let closed = false;
    const client: Client = { ws, state: () => last, closed: () => closed };
    ws.on('message', (d) => {
      last = JSON.parse(String(d));
    });
    ws.on('close', () => {
      closed = true;
      resolve(client);
    });
    ws.on('error', () => {
      closed = true;
      resolve(client);
    });
    ws.on('open', () => setTimeout(() => resolve(client), 150));
  });
}

const send = (c: Client, msg: unknown) => c.ws.readyState === WebSocket.OPEN && c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));

async function main() {
  await start();
  const admin = await register('capo');
  const anna = await register('anna', { role: 'admin', disabled: false, id: 1 });
  const bruno = await register('bruno');
  const carla = await register('carla');

  console.log('\n— Permessi —');
  const me = await api('GET', '/api/me', undefined, anna);
  check('registrarsi chiedendo il ruolo admin non lo concede', me.data.user?.role === 'user', JSON.stringify(me.data.user));
  const adminCalls: [string, string, unknown?][] = [
    ['GET', '/api/admin/overview'],
    ['PUT', '/api/admin/settings', { registration: true, notice: 'bucato' }],
    ['POST', '/api/admin/users', { username: 'intruso', password: PASSWORD, role: 'admin' }],
    ['PATCH', `/api/admin/users/${anna.id}`, { role: 'admin' }],
    ['PATCH', `/api/admin/users/${admin.id}`, { password: PASSWORD, disabled: true }],
    ['DELETE', `/api/admin/users/${admin.id}`],
    ['PATCH', '/api/admin/games/abcdefgh', {}],
    ['DELETE', '/api/admin/games/abcdefgh'],
  ];
  for (const [method, path, body] of adminCalls) {
    const asUser = await api(method, path, body, anna);
    const asGuest = await api(method, path, body, null);
    check(`${method} ${path} negato a un utente normale e a un ospite`, asUser.status === 403 && asGuest.status === 401, `${asUser.status}/${asGuest.status}`);
  }
  const progress = await api('PUT', '/api/progress', { role: 'admin', disabled: 0, username: 'capo', pass: 'x', lessons: ['a', 7, 'x'.repeat(500)], puzzles: { rating: 99999 }, stats: { '1': { w: -5, l: 1e99, d: 'x' } } }, anna);
  check(
    'i progressi accettano solo i campi previsti, entro i limiti',
    progress.status === 200 && Object.keys(progress.data.progress).sort().join() === 'lessons,lines,puzzles,stats' && progress.data.progress.puzzles.rating === 3000 && progress.data.progress.lessons.length === 1,
    JSON.stringify(progress.data).slice(0, 200),
  );
  const still = await api('GET', '/api/admin/overview', undefined, admin);
  check('dopo i tentativi: un solo amministratore, nessun utente in più, impostazioni intatte', still.data.users?.length === 4 && still.data.users.filter((u: any) => u.role === 'admin').length === 1 && still.data.settings.notice === '');
  check('l\'elenco per gli admin non contiene le password', !JSON.stringify(still.data).includes('"pass"'));
  const others = await api('PUT', '/api/password', { current: 'sbagliata-di-sicuro', password: PASSWORD + 'x' }, anna);
  check('cambiare password richiede quella attuale', others.status === 401);

  console.log('\n— Dati strani —');
  for (const name of ['<script>alert(1)</script>', "x' OR '1'='1", 'capo\u0000', '../../etc']) {
    const r = await api('POST', '/api/register', { username: name, password: PASSWORD });
    check(`nome utente rifiutato: ${JSON.stringify(name).slice(0, 30)}`, r.status === 400, String(r.status));
  }
  const dup = await api('POST', '/api/register', { username: 'CAPO', password: PASSWORD });
  check('non si può prendere lo stesso nome cambiando maiuscole', dup.status === 409, String(dup.status));
  const inj = await api('POST', '/api/login', { username: "capo' --", password: "' OR 1=1 --" });
  check('accesso con trucchi SQL respinto', inj.status === 401, String(inj.status));
  const typed = await api('POST', '/api/login', { username: { $ne: null }, password: { $ne: null } });
  check('accesso con dati di tipo sbagliato respinto', typed.status === 401, String(typed.status));
  const big = await api('PUT', '/api/progress', JSON.stringify({ lessons: ['x'.repeat(150_000)] }), anna);
  check('richieste enormi rifiutate', big.status === 413, String(big.status));
  const notJson = await api('PUT', '/api/progress', '{"lessons": [', anna);
  check('dati malformati rifiutati', notJson.status === 400, String(notJson.status));
  const foreign = await api('PUT', '/api/progress', { lessons: ['x'] }, anna, { Origin: 'https://sito-cattivo.example' });
  check('richieste inviate da un altro sito rifiutate', foreign.status === 403, String(foreign.status));
  await survives('dati strani nelle richieste');

  console.log('\n— Indirizzi e cookie malformati —');
  for (const path of ['/%E0%A4%A', '/%', '/..%2f..%2f..%2fetc%2fpasswd', '/../../../etc/passwd', '//', '///x', '/api/%E0', '/assets/%00', '/' + 'a/'.repeat(3000)]) {
    const status = await raw(path);
    await survives(`indirizzo ${path.slice(0, 32)} (risposta ${status})`);
  }
  const leak = await fetch(`${BASE}/..%2f..%2fpackage.json`).then((r) => r.text());
  check('non si esce dalla cartella del sito', !leak.includes('"dependencies"'));
  await raw('/api/me', { Cookie: 'gambetto_sid=%E0%A4%A' });
  await survives('cookie malformato su una richiesta normale');

  console.log('\n— Partite online —');
  const created = await api('POST', '/api/games', { time: 'none', color: 'white' }, anna);
  const gameId: string = created.data.id;
  const guest = await api('POST', '/api/games', { time: 'none' }, null);
  check('un ospite non può creare partite', guest.status === 401, String(guest.status));

  const bad = await connect(gameId, null, 'gambetto_sid=%E0%A4%A');
  bad.ws.terminate();
  await survives('cookie malformato sul collegamento della partita');

  const a = await connect(gameId, anna);
  const b = await connect(gameId, bruno);
  const c = await connect(gameId, carla);
  const g = await connect(gameId, null);
  await sleep(200);
  check('la partita parte con i due giocatori giusti', a.state()?.status === 'active' && a.state()?.white?.name === 'anna' && a.state()?.black?.name === 'bruno');
  check('il terzo arrivato e l\'ospite sono solo spettatori', c.state()?.you === 'spectator' && g.state()?.you === 'spectator');

  for (const intruder of [c, g]) for (const msg of [{ t: 'move', from: 'e2', to: 'e4' }, { t: 'resign' }, { t: 'draw' }, { t: 'cancel' }, { t: 'claim' }, { t: 'rematch' }]) send(intruder, msg);
  send(b, { t: 'move', from: 'e7', to: 'e5' });
  send(b, { t: 'move', from: 'e2', to: 'e4' });
  send(a, { t: 'move', from: 'e2', to: 'e5' });
  send(a, { t: 'move', from: 'e7', to: 'e5' });
  send(a, { t: 'claim' });
  send(b, { t: 'claim' });
  await sleep(300);
  check('spettatori, mosse fuori turno, mosse illegali e pezzi altrui non cambiano la partita', a.state()?.status === 'active' && a.state()?.moves.length === 0, JSON.stringify(a.state()).slice(0, 160));

  const junk: unknown[] = ['null', '[]', '"x"', '123', 'true', '{', '', '{"t":null}', '{"t":"move"}', { t: 'move', from: {}, to: [] }, { t: 'move', from: 'e2', to: 'e4', promotion: { a: 1 } }, { t: 'move', from: 'zz', to: '\u0000' }, { t: '__proto__' }, { t: 'constructor' }];
  for (const [label, client] of [['spettatore', c], ['ospite', g], ['giocatore', b]] as const) {
    for (const msg of junk) send(client, msg);
    await survives(`messaggi senza senso da ${label}`);
  }

  // Dopo un eventuale riavvio i collegamenti vanno rifatti.
  const a2 = await connect(gameId, anna);
  const b2 = await connect(gameId, bruno);
  send(a2, 'x'.repeat(5000));
  await survives('messaggio enorme');
  const a3 = await connect(gameId, anna);
  for (let i = 0; i < 5000; i++) send(a3, { t: 'draw' });
  await sleep(1500);
  await survives('5000 messaggi a raffica');
  check('chi manda messaggi a raffica viene scollegato', a3.closed());

  const sockets: Client[] = [];
  for (let i = 0; i < 80; i++) sockets.push(await connect(gameId, null));
  await survives('80 collegamenti alla stessa partita');
  check('i collegamenti alla stessa partita hanno un tetto', sockets.some((s) => s.closed()), `chiusi ${sockets.filter((s) => s.closed()).length}`);
  for (const s of sockets) s.ws.terminate();

  const a4 = await connect(gameId, anna);
  send(a4, { t: 'move', from: 'e2', to: 'e4' });
  await sleep(300);
  check('dopo tutto questo la partita funziona ancora', b2.state()?.moves.join() === 'e4' || (await connect(gameId, bruno)).state()?.moves.join() === 'e4');
  const mine = await api('GET', '/api/games', undefined, carla);
  check('ognuno vede solo le proprie partite', mine.data.games?.length === 0);

  console.log('\n— Limiti ai tentativi —');
  let wrong = 0;
  let blocked = false;
  for (let i = 0; i < 14 && !blocked; i++) {
    const r = await api('POST', '/api/login', { username: 'carla', password: `tentativo-${i}` });
    if (r.status === 401) wrong++;
    blocked = r.status === 429;
  }
  check('chi prova a indovinare una password viene fermato', blocked && wrong <= 10, `${wrong} tentativi`);
  const games: number[] = [];
  for (let i = 0; i < 34; i++) games.push((await api('POST', '/api/games', { time: 'none' }, carla)).status);
  check('non si possono creare partite a raffica', games.includes(429), `${games.filter((s) => s === 200).length} create`);
  const regs: number[] = [];
  for (let i = 0; i < 12; i++) regs.push((await api('POST', '/api/register', { username: `spam_${i}`, password: PASSWORD })).status);
  check('non si possono creare account a raffica', regs.includes(429), `${regs.filter((s) => s === 200).length} creati`);
  await survives('tentativi a raffica');

  console.log('\n— Registrazioni chiuse —');
  await api('PUT', '/api/admin/settings', { registration: false }, admin);
  const closed = await api('POST', '/api/register', { username: 'tardivo', password: PASSWORD });
  check('a registrazioni chiuse non entra nessuno', closed.status === 403 || closed.status === 429, String(closed.status));
  const disabled = await api('PATCH', `/api/admin/users/${carla.id}`, { disabled: true }, admin);
  const after = await api('GET', '/api/games', undefined, carla);
  check('un account disattivato dall\'admin viene buttato fuori subito', disabled.status === 200 && after.status === 401, `${disabled.status}/${after.status}`);
}

main()
  .catch((e) => {
    failures++;
    console.error('✗ prova interrotta:', e);
  })
  .finally(async () => {
    server?.kill();
    await sleep(500);
    rmSync(dataDir, { recursive: true, force: true });
    console.log(failures ? `\n${failures} problemi su ${checks} controlli` : `\n✓ ${checks} controlli superati`);
    process.exit(failures ? 1 : 0);
  });
