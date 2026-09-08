"""Build recorded gunshots from the CC0 Free Firearm Sound Library.
Requires Python 3 + numpy. Pass the extracted 'Prepared SFX Library' directory.
Original library: https://opengameart.org/content/the-free-firearm-sound-library
Near and mid-distance recordings are layered for game playback.
No synthetic oscillators, repeated echoes or pitch shifting are added.
"""
import argparse
import json
import math
from pathlib import Path
import wave
import numpy as np

RATE = 48000
# filename, duration, high-pass Hz, output peak; LMG is an AK-47 sound-design stand-in.
RECIPES = {
    'sniper': ('Tikka/W_29P.wav', 1.50, 70, .76),
    'dmr': ('SKS/U_14P.wav', .85, 80, .72),
    'rifle': ('AR-15/D_32P.wav', .62, 80, .66),
    'lmg': ('AK-47/C_28P.wav', .65, 75, .66),
    'smg': ('Carl Gustav M45/G_31P.wav', .50, 95, .62),
    'shotgun': ('Nova/O_21P.wav', 1.0, 65, .76),
    'pistol': ('Walther PPQ/X_39P.wav', .55, 100, .66),
    'distant': ('SKS/U_19P.wav', 1.65, 160, .52),
}


# Same firearm at a second microphone distance: source, body gain, decay seconds.
# This is a designed first-person effect, not an unaltered field recording.
BODY_RECIPES = {
    'sniper': ('Tikka/W_24P.wav', .85, .115),
    'dmr': ('SKS/U_19P.wav', .70, .085),
    'rifle': ('AR-15/D_24P.wav', .75, .060),
    'lmg': ('AK-47/C_31P.wav', .75, .065),
    'smg': ('Carl Gustav M45/G_20P.wav', .65, .045),
    'shotgun': ('Nova/O_17P.wav', .90, .100),
    'pistol': ('Walther PPQ/X_31P.wav', .65, .055),
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


def load_trimmed(path, duration):
    x, rate = read_pcm(path)
    amplitude = abs(x).max(axis=1)
    onset = int(np.flatnonzero(amplitude > amplitude.max()*.12)[0])
    start = max(0, onset - int(.002*rate))
    return resample(x[start:start+int(duration*rate)], rate)


def punch_layer(library, name, direct):
    source, gain, decay = BODY_RECIPES[name]
    body = load_trimmed(library/source, .35)
    # Use the stronger microphone for a solid centre. Summing microphones with
    # different arrival times weakens parts of the attack, especially on mono speakers.
    channel = np.argmax(np.sum(body[:int(.1*RATE)]**2, axis=0))
    body = body[:, channel:channel+1]
    body = filter_biquad(body, RATE, 180)
    body = filter_biquad(body, RATE, 4200, highpass=False)
    # Align the strongest 4 ms blast window. Some mid recordings start with a
    # separate shock crack; do not introduce another delayed shot into the layer.
    window = int(.004*RATE)
    energy = np.convolve(body[:int(.12*RATE), 0]**2, np.ones(window)/window, 'valid')
    anchor = int(np.argmax(energy))
    body = body[max(0, anchor-int(.002*RATE)):]
    body /= max(abs(body).max(), 1e-12)
    # Raise the short recorded blast without lifting the long noise floor.
    t = np.arange(len(body))/RATE
    body = np.tanh(body*2.2)/np.tanh(2.2)
    body *= (np.minimum(t/.001, 1)*np.exp(-t/decay))[:, None]
    body[-int(.02*RATE):] *= np.linspace(1, 0, int(.02*RATE))[:, None]
    # Preserve the close crack before the body arrives, with no oscillating bass layer.
    delay = int(.004*RATE)
    n = min(len(body), len(direct)-delay)
    direct[delay:delay+n] += gain*body[:n]
    return direct


def master_player(library, name, x):
    channel = np.argmax(np.sum(x[:int(.1*RATE)]**2, axis=0))
    direct = x[:, channel:channel+1]
    direct = direct / max(abs(direct).max(), 1e-12)
    direct = punch_layer(library, name, direct)
    # Mild soft saturation controls isolated peaks, retaining a broadband attack.
    direct = np.tanh(direct*1.5)/np.tanh(1.5)
    stereo = np.repeat(direct, 2, axis=1)
    # Keep a quiet stereo ambience after the blast; the dry shot is mono compatible.
    t = np.arange(len(x))/RATE
    side = x-x.mean(axis=1, keepdims=True)
    stereo += .10*side*np.clip((t-.08)/.10, 0, 1)[:, None]
    return stereo


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
        x = load_trimmed(args.library/source, duration)
        x = filter_biquad(x, RATE, hz)
        if name == 'distant':
            x = filter_biquad(x, RATE, 2300, highpass=False)
            x = x.mean(axis=1, keepdims=True)
        else:
            x = master_player(args.library, name, x)
        fade_in = min(int(.0005*RATE), len(x))
        fade_out = min(int(.12*RATE), len(x))
        x[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
        x[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
        x *= peak/max(abs(x).max(), 1e-12)
        write_pcm(args.output/('shot_'+name+'.wav'), x)
        report[name] = {'source': source, 'body_source': BODY_RECIPES[name][0] if name in BODY_RECIPES else None, **stats(x)}
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
