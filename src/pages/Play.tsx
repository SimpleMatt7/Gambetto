import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Board, type Arrow } from '../components/Board.tsx';
import { Piece } from '../components/Piece.tsx';
import { Review } from '../components/Review.tsx';
import { Confetti, EvalBar, Icon } from '../components/ui.tsx';
import { GRADES } from '../lib/analysis.ts';
import { material, other, sanIt, sideOf, type Side } from '../lib/chess.ts';
import { analysisEngine, computerMove, LEVELS, type Level } from '../lib/engine.ts';
import { href, navigate, useRoute } from '../lib/router.ts';
import { sfx } from '../lib/sound.ts';
import { useAnalysis } from '../lib/useAnalysis.ts';
import { recordResult, setSetting, useStore } from '../lib/store.ts';

type Mode = 'cpu' | 'local';

interface TimeControl {
  id: string;
  label: string;
  base: number;
  inc: number;
}

const TIMES: TimeControl[] = [
  { id: 'none', label: 'Senza tempo', base: 0, inc: 0 },
  { id: '3+2', label: '3 + 2', base: 180, inc: 2 },
  { id: '5+0', label: '5 min', base: 300, inc: 0 },
  { id: '10+0', label: '10 min', base: 600, inc: 0 },
  { id: '15+10', label: '15 + 10', base: 900, inc: 10 },
];

interface GameConfig {
  mode: Mode;
  level: Level;
  color: Side;
  time: TimeControl;
  /** Mosse iniziali già giocate (per proseguire da un'apertura). */
  moves: string[];
  title?: string;
}

