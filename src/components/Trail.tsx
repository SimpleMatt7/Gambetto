import { sanIt } from '../lib/chess.ts';
import { Icon } from './ui.tsx';

interface TrailProps {
  /** Posizione da cui parte la sequenza: serve a numerare le mosse. */
  startFen: string;
  /** Mosse giocate finora, in notazione standard. */
  sans: string[];
  /** Quante mosse sono mostrate sulla scacchiera (da 0 a tutte). */
  view: number;
  onView: (n: number) => void;
}

/** Elenco compatto delle mosse giocate, con i pulsanti per ripercorrerle una alla volta. */
export function Trail({ startFen, sans, view, onView }: TrailProps) {
  const [, turn, , , , fullmove] = startFen.split(' ');
  const offset = turn === 'b' ? 1 : 0;
  const first = Number(fullmove) || 1;
  const total = sans.length;
  return (
    <div className="trail">
      <div className="trail-moves">
        {sans.map((san, i) => {
          const half = i + offset;
          const label = half % 2 === 0 ? `${first + half / 2}.` : i === 0 ? `${first}…` : '';
          return (
            <span key={i}>
              {label && <i>{label}</i>}
              <button className={view === i + 1 ? 'current' : ''} onClick={() => onView(i + 1)}>
                {sanIt(san)}
              </button>
            </span>
          );
        })}
      </div>
      <div className="nav-row">
        <button className="icon-btn" onClick={() => onView(0)} disabled={view === 0} title="Inizio">
          <Icon name="first" />
        </button>
        <button className="icon-btn" onClick={() => onView(view - 1)} disabled={view === 0} title="Mossa precedente">
          <Icon name="prev" />
        </button>
        <button className="icon-btn" onClick={() => onView(view + 1)} disabled={view === total} title="Mossa successiva">
          <Icon name="next" />
        </button>
        <button className="icon-btn" onClick={() => onView(total)} disabled={view === total} title="Posizione attuale">
          <Icon name="last" />
        </button>
      </div>
    </div>
  );
}
