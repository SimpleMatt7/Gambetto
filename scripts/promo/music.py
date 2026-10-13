#!/usr/bin/env python3
"""Colonna sonora originale dei video promozionali, sintetizzata da zero (nessun campione esterno).

    python3 music.py teaser uscita.wav 16     brano ritmato a 120 bpm, 8 battute, con stacco a 2 s e finale a 12 s
    python3 music.py long uscita.wav 88       sottofondo più calmo a 100 bpm, della durata richiesta
    python3 music.py long uscita.wav 60 4.8 52.8   lo stesso, con un soffio a ogni cambio scena (ogni 4,8 s) e il finale a 52,8 s
"""
import sys
import wave

import numpy as np

SR = 44100
rng = np.random.default_rng(7)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def tt(n):
    return np.arange(n) / SR


# ───────────── Strumenti ─────────────

def kick(gain=1.0):
    n = int(SR * 0.36)
    t = tt(n)
    freq = 44 + 120 * np.exp(-t / 0.032)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / 0.15)
    click = rng.standard_normal(n) * np.exp(-t / 0.002) * 0.25
    return (body + click) * gain


def clap(gain=1.0):
    n = int(SR * 0.22)
    t = tt(n)
    noise = np.diff(rng.standard_normal(n + 1))
    env = np.exp(-t / 0.06) + 0.5 * np.exp(-np.abs(t - 0.012) / 0.004)
    return noise * env * 0.35 * gain


def hat(gain=1.0, decay=0.022):
    n = int(SR * 0.09)
    noise = np.diff(rng.standard_normal(n + 2), 2)
    return noise * np.exp(-tt(n) / decay) * 0.16 * gain


def harmonic(freq, n, weights):
    t = tt(n)
    out = np.zeros(n)
    for k, w in enumerate(weights, start=1):
        if freq * k < SR / 2.2:
            out += w * np.sin(2 * np.pi * freq * k * t)
    return out


def bass(midi, dur, gain=1.0):
    n = int(SR * dur)
    t = tt(n)
    sig = harmonic(hz(midi), n, [1, 0.55, 0.3, 0.16, 0.08, 0.04])
    env = np.minimum(1, t / 0.006) * np.exp(-t / (dur * 0.9)) * np.minimum(1, (dur - t) / 0.02)
    return sig * env * 0.5 * gain


def pad(midis, dur, gain=1.0, cents=7):
    """Accordo morbido con due voci leggermente scordate per canale: restituisce (sinistra, destra)."""
    n = int(SR * dur)
    t = tt(n)
    weights = [1 / (k ** 1.5) for k in range(1, 7)]
    env = np.minimum(1, t / 0.5) * np.minimum(1, (dur - t) / 0.7)
    left = np.zeros(n)
    right = np.zeros(n)
    for m in midis:
        f = hz(m)
        left += harmonic(f * 2 ** (-cents / 1200), n, weights)
        right += harmonic(f * 2 ** (cents / 1200), n, weights)
    k = 0.11 * gain / max(1, len(midis)) ** 0.5
    return left * env * k, right * env * k


def pluck(midi, dur=0.3, gain=1.0, bright=1.0):
    n = int(SR * dur)
    t = tt(n)
    out = np.zeros(n)
    for k in range(1, 7):
        f = hz(midi) * k
        if f < SR / 2.2:
            out += (bright ** (k - 1)) / k * np.sin(2 * np.pi * f * t) * np.exp(-t * k / 0.16)
    return out * np.minimum(1, t / 0.003) * 0.3 * gain


def riser(dur, gain=1.0):
    n = int(SR * dur)
    t = tt(n)
    x = t / dur
    noise = np.diff(rng.standard_normal(n + 1)) * x ** 2.2 * 0.22
    sweep = np.sin(2 * np.pi * np.cumsum(180 * 2 ** (x * 3.2)) / SR) * x ** 3 * 0.16
    return (noise + sweep) * gain


def impact(gain=1.0):
    n = int(SR * 2.6)
    t = tt(n)
    boom = np.sin(2 * np.pi * np.cumsum(34 + 40 * np.exp(-t / 0.08)) / SR) * np.exp(-t / 0.7)
    noise = rng.standard_normal(n)
    # Filtro passa-basso semplice: media mobile.
    crash = np.convolve(noise, np.ones(6) / 6, mode='same') * np.exp(-t / 0.45) * 0.3
    return (boom + crash) * gain


def whoosh(dur=0.42, gain=1.0):
    n = int(SR * dur)
    x = tt(n) / dur
    return np.diff(rng.standard_normal(n + 1)) * np.sin(np.pi * x ** 1.6) ** 2 * 0.2 * gain


