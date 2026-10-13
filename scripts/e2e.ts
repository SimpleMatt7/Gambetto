// Prova completa del server: account, progressi, permessi, partita online con arbitro e orologio.
// Avvia un server su una porta e un database temporanei, poi lo spegne.
// Con E2E_BASE=http://... prova invece un server già acceso (per esempio il contenitore Docker):
// deve avere il database vuoto ed essere stato avviato con CLAIM_MS=500.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';

const PORT = 8799;
const EXTERNAL = process.env.E2E_BASE;
const BASE = EXTERNAL ?? `http://localhost:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), 'gambetto-e2e-'));
const server = EXTERNAL ? null : spawn(process.execPath, ['server/index.ts'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, CLAIM_MS: '500' }, stdio: ['ignore', 'pipe', 'inherit'] });

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`);
}

class Client {
  cookie = '';
  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    return { status: res.status, data: (await res.json()) as Record<string, any> };
  }
  socket(gameId: string) {
    const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?game=${gameId}`, { headers: this.cookie ? { Cookie: this.cookie } : {} });
    const conn = { ws, state: null as Record<string, any> | null, gone: false };
    ws.on('message', (d) => {
      const msg = JSON.parse(String(d));
      if (msg.t === 'state') conn.state = msg;
      if (msg.t === 'gone') conn.gone = true;
    });
    return conn;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await sleep(20);
  return cond();
}

async function main() {
  if (server) await new Promise<void>((r) => server.stdout.once('data', () => r()));

  const anna = new Client();
  const bruno = new Client();
  const guest = new Client();

  // ── Account ──
  let r = await anna.call('POST', '/api/register', { username: 'anna', password: 'password-anna' });
  check('registrazione: il primo utente è admin', r.status === 200 && r.data.user.role === 'admin', r);
  r = await bruno.call('POST', '/api/register', { username: 'bruno', password: 'password-bruno' });
  check('registrazione: il secondo è utente normale', r.data.user?.role === 'user', r);
  r = await guest.call('POST', '/api/register', { username: 'ANNA', password: 'password-altra' });
  check('nome utente già in uso (anche con maiuscole)', r.status === 409, r);
  r = await guest.call('POST', '/api/register', { username: 'carla', password: 'corta' });
  check('password troppo corta rifiutata', r.status === 400, r);
  r = await guest.call('POST', '/api/login', { username: 'anna', password: 'sbagliata' });
  check('accesso con password errata rifiutato', r.status === 401, r);
  r = await guest.call('GET', '/api/me');
  check('ospite: nessun utente', r.data.user === null, r);
  r = await anna.call('GET', '/api/me');
  check('sessione riconosciuta dal cookie', r.data.user?.username === 'anna', r);
  r = await anna.call('POST', '/api/logout', {}, { Origin: 'https://sito-estraneo.example' });
  check('richiesta da un altro sito bloccata', r.status === 403, r);

  // ── Progressi ──
  r = await bruno.call('PUT', '/api/progress', { lessons: ['base/pedone', 'base/pedone', 42], lines: ['italiana'], stats: { 3: { w: 2, l: 1, d: 0 } }, extra: 'x' });
  check('progressi salvati e ripuliti', r.data.progress?.lessons.length === 1 && r.data.progress.stats['3'].w === 2 && !('extra' in r.data.progress), r);
  const bruno2 = new Client();
  r = await bruno2.call('POST', '/api/login', { username: 'bruno', password: 'password-bruno' });
  check('progressi ritrovati da un altro dispositivo', r.data.progress?.lines[0] === 'italiana', r);
  r = await guest.call('PUT', '/api/progress', { lessons: [] });
  check('ospite non può salvare progressi', r.status === 401, r);

  // ── Permessi admin ──
  r = await bruno.call('GET', '/api/admin/overview');
  check('utente normale escluso dal pannello admin', r.status === 403, r);
  r = await anna.call('GET', '/api/admin/overview');
  check('admin vede gli utenti', r.data.users?.length === 2, r);
  const brunoId = r.data.users.find((u: any) => u.username === 'bruno').id;
  const annaId = r.data.users.find((u: any) => u.username === 'anna').id;
  r = await anna.call('PATCH', `/api/admin/users/${annaId}`, { role: 'user' });
  check('admin non può togliersi i permessi', r.status === 400, r);

  // ── Partita online ──
  r = await guest.call('POST', '/api/games', { time: 'none' });
  check('ospite non può creare partite online', r.status === 401, r);
  r = await anna.call('POST', '/api/games', { time: 'none', color: 'white' });
  const gameId: string = r.data.id;
  check('partita creata', typeof gameId === 'string', r);

  const a = anna.socket(gameId);
  await until(() => a.state !== null);
  check('creatrice in attesa come Bianco', a.state?.status === 'waiting' && a.state?.you === 'white', a.state);
  const b = bruno.socket(gameId);
  await until(() => b.state?.status === 'active' && a.state?.status === 'active');
  check('l\'avversario entra dal link e la partita parte', b.state?.you === 'black' && a.state?.black?.name === 'bruno', b.state);
  const g = guest.socket(gameId);
  await until(() => g.state !== null);
  check('un ospite può solo guardare', g.state?.you === 'spectator', g.state);

  const send = (c: { ws: WebSocket }, msg: object) => c.ws.send(JSON.stringify(msg));
  send(b, { t: 'move', from: 'e7', to: 'e5' });
  await sleep(150);
  check('mossa fuori turno ignorata', a.state?.moves.length === 0, a.state?.moves);
  send(a, { t: 'move', from: 'e2', to: 'e5' });
  await sleep(150);
  check('mossa illegale rifiutata dall\'arbitro', a.state?.moves.length === 0, a.state?.moves);
  send(g, { t: 'move', from: 'e2', to: 'e4' });
  await sleep(150);
  check('lo spettatore non può muovere', a.state?.moves.length === 0, a.state?.moves);

  // Matto dell'imbecille: f3 e5 g4 Dh4#
  for (const [c, from, to] of [[a, 'f2', 'f3'], [b, 'e7', 'e5'], [a, 'g2', 'g4'], [b, 'd8', 'h4']] as const) {
    const n = a.state!.moves.length;
    send(c, { t: 'move', from, to });
    await until(() => a.state!.moves.length === n + 1);
  }
  await until(() => a.state?.status === 'finished');
  check('scacco matto riconosciuto dal server', a.state?.result === 'black' && a.state?.reason === 'Scacco matto' && a.state.moves.join(' ') === 'f3 e5 g4 Qh4#', a.state);
  send(a, { t: 'move', from: 'e2', to: 'e4' });
  await sleep(100);
  check('nessuna mossa a partita finita', a.state?.moves.length === 4);

  // Rivincita a colori invertiti
  send(a, { t: 'rematch' });
  await until(() => b.state?.rematchOffer === 'white');
  send(b, { t: 'rematch' });
  await until(() => !!a.state?.rematchId);
  check('rivincita creata', typeof a.state?.rematchId === 'string', a.state);
  const a2 = anna.socket(a.state!.rematchId);
  await until(() => a2.state !== null);
  check('rivincita: colori invertiti e partita attiva', a2.state?.you === 'black' && a2.state?.status === 'active', a2.state);
  send(a2, { t: 'resign' });
  await until(() => a2.state?.status === 'finished');
  check('abbandono', a2.state?.result === 'white' && a2.state?.reason === 'Abbandono', a2.state);

  // Patta d'accordo
  r = await anna.call('POST', '/api/games', { time: 'none', color: 'black' });
  const d1 = anna.socket(r.data.id);
  const d2 = bruno.socket(r.data.id);
  await until(() => d1.state?.status === 'active' && d2.state?.status === 'active');
  send(d1, { t: 'draw' });
  await until(() => d2.state?.drawOffer === 'black');
  send(d2, { t: 'draw' });
  await until(() => d1.state?.status === 'finished');
  check('patta d\'accordo', d1.state?.result === 'draw', d1.state);

  // Orologio: si usa una partita a tempo e si controlla che scorra solo dopo la prima mossa
  r = await anna.call('POST', '/api/games', { time: '3+2', color: 'white' });
  const t1 = anna.socket(r.data.id);
  const t2 = bruno.socket(r.data.id);
  await until(() => t1.state?.status === 'active' && t2.state?.status === 'active');
  check('orologio fermo prima della prima mossa', t1.state?.clock.running === false && t1.state.clock.white === 180000, t1.state?.clock);
  send(t1, { t: 'move', from: 'e2', to: 'e4' });
  await until(() => t1.state?.moves.length === 1);
  await sleep(300);
  send(t2, { t: 'move', from: 'e7', to: 'e5' });
  await until(() => t1.state?.moves.length === 2);
  const clock = t1.state!.clock;
  check('orologio: il Nero ha consumato tempo e ricevuto l\'incremento', clock.running && clock.white > 179900 && clock.white <= 180000 && clock.black > 181000 && clock.black < 182000, clock);

  // Avversario che sparisce
  r = await anna.call('POST', '/api/games', { time: 'none', color: 'white' });
  const c1 = anna.socket(r.data.id);
  const c2 = bruno.socket(r.data.id);
  await until(() => c1.state?.status === 'active' && c2.state?.status === 'active');
  check('giocatori presenti: nessuna assenza', c1.state?.away.white === null && c1.state?.away.black === null, c1.state?.away);
  c2.ws.close();
  await until(() => c1.state?.online.black === false);
  send(c1, { t: 'claim' });
  await sleep(150);
  check('vittoria non reclamabile subito', c1.state?.status === 'active' && c1.state.away.black !== null, c1.state?.away);
  await sleep(500);
  send(c1, { t: 'claim' });
  await until(() => c1.state?.status === 'finished');
  check('vittoria reclamata per assenza dell\'avversario', c1.state?.result === 'white' && c1.state?.reason === 'Avversario assente', c1.state);

  // Annullamento di una partita in attesa
  r = await bruno.call('POST', '/api/games', { time: 'none' });
  const w = bruno.socket(r.data.id);
  await until(() => w.state !== null);
  send(w, { t: 'cancel' });
  await until(() => w.gone);
  check('partita in attesa annullata', w.gone);

  r = await anna.call('GET', '/api/games');
  check('elenco delle mie partite', r.data.games?.length === 5 && r.data.games.some((x: any) => x.plies === 4), r.data.games?.length);

  // ── Eliminazione del proprio account ──
  const elsa = new Client();
  await elsa.call('POST', '/api/register', { username: 'elsa', password: 'password-elsa' });
  r = await elsa.call('POST', '/api/games', { time: 'none', color: 'white' });
  const e1 = elsa.socket(r.data.id);
  const e2 = bruno.socket(r.data.id);
  await until(() => e2.state?.status === 'active');
  r = await elsa.call('POST', '/api/account/delete', { password: 'sbagliata' });
  check('eliminazione account: serve la password giusta', r.status === 401, r);
  r = await elsa.call('POST', '/api/account/delete', { password: 'password-elsa' });
  await until(() => e2.state?.status === 'finished' && e2.state?.white === null);
  check('eliminazione account: la partita in corso va all\'avversario', r.status === 200 && e2.state?.result === 'black' && e2.state?.white === null, e2.state);
  e1.ws.close();
  r = await elsa.call('POST', '/api/login', { username: 'elsa', password: 'password-elsa' });
  check('account eliminato: non si può più accedere', r.status === 401, r);
  r = await anna.call('POST', '/api/account/delete', { password: 'password-anna' });
  check('l\'unico admin non può eliminarsi', r.status === 400, r);

  // ── Impostazioni del sito ──
  r = await bruno.call('PUT', '/api/admin/settings', { registration: false });
  check('solo l\'admin cambia le impostazioni', r.status === 403, r);
  r = await anna.call('PUT', '/api/admin/settings', { registration: false, online: false, spectators: false, notice: '  Manutenzione stasera  ', altro: 1 });
  check('impostazioni salvate e ripulite', r.data.settings?.notice === 'Manutenzione stasera' && !('altro' in r.data.settings), r);
  r = await guest.call('POST', '/api/register', { username: 'dario', password: 'password-dario' });
  check('registrazioni chiuse', r.status === 403, r);
  r = await bruno.call('POST', '/api/games', { time: 'none' });
  check('partite online sospese', r.status === 403, r);
  r = await guest.call('GET', '/api/me');
  check('avviso visibile a tutti', r.data.config?.notice === 'Manutenzione stasera' && r.data.config.online === false, r);
  const blocked = guest.socket(t1.state!.id);
  await until(() => blocked.gone);
  check('spettatori esclusi quando non ammessi', blocked.gone && blocked.state === null);
  await anna.call('PUT', '/api/admin/settings', { registration: true, online: true, spectators: true, notice: '' });

  // ── Azioni admin ──
  r = await anna.call('PATCH', `/api/admin/users/${brunoId}`, { disabled: true });
  r = await bruno.call('GET', '/api/me');
  check('utente disattivato: sessione chiusa', r.data.user === null, r);
  r = await bruno.call('POST', '/api/login', { username: 'bruno', password: 'password-bruno' });
  check('utente disattivato: accesso negato', r.status === 403, r);
  await anna.call('PATCH', `/api/admin/users/${brunoId}`, { disabled: false, password: 'nuova-password' });
  r = await bruno.call('POST', '/api/login', { username: 'bruno', password: 'nuova-password' });
  check('admin reimposta la password', r.status === 200, r);
  r = await anna.call('DELETE', `/api/admin/games/${gameId}`);
  check('admin elimina una partita', r.status === 200, r);
  r = await anna.call('DELETE', `/api/admin/users/${brunoId}`);
  r = await anna.call('GET', '/api/admin/overview');
  check('admin elimina un utente; le sue partite restano', r.data.users.length === 1 && r.data.games.length === 5, { users: r.data.users.length, games: r.data.games.length });
}

main()
  .catch((e) => {
    failed++;
    console.error(e);
  })
  .finally(async () => {
    server?.kill();
    await sleep(300);
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* su Windows il file può restare bloccato per un attimo */
    }
    console.log(failed ? `\n${failed} controlli falliti` : '\nTutti i controlli superati');
    process.exit(failed ? 1 : 0);
  });
