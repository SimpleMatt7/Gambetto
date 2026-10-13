import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Board } from '../components/Board.tsx';
import { Piece } from '../components/Piece.tsx';
import { Review } from '../components/Review.tsx';
import { Confetti, EvalBar, Icon } from '../components/ui.tsx';
import { api, useAccount } from '../lib/account.ts';
import { GRADES } from '../lib/analysis.ts';
import { material, other, sanIt, type Side } from '../lib/chess.ts';
import { href, navigate, useRoute } from '../lib/router.ts';
import { sfx } from '../lib/sound.ts';
import { useAnalysis } from '../lib/useAnalysis.ts';

const TIMES = [
  { id: 'none', label: 'Senza tempo' },
  { id: '3+2', label: '3 + 2' },
  { id: '5+0', label: '5 min' },
  { id: '10+0', label: '10 min' },
  { id: '15+10', label: '15 + 10' },
];

interface GameSummary {
  id: string;
  status: 'waiting' | 'active' | 'finished';
  result: Side | 'draw' | null;
  reason: string | null;
  white: string | null;
  black: string | null;
  white_id: number | null;
  black_id: number | null;
  plies: number;
  time_base: number;
  time_inc: number;
  updated_at: number;
}

/** Stato della partita così come lo manda il server a ogni cambiamento. */
interface GameState {
  id: string;
  status: 'waiting' | 'active' | 'finished';
  white: { id: number; name: string } | null;
  black: { id: number; name: string } | null;
  moves: string[];
  timeBase: number;
  timeInc: number;
  clock: { white: number; black: number; running: boolean };
  result: Side | 'draw' | null;
  reason: string | null;
  drawOffer: Side | null;
  rematchOffer: Side | null;
  rematchId: string | null;
  you: Side | 'spectator';
  online: { white: boolean; black: boolean };
  /** Da quanti millisecondi manca ciascun giocatore (null se è collegato). */
  away: { white: number | null; black: number | null };
  claimAfter: number;
}

export const timeLabel = (base: number, inc: number) => (base ? `${base / 60} + ${inc}` : 'Senza tempo');
const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function Online() {
  const { path } = useRoute();
  return path[1] ? <OnlineGame key={path[1]} id={path[1]} /> : <Lobby />;
}

