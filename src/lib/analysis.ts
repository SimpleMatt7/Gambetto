import { Chess, type Move } from 'chess.js';
import type { Engine } from './engine.ts';

/** Valutazione di una posizione, sempre dal punto di vista del Bianco. */
export interface PosEval {
  /** Centesimi di Pedone; i matti sono convertiti in valori enormi. */
  cp: number;
  /** Matto in N (0 = la posizione è già matto), null se non c'è matto forzato. */
  mate: number | null;
  /** Mossa migliore in UCI, null a partita finita. */
  best: string | null;
}

export type Grade = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface PlyReview {
  grade: Grade;
  /** Punti percentuali di probabilità di vittoria persi con la mossa. */
  loss: number;
  accuracy: number;
  bestSan: string | null;
  bestUci: string | null;
}

export const GRADES: Record<Grade, { label: string; glyph: string }> = {
  best: { label: 'Mossa migliore', glyph: '' },
  good: { label: 'Buona mossa', glyph: '' },
  inaccuracy: { label: 'Imprecisione', glyph: '?!' },
  mistake: { label: 'Errore', glyph: '?' },
  blunder: { label: 'Errore grave', glyph: '??' },
};

const MATE_CP = 10000;
const ANALYSIS_DEPTH = 12;

export async function evaluate(engine: Engine, fen: string): Promise<PosEval> {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return { cp: chess.turn() === 'w' ? -MATE_CP : MATE_CP, mate: 0, best: null };
  if (chess.isGameOver()) return { cp: 0, mate: null, best: null };
  const r = await engine.search(fen, { depth: ANALYSIS_DEPTH });
  const cp = r.mate !== null ? Math.sign(r.mate) * (MATE_CP - Math.abs(r.mate) * 10) : (r.cp ?? 0);
  return { cp, mate: r.mate, best: r.best };
}

/** Probabilità di vittoria del Bianco (0–100), con la stessa curva usata da Lichess. */
export const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);

/** Giudica ogni mossa confrontando la valutazione prima e dopo. Funziona anche ad analisi incompleta. */
export function review(history: Move[], evals: PosEval[]): PlyReview[] {
  const out: PlyReview[] = [];
  for (let i = 0; i < history.length && i + 1 < evals.length; i++) {
    const move = history[i];
    const sign = move.color === 'w' ? 1 : -1;
    const before = sign > 0 ? winPct(evals[i].cp) : 100 - winPct(evals[i].cp);
    const after = sign > 0 ? winPct(evals[i + 1].cp) : 100 - winPct(evals[i + 1].cp);
    const bestUci = evals[i].best;
    const isBest = bestUci === move.lan;
    const loss = isBest ? 0 : Math.max(0, before - after);
    const grade: Grade = isBest ? 'best' : loss >= 15 ? 'blunder' : loss >= 10 ? 'mistake' : loss >= 5 ? 'inaccuracy' : 'good';
    let bestSan: string | null = null;
    if (bestUci && !isBest) {
      try {
        bestSan = new Chess(move.before).move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] }).san;
      } catch {
        /* mossa del motore non interpretabile: si omette il consiglio */
      }
    }
    const accuracy = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
    out.push({ grade, loss, accuracy, bestSan, bestUci: isBest ? null : bestUci });
  }
  return out;
}

export interface SideSummary {
  accuracy: number;
  counts: Record<Grade, number>;
}

export function summarize(history: Move[], reviews: PlyReview[]): Record<'w' | 'b', SideSummary> {
  const make = (color: 'w' | 'b'): SideSummary => {
    const mine = reviews.filter((_, i) => history[i].color === color);
    const counts: Record<Grade, number> = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
    for (const r of mine) counts[r.grade]++;
    const accuracy = mine.length ? mine.reduce((n, r) => n + r.accuracy, 0) / mine.length : 0;
    return { accuracy, counts };
  };
  return { w: make('w'), b: make('b') };
}

/** Valutazione leggibile: +1.3, −0.4, M3. */
export function formatEval(e: PosEval) {
  if (e.mate !== null) return e.mate === 0 ? '#' : `M${Math.abs(e.mate)}`;
  const v = e.cp / 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
}