# ───────────── Banco di missaggio ─────────────

class Mix:
    def __init__(self, seconds):
        self.n = int(SR * seconds)
        self.buses = {}

    def bus(self, name):
        return self.buses.setdefault(name, np.zeros((2, self.n)))

    def add(self, name, sig, at, pan=0.0):
        """pan da -1 (sinistra) a 1 (destra). `sig` può essere mono o una coppia (sinistra, destra)."""
        start = int(SR * at)
        if start >= self.n or start < 0:
            return
        left, right = sig if isinstance(sig, tuple) else (sig * min(1, 1 - pan), sig * min(1, 1 + pan))
        end = min(self.n, start + len(left))
        b = self.bus(name)
        b[0, start:end] += left[: end - start]
        b[1, start:end] += right[: end - start]

    def echo(self, name, delay, feedback=0.42, taps=4):
        """Eco che rimbalza tra i due canali."""
        b = self.bus(name)
        dry = b.copy()
        d = int(SR * delay)
        for i in range(1, taps + 1):
            g = feedback ** i
            src = dry[::-1] if i % 2 else dry
            b[:, d * i:] += src[:, : self.n - d * i] * g if d * i < self.n else 0

    def duck(self, names, kick_times, depth=0.6, release=0.2):
        """Abbassa per un attimo gli strumenti indicati a ogni colpo di cassa: dà il tipico "respiro"."""
        gain = np.ones(self.n)
        t = tt(self.n)
        for k in kick_times:
            i = int(SR * k)
            if i < self.n:
                gain[i:] = np.minimum(gain[i:], 1 - depth * np.exp(-(t[i:] - k) / release))
        for name in names:
            if name in self.buses:
                self.buses[name] *= gain

    def render(self, levels, fade_in=0.0, fade_out=1.0, peak=0.89):
        out = sum(self.buses[n] * levels.get(n, 1.0) for n in self.buses)
        t = tt(self.n)
        dur = self.n / SR
        if fade_in:
            out *= np.minimum(1, t / fade_in)
        out *= np.clip((dur - t) / fade_out, 0, 1)
        out = np.tanh(out * 1.3)
        return out / np.max(np.abs(out)) * peak