export function Play() {
  const { query } = useRoute();
  const { settings } = useStore();
  const preset = query.get('moves')?.split(',').filter(Boolean) ?? [];
  const title = query.get('title') ?? undefined;
  const [mode, setMode] = useState<Mode>(query.get('mode') === 'local' ? 'local' : 'cpu');
  const [levelId, setLevelId] = useState(settings.level);
  const [colorChoice, setColorChoice] = useState<Side | 'random'>((query.get('color') as Side) ?? 'white');
  const [timeId, setTimeId] = useState('none');
  const [game, setGame] = useState<{ config: GameConfig; key: number } | null>(null);

  const start = useCallback(() => {
    const color = colorChoice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : colorChoice;
    setSetting('level', levelId);
    setGame((g) => ({
      key: (g?.key ?? 0) + 1,
      config: { mode, level: LEVELS[levelId - 1], color, time: TIMES.find((t) => t.id === timeId)!, moves: preset, title },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, levelId, colorChoice, timeId, preset.join(), title]);

  // Arrivando da un'apertura con "go", si parte subito senza passare dal menu.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (query.get('go') && !autoStarted.current) {
      autoStarted.current = true;
      start();
    }
  }, [query, start]);

  if (game) return <Game key={game.key} config={game.config} onRematch={start} onExit={() => setGame(null)} />;

  return (
    <div className="page setup">
      <header className="page-head">
        <span className="eyebrow">Nuova partita</span>
        <h1>Scegli la tua sfida</h1>
        {preset.length > 0 && (
          <p className="lead">
            Si riparte da <strong>{title ?? 'una posizione studiata'}</strong>, dopo {Math.ceil(preset.length / 2)} mosse.
          </p>
        )}
      </header>

      <div className="segmented big" role="tablist">
        <button className={mode === 'cpu' ? 'on' : ''} onClick={() => setMode('cpu')}>
          <Icon name="cpu" /> Contro il computer
        </button>
        <button className={mode === 'local' ? 'on' : ''} onClick={() => setMode('local')}>
          <Icon name="users" /> Due giocatori
        </button>
        <a href={href('online')}>
          <Icon name="spark" /> Online
        </a>
      </div>

      {mode === 'cpu' ? (
        <section className="setup-block">
          <h2>Livello dell'avversario</h2>
          <div className="level-grid">
            {LEVELS.map((l, i) => (
              <button key={l.id} className={`level-card ${levelId === l.id ? 'on' : ''}`} style={{ animationDelay: `${i * 35}ms` }} onClick={() => setLevelId(l.id)}>
                <span className="level-num">{l.id}</span>
                <span className="level-name">{l.name}</span>
                <span className="level-elo">≈ {l.elo} Elo</span>
                <span className="level-bars" aria-hidden>
                  {LEVELS.map((x) => (
                    <i key={x.id} className={x.id <= l.id ? 'full' : ''} />
                  ))}
                </span>
              </button>
            ))}
          </div>
          <p className="level-desc">{LEVELS[levelId - 1].description}</p>
        </section>
      ) : (
        <section className="setup-block">
          <p className="lead center">Stesso schermo, una mossa a testa. Perfetto per sfidare un amico dal vivo o provare un'apertura appena imparata.</p>
        </section>
      )}

      <div className="setup-row">
        {mode === 'cpu' && (
          <section className="setup-block">
            <h2>Giochi con</h2>
            <div className="segmented">
              <button className={colorChoice === 'white' ? 'on' : ''} onClick={() => setColorChoice('white')}>
                <Piece type="k" color="w" /> Bianco
              </button>
              <button className={colorChoice === 'random' ? 'on' : ''} onClick={() => setColorChoice('random')}>
                A caso
              </button>
              <button className={colorChoice === 'black' ? 'on' : ''} onClick={() => setColorChoice('black')}>
                <Piece type="k" color="b" /> Nero
              </button>
            </div>
          </section>
        )}
        <section className="setup-block">
          <h2>Tempo</h2>
          <div className="segmented">
            {TIMES.map((t) => (
              <button key={t.id} className={timeId === t.id ? 'on' : ''} onClick={() => setTimeId(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      <button className="btn primary xl" onClick={start}>
        Inizia la partita <Icon name="arrow" />
      </button>
    </div>
  );
}

interface Result {
  winner: Side | null;
  reason: string;
}

const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Game({ config, onRematch, onExit }: { config: GameConfig; onRematch: () => void; onExit: () => void }) {
  const { settings } = useStore();
  const { mode, level, time } = config;
  const chess = useRef<Chess>(null as unknown as Chess);
  if (!chess.current) {
    chess.current = new Chess();
    for (const m of config.moves) chess.current.move(m);
  }
  const game = chess.current;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  const [version, setVersion] = useState(0);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [hint, setHint] = useState<Arrow | null>(null);
  const [hinting, setHinting] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [autoFlip, setAutoFlip] = useState(false);
  const [evaluation, setEvaluation] = useState<{ cp: number | null; mate: number | null }>({ cp: 0, mate: null });
  const [clock, setClock] = useState({ white: time.base * 1000, black: time.base * 1000 });
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<Result | null>(null);

  const history = useMemo(() => game.history({ verbose: true }), [game, version]);
  const liveFen = game.fen();
  const ply = viewPly ?? history.length;
  const { evals, reviews, analyzing, showBest, toggleBest, bestOf, start: startAnalysis } = useAnalysis(history, liveFen, ply);
  // "Mostra" nell'analisi: si torna alla posizione precedente per confrontare la mossa giocata con la migliore.
  const fen = bestOf ? history[ply - 1].before : ply === history.length ? liveFen : (history[ply]?.before ?? liveFen);
  const last = ply > 0 && !bestOf ? history[ply - 1] : null;
  const turn = sideOf(game.turn());
  const live = viewPly === null;

  const finish = useCallback(
    (r: Result) => {
      if (resultRef.current) return;
      resultRef.current = r;
      setResult(r);
      window.setTimeout(() => setShowResult(true), 650);
      if (mode === 'cpu') {
        const outcome = r.winner === null ? 'd' : r.winner === config.color ? 'w' : 'l';
        recordResult(level.id, outcome);
        window.setTimeout(() => (outcome === 'w' ? sfx.win() : outcome === 'l' ? sfx.lose() : sfx.draw()), 400);
      } else {
        window.setTimeout(() => (r.winner ? sfx.win() : sfx.draw()), 400);
      }
    },
    [mode, config.color, level.id],
  );

  /** Da chiamare dopo ogni mossa giocata sulla scacchiera. */
  const afterMove = useCallback(
    (san: string, mover: Side) => {
      sfx.forMove(san);
      setHint(null);
      setViewPly(null);
      if (time.base) setClock((c) => ({ ...c, [mover]: c[mover] + time.inc * 1000 }));
      setVersion((v) => v + 1);
      if (game.isCheckmate()) finish({ winner: mover, reason: 'Scacco matto' });
      else if (game.isStalemate()) finish({ winner: null, reason: 'Stallo' });
      else if (game.isThreefoldRepetition()) finish({ winner: null, reason: 'Tripla ripetizione' });
      else if (game.isInsufficientMaterial()) finish({ winner: null, reason: 'Materiale insufficiente' });
      else if (game.isDraw()) finish({ winner: null, reason: 'Regola delle 50 mosse' });
    },
    [game, time, finish],
  );

  const onMove = (from: string, to: string, promotion?: string) => {
    if (!live || result) return false;
    try {
      const m = game.move({ from, to, promotion });
      afterMove(m.san, sideOf(m.color));
      return true;
    } catch {
      return false;
    }
  };

  // Mossa del computer.
  useEffect(() => {
    if (mode !== 'cpu' || result || turn === config.color || game.isGameOver()) return;
    let cancelled = false;
    const at = game.fen();
    setThinking(true);
    const pause = new Promise((r) => setTimeout(r, 420 + Math.random() * 380));
    Promise.all([computerMove(at, level), pause]).then(([uci]) => {
      if (cancelled || game.fen() !== at || !uci) return;
      const m = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      setThinking(false);
      afterMove(m.san, sideOf(m.color));
    });
    return () => {
      cancelled = true;
      setThinking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, result]);

  // Orologio: parte dopo la prima mossa.
  const clockRunning = time.base > 0 && !result && history.length > config.moves.length;
  useEffect(() => {
    if (!clockRunning) return;
    let prev = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - prev;
      prev = now;
      setClock((c) => ({ ...c, [turn]: Math.max(0, c[turn] - dt) }));
    }, 100);
    return () => window.clearInterval(id);
  }, [clockRunning, turn]);

  useEffect(() => {
    if (!clockRunning) return;
    for (const side of ['white', 'black'] as const) if (clock[side] <= 0) finish({ winner: other(side), reason: 'Tempo scaduto' });
  }, [clock, clockRunning, finish]);

  // Barra di valutazione.
  useEffect(() => {
    if (!settings.evalBar || evals) return;
    let cancelled = false;
    const engine = analysisEngine();
    engine.stop();
    engine.search(fen, { depth: 13 }).then((r) => {
      if (cancelled) return;
      if (r.cp !== null || r.mate !== null) setEvaluation({ cp: r.cp, mate: r.mate });
    });
    return () => {
      cancelled = true;
    };
  }, [fen, settings.evalBar, evals]);

  const analyze = () => {
    if (!result) return;
    setShowResult(false);
    void startAnalysis();
  };

  const undo = () => {
    if (result || history.length <= config.moves.length) return;
    game.undo();
    if (mode === 'cpu' && sideOf(game.turn()) !== config.color && game.history().length > config.moves.length) game.undo();
    setHint(null);
    setViewPly(null);
    setVersion((v) => v + 1);
  };

  const askHint = async () => {
    if (result || hinting || !live) return;
    setHinting(true);
    const at = game.fen();
    const engine = analysisEngine();
    engine.stop();
    const r = await engine.search(at, { depth: 14 });
    setHinting(false);
    if (r.best && game.fen() === at) setHint({ from: r.best.slice(0, 2), to: r.best.slice(2, 4), brush: 'blue' });
  };

  const resign = () => {
    if (result) return;
    finish({ winner: mode === 'cpu' ? other(config.color) : other(turn), reason: 'Abbandono' });
  };

  const go = useCallback(
    (target: number) => {
      const n = Math.max(0, Math.min(history.length, target));
      setViewPly(n === history.length ? null : n);
    },
    [history.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(ply - 1);
      else if (e.key === 'ArrowRight') go(ply + 1);
      else if (e.key === 'ArrowUp') go(0);
      else if (e.key === 'ArrowDown') go(history.length);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, ply, history.length]);

  const movesEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    movesEl.current?.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  }, [ply]);

  const baseOrientation: Side = mode === 'cpu' ? config.color : autoFlip ? turn : 'white';
  const orientation = flipped ? other(baseOrientation) : baseOrientation;
  const mat = material(fen);
  const names: Record<Side, string> =
    mode === 'cpu'
      ? ({ [config.color]: 'Tu', [other(config.color)]: level.name } as Record<Side, string>)
      : { white: 'Bianco', black: 'Nero' };

  const copyPgn = async () => {
    const pgn = game.pgn();
    try {
      await navigator.clipboard.writeText(pgn);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt('Copia il PGN:', pgn);
    }
  };

  const playerBar = (side: Side) => {
    const adv = side === 'white' ? mat.diff : -mat.diff;
    const isCpu = mode === 'cpu' && side !== config.color;
    const active = !result && turn === side;
    return (
      <div className={`player-bar ${active ? 'active' : ''}`}>
        <div className={`avatar ${side}`}>{isCpu ? <Icon name="cpu" size={20} /> : <Piece type="k" color={side === 'white' ? 'w' : 'b'} />}</div>
        <div className="player-info">
          <div className="player-name">
            {names[side]}
            {isCpu && <span className="chip">≈ {level.elo}</span>}
            {isCpu && thinking && (
              <span className="thinking" aria-label="Sta pensando">
                <i />
                <i />
                <i />
              </span>
            )}
          </div>
          <div className="captured">
            {mat.captured[side].map((p, i) => (
              <Piece key={i} type={p} color={side === 'white' ? 'b' : 'w'} />
            ))}
            {adv > 0 && <span className="adv">+{adv}</span>}
          </div>
        </div>
        {time.base > 0 && <div className={`clock ${active && clockRunning ? 'running' : ''} ${clock[side] < 20000 ? 'low' : ''}`}>{fmtClock(clock[side])}</div>}
      </div>
    );
  };

  const youWon = result && mode === 'cpu' && result.winner === config.color;
  const resultTitle = !result
    ? ''
    : result.winner === null
      ? 'Patta'
      : mode === 'cpu'
        ? youWon
          ? 'Vittoria!'
          : 'Sconfitta'
        : `Vince il ${result.winner === 'white' ? 'Bianco' : 'Nero'}`;

  const rows: { n: number; w?: number; b?: number }[] = [];
  history.forEach((m, i) => {
    if (m.color === 'w') rows.push({ n: rows.length + 1, w: i });
    else if (rows.length && rows[rows.length - 1].b === undefined && rows[rows.length - 1].w !== undefined) rows[rows.length - 1].b = i;
    else rows.push({ n: rows.length + 1, b: i });
  });

  return (
    <div className="page game">
      <div className="game-layout">
        <div className="board-col">
          {playerBar(other(orientation))}
          <div className="board-row">
            {(settings.evalBar || evals) && <EvalBar cp={(evals?.[ply] ?? evaluation).cp} mate={(evals?.[ply] ?? evaluation).mate} flipped={orientation === 'black'} />}
            <Board
              fen={fen}
              orientation={orientation}
              movable={!live || result ? 'none' : mode === 'cpu' ? config.color : 'both'}
              lastMove={last ? [last.from, last.to] : null}
              arrows={
                bestOf
                  ? [
                      { from: history[ply - 1].from, to: history[ply - 1].to, brush: 'red' },
                      { from: bestOf.slice(0, 2), to: bestOf.slice(2, 4), brush: 'green' },
                    ]
                  : hint && live
                    ? [hint]
                    : []
              }
              onMove={onMove}
            />
          </div>
          {playerBar(orientation)}
        </div>

        <aside className="side-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">{mode === 'cpu' ? `Livello ${level.id} · ${level.name}` : 'Due giocatori'}</span>
              <h2>{config.title ?? (mode === 'cpu' ? 'Partita contro il computer' : 'Partita dal vivo')}</h2>
            </div>
          </div>

          <div className="status-line">
            {result ? (
              <>
                <strong>{resultTitle}</strong> · {result.reason}
              </>
            ) : game.inCheck() ? (
              <strong className="warn">Scacco al {turn === 'white' ? 'Bianco' : 'Nero'}!</strong>
            ) : mode === 'cpu' ? (
              turn === config.color ? (
                'Tocca a te'
              ) : (
                `${level.name} sta pensando…`
              )
            ) : (
              `Muove il ${turn === 'white' ? 'Bianco' : 'Nero'}`
            )}
          </div>

          {evals && (
            <Review
              history={history}
              evals={evals}
              reviews={reviews}
              ply={ply}
              analyzing={analyzing}
              names={names}
              onGo={go}
              showBest={showBest}
              onToggleBest={toggleBest}
            />
          )}
          {result && !evals && history.length > 0 && (
            <button className="btn primary" onClick={analyze}>
              <Icon name="spark" /> Analizza la partita
            </button>
          )}

          <div className="moves" ref={movesEl}>
            {rows.length === 0 && <p className="empty">Le mosse appariranno qui. Buona partita!</p>}
            {rows.map((r) => (
              <div className="move-row" key={r.n}>
                <span className="move-n">{r.n}.</span>
                {[r.w, r.b].map((idx, k) =>
                  idx === undefined ? (
                    <span key={k} className="move-cell empty">
                      …
                    </span>
                  ) : (
                    <button key={k} className={`move-cell ${ply === idx + 1 ? 'current' : ''} ${reviews[idx] ? `g-${reviews[idx].grade}` : ''}`} onClick={() => go(idx + 1)}>
                      {sanIt(history[idx].san)}
                      {reviews[idx] && <em>{GRADES[reviews[idx].grade].glyph}</em>}
                    </button>
                  ),
                )}
              </div>
            ))}
          </div>

          <div className="nav-row">
            <button className="icon-btn" onClick={() => go(0)} disabled={ply === 0} title="Inizio">
              <Icon name="first" />
            </button>
            <button className="icon-btn" onClick={() => go(ply - 1)} disabled={ply === 0} title="Indietro (←)">
              <Icon name="prev" />
            </button>
            <button className="icon-btn" onClick={() => go(ply + 1)} disabled={live} title="Avanti (→)">
              <Icon name="next" />
            </button>
            <button className="icon-btn" onClick={() => go(history.length)} disabled={live} title="Fine">
              <Icon name="last" />
            </button>
          </div>

          <div className="action-grid">
            <button className="btn ghost" onClick={undo} disabled={!!result || history.length <= config.moves.length}>
              <Icon name="undo" /> Annulla
            </button>
            <button className="btn ghost" onClick={askHint} disabled={!!result || hinting || !live || (mode === 'cpu' && turn !== config.color)}>
              <Icon name="bulb" /> {hinting ? 'Penso…' : 'Suggerimento'}
            </button>
            <button className="btn ghost" onClick={() => setFlipped((f) => !f)}>
              <Icon name="flip" /> Ruota
            </button>
            <button className="btn ghost danger" onClick={resign} disabled={!!result}>
              <Icon name="flag" /> Abbandona
            </button>
          </div>

          <div className="toggles">
            <label className="toggle">
              <input type="checkbox" checked={settings.evalBar} onChange={(e) => setSetting('evalBar', e.target.checked)} />
              <span /> Barra di valutazione
            </label>
            {mode === 'local' && (
              <label className="toggle">
                <input type="checkbox" checked={autoFlip} onChange={(e) => setAutoFlip(e.target.checked)} />
                <span /> Ruota a ogni mossa
              </label>
            )}
          </div>

          <div className="panel-foot">
            <button className="btn ghost" onClick={copyPgn} disabled={!history.length}>
              <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copiato' : 'Copia PGN'}
            </button>
            <button className="btn" onClick={result ? onRematch : onExit}>
              <Icon name="plus" /> {result ? 'Rivincita' : 'Nuova partita'}
            </button>
          </div>
        </aside>
      </div>

      {result && showResult && (
        <div className="modal-veil" onClick={() => setShowResult(false)}>
          {(youWon || (mode === 'local' && result.winner)) && <Confetti />}
          <div className={`modal result ${youWon ? 'win' : result.winner === null ? 'draw' : mode === 'cpu' ? 'loss' : 'win'}`} onClick={(e) => e.stopPropagation()}>
            <div className="result-piece">
              <Piece type="k" color={result.winner === 'black' ? 'b' : 'w'} />
            </div>
            <h2>{resultTitle}</h2>
            <p>
              {result.reason}
              {mode === 'cpu' && ` · ${level.name}, livello ${level.id}`}
            </p>
            <div className="modal-actions">
              {history.length > 0 && !evals && (
                <button className="btn primary" onClick={analyze}>
                  <Icon name="spark" /> Analizza la partita
                </button>
              )}
              <button className={history.length > 0 && !evals ? 'btn' : 'btn primary'} onClick={onRematch}>
                Rivincita
              </button>
              <button className="btn" onClick={onExit}>
                Cambia impostazioni
              </button>
              <button className="btn ghost" onClick={() => setShowResult(false)}>
                Rivedi la partita
              </button>
            </div>
            <button className="link" onClick={() => navigate('')}>
              Torna alla home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
