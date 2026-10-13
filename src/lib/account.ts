import { useSyncExternalStore } from 'react';
import { getState, subscribe, update, type AppState } from './store.ts';

export interface User {
  id: number;
  username: string;
  role: 'user' | 'admin';
}

type Progress = Partial<Pick<AppState, 'lessons' | 'lines' | 'stats'>>;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Connessione al server non riuscita.');
  }
  let data: { error?: string };
  try {
    data = await res.json();
  } catch {
    throw new ApiError(res.status, 'Il server non è raggiungibile. Riprova più tardi.');
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Qualcosa è andato storto.');
  return data as T;
}

export interface SiteConfig {
  registration: boolean;
  online: boolean;
  notice: string;
  contact: string;
}

interface Account {
  user: User | null;
  config: SiteConfig;
  /** false finché non si sa se c'è una sessione aperta. */
  ready: boolean;
}

let account: Account = { user: null, ready: false, config: { registration: true, online: true, notice: '', contact: '' } };
const listeners = new Set<() => void>();

function setAccount(next: Account) {
  account = next;
  listeners.forEach((l) => l());
}

export function useAccount(): Account {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => account,
  );
}

const snapshot = () => {
  const { lessons, lines, stats } = getState();
  return JSON.stringify({ lessons, lines, stats });
};

let lastPushed = '';
let pushTimer = 0;

async function push() {
  window.clearTimeout(pushTimer);
  const data = snapshot();
  if (!account.user || data === lastPushed) return;
  lastPushed = data;
  try {
    await api('PUT', '/api/progress', JSON.parse(data));
  } catch {
    // Si riproverà al prossimo cambiamento.
    lastPushed = '';
  }
}

// Ogni progresso fatto da chi ha un account viene salvato sul server poco dopo.
subscribe(() => {
  if (!account.user || snapshot() === lastPushed) return;
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(push, 1200);
});

/** All'accesso si uniscono i progressi del dispositivo e quelli dell'account: non si perde nulla. */
function adopt(user: User, remote: Progress, config?: SiteConfig) {
  setAccount({ user, ready: true, config: config ?? account.config });
  update((s) => {
    const stats = { ...s.stats };
    for (const [level, r] of Object.entries(remote.stats ?? {})) {
      const mine = stats[+level] ?? { w: 0, l: 0, d: 0 };
      stats[+level] = { w: Math.max(mine.w, r.w), l: Math.max(mine.l, r.l), d: Math.max(mine.d, r.d) };
    }
    return {
      ...s,
      lessons: [...new Set([...s.lessons, ...(remote.lessons ?? [])])],
      lines: [...new Set([...s.lines, ...(remote.lines ?? [])])],
      stats,
    };
  });
  void push();
}

export async function initAccount() {
  try {
    const r = await api<{ user: User | null; progress?: Progress; config: SiteConfig }>('GET', '/api/me');
    if (r.user) return adopt(r.user, r.progress ?? {}, r.config);
    return setAccount({ user: null, ready: true, config: r.config });
  } catch {
    /* senza server l'app funziona comunque in modalità ospite */
  }
  setAccount({ ...account, user: null, ready: true });
}

export async function signIn(mode: 'login' | 'register', username: string, password: string) {
  const r = await api<{ user: User; progress: Progress; config: SiteConfig }>('POST', `/api/${mode}`, { username, password });
  adopt(r.user, r.progress ?? {}, r.config);
}

export function setSiteConfig(config: SiteConfig) {
  setAccount({ ...account, config });
}

export async function signOut() {
  await push();
  try {
    await api('POST', '/api/logout', {});
  } catch {
    /* la sessione locale si chiude comunque */
  }
  forget();
}

/** Scollega il dispositivo: i progressi restano sull'account, qui si riparte puliti per il prossimo che lo usa. */
function forget() {
  window.clearTimeout(pushTimer);
  setAccount({ ...account, user: null, ready: true });
  lastPushed = '';
  update((s) => ({ ...s, lessons: [], lines: [], stats: {} }));
}

export async function deleteAccount(password: string) {
  await api('POST', '/api/account/delete', { password });
  forget();
}
