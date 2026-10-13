import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { one, run, type UserRow } from './db.ts';

export const SESSION_COOKIE = 'gambetto_sid';
const SESSION_DAYS = 30;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, Buffer.from(salt, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export function checkUsername(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{3,20}$/.test(value)) {
    throw new HttpError(400, 'Il nome utente deve avere da 3 a 20 caratteri: lettere, numeri, trattino o trattino basso.');
  }
  return value;
}

export function checkPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 200) {
    throw new HttpError(400, 'La password deve avere almeno 8 caratteri.');
  }
  return value;
}

// Nel database resta solo l'impronta del token: chi leggesse il file non potrebbe riusare le sessioni.
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(userId: number) {
  const token = randomBytes(32).toString('base64url');
  run('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)', digest(token), userId, Date.now() + SESSION_DAYS * 86400_000);
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export function destroySession(token: string) {
  run('DELETE FROM sessions WHERE token = ?', digest(token));
}

export function parseCookies(header: string | undefined) {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // Un cookie scritto male si ignora.
    }
  }
  return out;
}

export function userFromRequest(req: IncomingMessage): UserRow | null {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const user = one<UserRow>(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ? AND u.disabled = 0',
    digest(token),
    Date.now(),
  );
  return user ?? null;
}

/** Limite ai tentativi: al massimo `max` per chiave in ogni finestra di tempo. */
const attempts = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.reset < now) {
    attempts.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  if (++entry.count > max) throw new HttpError(429, 'Troppi tentativi. Riprova tra qualche minuto.');
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
  run('DELETE FROM sessions WHERE expires < ?', now);
}, 600_000).unref();
