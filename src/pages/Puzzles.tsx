import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Board } from '../components/Board.tsx';
import { Trail } from '../components/Trail.tsx';
import { Confetti, Icon } from '../components/ui.tsx';
import { sideOf, type Side } from '../lib/chess.ts';
import { sfx } from '../lib/sound.ts';
import { recordPuzzle, useStore } from '../lib/store.ts';

/** [id, posizione, mosse UCI, difficoltà, temi]. La prima mossa è dell'avversario: il problema comincia dopo. */
type Puzzle = [id: string, fen: string, moves: string, rating: number, themes: string];

const THEMES: Record<string, string> = {
  fork: 'Forchetta',
  pin: 'Inchiodatura',
  skewer: 'Infilata',
  discoveredAttack: 'Attacco di scoperta',
  doubleCheck: 'Scacco doppio',
  sacrifice: 'Sacrificio',
  deflection: 'Deviazione',
  attraction: 'Adescamento',
  clearance: 'Sgombero',
  interference: 'Interferenza',
  intermezzo: 'Mossa intermedia',
  quietMove: 'Mossa tranquilla',
  xRayAttack: 'Attacco ai raggi X',
  zugzwang: 'Zugzwang',
  trappedPiece: 'Pezzo intrappolato',
  hangingPiece: 'Pezzo in presa',
  capturingDefender: 'Eliminazione del difensore',
  backRankMate: 'Matto del corridoio',
  smotheredMate: 'Matto affogato',
  mateIn1: 'Matto in 1',
  mateIn2: 'Matto in 2',
  mateIn3: 'Matto in 3',
  mateIn4: 'Matto in 4',
  promotion: 'Promozione',
  underPromotion: 'Sottopromozione',
  enPassant: 'En passant',
  castling: 'Arrocco',
  exposedKing: 'Re esposto',
  kingsideAttack: 'Attacco sul lato di Re',
  queensideAttack: 'Attacco sul lato di Donna',
  advancedPawn: 'Pedone avanzato',
  defensiveMove: 'Mossa difensiva',
  opening: 'Apertura',
  middlegame: 'Mediogioco',
  endgame: 'Finale',
  rookEndgame: 'Finale di Torri',
  pawnEndgame: 'Finale di Pedoni',
  queenEndgame: 'Finale di Donne',
  bishopEndgame: 'Finale di Alfieri',
  knightEndgame: 'Finale di Cavalli',
};

interface Frame {
  fen: string;
  last: [string, string] | null;
}

/** Sceglie un problema non ancora risolto, il più vicino possibile al livello del giocatore. */
function pick(all: Puzzle[], rating: number, solved: string[], failed: string[], avoid?: string): Puzzle {
  const fresh = all.filter((p) => !solved.includes(p[0]) && !failed.includes(p[0]) && p[0] !== avoid);
  const pool = fresh.length ? fresh : all.filter((p) => !solved.includes(p[0]) && p[0] !== avoid);
  const candidates = pool.length ? pool : all;
  for (const window of [60, 120, 250, 5000]) {
    const near = candidates.filter((p) => Math.abs(p[3] - rating) <= window);
    if (near.length) return near[Math.floor(Math.random() * near.length)];
  }
  return candidates[0];
}

