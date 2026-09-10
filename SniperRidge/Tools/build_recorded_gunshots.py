"""Build recorded gunshots from the CC0 Free Firearm Sound Library.
Requires Python 3 + numpy. Pass the extracted 'Prepared SFX Library' directory.
Original library: https://opengameart.org/content/the-free-firearm-sound-library
Separate real shots are cropped from a single microphone channel; the original attack is retained.
No synthetic oscillators, repeated echoes or pitch shifting are added.
"""
import argparse
import json
import math
from pathlib import Path
import wave
import numpy as np

RATE = 48000
# Source files contain several individually fired shots. Each becomes a separate take.
# LMG uses a real AK-47 recording as a sound-design stand-in, not a recorded belt-fed gun.
RECIPES = {
    'sniper': ('Tikka/W_29P.wav', 1.45, 35, .82),
    'dmr': ('SKS/U_14P.wav', .80, 40, .78),
    'rifle': ('AR-15/D_32P.wav', .58, 40, .74),
    'lmg': ('AK-47/C_28P.wav', .62, 40, .74),
    'smg': ('Carl Gustav M45/G_31P.wav', .46, 45, .70),
    'shotgun': ('Nova/O_21P.wav', 1.0, 35, .82),
    'pistol': ('Walther PPQ/X_39P.wav', .55, 45, .74),
    'distant': ('AR-15/D_24P.wav', 1.10, 60, .66),
}


def read_pcm(path):
    with wave.open(str(path), 'rb') as w:
        rate, channels, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if width == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        x = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        x = ((x ^ 0x800000) - 0x800000).astype(np.float64) / 8388608
    elif width == 2:
        x = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768
    else:
        raise ValueError(f'Unsupported PCM width: {width}')
    return x.reshape(-1, channels), rate


def filter_biquad(x, rate, hz, highpass=True):
    # Butterworth, Q = 1/sqrt(2). Causal filtering preserves the sharp attack.
    w = 2 * math.pi * hz / rate
    c, alpha = math.cos(w), math.sin(w) / math.sqrt(2)
    if highpass:
        b0, b1, b2 = (1+c)/2, -(1+c), (1+c)/2
    else:
        b0, b1, b2 = (1-c)/2, 1-c, (1-c)/2
    a0, a1, a2 = 1+alpha, -2*c, 1-alpha
    b0, b1, b2, a1, a2 = [v/a0 for v in (b0, b1, b2, a1, a2)]
    y = np.zeros_like(x)
    for channel in range(x.shape[1]):
        z1 = z2 = 0.0
        for i, v in enumerate(x[:, channel]):
            out = b0*v + z1
            z1 = b1*v - a1*out + z2
            z2 = b2*v - a2*out
            y[i, channel] = out
    return y


def resample(x, rate):
    if rate == RATE:
        return x
    if rate != 96000:
        raise ValueError(f'Expected 96k or 48k source, got {rate}')
    # Anti-alias before 2:1 decimation, with delay compensated by symmetric padding.
    t = np.arange(-64, 65)
    cutoff = .225
    kernel = 2*cutoff*np.sinc(2*cutoff*t)*np.hamming(len(t))
    kernel /= kernel.sum()
    return np.column_stack([np.convolve(np.pad(x[:, c], (64, 64), mode='reflect'), kernel, 'valid')[::2]
                            for c in range(x.shape[1])])


def find_shots(x, rate):
    """Find separated shots, not individual peaks/reflections within one shot."""
    block = rate // 200
    count = len(x) // block
    rms = np.sqrt(np.mean(x[:count*block].reshape(count, block, -1)**2, axis=(1, 2)))
    hot = np.flatnonzero(rms > rms.max() * .24)
    starts, previous = [], -10000
    for index in hot:
        if (index - previous)*block/rate > .45:
            starts.append(int(index*block))
        previous = index
    assert len(starts) >= 2, 'Expected multiple real single-shot takes'
    return starts


def prepare_take(x, rate, onset, duration, hz, peak, distant=False):
    # One microphone only: preserve its original crack, blast and decay without
    # comb filtering from mixed microphones or an added saturated body layer.
    sample = x[max(0, onset-int(.01*rate)):onset+int(duration*rate)]
    channel = int(np.argmax(np.sum(sample[:int(.06*rate)]**2, axis=0)))
    sample = sample[:, channel:channel+1]
    amplitude = abs(sample[:, 0])
    attack = int(np.flatnonzero(amplitude > amplitude.max()*.10)[0])
    sample = sample[max(0, attack-int(.0015*rate)):]
    sample = resample(sample, rate)[:int(duration*RATE)]
    sample = filter_biquad(sample, RATE, hz)
    if distant:
        sample = filter_biquad(sample, RATE, 7000, highpass=False)
    # Preserve attack dynamics. Only fade the noise floor/end; no tanh/compression,
    # pitch shift, artificial bass oscillator, added explosion or repeated echoes.
    fade_in, fade_out = int(.00025*RATE), int(.12*RATE)
    sample[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    sample[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
    sample *= peak / max(abs(sample).max(), 1e-12)
    return sample if distant else np.repeat(sample, 2, axis=1)


def write_pcm(path, x):
    path.parent.mkdir(parents=True, exist_ok=True)
    assert np.isfinite(x).all() and np.max(np.abs(x)) < 1
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(x.shape[1]); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(np.round(x*32767).astype('<i2').tobytes())


def stats(x):
    mono = x.mean(axis=1)
    body = mono[int(.04*RATE):int(.35*RATE)]
    spectrum = abs(np.fft.rfft(body*np.hanning(len(body))))**2
    f = np.fft.rfftfreq(len(body), 1/RATE)
    return {'duration_seconds': round(len(x)/RATE, 3),
            'peak': round(float(abs(x).max()), 4),
            'body_energy_below_250Hz_percent': round(float(100*spectrum[f<250].sum()/max(spectrum.sum(), 1e-20)), 2),
            'clipped_samples': int((abs(x) >= 1).sum())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('library', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1]/'Assets/Resources/Audio')
    args = parser.parse_args()
    report = {}
    for name, (source, duration, hz, peak) in RECIPES.items():
        raw, rate = read_pcm(args.library/source)
        takes = []
        for index, onset in enumerate(find_shots(raw, rate)):
            x = prepare_take(raw, rate, onset, duration, hz, peak, name == 'distant')
            suffix = '' if index == 0 else f'_{index+1:02d}'
            filename = f'shot_{name}{suffix}.wav'
            write_pcm(args.output/filename, x)
            takes.append({'file': filename, 'source_onset_seconds': round(onset/rate, 3), **stats(x)})
        report[name] = {'source': source, 'takes': takes}
    manifest = args.output/'recorded_shots.json'
    manifest.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({name: len(info['takes']) for name, info in report.items()}, indent=2))


if __name__ == '__main__':
    main()
