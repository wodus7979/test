"""Low chest growl -> forceful roar, from rubberduck's CC0 mouth recordings.
See AudioSources/LICENSE.txt. Deterministic, no API or network required.
"""
from pathlib import Path
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
RATE = 48000
DURATION = 2.833333


def read(name):
    with wave.open(str(Path(__file__).parent / 'AudioSources' / (name + '.wav'))) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float) / 32768
        return x - x.mean()


def pitch(x, speed):
    # Slower playback lowers both fundamental and throat formants together.
    return np.interp(np.arange(0, len(x) - 1, speed), np.arange(len(x)), x)


def eq(x, low=45, high=3100):
    pad = 4096
    padded = np.pad(x, (pad, pad))
    f = np.fft.rfftfreq(len(padded), 1 / RATE)
    band = (1 - np.exp(-(f / low) ** 4)) / np.sqrt(1 + (f / high) ** 8)
    chest = 1 + .65 * np.exp(-.5 * ((f - 155) / 110) ** 2)
    return np.fft.irfft(np.fft.rfft(padded) * band * chest, n=len(padded))[pad:-pad]


def build():
    out = np.zeros(round(DURATION * RATE))
    def layer(x, start, gain, attack=.04, release=.15):
        x = x.copy()
        a, r = min(len(x), int(attack * RATE)), min(len(x), int(release * RATE))
        x[:a] *= np.linspace(0, 1, a) ** 1.3
        x[-r:] *= np.linspace(1, 0, r) ** 1.3
        offset = int(start * RATE)
        count = min(len(x), len(out) - offset)
        out[offset:offset + count] += x[:count] * gain
    # No long echo, synthetic sweeping tones or harsh high-frequency hiss.
    layer(eq(pitch(read('grunt_03'), .70), high=1800), .03, .50, .09, .20)
    roar = read('roar_02')
    layer(eq(pitch(roar, .64)), .64, .90, .04, .22)
    layer(eq(pitch(roar, .43), high=440), .64, .30, .06, .30)
    dry = out.copy()
    for seconds, gain in [(.037, .07), (.079, .045), (.131, .022)]:
        delay = int(seconds * RATE)
        out[delay:] += dry[:-delay] * gain
    out -= out.mean()
    out = np.tanh(out * 1.2)
    out *= .80 / max(np.max(np.abs(out)), 1e-6)
    out[:480] *= np.linspace(0, 1, 480)
    out[-7200:] *= np.linspace(1, 0, 7200)
    # Centered voice remains readable on phone speakers; peaks leave mix headroom.
    output = ROOT / 'Assets/Resources/HeroAudio/transform.wav'
    with wave.open(str(output), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes((out * 32767).astype('<i2').tobytes())
    print(output, 'seconds=', round(len(out)/RATE, 3), 'peak=', round(float(np.max(abs(out))), 3), 'rms=', round(float(np.sqrt(np.mean(out**2))), 3))
    return output

if __name__ == '__main__':
    build()
