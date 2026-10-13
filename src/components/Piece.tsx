import { useMemo } from 'react';
import { PIECE_NAMES } from '../lib/chess.ts';
import { useStore } from '../lib/store.ts';

/** Un pezzo disegnato con le stesse immagini della scacchiera. */
export function Piece({ type, color, className = '' }: { type: string; color: 'w' | 'b'; className?: string }) {
  // <piece> è il tag usato dai fogli di stile di Chessground: lo si inserisce come HTML perché React non lo conosce.
  const html = `<piece class="${PIECE_NAMES[type]} ${color === 'w' ? 'white' : 'black'}"></piece>`;
  return <span className={`cg-wrap piece-icon ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Scacchiera statica e leggera, per anteprime e miniature. */
export function MiniBoard({ fen, flipped = false }: { fen: string; flipped?: boolean }) {
  const { settings } = useStore();
  const cells = useMemo(() => {
    const out: ({ type: string; color: 'w' | 'b' } | null)[] = [];
    for (const ch of fen.split(' ')[0]) {
      if (ch === '/') continue;
      if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) out.push(null);
      else out.push({ type: ch.toLowerCase(), color: ch === ch.toLowerCase() ? 'b' : 'w' });
    }
    return flipped ? out.reverse() : out;
  }, [fen, flipped]);
  return (
    <div className={`mini-board theme-${settings.boardTheme}`}>
      {cells.map((c, i) => (
        <div key={i} className="mini-cell">
          {c && <Piece type={c.type} color={c.color} />}
        </div>
      ))}
    </div>
  );
}
