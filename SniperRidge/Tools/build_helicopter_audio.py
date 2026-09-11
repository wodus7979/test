"""Deterministic, periodic helicopter rotor/engine game effects (not field recordings).
Python 3 + NumPy. No external samples. 8 seconds, 48 kHz stereo PCM16.
"""
from pathlib import Path
import json
import wave
import numpy as np

RATE = 48000
SECONDS = 8
ROOT = Path(__file__).resolve().parents[1] / 'Assets/Resources/Audio'


def build():
    n = RATE * SECONDS
    t = np.arange(n) / RATE
    f = np.fft.rfftfreq(n, 1/RATE)
    rng = np.random.default_rng(61270)

    def band(low, high):
        # Spectral shaping of a periodic sequence avoids filter startup/loop clicks.
        spectrum = np.fft.rfft(rng.standard_normal(n))
        gain = (1-np.exp(-(f/low)**4)) * np.exp(-(f/high)**4)
        gain[0] = 0
        result = np.fft.irfft(spectrum * gain, n)
        return result / np.sqrt(np.mean(result**2))

    # Four blade passages per 4.5 Hz rotor revolution. All rates complete integer cycles.
    pulse = ((1+np.cos(2*np.pi*18*t))/2)**7
    turn = .85 + .15*np.cos(2*np.pi*4.5*t)
    rotor = (.52*band(35, 340) + .18*band(250, 1500)) * (.15+.85*pulse) * turn
    rotor += .065*np.sin(2*np.pi*72*t) + .03*np.sin(2*np.pi*144*t)
    engine = .10*np.sin(2*np.pi*260*t) + .045*np.sin(2*np.pi*520*t)
    engine += .22*band(160, 1800) + .05*band(2000, 4500)
    output = {}
    for name, signal, peak in [('rotor', rotor, .50), ('engine', engine, .35)]:
        stereo = np.column_stack([signal, .88*signal+.12*np.roll(signal, 23)])
        stereo -= stereo.mean(axis=0)
        stereo *= peak / abs(stereo).max()
        filename = f'helicopter_{name}.wav'
        with wave.open(str(ROOT/filename), 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(RATE)
            w.writeframes(np.round(stereo*32767).astype('<i2').tobytes())
        output[filename] = {'seconds': SECONDS, 'rate': RATE, 'peak': peak,
                            'loop_boundary_delta': float(abs(stereo[0]-stereo[-1]).max()),
                            'rms': float(np.sqrt(np.mean(stereo**2))), 'provenance': 'synthesized, no field recording'}
    (ROOT/'helicopter_audio.json').write_text(json.dumps(output, indent=2)+'\n')
    print(json.dumps(output, indent=2))


if __name__ == '__main__':
    build()
