import { useSyncExternalStore } from 'react';

export type BoardTheme = 'noce' | 'sabbia' | 'torneo' | 'smeraldo' | 'ghiaccio' | 'ardesia' | 'notte' | 'ametista' | 'rosa' | 'carbone';
/** Scacchiera usata quando è attivo il 3D. */
export type Board3d =
  | 'legno-chiaro'
  | 'palissandro'
  | 'legno-scuro'
  | 'legno-vetro'
  | 'giada'
  | 'marmo'
  | 'vetro-verde'
  | 'vetro'
  | 'blu'
  | 'blu-lucido'
  | 'verde-lucido'
  | 'grigio-lucido'
  | 'scarlatto'
  | 'giallo'
  | 'viola'
  | 'cera'
  | 'oro-argento'
  | 'alluminio'
  | 'bianco-nero'
  | 'verniciato';
/** Aspetto dell'interfaccia: 'auto' segue l'impostazione del dispositivo. */
export type Appearance = 'dark' | 'light' | 'auto';
/** Stile dei pezzi quando la scacchiera è in 3D. */
export type Pieces3d = 'classico' | 'legno-chiaro' | 'legno' | 'metallo' | 'vetro' | 'giada' | 'essenziale' | 'rifinito' | 'rossoblu' | 'sperimentale';

export interface AppState {
  settings: {
    boardTheme: BoardTheme;
    appearance: Appearance;
    board3d: boolean;
    board3dStyle: Board3d;
    pieces3d: Pieces3d;
    sound: boolean;
    showDests: boolean;
    coords: boolean;
    evalBar: boolean;
    level: number;
  };
  /** Lezioni completate, come 'corso/lezione'. */
  lessons: string[];
  /** Aperture e trappole allenate fino in fondo. */
  lines: string[];
  stats: Record<number, { w: number; l: number; d: number }>;
  /** Problemi tattici: punteggio (tipo Elo) e identificativi dei problemi affrontati. */
  puzzles: { rating: number; solved: string[]; failed: string[] };
}

const KEY = 'gambetto:v1';
const defaults: AppState = {
  settings: { boardTheme: 'noce', appearance: 'dark', board3d: false, board3dStyle: 'legno-chiaro', pieces3d: 'classico', sound: true, showDests: true, coords: true, evalBar: false, level: 3 },
  lessons: [],
  lines: [],
  stats: {},
  puzzles: { rating: 1000, solved: [], failed: [] },
};

function load(): AppState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { ...defaults, ...raw, settings: { ...defaults.settings, ...raw.settings }, puzzles: { ...defaults.puzzles, ...raw.puzzles } };
  } catch {
    return defaults;
  }
}

let state = load();
const listeners = new Set<() => void>();

export function getState() {
  return state;
}

export function update(fn: (s: AppState) => AppState) {
  state = fn(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* archiviazione non disponibile: si prosegue senza salvare */
  }
  listeners.forEach((l) => l());
}

export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useStore(): AppState {
  return useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, getState);
}

export function setSetting<K extends keyof AppState['settings']>(key: K, value: AppState['settings'][K]) {
  update((s) => ({ ...s, settings: { ...s.settings, [key]: value } }));
}

export function completeLesson(id: string) {
  update((s) => (s.lessons.includes(id) ? s : { ...s, lessons: [...s.lessons, id] }));
}

export function completeLine(id: string) {
  update((s) => (s.lines.includes(id) ? s : { ...s, lines: [...s.lines, id] }));
}

export function recordResult(level: number, outcome: 'w' | 'l' | 'd') {
  update((s) => {
    const cur = s.stats[level] ?? { w: 0, l: 0, d: 0 };
    return { ...s, stats: { ...s.stats, [level]: { ...cur, [outcome]: cur[outcome] + 1 } } };
  });
}

/**
 * Registra l'esito di un problema e aggiorna il punteggio con la formula Elo: si guadagna di più risolvendo
 * problemi difficili, si perde di più sbagliando quelli facili. Conta solo il primo tentativo su ogni problema.
 * Restituisce la variazione del punteggio.
 */
export function recordPuzzle(id: string, puzzleRating: number, ok: boolean): number {
  const { puzzles } = state;
  const seen = puzzles.solved.includes(id) || puzzles.failed.includes(id);
  const expected = 1 / (1 + 10 ** ((puzzleRating - puzzles.rating) / 400));
  const delta = seen ? 0 : Math.round(32 * ((ok ? 1 : 0) - expected));
  update((s) => ({
    ...s,
    puzzles: {
      rating: Math.max(400, Math.min(3000, s.puzzles.rating + delta)),
      solved: ok && !s.puzzles.solved.includes(id) ? [...s.puzzles.solved, id] : s.puzzles.solved,
      failed: !ok && !seen ? [...s.puzzles.failed, id] : s.puzzles.failed,
    },
  }));
  return delta;
}
