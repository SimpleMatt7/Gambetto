import type { Move } from 'chess.js';
import { formatEval, GRADES, summarize, winPct, type PlyReview, type PosEval } from '../lib/analysis.ts';
import { sanIt } from '../lib/chess.ts';
import { Icon } from './ui.tsx';

interface ReviewProps {
  history: Move[];
  evals: PosEval[];
  reviews: PlyReview[];
  ply: number;
  analyzing: boolean;
  names: { white: string; black: string };
  onGo: (ply: number) => void;
  showBest: boolean;
  onToggleBest: () => void;
}

/** Riepilogo dell'analisi: precisione, grafico del vantaggio e giudizio sulla mossa corrente. */
export function Review({ history, evals, reviews, ply, analyzing, names, onGo, showBest, onToggleBest }: ReviewProps) {
  const total = history.length;
  const summary = summarize(history, reviews);
  const x = (i: number) => (total ? (i / total) * 100 : 0);
  const points = evals.map((e, i) => `${x(i)},${100 - winPct(e.cp)}`);
  const area = points.length ? `M0,100 L${points.join(' L')} L${x(evals.length - 1)},100 Z` : '';
  const current = ply > 0 ? reviews[ply - 1] : undefined;
  const move = ply > 0 ? history[ply - 1] : undefined;

  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    onGo(Math.round(((e.clientX - box.left) / box.width) * total));
  };

  return (
    <div className="review">
      {analyzing ? (
        <div className="review-progress">
          <span>
            Analisi in corso… {Math.max(0, evals.length - 1)}/{total}
          </span>
          <div className="bar">
            <i style={{ width: `${(evals.length / (total + 1)) * 100}%` }} />
          </div>
        </div>
      ) : (
        <div className="review-summary">
          {(['w', 'b'] as const).map((c) => (
            <div key={c} className="review-side">
              <span className="review-name">
                <i className={c === 'w' ? 'dot white' : 'dot black'} /> {c === 'w' ? names.white : names.black}
              </span>
              <strong>
                {summary[c].accuracy.toFixed(0)}
                <small>%</small>
              </strong>
              <span className="review-label">precisione</span>
              <span className="review-counts">
                <b className="g-inaccuracy" title="Imprecisioni">
                  ?! {summary[c].counts.inaccuracy}
                </b>
                <b className="g-mistake" title="Errori">
                  ? {summary[c].counts.mistake}
                </b>
                <b className="g-blunder" title="Errori gravi">
                  ?? {summary[c].counts.blunder}
                </b>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="review-graph" onClick={pick} title="Clicca per andare a quel punto della partita">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path d={area} className="graph-area" />
          <line x1="0" y1="50" x2="100" y2="50" className="graph-mid" />
        </svg>
        {reviews.map((r, i) =>
          r.grade === 'mistake' || r.grade === 'blunder' ? (
            <i key={i} className={`graph-dot g-${r.grade}`} style={{ left: `${x(i + 1)}%`, top: `${100 - winPct(evals[i + 1].cp)}%` }} />
          ) : null,
        )}
        <i className="graph-cursor" style={{ left: `${x(ply)}%` }} />
      </div>

      {!analyzing && (
        <div className="review-note" key={ply}>
          {current && move ? (
            <>
              <p>
                <span className={`grade g-${current.grade}`}>{GRADES[current.grade].label}</span>
                <strong>
                  {Math.ceil(ply / 2)}
                  {move.color === 'w' ? '.' : '…'} {sanIt(move.san)}
                  {GRADES[current.grade].glyph}
                </strong>
                <span className="review-eval">{formatEval(evals[ply])}</span>
              </p>
              {current.bestSan && current.grade !== 'good' && (
                <p className="review-better">
                  Era meglio <strong>{sanIt(current.bestSan)}</strong>
                  <button className={`btn ghost small ${showBest ? 'on' : ''}`} onClick={onToggleBest}>
                    <Icon name="bulb" size={15} /> {showBest ? 'Nascondi' : 'Mostra'}
                  </button>
                </p>
              )}
            </>
          ) : (
            <p className="dim">Scorri le mosse o clicca sul grafico: gli errori sono segnati con un punto colorato.</p>
          )}
        </div>
      )}
    </div>
  );
}
