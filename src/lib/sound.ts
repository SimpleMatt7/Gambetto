import { getState } from './store.ts';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!getState().settings.sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; at?: number; to?: number } = {}) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + (opts.at ?? 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  g.gain.setValueAtTime(opts.gain ?? 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Colpo secco di legno: rumore filtrato più un tonfo grave. */
function knock(gain = 0.5, at = 0, pitch = 1) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const len = Math.floor(ac.sampleRate * 0.05);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1500 * pitch;
  filter.Q.value = 1.2;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(t);
  tone(190 * pitch, 0.07, { gain: gain * 0.5, at, to: 80 * pitch });
}

export const sfx = {
  move: () => knock(0.5),
  capture: () => {
    knock(0.7, 0, 0.8);
    knock(0.45, 0.045, 1.25);
  },
  check: () => {
    knock(0.5);
    tone(880, 0.16, { type: 'triangle', gain: 0.09, at: 0.03 });
  },
  castle: () => {
    knock(0.5);
    knock(0.45, 0.09, 0.9);
  },
  success: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.3, { type: 'triangle', gain: 0.1, at: i * 0.085 })),
  error: () => tone(170, 0.2, { type: 'sawtooth', gain: 0.06, to: 110 }),
  win: () => [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.55, { type: 'triangle', gain: 0.1, at: i * 0.11 })),
  lose: () => [392, 349.23, 311.13, 261.63].forEach((f, i) => tone(f, 0.5, { type: 'sine', gain: 0.12, at: i * 0.16 })),
  draw: () => [440, 440].forEach((f, i) => tone(f, 0.3, { type: 'sine', gain: 0.1, at: i * 0.2 })),
  /** Suono adatto a una mossa appena giocata, dedotto dalla notazione. */
  forMove(san: string) {
    if (san.includes('#') || san.includes('+')) sfx.check();
    else if (san.includes('x')) sfx.capture();
    else if (san.startsWith('O-O')) sfx.castle();
    else sfx.move();
  },
};
