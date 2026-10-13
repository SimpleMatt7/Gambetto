import { randomBytes } from 'node:crypto';
import { Chess } from 'chess.js';
import type { WebSocket } from 'ws';
import { all, one, run, type GameRow, type UserRow } from './db.ts';

type Side = 'white' | 'black';
const other = (s: Side): Side => (s === 'white' ? 'black' : 'white');

/** Una partita tenuta in memoria finché qualcuno la guarda o l'orologio corre. */
interface Room {
  row: GameRow;
  chess: Chess;
  sockets: Map<WebSocket, number | null>;
  timer: NodeJS.Timeout | null;
  drawOffer: Side | null;
  rematchOffer: Side | null;
  rematchId: string | null;
  /** Da quando ciascun giocatore non è collegato (null se è presente). */
  left: Record<Side, number | null>;
}

/** Dopo quanto tempo di assenza dell'avversario si può reclamare la vittoria. */
const CLAIM_MS = Number(process.env.CLAIM_MS ?? 300_000);

const rooms = new Map<string, Room>();

/** Quanti collegamenti può avere una partita, e quanti messaggi può mandare ciascuno in dieci secondi. */
const MAX_ROOM_SOCKETS = 40;
const MAX_BURST = 60;

export const TIME_CONTROLS: Record<string, [number, number]> = {
  none: [0, 0],
  '3+2': [180, 2],
  '5+0': [300, 0],
  '10+0': [600, 0],
  '15+10': [900, 10],
};

// Senza caratteri ambigui (0/O, 1/l): il codice si detta anche a voce.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const newId = () => Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join('');

export function createGame(white: number | null, black: number | null, timeBase: number, timeInc: number): string {
  const id = newId();
  const now = Date.now();
  run(
    'INSERT INTO games (id, white_id, black_id, status, time_base, time_inc, white_ms, black_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    white,
    black,
    white !== null && black !== null ? 'active' : 'waiting',
    timeBase,
    timeInc,
    timeBase * 1000,
    timeBase * 1000,
    now,
    now,
  );
  return id;
}

function getRoom(id: string): Room | null {
  const cached = rooms.get(id);
  if (cached) return cached;
  const row = one<GameRow>('SELECT * FROM games WHERE id = ?', id);
  if (!row) return null;
  const chess = new Chess();
  for (const san of row.moves.split(' ').filter(Boolean)) chess.move(san);
  const now = Date.now();
  const room: Room = { row, chess, sockets: new Map(), timer: null, drawOffer: null, rematchOffer: null, rematchId: null, left: { white: now, black: now } };
  rooms.set(id, room);
  // Dopo un riavvio del server l'orologio potrebbe essere scaduto nel frattempo.
  armClock(room);
  return room;
}

const turnOf = (room: Room): Side => (room.chess.turn() === 'w' ? 'white' : 'black');
const clockRunning = (r: GameRow) => r.status === 'active' && r.time_base > 0 && r.last_move_at !== null;

function sideOf(room: Room, userId: number | null): Side | null {
  if (userId === null) return null;
  if (room.row.white_id === userId) return 'white';
  if (room.row.black_id === userId) return 'black';
  return null;
}

function persist(room: Room) {
  const r = room.row;
  r.moves = room.chess.history().join(' ');
  r.updated_at = Date.now();
  run(
    'UPDATE games SET white_id = ?, black_id = ?, status = ?, result = ?, reason = ?, moves = ?, white_ms = ?, black_ms = ?, last_move_at = ?, updated_at = ? WHERE id = ?',
    r.white_id,
    r.black_id,
    r.status,
    r.result,
    r.reason,
    r.moves,
    r.white_ms,
    r.black_ms,
    r.last_move_at,
    r.updated_at,
    r.id,
  );
}

function player(id: number | null) {
  if (id === null) return null;
  const u = one<Pick<UserRow, 'id' | 'username'>>('SELECT id, username FROM users WHERE id = ?', id);
  return u ? { id: u.id, name: u.username } : null;
}

function view(room: Room, viewer: number | null) {
  const r = room.row;
  let { white_ms: white, black_ms: black } = r;
  if (clockRunning(r)) {
    const elapsed = Date.now() - r.last_move_at!;
    if (turnOf(room) === 'white') white = Math.max(0, white - elapsed);
    else black = Math.max(0, black - elapsed);
  }
  const present = new Set(room.sockets.values());
  return {
    t: 'state',
    id: r.id,
    status: r.status,
    white: player(r.white_id),
    black: player(r.black_id),
    moves: room.chess.history(),
    timeBase: r.time_base,
    timeInc: r.time_inc,
    clock: { white, black, running: clockRunning(r) },
    result: r.result,
    reason: r.reason,
    drawOffer: room.drawOffer,
    rematchOffer: room.rematchOffer,
    rematchId: room.rematchId,
    you: sideOf(room, viewer) ?? 'spectator',
    online: { white: r.white_id !== null && present.has(r.white_id), black: r.black_id !== null && present.has(r.black_id) },
    away: { white: room.left.white === null ? null : Date.now() - room.left.white, black: room.left.black === null ? null : Date.now() - room.left.black },
    claimAfter: CLAIM_MS,
  };
}

