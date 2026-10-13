// Verifica che ogni posizione e ogni mossa dei contenuti didattici sia legale.
import { Chess } from 'chess.js';
import { COURSES, START_FEN } from '../src/data/lessons.ts';
import { OPENINGS, TRICKS, OPERA_GAME } from '../src/data/openings.ts';

let errors = 0;
const fail = (where: string, msg: string) => {
  errors++;
  console.error(`✗ ${where}: ${msg}`);
};
const strip = (s: string) => s.replace(/[+#]/g, '');

for (const course of COURSES) {
  for (const lesson of course.lessons) {
    lesson.steps.forEach((step, i) => {
      const where = `${course.id}/${lesson.id}#${i + 1}`;
      let chess: Chess;
      try {
        chess = new Chess(step.fen ?? START_FEN);
      } catch (e) {
        return fail(where, `FEN non valida: ${(e as Error).message}`);
      }
      try {
        for (const m of (step.pre ?? '').split(' ').filter(Boolean)) chess.move(m);
      } catch (e) {
        return fail(where, `pre: ${(e as Error).message}`);
      }
      for (const a of step.arrows ?? []) if (!/^[a-h][1-8][a-h][1-8]$/.test(a)) fail(where, `freccia ${a}`);
      for (const s of step.squares ?? []) if (!/^[a-h][1-8]$/.test(s)) fail(where, `casa ${s}`);
      if (step.line) {
        step.line.forEach((entry, j) => {
          const options = entry.split('|');
          const legal = chess.moves().map(strip);
          for (const o of options) if (!legal.includes(strip(o))) fail(where, `mossa ${j + 1} "${o}" illegale. Legali: ${legal.join(' ')}`);
          try {
            chess.move(chess.moves().find((m) => strip(m) === strip(options[0]))!);
          } catch {
            /* già segnalato */
          }
        });
        if (step.line.length % 2 === 0) fail(where, 'la linea deve finire con una mossa dell\'utente');
      }
      if (step.expect === 'mate' && !chess.isCheckmate()) fail(where, 'atteso scacco matto');
      if (step.expect === 'stalemate' && !chess.isStalemate()) fail(where, 'atteso stallo');
      if (!step.expect && step.line && chess.isCheckmate()) fail(where, 'matto non dichiarato');
    });
  }
}

for (const line of [...OPENINGS, ...TRICKS, { id: 'opera', moves: OPERA_GAME, notes: {} }]) {
  const chess = new Chess();
  const moves = line.moves.split(' ');
  moves.forEach((m, i) => {
    try {
      const r = chess.move(m);
      if (r.san !== m) fail(line.id, `SAN "${m}" dovrebbe essere "${r.san}"`);
    } catch {
      fail(line.id, `mossa ${i + 1} "${m}" illegale. Legali: ${chess.moves().join(' ')}`);
    }
  });
  for (const k of Object.keys(line.notes ?? {})) if (+k < 1 || +k > moves.length) fail(line.id, `nota ${k} fuori linea`);
  if (line.moves.endsWith('#') && !chess.isCheckmate()) fail(line.id, 'atteso matto');
}

const lessons = COURSES.reduce((n, c) => n + c.lessons.length, 0);
console.log(errors ? `\n${errors} errori` : `✓ ${lessons} lezioni, ${OPENINGS.length} aperture, ${TRICKS.length} chicche: tutto legale`);
process.exit(errors ? 1 : 0);
