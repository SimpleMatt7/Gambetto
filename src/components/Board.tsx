import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { destsOf, sideOf, type Side } from '../lib/chess.ts';
import { useStore } from '../lib/store.ts';
import { Piece } from './Piece.tsx';

export interface Arrow {
  from: string;
  to: string;
  brush?: 'green' | 'red' | 'blue' | 'yellow';
}

interface BoardProps {
  fen: string;
  orientation?: Side;
  /** Chi può muovere i pezzi con il mouse o con il tocco. */
  movable?: Side | 'both' | 'none';
  lastMove?: [string, string] | null;
  arrows?: Arrow[];
  circles?: string[];
  /** Restituisce false per rifiutare la mossa: il pezzo torna al suo posto. */
  onMove?: (from: string, to: string, promotion?: string) => boolean | void;
  className?: string;
}

const PROMOTIONS = ['q', 'n', 'r', 'b'] as const;

export function Board(props: BoardProps) {
  const { settings } = useStore();
  const host = useRef<HTMLDivElement>(null);
  const cg = useRef<Api | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [promo, setPromo] = useState<{ from: string; to: string; color: 'w' | 'b' } | null>(null);
  const showDests = useRef(settings.showDests);
  showDests.current = settings.showDests;

  const sync = useCallback(() => {
    const api = cg.current;
    if (!api) return;
    const p = latest.current;
    const chess = new Chess(p.fen);
    const turn = sideOf(chess.turn());
    const movable = p.movable ?? 'none';
    const canMove = (movable === 'both' || movable === turn) && !chess.isGameOver();
    api.set({
      fen: p.fen,
      orientation: p.orientation ?? 'white',
      turnColor: turn,
      check: chess.inCheck(),
      lastMove: (p.lastMove as Key[] | null | undefined) ?? undefined,
      movable: {
        free: false,
        color: canMove ? turn : undefined,
        dests: canMove ? (destsOf(chess) as Map<Key, Key[]>) : new Map(),
        showDests: showDests.current,
      },
    });
    const shapes: DrawShape[] = [
      ...(p.arrows ?? []).map((a) => ({ orig: a.from as Key, dest: a.to as Key, brush: a.brush ?? 'green' })),
      ...(p.circles ?? []).map((c) => ({ orig: c as Key, brush: 'yellow' })),
    ];
    api.setAutoShapes(shapes);
  }, []);

  const commit = useCallback(
    (from: string, to: string, promotion?: string) => {
      const accepted = latest.current.onMove?.(from, to, promotion);
      // Mossa rifiutata: lascia vedere l'errore per un attimo, poi rimetti il pezzo a posto.
      if (accepted === false) window.setTimeout(sync, 280);
    },
    [sync],
  );

  useEffect(() => {
    if (!host.current) return;
    cg.current = Chessground(host.current, {
      coordinates: settings.coords,
      // In 3D i pezzi più vicini devono coprire quelli dietro.
      addPieceZIndex: settings.board3d,
      animation: { enabled: true, duration: 240 },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      draggable: { showGhost: true },
      movable: {
        free: false,
        events: {
          after: (orig, dest) => {
            const piece = new Chess(latest.current.fen).get(orig as Square);
            if (piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1')) {
              setPromo({ from: orig, to: dest, color: piece.color });
            } else {
              commit(orig, dest);
            }
          },
        },
      },
    });
    sync();
    return () => {
      cg.current?.destroy();
      cg.current = null;
    };
    // La scacchiera si crea una volta sola; gli aggiornamenti passano da sync().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shapesKey = JSON.stringify([props.arrows, props.circles]);
  useEffect(sync, [sync, props.fen, props.orientation, props.movable, props.lastMove?.join(), shapesKey, settings.showDests]);

  useEffect(() => {
    cg.current?.set({ coordinates: settings.coords });
    cg.current?.redrawAll();
  }, [settings.coords]);

  useEffect(() => {
    cg.current?.set({ addPieceZIndex: settings.board3d });
    cg.current?.redrawAll();
  }, [settings.board3d, settings.pieces3d]);

  const choose = (piece?: string) => {
    if (!promo) return;
    setPromo(null);
    if (piece) commit(promo.from, promo.to, piece);
    else sync();
  };

  return (
    <div className={`board-frame theme-${settings.boardTheme} ${settings.board3d ? `is3d b3d-${settings.board3dStyle} set-${settings.pieces3d}` : ''} ${props.className ?? ''}`}>
      <div className="board-square">
        <div ref={host} className="board-host" />
        {promo && (
          <div className="promo-veil" onClick={() => choose()}>
            <div className="promo-box" onClick={(e) => e.stopPropagation()}>
              <span className="promo-title">Promuovi a</span>
              <div className="promo-options">
                {PROMOTIONS.map((p) => (
                  <button key={p} onClick={() => choose(p)} aria-label={p}>
                    <Piece type={p} color={promo.color} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