/** Aggiorna da quanto tempo manca ciascun giocatore. */
function markPresence(room: Room) {
  const present = new Set(room.sockets.values());
  for (const side of ['white', 'black'] as const) {
    const id = side === 'white' ? room.row.white_id : room.row.black_id;
    if (id !== null && present.has(id)) room.left[side] = null;
    else room.left[side] ??= Date.now();
  }
}

function broadcast(room: Room) {
  for (const [socket, userId] of room.sockets) socket.send(JSON.stringify(view(room, userId)));
}

function release(room: Room) {
  // Una partita a tempo resta in memoria anche senza spettatori: deve poter scadere.
  if (room.sockets.size === 0 && !room.timer) rooms.delete(room.row.id);
}

function finish(room: Room, result: 'white' | 'black' | 'draw', reason: string) {
  if (room.row.status === 'finished') return;
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  room.row.status = 'finished';
  room.row.result = result;
  room.row.reason = reason;
  room.drawOffer = null;
  persist(room);
  broadcast(room);
  release(room);
}

/** Programma la caduta della bandierina per chi deve muovere. */
function armClock(room: Room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  const r = room.row;
  if (!clockRunning(r)) return;
  const side = turnOf(room);
  const left = (side === 'white' ? r.white_ms : r.black_ms) - (Date.now() - r.last_move_at!);
  room.timer = setTimeout(() => {
    room.timer = null;
    if (side === 'white') r.white_ms = 0;
    else r.black_ms = 0;
    finish(room, other(side), 'Tempo scaduto');
  }, Math.max(0, left) + 30);
}

function onMove(room: Room, side: Side, msg: { from?: unknown; to?: unknown; promotion?: unknown }) {
  const r = room.row;
  if (r.status !== 'active' || turnOf(room) !== side) return;
  if (typeof msg.from !== 'string' || typeof msg.to !== 'string') return;
  const now = Date.now();
  try {
    room.chess.move({ from: msg.from, to: msg.to, promotion: typeof msg.promotion === 'string' ? msg.promotion : undefined });
  } catch {
    // Mossa illegale: si rimanda lo stato corretto, così la scacchiera del giocatore si riallinea.
    return;
  }
  if (r.time_base > 0) {
    // L'orologio parte dopo la prima mossa del Bianco.
    if (r.last_move_at !== null) {
      const key = side === 'white' ? 'white_ms' : 'black_ms';
      r[key] = r[key] - (now - r.last_move_at) + r.time_inc * 1000;
    }
    r.last_move_at = now;
  }
  room.drawOffer = null;
  const c = room.chess;
  if (c.isCheckmate()) return finish(room, side, 'Scacco matto');
  if (c.isStalemate()) return finish(room, 'draw', 'Stallo');
  if (c.isThreefoldRepetition()) return finish(room, 'draw', 'Tripla ripetizione');
  if (c.isInsufficientMaterial()) return finish(room, 'draw', 'Materiale insufficiente');
  if (c.isDraw()) return finish(room, 'draw', 'Regola delle 50 mosse');
  persist(room);
  armClock(room);
}

function onMessage(room: Room, socket: WebSocket, userId: number | null, raw: string) {
  let msg: { t?: string; from?: unknown; to?: unknown; promotion?: unknown };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (typeof msg !== 'object' || msg === null) return;
  const side = sideOf(room, userId);
  const r = room.row;
  if (!side) return;

  if (msg.t === 'move') {
    onMove(room, side, msg);
  } else if (msg.t === 'resign' && r.status === 'active') {
    return finish(room, other(side), 'Abbandono');
  } else if (msg.t === 'draw' && r.status === 'active') {
    if (room.drawOffer === other(side)) return finish(room, 'draw', 'Patta d\'accordo');
    room.drawOffer = side;
  } else if (msg.t === 'draw-decline' && room.drawOffer === other(side)) {
    room.drawOffer = null;
  } else if (msg.t === 'claim' && r.status === 'active') {
    // L'avversario è sparito da abbastanza tempo: chi è rimasto può prendersi la vittoria.
    const since = room.left[other(side)];
    if (since !== null && Date.now() - since >= CLAIM_MS) return finish(room, side, 'Avversario assente');
  } else if (msg.t === 'cancel' && r.status === 'waiting') {
    run('DELETE FROM games WHERE id = ?', r.id);
    rooms.delete(r.id);
    for (const s of room.sockets.keys()) {
      s.send(JSON.stringify({ t: 'gone' }));
      s.close();
    }
    return;
  } else if (msg.t === 'rematch' && r.status === 'finished' && !room.rematchId && r.white_id !== null && r.black_id !== null) {
    if (room.rematchOffer === other(side)) {
      // Rivincita a colori invertiti.
      room.rematchId = createGame(r.black_id, r.white_id, r.time_base, r.time_inc);
      room.rematchOffer = null;
    } else {
      room.rematchOffer = side;
    }
  }
  broadcast(room);
}

