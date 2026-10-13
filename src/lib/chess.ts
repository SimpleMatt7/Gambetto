import { Chess, type Move, type Square } from 'chess.js';

export type Side = 'white' | 'black';

export const sideOf = (c: 'w' | 'b'): Side => (c === 'w' ? 'white' : 'black');
export const other = (s: Side): Side => (s === 'white' ? 'black' : 'white');
export const stripSan = (s: string) => s.replace(/[+#]/g, '');

/** Notazione italiana: R(e) D(onna) T(orre) A(lfiere) C(avallo). */
const IT: Record<string, string> = { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' };
export const sanIt = (san: string) => san.replace(/[KQRBN]/g, (c) => IT[c]);

export function destsOf(chess: Chess): Map<Square, Square[]> {
  const dests = new Map<Square, Square[]>();
  for (const m of chess.moves({ verbose: true })) {
    const list = dests.get(m.from);
    if (list) list.push(m.to);
    else dests.set(m.from, [m.to]);
  }
  return dests;
}

/** Trova la mossa legale che corrisponde a una SAN, ignorando + e #. */
export function findSan(chess: Chess, san: string): Move | undefined {
  const target = stripSan(san);
  return chess.moves({ verbose: true }).find((m) => stripSan(m.san) === target);
}

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
export const PIECE_NAMES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

export interface Material {
  /** Pezzi avversari catturati da ciascun lato, come lettere p n b r q. */
  captured: Record<Side, string[]>;
  /** Vantaggio materiale del Bianco in punti. */
  diff: number;
}

export function material(fen: string): Material {
  const zero = () => ({ p: 0, n: 0, b: 0, r: 0, q: 0 }) as Record<string, number>;
  const count = { w: zero(), b: zero() };
  for (const ch of fen.split(' ')[0]) {
    const lower = ch.toLowerCase();
    if (lower in VALUES) count[ch === lower ? 'b' : 'w'][lower]++;
  }
  const captured: Record<Side, string[]> = { white: [], black: [] };
  let diff = 0;
  for (const p of ['q', 'r', 'b', 'n', 'p']) {
    diff += (count.w[p] - count.b[p]) * VALUES[p];
    for (let i = count.b[p]; i < START_COUNT[p]; i++) captured.white.push(p);
    for (let i = count.w[p]; i < START_COUNT[p]; i++) captured.black.push(p);
  }
  return { captured, diff };
}
