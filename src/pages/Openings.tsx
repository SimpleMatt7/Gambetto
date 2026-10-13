import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Board, type Arrow } from '../components/Board.tsx';
import { MiniBoard } from '../components/Piece.tsx';
import { Confetti, Icon } from '../components/ui.tsx';
import { OPENINGS, TRICKS, type Line } from '../data/openings.ts';
import { useAccount } from '../lib/account.ts';
import { sanIt, stripSan, type Side } from '../lib/chess.ts';
import { href, navigate, useRoute } from '../lib/router.ts';
import { sfx } from '../lib/sound.ts';
import { completeLine, useStore } from '../lib/store.ts';

const ALL = [...OPENINGS, ...TRICKS];

/** Tutte le posizioni di una linea, dalla partenza all'ultima mossa. */
function expand(line: Line) {
  const chess = new Chess();
  const fens = [chess.fen()];
  const moves = line.moves.split(' ').map((san) => {
    const m = chess.move(san);
    fens.push(chess.fen());
    return m;
  });
  return { fens, moves };
}

export function Openings() {
  const { path } = useRoute();
  const line = ALL.find((l) => l.id === path[1]);
  if (line) return <LineView key={line.id} line={line} />;
  return <Library />;
}

function Library() {
  const { query } = useRoute();
  const { lines: done } = useStore();
  const tab = query.get('tab') === 'chicche' ? 'chicche' : 'aperture';
  const list = tab === 'chicche' ? TRICKS : OPENINGS;
  const families = [...new Set(list.map((l) => l.family))];

  return (
    <div className="page library">
      <header className="page-head">
        <span className="eyebrow">Repertorio</span>
        <h1>Aperture e chicche</h1>
        <p className="lead">Le aperture dei campioni e le trappole più celebri. Studiale mossa per mossa, allenale a memoria e poi mettile alla prova contro il computer o un amico.</p>
      </header>

      <div className="segmented big">
        <a className={tab === 'aperture' ? 'on' : ''} href={href('aperture')}>
          <Icon name="book" /> Aperture famose <em>{OPENINGS.length}</em>
        </a>
        <a className={tab === 'chicche' ? 'on' : ''} href={href('aperture', { tab: 'chicche' })}>
          <Icon name="spark" /> Trappole e matti lampo <em>{TRICKS.length}</em>
        </a>
      </div>

      {families.map((family) => (
        <section key={family} className="family">
          <h2>{family}</h2>
          <div className="line-grid">
            {list
              .filter((l) => l.family === family)
              .map((l, i) => (
                <LineCard key={l.id} line={l} done={done.includes(l.id)} delay={i * 50} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function LineCard({ line, done, delay }: { line: Line; done: boolean; delay: number }) {
  const fen = useMemo(() => expand(line).fens.at(-1)!, [line]);
  const preview = line.moves
    .split(' ')
    .slice(0, 6)
    .map((m, i) => (i % 2 ? sanIt(m) : `${i / 2 + 1}.${sanIt(m)}`))
    .join(' ');
  return (
    <a className={`line-card ${done ? 'done' : ''}`} href={href(`aperture/${line.id}`)} style={{ animationDelay: `${delay}ms` }}>
      <div className="line-thumb">
        <MiniBoard fen={fen} flipped={line.side === 'black'} />
      </div>
      <div className="line-info">
        <div className="line-top">
          <span className="chip">{line.tag}</span>
          <span className="stars" title={`Difficoltà ${line.difficulty} su 3`}>
            {[1, 2, 3].map((n) => (
              <i key={n} className={n <= line.difficulty ? 'on' : ''} />
            ))}
          </span>
          {done && (
            <span className="chip ok">
              <Icon name="check" size={12} /> Allenata
            </span>
          )}
        </div>
        <strong>{line.name}</strong>
        <small>{line.summary}</small>
        <code>{preview} …</code>
      </div>
    </a>
  );
}

function LineView({ line }: { line: Line }) {
  const { fens, moves } = useMemo(() => expand(line), [line]);
  const isTrick = TRICKS.includes(line);
  const { user, ready } = useAccount();
  const [mode, setMode] = useState<'study' | 'train'>('study');
  const [side, setSide] = useState<Side>(line.side);
  const [ply, setPly] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [wrong, setWrong] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  // In allenamento si possono rivedere le mosse già giocate: `view` è la posizione mostrata, null = l'ultima.
  const [view, setView] = useState<number | null>(null);
  const total = moves.length;
  const complete = mode === 'train' && ply === total;

  // Studio: riproduzione automatica.
  useEffect(() => {
    if (mode !== 'study' || !playing) return;
    if (ply >= total) return setPlaying(false);
    const id = window.setTimeout(() => {
      sfx.forMove(moves[ply].san);
      setPly(ply + 1);
    }, 1100);
    return () => window.clearTimeout(id);
  }, [mode, playing, ply, total, moves]);

  // Allenamento: il computer gioca le mosse dell'altro lato.
  const userToMove = (ply % 2 === 0 ? 'white' : 'black') === side;
  useEffect(() => {
    if (mode !== 'train' || ply >= total || userToMove) return;
    const id = window.setTimeout(() => {
      sfx.forMove(moves[ply].san);
      setPly(ply + 1);
    }, 600);
    return () => window.clearTimeout(id);
  }, [mode, ply, total, userToMove, moves]);

  const celebrated = useRef(false);
  useEffect(() => {
    if (complete && !celebrated.current) {
      celebrated.current = true;
      completeLine(line.id);
      setCelebrate(true);
      window.setTimeout(sfx.success, 300);
    }
  }, [complete, line.id]);

  const step = (to: number) => {
    const n = Math.max(0, Math.min(total, to));
    if (n > ply && n - ply === 1) sfx.forMove(moves[ply].san);
    setPlaying(false);
    setPly(n);
  };

  const startTrain = (s: Side = side) => {
    setSide(s);
    setMode('train');
    setPly(0);
    setWrong(0);
    setShowHint(false);
    setPlaying(false);
    setCelebrate(false);
    celebrated.current = false;
  };

  const startStudy = () => {
    setMode('study');
    setPlaying(false);
    setShowHint(false);
    setWrong(0);
  };

  const peek = (to: number) => {
    const n = Math.max(0, Math.min(ply, to));
    setView(n === ply ? null : n);
  };
  // Appena arriva una mossa nuova si torna alla posizione attuale.
  useEffect(() => setView(null), [ply, mode]);

  useEffect(() => {
    const move = mode === 'study' ? step : peek;
    const at = mode === 'study' ? ply : (view ?? ply);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') move(at - 1);
      else if (e.key === 'ArrowRight') move(at + 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onMove = (from: string, to: string, promotion?: string) => {
    if (mode !== 'train' || ply >= total || !userToMove || view !== null) return false;
    const expected = moves[ply];
    let san: string;
    try {
      san = new Chess(fens[ply]).move({ from, to, promotion }).san;
    } catch {
      return false;
    }
    if (stripSan(san) !== stripSan(expected.san)) {
      sfx.error();
      setWrong((w) => w + 1);
      return false;
    }
    sfx.forMove(san);
    setWrong(0);
    setShowHint(false);
    setPly(ply + 1);
    return true;
  };

  const movesEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    movesEl.current?.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  }, [ply, view]);

  const shown = mode === 'train' && view !== null ? view : ply;
  const last = shown > 0 ? moves[shown - 1] : null;
  const arrows: Arrow[] =
    mode === 'train' && view === null && userToMove && ply < total && (showHint || wrong >= 3) ? [{ from: moves[ply].from, to: moves[ply].to, brush: 'blue' }] : [];
  const note = line.notes?.[shown];
  const sanList = line.moves.split(' ');
  // Le aperture proseguono dalla posizione finale; le trappole si tentano dall'inizio.
  const continueQuery = { moves: isTrick ? '' : sanList.join(','), title: line.name, go: '1' };

  const rows: number[][] = [];
  for (let i = 0; i < total; i += 2) rows.push([i, i + 1]);
  const visible = mode === 'train' ? ply : total;

  return (
    <div className="page line-view">
      {celebrate && <Confetti />}
      <div className="game-layout">
        <div className="board-col">
          <Board
            fen={fens[shown]}
            orientation={side}
            movable={mode === 'train' && view === null && userToMove && ply < total ? side : 'none'}
            lastMove={last ? [last.from, last.to] : null}
            arrows={arrows}
            onMove={onMove}
            className={wrong ? (wrong % 2 ? 'shake-a' : 'shake-b') : ''}
          />
        </div>

        <aside className="side-panel">
          <a className="crumb" href={href('aperture', isTrick ? { tab: 'chicche' } : undefined)}>
            <Icon name="back" size={15} /> {isTrick ? 'Trappole e matti lampo' : 'Aperture'} · {line.tag}
          </a>
          <h2>{line.name}</h2>
          <p className="muted">{line.summary}</p>

          <div className="segmented">
            <button className={mode === 'study' ? 'on' : ''} onClick={startStudy}>
              <Icon name="book" /> Studia
            </button>
            <button className={mode === 'train' ? 'on' : ''} onClick={() => startTrain()}>
              <Icon name="spark" /> Allenati
            </button>
          </div>

          {mode === 'train' && !line.fixedSide && (
            <div className="side-pick">
              Gioca con il
              <button className={side === 'white' ? 'on' : ''} onClick={() => startTrain('white')}>
                Bianco
              </button>
              <button className={side === 'black' ? 'on' : ''} onClick={() => startTrain('black')}>
                Nero
              </button>
            </div>
          )}

          <div className="moves compact" ref={movesEl}>
            {rows.map(([w, b]) => (
              <div className="move-row" key={w}>
                <span className="move-n">{w / 2 + 1}.</span>
                {[w, b].map((idx) =>
                  idx >= total ? (
                    <span key={idx} className="move-cell empty" />
                  ) : idx >= visible ? (
                    <span key={idx} className="move-cell hidden-move">
                      ?
                    </span>
                  ) : (
                    <button key={idx} className={`move-cell ${shown === idx + 1 ? 'current' : ''} ${line.notes?.[idx + 1] ? 'noted' : ''}`} onClick={() => (mode === 'study' ? step(idx + 1) : peek(idx + 1))}>
                      {sanIt(sanList[idx])}
                    </button>
                  ),
                )}
              </div>
            ))}
          </div>

          <div className="note-box" key={`${mode}-${ply}-${wrong > 0}`}>
            {complete ? (
              <div className="feedback good">
                <Icon name="check" />
                <span>
                  Linea completata a memoria! Ora mettila alla prova in una partita vera.
                  {ready && !user && (
                    <>
                      {' '}
                      <a className="inline-link" href={href('account', { nuovo: '1' })}>
                        Crea un account
                      </a>{' '}
                      per non perdere i progressi.
                    </>
                  )}
                </span>
              </div>
            ) : mode === 'train' && wrong > 0 ? (
              <div className="feedback bad">
                <span>Non è la mossa della linea. {wrong >= 3 ? 'Segui la freccia.' : 'Riprova!'}</span>
              </div>
            ) : note ? (
              <p className="note">
                <strong>{sanIt(sanList[shown - 1])}</strong> — {note}
              </p>
            ) : mode === 'train' ? (
              <p className="note dim">{userToMove ? `Tocca a te: gioca la mossa ${Math.floor(ply / 2) + 1} del ${side === 'white' ? 'Bianco' : 'Nero'}.` : 'Il computer risponde…'}</p>
            ) : ply === 0 ? (
              <p className="note dim">Usa le frecce per scorrere le mosse, oppure avvia la riproduzione.</p>
            ) : (
              <p className="note dim">
                Mossa {Math.ceil(ply / 2)} di {Math.ceil(total / 2)}.
              </p>
            )}
          </div>

          {mode === 'study' ? (
            <div className="nav-row">
              <button className="icon-btn" onClick={() => step(0)} disabled={ply === 0} title="Inizio">
                <Icon name="first" />
              </button>
              <button className="icon-btn" onClick={() => step(ply - 1)} disabled={ply === 0} title="Indietro (←)">
                <Icon name="prev" />
              </button>
              <button
                className="icon-btn wide"
                onClick={() => {
                  if (ply >= total) setPly(0);
                  setPlaying(!playing);
                }}
              >
                <Icon name={playing ? 'pause' : 'play'} /> {playing ? 'Pausa' : 'Riproduci'}
              </button>
              <button className="icon-btn" onClick={() => step(ply + 1)} disabled={ply === total} title="Avanti (→)">
                <Icon name="next" />
              </button>
              <button className="icon-btn" onClick={() => step(total)} disabled={ply === total} title="Fine">
                <Icon name="last" />
              </button>
            </div>
          ) : (
            <>
              {ply > 0 && (
                <div className="nav-row">
                  <button className="icon-btn" onClick={() => peek(0)} disabled={shown === 0} title="Inizio">
                    <Icon name="first" />
                  </button>
                  <button className="icon-btn" onClick={() => peek(shown - 1)} disabled={shown === 0} title="Mossa precedente (←)">
                    <Icon name="prev" />
                  </button>
                  <button className="icon-btn" onClick={() => peek(shown + 1)} disabled={shown === ply} title="Mossa successiva (→)">
                    <Icon name="next" />
                  </button>
                  <button className="icon-btn" onClick={() => peek(ply)} disabled={shown === ply} title="Posizione attuale">
                    <Icon name="last" />
                  </button>
                </div>
              )}
              <div className="action-grid">
              <button className="btn ghost" onClick={() => setShowHint(true)} disabled={complete || !userToMove}>
                <Icon name="bulb" /> Aiuto
              </button>
              <button className="btn ghost" onClick={() => startTrain()}>
                <Icon name="undo" /> Ricomincia
              </button>
              </div>
            </>
          )}

          <details className="ideas" open={mode === 'study'}>
            <summary>Idee chiave</summary>
            <ul>
              {line.ideas.map((idea) => (
                <li key={idea}>{idea}</li>
              ))}
            </ul>
          </details>

          <div className="panel-foot stack">
            <span className="eyebrow">Prova questa linea in partita</span>
            <button className="btn primary" onClick={() => navigate('gioca', { ...continueQuery, mode: 'cpu', color: side })}>
              <Icon name="cpu" /> Contro il computer
            </button>
            <button className="btn" onClick={() => navigate('gioca', { ...continueQuery, mode: 'local', color: side })}>
              <Icon name="users" /> Dal vivo, in due
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
