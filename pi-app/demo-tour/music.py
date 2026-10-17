"""Original ambient-tech background track (no samples, no third-party audio).

Warm detuned pads on Cmaj7 - Am7 - Fmaj7 - G6, a soft plucked arpeggio, a gentle
kick pulse and airy off-beat ticks, through a simple convolution reverb.
Usage: python music.py <seconds> <out.wav>
"""
import sys
import wave

import numpy as np

SR = 44100
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)

dur = float(sys.argv[1])
out = sys.argv[2]
n = int(dur * SR) + SR
L = np.zeros(n)
R = np.zeros(n)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# Cmaj7, Am7, Fmaj7, G6 (voiced around middle C)
CHORDS = [
    [48, 55, 59, 64, 67],  # C  G  B  E  G
    [45, 52, 55, 60, 64],  # A  E  G  C  E
    [41, 48, 52, 57, 60],  # F  C  E  A  C
    [43, 50, 55, 59, 64],  # G  D  G  B  E
]


def add(buf, start, sig):
    i = int(start * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]


def pad(freq, length):
    t = np.arange(int(length * SR)) / SR
    s = np.zeros_like(t)
    for det, pan in ((-0.0018, 0.0), (0.0, 0.5), (0.0021, 1.0)):
        f = freq * (1 + det)
        # soft "saw" from a few decaying harmonics
        for h, a in ((1, 1.0), (2, 0.32), (3, 0.14), (4, 0.06)):
            s += a * np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6.28))
    atk, rel = 0.9, 1.2
    env = np.minimum(1, t / atk) * np.minimum(1, (length - t) / rel).clip(0, 1)
    return s * env / 6


def pluck(freq, length=0.9):
    t = np.arange(int(length * SR)) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2 * t) + 0.12 * np.sin(2 * np.pi * freq * 3 * t)
    return s * np.exp(-t * 5.5) * np.minimum(1, t / 0.004)


def kick(length=0.32):
    t = np.arange(int(length * SR)) / SR
    f = 46 + 70 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 11)


def tick(length=0.05):
    t = np.arange(int(length * SR)) / SR
    s = rng.normal(0, 1, len(t))
    s = s - np.convolve(s, np.ones(8) / 8, mode="same")  # crude high-pass
    return s * np.exp(-t * 90)


bars = int(np.ceil(dur / BAR))
for b in range(bars):
    t0 = b * BAR
    chord = CHORDS[b % 4]
    # pads (low notes centre, upper notes spread)
    for k, m in enumerate(chord):
        p = pad(hz(m), BAR + 1.2) * (0.55 if k == 0 else 0.42)
        pan = 0.5 if k == 0 else (0.3 if k % 2 else 0.7)
        add(L, t0, p * (1 - pan) * 1.2)
        add(R, t0, p * pan * 1.2)
    # bass root
    add(L, t0, pad(hz(chord[0] - 12), BAR + 0.6) * 0.5)
    add(R, t0, pad(hz(chord[0] - 12), BAR + 0.6) * 0.5)

    intro = b < 2
    outro = b >= bars - 2
    # plucked 8th-note arpeggio, an octave up, ping-ponged
    if not intro:
        pattern = [1, 2, 3, 4, 3, 2, 4, 3]
        for s in range(8):
            m = chord[pattern[s]] + 12
            p = pluck(hz(m)) * (0.22 if s % 2 == 0 else 0.16)
            pan = 0.25 if s % 2 == 0 else 0.75
            add(L, t0 + s * BEAT / 2, p * (1 - pan) * 1.6)
            add(R, t0 + s * BEAT / 2, p * pan * 1.6)
    # gentle pulse
    if not intro and not outro:
        for s in (0, 2):
            add(L, t0 + s * BEAT, kick() * 0.32)
            add(R, t0 + s * BEAT, kick() * 0.32)
        for s in range(4):
            add(L, t0 + s * BEAT + BEAT / 2, tick() * 0.035)
            add(R, t0 + s * BEAT + BEAT / 2, tick() * 0.05)


def reverb(x, seconds=2.4, mix=0.32):
    m = int(seconds * SR)
    t = np.arange(m) / SR
    ir = rng.normal(0, 1, m) * np.exp(-t * 3.0)
    ir[0] = 0
    ir /= np.sqrt((ir**2).sum())
    size = 1 << int(np.ceil(np.log2(len(x) + m)))
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * (1 - mix) + wet * mix * 3.0


L, R = reverb(L), reverb(R)

# trim, fades, normalise
total = int(dur * SR)
L, R = L[:total], R[:total]
fade_in, fade_out = int(2.0 * SR), int(3.5 * SR)
env = np.ones(total)
env[:fade_in] = np.linspace(0, 1, fade_in)
env[-fade_out:] = np.linspace(1, 0, fade_out)
L *= env
R *= env
peak = max(np.abs(L).max(), np.abs(R).max())
L, R = L / peak * 0.72, R / peak * 0.72
pcm = (np.stack([L, R], axis=1) * 32767).astype("<i2")

with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", out, round(dur, 2), "s")
