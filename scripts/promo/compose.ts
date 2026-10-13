// Monta una visita guidata dell'app (gambetto-riprese*.mp4) a partire dalle scene registrate da record.ts,
// e aggiunge la musica (music.py). I video promozionali veri e propri sono animazioni a parte: vedi motion.ts.
// Usa ffmpeg e python3 dentro Ubuntu (WSL). Lavora su ogni formato di cui trova le scene.
//   node scripts/promo/compose.ts
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Clip {
  name: string;
  duration: number;
  marks: Record<string, number>;
}

const ENCODE = ['-c:v', 'libx264', '-crf', '19', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-an'];

for (const [folder, suffix] of [
  ['frames-h', ''],
  ['frames-v', '-verticale'],
]) {
  const FRAMES = resolve('promo', folder);
  if (!existsSync(`${FRAMES}/clips.json`)) continue;
  const clips: Clip[] = JSON.parse(readFileSync(`${FRAMES}/clips.json`, 'utf8'));
  const clip = (prefix: string) => clips.find((c) => c.name.startsWith(prefix))!;
  const mark = (prefix: string, name: string) => clip(prefix).marks[name];

  const wsl = (program: string, args: string[]) => {
    const r = spawnSync('wsl.exe', ['--cd', FRAMES, '-d', 'Ubuntu', '-u', 'root', '--', program, ...args], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`${program} ha fallito: ${args.join(' ')}`);
  };
  const ffmpeg = (args: string[]) => wsl('ffmpeg', ['-y', '-loglevel', 'error', ...args]);

  /** Un pezzo di scena, dal secondo `from` al secondo `to`, portato a durare `length` secondi. */
  const segment = (out: string, name: string, from: number, to: number, length: number, fadeIn: number, fadeOut: number) => {
    const speed = (to - from) / length;
    const filters = [`trim=start=${from.toFixed(2)}:end=${to.toFixed(2)}`, `setpts=(PTS-STARTPTS)/${speed.toFixed(4)}`, 'fps=30'];
    if (fadeIn) filters.push(`fade=t=in:st=0:d=${fadeIn}`);
    if (fadeOut) filters.push(`fade=t=out:st=${(length - fadeOut).toFixed(2)}:d=${fadeOut}`);
    // Il filtro passa da un file: WSL inoltra gli argomenti a una shell, che inciamperebbe sulle parentesi.
    writeFileSync(`${FRAMES}/_filter.txt`, filters.join(','));
    ffmpeg(['-f', 'concat', '-safe', '0', '-i', `${name}.txt`, '-filter_script:v', '_filter.txt', '-t', length.toFixed(3), ...ENCODE, out]);
  };

  /** Unisce i pezzi, genera la musica della durata giusta e la monta sul video. */
  const finish = (out: string, parts: string[], music: 'teaser' | 'long', seconds: number) => {
    writeFileSync(`${FRAMES}/_join.txt`, parts.map((p) => `file '${p}'`).join('\n') + '\n');
    ffmpeg(['-f', 'concat', '-safe', '0', '-i', '_join.txt', '-c', 'copy', '_silent.mp4']);
    wsl('python3', ['../../scripts/promo/music.py', music, '_music.wav', seconds.toFixed(2)]);
    ffmpeg(['-i', '_silent.mp4', '-i', '_music.wav', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', `../${out}`]);
    for (const p of [...parts, '_join.txt', '_filter.txt', '_silent.mp4', '_music.wav']) rmSync(`${FRAMES}/${p}`, { force: true });
    console.log(`${out}: ${seconds.toFixed(0)} s`);
  };

  // ── Presentazione: tutte le scene, accelerate quanto basta per tenere il ritmo ──
  const SPEED: Record<string, number> = { '01': 1, '02': 2.2, '03': 2.3, '04': 1.6, '05': 1.3, '06': 1.5, '07': 1.8, '08': 1 };
  let total = 0;
  const long = clips.map((c, i) => {
    const length = Math.round((c.duration / (SPEED[c.name.slice(0, 2)] ?? 1)) * 30) / 30;
    segment(`_long-${i}.mp4`, c.name, 0, c.duration, length, 0.3, 0.3);
    total += length;
    return `_long-${i}.mp4`;
  });
  finish(`gambetto-riprese${suffix}.mp4`, long, 'long', total);
}
