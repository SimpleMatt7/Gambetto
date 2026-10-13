import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Board, type Arrow } from '../components/Board.tsx';
import { Confetti, Icon, Rich } from '../components/ui.tsx';
import { COURSES, START_FEN, type Course, type Lesson, type Step } from '../data/lessons.ts';
import { useAccount } from '../lib/account.ts';
import { findSan, sideOf, stripSan } from '../lib/chess.ts';
import { href, navigate, useRoute } from '../lib/router.ts';
import { sfx } from '../lib/sound.ts';
import { completeLesson, useStore } from '../lib/store.ts';

export function Learn() {
  const { path } = useRoute();
  const course = COURSES.find((c) => c.id === path[1]);
  const lesson = course?.lessons.find((l) => l.id === path[2]);
  if (course && lesson) return <LessonPlayer key={`${course.id}/${lesson.id}`} course={course} lesson={lesson} />;
  return <Courses />;
}

function Courses() {
  const { lessons: done } = useStore();
  return (
    <div className="page learn">
      <header className="page-head">
        <span className="eyebrow">Scuola di scacchi</span>
        <h1>Impara giocando</h1>
        <p className="lead">Lezioni brevi e interattive: leggi, guarda la scacchiera e poi prova tu. Tre percorsi, dal primo Pedone ai finali da maestro.</p>
      </header>

      {COURSES.map((course, ci) => {
        const count = course.lessons.filter((l) => done.includes(`${course.id}/${l.id}`)).length;
        const pct = Math.round((count / course.lessons.length) * 100);
        return (
          <section key={course.id} className={`course course-${course.id}`} style={{ animationDelay: `${ci * 90}ms` }}>
            <div className="course-head">
              <div className="ring" style={{ ['--pct' as string]: pct }}>
                <span>{pct}%</span>
              </div>
              <div>
                <span className="eyebrow">
                  Livello {ci + 1} · {course.tagline}
                </span>
                <h2>{course.title}</h2>
                <p>{course.description}</p>
              </div>
            </div>
            <div className="lesson-grid">
              {course.lessons.map((l, i) => {
                const isDone = done.includes(`${course.id}/${l.id}`);
                return (
                  <a key={l.id} className={`lesson-card ${isDone ? 'done' : ''}`} href={href(`impara/${course.id}/${l.id}`)}>
                    <span className="lesson-icon">{l.icon}</span>
                    <span className="lesson-text">
                      <span className="lesson-n">Lezione {i + 1}</span>
                      <strong>{l.title}</strong>
                      <small>{l.summary}</small>
                    </span>
                    <span className="lesson-state">{isDone ? <Icon name="check" /> : <Icon name="next" />}</span>
                  </a>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Posizione di partenza di un passo: FEN più le eventuali mosse preliminari. */
function setupStep(step: Step) {
  const chess = new Chess(step.fen ?? START_FEN);
  let last: [string, string] | null = null;
  for (const san of (step.pre ?? '').split(' ').filter(Boolean)) {
    const m = chess.move(san);
    last = [m.from, m.to];
  }
  return { chess, last };
}

function LessonPlayer({ course, lesson }: { course: Course; lesson: Lesson }) {
  const { user, ready } = useAccount();
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const step = lesson.steps[index];
  const lessonIndex = course.lessons.indexOf(lesson);
  const nextLesson = course.lessons[lessonIndex + 1];
  const nextCourse = COURSES[COURSES.indexOf(course) + 1];

  // Stato dell'esercizio corrente.
  const start = useMemo(() => setupStep(step), [step]);
  const chess = useRef(start.chess);
  const [fen, setFen] = useState(start.chess.fen());
  const [last, setLast] = useState<[string, string] | null>(start.last);
  const [pos, setPos] = useState(0);
  const [solved, setSolved] = useState(!step.line);
  const [wrong, setWrong] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef(0);

  const reset = () => {
    window.clearTimeout(timer.current);
    const s = setupStep(step);
    chess.current = s.chess;
    setFen(s.chess.fen());
    setLast(s.last);
    setPos(0);
    setSolved(!step.line);
    setWrong(0);
    setShowHint(false);
    setBusy(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reset, [step]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const userSide = sideOf(start.chess.turn());
  const orientation = step.orientation ?? (step.line ? userSide : 'white');

  const onMove = (from: string, to: string, promotion?: string) => {
    if (!step.line || solved || busy) return false;
    const game = chess.current;
    const probe = new Chess(game.fen());
    let san: string;
    try {
      san = probe.move({ from, to, promotion }).san;
    } catch {
      return false;
    }
    const isLast = pos === step.line.length - 1;
    const accepted = step.line[pos].split('|').map(stripSan).includes(stripSan(san)) || (isLast && step.anyMate && probe.isCheckmate());
    if (!accepted) {
      sfx.error();
      setWrong((w) => w + 1);
      return false;
    }
    game.move({ from, to, promotion });
    sfx.forMove(san);
    setFen(game.fen());
    setLast([from, to]);
    setShowHint(false);
    setWrong(0);
    if (isLast) {
      setSolved(true);
      window.setTimeout(sfx.success, 250);
      return true;
    }
    // Risposta dell'avversario.
    setBusy(true);
    timer.current = window.setTimeout(() => {
      const reply = game.move(findSan(game, step.line![pos + 1])!);
      sfx.forMove(reply.san);
      setFen(game.fen());
      setLast([reply.from, reply.to]);
      setPos(pos + 2);
      setBusy(false);
    }, 650);
    return true;
  };

  const hintArrow: Arrow[] = useMemo(() => {
    if (!showHint || !step.line || solved || busy) return [];
    const m = findSan(new Chess(fen), step.line[pos].split('|')[0]);
    return m ? [{ from: m.from, to: m.to, brush: 'blue' }] : [];
  }, [showHint, step, solved, busy, fen, pos]);

  const stepArrows: Arrow[] = step.line ? hintArrow : (step.arrows ?? []).map((a) => ({ from: a.slice(0, 2), to: a.slice(2, 4) }));

  const next = () => {
    if (index < lesson.steps.length - 1) {
      setIndex(index + 1);
    } else {
      completeLesson(`${course.id}/${lesson.id}`);
      setFinished(true);
      sfx.win();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished) return;
      if ((e.key === 'ArrowRight' || e.key === 'Enter') && solved) next();
      if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (finished) {
    return (
      <div className="page lesson-done">
        <Confetti />
        <div className="done-card">
          <span className="done-badge">
            <Icon name="check" size={34} />
          </span>
          <span className="eyebrow">Lezione completata</span>
          <h1>{lesson.title}</h1>
          <p className="lead">Ben fatto! Un altro mattone nella tua cultura scacchistica.</p>
          {ready && !user && (
            <a className="nudge" href={href('account', { nuovo: '1' })}>
              <Icon name="lock" size={16} />
              <span>
                I tuoi progressi sono salvati solo su questo dispositivo. <strong>Crea un account gratuito</strong> per non perderli.
              </span>
            </a>
          )}
          <div className="modal-actions">
            {nextLesson ? (
              <button className="btn primary" onClick={() => navigate(`impara/${course.id}/${nextLesson.id}`)}>
                Prossima: {nextLesson.title} <Icon name="arrow" />
              </button>
            ) : nextCourse ? (
              <button className="btn primary" onClick={() => navigate(`impara/${nextCourse.id}/${nextCourse.lessons[0].id}`)}>
                Passa al corso {nextCourse.title} <Icon name="arrow" />
              </button>
            ) : (
              <button className="btn primary" onClick={() => navigate('aperture')}>
                Scopri le aperture <Icon name="arrow" />
              </button>
            )}
            <button className="btn" onClick={() => navigate('gioca')}>
              Gioca una partita
            </button>
            <button className="btn ghost" onClick={() => navigate('impara')}>
              Tutte le lezioni
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page lesson">
      <div className="game-layout">
        <div className="board-col">
          <Board
            fen={fen}
            orientation={orientation}
            movable={step.line && !solved && !busy ? userSide : 'none'}
            lastMove={last}
            arrows={stepArrows}
            circles={step.line ? [] : step.squares}
            onMove={onMove}
            className={wrong ? (wrong % 2 ? 'shake-a' : 'shake-b') : ''}
          />
        </div>

        <aside className="side-panel lesson-panel">
          <a className="crumb" href={href('impara')}>
            <Icon name="back" size={15} /> {course.title} · Lezione {lessonIndex + 1}
          </a>
          <h2>{lesson.title}</h2>

          <div className="dots" aria-label={`Passo ${index + 1} di ${lesson.steps.length}`}>
            {lesson.steps.map((s, i) => (
              <i key={i} className={`${i < index ? 'past' : ''} ${i === index ? 'now' : ''} ${s.line ? 'exercise' : ''}`} />
            ))}
          </div>

          <div className="lesson-body" key={index}>
            {step.line && (
              <span className="tag">
                <Icon name="spark" size={14} /> Tocca a te
              </span>
            )}
            <p>
              <Rich text={step.text} />
            </p>

            {step.line && solved && (
              <div className="feedback good">
                <Icon name="check" />
                <span>{step.success ?? 'Esatto!'}</span>
              </div>
            )}
            {step.line && !solved && wrong > 0 && (
              <div className="feedback bad" key={wrong}>
                <span>Non è la mossa giusta. Riprova!</span>
              </div>
            )}
            {step.line && !solved && (showHint || wrong >= 2) && step.hint && (
              <div className="feedback hint">
                <Icon name="bulb" />
                <span>{step.hint}</span>
              </div>
            )}
          </div>

          <div className="lesson-actions">
            <button className="btn ghost" onClick={() => setIndex(index - 1)} disabled={index === 0}>
              <Icon name="prev" /> Indietro
            </button>
            {step.line && !solved && (
              <button className="btn ghost" onClick={() => setShowHint(true)}>
                <Icon name="bulb" /> Aiuto
              </button>
            )}
            {step.line && (pos > 0 || solved) && (
              <button className="btn ghost" onClick={reset}>
                <Icon name="undo" /> Ripeti
              </button>
            )}
            <button className="btn primary" onClick={next} disabled={!solved}>
              {index === lesson.steps.length - 1 ? 'Concludi' : 'Avanti'} <Icon name="next" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
