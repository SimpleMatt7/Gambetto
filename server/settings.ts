import { all, db, run } from './db.ts';

db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

/** Impostazioni del sito modificabili dal pannello di amministrazione. */
export interface Settings {
  /** Chiunque può creare un account. */
  registration: boolean;
  /** Le partite online sono disponibili. */
  online: boolean;
  /** Chi non gioca può guardare una partita avendo il link. */
  spectators: boolean;
  /** Avviso mostrato in cima a tutte le pagine; vuoto per nasconderlo. */
  notice: string;
  /** Recapito del gestore, mostrato nella pagina sulla privacy. */
  contact: string;
}

const DEFAULTS: Settings = { registration: true, online: true, spectators: true, notice: '', contact: '' };

let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  const stored: Record<string, unknown> = {};
  for (const row of all<{ key: string; value: string }>('SELECT key, value FROM settings')) {
    try {
      stored[row.key] = JSON.parse(row.value);
    } catch {
      /* valore illeggibile: vale il predefinito */
    }
  }
  cache = clean({ ...DEFAULTS, ...stored });
  return cache;
}

function clean(input: Record<string, unknown>): Settings {
  const flag = (key: 'registration' | 'online' | 'spectators') => (typeof input[key] === 'boolean' ? (input[key] as boolean) : DEFAULTS[key]);
  return {
    registration: flag('registration'),
    online: flag('online'),
    spectators: flag('spectators'),
    notice: typeof input.notice === 'string' ? input.notice.trim().slice(0, 300) : '',
    contact: typeof input.contact === 'string' ? input.contact.trim().slice(0, 120) : '',
  };
}

export function saveSettings(input: Record<string, unknown>): Settings {
  const next = clean({ ...getSettings(), ...input });
  for (const [key, value] of Object.entries(next)) {
    run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  }
  cache = next;
  return next;
}