/** Collega un visitatore a una partita. Restituisce false se la partita non esiste. */
export function joinGame(id: string, socket: WebSocket, user: UserRow | null, allowSpectators = true): boolean {
  const room = getRoom(id);
  if (!room) return false;
  const userId = user?.id ?? null;
  const r = room.row;

  // Chi apre il link di una partita in attesa, se ha un account, diventa l'avversario.
  if (r.status === 'waiting' && userId !== null && sideOf(room, userId) === null) {
    if (r.white_id === null) r.white_id = userId;
    else r.black_id = userId;
    r.status = 'active';
    persist(room);
  }
  // A partita iniziata, chi non gioca entra solo se gli spettatori sono ammessi (gli admin sempre).
  if (r.status !== 'waiting' && sideOf(room, userId) === null && !allowSpectators && user?.role !== 'admin') {
    release(room);
    return false;
  }

  // Troppi collegamenti alla stessa partita: i giocatori entrano sempre, gli altri no.
  if (room.sockets.size >= MAX_ROOM_SOCKETS && sideOf(room, userId) === null) {
    release(room);
    return false;
  }

  room.sockets.set(socket, userId);
  markPresence(room);
  // Chi manda messaggi a raffica viene scollegato: nessuna partita vera ne richiede così tanti.
  let burst = 0;
  let burstStart = Date.now();
  socket.on('message', (data) => {
    const now = Date.now();
    if (now - burstStart > 10_000) {
      burst = 0;
      burstStart = now;
    }
    if (++burst > MAX_BURST) return socket.terminate();
    try {
      onMessage(room, socket, userId, String(data));
    } catch (e) {
      console.error(e);
    }
  });
  socket.on('close', () => {
    room.sockets.delete(socket);
    markPresence(room);
    if (rooms.get(r.id) === room) broadcast(room);
    release(room);
  });
  broadcast(room);
  return true;
}

/** Usato dal pannello di amministrazione per chiudere o eliminare una partita aperta. */
export function adminCloseGame(id: string, remove: boolean) {
  const room = getRoom(id);
  if (!room) return false;
  if (room.row.status !== 'finished') finish(room, 'draw', 'Chiusa dall\'amministratore');
  if (remove) {
    if (room.timer) clearTimeout(room.timer);
    for (const s of room.sockets.keys()) {
      s.send(JSON.stringify({ t: 'gone' }));
      s.close();
    }
    rooms.delete(id);
    run('DELETE FROM games WHERE id = ?', id);
  }
  return true;
}

/** Chiude le partite aperte di un utente che viene eliminato: quelle in corso le vince l'avversario. */
export function forfeitGamesOf(userId: number) {
  for (const { id } of all<{ id: string }>("SELECT id FROM games WHERE status != 'finished' AND (white_id = ? OR black_id = ?)", userId, userId)) {
    const room = getRoom(id);
    if (!room) continue;
    if (room.row.status === 'waiting') adminCloseGame(id, true);
    else finish(room, room.row.white_id === userId ? 'black' : 'white', 'Account eliminato');
  }
}

/** Dopo l'eliminazione di un utente: toglie il suo nome dalle partite aperte in memoria e chiude le sue connessioni. */
export function forgetUser(userId: number) {
  for (const room of [...rooms.values()]) {
    const r = room.row;
    if (r.white_id !== userId && r.black_id !== userId && ![...room.sockets.values()].includes(userId)) continue;
    if (r.white_id === userId) r.white_id = null;
    if (r.black_id === userId) r.black_id = null;
    for (const [socket, id] of room.sockets) if (id === userId) socket.close();
    broadcast(room);
  }
}

// Pulizia periodica: via gli inviti mai accettati dopo un giorno, patta per le partite ferme da due settimane.
setInterval(() => {
  const now = Date.now();
  for (const { id } of all<{ id: string }>("SELECT id FROM games WHERE status = 'waiting' AND created_at < ?", now - 86_400_000)) {
    if (!rooms.get(id)?.sockets.size) adminCloseGame(id, true);
  }
  for (const { id } of all<{ id: string }>("SELECT id FROM games WHERE status = 'active' AND updated_at < ?", now - 14 * 86_400_000)) {
    const room = getRoom(id);
    if (room) finish(room, 'draw', 'Partita abbandonata');
  }
}, 3_600_000).unref();
