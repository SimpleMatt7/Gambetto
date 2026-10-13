import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { Board } from '../components/Board.tsx';
import { Icon } from '../components/ui.tsx';
import { COURSES } from '../data/lessons.ts';
import { OPENINGS, OPERA_GAME, TRICKS } from '../data/openings.ts';
import { sanIt } from '../lib/chess.ts';
import { href } from '../lib/router.ts';
import { useStore } from '../lib/store.ts';

/** Scacchiera della home che rigioca da sola una partita celebre. */
function DemoBoard() {
  const frames = useMemo(() => {
    const chess = new Chess();
    const list: { fen: string; last: [string, string] | null; san: string; n: number }[] = [{ fen: chess.fen(), last: null, san: '', n: 0 }];
    OPERA_GAME.split(' ').forEach((san, i) => {
      const m = chess.move(san);
      list.push({ fen: chess.fen(), last: [m.from, m.to], san: m.san, n: i + 1 });
    });
    return list;
  }, []);
  const [i, setI] = useState(0);
  useEffect(() => {
    const atEnd = i === frames.length - 1;
    const id = window.setTimeout(() => setI(atEnd ? 0 : i + 1), atEnd ? 4200 : i === 0 ? 1600 : 1250);
    return () => window.clearTimeout(id);
  }, [i, frames.length]);
  const f = frames[i];
  return (
    <figure className="demo">
      <div className="demo-glow" />
      <Board fen={f.fen} lastMove={f.last} />
      <figcaption>
        <span>
          <strong>Morphy</strong> – Duca di Brunswick · Parigi, 1858
        </span>
        <span className="demo-move" key={i}>
          {f.n ? `${Math.ceil(f.n / 2)}${f.n % 2 ? '.' : '…'} ${sanIt(f.san)}` : '“La partita dell’Opera”'}
        </span>
      </figcaption>
    </figure>
  );
}

export function Home() {
  const { lessons, lines, stats } = useStore();
  const totalLessons = COURSES.reduce((n, c) => n + c.lessons.length, 0);
  const wins = Object.values(stats).reduce((n, s) => n + s.w, 0);
  const games = Object.values(stats).reduce((n, s) => n + s.w + s.l + s.d, 0);

  // Prima lezione non ancora completata.
  const upNext = COURSES.flatMap((c) => c.lessons.map((l) => ({ c, l }))).find(({ c, l }) => !lessons.includes(`${c.id}/${l.id}`));

  const cards = [
    { to: href('gioca'), icon: 'cpu', title: 'Sfida il computer', text: 'Otto livelli, dal principiante al Gran Maestro. Con suggerimenti, annulla mossa e orologio.', cta: 'Gioca' },
    { to: href('gioca', { mode: 'local' }), icon: 'users', title: 'Due giocatori', text: 'Sullo stesso schermo, dal vivo, oppure online a distanza mandando un link a un amico.', cta: 'Apri la scacchiera', alt: { to: href('online'), label: 'Gioca online' } },
    { to: href('impara'), icon: 'book', title: 'Impara', text: `${totalLessons} lezioni interattive in tre percorsi: base, intermedio e avanzato.`, cta: 'Inizia a studiare' },
    { to: href('aperture'), icon: 'spark', title: 'Aperture e chicche', text: `${OPENINGS.length} aperture famose e ${TRICKS.length} trappole da imparare a memoria e provare in partita.`, cta: 'Sfoglia il repertorio' },
  ];

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-text">
          <span className="eyebrow">Gioca · Impara · Stupisci</span>
          <h1>
            Ogni grande partita
            <br />
            comincia da <em>una mossa.</em>
          </h1>
          <p className="lead">Sfida il computer al tuo livello, impara dalle basi ai finali da maestro e scopri le aperture e le trappole che hanno fatto la storia degli scacchi.</p>
          <div className="hero-cta">
            <a className="btn primary xl" href={href('gioca')}>
              Gioca ora <Icon name="arrow" />
            </a>
            <a className="btn xl" href={upNext ? href(`impara/${upNext.c.id}/${upNext.l.id}`) : href('impara')}>
              {lessons.length ? 'Continua a imparare' : 'Impara da zero'}
            </a>
          </div>
          <dl className="hero-stats">
            <div>
              <dt>
                {lessons.length}
                <small>/{totalLessons}</small>
              </dt>
              <dd>lezioni completate</dd>
            </div>
            <div>
              <dt>
                {lines.length}
                <small>/{OPENINGS.length + TRICKS.length}</small>
              </dt>
              <dd>linee allenate</dd>
            </div>
            <div>
              <dt>
                {wins}
                <small>/{games}</small>
              </dt>
              <dd>partite vinte</dd>
            </div>
          </dl>
        </div>
        <DemoBoard />
      </section>

      <section className="mode-grid">
        {cards.map((c, i) => (
          <a key={c.title} className="mode-card" href={c.to} style={{ animationDelay: `${150 + i * 80}ms` }}>
            <span className="mode-icon">
              <Icon name={c.icon} size={24} />
            </span>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
            <span className="mode-cta">
              {c.cta} <Icon name="arrow" size={16} />
            </span>
            {c.alt && (
              <object className="mode-alt">
                <a href={c.alt.to}>{c.alt.label} →</a>
              </object>
            )}
          </a>
        ))}
      </section>

      {upNext && (
        <a className="up-next" href={href(`impara/${upNext.c.id}/${upNext.l.id}`)}>
          <span className="lesson-icon">{upNext.l.icon}</span>
          <span>
            <span className="eyebrow">Prossima lezione · Corso {upNext.c.title}</span>
            <strong>{upNext.l.title}</strong>
            <small>{upNext.l.summary}</small>
          </span>
          <Icon name="arrow" />
        </a>
      )}
    </div>
  );
}