export function Puzzles() {
  const { puzzles } = useStore();
  const [all, setAll] = useState<Puzzle[] | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);

  // L'archivio dei problemi si scarica solo quando si apre questa pagina.
  useEffect(() => {
    void import('../data/puzzles.json').then((m) => {
      const list = m.default as Puzzle[];
      setAll(list);
      setPuzzle(pick(list, puzzles.rating, puzzles.solved, puzzles.failed));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!all || !puzzle) return <div className="page center-note">Preparo i problemi…</div>;
  return <Solver key={puzzle[0]} puzzle={puzzle} total={all.length} onNext={() => setPuzzle(pick(all, puzzles.rating, puzzles.solved, puzzles.failed, puzzle[0]))} />;
}

function Solver({ puzzle, total, onNext }: { puzzle: Puzzle; total: number; onNext: () => void }) {
  const [id, startFen, moveText, rating, themeText] = puzzle;
  const { puzzles } = useStore();
  const moves = useMemo(() => moveText.split(' '), [moveText]);
  const chess = useRef(new Chess(startFen));
  const [frames, setFrames] = useState<Frame[]>([{ fen: startFen, last: null }]);
  const [sans, setSans] = useState<string[]>([]);
  const [view, setView] = useState<number | null>(null);
  /** Indice della prossima mossa della soluzione ancora da giocare. */
  const [pos, setPos] = useState(0);
  const [busy, setBusy] = useState(true);
  const [state, setState] = useState<'playing' | 'solved' | 'shown'>('playing');
  const [mistake, setMistake] = useState(false);
  const [wrong, setWrong] = useState(0);
  const [hint, setHint] = useState(false);
  /** Variazione del punteggio dovuta a questo problema (null finché non è deciso). */
  const [delta, setDelta] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const judged = useRef(false);
  // Chi deve trovare la soluzione muove per secondo: la prima mossa è dell'avversario.
  const side: Side = sideOf(new Chess(startFen).turn()) === 'white' ? 'black' : 'white';

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  /** Gioca sulla scacchiera la mossa della soluzione di indice `i`. */
  const playSolution = useCallback(
    (i: number) => {
      const uci = moves[i];
      const m = chess.current.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      sfx.forMove(m.san);
      setFrames((f) => [...f, { fen: chess.current.fen(), last: [m.from, m.to] }]);
      setSans((s) => [...s, m.san]);
      setPos(i + 1);
    },
    [moves],
  );

  /** Il punteggio cambia una volta sola per problema: al primo errore, oppure alla soluzione pulita. */
  const judge = useCallback(
    (ok: boolean) => {
      if (judged.current) return;
      judged.current = true;
      setDelta(recordPuzzle(id, rating, ok));
    },
    [id, rating],
  );

  // All'inizio l'avversario gioca la sua mossa: da lì parte il problema.
  useEffect(() => {
    later(() => {
      playSolution(0);
      setBusy(false);
    }, 700);
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMove = (from: string, to: string, promotion?: string) => {
    if (state !== 'playing' || busy || view !== null) return false;
    const probe = new Chess(chess.current.fen());
    try {
      probe.move({ from, to, promotion });
    } catch {
      return false;
    }
    const expected = moves[pos];
    const played = from + to + (promotion ?? '');
    // Come su Lichess: se la mossa dà matto è giusta, anche quando non è quella prevista.
    if (played !== expected && !probe.isCheckmate()) {
      sfx.error();
      setWrong((w) => w + 1);
      setMistake(true);
      judge(false);
      return false;
    }
    const m = chess.current.move({ from, to, promotion });
    sfx.forMove(m.san);
    setFrames((f) => [...f, { fen: chess.current.fen(), last: [from, to] }]);
    setSans((s) => [...s, m.san]);
    setHint(false);
    setWrong(0);
    const next = pos + 1;
    setPos(next);
    if (next >= moves.length || chess.current.isCheckmate()) {
      setState('solved');
      judge(!mistake);
      window.setTimeout(mistake ? sfx.success : sfx.win, 250);
      return true;
    }
    setBusy(true);
    later(() => {
      playSolution(next);
      setBusy(false);
    }, 550);
    return true;
  };

  const showHint = () => {
    setHint(true);
    setMistake(true);
    judge(false);
  };

  const showSolution = () => {
    setMistake(true);
    judge(false);
    setState('shown');
    setBusy(true);
    setHint(false);
    setView(null);
    for (let i = pos; i < moves.length; i++) later(() => playSolution(i), 300 + (i - pos) * 800);
    later(() => setBusy(false), 300 + (moves.length - pos) * 800);
  };

  const live = frames.length - 1;
  const shown = view ?? live;
  const frame = frames[shown];
  const expected = moves[pos];
  const done = state !== 'playing';

  return (
    <div className="page puzzle">
      {state === 'solved' && !mistake && <Confetti />}
      <div className="game-layout">
        <div className="board-col">
          <Board
            fen={frame.fen}
            orientation={side}
            movable={!done && !busy && view === null ? side : 'none'}
            lastMove={frame.last}
            circles={hint && view === null && expected ? [expected.slice(0, 2)] : []}
            onMove={onMove}
            className={wrong ? (wrong % 2 ? 'shake-a' : 'shake-b') : ''}
          />
        </div>

        <aside className="side-panel">
          <div className="panel-head">
            <span className="eyebrow">Problemi tattici</span>
            <h2>{done ? (state === 'solved' ? (mistake ? 'Risolto, non al primo colpo' : 'Risolto!') : 'Ecco la soluzione') : `Muove il ${side === 'white' ? 'Bianco' : 'Nero'}`}</h2>
          </div>

          <div className="puzzle-score">
            <div>
              <strong>{puzzles.rating}</strong>
              <span>il tuo punteggio</span>
            </div>
            {delta !== null && <b className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? `+${delta}` : delta}</b>}
            <div className="right">
              <strong>{done ? rating : '?'}</strong>
              <span>difficoltà del problema</span>
            </div>
          </div>

          <div className="lesson-body" key={`${state}-${wrong > 0}-${hint}`}>
            {!done && <p>Trova la mossa migliore. L'avversario ha appena giocato: come lo punisci?</p>}
            {!done && wrong > 0 && (
              <div className="feedback bad">
                <span>Non è la mossa migliore. Riprova, oppure chiedi un aiuto.</span>
              </div>
            )}
            {!done && hint && (
              <div className="feedback hint">
                <Icon name="bulb" />
                <span>Guarda il pezzo cerchiato: è lui che deve muovere.</span>
              </div>
            )}
            {state === 'solved' && (
              <div className="feedback good">
                <Icon name="check" />
                <span>{mistake ? 'Ci sei arrivato. Il punteggio conta il primo tentativo: al prossimo andrà meglio.' : 'Esatto, al primo colpo!'}</span>
              </div>
            )}
            {state === 'shown' && <p>Ripercorri le mosse qui sotto per capire l'idea, poi passa al prossimo.</p>}
            {done && themeText && (
              <div className="theme-chips">
                {themeText.split(' ').map((t) => (
                  <span key={t} className="chip">
                    {THEMES[t] ?? t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {sans.length > 0 && <Trail startFen={startFen} sans={sans} view={shown} onView={(n) => setView(n >= live ? null : Math.max(0, n))} />}

          <div className="action-grid">
            {!done ? (
              <>
                <button className="btn ghost" onClick={showHint} disabled={busy || hint}>
                  <Icon name="bulb" /> Aiuto
                </button>
                <button className="btn ghost" onClick={showSolution} disabled={busy}>
                  <Icon name="play" /> Soluzione
                </button>
              </>
            ) : (
              <button className="btn primary wide" onClick={onNext} disabled={busy}>
                Prossimo problema <Icon name="arrow" />
              </button>
            )}
          </div>

          <div className="panel-foot stack">
            <span className="puzzle-count">
              {puzzles.solved.length} risolti su {total}
            </span>
            <span className="credit">
              Problemi tratti da partite vere, dall'archivio pubblico di{' '}
              <a href="https://database.lichess.org/#puzzles" target="_blank" rel="noreferrer">
                Lichess
              </a>
              .
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