function Lobby() {
  const { user, ready, config } = useAccount();
  const [time, setTime] = useState('10+0');
  const [color, setColor] = useState<Side | 'random'>('random');
  const [games, setGames] = useState<GameSummary[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    api<{ games: GameSummary[] }>('GET', '/api/games')
      .then((r) => setGames(r.games))
      .catch(() => undefined);
  }, [user]);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ id: string }>('POST', '/api/games', { time, color });
      navigate(`online/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (!ready) return <div className="page center-note">Un momento…</div>;

  return (
    <div className="page setup">
      <header className="page-head">
        <span className="eyebrow">Gioca online</span>
        <h1>Sfida un amico a distanza</h1>
        <p className="lead">Crei una partita, mandi il link a chi vuoi e giocate in tempo reale, ognuno dal proprio dispositivo.</p>
      </header>

      {!user ? (
        <div className="gate">
          <Icon name="lock" size={26} />
          <p>Per giocare online serve un account: così l'avversario sa con chi gioca e la partita resta salvata.</p>
          <div className="hero-cta">
            <a className="btn primary" href={href('account', { next: 'online' })}>
              Accedi
            </a>
            <a className="btn" href={href('account', { next: 'online', nuovo: '1' })}>
              Crea un account
            </a>
          </div>
          <a className="link" href={href('gioca', { mode: 'local' })}>
            Oppure gioca in due sullo stesso schermo, senza account
          </a>
        </div>
      ) : (
        <>
          <div className="setup-row">
            <section className="setup-block">
              <h2>Tempo</h2>
              <div className="segmented">
                {TIMES.map((t) => (
                  <button key={t.id} className={time === t.id ? 'on' : ''} onClick={() => setTime(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </section>
            <section className="setup-block">
              <h2>Giochi con</h2>
              <div className="segmented">
                <button className={color === 'white' ? 'on' : ''} onClick={() => setColor('white')}>
                  <Piece type="k" color="w" /> Bianco
                </button>
                <button className={color === 'random' ? 'on' : ''} onClick={() => setColor('random')}>
                  A caso
                </button>
                <button className={color === 'black' ? 'on' : ''} onClick={() => setColor('black')}>
                  <Piece type="k" color="b" /> Nero
                </button>
              </div>
            </section>
          </div>
          {error && <div className="feedback bad">{error}</div>}
          {!config.online && <div className="feedback hint">Le partite online sono momentaneamente sospese dall'amministratore.</div>}
          <button className="btn primary xl" onClick={create} disabled={busy || (!config.online && user.role !== 'admin')}>
            Crea la partita <Icon name="arrow" />
          </button>

          {games.length > 0 && (
            <section className="my-games">
              <h2>Le tue partite</h2>
              {games.map((g) => {
                const mine: Side = g.white_id === user.id ? 'white' : 'black';
                const opponent = (mine === 'white' ? g.black : g.white) ?? (g.status === 'waiting' ? 'in attesa di un avversario' : 'utente eliminato');
                const outcome = g.status !== 'finished' ? (g.status === 'waiting' ? 'In attesa' : 'In corso') : g.result === 'draw' ? 'Patta' : g.result === mine ? 'Vinta' : 'Persa';
                return (
                  <a key={g.id} className="game-row" href={href(`online/${g.id}`)}>
                    <Piece type="k" color={mine === 'white' ? 'w' : 'b'} />
                    <span className="game-row-main">
                      <strong>contro {opponent}</strong>
                      <small>
                        {timeLabel(g.time_base, g.time_inc)} · {Math.ceil(g.plies / 2)} mosse · {new Date(g.updated_at).toLocaleDateString('it-IT')}
                      </small>
                    </span>
                    <span className={`chip ${outcome === 'Vinta' ? 'ok' : ''} ${g.status !== 'finished' ? 'live' : ''}`}>{outcome}</span>
                  </a>
                );
              })}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function OnlineGame({ id }: { id: string }) {
  const { user, ready } = useAccount();
  const [g, setG] = useState<GameState | null>(null);
  const [gone, setGone] = useState(false);
  const [connected, setConnected] = useState(false);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [pending, setPending] = useState<{ fen: string; last: [string, string] } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, setTick] = useState(0);
  const socket = useRef<WebSocket | null>(null);
  const seen = useRef<{ plies: number; status: string } | null>(null);
  const syncedAt = useRef(0);
  const myMove = useRef(false);

  // Connessione al server, con riconnessione automatica se cade la linea.
  useEffect(() => {
    if (!ready) return;
    let closed = false;
    let retry = 0;
    let timer = 0;
    const connect = () => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?game=${id}`);
      socket.current = ws;
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.t === 'gone') {
          closed = true;
          setGone(true);
        } else if (msg.t === 'state') {
          syncedAt.current = performance.now();
          setPending(null);
          setG(msg);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) timer = window.setTimeout(connect, Math.min(5000, 800 * ++retry));
      };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      socket.current?.close();
    };
    // Si riconnette anche quando cambia l'utente: il server deve sapere chi sta guardando.
  }, [id, ready, user?.id]);

  const send = (msg: object) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(msg));
  };

  const movesKey = g?.moves.join(' ') ?? '';
  const { history, liveFen, turn, inCheck } = useMemo(() => {
    const chess = new Chess();
    const history = (movesKey ? movesKey.split(' ') : []).map((san) => chess.move(san));
    return { history, liveFen: chess.fen(), turn: (chess.turn() === 'w' ? 'white' : 'black') as Side, inCheck: chess.inCheck() };
  }, [movesKey]);

  // Suoni e finestra del risultato solo per ciò che accade mentre si guarda, non al caricamento.
  useEffect(() => {
    if (!g) return;
    const prev = seen.current;
    seen.current = { plies: g.moves.length, status: g.status };
    if (!prev) return;
    if (g.moves.length > prev.plies) {
      if (!myMove.current) sfx.forMove(g.moves[g.moves.length - 1]);
      myMove.current = false;
      setViewPly(null);
    }
    if (prev.status === 'waiting' && g.status === 'active') sfx.success();
    if (prev.status !== 'finished' && g.status === 'finished') {
      setShowResult(true);
      window.setTimeout(() => (g.result === 'draw' ? sfx.draw() : g.result === g.you ? sfx.win() : g.you === 'spectator' ? sfx.win() : sfx.lose()), 350);
    }
  }, [g]);

  // Rivincita accettata: i due giocatori passano insieme alla nuova partita.
  useEffect(() => {
    if (g?.rematchId && g.you !== 'spectator') navigate(`online/${g.rematchId}`);
  }, [g?.rematchId, g?.you]);

  const running = !!g?.clock.running && g.status === 'active';
  // Serve un aggiornamento continuo finché corre l'orologio o si conta l'assenza di un giocatore.
  const ticking = g?.status === 'active' && (g.clock.running || g.away.white !== null || g.away.black !== null);
  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 200);
    return () => window.clearInterval(timer);
  }, [ticking]);

  const ply = viewPly ?? history.length;
  const live = viewPly === null;
  const analysis = useAnalysis(history, liveFen, ply);
  const go = useCallback(
    (target: number) => {
      const n = Math.max(0, Math.min(history.length, target));
      setViewPly(n === history.length ? null : n);
    },
    [history.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') go(ply - 1);
      else if (e.key === 'ArrowRight') go(ply + 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, ply]);

  const movesEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    movesEl.current?.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  }, [ply]);

  const link = `${location.origin}${location.pathname}#/online/${id}`;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt('Copia:', text);
    }
  };

  if (gone) {
    return (
      <div className="page setup">
        <div className="gate">
          <h2>Partita non trovata</h2>
          <p>Il link non è valido oppure la partita è stata annullata.</p>
          <a className="btn primary" href={href('online')}>
            Torna alla sala online
          </a>
        </div>
      </div>
    );
  }
  if (!g) return <div className="page center-note">Collegamento alla partita…</div>;

  const me = g.you === 'spectator' ? null : g.you;

  if (g.status === 'waiting') {
    return (
      <div className="page setup">
        <div className="gate invite">
          <span className="eyebrow">Partita creata · {timeLabel(g.timeBase, g.timeInc)}</span>
          {me ? (
            <>
              <h2>Invita il tuo avversario</h2>
              <p>Manda questo link a chi vuoi sfidare. La partita parte appena lo apre con il suo account.</p>
              <div className="invite-link">
                <input readOnly value={link} onFocus={(e) => e.target.select()} />
                <button className="btn primary" onClick={() => copy(link)}>
                  <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copiato' : 'Copia'}
                </button>
              </div>
              <p className="waiting-line">
                <span className="thinking">
                  <i />
                  <i />
                  <i />
                </span>
                In attesa dell'avversario… giochi con il {me === 'white' ? 'Bianco' : 'Nero'}
              </p>
              <button className="btn ghost" onClick={() => send({ t: 'cancel' })}>
                Annulla la partita
              </button>
            </>
          ) : (
            <>
              <h2>{(g.white ?? g.black)?.name} ti sfida a scacchi</h2>
              <p>Accedi o crea un account per accettare la sfida: bastano un nome utente e una password.</p>
              <div className="hero-cta">
                <a className="btn primary" href={href('account', { next: `online/${id}` })}>
                  Accedi e gioca
                </a>
                <a className="btn" href={href('account', { next: `online/${id}`, nuovo: '1' })}>
                  Crea un account
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const active = g.status === 'active';
  const myTurn = active && me === turn;
  const orientation: Side = flipped ? other(me ?? 'white') : (me ?? 'white');
  const showPending = live && pending;
  const { bestOf, evals, reviews } = analysis;
  const fen = bestOf ? history[ply - 1].before : showPending ? pending.fen : ply === history.length ? liveFen : history[ply].before;
  const last: [string, string] | null = bestOf ? null : showPending ? pending.last : ply > 0 ? [history[ply - 1].from, history[ply - 1].to] : null;
  const mat = material(fen);

  const onMove = (from: string, to: string, promotion?: string) => {
    if (!myTurn || !live || pending) return false;
    const probe = new Chess(liveFen);
    try {
      const m = probe.move({ from, to, promotion });
      sfx.forMove(m.san);
    } catch {
      return false;
    }
    // La mossa si vede subito; il server la conferma (o la annulla) un istante dopo.
    myMove.current = true;
    setPending({ fen: probe.fen(), last: [from, to] });
    send({ t: 'move', from, to, promotion });
    return true;
  };

  const clockOf = (side: Side) => {
    const base = g.clock[side];
    return running && turn === side ? Math.max(0, base - (performance.now() - syncedAt.current)) : base;
  };

  const playerBar = (side: Side) => {
    const p = g[side];
    const adv = side === 'white' ? mat.diff : -mat.diff;
    const isActive = active && turn === side;
    return (
      <div className={`player-bar ${isActive ? 'active' : ''}`}>
        <div className={`avatar ${side}`}>
          <Piece type="k" color={side === 'white' ? 'w' : 'b'} />
        </div>
        <div className="player-info">
          <div className="player-name">
            {p?.name ?? 'Utente eliminato'}
            {side === me && <span className="chip">Tu</span>}
            <i className={`presence ${g.online[side] ? 'on' : ''}`} title={g.online[side] ? 'Collegato' : 'Non collegato'} />
          </div>
          <div className="captured">
            {mat.captured[side].map((piece, i) => (
              <Piece key={i} type={piece} color={side === 'white' ? 'b' : 'w'} />
            ))}
            {adv > 0 && <span className="adv">+{adv}</span>}
          </div>
        </div>
        {g.timeBase > 0 && <div className={`clock ${isActive && running ? 'running' : ''} ${clockOf(side) < 20000 ? 'low' : ''}`}>{fmtClock(clockOf(side))}</div>}
      </div>
    );
  };

  const won = g.result !== null && g.result === me;
  const resultTitle = g.result === null ? '' : g.result === 'draw' ? 'Patta' : me ? (won ? 'Vittoria!' : 'Sconfitta') : `Vince il ${g.result === 'white' ? 'Bianco' : 'Nero'}`;
  const opponentSide = me ? other(me) : null;
  const awayFor = opponentSide && g.away[opponentSide] !== null ? g.away[opponentSide]! + (performance.now() - syncedAt.current) : 0;

  const rows: number[][] = [];
  for (let i = 0; i < history.length; i += 2) rows.push([i, i + 1]);

  const pgn = () => {
    const tags = `[White "${g.white?.name ?? '?'}"]\n[Black "${g.black?.name ?? '?'}"]\n[Result "${g.result === 'white' ? '1-0' : g.result === 'black' ? '0-1' : g.result === 'draw' ? '1/2-1/2' : '*'}"]\n\n`;
    return tags + rows.map(([w, b]) => `${w / 2 + 1}. ${g.moves[w]}${g.moves[b] ? ` ${g.moves[b]}` : ''}`).join(' ');
  };

  const rematchButton = me && g.white && g.black && (
    <button className="btn primary" onClick={() => send({ t: 'rematch' })} disabled={g.rematchOffer === me}>
      {g.rematchOffer === me ? 'Rivincita proposta…' : g.rematchOffer === opponentSide ? 'Accetta la rivincita' : 'Proponi la rivincita'}
    </button>
  );

  const analyzeButton = !active && !evals && history.length > 0 && (
    <button
      className="btn primary"
      onClick={() => {
        setShowResult(false);
        void analysis.start();
      }}
    >
      <Icon name="spark" /> Analizza la partita
    </button>
  );

  return (
    <div className="page game">
      <div className="game-layout">
        <div className="board-col">
          {playerBar(other(orientation))}
          <div className="board-row">
            {evals && evals[ply] && <EvalBar cp={evals[ply].cp} mate={evals[ply].mate} flipped={orientation === 'black'} />}
            <Board
              fen={fen}
              orientation={orientation}
              movable={myTurn && live && !pending ? me! : 'none'}
              lastMove={last}
              arrows={
                bestOf
                  ? [
                      { from: history[ply - 1].from, to: history[ply - 1].to, brush: 'red' },
                      { from: bestOf.slice(0, 2), to: bestOf.slice(2, 4), brush: 'green' },
                    ]
                  : []
              }
              onMove={onMove}
            />
          </div>
          {playerBar(orientation)}
        </div>

        <aside className="side-panel">
          <div className="panel-head">
            <span className="eyebrow">Online · {timeLabel(g.timeBase, g.timeInc)}</span>
            <h2>
              {g.white?.name ?? '?'} <em className="vs">vs</em> {g.black?.name ?? '?'}
            </h2>
          </div>

          <div className="status-line">
            {!connected ? (
              <strong className="warn">Connessione persa, riprovo…</strong>
            ) : !active ? (
              <>
                <strong>{resultTitle}</strong> · {g.reason}
              </>
            ) : inCheck ? (
              <strong className="warn">Scacco al {turn === 'white' ? 'Bianco' : 'Nero'}!</strong>
            ) : !me ? (
              `Stai guardando · muove il ${turn === 'white' ? 'Bianco' : 'Nero'}`
            ) : myTurn ? (
              'Tocca a te'
            ) : (
              `Tocca a ${g[turn]?.name ?? 'l\'avversario'}`
            )}
          </div>

          {active && me && g.drawOffer === opponentSide && (
            <div className="feedback hint offer">
              <span>{g[opponentSide!]?.name} propone la patta.</span>
              <button className="btn small" onClick={() => send({ t: 'draw' })}>
                Accetta
              </button>
              <button className="btn ghost small" onClick={() => send({ t: 'draw-decline' })}>
                Rifiuta
              </button>
            </div>
          )}
          {active && opponentSide && g.away[opponentSide] !== null && (
            <div className="feedback hint offer">
              {awayFor >= g.claimAfter ? (
                <>
                  <span>{g[opponentSide]?.name} non è più collegato.</span>
                  <button className="btn small" onClick={() => send({ t: 'claim' })}>
                    Reclama la vittoria
                  </button>
                </>
              ) : (
                <span>
                  {g[opponentSide]?.name} non è collegato. Se non torna entro {fmtClock(g.claimAfter - awayFor)} potrai reclamare la vittoria.
                </span>
              )}
            </div>
          )}
          {!active && g.rematchOffer === opponentSide && me && <div className="feedback hint">{g[opponentSide!]?.name} vuole la rivincita.</div>}

          {evals && (
            <Review
              history={history}
              evals={evals}
              reviews={reviews}
              ply={ply}
              analyzing={analysis.analyzing}
              names={{ white: g.white?.name ?? 'Bianco', black: g.black?.name ?? 'Nero' }}
              onGo={go}
              showBest={analysis.showBest}
              onToggleBest={analysis.toggleBest}
            />
          )}
          {analyzeButton}

          <div className="moves" ref={movesEl}>
            {rows.length === 0 && <p className="empty">La partita è iniziata. Buon divertimento!</p>}
            {rows.map(([w, b]) => (
              <div className="move-row" key={w}>
                <span className="move-n">{w / 2 + 1}.</span>
                {[w, b].map((idx) =>
                  idx >= history.length ? (
                    <span key={idx} className="move-cell empty">
                      …
                    </span>
                  ) : (
                    <button key={idx} className={`move-cell ${ply === idx + 1 ? 'current' : ''} ${reviews[idx] ? `g-${reviews[idx].grade}` : ''}`} onClick={() => go(idx + 1)}>
                      {sanIt(g.moves[idx])}
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
            <button className="btn ghost" onClick={() => setFlipped((f) => !f)}>
              <Icon name="flip" /> Ruota
            </button>
            <button className="btn ghost" onClick={() => copy(pgn())} disabled={!history.length}>
              <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copiato' : 'Copia PGN'}
            </button>
            {active && me && (
              <>
                <button className="btn ghost" onClick={() => send({ t: 'draw' })} disabled={g.drawOffer === me || history.length < 2}>
                  {g.drawOffer === me ? 'Patta proposta…' : 'Proponi patta'}
                </button>
                <button className="btn ghost danger" onClick={() => window.confirm('Vuoi davvero abbandonare la partita?') && send({ t: 'resign' })}>
                  <Icon name="flag" /> Abbandona
                </button>
              </>
            )}
          </div>

          <div className="panel-foot stack">
            {!active && rematchButton}
            <a className="btn" href={href('online')}>
              <Icon name="plus" /> Nuova partita online
            </a>
          </div>
        </aside>
      </div>

      {!active && showResult && (
        <div className="modal-veil" onClick={() => setShowResult(false)}>
          {(won || !me) && g.result !== 'draw' && <Confetti />}
          <div className={`modal result ${g.result === 'draw' ? 'draw' : won || !me ? 'win' : 'loss'}`} onClick={(e) => e.stopPropagation()}>
            <div className="result-piece">
              <Piece type="k" color={g.result === 'black' ? 'b' : 'w'} />
            </div>
            <h2>{resultTitle}</h2>
            <p>{g.reason}</p>
            <div className="modal-actions">
              {analyzeButton}
              {rematchButton}
              <button className="btn ghost" onClick={() => setShowResult(false)}>
                Rivedi la partita
              </button>
            </div>
            <a className="link" href={href('online')}>
              Torna alla sala online
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
