import { Chess } from 'chess.js';

export interface SearchResult {
  /** Mossa migliore in formato UCI (es. e2e4), null se non ce ne sono. */
  best: string | null;
  /** Valutazione dal punto di vista del Bianco, in centesimi di Pedone. */
  cp: number | null;
  /** Matto in N (positivo: vince il Bianco). */
  mate: number | null;
}

export interface SearchOptions {
  skill?: number;
  depth?: number;
  movetime?: number;
}

const ENGINE_URL = `${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`;

/** Stockfish in un Web Worker, con le ricerche messe in coda una alla volta. */
export class Engine {
  private worker: Worker;
  private ready: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private onLine: ((line: string) => void) | null = null;

  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (e) => this.onLine?.(String(e.data));
    this.ready = this.until('uci', (l) => l === 'uciok').then(() => this.until('isready', (l) => l === 'readyok'));
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private until(cmd: string, done: (line: string) => boolean, each?: (line: string) => void): Promise<void> {
    return new Promise((resolve) => {
      this.onLine = (line) => {
        each?.(line);
        if (done(line)) {
          this.onLine = null;
          resolve();
        }
      };
      this.send(cmd);
    });
  }

  search(fen: string, opts: SearchOptions = {}): Promise<SearchResult> {
    const run = async (): Promise<SearchResult> => {
      await this.ready;
      const sign = fen.split(' ')[1] === 'b' ? -1 : 1;
      const result: SearchResult = { best: null, cp: null, mate: null };
      this.send(`setoption name Skill Level value ${opts.skill ?? 20}`);
      this.send(`position fen ${fen}`);
      const go = opts.movetime ? `go movetime ${opts.movetime}` : `go depth ${opts.depth ?? 12}`;
      await this.until(
        go,
        (l) => l.startsWith('bestmove'),
        (l) => {
          const cp = l.match(/score cp (-?\d+)/);
          const mate = l.match(/score mate (-?\d+)/);
          if (cp) [result.cp, result.mate] = [sign * +cp[1], null];
          if (mate) [result.mate, result.cp] = [sign * +mate[1], null];
          const best = l.match(/^bestmove (\S+)/);
          if (best && best[1] !== '(none)') result.best = best[1];
        },
      );
      return result;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /** Interrompe la ricerca in corso: il motore risponde subito con la mossa trovata finora. */
  stop() {
    this.send('stop');
  }
}

let play: Engine | null = null;
let analysis: Engine | null = null;
export const playEngine = () => (play ??= new Engine());
export const analysisEngine = () => (analysis ??= new Engine());

export interface Level {
  id: number;
  name: string;
  elo: string;
  description: string;
  skill: number;
  depth?: number;
  movetime?: number;
  /** Probabilità di giocare una mossa a caso invece di quella del motore. */
  random: number;
}

export const LEVELS: Level[] = [
  { id: 1, name: 'Principiante', elo: '400', description: 'Muove quasi a caso. Per le primissime partite.', skill: 0, depth: 1, random: 0.6 },
  { id: 2, name: 'Novizio', elo: '700', description: 'Conosce le regole, ma regala spesso i pezzi.', skill: 0, depth: 1, random: 0.3 },
  { id: 3, name: 'Dilettante', elo: '1000', description: 'Vede le minacce semplici e qualche tattica.', skill: 2, depth: 2, random: 0.08 },
  { id: 4, name: 'Circolo', elo: '1300', description: 'Un buon giocatore da circolo: sbaglia, ma punisce.', skill: 6, depth: 4, random: 0 },
  { id: 5, name: 'Esperto', elo: '1600', description: 'Tattico e attento. Serve un piano per batterlo.', skill: 10, depth: 6, random: 0 },
  { id: 6, name: 'Candidato', elo: '1900', description: 'Gioco solido e pochi errori.', skill: 14, depth: 9, random: 0 },
  { id: 7, name: 'Maestro', elo: '2300', description: 'Preciso e spietato in ogni fase.', skill: 18, depth: 13, random: 0 },
  { id: 8, name: 'Gran Maestro', elo: '3000+', description: 'Stockfish a piena forza. Buona fortuna.', skill: 20, movetime: 1200, random: 0 },
];

/** Sceglie la mossa del computer per il livello dato. Restituisce una mossa UCI. */
export async function computerMove(fen: string, level: Level): Promise<string | null> {
  if (Math.random() < level.random) {
    const moves = new Chess(fen).moves({ verbose: true });
    if (!moves.length) return null;
    // Anche chi gioca a caso, davanti a una cattura, una volta su due la prende.
    const captures = moves.filter((m) => m.captured);
    const pool = captures.length && Math.random() < 0.5 ? captures : moves;
    return pool[Math.floor(Math.random() * pool.length)].lan;
  }
  const { best } = await playEngine().search(fen, level);
  return best;
}
