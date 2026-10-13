import { useEffect, useMemo, useRef, useState } from 'react';
import type { Move } from 'chess.js';
import { evaluate, review, type PosEval } from './analysis.ts';
import { analysisEngine } from './engine.ts';

/**
 * Analisi di una partita conclusa: il motore valuta ogni posizione, una dopo l'altra,
 * e i risultati compaiono man mano. Usata sia per le partite locali sia per quelle online.
 */
export function useAnalysis(history: Move[], finalFen: string, ply: number) {
  const [evals, setEvals] = useState<PosEval[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showBest, setShowBest] = useState(false);
  // Ogni avvio ha un gettone: se cambia (nuovo avvio o uscita dalla pagina) il ciclo in corso si ferma.
  const token = useRef<object | null>(null);

  const reviews = useMemo(() => (evals ? review(history, evals) : []), [history, evals]);

  const start = async () => {
    if (token.current || evals) return;
    const mine = (token.current = {});
    const fens = [...history.map((m) => m.before), finalFen];
    const engine = analysisEngine();
    engine.stop();
    setAnalyzing(true);
    setEvals([]);
    const out: PosEval[] = [];
    for (const fen of fens) {
      const e = await evaluate(engine, fen);
      if (token.current !== mine) return;
      out.push(e);
      setEvals([...out]);
    }
    setAnalyzing(false);
  };

  useEffect(
    () => () => {
      if (token.current) analysisEngine().stop();
      token.current = null;
    },
    [],
  );

  useEffect(() => setShowBest(false), [ply]);

  return {
    evals,
    reviews,
    analyzing,
    start,
    showBest,
    toggleBest: () => setShowBest((s) => !s),
    /** Mossa migliore (UCI) da mostrare al posto di quella giocata, quando l'utente lo chiede. */
    bestOf: showBest && ply > 0 ? (reviews[ply - 1]?.bestUci ?? null) : null,
  };
}