def save(path, stereo):
    data = (stereo.T * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


# Accordi: (basso, note dell'accordo). La minore, Fa, Do, Sol.
AM = (45, [57, 60, 64])
F = (41, [57, 60, 65])
C = (48, [55, 60, 64])
G = (43, [55, 59, 62])
EM = (40, [55, 59, 64])


def arp_notes(chord, octaves=2):
    notes = []
    for o in range(octaves):
        notes += [m + 12 * (o + 1) for m in chord[1]]
    return notes


def teaser(seconds):
    beat = 0.5
    bar = 4 * beat
    m = Mix(seconds)
    drop = bar          # dopo il cartello iniziale entra il ritmo
    finale = 6 * bar    # cartello di chiusura
    chords = [AM, F, C, G, AM, F]

    # Apertura: colpo, accordo sospeso, note che salgono verso lo stacco.
    m.add('fx', impact(0.7), 0)
    m.add('pad', pad(AM[1] + [69], bar + 0.6, 0.9), 0)
    for i in range(8):
        m.add('pluck', pluck(arp_notes(AM)[i % 6], 0.3, 0.25 + i * 0.07, 0.6 + i * 0.05), i * beat / 2, pan=(-0.5 if i % 2 else 0.5))
    m.add('fx', riser(1.1), drop - 1.1)

    kicks = []
    pattern = [0, 2, 1, 3, 2, 4, 3, 5, 4, 2, 3, 1, 5, 3, 4, 2]
    for b in range(1, 6):
        root, _ = chord = chords[b]
        start = b * bar
        notes = arp_notes(chord)
        m.add('pad', pad(chord[1], bar + 0.25), start)
        for q in range(4):
            at = start + q * beat
            kicks.append(at)
            m.add('kick', kick(), at)
            if q % 2:
                m.add('drums', clap(), at)
            m.add('drums', hat(1.0, 0.035), at + beat / 2, pan=0.25)
            for s in (0.25, 0.75):
                m.add('drums', hat(0.45), at + s * beat, pan=-0.3)
            for e in range(2):
                m.add('bass', bass(root - 12 + (12 if e else 0), beat / 2 * 0.95), at + e * beat / 2)
        for s in range(16):
            m.add('pluck', pluck(notes[pattern[s]], 0.26, 0.85 if s % 4 == 0 else 0.6), start + s * beat / 4, pan=(-0.45 if s % 2 else 0.45))
        # Un soffio d'aria accompagna ogni stacco di scena.
        m.add('fx', whoosh(), start + bar - 0.32, pan=(0.4 if b % 2 else -0.4))

    # Rullata e salita verso il finale.
    for i in range(8):
        m.add('drums', clap(0.45 + i * 0.07), finale - beat + i * beat / 8)
    m.add('fx', riser(1.5, 1.1), finale - 1.5)

    # Finale: colpo pieno e accordo che resta in aria.
    m.add('fx', impact(1.25), finale)
    m.add('kick', kick(1.1), finale)
    m.add('pad', pad([45, 57, 60, 64, 71], seconds - finale, 1.5), finale)
    m.add('bass', bass(33, 2.6, 1.1), finale)
    for i, note in enumerate([69, 72, 76, 81, 84, 88]):
        m.add('pluck', pluck(note, 0.9, 0.8 - i * 0.07, 0.8), finale + i * beat / 2, pan=(-0.5 if i % 2 else 0.5))

    m.echo('pluck', beat * 0.75, 0.4)
    m.duck(['pad', 'bass', 'pluck'], kicks, 0.55, 0.16)
    return m.render({'kick': 1.0, 'drums': 0.9, 'bass': 0.85, 'pad': 1.0, 'pluck': 0.9, 'fx': 0.9}, fade_out=1.6)


def long(seconds, cut=None, finale=None):
    beat = 0.6
    bar = 4 * beat
    bars = int(np.ceil(seconds / bar))
    m = Mix(seconds)
    loop_a = [AM, F, C, G]
    loop_b = [AM, F, C, EM]
    kicks = []
    motif = [0, 2, 4, 2, 5, 4, 2, 1]
    for b in range(bars):
        loop = loop_b if (b // 4) % 2 else loop_a
        root, _ = chord = loop[b % 4]
        start = b * bar
        notes = arp_notes(chord)
        ending = start >= finale - 0.01 if finale else b >= bars - 2
        intro = b < 4
        # Ogni otto battute una pausa della ritmica, per far respirare il brano.
        rest = b % 8 == 7
        busy = b >= bars // 2
        m.add('pad', pad(chord[1] + [chord[1][0] + 12], bar + 0.5), start)
        if ending:
            continue
        if not intro:
            m.add('bass', bass(root - 12, beat * 1.9), start)
            m.add('bass', bass(root - 12, beat * 1.9, 0.8), start + 2 * beat)
        if not intro and not rest:
            for q in range(4):
                at = start + q * beat
                kicks.append(at)
                m.add('kick', kick(0.8 if q % 2 == 0 else 0.6), at)
                m.add('drums', hat(0.8, 0.03), at + beat / 2, pan=0.25)
                if busy:
                    m.add('drums', hat(0.35), at + beat * 0.75, pan=-0.3)
                if q % 2 and b >= 8:
                    m.add('drums', clap(0.5), at)
        steps = 16 if busy and not rest else 8
        for s in range(steps):
            if intro and s % 2:
                continue
            note = notes[motif[(s + b) % 8]]
            m.add('pluck', pluck(note, 0.4, 0.75 if s % (steps // 4) == 0 else 0.5, 0.75), start + s * bar / steps, pan=(-0.4 if s % 2 else 0.4))
    m.add('fx', impact(0.5), 0)
    if cut:
        # Un soffio leggero accompagna ogni cambio di scena.
        for i in range(1, int(seconds / cut)):
            m.add('fx', whoosh(0.5, 0.7), i * cut - 0.36, pan=(0.4 if i % 2 else -0.4))
    if finale:
        m.add('fx', riser(1.6, 0.8), finale - 1.6)
        m.add('fx', impact(1.0), finale)
        m.add('pad', pad([45, 57, 60, 64, 71], seconds - finale, 1.3), finale)
        for i, note in enumerate([69, 72, 76, 81, 84, 88]):
            m.add('pluck', pluck(note, 0.9, 0.7 - i * 0.06, 0.8), finale + i * beat / 2, pan=(-0.5 if i % 2 else 0.5))
    m.echo('pluck', beat * 0.75, 0.45, 5)
    m.duck(['pad', 'bass'], kicks, 0.4, 0.2)
    return m.render({'kick': 0.75, 'drums': 0.6, 'bass': 0.7, 'pad': 1.1, 'pluck': 0.8, 'fx': 0.8}, fade_in=0.4, fade_out=3.0, peak=0.8)


if __name__ == '__main__':
    kind, path, seconds = sys.argv[1], sys.argv[2], float(sys.argv[3])
    extra = [float(x) for x in sys.argv[4:6]]
    save(path, teaser(seconds) if kind == 'teaser' else long(seconds, *extra))
