#!/usr/bin/env python3
"""Designed game rocket effects: existing CC0-derived rifle attack plus seeded noise.
These are layered effects, not recordings of a real launcher. Requires numpy.
See Assets/Resources/Audio/SOURCES.md for the source gunshot's attribution.
"""
from pathlib import Path
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / 'Assets/Resources/Audio'
RATE = 44100


def filtered_noise(n, cutoff, seed):
    x = np.random.default_rng(seed).normal(0, 1, n)
    frequencies = np.fft.rfftfreq(n, 1 / RATE)
    transfer = 1 / np.sqrt(1 + (frequencies / cutoff) ** 6)
    transfer *= 1 - np.exp(-(frequencies / 32) ** 4)
    out = np.fft.irfft(np.fft.rfft(x) * transfer, n=n)
    return out / max(np.sqrt(np.mean(out * out)), 1e-8)


def write(name, x):
    x -= x.mean()
    # Gentle transient saturation, then headroom for the game's overlapping voices.
    x = np.tanh(x * .8)
    x[:88] *= np.linspace(0, 1, 88)
    x[-4410:] *= np.linspace(1, 0, 4410)
    x *= .89 / max(abs(x))
    assert np.isfinite(x).all() and max(abs(x)) < .90
    pcm = np.round(x * 32767).astype('<i2')
    with wave.open(str(AUDIO / name), 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(RATE); f.writeframes(pcm.tobytes())
    print(name, 'seconds', round(len(x)/RATE, 2), 'peak', round(max(abs(x)),3))


def main():
    with wave.open(str(AUDIO / 'shot_sniper.wav')) as f:
        assert f.getsampwidth() == 2
        channels, rate = f.getnchannels(), f.getframerate()
        attack = np.frombuffer(f.readframes(f.getnframes()), '<i2').astype(float).reshape(-1, channels).mean(axis=1) / 32768
        if rate != RATE:
            attack = np.interp(np.arange(int(len(attack)*RATE/rate))/RATE, np.arange(len(attack))/rate, attack)
    n = int(1.25 * RATE); t = np.arange(n) / RATE
    launch = .20 * filtered_noise(n, 6000, 27) * np.exp(-t * 6)
    launch += .18 * filtered_noise(n, 700, 28) * (1-np.exp(-t*70)) * np.exp(-t * 4.5)
    length = min(len(attack), int(.16 * RATE))
    launch[:length] += attack[:length] * np.linspace(.8, 0, length)
    write('rocket_launch.wav', launch)
    n = int(3.2 * RATE); t = np.arange(n) / RATE
    blast = .26 * filtered_noise(n, 9000, 42) * np.exp(-t * 18)
    blast += .25 * filtered_noise(n, 1100, 43) * np.exp(-t * 4.5)
    blast += .23 * filtered_noise(n, 180, 44) * (1-np.exp(-t*120)) * np.exp(-t * 2.5)
    length = min(len(attack), int(.22*RATE))
    blast[:length] += attack[:length] * np.linspace(.9, 0, length)
    for delay, gain in [(.19,.20),(.43,.12),(.83,.065)]:
        offset = int(delay*RATE)
        blast[offset:] += filtered_noise(n-offset, 550, offset) * gain * np.exp(-np.arange(n-offset)/RATE*4)
    write('rocket_explosion.wav', blast)

if __name__ == '__main__': main()
